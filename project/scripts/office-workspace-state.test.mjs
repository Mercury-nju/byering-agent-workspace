import test from "node:test";
import assert from "node:assert/strict";
import { OFFICE_CORE_AGENT_IDS, OFFICE_START_ACTIONS, officeWorkState, selectOfficeWork, latestOfficeResult, hasOfficeTaskHistory } from "../src/salebuddy/ui/office-workspace-state.js";

test("office exposes all five core Agents and excludes developer mode Agents", () => {
  assert.deepEqual(
    OFFICE_START_ACTIONS.map(({ agentId }) => agentId),
    [
      "mkt-comment-acquisition",
      "mkt-gold-customer-service",
      "mkt-live-danmaku-analysis",
      "mkt-live-danmaku-outreach",
      "mkt-viral-work-analysis"
    ]
  );
  assert.deepEqual(OFFICE_CORE_AGENT_IDS, OFFICE_START_ACTIONS.map(({ agentId }) => agentId));
  assert.ok(OFFICE_START_ACTIONS.every(({ agentId }) => ![
    "mkt-find-people",
    "mkt-intent-analyst",
    "mkt-cold-writer",
    "mkt-dm-inbox"
  ].includes(agentId)));
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
  assert.equal(latestOfficeResult([result, running]), null);
  assert.equal(latestOfficeResult([result], "mkt-dm-inbox"), null);
  assert.equal(latestOfficeResult([{ ...result, resultType: "运行摘要" }]), null);
});

test("recent result accepts every core Agent but never developer mode results", () => {
  const results = OFFICE_CORE_AGENT_IDS.map((agentId, index) => ({
    agentId,
    status: "completed",
    title: `${agentId} result`,
    generatedAt: `2026-09-08T0${index}:00:00Z`
  }));
  assert.equal(latestOfficeResult(results).agentId, "mkt-viral-work-analysis");
  assert.equal(latestOfficeResult(results, "mkt-live-danmaku-analysis").agentId, "mkt-live-danmaku-analysis");
  assert.equal(latestOfficeResult([...results, { agentId: "mkt-intent-analyst", status: "completed", title: "developer result", generatedAt: "2026-09-09T00:00:00Z" }]).agentId, "mkt-viral-work-analysis");
});

test("office task history excludes simulated and developer records", () => {
  assert.equal(hasOfficeTaskHistory([]), false);
  assert.equal(hasOfficeTaskHistory([{ agentId: "mkt-comment-acquisition", status: "failed" }]), true);
  assert.equal(hasOfficeTaskHistory([{ agentId: "mkt-intent-analyst", status: "completed" }]), false);
  assert.equal(hasOfficeTaskHistory([{ agentId: "mkt-comment-acquisition", metadata: { simulated: true } }]), false);
  assert.equal(hasOfficeTaskHistory([{ agentId: "mkt-comment-acquisition", projectId: "demo-office" }]), false);
});
