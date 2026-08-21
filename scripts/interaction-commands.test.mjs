import assert from "node:assert/strict";
import test from "node:test";

import {
  INTERACTION_COMMANDS,
  canIssueInteractionCommand,
  createInteractionCommand,
  localEventForInteractionCommand
} from "../src/salebuddy/runtime/interaction-commands.js";

test("interaction commands carry task identity and idempotency metadata", () => {
  const command = createInteractionCommand("retry", {
    taskId: "task-command-1",
    runId: "run-1",
    stepId: "observe_interactions",
    commandId: "cmd-fixed-1"
  });

  assert.equal(command.action, INTERACTION_COMMANDS.RETRY);
  assert.equal(command.taskId, "task-command-1");
  assert.equal(command.runId, "run-1");
  assert.equal(command.stepId, "observe_interactions");
  assert.equal(command.commandId, "cmd-fixed-1");
  assert.equal(command.idempotencyKey, "cmd-fixed-1");
});

test("available commands follow the recoverable interaction state", () => {
  assert.equal(canIssueInteractionCommand({ taskState: "RUNNING" }, "pause"), true);
  assert.equal(canIssueInteractionCommand({ taskState: "PAUSED" }, "resume"), true);
  assert.equal(canIssueInteractionCommand({ taskState: "FAILED", retryable: true }, "retry"), true);
  assert.equal(canIssueInteractionCommand({ taskState: "FAILED", retryable: false }, "retry"), false);
  assert.equal(canIssueInteractionCommand({ taskState: "SUCCEEDED" }, "cancel"), false);
  assert.equal(canIssueInteractionCommand({ taskState: "HANDOFF" }, "handoff"), false);
  assert.equal(canIssueInteractionCommand({ taskState: "WAITING_ACCESS" }, "handoff"), true);
  assert.equal(canIssueInteractionCommand({ taskState: "BLOCKED", leadState: "DO_NOT_CONTACT", riskState: "REJECT" }, "resume"), false);
});

test("local commands map to visible state events", () => {
  assert.deepEqual(localEventForInteractionCommand("pause", { reason: "用户暂停" }), { t: "task-paused", reason: "用户暂停" });
  assert.deepEqual(localEventForInteractionCommand("resume"), { t: "task-resumed" });
  assert.deepEqual(localEventForInteractionCommand("retry", { stepId: "step-1" }), { t: "task-retry-requested", stepId: "step-1" });
  assert.deepEqual(localEventForInteractionCommand("handoff", { reason: "投诉" }), { t: "handoff", reason: "投诉" });
  assert.deepEqual(localEventForInteractionCommand("cancel"), { t: "task-cancelled", reason: "cancelled" });
});
