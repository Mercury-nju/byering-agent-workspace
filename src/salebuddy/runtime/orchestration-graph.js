import { AGENT_IDS, getAgentManifest } from "../agents/agent-foundation.js";

/**
 * Declarative graph metadata consumed by a LangGraph adapter at runtime.
 * Nodes describe contracts and interrupt boundaries only; no model is called
 * here and no routing decision is delegated to an LLM.
 */

const NODE_METADATA = Object.freeze({
  chief_of_staff: {
    inputContract: ["goal", "constraints", "conversation_context"],
    outputContract: ["task_plan", "agent_assignments", "risk_summary"],
    interruptPoints: ["requirement", "access", "handoff"]
  },
  acquisition_strategist: {
    inputContract: ["goal", "market_context", "constraints"],
    outputContract: ["segment_definition", "channel_plan", "funnel_hypothesis"],
    interruptPoints: []
  },
  lead_miner: {
    inputContract: ["segment_definition", "source_permissions", "search_constraints"],
    outputContract: ["lead_candidates", "source_coverage", "data_gaps"],
    interruptPoints: ["access"]
  },
  lead_analyst: {
    inputContract: ["lead_candidates", "scoring_rules", "source_coverage"],
    outputContract: ["qualified_leads", "score_summary", "data_risks"],
    interruptPoints: []
  },
  prospect_researcher: {
    inputContract: ["qualified_leads", "research_scope", "source_coverage"],
    outputContract: ["account_briefs", "buying_signals", "research_gaps"],
    interruptPoints: ["access"]
  },
  sales_consultant: {
    inputContract: ["account_briefs", "buying_signals", "offer_catalog"],
    outputContract: ["offer_positioning", "objection_plan", "next_step_plan"],
    interruptPoints: []
  },
  risk_specialist: {
    inputContract: ["next_step_plan", "account_briefs", "policy_context"],
    outputContract: ["risk_map", "red_flags", "guardrails", "approval_request"],
    interruptPoints: ["approval", "handoff"]
  },
  outreach_specialist: {
    inputContract: ["approved_strategy", "account_briefs", "channel_constraints"],
    outputContract: ["outreach_sequence", "message_drafts", "approval_request"],
    interruptPoints: ["approval"]
  },
  outreach_operator: {
    inputContract: ["approved_sequence", "approved_messages", "connector_session"],
    outputContract: ["execution_log", "reply_status", "handoff_notes"],
    interruptPoints: ["reply", "handoff"]
  }
});

const CONTROL_NODES = Object.freeze([
  { id: "requirement_gate", kind: "control", interrupt: "requirement" },
  { id: "access_gate", kind: "control", interrupt: "access" },
  { id: "approval_gate", kind: "control", interrupt: "approval" },
  { id: "reply_gate", kind: "control", interrupt: "reply" },
  { id: "terminal", kind: "control", interrupt: null }
]);

const EDGES = Object.freeze([
  edge("chief_of_staff", "requirement_gate", "task.created", "ordered", "requirement"),
  edge("requirement_gate", "chief_of_staff", "requirement.needs_clarification", "conditional", "requirement"),
  edge("requirement_gate", "acquisition_strategist", "requirement.confirmed", "conditional", "requirement"),
  edge("acquisition_strategist", "lead_miner", "strategy.ready", "ordered"),
  edge("acquisition_strategist", "access_gate", "strategy.requires_access", "conditional", "access"),
  edge("access_gate", "lead_miner", "access.granted", "conditional", "access"),
  edge("access_gate", "chief_of_staff", "access.denied", "conditional", "access"),
  edge("lead_miner", "lead_analyst", "find.completed", "ordered"),
  edge("lead_analyst", "prospect_researcher", "analyze.qualified", "conditional"),
  edge("lead_analyst", "chief_of_staff", "analyze.insufficient", "conditional"),
  edge("prospect_researcher", "sales_consultant", "research.completed", "ordered"),
  edge("sales_consultant", "risk_specialist", "outreach.plan.ready", "ordered"),
  edge("risk_specialist", "approval_gate", "risk.reviewed", "ordered", "approval"),
  edge("approval_gate", "outreach_specialist", "risk.approval.approved", "conditional", "approval"),
  edge("approval_gate", "chief_of_staff", "risk.approval.rejected", "conditional", "approval"),
  edge("outreach_specialist", "approval_gate", "outreach.draft.ready", "ordered", "approval"),
  edge("approval_gate", "outreach_operator", "outreach.approval.approved", "conditional", "approval"),
  edge("approval_gate", "chief_of_staff", "outreach.approval.rejected", "conditional", "approval"),
  edge("outreach_operator", "reply_gate", "outreach.sent", "ordered", "reply"),
  edge("reply_gate", "chief_of_staff", "reply.received", "conditional", "reply"),
  edge("reply_gate", "terminal", "outreach.completed", "conditional", "reply")
]);

const GRAPH_STATE = Object.freeze({
  goal: "object",
  task: "object",
  plan: "object",
  leadCandidates: "array",
  qualifiedLeads: "array",
  accountBriefs: "array",
  riskMap: "array",
  approval: "object|null",
  outreach: "object|null",
  reply: "object|null",
  status: "string"
});

export const BYERING_ORCHESTRATION_GRAPH = deepFreeze({
  id: "byering-sales-orchestration",
  version: 1,
  framework: "langgraph-compatible",
  entryPoint: "chief_of_staff",
  stateSchema: GRAPH_STATE,
  nodes: AGENT_IDS.map(createAgentNode),
  controlNodes: CONTROL_NODES,
  edges: EDGES,
  agentIds: AGENT_IDS
});

export function getOrchestrationGraph() {
  return cloneJson(BYERING_ORCHESTRATION_GRAPH);
}

export function listOrchestrationNodes() {
  return BYERING_ORCHESTRATION_GRAPH.nodes.map((node) => cloneJson(node));
}

export function getOrchestrationNode(agentId) {
  const node = BYERING_ORCHESTRATION_GRAPH.nodes.find((item) => item.agentId === agentId || item.id === agentId);
  return node ? cloneJson(node) : null;
}

export function getOutgoingEdges(nodeId) {
  return BYERING_ORCHESTRATION_GRAPH.edges.filter((edge) => edge.from === nodeId).map((edge) => cloneJson(edge));
}

function createAgentNode(agentId) {
  const manifest = getAgentManifest(agentId);
  const metadata = NODE_METADATA[agentId];
  return {
    id: agentId,
    agentId,
    kind: "agent",
    displayName: manifest.displayName,
    role: manifest.role,
    reportsTo: manifest.reportsTo,
    inputContract: [...metadata.inputContract],
    outputContract: [...metadata.outputContract],
    interruptPoints: [...metadata.interruptPoints]
  };
}

function edge(from, to, when, kind, interrupt = null) {
  return { from, to, when, kind, interrupt };
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}
