import {
  DOUYIN_ACQUISITION_ACTIVE_AGENT_IDS,
  DOUYIN_ACQUISITION_COMPLETE_AGENT_ID,
  GOLD_CUSTOMER_SERVICE_AGENT_ID,
  getMarketplaceAgent
} from "./marketplace.js";

const STAGE_ORDER = Object.freeze(["find", "analyze", "outreach", "conversation"]);
const CHIEF_ORCHESTRATOR_AGENT_ID = "chief_of_staff";
const INBOX_AGENT_IDS = new Set(["mkt-dm-inbox", GOLD_CUSTOMER_SERVICE_AGENT_ID]);

const CAPABILITY_DEFINITIONS = Object.freeze({
  douyin_account_discovery: Object.freeze({ agentId: "mkt-find-people", stage: "find", requiresAccess: false }),
  douyin_comment_analysis: Object.freeze({ agentId: "mkt-intent-analyst", stage: "analyze", requiresAccess: false }),
  douyin_private_outreach: Object.freeze({ agentId: "mkt-cold-writer", stage: "outreach", requiresAccess: true }),
  douyin_public_reply: Object.freeze({ agentId: "mkt-cold-writer", stage: "outreach", requiresAccess: true }),
  douyin_inbox_reply: Object.freeze({ agentId: "mkt-dm-inbox", stage: "conversation", requiresAccess: true })
});

function cleanId(value) {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueCapabilities(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(cleanId)
    .filter((capability) => CAPABILITY_DEFINITIONS[capability]))];
}

function availableProductAgents(availableAgentIds) {
  if (availableAgentIds == null) return new Set(DOUYIN_ACQUISITION_ACTIVE_AGENT_IDS);
  return new Set((Array.isArray(availableAgentIds) ? availableAgentIds : [])
    .map(cleanId)
    .filter((agentId) => DOUYIN_ACQUISITION_ACTIVE_AGENT_IDS.includes(agentId)));
}

function agentAssignment({ agentId, capabilities, dependsOn = [], covers = null }) {
  const agent = getMarketplaceAgent(agentId);
  const stages = [...new Set(capabilities.map((capability) => CAPABILITY_DEFINITIONS[capability].stage))]
    .sort((left, right) => STAGE_ORDER.indexOf(left) - STAGE_ORDER.indexOf(right));
  return Object.freeze({
    agentId,
    agentType: agentId,
    agentName: agent?.name || agentId,
    role: agent?.title || agentId,
    mission: agent?.mission || agent?.desc || "",
    executionRole: "product_agent",
    capabilities: [...capabilities],
    stages,
    ...(covers ? { covers: [...covers] } : {}),
    requiresAccess: capabilities.some((capability) => CAPABILITY_DEFINITIONS[capability].requiresAccess),
    dependsOn: [...dependsOn],
    parallelGroup: stages[0] || "execution",
    acceptance: agent?.deliverables?.join("、") || "任务结果与来源证据已同步"
  });
}

function composeAssignments(capabilities, available) {
  const capabilityGroups = new Map();
  for (const capability of capabilities) {
    const definition = CAPABILITY_DEFINITIONS[capability];
    const group = capabilityGroups.get(definition.agentId) || [];
    group.push(capability);
    capabilityGroups.set(definition.agentId, group);
  }
  const orderedAgentIds = [...capabilityGroups.keys()].sort((left, right) => {
    const leftStage = CAPABILITY_DEFINITIONS[capabilityGroups.get(left)[0]].stage;
    const rightStage = CAPABILITY_DEFINITIONS[capabilityGroups.get(right)[0]].stage;
    return STAGE_ORDER.indexOf(leftStage) - STAGE_ORDER.indexOf(rightStage);
  });
  const missingAgentIds = orderedAgentIds.filter((agentId) => !available.has(agentId));
  if (missingAgentIds.length) return { assignments: [], missingAgentIds };

  const assignments = [];
  for (const agentId of orderedAgentIds) {
    const previous = assignments.at(-1);
    assignments.push(agentAssignment({
      agentId,
      capabilities: capabilityGroups.get(agentId),
      dependsOn: previous ? [previous.agentId] : []
    }));
  }
  return { assignments, missingAgentIds: [] };
}

function routeRequestedProductAgent({ requestedId, capabilities, available }) {
  if (!DOUYIN_ACQUISITION_ACTIVE_AGENT_IDS.includes(requestedId)) return null;

  if (requestedId === DOUYIN_ACQUISITION_COMPLETE_AGENT_ID) {
    if (!available.has(requestedId)) {
      return { assignments: [], missingAgentIds: [requestedId], incompatibleCapabilities: [], mode: "complete_capability" };
    }
    return {
      assignments: [agentAssignment({
        agentId: requestedId,
        capabilities,
        covers: STAGE_ORDER
      })],
      missingAgentIds: [],
      incompatibleCapabilities: [],
      mode: "complete_capability"
    };
  }

  const incompatibleCapabilities = capabilities.filter((capability) => {
    const owner = CAPABILITY_DEFINITIONS[capability].agentId;
    return capability === "douyin_inbox_reply" && INBOX_AGENT_IDS.has(requestedId)
      ? false
      : owner !== requestedId;
  });
  if (incompatibleCapabilities.length) {
    return {
      assignments: [],
      missingAgentIds: [],
      incompatibleCapabilities,
      mode: "requested_product_incompatible"
    };
  }
  if (!available.has(requestedId)) {
    return { assignments: [], missingAgentIds: [requestedId], incompatibleCapabilities: [], mode: "single_capability" };
  }
  return {
    assignments: [agentAssignment({ agentId: requestedId, capabilities })],
    missingAgentIds: [],
    incompatibleCapabilities: [],
    mode: "single_capability"
  };
}

function chiefRouteResult({ mode, assignments = [], missingAgentIds = [], incompatibleCapabilities = [], requiredCapabilities }) {
  return Object.freeze({
    applicable: true,
    mode,
    orchestratorAgentId: CHIEF_ORCHESTRATOR_AGENT_ID,
    assignments,
    missingAgentIds,
    incompatibleCapabilities,
    blocked: missingAgentIds.length > 0 || incompatibleCapabilities.length > 0,
    requiredCapabilities
  });
}

/**
 * Resolve a chief-of-staff request to product Agents. This is product routing,
 * not runtime delegation: the chief plans and supervises but never becomes an
 * external-action executor.
 */
export function routeChiefDouyinTask({ requiredCapabilities = [], requestedAgentId = "", availableAgentIds } = {}) {
  const capabilities = uniqueCapabilities(requiredCapabilities);
  if (!capabilities.length) {
    return Object.freeze({
      applicable: false,
      mode: null,
      assignments: [],
      missingAgentIds: [],
      blocked: false,
      requiredCapabilities: []
    });
  }

  const available = availableProductAgents(availableAgentIds);
  const requestedId = cleanId(requestedAgentId);
  const requestedRoute = routeRequestedProductAgent({ requestedId, capabilities, available });
  if (requestedRoute) return chiefRouteResult({ ...requestedRoute, requiredCapabilities: capabilities });
  const completeCoverage = STAGE_ORDER.every((stage) => capabilities.some((capability) => CAPABILITY_DEFINITIONS[capability].stage === stage));
  const shouldUseCompleteAgent = !requestedId && completeCoverage && available.has(DOUYIN_ACQUISITION_COMPLETE_AGENT_ID);

  if (shouldUseCompleteAgent) {
    return chiefRouteResult({
      mode: "complete_capability",
      assignments: [agentAssignment({
        agentId: DOUYIN_ACQUISITION_COMPLETE_AGENT_ID,
        capabilities,
        covers: STAGE_ORDER
      })],
      missingAgentIds: [],
      requiredCapabilities: capabilities
    });
  }

  const route = composeAssignments(capabilities, available);
  return chiefRouteResult({
    mode: "composed_capabilities",
    assignments: route.assignments,
    missingAgentIds: route.missingAgentIds,
    requiredCapabilities: capabilities
  });
}
