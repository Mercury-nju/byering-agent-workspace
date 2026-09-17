const LIVE_DANMAKU_OUTREACH_DEFAULT_GOAL = "承接直播间互动，邀请有兴趣的用户继续了解商品。";
const LIVE_DANMAKU_OUTREACH_DEFAULT_MESSAGE = "看到你刚才在直播间留言了，方便说说你想了解什么吗？";
const LIVE_DANMAKU_OUTREACH_SCOPE = "直播间出现弹幕的用户都进入触达流程，不判断成交状态或购买意向。";

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
  const identity = flow.accountIdentity && typeof flow.accountIdentity === "object"
    ? flow.accountIdentity
    : {};
  return Object.keys(identity).length ? { ...identity } : null;
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

export function validateLiveDanmakuOutreachSetup(flow = {}) {
  if (!text(flow.accountId) && !(Array.isArray(flow.authorizedAccounts) && flow.authorizedAccounts.length)) {
    return "请先完成直播间未成交客户触达的抖音账号授权";
  }
  if (!text(flow.liveDanmakuOutreachGoal) && !text(flow.outreachGoal) && !text(flow.conversionGoal)) {
    return "请先说明触达目的";
  }
  return null;
}

export function normalizeLiveDanmakuOutreachSettings(flow = {}) {
  const configuration = flow.configuration && typeof flow.configuration === "object" ? flow.configuration : {};
  const audienceRules = configuration.audienceRules && typeof configuration.audienceRules === "object"
    ? configuration.audienceRules
    : {};
  const findingStrategy = configuration.findingStrategy && typeof configuration.findingStrategy === "object"
    ? configuration.findingStrategy
    : {};
  const contentPolicy = configuration.contentPolicy && typeof configuration.contentPolicy === "object"
    ? configuration.contentPolicy
    : {};
  const touchContent = configuration.touchContent && typeof configuration.touchContent === "object"
    ? configuration.touchContent
    : {};
  const caps = configuration.caps && typeof configuration.caps === "object" ? configuration.caps : {};
  const frequency = configuration.frequency && typeof configuration.frequency === "object" ? configuration.frequency : {};
  const goal = firstText(
    flow.liveDanmakuOutreachGoal,
    flow.outreachGoal,
    flow.conversionGoal,
    audienceRules.goal,
    findingStrategy.audienceGoal,
    contentPolicy.conversionGoal,
    touchContent.conversionGoal,
    LIVE_DANMAKU_OUTREACH_DEFAULT_GOAL
  );
  const message = firstText(
    flow.liveDanmakuOutreachMessage,
    flow.outreachMessage,
    contentPolicy.strategy,
    contentPolicy.template,
    touchContent.message,
    LIVE_DANMAKU_OUTREACH_DEFAULT_MESSAGE
  );
  const configuredIntervalMs = Number(caps.sendIntervalMs);
  const rawInterval = flow.minIntervalMinutes
    ?? (Number.isFinite(configuredIntervalMs) ? configuredIntervalMs / 60000 : frequency.minIntervalMinutes);
  const minIntervalMinutes = Number.isFinite(Number(rawInterval))
    ? Math.max(0, Math.min(120, Number(rawInterval)))
    : 0;
  return { goal, message, dailyMax: null, minIntervalMinutes };
}

export function buildLiveDanmakuOutreachTaskPayload(flow = {}) {
  const identity = accountIdentity(flow);
  const accountRef = accountReference(flow, identity);
  const taskId = text(flow.taskId);
  const settings = normalizeLiveDanmakuOutreachSettings(flow);
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
      goal: settings.goal,
      requirements: settings.goal,
      minScore: 0
    },
    discoveryOnly: false,
    analysisOnly: false,
    analysisKind: "live_danmaku_outreach",
    liveDanmakuOutreach: true,
    touchEveryLiveDanmaku: true,
    liveSignals: ["danmaku"],
    touchChannel: "private_message",
    approvalMode: "auto",
    contentPolicy: {
      quoteComment: false,
      maxLength: 120,
      template: settings.message,
      strategy: settings.message,
      conversionGoal: settings.goal
    },
    caps: {
      dailyMax: settings.dailyMax,
      sendIntervalMs: settings.minIntervalMinutes * 60 * 1000,
      cooldownMs: 0
    },
    autoStartCloud: false
  };
  return {
    taskId,
    taskRunId: text(flow.taskRunId),
    conversationId: text(flow.conversationId) || `agent-square-${taskId}`,
    agentId: "mkt-live-danmaku-outreach",
    executionAgentId: "mkt-comment-acquisition",
    accountId: text(flow.accountId),
    accountRef,
    accountIdentity: identity,
    config
  };
}

const LIVE_DANMAKU_OUTREACH_GOAL = LIVE_DANMAKU_OUTREACH_DEFAULT_GOAL;
const LIVE_DANMAKU_OUTREACH_MESSAGE = LIVE_DANMAKU_OUTREACH_DEFAULT_MESSAGE;

export {
  LIVE_DANMAKU_OUTREACH_DEFAULT_GOAL,
  LIVE_DANMAKU_OUTREACH_DEFAULT_MESSAGE,
  LIVE_DANMAKU_OUTREACH_GOAL,
  LIVE_DANMAKU_OUTREACH_MESSAGE,
  LIVE_DANMAKU_OUTREACH_SCOPE
};
