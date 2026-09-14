/**
 * Streamable HTTP client for the public douyin-data MCP server.
 *
 * The client owns MCP session negotiation and exposes the six public tools as
 * a small connector surface consumed by the prospect service. It deliberately
 * contains no browser login or outreach methods.
 */

const DEFAULT_URL = "http://118.196.143.56:8080/mcp";
const DEFAULT_TIMEOUT_MS = 120_000;
const MCP_PROTOCOL_VERSION = "2025-06-18";
const SECRET_KEY = /(?:authorization|(?:access|refresh)?[_-]?token|password|passwd|cookie|secret|csrf|jwt)/i;

export class DouyinDataMcpError extends Error {
  constructor(message, { code = "DOUYIN_DATA_MCP_ERROR", statusCode = 502, details = {} } = {}) {
    super(message);
    this.name = "DouyinDataMcpError";
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

function normalizeUrl(value) {
  const source = nonEmpty(value);
  if (!source) return null;
  try {
    const url = new URL(source);
    if (!/^https?:$/.test(url.protocol)) throw new Error("Only HTTP(S) is supported");
    return url.toString();
  } catch (error) {
    throw new DouyinDataMcpError("douyin-data MCP URL is invalid", {
      code: "DOUYIN_DATA_MCP_CONFIG_INVALID",
      statusCode: 503,
      details: { field: "url", cause: error.message }
    });
  }
}

function parseSse(value) {
  const events = [];
  let event = {};
  for (const line of String(value || "").split(/\r?\n/)) {
    if (!line) {
      if (event.data) events.push(event);
      event = {};
      continue;
    }
    const separator = line.indexOf(":");
    const field = separator < 0 ? line : line.slice(0, separator);
    const data = separator < 0 ? "" : line.slice(separator + 1).replace(/^ /, "");
    if (field === "data") event.data = event.data ? `${event.data}\n${data}` : data;
    else if (field === "event") event.event = data;
    else if (field === "id") event.id = data;
  }
  if (event.data) events.push(event);
  for (const candidate of events.reverse()) {
    try { return JSON.parse(candidate.data); } catch { /* keep looking */ }
  }
  throw new DouyinDataMcpError("douyin-data MCP returned invalid SSE JSON", {
    code: "DOUYIN_DATA_MCP_RESPONSE_INVALID",
    statusCode: 502
  });
}

async function responsePayload(response) {
  const raw = await response.text();
  if (!raw.trim()) return null;
  const contentType = String(response.headers?.get?.("content-type") || "").toLowerCase();
  if (contentType.includes("text/event-stream") || raw.trimStart().startsWith("event:") || raw.trimStart().startsWith("data:")) {
    return parseSse(raw);
  }
  try { return JSON.parse(raw); } catch {
    throw new DouyinDataMcpError("douyin-data MCP returned invalid JSON", {
      code: "DOUYIN_DATA_MCP_RESPONSE_INVALID",
      statusCode: 502
    });
  }
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

function normalizeTimeout(value, fallback = DEFAULT_TIMEOUT_MS) {
  const timeout = Number(value);
  return Number.isInteger(timeout) && timeout >= 100 && timeout <= 10 * 60 * 1000 ? timeout : fallback;
}

function rpcError(payload) {
  if (!isRecord(payload?.error)) return null;
  return new DouyinDataMcpError(payload.error.message || "douyin-data MCP request failed", {
    code: `DOUYIN_DATA_MCP_${String(payload.error.code || "RPC_ERROR").replace(/[^A-Z0-9_]+/gi, "_").toUpperCase()}`,
    statusCode: 502,
    details: { rpc: payload.error }
  });
}

function toolPayload(payload, toolName) {
  const error = rpcError(payload);
  if (error) throw error;
  const result = payload?.result;
  if (!isRecord(result)) throw new DouyinDataMcpError(`douyin-data MCP returned no result for ${toolName}`, {
    code: "DOUYIN_DATA_MCP_RESULT_INVALID",
    statusCode: 502
  });
  if (result.isError) {
    const text = result.content?.find?.((item) => typeof item?.text === "string")?.text;
    throw new DouyinDataMcpError(text || `douyin-data MCP tool failed: ${toolName}`, {
      code: "DOUYIN_DATA_MCP_TOOL_ERROR",
      statusCode: 502,
      details: { tool: toolName }
    });
  }
  const text = Array.isArray(result.content)
    ? result.content.find((item) => typeof item?.text === "string")?.text
    : null;
  if (text == null) return clone(result.structuredContent ?? result);
  try { return JSON.parse(text); } catch {
    return text;
  }
}

function envUrl(env = process.env) {
  return nonEmpty(env?.BYERING_DOUYIN_DATA_MCP_URL)
    || nonEmpty(env?.BYERING_DOUYIN_MCP_URL)
    || null;
}

export function douyinDataMcpConfiguration(env = process.env) {
  return {
    url: envUrl(env),
    timeoutMs: normalizeTimeout(env?.BYERING_DOUYIN_DATA_MCP_TIMEOUT_MS)
  };
}

export function createDouyinDataMcpClient({
  url = envUrl() || DEFAULT_URL,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl = globalThis.fetch,
  sessionId = null,
  clientInfo = { name: "salebuddy", version: "1.0.0" }
} = {}) {
  const normalizedUrl = normalizeUrl(url);
  if (normalizedUrl && typeof fetchImpl !== "function") {
    throw new DouyinDataMcpError("A fetch implementation is required", {
      code: "DOUYIN_DATA_MCP_CONFIG_INVALID",
      statusCode: 503
    });
  }
  const configuredTimeout = normalizeTimeout(timeoutMs);
  let currentSessionId = nonEmpty(sessionId);
  let initialized = false;
  let initializePromise = null;

  async function request(method, params = {}, { timeout = configuredTimeout, signal: externalSignal } = {}) {
    if (!normalizedUrl) throw new DouyinDataMcpError("douyin-data MCP is not configured", {
      code: "DOUYIN_DATA_MCP_NOT_CONFIGURED",
      statusCode: 503
    });
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const headers = {
      "content-type": "application/json",
      accept: "application/json, text/event-stream"
    };
    if (currentSessionId) headers["mcp-session-id"] = currentSessionId;
    const timed = timeoutSignal(normalizeTimeout(timeout), externalSignal);
    try {
      const response = await fetchImpl(normalizedUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({ jsonrpc: "2.0", id: requestId, method, params }),
        signal: timed.signal
      });
      const responseSession = response.headers?.get?.("mcp-session-id");
      if (responseSession) currentSessionId = responseSession;
      const payload = await responsePayload(response);
      if (!response.ok) {
        throw new DouyinDataMcpError("douyin-data MCP HTTP request failed", {
          code: "DOUYIN_DATA_MCP_HTTP_ERROR",
          statusCode: response.status >= 500 ? 502 : 400,
          details: { status: response.status, payload }
        });
      }
      return payload;
    } catch (error) {
      if (error instanceof DouyinDataMcpError) throw error;
      if (error?.name === "AbortError") {
        throw new DouyinDataMcpError("douyin-data MCP request timed out", {
          code: "DOUYIN_DATA_MCP_TIMEOUT",
          statusCode: 504,
          details: { method }
        });
      }
      throw new DouyinDataMcpError("douyin-data MCP request failed", {
        code: "DOUYIN_DATA_MCP_UNAVAILABLE",
        statusCode: 503,
        details: { method, cause: error?.code || error?.message || "unknown" }
      });
    } finally {
      timed.cleanup();
    }
  }

  async function initialize() {
    if (initialized) return { ok: true, sessionId: currentSessionId };
    if (initializePromise) return initializePromise;
    initializePromise = request("initialize", {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo
    }, { timeout: Math.min(configuredTimeout, 30_000) }).then(async (payload) => {
      const error = rpcError(payload);
      if (error) throw error;
      if (!payload?.result?.protocolVersion) throw new DouyinDataMcpError("douyin-data MCP initialize response is invalid", {
        code: "DOUYIN_DATA_MCP_INITIALIZE_INVALID",
        statusCode: 502
      });
      initialized = true;
      // A compliant MCP server acknowledges the notification with 202 and
      // does not return a JSON-RPC result. Await it to avoid racing the first
      // tool call on strict servers.
      await request("notifications/initialized", {}, { timeout: 10_000 }).catch(() => {});
      return { ...payload.result, sessionId: currentSessionId };
    }).finally(() => {
      initializePromise = null;
    });
    return initializePromise;
  }

  async function callTool(name, arguments_ = {}, options = {}) {
    const toolName = nonEmpty(name);
    if (!toolName) throw new DouyinDataMcpError("MCP tool name is required", {
      code: "DOUYIN_DATA_MCP_TOOL_REQUIRED",
      statusCode: 400
    });
    await initialize();
    return toolPayload(await request("tools/call", { name: toolName, arguments: clone(arguments_) }, options), toolName);
  }

  const client = {
    kind: "douyin-data-mcp",
    configured: Boolean(normalizedUrl),
    url: normalizedUrl,
    get sessionId() { return currentSessionId; },
    initialize,
    callTool,
    async listTools(options) {
      await initialize();
      const payload = await request("tools/list", {}, options);
      const error = rpcError(payload);
      if (error) throw error;
      return payload?.result?.tools || [];
    },
    async getVideoList({ secId, sec_id, uid = 1, tenant = 1, lastTime, last_time, wait = true, waitTimeoutMs, wait_timeout_ms, sessionId, runId, run_id } = {}, options) {
      return callTool("douyin_get_video_list", {
        sec_id: sec_id || secId,
        uid,
        tenant,
        wait,
        ...(last_time || lastTime ? { last_time: last_time || lastTime } : {}),
        ...(wait_timeout_ms || waitTimeoutMs ? { wait_timeout_ms: wait_timeout_ms || waitTimeoutMs } : {}),
        ...(sessionId ? { session_id: sessionId } : {}),
        ...(run_id || runId ? { run_id: run_id || runId } : {})
      }, options);
    },
    async getComments({ videoIds, video_ids, uid = 1, tenant = 1, platform = 1, wait = true, waitTimeoutMs, wait_timeout_ms, sessionId, runId, run_id } = {}, options) {
      return callTool("douyin_get_comments", {
        video_ids: video_ids || videoIds,
        uid,
        tenant,
        platform,
        wait,
        ...(wait_timeout_ms || waitTimeoutMs ? { wait_timeout_ms: wait_timeout_ms || waitTimeoutMs } : {}),
        ...(sessionId ? { session_id: sessionId } : {}),
        ...(run_id || runId ? { run_id: run_id || runId } : {})
      }, options);
    },
    async getTaskStatus({ taskId, task_id } = {}, options) {
      return callTool("douyin_get_task_status", { task_id: task_id || taskId }, options);
    },
    async getTaskResult({ taskId, task_id, page = 1, pageSize, page_size } = {}, options) {
      return callTool("douyin_get_task_result", {
        task_id: task_id || taskId,
        page,
        ...(page_size || pageSize ? { page_size: page_size || pageSize } : {})
      }, options);
    },
    async createCollectionTask(input = {}, options) {
      const payload = {
        type: input.type || "video_list",
        ...(input.uid != null ? { uid: input.uid } : {}),
        ...(input.tenant != null ? { tenant: input.tenant } : {}),
        ...(input.platform != null ? { platform: input.platform } : {}),
        ...(input.video_ids || input.videoIds ? { video_ids: input.video_ids || input.videoIds } : {}),
        ...(input.sec_id || input.secId ? { sec_id: input.sec_id || input.secId } : {}),
        ...(input.last_time || input.lastTime ? { last_time: input.last_time || input.lastTime } : {}),
        ...(input.session_id || input.sessionId ? { session_id: input.session_id || input.sessionId } : {}),
        ...(input.run_id || input.runId ? { run_id: input.run_id || input.runId } : {})
      };
      return callTool("douyin_create_collection_task", payload, options);
    },
    // Adapter aliases consumed by the existing public prospect service.
    videoList(input, options) { return client.getVideoList(input, options); },
    comments(input, options) { return client.getComments(input, options); },
    close() {
      initialized = false;
      currentSessionId = null;
    }
  };
  return Object.freeze(client);
}

export { DEFAULT_URL as DOUYIN_DATA_MCP_DEFAULT_URL };
