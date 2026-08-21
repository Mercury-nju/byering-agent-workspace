import assert from "node:assert/strict";
import test from "node:test";

import {
  appendRuntimeEvent,
  createRuntimeTask,
  getRuntimeSnapshot,
  replayRuntimeEvents
} from "../src/salebuddy/runtime/task-runtime.js";

test("runtime task keeps goal, task, plan and professional agent identity separate", () => {
  const runtime = createRuntimeTask({
    taskId: "task-runtime-1",
    taskText: "监控抖音互动并找到高意向买车客户",
    scriptKey: "leads",
    projectId: "room-leads",
    projectName: "潜在客户拓展项目组",
    agent: {
      id: "lead_hunter",
      name: "线索猎人",
      role: "监控互动并推进留资"
    }
  });

  assert.equal(runtime.goal.id, "goal-task-runtime-1");
  assert.equal(runtime.task.id, "task-runtime-1");
  assert.equal(runtime.task.state, "CREATED");
  assert.equal(runtime.snapshot.taskState, "CREATED");
  assert.equal(runtime.plan.version, 1);
  assert.equal(runtime.agentRun.agentId, "lead_hunter");
  assert.equal(runtime.agentRun.name, "线索猎人");
  assert.notEqual(runtime.agentRun.agentId, "Browser Agent");
});

test("runtime attaches canonical agent context while preserving legacy display identity", () => {
  const runtime = createRuntimeTask({
    taskId: "task-runtime-context",
    taskText: "按项目规则找高意向客户",
    scriptKey: "find",
    projectId: "project-context",
    agent: { id: "lead_hunter", name: "线索猎人", role: "发现潜客" },
    memoryRecords: [
      { id: "project-memory", scope: "project", projectId: "project-context", status: "active", summary: "项目筛选规则", relevance: 0.7 },
      { id: "expired-memory", scope: "project", projectId: "project-context", status: "active", expiresAt: "2020-01-01T00:00:00.000Z", summary: "过期规则", relevance: 1 }
    ]
  });

  assert.equal(runtime.agentRun.agentId, "lead_hunter");
  assert.equal(runtime.agentRun.canonicalAgentId, "lead_miner");
  assert.equal(runtime.agentRun.legacyType, "Browser Agent");
  assert.equal(runtime.agentContext.agentId, "lead_miner");
  assert.equal(runtime.agentContext.task.projectId, "project-context");
  assert.deepEqual(runtime.agentContext.relevantMemories.map((item) => item.id), ["project-memory"]);

  appendRuntimeEvent(runtime, {
    t: "sub-started",
    skillId: "discover_prospects",
    agentId: "lead_hunter",
    agentType: "Browser Agent",
    agentName: "线索猎人"
  });

  assert.equal(runtime.events[0].agentId, "lead_miner");
  assert.equal(runtime.events[0].agentType, "Browser Agent");
  assert.equal(runtime.events[0].agentName, "线索猎人");
});

test("runtime confirms requirements and assignment before waiting for access", () => {
  const runtime = createRuntimeTask({ taskId: "task-runtime-access", taskText: "读取抖音互动", scriptKey: "leads" });

  appendRuntimeEvent(runtime, { t: "requirement-required", taskText: "读取抖音互动" });
  assert.equal(runtime.snapshot.taskState, "WAITING_REQUIREMENT");

  appendRuntimeEvent(runtime, { t: "requirement-confirmed", taskText: "读取抖音互动" });
  appendRuntimeEvent(runtime, { t: "assignment-plan", assignments: [{ agentName: "线索猎人", skill: "观察互动" }] });
  assert.equal(runtime.snapshot.taskState, "WAITING_ACCESS");

  appendRuntimeEvent(runtime, { t: "auth-required", provider: "抖音账号" });
  assert.equal(runtime.snapshot.taskState, "WAITING_ACCESS");
  assert.equal(runtime.agentRun.state, "WAITING_ACCESS");

  appendRuntimeEvent(runtime, { t: "scope-confirmed", provider: "抖音账号", scopes: ["直播互动与评论"] });
  assert.equal(runtime.snapshot.taskState, "RUNNING");
});

test("runtime events create a replayable skill snapshot with evidence and approval state", () => {
  const runtime = createRuntimeTask({
    taskId: "task-runtime-2",
    taskText: "找到高意向买车客户",
    scriptKey: "leads",
    agent: { id: "lead_hunter", name: "线索猎人", role: "线索转化" }
  });

  appendRuntimeEvent(runtime, {
    t: "sub-accepted",
    i: 0,
    skillId: "observe_interactions",
    skill: "互动采集",
    executor: "RPA + 线索猎人"
  });
  appendRuntimeEvent(runtime, {
    t: "sub-started",
    i: 0,
    skillId: "observe_interactions",
    skill: "互动采集"
  });
  appendRuntimeEvent(runtime, {
    t: "sub-log",
    i: 0,
    skillId: "observe_interactions",
    skill: "互动采集",
    text: "已同步 3,842 条互动",
    evidence: [{ type: "source", label: "抖音互动同步", ref: "sync-2026-08-11" }]
  });
  appendRuntimeEvent(runtime, {
    t: "sub-done",
    i: 0,
    skillId: "observe_interactions",
    skill: "互动采集"
  });
  appendRuntimeEvent(runtime, {
    t: "approval-show",
    approval: { id: "approval-1", action: "send_dm", state: "PENDING" }
  });

  const snapshot = getRuntimeSnapshot(runtime);
  assert.equal(snapshot.taskState, "WAITING_APPROVAL");
  assert.equal(snapshot.activeSkill.skillId, "observe_interactions");
  assert.equal(snapshot.activeSkill.state, "SUCCEEDED");
  assert.equal(snapshot.activeSkill.evidence[0].ref, "sync-2026-08-11");
  assert.equal(snapshot.approvals[0].action, "send_dm");
  assert.equal(runtime.events[0].sequence, 1);
  assert.equal(runtime.events.at(-1).type, "approval.requested");
});

test("runtime event ids and snapshots are deterministic for the same replay", () => {
  const build = () => {
    const runtime = createRuntimeTask({ taskId: "task-runtime-3", taskText: "检查账号状态", scriptKey: "generic" });
    appendRuntimeEvent(runtime, { t: "progress", pct: 42 });
    appendRuntimeEvent(runtime, { t: "summary" });
    return runtime;
  };

  const first = build();
  const second = build();
  assert.equal(first.task.state, "SUCCEEDED");
  assert.equal(first.agentRun.state, "SUCCEEDED");
  assert.equal(first.plan.state, "COMPLETED");
  assert.deepEqual(first.events.map(({ id, sequence, type, t }) => ({ id, sequence, type, t })), second.events.map(({ id, sequence, type, t }) => ({ id, sequence, type, t })));
  assert.deepEqual(getRuntimeSnapshot(first), getRuntimeSnapshot(second));
});

test("runtime can restore a persisted event stream without executing it again", () => {
  const source = createRuntimeTask({ taskId: "task-runtime-4", taskText: "恢复任务", scriptKey: "leads" });
  appendRuntimeEvent(source, { t: "progress-start" });
  appendRuntimeEvent(source, {
    t: "sub-started",
    i: 0,
    skillId: "observe_interactions",
    skill: "互动采集"
  });
  appendRuntimeEvent(source, { t: "sub-done", i: 0, skillId: "observe_interactions", skill: "互动采集" });
  appendRuntimeEvent(source, { t: "approval-show", approval: { id: "approval-restore", action: "send_dm", state: "PENDING" } });

  const restored = createRuntimeTask({ taskId: "task-runtime-4", taskText: "恢复任务", scriptKey: "leads" });
  replayRuntimeEvents(restored, source.events);

  assert.equal(restored.events.length, source.events.length);
  assert.deepEqual(getRuntimeSnapshot(restored), getRuntimeSnapshot(source));
  assert.equal(restored.events.at(-1).id, "evt-task-runtime-4-0004");
});

test("runtime preserves explicit error and cancellation terminal states", () => {
  const failed = createRuntimeTask({ taskId: "task-runtime-error", taskText: "失败演示" });
  appendRuntimeEvent(failed, { t: "task-error", type: "RUN_ERROR", errorCode: "UPSTREAM_TIMEOUT" });
  assert.equal(failed.snapshot.taskState, "FAILED");
  assert.equal(failed.agentRun.state, "FAILED");

  const blocked = createRuntimeTask({ taskId: "task-runtime-blocked", taskText: "审批演示" });
  appendRuntimeEvent(blocked, { t: "task-blocked", type: "CANCEL", reason: "approval_rejected" });
  assert.equal(blocked.snapshot.taskState, "BLOCKED");
  assert.equal(blocked.plan.state, "ACTIVE");
});

test("runtime snapshot exposes recoverable task, lead and outreach interaction state", () => {
  const runtime = createRuntimeTask({ taskId: "task-runtime-interaction", taskText: "找并触达高意向客户", scriptKey: "leads" });
  appendRuntimeEvent(runtime, { t: "requirement-required" });
  appendRuntimeEvent(runtime, { t: "requirement-confirmed" });
  appendRuntimeEvent(runtime, { t: "progress-start" });
  appendRuntimeEvent(runtime, { t: "lead-qualified", score: 86, tier: "Hot" });
  appendRuntimeEvent(runtime, { t: "outreach-ready" });
  appendRuntimeEvent(runtime, { t: "approval-show", approval: { id: "approval-interaction" } });

  assert.equal(runtime.snapshot.interaction.taskState, "WAITING_APPROVAL");
  assert.equal(runtime.snapshot.interaction.leadState, "QUALIFIED");
  assert.equal(runtime.snapshot.interaction.leadScore, 86);
  assert.equal(runtime.snapshot.interaction.outreachState, "READY");
  assert.equal(runtime.snapshot.interaction.pendingAction, "approval");
});

test("runtime result projection accumulates real lead, outreach, reply and artifact facts", () => {
  const runtime = createRuntimeTask({ taskId: "task-runtime-results", taskText: "同步并触达潜客", scriptKey: "leads" });

  appendRuntimeEvent(runtime, {
    t: "lead-candidate",
    count: 3,
    resultSnapshot: { source: "cluehunter", counts: { leads: 3 } }
  });
  appendRuntimeEvent(runtime, { t: "lead-qualified", leadId: "lead-1", score: 92, tier: "Hot" });
  appendRuntimeEvent(runtime, { t: "outreach-sent", leadId: "lead-1", deliveryState: "submitted" });
  appendRuntimeEvent(runtime, { t: "lead-replied", leadId: "lead-1", replyText: "有兴趣" });
  appendRuntimeEvent(runtime, {
    t: "result-updated",
    resultSnapshot: { source: "cluehunter", counts: { leads: 3, outreach: 1, replies: 1 } },
    artifacts: [{ id: "artifact-1", name: "线索.csv", type: "sheet" }]
  });

  assert.equal(runtime.snapshot.resultSnapshot.source, "cluehunter");
  assert.equal(runtime.snapshot.resultSnapshot.counts.leads, 3);
  assert.equal(runtime.snapshot.resultSnapshot.counts.outreach, 1);
  assert.equal(runtime.snapshot.resultSnapshot.counts.replies, 1);
  assert.equal(runtime.snapshot.resultSnapshot.counts.qualifiedLeads, 1);
  assert.equal(runtime.snapshot.resultSnapshot.metrics.find((item) => item.key === "replies").value, 1);
  assert.equal(runtime.snapshot.artifacts[0].name, "线索.csv");
  assert.ok(runtime.snapshot.evidence.some((item) => item.id === "artifact-1"));
});

test("runtime preserves resolved account identities across replay", () => {
  const runtime = createRuntimeTask({ taskId: "task-runtime-account", taskText: "分析广州黄老板二手车", scriptKey: "find" });

  appendRuntimeEvent(runtime, {
    t: "account-resolved",
    agentId: "acquisition_strategist",
    skillId: "account_resolution",
    account: { uid: "u-1", secId: "sec-1", uniqueId: "89254962461", nickname: "广州黄老板二手车" }
  });

  const restored = createRuntimeTask({ taskId: "task-runtime-account", taskText: "分析广州黄老板二手车", scriptKey: "find" });
  replayRuntimeEvents(restored, runtime.events);
  assert.deepEqual(restored.snapshot.resolvedAccounts, runtime.snapshot.resolvedAccounts);
  assert.equal(restored.snapshot.resolvedAccounts[0].secId, "sec-1");
  assert.equal(restored.events[0].type, "account.resolved");
});

test("runtime owns event identity and replays remote events in order without duplicates", () => {
  const runtime = createRuntimeTask({ taskId: "task-runtime-replay", taskText: "恢复远程任务", scriptKey: "leads" });
  const source = [
    { id: "remote-2", sequence: 2, taskId: "task-runtime-replay", t: "progress", pct: 42 },
    { id: "remote-1", sequence: 1, taskId: "task-runtime-replay", t: "progress-start" },
    { id: "remote-1", sequence: 1, taskId: "task-runtime-replay", t: "progress-start" },
    { id: "foreign", sequence: 3, taskId: "other-task", t: "summary" }
  ];

  replayRuntimeEvents(runtime, source);

  assert.deepEqual(runtime.events.map(({ id }) => id), ["remote-1", "remote-2"]);
  assert.equal(runtime.events[0].taskId, "task-runtime-replay");
  assert.equal(runtime.snapshot.progress, 42);

  const event = appendRuntimeEvent(runtime, { taskId: "spoofed", sequence: 999, type: "client.event", t: "progress", pct: 80 });
  assert.equal(event.taskId, "task-runtime-replay");
  assert.equal(event.sequence, 3);
  assert.equal(event.type, "client.event");
});
