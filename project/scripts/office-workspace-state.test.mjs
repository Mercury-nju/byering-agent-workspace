import test from "node:test";
import assert from "node:assert/strict";
import { OFFICE_START_ACTIONS, officeWorkState, selectOfficeWork, latestOfficeResult } from "../src/salebuddy/ui/office-workspace-state.js";
import { DOUYIN_ACQUISITION_ACTIVE_AGENT_IDS } from "../src/salebuddy/agents/marketplace.js";

test("office quick actions use the same five active Agents as Agent Center", () => {
  assert.deepEqual(OFFICE_START_ACTIONS.map(({ agentId }) => agentId), DOUYIN_ACQUISITION_ACTIVE_AGENT_IDS);
});

test("office only surfaces working, idle and authorization-offline states", () => {
  assert.equal(officeWorkState(null).kind, "idle");
  assert.equal(officeWorkState({ state: "working", metadata: { taskState: "paused" } }).kind, "idle");
  assert.equal(officeWorkState({ state: "working", metadata: { taskState: "stopped" } }).kind, "idle");
  assert.equal(officeWorkState({ state: "working", metadata: { longRunning: true, taskState: "running" }, activities: [] }).kind, "working");
  assert.equal(officeWorkState({ state: "working", lastError: "授权已失效" }).kind, "attention");
  assert.equal(officeWorkState({ state: "working", lastError: "普通异常" }).kind, "idle");
  assert.equal(officeWorkState({ state: "working", metadata: { error: { code: "RECEPTION_SETUP_REQUIRED" } } }).kind, "idle");
  assert.equal(officeWorkState({ state: "working", metadata: { officeStatus: "attention", error: { message: "普通异常" } } }).kind, "idle");
  assert.equal(officeWorkState({ state: "working", metadata: { officeStatus: "attention", error: { code: "DOUYIN_AUTH_EXPIRED", message: "授权过期" } } }).label, "账号已掉线");
});

test("a real active task is selected automatically and multiple tasks retain current selection", () => {
  const a = { agentType: "mkt-dm-inbox", state: "working", startedAt: 1 };
  const b = { agentType: "mkt-douyin-finder", state: "working", startedAt: 2 };
  assert.equal(selectOfficeWork([a]), a.agentType);
  assert.equal(selectOfficeWork([a, b], a.agentType), a.agentType);
  assert.equal(selectOfficeWork([{ ...a, metadata: { simulated: true } }]), null);
  assert.equal(selectOfficeWork([{ ...a, metadata: { taskState: "paused" } }]), null);
});

test("recent result only uses actual completed business results and respects selected Agent", () => {
  const result = { agentId: "mkt-find-people", status: "completed", title: "找到的账号", generatedAt: "2026-09-08T01:00:00Z" };
  const running = { ...result, status: "running", generatedAt: "2026-09-08T02:00:00Z" };
  assert.equal(latestOfficeResult([result, running]), result);
  assert.equal(latestOfficeResult([result], "mkt-dm-inbox"), null);
  assert.equal(latestOfficeResult([{ ...result, resultType: "运行摘要" }]), null);
});
