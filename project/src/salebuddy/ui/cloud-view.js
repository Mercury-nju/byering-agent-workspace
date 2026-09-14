import RFB from "../../../node_modules/@novnc/novnc/core/rfb.js";
import { cropRectForCanvas, resolveStableLiveRoomCaptureRegion } from "./live-room-capture.js";

const CREDENTIAL_RENEWAL_LEAD_MS = 45_000;
const CREDENTIAL_RENEWAL_RETRY_MS = 5_000;
const CONNECTION_TIMEOUT_MS = 20_000;
const VNC_WS_PROTOCOLS = Object.freeze(["binary"]);
const WORK_RECORDING_SEGMENT_MS = 5_000;
const WORK_RECORDING_FRAME_RATE = 8;
const LIVE_ROOM_CAPTURE_RETRY_COUNT = 8;
const LIVE_ROOM_CAPTURE_RETRY_DELAY_MS = 120;

const query = new URLSearchParams(globalThis.location?.search || "");
const embedded = query.get("embedded") === "1";
const agentId = String(query.get("agentId") || "").trim();
const backendUrl = String(
  query.get("backend")
    || globalThis.__SALEBUDDY_CONFIG__?.controlPlaneUrl
    || "http://127.0.0.1:6681"
).replace(/\/$/, "");

const screen = document.querySelector("#screen");
const status = document.querySelector("#status");
const expiry = document.querySelector("#expiry");
const message = document.querySelector("#message");
const messageTitle = document.querySelector("#message-title");
const messageCopy = document.querySelector("#message-copy");
const disconnectButton = document.querySelector("#disconnect");
const reconnectButton = document.querySelector("#reconnect");
const messageReconnectButton = document.querySelector("#message-reconnect");
const fullscreenButton = document.querySelector("#fullscreen");

let targetUrl = query.get("targetUrl") || "";
let expiresAt = Number(query.get("expiresAt") || 0);
let client = null;
let reconnectTimer = null;
let credentialRenewalTimer = null;
let connectionTimer = null;
let refreshPromise = null;
let credentialRenewalPromise = null;
let reconnectAttempt = 0;
let intentionalDisconnect = false;
let terminalViewerError = false;
let stopped = false;
let viewerState = "connecting";
let workRecording = null;
let captureRegionHint = null;
let lastLiveRoomCapture = null;
let recordingRetryTimer = null;

function notifyParent(statusName, detail = {}) {
  viewerState = statusName;
  try {
    globalThis.parent?.postMessage?.({
      type: "byering-cloud-viewer",
      agentId,
      status: statusName,
      ...detail
    }, globalThis.location?.origin || "*");
  } catch {}
}

function replyWithCurrentState() {
  try {
    globalThis.parent?.postMessage?.({
      type: "byering-cloud-viewer",
      agentId,
      status: viewerState,
      message: "当前云电脑画面状态"
    }, globalThis.location?.origin || "*");
  } catch {}
}

function frameCanvas() {
  const canvas = screen.querySelector?.("canvas");
  return canvas && canvas.width > 8 && canvas.height > 8 ? canvas : null;
}

function captureRegionFromData(data) {
  const candidates = [
    data?.captureRegion, data?.capture_region,
    data?.liveRoomRegion, data?.live_room_region,
    data?.capture?.region, data?.capture?.captureRegion,
    data?.metadata?.captureRegion, data?.metadata?.capture_region
  ];
  return candidates.find((candidate) => candidate && typeof candidate === "object") || null;
}

function resolveCapture(canvas, request = {}) {
  const profile = String(request.captureProfile || "").trim();
  const hint = request.captureRegion || captureRegionHint;
  if (profile !== "douyin-live-room" && !hint) return { source: "full-screen", region: null, confidence: 0, method: "default" };
  const frame = { width: canvas.width, height: canvas.height, regionHint: hint };
  if (!hint) {
    try {
      const context = canvas.getContext("2d", { willReadFrequently: true });
      frame.data = context?.getImageData(0, 0, canvas.width, canvas.height)?.data;
    } catch {}
  }
  const resolved = resolveStableLiveRoomCaptureRegion(frame, {
    regionHint: hint,
    previousRegion: lastLiveRoomCapture?.region,
    previousConfidence: lastLiveRoomCapture?.confidence
  });
  if (resolved.source === "provider" || resolved.source === "visual") lastLiveRoomCapture = resolved;
  return resolved;
}

function createCaptureCanvas(sourceCanvas, resolved, { maxEdge = 880, animate = false } = {}) {
  const rect = resolved.region
    ? cropRectForCanvas(sourceCanvas.width, sourceCanvas.height, resolved.region)
    : { x: 0, y: 0, width: sourceCanvas.width, height: sourceCanvas.height };
  const largest = Math.max(rect.width, rect.height);
  const scale = largest > maxEdge ? maxEdge / largest : 1;
  const output = document.createElement("canvas");
  output.width = Math.max(1, Math.floor(rect.width * scale));
  output.height = Math.max(1, Math.floor(rect.height * scale));
  const context = output.getContext("2d", { alpha: false });
  const draw = () => {
    context.fillStyle = "#111522";
    context.fillRect(0, 0, output.width, output.height);
    context.drawImage(sourceCanvas, rect.x, rect.y, rect.width, rect.height, 0, 0, output.width, output.height);
  };
  draw();
  let stopped = false;
  let frameId = null;
  const requestFrame = globalThis.requestAnimationFrame || ((callback) => globalThis.setTimeout(callback, 1000 / WORK_RECORDING_FRAME_RATE));
  const cancelFrame = globalThis.cancelAnimationFrame || globalThis.clearTimeout;
  const render = () => {
    if (stopped) return;
    draw();
    frameId = requestFrame(render);
  };
  if (animate) frameId = requestFrame(render);
  return {
    canvas: output,
    resolution: resolved,
    dispose() {
      stopped = true;
      if (frameId !== null) cancelFrame?.(frameId);
    }
  };
}

function jpegFrame(canvas, { maxEdge = 880, quality = 0.68, captureProfile = "", captureRegion = null } = {}) {
  const resolved = resolveCapture(canvas, { captureProfile, captureRegion });
  const capture = createCaptureCanvas(canvas, resolved, { maxEdge });
  const imageData = capture.canvas.toDataURL("image/jpeg", quality);
  capture.dispose();
  return { imageData, resolution: resolved };
}

function sendFrameCapture(captureId, options = {}) {
  const canvas = frameCanvas();
  if (!canvas) {
    notifyParent("snapshot-unavailable", { captureId, message: "当前画面还没有可保存的内容" });
    return;
  }
  try {
    const captured = jpegFrame(canvas, options);
    const profile = String(options.captureProfile || "").trim();
    const attempt = Number(options.captureAttempt) || 0;
    if (profile === "douyin-live-room" && !captured.resolution.region && attempt < LIVE_ROOM_CAPTURE_RETRY_COUNT) {
      globalThis.setTimeout?.(() => sendFrameCapture(captureId, {
        ...options,
        captureAttempt: attempt + 1
      }), LIVE_ROOM_CAPTURE_RETRY_DELAY_MS);
      return;
    }
    globalThis.parent?.postMessage?.({
      type: "byering-cloud-snapshot",
      agentId,
      captureId,
      imageData: captured.imageData,
      captureRegion: captured.resolution.region,
      captureRegionSource: captured.resolution.source,
      captureRegionConfidence: captured.resolution.confidence
    }, globalThis.location?.origin || "*");
  } catch (error) {
    notifyParent("snapshot-unavailable", { captureId, message: error?.message || "当前画面无法保存" });
  }
}

function workRecordingMimeType() {
  const candidates = ["video/webm;codecs=vp8", "video/webm"];
  return candidates.find(type => globalThis.MediaRecorder?.isTypeSupported?.(type)) || "";
}

function stopWorkRecording() {
  if (recordingRetryTimer) {
    globalThis.clearTimeout?.(recordingRetryTimer);
    recordingRetryTimer = null;
  }
  const active = workRecording;
  workRecording = null;
  if (!active) return;
  if (active.timer) globalThis.clearTimeout?.(active.timer);
  if (active.recorder?.state && active.recorder.state !== "inactive") {
    try { active.recorder.stop(); } catch {}
    return;
  }
  active.renderTarget?.dispose?.();
  active.stream?.getTracks?.().forEach(track => track.stop());
}

function postWorkRecordingSegment(active, chunks) {
  const blob = new Blob(chunks, { type: active.mimeType || "video/webm" });
  if (!blob.size) return;
  try {
    globalThis.parent?.postMessage?.({
      type: "byering-cloud-recording-segment",
      agentId,
      recordingId: active.recordingId,
      durationMs: WORK_RECORDING_SEGMENT_MS,
      videoData: blob,
      captureRegion: active.captureResolution.region,
      captureRegionSource: active.captureResolution.source,
      captureRegionConfidence: active.captureResolution.confidence
    }, globalThis.location?.origin || "*");
  } catch (error) {
    notifyParent("recording-unavailable", { message: error?.message || "工作画面暂时无法保存" });
  }
}

function startWorkRecording({ recordingId, captureProfile = "", captureRegion = null, captureAttempt = 0 } = {}) {
  if (!recordingId || stopped || !client) return;
  if (workRecording?.recordingId === recordingId) return;
  stopWorkRecording();
  const canvas = frameCanvas();
  if (!canvas?.captureStream || typeof globalThis.MediaRecorder !== "function") {
    notifyParent("recording-unavailable", { message: "当前浏览器暂不支持保存工作画面" });
    return;
  }
  let renderedCapture = null;
  try {
    const captureResolution = resolveCapture(canvas, { captureProfile, captureRegion });
    if (String(captureProfile || "").trim() === "douyin-live-room"
      && !captureResolution.region
      && captureAttempt < LIVE_ROOM_CAPTURE_RETRY_COUNT) {
      recordingRetryTimer = globalThis.setTimeout?.(() => {
        recordingRetryTimer = null;
        startWorkRecording({ recordingId, captureProfile, captureRegion, captureAttempt: captureAttempt + 1 });
      }, LIVE_ROOM_CAPTURE_RETRY_DELAY_MS) || null;
      return;
    }
    renderedCapture = captureResolution.region
      ? createCaptureCanvas(canvas, captureResolution, { maxEdge: 880, animate: true })
      : null;
    const captureCanvas = renderedCapture?.canvas || canvas;
    const stream = captureCanvas.captureStream(WORK_RECORDING_FRAME_RATE);
    const mimeType = workRecordingMimeType();
    const recorder = new globalThis.MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const active = {
      recordingId: String(recordingId), stream, recorder, mimeType, timer: null,
      renderTarget: renderedCapture, captureResolution, captureProfile, captureRegion
    };
    const chunks = [];
    workRecording = active;
    recorder.addEventListener("dataavailable", event => {
      if (event.data?.size) chunks.push(event.data);
    });
    recorder.addEventListener("stop", () => {
      if (active.timer) globalThis.clearTimeout?.(active.timer);
      active.renderTarget?.dispose?.();
      active.stream?.getTracks?.().forEach(track => track.stop());
      postWorkRecordingSegment(active, chunks);
      if (workRecording !== active || stopped || !client) return;
      workRecording = null;
      globalThis.setTimeout?.(() => startWorkRecording({
        recordingId: active.recordingId,
        captureProfile: active.captureProfile,
        captureRegion: active.captureRegion
      }), 0);
    });
    recorder.start();
    active.timer = globalThis.setTimeout?.(() => {
      if (recorder.state !== "inactive") recorder.stop();
    }, WORK_RECORDING_SEGMENT_MS) || null;
  } catch (error) {
    renderedCapture?.dispose?.();
    workRecording?.renderTarget?.dispose?.();
    notifyParent("recording-unavailable", { message: error?.message || "工作画面暂时无法保存" });
  }
}

function decodeViewPage(pageUrl) {
  try {
    const pathname = new URL(pageUrl).pathname.replace(/\/$/, "");
    const token = pathname.split("/").pop() || "";
    const encoded = token.split(".")[0].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(globalThis.atob(`${encoded}${"=".repeat((4 - encoded.length % 4) % 4)}`));
    return { targetUrl: validTarget(payload.targetUrl), expiresAt: Number(payload.expiresAt || 0) };
  } catch {
    return { targetUrl: "", expiresAt: 0 };
  }
}

if (!targetUrl && query.get("viewPageUrl")) {
  const decoded = decodeViewPage(query.get("viewPageUrl"));
  targetUrl = decoded.targetUrl;
  if (!expiresAt) expiresAt = decoded.expiresAt;
}

function setStatus(text, tone = "pending") {
  status.textContent = text;
  status.className = `status ${tone}`;
}

function showMessage(title, copy, { retry = true } = {}) {
  messageTitle.textContent = title;
  messageCopy.textContent = copy;
  message.hidden = false;
  messageReconnectButton.hidden = !embedded || !retry;
}

function hideMessage() {
  message.hidden = true;
}

function isExpired() {
  return expiresAt > 0 && Math.ceil(expiresAt - Date.now() / 1000) <= 0;
}

function updateExpiry() {
  if (!expiresAt) {
    expiry.textContent = "云电脑画面连接";
    return;
  }
  const remaining = Math.max(0, Math.ceil(expiresAt - Date.now() / 1000));
  expiry.textContent = remaining > 0 ? `画面凭据剩余 ${remaining}s` : (client ? "当前画面连接继续保持" : "画面凭据已过期");
}

function validTarget(url) {
  try {
    const parsed = new URL(url);
    return ["ws:", "wss:"].includes(parsed.protocol) ? parsed.toString() : "";
  } catch {
    return "";
  }
}

function applyViewData(data) {
  let next = validTarget(data?.view_url || data?.viewUrlRaw || data?.rawViewUrl);
  const page = data?.view_page_url || data?.viewPageUrl || data?.login_url || data?.loginUrl
    || data?.cloudViewUrl || data?.viewUrl || data?.pageUrl;
  if (!next && page) {
    const decoded = decodeViewPage(page);
    next = decoded.targetUrl;
    if (decoded.expiresAt > 0) expiresAt = decoded.expiresAt;
  }
  if (!next) throw new Error("云电脑没有返回有效的画面链接");
  captureRegionHint = captureRegionFromData(data) || captureRegionHint;
  targetUrl = next;
  const refreshedExpiry = Number(data?.view_url_expires_at || data?.viewUrlExpiresAt || 0);
  if (refreshedExpiry > 0) expiresAt = refreshedExpiry;
  updateExpiry();
  return next;
}

async function fetchCachedTarget({ refresh = false } = {}) {
  if (!agentId) throw new Error("缺少 Agent 身份，无法读取云电脑画面");
  const query = new URLSearchParams({ agentId });
  if (refresh) query.set("refresh", "1");
  const response = await fetch(`${backendUrl}/v1/douyin/mcp/view-link?${query}`, {
    headers: { accept: "application/json" }
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.ok === false) {
    const error = new Error(data?.error?.message || "当前没有可复用的云电脑画面凭据");
    error.code = data?.error?.code || data?.code || "DOUYIN_VIEW_LINK_MISSING";
    throw error;
  }
  return applyViewData(data);
}

async function fetchFreshTarget({ userInitiated = false } = {}) {
  if (!userInitiated) {
    const error = new Error("自动恢复不会重新打开抖音登录页，请点击“重新连接”手动获取新画面凭据");
    error.code = "DOUYIN_VIEW_LINK_REQUIRES_USER_ACTION";
    throw error;
  }
  if (!agentId) throw new Error("缺少 Agent 身份，无法恢复云电脑画面");
  const response = await fetch(`${backendUrl}/v1/douyin/mcp/open-login`, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ agentId, force: true })
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.ok === false) {
    const error = new Error(data?.error?.message || "云电脑暂时无法提供新的画面链接");
    error.code = data?.error?.code || data?.code || "";
    throw error;
  }
  return applyViewData(data);
}

function isAuthExpiredError(error) {
  return ["DOUYIN_AUTH_EXPIRED", "DOUYIN_AUTHORIZATION_REQUIRED", "AUTH_FAIL"].includes(String(error?.code || ""));
}

function showConnectionError(error) {
  const authExpired = isAuthExpiredError(error);
  const needsUserAction = ["DOUYIN_VIEW_LINK_MISSING", "DOUYIN_VIEW_LINK_EXPIRED", "DOUYIN_VIEW_LINK_REQUIRES_USER_ACTION"].includes(String(error?.code || ""));
  setStatus(authExpired ? "授权已失效" : needsUserAction ? "等待手动连接" : "连接失败", "error");
  notifyParent(needsUserAction ? "disconnected" : "error", {
    message: error?.message || "云电脑画面暂时无法打开",
    reason: authExpired ? "auth-expired" : needsUserAction ? "user-action-required" : "connection-error"
  });
  showMessage(
    authExpired ? "抖音授权已失效" : needsUserAction ? "等待连接云电脑画面" : "云电脑画面暂时无法打开",
    authExpired ? "请重新登录抖音后再继续当前任务。" : needsUserAction ? "点击“重新连接”后获取一次新画面凭据。系统不会在后台重复打开抖音页面。" : (error?.message || "请点击“重新连接”再试。")
  );
}

async function freshTarget({ userInitiated = false } = {}) {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    if (targetUrl && !isExpired()) return targetUrl;
    try {
      return await fetchCachedTarget({ refresh: true });
    } catch (error) {
      if (!userInitiated) throw error;
      return fetchFreshTarget({ userInitiated: true });
    }
  })().finally(() => { refreshPromise = null; });
  return refreshPromise;
}

function clearScreen() {
  screen.replaceChildren();
}

function closeClient() {
  clearConnectionTimer();
  stopWorkRecording();
  if (!client) return;
  const current = client;
  client = null;
  try { current.disconnect(); } catch {}
}

function clearConnectionTimer() {
  if (!connectionTimer) return;
  clearTimeout(connectionTimer);
  connectionTimer = null;
}

function scheduleConnectionTimeout(next) {
  clearConnectionTimer();
  connectionTimer = globalThis.setTimeout(() => {
    connectionTimer = null;
    if (client !== next || stopped || intentionalDisconnect) return;
    targetUrl = "";
    setStatus("连接超时，正在恢复", "error");
    notifyParent("reconnecting", { message: "连接超过 20 秒没有返回画面，正在刷新画面连接" });
    showMessage("云电脑画面暂时没有响应", "正在刷新这台云电脑的画面连接，不会重启任务或退出登录。", { retry: false });
    try { next.disconnect(); } catch { scheduleReconnect("云电脑画面连接超时"); }
  }, CONNECTION_TIMEOUT_MS);
}

function clearCredentialRenewalTimer() {
  if (!credentialRenewalTimer) return;
  clearTimeout(credentialRenewalTimer);
  credentialRenewalTimer = null;
}

async function renewCredentialsAndReconnect() {
  if (credentialRenewalPromise) return credentialRenewalPromise;
  credentialRenewalPromise = (async () => {
    if (stopped || intentionalDisconnect) return;
    setStatus("保持连接中", "pending");
    notifyParent("reconnecting", { message: "正在续签云电脑画面凭据" });
    await fetchCachedTarget({ refresh: true });
    if (stopped || intentionalDisconnect) return;
    await connect();
  })().finally(() => { credentialRenewalPromise = null; });
  return credentialRenewalPromise;
}

function scheduleCredentialRenewal() {
  clearCredentialRenewalTimer();
  if (stopped || intentionalDisconnect || !client || !expiresAt) return;
  const delay = Math.max(1_000, expiresAt * 1_000 - Date.now() - CREDENTIAL_RENEWAL_LEAD_MS);
  credentialRenewalTimer = globalThis.setTimeout(async () => {
    credentialRenewalTimer = null;
    try {
      await renewCredentialsAndReconnect();
    } catch (error) {
      if (stopped || intentionalDisconnect) return;
      if (client && !isExpired()) {
        setStatus("已连接", "success");
        credentialRenewalTimer = globalThis.setTimeout(scheduleCredentialRenewal, CREDENTIAL_RENEWAL_RETRY_MS);
        return;
      }
      scheduleReconnect(error?.message || "画面凭据续签失败");
    }
  }, delay);
}

function scheduleReconnect(reason = "画面连接中断") {
  if (stopped || intentionalDisconnect || reconnectTimer) return;
  clearCredentialRenewalTimer();
  reconnectAttempt += 1;
  const delay = Math.min(30_000, 1_000 * (2 ** Math.min(reconnectAttempt - 1, 4)));
  setStatus("连接已断开，正在恢复", "error");
  notifyParent("reconnecting", { message: `${reason}。正在重新连接云电脑画面` });
  showMessage("云电脑画面暂时断开", `${reason}。正在自动重新连接，不会重新登录或创建新的云电脑。`, { retry: false });
  reconnectTimer = globalThis.setTimeout(async () => {
    reconnectTimer = null;
    try {
      await fetchCachedTarget({ refresh: true });
      await connect();
    } catch (error) {
      if (isAuthExpiredError(error)) {
        showConnectionError(error);
        return;
      }
      if (reconnectAttempt >= 8) {
        setStatus("连接失败", "error");
        showMessage("云电脑画面暂时无法恢复", error?.message || "请点击“重新连接”再试。");
        return;
      }
      scheduleReconnect(error?.message || "网络连接不稳定");
    }
  }, delay);
}

async function connect() {
  if (stopped) return;
  intentionalDisconnect = false;
  terminalViewerError = false;
  if (reconnectAttempt > 0) notifyParent("reconnecting", { message: "正在获取真实云电脑画面链接" });
  else notifyParent("connecting", { message: "正在获取真实云电脑画面链接" });
  setStatus("连接中", "pending");
  showMessage("正在连接云电脑画面", "正在获取真实画面链接并连接云电脑。", { retry: false });
  disconnectButton.disabled = true;
  closeClient();
  clearScreen();
  const url = await freshTarget();
  const next = new RFB(screen, url, { wsProtocols: VNC_WS_PROTOCOLS });
  next.scaleViewport = true;
  next.resizeSession = true;
  next.viewOnly = false;
  next.background = "#070912";
  next.focusOnClick = true;
  next.showDotCursor = true;
  next.addEventListener("connect", () => {
    if (client !== next || stopped) return;
    clearConnectionTimer();
    reconnectAttempt = 0;
    setStatus("已连接", "success");
    notifyParent("connected", { message: "云电脑画面已连接" });
    disconnectButton.disabled = false;
    hideMessage();
    screen.focus();
    scheduleCredentialRenewal();
  });
  next.addEventListener("disconnect", (event) => {
    if (client !== next || stopped) return;
    clearConnectionTimer();
    client = null;
    disconnectButton.disabled = true;
    clearScreen();
    notifyParent("disconnected", { message: "云电脑画面已断开" });
    if (intentionalDisconnect) {
      if (terminalViewerError) return;
      setStatus("已断开");
      showMessage("云电脑画面已断开", "云电脑会话仍保留在这台 Agent 上。点击“重新连接”即可继续。");
      return;
    }
    const clean = event?.detail?.clean === true;
    scheduleReconnect(clean ? "画面连接已关闭" : "网络或远端画面连接异常");
  });
  next.addEventListener("credentialsrequired", () => {
    if (client !== next || stopped) return;
    clearConnectionTimer();
    terminalViewerError = true;
    intentionalDisconnect = true;
    setStatus("缺少画面凭据", "error");
    notifyParent("error", { message: "画面凭据没有返回" });
    disconnectButton.disabled = true;
    showMessage("云电脑画面无法验证", "画面凭据没有返回，请点击“重新连接”获取新的画面链接。");
    try { next.disconnect(); } catch {}
  });
  client = next;
  scheduleConnectionTimeout(next);
}

disconnectButton.addEventListener("click", () => {
  intentionalDisconnect = true;
  clearCredentialRenewalTimer();
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  closeClient();
  disconnectButton.disabled = true;
  setStatus("已断开");
  showMessage("云电脑画面已断开", "云电脑会话仍保留在这台 Agent 上。点击“重新连接”即可继续。");
});

async function reconnect() {
  if (reconnectButton.disabled || stopped) return;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  reconnectAttempt = 0;
  intentionalDisconnect = false;
  reconnectButton.disabled = true;
  messageReconnectButton.disabled = true;
  try {
    if (!targetUrl || isExpired()) await fetchFreshTarget({ userInitiated: true });
    await connect({ userInitiated: true });
  } catch (error) {
    showConnectionError(error);
  } finally {
    reconnectButton.disabled = false;
    messageReconnectButton.disabled = false;
  }
}

reconnectButton.addEventListener("click", reconnect);
messageReconnectButton.addEventListener("click", reconnect);

fullscreenButton.addEventListener("click", () => {
  document.documentElement.requestFullscreen?.().catch(() => {});
});

globalThis.addEventListener("online", () => {
  if (!client && !stopped) {
    reconnectAttempt = 0;
    void connect().catch(() => scheduleReconnect("网络已恢复，正在重新连接"));
  }
});

globalThis.addEventListener("message", (event) => {
  if (event.origin !== globalThis.location?.origin || event.source !== globalThis.parent) return;
  const request = event.data;
  if (request?.type === "byering-cloud-viewer-status-request" && request.agentId === agentId) {
    replyWithCurrentState();
    return;
  }
  if (request?.type === "byering-cloud-viewer-recording-start" && request.agentId === agentId && request.recordingId) {
    startWorkRecording({
      recordingId: request.recordingId,
      captureProfile: request.captureProfile,
      captureRegion: request.captureRegion
    });
    return;
  }
  if (request?.type !== "byering-cloud-viewer-capture" || request.agentId !== agentId || !request.captureId) return;
  sendFrameCapture(String(request.captureId), {
    maxEdge: Number(request.maxEdge) || 880,
    quality: Number(request.quality) || 0.68,
    captureProfile: request.captureProfile,
    captureRegion: request.captureRegion
  });
});

globalThis.addEventListener("beforeunload", () => {
  stopped = true;
  intentionalDisconnect = true;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  clearConnectionTimer();
  clearCredentialRenewalTimer();
  stopWorkRecording();
  closeClient();
});

updateExpiry();
globalThis.setInterval(updateExpiry, 1_000);
void connect().catch((error) => {
  showConnectionError(error);
});
