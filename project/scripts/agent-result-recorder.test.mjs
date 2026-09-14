import test from "node:test";
import assert from "node:assert/strict";
import { createAgentResultRecorder } from "../src/salebuddy/agents/agent-result-recorder.js";
import { createProspectStore } from "../src/salebuddy/ui/prospect-store.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  };
}

test("records private outreach as a structured result center run", () => {
  const store = createProspectStore({ storage: memoryStorage(), now: () => "2026-09-01T10:00:00.000Z" });
  const recorder = createAgentResultRecorder({ store });

  recorder.record({
    agentId: "mkt-cold-writer",
    agentName: "私信触达专员",
    taskId: "private-outreach-1",
    accountId: "sender-sec-1",
    accountName: "一以万真",
    title: "抖音私信触达记录",
    summary: "已向目标用户发送一条真实私信。",
    source: "抖音私信",
    status: "completed",
    counts: { sent: 1, failed: 0 },
    trigger: { source: "评论筛选结果", reason: "用户明确询问价格" },
    items: [{
      nickname: "目标用户",
      secUid: "target-sec-1",
      message: "你好，看到你在评论区想了解价格。",
      profile: { followerCount: 2300, location: "上海" },
      triggerSource: "评论筛选结果",
      triggerReason: "用户明确询问价格",
      evidence: ["评论原话：想了解一下价格"],
      sentAt: "2026-09-01T09:59:00.000Z",
      status: "sent"
    }]
  });

  const run = store.listRuns()[0];
  assert.equal(run.taskId, "private-outreach-1");
  assert.equal(run.resultType, "触达记录");
  assert.equal(run.status, "completed");
  assert.equal(run.accountName, "一以万真");
  assert.equal(run.counts.sent, 1);
  assert.equal(run.items[0].status, "sent");
  assert.equal(run.items[0].message, "你好，看到你在评论区想了解价格。");
  assert.equal(run.items[0].triggerReason, "用户明确询问价格");
  assert.deepEqual(run.items[0].profile, { followerCount: 2300, location: "上海" });
  assert.deepEqual(run.items[0].evidence, ["评论原话：想了解一下价格"]);
});

test("preserves the originating source scope for prospect outreach", () => {
  const store = createProspectStore({ storage: memoryStorage(), now: () => "2026-09-03T10:00:00.000Z" });
  const recorder = createAgentResultRecorder({ store });

  recorder.record({
    agentId: "mkt-cold-writer",
    agentName: "私信触达专员",
    taskId: "own-prospect-touch-1",
    source: "抖音私信",
    sourceResultType: "潜客",
    sourceScope: "own_account_comments",
    status: "completed",
    counts: { sent: 1 },
    items: [{ recordId: "lead:own:sec-1", secUid: "sec-1", nickname: "自有账号用户", status: "sent" }]
  });

  const run = store.listRuns()[0];
  assert.equal(run.sourceScope, "own_account_comments");
  assert.equal(run.contactability.allowed, true);
  assert.equal(run.items[0].sourceScope, "own_account_comments");
});

test("upserts long-lived inbox state instead of creating duplicate result runs", () => {
  const store = createProspectStore({ storage: memoryStorage(), now: () => "2026-09-01T10:00:00.000Z" });
  const recorder = createAgentResultRecorder({ store });

  recorder.record({
    agentId: "mkt-dm-inbox",
    agentName: "私信承接 / 自动回复专员",
    taskId: "inbox-session-1",
    title: "私信承接运行记录",
    summary: "正在持续监听新私信。",
    source: "私信承接",
    status: "running",
    counts: { received: 2, drafted: 1, sent: 0 },
    items: [{ messageId: "m-1", status: "drafted" }]
  });
  recorder.record({
    agentId: "mkt-dm-inbox",
    agentName: "私信承接 / 自动回复专员",
    taskId: "inbox-session-1",
    title: "私信承接运行记录",
    summary: "已生成回复草稿，等待确认。",
    source: "私信承接",
    status: "completed",
    counts: { received: 2, drafted: 1, sent: 1 },
    items: [{ messageId: "m-1", status: "sent" }]
  });

  const runs = store.listRuns();
  assert.equal(runs.length, 1);
  assert.equal(runs[0].status, "completed");
  assert.equal(runs[0].counts.sent, 1);
  assert.equal(runs[0].summary, "已生成回复草稿，等待确认。");
});

test("upserts acquisition runs by agent, task, and account while appending replay-safe evidence", () => {
  const store = createProspectStore({ storage: memoryStorage(), now: () => "2026-09-02T10:00:00.000Z" });
  const recorder = createAgentResultRecorder({ store });
  const base = {
    agentId: "mkt-comment-acquisition",
    agentName: "评论获客专员",
    taskId: "acq-task-1",
    taskRunId: "run-1",
    accountId: "account-a",
    status: "partial",
    source: "作品评论",
    scanSummaries: [{ id: "scan-1", summary: "扫描 10 条作品" }],
    candidateEvidence: [{ id: "candidate-1", quote: "求链接", observedAt: "2026-09-02T09:59:00.000Z" }],
    approvalHistory: [{ id: "approval-1", status: "pending" }]
  };
  recorder.record(base);
  recorder.record({ ...base, status: "pending", taskRunId: "run-2", scanSummaries: [...base.scanSummaries, { id: "scan-2", summary: "扫描 5 条作品" }], candidateEvidence: [...base.candidateEvidence] });
  const run = store.listRuns()[0];
  assert.equal(store.listRuns().length, 1);
  assert.equal(run.ownerKey, "mkt-comment-acquisition::acq-task-1::account-a");
  assert.equal(run.taskRunId, "run-2");
  assert.equal(run.status, "pending");
  assert.equal(run.scanSummaries.length, 2);
  assert.equal(run.candidateEvidence.length, 1);
  assert.equal(run.approvalHistory.length, 1);
});

test("retains owning Agent and task links for result-center handoff", () => {
  const store = createProspectStore({ storage: memoryStorage() });
  const recorder = createAgentResultRecorder({ store });
  recorder.record({
    agentId: "mkt-live-lead-miner",
    taskId: "live-task-1",
    taskRunId: "live-run-1",
    accountId: "account-a",
    source: "直播互动",
    links: { sourceWorkUrl: "/work/live-task-1", commentUrl: "https://www.douyin.com/video/1" },
    status: "partial"
  });
  const run = store.listRuns()[0];
  assert.equal(run.agentId, "mkt-live-lead-miner");
  assert.equal(run.taskId, "live-task-1");
  assert.equal(run.taskRunId, "live-run-1");
  assert.equal(run.accountId, "account-a");
  assert.deepEqual(run.links, { sourceWorkUrl: "/work/live-task-1", commentUrl: "https://www.douyin.com/video/1" });
});

test("keeps acquisition result runs isolated across agents and accounts", () => {
  const store = createProspectStore({ storage: memoryStorage() });
  const recorder = createAgentResultRecorder({ store });
  const input = { taskId: "same-task", status: "running", source: "真实采集" };
  recorder.record({ ...input, agentId: "mkt-comment-acquisition", accountId: "account-a" });
  recorder.record({ ...input, agentId: "mkt-live-lead-miner", accountId: "account-a" });
  recorder.record({ ...input, agentId: "mkt-comment-acquisition", accountId: "account-b" });
  assert.equal(store.listRuns().length, 3);
});

test("derives acquisition ownership from account secId fields", () => {
  const store = createProspectStore({ storage: memoryStorage() });
  store.ingestRun({ agentId: "mkt-live-lead-miner", taskId: "same-task", resultSnapshot: { account: { sec_id: "sec-a" }, status: "partial" } });
  store.ingestRun({ agentId: "mkt-live-lead-miner", taskId: "same-task", resultSnapshot: { account: { sec_id: "sec-b" }, status: "partial" } });
  const runs = store.listRuns();
  assert.equal(runs.length, 2);
  assert.ok(runs.some((run) => run.ownerKey.endsWith("::sec-a")));
  assert.ok(runs.some((run) => run.ownerKey.endsWith("::sec-b")));
  assert.equal(runs.find((run) => run.ownerKey.endsWith("::sec-a")).accountId, "sec-a");
});

test("normalizes future Agent result types and preserves the universal delivery contract", () => {
  const store = createProspectStore({ storage: memoryStorage(), now: () => "2026-09-03T10:00:00.000Z" });
  const recorder = createAgentResultRecorder({ store });

  recorder.record({
    agentId: "mkt-research-expert",
    agentName: "客户研究专家",
    taskId: "research-task-1",
    source: "账号研究",
    status: "completed",
    inputs: { accounts: ["account-1"], window: "近30天" },
    counts: { accounts: 1, sources: 4 },
    items: [{ id: "brief-1", title: "账号画像", status: "completed" }],
    evidence: [{ id: "source-1", url: "https://example.com/source" }],
    decisions: [{ id: "decision-1", label: "值得跟进", confidence: 0.86 }],
    actions: [{ id: "action-1", label: "进入触达策略" }],
    handoff: { targetAgentId: "mkt-cold-writer", reason: "已有明确需求信号" }
  });

  const run = store.listRuns()[0];
  assert.equal(run.resultType, "研究简报");
  assert.equal(run.contract, "byering.agent_result");
  assert.deepEqual(run.inputs, { accounts: ["account-1"], window: "近30天" });
  assert.equal(run.items[0].id, "brief-1");
  assert.equal(run.evidence[0].id, "source-1");
  assert.equal(run.decisions[0].label, "值得跟进");
  assert.equal(run.handoff.targetAgentId, "mkt-cold-writer");
});

test("merges incremental result items by identity while keeping the newest state", () => {
  const store = createProspectStore({ storage: memoryStorage(), now: () => "2026-09-03T10:00:00.000Z" });
  const recorder = createAgentResultRecorder({ store });
  const base = {
    agentId: "mkt-dm-inbox",
    agentName: "私信承接专员",
    taskId: "inbox-task-2",
    source: "私信承接",
    status: "running"
  };
  recorder.record({ ...base, items: [{ messageId: "message-1", status: "received" }] });
  recorder.record({ ...base, status: "completed", items: [{ messageId: "message-1", status: "sent" }, { messageId: "message-2", status: "drafted" }] });

  const run = store.listRuns()[0];
  assert.equal(run.items.length, 2);
  assert.equal(run.items.find((item) => item.messageId === "message-1").status, "sent");
  assert.equal(run.items.find((item) => item.messageId === "message-2").status, "drafted");
});

test("falls back to domain arrays when the recorder's default items array is empty", () => {
  const store = createProspectStore({ storage: memoryStorage() });
  const recorder = createAgentResultRecorder({ store });
  recorder.record({
    agentId: "mkt-intent-analyst",
    agentName: "意向分析专员",
    taskId: "intent-task-1",
    source: "意向分析",
    comments: [{ id: "comment-1", text: "想了解价格" }],
    status: "completed"
  });
  assert.equal(store.listRuns()[0].items[0].id, "comment-1");
});

test("records Douyin finder accounts as a dedicated result-center batch", () => {
  const store = createProspectStore({ storage: memoryStorage(), now: () => "2026-09-04T10:00:00.000Z" });
  const recorder = createAgentResultRecorder({ store });

  recorder.record({
    agentId: "mkt-douyin-finder",
    agentName: "抖音找人专家",
    taskId: "finder-task-1",
    title: "上海家居账号 · 找人结果",
    summary: "已发现 2 个候选账号，匹配 1 个。",
    source: "抖音找人",
    status: "completed",
    counts: { input: 0, discovered: 2, resolved: 2, matched: 1 },
    items: [
      { accountId: "sec-1", nickname: "家居账号 1", matched: true, score: 82 },
      { accountId: "sec-2", nickname: "家居账号 2", matched: false, score: 35 }
    ],
    accounts: [{ sec_uid: "sec-1" }, { sec_uid: "sec-2" }]
  });

  const run = store.listRuns()[0];
  assert.equal(run.resultType, "抖音找人");
  assert.equal(run.source, "抖音找人");
  assert.equal(run.items.length, 2);
  assert.equal(run.resultSnapshot.accounts.length, 2);
  assert.equal(run.counts.matched, 1);
});

test("updates one finder result batch without creating a second run", () => {
  const store = createProspectStore({ storage: memoryStorage() });
  const recorder = createAgentResultRecorder({ store });
  recorder.record({
    agentId: "mkt-douyin-finder",
    agentName: "抖音找人专家",
    taskId: "finder-task-2",
    source: "抖音找人",
    status: "completed",
    counts: { discovered: 1, matched: 1 },
    items: [{ accountId: "sec-1", nickname: "候选账号", matched: true, score: 80 }]
  });

  const updated = store.updateRun("finder-task-2", (run) => ({
    ...run,
    items: [{ ...run.items[0], finderState: { status: "已保存", saved: true, tags: ["重点候选"] } }]
  }));

  assert.equal(store.listRuns().length, 1);
  assert.equal(updated.items[0].finderState.status, "已保存");
  assert.equal(store.listRuns()[0].items[0].finderState.saved, true);
});

test("keeps Douyin finder accounts out of the ordinary prospect records", () => {
  const store = createProspectStore({ storage: memoryStorage() });
  const recorder = createAgentResultRecorder({ store });

  recorder.record({
    agentId: "mkt-douyin-finder",
    agentName: "抖音找人专家",
    taskId: "finder-task-isolated",
    source: "抖音找人",
    status: "completed",
    counts: { discovered: 1, matched: 1 },
    items: [{ accountId: "sec-isolated", nickname: "候选账号", matched: true }],
    accounts: [{ sec_uid: "sec-isolated" }]
  });

  assert.equal(store.list().length, 0);
  assert.equal(store.listRuns().length, 1);
  assert.equal(store.listRuns()[0].resultType, "抖音找人");
});
