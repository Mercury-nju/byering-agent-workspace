/**
 * Runtime task model shared by task runners and projections.
 * The runtime owns facts and the current snapshot; UI code only consumes them.
 */

import { createInteractionState, reduceInteractionState } from "./interaction-state.js";
import {
  buildAgentContextFromRuntime,
  normalizeAgentEventPayload,
  normalizeAgentReference
} from "../agents/agent-runtime-adapter.js";

const EVENT_TYPES = Object.freeze({
  user: "conversation.user_message",
  chief: "conversation.chief_message",
  "followup-user": "conversation.user_message",
  "followup-chief": "conversation.chief_message",
  "chief-stream-start": "conversation.chief_stream_started",
  "chief-stream-delta": "conversation.chief_stream_delta",
  "chief-stream-end": "conversation.chief_stream_ended",
  "followup-stream-start": "conversation.followup_stream_started",
  "followup-stream-delta": "conversation.followup_stream_delta",
  "followup-stream-end": "conversation.followup_stream_ended",
  "auth-required": "access.authorization_required",
  "auth-started": "access.authorization_started",
  "auth-granted": "access.authorization_granted",
  "scope-required": "access.scope_requested",
  "scope-confirmed": "access.scope_confirmed",
  "requirement-proposed": "task.requirement_proposed",
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
  "result-updated": "task.result.updated",
  "approval-show": "approval.requested",
  "approval-resolved": "approval.resolved",
  "task-paused": "task.paused",
  "task-resumed": "task.resumed",
  "task-retry-requested": "task.retry_started",
  "task-cancelled": "task.cancelled",
  "account-resolved": "account.resolved",
  "lead-candidate": "lead.candidate",
  "lead-qualified": "lead.qualified",
  "lead-rejected": "lead.rejected",
  "lead-replied": "lead.replied",
  "lead-do-not-contact": "lead.do_not_contact",
  "outreach-ready": "outreach.ready",
  "outreach-scheduled": "outreach.scheduled",
  "outreach-sending": "outreach.sending",
  "outreach-sent": "outreach.sent",
  "delivery-checking": "delivery.checking",
  "outreach-failed": "outreach.failed",
  "outreach-unavailable": "outreach.unavailable",
  "requirement-edited": "task.requirement_edited",
  "followup-waiting": "conversation.followup_pending",
  "followup-failed": "conversation.followup_failed",
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
  taskState: "CREATED",
  progress: 0,
  activeSkill: null,
  skills: {},
  approvals: [],
  evidence: [],
  resolvedAccounts: [],
  resultSnapshot: null,
  artifacts: []
});

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function safePart(value, fallback) {
  return String(value || fallback).replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-|-$/g, "") || fallback;
}

function mergeResultSnapshot(previous, supplied) {
  if (!supplied || typeof supplied !== "object" || Array.isArray(supplied)) return clone(previous);
  const next = { ...(previous || {}), ...clone(supplied) };
  if (previous?.counts || supplied.counts) next.counts = { ...(previous?.counts || {}), ...(supplied.counts || {}) };
  if (previous?.outreach || supplied.outreach) next.outreach = { ...(previous?.outreach || {}), ...(supplied.outreach || {}) };
  if (previous?.leads && supplied.leads && typeof previous.leads === "object" && typeof supplied.leads === "object") {
    next.leads = { ...previous.leads, ...supplied.leads };
  }
  return next;
}

function resultMetric(snapshot, key, label, value) {
  if (!Number.isFinite(Number(value))) return;
  const metrics = Array.isArray(snapshot.metrics) ? [...snapshot.metrics] : [];
  const index = metrics.findIndex((item) => item?.key === key);
  const metric = { key, label, value: Number(value) };
  if (index >= 0) metrics[index] = { ...metrics[index], ...metric };
  else metrics.push(metric);
  snapshot.metrics = metrics;
}

function skillIdentity(runtime, input) {
  const skillId = safePart(input.skillId, `skill-${input.i ?? 0}`);
  return {
    skillId,
    skillRunId: input.skillRunId || `skillrun-${safePart(runtime.task.id, "task")}-${skillId}`
  };
}

function normalizeAgent(agent = {}) {
  const base = {
    id: agent.id || "generalist",
    name: agent.name || "项目执行 Agent",
    role: agent.role || "按任务计划执行并汇报证据",
    type: agent.type || "professional_agent"
  };
  try {
    const identity = normalizeAgentReference(agent);
    return {
      ...base,
      canonicalAgentId: identity.canonicalAgentId,
      legacyType: identity.legacyType,
      display: identity.display
    };
  } catch {
    // Generic and content-only demo roles remain compatible until they are
    // assigned a canonical Byering role by the backend.
    return { ...base, canonicalAgentId: null, legacyType: null, display: null };
  }
}

function createInitialSnapshot({ taskId = null, scenario = "generic" } = {}) {
  const snapshot = clone(INITIAL_SNAPSHOT);
  snapshot.interaction = createInteractionState({ taskId, scenario });
  return snapshot;
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
  leadId = null,
  online = false,
  agent,
  goal = {},
  planNodes = [],
  memoryRecords = [],
  evidence = [],
  policy,
  memoryLimit,
  memoryScopes
} = {}) {
  const id = taskId || `task-${Date.now().toString(36)}`;
  const professionalAgent = normalizeAgent(agent);
  const goalId = `goal-${safePart(id, "task")}`;
  const taskRunId = `taskrun-${safePart(id, "task")}`;
  const agentRunId = `agentrun-${safePart(id, "task")}-${safePart(professionalAgent.id, "agent")}`;
  const agentContext = tryBuildAgentContext({
    agent: professionalAgent,
    task: {
      id,
      title: scriptKey,
      goal: goal.objective || taskText,
      projectId,
      leadId,
      instructions: goal.instructions || []
    },
    memoryRecords,
    evidence,
    policy,
    memoryLimit,
    memoryScopes
  });

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
      state: "CREATED"
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
      canonicalAgentId: professionalAgent.canonicalAgentId,
      legacyType: professionalAgent.legacyType,
      name: professionalAgent.name,
      role: professionalAgent.role,
      type: professionalAgent.type,
      display: clone(professionalAgent.display),
      state: "CREATED"
    },
    agentContext,
    events: [],
    snapshot: createInitialSnapshot({ taskId: id, scenario: scriptKey })
  };
}

function applyEvent(snapshot, event) {
  const next = clone(snapshot);
  const type = event.type && event.type !== "runtime.event"
    ? event.type
    : EVENT_TYPES[event.t] || event.t;

  next.interaction = reduceInteractionState(next.interaction, event);

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
    const artifact = event.artifact || event.file || {
      id: event.id,
      name: event.name,
      type: event.ftype || "doc"
    };
    const artifactId = artifact.id || event.id || artifact.name;
    if (artifactId && !next.artifacts.some((item) => (item.id || item.name) === artifactId)) {
      next.artifacts.push(clone(artifact));
    }
    if (artifactId && !next.evidence.some((item) => item.type === "artifact" && item.id === artifactId)) {
      next.evidence.push({
        type: "artifact",
        id: artifactId,
        label: artifact.name || event.name || "未命名产出",
        ref: artifactId
      });
    }
  }
  if (type === "account.resolved" && event.account && typeof event.account === "object" && !Array.isArray(event.account)) {
    const account = clone(event.account);
    const identity = account.secId || account.sec_id || account.uid || account.uniqueId || account.unique_id;
    if (identity) {
      next.resolvedAccounts = next.resolvedAccounts.filter((item) => {
        const existing = item.secId || item.sec_id || item.uid || item.uniqueId || item.unique_id;
        return existing !== identity;
      });
      next.resolvedAccounts.push(account);
    }
  }
  if (type === "task.result.updated" || type === "result.snapshot.updated") {
    const supplied = event.resultSnapshot || event.result_snapshot || event.result;
    if (supplied && typeof supplied === "object" && !Array.isArray(supplied)) {
      next.resultSnapshot = mergeResultSnapshot(next.resultSnapshot, supplied);
    }
    const artifacts = Array.isArray(event.artifacts) ? event.artifacts : [];
    for (const artifact of artifacts) {
      if (!artifact || typeof artifact !== "object") continue;
      const artifactId = artifact.id || artifact.name;
      if (artifactId && !next.artifacts.some((item) => (item.id || item.name) === artifactId)) {
        next.artifacts.push(clone(artifact));
      }
      if (artifactId && !next.evidence.some((item) => item.type === "artifact" && item.id === artifactId)) {
        next.evidence.push({ type: "artifact", id: artifactId, label: artifact.name || "未命名产出", ref: artifactId });
      }
    }
  }

  // Keep a small, deterministic result projection available before the final
  // task.completed event. This lets the result card and dashboard update as
  // ClueHunter reports each lead, touch, and reply.
  const resultEvent = type === "lead.source.synced"
    || type === "lead.candidate"
    || type === "lead.qualified"
    || type === "outreach.sent"
    || type === "outreach.failed"
    || type === "lead.replied";
  if (resultEvent) {
    const supplied = event.resultSnapshot || event.result_snapshot || event.result;
    const snapshot = mergeResultSnapshot(next.resultSnapshot, supplied) || { source: event.source || "gateway" };
    next.resultSnapshot = snapshot;
    if (type === "lead.source.synced" || type === "lead.candidate" || type === "lead.qualified") {
      const value = event.leadCount ?? event.count ?? (Array.isArray(event.leads) ? event.leads.length : null);
      if (value != null) {
        snapshot.leads = value;
        snapshot.counts = { ...(snapshot.counts || {}), leads: Number(value) || 0 };
        resultMetric(snapshot, "leads", "线索", value);
      }
      if (type === "lead.qualified") {
        const qualified = Number(snapshot.counts?.qualifiedLeads || 0) + 1;
        snapshot.counts = { ...(snapshot.counts || {}), qualifiedLeads: qualified };
        resultMetric(snapshot, "qualified_leads", "有效线索", qualified);
      }
    }
    if (type === "outreach.sent" || type === "outreach.failed") {
      const outreach = { ...(snapshot.outreach || {}) };
      const key = type === "outreach.sent" ? "sent" : "failed";
      outreach[key] = Number(outreach[key] || 0) + 1;
      outreach.lastEvent = type;
      snapshot.outreach = outreach;
      snapshot.counts = { ...(snapshot.counts || {}), outreach: Number(snapshot.counts?.outreach || 0) + 1 };
      resultMetric(snapshot, "outreach", "触达", snapshot.counts.outreach);
    }
    if (type === "lead.replied") {
      const replies = Number(snapshot.counts?.replies || 0) + 1;
      snapshot.counts = { ...(snapshot.counts || {}), replies };
      resultMetric(snapshot, "replies", "回复", replies);
    }
    snapshot.updatedAt = event.occurredAt || new Date().toISOString();
  }
  if (Array.isArray(event.evidence)) next.evidence.push(...clone(event.evidence));
  if (next.interaction.taskState !== "CREATED") next.taskState = next.interaction.taskState;
  return next;
}

export function appendRuntimeEvent(runtime, input = {}) {
  const sequence = runtime.events.length + 1;
  const identity = skillIdentity(runtime, input);
  const source = normalizeEventAgentIdentity(input);
  const {
    id: _sourceId,
    sequence: _sourceSequence,
    taskId: _sourceTaskId,
    goalId: _sourceGoalId,
    taskRunId: _sourceTaskRunId,
    agentRunId: sourceAgentRunId,
    skillRunId: _sourceSkillRunId,
    skillId: sourceSkillId,
    skill: sourceSkill,
    executor: sourceExecutor,
    occurredAt: sourceOccurredAt,
    type: sourceType,
    t: sourceTypeName,
    ...payload
  } = source;
  const event = {
    ...payload,
    id: `evt-${safePart(runtime.task.id, "task")}-${String(sequence).padStart(4, "0")}`,
    sequence,
    occurredAt: sourceOccurredAt || new Date().toISOString(),
    type: sourceType || EVENT_TYPES[sourceTypeName] || "runtime.event",
    t: sourceTypeName || null,
    taskId: runtime.task.id,
    goalId: runtime.goal.id,
    taskRunId: runtime.task.taskRunId,
    agentRunId: sourceAgentRunId || runtime.agentRun.id,
    skillRunId: (sourceSkillId || sourceSkill || source.i != null) ? identity.skillRunId : null,
    skillId: sourceSkillId || null,
    skill: sourceSkill || null,
    executor: sourceExecutor || null
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
  runtime.snapshot = createInitialSnapshot({ taskId: runtime.task.id, scenario: runtime.task.scriptKey });
  const seen = new Set();
  const ordered = events
    .map((event, index) => ({ event, index }))
    .filter(({ event }) => !event?.taskId || event.taskId === runtime.task.id)
    .filter(({ event }) => {
      const key = event?.id || (event?.remoteEventId ? `remote:${event.remoteEventId}` : null);
      if (!key || seen.has(key)) return !key;
      seen.add(key);
      return true;
    })
    .sort((a, b) => {
      const aSeq = Number(a.event?.sequence ?? a.event?.remoteSeq);
      const bSeq = Number(b.event?.sequence ?? b.event?.remoteSeq);
      if (Number.isFinite(aSeq) && Number.isFinite(bSeq) && aSeq !== bSeq) return aSeq - bSeq;
      return a.index - b.index;
    })
    .map(({ event }) => event);
  for (const sourceEvent of ordered) {
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

function tryBuildAgentContext(input) {
  if (!input?.agent?.canonicalAgentId) return null;
  try {
    return buildAgentContextFromRuntime(input);
  } catch {
    return null;
  }
}

function normalizeEventAgentIdentity(input) {
  const source = clone(input) || {};
  const hasIdentity = [
    source.agent,
    source.subagent,
    source.agentId,
    source.canonicalId,
    source.canonicalAgentId,
    source.legacyType,
    source.legacyAgentType,
    source.agentType,
    source.agentName,
    source.displayName
  ].some(Boolean);
  if (!hasIdentity) return source;
  try {
    return normalizeAgentEventPayload(source);
  } catch {
    // Preserve unknown demo roles; the backend adapter can reject them when
    // the task is switched to server-authoritative execution.
    return source;
  }
}
