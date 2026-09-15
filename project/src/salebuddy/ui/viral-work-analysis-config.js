import {
  isDouyinWorkUrl as isValidDouyinWorkUrl,
  normalizeDouyinWorkUrl
} from "../bridge/douyin-work-url.js";
import {
  VIRAL_WORK_ANALYSIS_DEFAULT_GOAL,
  VIRAL_WORK_ANALYSIS_PURPOSE,
  VIRAL_WORK_ANALYSIS_TARGET_AUDIENCE
} from "../agents/viral-work-analysis.js";

export const VIRAL_WORK_ANALYSIS_AGENT_ID = "mkt-viral-work-analysis";
export {
  VIRAL_WORK_ANALYSIS_DEFAULT_GOAL,
  VIRAL_WORK_ANALYSIS_PURPOSE,
  VIRAL_WORK_ANALYSIS_TARGET_AUDIENCE
};

function text(value, fallback = "") {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

export function isDouyinWorkUrl(value) {
  return isValidDouyinWorkUrl(value);
}

export function validateViralWorkAnalysisSetup(flow = {}) {
  const workUrl = text(flow.workUrl);
  if (!workUrl) return "请先粘贴一条抖音作品链接";
  if (!isDouyinWorkUrl(workUrl)) return "请输入完整的抖音作品链接（支持 /video/、/note/ 或 jingxuan?modal_id=），暂不支持短链";
  return null;
}

export function buildViralWorkAnalysisTaskPayload(flow = {}) {
  const taskId = text(flow.taskId);
  const taskRunId = text(flow.taskRunId);
  const workUrl = normalizeDouyinWorkUrl(flow.workUrl) || text(flow.workUrl);
  const goal = text(flow.viralWorkGoal, VIRAL_WORK_ANALYSIS_DEFAULT_GOAL);
  const commentLimit = Number(flow.commentLimit) > 0
    ? Math.min(200, Math.floor(Number(flow.commentLimit)))
    : 100;
  const config = {
    sourceScope: { kind: "public_work_link" },
    workUrl,
    analysisKind: "viral_work",
    analysisOnly: true,
    discoveryOnly: true,
    commentLimit,
    fresh: flow.viralWorkFresh === true,
    approvalMode: "manual",
    autoStartCloud: false
  };
  return {
    ...(taskId ? { taskId } : {}),
    ...(taskRunId ? { taskRunId } : {}),
    conversationId: text(flow.conversationId) || `agent-square-${taskId || "viral-work-analysis"}`,
    agentId: VIRAL_WORK_ANALYSIS_AGENT_ID,
    executionAgentId: VIRAL_WORK_ANALYSIS_AGENT_ID,
    goal,
    workUrl,
    config
  };
}

export { text as viralWorkText };
