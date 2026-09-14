const text = value => typeof value === "string" ? value.trim() : "";
const object = value => value && typeof value === "object" && !Array.isArray(value) ? value : {};
export const ACCOUNT_ANALYSIS_AGENT_ID = "mkt-intent-analyst";
export const ACCOUNT_ANALYSIS_LIMIT = 20;

export function buildAccountAnalysisBatch(accounts = [], limit = ACCOUNT_ANALYSIS_LIMIT) {
  const normalized = normalizeAnalysisAccounts(accounts);
  return {
    accounts: normalized,
    count: normalized.length,
    limit,
    canAnalyze: normalized.length > 0 && normalized.length <= limit,
    exceedsLimit: normalized.length > limit
  };
}

function httpUrl(value) {
  try { const url = new URL(text(value)); return ["https:", "http:"].includes(url.protocol) ? url.href : ""; } catch { return ""; }
}

export function normalizeAnalysisAccounts(accounts = [], source = {}) {
  const merged = new Map();
  for (const raw of Array.isArray(accounts) ? accounts : []) {
    const item = typeof raw === "string" ? { profileUrl: raw } : object(raw);
    const profile = object(item.profile);
    const user = object(item.user || item.account || item.identity || item.sender || item.user_info);
    const profileUrl = httpUrl(item.profileUrl || item.profile_url || item.url || user.profileUrl);
    let secUid = text(item.secUid || item.sec_uid || item.secId || item.sec_id || user.sec_uid || user.secUid || profile.sec_uid);
    if (!secUid && profileUrl) {
      const url = new URL(profileUrl);
      if (/(^|\.)douyin\.com$/.test(url.hostname) && url.pathname.startsWith("/user/")) secUid = url.pathname.split("/")[2] || "";
    }
    const id = secUid || text(item.userId || item.uid || user.uid) || profileUrl || text(item.id);
    if (!id) continue;
    const publicProfile = {};
    for (const key of ["signature", "bio", "description", "nickname", "unique_id", "follower_count", "following_count", "aweme_count", "total_favorited", "location", "city", "province", "country", "enterprise_verify_reason"]) {
      const value = profile[key] ?? user[key];
      if (typeof value === "string") publicProfile[key] = value.slice(0, 2000);
      if (typeof value === "number" && Number.isFinite(value)) publicProfile[key] = value;
    }
    const videos = (Array.isArray(item.videos) ? item.videos : []).slice(0, 10).map(video => ({
      id: String(video.aweme_id || video.id || ""), text: text(video.desc || video.title || video.description || video.text).slice(0, 1000),
      createdAt: video.create_time || video.createdAt || null
    }));
    const evidence = (Array.isArray(item.evidence) ? item.evidence : []).map(e => ({
      type: text(e.type) || "source", quote: text(e.quote || e.text).slice(0, 2000),
      sourceUrl: httpUrl(e.sourceUrl || e.url), observedAt: e.observedAt || null
    })).filter(e => e.quote);
    const quote = text(item.text || item.quote || item.comment);
    if (quote && !evidence.some(e => e.quote === quote)) evidence.push({ type: "comment", quote: quote.slice(0, 2000), sourceUrl: httpUrl(item.source?.videoUrl), observedAt: item.source?.observedAt || null });
    const normalized = {
      id, secUid, nickname: text(item.nickname || item.name || profile.nickname || user.nickname) || id,
      avatarUrl: httpUrl(item.avatarUrl || item.avatar_url || item.avatar || profile.avatarUrl || profile.avatar_url || profile.avatar_thumb?.url_list?.[0] || user.avatar || user.avatar_url || user.avatar_thumb?.url_list?.[0]),
      profileUrl, profile: publicProfile, videos, evidence,
      source: {
        agentId: text(source.agentId || item.source?.agentId),
        taskId: text(source.taskId || item.source?.taskId),
        resultId: text(source.resultId || item.source?.resultId),
        taskTitle: text(source.taskTitle || item.source?.taskTitle),
        taskGoal: text(source.taskGoal || item.source?.taskGoal),
        recordId: text(item.recordId || item.source?.recordId)
      }
    };
    const prior = merged.get(id);
    if (prior) {
      normalized.evidence = [...new Map([...prior.evidence, ...evidence].map(e => [JSON.stringify(e), e])).values()].slice(-30);
      normalized.profile = { ...prior.profile, ...publicProfile };
      normalized.videos = [...new Map([...prior.videos, ...videos].map(v => [v.id || v.text, v])).values()].slice(0, 10);
      normalized.avatarUrl ||= prior.avatarUrl;
    }
    merged.set(id, normalized);
  }
  return [...merged.values()];
}

function sourceTaskTitle(run, snapshot) {
  return text(run.sourceTaskTitle || run.title || snapshot.title || run.inputs?.goal)
    .replace(/\s*[·•|]\s*(?:抖音)?找人结果\s*$/u, "")
    .trim();
}

export function buildAccountAnalysisResumeFlow({ run = {}, items = null, goal = "" } = {}) {
  const snapshot = object(run.resultSnapshot);
  const collections = [run.accounts, run.items, run.leads, run.matches, run.comments, snapshot.accounts, snapshot.items, snapshot.leads, snapshot.allLeads, snapshot.matches, snapshot.comments, Object.values(object(run.candidateProfiles))];
  const input = items || collections.find(value => Array.isArray(value) && value.length) || [];
  const sourceTaskGoal = text(run.sourceTaskGoal || run.inputs?.goal || snapshot.inputs?.goal || run.goal);
  const sourceTitle = sourceTaskTitle(run, snapshot);
  return {
    agentId: ACCOUNT_ANALYSIS_AGENT_ID, step: "setup",
    analysisKind: "account_report",
    analysisGoal: text(goal) || "了解这些账号主要做什么、有哪些需求，以及哪些信息还需要确认。",
    analysisAccounts: normalizeAnalysisAccounts(input, { agentId: run.agentId, taskId: run.taskId, resultId: run.id || run.resultId || run.taskId, taskTitle: sourceTitle, taskGoal: sourceTaskGoal }),
    sourceTaskId: run.taskId || "", sourceResultId: run.id || run.resultId || run.taskId || "",
    sourceTaskTitle: sourceTitle,
    sourceTaskGoal
  };
}
