const RECORD_KEYS = Object.freeze(["data", "result", "entity", "aweme_detail", "video", "item"]);

export const VIRAL_WORK_ANALYSIS_TARGET_AUDIENCE = "准备做或正在做自媒体、希望通过学习爆款视频增长流量的博主";
export const VIRAL_WORK_ANALYSIS_PURPOSE = "从视频本身和公开表现中拆解它为什么可能获得流量，帮助博主找到可复用、可验证的创作方法。";
export const VIRAL_WORK_ANALYSIS_DEFAULT_GOAL = "帮助正在做或准备做自媒体的博主，拆解这条视频为什么可能获得流量，并提炼下一轮可验证的创作打法。";
export const VIRAL_WORK_ANALYSIS_REPORT_TEMPLATE_ID = "viral-teardown-v1";

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function text(value, fallback = "") {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function firstValue(source, keys, depth = 0) {
  if (depth > 5 || source == null) return "";
  if (Array.isArray(source)) {
    for (const item of source) {
      const found = firstValue(item, keys, depth + 1);
      if (found !== "") return found;
    }
    return "";
  }
  if (!isRecord(source)) return "";
  for (const key of keys) {
    const value = source[key];
    if (value == null) continue;
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (isRecord(value) && Object.keys(value).length) return value;
  }
  for (const key of RECORD_KEYS) {
    const found = firstValue(source[key], keys, depth + 1);
    if (found !== "") return found;
  }
  return "";
}

function numberValue(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const source = String(value).trim().replace(/,/g, "");
  if (!source) return null;
  const match = source.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const base = Number(match[0]);
  if (!Number.isFinite(base)) return null;
  if (/亿/i.test(source)) return Math.round(base * 100_000_000);
  if (/万/i.test(source)) return Math.round(base * 10_000);
  if (/千|k/i.test(source)) return Math.round(base * 1_000);
  return Math.round(base);
}

function metric(source, keys) {
  const value = firstValue(source, keys);
  if (isRecord(value)) return numberValue(value.count ?? value.value ?? value.num ?? value.total);
  return numberValue(value);
}

function round(value, digits = 2) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function unwrap(source) {
  let current = source;
  for (let depth = 0; depth < 6; depth += 1) {
    if (!isRecord(current)) return current || {};
    const next = current.data ?? current.result ?? current.entity ?? current.aweme_detail ?? current;
    if (next === current) return current;
    current = next;
  }
  return current || {};
}

function listFrom(source, keys) {
  const current = unwrap(source);
  if (isRecord(current)) {
    for (const key of keys) {
      if (Array.isArray(current[key])) return current[key];
    }
  }
  const value = firstValue(current, keys);
  if (Array.isArray(value)) return value;
  if (isRecord(value)) {
    for (const key of ["items", "list", "data", "records", "hashtags", "tags"]) {
      if (Array.isArray(value[key])) return value[key];
    }
  }
  return [];
}

function normalizeHashtags(work, description) {
  const tags = [];
  for (const item of listFrom(work, ["hashtags", "hashtag_list", "text_extra", "textExtra", "tag_list", "tagList"])) {
    const value = typeof item === "string" ? item : firstValue(item, ["hashtag_name", "hashtagName", "name", "title", "text"]);
    const clean = text(value).replace(/^#/, "");
    if (clean) tags.push(clean);
  }
  for (const match of String(description || "").matchAll(/#([^\s#，。！？!?；;]+)/gu)) tags.push(match[1]);
  return [...new Set(tags)].slice(0, 20);
}

function normalizeMetrics(work) {
  const source = firstValue(work, ["statistics", "stats", "metrics", "statistic"]) || work;
  const metrics = {
    views: metric(source, ["play_count", "playCount", "view_count", "viewCount", "views", "播放量"]),
    likes: metric(source, ["digg_count", "diggCount", "like_count", "likeCount", "likes", "点赞数", "点赞"]),
    comments: metric(source, ["comment_count", "commentCount", "comments", "评论数", "评论"]),
    shares: metric(source, ["share_count", "shareCount", "shares", "分享数", "分享"]),
    favorites: metric(source, ["collect_count", "collectCount", "favorite_count", "favoriteCount", "favorites", "收藏数", "收藏"])
  };
  const totalInteractions = [metrics.likes, metrics.comments, metrics.shares, metrics.favorites]
    .filter((value) => Number.isFinite(value))
    .reduce((sum, value) => sum + value, 0);
  return {
    ...metrics,
    totalInteractions,
    interactionRate: metrics.views > 0 ? round(totalInteractions / metrics.views * 100) : null,
    commentRate: metrics.views > 0 && metrics.comments != null ? round(metrics.comments / metrics.views * 100) : null,
    shareRate: metrics.views > 0 && metrics.shares != null ? round(metrics.shares / metrics.views * 100) : null
  };
}

function normalizeComment(item) {
  if (typeof item === "string") return text(item);
  if (!isRecord(item)) return "";
  return text(item.text || item.content || item.comment || item.desc || item.message);
}

const COMMENT_SIGNALS = Object.freeze([
  { key: "购买与价格", terms: ["多少钱", "价格", "报价", "怎么买", "想买", "求链接", "链接", "下单", "同款", "购买"] },
  { key: "使用问题", terms: ["怎么用", "如何", "教程", "步骤", "可以吗", "能不能", "适合", "多久", "尺寸", "型号"] },
  { key: "疑虑与反对", terms: ["真的吗", "靠谱吗", "会不会", "但是", "担心", "缺点", "踩雷", "效果"] },
  { key: "场景需求", terms: ["小户型", "孩子", "老人", "通勤", "租房", "办公室", "送人", "家里"] }
]);

function signalComments(comments) {
  const normalized = comments.map(normalizeComment).filter(Boolean).slice(0, 200);
  const questions = normalized.filter((item) => /[?？]/u.test(item) || /^(请问|求问|怎么|如何|能不能|有没有|多少|哪里|求)/u.test(item));
  const counts = COMMENT_SIGNALS.map((signal) => ({
    key: signal.key,
    count: normalized.filter((item) => signal.terms.some((term) => item.includes(term))).length
  })).filter((item) => item.count > 0).sort((a, b) => b.count - a.count);
  const needs = counts
    .filter((item) => ["购买与价格", "使用问题", "场景需求"].includes(item.key))
    .map((item) => item.key);
  const objections = counts.filter((item) => item.key === "疑虑与反对").map((item) => item.key);
  return {
    collected: normalized.length,
    questions: [...new Set(questions)].slice(0, 8),
    needs,
    objections,
    topics: counts,
    representativeComments: normalized.slice(0, 6)
  };
}

function contentSignals(description, hashtags) {
  const source = text(description);
  const lines = source.split(/[\n。！？!?]/u).map((item) => item.trim()).filter(Boolean);
  const hook = text(lines[0] || source).slice(0, 120);
  const ctaMatch = source.match(/(?:评论区|私信|关注|收藏|转发|点击|下单|领取|咨询|回复|链接)[^。！？!?\n]{0,36}/u);
  const cta = ctaMatch?.[0] || "未识别到明确行动引导";
  const structure = [];
  if (/(?:只用|一个|三步|步骤|先|再|最后|方法|教程|如何|怎么做)/u.test(source)) structure.push("步骤或方法");
  if (/(?:改造前后|对比|结果|翻倍|提升|省下|解决|效果|实测|案例)/u.test(source)) structure.push("结果对比或效果");
  if (/(?:痛点|不会|总是|困扰|太小|太贵|担心|问题|难)/u.test(source)) structure.push("痛点切入");
  if (cta !== "未识别到明确行动引导") structure.push("行动引导");
  if (!structure.length) structure.push("作品原文信息不足，需补充脚本或画面拆解");
  const topicText = hashtags.length ? hashtags.join("、") : "尚未识别到明确标签";
  return { hook, structure: [...new Set(structure)], topics: hashtags, topicText, cta };
}

function videoStructureLines(videoAnalysis) {
  return Array.isArray(videoAnalysis?.structure)
    ? videoAnalysis.structure.map((item) => {
      if (typeof item === "string") return item;
      const stage = text(item?.stage, "阶段");
      const timeRange = text(item?.timeRange);
      const description = text(item?.description);
      return `${stage}${timeRange ? `（${timeRange}）` : ""}：${description}`;
    }).filter(Boolean)
    : [];
}

function reusableElements(content, metrics, audience, videoAnalysis) {
  const values = [];
  if (content.hook) values.push(`开头抓手：${content.hook}`);
  if (content.structure.length) values.push(`内容结构：${content.structure.join("、")}`);
  if (content.topics.length) values.push(`选题标签：${content.topics.join("、")}`);
  if (content.cta !== "未识别到明确行动引导") values.push(`互动引导：${content.cta}`);
  for (const pattern of videoAnalysis?.reusablePatterns || []) values.push(`视频打法：${pattern}`);
  if (audience.needs.length) values.push(`评论承接：优先回应${audience.needs.join("、")}问题`);
  if (metrics.interactionRate != null) values.push(`互动验证：当前可见互动率约 ${metrics.interactionRate}%`);
  return [...new Set(values)].slice(0, 8);
}

function normalizeWork(work, sourceUrl) {
  const source = unwrap(work);
  const description = text(firstValue(source, ["desc", "description", "caption", "title", "text", "content"]));
  const author = firstValue(source, ["author", "user", "owner", "creator"]) || {};
  const hashtags = normalizeHashtags(source, description);
  const durationMs = numberValue(firstValue(source, ["duration_ms", "durationMs", "duration"]));
  return {
    id: text(firstValue(source, ["aweme_id", "awemeId", "video_id", "videoId", "id"])),
    url: text(sourceUrl || firstValue(source, ["share_url", "shareUrl", "video_url", "videoUrl", "aweme_url", "awemeUrl", "url"])),
    title: text(firstValue(source, ["title"])) || text(description.split(/[\n。！？!?]/u)[0]).slice(0, 80),
    description,
    author: {
      id: text(firstValue(author, ["sec_uid", "secUid", "uid", "user_id", "userId", "id"])),
      name: text(firstValue(author, ["nickname", "nick_name", "name", "unique_id", "uniqueId"]))
    },
    coverUrl: text(firstValue(source, ["cover_url", "coverUrl", "origin_cover", "originCover"])),
    durationMs,
    durationSeconds: durationMs == null ? null : Math.round(durationMs / 1000),
    publishedAt: text(firstValue(source, ["create_time", "createTime", "published_at", "publishedAt"])) || null,
    hashtags,
    metrics: normalizeMetrics(source)
  };
}

export function analyzeViralWork({ sourceUrl = "", work = {}, comments = [], goal = "", videoAnalysis = null } = {}) {
  const normalizedWork = normalizeWork(work, sourceUrl);
  const textContent = contentSignals(normalizedWork.description, normalizedWork.hashtags);
  const videoContent = videoAnalysis?.status === "completed" ? videoAnalysis : null;
  const videoStructure = videoStructureLines(videoContent);
  const content = {
    ...textContent,
    hook: text(videoContent?.hook, textContent.hook),
    structure: videoStructure.length ? videoStructure : textContent.structure,
    strengths: [...new Set([...(textContent.structure || []), ...(videoContent?.strengths || [])])].slice(0, 8)
  };
  const audience = signalComments(Array.isArray(comments) ? comments : []);
  const reusable = reusableElements(content, normalizedWork.metrics, audience, videoContent);
  const evidence = [];
  if (normalizedWork.description) evidence.push({ type: "work_description", text: normalizedWork.description, sourceUrl: normalizedWork.url || sourceUrl });
  if (normalizedWork.metrics.totalInteractions > 0 || normalizedWork.metrics.views != null) {
    evidence.push({ type: "work_metrics", text: JSON.stringify(normalizedWork.metrics), sourceUrl: normalizedWork.url || sourceUrl });
  }
  if (normalizedWork.hashtags.length) evidence.push({ type: "work_hashtags", text: normalizedWork.hashtags.join("、"), sourceUrl: normalizedWork.url || sourceUrl });
  for (const comment of audience.representativeComments) evidence.push({ type: "comment", text: comment, sourceUrl: normalizedWork.url || sourceUrl });

  const metricSummary = normalizedWork.metrics.interactionRate == null
    ? "互动率暂无法计算，因为作品播放量未返回。"
    : `可见互动率约 ${normalizedWork.metrics.interactionRate}%，其中点赞 ${normalizedWork.metrics.likes ?? "未知"}、评论 ${normalizedWork.metrics.comments ?? "未知"}、分享 ${normalizedWork.metrics.shares ?? "未知"}。`;
  const commentSummary = audience.collected
    ? `已读取 ${audience.collected} 条公开评论，主要集中在${audience.topics.slice(0, 3).map((item) => item.key).join("、") || "未形成明显主题"}。`
    : "暂未读取到公开评论，评论需求和异议仍需补充验证。";
  const videoSummary = videoContent?.overview
    ? `视频本身已解析：${videoContent.overview}`
    : "视频本身暂未完成解析，当前内容判断不能替代画面和口播分析。";
  const growthSummary = videoContent?.growthHypotheses?.length
    ? `当前最值得验证的流量机制是：${videoContent.growthHypotheses.slice(0, 2).join("；")}。`
    : "流量机制仍需结合视频事实和下一轮发布数据验证。";
  const summary = `${normalizedWork.title || "这条作品"}的可复用抓手是“${content.hook || "作品原文不足"}”。${videoSummary}${growthSummary}${metricSummary}${commentSummary}`;

  return {
    schemaVersion: 1,
    analysisKind: "viral_work",
    reportTemplate: VIRAL_WORK_ANALYSIS_REPORT_TEMPLATE_ID,
    title: "抖音爆款视频拆解报告",
    purpose: VIRAL_WORK_ANALYSIS_PURPOSE,
    targetAudience: VIRAL_WORK_ANALYSIS_TARGET_AUDIENCE,
    sourceUrl: normalizedWork.url || sourceUrl,
    goal: text(goal, VIRAL_WORK_ANALYSIS_DEFAULT_GOAL),
    work: normalizedWork,
    metrics: normalizedWork.metrics,
    videoAnalysis: videoAnalysis || null,
    content: {
      hook: content.hook,
      structure: content.structure,
      topics: content.topics,
      cta: content.cta,
      strengths: [...new Set([...content.strengths, ...(content.topics.length ? ["标签清晰"] : [])])].slice(0, 8)
    },
    audience,
    recommendations: {
      reusableElements: reusable,
      nextTests: [
        content.hook ? "保留开头的核心冲突，测试更短版本是否能更快进入结果。" : "补齐前 3 秒脚本后再验证开头抓力。",
        ...(videoContent?.nextTests || []),
        audience.needs.length ? `围绕${audience.needs.join("、")}各设计一个承接版本。` : "补充评论样本后再设计评论承接内容。",
        "复刻结构和需求，不直接复制原作品素材或表达。"
      ],
      cautions: [
        "作品表现不等同于转化结果，播放和互动数据不能单独证明成交。",
        "没有返回的播放、评论或转化数据会标记为待核验，不做估算。"
      ]
    },
    evidence,
    summary
  };
}

export { normalizeComment, normalizeMetrics, normalizeWork };
