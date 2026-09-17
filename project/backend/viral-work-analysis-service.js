import { randomUUID } from "node:crypto";
import { createDouyinAgentDataClient } from "../src/salebuddy/bridge/douyin-agent-data.js";
import {
  douyinWorkIdFromUrl,
  isDouyinWorkUrl as isValidDouyinWorkUrl,
  normalizeDouyinWorkUrl
} from "../src/salebuddy/bridge/douyin-work-url.js";
import {
  analyzeViralWork,
  VIRAL_WORK_ANALYSIS_DEFAULT_GOAL,
  VIRAL_WORK_ANALYSIS_PURPOSE,
  VIRAL_WORK_ANALYSIS_TARGET_AUDIENCE
} from "../src/salebuddy/agents/viral-work-analysis.js";
import { createVideoContentAnalysisService } from "./video-content-analysis-service.js";
import { createVideoFrameExtractionService } from "./video-frame-extraction-service.js";

export const VIRAL_WORK_ANALYSIS_AGENT_ID = "mkt-viral-work-analysis";

export class ViralWorkAnalysisError extends Error {
  constructor(message, { code = "VIRAL_WORK_ANALYSIS_ERROR", statusCode = 400, details = {} } = {}) {
    super(message);
    this.name = "ViralWorkAnalysisError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function text(value) {
  return String(value ?? "").trim();
}

function unwrap(value) {
  let current = value;
  for (let depth = 0; depth < 7; depth += 1) {
    if (!isRecord(current)) return current || {};
    const next = current.data ?? current.result ?? current.entity ?? current.aweme_detail ?? current;
    if (next === current) return current;
    current = next;
  }
  return current || {};
}

function findWork(value, depth = 0) {
  if (depth > 6 || value == null) return {};
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findWork(item, depth + 1);
      if (found.id || found.desc || found.description || found.statistics || found.stats) return found;
    }
    return {};
  }
  if (!isRecord(value)) return {};
  if (value.aweme_id || value.awemeId || value.video_id || value.videoId || value.desc || value.description) return value;
  for (const key of ["aweme_detail", "video", "item", "data", "result", "entity", "item_list", "items"]) {
    const found = findWork(value[key], depth + 1);
    if (found.id || found.desc || found.description || found.statistics || found.stats) return found;
  }
  return unwrap(value);
}

function commentsFrom(value) {
  if (!isRecord(value)) return [];
  for (const key of ["comments", "comment_list", "commentList", "items", "records"]) {
    if (Array.isArray(value[key])) return value[key];
  }
  for (const key of ["data", "result", "entity", "snapshot", "resultSnapshot"]) {
    const found = commentsFrom(value[key]);
    if (found.length) return found;
  }
  return [];
}

function workIdFrom(work) {
  return text(work?.aweme_id || work?.awemeId || work?.video_id || work?.videoId || work?.id);
}

function firstHttpUrl(value, depth = 0) {
  if (depth > 6 || value == null) return "";
  if (typeof value === "string") {
    try {
      const url = new URL(value.trim());
      return /^https?:$/.test(url.protocol) ? url.toString() : "";
    } catch {
      return "";
    }
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstHttpUrl(item, depth + 1);
      if (found) return found;
    }
    return "";
  }
  if (!isRecord(value)) return "";
  for (const key of ["video_url", "videoUrl", "play_url", "playUrl", "download_url", "downloadUrl", "url_list", "urlList", "url"]) {
    const found = firstHttpUrl(value[key], depth + 1);
    if (found) return found;
  }
  for (const key of ["video", "play_addr", "playAddr", "download_addr", "downloadAddr", "data", "result", "entity", "aweme_detail"]) {
    const found = firstHttpUrl(value[key], depth + 1);
    if (found) return found;
  }
  return "";
}

function videoDurationMs(work) {
  const value = work?.duration_ms ?? work?.durationMs ?? work?.duration;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function unavailableVideoAnalysis(error, work) {
  return {
    status: "unavailable",
    source: "video_model",
    errorCode: error?.code || "VIDEO_CONTENT_ANALYSIS_UNAVAILABLE",
    message: error?.message || "视频本身暂未完成解析",
    input: { durationMs: videoDurationMs(work) }
  };
}

function unavailableVideoFrames(error, work) {
  const durationMs = videoDurationMs(work);
  return {
    status: "unavailable",
    source: "video_resource",
    count: 0,
    errorCode: error?.code || "VIDEO_FRAME_EXTRACTION_UNAVAILABLE",
    message: error?.message || "视频代表画面暂未生成",
    durationSeconds: durationMs == null ? null : Math.round(durationMs / 1000)
  };
}

function analysisProcess({ inputUrl, sourceUrl, work, comments, videoAnalysis, videoFrames }) {
  const workId = workIdFrom(work) || videoIdFromUrl(sourceUrl) || "未返回";
  return [
    {
      key: "link",
      title: "校验并规范化作品链接",
      status: "completed",
      detail: `已识别作品 ID ${workId}，将${inputUrl === sourceUrl ? "原链接" : "jingxuan 链接规范为标准作品链接"}作为后续数据源。`
    },
    {
      key: "metadata",
      title: "读取公开作品详情",
      status: "completed",
      detail: "读取标题、作者、时长、互动指标和公开标签；这些字段只作为作品表现事实，不替代视频观察。"
    },
    {
      key: "video",
      title: "解析视频本身",
      status: videoAnalysis.status === "completed" ? "completed" : "unavailable",
      detail: videoAnalysis.status === "completed"
        ? "将抖音返回的可播放视频资源交给视频模型，先拆解主题、叙事结构、画面、口播、字幕、音频和时间顺序，再把内容理解结果交给代表画面选择。"
        : videoAnalysis.message || "视频内容模型未完成解析。"
    },
    {
      key: "frames",
      title: "选择视频代表画面",
      status: videoFrames.status === "completed" ? "completed" : "unavailable",
      detail: videoFrames.status === "completed"
        ? videoFrames.selectionMode === "content_aware"
          ? `基于视频模型先产出的内容结构和关键节点，按这条视频自身的表达重点动态选择 ${videoFrames.count} 张代表性画面；没有统一固定模板。时间和场景采样只用于内部理解，不直接展示。`
          : videoFrames.selectionMode === "scene_aware"
            ? `视频内容理解未完成，当前仅按场景变化和视频段落补充 ${videoFrames.count} 张参考画面；这些画面用于回看事实，不等同于内容关键帧。`
            : `视频内容理解和场景变化都不可用，当前仅按视频段落覆盖补充 ${videoFrames.count} 张参考画面；这些画面用于回看事实，不等同于内容关键帧。`
        : videoFrames.message || "视频代表画面选择未完成。"
    },
    {
      key: "comments",
      title: "补充公开评论证据",
      status: comments.source === "error" || comments.source === "not_configured" ? "partial" : "completed",
      detail: comments.note || `已读取 ${comments.collected || 0} 条公开评论。`
    },
    {
      key: "synthesis",
      title: "形成结论与可复用打法",
      status: "completed",
      detail: "先列视频事实，再结合公开数据和评论做分析判断，最后输出可验证的内容复用建议。"
    }
  ];
}

const ANALYSIS_LOGIC = {
  purpose: VIRAL_WORK_ANALYSIS_PURPOSE,
  targetAudience: VIRAL_WORK_ANALYSIS_TARGET_AUDIENCE,
  evidenceLayers: [
    { key: "video", name: "视频事实", detail: "画面、口播、字幕、音频表现、时间顺序和剪辑方式。" },
    { key: "metrics", name: "作品表现", detail: "播放、点赞、评论、分享、收藏和时长等公开指标。" },
    { key: "comments", name: "观众反馈", detail: "可见评论中的需求、问题、疑虑和代表性原话。" },
    { key: "judgement", name: "分析判断", detail: "基于前述证据提出的优势、风险、复用方式和下一轮测试。" }
  ],
  rules: [
    "视频本身优先于作品简介；简介与视频不一致时以视频事实为准。",
    "画面和口播中未确认的内容标记为待核验，不用指标推断视频内容。",
    "作品表现不等同于商业转化，复用建议必须保留下一轮验证。",
    "所谓‘为什么火’只输出基于视频事实的增长假设，不把相关性写成已经证明的因果。"
  ]
};

export function isDouyinWorkUrl(value) {
  return isValidDouyinWorkUrl(value);
}

export function videoIdFromUrl(value) {
  return douyinWorkIdFromUrl(value);
}

function serviceError(error, fallback) {
  if (error instanceof ViralWorkAnalysisError) return error;
  return new ViralWorkAnalysisError(error?.message || fallback.message, {
    code: error?.code || fallback.code,
    statusCode: error?.statusCode || fallback.statusCode,
    details: error?.details || {}
  });
}

export function createViralWorkAnalysisService({
  dataClient = createDouyinAgentDataClient({ timeoutMs: 20_000, requestRetryAttempts: 1 }),
  publicDiscoveryService = null,
  videoContentAnalysisService = createVideoContentAnalysisService(),
  videoFrameExtractionService = createVideoFrameExtractionService(),
  now = () => new Date().toISOString()
} = {}) {
  async function collectComments(input, sourceUrl, work) {
    if (Array.isArray(input.comments)) return { items: input.comments, source: "provided" };
    if (!publicDiscoveryService || typeof publicDiscoveryService.discover !== "function") {
      return { items: [], source: "not_configured" };
    }
    const workId = workIdFrom(work) || videoIdFromUrl(sourceUrl);
    try {
      const result = await publicDiscoveryService.discover({
        agentId: VIRAL_WORK_ANALYSIS_AGENT_ID,
        taskId: input.taskId,
        taskRunId: input.taskRunId,
        conversationId: input.conversationId || `agent-square-${input.taskId || randomUUID()}`,
        goal: input.goal || "分析抖音作品评论和内容结构",
        videoId: workId || undefined,
        videoIds: workId ? [workId] : undefined,
        videoUrl: sourceUrl,
        videoUrls: [sourceUrl],
        commentLimit: Number(input.commentLimit) > 0 ? Math.min(200, Number(input.commentLimit)) : 100,
        analysisMode: "collect",
        source: "viral_work_analysis"
      });
      const snapshot = result?.resultSnapshot || result;
      return { items: commentsFrom(snapshot), source: "public_connector" };
    } catch (error) {
      return { items: [], source: "error", error: serviceError(error, {
        message: "公开评论暂时读取失败",
        code: "VIRAL_WORK_ANALYSIS_COMMENTS_UNAVAILABLE",
        statusCode: 502
      }) };
    }
  }

  async function run(input = {}) {
    const onProgress = typeof input.onProgress === "function" ? input.onProgress : null;
    const progressSnapshot = (phase, progress, extra = {}) => ({
      taskId: text(input.taskId) || null,
      taskRunId: text(input.taskRunId) || null,
      phase,
      progress,
      status: "running",
      ...extra
    });
    const reportProgress = async (phase, progress, extra = {}) => {
      if (!onProgress) return;
      try {
        await onProgress(progressSnapshot(phase, progress, extra));
      } catch {
        // Progress reporting must never make the analysis itself fail.
      }
    };
    const inputUrl = text(input.workUrl || input.videoUrl || input.url);
    const sourceUrl = normalizeDouyinWorkUrl(inputUrl);
    if (!sourceUrl) {
      throw new ViralWorkAnalysisError("请粘贴完整的抖音作品链接（支持 /video/、/note/ 或 jingxuan?modal_id=），暂不支持短链。", {
        code: "VIRAL_WORK_ANALYSIS_LINK_INVALID",
        statusCode: 400,
        details: { field: "workUrl" }
      });
    }
    if (!dataClient || typeof dataClient.videoDetail !== "function") {
      throw new ViralWorkAnalysisError("抖音作品详情接口未配置", {
        code: "VIRAL_WORK_ANALYSIS_DATA_NOT_CONFIGURED",
        statusCode: 503
      });
    }

    await reportProgress("校验作品链接", 5, { sourceUrl });

    let detail;
    try {
      detail = await dataClient.videoDetail({
        ...(text(input.workId) ? { awemeId: text(input.workId) } : { url: sourceUrl }),
        fresh: input.fresh === true
      });
    } catch (error) {
      throw serviceError(error, {
        message: "暂时读取不到这条抖音作品的公开数据，请稍后重试。",
        code: "VIRAL_WORK_ANALYSIS_DETAIL_UNAVAILABLE",
        statusCode: 502
      });
    }

    await reportProgress("读取公开作品详情", 25, { sourceUrl });

    const work = findWork(detail);
    const collected = await collectComments(input, sourceUrl, work);
    await reportProgress("整理公开评论", 40, {
      sourceUrl,
      commentCount: Array.isArray(collected.items) ? collected.items.length : 0
    });
    const videoUrl = firstHttpUrl(work);
    let videoAnalysis = {
      status: "unavailable",
      source: "video_model",
      errorCode: "VIDEO_CONTENT_SOURCE_MISSING",
      message: "作品详情没有返回可播放的视频资源，无法解析视频本身。",
      input: { durationMs: videoDurationMs(work) }
    };
    if (videoUrl && typeof videoContentAnalysisService?.analyze === "function") {
      try {
        videoAnalysis = await videoContentAnalysisService.analyze({
          videoUrl,
          work,
          goal: input.goal
        });
      } catch (error) {
        videoAnalysis = unavailableVideoAnalysis(error, work);
      }
    }
    await reportProgress("解析视频内容", 60, {
      sourceUrl,
      videoStatus: videoAnalysis.status
    });
    let videoFrames = {
      status: "unavailable",
      source: "video_resource",
      count: 0,
      errorCode: videoUrl ? "VIDEO_FRAME_EXTRACTION_NOT_RUN" : "VIDEO_CONTENT_SOURCE_MISSING",
      message: videoUrl ? "视频代表画面暂未生成" : "作品详情没有返回可播放的视频资源，无法选择视频代表画面。",
      durationSeconds: videoDurationMs(work) == null ? null : Math.round(videoDurationMs(work) / 1000)
    };
    if (videoUrl && typeof videoFrameExtractionService?.extract === "function") {
      try {
        videoFrames = await videoFrameExtractionService.extract({
          videoUrl,
          durationMs: videoDurationMs(work),
          workId: workIdFrom(work) || videoIdFromUrl(sourceUrl),
          contentSegments: videoAnalysis.status === "completed" ? videoAnalysis.structure : [],
          contentAnchors: videoAnalysis.status === "completed" ? videoAnalysis.keyMoments : []
        });
      } catch (error) {
        videoFrames = unavailableVideoFrames(error, work);
      }
    }
    await reportProgress("选择视频代表画面", 78, {
      sourceUrl,
      frameStatus: videoFrames.status,
      frameCount: videoFrames.count || 0
    });
    await reportProgress("生成分析报告", 90, { sourceUrl });
    const analysis = analyzeViralWork({ sourceUrl, work, comments: collected.items, goal: input.goal, videoAnalysis });
    const errors = collected.error ? [{ code: collected.error.code, message: collected.error.message }] : [];
    if (videoAnalysis.status !== "completed") {
      errors.push({ code: videoAnalysis.errorCode, message: videoAnalysis.message });
    }
    if (videoFrames.status !== "completed") {
      errors.push({ code: videoFrames.errorCode, message: videoFrames.message });
    }
    const hasWork = Boolean(analysis.work.id || analysis.work.description || analysis.work.metrics.views != null);
    const status = hasWork
      && videoAnalysis.status === "completed"
      && videoFrames.status === "completed"
      && collected.source !== "error"
      ? "completed"
      : "partial";
    const commentMessage = collected.source === "not_configured"
      ? "评论采集源未配置，本次先基于作品详情生成报告。"
      : collected.source === "error"
        ? "作品详情已读取，公开评论暂时不可用。"
        : `已读取 ${collected.items.length} 条公开评论。`;
    const commentEvidence = {
      collected: collected.items.length,
      source: collected.source,
      note: commentMessage
    };
    const result = {
      ...analysis,
      agentId: VIRAL_WORK_ANALYSIS_AGENT_ID,
      agentName: "爆款作品分析",
      taskId: text(input.taskId) || `viral-work-${randomUUID()}`,
      taskRunId: text(input.taskRunId) || null,
      status,
      resultType: "研究简报",
      generatedAt: now(),
      comments: commentEvidence,
      videoAnalysis,
      videoFrames,
      analysisProcess: analysisProcess({
        inputUrl,
        sourceUrl,
        work,
        comments: commentEvidence,
        videoAnalysis,
        videoFrames
      }),
      analysisLogic: ANALYSIS_LOGIC,
      errors,
      inputs: {
        goal: text(input.goal) || VIRAL_WORK_ANALYSIS_DEFAULT_GOAL,
        sourceScope: "public_work_link",
        workUrl: sourceUrl,
        videoContentSource: videoAnalysis.status === "completed" ? "douyin_video_url" : "unavailable",
        commentLimit: Number(input.commentLimit) > 0 ? Math.min(200, Number(input.commentLimit)) : 100
      },
      summary: `${analysis.summary} ${commentMessage}`
    };
    if (onProgress) {
      try {
        await onProgress({
          taskId: result.taskId,
          taskRunId: result.taskRunId,
          phase: "分析报告已生成",
          progress: 100,
          status: result.status === "completed" ? "completed" : "partial",
          resultSnapshot: result
        });
      } catch {
        // Progress reporting must never make the analysis itself fail.
      }
    }
    return result;
  }

  return Object.freeze({
    kind: "viral-work-analysis",
    configured: Boolean(dataClient?.videoDetail),
    run
  });
}
