/**
 * Runtime compatibility layer for the canonical Byering Agent foundation.
 *
 * The renderer still speaks in legacy agentType values while the backend
 * needs stable canonical ids. This module translates at the boundary and
 * keeps user-facing display fields intact.
 */

import {
  LEGACY_AGENT_ALIASES,
  createAgentContext,
  getAgentManifest,
  resolveAgentId
} from "./agent-foundation.js";

/** Scenario ids emitted by the existing task-runner demos. */
export const SCENARIO_AGENT_ALIASES = Object.freeze({
  lead_hunter: "lead_miner",
  outreach_strategist: "outreach_specialist",
  result_analyst: "lead_analyst"
});

/** Scenario roles with no honest canonical equivalent yet. */
export const UNSUPPORTED_RUNTIME_AGENT_ALIASES = Object.freeze({
  "File Agent": "内容策划尚未纳入当前 foundation 九角色，不做强行映射。",
  content_operator: "内容策划尚未纳入当前 foundation 九角色，不做强行映射。",
  project_operator: "项目执行不是独立岗位，必须由幕僚长按任务拆解，不做隐式映射。"
});

export const LEGACY_DISPLAY_NAMES = Object.freeze({
  main: "Byering · 幕僚长",
  "Strategy Agent": "获客策略师",
  "Browser Agent": "线索猎人",
  "Search Agent": "数据分析师",
  "Research Agent": "客户研究员",
  "App Agent": "销售顾问",
  "Risk Agent": "风控专员",
  "Outreach Agent": "外联专员",
  "Outreach Ops Agent": "触达运营专员"
});

const LEGACY_FOR_CANONICAL = Object.freeze(Object.fromEntries(
  Object.entries(LEGACY_AGENT_ALIASES).map(([legacyType, canonicalId]) => [canonicalId, legacyType])
));

const GENERIC_RUNTIME_TYPES = new Set([
  "agent",
  "assistant",
  "professional_agent",
  "subagent",
  "system"
]);

/**
 * Resolve a canonical id while retaining foundation's strict error behavior.
 * Runtime scenario aliases are accepted only where their semantics are exact.
 */
export function resolveRuntimeAgentId(input) {
  const raw = normalizeString(input);
  if (!raw) return resolveAgentId(raw);
  if (Object.hasOwn(SCENARIO_AGENT_ALIASES, raw)) return SCENARIO_AGENT_ALIASES[raw];
  if (Object.hasOwn(UNSUPPORTED_RUNTIME_AGENT_ALIASES, raw)) {
    throw new Error(`Unsupported runtime agent alias: ${raw}. ${UNSUPPORTED_RUNTIME_AGENT_ALIASES[raw]}`);
  }
  return resolveAgentId(raw);
}

/** Alias used by callers that do not need to distinguish runtime from UI refs. */
export const resolveAgentReferenceId = resolveRuntimeAgentId;

/** Return the legacy renderer type for a canonical or runtime scenario id. */
export function legacyAgentTypeFor(input) {
  const canonicalId = resolveRuntimeAgentId(input);
  return LEGACY_FOR_CANONICAL[canonicalId];
}

/**
 * Normalize a profile/string reference into stable identity and display data.
 * The returned object is detached from the input and safe to hand to UI code.
 */
export function normalizeAgentReference(input) {
  const source = isRecord(input) ? input : {};
  const raw = isRecord(input) ? extractReference(source) : input;
  const canonicalId = resolveRuntimeAgentId(raw);
  const manifest = getAgentManifest(canonicalId);
  const legacyType = LEGACY_FOR_CANONICAL[canonicalId];
  const identity = isRecord(source.identity) ? source.identity : {};
  const roleValue = typeof source.role === "string"
    ? source.role
    : normalizeString(source.role?.position || source.role?.name);
  const displayName = firstString(
    source.displayName,
    source.agentName,
    source.name,
    identity.name,
    LEGACY_DISPLAY_NAMES[legacyType],
    manifest.displayName
  );
  const role = firstString(
    roleValue,
    source.position,
    identity.role,
    manifest.role
  );
  const title = firstString(source.title, identity.title, manifest.role);
  const avatar = source.avatar ?? identity.avatar ?? null;
  const status = firstString(source.status, source.state);

  return {
    canonicalId,
    canonicalAgentId: canonicalId,
    agentId: canonicalId,
    legacyType,
    legacyAgentType: legacyType,
    agentType: legacyType,
    displayName,
    name: displayName,
    role,
    title,
    avatar: cloneValue(avatar),
    status: status || null,
    manifest,
    display: {
      displayName,
      name: displayName,
      role,
      title,
      avatar: cloneValue(avatar),
      status: status || null
    }
  };
}

export const normalizeAgentRef = normalizeAgentReference;
export const resolveAgentReference = normalizeAgentReference;

/**
 * Build foundation context from a runtime task/profile without leaking
 * runtime-only protocol fields or hidden reasoning content.
 */
export function buildAgentContextFromRuntime({
  agent,
  task,
  memoryRecords = [],
  evidence = [],
  policy,
  memoryLimit,
  memoryScopes
} = {}) {
  const agentRef = normalizeAgentReference(agent);
  const normalizedTask = normalizeRuntimeTask(task);
  const foundationContext = createAgentContext({
    agentId: agentRef.canonicalId,
    task: normalizedTask,
    memory: {
      records: cloneValue(memoryRecords),
      limit: memoryLimit,
      scopes: memoryScopes
    },
    evidence: cloneValue(evidence),
    policy: cloneValue(policy)
  });

  const safeContext = {
    ...foundationContext,
    task: stripPrivateFields(foundationContext.task),
    relevantMemories: foundationContext.relevantMemories.map((item) => stripPrivateFields(item)),
    evidence: foundationContext.evidence.map((item) => stripPrivateFields(item))
  };

  return {
    ...safeContext,
    agent: agentRef,
    agentId: agentRef.canonicalId,
    canonicalAgentId: agentRef.canonicalId,
    legacyType: agentRef.legacyType,
    legacyAgentType: agentRef.legacyType,
    display: cloneValue(agentRef.display)
  };
}

/**
 * Normalize a subagent payload while preserving legacy display fields.
 * Existing consumers may continue reading agentType/agentName unchanged;
 * canonicalAgentId and agentRef provide the new backend identity.
 */
export function normalizeSubagentPayload(payload = {}) {
  if (!isRecord(payload)) throw new TypeError("Subagent payload must be an object");
  const source = cloneValue(payload);
  const agentRef = normalizeAgentReference(payload);
  const originalAgentType = firstString(payload.agentType, payload.legacyAgentType);
  const originalAgentId = firstString(payload.agentId, payload.canonicalAgentId, payload.canonicalId);
  const originalName = firstString(payload.agentName, payload.displayName, payload.name);

  return {
    ...source,
    agentId: agentRef.canonicalId,
    canonicalId: agentRef.canonicalId,
    canonicalAgentId: agentRef.canonicalId,
    legacyType: agentRef.legacyType,
    legacyAgentType: originalAgentType || agentRef.legacyType,
    // Keep the old value when one was supplied; this is what the renderer uses
    // to select the existing avatar/status skin.
    agentType: originalAgentType || agentRef.legacyType,
    legacyAgentId: originalAgentId || null,
    agentName: originalName || agentRef.displayName,
    displayName: originalName || agentRef.displayName,
    name: payload.name ?? originalName ?? agentRef.displayName,
    role: payload.role ?? agentRef.role,
    title: payload.title ?? agentRef.title,
    avatar: cloneValue(payload.avatar ?? agentRef.avatar),
    agentRef: cloneValue(agentRef),
    display: cloneValue(agentRef.display)
  };
}

export const normalizeAgentPayload = normalizeSubagentPayload;

/** Normalize an event's agent identity without changing event protocol fields. */
export function normalizeAgentEventPayload(event = {}) {
  if (!isRecord(event)) throw new TypeError("Agent event payload must be an object");
  const nestedAgent = isRecord(event.agent)
    ? { ...event.agent, ...pickAgentFields(event) }
    : normalizeString(event.agent)
      ? { agentType: event.agent, ...pickAgentFields(event) }
    : pickAgentFields(event);
  const normalized = normalizeSubagentPayload(nestedAgent);
  const output = {
    ...cloneValue(event),
    agentId: normalized.agentId,
    canonicalId: normalized.canonicalId,
    canonicalAgentId: normalized.canonicalAgentId,
    legacyType: normalized.legacyType,
    legacyAgentType: normalized.legacyAgentType,
    agentType: normalized.agentType,
    legacyAgentId: normalized.legacyAgentId,
    agentName: normalized.agentName,
    agentRef: normalized.agentRef,
    display: normalized.display
  };

  if (isRecord(event.agent) || normalizeString(event.agent)) output.agent = normalized;
  if (isRecord(event.subagent) || normalizeString(event.subagent)) {
    const subagent = isRecord(event.subagent)
      ? { ...event.subagent, ...pickAgentFields(event) }
      : { agentType: event.subagent, ...pickAgentFields(event) };
    output.subagent = normalizeSubagentPayload(subagent);
  }
  return stripPrivateFields(output);
}

export const normalizeRuntimeAgentEvent = normalizeAgentEventPayload;
export const normalizeAgentEvent = normalizeAgentEventPayload;
export const normalizeEventPayload = normalizeAgentEventPayload;

function extractReference(source) {
  const directFields = [
    ["canonicalId", source.canonicalId],
    ["canonicalAgentId", source.canonicalAgentId],
    ["agentId", source.agentId],
    ["legacyType", source.legacyType],
    ["agentType", source.agentType]
  ].filter(([, value]) => normalizeString(value));

  if (directFields.length) {
    const resolved = directFields.map(([field, value]) => ({ field, value, id: resolveRuntimeAgentId(value) }));
    const ids = new Set(resolved.map((item) => item.id));
    if (ids.size > 1) {
      throw new Error(`Conflicting agent references: ${resolved.map((item) => `${item.field}=${item.value}`).join(", ")}`);
    }
    return resolved[0].value;
  }

  const runtimeType = normalizeString(source.type);
  if (runtimeType && !GENERIC_RUNTIME_TYPES.has(runtimeType)) return runtimeType;
  const id = normalizeString(source.id);
  if (id) return id;
  const name = normalizeString(source.displayName || source.agentName || source.name || source.identity?.name);
  if (name) {
    const legacy = Object.entries(LEGACY_DISPLAY_NAMES).find(([, displayName]) => displayName === name)?.[0];
    if (legacy) return legacy;
    return name;
  }
  return null;
}

function pickAgentFields(event) {
  return compactObject({
    canonicalId: event.canonicalId,
    canonicalAgentId: event.canonicalAgentId,
    agentId: event.agentId,
    legacyType: event.legacyType,
    agentType: event.agentType,
    agentName: event.agentName,
    displayName: event.displayName,
    name: event.name,
    role: event.agentRole ?? event.role,
    title: event.agentTitle ?? event.title,
    avatar: event.agentAvatar ?? event.avatar,
    status: event.agentStatus ?? event.status,
    type: event.agentKind
  });
}

function normalizeRuntimeTask(task = {}) {
  const source = isRecord(task) ? task : { title: task };
  const projectId = firstString(source.projectId, source.project?.id, source.project?.projectId);
  const leadId = firstString(source.leadId, source.lead?.id, source.lead?.leadId);
  const taskId = firstString(source.id, source.taskId, source.taskRunId);
  const title = firstString(source.title, source.name, source.taskText, source.text, source.task);
  const goal = firstString(source.goal, source.objective, source.description);
  const instructions = Array.isArray(source.instructions)
    ? source.instructions
    : source.instruction ? [source.instruction] : [];

  return stripPrivateFields({
    id: taskId,
    title,
    goal,
    projectId,
    leadId,
    instructions
  });
}

function stripPrivateFields(value, seen = new WeakMap()) {
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return seen.get(value);
  if (value instanceof Date) return new Date(value.getTime());
  if (Array.isArray(value)) {
    const result = [];
    seen.set(value, result);
    for (const item of value) result.push(stripPrivateFields(item, seen));
    return result;
  }
  const result = {};
  seen.set(value, result);
  for (const [key, item] of Object.entries(value)) {
    if (/^(chain[_-]?of[_-]?thought|thoughts?|reasoning|internal[_-]?notes?|hidden[_-]?state)$/i.test(key)) continue;
    result[key] = stripPrivateFields(item, seen);
  }
  return result;
}

function cloneValue(value) {
  return stripPrivateFields(value);
}

function isRecord(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeString(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function firstString(...values) {
  for (const value of values) {
    const text = normalizeString(value);
    if (text) return text;
  }
  return null;
}

function compactObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== null));
}
