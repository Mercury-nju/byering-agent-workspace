import {
  COMMAND_TYPES,
  createCommandEnvelope,
  normalizeCommand
} from "./task-protocol.js";

/** Map canonical protocol commands to the existing Gateway action namespace. */
export const TASK_COMMAND_ACTIONS = Object.freeze({
  [COMMAND_TYPES.TASK_START]: "task.run.start",
  [COMMAND_TYPES.REQUIREMENT_REQUEST]: "task.requirement.request",
  [COMMAND_TYPES.REQUIREMENT_CONFIRM]: "task.requirement.confirm",
  [COMMAND_TYPES.ACCESS_REQUEST]: "access.authorization.start",
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
    const command = normalizeCommand({
      ...input,
      type,
      commandId: input.commandId || makeId("cmd", ++sequence, idFactory),
      idempotencyKey: input.idempotencyKey || makeId("idem", sequence, idFactory),
      actor: input.actor ?? actor
    });
    const action = TASK_COMMAND_ACTIONS[command.type];
    if (!action) throw new TaskCommandClientError(`No Gateway action for ${command.type}`, { code: "UNMAPPED_COMMAND", command });

    const existing = pending.get(command.idempotencyKey);
    if (existing) return existing;

    const request = gateway.action(action, {
      ...command.payload,
      commandId: command.commandId,
      idempotencyKey: command.idempotencyKey,
      taskId: command.taskId,
      taskRunId: command.taskRunId,
      conversationId: command.conversationId,
      agentId: command.agentId,
      type: command.type,
      schemaVersion: command.schemaVersion,
      actor: command.actor,
      metadata: command.metadata
    }, options)
      .then((ack) => normalizeAck(ack, command))
      .catch((error) => {
        if (error instanceof TaskCommandClientError) throw error;
        throw new TaskCommandClientError(error?.message || "Gateway command failed", { command, cause: error });
      })
      .finally(() => pending.delete(command.idempotencyKey));

    pending.set(command.idempotencyKey, request);
    return request;
  }

  return Object.freeze({
    send,
    pendingCount: () => pending.size,
    actionFor: (type) => TASK_COMMAND_ACTIONS[normalizeCommand({
      type,
      commandId: "command-preview",
      idempotencyKey: "idempotency-preview",
      taskId: "task-preview"
    }).type] || null
  });
}

function normalizeAck(ack, command) {
  const data = ack?.data && typeof ack.data === "object" ? ack.data : ack;
  const accepted = data?.accepted ?? data?.ok ?? (data?.code === "OK" || data?.code === 0);
  if (accepted === false || data?.error || data?.code === "ERROR" || data?.code === "ERR") {
    throw new TaskCommandClientError(data?.error?.message || data?.message || "Gateway rejected command", {
      code: data?.error?.code || data?.code || "COMMAND_REJECTED",
      command
    });
  }
  return {
    command,
    accepted: accepted !== false,
    commandId: data?.commandId || command.commandId,
    currentSeq: data?.currentSeq ?? data?.latestSeq ?? null,
    data
  };
}

function makeId(prefix, sequence, idFactory) {
  if (typeof idFactory === "function") return idFactory(prefix, sequence);
  return `${prefix}-${Date.now().toString(36)}-${sequence.toString(36)}`;
}
