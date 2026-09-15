import assert from "node:assert/strict";
import test from "node:test";

import { analyzeLiveDanmakuSignals } from "../src/salebuddy/agents/live-danmaku-analysis.js";
import {
  buildLiveDanmakuAnalysisTaskPayload,
  validateLiveDanmakuAnalysisSetup
} from "../src/salebuddy/ui/live-danmaku-analysis-config.js";
import {
  DOUYIN_ACQUISITION_ACTIVE_AGENT_IDS,
  MARKETPLACE_AGENTS,
  isMarketplaceAgentAvailable
} from "../src/salebuddy/agents/marketplace.js";
import { grokAvatarSpecFor } from "../src/salebuddy/ui/grok-bot-avatar.js";

test("直播间弹幕分析是独立的分析类可用 Agent", () => {
  const agent = MARKETPLACE_AGENTS.find((item) => item.id === "mkt-live-danmaku-analysis");

  assert.ok(agent);
  assert.equal(agent.name, "直播间弹幕分析");
  assert.equal(agent.category, "分析");
  assert.equal(agent.capabilities.liveDanmakuAnalysis, true);
  assert.equal(isMarketplaceAgentAvailable(agent), true);
  assert.ok(DOUYIN_ACQUISITION_ACTIVE_AGENT_IDS.includes(agent.id));
});

test("直播间弹幕分析使用紫色 Agent 视觉主题", () => {
  assert.equal(grokAvatarSpecFor("mkt-live-danmaku-analysis").color, "violet");
});

test("弹幕分析只处理新弹幕并忽略点赞和送礼事件", () => {
  const result = analyzeLiveDanmakuSignals({
    signals: [
      {
        userId: "user-question",
        nickname: "问价用户",
        evidence: [{ type: "live_chat", action: "live_chat", quote: "多少钱？有现货吗", roomId: "room-1" }]
      },
      {
        userId: "user-like",
        nickname: "点赞用户",
        evidence: [{ type: "like", action: "like", quote: "", roomId: "room-1" }]
      },
      {
        userId: "user-gift",
        nickname: "送礼用户",
        evidence: [{ type: "gift", action: "gift", quote: "", roomId: "room-1" }]
      }
    ],
    goal: "识别直播间的真实需求和购买意向"
  });

  assert.deepEqual(result.counts, {
    total: 1,
    danmaku: 1,
    uniqueUsers: 1,
    questions: 1,
    highIntent: 1,
    mediumIntent: 0,
    behaviorOnly: 0
  });
  assert.ok(result.topics.some((topic) => topic.key === "price"));
  assert.equal(result.users.some((user) => user.userId === "user-like"), false);
  assert.equal(result.users.some((user) => user.userId === "user-gift"), false);
  assert.equal(result.users.find((user) => user.userId === "user-question")?.intentTier, "重点");
  assert.match(result.summary, /新弹幕/);
  assert.doesNotMatch(result.summary, /点赞|送礼/);
});

test("直播间弹幕分析任务只读取授权直播间并保留手动分析边界", () => {
  const flow = {
    taskId: "task-live-analysis",
    taskRunId: "run-live-analysis",
    accountId: "account-1",
    account: "品牌直播间",
    accountRef: "brand-live",
    accountIdentity: { uniqueId: "brand-live", nickname: "品牌直播间" },
    liveDanmakuGoal: "重点找出价格异议和高频问题",
    liveDanmakuSignals: ["follows"]
  };

  assert.equal(validateLiveDanmakuAnalysisSetup(flow), null);
  const payload = buildLiveDanmakuAnalysisTaskPayload(flow);
  assert.equal(payload.agentId, "mkt-live-danmaku-analysis");
  assert.equal(payload.executionAgentId, "mkt-comment-acquisition");
  assert.equal(payload.config.sourceScope.kind, "authorized_account_live");
  assert.equal(payload.config.analysisOnly, true);
  assert.equal(payload.config.discoveryOnly, true);
  assert.equal(payload.config.analysisKind, "live_danmaku");
  assert.deepEqual(payload.config.liveSignals, ["danmaku"]);
  assert.equal(payload.config.approvalMode, "manual");
  assert.equal(payload.config.autoStartCloud, false);
});
