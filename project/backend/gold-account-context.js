import { createHash } from "node:crypto";

export const GOLD_ACCOUNT_CONTEXT_SCHEMA_VERSION = 1;
export const GOLD_ACCOUNT_CONTEXT_VIDEO_LIMIT = 3;
const MAX_EVIDENCE = 80;
const MAX_COMMENTS = 60;
const SECRET_KEY = /(?:authorization|access[_-]?token|refresh[_-]?token|password|passwd|cookie|secret|csrf|jwt|api[-_]?key)/i;

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function text(value, max = 2000) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : "";
}

function clonePublicData(value, depth = 0) {
  if (depth > 4 || value == null) return value;
  if (typeof value === "string") return value.slice(0, 2000);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 80).map((item) => clonePublicData(item, depth + 1));
  if (!isRecord(value)) return null;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !SECRET_KEY.test(key))
    .slice(0, 80)
    .map(([key, child]) => [key, clonePublicData(child, depth + 1)]));
}

function unwrap(value) {
  let current = value;
  for (let depth = 0; depth < 5; depth += 1) {
    if (!isRecord(current)) return current;
    const next = current.data ?? current.result ?? current.profile ?? current.user ?? current.account;
    if (!next || next === current) return current;
    current = next;
  }
  return current;
}

function firstValue(value, keys) {
  if (!value || typeof value !== "object") return "";
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstValue(item, keys);
      if (found) return found;
    }
    return "";
  }
  for (const key of keys) {
    const found = text(value[key]);
    if (found) return found;
  }
  for (const key of ["data", "result", "user", "profile", "account", "author", "identity"]) {
    const found = firstValue(value[key], keys);
    if (found) return found;
  }
  return "";
}

function listFrom(value, keys) {
  const current = unwrap(value);
  if (Array.isArray(current)) return current;
  for (const key of keys) if (Array.isArray(current?.[key])) return current[key];
  return [];
}

function stableHash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function errorRecord(stage, caught) {
  return {
    stage,
    code: text(caught?.code, 120) || "GOLD_ACCOUNT_CONTEXT_UNAVAILABLE",
    message: text(caught?.message, 300) || "账号公开资料暂时无法读取"
  };
}

function normalizeProfile(value, fallback = {}) {
  const profile = clonePublicData(unwrap(value)) || {};
  const secUid = firstValue(profile, ["sec_uid", "secUid", "sec_id", "secId"])
    || text(fallback.secUid || fallback.sec_uid);
  const nickname = firstValue(profile, ["nickname", "name", "unique_id", "uniqueId"])
    || text(fallback.nickname || fallback.accountName || fallback.name);
  return {
    ...profile,
    sec_uid: secUid || undefined,
    nickname: nickname || undefined
  };
}

function normalizeVideo(value, index) {
  const raw = clonePublicData(value) || {};
  const id = firstValue(raw, ["aweme_id", "awemeId", "video_id", "videoId", "id"])
    || `video-${index + 1}`;
  const videoText = firstValue(raw, ["desc", "description", "title", "text", "content"]);
  return {
    ...raw,
    id,
    text: videoText,
    createdAt: raw.create_time || raw.createTime || raw.createdAt || null,
    sourceUrl: text(raw.url || raw.share_url || raw.shareUrl, 1000) || null
  };
}

function normalizeComment(value, index) {
  const raw = clonePublicData(value) || {};
  return {
    ...raw,
    id: firstValue(raw, ["comment_id", "commentId", "id"]) || `comment-${index + 1}`,
    videoId: firstValue(raw, ["aweme_id", "awemeId", "video_id", "videoId"]),
    text: firstValue(raw, ["text", "content", "comment", "desc"]),
    createdAt: raw.create_time || raw.createTime || raw.createdAt || null
  };
}

function normalizeAnalysis(value) {
  const analysis = isRecord(value) ? value : {};
  return {
    summary: text(analysis.summary, 2000),
    positioning: text(analysis.positioning, 1000),
    audienceSignals: Array.isArray(analysis.audienceSignals) ? analysis.audienceSignals.map((item) => text(item, 500)).filter(Boolean).slice(0, 12) : [],
    recurringQuestions: Array.isArray(analysis.recurringQuestions) ? analysis.recurringQuestions.map((item) => text(item, 500)).filter(Boolean).slice(0, 12) : [],
    objections: Array.isArray(analysis.objections) ? analysis.objections.map((item) => text(item, 500)).filter(Boolean).slice(0, 12) : [],
    languagePatterns: Array.isArray(analysis.languagePatterns) ? analysis.languagePatterns.map((item) => text(item, 500)).filter(Boolean).slice(0, 12) : [],
    conversionSignals: Array.isArray(analysis.conversionSignals) ? analysis.conversionSignals.map((item) => text(item, 500)).filter(Boolean).slice(0, 12) : [],
    facts: Array.isArray(analysis.facts) ? analysis.facts.slice(0, 12) : [],
    interpretations: Array.isArray(analysis.interpretations) ? analysis.interpretations.slice(0, 8) : [],
    unknowns: Array.isArray(analysis.unknowns) ? analysis.unknowns.map((item) => text(item, 500)).filter(Boolean).slice(0, 12) : [],
    suggestions: Array.isArray(analysis.suggestions) ? analysis.suggestions.map((item) => text(item, 500)).filter(Boolean).slice(0, 12) : []
  };
}

function publicContext(snapshot) {
  return {
    schemaVersion: snapshot.schemaVersion,
    status: snapshot.status,
    revision: snapshot.revision,
    account: snapshot.account,
    videos: snapshot.videos,
    analysis: snapshot.analysis,
    evidence: snapshot.evidence,
    errors: snapshot.errors,
    generatedAt: snapshot.generatedAt
  };
}

export function createGoldAccountContextService({
  profileDataClient = null,
  commentDataClient = null,
  analyzer = null,
  analysisService = null,
  now = () => Date.now()
} = {}) {
  async function run({ accountId = "", accountName = "", accountIdentity = null, objective = "", force = false } = {}) {
    const identity = isRecord(accountIdentity) ? accountIdentity : {};
    const secUid = firstValue(identity, ["secUid", "sec_uid", "secId", "sec_id", "uid", "userId"]) || text(accountId);
    const errors = [];
    let profile = {};
    let videos = [];
    let comments = [];

    if (!secUid) errors.push({ stage: "identity", code: "GOLD_ACCOUNT_CONTEXT_ACCOUNT_REQUIRED", message: "缺少可确认的抖音账号身份" });
    if (secUid && typeof profileDataClient?.profile === "function") {
      try {
        profile = normalizeProfile(await profileDataClient.profile(secUid, { fresh: force }), { secUid, accountName });
      } catch (error) {
        errors.push(errorRecord("profile", error));
      }
    } else if (secUid) {
      errors.push({ stage: "profile", code: "GOLD_ACCOUNT_CONTEXT_PROFILE_UNAVAILABLE", message: "账号资料读取服务未配置" });
    }

    if (secUid && typeof profileDataClient?.videosLatest === "function") {
      try {
        videos = listFrom(await profileDataClient.videosLatest(secUid, { count: GOLD_ACCOUNT_CONTEXT_VIDEO_LIMIT, fresh: force }), ["videos", "items", "aweme_list", "works", "list"])
          .slice(0, GOLD_ACCOUNT_CONTEXT_VIDEO_LIMIT)
          .map(normalizeVideo);
      } catch (error) {
        errors.push(errorRecord("videos", error));
      }
    } else if (secUid) {
      errors.push({ stage: "videos", code: "GOLD_ACCOUNT_CONTEXT_VIDEOS_UNAVAILABLE", message: "账号近期作品读取服务未配置" });
    }

    const videoIds = videos.map((video) => video.id).filter(Boolean);
    if (videoIds.length && typeof commentDataClient?.getComments === "function") {
      try {
        comments = listFrom(await commentDataClient.getComments({ videoIds, wait: true }), ["comments", "items", "list", "data"])
          .slice(0, MAX_COMMENTS)
          .map(normalizeComment)
          .filter((comment) => comment.text);
      } catch (error) {
        errors.push(errorRecord("comments", error));
      }
    } else if (videoIds.length) {
      errors.push({ stage: "comments", code: "GOLD_ACCOUNT_CONTEXT_COMMENTS_UNAVAILABLE", message: "作品评论读取服务未配置" });
    }

    const account = {
      id: text(accountId) || secUid,
      secUid,
      nickname: text(profile.nickname || accountName) || secUid,
      profile,
      identity: clonePublicData(identity)
    };
    const evidence = [
      ...Object.entries(profile)
        .filter(([, value]) => value != null && value !== "")
        .map(([key, value], index) => ({ id: `profile-${index + 1}`, type: "profile", quote: `${key}: ${String(value).slice(0, 1000)}`, text: `${key}: ${String(value).slice(0, 1000)}` })),
      ...videos.filter((video) => video.text).map((video) => ({ id: `video-${video.id}`, type: "video", videoId: video.id, quote: video.text, text: video.text, sourceUrl: video.sourceUrl })),
      ...comments.map((comment) => ({ id: `comment-${comment.id}`, type: "comment", commentId: comment.id, videoId: comment.videoId || null, quote: comment.text, text: comment.text }))
    ].slice(0, MAX_EVIDENCE);

    let analysis = {};
    const analyze = typeof analyzer === "function"
      ? analyzer
      : typeof analysisService?.run === "function"
        ? async ({ objective: goal, account: currentAccount, evidence: currentEvidence }) => {
          const result = await analysisService.run({
            goal,
            accounts: [{
              id: currentAccount.id,
              secUid: currentAccount.secUid,
              nickname: currentAccount.nickname,
              profile: currentAccount.profile,
              videos,
              evidence: currentEvidence
            }]
          });
          return result?.accounts?.[0]?.report || result;
        }
        : null;
    if (analyze) {
      try {
        analysis = normalizeAnalysis(await analyze({ objective: text(objective, 1000), account, videos, comments, evidence }));
      } catch (error) {
        errors.push(errorRecord("analysis", error));
      }
    }

    const generatedAt = new Date(now()).toISOString();
    const snapshot = {
      schemaVersion: GOLD_ACCOUNT_CONTEXT_SCHEMA_VERSION,
      status: errors.length ? "partial" : "ready",
      account,
      videos,
      comments,
      evidence,
      analysis,
      errors,
      generatedAt
    };
    snapshot.revision = stableHash({
      schemaVersion: snapshot.schemaVersion,
      account: snapshot.account,
      videos: snapshot.videos,
      comments: snapshot.comments,
      evidence: snapshot.evidence,
      analysis: snapshot.analysis,
      errors: snapshot.errors
    });
    return publicContext(snapshot);
  }

  return Object.freeze({ run });
}
