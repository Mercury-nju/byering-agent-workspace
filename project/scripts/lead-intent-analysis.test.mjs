import assert from "node:assert/strict";
import test from "node:test";

import {
  LeadIntentAnalysisError,
  createLeadIntentAnalysisService
} from "../backend/lead-intent-analysis.js";

test("lead intent analysis validates structured model classifications", async () => {
  const service = createLeadIntentAnalysisService({
    endpoint: "https://llm.test/chat/completions",
    apiKey: "test-key",
    model: "test-model",
    fetchImpl: async (url, request) => {
      assert.equal(url, "https://llm.test/chat/completions");
      assert.equal(request.headers.Authorization, "Bearer test-key");
      const body = JSON.parse(request.body);
      assert.equal(body.model, "test-model");
      assert.equal(body.response_format.type, "json_object");
      assert.match(body.messages.at(-1).content, /预算/);
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          items: [
            {
              index: 0,
              tier: "high",
              score: 91,
              confidence: 0.96,
              reason: "明确询价并说明购买时间",
              signals: ["明确价格", "近期购买"],
              traits: [{ label: "预算", value: "两万元左右", evidence: "评论中明确提到预算两万" }]
            },
            { index: 1, tier: "low", score: 8, confidence: 0.84, reason: "仅表达泛兴趣", signals: ["泛兴趣"] }
          ]
        }) } }]
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
  });

  const result = await service.analyze({
    goal: "找近期有预算并准备下单的人",
    comments: [{ text: "预算两万，什么时候能买？" }, { text: "看起来不错" }]
  });
  assert.equal(result.source, "model");
  assert.equal(result.items[0].tier, "high");
  assert.equal(result.items[0].confidence, 0.96);
  assert.deepEqual(result.items[0].traits, [{ label: "预算", value: "两万元左右", evidence: "评论中明确提到预算两万" }]);
  assert.deepEqual(result.items[1].signals, ["泛兴趣"]);
});

test("lead intent analysis passes profile and recent works to dynamic trait analysis", async () => {
  let requestComments;
  const service = createLeadIntentAnalysisService({
    endpoint: "https://llm.test/chat/completions",
    apiKey: "test-key",
    fetchImpl: async (_, request) => {
      const body = JSON.parse(request.body);
      requestComments = JSON.parse(body.messages.at(-1).content).comments;
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          items: [{
            index: 0,
            tier: "medium",
            score: 64,
            confidence: 0.8,
            reason: "用户围绕课程阶段提问",
            signals: ["课程阶段"],
            traits: [{ label: "课程阶段", value: "准备升入高中", evidence: "主页简介写明即将升入高中，评论询问课程安排" }]
          }]
        }) } }]
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
  });

  const result = await service.analyze({
    goal: "找对高中课程感兴趣的人",
    comments: [{
      text: "高中课程怎么安排？",
      profile: { nickname: "学生甲", signature: "即将升入高中" },
      recentWorks: [{ title: "高中学习规划", observedAt: "2026-09-10" }]
    }]
  });

  assert.deepEqual(requestComments[0].profile, { nickname: "学生甲", signature: "即将升入高中" });
  assert.deepEqual(requestComments[0].recentWorks, [{ title: "高中学习规划", observedAt: "2026-09-10" }]);
  assert.equal(result.items[0].traits[0].label, "课程阶段");
});

test("lead intent analysis sends authorized account positioning and recent works as context", async () => {
  let requestAccount;
  const service = createLeadIntentAnalysisService({
    endpoint: "https://llm.test/chat/completions",
    apiKey: "test-key",
    fetchImpl: async (_, request) => {
      requestAccount = JSON.parse(JSON.parse(request.body).messages.at(-1).content).account;
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          items: [{ index: 0, tier: "high", score: 88, confidence: 0.9, reason: "用户明确询问服务", signals: ["询问服务"] }]
        }) } }]
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
  });

  await service.analyze({
    goal: "识别对账号服务有明确需求的人",
    account: {
      nickname: "门店账号",
      profile: { signature: "专注上海家居改造" },
      recentWorks: { data: { items: [{ desc: "小户型餐桌搭配", publish_time: "2026-09-12" }] } }
    },
    comments: [{ text: "想了解你们的到店服务" }]
  });

  assert.deepEqual(requestAccount, {
    profile: { nickname: "门店账号", signature: "专注上海家居改造" },
    recentWorks: [{ title: "小户型餐桌搭配", observedAt: "2026-09-12" }]
  });
});

test("lead intent analysis fails closed when the model is not configured", async () => {
  const service = createLeadIntentAnalysisService({ endpoint: "", apiKey: "" });
  await assert.rejects(
    () => service.analyze({ goal: "找潜客", comments: [{ text: "想买" }] }),
    (error) => error instanceof LeadIntentAnalysisError && error.code === "LEAD_INTENT_MODEL_NOT_CONFIGURED"
  );
});

test("lead intent analysis rejects incomplete or hidden model output", async () => {
  const service = createLeadIntentAnalysisService({
    endpoint: "https://llm.test/chat/completions",
    apiKey: "test-key",
    maxAttempts: 1,
    fetchImpl: async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        items: [{ index: 0, tier: "high", score: 90, confidence: 0.9, reason: "ok", analysis_trace: "secret" }]
      }) } }]
    }), { status: 200 })
  });
  await assert.rejects(
    () => service.analyze({ goal: "找潜客", comments: [{ text: "想买" }, { text: "价格" }] }),
    (error) => error instanceof LeadIntentAnalysisError && error.code === "INVALID_LEAD_INTENT_RESULT"
  );
});

test("comment filter analysis returns match decisions without intent tiers", async () => {
  const service = createLeadIntentAnalysisService({
    endpoint: "https://llm.test/chat/completions",
    apiKey: "test-key",
    fetchImpl: async (_, request) => {
      const body = JSON.parse(request.body);
      assert.match(body.messages[0].content, /是否匹配/);
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          items: [
            { index: 0, matched: true, confidence: 0.95, reason: "明确表达不满", signals: ["太差"] },
            { index: 1, matched: false, confidence: 0.9, reason: "中性讨论", signals: [] }
          ]
        }) } }]
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
  });
  const result = await service.analyze({
    mode: "filter",
    goal: "负面评价",
    comments: [{ text: "这个太差了" }, { text: "颜色很好看" }]
  });
  assert.equal(result.items[0].matched, true);
  assert.equal(result.items[0].tier, undefined);
  assert.equal(result.items[1].matched, false);
});
