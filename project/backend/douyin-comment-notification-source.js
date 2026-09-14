import { createHash } from "node:crypto";

import { createLeadIntentAnalysisService } from "./lead-intent-analysis.js";

const DEFAULT_READY_ATTEMPTS = 24;
const DEFAULT_READY_POLL_MS = 5_000;
const RETRYABLE_PROVIDER_CODES = new Set([
  "WORKER_TIMEOUT",
  "DOUYIN_MCP_TIMEOUT",
  "NOTIFICATION_MODE_STARTING",
  "NOTIFICATION_MODE_NOT_READY",
  "STARTING",
  "QUEUED",
  "TIMEOUT"
]);

/**
 * Reads the logged-in account's RPA notification stream for the comment
 * acquisition specialist. This source deliberately owns no task state: the
 * acquisition controller supplies and persists the cursor per task/account.
 */
export function createDouyinCommentNotificationSource({
  cloudRegistry,
  analyzer = createLeadIntentAnalysisService(),
  sleep = defaultSleep,
  now = () => new Date().toISOString(),
  readyAttempts = DEFAULT_READY_ATTEMPTS,
  readyPollMs = DEFAULT_READY_POLL_MS,
  notificationWaitMs = 0
} = {}) {
  if (!cloudRegistry || typeof cloudRegistry.getService !== "function") {
    throw new TypeError("cloudRegistry.getService is required");
  }
  if (!analyzer || typeof analyzer.analyze !== "function") {
    throw new TypeError("analyzer.analyze is required");
  }

  async function scan({
    agentId,
    account = null,
    accountId = null,
    accountIdentity = null,
    tenantId = null,
    cursor = 0,
    goal = "",
    minScore = 0,
    limit = 100,
    waitMs = notificationWaitMs,
    requestId = null,
    interactions = false,
    analyze = true
  } = {}) {
    const id = String(agentId || "").trim();
    if (!id) throw sourceError("评论监听缺少 Agent 标识", "DOUYIN_NOTIFICATION_AGENT_REQUIRED", 400);
    const cloudScope = { accountId, accountIdentity: accountIdentity || account || null, tenantId };
    const service = cloudRegistry.getService(id, cloudScope);
    if (!service || typeof service.pullNotifications !== "function") {
      throw sourceError("抖音评论监听接口不可用", "DOUYIN_NOTIFICATION_SOURCE_UNAVAILABLE", 503);
    }

    const ready = await waitUntilNotificationModeRunning(id, service, cloudScope);
    const pullCursor = normalizeCursor(cursor);
    let response;
    try {
      response = await service.pullNotifications({
        cursor: pullCursor,
        limit: normalizeLimit(limit),
        waitMs: Math.max(0, Number(waitMs) || 0)
      });
    } catch (error) {
      throw normalizeProviderError(error, "抖音评论通知读取失败");
    }
    if (isProviderFailure(response)) {
      throw normalizeProviderError(response, "抖音评论通知读取失败");
    }

    const rawItems = extractNotificationItems(response);
    const normalized = rawItems.map((item, index) => interactions
      ? normalizeDouyinInteractionNotification(item, { now, index })
      : normalizeDouyinCommentNotification(item, { now, index })).filter(Boolean);
    const analysis = analyze && normalized.length
      ? await analyzeComments(analyzer, normalized, { account, goal })
      : emptyAnalysis(now);
    const leads = analyze ? applyAnalysis(normalized, analysis, minScore) : normalized;
    const nextCursor = extractNextCursor(response, pullCursor);

    return {
      ok: true,
      source: "douyin_rpa_notifications",
      notificationMode: ready.notificationMode,
      requestId,
      rawCount: rawItems.length,
      nextCursor,
      leads,
      snapshot: {
        schemaVersion: 1,
        source: "douyin_rpa_notifications",
        cursor: nextCursor,
        notifications: rawItems.length,
        counts: {
          notifications: rawItems.length,
          normalized: normalized.length,
          candidates: leads.length,
          modelReviewed: analysis.counts?.modelReviewed || 0
        },
        analysis
      }
    };
  }

  async function waitUntilNotificationModeRunning(agentId, service, cloudScope = {}) {
    let started = false;
    let lastSnapshot = null;
    let lastStart = null;
    const attempts = Math.max(1, Math.floor(Number(readyAttempts) || DEFAULT_READY_ATTEMPTS));
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        lastSnapshot = await readStatus(agentId, service, cloudScope);
        assertLoggedInAndOnline(lastSnapshot);
      } catch (error) {
        // The RPA adapter can report worker_timeout while the cloud is still
        // booting. It is a wait state, never a definitive task failure.
        if (!isRetryableProviderResult(error) && error?.code !== "DOUYIN_CLOUD_NOT_READY") throw error;
        lastStart = error;
        if (attempt + 1 < attempts) await sleep(Math.max(0, Number(readyPollMs) || DEFAULT_READY_POLL_MS));
        continue;
      }
      if (notificationModeOf(lastSnapshot) === "running") {
        return { notificationMode: "running", snapshot: lastSnapshot };
      }
      if (!started) {
        if (typeof service.startNotificationMode !== "function") {
          throw sourceError("抖音评论监听启动接口不可用", "DOUYIN_NOTIFICATION_START_UNAVAILABLE", 503);
        }
        try {
          lastStart = await service.startNotificationMode();
        } catch (error) {
          lastStart = error;
        }
        if (!isRetryableProviderResult(lastStart)) {
          throw normalizeProviderError(lastStart, "抖音评论监听启动失败");
        }
        started = true;
      }
      if (attempt + 1 < attempts) await sleep(Math.max(0, Number(readyPollMs) || DEFAULT_READY_POLL_MS));
    }
    throw sourceError("抖音评论监听仍在启动，任务将稍后重试", "DOUYIN_NOTIFICATION_MODE_NOT_READY", 503, {
      lastStatus: lastSnapshot,
      lastStart
    });
  }

  async function readStatus(agentId, service, cloudScope = {}) {
    try {
      // A long-running task may resume after the web process or adapter was
      // restarted. Ask the registry to reattach the persisted account-owned
      // cloud session before deciding that the account is logged out.
      if (typeof cloudRegistry.status === "function") return await cloudRegistry.status(agentId, { ...cloudScope, resumeSaved: true });
      if (typeof service.status === "function") return await service.status();
      return { ok: true, state: "ONLINE", login_state: "logged_in", notification_mode: "unknown" };
    } catch (error) {
      throw normalizeProviderError(error, "抖音云电脑状态读取失败");
    }
  }

  return Object.freeze({ scan, waitUntilNotificationModeRunning });
}

export function normalizeDouyinCommentNotification(notification, { now = () => new Date().toISOString(), index = 0 } = {}) {
  if (!isRecord(notification)) return null;
  const comment = firstRecord(notification.comment, notification.comment_info, notification.commentInfo);
  const user = firstRecord(notification.user, notification.user_info, notification.userInfo, notification.author, comment?.user, comment?.user_info) || {};
  const video = firstRecord(notification.video, notification.aweme, notification.work, notification.item, comment?.video, comment?.aweme) || {};
  const text = cleanText(first(
    notification.comment_text, notification.commentText, notification.text,
    notification.content?.text, notification.content?.value,
    typeof notification.content === "string" ? notification.content : null,
    comment?.text, comment?.content?.text, typeof comment?.content === "string" ? comment.content : null,
    comment?.comment, comment?.comment_text
  ));
  if (!text) return null;

  const notificationId = valueString(first(notification.msg_id, notification.message_id, notification.messageId, notification.notification_id, notification.notificationId));
  const commentId = valueString(first(notification.comment_id, notification.commentId, notification.cid, comment?.comment_id, comment?.commentId, comment?.cid, comment?.id, notification.id));
  const sender = firstRecord(notification.sender, notification.from, notification.author) || {};
  const userId = valueString(first(
    notification.user_id, notification.userId, notification.uid,
    user?.user_id, user?.userId, user?.uid, user?.id,
    sender?.user_id, sender?.userId, sender?.uid, sender?.id
  ));
  const secUid = valueString(first(notification.sec_uid, notification.secUid, user?.sec_uid, user?.secUid, sender?.sec_uid, sender?.secUid));
  const uniqueId = valueString(first(notification.unique_id, notification.uniqueId, user?.unique_id, user?.uniqueId, user?.unique_id));
  const nickname = cleanText(first(notification.nickname, notification.nick_name, notification.nickName, notification.user_name, notification.userName, user?.nickname, user?.nick_name, user?.nickName, user?.name, sender?.nickname, sender?.nick_name, sender?.nickName, sender?.name));
  const videoId = valueString(first(notification.video_id, notification.videoId, notification.aweme_id, notification.awemeId, notification.item_id, notification.itemId, video?.video_id, video?.videoId, video?.aweme_id, video?.awemeId, video?.item_id, video?.itemId, video?.id));
  const videoTitle = cleanText(first(notification.video_title, notification.videoTitle, notification.title, video?.title, video?.desc, video?.description));
  const videoUrl = valueString(first(notification.video_url, notification.videoUrl, notification.share_url, notification.shareUrl, video?.video_url, video?.videoUrl, video?.share_url, video?.shareUrl, video?.url));
  const observedAt = first(
    notification.timestamp,
    notification.create_time,
    notification.createTime,
    notification.created_at,
    notification.createdAt,
    notification.notice_time,
    notification.noticeTime,
    comment?.create_time,
    comment?.createTime,
    now()
  );
  const stableId = userId || secUid || uniqueId || commentId || notificationId || stable(`${nickname}:${text}:${videoId || ""}:${index}`);
  return {
    id: stableId,
    leadId: stableId,
    commentId: commentId || null,
    notificationId: notificationId || null,
    externalUserId: userId || secUid || uniqueId || null,
    userId: userId || null,
    secUid: secUid || null,
    uniqueId: uniqueId || null,
    nickname: nickname || null,
    account: nickname || null,
    platform: "douyin",
    text,
    source: {
      type: "comment",
      channel: "notification",
      videoId: videoId || null,
      videoTitle: videoTitle || null,
      videoUrl: videoUrl || null,
      observedAt,
      notificationId: notificationId || null
    },
    evidence: [{ type: "comment", quote: text, videoId: videoId || null, observedAt, sourceUrl: videoUrl || null }],
    discoveredAt: now(),
    raw: redact(notification)
  };
}

/** Preserve behavior evidence separately from customer-authored text. */
export function normalizeDouyinInteractionNotification(notification, options = {}) {
  if (!isRecord(notification)) return null;
  const kind = String(notification.notification_type || notification.event_type || notification.type || "comment").toLowerCase();
  const kinds = { comment: "comment", reply: "comment", like: "like", digg: "like", follow: "follow", fans: "follow", favorite: "favorite", collect: "favorite", share: "share", live_chat: "live_chat", chat: "live_chat", danmaku: "live_chat", live_like: "like", live_follow: "follow", gift: "gift", member: "join", join: "join" };
  const type = kinds[kind];
  if (!type) return null;
  const authored = type === "comment" || type === "live_chat";
  const normalized = normalizeDouyinCommentNotification(authored ? notification : { ...notification, comment_text: `[${type}]` }, options);
  if (!normalized || !normalized.externalUserId) return null;
  const user = notification.sender || notification.user || notification.user_info || {};
  const quote = authored ? normalized.text : "";
  const roomId = valueString(notification.room_id || notification.roomId || notification.room?.id);
  return {
    ...normalized,
    text: quote,
    avatarUrl: user.avatar || user.avatar_url || user.avatar_thumb?.url_list?.[0] || null,
    source: { ...normalized.source, type, channel: type === "live_chat" || roomId ? "live" : "notification", roomId },
    evidence: [{
      ...normalized.evidence[0], type, quote, action: type, roomId,
      eventId: normalized.notificationId || valueString(notification.msg_id || notification.id) || stable(notification)
    }]
  };
}

function extractNotificationItems(payload) {
  if (Array.isArray(payload)) return payload;
  if (!isRecord(payload)) return [];
  const keys = ["notifications", "notificationList", "notification_list", "comments", "commentList", "comment_list", "items", "records", "messages", "list"];
  for (const key of keys) if (Array.isArray(payload[key])) return payload[key];
  for (const key of ["data", "result", "payload", "body"]) {
    const nested = payload[key];
    if (Array.isArray(nested)) return nested;
    if (isRecord(nested)) {
      const found = extractNotificationItems(nested);
      if (found.length) return found;
    }
  }
  return [];
}

function extractNextCursor(payload, fallback) {
  if (!isRecord(payload)) return fallback;
  const value = first(payload.next_cursor, payload.nextCursor, payload.cursor, payload.data?.next_cursor, payload.data?.nextCursor, payload.result?.next_cursor, payload.result?.nextCursor);
  return value == null || value === "" ? fallback : value;
}

async function analyzeComments(analyzer, leads, { account, goal }) {
  // The analyzer is the real model-backed LeadIntentAnalysisService in
  // production; its provider/model/reason fields are retained unchanged.
  return analyzer.analyze({
    mode: "intent",
    goal,
    account,
    comments: leads.map((lead, index) => ({
      index,
      text: lead.text,
      videoTitle: lead.source?.videoTitle || "",
      observedAt: lead.source?.observedAt || ""
    }))
  });
}

function applyAnalysis(leads, analysis, minScore) {
  const byIndex = new Map((analysis?.items || []).map((item) => [item.index, item]));
  const analyzed = leads.map((lead, index) => {
    const item = byIndex.get(index);
    if (!item) return { ...lead, score: 0, tier: "low", intent: { score: 0, tier: "low", confidence: 0, reason: "模型未覆盖该评论", signals: [], source: "model" } };
    return {
      ...lead,
      score: item.score,
      tier: item.tier,
      intent: {
        tier: item.tier,
        score: item.score,
        confidence: item.confidence,
        reason: item.reason,
        signals: item.signals || [],
        ...(Array.isArray(item.traits) && item.traits.length ? { traits: item.traits } : {}),
        source: analysis.source || "model",
        provider: analysis.provider || null,
        model: analysis.model || null,
        generatedAt: analysis.generatedAt || null
      }
    };
  });
  const threshold = Number(minScore);
  return Number.isFinite(threshold) && threshold > 0 ? analyzed.filter((lead) => lead.score >= threshold) : analyzed;
}

function emptyAnalysis(now) {
  return { schemaVersion: 1, mode: "intent", source: "none", provider: null, model: null, generatedAt: now(), counts: { high: 0, medium: 0, low: 0, modelReviewed: 0 }, items: [] };
}

function assertLoggedInAndOnline(snapshot) {
  if (isProviderFailure(snapshot)) throw normalizeProviderError(snapshot, "抖音云电脑状态读取失败");
  const login = String(snapshot?.login_state || snapshot?.loginState || snapshot?.account?.login_state || "").toLowerCase();
  if (["logged_out", "logout", "unauthorized", "authorization_expired"].includes(login)) {
    throw sourceError("抖音账号尚未登录或授权已失效", "DOUYIN_AUTH_REQUIRED", 401);
  }
  const state = String(snapshot?.state || snapshot?.session_state || snapshot?.display_state || "").toLowerCase();
  if (snapshot?.provisioning === true || ["starting", "provisioning", "initializing", "booting", "connecting", "recovering"].includes(state)) {
    throw sourceError("抖音云电脑仍在启动或连接中", "DOUYIN_CLOUD_NOT_READY", 503);
  }
}

function notificationModeOf(snapshot) {
  return String(snapshot?.notification_mode || snapshot?.notificationMode || snapshot?.modules?.notification_mode || snapshot?.modules?.notificationMode || "").toLowerCase();
}

function isProviderFailure(value) {
  if (!value) return false;
  const code = providerCode(value);
  return value.ok === false || Boolean(value.error) || Boolean(value.error_code) || RETRYABLE_PROVIDER_CODES.has(code);
}

function isRetryableProviderResult(value) {
  if (!value) return true;
  if (value instanceof Error) return RETRYABLE_PROVIDER_CODES.has(providerCode(value)) || /timeout|queued|starting|not ready/i.test(String(value.message || ""));
  if (value.ok !== false && !value.error && !value.error_code) return true;
  return RETRYABLE_PROVIDER_CODES.has(providerCode(value)) || /timeout|queued|starting|not ready/i.test(String(value.message || value.error?.message || ""));
}

function normalizeProviderError(value, fallbackMessage) {
  const error = value instanceof Error ? value : value?.error instanceof Error ? value.error : new Error(value?.message || value?.error?.message || fallbackMessage);
  const code = providerCode(value) || providerCode(error) || "DOUYIN_MCP_TIMEOUT";
  return Object.assign(error, { code, statusCode: error.statusCode || value?.statusCode || 503 });
}

function providerCode(value) {
  return String(value?.code || value?.error_code || value?.errorCode || value?.error?.code || "").trim().toUpperCase();
}

function sourceError(message, code, statusCode = 503, details = {}) {
  return Object.assign(new Error(message), { code, statusCode, details });
}

function firstRecord(...values) { return values.find(isRecord) || null; }
function first(...values) {
  for (const value of values) {
    if (value === 0 || value === false) return value;
    if (typeof value === "string" && value.trim()) return value.trim();
    if (value != null && typeof value !== "string") return value;
  }
  return null;
}
function valueString(value) { return value == null || value === "" ? null : String(value).trim() || null; }
function cleanText(value) { return Array.isArray(value) ? value.map(cleanText).filter(Boolean).join("；") : String(value ?? "").trim(); }
function normalizeCursor(value) { return value == null || value === "" ? 0 : value; }
function normalizeLimit(value) { const limit = Math.floor(Number(value) || 100); return Math.max(1, Math.min(100, limit)); }
function isRecord(value) { return Boolean(value && typeof value === "object" && !Array.isArray(value)); }
function stable(value) { return createHash("sha256").update(String(value)).digest("hex").slice(0, 24); }
function redact(value) { return value == null ? null : JSON.parse(JSON.stringify(value)); }
function defaultSleep(ms) { return ms ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve(); }
