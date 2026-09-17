import {
  DOUYIN_ACQUISITION_ACTIVE_AGENT_IDS,
  MARKETPLACE_STANDALONE_AGENT_IDS
} from "../src/salebuddy/agents/marketplace.js";

export const OFFICE_AGENT_IDS = Object.freeze([
  ...DOUYIN_ACQUISITION_ACTIVE_AGENT_IDS,
  ...MARKETPLACE_STANDALONE_AGENT_IDS
]);
const ACTIVE = new Set(["running", "working", "starting", "configuring", "accepted", "queued", "waiting_reply", "listening", "degraded", "retrying"]);
const rank = { working: 0, listening: 1, attention: 2, unknown: 3, paused: 4, idle: 5 };
const instant = value => typeof value === "number" ? value : Date.parse(value) || 0;
const AUTHORIZATION_ERROR_CODES = new Set(["ACCOUNT_OFFLINE", "AUTHORIZATION_REQUIRED", "DOUYIN_AUTH_EXPIRED", "DOUYIN_CLOUD_OFFLINE", "LOGIN_EXPIRED"]);
const ACQUISITION_AGENT_IDS = new Set(OFFICE_AGENT_IDS);
const CONTINUOUS_LISTENER_AGENT_IDS = new Set(["mkt-comment-acquisition", "mkt-find-people", "mkt-live-danmaku-outreach"]);
const MAX_OFFICE_QUEUE_ITEMS = 200;
const MAX_OFFICE_PROFILE_ITEMS = 300;
const MAX_OFFICE_REPLY_ITEMS = 200;
const CONFIGURATION_FIELDS = Object.freeze({
  findingStrategy: ["sourceScope", "audienceGoal", "requirements", "intentSignals", "minScore", "filters", "scopeExpansion", "expandScope"],
  touchContent: ["channel", "message", "text", "template", "strategy", "replyStyle", "handoffBoundary", "approvalMode", "conversionGoal"],
  frequency: ["mode", "interval", "maxTouchesPerDay", "minIntervalMinutes", "dailyMax", "sendIntervalMs", "cooldownMs", "maxPerMinute"],
  timeWindow: ["timezone", "schedule"],
  stopConditions: ["stopOnReply", "stopOnOptOut", "maxFailures", "dailyCapReached", "onError"]
});

function isRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function cloneJson(value) {
  if (value === undefined) return undefined;
  try { return JSON.parse(JSON.stringify(value)); } catch { return undefined; }
}

function stripOfficeSecrets(value) {
  if (Array.isArray(value)) return value.map(stripOfficeSecrets);
  if (!isRecord(value)) return value;
  const output = {};
  for (const [key, entry] of Object.entries(value)) {
    if (/(api[_-]?key|access[_-]?token|refresh[_-]?token|password|passwd|secret|cookie|csrf|authorization|jwt)/i.test(key)) continue;
    output[key] = stripOfficeSecrets(entry);
  }
  return output;
}

function safeOfficeClone(value) {
  const cloned = cloneJson(value);
  return cloned === undefined ? undefined : stripOfficeSecrets(cloned);
}

function boundedOfficeProfiles(profiles) {
  if (!isRecord(profiles)) return undefined;
  const entries = Object.entries(profiles);
  const bounded = Object.fromEntries(entries.slice(-MAX_OFFICE_PROFILE_ITEMS).map(([key, value]) => [key, safeOfficeClone(value)]));
  return Object.keys(bounded).length ? bounded : undefined;
}

/** Keep the realtime workbench on one authoritative, bounded task snapshot. */
function acquisitionSnapshotForOffice(task) {
  const resultSnapshot = safeOfficeClone(task?.resultSnapshot || task?.result?.resultSnapshot);
  const lastScan = safeOfficeClone(task?.lastScan);
  const lastAnalysis = safeOfficeClone(task?.lastAnalysis);
  const approvalQueue = Array.isArray(task?.approvalQueue)
    ? safeOfficeClone(task.approvalQueue.slice(-MAX_OFFICE_QUEUE_ITEMS))
    : undefined;
  const candidateProfiles = boundedOfficeProfiles(task?.candidateProfiles);
  const replies = Array.isArray(task?.replies)
    ? safeOfficeClone(task.replies.slice(-MAX_OFFICE_REPLY_ITEMS))
    : undefined;
  const outreachQuota = safeOfficeClone(task?.outreachQuota);
  const counters = safeOfficeClone(task?.counters);
  const snapshot = {
    ...(isRecord(resultSnapshot) ? { resultSnapshot } : {}),
    ...(isRecord(lastScan) ? { lastScan } : {}),
    ...(isRecord(lastAnalysis) ? { lastAnalysis } : {}),
    ...(approvalQueue?.length ? { approvalQueue } : {}),
    ...(candidateProfiles ? { candidateProfiles } : {}),
    ...(replies?.length ? { replies } : {}),
    ...(isRecord(outreachQuota) ? { outreachQuota } : {}),
    ...(isRecord(counters) ? { counters } : {}),
    ...(task?.updatedAt ? { updatedAt: task.updatedAt } : {})
  };
  return Object.keys(snapshot).length ? snapshot : null;
}

function pickConfigurationFields(source, fields) {
  if (!isRecord(source)) return undefined;
  const picked = {};
  for (const field of fields) {
    if (source[field] === undefined) continue;
    const value = cloneJson(source[field]);
    if (value !== undefined) picked[field] = value;
  }
  return Object.keys(picked).length ? picked : undefined;
}

function sanitizeSourceScope(source, { listener = false } = {}) {
  if (typeof source === "string") return source;
  if (!isRecord(source)) return source == null ? undefined : cloneJson(source);
  const allowed = ["kind", "type", "scope", "industries", "regions", "timeWindow", "fanRange", "minFollowers", "maxFollowers", "minPlayCount", "maxPlayCount", "keywords", "excludeKeywords", "intentSignals", "minScore", "accountTypes", "verifiedOnly", "commentLimit", "videoLimit", "lookbackDays", "gender", "ageRange"];
  const result = pickConfigurationFields(source, allowed);
  if (listener && isRecord(result)) {
    delete result.timeWindow;
    delete result.lookbackDays;
  }
  return result;
}

/** Return task configuration needed by the UI without exposing task internals. */
function acquisitionConfiguration(task) {
  if (!ACQUISITION_AGENT_IDS.has(task?.agentId)) return undefined;
  const raw = isRecord(task?.configuration) ? task.configuration : isRecord(task?.config) ? task.config : null;
  if (!raw) return undefined;
  const listener = CONTINUOUS_LISTENER_AGENT_IDS.has(task.agentId);
  const comprehensiveListener = task.agentId === "mkt-comment-acquisition";
  // Canonical task configuration intentionally omits runtime-only flags. Read
  // the durable execution config as a fallback so discovery listeners never
  // surface private-outreach controls after a status refresh.
  const discoveryOnly = raw.discoveryOnly === true || task?.config?.discoveryOnly === true;
  const rawAudience = isRecord(raw.audienceRules) ? raw.audienceRules : {};
  const result = {};
  const version = Number(task.configurationVersion || task.configVersion || raw.version);
  if (Number.isFinite(version) && version > 0) result.version = version;

  const findingStrategy = pickConfigurationFields(
    isRecord(raw.findingStrategy) ? raw.findingStrategy : {
      sourceScope: raw.sourceScope,
      audienceGoal: rawAudience.goal,
      requirements: rawAudience.requirements,
      intentSignals: rawAudience.intentSignals,
      minScore: rawAudience.minScore,
      filters: rawAudience.filters
    },
    CONFIGURATION_FIELDS.findingStrategy
  );
  if (findingStrategy?.sourceScope !== undefined) findingStrategy.sourceScope = sanitizeSourceScope(findingStrategy.sourceScope, { listener });
  if (findingStrategy) result.findingStrategy = findingStrategy;

  if (!discoveryOnly) {
    const touchContent = pickConfigurationFields(
      isRecord(raw.touchContent) ? raw.touchContent : {
        channel: raw.touchChannel,
        message: raw.contentPolicy?.strategy || raw.contentPolicy?.template,
        strategy: raw.contentPolicy?.strategy,
        replyStyle: raw.contentPolicy?.replyStyle,
        handoffBoundary: raw.contentPolicy?.handoffBoundary,
        approvalMode: raw.approvalMode
      },
      CONFIGURATION_FIELDS.touchContent
    );
    if (touchContent) result.touchContent = touchContent;

    const frequencySource = isRecord(raw.frequency)
      ? {
        ...raw.frequency,
        maxTouchesPerDay: raw.frequency.maxTouchesPerDay ?? raw.frequency.dailyMax ?? raw.caps?.dailyMax,
        minIntervalMinutes: raw.frequency.minIntervalMinutes ?? (Number(raw.caps?.sendIntervalMs) > 0 ? Number(raw.caps.sendIntervalMs) / 60000 : 0)
      }
      : {
        mode: raw.frequency,
        maxTouchesPerDay: raw.caps?.dailyMax,
        minIntervalMinutes: Number(raw.caps?.sendIntervalMs) > 0 ? Number(raw.caps.sendIntervalMs) / 60000 : 0
      };
    const frequency = pickConfigurationFields(
      frequencySource,
      CONFIGURATION_FIELDS.frequency
    );
    if (frequency) result.frequency = frequency;
  }

  if (!listener) {
    const timeWindow = cloneJson(raw.timeWindow);
    if (timeWindow !== undefined && timeWindow !== null) result.timeWindow = timeWindow;
  }
  if (!discoveryOnly && !comprehensiveListener) {
    const stopConditions = pickConfigurationFields(raw.stopConditions, CONFIGURATION_FIELDS.stopConditions);
    if (stopConditions) result.stopConditions = stopConditions;
  }
  return Object.keys(result).length ? result : undefined;
}

function isAuthorizationIssue(value) {
  const code = String(value?.code || value?.reason || "").trim().toUpperCase();
  if (AUTHORIZATION_ERROR_CODES.has(code)) return true;
  const message = typeof value === "string" ? value : value?.message || "";
  return /授权已失效|授权过期|重新连接账号|重新登录|登录失效|登录过期|账号掉线|云电脑已确认掉线/.test(String(message));
}
function resultFacts(result = {}) {
  const counts = result.counts || result.resultSnapshot?.counts || {};
  return { summary: typeof result.summary === "string" ? result.summary.slice(0, 800) : "",
    counts: Object.fromEntries(Object.entries(counts).filter(([key, value]) => /^[a-zA-Z_]{1,40}$/.test(key) && Number.isFinite(value) && value >= 0).slice(0, 20)) };
}

export function officeReceiptState(result) {
  if (result?.receiptPending) return "unknown";
  const receipt = result?.receipt || result;
  const state = String(receipt?.state || receipt?.delivery_state || receipt?.deliveryState || receipt?.status || "").toLowerCase();
  if (["failed", "failure", "error", "rejected", "denied", "blocked"].includes(state) || result?.ok === false) return "failed";
  return ["sent", "delivered", "success", "succeeded", "completed"].includes(state) ? "completed" : "unknown";
}

function taskState(task) {
  const state = String(task.state || task.status || "unknown").toLowerCase();
  if (["stopped", "cancelled", "canceled", "completed", "succeeded", "done", "partial"].includes(state)) return "idle";
  if (task.resumeBlocked && isAuthorizationIssue(task.resumeBlocked)) return "attention";
  if (isAuthorizationIssue(task.error) || isAuthorizationIssue(task.lastError)) return "attention";
  if (task.error?.code === "RECEPTION_SETUP_REQUIRED" || task.lastError?.code === "RECEPTION_SETUP_REQUIRED") return "idle";
  if (state === "paused") return "idle";
  if (task.runtimeAlive === false && ACTIVE.has(state)) return "unknown";
  // A live task can have a non-critical source warning (for example, no
  // active livestream). It remains work in progress; only auth loss needs
  // user action in the office surface.
  if (ACTIVE.has(state) && task.runtimeAlive !== false) return "working";
  if (task.error || task.lastError || ["failed", "error", "blocked"].includes(state)) return "idle";
  if (ACTIVE.has(state)) {
    if (task.runtimeAlive === false) return "unknown";
    return "working";
  }
  return state === "idle" ? "idle" : "unknown";
}

function officeTaskWork(agentType, task, state, observedAt) {
  const configuration = acquisitionConfiguration(task);
  const progress = Number(task.progress);
  const resultSnapshot = safeOfficeClone(task.resultSnapshot || task.result?.resultSnapshot) || null;
  const acquisitionSnapshot = acquisitionSnapshotForOffice(task);
  const accountIdentity = safeOfficeClone(task.accountIdentity || task.context?.accountIdentity);
  const accountLabel = task.accountLabel || task.accountName || accountIdentity?.nickname || null;
  return {
    agentType,
    state,
    task: task.goal || task.task || "",
    phase: task.phase || task.stage || "",
    ...(Number.isFinite(progress) ? { progress: Math.max(0, Math.min(100, progress)) } : {}),
    startedAt: instant(task.startedAt),
    updatedAt: instant(task.updatedAt),
    metadata: {
      officeStatus: state,
      observedAt,
      taskKey: task.key || null,
      taskId: task.taskId || null,
      taskRunId: task.taskRunId || null,
      accountId: task.accountKey || task.accountId || null,
      accountKey: task.accountKey || task.accountId || null,
      ...(accountLabel ? { accountLabel } : {}),
      ...(accountIdentity ? { accountIdentity } : {}),
      longRunning: task.longRunning === true,
      resumeBlocked: task.resumeBlocked || null,
      error: task.error || task.lastError || null,
      ...(isRecord(task.outreachQuota) ? { outreachQuota: safeOfficeClone(task.outreachQuota) } : {}),
      outcome: task.state || null,
      result: resultFacts(task.result || task.resultSnapshot || {}),
      resultSnapshot,
      ...(acquisitionSnapshot ? { acquisitionSnapshot } : {}),
      ...(Number.isFinite(progress) ? { progress: Math.max(0, Math.min(100, progress)) } : {}),
      ...(task.progressSource ? { progressSource: task.progressSource } : {}),
      ...(Array.isArray(task.analysisProcess) ? { analysisProcess: cloneJson(task.analysisProcess) } : {}),
      taskState: state,
      taskVersion: task.taskVersion ?? task.version ?? null,
      configVersion: task.configurationVersion ?? task.configVersion ?? task.configuration?.version ?? null,
      ...(configuration ? { configuration } : {})
    }
  };
}

/** Project runtime metadata and the safe task configuration needed by the UI. */
export function buildOfficeStatus({ tenantId = null, observedAt = Date.now(), sources = [] } = {}) {
  const taskWorks = [];
  const works = OFFICE_AGENT_IDS.map(agentType => {
    const relevant = sources.filter(source => source.agentIds.includes(agentType));
    const latest = new Map();
    for (const task of relevant.flatMap(source => source.tasks || []).filter(task => (task.tenantId || null) === tenantId && task.agentId === agentType)) {
      const key = task.taskId ? JSON.stringify([task.taskId, task.accountId || null]) : task;
      const previous = latest.get(key);
      if (!previous || ACTIVE.has(String(task.state).toLowerCase()) || (!ACTIVE.has(String(previous.state).toLowerCase()) && instant(task.updatedAt) >= instant(previous.updatedAt))) latest.set(key, task);
    }
    const tasks = [...latest.values()]
      .map(task => ({ task, state: taskState(task) }))
      .sort((a, b) => Math.min(rank[a.state], 2) - Math.min(rank[b.state], 2)
        || instant(b.task.updatedAt) - instant(a.task.updatedAt) || rank[a.state] - rank[b.state]);
    const selected = tasks[0];
    const unavailable = !relevant.length || relevant.some(source => source.error);
    const state = unavailable ? "unknown" : selected?.state || "idle";
    const task = selected?.task || {};
    const summary = officeTaskWork(agentType, task, state, observedAt);
    summary.metadata.activeTaskCount = tasks.filter(item => item.state === "working").length;
    summary.metadata.tasks = tasks.map(({ task: item, state: itemState }) => ({
      taskId: item.taskId || null,
      taskRunId: item.taskRunId || null,
      accountId: item.accountId || null,
      state: itemState
    }));
    if (!unavailable) {
      for (const item of tasks) taskWorks.push(officeTaskWork(agentType, item.task, item.state, observedAt));
    }
    return summary;
  });
  taskWorks.sort((left, right) => instant(right.updatedAt) - instant(left.updatedAt));
  return { observedAt, works, taskWorks };
}

/** In-flight requests remain observed until their server-side operation settles. */
export function createOfficeOperations({ now = Date.now } = {}) {
  const tasks = new Map();
  const matches = (task, context = {}) => Object.entries(context).every(([key, value]) => value == null || task[key] === value);
  const update = (context = {}, patch = {}) => {
    const task = [...tasks.values()].find((candidate) => matches(candidate, context));
    if (!task) return false;
    const nextMetadata = patch.metadata && typeof patch.metadata === "object"
      ? { ...(task.metadata || {}), ...patch.metadata }
      : task.metadata;
    Object.assign(task, patch, { updatedAt: now() });
    if (nextMetadata) task.metadata = nextMetadata;
    if (patch.resultSnapshot && typeof patch.resultSnapshot === "object") task.resultSnapshot = cloneJson(patch.resultSnapshot);
    return true;
  };
  return {
    list: () => [...tasks.values()],
    update,
    begin(context) {
      const token = Symbol("office-operation");
      const task = { ...context, state: "working", startedAt: now(), updatedAt: now() };
      tasks.set(token, task);
      const finish = (state = "completed", result = null) => {
        const normalized = String(state).toLowerCase();
        task.state = ACTIVE.has(normalized) ? "unknown" : normalized; task.updatedAt = now();
        if (result) task.result = resultFacts(result);
        if (result?.resultSnapshot && typeof result.resultSnapshot === "object") task.resultSnapshot = cloneJson(result.resultSnapshot);
        const completed = [...tasks.entries()].filter(([, value]) => value.state !== "working");
        for (const [key] of completed.slice(0, Math.max(0, completed.length - 100))) tasks.delete(key);
      };
      finish.update = (patch = {}) => update({ taskId: task.taskId, taskRunId: task.taskRunId, agentId: task.agentId, tenantId: task.tenantId }, patch);
      return finish;
    }
  };
}
