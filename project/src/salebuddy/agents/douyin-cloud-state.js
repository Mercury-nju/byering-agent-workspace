const STORAGE_KEY = "salebuddy:douyin-cloud-tasks:v1";
const MEMORY_STORAGE = new Map();

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

function readTasks(storage) {
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeTasks(storage, tasks) {
  try { storage.setItem(STORAGE_KEY, JSON.stringify(tasks)); } catch { /* storage may be unavailable */ }
}

function normalizeAgentId(agentId) {
  return String(agentId || "").trim();
}

function normalizeAccountKey(value) {
  return String(value || "").trim();
}

function taskStorageKey(agentId, { accountKey = "" } = {}) {
  const id = normalizeAgentId(agentId);
  const account = normalizeAccountKey(accountKey);
  return account ? `${id}::${account}` : id;
}

function latestTaskForAgent(tasks, agentId) {
  const id = normalizeAgentId(agentId);
  if (!id) return null;
  return latestTaskEntryForAgent(tasks, id)?.[1] || null;
}

function latestTaskEntryForAgent(tasks, agentId) {
  const id = normalizeAgentId(agentId);
  if (!id) return null;
  let latest = null;
  for (const entry of Object.entries(tasks)) {
    const [, task] = entry;
    if (task?.agentId !== id) continue;
    // A clock can return the same ISO timestamp for two immediate writes.
    // In that tie, insertion order is the only reliable indicator of recency.
    if (!latest || String(task?.updatedAt || "") >= String(latest[1]?.updatedAt || "")) latest = entry;
  }
  return latest;
}

export function createDouyinCloudTaskStore({ storage = globalThis.localStorage, now = () => new Date().toISOString() } = {}) {
  const targetStorage = resolveStorage(storage);

  function get(agentId) {
    const id = normalizeAgentId(agentId);
    if (!id) return null;
    const tasks = readTasks(targetStorage);
    const task = tasks[id] || latestTaskForAgent(tasks, id);
    return task ? { ...task, resumeFlow: task.resumeFlow ? { ...task.resumeFlow } : null } : null;
  }

  function storageKeyForExistingTask(tasks, agentId) {
    const id = normalizeAgentId(agentId);
    if (!id) return "";
    if (tasks[id]) return id;
    return latestTaskEntryForAgent(tasks, id)?.[0] || id;
  }

  function save(agentId, patch = {}) {
    const id = normalizeAgentId(agentId);
    if (!id) return null;
    const tasks = readTasks(targetStorage);
    const current = tasks[id] || { agentId: id };
    const keyAgentId = id.split("::")[0] || id;
    const semanticAgentId = normalizeAgentId(patch.agentId || current.agentId || keyAgentId) || keyAgentId;
    const next = { ...current, ...patch, agentId: semanticAgentId, updatedAt: patch.updatedAt || now() };
    tasks[id] = next;
    writeTasks(targetStorage, tasks);
    return { ...next, resumeFlow: next.resumeFlow ? { ...next.resumeFlow } : null };
  }

  function update(agentId, patch = {}) {
    const tasks = readTasks(targetStorage);
    return save(storageKeyForExistingTask(tasks, agentId), patch);
  }

  function getFor(agentId, { accountKey = "" } = {}) {
    return get(taskStorageKey(agentId, { accountKey }));
  }

  function saveFor(agentId, { accountKey = "" } = {}, patch = {}) {
    const id = normalizeAgentId(agentId);
    const normalizedAccountKey = normalizeAccountKey(accountKey);
    const task = save(taskStorageKey(id, { accountKey: normalizedAccountKey }), {
      ...patch,
      agentId: id,
      accountKey: normalizedAccountKey || patch.accountKey || null
    });
    return task;
  }

  function updateFor(agentId, { accountKey = "" } = {}, patch = {}) {
    return saveFor(agentId, { accountKey }, patch);
  }

  function listForAgent(agentId) {
    const id = normalizeAgentId(agentId);
    if (!id) return [];
    return Object.values(readTasks(targetStorage))
      .filter((task) => task?.agentId === id)
      .sort((left, right) => String(right?.updatedAt || "").localeCompare(String(left?.updatedAt || "")))
      .map((task) => ({ ...task, resumeFlow: task.resumeFlow ? { ...task.resumeFlow } : null }));
  }

  function clear(agentId) {
    const id = normalizeAgentId(agentId);
    if (!id) return;
    const tasks = readTasks(targetStorage);
    delete tasks[storageKeyForExistingTask(tasks, id)];
    writeTasks(targetStorage, tasks);
  }

  function list() {
    return Object.values(readTasks(targetStorage)).map((task) => ({
      ...task,
      resumeFlow: task.resumeFlow ? { ...task.resumeFlow } : null
    }));
  }

  return { get, save, update, getFor, saveFor, updateFor, listForAgent, clear, list, key: STORAGE_KEY };
}

export function isDouyinCloudProvisioningStatus(status = {}) {
  const state = String(status.state || "").toUpperCase();
  const display = String(status.display_state || status.displayState || "").toLowerCase();
  const session = String(status.session_state || status.sessionState || "").toLowerCase();
  return status.provisioning === true
    || state === "STARTING"
    || ["starting", "provisioning", "initializing", "booting"].includes(display)
    || session === "starting";
}

export function isDouyinCloudReadyStatus(status = {}) {
  if (isDouyinCloudProvisioningStatus(status)) return false;
  if (status.worker?.online === false) return false;
  const login = String(status.login_state || status.loginState || "").toLowerCase();
  if (["logged_in", "authenticated", "authorized", "ready", "success", "已登录"].includes(login)) return true;
  if (status.worker?.online === true) return true;
  const session = String(status.session_state || status.sessionState || "").toLowerCase();
  const state = String(status.state || "").toUpperCase();
  return session === "active" && state !== "NOT_STARTED";
}

export const douyinCloudTaskStore = createDouyinCloudTaskStore();
