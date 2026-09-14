import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

const VERSION = 4;
const MAX_SNAPSHOTS_PER_AGENT = 30;
const MAX_VIDEO_SEGMENTS_PER_AGENT = 12;
const MAX_VIDEO_SEGMENTS_PER_TASK = 3;
const REQUIRED_SUCCESS_REPLAY_DURATION_MS = 15_000;
const MAX_IMAGE_BYTES = 900 * 1024;
const MAX_VIDEO_BYTES = 8 * 1024 * 1024;
const MAX_TEXT_LENGTH = 180;

function text(value, limit = MAX_TEXT_LENGTH) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function safeAgentId(value) {
  const agentId = text(value, 100);
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(agentId)) throw Object.assign(new Error("Invalid agentId"), { code: "OFFICE_REPLAY_AGENT_INVALID", statusCode: 400 });
  return agentId;
}

function ownerKey(tenantId) {
  return createHash("sha256").update(String(tenantId || "local")).digest("hex").slice(0, 24);
}

function writeJsonAtomic(file, value) {
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value)}\n`, { encoding: "utf8", mode: 0o600 });
  renameSync(temporary, file);
}

function readJson(file, fallback) {
  try { return JSON.parse(readFileSync(file, "utf8")); } catch { return fallback; }
}

function decodeJpeg(dataUrl) {
  const value = text(dataUrl, Math.ceil(MAX_IMAGE_BYTES * 1.5));
  const match = /^data:image\/jpeg;base64,([a-z0-9+/=]+)$/i.exec(value);
  if (!match) throw Object.assign(new Error("Only JPEG snapshots are supported"), { code: "OFFICE_REPLAY_IMAGE_INVALID", statusCode: 400 });
  const body = Buffer.from(match[1], "base64");
  if (!body.length || body.length > MAX_IMAGE_BYTES || body[0] !== 0xff || body[1] !== 0xd8) {
    throw Object.assign(new Error("Snapshot image is invalid or too large"), { code: "OFFICE_REPLAY_IMAGE_INVALID", statusCode: 400 });
  }
  return body;
}

function decodeWebm(body) {
  const video = Buffer.isBuffer(body) ? body : Buffer.from(body || []);
  if (video.length < 4 || video.length > MAX_VIDEO_BYTES || !video.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) {
    throw Object.assign(new Error("Video segment is invalid or too large"), { code: "OFFICE_REPLAY_VIDEO_INVALID", statusCode: 400 });
  }
  return video;
}

function latestTask(records) {
  return records.slice().sort((left, right) => Date.parse(right.capturedAt) - Date.parse(left.capturedAt))[0]?.taskId || null;
}

function replayOutcome(value) {
  const outcome = String(value || "unknown").trim().toLowerCase();
  return ["success", "failed", "cancelled", "unknown"].includes(outcome) ? outcome : "unknown";
}

function taskReplayState(value) {
  if (typeof value === "string") {
    return {
      outcome: replayOutcome(value),
      recordingId: null,
      requiredDurationMs: REQUIRED_SUCCESS_REPLAY_DURATION_MS,
      replayReady: replayOutcome(value) !== "success"
    };
  }
  const source = value && typeof value === "object" ? value : {};
  const outcome = replayOutcome(source.outcome);
  return {
    outcome,
    recordingId: text(source.recordingId, 220) || null,
    requiredDurationMs: Math.max(1_000, Math.min(60_000, Number(source.requiredDurationMs) || REQUIRED_SUCCESS_REPLAY_DURATION_MS)),
    replayReady: source.replayReady === true
  };
}

function taskReplayStates(tasks) {
  return Object.fromEntries(Object.entries(tasks && typeof tasks === "object" ? tasks : {})
    .map(([taskId, state]) => [taskId, taskReplayState(state)]));
}

function groupedRecordingDuration(segments, taskId, recordingId) {
  return segments
    .filter((segment) => segment.taskId === taskId && segment.recordingId === recordingId)
    .reduce((total, segment) => total + (Number(segment.durationMs) || 0), 0);
}

function latestRecordingId(segments, taskId) {
  return segments
    .filter((segment) => segment.taskId === taskId && segment.recordingId)
    .sort((left, right) => Date.parse(right.capturedAt) - Date.parse(left.capturedAt))[0]?.recordingId || null;
}

function finalizeSuccessfulReplay(index, taskId, recordingId = null) {
  const task = taskReplayState(index.tasks[taskId]);
  if (task.outcome !== "success") return { state: "not_requested", durationMs: 0, requiredDurationMs: task.requiredDurationMs };
  const selectedRecordingId = recordingId || task.recordingId || latestRecordingId(index.segments, taskId);
  if (!selectedRecordingId) {
    index.tasks[taskId] = { ...task, replayReady: false };
    return { state: "pending_recording", durationMs: 0, requiredDurationMs: task.requiredDurationMs, recordingId: null };
  }
  const durationMs = groupedRecordingDuration(index.segments, taskId, selectedRecordingId);
  if (durationMs < task.requiredDurationMs) {
    index.tasks[taskId] = { ...task, recordingId: selectedRecordingId, replayReady: false };
    return { state: "recording", durationMs, requiredDurationMs: task.requiredDurationMs, recordingId: selectedRecordingId };
  }
  index.tasks[taskId] = { ...task, recordingId: selectedRecordingId, replayReady: true };
  index.snapshots.forEach((record) => {
    if (record.taskId === taskId) record.outcome = "success";
  });
  index.segments.forEach((record) => {
    if (record.taskId === taskId && record.recordingId === selectedRecordingId) record.outcome = "success";
  });
  return { state: "ready", durationMs, requiredDurationMs: task.requiredDurationMs, recordingId: selectedRecordingId };
}

/** Stores compact work-screen fallbacks and recent Canvas-recorded video segments. */
export function createOfficeWorkReplayStore({
  root = process.env.BYERING_OFFICE_REPLAY_ROOT || join(homedir(), ".byering", "office-work-replay"),
  now = () => Date.now()
} = {}) {
  function directory(tenantId, agentId) {
    return join(root, ownerKey(tenantId), safeAgentId(agentId));
  }

  function indexFile(tenantId, agentId) {
    return join(directory(tenantId, agentId), "index.json");
  }

  function readIndex(tenantId, agentId) {
    const file = indexFile(tenantId, agentId);
    const stored = readJson(file, { version: VERSION, snapshots: [], segments: [], tasks: {} });
    return {
      snapshots: Array.isArray(stored?.snapshots) ? stored.snapshots.filter(record => record && typeof record === "object") : [],
      segments: Array.isArray(stored?.segments) ? stored.segments.filter(record => record && typeof record === "object") : [],
      tasks: taskReplayStates(stored?.tasks)
    };
  }

  function writeIndex(tenantId, agentId, { snapshots = [], segments = [], tasks = {} }) {
    const dir = directory(tenantId, agentId);
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    writeJsonAtomic(join(dir, "index.json"), { version: VERSION, snapshots, segments, tasks });
  }

  function publicRecord(record) {
    return {
      id: record.id,
      agentId: record.agentId,
      taskId: record.taskId || null,
      taskRunId: record.taskRunId || null,
      title: record.title,
      detail: record.detail || "",
      capturedAt: record.capturedAt,
      imageUrl: record.imageUrl,
      outcome: replayOutcome(record.outcome)
    };
  }

  function publicSegment(record) {
    return {
      id: record.id,
      agentId: record.agentId,
      taskId: record.taskId || null,
      taskRunId: record.taskRunId || null,
      title: record.title,
      detail: record.detail || "",
      recordingId: record.recordingId || null,
      durationMs: record.durationMs,
      capturedAt: record.capturedAt,
      videoUrl: record.videoUrl,
      outcome: replayOutcome(record.outcome)
    };
  }

  function list({ tenantId = null, agentId, taskId = null, limit = 8, latestOnly = true, successfulOnly = false } = {}) {
    const id = safeAgentId(agentId);
    const index = readIndex(tenantId, id);
    const records = index.snapshots.sort((left, right) => Date.parse(right.capturedAt) - Date.parse(left.capturedAt));
    const segments = index.segments.sort((left, right) => Date.parse(right.capturedAt) - Date.parse(left.capturedAt));
    const visibleRecords = successfulOnly ? records.filter(record => replayOutcome(record.outcome) === "success") : records;
    const visibleSegments = successfulOnly ? segments.filter(record => replayOutcome(record.outcome) === "success") : segments;
    const selectedTaskId = text(taskId, 160) || (latestOnly ? latestTask([...visibleRecords, ...visibleSegments]) : null);
    const scoped = selectedTaskId ? visibleRecords.filter(record => record.taskId === selectedTaskId) : visibleRecords;
    const scopedSegments = selectedTaskId ? visibleSegments.filter(record => record.taskId === selectedTaskId) : visibleSegments;
    return {
      agentId: id,
      taskId: selectedTaskId,
      snapshots: scoped.slice(0, Math.max(1, Math.min(MAX_SNAPSHOTS_PER_AGENT, Number(limit) || 8))).map(publicRecord),
      segments: scopedSegments.slice(0, MAX_VIDEO_SEGMENTS_PER_TASK).map(publicSegment)
    };
  }

  function capture({ tenantId = null, agentId, taskId = null, taskRunId = null, eventKey, title, detail = "", imageData } = {}) {
    const id = safeAgentId(agentId);
    const key = text(eventKey, 220);
    const label = text(title);
    if (!key || !label) throw Object.assign(new Error("Snapshot eventKey and title are required"), { code: "OFFICE_REPLAY_INPUT_REQUIRED", statusCode: 400 });
    const image = decodeJpeg(imageData);
    const normalizedTaskId = text(taskId, 160) || null;
    const index = readIndex(tenantId, id);
    const duplicate = index.snapshots.find(record => record.eventKey === key && record.taskId === normalizedTaskId);
    if (duplicate) return { snapshot: publicRecord(duplicate), duplicate: true };
    const dir = directory(tenantId, id);
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const snapshot = {
      id: `frame-${randomUUID()}`,
      agentId: id,
      taskId: normalizedTaskId,
      taskRunId: text(taskRunId, 160) || null,
      eventKey: key,
      title: label,
      detail: text(detail),
      outcome: normalizedTaskId ? taskReplayState(index.tasks[normalizedTaskId]).outcome : "unknown",
      capturedAt: new Date(Number(now())).toISOString(),
      imageFile: "",
      imageUrl: ""
    };
    snapshot.imageFile = `${snapshot.id}.jpg`;
    snapshot.imageUrl = `/v1/office/replay/image?agentId=${encodeURIComponent(id)}&snapshotId=${encodeURIComponent(snapshot.id)}`;
    writeFileSync(join(dir, snapshot.imageFile), image, { mode: 0o600 });
    const ordered = [snapshot, ...index.snapshots].sort((left, right) => Date.parse(right.capturedAt) - Date.parse(left.capturedAt));
    const stale = ordered.splice(MAX_SNAPSHOTS_PER_AGENT);
    for (const record of stale) {
      if (record?.imageFile) rmSync(join(dir, record.imageFile), { force: true });
    }
    writeIndex(tenantId, id, { snapshots: ordered, segments: index.segments, tasks: index.tasks });
    return { snapshot: publicRecord(snapshot), duplicate: false };
  }

  function image({ tenantId = null, agentId, snapshotId } = {}) {
    const id = safeAgentId(agentId);
    const record = readIndex(tenantId, id).snapshots.find(item => item.id === text(snapshotId, 160));
    if (!record?.imageFile) return null;
    const file = join(directory(tenantId, id), record.imageFile);
    if (!existsSync(file)) return null;
    return { body: readFileSync(file), contentType: "image/jpeg" };
  }

  function captureVideo({ tenantId = null, agentId, taskId = null, taskRunId = null, recordingId, title, detail = "", outcome = "unknown", durationMs, videoData } = {}) {
    const id = safeAgentId(agentId);
    const recording = text(recordingId, 220);
    const label = text(title);
    const duration = Math.max(1_000, Math.min(10_000, Number(durationMs) || 5_000));
    if (!recording || !label) throw Object.assign(new Error("Video recordingId and title are required"), { code: "OFFICE_REPLAY_VIDEO_INPUT_REQUIRED", statusCode: 400 });
    const video = decodeWebm(videoData);
    const normalizedTaskId = text(taskId, 160) || null;
    const index = readIndex(tenantId, id);
    const dir = directory(tenantId, id);
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const segment = {
      id: `segment-${randomUUID()}`,
      agentId: id,
      taskId: normalizedTaskId,
      taskRunId: text(taskRunId, 160) || null,
      recordingId: recording,
      title: label,
      detail: text(detail),
      outcome: normalizedTaskId
        ? taskReplayState(index.tasks[normalizedTaskId]).replayReady ? "success" : "unknown"
        : replayOutcome(outcome),
      durationMs: duration,
      capturedAt: new Date(Number(now())).toISOString(),
      videoFile: "",
      videoUrl: ""
    };
    segment.videoFile = `${segment.id}.webm`;
    segment.videoUrl = `/v1/office/replay/video?agentId=${encodeURIComponent(id)}&segmentId=${encodeURIComponent(segment.id)}`;
    writeFileSync(join(dir, segment.videoFile), video, { mode: 0o600 });
    const ordered = [segment, ...index.segments].sort((left, right) => Date.parse(right.capturedAt) - Date.parse(left.capturedAt));
    const stale = ordered.splice(MAX_VIDEO_SEGMENTS_PER_AGENT);
    for (const record of stale) {
      if (record?.videoFile) rmSync(join(dir, record.videoFile), { force: true });
    }
    index.segments = ordered;
    const replay = normalizedTaskId ? finalizeSuccessfulReplay(index, normalizedTaskId, recording) : null;
    writeIndex(tenantId, id, { snapshots: index.snapshots, segments: index.segments, tasks: index.tasks });
    const persisted = index.segments.find((record) => record.id === segment.id) || segment;
    return { segment: publicSegment(persisted), replay };
  }

  function markTask({ tenantId = null, agentId, taskId, recordingId = null, outcome = "success" } = {}) {
    const id = safeAgentId(agentId);
    const normalizedTaskId = text(taskId, 160);
    if (!normalizedTaskId) throw Object.assign(new Error("taskId is required"), { code: "OFFICE_REPLAY_TASK_REQUIRED", statusCode: 400 });
    const normalizedOutcome = replayOutcome(outcome);
    if (normalizedOutcome === "unknown") throw Object.assign(new Error("A concrete task outcome is required"), { code: "OFFICE_REPLAY_OUTCOME_INVALID", statusCode: 400 });
    const index = readIndex(tenantId, id);
    const requestedRecordingId = text(recordingId, 220) || null;
    let snapshots = 0;
    let segments = 0;
    let replay = null;
    if (normalizedOutcome === "success") {
      index.tasks[normalizedTaskId] = {
        outcome: normalizedOutcome,
        recordingId: requestedRecordingId || taskReplayState(index.tasks[normalizedTaskId]).recordingId,
        requiredDurationMs: REQUIRED_SUCCESS_REPLAY_DURATION_MS,
        replayReady: false
      };
      replay = finalizeSuccessfulReplay(index, normalizedTaskId, requestedRecordingId);
      snapshots = index.snapshots.filter((record) => record.taskId === normalizedTaskId && replay?.state === "ready").length;
      segments = index.segments.filter((record) => record.taskId === normalizedTaskId && record.outcome === "success").length;
    } else {
      index.snapshots.forEach(record => {
        if (record.taskId === normalizedTaskId) { record.outcome = normalizedOutcome; snapshots += 1; }
      });
      index.segments.forEach(record => {
        if (record.taskId === normalizedTaskId) { record.outcome = normalizedOutcome; segments += 1; }
      });
      index.tasks[normalizedTaskId] = {
        outcome: normalizedOutcome,
        recordingId: requestedRecordingId,
        requiredDurationMs: REQUIRED_SUCCESS_REPLAY_DURATION_MS,
        replayReady: true
      };
    }
    writeIndex(tenantId, id, { snapshots: index.snapshots, segments: index.segments, tasks: index.tasks });
    return { agentId: id, taskId: normalizedTaskId, outcome: normalizedOutcome, updated: { snapshots, segments }, replay };
  }

  function video({ tenantId = null, agentId, segmentId } = {}) {
    const id = safeAgentId(agentId);
    const record = readIndex(tenantId, id).segments.find(item => item.id === text(segmentId, 160));
    if (!record?.videoFile) return null;
    const file = join(directory(tenantId, id), record.videoFile);
    if (!existsSync(file)) return null;
    return { body: readFileSync(file), contentType: "video/webm" };
  }

  function purge({ tenantId = null, agentId, taskId = null } = {}) {
    const id = safeAgentId(agentId);
    const normalizedTaskId = text(taskId, 160) || null;
    const dir = directory(tenantId, id);
    if (!normalizedTaskId) {
      const index = readIndex(tenantId, id);
      rmSync(dir, { recursive: true, force: true });
      return { agentId: id, taskId: null, deleted: { snapshots: index.snapshots.length, segments: index.segments.length } };
    }
    const index = readIndex(tenantId, id);
    const snapshots = index.snapshots.filter((record) => record.taskId === normalizedTaskId);
    const segments = index.segments.filter((record) => record.taskId === normalizedTaskId);
    for (const record of snapshots) if (record.imageFile) rmSync(join(dir, record.imageFile), { force: true });
    for (const record of segments) if (record.videoFile) rmSync(join(dir, record.videoFile), { force: true });
    const nextTasks = { ...index.tasks };
    delete nextTasks[normalizedTaskId];
    writeIndex(tenantId, id, {
      snapshots: index.snapshots.filter((record) => record.taskId !== normalizedTaskId),
      segments: index.segments.filter((record) => record.taskId !== normalizedTaskId),
      tasks: nextTasks
    });
    return { agentId: id, taskId: normalizedTaskId, deleted: { snapshots: snapshots.length, segments: segments.length } };
  }

  return {
    list,
    capture,
    image,
    captureVideo,
    markTask,
    video,
    purge,
    maxSnapshots: MAX_SNAPSHOTS_PER_AGENT,
    maxVideoSegments: MAX_VIDEO_SEGMENTS_PER_AGENT,
    requiredSuccessReplayDurationMs: REQUIRED_SUCCESS_REPLAY_DURATION_MS
  };
}
