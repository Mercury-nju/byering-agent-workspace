import { normalizeDouyinWorkUrl } from "../bridge/douyin-work-url.js";

const MAX_RECENT_WORKS = 300;
const DEFAULT_RECENT_WORKS = 30;
const MAX_SELECTED_WORKS = 20;

export const COMMENT_SOURCE_OWNERS = Object.freeze({
  OWN: "own",
  OTHER: "other"
});

export const COMMENT_SOURCE_DIMENSIONS = Object.freeze({
  ACCOUNT: "account",
  WORKS: "works"
});

function text(value) {
  return String(value ?? "").trim();
}

export function normalizeCommentSourceOwner(value, fallback = COMMENT_SOURCE_OWNERS.OWN) {
  const normalized = text(value).toLowerCase();
  if (["other", "others", "public", "他人", "其他"].includes(normalized)) return COMMENT_SOURCE_OWNERS.OTHER;
  if (["own", "self", "mine", "自己", "我的"].includes(normalized)) return COMMENT_SOURCE_OWNERS.OWN;
  return fallback;
}

export function normalizeCommentSourceDimension(value, fallback = COMMENT_SOURCE_DIMENSIONS.ACCOUNT) {
  const normalized = text(value).toLowerCase();
  if (["works", "work", "video", "videos", "作品"].includes(normalized)) return COMMENT_SOURCE_DIMENSIONS.WORKS;
  if (["account", "profile", "账号", "主页"].includes(normalized)) return COMMENT_SOURCE_DIMENSIONS.ACCOUNT;
  return fallback;
}

export function parseCommentSource(value = "") {
  const links = String(value).match(/https?:\/\/[^\s，。；<>]+/gi) || [];
  if (links.length !== 1) return { kind: "invalid", message: "请粘贴一个抖音作品或主页链接" };
  try {
    const url = new URL(links[0].replace(/[)）\]】,;!?]+$/, ""));
    if (!/(^|\.)douyin\.com$/i.test(url.hostname)) throw new Error("Invalid host");
    const normalizedWorkUrl = normalizeDouyinWorkUrl(url.href);
    const videoId = normalizedWorkUrl?.match(/\/(?:video|note)\/(\d+)$/u)?.[1];
    if (videoId) return { kind: "video", url: normalizedWorkUrl, videoId };
    if (url.hostname === "v.douyin.com") return { kind: "invalid", message: "这是分享短链接，请打开作品后复制浏览器里的完整作品链接" };
    if (/^\/user\/[^/]+\/?$/.test(url.pathname)) return { kind: "profile", url: url.href };
  } catch { /* Return the same actionable validation for malformed links. */ }
  return { kind: "invalid", message: "请粘贴抖音作品链接或账号主页链接" };
}

export function parseCommentSources(value = "") {
  const links = String(value).match(/https?:\/\/[^\s，。；<>]+/gi) || [];
  if (!links.length) return { kind: "invalid", message: "请至少添加一条抖音作品链接" };
  if (links.length > MAX_SELECTED_WORKS) {
    return { kind: "invalid", message: `最多同时分析 ${MAX_SELECTED_WORKS} 条作品，请分批执行` };
  }
  const sources = links.map((link) => parseCommentSource(link));
  const invalid = sources.find((source) => source.kind !== "video");
  if (invalid) return { kind: "invalid", message: "作品维度只支持抖音作品链接，请删除主页或无效链接" };
  return {
    kind: "videos",
    urls: sources.map((source) => source.url),
    videoIds: sources.map((source) => source.videoId)
  };
}

export function commentSourceScope(flow = {}) {
  return normalizeCommentSourceOwner(flow.commentSourceOwner || flow.sourceOwner) === COMMENT_SOURCE_OWNERS.OWN
    ? "own_account_comments"
    : "public_content";
}

function identityField(identity, ...keys) {
  for (const key of keys) {
    const value = text(identity?.[key]);
    if (value) return value;
  }
  return "";
}

export function commentSourcePayload(flow, { requireOwnAccount = false } = {}) {
  const requestedOwner = normalizeCommentSourceOwner(flow.commentSourceOwner || flow.sourceOwner,
    flow.accountId || flow.accountIdentity ? COMMENT_SOURCE_OWNERS.OWN : COMMENT_SOURCE_OWNERS.OTHER);
  if (requireOwnAccount && requestedOwner !== COMMENT_SOURCE_OWNERS.OWN) {
    throw new Error("评论区找客户只能读取已授权账号的作品评论");
  }
  if (requireOwnAccount && !flow.accountId && !flow.accountIdentity) {
    throw new Error("请先连接并选择一个自己的抖音账号");
  }
  const owner = requireOwnAccount ? COMMENT_SOURCE_OWNERS.OWN : requestedOwner;
  const dimension = normalizeCommentSourceDimension(flow.commentSourceDimension || flow.sourceDimension,
    parseCommentSource(flow.accountRef).kind === "video" ? COMMENT_SOURCE_DIMENSIONS.WORKS : COMMENT_SOURCE_DIMENSIONS.ACCOUNT);
  const sourceScope = owner === COMMENT_SOURCE_OWNERS.OWN ? "own_account_comments" : "public_content";
  const base = {
    sourceScope,
    sourceOwner: owner,
    sourceDimension: dimension,
    analysisOnly: owner === COMMENT_SOURCE_OWNERS.OTHER
  };
  const identity = flow.accountIdentity || {};
  const identityReference = {
    ...(identityField(identity, "profileUrl", "profile_url", "homepageUrl", "homepage_url") ? { profileUrl: identityField(identity, "profileUrl", "profile_url", "homepageUrl", "homepage_url") } : {}),
    ...(identityField(identity, "uid", "userId", "user_id") ? { uid: identityField(identity, "uid", "userId", "user_id") } : {}),
    ...(identityField(identity, "secId", "sec_id", "secUid", "sec_uid") ? { secId: identityField(identity, "secId", "sec_id", "secUid", "sec_uid") } : {}),
    ...(identityField(identity, "uniqueId", "unique_id", "douyinId", "douyin_id", "handle") ? { uniqueId: identityField(identity, "uniqueId", "unique_id", "douyinId", "douyin_id", "handle") } : {})
  };

  if (dimension === COMMENT_SOURCE_DIMENSIONS.WORKS) {
    const source = parseCommentSources(flow.commentWorkInput || flow.accountRef);
    if (source.kind === "invalid") throw new Error(source.message);
    return {
      ...base,
      ...(owner === COMMENT_SOURCE_OWNERS.OWN ? {
        ...identityReference,
        accountId: text(flow.accountId) || undefined,
        accountName: text(flow.account) || identityField(identity, "nickname", "nick_name", "accountName", "account_name") || undefined
      } : {}),
      videoIds: source.videoIds,
      videoUrls: source.urls,
      videoLimit: source.videoIds.length
    };
  }

  const profileUrl = text(flow.accountRef) || identityField(identity, "profileUrl", "profile_url", "homepageUrl", "homepage_url");
  if (owner === COMMENT_SOURCE_OWNERS.OWN) {
    const accountReference = {
      ...(profileUrl ? { profileUrl } : {}),
      ...(identityField(identity, "uid", "userId", "user_id") ? { uid: identityField(identity, "uid", "userId", "user_id") } : {}),
      ...(identityField(identity, "secId", "sec_id", "secUid", "sec_uid") ? { secId: identityField(identity, "secId", "sec_id", "secUid", "sec_uid") } : {}),
      ...(identityField(identity, "uniqueId", "unique_id", "douyinId", "douyin_id", "handle") ? { uniqueId: identityField(identity, "uniqueId", "unique_id", "douyinId", "douyin_id", "handle") } : {})
    };
    if (!Object.keys(accountReference).length) throw new Error("请先连接并选择一个自己的抖音账号");
    return {
      ...base,
      ...accountReference,
      accountId: text(flow.accountId) || undefined,
      accountName: text(flow.account) || identityField(identity, "nickname", "nick_name", "accountName", "account_name") || undefined,
      videoLimit: limitForScope(flow.workScope, flow.workCount)
    };
  }

  const source = parseCommentSource(profileUrl);
  if (source.kind !== "profile") throw new Error(source.message || "请粘贴一个抖音账号主页链接");
  return {
    ...base,
    profileUrl: source.url,
    accountName: text(flow.account) || undefined,
    videoLimit: limitForScope(flow.workScope, flow.workCount)
  };
}

export function normalizeRecentWorkCount(value, fallback = DEFAULT_RECENT_WORKS) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(MAX_RECENT_WORKS, Math.max(1, Math.round(parsed)));
}

export function limitForScope(scope, customCount = DEFAULT_RECENT_WORKS) {
  const preset = String(scope || "").match(/(?:最近|近)(\d+)条作品/);
  if (preset) return normalizeRecentWorkCount(preset[1]);
  if (scope === "自定义条数") return normalizeRecentWorkCount(customCount);
  return DEFAULT_RECENT_WORKS;
}

export function workScopeLabel(scope, customCount = DEFAULT_RECENT_WORKS) {
  return `最近${limitForScope(scope, customCount)}条作品`;
}

export function leadMinerRequestLimits(scope, customCount = DEFAULT_RECENT_WORKS) {
  return {
    videoLimit: limitForScope(scope, customCount),
    commentLimit: 50
  };
}

export function leadMinerResultState(snapshot = {}) {
  const counts = snapshot?.counts || {};
  const videos = Number(counts.videos || 0);
  const comments = Number(counts.comments || 0);
  const candidates = Number(counts.candidates || 0);
  if (videos === 0 && comments === 0) return "empty";
  if (videos > 0 && comments === 0) return "no_comments";
  if (candidates === 0) return "no_match";
  return "complete";
}

export function validateLeadMinerSetup(flow = {}, { requireOwnAccount = false } = {}) {
  const hasAudience = Array.isArray(flow.audienceTypes) && flow.audienceTypes.length > 0;
  const hasFreeformTarget = String(flow.product || "").trim().length > 0;
  if (!hasAudience && !hasFreeformTarget) {
    return { field: "audience", message: "先选一类想找的人或留言" };
  }
  const owner = normalizeCommentSourceOwner(flow.commentSourceOwner || flow.sourceOwner,
    flow.accountId || flow.accountIdentity ? COMMENT_SOURCE_OWNERS.OWN : COMMENT_SOURCE_OWNERS.OTHER);
  const dimension = normalizeCommentSourceDimension(flow.commentSourceDimension || flow.sourceDimension,
    parseCommentSource(flow.accountRef).kind === "video" ? COMMENT_SOURCE_DIMENSIONS.WORKS : COMMENT_SOURCE_DIMENSIONS.ACCOUNT);
  if (requireOwnAccount && owner !== COMMENT_SOURCE_OWNERS.OWN) {
    return { field: "account", message: "评论区找客户只能读取已授权账号的作品评论" };
  }
  if (requireOwnAccount && !flow.accountId && !flow.accountIdentity) {
    return { field: "account", message: "先连接并选择一个自己的抖音账号" };
  }
  if (dimension === COMMENT_SOURCE_DIMENSIONS.WORKS) {
    const sources = parseCommentSources(flow.commentWorkInput || flow.accountRef);
    if (sources.kind === "invalid") return { field: "works", message: sources.message };
  } else if (owner === COMMENT_SOURCE_OWNERS.OWN) {
    if (!flow.accountId && !flow.accountIdentity) return { field: "account", message: "先连接并选择一个自己的抖音账号" };
  } else {
    if (!String(flow.accountRef || "").trim()) return { field: "account", message: "还需要一个抖音账号主页链接" };
    const source = parseCommentSource(flow.accountRef);
    if (source.kind !== "profile") return { field: "account", message: "账号维度请粘贴抖音账号主页链接" };
    if (flow.accountResolveStatus !== "ready") {
      return {
        field: "account",
        message: flow.accountResolveStatus === "loading" || flow.accountResolveStatus === "waiting"
          ? "账号正在识别，请稍候"
          : "先确认这个主页能正常打开"
      };
    }
  }
  if (dimension === COMMENT_SOURCE_DIMENSIONS.ACCOUNT && flow.workScope === "自定义条数") {
    const count = Number(flow.workCount);
    if (!Number.isFinite(count) || count < 1) {
      return { field: "workCount", message: "请输入至少 1 条作品" };
    }
  }
  return null;
}
