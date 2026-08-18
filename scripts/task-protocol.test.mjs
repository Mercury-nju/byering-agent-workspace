import assert from "node:assert/strict";
import test from "node:test";

import {
  APPROVAL_DECISIONS,
  COMMAND_TYPES,
  TASK_STATES,
  TaskProtocolError,
  TaskTransitionError,
  createCommandEnvelope,
  createEventEnvelope,
  normalizeCommand,
  transitionTaskState
} from "../src/salebuddy/runtime/task-protocol.js";

const ids = {
  commandId: "cmd-1",
  idempotencyKey: "idem-1",
  taskId: "task-1",
  taskRunId: "run-1",
  conversationId: "conversation-1",
  agentId: "chief_of_staff"
};

test("command envelope is canonical and migrates legacy approval ok", () => {
  const command = createCommandEnvelope({
    ...ids,
    type: "approval.resolved",
    payload: { ok: true, approvalId: "approval-1" },
    createdAt: "2026-08-19T00:00:00.000Z"
  });

  assert.equal(command.type, COMMAND_TYPES.APPROVAL_DECISION);
  assert.equal(command.payload.decision, APPROVAL_DECISIONS.APPROVED);
  assert.equal("ok" in command.payload, false);
  assert.equal(command.taskRunId, "run-1");
  assert.equal(command.createdAt, "2026-08-19T00:00:00.000Z");
});

test("command envelope rejects null input and exposes creation/message/access commands", () => {
  assert.throws(() => createCommandEnvelope(null), (error) => error.code === "INVALID_COMMAND");
  assert.equal(normalizeCommand({ ...ids, type: "task.created" }).type, COMMAND_TYPES.TASK_CREATE);
  assert.equal(normalizeCommand({ ...ids, type: "message.created" }).type, COMMAND_TYPES.MESSAGE_SEND);
  assert.equal(normalizeCommand({ ...ids, type: "access.authorization_cancelled" }).type, COMMAND_TYPES.ACCESS_CANCEL);
  assert.equal(normalizeCommand({ ...ids, runId: "legacy-run", taskRunId: undefined, type: COMMAND_TYPES.TASK_START }).taskRunId, "legacy-run");
});

test("command normalization rejects missing identity and hidden reasoning", () => {
  assert.throws(() => normalizeCommand({ type: COMMAND_TYPES.TASK_START, taskId: "task-1" }), (error) => {
    assert.ok(error instanceof TaskProtocolError);
    assert.equal(error.code, "REQUIRED_FIELD");
    return true;
  });

  assert.throws(() => normalizeCommand({
    ...ids,
    type: COMMAND_TYPES.TASK_START,
    payload: { reasoning: "internal chain" }
  }), (error) => error.code === "HIDDEN_REASONING_FIELD");
});

test("event envelope keeps operational payload isolated and requires skill fields", () => {
  const sourcePayload = { leadIds: ["lead-1"], summary: { value: "qualified" } };
  const event = createEventEnvelope({
    eventId: "event-1",
    seq: 1,
    taskId: "task-1",
    taskRunId: "run-1",
    conversationId: "conversation-1",
    agentId: "lead_analyst",
    skillId: "score_leads",
    skillRunId: "skill-run-1",
    type: "lead.qualified",
    payload: sourcePayload,
    occurredAt: "2026-08-19T00:00:00.000Z"
  });

  sourcePayload.summary.value = "mutated";
  assert.equal(event.payload.summary.value, "qualified");
  assert.equal(event.runId, "run-1");
  assert.equal(event.skillRunId, "skill-run-1");
  assert.equal("payload" in event, true);
  assert.equal("leadIds" in event, false);

  assert.throws(() => createEventEnvelope({
    eventId: "event-2",
    seq: 2,
    taskId: "task-1",
    taskRunId: "run-1",
    conversationId: "conversation-1",
    agentId: "lead_analyst",
    type: "lead.qualified",
    payload: {}
  }), (error) => error.code === "EVENT_SKILL_FIELDS_REQUIRED");
});

test("event envelope rejects invalid sequence and hidden reasoning keys", () => {
  const base = {
    eventId: "event-1",
    seq: 1,
    taskId: "task-1",
    taskRunId: "run-1",
    conversationId: "conversation-1",
    agentId: "chief_of_staff",
    skillId: null,
    skillRunId: null,
    type: "task.progress"
  };
  assert.throws(() => createEventEnvelope({ ...base, seq: 0, payload: {} }), (error) => error.code === "INVALID_SEQUENCE");
  assert.throws(() => createEventEnvelope({ ...base, payload: { nested: { chainOfThought: "hidden" } } }), (error) => error.code === "HIDDEN_REASONING_FIELD");
  const legacySequence = createEventEnvelope({ ...base, seq: undefined, sequence: 3, agentRunId: "agent-run-1", payload: {} });
  assert.equal(legacySequence.seq, 3);
  assert.equal(legacySequence.agentRunId, "agent-run-1");
});

test("task state transitions cover requirement, access, approval, pause, retry, reply and handoff", () => {
  assert.equal(transitionTaskState(TASK_STATES.CREATED, { type: COMMAND_TYPES.TASK_START, payload: {} }), TASK_STATES.WAITING_REQUIREMENT);
  assert.equal(transitionTaskState(TASK_STATES.WAITING_REQUIREMENT, { type: COMMAND_TYPES.REQUIREMENT_CONFIRM, payload: { requiresAccess: true } }), TASK_STATES.WAITING_ACCESS);
  assert.equal(transitionTaskState(TASK_STATES.WAITING_ACCESS, COMMAND_TYPES.ACCESS_GRANT), TASK_STATES.RUNNING);
  assert.equal(transitionTaskState(TASK_STATES.RUNNING, COMMAND_TYPES.APPROVAL_REQUEST), TASK_STATES.WAITING_APPROVAL);
  assert.equal(transitionTaskState(TASK_STATES.WAITING_APPROVAL, { type: COMMAND_TYPES.APPROVAL_DECISION, payload: { decision: "approved" } }), TASK_STATES.RUNNING);
  assert.equal(transitionTaskState(TASK_STATES.WAITING_APPROVAL, { type: COMMAND_TYPES.APPROVAL_DECISION, ok: false }), TASK_STATES.WAITING_APPROVAL);
  assert.equal(transitionTaskState(TASK_STATES.RUNNING, COMMAND_TYPES.PAUSE), TASK_STATES.PAUSED);
  assert.equal(transitionTaskState(TASK_STATES.PAUSED, COMMAND_TYPES.RETRY), TASK_STATES.RETRYING);
  assert.equal(transitionTaskState(TASK_STATES.RETRYING, COMMAND_TYPES.TASK_START), TASK_STATES.RUNNING);
  assert.equal(transitionTaskState(TASK_STATES.RUNNING, COMMAND_TYPES.REQUEST_REPLY), TASK_STATES.WAITING_REPLY);
  assert.equal(transitionTaskState(TASK_STATES.WAITING_REPLY, COMMAND_TYPES.REPLY), TASK_STATES.RUNNING);
  assert.equal(transitionTaskState(TASK_STATES.RUNNING, COMMAND_TYPES.HANDOFF), TASK_STATES.HANDOFF_REQUIRED);
  assert.equal(transitionTaskState(TASK_STATES.HANDOFF_REQUIRED, COMMAND_TYPES.HANDOFF_RESOLVE), TASK_STATES.RUNNING);
  assert.equal(transitionTaskState(TASK_STATES.RUNNING, COMMAND_TYPES.COMPLETE), TASK_STATES.SUCCEEDED);
});

test("invalid and terminal transitions are explicit errors", () => {
  assert.throws(() => transitionTaskState(TASK_STATES.CREATED, COMMAND_TYPES.COMPLETE), (error) => {
    assert.ok(error instanceof TaskTransitionError);
    assert.equal(error.fromState, TASK_STATES.CREATED);
    assert.equal(error.commandType, COMMAND_TYPES.COMPLETE);
    assert.ok(Array.isArray(error.allowed));
    return true;
  });
  assert.throws(() => transitionTaskState(TASK_STATES.SUCCEEDED, COMMAND_TYPES.PAUSE), TaskTransitionError);
  assert.equal(transitionTaskState(TASK_STATES.RUNNING, COMMAND_TYPES.CANCEL), TASK_STATES.CANCELLED);
  assert.throws(() => transitionTaskState(TASK_STATES.CREATED, COMMAND_TYPES.PAUSE), TaskTransitionError);
  assert.throws(() => transitionTaskState(TASK_STATES.WAITING_REQUIREMENT, COMMAND_TYPES.ACCESS_REQUEST), TaskTransitionError);
  assert.throws(() => transitionTaskState(TASK_STATES.WAITING_APPROVAL, COMMAND_TYPES.REQUEST_REPLY), TaskTransitionError);
  assert.throws(() => transitionTaskState(TASK_STATES.WAITING_REPLY, COMMAND_TYPES.RESUME), TaskTransitionError);
  assert.throws(() => transitionTaskState(TASK_STATES.HANDOFF_REQUIRED, COMMAND_TYPES.TASK_START), TaskTransitionError);
  assert.equal(transitionTaskState(TASK_STATES.WAITING_ACCESS, COMMAND_TYPES.ACCESS_CANCEL), TASK_STATES.WAITING_ACCESS);
  assert.equal(transitionTaskState(TASK_STATES.WAITING_REQUIREMENT, COMMAND_TYPES.REQUIREMENT_EDIT), TASK_STATES.WAITING_REQUIREMENT);
  assert.equal(transitionTaskState(TASK_STATES.CREATED, { type: COMMAND_TYPES.TASK_START, payload: { requirementsConfirmed: "false", requiresAccess: true } }), TASK_STATES.WAITING_REQUIREMENT);
  assert.equal(transitionTaskState(TASK_STATES.WAITING_APPROVAL, { type: COMMAND_TYPES.APPROVAL_DECISION, payload: { decision: "rejected" } }), TASK_STATES.WAITING_APPROVAL);
  assert.throws(() => transitionTaskState(TASK_STATES.WAITING_APPROVAL, COMMAND_TYPES.RESUME), TaskTransitionError);
  assert.throws(() => transitionTaskState(TASK_STATES.WAITING_ACCESS, COMMAND_TYPES.RETRY), TaskTransitionError);
  assert.throws(() => transitionTaskState(TASK_STATES.HANDOFF_REQUIRED, COMMAND_TYPES.RETRY), TaskTransitionError);
  assert.throws(() => transitionTaskState(TASK_STATES.BLOCKED, COMMAND_TYPES.RETRY), TaskTransitionError);
  assert.equal(transitionTaskState(TASK_STATES.BLOCKED, { type: COMMAND_TYPES.RETRY, payload: { retryable: true } }), TASK_STATES.RETRYING);
});
