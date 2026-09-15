import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLiveDanmakuOutreachTaskPayload,
  validateLiveDanmakuOutreachSetup
} from "../src/salebuddy/ui/live-danmaku-outreach-config.js";
import {
  DOUYIN_ACQUISITION_ACTIVE_AGENT_IDS,
  MARKETPLACE_AGENTS,
  isMarketplaceAgentAvailable
} from "../src/salebuddy/agents/marketplace.js";

test("直播间未成交客户触达是独立的触达类可用 Agent", () => {
  const agent = MARKETPLACE_AGENTS.find((item) => item.id === "mkt-live-danmaku-outreach");

  assert.ok(agent);
  assert.equal(agent.name, "电商直播间未成交客户触达");
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
    accountIdentity: { uniqueId: "brand-live", nickname: "品牌直播间" }
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
  assert.match(payload.config.contentPolicy.strategy, /直播间留言/);
});
