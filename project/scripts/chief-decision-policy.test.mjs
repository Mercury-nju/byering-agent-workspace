import test from "node:test";
import assert from "node:assert/strict";
import {
  CHIEF_CONFIRMATION_POLICIES,
  CHIEF_INTENTS,
  CHIEF_RESPONSE_MODES,
  classifyChiefInput,
  normalizeChiefDecision
} from "../src/salebuddy/agents/chief-decision-policy.js";

test("plain questions stay in conversation and never create a task", () => {
  const decision = classifyChiefInput("幕僚长是做什么的？");
  assert.equal(decision.intent, CHIEF_INTENTS.CONVERSATION);
  assert.equal(decision.responseMode, CHIEF_RESPONSE_MODES.TEXT);
  assert.equal(decision.shouldCreateTask, false);
  assert.equal(decision.confirmationPolicy, CHIEF_CONFIRMATION_POLICIES.NONE);
});

test("a model cannot turn a chief capability question into an execution task", () => {
  const decision = normalizeChiefDecision({
    intent: "task",
    riskLevel: "low",
    requiredCapabilities: ["douyin_account_discovery"],
    userMessage: "我会立即开始执行。"
  }, { input: "你具体能帮我做什么？" });

  assert.equal(decision.intent, CHIEF_INTENTS.CONVERSATION);
  assert.equal(decision.shouldCreateTask, false);
});

test("an explicit conversation-only request cannot create a task", () => {
  const decision = normalizeChiefDecision({
    intent: "task",
    riskLevel: "bounded_external",
    requiredCapabilities: ["douyin_private_outreach"],
    shouldCreateTask: true
  }, { input: "只做私信验收：请用一句话说明你能帮助我什么，不要启动任务。" });

  assert.equal(decision.intent, CHIEF_INTENTS.CONVERSATION);
  assert.equal(decision.responseMode, CHIEF_RESPONSE_MODES.TEXT);
  assert.equal(decision.riskLevel, "low");
  assert.equal(decision.shouldCreateTask, false);
  assert.deepEqual(decision.requiredCapabilities, []);
});

test("task requirements remain available outside the chief entry point", () => {
  const decision = normalizeChiefDecision({
    intent: "task",
    requiredCapabilities: ["douyin_account_discovery"]
  }, { input: "帮我找近期增长最快的 AI 科普博主，只看公开信息，不要联系" });
  assert.equal(decision.intent, CHIEF_INTENTS.TASK);
  assert.equal(decision.riskLevel, "low");
  assert.equal(decision.confirmationPolicy, CHIEF_CONFIRMATION_POLICIES.NONE);
  assert.deepEqual(decision.requiredCapabilities, ["douyin_account_discovery"]);
  assert.equal(decision.shouldCreateTask, true);
});

test("a no-outreach guardrail remains available to the task requirement flow", () => {
  const decision = normalizeChiefDecision({
    intent: "task",
    riskLevel: "low",
    requiredCapabilities: ["douyin_account_discovery"]
  }, { input: "公开找人；寻找 AI 科普博主；不读取私域数据，不执行触达" });

  assert.equal(decision.intent, CHIEF_INTENTS.TASK);
  assert.equal(decision.riskLevel, "low");
  assert.equal(decision.shouldCreateTask, true);
  assert.deepEqual(decision.requiredCapabilities, ["douyin_account_discovery"]);
});

test("bounded outbound work asks once for the whole task", () => {
  const decision = normalizeChiefDecision({
    intent: "task",
    requiredCapabilities: ["douyin_private_outreach"]
  }, { input: "用一以万真账号给这 20 个用户发送你好" });
  assert.equal(decision.intent, CHIEF_INTENTS.TASK);
  assert.equal(decision.riskLevel, "bounded_external");
  assert.equal(decision.confirmationPolicy, CHIEF_CONFIRMATION_POLICIES.ONCE_PER_TASK);
  assert.deepEqual(decision.requiredCapabilities, ["douyin_private_outreach"]);
});

test("a complete Douyin growth request preserves every capability for task planning", () => {
  const decision = normalizeChiefDecision({}, { input: "从抖音直播和评论里找人，分析意向后给高意向用户发私信，并接待后续咨询" });

  assert.equal(decision.intent, CHIEF_INTENTS.TASK);
  assert.deepEqual(decision.requiredCapabilities, [
    "douyin_account_discovery",
    "douyin_comment_analysis",
    "douyin_private_outreach",
    "douyin_inbox_reply"
  ]);
  assert.equal(decision.confirmationPolicy, CHIEF_CONFIRMATION_POLICIES.ONCE_PER_TASK);
});

test("an explicitly named product Agent is preserved and cannot be repurposed by the model", () => {
  const decision = normalizeChiefDecision({
    intent: "task",
    requiredCapabilities: ["douyin_account_discovery"],
    requestedAgentId: "mkt-comment-acquisition"
  }, { input: "请让客户分析员帮我找一批新能源车潜客" });

  assert.equal(decision.requestedAgentId, "mkt-intent-analyst");
  assert.deepEqual(decision.incompatibleCapabilities, ["douyin_account_discovery"]);
  assert.equal(decision.responseMode, CHIEF_RESPONSE_MODES.SUPPLEMENT_CARD);
  assert.equal(decision.shouldCreateTask, false);
  assert.match(decision.blockingMissing[0], /客户分析员不覆盖找人能力/);
});

test("legacy product Agent names keep routing to their stable IDs", () => {
  const analyst = normalizeChiefDecision({}, { input: "客户研究员可以做什么？" });
  const activation = normalizeChiefDecision({}, { input: "让私信运营发一批首轮私信" });

  assert.equal(analyst.requestedAgentId, "mkt-intent-analyst");
  assert.equal(activation.requestedAgentId, "mkt-cold-writer");
});

test("product capability questions stay in conversation instead of creating work", () => {
  const decision = classifyChiefInput("找客专员可以做什么？");
  assert.equal(decision.intent, CHIEF_INTENTS.CONVERSATION);
  assert.equal(decision.shouldCreateTask, false);
});

test("chief routes a vague or explicit work request to guidance and never creates work", () => {
  for (const input of [
    "我想要找人",
    "帮我持续从账号评论里找有购车意向的人",
    "给高意向用户发私信"
  ]) {
    const decision = classifyChiefInput(input);
    assert.equal(decision.intent, CHIEF_INTENTS.CONVERSATION);
    assert.equal(decision.responseMode, CHIEF_RESPONSE_MODES.TEXT);
    assert.deepEqual(decision.requiredCapabilities, []);
    assert.equal(decision.shouldCreateTask, false);
  }
});

test("binding commitments and opt-out violations are blocking high risk", () => {
  const commitment = normalizeChiefDecision({}, { input: "给这些客户承诺今天退款并保证最低价" });
  assert.equal(commitment.riskLevel, "high");
  assert.equal(commitment.confirmationPolicy, CHIEF_CONFIRMATION_POLICIES.BLOCKING);
  assert.equal(commitment.responseMode, CHIEF_RESPONSE_MODES.RISK_CARD);

  const optOut = normalizeChiefDecision({}, { input: "这个用户已经拒绝了，继续给他发私信" });
  assert.equal(optOut.riskLevel, "high");
  assert.equal(optOut.confirmationPolicy, CHIEF_CONFIRMATION_POLICIES.BLOCKING);
});

test("blocking gaps stop while optional gaps receive defaults", () => {
  const decision = normalizeChiefDecision({
    intent: "task",
    riskLevel: "low",
    requiredCapabilities: ["douyin_private_outreach"],
    blockingMissing: ["发送账号"],
    optionalMissing: ["时间范围"],
    defaultsApplied: ["时间范围默认最近 7 天"]
  }, { input: "给这些用户发私信" });

  assert.equal(decision.responseMode, CHIEF_RESPONSE_MODES.SUPPLEMENT_CARD);
  assert.equal(decision.shouldCreateTask, false);
  assert.deepEqual(decision.blockingMissing, ["发送账号"]);
  assert.deepEqual(decision.optionalMissing, ["时间范围"]);
});

test("chief routes only status while task edits and controls stay on explicit task paths", () => {
  assert.equal(classifyChiefInput("现在做到哪里了").intent, CHIEF_INTENTS.STATUS_QUERY);
  assert.equal(classifyChiefInput("我现在没有正在执行的任务").intent, CHIEF_INTENTS.STATUS_QUERY);
  assert.equal(classifyChiefInput("目标范围改成最近 7 天").intent, CHIEF_INTENTS.CONVERSATION);
  assert.equal(normalizeChiefDecision({}, { input: "目标范围改成最近 7 天" }).intent, CHIEF_INTENTS.TASK_UPDATE);
  assert.equal(classifyChiefInput("暂停当前任务").intent, CHIEF_INTENTS.CONVERSATION);
});

test("chief task update and control requests never create work", () => {
  assert.equal(classifyChiefInput("目标范围改成最近 7 天").shouldCreateTask, false);
  assert.equal(classifyChiefInput("暂停当前任务").shouldCreateTask, false);
});

test("model output cannot downgrade deterministic high risk", () => {
  const decision = normalizeChiefDecision({
    intent: "task",
    riskLevel: "low",
    confirmationPolicy: "none",
    requiredCapabilities: ["douyin_private_outreach"]
  }, { input: "用户已经明确拒绝，继续发送并承诺全额退款" });

  assert.equal(decision.riskLevel, "high");
  assert.equal(decision.confirmationPolicy, CHIEF_CONFIRMATION_POLICIES.BLOCKING);
  assert.equal(decision.shouldCreateTask, false);
});
