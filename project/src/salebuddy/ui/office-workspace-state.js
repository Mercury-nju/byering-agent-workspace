import { DOUYIN_ACQUISITION_ACTIVE_AGENT_IDS, getMarketplaceAgent } from "../agents/marketplace.js";

export const OFFICE_START_ACTIONS = Object.freeze([
  { agentId: "mkt-comment-acquisition", label: "找一批客户", detail: "先选想找的人和行业" },
  { agentId: "mkt-find-people", label: "开始找人", detail: "从评论、直播和互动中找候选人" },
  { agentId: "mkt-intent-analyst", label: "分析候选人", detail: "整理证据、意向和下一步" },
  { agentId: "mkt-cold-writer", label: "准备私信触达", detail: "确认名单和内容后发送私信" },
  { agentId: "mkt-dm-inbox", label: "帮我接待私信", detail: "沿用账号的接待方式" },
]);

const AUTHORIZATION_ERROR_CODES = new Set([
  "ACCOUNT_OFFLINE", "AUTHORIZATION_REQUIRED", "DOUYIN_AUTH_EXPIRED", "DOUYIN_CLOUD_OFFLINE", "LOGIN_EXPIRED"
]);

function isAuthorizationIssue(value) {
  const code = String(value?.code || value?.reason || "").trim().toUpperCase();
  if (AUTHORIZATION_ERROR_CODES.has(code)) return true;
  const message = typeof value === "string" ? value : value?.message || "";
  return /授权已失效|授权过期|重新连接账号|重新登录|登录失效|登录过期|账号掉线|云电脑已确认掉线/.test(String(message));
}

function authorizationState(value) {
  return {
    kind: "attention",
    label: "账号已掉线",
    shortLabel: "账号已掉线",
    reason: typeof value === "string" ? value : value?.message || "抖音账号已掉线，请重新连接后继续工作。"
  };
}

export function officeWorkState(work) {
  const resumeBlocked = work?.metadata?.resumeBlocked;
  if (resumeBlocked && isAuthorizationIssue(resumeBlocked)) return authorizationState(resumeBlocked);
  const error = work?.metadata?.error;
  if (error && isAuthorizationIssue(error)) return authorizationState(error);
  if (work?.metadata?.officeStatus) {
    const kind = work.metadata.officeStatus;
    if (kind === "unknown") {
      const loading = work.metadata.officeStatusPhase === "loading";
      return { kind, loading, retryable: !loading,
        label: loading ? "正在获取工作状态" : "暂时无法获取工作状态",
        shortLabel: loading ? "正在获取状态" : "暂未获取状态",
        reason: loading ? "正在读取最新进度。" : work.metadata.officeStatusPhase === "unobserved"
          ? "还无法确认上次任务是否继续运行。重新获取状态，或查看上次任务。"
          : "暂时没有收到最新进度，无法判断任务是否还在运行。" };
    }
    if (kind === "attention") {
      const issue = work.metadata.resumeBlocked || work.metadata.error;
      return isAuthorizationIssue(issue) ? authorizationState(issue) : { kind: "idle", label: "暂时没有任务", shortLabel: "暂时没有任务" };
    }
    const working = kind === "working" || kind === "listening";
    return { kind: working ? "working" : "idle", label: working ? "工作中" : "暂时没有任务", shortLabel: working ? "工作中" : "暂时没有任务" };
  }
  if (!work || work.projectId === "demo-office" || work.metadata?.simulated === true) return { kind: "idle", label: "暂时没有任务" };
  const metadata = work.metadata || {};
  const snapshot = metadata.acquisitionSnapshot || {};
  const state = String(snapshot.taskState || snapshot.state || metadata.taskState || metadata.acquisitionTaskState || work.taskState || work.state || "").toLowerCase();
  if (["stopped", "cancelled", "canceled"].includes(state)) return { kind: "idle", label: "任务已停止" };
  if (state === "paused") return { kind: "idle", label: "暂时没有任务" };
  const issue = work.lastError || snapshot.lastError || metadata.error;
  if (issue && isAuthorizationIssue(issue)) return authorizationState(issue);
  if (issue || ["error", "failed", "degraded", "blocked", "retrying"].includes(state)) return { kind: "idle", label: "暂时没有任务" };
  if (["done", "completed", "succeeded"].includes(state)) return { kind: "idle", label: "上次任务已完成" };
  if (["working", "running", "configuring", "starting", "waiting_reply", "accepted"].includes(state)) {
    return { kind: "working", label: "工作中" };
  }
  return { kind: "idle", label: "暂时没有任务" };
}

export function partitionOfficeMessages(messages, work) {
  const history = [], current = [];
  const taskId = work?.metadata?.taskId || work?.taskId;
  const unknown = officeWorkState(work).kind === "unknown";
  for (const message of messages) {
    const sourceTask = message.metadata?.taskId || message.taskId;
    const activity = message.from !== "user" && message.metadata?.source === "agent-activity";
    const previous = activity && (unknown || (sourceTask && taskId && sourceTask !== taskId));
    (previous ? history : current).push(message);
  }
  return { history, current };
}

export function selectOfficeWork(works = [], current = null) {
  const relevant = works.filter(work => DOUYIN_ACQUISITION_ACTIVE_AGENT_IDS.includes(work.agentType) && getMarketplaceAgent(work.agentType));
  const active = relevant.filter(work => officeWorkState(work).kind === "working");
  const attention = relevant.filter(work => officeWorkState(work).kind === "attention");
  const candidates = active.length ? active : attention;
  return candidates.find(work => work.agentType === current)?.agentType
    || candidates.slice().sort((a, b) => (Number(b.startedAt) || 0) - (Number(a.startedAt) || 0))[0]?.agentType
    || null;
}

export function latestOfficeResult(runs = [], agentId = null) {
  return runs.filter(run => (!agentId || run.agentId === agentId) && DOUYIN_ACQUISITION_ACTIVE_AGENT_IDS.includes(run.agentId) && getMarketplaceAgent(run.agentId)
    && run.metadata?.simulated !== true && run.projectId !== "demo-office"
    && ["completed", "partial", "succeeded"].includes(String(run.status || "").toLowerCase())
    && !["运行摘要", "错误", "实时能力"].includes(run.resultType)
    && (run.title || run.summary))
    .sort((a, b) => (Date.parse(b.generatedAt || b.updatedAt) || 0) - (Date.parse(a.generatedAt || a.updatedAt) || 0))[0] || null;
}

export function officeAgentStartLabel(agentId) {
  return {
    "mkt-comment-acquisition": "开始找客户",
    "mkt-find-people": "开始找人",
    "mkt-intent-analyst": "分析候选人",
    "mkt-cold-writer": "准备触达",
    "mkt-dm-inbox": "设置私信接待"
  }[agentId] || "开始使用";
}
