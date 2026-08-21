/**
 * Canonical frontend interaction state.
 *
 * The UI renders cards from this state instead of inferring a workflow from
 * whichever message happened to arrive last. Task, lead, outreach, relation,
 * and risk dimensions intentionally remain separate.
 */

export const INTERACTION_STATES = Object.freeze({
  CREATED: "CREATED",
  UNDERSTANDING: "UNDERSTANDING",
  WAITING_REQUIREMENT: "WAITING_REQUIREMENT",
  PLANNING: "PLANNING",
  WAITING_ACCESS: "WAITING_ACCESS",
  SEARCHING: "SEARCHING",
  REVIEWING: "REVIEWING",
  WAITING_APPROVAL: "WAITING_APPROVAL",
  SCHEDULED: "SCHEDULED",
  RUNNING: "RUNNING",
  SENDING: "SENDING",
  SENT: "SENT",
  PAUSED: "PAUSED",
  WAITING_REPLY: "WAITING_REPLY",
  HANDOFF: "HANDOFF",
  SUCCEEDED: "SUCCEEDED",
  FAILED: "FAILED",
  BLOCKED: "BLOCKED",
  CANCELLED: "CANCELLED"
});

const TERMINAL = new Set([
  INTERACTION_STATES.SUCCEEDED,
  INTERACTION_STATES.CANCELLED
]);

function payloadOf(event = {}) {
  return event.payload && typeof event.payload === "object" ? event.payload : event;
}

function valueOf(event, key, fallback = null) {
  const payload = payloadOf(event);
  return payload[key] ?? event[key] ?? fallback;
}

export function createInteractionState({ taskId = null, scenario = "generic" } = {}) {
  return {
    taskId,
    scenario,
    taskState: INTERACTION_STATES.CREATED,
    stage: "understanding",
    progress: 0,
    pendingAction: null,
    reason: null,
    errorCode: null,
    retryable: false,
    retryCount: 0,
    leadState: "NONE",
    leadScore: null,
    leadTier: null,
    outreachState: "NONE",
    deliveryState: null,
    relationshipState: "NO_REPLY",
    followUpState: "NOT_STARTED",
    pendingFollowupId: null,
    riskState: "ALLOW",
    replyText: null,
    updatedAt: null,
    version: 0
  };
}

function setTask(next, taskState, stage, pendingAction = null) {
  next.taskState = taskState;
  if (stage) next.stage = stage;
  next.pendingAction = pendingAction;
}

/** Reduce one canonical UI event into the complete frontend state. */
export function reduceInteractionState(previous, event = {}) {
  const next = { ...createInteractionState(), ...(previous || {}) };
  const type = event.t || event.type || "";
  const payload = payloadOf(event);
  // Use the runtime sequence when available so replay produces the same
  // snapshot on every device. A wall-clock timestamp is event metadata, not
  // part of the state identity.
  next.updatedAt = valueOf(event, "sequence", valueOf(event, "remoteSeq", next.version + 1));
  next.version = Number(next.version || 0) + 1;

  const allowedAfterTerminal = [
    "task-retry-requested",
    "task-resumed",
    "lead-replied",
    "replied",
    "lead-do-not-contact",
    "do-not-contact",
    "handoff",
    "task-handoff",
    "task-cancelled",
    "cancelled"
  ];
  if (TERMINAL.has(next.taskState) && !allowedAfterTerminal.includes(type)) {
    return next;
  }

  switch (type) {
    case "user":
    case "run-started":
      setTask(next, INTERACTION_STATES.UNDERSTANDING, "understanding");
      break;
    case "requirement-required":
      setTask(next, INTERACTION_STATES.WAITING_REQUIREMENT, "requirement", "requirement");
      break;
    case "requirement-confirmed":
      setTask(next, INTERACTION_STATES.PLANNING, "planning");
      break;
    case "requirement-edited":
      next.reason = null;
      setTask(next, INTERACTION_STATES.WAITING_REQUIREMENT, "requirement", "requirement");
      break;
    case "assignment-plan":
    case "auth-required":
    case "auth-started":
    case "auth-granted":
    case "scope-required":
      setTask(next, INTERACTION_STATES.WAITING_ACCESS, "authorization", "access");
      break;
    case "scope-confirmed":
      setTask(next, INTERACTION_STATES.RUNNING, "finding");
      break;
    case "progress-start":
      setTask(next, INTERACTION_STATES.SEARCHING, "finding");
      break;
    case "progress":
      setTask(next, INTERACTION_STATES.RUNNING, valueOf(event, "stage", next.stage));
      next.progress = Math.max(0, Math.min(100, Number(valueOf(event, "pct", next.progress)) || 0));
      break;
    case "sub-accepted":
    case "sub-started":
    case "sub-log":
    case "sub-done":
      setTask(next, INTERACTION_STATES.RUNNING, "execution");
      break;
    case "lead-candidate":
      next.leadState = "CANDIDATE";
      setTask(next, INTERACTION_STATES.REVIEWING, "reviewing");
      break;
    case "lead-qualified":
      next.leadState = "QUALIFIED";
      next.leadScore = valueOf(event, "score", next.leadScore);
      next.leadTier = valueOf(event, "tier", next.leadTier);
      setTask(next, INTERACTION_STATES.REVIEWING, "reviewing");
      break;
    case "lead-rejected":
      next.leadState = "REJECTED";
      next.reason = valueOf(event, "reason", next.reason);
      break;
    case "outreach-ready":
      next.outreachState = "READY";
      setTask(next, INTERACTION_STATES.REVIEWING, "outreach");
      break;
    case "approval-show":
      next.approvalId = valueOf(event, "approvalId", payload.approval?.id || next.approvalId || null);
      setTask(next, INTERACTION_STATES.WAITING_APPROVAL, "outreach", "approval");
      break;
    case "approval-resolved":
      if (valueOf(event, "ok", false)) {
        next.outreachState = next.outreachState === "NONE" ? "READY" : next.outreachState;
        setTask(next, INTERACTION_STATES.SCHEDULED, "outreach");
      } else {
        next.reason = valueOf(event, "reason", "approval_rejected");
        setTask(next, INTERACTION_STATES.BLOCKED, "outreach", "modify");
      }
      break;
    case "outreach-scheduled":
      next.outreachState = "SCHEDULED";
      next.scheduledAt = valueOf(event, "at", valueOf(event, "scheduledAt", null));
      setTask(next, INTERACTION_STATES.SCHEDULED, "outreach");
      break;
    case "outreach-sending":
      next.outreachState = "SENDING";
      setTask(next, INTERACTION_STATES.SENDING, "outreach");
      break;
    case "outreach-sent":
    case "touch-sent":
      next.outreachState = "SENT";
      next.deliveryState = valueOf(event, "deliveryState", "submitted");
      next.relationshipState = "NO_REPLY";
      next.followUpState = "WAITING_REPLY";
      setTask(next, INTERACTION_STATES.SENT, "outreach");
      break;
    case "followup-waiting":
    case "followup-stream-start":
    case "followup-stream-delta":
      next.pendingFollowupId = valueOf(event, "followupId", null);
      next.followUpState = "PROCESSING";
      break;
    case "followup-chief":
    case "followup-stream-end":
      next.pendingFollowupId = null;
      next.followUpState = "ANSWERED";
      break;
    case "followup-failed":
      next.pendingFollowupId = null;
      next.followUpState = "FAILED";
      next.reason = valueOf(event, "text", next.reason);
      break;
    case "delivery-checking":
      next.deliveryState = "checking";
      setTask(next, INTERACTION_STATES.RUNNING, "outreach");
      break;
    case "lead-replied":
    case "replied":
      next.relationshipState = "REPLIED";
      next.replyText = valueOf(event, "replyText", valueOf(event, "text", null));
      next.outreachState = "STOPPED";
      next.followUpState = "STOPPED";
      setTask(next, INTERACTION_STATES.HANDOFF, "conversation", "conversation");
      break;
    case "lead-do-not-contact":
    case "do-not-contact":
      next.leadState = "DO_NOT_CONTACT";
      next.outreachState = "BLOCKED";
      next.followUpState = "STOPPED";
      next.riskState = "REJECT";
      next.reason = valueOf(event, "reason", "do_not_contact");
      setTask(next, INTERACTION_STATES.BLOCKED, "outreach", "modify");
      break;
    case "outreach-unavailable":
      next.outreachState = "UNAVAILABLE";
      next.reason = valueOf(event, "reason", "unavailable");
      setTask(next, INTERACTION_STATES.BLOCKED, "outreach", "alternative");
      break;
    case "risk-paused":
      next.riskState = valueOf(event, "riskState", "DELAY");
      next.reason = valueOf(event, "reason", "risk_review");
      setTask(next, INTERACTION_STATES.PAUSED, "risk", "resume");
      break;
    case "outreach-failed":
    case "sub-error":
    case "task-error":
      next.outreachState = type === "outreach-failed" ? "FAILED" : next.outreachState;
      next.errorCode = valueOf(event, "errorCode", next.errorCode);
      next.retryable = Boolean(valueOf(event, "retryable", type === "task-error" || type === "sub-error"));
      next.reason = valueOf(event, "reason", valueOf(event, "text", next.reason));
      setTask(next, INTERACTION_STATES.FAILED, "recovery", next.retryable ? "retry" : "human");
      break;
    case "task-blocked":
      next.reason = valueOf(event, "reason", valueOf(event, "text", next.reason));
      setTask(next, INTERACTION_STATES.BLOCKED, "recovery", "modify");
      break;
    case "task-paused":
      next.reason = valueOf(event, "reason", "user_paused");
      setTask(next, INTERACTION_STATES.PAUSED, "recovery", "resume");
      break;
    case "task-resumed":
      next.reason = null;
      setTask(next, INTERACTION_STATES.RUNNING, valueOf(event, "stage", next.stage));
      break;
    case "task-retry-requested":
      next.retryCount = Number(next.retryCount || 0) + 1;
      next.reason = null;
      next.errorCode = null;
      next.retryable = false;
      setTask(next, INTERACTION_STATES.RUNNING, valueOf(event, "stage", "execution"));
      break;
    case "handoff":
    case "task-handoff":
      next.relationshipState = "HUMAN_TAKEOVER";
      next.followUpState = "STOPPED";
      next.reason = valueOf(event, "reason", "human_takeover");
      setTask(next, INTERACTION_STATES.HANDOFF, "handoff", "human");
      break;
    case "task-cancelled":
    case "cancelled":
      next.reason = valueOf(event, "reason", "cancelled");
      setTask(next, INTERACTION_STATES.CANCELLED, "cancelled");
      break;
    case "run-finished":
    case "summary":
      next.progress = 100;
      setTask(next, INTERACTION_STATES.SUCCEEDED, "results");
      break;
    default:
      break;
  }

  return next;
}

export function isInteractionTerminal(state) {
  return TERMINAL.has(state?.taskState);
}
