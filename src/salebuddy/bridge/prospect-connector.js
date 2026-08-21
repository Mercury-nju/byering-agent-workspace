/**
 * HTTP boundary for public-source prospect discovery.
 *
 * The connector deliberately knows the SpiderApi wire contract only. It does
 * not score leads, persist task state, or perform any account action. Those
 * concerns stay in the prospect service and the control plane respectively.
 */

const DEFAULT_PATHS = Object.freeze({
  videoList: "/api/v1/douyin/video-list",
  comments: "/api/v1/douyin/comments",
  search: "/api/v1/douyin/search"
});

const SECRET_KEY = /(?:authorization|(?:access|refresh)?[_-]?token|password|passwd|cookie|secret|csrf|jwt)/i;

export class ProspectConnectorError extends Error {
  constructor(message, { code = "PROSPECT_CONNECTOR_ERROR", statusCode = 502, details = {} } = {}) {
    super(message);
    this.name = "ProspectConnectorError";
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

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !SECRET_KEY.test(key) && key !== "cause")
    .map(([key, child]) => [key, redact(child)]));
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function normalizeBaseUrl(value) {
  const source = nonEmpty(value);
  if (!source) return null;
  try {
    const url = new URL(source);
    if (!/^https?:$/.test(url.protocol)) throw new Error("Only HTTP(S) is supported");
    return url.toString().replace(/\/$/, "");
  } catch (error) {
    throw new ProspectConnectorError("Prospect Spider base URL is invalid", {
      code: "PROSPECT_CONFIG_INVALID",
      statusCode: 503,
      details: { field: "baseUrl", cause: error.message }
    });
  }
}

function normalizePath(value, fallback) {
  const source = nonEmpty(value) || fallback;
  if (!source.startsWith("/")) {
    throw new ProspectConnectorError("Prospect Spider path must be absolute", {
      code: "PROSPECT_CONFIG_INVALID",
      statusCode: 503,
      details: { path: source }
    });
  }
  return source;
}

function bodyWithAliases(input = {}) {
  const source = isRecord(input) ? input : {};
  const output = {};
  const fields = [
    ["uid", "uid"],
    ["tenant", "tenant"],
    ["tenantId", "tenant"],
    ["platform", "platform"],
    ["lastTime", "last_time"],
    ["secId", "sec_id"],
    ["accountCode", "account_code"],
    ["callbackUrl", "callback_url"],
    ["videoIds", "video_ids"],
    ["videoUrls", "video_urls"],
    ["keywords", "keywords"],
    ["query", "query"],
    ["limit", "limit"],
    ["cursor", "cursor"]
  ];
  for (const [camel, wire] of fields) {
    if (source[camel] !== undefined && source[camel] !== null && source[camel] !== "") {
      output[wire] = clone(source[camel]);
    } else if (source[wire] !== undefined && source[wire] !== null && source[wire] !== "") {
      output[wire] = clone(source[wire]);
    }
  }
  // A custom Spider implementation may accept extra public-search fields.
  // Keep these explicit instead of forwarding arbitrary client JSON.
  if (Array.isArray(source.videoIds) && !output.video_ids) output.video_ids = clone(source.videoIds);
  if (Array.isArray(source.videoUrls) && !output.video_urls) output.video_urls = clone(source.videoUrls);
  return output;
}

function parseResponseBody(value) {
  if (value == null) return null;
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch {
    throw new ProspectConnectorError("Prospect Spider returned invalid JSON", {
      code: "PROSPECT_RESPONSE_INVALID",
      statusCode: 502
    });
  }
}

function unwrapResponse(value) {
  const body = parseResponseBody(value);
  if (!isRecord(body)) return body;
  const code = body.code;
  const successCode = code === undefined || code === null || code === 0 || code === "0" || code === 200 || code === "200";
  if (body.success === false || !successCode) {
    throw new ProspectConnectorError(body.message || body.msg || "Prospect Spider rejected the request", {
      code: "PROSPECT_UPSTREAM_REJECTED",
      statusCode: 502,
      details: { upstream: redact(body) }
    });
  }
  if (Object.hasOwn(body, "data")) return body.data;
  if (Object.hasOwn(body, "entity")) return body.entity;
  if (Object.hasOwn(body, "result")) return body.result;
  return body;
}

function responseError(response, body) {
  return new ProspectConnectorError("Prospect Spider returned an HTTP error", {
    code: "PROSPECT_UPSTREAM_HTTP_ERROR",
    statusCode: response.status >= 500 ? 502 : 400,
    details: { status: response.status, upstream: redact(body) }
  });
}

function signalFor(timeoutMs, externalSignal) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  timeout.unref?.();
  const abort = () => controller.abort();
  externalSignal?.addEventListener?.("abort", abort, { once: true });
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeout);
      externalSignal?.removeEventListener?.("abort", abort);
    }
  };
}

function readConfiguration(env = process.env) {
  const source = env && typeof env === "object" ? env : {};
  return {
    baseUrl: nonEmpty(source.BYERING_PROSPECT_SPIDER_BASE_URL)
      || nonEmpty(source.BYERING_SPIDER_BASE_URL),
    apiToken: nonEmpty(source.BYERING_PROSPECT_SPIDER_API_TOKEN)
      || nonEmpty(source.BYERING_SPIDER_API_TOKEN),
    searchEnabled: source.BYERING_PROSPECT_SEARCH_ENABLED === "1"
      || source.BYERING_PROSPECT_SEARCH_ENABLED === "true",
    callbackUrl: nonEmpty(source.BYERING_PROSPECT_CALLBACK_URL),
    timeoutMs: Number(source.BYERING_PROSPECT_SPIDER_TIMEOUT_MS || 30000),
    paths: {
      videoList: source.BYERING_PROSPECT_VIDEO_LIST_PATH,
      comments: source.BYERING_PROSPECT_COMMENTS_PATH,
      search: source.BYERING_PROSPECT_SEARCH_PATH
    }
  };
}

/**
 * Create a configured SpiderApi-style connector. No network request is made
 * until one of its methods is called.
 */
export function createProspectConnector({
  baseUrl,
  apiToken = null,
  timeoutMs = 30000,
  paths = {},
  searchEnabled = false,
  fetchImpl = globalThis.fetch
} = {}) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  if (normalizedBaseUrl && typeof fetchImpl !== "function") {
    throw new ProspectConnectorError("A fetch implementation is required", {
      code: "PROSPECT_CONFIG_INVALID",
      statusCode: 503
    });
  }
  const normalizedTimeout = Number(timeoutMs);
  if (!Number.isInteger(normalizedTimeout) || normalizedTimeout < 100 || normalizedTimeout > 10 * 60 * 1000) {
    throw new ProspectConnectorError("Prospect Spider timeout is invalid", {
      code: "PROSPECT_CONFIG_INVALID",
      statusCode: 503,
      details: { field: "timeoutMs" }
    });
  }
  const endpoints = {
    videoList: normalizePath(paths.videoList, DEFAULT_PATHS.videoList),
    comments: normalizePath(paths.comments, DEFAULT_PATHS.comments),
    search: normalizePath(paths.search, DEFAULT_PATHS.search)
  };

  async function post(operation, input = {}, { signal: externalSignal } = {}) {
    if (!normalizedBaseUrl) {
      throw new ProspectConnectorError("Prospect Spider connector is not configured", {
        code: "PROSPECT_NOT_CONFIGURED",
        statusCode: 503
      });
    }
    const path = endpoints[operation];
    if (!path) throw new ProspectConnectorError("Unsupported Prospect Spider operation", {
      code: "PROSPECT_OPERATION_INVALID",
      statusCode: 400,
      details: { operation }
    });
    const signal = signalFor(normalizedTimeout, externalSignal);
    const headers = { "content-type": "application/json", accept: "application/json" };
    if (apiToken) headers.authorization = `Bearer ${apiToken}`;
    try {
      const response = await fetchImpl(new URL(path, `${normalizedBaseUrl}/`), {
        method: "POST",
        headers,
        body: JSON.stringify(bodyWithAliases(input)),
        signal: signal.signal
      });
      const raw = await response.text();
      const parsed = parseResponseBody(raw);
      if (!response.ok) throw responseError(response, parsed);
      return unwrapResponse(parsed);
    } catch (error) {
      if (error instanceof ProspectConnectorError) throw error;
      if (error?.name === "AbortError") {
        throw new ProspectConnectorError("Prospect Spider request timed out", {
          code: "PROSPECT_UPSTREAM_TIMEOUT",
          statusCode: 504
        });
      }
      throw new ProspectConnectorError("Prospect Spider request failed", {
        code: "PROSPECT_UPSTREAM_UNAVAILABLE",
        statusCode: 503,
        details: { operation, cause: error?.code || error?.message || "unknown" }
      });
    } finally {
      signal.cleanup();
    }
  }

  return Object.freeze({
    configured: Boolean(normalizedBaseUrl),
    searchConfigured: Boolean(normalizedBaseUrl && searchEnabled),
    baseUrl: normalizedBaseUrl,
    videoList: (input, options) => post("videoList", input, options),
    comments: (input, options) => post("comments", input, options),
    search: searchEnabled ? (input, options) => post("search", input, options) : null
  });
}

export function prospectConnectorConfiguration(env = process.env) {
  return readConfiguration(env);
}

export { DEFAULT_PATHS as PROSPECT_SPIDER_PATHS };
