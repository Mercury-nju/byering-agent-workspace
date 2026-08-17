import assert from "node:assert/strict";
import test from "node:test";

import { buildApprovalTimeline, buildAssignmentPlan, buildDemoTimeline, DEMO_PACING, DEMO_PROTOCOL_EVENTS, getDemoAccessSetup } from "../src/salebuddy/runtime/demo-timeline.js";
import { getDialogueRuntimeDefinition, getDialogueScript } from "../src/salebuddy/ui/task-runner.js";

test("investor demo timeline exposes the documented run and handoff protocol", () => {
  const taskText = "监控抖音买车线索，完成首轮跟进";
  const script = getDialogueScript("leads", taskText);
  const runtimeDefinition = getDialogueRuntimeDefinition("leads", taskText);
  const timeline = buildDemoTimeline({ taskText, script, runtimeDefinition });
  const protocolTypes = timeline.map((event) => event.protocolType).filter(Boolean);

  for (const type of ["RUN_STARTED", "DISPATCH", "SUB_START", "COMPLETE", "APPROVAL_REQUESTED"]) {
    assert.ok(protocolTypes.includes(type), `missing ${type}`);
  }
  assert.ok(timeline.filter((event) => event.protocolType === "DISPATCH").length >= 4);
  assert.ok(timeline.some((event) => event.conversationId === "demo-conv-lead_hunter-1"));
  assert.ok(DEMO_PROTOCOL_EVENTS.includes("RUN_ERROR"));
  assert.ok(DEMO_PACING > 1 && DEMO_PACING < 1.5);
  const completionEvents = timeline.filter((event) => event.t === "sub-done");
  assert.equal(completionEvents.length, 4);
  assert.ok(completionEvents.every((event) => /^我/u.test(event.text)));
  assert.match(completionEvents[0].text, /3,842|互动/);
});

test("failure demo stops after an executor error and keeps a replayable error envelope", () => {
  const taskText = "模拟失败：核验买车线索并安排到店";
  const script = getDialogueScript("leads", taskText);
  const runtimeDefinition = getDialogueRuntimeDefinition("leads", taskText);
  const timeline = buildDemoTimeline({ taskText, script, runtimeDefinition });

  assert.ok(timeline.some((event) => event.protocolType === "ERROR"));
  assert.ok(timeline.some((event) => event.protocolType === "RUN_ERROR"));
  assert.equal(timeline.some((event) => event.t === "approval-show"), false);
  assert.equal(timeline.some((event) => event.i > 1), false);
});

test("approval branches have explicit terminal semantics", () => {
  const script = getDialogueScript("leads");
  const rejected = buildApprovalTimeline({ approved: false, script });
  const approved = buildApprovalTimeline({ approved: true, script });

  assert.deepEqual(rejected.map((event) => event.protocolType), ["APPROVAL_REJECTED", "CANCEL"]);
  assert.equal(rejected.some((event) => event.t === "summary"), false);
  assert.ok(approved.some((event) => event.protocolType === "RUN_FINISHED"));
  assert.equal(approved.at(-1).t, "summary");
});

test("zero-to-one demo starts with an explicit least-privilege access setup", () => {
  const setup = getDemoAccessSetup("leads");

  assert.equal(setup.provider, "抖音账号");
  assert.match(setup.description, /授权|读取/);
  assert.equal(setup.scopes.length, 3);
  assert.match(setup.scopes.join(" "), /直播|粉丝|私信/);
});

test("pre-execution assignment plan is explicit before any authorization request", () => {
  const script = getDialogueScript("leads", "监控抖音买车线索，完成首轮跟进");
  const runtimeDefinition = getDialogueRuntimeDefinition("leads");
  const assignments = buildAssignmentPlan({ script, runtimeDefinition });

  assert.equal(assignments.length, 4);
  assert.deepEqual(assignments.map((item) => item.agentName), ["线索猎人", "数据分析师", "内容策划", "销售顾问"]);
  assert.ok(assignments.every((item) => item.skill && item.executor && item.role));
  assert.equal(assignments.findIndex((item) => item.agentName === "线索猎人"), 0);
});

test("project assignment plan prefers active project members, including marketplace hires", () => {
  const script = getDialogueScript("leads", "监控抖音买车线索，完成首轮跟进");
  const runtimeDefinition = getDialogueRuntimeDefinition("leads");
  const assignments = buildAssignmentPlan({
    script,
    runtimeDefinition,
    projectMembers: ["main", "mkt-lead-miner", "mkt-follow-up"]
  });

  assert.deepEqual(assignments.map((item) => item.agentType), ["mkt-lead-miner", "mkt-follow-up", "mkt-lead-miner", "mkt-follow-up"]);
  assert.match(assignments[0].agentName, /周砚/);
  assert.match(assignments[1].agentName, /跟跟/);
});
