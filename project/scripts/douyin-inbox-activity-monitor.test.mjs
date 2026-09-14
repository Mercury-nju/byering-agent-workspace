import test from "node:test";
import assert from "node:assert/strict";
import { createDouyinCloudTaskStore } from "../src/salebuddy/agents/douyin-cloud-state.js";
import { createDouyinInboxActivityMonitor, formatDouyinInboxEvent } from "../src/salebuddy/agents/douyin-inbox-activity-monitor.js";
import { createAgentActivityJournal } from "../src/salebuddy/agents/agent-activity-journal.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}

test("formats inbox policy handoff without presenting manual confirmation as a reply mode", () => {
  assert.match(formatDouyinInboxEvent({ type: "message.received", message: { nickname: "小王" } }), /小王/);
  const handoff = formatDouyinInboxEvent({ type: "reply.drafted" });
  assert.match(handoff, /人工接管边界/);
  assert.doesNotMatch(handoff, /等你确认后发送/);
  assert.match(formatDouyinInboxEvent({ type: "poll.error", error: { message: "连接超时" } }), /连接超时/);
  assert.equal(formatDouyinInboxEvent({ type: "poll.completed", count: 0 }), null);
});

test("resumes background inbox events and deduplicates them in work history", async () => {
  const taskStore = createDouyinCloudTaskStore({ storage: memoryStorage() });
  taskStore.save("mkt-dm-inbox", { phase: "running", inboxActivityInitialized: false, inboxStartedAt: "2026-08-31T07:00:00.000Z" });
  const journal = createAgentActivityJournal({ storage: memoryStorage() });
  let events = [
    { type: "agent.started", at: "2026-08-31T07:00:00.000Z" },
    { type: "message.received", messageId: "m-1", at: "2026-08-31T07:00:01.000Z", message: { nickname: "小王" } }
  ];
  const sent = [];
  const monitor = createDouyinInboxActivityMonitor({
    taskStore,
    fetchImpl: async () => ({ ok: true, async json() { return { runtime: { running: true }, events }; } }),
    journal,
    gateway: { action: async (_action, payload) => { sent.push(payload); return { accepted: true }; } }
  });

  await monitor.sync();
  assert.equal(sent.length, 0, "后台状态不应自动发送成私信");
  assert.equal(journal.list("mkt-dm-inbox").length, 3, "首次接管也要留下已有事件历史");
  events = [...events, { type: "reply.drafted", messageId: "m-1", at: "2026-08-31T07:00:02.000Z" }];
  await monitor.sync();
  await monitor.sync();
  assert.equal(sent.length, 0);
  assert.equal(taskStore.get("mkt-dm-inbox").inboxActivityKeys.length, 3);
  assert.equal(journal.list("mkt-dm-inbox").length, 4);
  monitor.dispose();
});

test("keeps inbox runtime history when the conversation gateway is unavailable", async () => {
  const taskStore = createDouyinCloudTaskStore({ storage: memoryStorage() });
  taskStore.save("mkt-dm-inbox", { phase: "running", inboxActivityInitialized: false, inboxStartedAt: "2026-08-31T07:00:00.000Z" });
  const journal = createAgentActivityJournal({ storage: memoryStorage() });
  const monitor = createDouyinInboxActivityMonitor({
    taskStore,
    journal,
    gateway: null,
    fetchImpl: async () => ({ ok: true, async json() {
      return { runtime: { running: true }, events: [{ type: "message.received", messageId: "m-2", at: "2026-08-31T07:00:01.000Z", message: { nickname: "小李" } }] };
    } })
  });
  await monitor.sync();
  assert.equal(journal.list("mkt-dm-inbox").length, 2);
  assert.equal(taskStore.get("mkt-dm-inbox").inboxActivityInitialized, true);
  monitor.dispose();
});
