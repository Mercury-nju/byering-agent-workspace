import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const DEFAULT_FFMPEG_PATH = "/opt/homebrew/bin/ffmpeg";
const DEFAULT_SECONDS_PER_FRAME = 45;
const DEFAULT_MIN_FRAME_COUNT = 4;
const DEFAULT_MAX_BYTES = 80 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_SCENE_THRESHOLD = 0.22;

export class VideoFrameExtractionError extends Error {
  constructor(message, { code = "VIDEO_FRAME_EXTRACTION_FAILED", statusCode = 502, details = {}, cause } = {}) {
    super(message);
    this.name = "VideoFrameExtractionError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.cause = cause;
  }
}

export function createVideoFrameExtractionService({
  fetchImpl = globalThis.fetch,
  ffmpegPath = process.env.BYERING_FFMPEG_PATH || DEFAULT_FFMPEG_PATH,
  frameCount = null,
  minFrameCount = DEFAULT_MIN_FRAME_COUNT,
  secondsPerFrame = DEFAULT_SECONDS_PER_FRAME,
  sceneThreshold = process.env.BYERING_VIDEO_SCENE_THRESHOLD,
  maxBytes = process.env.BYERING_VIRAL_VIDEO_MAX_BYTES,
  timeoutMs = process.env.BYERING_VIDEO_FRAME_TIMEOUT_MS,
  tempRoot = tmpdir(),
  runCommand = runProcess
} = {}) {
  const resolvedMaxBytes = positiveInteger(maxBytes, DEFAULT_MAX_BYTES);
  const resolvedTimeoutMs = positiveInteger(timeoutMs, DEFAULT_TIMEOUT_MS);
  const requestedFrameCount = positiveIntegerOrNull(frameCount);
  const resolvedMinFrameCount = Math.max(1, positiveInteger(minFrameCount, DEFAULT_MIN_FRAME_COUNT));
  const resolvedSecondsPerFrame = positiveNumber(secondsPerFrame, DEFAULT_SECONDS_PER_FRAME);
  const resolvedSceneThreshold = boundedNumber(sceneThreshold, DEFAULT_SCENE_THRESHOLD, 0.05, 0.8);

  async function extract({ videoUrl, durationMs, workId = "", contentSegments = [], contentAnchors = [] } = {}) {
    const sourceUrl = normalizeHttpUrl(videoUrl);
    if (!sourceUrl) {
      throw new VideoFrameExtractionError("视频资源地址无效，无法选择视频代表画面", {
        code: "VIDEO_FRAME_SOURCE_INVALID"
      });
    }
    if (typeof fetchImpl !== "function") {
      throw new VideoFrameExtractionError("视频资源下载客户端不可用", {
        code: "VIDEO_FRAME_FETCH_UNAVAILABLE",
        statusCode: 503
      });
    }

    const response = await fetchImpl(sourceUrl);
    if (!response?.ok) {
      throw new VideoFrameExtractionError("视频资源下载失败，无法选择视频代表画面", {
        code: "VIDEO_FRAME_FETCH_FAILED",
        details: { providerStatus: response?.status || null }
      });
    }
    const contentLength = Number(response.headers?.get?.("content-length"));
    if (Number.isFinite(contentLength) && contentLength > resolvedMaxBytes) {
      throw new VideoFrameExtractionError("视频文件超过代表画面解析大小限制", {
        code: "VIDEO_FRAME_SOURCE_TOO_LARGE",
        details: { maxBytes: resolvedMaxBytes, contentLength }
      });
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length) {
      throw new VideoFrameExtractionError("视频资源为空，无法选择视频代表画面", {
        code: "VIDEO_FRAME_SOURCE_EMPTY"
      });
    }
    if (bytes.length > resolvedMaxBytes) {
      throw new VideoFrameExtractionError("视频文件超过代表画面解析大小限制", {
        code: "VIDEO_FRAME_SOURCE_TOO_LARGE",
        details: { maxBytes: resolvedMaxBytes, bytes: bytes.length }
      });
    }

    const durationSeconds = durationSecondsFrom(durationMs);
    if (!durationSeconds) {
      throw new VideoFrameExtractionError("视频时长未返回，无法定位代表画面时间点", {
        code: "VIDEO_FRAME_DURATION_MISSING"
      });
    }

    const directory = await mkdtemp(join(tempRoot, "byering-video-frames-"));
    const sourcePath = join(directory, `${safeName(workId) || "source"}.mp4`);
    await writeFile(sourcePath, bytes);
    try {
      let sceneTimes = [];
      try {
        sceneTimes = await detectSceneTimes({
          sourcePath,
          ffmpegPath,
          sceneThreshold: resolvedSceneThreshold,
          timeoutMs: resolvedTimeoutMs,
          runCommand
        });
      } catch {
        sceneTimes = [];
      }
      const normalizedSegments = normalizeContentRanges(contentSegments, durationSeconds);
      const normalizedAnchors = normalizeContentRanges(contentAnchors, durationSeconds);
      const internalCandidateTimes = buildInternalCandidateTimes({
        durationSeconds,
        secondsPerFrame: resolvedSecondsPerFrame,
        sceneTimes,
        contentSegments: normalizedSegments,
        contentAnchors: normalizedAnchors
      });
      const timestamps = selectContentAwareFrameTimes({
        durationSeconds,
        frameCount: requestedFrameCount,
        minFrameCount: resolvedMinFrameCount,
        secondsPerFrame: resolvedSecondsPerFrame,
        sceneTimes,
        contentSegments,
        contentAnchors
      });
      const frames = [];
      for (let index = 0; index < timestamps.length; index += 1) {
        const timestampSeconds = clamp(timestamps[index], 0, Math.max(0, durationSeconds - 0.25));
        const outputPath = join(directory, `frame-${String(index + 1).padStart(2, "0")}.jpg`);
        const contentEvidence = contentEvidenceForTime(timestampSeconds, {
          contentAnchors: normalizedAnchors,
          contentSegments: normalizedSegments,
          sceneTimes
        });
        await runCommand([
          "-hide_banner",
          "-loglevel", "error",
          "-ss", String(timestampSeconds),
          "-i", sourcePath,
          "-frames:v", "1",
          "-vf", "scale=640:-2:force_original_aspect_ratio=decrease",
          "-q:v", "5",
          "-y", outputPath
        ], { command: ffmpegPath, timeoutMs: resolvedTimeoutMs, outputPath });
        const image = await readFile(outputPath);
        frames.push({
          index: index + 1,
          timestampMs: Math.round(timestampSeconds * 1000),
          timestampSeconds: Number(timestampSeconds.toFixed(2)),
          timeLabel: formatTimestamp(timestampSeconds),
          mimeType: "image/jpeg",
          selectionReason: contentEvidence.selectionReason,
          contentTitle: contentEvidence.title,
          contentReason: contentEvidence.reason,
          contentTimeRange: contentEvidence.timeRange,
          dataUrl: `data:image/jpeg;base64,${image.toString("base64")}`
        });
      }
      return {
        status: "completed",
        source: "video_resource",
        count: frames.length,
        durationSeconds,
        selectionMode: normalizedAnchors.length || normalizedSegments.length
          ? "content_aware"
          : sceneTimes.length ? "scene_aware" : "coverage_fallback",
        sceneChangeCount: sceneTimes.length,
        contentAnchorCount: normalizedAnchors.length,
        contentSegmentCount: normalizedSegments.length,
        internalCandidateCount: internalCandidateTimes.length,
        frames
      };
    } finally {
      await rm(directory, { recursive: true, force: true }).catch(() => {});
    }
  }

  return Object.freeze({
    kind: "video-frame-extraction",
    configured: Boolean(fetchImpl && ffmpegPath),
    extract
  });
}

export function selectAdaptiveFrameTimes({
  durationSeconds,
  frameCount = null,
  minFrameCount = DEFAULT_MIN_FRAME_COUNT,
  secondsPerFrame = DEFAULT_SECONDS_PER_FRAME,
  sceneTimes = []
} = {}) {
  return selectContentAwareFrameTimes({
    durationSeconds,
    frameCount,
    minFrameCount,
    secondsPerFrame,
    sceneTimes
  });
}

export function selectContentAwareFrameTimes({
  durationSeconds,
  frameCount = null,
  minFrameCount = DEFAULT_MIN_FRAME_COUNT,
  secondsPerFrame = DEFAULT_SECONDS_PER_FRAME,
  sceneTimes = [],
  contentSegments = [],
  contentAnchors = []
} = {}) {
  const duration = positiveNumber(durationSeconds, 0);
  if (!duration) return [];

  const normalizedScenes = normalizeSceneTimes(sceneTimes, duration);
  const normalizedSegments = normalizeContentRanges(contentSegments, duration);
  const normalizedAnchors = normalizeContentRanges(contentAnchors, duration);
  const contentRanges = mergeContentRanges(normalizedSegments, normalizedAnchors);
  if (contentRanges.length) {
    const explicitCount = positiveIntegerOrNull(frameCount);
    return selectContentTimes(contentRanges, explicitCount || contentRanges.length);
  }
  const count = resolveAdaptiveFrameCount({
    durationSeconds: duration,
    frameCount,
    minFrameCount,
    secondsPerFrame,
    sceneCount: normalizedScenes.length,
    contentCount: Math.max(normalizedSegments.length, normalizedAnchors.length)
  });
  const times = [];
  for (let index = 0; index < count; index += 1) {
    const start = duration * index / count;
    const end = duration * (index + 1) / count;
    const center = (start + end) / 2;
    const contentCandidates = [
      ...normalizedAnchors.map((range) => ({ time: range.center, priority: 2 })),
      ...normalizedSegments.map((range) => ({ time: range.center, priority: 1 }))
    ].filter(({ time }) => time >= start && (index === count - 1 ? time <= end : time < end));
    const sceneCandidates = normalizedScenes.filter((time) => time >= start && (index === count - 1 ? time <= end : time < end));
    const selected = contentCandidates.length
      ? contentCandidates.reduce((closest, candidate) => {
        const distance = Math.abs(candidate.time - center);
        const closestDistance = Math.abs(closest.time - center);
        return distance < closestDistance || (distance === closestDistance && candidate.priority > closest.priority)
          ? candidate
          : closest;
      }).time
      : sceneCandidates.length
        ? sceneCandidates.reduce((closest, time) => Math.abs(time - center) < Math.abs(closest - center) ? time : closest)
        : center;
    times.push(Number(selected.toFixed(2)));
  }
  return times;
}

function selectContentTimes(ranges, count) {
  const target = Math.max(1, positiveInteger(count, ranges.length));
  const selected = [];
  if (target <= ranges.length) {
    for (let index = 0; index < target; index += 1) {
      const rangeIndex = Math.min(ranges.length - 1, Math.floor((index + 0.5) * ranges.length / target));
      selected.push(ranges[rangeIndex].center);
    }
  } else {
    selected.push(...ranges.map((range) => range.center));
    const fractions = [0.25, 0.75, 0.1, 0.9, 0.33, 0.67, 0.2, 0.8];
    for (const fraction of fractions) {
      for (const range of ranges) {
        if (selected.length >= target) break;
        selected.push(range.start + (range.end - range.start) * fraction);
      }
      if (selected.length >= target) break;
    }
  }
  return [...new Set(selected.map((time) => Number(time.toFixed(2))))].sort((left, right) => left - right);
}

function mergeContentRanges(segments, anchors) {
  const selected = [...anchors];
  for (const segment of segments) {
    const overlapsAnchor = anchors.some((anchor) => segment.start < anchor.end && segment.end > anchor.start);
    if (!overlapsAnchor) selected.push(segment);
  }
  return selected.sort((left, right) => left.start - right.start);
}

function detectSceneTimes({ sourcePath, ffmpegPath, sceneThreshold, timeoutMs, runCommand }) {
  return Promise.resolve(runCommand([
    "-hide_banner",
    "-loglevel", "info",
    "-i", sourcePath,
    "-an",
    "-vf", `scale=320:-2,select='gt(scene,${sceneThreshold})',showinfo`,
    "-f", "null",
    "-"
  ], { command: ffmpegPath, timeoutMs, captureOutput: true })).then((result) => parseSceneTimes(`${result?.stderr || ""}\n${result?.stdout || ""}`));
}

export function parseSceneTimes(output) {
  const times = [];
  const pattern = /pts_time:([0-9]+(?:\.[0-9]+)?)/g;
  let match;
  while ((match = pattern.exec(String(output || "")))) times.push(Number(match[1]));
  return normalizeSceneTimes(times, Number.POSITIVE_INFINITY);
}

function normalizeSceneTimes(sceneTimes, duration) {
  const sorted = (Array.isArray(sceneTimes) ? sceneTimes : [])
    .map(Number)
    .filter((time) => Number.isFinite(time) && time >= 0 && time <= duration)
    .sort((left, right) => left - right);
  return sorted.filter((time, index) => index === 0 || time - sorted[index - 1] >= 1.5);
}

function resolveAdaptiveFrameCount({ durationSeconds, frameCount, minFrameCount, secondsPerFrame, sceneCount, contentCount }) {
  const explicitCount = positiveIntegerOrNull(frameCount);
  if (explicitCount) return explicitCount;
  const minimum = Math.max(1, positiveInteger(minFrameCount, DEFAULT_MIN_FRAME_COUNT));
  const interval = positiveNumber(secondsPerFrame, DEFAULT_SECONDS_PER_FRAME);
  const durationBasedCount = Math.ceil(positiveNumber(durationSeconds, 0) / interval);
  const sceneBasedCount = positiveInteger(sceneCount, 0) ? positiveInteger(sceneCount, 0) + 1 : 0;
  const contentBasedCount = positiveInteger(contentCount, 0);
  return Math.max(minimum, durationBasedCount, sceneBasedCount, contentBasedCount);
}

function buildInternalCandidateTimes({ durationSeconds, secondsPerFrame, sceneTimes, contentSegments = [], contentAnchors = [] }) {
  const duration = positiveNumber(durationSeconds, 0);
  const interval = positiveNumber(secondsPerFrame, DEFAULT_SECONDS_PER_FRAME);
  const coverageCount = Math.max(1, Math.ceil(duration / interval));
  const coverageTimes = Array.from({ length: coverageCount }, (_value, index) => {
    const start = duration * index / coverageCount;
    const end = duration * (index + 1) / coverageCount;
    return (start + end) / 2;
  });
  const contentTimes = [
    ...normalizeContentRanges(contentSegments, duration).map((range) => range.center),
    ...normalizeContentRanges(contentAnchors, duration).map((range) => range.center)
  ];
  return [...new Set([...coverageTimes, ...normalizeSceneTimes(sceneTimes, duration), ...contentTimes].map((time) => Number(time.toFixed(2))))].sort((left, right) => left - right);
}

function normalizeContentRanges(items, duration) {
  return (Array.isArray(items) ? items : [])
    .map((item) => {
      const source = item && typeof item === "object" ? item : { timeRange: item };
      const numbers = String(source.timeRange || source.time_range || source.timestamp || source.time || "").match(/\d+(?:\.\d+)?/g)?.map(Number) || [];
      if (numbers.length < 2) return null;
      const start = clamp(Math.min(numbers[0], numbers[1]), 0, duration);
      const end = clamp(Math.max(numbers[0], numbers[1]), 0, duration);
      if (end <= start) return null;
      return {
        start,
        end,
        center: (start + end) / 2,
        title: String(source.title || source.stage || source.name || "").trim(),
        reason: String(source.reason || source.visualEvidence || source.evidence || source.description || source.content || "").trim(),
        timeRange: String(source.timeRange || source.time_range || source.timestamp || source.time || "").trim()
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.start - right.start);
}

function contentEvidenceForTime(time, { contentAnchors, contentSegments, sceneTimes }) {
  const anchor = contentAnchors.find((range) => time >= range.start && time <= range.end);
  if (anchor) {
    return {
      selectionReason: "content_anchor",
      title: anchor.title || "内容关键节点",
      reason: anchor.reason || "该画面用于回看内容关键节点。",
      timeRange: anchor.timeRange || ""
    };
  }
  const segment = contentSegments.find((range) => time >= range.start && time <= range.end);
  if (segment) {
    return {
      selectionReason: "content_segment",
      title: segment.title || "内容段落",
      reason: segment.reason || "该画面用于回看这一内容段落。",
      timeRange: segment.timeRange || ""
    };
  }
  if (sceneTimes.some((sceneTime) => Math.abs(sceneTime - time) <= 1.5)) {
    return {
      selectionReason: "scene_change",
      title: "场景变化参考",
      reason: "内容节点未返回，该画面仅用于补充场景变化证据。",
      timeRange: ""
    };
  }
  return {
    selectionReason: "timeline_coverage",
    title: "时间覆盖参考",
    reason: "内容节点和场景变化不足，该画面仅用于覆盖视频时间线。",
    timeRange: ""
  };
}

async function runProcess(args, { command, timeoutMs } = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new VideoFrameExtractionError("视频代表画面选择超时", {
        code: "VIDEO_FRAME_EXTRACTION_TIMEOUT"
      }));
    }, timeoutMs || DEFAULT_TIMEOUT_MS);
    timer.unref?.();
    child.stdout?.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr?.on("data", (chunk) => { stderr += String(chunk); });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(new VideoFrameExtractionError("视频代表画面选择程序不可用", {
        code: "VIDEO_FRAME_COMMAND_UNAVAILABLE",
        cause: error
      }));
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) return resolve({ stdout, stderr });
      reject(new VideoFrameExtractionError("视频代表画面选择失败", {
        code: "VIDEO_FRAME_EXTRACTION_COMMAND_FAILED",
        details: { code, signal, stderr: stderr.slice(-1000) }
      }));
    });
  });
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function positiveIntegerOrNull(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function boundedNumber(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function durationSecondsFrom(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number / 1000 : null;
}

function normalizeHttpUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    return /^https?:$/.test(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

function safeName(value) {
  return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function formatTimestamp(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}
