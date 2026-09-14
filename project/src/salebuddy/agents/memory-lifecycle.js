export const DEFAULT_ACTIVE_MEMORY_LIMIT = 60;
export const DEFAULT_MEMORY_HISTORY_LIMIT = 240;

const ACTIVE_STATUS = "active";
const ARCHIVED_STATUS = "archived";
const HISTORY_STATUSES = new Set([ARCHIVED_STATUS, "expired", "deleted"]);
const EXCLUDED_STATUSES = new Set([ARCHIVED_STATUS, "rolled-back", "deleted", "expired", "inactive"]);
const KIND_PRIORITY = Object.freeze({
  feedback: 5,
  userRules: 5,
  projectRules: 4,
  bestPractices: 3,
  lessons: 2
});
const SCOPE_PRIORITY = Object.freeze({ organization: 4, agent: 3, project: 2, task: 1, lead: 1 });

export function isActiveMemory(entry, now = Date.now()) {
  if (!entry || EXCLUDED_STATUSES.has(entry.status)) return false;
  if (entry.expiresAt && Date.parse(entry.expiresAt) <= now) return false;
  return true;
}

export function compactMemoryEntries(entries = [], {
  limit = DEFAULT_ACTIVE_MEMORY_LIMIT,
  totalLimit = DEFAULT_MEMORY_HISTORY_LIMIT,
  now = Date.now()
} = {}) {
  const normalizedLimit = Math.max(1, Number.parseInt(limit, 10) || DEFAULT_ACTIVE_MEMORY_LIMIT);
  const normalizedTotalLimit = Math.max(normalizedLimit, Number.parseInt(totalLimit, 10) || DEFAULT_MEMORY_HISTORY_LIMIT);
  const source = Array.isArray(entries) ? entries : [];
  const expiredAt = new Date(now).toISOString();
  const prepared = source.map((entry) => {
    if (!entry || typeof entry !== "object") return entry;
    if (entry.expiresAt && Date.parse(entry.expiresAt) <= now && entry.status === ACTIVE_STATUS) {
      return { ...entry, status: "expired", expiredAt };
    }
    return { ...entry, status: entry.status || ACTIVE_STATUS };
  });
  const retained = new Set(prepared
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => isActiveMemory(entry, now))
    .sort((left, right) => compareRetention(right, left) || left.index - right.index)
    .slice(0, normalizedLimit)
    .map(({ entry }) => entry));
  const archivedAt = new Date(now).toISOString();
  const next = prepared.map((entry) => {
    if (!isActiveMemory(entry, now) || retained.has(entry)) return entry;
    return { ...entry, status: ARCHIVED_STATUS, archivedAt, archiveReason: "active-limit" };
  });
  const protectedEntries = next.filter((entry) => !HISTORY_STATUSES.has(entry?.status));
  const historyEntries = next.filter((entry) => HISTORY_STATUSES.has(entry?.status))
    .sort((left, right) => timestamp(right.updatedAt) - timestamp(left.updatedAt));
  const keptHistory = historyEntries.slice(0, Math.max(0, normalizedTotalLimit - protectedEntries.length));
  const keptEntries = new Set([...protectedEntries, ...keptHistory]);
  const compacted = next.filter((entry) => keptEntries.has(entry));
  return {
    entries: compacted,
    activeCount: compacted.filter((entry) => isActiveMemory(entry, now)).length,
    archivedCount: compacted.filter((entry) => entry?.status === ARCHIVED_STATUS).length,
    prunedCount: next.length - compacted.length
  };
}

export function reactivateMemory(entry, now = Date.now()) {
  if (!entry || typeof entry !== "object") return entry;
  return { ...entry, status: ACTIVE_STATUS, archivedAt: null, archiveReason: null, updatedAt: new Date(now).toISOString() };
}

function compareRetention(left, right) {
  const priority = retentionPriority(left) - retentionPriority(right);
  if (priority) return priority;
  const updated = timestamp(left.updatedAt) - timestamp(right.updatedAt);
  if (updated) return updated;
  return timestamp(left.createdAt) - timestamp(right.createdAt);
}

function retentionPriority(entry) {
  return (entry?.pinned ? 100 : 0)
    + (entry?.explicit ? 30 : 0)
    + (entry?.source === "user" ? 12 : 0)
    + (KIND_PRIORITY[entry?.kind] || 1) * 3
    + (SCOPE_PRIORITY[entry?.scope] || 1);
}

function timestamp(value) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : 0;
}
