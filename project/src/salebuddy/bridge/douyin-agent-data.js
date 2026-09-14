/**
 * REST client for the account-oriented Douyin Agent Data API.
 *
 * This service is intentionally separate from the douyin-data MCP client:
 * it exposes account, video, live-room, and industry context primitives but
 * does not provide comment collection, browser automation, or outreach.
 */

const DEFAULT_URL = "http://118.196.140.64:8080";
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_RETRY_ATTEMPTS = 4;
const DEFAULT_RETRY_DELAY_MS = 1_000;
const SECRET_KEY = /(?:authorization|(?:access|refresh)?[_-]?token|password|passwd|cookie|secret|csrf|jwt|api[-_]?key)/i;

export class DouyinAgentDataError extends Error {
  constructor(message, { code = "DOUYIN_AGENT_DATA_ERROR", statusCode = 502, details = {} } = {}) {
    super(message);
    this.name = "DouyinAgentDataError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = redact(details);
  }
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !SECRET_KEY.test(key) && key !== "cause")
    .map(([key, child]) => [key, redact(child)]));
}

function normalizeUrl(value) {
  const source = nonEmpty(value);
  if (!source) return null;
  try {
    const url = new URL(source);
    if (!/^https?:$/.test(url.protocol)) throw new Error("Only HTTP(S) is supported");
    return url.toString().replace(/\/$/, "");
  } catch (error) {
    throw new DouyinAgentDataError("Douyin Agent Data API URL is invalid", {
      code: "DOUYIN_AGENT_DATA_CONFIG_INVALID",
      statusCode: 503,
      details: { field: "url", cause: error.message }
    });
  }
}

function normalizeTimeout(value, fallback = DEFAULT_TIMEOUT_MS) {
  const timeout = Number(value);
  return Number.isInteger(timeout) && timeout >= 100 && timeout <= 10 * 60 * 1000 ? timeout : fallback;
}

function timeoutSignal(timeoutMs, externalSignal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();
  const abort = () => controller.abort();
  externalSignal?.addEventListener?.("abort", abort, { once: true });
  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timer);
      externalSignal?.removeEventListener?.("abort", abort);
    }
  };
}

function queryValue(value) {
  if (value == null || value === "") return null;
  if (typeof value === "boolean") return String(value);
  return String(value);
}

function appendQuery(url, query = {}) {
  const next = new URL(url);
  for (const [key, value] of Object.entries(query)) {
    const normalized = queryValue(value);
    if (normalized != null) next.searchParams.set(key, normalized);
  }
  return next.toString();
}

async function parsePayload(response) {
  const raw = await response.text();
  if (!raw.trim()) return null;
  try { return JSON.parse(raw); } catch {
    throw new DouyinAgentDataError("Douyin Agent Data API returned invalid JSON", {
      code: "DOUYIN_AGENT_DATA_RESPONSE_INVALID",
      statusCode: 502
    });
  }
}

function apiError(payload, status) {
  const code = payload?.code;
  const failed = !payload || (code != null && Number(code) !== 0 && Number(code) !== 200);
  if (!failed && status >= 200 && status < 300) return null;
  return new DouyinAgentDataError(payload?.msg || `Douyin Agent Data API returned HTTP ${status}`, {
    code: `DOUYIN_AGENT_DATA_${String(payload?.code || (status >= 500 ? "UPSTREAM_ERROR" : "REQUEST_FAILED"))
      .replace(/[^A-Z0-9_]+/gi, "_").toUpperCase()}`,
    statusCode: status >= 500 ? 502 : status === 404 ? 404 : 400,
    details: { status, responseCode: payload?.code, response: payload }
  });
}

function dataFrom(payload) {
  if (isRecord(payload) && Object.prototype.hasOwnProperty.call(payload, "data")) return clone(payload.data);
  return clone(payload);
}

function retryableError(error) {
  if (!(error instanceof DouyinAgentDataError)) return true;
  if (error.code === "DOUYIN_AGENT_DATA_1003") return true;
  return ["DOUYIN_AGENT_DATA_TIMEOUT", "DOUYIN_AGENT_DATA_UNAVAILABLE", "DOUYIN_AGENT_DATA_UPSTREAM_ERROR"].includes(error.code)
    || error.statusCode >= 500;
}

function retryDelay(error, attempt, configuredDelay) {
  if (Number.isFinite(configuredDelay)) return Math.max(0, configuredDelay) * attempt;
  const seconds = String(error?.message || "").match(/retry after\s+(\d+(?:\.\d+)?)s/i);
  return seconds ? Math.ceil(Number(seconds[1]) * 1_000) : DEFAULT_RETRY_DELAY_MS * attempt;
}

function wait(ms) {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

function requireText(value, field) {
  const text = nonEmpty(value);
  if (!text) throw new DouyinAgentDataError(`${field} is required`, {
    code: "DOUYIN_AGENT_DATA_INPUT_INVALID",
    statusCode: 400,
    details: { field }
  });
  return text;
}

export function douyinAgentDataConfiguration(env = process.env) {
  return {
    url: nonEmpty(env?.BYERING_DOUYIN_AGENT_DATA_API_URL) || DEFAULT_URL,
    apiKeyConfigured: Boolean(nonEmpty(env?.BYERING_DOUYIN_AGENT_DATA_API_KEY)),
    timeoutMs: normalizeTimeout(env?.BYERING_DOUYIN_AGENT_DATA_TIMEOUT_MS)
  };
}

export function createDouyinAgentDataClient({
  url = nonEmpty(process.env.BYERING_DOUYIN_AGENT_DATA_API_URL) || DEFAULT_URL,
  apiKey = nonEmpty(process.env.BYERING_DOUYIN_AGENT_DATA_API_KEY),
  timeoutMs = normalizeTimeout(process.env.BYERING_DOUYIN_AGENT_DATA_TIMEOUT_MS),
  fetchImpl = globalThis.fetch,
  requestRetryAttempts = DEFAULT_RETRY_ATTEMPTS,
  requestRetryDelayMs
} = {}) {
  const normalizedUrl = normalizeUrl(url);
  if (normalizedUrl && typeof fetchImpl !== "function") {
    throw new DouyinAgentDataError("A fetch implementation is required", {
      code: "DOUYIN_AGENT_DATA_CONFIG_INVALID",
      statusCode: 503
    });
  }
  const configuredTimeout = normalizeTimeout(timeoutMs);
  const configuredApiKey = nonEmpty(apiKey);

  async function request(path, query = {}, { timeout = configuredTimeout, signal } = {}) {
    if (!normalizedUrl) throw new DouyinAgentDataError("Douyin Agent Data API is not configured", {
      code: "DOUYIN_AGENT_DATA_NOT_CONFIGURED",
      statusCode: 503
    });
    const attempts = Math.min(6, Math.max(1, Number(requestRetryAttempts) || DEFAULT_RETRY_ATTEMPTS));
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const timed = timeoutSignal(normalizeTimeout(timeout), signal);
      try {
        const response = await fetchImpl(appendQuery(`${normalizedUrl}${path}`, query), {
          method: "GET",
          headers: {
            accept: "application/json",
            ...(configuredApiKey ? { "x-api-key": configuredApiKey } : {})
          },
          signal: timed.signal
        });
        const payload = await parsePayload(response);
        const error = apiError(payload, response.status);
        if (error) throw error;
        return dataFrom(payload);
      } catch (caught) {
        const error = caught instanceof DouyinAgentDataError
          ? caught
          : caught?.name === "AbortError"
            ? new DouyinAgentDataError("Douyin Agent Data API request timed out", {
              code: "DOUYIN_AGENT_DATA_TIMEOUT",
              statusCode: 504,
              details: { path }
            })
            : new DouyinAgentDataError("Douyin Agent Data API is unavailable", {
              code: "DOUYIN_AGENT_DATA_UNAVAILABLE",
              statusCode: 503,
              details: { path, cause: caught?.code || caught?.message || "unknown" }
            });
        if (attempt >= attempts || !retryableError(error)) throw error;
        await wait(retryDelay(error, attempt, Number(requestRetryDelayMs)));
      } finally {
        timed.cleanup();
      }
    }
    throw new DouyinAgentDataError("Douyin Agent Data API request failed", { details: { path } });
  }

  const client = {
    kind: "douyin-agent-data",
    configured: Boolean(normalizedUrl),
    url: normalizedUrl,
    apiKeyConfigured: Boolean(configuredApiKey),
    async health(options) { return request("/health", {}, options); },
    async resolve(input, options) { return request("/v1/account/resolve", { input: requireText(input, "input") }, options); },
    async profile(secUid, { fresh = false, ...options } = {}) {
      return request("/v1/account/profile", { sec_uid: requireText(secUid, "sec_uid"), ...(fresh ? { fresh: true } : {}) }, options);
    },
    async videosLatest(secUid, { count = 20, fresh = false, ...options } = {}) {
      const normalizedCount = Math.min(20, Math.max(1, Number(count) || 20));
      return request("/v1/account/videos-latest", { sec_uid: requireText(secUid, "sec_uid"), count: normalizedCount, ...(fresh ? { fresh: true } : {}) }, options);
    },
    async videos(secUid, { cursor = "0", count = 20, since = null, fresh = false, ...options } = {}) {
      const normalizedCount = Math.min(20, Math.max(1, Number(count) || 20));
      return request("/v1/account/videos", {
        sec_uid: requireText(secUid, "sec_uid"),
        cursor: cursor == null ? "0" : String(cursor),
        count: normalizedCount,
        ...(since == null || since === "" ? {} : { since: Number(since) }),
        ...(fresh ? { fresh: true } : {})
      }, options);
    },
    async videoDetail({ awemeId, aweme_id, url, fresh = false } = {}, options = {}) {
      const id = nonEmpty(awemeId || aweme_id);
      const videoUrl = nonEmpty(url);
      if (!id && !videoUrl) throw new DouyinAgentDataError("aweme_id or url is required", {
        code: "DOUYIN_AGENT_DATA_INPUT_INVALID",
        statusCode: 400,
        details: { fields: ["aweme_id", "url"] }
      });
      return request("/v1/video/detail", { ...(id ? { aweme_id: id } : { url: videoUrl }), ...(fresh ? { fresh: true } : {}) }, options);
    },
    async liveRoom({ webRid, web_rid, roomId, room_id, secUid, sec_uid, fresh = false } = {}, options = {}) {
      const query = webRid || web_rid ? { web_rid: webRid || web_rid } : roomId || room_id ? { room_id: roomId || room_id } : { sec_uid: secUid || sec_uid };
      if (!Object.values(query)[0]) throw new DouyinAgentDataError("web_rid, room_id or sec_uid is required", {
        code: "DOUYIN_AGENT_DATA_INPUT_INVALID",
        statusCode: 400,
        details: { fields: ["web_rid", "room_id", "sec_uid"] }
      });
      return request("/v1/live/room", { ...query, ...(fresh ? { fresh: true } : {}) }, options);
    },
    async industryList(options) { return request("/v1/industry/list", {}, options); },
    async hotwords(industry, { category, window, limit, ...options } = {}) {
      return request("/v1/industry/hotwords", { industry: requireText(industry, "industry"), category, window, limit }, options);
    }
  };
  return Object.freeze(client);
}

export { DEFAULT_URL as DOUYIN_AGENT_DATA_DEFAULT_URL };
