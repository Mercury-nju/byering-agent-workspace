import {
  getMarketplaceAgent,
  hydrateEmploymentContracts,
  listHiredAgents
} from "../agents/marketplace.js";
import { receptionBaseUrl } from "./account-reception-client.js";

function employmentHeaders() {
  const config = globalThis.__SALEBUDDY_CONFIG__ || {};
  const key = config.controlPlaneApiKey || globalThis.document?.querySelector('meta[name="salebuddy-control-plane-api-key"]')?.content;
  const header = String(config.controlPlaneApiKeyHeader || "authorization").toLowerCase();
  return {
    "content-type": "application/json",
    ...(key ? { [header]: header === "authorization" ? `Bearer ${key}` : key } : {})
  };
}

async function employmentRequest(method, path, body = undefined) {
  const response = await fetch(`${receptionBaseUrl()}${path}`, {
    method,
    headers: employmentHeaders(),
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw Object.assign(new Error(result?.error?.message || "雇佣状态暂时无法更新"), {
      code: result?.error?.code || "EMPLOYMENT_REQUEST_FAILED",
      statusCode: response.status
    });
  }
  const contracts = result?.data?.contracts || [];
  hydrateEmploymentContracts(contracts);
  return { ...result, contracts: listHiredAgents() };
}

export async function refreshEmploymentContracts() {
  return employmentRequest("GET", "/v1/employment");
}

export async function employMarketplaceAgent(agentId, options = {}) {
  const agent = getMarketplaceAgent(agentId);
  if (!agent) throw Object.assign(new Error("该 Agent 不在当前可雇佣目录中"), { code: "EMPLOYMENT_AGENT_UNAVAILABLE" });
  return employmentRequest("POST", "/v1/employment", {
    agentId,
    name: agent.name,
    dataScope: options.dataScope || agent.profile?.scope?.dataAccess || [],
    budget: options.budget || agent.profile?.budget || {},
    approvalRequired: options.approvalRequired || agent.profile?.permission?.approvalRequired || []
  });
}

export async function terminateMarketplaceAgent(agentId) {
  return employmentRequest("DELETE", `/v1/employment/${encodeURIComponent(agentId)}`);
}

export async function assignMarketplaceAgent(agentId, projectId) {
  return employmentRequest("PUT", `/v1/employment/${encodeURIComponent(agentId)}/assign`, { projectId });
}

export async function markMarketplaceEmploymentWelcome(agentId) {
  return employmentRequest("POST", `/v1/employment/${encodeURIComponent(agentId)}/welcome`);
}
