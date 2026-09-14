import test from "node:test";
import assert from "node:assert/strict";
import { createDouyinCloudTaskStore, isDouyinCloudReadyStatus } from "../src/salebuddy/agents/douyin-cloud-state.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}

test("cloud task store preserves an Agent's resumable authorization state", () => {
  const store = createDouyinCloudTaskStore({ storage: memoryStorage() });
  const saved = store.save("mkt-dm-inbox", {
    phase: "provisioning",
    startedAt: "2026-08-31T06:00:00.000Z",
    resumeFlow: { replyMode: "draft", replyRule: "先回答问题" },
    waitingMessageSent: true
  });

  assert.equal(saved.agentId, "mkt-dm-inbox");
  assert.equal(saved.phase, "provisioning");
  assert.equal(store.get("mkt-dm-inbox").resumeFlow.replyMode, "draft");
  assert.equal(store.get("mkt-dm-inbox").waitingMessageSent, true);
});

test("cloud task store updates and clears one Agent without affecting another", () => {
  const store = createDouyinCloudTaskStore({ storage: memoryStorage() });
  store.save("mkt-dm-inbox", { phase: "provisioning" });
  store.save("mkt-cold-writer", { phase: "ready" });

  const updated = store.update("mkt-dm-inbox", { phase: "ready", readyMessageSent: true });
  assert.equal(updated.phase, "ready");
  assert.equal(store.get("mkt-cold-writer").phase, "ready");
  store.clear("mkt-dm-inbox");
  assert.equal(store.get("mkt-dm-inbox"), null);
  assert.equal(store.get("mkt-cold-writer").phase, "ready");
});

test("cloud task store keeps the same Agent isolated across Douyin accounts", () => {
  const store = createDouyinCloudTaskStore({ storage: memoryStorage() });

  store.saveFor("mkt-find-people", { accountKey: "douyin-a" }, {
    phase: "running",
    resumeFlow: { accountId: "douyin-a", goal: "找上海用户" }
  });
  store.saveFor("mkt-find-people", { accountKey: "douyin-b" }, {
    phase: "ready",
    resumeFlow: { accountId: "douyin-b", goal: "找杭州用户" }
  });

  assert.equal(store.getFor("mkt-find-people", { accountKey: "douyin-a" }).resumeFlow.goal, "找上海用户");
  assert.equal(store.getFor("mkt-find-people", { accountKey: "douyin-b" }).resumeFlow.goal, "找杭州用户");
  assert.equal(store.listForAgent("mkt-find-people").length, 2);

  store.update("mkt-find-people", { phase: "paused" });
  assert.equal(store.getFor("mkt-find-people", { accountKey: "douyin-b" }).phase, "paused");
  assert.equal(store.getFor("mkt-find-people", { accountKey: "douyin-a" }).phase, "running");
});

test("cloud status never reports ready while the worker is offline", () => {
  assert.equal(isDouyinCloudReadyStatus({ login_state: "logged_in", worker: { online: false } }), false);
  assert.equal(isDouyinCloudReadyStatus({ login_state: "logged_in", worker: { online: true } }), true);
});
