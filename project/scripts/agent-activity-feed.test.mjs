import test from "node:test";
import assert from "node:assert/strict";
import { createAgentActivityFeed, formatAgentActivityMessage } from "../src/salebuddy/agents/agent-activity-feed.js";
import { createAgentActivityJournal } from "../src/salebuddy/agents/agent-activity-journal.js";
import { beginWork, endAllWork, finishWork, listWorks, pushActivity, updateWork } from "../src/salebuddy/agents/work-live.js";

test("formats human-readable lifecycle messages", () => {
  const work = { task: "筛选抖音评论潜客", phase: "连接采集服务" };
  assert.match(formatAgentActivityMessage("mkt-lead-miner", { type: "started", work }), /开始处理/);
  assert.match(formatAgentActivityMessage("mkt-lead-miner", { type: "activity", text: "已提交真实采集任务" }), /已提交真实采集任务/);
  assert.match(formatAgentActivityMessage("mkt-lead-miner", { type: "completed", artifact: "潜客意向表" }), /潜客意向表/);
  assert.match(formatAgentActivityMessage("mkt-lead-miner", { type: "error", text: "采集服务超时" }), /采集服务超时/);
  assert.match(formatAgentActivityMessage("mkt-lead-miner", { type: "updated", work: { phase: "读取评论", progress: 42 } }), /读取评论.*42%/);
});

test("queues explicitly delivered events until the gateway is ready and deduplicates each event", async () => {
  const listeners = new Set();
  const sent = [];
  const gateway = {
    action: async (action, payload) => {
      sent.push({ action, payload });
      return { accepted: true };
    }
  };
  const feed = createAgentActivityFeed({ subscribe: (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  } });
  const event = { type: "activity", sequence: 7, text: "正在读取新会话", metadata: { deliverToConversation: true } };
  listeners.forEach((listener) => listener("mkt-dm-inbox", event));
  assert.equal(sent.length, 0, "gateway 未连接时不应丢失或发送事件");
  feed.attachGateway(gateway);
  await feed.flush();
  await feed.flush();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].action, "dm.message.send");
  assert.equal(sent[0].payload.agentType, "mkt-dm-inbox");
  assert.equal(sent[0].payload.from, "mkt-dm-inbox");
  assert.match(sent[0].payload.text, /正在读取新会话/);
  listeners.forEach((listener) => listener("mkt-dm-inbox", event));
  await feed.flush();
  assert.equal(sent.length, 1, "同一序号事件只能进入一次私信");
  feed.dispose();
});

test("failed sends do not block later agent events", async () => {
  const sent = [];
  const feed = createAgentActivityFeed({ subscribe: () => () => {} });
  feed.attachGateway({
    action: async (_action, payload) => {
      sent.push(payload.text);
      if (sent.length === 1) throw new Error("offline");
      return { accepted: true };
    }
  });
  await feed.emit("mkt-dm-inbox", { type: "error", sequence: 1, text: "登录失败", metadata: { deliverToConversation: true } });
  await feed.emit("mkt-dm-inbox", { type: "activity", sequence: 2, text: "等待用户重新授权", metadata: { deliverToConversation: true } });
  assert.equal(sent.length, 2);
  assert.match(sent[1], /等待用户重新授权/);
  feed.dispose();
});

test("journals events before gateway delivery and labels the remote copy", async () => {
  const journal = createAgentActivityJournal({
    storage: {
      value: null,
      getItem() { return this.value; },
      setItem(_key, value) { this.value = value; }
    },
    now: () => "2026-08-31T10:00:00.000Z"
  });
  const sent = [];
  const feed = createAgentActivityFeed({ subscribe: () => () => {}, journal });
  const event = { type: "activity", sequence: 18, text: "正在读取新会话", metadata: { deliverToConversation: true } };

  await feed.emit("mkt-dm-inbox", event);
  assert.equal(journal.list("mkt-dm-inbox").length, 1);
  feed.attachGateway({ action: async (_action, payload) => { sent.push(payload); return { accepted: true }; } });
  await feed.emit("mkt-dm-inbox", event);
  assert.equal(sent[0].metadata.activityKey, "mkt-dm-inbox:18");
  assert.equal(sent[0].metadata.source, "agent-activity");
  feed.dispose();
});

test("does not flood the Agent DM with identical polling updates", async () => {
  const sent = [];
  const feed = createAgentActivityFeed({ subscribe: () => () => {} });
  feed.attachGateway({ action: async (_action, payload) => { sent.push(payload); return { accepted: true }; } });
  await feed.emit("mkt-dm-inbox", { type: "updated", sequence: 20, work: { phase: "持续监听新私信", metadata: { progressMode: "indeterminate" } }, metadata: { deliverToConversation: true } });
  await feed.emit("mkt-dm-inbox", { type: "updated", sequence: 21, work: { phase: "持续监听新私信", metadata: { progressMode: "indeterminate" } }, metadata: { deliverToConversation: true } });
  assert.equal(sent.length, 1);
  feed.dispose();
});

test("journals real work-live lifecycle events without sending them into the Agent conversation", async () => {
  const sent = [];
  const feed = createAgentActivityFeed();
  feed.attachGateway({ action: async (_action, payload) => { sent.push(payload); return { accepted: true }; } });
  beginWork("mkt-dm-inbox", { task: "承接新私信", phase: "启动监听" });
  pushActivity("mkt-dm-inbox", "已连接消息承接模块");
  finishWork("mkt-dm-inbox", "私信承接记录");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(sent.length, 0);
  endAllWork();
  feed.dispose();
});

test("shares live work progress and metadata with the realtime surface", () => {
  beginWork("mkt-lead-miner", { task: "筛选公开评论", phase: "连接采集服务", progress: 12, metadata: { taskId: "run-1" } });
  updateWork("mkt-lead-miner", { progress: 72, phase: "等待采集服务回传" });
  const [work] = listWorks().filter((item) => item.agentType === "mkt-lead-miner");
  assert.equal(work.progress, 72);
  assert.equal(work.phase, "等待采集服务回传");
  assert.equal(work.metadata.taskId, "run-1");
  endAllWork();
});

test("formats acquisition events without inventing delivery progress", () => {
  assert.match(formatAgentActivityMessage("mkt-comment-acquisition", { type: "access.authorization.requested" }), /连上.*抖音账号/);
  assert.match(formatAgentActivityMessage("mkt-live-lead-miner", { type: "scan_window", count: 3 }), /3/);
  assert.match(formatAgentActivityMessage("mkt-comment-acquisition", { type: "touch_drafted" }), /发送规则/);
  assert.match(formatAgentActivityMessage("mkt-comment-acquisition", { type: "touch_receipt", state: "unknown" }), /还没确认/);
  assert.doesNotMatch(formatAgentActivityMessage("mkt-comment-acquisition", { type: "touch_receipt", state: "accepted" }), /发出去了|已送达/);
  assert.match(formatAgentActivityMessage("mkt-comment-acquisition", { type: "touch_receipt", state: "failed", error: { code: "RATE_LIMIT" } }), /失败/);
});

test("replays a failed acquisition delivery after the gateway recovers", async () => {
  const journal = createAgentActivityJournal({ storage: new MapStorage() });
  let online = false;
  const sent = [];
  const feed = createAgentActivityFeed({ subscribe: () => () => {}, journal });
  feed.attachGateway({ action: async (_action, payload) => {
    if (!online) throw new Error("offline");
    sent.push(payload);
    return { accepted: true };
  } });
  await feed.emit("mkt-live-lead-miner", { type: "candidates_found", taskId: "task-7", sequence: 4, count: 2, metadata: { deliverToConversation: true } });
  assert.equal(sent.length, 0);
  online = true;
  await feed.flush();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].taskId, "task-7");
  feed.dispose();
});

test("mirrors canonical AG-UI acquisition events when the gateway emits them", async () => {
  const listeners = new Set();
  const sent = [];
  const feed = createAgentActivityFeed({ subscribe: () => () => {}, deliverToConversation: true });
  feed.attachGateway({
    on(_name, listener) { listeners.add(listener); return () => listeners.delete(listener); },
    action: async (_action, payload) => { sent.push(payload); return { accepted: true }; }
  });
  listeners.forEach((listener) => listener({ type: "OUTREACH_SENT", agentId: "mkt-comment-acquisition", taskId: "task-8", seq: 2, state: "delivered" }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(sent.length, 1);
  assert.match(sent[0].text, /发出去了/);
  feed.dispose();
});

test("shares a delivery claim across feed instances and retries after failure", async () => {
  const journal = createAgentActivityJournal({ storage: new MapStorage() });
  const sent = [];
  let fail = true;
  const gateway = { action: async (_action, payload) => {
    sent.push(payload);
    if (fail) throw new Error("offline");
    return { accepted: true };
  } };
  const first = createAgentActivityFeed({ subscribe: () => () => {}, journal, deliverToConversation: true });
  const second = createAgentActivityFeed({ subscribe: () => () => {}, journal, deliverToConversation: true });
  const event = { type: "activity", taskId: "task-shared", eventId: "event-shared", text: "同一条活动" };

  first.attachGateway(gateway);
  second.attachGateway(gateway);
  await Promise.all([first.emit("mkt-live-lead-miner", event), second.emit("mkt-live-lead-miner", event)]);
  assert.equal(sent.length, 1, "并发 feed 只能有一个真实发送者");

  fail = false;
  await second.emit("mkt-live-lead-miner", event);
  assert.equal(sent.length, 2, "失败释放 claim 后，重复事件应可重试");
  await first.emit("mkt-live-lead-miner", event);
  assert.equal(sent.length, 2, "成功发送后应持久化 sent 状态");
  first.dispose();
  second.dispose();
});

test("forwards the complete work context to the Agent conversation", async () => {
  const sent = [];
  const feed = createAgentActivityFeed({ subscribe: () => () => {}, deliverToConversation: true });
  feed.attachGateway({ action: async (_action, payload) => { sent.push(payload); return { accepted: true }; } });
  await feed.emit("mkt-live-lead-miner", {
    type: "activity", taskId: "task-context", taskRunId: "run-context", conversationId: "conversation-context",
    accountId: "account-context", eventId: "event-context", sequence: 9, text: "上下文完整"
  });
  assert.deepEqual(
    Object.fromEntries(["taskId", "taskRunId", "conversationId", "accountId", "eventId", "sequence"].map((key) => [key, sent[0][key]])),
    { taskId: "task-context", taskRunId: "run-context", conversationId: "conversation-context", accountId: "account-context", eventId: "event-context", sequence: 9 }
  );
  assert.deepEqual(
    Object.fromEntries(["taskId", "taskRunId", "conversationId", "accountId", "eventId", "sequence"].map((key) => [key, sent[0].metadata[key]])),
    { taskId: "task-context", taskRunId: "run-context", conversationId: "conversation-context", accountId: "account-context", eventId: "event-context", sequence: 9 }
  );
  feed.dispose();
});

test("forwards snake-case canonical AG-UI context without dropping identity", async () => {
  const listeners = new Set();
  const sent = [];
  const feed = createAgentActivityFeed({ subscribe: () => () => {}, deliverToConversation: true });
  feed.attachGateway({
    on(_name, listener) { listeners.add(listener); return () => listeners.delete(listener); },
    action: async (_action, payload) => { sent.push(payload); return { accepted: true }; }
  });
  listeners.forEach((listener) => listener({
    type: "OUTREACH_SENT",
    agent_id: "mkt-comment-acquisition",
    task_id: "task-snake",
    task_run_id: "run-snake",
    conversation_id: "conversation-snake",
    account_id: "account-snake",
    event_id: "event-snake",
    seq: 11,
    state: "unknown"
  }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(sent.length, 1);
  assert.deepEqual(
    Object.fromEntries(["taskId", "taskRunId", "conversationId", "accountId", "eventId", "sequence"].map((key) => [key, sent[0][key]])),
    { taskId: "task-snake", taskRunId: "run-snake", conversationId: "conversation-snake", accountId: "account-snake", eventId: "event-snake", sequence: 11 }
  );
  assert.deepEqual(
    Object.fromEntries(["taskId", "taskRunId", "conversationId", "accountId", "eventId", "sequence"].map((key) => [key, sent[0].metadata[key]])),
    { taskId: "task-snake", taskRunId: "run-snake", conversationId: "conversation-snake", accountId: "account-snake", eventId: "event-snake", sequence: 11 }
  );
  feed.dispose();
});

class MapStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) || null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}
