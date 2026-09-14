import test from "node:test";
import assert from "node:assert/strict";
import {
  routeChiefDouyinTask
} from "../src/salebuddy/agents/chief-douyin-agent-routing.js";

test("the chief routes a complete Douyin growth request to the complete-capability Agent", () => {
  const route = routeChiefDouyinTask({
    requiredCapabilities: [
      "douyin_account_discovery",
      "douyin_comment_analysis",
      "douyin_private_outreach",
      "douyin_inbox_reply"
    ]
  });

  assert.equal(route.applicable, true);
  assert.equal(route.mode, "complete_capability");
  assert.deepEqual(route.assignments.map((assignment) => assignment.agentId), ["mkt-comment-acquisition"]);
  assert.deepEqual(route.assignments[0].covers, ["find", "analyze", "outreach", "conversation"]);
  assert.equal(route.assignments[0].executionRole, "product_agent");
});

test("the chief composes selected single-capability Agents without inventing a parent-child hierarchy", () => {
  const route = routeChiefDouyinTask({
    requiredCapabilities: ["douyin_account_discovery", "douyin_comment_analysis", "douyin_private_outreach"],
    availableAgentIds: ["mkt-find-people", "mkt-intent-analyst", "mkt-cold-writer"]
  });

  assert.equal(route.applicable, true);
  assert.equal(route.mode, "composed_capabilities");
  assert.deepEqual(route.assignments.map((assignment) => assignment.agentId), [
    "mkt-find-people",
    "mkt-intent-analyst",
    "mkt-cold-writer"
  ]);
  assert.deepEqual(route.assignments.map((assignment) => assignment.dependsOn), [
    [],
    ["mkt-find-people"],
    ["mkt-intent-analyst"]
  ]);
  assert.equal(route.assignments.some((assignment) => "parentAgentId" in assignment), false);
});

test("the chief surfaces an unavailable requested Agent instead of silently replacing it", () => {
  const route = routeChiefDouyinTask({
    requiredCapabilities: ["douyin_private_outreach"],
    requestedAgentId: "mkt-cold-writer",
    availableAgentIds: ["mkt-find-people"]
  });

  assert.equal(route.applicable, true);
  assert.equal(route.blocked, true);
  assert.deepEqual(route.missingAgentIds, ["mkt-cold-writer"]);
  assert.deepEqual(route.assignments, []);
});

test("the chief never replaces an explicitly selected single-capability Agent with another product", () => {
  const route = routeChiefDouyinTask({
    requiredCapabilities: ["douyin_account_discovery"],
    requestedAgentId: "mkt-intent-analyst"
  });

  assert.equal(route.applicable, true);
  assert.equal(route.mode, "requested_product_incompatible");
  assert.equal(route.blocked, true);
  assert.deepEqual(route.incompatibleCapabilities, ["douyin_account_discovery"]);
  assert.deepEqual(route.assignments, []);
});

test("the chief remains the orchestrator while the selected product owns execution", () => {
  const route = routeChiefDouyinTask({
    requiredCapabilities: ["douyin_account_discovery"],
    requestedAgentId: "mkt-find-people"
  });

  assert.equal(route.orchestratorAgentId, "chief_of_staff");
  assert.equal(route.mode, "single_capability");
  assert.deepEqual(route.assignments.map((assignment) => assignment.agentId), ["mkt-find-people"]);
  assert.equal(route.assignments[0].executionRole, "product_agent");
});
