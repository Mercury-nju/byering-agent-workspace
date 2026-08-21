import assert from "node:assert/strict";
import test from "node:test";

import {
  BYERING_ORCHESTRATION_GRAPH,
  getOrchestrationGraph,
  getOutgoingEdges,
  getOrchestrationNode,
  listOrchestrationNodes
} from "../src/salebuddy/runtime/orchestration-graph.js";

const EXPECTED_AGENT_IDS = [
  "chief_of_staff",
  "acquisition_strategist",
  "lead_miner",
  "lead_analyst",
  "prospect_researcher",
  "sales_consultant",
  "risk_specialist",
  "outreach_specialist",
  "outreach_operator"
];

test("graph exposes chief of staff entry and all nine visible agents", () => {
  assert.equal(BYERING_ORCHESTRATION_GRAPH.entryPoint, "chief_of_staff");
  assert.deepEqual(BYERING_ORCHESTRATION_GRAPH.agentIds, EXPECTED_AGENT_IDS);
  assert.deepEqual(BYERING_ORCHESTRATION_GRAPH.nodes.map((node) => node.agentId), EXPECTED_AGENT_IDS);
  assert.ok(BYERING_ORCHESTRATION_GRAPH.nodes.every((node) => node.inputContract.length && node.outputContract.length));
});

test("graph has ordered and conditional edges for the find, analyze, research, risk, outreach and reply path", () => {
  const edges = BYERING_ORCHESTRATION_GRAPH.edges;
  const find = (from, to, when) => edges.some((edge) => edge.from === from && edge.to === to && edge.when === when);

  assert.ok(find("acquisition_strategist", "lead_miner", "strategy.public_only"));
  assert.ok(find("acquisition_strategist", "access_gate", "strategy.requires_access"));
  assert.ok(find("lead_miner", "lead_analyst", "find.completed"));
  assert.ok(find("lead_miner", "access_gate", "find.requires_access"));
  assert.ok(find("lead_analyst", "prospect_researcher", "analyze.qualified"));
  assert.ok(find("prospect_researcher", "risk_specialist", "research.find_only_completed"));
  assert.ok(find("prospect_researcher", "sales_consultant", "research.public_completed"));
  assert.ok(find("prospect_researcher", "access_gate", "research.requires_access"));
  assert.ok(find("sales_consultant", "risk_specialist", "outreach.plan.ready"));
  assert.ok(find("risk_specialist", "approval_gate", "risk.reviewed"));
  assert.ok(find("risk_specialist", "terminal", "find_only.completed"));
  assert.ok(find("approval_gate", "outreach_specialist", "risk.approval.approved"));
  assert.ok(find("outreach_specialist", "approval_gate", "outreach.draft.ready"));
  assert.ok(find("approval_gate", "outreach_operator", "outreach.approval.approved"));
  assert.ok(find("outreach_operator", "reply_gate", "outreach.sent"));
  assert.ok(find("reply_gate", "chief_of_staff", "reply.received"));
  assert.ok(find("requirement_gate", "acquisition_strategist", "requirement.confirmed"));
  assert.ok(find("acquisition_strategist", "access_gate", "strategy.requires_access"));
  assert.ok(find("access_gate", "lead_miner", "access.granted"));
  assert.ok(edges.some((edge) => edge.kind === "conditional"));
});

test("acquisition strategist owns default account resolution capability", () => {
  const node = getOrchestrationNode("acquisition_strategist");
  assert.ok(node);
  assert.ok(node.inputContract.includes("account_reference"));
  assert.ok(node.outputContract.includes("resolved_accounts"));
  assert.ok(node.tools.includes("account.resolve"));
});

test("graph metadata is immutable and returned graph copies cannot mutate the definition", () => {
  assert.ok(Object.isFrozen(BYERING_ORCHESTRATION_GRAPH));
  assert.ok(Object.isFrozen(BYERING_ORCHESTRATION_GRAPH.nodes));
  const copy = getOrchestrationGraph();
  copy.nodes[0].displayName = "tampered";
  assert.equal(BYERING_ORCHESTRATION_GRAPH.nodes[0].displayName, "幕僚长");
  assert.equal(listOrchestrationNodes().length, 9);
  assert.ok(getOutgoingEdges("lead_miner").some((edge) => edge.to === "lead_analyst"));
  assert.equal(getOrchestrationNode("Browser Agent")?.agentId, "lead_miner");
});
