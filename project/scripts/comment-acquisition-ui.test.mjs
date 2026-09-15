import assert from "node:assert/strict";
import test from "node:test";

import {
  COMMENT_ACQUISITION_DEFAULTS,
  DOUYIN_AUTO_AUDIENCE_GOAL,
  buildCommentAcquisitionTaskPayload,
  buildFinderListenerTaskPayload,
  normalizeCommentAcquisitionConfig,
  validateCommentAcquisitionSetup,
  validateFinderListenerSetup
} from "../src/salebuddy/ui/comment-acquisition-config.js";

test("comment acquisition lets the backend derive audience and first outreach from account context", () => {
  const config = normalizeCommentAcquisitionConfig({
    accountId: "douyin-agent:mkt-comment-acquisition",
    account: "一以万真",
    replyObjective: "回答客户问题，并在客户有明确需求时获取联系方式"
  });

  assert.equal(config.sourceScope.kind, "authorized_account_all_signals");
  assert.equal(config.stopConditions.stopOnReply, false);
  assert.equal(config.sourceScope.accountId, "douyin-agent:mkt-comment-acquisition");
  assert.equal(config.longRunning, true);
  assert.equal(config.touchChannel, "private_message");
  assert.equal(config.approvalMode, "auto");
  assert.equal(config.audienceRules.minScore, 80);
  assert.equal(config.audienceRules.mode, "account_context");
  assert.equal(config.audienceRules.goal, DOUYIN_AUTO_AUDIENCE_GOAL);
  assert.equal(config.audienceRules.requirements, "");
  assert.equal(config.audienceRules.autoIdentifyAccountPositioning, true);
  assert.equal(config.audienceRules.autoIdentifyServiceUsers, true);
  assert.equal(config.contentPolicy.conversionGoal, "回答客户问题，并在客户有明确需求时获取联系方式");
  assert.equal("touchContent" in config, false);
  assert.equal(config.contentPolicy.mode, "evidence_first");
  assert.equal(config.contentPolicy.template, "");
  assert.equal(config.contentPolicy.strategy, "");
  assert.equal(config.frequency.maxTouchesPerDay, COMMENT_ACQUISITION_DEFAULTS.frequency.maxTouchesPerDay);
});

test("comment acquisition keeps backend-owned outreach and safety defaults", () => {
  const config = normalizeCommentAcquisitionConfig({
    accountId: "douyin-agent:mkt-comment-acquisition",
    product: "近期询问上海新能源车价格的人",
    requirements: "优先持续追问提车时间的人",
    timeWindow: "最近30天",
    replyStyle: "专业、简短、自然",
    handoffBoundary: "涉及具体报价、退款、投诉或无法确认的库存时交给人工。",
    contactTiming: "发现高意向用户后立即触达",
    workSchedule: "09:00-21:00",
    maxTouchesPerDay: 18,
    minIntervalMinutes: 12
  });

  assert.equal("workWindow" in config, false);
  assert.equal(config.frequency.mode, "识别到高意向潜客后自动触达");
  assert.equal(config.frequency.maxTouchesPerDay, COMMENT_ACQUISITION_DEFAULTS.frequency.maxTouchesPerDay);
  assert.equal(config.frequency.minIntervalMinutes, COMMENT_ACQUISITION_DEFAULTS.frequency.minIntervalMinutes);
  assert.equal(config.contentPolicy.strategy, "");
  assert.equal(config.contentPolicy.template, "");
  assert.equal(config.contentPolicy.replyStyle, "专业、简短、自然");
  assert.equal(config.contentPolicy.handoffBoundary, "涉及具体报价、退款、投诉或无法确认的库存时交给人工。");
});

test("comment acquisition always uses private first outreach and never serializes the retired public-reply fields", () => {
  const config = normalizeCommentAcquisitionConfig({
    touchChannel: "public_reply",
    publicReplyAvailable: true
  });
  assert.equal(config.touchChannel, "private_message");
  assert.equal("publicReplyRequested" in config, false);
  assert.equal("publicReplyAvailable" in config, false);
});

test("full acquisition setup requires an authorized account and one conversation objective", () => {
  assert.equal(validateCommentAcquisitionSetup({}), "请先完成当前抖音账号授权");
  assert.equal(validateCommentAcquisitionSetup({ accountId: "account-1" }), "请说明希望通过私信达成什么目标");
  assert.equal(validateCommentAcquisitionSetup({ accountId: "account-1", reception: null }), "请说明希望通过私信达成什么目标");
  assert.equal(validateCommentAcquisitionSetup({ accountId: "account-1", replyObjective: "回答问题" }), null);
});

test("finder listener stays discovery-only and never carries historical or outreach settings", () => {
  const flow = {
    taskId: "finder-listener-task-1",
    taskRunId: "finder-listener-run-1",
    accountId: "douyin-agent:mkt-find-people",
    account: "一以万真",
    product: "近期主动询价家居用品的人",
    requirements: "排除同行和抽奖互动",
    compositeFinderSource: "own",
    taskChoices: { finderOwnData: { selected: ["comments"] } },
    timeWindow: "最近30天",
    lookbackDays: 30,
    touchStrategy: "这段内容不能进入找客专员",
    frequency: { maxTouchesPerDay: 50, minIntervalMinutes: 1 }
  };

  assert.equal(validateFinderListenerSetup(flow), null);
  const payload = buildFinderListenerTaskPayload(flow);
  assert.equal(payload.agentId, "mkt-find-people");
  assert.equal(payload.executionAgentId, "mkt-comment-acquisition");
  assert.equal(payload.config.sourceScope.kind, "authorized_account_comments");
  assert.equal(payload.config.discoveryOnly, true);
  assert.equal(payload.config.approvalMode, "manual");
  assert.equal(payload.config.audienceRules.goal, "近期主动询价家居用品的人");
  assert.equal(payload.config.audienceRules.requirements, "排除同行和抽奖互动");
  assert.equal("touchChannel" in payload.config, false);
  assert.equal("touchContent" in payload.config, false);
  assert.equal("contentPolicy" in payload.config, false);
  assert.equal("frequency" in payload.config, false);
  assert.equal("caps" in payload.config, false);
  assert.equal("stopConditions" in payload.config, false);
  assert.equal("workWindow" in payload.config, false);
  assert.equal("lookbackDays" in payload.config.sourceScope, false);
});

test("finder listener combines selected authorized-account sources into one durable listener", () => {
  const payload = buildFinderListenerTaskPayload({
    taskId: "finder-combined-task-1",
    taskRunId: "finder-combined-run-1",
    accountId: "douyin-agent:mkt-find-people",
    account: "一以万真",
    product: "近期主动询价家居用品的人",
    compositeFinderSource: "own",
    sourceScope: "authorized_account_comments",
    taskChoices: { finderOwnData: { selected: ["comments", "live", "interactions"] } }
  });

  assert.equal(payload.config.sourceScope.kind, "authorized_account_all_signals");
  assert.equal(payload.config.discoveryOnly, true);
  assert.equal(payload.config.approvalMode, "manual");
  assert.equal("touchChannel" in payload.config, false);
});

test("finder listener needs an account and a target, but not a reception strategy", () => {
  assert.equal(validateFinderListenerSetup({}), "请先完成找客专员的抖音账号授权");
  assert.equal(validateFinderListenerSetup({ accountId: "account-1" }), "请告诉我你想找什么样的人");
  assert.equal(validateFinderListenerSetup({ accountId: "account-1", product: "主动询价的人" }), null);
});

test("task payload starts a long-running auto-send task with one agent-scoped account", () => {
  const payload = buildCommentAcquisitionTaskPayload({
    taskId: "comment-acquisition-task-1",
    taskRunId: "run-1",
    accountId: "douyin-agent:mkt-comment-acquisition",
    account: "一以万真",
    product: "近期准备购买的人",
    requirements: "排除同行",
    message: "你好",
    approvalMode: "batch",
    touchChannel: "private_message",
    frequency: { maxTouchesPerDay: 20 }
  });

  assert.equal(payload.agentId, "mkt-comment-acquisition");
  assert.equal(payload.config.sourceScope.kind, "authorized_account_all_signals");
  assert.equal(payload.config.longRunning, true);
  assert.equal(payload.config.approvalMode, "auto");
  assert.equal(payload.config.frequency.maxTouchesPerDay, COMMENT_ACQUISITION_DEFAULTS.frequency.maxTouchesPerDay);
  assert.equal(payload.config.touchChannel, "private_message");
  assert.equal(payload.config.audienceRules.goal, DOUYIN_AUTO_AUDIENCE_GOAL);
  assert.equal(payload.config.contentPolicy.strategy, "");
});

test("comment acquisition cannot be downgraded to a manual approval mode", () => {
  for (const approvalMode of ["manual", "batch", "unexpected"]) {
    const config = normalizeCommentAcquisitionConfig({ approvalMode });
    assert.equal(config.approvalMode, "auto");
  }
});

test("task payload forwards the authorized account reference and identity to the resolver", () => {
  const identity = {
    secId: "MS4wLjABAAAA-sec-id",
    uid: "uid-123",
    nickname: "一以万真",
    profileUrl: "https://www.douyin.com/user/MS4wLjABAAAA-sec-id"
  };
  const payload = buildCommentAcquisitionTaskPayload({
    taskId: "comment-acquisition-task-2",
    taskRunId: "run-2",
    accountId: "douyin-agent:mkt-comment-acquisition",
    account: "一以万真",
    accountRef: identity.profileUrl,
    accountIdentity: identity,
    product: "主动询价的人",
    message: "你好"
  });

  assert.equal(payload.config.accountRef, identity.profileUrl);
  assert.deepEqual(payload.config.accountIdentity, identity);
  assert.equal(payload.accountRef, identity.profileUrl);
  assert.deepEqual(payload.accountIdentity, identity);
});

test("task payload ignores legacy targeting and first-message fields", () => {
  const payload = buildCommentAcquisitionTaskPayload({
    taskId: "comment-acquisition-task-3",
    taskRunId: "run-3",
    accountId: "douyin-agent:mkt-comment-acquisition",
    accountRef: "https://www.douyin.com/user/MS4wLjABAAAA-sec-id",
    accountIdentity: { secId: "MS4wLjABAAAA-sec-id", uid: "uid-123", nickname: "一以万真" },
    product: "近期准备购买家居用品并主动询价的人",
    requirements: "排除同行、抽奖和无关互动",
    message: "你好，看到你提到这个问题，方便了解一下你的具体需求吗？",
    maxTouchesPerDay: 12,
    minIntervalMinutes: 20
  });

  assert.equal(payload.config.audienceRules.goal, DOUYIN_AUTO_AUDIENCE_GOAL);
  assert.equal(payload.config.audienceRules.requirements, "");
  assert.equal(payload.config.audienceRules.minScore, 80);
  assert.equal(payload.config.contentPolicy.template, "");
  assert.equal(payload.config.contentPolicy.strategy, "");
  assert.equal(payload.config.caps.dailyMax, COMMENT_ACQUISITION_DEFAULTS.frequency.maxTouchesPerDay);
  assert.equal(payload.config.caps.sendIntervalMs, COMMENT_ACQUISITION_DEFAULTS.frequency.minIntervalMinutes * 60 * 1000);
});
