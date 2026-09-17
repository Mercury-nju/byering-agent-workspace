import test from "node:test";
import assert from "node:assert/strict";
import {
  ACCOUNT_MEMORY_AGENT_IDS,
  accountMemoryConversationId,
  accountMemorySummary,
  isAccountMemoryAgent,
  pendingAccountMemoryProposal,
  restoreScrollPosition
} from "../src/salebuddy/ui/agent-profile.js";

test("account memory is available to inbox-capable agents without changing generic agents", () => {
  assert.deepEqual(ACCOUNT_MEMORY_AGENT_IDS, [
    "mkt-comment-acquisition",
    "mkt-dm-inbox",
    "mkt-gold-customer-service"
  ]);
  assert.equal(isAccountMemoryAgent("mkt-gold-customer-service"), true);
  assert.equal(isAccountMemoryAgent("mkt-dm-inbox"), true);
  assert.equal(isAccountMemoryAgent("mkt-intent-analyst"), false);
});

test("account memory summary exposes the effective account-scoped strategy and revision", () => {
  const summary = accountMemorySummary({
    revision: 4,
    updatedAt: "2026-09-17T05:00:00.000Z",
    settings: {
      goal: "contact",
      goalDetails: "先回答车型和价格，再征得同意后收集电话",
      persona: { role: "adviser" },
      length: "balanced",
      knowledge: "主推新能源 SUV，工作日可预约试驾。",
      handoff: { price: true, complaints: true, unknown: true, humanRequest: true }
    },
    privateReception: { enabled: true, runtimeState: "running" }
  });
  assert.equal(summary.configured, true);
  assert.equal(summary.revision, 4);
  assert.equal(summary.goal, "留下联系方式");
  assert.match(summary.responseStyle, /专业顾问/);
  assert.equal(summary.length, "适中");
  assert.equal(summary.knowledgePreview, "主推新能源 SUV，工作日可预约试驾。");
  assert.deepEqual(summary.handoffRules, ["价格或报价承诺", "投诉与退款", "无法确认的事实", "用户要求人工"]);
  assert.equal(summary.privateReception.runtimeState, "running");
});

test("pending account memory proposal disappears only after its own confirmation", () => {
  const proposal = {
    id: "proposal-1",
    from: "mkt-gold-customer-service",
    metadata: { receptionStrategyProposal: { status: "pending" } }
  };
  assert.equal(pendingAccountMemoryProposal([proposal])?.id, "proposal-1");
  assert.equal(pendingAccountMemoryProposal([
    proposal,
    {
      id: "confirmation-1",
      from: "mkt-gold-customer-service",
      metadata: { receptionStrategyConfirmation: { proposalMessageId: "proposal-1", revision: 2 } }
    }
  ]), null);
  assert.equal(pendingAccountMemoryProposal([
    proposal,
    { id: "other-proposal", from: "mkt-gold-customer-service", metadata: { receptionStrategyProposal: { status: "pending" } } },
    { id: "stale", from: "mkt-gold-customer-service", metadata: { receptionStrategyProposal: { status: "stale" } } }
  ]), null);
});

test("account memory conversation ids are stable and scoped by agent and account", () => {
  assert.equal(accountMemoryConversationId("mkt-gold-customer-service", "account-1"), "account-memory:mkt-gold-customer-service:account-1");
  assert.notEqual(
    accountMemoryConversationId("mkt-gold-customer-service", "account-1"),
    accountMemoryConversationId("mkt-gold-customer-service", "account-2")
  );
});

test("agent profile restores the previous scroll position after async rerender", () => {
  const element = { scrollHeight: 2500, clientHeight: 600, scrollTop: 0 };
  restoreScrollPosition(element, 1200);
  assert.equal(element.scrollTop, 1200);
  restoreScrollPosition(element, 5000);
  assert.equal(element.scrollTop, 1900);
  restoreScrollPosition(element, -20);
  assert.equal(element.scrollTop, 0);
});
