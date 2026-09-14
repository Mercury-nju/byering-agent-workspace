const DEFAULT_LIVE_SIGNALS = Object.freeze(["danmaku", "likes", "gifts"]);
const DEFAULT_LIVE_DANMAKU_GOAL = "梳理直播间高频问题、用户需求、购买意向和反对点。";

function text(value) {
  return String(value ?? "").trim();
}

function firstText(...values) {
  for (const value of values) {
    const normalized = text(value);
    if (normalized) return normalized;
  }
  return "";
}

function accountIdentity(flow = {}) {
  const source = flow.accountIdentity && typeof flow.accountIdentity === "object"
    ? flow.accountIdentity
    : {};
  return Object.keys(source).length ? { ...source } : null;
}

function accountReference(flow = {}, identity = accountIdentity(flow)) {
  return firstText(
    flow.accountRef,
    identity?.profileUrl,
    identity?.profile_url,
    identity?.uniqueId,
    identity?.unique_id,
    identity?.secId,
    identity?.sec_id,
    identity?.secUid,
    identity?.sec_uid,
    identity?.uid,
    flow.accountId
  ) || null;
}

function normalizeSignals(values) {
  const selected = [...new Set((Array.isArray(values) ? values : DEFAULT_LIVE_SIGNALS)
    .map((value) => text(value).toLowerCase())
    .filter((value) => ["danmaku", "likes", "gifts", "follows", "joins"].includes(value)))];
  return selected.length ? selected : [...DEFAULT_LIVE_SIGNALS];
}

export function validateLiveDanmakuAnalysisSetup(flow = {}) {
  if (!text(flow.accountId) && !(Array.isArray(flow.authorizedAccounts) && flow.authorizedAccounts.length)) {
    return "请先完成直播间弹幕分析的抖音账号授权";
  }
  if (!text(flow.liveDanmakuGoal) && !text(flow.requirements)) {
    return "请告诉我这次想重点分析什么";
  }
  return null;
}

export function buildLiveDanmakuAnalysisTaskPayload(flow = {}) {
  const identity = accountIdentity(flow);
  const accountRef = accountReference(flow, identity);
  const goal = firstText(flow.liveDanmakuGoal, flow.requirements, DEFAULT_LIVE_DANMAKU_GOAL);
  const signals = normalizeSignals(flow.liveDanmakuSignals);
  const taskId = text(flow.taskId);
  const config = {
    sourceScope: {
      kind: "authorized_account_live",
      accountId: text(flow.accountId) || null,
      accountName: text(flow.account) || null,
      accountRef,
      accountIdentity: identity
    },
    accountRef,
    accountIdentity: identity,
    audienceRules: {
      goal,
      requirements: text(flow.requirements),
      minScore: 0
    },
    discoveryOnly: true,
    analysisOnly: true,
    analysisKind: "live_danmaku",
    liveSignals: signals,
    approvalMode: "manual",
    autoStartCloud: false
  };
  return {
    taskId,
    taskRunId: text(flow.taskRunId),
    conversationId: text(flow.conversationId) || `agent-square-${taskId}`,
    agentId: "mkt-live-danmaku-analysis",
    executionAgentId: "mkt-comment-acquisition",
    accountId: text(flow.accountId),
    accountRef,
    accountIdentity: identity,
    config
  };
}

export { DEFAULT_LIVE_SIGNALS, DEFAULT_LIVE_DANMAKU_GOAL };
