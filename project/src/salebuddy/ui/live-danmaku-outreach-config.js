const LIVE_DANMAKU_OUTREACH_GOAL = "直播间出现弹幕的用户都进入触达流程，不判断成交状态或购买意向。";
const LIVE_DANMAKU_OUTREACH_MESSAGE = "看到你刚才在直播间留言了，方便说说你想了解什么吗？";

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
  return null;
}

export function buildLiveDanmakuOutreachTaskPayload(flow = {}) {
  const identity = accountIdentity(flow);
  const accountRef = accountReference(flow, identity);
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
      goal: LIVE_DANMAKU_OUTREACH_GOAL,
      requirements: "",
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
      template: LIVE_DANMAKU_OUTREACH_MESSAGE,
      strategy: LIVE_DANMAKU_OUTREACH_MESSAGE
    },
    caps: {
      dailyMax: 50,
      sendIntervalMs: 0,
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

export { LIVE_DANMAKU_OUTREACH_GOAL, LIVE_DANMAKU_OUTREACH_MESSAGE };
