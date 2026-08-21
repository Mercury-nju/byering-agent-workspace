import { COMMAND_TYPES, TASK_STATES } from "../src/salebuddy/runtime/task-protocol.js";

const COMMAND_ALIASES = Object.freeze({
  "task.run.start": COMMAND_TYPES.TASK_START,
  "task.start": COMMAND_TYPES.TASK_START,
  start: COMMAND_TYPES.TASK_START,
  "task.requirement.confirm": COMMAND_TYPES.REQUIREMENT_CONFIRM,
  "access.scope.confirm": COMMAND_TYPES.ACCESS_GRANT,
  "access.grant": COMMAND_TYPES.ACCESS_GRANT,
  "approval.action.respond": COMMAND_TYPES.APPROVAL_DECISION,
  "approval.decision": COMMAND_TYPES.APPROVAL_DECISION,
  approve: COMMAND_TYPES.APPROVAL_DECISION,
  reject: COMMAND_TYPES.APPROVAL_DECISION,
  resume: COMMAND_TYPES.RESUME
});

const RUNNING_TRANSITION_COMMANDS = new Set([
  COMMAND_TYPES.TASK_START,
  COMMAND_TYPES.REQUIREMENT_CONFIRM,
  COMMAND_TYPES.ACCESS_GRANT,
  COMMAND_TYPES.APPROVAL_DECISION,
  COMMAND_TYPES.RESUME
]);

const SAFE_CONTEXT_FIELDS = Object.freeze([
  "uid", "robotUid", "tenantId", "accountKey", "accountLabel", "provider", "deviceId", "platform",
  "regionId", "robotInfoId", "browserSessionId", "browser_session_id", "workspaceId", "workspace_id"
]);
const SECRET_KEY = /(?:authorization|(?:access|refresh)?[_-]?token|password|passwd|cookie|secret|csrf|jwt)/i;

export class TaskDispatcherError extends Error {
  constructor(message, { code = "TASK_DISPATCH_FAILED", statusCode = 502, details = {} } = {}) {
    super(message);
    this.name = "TaskDispatcherError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = redactDetails(details);
  }
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeCommandType(value) {
  const raw = nonEmpty(value);
  return raw ? (COMMAND_ALIASES[raw] || raw) : null;
}

function normalizedDecision(payload = {}) {
  const value = payload.decision ?? payload.ok;
  if (value === true) return "approved";
  if (value === false) return "rejected";
  const normalized = nonEmpty(value)?.toLowerCase();
  if (["approved", "approve", "ok", "yes"].includes(normalized)) return "approved";
  if (["rejected", "reject", "cancel", "no"].includes(normalized)) return "rejected";
  return normalized || null;
}

function safeContextFrom(source = {}) {
  const context = {};
  for (const field of SAFE_CONTEXT_FIELDS) {
    const value = nonEmpty(source[field]);
    if (value) context[field] = value;
  }
  return context;
}

function commandContext(command = {}, task = {}) {
  const payload = isRecord(command.payload) ? command.payload : {};
  const payloadContext = isRecord(payload.executionContext) ? payload.executionContext : {};
  const accessContext = isRecord(task.accessRequest) ? task.accessRequest : {};
  const taskContext = isRecord(task.executionContext) ? task.executionContext : {};
  return {
    ...safeContextFrom(accessContext),
    ...safeContextFrom(taskContext),
    ...safeContextFrom(payloadContext),
    ...safeContextFrom(payload)
  };
}

function resolveUid({ command = {}, task = {} } = {}) {
  const context = commandContext(command, task);
  return context.uid || context.robotUid || null;
}

function entersRunning({ command = {}, task = {}, ack = null } = {}) {
  if (ack) {
    return ack.accepted === true
      && ack.state === TASK_STATES.RUNNING
      && ack.previousState !== TASK_STATES.RUNNING
      && RUNNING_TRANSITION_COMMANDS.has(normalizeCommandType(command.type ?? command.commandType));
  }
  const type = normalizeCommandType(command.type ?? command.commandType);
  const state = task?.state;
  if (!RUNNING_TRANSITION_COMMANDS.has(type)) return false;
  if (type === COMMAND_TYPES.APPROVAL_DECISION) {
    return state === TASK_STATES.WAITING_APPROVAL && normalizedDecision(command.payload) === "approved";
  }
  if (type === COMMAND_TYPES.REQUIREMENT_CONFIRM) {
    return state === TASK_STATES.WAITING_REQUIREMENT && command.payload?.requiresAccess !== true;
  }
  if (type === COMMAND_TYPES.ACCESS_GRANT) return state === TASK_STATES.WAITING_ACCESS;
  if (type === COMMAND_TYPES.RESUME) return state === TASK_STATES.PAUSED;
  if (type === COMMAND_TYPES.TASK_START) return state === TASK_STATES.RETRYING;
  return false;
}

function redactDetails(value) {
  if (Array.isArray(value)) return value.map(redactDetails);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !SECRET_KEY.test(key) && key !== "cause")
    .map(([key, child]) => [key, redactDetails(child)]));
}

function leaseSummary(result) {
  const source = isRecord(result) ? result : {};
  const events = Array.isArray(source.events) ? source.events : [];
  const commands = Array.isArray(source.commands) ? source.commands : [];
  return {
    accepted: source.accepted !== false,
    source: nonEmpty(source.source || source.kind || source.executor) || null,
    kind: nonEmpty(source.kind) || null,
    leaseId: nonEmpty(source.leaseId || source.lease_id || source.id),
    uid: nonEmpty(source.uid || source.executorUid || source.robotUid),
    cloudDesktopReady: source.cloudDesktop?.ready === true || source.cloudDesktop?.connected === true,
    rpaStarted: source.rpa?.started === true || source.rpa?.accepted === true,
    eventCount: events.length,
    commandCount: commands.length,
    status: nonEmpty(source.status) || null,
    events: events.slice(0, 1000).map(safeExternalEvent).filter(Boolean)
  };
}

function safeExternalEvent(value) {
  if (!isRecord(value)) return null;
  const event = {};
  for (const field of [
    "eventId", "event_id", "id", "type", "event", "taskId", "task_id", "taskRunId",
    "task_run_id", "runId", "run_id", "conversationId", "conversation_id", "agentId",
    "agent_id", "skillId", "skill_id", "skillRunId", "skill_run_id", "seq", "sequence", "occurredAt", "occurred_at", "correlationId",
    "correlation_id", "payload"
  ]) {
    if (value[field] !== undefined) {
      const safe = safeExecutionValue(value[field]);
      if (safe !== undefined) event[field] = safe;
    }
  }
  return event.eventId || event.event_id || event.id ? event : null;
}

function validateExecutionService(executionService) {
  return Boolean(executionService && (typeof executionService.submit === "function" || typeof executionService.lease === "function"));
}

const EXECUTION_FIELDS = Object.freeze([
  "goal", "action", "actionType", "channel", "queue", "source", "leadId", "lead", "recipient",
  "message", "content", "videoId", "commentId", "shortVideoId", "selectedLeadIds", "plan", "mode", "scheduleAt",
  "account", "accountName", "account_name", "nickname", "uniqueId", "unique_id", "douyinId", "douyin_id",
  "profileUrl", "profile_url", "uid", "secId", "sec_id", "secUid", "sec_uid", "accountCode",
  "accounts", "accountRefs", "accountList", "videoId", "videoIds", "videoUrl", "videoUrls"
]);

function safeExecutionValue(value) {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 500).map(safeExecutionValue).filter((item) => item !== undefined);
  if (isRecord(value)) {
    const result = {};
    for (const [key, item] of Object.entries(value)) {
      if (SECRET_KEY.test(key) || key.startsWith("_")) continue;
      const normalized = safeExecutionValue(item);
      if (normalized !== undefined) result[key] = normalized;
    }
    return result;
  }
  return undefined;
}

function executionPayload(command = {}, task = {}) {
  const payload = isRecord(command.payload) ? command.payload : {};
  const nested = [payload.execution, payload.executionRequest, task.executionRequest]
    .find((value) => isRecord(value)) || {};
  const source = {
    ...(isRecord(task.executionContext) ? task.executionContext : {}),
    ...(isRecord(task.executionPlan) ? task.executionPlan : {}),
    ...payload,
    ...nested
  };
  const output = {};
  for (const field of EXECUTION_FIELDS) {
    const value = field === "goal" ? source[field] ?? task.goal : source[field];
    const normalized = safeExecutionValue(value);
    if (normalized !== undefined && normalized !== null && normalized !== "") output[field] = normalized;
  }
  return output;
}

function hasSubmissionIntent(command = {}, task = {}) {
  const payload = isRecord(command.payload) ? command.payload : {};
  const nested = [payload.execution, payload.executionRequest, task.executionRequest]
    .find((value) => isRecord(value)) || {};
  const plan = isRecord(task.executionPlan) ? task.executionPlan : {};
  const source = { ...plan, ...payload, ...nested };
  if (source.submissionRequired === true) return true;
  return (source.actionType !== undefined
      && source.actionType !== null
      && String(source.actionType).trim() !== "")
    || Boolean(nonEmpty(source.action));
}

/**
 * Generic boundary between the authoritative task state machine and an
 * external executor. The executor can be ClueHunter today and another worker
 * later; no legacy action codes or credentials cross this boundary.
 */
export function createTaskDispatcher({ executionService, prospectService = null, cloudDesktopService = null, onLease = null } = {}) {
  if (!validateExecutionService(executionService) && !validateExecutionService(prospectService)) {
    throw new TaskDispatcherError("Task execution service must implement lease", {
      code: "TASK_DISPATCHER_INVALID",
      statusCode: 500
    });
  }

  function serviceFor(task = {}, command = {}) {
    if (task.workflow?.id === "find_only" && prospectService) return prospectService;
    // During requirement confirmation the workflow is created by the same
    // command, so the pre-dispatch task snapshot has no workflow yet. A
    // confirmation without an access requirement is deterministically the
    // public find-only path and must not be sent to the RPA executor.
    const type = normalizeCommandType(command.type ?? command.commandType);
    if (type === COMMAND_TYPES.REQUIREMENT_CONFIRM && command.payload?.requiresAccess !== true && prospectService) return prospectService;
    return executionService;
  }

  function isProspectService(service, task = {}) {
    return service?.kind === "prospect"
      || service?.kind === "prospect-workflow"
      || (!service && task.workflow?.id === "find_only");
  }

  function assertReadyFor(input = {}) {
    const { command = {}, task = {}, ack = null } = input;
    if (!entersRunning({ command, task, ack })) return;
    const service = serviceFor(task, command);
    if (!validateExecutionService(service)) {
      throw new TaskDispatcherError("Task workflow has no configured execution service", {
        code: isProspectService(service, task) ? "PROSPECT_EXECUTOR_NOT_CONFIGURED" : "TASK_DISPATCH_NOT_CONFIGURED",
        statusCode: 503,
        details: { workflowId: task.workflow?.id || null }
      });
    }
    if (service.configured === false && !isProspectService(service, task) && !hasSubmissionIntent(command, task)) return;
    if (service.configured === false) {
      throw new TaskDispatcherError("Task execution service is not configured", {
        code: isProspectService(service, task)
          ? "PROSPECT_EXECUTOR_NOT_CONFIGURED"
          : "TASK_DISPATCH_NOT_CONFIGURED",
        statusCode: 503
      });
    }
    const uid = resolveUid({ command, task });
    if (service.requiresExecutorUid !== false && !uid) {
      throw new TaskDispatcherError("A verified executor uid is required before task execution", {
        code: "TASK_EXECUTOR_ID_REQUIRED",
        statusCode: 409,
        details: { taskId: task.taskId || command.taskId || null }
      });
    }
    if (service === executionService && cloudDesktopService?.configured === false) {
      throw new TaskDispatcherError("ClueHunter cloud desktop and RPA are not configured", {
        code: "CLOUD_DESKTOP_NOT_CONFIGURED",
        statusCode: 503,
        details: { required: cloudDesktopService.missing || [] }
      });
    }
  }

  async function dispatch(input = {}) {
    const { command = {}, task = {}, ack = null } = input;
    if (!entersRunning({ command, task, ack })) {
      return { dispatched: false, reason: "state_gate" };
    }
    const service = serviceFor(task, command);
    if (!validateExecutionService(service)) {
      throw new TaskDispatcherError("Task workflow has no configured execution service", {
        code: isProspectService(service, task) ? "PROSPECT_EXECUTOR_NOT_CONFIGURED" : "TASK_DISPATCH_NOT_CONFIGURED",
        statusCode: 503,
        details: { workflowId: task.workflow?.id || null }
      });
    }
    if (service.configured === false && !isProspectService(service, task) && !hasSubmissionIntent(command, task)) {
      return { dispatched: false, reason: "executor_not_required" };
    }
    const useSubmit = typeof service.submit === "function" && hasSubmissionIntent(command, task);
    const useLease = !useSubmit && typeof service.lease === "function";
    if (!useSubmit && !useLease) {
      return { dispatched: false, reason: "submission_intent_required" };
    }
    assertReadyFor({ command, task, ack });
    const context = commandContext(command, task);
    const request = {
      uid: context.uid || context.robotUid,
      taskId: task.taskId || command.taskId,
      taskRunId: task.taskRunId || command.taskRunId || command.runId,
      conversationId: task.conversationId || command.conversationId,
      agentId: task.agentId || command.agentId,
      commandId: command.commandId || null,
      idempotencyKey: command.idempotencyKey || null,
      ...Object.fromEntries(Object.entries(context).filter(([key]) => key !== "uid" && key !== "robotUid"))
    };
    if (useSubmit || isProspectService(service, task) || service.requiresExecutorUid === false) {
      Object.assign(request, executionPayload(command, task));
    }
    try {
      let cloudConnection = null;
      if (service === executionService && cloudDesktopService) {
        const cloudInput = {
          uid: request.uid,
          tenant: request.tenantId,
          regionId: request.regionId,
          robotInfoId: request.robotInfoId
        };
        if (typeof cloudDesktopService.connect === "function") {
          cloudConnection = await cloudDesktopService.connect(cloudInput);
        } else if (typeof cloudDesktopService.ensureReady === "function") {
          const cloudDesktop = await cloudDesktopService.ensureReady(cloudInput);
          const rpa = typeof cloudDesktopService.startJob === "function"
            ? await cloudDesktopService.startJob(cloudInput)
            : null;
          cloudConnection = { connected: true, cloudDesktop, rpa };
        } else {
          throw new TaskDispatcherError("Cloud desktop service cannot connect RPA", {
            code: "CLOUD_DESKTOP_CONNECTOR_INVALID",
            statusCode: 503
          });
        }
      }
      const result = await (useSubmit ? service.submit(request) : service.lease(request));
      const summary = leaseSummary(result);
      if (summary.accepted === false) {
        throw new TaskDispatcherError("Task execution service rejected the lease", {
          code: "TASK_DISPATCH_REJECTED",
          statusCode: 502,
          details: summary
        });
      }
      if (typeof onLease === "function") await onLease({ request: { ...request }, result });
      return {
        dispatched: true,
        ...summary,
        cloudDesktop: cloudConnection?.cloudDesktop || null,
        rpa: cloudConnection?.rpa || null,
        cloudDesktopReady: cloudConnection?.cloudDesktop?.ready === true,
        rpaStarted: cloudConnection?.rpa?.started === true || cloudConnection?.rpa?.accepted === true
      };
    } catch (error) {
      if (error instanceof TaskDispatcherError) throw error;
      throw new TaskDispatcherError(error?.message || "Task execution service failed", {
        code: error?.code || "TASK_DISPATCH_FAILED",
        statusCode: Number.isInteger(error?.statusCode) ? error.statusCode : 502,
        details: error?.details || { taskId: request.taskId }
      });
    }
  }

  return Object.freeze({
    configured: [executionService, prospectService].some((service) => validateExecutionService(service) && service.configured !== false),
    assertReadyFor,
    dispatch,
    shouldDispatch: (input = {}) => entersRunning(input)
      && (serviceFor(input.task, input.command)?.configured !== false || hasSubmissionIntent(input.command, input.task))
  });
}

export { entersRunning as shouldDispatchTask, resolveUid as resolveTaskExecutorUid };
