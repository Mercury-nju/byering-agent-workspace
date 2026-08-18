/**
 * Canonical command, event, and task-state contracts for the Byering runtime.
 *
 * This module is deliberately dependency-free. It validates the boundary where
 * UI/API commands become durable runtime facts and keeps state transitions
 * deterministic so that a worker can replay them without an LLM decision.
 */

export const TASK_STATES = Object.freeze({
  CREATED: "CREATED",
  WAITING_REQUIREMENT: "WAITING_REQUIREMENT",
  WAITING_ACCESS: "WAITING_ACCESS",
  RUNNING: "RUNNING",
  WAITING_APPROVAL: "WAITING_APPROVAL",
  PAUSED: "PAUSED",
  RETRYING: "RETRYING",
  WAITING_REPLY: "WAITING_REPLY",
  HANDOFF_REQUIRED: "HANDOFF_REQUIRED",
  BLOCKED: "BLOCKED",
  SUCCEEDED: "SUCCEEDED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED"
});

export const COMMAND_TYPES = Object.freeze({
  TASK_CREATE: "task.create",
  TASK_START: "task.start",
  CONVERSATION_CREATE: "conversation.create",
  MESSAGE_SEND: "message.send",
  REQUIREMENT_REQUEST: "task.requirement.request",
  REQUIREMENT_EDIT: "task.requirement.edit",
  REQUIREMENT_CONFIRM: "task.requirement.confirm",
  ACCESS_REQUEST: "access.request",
  ACCESS_CANCEL: "access.cancel",
  ACCESS_GRANT: "access.grant",
  APPROVAL_REQUEST: "approval.request",
  APPROVAL_DECISION: "approval.decision",
  PAUSE: "task.pause",
  RESUME: "task.resume",
  RETRY: "task.retry",
  CANCEL: "task.cancel",
  REQUEST_REPLY: "conversation.reply.request",
  REPLY: "conversation.reply",
  HANDOFF: "task.handoff",
  HANDOFF_RESOLVE: "task.handoff.resolve",
  COMPLETE: "task.complete",
  FAIL: "task.fail",
  BLOCK: "task.block"
});

const TASK_STATE_SET = new Set(Object.values(TASK_STATES));
const COMMAND_TYPE_SET = new Set(Object.values(COMMAND_TYPES));
const TERMINAL_STATES = new Set([
  TASK_STATES.SUCCEEDED,
  TASK_STATES.FAILED,
  TASK_STATES.CANCELLED
]);
const HIDDEN_REASONING_KEY = /^(?:analysis|chain[_-]?of[_-]?thought|cot|hidden[_-]?reasoning|internal[_-]?reasoning|reasoning|scratch(?:pad)?|thoughts?|_debug(?:ger)?|llm[_-]?trace)$/i;

const COMMAND_ALIASES = Object.freeze({
  "task.created": COMMAND_TYPES.TASK_CREATE,
  start: COMMAND_TYPES.TASK_START,
  "task.started": COMMAND_TYPES.TASK_START,
  "conversation.created": COMMAND_TYPES.CONVERSATION_CREATE,
  "message.created": COMMAND_TYPES.MESSAGE_SEND,
  "task.requirement.requested": COMMAND_TYPES.REQUIREMENT_REQUEST,
  "task.requirement.edited": COMMAND_TYPES.REQUIREMENT_EDIT,
  "task.requirement.confirmed": COMMAND_TYPES.REQUIREMENT_CONFIRM,
  "requirement.request": COMMAND_TYPES.REQUIREMENT_REQUEST,
  "requirement.confirm": COMMAND_TYPES.REQUIREMENT_CONFIRM,
  "access.authorization_required": COMMAND_TYPES.ACCESS_REQUEST,
  "access.authorization_cancelled": COMMAND_TYPES.ACCESS_CANCEL,
  "access.authorization_granted": COMMAND_TYPES.ACCESS_GRANT,
  "access.requested": COMMAND_TYPES.ACCESS_REQUEST,
  "access.granted": COMMAND_TYPES.ACCESS_GRANT,
  "approval.requested": COMMAND_TYPES.APPROVAL_REQUEST,
  "approval.resolved": COMMAND_TYPES.APPROVAL_DECISION,
  "approval.resolve": COMMAND_TYPES.APPROVAL_DECISION,
  approve: COMMAND_TYPES.APPROVAL_DECISION,
  reject: COMMAND_TYPES.APPROVAL_DECISION,
  pause: COMMAND_TYPES.PAUSE,
  resume: COMMAND_TYPES.RESUME,
  retry: COMMAND_TYPES.RETRY,
  cancel: COMMAND_TYPES.CANCEL,
  "conversation.reply_requested": COMMAND_TYPES.REQUEST_REPLY,
  reply: COMMAND_TYPES.REPLY,
  handoff: COMMAND_TYPES.HANDOFF,
  "human.takeover": COMMAND_TYPES.HANDOFF,
  "handoff.resolve": COMMAND_TYPES.HANDOFF_RESOLVE,
  complete: COMMAND_TYPES.COMPLETE,
  succeed: COMMAND_TYPES.COMPLETE,
  fail: COMMAND_TYPES.FAIL,
  block: COMMAND_TYPES.BLOCK
});

const DECISIONS = Object.freeze({
  APPROVED: "approved",
  REJECTED: "rejected"
});

export class TaskProtocolError extends Error {
  constructor(message, code = "INVALID_PROTOCOL", details = {}) {
    super(message);
    this.name = "TaskProtocolError";
    this.code = code;
    Object.assign(this, details);
  }
}

export class TaskTransitionError extends Error {
  constructor(message, { fromState, commandType, allowed = [] } = {}) {
    super(message);
    this.name = "TaskTransitionError";
    this.code = "INVALID_TASK_TRANSITION";
    this.fromState = fromState;
    this.commandType = commandType;
    this.allowed = Object.freeze([...allowed]);
  }
}

/**
 * Build a canonical command envelope. IDs are intentionally caller-owned: the
 * command store needs stable IDs for idempotency and retries.
 */
export function createCommandEnvelope(input = {}) {
  if (!isRecord(input)) throw new TaskProtocolError("Command must be an object", "INVALID_COMMAND");
  return normalizeCommand({
    schemaVersion: 1,
    ...input,
    createdAt: input.createdAt || new Date().toISOString()
  });
}

/** Normalize a command and migrate the legacy approval `ok` field. */
export function normalizeCommand(input = {}) {
  if (!isRecord(input)) throw new TaskProtocolError("Command must be an object", "INVALID_COMMAND");

  const type = normalizeCommandType(input.type ?? input.commandType);
  const commandId = requireId(input.commandId, "commandId");
  const idempotencyKey = requireId(input.idempotencyKey, "idempotencyKey");
  const taskId = requireId(input.taskId, "taskId");
  const payload = cloneJson(input.payload == null ? {} : input.payload, "payload");
  if (!isRecord(payload)) throw new TaskProtocolError("Command payload must be an object", "INVALID_COMMAND_PAYLOAD");
  rejectHiddenReasoning(payload, "command.payload");

  if (type === COMMAND_TYPES.APPROVAL_DECISION) {
    const legacyOk = input.ok ?? payload.ok;
    const decisionValue = payload.decision ?? input.decision ?? (legacyOk === undefined ? undefined : legacyOk);
    if (decisionValue === undefined) {
      throw new TaskProtocolError("Approval decision requires decision or legacy ok", "APPROVAL_DECISION_REQUIRED");
    }
    payload.decision = normalizeDecision(decisionValue);
    delete payload.ok;
  }

  const envelope = {
    schemaVersion: Number(input.schemaVersion) || 1,
    commandId,
    idempotencyKey,
    taskId,
    taskRunId: optionalId(input.taskRunId ?? input.runId, "taskRunId"),
    conversationId: optionalId(input.conversationId, "conversationId"),
    agentId: optionalId(input.agentId, "agentId"),
    type,
    payload,
    actor: normalizeActor(input.actor),
    createdAt: normalizeTimestamp(input.createdAt, "createdAt"),
    metadata: cloneJson(input.metadata == null ? {} : input.metadata, "metadata")
  };

  return envelope;
}

/**
 * Build an immutable event envelope. Skill IDs are explicit nullable fields so
 * task-level events and skill-level events share one schema without ambiguity.
 */
export function createEventEnvelope(input = {}) {
  if (!isRecord(input)) throw new TaskProtocolError("Event must be an object", "INVALID_EVENT");

  const eventId = requireId(input.eventId ?? input.id, "eventId");
  const seq = normalizeSequence(input.seq ?? input.sequence ?? input.remoteSeq);
  const taskId = requireId(input.taskId, "taskId");
  const taskRunId = requireId(input.taskRunId ?? input.runId, "taskRunId");
  const conversationId = requireId(input.conversationId, "conversationId");
  const agentId = requireId(input.agentId, "agentId");
  const agentRunId = optionalId(input.agentRunId, "agentRunId");
  const type = requireString(input.type, "type");

  if (!("skillId" in input) || !("skillRunId" in input)) {
    throw new TaskProtocolError("Event must include nullable skillId and skillRunId fields", "EVENT_SKILL_FIELDS_REQUIRED");
  }
  const skillId = optionalId(input.skillId, "skillId");
  const skillRunId = optionalId(input.skillRunId, "skillRunId");
  if ((skillId == null) !== (skillRunId == null)) {
    throw new TaskProtocolError("skillId and skillRunId must be provided together", "EVENT_SKILL_FIELDS_MISMATCH");
  }

  const payload = cloneJson(input.payload == null ? {} : input.payload, "payload");
  if (!isRecord(payload)) throw new TaskProtocolError("Event payload must be an object", "INVALID_EVENT_PAYLOAD");
  rejectHiddenReasoning(payload, "event.payload");

  return {
    schemaVersion: Number(input.schemaVersion) || 1,
    eventId,
    seq,
    taskId,
    taskRunId,
    runId: taskRunId,
    conversationId,
    agentId,
    agentRunId,
    skillId,
    skillRunId,
    type,
    payload,
    occurredAt: normalizeTimestamp(input.occurredAt ?? input.createdAt, "occurredAt"),
    metadata: cloneJson(input.metadata == null ? {} : input.metadata, "metadata")
  };
}

/**
 * Return the next task state for a command. This function has no side effects
 * and does not infer decisions from free-form text.
 */
export function transitionTaskState(currentState, command, options = {}) {
  const fromState = normalizeTaskState(currentState);
  const normalized = typeof command === "string"
    ? { type: normalizeCommandType(command), payload: normalizeTransitionPayload(options.payload ?? options) }
    : normalizeTransitionCommand(command);
  const type = normalized.type;
  const payload = normalized.payload || {};
  const next = resolveTransition(fromState, type, payload);
  if (!next) {
    throw new TaskTransitionError(
      `Cannot apply ${type} while task is ${fromState}`,
      { fromState, commandType: type, allowed: allowedCommands(fromState) }
    );
  }
  return next;
}

function resolveTransition(state, type, payload) {
  if (type === COMMAND_TYPES.CANCEL) return TERMINAL_STATES.has(state) ? null : TASK_STATES.CANCELLED;
  if (type === COMMAND_TYPES.PAUSE) return state === TASK_STATES.RUNNING ? TASK_STATES.PAUSED : null;

  switch (type) {
    case COMMAND_TYPES.TASK_START:
      if (state === TASK_STATES.CREATED) return payload.requirementsConfirmed === true ? (payload.requiresAccess === true ? TASK_STATES.WAITING_ACCESS : TASK_STATES.RUNNING) : TASK_STATES.WAITING_REQUIREMENT;
      if (state === TASK_STATES.RETRYING) return TASK_STATES.RUNNING;
      return null;
    case COMMAND_TYPES.REQUIREMENT_REQUEST:
      return [TASK_STATES.CREATED, TASK_STATES.RUNNING].includes(state) ? TASK_STATES.WAITING_REQUIREMENT : null;
    case COMMAND_TYPES.REQUIREMENT_EDIT:
      return [TASK_STATES.CREATED, TASK_STATES.WAITING_REQUIREMENT, TASK_STATES.RUNNING].includes(state) ? TASK_STATES.WAITING_REQUIREMENT : null;
    case COMMAND_TYPES.REQUIREMENT_CONFIRM:
      return state === TASK_STATES.WAITING_REQUIREMENT ? (payload.requiresAccess === true ? TASK_STATES.WAITING_ACCESS : TASK_STATES.RUNNING) : null;
    case COMMAND_TYPES.ACCESS_REQUEST:
      return [TASK_STATES.RUNNING, TASK_STATES.WAITING_ACCESS].includes(state) ? TASK_STATES.WAITING_ACCESS : null;
    case COMMAND_TYPES.ACCESS_CANCEL:
      return state === TASK_STATES.WAITING_ACCESS ? TASK_STATES.WAITING_ACCESS : null;
    case COMMAND_TYPES.ACCESS_GRANT:
      return state === TASK_STATES.WAITING_ACCESS ? TASK_STATES.RUNNING : null;
    case COMMAND_TYPES.APPROVAL_REQUEST:
      return [TASK_STATES.RUNNING, TASK_STATES.RETRYING, TASK_STATES.WAITING_APPROVAL].includes(state) ? TASK_STATES.WAITING_APPROVAL : null;
    case COMMAND_TYPES.APPROVAL_DECISION:
      if (state !== TASK_STATES.WAITING_APPROVAL) return null;
      return normalizeDecision(payload.decision) === DECISIONS.APPROVED ? TASK_STATES.RUNNING : TASK_STATES.WAITING_APPROVAL;
    case COMMAND_TYPES.RESUME:
      return state === TASK_STATES.PAUSED ? TASK_STATES.RUNNING : null;
    case COMMAND_TYPES.RETRY:
      if ([TASK_STATES.FAILED, TASK_STATES.PAUSED].includes(state)) return TASK_STATES.RETRYING;
      return state === TASK_STATES.BLOCKED && payload.retryable === true ? TASK_STATES.RETRYING : null;
    case COMMAND_TYPES.REQUEST_REPLY:
      return state === TASK_STATES.RUNNING ? TASK_STATES.WAITING_REPLY : null;
    case COMMAND_TYPES.REPLY:
      return state === TASK_STATES.WAITING_REPLY ? TASK_STATES.RUNNING : null;
    case COMMAND_TYPES.HANDOFF:
      return [TASK_STATES.RUNNING, TASK_STATES.PAUSED, TASK_STATES.WAITING_REPLY].includes(state) ? TASK_STATES.HANDOFF_REQUIRED : null;
    case COMMAND_TYPES.HANDOFF_RESOLVE:
      return state === TASK_STATES.HANDOFF_REQUIRED ? TASK_STATES.RUNNING : null;
    case COMMAND_TYPES.COMPLETE:
      return [TASK_STATES.RUNNING, TASK_STATES.WAITING_REPLY].includes(state) ? TASK_STATES.SUCCEEDED : null;
    case COMMAND_TYPES.FAIL:
      return [TASK_STATES.RUNNING, TASK_STATES.RETRYING, TASK_STATES.WAITING_REPLY].includes(state) ? TASK_STATES.FAILED : null;
    case COMMAND_TYPES.BLOCK:
      return [TASK_STATES.RUNNING, TASK_STATES.WAITING_REPLY].includes(state) ? TASK_STATES.BLOCKED : null;
    default:
      return null;
  }
}

function normalizeTransitionCommand(command) {
  if (typeof command === "string") return { type: normalizeCommandType(command), payload: {} };
  if (!isRecord(command)) throw new TaskProtocolError("Transition command must be a type or object", "INVALID_TRANSITION_COMMAND");
  const payload = normalizeTransitionPayload(command.payload ?? {});
  if (command.decision !== undefined && payload.decision === undefined) payload.decision = command.decision;
  if (command.ok !== undefined && payload.ok === undefined) payload.ok = command.ok;
  if (payload.ok !== undefined && payload.decision === undefined) payload.decision = normalizeDecision(payload.ok);
  delete payload.ok;
  return {
    type: normalizeCommandType(command.type ?? command.commandType),
    payload
  };
}

function normalizeTransitionPayload(payload) {
  if (payload == null) return {};
  if (!isRecord(payload)) throw new TaskProtocolError("Transition payload must be an object", "INVALID_TRANSITION_PAYLOAD");
  const normalized = cloneJson(payload, "transition.payload");
  rejectHiddenReasoning(normalized, "transition.payload");
  return normalized;
}

function allowedCommands(state) {
  return Object.values(COMMAND_TYPES).filter((type) => Boolean(resolveTransition(state, type, type === COMMAND_TYPES.APPROVAL_DECISION ? { decision: DECISIONS.APPROVED } : {})));
}

function normalizeCommandType(value) {
  const raw = requireString(value, "command type");
  if (COMMAND_TYPE_SET.has(raw)) return raw;
  const alias = COMMAND_ALIASES[raw] || COMMAND_ALIASES[raw.toLowerCase()];
  if (alias) return alias;
  throw new TaskProtocolError(`Unknown command type: ${raw}`, "UNKNOWN_COMMAND_TYPE");
}

function normalizeDecision(value) {
  if (value === true || ["approved", "approve", "approved_by_user", "ok", "yes"].includes(String(value).trim().toLowerCase())) return DECISIONS.APPROVED;
  if (value === false || ["rejected", "reject", "rejected_by_user", "no", "cancel"].includes(String(value).trim().toLowerCase())) return DECISIONS.REJECTED;
  throw new TaskProtocolError(`Invalid approval decision: ${String(value)}`, "INVALID_APPROVAL_DECISION");
}

function normalizeTaskState(value) {
  const state = requireString(value, "currentState").toUpperCase();
  if (!TASK_STATE_SET.has(state)) throw new TaskProtocolError(`Unknown task state: ${state}`, "UNKNOWN_TASK_STATE");
  return state;
}

function normalizeActor(actor) {
  if (actor == null) return null;
  if (typeof actor === "string") return requireId(actor, "actor");
  if (!isRecord(actor)) throw new TaskProtocolError("actor must be a string or object", "INVALID_ACTOR");
  return cloneJson(actor, "actor");
}

function normalizeSequence(value) {
  if (!Number.isInteger(value) || value < 1) throw new TaskProtocolError("seq must be an integer greater than zero", "INVALID_SEQUENCE");
  return value;
}

function requireId(value, field) {
  return requireString(value, field);
}

function optionalId(value, field) {
  if (value == null || value === "") return null;
  return requireString(value, field);
}

function requireString(value, field) {
  if (typeof value !== "string" || !value.trim()) throw new TaskProtocolError(`${field} is required`, "REQUIRED_FIELD", { field });
  return value.trim();
}

function normalizeTimestamp(value, field) {
  const timestamp = value == null ? new Date().toISOString() : value;
  if (typeof timestamp !== "string" || !Number.isFinite(Date.parse(timestamp))) {
    throw new TaskProtocolError(`${field} must be an ISO timestamp`, "INVALID_TIMESTAMP", { field });
  }
  return new Date(timestamp).toISOString();
}

function cloneJson(value, field) {
  if (value == null) return value;
  if (typeof value !== "object") throw new TaskProtocolError(`${field} must be JSON-compatible`, "INVALID_JSON_VALUE", { field });
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    throw new TaskProtocolError(`${field} must be JSON-compatible: ${error.message}`, "INVALID_JSON_VALUE", { field });
  }
}

function rejectHiddenReasoning(value, path) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectHiddenReasoning(item, `${path}[${index}]`));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (HIDDEN_REASONING_KEY.test(key)) {
      throw new TaskProtocolError(`Hidden reasoning field is not allowed: ${path}.${key}`, "HIDDEN_REASONING_FIELD", { path: `${path}.${key}` });
    }
    rejectHiddenReasoning(child, `${path}.${key}`);
  }
}

function isRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export { DECISIONS as APPROVAL_DECISIONS };
