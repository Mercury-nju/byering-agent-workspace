import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createDouyinAcquisitionService } from "../backend/douyin-acquisition-service.js";
import { createControlPlaneHttpServer } from "../backend/http-server.js";
import { createAgentStore } from "./agent-store.mjs";

const NOW = "2026-09-16T12:00:00.000+08:00";
const CONTEXT = {
  agentId: "mkt-comment-acquisition",
  taskId: "real-task-1",
  taskRunId: "real-run-1",
  conversationId: "real-conversation-1",
  accountId: "real-account-1"
};

function cloudRegistry() {
  const service = {
    async startLivePolling() { return { ok: true, state: "running" }; },
    async pullLiveMessages() { return { ok: true, messages: [] }; },
    async sendPrivateMessage() { return { ok: true, state: "delivered", message_id: "unused" }; }
  };
  return {
    async status() { return { ok: true, state: "ONLINE", login_state: "logged_in", session_id: "session-real" }; },
    getService() { return service; }
  };
}

test("business conversation reads and updates the real durable acquisition service", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "byering-real-acquisition-business-"));
  const stateFile = join(root, "acquisition.json");
  let clock = "2026-09-15T12:00:00.000+08:00";
  const service = createDouyinAcquisitionService({
    stateFile,
    autoResume: false,
    now: () => clock,
    cloudRegistry: cloudRegistry(),
    accountResolver: {
      configured: true,
      async resolve() { return { uid: CONTEXT.accountId, secId: "real-sec-account", nickname: "真实门店账号" }; }
    },
    interactionSource: {
      async scan() {
        return {
          leads: [{
            id: "real-lead-1",
            nickname: "真实用户",
            tier: "low",
            score: 20,
            text: "刚刚看到视频"
          }],
          profiles: {},
          nextCursor: 1,
          snapshot: {
            source: "test_authorized_account_listener",
            sources: {
              notifications: { state: "listening", count: 1 },
              live: { state: "listening", count: 0 }
            },
            counts: { candidates: 1 }
          }
        };
      }
    }
  });
  const task = await service.createTask(CONTEXT, {
    sourceScope: { kind: "authorized_account_all_signals" },
    audienceRules: { goal: "找出有购车意向的用户", minScore: 0 },
    touchChannel: "private_message",
    approvalMode: "auto",
    contentPolicy: {
      template: "旧触达模板",
      strategy: "旧触达策略",
      replyStyle: "旧回复风格"
    },
    caps: { dailyMax: 30, sendIntervalMs: 0, cooldownMs: 0 }
  });
  await service.start(task.key, { runImmediately: false });
  await service.runOnce(task.key);
  assert.ok(service.status(task.key).events.some((event) => event.type === "candidates_found"));
  assert.ok(service.status(task.key).events.some((event) => event.type === "intent_decision"));
  clock = NOW;

  const server = createControlPlaneHttpServer({
    auth: false,
    agentStore: createAgentStore(root, { seedMessages: false }),
    douyinAcquisitionService: service,
    now: () => Date.parse(NOW),
    companionGenerator: async () => { throw new Error("real business path must not use generic companion fallback"); }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
    service.close();
    await rm(root, { recursive: true, force: true });
  });

  const base = `http://127.0.0.1:${server.address().port}`;
  async function send(text) {
    const response = await fetch(`${base}/v1/direct-messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...CONTEXT, agentType: CONTEXT.agentId, from: "user", fromName: "我", text })
    });
    assert.equal(response.status, 201);
  }
  async function readMessages() {
    const response = await fetch(`${base}/v1/direct-messages?agentType=${CONTEXT.agentId}&accountId=${CONTEXT.accountId}&conversationId=${CONTEXT.conversationId}`);
    return (await response.json()).data.messages;
  }

  await send("昨天得到了几条线索？昨天的触达率怎么样？");
  const metricsReply = (await readMessages()).find((message) => message.metadata?.acquisitionBusinessMetrics);
  assert.match(metricsReply.text, /昨天（2026-09-15）真实门店账号共发现 1 位线索/);
  assert.equal(metricsReply.metadata.acquisitionBusinessMetrics.candidates, 1);
  assert.equal(metricsReply.metadata.acquisitionBusinessMetrics.qualified, 0);

  await send("这个数据表现怎么样可以变得更好？");
  await send("ok，我觉得可以，就这样调整");
  const current = service.status(task.key);
  assert.equal(current.configurationVersion, 2);
  assert.equal(current.configuration.touchContent.replyStyle, "先回应用户原始问题，再只推进一个明确下一步；表达简短、具体、自然。");
  assert.equal(current.configuration.touchContent.handoffBoundary, "涉及最终报价、库存、优惠承诺、投诉和到店安排时交给人工确认。");
  assert.ok((await readMessages()).some((message) => message.metadata?.acquisitionBusinessProposal?.status === "applied"));

  service.close();
  const restored = createDouyinAcquisitionService({
    stateFile,
    autoResume: false,
    now: () => NOW,
    cloudRegistry: cloudRegistry(),
    accountResolver: { configured: true, async resolve() { return { uid: CONTEXT.accountId }; } },
    interactionSource: { async scan() { return { leads: [], profiles: {}, nextCursor: 1, snapshot: {} }; } }
  });
  t.after(() => restored.close());
  assert.equal(restored.status(task.key).configurationVersion, 2);
  assert.equal(restored.status(task.key).configVersion, 2);
  assert.equal(restored.status(task.key).config.contentPolicy.replyStyle, "先回应用户原始问题，再只推进一个明确下一步；表达简短、具体、自然。");
});
