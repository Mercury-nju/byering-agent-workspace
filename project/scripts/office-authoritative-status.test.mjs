import test from "node:test";
import assert from "node:assert/strict";
import { buildOfficeStatus, officeReceiptState, OFFICE_AGENT_IDS } from "../backend/office-status.js";
import { officeWorkState } from "../src/salebuddy/ui/office-workspace-state.js";
import { DOUYIN_ACQUISITION_ACTIVE_AGENT_IDS } from "../src/salebuddy/agents/marketplace.js";

test("office status owns active account Agents and standalone work Agents", () => {
  assert.deepEqual(OFFICE_AGENT_IDS, [
    ...DOUYIN_ACQUISITION_ACTIVE_AGENT_IDS,
    "mkt-viral-work-analysis"
  ]);
  assert.equal(OFFICE_AGENT_IDS.includes("mkt-live-lead-miner"), false);
  assert.equal(OFFICE_AGENT_IDS.includes("mkt-research-expert"), false);
});

test("office aggregates live tasks by tenant and prefers active work over stopped history", () => {
  const snapshot = buildOfficeStatus({ tenantId: "a", observedAt: 1000, sources: [{ agentIds: ["mkt-find-people"], tasks: [
    { tenantId: "a", agentId: "mkt-find-people", taskId: "old", state: "completed", updatedAt: 900 },
    { tenantId: "a", agentId: "mkt-find-people", taskId: "new", state: "running", updatedAt: 800 },
    { tenantId: "b", agentId: "mkt-find-people", taskId: "secret", state: "running" }
  ] }] });
  const work = snapshot.works.find(w => w.agentType === "mkt-find-people");
  assert.equal(work.metadata.taskId, "new");
  assert.equal(work.state, "working");
  assert.equal(JSON.stringify(snapshot).includes("secret"), false);
});

test("office preserves every active task for the same Agent across Douyin accounts", () => {
  const snapshot = buildOfficeStatus({ tenantId: "tenant-a", sources: [{ agentIds: ["mkt-find-people"], tasks: [
    { tenantId: "tenant-a", agentId: "mkt-find-people", taskId: "finder-a", taskRunId: "run-a", accountId: "douyin-a", state: "running", runtimeAlive: true, updatedAt: 100 },
    { tenantId: "tenant-a", agentId: "mkt-find-people", taskId: "finder-b", taskRunId: "run-b", accountId: "douyin-b", state: "running", runtimeAlive: true, updatedAt: 200 }
  ] }] });
  const summary = snapshot.works.find((work) => work.agentType === "mkt-find-people");
  const taskWorks = snapshot.taskWorks.filter((work) => work.agentType === "mkt-find-people");

  assert.equal(summary.metadata.activeTaskCount, 2);
  assert.deepEqual(new Set(taskWorks.map((work) => work.metadata.accountId)), new Set(["douyin-a", "douyin-b"]));
  assert.deepEqual(new Set(taskWorks.map((work) => work.metadata.taskRunId)), new Set(["run-a", "run-b"]));
});

test("office task work carries the authoritative acquisition snapshot needed by the realtime queue", () => {
  const snapshot = buildOfficeStatus({ tenantId: "tenant-a", sources: [{ agentIds: ["mkt-comment-acquisition"], tasks: [{
    tenantId: "tenant-a",
    agentId: "mkt-comment-acquisition",
    taskId: "acquisition-live",
    taskRunId: "run-live",
    accountId: "douyin-a",
    state: "running",
    runtimeAlive: true,
    approvalQueue: [{
      touchId: "touch-1",
      state: "submitted",
      lead: { leadId: "lead-1", nickname: "客户甲", intent: { tier: "high", score: 91 } }
    }],
    candidateProfiles: {
      "lead-1": { leadId: "lead-1", uid: "uid-1", secUid: "sec-1", nickname: "客户甲" }
    },
    replies: [{ leadId: "lead-1", content: "方便了解一下", receivedAt: "2026-09-17T10:00:00.000Z" }],
    counters: { candidates: 1, replies: 1 },
    resultSnapshot: { source: "douyin_interactions", leads: [{ leadId: "lead-1" }] }
  }] }] });
  const work = snapshot.taskWorks.find((item) => item.metadata.taskId === "acquisition-live");
  const acquisition = work.metadata.acquisitionSnapshot;

  assert.equal(work.state, "working");
  assert.equal(acquisition.approvalQueue[0].touchId, "touch-1");
  assert.equal(acquisition.candidateProfiles["lead-1"].secUid, "sec-1");
  assert.equal(acquisition.replies[0].content, "方便了解一下");
  assert.equal(acquisition.resultSnapshot.leads[0].leadId, "lead-1");
});

test("persisted running tasks without a live runner are unknown, not working", () => {
  const snapshot = buildOfficeStatus({ sources: [{ agentIds: ["mkt-comment-acquisition"], tasks: [
    { agentId: "mkt-comment-acquisition", state: "running", runtimeAlive: false }
  ] }] });
  assert.equal(snapshot.works.find(w => w.agentType === "mkt-comment-acquisition").state, "unknown");
});

test("a live task with a non-critical source warning remains working", () => {
  const snapshot = buildOfficeStatus({ sources: [{ agentIds: ["mkt-comment-acquisition"], tasks: [
    {
      agentId: "mkt-comment-acquisition",
      state: "running",
      runtimeAlive: true,
      lastError: { code: "DOUYIN_SOURCE_DEGRADED", message: "直播未开播，评论监听继续运行" }
    }
  ] }] });
  assert.equal(snapshot.works.find(w => w.agentType === "mkt-comment-acquisition").state, "working");
});

test("reauthorization waiting state stays visible instead of looking like an unknown task", () => {
  const snapshot = buildOfficeStatus({ sources: [{ agentIds: ["mkt-comment-acquisition"], tasks: [
    {
      agentId: "mkt-comment-acquisition",
      state: "degraded",
      runtimeAlive: false,
      resumeBlocked: {
        reason: "authorization_required",
        message: "抖音账号需要重新连接后，自动获客会继续。"
      }
    }
  ] }] });
  const work = snapshot.works.find(w => w.agentType === "mkt-comment-acquisition");
  const status = officeWorkState(work);
  assert.equal(work.state, "attention");
  assert.equal(status.kind, "attention");
  assert.equal(status.label, "账号已掉线");
  assert.equal(status.reason, "抖音账号需要重新连接后，自动获客会继续。");
});

test("a cancelled task never remains actionable because of a stale authorization error", () => {
  const snapshot = buildOfficeStatus({ sources: [{ agentIds: ["mkt-comment-acquisition"], tasks: [
    {
      agentId: "mkt-comment-acquisition",
      taskId: "cancelled-acquisition",
      state: "stopped",
      runtimeAlive: false,
      lastError: { code: "DOUYIN_AUTH_EXPIRED", message: "抖音授权已失效" },
      resumeBlocked: {
        reason: "authorization_required",
        message: "抖音账号需要重新连接后，自动获客会继续。"
      }
    }
  ] }] });
  const work = snapshot.works.find(w => w.agentType === "mkt-comment-acquisition");
  assert.equal(work.state, "idle");
  assert.equal(work.metadata.activeTaskCount, 0);
});

test("missing reception setup is not an office interruption", () => {
  const snapshot = buildOfficeStatus({ sources: [{ agentIds: ["mkt-comment-acquisition"], tasks: [
    {
      agentId: "mkt-comment-acquisition",
      state: "error",
      runtimeAlive: false,
      lastError: { code: "RECEPTION_SETUP_REQUIRED", message: "请先在对话策略里保存这个账号的接待方式" }
    }
  ] }] });
  const work = snapshot.works.find(w => w.agentType === "mkt-comment-acquisition");
  const status = officeWorkState(work);
  assert.equal(work.state, "idle");
  assert.equal(work.metadata.error.code, "RECEPTION_SETUP_REQUIRED");
  assert.equal(status.kind, "idle");
});

test("old failures do not replace the latest paused or unobserved task", () => {
  const snapshot = buildOfficeStatus({ sources: [{ agentIds: ["mkt-comment-acquisition"], tasks: [
    { agentId: "mkt-comment-acquisition", taskId: "old", state: "failed", updatedAt: 100 },
    { agentId: "mkt-comment-acquisition", taskId: "latest", state: "degraded", runtimeAlive: false, updatedAt: 200 }
  ] }] });
  const work = snapshot.works.find(w => w.agentType === "mkt-comment-acquisition");
  assert.equal(work.state, "unknown"); assert.equal(work.metadata.taskId, "latest");
});

test("source failure and stale browser state never become idle", () => {
  const snapshot = buildOfficeStatus({ sources: [{ agentIds: ["mkt-dm-inbox"], error: true }] });
  assert.equal(officeWorkState(snapshot.works.find(w => w.agentType === "mkt-dm-inbox")).kind, "unknown");
  assert.equal(officeWorkState({ state: "working", metadata: { officeStatus: "unknown", taskState: "running" } }).kind, "unknown");
});

test("paused status is treated as no current work", () => {
  assert.equal(officeWorkState({ state: "working", metadata: { officeStatus: "paused", taskState: "running" } }).kind, "idle");
});

test("accepted private-message actions are not displayed as finished without a receipt", () => {
  assert.equal(officeReceiptState({ ok: true, state: "pending", receiptPending: true }), "unknown");
  assert.equal(officeReceiptState({ ok: true }), "unknown");
  assert.equal(officeReceiptState({ ok: true, receipt: { state: "delivered" } }), "completed");
  assert.equal(officeReceiptState({ ok: false }), "failed");
});
