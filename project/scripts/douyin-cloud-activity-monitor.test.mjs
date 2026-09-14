import test from "node:test";
import assert from "node:assert/strict";
import { createDouyinCloudTaskStore } from "../src/salebuddy/agents/douyin-cloud-state.js";
import { createDouyinCloudActivityMonitor } from "../src/salebuddy/agents/douyin-cloud-activity-monitor.js";
import { createAgentActivityJournal } from "../src/salebuddy/agents/agent-activity-journal.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}

test("records one ready activity for a provisioning Agent cloud desktop without a DM", async () => {
  const taskStore = createDouyinCloudTaskStore({ storage: memoryStorage() });
  taskStore.save("mkt-dm-inbox", { phase: "provisioning", startedAt: "2026-08-31T07:00:00.000Z" });
  const journal = createAgentActivityJournal({ storage: memoryStorage(), now: () => "2026-08-31T07:01:00.000Z" });
  const sent = [];
  const monitor = createDouyinCloudActivityMonitor({
    taskStore,
    agentIds: ["mkt-dm-inbox"],
    fetchImpl: async () => ({ ok: true, async json() { return { login_state: "logged_out", worker: { online: true } }; } }),
    journal,
    gateway: { action: async (_action, payload) => { sent.push(payload); return { accepted: true }; } }
  });
  await monitor.sync();
  await monitor.sync();
  assert.equal(sent.length, 0);
  assert.equal(taskStore.get("mkt-dm-inbox").phase, "ready");
  assert.equal(journal.list("mkt-dm-inbox").length, 1);
  assert.equal(taskStore.get("mkt-dm-inbox").readyMessageSent, true);
  monitor.dispose();
});

test("records one actionable cloud error without sending a DM", async () => {
  const taskStore = createDouyinCloudTaskStore({ storage: memoryStorage() });
  taskStore.save("mkt-cold-writer", { phase: "provisioning" });
  const journal = createAgentActivityJournal({ storage: memoryStorage() });
  const sent = [];
  const monitor = createDouyinCloudActivityMonitor({
    taskStore,
    agentIds: ["mkt-cold-writer"],
    journal,
    fetchImpl: async () => ({
      ok: false,
      async json() { return { error: { code: "DOUYIN_AGENT_API_KEY_SHARED", message: "shared key" } }; }
    }),
    gateway: { action: async (_action, payload) => { sent.push(payload); return { accepted: true }; } }
  });
  await monitor.sync();
  await monitor.sync();
  assert.equal(sent.length, 0);
  assert.equal(taskStore.get("mkt-cold-writer").phase, "error");
  assert.equal(journal.list("mkt-cold-writer").length, 1);
  monitor.dispose();
});

test("turns a timed-out start request into recoverable work history", async () => {
  const taskStore = createDouyinCloudTaskStore({ storage: memoryStorage() });
  taskStore.save("mkt-dm-inbox", { phase: "provisioning" });
  const sent = [];
  const monitor = createDouyinCloudActivityMonitor({
    taskStore,
    agentIds: ["mkt-dm-inbox"],
    fetchImpl: async () => ({
      ok: false,
      async json() { return { error: { code: "DOUYIN_MCP_TIMEOUT", message: "start timed out" } }; }
    }),
    gateway: { action: async (_action, payload) => { sent.push(payload); return { accepted: true }; } }
  });
  await monitor.sync();
  assert.equal(sent.length, 0);
  assert.equal(taskStore.get("mkt-dm-inbox").phase, "error");
  assert.equal(taskStore.get("mkt-dm-inbox").errorCode, "DOUYIN_MCP_TIMEOUT");
  monitor.dispose();
});

test("keeps cloud readiness and local history when the conversation gateway is unavailable", async () => {
  const taskStore = createDouyinCloudTaskStore({ storage: memoryStorage() });
  taskStore.save("mkt-dm-inbox", { phase: "provisioning", startedAt: "2026-08-31T07:00:00.000Z" });
  const journal = createAgentActivityJournal({ storage: memoryStorage() });
  const monitor = createDouyinCloudActivityMonitor({
    taskStore,
    agentIds: ["mkt-dm-inbox"],
    journal,
    gateway: null,
    fetchImpl: async () => ({ ok: true, async json() { return { login_state: "logged_out", worker: { online: true } }; } })
  });
  await monitor.sync();
  assert.equal(taskStore.get("mkt-dm-inbox").phase, "ready");
  assert.equal(journal.list("mkt-dm-inbox").length, 1);
  monitor.dispose();
});

test("acquisition cloud monitor keeps slow startup recoverable without emitting an error", async () => {
  const taskStore = createDouyinCloudTaskStore({ storage: memoryStorage() });
  taskStore.save("mkt-comment-acquisition", { phase: "provisioning", startedAt: "2026-09-02T07:00:00.000Z" });
  const sent = [];
  const monitor = createDouyinCloudActivityMonitor({
    taskStore,
    agentIds: ["mkt-comment-acquisition"],
    fetchImpl: async () => ({
      ok: false,
      async json() { return { error: { code: "DOUYIN_MCP_TIMEOUT", message: "slow startup" } }; }
    }),
    gateway: { action: async (_action, payload) => { sent.push(payload); return { accepted: true }; } }
  });
  await monitor.sync();
  assert.equal(sent.length, 0);
  assert.equal(taskStore.get("mkt-comment-acquisition").cloudState, "recovering");
  assert.equal(taskStore.get("mkt-comment-acquisition").phase, "provisioning");
  monitor.dispose();
});

test("acquisition cloud monitor reports an explicit disconnect and preserves recovery context", async () => {
  const taskStore = createDouyinCloudTaskStore({ storage: memoryStorage() });
  taskStore.save("mkt-find-people", { phase: "provisioning", startedAt: "2026-09-02T07:00:00.000Z" });
  const journal = createAgentActivityJournal({ storage: memoryStorage() });
  const monitor = createDouyinCloudActivityMonitor({
    taskStore,
    agentIds: ["mkt-find-people"],
    journal,
    fetchImpl: async () => ({ ok: true, async json() { return { cloudState: "disconnected", worker: { online: false } }; } }),
    gateway: null
  });
  await monitor.sync();
  const state = taskStore.get("mkt-find-people");
  assert.equal(state.cloudState, "disconnected");
  assert.equal(state.phase, "error");
  assert.match(journal.list("mkt-find-people")[0].text, /云电脑状态异常/);
  monitor.dispose();
});

test("acquisition cloud monitor preserves an explicit authorization-expired state", async () => {
  const taskStore = createDouyinCloudTaskStore({ storage: memoryStorage() });
  taskStore.save("mkt-comment-acquisition", { phase: "provisioning", startedAt: "2026-09-02T07:00:00.000Z" });
  const journal = createAgentActivityJournal({ storage: memoryStorage() });
  const monitor = createDouyinCloudActivityMonitor({
    taskStore,
    agentIds: ["mkt-comment-acquisition"],
    journal,
    fetchImpl: async () => ({
      ok: false,
      async json() { return { cloudState: "auth-expired", error: { code: "DOUYIN_AUTH_EXPIRED", message: "login required" } }; }
    }),
    gateway: null
  });
  await monitor.sync();
  const state = taskStore.get("mkt-comment-acquisition");
  assert.equal(state.cloudState, "auth-expired");
  assert.equal(state.phase, "error");
  assert.match(state.errorMessage, /授权已失效/);
  monitor.dispose();
});

test("acquisition cloud monitor treats the offline error code as a confirmed disconnect", async () => {
  const taskStore = createDouyinCloudTaskStore({ storage: memoryStorage() });
  taskStore.save("mkt-find-people", { phase: "provisioning" });
  const monitor = createDouyinCloudActivityMonitor({
    taskStore,
    agentIds: ["mkt-find-people"],
    fetchImpl: async () => ({
      ok: false,
      async json() { return { error: { code: "DOUYIN_CLOUD_OFFLINE", message: "worker offline" } }; }
    }),
    gateway: null
  });
  await monitor.sync();
  const state = taskStore.get("mkt-find-people");
  assert.equal(state.cloudState, "disconnected");
  assert.equal(state.phase, "error");
  assert.equal(state.errorCode, "DOUYIN_CLOUD_OFFLINE");
  monitor.dispose();
});
