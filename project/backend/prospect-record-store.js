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

function normalizeRecord(value, now) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const id = String(value.id || "").trim();
  if (!id) return null;
  const record = clone(value);
  record.id = id;
  record.updatedAt = String(record.updatedAt || new Date(now()).toISOString());
  return record;
}

export function createProspectRecordStore({
  stateFile = join(homedir(), ".byering", "prospect-records.json"),
  now = () => Date.now()
} = {}) {
  mkdirSync(dirname(stateFile), { recursive: true });

  function list(tenantId = null) {
    const state = readState(stateFile);
    const records = state.tenants?.[tenantKey(tenantId)]?.records || {};
    return Object.values(records)
      .sort((left, right) => timestamp(right?.updatedAt || right?.discoveredAt) - timestamp(left?.updatedAt || left?.discoveredAt))
      .map(clone);
  }

  function upsert(tenantId = null, entries = []) {
    const state = readState(stateFile);
    const key = tenantKey(tenantId);
    const tenant = state.tenants[key] ||= { records: {} };
    for (const entry of Array.isArray(entries) ? entries.slice(0, 2000) : []) {
      const next = normalizeRecord(entry, now);
      if (!next) continue;
      const current = tenant.records[next.id];
      if (current && timestamp(current.updatedAt) > timestamp(next.updatedAt)) continue;
      tenant.records[next.id] = next;
    }
    const temporary = `${stateFile}.${randomUUID()}.tmp`;
    writeFileSync(temporary, JSON.stringify(state), { encoding: "utf8", mode: 0o600 });
    renameSync(temporary, stateFile);
    return list(tenantId);
  }

  function remove(tenantId = null, ids = null) {
    const state = readState(stateFile);
    const key = tenantKey(tenantId);
    const tenant = state.tenants?.[key];
    if (!tenant?.records) return { deleted: 0, remaining: [] };
    const requested = Array.isArray(ids)
      ? [...new Set(ids.map((id) => String(id || "").trim()).filter(Boolean))]
      : null;
    const keys = requested || Object.keys(tenant.records);
    let deleted = 0;
    for (const id of keys) {
      if (!Object.hasOwn(tenant.records, id)) continue;
      delete tenant.records[id];
      deleted += 1;
    }
    const temporary = `${stateFile}.${randomUUID()}.tmp`;
    writeFileSync(temporary, JSON.stringify(state), { encoding: "utf8", mode: 0o600 });
    renameSync(temporary, stateFile);
    return { deleted, remaining: list(tenantId) };
  }

  return { list, upsert, remove, stateFile };
}
