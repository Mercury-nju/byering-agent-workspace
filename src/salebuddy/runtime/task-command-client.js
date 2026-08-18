import {
  COMMAND_TYPES,
  createCommandEnvelope,
  normalizeCommand
} from "./task-protocol.js";

/** Map canonical protocol commands to the existing Gateway action namespace. */
export const TASK_COMMAND_ACTIONS = Object.freeze({
  [COMMAND_TYPES.TASK_CREATE]: "task.create",
  [COMMAND_TYPES.TASK_START]: "task.run.start",
  [COMMAND_TYPES.CONVERSATION_CREATE]: "conversation.create",
  [COMMAND_TYPES.MESSAGE_SEND]: "message.send",
  [COMMAND_TYPES.REQUIREMENT_REQUEST]: "task.requirement.request",
  [COMMAND_TYPES.REQUIREMENT_EDIT]: "task.requirement.edit",
  [COMMAND_TYPES.REQUIREMENT_CONFIRM]: "task.requirement.confirm",
  [COMMAND_TYPES.ACCESS_REQUEST]: "access.authorization.start",
  [COMMAND_TYPES.ACCESS_CANCEL]: "access.authorization.cancel",
  [COMMAND_TYPES.ACCESS_GRANT]: "access.scope.confirm",
  [COMMAND_TYPES.APPROVAL_REQUEST]: "approval.action.request",
  [COMMAND_TYPES.APPROVAL_DECISION]: "approval.action.respond",
  [COMMAND_TYPES.PAUSE]: "task.pause",
  [COMMAND_TYPES.RESUME]: "task.resume",
  [COMMAND_TYPES.RETRY]: "task.retry",
  [COMMAND_TYPES.CANCEL]: "task.cancel",
  [COMMAND_TYPES.REQUEST_REPLY]: "conversation.reply.request",
  [COMMAND_TYPES.REPLY]: "task.followup.send",
  [COMMAND_TYPES.HANDOFF]: "task.handoff",
  [COMMAND_TYPES.HANDOFF_RESOLVE]: "task.handoff.resolve",
  [COMMAND_TYPES.COMPLETE]: "task.complete",
  [COMMAND_TYPES.FAIL]: "task.fail",
  [COMMAND_TYPES.BLOCK]: "task.block"
});

export class TaskCommandClientError extends Error {
  constructor(message, { code = "COMMAND_FAILED", command, cause } = {}) {
    super(message);
    this.name = "TaskCommandClientError";
    this.code = code;
    this.command = command;
    this.cause = cause;
  }
}

/**
 * Create the one command path used by UI controls and future server adapters.
 * The Gateway remains injectable so this module is testable without a socket.
 */
export function createTaskCommandClient({ gateway, actor = null, idFactory } = {}) {
  if (!gateway || typeof gateway.action !== "function") {
    throw new TypeError("Task command client requires a gateway.action function");
  }

  const pending = new Map();
  let sequence = 0;

  async function send(type, input = {}, options = {}) {
    const requestSequence = ++sequence;
    const command = normalizeCommand({
      ...input,
      type,
      commandId: input.commandId || makeId("cmd", requestSequence, idFactory),
      idempotencyKey: input.idempotencyKey || makeId("idem", requestSequence, idFactory),
      actor: input.actor ?? actor
    });
    const action = TASK_COMMAND_ACTIONS[command.type];
    if (!action) throw new TaskCommandClientError(`No Gateway action for ${command.type}`, { code: "UNMAPPED_COMMAND", command });

    const fingerprint = commandFingerprint(command);
    const existing = pending.get(command.idempotencyKey);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        throw new TaskCommandClientError("Idempotency key is already used for a different command", {
          code: "IDEMPOTENCY_CONFLICT",
          command
        });
      }
      return existing.promise;
    }

    let gatewayResponse;
    try {
      gatewayResponse = gateway.action(action, {
        ...command.payload,
        commandId: command.commandId,
        idempotencyKey: command.idempotencyKey,
        taskId: command.taskId,
        taskRunId: command.taskRunId,
        runId: command.taskRunId,
        conversationId: command.conversationId,
        agentId: command.agentId,
        type: command.type,
        schemaVersion: command.schemaVersion,
        actor: command.actor,
        metadata: command.metadata
      }, options);
    } catch (error) {
      gatewayResponse = Promise.reject(error);
    }

    const request = Promise.resolve(gatewayResponse)
      .then((ack) => normalizeAck(ack, command))
      .catch((error) => {
        if (error instanceof TaskCommandClientError) throw error;
        throw new TaskCommandClientError(error?.message || "Gateway command failed", { command, cause: error });
      })
      .finally(() => {
        const current = pending.get(command.idempotencyKey);
        if (current?.promise === request) pending.delete(command.idempotencyKey);
      });

    pending.set(command.idempotencyKey, { fingerprint, promise: request });
    return request;
  }

  return Object.freeze({
    send,
    pendingCount: () => pending.size,
    actionFor: (type) => {
      try {
        const normalized = normalizeCommand({
          type,
          commandId: "command-preview",
          idempotencyKey: "idempotency-preview",
          taskId: "task-preview",
          payload: { decision: "approved" }
        });
        return TASK_COMMAND_ACTIONS[normalized.type] || null;
      } catch {
        return null;
      }
    }
  });
}

function commandFingerprint(command) {
  return JSON.stringify(stableValue({
    schemaVersion: command.schemaVersion,
    taskId: command.taskId,
    taskRunId: command.taskRunId,
    conversationId: command.conversationId,
    agentId: command.agentId,
    type: command.type,
    payload: command.payload,
    actor: command.actor,
    metadata: command.metadata
  }));
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = stableValue(value[key]);
      return result;
    }, {});
  }
  return value;
}

function normalizeAck(ack, command) {
  const outer = ack && typeof ack === "object" ? ack : {};
  const data = outer.data && typeof outer.data === "object" ? outer.data : outer;
  const accepted = data?.accepted
    ?? data?.ok
    ?? outer.accepted
    ?? outer.ok
    ?? (data?.code === "OK" || data?.code === 0 || outer.code === "OK" || outer.code === 0);
  const error = data?.error || outer.error;
  const code = data?.code || outer.code;
  if (accepted === false || error || code === "ERROR" || code === "ERR") {
    throw new TaskCommandClientError(error?.message || data?.message || outer.message || "Gateway rejected command", {
      code: error?.code || code || "COMMAND_REJECTED",
      command
    });
  }
  return {
    command,
    accepted: accepted !== false,
    commandId: data?.commandId || outer.commandId || command.commandId,
    currentSeq: data?.currentSeq ?? data?.latestSeq ?? outer.currentSeq ?? outer.latestSeq ?? null,
    data: data === outer ? data : { ...outer, ...data }
  };
}

function makeId(prefix, sequence, idFactory) {
  if (typeof idFactory === "function") return idFactory(prefix, sequence);
  return `${prefix}-${Date.now().toString(36)}-${sequence.toString(36)}`;
}
