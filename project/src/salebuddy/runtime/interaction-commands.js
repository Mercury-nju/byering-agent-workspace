/** Commands shared by recovery cards, progress controls and remote actions. */

export const INTERACTION_COMMANDS = Object.freeze({
  PAUSE: "pause",
  RESUME: "resume",
  RETRY: "retry",
  HANDOFF: "handoff",
  CANCEL: "cancel",
  FOLLOWUP: "followup"
});

const ACTION_STATES = Object.freeze({
  [INTERACTION_COMMANDS.PAUSE]: new Set(["RUNNING", "SEARCHING", "REVIEWING", "SCHEDULED", "SENDING", "WAITING_REPLY"]),
  [INTERACTION_COMMANDS.RESUME]: new Set(["PAUSED", "BLOCKED"]),
  [INTERACTION_COMMANDS.RETRY]: new Set(["FAILED", "PAUSED", "BLOCKED"]),
  [INTERACTION_COMMANDS.HANDOFF]: new Set(["WAITING_REQUIREMENT", "WAITING_ACCESS", "RUNNING", "SEARCHING", "REVIEWING", "WAITING_APPROVAL", "PAUSED", "FAILED", "BLOCKED", "WAITING_REPLY"]),
  [INTERACTION_COMMANDS.CANCEL]: new Set(["CREATED", "UNDERSTANDING", "WAITING_REQUIREMENT", "PLANNING", "WAITING_ACCESS", "SEARCHING", "REVIEWING", "WAITING_APPROVAL", "SCHEDULED", "RUNNING", "SENDING", "PAUSED", "WAITING_REPLY", "FAILED", "BLOCKED"]),
  [INTERACTION_COMMANDS.FOLLOWUP]: new Set(["SUCCEEDED", "SENT", "WAITING_REPLY", "HANDOFF"])
});

function stateOf(state = {}) {
  return state?.interaction && typeof state.interaction === "object" ? state.interaction : state;
}

export function canIssueInteractionCommand(state, action) {
  const current = stateOf(state);
  const taskState = current.taskState;
  if (action === INTERACTION_COMMANDS.RESUME && (current.leadState === "DO_NOT_CONTACT" || current.riskState === "REJECT")) return false;
  return Boolean(ACTION_STATES[action]?.has(taskState))
    && !(action === INTERACTION_COMMANDS.RETRY && ["FAILED", "BLOCKED"].includes(taskState) && current.retryable !== true);
}

export function createInteractionCommand(action, {
  taskId = null,
  runId = null,
  stepId = null,
  commandId = null,
  payload = {}
} = {}) {
  const id = commandId || `cmd-${taskId || "task"}-${action}-${Date.now().toString(36)}`;
  return {
    action,
    taskId,
    runId,
    stepId,
    commandId: id,
    idempotencyKey: id,
    ...payload
  };
}

export function localEventForInteractionCommand(action, payload = {}) {
  switch (action) {
    case INTERACTION_COMMANDS.PAUSE:
      return { t: "task-paused", reason: payload.reason || "user_paused" };
    case INTERACTION_COMMANDS.RESUME:
      return { t: "task-resumed" };
    case INTERACTION_COMMANDS.RETRY:
      return { t: "task-retry-requested", stepId: payload.stepId || null };
    case INTERACTION_COMMANDS.HANDOFF:
      return { t: "handoff", reason: payload.reason || "human_takeover" };
    case INTERACTION_COMMANDS.CANCEL:
      return { t: "task-cancelled", reason: payload.reason || "cancelled" };
    default:
      return null;
  }
}

export const INTERACTION_ACTION_STATES = ACTION_STATES;
