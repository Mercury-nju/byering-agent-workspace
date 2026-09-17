import assert from "node:assert/strict";
import test from "node:test";

import {
  CONVERSATION_STATE_ORDER,
  getConversationScenario,
  listConversationScenarios
} from "../src/salebuddy/agents/conversation-scenarios.js";
import { MARKETPLACE_AGENTS } from "../src/salebuddy/agents/marketplace.js";

test("every marketplace Agent has a conversation contract built on shared states", () => {
  const scenarios = listConversationScenarios();

  assert.equal(scenarios.length, MARKETPLACE_AGENTS.length + 1);
  assert.deepEqual(scenarios[0].sharedStates, CONVERSATION_STATE_ORDER);
  for (const scenario of scenarios) {
    assert.ok(scenario.agentId, "conversation contract needs a stable agent id");
    assert.ok(scenario.family, `${scenario.agentId} needs a conversation family`);
    assert.ok(scenario.objective, `${scenario.agentId} needs a business objective`);
    assert.ok(scenario.inputs.length, `${scenario.agentId} needs declared inputs`);
    assert.ok(scenario.dataSources.length, `${scenario.agentId} needs declared data sources`);
    assert.ok(scenario.outputs.length, `${scenario.agentId} needs declared outputs`);
    assert.ok(scenario.scenarios.length >= 4, `${scenario.agentId} needs concrete conversation scenarios`);
    assert.ok(scenario.boundaries.length, `${scenario.agentId} needs explicit boundaries`);
  }
});

test("individual Agent contracts preserve real business differences", () => {
  const finder = getConversationScenario("mkt-find-people");
  const analyst = getConversationScenario("mkt-intent-analyst");
  const outreach = getConversationScenario("mkt-cold-writer");
  const inbox = getConversationScenario("mkt-dm-inbox");
  const gold = getConversationScenario("mkt-gold-customer-service");
  const liveOutreach = getConversationScenario("mkt-live-danmaku-outreach");
  const chief = getConversationScenario("main");

  assert.equal(finder.family, "discovery");
  assert.equal(finder.permissions.canAnalyzeIntent, false);
  assert.equal(finder.permissions.canExecuteExternalAction, false);
  assert.deepEqual(finder.handoffs, ["mkt-intent-analyst"]);

  assert.equal(analyst.family, "analysis");
  assert.equal(analyst.permissions.canAnalyzeIntent, true);
  assert.equal(analyst.permissions.canExecuteExternalAction, false);
  assert.ok(analyst.outputs.includes("HTML 分析报告"));

  assert.equal(outreach.family, "outreach");
  assert.equal(outreach.permissions.canExecuteExternalAction, true);
  assert.equal(outreach.confirmation.mode, "before_each_batch");
  assert.ok(outreach.scenarios.some(({ id }) => id === "message_preview"));

  assert.equal(inbox.family, "inbox");
  assert.equal(gold.family, "goal_inbox");
  assert.notEqual(inbox.objective, gold.objective);
  assert.ok(gold.inputs.includes("私信对话目标"));

  assert.equal(liveOutreach.confirmation.mode, "automatic_with_escalation");
  assert.ok(liveOutreach.boundaries.some((item) => /不判断成交|购买意向/.test(item)));

  assert.equal(chief.family, "chief");
  assert.equal(chief.permissions.canReadGlobalAgentData, true);
  assert.equal(chief.permissions.canExecuteExternalAction, false);
  assert.ok(chief.scenarios.some(({ id }) => id === "global_data_query"));
});

test("unknown runtime Agents fail closed with a generic but usable contract", () => {
  const scenario = getConversationScenario("future-agent");

  assert.equal(scenario.agentId, "future-agent");
  assert.equal(scenario.permissions.canExecuteExternalAction, false);
  assert.equal(scenario.confirmation.mode, "before_external_action");
  assert.ok(scenario.boundaries.some((item) => /未声明能力/.test(item)));
});
