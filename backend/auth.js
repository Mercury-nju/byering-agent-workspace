import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Small, dependency-free control-plane authenticator.
 *
 * Production deployments should provide one tenant-scoped API key per
 * customer. Local development remains anonymous when no key is configured.
 */
export class ControlPlaneAuthError extends Error {
  constructor(message, { code = "CONTROL_PLANE_AUTH_ERROR", statusCode = 401, details = {} } = {}) {
    super(message);
    this.name = "ControlPlaneAuthError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

const DEFAULT_PUBLIC_PATHS = new Set([
  "/healthz",
  "/v1/connectors/cluehunter/events"
]);

export function createControlPlaneAuth(options = {}) {
  const source = options && typeof options === "object" ? options : {};
  const entries = normalizeApiKeys(
    source.apiKeys ?? process.env.BYERING_CONTROL_PLANE_API_KEYS ?? process.env.BYERING_CONTROL_PLANE_API_KEY,
    source.defaultTenantId ?? process.env.BYERING_CONTROL_PLANE_TENANT_ID ?? null
  );
  const authRequired = source.authRequired != null
    ? Boolean(source.authRequired)
    : parseBoolean(process.env.BYERING_CONTROL_PLANE_AUTH_REQUIRED, false) || entries.length > 0;
  const publicPaths = new Set([
    ...DEFAULT_PUBLIC_PATHS,
    ...(Array.isArray(source.publicPaths) ? source.publicPaths.map(String) : [])
  ]);
  const headerNames = Array.isArray(source.headerNames) && source.headerNames.length
    ? source.headerNames.map((value) => String(value).toLowerCase())
    : ["authorization", "x-api-key", "x-byering-api-key"];
  const configError = source.configError
    || (authRequired && !entries.length
      ? new ControlPlaneAuthError("控制面认证已启用，但没有配置 API key", {
        code: "CONTROL_PLANE_AUTH_NOT_CONFIGURED",
        statusCode: 503
      })
      : authRequired && entries.some((entry) => !entry.tenantId)
        ? new ControlPlaneAuthError("控制面 API key 必须绑定 tenantId", {
          code: "CONTROL_PLANE_TENANT_MAPPING_REQUIRED",
          statusCode: 503
        })
        : null);

  return Object.freeze({
    enabled: authRequired,
    tenantScoped: entries.every((entry) => Boolean(entry.tenantId)),
    authenticate(request, { path = request?.url || "/" } = {}) {
      if (isPublicPath(path, publicPaths)) return anonymousPrincipal();
      if (!authRequired) return anonymousPrincipal();
      if (configError) throw configError;
      const presented = readPresentedKeys(request?.headers || {}, headerNames);
      if (!presented.length) {
        throw new ControlPlaneAuthError("控制面请求需要 API key", {
          code: "CONTROL_PLANE_AUTH_REQUIRED",
          statusCode: 401
        });
      }
      const unmatched = presented.some((key) => !entries.some((entry) => safeEqual(key, entry.key)));
      if (unmatched) {
        throw new ControlPlaneAuthError("控制面请求包含无效的 API key", {
          code: "CONTROL_PLANE_AUTH_INVALID",
          statusCode: 401
        });
      }
      const match = entries.find((entry) => presented.some((key) => safeEqual(key, entry.key)));
      if (!match) {
        throw new ControlPlaneAuthError("控制面 API key 无效", {
          code: "CONTROL_PLANE_AUTH_INVALID",
          statusCode: 401
        });
      }
      // Multiple credentials are only accepted when they resolve to the same
      // principal; this prevents header smuggling and ambiguous tenant scope.
      const matchingEntries = entries.filter((entry) => presented.some((key) => safeEqual(key, entry.key)));
      if (matchingEntries.some((entry) => entry.tenantId !== match.tenantId)) {
        throw new ControlPlaneAuthError("控制面请求包含冲突的 API key", {
          code: "CONTROL_PLANE_AUTH_AMBIGUOUS",
          statusCode: 401
        });
      }
      return Object.freeze({
        authenticated: true,
        tenantId: match.tenantId,
        keyId: match.keyId,
        scopes: [...match.scopes]
      });
    }
  });
}

function normalizeApiKeys(value, defaultTenantId) {
  if (!value) return [];
  const entries = [];
  if (value instanceof Map) {
    for (const [tenantId, key] of value.entries()) pushEntry(entries, { tenantId, key });
  } else if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "string") pushEntry(entries, parseEntry(item, defaultTenantId));
      else if (item && typeof item === "object") pushEntry(entries, item);
    }
  } else if (typeof value === "object") {
    for (const [tenantId, key] of Object.entries(value)) pushEntry(entries, { tenantId, key });
  } else if (typeof value === "string") {
    const raw = value.trim();
    if (raw.startsWith("{")) {
      try {
        const parsed = JSON.parse(raw);
        return normalizeApiKeys(parsed, defaultTenantId);
      } catch {
        // Keep a malformed production value fail-closed instead of treating it
        // as a credential with surprising semantics.
        return [];
      }
    }
    for (const item of raw.split(",")) pushEntry(entries, parseEntry(item, defaultTenantId));
  }
  return entries;
}

function parseEntry(value, defaultTenantId) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const separator = raw.indexOf("=");
  if (separator > 0) {
    return { tenantId: raw.slice(0, separator).trim(), key: raw.slice(separator + 1).trim() };
  }
  return { tenantId: normalizeTenant(defaultTenantId), key: raw };
}

function pushEntry(entries, value) {
  if (!value || typeof value !== "object") return;
  const key = String(value.key ?? value.apiKey ?? value.secret ?? "").trim();
  if (!key) return;
  const tenantId = normalizeTenant(value.tenantId ?? value.tenant ?? null);
  const keyId = String(value.keyId ?? tenantId ?? `key-${entries.length + 1}`).trim();
  const scopes = Array.isArray(value.scopes) ? [...new Set(value.scopes.map(String).filter(Boolean))] : [];
  entries.push({ tenantId, key, keyId, scopes });
}

function normalizeTenant(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function parseBoolean(value, fallback) {
  if (value == null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function readPresentedKeys(headers, headerNames) {
  const values = [];
  for (const name of headerNames) {
    const raw = headers[name] ?? headers[name.toLowerCase()];
    if (raw == null) continue;
    const list = Array.isArray(raw) ? raw : [raw];
    for (const item of list) {
      const value = String(item).trim();
      if (!value) continue;
      if (name === "authorization") {
        const match = value.match(/^Bearer\s+(.+)$/i);
        if (!match) continue;
        values.push(match[1].trim());
      } else {
        values.push(value);
      }
    }
  }
  return [...new Set(values)];
}

function safeEqual(left, right) {
  const leftHash = createHash("sha256").update(String(left)).digest();
  const rightHash = createHash("sha256").update(String(right)).digest();
  return timingSafeEqual(leftHash, rightHash);
}

function isPublicPath(path, publicPaths) {
  const pathname = String(path || "/").split("?", 1)[0];
  return publicPaths.has(pathname);
}

function anonymousPrincipal() {
  return Object.freeze({ authenticated: false, tenantId: null, keyId: null, scopes: [] });
}
