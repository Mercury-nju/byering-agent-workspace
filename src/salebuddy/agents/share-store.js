/**
 * Share links are records, not fabricated URLs. The store is local by default
 * and accepts a storage adapter so the same contract can be backed by Gateway.
 */

const STORAGE_KEY = "salebuddy.shares.v1";
const memoryStorage = new Map();

function storageGet(storage, key) {
  if (storage?.getItem) return storage.getItem(key);
  return memoryStorage.get(key) || null;
}

function storageSet(storage, key, value) {
  if (storage?.setItem) storage.setItem(key, value);
  else memoryStorage.set(key, value);
}

function readShares(storage) {
  try {
    const value = JSON.parse(storageGet(storage, STORAGE_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}

function writeShares(storage, shares) {
  storageSet(storage, STORAGE_KEY, JSON.stringify(shares.slice(0, 200)));
}

function token() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID().replaceAll("-", "");
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`;
}

export function createShareStore({ storage = globalThis.localStorage, origin = globalThis.location?.origin || "" } = {}) {
  return {
    create({ materialId, title, ownerId = "local-user", permission = "viewer", expiresInMs = 7 * 24 * 60 * 60 * 1000 } = {}) {
      if (!materialId) throw new TypeError("materialId is required");
      if (!["viewer", "commenter", "editor"].includes(permission)) throw new TypeError("unknown share permission");
      const now = Date.now();
      const record = {
        id: `share-${token()}`,
        token: token(),
        materialId,
        title: title || "未命名物料",
        ownerId,
        permission,
        createdAt: new Date(now).toISOString(),
        expiresAt: expiresInMs == null ? null : new Date(now + Math.max(0, Number(expiresInMs))).toISOString()
      };
      const shares = readShares(storage).filter((item) => item.materialId !== materialId || item.ownerId !== ownerId);
      shares.unshift(record);
      writeShares(storage, shares);
      return { ...record, url: `${origin || ""}/share/${record.token}` };
    },
    getByToken(shareToken) {
      const record = readShares(storage).find((item) => item.token === shareToken);
      if (!record) return null;
      if (record.expiresAt && Date.parse(record.expiresAt) <= Date.now()) return { ...record, expired: true };
      return { ...record, expired: false, url: `${origin || ""}/share/${record.token}` };
    },
    canAccess(shareToken, { userId = "anonymous", required = "viewer" } = {}) {
      const record = this.getByToken(shareToken);
      if (!record || record.expired) return false;
      if (record.ownerId === userId) return true;
      const levels = { viewer: 1, commenter: 2, editor: 3 };
      return levels[record.permission] >= (levels[required] || 1);
    },
    list(ownerId = "local-user") { return readShares(storage).filter((item) => item.ownerId === ownerId); }
  };
}
