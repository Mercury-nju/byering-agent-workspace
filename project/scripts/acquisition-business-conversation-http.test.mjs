import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createControlPlaneHttpServer } from "../backend/http-server.js";
import { createAgentStore } from "./agent-store.mjs";

const NOW = Date.parse("2026-09-16T12:00:00+08:00");
const YESTERDAY = "2026-09-15T10:00:00+08:00";

function context() {
  return {
    agentId: "mkt-comment-acquisition",
    taskId: "task-business-1",
    taskRunId: "run-business-1",
    conversationId: "conversation-business-1",
    accountId: "account-business-1"
  };
}

function event(eventId, type, payload = {}) {
  return {
    eventId,
    type,
    occurredAt: YESTERDAY,
    ...context(),
    payload
  };
}

function fakeAcquisition() {
  const calls = [];
  const task = {
    key: "mkt-comment-acquisition::task-business-1::account-business-1",
    context: context(),
    config: {
      sourceScope: { kind: "authorized_account_all_signals" },
      approvalMode: "auto",
      caps: { dailyMax: 4, sendIntervalMs: 0 },
      contentPolicy: { strategy: "回应原始问题", replyStyle: "专业简短自然" }
    },
    configuration: {
      version: 1,
      findingStrategy: { sourceScope: "authorized_account_all_signals" },
      touchContent: { strategy: "回应原始问题", replyStyle: "专业简短自然", approvalMode: "auto" },
      frequency: { maxTouchesPerDay: 4, minIntervalMinutes: 0 }
    },
    configurationVersion: 1,
    configVersion: 1,
    state: "running",
    eventSeq: 4,
    events: [
      event("candidate-1", "candidates_found", { candidate: { id: "lead-1", nickname: "用户一", intent: { tier: "high", score: 92 } } }),
      event("candidate-2", "candidates_found", { candidate: { id: "lead-2", nickname: "用户二", intent: { tier: "medium", score: 78 } } }),
      event("candidate-3", "candidates_found", { candidate: { id: "lead-3", nickname: "用户三", intent: { tier: "low", score: 22 } } }),
      event("intent-1", "intent_decision", { candidate: { id: "lead-1", intent: { tier: "high", score: 92 } } }),
      event("intent-2", "intent_decision", { candidate: { id: "lead-2", intent: { tier: "medium", score: 78 } } }),
      event("touch-1", "touch_receipt", { touchId: "touch-1", state: "delivered", candidateKey: "lead-1" }),
      event("reply-1", "reply_received", { message: { id: "reply-1", content: "想了解价格" }, candidateKey: "lead-1" })
    ]
  };
  return {
    calls,
    listTasks() { return [task]; },
    status(key) { assert.equal(key, task.key); return task; },
    updateTaskConfig(key, payload) {
      calls.push({ key, payload });
      task.eventSeq += 1;
      task.configurationVersion = payload.configVersion;
      task.configVersion = payload.configVersion;
      task.configuration = { ...task.configuration, ...payload.changes, version: payload.configVersion };
      return structuredClone(task);
    }
  };
}

test("acquisition DM answers from real task events and applies confirmed strategy to the task", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "byering-acquisition-business-dm-"));
  const agentStore = createAgentStore(root, { seedMessages: false });
  const acquisition = fakeAcquisition();
  const server = createControlPlaneHttpServer({
    agentStore,
    douyinAcquisitionService: acquisition,
    now: () => NOW,
    companionGenerator: async () => { throw new Error("business flow must not fall back to a generic reply"); }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
    await rm(root, { recursive: true, force: true });
  });

  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(body) {
    const response = await fetch(`${base}/v1/direct-messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...context(), agentType: context().agentId, from: "user", fromName: "我", ...body })
    });
    return { status: response.status, data: await response.json() };
  }
  async function messages() {
    const response = await fetch(`${base}/v1/direct-messages?agentType=${context().agentId}&accountId=${context().accountId}&conversationId=${context().conversationId}`);
    return (await response.json()).data.messages;
  }

  const metrics = await request({ text: "昨天得到了几条线索？昨天的触达率怎么样？" });
  assert.equal(metrics.status, 201);
  const metricReply = (await messages()).find((message) => message.metadata?.source === "acquisition-business-conversation");
  assert.match(metricReply.text, /3 位线索/);
  assert.match(metricReply.text, /触达率为 50%/);
  assert.deepEqual({
    candidates: metricReply.metadata.acquisitionBusinessMetrics.candidates,
    qualified: metricReply.metadata.acquisitionBusinessMetrics.qualified,
    sent: metricReply.metadata.acquisitionBusinessMetrics.sent,
    replies: metricReply.metadata.acquisitionBusinessMetrics.replies,
    failed: metricReply.metadata.acquisitionBusinessMetrics.failed,
    touchRate: metricReply.metadata.acquisitionBusinessMetrics.touchRate,
    replyRate: metricReply.metadata.acquisitionBusinessMetrics.replyRate
  }, {
    candidates: 3,
    qualified: 2,
    sent: 1,
    replies: 1,
    failed: 0,
    touchRate: "50%",
    replyRate: "100%"
  });
  assert.equal(metricReply.metadata.acquisitionBusinessMetrics.date, "2026-09-15");
  assert.equal(metricReply.metadata.acquisitionBusinessMetrics.eventCount, 7);

  await request({ text: "这个数据表现怎么样可以变得更好？" });
  const proposal = (await messages()).find((message) => message.metadata?.acquisitionBusinessProposal?.status === "pending");
  assert.ok(proposal);
  assert.equal(proposal.metadata.acquisitionBusinessProposal.baseConfigVersion, 1);
  assert.equal(proposal.metadata.acquisitionBusinessProposal.expectedVersion, 4);
  assert.ok(proposal.metadata.acquisitionBusinessProposal.changes.touchContent);

  await request({ text: "ok，我觉得可以，就这样调整" });
  assert.equal(acquisition.calls.length, 1);
  assert.equal(acquisition.calls[0].key, acquisition.listTasks()[0].key);
  assert.equal(acquisition.calls[0].payload.baseConfigVersion, 1);
  assert.equal(acquisition.calls[0].payload.configVersion, 2);
  assert.equal(acquisition.calls[0].payload.expectedVersion, 4);
  assert.equal(acquisition.calls[0].payload.effectiveScope, "future_only");
  const applied = (await messages()).find((message) => message.metadata?.acquisitionBusinessProposal?.status === "applied");
  assert.ok(applied);
  assert.match(applied.text, /已按确认更新获客策略/);
});
