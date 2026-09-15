import { DOUYIN_AUTO_AUDIENCE_GOAL } from "../agents/acquisition-contract.js";

export const COMMENT_ACQUISITION_DEFAULTS = Object.freeze({
  sourceScope: Object.freeze({ kind: "authorized_account_all_signals" }),
  longRunning: true,
  approvalMode: "auto",
  touchChannel: "private_message",
  touchStrategy: "先回应对方的具体留言，再用一个问题了解需求，语气自然，不直接承诺价格或效果。",
  contactTiming: "识别到高意向潜客后自动触达",
  replyStyle: "专业、简短、自然",
  handoffBoundary: "价格承诺、退款、投诉和无法确认的库存信息交给人工。",
  minScore: 80,
  frequency: Object.freeze({ maxTouchesPerDay: 30, minIntervalMinutes: 15 }),
  stopConditions: Object.freeze({ stopOnReply: false, stopOnOptOut: true })
});

export { DOUYIN_AUTO_AUDIENCE_GOAL };

function text(value) {
  return String(value ?? "").trim();
}

function score(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, Math.round(parsed))) : fallback;
}

function firstText(...values) {
  for (const value of values) {
    const normalized = text(value);
    if (normalized) return normalized;
  }
  return "";
}

function authorizedAccountIdentity(flow = {}) {
  const source = flow.accountIdentity && typeof flow.accountIdentity === "object"
    ? flow.accountIdentity
    : {};
  const profileUrl = firstText(source.profileUrl, source.profile_url, source.homepageUrl, source.homepage_url,
    /^https?:\/\//i.test(text(flow.accountRef)) ? flow.accountRef : "");
  const uniqueId = firstText(source.uniqueId, source.unique_id, source.douyinId, source.douyin_id, source.handle);
  const secId = firstText(source.secId, source.sec_id, source.secUid, source.sec_uid, source.secUserId, source.sec_user_id);
  const uid = firstText(source.uid, source.userId, source.user_id, source.platformUid, source.platform_uid);
  const nickname = firstText(source.nickname, source.nick_name, source.accountName, source.account_name, source.name, flow.account);
  const identity = { ...source };
  if (secId) identity.secId = secId;
  if (uid) identity.uid = uid;
  if (nickname) identity.nickname = nickname;
  if (profileUrl) identity.profileUrl = profileUrl;
  if (uniqueId) identity.uniqueId = uniqueId;
  return Object.keys(identity).length ? identity : null;
}

function authorizedAccountReference(flow = {}, identity = authorizedAccountIdentity(flow)) {
  return firstText(
    flow.accountRef,
    identity?.profileUrl,
    identity?.uniqueId,
    identity?.secId,
    identity?.uid
  ) || null;
}

export function normalizeCommentAcquisitionConfig(flow = {}) {
  const configuredStopConditions = flow.stopConditions && typeof flow.stopConditions === "object" && !Array.isArray(flow.stopConditions)
    ? flow.stopConditions
    : {};
  const accountIdentity = authorizedAccountIdentity(flow);
  const accountRef = authorizedAccountReference(flow, accountIdentity);
  const maxTouchesPerDay = COMMENT_ACQUISITION_DEFAULTS.frequency.maxTouchesPerDay;
  const minIntervalMinutes = COMMENT_ACQUISITION_DEFAULTS.frequency.minIntervalMinutes;
  const minScore = score(flow.minScore ?? flow.audienceRules?.minScore, COMMENT_ACQUISITION_DEFAULTS.minScore);
  const replyStyle = firstText(flow.replyStyle, flow.replyTone, COMMENT_ACQUISITION_DEFAULTS.replyStyle);
  const handoffBoundary = firstText(flow.handoffBoundary, flow.handoffRules, COMMENT_ACQUISITION_DEFAULTS.handoffBoundary);
  return {
    sourceScope: {
      ...COMMENT_ACQUISITION_DEFAULTS.sourceScope,
      accountId: text(flow.accountId) || null,
      accountName: text(flow.account) || null,
      accountRef,
      accountIdentity
    },
    accountRef,
    accountIdentity,
    longRunning: true,
    approvalMode: COMMENT_ACQUISITION_DEFAULTS.approvalMode,
    // The comprehensive acquisition Agent only performs first outreach by
    // private message. Public replies are not part of this product surface.
    touchChannel: COMMENT_ACQUISITION_DEFAULTS.touchChannel,
    audienceRules: {
      mode: "account_context",
      goal: DOUYIN_AUTO_AUDIENCE_GOAL,
      requirements: "",
      minScore,
      autoIdentifyAccountPositioning: true,
      autoIdentifyServiceUsers: true
    },
    contentPolicy: {
      mode: "evidence_first",
      quoteComment: false,
      maxLength: 120,
      template: "",
      strategy: "",
      conversionGoal: firstText(flow.replyObjective, flow.conversionGoal),
      replyStyle,
      handoffBoundary
    },
    frequency: {
      // First outreach is continuous: a high-intent signal is handled when
      // it arrives. Work schedules belong to the private-inbox reception Agent.
      mode: COMMENT_ACQUISITION_DEFAULTS.contactTiming,
      maxTouchesPerDay,
      minIntervalMinutes
    },
    caps: {
      dailyMax: maxTouchesPerDay,
      sendIntervalMs: minIntervalMinutes * 60 * 1000,
      cooldownMs: 0
    },
    stopConditions: {
      ...COMMENT_ACQUISITION_DEFAULTS.stopConditions,
      ...configuredStopConditions,
      stopOnReply: false
    }
  };
}

export function validateCommentAcquisitionSetup(flow = {}) {
  if (!text(flow.accountId) && !(Array.isArray(flow.authorizedAccounts) && flow.authorizedAccounts.length)) return "请先完成当前抖音账号授权";
  if (!text(flow.replyObjective)) return "请说明希望通过私信达成什么目标";
  return null;
}

export function buildCommentAcquisitionTaskPayload(flow = {}) {
  const config = normalizeCommentAcquisitionConfig(flow);
  return {
    taskId: text(flow.taskId),
    taskRunId: text(flow.taskRunId),
    conversationId: text(flow.conversationId) || `agent-square-${text(flow.taskId)}`,
    agentId: "mkt-comment-acquisition",
    accountId: config.sourceScope.accountId,
    accountRef: config.accountRef,
    accountIdentity: config.accountIdentity,
    config
  };
}

export function validateLiveLeadSetup(flow = {}) {
  // Kept for historical task compatibility. New live monitoring belongs to
  // the finder and uses the same authorized-account listener validation.
  return validateFinderListenerSetup({
    ...flow,
    sourceScope: "authorized_account_live"
  });
}

export function buildLiveLeadTaskPayload(flow = {}) {
  // Do not recreate the retired live-only role. Any persisted caller that
  // still invokes this compatibility helper is migrated to the finder.
  return buildFinderLiveTaskPayload(flow);
}

export function buildFinderLiveTaskPayload(flow = {}) {
  return buildFinderListenerTaskPayload({
    ...flow,
    sourceScope: "authorized_account_live"
  });
}

function finderListenerSelections(flow = {}) {
  const selected = Array.isArray(flow.taskChoices?.finderOwnData?.selected)
    ? flow.taskChoices.finderOwnData.selected
    : [];
  return [...new Set(selected
    .map((value) => text(value).toLowerCase())
    .filter((value) => ["comments", "live", "interactions"].includes(value)))];
}

function finderListenerSourceKind(flow = {}) {
  const selected = finderListenerSelections(flow);
  if (selected.length > 1) return "authorized_account_all_signals";
  const raw = firstText(
    selected[0],
    flow.sourceScope,
    flow.config?.sourceScope?.kind,
    flow.compositeFinderDataSource
  ).toLowerCase();
  if (["authorized_account_all_signals", "own_account_all_signals", "all", "all_signals"].includes(raw)) return "authorized_account_all_signals";
  if (["authorized_account_live", "own_account_live", "live", "直播间", "直播"].includes(raw)) return "authorized_account_live";
  if (["authorized_account_interactions", "own_account_interactions", "interactions", "interaction", "互动"].includes(raw)) return "authorized_account_interactions";
  return "authorized_account_comments";
}

export function validateFinderListenerSetup(flow = {}) {
  if (!text(flow.accountId) && !(Array.isArray(flow.authorizedAccounts) && flow.authorizedAccounts.length)) return "请先完成找客专员的抖音账号授权";
  if (!text(flow.product) && !text(flow.requirements)) return "请告诉我你想找什么样的人";
  return null;
}

export function buildFinderListenerTaskPayload(flow = {}) {
  const base = buildCommentAcquisitionTaskPayload(flow);
  const sourceKind = finderListenerSourceKind(flow);
  const config = {
    ...base.config,
    sourceScope: {
      ...base.config.sourceScope,
      kind: sourceKind
    },
    audienceRules: {
      ...base.config.audienceRules,
      mode: "manual",
      autoIdentifyAccountPositioning: false,
      autoIdentifyServiceUsers: false,
      goal: firstText(flow.product, flow.requirements),
      requirements: text(flow.requirements),
      minScore: 0
    },
    // Finders only observe new authorized-account signals. They never inherit
    // historical collection, first-outreach, or reception settings.
    discoveryOnly: true,
    approvalMode: "manual",
    autoStartCloud: false
  };
  for (const field of [
    "touchChannel",
    "touchContent",
    "contentPolicy",
    "frequency",
    "caps",
    "workWindow",
    "workSchedule",
    "schedule",
    "stopConditions"
  ]) delete config[field];
  return {
    ...base,
    // The finder owns candidate records; the shared authorized-account cloud
    // runtime performs the actual listening.
    agentId: "mkt-find-people",
    executionAgentId: "mkt-comment-acquisition",
    config
  };
}
