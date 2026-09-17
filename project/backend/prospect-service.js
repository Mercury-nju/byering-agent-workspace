import { createHash, randomUUID } from "node:crypto";
import {
  ProspectConnectorError,
  createProspectConnector,
  prospectConnectorConfiguration
} from "../src/salebuddy/bridge/prospect-connector.js";
import {
  createAccountResolver,
  normalizeAccountReference,
  normalizeResolvedAccount
} from "./account-resolver.js";
import { createDouyinDataMcpClient } from "../src/salebuddy/bridge/douyin-data-mcp.js";
import { createLeadIntentAnalysisService } from "./lead-intent-analysis.js";

const DEFAULT_CONTEXT = Object.freeze({
  agentId: "lead_miner",
  agentName: "线索猎人",
  skillId: "lead_discovery"
});

const SECRET_KEY = /(?:authorization|(?:access|refresh)?[_-]?token|password|passwd|cookie|secret|csrf|jwt)/i;
const PUBLIC_INPUT_FIELDS = Object.freeze([
  "goal", "query", "keywords", "source", "provider", "uid", "tenant", "tenantId", "platform",
  "lastTime", "lookbackDays", "secId", "sec_id", "secUid", "sec_uid", "accountCode", "account", "accountName", "account_name",
  "nickname", "uniqueId", "unique_id", "douyinId", "douyin_id", "profileUrl", "profile_url",
  "accounts", "accountRefs", "accountList", "callbackUrl", "videoId", "videoIds", "videoUrl", "videoUrls", "videoLimit", "video_limit", "commentLimit", "comment_limit", "limit", "cursor", "seedUrls", "sourceUrls", "minScore", "analysisMode", "analysis_mode", "analysisScope", "analysis_scope", "userRequirements", "requirements"
]);
const ACCOUNT_BATCH_LIMIT = 50;
const INTENT_TERMS = Object.freeze([
  "想买", "购买", "报价", "价格", "预算", "多少钱", "落地", "优惠", "试驾", "咨询", "联系",
  "电话", "微信", "地址", "现车", "库存", "金融", "分期", "置换", "求购", "推荐", "在哪"
]);

export class ProspectServiceError extends Error {
  constructor(message, { code = "PROSPECT_SERVICE_ERROR", statusCode = 400, details = {} } = {}) {
    super(message);
    this.name = "ProspectServiceError";
    this.code = code;
    this.statusCode = statusCode;
    Object.assign(this, details);
    this.details = redact(details);
  }
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function first(...values) {
  for (const value of values) {
    if (value === 0 || value === false) return value;
    if (typeof value === "string" && value.trim()) return value.trim();
    if (value != null && typeof value !== "string") return value;
  }
  return null;
}

function stringList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item)).map((item) => item.trim()).filter(Boolean);
  const item = typeof value === "number" && Number.isFinite(value) ? String(value) : nonEmpty(value);
  return item ? [item] : [];
}

function videoIdFromUrl(value) {
  const source = nonEmpty(value);
  if (!source) return null;
  try {
    const url = new URL(source);
    // Public Douyin share pages expose the aweme id in a stable path. Short
    // links are intentionally not followed here because resolving them would
    // need a separate network/browser capability.
    const match = url.pathname.match(/\/(?:share\/)?(?:video|note)\/([A-Za-z0-9_-]+)/i);
    return match?.[1] || null;
  } catch {
    return null;
  }
}

function publicUrlsFromText(value) {
  return [...String(value || "").matchAll(/https?:\/\/[^\s，。,；;]+/gi)]
    .map((match) => match[0].replace(/[)\]}>]+$/, ""))
    .filter(Boolean);
}

function secIdFromProfileUrl(value) {
  const source = nonEmpty(value);
  if (!source) return null;
  try {
    const url = new URL(source);
    const candidate = url.pathname.match(/\/user\/([^/?]+)/i)?.[1] || null;
    // Douyin sec_id values are opaque identifiers. Restrict URL extraction to
    // the known public prefix so ordinary handles such as `/user/test` still
    // go through the configured account resolver.
    return candidate && /^MS4wLjAB[A-Za-z0-9_-]{12,}$/.test(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

function videoInputsFromGoal(goal) {
  const urls = publicUrlsFromText(goal).filter((url) => /douyin\.com/i.test(url) && /\/(?:share\/)?(?:video|note)\//i.test(url));
  const ids = [...String(goal || "").matchAll(/(?:作品|视频)\s*(?:ID|id|号)?\s*[:：]\s*([A-Za-z0-9_-]{6,})/g)]
    .map((match) => match[1]);
  return { videoIds: [...new Set(ids)], videoUrls: [...new Set(urls)] };
}

function videoIdsFromInput(input = {}) {
  const goalInputs = videoInputsFromGoal(input.goal || input.query);
  let explicit = stringList(input.videoIds != null ? input.videoIds : input.videoId);
  const rawUrls = input.videoUrls != null
    ? input.videoUrls
    : input.videoUrl != null
      ? input.videoUrl
      : input.seedUrls != null
        ? input.seedUrls
        : input.sourceUrls;
  let urls = stringList(rawUrls);
  if (!explicit.length && !urls.length) {
    explicit = goalInputs.videoIds;
    urls = goalInputs.videoUrls;
  }
  const resolved = urls.map(videoIdFromUrl);
  const unresolved = urls.filter((url, index) => !resolved[index]);
  if (unresolved.length) {
    throw new ProspectServiceError("抖音作品链接无法提取 video_id，请改用作品 ID 或完整 /video/ 链接", {
      code: "PROSPECT_VIDEO_ID_REQUIRED",
      statusCode: 400,
      details: { required: "videoIds", unresolvedUrls: unresolved.slice(0, 20) }
    });
  }
  return {
    videoIds: [...new Set([...explicit, ...resolved.filter(Boolean)])],
    videoUrls: urls
  };
}

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !SECRET_KEY.test(key) && key !== "cause")
    .map(([key, child]) => [key, redact(child)]));
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function idFor(prefix, value) {
  const source = String(value || "").trim();
  if (!source) return `${prefix}:${randomUUID()}`;
  return `${prefix}:${createHash("sha256").update(source).digest("hex").slice(0, 24)}`;
}

function stableToken(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 20);
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value;
  if (!isRecord(value)) return [];
  for (const key of ["items", "list", "records", "videos", "videoList", "video_list", "itemList", "item_list", "comments", "users", "candidates", "data", "result", "tasks"]) {
    if (Array.isArray(value[key])) return value[key];
  }
  return [];
}

function nestedData(value) {
  if (!isRecord(value)) return value;
  for (const key of ["data", "entity", "result"]) {
    if (value[key] != null) return value[key];
  }
  return value;
}

function toNumber(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeContext(input = {}) {
  const source = isRecord(input) ? input : {};
  const output = {
    taskId: first(source.taskId, source.task_id),
    taskRunId: first(source.taskRunId, source.task_run_id, source.runId, source.run_id),
    conversationId: first(source.conversationId, source.conversation_id),
    agentId: first(source.agentId, source.agent_id, DEFAULT_CONTEXT.agentId),
    skillId: first(source.skillId, source.skill_id, DEFAULT_CONTEXT.skillId),
    skillRunId: first(source.skillRunId, source.skill_run_id),
    tenantId: first(source.tenantId, source.tenant_id, source.tenant)
  };
  for (const field of ["taskId", "taskRunId", "conversationId", "agentId"]) {
    if (!nonEmpty(output[field])) {
      throw new ProspectServiceError(`${field} is required`, {
        code: "PROSPECT_CONTEXT_REQUIRED",
        statusCode: 400,
        details: { field }
      });
    }
  }
  if ((output.skillId && !output.skillRunId) || (!output.skillId && output.skillRunId)) {
    // A direct service call may omit skill identity entirely. The default
    // lead-miner identity is only emitted when both ids are supplied.
    output.skillId = null;
    output.skillRunId = null;
  }
  return output;
}

function assertPublicInput(value, path = "input", depth = 0) {
  if (depth > 4) throw new ProspectServiceError("Prospect request nesting is too deep", {
    code: "PROSPECT_INPUT_INVALID",
    statusCode: 400,
    details: { field: path }
  });
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) assertPublicInput(item, `${path}[${index}]`, depth + 1);
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (SECRET_KEY.test(key)) throw new ProspectServiceError(`${key} cannot be provided to public discovery`, {
      code: "PROSPECT_CREDENTIALS_FORBIDDEN",
      statusCode: 400,
      details: { field: `${path}.${key}` }
    });
    assertPublicInput(child, `${path}.${key}`, depth + 1);
  }
}

function assertCommentLeadMinerOwnSource(input = {}) {
  const agentId = String(input.agentId || input.agent_id || "").trim();
  if (agentId !== "mkt-find-people") return;
  const sourceOwner = String(input.sourceOwner || input.source_owner || "").trim().toLowerCase();
  const sourceScope = String(input.sourceScope || input.source_scope || "").trim().toLowerCase();
  if (sourceOwner !== "own" || sourceScope !== "own_account_comments" || input.analysisOnly === true) {
    throw new ProspectServiceError("评论区找客户只能读取已授权账号的作品评论", {
      code: "PROSPECT_OWN_ACCOUNT_REQUIRED",
      statusCode: 400,
      details: { agentId, sourceOwner: sourceOwner || null, sourceScope: sourceScope || null }
    });
  }
  if (!nonEmpty(input.accountId || input.account_id)) {
    throw new ProspectServiceError("请先授权一个抖音账号，再从该账号的作品评论中找客户", {
      code: "PROSPECT_OWN_ACCOUNT_REQUIRED",
      statusCode: 400,
      details: { field: "accountId" }
    });
  }
}

function validateInput(input = {}) {
  if (!isRecord(input)) throw new ProspectServiceError("Prospect request must be an object", {
    code: "PROSPECT_INPUT_INVALID",
    statusCode: 400
  });
  assertPublicInput(input);
  const accounts = input.accounts || input.accountRefs || input.accountList;
  if (accounts != null && (!Array.isArray(accounts) || accounts.length < 1 || accounts.length > ACCOUNT_BATCH_LIMIT)) {
    throw new ProspectServiceError(`accounts must contain between 1 and ${ACCOUNT_BATCH_LIMIT} public references`, {
      code: "PROSPECT_INPUT_INVALID",
      statusCode: 400,
      details: { field: "accounts", max: ACCOUNT_BATCH_LIMIT }
    });
  }
  if (Array.isArray(accounts)) {
    const invalidIndex = accounts.findIndex((reference) => {
      if (isRecord(reference)) return false;
      if (typeof reference === "number") return !Number.isFinite(reference);
      return !nonEmpty(reference);
    });
    if (invalidIndex >= 0) throw new ProspectServiceError("每个账号引用必须是名称、抖音号、主页链接或公开身份对象", {
      code: "PROSPECT_INPUT_INVALID",
      statusCode: 400,
      details: { field: `accounts[${invalidIndex}]` }
    });
  }
  const goal = first(input.goal, input.query, input.objective);
  const seedCount = [
    input.uid, input.query, input.goal, input.videoId, input.videoIds, input.videoUrl, input.videoUrls, input.seedUrls, input.sourceUrls,
    input.accountName, input.account_name, input.nickname, input.uniqueId, input.unique_id,
    input.douyinId, input.douyin_id, input.profileUrl, input.profile_url, input.account, accounts
  ]
    .some((value) => Array.isArray(value) ? value.length > 0 : nonEmpty(value));
  if (!goal && !seedCount) throw new ProspectServiceError("goal or a public discovery seed is required", {
    code: "PROSPECT_QUERY_REQUIRED",
    statusCode: 400,
    details: { field: "goal" }
  });
  const limit = input.limit == null ? 100 : Number(input.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new ProspectServiceError("limit must be between 1 and 500", {
    code: "PROSPECT_INPUT_INVALID",
    statusCode: 400,
    details: { field: "limit" }
  });
  const videoLimit = input.videoLimit == null ? input.video_limit : Number(input.videoLimit);
  const commentLimit = input.commentLimit == null ? input.comment_limit : Number(input.commentLimit);
  const analysisMode = input.analysisMode == null ? input.analysis_mode : String(input.analysisMode).trim().toLowerCase();
  if (analysisMode != null && analysisMode !== "" && !["intent", "filter", "collect"].includes(analysisMode)) {
    throw new ProspectServiceError("analysisMode must be intent, filter, or collect", {
      code: "PROSPECT_INPUT_INVALID",
      statusCode: 400,
      details: { field: "analysisMode" }
    });
  }
  for (const [field, value] of [["videoLimit", videoLimit], ["commentLimit", commentLimit]]) {
    if (value != null && (!Number.isInteger(Number(value)) || Number(value) < 1 || Number(value) > 1000)) {
      throw new ProspectServiceError(`${field} must be between 1 and 1000`, {
        code: "PROSPECT_INPUT_INVALID",
        statusCode: 400,
        details: { field }
      });
    }
  }
  return { ...input, goal: goal || "公开抖音线索发现", limit, ...(videoLimit != null ? { videoLimit: Number(videoLimit) } : {}), ...(commentLimit != null ? { commentLimit: Number(commentLimit) } : {}), ...(analysisMode ? { analysisMode } : {}) };
}

function publicRequest(input) {
  const output = {};
  for (const field of PUBLIC_INPUT_FIELDS) {
    if (input[field] !== undefined && input[field] !== null && input[field] !== "") output[field] = clone(input[field]);
  }
  output.query ||= input.goal;
  output.keywords ||= input.keywords || input.goal;
  if (input.lookbackDays != null && input.lastTime == null) {
    const days = Math.max(1, Math.min(3650, Number(input.lookbackDays) || 30));
    output.lastTime = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  }
  return output;
}

function callbackUrlFor(template, context, input) {
  const source = nonEmpty(template);
  if (!source) return null;
  const replacements = {
    taskId: context.taskId,
    taskRunId: context.taskRunId,
    conversationId: context.conversationId,
    tenantId: context.tenantId,
    goal: input.goal,
    accountName: input.accountName || input.account_name || input.nickname,
    uniqueId: input.uniqueId || input.unique_id || input.douyinId || input.douyin_id,
    profileUrl: input.profileUrl || input.profile_url,
    uid: input.uid,
    secId: input.secId || input.sec_id || input.secUid || input.sec_uid
  };
  let value = source.replace(/\{(taskId|taskRunId|conversationId|tenantId|goal|accountName|uniqueId|profileUrl|uid|secId)\}/g, (_, key) => encodeURIComponent(String(replacements[key] || "")));
  try {
    const url = new URL(value);
    for (const [key, replacement] of Object.entries(replacements)) {
      if (replacement != null && !url.searchParams.has(key)) url.searchParams.set(key, String(replacement));
    }
    return url.toString();
  } catch {
    throw new ProspectServiceError("Prospect callback URL is invalid", {
      code: "PROSPECT_CONFIG_INVALID",
      statusCode: 503,
      details: { field: "BYERING_PROSPECT_CALLBACK_URL" }
    });
  }
}

function extractVideos(value) {
  const source = nestedData(value);
  if (Array.isArray(source)) return source;
  if (!isRecord(source)) return [];
  for (const key of ["videos", "videoList", "video_list", "itemList", "item_list", "items", "list", "records"]) {
    if (Array.isArray(source[key])) return source[key];
  }
  return [];
}

function extractComments(value) {
  const source = nestedData(value);
  if (Array.isArray(source)) return source;
  if (!isRecord(source)) return [];
  // SpiderApi uses `tasks[]` for an asynchronous queue acknowledgement. Those
  // records are traces, not user comments, and must never become leads.
  for (const key of ["comments", "commentList", "comment_list", "items", "list", "records", "users", "candidates"]) {
    if (Array.isArray(source[key])) return source[key];
  }
  return [];
}

function videoIdOf(video) {
  return String(first(video?.videoId, video?.video_id, video?.id, video?.awemeId, video?.aweme_id, video?.itemId, video?.item_id) || "").trim() || null;
}

function videoUrlOf(video) {
  return first(video?.shareUrl, video?.share_url, video?.videoUrl, video?.video_url, video?.url, video?.link);
}

function normalizeVideo(video, input, index) {
  if (!isRecord(video)) return null;
  const videoId = videoIdOf(video) || `unknown-${index}`;
  const author = isRecord(video.author) ? video.author : isRecord(video.user) ? video.user : {};
  const authorId = first(video.authorId, video.author_id, video.uid, author.uid, author.userId, author.user_id, author.id);
  const title = first(video.title, video.description, video.videoDescription, video.video_description, video.desc, "");
  return {
    id: videoId,
    videoId,
    url: videoUrlOf(video),
    title: String(title || "").trim(),
    description: String(first(video.description, video.videoDescription, video.video_description, "") || "").trim(),
    authorId: authorId == null ? null : String(authorId),
    authorName: first(video.authorName, video.author_name, author.nickname, author.nickName, author.name),
    publishedAt: first(video.createTime, video.create_time, video.publishTime, video.publish_time),
    metrics: {
      likes: toNumber(first(video.likeCount, video.like_count, video.diggCount, video.digg_count)),
      comments: toNumber(first(video.commentCount, video.comment_count)),
      shares: toNumber(first(video.shareCount, video.share_count)),
      views: toNumber(first(video.viewCount, video.view_count, video.playCount, video.play_count))
    },
    source: "douyin_public",
    raw: redact(video),
    discoveredAt: new Date().toISOString(),
    query: input.goal
  };
}

function commentText(comment) {
  return String(first(comment?.text, comment?.content, comment?.comment, comment?.commentText, comment?.comment_text, comment?.desc, "") || "").trim();
}

function commentVideoId(comment) {
  return String(first(comment?.videoId, comment?.video_id, comment?.awemeId, comment?.aweme_id, comment?.itemId, comment?.item_id) || "").trim() || null;
}

function boundedCommentSelection(comments, limit) {
  if (!Number.isInteger(limit) || limit <= 0 || comments.length <= limit) return comments;
  // The MCP server currently returns one video's comments even when it is
  // passed multiple video IDs. After collecting each video separately, use a
  // round-robin cap so a total limit still preserves evidence from every
  // selected video instead of filling the sheet with the first video only.
  const buckets = new Map();
  for (const comment of comments) {
    const key = commentVideoId(comment) || "unknown";
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(comment);
  }
  const selected = [];
  while (selected.length < limit && buckets.size) {
    for (const [key, bucket] of buckets) {
      const item = bucket.shift();
      if (item) selected.push(item);
      if (!bucket.length) buckets.delete(key);
      if (selected.length >= limit) break;
    }
  }
  return selected;
}

function commentObservedAt(comment) {
  return first(comment?.createTime, comment?.create_time, comment?.createdAt, comment?.created_at);
}

function commentInLookbackWindow(comment, lookbackDays) {
  const days = toNumber(lookbackDays);
  if (days == null || days <= 0) return true;
  const raw = commentObservedAt(comment);
  if (raw == null || raw === "") return true;
  const numeric = Number(raw);
  const timestamp = Number.isFinite(numeric)
    ? (numeric < 1e12 ? numeric * 1000 : numeric)
    : Date.parse(String(raw));
  if (!Number.isFinite(timestamp)) return true;
  return timestamp >= Date.now() - days * 24 * 60 * 60 * 1000;
}

function filterCommentsByLookback(comments, lookbackDays) {
  if (lookbackDays == null) return comments;
  return comments.filter((comment) => commentInLookbackWindow(comment, lookbackDays));
}

function scoreText(text, goal = "") {
  // The requirement describes what to look for; it must never become
  // evidence itself. Only the observed public comment contributes score.
  const haystack = String(text || "").toLowerCase();
  const matchedTerms = INTENT_TERMS.filter((term) => haystack.includes(term.toLowerCase()));
  const questionBoost = /[?？]|怎么|如何|请问/.test(text) ? 1 : 0;
  const score = Math.min(100, matchedTerms.length * 18 + questionBoost * 10);
  return { score, matchedTerms };
}

function normalizeLead(comment, videosById, input, index) {
  if (!isRecord(comment)) return null;
  const text = commentText(comment);
  const videoId = first(comment.videoId, comment.video_id, comment.awemeId, comment.aweme_id, comment.itemId, comment.item_id);
  const video = videoId ? videosById.get(String(videoId)) : null;
  const user = isRecord(comment.user) ? comment.user : isRecord(comment.author) ? comment.author : {};
  const leadId = first(comment.userId, comment.user_id, comment.uid, comment.authorId, comment.author_id, user.uid, user.userId, user.user_id, user.id);
  const secUid = first(comment.secUid, comment.sec_uid, user.secUid, user.sec_uid);
  const uniqueId = first(comment.uniqueId, comment.unique_id, user.uniqueId, user.unique_id);
  const nickname = first(comment.nickname, comment.nickName, comment.userName, comment.user_name, user.nickname, user.nickName, user.name);
  const externalUserId = first(leadId, secUid, uniqueId);
  const stableId = externalUserId == null
    ? idFor("lead", `${nickname || "anonymous"}:${text}:${videoId || ""}`)
    : String(externalUserId);
  const avatarValue = first(comment.avatar, comment.avatarUrl, comment.avatar_url, user.avatar, user.avatarUrl, user.avatar_url);
  const avatarList = user.avatar_thumb?.url_list || user.avatarThumb?.urlList || user.avatar_thumb?.urlList;
  const avatar = first(avatarValue, Array.isArray(avatarList) ? avatarList[0] : null);
  const { score, matchedTerms } = scoreText(text, input.goal);
  const tier = score >= 45 ? "high" : score >= 18 ? "medium" : "low";
  const observedAt = first(comment.createTime, comment.create_time, comment.createdAt, comment.created_at, new Date().toISOString());
  return {
    id: stableId,
    leadId: stableId,
    commentId: first(comment.commentId, comment.comment_id, comment.cid, comment.id),
    externalUserId: externalUserId == null ? null : String(externalUserId),
    secUid: secUid == null ? null : String(secUid),
    uniqueId: uniqueId == null ? null : String(uniqueId),
    platform: "douyin",
    account: nickname || null,
    nickname: nickname || null,
    avatar: avatar || null,
    text,
    score,
    tier,
    matchedTerms,
    source: {
      type: "comment",
      videoId: videoId == null ? null : String(videoId),
      videoTitle: video?.title || null,
      videoUrl: video?.url || null,
      url: first(comment.url, comment.shareUrl, comment.share_url, video?.url),
      observedAt
    },
    evidence: [{
      type: "comment",
      quote: text,
      videoId: videoId == null ? null : String(videoId),
      observedAt,
      sourceUrl: first(comment.url, comment.shareUrl, comment.share_url, video?.url)
    }],
    discoveredAt: new Date().toISOString(),
    raw: redact(comment),
    query: input.goal,
    rank: index + 1
  };
}

function uniqueLeads(leads) {
  const seen = new Map();
  for (const lead of leads) {
    if (!lead) continue;
    // Douyin can expose the same person with different display/user ids
    // across comments. Prefer sec_uid, then uid, before falling back to the
    // stable synthetic id so one person is never counted twice.
    const key = lead.secUid || lead.externalUserId || lead.uniqueId || lead.leadId || lead.id;
    const prior = seen.get(key);
    if (!prior) {
      seen.set(key, lead);
      continue;
    }
    const winner = Number(lead.score || 0) > Number(prior.score || 0) ? lead : prior;
    const evidence = [...(prior.evidence || []), ...(lead.evidence || [])];
    winner.evidence = evidence.filter((item, index, all) => {
      const identity = `${item?.videoId || ""}:${item?.observedAt || ""}:${item?.quote || item?.text || ""}`;
      return index === all.findIndex((candidate) => `${candidate?.videoId || ""}:${candidate?.observedAt || ""}:${candidate?.quote || candidate?.text || ""}` === identity);
    }).slice(0, 5);
    winner.matchedTerms = [...new Set([...(prior.matchedTerms || []), ...(lead.matchedTerms || [])])];
    seen.set(key, winner);
  }
  return [...seen.values()].sort((a, b) => b.score - a.score || a.rank - b.rank);
}

function heuristicAnalysis(leads, error = null) {
  return {
    mode: "heuristic",
    source: "heuristic",
    ...(error ? { error: "MODEL_UNAVAILABLE", errorCode: error.code || null } : {}),
    counts: {
      high: leads.filter((lead) => lead.tier === "high").length,
      medium: leads.filter((lead) => lead.tier === "medium").length,
      low: leads.filter((lead) => lead.tier === "low").length,
      modelReviewed: 0
    }
  };
}

function withHeuristicIntent(leads, reason = "按公开评论关键词和提问表达进行规则判断") {
  return leads.map((lead) => lead.intent ? lead : {
    ...lead,
    intent: {
      tier: lead.tier,
      score: lead.score,
      confidence: 0,
      reason,
      signals: lead.matchedTerms || [],
      source: "heuristic"
    }
  });
}

const FILTER_TERMS = Object.freeze(["负面", "差评", "不满", "失望", "投诉", "太差", "垃圾", "不好", "问题", "故障", "退货", "退款"]);

function heuristicFilterMatch(lead, goal = "") {
  const text = String(lead?.text || "");
  const target = String(goal || "");
  const terms = FILTER_TERMS.filter((term) => target.includes(term));
  const matchedTerms = (terms.length ? terms : FILTER_TERMS).filter((term) => text.includes(term));
  return {
    matched: matchedTerms.length > 0,
    confidence: matchedTerms.length ? 0.62 : 0.35,
    reason: matchedTerms.length ? `评论命中筛选词：${matchedTerms.join("、")}` : "未观察到与筛选条件直接对应的表达",
    signals: matchedTerms,
    source: "heuristic"
  };
}

function heuristicFilterAnalysis(leads, error = null) {
  return {
    mode: "filter",
    source: "heuristic",
    ...(error ? { error: "MODEL_UNAVAILABLE", errorCode: error.code || null } : {}),
    counts: {
      matched: leads.filter((lead) => lead.filter?.matched).length,
      unmatched: leads.filter((lead) => !lead.filter?.matched).length,
      modelReviewed: 0
    }
  };
}

function withHeuristicFilter(leads, goal, reason = null) {
  return leads.map((lead) => {
    const filter = heuristicFilterMatch(lead, goal);
    const { tier: _tier, intent: _intent, ...base } = lead;
    return { ...base, filter: reason ? { ...filter, reason } : filter, score: filter.matched ? 100 : 0 };
  });
}

function stripIntentFields(value = {}) {
  const {
    score: _score,
    tier: _tier,
    intent: _intent,
    matchedTerms: _matchedTerms,
    ...base
  } = value;
  return base;
}

async function applyIntentAnalysis(leads, { input, account, analyzer }) {
  if (input.analysisMode === "collect" || input.analysis_mode === "collect") {
    return {
      leads: leads.map(stripIntentFields),
      analysis: {
        mode: "collect",
        source: "none",
        counts: {
          collected: leads.length,
          pendingAnalysis: leads.length
        }
      }
    };
  }
  if (input.analysisMode === "filter" || input.analysis_mode === "filter") {
    return applyCommentFilterAnalysis(leads, { input, account, analyzer });
  }
  if (!leads.length) return { leads, analysis: heuristicAnalysis(leads) };
  if (!analyzer || typeof analyzer.analyze !== "function") return { leads: withHeuristicIntent(leads), analysis: heuristicAnalysis(leads) };
  try {
    const result = await analyzer.analyze({
      goal: input.goal,
      account,
      comments: leads.map((lead, index) => ({
        index,
        text: lead.text,
        videoTitle: lead.source?.videoTitle || "",
        observedAt: lead.source?.observedAt || "",
        profile: lead.profileData || lead.profile || {},
        recentWorks: lead.contentEvidence || lead.recentWorks || []
      }))
    });
    const byIndex = new Map((result.items || []).map((item) => [item.index, item]));
    const analyzedLeads = leads.map((lead, index) => {
      const item = byIndex.get(index);
      if (!item) return { ...lead, intent: { tier: lead.tier, score: lead.score, confidence: 0, reason: "模型未覆盖该评论，保留规则判断", signals: lead.matchedTerms || [], source: "heuristic" } };
      return {
        ...lead,
        score: item.score,
        tier: item.tier,
        intent: {
          tier: item.tier,
          score: item.score,
          confidence: item.confidence,
          reason: item.reason,
          signals: item.signals,
          ...(Array.isArray(item.traits) && item.traits.length ? { traits: item.traits } : {}),
          source: "model",
          provider: result.provider || null,
          model: result.model || null,
          generatedAt: result.generatedAt || null
        }
      };
    });
    return {
      leads: analyzedLeads,
      analysis: {
        mode: "model",
        source: "model",
        provider: result.provider || null,
        model: result.model || null,
        generatedAt: result.generatedAt || new Date().toISOString(),
        counts: {
          high: analyzedLeads.filter((lead) => lead.tier === "high").length,
          medium: analyzedLeads.filter((lead) => lead.tier === "medium").length,
          low: analyzedLeads.filter((lead) => lead.tier === "low").length,
          modelReviewed: analyzedLeads.filter((lead) => lead.intent?.source === "model").length
        }
      }
    };
  } catch (error) {
    return { leads: withHeuristicIntent(leads, "模型不可用，按公开评论关键词和提问表达进行规则兜底"), analysis: heuristicAnalysis(leads, error) };
  }
}

async function applyCommentFilterAnalysis(leads, { input, account, analyzer }) {
  if (!leads.length) return { leads, analysis: heuristicFilterAnalysis(leads) };
  if (!analyzer || typeof analyzer.analyze !== "function") {
    const classified = withHeuristicFilter(leads, input.goal);
    return { leads: classified.filter((lead) => lead.filter.matched), allLeads: classified, analysis: heuristicFilterAnalysis(classified) };
  }
  try {
    const result = await analyzer.analyze({
      mode: "filter",
      goal: input.goal,
      account,
      comments: leads.map((lead, index) => ({
        index,
        text: lead.text,
        videoTitle: lead.source?.videoTitle || "",
        observedAt: lead.source?.observedAt || ""
      }))
    });
    const byIndex = new Map((result.items || []).map((item) => [item.index, item]));
    const classified = leads.map((lead, index) => {
      const item = byIndex.get(index);
      if (!item) {
        const fallback = heuristicFilterMatch(lead, input.goal);
        const { tier: _tier, intent: _intent, ...base } = lead;
        return { ...base, filter: { ...fallback, reason: "模型未覆盖该评论，按规则兜底" }, score: fallback.matched ? 100 : 0 };
      }
      const { tier: _tier, intent: _intent, ...base } = lead;
      return {
        ...base,
        score: item.matched ? 100 : 0,
        filter: {
          matched: item.matched,
          confidence: item.confidence,
          reason: item.reason,
          signals: item.signals,
          source: "model",
          provider: result.provider || null,
          model: result.model || null,
          generatedAt: result.generatedAt || null
        }
      };
    });
    return {
      leads: classified.filter((lead) => lead.filter.matched),
      allLeads: classified,
      analysis: {
        mode: "filter",
        source: "model",
        provider: result.provider || null,
        model: result.model || null,
        generatedAt: result.generatedAt || new Date().toISOString(),
        counts: {
          matched: classified.filter((lead) => lead.filter.matched).length,
          unmatched: classified.filter((lead) => !lead.filter.matched).length,
          modelReviewed: classified.filter((lead) => lead.filter?.source === "model").length
        }
      }
    };
  } catch (error) {
    const classified = withHeuristicFilter(leads, input.goal, "模型不可用，按公开评论筛选词进行规则兜底");
    return { leads: classified.filter((lead) => lead.filter.matched), allLeads: classified, analysis: heuristicFilterAnalysis(classified, error) };
  }
}

function mergeLeadAnalysisIntoComments(comments, leads) {
  const byIdentity = new Map(leads.map((lead) => [lead.leadId || lead.id, lead]));
  return comments.map((comment) => {
    const identity = comment.leadId || comment.id || comment.externalUserId || comment.secUid || comment.uniqueId;
    const lead = byIdentity.get(identity);
    return lead ? { ...comment, score: lead.score, tier: lead.tier, intent: lead.intent, filter: lead.filter } : comment;
  });
}

function aggregateAnalysis(results, leads) {
  const modelResults = results.map((result) => result.resultSnapshot?.analysis).filter(Boolean);
  const collect = modelResults.some((analysis) => analysis.mode === "collect");
  if (collect) {
    return {
      mode: "collect",
      source: "none",
      counts: {
        collected: leads.length,
        pendingAnalysis: leads.length
      }
    };
  }
  const filter = modelResults.some((analysis) => analysis.mode === "filter");
  if (filter) {
    const matched = leads.length;
    const unmatched = modelResults.reduce((sum, analysis) => sum + Number(analysis.counts?.unmatched || 0), 0);
    return {
      mode: "filter",
      source: modelResults.some((analysis) => analysis.source === "model") ? "model" : "heuristic",
      provider: modelResults.find((analysis) => analysis.provider)?.provider || null,
      model: modelResults.find((analysis) => analysis.model)?.model || null,
      counts: {
        matched,
        unmatched,
        modelReviewed: modelResults.reduce((sum, analysis) => sum + Number(analysis.counts?.modelReviewed || 0), 0)
      }
    };
  }
  const model = modelResults.some((analysis) => analysis.mode === "model");
  return {
    mode: model ? "model" : "heuristic",
    source: model ? "model" : "heuristic",
    provider: modelResults.find((analysis) => analysis.provider)?.provider || null,
    model: modelResults.find((analysis) => analysis.model)?.model || null,
    counts: {
      high: leads.filter((lead) => lead.tier === "high").length,
      medium: leads.filter((lead) => lead.tier === "medium").length,
      low: leads.filter((lead) => lead.tier === "low").length,
      modelReviewed: modelResults.reduce((sum, analysis) => sum + Number(analysis.counts?.modelReviewed || 0), 0)
    }
  };
}

function eventIdentity(type, payload, index) {
  if (type === "lead.candidate" || type === "lead.qualified") {
    const lead = isRecord(payload?.lead) ? payload.lead : {};
    return stableToken({
      leadId: lead.leadId || lead.externalUserId || lead.secUid || lead.uniqueId || lead.id || null,
      videoId: lead.source?.videoId || null,
      quote: lead.text || null,
      score: lead.score ?? null,
      tier: lead.tier || null,
      evidence: Array.isArray(lead.evidence)
        ? lead.evidence.map((item) => item?.quote || item?.text || null).filter(Boolean)
        : []
    });
  }
  if (type === "lead.source.synced") {
    return stableToken({
      traces: payload?.traces || [],
      videos: payload?.videos || 0,
      comments: payload?.comments || 0
    });
  }
  if (type === "task.result.snapshot.updated" || type === "prospect.discovery.completed") {
    const snapshot = payload?.resultSnapshot || {};
    return stableToken({
      status: snapshot.status || payload?.status || null,
      traces: snapshot.traces || [],
      leads: Array.isArray(snapshot.leads)
        ? snapshot.leads.map((lead) => ({
          id: lead?.leadId || lead?.externalUserId || lead?.secUid || lead?.uniqueId || lead?.id || null,
          score: lead?.score ?? null,
          tier: lead?.tier || null,
          evidence: Array.isArray(lead?.evidence)
            ? lead.evidence.map((item) => item?.quote || item?.text || null).filter(Boolean)
            : []
        })).filter((lead) => lead.id)
        : [],
      counts: snapshot.counts || null
    });
  }
  return String(index);
}

function event(context, type, payload, index = 0, identity = {}) {
  return {
    eventId: `prospect:${context.taskId}:${context.taskRunId}:${type}:${eventIdentity(type, payload, index)}`,
    taskId: context.taskId,
    taskRunId: context.taskRunId,
    conversationId: context.conversationId,
    agentId: identity.agentId || context.agentId,
    skillId: identity.skillId || context.skillId || null,
    skillRunId: identity.skillRunId || context.skillRunId || null,
    type,
    seq: index + 1,
    occurredAt: new Date().toISOString(),
    payload: clone(payload)
  };
}

function resultSnapshot({ input, videos, leads, comments = [], pending = false, traces = [], commentCount = leads.length, account = null, analysis = null }) {
  const filterMode = analysis?.mode === "filter";
  const collectMode = analysis?.mode === "collect";
  const qualified = filterMode || collectMode ? [] : leads.filter((lead) => lead.tier === "high" || lead.tier === "medium");
  const analysisCounts = analysis?.counts || {
    high: leads.filter((lead) => lead.tier === "high").length,
    medium: leads.filter((lead) => lead.tier === "medium").length,
    low: leads.filter((lead) => lead.tier === "low").length,
    modelReviewed: 0
  };
  return {
    schemaVersion: 1,
    source: "douyin_public",
    status: pending ? "pending" : "completed",
    query: input.goal,
    ...(account ? { account: clone(account) } : {}),
    generatedAt: new Date().toISOString(),
    counts: {
      videos: videos.length,
      comments: Number.isInteger(commentCount) ? commentCount : leads.length,
      candidates: leads.length,
      qualified: qualified.length,
      high: filterMode || collectMode ? 0 : analysisCounts.high,
      medium: filterMode || collectMode ? 0 : analysisCounts.medium,
      low: filterMode || collectMode ? 0 : analysisCounts.low,
      ...(collectMode ? { pendingAnalysis: leads.length } : {}),
      ...(filterMode ? {
        matched: Number(analysisCounts.matched || leads.length),
        unmatched: Number(analysisCounts.unmatched || 0)
      } : {})
    },
    analysis: analysis ? clone(analysis) : {
      mode: "heuristic",
      source: "heuristic",
      counts: analysisCounts
    },
    videos: clone(videos),
    comments: clone(comments),
    leads: clone(leads),
    qualified: clone(qualified),
    traces: clone(traces)
  };
}

function traceOf(value) {
  if (!isRecord(value)) return null;
  return first(value.traceId, value.trace_id, value.taskId, value.task_id, value.requestId, value.request_id);
}

function traceIdsOf(value) {
  const source = nestedData(value);
  if (!isRecord(source)) return [];
  const traces = [];
  const direct = traceOf(source);
  if (direct != null) traces.push(String(direct));
  if (Array.isArray(source.tasks)) {
    for (const task of source.tasks) {
      const trace = traceOf(task);
      if (trace != null) traces.push(String(trace));
    }
  }
  return [...new Set(traces)];
}

function isConfiguredConnector(connector) {
  return Boolean(connector && connector.configured === true && typeof connector.videoList === "function" && typeof connector.comments === "function");
}

function normalizedCallbackPayload(value) {
  const source = nestedData(value);
  if (!isRecord(source)) return { videos: [], comments: [], traces: [] };
  const videos = extractVideos(source.itemList || source.item_list || source.videos || source.videoList || source);
  const comments = extractComments(source.comments || source.commentList || source.comment_list || source);
  const traces = traceIdsOf(source);
  return {
    videos: videos.map((video, index) => normalizeVideo(video, { goal: "" }, index)).filter(Boolean),
    comments,
    traces: traces.map((traceId) => ({ traceId }))
  };
}

function accountReferenceFromInput(input = {}) {
  const source = isRecord(input) ? input : {};
  const goal = String(source.goal || source.query || "");
  const explicitHandle = goal.match(/(?:抖音号|douyin\s*(?:id|handle)|账号)\s*[:：]?\s*([A-Za-z0-9_.-]{4,})/i)?.[1] || null;
  const labeledName = goal.match(/(?:账号名称|账号名|昵称|抖音账号)\s*[:：]\s*([^，。,\n]+)/)?.[1]?.trim() || null;
  // A request seeded by a specific work is already addressable. Do not turn
  // generic wording such as "分析这条作品评论" into a fake account lookup.
  const goalVideoInputs = videoInputsFromGoal(goal);
  const hasVideoSeed = Boolean(
    source.videoId || source.videoIds || source.videoUrl || source.videoUrls || source.seedUrls || source.sourceUrls
    || goalVideoInputs.videoIds.length || goalVideoInputs.videoUrls.length
  );
  const profileUrl = source.profileUrl || source.profile_url
    || publicUrlsFromText(goal).find((url) => !/\/(?:video|note)\//i.test(url))
    || null;
  const inferredName = hasVideoSeed || profileUrl
    ? null
    : goal.match(/(?:分析|查看|抓取|研究|读取)\s*([^，。,\n]+?)\s*(?:的)?(?:视频|评论|主页|账号)/)?.[1]?.trim() || null;
  const explicitName = [labeledName, inferredName]
    .map((value) => value && !/^(这个|该|目标|指定)(账号|用户)?$/i.test(value) ? value : null)
    .find(Boolean) || null;
  const embeddedSecId = source.secId || source.sec_id || source.secUid || source.sec_uid || secIdFromProfileUrl(profileUrl);
  return normalizeAccountReference({
    ...source,
    accountName: source.accountName || source.account_name || source.nickname || explicitName,
    uniqueId: source.uniqueId || source.unique_id || source.douyinId || source.douyin_id || explicitHandle,
    profileUrl,
    secId: embeddedSecId
  });
}

const ACCOUNT_FIELDS = Object.freeze([
  "account", "accountName", "account_name", "nickname", "uniqueId", "unique_id", "douyinId", "douyin_id",
  "profileUrl", "profile_url", "uid", "secId", "sec_id", "secUid", "sec_uid", "accountCode"
]);

function accountInputFromReference(baseInput, reference, multiple = false) {
  const base = { ...baseInput };
  delete base.accounts;
  delete base.accountRefs;
  delete base.accountList;
  if (multiple) {
    // A top-level identity belongs to the single-account form. Do not reuse
    // it for every item in a batch unless the item explicitly carries it.
    for (const field of ACCOUNT_FIELDS) delete base[field];
  }
  if (isRecord(reference)) return { ...base, ...reference };
  const value = nonEmpty(reference) || String(reference || "").trim();
  if (!value) return base;
  if (/^https?:\/\//i.test(value)) return { ...base, profileUrl: value };
  if (/^\d{5,}$/.test(value)) return { ...base, uniqueId: value };
  return { ...base, accountName: value };
}

function accountReferencesFromGoal(input = {}) {
  const goal = String(input.goal || input.query || "");
  const match = goal.match(/(?:账号(?:列表|有|包括|分别为)|抖音账号)\s*[:：]?\s*([^。！？]+)/i);
  if (!match) return [];
  const raw = match[1]
    // A single account prompt commonly continues with its handle and then
    // execution instructions. Those clauses are not additional accounts.
    .replace(/\s*(?:，|,|;|；)\s*(?:抖音号|douyin\s*(?:id|handle)|账号名称|账号名)\s*[:：][^，。！？]+/i, "")
    .split(/\s*(?:，|,|;|；)\s*(?=(?:抓取|采集|分析|查看|研究|读取|筛选|整理|输出|不登录|不发送|仅|只|需要|要求))/i)[0];
  const values = raw
    .split(/[、,，;；|\n]+/)
    .map((value) => value
      .replace(/^\s*(?:账号名称|账号名|抖音号|账号)\s*[:：]\s*/i, "")
      .replace(/\s*(?:的)?(?:公开视频|视频和评论|视频评论|视频|评论).*$/i, "")
      .trim())
    .filter((value) => value && !/(抓取|采集|分析|查看|研究|读取|筛选|整理|输出|不登录|不发送|公开视频|评论|购车意向)/i.test(value));
  return values.length > 1 ? values : [];
}

function accountInputsFromInput(input = {}) {
  const raw = input.accounts || input.accountRefs || input.accountList || accountReferencesFromGoal(input);
  if (!Array.isArray(raw) || raw.length === 0) return [{ input, multiple: false }];
  return raw.map((reference) => ({
    input: accountInputFromReference(input, reference, true),
    multiple: true
  }));
}

async function resolveInputAccounts(input, resolver) {
  const entries = accountInputsFromInput(input);
  const resolved = [];
  for (const entry of entries) {
    const value = await resolveInputAccount(entry.input, resolver);
    resolved.push(value);
  }
  return resolved;
}

function hasDirectAccountIdentity(input = {}) {
  const reference = accountReferenceFromInput(input);
  return Boolean(reference.uid && reference.secId);
}

async function resolveInputAccount(input, resolver) {
  const reference = accountReferenceFromInput(input);
  if (reference.secId && (!reference.accountName || reference.uid || reference.profileUrl)) {
    // A public profile URL already contains sec_id, but resolving it still
    // matters: the resolver supplies the visible nickname and Douyin handle
    // that the UI must show before collection starts.
    if (reference.profileUrl && !reference.accountName && !reference.uid
      && resolver && typeof resolver.resolve === "function") {
      const resolved = await resolver.resolve({ ...input, ...reference });
      if (resolved?.secId) {
        const account = normalizeResolvedAccount(resolved, { source: resolved.source || "resolver" });
        return {
          input: {
            ...input,
            uid: input.uid || account.uid,
            secId: account.secId,
            sec_id: account.secId,
            secUid: account.secId,
            sec_uid: account.secId,
            uniqueId: account.uniqueId || input.uniqueId,
            nickname: account.nickname || input.nickname,
            profileUrl: account.profileUrl || reference.profileUrl
          },
          account
        };
      }
    }
    const canonicalInput = {
      ...input,
      ...(reference.uid ? { uid: reference.uid } : {}),
      secId: reference.secId,
      sec_id: reference.secId,
      secUid: reference.secId,
      sec_uid: reference.secId
    };
    const account = reference.uid
      ? normalizeResolvedAccount(reference, { source: "provided" })
      : { ...reference, source: "provided" };
    return { input: canonicalInput, account };
  }
  // A bare uid/sec_id is still a valid low-level SpiderApi input. Only a
  // human-facing reference needs the account resolver capability.
  const hasReference = Boolean(reference.accountName || reference.uniqueId || reference.profileUrl);
  if (!hasReference) return { input, account: null };
  if (!resolver || typeof resolver.resolve !== "function") {
    throw new ProspectServiceError("账号解析能力未配置", {
      code: "ACCOUNT_RESOLVER_NOT_CONFIGURED",
      statusCode: 503,
      details: { required: ["BYERING_PROSPECT_ACCOUNT_RESOLVER_URL"] }
    });
  }
  const account = await resolver.resolve({ ...input, ...reference });
  return {
    input: {
      ...input,
      // SpiderApi's uid is the callback/account namespace. Preserve a caller
      // supplied owner uid; otherwise use the resolved platform uid as the
      // stable namespace for public-only collection.
      uid: input.uid || account.uid,
      secId: account.secId,
      sec_id: account.secId,
      secUid: account.secId,
      sec_uid: account.secId,
      uniqueId: account.uniqueId || input.uniqueId,
      nickname: account.nickname || input.nickname
    },
    account
  };
}

/**
 * Public-only lead discovery service. It is a separate executor from
 * ClueHunter/RPA and intentionally has no authorize, submit, or account
 * mutation methods.
 */
export function createProspectService({
  connector = null,
  accountResolver = null,
  accountResolverFactory = createAccountResolver,
  env = process.env,
  connectorFactory = createProspectConnector,
  mcpConnectorFactory = createDouyinDataMcpClient,
  intentAnalyzer = null,
  intentAnalyzerFactory = createLeadIntentAnalysisService,
  callbackUrl = null,
  now = () => new Date().toISOString()
} = {}) {
  let configuredConnector = null;
  let setupError = null;
  let configuredCallbackUrl = nonEmpty(callbackUrl);
  let configuredAccountResolver = accountResolver;
  let configuredIntentAnalyzer = intentAnalyzer;
  if (configuredIntentAnalyzer == null && nonEmpty(env.BYERING_LLM_API_KEY)) {
    try {
      configuredIntentAnalyzer = intentAnalyzerFactory({
        endpoint: env.BYERING_LLM_ENDPOINT,
        baseUrl: env.BYERING_LLM_BASE_URL,
        apiKey: env.BYERING_LLM_API_KEY,
        model: env.BYERING_LLM_MODEL,
        timeoutMs: env.BYERING_LLM_TIMEOUT_MS,
        maxAttempts: env.BYERING_LLM_MAX_ATTEMPTS
      });
    } catch {
      configuredIntentAnalyzer = null;
    }
  }
  if (configuredAccountResolver == null) {
    try {
      configuredAccountResolver = accountResolverFactory({ env });
    } catch (error) {
      configuredAccountResolver = {
        configured: false,
        resolve: async () => { throw error; }
      };
    }
  }
  if (connector != null) {
    if (!isConfiguredConnector(connector)) setupError = new ProspectServiceError("Prospect connector is incomplete", {
      code: "PROSPECT_CONFIG_INVALID",
      statusCode: 503
    });
    else configuredConnector = connector;
  } else {
    const config = prospectConnectorConfiguration(env);
    configuredCallbackUrl ||= config.callbackUrl;
    if (config.mcpUrl) {
      try {
        configuredConnector = mcpConnectorFactory({
          url: config.mcpUrl,
          timeoutMs: config.timeoutMs
        });
        if (!isConfiguredConnector(configuredConnector)) setupError = new ProspectServiceError("douyin-data MCP connector is incomplete", {
          code: "PROSPECT_CONFIG_INVALID",
          statusCode: 503
        });
      } catch (error) {
        setupError = new ProspectServiceError("douyin-data MCP configuration is invalid", {
          code: error.code || "PROSPECT_CONFIG_INVALID",
          statusCode: 503,
          details: { cause: error.message }
        });
      }
    } else if (!config.baseUrl) setupError = new ProspectServiceError("Prospect Spider connector is not configured", {
      code: "PROSPECT_NOT_CONFIGURED",
      statusCode: 503
    });
    else {
      try {
        configuredConnector = connectorFactory(config);
        if (!isConfiguredConnector(configuredConnector)) setupError = new ProspectServiceError("Prospect connector is incomplete", {
          code: "PROSPECT_CONFIG_INVALID",
          statusCode: 503
        });
      } catch (error) {
        setupError = new ProspectServiceError("Prospect Spider configuration is invalid", {
          code: error.code || "PROSPECT_CONFIG_INVALID",
          statusCode: 503,
          details: { cause: error.message }
        });
      }
    }
  }

  async function discoverOne(input, account, options = {}) {
    const context = normalizeContext(input);
    const request = publicRequest(input);
    if (!request.callbackUrl && configuredCallbackUrl) request.callbackUrl = callbackUrlFor(configuredCallbackUrl, context, input);
    const { videoIds, videoUrls } = videoIdsFromInput(input);
    let videoResponse = null;
    let commentResponse = null;
    let videos = [];
    let comments = [];
    const traces = [];

    if (videoIds.length || videoUrls.length) {
      request.videoIds = videoIds;
      request.videoUrls = videoUrls;
    } else if (request.uid != null || request.secId || request.accountCode) {
      const videoRequest = input.videoLimit != null && input.lookbackDays != null
        ? { ...request, lastTime: undefined, last_time: undefined }
        : request;
      videoResponse = await configuredConnector.videoList(videoRequest, options);
      const extractedVideos = extractVideos(videoResponse);
      videos = extractedVideos.map((video, index) => normalizeVideo(video, input, index)).filter(Boolean);
      if (input.videoLimit != null) videos = videos.slice(0, input.videoLimit);
      for (const trace of traceIdsOf(videoResponse)) traces.push({ operation: "video_list", traceId: trace });
    } else if (request.query) {
      if (configuredConnector.searchConfigured !== true || typeof configuredConnector.search !== "function") {
        throw new ProspectServiceError("当前 SpiderApi 只支持已知账号视频和视频评论，关键词找人搜索源尚未配置", {
          code: "PROSPECT_PUBLIC_SEARCH_NOT_CONFIGURED",
          statusCode: 503,
          details: { required: "BYERING_PROSPECT_SEARCH_ENABLED" }
        });
      }
      videoResponse = await configuredConnector.search(request, options);
      const extractedVideos = extractVideos(videoResponse);
      videos = extractedVideos.map((video, index) => normalizeVideo(video, input, index)).filter(Boolean);
      if (input.videoLimit != null) videos = videos.slice(0, input.videoLimit);
      for (const trace of traceIdsOf(videoResponse)) traces.push({ operation: "search", traceId: trace });
    }

    const knownVideoIds = [...new Set([...videoIds, ...videos.map((video) => video.videoId).filter(Boolean)])];
    if (knownVideoIds.length) {
      if (configuredConnector.kind === "douyin-data-mcp" && knownVideoIds.length > 1) {
        // The remote MCP implementation currently resolves only one video
        // when an array is supplied. Keep the calls separate until the server
        // offers a true multi-video response contract.
        for (const videoId of knownVideoIds) {
          const response = await configuredConnector.comments({ ...request, videoIds: [videoId], videoUrls: undefined }, options);
          comments.push(...extractComments(response));
          for (const trace of traceIdsOf(response)) traces.push({ operation: "comments", traceId: trace, videoId });
        }
      } else {
        commentResponse = await configuredConnector.comments({ ...request, videoIds: knownVideoIds, videoUrls: undefined }, options);
        comments = extractComments(commentResponse);
        for (const trace of traceIdsOf(commentResponse)) traces.push({ operation: "comments", traceId: trace });
      }
    }

    const videosById = new Map(videos.map((video) => [String(video.videoId), video]));
    const commentLimit = input.commentLimit || input.limit;
    const windowedComments = filterCommentsByLookback(comments, input.lookbackDays);
    const normalizedComments = boundedCommentSelection(windowedComments, commentLimit)
      .map((comment, index) => normalizeLead(comment, videosById, input, index))
      .filter(Boolean);
    const scoredLeads = uniqueLeads(normalizedComments);
    const analyzed = await applyIntentAnalysis(scoredLeads, { input, account, analyzer: configuredIntentAnalyzer });
    const collectionOnly = input.analysisMode === "collect" || input.analysis_mode === "collect";
    const minScore = collectionOnly ? null : toNumber(input.minScore);
    const leads = minScore == null ? analyzed.leads : analyzed.leads.filter((lead) => lead.score >= minScore);
    const analyzedComments = collectionOnly
      ? normalizedComments.map(stripIntentFields)
      : mergeLeadAnalysisIntoComments(normalizedComments, analyzed.allLeads || analyzed.leads);
    const pending = Boolean(
      (videoResponse && !videos.length && traceIdsOf(videoResponse).length > 0)
      || (commentResponse && !comments.length && traceIdsOf(commentResponse).length > 0)
    );
    const snapshot = resultSnapshot({ input, videos, leads, comments: analyzedComments, pending, traces, commentCount: normalizedComments.length, account, analysis: analyzed.analysis });
    const events = [event(context, "task.execution.accepted", {
      source: "prospect",
      provider: "douyin",
      agentId: context.agentId,
      skillId: context.skillId,
      mode: "public_discovery",
      pending
    }, 0)];
    if (account) events.push(event(context, "account.resolved", {
      account,
      source: account.source || "provided"
    }, events.length, {
      agentId: "acquisition_strategist",
      skillId: "account_resolution"
    }));
    if (videos.length || traces.length) events.push(event(context, "lead.source.synced", {
      source: "douyin_public",
      provider: "douyin",
      videos: videos.length,
      traces,
      pending
    }, events.length));
    for (const lead of leads) {
      events.push(event(context, "lead.candidate", { lead }, events.length));
      if (lead.tier === "high" || lead.tier === "medium") events.push(event(context, "lead.qualified", { lead }, events.length));
    }
    events.push(event(context, "task.result.snapshot.updated", { resultSnapshot: snapshot }, events.length));
    // This is the lead_miner stage boundary, not the overall task terminal.
    // Do not close even this stage while SpiderApi still owes an async
    // callback; the workflow runner will resume from that callback.
    if (!pending) events.push(event(context, "prospect.discovery.completed", {
      stage: "lead_miner",
      status: "SUCCEEDED",
      pending: false,
      resultSnapshot: snapshot,
      source: "prospect"
    }, events.length));
    return {
      accepted: true,
      dispatched: true,
      source: "prospect",
      uid: null,
      status: pending ? "PENDING" : "SUCCEEDED",
      resultSnapshot: snapshot,
      events
    };
  }

  async function discover(rawInput = {}, options = {}) {
    if (setupError) throw setupError;
    assertCommentLeadMinerOwnSource(rawInput);
    const validatedInput = validateInput(rawInput);
    const resolvedAccounts = await resolveInputAccounts(validatedInput, configuredAccountResolver);
    if (resolvedAccounts.length === 1) {
      return discoverOne(resolvedAccounts[0].input, resolvedAccounts[0].account, options);
    }

    const results = [];
    for (const resolved of resolvedAccounts) {
      results.push(await discoverOne(resolved.input, resolved.account, options));
    }
    const accountKey = (account) => account?.secId || account?.uid || account?.uniqueId || account?.nickname || "unknown";
    const accounts = results.map((result, index) => ({
      ...(result.resultSnapshot?.account || {}),
      resultIndex: index,
      accountKey: accountKey(result.resultSnapshot?.account)
    }));
    const firstInput = resolvedAccounts[0].input;
    const videos = results.flatMap((result, resultIndex) => (result.resultSnapshot?.videos || []).map((video) => ({
      ...video,
      accountKey: accounts[resultIndex].accountKey,
      account: results[resultIndex].resultSnapshot?.account?.nickname || null
    })));
    const leads = uniqueLeads(results.flatMap((result, resultIndex) => (result.resultSnapshot?.leads || []).map((lead) => ({
      ...lead,
      source: {
        ...(lead.source || {}),
        accountKey: accounts[resultIndex].accountKey,
        accountName: results[resultIndex].resultSnapshot?.account?.nickname || null
      }
    })))).slice(0, firstInput.limit);
    const traces = results.flatMap((result, resultIndex) => (result.resultSnapshot?.traces || []).map((trace) => ({
      ...trace,
      accountKey: accounts[resultIndex].accountKey
    })));
    const pending = results.some((result) => result.status === "PENDING" || result.resultSnapshot?.status === "pending");
    const snapshot = resultSnapshot({
      input: firstInput,
      videos,
      leads,
      pending,
      traces,
      commentCount: results.reduce((sum, result) => sum + Number(result.resultSnapshot?.counts?.comments || 0), 0),
      account: null,
      analysis: aggregateAnalysis(results, leads)
    });
    snapshot.batch = true;
    snapshot.accounts = accounts;
    snapshot.counts.accounts = accounts.length;
    const events = results.flatMap((result, resultIndex) => {
      const key = accounts[resultIndex].accountKey;
      return (result.events || []).map((item) => ({
        ...clone(item),
        eventId: `${item.eventId}:account:${stableToken(key)}`,
        payload: {
          ...(isRecord(item.payload) ? item.payload : {}),
          accountKey: key,
          account: results[resultIndex].resultSnapshot?.account || null
        }
      }));
    });
    events.push(event(normalizeContext(firstInput), "task.result.snapshot.updated", {
      resultSnapshot: snapshot,
      batch: true,
      accounts: accounts.length
    }, events.length));
    if (!pending) events.push(event(normalizeContext(firstInput), "prospect.discovery.completed", {
      stage: "lead_miner",
      status: "SUCCEEDED",
      pending: false,
      resultSnapshot: snapshot,
      source: "prospect",
      batch: true
    }, events.length));
    return {
      accepted: results.every((result) => result.accepted !== false),
      dispatched: true,
      source: "prospect",
      uid: null,
      status: pending ? "PENDING" : "SUCCEEDED",
      resultSnapshot: snapshot,
      events
    };
  }

  async function analyze(rawInput = {}) {
    if (!isRecord(rawInput)) throw new ProspectServiceError("Prospect analysis request must be an object", {
      code: "PROSPECT_INPUT_INVALID",
      statusCode: 400
    });
    const publicInput = { ...rawInput };
    delete publicInput.candidates;
    delete publicInput.leads;
    assertPublicInput(publicInput);
    const context = normalizeContext(rawInput);
    const rawCandidates = Array.isArray(rawInput.candidates)
      ? rawInput.candidates
      : Array.isArray(rawInput.leads)
        ? rawInput.leads
        : [];
    if (rawCandidates.length > 500) throw new ProspectServiceError("candidates must contain no more than 500 records", {
      code: "PROSPECT_INPUT_INVALID",
      statusCode: 400,
      details: { field: "candidates", max: 500 }
    });
    rawCandidates.forEach((candidate, index) => assertPublicInput(candidate, `candidates[${index}]`));
    const analysisScope = first(rawInput.analysisScope, rawInput.analysis_scope, "comprehensive");
    const goal = first(rawInput.goal, rawInput.query, "综合分析账号、作品、评论、用户和互动信息");
    const candidates = rawCandidates.map((candidate, index) => {
      const item = isRecord(candidate) ? clone(candidate) : {};
      const identity = first(item.leadId, item.recordId, item.sourceRecordId, item.secUid, item.sec_uid, item.uniqueId, item.unique_id, item.id, `candidate-${index + 1}`);
      const candidateText = first(item.text, item.comment, item.content, item.evidence?.[0]?.quote, "");
      const fallback = scoreText(String(candidateText || ""), goal);
      return {
        ...item,
        id: String(first(item.id, identity)),
        leadId: String(identity),
        sourceRecordId: first(item.sourceRecordId, item.recordId, item.id),
        text: String(candidateText || "").trim(),
        score: toNumber(item.score) ?? fallback.score,
        tier: String(first(item.tier, fallback.score >= 45 ? "high" : fallback.score >= 18 ? "medium" : "low"))
      };
    }).filter((candidate) => candidate.leadId && (candidate.text || candidate.nickname || candidate.name || candidate.uniqueId || candidate.secUid));
    const analyzed = await applyIntentAnalysis(candidates, {
      input: { ...rawInput, goal, analysisMode: "intent", analysisScope },
      account: rawInput.account || null,
      analyzer: configuredIntentAnalyzer
    });
    const leads = analyzed.leads || [];
    const counts = {
      candidates: leads.length,
      qualified: leads.filter((lead) => lead.tier === "high" || lead.tier === "medium").length,
      high: leads.filter((lead) => lead.tier === "high").length,
      medium: leads.filter((lead) => lead.tier === "medium").length,
      low: leads.filter((lead) => lead.tier === "low").length
    };
    const sourceScope = first(rawInput.sourceScope, rawInput.source_scope, "own_account_comments");
    const sourceResultId = first(rawInput.sourceResultId, rawInput.source_result_id);
    const sourceTaskId = first(rawInput.sourceTaskId, rawInput.source_task_id);
    const sourceTaskTitle = first(rawInput.sourceTaskTitle, rawInput.source_task_title);
    const sourceTaskGoal = first(rawInput.sourceTaskGoal, rawInput.source_task_goal);
    const sourceResultType = first(rawInput.sourceResultType, rawInput.source_result_type);
    const sourceAccountId = first(rawInput.sourceAccountId, rawInput.source_account_id);
    const sourceAccountName = first(rawInput.sourceAccountName, rawInput.source_account_name);
    const snapshot = {
      schemaVersion: 1,
      source: "prospect_analysis",
      status: "completed",
      query: goal,
      generatedAt: now(),
      ...(rawInput.account ? { account: clone(rawInput.account) } : {}),
      sourceScope,
      inputs: { analysisMode: "intent", analysisScope, sourceResultId, sourceTaskId, sourceTaskTitle, sourceTaskGoal, sourceResultType, sourceScope, sourceAccountId, sourceAccountName },
      links: { sourceResultId, sourceTaskId, sourceTaskTitle, sourceTaskGoal, sourceResultType, sourceAccountId, sourceAccountName },
      counts,
      analysis: clone(analyzed.analysis),
      leads: clone(leads),
      qualified: clone(leads.filter((lead) => lead.tier === "high" || lead.tier === "medium")),
      comments: [],
      videos: [],
      traces: []
    };
    const events = [event(context, "task.execution.accepted", {
      source: "prospect",
      provider: "internal",
      agentId: context.agentId,
      mode: "comprehensive_analysis"
    }, 0)];
    events.push(event(context, "task.result.snapshot.updated", { resultSnapshot: snapshot }, events.length));
    events.push(event(context, "prospect.intent.analysis.completed", {
      status: "SUCCEEDED",
      resultSnapshot: snapshot,
      source: "prospect"
    }, events.length));
    return {
      accepted: true,
      dispatched: true,
      source: "prospect",
      status: "SUCCEEDED",
      resultSnapshot: snapshot,
      events
    };
  }

  return Object.freeze({
    kind: "prospect",
    source: "prospect",
    configured: Boolean(configuredConnector),
    requiresExecutorUid: false,
    accountResolverConfigured: Boolean(configuredAccountResolver?.configured),
    discover,
    analyze,
    callback: async (input = {}, response = {}) => {
      const context = normalizeContext(input);
      const validatedInput = validateInput({ ...input, goal: input.goal || input.query || "公开抖音线索回传" });
      const resolved = await resolveInputAccount(validatedInput, configuredAccountResolver);
      const request = resolved.input;
      const account = resolved.account;
      const normalized = normalizedCallbackPayload(response);
      const videos = normalized.videos;
      let comments = normalized.comments;
      const traces = [...normalized.traces];
      let pending = !comments.length && normalized.traces.length > 0;
      // SpiderApi returns the video-list callback before it queues comment
      // collection. Continue the public-only workflow automatically; no
      // account session or RPA executor is involved.
      if (!comments.length && videos.length) {
        const commentRequest = publicRequest(request);
        if (!commentRequest.callbackUrl && configuredCallbackUrl) {
          commentRequest.callbackUrl = callbackUrlFor(configuredCallbackUrl, context, request);
        }
        const commentResponse = await configuredConnector.comments({
          ...commentRequest,
          videoIds: videos.map((video) => video.videoId).filter(Boolean)
        });
        comments = extractComments(commentResponse);
        const commentTraces = traceIdsOf(commentResponse);
        for (const traceId of commentTraces) traces.push({ operation: "comments", traceId });
        pending = !comments.length && commentTraces.length > 0;
      }
      const videosById = new Map(videos.map((video) => [String(video.videoId), video]));
      const normalizedComments = comments.map((comment, index) => normalizeLead(comment, videosById, request, index)).filter(Boolean);
      const scoredLeads = uniqueLeads(normalizedComments);
      const analyzed = await applyIntentAnalysis(scoredLeads, { input: request, account, analyzer: configuredIntentAnalyzer });
      const collectionOnly = request.analysisMode === "collect" || request.analysis_mode === "collect";
      const minScore = collectionOnly ? null : toNumber(request.minScore);
      const leads = minScore == null ? analyzed.leads : analyzed.leads.filter((lead) => lead.score >= minScore);
      const analyzedComments = collectionOnly
        ? normalizedComments.map(stripIntentFields)
        : mergeLeadAnalysisIntoComments(normalizedComments, analyzed.allLeads || analyzed.leads);
      const snapshot = resultSnapshot({ input: request, videos, leads, comments: analyzedComments, pending, traces, commentCount: comments.length, account, analysis: analyzed.analysis });
      const events = [];
      if (account) events.push(event(context, "account.resolved", {
        account,
        source: account.source || "provided"
      }, events.length, {
        agentId: "acquisition_strategist",
        skillId: "account_resolution"
      }));
      events.push(event(context, "lead.source.synced", {
        source: "douyin_public",
        provider: "douyin",
        videos: videos.length,
        comments: comments.length,
        traces,
        pending
      }, events.length));
      for (const lead of leads) {
        events.push(event(context, "lead.candidate", { lead }, events.length));
        if (lead.tier === "high" || lead.tier === "medium") events.push(event(context, "lead.qualified", { lead }, events.length));
      }
      events.push(event(context, "task.result.snapshot.updated", { resultSnapshot: snapshot }, events.length));
      if (!pending) events.push(event(context, "prospect.discovery.completed", {
        stage: "lead_miner",
        status: "SUCCEEDED",
        pending: false,
        resultSnapshot: snapshot,
        source: "prospect"
      }, events.length));
      return { accepted: true, source: "prospect", status: pending ? "PENDING" : "SUCCEEDED", resultSnapshot: snapshot, events };
    },
    // `lease` lets a routing dispatcher use this service without making it a
    // ClueHunter/RPA executor. It still only performs public discovery.
    lease: discover
  });
}

export {
  extractComments,
  extractVideos,
  normalizeLead,
  normalizeVideo,
  scoreText
};
