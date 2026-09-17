import assert from "node:assert/strict";
import test from "node:test";

import {
  VIRAL_WORK_ANALYSIS_AGENT_ID,
  createViralWorkAnalysisService,
  isDouyinWorkUrl,
  videoIdFromUrl
} from "../backend/viral-work-analysis-service.js";
import { analyzeViralWork } from "../src/salebuddy/agents/viral-work-analysis.js";
import {
  VIRAL_WORK_ANALYSIS_DEFAULT_GOAL,
  buildViralWorkAnalysisTaskPayload,
  validateViralWorkAnalysisSetup
} from "../src/salebuddy/ui/viral-work-analysis-config.js";
import {
  buildViralWorkAnalysisReportHtml,
  viralWorkAnalysisReportFile
} from "../src/salebuddy/agents/viral-work-analysis-report.js";
import {
  createVideoContentAnalysisService,
  normalizeVideoAnalysis
} from "../backend/video-content-analysis-service.js";
import {
  createVideoFrameExtractionService,
  selectContentAwareFrameTimes,
  selectAdaptiveFrameTimes
} from "../backend/video-frame-extraction-service.js";
import { addFile, getFile } from "../src/salebuddy/agents/file-store.js";

test("viral work analysis accepts complete Douyin work links only", () => {
  assert.equal(isDouyinWorkUrl("https://www.douyin.com/video/7345678901234567890"), true);
  assert.equal(isDouyinWorkUrl("https://www.douyin.com/note/7345678901234567890"), true);
  assert.equal(isDouyinWorkUrl("https://www.douyin.com/jingxuan?modal_id=7682342845214182707"), true);
  assert.equal(videoIdFromUrl("https://www.douyin.com/jingxuan?modal_id=7682342845214182707"), "7682342845214182707");
  assert.equal(isDouyinWorkUrl("https://v.douyin.com/abc123/"), false);
  assert.equal(isDouyinWorkUrl("https://www.douyin.com/user/MS4wLjABAAAA"), false);
});

test("viral work analysis produces evidence-backed content and audience insights", () => {
  const result = analyzeViralWork({
    sourceUrl: "https://www.douyin.com/video/7345678901234567890",
    work: {
      aweme_id: "7345678901234567890",
      desc: "只用一个动作，把小户型收纳空间多出一倍。先看改造前后，再告诉你怎么做。评论区回复收纳。",
      author: { nickname: "居家研究所" },
      statistics: { play_count: 100000, digg_count: 12000, comment_count: 860, share_count: 1200, collect_count: 2400 },
      text_extra: [{ hashtag_name: "小户型收纳" }, { hashtag_name: "家居改造" }]
    },
    comments: [
      { text: "请问这个收纳架多少钱？" },
      { text: "小户型真的可以这样改吗？" },
      { text: "求链接，想买同款" },
      { text: "改造前后差别太明显了" }
    ],
    goal: "拆解这条作品为什么表现好，并提炼可复用的内容打法。"
  });

  assert.equal(result.schemaVersion, 1);
  assert.equal(result.analysisKind, "viral_work");
  assert.equal(result.work.id, "7345678901234567890");
  assert.equal(result.work.metrics.views, 100000);
  assert.match(result.targetAudience, /自媒体/);
  assert.match(result.purpose, /流量/);
  assert.match(result.goal, /拆解/);
  assert.equal(result.work.metrics.likes, 12000);
  assert.equal(result.metrics.interactionRate, 16.46);
  assert.deepEqual(result.work.hashtags, ["小户型收纳", "家居改造"]);
  assert.match(result.content.hook, /只用一个动作/);
  assert.match(result.content.cta, /评论区/);
  assert.ok(result.audience.needs.some((item) => /价格|链接|购买/.test(item)));
  assert.ok(result.audience.questions.length >= 1);
  assert.ok(result.recommendations.reusableElements.length >= 3);
  assert.ok(result.evidence.some((item) => item.type === "work_metrics"));
  assert.ok(result.evidence.some((item) => item.type === "comment"));
});

test("viral work analysis service fetches detail and keeps comment collection optional", async () => {
  const calls = [];
  const service = createViralWorkAnalysisService({
    dataClient: {
      async videoDetail(input) {
        calls.push(input);
        return {
          data: {
            aweme_detail: {
              aweme_id: "7345678901234567890",
              desc: "三步做出高转化开头",
              statistics: { play_count: 2000, digg_count: 100 }
            }
          }
        };
      }
    }
  });

  const result = await service.run({
    agentId: VIRAL_WORK_ANALYSIS_AGENT_ID,
    taskId: "viral-task-1",
    taskRunId: "viral-run-1",
    workUrl: "https://www.douyin.com/video/7345678901234567890",
    goal: "分析开头和转化方式"
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://www.douyin.com/video/7345678901234567890");
  assert.equal(result.agentId, VIRAL_WORK_ANALYSIS_AGENT_ID);
  assert.equal(result.status, "partial");
  assert.equal(result.work.id, "7345678901234567890");
  assert.equal(result.comments.collected, 0);
});

test("viral work analysis reports real lifecycle checkpoints to its caller", async () => {
  const progress = [];
  const service = createViralWorkAnalysisService({
    dataClient: {
      async videoDetail() {
        return {
          aweme_id: "7345678901234567890",
          desc: "真实阶段回调测试",
          video_url: "https://video.test/source.mp4"
        };
      }
    },
    videoContentAnalysisService: {
      async analyze() {
        return { status: "completed", source: "video_model", structure: [], keyMoments: [] };
      }
    },
    videoFrameExtractionService: {
      async extract() {
        return { status: "completed", source: "video_resource", selectionMode: "content_aware", count: 1, frames: [] };
      }
    }
  });

  const result = await service.run({
    workUrl: "https://www.douyin.com/video/7345678901234567890",
    onProgress: (snapshot) => progress.push(snapshot)
  });

  assert.deepEqual(progress.map((item) => item.phase), [
    "校验作品链接",
    "读取公开作品详情",
    "整理公开评论",
    "解析视频内容",
    "选择视频代表画面",
    "生成分析报告",
    "分析报告已生成"
  ]);
  assert.deepEqual(progress.slice(0, -1).map((item) => item.status), ["running", "running", "running", "running", "running", "running"]);
  assert.equal(progress.at(-1).status, "completed");
  assert.deepEqual(progress.map((item) => item.progress), [5, 25, 40, 60, 78, 90, 100]);
  assert.equal(progress.at(-1).resultSnapshot.status, "completed");
  assert.equal(result.status, "completed");
});

test("viral work analysis normalizes jingxuan modal links before upstream access", async () => {
  const calls = [];
  const service = createViralWorkAnalysisService({
    dataClient: {
      async videoDetail(input) {
        calls.push(input);
        return { data: { aweme_detail: { aweme_id: "7682342845214182707", desc: "爆款作品" } } };
      }
    }
  });

  const result = await service.run({
    workUrl: "https://www.douyin.com/jingxuan?modal_id=7682342845214182707"
  });

  assert.equal(calls[0].url, "https://www.douyin.com/video/7682342845214182707");
  assert.equal(result.inputs.workUrl, "https://www.douyin.com/video/7682342845214182707");
});

test("viral work analysis sends the returned video resource to the video analyzer", async () => {
  const calls = [];
  const videoAnalysis = normalizeVideoAnalysis({
    overview: "视频展示一位讲解者对比 AI model、agent 和 harness。",
    subject: "夜间户外人物讲解，穿插电脑录屏。",
    spokenContent: "口播解释 AI agent 的分类和适用场景。",
    hook: "先提出一个常见概念疑问，再进入解释。",
    audio: { hasSpeech: true, speechSummary: "连续口播，表达清楚。", speechStyle: "聊天式科普" },
    subtitles: { present: true, summary: "中文字幕与口播同步。", keyPhrases: ["AI agent"] },
    structure: [{ stage: "开场", timeRange: "0-5秒", description: "提出问题并引入主题。" }],
    keyMoments: [{ timeRange: "0-5秒", title: "问题引入", reason: "直接提出观众关心的问题。" }],
    visual: ["人物近景", "电脑界面录屏"],
    pacing: "中速连续讲解，间插录屏。",
    editing: ["人物讲解与屏幕录制交替"],
    strengths: ["主题明确"],
    weaknesses: ["信息密度较高"],
    reusablePatterns: ["先讲概念，再做分类对比"],
    nextTests: ["测试更短的开场版本"]
  });
  const service = createViralWorkAnalysisService({
    dataClient: {
      async videoDetail() {
        return {
          aweme_id: "7345678901234567890",
          desc: "AI agent 讲解",
          duration_ms: 396000,
          video_url: "https://v95-aw-cold.douyinvod.com/video.mp4"
        };
      }
    },
    videoContentAnalysisService: {
      async analyze(input) {
        calls.push(input);
        return { ...videoAnalysis, status: "completed", source: "video_model" };
      }
    },
    videoFrameExtractionService: {
      async extract(input) {
        calls.push({ frameExtraction: input });
        return { status: "completed", source: "video_resource", selectionMode: "content_aware", count: 2, frames: [] };
      }
    }
  });

  const result = await service.run({ workUrl: "https://www.douyin.com/video/7345678901234567890" });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].videoUrl, "https://v95-aw-cold.douyinvod.com/video.mp4");
  assert.equal(calls[1].frameExtraction.durationMs, 396000);
  assert.equal(result.videoAnalysis.status, "completed");
  assert.equal(result.videoFrames.status, "completed");
  assert.deepEqual(calls[1].frameExtraction.contentAnchors, videoAnalysis.keyMoments);
  assert.deepEqual(calls[1].frameExtraction.contentSegments, videoAnalysis.structure);
  const processByKey = Object.fromEntries(result.analysisProcess.map((item) => [item.key, item]));
  assert.match(processByKey.video.detail, /先拆解主题、叙事结构/);
  assert.match(processByKey.frames.detail, /视频模型先产出的内容结构和关键节点/);
  assert.match(processByKey.frames.detail, /没有统一固定模板/);
  assert.equal(result.status, "completed");
  assert.equal(result.work.durationSeconds, 396);
  assert.match(result.summary, /视频本身已解析/);
});

test("video frame extraction downloads the video and embeds sampled JPEG frames", async () => {
  const commandCalls = [];
  const service = createVideoFrameExtractionService({
    fetchImpl: async (url) => new Response(Buffer.from("video-bytes"), {
      status: 200,
      headers: { "content-type": "video/mp4", "content-length": "11" }
    }),
    tempRoot: "/tmp",
    frameCount: 2,
    maxBytes: 100,
    runCommand: async (args, options) => {
      commandCalls.push({ args, options });
      if (!options.outputPath) return { stderr: "[Parsed_showinfo] pts_time:4.000000" };
      const { writeFile } = await import("node:fs/promises");
      await writeFile(options.outputPath, Buffer.from(`jpeg-${commandCalls.length}`));
    }
  });

  const result = await service.extract({
    videoUrl: "https://video.test/source.mp4",
    durationMs: 100000,
    workId: "work-1"
  });

  assert.equal(result.status, "completed");
  assert.equal(result.count, 2);
  assert.equal(result.frames[0].timeLabel, "0:04");
  assert.match(result.frames[0].dataUrl, /^data:image\/jpeg;base64,/);
  assert.equal(result.selectionMode, "scene_aware");
  assert.equal(result.sceneChangeCount, 1);
  assert.equal(commandCalls.length, 3);
  assert.equal(commandCalls[0].args.some((value) => value.includes("showinfo")), true);
  assert.equal(commandCalls[1].args.includes("-ss"), true);
  assert.equal(commandCalls[1].args.includes("-i"), true);
});

test("video frame selection prefers scene changes while preserving timeline coverage", () => {
  const times = selectAdaptiveFrameTimes({
    durationSeconds: 100,
    frameCount: 4,
    sceneTimes: [4, 26, 52, 77]
  });

  assert.deepEqual(times, [4, 26, 52, 77]);
});

test("video frame selection falls back to representative coverage when scenes are sparse", () => {
  const times = selectAdaptiveFrameTimes({
    durationSeconds: 100,
    frameCount: 4,
    sceneTimes: [3]
  });

  assert.deepEqual(times, [3, 37.5, 62.5, 87.5]);
});

test("video frame selection prioritizes content nodes for user-facing evidence", () => {
  const times = selectContentAwareFrameTimes({
    durationSeconds: 120,
    frameCount: 4,
    sceneTimes: [5, 35, 65, 95],
    contentSegments: [
      { stage: "开头抓手", timeRange: "0-12秒", description: "提出问题" },
      { stage: "核心演示", timeRange: "54-76秒", description: "展示方法" }
    ],
    contentAnchors: [
      { timeRange: "5-10秒", title: "问题引入", reason: "让观众理解观看收益" }
    ]
  });

  assert.equal(times.length, 4);
  assert.equal(times.some((time) => time >= 5 && time <= 10), true);
  assert.equal(times.some((time) => time >= 54 && time <= 76), true);
});

test("video frame extraction keeps internal candidates separate from content evidence", async () => {
  let frameCalls = 0;
  const service = createVideoFrameExtractionService({
    fetchImpl: async () => new Response(Buffer.from("video-bytes"), {
      status: 200,
      headers: { "content-length": "11" }
    }),
    tempRoot: "/tmp",
    maxBytes: 100,
    runCommand: async (_args, options) => {
      if (!options.outputPath) return { stderr: "[Parsed_showinfo] pts_time:5.000000 pts_time:65.000000" };
      frameCalls += 1;
      const { writeFile } = await import("node:fs/promises");
      await writeFile(options.outputPath, Buffer.from(`jpeg-${frameCalls}`));
    }
  });

  const result = await service.extract({
    videoUrl: "https://video.test/content-aware.mp4",
    durationMs: 120000,
    workId: "content-aware-work",
    contentSegments: [
      { stage: "开头抓手", timeRange: "0-12秒", description: "提出问题" },
      { stage: "核心演示", timeRange: "54-76秒", description: "展示方法" }
    ],
    contentAnchors: [{ timeRange: "5-10秒", title: "问题引入", reason: "让观众理解观看收益" }]
  });

  assert.equal(result.selectionMode, "content_aware");
  assert.equal(result.count, 2);
  assert.equal(result.contentSegmentCount, 2);
  assert.equal(result.contentAnchorCount, 1);
  assert.equal(result.internalCandidateCount > result.count, true);
  assert.equal(result.frames.every((frame) => frame.selectionReason === "content_anchor" || frame.selectionReason === "content_segment"), true);
  assert.equal(result.frames[0].contentTitle, "问题引入");
  assert.equal(result.frames[0].contentReason, "让观众理解观看收益");
  assert.equal(result.frames[1].contentTitle, "核心演示");
  assert.equal(result.frames[1].contentReason, "展示方法");
});

test("video frame extraction keeps a small baseline for short videos", async () => {
  let frameCalls = 0;
  const service = createVideoFrameExtractionService({
    fetchImpl: async () => new Response(Buffer.from("video-bytes"), {
      status: 200,
      headers: { "content-length": "11" }
    }),
    tempRoot: "/tmp",
    maxBytes: 100,
    runCommand: async (_args, options) => {
      if (!options.outputPath) return {};
      frameCalls += 1;
      const { writeFile } = await import("node:fs/promises");
      await writeFile(options.outputPath, Buffer.from(`jpeg-${frameCalls}`));
    }
  });

  const result = await service.extract({
    videoUrl: "https://video.test/short.mp4",
    durationMs: 30000,
    workId: "short-work"
  });

  assert.equal(result.count, 4);
  assert.equal(result.selectionMode, "coverage_fallback");
  assert.equal(frameCalls, 4);
});

test("video frame extraction scales with long videos instead of capping at eight", async () => {
  let frameCalls = 0;
  const service = createVideoFrameExtractionService({
    fetchImpl: async () => new Response(Buffer.from("video-bytes"), {
      status: 200,
      headers: { "content-length": "11" }
    }),
    tempRoot: "/tmp",
    maxBytes: 100,
    runCommand: async (_args, options) => {
      if (!options.outputPath) return {};
      frameCalls += 1;
      const { writeFile } = await import("node:fs/promises");
      await writeFile(options.outputPath, Buffer.from(`jpeg-${frameCalls}`));
    }
  });

  const result = await service.extract({
    videoUrl: "https://video.test/long.mp4",
    durationMs: 1_800_000,
    workId: "long-work"
  });

  assert.equal(result.count, 40);
  assert.equal(result.selectionMode, "coverage_fallback");
  assert.equal(frameCalls, 40);
});

test("video content analysis uses the model's video input and normalizes its structured output", async () => {
  let requestBody;
  const service = createVideoContentAnalysisService({
    endpoint: "https://llm.test/chat/completions",
    apiKey: "test-key",
    model: "video-test-model",
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          overview: "视频内容概览",
          subject: "人物讲解",
          spokenContent: "解释一个方法",
          audio: { hasSpeech: true, speechSummary: "连续口播", speechStyle: "讲解" },
          subtitles: { present: true, summary: "同步字幕", keyPhrases: ["方法"] },
          hook: "先抛出问题",
          structure: [{ stage: "开场", timeRange: "0-3秒", description: "抛出问题" }],
          keyMoments: [{ timeRange: "0-3秒", title: "问题引入", reason: "先让观众知道收益" }],
          visual: ["人物近景"],
          pacing: "中速",
          editing: ["人物和录屏切换"],
          strengths: ["信息明确"],
          weaknesses: ["较密集"],
          reusablePatterns: ["问题引入"],
          nextTests: ["缩短开场"]
        }) } }]
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
  });

  const result = await service.analyze({
    videoUrl: "https://v95-aw-cold.douyinvod.com/video.mp4",
    work: { title: "视频标题", durationMs: 30000 },
    goal: "分析视频本身"
  });

  assert.equal(requestBody.messages[1].content[1].type, "video_url");
  assert.equal(requestBody.messages[1].content[1].video_url.url, "https://v95-aw-cold.douyinvod.com/video.mp4");
  assert.equal(result.status, "completed");
  assert.equal(result.audio.hasSpeech, true);
  assert.deepEqual(result.structure[0], { stage: "开场", timeRange: "0-3秒", description: "抛出问题" });
  assert.deepEqual(result.keyMoments[0], { timeRange: "0-3秒", title: "问题引入", reason: "先让观众知道收益" });
});

test("video content analysis falls back to a compatible model when the primary quota is paused", async () => {
  const models = [];
  const service = createVideoContentAnalysisService({
    endpoint: "https://llm.test/chat/completions",
    apiKey: "test-key",
    model: "primary-video-model",
    fallbackModels: ["fallback-video-model"],
    maxAttempts: 1,
    fetchImpl: async (_url, options) => {
      const request = JSON.parse(options.body);
      models.push(request.model);
      if (request.model === "primary-video-model") {
        return new Response(JSON.stringify({ error: { code: "SetLimitExceeded" } }), { status: 429 });
      }
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ overview: "备用模型完成视频观察" }) } }]
      }), { status: 200 });
    }
  });

  const result = await service.analyze({ videoUrl: "https://video.test/source.mp4" });

  assert.deepEqual(models, ["primary-video-model", "fallback-video-model"]);
  assert.equal(result.model, "fallback-video-model");
  assert.equal(result.overview, "备用模型完成视频观察");
});

test("viral work analysis service rejects short links before upstream access", async () => {
  let called = false;
  const service = createViralWorkAnalysisService({
    dataClient: { async videoDetail() { called = true; } }
  });

  await assert.rejects(
    service.run({ workUrl: "https://v.douyin.com/abc123/" }),
    (error) => error.code === "VIRAL_WORK_ANALYSIS_LINK_INVALID"
  );
  assert.equal(called, false);
});

test("viral work analysis UI config requires a complete work link and emits a public-work payload", () => {
  assert.equal(validateViralWorkAnalysisSetup({ workUrl: "" }), "请先粘贴一条抖音作品链接");
  assert.match(validateViralWorkAnalysisSetup({ workUrl: "https://v.douyin.com/abc123/" }), /完整的抖音作品链接/);
  assert.equal(validateViralWorkAnalysisSetup({ workUrl: "https://www.douyin.com/video/7345678901234567890" }), null);
  assert.equal(validateViralWorkAnalysisSetup({ workUrl: "https://www.douyin.com/jingxuan?modal_id=7682342845214182707" }), null);

  const payload = buildViralWorkAnalysisTaskPayload({
    taskId: "viral-task-ui",
    taskRunId: "viral-run-ui",
    workUrl: "https://www.douyin.com/video/7345678901234567890",
    viralWorkGoal: "只看开头和评论需求"
  });
  assert.equal(payload.agentId, VIRAL_WORK_ANALYSIS_AGENT_ID);
  assert.equal(payload.workUrl, "https://www.douyin.com/video/7345678901234567890");
  assert.equal(payload.goal, "只看开头和评论需求");
  assert.equal(payload.config.sourceScope.kind, "public_work_link");
  assert.equal(payload.config.analysisKind, "viral_work");
  assert.equal(payload.config.analysisOnly, true);
  assert.equal(payload.config.discoveryOnly, true);
  assert.equal(payload.config.autoStartCloud, false);
  assert.equal(payload.config.accountId, undefined);

  const jingxuanPayload = buildViralWorkAnalysisTaskPayload({
    workUrl: "https://www.douyin.com/jingxuan?modal_id=7682342845214182707"
  });
  assert.equal(jingxuanPayload.workUrl, "https://www.douyin.com/video/7682342845214182707");
  assert.equal(jingxuanPayload.config.workUrl, "https://www.douyin.com/video/7682342845214182707");
  assert.equal(VIRAL_WORK_ANALYSIS_DEFAULT_GOAL.length > 0, true);
});

test("viral work analysis report includes facts, audience needs, reusable playbook and boundaries", () => {
  const result = analyzeViralWork({
    sourceUrl: "https://www.douyin.com/video/7345678901234567890",
    work: {
      aweme_id: "7345678901234567890",
      desc: "三步做出高转化开头，评论区回复链接。",
      author: { nickname: "内容研究所" },
      statistics: { play_count: 3000, digg_count: 240, comment_count: 32 }
    },
    comments: ["请问怎么买？", "求链接"]
  });
  result.taskId = "viral-report-1";
  result.analysisProcess = [{ title: "选择视频代表画面", status: "completed", detail: "选择 2 张画面" }];
  result.analysisLogic = {
    evidenceLayers: [{ name: "视频事实", detail: "画面和口播" }],
    rules: ["视频事实优先"]
  };
  result.videoFrames = {
    status: "completed",
    selectionMode: "content_aware",
    frames: [{
      index: 1,
      timestampSeconds: 2,
      timeLabel: "0:02",
      contentTitle: "问题引入",
      contentReason: "展示用户真正要解决的问题",
      dataUrl: "data:image/jpeg;base64,ZmFrZQ=="
    }]
  };

  const html = buildViralWorkAnalysisReportHtml(result);
  assert.match(html, /爆款视频分析报告/);
  assert.match(html, /这次怎么得出结论/);
  assert.match(html, /挑选回看画面/);
  assert.match(html, /关键画面回看/);
  assert.match(html, /已根据视频中的表达重点、内容转折和画面变化/);
  assert.match(html, /为什么保留：展示用户真正要解决的问题/);
  assert.match(html, /data:image\/jpeg;base64/);
  assert.match(html, /内容怎么组织/);
  assert.match(html, /视频内容拆解/);
  assert.match(html, /大家在关注什么/);
  assert.match(html, /可以借鉴什么/);
  assert.match(html, /哪些是事实，哪些是判断/);
  assert.match(html, /不直接复制原作品素材/);
  assert.doesNotMatch(html, /not_configured|prior_report_observation|resultSnapshot|视频模型|推理限额/);
  assert.match(html, /更新于/);
  assert.match(html, /本次引用的依据/);

  const file = viralWorkAnalysisReportFile(result, { createdBy: "爆款作品分析" });
  assert.equal(file.type, "html");
  assert.equal(file.projectName, "内容研究");
  assert.match(file.name, /viral-report-1/);
  assert.equal(file.createdBy, "爆款作品分析");
});

test("file store returns the generated id for newly created analysis reports", () => {
  const previousStorage = globalThis.localStorage;
  const values = new Map();
  globalThis.localStorage = {
    getItem(key) { return values.get(key) || null; },
    setItem(key, value) { values.set(key, value); }
  };
  try {
    const id = addFile({ name: "viral-analysis.html", type: "html", content: "<html></html>" });
    assert.match(id, /^file-/);
    assert.equal(getFile(id)?.name, "viral-analysis.html");
  } finally {
    globalThis.localStorage = previousStorage;
  }
});
