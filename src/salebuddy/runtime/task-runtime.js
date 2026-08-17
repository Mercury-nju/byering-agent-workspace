/**
 * Runtime task model shared by task runners and projections.
 * The runtime owns facts and the current snapshot; UI code only consumes them.
 */

const EVENT_TYPES = Object.freeze({
  user: "conversation.user_message",
  chief: "conversation.chief_message",
  "followup-user": "conversation.user_message",
  "followup-chief": "conversation.chief_message",
  "auth-required": "access.authorization_required",
  "auth-started": "access.authorization_started",
  "auth-granted": "access.authorization_granted",
  "scope-required": "access.scope_requested",
  "scope-confirmed": "access.scope_confirmed",
  "requirement-required": "task.requirement_requested",
  "requirement-confirmed": "task.requirement_confirmed",
  "assignment-plan": "plan.assignment_proposed",
  brief: "plan.briefed",
  "progress-start": "task.started",
  progress: "task.progress",
  "sub-accepted": "skill.accepted",
  "sub-show": "skill.accepted",
  "sub-started": "skill.started",
  "sub-log": "skill.progress",
  "sub-done": "skill.completed",
  file: "artifact.created",
  "approval-show": "approval.requested",
  "approval-resolved": "approval.resolved",
  summary: "task.completed",
  "run-started": "RUN_STARTED",
  dispatch: "DISPATCH",
  "sub-start": "SUB_START",
  "sub-error": "ERROR",
  "task-error": "RUN_ERROR",
  "task-blocked": "CANCEL",
  handoff: "HUMAN_TAKEOVER",
  "run-finished": "RUN_FINISHED"
});

const INITIAL_SNAPSHOT = Object.freeze({
  taskState: "RUNNING",
  progress: 0,
  activeSkill: null,
  skills: {},
  approvals: [],
  evidence: []
});

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function safePart(value, fallback) {
  return String(value || fallback).replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-|-$/g, "") || fallback;
}

function skillIdentity(runtime, input) {
  const skillId = safePart(input.skillId, `skill-${input.i ?? 0}`);
  return {
    skillId,
    skillRunId: input.skillRunId || `skillrun-${safePart(runtime.task.id, "task")}-${skillId}`
  };
}

function normalizeAgent(agent = {}) {
  return {
    id: agent.id || "generalist",
    name: agent.name || "项目执行 Agent",
    role: agent.role || "按任务计划执行并汇报证据",
    type: agent.type || "professional_agent"
  };
}

function createInitialSnapshot() {
  return clone(INITIAL_SNAPSHOT);
}

function syncAggregateState(runtime) {
  const state = runtime.snapshot.taskState;
  runtime.task.state = state;
  runtime.agentRun.state = state;
  runtime.plan.state = state === "SUCCEEDED" ? "COMPLETED" : state === "FAILED" ? "FAILED" : "ACTIVE";
}

export function createRuntimeTask({
  taskId,
  taskText = "",
  scriptKey = "generic",
  projectId = null,
  projectName = "",
  online = false,
  agent,
  goal = {},
  planNodes = []
} = {}) {
  const id = taskId || `task-${Date.now().toString(36)}`;
  const professionalAgent = normalizeAgent(agent);
  const goalId = `goal-${safePart(id, "task")}`;
  const taskRunId = `taskrun-${safePart(id, "task")}`;
  const agentRunId = `agentrun-${safePart(id, "task")}-${safePart(professionalAgent.id, "agent")}`;

  return {
    schemaVersion: 1,
    goal: {
      id: goalId,
      type: goal.type || scriptKey.toUpperCase(),
      objective: goal.objective || taskText,
      acceptanceCriteria: clone(goal.acceptanceCriteria || []),
      constraints: clone(goal.constraints || {}),
      source: goal.source || "conversation"
    },
    task: {
      id,
      taskRunId,
      text: taskText,
      projectId,
      projectName,
      scriptKey,
      online: Boolean(online),
      state: "RUNNING"
    },
    plan: {
      id: `plan-${safePart(id, "task")}`,
      version: 1,
      state: "ACTIVE",
      nodes: clone(planNodes)
    },
    agentRun: {
      id: agentRunId,
      agentId: professionalAgent.id,
      name: professionalAgent.name,
      role: professionalAgent.role,
      type: professionalAgent.type,
      state: "RUNNING"
    },
    events: [],
    snapshot: createInitialSnapshot()
  };
}

function applyEvent(snapshot, event) {
  const next = clone(snapshot);
  const { type } = event;

  if (type === "task.started") next.taskState = "RUNNING";
  if (type === "access.authorization_required" || type === "access.authorization_started" || type === "access.authorization_granted" || type === "access.scope_requested") next.taskState = "WAITING_ACCESS";
  if (type === "task.requirement_requested") next.taskState = "WAITING_REQUIREMENT";
  if (type === "access.scope_confirmed") next.taskState = "RUNNING";
  if (type === "task.requirement_confirmed") next.taskState = "RUNNING";
  if (type === "plan.assignment_proposed") next.taskState = "WAITING_ACCESS";
  if (type === "task.progress") next.progress = Math.max(0, Math.min(100, Number(event.pct) || 0));
  if (type === "task.completed") {
    next.taskState = "SUCCEEDED";
    next.progress = 100;
  }
  if (type === "task.failed") next.taskState = "FAILED";
  if (type === "RUN_ERROR") next.taskState = "FAILED";
  if (type === "CANCEL") next.taskState = "BLOCKED";

  if (type === "skill.accepted" || type === "skill.started" || type === "skill.progress" || type === "skill.completed") {
    const current = next.skills[event.skillRunId] || {
      skillRunId: event.skillRunId,
      skillId: event.skillId,
      skill: event.skill,
      executor: event.executor || "",
      state: "QUEUED",
      progress: 0,
      evidence: [],
      logs: []
    };
    if (type === "skill.started") current.state = "RUNNING";
    if (type === "skill.progress") {
      current.state = "RUNNING";
      current.logs.push({ text: event.text || "", sequence: event.sequence });
      current.progress = Math.max(current.progress, Number(event.pct) || 0);
    }
    if (type === "skill.completed") {
      current.state = "SUCCEEDED";
      current.progress = 100;
    }
    if (Array.isArray(event.evidence)) current.evidence.push(...clone(event.evidence));
    next.skills[event.skillRunId] = current;
    next.activeSkill = clone(current);
  }

  if (type === "approval.requested") {
    next.taskState = "WAITING_APPROVAL";
    const approval = clone(event.approval || { id: `approval-${event.sequence}`, state: "PENDING" });
    next.approvals = next.approvals.filter((item) => item.id !== approval.id);
    next.approvals.push(approval);
  }
  if (type === "approval.resolved") {
    const approvalId = event.approval?.id || event.approvalId;
    next.approvals = next.approvals.map((item) => item.id === approvalId ? { ...item, state: event.ok ? "APPROVED" : "REJECTED" } : item);
    next.taskState = event.ok ? "RUNNING" : "BLOCKED";
  }

  if (type === "artifact.created") {
    next.evidence.push({
      type: "artifact",
      id: event.id,
      label: event.name,
      ref: event.id
    });
  }
  if (Array.isArray(event.evidence)) next.evidence.push(...clone(event.evidence));
  return next;
}

export function appendRuntimeEvent(runtime, input = {}) {
  const sequence = runtime.events.length + 1;
  const identity = skillIdentity(runtime, input);
  const event = {
    id: `evt-${safePart(runtime.task.id, "task")}-${String(sequence).padStart(4, "0")}`,
    sequence,
    occurredAt: input.occurredAt || new Date().toISOString(),
    type: input.type || EVENT_TYPES[input.t] || "runtime.event",
    t: input.t || null,
    taskId: runtime.task.id,
    goalId: runtime.goal.id,
    taskRunId: runtime.task.taskRunId,
    agentRunId: input.agentRunId || runtime.agentRun.id,
    skillRunId: (input.skillId || input.skill || input.i != null) ? identity.skillRunId : null,
    skillId: input.skillId || null,
    skill: input.skill || null,
    executor: input.executor || null,
    ...clone(input)
  };
  runtime.events.push(event);
  runtime.snapshot = applyEvent(runtime.snapshot, event);
  syncAggregateState(runtime);
  return event;
}

export function getRuntimeSnapshot(runtime) {
  return clone(runtime.snapshot);
}

export function replayRuntimeEvents(runtime, events = []) {
  runtime.events = [];
  runtime.snapshot = createInitialSnapshot();
  for (const sourceEvent of events) {
    const event = clone(sourceEvent);
    runtime.events.push(event);
    runtime.snapshot = applyEvent(runtime.snapshot, event);
    syncAggregateState(runtime);
  }
  return runtime;
}

export function getRuntimeEventType(t) {
  return EVENT_TYPES[t] || "runtime.event";
}

export const RUNTIME_EVENT_TYPES = EVENT_TYPES;
