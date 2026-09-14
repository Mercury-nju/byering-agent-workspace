import { randomUUID } from "node:crypto";
import {
  createDouyinAgentDataClient,
  DouyinAgentDataError
} from "../src/salebuddy/bridge/douyin-agent-data.js";
import { publicFinderNeedsBusinessAccount, validatePublicFinderBusinessAccount } from "../src/salebuddy/agents/public-finder-contract.js";

const DEFAULT_AGENT_ID = "mkt-douyin-finder";
const MAX_BATCH_ACCOUNTS = 50;
const MAX_TASK_RESULT_TARGET = 2_000;
const DEFAULT_DISCOVERY_LIMIT = 12;
const DEFAULT_RESULT_LIMIT = 10;
const MAX_DISCOVERY_PAGES = 100;
const DEFAULT_DISCOVERY_RETRY_ATTEMPTS = 2;
const DEFAULT_DISCOVERY_RETRY_DELAY_MS = 1_000;
const DEFAULT_VERIFICATION_CONCURRENCY = 2;
const MAX_VIDEO_DETAILS = 50;
const SEC_UID_PATTERN = /MS4wLjAB[A-Za-z0-9_-]{12,}/g;
const URL_PATTERN = /https?:\/\/[^\s，。,；;]+/gi;
const SECRET_KEY = /(?:authorization|(?:access|refresh)?[_-]?token|password|passwd|cookie|secret|csrf|jwt|api[-_]?key)/i;
const LOCATION_NAMES = [
  "北京", "上海", "天津", "重庆", "广州", "深圳", "杭州", "成都", "武汉", "南京", "苏州", "西安", "长沙", "郑州", "青岛", "宁波", "厦门", "合肥", "济南", "福州", "昆明", "沈阳", "大连", "东莞", "佛山", "中国"
];

export class DouyinFinderError extends Error {
  constructor(message, { code = "DOUYIN_FINDER_ERROR", statusCode = 400, details = {} } = {}) {
    super(message);
    this.name = "DouyinFinderError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = redact(details);
  }
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function text(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function first(...values) {
  for (const value of values) {
    if (value === 0 || value === false) return value;
    if (text(value)) return text(value);
    if (value != null && typeof value !== "string") return value;
  }
  return null;
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !SECRET_KEY.test(key) && key !== "cause")
    .map(([key, child]) => [key, redact(child)]));
}

function nestedData(value) {
  if (!isRecord(value)) return value;
  for (const key of ["data", "result", "entity"]) {
    if (value[key] != null) return value[key];
  }
  return value;
}

function arrayFrom(value, keys = ["items", "list", "records", "videos", "video_list", "videoList", "candidates", "users", "data"]) {
  if (Array.isArray(value)) return value;
  if (!isRecord(value)) return [];
  for (const key of keys) if (Array.isArray(value[key])) return value[key];
  return [];
}

function number(value) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function countValue(value, unit = "") {
  const parsed = Number(String(value || "").replace(/,/g, ""));
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed * (unit === "万" ? 10000 : unit === "千" ? 1000 : unit === "百" ? 100 : 1));
}

function criteriaFromGoal(goal) {
  const source = text(goal);
  if (!source) return {};
  const criteria = {};
  const metric = (pattern, key) => {
    const match = source.match(pattern);
    if (!match) return;
    const min = countValue(match[1], match[2]);
    const max = match[3] ? countValue(match[3], match[4]) : null;
    if (min != null) criteria[key] = min;
    if (max != null) criteria[`${key.replace(/^min/, "max")}`] = max;
  };
  metric(/粉丝(?:量|数)?[^\d]{0,10}(\d+(?:\.\d+)?)\s*(万|千|百)?(?:\s*(?:到|至|-)\s*(\d+(?:\.\d+)?)\s*(万|千|百)?)?/i, "minFollowers");
  metric(/(?:获赞|点赞)[^\d]{0,10}(\d+(?:\.\d+)?)\s*(万|千|百)?/i, "minLikes");
  metric(/作品(?:数|数量)?[^\d]{0,10}(\d+(?:\.\d+)?)\s*(万|千|百)?/i, "minAwemeCount");
  const location = LOCATION_NAMES.find((name) => new RegExp(`(?:在|位于|来自)\\s*(?:近期|最近|当前|正在)?${name}`).test(source)
    || new RegExp(`找\\s*${name}(?=的|粉丝|账号|达人|主播|商家|$)`).test(source));
  if (location) criteria.locations = [location];
  if (/(?:当前正在直播|正在直播|当前直播|直播中|只找直播)/.test(source)) criteria.liveOnly = true;
  if (/(?:已认证|认证账号|官方认证)/.test(source)) criteria.requiredVerify = true;
  if (/(?:未认证|不要认证)/.test(source)) criteria.requiredVerify = false;
  const exclusions = [];
  if (/排除[^，。；;]{0,8}同行/.test(source)) exclusions.push("同行");
  if (/排除[^，。；;]{0,8}抽奖/.test(source)) exclusions.push("抽奖");
  if (exclusions.length) criteria.excludeKeywords = exclusions;
  return criteria;
}

function topicSignalsFromGoal(goal) {
  const source = text(goal).toLowerCase();
  if (!source) return [];
  const topicSignals = [];
  if (/(?:^|[^a-z0-9])ai(?:$|[^a-z0-9])|aigc|人工智能|大模型/i.test(source)) topicSignals.push("ai");
  if (/科普/.test(source)) topicSignals.push("科普");
  return topicSignals;
}

function growthIntentFromGoal(goal) {
  const source = text(goal).toLowerCase();
  if (!source) return null;
  const mentionsFollowers = /粉丝|涨粉/.test(source);
  const asksForGrowth = /增长|增量|新增|上涨|涨得|涨粉|增速|最快|最多/.test(source);
  if (!mentionsFollowers || !asksForGrowth) return null;
  const windowDays = /30\s*天|近\s*一个月|最近\s*一个月|近\s*1\s*个月|最近\s*1\s*个月|月度/.test(source) ? 30 : 7;
  const topicSignals = topicSignalsFromGoal(source);
  return { metric: "followers", windowDays, topicSignals };
}

function chineseCount(value) {
  const source = text(value);
  if (!source) return null;
  if (/^\d+$/.test(source)) return number(source);
  const digits = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  const thousand = source.match(/^([一二两三四五六七八九])?千(?:([一二两三四五六七八九])?百)?(?:(?:[零一二两三四五六七八九])?十)?([一二两三四五六七八九])?$/);
  if (thousand) {
    const [, thousands, hundreds, ones] = thousand;
    const tensMatch = source.match(/([一二两三四五六七八九])?十/);
    return (digits[thousands] || 1) * 1000 + (hundreds ? digits[hundreds] * 100 : 0) + (tensMatch ? (digits[tensMatch[1]] || 1) * 10 : 0) + (ones ? digits[ones] : 0);
  }
  if (source === "十") return 10;
  if (source.includes("十")) {
    const [left, right] = source.split("十");
    return (digits[left] || 1) * 10 + (digits[right] || 0);
  }
  return digits[source] ?? null;
}

function requestedResultLimitFromGoal(goal) {
  const source = text(goal);
  if (!source) return null;
  const match = source.match(/(?:帮我|请|需要|想要|给我|找|推荐|筛选|返回|列出)\s*(\d+|[零一二两三四五六七八九十百千]+)\s*(?:个|位|名)/)
    || source.match(/前\s*(\d+|[零一二两三四五六七八九十百千]+)\s*(?:个|位|名)?/);
  const parsed = chineseCount(match?.[1]);
  return parsed == null ? null : Math.max(1, parsed);
}

function hasUnboundedFinderScope(goal) {
  return /(?:全网|全行业|整个行业|行业(?:里|内|中)?(?:所有|全部)|(?:所有|全部)(?:的)?(?:用户|账号|商家|博主|创作者|人))/.test(text(goal));
}

function assertBoundedFinderRequest({ goal, requestedLimit }) {
  if (hasUnboundedFinderScope(goal)) {
    throw new DouyinFinderError("找人任务需要明确范围，不能承诺覆盖全行业或所有用户。请补充地区、粉丝要求或具体人群后，分批查找。", {
      code: "DOUYIN_FINDER_SCOPE_TOO_BROAD",
      statusCode: 400,
      details: { maxResultLimit: MAX_TASK_RESULT_TARGET }
    });
  }
  if (requestedLimit > MAX_TASK_RESULT_TARGET) {
    throw new DouyinFinderError(`单次找人任务最多整理 ${MAX_TASK_RESULT_TARGET} 个已核验账号。请缩小目标数量后再次发起任务。`, {
      code: "DOUYIN_FINDER_RESULT_LIMIT_EXCEEDED",
      statusCode: 400,
      details: { requestedLimit, maxResultLimit: MAX_TASK_RESULT_TARGET }
    });
  }
}

function bool(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  return ["true", "1", "yes", "on", "live", "直播中"].includes(String(value || "").toLowerCase());
}

function retryableDiscoveryError(error) {
  const statusCode = Number(first(error?.statusCode, error?.status));
  const code = text(error?.code).toUpperCase();
  if (statusCode === 429 || statusCode >= 500) return true;
  return /(?:TIMEOUT|UNAVAILABLE|UPSTREAM|RATE_LIMIT|SEARCH_FAILED)/.test(code);
}

function wait(ms) {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

function list(value) {
  if (Array.isArray(value)) return value.map((item) => text(item)).filter(Boolean);
  const source = text(value);
  return source ? source.split(/[\n,，、;；]+/).map((item) => item.trim()).filter(Boolean) : [];
}

function publicUrls(value) {
  return [...String(value || "").matchAll(URL_PATTERN)]
    .map((match) => match[0].replace(/[)\]}>]+$/, ""))
    .filter(Boolean);
}

function secUids(value) {
  return [...String(value || "").matchAll(SEC_UID_PATTERN)].map((match) => match[0]);
}

function extractReferences(input) {
  const candidates = [input.accounts, input.accountRefs, input.accountList, input.references, input.inputs, input.sourceText, input.seedText, input.accountInput]
    .flatMap((value) => Array.isArray(value) ? value : value == null ? [] : [value]);
  const references = [];
  for (const candidate of candidates) {
    if (isRecord(candidate)) {
      const value = first(candidate.input, candidate.url, candidate.profileUrl, candidate.profile_url, candidate.sec_uid, candidate.secUid, candidate.shareText, candidate.share_text);
      if (value) references.push(String(value));
      continue;
    }
    const raw = text(candidate);
    if (!raw) continue;
    const extractedUrls = publicUrls(raw);
    const remainingText = extractedUrls.reduce((value, url) => value.replace(url, " "), raw);
    const extractedSecUids = secUids(remainingText);
    if (extractedUrls.length || extractedSecUids.length) references.push(...extractedUrls, ...extractedSecUids);
    else references.push(raw);
  }
  return [...new Set(references)].slice(0, MAX_BATCH_ACCOUNTS);
}

function normalizeAccountContext(input) {
  const raw = isRecord(input?.accountContext) ? input.accountContext : {};
  const businessAccountUrl = text(first(raw.businessAccountUrl, raw.businessAccount?.profileUrl, input?.businessAccountUrl));
  const referenceAccountUrls = [raw.referenceAccountUrls, raw.referenceAccounts, input?.referenceAccountUrls]
    .flatMap((value) => Array.isArray(value) ? value : list(value))
    .map((value) => text(value))
    .filter(Boolean);
  return {
    businessAccountUrl: businessAccountUrl || null,
    referenceAccountUrls: [...new Set(referenceAccountUrls)].filter((value) => value !== businessAccountUrl).slice(0, 20)
  };
}

function extractVideoInputs(input) {
  const values = [input.videoIds, input.videoId, input.videoUrls, input.videoUrl, input.videoInputs]
    .flatMap((value) => Array.isArray(value) ? value : value == null ? [] : [value])
    .map((item) => text(item)).filter(Boolean);
  const fromGoal = [...publicUrls(input.goal || input.query)].filter((url) => /douyin\.com/i.test(url) && /\/(?:share\/)?(?:video|note)\//i.test(url));
  return [...new Set([...values, ...fromGoal])].slice(0, MAX_VIDEO_DETAILS);
}

function discoveryCandidates(value) {
  const source = nestedData(value);
  const discoveryKeys = ["accounts", "candidates", "users", "leads", "items", "records", "videos", "data"];
  return Array.isArray(source)
    ? source
    : discoveryKeys.flatMap((key) => Array.isArray(source?.[key]) ? source[key] : []);
}

function discoveryCandidateText(candidate) {
  if (!isRecord(candidate)) return "";
  const account = isRecord(candidate.account) ? candidate.account : candidate;
  return [
    account.nickname,
    account.nick_name,
    account.name,
    account.signature,
    account.desc,
    account.description,
    account.unique_id,
    account.uniqueId
  ].map((value) => text(value).toLowerCase()).filter(Boolean).join(" ");
}

function discoveryCandidateRelevant(candidate, signals = []) {
  if (!signals.length) return true;
  const searchText = discoveryCandidateText(candidate);
  if (!searchText) return true;
  // Search snippets are only a recall-stage hint. Keep the primary topic strict,
  // then verify educational intent from the full profile and recent videos.
  const recallSignals = signals.includes("ai") ? ["ai"] : signals;
  return recallSignals.every((signal) => topicSignalMatches(searchText, signal));
}

function extractDiscoveryReferences(value, { topicSignals = [], limit = MAX_BATCH_ACCOUNTS } = {}) {
  const candidates = discoveryCandidates(value);
  const references = [];
  for (const candidate of candidates) {
    if (!isRecord(candidate)) continue;
    if (!discoveryCandidateRelevant(candidate, topicSignals)) continue;
    const account = isRecord(candidate.account) ? candidate.account : candidate;
    const reference = first(
      account.profileUrl,
      account.profile_url,
      account.sec_uid,
      account.secUid,
      account.sec_id,
      account.secId,
      account.uid,
      account.url,
      account.author_url,
      account.authorUrl,
      account.author_sec_uid,
      account.authorSecUid
    );
    if (reference) references.push(String(reference));
  }
  return [...new Set(references)].slice(0, limit);
}

function discoveryPageState(value) {
  const source = nestedData(value);
  return {
    cursor: first(value?.cursor, value?.nextCursor, value?.next_cursor, source?.cursor, source?.nextCursor, source?.next_cursor),
    hasMore: bool(first(value?.hasMore, value?.has_more, source?.hasMore, source?.has_more))
  };
}

function appendUnique(target, values, limit = MAX_BATCH_ACCOUNTS) {
  for (const value of values) {
    if (target.length >= limit) break;
    if (!target.includes(value)) target.push(value);
  }
  return target;
}

function normalizeCriteria(input) {
  const source = isRecord(input.criteria) ? input.criteria : input;
  const parsed = criteriaFromGoal(first(input.goal, input.query, input.requirements, input.userRequirements));
  const explicitLocations = list(first(source.locations, source.location, source.region, source.province, source.city));
  const explicitKeywords = list(first(source.keywords, source.keyword, source.topic, source.topics));
  const explicitExclusions = list(first(source.excludeKeywords, source.exclude_keywords, source.exclusions));
  return {
    minFollowers: number(first(source.minFollowers, source.min_followers, parsed.minFollowers)),
    maxFollowers: number(first(source.maxFollowers, source.max_followers, parsed.maxFollowers)),
    minFollowing: number(first(source.minFollowing, source.min_following)),
    minAwemeCount: number(first(source.minAwemeCount, source.min_aweme_count, parsed.minAwemeCount)),
    minLikes: number(first(source.minLikes, source.min_likes, parsed.minLikes)),
    minAverageDigg: number(first(source.minAverageDigg, source.min_average_digg)),
    requiredVerify: source.requiredVerify == null && source.required_verify == null ? (parsed.requiredVerify ?? null) : bool(first(source.requiredVerify, source.required_verify)),
    liveOnly: source.liveOnly == null && source.live_only == null ? (parsed.liveOnly ?? false) : bool(first(source.liveOnly, source.live_only)),
    locations: explicitLocations.length ? explicitLocations : parsed.locations || [],
    keywords: explicitKeywords.length ? explicitKeywords : [],
    excludeKeywords: explicitExclusions.length ? explicitExclusions : parsed.excludeKeywords || [],
    minScore: number(first(source.minScore, source.min_score)) || 0
  };
}

function profileSecUid(profile) {
  return text(first(profile?.sec_uid, profile?.secUid, profile?.sec_id, profile?.secId, profile?.uid));
}

function profileName(profile) {
  return text(first(profile?.nickname, profile?.nick_name, profile?.name, profile?.account_name, profile?.unique_id, profile?.uniqueId)) || "未命名账号";
}

function videoDescription(video) {
  return text(first(video?.desc, video?.description, video?.title, video?.text));
}

function accountTopicText(account) {
  const profile = account?.profile || {};
  const identity = account?.identity || {};
  return [
    first(profile.nickname, profile.nick_name, profile.name, identity.nickname, identity.name),
    first(profile.signature, profile.desc, profile.description, identity.signature, identity.desc, identity.description),
    ...(account?.videos || []).map(videoDescription)
  ].map((value) => text(value).toLowerCase()).filter(Boolean).join(" ");
}

function topicSignalMatches(searchText, signal) {
  if (signal === "ai") return /(?:^|[^a-z0-9])ai(?:$|[^a-z0-9])|aigc|人工智能|大模型/i.test(searchText);
  return searchText.includes(signal.toLowerCase());
}

function topicAssessment(account, signals) {
  if (!signals.length) return { matched: true, missingSignals: [] };
  if (signals.includes("ai") && signals.includes("科普")) {
    const profile = account?.profile || {};
    const identity = account?.identity || {};
    const descriptor = [
      first(profile.signature, profile.desc, profile.description),
      first(identity.signature, identity.desc, identity.description)
    ].map((value) => text(value).toLowerCase()).filter(Boolean).join(" ");
    const educationalPattern = /科普|教程|干货|知识|指南|教学|学习|实操|技巧|解读|拆解|步骤|怎么|如何|教你/;
    const profileQualified = topicSignalMatches(descriptor, "ai") && educationalPattern.test(descriptor);
    const qualifiedVideos = (account?.videos || []).filter((video) => {
      const description = videoDescription(video).toLowerCase();
      return topicSignalMatches(description, "ai") && educationalPattern.test(description);
    });
    return profileQualified || qualifiedVideos.length >= 2
      ? { matched: true, missingSignals: [] }
      : { matched: false, missingSignals: ["持续的 AI 科普内容"] };
  }
  const searchText = accountTopicText(account);
  const missingSignals = signals.filter((signal) => !topicSignalMatches(searchText, signal));
  return { matched: missingSignals.length === 0, missingSignals };
}

function trendKeys(value) {
  return [value?.uid, value?.secId, value?.sec_id, value?.secUid, value?.sec_uid, value?.name, value?.nickname]
    .map((item) => text(item))
    .filter(Boolean);
}

function formatInteger(value) {
  const parsed = number(value);
  return parsed == null ? "未知" : Math.round(parsed).toLocaleString("zh-CN");
}

function metric(profile, ...keys) {
  return number(first(...keys.map((key) => profile?.[key])));
}

function liveState(live) {
  return bool(first(live?.is_live, live?.isLive, live?.live, live?.status === "live", live?.status === "直播中"));
}

function scoreCandidate({ profile, videos, live, criteria, goal }) {
  const profileText = JSON.stringify(profile || {}).toLowerCase();
  const contentText = videos.map(videoDescription).join(" ").toLowerCase();
  const searchText = `${profileText} ${contentText}`;
  const reasons = [];
  const evidence = [];
  const profileIdentity = profileName(profile || {});
  const profileHasReadableFacts = Boolean(profileIdentity && profileIdentity !== "未命名账号")
    || metric(profile, "follower_count", "followers", "followerCount") != null
    || metric(profile, "aweme_count", "awemeCount", "video_count", "videoCount") != null
    || metric(profile, "total_favorited", "likes", "like_count", "likeCount") != null;
  const firstReadableVideo = videos.find((video) => videoDescription(video) || text(first(video?.aweme_id, video?.awemeId, video?.video_id, video?.videoId)));
  // A verified profile or retrieved work is primary-source evidence even when the
  // requester did not provide an additional filtering condition.
  if (profileHasReadableFacts) {
    evidence.push({ type: "profile", field: "account", value: profileIdentity || "已核验账号主页" });
  }
  if (firstReadableVideo) {
    evidence.push({
      type: "content",
      value: videoDescription(firstReadableVideo) || text(first(firstReadableVideo.aweme_id, firstReadableVideo.awemeId, firstReadableVideo.video_id, firstReadableVideo.videoId))
    });
  }
  if (live && first(live?.is_live, live?.isLive, live?.status) != null) {
    evidence.push({ type: "live", value: liveState(live) ? "当前直播状态已核验" : "当前未直播状态已核验" });
  }
  let score = 45;
  let hardFail = false;
  const followers = metric(profile, "follower_count", "followers", "followerCount");
  const awemeCount = metric(profile, "aweme_count", "awemeCount", "video_count", "videoCount");
  const likes = metric(profile, "total_favorited", "likes", "like_count", "likeCount");
  const averageDigg = videos.length
    ? videos.map((video) => metric(video, "digg_count", "diggCount", "likes", "like_count")).filter((value) => value != null).reduce((sum, value) => sum + value, 0) / Math.max(1, videos.length)
    : null;
  if (criteria.minFollowers != null) {
    if ((followers || 0) >= criteria.minFollowers) { score += 15; reasons.push("粉丝数达到门槛"); }
    else hardFail = true;
  }
  if (criteria.maxFollowers != null) {
    if ((followers || 0) <= criteria.maxFollowers) { score += 5; reasons.push("粉丝数未超过上限"); }
    else hardFail = true;
  }
  if (criteria.minAwemeCount != null) {
    if ((awemeCount || 0) >= criteria.minAwemeCount) { score += 8; reasons.push("作品数量达到门槛"); }
    else hardFail = true;
  }
  if (criteria.minLikes != null && (likes || 0) >= criteria.minLikes) { score += 8; reasons.push("累计获赞达到门槛"); }
  if (criteria.minAverageDigg != null) {
    if ((averageDigg || 0) >= criteria.minAverageDigg) { score += 10; reasons.push("近期作品平均点赞达到门槛"); }
    else hardFail = true;
  }
  if (criteria.requiredVerify != null) {
    const verified = bool(first(profile?.custom_verify, profile?.customVerify, profile?.enterprise_verify, profile?.verify, profile?.verified));
    if (verified === criteria.requiredVerify) { score += 8; reasons.push(criteria.requiredVerify ? "已通过认证" : "符合未认证条件"); }
    else hardFail = true;
  }
  if (criteria.liveOnly) {
    if (liveState(live)) { score += 14; reasons.push("当前处于直播状态"); }
    else hardFail = true;
  } else if (liveState(live)) {
    score += 5;
    reasons.push("当前处于直播状态");
  }
  if (criteria.locations.length) {
    const hit = criteria.locations.find((location) => profileText.includes(location.toLowerCase()));
    if (hit) { score += 10; reasons.push(`主页信息命中地域：${hit}`); evidence.push({ type: "profile", field: "location", value: hit }); }
    else hardFail = true;
  }
  if (criteria.keywords.length) {
    const hits = criteria.keywords.filter((keyword) => searchText.includes(keyword.toLowerCase()));
    score += Math.min(15, hits.length * 5);
    if (hits.length) { reasons.push(`主页或近期作品命中：${hits.join("、")}`); evidence.push({ type: "content", keywords: hits }); }
    else reasons.push("未在已读取主页和近期作品中发现关键词");
  }
  if (criteria.excludeKeywords.length) {
    const hits = criteria.excludeKeywords.filter((keyword) => searchText.includes(keyword.toLowerCase()));
    if (hits.length) { hardFail = true; reasons.push(`命中排除词：${hits.join("、")}`); }
  }
  const bounded = Math.max(0, Math.min(100, Math.round(score)));
  return {
    score: bounded,
    tier: hardFail || bounded < Math.max(40, criteria.minScore) ? "不匹配" : bounded >= 75 ? "优先" : bounded >= 55 ? "可跟进" : "待核验",
    matched: !hardFail && bounded >= Math.max(40, criteria.minScore),
    reasons,
    evidence,
    metrics: { followers, awemeCount, likes, averageDigg }
  };
}

function hasMeaningfulEvidence(item) {
  if (text(item)) return true;
  if (!isRecord(item)) return false;
  if (text(item.reason) || text(item.rationale) || text(item.quote) || text(item.text) || text(item.description)) return true;
  if (item.value != null && String(item.value).trim()) return true;
  if (Array.isArray(item.keywords) && item.keywords.some((keyword) => text(keyword))) return true;
  if (Array.isArray(item.signals) && item.signals.some((signal) => text(signal))) return true;
  return false;
}

export function hasMatchEvidence(account = {}) {
  const reasons = Array.isArray(account.reasons) ? account.reasons : [];
  const evidence = Array.isArray(account.evidence) ? account.evidence : [];
  return reasons.some((reason) => text(reason)) || evidence.some(hasMeaningfulEvidence);
}

function videoPublicationTimestamps(account) {
  return (account.videos || []).map(video => {
    const value = first(video.create_time, video.createdAt, video.createTime, video.publish_time, video.publishTime, video.publishedAt);
    if (typeof value !== "number" && typeof value !== "string") return null;
    const numeric = number(value);
    const timestamp = numeric == null ? Date.parse(value) : numeric < 1e12 ? numeric * 1000 : numeric;
    return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null;
  }).filter(value => value != null);
}

function recentPublishingCount(timestamps, nowMs) {
  if (!Number.isFinite(nowMs)) return null;
  const observed = timestamps.filter(timestamp => timestamp <= nowMs);
  if (!observed.length) return null;
  const since = nowMs - 30 * 24 * 60 * 60 * 1000;
  return observed.filter(timestamp => timestamp >= since).length;
}

function companionRankingValues(accounts, ranking, nowMs) {
  const values = new Map();
  if (!["active", "recent"].includes(ranking)) return values;
  const groups = new Map();
  for (const account of accounts) {
    const key = `${Boolean(account.matched)}:${account.score}`;
    if (!groups.has(key)) groups.set(key, []);
    const timestamps = videoPublicationTimestamps(account);
    // Activity is the observed recent publishing count, never audience size.
    const value = ranking === "active" ? recentPublishingCount(timestamps, nowMs)
      : timestamps.length ? Math.max(...timestamps) : null;
    groups.get(key).push([account, value]);
  }
  for (const group of groups.values()) {
    // Partial comparisons can be non-transitive. Preserve the whole tie group's
    // existing order when any member lacks a comparable public value.
    if (group.every(([, value]) => Number.isFinite(value) && value >= 0)) {
      for (const [account, value] of group) values.set(account, value);
    }
  }
  return values;
}

async function settleCall(fn, errors, label) {
  try { return await fn(); } catch (error) {
    errors.push({ capability: label, code: error?.code || "UPSTREAM_ERROR", message: error?.message || "能力调用失败" });
    return null;
  }
}

async function mapConcurrent(items, limit, mapper) {
  const source = Array.from(items || []);
  if (!source.length) return [];
  const output = new Array(source.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(source.length, Math.max(1, limit)) }, async () => {
    while (cursor < source.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await mapper(source[index], index);
    }
  });
  await Promise.all(workers);
  return output;
}

function inputMode(input) {
  const mode = text(first(input.mode, input.analysisMode, input.analysis_mode)).toLowerCase();
  return ["full", "profile", "content", "live", "industry"].includes(mode) ? mode : "full";
}

export function createDouyinFinderService({
  client = createDouyinAgentDataClient(),
  discoveryService = null,
  accountResolver = null,
  eventSink = null,
  now = () => Date.now(),
  discoveryRetryAttempts = DEFAULT_DISCOVERY_RETRY_ATTEMPTS,
  discoveryRetryDelayMs = DEFAULT_DISCOVERY_RETRY_DELAY_MS
} = {}) {
  if (!client || typeof client.resolve !== "function") throw new DouyinFinderError("A Douyin Agent Data client is required", { code: "DOUYIN_FINDER_CONFIG_INVALID", statusCode: 503 });
  const configured = client.configured !== false;
  const resolvedDiscoveryService = typeof discoveryService?.discover === "function"
    ? discoveryService
    : typeof accountResolver?.search === "function"
      ? { discover: (input) => accountResolver.search(input) }
      : null;
  const discoveryConfigured = typeof resolvedDiscoveryService?.discover === "function";

  async function run(rawInput = {}) {
    const input = isRecord(rawInput) ? rawInput : {};
    const context = {
      taskId: text(first(input.taskId, input.task_id)) || `finder-${randomUUID()}`,
      taskRunId: text(first(input.taskRunId, input.task_run_id, input.runId, input.run_id)) || `run-${randomUUID()}`,
      conversationId: text(first(input.conversationId, input.conversation_id)) || null,
      agentId: text(first(input.agentId, input.agent_id)) || DEFAULT_AGENT_ID
    };
    const goal = text(first(input.goal, input.query, input.requirements, input.userRequirements));
    const topicSignals = topicSignalsFromGoal(goal);
    const growthIntent = growthIntentFromGoal(goal);
    const mode = inputMode(input);
    const criteria = normalizeCriteria(input);
    const requestedGoalLimit = requestedResultLimitFromGoal(goal);
    const requestedInputLimit = number(first(input.resultLimit, input.outputLimit, input.desiredCount));
    const requestedLimit = requestedGoalLimit || requestedInputLimit || DEFAULT_RESULT_LIMIT;
    const requestedCeiling = Math.max(requestedLimit, requestedInputLimit || 0);
    assertBoundedFinderRequest({ goal, requestedLimit: requestedCeiling });
    const resultLimit = Math.min(MAX_TASK_RESULT_TARGET, Math.max(1, requestedLimit));
    const defaultCandidateLimit = resultLimit > MAX_BATCH_ACCOUNTS ? resultLimit : MAX_BATCH_ACCOUNTS;
    const maxCandidates = Math.min(
      MAX_TASK_RESULT_TARGET,
      Math.max(resultLimit, number(first(input.maxCandidates, input.maxCandidateCount)) || defaultCandidateLimit)
    );
    const discoveryPageLimit = Math.min(
      20,
      Math.max(1, number(input.accountLimit) || (resultLimit > MAX_BATCH_ACCOUNTS ? 20 : DEFAULT_DISCOVERY_LIMIT))
    );
    const seedReferences = extractReferences(input);
    const accountContext = normalizeAccountContext(input);
    const requiresBusinessAccount = publicFinderNeedsBusinessAccount({
      purposeIds: input.choices?.finderPublicPurpose?.selected,
      query: first(input.publicFinderQuery, input.query),
      goal
    });
    const businessAccountError = validatePublicFinderBusinessAccount({
      required: requiresBusinessAccount,
      businessAccountUrl: accountContext.businessAccountUrl
    });
    if (businessAccountError) {
      throw new DouyinFinderError(businessAccountError, {
        code: accountContext.businessAccountUrl ? "DOUYIN_FINDER_BUSINESS_ACCOUNT_INVALID" : "DOUYIN_FINDER_BUSINESS_ACCOUNT_REQUIRED",
        statusCode: 400,
        details: { required: true }
      });
    }
    let references = [...seedReferences];
    let discoveredReferences = [];
    let rawDiscoveredReferences = [];
    let searchPages = 0;
    let discoveryStopReason = "not_started";
    const videoInputs = extractVideoInputs(input);
    const errors = [];
    const capabilitiesUsed = [];
    let discoveryResult = null;
    const progressSink = typeof input.onProgress === "function" ? input.onProgress : null;
    const emit = (event) => {
      try { eventSink?.(event); } catch { /* event sinks are observational */ }
      try { progressSink?.(event); } catch { /* progress reporting must not stop execution */ }
    };
    emit({ type: "finder.started", stage: "starting", counts: { input: seedReferences.length, discovered: 0, screened: seedReferences.length, resolved: 0, enriched: 0 }, ...context, mode, referenceCount: references.length, goal });

    if (!references.length && mode !== "industry" && !discoveryConfigured) {
      throw new DouyinFinderError("当前 Agent Data API 未提供自然语言账号搜索接口。请添加至少一个抖音主页、分享文本或 sec_uid 后执行账号验证。", {
        code: "DOUYIN_FINDER_DISCOVERY_NOT_CONFIGURED",
        statusCode: 503,
        details: {
          source: "douyin-agent-data",
          supported: ["account.resolve", "account.profile", "account.videos-latest", "account.videos", "video.detail", "live.room", "industry.list", "industry.hotwords"],
          missing: "account.search"
        }
      });
    }

    const industry = text(first(input.industry, input.industryName, input.industry_name));
    let industryContext = null;
    if (industry || mode === "industry" || input.includeIndustryContext === true) {
      const industries = await settleCall(() => client.industryList(), errors, "industry.list");
      capabilitiesUsed.push("industry.list");
      let hotwords = null;
      if (industry) {
        hotwords = await settleCall(() => client.hotwords(industry, {
          category: text(input.category) || undefined,
          window: text(input.window) || undefined,
          limit: number(input.hotwordLimit) || undefined
        }), errors, "industry.hotwords");
        capabilitiesUsed.push("industry.hotwords");
      }
      industryContext = { industry: industry || null, industries, hotwords };
    }

    if (mode !== "industry" && discoveryConfigured && goal) {
      let searchCursor = number(first(input.searchCursor, input.candidateCursor)) || 0;
      let lastPage = null;
      const seenCursors = new Set();
      for (let page = 0; page < MAX_DISCOVERY_PAGES; page += 1) {
        const cursorKey = String(searchCursor);
        if (seenCursors.has(cursorKey)) {
          discoveryStopReason = "cursor_repeated";
          break;
        }
        seenCursors.add(cursorKey);
        try {
          const attempts = Math.min(3, Math.max(1, number(discoveryRetryAttempts) || DEFAULT_DISCOVERY_RETRY_ATTEMPTS));
          for (let attempt = 1; attempt <= attempts; attempt += 1) {
            try {
              lastPage = await resolvedDiscoveryService.discover({
                ...input,
                ...context,
                goal,
                query: goal,
                cursor: searchCursor,
                optionalSeeds: seedReferences,
                accountContext,
                referenceAccounts: accountContext.referenceAccountUrls,
                limit: discoveryPageLimit
              });
              searchPages += 1;
              break;
            } catch (error) {
              if (attempt >= attempts || !retryableDiscoveryError(error)) throw error;
              emit({
                type: "finder.progress",
                stage: "search_retrying",
                message: "搜索服务短暂波动，正在重试本页候选",
                counts: {
                  input: seedReferences.length,
                  discovered: rawDiscoveredReferences.length,
                  screened: discoveredReferences.length,
                  resolved: 0,
                  enriched: 0,
                  qualified: 0,
                  delivered: 0,
                  failed: 0,
                  searchPages
                },
                ...context
              });
              await wait(Math.max(0, number(discoveryRetryDelayMs) ?? DEFAULT_DISCOVERY_RETRY_DELAY_MS) * attempt);
            }
          }
        } catch (error) {
          if (!seedReferences.length && !rawDiscoveredReferences.length) {
            throw new DouyinFinderError("抖音账号搜索接口调用失败，本次任务未生成候选结果。", {
              code: "DOUYIN_FINDER_DISCOVERY_FAILED",
              statusCode: 502,
              details: { upstreamCode: error?.code || null, upstreamMessage: error?.message || "account search failed" }
            });
          }
          errors.push({ capability: "candidate.search", code: error?.code || "ACCOUNT_SEARCH_FAILED", message: error?.message || "账号搜索失败，已继续核验已有候选" });
          discoveryStopReason = "search_failed_after_partial_results";
          break;
        }

        appendUnique(rawDiscoveredReferences, extractDiscoveryReferences(lastPage, { limit: maxCandidates }), maxCandidates);
        appendUnique(discoveredReferences, extractDiscoveryReferences(lastPage, {
          topicSignals,
          limit: maxCandidates
        }), maxCandidates);
        const pageState = discoveryPageState(lastPage);
        emit({
          type: "finder.progress",
          stage: "searching",
          message: `正在搜索第 ${searchPages} 页候选账号`,
          counts: {
            input: seedReferences.length,
            discovered: rawDiscoveredReferences.length,
            screened: discoveredReferences.length,
            resolved: 0,
            enriched: 0,
            searchPages
          },
          ...context
        });

        if (rawDiscoveredReferences.length >= maxCandidates) {
          discoveryStopReason = "candidate_limit_reached";
          break;
        }
        const requiresDeepTopicScreening = topicSignals.includes("ai") && topicSignals.includes("科普");
        if (!growthIntent && !requiresDeepTopicScreening && discoveredReferences.length >= resultLimit) {
          discoveryStopReason = "result_target_reached";
          break;
        }
        if (!pageState.hasMore) {
          discoveryStopReason = "search_exhausted";
          break;
        }
        const nextCursor = number(pageState.cursor);
        if (nextCursor == null || nextCursor === searchCursor) {
          discoveryStopReason = "cursor_unavailable";
          break;
        }
        searchCursor = nextCursor;
        if (page === MAX_DISCOVERY_PAGES - 1) discoveryStopReason = "page_limit_reached";
      }

      references = [...new Set([...seedReferences, ...discoveredReferences])].slice(0, maxCandidates);
      discoveryResult = {
        source: text(lastPage?.source) || "resolver",
        query: goal,
        searchPages,
        rawCandidateCount: rawDiscoveredReferences.length,
        screenedCandidateCount: discoveredReferences.length,
        stopReason: discoveryStopReason
      };
      capabilitiesUsed.push("candidate.search");
      emit({
        type: "finder.candidates.discovered",
        ...context,
        discoveredCount: rawDiscoveredReferences.length,
        screenedCount: discoveredReferences.length,
        referenceCount: seedReferences.length,
        searchPages,
        stopReason: discoveryStopReason
      });
    }

    if (!references.length && mode !== "industry") {
      emit({ type: "finder.completed", ...context, matchedCount: 0, accountCount: 0, errorCount: 0 });
      return {
        source: "douyin-agent-data",
        status: "NO_CANDIDATES",
        ...context,
        started: true,
        stage: "discovery",
        goal,
        mode,
        criteria,
        industryContext,
        accountContext,
        capabilitiesUsed: [...new Set(capabilitiesUsed)],
        missing: [],
        retrievalPlan: {
          query: goal,
          optionalSeeds: extractReferences(input),
          accountContext,
          next: "adjust_search_criteria"
        },
        message: "账号搜索接口已完成本轮检索，但没有发现符合条件的候选账号。可以调整目标或筛选条件后再次检索。",
        accounts: [],
        discovery: discoveryResult,
        errors,
        selection: {
          requested: resultLimit,
          maxCandidates,
          searchPages,
          stopReason: discoveryStopReason
        },
        counts: {
          input: seedReferences.length,
          discovered: rawDiscoveredReferences.length,
          screened: references.length,
          resolved: 0,
          qualified: 0,
          delivered: 0,
          matched: 0,
          excluded: rawDiscoveredReferences.length,
          searchPages,
          failed: 0
        },
        fetchedAt: new Date(now()).toISOString()
      };
    }

    emit({
      type: "finder.progress",
      stage: "resolving",
      message: `正在解析 ${references.length} 个候选账号身份`,
      counts: { input: seedReferences.length, discovered: rawDiscoveredReferences.length, screened: references.length, resolved: 0, enriched: 0, searchPages },
      ...context
    });
    const resolved = (await mapConcurrent(references, DEFAULT_VERIFICATION_CONCURRENCY, async (reference) => {
      const result = await settleCall(() => client.resolve(reference), errors, "account.resolve");
      capabilitiesUsed.push("account.resolve");
      const identity = nestedData(result);
      return identity ? { reference, identity } : null;
    })).filter(Boolean);
    emit({
      type: "finder.accounts.resolved",
      stage: "resolving",
      message: `已解析 ${resolved.length} 个账号，准备读取主页和近期作品`,
      counts: { input: seedReferences.length, discovered: rawDiscoveredReferences.length, screened: references.length, resolved: resolved.length, enriched: 0, searchPages },
      ...context,
      resolvedCount: resolved.length
    });
    let enrichedCount = 0;
    const accounts = await mapConcurrent(resolved, DEFAULT_VERIFICATION_CONCURRENCY, async ({ reference, identity }) => {
      const secUid = profileSecUid(identity);
      if (!secUid) {
        return { reference, identity, status: "UNRESOLVED", errors: [{ code: "SEC_UID_MISSING", message: "账号解析结果缺少 sec_uid" }] };
      }
      const profile = mode === "content" || mode === "live" ? null : await settleCall(() => client.profile(secUid, { fresh: input.fresh === true }), errors, "account.profile");
      if (mode !== "content" && mode !== "live") capabilitiesUsed.push("account.profile");
      const useVideoPagination = mode !== "profile" && mode !== "live" && typeof client.videos === "function"
        && (input.cursor != null || input.videoCursor != null || input.since != null || input.videoSince != null);
      const videosResult = mode === "profile" || mode === "live" ? null : useVideoPagination
        ? await settleCall(() => client.videos(secUid, {
          cursor: first(input.cursor, input.videoCursor, "0"),
          since: first(input.since, input.videoSince),
          count: Math.min(20, Math.max(1, number(input.videoCount) || 20)),
          fresh: input.fresh === true
        }), errors, "account.videos")
        : await settleCall(() => client.videosLatest(secUid, { count: Math.min(20, Math.max(1, number(input.videoCount) || 20)), fresh: input.fresh === true }), errors, "account.videos-latest");
      if (mode !== "profile" && mode !== "live") capabilitiesUsed.push(useVideoPagination ? "account.videos" : "account.videos-latest");
      const videos = arrayFrom(nestedData(videosResult));
      let live = null;
      if (bool(first(input.checkLive, input.includeLive, input.liveOnly)) || criteria.liveOnly || mode === "live") {
        live = await settleCall(() => client.liveRoom({ secUid, fresh: input.fresh === true }), errors, "live.room");
        capabilitiesUsed.push("live.room");
      }
      const requestedDetails = videoInputs.length ? videoInputs : (number(input.detailLimit) > 0 ? videos.slice(0, Math.min(MAX_VIDEO_DETAILS, number(input.detailLimit))).map((video) => text(first(video.aweme_id, video.awemeId, video.video_id, video.videoId, video.url))).filter(Boolean) : []);
      const videoDetails = [];
      for (const videoInput of requestedDetails) {
        const detail = await settleCall(() => /^https?:\/\//i.test(videoInput) ? client.videoDetail({ url: videoInput, fresh: input.fresh === true }) : client.videoDetail({ awemeId: videoInput, fresh: input.fresh === true }), errors, "video.detail");
        capabilitiesUsed.push("video.detail");
        if (detail) videoDetails.push(detail);
      }
      const ranking = scoreCandidate({ profile: profile || identity, videos, live, criteria, goal });
      const account = {
        reference,
        identity,
        sec_uid: secUid,
        profile,
        videos,
        videoDetails,
        live,
        ...ranking,
        criteriaMatched: ranking.matched,
        status: profile || videos.length || live ? "ENRICHED" : "PARTIAL"
      };
      enrichedCount += 1;
      emit({
        type: "finder.progress",
        stage: "enriching",
        message: `正在核验主页和近期作品（${enrichedCount}/${resolved.length}）`,
        counts: { input: seedReferences.length, discovered: rawDiscoveredReferences.length, screened: references.length, resolved: resolved.length, enriched: enrichedCount, searchPages },
        ...context
      });
      return account;
    });

    for (const account of accounts) {
      const topic = topicAssessment(account, topicSignals);
      account.topicMatched = topic.matched;
      if (!topic.matched) {
        account.matched = false;
        account.tier = "不匹配";
        account.reasons.unshift(`主题证据不足：${topic.missingSignals.join("、")}`);
      } else if (topicSignals.length) {
        account.reasons.push(`主题证据命中：${topicSignals.join("、")}`);
        account.evidence.push({ type: "topic", signals: [...topicSignals] });
      }
    }

    if (growthIntent) {
      emit({
        type: "finder.progress",
        stage: "ranking",
        message: `正在比较 ${accounts.length} 个账号近 ${growthIntent.windowDays} 天的粉丝增长`,
        counts: { input: seedReferences.length, discovered: rawDiscoveredReferences.length, screened: references.length, resolved: resolved.length, enriched: accounts.length, searchPages },
        ...context
      });
      capabilitiesUsed.push("follower.growth");
      const trendResult = typeof accountResolver?.compareTrends === "function"
        ? await settleCall(() => accountResolver.compareTrends({
          accounts: accounts.map((account) => ({
            uid: first(account.profile?.uid, account.identity?.uid),
            secId: account.sec_uid,
            name: profileName(account.profile || account.identity)
          })),
          days: growthIntent.windowDays
        }), errors, "follower.growth")
        : null;
      if (typeof accountResolver?.compareTrends !== "function") {
        errors.push({ capability: "follower.growth", code: "FOLLOWER_GROWTH_NOT_CONFIGURED", message: "粉丝增长趋势接口未配置" });
      }
      const trends = arrayFrom(nestedData(trendResult), ["trends", "items", "list", "data"]);
      const trendByKey = new Map();
      for (const trend of trends) for (const key of trendKeys(trend)) trendByKey.set(key, trend);
      for (const account of accounts) {
        const trend = trendKeys({
          uid: first(account.profile?.uid, account.identity?.uid),
          secId: account.sec_uid,
          name: profileName(account.profile || account.identity)
        }).map((key) => trendByKey.get(key)).find(Boolean) || null;
        account.growth = trend ? {
          source: text(trend.source) || text(trendResult?.source) || "tikhub-daren-compare",
          windowDays: number(first(trend.windowDays, trendResult?.windowDays)) || growthIntent.windowDays,
          newFollowers: number(trend.newFollowers),
          currentFollowers: number(trend.currentFollowers),
          newLikes: number(trend.newLikes),
          newItems: number(trend.newItems)
        } : null;
        if (!account.topicMatched) {
          continue;
        } else if (!account.growth || account.growth.newFollowers == null) {
          account.matched = false;
          account.tier = "待补数据";
          account.status = "PARTIAL";
          account.reasons.unshift(`缺少近${growthIntent.windowDays}天粉丝增长数据`);
        } else {
          const growthReason = `近${growthIntent.windowDays}天新增粉丝 ${formatInteger(account.growth.newFollowers)}`;
          account.reasons.unshift(growthReason);
          account.evidence.unshift({
            type: "growth",
            metric: "followers",
            windowDays: growthIntent.windowDays,
            value: account.growth.newFollowers,
            source: account.growth.source
          });
        }
      }
    }

    const preferenceValues = companionRankingValues(accounts, growthIntent ? null : input.companionPreferences?.settings?.ranking, now());
    accounts.sort((left, right) => {
      const matchedOrder = Number(right.matched) - Number(left.matched);
      if (matchedOrder) return matchedOrder;
      if (growthIntent) {
        const leftGrowth = left.growth?.newFollowers;
        const rightGrowth = right.growth?.newFollowers;
        if (leftGrowth != null || rightGrowth != null) return (rightGrowth ?? Number.NEGATIVE_INFINITY) - (leftGrowth ?? Number.NEGATIVE_INFINITY);
      }
      const scoreOrder = right.score - left.score;
      if (scoreOrder || growthIntent) return scoreOrder;
      return (preferenceValues.get(right) ?? 0) - (preferenceValues.get(left) ?? 0);
    });
    const qualifiedAccounts = accounts.filter((account) => account.criteriaMatched !== false && account.topicMatched !== false);
    const evidenceBackedAccounts = qualifiedAccounts.filter(hasMatchEvidence);
    const resultAccounts = evidenceBackedAccounts.slice(0, resultLimit);
    const matched = resultAccounts.filter((account) => account.matched);
    const candidatePoolSize = new Set([...seedReferences, ...rawDiscoveredReferences]).size;
    const evidenceRejected = qualifiedAccounts.length - evidenceBackedAccounts.length;
    const excluded = Math.max(0, candidatePoolSize - evidenceBackedAccounts.length);
    const overflow = Math.max(0, evidenceBackedAccounts.length - resultAccounts.length);
    const failed = accounts.filter((account) => account.status === "UNRESOLVED").length;
    const hasPartialAccounts = resultAccounts.some((account) => account.status === "PARTIAL" || account.status === "UNRESOLVED");
    const status = mode === "industry"
      ? errors.length ? "PARTIAL" : "SUCCEEDED"
      : resultAccounts.length === 0
      ? errors.length ? "PARTIAL" : "NO_CANDIDATES"
      : errors.length || hasPartialAccounts ? "PARTIAL" : "SUCCEEDED";
    const message = growthIntent
      ? resultAccounts.length >= resultLimit
        ? `已检索 ${rawDiscoveredReferences.length} 个候选，完成 ${resolved.length} 个账号核验，并交付增长排序后的 ${resultAccounts.length} 个结果。`
        : `已检索 ${rawDiscoveredReferences.length} 个候选并完成 ${resolved.length} 个账号核验，当前仅有 ${resultAccounts.length} 个账号形成可解释的匹配依据。`
      : resultAccounts.length
        ? `已检索 ${rawDiscoveredReferences.length} 个候选，完成 ${resolved.length} 个账号核验，并交付 ${resultAccounts.length} 个结果。`
        : `已检索 ${rawDiscoveredReferences.length} 个候选并完成 ${resolved.length} 个账号核验，但没有账号形成可解释的匹配依据。`;
    emit({ type: "finder.completed", ...context, matchedCount: matched.length, accountCount: resultAccounts.length, excludedCount: excluded, errorCount: errors.length });
    return {
      source: "douyin-agent-data",
      status,
      ...context,
      goal,
      mode,
      criteria,
      growthIntent,
      industryContext,
      started: true,
      stage: "completed",
      accountContext,
      retrievalPlan: { query: goal, optionalSeeds: extractReferences(input), accountContext },
      discovery: discoveryResult,
      capabilitiesUsed: [...new Set(capabilitiesUsed)],
      accounts: resultAccounts,
      message,
      errors,
      selection: {
        requested: resultLimit,
        maxCandidates,
        searchPages,
        stopReason: discoveryStopReason
      },
      counts: {
        input: seedReferences.length,
        discovered: rawDiscoveredReferences.length,
        screened: references.length,
        resolved: resolved.length,
        enriched: accounts.length,
        qualified: qualifiedAccounts.length,
        evidenceBacked: evidenceBackedAccounts.length,
        evidenceRejected,
        delivered: resultAccounts.length,
        matched: matched.length,
        excluded,
        overflow,
        searchPages,
        failed
      },
      fetchedAt: new Date(now()).toISOString()
    };
  }

  return Object.freeze({ kind: "douyin-finder", configured, discoveryConfigured, client, run });
}
