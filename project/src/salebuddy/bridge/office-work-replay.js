import { receptionBaseUrl } from "./account-reception-client.js";

function headers() {
  const config = globalThis.__SALEBUDDY_CONFIG__ || {};
  const key = config.controlPlaneApiKey || globalThis.document?.querySelector?.('meta[name="salebuddy-control-plane-api-key"]')?.content;
  const name = String(config.controlPlaneApiKeyHeader || "authorization").toLowerCase();
  return { accept: "application/json", ...(key ? { [name]: name === "authorization" ? `Bearer ${key}` : key } : {}) };
}

function endpoint(path) {
  return `${receptionBaseUrl()}${path}`;
}

export async function listOfficeReplay(agentId, { taskId = null, limit = 8, latestOnly = true, successfulOnly = false } = {}) {
  const query = new URLSearchParams({ agentId: String(agentId || ""), limit: String(limit), latestOnly: latestOnly ? "1" : "0", successfulOnly: successfulOnly ? "1" : "0" });
  if (taskId) query.set("taskId", String(taskId));
  const response = await fetch(endpoint(`/v1/office/replay?${query}`), { cache: "no-store", headers: headers() });
  if (!response.ok) throw Error("工作回放暂时无法读取");
  const result = await response.json();
  return {
    ...result,
    snapshots: Array.isArray(result?.snapshots) ? result.snapshots.map(snapshot => ({
      ...snapshot,
      imageUrl: snapshot?.imageUrl ? new URL(snapshot.imageUrl, `${receptionBaseUrl()}/`).toString() : null
    })) : [],
    segments: Array.isArray(result?.segments) ? result.segments.map(segment => ({
      ...segment,
      videoUrl: segment?.videoUrl ? new URL(segment.videoUrl, `${receptionBaseUrl()}/`).toString() : null
    })) : []
  };
}

export async function saveOfficeReplaySnapshot(payload) {
  const response = await fetch(endpoint("/v1/office/replay/snapshot"), {
    method: "POST",
    headers: { ...headers(), "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw Error("工作画面暂时无法保存");
  return response.json();
}

export async function markOfficeReplayTask({ agentId, taskId, recordingId = null, outcome = "success" } = {}) {
  const response = await fetch(endpoint("/v1/office/replay/task"), {
    method: "POST",
    headers: { ...headers(), "content-type": "application/json" },
    body: JSON.stringify({ agentId, taskId, recordingId, outcome })
  });
  if (!response.ok) throw Error("工作结果暂时无法确认");
  return response.json();
}

export async function loadOfficeReplayImage(snapshot) {
  if (!snapshot?.imageUrl) throw Error("工作画面地址不存在");
  const response = await fetch(snapshot.imageUrl, { cache: "no-store", headers: headers() });
  if (!response.ok) throw Error("工作画面暂时无法读取");
  const blob = await response.blob();
  if (!blob.size || !blob.type.startsWith("image/")) throw Error("工作画面格式无效");
  const createObjectURL = globalThis.URL?.createObjectURL;
  if (typeof createObjectURL !== "function") throw Error("当前设备不支持显示工作回放");
  return createObjectURL.call(globalThis.URL, blob);
}

export async function saveOfficeReplayVideo({ agentId, taskId = null, taskRunId = null, recordingId, title, detail = "", durationMs = 5_000, outcome = "unknown", videoData } = {}) {
  if (!videoData || typeof videoData.size !== "number" || !String(videoData.type || "").startsWith("video/webm")) {
    throw Error("工作画面视频格式无效");
  }
  const query = new URLSearchParams({
    agentId: String(agentId || ""),
    recordingId: String(recordingId || ""),
    title: String(title || ""),
    detail: String(detail || ""),
    outcome: String(outcome || "unknown"),
    durationMs: String(durationMs || 5_000)
  });
  if (taskId) query.set("taskId", String(taskId));
  if (taskRunId) query.set("taskRunId", String(taskRunId));
  const response = await fetch(endpoint(`/v1/office/replay/video?${query}`), {
    method: "POST",
    headers: { ...headers(), "content-type": videoData.type },
    body: videoData
  });
  if (!response.ok) throw Error("工作画面视频暂时无法保存");
  return response.json();
}

export async function loadOfficeReplayVideo(segment) {
  if (!segment?.videoUrl) throw Error("工作画面视频地址不存在");
  const response = await fetch(segment.videoUrl, { cache: "no-store", headers: headers() });
  if (!response.ok) throw Error("工作画面视频暂时无法读取");
  const blob = await response.blob();
  if (!blob.size || !blob.type.startsWith("video/")) throw Error("工作画面视频格式无效");
  const createObjectURL = globalThis.URL?.createObjectURL;
  if (typeof createObjectURL !== "function") throw Error("当前设备不支持播放工作画面");
  return createObjectURL.call(globalThis.URL, blob);
}
