import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createControlPlaneHttpServer } from "../backend/http-server.js";
import { createAgentStore } from "./agent-store.mjs";

test("chat reply, explicit remembering, settings, tenant isolation and actual execution input form one flow", async t => {
  const root = mkdtempSync(join(tmpdir(), "companion-http-"));
  const inputs = [];
  const agentStore = createAgentStore(root, { seedMessages: false });
  const server = createControlPlaneHttpServer({ agentStore,
    auth: { authenticate: request => ({ tenantId: request.headers["x-test-tenant"] || "a" }) },
    companionGenerator: async () => ({ text: "好，同样合适时先看最近常更新的人。", memories: [{ key: "ranking", text: "同样合适时，先看最近常更新的人", value: "active", evidence: "先看最近常更新的", subject: "user", basis: "stated", temporal: "stable" }] }),
    douyinFinderService: { configured: true, run: async input => { inputs.push(input); return { status: "SUCCEEDED", counts: { matched: 1 } }; } } });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }); rmSync(root, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(path, method = "GET", body, tenant = "a") {
    const response = await fetch(base + path, { method, headers: { "content-type": "application/json", "x-test-tenant": tenant }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: await response.json() };
  }
  const id = "mkt-douyin-finder", settings = `/v1/agents/companion?agentId=${id}`;
  assert.equal((await request("/v1/direct-messages?agentType=..", "GET")).status, 400);
  assert.equal((await request("/v1/direct-messages?agentType=x%3A%3Amkt-douyin-finder", "GET")).status, 400);
  const sent = await request("/v1/direct-messages", "POST", { agentType: id, text: "以后同样合适的话先看最近常更新的", from: "user", clientMessageId: "one" });
  assert.equal(sent.status, 201);
  assert.deepEqual({
    source: sent.data.data.message.metadata.source,
    conversationRole: sent.data.data.message.metadata.conversationRole,
    canCreateTeamTask: sent.data.data.message.metadata.canCreateTeamTask,
    requiresChiefForNewTask: sent.data.data.message.metadata.requiresChiefForNewTask
  }, {
    source: "member-conversation",
    conversationRole: "specialist-executor",
    canCreateTeamTask: false,
    requiresChiefForNewTask: true
  });
  assert.equal(sent.data.data.message.metadata.companionReply.phase, "thinking");
  const suppressedMessage = await request("/v1/direct-messages", "POST", {
    agentType: id,
    conversationId: "chief-of-staff",
    text: "开始处理这个目标",
    from: "user",
    metadata: { suppressAutoReply: true }
  });
  assert.equal(suppressedMessage.status, 201);
  assert.equal(suppressedMessage.data.data.message.metadata.companionReply, undefined);
  const replay = await request("/v1/direct-messages", "POST", { agentType: id, text: "same", from: "user", clientMessageId: "one" });
  assert.equal(replay.data.data.message.id, sent.data.data.message.id);
  let messages;
  for (let i = 0; i < 20; i++) {
    messages = (await request(`/v1/direct-messages?agentType=${id}`)).data.data.messages;
    if (messages.some(message => message.metadata?.companion?.memoryUpdate)) break;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  const answer = messages.find(message => message.metadata?.companion?.memoryUpdate);
  assert.ok(answer); assert.equal((await request(settings)).data.memories.length, 1);
  const action = { agentId: id, messageId: answer.id, optionId: "undo-memory" };
  assert.equal((await request("/v1/direct-messages/action", "POST", action, "b")).status, 404);
  assert.equal((await request(settings)).data.settings.ranking, "active");
  assert.equal((await request(settings, "GET", undefined, "b")).data.memories.length, 0);
  await request("/v1/connectors/douyin-finder/run", "POST", { agentId: id, taskId: "preference-run", goal: "only verified", companionPreferences: { settings: { ranking: "malicious" }, skipSafety: true } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(inputs[0].companionPreferences.settings.ranking, "active");
  assert.equal(inputs[0].goal, "only verified"); assert.equal(inputs[0].companionPreferences.skipSafety, undefined);
  assert.equal((await request("/v1/direct-messages/action", "POST", action)).status, 200);
  assert.equal((await request(settings)).data.memories.length, 0);
  assert.equal((await request("/v1/direct-messages", "DELETE", { agentType: id })).status, 400);
  const deletedConversation = await request("/v1/direct-messages", "DELETE", {
    agentType: id,
    conversationId: "chief-of-staff"
  });
  assert.equal(deletedConversation.status, 200);
  assert.equal(deletedConversation.data.data.deleted, 1);
  assert.equal((await request(`/v1/direct-messages?agentType=${id}&conversationId=chief-of-staff`)).data.data.messages.length, 0);
});

test("a specialist conversation reads its current control-plane handoff without storing task facts as memory", async t => {
  const root = mkdtempSync(join(tmpdir(), "companion-task-facts-http-"));
  const agentStore = createAgentStore(root, { seedMessages: false });
  let modelInput = null;
  const controlPlane = {
    getTaskSnapshot(taskId) {
      if (taskId !== "task-handoff") throw new Error("not found");
      return {
        taskId,
        taskRunId: "parent-run",
        tenantId: "a",
        goal: "筛出新能源车的潜在客户",
        state: "RUNNING",
        resultSnapshot: { count: 2 },
        assignment: {
          execution: {
            steps: [
              {
                id: "step-find",
                agentId: "mkt-find-people",
                agentName: "找客专员",
                taskRunId: "parent-run:find",
                dependsOn: [],
                status: "COMPLETED",
                handoff: {
                  from: { agentId: "mkt-find-people", stepId: "step-find", taskRunId: "parent-run:find" },
                  outputs: { qualifiedLeads: [{ id: "lead-1", content: "想看分期方案" }] }
                }
              },
              {
                id: "step-analyze",
                agentId: "mkt-intent-analyst",
                agentName: "客户分析员",
                taskRunId: "parent-run:analyze",
                dependsOn: ["mkt-find-people"],
                status: "RUNNING"
              }
            ]
          }
        }
      };
    }
  };
  const server = createControlPlaneHttpServer({
    controlPlane,
    agentStore,
    auth: { authenticate: request => ({ tenantId: request.headers["x-test-tenant"] || "a" }) },
    companionGenerator: async input => {
      modelInput = input;
      return { text: "我会先按找客专员交来的候选人做判断，再把依据补齐。" };
    }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    rmSync(root, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (path, method = "GET", body) => {
    const response = await fetch(base + path, {
      method,
      headers: { "content-type": "application/json", "x-test-tenant": "a" },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    return { status: response.status, data: await response.json() };
  };

  const posted = await request("/v1/direct-messages", "POST", {
    agentType: "mkt-intent-analyst",
    from: "user",
    text: "这批人先怎么判断？",
    taskId: "task-handoff",
    taskRunId: "parent-run:analyze"
  });
  assert.equal(posted.status, 201);
  for (let attempt = 0; attempt < 20 && !modelInput; attempt += 1) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(modelInput.taskFacts.taskId, "task-handoff");
  assert.equal(modelInput.taskFacts.stage.stepId, "step-analyze");
  assert.equal(modelInput.taskFacts.incomingHandoffs[0].from.agentId, "mkt-find-people");
  assert.equal(modelInput.taskFacts.incomingHandoffs[0].outputs.qualifiedLeads[0].id, "lead-1");
  const preferences = await request("/v1/agents/companion?agentId=mkt-intent-analyst");
  assert.equal(preferences.data.memories.length, 0);
});
