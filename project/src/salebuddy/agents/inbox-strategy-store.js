const STORAGE_KEY = "salebuddy:inbox-strategies:v1";
const FALLBACK_VALUES = new Map();

export const DEFAULT_INBOX_STRATEGY = Object.freeze({
  replyMode: "auto",
  replyObjective: "先解决用户当前问题，再确认需求并推进到下一步，不强行销售。",
  replyTone: "专业、简短、自然，像一个懂业务的人在回复。",
  replyRule: "优先回答产品功能、使用方法和服务范围；没有把握的内容不要猜。",
  handoffRules: "价格谈判、投诉、退款、合同、效果承诺和无法确认的事实，交给人工。"
});

function fallbackStorage() {
  return {
    getItem(key) { return FALLBACK_VALUES.has(key) ? FALLBACK_VALUES.get(key) : null; },
    setItem(key, value) { FALLBACK_VALUES.set(key, String(value)); },
    removeItem(key) { FALLBACK_VALUES.delete(key); }
  };
}

function resolveStorage(storage) {
  return storage && typeof storage.getItem === "function" && typeof storage.setItem === "function"
    ? storage
    : fallbackStorage();
}

function readStrategies(storage) {
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeStrategies(storage, strategies) {
  try { storage.setItem(STORAGE_KEY, JSON.stringify(strategies)); } catch { /* storage may be unavailable */ }
}

function normalizeAgentId(agentId) {
  return String(agentId || "").trim();
}

function normalizeAccountId(accountId) {
  return String(accountId || "").trim();
}

function normalizeOptions(options = {}) {
  if (typeof options === "string") return { accountId: options };
  return options && typeof options === "object" ? options : {};
}

function cleanStrategy(value = {}) {
  return {
    replyMode: "auto",
    replyObjective: String(value.replyObjective || DEFAULT_INBOX_STRATEGY.replyObjective).trim(),
    replyTone: String(value.replyTone || DEFAULT_INBOX_STRATEGY.replyTone).trim(),
    replyRule: String(value.replyRule || DEFAULT_INBOX_STRATEGY.replyRule).trim(),
    handoffRules: String(value.handoffRules || DEFAULT_INBOX_STRATEGY.handoffRules).trim()
  };
}

export function createInboxStrategyStore({ storage = globalThis.localStorage, now = () => new Date().toISOString() } = {}) {
  const targetStorage = resolveStorage(storage);

  function get(agentId, options = {}) {
    const id = normalizeAgentId(agentId);
    if (!id) return null;
    const { accountId: requestedAccountId } = normalizeOptions(options);
    const accountId = normalizeAccountId(requestedAccountId);
    const saved = readStrategies(targetStorage)[id];
    const accountSaved = accountId && saved?.accounts && typeof saved.accounts === "object"
      ? saved.accounts[accountId]
      : null;
    const source = accountSaved || saved;
    return source
      ? {
        ...cleanStrategy(source),
        agentId: id,
        ...(accountId ? { accountId } : {}),
        ...(source.accountName ? { accountName: String(source.accountName).trim() } : {}),
        ...(source.updatedAt ? { updatedAt: source.updatedAt } : {})
      }
      : { ...DEFAULT_INBOX_STRATEGY, agentId: id };
  }

  function save(agentId, patch = {}, options = {}) {
    const id = normalizeAgentId(agentId);
    if (!id) return null;
    const { accountId: requestedAccountId, accountName: requestedAccountName } = normalizeOptions(options);
    const accountId = normalizeAccountId(requestedAccountId);
    const strategies = readStrategies(targetStorage);
    const current = strategies[id] || DEFAULT_INBOX_STRATEGY;
    if (!accountId) {
      const next = { agentId: id, ...cleanStrategy({ ...current, ...patch }), updatedAt: patch.updatedAt || now() };
      strategies[id] = next;
      writeStrategies(targetStorage, strategies);
      return { ...next };
    }

    const currentAccount = current.accounts && typeof current.accounts === "object"
      ? current.accounts[accountId]
      : null;
    const next = {
      agentId: id,
      accountId,
      ...(requestedAccountName ? { accountName: String(requestedAccountName).trim() } : {}),
      ...cleanStrategy({ ...(currentAccount || current), ...patch }),
      updatedAt: patch.updatedAt || now()
    };
    const container = current === DEFAULT_INBOX_STRATEGY
      ? { ...DEFAULT_INBOX_STRATEGY }
      : { ...current };
    container.accounts = {
      ...(container.accounts && typeof container.accounts === "object" ? container.accounts : {}),
      [accountId]: next
    };
    strategies[id] = container;
    writeStrategies(targetStorage, strategies);
    return { ...next };
  }

  function listAccounts(agentId) {
    const id = normalizeAgentId(agentId);
    if (!id) return [];
    const saved = readStrategies(targetStorage)[id];
    const accounts = saved?.accounts && typeof saved.accounts === "object" ? saved.accounts : {};
    return Object.entries(accounts).map(([accountId, value]) => ({
      id: accountId,
      name: String(value?.accountName || accountId).trim()
    }));
  }

  function clear(agentId) {
    const id = normalizeAgentId(agentId);
    if (!id) return;
    const strategies = readStrategies(targetStorage);
    delete strategies[id];
    writeStrategies(targetStorage, strategies);
  }

  return { get, save, listAccounts, clear, key: STORAGE_KEY };
}

export const inboxStrategyStore = createInboxStrategyStore();
