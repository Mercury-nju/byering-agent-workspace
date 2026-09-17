import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function timestamp(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function tenantKey(tenantId) {
  return createHash("sha256").update(String(tenantId || "local")).digest("hex");
}

function runKey(run = {}) {
  return createHash("sha256")
    .update(JSON.stringify([
      run.taskId || null,
      run.taskRunId || null,
      run.agentId || null,
      run.accountId || null
    ]))
    .digest("hex");
}

function emptyState() {
  return { version: 1, tenants: {} };
}

function readState(stateFile) {
  if (!existsSync(stateFile)) return emptyState();
  try {
    const parsed = JSON.parse(readFileSync(stateFile, "utf8"));
    return parsed && typeof parsed === "object" && parsed.tenants && typeof parsed.tenants === "object"
      ? parsed
      : emptyState();
  } catch {
    return emptyState();
  }
}

function normalizeRun(value, now) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const snapshot = value.resultSnapshot && typeof value.resultSnapshot === "object" && !Array.isArray(value.resultSnapshot)
    ? clone(value.resultSnapshot)
    : null;
  const taskId = String(value.taskId || snapshot?.taskId || "").trim();
  const agentId = String(value.agentId || snapshot?.agentId || snapshot?.agent_id || "").trim();
  if (!taskId || !agentId || !snapshot) return null;
  const taskRunId = String(value.taskRunId || snapshot.taskRunId || snapshot.task_run_id || "").trim();
  const accountId = String(value.accountId || snapshot.accountId || snapshot.account_id || "").trim();
  const updatedAt = String(value.updatedAt || snapshot.generatedAt || snapshot.generated_at || new Date(now()).toISOString());
  return {
    ...clone(value),
    taskId,
    taskRunId,
    agentId,
    accountId,
    status: String(value.status || snapshot.status || "unknown"),
    resultSnapshot: {
      ...snapshot,
      taskId,
      taskRunId: taskRunId || null,
      agentId,
      accountId: accountId || null
    },
    updatedAt
  };
}

export function createAgentResultRunStore({
  stateFile = join(homedir(), ".byering", "agent-result-runs.json"),
  now = () => Date.now()
} = {}) {
  mkdirSync(dirname(stateFile), { recursive: true });

  function list(tenantId = null, { limit = 100 } = {}) {
    const state = readState(stateFile);
    const runs = state.tenants?.[tenantKey(tenantId)]?.runs || {};
    return Object.values(runs)
      .sort((left, right) => timestamp(right?.updatedAt) - timestamp(left?.updatedAt))
      .slice(0, Math.max(1, Math.min(500, Number(limit) || 100)))
      .map(clone);
  }

  function upsert(tenantId = null, entries = []) {
    const state = readState(stateFile);
    const key = tenantKey(tenantId);
    const tenant = state.tenants[key] ||= { runs: {} };
    tenant.runs ||= {};
    for (const entry of Array.isArray(entries) ? entries.slice(0, 100) : []) {
      const next = normalizeRun(entry, now);
      if (!next) continue;
      const current = tenant.runs[runKey(next)];
      if (current && timestamp(current.updatedAt) > timestamp(next.updatedAt)) continue;
      tenant.runs[runKey(next)] = next;
    }
    const temporary = `${stateFile}.${randomUUID()}.tmp`;
    writeFileSync(temporary, JSON.stringify(state), { encoding: "utf8", mode: 0o600 });
    renameSync(temporary, stateFile);
    return list(tenantId, { limit: 500 });
  }

  return { list, upsert, stateFile };
}
