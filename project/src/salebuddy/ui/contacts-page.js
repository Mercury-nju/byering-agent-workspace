/**
 * ui/contacts-page.js (v3)
 * 通讯录（双栏 master-detail）：
 *   左栏：好友（团队成员，状态与办公室同源）+ 已保存联系人列表
 *   右栏：选中对象的详情——成员：发消息（1:1 私聊）/ 云电脑（工作区文件）/ 配置（档案）。
 */
import { el, openPage } from "./pages.js";
import { clearNavigationRoute, persistNavigationRoute } from "./navigation-routes.js";
import { TEAM_STATE_LABELS, TEAM_STATES } from "../agents/status.js";
import { avatarInitial } from "./agent-drawer.js";
import { createSnapshotScreen, createLiveBadge } from "./cloud-desktop.js";
import { listHiredAgents, getMarketplaceAgent, isMarketplaceAgentAvailable, MARKETPLACE_LATEST_AGENT_IDS } from "../agents/marketplace.js";
import { refreshEmploymentContracts } from "../bridge/employment-client.js";
import { renderAgentProfile } from "./agent-profile.js";
import { openFileCenterPage } from "./file-center.js";
import { prospectStore } from "./prospect-store.js";
import { displayAgentName, displayAgentTitle, projectMessage } from "../brand.js";
import { getWork, listWorks, subscribeWork } from "../agents/work-live.js";
import { createOfficeStatusStore } from "../bridge/office-status.js";
import { officeWorkState } from "./office-workspace-state.js";
import { listAgentActivity, recordAgentActivity } from "../agents/agent-activity-journal.js";
import { grokStateForTeamStatus, mountGrokBotAvatar } from "./grok-bot-avatar.js";
import { createAgentActivityBadge } from "./agent-activity.js";
import { douyinCloudTaskStore, isDouyinCloudProvisioningStatus, isDouyinCloudReadyStatus } from "../agents/douyin-cloud-state.js";
import { CHIEF_AGENT_TYPE, dmPayloadFor, isChiefAgentType } from "../agents/chief-conversation.js";
import { getConversationScenario } from "../agents/conversation-scenarios.js";
import { isAgentActivityMessage, isPrivateConversationMessage, specialistConversationMetadata } from "../agents/direct-message-contract.js";
import { ACQUISITION_TASK_UPDATE_ACTION, acquisitionTaskUpdatePayload } from "./realtime-work.js";
import { listTasks, updateTask } from "../agents/task-store.js";
import { companionPersona } from "../agents/companion.js";
import { appendCompanionCards, mountCompanionStatus, openCompanionPreferences } from "./agent-companion-ui.js";
import { companionRequest, companionCardAction, latestCompanionPhase } from "../bridge/companion-client.js";
import { isStyleMockPreview } from "../bridge/preview-mode.js";
import { isMockRuntime } from "../bridge/runtime-mode.js";
import { createDemoDmGateway } from "../agents/dm-demo-client.js";

export { ACQUISITION_TASK_UPDATE_ACTION, acquisitionTaskUpdatePayload };
export { specialistConversationMetadata };
export const conversationScenarioForAgent = getConversationScenario;

export function sortContactFriendEntries(entries) {
  return [...entries].sort((left, right) => Number(Boolean(right?.available)) - Number(Boolean(left?.available)));
}

export function memberAvatarStateForStatus(status, work = null) {
  if (status?.state === TEAM_STATES.BLOCKED) return "alerting";
  const workStates = [work?.state, work?.runtimeState, work?.taskState, work?.metadata?.taskState]
    .map((value) => String(value || "").toLowerCase());
  if (work?.lastError || workStates.some((value) => ["blocked", "failed", "error"].includes(value))) return "alerting";
  if (status?.state === TEAM_STATES.WORKING || work?.state === "working") return "working";
  return grokStateForTeamStatus(status);
}

export function memberStatusPresentation({ status = { state: TEAM_STATES.IDLE }, work = null, authoritativeWork = null } = {}) {
  const fallbackStatus = { ...(status || {}), state: status?.state || TEAM_STATES.IDLE };
  if (authoritativeWork?.metadata?.officeStatus) {
    const officeState = officeWorkState(authoritativeWork);
    const state = officeState.kind === "attention" ? TEAM_STATES.BLOCKED : officeState.kind;
    const labels = { unknown: "待同步", working: "工作中", blocked: "已掉线", idle: "空闲中" };
    return {
      status: { ...fallbackStatus, state },
      work: authoritativeWork,
      label: labels[state] || "空闲中"
    };
  }

  let state = fallbackStatus.state;
  const workState = String(work?.state || work?.runtimeState || work?.metadata?.taskState || "").toLowerCase();
  if (work?.lastError || ["blocked", "failed", "error"].includes(workState)) state = TEAM_STATES.BLOCKED;
  else if (workState === TEAM_STATES.WORKING) state = TEAM_STATES.WORKING;
  const label = work?.state === "done"
    ? "已完成本阶段"
    : TEAM_STATE_LABELS[state] || "空闲";
  return { status: { ...fallbackStatus, state }, work, label };
}

export function shouldRebuildMemberDetail({ tab = "chat", previousSignature = "", nextSignature = "" } = {}) {
  return tab !== "settings" && previousSignature !== nextSignature;
}

export function memberConversationAvatarStateForStatus(status, work = null) {
  const memberState = memberAvatarStateForStatus(status, work);
  if (memberState === "alerting") return "alerting";
  if (memberState !== "working") return "idle";
  const phase = String(work?.phase || "").toLowerCase();
  if (/写|撰|草拟|话术|write|draft|compose/u.test(phase)) return "writing";
  if (/发|发送|触达|评论|私信|send|outreach/u.test(phase)) return "sending";
  return "thinking";
}

export function conversationModeForAgent(agentType) {
  return isChiefAgentType(agentType) ? "task" : "dm";
}

export function chiefDecisionPresentation(decision = {}) {
  if (decision.responseMode === "risk_card" || decision.riskLevel === "high") return { kind: "risk", tone: "danger" };
  if (decision.responseMode === "recovery_card") return { kind: "recovery", tone: "danger" };
  if (decision.responseMode === "supplement_card" || decision.blockingMissing?.length) return { kind: "supplement", tone: "attention" };
  if (decision.responseMode === "status_card" || decision.intent === "status_query") return { kind: "status", tone: "neutral" };
  if (decision.responseMode === "approval_card") return { kind: "approval", tone: "attention" };
  if (decision.responseMode === "result_card" || decision.intent === "data_query") return { kind: "result", tone: "neutral" };
  return { kind: "text", tone: "neutral" };
}

const CHIEF_RESULT_COUNT_LABELS = Object.freeze({
  candidates: "候选客户",
  candidate: "候选客户",
  leads: "线索",
  lead: "线索",
  qualified: "高意向",
  qualifiedLeads: "高意向线索",
  discovered: "发现",
  captured: "捕获",
  analyzed: "已分析",
  sent: "已发送",
  accepted: "已接收",
  replied: "已回复",
  replies: "回复",
  failed: "失败",
  errors: "错误",
  comments: "评论",
  messages: "消息",
  conversations: "会话",
  signals: "有效信号",
  drafts: "草稿",
  newCandidates: "新增候选",
  duplicates: "重复项",
  likes: "点赞",
  shares: "分享",
  favorites: "收藏",
  totalInteractions: "总互动"
});

const CHIEF_RESULT_METRIC_LABELS = Object.freeze({
  likes: "点赞",
  comments: "评论",
  shares: "分享",
  favorites: "收藏",
  totalInteractions: "总互动",
  engagementRate: "互动率",
  replyRate: "回复率",
  touchRate: "触达率",
  conversionRate: "转化率"
});

function chiefResultCountsText(counts = {}) {
  return Object.entries(counts)
    .slice(0, 6)
    .map(([key, value]) => `${CHIEF_RESULT_COUNT_LABELS[key] || key} ${value}`)
    .join(" · ");
}

function chiefResultMetricsText(metrics = {}) {
  return Object.entries(metrics)
    .slice(0, 4)
    .map(([key, value]) => `${CHIEF_RESULT_METRIC_LABELS[key] || key} ${value}`)
    .join(" · ");
}

function appendChiefResultOverview(card, chiefData = {}) {
  if (!chiefData || !Array.isArray(chiefData.agents)) return;
  card.appendChild(el("div", "sb-chief-result-summary", `${chiefData.agentCount || 0} 个 Agent · ${chiefData.resultCount || 0} 条结果`));
  const rows = el("div", "sb-chief-result-list");
  for (const agent of chiefData.agents.slice(0, 12)) {
    const row = el("div", "sb-chief-result-row");
    const title = el("div", "sb-chief-result-name", `${agent.agentName || "未命名 Agent"} · ${agent.resultCount || 0} 条结果`);
    row.appendChild(title);
    const counts = chiefResultCountsText(agent.counts);
    const metrics = chiefResultMetricsText(agent.metrics);
    const meta = [counts, metrics, agent.itemsCount ? `${agent.itemsCount} 条业务记录` : "", agent.evidenceCount ? `${agent.evidenceCount} 条证据` : ""].filter(Boolean).join(" · ");
    if (meta) row.appendChild(el("div", "sb-chief-result-meta", meta));
    const summary = agent.summaries?.[0];
    if (summary) row.appendChild(el("div", "sb-chief-result-copy", summary));
    if (agent.artifacts?.length) row.appendChild(el("div", "sb-chief-result-artifacts", `产出：${agent.artifacts.slice(0, 3).join("、")}`));
    rows.appendChild(row);
  }
  if (rows.childElementCount) card.appendChild(rows);
}

export function isContactAgentAvailable(agentOrId) {
  const id = typeof agentOrId === "string" ? agentOrId : agentOrId?.id;
  return isChiefAgentType(id) || isMarketplaceAgentAvailable(agentOrId);
}

/** Only active hires are eligible for the internal friends list. */
export function listContactHiredAgents() {
  return listHiredAgents().filter((agent) => isContactAgentAvailable(agent));
}

export const ACQUISITION_MEMBER_IDS = Object.freeze(["mkt-comment-acquisition", "mkt-find-people"]);

export function isAcquisitionMember(agentType) {
  return ACQUISITION_MEMBER_IDS.includes(String(agentType || ""));
}

export function acquisitionContextFor(agentType, { task = null, work = null, fallback = null } = {}) {
  const metadata = work?.metadata || task?.metadata || {};
  const configuration = task?.configuration || work?.configuration || metadata.configuration || {};
  const fallbackContext = fallback && typeof fallback === "object" ? fallback : {};
  return {
    agentId: String(agentType || task?.runtimeAgentId || fallbackContext.agentId || fallbackContext.agentType || ""),
    taskId: task?.taskId || task?.id || work?.taskId || metadata.taskId || fallbackContext.taskId || fallbackContext.task_id || null,
    taskRunId: task?.taskRunId || task?.runtimeTaskRunId || work?.taskRunId || metadata.taskRunId || fallbackContext.taskRunId || fallbackContext.task_run_id || null,
    accountId: task?.accountId || task?.account_id || work?.accountId || metadata.accountId || fallbackContext.accountId || fallbackContext.account_id || null,
    conversationId: task?.conversationId || task?.conversation_id || metadata.conversationId || fallbackContext.conversationId || fallbackContext.conversation_id || null,
    taskVersion: task?.version ?? work?.version ?? metadata.taskVersion ?? fallbackContext.taskVersion ?? null,
    configVersion: configuration.version ?? task?.configVersion ?? work?.configVersion ?? metadata.configVersion ?? fallbackContext.configVersion ?? null
  };
}

function acquisitionTaskField(task, field) {
  return task?.[field]
    ?? task?.context?.[field]
    ?? task?.metadata?.[field]
    ?? null;
}

const ACQUISITION_TASK_STATE_PRIORITY = Object.freeze({
  running: 0,
  configuring: 1,
  degraded: 2,
  paused: 3,
  waiting_reply: 4,
  waiting_approval: 5,
  completed: 6,
  done: 6,
  failed: 7,
  cancelled: 8
});

export function selectAcquisitionConversationTask(tasks = [], { agentType, context = {} } = {}) {
  const requestedAgentId = String(agentType || context.agentId || "").trim();
  const matches = (Array.isArray(tasks) ? tasks : [])
    .filter((task) => !requestedAgentId || String(acquisitionTaskField(task, "agentId") || "").trim() === requestedAgentId)
    .filter((task) => ["taskId", "taskRunId", "conversationId", "accountId"].every((field) => {
      const expected = String(context[field] || "").trim();
      return !expected || String(acquisitionTaskField(task, field) || "").trim() === expected;
    }));
  if (!matches.length) return null;
  return [...matches].sort((left, right) => {
    const leftState = String(acquisitionTaskField(left, "state") || acquisitionTaskField(left, "taskState") || "").toLowerCase();
    const rightState = String(acquisitionTaskField(right, "state") || acquisitionTaskField(right, "taskState") || "").toLowerCase();
    const stateDelta = (ACQUISITION_TASK_STATE_PRIORITY[leftState] ?? 99) - (ACQUISITION_TASK_STATE_PRIORITY[rightState] ?? 99);
    if (stateDelta) return stateDelta;
    const leftUpdatedAt = Date.parse(acquisitionTaskField(left, "updatedAt") || acquisitionTaskField(left, "createdAt") || "") || 0;
    const rightUpdatedAt = Date.parse(acquisitionTaskField(right, "updatedAt") || acquisitionTaskField(right, "createdAt") || "") || 0;
    return rightUpdatedAt - leftUpdatedAt;
  })[0];
}

export function acquisitionActionPayload(agentType, action, context = {}) {
  const payload = { agentId: agentType, action, ...context };
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== null && value !== undefined && value !== ""));
}

function taskForAgent(agentType, owner = {}) {
  const runs = prospectStore.listRuns();
  return runs.find((run) => run.agentId === agentType
    && (!owner.taskId || run.taskId === owner.taskId)
    && (!owner.taskRunId || run.taskRunId === owner.taskRunId)
    && (!owner.accountId || run.accountId === owner.accountId)) || null;
}

export function acquisitionMemberActions() {
  return [{ label: "查看实时工作", action: "realtime", disabled: false }];
}

function conversationMessageKey(message = {}) {
  return message.metadata?.activityKey
    || message.id
    || `${message.from || ""}|${message.text || ""}|${message.createdAt || ""}`;
}

function isActivityMessage(message = {}) {
  return isAgentActivityMessage(message);
}

function isReplayCopy(left = {}, right = {}) {
  if (!left || !right || left.from !== right.from || left.text !== right.text) return false;
  if (!isActivityMessage(left) && !isActivityMessage(right)) return false;
  const leftAt = Date.parse(left.createdAt || "");
  const rightAt = Date.parse(right.createdAt || "");
  return Number.isFinite(leftAt) && Number.isFinite(rightAt) && Math.abs(leftAt - rightAt) <= 5000;
}

export function mergeAgentConversationMessages(remoteMessages = [], localMessages = [], { includeActivity = false } = {}) {
  const merged = [];
  const seen = new Set();
  for (const message of [...(Array.isArray(remoteMessages) ? remoteMessages : []), ...(Array.isArray(localMessages) ? localMessages : [])]) {
    if (!message || typeof message !== "object") continue;
    if (isActivityMessage(message)) {
      if (!includeActivity && message.metadata?.deliverToConversation !== true) continue;
    } else if (!isPrivateConversationMessage(message)) {
      continue;
    }
    const key = conversationMessageKey(message);
    if (seen.has(key)) continue;
    if (merged.some((existing) => isReplayCopy(existing, message))) continue;
    seen.add(key);
    merged.push(message);
  }
  return merged.sort((left, right) => {
    const leftAt = Date.parse(left.createdAt || "");
    const rightAt = Date.parse(right.createdAt || "");
    if (Number.isFinite(leftAt) && Number.isFinite(rightAt) && leftAt !== rightAt) return leftAt - rightAt;
    if (Number.isFinite(leftAt) !== Number.isFinite(rightAt)) return Number.isFinite(leftAt) ? -1 : 1;
    return 0;
  });
}

const CSS = `
.sb-contacts2{display:flex;height:100%;min-height:0}
.sb-contacts-mock-body{display:flex;flex-direction:column;overflow:hidden!important}
.sb-contacts-mock-body>.sb-contacts2{flex:1;min-height:0;height:auto}
.sb-mock-controls{flex:none;display:flex;align-items:center;gap:14px;padding:10px 18px;border-bottom:1px solid rgba(15,15,15,.07);background:#fff;box-shadow:0 2px 12px rgba(31,35,41,.04);z-index:2}
.sb-mock-controls-head{display:flex;align-items:center;gap:8px;flex:none;white-space:nowrap}
.sb-mock-controls-title{font-size:12px;font-weight:700;color:#1F2329}
.sb-mock-controls-badge{font-size:10px;color:#4267A5;background:#EEF4FF;border:1px solid #D9E4F3;border-radius:999px;padding:3px 7px}
.sb-mock-controls-status{font-size:11px;color:#8A8F99;white-space:nowrap}
.sb-mock-controls-actions{display:flex;align-items:center;gap:6px;margin-left:auto;flex:none}
.sb-mock-control{height:28px;border:1px solid #D8E0EA;border-radius:7px;padding:0 9px;background:#fff;color:#4267A5;font:inherit;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;transition:background-color .16s ease,border-color .16s ease,transform .16s ease}
.sb-mock-control:hover{background:#F4F8FF;border-color:#AFC3DF;transform:translateY(-1px)}
.sb-mock-control.is-primary{background:#1F2329;border-color:#1F2329;color:#fff}
.sb-mock-control.is-primary:hover{background:#33373F}
.sb-mock-control.is-playing{background:#EEF4FF;border-color:#9EB8DB;color:#34578F}
.sb-mock-scenario-rail{display:flex;align-items:center;gap:5px;min-width:0;overflow-x:auto;scrollbar-width:none}
.sb-mock-scenario-rail::-webkit-scrollbar{display:none}
.sb-mock-scenario{height:27px;border:1px solid transparent;border-radius:999px;padding:0 8px;background:transparent;color:#68727E;font:inherit;font-size:10.5px;cursor:pointer;white-space:nowrap;transition:background-color .16s ease,color .16s ease,border-color .16s ease}
.sb-mock-scenario:hover{background:#F5F7FA;color:#34578F}
.sb-mock-scenario.is-active{background:#EEF4FF;border-color:#D3E0F2;color:#34578F;font-weight:650}
.sb-mock-showcase{height:100%;overflow-y:auto;padding:22px 28px 30px;background:#FBFCFE;color:#1F2329}
.sb-mock-showcase-header{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;padding:0 0 17px;border-bottom:1px solid rgba(15,15,15,.08)}
.sb-mock-showcase-kicker{font-size:10px;letter-spacing:.08em;color:#4267A5;font-weight:750;text-transform:uppercase}
.sb-mock-showcase-title{margin-top:5px;font-size:20px;line-height:1.35;font-weight:700}
.sb-mock-showcase-copy{margin-top:5px;max-width:660px;font-size:12px;line-height:1.65;color:#77818C}
.sb-mock-showcase-progress{flex:none;display:flex;align-items:center;gap:7px;color:#8A8F99;font-size:11px}
.sb-mock-showcase-progress-dot{width:7px;height:7px;border-radius:50%;background:#3B7BE8;box-shadow:0 0 0 4px rgba(59,123,232,.12);animation:sb-mock-progress-pulse 1.6s ease-in-out infinite}
.sb-mock-showcase-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 28px}
.sb-mock-scene{min-width:0;padding:18px 0 20px;border-bottom:1px solid rgba(15,15,15,.07)}
.sb-mock-scene:nth-last-child(-n+2){border-bottom:0}
.sb-mock-scene-head{display:flex;align-items:center;justify-content:space-between;gap:10px}
.sb-mock-scene-label{display:flex;align-items:center;gap:7px;min-width:0;font-size:13px;font-weight:700}
.sb-mock-scene-index{width:22px;height:22px;display:grid;place-items:center;border-radius:7px;background:#EEF4FF;color:#4267A5;font-size:10px;font-weight:750}
.sb-mock-scene-tone{font-size:10px;color:#8A8F99;white-space:nowrap}
.sb-mock-scene-agent{margin-top:4px;font-size:10.5px;color:#8A8F99}
.sb-mock-scene-preview{display:flex;flex-direction:column;gap:7px;margin-top:12px;min-height:114px}
.sb-mock-mini-message{display:flex;align-items:flex-start;gap:7px;max-width:92%}
.sb-mock-mini-message.is-user{align-self:flex-end;flex-direction:row-reverse}
.sb-mock-mini-avatar{width:22px;height:22px;border-radius:50%;flex:none;background:#3B8EF3;color:#fff;font-size:9px;display:grid;place-items:center;font-weight:700;overflow:hidden}
.sb-mock-mini-avatar.is-user{background:#E7EDF6;color:#6A7480}
.sb-mock-mini-bubble{padding:7px 9px;border:1px solid rgba(15,15,15,.07);border-radius:4px 10px 10px 10px;background:#fff;font-size:11px;line-height:1.55;color:#38404A;white-space:pre-wrap}
.sb-mock-mini-message.is-user .sb-mock-mini-bubble{border-color:transparent;border-radius:10px 4px 10px 10px;background:#EEF4FF}
.sb-mock-mini-meta{font-size:9.5px;color:#8A8F99;line-height:1.4}
.sb-mock-mini-state{display:inline-flex;align-items:center;gap:6px;align-self:flex-start;padding:5px 8px;border-radius:999px;background:#F3F5F8;color:#64707D;font-size:10px}
.sb-mock-mini-state::before{content:"";width:5px;height:5px;border-radius:50%;background:#3B7BE8;animation:sb-mock-progress-pulse 1.6s ease-in-out infinite}
.sb-mock-mini-state.is-success{background:#EFF8F3;color:#317753}.sb-mock-mini-state.is-success::before{background:#4BAA72;animation:none}.sb-mock-mini-state.is-attention{background:#FFF8EA;color:#966514}.sb-mock-mini-state.is-attention::before{background:#E4A23B}.sb-mock-mini-state.is-danger{background:#FFF2EF;color:#99483D}.sb-mock-mini-state.is-danger::before{background:#C86656;animation:none}
.sb-mock-mini-artifact{display:flex;align-items:center;gap:8px;padding:8px 9px;border:1px solid #DCE6F2;border-radius:8px;background:#fff;font-size:10.5px;color:#34578F}
.sb-mock-mini-file{width:25px;height:25px;display:grid;place-items:center;border-radius:6px;background:#EEF4FF;color:#4267A5;font-size:8px;font-weight:750}
.sb-mock-mini-artifact-copy{min-width:0;flex:1}.sb-mock-mini-artifact-copy strong{display:block;font-size:10.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sb-mock-mini-artifact-copy span{display:block;margin-top:2px;color:#8A8F99;font-size:9.5px}
.sb-mock-mini-actions{display:flex;align-items:center;gap:6px;margin-top:auto;padding-top:10px}
.sb-mock-mini-action{height:28px;border:1px solid #D3E0F2;border-radius:7px;padding:0 9px;background:#fff;color:#4267A5;font:inherit;font-size:10px;font-weight:650;cursor:pointer;transition:background-color .16s ease,border-color .16s ease,transform .16s ease}
.sb-mock-mini-action:hover{background:#EEF4FF;border-color:#9EB8DB;transform:translateY(-1px)}
.sb-mock-mini-action.is-primary{background:#1F2329;border-color:#1F2329;color:#fff}.sb-mock-mini-action.is-primary:hover{background:#33373F}
.sb-mock-mini-action.is-done{background:#EFF8F3;border-color:#B9DDC8;color:#317753;cursor:default;transform:none}
.sb-mock-scene.is-thinking .sb-mock-mini-bubble{animation:sb-mock-thinking-breathe 1.9s ease-in-out infinite}
.sb-mock-scene.is-working .sb-mock-mini-state::before{animation-duration:.92s}
@keyframes sb-mock-progress-pulse{0%,100%{opacity:.45;transform:scale(.78)}50%{opacity:1;transform:scale(1.1)}}
@keyframes sb-mock-thinking-breathe{0%,100%{opacity:.78;transform:translateY(0)}50%{opacity:1;transform:translateY(-1px)}}
@media(prefers-reduced-motion:reduce){.sb-mock-progress-dot,.sb-mock-mini-state::before,.sb-mock-scene.is-thinking .sb-mock-mini-bubble{animation:none!important}}
@media(max-width:1120px){.sb-mock-controls{align-items:flex-start;flex-wrap:wrap;gap:8px}.sb-mock-controls-status{order:3;width:100%}.sb-mock-scenario-rail{order:4;width:100%}.sb-mock-controls-actions{margin-left:auto}.sb-mock-showcase-grid{grid-template-columns:minmax(0,1fr)}.sb-mock-scene:nth-last-child(-n+2){border-bottom:1px solid rgba(15,15,15,.07)}.sb-mock-scene:last-child{border-bottom:0}}
@media(max-width:760px){.sb-mock-controls{padding:9px 12px}.sb-mock-showcase{padding:18px 16px 24px}.sb-mock-showcase-header{align-items:flex-start;flex-direction:column;gap:10px}.sb-mock-showcase-title{font-size:18px}}
.sb-clist{width:300px;flex:none;border-right:1px solid rgba(15,15,15,0.06);overflow-y:auto;padding:10px}
.sb-cgroup-title{font-size:11px;font-weight:600;color:#8A8F99;letter-spacing:.4px;padding:10px 8px 6px;display:flex;gap:6px;align-items:baseline}
.sb-cgroup-count{font-weight:400;color:#B0B4BB}
.sb-cgroup-recruit{margin-left:auto;display:inline-flex;align-items:center;gap:4px;border:0;border-radius:7px;padding:4px 7px;background:transparent;color:#3B6BD4;font:inherit;font-size:11px;font-weight:600;cursor:pointer}
.sb-cgroup-recruit:hover{background:rgba(59,107,212,0.08)}
.sb-cgroup-recruit:focus-visible{outline:2px solid rgba(59,107,212,0.35);outline-offset:1px}
.sb-cgroup-recruit svg{width:14px;height:14px;display:block}
.sb-crow{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:10px;cursor:pointer}
.sb-crow:hover{background:rgba(15,15,15,0.04)}
.sb-crow.sb-on{background:rgba(15,15,15,0.06)}
.sb-crow.sb-disabled{filter:grayscale(1);opacity:.48;cursor:default}
.sb-crow.sb-disabled:hover{background:transparent}
.sb-crow.sb-disabled .sb-cdot{background:#B8BEC6;box-shadow:none}
.sb-cavatar{width:36px;height:36px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;color:#fff;background:#5B6B8C;overflow:hidden}
.sb-cavatar.sb-grok-avatar{border-radius:0;overflow:visible;background:transparent!important}
.sb-cavatar.sb-grok-avatar .sb-grok-avatar-svg{display:block;width:100%;height:100%;overflow:visible}
.sb-cavatar.sb-main{background:#1F2329}
.sb-ctext{flex:1;min-width:0}
.sb-cname{font-size:13.5px;font-weight:500;color:#1F2329;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sb-cname-row{flex-wrap:wrap}
.sb-csub{font-size:11.5px;color:#8A8F99;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:flex;align-items:center;gap:4px}
.sb-cdot{width:6px;height:6px;border-radius:50%;background:#57B26A;flex:none}
.sb-cdot.sb-busy{background:#E8A33D}
.sb-cdot.sb-waiting{background:#D45B5B}

.sb-cdetail{flex:1;min-width:0;display:flex;flex-direction:column}
.sb-cplaceholder{flex:1;display:flex;align-items:center;justify-content:center;font-size:13px;color:#B0B4BB}
.sb-chead{flex:none;text-align:center;padding:30px 24px 18px}
.sb-chead-avatar{width:84px;height:84px;border-radius:50%;margin:0 auto 12px;display:flex;align-items:center;justify-content:center;font-size:32px;font-weight:600;color:#fff;background:#5B6B8C;overflow:hidden}
.sb-chead-avatar.sb-grok-avatar,.sb-msg-avatar.sb-grok-avatar{border-radius:0;overflow:visible;background:transparent!important}
.sb-chead-avatar.sb-grok-avatar .sb-grok-avatar-svg,.sb-msg-avatar.sb-grok-avatar .sb-grok-avatar-svg{display:block;width:100%;height:100%;overflow:visible}
.sb-chead-avatar.sb-conversation-avatar .sb-grok-avatar-svg{animation:sb-conversation-avatar-in .34s cubic-bezier(.22,.8,.3,1) both;transform-origin:center}
@keyframes sb-conversation-avatar-in{from{opacity:.7;transform:translateY(4px) scale(.95) rotate(-2deg)}72%{opacity:1;transform:translateY(-1px) scale(1.02) rotate(.8deg)}to{opacity:1;transform:translateY(0) scale(1) rotate(0)}}
.sb-chead-avatar.sb-main{background:#1F2329}
.sb-chead-name{font-size:18px;font-weight:600;color:#1F2329}
.sb-chead-status{font-size:12px;color:#8A8F99;margin-top:6px;display:flex;align-items:center;justify-content:center;gap:6px}
.sb-chead-goal{font-size:12px;color:#5A5E66;margin-top:10px;line-height:1.6;max-width:420px;margin-left:auto;margin-right:auto}
.sb-cactions{flex:none;display:flex;gap:10px;justify-content:center;padding:0 24px 16px}
.sb-caction{appearance:none;display:flex;flex-direction:column;align-items:center;gap:6px;width:104px;padding:12px 0;border:1px solid rgba(15,15,15,0.08);border-radius:12px;background:#fff;cursor:pointer;font:inherit;font-size:12px;color:#1F2329}
.sb-caction:hover{background:#F5F6F8}
.sb-caction.sb-on{border-color:#1F2329}
.sb-caction svg{width:18px;height:18px}
.sb-caction-primary{background:#1F2329;color:#fff;border-color:#1F2329}
.sb-caction-primary:hover{background:#33373F}
.sb-ccontent{flex:1;min-height:0;display:flex;flex-direction:column}
.sb-chead-friend{display:flex;align-items:center;gap:10px;text-align:left;padding:12px 18px 10px}
.sb-chead-friend .sb-chead-avatar{width:44px;height:44px;margin:0;font-size:19px;flex:none}
.sb-chead-text{min-width:0;flex:1}.sb-chead-friend .sb-chead-name{font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sb-chead-friend .sb-chead-status{justify-content:flex-start;margin-top:3px}
.sb-cdetail-topbar{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:12px 18px 10px}
.sb-cdetail-topbar .sb-chead-friend{padding:0;min-width:0;flex:1}
.sb-cdetail-actions{display:flex;align-items:center;justify-content:flex-end;gap:7px;flex:none;min-width:0}
.sb-cactions-friend{justify-content:flex-start;gap:7px;padding:0}
.sb-cactions-friend .sb-caction{flex:0 0 auto;flex-direction:row;gap:6px;width:auto;min-width:0;padding:7px 11px;border-radius:8px}.sb-cactions-friend .sb-caction svg{width:15px;height:15px}

.sb-chat-list2{flex:1;overflow-y:auto;padding:16px 24px;display:flex;flex-direction:column;gap:12px}
.sb-msg{display:flex;gap:10px;align-items:flex-start;transform-origin:50% 100%}
.sb-msg.sb-mine{flex-direction:row-reverse}
.sb-msg-avatar{width:30px;height:30px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;color:#fff;background:#5B6B8C;overflow:hidden}
.sb-msg-avatar.sb-main{background:#1F2329}
.sb-msg-body{max-width:70%}
.sb-msg-name{font-size:12px;color:#8A8F99;margin-bottom:4px}
.sb-msg.sb-mine .sb-msg-name{text-align:right}
.sb-msg-bubble{background:#fff;border:1px solid rgba(15,15,15,0.06);border-radius:4px 12px 12px 12px;padding:10px 14px;font-size:14px;color:#1F2329;line-height:1.65;white-space:pre-wrap;word-break:break-word}
.sb-msg.sb-mine .sb-msg-bubble{background:#EEF4FF;border-color:transparent;border-radius:12px 4px 12px 12px}
.sb-msg.sb-companion-arrive{animation:sb-contact-message-in .34s cubic-bezier(.22,.8,.3,1) both;will-change:transform,opacity}
.sb-msg.sb-companion-arrive .sb-msg-name{animation:sb-contact-meta-in .26s ease-out .04s both;will-change:transform,opacity}
.sb-msg.sb-companion-arrive .sb-msg-bubble{animation:sb-contact-bubble-in .34s cubic-bezier(.22,.8,.3,1) .02s both;transform-origin:inherit;will-change:transform,opacity}
.sb-msg.sb-companion-arrive .sb-msg-avatar{animation:sb-contact-avatar-in .38s cubic-bezier(.22,.8,.3,1) .02s both;will-change:transform,opacity}
@keyframes sb-contact-message-in{from{opacity:0;transform:translateY(8px) scale(.985)}72%{opacity:1;transform:translateY(-1px) scale(1.002)}to{opacity:1;transform:translateY(0) scale(1)}}
@keyframes sb-contact-bubble-in{from{opacity:0;transform:translateY(5px) scale(.975)}70%{opacity:1;transform:translateY(-1px) scale(1.008)}to{opacity:1;transform:translateY(0) scale(1)}}
@keyframes sb-contact-meta-in{from{opacity:0;transform:translateY(3px)}to{opacity:1;transform:translateY(0)}}
@keyframes sb-contact-avatar-in{from{opacity:0;transform:translateY(5px) scale(.9) rotate(-4deg)}72%{opacity:1;transform:translateY(-1px) scale(1.04) rotate(1deg)}to{opacity:1;transform:translateY(0) scale(1) rotate(0)}}
.sb-dm-artifact{width:100%;margin-top:7px;border:1px solid rgba(15,15,15,0.08);border-radius:12px;background:linear-gradient(135deg,#fff 0%,#F8FAFC 100%);padding:11px;text-align:left;font-family:inherit;cursor:pointer;display:flex;align-items:center;gap:10px;transition:border-color .15s ease,transform .15s ease,box-shadow .15s ease}
.sb-dm-artifact:hover{border-color:rgba(59,107,212,0.32);transform:translateY(-1px);box-shadow:0 8px 24px rgba(31,35,41,0.07)}
.sb-dm-fileico{width:36px;height:36px;border-radius:9px;flex:none;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;letter-spacing:.3px;background:rgba(59,107,212,0.1);color:#3B6BD4}
.sb-dm-fileico.sb-sheet{background:rgba(47,125,63,0.11);color:#2F7D3F}
.sb-dm-filebody{display:block;flex:1;min-width:0}
.sb-dm-filename{display:block;font-size:12.5px;font-weight:600;color:#1F2329;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sb-dm-filesummary{display:block;font-size:11px;color:#8A8F99;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sb-dm-filego{flex:none;display:flex;flex-direction:column;align-items:flex-end;gap:4px}
.sb-dm-filestatus{font-size:10px;color:#2F7D3F;background:rgba(87,178,106,0.1);border-radius:999px;padding:2px 7px}
.sb-dm-filelink{font-size:10.5px;color:#3B6BD4;font-weight:600}
.sb-chat-input2{flex:none;display:flex;gap:10px;padding:12px 24px 14px;border-top:1px solid rgba(15,15,15,0.06)}
.sb-chat-input2 textarea{flex:1;resize:none;height:38px;max-height:120px;border:1px solid rgba(15,15,15,0.1);border-radius:10px;padding:9px 12px;font-size:13px;font-family:inherit;color:#1F2329;outline:none;background:#fff;transition:border-color .18s ease,box-shadow .18s ease,transform .18s cubic-bezier(.22,.8,.3,1)}
.sb-chat-input2 textarea:focus{border-color:#3B6BD4;box-shadow:0 0 0 3px rgba(59,107,212,.1);transform:translateY(-1px)}
.sb-chat-send2{border:none;background:#1F2329;color:#fff;font-size:13px;padding:0 16px;border-radius:10px;cursor:pointer;height:38px;transition:background-color .16s ease,box-shadow .16s ease,transform .16s cubic-bezier(.22,.8,.3,1)}
.sb-chat-send2:disabled{background:#C4C8CE;cursor:default}
.sb-chat-send2:not(:disabled):hover{background:#30353D;box-shadow:0 6px 16px rgba(31,35,41,.12);transform:translateY(-1px)}
.sb-chat-send2:not(:disabled):active{box-shadow:none;transform:translateY(1px) scale(.97)}
.sb-chat-connection{flex:none;min-height:0;padding:0 24px;color:#8A929B;font-size:12px;line-height:1.5;overflow:hidden;transition:color .18s ease,opacity .18s ease,padding .18s ease}
.sb-chat-connection:empty{display:none}
.sb-chat-connection[data-state="error"]{color:#B04A4A}
.sb-chat-send2[aria-busy="true"]{position:relative;color:transparent;pointer-events:none}
.sb-chat-send2[aria-busy="true"]::after{content:"";position:absolute;width:13px;height:13px;border:2px solid rgba(255,255,255,.45);border-top-color:#fff;border-radius:50%;animation:sb-chat-spin .7s linear infinite}
@keyframes sb-chat-spin{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){.sb-chead-avatar.sb-conversation-avatar .sb-grok-avatar-svg,.sb-msg.sb-companion-arrive,.sb-msg.sb-companion-arrive .sb-msg-name,.sb-msg.sb-companion-arrive .sb-msg-bubble,.sb-msg.sb-companion-arrive .sb-msg-avatar{animation:none!important;will-change:auto}.sb-chat-connection{transition:none}.sb-chat-input2 textarea,.sb-chat-send2{transition:none}.sb-chat-send2[aria-busy="true"]::after{animation:none}}
.sb-proactive{flex:none;display:flex;flex-direction:column;gap:8px;color:#3F4D5D}
.sb-proactive-message{background:#fff!important;border-color:rgba(15,15,15,.06)!important;border-radius:4px 12px 12px 12px!important;padding:11px 14px 12px!important}
.sb-proactive-message-title{font-size:13px;font-weight:650;line-height:1.5}
.sb-proactive-message-body{margin-top:4px;color:#59636D;font-size:12px;line-height:1.65}
.sb-proactive-message-meta{margin-top:7px;color:#7C8791;font-size:10.5px;line-height:1.5}
.sb-proactive-actions{display:flex;flex-wrap:wrap;gap:7px;margin:0 0 2px 40px}
.sb-proactive-action{height:30px;border:1px solid #D7E1EE;border-radius:8px;padding:0 11px;background:#fff;color:#4267A5;font:inherit;font-size:11px;cursor:pointer;transition:background-color .15s ease,border-color .15s ease,transform .15s ease}
.sb-proactive-action:hover{border-color:#9EB8DB;background:#F4F8FF;transform:translateY(-1px)}
.sb-proactive-action.primary{border-color:#1F2329;background:#1F2329;color:#fff}
.sb-proactive-action.primary:hover{background:#33373F}
@media(max-width:760px){.sb-cdetail-topbar{align-items:flex-start;flex-direction:column;gap:8px}.sb-cdetail-actions{width:100%;justify-content:flex-start;flex-wrap:wrap}.sb-cdetail-topbar .sb-chead-friend{width:100%}}

.sb-pane{flex:1;overflow-y:auto;padding:18px 28px}
.sb-pane-title{font-size:12px;font-weight:600;color:#8A8F99;letter-spacing:.4px;margin:14px 0 8px}
.sb-pane-title:first-child{margin-top:0}
.sb-file-row{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;font-size:13px;color:#1F2329;background:#fff;border:1px solid rgba(15,15,15,0.05);margin-bottom:6px}
.sb-file-size{margin-left:auto;flex:none;font-size:11px;color:#B0B4BB}
.sb-pane-empty{font-size:12px;color:#B0B4BB;padding:6px 2px}
.sb-kv{display:flex;font-size:13px;color:#1F2329;padding:5px 0;gap:12px}
.sb-kv b{font-weight:500;color:#5A5E66;flex:none;width:72px}
.sb-tag{display:inline-block;font-size:11px;padding:2px 8px;margin:2px 4px 2px 0;border-radius:8px;background:rgba(15,15,15,0.05);color:#5A5E66}
.sb-pane-path{font-size:11px;color:#B0B4BB;margin-bottom:4px;word-break:break-all}
.sb-chief-card{margin-top:9px;padding:11px 12px;border:1px solid rgba(31,35,41,.09);border-radius:8px;background:#F7F8FA}
.sb-chief-card.is-attention{border-color:rgba(190,126,30,.22);background:#FFF9EE}.sb-chief-card.is-danger{border-color:rgba(194,64,64,.22);background:#FFF5F5}
.sb-chief-card-title{font-size:12px;font-weight:700;color:#1F2329}.sb-chief-card-copy{margin-top:5px;font-size:11.5px;line-height:1.6;color:#596270}.sb-chief-card-meta{margin-top:7px;font-size:10.5px;color:#8A8F99}.sb-chief-result-summary{margin-top:7px;font-size:11px;color:#4267A5;font-weight:650}.sb-chief-result-list{margin-top:8px;display:flex;flex-direction:column;gap:7px}.sb-chief-result-row{padding-top:7px;border-top:1px solid rgba(31,35,41,.08)}.sb-chief-result-row:first-child{padding-top:0;border-top:0}.sb-chief-result-name{font-size:11.5px;line-height:1.45;color:#1F2329;font-weight:650}.sb-chief-result-meta,.sb-chief-result-artifacts{margin-top:3px;font-size:10.5px;line-height:1.45;color:#7A8491}.sb-chief-result-copy{margin-top:3px;font-size:10.5px;line-height:1.5;color:#596270}
`;

let styleInjected = false;
function ensureStyle() {
  if (styleInjected) return;
  const tag = document.createElement("style");
  tag.textContent = CSS;
  document.head.appendChild(tag);
  styleInjected = true;
}

const ICONS = {
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-4.5-7.8L21 3l-.8 3.6A8.9 8.9 0 0 1 21 12z"/><path d="M8 10h8M8 14h5"/></svg>',
  recruit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3"/><path d="M3.5 19c.7-3 2.5-4.5 5.5-4.5s4.8 1.5 5.5 4.5M18 8v6M15 11h6"/></svg>',
  cloud: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M9 20h6M12 16v4"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1"/></svg>',
  enter: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  data: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 16v-4M12 16V8M17 16v-7"/></svg>',
  files: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h4l2 2h5A2.5 2.5 0 0 1 20 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5z"/><path d="M4.5 9h15"/></svg>'
};

const PROACTIVE_GUIDANCE = Object.freeze({
  main: {
    idle: "我可以查看全体 Agent 的工作状态、已有任务和成果数据，并引导你前往对应 Agent。",
    actions: [["查看任务总览", "showStatus", true], ["查看实时工作", "realtime"], ["查看成果中心", "prospects"]]
  },
  "Strategy Agent": {
    idle: "我可以把你的业务目标整理成客户画像、来源范围和筛选规则。",
    actions: [["制定找人策略", "realtime", true], ["查看目标线索", "prospects"], ["打开我的配置", "settings"]]
  },
  "mkt-comment-acquisition": {
    idle: "我会读取已授权账号的评论、直播和互动，筛出值得跟进的潜客，并把证据和下一步建议发给你。",
    actions: [["查看实时工作", "realtime", true], ["查看成果中心", "prospects"]]
  },
  "mkt-find-people": {
    idle: "我会从评论、直播和互动中发现潜客，保留原始来源，再交给后续 Agent 判断意向。",
    actions: [["查看实时工作", "realtime", true], ["查看成果中心", "prospects"]]
  },
  "Browser Agent": {
    idle: "我可以从公开视频、评论、粉丝和直播互动里发现潜在客户，并保留原始来源。",
    actions: [["开始发现潜客", "realtime", true], ["打开云电脑", "cloud"], ["查看成果中心", "prospects"]]
  },
  "Search Agent": {
    idle: "我可以合并重复账号、核验来源，并按购买意向给线索分层。",
    actions: [["分析现有线索", "realtime", true], ["查看评分结果", "prospects"], ["打开我的配置", "settings"]]
  },
  "Research Agent": {
    idle: "我可以补全客户主页、作品和互动信号，生成可交接的客户简报。",
    actions: [["补全客户画像", "realtime", true], ["查看成果中心", "prospects"], ["打开我的配置", "settings"]]
  },
  "App Agent": {
    idle: "我可以根据客户证据生成首轮触达策略，区分价格、车型、置换和到店场景。",
    actions: [["生成触达策略", "realtime", true], ["查看待触达客户", "prospects"], ["打开我的配置", "settings"]]
  },
  "Risk Agent": {
    idle: "我可以检查重复触达、冷却期、账号权限和勿扰状态，给出放行或拦截理由。",
    actions: [["检查触达风险", "realtime", true], ["查看触达记录", "prospects"], ["打开我的配置", "settings"]]
  },
  "Outreach Agent": {
    idle: "我可以执行已批准的私信和评论动作，并逐条记录送达结果和失败原因。",
    actions: [["准备触达批次", "realtime", true], ["打开云电脑", "cloud"], ["打开我的配置", "settings"]]
  },
  "Outreach Ops Agent": {
    idle: "我可以管理发送队列、处理失败重试，并监听回复后停止后续计划。",
    actions: [["查看触达队列", "realtime", true], ["查看触达结果", "prospects"], ["打开我的配置", "settings"]]
  },
  "File Agent": {
    idle: "我可以把真实客户证据整理成首触话术、项目简报和可交付文件。",
    actions: [["整理内容产出", "realtime", true], ["查看项目文件", "prospects"], ["打开我的配置", "settings"]]
  }
});

export const CONTACTS_MOCK_SCENARIOS = Object.freeze([
  { id: "welcome", label: "首次进入", agentType: "mkt-comment-acquisition", kind: "message", tone: "neutral", title: "我在，可以开始了", user: "", agent: "告诉我目标、账号或想看的结果，我会先确认范围。", action: "查看实时工作" },
  { id: "question", label: "用户提问", agentType: "mkt-comment-acquisition", kind: "message", tone: "user", title: "用户侧提问", user: "为什么转化率还有损耗？", agent: "我会回看获客、分析和触达链路，把损耗定位到具体环节。", action: "发送示例" },
  { id: "thinking", label: "理解中", agentType: "main", kind: "thinking", tone: "thinking", title: "正在理解请求", user: "帮我看一下今天的全局进展。", agent: "我正在整理任务、证据和需要你决定的部分。", action: "模拟回复" },
  { id: "working", label: "执行中", agentType: "mkt-find-people", kind: "working", tone: "working", title: "正在执行任务", user: "从评论、直播和互动里找潜客。", agent: "正在读取互动，保留原话、来源和时间。", action: "查看实时工作" },
  { id: "artifact", label: "产出交付", agentType: "mkt-intent-analyst", kind: "artifact", tone: "success", title: "结果已经交付", user: "把分析结果整理成可回溯的名单。", agent: "报告已完成，A 级名单和每条证据都已写入文件中心。", action: "查看产出" },
  { id: "approval", label: "待确认", agentType: "mkt-cold-writer", kind: "approval", tone: "attention", title: "发送前确认", user: "先发 4 位高意向客户。", agent: "文案和账号已经准备好，发送前需要你确认。", action: "确认发送" },
  { id: "applied", label: "已生效", agentType: "mkt-comment-acquisition", kind: "applied", tone: "success", title: "配置已生效", user: "可以，立即生效。", agent: "后续会优先处理价格和到店信号，首轮最多处理 8 位用户。", action: "继续安排" },
  { id: "error", label: "异常恢复", agentType: "mkt-dm-inbox", kind: "error", tone: "danger", title: "这次没有完成", user: "继续处理昨天未完成的会话。", agent: "连接中断，原消息和任务上下文已保留，可以重试。", action: "重试" },
  { id: "cloud", label: "云电脑", agentType: "mkt-dm-inbox", kind: "cloud", tone: "cloud", title: "云电脑状态", user: "打开当前账号的云电脑。", agent: "云电脑正在运行，私信承接会在后台持续处理。", action: "查看当前进展" },
  { id: "settings", label: "配置入口", agentType: "mkt-comment-acquisition", kind: "settings", tone: "neutral", title: "进入 Agent 配置", user: "我想调整触达规则。", agent: "配置入口保持在顶部，不把设置塞进聊天气泡。", action: "打开配置" }
]);

const CONTACTS_MOCK_SCENARIO_MAP = new Map(CONTACTS_MOCK_SCENARIOS.map((scenario) => [scenario.id, scenario]));

function dotClass(state) {
  if (state === TEAM_STATES.WORKING) return "sb-busy";
  if (state === TEAM_STATES.BLOCKED) return "sb-waiting";
  return "";
}

function fmtSize(bytes) {
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

/**
 * 打开通讯录页。
 * deps: { teamLive, gateway, onRecruit, onClose, initialFriend }
 * initialFriend：打开后自动选中该成员并进入私聊（agentType）。
 */
export async function openContactsPage({ teamLive, gateway, onRecruit, onClose, initialFriend = null, initialConversationContext = null }) {
  persistNavigationRoute("contacts");
  ensureStyle();
  const mockPreview = isStyleMockPreview();
  const mockContacts = mockPreview
    || document.documentElement?.dataset?.byeringRuntimeMode === "mock"
    || isMockRuntime(globalThis.location?.search, { envMock: globalThis.__SALEBUDDY_CONFIG__?.runtimeMode === "mock" });
  const demoGateway = mockContacts ? createDemoDmGateway() : null;
  gateway = demoGateway || (gateway?.action ? gateway : null);
  const page = openPage({
    title: "成员",
    onClose: () => {
      clearNavigationRoute("contacts");
      onClose?.();
    }
  });
  // The contacts workspace already provides its own master-detail context;
  // remove the generic page header so the member list starts at the top edge.
  page.root.querySelector(".sb-page-head")?.remove();
  const root = el("div", "sb-contacts2");
  const listCol = el("div", "sb-clist");
  const detailCol = el("div", "sb-cdetail");
  root.append(listCol, detailCol);
  if (mockContacts) page.body.classList.add("sb-contacts-mock-body");
  page.body.appendChild(root);

  const state = {
    selected: null,        // { kind: "friend"|"prospect", id }
    tab: "chat",           // chat | cloud | settings
    dmLastId: null,
    proactiveEl: null,
    memberRosterSignature: "",
    conversationAvatarUpdate: null,
    friendStatusUpdate: null,
    conversationAvatarTimer: null,
    conversationAvatarTransientUntil: 0,
    mockScenarioId: "all",
    mockShowcaseOpen: mockPreview,
    mockActionState: new Map()
  };
  const contactHiredAgents = () => {
    const hired = listContactHiredAgents();
    if (!mockContacts) return hired;
    const hiredById = new Map(hired.map((agent) => [agent.id, agent]));
    return MARKETPLACE_LATEST_AGENT_IDS
      .map((agentId) => hiredById.get(agentId) || getMarketplaceAgent(agentId))
      .filter(Boolean);
  };
  let dmPollTimer = null;
  let disposeCompanion = () => {};
  let disposed = false;
  let mockPlaybackTimer = null;
  const cloudNoticeInFlight = new Set();
  const DOUYIN_AGENT_IDS = new Set(["mkt-dm-inbox", "mkt-gold-customer-service", "mkt-cold-writer"]);
  const officeStatusStore = createOfficeStatusStore({
    getLocalWorks: listWorks,
    getAgentIds: () => contactHiredAgents().map(({ id }) => id)
  });

  const mockControls = mockPreview ? buildMockControls() : null;
  if (mockControls) page.body.prepend(mockControls);
  updateMockControls();

  function memberPresentationFor(agentType) {
    const status = teamLive?.getStatusOf?.(agentType) || { agentType, state: TEAM_STATES.IDLE };
    const work = getWork(agentType);
    const officeAgentIds = new Set(contactHiredAgents().map(({ id }) => id));
    const authoritativeWork = officeAgentIds.has(agentType) ? officeStatusStore.getWork(agentType) : null;
    return memberStatusPresentation({ status, work, authoritativeWork });
  }

  function memberStatusFor(agentType) {
    return memberPresentationFor(agentType).status;
  }

  if (!mockContacts) {
    try {
      await refreshEmploymentContracts();
    } catch {
      // The last in-memory projection remains usable while the control plane reconnects.
    }
  }

  function currentMemberRosterSignature() {
    const profiles = teamLive?.getProfiles?.() || new Map();
    const hired = contactHiredAgents();
    return JSON.stringify({
      profiles: [...profiles.keys()].filter((agentType) => isChiefAgentType(agentType)).sort(),
      hired: hired.map(({ id }) => id).sort()
    });
  }

  function refreshMemberRows() {
    if (disposed) return;
    for (const row of listCol.querySelectorAll("[data-sb-contact-agent]")) {
      const agentType = row.dataset.sbContactAgent;
      const presentation = memberPresentationFor(agentType);
      const { status, work } = presentation;
      const profile = profileOf(agentType);
      const agentName = profile.identity?.name || agentType;
      const implemented = row.dataset.sbContactImplemented === "true";
      const avatar = row.querySelector(".sb-cavatar");
      const name = row.querySelector(".sb-cname");
      const dot = row.querySelector(".sb-cdot");
      const statusText = row.querySelector(".sb-cstatus-text");
      const isWorking = status.state === TEAM_STATES.WORKING || work?.state === "working";
      const nameRow = row.querySelector(".sb-cname-row");
      const activity = nameRow?.querySelector(".sb-agent-activity");
      if (avatar) {
        mountGrokBotAvatar(avatar, agentType, {
          alt: agentName,
          state: memberAvatarStateForStatus(status, work),
          trackPointer: false,
          mode: "members"
        });
      }
      if (name) name.textContent = agentName;
      if (dot) dot.className = `sb-cdot ${dotClass(status.state)}`;
      if (statusText) statusText.textContent = implemented
        ? presentation.label
        : "暂未开放";
      if (isWorking && nameRow && !activity) {
        const nextActivity = createAgentActivityBadge(agentType, { status, work });
        if (nextActivity) nameRow.appendChild(nextActivity);
      } else if (!isWorking && activity) {
        activity.remove();
      }
    }
  }

  function refreshMembersFromLive() {
    const signature = currentMemberRosterSignature();
    if (signature !== state.memberRosterSignature) {
      renderList();
      return;
    }
    refreshMemberRows();
  }

  function profileOf(agentType) {
    const profile = teamLive?.getProfiles?.().get(agentType);
    const market = getMarketplaceAgent(agentType);
    if (market) {
      return {
        ...(profile || {}),
        identity: {
          ...(profile?.identity || {}),
          name: market?.displayName || market?.name || agentType,
          title: market?.displayTitle || market?.title || market?.displayName || market?.name || agentType
        },
        role: profile?.role || { reportsTo: "main", responsibilities: market.skills },
        permission: profile?.permission || { approvalRequired: [], forbidden: [] }
      };
    }
    if (profile) {
      return {
        ...profile,
        identity: {
          ...(profile.identity || {}),
          name: displayAgentName({ agentType, identity: profile.identity }),
          title: displayAgentTitle({ agentType, identity: profile.identity, role: profile.role })
        }
      };
    }
    return { identity: { name: displayAgentName({ agentType }), title: displayAgentTitle({ agentType }) } };
  }

  function mockScenarioFor(id) {
    return CONTACTS_MOCK_SCENARIO_MAP.get(id) || CONTACTS_MOCK_SCENARIOS[0];
  }

  function updateMockControls() {
    if (!mockControls) return;
    const current = mockScenarioFor(state.mockScenarioId);
    const status = mockControls.querySelector("[data-sb-mock-status]");
    const all = mockControls.querySelector('[data-sb-mock-action="all"]');
    const play = mockControls.querySelector('[data-sb-mock-action="play"]');
    if (status) {
      const currentLabel = state.mockScenarioId === "all" ? "真实对话" : current.label;
      status.textContent = state.mockShowcaseOpen ? "已展开全部交互状态" : `当前：${currentLabel}`;
    }
    if (all) all.classList.toggle("is-primary", state.mockShowcaseOpen);
    if (play) {
      play.classList.toggle("is-playing", Boolean(mockPlaybackTimer));
      play.textContent = mockPlaybackTimer ? "停止播放" : "自动播放";
    }
    for (const button of mockControls.querySelectorAll("[data-sb-mock-scenario]")) {
      button.classList.toggle("is-active", button.dataset.sbMockScenario === state.mockScenarioId && !state.mockShowcaseOpen);
    }
  }

  function buildMockControls() {
    const controls = el("section", "sb-mock-controls");
    controls.dataset.sbMockControls = "true";
    const head = el("div", "sb-mock-controls-head");
    head.append(el("span", "sb-mock-controls-title", "交互演示"), el("span", "sb-mock-controls-badge", "MOCK"));
    controls.appendChild(head);
    controls.appendChild(el("span", "sb-mock-controls-status", "已展开全部交互状态"));
    controls.lastChild.dataset.sbMockStatus = "true";
    const rail = el("div", "sb-mock-scenario-rail");
    for (const scenario of CONTACTS_MOCK_SCENARIOS) {
      const button = el("button", "sb-mock-scenario", scenario.label);
      button.type = "button";
      button.dataset.sbMockScenario = scenario.id;
      button.addEventListener("click", () => applyMockScenario(scenario.id));
      rail.appendChild(button);
    }
    controls.appendChild(rail);
    const actions = el("div", "sb-mock-controls-actions");
    const all = el("button", "sb-mock-control is-primary", "全部场景");
    all.type = "button";
    all.dataset.sbMockAction = "all";
    all.addEventListener("click", () => applyMockScenario("all"));
    const play = el("button", "sb-mock-control", "自动播放");
    play.type = "button";
    play.dataset.sbMockAction = "play";
    play.addEventListener("click", toggleMockPlayback);
    actions.append(all, play);
    controls.appendChild(actions);
    return controls;
  }

  function mockMiniMessage(scenario, { user = false, text = "" } = {}) {
    const row = el("div", `sb-mock-mini-message${user ? " is-user" : ""}`);
    if (!user) row.appendChild(el("div", "sb-mock-mini-avatar", avatarInitial(scenario.agentType)));
    const body = el("div");
    body.appendChild(el("div", "sb-mock-mini-meta", user ? "我" : displayAgentName({ id: scenario.agentType })));
    body.appendChild(el("div", "sb-mock-mini-bubble", text));
    row.appendChild(body);
    return row;
  }

  function mockSceneAction(scene, scenario, nextText, { secondary = false } = {}) {
    const action = el("button", `sb-mock-mini-action${secondary ? "" : " is-primary"}`, nextText);
    action.type = "button";
    const actionState = state.mockActionState.get(scenario.id);
    if (actionState) {
      action.textContent = actionState;
      action.classList.add("is-done");
      action.disabled = true;
    }
    action.addEventListener("click", () => {
      if (action.disabled) return;
      state.mockActionState.set(scenario.id, secondary ? "已保留待确认" : "已触发");
      scene.querySelectorAll(".sb-mock-mini-action").forEach((button) => {
        button.disabled = true;
        button.classList.add("is-done");
      });
      action.textContent = secondary ? "已保留待确认" : scenario.id === "error" ? "已发起重试" : "已触发";
      const feedback = scene.querySelector("[data-sb-mock-feedback]") || el("div", "sb-mock-mini-state is-success");
      feedback.dataset.sbMockFeedback = "true";
      feedback.textContent = action.textContent;
      scene.querySelector(".sb-mock-scene-preview")?.appendChild(feedback);
    });
    return action;
  }

  function renderMockScene(scenario, index) {
    const scene = el("article", `sb-mock-scene is-${scenario.tone}`);
    scene.dataset.sbMockScene = scenario.id;
    if (state.mockScenarioId === scenario.id) scene.dataset.active = "true";
    const head = el("div", "sb-mock-scene-head");
    const label = el("div", "sb-mock-scene-label");
    label.append(el("span", "sb-mock-scene-index", String(index + 1).padStart(2, "0")), el("span", null, scenario.label));
    head.appendChild(label);
    head.appendChild(el("span", "sb-mock-scene-tone", scenario.kind === "message" ? "聊天消息" : scenario.kind === "cloud" ? "系统状态" : "交互状态"));
    scene.append(head, el("div", "sb-mock-scene-agent", displayAgentName({ id: scenario.agentType })));
    const preview = el("div", "sb-mock-scene-preview");
    if (scenario.user) preview.appendChild(mockMiniMessage(scenario, { user: true, text: scenario.user }));
    if (scenario.kind === "thinking") {
      preview.appendChild(el("div", "sb-mock-mini-state", "想一想…"));
      preview.appendChild(mockMiniMessage(scenario, { text: scenario.agent }));
    } else {
      preview.appendChild(mockMiniMessage(scenario, { text: scenario.agent }));
    }
    if (scenario.kind === "working") preview.appendChild(el("div", "sb-mock-mini-state", "理解中…"));
    if (scenario.kind === "approval") preview.appendChild(el("div", "sb-mock-mini-state is-attention", "等待你的确认"));
    if (scenario.kind === "applied") preview.appendChild(el("div", "sb-mock-mini-state is-success", "配置已生效"));
    if (scenario.kind === "error") preview.appendChild(el("div", "sb-mock-mini-state is-danger", "需要重试"));
    if (scenario.kind === "cloud") preview.appendChild(el("div", "sb-mock-mini-state", "后台运行中"));
    if (scenario.kind === "artifact") {
      const artifact = el("div", "sb-mock-mini-artifact");
      artifact.appendChild(el("span", "sb-mock-mini-file", "HTML"));
      const copy = el("span", "sb-mock-mini-artifact-copy");
      copy.append(el("strong", null, "潜客意向分析报告.html"), el("span", null, "9 位 A 级潜客 · 已完成"));
      artifact.appendChild(copy);
      preview.appendChild(artifact);
    }
    scene.appendChild(preview);
    const actions = el("div", "sb-mock-mini-actions");
    if (scenario.kind === "approval") {
      actions.append(mockSceneAction(scene, scenario, "确认发送"), mockSceneAction(scene, scenario, "稍后处理", { secondary: true }));
    } else {
      actions.appendChild(mockSceneAction(scene, scenario, scenario.action));
    }
    scene.appendChild(actions);
    return scene;
  }

  function renderMockShowcase(container) {
    stopDmPoll();
    stopCloudFeed();
    container.textContent = "";
    const showcase = el("section", "sb-mock-showcase");
    showcase.setAttribute("aria-label", "全部对话交互场景");
    const header = el("header", "sb-mock-showcase-header");
    const copy = el("div");
    copy.append(el("div", "sb-mock-showcase-kicker", "Conversation states"), el("div", "sb-mock-showcase-title", "全部对话交互场景"), el("div", "sb-mock-showcase-copy", "覆盖首次进入、用户提问、Agent 理解与执行、结果交付、人工确认、配置生效、异常恢复和云电脑状态。点击任意按钮查看它的即时反馈。"));
    const progress = el("div", "sb-mock-showcase-progress");
    progress.append(el("span", "sb-mock-showcase-progress-dot"), el("span", null, `${CONTACTS_MOCK_SCENARIOS.length} 个场景`));
    header.append(copy, progress);
    showcase.appendChild(header);
    const grid = el("div", "sb-mock-showcase-grid");
    CONTACTS_MOCK_SCENARIOS.forEach((scenario, index) => grid.appendChild(renderMockScene(scenario, index)));
    showcase.appendChild(grid);
    container.appendChild(showcase);
    updateMockControls();
  }

  function applyMockScenario(id) {
    if (id === "all") {
      state.mockScenarioId = "all";
      state.mockShowcaseOpen = true;
      state.tab = "chat";
      renderDetail();
      updateMockControls();
      return;
    }
    const scenario = mockScenarioFor(id);
    state.mockScenarioId = scenario.id;
    state.mockShowcaseOpen = false;
    state.selected = { kind: "friend", id: scenario.agentType };
    state.tab = scenario.kind === "cloud" ? "cloud" : scenario.kind === "settings" ? "settings" : "chat";
    renderList();
    renderDetail();
    updateMockControls();
  }

  function toggleMockPlayback() {
    if (mockPlaybackTimer) {
      window.clearInterval(mockPlaybackTimer);
      mockPlaybackTimer = null;
      updateMockControls();
      return;
    }
    state.mockShowcaseOpen = true;
    let index = 0;
    const playNext = () => {
      const scenario = CONTACTS_MOCK_SCENARIOS[index % CONTACTS_MOCK_SCENARIOS.length];
      index += 1;
      state.mockScenarioId = scenario.id;
      renderDetail();
      updateMockControls();
    };
    playNext();
    mockPlaybackTimer = window.setInterval(playNext, 2200);
    updateMockControls();
  }

  // ── 左栏 ──
  function renderList() {
    if (disposed) return;
    listCol.textContent = "";
    // 好友
    const profiles = teamLive?.getProfiles?.() || new Map();
    const hired = contactHiredAgents();
    const hiredIds = new Set(hired.map(({ id }) => id));
    const visibleProfiles = [...profiles.entries()].filter(([agentType]) => isChiefAgentType(agentType) && !hiredIds.has(agentType));
    if (mockContacts && !hiredIds.has("main") && !visibleProfiles.some(([agentType]) => agentType === "main")) {
      visibleProfiles.unshift(["main", null]);
    }
    const friendTitle = el("div", "sb-cgroup-title", "好友");
    friendTitle.appendChild(el("span", "sb-cgroup-count", `${visibleProfiles.length + hired.length}`));
    const recruitButton = el("button", "sb-cgroup-recruit");
    recruitButton.type = "button";
    recruitButton.setAttribute("aria-label", "招募成员");
    recruitButton.innerHTML = `${ICONS.recruit}<span>招募</span>`;
    recruitButton.addEventListener("click", (event) => {
      event.stopPropagation();
      onRecruit?.();
    });
    friendTitle.appendChild(recruitButton);
    listCol.appendChild(friendTitle);
    const appendProfileFriend = (agentType) => {
      const profile = profileOf(agentType);
      const presentation = memberPresentationFor(agentType);
      const { status, work } = presentation;
      const implemented = isContactAgentAvailable(agentType);
      const row = el("div", `sb-crow${state.selected?.kind === "friend" && state.selected.id === agentType ? " sb-on" : ""}${implemented ? "" : " sb-disabled"}`);
      row.dataset.sbContactAgent = agentType;
      row.dataset.sbContactImplemented = String(implemented);
      if (!implemented) row.setAttribute("aria-disabled", "true");
      const avatar = el("div", `sb-cavatar${agentType === "main" ? " sb-main" : ""}`, avatarInitial(profile.identity?.name));
      mountGrokBotAvatar(avatar, agentType, {
        alt: profile.identity?.name || agentType,
        state: memberAvatarStateForStatus(status, work),
        trackPointer: false,
        mode: "members"
      });
      row.appendChild(avatar);
      const text = el("div", "sb-ctext");
      const nameRow = el("div", "sb-cname-row");
      nameRow.appendChild(el("div", "sb-cname", profile.identity?.name || agentType));
      const activity = createAgentActivityBadge(agentType, { status, work });
      if (activity) nameRow.appendChild(activity);
      text.appendChild(nameRow);
      const sub = el("div", "sb-csub");
      sub.append(el("span", `sb-cdot ${dotClass(status.state)}`), el("span", "sb-cstatus-text", implemented ? presentation.label : "暂未开放"));
      text.appendChild(sub);
      row.appendChild(text);
      if (implemented) row.addEventListener("click", () => select({ kind: "friend", id: agentType }));
      listCol.appendChild(row);
    };
    const appendHiredFriend = (agent) => {
      const profile = profileOf(agent.id);
      const agentName = profile.identity?.name || agent.id;
      const implemented = isContactAgentAvailable(agent);
      const presentation = memberPresentationFor(agent.id);
      const { status, work } = presentation;
      const row = el("div", `sb-crow${state.selected?.kind === "friend" && state.selected.id === agent.id ? " sb-on" : ""}${implemented ? "" : " sb-disabled"}`);
      row.dataset.sbContactAgent = agent.id;
      row.dataset.sbContactImplemented = String(implemented);
      if (!implemented) row.setAttribute("aria-disabled", "true");
      const ava = el("div", "sb-cavatar", avatarInitial(agentName));
      ava.style.background = agent.color;
      mountGrokBotAvatar(ava, agent.id, {
        alt: agentName,
        state: memberAvatarStateForStatus(status, work),
        trackPointer: false,
        mode: "members"
      });
      row.appendChild(ava);
      const text = el("div", "sb-ctext");
      const nameRow = el("div", "sb-cname-row");
      nameRow.appendChild(el("div", "sb-cname", agentName));
      const activity = createAgentActivityBadge(agent.id, { status, work });
      if (activity) nameRow.appendChild(activity);
      text.appendChild(nameRow);
      const sub = el("div", "sb-csub");
      sub.append(el("span", `sb-cdot ${dotClass(status.state)}`), el("span", "sb-cstatus-text", implemented ? presentation.label : "暂未开放"));
      text.appendChild(sub);
      row.appendChild(text);
      if (implemented) row.addEventListener("click", () => select({ kind: "friend", id: agent.id }));
      listCol.appendChild(row);
    };
    const friendEntries = sortContactFriendEntries([
      ...visibleProfiles.map(([agentType]) => ({ kind: "profile", id: agentType, available: isContactAgentAvailable(agentType) })),
      ...hired.map((agent) => ({ kind: "hired", id: agent.id, agent, available: isContactAgentAvailable(agent) }))
    ]);
    for (const entry of friendEntries) {
      if (entry.kind === "hired") appendHiredFriend(entry.agent);
      else appendProfileFriend(entry.id);
    }
    // External contacts are opt-in and stay separate from internal team members.
    const savedProspects = prospectStore.list().filter((item) => item.saved);
    if (savedProspects.length) {
      const prospectTitle = el("div", "sb-cgroup-title", "我的联系人");
      prospectTitle.appendChild(el("span", "sb-cgroup-count", `${savedProspects.length}`));
      listCol.appendChild(prospectTitle);
      for (const prospect of savedProspects) {
        const row = el("div", `sb-crow${state.selected?.kind === "prospect" && state.selected.id === prospect.id ? " sb-on" : ""}`);
        row.appendChild(el("div", "sb-cavatar", prospect.avatar || prospect.name?.slice(0, 1) || "抖"));
        const text = el("div", "sb-ctext");
        text.appendChild(el("div", "sb-cname", prospect.name || "抖音用户"));
        text.appendChild(el("div", "sb-csub", `${prospect.tier === "high" ? "高意向" : prospect.tier === "medium" ? "中意向" : "低意向"} · ${prospect.status || "待触达"}`));
        row.appendChild(text);
        row.addEventListener("click", () => select({ kind: "prospect", id: prospect.id }));
        listCol.appendChild(row);
      }
    }
    state.memberRosterSignature = currentMemberRosterSignature();
  }

  // ── 右栏：成员详情 ──
  function stopDmPoll() {
    clearInterval(dmPollTimer);
    dmPollTimer = null;
    clearTimeout(state.conversationAvatarTimer);
    state.conversationAvatarTimer = null;
    state.conversationAvatarTransientUntil = 0;
    state.conversationAvatarUpdate = null;
    disposeCompanion();
    disposeCompanion = () => {};
  }
  function stopCloudFeed() { state.cloudDispose?.(); state.cloudDispose = null; }

  function controlPlaneBaseUrl() {
    return globalThis.__SALEBUDDY_CONFIG__?.controlPlaneUrl
      || document.querySelector('meta[name="salebuddy-control-plane"]')?.content
      || "http://127.0.0.1:6681";
  }

  async function fetchDouyinCloudStatus(agentType) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 10000);
    try {
      const baseUrl = String(controlPlaneBaseUrl()).replace(/\/$/, "");
      const response = await fetch(`${baseUrl}/v1/douyin/mcp/status?agentId=${encodeURIComponent(agentType)}`, {
        headers: { accept: "application/json" },
        signal: controller.signal
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error?.message || `云电脑状态返回 HTTP ${response.status}`);
      return result || {};
    } finally {
      window.clearTimeout(timer);
    }
  }

  async function syncDouyinCloudTask(agentType) {
    if (!DOUYIN_AGENT_IDS.has(agentType) || cloudNoticeInFlight.has(agentType)) return;
    const task = douyinCloudTaskStore.get(agentType);
    if (!task || task.phase === "authorized") return;
    cloudNoticeInFlight.add(agentType);
    try {
      const status = await fetchDouyinCloudStatus(agentType);
      if (isDouyinCloudProvisioningStatus(status)) {
        const current = douyinCloudTaskStore.get(agentType);
        if (current?.phase !== "provisioning" || current.lastStatusError) {
          douyinCloudTaskStore.update(agentType, { phase: "provisioning", lastStatusError: null });
        }
        return;
      }
      if (!isDouyinCloudReadyStatus(status)) return;
      const existing = douyinCloudTaskStore.get(agentType);
      const current = existing?.phase === "ready" || existing?.phase === "authorized" || existing?.phase === "running"
        ? existing
        : douyinCloudTaskStore.update(agentType, { phase: "ready", lastStatusError: null });
      if (current.phase === "running") return;
      if (current.readyMessageSent) return;
      const market = getMarketplaceAgent(agentType);
      const fromName = displayAgentName({ id: agentType, name: market?.name || agentType });
      const readyText = "该账号的云电脑已经准备好了。你可以点击“继续处理”，回到原来的配置流程完成抖音授权。";
      const readyActivityKey = `cloud-ready:${current.startedAt || current.inboxStartedAt || current.updatedAt || "current"}`;
      recordAgentActivity(agentType, { type: "activity", activityKey: readyActivityKey }, {
        text: readyText,
        fromName,
        createdAt: current.updatedAt || undefined
      });
      douyinCloudTaskStore.update(agentType, {
        phase: "ready",
        readyMessageSent: true,
        readyMessageRecordedAt: new Date().toISOString(),
        readyMessageSendingAt: null,
        readyMessageError: null
      });
    } catch (error) {
      douyinCloudTaskStore.update(agentType, { readyMessageSendingAt: null, lastStatusError: error?.message || "云电脑状态暂时不可用" });
    } finally {
      cloudNoticeInFlight.delete(agentType);
    }
  }

  function buildActionButton({ key, label, icon, primary = false, onClick }) {
    const btn = el("button", `sb-caction${state.tab === key && key ? " sb-on" : ""}${primary ? " sb-caction-primary" : ""}`);
    btn.type = "button";
    const iconWrap = el("span");
    iconWrap.innerHTML = icon;
    btn.append(iconWrap, el("span", null, label));
    btn.addEventListener("click", onClick);
    return btn;
  }

  function companionRequestForAgent(agentType) {
    const conversationContext = isChiefAgentType(agentType)
      ? {}
      : acquisitionContextFor(agentType, {
        task: taskForAgent(agentType, initialConversationContext || {}),
        work: getWork(agentType),
        fallback: initialConversationContext
      });
    return (method, path, payload = {}) => companionRequest(method, path, {
      ...payload,
      ...(conversationContext.accountId ? { accountId: conversationContext.accountId } : {})
    });
  }

  function proactiveGuidance(agentType, profile, status) {
    const conversationScenario = getConversationScenario(agentType);
    const responsibilities = profile.role?.responsibilities?.filter(Boolean)?.slice(0, 2) || [];
    const guidance = PROACTIVE_GUIDANCE[agentType] || {
      idle: conversationScenario.objective || (responsibilities.length
        ? `我可以负责${responsibilities.join("、")}，完成后给你结果和下一步建议。`
        : "我可以根据当前项目目标拆解一项具体工作，并在完成后向你汇报。"),
      actions: [["查看实时工作", "realtime", true], ["打开我的配置", "settings"]]
    };
    const work = memberPresentationFor(agentType).work;
    const latestActivity = listAgentActivity(agentType).at(-1);
    if (isAcquisitionMember(agentType) && !work && !latestActivity) {
      const name = profile.identity?.name || agentType;
      return {
        guidance,
        work: null,
        working: false,
        completed: false,
        title: `${name}：我在，可以开始了`,
        body: guidance.idle,
        meta: "直接告诉我目标、账号或想看的结果就行。",
        conversationScenario
      };
    }
    const working = work?.state === "working" || status.state === TEAM_STATES.WORKING;
    const completed = work?.state === "done";
    const name = profile.identity?.name || agentType;
    const currentTask = work?.task || status.currentTask || latestActivity?.text || guidance.idle;
    const currentPhase = work?.phase || status.currentTask || "执行当前任务";
    const latest = work?.activities?.filter(Boolean).at(-1) || currentTask;
    const title = working
      ? `${name}：我正在${currentPhase}`
      : completed
        ? `${name}：本阶段已完成`
        : `${name}：我在，可以开始了`;
    const body = working
      ? currentTask
      : completed
        ? (work.artifact ? `已生成「${work.artifact}」，可以查看结果或继续安排下一步。` : "当前阶段已经收口，可以查看结果或安排下一步。")
        : guidance.idle;
    const meta = working
      ? (latest !== currentTask ? `刚刚：${latest}` : "我会在有结果时把结论和下一步发给你。")
      : completed
        ? "你可以查看结果，也可以继续给我新的要求。"
        : "直接告诉我目标、账号或想看的结果就行。";
    return { guidance, work, working, completed, title, body, meta, conversationScenario };
  }

  function buildProactiveBrief(agentType, profile, status) {
    const snapshot = proactiveGuidance(agentType, profile, status);
    const name = profile.identity?.name || agentType;
    const brief = el("section", "sb-proactive");
    brief.setAttribute("data-sb-conversation-family", snapshot.conversationScenario.family);
    brief.setAttribute("data-sb-conversation-scenario", snapshot.conversationScenario.id);
    brief.setAttribute("data-sb-message-kind", "assistant-message");
    brief.setAttribute("aria-label", `${name}的消息`);
    const messageRow = el("div", "sb-msg");
    const messageAvatar = el("div", `sb-msg-avatar${agentType === "main" ? " sb-main" : ""}`, avatarInitial(name));
    mountGrokBotAvatar(messageAvatar, agentType, {
      alt: name,
      state: grokStateForTeamStatus(status),
      trackPointer: false,
      mode: "members"
    });
    messageRow.appendChild(messageAvatar);
    const messageBody = el("div", "sb-msg-body");
    messageBody.appendChild(el("div", "sb-msg-name", name));
    const messageBubble = el("div", "sb-msg-bubble sb-proactive-message");
    const titlePrefix = `${name}：`;
    const messageTitle = snapshot.title.startsWith(titlePrefix) ? snapshot.title.slice(titlePrefix.length) : snapshot.title;
    messageBubble.append(
      el("div", "sb-proactive-message-title", messageTitle),
      el("div", "sb-proactive-message-body", snapshot.body),
      el("div", "sb-proactive-message-meta", snapshot.meta)
    );
    messageBody.appendChild(messageBubble);
    messageRow.appendChild(messageBody);
    brief.appendChild(messageRow);

    const actions = el("div", "sb-proactive-actions");
    const options = snapshot.working
      ? [["查看实时进展", "realtime", true]]
      : snapshot.completed
        ? [["查看交付结果", "prospects", true], ["查看实时工作", "realtime"]]
        : snapshot.guidance.actions.filter(([, action]) => action !== "settings");
    for (const [label, action, primary] of options) {
      const button = el("button", `sb-proactive-action${primary ? " primary" : ""}`, label);
      button.type = "button";
      button.addEventListener("click", () => runProactiveAction(agentType, action));
      actions.appendChild(button);
    }
    if (options.length) brief.appendChild(actions);
    return brief;
  }

  function updateProactiveBrief() {
    if (!state.proactiveEl || state.selected?.kind !== "friend" || state.tab !== "chat") return;
    const agentType = state.selected.id;
    const profile = profileOf(agentType);
    const status = memberStatusFor(agentType);
    const next = buildProactiveBrief(agentType, profile, status);
    state.proactiveEl.replaceWith(next);
    state.proactiveEl = next;
  }

  function runProactiveAction(agentType, action) {
    if (action === "cloud") {
      state.tab = "cloud";
      renderFriendDetail(agentType);
      return;
    }
    if (action === "settings") {
      state.tab = "settings";
      renderFriendDetail(agentType);
      return;
    }
    const frameworkPromise = globalThis.__SALEBUDDY__?.navFrameworkReady;
    if (action === "realtime" || action === "showStatus") {
      frameworkPromise?.then?.((framework) => framework?.openRealtimeWork?.({ selectedAgentId: agentType }));
      return;
    }
    if (action === "prospects") {
      frameworkPromise?.then?.((framework) => framework?.openProspects?.());
    }
  }

  async function runAcquisitionAction(agentType, action) {
    if (action !== "realtime") return;
    const task = taskForAgent(agentType, initialConversationContext || {});
    const work = getWork(agentType);
    const context = acquisitionContextFor(agentType, { task, work, fallback: initialConversationContext });
    await globalThis.__SALEBUDDY__?.navFrameworkReady?.then?.((framework) => framework?.openRealtimeWork?.({ selectedAgentId: agentType, taskId: context.taskId, taskRunId: context.taskRunId, accountId: context.accountId }));
  }

  function renderFriendDetail(agentType) {
    stopDmPoll();
    stopCloudFeed();
    state.friendStatusUpdate = null;
    const profile = profileOf(agentType);
    const presentation = memberPresentationFor(agentType);
    const { status, work } = presentation;
    // Track the status signature so non-chat views only rebuild when their state changes.
    state.lastStatusSig = `${agentType}|${status.state}|${status.currentTask || ""}|${profile.identity?.name || ""}`;
    detailCol.textContent = "";

    const head = el("div", "sb-chead sb-chead-friend");
    const headAvatar = el("div", `sb-chead-avatar sb-conversation-avatar${agentType === "main" ? " sb-main" : ""}`, avatarInitial(profile.identity?.name));
    // Agent广场雇佣的成员：头像用目录配色
    const marketAgent = getMarketplaceAgent(agentType);
    if (marketAgent) headAvatar.style.background = marketAgent.color;
    mountGrokBotAvatar(headAvatar, agentType, {
      alt: profile.identity?.name || agentType,
      state: memberAvatarStateForStatus(status, work),
      trackPointer: false,
      mode: "members"
    });
    state.conversationAvatarUpdate = (nextState) => mountGrokBotAvatar(headAvatar, agentType, {
      alt: profile.identity?.name || agentType,
      state: nextState,
      trackPointer: false,
      mode: "members"
    });
    head.appendChild(headAvatar);
    const headText = el("div", "sb-chead-text");
    headText.appendChild(el("div", "sb-chead-name", profile.identity?.name || agentType));
    const statusLine = el("div", "sb-chead-status");
    statusLine.append(el("span", `sb-cdot ${dotClass(status.state)}`), el("span", null, presentation.label));
    const ownedProspects = prospectStore.list().filter((item) => item.source?.agentId === agentType);
    if (ownedProspects.length) statusLine.append(el("span", null, ` · 负责 ${ownedProspects.length} 位潜客`));
    state.friendStatusUpdate = (nextPresentation) => {
      if (!statusLine.isConnected) return;
      const nextOwnedProspects = prospectStore.list().filter((item) => item.source?.agentId === agentType);
      statusLine.replaceChildren(
        el("span", `sb-cdot ${dotClass(nextPresentation.status.state)}`),
        el("span", null, nextPresentation.label)
      );
      if (nextOwnedProspects.length) statusLine.append(el("span", null, ` · 负责 ${nextOwnedProspects.length} 位潜客`));
    };
    headText.appendChild(statusLine);
    head.appendChild(headText);
    const topbar = el("div", "sb-cdetail-topbar");
    topbar.appendChild(head);
    const actionGroup = el("div", "sb-cdetail-actions");
    const actions = el("div", "sb-cactions sb-cactions-friend");
    actions.append(
      buildActionButton({ key: "cloud", label: "云电脑", icon: ICONS.cloud, onClick: () => { state.tab = "cloud"; renderFriendDetail(agentType); } }),
      buildActionButton({ key: "settings", label: "配置", icon: ICONS.settings, onClick: () => { state.tab = "settings"; renderFriendDetail(agentType); } })
    );
    if (companionPersona(agentType)) {
      const preferences = el("button", "sb-caction sb-caction-companion", "相处方式");
      preferences.type = "button";
      preferences.addEventListener("click", () => openCompanionPreferences({ agentId: agentType, request: companionRequestForAgent(agentType) }));
      actions.appendChild(preferences);
    }
    actionGroup.appendChild(actions);
    topbar.appendChild(actionGroup);
    detailCol.appendChild(topbar);

    const content = el("div", "sb-ccontent");
    detailCol.appendChild(content);
    if (state.tab === "chat") renderChat(content, agentType, profile);
    else if (state.tab === "cloud") renderCloud(content, agentType);
    else renderSettings(content, agentType, profile);
  }

  function renderProspectDetail(prospectId) {
    stopDmPoll();
    stopCloudFeed();
    const prospect = prospectStore.get(prospectId);
    detailCol.textContent = "";
    if (!prospect) {
      detailCol.appendChild(el("div", "sb-cplaceholder", "联系人记录已不存在"));
      return;
    }
    const head = el("div", "sb-chead sb-chead-friend");
    head.appendChild(el("div", "sb-chead-avatar", prospect.avatar || prospect.name?.slice(0, 1) || "抖"));
    const headText = el("div", "sb-chead-text");
    headText.appendChild(el("div", "sb-chead-name", prospect.name || "抖音用户"));
    headText.appendChild(el("div", "sb-chead-status", `${prospect.tier === "high" ? "高意向" : prospect.tier === "medium" ? "中意向" : "低意向"} · ${prospect.score ?? "—"} 分 · ${prospect.status || "待触达"}`));
    head.appendChild(headText);
    detailCol.appendChild(head);
    const actions = el("div", "sb-cactions sb-cactions-friend");
    const openResults = buildActionButton({ key: "prospects", label: "查看完整结果", icon: ICONS.data, primary: true, onClick: () => globalThis.__SALEBUDDY__?.navFrameworkReady?.then?.((framework) => framework?.openProspects?.()) });
    actions.appendChild(openResults);
    detailCol.appendChild(actions);
    const content = el("div", "sb-ccontent");
    const pane = el("div", "sb-pane");
    pane.appendChild(el("div", "sb-pane-title", "联系人档案"));
    pane.appendChild(el("div", "sb-kv", `抖音账号：${prospect.handle || "—"}`));
    pane.appendChild(el("div", "sb-kv", `来源作品：${prospect.source?.videoTitle || prospect.source?.videoId || "—"}`));
    pane.appendChild(el("div", "sb-kv", `来源任务：${prospect.source?.taskId || "—"}`));
    pane.appendChild(el("div", "sb-kv", `负责人：${prospect.owner || "—"}`));
    pane.appendChild(el("div", "sb-pane-title", "AI 判断"));
    pane.appendChild(el("div", "sb-kv", prospect.reason || "—"));
    if (prospect.evidence?.[0]?.quote) {
      pane.appendChild(el("div", "sb-pane-title", "原始评论"));
      pane.appendChild(el("div", "sb-kv", `“${prospect.evidence[0].quote}”`));
    }
    content.appendChild(pane);
    detailCol.appendChild(content);
  }

  // 发消息：1:1 私聊
  function renderChat(container, agentType, profile) {
    const list = el("div", "sb-chat-list2");
    const inputWrap = el("div", "sb-chat-input2");
    const textarea = document.createElement("textarea");
    const conversationScenario = getConversationScenario(agentType);
    const chiefTaskMode = conversationModeForAgent(agentType) === "task";
    const hasCompanion = Boolean(companionPersona(agentType));
    const supportsConversationStatus = chiefTaskMode || hasCompanion;
    let active = true, disposeStatus = () => {}, phaseKey = "";
    let hasRenderedMessages = false;
    let lastAgentMessageKey = null;
    let awaitingAgentReply = false;
    let localCompanionPhase = null;
    let localCompanionMessageId = null;
    const pendingMessages = new Map();
    const disposeCards = [];
    const displayedMessages = new Set();
    disposeCompanion = () => { active = false; disposeStatus(); disposeCards.splice(0).forEach(dispose => dispose()); };
    list.setAttribute("data-sb-conversation-family", conversationScenario.family);
    list.setAttribute("data-sb-conversation-scenario", conversationScenario.id);
    textarea.placeholder = conversationScenario.composerPlaceholder
      || (chiefTaskMode ? "问问题，或告诉幕僚长你想完成什么…（Enter 发送）" : `发给 ${profile.identity?.name || agentType}…`);
    const sendBtn = el("button", "sb-chat-send2", "发送");
    sendBtn.type = "button";
    inputWrap.append(textarea, sendBtn);
    const connectionStatus = el("div", "sb-chat-connection");
    const companionStatus = el("div"); companionStatus.style.padding = "0 18px";
    container.append(list, connectionStatus, companionStatus, inputWrap);
    let sending = false;
    const updateTransportState = (message = "") => {
      const unavailable = !gateway?.action;
      connectionStatus.textContent = message || (unavailable ? "对话连接尚未就绪，消息会留在输入框里。" : "");
      connectionStatus.dataset.state = message && unavailable ? "error" : "ready";
    };
    const updateSendButton = () => {
      sendBtn.disabled = sending || !gateway?.action || !textarea.value.trim();
      sendBtn.setAttribute("aria-busy", String(sending));
    };
    textarea.addEventListener("input", updateSendButton);
    updateTransportState();
    const applyConversationBaseAvatar = () => {
      if (state.conversationAvatarTransientUntil > Date.now()) return;
      const presentation = memberPresentationFor(agentType);
      state.conversationAvatarUpdate?.(memberConversationAvatarStateForStatus(presentation.status, presentation.work));
    };
    const showConversationAvatarState = (nextState, duration = 0) => {
      clearTimeout(state.conversationAvatarTimer);
      state.conversationAvatarTransientUntil = duration > 0 ? Date.now() + duration : 0;
      state.conversationAvatarUpdate?.(nextState);
      if (duration > 0) {
        state.conversationAvatarTimer = setTimeout(() => {
          state.conversationAvatarTransientUntil = 0;
          applyConversationBaseAvatar();
        }, duration);
      }
    };
    applyConversationBaseAvatar();
    let conversationContext = isChiefAgentType(agentType)
      ? {}
      : acquisitionContextFor(agentType, {
        task: taskForAgent(agentType, initialConversationContext || {}),
        work: getWork(agentType),
        fallback: initialConversationContext
      });
    const dmPayload = (extra = {}) => dmPayloadFor(agentType, { ...conversationContext, ...extra });
    const companionRequestForConversation = companionRequestForAgent(agentType);

    async function hydrateAcquisitionContext() {
      if (!isAcquisitionMember(agentType) || mockContacts || !gateway?.action) return;
      try {
        const response = await gateway.action("douyin.acquisition.tasks.list", {
          agentId: agentType,
          ...(initialConversationContext?.taskId ? { taskId: initialConversationContext.taskId } : {}),
          ...(initialConversationContext?.taskRunId ? { taskRunId: initialConversationContext.taskRunId } : {}),
          ...(initialConversationContext?.conversationId ? { conversationId: initialConversationContext.conversationId } : {}),
          ...(initialConversationContext?.accountId ? { accountId: initialConversationContext.accountId } : {})
        });
        const task = selectAcquisitionConversationTask(response?.data?.tasks || response?.tasks, {
          agentType,
          context: initialConversationContext || {}
        });
        if (!task || !active) return;
        const nextContext = acquisitionContextFor(agentType, { task, work: getWork(agentType) });
        conversationContext = {
          ...conversationContext,
          ...Object.fromEntries(Object.entries(nextContext).filter(([, value]) => value !== null && value !== undefined && value !== ""))
        };
      } catch {
        // Keep the local context as a fallback while the control plane reconnects.
      }
    }

    const rememberLocalMessage = (message) => {
      if (!message?.id) return;
      pendingMessages.set(message.id, message);
    };
    const setLocalCompanionPhase = (phase, messageId = "local") => {
      localCompanionPhase = phase;
      localCompanionMessageId = messageId;
      const key = `${phase}:${messageId}`;
      if (key === phaseKey) return;
      phaseKey = key;
      disposeStatus = mountCompanionStatus(companionStatus, {
        phase,
        onRetry: async () => {
          if (!localCompanionMessageId || localCompanionMessageId === "local") return;
          await companionRequestForConversation("POST", "/v1/direct-messages/retry", { agentId: agentType, messageId: localCompanionMessageId });
          if (active) await refresh();
        }
      });
    };
    const clearLocalCompanionPhase = () => {
      localCompanionPhase = null;
      localCompanionMessageId = null;
    };

    function artifactCard(artifact) {
      const card = el("button", "sb-dm-artifact");
      card.type = "button";
      const extension = String(artifact.name || "").split(".").pop()?.toUpperCase() || (artifact.type === "sheet" ? "CSV" : "DOC");
      card.appendChild(el("span", `sb-dm-fileico${artifact.type === "sheet" ? " sb-sheet" : ""}`, extension));
      const fileBody = el("span", "sb-dm-filebody");
      fileBody.append(el("span", "sb-dm-filename", artifact.name || "任务产出"), el("span", "sb-dm-filesummary", artifact.summary || "点击查看完整内容"));
      const go = el("span", "sb-dm-filego");
      go.append(el("span", "sb-dm-filestatus", artifact.status || "已完成"), el("span", "sb-dm-filelink", "查看产出 →"));
      card.append(fileBody, go);
      card.addEventListener("click", () => {
        openFileCenterPage({ initialFileId: artifact.id || null, artifact });
      });
      return card;
    }

    function bubble(message) {
      message = projectMessage(message);
      const mine = message.from === "user";
      const row = el("div", `sb-msg${mine ? " sb-mine" : ""}`);
      if (!displayedMessages.has(message.id)) { row.className += " sb-companion-arrive"; displayedMessages.add(message.id); }
      const agentType = message.agentType || message.from;
      const presentation = memberPresentationFor(agentType);
      const { status, work } = presentation;
      if (!mine) {
        const messageAvatar = el("div", `sb-msg-avatar${message.from === "main" ? " sb-main" : ""}`, avatarInitial(message.fromName));
        mountGrokBotAvatar(messageAvatar, agentType, {
          alt: message.fromName || message.from,
          state: grokStateForTeamStatus(status),
          trackPointer: false,
          mode: "members"
        });
        row.appendChild(messageAvatar);
      }
      const body = el("div", "sb-msg-body");
      const nameRow = el("div", "sb-msg-name-row");
      nameRow.appendChild(el("div", "sb-msg-name", message.fromName || ""));
      const activity = mine ? null : createAgentActivityBadge(agentType, { status, work });
      if (activity) nameRow.appendChild(activity);
      body.appendChild(nameRow);
      body.appendChild(el("div", "sb-msg-bubble", message.text || ""));
      if (hasCompanion) disposeCards.push(appendCompanionCards(body, message, { onAction: async input => {
        const result = await companionCardAction(agentType, input, {
          onConfigure: id => globalThis.__SALEBUDDY__?.navFrameworkReady?.then(framework => framework.openAgentSquare({ initialAgentId: id })),
          onOpenWork: id => globalThis.__SALEBUDDY__?.navFrameworkReady?.then(framework => framework.openRealtimeWork({ selectedAgentId: id }))
        });
        if (active) await refresh(); return result;
      } }));
      if (message.metadata?.chiefDecision) {
        const decision = message.metadata.chiefDecision;
        const presentation = chiefDecisionPresentation(decision);
        if (presentation.kind !== "text") {
          const card = el("div", `sb-chief-card${presentation.tone === "attention" ? " is-attention" : presentation.tone === "danger" ? " is-danger" : ""}`);
          const titles = { status: "当前进展", result: "Agent 产出汇总", supplement: "还需要一点信息", approval: "执行前确认", risk: "需要你确认", recovery: "执行未完成" };
          card.appendChild(el("div", "sb-chief-card-title", titles[presentation.kind] || "幕僚长"));
          if (presentation.kind === "result") appendChiefResultOverview(card, decision.chiefData || message.metadata.chiefData);
          const missing = Array.isArray(decision.blockingMissing) ? decision.blockingMissing.filter(Boolean) : [];
          if (missing.length) card.appendChild(el("div", "sb-chief-card-copy", `请补充：${missing.join("、")}`));
          const meta = decision.statusText || decision.taskTitle;
          if (meta) card.appendChild(el("div", "sb-chief-card-meta", meta));
          body.appendChild(card);
        }
      }
      if (message.artifact) body.appendChild(artifactCard(message.artifact));
      row.appendChild(body);
      return row;
    }

    state.proactiveEl = buildProactiveBrief(agentType, profile, memberStatusFor(agentType));
    list.appendChild(state.proactiveEl);

    function scheduleCloudSync() {
      if (!DOUYIN_AGENT_IDS.has(agentType) || !douyinCloudTaskStore.get(agentType)) return;
      void syncDouyinCloudTask(agentType).then(() => {
        if (!disposed && state.selected?.kind === "friend" && state.selected.id === agentType && state.tab === "chat") {
          refresh({ scroll: false, sync: false });
        }
      });
    }

    async function refresh({ scroll = false, sync = true } = {}) {
      if (!active) return;
      if (sync) scheduleCloudSync();
      let remoteMessages = [];
      try {
        if (gateway?.action) remoteMessages = (await gateway.action("dm.message.list", dmPayload()))?.data?.messages || [];
      } catch (error) {
        remoteMessages = [];
      }
      try {
        if (!active) return;
        for (const id of pendingMessages.keys()) {
          if (remoteMessages.some((message) => message?.id === id)) pendingMessages.delete(id);
        }
        const conversationActivities = listAgentActivity(agentType)
          .filter((activity) => activity?.metadata?.deliverToConversation === true);
        const messages = mergeAgentConversationMessages(remoteMessages, [...pendingMessages.values(), ...conversationActivities]);
        const latestAgentMessage = [...messages].reverse().find((message) => message.from !== "user");
        const latestAgentKey = latestAgentMessage ? conversationMessageKey(latestAgentMessage) : null;
        if (!hasRenderedMessages) {
          hasRenderedMessages = true;
          lastAgentMessageKey = latestAgentKey;
        } else if (latestAgentKey && latestAgentKey !== lastAgentMessageKey) {
          lastAgentMessageKey = latestAgentKey;
          awaitingAgentReply = false;
          clearLocalCompanionPhase();
          showConversationAvatarState("sending", 1400);
        } else if (awaitingAgentReply && memberStatusFor(agentType).state === TEAM_STATES.WORKING) {
          showConversationAvatarState("thinking");
        }
        if (supportsConversationStatus) {
          const latest = localCompanionPhase
            ? { phase: localCompanionPhase, messageId: localCompanionMessageId }
            : latestCompanionPhase(messages);
          const key = `${latest.phase}:${latest.messageId}`;
          if (key !== phaseKey) { phaseKey = key; disposeStatus = mountCompanionStatus(companionStatus, { phase: latest.phase, onRetry: async () => {
            await companionRequestForConversation("POST", "/v1/direct-messages/retry", { agentId: agentType, messageId: latest.messageId }); if (active) await refresh();
          } }); }
        }
        const messageSig = messages.map((message) => `${conversationMessageKey(message)}:${JSON.stringify(message.metadata?.companion || null)}`).join("|");
        const expectedChildren = messages.length + 1;
        if (messageSig === state.dmLastId && list.childElementCount === expectedChildren) return;
        const stickToBottom = scroll || list.scrollHeight - list.scrollTop - list.clientHeight < 60;
        state.dmLastId = messageSig;
        disposeCards.splice(0).forEach(dispose => dispose());
        list.textContent = "";
        state.proactiveEl = buildProactiveBrief(agentType, profile, memberStatusFor(agentType));
        list.appendChild(state.proactiveEl);
        for (const message of messages) list.appendChild(bubble(message));
        if (stickToBottom) list.scrollTop = list.scrollHeight;
      } catch { /* 保持现状 */ }
    }

    async function send() {
      const text = textarea.value.trim();
      if (!text) return;
      if (!gateway?.action) {
        updateTransportState("对话连接尚未就绪，这条消息还在输入框里，请稍后重试。");
        updateSendButton();
        return;
      }
      sending = true;
      updateSendButton();
      awaitingAgentReply = true;
      showConversationAvatarState("receiving", 700);
      try {
        if (chiefTaskMode) {
          textarea.value = "";
          const clientMessageId = globalThis.crypto?.randomUUID?.() || `message-${Date.now()}`;
          const sent = await gateway.action("dm.message.send", dmPayload({
            from: "user",
            fromName: "我",
            text,
            clientMessageId,
            metadata: { source: "chief-conversation", entry: "members", suppressAutoReply: true }
          }));
          rememberLocalMessage(sent?.data?.message);
          setLocalCompanionPhase("thinking", sent?.data?.message?.id || clientMessageId);
          showConversationAvatarState("thinking", 2200);
          await refresh({ scroll: true });
          const routed = await gateway.action("chief.message.decide", { message: text });
          const routedData = routed?.data || routed || {};
          const decision = routedData.decision || {};
          let responseText = routedData.message;
          const reply = await gateway.action("dm.message.send", dmPayload({
            from: CHIEF_AGENT_TYPE,
            fromName: profile.identity?.name || "幕僚长",
            text: responseText || "我还需要你补充一点信息后才能继续。",
            metadata: {
              source: "chief-conversation",
                chiefDecision: {
                  ...decision,
                  chiefData: routedData.chiefData || null,
                  taskTitle: null,
                statusText: decision.intent === "status_query"
                  ? `执行中 ${routedData?.overview?.running || 0} · 等待处理 ${routedData?.overview?.waiting || 0} · 阻塞 ${routedData?.overview?.blocked || 0}`
                  : null
              }
            }
          }));
          rememberLocalMessage(reply?.data?.message);
          clearLocalCompanionPhase();
          await refresh({ scroll: true });
          return;
        }
        const sent = await gateway.action("dm.message.send", dmPayload({
          from: "user",
          fromName: "我",
          text,
          clientMessageId: globalThis.crypto?.randomUUID?.() || `message-${Date.now()}`,
          metadata: specialistConversationMetadata(conversationContext)
        }));
        rememberLocalMessage(sent?.data?.message);
        setLocalCompanionPhase("thinking", sent?.data?.message?.id || "local");
        textarea.value = "";
        showConversationAvatarState("thinking", 2200);
        await refresh({ scroll: true });
      } catch (error) {
        awaitingAgentReply = false;
        showConversationAvatarState("alerting", 1800);
        if (!chiefTaskMode) { if (active) updateTransportState("这条没发出去，内容还在输入框里，可以再试一次。"); return; }
        try {
          const recovery = await gateway.action("dm.message.send", dmPayload({
            from: CHIEF_AGENT_TYPE,
            fromName: profile.identity?.name || "幕僚长",
            text: `这次没有执行成功：${error?.message || "服务暂时不可用"}`,
            metadata: {
              source: "chief-conversation",
              chiefDecision: { responseMode: "recovery_card", errorCode: error?.code || "CHIEF_MESSAGE_FAILED" }
            }
          }));
          rememberLocalMessage(recovery?.data?.message);
          clearLocalCompanionPhase();
          await refresh({ scroll: true });
        } catch { /* 保留用户消息，下一次刷新后仍可重试。 */ }
      } finally { sending = false; updateSendButton(); }
    }
    sendBtn.addEventListener("click", send);
    textarea.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing) { event.preventDefault(); send(); }
    });
    updateSendButton();

    state.dmLastId = null;
    (async () => {
      await hydrateAcquisitionContext();
      await refresh({ scroll: true });
      await refresh({ scroll: true });
    })();
    dmPollTimer = setInterval(() => refresh(), 2000);
  }

  // 云电脑：实时快照（与办公室同款）+ 工作区文件
  async function renderCloud(container, agentType) {
    const pane = el("div", "sb-pane");
    container.appendChild(pane);

    // 快照标题行：云电脑 · 实时快照 + LIVE
    const snapTitle = el("div", "sb-pane-title");
    snapTitle.style.cssText = "display:flex;align-items:center;gap:8px";
    snapTitle.appendChild(document.createTextNode("云电脑 · 实时快照"));
    snapTitle.appendChild(createLiveBadge());
    pane.appendChild(snapTitle);

    const screen = createSnapshotScreen(agentType, { height: 260 });
    screen.el.style.marginBottom = "14px";
    state.cloudDispose = screen.dispose;
    pane.appendChild(screen.el);

    // 工作区文件
    pane.appendChild(el("div", "sb-pane-title", "工作区文件"));
    const filesBox = el("div");
    filesBox.appendChild(el("div", "sb-pane-empty", "读取工作区…"));
    pane.appendChild(filesBox);

    let workspace = null;
    if (gateway) {
      try { workspace = (await gateway.action("agent.workspace.list", { agentType }))?.data?.workspace || null; }
      catch { workspace = null; }
    }
    if (disposed || state.tab !== "cloud" || state.selected?.id !== agentType) return;
    filesBox.textContent = "";
    if (!workspace) {
      filesBox.appendChild(el("div", "sb-pane-empty", gateway ? "工作区暂不可读" : "gateway 未连接"));
      return;
    }
    filesBox.appendChild(el("div", "sb-pane-path", `云电脑目录：${workspace.path}`));
    for (const section of workspace.sections || []) {
      filesBox.appendChild(el("div", "sb-pane-title", section.dir));
      if (!section.files.length) {
        filesBox.appendChild(el("div", "sb-pane-empty", "暂无文件"));
        continue;
      }
      for (const file of section.files) {
        const row = el("div", "sb-file-row");
        row.append(el("span", null, file.name), el("span", "sb-file-size", fmtSize(file.size || 0)));
        filesBox.appendChild(row);
      }
    }
  }

  // 配置：完整 Agent 详情页（九段模型 + 运行数据 + 训练，见 agent-profile.js）
  function renderSettings(container, agentType, profile) {
    renderAgentProfile(container, agentType, profile, {
      gateway,
      teamLive,
      demoConfig: gateway?.getDemoConfig?.(agentType) || null,
      accountId: initialConversationContext?.accountId || null,
      onOpenChat: (nextAccountId) => {
        initialConversationContext = {
          ...(initialConversationContext || {}),
          accountId: nextAccountId
        };
        state.tab = "chat";
        renderFriendDetail(agentType);
      }
    });
  }

  function renderDetail() {
    if (disposed) return;
    if (mockPreview && state.mockShowcaseOpen) {
      stopDmPoll();
      stopCloudFeed();
      renderMockShowcase(detailCol);
      return;
    }
    if (!state.selected) {
      stopDmPoll();
      stopCloudFeed();
      detailCol.textContent = "";
      detailCol.appendChild(el("div", "sb-cplaceholder", "从左侧选择一位 Agent 或联系人"));
      return;
    }
    if (state.selected.kind === "friend") renderFriendDetail(state.selected.id);
    else if (state.selected.kind === "prospect") renderProspectDetail(state.selected.id);
  }

  function select(next) {
    if (mockPreview) {
      state.mockShowcaseOpen = false;
      state.mockScenarioId = "all";
    }
    state.selected = next;
    state.tab = "chat";
    renderList();
    renderDetail();
    updateMockControls();
  }

  function handleMemberStateUpdate() {
    refreshMembersFromLive();
    updateProactiveBrief();
    if (state.selected?.kind !== "friend") return;
    const presentation = memberPresentationFor(state.selected.id);
    state.friendStatusUpdate?.(presentation);
    if (state.tab === "chat" && state.conversationAvatarTransientUntil <= Date.now()) {
      state.conversationAvatarUpdate?.(memberConversationAvatarStateForStatus(presentation.status, presentation.work));
    }
    // Rebuild non-chat detail views only when the effective status changes.
    if (state.tab !== "chat") {
      const profile = profileOf(state.selected.id);
      const sig = `${state.selected.id}|${presentation.status.state}|${presentation.status.currentTask || ""}|${presentation.label}|${profile.identity?.name || ""}`;
      const shouldRebuild = shouldRebuildMemberDetail({
        tab: state.tab,
        previousSignature: state.lastStatusSig,
        nextSignature: sig
      });
      state.lastStatusSig = sig;
      if (shouldRebuild) renderDetail();
    }
  }

  // ── 启动与订阅 ──
  if (mockContacts && !initialFriend && contactHiredAgents().some(({ id }) => id === "mkt-comment-acquisition")) {
    state.selected = { kind: "friend", id: "mkt-comment-acquisition" };
  }
  renderList();
  renderDetail();
  void officeStatusStore.refresh();
  // 外部入口指定了成员（如办公室卡片「沟通」）：直接选中并进入私聊
  const initialProfile = initialFriend
    ? teamLive?.getProfiles?.().has(initialFriend) && isContactAgentAvailable(initialFriend)
    : false;
  const initialMarketplaceAgent = initialFriend
    && contactHiredAgents().some(({ id }) => id === initialFriend);
  if (initialFriend && (initialProfile || initialMarketplaceAgent)) {
    select({ kind: "friend", id: initialFriend });
  }
  const unsubscribe = teamLive?.subscribe?.(handleMemberStateUpdate) || (() => {});
  const unsubscribeWork = subscribeWork(() => {
    handleMemberStateUpdate();
  });
  const unsubscribeOfficeStatus = officeStatusStore.subscribe(handleMemberStateUpdate);
  const unsubscribeProspects = prospectStore.subscribe(() => {
    renderList();
    if (state.selected?.kind === "prospect") renderDetail();
  });
  const origClose = page.close;
  page.setGateway = (nextGateway) => {
    if (disposed) return;
    gateway = demoGateway || (nextGateway?.action ? nextGateway : null);
    state.dmLastId = null;
    renderList();
    renderDetail();
  };
  page.close = () => {
    disposed = true;
    if (mockPlaybackTimer) window.clearInterval(mockPlaybackTimer);
    mockPlaybackTimer = null;
    stopDmPoll();
        stopCloudFeed();
        unsubscribe();
        unsubscribeWork();
        unsubscribeOfficeStatus();
        officeStatusStore.dispose();
        unsubscribeProspects();
    origClose();
  };
  return page;
}
