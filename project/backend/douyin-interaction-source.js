import { createHash } from "node:crypto";
import { createDouyinCommentNotificationSource, normalizeDouyinInteractionNotification } from "./douyin-comment-notification-source.js";
import { createLeadIntentAnalysisService } from "./lead-intent-analysis.js";
import { buildDouyinProspectFacts, mergeDouyinProspectFacts } from "./douyin-prospect-facts.js";
import { analyzeLiveDanmakuSignals } from "../src/salebuddy/agents/live-danmaku-analysis.js";

const keyOf = lead => String(lead.secUid || lead.secId || lead.externalUserId || lead.userId || "");
const eventKey = evidence => evidence.eventId || createHash("sha256").update(JSON.stringify(evidence)).digest("hex");
const failure = error => ({ state: "degraded", error: { code: error?.code || error?.error?.code || "DOUYIN_SOURCE_UNAVAILABLE", message: error?.message || error?.error?.message || "数据源暂不可用" } });
const NO_LIVE_STATES = new Set(["offline", "not_live", "not-live"]);
const ENDED_LIVE_STATES = new Set(["ended", "stopped"]);
const NO_LIVE_ERROR_CODES = new Set(["LIVE_NOT_STARTED", "DOUYIN_LIVE_OFFLINE", "DOUYIN_LIVE_NOT_ACTIVE", "live_polling_start_timeout"]);
function check(response) {
  if (!response || response.ok === false || response.error || response.error_code) {
    throw Object.assign(new Error(response?.error?.message || response?.message || "数据源未就绪"), { code: response?.error?.code || response?.error_code || "DOUYIN_SOURCE_UNAVAILABLE" });
  }
  return response;
}
function liveIsNotActive(status) {
  if (!status || status.ok === false || status.error) return false;
  const state = String(status.live_state || status.liveState || status.live_status || status.liveStatus || status.state || status.status || "").trim().toLowerCase();
  return status.is_live === false || status.isLive === false || NO_LIVE_STATES.has(state);
}
function liveIsEnded(status) {
  if (!status || status.ok === false || status.error) return false;
  const state = String(status.live_state || status.liveState || status.live_status || status.liveStatus || status.state || status.status || "").trim().toLowerCase();
  return ENDED_LIVE_STATES.has(state) || Boolean(status.terminal_reason || status.terminalReason);
}
function liveErrorMeansNotActive(error) {
  const code = String(error?.code || error?.error?.code || "").trim();
  const message = String(error?.message || error?.error?.message || "");
  return NO_LIVE_ERROR_CODES.has(code) || /未开播|当前没有直播|直播已结束|直播间不存在/.test(message);
}
function liveErrorMeansEnded(error) {
  const code = String(error?.code || error?.error?.code || "").trim().toLowerCase();
  const message = String(error?.message || error?.error?.message || "");
  return code.includes("live_ended") || /直播已结束|直播间已结束|直播结束/.test(message);
}
function liveItems(response) {
  if (Array.isArray(response)) return response;
  for (const key of ["messages", "live_messages", "items", "events", "records"]) if (Array.isArray(response?.[key])) return response[key];
  return response?.data ? liveItems(response.data) : [];
}

function profileKey(lead = {}) {
  return String(lead.secUid || lead.sec_uid || lead.secId || lead.sec_id || lead.userId || lead.user_id || "");
}

function sourceError(error) {
  return {
    code: error?.code || error?.error?.code || "DOUYIN_AGENT_DATA_UNAVAILABLE",
    message: error?.message || error?.error?.message || "公开资料暂不可用"
  };
}

function mergeAnalysisTraits(previous = [], next = [], analysis = {}) {
  const traits = new Map();
  const add = (value, metadata = {}) => {
    if (!value || typeof value !== "object") return;
    const label = String(value.label || value.name || "").trim();
    const result = String(value.value || value.result || value.conclusion || value.text || "").trim();
    const evidence = String(value.evidence || value.basis || value.support || "").trim();
    if (!label || !result || !evidence) return;
    traits.set(label.toLocaleLowerCase(), {
      label,
      value: result,
      evidence,
      source: metadata.source || value.source || "douyin_ai_analysis",
      ...(analysis.provider ? { provider: analysis.provider } : {}),
      ...(analysis.model ? { model: analysis.model } : {}),
      ...(analysis.generatedAt ? { generatedAt: analysis.generatedAt } : {})
    });
  };
  if (Array.isArray(previous)) previous.forEach((value) => add(value));
  if (Array.isArray(next)) next.forEach((value) => add(value, { source: "douyin_ai_analysis" }));
  return [...traits.values()].slice(-12);
}

async function mapConcurrent(items, concurrency, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await mapper(items[index], index);
    }
  };
  const workers = Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/** One cursor per stream; failed streams never block successful intake. */
export function createDouyinInteractionSource({
  cloudRegistry,
  commentSource = null,
  analyzer = createLeadIntentAnalysisService(),
  profileDataClient = null,
  profileDataTimeoutMs = 10_000,
  profileDataConcurrency = 4,
  now = () => new Date().toISOString()
} = {}) {
  const notifications = commentSource || createDouyinCommentNotificationSource({ cloudRegistry });
  const liveSessions = new Map();
  const liveConsumers = new Map();
  const accountContexts = new Map();

  function liveConsumerKey(listenerKey, agentId) {
    return String(listenerKey || `default:${String(agentId || "").trim()}`);
  }

  function registerLiveConsumer(scopeKey, listenerKey, agentId) {
    const consumers = liveConsumers.get(scopeKey) || new Set();
    consumers.add(liveConsumerKey(listenerKey, agentId));
    liveConsumers.set(scopeKey, consumers);
  }

  function releaseLiveConsumer(scopeKey, listenerKey, agentId) {
    const consumers = liveConsumers.get(scopeKey);
    if (!consumers) return true;
    consumers.delete(liveConsumerKey(listenerKey, agentId));
    if (consumers.size) return false;
    liveConsumers.delete(scopeKey);
    return true;
  }

  async function loadAccountContext(account, cloudScope) {
    const base = account && typeof account === "object" ? account : null;
    const summary = {
      state: profileDataClient ? "waiting" : "unavailable",
      requested: 0,
      completed: 0,
      failed: 0,
      profile: { requested: 0, completed: 0, failed: 0 },
      content: { requested: 0, completed: 0, failed: 0 }
    };
    const secUid = profileKey(base || {});
    if (!profileDataClient || !secUid) return { account: base, summary };

    const cacheKey = cloudScopeKey("account-context", cloudScope);
    const cached = accountContexts.get(cacheKey);
    if (cached) return cached;

    const pending = (async () => {
      const profileRequested = typeof profileDataClient.profile === "function";
      const contentRequested = typeof profileDataClient.videosLatest === "function";
      summary.requested = Number(profileRequested) + Number(contentRequested);
      summary.profile.requested = Number(profileRequested);
      summary.content.requested = Number(contentRequested);
      if (!summary.requested) {
        summary.state = "unavailable";
        return { account: base, summary };
      }

      const calls = [];
      if (profileRequested) {
        calls.push(Promise.resolve()
          .then(() => profileDataClient.profile(secUid, { fresh: false, timeout: profileDataTimeoutMs }))
          .then(value => ({ kind: "profile", value }))
          .catch(error => ({ kind: "profile", error })));
      }
      if (contentRequested) {
        calls.push(Promise.resolve()
          .then(() => profileDataClient.videosLatest(secUid, { count: 20, fresh: false, timeout: profileDataTimeoutMs }))
          .then(value => ({ kind: "content", value }))
          .catch(error => ({ kind: "content", error })));
      }

      let profile = null;
      let recentWorks = null;
      const errors = [];
      for (const result of await Promise.all(calls)) {
        if (result.error) {
          errors.push({ source: result.kind, ...sourceError(result.error) });
          summary.failed += 1;
          summary[result.kind].failed += 1;
          continue;
        }
        if (result.kind === "profile") {
          profile = result.value;
          summary.completed += 1;
          summary.profile.completed += 1;
        } else {
          recentWorks = result.value;
          summary.completed += 1;
          summary.content.completed += 1;
        }
      }

      summary.state = summary.failed
        ? "degraded"
        : summary.completed
          ? "available"
          : "unavailable";
      return {
        account: {
          ...base,
          ...(profile ? { profile } : {}),
          ...(recentWorks ? { recentWorks } : {})
        },
        summary: {
          ...summary,
          ...(errors.length ? { errors } : {})
        }
      };
    })();
    const result = pending.then(value => {
      if (value.summary.state !== "available") accountContexts.delete(cacheKey);
      return value;
    });
    accountContexts.set(cacheKey, result);
    return result;
  }

  async function enrichCandidates(candidates, profiles) {
    const summary = {
      state: profileDataClient ? "waiting" : "unavailable",
      requested: 0,
      completed: 0,
      failed: 0,
      profile: { requested: 0, completed: 0, failed: 0 },
      content: { requested: 0, completed: 0, failed: 0 }
    };
    if (!candidates.length) return summary;

    const enriched = await mapConcurrent(candidates, profileDataConcurrency, async (lead) => {
      const previous = profiles[keyOf(lead)] || {};
      const secUid = profileKey(lead);
      const observedAt = now();
      if (!profileDataClient || !secUid) {
        const derived = buildDouyinProspectFacts({
          lead,
          profile: previous.profileData || null,
          videos: previous.contentEvidence || [],
          observedAt
        });
        return {
          lead,
          patch: {
            facts: mergeDouyinProspectFacts(previous.facts, derived.facts),
            factSources: { ...(previous.factSources || {}), ...derived.factSources },
            factAvailability: Object.fromEntries(Object.entries({ ...(previous.factAvailability || {}), ...derived.factAvailability })),
            profileData: previous.profileData || {},
            contentEvidence: previous.contentEvidence || [],
            enrichment: {
              state: "unavailable",
              profile: "unavailable",
              content: "unavailable",
              observedAt,
              errors: []
            }
          }
        };
      }

      const errors = [];
      let profile = null;
      let videos = [];
      let profileStatus = "unavailable";
      let contentStatus = "unavailable";
      const profileRequested = typeof profileDataClient.profile === "function";
      const contentRequested = typeof profileDataClient.videosLatest === "function";
      summary.requested += Number(profileRequested) + Number(contentRequested);
      summary.profile.requested += Number(profileRequested);
      summary.content.requested += Number(contentRequested);

      const calls = [];
      if (profileRequested) {
        calls.push(Promise.resolve()
          .then(() => profileDataClient.profile(secUid, { fresh: false, timeout: profileDataTimeoutMs }))
          .then(value => ({ kind: "profile", value }))
          .catch(error => ({ kind: "profile", error })));
      }
      if (contentRequested) {
        calls.push(Promise.resolve()
          .then(() => profileDataClient.videosLatest(secUid, { count: 20, fresh: false, timeout: profileDataTimeoutMs }))
          .then(value => ({ kind: "content", value }))
          .catch(error => ({ kind: "content", error })));
      }
      for (const result of await Promise.all(calls)) {
        if (result.error) {
          errors.push({ source: result.kind, ...sourceError(result.error) });
          summary.failed += 1;
          summary[result.kind].failed += 1;
          continue;
        }
        if (result.kind === "profile") {
          profile = result.value;
          profileStatus = "available";
          summary.completed += 1;
          summary.profile.completed += 1;
        } else {
          videos = result.value;
          contentStatus = "available";
          summary.completed += 1;
          summary.content.completed += 1;
        }
      }

      const derived = buildDouyinProspectFacts({ lead, profile, videos, replies: previous.replies || [], observedAt });
      const profileData = Object.keys(derived.profileData || {}).length ? derived.profileData : (previous.profileData || {});
      const contentEvidence = derived.contentEvidence.length ? derived.contentEvidence : (previous.contentEvidence || []);
      const patch = {
        facts: mergeDouyinProspectFacts(previous.facts, derived.facts),
        factSources: { ...(previous.factSources || {}), ...derived.factSources },
        factAvailability: Object.fromEntries(Object.entries({ ...(previous.factAvailability || {}), ...derived.factAvailability })),
        profileData,
        contentEvidence,
        enrichment: {
          state: errors.length ? "degraded" : "available",
          profile: profileRequested ? profileStatus : "unavailable",
          content: contentRequested ? contentStatus : "unavailable",
          observedAt,
          ...(errors.length ? { errors } : {})
        }
      };
      return { lead, patch };
    });

    enriched.forEach(({ lead, patch }) => {
      profiles[keyOf(lead)] = { ...profiles[keyOf(lead)], ...patch };
    });
    summary.state = summary.failed
      ? "degraded"
      : summary.completed
        ? "available"
        : "unavailable";
    return summary;
  }

  async function scan({
    agentId,
    account,
    accountId = null,
    accountIdentity = null,
    tenantId = null,
    cursor,
    goal,
    analysisMode = "intent",
    liveSignals = [],
    profiles = {},
    limit = 100,
    requestId,
    liveOnly = false,
    includeNotifications = true,
    includeLive = true,
    includeAccountContext = false,
    listenerKey = null,
    isActive = () => true
  } = {}) {
    const cloudScope = { accountId, accountIdentity: accountIdentity || account || null, tenantId };
    const scopeKey = cloudScopeKey(agentId, cloudScope);
    const previous = cursor && typeof cursor === "object" ? cursor : { notifications: cursor ?? 0, live: 0 };
    const nextCursor = { notifications: previous.notifications ?? 0, live: previous.live ?? 0 };
    const sources = {};
    const signals = [];
    const readNotifications = includeNotifications !== false && !liveOnly;
    const readLive = includeLive !== false;
    if (readNotifications) try {
      const result = check(await notifications.scan({
        agentId,
        account,
        accountId,
        accountIdentity: cloudScope.accountIdentity,
        tenantId,
        cursor: nextCursor.notifications,
        goal,
        limit,
        requestId,
        interactions: true,
        analyze: false
      }));
      signals.push(...(result.leads || []));
      nextCursor.notifications = result.nextCursor ?? nextCursor.notifications;
      sources.notifications = { state: "listening", count: result.leads?.length || 0 };
    } catch (error) { sources.notifications = failure(error); }

    const service = readLive ? cloudRegistry.getService(agentId, cloudScope) : null;
    if (readLive) try {
      if (!isActive()) throw Object.assign(new Error("获客任务已停止"), { code: "DOUYIN_ACQUISITION_STOPPED" });
      if (!service?.startLivePolling || !service?.pullLiveMessages) throw Object.assign(new Error("直播接口尚未接入"), { code: "DOUYIN_LIVE_UNAVAILABLE" });
      // No live stream is a normal idle state. Keep the task listening to
      // notifications and revisit the live channel on the next scan window.
      const pollingStatus = typeof service.livePollingStatus === "function" ? await service.livePollingStatus() : null;
      if (liveIsEnded(pollingStatus)) {
        liveSessions.delete(scopeKey);
        sources.live = { state: "ended", count: 0, reason: "live_ended" };
      } else if (liveIsNotActive(pollingStatus)) {
        liveSessions.delete(scopeKey);
        sources.live = { state: "waiting", count: 0, reason: "not_live" };
      } else {
      const session = service.getSessionId?.() || service;
      registerLiveConsumer(scopeKey, listenerKey, agentId);
      if (liveSessions.get(scopeKey) !== session) {
        check(await service.startLivePolling({ pollingId: `acquisition:${agentId}:${cloudScopeDigest(cloudScope)}` }));
        liveSessions.set(scopeKey, session);
      }
      const response = check(await service.pullLiveMessages({ cursor: nextCursor.live, limit, waitMs: 0 }));
      const raw = liveItems(response);
      const pollingState = String(response.live_polling || "").toLowerCase();
      const ended = ENDED_LIVE_STATES.has(pollingState) || Boolean(response.terminal_reason || response.terminalReason);
      if (ended || pollingState === "error") liveSessions.delete(scopeKey);
      const selectedLiveSignals = new Set((Array.isArray(liveSignals) ? liveSignals : [])
        .map(value => String(value || "").trim().toLowerCase())
        .filter(Boolean));
      const normalizedLiveSignals = raw
        .map(item => normalizeDouyinInteractionNotification({
          ...item,
          notification_type: item.notification_type || item.event_type || "live_chat"
        }))
        .filter(Boolean)
        .filter(signal => !selectedLiveSignals.size || selectedLiveSignals.has(
          signal.source?.type === "live_chat" ? "danmaku"
            : signal.source?.type === "join" ? "joins"
              : signal.source?.type
        ));
      signals.push(...normalizedLiveSignals);
      nextCursor.live = response.next_cursor ?? response.nextCursor ?? response.data?.next_cursor ?? nextCursor.live;
      sources.live = ended
        ? { state: "ended", count: raw.length, reason: "live_ended" }
        : { state: raw.length ? "receiving" : "waiting", count: raw.length };
    }
    } catch (error) {
      liveSessions.delete(scopeKey);
      sources.live = liveErrorMeansEnded(error)
        ? { state: "ended", count: 0, reason: "live_ended" }
        : liveErrorMeansNotActive(error)
        ? { state: "waiting", count: 0, reason: "not_live" }
        : failure(error);
    }

    const activeSources = Object.values(sources);
    if (activeSources.length && activeSources.every(source => source.state === "degraded")) {
      const unavailableMessage = readNotifications && readLive
        ? "互动通知与直播来源均暂不可用"
        : readLive
          ? sources.live?.error?.message || "直播消息暂不可用"
          : sources.notifications?.error?.message || "互动通知暂不可用";
      throw Object.assign(new Error(unavailableMessage), { code: "DOUYIN_SOURCES_UNAVAILABLE", details: sources });
    }
    const updatedProfiles = structuredClone(profiles);
    const changed = new Set();
    const own = new Set([account?.secId, account?.secUid, account?.uid].filter(Boolean));
    for (const signal of signals) {
      const key = keyOf(signal);
      if (!key || [signal.secUid, signal.secId, signal.userId, signal.externalUserId].some(id => own.has(id))) continue;
      const previousProfile = updatedProfiles[key] || {};
      const evidence = new Map((previousProfile.evidence || []).map(e => [eventKey(e), e]));
      let added = false;
      for (const item of signal.evidence || []) if (!evidence.has(eventKey(item))) { evidence.set(eventKey(item), item); added = true; }
      if (!added) continue;
      updatedProfiles[key] = { ...previousProfile, ...signal, avatarUrl: signal.avatarUrl || previousProfile.avatarUrl || null, evidence: [...evidence.values()].slice(-40) };
      changed.add(key);
    }
    const candidates = [...changed].map(key => updatedProfiles[key]);
    const profileSource = await enrichCandidates(candidates, updatedProfiles);
    sources.profile = profileSource;
    const enrichedCandidates = [...changed].map(key => updatedProfiles[key]);
    let analysisAccount = account;
    if (includeAccountContext) {
      const accountContext = await loadAccountContext(account, cloudScope);
      analysisAccount = accountContext.account;
      sources.account = accountContext.summary;
    }
    const shouldAnalyze = analysisMode !== "collect";
    const analysis = shouldAnalyze && enrichedCandidates.length ? await analyzer.analyze({
      mode: "intent", goal, account: analysisAccount,
      comments: enrichedCandidates.map((lead, index) => ({
        index, text: lead.evidence.map(e => `${e.type}: ${e.quote || "[行为记录，无用户原话]"}`).join("\n"),
        evidence: lead.evidence,
        profile: lead.profileData || {},
        recentWorks: lead.contentEvidence || [],
        videoTitle: lead.source?.videoTitle,
        observedAt: lead.source?.observedAt
      }))
    }) : { source: "none", items: [] };
    const accountContext = includeAccountContext
      ? {
          mode: "automatic",
          accountPositioning: "derived_from_authorized_profile_and_recent_works",
          serviceUsers: "derived_from_account_context_and_new_interactions",
          sourceState: sources.account?.state || "unavailable"
        }
      : null;
    const byIndex = new Map((analysis.items || []).map(item => [item.index, item]));
    const leads = shouldAnalyze ? enrichedCandidates.map((lead, index) => {
      const item = byIndex.get(index) || { score: 0, tier: "low", confidence: 0, reason: "模型未提供有效判断" };
      // Likes/follows alone do not establish buying intent, even if a model over-scores them.
      const hasWords = lead.evidence.some(e => ["comment", "live_chat"].includes(e.type) && e.quote);
      const intent = { ...item, source: analysis.source, model: analysis.model, provider: analysis.provider };
      if (!hasWords) Object.assign(intent, { score: Math.min(49, Number(intent.score) || 0), tier: "low", reason: "仅有互动行为，尚无明确需求表达" });
      const profileTraits = mergeAnalysisTraits(lead.profileTraits, item.traits, analysis);
      const result = {
        ...lead,
        ...(profileTraits.length ? { profileTraits } : {}),
        score: intent.score,
        tier: intent.tier,
        intent: {
          ...intent,
          ...(item.traits?.length ? { traits: item.traits } : {})
        }
      };
      updatedProfiles[keyOf(lead)] = result;
      return result;
    }) : enrichedCandidates;
    return {
      ok: true,
      leads,
      profiles: updatedProfiles,
      nextCursor,
      snapshot: {
        source: "douyin_interactions",
        sources,
        ...(accountContext ? { accountContext } : {}),
        analysis,
        counts: { signals: signals.length, candidates: leads.length }
      },
      liveSignals: signals.filter(signal => signal?.source?.type === "live_chat" || signal?.type === "live_chat" || signal?.evidence?.some(item => item?.type === "live_chat"))
    };
  }
  async function finalizeLiveDanmakuAnalysis({ signals = [], goal = "", account = null, now: observedAt = now() } = {}) {
    const base = analyzeLiveDanmakuSignals({ signals, goal, now: observedAt });
    const userIndexes = [];
    const comments = [];
    base.users.forEach((user, index) => {
      const text = (user.evidence || []).map(item => item.quote).filter(Boolean).join("\n");
      if (!text) return;
      userIndexes.push(index);
      comments.push({ index: comments.length, text, evidence: user.evidence });
    });
    let model = { source: "none", items: [] };
    let modelError = null;
    if (comments.length && typeof analyzer?.analyze === "function") {
      try {
        model = await analyzer.analyze({ mode: "intent", goal, account, comments });
      } catch (error) {
        modelError = sourceError(error);
      }
    }
    const modelByUser = new Map((model.items || []).map(item => [userIndexes[Number(item.index)], item]));
    const users = base.users.map((user, index) => {
      const item = modelByUser.get(index);
      if (!item) return user;
      return {
        ...user,
        aiIntent: {
          tier: item.tier,
          score: item.score,
          confidence: item.confidence,
          reason: item.reason,
          signals: item.signals || []
        }
      };
    });
    return {
      ...base,
      users,
      analysisSource: model.source === "model" ? "ai" : modelError ? "heuristic_fallback" : "heuristic",
      ...(modelError ? { aiAnalysisError: modelError } : {}),
      aiAnalysis: model,
      summary: `本场直播已结束，共采集${base.counts.danmaku}条弹幕，覆盖${base.counts.uniqueUsers}位用户，已基于整场弹幕完成分析报告。`
    };
  }
  async function stop({ agentId, accountId = null, accountIdentity = null, tenantId = null, listenerKey = null, stopLive = true } = {}) {
    const cloudScope = { accountId, accountIdentity, tenantId };
    const scopeKey = cloudScopeKey(agentId, cloudScope);
    if (!stopLive || !releaseLiveConsumer(scopeKey, listenerKey, agentId)) return;
    liveSessions.delete(scopeKey);
    const service = cloudRegistry.getService(agentId, cloudScope);
    if (service?.stopLivePolling) check(await service.stopLivePolling());
  }
  return Object.freeze({ scan, stop, finalizeLiveDanmakuAnalysis });
}

function cloudScopeKey(agentId, scope = {}) {
  return `${String(agentId || "").trim()}:${cloudScopeDigest(scope)}`;
}

function cloudScopeDigest(scope = {}) {
  const identity = scope.accountIdentity && typeof scope.accountIdentity === "object" ? scope.accountIdentity : {};
  const account = scope.accountId
    || identity.secUid || identity.sec_uid || identity.secId || identity.sec_id
    || identity.uid || identity.userId || identity.user_id || identity.uniqueId || identity.unique_id
    || "unscoped";
  return createHash("sha256")
    .update(JSON.stringify([scope.tenantId || "local", account]))
    .digest("hex")
    .slice(0, 16);
}
