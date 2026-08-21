import assert from "node:assert/strict";
import test from "node:test";

import { createGatewayEventAdapter } from "../src/salebuddy/runtime/gateway-events.js";

test("AG-UI text deltas are accumulated into one canonical stream", () => {
  const events = [];
  const adapter = createGatewayEventAdapter({ taskId: "task-stream-1", onEvent: (event) => events.push(event) });

  adapter.accept({ type: "RUN_STARTED", run_id: "run-1", seq: 1 });
  adapter.accept({ type: "TEXT_MESSAGE_START", messageId: "message-1", seq: 2 });
  adapter.accept({ type: "TEXT_MESSAGE_CONTENT", messageId: "message-1", delta: "先确认" , seq: 3 });
  adapter.accept({ type: "TEXT_MESSAGE_CONTENT", messageId: "message-1", delta: "目标和范围。", seq: 4 });
  adapter.accept({ type: "TEXT_MESSAGE_END", messageId: "message-1", seq: 5 });

  assert.deepEqual(events.map(({ t }) => t), [
    "run-started",
    "progress-start",
    "chief-stream-start",
    "chief-stream-delta",
    "chief-stream-delta",
    "chief-stream-end"
  ]);
  assert.deepEqual(events.filter(({ t }) => t === "chief-stream-delta").map(({ text }) => text), ["先确认", "目标和范围。"]);
  assert.equal(events.at(-1).text, "先确认目标和范围。");
  assert.equal(events.at(-1).taskId, "task-stream-1");
});

test("follow-up AG-UI streams stay attached to their pending conversation bubble", () => {
  const events = [];
  const adapter = createGatewayEventAdapter({ taskId: "task-followup-1", onEvent: (event) => events.push(event) });

  adapter.accept({ type: "TEXT_MESSAGE_START", messageId: "followup-1", followupId: "followup-1", seq: 1 });
  adapter.accept({ type: "TEXT_MESSAGE_CONTENT", messageId: "followup-1", followupId: "followup-1", delta: "我建议先", seq: 2 });
  adapter.accept({ type: "TEXT_MESSAGE_CONTENT", messageId: "followup-1", followupId: "followup-1", delta: "核对回复。", seq: 3 });
  adapter.accept({ type: "TEXT_MESSAGE_END", messageId: "followup-1", followupId: "followup-1", seq: 4 });

  assert.deepEqual(events.map(({ t }) => t), [
    "followup-stream-start",
    "followup-stream-delta",
    "followup-stream-delta",
    "followup-stream-end"
  ]);
  assert.equal(events.at(-1).followupId, "followup-1");
  assert.equal(events.at(-1).text, "我建议先核对回复。");
});

test("duplicate remote sequence is ignored before it reaches the runtime", () => {
  const events = [];
  const adapter = createGatewayEventAdapter({ onEvent: (event) => events.push(event) });

  const source = { type: "RUN_STARTED", run_id: "run-2", seq: 1 };
  adapter.accept(source);
  adapter.accept({ ...source });
  adapter.accept({ type: "TEXT_MESSAGE_CONTENT", run_id: "run-2", seq: 2, delta: "只出现一次" });
  adapter.accept({ type: "TEXT_MESSAGE_CONTENT", run_id: "run-2", seq: 2, delta: "只出现一次" });

  assert.equal(events.filter(({ t }) => t === "run-started").length, 1);
  assert.equal(events.filter(({ t }) => t === "chief-stream-delta").length, 1);
});

test("subagent lifecycle becomes the existing employee progress events", () => {
  const events = [];
  const adapter = createGatewayEventAdapter({ onEvent: (event) => events.push(event) });

  adapter.accept({
    type: "CUSTOM",
    name: "subagent_start",
    run_id: "run-3",
    seq: 1,
    value: { agentId: "sub-1", agentName: "线索猎人", parentAgentId: "main", skillId: "observe_interactions" }
  });
  adapter.accept({
    type: "CUSTOM",
    name: "subagent_end",
    run_id: "run-3",
    seq: 2,
    value: { agentId: "sub-1", agentName: "线索猎人", parentAgentId: "main", status: "completed", text: "已整理互动证据" }
  });

  assert.deepEqual(events.map(({ t }) => t), ["sub-start", "sub-accepted", "sub-started", "sub-done"]);
  assert.equal(events[0].agentName, "线索猎人");
  assert.equal(events[0].skillId, "observe_interactions");
  assert.equal(events.at(-1).text, "已整理互动证据");
});

test("subagent progress carries logs, evidence and percentage into the progress card", () => {
  const events = [];
  const adapter = createGatewayEventAdapter({ onEvent: (event) => events.push(event) });

  adapter.accept({
    type: "CUSTOM",
    name: "subagent_start",
    run_id: "run-4",
    seq: 1,
    value: { agentId: "sub-4", agentName: "线索猎人" }
  });
  adapter.accept({
    type: "CUSTOM",
    name: "subagent_progress",
    run_id: "run-4",
    seq: 2,
    value: {
      agentId: "sub-4",
      text: "已同步公开互动记录",
      progress: 42,
      evidence: [{ type: "source", label: "互动记录", ref: "source-1" }]
    }
  });

  const progress = events.at(-1);
  assert.equal(progress.t, "sub-log");
  assert.equal(progress.pct, 42);
  assert.equal(progress.text, "已同步公开互动记录");
  assert.equal(progress.evidence[0].ref, "source-1");
});

test("public prospect workflow stages render as named Agent lifecycle events", () => {
  const events = [];
  const adapter = createGatewayEventAdapter({ taskId: "task-prospect-stage-1", onEvent: (event) => events.push(event) });

  adapter.accept({
    type: "AGENT_STAGE_STARTED",
    event_id: "stage-start-1",
    run_id: "run-prospect-stage-1",
    agentId: "lead_analyst",
    skillId: "public_lead_analysis",
    stage: "lead_analyst"
  });
  adapter.accept({
    type: "AGENT_STAGE_COMPLETED",
    event_id: "stage-end-1",
    run_id: "run-prospect-stage-1",
    agentId: "lead_analyst",
    skillId: "public_lead_analysis",
    stage: "lead_analyst",
    resultSnapshot: { workflow: { id: "find_only" } }
  });

  assert.deepEqual(events.map(({ t }) => t), [
    "sub-start",
    "sub-accepted",
    "sub-started",
    "sub-done",
    "result-updated"
  ]);
  assert.equal(events[0].agentId, "lead_analyst");
  assert.equal(events[3].agentId, "lead_analyst");
  assert.equal(events[4].resultSnapshot.workflow.id, "find_only");
});

test("canonical public stages never fall back to the demo project operator", () => {
  const events = [];
  const adapter = createGatewayEventAdapter({ onEvent: (event) => events.push(event) });

  adapter.accept({
    type: "AGENT_STAGE_STARTED",
    event_id: "stage-name-1",
    agentId: "acquisition_strategist",
    stage: "acquisition_strategist"
  });

  assert.equal(events[0].agentName, "账号发现与解析师");
  assert.equal(events[0].skill, "账号发现与解析");
  assert.notEqual(events[0].agentName, "项目执行 Agent");
});

test("pending prospect stages never become a completion bubble", () => {
  const events = [];
  const adapter = createGatewayEventAdapter({ taskId: "task-pending-stage-1", onEvent: (event) => events.push(event) });

  adapter.accept({
    type: "AGENT_STAGE_COMPLETED",
    event_id: "stage-pending-1",
    run_id: "run-pending-1",
    agentId: "lead_miner",
    skillId: "public_video_comment_collection",
    status: "PENDING",
    text: "视频已提交，等待评论回调"
  });

  assert.equal(events.some(({ t }) => t === "sub-done"), false);
  const pending = events.find(({ t }) => t === "sub-log");
  assert.equal(pending.status, "PENDING");
  assert.match(pending.text, /等待/);
});

test("pending CUSTOM subagent end stays in progress", () => {
  const events = [];
  const adapter = createGatewayEventAdapter({ taskId: "task-pending-custom-1", onEvent: (event) => events.push(event) });

  adapter.accept({
    type: "CUSTOM",
    name: "subagent_end",
    run_id: "run-pending-custom-1",
    seq: 1,
    value: { agentId: "lead_miner", status: "QUEUED", text: "等待异步数据回传" }
  });

  assert.equal(events.some(({ t }) => t === "sub-done"), false);
  assert.equal(events.at(-1).t, "sub-log");
  assert.equal(events.at(-1).status, "QUEUED");
});

test("account resolution stays attached to acquisition strategist", () => {
  const events = [];
  const adapter = createGatewayEventAdapter({ taskId: "task-account-event-1", onEvent: (event) => events.push(event) });

  adapter.accept({
    type: "ACCOUNT_RESOLVED",
    run_id: "run-account-event-1",
    seq: 1,
    agentId: "acquisition_strategist",
    skillId: "account_resolution",
    account: { uid: "u-1", secId: "sec-1", uniqueId: "huanglaoban" }
  });

  assert.equal(events.length, 1);
  assert.equal(events[0].t, "account-resolved");
  assert.equal(events[0].agentId, "acquisition_strategist");
  assert.equal(events[0].account.uid, "u-1");
});

test("gateway workflow events drive approval, recovery, reply handoff and artifacts", () => {
  const events = [];
  const adapter = createGatewayEventAdapter({ taskId: "task-workflow-1", onEvent: (event) => events.push(event) });

  adapter.accept({ type: "APPROVAL_REQUESTED", run_id: "run-5", seq: 1, approval: { id: "approval-5", title: "触达前确认" } });
  adapter.accept({ type: "TASK_PAUSED", run_id: "run-5", seq: 2, reason: "风控复核" });
  adapter.accept({ type: "TASK_RESUMED", run_id: "run-5", seq: 3 });
  adapter.accept({ type: "RETRY_STARTED", run_id: "run-5", seq: 4, stepId: "step-1" });
  adapter.accept({ type: "ARTIFACT_CREATED", run_id: "run-5", seq: 5, artifact: { id: "file-5", name: "线索.csv", type: "sheet" } });
  adapter.accept({ type: "LEAD_REPLIED", run_id: "run-5", seq: 6, replyText: "想了解方案" });

  assert.deepEqual(events.map(({ t }) => t), [
    "approval-show",
    "task-paused",
    "task-resumed",
    "task-retry-requested",
    "file",
    "lead-replied"
  ]);
  assert.equal(events[0].approval.id, "approval-5");
  assert.equal(events[4].name, "线索.csv");
  assert.equal(events[5].replyText, "想了解方案");
});

test("server requirement proposal becomes a canonical requirement event", () => {
  const events = [];
  const adapter = createGatewayEventAdapter({ taskId: "task-requirement-1", onEvent: (event) => events.push(event) });
  adapter.accept({
    type: "REQUIREMENT_PROPOSED",
    run_id: "run-requirement-1",
    seq: 1,
    proposal: { source: "model", title: "真实提案", objective: "确认目标" }
  });

  assert.equal(events.length, 1);
  assert.equal(events[0].t, "requirement-proposed");
  assert.equal(events[0].proposal.title, "真实提案");
});

test("server gate events drive requirement, assignment, and access checkpoints", () => {
  const events = [];
  const adapter = createGatewayEventAdapter({ taskId: "task-gates-1", onEvent: (event) => events.push(event) });
  adapter.accept({ type: "REQUIREMENT_CONFIRMED", run_id: "run-gates-1", seq: 1 });
  adapter.accept({
    type: "ASSIGNMENT_PROPOSED",
    run_id: "run-gates-1",
    seq: 2,
    assignments: [{ agentName: "线索猎人", skill: "线索发现" }]
  });
  adapter.accept({
    type: "ACCESS_REQUIRED",
    run_id: "run-gates-1",
    seq: 3,
    provider: "抖音账号",
    account: "销售账号",
    scopes: ["直播互动"]
  });
  adapter.accept({
    type: "ACCESS_GRANTED",
    run_id: "run-gates-1",
    seq: 4,
    stage: "authorization",
    browserSessionId: "session-1",
    scopes: ["直播互动"]
  });
  adapter.accept({
    type: "SCOPE_CONFIRMED",
    run_id: "run-gates-1",
    seq: 6,
    browserSessionId: "session-1",
    scopes: ["直播互动"]
  });
  adapter.accept({
    type: "ACCESS_GRANTED",
    run_id: "run-gates-1",
    seq: 5,
    stage: "scope",
    browserSessionId: "session-1",
    scopes: ["直播互动"]
  });

  assert.deepEqual(events.map(({ t }) => t), [
    "requirement-confirmed",
    "assignment-plan",
    "auth-required",
    "auth-granted",
    "scope-required",
    "scope-confirmed",
    "scope-confirmed"
  ]);
  assert.equal(events[1].assignments[0].agentName, "线索猎人");
  assert.equal(events[2].provider, "抖音账号");
  assert.equal(events.at(-1).browserSessionId, "session-1");
});

test("ClueHunter execution facts become the same progress, outreach, lead, and artifact events as native AG-UI", () => {
  const events = [];
  const adapter = createGatewayEventAdapter({ taskId: "task-cluehunter-1", onEvent: (event) => events.push(event) });

  adapter.accept({
    type: "TASK_EXECUTION_ACCEPTED",
    event_id: "submit-1",
    commandId: "cmd-1",
    queue: "touch",
    status: "WAIT",
    accepted: true
  });
  adapter.accept({
    type: "LEAD_SOURCE_SYNCED",
    event_id: "sync-1",
    source: "cluehunter",
    leadId: "lead-1",
    count: 1,
    resultSnapshot: { source: "cluehunter", counts: { leads: 1 } }
  });
  adapter.accept({ type: "OUTREACH_SENT", event_id: "sent-1", leadId: "lead-1", deliveryState: "submitted" });
  adapter.accept({ type: "LEAD_REPLIED", event_id: "reply-1", leadId: "lead-1", replyText: "想了解方案" });
  adapter.accept({
    type: "RESULT_UPDATED",
    event_id: "result-1",
    resultSnapshot: { source: "cluehunter", counts: { leads: 1, outreach: 1 } },
    artifacts: [{ id: "file-1", name: "线索.csv", type: "sheet" }]
  });

  assert.deepEqual(events.map(({ t }) => t), [
    "dispatch",
    "lead-candidate",
    "outreach-sent",
    "lead-replied",
    "file",
    "result-updated"
  ]);
  assert.equal(events[0].commandId, "cmd-1");
  assert.equal(events[1].source, "cluehunter");
  assert.equal(events[1].resultSnapshot.counts.leads, 1);
  assert.equal(events[2].leadId, "lead-1");
  assert.equal(events[3].replyText, "想了解方案");
  assert.equal(events[4].name, "线索.csv");
  assert.equal(events[5].resultSnapshot.counts.outreach, 1);
});

test("terminal execution errors preserve the upstream code and retry boundary", () => {
  const events = [];
  const adapter = createGatewayEventAdapter({ taskId: "task-cluehunter-error", onEvent: (event) => events.push(event) });
  adapter.accept({
    type: "RUN_ERROR",
    event_id: "error-1",
    error: { code: "RPA_TIMEOUT", message: "平台未返回回执" },
    retryable: true
  });
  assert.equal(events[0].t, "task-error");
  assert.equal(events[0].errorCode, "RPA_TIMEOUT");
  assert.equal(events[0].retryable, true);
});

test("remote agent identifiers stay stable when events arrive out of script order", () => {
  const events = [];
  const adapter = createGatewayEventAdapter({ onEvent: (event) => events.push(event) });

  adapter.accept({ type: "CUSTOM", name: "subagent_start", run_id: "run-6", seq: 1, value: { agentId: "researcher", agentName: "客户研究员", skillId: "research" } });
  adapter.accept({ type: "CUSTOM", name: "subagent_progress", run_id: "run-6", seq: 2, value: { agentId: "researcher", progress: 55, text: "已完成研究" } });

  assert.equal(events[1].agentId, "researcher");
  assert.equal(events[1].i, 0);
  assert.equal(events[1].skillId, "research");
});

test("an unknown remote subagent still gets a visible progress lifecycle", () => {
  const events = [];
  const adapter = createGatewayEventAdapter({ onEvent: (event) => events.push(event) });

  adapter.accept({
    type: "CUSTOM",
    name: "subagent_progress",
    run_id: "run-7",
    seq: 1,
    value: { agentId: "late-agent", agentName: "风控专员", progress: 18, text: "正在检查重复触达" }
  });

  assert.deepEqual(events.map(({ t }) => t), ["sub-start", "sub-accepted", "sub-started", "sub-log"]);
  assert.equal(events.at(-1).agentName, "风控专员");
});
