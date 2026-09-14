import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const CORE_AGENT_IDS = new Set([
  "mkt-comment-acquisition",
  "mkt-find-people",
  "mkt-intent-analyst",
  "mkt-cold-writer",
  "mkt-dm-inbox"
]);

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function tenantKey(tenantId) {
  return createHash("sha256").update(String(tenantId || "local")).digest("hex");
}

function readState(stateFile) {
  if (!existsSync(stateFile)) return { version: 1, tenants: {} };
  try {
    const state = JSON.parse(readFileSync(stateFile, "utf8"));
    return state?.version === 1 && state.tenants && typeof state.tenants === "object"
      ? state
      : { version: 1, tenants: {} };
  } catch {
    return { version: 1, tenants: {} };
  }
}

function normalizeContract(agentId, value = {}, now) {
  if (!CORE_AGENT_IDS.has(agentId)) {
    throw Object.assign(new Error("只能雇佣当前开放的核心 Agent"), {
      code: "EMPLOYMENT_AGENT_UNAVAILABLE",
      statusCode: 409,
      details: { agentId }
    });
  }
  const scope = Array.isArray(value.dataScope)
    ? [...new Set(value.dataScope.map((item) => String(item || "").trim()).filter(Boolean))]
    : [];
  const budget = value.budget && typeof value.budget === "object" ? value.budget : {};
  const numericBudgetValue = (value) => {
    if (value == null || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  return {
    agentId,
    name: String(value.name || agentId),
    status: "active",
    hiredAt: String(value.hiredAt || now()),
    hiredBy: String(value.hiredBy || "user"),
    projectId: value.projectId ? String(value.projectId) : null,
    dataScope: scope,
    budget: {
      daily: numericBudgetValue(budget.daily),
      monthly: numericBudgetValue(budget.monthly),
      perTask: numericBudgetValue(budget.perTask)
    },
    approvalRequired: Array.isArray(value.approvalRequired) ? value.approvalRequired.map(String) : [],
    ...(value.welcomeSentAt ? { welcomeSentAt: String(value.welcomeSentAt) } : {}),
    updatedAt: now()
  };
}

export function createEmploymentStore({
  stateFile = join(homedir(), ".byering", "employment-contracts.json"),
  now = () => new Date().toISOString()
} = {}) {
  mkdirSync(dirname(stateFile), { recursive: true });

  function write(state) {
    const temporary = `${stateFile}.${randomUUID()}.tmp`;
    writeFileSync(temporary, JSON.stringify(state), { encoding: "utf8", mode: 0o600 });
    renameSync(temporary, stateFile);
  }

  function contractsFor(tenantId) {
    const state = readState(stateFile);
    const tenant = state.tenants[tenantKey(tenantId)] || { contracts: {} };
    return Object.values(tenant.contracts || {})
      .filter((contract) => contract?.status === "active" && CORE_AGENT_IDS.has(contract.agentId))
      .sort((left, right) => String(left.hiredAt).localeCompare(String(right.hiredAt)))
      .map(clone);
  }

  function mutate(tenantId, callback) {
    const state = readState(stateFile);
    const tenant = state.tenants[tenantKey(tenantId)] ||= { contracts: {} };
    tenant.contracts ||= {};
    const result = callback(tenant.contracts);
    write(state);
    return clone(result);
  }

  return {
    list(tenantId = null) {
      return contractsFor(tenantId);
    },
    hire(tenantId = null, input = {}) {
      const agentId = String(input.agentId || "").trim();
      return mutate(tenantId, (contracts) => {
        const existing = contracts[agentId];
        const contract = normalizeContract(agentId, { ...existing, ...input, hiredAt: existing?.hiredAt || input.hiredAt }, now);
        contracts[agentId] = contract;
        return contract;
      });
    },
    assign(tenantId = null, agentId, projectId) {
      const normalizedId = String(agentId || "").trim();
      const normalizedProjectId = String(projectId || "").trim();
      return mutate(tenantId, (contracts) => {
        const existing = contracts[normalizedId];
        if (!existing) {
          throw Object.assign(new Error("该 Agent 尚未雇佣"), { code: "EMPLOYMENT_NOT_FOUND", statusCode: 404 });
        }
        contracts[normalizedId] = { ...existing, projectId: normalizedProjectId || null, assignedAt: now(), updatedAt: now() };
        return contracts[normalizedId];
      });
    },
    markWelcome(tenantId = null, agentId) {
      const normalizedId = String(agentId || "").trim();
      return mutate(tenantId, (contracts) => {
        const existing = contracts[normalizedId];
        if (!existing) {
          throw Object.assign(new Error("该 Agent 尚未雇佣"), { code: "EMPLOYMENT_NOT_FOUND", statusCode: 404 });
        }
        contracts[normalizedId] = { ...existing, welcomeSentAt: now(), updatedAt: now() };
        return contracts[normalizedId];
      });
    },
    terminate(tenantId = null, agentId) {
      const normalizedId = String(agentId || "").trim();
      return mutate(tenantId, (contracts) => {
        const existing = contracts[normalizedId];
        if (!existing) return null;
        delete contracts[normalizedId];
        return { ...existing, status: "terminated", terminatedAt: now(), updatedAt: now() };
      });
    },
    stateFile,
    coreAgentIds: [...CORE_AGENT_IDS]
  };
}
