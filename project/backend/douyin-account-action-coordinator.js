export function createDouyinAccountActionCoordinator() {
  const accounts = new Map();
  const outreachTasks = new Map();
  let sequence = 0;

  function accountFor(key) {
    const existing = accounts.get(key);
    if (existing) return existing;
    const account = { active: null, queue: [], outreachTasks: new Map() };
    accounts.set(key, account);
    return account;
  }

  function run(accountKey, kind, operation, metadata = {}) {
    if (typeof operation !== "function") throw new TypeError("operation must be a function");
    const key = normalizeKey(accountKey);
    if (!key) return Promise.resolve().then(operation);
    const account = accountFor(key);
    return new Promise((resolve, reject) => {
      account.queue.push({
        kind,
        priority: kind === "outreach" ? 100 : 10,
        sequence: sequence += 1,
        operation,
        metadata,
        resolve,
        reject
      });
      drain(key, account);
    });
  }

  function drain(key, account) {
    if (account.active || account.queue.length === 0) return;
    account.queue.sort((left, right) => right.priority - left.priority || left.sequence - right.sequence);
    const nextIndex = account.outreachTasks.size > 0
      ? account.queue.findIndex((item) => item.kind === "outreach")
      : 0;
    if (nextIndex < 0) return;
    const [next] = account.queue.splice(nextIndex, 1);
    account.active = next;
    Promise.resolve()
      .then(next.operation)
      .then(next.resolve, next.reject)
      .finally(() => {
        account.active = null;
        if (account.queue.length === 0 && account.outreachTasks.size === 0) accounts.delete(key);
        else drain(key, account);
      });
  }

  function beginOutreach(accountKey, taskId, { ttlMs = 2 * 60 * 60 * 1000, ...metadata } = {}) {
    const key = normalizeKey(accountKey);
    const id = normalizeKey(taskId);
    if (!key) throw new TypeError("accountKey is required");
    if (!id) throw new TypeError("taskId is required");
    const existing = outreachTasks.get(id);
    if (existing && existing.accountKey !== key) {
      throw Object.assign(new Error("outreach task is already assigned to another account"), {
        code: "DOUYIN_OUTREACH_TASK_ACCOUNT_CONFLICT"
      });
    }
    if (existing) clearTimeout(existing.timer);
    const duration = boundedTtl(ttlMs);
    const account = accountFor(key);
    const reservation = {
      taskId: id,
      accountKey: key,
      metadata,
      expiresAt: Date.now() + duration,
      timer: null
    };
    reservation.timer = setTimeout(() => endOutreach(id), duration);
    reservation.timer.unref?.();
    account.outreachTasks.set(id, reservation);
    outreachTasks.set(id, reservation);
    return status(key);
  }

  function endOutreach(taskId) {
    const id = normalizeKey(taskId);
    const reservation = outreachTasks.get(id);
    if (!reservation) return false;
    clearTimeout(reservation.timer);
    outreachTasks.delete(id);
    const account = accounts.get(reservation.accountKey);
    account?.outreachTasks.delete(id);
    if (account) {
      if (!account.active && account.queue.length) drain(reservation.accountKey, account);
      if (!account.active && account.queue.length === 0 && account.outreachTasks.size === 0) accounts.delete(reservation.accountKey);
    }
    return true;
  }

  function touchOutreach(taskId, options = {}) {
    const reservation = outreachTasks.get(normalizeKey(taskId));
    return reservation
      ? beginOutreach(reservation.accountKey, reservation.taskId, { ...reservation.metadata, ...options })
      : null;
  }

  function status(accountKey) {
    const account = accounts.get(normalizeKey(accountKey));
    return {
      active: account?.active?.kind || null,
      queuedOutreach: account?.queue.filter((item) => item.kind === "outreach").length || 0,
      queuedInbox: account?.queue.filter((item) => item.kind === "inbox").length || 0,
      outreachTaskCount: account?.outreachTasks.size || 0
    };
  }

  return {
    runOutreach: (accountKey, operation, metadata) => run(accountKey, "outreach", operation, metadata),
    runInbox: (accountKey, operation, metadata) => run(accountKey, "inbox", operation, metadata),
    beginOutreach,
    endOutreach,
    touchOutreach,
    status
  };
}

export function douyinAccountCoordinationKey(identity, fallback = "") {
  const source = identity && typeof identity === "object" && !Array.isArray(identity) ? identity : {};
  const nested = source.identity && typeof source.identity === "object" && !Array.isArray(source.identity)
    ? source.identity
    : {};
  const secId = firstText(source.sec_uid, source.secUid, source.sec_id, source.secId, nested.sec_uid, nested.secUid, nested.sec_id, nested.secId);
  if (secId) return `douyin:sec:${secId}`;
  const uid = firstText(source.uid, nested.uid);
  if (uid) return `douyin:uid:${uid}`;
  const uniqueId = firstText(source.unique_id, source.uniqueId, nested.unique_id, nested.uniqueId);
  if (uniqueId) return `douyin:unique:${uniqueId}`;
  const profileUrl = firstText(source.profile_url, source.profileUrl, nested.profile_url, nested.profileUrl);
  if (profileUrl) return `douyin:profile:${profileUrl}`;
  const fallbackKey = normalizeKey(fallback);
  return fallbackKey ? `douyin:fallback:${fallbackKey}` : "";
}

function normalizeKey(value) {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function firstText(...values) {
  for (const value of values) {
    const text = normalizeKey(value);
    if (text) return text;
  }
  return "";
}

function boundedTtl(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 24 * 60 * 60 * 1000) : 2 * 60 * 60 * 1000;
}
