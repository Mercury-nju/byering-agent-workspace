import test from "node:test";
import assert from "node:assert/strict";
import { classifyIntent, createReplyStrategy, planReply, validateReply } from "../backend/douyin-reply-strategy.js";

test("classifies commercial intent before reply generation", () => {
  assert.equal(classifyIntent("多少钱？"), "price_question");
  assert.equal(classifyIntent("我想下单"), "purchase_intent");
  assert.equal(classifyIntent("不要再联系我"), "opt_out");
});

test("routes high-risk inbox messages to human handoff", () => {
  const decision = planReply({ content: "你们怎么收费？" }, { strategy: createReplyStrategy() });
  assert.deepEqual(decision, {
    reply: true,
    intent: "price_question",
    stage: "new",
    action: "answer",
    requiresHandoff: true,
    reason: "price_requires_approved_info"
  });
});

test("rejects unsupported promises and honors opt-out boundary", () => {
  assert.equal(validateReply("保证百分之百有效", { strategy: createReplyStrategy() }).ok, false);
  assert.equal(validateReply("好的", { strategy: createReplyStrategy(), decision: { intent: "opt_out" } }).ok, false);
});

test("continuous acquisition qualifies purchase interest without a blanket handoff", () => {
  const strategy = createReplyStrategy({ continuousConversion: true });
  const decision = planReply({ content: "我想购买，接下来怎么做" }, { strategy });
  assert.equal(decision.requiresHandoff, false);
  assert.equal(decision.action, "qualify");
  assert.equal(planReply({ content: "退款" }, { strategy }).requiresHandoff, true);
});

test("an opted-out conversation stays closed on later incoming messages", () => {
  assert.equal(planReply({ content: "你好" }, { conversation: { stage: "closed" } }).reply, false);
});
