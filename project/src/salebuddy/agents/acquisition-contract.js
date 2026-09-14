/** Pure contracts shared by acquisition UI, runners, and tests. */
import { COMMAND_TYPES, TASK_STATES as RUNTIME_TASK_STATES, transitionTaskState as transitionRuntimeTaskState } from "../runtime/task-protocol.js";
export const TASK_STATES = Object.freeze({
  CONFIGURING: "configuring",
  RUNNING: "running",
  PAUSED: "paused",
  DEGRADED: "degraded",
  ERROR: "error",
  STOPPED: "stopped"
});

export const CLOUD_STATES = Object.freeze({
  PROVISIONING: "provisioning",
  ONLINE: "online",
  CONNECTING: "connecting",
  DISCONNECTED: "disconnected",
  RECOVERING: "recovering"
});

export const APPROVAL_MODES = Object.freeze({ MANUAL: "manual", BATCH: "batch", AUTO: "auto" });

export const TOUCH_STATES = Object.freeze({
  DRAFT: "draft",
  PENDING_APPROVAL: "pending_approval",
  APPROVED: "approved",
  REJECTED: "rejected",
  SUBMITTED: "submitted",
  ACCEPTED: "accepted",
  DELIVERED: "delivered",
  UNKNOWN: "unknown",
  DELIVERY_CHECKING: "delivery_checking",
  FAILED: "failed",
  RETRY_QUEUED: "retry_queued",
  STOPPED: "stopped"
});

export const EVENT_TYPES = Object.freeze({
  AUTHORIZATION: "authorization",
  CLOUD_LIFECYCLE: "cloud_lifecycle",
  SCAN_WINDOW: "scan_window",
  CANDIDATES_FOUND: "candidates_found",
  INTENT_DECISION: "intent_decision",
  RISK_DECISION: "risk_decision",
  TOUCH_DRAFTED: "touch_drafted",
  TOUCH_APPROVED: "touch_approved",
  TOUCH_SUBMITTED: "touch_submitted",
  TOUCH_RECEIPT: "touch_receipt",
  REPLY_RECEIVED: "reply_received",
  RETRY: "retry",
  CONFIG_UPDATED: "config_updated",
  PAUSE: "pause",
  RESUME: "resume",
  STOP: "stop",
  ERROR: "error"
});

export const CAPABILITY_PROBE_STATES = Object.freeze({
  NOT_STARTED: "not_started",
  RUNNING: "running",
  PASSED: "passed",
  FAILED: "failed",
  EXPIRED: "expired"
});

export const ACQUISITION_TASK_TO_RUNTIME_STATE = Object.freeze({ configuring: RUNTIME_TASK_STATES.CREATED, running: RUNTIME_TASK_STATES.RUNNING, paused: RUNTIME_TASK_STATES.PAUSED, degraded: RUNTIME_TASK_STATES.RUNNING, error: RUNTIME_TASK_STATES.FAILED, stopped: RUNTIME_TASK_STATES.CANCELLED });
export const RUNTIME_TO_ACQUISITION_TASK_STATE = Object.freeze({ CREATED: "configuring", RUNNING: "running", PAUSED: "paused", FAILED: "error", CANCELLED: "stopped" });
const TOUCH_TRANSITIONS = Object.freeze({ draft: ["pending_approval", "stopped"], pending_approval: ["approved", "rejected", "stopped"], approved: ["submitted", "stopped"], rejected: [], submitted: ["accepted", "unknown", "failed"], accepted: ["delivered"], delivered: [], unknown: ["delivery_checking", "stopped"], delivery_checking: ["delivered", "failed", "unknown"], failed: ["retry_queued", "stopped"], retry_queued: ["pending_approval", "approved", "submitted", "stopped"], stopped: [] });
const CLOUD_TRANSITIONS = Object.freeze({ provisioning: ["online", "disconnected", "recovering"], online: ["connecting", "disconnected", "recovering"], connecting: ["online", "disconnected", "recovering"], disconnected: ["recovering"], recovering: ["online", "disconnected"] });
const CAPABILITY_PROBE_TRANSITIONS = Object.freeze({ not_started: ["running"], running: ["passed", "failed"], passed: ["expired", "running"], failed: ["running"], expired: ["running"] });

function canTransition(graph, from, to) {
  return graph[from]?.includes(to) === true;
}

const TASK_COMMANDS = Object.freeze({ "configuring->running": { type: COMMAND_TYPES.TASK_START, payload: { requirementsConfirmed: true } }, "running->paused": COMMAND_TYPES.PAUSE, "degraded->paused": COMMAND_TYPES.PAUSE, "paused->running": COMMAND_TYPES.RESUME, "running->error": COMMAND_TYPES.FAIL, "degraded->error": COMMAND_TYPES.FAIL, "running->stopped": COMMAND_TYPES.CANCEL, "degraded->stopped": COMMAND_TYPES.CANCEL, "paused->stopped": COMMAND_TYPES.CANCEL, "configuring->stopped": COMMAND_TYPES.CANCEL });
export function toRuntimeTaskState(state) { return ACQUISITION_TASK_TO_RUNTIME_STATE[state] || null; }
export function fromRuntimeTaskState(state) { return RUNTIME_TO_ACQUISITION_TASK_STATE[state] || null; }
export function normalizeAcquisitionTaskStatus(state) {
  if (!Object.prototype.hasOwnProperty.call(ACQUISITION_TASK_TO_RUNTIME_STATE, state)) return null;
  return { taskState: state, runtimeState: ACQUISITION_TASK_TO_RUNTIME_STATE[state], health: state === "degraded" ? "DEGRADED" : "OK" };
}
export function canTransitionTask(from, to) {
  if (!toRuntimeTaskState(from) || !toRuntimeTaskState(to) || from === to) return false;
  if ((from === "running" || from === "degraded") && to === "running") return false;
  if ((from === "running" && to === "degraded") || (from === "degraded" && to === "running")) return true;
  const command = TASK_COMMANDS[`${from}->${to}`];
  if (!command) return false;
  try { transitionRuntimeTaskState(toRuntimeTaskState(from), command); return true; } catch { return false; }
}
export function canTransitionTouch(from, to) { return canTransition(TOUCH_TRANSITIONS, from, to); }
export function canTransitionCloud(from, to) { return canTransition(CLOUD_TRANSITIONS, from, to); }
export function canTransitionCapabilityProbe(from, to) { return canTransition(CAPABILITY_PROBE_TRANSITIONS, from, to); }

export function transitionTask(from, to) {
  if (!canTransitionTask(from, to)) throw new Error(`Illegal task transition: ${from} -> ${to}`);
  const command = TASK_COMMANDS[`${from}->${to}`];
  if (command) transitionRuntimeTaskState(toRuntimeTaskState(from), command);
  return to;
}

export function transitionTouch(from, to) {
  if (!canTransitionTouch(from, to)) throw new Error(`Illegal touch transition: ${from} -> ${to}`);
  return to;
}
export function transitionCloud(from, to) {
  if (!canTransitionCloud(from, to)) throw new Error(`Illegal cloud transition: ${from} -> ${to}`);
  return to;
}
export function transitionCapabilityProbe(from, to) {
  if (!canTransitionCapabilityProbe(from, to)) throw new Error(`Illegal capability probe transition: ${from} -> ${to}`);
  return to;
}

export const TOUCH_TRANSITION_GRAPH = Object.freeze(Object.fromEntries(Object.entries(TOUCH_TRANSITIONS).map(([key, value]) => [key, Object.freeze([...value])])));
export const CLOUD_TRANSITION_GRAPH = Object.freeze(Object.fromEntries(Object.entries(CLOUD_TRANSITIONS).map(([key, value]) => [key, Object.freeze([...value])])));
export const CAPABILITY_PROBE_TRANSITION_GRAPH = Object.freeze(Object.fromEntries(Object.entries(CAPABILITY_PROBE_TRANSITIONS).map(([key, value]) => [key, Object.freeze([...value])])));
