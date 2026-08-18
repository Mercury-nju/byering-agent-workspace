import { randomUUID } from "node:crypto";
import {
  COMMAND_TYPES,
  TASK_STATES,
  createCommandEnvelope,
  createEventEnvelope,
  transitionTaskState
} from "../src/salebuddy/runtime/task-protocol.js";
import { MemoryPersistenceAdapter } from "./persistence.js";

const API_COMMAND_ALIASES = Object.freeze({
  "task.run.start": COMMAND_TYPES.TASK_START,
  "task.requirement.confirm": COMMAND_TYPES.REQUIREMENT_CONFIRM,
  "task.requirement.edit": COMMAND_TYPES.REQUIREMENT_EDIT,
  "access.authorization.start": COMMAND_TYPES.ACCESS_REQUEST,
  "access.authorization.cancel": COMMAND_TYPES.ACCESS_CANCEL,
  "access.scope.confirm": COMMAND_TYPES.ACCESS_GRANT,
  "approval.action.request": COMMAND_TYPES.APPROVAL_REQUEST,
  "approval.action.respond": COMMAND_TYPES.APPROVAL_DECISION,
  "task.followup.send": COMMAND_TYPES.REPLY
});

const EVENT_TYPES = Object.freeze({
  [COMMAND_TYPES.TASK_START]: "task.run.started",
  [COMMAND_TYPES.REQUIREMENT_REQUEST]: "task.requirement.requested",
  [COMMAND_TYPES.REQUIREMENT_EDIT]: "task.requirement.edited",
  [COMMAND_TYPES.REQUIREMENT_CONFIRM]: "task.requirement.confirmed",
  [COMMAND_TYPES.ACCESS_REQUEST]: "access.authorization.requested",
  [COMMAND_TYPES.ACCESS_CANCEL]: "access.authorization.cancelled",
  [COMMAND_TYPES.ACCESS_GRANT]: "access.authorization.granted",
  [COMMAND_TYPES.APPROVAL_REQUEST]: "approval.requested",
  [COMMAND_TYPES.APPROVAL_DECISION]: "approval.resolved",
  [COMMAND_TYPES.PAUSE]: "task.paused",
  [COMMAND_TYPES.RESUME]: "task.resumed",
  [COMMAND_TYPES.RETRY]: "task.retrying",
  [COMMAND_TYPES.CANCEL]: "task.cancelled",
  [COMMAND_TYPES.REQUEST_REPLY]: "conversation.reply.requested",
  [COMMAND_TYPES.REPLY]: "conversation.reply.received",
  [COMMAND_TYPES.HANDOFF]: "task.handoff.requested",
  [COMMAND_TYPES.HANDOFF_RESOLVE]: "task.handoff.resolved",
  [COMMAND_TYPES.COMPLETE]: "task.completed",
  [COMMAND_TYPES.FAIL]: "task.failed",
  [COMMAND_TYPES.BLOCK]: "task.blocked"
});

export class ControlPlaneError extends Error {
  constructor(message, { code = "CONTROL_PLANE_ERROR", statusCode = 400, details = {} } = {}) {
    super(message);
    this.name = "ControlPlaneError";
    this.code = code;
    this.statusCode = statusCode;
    Object.assign(this, details);
  }
}

/**
 * Authoritative task command store. It is synchronous by design for the
 * in-memory adapter; a durable adapter may be introduced behind this boundary.
 */
export class ControlPlane {
  constructor({ persistence = new MemoryPersistenceAdapter(), idFactory, now = () => new Date().toISOString(), defaultAgentId = "chief_of_staff" } = {}) {
    this.persistence = persistence;
    this.idFactory = typeof idFactory === "function" ? idFactory : () => randomUUID();
    this.now = now;
    this.defaultAgentId = defaultAgentId;
    this.listeners = new Map();
  }

  dispatch(input = {}) {
    const type = normalizeApiType(input.type ?? input.commandType);
    const inputPayload = type === COMMAND_TYPES.TASK_START && input.taskId
      ? enrichStartPayload(this.persistence.loadTask(input.taskId), input.payload)
      : input.payload;
    let command;
    try {
      command = createCommandEnvelope({
        ...input,
        type,
        ...(inputPayload === undefined ? {} : { payload: inputPayload }),
        commandId: input.commandId || this.makeId("cmd"),
        idempotencyKey: input.idempotencyKey || this.makeId("idem"),
        createdAt: input.createdAt || this.now()
      });
    } catch (error) {
      throw new ControlPlaneError(error.message, {
        code: error.code || "INVALID_COMMAND",
        statusCode: 400,
        details: { field: error.field }
      });
    }

    const fingerprint = stableStringify({
      schemaVersion: command.schemaVersion,
      idempotencyKey: command.idempotencyKey,
      taskId: command.taskId,
      taskRunId: command.taskRunId,
      conversationId: command.conversationId,
      agentId: command.agentId,
      expectedVersion: command.expectedVersion,
      causationId: command.causationId,
      correlationId: command.correlationId,
      type: command.type,
      payload: command.payload,
      actor: command.actor,
      metadata: command.metadata
    });
    const prior = this.persistence.loadCommand(command.idempotencyKey);
    if (prior) {
      if (prior.fingerprint !== fingerprint) {
        throw new ControlPlaneError("Idempotency key is already used for a different command", {
          code: "IDEMPOTENCY_CONFLICT",
          statusCode: 409,
          details: { commandId: command.commandId, idempotencyKey: command.idempotencyKey }
        });
      }
      return clone(prior.ack);
    }

    let ack;
    try {
      ack = this.apply(command);
    } catch (error) {
      if (error instanceof ControlPlaneError) throw error;
      throw new ControlPlaneError(error.message, {
        code: error.code || "COMMAND_REJECTED",
        statusCode: error.code === "STALE_TASK_VERSION" ? 409 : 422,
        details: { commandId: command.commandId }
      });
    }
    this.persistence.saveCommand(command.idempotencyKey, { fingerprint, ack });
    return clone(ack);
  }

  getTaskSnapshot(taskId) {
    const task = this.requireTask(taskId);
    return clone({
      taskId: task.taskId,
      taskRunId: task.taskRunId,
      conversationId: task.conversationId,
      goal: task.goal,
      state: task.state,
      version: task.version,
      currentSeq: task.currentSeq,
      agentId: task.agentId,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      requirements: task.requirements,
      pendingApproval: task.pendingApproval,
      lastCommandId: task.lastCommandId
    });
  }

  listTaskEvents(taskId, options = {}) {
    this.requireTask(taskId);
    return this.persistence.listEvents(taskId, options).map(clone);
  }

  subscribe(taskId, listener) {
    if (typeof listener !== "function") throw new TypeError("listener must be a function");
    this.requireTask(taskId);
    const listeners = this.listeners.get(taskId) || new Set();
    listeners.add(listener);
    this.listeners.set(taskId, listeners);
    return () => {
      listeners.delete(listener);
      if (!listeners.size) this.listeners.delete(taskId);
    };
  }

  apply(command) {
    if (command.type === COMMAND_TYPES.TASK_CREATE) return this.createTask(command);
    if (command.type === COMMAND_TYPES.CONVERSATION_CREATE) return this.createConversation(command);
    if (command.type === COMMAND_TYPES.MESSAGE_SEND) return this.sendMessage(command);

    const task = this.requireTask(command.taskId);
    const fromState = task.state;
    const nextState = transitionTaskState(fromState, command, { currentVersion: task.version });
    task.state = nextState;
    task.version += 1;
    task.updatedAt = this.now();
    task.lastCommandId = command.commandId;
    this.applyTaskMetadata(task, command);
    const event = this.appendTaskEvent(task, command, EVENT_TYPES[command.type] || "task.command.applied", {
      commandType: command.type,
      fromState,
      state: nextState,
      version: task.version,
      ...command.payload
    });
    return this.ack(command, task, event, { previousState: fromState });
  }

  createTask(command) {
    const taskId = command.taskId || this.makeId("task");
    if (this.persistence.loadTask(taskId)) {
      throw new ControlPlaneError("Task already exists", { code: "TASK_ALREADY_EXISTS", statusCode: 409, details: { taskId } });
    }
    const taskRunId = command.taskRunId || this.makeId("run");
    const conversationId = command.conversationId || this.makeId("conv");
    const createdAt = this.now();
    const task = {
      taskId,
      taskRunId,
      conversationId,
      goal: command.payload.goal ?? command.payload.objective ?? command.payload.input,
      state: TASK_STATES.CREATED,
      version: 0,
      currentSeq: 0,
      agentId: command.agentId || this.defaultAgentId,
      createdAt,
      updatedAt: createdAt,
      requirements: { confirmed: false },
      pendingApproval: null,
      lastCommandId: command.commandId
    };
    this.persistence.saveTask(task);
    const event = this.appendTaskEvent(task, command, "task.created", {
      commandType: command.type,
      state: task.state,
      version: task.version,
      goal: task.goal
    });
    return this.ack(command, task, event);
  }

  createConversation(command) {
    const conversationId = command.conversationId || this.makeId("conv");
    return {
      accepted: true,
      commandId: command.commandId,
      conversationId,
      currentSeq: null,
      currentVersion: null,
      data: { conversationId }
    };
  }

  sendMessage(command) {
    const task = command.taskId ? this.requireTask(command.taskId) : null;
    let event = null;
    if (task) {
      event = this.appendTaskEvent(task, command, "conversation.message.sent", {
        commandType: command.type,
        ...command.payload
      });
      task.updatedAt = this.now();
      task.lastCommandId = command.commandId;
      this.persistence.saveTask(task);
    }
    return this.ack(command, task, event, { data: { conversationId: command.conversationId } });
  }

  applyTaskMetadata(task, command) {
    if (command.type === COMMAND_TYPES.REQUIREMENT_CONFIRM) task.requirements.confirmed = true;
    if (command.type === COMMAND_TYPES.REQUIREMENT_EDIT) {
      const value = command.payload.text ?? command.payload.goal ?? command.payload.objective ?? command.payload.input;
      task.goal = value;
      task.requirements.confirmed = false;
    }
    if (command.type === COMMAND_TYPES.APPROVAL_REQUEST) task.pendingApproval = clone(command.payload);
    if (command.type === COMMAND_TYPES.APPROVAL_DECISION) task.pendingApproval = null;
  }

  appendTaskEvent(task, command, type, payload) {
    const event = createEventEnvelope({
      schemaVersion: 1,
      eventId: this.makeId("evt"),
      seq: task.currentSeq + 1,
      taskId: task.taskId,
      taskRunId: task.taskRunId,
      conversationId: task.conversationId,
      agentId: command.agentId || task.agentId || this.defaultAgentId,
      agentRunId: null,
      skillId: null,
      skillRunId: null,
      causationId: command.commandId,
      correlationId: command.correlationId || command.commandId,
      type,
      occurredAt: this.now(),
      payload
    });
    task.currentSeq = event.seq;
    this.persistence.appendEvent(task.taskId, event);
    this.persistence.saveTask(task);
    const listeners = this.listeners.get(task.taskId);
    if (listeners) listeners.forEach((listener) => listener(clone(event)));
    return event;
  }

  ack(command, task, event, extra = {}) {
    return {
      accepted: true,
      commandId: command.commandId,
      idempotencyKey: command.idempotencyKey,
      taskId: task?.taskId || command.taskId || null,
      taskRunId: task?.taskRunId || command.taskRunId || null,
      conversationId: task?.conversationId || command.conversationId || null,
      state: task?.state || null,
      currentVersion: task?.version ?? null,
      currentSeq: event?.seq ?? task?.currentSeq ?? null,
      data: extra.data || null,
      previousState: extra.previousState || null
    };
  }

  requireTask(taskId) {
    if (typeof taskId !== "string" || !taskId.trim()) {
      throw new ControlPlaneError("taskId is required", { code: "TASK_ID_REQUIRED", statusCode: 400 });
    }
    const task = this.persistence.loadTask(taskId);
    if (!task) throw new ControlPlaneError("Task not found", { code: "TASK_NOT_FOUND", statusCode: 404, details: { taskId } });
    return task;
  }

  makeId(prefix) {
    return `${prefix}-${this.idFactory()}`;
  }
}

function enrichStartPayload(task, payload) {
  if (!task || !payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  const hasInput = ["goal", "objective", "input", "planVersion"].some((key) => payload[key] !== undefined && payload[key] !== null && payload[key] !== "");
  return hasInput ? payload : { ...payload, goal: task.goal };
}

export function createControlPlane(options = {}) {
  return new ControlPlane(options);
}

export function normalizeApiType(type) {
  if (typeof type !== "string" || !type.trim()) {
    throw new ControlPlaneError("Command type is required", { code: "COMMAND_TYPE_REQUIRED", statusCode: 400 });
  }
  return API_COMMAND_ALIASES[type.trim()] || type.trim();
}

function clone(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
