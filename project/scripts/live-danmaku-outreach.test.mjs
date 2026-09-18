import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLiveDanmakuOutreachTaskPayload,
  normalizeLiveDanmakuOutreachSettings,
  validateLiveDanmakuOutreachSetup,
  LIVE_DANMAKU_OUTREACH_DEFAULT_GOAL,
  LIVE_DANMAKU_OUTREACH_DEFAULT_MESSAGE
} from "../src/salebuddy/ui/live-danmaku-outreach-config.js";
import {
  DOUYIN_ACQUISITION_ACTIVE_AGENT_IDS,
  MARKETPLACE_AGENTS,
  isMarketplaceAgentAvailable
} from "../src/salebuddy/agents/marketplace.js";

test("直播间未成交客户触达是独立的触达类可用 Agent", () => {
  const agent = MARKETPLACE_AGENTS.find((item) => item.id === "mkt-live-danmaku-outreach");

  assert.ok(agent);
  assert.equal(agent.name, "直播追单助理");
  assert.equal(agent.category, "触达");
  assert.equal(agent.capabilities.liveDanmakuOutreach, true);
  assert.equal(agent.capabilities.analysisOnly, false);
  assert.equal(agent.capabilities.discoveryOnly, false);
  assert.equal(isMarketplaceAgentAvailable(agent), true);
  assert.ok(DOUYIN_ACQUISITION_ACTIVE_AGENT_IDS.includes(agent.id));
});

test("直播弹幕触达只按每位发弹幕用户触达，不配置成交或意向分析", () => {
  const flow = {
    taskId: "task-live-outreach",
    taskRunId: "run-live-outreach",
    accountId: "account-1",
    account: "品牌直播间",
    accountRef: "brand-live",
    accountIdentity: { uniqueId: "brand-live", nickname: "品牌直播间" },
    liveDanmakuOutreachGoal: "承接用户咨询并引导用户继续了解商品"
  };

  assert.equal(validateLiveDanmakuOutreachSetup(flow), null);
  const payload = buildLiveDanmakuOutreachTaskPayload(flow);
  assert.equal(payload.agentId, "mkt-live-danmaku-outreach");
  assert.equal(payload.executionAgentId, "mkt-comment-acquisition");
  assert.equal(payload.config.sourceScope.kind, "authorized_account_live");
  assert.equal(payload.config.liveDanmakuOutreach, true);
  assert.equal(payload.config.touchEveryLiveDanmaku, true);
  assert.equal(payload.config.analysisOnly, false);
  assert.equal(payload.config.discoveryOnly, false);
  assert.equal(payload.config.analysisKind, "live_danmaku_outreach");
  assert.deepEqual(payload.config.liveSignals, ["danmaku"]);
  assert.equal(payload.config.touchChannel, "private_message");
  assert.equal(payload.config.approvalMode, "auto");
  assert.equal(payload.config.audienceRules.goal, "承接用户咨询并引导用户继续了解商品");
  assert.equal(payload.config.contentPolicy.conversionGoal, "承接用户咨询并引导用户继续了解商品");
  assert.match(payload.config.contentPolicy.strategy, /直播间留言/);
});

test("直播弹幕触达要求用户先说明目的，并保留可选话术与频控配置", () => {
  const base = {
    accountId: "account-1",
    account: "品牌直播间",
    accountIdentity: { uniqueId: "brand-live", nickname: "品牌直播间" }
  };

  assert.match(validateLiveDanmakuOutreachSetup(base), /触达目的/);
  assert.equal(validateLiveDanmakuOutreachSetup({
    ...base,
    liveDanmakuOutreachGoal: "引导用户留下联系方式"
  }), null);

  const payload = buildLiveDanmakuOutreachTaskPayload({
    ...base,
    liveDanmakuOutreachGoal: "引导用户留下联系方式",
    liveDanmakuOutreachMessage: "看到你刚才在直播间提到这个问题，我可以把详细资料发给你。",
    maxTouchesPerDay: 18,
    minIntervalMinutes: 3
  });

  assert.equal(payload.config.audienceRules.goal, "引导用户留下联系方式");
  assert.equal(payload.config.contentPolicy.strategy, "看到你刚才在直播间提到这个问题，我可以把详细资料发给你。");
  assert.equal(payload.config.contentPolicy.conversionGoal, "引导用户留下联系方式");
  assert.equal(payload.config.caps.dailyMax, null);
  assert.equal(payload.config.caps.sendIntervalMs, 180000);
  assert.equal(LIVE_DANMAKU_OUTREACH_DEFAULT_GOAL.length > 0, true);
});

test("直播弹幕触达不接受产品侧固定的每日数量上限", () => {
  const settings = normalizeLiveDanmakuOutreachSettings({
    accountId: "account-1",
    liveDanmakuOutreachGoal: "引导用户留下联系方式",
    maxTouchesPerDay: 18,
    configuration: { caps: { dailyMax: 60 } }
  });

  assert.equal(settings.dailyMax, null);
});

test("直播弹幕触达恢复配置时保留零间隔，并把空开场消息交给系统默认策略", () => {
  const payload = buildLiveDanmakuOutreachTaskPayload({
    accountId: "account-1",
    liveDanmakuOutreachGoal: "承接用户咨询",
    liveDanmakuOutreachMessage: "",
    configuration: {
      contentPolicy: { strategy: "" },
      caps: { dailyMax: 60, sendIntervalMs: 0 }
    }
  });

  assert.equal(payload.config.caps.dailyMax, null);
  assert.equal(payload.config.caps.sendIntervalMs, 0);
  assert.equal(payload.config.contentPolicy.strategy, LIVE_DANMAKU_OUTREACH_DEFAULT_MESSAGE);
});
