const CONFIGURED_RECEPTION_ACCOUNTS_KEY = "salebuddy:account-reception-configured:v1";
const FALLBACK_VALUES = new Map();

function storage() {
  const value = globalThis.localStorage;
  return value && typeof value.getItem === "function" && typeof value.setItem === "function"
    ? value
    : {
      getItem(key) { return FALLBACK_VALUES.has(key) ? FALLBACK_VALUES.get(key) : null; },
      setItem(key, next) { FALLBACK_VALUES.set(key, String(next)); }
    };
}

function ids() {
  try {
    const value = JSON.parse(storage().getItem(CONFIGURED_RECEPTION_ACCOUNTS_KEY) || "[]");
    return new Set(Array.isArray(value) ? value.map(item => String(item || "").trim()).filter(Boolean) : []);
  } catch {
    return new Set();
  }
}

function identityIds(value) {
  if (!value || typeof value !== "object") return [value];
  const identity = value.identity || {};
  return [value.id, value.accountId, identity.user_id, identity.uid, identity.sec_uid, identity.secUid, identity.sec_id, identity.secId];
}

export function markReceptionConfigured(values = []) {
  const configured = ids();
  (Array.isArray(values) ? values : [values])
    .flatMap(identityIds)
    .map(value => String(value || "").trim())
    .filter(Boolean)
    .forEach(value => configured.add(value));
  try { storage().setItem(CONFIGURED_RECEPTION_ACCOUNTS_KEY, JSON.stringify([...configured])); } catch {
    // The backend remains canonical; this marker only scopes the local strategy directory.
  }
}

export function isReceptionConfigured(value = null) {
  const configured = ids();
  return identityIds(value).some(item => configured.has(String(item || "").trim()));
}
