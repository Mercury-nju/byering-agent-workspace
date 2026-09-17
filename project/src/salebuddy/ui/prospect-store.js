import { mergeResultCollection, normalizeAgentResultSnapshot, RESULT_COLLECTION_FIELDS } from "../agents/agent-result-contract.js";
import { extractLeadContact } from "../agents/lead-capture.js";
import { personAvatarFallback, personAvatarUrl } from "./person-avatar.js";
const STORAGE_KEY = "byering.prospect-records.v1";

export const PROSPECT_STATUSES = Object.freeze({
  AUTOMATIC_OUTREACH: "待触达",
  WAITING_OUTREACH_CONFIRMATION: "待确认触达"
});

export function isManualOutreachReady(record = {}) {
  return record?.status === PROSPECT_STATUSES.WAITING_OUTREACH_CONFIRMATION;
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function text(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function contactFieldNames(contact = {}) {
  return ["phone", "email", "wechat"].filter((field) => Boolean(text(contact?.[field])));
}

function leadCaptureEvidenceKey(item = {}) {
  return text(item.messageId, [text(item.conversationId), text(item.observedAt), text(item.quote)].filter(Boolean).join(":"));
}

function mergeLeadCaptureEvidence(previous = [], next = []) {
  const all = [...(Array.isArray(previous) ? previous : []), ...(Array.isArray(next) ? next : [])];
  const seen = new Set();
  return all.filter((item) => {
    const key = leadCaptureEvidenceKey(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(-12);
}

export const RESULT_SOURCE_SCOPES = Object.freeze({
  OWN_COMMENTS: "own_account_comments",
  OWN_LIVE: "own_account_live",
  OWN_ALL_SIGNALS: "own_account_all_signals",
  OWN_INTERACTIONS: "own_account_interactions",
  OWN_INBOX: "own_inbox",
  PUBLIC_SEARCH: "public_search",
  PUBLIC_CONTENT: "public_content",
  USER_DIRECT: "user_direct",
  UNKNOWN: "unknown"
});

const CONTACTABLE_SOURCE_SCOPES = new Set([
  RESULT_SOURCE_SCOPES.OWN_COMMENTS,
  RESULT_SOURCE_SCOPES.OWN_LIVE,
  RESULT_SOURCE_SCOPES.OWN_ALL_SIGNALS,
  RESULT_SOURCE_SCOPES.OWN_INTERACTIONS,
  RESULT_SOURCE_SCOPES.OWN_INBOX
]);

function sourceScopeValue(value) {
  if (value && typeof value === "object") {
    return sourceScopeValue(value.kind || value.type || value.sourceScope || value.scope || value.origin);
  }
  return text(value).toLowerCase().replace(/[\s-]+/g, "_");
}

export function normalizeResultSourceScope(value) {
  const scope = sourceScopeValue(value);
  if (!scope) return RESULT_SOURCE_SCOPES.UNKNOWN;
  if (["authorized_account_comments", "authorized_account_works", "own_account_comments", "own_works", "self_comments", "own_comments"].includes(scope)) return RESULT_SOURCE_SCOPES.OWN_COMMENTS;
  if (["authorized_account_live", "own_account_live", "self_live", "own_live"].includes(scope)) return RESULT_SOURCE_SCOPES.OWN_LIVE;
  if (["authorized_account_all_signals", "own_account_all_signals", "self_account_all_signals"].includes(scope)) return RESULT_SOURCE_SCOPES.OWN_ALL_SIGNALS;
  if (["authorized_account_interactions", "own_account_interactions", "own_interactions", "self_interactions"].includes(scope)) return RESULT_SOURCE_SCOPES.OWN_INTERACTIONS;
  if (["authorized_account_inbox", "own_inbox", "inbox", "private_inbox"].includes(scope)) return RESULT_SOURCE_SCOPES.OWN_INBOX;
  if (["public_search", "public_content_search", "finder", "douyin_finder"].includes(scope)) return RESULT_SOURCE_SCOPES.PUBLIC_SEARCH;
  if (["public_content", "public_work_link", "public_work_analysis", "viral_work", "other_comments", "other_live", "public_comments", "comment_filter"].includes(scope)) return RESULT_SOURCE_SCOPES.PUBLIC_CONTENT;
  if (["user_direct", "direct", "direct_touch", "user_specified"].includes(scope)) return RESULT_SOURCE_SCOPES.USER_DIRECT;
  return RESULT_SOURCE_SCOPES.UNKNOWN;
}

export function resultSourceScope({ agentId = "", agentName = "", source = "", sourceScope = null, sourceResultType = "", resultType = "", resultSnapshot = {}, sourceContext = {} } = {}) {
  const explicit = normalizeResultSourceScope(sourceScope || sourceContext?.sourceScope || resultSnapshot?.inputs?.sourceScope || resultSnapshot?.sourceScope);
  if (explicit !== RESULT_SOURCE_SCOPES.UNKNOWN) return explicit;
  if (sourceResultType === "抖音找人" || resultType === "抖音找人") return RESULT_SOURCE_SCOPES.PUBLIC_SEARCH;
  if (agentId === "mkt-find-people") return RESULT_SOURCE_SCOPES.OWN_INTERACTIONS;
  if (/直播间互动|直播间弹幕|直播找人/.test(`${source} ${agentName}`)) return RESULT_SOURCE_SCOPES.OWN_LIVE;
  if (agentId === "mkt-comment-acquisition") return RESULT_SOURCE_SCOPES.OWN_ALL_SIGNALS;
  if (/已授权账号|自有账号|我的账号/.test(`${source} ${agentName}`)) return RESULT_SOURCE_SCOPES.OWN_INTERACTIONS;
  if (["mkt-dm-inbox", "mkt-gold-customer-service"].includes(agentId) || /私信承接|私信回复|收件箱|金牌客服/.test(`${source} ${agentName}`)) return RESULT_SOURCE_SCOPES.OWN_INBOX;
  if (/商品作品评论区|账号主页与粉丝列表/.test(`${source}`)) return RESULT_SOURCE_SCOPES.PUBLIC_CONTENT;
  if (agentId === "mkt-cold-writer" || resultType === "触达记录") return RESULT_SOURCE_SCOPES.USER_DIRECT;
  if (/作品评论|评论区/.test(`${source} ${agentName}`) || /lead|prospect|潜客/i.test(`${agentId} ${agentName}`)) return RESULT_SOURCE_SCOPES.OWN_COMMENTS;
  return RESULT_SOURCE_SCOPES.UNKNOWN;
}

export function contactabilityFor(input = {}) {
  const sourceScope = resultSourceScope(input);
  const allowed = CONTACTABLE_SOURCE_SCOPES.has(sourceScope);
  const reason = allowed
    ? "来自用户已授权账号的作品、直播或互动"
    : sourceScope === RESULT_SOURCE_SCOPES.PUBLIC_SEARCH
      ? "抖音找人结果来自公域，仅用于分析，不能直接触达"
      : sourceScope === RESULT_SOURCE_SCOPES.USER_DIRECT
        ? "用户直接指定触达对象，不代表潜客意向"
        : "当前来源仅支持分析，未获得可触达资格";
  return { allowed, sourceScope, reason };
}

export function isContactableRecord(record = {}) {
  if (record?.contactability && typeof record.contactability.allowed === "boolean") return record.contactability.allowed;
  const scope = normalizeResultSourceScope(record?.contactability?.sourceScope || record?.sourceScope || record?.source?.sourceScope || record?.source?.type || record?.source?.sourceResultType);
  if (scope !== RESULT_SOURCE_SCOPES.UNKNOWN) return CONTACTABLE_SOURCE_SCOPES.has(scope);
  const sourceText = [
    typeof record?.source === "string" ? record.source : "",
    record?.source?.type,
    record?.source?.source,
    record?.source?.resultType,
    record?.source?.agentId,
    record?.source?.sourceResultType,
    record?.owner
  ].filter(Boolean).join(" ").toLowerCase();
  if (/抖音找人|公域|公开搜索|public_search|public_content|finder/.test(sourceText)) return false;
  if (/直接触达|用户指定|user_direct|direct_touch/.test(sourceText) || Array.isArray(record?.tags) && record.tags.includes("直接触达")) return false;
  return true;
}

export function resultOwnerKey({ agentId = "", taskId = "", accountId = "" } = {}) {
  return [agentId, taskId, accountId].map((value) => text(value)).join("::");
}

const INCREMENTAL_RUN_FIELDS = Object.freeze(RESULT_COLLECTION_FIELDS);

function tierLabel(tier) {
  return tier === "high" ? "高意向" : tier === "medium" ? "中意向" : tier === "low" ? "低意向" : "待分析";
}

function identityOf(lead) {
  return text(lead?.secUid || lead?.sec_uid || lead?.externalUserId || lead?.uniqueId || lead?.unique_id || lead?.leadId || lead?.id);
}

function migrateLegacyOutreachStatus(record = {}) {
  if (!isRecord(record) || record.status !== PROSPECT_STATUSES.AUTOMATIC_OUTREACH) return record;
  const source = isRecord(record.source) ? record.source : {};
  const sourceText = [record.agentId, record.owner, source.agentId, source.type, source.agentName, source.intentAgentId, source.intentAgentName]
    .filter(Boolean)
    .join(" ");
  if (!sourceText.includes("mkt-intent-analyst") && !sourceText.includes("客户分析员") && !sourceText.includes("客户分析结果")) return record;
  const tags = Array.isArray(record.tags)
    ? record.tags.filter((tag) => ![PROSPECT_STATUSES.AUTOMATIC_OUTREACH, PROSPECT_STATUSES.WAITING_OUTREACH_CONFIRMATION].includes(tag))
    : [];
  return {
    ...record,
    status: PROSPECT_STATUSES.WAITING_OUTREACH_CONFIRMATION,
    tags: [...new Set([...tags, PROSPECT_STATUSES.WAITING_OUTREACH_CONFIRMATION])]
  };
}

function readState(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem(STORAGE_KEY) || "null");
    if (isRecord(parsed)) return {
      records: isRecord(parsed.records)
        ? Object.fromEntries(Object.entries(parsed.records).map(([id, record]) => [id, migrateLegacyOutreachStatus(record)]))
        : {},
      runs: Array.isArray(parsed.runs) ? parsed.runs : [],
      sync: normalizeSyncState(parsed.sync)
    };
  } catch { /* local storage may be unavailable or contain an old value */ }
  return { records: {}, runs: [], sync: normalizeSyncState() };
}

function normalizeSyncState(value = {}) {
  const source = isRecord(value) ? value : {};
  return {
    pending: Boolean(source.pending),
    attempts: Math.max(0, Math.floor(Number(source.attempts) || 0)),
    lastError: text(source.lastError),
    lastSyncedAt: text(source.lastSyncedAt) || null
  };
}

function safeStorage(storage) {
  if (!storage || typeof storage.getItem !== "function" || typeof storage.setItem !== "function") return null;
  try { storage.getItem(STORAGE_KEY); return storage; } catch { return null; }
}

function mergeEvidence(previous = [], next = []) {
  const all = [...(Array.isArray(previous) ? previous : []), ...(Array.isArray(next) ? next : [])];
  const seen = new Set();
  return all.filter((item) => {
    const key = `${item?.videoId || ""}:${item?.observedAt || ""}:${item?.quote || item?.text || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 12);
}

function sourceLabel(sourceContext, lead) {
  return text(sourceContext?.source || lead?.source?.type, "作品评论");
}

function hasBusinessPayload(snapshot = {}) {
  const businessCollections = [
    "items",
    "evidence",
    "decisions",
    "actions",
    "artifacts",
    "scanSummaries",
    "candidateEvidence",
    "approvalHistory",
    "submissions",
    "receipts",
    "replies"
  ];
  const hasCollection = businessCollections.some((field) => Array.isArray(snapshot?.[field]) && snapshot[field].length > 0);
  const hasDomainCollection = ["leads", "comments", "matches", "accounts"].some((field) => Array.isArray(snapshot?.[field]) && snapshot[field].length > 0);
  const counts = snapshot?.counts;
  const hasCounts = Boolean(counts && typeof counts === "object" && Object.keys(counts).length > 0);
  return hasCollection || hasDomainCollection || hasCounts;
}

function resultTypeFor({ agentId, agentName, resultSnapshot = {}, sourceContext = {} } = {}) {
  const haystack = [agentId, agentName, resultSnapshot?.analysis?.mode, sourceContext?.source].filter(Boolean).join(" ").toLowerCase();
  const hasPayload = hasBusinessPayload(resultSnapshot);
  const collectionOnly = resultSnapshot?.analysis?.mode === "collect" || resultSnapshot?.inputs?.analysisMode === "collect";
  if (agentId === "mkt-find-people" && collectionOnly) return "互动用户";
  if (agentId === "mkt-find-people") {
    const sourceScope = resultSourceScope({ agentId, agentName, resultSnapshot, sourceContext });
    return CONTACTABLE_SOURCE_SCOPES.has(sourceScope) ? "潜客" : "抖音找人";
  }
  if (agentId === "mkt-intent-analyst" && (resultSnapshot?.analysisKind === "account_report" || resultSnapshot?.inputs?.analysisKind === "account_report")) return "研究简报";
  if (agentId === "mkt-intent-analyst") return "潜客";
  if (agentId === "mkt-viral-work-analysis" && ["completed", "partial"].includes(String(resultSnapshot?.status || "").toLowerCase())) return "研究简报";
  if (hasPayload && /comment|评论|筛选|filter/.test(haystack)) return "评论筛选";
  if (hasPayload && (Array.isArray(resultSnapshot?.leads) || /lead|prospect|潜客/.test(haystack))) return "潜客";
  if (hasPayload && /research|brief|研究|画像/.test(haystack)) return "研究简报";
  if (hasPayload && /copy|content|文案|内容/.test(haystack)) return "内容产出";
  if (hasPayload && /outreach|dm|触达|私信|发送/.test(haystack)) return "触达记录";
  if (resultSnapshot?.error || /error|异常|失败|failed/.test(haystack) || ["failed", "error", "FAILED", "ERROR"].includes(resultSnapshot?.status)) return "错误";
  if (resultSnapshot?.capability || /capability|能力探针|实时能力/.test(haystack)) return "实时能力";
  if (/runtime|运行摘要|任务状态|实时任务/.test(haystack) || (!hasPayload && ["running", "pending", "partial", "degraded"].includes(String(resultSnapshot?.status || "").toLowerCase()))) return "运行摘要";
  return "其他成果";
}

function resultTitleFor(type, { agentId, agentName, resultSnapshot = {} } = {}) {
  const snapshotTitle = text(resultSnapshot?.title || resultSnapshot?.name);
  if (snapshotTitle) return snapshotTitle;
  if (type === "评论筛选") return `${text(resultSnapshot?.query, "评论")}筛选结果`;
  if (type === "抖音找人") return `${text(resultSnapshot?.goal || resultSnapshot?.query, "抖音候选账号")} · 找人结果`;
  if (type === "互动用户") return "账号互动用户汇总";
  if (agentId === "mkt-intent-analyst") return "客户分析结果";
  if (agentId === "mkt-viral-work-analysis") return "爆款作品分析报告";
  return {
    潜客: "潜客意向表单",
    互动用户: "账号互动用户汇总",
    评论筛选: "评论筛选结果",
    研究简报: "客户分析简报",
    内容产出: "内容产出",
    触达记录: "触达执行记录",
    用户调研: "用户调研投放结果",
    运行摘要: "获客任务运行摘要",
    实时能力: "实时能力状态",
    错误: "获客任务异常",
    其他成果: "Agent 任务结果"
  }[type] || `${agentName || "Agent"} 任务结果`;
}

function resultSummaryFor(type, { agentId, resultSnapshot = {}, sourceContext = {}, status = "unknown" } = {}) {
  const normalized = String(status || "unknown").toLowerCase();
  const explicitSummary = text(resultSnapshot?.summary || resultSnapshot?.description || resultSnapshot?.analysis?.summary);
  if (explicitSummary) return explicitSummary;
  if (type === "互动用户") {
    const counts = isRecord(resultSnapshot?.counts) ? resultSnapshot.counts : {};
    const collected = Number(counts.collected ?? counts.candidates ?? counts.discovered ?? 0);
    return `已汇总 ${collected} 位账号互动用户，保留原始来源证据，等待客户分析员判断。`;
  }
  if (type === "抖音找人") {
    const counts = isRecord(resultSnapshot?.counts) ? resultSnapshot.counts : {};
    const discovered = Number(counts.discovered || 0);
    const matched = Number(counts.matched || 0);
    if (["completed", "succeeded", "success", "done"].includes(normalized)) return `已发现 ${discovered} 个候选账号，匹配 ${matched} 个，画像和作品证据已归档。`;
    return text(resultSnapshot?.message, "找人任务已记录，等待候选检索结果。");
  }
  if (type === "评论筛选" && ["completed", "succeeded", "success", "done"].includes(normalized)) {
    const counts = isRecord(resultSnapshot?.counts) ? resultSnapshot.counts : {};
    const matched = Number.isFinite(Number(counts.matched))
      ? Number(counts.matched)
      : (Array.isArray(resultSnapshot?.comments) ? resultSnapshot.comments.filter((item) => item?.filter?.matched !== false).length : 0);
    return `${sourceContext?.source || "作品评论"} 已完成，筛出 ${matched} 条匹配评论，保留评论用户、原话、来源作品、时间和判断理由。`;
  }
  if (agentId === "mkt-find-people" && resultSnapshot?.analysis?.mode === "collect" && ["completed", "succeeded", "success", "done"].includes(normalized)) {
    const counts = isRecord(resultSnapshot?.counts) ? resultSnapshot.counts : {};
    const collected = Number(counts.collected ?? counts.candidates ?? counts.discovered ?? 0);
    return `已完成用户发现，整理 ${collected} 位候选用户，保留原始评论和来源证据，等待综合分析。`;
  }
  if (agentId === "mkt-intent-analyst" && ["completed", "succeeded", "success", "done"].includes(normalized)) {
    return "已完成候选对象的综合分析，结果包含来源事实、分析结论、待确认信息和下一步线索。";
  }
  const fallback = ["failed", "error"].includes(normalized)
    ? "真实任务执行失败，暂无可交付结果。"
    : ["stopped", "cancelled"].includes(normalized)
      ? "任务已停止，已保留已产生的真实产出。"
      : ["completed", "succeeded", "success", "done"].includes(normalized)
        ? (type === "潜客" ? "已完成公开线索整理，结果包含来源证据与意向判断。" : `${sourceContext?.source || "真实任务"} 已完成，结果可继续查看和交接。`)
        : "等待真实任务产出，当前没有可交付结果。";
  return fallback;
}

function resultMetricsFor(resultSnapshot = {}) {
  const counts = isRecord(resultSnapshot?.counts) ? resultSnapshot.counts : {};
  return clone(resultSnapshot?.metrics || counts);
}

export function createProspectStore({ storage = globalThis.localStorage, now = () => new Date().toISOString(), remoteSync = null } = {}) {
  const backend = safeStorage(storage);
  const state = readState(backend);
  const listeners = new Set();
  let batchDepth = 0;
  let notifyWhenBatchCompletes = false;
  let syncAfterBatch = false;
  let syncInFlight = null;
  let syncQueued = false;
  let remoteWriter = typeof remoteSync === "function" ? remoteSync : null;

  function saveLocal() {
    try { backend?.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* keep the in-memory session usable */ }
  }

  function syncStatus() {
    return clone({ ...state.sync, syncing: Boolean(syncInFlight) });
  }

  function emit() {
    for (const listener of listeners) {
      try { listener(); } catch { /* one subscriber must not break persistence */ }
    }
  }

  function scheduleRemoteSync() {
    if (!remoteWriter || !state.sync.pending) return Promise.resolve(syncStatus());
    if (batchDepth > 0) {
      syncAfterBatch = true;
      return Promise.resolve(syncStatus());
    }
    if (syncInFlight) {
      syncQueued = true;
      return syncInFlight;
    }
    const records = list();
    const runs = listRuns();
    syncInFlight = Promise.resolve(remoteWriter(records, runs))
      .then(() => {
        state.sync = { pending: false, attempts: 0, lastError: "", lastSyncedAt: now() };
        saveLocal();
        emit();
        return syncStatus();
      })
      .catch((error) => {
        state.sync = {
          ...state.sync,
          pending: true,
          attempts: state.sync.attempts + 1,
          lastError: text(error?.message, "成果暂时无法同步到云端")
        };
        saveLocal();
        emit();
        return syncStatus();
      })
      .finally(() => {
        syncInFlight = null;
        if (syncQueued) {
          syncQueued = false;
          scheduleRemoteSync();
        }
      });
    return syncInFlight;
  }

  async function flushRemoteSync() {
    if (!remoteWriter || !state.sync.pending) return syncStatus();
    if (!syncInFlight) scheduleRemoteSync();
    while (syncInFlight) await syncInFlight;
    return syncStatus();
  }

  function retryRemoteSync() {
    if (!remoteWriter || !state.sync.pending) return Promise.resolve(syncStatus());
    return scheduleRemoteSync();
  }

  function persist({ sync = true } = {}) {
    if (sync && remoteWriter) {
      state.sync = { ...state.sync, pending: true, lastError: "" };
    }
    saveLocal();
    if (batchDepth > 0) {
      notifyWhenBatchCompletes = true;
      if (sync) syncAfterBatch = true;
      return;
    }
    emit();
    if (sync) scheduleRemoteSync();
  }

  function batch(callback) {
    batchDepth += 1;
    try {
      return callback();
    } finally {
      batchDepth -= 1;
      if (batchDepth === 0 && notifyWhenBatchCompletes) {
        notifyWhenBatchCompletes = false;
        emit();
      }
      if (batchDepth === 0 && syncAfterBatch) {
        syncAfterBatch = false;
        scheduleRemoteSync();
      }
    }
  }

  function list() {
    return Object.values(state.records)
      .sort((a, b) => String(b.updatedAt || b.discoveredAt || "").localeCompare(String(a.updatedAt || a.discoveredAt || "")))
      .map(clone);
  }

  function get(id) {
    const resolved = state.records[id] ? id : legacyRecordId(id);
    return clone(resolved ? state.records[resolved] || null : null);
  }

  function legacyRecordId(id) {
    if (!String(id || "").startsWith("lead:")) return null;
    const identity = String(id).slice(5);
    return Object.keys(state.records).filter((key) => key.endsWith(`::${identity}`)).sort().at(-1) || null;
  }

  function latestRun() {
    return clone(state.runs[0] || null);
  }

  function updateRun(taskId, patch = {}) {
    const key = text(taskId);
    const index = state.runs.findIndex((item) => item.taskId === key || item.ownerKey === key);
    if (index < 0) return null;
    const current = state.runs[index];
    const next = typeof patch === "function" ? patch(clone(current)) : { ...current, ...clone(patch) };
    const snapshot = {
      ...(isRecord(current.resultSnapshot) ? clone(current.resultSnapshot) : {}),
      ...(isRecord(next.resultSnapshot) ? clone(next.resultSnapshot) : {}),
      ...(Array.isArray(next.items) ? { items: clone(next.items) } : {})
    };
    state.runs[index] = { ...current, ...next, resultSnapshot: snapshot, updatedAt: now() };
    persist();
    return clone(state.runs[index]);
  }

  function listRuns() {
    return state.runs.map(clone);
  }

  function ingestRun({ resultSnapshot = {}, taskId = null, agentId = null, agentName = null, sourceContext = {}, canonicalSignature = "" } = {}) {
    const normalizedSnapshot = normalizeAgentResultSnapshot(resultSnapshot, {
      taskId,
      agentId,
      agentName,
      accountId: sourceContext?.accountId,
      taskRunId: sourceContext?.taskRunId,
      source: sourceContext?.source,
      generatedAt: now()
    });
    const leads = Array.isArray(normalizedSnapshot?.leads) ? normalizedSnapshot.leads : [];
    const runId = text(taskId || normalizedSnapshot?.taskId || normalizedSnapshot?.runId, `run-${Date.now()}`);
    const resolvedAccountId = normalizedSnapshot?.accountId || normalizedSnapshot?.account_id || normalizedSnapshot?.account?.accountId || normalizedSnapshot?.account?.secId || normalizedSnapshot?.account?.sec_id || normalizedSnapshot?.account?.id || sourceContext?.accountId;
    const ownerKey = resultOwnerKey({ agentId, taskId: runId, accountId: resolvedAccountId });
    const previousRun = state.runs.find((item) => item.ownerKey === ownerKey || (!item.ownerKey && item.taskId === runId && item.agentId === text(agentId, "lead_miner"))) || null;
    const account = isRecord(normalizedSnapshot?.account) ? normalizedSnapshot.account : {};
    const resultType = resultTypeFor({ agentId, agentName, resultSnapshot: normalizedSnapshot, sourceContext });
    const contactability = contactabilityFor({
      agentId,
      agentName,
      source: sourceContext?.source || normalizedSnapshot?.source,
      sourceScope: sourceContext?.sourceScope,
      resultType,
      resultSnapshot: normalizedSnapshot
    });
    const resolvedStatus = text(normalizedSnapshot?.status, previousRun?.status || "unknown");
    const collectionOnly = normalizedSnapshot?.analysis?.mode === "collect" || normalizedSnapshot?.inputs?.analysisMode === "collect";
    const run = {
      ...(previousRun || {}),
      taskId: runId,
      resultId: `run:${ownerKey}`,
      ownerKey,
      schemaVersion: normalizedSnapshot.schemaVersion,
      contract: normalizedSnapshot.contract,
      taskRunId: text(normalizedSnapshot?.taskRunId || normalizedSnapshot?.task_run_id || sourceContext?.taskRunId, previousRun?.taskRunId || ""),
      accountId: text(resolvedAccountId, previousRun?.accountId || ""),
      status: resolvedStatus,
      error: clone(normalizedSnapshot?.error || (["failed", "error"].includes(resolvedStatus.toLowerCase()) ? previousRun?.error : null)),
      health: text(normalizedSnapshot?.health, previousRun?.health || "unknown"),
      runtimeState: text(normalizedSnapshot?.runtimeState || normalizedSnapshot?.runtime_state, previousRun?.runtimeState || "unknown"),
      touchStatus: text(normalizedSnapshot?.touchStatus || normalizedSnapshot?.touch_status, previousRun?.touchStatus || ""),
      agentId: text(agentId, "lead_miner"),
      agentName: text(agentName, "作品评论筛选专员"),
      resultType,
      sourceScope: contactability.sourceScope,
      contactability: clone(contactability),
      title: resultTitleFor(resultType, { agentId, agentName, resultSnapshot: normalizedSnapshot }),
      summary: resultSummaryFor(resultType, { agentId, resultSnapshot: normalizedSnapshot, sourceContext, status: resolvedStatus }),
      source: text(sourceContext?.source, "作品评论"),
      window: text(sourceContext?.window),
      accountName: text(normalizedSnapshot?.accountName || normalizedSnapshot?.sender?.accountName || account.nickname || sourceContext?.accountName),
      accountUrl: text(sourceContext?.accountUrl || account.profileUrl),
      query: text(normalizedSnapshot?.query || sourceContext?.query),
      inputs: clone(normalizedSnapshot?.inputs || {}),
      analysis: clone(normalizedSnapshot?.analysis || {}),
      counts: clone(normalizedSnapshot?.counts || {}),
      metrics: resultMetricsFor(normalizedSnapshot),
      generatedAt: text(normalizedSnapshot?.generatedAt, now()),
      canonicalSignature: text(canonicalSignature, previousRun?.canonicalSignature || "")
    };
    for (const field of INCREMENTAL_RUN_FIELDS) {
      const priorValue = previousRun?.[field];
      const nextValue = normalizedSnapshot?.[field];
      if (field === "handoff") run[field] = clone(nextValue && typeof nextValue === "object" && !Array.isArray(nextValue) ? { ...(priorValue || {}), ...nextValue } : priorValue || {});
      else run[field] = mergeResultCollection(priorValue, nextValue);
    }
    run.resultSnapshot = clone(normalizedSnapshot);
    run.links = {
      ...(previousRun?.links || {}),
      ...(isRecord(normalizedSnapshot?.links) ? clone(normalizedSnapshot.links) : {}),
      ...(isRecord(sourceContext?.links) ? clone(sourceContext.links) : {})
    };
    run.resultSnapshot = {
      ...clone(normalizedSnapshot),
      taskId: run.taskId,
      taskRunId: run.taskRunId,
      agentId: run.agentId,
      agentName: run.agentName,
      accountId: run.accountId,
      resultId: run.resultId,
      status: run.status,
      source: run.source,
      sourceScope: run.sourceScope,
      contactability: clone(run.contactability),
      title: run.title,
      summary: run.summary,
      inputs: clone(run.inputs),
      items: clone(run.items),
      evidence: clone(run.evidence),
      decisions: clone(run.decisions),
      actions: clone(run.actions),
      artifacts: clone(run.artifacts),
      handoff: clone(run.handoff),
      errors: clone(run.errors)
    };
    state.runs = [run, ...state.runs.filter((item) => item !== previousRun && item.ownerKey !== ownerKey && !(item.taskId === runId && item.agentId === run.agentId && !item.ownerKey))].slice(0, 30);

    for (const lead of leads) {
      if (!contactability.allowed) continue;
      const identity = identityOf(lead);
      if (!identity) continue;
      const id = `lead:${ownerKey}:${identity}`;
      const prior = state.records[id] || {};
      const priorTier = text(prior.tier, "unknown");
      const tier = collectionOnly ? priorTier : text(lead.tier || lead.intent?.tier, "unknown");
      const score = collectionOnly
        ? (Number.isFinite(Number(prior.score)) ? Number(prior.score) : 0)
        : (Number.isFinite(Number(lead.score ?? lead.intent?.score)) ? Number(lead.score ?? lead.intent?.score) : 0);
      const quote = text(lead.text || lead.comment || lead.content);
      const source = {
        ...(prior.source || {}),
        ...(isRecord(lead.source) ? clone(lead.source) : {}),
        leadId: text(lead.leadId || lead.id),
        secId: text(lead.secId || lead.sec_id),
        secUid: text(lead.secUid || lead.sec_uid),
        taskId: runId,
        agentId: run.agentId,
        agentName: run.agentName,
        type: sourceLabel(sourceContext, lead),
        sourceResultId: run.resultId,
        sourceTaskId: run.taskId,
        sourceTaskRunId: run.taskRunId || null,
        accountId: run.accountId || null,
        accountName: run.accountName || null,
        accountUrl: run.accountUrl || null,
        window: run.window || null
      };
      const timeline = [
        ["刚刚", collectionOnly ? `从${source.type}发现，等待意向分析` : `从${source.type}发现并完成${tierLabel(tier)}判断`, collectionOnly ? "discover" : "score"],
        ...(quote ? [["刚刚", quote, "comment"]] : [])
      ];
      const mergedTimeline = [...timeline, ...(Array.isArray(prior.timeline) ? prior.timeline : [])].slice(0, 12);
      state.records[id] = {
        ...prior,
        id,
        name: text(lead.nickname || lead.account || lead.uniqueId || lead.unique_id, "抖音用户"),
        handle: text(lead.uniqueId || lead.unique_id, identity.startsWith("@") ? identity : `@${identity}`),
        profileUrl: text(lead.profileUrl || lead.profile_url || lead.userUrl || lead.user_url),
        avatar: personAvatarUrl(lead, prior) || personAvatarFallback(text(lead.nickname || lead.account, "抖音用户")),
        score,
        tier,
        tags: [...new Set([
          ...(Array.isArray(prior.tags) ? prior.tags : []).filter((tag) => !["待分析", "高意向", "中意向", "低意向"].includes(tag)),
          ...(Array.isArray(lead.tags) ? lead.tags : []).filter((tag) => !["待分析", "高意向", "中意向", "低意向"].includes(tag)),
          tierLabel(tier)
        ])].filter(Boolean),
        status: collectionOnly && !prior.intent ? "待分析" : prior.status || PROSPECT_STATUSES.AUTOMATIC_OUTREACH,
        conversionStatus: prior.conversionStatus || "未转化",
        convertedAt: prior.convertedAt || null,
        conversionNote: prior.conversionNote || "",
        conversionSource: prior.conversionSource || null,
        contactStatus: prior.contactStatus || "未保存",
        saved: Boolean(prior.saved),
        profile: text(lead.profile || (collectionOnly ? "" : lead.intent?.summary), quote ? `评论：“${quote}”` : "已从公开内容中识别到该用户"),
        reason: collectionOnly ? "尚未进行意向判断，已保留原始来源证据" : text(lead.intent?.reason || lead.reason, "按公开评论信号进行判断"),
        intent: collectionOnly ? (prior.intent ?? null) : clone(lead.intent || { tier, score, confidence: 0, reason: "按公开评论信号进行判断", source: "heuristic" }),
        evidence: mergeEvidence(prior.evidence, lead.evidence),
        contactability: clone(contactability),
        source,
        owner: run.agentName,
        execution: prior.execution || { status: "idle", task: "生成首轮触达方案" },
        timeline: mergedTimeline,
        lastSeen: "刚刚",
        discoveredAt: prior.discoveredAt || text(lead.discoveredAt, run.generatedAt),
        updatedAt: now()
      };
    }
    persist({ sync: !canonicalSignature });
    return list();
  }

  function hydrateRuns(entries = []) {
    let hydrated = 0;
    batch(() => {
      for (const entry of Array.isArray(entries) ? entries : []) {
        const snapshot = isRecord(entry?.resultSnapshot) ? entry.resultSnapshot : null;
        const taskId = text(entry?.taskId || snapshot?.taskId);
        const agentId = text(entry?.agentId || snapshot?.agentId);
        if (!snapshot || !taskId || !agentId) continue;
        const signature = JSON.stringify({
          taskId,
          taskRunId: text(entry?.taskRunId || snapshot?.taskRunId || snapshot?.task_run_id),
          agentId,
          accountId: text(entry?.accountId || snapshot?.accountId || snapshot?.account_id),
          status: text(entry?.status || snapshot?.status),
          generatedAt: text(snapshot?.generatedAt || snapshot?.generated_at || entry?.updatedAt),
          resultSnapshot: snapshot
        });
        const previous = state.runs.find((run) => run.taskId === taskId && run.agentId === agentId
          && (!entry?.taskRunId || !run.taskRunId || run.taskRunId === entry.taskRunId));
        if (previous?.canonicalSignature === signature) continue;
        ingestRun({
          resultSnapshot: {
            ...snapshot,
            taskId,
            taskRunId: entry?.taskRunId || snapshot.taskRunId || snapshot.task_run_id || null,
            agentId,
            agentName: entry?.agentName || snapshot.agentName || snapshot.agent_name || agentId,
            accountId: entry?.accountId || snapshot.accountId || snapshot.account_id || null,
            status: entry?.status || snapshot.status || "unknown",
            generatedAt: snapshot.generatedAt || snapshot.generated_at || entry?.updatedAt || null
          },
          taskId,
          agentId,
          agentName: entry?.agentName || snapshot.agentName || snapshot.agent_name || agentId,
          sourceContext: {
            ...(isRecord(entry?.sourceContext) ? entry.sourceContext : {}),
            taskRunId: entry?.taskRunId || snapshot.taskRunId || snapshot.task_run_id || null,
            accountId: entry?.accountId || snapshot.accountId || snapshot.account_id || entry?.sourceContext?.accountId || null
          },
          canonicalSignature: signature
        });
        hydrated += 1;
      }
    });
    return hydrated;
  }

  function hydrateRecords(entries = []) {
    let hydrated = 0;
    batch(() => {
      for (const entry of Array.isArray(entries) ? entries : []) {
        if (!isRecord(entry) || !text(entry.id)) continue;
        const current = state.records[entry.id];
        const currentUpdatedAt = Date.parse(current?.updatedAt || current?.discoveredAt || "") || 0;
        const remoteUpdatedAt = Date.parse(entry.updatedAt || entry.discoveredAt || "") || 0;
        if (current && currentUpdatedAt > remoteUpdatedAt) continue;
        const next = clone(entry);
        next.id = text(next.id);
        state.records[next.id] = next;
        hydrated += 1;
      }
      if (hydrated) persist({ sync: false });
    });
    return hydrated;
  }

  function update(id, patch = {}) {
    const current = state.records[id];
    if (!current) return null;
    state.records[id] = { ...current, ...clone(patch), updatedAt: now() };
    persist();
    return clone(state.records[id]);
  }

  function identityCandidates(value = {}) {
    return [
      value.recordId,
      value.sourceRecordId,
      value.leadId,
      value.id,
      value.secUid,
      value.sec_uid,
      value.secId,
      value.sec_id,
      value.profileUrl,
      value.profile_url,
      value.handle,
      value.uniqueId,
      value.unique_id
    ].map((item) => text(item)).filter(Boolean);
  }

  function findRecord(value = {}) {
    const candidates = identityCandidates(value);
    for (const candidate of candidates) {
      const resolved = state.records[candidate] ? candidate : legacyRecordId(candidate);
      if (resolved) return resolved;
    }
    const name = text(value.nickname || value.name);
    if (name) return Object.keys(state.records).find((id) => state.records[id]?.name === name) || null;
    return null;
  }

  function appendRecordTimeline(record, content, type = "touch") {
    const timeline = Array.isArray(record.timeline) ? record.timeline : [];
    record.timeline = [["刚刚", content, type], ...timeline].slice(0, 12);
    record.lastSeen = "刚刚";
  }

  function ensureOutreachProspects(entries = [], { sourceContext = {} } = {}) {
    const ensured = [];
    let changed = false;
    for (const entry of Array.isArray(entries) ? entries : []) {
      const recipient = text(
        entry?.secId
        || entry?.sec_id
        || entry?.secUid
        || entry?.sec_uid
        || entry?.source?.secId
        || entry?.source?.sec_id
        || entry?.source?.secUid
        || entry?.source?.sec_uid
      );
      const sourceScope = text(entry?.sourceScope || entry?.source?.sourceScope || sourceContext?.sourceScope);
      const contactability = contactabilityFor({
        agentId: text(sourceContext?.agentId, "mkt-cold-writer"),
        agentName: text(sourceContext?.agentName, "潜客触达专员"),
        source: text(entry?.triggerSource || sourceContext?.source, "成果中心潜客"),
        sourceScope,
        sourceResultType: text(entry?.sourceResultType || sourceContext?.sourceResultType, "潜客"),
        resultType: text(entry?.sourceResultType || sourceContext?.sourceResultType, "潜客")
      });
      if (!recipient || !contactability.allowed) {
        ensured.push(null);
        continue;
      }

      const sourceAccountId = text(entry?.sourceAccountId || entry?.source?.accountId || sourceContext?.accountId);
      const sourceAccountName = text(entry?.sourceAccountName || entry?.source?.accountName || sourceContext?.accountName);
      const inputRecordId = text(entry?.recordId || entry?.sourceRecordId || entry?.id);
      const existingId = findRecord(entry);
      const sourceKey = text(sourceAccountId || sourceContext?.taskId || sourceContext?.sourceResultId, "unscoped");
      const id = existingId || (inputRecordId.startsWith("lead:") ? inputRecordId : `lead:handoff:${sourceKey}:${recipient}`);
      const existing = state.records[id] || {};
      const name = text(entry?.nickname || entry?.name, existing.name || "抖音用户");
      const quote = text(entry?.quote || entry?.comment || entry?.text || entry?.reason);
      const entryEvidence = Array.isArray(entry?.evidence) && entry.evidence.length
        ? entry.evidence
        : quote ? [{ type: "result_selection", quote }] : [];
      const outreachStatus = existing.status || (entry?.status === PROSPECT_STATUSES.WAITING_OUTREACH_CONFIRMATION
        ? PROSPECT_STATUSES.WAITING_OUTREACH_CONFIRMATION
        : PROSPECT_STATUSES.AUTOMATIC_OUTREACH);
      const record = {
        ...existing,
        id,
        name,
        handle: text(entry?.handle || entry?.uniqueId || entry?.unique_id, existing.handle || `@${recipient}`),
        profileUrl: text(entry?.profileUrl || entry?.profile_url, existing.profileUrl || ""),
        avatar: personAvatarUrl(entry, existing) || personAvatarFallback(name),
        score: Number.isFinite(Number(entry?.score)) ? Number(entry.score) : (existing.score || 0),
        tier: text(entry?.tier || entry?.intent?.tier, existing.tier || "unknown"),
        status: outreachStatus,
        leadStatus: existing.leadStatus || "未留资",
        outreachStatus: existing.outreachStatus || "未触达",
        conversionStatus: existing.conversionStatus || "未转化",
        contactStatus: existing.contactStatus || "未保存",
        saved: Boolean(existing.saved),
        tags: [...new Set([...(Array.isArray(existing.tags) ? existing.tags : []), outreachStatus])],
        profile: text(entry?.profile || entry?.profileSummary, existing.profile || (quote ? `原始表达：“${quote}”` : "已从成果中心加入待触达名单")),
        reason: text(entry?.reason, existing.reason || "已完成客户分析，等待首次触达"),
        intent: entry?.intent || existing.intent || null,
        evidence: mergeEvidence(existing.evidence, entryEvidence),
        contactability: clone(contactability),
        source: {
          ...(existing.source || {}),
          ...(isRecord(entry?.source) ? clone(entry.source) : {}),
          leadId: text(entry?.leadId, existing.source?.leadId || ""),
          secId: recipient,
          secUid: recipient,
          type: text(entry?.triggerSource || sourceContext?.source, existing.source?.type || "成果中心潜客"),
          sourceScope: contactability.sourceScope,
          sourceResultId: text(entry?.sourceResultId || sourceContext?.sourceResultId, existing.source?.sourceResultId || ""),
          sourceTaskId: text(entry?.sourceTaskId || sourceContext?.sourceTaskId || sourceContext?.taskId, existing.source?.sourceTaskId || ""),
          accountId: sourceAccountId || existing.source?.accountId || null,
          accountName: sourceAccountName || existing.source?.accountName || null
        },
        owner: existing.owner || text(sourceContext?.agentName, "潜客触达专员"),
        execution: existing.execution || { status: "idle", task: "私信触达" },
        timeline: Array.isArray(existing.timeline) ? existing.timeline : [],
        discoveredAt: existing.discoveredAt || now(),
        updatedAt: now()
      };
      if (!existing.id) appendRecordTimeline(record, `从成果中心加入${outreachStatus}名单`, "handoff");
      state.records[id] = record;
      ensured.push(clone(record));
      changed = true;
    }
    if (changed) persist();
    return ensured;
  }

  function inboxRecordIdentity(message = {}) {
    return text(
      message.secUid
      || message.sec_uid
      || message.sender?.secUid
      || message.sender?.sec_uid
      || message.secId
      || message.sec_id
      || message.sender?.secId
      || message.sender?.sec_id
      || message.profileUrl
      || message.profile_url
      || message.handle
      || message.uniqueId
      || message.unique_id
      || message.messageId
      || message.message_id
      || message.id
    );
  }

  function createInboxFollowupRecord(message = {}, { agentId, agentName, taskId, sourceResultId } = {}) {
    const identity = inboxRecordIdentity(message);
    if (!identity) return null;

    const name = text(message.nickname || message.name || message.sender?.nickname || message.sender?.name, "抖音用户");
    const receivedAt = text(message.receivedAt || message.createdAt || message.created_at, now());
    const content = text(message.content || message.text || message.incomingContent);
    const id = `lead:inbox:${identity}`;
    const existing = state.records[id];
    if (existing) return id;

    const record = {
      id,
      name,
      handle: text(message.handle || message.secUid || message.sec_uid || message.secId || message.sec_id, identity),
      profileUrl: text(message.profileUrl || message.profile_url),
      avatar: personAvatarUrl(message) || personAvatarFallback(name),
      score: 0,
      tier: "unknown",
      tags: ["私信承接"],
      status: "跟进中",
      leadStatus: "未留资",
      outreachStatus: "inbound",
      conversionStatus: "未转化",
      contactStatus: "未保存",
      contactability: {
        allowed: true,
        sourceScope: RESULT_SOURCE_SCOPES.OWN_INBOX,
        reason: "来自用户已授权账号的私信承接"
      },
      profile: "用户主动发起私信，正在继续承接对话。",
      reason: "用户主动私信，等待私信客服继续承接。",
      intent: { tier: "unknown", score: 0, confidence: 0, reason: "用户主动私信，等待私信客服继续承接。", source: "inbox" },
      evidence: content ? [{ type: "private_message", quote: content, observedAt: receivedAt }] : [],
      source: {
        type: "私信承接",
        sourceScope: RESULT_SOURCE_SCOPES.OWN_INBOX,
        taskId,
        agentId,
        agentName,
        replyTaskId: taskId,
        replyAgentId: agentId,
        replyAgentName: agentName,
        replySourceResultId: sourceResultId || null
      },
      owner: agentName,
      execution: { status: "done", task: "私信回复跟进" },
      timeline: [],
      discoveredAt: now(),
      updatedAt: now()
    };
    appendRecordTimeline(record, "收到新私信，已进入跟进", "reply");
    state.records[id] = record;
    return id;
  }

  function buildLeadCaptureEvidence(message, contact, { capturedAt = now(), taskId = "", sourceResultId = "", accountId = "", accountName = "", agentId = "", agentName = "" } = {}) {
    const content = text(message?.content || message?.text || message?.incomingContent);
    const observedAt = text(message?.receivedAt || message?.received_at || message?.createdAt || message?.created_at, capturedAt);
    const sourceAccount = {
      id: text(accountId || message?.accountId || message?.account_id || message?.recipient?.accountId || message?.recipient?.account_id),
      name: text(accountName || message?.accountName || message?.account_name || message?.recipient?.accountName || message?.recipient?.account_name, "当前授权账号")
    };
    const sender = {
      nickname: text(message?.nickname || message?.name || message?.sender?.nickname || message?.sender?.name),
      handle: text(message?.handle || message?.sender?.handle || message?.sender?.uniqueId || message?.sender?.unique_id),
      secUid: text(message?.secUid || message?.sec_uid || message?.sender?.secUid || message?.sender?.sec_uid),
      profileUrl: text(message?.profileUrl || message?.profile_url || message?.sender?.profileUrl || message?.sender?.profile_url)
    };
    const detectedFields = contactFieldNames(contact);
    return {
      type: "inbox_contact",
      source: "私信",
      messageId: text(message?.messageId || message?.message_id || message?.id || message?.msgId),
      conversationId: text(message?.conversationId || message?.conversation_id),
      observedAt,
      capturedAt,
      sourceAccount,
      sender,
      detectedFields,
      contact: Object.fromEntries(detectedFields.map((field) => [field, contact[field]])),
      quote: content,
      taskId: text(taskId),
      sourceResultId: text(sourceResultId),
      agentId: text(agentId),
      agentName: text(agentName)
    };
  }

  function applyOutreachResults({ entries = [], agentId = "mkt-cold-writer", agentName = "私信触达专员", taskId = "", source = "抖音私信", sourceResultId = "", sourceResultType = "", sourceScope = "" } = {}) {
    const changed = [];
    const sourceContactability = contactabilityFor({ agentId, agentName, source, sourceScope, sourceResultType, resultType: sourceResultType });
    const hasExplicitOrigin = Boolean(sourceScope || sourceResultType);
    for (const entry of Array.isArray(entries) ? entries : []) {
      const status = text(entry?.status).toLowerCase();
      const recordId = findRecord(entry);
      if (recordId) {
        const record = state.records[recordId];
        if (!isContactableRecord(record) || (hasExplicitOrigin && !sourceContactability.allowed)) continue;
        const avatar = personAvatarUrl(entry);
        if (avatar) record.avatar = avatar;
        if (status === "sent") {
          record.status = "已触达";
          record.outreachStatus = "sent";
          record.tags = [...new Set([...(Array.isArray(record.tags) ? record.tags : []), "已触达"])];
          record.source = { ...(record.source || {}), outreachTaskId: taskId, outreachAgentId: agentId, outreachAgentName: agentName, outreachSource: source, outreachSourceResultId: sourceResultId || null };
          record.execution = { ...(record.execution || {}), status: "done", task: "私信触达" };
          appendRecordTimeline(record, `${agentName} 已完成私信触达，平台返回成功回执`, "touch");
          changed.push(record.id);
        } else if (["failed", "error", "unknown"].includes(status)) {
          record.outreachStatus = status;
          record.outreachError = text(entry.error);
          record.updatedAt = now();
          changed.push(record.id);
        }
        continue;
      }
      // A direct target or a public-domain result is an outreach receipt, not a prospect.
      // The execution run remains archived by the caller; this store only owns the prospect lifecycle.
    }
    if (changed.length) persist();
    return changed.map((id) => clone(state.records[id])).filter(Boolean);
  }

  function applyIntentAnalysis({
    leads = [],
    resultSnapshot = {},
    taskId = "",
    agentId = "mkt-intent-analyst",
    agentName = "客户分析员",
    sourceResultId = "",
    sourceTaskId = "",
    sourceScope = "",
    sourceAccountId = "",
    sourceAccountName = "",
    sourceResultType = "互动用户",
    sourceCandidates = []
  } = {}) {
    const changed = [];
    const analysisLeads = Array.isArray(leads) && leads.length
      ? leads
      : (Array.isArray(resultSnapshot?.leads) ? resultSnapshot.leads : []);
    const selectedCandidates = Array.isArray(sourceCandidates) ? sourceCandidates : [];
    const candidateForLead = (lead) => {
      const leadIdentities = new Set(identityCandidates(lead));
      return selectedCandidates.find((candidate) => identityCandidates(candidate).some((identity) => leadIdentities.has(identity))) || null;
    };
    for (const lead of analysisLeads) {
      let recordId = findRecord({
        recordId: lead?.sourceRecordId,
        sourceRecordId: lead?.sourceRecordId,
        leadId: lead?.leadId,
        id: lead?.id,
        secUid: lead?.secUid || lead?.sec_uid,
        uniqueId: lead?.uniqueId || lead?.unique_id,
        nickname: lead?.nickname || lead?.name
      });
      let record = recordId ? state.records[recordId] : null;
      if (!record) {
        const candidate = candidateForLead(lead) || {};
        if (candidate?.contactability?.allowed === false) continue;
        const candidateSource = isRecord(candidate?.source) ? candidate.source : {};
        const resolvedSourceScope = text(
          candidate?.contactability?.sourceScope
          || candidate?.sourceScope
          || candidateSource.sourceScope,
          sourceScope
        );
        const resolvedSourceAgentId = text(candidateSource.agentId || candidate?.agentId, "mkt-find-people");
        const resolvedSourceAgentName = text(candidateSource.agentName || candidate?.agentName, "抖音找客专员");
        const sourceContactability = contactabilityFor({
          agentId: resolvedSourceAgentId,
          agentName: resolvedSourceAgentName,
          source: text(candidateSource.type || candidateSource.source, "已授权账号互动"),
          sourceScope: resolvedSourceScope,
          sourceResultType: text(candidate?.sourceResultType || candidate?.resultType, sourceResultType),
          resultType: text(candidate?.sourceResultType || candidate?.resultType, sourceResultType)
        });
        if (!sourceContactability.allowed) continue;

        const identity = identityOf({ ...candidate, ...lead });
        if (!identity) continue;
        const resolvedAccountId = text(
          candidate?.accountId
          || candidateSource.accountId
          || candidateSource.account_id,
          sourceAccountId
        );
        const resolvedAccountName = text(
          candidate?.accountName
          || candidateSource.accountName
          || candidateSource.account_name,
          sourceAccountName
        );
        const sourceOwnerKey = resultOwnerKey({
          agentId: resolvedSourceAgentId,
          taskId: text(sourceTaskId || sourceResultId || taskId, "discovered"),
          accountId: resolvedAccountId
        }) || "discovered";
        const sourceRecordKey = text(candidate?.recordId || candidate?.sourceRecordId || lead?.sourceRecordId);
        const id = sourceRecordKey.startsWith("lead:")
          ? sourceRecordKey
          : `lead:${sourceOwnerKey}:${identity}`;
        const quote = text(candidate?.text || candidate?.comment || candidate?.content || lead?.text || lead?.comment || lead?.content);
        const sourceType = text(candidateSource.type || candidateSource.source, "账号互动");
        const evidence = mergeEvidence(
          candidate?.evidence,
          [
            ...(quote ? [{ quote, observedAt: text(candidate?.observedAt || candidate?.observed_at) }] : []),
            ...(Array.isArray(lead?.evidence) ? lead.evidence : [])
          ]
        );
        record = {
          id,
          name: text(candidate?.name || candidate?.nickname || lead?.nickname || lead?.name, "抖音用户"),
          handle: text(candidate?.handle || candidate?.uniqueId || candidate?.unique_id || lead?.uniqueId || lead?.unique_id, `@${identity}`),
          profileUrl: text(candidate?.profileUrl || candidate?.profile_url || lead?.profileUrl || lead?.profile_url),
          avatar: personAvatarUrl(candidate, lead) || personAvatarFallback(text(candidate?.name || candidate?.nickname || lead?.nickname || lead?.name, "抖音用户")),
          score: 0,
          tier: "unknown",
          tags: ["待分析"],
          status: "待分析",
          leadStatus: "未留资",
          outreachStatus: "pending_analysis",
          conversionStatus: "未转化",
          contactStatus: "未保存",
          saved: false,
          profile: quote ? `原始表达：“${quote}”` : "已从用户已授权账号的互动中发现",
          reason: "尚未进行意向判断，已保留原始来源证据",
          intent: null,
          evidence,
          contactability: clone(sourceContactability),
          source: {
            ...candidateSource,
            type: sourceType,
            sourceScope: sourceContactability.sourceScope,
            taskId: text(sourceTaskId, candidateSource.taskId || ""),
            agentId: resolvedSourceAgentId,
            agentName: resolvedSourceAgentName,
            sourceResultId: text(sourceResultId, candidateSource.sourceResultId || ""),
            sourceTaskId: text(sourceTaskId, candidateSource.sourceTaskId || ""),
            accountId: resolvedAccountId || null,
            accountName: resolvedAccountName || null
          },
          owner: resolvedSourceAgentName,
          execution: { status: "idle", task: "生成首轮触达方案" },
          timeline: [],
          discoveredAt: now(),
          updatedAt: now()
        };
        appendRecordTimeline(record, `从${sourceType}发现，等待意向分析`, "discover");
        state.records[id] = record;
        recordId = id;
      }
      const tier = text(lead?.tier || lead?.intent?.tier, "unknown");
      const score = Number.isFinite(Number(lead?.score ?? lead?.intent?.score)) ? Number(lead.score ?? lead.intent.score) : 0;
      const reason = text(lead?.intent?.reason || lead?.reason, "根据原始评论和来源证据完成判断");
      record.score = score;
      record.tier = tier;
      record.reason = reason;
      record.intent = clone(lead?.intent || { tier, score, confidence: 0, reason, source: "heuristic" });
      record.tags = [...new Set([
        ...(Array.isArray(record.tags) ? record.tags.filter((tag) => !["待分析", "高意向", "中意向", "低意向", PROSPECT_STATUSES.AUTOMATIC_OUTREACH, PROSPECT_STATUSES.WAITING_OUTREACH_CONFIRMATION].includes(tag)) : []),
        tierLabel(tier)
      ])].filter(Boolean);
      if (!["已触达", "已回复", "跟进中", "已留资"].includes(record.status)) {
        record.status = ["high", "medium"].includes(tier)
          ? PROSPECT_STATUSES.WAITING_OUTREACH_CONFIRMATION
          : tier === "low" ? "已归档" : "待分析";
      }
      record.evidence = mergeEvidence(record.evidence, lead?.evidence);
      record.source = {
        ...(record.source || {}),
        intentTaskId: taskId,
        intentAgentId: agentId,
        intentAgentName: agentName,
        intentSourceResultId: sourceResultId || resultSnapshot?.resultId || null,
        intentSourceTaskId: sourceTaskId || resultSnapshot?.sourceTaskId || null
      };
      appendRecordTimeline(record, `${agentName}：${tierLabel(tier)}`, "analysis");
      record.updatedAt = now();
      if (!changed.includes(record.id)) changed.push(record.id);
    }
    if (changed.length) persist();
    return changed.map((id) => clone(state.records[id])).filter(Boolean);
  }

  function applyInboxReplyResults({ messages = [], agentId = "mkt-dm-inbox", agentName = "私信客服", taskId = "", sourceResultId = "" } = {}) {
    const changed = [];
    for (const message of Array.isArray(messages) ? messages : []) {
      if (message?.isOutbound || message?.is_outbound || message?.outgoing || message?.isSelf || message?.is_self) continue;
      let recordId = findRecord({
        recordId: message.recordId,
        sourceRecordId: message.sourceRecordId,
        secUid: message.secUid || message.sec_uid || message.sender?.secUid || message.sender?.sec_uid,
        secId: message.secId || message.sec_id || message.sender?.secId || message.sender?.sec_id,
        profileUrl: message.profileUrl || message.profile_url,
        nickname: message.nickname || message.name || message.sender?.nickname || message.sender?.name
      });
      if (!recordId) recordId = createInboxFollowupRecord(message, { agentId, agentName, taskId, sourceResultId });
      if (!recordId) continue;
      const record = state.records[recordId];
      const messageId = text(message.messageId || message.message_id || message.id || message.msgId);
      if (messageId && record.lastReplyId === messageId) continue;
      const content = text(message.content || message.text || message.incomingContent);
      record.replyStatus = "已回复";
      record.replyReceived = true;
      record.lastReplyId = messageId || record.lastReplyId || null;
      record.lastReplyContent = content || record.lastReplyContent || "";
      record.lastReplyAt = text(message.receivedAt || message.createdAt || message.created_at, now());
      record.replyConversationId = text(message.conversationId || message.conversation_id, record.replyConversationId || "");
      if (record.status !== "已留资" && !["已转化", "已失效"].includes(record.conversionStatus)) record.status = "跟进中";
      record.source = {
        ...(record.source || {}),
        type: record.source?.type || "私信承接",
        sourceScope: RESULT_SOURCE_SCOPES.OWN_INBOX,
        replyTaskId: taskId,
        replyAgentId: agentId,
        replyAgentName: agentName,
        replySourceResultId: sourceResultId || null
      };
      record.execution = { ...(record.execution || {}), status: "done", task: "私信回复跟进" };
      appendRecordTimeline(record, "收到用户回复，已进入跟进", "reply");
      changed.push(record.id);
    }
    if (changed.length) persist();
    return changed.map((id) => clone(state.records[id])).filter(Boolean);
  }

  function applyInboxLeadCapture({ messages = [], agentId = "mkt-dm-inbox", agentName = "私信客服", taskId = "", sourceResultId = "", accountId = "", accountName = "" } = {}) {
    const captured = [];
    for (const message of Array.isArray(messages) ? messages : []) {
      const contact = extractLeadContact(message?.content || message?.text || message?.incomingContent);
      if (!contact) continue;
      const recordId = findRecord({
        recordId: message.recordId,
        sourceRecordId: message.sourceRecordId,
        secUid: message.secUid || message.sec_uid || message.recipient?.secUid,
        secId: message.secId || message.sec_id,
        profileUrl: message.profileUrl,
        nickname: message.nickname || message.name
      });
      const identity = text(message.secUid || message.sec_uid || message.secId || message.sec_id || message.profileUrl || message.nickname, "unknown");
      const id = recordId || `lead:inbox:${identity}`;
      const prior = state.records[id] || {};
      const captureEvidence = buildLeadCaptureEvidence(message, contact, { taskId, sourceResultId, accountId, accountName, agentId, agentName });
      if (prior.status === "已留资" && prior.contactStatus === "已留资" && (Array.isArray(prior.leadCaptureEvidence) ? prior.leadCaptureEvidence : []).some((entry) => leadCaptureEvidenceKey(entry) === leadCaptureEvidenceKey(captureEvidence))) continue;
      const record = {
        ...prior,
        id,
        name: text(message.nickname || message.name, prior.name || "抖音用户"),
        handle: text(message.handle || message.secUid || message.sec_uid || message.secId || message.sec_id, prior.handle || "待核验"),
        profileUrl: text(message.profileUrl, prior.profileUrl || ""),
        avatar: personAvatarUrl(message, prior) || personAvatarFallback(text(message.nickname || message.name, prior.name || "抖音用户")),
        score: Number(prior.score || 0),
        tier: prior.tier || "unknown",
        tags: [...new Set([...(Array.isArray(prior.tags) ? prior.tags : []), "已留资"])],
        status: "已留资",
        leadStatus: "已留资",
        outreachStatus: prior.outreachStatus || "sent",
        conversionStatus: prior.conversionStatus || "未转化",
        contactStatus: "已留资",
        contactability: { allowed: true, sourceScope: RESULT_SOURCE_SCOPES.OWN_INBOX, reason: "来自用户已授权账号的私信承接" },
        contact: { ...(prior.contact || {}), ...contact },
        leadCaptureEvidence: mergeLeadCaptureEvidence(prior.leadCaptureEvidence, [captureEvidence]),
        saved: Boolean(prior.saved),
        profile: prior.profile || "用户已通过私信留下联系方式。",
        reason: prior.reason || "私信中检测到有效联系方式。",
        intent: prior.intent || { tier: "unknown", score: 0, confidence: 0, reason: "私信中检测到有效联系方式。", source: "inbox" },
        evidence: Array.isArray(prior.evidence) ? prior.evidence : [],
        source: {
          ...(prior.source || {}),
          type: "私信承接",
          taskId,
          agentId,
          agentName,
          captureTaskId: taskId,
          captureAgentId: agentId,
          captureAgentName: agentName,
          captureSourceResultId: sourceResultId || null,
          captureAccountId: captureEvidence.sourceAccount.id || null,
          captureAccountName: captureEvidence.sourceAccount.name || null,
          captureMessageId: captureEvidence.messageId || null,
          captureConversationId: captureEvidence.conversationId || null
        },
        owner: agentName,
        execution: { ...(prior.execution || {}), status: "done", task: "私信承接与留资识别" },
        timeline: Array.isArray(prior.timeline) ? prior.timeline : [],
        discoveredAt: prior.discoveredAt || now(),
        updatedAt: now()
      };
      appendRecordTimeline(record, "检测到用户已留下联系方式，已停止自动回复并转入线索中心", "touch");
      state.records[id] = record;
      captured.push(id);
    }
    if (captured.length) persist();
    return captured.map((id) => clone(state.records[id])).filter(Boolean);
  }

  function saveToContacts(ids = []) {
    const saved = [];
    for (const id of ids) {
      const resolved = state.records[id] ? id : legacyRecordId(id);
      if (!resolved) continue;
      state.records[resolved] = { ...state.records[resolved], saved: true, contactStatus: "已保存", updatedAt: now() };
      saved.push(id);
    }
    if (saved.length) persist();
    return saved;
  }

  function setConversionStatus(ids = [], status = "", { note = "", source = "manual" } = {}) {
    const nextStatus = text(status);
    if (!["成交跟进", "已转化", "已失效"].includes(nextStatus)) return [];
    const changed = [];
    for (const id of ids) {
      const resolved = state.records[id] ? id : legacyRecordId(id);
      const current = resolved ? state.records[resolved] : null;
      if (!current) continue;
      const record = {
        ...current,
        conversionStatus: nextStatus,
        convertedAt: nextStatus === "已转化" ? current.convertedAt || now() : current.convertedAt || null,
        salesFollowupAt: nextStatus === "成交跟进" ? current.salesFollowupAt || now() : current.salesFollowupAt || null,
        lostAt: nextStatus === "已失效" ? current.lostAt || now() : current.lostAt || null,
        conversionNote: text(note, current.conversionNote || `人工更新为「${nextStatus}」`),
        conversionSource: text(source, "manual"),
        updatedAt: now()
      };
      appendRecordTimeline(record, `人工销售已更新为「${nextStatus}」${note ? `：${note}` : ""}`, "sales");
      state.records[resolved] = record;
      changed.push(id);
    }
    if (changed.length) persist();
    return changed;
  }

  function markConverted(ids = [], { note = "", source = "manual" } = {}) {
    return setConversionStatus(ids, "已转化", { note, source });
  }

  function listConverted() {
    return list().filter((item) => item.conversionStatus === "已转化");
  }

  function commit(records = []) {
    for (const record of records) {
      if (record?.id && state.records[record.id]) state.records[record.id] = clone(record);
    }
    persist();
  }

  return {
    list,
    get,
    latestRun,
    listRuns,
    updateRun,
    ingestRun,
    hydrateRuns,
    hydrateRecords,
    update,
    applyOutreachResults,
    applyIntentAnalysis,
    applyInboxReplyResults,
    applyInboxLeadCapture,
    ensureOutreachProspects,
    commit,
    saveToContacts,
    setConversionStatus,
    markConverted,
    listConverted,
    setRemoteSync(sync) {
      remoteWriter = typeof sync === "function" ? sync : null;
      if (remoteWriter && state.sync.pending) void retryRemoteSync();
    },
    flushRemoteSync,
    retryRemoteSync,
    syncStatus,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    clear() { state.records = {}; state.runs = []; persist(); }
  };
}

export const prospectStore = createProspectStore();
