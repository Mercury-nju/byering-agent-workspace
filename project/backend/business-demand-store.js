import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

const STATE_VERSION = 1;
const MAX_DEMANDS = 2000;

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function text(value) {
  return String(value ?? "").trim();
}

function nonNegativeInteger(value, fallback = 0) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : fallback;
}

function loadState(filePath) {
  if (!existsSync(filePath)) return { version: STATE_VERSION, demands: [] };
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8"));
    if (parsed?.version === STATE_VERSION && Array.isArray(parsed.demands)) return parsed;
  } catch {
    // A malformed demand file should not prevent the app from starting.
  }
  return { version: STATE_VERSION, demands: [] };
}

export function createBusinessDemandStore({
  stateFile = join(homedir(), ".byering", "business-demands.json"),
  now = () => Date.now()
} = {}) {
  const filePath = text(stateFile);
  if (!filePath) throw new TypeError("stateFile is required");
  mkdirSync(dirname(filePath), { recursive: true });
  const state = loadState(filePath);

  function flush() {
    const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
    writeFileSync(temporary, JSON.stringify(state), { encoding: "utf8", mode: 0o600 });
    renameSync(temporary, filePath);
  }

  function create(tenantId = null, input = {}) {
    const clientRequestId = text(input.clientRequestId || input.client_request_id) || null;
    const existing = clientRequestId
      ? state.demands.find((item) => item.tenantId === (tenantId || null) && item.clientRequestId === clientRequestId)
      : null;
    if (existing) return clone(existing);

    const demand = {
      id: text(input.id) || `demand-${randomUUID()}`,
      tenantId: tenantId || null,
      kind: text(input.kind) || "business_demand",
      agentId: text(input.agentId || input.agent_id),
      agentName: text(input.agentName || input.agent_name),
      accountId: text(input.accountId || input.account_id),
      accountName: text(input.accountName || input.account_name),
      sentCount: nonNegativeInteger(input.sentCount ?? input.sent_count),
      quotaCode: text(input.quotaCode || input.quota_code),
      clientRequestId,
      status: "new",
      createdAt: new Date(Number(now())).toISOString()
    };
    state.demands.unshift(demand);
    if (state.demands.length > MAX_DEMANDS) state.demands.splice(MAX_DEMANDS);
    flush();
    return clone(demand);
  }

  function list(tenantId = null, { status = null, limit = 100 } = {}) {
    return state.demands
      .filter((item) => item.tenantId === (tenantId || null) && (!status || item.status === status))
      .slice(0, Math.max(1, Math.min(500, Number(limit) || 100)))
      .map(clone);
  }

  return { create, list, stateFile: filePath };
}
