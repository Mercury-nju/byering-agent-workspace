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
  assert.equal(runtime.task.state, "RUNNING");
  assert.equal(runtime.plan.version, 1);
  assert.equal(runtime.agentRun.agentId, "lead_hunter");
  assert.equal(runtime.agentRun.name, "线索猎人");
  assert.notEqual(runtime.agentRun.agentId, "Browser Agent");
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
