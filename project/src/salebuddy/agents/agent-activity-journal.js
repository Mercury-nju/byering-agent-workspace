/**
 * Browser-persistent journal for Agent-authored activity messages.
 *
 * Gateway messages are still the delivery channel. This journal is the local
 * replay source when a page is reopened or the native gateway is unavailable.
 */
const STORAGE_KEY = "salebuddy:agent-activity-journal:v1";
const DELIVERY_STORAGE_KEY = "salebuddy:agent-activity-delivery:v1";
const DELIVERY_LOCK_KEY = "salebuddy:agent-activity-delivery-lock:v1";
const MEMORY_STORAGE = new Map();
const DEFAULT_MAX_ENTRIES = 500;
const DELIVERY_LEASE_MS = 30_000;
const DELIVERY_VOLATILE = new Map();
const DELIVERY_LOCK_TTL_MS = 2_000;
const DELIVERY_PROCESS_LOCKS = new WeakMap();

function fallbackStorage() {
  return {
    getItem(key) { return MEMORY_STORAGE.has(key) ? MEMORY_STORAGE.get(key) : null; },
    setItem(key, value) { MEMORY_STORAGE.set(key, String(value)); },
    removeItem(key) { MEMORY_STORAGE.delete(key); }
  };
}

function resolveStorage(storage) {
  return storage && typeof storage.getItem === "function" && typeof storage.setItem === "function"
    ? storage
    : fallbackStorage();
}

function readEntries(storage) {
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((entry) => entry && typeof entry === "object") : [];
  } catch {
    return [];
  }
}

function writeEntries(storage, entries) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(entries));
    return true;
  } catch {
    return false;
  }
}

function readDeliveries(storage) {
  try {
    const parsed = JSON.parse(storage.getItem(DELIVERY_STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return null;
  }
}

function writeDeliveries(storage, deliveries) {
  try {
    storage.setItem(DELIVERY_STORAGE_KEY, JSON.stringify(deliveries));
    return true;
  } catch {
    return false;
  }
}

function normalizeAgentType(agentType) {
  return String(agentType || "").trim();
}

function contextValue(event, key) {
  return event?.[key]
    ?? event?.metadata?.[key]
    ?? event?.work?.[key]
    ?? event?.work?.metadata?.[key]
    ?? event?.context?.[key]
    ?? event?.metadata?.context?.[key]
    ?? null;
}

function eventKey(agentType, event = {}) {
  const explicit = event?.metadata?.activityKey || event?.activityKey;
  const taskId = contextValue(event, "taskId");
  const eventId = contextValue(event, "eventId") || event?.event_id;
  const sequence = Number(event?.sequence ?? event?.seq ?? event?.metadata?.sequence);
  const owner = taskId ? `${agentType}:${String(taskId)}` : agentType;
  if (explicit) return `${owner}:${String(explicit)}`;
  if (eventId) return `${owner}:event:${String(eventId)}`;
  if (Number.isFinite(sequence) && sequence > 0) {
    if (taskId) return `${owner}:seq:${sequence}`;
    const run = event?.work?.startedAt || event?.work?.taskRunId || event?.taskRunId || event?.metadata?.taskRunId;
    return run ? `${owner}:${run}:${sequence}` : `${owner}:${sequence}`;
  }
  return `${owner}:${event?.type || "unknown"}:${event?.text || ""}:${event?.artifact || ""}:${event?.createdAt || ""}`;
}

function sortEntries(entries) {
  return [...entries].sort((left, right) => {
    const leftAt = Date.parse(left.createdAt || "");
    const rightAt = Date.parse(right.createdAt || "");
    if (Number.isFinite(leftAt) && Number.isFinite(rightAt) && leftAt !== rightAt) return leftAt - rightAt;
    if (Number.isFinite(leftAt) !== Number.isFinite(rightAt)) return Number.isFinite(leftAt) ? -1 : 1;
    return String(left.id || "").localeCompare(String(right.id || ""));
  });
}

export function createAgentActivityJournal({
  storage = globalThis.localStorage,
  now = () => new Date().toISOString(),
  maxEntries = DEFAULT_MAX_ENTRIES
} = {}) {
  const targetStorage = resolveStorage(storage);
  const limit = Math.max(1, Number(maxEntries) || DEFAULT_MAX_ENTRIES);
  const volatileEntries = new Map();

  function withDeliveryLock(owner, callback) {
    const token = `${String(owner)}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    let processLocks = DELIVERY_PROCESS_LOCKS.get(targetStorage);
    if (!processLocks) {
      processLocks = new Set();
      DELIVERY_PROCESS_LOCKS.set(targetStorage, processLocks);
    }
    if (processLocks.has(DELIVERY_LOCK_KEY)) return false;
    processLocks.add(DELIVERY_LOCK_KEY);
    try {
      const existing = JSON.parse(targetStorage.getItem(DELIVERY_LOCK_KEY) || "null");
      if (existing?.expiresAt > Date.now() && existing.token !== token) return false;
      targetStorage.setItem(DELIVERY_LOCK_KEY, JSON.stringify({ token, expiresAt: Date.now() + DELIVERY_LOCK_TTL_MS }));
      const confirmed = JSON.parse(targetStorage.getItem(DELIVERY_LOCK_KEY) || "null");
      if (confirmed?.token !== token) return false;
      try { return callback(); } finally {
        const current = JSON.parse(targetStorage.getItem(DELIVERY_LOCK_KEY) || "null");
        if (current?.token === token) targetStorage.removeItem?.(DELIVERY_LOCK_KEY);
      }
    } catch {
      return false;
    } finally {
      processLocks.delete(DELIVERY_LOCK_KEY);
      if (!processLocks.size) DELIVERY_PROCESS_LOCKS.delete(targetStorage);
    }
  }

  function claimDelivery(activityKey, { owner = "default", now = Date.now(), leaseMs = DELIVERY_LEASE_MS } = {}) {
    const key = String(activityKey || "").trim();
    if (!key) return false;
    return withDeliveryLock(owner, () => {
      const deliveries = readDeliveries(targetStorage);
      if (deliveries === null) return false;
      const current = deliveries?.[key] || DELIVERY_VOLATILE.get(key);
      if (current?.status === "sent") return false;
      if (current?.status === "claimed" && current.owner !== owner
        && Number(now) - Number(current.claimedAt || 0) < Math.max(1, Number(leaseMs) || DELIVERY_LEASE_MS)) return false;
      const next = { status: "claimed", owner: String(owner), claimedAt: Number(now) };
      if (deliveries && writeDeliveries(targetStorage, { ...deliveries, [key]: next })) return true;
      return false;
    });
  }

  function completeDelivery(activityKey, { owner = "default" } = {}) {
    const key = String(activityKey || "").trim();
    if (!key) return false;
    return withDeliveryLock(owner, () => {
      const deliveries = readDeliveries(targetStorage);
      if (deliveries === null) return false;
      const current = deliveries?.[key] || DELIVERY_VOLATILE.get(key);
      if (current?.owner && current.owner !== owner) return false;
      const next = { status: "sent", owner: String(owner), sentAt: Date.now() };
      if (deliveries && writeDeliveries(targetStorage, { ...deliveries, [key]: next })) return true;
      return false;
    });
  }

  function releaseDelivery(activityKey, { owner = "default" } = {}) {
    const key = String(activityKey || "").trim();
    if (!key) return false;
    return withDeliveryLock(owner, () => {
      const deliveries = readDeliveries(targetStorage);
      if (deliveries === null) return false;
      const current = deliveries?.[key] || DELIVERY_VOLATILE.get(key);
      if (current?.owner && current.owner !== owner) return false;
      if (deliveries) {
        delete deliveries[key];
        if (writeDeliveries(targetStorage, deliveries)) return true;
      }
      return false;
    });
  }

  function record(agentType, event = {}, options = {}) {
    const normalizedAgentType = normalizeAgentType(agentType);
    const text = String(options.text || "").trim();
    if (!normalizedAgentType || !text) return false;
    const activityKey = eventKey(normalizedAgentType, event);
    const entries = readEntries(targetStorage);
    if (entries.some((entry) => entry.metadata?.activityKey === activityKey) || volatileEntries.has(activityKey)) return false;
    const context = Object.fromEntries(["agentId", "taskId", "taskRunId", "accountId", "conversationId", "eventId", "sequence"]
      .map((key) => [key, contextValue(event, key)]).filter(([, value]) => value !== null && value !== undefined && value !== ""));
    const message = {
      id: `activity-${activityKey}`,
      agentType: normalizedAgentType,
      from: normalizedAgentType,
      fromName: String(options.fromName || normalizedAgentType),
      text,
      createdAt: options.createdAt || event.createdAt || now(),
      metadata: {
        ...(event.metadata && typeof event.metadata === "object" ? event.metadata : {}),
        source: "agent-activity",
        activityType: event.type || null,
        activityKey,
        agentId: normalizedAgentType,
        ...context
      },
      artifact: options.artifact && typeof options.artifact === "object" ? { ...options.artifact } : undefined
    };
    entries.push(message);
    const persisted = writeEntries(targetStorage, sortEntries(entries).slice(-limit));
    if (!persisted) volatileEntries.set(activityKey, message);
    return true;
  }

  function list(agentType) {
    const normalizedAgentType = normalizeAgentType(agentType);
    if (!normalizedAgentType) return [];
    const persisted = readEntries(targetStorage).filter((entry) => entry.agentType === normalizedAgentType);
    const volatile = [...volatileEntries.values()].filter((entry) => entry.agentType === normalizedAgentType);
    return sortEntries([...persisted, ...volatile])
      .map((entry) => ({ ...entry, metadata: entry.metadata ? { ...entry.metadata } : undefined, artifact: entry.artifact ? { ...entry.artifact } : undefined }));
  }

  function clear(agentType) {
    const normalizedAgentType = normalizeAgentType(agentType);
    if (!normalizedAgentType) return;
    for (const [key, entry] of volatileEntries) if (entry.agentType === normalizedAgentType) volatileEntries.delete(key);
    writeEntries(targetStorage, readEntries(targetStorage).filter((entry) => entry.agentType !== normalizedAgentType));
  }

  return { record, list, clear, claimDelivery, completeDelivery, releaseDelivery, key: STORAGE_KEY };
}

const agentActivityJournal = createAgentActivityJournal();

export function recordAgentActivity(agentType, event, options = {}) {
  return (options.journal || agentActivityJournal).record(agentType, event, options);
}

export function listAgentActivity(agentType, { journal = agentActivityJournal } = {}) {
  return journal.list(agentType);
}

export function clearAgentActivity(agentType, { journal = agentActivityJournal } = {}) {
  return journal.clear(agentType);
}

export { agentActivityJournal, eventKey as activityEventKey };
