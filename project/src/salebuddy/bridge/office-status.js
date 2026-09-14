import { receptionBaseUrl } from "./account-reception-client.js";

async function requestSnapshot({ signal }) {
  const config = globalThis.__SALEBUDDY_CONFIG__ || {};
  const key = config.controlPlaneApiKey || globalThis.document?.querySelector('meta[name="salebuddy-control-plane-api-key"]')?.content;
  const header = (config.controlPlaneApiKeyHeader || "authorization").toLowerCase();
  const response = await fetch(`${receptionBaseUrl()}/v1/office/status`, { signal, cache: "no-store",
    headers: { accept: "application/json", ...(key ? { [header]: header === "authorization" ? `Bearer ${key}` : key } : {}) } });
  if (!response.ok) throw Error("Office status unavailable");
  return response.json();
}

export function createOfficeStatusStore({ fetchSnapshot = requestSnapshot, getLocalWorks = () => [], getAgentIds = () => [], now = Date.now, staleMs = 15000, timeoutMs = 6000 } = {}) {
  let snapshot = null, receivedAt = null, failed = false, pending = null, disposed = false, controller = null;
  const listeners = new Set();
  function getWorks() {
    const local = new Map(getLocalWorks().map(work => [work.agentType, work]));
    const remote = new Map((snapshot?.works || []).map(work => [work.agentType, work]));
    const stale = disposed || failed || receivedAt === null || now() - receivedAt > staleMs;
    return getAgentIds().map(agentType => {
      const fresh = remote.get(agentType);
      const cached = local.get(agentType);
      const sameTask = fresh?.metadata?.taskId && cached?.metadata?.taskId === fresh.metadata.taskId;
      const work = { ...(sameTask ? cached : {}), ...fresh, agentType,
        metadata: { ...(sameTask ? cached.metadata : {}), ...fresh?.metadata } };
      if (!work.task && sameTask) work.task = cached.task;
      const cachedState = String(cached?.metadata?.taskState || cached?.state || "").toLowerCase();
      const pendingTaskStates = ["working", "running", "starting", "configuring", "paused", "waiting_reply", "unknown"];
      const hasPendingCachedTask = cached?.projectId !== "demo-office" && cached?.metadata?.simulated !== true
        && pendingTaskStates.includes(cachedState);
      const remoteStatus = String(fresh?.metadata?.officeStatus || "").toLowerCase();
      const hasStaleRemoteTask = Boolean(fresh?.metadata?.taskId)
        && ["working", "listening", "paused", "attention", "unknown"].includes(remoteStatus);
      const unobservedTask = remoteStatus === "idle" && !fresh?.metadata?.taskId && hasPendingCachedTask;
      const state = unobservedTask || ((stale || !fresh) && (hasPendingCachedTask || hasStaleRemoteTask))
        ? "unknown"
        : remoteStatus || "idle";
      const officeStatusPhase = state !== "unknown" ? "ready"
        : receivedAt === null && !failed ? "loading" : stale ? "unavailable" : "unobserved";
      return { ...work, state, lastError: null, metadata: { ...work.metadata, taskState: state, officeStatus: state, officeStatusPhase } };
    });
  }
  function refresh() {
    if (disposed) return Promise.resolve();
    if (pending) return pending;
    controller = new AbortController();
    const signal = controller.signal;
    pending = (async () => {
      let timer;
      try {
        const result = await Promise.race([fetchSnapshot({ signal }), new Promise((_, reject) => {
          timer = setTimeout(() => { controller?.abort(); reject(Error("Office status timeout")); }, timeoutMs);
        })]);
        if (disposed) return;
        if (!Array.isArray(result?.works) || result.works.some(work => !work?.agentType || !["working", "listening", "paused", "attention", "unknown", "idle"].includes(work.metadata?.officeStatus))) throw Error("Invalid office snapshot");
        snapshot = result; receivedAt = now(); failed = false;
      } catch { if (!disposed) failed = true; }
      finally { clearTimeout(timer); if (!disposed) for (const listener of listeners) listener(); }
    })().finally(() => { pending = null; });
    return pending;
  }
  return { getWorks, getWork: id => getWorks().find(work => work.agentType === id) || null, refresh,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    dispose() { disposed = true; controller?.abort(); listeners.clear(); } };
}
