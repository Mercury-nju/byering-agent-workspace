const DEFAULT_PATHS = Object.freeze({
  apply: "/api/cloud/desktop/apply",
  status: "/api/cloud/desktop/applyStatus",
  startJob: "/self/rpa/startJob"
});

export const CLOUD_DESKTOP_APPLY_STATUS = Object.freeze({
  INIT: 0,
  APPLYING: 1,
  FAILED: 2,
  READY: 3
});

export class ClueHunterCloudError extends Error {
  constructor(message, { code = "CLUEHUNTER_CLOUD_ERROR", statusCode = 502, details = {} } = {}) {
    super(message);
    this.name = "ClueHunterCloudError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value, field) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new ClueHunterCloudError(`${field} must be a positive integer`, {
      code: "CLOUD_DESKTOP_ID_INVALID",
      statusCode: 400,
      details: { field }
    });
  }
  return number;
}

function joinUrl(baseUrl, path) {
  try {
    return new URL(path, baseUrl).toString();
  } catch {
    throw new ClueHunterCloudError("ClueHunter cloud base URL is invalid", {
      code: "CLOUD_DESKTOP_CONFIG_INVALID",
      statusCode: 503,
      details: { field: "BYERING_CLUEHUNTER_BASE_URL" }
    });
  }
}

function readConfig(env = process.env) {
  const source = env && typeof env === "object" ? env : {};
  const baseUrl = nonEmpty(source.BYERING_CLUEHUNTER_BASE_URL);
  const authToken = nonEmpty(source.BYERING_CLUEHUNTER_AUTH_TOKEN);
  const tenantId = source.BYERING_CLUEHUNTER_TENANT_ID || source.BYERING_CLUEHUNTER_CLOUD_TENANT_ID;
  const uid = source.BYERING_CLUEHUNTER_UID || source.BYERING_CLUEHUNTER_CLOUD_UID;
  const regionId = nonEmpty(source.BYERING_CLUEHUNTER_REGION_ID || source.BYERING_CLOUD_REGION_ID);
  return {
    baseUrl,
    authToken,
    tenantId: tenantId == null || tenantId === "" ? null : numberValue(tenantId, "tenant"),
    uid: uid == null || uid === "" ? null : numberValue(uid, "uid"),
    regionId,
    robotInfoId: source.BYERING_CLUEHUNTER_ROBOT_INFO_ID
      ? numberValue(source.BYERING_CLUEHUNTER_ROBOT_INFO_ID, "robotInfoId")
      : null,
    paths: {
      apply: nonEmpty(source.BYERING_CLUEHUNTER_CLOUD_APPLY_PATH) || DEFAULT_PATHS.apply,
      status: nonEmpty(source.BYERING_CLUEHUNTER_CLOUD_STATUS_PATH) || DEFAULT_PATHS.status,
      startJob: nonEmpty(source.BYERING_CLUEHUNTER_RPA_START_JOB_PATH) || DEFAULT_PATHS.startJob
    },
    startJobMethod: ["GET", "POST"].includes(String(source.BYERING_CLUEHUNTER_RPA_START_JOB_METHOD || "GET").trim().toUpperCase())
      ? String(source.BYERING_CLUEHUNTER_RPA_START_JOB_METHOD || "GET").trim().toUpperCase()
      : "GET",
    timeoutMs: Math.max(1000, Number(source.BYERING_CLUEHUNTER_CLOUD_TIMEOUT_MS) || 15000),
    pollIntervalMs: Math.max(250, Number(source.BYERING_CLUEHUNTER_CLOUD_POLL_INTERVAL_MS) || 2000),
    waitTimeoutMs: Math.max(1000, Number(source.BYERING_CLUEHUNTER_CLOUD_WAIT_TIMEOUT_MS) || 120000)
  };
}

function safeDetails(value) {
  if (!value || typeof value !== "object") return {};
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    if (/token|secret|password|cookie|authorization/i.test(key)) continue;
    if (["data", "entity", "result"].includes(key) && item && typeof item === "object") {
      output[key] = safeDetails(item);
    } else if (["string", "number", "boolean"].includes(typeof item) || item == null) {
      output[key] = item;
    }
  }
  return output;
}

function unwrap(body) {
  if (body == null) throw new ClueHunterCloudError("ClueHunter cloud response is empty", { code: "CLOUD_DESKTOP_RESPONSE_EMPTY" });
  if (body.success === false || body.code === false) {
    throw new ClueHunterCloudError(body.msg || body.message || "ClueHunter cloud request rejected", {
      code: "CLOUD_DESKTOP_UPSTREAM_REJECTED",
      details: safeDetails(body)
    });
  }
  if (typeof body.code === "number" && ![0, 200].includes(body.code)) {
    throw new ClueHunterCloudError(body.msg || body.message || "ClueHunter cloud request rejected", {
      code: "CLOUD_DESKTOP_UPSTREAM_REJECTED",
      details: safeDetails(body)
    });
  }
  return Object.hasOwn(body, "data") ? body.data : Object.hasOwn(body, "entity") ? body.entity : body;
}

function isAlreadyApplied(error) {
  return /已经申请|already\s*(?:applied|exists)|apply.?success/i.test(String(error?.message || ""));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createClueHunterCloudService({
  env = process.env,
  fetchImpl = globalThis.fetch,
  sleepImpl = sleep,
  now = () => new Date().toISOString()
} = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("ClueHunter cloud service requires fetch");
  const config = readConfig(env);
  const configured = Boolean(config.baseUrl && config.authToken && config.tenantId && config.uid && config.regionId);
  const missing = [
    ["BYERING_CLUEHUNTER_BASE_URL", config.baseUrl],
    ["BYERING_CLUEHUNTER_AUTH_TOKEN", config.authToken],
    ["BYERING_CLUEHUNTER_TENANT_ID", config.tenantId],
    ["BYERING_CLUEHUNTER_UID", config.uid],
    ["BYERING_CLUEHUNTER_REGION_ID", config.regionId]
  ].filter(([, value]) => !value).map(([key]) => key);
  const locks = new Map();

  function assertConfigured() {
    if (!configured) {
      throw new ClueHunterCloudError("ClueHunter cloud desktop is not configured", {
        code: "CLOUD_DESKTOP_NOT_CONFIGURED",
        statusCode: 503,
        details: { required: missing }
      });
    }
  }

  async function request(path, body, { method = "POST" } = {}) {
    assertConfigured();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const headers = {
        authorization: `Bearer ${config.authToken}`
      };
      const init = {
        method,
        headers,
        signal: controller.signal
      };
      if (method !== "GET" && method !== "HEAD") {
        headers["content-type"] = "application/json";
        init.body = JSON.stringify(body ?? {});
      }
      const response = await fetchImpl(joinUrl(config.baseUrl, path), init);
      const text = await response.text();
      let parsed;
      try { parsed = text ? JSON.parse(text) : null; } catch {
        throw new ClueHunterCloudError("ClueHunter cloud response is not JSON", {
          code: "CLOUD_DESKTOP_RESPONSE_INVALID",
          details: { status: response.status }
        });
      }
      if (!response.ok) {
        const cause = new ClueHunterCloudError(parsed?.msg || parsed?.message || `HTTP ${response.status}`, {
          code: "CLOUD_DESKTOP_UPSTREAM_HTTP_ERROR",
          statusCode: response.status >= 500 ? 503 : 502,
          details: { status: response.status, upstream: safeDetails(parsed) }
        });
        throw cause;
      }
      return unwrap(parsed);
    } catch (error) {
      if (error instanceof ClueHunterCloudError) throw error;
      throw new ClueHunterCloudError(error?.name === "AbortError" ? "ClueHunter cloud request timed out" : "ClueHunter cloud request failed", {
        code: error?.name === "AbortError" ? "CLOUD_DESKTOP_TIMEOUT" : "CLOUD_DESKTOP_UNAVAILABLE",
        statusCode: 503,
        details: { reason: error?.message || String(error) }
      });
    } finally {
      clearTimeout(timer);
    }
  }

  function identity(input = {}) {
    assertConfigured();
    const tenant = input.tenant == null ? config.tenantId : numberValue(input.tenant, "tenant");
    const uid = input.uid == null ? config.uid : numberValue(input.uid, "uid");
    const regionId = nonEmpty(input.regionId) || config.regionId;
    if (!regionId) throw new ClueHunterCloudError("regionId is required", { code: "CLOUD_DESKTOP_REGION_REQUIRED", statusCode: 400 });
    return {
      uid,
      tenant,
      regionId,
      robotInfoId: input.robotInfoId == null ? config.robotInfoId : numberValue(input.robotInfoId, "robotInfoId")
    };
  }

  async function apply(input = {}) {
    const id = identity(input);
    try {
      await request(config.paths.apply, id);
    } catch (error) {
      if (!isAlreadyApplied(error)) throw error;
    }
    return { accepted: true, ...id, idempotent: true, requestedAt: now() };
  }

  async function status(input = {}) {
    const id = identity(input);
    const data = await request(config.paths.status, id);
    const value = data?.status ?? data?.applyStatus ?? data?.aliCloudDesktopApplyStatus ?? data;
    const statusCode = Number(value);
    if (!Number.isInteger(statusCode) || statusCode < 0 || statusCode > 5) {
      throw new ClueHunterCloudError("ClueHunter cloud status is invalid", {
        code: "CLOUD_DESKTOP_STATUS_INVALID",
        details: { status: safeDetails(data) }
      });
    }
    return { ...id, status: statusCode, ready: statusCode === CLOUD_DESKTOP_APPLY_STATUS.READY, checkedAt: now() };
  }

  async function ensureReady(input = {}) {
    const id = identity(input);
    const key = `${id.tenant}:${id.uid}`;
    const pending = locks.get(key);
    if (pending) return pending;
    const operation = (async () => {
      await apply(id);
      const deadline = Date.now() + (Number(input.waitTimeoutMs) || config.waitTimeoutMs);
      let last = null;
      while (Date.now() <= deadline) {
        last = await status(id);
        if (last.status === CLOUD_DESKTOP_APPLY_STATUS.READY) return { ...last, provisioned: true };
        if (last.status === CLOUD_DESKTOP_APPLY_STATUS.FAILED) {
          throw new ClueHunterCloudError("ClueHunter cloud desktop application failed", {
            code: "CLOUD_DESKTOP_APPLY_FAILED",
            statusCode: 503,
            details: { status: last.status }
          });
        }
        await sleepImpl(Number(input.pollIntervalMs) || config.pollIntervalMs);
      }
      throw new ClueHunterCloudError("ClueHunter cloud desktop is still provisioning", {
        code: "CLOUD_DESKTOP_PROVISIONING",
        statusCode: 202,
        details: { lastStatus: last?.status ?? null, retryAfterMs: config.pollIntervalMs }
      });
    })();
    locks.set(key, operation);
    try { return await operation; } finally { if (locks.get(key) === operation) locks.delete(key); }
  }

  async function startJob(input = {}) {
    const data = await request(config.paths.startJob, identity(input), { method: config.startJobMethod });
    if (data === true) return { accepted: true, started: true, requestedAt: now() };
    if (data && typeof data === "object" && (
      data.accepted === true || data.started === true || data.success === true || data.ok === true
    )) {
      return { ...data, accepted: true, started: true, requestedAt: now() };
    }
    throw new ClueHunterCloudError("ClueHunter RPA start response is ambiguous", {
      code: "RPA_START_RESPONSE_INVALID",
      statusCode: 502,
      details: { response: safeDetails(data) }
    });
  }

  async function connect(input = {}) {
    const id = identity(input);
    const key = `${id.tenant}:${id.uid}:connect`;
    const pending = locks.get(key);
    if (pending) return pending;
    const operation = (async () => {
      const cloudDesktop = await ensureReady(id);
      const rpa = await startJob(id);
      return {
        accepted: true,
        connected: true,
        cloudDesktop,
        rpa,
        connectedAt: now()
      };
    })();
    locks.set(key, operation);
    try { return await operation; } finally { if (locks.get(key) === operation) locks.delete(key); }
  }

  return Object.freeze({
    configured,
    kind: "cluehunter-cloud",
    missing,
    config: Object.freeze({ ...config, authToken: undefined }),
    apply,
    status,
    ensureReady,
    startJob,
    connect
  });
}
