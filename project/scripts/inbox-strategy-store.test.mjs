import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_INBOX_STRATEGY,
  createInboxStrategyStore
} from "../src/salebuddy/agents/inbox-strategy-store.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}

test("inbox strategy store returns production defaults for a new Agent", () => {
  const store = createInboxStrategyStore({ storage: memoryStorage() });
  assert.deepEqual(store.get("mkt-dm-inbox"), {
    ...DEFAULT_INBOX_STRATEGY,
    agentId: "mkt-dm-inbox"
  });
});

test("inbox strategy store persists one shared strategy per Agent", () => {
  const store = createInboxStrategyStore({ storage: memoryStorage(), now: () => "2026-09-03T08:00:00.000Z" });
  store.save("mkt-dm-inbox", {
    replyMode: "auto",
    replyObjective: "先解决问题，再确认购买计划。",
    replyTone: "简短、自然",
    replyRule: "只使用已确认的业务事实。",
    handoffRules: "价格、投诉转人工。"
  });

  assert.deepEqual(store.get("mkt-dm-inbox"), {
    agentId: "mkt-dm-inbox",
    replyMode: "auto",
    replyObjective: "先解决问题，再确认购买计划。",
    replyTone: "简短、自然",
    replyRule: "只使用已确认的业务事实。",
    handoffRules: "价格、投诉转人工。",
    updatedAt: "2026-09-03T08:00:00.000Z"
  });
});

test("inbox strategy store always normalizes legacy manual-confirm settings to automatic intake", () => {
  const store = createInboxStrategyStore({ storage: memoryStorage(), now: () => "2026-09-04T09:00:00.000Z" });

  store.save("mkt-dm-inbox", {
    replyMode: "draft",
    replyRule: "只使用已确认的业务事实。"
  });

  assert.equal(store.get("mkt-dm-inbox").replyMode, "auto");
});

test("inbox strategy store isolates strategy changes by Douyin account", () => {
  const store = createInboxStrategyStore({ storage: memoryStorage(), now: () => "2026-09-04T08:00:00.000Z" });

  assert.equal(
    store.get("mkt-dm-inbox", { accountId: "account-a" }).replyTone,
    DEFAULT_INBOX_STRATEGY.replyTone
  );

  store.save("mkt-dm-inbox", { replyTone: "亲切、简洁" }, {
    accountId: "account-a",
    accountName: "账号 A"
  });
  store.save("mkt-dm-inbox", { replyTone: "严谨、克制" }, {
    accountId: "account-b",
    accountName: "账号 B"
  });

  assert.equal(store.get("mkt-dm-inbox", { accountId: "account-a" }).replyTone, "亲切、简洁");
  assert.equal(store.get("mkt-dm-inbox", { accountId: "account-b" }).replyTone, "严谨、克制");
  assert.equal(store.get("mkt-dm-inbox", { accountId: "account-c" }).replyTone, DEFAULT_INBOX_STRATEGY.replyTone);
  assert.deepEqual(store.listAccounts("mkt-dm-inbox"), [
    { id: "account-a", name: "账号 A" },
    { id: "account-b", name: "账号 B" }
  ]);
});
