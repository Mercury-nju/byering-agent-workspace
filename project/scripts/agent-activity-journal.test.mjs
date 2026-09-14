import test from "node:test";
import assert from "node:assert/strict";
import {
  createAgentActivityJournal,
  recordAgentActivity,
  listAgentActivity
} from "../src/salebuddy/agents/agent-activity-journal.js";

function storage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}

test("agent activity journal persists, sorts, and deduplicates events", () => {
  const sharedStorage = storage();
  const first = createAgentActivityJournal({ storage: sharedStorage, now: () => "2026-08-31T10:00:00.000Z" });
  const event = { type: "activity", sequence: 12, text: "已连接抖音消息承接模块" };

  assert.equal(first.record("mkt-dm-inbox", event, { text: "有个进展：已连接抖音消息承接模块" }), true);
  assert.equal(first.record("mkt-dm-inbox", event, { text: "有个进展：已连接抖音消息承接模块" }), false);
  first.record("mkt-dm-inbox", { type: "started", sequence: 11 }, { text: "我开始处理「承接新私信」，现在先启动监听。", createdAt: "2026-08-31T09:59:00.000Z" });

  const second = createAgentActivityJournal({ storage: sharedStorage });
  const messages = second.list("mkt-dm-inbox");
  assert.equal(messages.length, 2);
  assert.deepEqual(messages.map((message) => message.text), [
    "我开始处理「承接新私信」，现在先启动监听。",
    "有个进展：已连接抖音消息承接模块"
  ]);
  assert.equal(messages[1].metadata.activityKey, "mkt-dm-inbox:12");
});

test("default journal helpers share the browser-backed journal", () => {
  const sharedStorage = storage();
  const journal = createAgentActivityJournal({ storage: sharedStorage, now: () => "2026-08-31T10:00:00.000Z" });
  journal.record("mkt-cold-writer", { type: "completed", sequence: 4, artifact: "私信发送记录" }, { text: "这一步已经完成，结果已记录。" });
  assert.equal(recordAgentActivity("mkt-cold-writer", { type: "activity", sequence: 5 }, { text: "有个进展：已保存发送结果。", journal }), true);
  assert.equal(listAgentActivity("mkt-cold-writer", { journal }).length, 2);
});

test("activity journal preserves a file artifact for an Agent conversation replay", () => {
  const journal = createAgentActivityJournal({ storage: storage(), now: () => "2026-09-14T10:00:00.000Z" });
  journal.record("mkt-intent-analyst", { type: "completed", taskId: "analysis-1", activityKey: "account-analysis-report" }, {
    text: "账号分析报告已完成，已发送到这里，并同步保存到文件中心。",
    artifact: { id: "file-analysis-1", name: "抖音账号分析报告-analysis-1.html", type: "html", status: "已完成" }
  });

  const [message] = journal.list("mkt-intent-analyst");
  assert.deepEqual(message.artifact, { id: "file-analysis-1", name: "抖音账号分析报告-analysis-1.html", type: "html", status: "已完成" });
});

test("work runs with a reset sequence remain distinct across page reloads", () => {
  const journal = createAgentActivityJournal({ storage: storage(), now: () => "2026-08-31T10:00:00.000Z" });
  const first = { type: "activity", sequence: 1, text: "第一轮", work: { startedAt: 1000 } };
  const second = { type: "activity", sequence: 1, text: "第二轮", work: { startedAt: 2000 } };
  journal.record("mkt-dm-inbox", first, { text: "第一轮" });
  journal.record("mkt-dm-inbox", second, { text: "第二轮" });
  assert.equal(journal.list("mkt-dm-inbox").length, 2);
});

test("uses agent, task, and event identity for replay-safe acquisition keys", () => {
  const journal = createAgentActivityJournal({ storage: storage() });
  const first = { type: "candidates_found", taskId: "task-a", sequence: 1, accountId: "account-a" };
  const second = { type: "candidates_found", taskId: "task-b", sequence: 1, accountId: "account-a" };
  assert.equal(journal.record("mkt-live-lead-miner", first, { text: "候选 1" }), true);
  assert.equal(journal.record("mkt-live-lead-miner", second, { text: "候选 1" }), true);
  assert.equal(journal.record("mkt-live-lead-miner", { ...first, eventId: "evt-1" }, { text: "候选 2" }), true);
  assert.equal(journal.record("mkt-live-lead-miner", { ...first, eventId: "evt-1" }, { text: "候选 2" }), false);
  const keys = journal.list("mkt-live-lead-miner").map((entry) => entry.metadata.activityKey);
  assert.ok(keys.some((key) => key.includes("task-a") && key.includes("seq:1")));
  assert.ok(keys.some((key) => key.includes("task-b") && key.includes("seq:1")));
  assert.ok(keys.some((key) => key.includes("event:evt-1")));
  assert.equal(journal.list("mkt-live-lead-miner")[0].metadata.accountId, "account-a");
});

test("keeps a volatile replay copy when browser storage rejects writes", () => {
  const journal = createAgentActivityJournal({
    storage: { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } }
  });
  assert.equal(journal.record("mkt-comment-acquisition", { type: "pause", taskId: "task-offline", sequence: 2 }, { text: "任务已暂停" }), true);
  assert.equal(journal.list("mkt-comment-acquisition").length, 1);
});

test("claims one delivery across journal instances and releases failed claims", () => {
  const sharedStorage = storage();
  const first = createAgentActivityJournal({ storage: sharedStorage });
  const second = createAgentActivityJournal({ storage: sharedStorage });

  assert.equal(first.claimDelivery("mkt-live-lead-miner:task-1:event:e1", { owner: "feed-a" }), true);
  assert.equal(second.claimDelivery("mkt-live-lead-miner:task-1:event:e1", { owner: "feed-b" }), false);
  first.releaseDelivery("mkt-live-lead-miner:task-1:event:e1", { owner: "feed-a" });
  assert.equal(second.claimDelivery("mkt-live-lead-miner:task-1:event:e1", { owner: "feed-b" }), true);
  second.completeDelivery("mkt-live-lead-miner:task-1:event:e1", { owner: "feed-b" });
  assert.equal(first.claimDelivery("mkt-live-lead-miner:task-1:event:e1", { owner: "feed-a" }), false);
});

test("allows a new owner to take over an expired delivery lease", () => {
  const sharedStorage = storage();
  const first = createAgentActivityJournal({ storage: sharedStorage });
  const second = createAgentActivityJournal({ storage: sharedStorage });
  const key = "mkt-live-lead-miner:task-expired:event:e1";
  assert.equal(first.claimDelivery(key, { owner: "feed-a", now: 1_000, leaseMs: 100 }), true);
  assert.equal(second.claimDelivery(key, { owner: "feed-b", now: 1_101, leaseMs: 100 }), true);
});

test("fails closed when delivery storage is unavailable", () => {
  const journal = createAgentActivityJournal({
    storage: {
      getItem() { throw new Error("storage blocked"); },
      setItem() { throw new Error("storage blocked"); },
      removeItem() { throw new Error("storage blocked"); }
    }
  });
  assert.equal(journal.claimDelivery("activity-storage-error", { owner: "feed-a" }), false);
  assert.equal(journal.completeDelivery("activity-storage-error", { owner: "feed-a" }), false);
  assert.equal(journal.releaseDelivery("activity-storage-error", { owner: "feed-a" }), false);
});

test("blocks reentrant delivery claims for the same storage lock key", () => {
  const values = new Map();
  let journal;
  let nestedResult = null;
  let reentered = false;
  const sharedStorage = {
    getItem(key) { return values.get(key) || null; },
    setItem(key, value) {
      if (key.includes("delivery-lock") && !reentered) {
        reentered = true;
        nestedResult = journal.claimDelivery("activity-reentrant", { owner: "feed-b" });
      }
      values.set(key, String(value));
    },
    removeItem(key) { values.delete(key); }
  };
  journal = createAgentActivityJournal({ storage: sharedStorage });
  assert.equal(journal.claimDelivery("activity-reentrant", { owner: "feed-a" }), true);
  assert.equal(nestedResult, false);
});
