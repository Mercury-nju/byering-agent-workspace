import {
  DOUYIN_ACQUISITION_DISCOVERY_GOAL,
  DOUYIN_ACQUISITION_FIRST_TOUCH_RULE,
  DOUYIN_ACQUISITION_HANDOFF_RULES,
  DOUYIN_ACQUISITION_LIMITS,
  DOUYIN_ACQUISITION_OBJECTIVE,
  DOUYIN_ACQUISITION_REPLY_TONE,
  DOUYIN_ACQUISITION_SYSTEM_PROMPT,
  buildDouyinAcquisitionSystemPrompt,
  douyinAcquisitionHandoffBoundary,
  normalizeDouyinAcquisitionAdvancedSettings
} from "../agents/douyin-acquisition-prompt.js";

export const COMMENT_ACQUISITION_DEFAULTS = Object.freeze({
  sourceScope: Object.freeze({ kind: "authorized_account_all_signals" }),
  longRunning: true,
  approvalMode: "auto",
  touchChannel: "private_message",
  touchStrategy: DOUYIN_ACQUISITION_FIRST_TOUCH_RULE,
  contactTiming: "识别到高意向潜客后自动触达",
  replyStyle: DOUYIN_ACQUISITION_REPLY_TONE,
  handoffBoundary: DOUYIN_ACQUISITION_HANDOFF_RULES.join("；"),
  minScore: DOUYIN_ACQUISITION_LIMITS.minScore,
  frequency: Object.freeze({ dailyMax: DOUYIN_ACQUISITION_LIMITS.dailyMax, maxTouchesPerDay: DOUYIN_ACQUISITION_LIMITS.dailyMax, minIntervalMinutes: DOUYIN_ACQUISITION_LIMITS.minIntervalMinutes }),
  stopConditions: Object.freeze({ stopOnReply: false, stopOnOptOut: true })
});

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
  const accountIdentity = authorizedAccountIdentity(flow);
  const accountRef = authorizedAccountReference(flow, accountIdentity);
  const advanced = normalizeDouyinAcquisitionAdvancedSettings(flow);
  const maxTouchesPerDay = advanced.maxTouchesPerDay === null
    ? COMMENT_ACQUISITION_DEFAULTS.frequency.dailyMax
    : Math.min(advanced.maxTouchesPerDay, DOUYIN_ACQUISITION_LIMITS.dailyMax);
  const minIntervalMinutes = advanced.minIntervalMinutes === null
    ? COMMENT_ACQUISITION_DEFAULTS.frequency.minIntervalMinutes
    : Math.max(advanced.minIntervalMinutes, DOUYIN_ACQUISITION_LIMITS.minIntervalMinutes);
  const minScore = COMMENT_ACQUISITION_DEFAULTS.minScore;
  const audienceGoal = advanced.audienceGoal || DOUYIN_ACQUISITION_DISCOVERY_GOAL;
  const requirements = advanced.requirements;
  const touchStrategy = advanced.firstTouch || COMMENT_ACQUISITION_DEFAULTS.touchStrategy;
  const replyStyle = advanced.replyStyle || COMMENT_ACQUISITION_DEFAULTS.replyStyle;
  const touchObjective = advanced.touchObjective || DOUYIN_ACQUISITION_OBJECTIVE;
  const dialogueObjective = advanced.dialogueObjective || DOUYIN_ACQUISITION_OBJECTIVE;
  const handoffBoundary = douyinAcquisitionHandoffBoundary(advanced.handoffBoundary);
  const systemPrompt = buildDouyinAcquisitionSystemPrompt(advanced);
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
    autonomousLeadAcquisition: true,
    managerAdvancedSettingsEnabled: advanced.enabled,
    managerAdvancedSettings: advanced,
    approvalMode: COMMENT_ACQUISITION_DEFAULTS.approvalMode,
    // The comprehensive acquisition Agent only performs first outreach by
    // private message. Public replies are not part of this product surface.
    touchChannel: COMMENT_ACQUISITION_DEFAULTS.touchChannel,
    objective: DOUYIN_ACQUISITION_OBJECTIVE,
    systemPrompt,
    audienceGoal,
    requirements,
    touchContent: touchStrategy,
    audienceRules: {
      goal: audienceGoal,
      requirements,
      minScore
    },
    contentPolicy: {
      quoteComment: false,
      maxLength: 120,
      template: touchStrategy,
      strategy: touchStrategy,
      conversionGoal: touchObjective,
      dialogueObjective,
      replyStyle,
      handoffBoundary,
      systemPrompt
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
      stopOnReply: false
    }
  };
}

export function validateCommentAcquisitionSetup(flow = {}) {
  if (!text(flow.accountId) && !(Array.isArray(flow.authorizedAccounts) && flow.authorizedAccounts.length)) return "请先完成当前抖音账号授权";
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
