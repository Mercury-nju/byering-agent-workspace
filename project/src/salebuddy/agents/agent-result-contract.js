/**
 * Shared result contract for every Agent delivery.
 * Keep domain-specific fields alongside this stable projection so new Agents
 * can add data without making the Results Center depend on their implementation.
 */

export const AGENT_RESULT_SCHEMA_VERSION = 1;

export const RESULT_COLLECTION_FIELDS = Object.freeze([
  "items",
  "evidence",
  "decisions",
  "actions",
  "artifacts",
  "events",
  "scanSummaries",
  "candidateEvidence",
  "approvalHistory",
  "submissions",
  "receipts",
  "retries",
  "replies",
  "handoff",
  "errors"
]);

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function text(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function firstArray(...values) {
  const arrays = values.filter((value) => Array.isArray(value));
  return arrays.find((value) => value.length) || arrays[0] || [];
}

/**
 * Normalize the universal portion of an Agent result while preserving all
 * domain fields. This is deliberately lossless for fields we do not know yet.
 */
export function normalizeAgentResultSnapshot(snapshot = {}, context = {}) {
  const source = object(snapshot);
  const normalized = {
    ...clone(source),
    schemaVersion: Number(source.schemaVersion) || AGENT_RESULT_SCHEMA_VERSION,
    contract: text(source.contract, "byering.agent_result"),
    taskId: text(source.taskId || source.task_id, text(context.taskId)),
    taskRunId: text(source.taskRunId || source.task_run_id, text(context.taskRunId)),
    agentId: text(source.agentId || source.agent_id, text(context.agentId)),
    agentName: text(source.agentName || source.agent_name, text(context.agentName)),
    accountId: text(source.accountId || source.account_id, text(context.accountId)),
    status: text(source.status, text(context.status, "completed")),
    source: text(source.source, text(context.source, "Agent 任务")),
    sourceScope: clone(source.sourceScope ?? context.sourceScope ?? null),
    title: text(source.title || source.name, text(context.title)),
    summary: text(source.summary || source.description, text(context.summary)),
    counts: clone(object(source.counts)),
    metrics: clone(source.metrics == null ? {} : source.metrics),
    generatedAt: text(source.generatedAt || source.generated_at, text(context.generatedAt, new Date().toISOString()))
  };

  normalized.inputs = clone(source.inputs || source.input || source.scope || context.inputs || {});
  normalized.items = clone(firstArray(source.items, source.matches, source.matched, source.comments, source.leads, source.qualified));
  normalized.evidence = clone(firstArray(source.evidence, source.sources));
  normalized.decisions = clone(firstArray(source.decisions, source.judgements, source.judgments));
  normalized.actions = clone(firstArray(source.actions, source.nextActions, source.next_actions));
  normalized.artifacts = clone(array(source.artifacts));
  normalized.events = clone(array(source.events));
  normalized.handoff = clone(source.handoff || source.nextStep || source.next_step || {});
  normalized.errors = clone(firstArray(source.errors, source.error ? [source.error] : []));

  for (const field of RESULT_COLLECTION_FIELDS) {
    if (field in source && field !== "items" && field !== "evidence" && field !== "decisions" && field !== "actions" && field !== "artifacts" && field !== "events" && field !== "handoff" && field !== "errors") {
      normalized[field] = clone(array(source[field]));
    }
  }
  return normalized;
}

export function resultItemKey(value) {
  if (value == null) return "null";
  if (typeof value !== "object") return String(value);
  return text(
    value.eventId || value.id || value.itemId || value.messageId || value.message_id || value.commentId || value.comment_id
      || value.leadId || value.lead_id || value.accountId || value.account_id
      || value.receiptId || value.receipt_id || value.submissionId || value.submission_id
      || value.replyId || value.reply_id || value.url || value.profileUrl
  ) || JSON.stringify(value);
}

export function mergeResultCollection(previous = [], next = []) {
  const values = [...array(previous), ...array(next)];
  const positions = new Map();
  const merged = [];
  values.forEach((value) => {
    const key = resultItemKey(value);
    if (positions.has(key)) merged[positions.get(key)] = clone(value);
    else {
      positions.set(key, merged.length);
      merged.push(clone(value));
    }
  });
  return merged;
}
