/**
 * Keep a long-running Douyin outreach action observable without inventing a
 * short client-side deadline. The action is considered unhealthy only after
 * repeated cloud-worker failures, which avoids transient status blips.
 */
export function isDouyinCloudOnline(status = {}) {
  const state = String(status?.state || "").toUpperCase();
  const loginState = String(status?.login_state || status?.loginState || "").toLowerCase();
  const displayState = String(status?.display_state || status?.displayState || "").toLowerCase();
  const sessionState = String(status?.session_state || status?.sessionState || "").toLowerCase();
  const workerOnline = status?.worker?.online;
  const authorized = new Set(["logged_in", "authenticated", "authorized", "ready", "success", "已登录"]);
  const connectingStates = new Set(["starting", "provisioning", "initializing", "booting", "connecting", "opening", "pending"]);
  return authorized.has(loginState)
    && workerOnline !== false
    && state !== "STARTING"
    && !connectingStates.has(displayState)
    && !connectingStates.has(sessionState)
    && displayState !== "error"
    && Boolean(status?.account);
}

export function isDouyinCloudProvisioning(status = {}) {
  const state = String(status?.state || "").toUpperCase();
  const displayState = String(status?.display_state || status?.displayState || "").toLowerCase();
  const sessionState = String(status?.session_state || status?.sessionState || "").toLowerCase();
  return status?.provisioning === true
    || state === "STARTING"
    || ["starting", "provisioning", "initializing", "booting", "connecting", "opening", "pending"].includes(displayState)
    || ["starting", "provisioning", "initializing", "connecting", "opening", "pending"].includes(sessionState);
}

export function isDouyinCloudDefinitiveOffline(status = {}) {
  const state = String(status?.state || "").toUpperCase();
  const displayState = String(status?.display_state || status?.displayState || "").toLowerCase();
  const sessionState = String(status?.session_state || status?.sessionState || "").toLowerCase();
  const terminalStates = new Set(["ERROR", "OFFLINE", "DISCONNECTED", "STOPPED", "EXPIRED"]);
  const terminalDisplayStates = new Set(["error", "offline", "disconnected", "stopped", "expired"]);
  const workerOnline = status?.worker?.online;
  return terminalStates.has(state)
    || terminalDisplayStates.has(displayState)
    || terminalDisplayStates.has(sessionState)
    || (workerOnline === false && !isDouyinCloudProvisioning(status));
}

export function createDouyinCloudWatch({
  readStatus,
  onStatus,
  onOffline,
  intervalMs = 5000,
  offlineThreshold = 2,
  startupGraceMs = 10 * 60 * 1000,
  timerApi = globalThis
} = {}) {
  if (typeof readStatus !== "function") throw new TypeError("readStatus must be a function");
  const setTimer = timerApi?.setTimeout || setTimeout;
  const clearTimer = timerApi?.clearTimeout || clearTimeout;
  let active = true;
  let timer = null;
  let failures = 0;
  let transportFailures = 0;
  let notifiedOffline = false;
  let observedOnline = false;
  const startedAt = Date.now();

  const poll = async () => {
    if (!active) return;
    try {
      const status = await readStatus();
      if (!active) return;
      const online = isDouyinCloudOnline(status);
      const provisioning = isDouyinCloudProvisioning(status);
      if (online) {
        observedOnline = true;
        failures = 0;
        transportFailures = 0;
        notifiedOffline = false;
      } else if (provisioning || (!observedOnline && Date.now() - startedAt < Math.max(0, Number(startupGraceMs) || 0))) {
        // A cloud desktop can legitimately report no worker/account while its
        // remote browser is still booting. That is not a disconnect.
        failures = 0;
        transportFailures = 0;
      } else if (isDouyinCloudDefinitiveOffline(status)) {
        failures += 1;
        transportFailures = 0;
        if (failures >= Math.max(1, Number(offlineThreshold) || 1) && !notifiedOffline) {
          notifiedOffline = true;
          onOffline?.(status);
        }
      } else {
        // A valid but non-terminal status (for example login_required) is not
        // enough evidence that the cloud desktop disconnected. Keep waiting.
        failures = 0;
        transportFailures = 0;
      }
      onStatus?.(status, { online, provisioning, observedOnline, failures, transportFailures, definitiveOffline: isDouyinCloudDefinitiveOffline(status) });
    } catch (error) {
      if (!active) return;
      // Status calls share the MCP worker with the actual browser action. A
      // queued call can time out while the cloud desktop is healthy. Surface
      // the transient condition, but never terminate the task from it.
      transportFailures += 1;
      onStatus?.({ error }, { online: false, provisioning: !observedOnline, observedOnline, failures, transportFailures, transportError: true, definitiveOffline: false });
    } finally {
      if (active) timer = setTimer(poll, Math.max(1000, Number(intervalMs) || 5000));
    }
  };

  void poll();
  return () => {
    active = false;
    if (timer) clearTimer(timer);
    timer = null;
  };
}
