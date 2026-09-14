import test from "node:test";
import assert from "node:assert/strict";
import { createOfficeStatusStore } from "../src/salebuddy/bridge/office-status.js";
import { createOfficeSlotBindings } from "../src/salebuddy/ui/office-character-binding.js";

test("authoritative status replaces cache, expires and recovers", async () => {
  let now = 100, fail = false;
  const store = createOfficeStatusStore({ now: () => now, staleMs: 50, getAgentIds: () => ["a"],
    getLocalWorks: () => [{ agentType: "a", state: "working", metadata: { taskState: "running", taskId: "old" } }],
    fetchSnapshot: async () => { if (fail) throw Error("offline"); return { works: [{ agentType: "a", state: "paused", metadata: { officeStatus: "paused", taskId: "current" } }] }; } });
  assert.equal(store.getWorks()[0].metadata.officeStatus, "unknown");
  await store.refresh();
  assert.equal(store.getWorks()[0].metadata.officeStatus, "paused");
  assert.equal(store.getWorks()[0].metadata.taskId, "current");
  now = 151;
  assert.equal(store.getWorks()[0].metadata.officeStatus, "unknown");
  fail = true; await store.refresh();
  assert.equal(store.getWorks()[0].metadata.officeStatus, "unknown");
  fail = false; await store.refresh();
  assert.equal(store.getWorks()[0].metadata.officeStatus, "paused");
  store.dispose();
});

test("polling coalesces requests and disposal ignores late responses", async () => {
  let resolve, calls = 0;
  const store = createOfficeStatusStore({ getAgentIds: () => ["a"], fetchSnapshot: () => { calls++; return new Promise(r => { resolve = r; }); } });
  const first = store.refresh(); store.refresh();
  assert.equal(calls, 1);
  store.dispose(); resolve({ works: [] }); await first;
  assert.equal(store.getWorks()[0].metadata.officeStatus, "idle");
});

test("agents without a pending task remain idle while status polling is unavailable", async () => {
  const store = createOfficeStatusStore({
    getAgentIds: () => ["a"],
    fetchSnapshot: async () => { throw Error("offline"); }
  });
  assert.equal(store.getWork("a").metadata.officeStatus, "idle");
  await store.refresh();
  assert.equal(store.getWork("a").metadata.officeStatus, "idle");
  store.dispose();
});

test("backend restart cannot turn an unobserved cached task into confirmed idle", async () => {
  const store = createOfficeStatusStore({ getAgentIds: () => ["a"],
    getLocalWorks: () => [{ agentType: "a", state: "working", metadata: { taskId: "in-progress" } }],
    fetchSnapshot: async () => ({ works: [{ agentType: "a", state: "idle", metadata: { officeStatus: "idle", taskId: null } }] }) });
  await store.refresh();
  assert.equal(store.getWork("a").metadata.officeStatus, "unknown");
  store.dispose();
});

test("newly working overflow agent replaces idle seat, not another working agent", () => {
  const bindings = createOfficeSlotBindings(2);
  bindings.update([{ id: "a", state: "working" }, { id: "b", state: "idle" }, { id: "c", state: "idle" }]);
  bindings.update([{ id: "a", state: "working" }, { id: "b", state: "idle" }, { id: "c", state: "working" }]);
  assert.equal(bindings.at(0).id, "a"); assert.equal(bindings.at(1).id, "c");
  assert.equal(bindings.pageCount, 2);
  bindings.setPage(1); assert.equal(bindings.at(0).id, "b");
  bindings.setPage(0); assert.equal(bindings.at(1).id, "c");
});

test("all active agents remain reachable without rotating or evicting the selected agent", () => {
  const bindings = createOfficeSlotBindings(2);
  bindings.update([{ id: "a", state: "idle" }, { id: "b", state: "working" }, { id: "c", state: "idle" }]);
  bindings.update([{ id: "a", state: "idle" }, { id: "b", state: "working" }, { id: "c", state: "working" }], { selectedId: "a" });
  assert.equal(bindings.at(0).id, "a");
  bindings.setPage(1); assert.equal(bindings.at(0).id, "c");
  for (let i = 0; i < 10; i++) bindings.update([{ id: "a", state: "working" }, { id: "b", state: "working" }, { id: "c", state: "working" }]);
  assert.equal(bindings.page, 1); assert.equal(bindings.at(0).id, "c");
});
