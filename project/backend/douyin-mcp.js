import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_PYTHON = "/Volumes/SANDISK ELE/tiktok触达系统/social-media-mcp/.venv/bin/python";
const DEFAULT_ADAPTER = "/Volumes/SANDISK ELE/tiktok触达系统/social-media-mcp/mcp_data/mcp_adapter.py";
const DEFAULT_SERVER_URL = "https://api.yydsagent.com";
export const DEFAULT_PRIVATE_OUTREACH_ACTION_TYPE = 5;
const REMOTE_STATUS_PROBE_TIMEOUT_MS = 10000;
const REMOTE_STATUS_PROBE_INTERVAL_MS = 10000;
const DEFAULT_PRIVATE_MESSAGE_RETRY_DELAY_MS = 1500;

function viewExpirySeconds(result, pageUrl) {
  const explicit = Number(result?.view_url_expires_at || result?.viewUrlExpiresAt || result?.expires_at || result?.expiresAt || 0);
  if (Number.isFinite(explicit) && explicit > 0) return explicit > 1e12 ? Math.floor(explicit / 1000) : Math.floor(explicit);
  try {
    const token = new URL(pageUrl).pathname.replace(/\/$/, "").split("/").pop()?.split(".")[0] || "";
    const payload = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
    const expiresAt = Number(payload?.expiresAt || payload?.expires_at || payload?.exp || 0);
    return Number.isFinite(expiresAt) && expiresAt > 0
      ? (expiresAt > 1e12 ? Math.floor(expiresAt / 1000) : Math.floor(expiresAt))
      : 0;
  } catch {
    return 0;
  }
}

export function createDouyinMcpService({
  python = process.env.BYERING_DOUYIN_MCP_PYTHON || DEFAULT_PYTHON,
  adapter = process.env.BYERING_DOUYIN_MCP_ADAPTER || DEFAULT_ADAPTER,
  channelServerUrl = process.env.BYERING_DOUYIN_MCP_SERVER_URL || DEFAULT_SERVER_URL,
  apiKey = process.env.BYERING_DOUYIN_MCP_API_KEY || "",
  sessionId = process.env.BYERING_DOUYIN_MCP_SESSION_ID || "",
  statusTimeoutMs = 120000,
  env = {},
  privateMessageRetryDelayMs = DEFAULT_PRIVATE_MESSAGE_RETRY_DELAY_MS
} = {}) {
  const configured = Boolean(python && adapter && channelServerUrl && apiKey && existsSync(python) && existsSync(adapter));
  let child = null;
  let nextId = 0;
  const pending = new Map();
  let statusPromise = null;
  let passivePullTail = Promise.resolve();
  let channelStarted = false;
  let messageModeStarted = false;
  let currentSessionId = sessionId;
  let loginViewCache = null;
  let loginViewPromise = null;

  function cachedLoginView() {
    if (!loginViewCache) {
      return { ok: false, error: { code: "DOUYIN_VIEW_LINK_MISSING", message: "当前没有可复用的云电脑画面凭据" } };
    }
    if (loginViewCache.expiresAt > 0 && loginViewCache.expiresAt <= Math.floor(Date.now() / 1000)) {
      loginViewCache = null;
      return { ok: false, error: { code: "DOUYIN_VIEW_LINK_EXPIRED", message: "云电脑画面凭据已过期，请手动重新连接" } };
    }
    return { ...loginViewCache.result, cached: true };
  }

  function rememberLoginView(result) {
    if (!result || result.ok === false) return result;
    const pageUrl = result.cloudViewUrl || result.cloud_view_url || result.viewUrl || result.view_url
      || result.viewPageUrl || result.view_page_url || result.loginUrl || result.login_url || null;
    const normalized = pageUrl ? { ...result, pageUrl, cloudViewUrl: pageUrl, viewUrl: pageUrl } : result;
    if (pageUrl) {
      loginViewCache = {
        expiresAt: viewExpirySeconds(normalized, pageUrl),
        result: normalized
      };
    }
    return normalized;
  }

  function rejectPending(error, worker = null) {
    for (const [id, request] of pending.entries()) {
      if (worker && request.worker !== worker) continue;
      pending.delete(id);
      request.reject(error);
    }
  }

  function terminateWorker(worker) {
    if (!worker || worker.killed) return;
    if (process.platform !== "win32" && worker.pid) {
      try {
        process.kill(-worker.pid, "SIGTERM");
        return;
      } catch {
        // Fall through when the process group has already exited.
      }
    }
    worker.kill();
  }

  function ensureWorker() {
    if (!configured) throw Object.assign(new Error("Douyin MCP is not configured"), { code: "DOUYIN_MCP_NOT_CONFIGURED", statusCode: 503 });
    if (child && !child.killed) return child;
    const worker = spawn(python, [resolve(PROJECT_ROOT, "backend/douyin-mcp-worker.py"), "--adapter", adapter, "--channel-server-url", channelServerUrl, ...(currentSessionId ? ["--session-id", currentSessionId] : [])], {
      cwd: PROJECT_ROOT,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...env, DOUYIN_API_KEY: apiKey },
      detached: process.platform !== "win32"
    });
    child = worker;
    let workerBuffer = "";
    let workerStderr = "";
    worker.stdout.setEncoding("utf8");
    worker.stdout.on("data", (chunk) => {
      workerBuffer += chunk;
      let newline;
      while ((newline = workerBuffer.indexOf("\n")) >= 0) {
        const line = workerBuffer.slice(0, newline).trim();
        workerBuffer = workerBuffer.slice(newline + 1);
        if (!line) continue;
        let message;
        try { message = JSON.parse(line); } catch { continue; }
        const request = pending.get(message.id);
        if (!request || request.worker !== worker) continue;
        pending.delete(message.id);
        request.resolve(message.result);
      }
    });
    worker.stderr.setEncoding("utf8");
    worker.stderr.on("data", (chunk) => {
      workerStderr = `${workerStderr}${String(chunk)}`.slice(-4000);
    });
    worker.stdin.on("error", (error) => {
      if (child !== worker) return;
      child = null;
      rejectPending(Object.assign(new Error("Douyin MCP worker input closed"), {
        code: "DOUYIN_MCP_WORKER_INPUT_CLOSED",
        cause: error
      }), worker);
    });
    worker.on("error", (error) => {
      rejectPending(Object.assign(new Error("Douyin MCP worker failed to start"), {
        code: "DOUYIN_MCP_WORKER_FAILED",
        cause: error
      }), worker);
    });
    worker.on("exit", (code, signal) => {
      if (child === worker) child = null;
      const stderr = workerStderr.trim();
      if (stderr) console.error(`[douyin-mcp] worker exited code=${code ?? "null"} signal=${signal || "none"}: ${stderr}`);
      rejectPending(Object.assign(new Error(stderr || "Douyin MCP worker exited"), {
        code: stderr.includes("DOUYIN_MCP_WORKER_ALREADY_RUNNING")
          ? "DOUYIN_MCP_WORKER_ALREADY_RUNNING"
          : "DOUYIN_MCP_WORKER_EXITED",
        details: { code, signal, stderr: stderr || null }
      }), worker);
    });
    return child;
  }

  async function readRemoteStatus({ timeoutMs = REMOTE_STATUS_PROBE_TIMEOUT_MS } = {}) {
    if (!currentSessionId) {
      return { ok: true, state: "NOT_STARTED", login_state: "logged_out", worker: { online: false }, account: null };
    }
    return remoteRequest("GET", "/status", { timeoutMs });
  }

  async function checkLoginStatus({ reqId = null, timeoutMs = REMOTE_STATUS_PROBE_TIMEOUT_MS } = {}) {
    if (!currentSessionId) {
      return { ok: true, state: "NOT_STARTED", login_state: "logged_out", worker: { online: false }, account: null };
    }
    return remoteRequest("POST", "/status/check", {
      body: { req_id: reqId || randomUUID(), wait_ms: 1000 },
      timeoutMs
    });
  }

  async function waitForRemoteRecovery({ timeoutMs = 60000 } = {}) {
    const deadline = Date.now() + Math.max(1000, Number(timeoutMs) || 60000);
    while (Date.now() < deadline) {
      const remaining = deadline - Date.now();
      const status = await readRemoteStatus({ timeoutMs: Math.min(10000, remaining) });
      const displayState = String(status?.display_state || status?.displayState || "").toLowerCase();
      const loginState = String(status?.login_state || status?.loginState || "").toLowerCase();
      if (status?.ok !== false
        && status?.worker?.online !== false
        && displayState !== "error"
        && loginState === "logged_in") return true;
      await wait(Math.min(2000, Math.max(250, deadline - Date.now())));
    }
    return false;
  }

  async function waitForRemoteStop({ timeoutMs = 60000 } = {}) {
    const deadline = Date.now() + Math.max(1000, Number(timeoutMs) || 60000);
    while (Date.now() < deadline) {
      const remaining = deadline - Date.now();
      const status = await readRemoteStatus({ timeoutMs: Math.min(10000, remaining) });
      const sessionState = String(status?.session_state || status?.sessionState || "").toLowerCase();
      const displayState = String(status?.display_state || status?.displayState || "").toLowerCase();
      if (status?.worker?.online === false || sessionState === "stopped" || displayState === "stopped") return true;
      await wait(Math.min(2000, Math.max(250, deadline - Date.now())));
    }
    return false;
  }

  async function remoteRequest(method, path, { body = undefined, query = undefined, timeoutMs = 30000 } = {}) {
    if (!currentSessionId) return null;
    const base = `${channelServerUrl.replace(/\/$/, "")}/v1/sessions/${encodeURIComponent(currentSessionId)}${path}`;
    const url = new URL(base);
    for (const [key, value] of Object.entries(query || {})) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs) || 30000));
    try {
      const response = await fetch(url, {
        method,
        headers: {
          accept: "application/json",
          ...(body === undefined ? {} : { "content-type": "application/json" }),
          ...(apiKey ? { "X-API-Key": apiKey } : {})
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal
      });
      const raw = await response.text();
      let parsed;
      try { parsed = raw ? JSON.parse(raw) : {}; } catch { parsed = { ok: false, error: { code: "DOUYIN_REMOTE_INVALID_RESPONSE", message: raw || "invalid response" } }; }
      if (!response.ok && parsed?.ok !== false) {
        parsed = { ok: false, error: { code: `DOUYIN_REMOTE_HTTP_${response.status}`, message: `remote request returned HTTP ${response.status}` } };
      }
      return parsed;
    } catch (error) {
      return {
        ok: false,
        error: {
          code: error?.name === "AbortError" ? "DOUYIN_REMOTE_TIMEOUT" : "DOUYIN_REMOTE_NETWORK",
          message: error?.message || String(error)
        }
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async function call(name, arguments_ = {}, { timeoutMs = 30000 } = {}) {
    const worker = ensureWorker();
    const id = String(++nextId);
    return new Promise((resolveResult, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(Object.assign(new Error(`Douyin MCP call timed out: ${name}`), { code: "DOUYIN_MCP_TIMEOUT" }));
        // A timed-out stdio call leaves the adapter queue indeterminate. Kill
        // that worker so the next retry starts with a clean MCP transport.
        if (child === worker) {
          child = null;
          terminateWorker(worker);
        }
      }, timeoutMs);
      pending.set(id, {
        worker,
        resolve: (result) => { clearTimeout(timer); resolveResult(result); },
        reject: (error) => { clearTimeout(timer); reject(error); }
      });
      try {
        worker.stdin.write(`${JSON.stringify({ id, name, arguments: arguments_ })}\n`);
      } catch (error) {
        pending.delete(id);
        clearTimeout(timer);
        reject(Object.assign(new Error("Douyin MCP worker input closed"), {
          code: "DOUYIN_MCP_WORKER_INPUT_CLOSED",
          cause: error
        }));
        if (child === worker) terminateWorker(worker);
      }
    });
  }

  function queuePassivePull(operation) {
    const run = passivePullTail.catch(() => {}).then(operation);
    passivePullTail = run.catch(() => {});
    return run;
  }

  return {
    configured,
    channelServerUrl,
    async start({ billingPlan = "monthly", reqId = null } = {}) {
      loginViewCache = null;
      const result = await call("douyin.start", { billing_plan: billingPlan, req_id: reqId || randomUUID() }, { timeoutMs: 370000 });
      channelStarted = result?.ok !== false;
      if (result?.session_id || result?.sessionId) currentSessionId = result.session_id || result.sessionId;
      return result;
    },
    async stop({ reqId = null } = {}) {
      if (!currentSessionId) return { ok: true, state: "NOT_STARTED", session_id: null };
      // Official adapters do not expose stop; preserve login via the channel API.
      const result = await remoteRequest("POST", "/stop", { body: { req_id: reqId || randomUUID() }, timeoutMs: 30000 });
      if (result?.ok !== false) {
        channelStarted = false;
        messageModeStarted = false;
        loginViewCache = null;
      }
      return result;
    },
    async unsubscribe({ confirm = "", reason = "user_requested", reqId = null } = {}) {
      const result = await call("douyin.unsubscribe", {
        confirm,
        reason,
        req_id: reqId || randomUUID()
      }, { timeoutMs: 30000 });
      if (result?.ok !== false) {
        channelStarted = false;
        messageModeStarted = false;
        currentSessionId = null;
        loginViewCache = null;
      }
      return result;
    },
    async resume() {
      if (!currentSessionId) return { ok: false, error: { code: "DOUYIN_SESSION_ID_MISSING", message: "No saved Douyin session_id" } };
      const result = await retryTransientDouyinCall(
        () => call("douyin.status", {}, { timeoutMs: statusTimeoutMs }),
        { maxAttempts: 3, delayMs: 1000 }
      );
      channelStarted = result?.ok !== false;
      return result;
    },
    getSessionId() { return currentSessionId || null; },
    get isStarted() { return channelStarted; },
    async status() {
      // A status probe before this control service has started a channel must
      // be local and immediate. Calling the remote adapter here can block its
      // single MCP worker and delay the explicit cloud-authorization action.
      if (!channelStarted) {
        return { ok: true, state: "NOT_STARTED", login_state: "logged_out", worker: { online: false }, account: null };
      }
      // Several UI surfaces poll the same remote channel during startup. Share
      // one in-flight request so a slow cloud response cannot queue duplicate
      // calls behind each other and surface as a browser network failure.
      if (statusPromise) return statusPromise;
      statusPromise = retryTransientDouyinCall(
        () => call("douyin.status", {}, { timeoutMs: statusTimeoutMs }),
        { maxAttempts: 3, delayMs: 1000 }
      )
        .finally(() => { statusPromise = null; });
      return statusPromise;
    },
    async probeRemoteStatus() { return readRemoteStatus(); },
    async checkLoginStatus({ reqId = null } = {}) {
      return checkLoginStatus({ reqId });
    },
    async waitForRemoteRecovery({ timeoutMs = 180000 } = {}) {
      return waitForRemoteRecovery({ timeoutMs });
    },
    async waitForRemoteStop({ timeoutMs = 60000 } = {}) {
      return waitForRemoteStop({ timeoutMs });
    },
    getCachedLoginView() {
      return cachedLoginView();
    },
    async refreshLoginView() {
      if (!currentSessionId) {
        return { ok: false, error: { code: "DOUYIN_SESSION_ID_MISSING", message: "当前 Agent 没有可续签画面的云电脑会话" } };
      }
      if (loginViewPromise) return loginViewPromise;
      loginViewPromise = remoteRequest("POST", "/login/open", {
        body: { req_id: randomUUID(), want_qr: false },
        timeoutMs: 30000
      })
        .then(rememberLoginView)
        .finally(() => { loginViewPromise = null; });
      return loginViewPromise;
    },
    async openLogin({ force = false, wantQr = true } = {}) {
      if (!force && loginViewCache) {
        const cached = cachedLoginView();
        if (cached?.ok !== false) return cached;
      }
      if (loginViewPromise) return loginViewPromise;
      loginViewPromise = (async () => {
        if (currentSessionId) {
          const direct = await remoteRequest("POST", "/login/open", {
            body: { req_id: randomUUID(), want_qr: wantQr !== false },
            timeoutMs: 30000
          });
          const directErrorCode = String(direct?.error?.code || "").toLowerCase();
          const canFallbackToAdapter = isUnsupportedRemoteRequest(direct)
            || ["douyin_remote_network", "douyin_remote_timeout"].includes(directErrorCode);
          if (direct && !canFallbackToAdapter) return rememberLoginView(direct);
        }
        const result = await call("douyin.open_login", {
          prefer: "cloud_view",
          req_id: randomUUID(),
          want_qr: wantQr !== false
        }, { timeoutMs: 30000 });
        return rememberLoginView(result);
      })().finally(() => { loginViewPromise = null; });
      return loginViewPromise;
    },
    async startNotificationMode() {
      const direct = await remoteRequest("POST", "/notification-mode/start", { body: { req_id: randomUUID(), timeout_ms: 10000 }, timeoutMs: 30000 });
      if (direct && !isUnsupportedRemoteRequest(direct)) return direct;
      return call("douyin.start_notification_mode", { req_id: randomUUID() }, { timeoutMs: 30000 });
    },
    async startLivePolling({ pollingId = null, reqId = null } = {}) {
      return remoteRequest("POST", "/live-polling/start", { body: { req_id: reqId || randomUUID(), polling_id: pollingId, timeout_ms: 10000 } });
    },
    async stopLivePolling({ reqId = null } = {}) {
      return remoteRequest("POST", "/live-polling/stop", { body: { req_id: reqId || randomUUID(), timeout_ms: 10000 } });
    },
    async livePollingStatus() {
      return remoteRequest("GET", "/live-polling/status", { query: { wait_ms: 0 } });
    },
    async pullLiveMessages({ cursor = 0, limit = 100, waitMs = 0 } = {}) {
      return queuePassivePull(() => remoteRequest("GET", "/live-messages", { query: { cursor, max: limit, wait_ms: waitMs }, timeoutMs: Math.max(30000, waitMs + 10000) }));
    },
    async startMessageMode() {
      const status = await readRemoteStatus({ timeoutMs: 5000 });
      const remoteMode = String(status?.message_mode || status?.messageMode || "").toLowerCase();
      if (remoteMode === "running") {
        messageModeStarted = true;
        return { ok: true, state: "running", reused: true };
      }
      messageModeStarted = false;
      const direct = await remoteRequest("POST", "/message-mode/start", {
        body: { req_id: randomUUID(), timeout_ms: 10000 },
        timeoutMs: 30000
      });
      if (direct && !isUnsupportedRemoteRequest(direct)) {
        const directMode = String(direct?.state || direct?.message_mode || direct?.messageMode || "").toLowerCase();
        if (direct?.ok !== false && directMode === "running") messageModeStarted = true;
        return direct;
      }
      const result = await call("douyin.start_message_mode", { req_id: randomUUID() }, { timeoutMs: 30000 });
      const resultMode = String(result?.state || result?.message_mode || result?.messageMode || "").toLowerCase();
      if (result?.ok !== false && resultMode === "running") messageModeStarted = true;
      return result;
    },
    async pullMessages({ cursor = 0, limit = 20, waitMs = 0 } = {}) {
      return queuePassivePull(async () => {
        const direct = await remoteRequest("GET", "/messages", { query: { cursor, max: limit, wait_ms: waitMs }, timeoutMs: Math.max(30000, waitMs + 10000) });
        if (direct && !isUnsupportedRemoteRequest(direct)) return direct;
        return call("douyin.pull_messages", { cursor, limit, wait_ms: waitMs }, { timeoutMs: Math.max(30000, waitMs + 10000) });
      });
    },
    async pullNotifications({ cursor = 0, limit = 20, waitMs = 0 } = {}) {
      return queuePassivePull(async () => {
        const direct = await remoteRequest("GET", "/notifications", { query: { cursor, max: limit, wait_ms: waitMs }, timeoutMs: Math.max(30000, waitMs + 10000) });
        if (direct && !isUnsupportedRemoteRequest(direct)) return direct;
        return call("douyin.pull_notifications", { cursor, limit, wait_ms: waitMs }, { timeoutMs: Math.max(30000, waitMs + 10000) });
      });
    },
    async sendMessage({ conversationId = null, content = "", reqId = null, nickname = null, secUid = null, unfamiliar = null, timeoutMs = 30000 } = {}) {
      const stableReqId = reqId || randomUUID();
      const direct = await remoteRequest("POST", "/messages", {
        body: {
          conversation_id: conversationId || undefined,
          content: { type: "text", text: content },
          req_id: stableReqId,
          nickname: nickname || undefined,
          sec_uid: secUid || undefined,
          unfamiliar: unfamiliar == null ? undefined : unfamiliar,
          timeout_ms: timeoutMs
        },
        timeoutMs: Math.max(30000, timeoutMs + 5000)
      });
      if (direct && !isUnsupportedRemoteRequest(direct)) {
        if (direct.ok !== false && isDirectSendResponse(direct)) return direct;
        if (direct.ok === false && !isTransientDouyinFailure(direct)) return direct;
      }
      return call("douyin.send_message", {
        conversation_id: conversationId || undefined,
        content,
        req_id: stableReqId,
        nickname: nickname || undefined,
        sec_uid: secUid || undefined,
        unfamiliar: unfamiliar == null ? undefined : unfamiliar,
        timeout_ms: timeoutMs
      }, { timeoutMs: Math.max(30000, timeoutMs + 5000) });
    },
    async sendPrivateMessage({ secId = null, secUid = null, content = "", reqId = null, nickname = null, operatedAccountSecId = null, operatedNickname = null, timeoutMs = 120000, followFirst = false, followBeforeLetter = false, followOnly = false, fetchPostOnly = false, actionType = DEFAULT_PRIVATE_OUTREACH_ACTION_TYPE } = {}) {
      const stableReqId = reqId || randomUUID();
      const arguments_ = buildPrivateMessageArguments({
        secId,
        secUid,
        content,
        reqId: stableReqId,
        nickname,
        operatedAccountSecId,
        operatedNickname,
        timeoutMs,
        followFirst,
        followBeforeLetter,
        followOnly,
        fetchPostOnly,
        actionType
      });
      const restArguments = {
        ...arguments_,
        content: { type: "text", text: content }
      };
      // Prefer the channel REST endpoint when a saved session is available.
      // This keeps outbound messaging independent from the local stdio adapter
      // and lets the provider deduplicate retries by the stable request id.
      const direct = await remoteRequest("POST", "/private-messages", {
        body: restArguments,
        timeoutMs: Math.max(30000, timeoutMs + 5000)
      });
      if (direct && !isUnsupportedRemoteRequest(direct)) {
        const pendingDirect = normalizePrivateMessageResult(direct, stableReqId);
        if (pendingDirect !== direct) return pendingDirect;
        if (direct.ok !== false && isDirectSendResponse(direct)) return direct;
        // A recipient who already has a conversation can be handled by the
        // message-mode endpoint when the proactive window cannot be opened.
        // Keep the same req id so the provider remains idempotent.
        if (isPrivateMessageWindowFailure(direct) && (nickname || secUid || secId)) {
          const conversational = await remoteRequest("POST", "/messages", {
            body: {
              req_id: stableReqId,
              content: { type: "text", text: content },
              timeout_ms: timeoutMs,
              nickname: nickname || undefined,
              sec_uid: secUid || secId || undefined
            },
            timeoutMs: Math.max(30000, timeoutMs + 5000)
          });
          if (conversational && !isUnsupportedRemoteRequest(conversational)) {
            const normalizedConversational = normalizePrivateMessageResult(conversational, stableReqId);
            if (normalizedConversational !== conversational || conversational.ok !== false || !isPrivateMessageWindowFailure(conversational)) {
              return normalizedConversational;
            }

            // A freshly started cloud browser can report the profile as
            // online before its private-message surface is interactive. Give
            // the same idempotent request one readiness retry instead of
            // failing the task while the desktop is visibly connected.
            const recovered = await waitForRemoteRecovery({
              timeoutMs: Math.min(120000, Math.max(10000, timeoutMs))
            });
            if (recovered) {
              await wait(Math.max(0, Number(privateMessageRetryDelayMs) || 0));
              const retryDirect = await remoteRequest("POST", "/private-messages", {
                body: restArguments,
                timeoutMs: Math.max(30000, timeoutMs + 5000)
              });
              const normalizedRetry = normalizePrivateMessageResult(retryDirect, stableReqId);
              if (retryDirect && !isUnsupportedRemoteRequest(retryDirect)
                && (normalizedRetry !== retryDirect || retryDirect.ok !== false || !isPrivateMessageWindowFailure(retryDirect))) {
                return normalizedRetry;
              }
              if (retryDirect && !isUnsupportedRemoteRequest(retryDirect)
                && isPrivateMessageWindowFailure(retryDirect)) {
                const retryConversational = await remoteRequest("POST", "/messages", {
                  body: {
                    req_id: stableReqId,
                    content: { type: "text", text: content },
                    timeout_ms: timeoutMs,
                    nickname: nickname || undefined,
                    sec_uid: secUid || secId || undefined
                  },
                  timeoutMs: Math.max(30000, timeoutMs + 5000)
                });
                if (retryConversational && !isUnsupportedRemoteRequest(retryConversational)) {
                  return normalizePrivateMessageResult(retryConversational, stableReqId);
                }
              }
              return normalizedRetry;
            }
            return normalizedConversational;
          }
        }
        if (direct.ok === false && !isTransientDouyinFailure(direct)) return direct;
      }
      // A provider-level window-open rejection is a definitive action result,
      // not a transport failure. Retrying it immediately can re-open the same
      // browser session twice and push the cloud worker into an error state.
      const action = await retryTransientDouyinCall(
        () => call("douyin.send_private_message", arguments_, { timeoutMs: Math.max(30000, timeoutMs + 5000) }),
        {
          maxAttempts: 2,
          delayMs: 500,
          beforeRetry: () => waitForRemoteRecovery({ timeoutMs: Math.min(60000, Math.max(5000, timeoutMs)) })
        }
      );
      // Do not cancel a provider action from a parallel status probe. The
      // channel may briefly report worker offline while the remote browser is
      // restarting or while the action is still being acknowledged. The
      // provider request is the source of truth; its response or transport
      // failure is handled by the stable request-id retry above.
      return normalizePrivateMessageResult(action, stableReqId);
    },
    close() {
      channelStarted = false;
      messageModeStarted = false;
      const worker = child;
      child = null;
      if (worker) terminateWorker(worker);
      rejectPending(new Error("Douyin MCP worker closed"));
    }
  };
}

/** Build the exact MCP wire arguments for an outbound private message. */
export function buildPrivateMessageArguments({
  secId = null,
  secUid = null,
  content = "",
  reqId,
  nickname = null,
  operatedAccountSecId = null,
  operatedNickname = null,
  timeoutMs = 120000,
  followFirst = false,
  followBeforeLetter = false,
  followOnly = false,
  fetchPostOnly = false,
  actionType = DEFAULT_PRIVATE_OUTREACH_ACTION_TYPE
} = {}) {
  const normalizedActionType = actionType == null ? DEFAULT_PRIVATE_OUTREACH_ACTION_TYPE : actionType;
  return {
    sec_id: secId || undefined,
    sec_uid: secUid || undefined,
    operatedAccountSecId: operatedAccountSecId || undefined,
    operatedNickname: operatedNickname || undefined,
    content,
    req_id: reqId || randomUUID(),
    nickname: nickname || undefined,
    timeout_ms: timeoutMs,
    follow_first: followFirst,
    follow_before_letter: followBeforeLetter,
    follow_only: followOnly,
    fetch_post_only: fetchPostOnly,
    action_type: normalizedActionType
  };
}

/**
 * Retry only transport/read timeouts for an outbound private message.
 * The caller must keep the same reqId across attempts so the channel server
 * can deduplicate a request whose first response was lost after submission.
 */
export async function retryTransientPrivateMessage(operation, { maxAttempts = 2, delayMs = 500 } = {}) {
  return retryTransientDouyinCall(operation, { maxAttempts, delayMs });
}

/**
 * Retry transport/read timeouts returned by the Douyin channel.
 * This covers idempotent status probes as well as outbound calls. Callers
 * should keep a stable request id for mutating operations so a lost response
 * cannot create a duplicate message.
 */
export async function retryTransientDouyinCall(operation, { maxAttempts = 2, delayMs = 500, beforeRetry = null } = {}) {
  if (typeof operation !== "function") throw new TypeError("operation must be a function");
  const attempts = Math.max(1, Math.floor(Number(maxAttempts) || 1));
  let lastResult;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      lastResult = await operation();
    } catch (error) {
      if (!isTransientDouyinFailure(error) || attempt + 1 >= attempts) throw error;
      await beforeRetry?.({ attempt, error });
      await wait(Math.max(0, Number(delayMs) || 0));
      continue;
    }
    if (!isTransientDouyinFailure(lastResult) || attempt + 1 >= attempts) return lastResult;
    await beforeRetry?.({ attempt, result: lastResult });
    await wait(Math.max(0, Number(delayMs) || 0));
  }
  return lastResult;
}

function isTransientDouyinFailure(value) {
  const error = value?.error || value;
  const code = String(error?.code || "").toLowerCase();
  const message = String(error?.message || value?.message || "").toLowerCase();
  return code === "network_error"
    || code === "douyin_mcp_timeout"
    || (code === "mcp_call_failed" && /transport closed|connection closed|broken pipe|eof/.test(message))
    || code === "douyin_mcp_worker_exited"
    || /read operation timed out|timed out|timeout|connection reset|temporarily unavailable/.test(message);
}

function isUnsupportedRemoteRequest(value) {
  const code = String(value?.error?.code || "").toLowerCase();
  return code === "douyin_remote_http_404" || code === "not_found" || code === "unsupported";
}

function isPrivateMessageWindowFailure(value) {
  const error = value?.error || value;
  const code = String(error?.code || "").toLowerCase();
  const message = String(error?.message || value?.message || "").toLowerCase();
  return /window.*open|open.*window|私信窗口/.test(message)
    || code === "private_message_failed";
}

function isPendingPrivateMessageReceiptFailure(value) {
  const error = value?.error || value;
  const code = String(error?.code || "").toLowerCase();
  let message = [error?.message, value?.message, error?.details?.message, value?.details?.message]
    .filter((item) => item != null)
    .map((item) => String(item))
    .join(" ");
  // Providers have returned the no-receipt diagnostic at different nesting
  // levels. Search the complete payload so a transport wrapper cannot turn a
  // submitted-but-unconfirmed action into a definitive failure.
  try { message += ` ${JSON.stringify(value)}`; } catch { /* Ignore circular test/provider payloads. */ }
  message = message.toLowerCase();
  const noReceipt = /没有目标收到平台成功回执|未收到平台成功回执|没有收到平台成功回执|no successful receipt|no target.*receipt|receipt.*pending|waiting.*receipt/.test(message);
  return noReceipt && (code === "private_message_failed" || code === "no_receipt" || code === "receipt_pending" || !code || code.includes("private_message"));
}

export function normalizePrivateMessageResult(value, reqId) {
  if (!isPendingPrivateMessageReceiptFailure(value)) return value;
  const upstreamError = value?.error && typeof value.error === "object" ? value.error : null;
  const normalized = value && typeof value === "object" ? { ...value } : {};
  delete normalized.error;
  return {
    ...normalized,
    ok: true,
    state: "pending",
    receiptPending: true,
    req_id: normalized.req_id || reqId || null,
    message: "平台已接收发送动作，等待最终回执",
    providerError: upstreamError
  };
}

function isDirectSendResponse(value) {
  return value?.ok === true
    && (value.message != null
      || value.server_msg_id != null
      || value.serverMessageId != null
      || value.message_id != null
      || value.messageId != null
      || value.id != null
      || value.sent_at != null
      || value.sentAt != null
      || value.delivery_state != null
      || value.deliveryState != null
      || value.state != null
      || value.status != null
      || value.receipt != null
      || value.submission != null);
}

function wait(delayMs) {
  if (!delayMs) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}
