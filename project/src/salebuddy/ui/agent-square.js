/**
 * ui/agent-square.js
 * Agent market page with quick category navigation and vertically stacked workflow sections.
 * Team members are placed before marketplace cards inside their matching category.
 * Card actions keep the existing employment and task-entry behavior.
 */
import { el, openPage } from "./pages.js";
import { clearNavigationRoute, persistNavigationRoute } from "./navigation-routes.js";
import { BYERING_DEFAULT_AGENT_TYPES } from "../agents/model.js";
import { displayAgentName, displayAgentTitle, localizeAgentText } from "../brand.js";
import { avatarInitial } from "./agent-drawer.js";
import { mountAgentAvatar } from "./agent-avatar.js";
import { grokStateForTeamStatus, mountGrokBotAvatar } from "./grok-bot-avatar.js";
import { beginWork, updateWork, pushActivity, reportWorkError, finishWork, listWorks, subscribeWork } from "../agents/work-live.js";
import { acquisitionRealtimeActionPayload, applyAuthoritativeManagedAccountDirectory, douyinAccountWorkKey, getAuthorizedManagedAccounts, rememberAuthorizedManagedAccount, officeStatusWorksToRealtimeWorks } from "./realtime-work.js";
import { openDouyinAuthorization } from "./douyin-auth.js";
import { contactabilityFor, isContactableRecord, prospectStore } from "./prospect-store.js";
import { normalizeDouyinFinderAccounts } from "./douyin-finder-results.js";
import { leadMinerRequestLimits, leadMinerResultState, normalizeRecentWorkCount, validateLeadMinerSetup, workScopeLabel, parseCommentSource, commentSourcePayload, parseCommentSources } from "./lead-scope.js";
import { douyinCloudTaskStore } from "../agents/douyin-cloud-state.js";
import { inboxStrategyStore } from "../agents/inbox-strategy-store.js";
import { agentActivityJournal, recordAgentActivity } from "../agents/agent-activity-journal.js";
import { agentResultRecorder } from "../agents/agent-result-recorder.js";
import { addFile } from "../agents/file-store.js";
import { accountAnalysisReportConversationMessage, accountAnalysisReportFile } from "../agents/account-analysis-report.js";
import { viralWorkAnalysisReportConversationMessage, viralWorkAnalysisReportFile } from "../agents/viral-work-analysis-report.js";
import { liveDanmakuAnalysisReportConversationMessage, liveDanmakuAnalysisReportFile } from "../agents/live-danmaku-analysis-report.js";
import { bindAcquisitionCardAction, getAcquisitionCardViewModel } from "./acquisition-card-controller.js";
import { COMMENT_ACQUISITION_DEFAULTS, DOUYIN_AUTO_AUDIENCE_GOAL, buildCommentAcquisitionTaskPayload, buildFinderListenerTaskPayload, buildLiveLeadTaskPayload, validateFinderListenerSetup, validateLiveLeadSetup, normalizeCommentAcquisitionConfig, validateCommentAcquisitionSetup } from "./comment-acquisition-config.js";
import { DEFAULT_LIVE_SIGNALS, buildLiveDanmakuAnalysisTaskPayload, validateLiveDanmakuAnalysisSetup } from "./live-danmaku-analysis-config.js";
import {
  LIVE_DANMAKU_OUTREACH_DEFAULT_GOAL,
  LIVE_DANMAKU_OUTREACH_DEFAULT_MESSAGE,
  LIVE_DANMAKU_OUTREACH_SCOPE,
  buildLiveDanmakuOutreachTaskPayload,
  normalizeLiveDanmakuOutreachSettings,
  validateLiveDanmakuOutreachSetup
} from "./live-danmaku-outreach-config.js";
import { VIRAL_WORK_ANALYSIS_DEFAULT_GOAL, buildViralWorkAnalysisTaskPayload, validateViralWorkAnalysisSetup } from "./viral-work-analysis-config.js";
import { openAccountReceptionPage } from "./account-reception-page.js?v=20260914-grid-alignment-1";
import { buildCommentAcquisitionResultRecord, commentAcquisitionCapabilityState } from "./comment-acquisition-results.js";
import { mergePrivateOutreachUrls, readPrivateOutreachFile } from "./private-outreach.js";
import { createPrivateOutreachMockData, createPrivateOutreachMockResult, isPrivateOutreachMockPreview } from "./private-outreach-mock.js";
import { PRIVATE_OUTREACH_MODES, isAlreadyContactedRecord, isPrivateOutreachRecordCandidate, normalizePrivateOutreachMode, privateOutreachProfileIdentifier } from "../agents/private-outreach-contract.js";
import { buildSurveyInvitation, buildSurveyOutreachTargets, validateUserResearchSetup } from "./user-research.js";
import { normalizeAnalysisAccounts, buildAccountAnalysisBatch, ACCOUNT_ANALYSIS_LIMIT, buildAccountAnalysisResumeFlow } from "../agents/account-analysis-contract.js";
import { isDouyinProfileUrl, publicFinderNeedsBusinessAccount as needsPublicFinderBusinessAccount, validatePublicFinderBusinessAccount } from "../agents/public-finder-contract.js";
import { openAccountAnalysis, renderAccountAnalysisOverview, renderAccountAnalysisReports } from "./account-analysis.js";
import { renderViralWorkAnalysisDetails, renderViralWorkAnalysisOverview } from "./viral-work-analysis.js";
import { mountTaskChoices, makeTaskSettings, TASK_CHOICES, TASK_ENTRY_TITLES, TASK_FLOW_CSS } from "./task-choices.js?v=20260910-composite-finder-1";
import { mountPersonAvatar } from "./person-avatar.js";
import { receptionBaseUrl, receptionRequest } from "../bridge/account-reception-client.js";
import { receptionGoalObjective, receptionResponseStyle } from "../agents/account-reception.js";
import {
  MARKETPLACE_AGENTS,
  MARKETPLACE_CATEGORIES,
  normalizeMarketplaceCapability,
  getMarketplaceAgent,
  isImplementedMarketplaceAgent,
  isMarketplaceAgentAvailable,
  isHired,
  getEmployment,
  listHiredAgents,
  sortMarketplaceAgentsForDisplay,
  DOUYIN_ACQUISITION_COMPLETE_AGENT_ID,
  GOLD_CUSTOMER_SERVICE_AGENT_ID,
  hasDouyinAcquisitionManagerBindingConflict,
  isDouyinAcquisitionManagerBoundAccount,
  isDouyinAcquisitionSingleCapabilityAgent
} from "../agents/marketplace.js";
import {
  employMarketplaceAgent,
  refreshEmploymentContracts,
  terminateMarketplaceAgent
} from "../bridge/employment-client.js";

const PRIVATE_OUTREACH_RECEIPT_PENDING = "PRIVATE_OUTREACH_RECEIPT_PENDING";
const TERMINAL_AGENT_WORK_STATES = new Set(["done", "completed", "succeeded", "stopped", "cancelled", "canceled", "failed"]);
const ACTIVE_AGENT_WORK_STATES = new Set([
  "working",
  "running",
  "listening",
  "attention",
  "starting",
  "configuring",
  "accepted",
  "queued",
  "waiting_reply",
  "degraded",
  "retrying"
]);

function taskStateOf(work = {}) {
  const metadata = work?.metadata && typeof work.metadata === "object" ? work.metadata : {};
  return String(work?.taskState || metadata.taskState || metadata.acquisitionTaskState || work?.state || "").trim().toLowerCase();
}

export function isActiveAgentSquareWork(work = {}) {
  if (!work || typeof work !== "object") return false;
  if (String(work.state || "").toLowerCase() === "done") return false;
  const taskState = taskStateOf(work);
  if (TERMINAL_AGENT_WORK_STATES.has(taskState)) return false;
  return ACTIVE_AGENT_WORK_STATES.has(taskState);
}

function workMatchesAgent(work = {}, agentId = "") {
  const metadata = work?.metadata && typeof work.metadata === "object" ? work.metadata : {};
  const id = String(agentId || "").trim();
  return Boolean(id) && [work?.agentType, work?.agentId, work?.runtimeAgentId, metadata.agentId, metadata.runtimeAgentId]
    .some((value) => String(value || "").trim() === id);
}

export function activeAgentSquareWorkForAgent(works = [], agentId = "") {
  const entries = Array.isArray(works) ? works : [];
  return entries.find((work) => workMatchesAgent(work, agentId) && isActiveAgentSquareWork(work)) || null;
}

function workAccountKeys(work = {}) {
  const metadata = work?.metadata && typeof work.metadata === "object" ? work.metadata : {};
  return new Set([
    work?.accountKey,
    work?.accountId,
    metadata.accountKey,
    metadata.accountId,
    metadata.account_id
  ].map((value) => String(value || "").trim()).filter(Boolean));
}

export function activeAgentSquareWorkForAccount(works = [], { agentId = "", accountId = "", accountKey = "", taskId = "" } = {}) {
  const requestedAgentId = String(agentId || "").trim();
  const requestedTaskId = String(taskId || "").trim();
  const requestedAccountKeys = new Set([accountId, accountKey]
    .map((value) => String(value || "").trim())
    .filter(Boolean));
  if (!requestedAgentId || requestedAccountKeys.size === 0) return null;
  return (Array.isArray(works) ? works : []).find((work) => {
    if (!isActiveAgentSquareWork(work) || (requestedTaskId && String(work?.taskId || work?.metadata?.taskId || "").trim() === requestedTaskId)) return false;
    if (!workMatchesAgent(work, requestedAgentId)) return false;
    return [...workAccountKeys(work)].some((key) => requestedAccountKeys.has(key));
  }) || null;
}

export function agentSquareCancelPayload(agentId, work = {}) {
  const metadata = work?.metadata && typeof work.metadata === "object" ? work.metadata : {};
  const base = acquisitionRealtimeActionPayload(agentId, "cancel", work);
  return Object.fromEntries(Object.entries({
    ...base,
    agentId,
    action: "cancel",
    taskId: base.taskId || work.taskId || metadata.taskId || metadata.task_id || null,
    taskRunId: base.taskRunId || work.taskRunId || metadata.taskRunId || metadata.task_run_id || null,
    accountId: base.accountId || work.accountId || metadata.accountId || metadata.account_id || null
  }).filter(([, value]) => value !== null && value !== undefined && value !== ""));
}

function privateOutreachHasNoReceipt(value) {
  const fragments = [
    value,
    value?.message,
    value?.error?.message,
    value?.details?.message,
    value?.details?.transportError?.message,
    value?.providerError?.message,
    value?.receipt?.message
  ].filter((fragment) => fragment != null).map((fragment) => String(fragment));
  try { fragments.push(JSON.stringify(value)); } catch { /* Ignore circular provider payloads. */ }
  const text = fragments.join(" ").toLowerCase();
  return /没有目标收到平台成功回执|未收到平台成功回执|没有收到平台成功回执|no successful receipt|no target.*receipt|receipt.*pending|waiting.*receipt/.test(text);
}

function privateOutreachReceiptState(result) {
  const receipt = result?.receipt && typeof result.receipt === "object" ? result.receipt : result;
  const rawState = receipt?.state ?? receipt?.delivery_state ?? receipt?.deliveryState ?? receipt?.status;
  if (rawState == null || String(rawState).trim() === "") return null;
  const state = String(rawState).trim().toLowerCase();
  if (privateOutreachHasNoReceipt(result)) return "pending";
  if (["sent", "delivered", "success", "succeeded", "completed"].includes(state)) return "sent";
  if (["failed", "failure", "error", "rejected", "denied", "blocked"].includes(state)) return "failed";
  if (["pending", "processing", "queued", "submitted", "accepted", "unknown", "in_progress", "in-progress"].includes(state)) return "pending";
  return "pending";
}

const CSS = `
.sb-as-use:has(.sb-as-inbox-setup){max-width:780px;padding:28px 30px 52px}
.sb-as-inbox-setup{display:grid;gap:0}
.sb-as-inbox-flow{display:grid}.sb-as-inbox-section{padding:25px 0;border-bottom:1px solid #e8ebee}.sb-as-inbox-section-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px}.sb-as-inbox-section-title{display:grid;gap:4px}.sb-as-inbox-section-title strong{color:#1f2329;font-size:17px;line-height:1.45;font-weight:700}.sb-as-inbox-section-title span{color:#818b96;font-size:12px;line-height:1.6}.sb-as-inbox-section-status{display:inline-flex;align-items:center;gap:6px;flex:none;padding-top:4px;color:#7f8995;font-size:11px;white-space:nowrap}.sb-as-inbox-section-status i{width:7px;height:7px;border-radius:50%;background:#c9d0d7}.sb-as-inbox-section-status.is-ready{color:#299266}.sb-as-inbox-section-status.is-ready i{background:#2dac76}
.sb-as-inbox-account{display:flex;align-items:center;gap:12px;margin-top:17px;padding:14px 0}.sb-as-inbox-account-avatar{width:48px;height:48px;flex:none;border-radius:10px;overflow:hidden;background:#eef1f4}.sb-as-inbox-account-avatar .sb-task-person-avatar{width:100%;height:100%;border-radius:0}.sb-as-inbox-account-copy{display:grid;gap:3px;min-width:0;flex:1}.sb-as-inbox-account-copy strong{overflow:hidden;color:#303842;font-size:15px;text-overflow:ellipsis;white-space:nowrap}.sb-as-inbox-account-copy span{overflow:hidden;color:#89929d;font-size:11px;text-overflow:ellipsis;white-space:nowrap}.sb-as-inbox-account-select{height:34px;max-width:190px;padding:0 9px;border:1px solid #dce3e8;border-radius:7px;background:#fff;color:#45515d;font:inherit;font-size:11px}.sb-as-inbox-reauthorize{height:36px;padding:0 12px;border:1px solid #ced9e8;border-radius:8px;background:#f8fbff;color:#41699f;font:inherit;font-size:11px;font-weight:650;cursor:pointer}.sb-as-inbox-login-copy{max-width:520px;margin:14px 0 0;color:#7d8792;font-size:12px;line-height:1.7}.sb-as-inbox-login{height:42px;margin-top:16px;padding:0 16px;border:1px solid #1f2329;border-radius:8px;background:#1f2329;color:#fff;font:inherit;font-size:12px;font-weight:700;cursor:pointer}.sb-as-inbox-login:disabled,.sb-as-inbox-reauthorize:disabled{opacity:.55;cursor:not-allowed}
.sb-as-inbox-policy{min-width:0}.sb-as-inbox-policy-empty{margin-top:17px;color:#8a939d;font-size:12px;line-height:1.7}.sb-as-inbox-policy .sb-reception{max-width:none;margin:10px 0 0;padding:0;font-size:13px}.sb-as-inbox-policy .sb-reception-summary{padding:12px 0 16px}.sb-as-inbox-policy .sb-reception-section{padding:8px 0 13px}.sb-as-inbox-policy .sb-reception-section>summary{min-height:52px}.sb-as-inbox-policy .sb-reception-fields{padding:14px 0}.sb-as-inbox-policy .sb-reception-save{padding:18px 0 0}.sb-as-inbox-policy .sb-reception-notice{margin:12px 0}
.sb-as-inbox-launch{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:25px 0 0}.sb-as-inbox-launch-copy{display:grid;gap:4px}.sb-as-inbox-launch-copy strong{color:#1f2329;font-size:17px;font-weight:700}.sb-as-inbox-launch-copy span{max-width:460px;color:#818b96;font-size:12px;line-height:1.6}.sb-as-inbox-launch button{height:44px;flex:none;padding:0 18px;border:1px solid #1f2329;border-radius:8px;background:#1f2329;color:#fff;font:inherit;font-size:12px;font-weight:700;cursor:pointer}.sb-as-inbox-launch button:disabled{opacity:.48;cursor:not-allowed}.sb-as-inbox-error{margin-top:16px}
@media(max-width:640px){.sb-as-use:has(.sb-as-inbox-setup){padding:22px 16px 36px}.sb-as-inbox-section-head,.sb-as-inbox-launch{align-items:flex-start;flex-direction:column;gap:10px}.sb-as-inbox-account{align-items:flex-start;flex-wrap:wrap}.sb-as-inbox-account-select{width:100%;max-width:none;order:3}.sb-as-inbox-reauthorize{margin-left:auto}.sb-as-inbox-launch button{width:100%}}
.sb-as-use:has(.sb-as-gold-customer-service-setup){max-width:940px;padding:34px 38px 48px}
.sb-as-use:has(.sb-as-gold-customer-service-setup) .sb-as-use-panel{padding:0;border:0;border-radius:0;background:transparent}
.sb-as-gold-customer-service-setup{display:block}
.sb-as-gold-shell{display:grid;gap:0}
.sb-as-gold-hero{display:flex;align-items:flex-start;gap:16px;padding:8px 0 28px}
.sb-as-gold-hero-mark{display:grid;place-items:center;width:48px;height:48px;flex:none;border-radius:15px;background:#1f2329;color:#fff;font-size:13px;font-weight:700;letter-spacing:.08em;box-shadow:0 7px 18px rgba(31,35,41,.12)}
.sb-as-gold-hero-mark.sb-grok-avatar{border-radius:0;overflow:visible;background:transparent!important;box-shadow:none!important}
.sb-as-gold-hero-mark .sb-grok-avatar-svg{display:block;width:100%;height:100%;overflow:visible}
.sb-as-gold-hero-copy{min-width:0}
.sb-as-gold-eyebrow{color:#4267a5;font-size:11px;font-weight:700;letter-spacing:.08em}
.sb-as-gold-title{margin:6px 0 0;color:#1f2329;font-size:30px;line-height:1.22;letter-spacing:0;font-weight:750}
.sb-as-gold-subtitle{max-width:650px;margin:9px 0 0;color:#7b8490;font-size:14px;line-height:1.7}
.sb-as-gold-account{display:flex;align-items:center;gap:14px;min-width:0;padding:15px 16px;border:1px solid #e1e8f1;border-radius:13px;background:#f7faff}
.sb-as-gold-account.is-empty{align-items:flex-start}
.sb-as-gold-account-avatar{width:44px;height:44px;flex:none;overflow:hidden;border-radius:12px;background:#e9eef5}
.sb-as-gold-account-avatar .sb-task-person-avatar{width:100%;height:100%;border-radius:0}
.sb-as-gold-account-copy{display:grid;gap:3px;min-width:0;flex:1}
.sb-as-gold-account-label{color:#4267a5;font-size:10px;font-weight:700;letter-spacing:.05em}
.sb-as-gold-account-copy strong{overflow:hidden;color:#303842;font-size:14px;text-overflow:ellipsis;white-space:nowrap}
.sb-as-gold-account-copy span{overflow:hidden;color:#89929d;font-size:11px;text-overflow:ellipsis;white-space:nowrap}
.sb-as-gold-account-state{display:inline-flex;align-items:center;gap:6px;flex:none;color:#299266;font-size:11px;white-space:nowrap}
.sb-as-gold-account-state i{width:7px;height:7px;border-radius:50%;background:#2dac76}
.sb-as-gold-account-state.is-pending{color:#9a6a35}.sb-as-gold-account-state.is-pending i{background:#e8a33d}
.sb-as-gold-account-select{height:34px;max-width:190px;padding:0 9px;border:1px solid #d5dfeb;border-radius:8px;background:#fff;color:#45515d;font:inherit;font-size:11px}
.sb-as-gold-account-reauthorize{height:34px;padding:0 11px;border:1px solid #cbd9eb;border-radius:8px;background:#fff;color:#4267a5;font:inherit;font-size:11px;font-weight:650;cursor:pointer}
.sb-as-gold-account-reauthorize:hover{border-color:#4267a5;background:#f3f7fe}
.sb-as-gold-account-login{display:grid;gap:4px;min-width:0;flex:1}.sb-as-gold-account-login strong{color:#303842;font-size:14px}.sb-as-gold-account-login span{color:#7b8490;font-size:11px;line-height:1.55}
.sb-as-gold-account-action{height:36px;flex:none;padding:0 13px;border:1px solid #1f2329;border-radius:8px;background:#1f2329;color:#fff;font:inherit;font-size:11px;font-weight:700;cursor:pointer}.sb-as-gold-account-action:disabled,.sb-as-gold-account-reauthorize:disabled{opacity:.55;cursor:not-allowed}
.sb-as-gold-composer{margin-top:24px;padding:24px 26px 22px;border:1px solid #dce5ef;border-radius:16px;background:#fff;box-shadow:0 10px 28px rgba(45,61,80,.08)}
.sb-as-gold-composer-kicker{color:#4267a5;font-size:12px;font-weight:700;line-height:1.5}
.sb-as-gold-composer-input{display:block;width:100%;min-height:148px;margin-top:8px;box-sizing:border-box;resize:vertical;border:0;border-bottom:1px solid #e8edf2;padding:8px 0 15px;background:transparent;color:#1f2329;outline:none;font:inherit;font-size:18px;line-height:1.6}
.sb-as-gold-composer-input::placeholder{color:#a1aab4;opacity:1}
.sb-as-gold-composer-input:focus{border-bottom-color:#4267a5}
.sb-as-gold-composer-help{display:block;margin-top:11px;color:#8a929d;font-size:11px;line-height:1.55}
.sb-as-gold-suggestions{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-top:18px}.sb-as-gold-suggestions-label{margin-right:2px;color:#8a929d;font-size:11px}.sb-as-gold-suggestion{min-height:30px;padding:0 10px;border:1px solid #dfe7f1;border-radius:999px;background:#f8faff;color:#4267a5;font:inherit;font-size:11px;cursor:pointer}.sb-as-gold-suggestion:hover{border-color:#a9bfdc;background:#f1f6fd}
.sb-as-gold-launch{display:flex;align-items:center;justify-content:flex-end;gap:18px;margin-top:23px}.sb-as-gold-launch-button{height:46px;flex:none;padding:0 20px;border:1px solid #1f2329;border-radius:9px;background:#1f2329;color:#fff;font:inherit;font-size:12px;font-weight:700;cursor:pointer}.sb-as-gold-launch-button:hover{background:#343941}.sb-as-gold-launch-button:disabled{opacity:.48;cursor:not-allowed}.sb-as-gold-error{margin-top:16px}
@media(max-width:640px){.sb-as-use:has(.sb-as-gold-customer-service-setup){padding:24px 16px 36px}.sb-as-gold-hero{padding-top:0}.sb-as-gold-title{font-size:25px}.sb-as-gold-subtitle{font-size:13px}.sb-as-gold-account{align-items:flex-start;flex-wrap:wrap}.sb-as-gold-account-state{margin-left:auto}.sb-as-gold-account-select{width:100%;max-width:none;order:4}.sb-as-gold-account-reauthorize{margin-left:auto}.sb-as-gold-account-action{width:100%;margin-top:5px}.sb-as-gold-composer{padding:20px 18px 18px}.sb-as-gold-composer-input{min-height:135px;font-size:16px}.sb-as-gold-launch{align-items:stretch;flex-direction:column}.sb-as-gold-launch-button{width:100%}}
.sb-as-use:has(.sb-as-manager-inbox-setup){max-width:940px;padding:34px 38px 48px}
.sb-as-use:has(.sb-as-manager-inbox-setup) .sb-as-use-panel{padding:0;border:0;border-radius:0;background:transparent}
.sb-as-manager-inbox-setup{display:block}
.sb-as-manager-automation{margin-top:22px;padding:20px 0 19px;border-top:1px solid #edf0f3;border-bottom:1px solid #edf0f3}
.sb-as-manager-automation-head{display:flex;align-items:baseline;justify-content:space-between;gap:16px}
.sb-as-manager-automation-head>span{color:#8a929d;font-size:11px;line-height:1.5}
.sb-as-manager-automation-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;margin-top:14px}
.sb-as-manager-automation-item{display:grid;grid-template-columns:8px minmax(0,1fr);gap:9px;align-items:start}
.sb-as-manager-automation-item>i{width:8px;height:8px;margin-top:5px;border-radius:50%;background:#4267a5;box-shadow:0 0 0 4px #eef3fa}
.sb-as-manager-automation-item strong,.sb-as-manager-automation-item span{display:block}
.sb-as-manager-automation-item strong{color:#303842;font-size:12px;line-height:1.45}
.sb-as-manager-automation-item span{margin-top:4px;color:#89929d;font-size:11px;line-height:1.55}
.sb-as-manager-launch{align-items:flex-end;justify-content:space-between}
.sb-as-manager-launch-copy{display:grid;gap:4px;min-width:0}
.sb-as-manager-launch-copy strong{color:#303842;font-size:14px;line-height:1.45}
.sb-as-manager-launch-copy span{max-width:540px;color:#89929d;font-size:11px;line-height:1.55}
@media(max-width:640px){.sb-as-use:has(.sb-as-manager-inbox-setup){padding:24px 16px 36px}.sb-as-manager-automation{margin-top:20px;padding:18px 0}.sb-as-manager-automation-head{align-items:flex-start;flex-direction:column;gap:5px}.sb-as-manager-automation-list{grid-template-columns:1fr;gap:12px}.sb-as-manager-launch{align-items:stretch}.sb-as-manager-launch-copy span{max-width:none}}
.sb-as-use:has(.sb-as-live-danmaku-analysis-setup){max-width:940px;padding:34px 38px 48px}
.sb-as-use:has(.sb-as-live-danmaku-analysis-setup) .sb-as-use-panel{padding:0;border:0;border-radius:0;background:transparent}
.sb-as-live-danmaku-analysis-setup{display:block}
.sb-as-live-shell{display:grid;gap:0}
.sb-as-live-account{margin:0;border-color:#e1e8f1;background:#f7faff}
.sb-as-live-account .sb-task-account-selector{max-width:none;padding:0;border:0;border-radius:0;background:transparent}
.sb-as-live-account .sb-task-account-selector>:first-child{width:44px;height:44px;border-radius:12px}
.sb-as-live-account .sb-task-account-caption{color:#4267a5;font-size:10px;font-weight:700;letter-spacing:.05em}
.sb-as-live-account .sb-task-account-picker select{min-height:24px;border:0;background:transparent;color:#303842;font-size:14px;font-weight:650;outline:none}
.sb-as-live-account .sb-task-settings>summary{padding:6px 8px;border-radius:7px}
.sb-as-live-account .sb-task-settings>summary:hover{background:#edf3fb}
.sb-as-live-account .sb-task-settings button,.sb-as-live-account>button{height:36px!important;padding:0 13px!important;border:1px solid #1f2329!important;border-radius:8px!important;background:#1f2329!important;color:#fff!important;font:inherit!important;font-size:11px!important;font-weight:700!important;white-space:nowrap;cursor:pointer}
.sb-as-live-account .sb-task-settings button:disabled,.sb-as-live-account>button:disabled{opacity:.55;cursor:not-allowed}
.sb-as-live-composer{margin-top:24px}
.sb-as-live-launch{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-top:23px}
.sb-as-live-launch-copy{display:grid;gap:3px;min-width:0}
.sb-as-live-launch-copy strong{color:#1f2329;font-size:15px;font-weight:700}
.sb-as-live-launch-copy span{color:#8a929d;font-size:11px;line-height:1.5}
.sb-as-live-launch-button{height:46px;flex:none;padding:0 20px;border:1px solid #1f2329;border-radius:9px;background:#1f2329;color:#fff;font:inherit;font-size:12px;font-weight:700;cursor:pointer}
.sb-as-live-launch-button:hover{background:#343941}
.sb-as-live-launch-button:disabled{opacity:.48;cursor:not-allowed}
.sb-as-live-error{margin-top:16px}
@media(max-width:640px){.sb-as-use:has(.sb-as-live-danmaku-analysis-setup){padding:24px 16px 36px}.sb-as-live-account{align-items:flex-start;flex-wrap:wrap}.sb-as-live-account .sb-task-account-selector{flex-basis:100%}.sb-as-live-account .sb-task-settings{margin-left:auto}.sb-as-live-account .sb-task-settings button,.sb-as-live-account>button{width:100%!important}.sb-as-live-composer{padding:20px 18px 18px}.sb-as-live-launch{align-items:stretch;flex-direction:column}.sb-as-live-launch-button{width:100%}}
.sb-as-use:has(.sb-as-live-danmaku-outreach-setup){max-width:940px;padding:34px 38px 48px}
.sb-as-use:has(.sb-as-live-danmaku-outreach-setup) .sb-as-use-panel{padding:0;border:0;border-radius:0;background:transparent}
.sb-as-live-danmaku-outreach-setup{display:block}
.sb-as-live-outreach-shell{display:grid;gap:0}
.sb-as-live-outreach-automation{margin-top:22px;padding:20px 0 19px;border-top:1px solid #edf0f3;border-bottom:1px solid #edf0f3}
.sb-as-live-outreach-automation-head{display:flex;align-items:baseline;justify-content:space-between;gap:16px}
.sb-as-live-outreach-automation-head strong{color:#4267a5;font-size:12px;font-weight:700;line-height:1.5}
.sb-as-live-outreach-automation-head span{color:#8a929d;font-size:11px;line-height:1.5}
.sb-as-live-outreach-automation-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;margin-top:14px}
.sb-as-live-outreach-automation-item{display:grid;grid-template-columns:8px minmax(0,1fr);gap:9px;align-items:start}
.sb-as-live-outreach-automation-item>i{width:8px;height:8px;margin-top:5px;border-radius:50%;background:#4267a5;box-shadow:0 0 0 4px #eef3fa}
.sb-as-live-outreach-automation-item strong,.sb-as-live-outreach-automation-item span{display:block}
.sb-as-live-outreach-automation-item strong{color:#303842;font-size:12px;line-height:1.45}
.sb-as-live-outreach-automation-item span{margin-top:4px;color:#89929d;font-size:11px;line-height:1.55}
.sb-as-live-outreach-scope{display:flex;align-items:flex-start;gap:8px;margin-top:18px;color:#89929d;font-size:11px;line-height:1.6}
.sb-as-live-outreach-scope i{width:17px;height:17px;display:grid;place-items:center;flex:none;border-radius:50%;background:#eef3fa;color:#4267a5;font-style:normal;font-size:10px;font-weight:700}
.sb-as-live-outreach-config{display:grid;gap:16px;margin-top:23px;padding:19px 22px 20px;border:1px solid #dce5ef;border-radius:14px;background:#fff;box-shadow:0 9px 24px rgba(45,61,80,.06)}
.sb-as-live-outreach-config-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px}
.sb-as-live-outreach-config-head strong{color:#4267a5;font-size:12px;font-weight:700;line-height:1.5}
.sb-as-live-outreach-config-head span{color:#8995a4;font-size:11px;line-height:1.5}
.sb-as-live-outreach-config-grid{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(220px,.65fr);gap:18px;align-items:start}
.sb-as-live-outreach-config-field{display:grid;gap:7px;min-width:0}
.sb-as-live-outreach-config-field>span{color:#59636d;font-size:12px;font-weight:650;line-height:1.5}
.sb-as-live-outreach-config-field>span em{margin-left:3px;color:#c4453c;font-style:normal}
.sb-as-live-outreach-config-field small{color:#89929d;font-size:11px;line-height:1.55}
.sb-as-live-outreach-purpose,.sb-as-live-outreach-message{width:100%;box-sizing:border-box;resize:vertical;border:0;border-bottom:1px solid #e8edf2;padding:7px 0 11px;background:transparent;color:#1f2329;outline:none;font:inherit;font-size:15px;line-height:1.6}
.sb-as-live-outreach-purpose{min-height:73px}.sb-as-live-outreach-message{min-height:73px}
.sb-as-live-outreach-purpose::placeholder,.sb-as-live-outreach-message::placeholder{color:#a1aab4;opacity:1}
.sb-as-live-outreach-purpose:focus,.sb-as-live-outreach-message:focus{border-bottom-color:#4267a5}
.sb-as-live-outreach-suggestions{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
.sb-as-live-outreach-suggestions>span{margin-right:2px;color:#8a929d;font-size:11px}
.sb-as-live-outreach-suggestion{min-height:29px;padding:0 10px;border:1px solid #dfe7f1;border-radius:999px;background:#f8faff;color:#4267a5;font:inherit;font-size:11px;cursor:pointer}
.sb-as-live-outreach-suggestion:hover{border-color:#a9bfdc;background:#f1f6fd}
.sb-as-live-outreach-frequency{display:grid;gap:12px;padding-top:1px}
.sb-as-live-outreach-frequency-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px}
.sb-as-live-outreach-frequency label{display:grid;gap:7px;color:#59636d;font-size:11px;font-weight:650}
.sb-as-live-outreach-frequency input,.sb-as-live-outreach-frequency select{width:100%;height:35px;box-sizing:border-box;padding:0 9px;border:1px solid #dce5ef;border-radius:8px;background:#fbfcfe;color:#303842;font:inherit;font-size:12px;outline:none}
.sb-as-live-outreach-frequency input:focus,.sb-as-live-outreach-frequency select:focus{border-color:#4267a5;box-shadow:0 0 0 3px rgba(66,103,165,.08)}
.sb-as-live-outreach-config-note{display:flex;align-items:flex-start;gap:8px;color:#89929d;font-size:11px;line-height:1.6}
.sb-as-live-outreach-config-note i{width:17px;height:17px;display:grid;place-items:center;flex:none;border-radius:50%;background:#eef3fa;color:#4267a5;font-style:normal;font-size:10px;font-weight:700}
.sb-as-live-outreach-launch{align-items:flex-end;justify-content:space-between;margin-top:23px}
.sb-as-live-outreach-launch-copy{display:grid;gap:4px;min-width:0}
.sb-as-live-outreach-launch-copy strong{color:#303842;font-size:15px;line-height:1.45}
.sb-as-live-outreach-launch-copy span{max-width:540px;color:#89929d;font-size:11px;line-height:1.55}
.sb-as-live-outreach-error{margin-top:16px}
@media(max-width:760px){.sb-as-live-outreach-config-grid{grid-template-columns:1fr}.sb-as-live-outreach-frequency{padding-top:0}}
@media(max-width:640px){.sb-as-use:has(.sb-as-live-danmaku-outreach-setup){padding:24px 16px 36px}.sb-as-live-outreach-automation{margin-top:20px;padding:18px 0}.sb-as-live-outreach-automation-head{align-items:flex-start;flex-direction:column;gap:5px}.sb-as-live-outreach-automation-list{grid-template-columns:1fr;gap:12px}.sb-as-live-outreach-scope{margin-top:16px}.sb-as-live-outreach-config{padding:18px}.sb-as-live-outreach-config-head{align-items:flex-start;flex-direction:column;gap:4px}.sb-as-live-outreach-frequency-row{grid-template-columns:1fr}.sb-as-live-outreach-launch{align-items:stretch}.sb-as-live-outreach-launch-copy span{max-width:none}.sb-as-live-outreach-launch-button{width:100%}}
.sb-as-use:has(.sb-as-viral-work-analysis-setup),.sb-as-use:has(.sb-as-viral-work-analysis-running){max-width:940px;padding:34px 38px 48px}
.sb-as-use:has(.sb-as-viral-work-analysis-setup) .sb-as-use-panel,.sb-as-use:has(.sb-as-viral-work-analysis-running) .sb-as-use-panel{padding:0;border:0;border-radius:0;background:transparent}
.sb-as-viral-work-analysis-setup,.sb-as-viral-work-analysis-running{display:block}
.sb-as-viral-shell{display:grid;gap:0}
.sb-as-viral-source{display:grid;gap:10px;margin-top:18px}
.sb-as-viral-primary{padding:19px 22px 16px;border:1px solid #dce5ef;border-radius:14px;background:#fff;box-shadow:0 9px 24px rgba(45,61,80,.06)}
.sb-as-viral-source-kicker{color:#4267a5;font-size:12px;font-weight:700;line-height:1.5}
.sb-as-viral-url-row{display:flex;align-items:center;gap:10px;margin-top:10px;padding:10px 11px;border:1px solid #dce5ef;border-radius:10px;background:#fbfcfe}
.sb-as-viral-url-row:focus-within{border-color:#4267a5;box-shadow:0 0 0 3px rgba(66,103,165,.08)}
.sb-as-viral-url-icon{display:grid;place-items:center;width:25px;height:25px;flex:none;border-radius:7px;background:#f1f5fb;color:#4267a5;font-size:12px;font-weight:700}
.sb-as-viral-url-input{display:block;width:100%;min-width:0;height:31px;border:0;padding:0;background:transparent;color:#1f2329;outline:none;font:inherit;font-size:16px;line-height:1.5}
.sb-as-viral-url-input::placeholder{color:#a1aab4;opacity:1}
.sb-as-viral-source-help{display:block;margin:9px 2px 0;color:#8a929d;font-size:11px;line-height:1.55}
.sb-as-viral-focus{padding:16px 22px 15px;border:1px solid #e3eaf3;border-radius:14px;background:#f8faff}
.sb-as-viral-focus-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px}
.sb-as-viral-focus-label{color:#4267a5;font-size:12px;font-weight:700;line-height:1.5}
.sb-as-viral-focus-hint{color:#8995a4;font-size:11px;line-height:1.5;white-space:nowrap}
.sb-as-viral-focus-input{display:block;width:100%;min-height:92px;margin-top:8px;box-sizing:border-box;resize:vertical;border:0;border-bottom:1px solid #e8edf2;padding:8px 0 14px;background:transparent;color:#1f2329;outline:none;font:inherit;font-size:15px;line-height:1.6}
.sb-as-viral-focus-input::placeholder{color:#a1aab4;opacity:1}
.sb-as-viral-focus-input:focus{border-bottom-color:#4267a5}
.sb-as-viral-suggestions{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-top:16px}.sb-as-viral-suggestions-label{margin-right:2px;color:#8a929d;font-size:11px}.sb-as-viral-suggestion{min-height:30px;padding:0 10px;border:1px solid #dfe7f1;border-radius:999px;background:#f8faff;color:#4267a5;font:inherit;font-size:11px;cursor:pointer}.sb-as-viral-suggestion:hover{border-color:#a9bfdc;background:#f1f6fd}
.sb-as-viral-note{display:flex;align-items:flex-start;gap:8px;margin:1px 4px 0;color:#8a929d;font-size:11px;line-height:1.6}.sb-as-viral-note i{width:17px;height:17px;display:grid;place-items:center;flex:none;border-radius:50%;background:#eef3fa;color:#4267a5;font-style:normal;font-size:10px;font-weight:700}
.sb-as-viral-launch{display:flex;align-items:center;justify-content:flex-end;gap:18px;margin-top:16px}.sb-as-viral-launch-button{height:46px;flex:none;padding:0 20px;border:1px solid #1f2329;border-radius:9px;background:#1f2329;color:#fff;font:inherit;font-size:12px;font-weight:700;cursor:pointer}.sb-as-viral-launch-button:hover{background:#343941}.sb-as-viral-launch-button:disabled{opacity:.48;cursor:not-allowed}.sb-as-viral-error{margin-top:16px}
.sb-as-viral-running-body{margin-top:24px}.sb-as-viral-running-body>.sb-as-use-notice:first-child{margin-top:0}.sb-as-viral-running-body .sb-as-use-actions{margin-top:23px}
@media(max-width:640px){.sb-as-use:has(.sb-as-viral-work-analysis-setup),.sb-as-use:has(.sb-as-viral-work-analysis-running){padding:24px 16px 36px}.sb-as-viral-primary,.sb-as-viral-focus{padding:17px 18px 15px}.sb-as-viral-focus-head{align-items:flex-start;flex-direction:column;gap:3px}.sb-as-viral-url-input{font-size:14px}.sb-as-viral-focus-input{font-size:14px}.sb-as-viral-launch{align-items:stretch;flex-direction:column}.sb-as-viral-launch-button{width:100%}}
.sb-as{min-height:100%;padding-bottom:28px}
.sb-as-toolbar{display:flex;flex-direction:column;gap:8px;padding:28px 28px 10px}
.sb-as-cta{display:grid;gap:8px;max-width:760px;margin:0}
.sb-as-cta strong{color:#1F2329;font-size:24px;font-weight:700;line-height:1.3}
.sb-as-cta span{max-width:700px;color:#7B818A;font-size:14px;line-height:1.65}
.sb-as-filter-row{display:flex;align-items:center;gap:12px;min-width:0;margin-top:10px}
.sb-as-chips{display:flex;align-items:center;gap:10px;min-width:0;overflow-x:auto;flex-wrap:nowrap;padding:1px 1px 4px;scrollbar-width:none}
.sb-as-chips::-webkit-scrollbar{display:none}
.sb-as-chip{display:inline-flex;align-items:center;gap:6px;flex:none;min-width:78px;height:34px;font-size:13px;color:#59616B;padding:0 12px;border:1px solid rgba(15,15,15,.09);border-radius:999px;background:#fff;cursor:pointer;font-family:inherit;white-space:nowrap;transition:background-color .16s ease,border-color .16s ease,color .16s ease}
.sb-as-category-icon.sb-as-chip-icon{width:15px;height:15px;display:block;flex:none;fill:currentColor}
.sb-as-chip-label{line-height:1}
.sb-as-chip::after{content:attr(data-count);min-width:18px;height:18px;display:inline-grid;place-items:center;padding:0 3px;border-radius:999px;background:#F0F1F3;font-size:9px;line-height:18px;color:#79818B}
.sb-as-chip:hover{border-color:rgba(15,15,15,.18)}
.sb-as-chip.sb-on{background:#1F2329;border-color:#1F2329;color:#fff}
.sb-as-chip.sb-on::after{background:rgba(255,255,255,.2);color:#fff}
.sb-as-category-list{display:grid;gap:12px;padding:8px 28px 28px}
.sb-as-category-section{min-width:0;scroll-margin-top:20px}
.sb-as-category-section+.sb-as-category-section{padding-top:8px}
.sb-as-category-head{display:flex;align-items:flex-start;gap:12px;margin-bottom:10px}
.sb-as-category-icon{width:22px;height:22px;display:block;flex:none;margin-top:1px;fill:currentColor}
.sb-as-category-copy{min-width:0}
.sb-as-category-title{display:flex;align-items:baseline;gap:8px;color:#1F2329;font-size:17px;font-weight:700;line-height:1.35}
.sb-as-category-count{color:#9aa2ad;font-size:11px;font-weight:500}
.sb-as-sec-title{font-size:14px;font-weight:600;color:#1F2329;display:flex;align-items:baseline;gap:8px;padding:20px 28px 10px}
.sb-as-sec-sub{font-size:11px;color:#B0B4BB;font-weight:400}

.sb-as-team,.sb-as-grid,.sb-as-category-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}
.sb-as-dot{width:6px;height:6px;border-radius:50%;background:#57B26A;flex:none}
.sb-as-dot.sb-busy{background:#E8A33D}
.sb-as-dot.sb-waiting{background:#D45B5B}
.sb-as-dot.sb-blocked{background:#C94D4D}

.sb-as-card{position:relative;min-width:0;min-height:320px;background:#fff;border:1px solid rgba(15,15,15,.1);border-radius:20px;padding:28px 20px 18px;cursor:pointer;display:flex;flex-direction:column;align-items:center;color:#1F2329;box-shadow:0 3px 12px rgba(31,35,41,.045);transition:border-color .16s ease,box-shadow .16s ease,transform .16s ease}
.sb-as-card:hover{border-color:rgba(15,15,15,.2);box-shadow:0 14px 30px rgba(31,35,41,.1);transform:translateY(-2px)}
.sb-as-card.is-disabled{filter:grayscale(1);opacity:.52;cursor:default;box-shadow:0 2px 8px rgba(31,35,41,.03)}
.sb-as-card.is-disabled:hover{border-color:rgba(15,15,15,.1);box-shadow:0 2px 8px rgba(31,35,41,.03);transform:none}
.sb-as-card:focus-visible{outline:3px solid rgba(59,107,212,.28);outline-offset:3px}
.sb-as-hire:focus-visible{outline:2px solid rgba(59,107,212,.42);outline-offset:2px}
.sb-as-card-top{display:flex;flex-direction:column;align-items:center;gap:9px;width:100%;padding-top:7px}
.sb-as-ava{width:78px;height:78px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;color:#fff;font-size:24px;font-weight:600;overflow:hidden}
.sb-as-card .sb-as-ava{background:transparent;box-shadow:0 0 0 6px var(--sb-as-card-accent-soft,#F1F3F6)}
.sb-as-card .sb-as-ava img{border-radius:50%;mix-blend-mode:normal}
.sb-as-card .sb-as-ava.sb-grok-avatar,.sb-asd-ava.sb-grok-avatar,.sb-as-use-avatar.sb-grok-avatar{border-radius:0;overflow:visible;background:transparent!important;box-shadow:none!important}
.sb-grok-avatar-svg{display:block;width:100%;height:100%;overflow:visible}
.sb-as-name{max-width:100%;font-size:20px;font-weight:650;line-height:1.3;color:#1F2329;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sb-as-title{max-width:100%;font-size:13px;line-height:1.4;color:#777C84;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sb-as-provider{display:flex;align-items:center;justify-content:center;gap:6px;margin-top:9px;font-size:13px;color:#8A919C;line-height:1.4}
.sb-as-provider.is-hired{color:#12945A}
.sb-as-provider-check{width:17px;height:17px;display:grid;place-items:center;border:1.5px solid currentColor;border-radius:50%;font-size:11px;font-weight:700;line-height:1}
.sb-as-provider-dot{width:7px;height:7px;border-radius:50%;background:#B9C0C9}
.sb-as-provider-extra{color:#9A9FA7;margin-left:3px}
.sb-as-cat{position:absolute;top:16px;left:16px;flex:none;font-size:10.5px;color:var(--sb-as-card-accent,#536273);background:var(--sb-as-card-accent-soft,#F1F3F6);border:1px solid var(--sb-as-card-accent-border,#DCE2EA);border-radius:8px;padding:3px 8px}
.sb-as-desc{width:100%;min-height:44px;margin:14px 0 6px;font-size:13px;color:#666B73;line-height:1.65;text-align:center;overflow-wrap:anywhere}
.sb-as-tags{display:flex;justify-content:center;align-items:center;flex-wrap:wrap;gap:7px;min-height:29px;width:100%}
.sb-as-tag{font-size:12px;color:#646A73;background:#F3F4F6;border-radius:999px;padding:5px 11px;white-space:nowrap}
.sb-as-tag-skill{font-weight:500;padding:2px 9px;border-radius:999px}
.sb-as-card .sb-as-tag-skill{color:var(--sb-as-card-accent,#536273)!important;background:var(--sb-as-card-accent-soft,#F1F3F6)!important;border:1px solid var(--sb-as-card-accent-border,#DCE2EA)!important}
.sb-as-card[data-sb-agent-id="mkt-live-danmaku-analysis"] .sb-as-hire{border-color:#d6c9fa;background:#f0ebff;color:#6b4bb4}
.sb-as-card[data-sb-agent-id="mkt-live-danmaku-analysis"] .sb-as-hire:hover{border-color:#bda9ef;background:#e5dcff;color:#5c3fa8}
.sb-as-card[data-sb-agent-id="mkt-live-danmaku-analysis"] .sb-as-hire:disabled,.sb-as-card[data-sb-agent-id="mkt-live-danmaku-analysis"] .sb-as-hire.sb-disabled{border-color:#e1e3e6;background:#f1f2f3;color:#9aa0a8}
.sb-as-foot{width:100%;margin-top:auto;padding-top:18px}
.sb-as-foot-meta{display:flex;justify-content:center;align-items:center;gap:5px;min-height:18px;margin-bottom:10px;font-size:11.5px;color:#8A8F99;text-align:center}
.sb-as-rate{font-size:11.5px;color:#8A8F99}
.sb-as-hire{width:100%;min-height:48px;border:1px solid #D5E3F8;background:#EEF4FF;color:#4267A5;font-size:15px;font-weight:650;padding:0 15px;border-radius:999px;cursor:pointer;font-family:inherit;transition:background-color .16s ease,border-color .16s ease,color .16s ease}
.sb-as-hire:hover{background:#E2EEFF;border-color:#BFD4F1;color:#34578F}
.sb-as-hire:disabled,.sb-as-hire.sb-disabled{background:#F1F2F3;border-color:#E1E3E6;color:#9AA0A8;cursor:not-allowed}
.sb-as-hire:disabled:hover,.sb-as-hire.sb-disabled:hover{background:#F1F2F3;border-color:#E1E3E6;color:#9AA0A8}
.sb-as-hire.sb-hired{background:#EEF4FF;border-color:#D5E3F8;color:#4267A5}
.sb-as-hire.sb-hired:hover{background:#E2EEFF;border-color:#BFD4F1;color:#34578F}
.sb-as-employment-error{margin:0 0 16px;padding:11px 13px;border:1px solid #f1d8d1;border-radius:10px;color:#9a5547;background:#fff6f3;font-size:12px;line-height:1.55}
.sb-as-empty{grid-column:1/-1;padding:40px 28px;font-size:13px;color:#B0B4BB;text-align:center}

.sb-asd-head{display:flex;align-items:center;gap:16px;padding:26px 28px 18px}
.sb-asd-ava{width:64px;height:64px;border-radius:16px;flex:none;display:flex;align-items:center;justify-content:center;color:#fff;font-size:24px;font-weight:600;overflow:hidden}
.sb-asd-name{font-size:18px;font-weight:600;color:#1F2329}
.sb-asd-title{font-size:13px;color:#8A8F99;margin-top:3px}
.sb-asd-meta{font-size:12px;color:#8A8F99;margin-top:6px}
.sb-asd-actions{margin-left:auto;flex:none;display:flex;gap:8px}
.sb-asd-btn{border:1px solid rgba(15,15,15,0.16);background:#fff;color:#1F2329;font-size:13px;padding:8px 18px;border-radius:10px;cursor:pointer;font-family:inherit}
.sb-asd-btn:hover{background:#F5F6F8}
.sb-asd-btn.sb-primary{background:#1F2329;border-color:#1F2329;color:#fff}
.sb-asd-btn.sb-primary:hover{background:#33373F}
.sb-asd-sec{padding:4px 28px 14px}
.sb-asd-sec-title{font-size:12px;font-weight:600;color:#8A8F99;letter-spacing:.4px;margin:14px 0 8px}
.sb-asd-desc{font-size:13px;color:#1F2329;line-height:1.7}
.sb-as-employment{position:fixed;inset:0;z-index:2;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(20,24,28,.35);backdrop-filter:blur(5px)}
.sb-as-employment-card{width:min(460px,100%);padding:24px;border:1px solid rgba(15,15,15,.1);border-radius:16px;background:#fff;box-shadow:0 18px 50px rgba(15,15,15,.18)}
.sb-as-employment-title{font-size:17px;font-weight:700;color:#1F2329}.sb-as-employment-copy{margin-top:6px;font-size:12px;color:#777C84;line-height:1.6}
.sb-as-employment-fields{display:grid;gap:12px;margin-top:18px}.sb-as-employment-field{display:grid;gap:6px;font-size:12px;color:#5A5E66}.sb-as-employment-field input{height:38px;box-sizing:border-box;border:1px solid rgba(15,15,15,.14);border-radius:9px;padding:0 11px;font:inherit;color:#1F2329;outline:none}.sb-as-employment-field input:focus{border-color:#3B6BD4;box-shadow:0 0 0 3px rgba(59,107,212,.1)}
.sb-as-employment-help{font-size:11px;color:#8A8F99;line-height:1.55}.sb-as-employment-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:20px}.sb-as-employment-actions button{height:36px;padding:0 14px;border-radius:9px;font:inherit;font-size:12px;cursor:pointer}.sb-as-employment-cancel{border:1px solid rgba(15,15,15,.13);background:#fff;color:#5A5E66}.sb-as-employment-confirm{border:1px solid #1F2329;background:#1F2329;color:#fff}.sb-as-employment-confirm:hover{background:#383D45}.sb-as-managed-account{display:flex;align-items:center;gap:10px;margin-top:16px;padding:12px;border:1px solid #d8e4f7;border-radius:11px;background:#f7faff}.sb-as-managed-account-avatar{width:34px;height:34px;flex:none;overflow:hidden;border-radius:9px;background:#e9eef5}.sb-as-managed-account-copy{min-width:0}.sb-as-managed-account-copy strong,.sb-as-managed-account-copy span{display:block}.sb-as-managed-account-copy strong{overflow:hidden;color:#1F2329;font-size:13px;text-overflow:ellipsis;white-space:nowrap}.sb-as-managed-account-copy span{margin-top:3px;overflow:hidden;color:#7b8490;font-size:11px;text-overflow:ellipsis;white-space:nowrap}
.sb-as-account-busy{background:rgba(28,35,48,.42)}.sb-as-account-busy .sb-as-employment-card{border-color:#e2e7f0}.sb-as-account-busy-badge{display:inline-flex;align-items:center;gap:6px;margin-bottom:10px;color:#7357C8;font-size:11px;font-weight:700}.sb-as-account-busy-badge:before{content:"";width:7px;height:7px;border-radius:50%;background:#7357C8;box-shadow:0 0 0 4px #f0ebff}
.sb-as-use{max-width:940px;margin:0 auto;padding:24px 28px 44px}.sb-as-use-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:20px}.sb-as-use-eyebrow{font-size:11px;color:#7b8490;letter-spacing:.04em}.sb-as-use-title{margin:6px 0 0;font-size:26px;line-height:1.25;color:#1F2329}.sb-as-use-copy{margin:7px 0 0;color:#7b8490;font-size:13px;line-height:1.6}.sb-as-use-avatar{width:56px;height:56px;border-radius:16px;overflow:hidden;background:#f0f2f5;flex:none}.sb-as-use-avatar img{width:100%;height:100%;object-fit:cover}.sb-as-use-steps{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:16px}.sb-as-use-step{display:flex;align-items:center;gap:8px;padding:10px 12px;border:1px solid #e5e8ec;border-radius:10px;background:#fff;color:#9299a3;font-size:11px}.sb-as-use-step i{width:21px;height:21px;display:grid;place-items:center;border-radius:50%;background:#f0f2f5;color:#727b86;font-style:normal;font-weight:700}.sb-as-use-step.is-active{border-color:#1F2329;color:#1F2329;box-shadow:0 4px 12px rgba(31,35,41,.06)}.sb-as-use-step.is-active i{background:#1F2329;color:#fff}.sb-as-use-step.is-done{color:#55719b;border-color:#d9e1ee}.sb-as-use-step.is-done i{background:#e9eff8;color:#4267A5}.sb-as-use-panel{border:1px solid #e1e5e9;border-radius:15px;background:#fff;padding:20px}.sb-as-use-panel-title{font-size:15px;font-weight:700;color:#1F2329}.sb-as-use-panel-copy{margin:5px 0 18px;color:#7b8490;font-size:12px;line-height:1.55}.sb-as-use-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px 16px}.sb-as-use-field{display:grid;gap:6px;color:#59616b;font-size:11px}.sb-as-use-field.full{grid-column:1/-1}.sb-as-use-field select,.sb-as-use-field input{height:38px;box-sizing:border-box;border:1px solid #dfe4e9;border-radius:9px;padding:0 10px;background:#fff;color:#1F2329;outline:none;font:inherit;font-size:12px}.sb-as-use-field select:focus,.sb-as-use-field input:focus{border-color:#4267A5;box-shadow:0 0 0 3px rgba(66,103,165,.1)}.sb-as-use-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:22px}.sb-as-use-actions button{height:37px;padding:0 15px;border-radius:9px;border:1px solid #dfe4e9;background:#fff;color:#59616b;font:inherit;font-size:12px;cursor:pointer}.sb-as-use-actions button.primary{border-color:#1F2329;background:#1F2329;color:#fff}.sb-as-use-actions button.primary:hover{background:#343941}.sb-as-use-summary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:14px}.sb-as-use-summary-item{padding:12px;border:1px solid #edf0f3;border-radius:10px;background:#fafbfc}.sb-as-use-summary-item span{display:block;color:#8a929d;font-size:10px}.sb-as-use-summary-item strong{display:block;margin-top:5px;color:#1F2329;font-size:13px;line-height:1.4}.sb-as-use-notice{margin-top:14px;padding:11px 12px;border-radius:9px;color:#59616b;background:#f5f7fa;font-size:11px;line-height:1.6}.sb-as-use-inline.is-warning{color:#A45F4B}.sb-as-use-inline-action{margin-left:auto;border:0;background:transparent;color:#4267A5;font:inherit;font-size:11px;font-weight:650;cursor:pointer}.sb-as-use-inline-action:hover{text-decoration:underline}.sb-as-use-progress{height:7px;margin-top:18px;border-radius:99px;overflow:hidden;background:#edf0f3}.sb-as-use-progress i{display:block;height:100%;border-radius:inherit;background:#4267A5;transition:width .35s ease}.sb-as-use-progress-meta{display:flex;justify-content:space-between;margin-top:7px;color:#8a929d;font-size:10px}.sb-as-use-checklist{display:grid;gap:8px;margin-top:17px}.sb-as-use-check{display:flex;align-items:center;gap:9px;padding:10px 11px;border:1px solid #edf0f3;border-radius:9px;color:#7b8490;font-size:11px}.sb-as-use-check i{width:17px;height:17px;display:grid;place-items:center;border-radius:50%;background:#edf0f3;color:#8a929d;font-style:normal;font-size:10px}.sb-as-use-check.is-done{color:#4267A5;border-color:#dbe4f2;background:#f8faff}.sb-as-use-check.is-done i{background:#4267A5;color:#fff}.sb-as-use-result{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:18px}.sb-as-use-result.is-finder{grid-template-columns:repeat(4,minmax(0,1fr))}.sb-as-use-result strong{display:block;font-size:22px;letter-spacing:-.03em;color:#1F2329}.sb-as-use-result span{display:block;margin-top:3px;color:#8a929d;font-size:10px}.sb-as-use-result strong.accent{color:#4267A5}.sb-as-use-result strong.warn{color:#9A6A35}
.sb-as-use-notice.is-error{color:#9a5547;background:#fff5f2;border:1px solid #f2d8d1}.sb-as-use-actions button:disabled{opacity:.55;cursor:wait}.sb-as-cloud-boot{margin-top:14px;padding:15px 16px;border:1px solid #d8e3f3;border-radius:12px;background:#f7faff;color:#59616b}.sb-as-cloud-boot-head{display:flex;align-items:flex-start;gap:11px}.sb-as-cloud-boot-orb{position:relative;width:27px;height:27px;flex:none;border-radius:50%;background:#e5edf9}.sb-as-cloud-boot-orb:before{content:"";position:absolute;inset:5px;border:2px solid #4267A5;border-top-color:transparent;border-radius:50%;animation:sb-as-cloud-spin 1s linear infinite}.sb-as-cloud-boot-body{min-width:0}.sb-as-cloud-boot-title{color:#294a7e;font-size:13px;font-weight:700;line-height:1.4}.sb-as-cloud-boot-copy{margin-top:4px;color:#6e7d91;font-size:11px;line-height:1.55}.sb-as-cloud-boot-track{height:5px;margin-top:14px;overflow:hidden;border-radius:99px;background:#e6edf7}.sb-as-cloud-boot-track i{display:block;width:38%;height:100%;border-radius:inherit;background:#4267A5;box-shadow:0 0 12px rgba(66,103,165,.32);animation:sb-as-cloud-sweep 1.5s ease-in-out infinite}.sb-as-cloud-boot-meta{display:flex;justify-content:space-between;gap:12px;margin-top:8px;color:#718096;font-size:10px}.sb-as-cloud-boot-meta strong{color:#4267A5;font-weight:650}.sb-as-cloud-boot-note{margin-top:9px;color:#8995a4;font-size:10px;line-height:1.5}.sb-as-cloud-boot.is-login{border-color:#cfe0f5;background:#f4f8ff}.sb-as-cloud-boot.is-login .sb-as-cloud-boot-orb{background:#e0efff}.sb-as-cloud-boot.is-login .sb-as-cloud-boot-orb:before{border-color:#2d9a68;border-top-color:transparent}.sb-as-cloud-boot.is-login .sb-as-cloud-boot-title{color:#246b4d}.sb-as-cloud-boot.is-login .sb-as-cloud-boot-track{background:#dff0e7}.sb-as-cloud-boot.is-login .sb-as-cloud-boot-track i{width:100%;background:#2d9a68;box-shadow:none;animation:none}.sb-as-cloud-boot.is-error{border-color:#f0d4cd;background:#fff7f4}.sb-as-cloud-boot.is-error .sb-as-cloud-boot-orb{background:#f9e6e0}.sb-as-cloud-boot.is-error .sb-as-cloud-boot-orb:before{border-color:#b7604e;border-top-color:transparent;animation:none}.sb-as-cloud-boot.is-error .sb-as-cloud-boot-title{color:#9a5547}.sb-as-cloud-boot.is-error .sb-as-cloud-boot-track{background:#f3dfda}.sb-as-cloud-boot.is-error .sb-as-cloud-boot-track i{width:100%;background:#b7604e;box-shadow:none;animation:none}@keyframes sb-as-cloud-spin{to{transform:rotate(360deg)}}@keyframes sb-as-cloud-sweep{0%{transform:translateX(-120%)}50%{transform:translateX(180%)}100%{transform:translateX(280%)}}
.sb-as-fixed-mode{display:flex;align-items:center;gap:9px;min-height:38px;box-sizing:border-box;margin:0;padding:0 12px;border:1px solid #dfe4e9;border-radius:9px;background:#fbfcfd;color:#66717d;font-size:11px;line-height:1.45}.sb-as-fixed-mode i{width:7px;height:7px;flex:none;border-radius:50%;background:#20a66a}.sb-as-fixed-mode strong{color:#1F2329;font-size:12px;font-weight:650}.sb-as-fixed-mode span{min-width:0;color:#7d8691}
.sb-as-use-field textarea{width:100%;min-height:76px;box-sizing:border-box;resize:vertical;border:1px solid #dfe4e9;border-radius:9px;padding:10px;background:#fff;color:#1F2329;outline:none;font:inherit;font-size:12px;line-height:1.55}.sb-as-use-field textarea:focus{border-color:#4267A5;box-shadow:0 0 0 3px rgba(66,103,165,.1)}.sb-as-use-field.is-error input,.sb-as-use-field.is-error select,.sb-as-use-field.is-error textarea{border-color:#c96b58;background:#fffaf8}.sb-as-use-field-error{color:#a55342;font-size:10px;line-height:1.45}.sb-as-analysis-source{display:grid;gap:8px;margin-bottom:19px;padding:16px 17px;border:1px solid #dfe7f2;border-radius:12px;background:#f8faff}.sb-as-analysis-source-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px}.sb-as-analysis-source-head strong{color:#1F2329;font-size:14px;line-height:1.4}.sb-as-analysis-source-head span{color:#8a929d;font-size:10px;white-space:nowrap}.sb-as-analysis-source label{color:#59616b;font-size:11px;font-weight:650}.sb-as-analysis-url{width:100%;height:42px;box-sizing:border-box;border:1px solid #d5dfed;border-radius:9px;padding:0 12px;background:#fff;color:#1F2329;outline:none;font:inherit;font-size:12px}.sb-as-analysis-url::placeholder{color:#a1aab6}.sb-as-analysis-url:focus{border-color:#4267A5;box-shadow:0 0 0 3px rgba(66,103,165,.1)}.sb-as-analysis-source small{color:#7d8793;font-size:10.5px;line-height:1.5}.sb-as-analysis-source.is-error{border-color:#f0d4cd;background:#fff8f6}.sb-as-analysis-source.is-error .sb-as-analysis-url{border-color:#c96b58}.sb-as-inbox-authorize{height:38px;flex:none;padding:0 13px;border:1px solid #4267A5;border-radius:9px;background:#f6f9ff;color:#34578f;font:inherit;font-size:11px;font-weight:650;cursor:pointer}.sb-as-inbox-authorize:hover{background:#edf3fc}.sb-as-inbox-authorize:disabled{opacity:.58;cursor:wait}.sb-as-inbox-planning{display:flex;align-items:center;gap:13px;margin-top:16px;padding:16px;border:1px solid #d9e4f3;border-radius:12px;background:#f8faff}.sb-as-inbox-planning>i{position:relative;width:30px;height:30px;flex:none;border-radius:50%;background:#e7eef9}.sb-as-inbox-planning>i:after{content:"";position:absolute;inset:6px;border:2px solid #4267A5;border-top-color:transparent;border-radius:50%;animation:sb-as-cloud-spin 1s linear infinite}.sb-as-inbox-planning strong,.sb-as-inbox-planning span{display:block}.sb-as-inbox-planning strong{color:#294a7e;font-size:13px}.sb-as-inbox-planning span{margin-top:4px;color:#748195;font-size:11px}
.sb-as-cloud-exit{position:fixed;inset:0;z-index:9700;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(31,35,41,.22);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px)}.sb-as-cloud-exit-card{width:min(440px,calc(100vw - 36px));padding:24px;border:1px solid #dfe5ed;border-radius:15px;background:#fff;box-shadow:0 24px 70px rgba(31,35,41,.2)}.sb-as-cloud-exit-kicker{font-size:10px;color:#4267A5;letter-spacing:.08em}.sb-as-cloud-exit-title{margin-top:6px;color:#1F2329;font-size:18px;line-height:1.4}.sb-as-cloud-exit-copy{margin-top:9px;color:#687383;font-size:12px;line-height:1.7}.sb-as-cloud-exit-note{margin-top:14px;padding:11px 12px;border-radius:9px;background:#f6f8fb;color:#59616b;font-size:11px;line-height:1.6}.sb-as-cloud-exit-actions{display:flex;justify-content:flex-end;gap:9px;margin-top:20px}.sb-as-cloud-exit-actions button{height:37px;padding:0 14px;border:1px solid #dfe4ea;border-radius:9px;background:#fff;color:#59616b;font:inherit;font-size:12px;cursor:pointer}.sb-as-cloud-exit-actions button.primary{border-color:#1F2329;background:#1F2329;color:#fff}.sb-as-cloud-exit-actions button:hover{background:#f5f7f9}.sb-as-cloud-exit-actions button.primary:hover{background:#343941}
.sb-as-analysis-batch{background:#f4f7fc;border-color:#cfdcf0}.sb-as-analysis-account-list{display:flex;flex-wrap:wrap;gap:6px;margin-top:2px}.sb-as-analysis-account-list span{padding:5px 8px;border:1px solid #e0e6ef;border-radius:6px;background:#fff;color:#4f5965;font-size:10px;line-height:1.2}
/* Lead-miner task flow: a compact command center rather than a generic form. */
.sb-as-use-intro{display:grid;grid-template-columns:minmax(0,1fr) 250px;gap:16px;margin-bottom:14px}.sb-as-use-callout{padding:16px 18px;border:1px solid #dce5f2;border-radius:13px;background:#f8faff}.sb-as-use-callout strong{display:block;color:#1F2329;font-size:14px;line-height:1.45}.sb-as-use-callout span{display:block;margin-top:6px;color:#6e7783;font-size:11px;line-height:1.65}.sb-as-use-output{padding:16px 18px;border:1px solid #e4e7eb;border-radius:13px;background:#fff}.sb-as-use-output-label{font-size:10px;color:#89919c}.sb-as-use-output strong{display:block;margin-top:7px;color:#1F2329;font-size:14px}.sb-as-use-output span{display:block;margin-top:5px;color:#89919c;font-size:11px;line-height:1.5}.sb-as-use-section{margin-top:18px;padding-top:16px;border-top:1px solid #edf0f3}.sb-as-use-section-title{font-size:12px;font-weight:700;color:#1F2329}.sb-as-use-section-copy{margin:4px 0 11px;color:#8a929d;font-size:11px;line-height:1.55}.sb-as-use-choice-row{display:flex;gap:8px;flex-wrap:wrap}.sb-as-use-choice{min-height:36px;padding:0 12px;border:1px solid #dfe4e9;border-radius:9px;background:#fff;color:#626b76;font:inherit;font-size:11px;cursor:pointer}.sb-as-use-choice.is-selected{border-color:#4267A5;background:#eff3fa;color:#34578f;box-shadow:0 0 0 2px rgba(66,103,165,.08)}.sb-as-use-signal-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.sb-as-use-signal{display:flex;align-items:flex-start;gap:8px;padding:10px 11px;border:1px solid #e7eaee;border-radius:10px;background:#fff;color:#68717c;font-size:11px;line-height:1.45;cursor:pointer}.sb-as-use-signal input{margin:2px 0 0;accent-color:#4267A5}.sb-as-use-signal:has(input:checked){border-color:#cfdcf0;background:#f8faff;color:#34578f}.sb-as-use-textarea{width:100%;min-height:70px;box-sizing:border-box;resize:vertical;border:1px solid #dfe4e9;border-radius:9px;padding:10px;background:#fff;color:#1F2329;outline:none;font:inherit;font-size:12px;line-height:1.55}.sb-as-use-textarea:focus{border-color:#4267A5;box-shadow:0 0 0 3px rgba(66,103,165,.1)}.sb-as-use-inline{display:flex;align-items:center;gap:9px;color:#68717c;font-size:11px}.sb-as-use-inline input{accent-color:#4267A5}.sb-as-use-inline strong{color:#1F2329;font-weight:600}.sb-as-use-review{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(240px,.8fr);gap:14px;margin-top:16px}.sb-as-use-review-list{display:grid;gap:8px}.sb-as-use-review-row{display:flex;justify-content:space-between;gap:16px;padding:11px 12px;border:1px solid #edf0f3;border-radius:9px;background:#fafbfc;font-size:11px}.sb-as-use-review-row span{color:#8a929d}.sb-as-use-review-row strong{max-width:65%;color:#1F2329;font-weight:600;text-align:right;line-height:1.45}.sb-as-use-evidence{padding:13px 14px;border:1px solid #e3e8f0;border-radius:11px;background:#f8faff}.sb-as-use-evidence-title{font-size:11px;font-weight:700;color:#34578f}.sb-as-use-evidence-item{margin-top:10px;padding-top:10px;border-top:1px solid #e5ebf4;color:#5e6b7a;font-size:11px;line-height:1.55}.sb-as-use-evidence-item:first-of-type{border-top:0;padding-top:0}.sb-as-use-evidence-item strong{display:block;color:#1F2329;font-weight:600}.sb-as-use-evidence-item span{display:block;margin-top:3px;color:#7d8998}.sb-as-use-running-summary{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}.sb-as-use-running-pill{padding:8px 11px;border-radius:9px;background:#f5f7fa;color:#66717d;font-size:11px}.sb-as-use-running-pill strong{color:#1F2329;font-size:13px;margin-right:3px}.sb-as-use-live-feed{display:grid;gap:7px;margin-top:16px}.sb-as-use-live-item{display:grid;grid-template-columns:7px minmax(0,1fr) auto;gap:9px;align-items:start;padding:10px 11px;border:1px solid #edf0f3;border-radius:9px;background:#fff;color:#66717d;font-size:11px;line-height:1.5}.sb-as-use-live-item i{width:7px;height:7px;margin-top:4px;border-radius:50%;background:#4267A5}.sb-as-use-live-item strong{display:block;color:#1F2329;font-weight:600}.sb-as-use-live-item span{color:#8a929d;white-space:nowrap}.sb-as-use-live-item em{display:inline-block;margin-left:6px;padding:2px 6px;border-radius:5px;background:#eff3fa;color:#4267A5;font-style:normal;font-size:10px}
.sb-as-use:has(.sb-as-finder-consumer){max-width:1040px}.sb-as-use-steps.is-finder{grid-template-columns:repeat(2,minmax(0,1fr))}.sb-as-finder-consumer{padding:25px 26px}.sb-as-finder-goal,.sb-as-finder-source-input{width:100%;box-sizing:border-box;resize:vertical;border:1px solid #d9dfe7;border-radius:10px;padding:13px 14px;background:#fff;color:#1F2329;outline:none;font:inherit;font-size:13px;line-height:1.65}.sb-as-finder-goal{min-height:132px;font-size:14px}.sb-as-finder-source-input{min-height:82px;margin-top:12px}.sb-as-finder-goal:focus,.sb-as-finder-source-input:focus{border-color:#4267A5;box-shadow:0 0 0 3px rgba(66,103,165,.1)}.sb-as-finder-suggestions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.sb-as-finder-suggestion{min-height:32px;padding:0 11px;border:1px solid #dfe5ec;border-radius:8px;background:#fff;color:#687383;font:inherit;font-size:10.5px;cursor:pointer}.sb-as-finder-suggestion:hover{border-color:#b9c9df;background:#f8faff;color:#34578f}.sb-as-finder-source{margin-top:19px;border-top:1px solid #edf0f3;border-bottom:1px solid #edf0f3}.sb-as-finder-source>summary{display:flex;align-items:center;gap:10px;padding:14px 1px;color:#1F2329;cursor:pointer;list-style:none}.sb-as-finder-source>summary::-webkit-details-marker{display:none}.sb-as-finder-source>summary:after{content:"+";width:22px;height:22px;display:grid;place-items:center;margin-left:auto;border-radius:50%;background:#f0f2f5;color:#7c8590;font-size:14px}.sb-as-finder-source[open]>summary:after{content:"−"}.sb-as-finder-source>summary strong,.sb-as-finder-source>summary span{display:block}.sb-as-finder-source>summary strong{font-size:12px}.sb-as-finder-source>summary span{margin-top:3px;color:#9299a3;font-size:10px}.sb-as-finder-source-body{padding:2px 0 15px}.sb-as-finder-source-head{display:flex;align-items:center;justify-content:space-between;gap:18px}.sb-as-finder-source-help{color:#89929d;font-size:10.5px;line-height:1.55}.sb-as-finder-source-actions{display:flex;gap:7px;flex:none}.sb-as-finder-source-actions button{height:34px;padding:0 11px;border:1px solid #dfe4ea;border-radius:8px;background:#fff;color:#59616b;font:inherit;font-size:10.5px;cursor:pointer}.sb-as-finder-source-actions button:hover{border-color:#b9c9df;background:#f8faff}.sb-as-finder-file{position:relative;display:flex;align-items:center;gap:10px;margin-top:10px;padding:12px 13px;border:1px dashed #d7dde5;border-radius:10px;background:#fafbfc;color:#59616b;cursor:pointer}.sb-as-finder-file:hover{border-color:#aebfd8;background:#f8faff}.sb-as-finder-file input{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}.sb-as-finder-file-icon{width:28px;height:28px;display:grid;place-items:center;flex:none;border-radius:8px;background:#edf2f9;color:#4267A5;font-size:14px;font-weight:700}.sb-as-finder-file strong,.sb-as-finder-file span{display:block}.sb-as-finder-file strong{color:#343a43;font-size:11px}.sb-as-finder-file div>span{margin-top:3px;color:#9299a3;font-size:10px;line-height:1.4}.sb-as-finder-source-foot{margin-top:9px;color:#8a929d;font-size:10px;line-height:1.45}.sb-as-finder-source-foot span:first-child{color:#4267A5;font-weight:650}.sb-as-finder-advanced{margin-top:12px;border-bottom:1px solid #edf0f3}.sb-as-finder-advanced summary{display:flex;align-items:center;gap:9px;padding:13px 1px;color:#1F2329;cursor:pointer;list-style:none}.sb-as-finder-advanced summary::-webkit-details-marker{display:none}.sb-as-finder-advanced summary:after{content:"+";width:20px;height:20px;display:grid;place-items:center;margin-left:auto;border-radius:50%;background:#f0f2f5;color:#7c8590;font-size:14px}.sb-as-finder-advanced[open] summary:after{content:"−"}.sb-as-finder-advanced summary strong{font-size:11.5px}.sb-as-finder-advanced summary span{color:#9299a3;font-size:10px}.sb-as-finder-advanced-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px 14px;padding:2px 0 15px}.sb-as-finder-advanced-fields .full{grid-column:1/-1}.sb-as-finder-option{display:flex;align-items:center;gap:8px;min-height:38px;padding:0 10px;border:1px solid #e3e7ec;border-radius:9px;background:#fbfcfd;color:#59616b;font-size:10.5px;line-height:1.45;cursor:pointer}.sb-as-finder-option input{accent-color:#4267A5}.sb-as-finder-actions button.primary:disabled{border-color:#dfe3e8;background:#eceff2;color:#9aa1aa;cursor:not-allowed}.sb-as-finder-working{display:flex;align-items:center;gap:9px;margin-top:14px;padding:11px 12px;border-top:1px solid #edf0f3;border-bottom:1px solid #edf0f3;color:#687383;font-size:11px}.sb-as-finder-working i{width:14px;height:14px;flex:none;border:2px solid #cbd7e8;border-top-color:#4267A5;border-radius:50%;animation:sb-as-cloud-spin .9s linear infinite}.sb-as-finder-result{display:grid;gap:10px;margin-top:18px}.sb-as-finder-result-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;padding:14px 15px;border:1px solid #e2e8f0;border-radius:9px;background:#fbfcfe}.sb-as-finder-result-row strong{display:block;color:#1f2329;font-size:13px}.sb-as-finder-result-row span{display:block;margin-top:5px;color:#6d7682;font-size:10.5px;line-height:1.5}.sb-as-finder-score{align-self:start;min-width:52px;text-align:right;color:#4267a5;font-size:20px;font-weight:700}
.sb-as-user-research-list .sb-as-finder-result-row{grid-template-columns:auto minmax(0,1fr) auto;align-items:start;cursor:pointer}.sb-as-user-research-list input{width:16px;height:16px;margin:2px 0 0;accent-color:#4267A5}.sb-as-user-research-list .sb-as-finder-result-row:has(input:checked){border-color:#b8c9e3;background:#f7f9fd}
.sb-as-lead-setup{display:grid;grid-template-columns:minmax(0,1fr);gap:14px;align-items:start}
.sb-as-use:has(.sb-as-lead-setup){max-width:1040px}.sb-as-use-panel:has(.sb-as-lead-setup){border:0;padding:0;background:transparent}
.sb-as-lead-main{display:grid;gap:11px;min-width:0}
.sb-as-lead-hero{padding:20px 21px 19px;border:1px solid #dce6f5;border-radius:16px;background:linear-gradient(135deg,#f5f8ff 0%,#fff 75%)}
.sb-as-lead-kicker{display:inline-flex;align-items:center;gap:6px;color:#4267A5;font-size:11px;font-weight:700;letter-spacing:.03em}.sb-as-lead-kicker:before{content:"";width:6px;height:6px;border-radius:50%;background:#4267A5}
.sb-as-lead-hero h2{margin:8px 0 0;color:#1F2329;font-size:22px;line-height:1.3;letter-spacing:-.02em}.sb-as-lead-hero p{margin:7px 0 0;color:#707b89;font-size:12px;line-height:1.65}
.sb-as-lead-card{padding:16px 17px 17px;border:1px solid #e2e7ed;border-radius:14px;background:#fff;box-shadow:0 5px 14px rgba(31,35,41,.025)}
.sb-as-lead-card-title{font-size:14px;font-weight:700;color:#1F2329}.sb-as-lead-card-copy{margin-top:4px;color:#89929e;font-size:11px;line-height:1.5}
.sb-as-lead-source-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-top:13px}.sb-as-lead-source{display:grid;grid-template-columns:30px minmax(0,1fr);grid-template-rows:auto auto;column-gap:9px;align-items:center;text-align:left;padding:11px 12px;border:1px solid #e2e7ed;border-radius:11px;background:#fff;color:#1F2329;cursor:pointer;font-family:inherit;transition:border-color .16s ease,background-color .16s ease,box-shadow .16s ease}.sb-as-lead-source:hover{border-color:#b9cbe6;background:#fbfcff}.sb-as-lead-source.is-selected{border-color:#4267A5;background:#f4f7fd;box-shadow:0 0 0 2px rgba(66,103,165,.1)}.sb-as-lead-source-icon{grid-row:1 / span 2;width:30px;height:30px;display:grid;place-items:center;border-radius:9px;background:#eef3fc;color:#4267A5;font-size:12px;font-weight:700}.sb-as-lead-source strong{font-size:12px;line-height:1.35}.sb-as-lead-source small{margin-top:2px;color:#8a929d;font-size:10px;line-height:1.35}
.sb-as-lead-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:11px}.sb-as-lead-fields .sb-as-use-field{gap:5px}.sb-as-lead-fields .sb-as-use-field:first-child:last-child{grid-column:1/-1}.sb-as-lead-fields select,.sb-as-lead-fields input{height:40px;border-radius:10px;font-size:12px}.sb-as-lead-auth{display:flex;align-items:flex-start;gap:7px;margin-top:10px;color:#7d8793;font-size:11px;line-height:1.4}.sb-as-lead-auth i{width:17px;height:17px;display:grid;place-items:center;flex:none;border-radius:50%;background:#edf0f4;color:#7d8793;font-style:normal;font-size:10px;font-weight:700}.sb-as-lead-auth.is-ready{align-items:center;color:#4267A5}.sb-as-lead-auth.is-ready i{background:#e8effa;color:#4267A5}.sb-as-lead-auth.is-warning{align-items:center;color:#a45f4b}.sb-as-lead-auth.is-warning i{background:#f9ece8;color:#a45f4b}.sb-as-lead-auth.is-progress{align-items:flex-start;color:#4267A5}.sb-as-lead-auth.is-progress>i{margin-top:2px;background:#e8effa;color:#4267A5;animation:sb-as-lead-pulse 1.2s ease-in-out infinite}.sb-as-lead-auth-detail{display:grid;gap:2px;min-width:0;flex:1}.sb-as-lead-auth-detail strong{color:#4267A5;font-size:11px;font-weight:650;line-height:1.4}.sb-as-lead-auth-detail span{color:#8a929d;font-size:10px;line-height:1.4;overflow-wrap:anywhere;word-break:break-word}.sb-as-lead-auth-track{height:4px;margin-top:5px;overflow:hidden;border-radius:99px;background:#e9eef6}.sb-as-lead-auth-track i{display:block;height:100%;border-radius:inherit;background:#4267A5;transition:width .45s ease}@keyframes sb-as-lead-pulse{0%,100%{opacity:.45;transform:scale(.9)}50%{opacity:1;transform:scale(1)}}.sb-as-lead-link{margin-left:auto;border:0;background:transparent;color:#4267A5;font:inherit;font-size:11px;font-weight:650;cursor:pointer}.sb-as-lead-link:hover{text-decoration:underline}
.sb-as-lead-scope-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:13px}.sb-as-lead-scope{min-height:58px;display:grid;align-content:center;gap:4px;text-align:left;padding:9px 10px;border:1px solid #e2e7ed;border-radius:10px;background:#fff;color:#1F2329;cursor:pointer;font-family:inherit;transition:border-color .16s ease,background-color .16s ease}.sb-as-lead-scope:hover{border-color:#b9cbe6}.sb-as-lead-scope.is-selected{border-color:#4267A5;background:#f4f7fd;box-shadow:0 0 0 2px rgba(66,103,165,.09)}.sb-as-lead-scope strong{font-size:11px;line-height:1.35}.sb-as-lead-scope small{color:#8b949f;font-size:10px;line-height:1.3}.sb-as-lead-url,.sb-as-lead-prompt{width:100%;box-sizing:border-box;resize:vertical;border:1px solid #dfe5ec;border-radius:10px;padding:11px 12px;background:#fff;color:#1F2329;outline:none;font:inherit;font-size:12px;line-height:1.55}.sb-as-lead-url{min-height:58px;margin-top:10px}.sb-as-lead-prompt{min-height:76px;margin-top:13px}.sb-as-lead-url:focus,.sb-as-lead-prompt:focus{border-color:#4267A5;box-shadow:0 0 0 3px rgba(66,103,165,.1)}
.sb-as-lead-signal-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:13px}.sb-as-lead-signal{display:grid;grid-template-columns:16px minmax(0,1fr);grid-template-rows:auto auto;column-gap:7px;padding:10px 11px;border:1px solid #e2e7ed;border-radius:10px;background:#fff;color:#1F2329;cursor:pointer}.sb-as-lead-signal input{grid-row:1 / span 2;margin:2px 0 0;accent-color:#4267A5}.sb-as-lead-signal strong{font-size:11px;line-height:1.35}.sb-as-lead-signal small{margin-top:3px;color:#8a929d;font-size:10px;line-height:1.35}.sb-as-lead-signal.is-selected{border-color:#c7d5ea;background:#f7f9fe}.sb-as-lead-signal.is-selected strong{color:#34578f}
.sb-as-lead-audience-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:13px}.sb-as-lead-audience{display:grid;grid-template-columns:16px minmax(0,1fr);grid-template-rows:auto auto;column-gap:7px;padding:12px 11px;border:1px solid #d9e2ef;border-radius:10px;background:#fff;color:#1F2329;cursor:pointer}.sb-as-lead-audience input{grid-row:1 / span 2;margin:2px 0 0;accent-color:#4267A5}.sb-as-lead-audience strong{font-size:12px;line-height:1.35}.sb-as-lead-audience small{margin-top:3px;color:#8a929d;font-size:10px;line-height:1.35}.sb-as-lead-audience.is-selected{border-color:#4267A5;background:#f3f7fe;box-shadow:0 0 0 2px rgba(66,103,165,.09)}.sb-as-lead-audience.is-selected strong{color:#34578f}.sb-as-lead-audience-meta{display:flex;justify-content:space-between;align-items:center;margin-top:13px;color:#8a929d;font-size:10px}.sb-as-lead-audience-meta strong{color:#4267A5;font-weight:650}.sb-as-lead-audience-input-label{margin-top:15px;color:#697482;font-size:11px;font-weight:650}
.sb-as-lead-advanced{border:1px solid #e2e7ed;border-radius:14px;background:#fbfcfd;overflow:hidden}.sb-as-lead-advanced summary{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:13px 15px;color:#1F2329;cursor:pointer;list-style:none}.sb-as-lead-advanced summary::-webkit-details-marker{display:none}.sb-as-lead-advanced summary:after{content:"+";width:20px;height:20px;display:grid;place-items:center;border-radius:50%;background:#eef1f5;color:#7d8793;font-size:15px}.sb-as-lead-advanced[open] summary:after{content:"−"}.sb-as-lead-advanced summary strong{font-size:12px}.sb-as-lead-advanced summary span{margin-left:auto;color:#8a929d;font-size:10px}.sb-as-lead-advanced-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;padding:0 15px 15px;border-top:1px solid #edf0f3}.sb-as-lead-advanced-fields .sb-as-use-field{padding-top:13px}.sb-as-lead-advanced-fields .sb-as-use-field.full{grid-column:1/-1}.sb-as-lead-reply{grid-column:1/-1;display:flex;align-items:center;gap:7px;color:#68717c;font-size:11px}.sb-as-lead-reply input{accent-color:#4267A5}
.sb-as-lead-side{position:sticky;top:12px}.sb-as-lead-side-card{padding:17px 16px;border:1px solid #dfe6f1;border-radius:14px;background:#f8faff}.sb-as-lead-side-kicker{color:#4267A5;font-size:10px;font-weight:700;letter-spacing:.04em}.sb-as-lead-side-card h3{margin:7px 0 0;color:#1F2329;font-size:15px}.sb-as-lead-side-steps{display:grid;gap:10px;margin:16px 0 0;padding:0;list-style:none}.sb-as-lead-side-steps li{display:grid;grid-template-columns:23px minmax(0,1fr);grid-template-rows:auto auto;column-gap:8px;align-items:center}.sb-as-lead-side-steps i{grid-row:1 / span 2;width:23px;height:23px;display:grid;place-items:center;border-radius:50%;background:#e6edf9;color:#4267A5;font-style:normal;font-size:10px;font-weight:700}.sb-as-lead-side-steps span{color:#1F2329;font-size:11px;font-weight:650}.sb-as-lead-side-steps small{margin-top:2px;color:#8a929d;font-size:10px}.sb-as-lead-side-goal,.sb-as-lead-side-signals{display:grid;gap:5px;margin-top:15px;padding-top:12px;border-top:1px solid #e3e9f3}.sb-as-lead-side-goal>span,.sb-as-lead-side-signals>span{color:#8a929d;font-size:10px}.sb-as-lead-side-value{color:#1F2329;font-size:12px;font-weight:650;line-height:1.5}.sb-as-lead-side-count{color:#4267A5;font-size:12px;font-weight:650}.sb-as-lead-side-delivery{margin-top:15px;padding-top:12px;border-top:1px solid #e3e9f3;color:#68717c;font-size:10px;line-height:1.6}.sb-as-lead-validation{margin-top:14px;padding:10px 12px;border:1px solid #f0d6ce;border-radius:9px;background:#fff8f6;color:#a45f4b;font-size:11px;line-height:1.5}.sb-as-lead-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}.sb-as-lead-actions button{height:38px;padding:0 15px;border:1px solid #dfe5ec;border-radius:10px;background:#fff;color:#68717c;font:inherit;font-size:12px;cursor:pointer}.sb-as-lead-actions button:hover{background:#f6f8fa}.sb-as-lead-actions button.primary{border-color:#1F2329;background:#1F2329;color:#fff}.sb-as-lead-actions button.primary:hover{background:#353b43}
.sb-as-use-review{align-items:start}.sb-as-use-review-list{min-width:0}.sb-as-use-review-row{display:grid;grid-template-columns:minmax(72px,18%) minmax(0,1fr);gap:14px;align-items:start;min-width:0}.sb-as-use-review-row span{min-width:0}.sb-as-use-review-row strong{min-width:0;max-width:none;overflow-wrap:anywhere;word-break:break-word}.sb-as-use-evidence{align-self:start;min-width:0}.sb-as-use-evidence-item{overflow-wrap:anywhere}
.sb-as-use-progress.is-live{position:relative}.sb-as-use-progress.is-live:after{content:"";position:absolute;inset:0;width:32%;border-radius:inherit;background:linear-gradient(90deg,transparent,rgba(255,255,255,.58),transparent);pointer-events:none;animation:sb-as-progress-sweep 1.45s ease-in-out infinite}.sb-as-use-progress.is-indeterminate i{width:38%!important;animation:sb-as-indeterminate 1.4s ease-in-out infinite}.sb-as-use-check.is-active{border-color:#c9d9ef;background:#fbfcff}.sb-as-use-check.is-active i{animation:sb-as-check-pulse 1.35s ease-in-out infinite}.sb-as-live-dots{display:inline-flex;gap:3px;margin-left:4px;vertical-align:middle}.sb-as-live-dots i{width:3px;height:3px;border-radius:50%;background:currentColor;animation:sb-as-dot-blink 1.2s ease-in-out infinite}.sb-as-live-dots i:nth-child(2){animation-delay:.16s}.sb-as-live-dots i:nth-child(3){animation-delay:.32s}@keyframes sb-as-progress-sweep{0%{transform:translateX(-120%)}100%{transform:translateX(330%)}}@keyframes sb-as-indeterminate{0%{transform:translateX(-180%)}100%{transform:translateX(320%)}}@keyframes sb-as-check-pulse{0%,100%{box-shadow:0 0 0 0 rgba(66,103,165,.2)}50%{box-shadow:0 0 0 5px rgba(66,103,165,0)}}@keyframes sb-as-dot-blink{0%,100%{opacity:.2;transform:scale(.8)}50%{opacity:1;transform:scale(1.2)}}
@media(prefers-reduced-motion:reduce){.sb-as-use-progress.is-live:after,.sb-as-use-progress.is-indeterminate i,.sb-as-use-check.is-active i,.sb-as-live-dots i{animation:none}}
@media(max-width:980px){.sb-as-toolbar{padding:22px 20px 10px}.sb-as-cta{max-width:620px}.sb-as-cta strong{font-size:22px}.sb-as-cta span{font-size:14px}.sb-as-filter-row{margin-top:8px}.sb-as-category-list{gap:10px;padding:8px 20px 24px}.sb-as-category-section+.sb-as-category-section{padding-top:8px}}
@media(max-width:1320px){.sb-as-grid,.sb-as-team,.sb-as-category-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(max-width:980px){.sb-as-grid,.sb-as-team,.sb-as-category-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:900px){.sb-as-lead-setup{grid-template-columns:1fr}.sb-as-lead-side{position:static}.sb-as-lead-side-card{display:none}}
@media(max-width:640px){.sb-as-grid,.sb-as-team,.sb-as-category-grid{grid-template-columns:1fr}.sb-as-category-head{margin-bottom:10px}.sb-as-category-list{gap:10px;padding:8px 16px 20px}.sb-as-category-section+.sb-as-category-section{padding-top:8px}.sb-as-use-intro,.sb-as-use-review{grid-template-columns:1fr}.sb-as-use-result.is-finder{grid-template-columns:repeat(2,minmax(0,1fr))}.sb-as-use-signal-grid,.sb-as-lead-source-grid,.sb-as-lead-signal-grid,.sb-as-lead-audience-grid{grid-template-columns:1fr}.sb-as-lead-scope-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.sb-as-lead-fields,.sb-as-lead-advanced-fields,.sb-as-finder-advanced-fields{grid-template-columns:1fr}.sb-as-lead-advanced-fields .sb-as-use-field.full,.sb-as-lead-reply{grid-column:auto}.sb-as-lead-actions{justify-content:stretch}.sb-as-lead-actions button{flex:1}.sb-as-finder-consumer{padding:18px}.sb-as-finder-source-head{display:grid}.sb-as-finder-source-actions{width:100%}.sb-as-finder-source-actions button{flex:1}.sb-as-finder-source-foot{display:grid;gap:5px}.sb-as-finder-suggestions{display:grid}.sb-as-finder-suggestion{text-align:left;padding:8px 10px}}
@media(prefers-reduced-motion:reduce){.sb-as-cloud-boot-orb:before,.sb-as-cloud-boot-track i{animation:none}}
.sb-as-authorize-button{display:flex;align-items:center;justify-content:space-between;width:100%;min-height:46px;margin-top:13px;padding:0 15px;border:1px solid #b9cbe6;border-radius:10px;background:#f4f7fd;color:#34578f;font:inherit;font-size:12px;font-weight:650;cursor:pointer;transition:background-color .16s ease,border-color .16s ease,box-shadow .16s ease,color .16s ease}.sb-as-authorize-button::after{content:"↗";font-size:17px;font-weight:500;line-height:1}.sb-as-authorize-button:hover{border-color:#4267A5;background:#eaf0fb;box-shadow:0 3px 10px rgba(66,103,165,.13);color:#294a7e}.sb-as-authorize-button:focus-visible{outline:3px solid rgba(66,103,165,.2);outline-offset:2px}.sb-as-authorize-button:disabled{cursor:wait;opacity:.6}
.sb-as-private-setup{display:grid;gap:18px}.sb-as-private-source{padding:18px;border:1px solid #e1e7ef;border-radius:14px;background:#fbfcfe}.sb-as-private-stage{background:#fff}.sb-as-private-source>.sb-task-account{margin-top:15px}.sb-as-private-source-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}.sb-as-private-source-title{color:#1F2329;font-size:16px;font-weight:700}.sb-as-private-source-copy{margin-top:5px;color:#7b8490;font-size:11px;line-height:1.55}.sb-as-private-source-tools{display:flex;gap:7px;flex:none}.sb-as-private-source-tool{height:32px;padding:0 11px;border:1px solid #dfe5ec;border-radius:8px;background:#fff;color:#59616b;font:inherit;font-size:11px;cursor:pointer}.sb-as-private-source-tool.is-active,.sb-as-private-source-tool:hover{border-color:#4267A5;background:#f3f7fe;color:#34578f}.sb-as-private-url-input{width:100%;min-height:132px;margin-top:15px;box-sizing:border-box;resize:vertical;border:1px solid #dfe5ec;border-radius:11px;padding:13px 14px;background:#fff;color:#1F2329;outline:none;font:inherit;font-size:12px;line-height:1.65}.sb-as-private-url-input:focus{border-color:#4267A5;box-shadow:0 0 0 3px rgba(66,103,165,.1)}.sb-as-private-file{position:relative;display:flex;align-items:center;gap:12px;min-height:74px;margin-top:12px;padding:12px 14px;border:1px dashed #cbd7e6;border-radius:11px;background:#f7faff;color:#59616b;cursor:pointer}.sb-as-private-file:hover{border-color:#4267A5;background:#f3f7fe}.sb-as-private-file-icon{display:grid;place-items:center;width:34px;height:34px;border-radius:9px;background:#e7eef9;color:#4267A5;font-size:16px}.sb-as-private-file-copy{min-width:0;display:grid;gap:3px}.sb-as-private-file-copy strong{font-size:11px;font-weight:700;color:#34578f}.sb-as-private-file-copy span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#8a929d;font-size:10px}.sb-as-private-file input{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}.sb-as-private-source-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:11px;color:#8a929d;font-size:10px}.sb-as-private-source-count{color:#4267A5;font-weight:700}.sb-as-private-source-error{color:#a45f4b}.sb-as-private-empty{display:grid;gap:6px;place-items:start;border-style:dashed;background:#f7f9fc}.sb-as-private-empty strong{color:#303842;font-size:13px}.sb-as-private-empty p,.sb-as-private-empty-copy{margin:0;color:#7b8490;font-size:11px;line-height:1.65}.sb-as-private-targets{display:grid;gap:8px;margin-top:14px}.sb-as-private-targets-head{display:flex;align-items:center;justify-content:space-between;color:#59616b;font-size:11px;font-weight:650}.sb-as-private-target-list{display:grid;gap:7px;max-height:245px;overflow:auto;padding-right:2px}.sb-as-private-target{display:grid;grid-template-columns:28px minmax(0,1fr) auto;align-items:center;gap:9px;padding:9px 10px;border:1px solid #edf0f3;border-radius:9px;background:#fff}.sb-as-private-target-index{display:grid;place-items:center;width:24px;height:24px;border-radius:50%;background:#f0f3f7;color:#7b8490;font-size:10px;font-weight:700}.sb-as-private-target-copy{min-width:0;display:grid;gap:3px}.sb-as-private-target-copy strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#1F2329;font-size:11px}.sb-as-private-target-copy span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#8a929d;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10px}.sb-as-private-target-status{font-size:10px;color:#4267A5;white-space:nowrap}.sb-as-private-target.is-error{border-color:#f1d9d3;background:#fff9f7}.sb-as-private-target.is-error .sb-as-private-target-status{color:#a45f4b}.sb-as-private-target.is-sent{border-color:#d4eadd;background:#f7fcf9}.sb-as-private-target.is-sent .sb-as-private-target-status{color:#2d8b61}.sb-as-private-target.is-sending .sb-as-private-target-status{color:#9a6a35}.sb-as-private-message{display:grid;gap:7px}.sb-as-private-message label{color:#59616b;font-size:11px;font-weight:650}.sb-as-private-message textarea{width:100%;min-height:106px;box-sizing:border-box;resize:vertical;border:1px solid #dfe5ec;border-radius:11px;padding:12px 13px;background:#fff;color:#1F2329;outline:none;font:inherit;font-size:12px;line-height:1.6}.sb-as-private-message textarea:focus{border-color:#4267A5;box-shadow:0 0 0 3px rgba(66,103,165,.1)}.sb-as-private-tip{color:#8a929d;font-size:10px;line-height:1.5}.sb-as-private-review-batch{display:flex;align-items:center;gap:10px;margin:0 0 15px;padding:12px 14px;border:1px solid #dce6f5;border-radius:10px;background:#f5f8fd;color:#4267A5;font-size:12px}.sb-as-private-review-batch strong{font-size:19px}.sb-as-private-review-targets{display:grid;gap:6px;max-height:210px;overflow:auto;margin-top:10px}.sb-as-private-review-target{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 10px;border-radius:8px;background:#f8fafc;color:#59616b;font-size:11px}.sb-as-private-review-target span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sb-as-private-review-target i{font-style:normal;color:#4267A5;font-size:10px;white-space:nowrap}.sb-as-private-review-target.is-error{color:#a45f4b;background:#fff7f4}.sb-as-private-review-target.is-error i{color:#a45f4b}.sb-as-private-running-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin-top:16px}.sb-as-private-running-stat{padding:12px;border:1px solid #e9edf2;border-radius:10px;background:#fbfcfd}.sb-as-private-running-stat strong{display:block;color:#1F2329;font-size:20px}.sb-as-private-running-stat span{display:block;margin-top:3px;color:#8a929d;font-size:10px}.sb-as-private-running-stat.is-success strong{color:#2d8b61}.sb-as-private-running-stat.is-error strong{color:#a45f4b}.sb-as-private-running-list{display:grid;gap:6px;max-height:270px;overflow:auto;margin-top:16px}.sb-as-private-running-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;padding:9px 10px;border-bottom:1px solid #edf0f3;color:#59616b;font-size:11px}.sb-as-private-running-row span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sb-as-private-running-row i{font-style:normal;color:#8a929d;font-size:10px}.sb-as-private-running-row.is-sent i{color:#2d8b61}.sb-as-private-running-row.is-error i{color:#a45f4b}.sb-as-private-prospect-basis{border-color:#dbe6f5;background:#fbfcfe}.sb-as-private-prospect-chain{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-top:12px;color:#476a9f;font-size:11px;font-weight:680}.sb-as-private-prospect-chain span{display:inline-flex;align-items:center;gap:8px;padding:7px 10px;border:1px solid #dbe6f5;border-radius:8px;background:#f4f8fe}.sb-as-private-prospect-chain i{color:#91a8c8;font-style:normal;font-weight:500}
.sb-as-private-target.is-ready{border-color:#d4eadd;background:#f7fcf9}.sb-as-private-target.is-ready .sb-as-private-target-status{color:#2d8b61}
.sb-as-private-mode-options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-top:15px}.sb-as-private-mode-option{display:grid;gap:5px;min-height:78px;padding:13px 14px;border:1px solid #dfe5ec;border-radius:10px;background:#fff;color:#59616b;text-align:left;font:inherit;cursor:pointer}.sb-as-private-mode-option:hover{border-color:#9db5d8;background:#f8faff}.sb-as-private-mode-option.is-selected{border-color:#4267A5;background:#f3f7fe;box-shadow:0 0 0 2px rgba(66,103,165,.1)}.sb-as-private-mode-option strong{color:#1F2329;font-size:12px}.sb-as-private-mode-option span{color:#7b8490;font-size:10px;line-height:1.55}
.sb-as-private-mock-notice{margin-top:0;border:1px solid #d9e7f7;background:#f5f9ff;color:#4267a5}.sb-as-private-mock-flow{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.sb-as-private-mock-flow span{padding:9px 10px;border:1px solid #dce7f6;border-radius:9px;background:#fff;color:#4267a5;font-size:11px;text-align:center}
/* Private outreach review: a focused send summary with explicit risk and content hierarchy. */
.sb-as-use:not(:has(.sb-as-lead-setup)){max-width:1120px;padding:30px 34px 54px}
.sb-as-use:not(:has(.sb-as-lead-setup)) .sb-as-use-head{align-items:center;margin-bottom:24px}
.sb-as-use:not(:has(.sb-as-lead-setup)) .sb-as-use-title{font-size:30px;letter-spacing:-.025em}
.sb-as-use:not(:has(.sb-as-lead-setup)) .sb-as-use-copy{max-width:720px;font-size:13px}
.sb-as-use:not(:has(.sb-as-lead-setup)) .sb-as-use-intro{grid-template-columns:minmax(0,1fr) 300px;gap:14px;margin-bottom:18px}
.sb-as-use:not(:has(.sb-as-lead-setup)) .sb-as-use-callout{position:relative;padding:18px 20px 18px 23px;border-color:#dce5f2;background:#f8faff}
.sb-as-use:not(:has(.sb-as-lead-setup)) .sb-as-use-callout:before{content:"";position:absolute;top:18px;bottom:18px;left:0;width:3px;border-radius:0 4px 4px 0;background:#4267A5}
.sb-as-use:not(:has(.sb-as-lead-setup)) .sb-as-use-output{padding:18px 20px;border-color:#e0e5ea}
.sb-as-use:not(:has(.sb-as-lead-setup)) .sb-as-use-steps{gap:3px;padding:4px;margin-bottom:18px;border:1px solid #e2e6eb;border-radius:13px;background:#f5f7f9}
.sb-as-use:not(:has(.sb-as-lead-setup)) .sb-as-use-step{min-width:0;padding:11px 13px;border-color:transparent;border-radius:9px;background:transparent;box-shadow:none}
.sb-as-use:not(:has(.sb-as-lead-setup)) .sb-as-use-step.is-active{border-color:#d9dfe6;background:#fff;box-shadow:0 3px 8px rgba(31,35,41,.07)}
.sb-as-use:not(:has(.sb-as-lead-setup)) .sb-as-use-step.is-done{border-color:transparent;background:transparent}
.sb-as-use:not(:has(.sb-as-lead-setup)) .sb-as-use-panel{padding:26px 28px;border-radius:17px;overflow:hidden}
.sb-as-use:has(.sb-as-private-review){max-width:1120px}
.sb-as-use:has(.sb-as-private-review) .sb-as-use-panel{padding:28px 30px 24px;border-color:#dfe4ea;box-shadow:0 14px 32px rgba(31,35,41,.055)}
.sb-as-private-review{min-width:0}
.sb-as-private-review-top{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:10px}
.sb-as-private-review-kicker{display:flex;align-items:center;gap:8px;color:#4267A5;font-size:11px;font-weight:700;letter-spacing:.06em}
.sb-as-private-review-kicker:before{content:"";width:7px;height:7px;border-radius:50%;background:#4267A5;box-shadow:0 0 0 4px rgba(66,103,165,.11)}
.sb-as-private-review-risk{display:inline-flex;align-items:center;gap:6px;padding:6px 9px;border-radius:7px;background:#fff7ed;color:#9a6a35;font-size:10px;font-weight:650;white-space:nowrap}
.sb-as-private-review-risk:before{content:"!";display:grid;place-items:center;width:15px;height:15px;border:1px solid currentColor;border-radius:50%;font-size:10px}
.sb-as-private-review .sb-as-use-panel-title{font-size:22px;line-height:1.3;letter-spacing:-.02em}
.sb-as-private-review .sb-as-use-panel-copy{max-width:680px;margin-top:7px;margin-bottom:22px;font-size:12px}
.sb-as-private-summary{grid-template-columns:minmax(0,1fr) minmax(0,1fr);grid-template-areas:"sender boundary" "target target" "message message";gap:10px;margin-top:0}
.sb-as-private-summary .sb-as-use-summary-item{min-width:0;padding:15px 16px;border-color:#e5e9ee;border-radius:11px;background:#fbfcfd}
.sb-as-private-summary .sb-as-use-summary-item:nth-child(1){grid-area:sender}
.sb-as-private-summary .sb-as-use-summary-item:nth-child(2){grid-area:target}
.sb-as-private-summary .sb-as-use-summary-item:nth-child(3){grid-area:message}
.sb-as-private-summary .sb-as-use-summary-item:nth-child(4){grid-area:boundary}
.sb-as-private-summary .sb-as-use-summary-item span{font-size:10px;font-weight:600;letter-spacing:.02em}
.sb-as-private-summary .sb-as-use-summary-item strong{display:block;min-width:0;margin-top:7px;font-size:13px;line-height:1.55;overflow-wrap:anywhere;word-break:break-word}
.sb-as-private-summary .sb-as-use-summary-item:nth-child(2) strong{color:#4267A5;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono",monospace;font-size:11px;font-weight:600}
.sb-as-private-summary .sb-as-use-summary-item:nth-child(3){background:#f5f8fd;border-color:#dce6f5}
.sb-as-private-summary .sb-as-use-summary-item:nth-child(3) strong{font-size:14px;font-weight:600;white-space:pre-wrap}
.sb-as-private-summary .sb-as-use-summary-item:nth-child(4) strong{color:#55719b}
.sb-as-private-note{display:flex;align-items:flex-start;gap:9px;margin-top:16px;padding:12px 14px;border:1px solid #dfe8f5;background:#f7faff;color:#596b82}
.sb-as-private-note i{display:grid;place-items:center;width:18px;height:18px;flex:none;border-radius:50%;background:#e3edf9;color:#4267A5;font-style:normal;font-size:11px;font-weight:700}
.sb-as-private-note span{min-width:0}
.sb-as-private-actions{align-items:center;margin-top:24px;padding-top:18px;border-top:1px solid #edf0f3}
.sb-as-private-actions button{height:40px;padding:0 16px;border-radius:9px;font-size:12px}
.sb-as-private-actions button.primary{min-width:142px;box-shadow:0 5px 12px rgba(31,35,41,.12)}
.sb-as-use.is-task-compose.is-task-compose{max-width:760px;padding:64px 30px 58px}
.sb-as-use.is-task-compose.is-task-compose .sb-as-use-panel.sb-as-task-compose-panel{padding:0;border:0;border-radius:0;background:transparent;overflow:visible}
.sb-as-task-compose-panel .sb-as-use-panel-title{font-size:28px;line-height:1.28;letter-spacing:0}
.sb-as-task-compose-panel .sb-as-use-panel-copy{margin:8px 0 24px;font-size:13px;color:#858d98}
.sb-as-task-compose-panel .sb-as-use-fields{grid-template-columns:1fr;gap:14px}
.sb-as-task-compose-panel .sb-as-use-field.full{grid-column:auto}
.sb-as-task-compose-panel .sb-as-lead-setup{display:block}
.sb-as-task-compose-panel .sb-as-lead-hero{padding:0 0 22px;border:0;background:transparent}
.sb-as-task-compose-panel .sb-as-lead-card{margin-top:0;padding:0;border:0;border-radius:0;background:transparent;box-shadow:none}
.sb-as-task-compose-panel .sb-as-lead-card+.sb-as-lead-card{margin-top:24px}
.sb-as-task-compose-panel .sb-as-private-source{padding:16px;border-radius:8px;background:#fbfcfd}
.sb-as-task-compose-panel .sb-as-private-url-input,.sb-as-task-compose-panel .sb-as-private-file{border-radius:8px}
.sb-as-task-compose-panel .sb-as-finder-goal{min-height:178px;padding:19px 20px;border-color:#d8dde4;border-radius:8px;background:#fff;font-size:16px;line-height:1.75;box-shadow:0 10px 30px rgba(31,35,41,.045);transition:border-color .16s ease,box-shadow .16s ease}
.sb-as-task-compose-panel .sb-as-finder-goal:focus{border-color:#8da8cf;box-shadow:0 0 0 4px rgba(66,103,165,.08),0 14px 34px rgba(31,35,41,.06)}
.sb-as-task-compose-panel .sb-as-finder-source,.sb-as-task-compose-panel .sb-as-finder-advanced{margin-top:10px;border:1px solid #e5e8ec;border-radius:8px;background:rgba(255,255,255,.72)}
.sb-as-task-compose-panel .sb-as-finder-source>summary,.sb-as-task-compose-panel .sb-as-finder-advanced>summary{min-height:44px;box-sizing:border-box;padding:10px 13px}
.sb-as-task-compose-panel .sb-as-finder-source>summary:after,.sb-as-task-compose-panel .sb-as-finder-advanced>summary:after{background:transparent}
.sb-as-task-compose-panel .sb-as-finder-source-body,.sb-as-task-compose-panel .sb-as-finder-advanced-fields{padding:2px 13px 14px}
.sb-as-finder-suggestion-label{margin-top:21px;color:#9299a3;font-size:10.5px}
.sb-as-task-compose-panel .sb-as-finder-suggestions{margin-top:9px}
.sb-as-task-compose-panel .sb-as-finder-suggestion{border-color:transparent;border-radius:7px;background:#f2f4f6;color:#69727d}
.sb-as-task-compose-panel .sb-as-finder-suggestion:hover{border-color:#dce4ef;background:#eef3fa;color:#34578f}
.sb-as-task-compose-panel .sb-as-finder-actions{margin-top:27px}
.sb-as-task-compose-panel .sb-as-finder-actions button.primary{min-width:126px;height:42px;border-radius:8px;font-size:13px;box-shadow:0 6px 14px rgba(31,35,41,.12)}
.sb-as-task-options{margin-top:12px;border:1px solid #e5e8ec;border-radius:8px;background:rgba(255,255,255,.72)}
.sb-as-task-options>summary{position:relative;display:flex;align-items:center;gap:12px;min-height:46px;box-sizing:border-box;padding:10px 13px;color:#1F2329;cursor:pointer;list-style:none}
.sb-as-task-options>summary::-webkit-details-marker{display:none}
.sb-as-task-options>summary:after{content:"+";display:grid;place-items:center;width:22px;height:22px;margin-left:auto;border-radius:50%;background:#f0f2f5;color:#7c8590;font-size:14px}
.sb-as-task-options[open]>summary:after{content:"−"}
.sb-as-task-options>summary strong{font-size:12px;font-weight:650}.sb-as-task-options>summary span{color:#9299a3;font-size:10px}
.sb-as-task-option-fields{padding:4px 13px 15px}
.sb-as-task-options>.sb-as-lead-card{padding:5px 13px 16px}.sb-as-task-options>.sb-as-lead-card+.sb-as-lead-card{margin-top:0;padding-top:16px;border-top:1px solid #edf0f3}
.sb-as-task-mode{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px;padding:4px;border-radius:8px;background:#f1f3f5}
.sb-as-task-mode-option{height:36px;border:0;border-radius:6px;background:transparent;color:#747d88;font:inherit;font-size:11px;cursor:pointer}
.sb-as-task-mode-option.is-selected{background:#fff;color:#1F2329;font-weight:650;box-shadow:0 2px 7px rgba(31,35,41,.08)}
.sb-as-morgan-task{display:grid;max-width:720px;margin:0 auto;color:#1F2329}
.sb-as-morgan-intro{padding-bottom:26px;border-bottom:1px solid #e7e9ec}.sb-as-morgan-kicker{color:#159765;font-size:11px;font-weight:700}.sb-as-morgan-title{margin-top:8px;font-size:30px;font-weight:720;line-height:1.25;letter-spacing:0}.sb-as-morgan-copy{max-width:560px;margin:9px 0 0;color:#858d98;font-size:13px;line-height:1.65}
.sb-as-morgan-account{padding:21px 0 19px;border-bottom:1px solid #eceef1}.sb-as-morgan-section-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}.sb-as-morgan-section-head strong{font-size:13px;font-weight:680}.sb-as-morgan-section-head span{color:#9299a3;font-size:10.5px}.sb-as-morgan-account-row{display:grid;grid-template-columns:minmax(0,1fr);gap:8px}.sb-as-morgan-account-row>div{width:100%}.sb-as-morgan-account-row select{height:46px!important;padding:0 14px!important;border-radius:12px!important;font-size:13px!important}.sb-as-morgan-account-row button{height:46px!important;padding:0 15px!important;border-color:#dfe4e9!important;border-radius:12px!important;background:#fff!important;color:#59616b!important}.sb-as-morgan-account-note{margin-top:9px;color:#8a929d;font-size:10.5px;line-height:1.5}
.sb-as-morgan-prompt{padding:25px 0 0}.sb-as-morgan-prompt>label{display:block;margin-bottom:10px;font-size:16px;font-weight:680;line-height:1.45}.sb-as-morgan-prompt textarea{width:100%;min-height:128px;box-sizing:border-box;resize:vertical;border:1px solid #d9dee5;border-radius:14px;padding:16px 17px;background:#fff;color:#1F2329;outline:none;font:inherit;font-size:14px;line-height:1.7;box-shadow:0 8px 24px rgba(31,35,41,.035);transition:border-color .16s ease,box-shadow .16s ease}.sb-as-morgan-prompt textarea:focus{border-color:#7c9bc8;box-shadow:0 0 0 4px rgba(66,103,165,.08),0 12px 28px rgba(31,35,41,.05)}.sb-as-morgan-prompt.is-message textarea{min-height:96px}.sb-as-morgan-suggestions{display:flex;flex-wrap:wrap;gap:7px;margin-top:10px}.sb-as-morgan-suggestion{min-height:30px;padding:0 10px;border:0;border-radius:999px;background:#f0f2f4;color:#6f7781;font:inherit;font-size:10.5px;cursor:pointer}.sb-as-morgan-suggestion:hover{background:#e8eef7;color:#34578f}
.sb-as-morgan-options{margin-top:20px}.sb-as-morgan-options>summary strong{font-size:11.5px}.sb-as-morgan-options>summary span{font-size:10px}.sb-as-morgan-start{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-top:24px;padding-top:20px;border-top:1px solid #e7e9ec}.sb-as-morgan-start-note{display:flex;align-items:flex-start;gap:9px;max-width:430px;color:#737c87;font-size:11px;line-height:1.55}.sb-as-morgan-start-note i{width:8px;height:8px;flex:none;margin-top:4px;border-radius:50%;background:#20a66a}.sb-as-morgan-start-note strong{color:#1F2329}.sb-as-morgan-start button{height:44px;flex:none;padding:0 20px;border:1px solid #1F2329;border-radius:10px;background:#1F2329;color:#fff;font:inherit;font-size:13px;font-weight:650;cursor:pointer;box-shadow:0 7px 16px rgba(31,35,41,.13)}.sb-as-morgan-start button:hover{background:#343941}.sb-as-morgan-start button:disabled{opacity:.55;cursor:wait}
@media(max-width:640px){.sb-as-morgan-account-row{grid-template-columns:1fr}}
@media(max-width:640px){.sb-as-morgan-title{font-size:26px}.sb-as-morgan-section-head{align-items:flex-start;flex-direction:column;gap:4px}.sb-as-morgan-account-row>div{display:grid!important;grid-template-columns:1fr}.sb-as-morgan-account-row button{width:100%}.sb-as-morgan-prompt textarea{min-height:140px}.sb-as-morgan-start{align-items:stretch;flex-direction:column}.sb-as-morgan-start button{width:100%}}
@media(max-width:900px){.sb-as-use:not(:has(.sb-as-lead-setup)){padding:24px 24px 44px}.sb-as-use:not(:has(.sb-as-lead-setup)) .sb-as-use-intro{grid-template-columns:1fr}}
@media(max-width:640px){.sb-as-use:not(:has(.sb-as-lead-setup)){padding:22px 16px 36px}.sb-as-use:not(:has(.sb-as-lead-setup)) .sb-as-use-title{font-size:25px}.sb-as-use:not(:has(.sb-as-lead-setup)) .sb-as-use-panel{padding:22px 18px 18px}.sb-as-use:not(:has(.sb-as-lead-setup)) .sb-as-use-steps{grid-template-columns:1fr}.sb-as-use:not(:has(.sb-as-lead-setup)) .sb-as-use-step{padding:9px 11px}.sb-as-use:has(.sb-as-private-review) .sb-as-use-panel{padding:22px 18px 18px}.sb-as-private-review-top{align-items:flex-start;flex-direction:column;gap:10px}.sb-as-private-summary{grid-template-columns:1fr;grid-template-areas:"sender" "boundary" "target" "message"}.sb-as-private-actions{flex-direction:column-reverse;align-items:stretch}.sb-as-private-actions button{width:100%}.sb-as-use.is-task-compose.is-task-compose{padding:42px 17px 36px}.sb-as-use.is-task-compose.is-task-compose .sb-as-use-panel.sb-as-task-compose-panel{padding:0}.sb-as-task-compose-panel .sb-as-use-panel-title{font-size:25px}.sb-as-task-compose-panel .sb-as-finder-goal{min-height:160px;padding:16px;font-size:15px}.sb-as-task-compose-panel .sb-as-finder-actions{justify-content:stretch}.sb-as-task-compose-panel .sb-as-finder-actions button.primary{width:100%}.sb-as-task-options>summary{align-items:flex-start;flex-wrap:wrap;padding-right:45px}.sb-as-task-options>summary:after{position:absolute;top:11px;right:13px}.sb-as-task-options>summary span{flex-basis:100%}}
@media(max-width:640px){.sb-as-private-source-head{flex-direction:column}.sb-as-private-source-tools{width:100%}.sb-as-private-source-tool{flex:1}.sb-as-private-mode-options{grid-template-columns:1fr}.sb-as-private-running-summary{grid-template-columns:1fr}.sb-as-private-target{grid-template-columns:25px minmax(0,1fr);}.sb-as-private-target-status{grid-column:2}.sb-as-private-review-target{align-items:flex-start;flex-direction:column;gap:3px}.sb-as-private-mock-flow{grid-template-columns:1fr}}
.sb-as-finder-consumer{padding:14px 26px 34px}.sb-as-finder-promise{display:grid;gap:4px;margin:2px 0 18px;padding:13px 15px;border:1px solid #dce6f5;border-radius:11px;background:#f7faff}.sb-as-finder-promise strong{color:#294a7e;font-size:12px;line-height:1.45}.sb-as-finder-promise span{color:#718096;font-size:10.5px;line-height:1.55}.sb-as-finder-consumer .sb-task-choices legend{font-size:18px;line-height:1.35;margin-bottom:14px;color:#2d343b}.sb-as-finder-consumer .sb-task-choice-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:11px}.sb-as-finder-consumer .sb-task-choice{min-height:102px;align-items:flex-start;padding:15px 15px 14px;border-radius:10px;transition:background .15s,border-color .15s,box-shadow .15s,transform .15s ease}.sb-as-finder-consumer .sb-task-choice:hover{background:#fbfdff}.sb-as-finder-consumer .sb-task-choice.is-selected{background:#f8fbff}.sb-as-finder-consumer .sb-task-choice.is-selected .sb-task-choice-copy strong{color:#245ea9}.sb-as-finder-consumer .sb-task-choice.is-selected:hover{transform:translateY(-1px)}.sb-as-finder-consumer .sb-task-choice-copy{gap:5px}.sb-as-finder-consumer .sb-task-choice-eyebrow{color:#7f9bc0;font-size:10px;font-weight:650;line-height:1.2}.sb-as-finder-consumer .sb-task-choice strong{font-size:14px;line-height:1.35}.sb-as-finder-consumer .sb-task-choice small{font-size:11px;line-height:1.5}.sb-task-selection-note{display:flex;align-items:baseline;gap:8px;min-height:24px;margin:12px 1px 0;color:#7d8791;font-size:10.5px;line-height:1.45}.sb-task-selection-note strong{color:#42566d;font-size:11px;font-weight:650}.sb-task-selection-note small{color:#929ca7}.sb-task-filter-section{margin-top:12px;padding-top:12px;border-top:1px solid #edf0f3}.sb-task-filter-header{display:flex;align-items:baseline;gap:8px}.sb-task-filter-header strong{color:#5b6773;font-size:11px;font-weight:650}.sb-task-filter-header span{color:#9aa3ad;font-size:10px}.sb-task-filter-section .sb-task-filter-row{margin-top:8px}.sb-task-choice{transition:background .15s,border-color .15s,box-shadow .15s,transform .15s ease}
.sb-as-intent-focus{display:grid;gap:8px;margin:14px 0 18px}.sb-as-intent-focus-label{color:#4b5968;font-size:12px;font-weight:680}.sb-as-intent-focus textarea{width:100%;min-height:82px;box-sizing:border-box;padding:11px 12px;border:1px solid #d5dfed;border-radius:9px;background:#fff;color:#30363c;font:inherit;font-size:12px;line-height:1.6;resize:vertical;outline:none}.sb-as-intent-focus textarea:focus{border-color:#4267a5;box-shadow:0 0 0 3px rgba(66,103,165,.1)}.sb-as-intent-focus textarea::placeholder{color:#a0aab6}.sb-as-intent-candidate{grid-template-columns:minmax(0,1fr);cursor:default}
 .sb-as-finder-consumer .sb-task-specific-goal{display:none;gap:7px;margin:13px 0 0;padding:13px 14px;border:1px solid #d9e3f1;border-radius:10px;background:#f8fbff}.sb-as-finder-consumer .sb-task-specific-goal.is-visible{display:grid}.sb-as-finder-consumer .sb-task-specific-goal label{color:#536b86;font-size:11px;font-weight:650}.sb-as-finder-consumer .sb-task-specific-goal textarea{width:100%;box-sizing:border-box;min-height:64px;padding:10px 11px;border:1px solid #d8e0ea;border-radius:8px;background:#fff;color:#30363c;font:inherit;font-size:12px;line-height:1.55;resize:vertical;outline:none}.sb-as-finder-consumer .sb-task-specific-goal textarea:focus{border-color:#8ca9d1;box-shadow:0 0 0 3px rgba(66,103,165,.1)}
.sb-as-finder-consumer .sb-task-choice-guidance{margin:0 0 15px;color:#8793a1;font-size:11px}.sb-as-finder-consumer .sb-task-filter-section{margin-top:15px;padding:14px 15px 15px;border:1px solid #e0e7f0;border-radius:12px;background:#fbfcfe;box-shadow:none}.sb-as-finder-consumer .sb-task-filter-section[hidden]{display:none}.sb-as-finder-consumer .sb-task-filter-section:not([hidden]){animation:sb-as-finder-reveal .22s ease-out}.sb-as-finder-consumer .sb-task-filter-header{margin-bottom:10px}.sb-as-finder-consumer .sb-task-filter-header strong{color:#4c5d70;font-size:11px}.sb-as-finder-consumer .sb-task-filter-header span{color:#929eac;font-size:10px}.sb-composite-finder-steps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:0 0 22px}.sb-composite-finder-step{padding:9px 11px;border-bottom:2px solid #edf0f3;color:#9aa3ad;font-size:11px;font-weight:600}.sb-composite-finder-step.is-active{border-color:#4267a5;color:#1f2329}.sb-composite-finder-step.is-done{border-color:#9fc8b3;color:#2d9a68}.sb-composite-finder-source-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:20px}.sb-composite-finder-source-option{min-height:118px;padding:16px;border:1px solid #dfe5ec;border-radius:8px;background:#fff;color:#1f2329;text-align:left;font:inherit;cursor:pointer;transition:border-color .15s,background .15s,box-shadow .15s}.sb-composite-finder-source-option:hover{border-color:#a8bddb;background:#fbfdff}.sb-composite-finder-source-option.is-selected{border-color:#5f86bd;background:#f7faff;box-shadow:0 0 0 2px rgba(66,103,165,.1)}.sb-composite-finder-source-option strong,.sb-composite-finder-source-option span{display:block}.sb-composite-finder-source-option strong{font-size:14px;line-height:1.4}.sb-composite-finder-source-option span{margin-top:7px;color:#778494;font-size:11px;line-height:1.55}.sb-public-finder-brief{display:grid;gap:14px;margin:0 0 20px;padding:0 0 20px;border-bottom:1px solid #e8edf2}.sb-public-finder-brief-heading{display:grid;gap:4px}.sb-public-finder-brief-heading strong{color:#2d343b;font-size:18px;line-height:1.35}.sb-public-finder-brief-heading span{color:#8491a0;font-size:11px;line-height:1.55}.sb-public-finder-brief>textarea,.sb-public-finder-field textarea,.sb-public-finder-field input{width:100%;box-sizing:border-box;border:1px solid #d9e1ea;border-radius:8px;background:#fff;color:#30363c;font:inherit;font-size:12px;line-height:1.5;outline:0}.sb-public-finder-brief>textarea,.sb-public-finder-field textarea{min-height:72px;padding:10px 11px;resize:vertical}.sb-public-finder-field input{height:38px;padding:0 11px}.sb-public-finder-brief>textarea:focus,.sb-public-finder-field textarea:focus,.sb-public-finder-field input:focus{border-color:#7799ca;box-shadow:0 0 0 3px rgba(66,103,165,.1)}.sb-public-finder-context{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1.35fr) minmax(180px,.7fr);gap:12px;align-items:start}.sb-public-finder-field{display:grid;gap:7px;min-width:0}.sb-public-finder-label{color:#4b5b6d;font-size:11px;font-weight:650}.sb-public-finder-account-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px}.sb-public-finder-resolve{height:38px;padding:0 11px;border:1px solid #cfd9e5;border-radius:8px;background:#fff;color:#365f9d;font:inherit;font-size:11px;font-weight:650;white-space:nowrap;cursor:pointer}.sb-public-finder-resolve:hover:not(:disabled){border-color:#86a4ce;background:#f7faff}.sb-public-finder-resolve:disabled{opacity:.55;cursor:wait}.sb-public-finder-hint{min-height:28px;color:#8794a2;font-size:10px;line-height:1.45}.sb-public-finder-hint.is-error{color:#bd6353}.sb-public-finder-limit input{max-width:132px}.sb-as-composite-finder .sb-task-choices{margin-top:18px}.sb-as-composite-finder .sb-task-choice-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.sb-as-composite-finder .sb-task-choice{min-height:82px}.sb-as-composite-finder .sb-as-use-actions{margin-top:24px}
@media(max-width:860px){.sb-as-finder-consumer .sb-task-choice-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:640px){.sb-as-finder-consumer{padding:18px}.sb-as-finder-promise{margin-bottom:16px;padding:12px 13px}.sb-as-finder-consumer .sb-task-choice-grid,.sb-composite-finder-source-grid{grid-template-columns:1fr}.sb-public-finder-context{grid-template-columns:1fr}.sb-public-finder-account-row{grid-template-columns:1fr}.sb-public-finder-resolve{width:100%}.sb-public-finder-limit input{max-width:none}.sb-task-selection-note{flex-wrap:wrap;gap:4px 7px}.sb-task-selection-note small{flex-basis:100%}.sb-task-filter-header{display:grid;gap:3px}.sb-task-filter-section .sb-task-filter-row{margin-top:9px}}
.sb-as-use:has(.sb-as-account-analysis-setup){max-width:860px;padding-top:48px}.sb-as-use:has(.sb-as-account-analysis-setup) .sb-as-use-panel.sb-as-account-analysis-setup{padding:0;border:0;border-radius:0;background:transparent;box-shadow:none;overflow:visible}.sb-as-analysis-single{gap:14px;margin:0 0 28px;padding:0;border:0;background:transparent}.sb-as-analysis-single .sb-as-analysis-source-head{align-items:flex-start}.sb-as-analysis-single .sb-as-analysis-source-head strong{font-size:21px;font-weight:680;letter-spacing:0}.sb-as-analysis-single .sb-as-analysis-source-head span{margin-top:5px;color:#728196;font-size:10.5px}.sb-as-analysis-link-dock{display:grid;grid-template-columns:44px minmax(0,1fr) auto;align-items:center;gap:13px;min-height:78px;box-sizing:border-box;padding:12px 14px;border:1px solid #dce4ee;border-radius:12px;background:#fff;box-shadow:0 9px 26px rgba(31,35,41,.045);cursor:text;transition:border-color .16s ease,box-shadow .16s ease,transform .16s ease}.sb-as-analysis-link-dock:hover{border-color:#b7c9e3;box-shadow:0 12px 30px rgba(31,35,41,.06)}.sb-as-analysis-link-dock:focus-within{border-color:#4267A5;box-shadow:0 0 0 4px rgba(66,103,165,.09),0 14px 30px rgba(31,35,41,.07)}.sb-as-analysis-link-mark{display:grid;place-items:center;width:44px;height:44px;border-radius:12px;background:#edf3fd;color:#4267A5;font-size:14px;font-weight:760;line-height:1}.sb-as-analysis-link-field{display:grid;gap:4px;min-width:0}.sb-as-analysis-link-label{color:#7c8795;font-size:10.5px;font-weight:650;line-height:1.2}.sb-as-analysis-single .sb-as-analysis-url{width:100%;height:28px;box-sizing:border-box;border:0;border-radius:0;padding:0;background:transparent;color:#1F2329;outline:0;font:inherit;font-size:14px;line-height:1.4}.sb-as-analysis-single .sb-as-analysis-url::placeholder{color:#a4adb8}.sb-as-analysis-single .sb-as-analysis-url:focus{border-color:transparent;box-shadow:none}.sb-as-analysis-link-side{padding:6px 8px;border-radius:6px;background:#f3f6f9;color:#8290a0;font-size:10px;white-space:nowrap}.sb-as-analysis-source-foot{display:flex;flex-wrap:wrap;gap:7px}.sb-as-analysis-source-foot span{padding:5px 8px;border-radius:6px;background:#f5f7f9;color:#718095;font-size:10.5px;line-height:1.25}.sb-as-analysis-source-foot span:last-child{background:#f1f7f4;color:#35745b}.sb-as-analysis-single.is-error .sb-as-analysis-link-dock{border-color:#d38b7c;box-shadow:0 0 0 4px rgba(201,107,88,.08)}.sb-as-account-analysis-setup .sb-task-choices{margin:0;padding-top:25px;border-top:1px solid #e8ecf0}.sb-as-account-analysis-setup .sb-task-choices legend{margin-bottom:13px;color:#313942;font-size:16px;font-weight:680}.sb-as-account-analysis-setup .sb-task-choice-grid{gap:10px}.sb-as-account-analysis-setup .sb-task-choice{min-height:80px;align-items:flex-start;padding:14px;border-radius:10px;transition:border-color .16s ease,background .16s ease,box-shadow .16s ease,transform .16s ease}.sb-as-account-analysis-setup .sb-task-choice:hover{border-color:#b7c9e3;background:#fbfdff}.sb-as-account-analysis-setup .sb-task-choice.is-selected{border-color:#6c94ce;background:#f8fbff;box-shadow:0 0 0 1px #6c94ce,0 8px 20px rgba(66,103,165,.075)}.sb-as-account-analysis-setup .sb-task-choice.is-selected:hover{transform:translateY(-1px)}.sb-as-account-analysis-setup .sb-task-choice-copy{gap:5px}.sb-as-account-analysis-setup .sb-task-choice strong{font-size:13px}.sb-as-account-analysis-setup .sb-task-choice small{font-size:11px}.sb-as-analysis-actions{align-items:center;justify-content:space-between;margin-top:28px;padding-top:17px;border-top:1px solid #e8ecf0}.sb-as-analysis-start-note{max-width:360px;color:#7b8794;font-size:10.5px;line-height:1.5}.sb-as-analysis-actions button.primary{height:42px;min-width:112px;border-radius:10px;font-size:13px;box-shadow:0 7px 16px rgba(31,35,41,.12)}
@media(max-width:640px){.sb-as-use:has(.sb-as-account-analysis-setup){padding:34px 18px 42px}.sb-as-analysis-single .sb-as-analysis-source-head{flex-direction:column;gap:2px}.sb-as-analysis-link-dock{grid-template-columns:40px minmax(0,1fr);min-height:72px;padding:11px 12px}.sb-as-analysis-link-mark{width:40px;height:40px;border-radius:10px}.sb-as-analysis-link-side{display:none}.sb-as-analysis-single .sb-as-analysis-url{font-size:13px}.sb-as-analysis-actions{align-items:stretch;flex-direction:column}.sb-as-analysis-start-note{max-width:none}.sb-as-analysis-actions button.primary{width:100%}}
.sb-as-intent-analyst-choice{max-width:760px}.sb-as-intent-mode-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:24px}.sb-as-intent-mode-option{position:relative;display:grid;gap:7px;min-height:156px;padding:17px 17px 42px;border:1px solid #dfe5ec;border-radius:11px;background:#fff;color:inherit;text-align:left;font:inherit;cursor:pointer;transition:border-color .16s ease,box-shadow .16s ease,transform .16s ease}.sb-as-intent-mode-option:hover{border-color:#9fb8da;background:#fbfdff;box-shadow:0 8px 20px rgba(66,103,165,.09);transform:translateY(-1px)}.sb-as-intent-mode-option strong{color:#27313a;font-size:14px}.sb-as-intent-mode-option span{color:#6d7987;font-size:11px;line-height:1.65}.sb-as-intent-mode-option i{position:absolute;right:16px;bottom:15px;color:#4267a5;font-size:11px;font-style:normal;font-weight:680}.sb-as-intent-analyst-choice .sb-as-use-notice{margin-top:16px}.sb-as-intent-analyst-setup{max-width:760px}.sb-as-intent-source{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px 16px;margin:20px 0 12px;padding:14px 15px;border:1px solid #dfe7f0;border-radius:10px;background:#fbfcfe}.sb-as-intent-source-copy{display:grid;gap:4px;min-width:0}.sb-as-intent-source-copy strong{color:#334150;font-size:13px}.sb-as-intent-source-copy span{overflow:hidden;color:#6a7d91;font-size:11px;text-overflow:ellipsis;white-space:nowrap}.sb-as-intent-source-copy small{color:#8996a5;font-size:10.5px;line-height:1.45}.sb-as-intent-source-count{align-self:start;color:#4267a5;font-size:11px;font-weight:680;white-space:nowrap}.sb-as-intent-delivery{display:grid;grid-template-columns:auto repeat(3,minmax(0,1fr));align-items:center;gap:7px;margin:0 0 18px;padding:11px 13px;border-left:3px solid #6e96cf;background:#f7faff}.sb-as-intent-delivery strong{margin-right:4px;color:#53687f;font-size:10.5px;font-weight:700}.sb-as-intent-delivery span{padding:4px 7px;border:1px solid #dce7f6;border-radius:6px;background:#fff;color:#4267a5;font-size:10.5px;line-height:1.3;text-align:center}.sb-as-intent-delivery small{grid-column:1/-1;color:#7f8c9b;font-size:10.5px;line-height:1.45}.sb-as-intent-list-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 9px}.sb-as-intent-list-head>strong{color:#334150;font-size:13px}.sb-as-intent-list-tools{display:flex;align-items:center;gap:10px;color:#8290a0;font-size:10.5px}.sb-as-intent-list-tools button{border:0;padding:0;background:transparent;color:#4267a5;font:inherit;font-size:10.5px;font-weight:680;cursor:pointer}.sb-as-intent-list-tools button:hover{text-decoration:underline}.sb-as-intent-candidate-list{display:grid;gap:8px}.sb-as-intent-candidate{display:grid;grid-template-columns:20px minmax(0,1fr);gap:11px;align-items:start;padding:13px 14px;border:1px solid #e0e7ef;border-radius:10px;background:#fff;cursor:pointer}.sb-as-intent-candidate:has(input:checked){border-color:#6e96cf;background:#f8fbff;box-shadow:0 0 0 1px #6e96cf}.sb-as-intent-candidate input{margin-top:3px;accent-color:#4267a5}.sb-as-intent-candidate-copy{display:grid;gap:4px}.sb-as-intent-candidate-copy strong{font-size:13px;color:#27313a}.sb-as-intent-candidate-copy span{font-size:12px;color:#4f5f70;line-height:1.5}.sb-as-intent-candidate-copy small{font-size:10.5px;color:#94a0ad}.sb-as-intent-actions{align-items:center;justify-content:space-between;margin-top:20px;padding-top:16px;border-top:1px solid #e8edf2}.sb-as-intent-start-note{max-width:390px;color:#7a8795;font-size:10.5px;line-height:1.5}.sb-as-intent-result-list{display:grid;gap:8px;margin-top:18px}.sb-as-intent-result{padding:12px 14px;border:1px solid #e1e7ed;border-radius:9px;background:#fff}.sb-as-intent-result strong{margin-right:10px;color:#27313a;font-size:13px}.sb-as-intent-result span{color:#4267a5;font-size:11px}.sb-as-intent-result p{margin:7px 0 0;color:#687687;font-size:11px;line-height:1.5}
@media(max-width:640px){.sb-as-intent-mode-grid{grid-template-columns:1fr}.sb-as-intent-source{grid-template-columns:1fr}.sb-as-intent-source-count{justify-self:start}.sb-as-intent-delivery{grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}.sb-as-intent-delivery strong,.sb-as-intent-delivery small{grid-column:1/-1}.sb-as-intent-list-head{align-items:flex-start;flex-direction:column;gap:6px}.sb-as-intent-actions{align-items:stretch;flex-direction:column}.sb-as-intent-actions button{width:100%}}
.sb-as-use:has(.sb-as-user-analysis-setup){max-width:800px;padding-top:44px}.sb-as-user-analysis-setup{max-width:760px}.sb-as-user-analysis-source{display:grid;gap:10px;margin-top:22px;padding:16px;border:1px solid #dfe7f2;border-radius:12px;background:#f8faff}.sb-as-user-analysis-source-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px}.sb-as-user-analysis-source-head strong{color:#29333d;font-size:14px;font-weight:700}.sb-as-user-analysis-source-head span{color:#6d86a7;font-size:11px;white-space:nowrap}.sb-as-user-analysis-source small{color:#7d8793;font-size:11px;line-height:1.55}.sb-as-user-analysis-url-field{display:grid;gap:8px;color:#4f5d6b;font-size:12px;font-weight:650}.sb-as-user-analysis-url-field input{width:100%;height:42px;box-sizing:border-box;border:1px solid #d5dfed;border-radius:9px;padding:0 12px;background:#fff;color:#1F2329;font:inherit;font-size:12px;outline:none}.sb-as-user-analysis-url-field input:focus{border-color:#4267A5;box-shadow:0 0 0 3px rgba(66,103,165,.1)}.sb-as-user-analysis-prompt{display:grid;gap:8px;margin-top:22px;color:#303a45;font-size:14px;font-weight:680}.sb-as-user-analysis-prompt textarea{width:100%;min-height:112px;box-sizing:border-box;padding:12px;border:1px solid #d5dfed;border-radius:9px;background:#fff;color:#30363c;font:inherit;font-size:13px;font-weight:400;line-height:1.6;resize:vertical;outline:none}.sb-as-user-analysis-prompt textarea:focus{border-color:#4267A5;box-shadow:0 0 0 3px rgba(66,103,165,.1)}.sb-as-user-analysis-prompt textarea::placeholder{color:#a0aab6}.sb-as-user-analysis-actions{align-items:center;justify-content:space-between;margin-top:26px;padding-top:17px;border-top:1px solid #e8ecf0}.sb-as-user-analysis-start-note{max-width:390px;color:#7b8794;font-size:10.5px;line-height:1.55}.sb-as-user-analysis-actions button.primary{height:42px;min-width:148px;border-radius:10px;font-size:13px;box-shadow:0 7px 16px rgba(31,35,41,.12)}
@media(max-width:640px){.sb-as-use:has(.sb-as-user-analysis-setup){padding:34px 18px 42px}.sb-as-user-analysis-actions{align-items:stretch;flex-direction:column}.sb-as-user-analysis-start-note{max-width:none}.sb-as-user-analysis-actions button.primary{width:100%}}
.sb-as-use:has(.sb-as-specialist-worksite){max-width:1440px;padding:20px 28px 40px}.sb-as-use:has(.sb-as-specialist-worksite) .sb-as-use-panel{padding:0;border:0;border-radius:0;background:transparent;box-shadow:none}.sb-as-specialist-worksite{overflow:hidden;border:1px solid #e1e7f0;border-radius:15px;background:#fff;box-shadow:0 1px 2px rgba(56,84,125,.035)}.sb-as-specialist-worksite-head{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:62px;padding:0 19px;border-bottom:1px solid #e8edf2}.sb-as-specialist-worksite-title{display:grid;gap:3px;min-width:0}.sb-as-specialist-worksite-title strong{color:#27313a;font-size:18px;font-weight:720;line-height:1.35}.sb-as-specialist-worksite-title span{overflow:hidden;color:#85909c;font-size:11px;line-height:1.45;text-overflow:ellipsis;white-space:nowrap}.sb-as-specialist-status{display:inline-flex;align-items:center;gap:7px;flex:none;color:#82909e;font-size:11px;white-space:nowrap}.sb-as-specialist-status i{width:8px;height:8px;border-radius:50%;background:#b8c2cc;box-shadow:0 0 0 5px #f3f6f9}.sb-as-specialist-status.is-live{color:#3479cf}.sb-as-specialist-status.is-live i{background:#2f80ed;box-shadow:0 0 0 5px #edf5ff}.sb-as-specialist-status.is-success{color:#2d8c64}.sb-as-specialist-status.is-success i{background:#36a574;box-shadow:0 0 0 5px #edf8f3}.sb-as-specialist-status.is-error{color:#b86154}.sb-as-specialist-status.is-error i{background:#d47b6c;box-shadow:0 0 0 5px #fdf1ee}.sb-as-specialist-worksite-grid{display:grid;grid-template-columns:minmax(220px,.78fr) minmax(340px,1.4fr) minmax(260px,.92fr);min-height:600px}.sb-as-specialist-source,.sb-as-specialist-queue,.sb-as-specialist-detail{min-width:0;padding:18px}.sb-as-specialist-source{border-right:1px solid #e8edf2;background:#fafbfd}.sb-as-specialist-queue{background:#fff}.sb-as-specialist-detail{border-left:1px solid #e8edf2;background:#fcfdfe}.sb-as-specialist-column-head{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:14px}.sb-as-specialist-column-head strong{color:#36404a;font-size:13px;font-weight:700}.sb-as-specialist-column-head span{color:#98a2ad;font-size:10.5px}.sb-as-specialist-source-list,.sb-as-specialist-rows,.sb-as-specialist-facts{display:grid;gap:8px}.sb-as-specialist-source-item{display:grid;gap:4px;padding:10px 11px;border:1px solid #e5eaf0;border-radius:8px;background:#fff}.sb-as-specialist-source-item strong{color:#4b5a6b;font-size:11px;font-weight:680}.sb-as-specialist-source-item span{color:#7f8b98;font-size:11px;line-height:1.55;overflow-wrap:anywhere}.sb-as-specialist-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;width:100%;padding:12px;border:1px solid #e4e9ef;border-radius:8px;background:#fff;color:inherit;text-align:left;font:inherit;cursor:pointer;transition:border-color .16s ease,background .16s ease,box-shadow .16s ease}.sb-as-specialist-row:hover{border-color:#b7d1f1;background:#fbfdff}.sb-as-specialist-row.is-selected{border-color:#78a9e3;background:#f5faff;box-shadow:0 0 0 1px #78a9e3}.sb-as-specialist-row-copy{display:grid;gap:4px;min-width:0}.sb-as-specialist-row-copy strong{overflow:hidden;color:#303a44;font-size:13px;font-weight:680;text-overflow:ellipsis;white-space:nowrap}.sb-as-specialist-row-copy span{display:-webkit-box;overflow:hidden;color:#7b8793;font-size:11px;line-height:1.5;-webkit-box-orient:vertical;-webkit-line-clamp:2}.sb-as-specialist-row-meta{align-self:start;padding-top:2px;color:#6683a7;font-size:10px;line-height:1.4;text-align:right;white-space:nowrap}.sb-as-specialist-row-meta.is-error{color:#b96858}.sb-as-specialist-row-meta.is-success{color:#2d8c64}.sb-as-specialist-empty{display:grid;place-items:center;min-height:230px;padding:22px;color:#9ba5af;font-size:12px;line-height:1.7;text-align:center}.sb-as-specialist-person{display:grid;gap:4px;padding-bottom:16px;border-bottom:1px solid #e9edf2}.sb-as-specialist-person strong{color:#2d3741;font-size:16px;line-height:1.35}.sb-as-specialist-person span{color:#8b96a2;font-size:11px;line-height:1.55}.sb-as-specialist-fact{display:grid;gap:4px;padding:10px 0;border-bottom:1px solid #edf0f3}.sb-as-specialist-fact:last-child{border-bottom:0}.sb-as-specialist-fact strong{color:#687686;font-size:10.5px;font-weight:680}.sb-as-specialist-fact span{color:#465361;font-size:12px;line-height:1.6;overflow-wrap:anywhere}.sb-as-specialist-fact.is-evidence span{padding:9px 10px;border-radius:7px;background:#f5f8fb;color:#516171}.sb-as-specialist-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px}.sb-as-specialist-actions button{height:34px;padding:0 11px;border:1px solid #dce4ed;border-radius:8px;background:#fff;color:#526273;font:inherit;font-size:11px;font-weight:650;cursor:pointer}.sb-as-specialist-actions button.primary{border-color:#2f80ed;background:#2f80ed;color:#fff}.sb-as-specialist-actions button:hover{border-color:#aabed6;background:#f7faff}.sb-as-specialist-actions button.primary:hover{border-color:#246fce;background:#246fce}.sb-as-specialist-conversation{display:grid;align-content:start;gap:10px;min-height:100%}.sb-as-specialist-messages{display:grid;gap:9px}.sb-as-specialist-message{max-width:88%;padding:10px 11px;border-radius:9px;background:#f2f5f8;color:#4d5c6b;font-size:12px;line-height:1.6}.sb-as-specialist-message.outbound{justify-self:end;background:#eaf3ff;color:#326496}.sb-as-specialist-message small{display:block;margin-bottom:3px;color:#8290a0;font-size:10px}.sb-as-specialist-notice{margin-top:13px;padding:10px 11px;border:1px solid #dce9f8;border-radius:8px;background:#f6faff;color:#5c7693;font-size:11px;line-height:1.6}.sb-as-specialist-notice.is-error{border-color:#f0d7d1;background:#fff7f5;color:#a86658}
@media(max-width:980px){.sb-as-use:has(.sb-as-specialist-worksite){padding:18px 20px 36px}.sb-as-specialist-worksite-grid{grid-template-columns:minmax(190px,.72fr) minmax(290px,1.25fr) minmax(230px,.86fr)}.sb-as-specialist-source,.sb-as-specialist-queue,.sb-as-specialist-detail{padding:15px}}
@media(max-width:760px){.sb-as-use:has(.sb-as-specialist-worksite){padding:16px}.sb-as-specialist-worksite-grid{grid-template-columns:1fr;min-height:0}.sb-as-specialist-source,.sb-as-specialist-queue,.sb-as-specialist-detail{border:0;border-bottom:1px solid #e8edf2}.sb-as-specialist-detail{border-bottom:0}.sb-as-specialist-empty{min-height:150px}.sb-as-specialist-worksite-title span{white-space:normal}.sb-as-specialist-worksite-head{align-items:flex-start;flex-direction:column;gap:8px;padding:15px 16px}.sb-as-specialist-status{padding-left:2px}}
.sb-composite-finder-steps.is-public{grid-template-columns:repeat(2,minmax(0,1fr))}
.sb-as-composite-finder .sb-public-finder-targets{margin:0 0 14px}.sb-as-composite-finder .sb-public-finder-targets legend{margin-bottom:11px;color:#2d343b;font-size:17px;font-weight:680}.sb-as-composite-finder .sb-public-finder-targets .sb-task-choice-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.sb-as-composite-finder .sb-public-finder-targets .sb-task-choice{min-height:88px;padding:14px 15px;border-radius:8px}.sb-as-composite-finder .sb-public-finder-targets .sb-task-choice strong{font-size:13px}.sb-as-composite-finder .sb-public-finder-targets .sb-task-choice small{font-size:10.5px}
.sb-as-composite-finder .sb-public-finder-brief{gap:0;margin:0 0 16px;padding:0 0 16px}
.sb-public-finder-goal-field{gap:8px}.sb-as-composite-finder .sb-public-finder-goal-field textarea{min-height:132px;padding:15px 16px;border-color:#d4dce7;font-size:14px;line-height:1.7;box-shadow:0 8px 20px rgba(31,35,41,.035)}.sb-as-composite-finder .sb-public-finder-goal-field textarea:focus{border-color:#7799ca;box-shadow:0 0 0 4px rgba(66,103,165,.08),0 12px 28px rgba(31,35,41,.05)}.sb-public-finder-prompt-label{margin-top:2px;color:#7f8b99;font-size:10.5px;font-weight:650}.sb-public-finder-prompts{display:flex;flex-wrap:wrap;gap:8px}.sb-public-finder-prompt{min-height:34px;padding:0 11px;border:1px solid #dfe5ec;border-radius:8px;background:#fff;color:#5f6d7e;font:inherit;font-size:11px;cursor:pointer;transition:border-color .15s,background .15s,color .15s}.sb-public-finder-prompt:hover{border-color:#91add4;background:#f7faff;color:#315f9a}
.sb-public-finder-limit{display:flex;align-items:center;gap:11px;margin:16px 0;color:#4b5b6d}
.sb-public-finder-limit .sb-public-finder-label{white-space:nowrap}
.sb-public-finder-limit-control{display:flex;align-items:center;gap:7px;color:#697685;font-size:11px}
.sb-public-finder-limit-control input{width:64px;height:34px;box-sizing:border-box;border:1px solid #d9e1ea;border-radius:7px;padding:0 8px;background:#fff;color:#30363c;font:inherit;font-size:12px;outline:0}
.sb-public-finder-limit-control input:focus{border-color:#7799ca;box-shadow:0 0 0 3px rgba(66,103,165,.1)}
.sb-public-finder-limit-control small{color:#929eac;font-size:10.5px}
.sb-public-finder-custom-goal,.sb-public-finder-context,.sb-public-finder-filters{display:block;border-top:1px solid #e8edf2;border-bottom:1px solid #e8edf2}
.sb-public-finder-custom-goal>summary,.sb-public-finder-context>summary,.sb-public-finder-filters>summary{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:54px;cursor:pointer;list-style:none}
.sb-public-finder-custom-goal>summary::-webkit-details-marker,.sb-public-finder-context>summary::-webkit-details-marker,.sb-public-finder-filters>summary::-webkit-details-marker{display:none}
.sb-public-finder-custom-goal>summary:after,.sb-public-finder-context>summary:after,.sb-public-finder-filters>summary:after{content:"+";display:grid;place-items:center;width:21px;height:21px;flex:none;border-radius:50%;background:#f0f3f6;color:#718093;font-size:15px;line-height:1}
.sb-public-finder-custom-goal[open]>summary:after,.sb-public-finder-context[open]>summary:after,.sb-public-finder-filters[open]>summary:after{content:"−"}
.sb-public-finder-context-copy{display:grid;gap:3px;min-width:0}
.sb-public-finder-context-copy strong{color:#405162;font-size:12px;font-weight:680}
.sb-public-finder-context-copy small{color:#8b97a4;font-size:10.5px;line-height:1.45}
.sb-public-finder-context.is-required{border-top-color:#a9c4eb;border-bottom-color:#a9c4eb;background:#fbfdff}
.sb-public-finder-context.is-required>summary{padding:0 10px;background:#f4f8ff}
.sb-public-finder-context.is-required .sb-public-finder-context-copy strong{color:#2f5f9f}
.sb-public-finder-context.is-required .sb-public-finder-label{color:#315f9a}
.sb-public-finder-context.is-required input[required]{border-color:#9db9e3;background:#fff}
.sb-public-finder-custom-goal-body{display:grid;gap:10px;padding:1px 0 15px}.sb-public-finder-custom-goal textarea{width:100%;box-sizing:border-box;min-height:88px;padding:12px 13px;border:1px solid #d9e1ea;border-radius:8px;background:#fff;color:#30363c;font:inherit;font-size:12px;line-height:1.6;resize:vertical;outline:0}.sb-public-finder-custom-goal textarea:focus{border-color:#7799ca;box-shadow:0 0 0 3px rgba(66,103,165,.1)}
.sb-public-finder-context-body{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;padding:1px 0 15px}
.sb-as-composite-finder .sb-public-finder-field{gap:6px}
.sb-as-composite-finder .sb-public-finder-field textarea{min-height:76px}
.sb-as-composite-finder .sb-public-finder-hint{min-height:0}
.sb-public-finder-filters{margin:0 0 8px}
.sb-public-finder-filters>summary strong{color:#4b5b6d;font-size:12px;font-weight:680}
.sb-public-finder-filters>summary span{margin-left:auto;color:#929eac;font-size:10.5px}
.sb-public-finder-filters-body{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;padding:1px 0 15px}
.sb-public-finder-filter-field{display:grid;gap:6px;color:#697889;font-size:10.5px;font-weight:650}
.sb-public-finder-filter-field select{width:100%;height:36px;box-sizing:border-box;border:1px solid #d9e1ea;border-radius:7px;padding:0 9px;background:#fff;color:#394653;font:inherit;font-size:11px;outline:0}
.sb-public-finder-filter-field select:focus{border-color:#7799ca;box-shadow:0 0 0 3px rgba(66,103,165,.1)}
@media(max-width:640px){.sb-composite-finder-steps.is-public{grid-template-columns:repeat(2,minmax(0,1fr))}.sb-as-composite-finder .sb-public-finder-targets .sb-task-choice-grid{grid-template-columns:1fr;gap:8px}.sb-as-composite-finder .sb-public-finder-targets .sb-task-choice{min-height:76px}.sb-public-finder-limit{align-items:flex-start;flex-direction:column;gap:7px}.sb-public-finder-prompts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}.sb-public-finder-prompt{width:100%;padding:0 10px;text-align:left}.sb-public-finder-custom-goal-body,.sb-public-finder-context-body,.sb-public-finder-filters-body{grid-template-columns:1fr}.sb-public-finder-custom-goal>summary,.sb-public-finder-context>summary,.sb-public-finder-filters>summary{min-height:58px}.sb-public-finder-context-copy small{max-width:250px}.sb-public-finder-filters>summary{align-items:flex-start;padding:11px 0}.sb-public-finder-filters>summary span{margin-left:0}.sb-public-finder-filters>summary:after{margin-top:7px}}
.sb-as-intent-candidate{grid-template-columns:minmax(0,1fr);cursor:default}.sb-as-intent-candidate-copy{min-width:0}.sb-as-intent-candidate-copy span{overflow-wrap:anywhere}
.sb-as-specialist-human-notice{margin-top:12px;padding:10px 11px;border:1px solid #cce8da;border-radius:8px;background:#f3fbf6;color:#2d7655;font-size:11px;line-height:1.6}.sb-as-specialist-composer{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;margin-top:12px}.sb-as-specialist-composer textarea{width:100%;min-height:70px;box-sizing:border-box;padding:10px 11px;border:1px solid #dce4ed;border-radius:8px;background:#fff;color:#354454;font:inherit;font-size:12px;line-height:1.6;resize:vertical;outline:0}.sb-as-specialist-composer textarea:focus{border-color:#6d9bd2;box-shadow:0 0 0 3px rgba(47,128,237,.1)}.sb-as-specialist-composer textarea::placeholder{color:#9aa6b2}.sb-as-specialist-composer button{align-self:end;height:36px;min-width:64px;padding:0 13px;border:1px solid #2f80ed;border-radius:8px;background:#2f80ed;color:#fff;font:inherit;font-size:11px;font-weight:680;cursor:pointer}.sb-as-specialist-composer button:hover:not(:disabled){background:#246fce;border-color:#246fce}.sb-as-specialist-composer button:disabled{opacity:.55;cursor:wait}
`;

let styleInjected = false;
function ensureStyle() {
  if (styleInjected) return;
  const tag = document.createElement("style");
  tag.textContent = CSS + TASK_FLOW_CSS;
  document.head.appendChild(tag);
  styleInjected = true;
}


const DEVELOPER_MODE_AGENT_IDS = new Set([
  "mkt-find-people",
  "mkt-intent-analyst",
  "mkt-cold-writer",
  "mkt-dm-inbox"
]);
const INBOX_AGENT_IDS = new Set(["mkt-dm-inbox", GOLD_CUSTOMER_SERVICE_AGENT_ID]);
const AGENT_WORKFLOW_CATEGORIES = Object.freeze(["开发者模式", ...MARKETPLACE_CATEGORIES]);
const AGENT_WORKFLOW_DISPLAY_ORDER = Object.freeze(["找人", "分析", "触达", "私信对话", "开发者模式"]);
const AGENT_SQUARE_FILTER_ORDER = Object.freeze(["全部", ...AGENT_WORKFLOW_DISPLAY_ORDER]);
const AGENT_STAGE_ICONS = Object.freeze({
  全部: { filledIcon: "agent-grid", color: "#536273" },
  开发者模式: { filledIcon: "developer", color: "#536273" },
  找人: { filledIcon: "user-search", color: "#278AF0" },
  触达: { filledIcon: "paper-plane", color: "#7C45F7" },
  私信对话: { filledIcon: "chat-bubble", color: "#E28A2B" },
  分析: { filledIcon: "analysis-chart", color: "#5CB85C" }
});
const FILLED_STAGE_ICON_MARKUP = Object.freeze({
  "agent-grid": '<path fill="currentColor" d="M4 3h6a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm10 0h6a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM4 13h6a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1Zm10 0h6a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-6a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1Z"/>',
  developer: '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="m8 7-4 5 4 5m8-10 4 5-4 5M14 4l-4 16"/>',
  "user-search": '<circle cx="9" cy="8.5" r="4.8" fill="none" stroke="currentColor" stroke-width="2.3"/><path fill="currentColor" d="M3.6 20.4c.38-3.45 2.2-5.45 5.4-5.45 1.9 0 3.4.52 4.4 1.57l-1.6 1.6c-.67-.48-1.6-.72-2.8-.72-1.35 0-2.25.48-2.7 1.44-.16.34-.27.86-.33 1.56H3.6Z"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2.3" d="m12.6 12.1 6.1 6.1"/>',
  "paper-plane": '<path fill="currentColor" d="m2.3 3.55 19.1 7.58a1 1 0 0 1 0 1.86L2.3 20.57a1 1 0 0 1-1.34-1.17l2.1-6.73 8.22-.62a.8.8 0 0 0 0-1.6l-8.22-.62-2.1-6.73A1 1 0 0 1 2.3 3.55Z"/>',
  "chat-bubble": '<path fill="currentColor" d="M12 2.5c5.52 0 10 3.58 10 8s-4.48 8-10 8c-1.02 0-2-.12-2.9-.36L4.1 21l.56-3.3C2.42 16.28 2 13.55 2 10.5c0-4.42 4.48-8 10-8Zm-4.35 7.2a1.45 1.45 0 1 0 0 2.9 1.45 1.45 0 0 0 0-2.9Zm4.35 0a1.45 1.45 0 1 0 0 2.9 1.45 1.45 0 0 0 0-2.9Zm4.35 0a1.45 1.45 0 1 0 0 2.9 1.45 1.45 0 0 0 0-2.9Z"/>',
  "analysis-chart": '<path fill="currentColor" d="M3.2 18.2h3.35v3H3.2v-3Zm5.1-5.45h3.35V21.2H8.3v-8.45Zm5.1-4.25h3.35V21.2H13.4V8.5Z"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="m3.5 15.8 4.8-4.25 3.65 2.1 6.25-7.1"/><path fill="currentColor" d="m15.9 6.05 5.1.1-.68 5.05-1.75-2.02-2.67 3.05-1.65-1.45 2.67-3.05-2.12-.04 1.1-1.64Z"/>'
});

function createFilledStageIcon(stage, color) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.classList.add("sb-as-category-icon");
  svg.style.color = color;
  svg.innerHTML = FILLED_STAGE_ICON_MARKUP[stage] || "";
  return svg;
}
const MARKETPLACE_WORKFLOW_STAGE = Object.freeze({
  "mkt-intent-analyst": "分析",
  "mkt-live-danmaku-analysis": "分析",
  "mkt-live-danmaku-outreach": "触达",
  "mkt-viral-work-analysis": "分析",
  "mkt-cold-writer": "触达",
  "mkt-dm-inbox": "私信对话",
  [GOLD_CUSTOMER_SERVICE_AGENT_ID]: "私信对话"
});

const LEAD_AUDIENCE_TYPE_OPTIONS = Object.freeze([
  ["近期准备下单", "已经在看产品，近期有购买计划"],
  ["主动询价比价", "评论里主动问价格、渠道或优惠"],
  ["有明确预算和时间", "表达预算、用途或购买时间"],
  ["正在解决具体问题", "现有产品无法满足，正在找替代方案"]
]);

function workflowCategory(agent) {
  if (agent?.id === DOUYIN_ACQUISITION_COMPLETE_AGENT_ID) return null;
  if (DEVELOPER_MODE_AGENT_IDS.has(agent?.id)) return "开发者模式";
  const category = normalizeMarketplaceCapability(MARKETPLACE_WORKFLOW_STAGE[agent?.id] || agent?.category);
  return AGENT_WORKFLOW_CATEGORIES.includes(category) ? category : "触达";
}

function buildLeadTargetPreview(flow = {}) {
  const audience = Array.isArray(flow.audienceTypes) && flow.audienceTypes.length
    ? flow.audienceTypes.join("、")
    : "";
  const product = String(flow.product || "").trim();
  if (audience && product) return `${audience} · 关注${product}`;
  return audience || product || "未填写筛选目标";
}

// Only the focused Douyin acquisition roster is available for new work. Legacy
// marketplace capabilities remain visible as disabled cards for continuity.
const DEFAULT_INSTALLED_MARKETPLACE_IDS = new Set();
const AGENT_SQUARE_PLACEHOLDER_AGENTS = Object.freeze([
  Object.freeze({
    id: "mkt-tiktok-acquisition",
    displayName: "Tiktok获客管家",
    displayTitle: "Tiktok获客能力即将开放",
    category: "找人",
    desc: "Tiktok 获客能力正在准备中，敬请期待。",
    skills: ["发现潜在客户", "筛选互动信号", "沉淀获客线索"]
  })
]);

function isFirstReleaseAgent(agent) {
  if (!isMarketplaceAgentAvailable(agent)) return false;
  const acquisitionCard = getAcquisitionCardViewModel(agent);
  return acquisitionCard ? acquisitionCard.startable : true;
}

function isAgentReadyForUse(agent) {
  return isHired(agent?.id);
}

/** 能力标签：跟随成员主色的彩色高亮（浅底 + 主色文字），比灰色更醒目。 */
function buildSkillTag(text, color) {
  const tag = el("span", "sb-as-tag sb-as-tag-skill", text);
  tag.style.color = color;
  tag.style.background = `${color}14`;
  tag.style.border = `1px solid ${color}33`;
  return tag;
}

const CATEGORY_ACCENTS = Object.freeze({
  "找人": ["#4267A5", "#EFF3FA", "#D6E0F0"],
  "分析": ["#357A73", "#EEF7F5", "#D4EAE7"],
  "触达": ["#9A6A35", "#FBF5EC", "#EDDFC7"],
  "销售": ["#4267A5", "#EFF3FA", "#D6E0F0"],
  "客户成功": ["#357A73", "#EEF7F5", "#D4EAE7"],
  "招聘猎头": ["#8A5D82", "#F7F0F6", "#E9D9E6"],
  "教育培训": ["#9A6A35", "#FBF5EC", "#EDDFC7"],
  "专业服务": ["#5B6D8C", "#F1F4F8", "#DCE4EF"],
  "录音总结": ["#477D75", "#EFF7F5", "#D7EBE7"]
});

function categoryAccent(category) {
  return CATEGORY_ACCENTS[category] || ["#536273", "#F1F3F6", "#DCE2EA"];
}

const LIVE_DANMAKU_ANALYSIS_ACCENT = Object.freeze(["#7357C8", "#F3F0FF", "#DDD5F5"]);

function marketplaceCardAccent(agent, category = agent?.category) {
  return agent?.id === "mkt-live-danmaku-analysis"
    ? LIVE_DANMAKU_ANALYSIS_ACCENT
    : categoryAccent(category);
}

const TEAM_CARD_META = Object.freeze({
  main: {
    phase: "总控",
    description: "理解业务目标，拆解任务并组织团队，审核每一次交付。",
    tags: ["目标拆解", "团队协同", "交付审核"]
  },
  "Strategy Agent": {
    phase: "找人",
    description: "把业务目标转成客户画像、需求信号和可执行的找人策略。",
    tags: ["客户画像", "来源策略", "范围设计"]
  },
  "Browser Agent": {
    phase: "找人",
    description: "从抖音账号、粉丝、评论和直播互动中发现并验证潜在线索。",
    tags: ["账号检索", "互动挖掘", "证据留存"]
  },
  "Search Agent": {
    phase: "分析",
    description: "合并重复账号，按意向和画像评分，输出可解释的优先级。",
    tags: ["去重清洗", "意向评分", "证据核验"]
  },
  "Research Agent": {
    phase: "分析",
    description: "整理主页、作品和评论，提炼需求信号与下一步切入点。",
    tags: ["客户分析", "需求信号", "客户简报"]
  },
  "App Agent": {
    phase: "触达",
    description: "基于客户证据制定首轮触达方式、首句和批次节奏。",
    tags: ["触达策略", "首触生成", "节奏设计"]
  },
  "Risk Agent": {
    phase: "触达",
    description: "检查重复触达、权限、频控和勿扰状态，给出风险处理结论。",
    tags: ["重复拦截", "权限校验", "风险判断"]
  },
  "Outreach Agent": {
    phase: "触达",
    description: "执行已批准的私信和评论动作，逐条记录平台执行结果。",
    tags: ["私信执行", "评论触达", "结果记录"]
  },
  "Outreach Ops Agent": {
    phase: "触达",
    description: "管理触达队列、分批计划、失败重试和回复后的流程停止。",
    tags: ["队列管理", "失败重试", "状态记录"]
  }
});

const TEAM_CARD_ACCENTS = Object.freeze({
  main: ["#4267A5", "#EFF3FA", "#D6E0F0"],
  "Strategy Agent": ["#5B6D8C", "#F1F4F8", "#DCE4EF"],
  "Browser Agent": ["#8A5D82", "#F7F0F6", "#E9D9E6"],
  "Search Agent": ["#477D75", "#EFF7F5", "#D7EBE7"],
  "Research Agent": ["#357A73", "#EEF7F5", "#D4EAE7"],
  "App Agent": ["#9A6A35", "#FBF5EC", "#EDDFC7"],
  "Risk Agent": ["#6B638C", "#F3F1F8", "#E0DCEE"],
  "Outreach Agent": ["#4267A5", "#EFF3FA", "#D6E0F0"],
  "Outreach Ops Agent": ["#477D75", "#EFF7F5", "#D7EBE7"]
});

function teamCardAccent(agentType) {
  return TEAM_CARD_ACCENTS[agentType] || categoryAccent("专业服务");
}

function teamCardMeta(agentType, profile) {
  const preset = TEAM_CARD_META[agentType];
  if (preset) return preset;
  const responsibilities = profile?.role?.responsibilities || [];
  return {
    description: responsibilities.slice(0, 3).join("，") || "可被主 Agent 调度的默认成员。",
    tags: responsibilities.slice(0, 3)
  };
}

function buildProviderRow(employmentStatus = "未雇佣") {
  const hired = employmentStatus === "已雇佣";
  const row = el("div", `sb-as-provider${hired ? " is-hired" : ""}`);
  row.appendChild(el("span", hired ? "sb-as-provider-check" : "sb-as-provider-dot", hired ? "✓" : ""));
  row.appendChild(el("span", null, employmentStatus));
  return row;
}

/**
 * 打开 Agent 市场页。
 * deps: { teamLive, gateway, onChat(agentTypeOrId), onClose }
 */
export function openAgentSquarePage({ teamLive, gateway = null, onChat, onClose, initialAgentId = null, resumeFlow = null, embeddedContainer = null } = {}) {
  const embedded = Boolean(embeddedContainer);
  if (!embedded) persistNavigationRoute("agentSquare", initialAgentId ? { initialAgentId } : {});
  ensureStyle();
  const page = embedded
    ? {
      root: embeddedContainer,
      body: embeddedContainer,
      setTitle() {},
      showBack() {},
      close() {}
    }
    : openPage({
      title: "Agent市场",
      onClose: () => {
        clearNavigationRoute("agentSquare");
        onClose?.();
      }
    });
  const pageHead = embedded ? null : page.root.querySelector(".sb-page-head");
  const root = el("div", "sb-as notranslate");
  root.setAttribute("translate", "no");
  page.body.appendChild(root);

  const state = {
    view: "home",
    categoryNav: "全部",
    useId: null,
    useFlow: null,
    employmentError: null,
    remoteOfficeWorks: [],
    remoteOfficeSnapshot: [],
    remoteOfficeStatusAvailable: false
  };
  let disposed = false;
  let employmentOverlay = null;
  let accountBusyOverlay = null;
  let outreachOverlay = null;
  let cloudExitOverlay = null;
  let employmentSubmitting = false;
  let employmentContractsLoaded = false;
  let remoteOfficeRefreshPending = null;
  let remoteOfficeTimer = null;
  const useTimers = [];
  const privateOutreachMockData = isPrivateOutreachMockPreview() ? createPrivateOutreachMockData() : null;

  function remoteOfficeWorkForAgent(agentId) {
    const remoteActive = activeAgentSquareWorkForAgent(state.remoteOfficeWorks, agentId);
    if (remoteActive) return remoteActive;

    const localActive = activeAgentSquareWorkForAgent(listWorks(), agentId);
    return localActive || null;
  }

  function activeWorkForAgent(agentId) {
    return remoteOfficeWorkForAgent(agentId);
  }

  function remoteWorkMatchesFlow(work, flow) {
    if (!work || !flow || !workMatchesAgent(work, flow.agentId)) return false;
    const workTaskId = String(work.taskId || work.metadata?.taskId || work.metadata?.task_id || "").trim();
    const workTaskRunId = String(work.taskRunId || work.metadata?.taskRunId || work.metadata?.task_run_id || "").trim();
    const flowTaskId = String(flow.taskId || "").trim();
    const flowTaskRunId = String(flow.taskRunId || "").trim();
    return Boolean(flowTaskId && workTaskId === flowTaskId && (!flowTaskRunId || workTaskRunId === flowTaskRunId));
  }

  function syncViralFlowFromRemote() {
    const flow = state.useFlow;
    if (!flow || flow.step !== "running" || flow.mockPreview) return false;
    const remote = state.remoteOfficeWorks.find((work) => remoteWorkMatchesFlow(work, flow));
    if (!remote) return false;
    const nextProgress = Number(remote.progress ?? remote.metadata?.progress);
    const nextPhase = String(remote.phase || remote.metadata?.phase || "").trim();
    let changed = false;
    if (Number.isFinite(nextProgress) && nextProgress !== Number(flow.progress)) {
      flow.progress = Math.max(0, Math.min(100, nextProgress));
      changed = true;
    }
    if (nextPhase && nextPhase !== flow.phase) {
      flow.phase = nextPhase;
      changed = true;
    }
    return changed;
  }

  async function refreshRemoteOfficeStatus() {
    if (disposed || remoteOfficeRefreshPending) return remoteOfficeRefreshPending;
    remoteOfficeRefreshPending = (async () => {
      const config = globalThis.__SALEBUDDY_CONFIG__ || {};
      const key = config.controlPlaneApiKey || document.querySelector('meta[name="salebuddy-control-plane-api-key"]')?.content;
      const header = String(config.controlPlaneApiKeyHeader || "authorization").toLowerCase();
      const headers = { accept: "application/json" };
      if (key) headers[header] = header === "authorization" ? `Bearer ${key}` : key;
      try {
        const response = await fetch(`${receptionBaseUrl()}/v1/office/status`, { headers, cache: "no-store" });
        if (!response.ok) throw new Error(`Office status request failed: ${response.status}`);
        const result = await response.json();
        state.remoteOfficeSnapshot = Array.isArray(result?.works) ? result.works : [];
        state.remoteOfficeWorks = officeStatusWorksToRealtimeWorks(result?.taskWorks || state.remoteOfficeSnapshot);
        state.remoteOfficeStatusAvailable = true;
        const flowChanged = syncViralFlowFromRemote();
        if (!disposed && (state.view === "home" || flowChanged)) render();
      } catch {
        // Keep the in-page work source visible if the control plane cannot be reached.
        state.remoteOfficeStatusAvailable = false;
      } finally {
        remoteOfficeRefreshPending = null;
      }
    })();
    return remoteOfficeRefreshPending;
  }

  function controlPlaneBaseUrl() {
    return globalThis.__SALEBUDDY_CONFIG__?.controlPlaneUrl
      || document.querySelector('meta[name="salebuddy-control-plane"]')?.content
      || "http://127.0.0.1:6681";
  }

  async function douyinMcpCall(method, path, body = null, timeoutMs = 12000) {
    const baseUrl = String(controlPlaneBaseUrl()).replace(/\/$/, "");
    const controller = new AbortController();
    let timedOut = false;
    const requestedTimeout = Number(timeoutMs);
    const hasDeadline = Number.isFinite(requestedTimeout) && requestedTimeout > 0;
    const timer = hasDeadline ? window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, requestedTimeout) : null;
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: { accept: "application/json", ...(body ? { "content-type": "application/json" } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || result?.ok === false) {
        const error = result?.error || {};
        throw Object.assign(new Error(error.message || `云电脑服务返回 HTTP ${response.status}`), {
          code: error.code || "DOUYIN_MCP_REQUEST_FAILED",
          details: error.details || result?.details || null
        });
      }
      return result || {};
    } catch (error) {
      // Safari/Chromium expose AbortController timeouts with inconsistent
      // messages. Keep the implementation detail out of the user-facing UI.
      const message = String(error?.message || "");
      if (timedOut || error?.name === "AbortError" || /signal is aborted/i.test(message)) {
        throw Object.assign(new Error(`云电脑服务响应超时（${Math.ceil(requestedTimeout / 1000)} 秒）`), {
          code: "CONTROL_PLANE_TIMEOUT",
          timeoutMs: requestedTimeout,
          cause: error
        });
      }
      throw error;
    } finally {
      if (timer) window.clearTimeout(timer);
    }
  }

  function executeCoreAgent(body = {}, timeoutMs = 120000) {
    return douyinMcpCall("POST", "/v1/core-agent-executions", body, timeoutMs);
  }

  async function loadInboxKnowledge(flow) {
    if (!flow || !isInboxAgent({ id: flow.agentId })) return;
    flow.knowledgeLoading = true;
    flow.knowledgeError = null;
    try {
      const result = await douyinMcpCall("GET", `/v1/knowledge/context?agentId=${encodeURIComponent(authorizationAgentId(flow))}`, null, 15000);
      if (state.view !== "use" || state.useFlow !== flow) return;
      flow.knowledgeEntries = Array.isArray(result?.entries) ? result.entries : [];
      flow.knowledgeContext = typeof result?.context === "string" ? result.context : "";
      flow.knowledgeLoadedAt = new Date().toISOString();
    } catch (error) {
      if (state.view !== "use" || state.useFlow !== flow) return;
      flow.knowledgeEntries = [];
      flow.knowledgeContext = "";
      flow.knowledgeError = error?.message || "知识库暂时不可读";
    } finally {
      if (state.view === "use" && state.useFlow === flow) {
        flow.knowledgeLoading = false;
        render();
      }
    }
  }

  function concreteAccountName(...values) {
    const stalePlaceholderNames = new Set(["已授权抖音账号", "当前已授权抖音账号", "抖音账号"]);
    return values
      .map((value) => String(value || "").trim())
      .find((value) => value && !stalePlaceholderNames.has(value)) || "";
  }

  function mcpStatusIdentity(status = {}) {
    const account = status.account && typeof status.account === "object" ? status.account : {};
    const identity = account.identity && typeof account.identity === "object" ? account.identity : account;
    const accountName = concreteAccountName(
      identity.accountName,
      identity.account_name,
      identity.nickname,
      identity.nick_name,
      account.name
    );
    const uniqueId = identity.uniqueId || identity.unique_id || identity.douyinId || identity.douyin_id || identity.uid || "";
    const uid = identity.uid || identity.userId || identity.user_id || "";
    const secId = identity.secId || identity.sec_id || identity.secUid || identity.sec_uid || "";
    const profileUrl = identity.profileUrl || identity.profile_url || "";
    if (!uniqueId && !uid && !secId && !profileUrl) return null;
    return {
      ...identity,
      accountName,
      ...(uniqueId ? { uniqueId } : {}),
      ...(uid ? { uid } : {}),
      ...(secId ? { secId } : {}),
      ...(profileUrl ? { profileUrl } : {})
    };
  }

  function agentDouyinAccountId(agentId = "") {
    const bindingAgentId = String(agentId || "douyin-global").trim() || "douyin-global";
    return `douyin-agent:${bindingAgentId}`;
  }

  function authorizationStatusUrl(agentId, accountId = "") {
    const params = new URLSearchParams({ agentId: String(agentId || "").trim() });
    if (accountId) params.set("accountId", String(accountId));
    return `/v1/douyin/mcp/status?${params.toString()}`;
  }

  function authorizationRequestBody(agentId, accountId = "", extra = {}) {
    return {
      agentId,
      ...(accountId ? { accountId } : {}),
      ...extra
    };
  }

  function newAuthorizationAccountId() {
    const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `douyin-pending:${random}`;
  }

  function mcpAuthorizedAccount(status, agentId = "", accountId = "") {
    const identity = mcpStatusIdentity(status);
    const loginState = String(status?.login_state || status?.loginState || "").toLowerCase();
    if (!identity || !["logged_in", "authenticated", "authorized", "ready", "success", "已登录"].includes(loginState)) return null;
    const bindingAgentId = String(agentId || "").trim();
    const resolvedAccountId = status?.accountId || status?.account_id || accountId || agentDouyinAccountId(bindingAgentId);
    const saved = rememberAuthorizedManagedAccount({
      id: resolvedAccountId,
      name: concreteAccountName(identity.accountName, identity.account_name, identity.nickname, identity.nick_name, identity.uniqueId) || "账号名称未返回",
      identity,
      accountKey: resolvedAccountId,
      agentId: bindingAgentId || null,
      source: "douyin-mcp",
      status: "运行中",
      computer: "在线",
      authenticationVerified: true
    });
    return saved ? { ...saved, id: resolvedAccountId, accountKey: resolvedAccountId, agentId: bindingAgentId || null } : null;
  }

  async function verifyAcquisitionAuthorization(agentId) {
    const bindingAgentId = String(agentId || "").trim();
    let status;
    try {
      status = await douyinMcpCall("GET", `/v1/douyin/mcp/status?agentId=${encodeURIComponent(bindingAgentId)}`, null, 30000);
    } catch (error) {
      if (error?.code === "DOUYIN_LOGIN_REQUIRED") throw error;
      throw Object.assign(new Error("请先完成抖音账号登录，确认登录后才能启动获客任务"), {
        code: "DOUYIN_LOGIN_REQUIRED",
        cause: error
      });
    }
    const account = mcpAuthorizedAccount(status, bindingAgentId);
    if (!account) {
      throw Object.assign(new Error("请先完成抖音账号登录，确认登录后才能启动获客任务"), {
        code: "DOUYIN_LOGIN_REQUIRED",
        details: { loginState: status?.login_state || status?.loginState || "unknown" }
      });
    }
    return account;
  }

  async function fetchAuthorizedAccounts({ probeRemote = false, agentId = "" } = {}) {
    const requestedAgentId = String(agentId || "").trim();
    const candidateAgentIds = requestedAgentId ? [requestedAgentId] : [];
    const accountForAgent = (account, candidateId) => ({
      ...account,
      id: account.id || agentDouyinAccountId(candidateId),
      accountKey: account.accountKey || account.id || agentDouyinAccountId(candidateId),
      agentId: candidateId
    });
    const accountSupportsAgent = (account, candidateId) => [
      account?.agentId,
      ...(Array.isArray(account?.agentIds) ? account.agentIds : []),
      ...(Array.isArray(account?.capabilityMatrix)
        ? account.capabilityMatrix.filter((capability) => capability?.ready).map((capability) => capability.agentId)
        : [])
    ].filter(Boolean).includes(candidateId);
    const accountsForCandidates = (accounts) => (Array.isArray(accounts) ? accounts : [])
      .flatMap((account) => candidateAgentIds
        .filter((candidateId) => accountSupportsAgent(account, candidateId))
        .map((candidateId) => accountForAgent(account, candidateId)));

    // A successful account-directory response replaces browser cache even when
    // it is empty. An unlinked account must never be reused for a new task.
    try {
      const response = await fetch(`${String(controlPlaneBaseUrl()).replace(/\/$/, "")}/v1/connectors/douyin/accounts`, {
        headers: { accept: "application/json" },
        cache: "no-store"
      });
      if (response.ok) {
        const result = await response.json().catch(() => null);
        const authoritative = applyAuthoritativeManagedAccountDirectory({}, result?.accounts || []);
        const matched = accountsForCandidates(authoritative);
        if (matched.length || !probeRemote) return matched;
      } else if (!probeRemote) {
        return [];
      }
    } catch {
      if (!probeRemote) return [];
    }

    // A just-completed cloud login can take a moment to appear in the account
    // directory. Only in that narrow transition do we verify the live session.
    if (!probeRemote) return [];
    const recovered = await Promise.all(candidateAgentIds.map(async (candidateId) => {
      try {
        const status = await douyinMcpCall("GET", `/v1/douyin/mcp/status?agentId=${encodeURIComponent(candidateId)}`, null, 30000);
        return mcpAuthorizedAccount(status, candidateId);
      } catch {
        return null;
      }
    }));
    return [...new Map(recovered.filter(Boolean)
      .map((account) => [`${account.agentId}:${account.id}`, account])).values()];
  }

  function selectedAuthorizedAccount(flow = {}) {
    const accounts = Array.isArray(flow?.authorizedAccounts) ? flow.authorizedAccounts : [];
    const selectedId = String(flow?.accountId || "").trim();
    return accounts.find((account) => String(account?.id || "") === selectedId)
      || accounts.find((account) => douyinAccountWorkKey(account?.identity || account, account?.id) === douyinAccountWorkKey(flow?.accountIdentity || {}, selectedId))
      || null;
  }

  function managerBoundAccounts() {
    return getAuthorizedManagedAccounts()
      .filter((account) => isDouyinAcquisitionManagerBoundAccount(account));
  }

  function managerBoundAccountForIdentity(identity = {}, fallbackId = "") {
    const identityKey = douyinAccountWorkKey(identity, fallbackId);
    if (!identityKey) return null;
    return managerBoundAccounts().find((account) =>
      douyinAccountWorkKey(account?.identity || account, account?.id) === identityKey
    ) || null;
  }

  function managerBoundAccountForFlow(flow = {}) {
    const selected = selectedAuthorizedAccount(flow);
    if (selected && isDouyinAcquisitionManagerBoundAccount(selected)) return selected;

    const matched = managerBoundAccountForIdentity(
      selected?.identity || flow?.accountIdentity || {},
      selected?.id || flow?.accountId || ""
    );
    if (matched) return matched;

    const managerAccounts = managerBoundAccounts();
    return !flow?.accountId && managerAccounts.length === 1 ? managerAccounts[0] : null;
  }

  function usesDouyinAccountInFlow(agent, flow = {}) {
    if (isCompositeFinderAgent(agent) && flow?.compositeFinderSource === "public") return false;
    return Boolean(
      flow?.accountId
      || flow?.accountIdentity
      || flow?.authorizedAccounts?.length
      || isFinderListenerFlow(agent, flow)
      || isPrivateOutreachAgent(agent)
      || isInboxIntakeFlow(agent, flow)
      || isLiveDanmakuAnalysisAgent(agent)
      || isLiveDanmakuOutreachAgent(agent)
    );
  }

  function managerBindingConflictForFlow(agent, flow = {}) {
    if (!isDouyinAcquisitionSingleCapabilityAgent(agent) || !usesDouyinAccountInFlow(agent, flow)) return null;
    const account = managerBoundAccountForFlow(flow);
    return account && hasDouyinAcquisitionManagerBindingConflict(agent, account) ? account : null;
  }

  function openManagerBindingConflictDialog(agent, flow) {
    const account = managerBindingConflictForFlow(agent, flow);
    if (!account) return false;
    if (employmentOverlay?.isConnected) return true;

    const { name } = presentationOf(agent);
    const accountName = concreteAccountName(
      account.name,
      account.identity?.accountName,
      account.identity?.account_name,
      account.identity?.nickname,
      account.identity?.nick_name,
      flow?.account
    ) || "该抖音账号";
    const accountHandle = String(account.identity?.uniqueId || account.identity?.unique_id || account.handle || "").trim();
    const overlay = el("div", "sb-as-employment");
    employmentOverlay = overlay;
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "该账号已使用抖音获客管家");
    const card = el("div", "sb-as-employment-card");
    card.append(
      el("div", "sb-as-employment-title", "该账号已使用抖音获客管家"),
      el("div", "sb-as-employment-copy", `“${accountName}”已由抖音获客管家统一承接找人、客户分析、首次触达和私信承接。为避免同一账号重复配置，不能再单独使用${name}。`)
    );
    const accountRow = el("div", "sb-as-managed-account");
    const avatar = el("span", "sb-as-managed-account-avatar");
    mountPersonAvatar(avatar, account.identity || {}, { name: accountName });
    const copy = el("div", "sb-as-managed-account-copy");
    copy.append(
      el("strong", null, accountName),
      el("span", null, accountHandle ? (accountHandle.startsWith("@") ? accountHandle : `@${accountHandle}`) : "已绑定抖音获客管家")
    );
    accountRow.append(avatar, copy);
    card.append(accountRow, el("div", "sb-as-employment-help", "如需继续处理该账号，请直接在抖音获客管家中配置和启动。"));
    const closeDialog = () => {
      if (employmentOverlay === overlay) employmentOverlay = null;
      overlay.remove();
    };
    const actions = el("div", "sb-as-employment-actions");
    const cancel = el("button", "sb-as-employment-cancel", "返回");
    cancel.type = "button";
    cancel.addEventListener("click", closeDialog);
    const openManager = el("button", "sb-as-employment-confirm", "打开抖音获客管家");
    openManager.type = "button";
    openManager.addEventListener("click", () => {
      closeDialog();
      const manager = getMarketplaceAgent(DOUYIN_ACQUISITION_COMPLETE_AGENT_ID);
      if (manager) openUseFlow(manager);
    });
    actions.append(cancel, openManager);
    card.appendChild(actions);
    overlay.appendChild(card);
    overlay.addEventListener("click", (event) => { if (event.target === overlay) closeDialog(); });
    page.root.appendChild(overlay);
    return true;
  }

  function accountBusyWorkForFlow(agent, flow) {
    if (!usesDouyinAccountInFlow(agent, flow)) return null;
    const accountId = String(flow?.accountId || "").trim();
    const accountKey = String(flow?.accountWorkKey || douyinAccountWorkKey(flow?.accountIdentity, accountId) || accountId).trim();
    if (!accountId && !accountKey) return null;
    const works = state.remoteOfficeStatusAvailable
      ? state.remoteOfficeWorks
      : [...state.remoteOfficeWorks, ...listWorks()];
    return activeAgentSquareWorkForAccount(works, {
      agentId: agent?.id,
      accountId,
      accountKey,
      taskId: flow?.taskId
    });
  }

  function busyWorkFromError(agent, flow, error) {
    const code = String(error?.code || "").trim();
    if (![
      "MANAGED_RUNTIME_ACCOUNT_IN_USE",
      "CORE_AGENT_ACCOUNT_IN_USE",
      "DOUYIN_ACQUISITION_ACTIVE_ACCOUNT_TASK",
      "DOUYIN_ACQUISITION_DUPLICATE_TASK"
    ].includes(code)) return null;
    return {
      agentType: error?.details?.existingAgentId || agent?.id,
      state: "working",
      task: error?.details?.existingGoal || "该账号已有正在运行的任务",
      metadata: {
        taskId: error?.details?.existingTaskId || null,
        taskRunId: error?.details?.existingTaskRunId || null,
        accountId: error?.details?.existingAccountKey || flow?.accountId || null,
        accountKey: error?.details?.existingAccountKey || flow?.accountWorkKey || flow?.accountId || null,
        taskState: error?.details?.existingState || "running"
      }
    };
  }

  function openAccountBusyDialog(agent, flow, work = null) {
    if (accountBusyOverlay?.isConnected) return true;
    const accountName = concreteAccountName(
      flow?.account,
      flow?.accountIdentity?.accountName,
      flow?.accountIdentity?.account_name,
      flow?.accountIdentity?.nickname,
      flow?.accountIdentity?.nick_name
    ) || "该抖音账号";
    const accountHandle = String(
      flow?.accountIdentity?.uniqueId
      || flow?.accountIdentity?.unique_id
      || flow?.accountIdentity?.secId
      || flow?.accountIdentity?.sec_id
      || ""
    ).trim();
    const runningAgent = getMarketplaceAgent(work?.agentType || work?.agentId || "");
    const runningAgentName = runningAgent ? presentationOf(runningAgent).name : presentationOf(agent).name;
    const overlay = el("div", "sb-as-employment sb-as-account-busy");
    accountBusyOverlay = overlay;
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "账号正在使用中");
    const card = el("div", "sb-as-employment-card");
    card.append(
      el("div", "sb-as-account-busy-badge", "正在使用"),
      el("div", "sb-as-employment-title", "这个账号正在使用中"),
      el("div", "sb-as-employment-copy", `“${accountName}”当前正在由${runningAgentName}执行任务，无需重复启动。重复启动可能造成重复监听、重复触达或重复回复。`)
    );
    const accountRow = el("div", "sb-as-managed-account");
    const avatar = el("span", "sb-as-managed-account-avatar");
    mountPersonAvatar(avatar, flow?.accountIdentity || {}, { name: accountName });
    const copy = el("div", "sb-as-managed-account-copy");
    copy.append(
      el("strong", null, accountName),
      el("span", null, accountHandle ? (accountHandle.startsWith("@") ? accountHandle : `@${accountHandle}`) : "授权账号")
    );
    accountRow.append(avatar, copy);
    card.append(accountRow, el("div", "sb-as-employment-help", "请直接进入正在运行的任务查看进展；如需重新配置，请先停止当前任务。"));
    const closeDialog = () => {
      if (accountBusyOverlay === overlay) accountBusyOverlay = null;
      overlay.remove();
    };
    const actions = el("div", "sb-as-employment-actions");
    const close = el("button", "sb-as-employment-cancel", "知道了");
    close.type = "button";
    close.addEventListener("click", closeDialog);
    const viewRunning = el("button", "sb-as-employment-confirm", "查看运行中任务");
    viewRunning.type = "button";
    viewRunning.addEventListener("click", () => {
      closeDialog();
      void globalThis.__SALEBUDDY__?.navFrameworkReady?.then?.((framework) => framework?.openRealtimeWork?.({
        selectedAgentId: work?.agentType || agent?.id,
        taskId: work?.taskId || work?.metadata?.taskId || null,
        taskRunId: work?.taskRunId || work?.metadata?.taskRunId || null,
        accountId: flow?.accountId || null,
        accountKey: flow?.accountWorkKey || flow?.accountId || null
      }));
    });
    actions.append(close, viewRunning);
    card.appendChild(actions);
    overlay.appendChild(card);
    overlay.addEventListener("click", (event) => { if (event.target === overlay) closeDialog(); });
    page.root.appendChild(overlay);
    return true;
  }

  async function guardAccountBusyBeforeStart(agent, flow) {
    if (!flow || flow.running || flow.requesting || flow.managerFullStartPending) return false;
    await refreshRemoteOfficeStatus();
    if (disposed || state.useFlow !== flow) return true;
    const work = accountBusyWorkForFlow(agent, flow);
    return work ? openAccountBusyDialog(agent, flow, work) : false;
  }

  function handleAccountBusyStartError(agent, flow, error) {
    const work = busyWorkFromError(agent, flow, error);
    if (!work) return false;
    if (flow?.taskId) finishWork(agent.id, null, { taskId: flow.taskId, taskRunId: flow.taskRunId, accountId: flow.accountId, accountKey: flow.accountWorkKey });
    flow.requesting = false;
    flow.starting = false;
    flow.running = false;
    flow.taskState = null;
    flow.step = "setup";
    flow.error = null;
    flow.setupError = null;
    openAccountBusyDialog(agent, flow, work);
    render();
    return true;
  }

  function openUseFlow(agent, resumeFlow = null) {
    if (!agent || !isFirstReleaseAgent(agent)) {
      state.view = "home";
      state.useId = null;
      state.useFlow = null;
      render();
      return;
    }
    if (agent.id === DOUYIN_ACQUISITION_COMPLETE_AGENT_ID && employmentContractsLoaded && !isAgentReadyForUse(agent)) {
      state.view = "home";
      state.useId = null;
      state.useFlow = null;
      state.employmentError = "请先雇佣抖音获客管家，再配置并启动任务。";
      render();
      return;
    }
    const mockPrivateOutreach = isPrivateOutreachAgent(agent) && Boolean(privateOutreachMockData);
    const goldCustomerService = agent.id === GOLD_CUSTOMER_SERVICE_AGENT_ID;
    const objectiveFirstInbox = goldCustomerService || isCommentAcquisitionAgent(agent);
    const authorizedAccounts = mockPrivateOutreach ? [structuredClone(privateOutreachMockData.account)] : [];
    const saved = resumeFlow && resumeFlow.agentId === agent.id ? resumeFlow : null;
    const savedFinderListener = isFinderListenerFlow(agent, saved || {});
    const savedLongRunning = isLongRunningAcquisitionAgent(agent) || savedFinderListener;
    const savedLiveDanmakuAnalysis = isLiveDanmakuAnalysisAgent(agent) || saved?.analysisKind === "live_danmaku";
    const savedLiveDanmakuOutreach = isLiveDanmakuOutreachAgent(agent) || saved?.analysisKind === "live_danmaku_outreach";
    const savedViralWorkAnalysis = isViralWorkAnalysisAgent(agent) || saved?.analysisKind === "viral_work";
    const savedOneOffAnalysis = savedViralWorkAnalysis && Boolean(saved?.analysisResult || saved?.resultSnapshot);
    const legacyPreview = isCommentAcquisitionAgent(agent) && ["preview", "previewing"].includes(saved?.step);
    // The complete acquisition Agent owns one continuous setup flow. It
    // configures the account listener and the account-scoped reception policy
    // together, then starts both durable runtimes in sequence.
    const managerSetup = isCommentAcquisitionAgent(agent)
      && !legacyPreview
      && (!saved || saved?.managerCombinedStart === true || !saved?.taskKey);
    const inboxIntake = isInboxAgent(agent) || managerSetup || isInboxIntakeFlow(agent, saved);
    const isDurableTask = inboxIntake || savedLongRunning || savedLiveDanmakuAnalysis || savedLiveDanmakuOutreach;
    const configuredStrategy = inboxIntake ? inboxStrategyStore.get(agent.id, { accountId: saved?.accountId || "" }) : null;
    const savedConfiguration = saved?.configuration && typeof saved.configuration === "object"
      ? saved.configuration
      : saved?.taskSnapshot?.configuration && typeof saved.taskSnapshot.configuration === "object"
        ? saved.taskSnapshot.configuration
        : saved?.taskSnapshot?.config && typeof saved.taskSnapshot.config === "object"
          ? saved.taskSnapshot.config
          : null;
    const savedFindingStrategy = savedConfiguration?.findingStrategy && typeof savedConfiguration.findingStrategy === "object"
      ? savedConfiguration.findingStrategy
      : {};
    const savedTouchContent = savedConfiguration?.touchContent && typeof savedConfiguration.touchContent === "object"
      ? savedConfiguration.touchContent
      : {};
    const savedContentPolicy = savedConfiguration?.contentPolicy && typeof savedConfiguration.contentPolicy === "object"
      ? savedConfiguration.contentPolicy
      : {};
    const savedFrequency = savedConfiguration?.frequency && typeof savedConfiguration.frequency === "object"
      ? savedConfiguration.frequency
      : {};
    state.view = "use";
    state.useId = agent.id;
    state.useFlow = {
      step: legacyPreview || managerSetup ? "setup" : saved?.managerAcquisitionStartFailed === true ? "running" : saved?.step || (savedOneOffAnalysis ? "running" : ((savedLongRunning || savedLiveDanmakuAnalysis || savedLiveDanmakuOutreach) && saved?.taskKey && saved?.phase === "running" ? "running" : "setup")),
      agentId: agent.id,
      taskId: legacyPreview ? "" : saved?.taskId || "",
      taskRunId: legacyPreview ? "" : saved?.taskRunId || "",
      taskKey: legacyPreview ? "" : saved?.taskKey || "",
      taskState: legacyPreview ? null : saved?.taskState || null,
      taskSnapshot: legacyPreview ? null : saved?.taskSnapshot ? structuredClone(saved.taskSnapshot) : null,
      running: !legacyPreview && !managerSetup && (saved?.phase === "running" || saved?.phase === "awaiting_receipt" || saved?.managerAcquisitionStartFailed === true),
      mode: managerSetup ? "inbox" : saved?.mode || "acquisition",
      outreachMode: isPrivateOutreachAgent(agent) ? normalizePrivateOutreachMode(saved?.outreachMode) : saved?.outreachMode || "",
      inlineProspectOutreach: saved?.inlineProspectOutreach === true,
      managerCombinedStart: managerSetup || saved?.managerCombinedStart === true,
      managerInboxRuntimeStarted: saved?.managerInboxRuntimeStarted === true,
      managerInboxRuntime: saved?.managerInboxRuntime ? structuredClone(saved.managerInboxRuntime) : null,
      managerAcquisitionStartFailed: saved?.managerAcquisitionStartFailed === true,
      inboxTaskId: saved?.inboxTaskId || "",
      inboxTaskRunId: saved?.inboxTaskRunId || "",
      inboxConversationId: saved?.inboxConversationId || "",
      inboxTakeoverOwnerAgentId: "",
      accountMode: saved?.accountMode || "own",
      accountId: saved?.accountId || (mockPrivateOutreach ? privateOutreachMockData.account.id : isPrivateOutreachAgent(agent) ? saved?.sourceAccountId || "" : ""),
      accountWorkKey: saved?.accountWorkKey || "",
      account: saved?.account || (mockPrivateOutreach ? privateOutreachMockData.account.name : isPrivateOutreachAgent(agent) ? saved?.sourceAccountName || "" : ""),
      accountRef: saved?.accountRef || "",
      accountIdentity: saved?.accountIdentity || (mockPrivateOutreach ? structuredClone(privateOutreachMockData.account.identity) : null),
      authAccountId: saved?.authAccountId || "",
      accountUnavailable: false,
      accountResolveStatus: "idle",
      accountResolveError: null,
      accountResolveTimer: null,
      accountResolveRequestId: 0,
      authorizedAccounts,
      source: inboxIntake ? "抖音私信" : isPrivateOutreachAgent(agent) ? "成果中心潜客" : isUserResearchAgent(agent) ? "用户调研" : isCommentAcquisitionAgent(agent) ? "已授权账号作品评论" : isLiveDanmakuAnalysisAgent(agent) || isLiveDanmakuOutreachAgent(agent) ? "已授权账号直播间弹幕" : isViralWorkAnalysisAgent(agent) ? "抖音公开作品链接" : "商品作品评论区",
      finderGoal: saved?.finderGoal || "",
      compositeFinderStep: saved?.compositeFinderStep || "source",
      compositeFinderSource: saved?.compositeFinderSource || "",
      compositeFinderDataSource: saved?.compositeFinderDataSource || "",
      compositeFinderPurpose: saved?.compositeFinderPurpose || "",
      publicFinderQuery: saved?.publicFinderQuery || "",
      publicFinderAccountUrl: saved?.publicFinderAccountUrl || "",
      publicFinderAccountIdentity: saved?.publicFinderAccountIdentity || null,
      publicFinderAccountStatus: saved?.publicFinderAccountStatus || "idle",
      publicFinderAccountError: saved?.publicFinderAccountError || null,
      publicFinderReferenceUrls: saved?.publicFinderReferenceUrls || "",
      finderAccountContext: saved?.finderAccountContext
        ? structuredClone(saved.finderAccountContext)
        : { businessAccountUrl: "", referenceAccountUrls: [] },
      taskChoices: isCommentAcquisitionAgent(agent) ? {} : saved?.taskChoices ? structuredClone(saved.taskChoices) : {},
      finderInputs: saved?.finderInputs || "",
      finderFileName: saved?.finderFileName || "",
      finderFileUrls: Array.isArray(saved?.finderFileUrls) ? [...saved.finderFileUrls] : [],
      finderFileError: null,
      finderIndustry: saved?.finderIndustry || "",
      finderMode: saved?.finderMode || "full",
      finderResultLimit: saved?.finderResultLimit || 10,
      finderVideoCount: saved?.finderVideoCount || 20,
      finderSince: saved?.finderSince || "",
      finderDetailLimit: saved?.finderDetailLimit || 0,
      finderCheckLive: saved?.finderCheckLive ?? false,
      finderIncludeIndustry: saved?.finderIncludeIndustry ?? false,
      finderFresh: saved?.finderFresh ?? false,
      surveyUrl: saved?.surveyUrl || "",
      surveyCandidates: Array.isArray(saved?.surveyCandidates) ? [...saved.surveyCandidates] : [],
      surveySelectedIds: Array.isArray(saved?.surveySelectedIds) ? [...saved.surveySelectedIds] : [],
      researchPhase: saved?.researchPhase || "setup",
      analysisMode: saved?.analysisMode || (saved?.analysisKind === "account_report" ? "account_report" : ""),
      analysisKind: saved?.analysisKind || (isLiveDanmakuAnalysisAgent(agent) ? "live_danmaku" : isLiveDanmakuOutreachAgent(agent) ? "live_danmaku_outreach" : isViralWorkAnalysisAgent(agent) ? "viral_work" : ""),
      liveDanmakuGoal: saved?.liveDanmakuGoal || "梳理直播间高频问题、用户需求、购买意向和反对点。",
      liveDanmakuOutreachGoal: saved?.liveDanmakuOutreachGoal || savedTouchContent.conversionGoal || savedFindingStrategy.audienceGoal || savedContentPolicy.conversionGoal || LIVE_DANMAKU_OUTREACH_DEFAULT_GOAL,
      liveDanmakuOutreachMessage: saved?.liveDanmakuOutreachMessage ?? savedTouchContent.message ?? savedTouchContent.strategy ?? savedContentPolicy.strategy ?? savedContentPolicy.template ?? "",
      liveDanmakuSignals: savedLiveDanmakuOutreach ? ["danmaku"] : [...DEFAULT_LIVE_SIGNALS],
      liveDanmakuAnalysis: saved?.liveDanmakuAnalysis ? structuredClone(saved.liveDanmakuAnalysis) : null,
      workUrl: saved?.workUrl || saved?.inputs?.workUrl || saved?.resultSnapshot?.sourceUrl || "",
      viralWorkGoal: saved?.viralWorkGoal || saved?.inputs?.goal || VIRAL_WORK_ANALYSIS_DEFAULT_GOAL,
      viralWorkFresh: saved?.viralWorkFresh === true,
      commentLimit: saved?.commentLimit || saved?.inputs?.commentLimit || 100,
      viralWorkAnalysis: saved?.viralWorkAnalysis ? structuredClone(saved.viralWorkAnalysis) : saved?.analysisResult ? structuredClone(saved.analysisResult) : saved?.resultSnapshot ? structuredClone(saved.resultSnapshot) : null,
      analysisAccounts: normalizeAnalysisAccounts(saved?.analysisAccounts || []),
      analysisGoal: saved?.analysisGoal || "了解账号主要做什么、有哪些需求，以及哪些信息还需要确认。",
      analysisUrls: saved?.analysisUrls || "",
      analysisResult: saved?.analysisResult ? structuredClone(saved.analysisResult) : null,
      intentCandidates: Array.isArray(saved?.intentCandidates) ? structuredClone(saved.intentCandidates) : [],
      intentSelectedIds: Array.isArray(saved?.intentSelectedIds) ? [...saved.intentSelectedIds] : [],
      intentFocus: saved?.intentFocus || "",
      intentGoal: saved?.intentGoal || "结合用户账号画像、互动原文和来源证据，自动判断每位用户是否值得继续跟进，并给出意向等级、判断依据和下一步建议。",
      analysisScope: "user_intent",
      intentResult: null,
      prefilledFromFinder: saved?.prefilledFromFinder === true,
      sourceResultId: saved?.sourceResultId || "",
      sourceTaskId: saved?.sourceTaskId || "",
      sourceTaskTitle: saved?.sourceTaskTitle || "",
      sourceTaskGoal: saved?.sourceTaskGoal || "",
      sourceResultType: saved?.sourceResultType || "",
      sourceScope: saved?.sourceScope || "",
      executionAgentId: String(saved?.executionAgentId || (isUserResearchAgent(agent) ? "mkt-cold-writer" : isLiveDanmakuAnalysisAgent(agent) || isLiveDanmakuOutreachAgent(agent) ? "mkt-comment-acquisition" : isViralWorkAnalysisAgent(agent) ? "mkt-viral-work-analysis" : "")).trim(),
      product: isCommentAcquisitionAgent(agent)
        ? ""
        : savedLongRunning
        ? saved?.product ?? savedFindingStrategy.audienceGoal ?? ""
        : saved?.product ?? savedFindingStrategy.audienceGoal ?? (isCommentScreeningAgent(agent) ? "" : "保温杯"),
      requirements: isCommentAcquisitionAgent(agent) ? "" : saved?.requirements || savedFindingStrategy.requirements || "",
      rules: saved?.rules || "排除同行、抽奖和无关互动",
      workScope: savedLongRunning ? "" : saved?.workScope || (isCommentScreeningAgent(agent) ? "最近30条作品" : ""),
      workCount: savedLongRunning ? 0 : saved?.workCount || 30,
      audienceTypes: Array.isArray(saved?.audienceTypes) && saved.audienceTypes.length ? [...saved.audienceTypes] : (isCommentFilterAgent(agent) ? [] : ["近期准备下单"]),
      includeReplies: saved?.includeReplies ?? true,
      replyObjective: saved?.replyObjective || configuredStrategy?.replyObjective || (objectiveFirstInbox ? "" : "先解决用户当前问题，再确认需求并推进到下一步，不强行销售。"),
      replyTone: objectiveFirstInbox ? "" : saved?.replyTone || configuredStrategy?.replyTone || "专业、简短、自然，像一个懂业务的人在回复。",
      businessKnowledge: objectiveFirstInbox ? "" : saved?.businessKnowledge || "",
      knowledgeContext: "",
      knowledgeEntries: [],
      knowledgeLoading: inboxIntake && !objectiveFirstInbox,
      knowledgeError: null,
      knowledgeLoadedAt: null,
      fieldErrors: {},
      inboxPlan: null,
      planToken: "",
      planRevision: "",
      planConfirmable: false,
      planLoading: false,
      planError: null,
      starting: false,
      startRequestId: "",
      startError: null,
      workAccepted: false,
      inboxStatusFailures: 0,
      statusSyncWarning: "",
      replyRule: objectiveFirstInbox ? "" : saved?.replyRule || configuredStrategy?.replyRule || "优先回答产品功能、使用方法和服务范围；没有把握的内容不要猜。",
      handoffRules: objectiveFirstInbox ? "" : saved?.handoffRules || configuredStrategy?.handoffRules || "价格谈判、投诉、退款、合同、效果承诺和无法确认的事实，交给人工。",
      threshold: saved?.threshold && saved.threshold !== "高 + 中意向" ? saved.threshold : "全部候选",
      targetProfileUrl: saved?.targetProfileUrl || "",
      targetProfileUrls: Array.isArray(saved?.targetProfileUrls) ? [...saved.targetProfileUrls] : [],
      targetInput: saved?.targetInput || saved?.targetProfileUrl || "",
      targetFileName: saved?.targetFileName || "",
      targetFileUrls: Array.isArray(saved?.targetFileUrls) ? [...saved.targetFileUrls] : [],
      targetEntries: Array.isArray(saved?.targetEntries) ? [...saved.targetEntries] : [],
      focusTargets: Array.isArray(saved?.focusTargets) ? [...saved.focusTargets] : [],
      prefilledFromResult: saved?.prefilledFromResult === true,
      sourceResultId: saved?.sourceResultId || "",
      sourceTaskId: saved?.sourceTaskId || "",
      sourceTaskTitle: saved?.sourceTaskTitle || "",
      sourceTaskGoal: saved?.sourceTaskGoal || "",
      sourceResultType: saved?.sourceResultType || "",
      sourceScope: saved?.sourceScope || "",
      sourceAccountId: saved?.sourceAccountId || "",
      sourceAccountName: saved?.sourceAccountName || "",
      mockPreview: mockPrivateOutreach,
      mockProspectRecords: Array.isArray(saved?.mockProspectRecords)
        ? structuredClone(saved.mockProspectRecords)
        : mockPrivateOutreach
          ? structuredClone(privateOutreachMockData.records)
          : [],
      commentSourceOwner: saved?.commentSourceOwner || "own",
      commentSourceDimension: saved?.commentSourceDimension || (parseCommentSource(saved?.accountRef || "").kind === "video" ? "works" : "account"),
      commentWorkInput: saved?.commentWorkInput || (parseCommentSource(saved?.accountRef || "").kind === "video" ? saved?.accountRef || "" : ""),
      targetResolveStatus: "idle",
      targetResolveError: null,
      message: isCommentAcquisitionAgent(agent) ? "" : saved?.message || savedTouchContent.message || savedTouchContent.strategy || "",
      touchStrategy: isCommentAcquisitionAgent(agent) ? "" : saved?.touchStrategy || savedTouchContent.strategy || savedTouchContent.message || COMMENT_ACQUISITION_DEFAULTS.touchStrategy,
      replyStyle: saved?.replyStyle || savedTouchContent.replyStyle || COMMENT_ACQUISITION_DEFAULTS.replyStyle,
      handoffBoundary: saved?.handoffBoundary || savedTouchContent.handoffBoundary || COMMENT_ACQUISITION_DEFAULTS.handoffBoundary,
      conversionGoal: saved?.conversionGoal || "",
      approvalMode: isCommentAcquisitionAgent(agent) ? "auto" : (saved?.approvalMode === "batch" ? "manual" : saved?.approvalMode || "auto"),
      touchChannel: saved?.touchChannel || "private_message",
      maxTouchesPerDay: isCommentAcquisitionAgent(agent) ? COMMENT_ACQUISITION_DEFAULTS.frequency.maxTouchesPerDay : saved?.maxTouchesPerDay || savedFrequency.maxTouchesPerDay || COMMENT_ACQUISITION_DEFAULTS.frequency.maxTouchesPerDay,
      minIntervalMinutes: isCommentAcquisitionAgent(agent) ? COMMENT_ACQUISITION_DEFAULTS.frequency.minIntervalMinutes : saved?.minIntervalMinutes || savedFrequency.minIntervalMinutes || COMMENT_ACQUISITION_DEFAULTS.frequency.minIntervalMinutes,
      stopConditions: saved?.stopConditions || savedConfiguration?.stopConditions || { ...COMMENT_ACQUISITION_DEFAULTS.stopConditions },
      configuration: savedConfiguration ? structuredClone(savedConfiguration) : null,
      longRunning: isDurableTask,
      receiptPending: saved?.receiptPending === true,
      receiptPendingAt: saved?.receiptPendingAt || null,
      progress: 0,
      checks: [false, false, false, false],
      liveFindings: [],
      // Account discovery is advisory and must never block task setup. The
      // user can open the cloud authorization flow immediately while the MCP
      // status check runs in the background.
      loadingAccounts: !mockPrivateOutreach && !savedViralWorkAnalysis && (inboxIntake || isPrivateOutreachAgent(agent) || isLongRunningAcquisitionAgent(agent) || isLiveDanmakuAnalysisAgent(agent) || isLiveDanmakuOutreachAgent(agent) || isUserResearchAgent(agent) || isCommentScreeningAgent(agent) || isCompositeFinderAgent(agent)),
      authorizing: false,
      authPhase: "idle",
      authAttemptId: 0,
      authStartedAt: 0,
      authElapsed: 0,
      authEstimateSeconds: 150,
      authFeedbackTimer: null,
      authRecoveryTimer: null,
      authRecoveryPolling: false,
      authWindow: null,
      authError: null,
      authErrorCode: saved?.authErrorCode || null
    };
    if (savedLiveDanmakuOutreach) {
      const savedCaps = savedConfiguration?.caps && typeof savedConfiguration.caps === "object" ? savedConfiguration.caps : {};
      const savedIntervalMs = Number(savedCaps.sendIntervalMs);
      state.useFlow.maxTouchesPerDay = null;
      state.useFlow.minIntervalMinutes = saved?.minIntervalMinutes
        ?? savedFrequency.minIntervalMinutes
        ?? (Number.isFinite(savedIntervalMs) ? savedIntervalMs / 60000 : 0);
    }
    if (isPrivateOutreachAgent(agent) && state.useFlow.prefilledFromResult && state.useFlow.targetEntries.length) {
      const canonicalTargets = prospectStore.ensureOutreachProspects?.(state.useFlow.targetEntries, {
        sourceContext: {
          agentId: agent.id,
          agentName: agent.name,
          source: state.useFlow.source,
          sourceScope: state.useFlow.sourceScope,
          sourceResultType: state.useFlow.sourceResultType,
          sourceResultId: state.useFlow.sourceResultId,
          sourceTaskId: state.useFlow.sourceTaskId,
          taskId: state.useFlow.sourceTaskId,
          accountId: state.useFlow.sourceAccountId,
          accountName: state.useFlow.sourceAccountName
        }
      }) || [];
      state.useFlow.targetEntries = state.useFlow.targetEntries.map((entry, index) => {
        const record = canonicalTargets[index];
        if (!record) return entry;
        return { ...entry, id: record.id, recordId: record.id, sourceRecordId: record.id };
      });
    }
    // Both acquisition and own-account finder modes are incremental listeners.
    // A legacy task snapshot must never turn either one into a historical scan.
    if (savedLongRunning || savedLiveDanmakuAnalysis || savedLiveDanmakuOutreach) stripListenerHistoricalFields(state.useFlow);
    render();
    page.body.scrollTop = 0;
    const loadAuthorizedAccounts = async () => {
      let accounts = isUserResearchAgent(agent)
        ? await fetchAuthorizedAccounts({ probeRemote: false })
        : await fetchAuthorizedAccounts({ agentId: agent.id, probeRemote: true });
      if (isUserResearchAgent(agent) && !accounts.length) accounts = await fetchAuthorizedAccounts({ agentId: "mkt-cold-writer", probeRemote: true });
      if (state.view !== "use" || state.useId !== agent.id || !state.useFlow) return;
      const requestedAccountId = state.useFlow.accountId;
      const requestedAccountKey = state.useFlow.accountWorkKey || douyinAccountWorkKey(state.useFlow.accountIdentity, requestedAccountId);
      const matchedAccount = accounts.find((account) => account.id === requestedAccountId)
        || accounts.find((account) => requestedAccountKey && douyinAccountWorkKey(account.identity, account.id) === requestedAccountKey)
        || null;
      const hasSavedAccountBinding = Boolean(requestedAccountId || requestedAccountKey);
      const initialAccount = matchedAccount || (!hasSavedAccountBinding ? accounts[0] || null : null);
      const initialIdentity = initialAccount?.identity || null;
      state.useFlow.authorizedAccounts = accounts;
      state.useFlow.loadingAccounts = false;
      state.useFlow.accountUnavailable = hasSavedAccountBinding && !initialAccount;
      if (initialAccount) {
        state.useFlow.accountId = initialAccount.id || "";
        state.useFlow.account = concreteAccountName(initialAccount.name, initialIdentity?.accountName, initialIdentity?.account_name, initialIdentity?.nickname, initialIdentity?.nick_name) || "";
        state.useFlow.accountIdentity = initialIdentity;
        state.useFlow.executionAgentId = String(initialAccount.agentId || state.useFlow.executionAgentId || agent.id).trim();
        state.useFlow.accountWorkKey = douyinAccountWorkKey(initialIdentity, state.useFlow.accountId);
        restoreAccountScopedAcquisitionDraft(state.useFlow);
      }
      if (isCommentScreeningAgent(agent)) {
        if (initialAccount && state.useFlow.commentSourceOwner === "own" && state.useFlow.commentSourceDimension === "account") {
          state.useFlow.accountRef = initialIdentity?.profileUrl || initialIdentity?.uniqueId || "";
        }
      } else if (initialAccount) {
        state.useFlow.accountRef = initialIdentity?.profileUrl || initialIdentity?.uniqueId || "";
      }
      if (initialAccount) {
        persistCloudTask(state.useFlow, {
          accountId: state.useFlow.accountId,
          accountIdentity: state.useFlow.accountIdentity,
          accountWorkKey: state.useFlow.accountWorkKey
        });
      }
      if (isInboxIntakeFlow(agent, state.useFlow)
        && !isCommentAcquisitionAgent(agent)
        && agent.id !== GOLD_CUSTOMER_SERVICE_AGENT_ID
        && state.useFlow.accountId
        && !state.useFlow.accountUnavailable) await loadAccountReception(state.useFlow);
      render();
    };
    if (inboxIntake || isPrivateOutreachAgent(agent) || isLongRunningAcquisitionAgent(agent) || isLiveDanmakuAnalysisAgent(agent) || isLiveDanmakuOutreachAgent(agent) || isUserResearchAgent(agent) || isCommentScreeningAgent(agent) || isCompositeFinderAgent(agent)) {
      if (!savedViralWorkAnalysis && !mockPrivateOutreach) {
        loadAuthorizedAccounts();
        if (!isUserResearchAgent(agent)) restoreSavedAuthorization(state.useFlow);
        if ((isLongRunningAcquisitionAgent(agent) || isLiveDanmakuAnalysisAgent(agent) || isLiveDanmakuOutreachAgent(agent) || isFinderListenerFlow(agent, state.useFlow)) && state.useFlow.taskKey && state.useFlow.step === "running") pollCommentAcquisitionTask(agent, state.useFlow);
      }
    }
  }

  function clearAuthFeedback(flow) {
    if (flow?.authFeedbackTimer) window.clearInterval(flow.authFeedbackTimer);
    if (flow?.authRecoveryTimer) window.clearTimeout(flow.authRecoveryTimer);
    if (flow) {
      flow.authFeedbackTimer = null;
      flow.authRecoveryTimer = null;
      flow.authRecoveryPolling = false;
    }
  }

  function closeAuthWindow(flow) {
    if (!flow?.authWindow) return;
    const windowHandle = flow.authWindow;
    flow.authWindow = null;
    windowHandle.close?.();
  }

  function closeCloudExitPrompt() {
    cloudExitOverlay?.remove();
    cloudExitOverlay = null;
  }

  function isCloudAuthorizationPending(flow) {
    return Boolean(flow?.authorizing) || ["starting", "opening", "waiting_login"].includes(flow?.authPhase);
  }

  function cloudResumeFlow(flow) {
    const agent = { id: flow?.agentId };
    const finderListener = isFinderListenerFlow(agent, flow);
    const liveDanmakuAnalysis = isLiveDanmakuAnalysisFlow(agent, flow);
    const liveDanmakuOutreach = isLiveDanmakuOutreachFlow(agent, flow);
    const longRunningAcquisition = isLongRunningAcquisitionAgent(agent) || finderListener;
    const privateReceiptPending = isPrivateOutreachAgent(agent) && flow?.receiptPending === true;
    const privateRunning = isPrivateOutreachAgent(agent)
      && flow?.step === "running"
      && flow?.requesting === true
      && !privateReceiptPending;
    const inboxIntake = isInboxIntakeFlow(agent, flow);
    const isDurableTask = inboxIntake || longRunningAcquisition || liveDanmakuAnalysis || liveDanmakuOutreach;
    const liveOutreachSettings = liveDanmakuOutreach ? normalizeLiveDanmakuOutreachSettings(flow) : null;
    const liveOutreachConfiguration = flow?.configuration && typeof flow.configuration === "object" ? flow.configuration : {};
    const liveOutreachContentPolicy = liveOutreachConfiguration.contentPolicy && typeof liveOutreachConfiguration.contentPolicy === "object"
      ? liveOutreachConfiguration.contentPolicy
      : {};
    const liveOutreachTouchContent = liveOutreachConfiguration.touchContent && typeof liveOutreachConfiguration.touchContent === "object"
      ? liveOutreachConfiguration.touchContent
      : {};
    const inboxRunning = inboxIntake && flow?.running === true;
    const resume = {
      agentId: flow.agentId,
      mode: flow.mode || "acquisition",
      outreachMode: isPrivateOutreachAgent(agent) ? normalizePrivateOutreachMode(flow.outreachMode) : flow.outreachMode || "",
      inlineProspectOutreach: flow.inlineProspectOutreach === true,
      taskId: flow.taskId || "",
      taskRunId: flow.taskRunId || "",
      taskKey: flow.taskKey || "",
      taskState: flow.taskState || null,
      phase: privateReceiptPending
        ? "awaiting_receipt"
        : privateRunning
        ? "running"
        : inboxRunning
          ? "running"
          : (longRunningAcquisition || liveDanmakuAnalysis || liveDanmakuOutreach) && flow.taskKey && flow.running !== false ? "running" : "setup",
      step: privateReceiptPending || privateRunning
        ? "running"
        : inboxRunning
          ? "running"
        : (longRunningAcquisition || liveDanmakuAnalysis || liveDanmakuOutreach) && flow.taskKey && flow.running !== false ? "running" : "setup",
      accountMode: flow.accountMode,
      accountId: flow.accountId,
      accountWorkKey: flow.accountWorkKey || douyinAccountWorkKey(flow.accountIdentity, flow.accountId),
      authAccountId: flow.authAccountId || "",
      account: flow.account,
      accountRef: flow.accountRef,
      accountIdentity: flow.accountIdentity,
      source: flow.source,
      window: flow.window,
      product: flow.product,
      requirements: flow.requirements || "",
      rules: flow.rules,
      workScope: flow.workScope,
      workCount: flow.workCount,
      audienceTypes: Array.isArray(flow.audienceTypes) ? [...flow.audienceTypes] : [],
      includeReplies: flow.includeReplies,
      replyObjective: flow.replyObjective,
      replyTone: flow.replyTone,
      businessKnowledge: flow.businessKnowledge,
      replyRule: flow.replyRule,
      handoffRules: flow.handoffRules,
      threshold: flow.threshold,
      targetProfileUrl: flow.targetProfileUrl || "",
      targetProfileUrls: Array.isArray(flow.targetProfileUrls) ? [...flow.targetProfileUrls] : [],
      targetInput: flow.targetInput || flow.targetProfileUrl || "",
      targetFileName: flow.targetFileName || "",
      targetFileUrls: Array.isArray(flow.targetFileUrls) ? [...flow.targetFileUrls] : [],
      targetEntries: Array.isArray(flow.targetEntries) ? flow.targetEntries.map((entry) => ({
        ...entry,
        recordId: entry.recordId || entry.sourceRecordId || "",
        profileUrl: entry.profileUrl || "",
        status: entry.status || "pending",
        nickname: entry.nickname || "",
        secId: entry.secId || "",
        secUid: entry.secUid || "",
        error: entry.error || null
      })) : [],
      focusTargets: Array.isArray(flow.focusTargets) ? flow.focusTargets.map((entry) => ({
        recordId: entry.recordId || entry.sourceRecordId || "",
        nickname: entry.nickname || "",
        profileUrl: entry.profileUrl || "",
        secId: entry.secId || "",
        secUid: entry.secUid || ""
      })) : [],
      prefilledFromResult: flow.prefilledFromResult === true,
      sourceResultId: flow.sourceResultId || "",
      sourceTaskId: flow.sourceTaskId || "",
      sourceTaskTitle: flow.sourceTaskTitle || "",
      sourceTaskGoal: flow.sourceTaskGoal || "",
      sourceResultType: flow.sourceResultType || "",
      sourceScope: flow.sourceScope || "",
      analysisKind: flow.analysisKind || (liveDanmakuAnalysis ? "live_danmaku" : liveDanmakuOutreach ? "live_danmaku_outreach" : ""),
      liveDanmakuGoal: flow.liveDanmakuGoal || "梳理直播间高频问题、用户需求、购买意向和反对点。",
      liveDanmakuOutreachGoal: flow.liveDanmakuOutreachGoal || liveOutreachSettings?.goal || LIVE_DANMAKU_OUTREACH_DEFAULT_GOAL,
      liveDanmakuOutreachMessage: flow.liveDanmakuOutreachMessage || liveOutreachTouchContent.message || liveOutreachContentPolicy.strategy || liveOutreachContentPolicy.template || "",
      liveDanmakuSignals: liveDanmakuOutreach ? ["danmaku"] : [...DEFAULT_LIVE_SIGNALS],
      liveDanmakuAnalysis: flow.liveDanmakuAnalysis ? structuredClone(flow.liveDanmakuAnalysis) : null,
      message: flow.message || "",
      touchStrategy: isCommentAcquisitionAgent(agent) ? "" : flow.touchStrategy || flow.message || "",
      replyStyle: flow.replyStyle || COMMENT_ACQUISITION_DEFAULTS.replyStyle,
      handoffBoundary: flow.handoffBoundary || COMMENT_ACQUISITION_DEFAULTS.handoffBoundary,
      conversionGoal: flow.conversionGoal || "",
      taskSnapshot: flow.taskSnapshot ? structuredClone(flow.taskSnapshot) : null,
      configuration: flow.configuration ? structuredClone(flow.configuration) : null,
      managerCombinedStart: flow.managerCombinedStart === true,
      managerInboxRuntimeStarted: flow.managerInboxRuntimeStarted === true,
      managerInboxRuntime: flow.managerInboxRuntime ? structuredClone(flow.managerInboxRuntime) : null,
      managerAcquisitionStartFailed: flow.managerAcquisitionStartFailed === true,
      inboxTaskId: flow.inboxTaskId || "",
      inboxTaskRunId: flow.inboxTaskRunId || "",
      inboxConversationId: flow.inboxConversationId || "",
      taskChoices: flow.taskChoices ? structuredClone(flow.taskChoices) : {},
      approvalMode: isCommentAcquisitionAgent({ id: flow.agentId }) || liveDanmakuOutreach ? "auto" : (flow.approvalMode === "batch" ? "manual" : flow.approvalMode || "auto"),
      touchChannel: flow.touchChannel || "private_message",
      maxTouchesPerDay: isCommentAcquisitionAgent(agent) ? COMMENT_ACQUISITION_DEFAULTS.frequency.maxTouchesPerDay : liveDanmakuOutreach ? null : flow.maxTouchesPerDay ?? liveOutreachSettings?.dailyMax ?? 30,
      minIntervalMinutes: isCommentAcquisitionAgent(agent) ? COMMENT_ACQUISITION_DEFAULTS.frequency.minIntervalMinutes : flow.minIntervalMinutes ?? liveOutreachSettings?.minIntervalMinutes ?? 15,
      stopConditions: flow.stopConditions ? structuredClone(flow.stopConditions) : { ...COMMENT_ACQUISITION_DEFAULTS.stopConditions },
      receiptPending: flow.receiptPending === true,
      receiptPendingAt: flow.receiptPendingAt || null,
      result: flow.result ? { ...flow.result } : null,
      longRunning: isDurableTask
    };

    // Resume state is persisted across product versions. Keep all listener
    // variants forward-looking even when an old snapshot carries scan fields.
    if (longRunningAcquisition || liveDanmakuAnalysis || liveDanmakuOutreach) stripListenerHistoricalFields(resume);

    if (isCommentAcquisitionAgent(agent)) {
      resume.product = "";
      resume.requirements = "";
      resume.audienceTypes = [];
      resume.taskChoices = {};
      resume.message = "";
      resume.touchStrategy = "";
      resume.maxTouchesPerDay = COMMENT_ACQUISITION_DEFAULTS.frequency.maxTouchesPerDay;
      resume.minIntervalMinutes = COMMENT_ACQUISITION_DEFAULTS.frequency.minIntervalMinutes;
    }

    if (finderListener) {
      // A finder listener only owns future discovery. Do not persist generic
      // campaign or outreach fields that could turn it back into a project flow.
      resume.compositeFinderSource = "own";
      resume.compositeFinderDataSource = flow.compositeFinderDataSource || "";
      resume.compositeFinderPurpose = flow.compositeFinderPurpose || "";
      resume.finderGoal = flow.finderGoal || flow.product || "";
      resume.sourceScope = finderListenerSourceScope(flow);
      resume.taskChoices ||= {};
      resume.taskChoices.finderOwnData = {
        ...(resume.taskChoices.finderOwnData || {}),
        selected: finderListenerChoiceIds(resume.sourceScope)
      };
      resume.approvalMode = "manual";
      for (const field of [
        "window", "workScope", "workCount",
        "replyObjective", "replyTone", "businessKnowledge", "replyRule", "handoffRules",
        "message", "touchStrategy", "contactTiming", "replyStyle", "handoffBoundary", "conversionGoal",
        "touchChannel", "maxTouchesPerDay", "minIntervalMinutes", "stopConditions", "workSchedule", "schedule", "workWindow"
      ]) delete resume[field];
    }

    if (liveDanmakuAnalysis) {
      resume.sourceScope = "authorized_account_live";
      resume.analysisKind = "live_danmaku";
      resume.approvalMode = "manual";
      resume.longRunning = true;
      for (const field of [
        "window", "workScope", "workCount", "replyObjective", "replyTone", "businessKnowledge",
        "replyRule", "handoffRules", "message", "touchStrategy", "contactTiming", "replyStyle",
        "handoffBoundary", "conversionGoal", "touchChannel", "maxTouchesPerDay", "minIntervalMinutes",
        "stopConditions", "workSchedule", "schedule", "workWindow"
      ]) delete resume[field];
    }

    if (liveDanmakuOutreach) {
      resume.sourceScope = "authorized_account_live";
      resume.analysisKind = "live_danmaku_outreach";
      resume.approvalMode = "auto";
      resume.touchChannel = "private_message";
      resume.longRunning = true;
      resume.liveDanmakuSignals = ["danmaku"];
      resume.liveDanmakuOutreachGoal = liveOutreachSettings.goal;
      resume.liveDanmakuOutreachMessage = flow.liveDanmakuOutreachMessage
        || liveOutreachTouchContent.message
        || liveOutreachContentPolicy.strategy
        || liveOutreachContentPolicy.template
        || "";
      resume.maxTouchesPerDay = liveOutreachSettings.dailyMax;
      resume.minIntervalMinutes = liveOutreachSettings.minIntervalMinutes;
      resume.message = resume.liveDanmakuOutreachMessage || LIVE_DANMAKU_OUTREACH_DEFAULT_MESSAGE;
      resume.touchStrategy = resume.message;
      for (const field of [
        "window", "workScope", "workCount", "replyObjective", "replyTone", "businessKnowledge",
        "replyRule", "handoffRules", "contactTiming", "replyStyle", "handoffBoundary", "conversionGoal",
        "stopConditions", "workSchedule", "schedule", "workWindow"
      ]) delete resume[field];
    }

    return resume;
  }

  function persistCloudTask(flow, patch = {}) {
    if (!flow || (!isInboxIntakeFlow({ id: flow.agentId }, flow) && !isPrivateOutreachAgent({ id: flow.agentId }) && !isLongRunningAcquisitionAgent({ id: flow.agentId }) && !isLiveDanmakuAnalysisFlow({ id: flow.agentId }, flow) && !isLiveDanmakuOutreachFlow({ id: flow.agentId }, flow) && !isFinderListenerFlow({ id: flow.agentId }, flow))) return null;
    const base = { resumeFlow: cloudResumeFlow(flow) };
    if (flow.authStartedAt) base.startedAt = new Date(flow.authStartedAt).toISOString();
    return douyinCloudTaskStore.saveFor(cloudTaskStoreAgentId(flow), cloudTaskStoreScope(flow), { ...base, ...patch });
  }

  function cloudTaskStoreAgentId(flow) {
    if (isCommentAcquisitionAgent({ id: flow?.agentId }) && flow?.mode === "inbox") return "mkt-comment-acquisition:inbox";
    return flow?.agentId || "";
  }

  function cloudTaskStoreScope(flow) {
    return {
      accountKey: flow?.accountWorkKey || douyinAccountWorkKey(flow?.accountIdentity, flow?.accountId) || flow?.accountId || ""
    };
  }

  function readCloudTask(flow) {
    return douyinCloudTaskStore.getFor(cloudTaskStoreAgentId(flow), cloudTaskStoreScope(flow));
  }

  function isAccountScopedAcquisitionSetup(flow) {
    return isCommentAcquisitionAgent({ id: flow?.agentId })
      && flow?.mode === "inbox"
      && flow?.managerCombinedStart === true
      && Boolean(flow?.accountWorkKey || flow?.accountId);
  }

  function restoreAccountScopedAcquisitionDraft(flow, storedTask, { reset = false } = {}) {
    if (!isAccountScopedAcquisitionSetup(flow)) return false;
    if (reset) {
      flow.product = "";
      flow.requirements = "";
      flow.audienceTypes = [];
      flow.taskChoices = {};
      flow.message = "";
      flow.touchStrategy = "";
      delete flow.contactTiming;
      delete flow.workSchedule;
      flow.maxTouchesPerDay = COMMENT_ACQUISITION_DEFAULTS.frequency.maxTouchesPerDay;
      flow.minIntervalMinutes = COMMENT_ACQUISITION_DEFAULTS.frequency.minIntervalMinutes;
    }

    const task = storedTask === undefined ? readCloudTask(flow) : storedTask;
    const saved = task?.resumeFlow;
    if (!saved || saved.agentId !== flow.agentId) return false;

    if (!task.accountSetupSavedAt) return false;

    // Audience and first-message fields are backend-managed. Keep legacy drafts
    // from reappearing when an existing account-scoped task is reopened.
    flow.product = "";
    flow.requirements = "";
    flow.audienceTypes = [];
    flow.taskChoices = {};
    flow.message = "";
    flow.touchStrategy = "";
    delete flow.contactTiming;
    delete flow.workSchedule;
    flow.maxTouchesPerDay = COMMENT_ACQUISITION_DEFAULTS.frequency.maxTouchesPerDay;
    flow.minIntervalMinutes = COMMENT_ACQUISITION_DEFAULTS.frequency.minIntervalMinutes;
    flow.setupError = null;
    invalidateInboxPlan(flow);
    return true;
  }

  function persistAccountSetupDraft(flow) {
    if (!isAccountScopedAcquisitionSetup(flow)) return null;
    return persistCloudTask(flow, { accountSetupSavedAt: new Date().toISOString() });
  }

  function updateCloudTask(flow, patch = {}) {
    return douyinCloudTaskStore.updateFor(cloudTaskStoreAgentId(flow), cloudTaskStoreScope(flow), patch);
  }

  function recordUserResearchResult(flow, { status = "running", error = null } = {}) {
    if (!flow) return null;
    const candidates = Array.isArray(flow.surveyCandidates) ? flow.surveyCandidates : [];
    const entries = Array.isArray(flow.targetEntries) ? flow.targetEntries : [];
    const sent = entries.filter((entry) => entry.status === "sent").length;
    const failed = entries.filter((entry) => entry.status === "error" || entry.status === "failed").length;
    const unknown = entries.filter((entry) => entry.status === "unknown").length;
    return agentResultRecorder.record({
      agentId: "mkt-intent-analyst",
      agentName: "客户分析员",
      taskId: flow.taskId || (flow.taskId = newTaskId("user-research")),
      taskRunId: flow.taskRunId || null,
      title: `${flow.finderGoal || "目标用户"} · 用户调研`,
      summary: error
        ? `用户调研未完成：${error.message || error}`
        : status === "completed"
          ? `找到 ${candidates.length} 位匹配用户，已选择 ${entries.length} 位，成功发送 ${sent} 份问卷邀请。`
          : flow.researchPhase === "outreach"
            ? `正在通过 ${flow.account || "已选账号"} 向 ${entries.length} 位用户发送问卷邀请。`
            : `已找到 ${candidates.length} 位可邀请用户，等待确认名单、发送账号和问卷内容。`,
      source: "用户调研",
      status,
      accountId: flow.accountId || null,
      accountName: flow.account || null,
      sender: { accountId: flow.accountId || null, accountName: flow.account || null, identity: flow.accountIdentity || null },
      survey: { url: flow.surveyUrl || "", audienceGoal: flow.finderGoal || "", invitation: flow.message || "" },
      counts: {
        discovered: Number(flow.resultSnapshot?.counts?.discovered || candidates.length || 0),
        matched: candidates.length,
        selected: entries.length,
        sent,
        failed,
        unknown
      },
      inputs: { goal: flow.finderGoal || "", questionnaireUrl: flow.surveyUrl || "", optionalSeeds: finderCombinedInputs(flow), choices: structuredClone(flow.taskChoices || {}) },
      items: (entries.length ? entries : candidates).map((entry) => ({
        ...entry,
        message: entry.message || flow.message || "",
        status: entry.status === "error" ? "failed" : entry.status || "matched"
      })),
      accounts: candidates,
      errors: error ? [error] : []
    });
  }

  function recordPrivateOutreachResult(flow, { status = "running", error = null } = {}) {
    if (!flow) return null;
    if (isUserResearchAgent({ id: flow.agentId })) return recordUserResearchResult(flow, { status, error });
    const agentId = flow.agentId || "mkt-cold-writer";
    const taskId = flow.taskId || (flow.taskId = newTaskId("private-outreach"));
    const entries = Array.isArray(flow.targetEntries) && flow.targetEntries.length
      ? flow.targetEntries
      : [{ ...(flow.targetAccount || flow.result || {}), status: error ? "error" : status === "completed" ? "sent" : "pending", error: error?.message || null, message: flow.message || "" }];
    const sent = entries.filter((entry) => entry.status === "sent").length;
    const failed = entries.filter((entry) => entry.status === "error").length;
    const unknown = entries.filter((entry) => entry.status === "unknown").length;
    const ready = entries.filter((entry) => entry.status !== "duplicate").length;
    const result = agentResultRecorder.record({
      agentId,
      agentName: displayAgentName({ id: agentId, name: getMarketplaceAgent(agentId)?.name || agentId }),
      taskId,
      title: "抖音私信触达记录",
      summary: error
        ? `私信触达未完成：${error.message || error}`
        : status === "completed"
          ? `已处理${ready}个目标：成功${sent}个，失败${failed}个，结果未知${unknown}个。`
          : status === "pending"
            ? `云电脑已执行发送动作，${unknown}个目标等待平台回执；任务会继续核对，不会自动重复发送。`
            : "正在核验目标主页和抖音授权状态。",
      source: "抖音私信",
      status,
      counts: { total: ready, sent, failed, unknown },
      accountId: flow.accountId || null,
      accountName: flow.account || flow.accountIdentity?.accountName || flow.accountIdentity?.nickname || null,
      sender: {
        accountId: flow.accountId || null,
        accountName: flow.account || flow.accountIdentity?.accountName || flow.accountIdentity?.nickname || null,
        identity: flow.accountIdentity || null
      },
      outreachMode: privateOutreachMode(flow),
      sourceResultType: flow.sourceResultType || "",
      sourceScope: flow.sourceScope || "",
      trigger: {
        source: flow.sourceResultType === "评论筛选" ? "评论筛选结果" : flow.sourceResultType === "抖音找人" ? "抖音找人结果" : flow.source || "用户直接指定",
        reason: flow.sourceResultType
          ? `${privateOutreachMode(flow) === PRIVATE_OUTREACH_MODES.ALL_FOUND ? "用户从找客结果中选择全部找到的人" : "用户从成果中心选择潜客"}并启动私信触达`
          : "用户直接指定触达对象"
      },
      taskRunId: flow.taskRunId || null,
      ...(flow.sourceResultId ? { links: { sourceResultId: flow.sourceResultId, sourceTaskId: flow.sourceTaskId || null } } : {}),
      items: entries.map((entry) => ({
        recordId: entry.recordId || entry.sourceRecordId || "",
        nickname: entry.nickname || "目标用户",
        handle: entry.handle || entry.uniqueId || "",
        profileUrl: entry.profileUrl || "",
        secId: entry.secId || entry.secUid || "",
        secUid: entry.secUid || entry.secId || "",
        profile: entry.profile || entry.account?.profile || null,
        tier: entry.tier || "",
        score: entry.score ?? null,
        intent: entry.intent || null,
        reason: entry.reason || "",
        quote: entry.quote || entry.comment || "",
        signals: Array.isArray(entry.signals) ? entry.signals : [],
        evidence: Array.isArray(entry.evidence) ? entry.evidence : [],
        videoTitle: entry.videoTitle || "",
        videoUrl: entry.videoUrl || "",
        triggerSource: entry.triggerSource || (flow.sourceResultType === "评论筛选" ? "评论筛选结果" : flow.sourceResultType === "抖音找人" ? "抖音找人结果" : "用户直接指定"),
        triggerReason: entry.triggerReason || entry.reason || (flow.sourceResultType ? "用户从成果中心选择该目标" : "用户直接指定该目标"),
        sourceResultType: entry.sourceResultType || flow.sourceResultType || "",
        sourceScope: entry.sourceScope || flow.sourceScope || "",
        sourceResultId: entry.sourceResultId || flow.sourceResultId || "",
        sourceTaskId: entry.sourceTaskId || flow.sourceTaskId || "",
        status: entry.status === "error" ? "failed" : entry.status,
        error: entry.error?.message || entry.error || null,
        message: entry.message || flow.message || "",
        sentAt: entry.sentAt || null,
        submittedAt: entry.submittedAt || null,
        receiptAt: entry.receiptAt || null,
        providerResult: entry.providerResult || null
      }))
    });
    prospectStore.applyOutreachResults?.({
      entries,
      agentId,
      agentName: displayAgentName({ id: agentId, name: getMarketplaceAgent(agentId)?.name || agentId }),
      taskId,
      source: "抖音私信",
      sourceResultId: flow.sourceResultId || "",
      sourceResultType: flow.sourceResultType || "",
      sourceScope: flow.sourceScope || ""
    });
    return result;
  }

  function recordInboxResult(flow, { status = null, force = false } = {}) {
    if (!flow) return null;
    const agentId = flow.agentId || "mkt-dm-inbox";
    const taskId = flow.taskId || (flow.taskId = newTaskId("inbox-session"));
    const sourceResultId = `run:${agentId}::${taskId}::${flow.accountId || ""}`;
    const accountName = flow.account || flow.accountIdentity?.accountName || flow.accountIdentity?.nickname || "";
    const runtime = flow.runtime || {};
    const error = runtime.lastError || flow.error || null;
    const resolvedStatus = status || (error ? "failed" : runtime.running === false ? "completed" : "running");
    const counts = {
      received: Number(runtime.receivedCount || flow.messages?.length || 0),
      handoff: Number(runtime.handoffCount || 0),
      sent: Number(runtime.sentCount || 0),
      captured: Number(flow.leadCapturedCount || 0)
    };
    prospectStore.applyInboxReplyResults?.({
      messages: Array.isArray(flow.messages) ? flow.messages : [],
      agentId,
      agentName: displayAgentName({ id: agentId, name: getMarketplaceAgent(agentId)?.name || agentId }),
      taskId,
      sourceResultId
    });
    const capturedRecords = prospectStore.applyInboxLeadCapture?.({
      messages: Array.isArray(flow.messages) ? flow.messages : [],
      agentId,
      agentName: displayAgentName({ id: agentId, name: getMarketplaceAgent(agentId)?.name || agentId }),
      taskId,
      sourceResultId,
      accountId: flow.accountId || "",
      accountName
    }) || [];
    if (capturedRecords.length) {
      flow.leadCapturedIds = [...new Set([...(flow.leadCapturedIds || []), ...capturedRecords.map((item) => item.id)])];
      flow.leadCapturedCount = flow.leadCapturedIds.length;
      counts.captured = flow.leadCapturedCount;
    }
    const signature = JSON.stringify({ resolvedStatus, counts, error: error?.message || null, messageCount: flow.messages?.length || 0 });
    if (!force && signature === flow.lastRecordedInboxSignature) return null;
    flow.lastRecordedInboxSignature = signature;
    const result = agentResultRecorder.record({
      agentId,
      agentName: displayAgentName({ id: agentId, name: getMarketplaceAgent(agentId)?.name || agentId }),
      taskId,
      title: "私信承接运行记录",
      summary: error ? `私信承接出现异常：${error.message || error}` : resolvedStatus === "completed" ? `私信承接已停止，共接收${counts.received}条私信，自动回复${counts.sent}条，转人工接管${counts.handoff}条。` : `正在持续监听新私信，已接收${counts.received}条、自动回复${counts.sent}条、转人工接管${counts.handoff}条。`,
      source: "私信承接",
      status: resolvedStatus,
      counts,
      items: Array.isArray(flow.messages) ? flow.messages.slice(-20).map((item) => ({ ...item, status: item.status || "received" })) : [],
      artifacts: [{ type: "inbox-session", name: "私信承接会话记录", status: resolvedStatus }]
    });
    return result;
  }

  function recordCommentAcquisitionResult(flow, snapshot = flow?.taskSnapshot) {
    if (!flow || !snapshot) return null;
    const record = buildCommentAcquisitionResultRecord(flow, snapshot);
    const hasBusinessData = record.counts.scanned > 0
      || record.items.length > 0
      || record.approvalHistory.length > 0
      || record.replies.length > 0
      || record.errors.length > 0;
    if (!hasBusinessData || !record.taskId) return null;
    const signature = JSON.stringify({
      status: record.status,
      counts: record.counts,
      items: record.items.map((item) => item.leadId || item.id || item.secUid || item.sec_uid),
      approvals: record.approvalHistory.map((item) => `${item.touchId}:${item.state}`),
      replies: record.replies.map((item) => item.messageId || item.message_id || item.id),
      error: record.errors[0]?.code || null
    });
    if (signature === flow.lastRecordedAcquisitionSignature) return null;
    flow.lastRecordedAcquisitionSignature = signature;
    return agentResultRecorder.record(record);
  }

  async function recordCloudExit(flow) {
    const current = persistCloudTask(flow, { phase: "provisioning", exitedAt: new Date().toISOString() });
    if (!current || current.waitingMessageRecordedAt) return current;
    const text = "我已经开始准备这个账号的云电脑。你可以先退出等待，我会继续在后台准备；准备好后，我会在这里通知你，点击“继续处理”即可回到后续授权流程。";
    const market = getMarketplaceAgent(flow.agentId);
    recordAgentActivity(flow.agentId, {
      type: "activity",
      activityKey: `cloud-exit:${current.startedAt || current.updatedAt || "current"}`
    }, {
      journal: agentActivityJournal,
      fromName: displayAgentName({ id: flow.agentId, name: market?.name || flow.agentId }),
      text
    });
    return updateCloudTask(flow, {
      waitingMessageRecordedAt: new Date().toISOString(),
      waitingMessageError: null
    });
  }

  function openCloudExitPrompt(flow, { detached = false } = {}) {
    if (!flow || cloudExitOverlay?.isConnected) return;
    const overlay = el("div", "sb-as-cloud-exit");
    const card = el("section", "sb-as-cloud-exit-card");
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-modal", "true");
    card.setAttribute("aria-label", "退出云电脑等待");
    card.append(
      el("div", "sb-as-cloud-exit-kicker", "云电脑正在准备"),
      el("div", "sb-as-cloud-exit-title", "可以先退出，Agent 会继续工作"),
      el("div", "sb-as-cloud-exit-copy", "退出不会取消云电脑启动。首次准备通常需要 2-3 分钟，后台会继续准备该账号的云电脑；准备完成后，状态和继续处理入口会出现在任务记录里。"),
      el("div", "sb-as-cloud-exit-note", "你可以先去做别的事。回来打开这台 Agent，就能从上次保存的位置继续。")
    );
    const actions = el("div", "sb-as-cloud-exit-actions");
    const stay = el("button", null, "继续等待");
    const exit = el("button", "primary", "退出等待，先去做别的事");
    stay.type = "button";
    exit.type = "button";
    stay.addEventListener("click", () => {
      closeCloudExitPrompt();
      if (detached) {
        globalThis.__SALEBUDDY__?.navFrameworkReady?.then?.((framework) => framework?.openAgentSquare?.({
          initialAgentId: flow.agentId,
          resumeFlow: cloudResumeFlow(flow)
        }));
      }
    });
    exit.addEventListener("click", async () => {
      exit.disabled = true;
      exit.textContent = "正在保存进展…";
      await recordCloudExit(flow);
      closeCloudExitPrompt();
      if (detached) onChat?.(flow.agentId);
      else leaveUseFlow({ skipPrompt: true, openConversation: true });
    });
    actions.append(stay, exit);
    card.appendChild(actions);
    overlay.appendChild(card);
    overlay.addEventListener("click", (event) => { if (event.target === overlay) closeCloudExitPrompt(); });
    cloudExitOverlay = overlay;
    (detached ? document.body : page.root).appendChild(overlay);
  }

  function leaveUseFlow({ skipPrompt = false, openConversation = false } = {}) {
    const flow = state.useFlow;
    if (!skipPrompt && isCloudAuthorizationPending(flow)) {
      openCloudExitPrompt(flow);
      return;
    }
    state.view = "home";
    state.useFlow = null;
    closeAuthWindow(flow);
    clearAuthFeedback(flow);
    render();
    if (openConversation && flow?.agentId) window.setTimeout(() => onChat?.(flow.agentId), 0);
  }

  function startAuthFeedback(flow) {
    clearAuthFeedback(flow);
    flow.authFeedbackTimer = window.setInterval(() => {
      if (disposed || state.useFlow !== flow || !flow.authorizing) {
        clearAuthFeedback(flow);
        return;
      }
      flow.authElapsed = Math.max(0, Math.round((Date.now() - flow.authStartedAt) / 1000));
      render();
    }, 1000);
    useTimers.push(flow.authFeedbackTimer);
  }

  function isProvisioningStatus(status) {
    const stateName = String(status?.state || "").toUpperCase();
    const displayState = String(status?.display_state || status?.displayState || "").toLowerCase();
    const sessionState = String(status?.session_state || status?.sessionState || "").toLowerCase();
    return status?.provisioning === true
      || stateName === "STARTING"
      || ["starting", "provisioning", "initializing", "booting"].includes(displayState)
      || sessionState === "starting";
  }

  function isDouyinCloudConnectionPending(status = {}) {
    if (isProvisioningStatus(status)) return true;
    const stateName = String(status?.state || "").toUpperCase();
    if (stateName === "NOT_STARTED" || stateName === "ERROR") return false;
    const displayState = String(status?.display_state || status?.displayState || "").toLowerCase();
    const sessionState = String(status?.session_state || status?.sessionState || "").toLowerCase();
    const loginState = String(status?.login_state || status?.loginState || "").toLowerCase();
    return ["connecting", "initializing", "booting"].includes(displayState)
      || ["connecting", "initializing"].includes(sessionState)
      || loginState === "unknown"
      || (status?.worker?.online === false && Boolean(status?.sessionId || status?.session_id));
  }

  function isDefinitiveDouyinCloudFailure(status = {}) {
    const stateName = String(status?.state || "").toUpperCase();
    const displayState = String(status?.display_state || status?.displayState || "").toLowerCase();
    const sessionState = String(status?.session_state || status?.sessionState || "").toLowerCase();
    return ["ERROR", "OFFLINE", "DISCONNECTED", "STOPPED", "EXPIRED"].includes(stateName)
      || ["error", "offline", "disconnected", "stopped", "expired"].includes(displayState)
      || ["error", "offline", "disconnected", "stopped", "expired"].includes(sessionState);
  }

  async function waitForDouyinAuthorization(agentId, {
    timeoutMs = null,
    intervalMs = 5000,
    onPending = null,
    shouldContinue = null
  } = {}) {
    const startedAt = Date.now();
    const requestedTimeout = Number(timeoutMs);
    const deadline = Number.isFinite(requestedTimeout) && requestedTimeout > 0
      ? startedAt + Math.max(30_000, requestedTimeout)
      : Number.POSITIVE_INFINITY;
    let lastStatus = null;
    let lastTransientError = null;
    while ((!shouldContinue || shouldContinue()) && Date.now() < deadline) {
      try {
        const status = await douyinMcpCall("GET", `/v1/douyin/mcp/status?agentId=${encodeURIComponent(agentId)}`, null, 30000);
        lastStatus = status;
        const account = mcpAuthorizedAccount(status, agentId);
        if (account) return { account, status };
        if (isDefinitiveDouyinCloudFailure(status)) {
          return { account: null, status, cloudError: Object.assign(new Error("云电脑已断开，请重新连接后再继续"), { code: "DOUYIN_CLOUD_DISCONNECTED" }) };
        }
        if (!isDouyinCloudConnectionPending(status)) return { account: null, status };
        onPending?.(status, { elapsedMs: Math.max(0, Date.now() - startedAt) });
      } catch (error) {
        const code = String(error?.code || "");
        if (!["DOUYIN_MCP_TIMEOUT", "CONTROL_PLANE_TIMEOUT", "DOUYIN_MCP_WORKER_EXITED", "DOUYIN_MCP_WORKER_FAILED"].includes(code)) throw error;
        lastTransientError = error;
        onPending?.(null, { elapsedMs: Math.max(0, Date.now() - startedAt), error });
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      const delay = Math.max(1000, Number(intervalMs) || 5000);
      await new Promise((resolve) => window.setTimeout(resolve, Number.isFinite(remaining) ? Math.min(delay, remaining) : delay));
    }
    return {
      account: null,
      status: lastStatus,
      timedOut: Number.isFinite(deadline),
      cancelled: Boolean(shouldContinue && !shouldContinue()),
      error: lastTransientError
    };
  }

  function applyAuthorizedFlow(flow, agentId, authorizedSession = {}) {
    flow.authWindow = null;
    const requestedAgent = getMarketplaceAgent(flow?.agentId) || getMarketplaceAgent(agentId);
    const managerAccount = requestedAgent && isDouyinAcquisitionSingleCapabilityAgent(requestedAgent)
      ? managerBoundAccountForIdentity(authorizedSession?.accountIdentity || {})
      : null;
    if (managerAccount) {
      flow.authorizedAccounts = [managerAccount];
      flow.accountId = managerAccount.id;
      flow.account = managerAccount.name;
      flow.accountIdentity = managerAccount.identity;
      flow.accountWorkKey = douyinAccountWorkKey(managerAccount.identity, managerAccount.id);
      flow.authPhase = "blocked";
      flow.authorizing = false;
      clearAuthFeedback(flow);
      persistCloudTask(flow, { phase: "blocked", error: null, errorCode: null });
      openManagerBindingConflictDialog(requestedAgent, flow);
      render();
      return;
    }
    const account = rememberAuthorizedManagedAccount({
      id: authorizedSession?.accountId || agentDouyinAccountId(agentId),
      name: concreteAccountName(
        authorizedSession?.accountLabel,
        authorizedSession?.accountIdentity?.accountName,
        authorizedSession?.accountIdentity?.account_name,
        authorizedSession?.accountIdentity?.nickname,
        authorizedSession?.accountIdentity?.nick_name,
        authorizedSession?.accountIdentity?.uniqueId
      ) || "账号名称未返回",
      identity: authorizedSession?.accountIdentity,
      accountKey: authorizedSession?.accountId || agentDouyinAccountId(agentId),
      agentId,
      source: "douyin-mcp",
      status: "运行中",
      computer: "在线",
      authenticationVerified: true
    });
    if (!account) {
      flow.authError = "云电脑已登录，但账号身份未能保存，请重新检查登录状态";
    } else {
      const accountWorkKey = douyinAccountWorkKey(account.identity, account.id);
      flow.authorizedAccounts = [
        ...(flow.authorizedAccounts || []).filter((candidate) =>
          candidate?.id !== account.id
          && douyinAccountWorkKey(candidate?.identity, candidate?.id) !== accountWorkKey
        ),
        account
      ];
      flow.accountId = account.id;
      flow.account = account.name;
      flow.accountIdentity = account.identity;
      flow.executionAgentId = agentId;
      flow.authAccountId = account.id;
      flow.accountWorkKey = douyinAccountWorkKey(flow.accountIdentity, flow.accountId);
      flow.accountRef = account.identity?.profileUrl || account.identity?.uniqueId || "";
      flow.authError = null;
      flow.authErrorCode = null;
    }
    clearAuthFeedback(flow);
    flow.authPhase = "ready";
    flow.authorizing = false;
    const taskPatch = { phase: account ? "authorized" : "error" };
    if (account) taskPatch.authorizedAt = new Date().toISOString();
    persistCloudTask(flow, taskPatch);
    if (account) {
      pushActivity(agentId, `抖音账号“${account.name}”已完成授权，后续会复用这台云电脑。`);
      finishWork(agentId, "抖音账号授权");
      void resumeBlockedAcquisitionAfterAuthorization(flow);
    } else reportWorkError(agentId, flow.authError || "抖音账号授权信息保存失败");
    render();
  }

  async function resumeBlockedAcquisitionAfterAuthorization(flow) {
    if (flow?.taskSnapshot?.resumeBlocked?.reason !== "authorization_required" || !flow.taskKey) return;
    try {
      await controlCommentAcquisitionTask(flow, "resume");
      pushActivity(flow.agentId, "账号已重新连接，我会从上次进度继续长期获客。");
    } catch {
      // The task view retains the actionable state and lets the user retry.
    }
  }

  function authorizationAgentId(flow) {
    return String(flow?.executionAgentId || flow?.agentId || "mkt-dm-inbox").trim();
  }

  function authErrorMessage(error) {
    const code = error?.code || "";
    return code === "DOUYIN_PROVISIONING_TIMEOUT"
      ? "云电脑启动超过预期时间，旧启动任务可能已卡住。请点击“重启云电脑”后再继续授权。"
      : code === "DOUYIN_CLOUD_START_STUCK"
      ? "云端启动队列已卡住，普通重连无法恢复。请重新授权并创建新的云电脑实例。"
      : code === "DOUYIN_AGENT_KEY_ROTATED"
      ? "这台 Agent 已更换抖音 API Key，旧云电脑不会继续复用。请点击“重启云电脑”创建新会话。"
      : code === "DOUYIN_AGENT_API_KEY_SHARED" || code === "DOUYIN_AGENT_SESSION_SHARED"
      ? "这台 Agent 与其他 Agent 共用了抖音云电脑配置，请先为它配置独立 API Key。"
      : code === "DOUYIN_RPA_WORKER_OFFLINE"
      ? "云电脑已创建，云端桌面仍在上线，请稍后检查本次会话，不要重复创建"
      : code === "DOUYIN_MCP_TIMEOUT" || code === "CONTROL_PLANE_TIMEOUT"
      ? "云电脑启动请求超时，当前会话状态已保留。请检查状态，若仍未就绪可重启云电脑。"
      : code === "DOUYIN_MCP_UNAVAILABLE"
      ? "云电脑服务暂时不可用，请稍后重试"
      : (error?.message === "Failed to fetch" ? "云电脑仍在准备中，本次会话会保留，请稍后检查状态" : (error?.message || "云电脑授权暂时不可用"));
  }

  async function openMcpLogin(flow, agentId, started = {}, authAttemptId = null, accountId = "") {
    const isCurrentAttempt = () => !disposed
      && state.useFlow === flow
      && (authAttemptId == null || (flow.authorizing && flow.authAttemptId === authAttemptId));
    if (!isCurrentAttempt()) return;
    flow.authPhase = "opening";
    flow.authEstimateSeconds = Math.max(flow.authEstimateSeconds || 0, 150);
    render();
    const login = await douyinMcpCall("POST", "/v1/douyin/mcp/open-login", authorizationRequestBody(agentId, accountId, { force: true, wantQr: true }), 30000);
    if (!isCurrentAttempt()) return;
    flow.authPhase = "waiting_login";
    flow.authEstimateSeconds = Math.max(flow.authEstimateSeconds, flow.authElapsed + 30, 150);
    render();
    const pageUrl = login?.cloudViewUrl || login?.cloud_view_url || login?.viewUrl || login?.view_url
      || login?.viewPageUrl || login?.view_page_url || login?.pageUrl || login?.loginUrl || login?.login_url;
    if (!pageUrl) throw Object.assign(new Error("云电脑已启动，但没有返回登录屏幕链接"), { code: "DOUYIN_LOGIN_VIEW_MISSING" });
    const session = { ...started, ...login, agentId, ...(accountId ? { accountId } : {}), pageUrl, cloudViewUrl: pageUrl, source: "douyin-mcp" };
    flow.authWindow = openDouyinAuthorization({
      account: "等待识别抖音账号",
      scopes: ["账号身份", "公开作品评论"],
      session,
      refreshCloudView: async () => douyinMcpCall("POST", "/v1/douyin/mcp/open-login", authorizationRequestBody(agentId, accountId, { force: true, wantQr: true }), 30000),
      checkAuthorization: async () => {
        const status = await douyinMcpCall("POST", "/v1/douyin/mcp/check-login", authorizationRequestBody(agentId, accountId, {
          reqId: `manual-login-check:${agentId}:${Date.now()}`
        }), 30000);
        if (status?.worker && status.worker.online === false) {
          throw Object.assign(new Error("云端 RPA Worker 尚未上线，请等待云电脑启动后再检查"), { code: "DOUYIN_RPA_WORKER_OFFLINE" });
        }
        const account = mcpAuthorizedAccount(status, agentId, accountId);
        if (!account) throw Object.assign(new Error("尚未检测到云电脑内的抖音登录，请完成登录后再检查"), { code: "DOUYIN_LOGIN_REQUIRED" });
              return {
                state: "READY",
                authenticationVerified: true,
                accountIdentity: account.identity,
                accountId: account.id,
                accountLabel: concreteAccountName(
                  account.identity?.accountName,
                  account.identity?.account_name,
                  account.identity?.nickname,
                  account.identity?.nick_name,
                  account.name
                ),
                source: "douyin-mcp"
              };
      },
      onAuthorized: ({ session: authorizedSession } = {}) => {
        if (isCurrentAttempt()) applyAuthorizedFlow(flow, agentId, authorizedSession);
      },
      onCancelled: () => {
        if (!isCurrentAttempt()) return;
        flow.authWindow = null;
        clearAuthFeedback(flow);
        flow.authPhase = "idle";
        flow.authorizing = false;
        flow.authErrorCode = null;
        render();
      }
    });
  }

  function pollSavedAuthorization(flow, authAttemptId = null) {
    if (flow.authRecoveryPolling) return;
    flow.authRecoveryPolling = true;
    const agentId = authorizationAgentId(flow);
    const accountId = flow.authAccountId || "";
    const isCurrentAttempt = () => !disposed
      && state.useFlow === flow
      && (authAttemptId == null || (flow.authorizing && flow.authAttemptId === authAttemptId));
    const poll = async () => {
      if (!isCurrentAttempt()) {
        clearAuthFeedback(flow);
        return;
      }
    try {
      const status = await douyinMcpCall("GET", authorizationStatusUrl(agentId, accountId), null, 30000);
      if (!isCurrentAttempt()) return;
      const account = mcpAuthorizedAccount(status, agentId, accountId);
        if (account) {
          applyAuthorizedFlow(flow, agentId, { accountId: account.id, accountLabel: account.name, accountIdentity: account.identity });
          return;
        }
        if (isDefinitiveDouyinCloudFailure(status)) {
          flow.authRecoveryPolling = false;
          flow.authPhase = "error";
          flow.authorizing = false;
          flow.authErrorCode = "DOUYIN_CLOUD_DISCONNECTED";
          flow.authError = "云电脑已断开，请重新连接后再继续授权。";
          persistCloudTask(flow, { phase: "error", error: flow.authError, errorCode: flow.authErrorCode });
          reportWorkError(agentId, `云电脑授权未完成：${flow.authError}`);
          render();
          return;
        }
        if (isProvisioningStatus(status)) {
          flow.authRecoveryTimer = window.setTimeout(poll, 3000);
          useTimers.push(flow.authRecoveryTimer);
          return;
        }
        flow.authRecoveryPolling = false;
        await openMcpLogin(flow, agentId, status, authAttemptId, accountId);
      } catch (error) {
        if (!isCurrentAttempt()) {
          clearAuthFeedback(flow);
          return;
        }
        if (["DOUYIN_MCP_TIMEOUT", "CONTROL_PLANE_TIMEOUT", "DOUYIN_RPA_WORKER_OFFLINE"].includes(error?.code)) {
          flow.authRecoveryTimer = window.setTimeout(poll, 5000);
          useTimers.push(flow.authRecoveryTimer);
          return;
        }
        flow.authRecoveryPolling = false;
        clearAuthFeedback(flow);
        flow.authPhase = "error";
        flow.authorizing = false;
        flow.authErrorCode = error?.code || null;
        flow.authError = authErrorMessage(error);
        render();
      }
    };
    poll();
  }

  async function restoreSavedAuthorization(flow) {
    if (!flow || flow.authorizing) return;
    const agentId = authorizationAgentId(flow);
    const accountId = flow.authAccountId || "";
    const restoreAttemptId = flow.authAttemptId || 0;
    try {
      const status = await douyinMcpCall("GET", authorizationStatusUrl(agentId, accountId), null, 30000);
      if (disposed || state.useFlow !== flow || flow.authAttemptId !== restoreAttemptId) return;
      if (status?.error?.code) {
        flow.authPhase = "error";
        flow.authorizing = false;
        flow.authErrorCode = status.error.code;
        flow.authError = authErrorMessage(status.error);
        persistCloudTask(flow, { phase: "error", error: flow.authError, errorCode: flow.authErrorCode });
        reportWorkError(agentId, `云电脑授权未完成：${flow.authError}`);
        render();
        return;
      }
      if (!isProvisioningStatus(status)) return;
      const startedAt = Date.parse(status.startedAt || status.started_at || status.updatedAt || status.updated_at || "");
      flow.authorizing = true;
      const authAttemptId = restoreAttemptId + 1;
      flow.authAttemptId = authAttemptId;
      flow.authPhase = String(status.display_state || "").toLowerCase() === "opening" ? "opening" : "starting";
      flow.authStartedAt = Number.isFinite(startedAt) ? startedAt : Date.now();
      flow.authElapsed = Math.max(0, Math.round((Date.now() - flow.authStartedAt) / 1000));
      flow.authEstimateSeconds = 150;
      flow.authError = null;
      flow.loadingAccounts = false;
      beginWork(agentId, { task: "连接抖音账号并启动账号云电脑", phase: "恢复云电脑状态", projectId: null });
      pushActivity(agentId, "我已恢复这个账号的云电脑准备任务，正在继续检查登录状态。");
      startAuthFeedback(flow);
      render();
      pollSavedAuthorization(flow, authAttemptId);
    } catch (error) {
      if (disposed || state.useFlow !== flow || flow.authAttemptId !== restoreAttemptId) return;
      if (["DOUYIN_PROVISIONING_TIMEOUT", "DOUYIN_AGENT_KEY_ROTATED", "DOUYIN_AGENT_API_KEY_SHARED", "DOUYIN_AGENT_SESSION_SHARED"].includes(error?.code)) {
        flow.authPhase = "error";
        flow.authorizing = false;
        flow.authErrorCode = error.code;
        flow.authError = authErrorMessage(error);
        render();
      }
      // Account discovery remains usable when the optional status probe is unavailable.
    }
  }

  async function startMcpAuthorization(flow, { restart = false, addAccount = false } = {}) {
    if (flow.authorizing) return;
    const requestedAgent = getMarketplaceAgent(flow?.agentId);
    if (requestedAgent && openManagerBindingConflictDialog(requestedAgent, flow)) return;
    clearAuthFeedback(flow);
    flow.authAccountId = addAccount ? newAuthorizationAccountId() : "";
    const authAttemptId = (flow.authAttemptId || 0) + 1;
    flow.authAttemptId = authAttemptId;
    flow.authorizing = true;
    flow.authPhase = "starting";
    flow.authStartedAt = Date.now();
    flow.authElapsed = 0;
    flow.authEstimateSeconds = 150;
    flow.authError = null;
    flow.authErrorCode = null;
    flow.loadingAccounts = false;
    const providerAgentId = authorizationAgentId(flow);
    beginWork(flow.agentId || providerAgentId, {
      task: "连接抖音账号并启动账号云电脑",
      phase: "启动账号云电脑",
      projectId: null
    });
    pushActivity(flow.agentId || providerAgentId, addAccount
      ? "原账号会继续托管，我正在为新的抖音账号准备独立云电脑登录环境。"
      : restart
      ? "我会先停止卡住的云电脑启动任务，再重新准备这个账号的云电脑。"
      : "我已收到请求，正在准备这个账号的云电脑。首次启动通常需要 2-3 分钟。 ");
    startAuthFeedback(flow);
    persistCloudTask(flow, {
      phase: "provisioning",
      waitingMessageRecordedAt: readCloudTask(flow)?.waitingMessageRecordedAt || null
    });
    render();
    try {
      const agentId = providerAgentId;
      const started = await douyinMcpCall("POST", restart ? "/v1/douyin/mcp/restart" : "/v1/douyin/mcp/start", authorizationRequestBody(agentId, flow.authAccountId), 370000);
      if (disposed || state.useFlow !== flow || !flow.authorizing || flow.authAttemptId !== authAttemptId) return;
      flow.authPhase = "opening";
      flow.authEstimateSeconds = Math.max(flow.authEstimateSeconds, 150);
      pushActivity(agentId, "云电脑已上线，正在打开抖音登录入口。");
      render();
      if (started?.start_wait?.resolved === false) {
        // The cloud desktop can be valid while its worker is still coming online.
        await douyinMcpCall("GET", authorizationStatusUrl(agentId, flow.authAccountId), null, 30000);
      }
      if (disposed || state.useFlow !== flow || !flow.authorizing || flow.authAttemptId !== authAttemptId) return;
      await openMcpLogin(flow, agentId, started, authAttemptId, flow.authAccountId);
    } catch (error) {
      if (disposed || state.useFlow !== flow || !flow.authorizing || flow.authAttemptId !== authAttemptId) return;
      if (["DOUYIN_MCP_TIMEOUT", "CONTROL_PLANE_TIMEOUT", "DOUYIN_MCP_WORKER_EXITED"].includes(error?.code)) {
        flow.authPhase = "starting";
        flow.authError = null;
        flow.authErrorCode = null;
        pushActivity(flow.agentId || providerAgentId, "云电脑启动响应较慢，但会话仍在准备中。我会持续检查，不会因为这次请求超时而判定失败。 ");
        persistCloudTask(flow, { phase: "provisioning", error: null, errorCode: null });
        render();
        pollSavedAuthorization(flow, authAttemptId);
        return;
      }
      clearAuthFeedback(flow);
      flow.authPhase = "error";
      flow.authorizing = false;
      flow.authErrorCode = error?.code || null;
      flow.authError = authErrorMessage(error);
      reportWorkError(flow.agentId || providerAgentId, `云电脑授权未完成：${flow.authError}`);
      persistCloudTask(flow, { phase: "error", error: flow.authError });
      render();
    }
  }

  async function reauthorizeMcp(flow) {
    if (!flow || flow.authorizing) return;
    const confirmed = window.confirm("重新授权会释放当前云电脑实例，并清除这台实例中的抖音登录状态。确认后将创建新的云电脑并重新登录。是否继续？");
    if (!confirmed) return;
    const agentId = authorizationAgentId(flow);
    flow.authorizing = true;
    flow.authPhase = "starting";
    flow.authError = null;
    flow.authErrorCode = null;
    render();
    try {
      await douyinMcpCall("POST", "/v1/douyin/mcp/reauthorize", {
        agentId,
        confirm: "UNSUBSCRIBE",
        reason: "stale_cloud_start_command"
      }, 30000);
      flow.authorizedAccounts = [];
      flow.accountId = "";
      flow.account = "";
      flow.accountIdentity = null;
      flow.accountWorkKey = null;
      flow.authorizing = false;
      flow.authPhase = "idle";
      persistCloudTask(flow, { phase: "reauthorizing", error: null, errorCode: null });
      await startMcpAuthorization(flow);
    } catch (error) {
      flow.authorizing = false;
      flow.authPhase = "error";
      flow.authErrorCode = error?.code || "DOUYIN_REAUTHORIZATION_FAILED";
      flow.authError = authErrorMessage(error);
      persistCloudTask(flow, { phase: "error", error: flow.authError, errorCode: flow.authErrorCode });
      render();
    }
  }

  function presentationOf(agent) {
    return {
      name: agent?.displayName || displayAgentName({ id: agent?.id, name: agent?.name }),
      title: agent?.displayTitle || displayAgentTitle({ id: agent?.id, name: agent?.name, title: agent?.title })
    };
  }

  function setPageHeaderVisible(visible) {
    if (pageHead) pageHead.style.display = visible ? "" : "none";
  }

  function buildStandardCard({
    id,
    name,
    title,
    avatarValue = id,
    accent = categoryAccent("专业服务"),
    employmentStatus = "未雇佣",
    description = "",
    tags = [],
    footerText = "",
    footerStatusClass = "",
    avatarState = "idle",
    avatarVariant = "grok",
    actionButton = null,
    onCardClick = null,
    category = "",
    disabled = false,
    disabledReason = "首期未开放"
  } = {}) {
    const card = el("article", `sb-as-card${disabled ? " is-disabled" : ""}`);
    const [accentColor, accentSoft, accentBorder] = accent;
    card.style.setProperty("--sb-as-card-accent", accentColor);
    card.style.setProperty("--sb-as-card-accent-soft", accentSoft);
    card.style.setProperty("--sb-as-card-accent-border", accentBorder);
    if (!disabled && onCardClick) card.setAttribute("tabindex", "0");
    card.setAttribute("role", "group");
    card.setAttribute("aria-label", `${name} · ${title}`);
    if (disabled) {
      card.setAttribute("aria-disabled", "true");
      card.title = disabledReason;
    }

    if (category) card.appendChild(el("span", "sb-as-cat", category));
    const top = el("div", "sb-as-card-top");
    const ava = el("div", "sb-as-ava", avatarInitial(name));
    ava.style.background = accentSoft;
    if (avatarVariant === "grok") mountGrokBotAvatar(ava, avatarValue, { alt: name, state: avatarState, mode: "agent-square" });
    else mountAgentAvatar(ava, avatarValue, { alt: name, variant: avatarVariant });
    top.appendChild(ava);
    top.appendChild(el("div", "sb-as-name", name));
    top.appendChild(buildProviderRow(employmentStatus));
    card.appendChild(top);

    card.appendChild(el("div", "sb-as-desc", description));
    const tagsBox = el("div", "sb-as-tags");
    for (const tag of tags.slice(0, 3)) tagsBox.appendChild(buildSkillTag(tag, accentColor));
    card.appendChild(tagsBox);

    const foot = el("div", "sb-as-foot");
    if (footerText) {
      const meta = el("div", "sb-as-foot-meta");
      if (footerText.startsWith("状态：")) {
        const statusText = footerText.slice(3);
        const statusDot = el("span", `sb-as-dot ${footerStatusClass}`);
        meta.append(statusDot, el("span", null, statusText));
      } else {
        meta.appendChild(el("span", "sb-as-rate", footerText));
      }
      foot.appendChild(meta);
    }
    if (actionButton) {
      actionButton.classList.add("sb-as-card-action");
      foot.appendChild(actionButton);
    }
    card.appendChild(foot);

    if (!disabled && onCardClick) {
      const activate = () => onCardClick?.();
      card.addEventListener("click", activate);
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          activate();
        }
      });
    }
    return card;
  }

  function displayedCategory(agent) {
    return workflowCategory(agent);
  }

  // ── 我的团队 ──
  function renderTeamSection(container, { includeReady = true, includeUnavailable = true, showTitle = true, targetRow = null, targetRows = null } = {}) {
    const title = el("div", "sb-as-sec-title", "我的团队");
    const hired = listHiredAgents().filter((agent) => !DEFAULT_INSTALLED_MARKETPLACE_IDS.has(agent.id));
    const readyHired = sortMarketplaceAgentsForDisplay(hired.filter(isFirstReleaseAgent), { isReady: isFirstReleaseAgent });
    const unavailableHired = sortMarketplaceAgentsForDisplay(hired.filter((agent) => !isFirstReleaseAgent(agent)), { isReady: isFirstReleaseAgent });
    const profiles = teamLive?.getProfiles?.() || new Map();
    const visibleProfiles = BYERING_DEFAULT_AGENT_TYPES
      .map((agentType) => [agentType, profiles.get(agentType)])
      .filter(([agentType]) => agentType !== "main")
      .filter(([, profile]) => Boolean(profile));
    if (showTitle) container.appendChild(title);

    const row = targetRow || el("div", "sb-as-team");
    const appendCard = (card, category) => {
      if (targetRows) {
        const categoryRow = targetRows.get(category);
        if (categoryRow) categoryRow.appendChild(card);
        return;
      }
      row.appendChild(card);
    };

    // Put active hired members first so the team opens with usable agents.
    if (includeReady) for (const agent of readyHired) {
      const { name, title } = presentationOf(agent);
      const meta = {
        description: agent.desc,
        tags: agent.skills || []
      };
      const [accent, accentSoft, accentBorder] = marketplaceCardAccent(agent);
      const card = buildStandardCard({
        id: agent.id,
        name,
        title: title || "已雇佣成员",
        avatarValue: agent.id,
        accent: [accent, accentSoft, accentBorder],
        employmentStatus: "已雇佣",
        description: meta.description,
        tags: meta.tags,
        avatarState: "idle",
        actionButton: buildHireButton(agent),
        onCardClick: () => {
          if (isAgentReadyForUse(agent)) openUseFlow(agent);
          else openEmploymentDialog(agent, "hire");
        }
      });
      card.dataset.sbTeamCard = "true";
      card.dataset.sbAgentCard = "true";
      card.dataset.sbAgentId = agent.id;
      appendCard(card, workflowCategory(agent));
    }

    if (includeUnavailable) for (const [agentType, profile] of visibleProfiles) {
      const status = teamLive.getStatusOf(agentType);
      const agentName = displayAgentName({ agentType, identity: profile.identity });
      const agentTitle = displayAgentTitle({ agentType, identity: profile.identity, role: profile.role });
      const meta = teamCardMeta(agentType, profile);
      const [accent, accentSoft, accentBorder] = teamCardAccent(agentType);
      const unavailableButton = el("button", "sb-as-hire sb-disabled", "暂未开放");
      unavailableButton.type = "button";
      unavailableButton.disabled = true;
      const card = buildStandardCard({
        id: agentType,
        name: agentName,
        title: agentTitle || "默认成员",
        avatarValue: agentType,
        accent: [accent, accentSoft, accentBorder],
        employmentStatus: "未雇佣",
        description: meta.description,
        tags: meta.tags,
        avatarState: grokStateForTeamStatus(status),
        category: meta.phase,
        actionButton: unavailableButton,
        disabled: true
      });
      card.dataset.sbTeamCard = "true";
      card.dataset.sbAgentCard = "true";
      card.dataset.sbAgentId = agentType;
      appendCard(card, meta.phase);
    }

    if (includeUnavailable) for (const agent of unavailableHired) {
      const { name, title } = presentationOf(agent);
      const useReady = isFirstReleaseAgent(agent);
      const meta = {
        description: agent.desc,
        tags: agent.skills || []
      };
      const [accent, accentSoft, accentBorder] = marketplaceCardAccent(agent);
      const card = buildStandardCard({
        id: agent.id,
        name,
        title: title || "已雇佣成员",
        avatarValue: agent.id,
        accent: [accent, accentSoft, accentBorder],
        employmentStatus: "已雇佣",
        description: meta.description,
        tags: meta.tags,
        avatarState: "idle",
        actionButton: buildHireButton(agent),
        disabled: !useReady
      });
      card.dataset.sbTeamCard = "true";
      card.dataset.sbAgentCard = "true";
      card.dataset.sbAgentId = agent.id;
      appendCard(card, workflowCategory(agent));
    }
    if (!targetRow && !targetRows && row.children.length) container.appendChild(row);
    return row;
  }

  // ── Agent市场卡片 ──
  function buildUnavailableButton(label = "即将开放") {
    const button = el("button", "sb-as-hire sb-disabled", label);
    button.type = "button";
    button.disabled = true;
    return button;
  }

  function buildHireButton(agent) {
    const enabled = isFirstReleaseAgent(agent);
    const acquisitionCard = getAcquisitionCardViewModel(agent);
    const hired = isAgentReadyForUse(agent);
    const btn = el("button", `sb-as-hire${hired ? " sb-hired" : ""}${enabled ? "" : " sb-disabled"}`);
    btn.type = "button";
    btn.textContent = enabled ? (hired ? "立即使用" : "雇佣") : "暂未开放";
    btn.disabled = !enabled;
    const handleClick = async (event) => {
      event.stopPropagation();
      if (shouldGuidePrivateOutreachEntry(agent)) {
        openPrivateOutreachDependencyDialog(agent);
        return;
      }
      if (hired) {
        openUseFlow(agent);
        return;
      }
      if (enabled) {
        if (employmentSubmitting) return;
        employmentSubmitting = true;
        btn.disabled = true;
        try {
          state.employmentError = null;
          await employMarketplaceAgent(agent.id, {
            dataScope: agent.profile?.scope?.dataAccess,
            budget: agent.profile?.budget || null
          });
          openUseFlow(agent);
        } catch (error) {
          state.employmentError = error?.message || "雇佣状态暂时无法更新";
          render();
        } finally {
          employmentSubmitting = false;
        }
      }
    };
    if (getAcquisitionCardViewModel(agent)) {
      bindAcquisitionCardAction(btn, agent, undefined, handleClick, {
        label: hired ? "立即使用" : "雇佣"
      });
    } else if (enabled) {
      btn.addEventListener("click", handleClick);
    }
    return btn;
  }

  function privateOutreachRecords(flow = state.useFlow) {
    const mockRecords = Array.isArray(flow?.mockProspectRecords) ? flow.mockProspectRecords : [];
    const records = typeof prospectStore?.list === "function" ? prospectStore.list() : [];
    return mockRecords.length ? [...mockRecords, ...records] : records;
  }

  function privateOutreachDependencyState() {
    const records = privateOutreachRecords();
    const pendingAnalysis = records.filter((record) => isContactableRecord(record) && awaitingIntentAnalysis(record));
    const readyForOutreach = records.filter((record) => isPrivateOutreachRecordCandidate(record, PRIVATE_OUTREACH_MODES.PROSPECTS));
    const foundForOutreach = records.filter((record) => isPrivateOutreachRecordCandidate(record, PRIVATE_OUTREACH_MODES.ALL_FOUND));
    return { pendingAnalysis, readyForOutreach, foundForOutreach };
  }

  function shouldGuidePrivateOutreachEntry(agent) {
    if (!isPrivateOutreachAgent(agent)) return false;
    if (privateOutreachMockData?.records?.length) return false;
    const dependency = privateOutreachDependencyState();
    return dependency.readyForOutreach.length === 0 && dependency.foundForOutreach.length === 0;
  }

  function openPrivateOutreachDependencyDialog(agent) {
    if (employmentOverlay?.isConnected) return;
    const { pendingAnalysis } = privateOutreachDependencyState();
    const needsAnalysis = pendingAnalysis.length > 0;
    const overlay = el("div", "sb-as-employment");
    employmentOverlay = overlay;
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-label", needsAnalysis ? "先使用客户分析员" : "先使用找客专员");
    const card = el("div", "sb-as-employment-card");
    card.append(
      el("div", "sb-as-employment-title", needsAnalysis ? "先完成客户分析，再触达潜客" : "先完成找客和分析，再触达潜客"),
      el("div", "sb-as-employment-copy", needsAnalysis
        ? `当前已有 ${pendingAnalysis.length} 位互动用户等待判断。客户分析员完成意向分析后，符合条件的待确认触达潜客会自动带入这里。`
        : "潜客触达专员需要先有找客结果。进入后可以只触达已确认潜客，也可以从当前账号找到的人中灵活选择。"),
      el("div", "sb-as-employment-help", "正确使用顺序：找客专员 → 按需分析 → 潜客触达专员")
    );
    const closeDialog = () => {
      if (employmentOverlay === overlay) employmentOverlay = null;
      overlay.remove();
    };
    const actions = el("div", "sb-as-employment-actions");
    const cancel = el("button", "sb-as-employment-cancel", "稍后再说");
    cancel.type = "button";
    cancel.addEventListener("click", (event) => {
      event.stopPropagation();
      closeDialog();
    });
    if (!isAgentReadyForUse(agent)) {
      const hire = el("button", "sb-as-employment-cancel", "仍要雇佣潜客触达专员");
      hire.type = "button";
      hire.addEventListener("click", async (event) => {
        event.stopPropagation();
        if (employmentSubmitting) return;
        employmentSubmitting = true;
        hire.disabled = true;
        try {
          await employMarketplaceAgent(agent.id, {
            dataScope: agent.profile?.scope?.dataAccess,
            budget: agent.profile?.budget || null
          });
          closeDialog();
          render();
        } catch (error) {
          state.employmentError = error?.message || "雇佣状态暂时无法更新";
          hire.disabled = false;
          render();
        } finally {
          employmentSubmitting = false;
        }
      });
      actions.appendChild(hire);
    }
    const upstream = el("button", "sb-as-employment-confirm", needsAnalysis ? "先使用客户分析员" : "先使用找客专员");
    upstream.type = "button";
    upstream.addEventListener("click", (event) => {
      event.stopPropagation();
      closeDialog();
      if (needsAnalysis) {
        const analyst = getMarketplaceAgent("mkt-intent-analyst");
        if (analyst) openUseFlow(analyst);
        return;
      }
      openFinderForDependency();
    });
    actions.append(cancel, upstream);
    card.appendChild(actions);
    overlay.appendChild(card);
    overlay.addEventListener("click", (event) => { if (event.target === overlay) closeDialog(); });
    page.root.appendChild(overlay);
  }

  function openEmploymentDialog(agent, mode) {
    if (employmentOverlay?.isConnected) return;
    const { name, title } = presentationOf(agent);
    const overlay = el("div", "sb-as-employment");
    employmentOverlay = overlay;
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-label", mode === "hire" ? `确认雇佣${name}` : `确认解约${name}`);
    const card = el("div", "sb-as-employment-card");
    const dialogTitle = mode === "hire" ? `雇佣${name} · ${title}` : `确认解约${name}`;
    card.appendChild(el("div", "sb-as-employment-title", dialogTitle));
    card.appendChild(el("div", "sb-as-employment-copy", mode === "hire"
      ? "确认后，这位 Agent 会加入你的团队，可被项目组选择、任务调度并在通讯录中沟通。"
      : "解约后会从团队候选和项目组新建成员列表中移除，历史对话和已交付物仍会保留。"));
    const fields = el("div", "sb-as-employment-fields");
    let scopeInput = null;
    let budgetInput = null;
    if (mode === "hire") {
      const existing = getEmployment(agent.id);
      scopeInput = document.createElement("input");
      scopeInput.value = existing?.dataScope?.join("、") || agent.profile?.scope?.dataAccess?.join("、") || agent.tools.join("、");
      scopeInput.placeholder = "例如：当前项目 CRM、公开网页";
      const scopeField = el("label", "sb-as-employment-field", "数据范围");
      scopeField.appendChild(scopeInput);
      fields.appendChild(scopeField);
      budgetInput = document.createElement("input");
      budgetInput.type = "number";
      budgetInput.min = "0";
      budgetInput.placeholder = "不限";
      const budgetField = el("label", "sb-as-employment-field", "每日调用预算（可选）");
      budgetField.appendChild(budgetInput);
      fields.appendChild(budgetField);
      fields.appendChild(el("div", "sb-as-employment-help", `需要人工确认：${agent.profile?.permission?.approvalRequired?.join("、") || "外部发送、敏感数据和高风险动作"}`));
    }
    card.appendChild(fields);
    const actions = el("div", "sb-as-employment-actions");
    const cancel = el("button", "sb-as-employment-cancel", "取消");
    const confirm = el("button", "sb-as-employment-confirm", mode === "hire" ? "确认雇佣" : "确认解约");
    const closeDialog = () => {
      if (employmentOverlay === overlay) employmentOverlay = null;
      overlay.remove();
    };
    cancel.addEventListener("click", (event) => {
      event.stopPropagation();
      closeDialog();
    });
    confirm.addEventListener("click", async (event) => {
      event.stopPropagation();
      if (employmentSubmitting) return;
      employmentSubmitting = true;
      confirm.disabled = true;
      try {
        if (mode === "hire") {
          const dataScope = scopeInput.value.split(/[、,，]/).map((item) => item.trim()).filter(Boolean);
          const budget = budgetInput.value === "" ? null : { daily: Number(budgetInput.value) };
          await employMarketplaceAgent(agent.id, { dataScope, budget });
        } else {
          await terminateMarketplaceAgent(agent.id);
        }
        closeDialog();
        if (mode === "hire") {
          openUseFlow(agent);
          return;
        }
        render();
      } catch (error) {
        state.employmentError = error?.message || "雇佣状态暂时无法更新";
        confirm.disabled = false;
        render();
      } finally {
        employmentSubmitting = false;
      }
    });
    actions.append(cancel, confirm);
    card.appendChild(actions);
    overlay.appendChild(card);
    overlay.addEventListener("click", (event) => { if (event.target === overlay) closeDialog(); });
    // Keep transient dialog state outside the rerendered marketplace content.
    page.root.appendChild(overlay);
  }

  function isDouyinFinderAgent(agent) {
    return false;
  }

  function isCompositeFinderAgent(agent) {
    return agent?.id === "mkt-find-people";
  }

  function isFinderListenerFlow(agent, flow = {}) {
    return isCompositeFinderAgent(agent) && flow?.compositeFinderSource !== "public";
  }

  function finderOwnDataSelections(flow = {}) {
    const selected = Array.isArray(flow?.taskChoices?.finderOwnData?.selected)
      ? flow.taskChoices.finderOwnData.selected
      : [];
    return [...new Set(selected
      .map((value) => String(value || "").trim().toLowerCase())
      .filter((value) => ["comments", "live", "interactions"].includes(value)))];
  }

  function finderListenerChoiceIds(sourceScope) {
    if (sourceScope === "authorized_account_all_signals") return ["comments", "live", "interactions"];
    if (sourceScope === "authorized_account_live") return ["live"];
    if (sourceScope === "authorized_account_interactions") return ["interactions"];
    return ["comments"];
  }

  function finderListenerSourceScope(flow = {}) {
    const persisted = String(
      flow.taskSnapshot?.config?.sourceScope?.kind
      || flow.configuration?.sourceScope?.kind
      || ""
    ).trim().toLowerCase();
    const selected = finderOwnDataSelections(flow);
    const source = persisted || (selected.length > 1 ? "authorized_account_all_signals" : selected[0] || flow.sourceScope || flow.compositeFinderDataSource || "comments");
    if (["authorized_account_all_signals", "own_account_all_signals", "all", "all_signals"].includes(source)) return "authorized_account_all_signals";
    if (["live", "直播", "直播间", "authorized_account_live", "own_account_live"].includes(source)) return "authorized_account_live";
    if (["interactions", "interaction", "互动", "authorized_account_interactions", "own_account_interactions"].includes(source)) return "authorized_account_interactions";
    return "authorized_account_comments";
  }

  function finderListenerSourceLabel(sourceScope) {
    if (sourceScope === "authorized_account_all_signals") return "新增评论、直播互动和账号互动通知";
    if (sourceScope === "authorized_account_live") return "直播间新互动";
    if (sourceScope === "authorized_account_interactions") return "账号互动通知";
    return "作品评论";
  }

  function douyinFinderScopeError(flow) {
    const goal = String(flow?.finderGoal || "").trim();
    const count = Number(goal.match(/(?:帮我|请|需要|想要|给我|找|推荐|筛选|返回|列出)\s*(\d+)\s*(?:个|位|名)/)?.[1] || 0);
    if (count > 50) return "一次最多整理 50 个已核验账号。请按地区、人群或粉丝范围拆分任务后再找。";
    if (/(?:全网|全行业|整个行业|行业(?:里|内|中)?(?:所有|全部)|(?:所有|全部)(?:的)?(?:用户|账号|商家|博主|创作者|人))/.test(goal)) {
      return "找人需要明确范围，不能承诺覆盖全行业或所有用户。请补充地区、粉丝要求或具体人群后再找。";
    }
    return "";
  }

  function isUserResearchAgent(agent) {
    return false;
  }
  function isAccountAnalysisFlow(agent, flow = {}) { return flow?.analysisKind === "account_report"; }
  function isIntentAnalystAgent(agent) { return agent?.id === "mkt-intent-analyst"; }
  function isViralWorkAnalysisAgent(agent) { return agent?.id === "mkt-viral-work-analysis"; }
  function isViralWorkAnalysisFlow(agent, flow = {}) { return isViralWorkAnalysisAgent(agent) || flow?.analysisKind === "viral_work"; }

  function accountAnalysisPrefillUrl(account) {
    if (account?.profileUrl) return account.profileUrl;
    if (account?.secUid) return `https://www.douyin.com/user/${encodeURIComponent(account.secUid)}`;
    return "";
  }

  function isCommentAcquisitionAgent(agent) { return agent?.id === "mkt-comment-acquisition"; }
  function isLiveDanmakuAnalysisAgent(agent) { return agent?.id === "mkt-live-danmaku-analysis"; }
  function isLiveDanmakuAnalysisFlow(agent, flow = {}) {
    return isLiveDanmakuAnalysisAgent(agent) || flow?.analysisKind === "live_danmaku";
  }
  function isLiveDanmakuOutreachAgent(agent) { return agent?.id === "mkt-live-danmaku-outreach"; }
  function isLiveDanmakuOutreachFlow(agent, flow = {}) {
    return isLiveDanmakuOutreachAgent(agent) || flow?.analysisKind === "live_danmaku_outreach";
  }
  function isLongRunningAcquisitionAgent(agent) { return isCommentAcquisitionAgent(agent); }

  function stripListenerHistoricalFields(flow) {
    if (!flow || typeof flow !== "object") return flow;
    const historicalFields = [
      "window", "workScope", "workCount", "lookbackDays", "lookback_days",
      "timeWindow", "time_window", "historyWindow", "history_window",
      "dateRange", "date_range", "contentRange", "content_range",
      "days", "start", "end", "from", "to"
    ];

    const strip = (target) => {
      if (!target || typeof target !== "object" || Array.isArray(target)) return;
      for (const field of historicalFields) delete target[field];

      strip(target.sourceScope);
      strip(target.filters);
      strip(target.workWindow);
      strip(target.findingStrategy);
    };

    strip(flow);
    strip(flow.configuration);
    strip(flow.taskSnapshot);
    strip(flow.taskSnapshot?.config);
    strip(flow.taskSnapshot?.configuration);
    return flow;
  }

  function isCommentScreeningAgent(agent) {
    return false;
  }

  function isInboxAgent(agent) {
    return INBOX_AGENT_IDS.has(agent?.id);
  }

  function isInboxIntakeFlow(agent, flow = null) {
    return isInboxAgent(agent)
      || (isCommentAcquisitionAgent(agent) && flow?.mode === "inbox" && flow?.managerCombinedStart === true);
  }

  function isPrivateOutreachAgent(agent) {
    return agent?.id === "mkt-cold-writer";
  }

  function authElapsedLabel(seconds) {
    const total = Math.max(0, Number(seconds) || 0);
    if (total < 60) return `已等待 ${total} 秒`;
    const minutes = Math.floor(total / 60);
    const remainder = total % 60;
    return remainder ? `已等待 ${minutes} 分 ${remainder} 秒` : `已等待 ${minutes} 分钟`;
  }

  function buildCloudAuthorizationStatus(flow) {
    const phase = String(flow.authPhase || "starting").toLowerCase();
    const waitingLogin = phase === "waiting_login";
    const failed = phase === "error";
    const status = el("div", `sb-as-cloud-boot${waitingLogin ? " is-login" : ""}${failed ? " is-error" : ""}`);
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");

    const icon = el("div", "sb-as-cloud-boot-orb");
    icon.setAttribute("aria-hidden", "true");
    const body = el("div", "sb-as-cloud-boot-body");
    const title = failed
      ? "云电脑启动需要重试"
      : waitingLogin
      ? "云电脑已提供，等待抖音登录"
      : phase === "opening"
      ? "云电脑正在启动"
      : "正在启动账号云电脑";
    const copy = failed
      ? (flow.authError || "本次云电脑启动没有完成，请稍后重新连接。")
      : waitingLogin
      ? "云电脑已经准备好，请在当前授权窗口里的云电脑画面完成扫码或登录，登录状态会自动回填。"
      : "这是当前抖音账号的云电脑，首次启动通常需要 2-3 分钟。系统正在申请资源、启动桌面并连接 RPA Worker。";
    body.append(el("div", "sb-as-cloud-boot-title", title), el("div", "sb-as-cloud-boot-copy", copy));
    const head = el("div", "sb-as-cloud-boot-head");
    head.append(icon, body);
    status.appendChild(head);

    const track = el("div", "sb-as-cloud-boot-track");
    track.appendChild(el("i"));
    status.appendChild(track);
    const meta = el("div", "sb-as-cloud-boot-meta");
    const phaseLabel = failed
      ? "启动未完成"
      : waitingLogin
      ? "等待你完成登录"
      : phase === "opening"
      ? "正在准备桌面"
      : "正在申请资源";
    const estimateLabel = waitingLogin
      ? "已准备好"
      : failed
      ? "请稍后重试"
      : flow.authElapsed > flow.authEstimateSeconds
      ? "仍在启动中"
      : "预计 2-3 分钟";
    meta.append(el("span", null, phaseLabel), el("strong", null, estimateLabel));
    status.appendChild(meta);
    status.appendChild(el("div", "sb-as-cloud-boot-note", failed
      ? "本次会话状态已保留，稍后可重新检查，不会重复创建新的云电脑。"
      : waitingLogin
      ? "完成登录后回到此页面点击检查；请保持当前页面打开。"
      : `${authElapsedLabel(flow.authElapsed)} · 无需重复点击，页面会自动更新启动阶段。`));
    return status;
  }

  function inboxConfiguration(flow) {
    const isGoldCustomerService = flow.agentId === GOLD_CUSTOMER_SERVICE_AGENT_ID;
    const isCompleteAcquisition = flow.agentId === DOUYIN_ACQUISITION_COMPLETE_AGENT_ID;
    const base = {
      agentId: isGoldCustomerService ? GOLD_CUSTOMER_SERVICE_AGENT_ID : authorizationAgentId(flow),
      accountId: flow.accountId || "",
      accountName: flow.account || flow.accountIdentity?.accountName || flow.accountIdentity?.nickname || "",
      accountIdentity: flow.accountIdentity || null,
      autoReply: true
    };
    if (isGoldCustomerService || isCompleteAcquisition) {
      return {
        ...base,
        strategyMode: isGoldCustomerService ? "gold_customer_service" : "objective_first",
        replyObjective: String(flow.replyObjective || "").trim(),
        strategyPlan: flow.inboxPlan && typeof flow.inboxPlan === "object" ? flow.inboxPlan : null
      };
    }
    return {
      ...base,
      replyRule: String(flow.replyRule || "").trim(),
      replyObjective: String(flow.replyObjective || "").trim(),
      replyTone: String(flow.replyTone || "").trim(),
      businessKnowledge: String(flow.businessKnowledge || "").trim(),
      handoffRules: String(flow.handoffRules || "").split(/[、,，；;\n]/).map((value) => value.trim()).filter(Boolean)
    };
  }

  function receptionAccountId(flow) {
    const identity = flow.accountIdentity || {};
    return String(identity.uid || identity.user_id || identity.secUid || identity.sec_uid || identity.secId || identity.sec_id || flow.accountId || "");
  }

  function inboxReceptionProfiles(flow) {
    const accountId = receptionAccountId(flow);
    if (!accountId) return [];
    const identity = flow.accountIdentity || {};
    return [{
      id: accountId,
      name: concreteAccountName(flow.account, identity.accountName, identity.account_name, identity.nickname, identity.nick_name) || accountId,
      identity,
      avatar: flow.accountAvatar || ""
    }];
  }

  async function loadAccountReception(flow) {
    const accountId = receptionAccountId(flow); flow.receptionLoading = true; flow.reception = null;
    try {
      const record = await receptionRequest(accountId);
      if (receptionAccountId(flow) !== accountId) return;
      flow.reception = record; flow.receptionError = null;
      flow.businessKnowledge = record.settings.knowledge;
      flow.replyRule = record.settings.answerRules;
      flow.replyTone = receptionResponseStyle(record.settings);
      flow.replyObjective = receptionGoalObjective(record.settings);
      flow.handoffRules = "要求人工、投诉退款、无法确认的事实";
      flow.knowledgeLoading = false; flow.knowledgeEntries = []; invalidateInboxPlan(flow);
    } catch (error) { flow.receptionError = error.message; }
    finally { flow.receptionLoading = false; if (!disposed && state.useFlow === flow) render(); }
  }

  function invalidateInboxPlan(flow) {
    flow.inboxPlan = null;
    flow.planToken = "";
    flow.planRevision = "";
    flow.planConfirmable = false;
    flow.planError = null;
    flow.startRequestId = "";
    flow.startError = null;
  }

  function validateInboxSetup(flow) {
    const errors = {};
    if (!flow.accountId) errors.accountId = "请先连接并选择一个抖音账号。";
    if (flow.agentId === GOLD_CUSTOMER_SERVICE_AGENT_ID || flow.agentId === DOUYIN_ACQUISITION_COMPLETE_AGENT_ID) {
      if (!String(flow.replyObjective || "").trim()) errors.replyObjective = "请说明希望通过私信达成什么目标。";
      return errors;
    }
    const hasBusinessKnowledge = Boolean(flow.knowledgeEntries?.length || String(flow.businessKnowledge || "").trim());
    if (flow.reception !== undefined && !flow.reception?.revision) errors.reception = "先保存这个账号的接待方式";
    if (!String(flow.replyRule || "").trim()) errors.replyRule = "请说明哪些问题可以直接回答。";
    if (!String(flow.replyObjective || "").trim()) errors.replyObjective = "请说明希望通过对话达成什么转化结果。";
    if (!String(flow.replyTone || "").trim()) errors.replyTone = "请说明希望 Agent 使用什么语气回复。";
    if (!String(flow.handoffRules || "").trim()) errors.handoffRules = "请明确哪些情况必须交给人工。";
    if (!flow.knowledgeLoading && !hasBusinessKnowledge) {
      errors.businessKnowledge = "请填写产品、服务范围和可确认事实，或先在业务知识中添加已生效内容。";
    }
    return errors;
  }

  function inboxFieldErrors(error) {
    const errors = error?.details?.fieldErrors;
    if (!errors || typeof errors !== "object") return {};
    if (Array.isArray(errors)) {
      return Object.fromEntries(errors.map((item) => [item?.field, item?.message]).filter(([field, message]) => field && message));
    }
    return { ...errors };
  }

  function inboxPlanBlockingMessage(plan = {}) {
    const messages = [...new Set((Array.isArray(plan?.knowledgeGaps) ? plan.knowledgeGaps : [])
      .filter((gap) => String(gap?.severity || "").trim().toLowerCase() === "blocking")
      .map((gap) => String(gap?.message || "").trim())
      .filter(Boolean))];
    if (!messages.length) return "";
    return `暂不能启动：${messages.join(" ")} 请在“告诉我怎么回复”中补充业务资料并保存后重试。`;
  }

  function focusFirstInboxError(flow) {
    const first = Object.keys(flow.fieldErrors || {})[0];
    if (!first) return;
    window.requestAnimationFrame(() => {
      const field = root.querySelector(`[data-inbox-field="${first}"]`);
      field?.querySelector("textarea,input,select,button")?.focus();
    });
  }

  function saveInboxStrategy(flow) {
    if (flow.agentId === GOLD_CUSTOMER_SERVICE_AGENT_ID || flow.agentId === DOUYIN_ACQUISITION_COMPLETE_AGENT_ID) {
      inboxStrategyStore.save(flow.agentId, {
        replyObjective: flow.replyObjective
      }, {
        accountId: flow.accountId,
        accountName: flow.account || flow.accountIdentity?.accountName || flow.accountIdentity?.nickname || ""
      });
      return;
    }
    inboxStrategyStore.save(flow.agentId || "mkt-dm-inbox", {
      replyObjective: flow.replyObjective,
      replyTone: flow.replyTone,
      replyRule: flow.replyRule,
      handoffRules: flow.handoffRules
    }, {
      accountId: flow.accountId,
      accountName: flow.account || flow.accountIdentity?.accountName || flow.accountIdentity?.nickname || ""
    });
  }

  async function generateInboxPlan(agent, flow) {
    if (!flow || flow.planLoading) return false;
    flow.fieldErrors = validateInboxSetup(flow);
    flow.planError = null;
    if (Object.keys(flow.fieldErrors).length) {
      flow.starting = false;
      flow.planError = Object.values(flow.fieldErrors)[0] || "请完成私信承接的必要设置后再启动。";
      flow.step = "setup";
      render();
      focusFirstInboxError(flow);
      return false;
    }
    saveInboxStrategy(flow);
    flow.planLoading = true;
    // Keep the setup visible while the internal plan is prepared. The user
    // should only leave this page after the backend accepts the real task.
    flow.step = "setup";
    render();
    try {
      const result = await douyinMcpCall("POST", "/v1/douyin/inbox-agent/plan", inboxConfiguration(flow), 30000);
      if (state.view !== "use" || state.useFlow !== flow) return;
      flow.inboxPlan = result?.plan || null;
      flow.planToken = result?.planToken || "";
      flow.planRevision = result?.planRevision || "";
      flow.planConfirmable = result?.confirmable === true;
      flow.fieldErrors = result?.fieldErrors || {};
      flow.planError = inboxPlanBlockingMessage(flow.inboxPlan);
      if (!flow.planConfirmable && !flow.planError) {
        flow.planError = "暂不能启动：当前回复设置无法安全启动。请补充业务资料并保存后重试。";
      }
      flow.step = "setup";
      return Boolean(flow.inboxPlan && flow.planToken && flow.planConfirmable && !flow.planError);
    } catch (error) {
      if (state.view !== "use" || state.useFlow !== flow) return;
      flow.fieldErrors = inboxFieldErrors(error);
      flow.starting = false;
      flow.planError = error?.message || "AI 暂时无法生成承接方案，请稍后重试。";
      flow.step = "setup";
      return false;
    } finally {
      flow.planLoading = false;
      if (state.view === "use" && state.useFlow === flow) {
        render();
        focusFirstInboxError(flow);
      }
    }
  }

  function appendGoalFirstComposer(container, flow, kicker = "你想让我帮你达成什么？") {
    const composer = el("section", "sb-as-gold-composer");
    composer.appendChild(el("div", "sb-as-gold-composer-kicker", kicker));
    const objective = document.createElement("textarea");
    objective.rows = 4;
    objective.className = "sb-as-gold-composer-input";
    objective.setAttribute("aria-label", "私信对话目标");
    objective.value = flow.replyObjective || "";
    objective.placeholder = "例如：回答客户咨询，并在客户有明确需求时帮助我获取联系方式。";
    objective.addEventListener("input", () => {
      const selectionStart = objective.selectionStart;
      const selectionEnd = objective.selectionEnd;
      const selectionDirection = objective.selectionDirection;
      flow.replyObjective = objective.value;
      flow.fieldErrors = { ...(flow.fieldErrors || {}), replyObjective: "" };
      invalidateInboxPlan(flow);
      render();
      const nextObjective = root.querySelector('textarea[aria-label="私信对话目标"]');
      if (!nextObjective) return;
      nextObjective.focus();
      if (Number.isInteger(selectionStart) && Number.isInteger(selectionEnd)) {
        const valueLength = nextObjective.value.length;
        nextObjective.setSelectionRange?.(
          Math.min(selectionStart, valueLength),
          Math.min(selectionEnd, valueLength),
          selectionDirection || "none"
        );
      }
    });
    composer.appendChild(objective);
    const suggestions = el("div", "sb-as-gold-suggestions");
    suggestions.appendChild(el("span", "sb-as-gold-suggestions-label", "你也可以直接选一个目标"));
    [
      ["解答客户咨询", "回答客户在私信中的问题，必要时澄清解决问题所必需的信息。"],
      ["获取客户线索", "在解答问题后识别真实需求，适时收集可跟进的客户信息。"],
      ["引导预约或成交", "围绕客户需求沟通，合适时引导预约、到店或完成下一步转化。"]
    ].forEach(([label, value]) => {
      const suggestion = el("button", "sb-as-gold-suggestion", label);
      suggestion.type = "button";
      suggestion.addEventListener("click", () => {
        flow.replyObjective = value;
        flow.fieldErrors = { ...(flow.fieldErrors || {}), replyObjective: "" };
        invalidateInboxPlan(flow);
        render();
      });
      suggestions.appendChild(suggestion);
    });
    composer.appendChild(suggestions);
    if (flow.fieldErrors?.replyObjective) composer.appendChild(el("div", "sb-as-use-notice is-error sb-as-gold-error", flow.fieldErrors.replyObjective));
    container.appendChild(composer);
    return composer;
  }

  function appendLiveDanmakuGoalComposer(container, flow) {
    const composer = el("section", "sb-as-gold-composer sb-as-live-composer");
    composer.appendChild(el("div", "sb-as-gold-composer-kicker", "这场直播，你想让我重点看什么？"));
    const goal = document.createElement("textarea");
    goal.rows = 4;
    goal.className = "sb-as-gold-composer-input";
    goal.setAttribute("aria-label", "直播间弹幕分析目标");
    goal.value = flow.liveDanmakuGoal || "";
    goal.placeholder = "例如：找出价格异议、库存问题和明确想购买的人";
    goal.addEventListener("input", () => {
      flow.liveDanmakuGoal = goal.value;
      flow.setupError = null;
    });
    composer.appendChild(goal);

    const suggestions = el("div", "sb-as-gold-suggestions");
    suggestions.appendChild(el("span", "sb-as-gold-suggestions-label", "你也可以直接选一个重点"));
    [
      ["高频问题", "梳理直播间反复出现的问题，找出最需要回应的内容。"],
      ["价格与优惠", "重点分析价格、优惠、库存和购买门槛相关的讨论。"],
      ["明确购买意向", "找出已经表达购买、下单或希望进一步了解的观众。"]
    ].forEach(([label, value]) => {
      const suggestion = el("button", "sb-as-gold-suggestion", label);
      suggestion.type = "button";
      suggestion.addEventListener("click", () => {
        flow.liveDanmakuGoal = value;
        flow.setupError = null;
        render();
      });
      suggestions.appendChild(suggestion);
    });
    composer.appendChild(suggestions);

    container.appendChild(composer);
    return composer;
  }

  function renderGoldCustomerServiceSetup(panel, flow) {
    panel.classList.add("sb-as-inbox-setup", "sb-as-gold-customer-service-setup");
    const accounts = flow.authorizedAccounts || [];
    const accountId = receptionAccountId(flow);
    const accountUnavailable = flow.accountUnavailable === true;
    const hasAccount = Boolean(accountId) && !accountUnavailable;
    const hasObjective = Boolean(String(flow.replyObjective || "").trim());
    const loading = Boolean(flow.loadingAccounts || flow.planLoading || flow.authorizing || flow.starting);
    const shell = el("div", "sb-as-gold-shell");

    const hero = el("header", "sb-as-gold-hero");
    const heroMark = el("div", "sb-as-gold-hero-mark");
    mountGrokBotAvatar(heroMark, GOLD_CUSTOMER_SERVICE_AGENT_ID, { alt: "金牌客服", state: "idle", trackPointer: false, mode: "agent-square" });
    const heroCopy = el("div", "sb-as-gold-hero-copy");
    heroCopy.append(
      el("h1", "sb-as-gold-title", "我来帮你接住私信"),
      el("p", "sb-as-gold-subtitle", "连接账号后，我会按你的目标接待新私信，先帮用户解决问题，再判断下一步怎么推进。")
    );
    hero.append(heroMark, heroCopy);
    shell.appendChild(hero);

    const accountSection = el("section", `sb-as-gold-account ${hasAccount ? "" : "is-empty"}`.trim());

    if (hasAccount) {
      const selected = accounts.find((account) => account.id === flow.accountId)
        || accounts.find((account) => receptionAccountId({ accountIdentity: account.identity, accountId: account.id }) === accountId)
        || { id: flow.accountId, name: flow.account, identity: flow.accountIdentity };
      const avatar = el("div", "sb-as-gold-account-avatar");
      avatar.appendChild(taskPersonAvatar(selected.identity || flow.accountIdentity, selected.name || flow.account));
      const copy = el("div", "sb-as-gold-account-copy");
      const identity = selected.identity || flow.accountIdentity || {};
      const handle = String(identity.uniqueId || identity.unique_id || flow.accountHandle || "").trim();
      copy.append(
        el("span", "sb-as-gold-account-label", "工作账号"),
        el("strong", null, concreteAccountName(selected.name, identity.accountName, identity.account_name, identity.nickname, identity.nick_name) || "已登录抖音账号"),
        el("span", null, handle ? (handle.startsWith("@") ? handle : `@${handle}`) : "已完成授权")
      );
      accountSection.append(avatar, copy);
      const accountStatus = el("span", "sb-as-gold-account-state");
      accountStatus.append(el("i"), el("span", null, "已连接"));
      accountSection.appendChild(accountStatus);
      if (accounts.length > 1) {
        const select = document.createElement("select");
        select.className = "sb-as-gold-account-select";
        select.setAttribute("aria-label", "选择抖音账号");
        accounts.forEach((account) => {
          const option = el("option", null, concreteAccountName(account.name, account.identity?.accountName, account.identity?.account_name, account.identity?.nickname, account.identity?.nick_name) || "已登录抖音账号");
          option.value = account.id;
          select.appendChild(option);
        });
        select.value = selected.id || flow.accountId;
        select.disabled = loading;
        select.addEventListener("change", () => {
          const next = accounts.find((account) => account.id === select.value);
          flow.accountId = next?.id || "";
          flow.account = next?.name || "";
          flow.accountIdentity = next?.identity || null;
          flow.executionAgentId = next?.agentId || flow.agentId;
          flow.accountWorkKey = douyinAccountWorkKey(flow.accountIdentity, flow.accountId);
          flow.accountUnavailable = false;
          flow.inboxTaskId = "";
          flow.inboxTaskRunId = "";
          flow.inboxConversationId = "";
          flow.startRequestId = "";
          flow.inboxTakeoverOwnerAgentId = "";
          invalidateInboxPlan(flow);
          render();
        });
        accountSection.appendChild(select);
      }
      const reauthorize = el("button", "sb-as-gold-account-reauthorize", flow.authorizing ? "正在打开登录…" : "添加账号");
      reauthorize.type = "button";
      reauthorize.disabled = Boolean(flow.authorizing);
      reauthorize.addEventListener("click", () => startMcpAuthorization(flow, { addAccount: true }));
      accountSection.appendChild(reauthorize);
    } else {
      const loginCopy = el("div", "sb-as-gold-account-login");
      loginCopy.append(
        el("strong", null, "连接一个抖音账号"),
        el("span", null, flow.loadingAccounts
          ? "正在查看已登录的抖音账号。"
          : accountUnavailable
            ? "之前绑定的抖音账号当前不可用。重新连接原账号后才能继续。"
            : "我只会在你选择的账号里读取和回复私信。")
      );
      const login = el("button", "sb-as-gold-account-action", flow.authorizing ? "正在打开登录…" : accountUnavailable ? "重新连接原账号" : "连接抖音账号");
      login.type = "button";
      login.disabled = Boolean(flow.authorizing);
      login.addEventListener("click", () => startMcpAuthorization(flow));
      accountSection.append(loginCopy, login);
    }
    shell.appendChild(accountSection);
    if (flow.authorizing || ["starting", "opening", "waiting_login"].includes(flow.authPhase)) shell.appendChild(buildCloudAuthorizationStatus(flow));
    if (flow.authError) shell.appendChild(el("div", "sb-as-use-notice is-error sb-as-gold-error", flow.authError));

    appendGoalFirstComposer(shell, flow, "你想让我帮你达成什么？");

    const launch = el("footer", "sb-as-gold-launch");
    const start = el("button", "sb-as-gold-launch-button", flow.starting || flow.planLoading ? "正在启动…" : "开始使用金牌客服");
    start.type = "button";
    start.disabled = !hasAccount || !hasObjective || loading;
    start.addEventListener("click", () => {
      const activeAgent = getMarketplaceAgent(state.useId);
      if (isInboxIntakeFlow(activeAgent, flow)) {
        void Promise.resolve(startInboxIntake(activeAgent, flow)).catch((error) => {
          if (state.view !== "use" || state.useFlow !== flow) return;
          flow.starting = false;
          flow.planLoading = false;
          flow.step = "setup";
          flow.startError = error?.message || "启动金牌客服失败，请稍后重试。";
          render();
        });
      }
    });
    launch.appendChild(start);
    shell.appendChild(launch);
    if (flow.setupError || flow.planError || flow.startError) {
      shell.appendChild(el("div", "sb-as-use-notice is-error sb-as-gold-error", flow.setupError || flow.planError || flow.startError));
    }
    panel.appendChild(shell);
  }

  function renderManagerInboxSetup(panel, flow) {
    panel.classList.add("sb-as-inbox-setup", "sb-as-manager-inbox-setup");
    const accounts = flow.authorizedAccounts || [];
    const accountId = receptionAccountId(flow);
    const accountUnavailable = flow.accountUnavailable === true;
    const hasAccount = Boolean(accountId) && !accountUnavailable;
    const hasObjective = Boolean(String(flow.replyObjective || "").trim());
    const blockingPlan = Boolean(flow.planError && flow.inboxPlan && !flow.planConfirmable);
    const loading = Boolean(flow.loadingAccounts || flow.planLoading || flow.authorizing || flow.starting);
    const shell = el("div", "sb-as-gold-shell");

    const hero = el("header", "sb-as-gold-hero");
    const heroMark = el("div", "sb-as-gold-hero-mark");
    mountGrokBotAvatar(heroMark, flow.agentId, { alt: "抖音获客管家", state: "idle", trackPointer: false, mode: "agent-square" });
    const heroCopy = el("div", "sb-as-gold-hero-copy");
    heroCopy.append(
      el("h1", "sb-as-gold-title", "我来帮你把获客做起来"),
      el("p", "sb-as-gold-subtitle", "连接账号后，我会从评论、直播和账号互动里，帮你找出值得跟进的人，完成首次私信，再继续承接后续对话。")
    );
    hero.append(heroMark, heroCopy);
    shell.appendChild(hero);

    const accountSection = el("section", `sb-as-gold-account ${hasAccount ? "" : "is-empty"}`.trim());
    if (hasAccount) {
      const selected = accounts.find((account) => account.id === flow.accountId)
        || accounts.find((account) => receptionAccountId({ accountIdentity: account.identity, accountId: account.id }) === accountId)
        || { id: flow.accountId, name: flow.account, identity: flow.accountIdentity };
      const avatar = el("div", "sb-as-gold-account-avatar");
      avatar.appendChild(taskPersonAvatar(selected.identity || flow.accountIdentity, selected.name || flow.account));
      const copy = el("div", "sb-as-gold-account-copy");
      const identity = selected.identity || flow.accountIdentity || {};
      const handle = String(identity.uniqueId || identity.unique_id || flow.accountHandle || "").trim();
      copy.append(
        el("span", "sb-as-gold-account-label", "工作账号"),
        el("strong", null, concreteAccountName(selected.name, identity.accountName, identity.account_name, identity.nickname, identity.nick_name) || "已登录抖音账号"),
        el("span", null, handle ? (handle.startsWith("@") ? handle : `@${handle}`) : "已完成授权")
      );
      accountSection.append(avatar, copy);
      const accountStatus = el("span", "sb-as-gold-account-state");
      accountStatus.append(el("i"), el("span", null, "已连接"));
      accountSection.appendChild(accountStatus);
      if (accounts.length > 1) {
        const select = document.createElement("select");
        select.className = "sb-as-gold-account-select";
        select.setAttribute("aria-label", "选择抖音账号");
        accounts.forEach((account) => {
          const option = el("option", null, concreteAccountName(account.name, account.identity?.accountName, account.identity?.account_name, account.identity?.nickname, account.identity?.nick_name) || "已登录抖音账号");
          option.value = account.id;
          select.appendChild(option);
        });
        select.value = selected.id || flow.accountId;
        select.disabled = loading;
        select.addEventListener("change", () => {
          const next = accounts.find((account) => account.id === select.value);
          flow.accountId = next?.id || "";
          flow.account = next?.name || "";
          flow.accountIdentity = next?.identity || null;
          flow.executionAgentId = next?.agentId || flow.agentId;
          flow.accountWorkKey = douyinAccountWorkKey(flow.accountIdentity, flow.accountId);
          flow.accountUnavailable = false;
          flow.inboxTaskId = "";
          flow.inboxTaskRunId = "";
          flow.inboxConversationId = "";
          flow.startRequestId = "";
          flow.inboxTakeoverOwnerAgentId = "";
          flow.reception = undefined;
          restoreAccountScopedAcquisitionDraft(flow, undefined, { reset: true });
          invalidateInboxPlan(flow);
          render();
        });
        accountSection.appendChild(select);
      }
      const reauthorize = el("button", "sb-as-gold-account-reauthorize", flow.authorizing ? "正在打开登录…" : "添加账号");
      reauthorize.type = "button";
      reauthorize.disabled = Boolean(flow.authorizing);
      reauthorize.addEventListener("click", () => startMcpAuthorization(flow, { addAccount: true }));
      accountSection.appendChild(reauthorize);
    } else {
      const loginCopy = el("div", "sb-as-gold-account-login");
      loginCopy.append(
        el("strong", null, "连接一个抖音账号"),
        el("span", null, flow.loadingAccounts
          ? "正在查看已登录的抖音账号。"
          : accountUnavailable
            ? "之前绑定的抖音账号当前不可用。重新连接原账号后才能继续。"
            : "我会从这个账号的评论、直播和账号互动里识别值得跟进的人。")
      );
      const login = el("button", "sb-as-gold-account-action", flow.authorizing ? "正在打开登录…" : accountUnavailable ? "重新连接原账号" : "连接抖音账号");
      login.type = "button";
      login.disabled = Boolean(flow.authorizing);
      login.addEventListener("click", () => startMcpAuthorization(flow));
      accountSection.append(loginCopy, login);
    }
    shell.appendChild(accountSection);
    if (flow.authorizing || ["starting", "opening", "waiting_login"].includes(flow.authPhase)) shell.appendChild(buildCloudAuthorizationStatus(flow));
    if (flow.authError) shell.appendChild(el("div", "sb-as-use-notice is-error sb-as-gold-error", flow.authError));

    const automation = el("section", "sb-as-manager-automation");
    const automationHead = el("div", "sb-as-manager-automation-head");
    automationHead.append(
      el("div", "sb-as-gold-composer-kicker", "我会自动完成"),
      el("span", null, "你只需要告诉我，这次希望通过私信达成什么")
    );
    const automationList = el("div", "sb-as-manager-automation-list");
    [
      ["识别潜客", "从评论、直播和账号互动里，找出值得跟进的人"],
      ["完成首触", "根据每条互动证据生成自然、有依据的首次私信"],
      ["持续承接", "围绕你的目标推进对话，复杂情况及时交给人工"]
    ].forEach(([title, description]) => {
      const item = el("div", "sb-as-manager-automation-item");
      const itemCopy = el("div");
      itemCopy.append(el("strong", null, title), el("span", null, description));
      item.append(el("i"), itemCopy);
      automationList.appendChild(item);
    });
    automation.append(automationHead, automationList);
    shell.appendChild(automation);

    appendGoalFirstComposer(shell, flow, "你想让我帮你达成什么？");

    const launch = el("footer", "sb-as-gold-launch sb-as-manager-launch");
    const launchCopy = el("div", "sb-as-manager-launch-copy");
    launchCopy.append(
      el("strong", null, "准备开始获客"),
      el("span", null, hasAccount
        ? "启动后会在后台持续运行，你可以随时回来查看进展或调整目标。"
        : "连接账号并告诉我目标后，才可以开始托管。")
    );
    const start = el("button", "sb-as-gold-launch-button", flow.starting || flow.planLoading
      ? "正在启动…"
      : flow.inboxTakeoverOwnerAgentId
        ? "确认切换并启动"
        : "启动抖音获客管家");
    start.type = "button";
    start.disabled = !hasAccount || !hasObjective || loading || blockingPlan;
    start.addEventListener("click", () => {
      const activeAgent = getMarketplaceAgent(state.useId);
      if (!isInboxIntakeFlow(activeAgent, flow)) return;
      void Promise.resolve(startInboxIntake(activeAgent, flow, { takeover: Boolean(flow.inboxTakeoverOwnerAgentId) })).catch((error) => {
        if (state.view !== "use" || state.useFlow !== flow) return;
        flow.starting = false;
        flow.planLoading = false;
        flow.step = "setup";
        flow.startError = error?.message || "启动抖音获客管家失败，请稍后重试。";
        render();
      });
    });
    launch.append(launchCopy, start);
    shell.appendChild(launch);
    if (flow.setupError || flow.planError || flow.startError) {
      shell.appendChild(el("div", "sb-as-use-notice is-error sb-as-gold-error", flow.setupError || flow.planError || flow.startError));
    }
    panel.appendChild(shell);
  }

  function renderInboxSetup(panel, flow) {
    if (flow.agentId === GOLD_CUSTOMER_SERVICE_AGENT_ID) {
      renderGoldCustomerServiceSetup(panel, flow);
      return;
    }
    if (isCommentAcquisitionAgent({ id: flow.agentId })) {
      renderManagerInboxSetup(panel, flow);
      return;
    }
    panel.classList.add("sb-as-inbox-setup");
    const managerInbox = isCommentAcquisitionAgent({ id: flow.agentId });
    if (!managerInbox) prefillInboxFromTouchedProspects(flow);
    const startsCompleteManager = managerInbox && flow.managerCombinedStart === true;
    const accounts = flow.authorizedAccounts || [];
    const accountId = receptionAccountId(flow);
    const accountUnavailable = flow.accountUnavailable === true;
    const hasAccount = Boolean(accountId) && !accountUnavailable;
    const hasObjective = Boolean(String(flow.replyObjective || "").trim());
    const hasReception = Boolean(flow.reception?.revision);
    const hasBusinessKnowledge = Boolean(flow.knowledgeEntries?.length || String(flow.businessKnowledge || "").trim());
    const businessKnowledgePending = Boolean(flow.knowledgeLoading);
    const strategyReady = managerInbox ? hasObjective : hasReception && hasBusinessKnowledge && !businessKnowledgePending;
    const blockingPlan = Boolean(flow.planError && flow.inboxPlan && !flow.planConfirmable);
    const loading = Boolean(flow.loadingAccounts || flow.receptionLoading || flow.planLoading || flow.authorizing || flow.starting);

    const flowRoot = el("div", "sb-as-inbox-flow");
    const accountSection = el("section", "sb-as-inbox-section");
    const accountHead = el("div", "sb-as-inbox-section-head");
    const accountTitle = el("div", "sb-as-inbox-section-title");
    accountTitle.append(
      el("strong", null, "1. 登录你的抖音账号"),
      el("span", null, "登录后会自动识别当前账号，也可以继续添加新的抖音账号。")
    );
    const accountStatus = el("span", `sb-as-inbox-section-status ${hasAccount ? "is-ready" : ""}`);
    accountStatus.append(el("i"), el("span", null, hasAccount ? "已登录" : accountUnavailable ? "需重新连接" : flow.loadingAccounts ? "正在识别" : "未登录"));
    accountHead.append(accountTitle, accountStatus);
    accountSection.appendChild(accountHead);

    if (hasAccount) {
      const selected = accounts.find((account) => account.id === flow.accountId)
        || accounts.find((account) => receptionAccountId({ accountIdentity: account.identity, accountId: account.id }) === accountId)
        || { id: flow.accountId, name: flow.account, identity: flow.accountIdentity };
      const accountRow = el("div", "sb-as-inbox-account");
      const avatar = el("div", "sb-as-inbox-account-avatar");
      avatar.appendChild(taskPersonAvatar(selected.identity || flow.accountIdentity, selected.name || flow.account));
      const copy = el("div", "sb-as-inbox-account-copy");
      const identity = selected.identity || flow.accountIdentity || {};
      const handle = String(identity.uniqueId || identity.unique_id || flow.accountHandle || "").trim();
      copy.append(
        el("strong", null, concreteAccountName(selected.name, identity.accountName, identity.account_name, identity.nickname, identity.nick_name) || "已登录抖音账号"),
        el("span", null, handle ? (handle.startsWith("@") ? handle : `@${handle}`) : "已完成授权")
      );
      accountRow.append(avatar, copy);
      if (accounts.length > 1) {
        const select = document.createElement("select");
        select.className = "sb-as-inbox-account-select";
        select.setAttribute("aria-label", "选择抖音账号");
        accounts.forEach((account) => {
          const option = el("option", null, concreteAccountName(account.name, account.identity?.accountName, account.identity?.account_name, account.identity?.nickname, account.identity?.nick_name) || "已登录抖音账号");
          option.value = account.id;
          select.appendChild(option);
        });
        select.value = selected.id || flow.accountId;
        select.disabled = loading;
        select.addEventListener("change", () => {
          const next = accounts.find((account) => account.id === select.value);
          flow.accountId = next?.id || "";
          flow.account = next?.name || "";
          flow.accountIdentity = next?.identity || null;
          flow.executionAgentId = next?.agentId || flow.agentId;
          flow.accountWorkKey = douyinAccountWorkKey(flow.accountIdentity, flow.accountId);
          flow.accountUnavailable = false;
          flow.inboxTaskId = "";
          flow.inboxTaskRunId = "";
          flow.inboxConversationId = "";
          flow.startRequestId = "";
          flow.inboxTakeoverOwnerAgentId = "";
          flow.reception = managerInbox ? undefined : null;
          restoreAccountScopedAcquisitionDraft(flow, undefined, { reset: true });
          invalidateInboxPlan(flow);
          if (!managerInbox) void loadAccountReception(flow);
        });
        accountRow.appendChild(select);
      }
      const reauthorize = el("button", "sb-as-inbox-reauthorize", flow.authorizing ? "正在打开登录…" : "添加账号");
      reauthorize.type = "button";
      reauthorize.disabled = Boolean(flow.authorizing);
      reauthorize.addEventListener("click", () => startMcpAuthorization(flow, { addAccount: true }));
      accountRow.appendChild(reauthorize);
      accountSection.appendChild(accountRow);
    } else {
      accountSection.appendChild(el("p", "sb-as-inbox-login-copy", flow.loadingAccounts
        ? "正在查看已登录的抖音账号。"
        : accountUnavailable
          ? "之前绑定的抖音账号当前不可用。重新连接原账号后才能继续；系统不会自动改用其他账号。"
          : "登录后，我只会在这个账号里读取和回复私信。"));
      const login = el("button", "sb-as-inbox-login", flow.authorizing ? "正在打开登录…" : accountUnavailable ? "重新连接原账号" : "登录抖音账号");
      login.type = "button";
      login.disabled = Boolean(flow.authorizing);
      login.addEventListener("click", () => startMcpAuthorization(flow));
      accountSection.appendChild(login);
    }
    if (flow.authorizing || ["starting", "opening", "waiting_login"].includes(flow.authPhase)) accountSection.appendChild(buildCloudAuthorizationStatus(flow));
    if (flow.authError) accountSection.appendChild(el("div", "sb-as-use-notice is-error sb-as-inbox-error", flow.authError));
    flowRoot.appendChild(accountSection);

    if (!managerInbox && Array.isArray(flow.focusTargets) && flow.focusTargets.length) {
      const targets = el("section", "sb-as-inbox-section sb-as-inbox-target");
      const head = el("div", "sb-as-inbox-section-head");
      const title = el("div", "sb-as-inbox-section-title");
      title.append(
        el("strong", null, "已识别已触达用户"),
        el("span", null, "这些用户已经完成首轮触达；启动后，私信客服会优先承接他们的新消息。")
      );
      head.append(title, el("span", "sb-as-inbox-section-status is-ready", `${flow.focusTargets.length} 位`));
      targets.appendChild(head);
      flowRoot.appendChild(targets);
    }

    if (managerInbox) {
      const automationSection = el("section", "sb-as-inbox-section sb-as-inbox-auto-context");
      const automationHead = el("div", "sb-as-inbox-section-head");
      const automationTitle = el("div", "sb-as-inbox-section-title");
      automationTitle.append(
        el("strong", null, "2. 后台自动识别账号定位和潜客"),
        el("span", null, "无需填写目标人群或首条话术，后台会根据账号资料和新互动实时判断。")
      );
      const automationStatus = el("span", "sb-as-inbox-section-status is-ready");
      automationStatus.append(el("i"), el("span", null, "后台托管"));
      automationHead.append(automationTitle, automationStatus);
      automationSection.appendChild(automationHead);
      automationSection.appendChild(el("p", "sb-as-inbox-auto-context-copy", `${DOUYIN_AUTO_AUDIENCE_GOAL}。分析时会结合每条评论、直播互动和账号互动证据，自动生成有依据的首次私信。`));
      flowRoot.appendChild(automationSection);
    }

    const policySection = el("section", "sb-as-inbox-section sb-as-inbox-policy");
    const policyHead = el("div", "sb-as-inbox-section-head");
    const policyTitle = el("div", "sb-as-inbox-section-title");
    policyTitle.append(
      el("strong", null, managerInbox ? "3. 告诉我怎么回复" : "2. 告诉我怎么回复"),
      el("span", null, managerInbox
        ? "只需填写希望通过私信达成的目标，回复方式、提问顺序、推进节奏和人工边界由 AI 自动设计。"
        : "高级策略会保存在这个账号上，后续回复会直接使用。")
    );
    const policyStatus = el("span", `sb-as-inbox-section-status ${strategyReady ? "is-ready" : ""}`);
    policyStatus.append(el("i"), el("span", null,
      managerInbox
        ? flow.planLoading
          ? "正在设计"
          : hasObjective
            ? "已填写"
            : hasAccount ? "待填写" : "等待登录"
        : flow.receptionLoading || businessKnowledgePending
        ? "正在读取"
        : !hasReception
          ? hasAccount ? "待设置" : "等待登录"
          : hasBusinessKnowledge
            ? "已保存"
            : "待补资料"
    ));
    policyHead.append(policyTitle, policyStatus);
    policySection.appendChild(policyHead);
    if (!hasAccount) {
      policySection.appendChild(el("p", "sb-as-inbox-policy-empty", managerInbox
        ? "登录账号后，只需填写希望通过私信达成的目标。"
        : "登录账号后，就可以在这里设置回复的人设、目标、业务资料和需要交给你的情况。"));
    } else if (managerInbox) {
      appendGoalFirstComposer(policySection, flow, "你想让我帮你达成什么？");
    } else {
      flow.receptionEditor?.page?.close?.();
      const host = el("div", "sb-as-inbox-policy-editor");
      let receptionPage = null;
      const syncReception = (record) => {
        flow.reception = record;
        flow.businessKnowledge = record.settings.knowledge;
        flow.replyRule = record.settings.answerRules;
        flow.replyTone = receptionResponseStyle(record.settings);
        flow.replyObjective = receptionGoalObjective(record.settings);
        flow.handoffRules = "要求人工、投诉退款、无法确认的事实";
        // The listener's first-touch executor consumes these canonical fields,
        // while the account reception service keeps the same conversation rules.
        flow.replyStyle = flow.replyTone;
        flow.handoffBoundary = flow.handoffRules;
      };
      receptionPage = openAccountReceptionPage({
        getAccounts: () => inboxReceptionProfiles(flow),
        initialAccountId: accountId,
        embeddedContainer: host,
        onLoaded: (record) => {
          if (state.useFlow !== flow) return;
          syncReception(record);
        },
        onSaved: (record) => {
          if (state.useFlow !== flow) return;
          syncReception(record);
          flow.fieldErrors = {};
          invalidateInboxPlan(flow);
          receptionPage?.close?.();
          if (flow.receptionEditor?.page === receptionPage) flow.receptionEditor = null;
          render();
        }
      });
      flow.receptionEditor = { host, page: receptionPage };
      policySection.appendChild(host);
    }
    flowRoot.appendChild(policySection);

    const launch = el("section", "sb-as-inbox-launch");
    const launchCopy = el("div", "sb-as-inbox-launch-copy");
    const launchDescription = flow.planLoading
      ? "正在检查回复规则并启动任务，请稍候。"
      : flow.starting
        ? "正在启动，确认后会自动进入实时工作。"
        : !hasAccount
          ? accountUnavailable ? "请重新连接原账号后再继续，避免任务错误地使用其他账号。" : "先登录抖音账号，再开始托管。"
        : managerInbox && !hasObjective
          ? "填写一个目标，AI 会自动设计后续对话。"
          : !managerInbox && !hasReception
            ? "先保存回复的人设、转化结果和人工接管边界。"
            : !managerInbox && businessKnowledgePending
              ? "正在读取业务资料，读取完成后才能启动。"
              : !managerInbox && !hasBusinessKnowledge
                ? "先补充业务资料，避免自动回复不准确或无法确认的信息。"
                : flow.inboxTakeoverOwnerAgentId
                  ? `该账号正在由${displayAgentName(getMarketplaceAgent(flow.inboxTakeoverOwnerAgentId) || { id: flow.inboxTakeoverOwnerAgentId, name: "另一个 Agent" })}承接。确认后会停止原承接并切换到当前 Agent。`
                  : startsCompleteManager
                    ? "会同时启动持续监听、首次触达与后续私信承接。"
                    : "启动后，我会持续接待新私信；你可以随时暂停或调整设置。";
    launchCopy.append(el("strong", null, managerInbox ? "4. 启动完整获客任务" : "3. 开始托管"), el("span", null, launchDescription));
    const start = el("button", null, flow.starting || flow.planLoading ? "正在启动…" : flow.inboxTakeoverOwnerAgentId ? "确认切换并启动" : startsCompleteManager ? "启动获客专家" : managerInbox ? "开始私信承接" : "立即启动托管");
    start.type = "button";
    start.disabled = !hasAccount || !strategyReady || loading || blockingPlan;
    if (!managerInbox && !hasBusinessKnowledge && hasReception) start.title = "请先补充业务资料，避免自动回复不准确";
    start.addEventListener("click", () => {
      const activeAgent = getMarketplaceAgent(state.useId);
      if (isInboxIntakeFlow(activeAgent, flow)) {
        void Promise.resolve(startInboxIntake(activeAgent, flow, { takeover: Boolean(flow.inboxTakeoverOwnerAgentId) })).catch((error) => {
          if (state.view !== "use" || state.useFlow !== flow) return;
          flow.starting = false;
          flow.planLoading = false;
          flow.step = "setup";
          flow.startError = error?.message || "启动获客任务失败，请稍后重试。";
          render();
        });
      }
      else startUse(activeAgent);
    });
    launch.append(launchCopy, start);
    flowRoot.appendChild(launch);
    if (flow.setupError || flow.planError || flow.startError) {
      flowRoot.appendChild(el("div", "sb-as-use-notice is-error sb-as-inbox-error", flow.setupError || flow.planError || flow.startError));
    }

    panel.appendChild(flowRoot);
  }

  function renderInboxStarting(panel, flow) {
    const title = isCommentAcquisitionAgent({ id: flow.agentId }) ? "正在开启私信承接" : "正在开启自动回复";
    panel.append(
      el("div", "sb-as-use-panel-title", title),
      el("div", "sb-as-use-panel-copy", flow.account || "正在连接账号")
    );
    const status = el("div", "sb-as-inbox-planning");
    const copy = el("div");
    copy.append(el("strong", null, "正在连接私信…"));
    status.append(el("i"), copy);
    panel.appendChild(status);
    if (flow.startError) panel.appendChild(el("div", "sb-as-use-notice is-error", flow.startError));
  }

  function renderInboxRunning(panel, flow) {
    const failed = Boolean(flow.error);
    const failureMessage = flow.error?.message || (flow.error ? String(flow.error) : "");
    const runtime = flow.runtime || {};
    const acceptedButStarting = flow.startAcceptedState === "accepted" && runtime?.running !== true;
    const listening = !failed && flow.running && !acceptedButStarting;
    const pollCount = Number(runtime.pollCount || 0);
    const managerInbox = isCommentAcquisitionAgent({ id: flow.agentId });
    panel.append(
      el("div", "sb-as-use-panel-title", failed ? "私信承接未完成" : listening ? managerInbox ? "获客管家正在承接私信" : "私信承接运行中" : "正在启动私信承接"),
      el("div", "sb-as-use-panel-copy", failed ? failureMessage : "后台会持续拉取新私信并按承接策略自动回复；命中边界的会话会停止自动回复并交给人工。")
    );
    const meta = el("div", "sb-as-use-progress-meta");
    meta.append(el("span", null, listening ? `实时监听中 · 已轮询 ${pollCount} 次` : "连接 MCP 私信模块"), el("span", null, listening ? "等待真实事件" : "等待回执"));
    panel.appendChild(meta);
    const checks = el("div", "sb-as-use-checklist");
    ["启动私信承接模块", "持续拉取新会话", "过滤自身发送消息", "按策略自动回复，边界情况转人工"].forEach((label, index) => {
      const row = el("div", `sb-as-use-check${flow.checks[index] ? " is-done" : ""}`);
      row.append(el("i", null, flow.checks[index] ? "✓" : "·"), el("span", null, label));
      checks.appendChild(row);
    });
    panel.appendChild(checks);
    if (flow.messages?.length) {
      const feed = el("div", "sb-as-use-live-feed");
      flow.messages.slice(0, 10).forEach((message) => {
        const item = el("div", "sb-as-use-live-item");
        item.append(el("i"));
        const copy = el("div");
        copy.append(el("strong", null, message.nickname || "抖音用户"), el("span", null, message.content || "（无文本内容）"));
        item.append(copy, el("span", null, message.status === "sent" ? "已自动回复" : message.status === "handoff" ? "已转人工" : "处理中"));
        feed.appendChild(item);
      });
      panel.appendChild(feed);
    } else if (!failed && listening) {
      panel.appendChild(el("div", "sb-as-use-notice", "暂未读取到新私信。承接 Agent 会在下一轮轮询中继续监听。"));
    }
    if (!failed && flow.statusSyncWarning) {
      panel.appendChild(el("div", "sb-as-use-notice", flow.statusSyncWarning));
    }
    const handoffs = (Array.isArray(flow.messages) ? flow.messages : []).filter((message) => message.status === "handoff");
    if (handoffs.length) {
      const drafts = el("div", "sb-as-outreach");
      drafts.appendChild(el("div", "sb-as-outreach-title", "需要人工接管的会话"));
      const list = el("div", "sb-as-outreach-list");
      handoffs.slice(-10).forEach((message) => {
        const item = el("div", "sb-as-outreach-item");
        const copy = el("div", "sb-as-outreach-item-copy");
        copy.append(
          el("div", "sb-as-outreach-item-name", message.nickname || "抖音用户"),
          el("p", null, `用户：${message.content || ""}`),
          el("p", null, `接管原因：${message.handoffReason || "命中人工接管边界"}`)
        );
        item.append(copy, el("span", "sb-as-provider-extra", "已停止自动回复"));
        list.appendChild(item);
      });
      drafts.appendChild(list);
      panel.appendChild(drafts);
    }
    if (failed) {
      const actions = el("div", "sb-as-use-actions");
      const retry = el("button", "primary", "重新连接");
      retry.type = "button";
      retry.addEventListener("click", () => { flow.error = null; startUse(getMarketplaceAgent(state.useId)); });
      actions.appendChild(retry);
      panel.appendChild(actions);
    } else {
      const actions = el("div", "sb-as-use-actions");
      if (flow.agentId === GOLD_CUSTOMER_SERVICE_AGENT_ID) {
        const tune = el("button", null, "调整承接目标");
        tune.type = "button";
        tune.addEventListener("click", () => onChat?.({
          agentId: flow.agentId,
          accountId: flow.accountId || null,
          taskId: flow.taskId || null,
          taskRunId: flow.taskRunId || null
        }));
        actions.appendChild(tune);
      }
      const realtime = el("button", null, "查看实时工作");
      realtime.type = "button";
      realtime.addEventListener("click", () => globalThis.__SALEBUDDY__?.navFrameworkReady?.then?.((framework) => framework?.openRealtimeWork?.({ selectedAgentId: flow.agentId, accountId: flow.accountId || null })));
      actions.appendChild(realtime);
      panel.appendChild(actions);
    }
  }

  function specialistFirstText(...values) {
    for (const value of values) {
      if (value == null || typeof value === "object") continue;
      const text = String(value).trim();
      if (text) return text;
    }
    return "";
  }

  function specialistItemId(item = {}, index = 0, prefix = "item") {
    return `${prefix}:${specialistFirstText(
      item.messageId,
      item.message_id,
      item.sourceRecordId,
      item.recordId,
      item.leadId,
      item.secUid,
      item.sec_uid,
      item.secId,
      item.sec_id,
      item.id,
      item.profileUrl,
      item.profile_url,
      item.uniqueId,
      item.nickname,
      item.name
    ) || index}`;
  }

  function specialistPersonName(item = {}) {
    return specialistFirstText(item.nickname, item.name, item.account, item.uniqueId, item.handle) || "抖音用户";
  }

  function specialistSourceScopeLabel(scope) {
    const value = String(scope || "").trim();
    if (["authorized_account_all_signals", "own_account_all_signals"].includes(value)) return "新增评论、直播互动和账号互动通知";
    if (["authorized_account_live", "own_account_live"].includes(value)) return "直播间互动";
    if (["authorized_account_comments", "own_account_comments"].includes(value)) return "作品评论";
    if (["authorized_account_interactions", "own_account_interactions"].includes(value)) return "账号互动";
    if (value === "own_inbox") return "私信沉淀";
    return "";
  }

  function specialistSourceLabel(item = {}, fallback = "来源已保留") {
    const source = item.source && typeof item.source === "object" ? item.source : {};
    return specialistFirstText(
      specialistSourceScopeLabel(item.sourceScope || source.sourceScope || source.scope),
      source.type,
      source.label,
      item.sourceType,
      item.sourceLabel,
      item.origin,
      fallback
    );
  }

  function specialistEvidence(item = {}) {
    const source = item.source && typeof item.source === "object" ? item.source : {};
    const evidence = Array.isArray(item.evidence) ? item.evidence : [];
    const firstEvidence = evidence.find((entry) => entry && typeof entry === "object") || {};
    return specialistFirstText(
      firstEvidence.quote,
      firstEvidence.text,
      firstEvidence.content,
      item.quote,
      item.text,
      item.comment,
      item.content,
      item.message,
      source.quote,
      item.reason
    );
  }

  function specialistTierLabel(item = {}) {
    const tier = String(item.intent?.tier || item.tier || item.intentTier || "").trim().toLowerCase();
    if (["high", "重点对象", "高意向"].includes(tier)) return "重点对象";
    if (["medium", "待确认", "中意向"].includes(tier)) return "待确认";
    if (["low", "一般对象", "低意向"].includes(tier)) return "暂不跟进";
    return "待判断";
  }

  function specialistTargetState(item = {}) {
    const state = String(item.status || item.state || "").trim().toLowerCase();
    if (String(item.conversationMode || "").toLowerCase() === "human" || state === "human") return { label: "人工处理中", tone: "is-success" };
    if (state === "human_sent") return { label: "已发送", tone: "is-success" };
    if (["sent", "delivered", "success", "succeeded", "completed"].includes(state)) return { label: "已发送", tone: "is-success" };
    if (["sending", "processing", "running"].includes(state)) return { label: "发送中", tone: "" };
    if (["unknown", "pending", "queued", "submitted"].includes(state)) return { label: "等待回执", tone: "" };
    if (["duplicate", "skipped"].includes(state)) return { label: "已跳过", tone: "" };
    if (["error", "failed", "failure"].includes(state)) return { label: "执行异常", tone: "is-error" };
    if (state === "handoff") return { label: "待人工接管", tone: "is-error" };
    if (state === "received") return { label: "待承接", tone: "" };
    return { label: "待处理", tone: "" };
  }

  function specialistSelectedItem(flow, entries, prefix) {
    const selectedId = String(flow.specialistSelectedId || "");
    const selected = entries.find((item, index) => specialistItemId(item, index, prefix) === selectedId);
    if (selected) return selected;
    const first = entries[0] || null;
    if (first) flow.specialistSelectedId = specialistItemId(first, 0, prefix);
    return first;
  }

  function createSpecialistWorksite(panel, { title, subtitle, status, tone = "" }) {
    const worksite = el("section", "sb-as-specialist-worksite");
    const head = el("header", "sb-as-specialist-worksite-head");
    const copy = el("div", "sb-as-specialist-worksite-title");
    copy.append(el("strong", null, title), el("span", null, subtitle));
    const state = el("span", `sb-as-specialist-status${tone ? ` ${tone}` : ""}`);
    state.append(el("i"), el("span", null, status));
    head.append(copy, state);
    const grid = el("div", "sb-as-specialist-worksite-grid");
    const source = el("aside", "sb-as-specialist-source");
    const queue = el("section", "sb-as-specialist-queue");
    const detail = el("aside", "sb-as-specialist-detail");
    grid.append(source, queue, detail);
    worksite.append(head, grid);
    panel.appendChild(worksite);
    return { source, queue, detail };
  }

  function specialistColumnHead(parent, title, meta = "") {
    const head = el("div", "sb-as-specialist-column-head");
    head.append(el("strong", null, title));
    if (meta) head.appendChild(el("span", null, meta));
    parent.appendChild(head);
  }

  function specialistSourceItem(parent, label, value) {
    if (!value) return;
    const item = el("div", "sb-as-specialist-source-item");
    item.append(el("strong", null, label), el("span", null, value));
    parent.appendChild(item);
  }

  function specialistFact(parent, label, value, evidence = false) {
    const item = el("div", `sb-as-specialist-fact${evidence ? " is-evidence" : ""}`);
    item.append(el("strong", null, label), el("span", null, value || "暂未返回"));
    parent.appendChild(item);
  }

  function specialistRow(item, index, prefix, selectedId, meta, onSelect) {
    const id = specialistItemId(item, index, prefix);
    const row = el("button", `sb-as-specialist-row${id === selectedId ? " is-selected" : ""}`);
    row.type = "button";
    const copy = el("span", "sb-as-specialist-row-copy");
    copy.append(
      el("strong", null, specialistPersonName(item)),
      el("span", null, specialistEvidence(item) || "来源信息已保留，等待补充内容")
    );
    const metaNode = el("span", `sb-as-specialist-row-meta${meta?.tone ? ` ${meta.tone}` : ""}`, meta?.label || "");
    row.append(copy, metaNode);
    row.addEventListener("click", () => onSelect(id));
    return row;
  }

  function specialistEmpty(parent, message) {
    parent.appendChild(el("div", "sb-as-specialist-empty", message));
  }

  function specialistResultsAction(parent, label = "查看成果中心") {
    const button = el("button", "primary", label);
    button.type = "button";
    button.addEventListener("click", openProspectSelectionForOutreach);
    parent.appendChild(button);
  }

  function inboxTargetPayload(flow, selected) {
    return {
      agentId: authorizationAgentId(flow),
      accountId: flow.accountId || "",
      conversationId: selected?.conversationId || "",
      nickname: selected?.nickname || "",
      secUid: selected?.secUid || "",
      secId: selected?.secId || ""
    };
  }

  function updateInboxConversationMessage(flow, selected, patch) {
    const messageId = selected?.messageId || selected?.id || "";
    flow.messages = (Array.isArray(flow.messages) ? flow.messages : []).map((message) => {
      const currentId = message?.messageId || message?.id || "";
      return currentId && currentId === messageId ? { ...message, ...patch } : message;
    });
  }

  async function controlInboxConversation(flow, selected, action) {
    if (!selected || flow.inboxActionInFlight) return;
    if (!selected.conversationId && !selected.nickname && !selected.secUid && !selected.secId) {
      flow.inboxActionError = "平台没有返回可确认的会话标识，已阻止操作。";
      render();
      return;
    }
    flow.inboxActionInFlight = true;
    flow.inboxActionError = "";
    render();
    try {
      const result = await douyinMcpCall("POST", "/v1/douyin/inbox-agent/conversation/control", {
        ...inboxTargetPayload(flow, selected),
        action,
        reason: action === "takeover" ? "用户主动转人工" : "用户恢复 AI 接管"
      }, 30000);
      const conversation = result?.conversation || {};
      updateInboxConversationMessage(flow, selected, {
        conversationMode: result?.mode || conversation.mode || (action === "takeover" ? "human" : "auto"),
        conversationHistory: Array.isArray(conversation.history) ? conversation.history : selected.conversationHistory || [],
        handoffReason: conversation.handoffReason || selected.handoffReason || "",
        handoffAt: conversation.handoffAt || selected.handoffAt || "",
        status: action === "takeover" ? "human" : selected.status === "human" ? "received" : selected.status
      });
      pushActivity(flow.agentId || "mkt-gold-customer-service", action === "takeover" ? "已接管当前私信，AI 将停止自动回复。" : "已恢复 AI 接管当前私信。");
    } catch (error) {
      flow.inboxActionError = error?.message || "会话状态更新失败，请稍后重试。";
    } finally {
      flow.inboxActionInFlight = false;
      render();
    }
  }

  async function sendHumanInboxMessage(flow, selected, textarea) {
    const content = String(textarea?.value || "").trim();
    if (!selected || !content || flow.inboxActionInFlight) return;
    if (!selected.conversationId && !selected.nickname && !selected.secUid && !selected.secId) {
      flow.inboxActionError = "平台没有返回可确认的会话标识，已阻止发送。";
      render();
      return;
    }
    flow.inboxDraftText = content;
    flow.inboxActionInFlight = true;
    flow.inboxActionError = "";
    render();
    const draftFingerprint = `${selected.messageId || selected.id || selected.conversationId || selected.secUid || selected.secId}:${content}`;
    if (flow.inboxDraftFingerprint !== draftFingerprint) {
      flow.inboxDraftFingerprint = draftFingerprint;
      flow.inboxDraftMessageId = `ui-human:${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
    const clientMessageId = flow.inboxDraftMessageId;
    try {
      const result = await douyinMcpCall("POST", "/v1/douyin/inbox-agent/conversation/message", {
        ...inboxTargetPayload(flow, selected),
        content,
        clientMessageId,
        reqId: clientMessageId,
        confirm: "SEND"
      }, 120000);
      const conversation = result?.conversation || {};
      updateInboxConversationMessage(flow, selected, {
        conversationMode: "human",
        conversationHistory: Array.isArray(conversation.history) ? conversation.history : selected.conversationHistory || [],
        humanLastSentAt: conversation.humanLastSentAt || selected.humanLastSentAt || "",
        status: "human"
      });
      pushActivity(flow.agentId || "mkt-gold-customer-service", "人工回复已通过抖音云电脑发送。");
      flow.inboxDraftText = "";
      flow.inboxDraftFingerprint = "";
      flow.inboxDraftMessageId = "";
    } catch (error) {
      flow.inboxActionError = error?.message || "人工回复发送失败，请检查云电脑连接后重试。";
    } finally {
      flow.inboxActionInFlight = false;
      render();
    }
  }

  function renderConversationSpecialistWorksite(panel, flow) {
    const failed = Boolean(flow.error);
    const runtime = flow.runtime || {};
    const starting = flow.startAcceptedState === "accepted" && runtime.running !== true;
    const listening = !failed && flow.running && !starting;
    const messages = Array.isArray(flow.messages) ? flow.messages : [];
    const status = failed ? "承接异常" : listening ? "正在监听" : "等待启动";
    const worksite = createSpecialistWorksite(panel, {
      title: "客服转化",
      subtitle: failed ? (flow.error?.message || "私信承接没有完成") : "按已保存的承接策略处理真实私信，边界会话停止自动回复。",
      status,
      tone: failed ? "is-error" : listening ? "is-live" : ""
    });
    specialistColumnHead(worksite.source, "会话队列", messages.length ? `${messages.length} 条` : "等待新私信");
    const conversationRows = el("div", "sb-as-specialist-rows");
    if (messages.length) {
      messages.map((message, index) => ({ message, index })).reverse().forEach(({ message, index }) => {
        const id = specialistItemId(message, index, "conversation");
        const row = specialistRow(message, index, "conversation", flow.specialistSelectedId, specialistTargetState(message), (nextId) => {
          flow.specialistSelectedId = nextId;
          render();
        });
        row.dataset.conversationId = id;
        conversationRows.appendChild(row);
      });
      worksite.source.appendChild(conversationRows);
    } else {
      specialistEmpty(worksite.source, "等待真实私信进入会话");
    }

    const selected = specialistSelectedItem(flow, messages, "conversation");
    specialistColumnHead(worksite.queue, "当前对话", selected ? "真实会话记录" : "暂无会话");
    const conversation = el("div", "sb-as-specialist-conversation");
    if (selected) {
      const person = el("div", "sb-as-specialist-person");
      person.append(el("strong", null, specialistPersonName(selected)), el("span", null, selected.createdAt || selected.time || "时间以平台回传为准"));
      const messagesBox = el("div", "sb-as-specialist-messages");
      const history = Array.isArray(selected.conversationHistory) ? selected.conversationHistory : [];
      if (history.length) {
        history.forEach((entry) => {
          const isUser = entry?.role === "user";
          const isHuman = entry?.role === "human" || entry?.source === "human";
          const bubble = el("div", `sb-as-specialist-message${isUser ? "" : " outbound"}`);
          bubble.append(el("small", null, isUser ? "用户消息" : isHuman ? "人工回复" : "自动回复"), document.createTextNode(entry.content));
          messagesBox.appendChild(bubble);
        });
      } else {
        if (selected.content) {
          const inbound = el("div", "sb-as-specialist-message");
          inbound.append(el("small", null, "用户消息"), document.createTextNode(selected.content));
          messagesBox.appendChild(inbound);
        }
        if (selected.replyContent) {
          const outbound = el("div", "sb-as-specialist-message outbound");
          outbound.append(el("small", null, "自动回复"), document.createTextNode(selected.replyContent));
          messagesBox.appendChild(outbound);
        }
      }
      conversation.append(person, messagesBox);
      const humanMode = String(selected.conversationMode || "").toLowerCase() === "human" || selected.status === "human";
      if (humanMode) {
        conversation.appendChild(el("div", "sb-as-specialist-human-notice", "人工已接管，AI 不会再自动回复此会话。"));
        const composer = el("div", "sb-as-specialist-composer");
        const textarea = el("textarea");
        textarea.placeholder = "输入人工回复...";
        textarea.value = flow.inboxDraftText || "";
        textarea.addEventListener("input", () => { flow.inboxDraftText = textarea.value; });
        textarea.disabled = Boolean(flow.inboxActionInFlight);
        const send = el("button", null, flow.inboxActionInFlight ? "发送中" : "发送");
        send.type = "button";
        send.disabled = Boolean(flow.inboxActionInFlight);
        send.addEventListener("click", () => sendHumanInboxMessage(flow, selected, textarea));
        composer.append(textarea, send);
        conversation.appendChild(composer);
      }
    } else {
      specialistEmpty(conversation, "新会话到达后，会显示平台回传的原始消息与实际回复。");
    }
    worksite.queue.appendChild(conversation);

    specialistColumnHead(worksite.detail, "客户详情");
    if (selected) {
      const facts = el("div", "sb-as-specialist-facts");
      specialistFact(facts, "当前状态", specialistTargetState(selected).label);
      specialistFact(facts, "承接账号", flow.account || flow.accountIdentity?.accountName || flow.accountIdentity?.nickname || "账号信息未返回");
      specialistFact(facts, "会话来源", "私信");
      if (selected.handoffReason) specialistFact(facts, "接管原因", selected.handoffReason);
      if (selected.humanLastSentAt) specialistFact(facts, "最近人工回复", selected.humanLastSentAt);
      if (selected.error) specialistFact(facts, "异常信息", selected.error);
      worksite.detail.appendChild(facts);
    } else {
      specialistEmpty(worksite.detail, "进入会话后，承接状态和人工接管原因会显示在这里。");
    }
    if (flow.statusSyncWarning) worksite.detail.appendChild(el("div", "sb-as-specialist-notice", flow.statusSyncWarning));
    if (flow.inboxActionError) worksite.detail.appendChild(el("div", "sb-as-specialist-notice is-error", flow.inboxActionError));
    const actions = el("div", "sb-as-specialist-actions");
    if (failed) {
      const retry = el("button", "primary", "重新连接");
      retry.type = "button";
      retry.addEventListener("click", () => { flow.error = null; startUse(getMarketplaceAgent(state.useId)); });
      actions.appendChild(retry);
    } else {
      if (selected) {
        const humanMode = String(selected.conversationMode || "").toLowerCase() === "human" || selected.status === "human";
        const handoff = el("button", humanMode ? null : "primary", humanMode ? "恢复 AI 接管" : "转人工处理");
        handoff.type = "button";
        handoff.disabled = Boolean(flow.inboxActionInFlight);
        handoff.addEventListener("click", () => controlInboxConversation(flow, selected, humanMode ? "resume_ai" : "takeover"));
        actions.appendChild(handoff);
      }
      const realtime = el("button", null, "查看实时工作");
      realtime.type = "button";
      realtime.addEventListener("click", () => globalThis.__SALEBUDDY__?.navFrameworkReady?.then?.((framework) => framework?.openRealtimeWork?.({ selectedAgentId: flow.agentId, accountId: flow.accountId || null })));
      actions.appendChild(realtime);
    }
    worksite.detail.appendChild(actions);
  }

  function privateOutreachUsesProspectBoundary(flow) {
    return flow?.agentId === "mkt-cold-writer";
  }

  function privateOutreachMode(flow) {
    return normalizePrivateOutreachMode(flow?.outreachMode);
  }

  function privateOutreachRecordMatchesSender(flow, record = {}) {
    const senderId = String(flow?.accountId || "").trim();
    const senderName = String(flow?.account || "").trim();
    const sourceAccountId = String(record?.source?.accountId || "").trim();
    const sourceAccountName = String(record?.source?.accountName || "").trim();
    if (senderId && sourceAccountId) return senderId === sourceAccountId;
    if (senderName && sourceAccountName) return senderName === sourceAccountName;
    return !senderId && !senderName;
  }

  function privateOutreachRecordAvailable(flow, record = {}) {
    return isContactableRecord(record)
      && isPrivateOutreachRecordCandidate(record, privateOutreachMode(flow))
      && privateOutreachRecordMatchesSender(flow, record);
  }

  function privateOutreachContactedRecords(flow) {
    return privateOutreachRecords(flow).filter((record) => {
      if (!isContactableRecord(record) || !privateOutreachRecordMatchesSender(flow, record)) return false;
      return isAlreadyContactedRecord(record);
    });
  }

  function privateOutreachDefaultMessage() {
    return "你好，看到你关注了新能源车型，想了解更多价格、现车或试驾安排吗？";
  }

  function privateOutreachEntryRecord(entry = {}, flow = state.useFlow) {
    const recordId = entry.recordId || entry.sourceRecordId || "";
    if (!recordId) return null;
    const mockRecords = Array.isArray(flow?.mockProspectRecords) ? flow.mockProspectRecords : [];
    const recipient = leadRecipientId(entry);
    return mockRecords.find((record) => record.id === recordId
      || (entry.profileUrl && record.profileUrl === entry.profileUrl)
      || (recipient && leadRecipientId(record) === recipient))
      || prospectStore.get(recordId);
  }

  function privateOutreachEntrySourceScope(flow, entry = {}) {
    const record = privateOutreachEntryRecord(entry, flow);
    return entry.sourceScope
      || record?.contactability?.sourceScope
      || record?.sourceScope
      || record?.source?.sourceScope
      || flow?.sourceScope
      || "";
  }

  function privateOutreachEntrySourceAccountId(flow, entry = {}) {
    const record = privateOutreachEntryRecord(entry, flow);
    return entry.sourceAccountId || record?.source?.accountId || flow?.sourceAccountId || "";
  }

  function privateOutreachEntrySourceAccountName(flow, entry = {}) {
    const record = privateOutreachEntryRecord(entry, flow);
    return entry.sourceAccountName || record?.source?.accountName || flow?.sourceAccountName || "";
  }

  function privateOutreachMatchesSender(flow, entry = {}) {
    const senderId = String(flow?.accountId || "").trim();
    const senderName = String(flow?.account || "").trim();
    const sourceAccountId = String(privateOutreachEntrySourceAccountId(flow, entry) || "").trim();
    const sourceAccountName = String(privateOutreachEntrySourceAccountName(flow, entry) || "").trim();
    if (senderId && sourceAccountId) return senderId === sourceAccountId;
    if (senderName && sourceAccountName) return senderName === sourceAccountName;
    return !senderId && !senderName;
  }

  function privateOutreachEntryIsAllowed(flow, entry = {}) {
    const record = privateOutreachEntryRecord(entry, flow);
    if (!record?.id || !leadRecipientId(record)) return false;
    if (!privateOutreachRecordAvailable(flow, record)) return false;
    const scope = privateOutreachEntrySourceScope(flow, entry);
    if (!contactabilityFor({ sourceScope: scope }).allowed) return false;
    return privateOutreachMatchesSender(flow, entry);
  }

  function privateOutreachReadyEntries(flow) {
    return (Array.isArray(flow?.targetEntries) ? flow.targetEntries : [])
      .filter((entry) => entry?.status === "ready" && privateOutreachEntryIsAllowed(flow, entry));
  }

  function awaitingIntentAnalysis(record = {}) {
    const tier = String(record.tier || record.intent?.tier || "unknown").toLowerCase();
    return record?.status === "待分析" || (record?.source?.agentId === "mkt-find-people" && !record?.intent && tier === "unknown");
  }

  function privateOutreachEntryFromProspect(record = {}) {
    const recipient = leadRecipientId(record);
    return {
      id: record.id,
      recordId: record.id,
      nickname: record.name || "抖音用户",
      avatar: record.avatar || "",
      handle: record.handle || "",
      profileUrl: record.profileUrl || "",
      secId: recipient || "",
      secUid: recipient || "",
      quote: record.evidence?.[0]?.quote || record.profile || "",
      reason: record.reason || "",
      sourceScope: record.contactability?.sourceScope || record.sourceScope || record.source?.sourceScope || "",
      sourceAccountId: record.source?.accountId || "",
      sourceAccountName: record.source?.accountName || "",
      status: recipient ? "ready" : "pending",
      error: recipient ? null : "该用户缺少可触达的抖音身份"
    };
  }

  function prefillPrivateOutreachFromProspects(flow) {
    if (flow.prefilledFromResult) return;
    const accountId = String(flow?.accountId || "").trim();
    const accountName = String(flow?.account || "").trim();
    if (!accountId && !accountName) return;
    const accountKey = `${accountId}::${accountName}`;
    if (flow.autoPrefilledAccountKey === accountKey) return;
    if (flow.autoPrefilledFromProspects) {
      flow.targetEntries = [];
      flow.targetProfileUrls = [];
      flow.targetInput = "";
    }
    if (flow.targetEntries?.length) return;
    const records = privateOutreachRecords(flow);
    const targets = records
      .filter((record) => {
        if (!isContactableRecord(record) || !isPrivateOutreachRecordCandidate(record, privateOutreachMode(flow))) return false;
        const sourceAccountId = String(record.source?.accountId || "").trim();
        const sourceAccountName = String(record.source?.accountName || "").trim();
        if (accountId && sourceAccountId) return accountId === sourceAccountId;
        if (accountName && sourceAccountName) return accountName === sourceAccountName;
        return !accountId && !accountName;
      })
      .map(privateOutreachEntryFromProspect)
      .filter((entry) => entry.status === "ready");
    flow.autoPrefilledFromProspects = true;
    flow.autoPrefilledAccountKey = accountKey;
    if (!targets.length) return;
    flow.targetEntries = targets;
    flow.targetProfileUrls = targets.map((entry) => entry.profileUrl).filter(Boolean);
    flow.targetInput = flow.targetProfileUrls.join("\n");
    flow.source = privateOutreachMode(flow) === PRIVATE_OUTREACH_MODES.ALL_FOUND
      ? "找客专员已找到的可触达用户"
      : "客户分析员已筛出的待确认触达潜客";
    flow.sourceTaskTitle = privateOutreachMode(flow) === PRIVATE_OUTREACH_MODES.ALL_FOUND
      ? "找客专员 · 可触达用户"
      : "客户分析员 · 待确认触达潜客";
    flow.sourceResultType = "潜客";
    flow.sourceScope = targets[0]?.sourceScope || "";
    flow.sourceAccountId = targets[0]?.sourceAccountId || "";
    flow.sourceAccountName = targets[0]?.sourceAccountName || "";
  }

  function prefillInboxFromTouchedProspects(flow) {
    if (flow.prefilledFromResult || flow.autoPrefilledFromProspects || flow.focusTargets?.length || flow.targetEntries?.length) return;
    const records = typeof prospectStore?.list === "function" ? prospectStore.list() : [];
    const targets = records
      .filter((record) => isContactableRecord(record) && record.status === "已触达")
      .map((record) => {
        const recipient = leadRecipientId(record);
        return {
          recordId: record.id,
          nickname: record.name || "抖音用户",
          avatar: record.avatar || "",
          profileUrl: record.profileUrl || "",
          secId: recipient || "",
          secUid: recipient || "",
          status: recipient ? "ready" : "pending",
          error: recipient ? null : "该用户缺少可匹配的抖音身份"
        };
      })
      .filter((entry) => entry.status === "ready");
    if (!targets.length) return;
    flow.focusTargets = targets;
    flow.targetEntries = targets;
    flow.source = "潜客触达专员已触达用户";
    flow.sourceTaskTitle = "潜客触达专员 · 已触达用户";
    flow.autoPrefilledFromProspects = true;
  }

  function privateOutreachSourceLabel(flow) {
    if (privateOutreachMode(flow) === PRIVATE_OUTREACH_MODES.ALL_FOUND) return "当前账号找到的可触达用户";
    const scope = privateOutreachEntrySourceScope(flow, privateOutreachReadyEntries(flow)[0] || {});
    if (scope === "own_account_all_signals") return "本账号新增评论、直播互动和账号互动中找到的潜客";
    if (scope === "own_account_comments") return "本账号评论区找到的潜客";
    if (scope === "own_account_live") return "本账号直播互动中找到的潜客";
    if (scope === "own_account_interactions") return "本账号互动中找到的潜客";
    if (scope === "own_inbox") return "本账号私信中沉淀的潜客";
    return flow?.sourceTaskTitle || flow?.source || "成果中心待确认触达潜客";
  }

  function openProspectSelectionForOutreach() {
    void globalThis.__SALEBUDDY__?.navFrameworkReady?.then?.((framework) => framework?.openProspects?.());
  }

  function openFinderForDependency() {
    const finder = getMarketplaceAgent("mkt-find-people");
    if (finder) openUseFlow(finder);
  }

  function renderPrivateOutreachSetup(panel, flow) {
    prefillPrivateOutreachFromProspects(flow);
    const mode = privateOutreachMode(flow);
    const inlineProspectOutreach = flow.inlineProspectOutreach === true && mode === PRIVATE_OUTREACH_MODES.PROSPECTS;
    const setup = el("div", "sb-as-private-setup");
    const accountStage = el("section", "sb-as-private-source sb-as-private-stage");
    const accountHead = el("div", "sb-as-private-source-head");
    const accountCopy = el("div");
    accountCopy.append(
      el("div", "sb-as-private-source-title", "用哪个抖音账号发送"),
      el("div", "sb-as-private-source-copy", "选择发送账号后，系统只会展示这个账号自己找到、且当前仍可触达的用户。")
    );
    accountHead.appendChild(accountCopy);
    accountStage.append(accountHead, acquisitionAccountControl(flow, () => render()));
    setup.appendChild(accountStage);

    if (!inlineProspectOutreach) {
      const modeStage = el("section", "sb-as-private-source sb-as-private-stage");
      const modeHead = el("div", "sb-as-private-source-head");
      const modeCopy = el("div");
      modeCopy.append(
        el("div", "sb-as-private-source-title", "选择触达方式"),
        el("div", "sb-as-private-source-copy", "两种方式都不会重复触达已发送、触达中、已回复或已留资的用户。")
      );
      modeHead.appendChild(modeCopy);
      const modeOptions = el("div", "sb-as-private-mode-options");
      [
        [PRIVATE_OUTREACH_MODES.PROSPECTS, "触达潜客", "只触达客户分析员确认过的待确认触达潜客"],
        [PRIVATE_OUTREACH_MODES.ALL_FOUND, "触达所有找到的人", "从当前账号找到的可触达用户中灵活选择"]
      ].forEach(([value, label, description]) => {
        const option = el("button", `sb-as-private-mode-option${mode === value ? " is-selected" : ""}`);
        option.type = "button";
        option.setAttribute("aria-pressed", String(mode === value));
        option.append(el("strong", null, label), el("span", null, description));
        option.addEventListener("click", () => {
          if (privateOutreachMode(flow) === value) return;
          flow.outreachMode = value;
          flow.targetEntries = [];
          flow.targetProfileUrls = [];
          flow.targetInput = "";
          flow.prefilledFromResult = false;
          flow.autoPrefilledFromProspects = false;
          flow.autoPrefilledAccountKey = "";
          flow.targetResolveError = null;
          render();
        });
        modeOptions.appendChild(option);
      });
      modeStage.append(modeHead, modeOptions);
      setup.appendChild(modeStage);
    }

    if (inlineProspectOutreach) {
      const basis = el("section", "sb-as-private-source sb-as-private-stage sb-as-private-prospect-basis");
      const basisHead = el("div", "sb-as-private-source-head");
      const basisCopy = el("div");
      basisCopy.append(
        el("div", "sb-as-private-source-title", "为什么可以直接触达"),
        el("div", "sb-as-private-source-copy", "这位用户来自找客专员发现的互动对象，客户分析员已经根据互动内容确认其为潜客，并保留了来源和判断依据。")
      );
      basisHead.appendChild(basisCopy);
      const chain = el("div", "sb-as-private-prospect-chain");
      ["找客专员发现用户", "客户分析员确认潜客", "潜客触达专员首轮联系"].forEach((label, index) => {
        const item = el("span", null, label);
        if (index < 2) item.appendChild(el("i", null, "→"));
        chain.appendChild(item);
      });
      basis.append(basisHead, chain);
      setup.appendChild(basis);
    }

    if (flow.authorizing || ["starting", "opening", "waiting_login"].includes(flow.authPhase)) setup.appendChild(buildCloudAuthorizationStatus(flow));
    if (flow.authError) setup.appendChild(el("div", "sb-as-use-notice is-error", flow.authError));
    if (flow.mockPreview) {
      const mockNotice = el("div", "sb-as-use-notice sb-as-private-mock-notice", inlineProspectOutreach
        ? "MOCK 预览：这位潜客会直接进入首轮私信触达，发送动作不会调用抖音，也不会产生真实私信。"
        : "MOCK 预览：下面会完整展示两种触达方式、发送私信和查看触达结果，发送动作不会调用抖音，也不会产生真实私信。");
      const capabilitySteps = el("div", "sb-as-private-mock-flow");
      (inlineProspectOutreach
        ? ["1 确认潜客来源", "2 直接触达", "3 查看实时结果"]
        : ["1 选择触达方式", "2 一键触达", "3 查看实时结果"]
      ).forEach((label) => capabilitySteps.appendChild(el("span", null, label)));
      setup.append(mockNotice, capabilitySteps);
    }

    if (!flow.authorizedAccounts?.length) {
      const notice = el("div", "sb-as-private-source sb-as-private-empty");
      notice.append(
        el("strong", null, flow.loadingAccounts ? "正在确认已登录账号" : "先连接一个抖音账号"),
        el("p", null, inlineProspectOutreach
          ? "账号连接成功后，系统会使用该潜客所属的来源账号发送首轮私信；发送前仍会再次核对账号和用户状态。"
          : "账号连接成功后，系统会按你选择的方式读取可触达对象；发送前仍会再次核对账号和用户状态。")
      );
      setup.appendChild(notice);
      panel.appendChild(setup);
      return;
    }

    const allEntries = Array.isArray(flow.targetEntries) ? flow.targetEntries : [];
    const ready = privateOutreachReadyEntries(flow);
    const source = el("section", "sb-as-private-source sb-as-private-stage");
    const sourceHead = el("div", "sb-as-private-source-head");
    const sourceCopy = el("div");
    sourceCopy.append(
      el("div", "sb-as-private-source-title", inlineProspectOutreach ? "本次直接触达这位潜客" : mode === PRIVATE_OUTREACH_MODES.ALL_FOUND ? "这次触达哪些找到的人" : "这次触达哪些潜客"),
      el("div", "sb-as-private-source-copy", mode === PRIVATE_OUTREACH_MODES.ALL_FOUND
        ? "系统已按当前账号筛出所有尚未触达的找到的人，你可以按这次需求自由勾选。"
        : inlineProspectOutreach
          ? "这位用户已通过找人和分析链路确认，默认直接纳入本次首轮私信。"
          : "系统已按当前账号筛出客户分析员确认的待确认触达潜客，默认全部纳入本次触达。")
    );
    sourceHead.appendChild(sourceCopy);
    if (mode === PRIVATE_OUTREACH_MODES.PROSPECTS && !inlineProspectOutreach) {
      const choose = el("button", "sb-as-private-source-tool", ready.length ? "重新选择" : "去成果中心选择");
      choose.type = "button";
      choose.addEventListener("click", openProspectSelectionForOutreach);
      sourceHead.appendChild(choose);
    }
    source.appendChild(sourceHead);

    if (!ready.length && !(mode === PRIVATE_OUTREACH_MODES.ALL_FOUND && allEntries.length)) {
      const hasUnsafeEntries = allEntries.some((entry) => entry?.status === "ready" && !privateOutreachEntryIsAllowed(flow, entry));
      const records = privateOutreachRecords(flow);
      const belongsToCurrentAccount = (record) => privateOutreachRecordMatchesSender(flow, record);
      const waitingForAnalysis = records.filter((record) => belongsToCurrentAccount(record) && isContactableRecord(record) && awaitingIntentAnalysis(record));
      const pendingOnOtherAccounts = records.filter((record) => isContactableRecord(record) && record.status === "待确认触达" && !belongsToCurrentAccount(record));
      const emptyCopy = hasUnsafeEntries
        ? "当前选择中包含不属于这个账号、来源不明确或已不在可触达状态的用户，不能发送。请回到成果中心重新选择。"
        : waitingForAnalysis.length
          ? `这个账号已找到 ${waitingForAnalysis.length} 位互动用户，先由客户分析员判断意向后，符合条件的潜客会自动出现在这里。`
          : pendingOnOtherAccounts.length
            ? `当前账号还没有可触达潜客；另有 ${pendingOnOtherAccounts.length} 位潜客属于其他账号，请切换发送账号或去成果中心选择。`
            : "找客结果或客户分析结果中暂时没有可触达对象；已触达和触达中的用户不会再次出现在这里。";
      source.appendChild(el("div", "sb-as-private-empty-copy", emptyCopy));
      const upstreamActions = el("div", "sb-as-use-actions");
      if (hasUnsafeEntries) {
        const reselect = el("button", "primary", "重新选择合规用户");
        reselect.type = "button";
        reselect.addEventListener("click", openProspectSelectionForOutreach);
        upstreamActions.appendChild(reselect);
      } else if (waitingForAnalysis.length) {
        const analyze = el("button", "primary", "去成果中心分析");
        analyze.type = "button";
        analyze.addEventListener("click", openProspectSelectionForOutreach);
        const finder = el("button", null, "继续找客");
        finder.type = "button";
        finder.addEventListener("click", () => openFinderForDependency());
        upstreamActions.append(analyze, finder);
      } else {
        const finder = el("button", "primary", "先用找客专员汇总用户");
        finder.type = "button";
        finder.addEventListener("click", () => openFinderForDependency());
        const select = el("button", null, "去成果中心选择");
        select.type = "button";
        select.addEventListener("click", openProspectSelectionForOutreach);
        upstreamActions.append(finder, select);
      }
      source.appendChild(upstreamActions);
      setup.append(source);
      panel.appendChild(setup);
      return;
    }

    const targets = el("div", "sb-as-private-targets");
    const head = el("div", "sb-as-private-targets-head");
    const contactedCount = privateOutreachContactedRecords(flow).length;
    head.append(
      el("span", null, privateOutreachSourceLabel(flow)),
      el("span", null, mode === PRIVATE_OUTREACH_MODES.ALL_FOUND
        ? `${ready.length} 位已选 · ${contactedCount} 位已排除`
        : `${ready.length} 位可触达`)
    );
    const list = el("div", "sb-as-private-target-list");
    allEntries.forEach((entry, index) => {
      const selected = entry.status === "ready";
      const row = el(mode === PRIVATE_OUTREACH_MODES.ALL_FOUND ? "label" : "div", `sb-as-private-target${selected ? " is-ready" : ""}`);
      if (mode === PRIVATE_OUTREACH_MODES.ALL_FOUND) {
        const check = document.createElement("input");
        check.type = "checkbox";
        check.checked = selected;
        check.setAttribute("aria-label", `选择${entry.nickname || "抖音用户"}`);
        check.addEventListener("change", () => {
          entry.status = check.checked ? "ready" : "excluded";
          flow.targetResolveError = null;
          render();
        });
        row.appendChild(check);
      } else {
        row.appendChild(el("span", "sb-as-private-target-index", String(index + 1)));
      }
      const targetCopy = el("div", "sb-as-private-target-copy");
      targetCopy.append(el("strong", null, entry.nickname || "抖音用户"), el("span", null, entry.quote || entry.reason || "已完成综合分析"));
      row.append(targetCopy, el("span", "sb-as-private-target-status", selected ? "可触达" : "已取消选择"));
      list.appendChild(row);
    });
    if (mode === PRIVATE_OUTREACH_MODES.ALL_FOUND && contactedCount) {
      targets.appendChild(el("div", "sb-as-private-tip", `已自动排除 ${contactedCount} 位已触达或触达中的用户，不会出现在可选名单中。`));
    }
    targets.append(head, list);
    source.appendChild(targets);
    setup.appendChild(source);

    const message = document.createElement("textarea");
    message.rows = 4;
    message.value = flow.message || privateOutreachDefaultMessage();
    message.placeholder = "写下你想对这批用户说的话";
    message.addEventListener("input", () => { flow.message = message.value; });
    const messageBox = el("div", "sb-as-private-message");
    messageBox.append(el("label", null, "首轮私信内容"), message, el("div", "sb-as-private-tip", "发送前会再次核对账号、来源和用户状态；已触达或触达中的用户不会再次出现。"));
    setup.appendChild(messageBox);
    if (flow.targetResolveError) setup.appendChild(el("div", "sb-as-use-notice is-error", flow.targetResolveError));
    panel.appendChild(setup);

    const actions = el("div", "sb-as-use-actions");
    const next = el("button", "primary", mode === PRIVATE_OUTREACH_MODES.ALL_FOUND ? `一键触达 ${ready.length} 位用户` : `一键触达 ${ready.length} 位潜客`);
    next.type = "button";
    next.disabled = !ready.length;
    next.addEventListener("click", () => {
      flow.message = message.value.trim() || privateOutreachDefaultMessage();
      if (!privateOutreachReadyEntries(flow).length) {
        flow.targetResolveError = mode === PRIVATE_OUTREACH_MODES.ALL_FOUND ? "请至少选择一位尚未触达的找到的人" : "请先选择当前账号下可触达的潜客";
        render();
        return;
      }
      flow.targetResolveStatus = "ready";
      flow.targetResolveError = null;
      startUse(getMarketplaceAgent(state.useId));
    });
    actions.appendChild(next);
    panel.appendChild(actions);
  }

  function renderPrivateOutreachReview(panel, flow) {
    const entries = Array.isArray(flow.targetEntries) ? flow.targetEntries : [];
    const ready = privateOutreachReadyEntries(flow);
    const rejected = entries.filter((entry) => entry.status !== "ready" || !privateOutreachEntryIsAllowed(flow, entry));
    panel.appendChild(el("h2", null, `发给这 ${ready.length} 人`));
    const sender = el("div", "sb-task-account");
    sender.append(taskPersonAvatar(flow.accountIdentity, flow.account), el("span", "sb-task-muted", "发送账号"), el("strong", null, flow.account || "账号名称未返回"));
    panel.appendChild(sender);
    const recipients = el("div", "sb-task-recipients");
    ready.forEach(entry => {
      const person = el("div", "sb-task-recipient");
      person.append(taskPersonAvatar(entry, entry.nickname), el("span", null, entry.nickname || "抖音用户"));
      recipients.appendChild(person);
    });
    panel.append(recipients, el("div", "sb-task-message-preview", flow.message || ""));
    if (rejected.length) {
      const skipped = makeTaskSettings(`有 ${rejected.length} 个账号不会发送`);
      rejected.forEach((entry) => skipped.appendChild(el("p", null, `${entry.nickname || entry.profileUrl}：${entry.error || "来源、账号或当前状态不符合触达条件"}`)));
      panel.appendChild(skipped);
    }
    const actions = el("div", "sb-as-use-actions");
    actions.appendChild(el("span", "sb-task-muted", "只发送这条消息 · 不自动关注或连续回复"));
    const back = el("button", null, "改一下"); back.type = "button"; back.addEventListener("click", () => { flow.step = "setup"; render(); });
    const start = el("button", "primary", `确认发送给 ${ready.length} 人`); start.type = "button"; start.disabled = !ready.length || !flow.message?.trim();
    start.addEventListener("click", () => startUse(getMarketplaceAgent(state.useId)));
    actions.append(back, start); panel.appendChild(actions);
  }

  function renderOutreachSpecialistWorksite(panel, flow) {
    const failed = Boolean(flow.error);
    const entries = Array.isArray(flow.targetEntries) ? flow.targetEntries : [];
    const sentCount = entries.filter((entry) => entry.status === "sent").length;
    const pendingReceipt = entries.some((entry) => entry.status === "unknown");
    const completed = !flow.requesting && !pendingReceipt && entries.length > 0 && entries.every((entry) => ["sent", "error", "duplicate"].includes(entry.status));
    const status = failed ? "发送异常" : flow.requesting ? "正在发送" : pendingReceipt ? "等待平台回执" : completed ? "已完成" : "等待执行";
    const worksite = createSpecialistWorksite(panel, {
      title: "私信触达",
      subtitle: failed
        ? (flow.error?.message || "这次私信触达没有完成")
        : "仅发送给成果中心中可触达的真实潜客，每条结果以平台回执为准。",
      status,
      tone: failed ? "is-error" : flow.requesting || pendingReceipt ? "is-live" : completed ? "is-success" : ""
    });

    specialistColumnHead(worksite.source, "本次触达", entries.length ? `${entries.length} 位潜客` : "暂无目标");
    const sourceList = el("div", "sb-as-specialist-source-list");
    specialistSourceItem(sourceList, "发送账号", flow.account || flow.accountIdentity?.accountName || flow.accountIdentity?.nickname || "账号信息未返回");
    specialistSourceItem(sourceList, "潜客来源", privateOutreachSourceLabel(flow));
    specialistSourceItem(sourceList, "首触内容", flow.message || "消息内容未返回");
    worksite.source.appendChild(sourceList);

    specialistColumnHead(worksite.queue, "触达队列", entries.length ? `${sentCount} 条已发送` : "等待成果中心选择");
    const rows = el("div", "sb-as-specialist-rows");
    if (entries.length) {
      entries.forEach((entry, index) => {
        rows.appendChild(specialistRow(entry, index, "outreach", flow.specialistSelectedId, specialistTargetState(entry), (nextId) => {
          flow.specialistSelectedId = nextId;
          render();
        }));
      });
      worksite.queue.appendChild(rows);
    } else {
      specialistEmpty(worksite.queue, "从成果中心选择待确认触达潜客后，发送队列会显示在这里。");
    }

    const selected = specialistSelectedItem(flow, entries, "outreach");
    specialistColumnHead(worksite.detail, "当前潜客");
    if (selected) {
      const person = el("div", "sb-as-specialist-person");
      person.append(el("strong", null, specialistPersonName(selected)), el("span", null, selected.profileUrl || "潜客身份已由成果中心保留"));
      const facts = el("div", "sb-as-specialist-facts");
      specialistFact(facts, "触达状态", specialistTargetState(selected).label);
      specialistFact(facts, "来源", specialistSourceLabel(selected, privateOutreachSourceLabel(flow)));
      specialistFact(facts, "原始证据", specialistEvidence(selected) || "原始证据由成果中心保留", true);
      if (selected.reason || selected.intent?.reason) specialistFact(facts, "入选原因", selected.intent?.reason || selected.reason);
      if (selected.error) specialistFact(facts, "失败原因", selected.error);
      worksite.detail.append(person, facts);
    } else {
      specialistEmpty(worksite.detail, "选择一位潜客后，来源、证据和平台回执会显示在这里。");
    }
    const actions = el("div", "sb-as-specialist-actions");
    if (failed) {
      const back = el("button", "primary", "返回修改");
      back.type = "button";
      back.addEventListener("click", () => { flow.error = null; flow.step = "setup"; render(); });
      actions.appendChild(back);
    } else if (completed || pendingReceipt) {
      specialistResultsAction(actions);
    }
    if (actions.childElementCount) worksite.detail.appendChild(actions);
  }

  function renderPrivateOutreachRunning(panel, flow) {
    const failed = Boolean(flow.error);
    const entries = Array.isArray(flow.targetEntries) ? flow.targetEntries : [];
    const sentCount = entries.filter((entry) => entry.status === "sent").length;
    const failedCount = entries.filter((entry) => entry.status === "error").length;
    const unknownCount = entries.filter((entry) => entry.status === "unknown").length;
    const pendingReceipt = !failed && unknownCount > 0;
    const completed = !flow.requesting && !pendingReceipt && entries.length > 0 && entries.every((entry) => ["sent", "error", "duplicate"].includes(entry.status));
    const partial = completed && sentCount > 0 && failedCount > 0;
    const title = failed
      ? "私信发送未完成"
      : pendingReceipt
        ? "等待平台回执"
        : completed
          ? partial ? "部分私信已发送" : "私信已发送"
          : "正在完成私信触达";
    const copy = failed
      ? flow.error.message
      : flow.mockPreview
        ? "这是 mock 预览：系统正在展示逐条发送和平台回执，不会向抖音发送真实私信。"
        : pendingReceipt
          ? "云电脑已经执行发送动作，但平台尚未返回全部结果。任务会保留并继续核对，不会自动重复发送。"
          : `系统正在逐条通过云电脑发送，共 ${entries.length} 个目标；每一条都以真实平台回执为准。`;
    panel.append(
      el("div", "sb-as-use-panel-title", title),
      el("div", "sb-as-use-panel-copy", copy)
    );
    const meta = el("div", "sb-as-use-progress-meta");
    meta.append(
      el("span", null, flow.mockPreview ? (completed ? "模拟平台已返回结果" : "模拟发送中") : pendingReceipt ? "等待平台回执" : completed ? "平台已返回真实结果" : failed ? "执行未完成" : flow.activeTargetIndex != null ? `正在处理第 ${flow.activeTargetIndex + 1} 个目标` : "准备发送"),
      el("span", null, `${sentCount}/${entries.length} 已完成`)
    );
    panel.appendChild(meta);
    const stats = el("div", "sb-as-private-running-summary");
    [[String(sentCount), "已发送", "is-success"], [String(failedCount), "发送失败", "is-error"], [String(unknownCount), "结果未知", ""]].forEach(([value, label, className]) => {
      const item = el("div", `sb-as-private-running-stat ${className}`);
      item.append(el("strong", null, value), el("span", null, label));
      stats.appendChild(item);
    });
    panel.appendChild(stats);
    const list = el("div", "sb-as-private-running-list");
    entries.forEach((entry) => {
      const stateLabel = entry.status === "sent" ? "已发送" : entry.status === "sending" ? "发送中" : entry.status === "unknown" ? "结果未知" : entry.status === "duplicate" ? "重复，已跳过" : entry.status === "error" ? "发送失败" : "待处理";
      const row = el("div", `sb-as-private-running-row${entry.status === "sent" ? " is-sent" : entry.status === "error" || entry.status === "unknown" ? " is-error" : ""}`);
      row.append(el("span", null, entry.nickname || entry.profileUrl || "抖音用户"), el("i", null, entry.error ? `${stateLabel} · ${entry.error}` : stateLabel));
      list.appendChild(row);
    });
    panel.appendChild(list);
    if (pendingReceipt) {
      panel.appendChild(el("div", "sb-as-use-notice", `已提交 ${entries.length} 个目标：成功 ${sentCount} 个，失败 ${failedCount} 个，${unknownCount} 个等待平台回执。任务仍会保留，发送账号：${flow.account || flow.accountIdentity?.accountName || flow.accountIdentity?.nickname || "账号名称未返回"}。`));
    } else if (completed) {
      const completedCopy = flow.mockPreview
        ? `MOCK 预览已完成：已模拟处理 ${entries.length} 个目标，成功 ${sentCount} 个，失败 ${failedCount} 个。不会产生真实私信。`
        : `已完成 ${entries.length} 个目标的处理：成功 ${sentCount} 个，失败 ${failedCount} 个。发送账号：${flow.account || flow.accountIdentity?.accountName || flow.accountIdentity?.nickname || "账号名称未返回"}。`;
      panel.appendChild(el("div", `sb-as-use-notice${partial || failedCount ? " is-error" : ""}`, completedCopy));
    }
    if (failed) {
      const actions = el("div", "sb-as-use-actions");
      const retry = el("button", "primary", "返回修改");
      retry.type = "button";
      retry.addEventListener("click", () => { flow.error = null; flow.step = "setup"; render(); });
      actions.appendChild(retry);
      panel.appendChild(actions);
    }
  }

  function appendLabeledField(fields, label, control, full = false) {
    const node = el("label", `sb-as-use-field${full ? " full" : ""}`, label);
    node.appendChild(control);
    fields.appendChild(node);
    return node;
  }

  function scheduleLeadMinerAccountResolve(flow, value) {
    if (flow.accountResolveTimer) window.clearTimeout(flow.accountResolveTimer);
    flow.accountResolveRequestId = (flow.accountResolveRequestId || 0) + 1;
    flow.accountIdentity = null;
    flow.account = "";
    flow.accountResolveError = null;
    const rawSource = String(value || "").trim();
    if (!rawSource) {
      flow.accountResolveStatus = "idle";
      render();
      return;
    }
    const source = parseCommentSource(rawSource);
    if (source.kind === "video") {
      flow.accountResolveStatus = "idle"; flow.accountResolveTimer = null; render(); return;
    }
    if (source.kind === "invalid") {
      flow.accountResolveStatus = "error";
      flow.accountResolveError = source.message;
      render();
      return;
    }
    const requestId = flow.accountResolveRequestId;
    flow.accountResolveStatus = "waiting";
    flow.accountResolveTimer = window.setTimeout(() => resolveLeadMinerAccount(flow, source.url, requestId), 350);
  }

  async function resolveLeadMinerAccount(flow, profileUrl, requestId) {
    if (flow.accountResolveRequestId !== requestId || state.useFlow !== flow) return;
    flow.accountResolveStatus = "loading";
    flow.accountResolveError = null;
    render();
    try {
      const response = await fetch(`${String(controlPlaneBaseUrl()).replace(/\/$/, "")}/v1/connectors/prospect/resolve-account`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ profileUrl })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.accepted === false || !payload?.account) {
        const error = payload?.error || {};
        throw Object.assign(new Error(error.message || `账号识别失败（HTTP ${response.status}）`), { code: error.code || "ACCOUNT_RESOLUTION_FAILED" });
      }
      if (flow.accountResolveRequestId !== requestId || state.useFlow !== flow) return;
      const account = payload.account;
      flow.accountIdentity = account;
      flow.account = account.nickname || account.uniqueId || "已识别账号";
      flow.accountResolveStatus = "ready";
      flow.accountResolveError = null;
      flow.accountResolveTimer = null;
      render();
    } catch (error) {
      if (flow.accountResolveRequestId !== requestId || state.useFlow !== flow) return;
      flow.accountResolveStatus = "error";
      flow.accountResolveError = error?.message || "账号识别失败，请检查 URL 是否公开可见";
      flow.accountResolveTimer = null;
      render();
    }
  }

  function renderCommentLeadMinerSetup(panel, flow, agent = getMarketplaceAgent(state.useId)) {
    const filterMode = isCommentFilterAgent(agent);
    const ownOnly = false;
    const previousAudience = (flow.audienceTypes || []).filter(value => value !== "近期准备下单");
    const initialText = [flow.product, ...previousAudience].filter(Boolean).join("；");
    flow.audienceTypes = [];
    const owner = ownOnly ? "own" : flow.commentSourceOwner === "other" ? "other" : "own";
    const legacyDimension = !flow.commentSourceDimension && parseCommentSource(flow.accountRef).kind === "video" ? "works" : "account";
    const dimension = flow.commentSourceDimension === "works" || legacyDimension === "works" ? "works" : "account";
    flow.commentSourceOwner = owner;
    flow.commentSourceDimension = dimension;
    if (dimension === "works" && !flow.commentWorkInput && parseCommentSource(flow.accountRef).kind === "video") {
      flow.commentWorkInput = flow.accountRef;
      flow.accountRef = "";
    }

    const layout = el("div", "sb-as-lead-setup");
    const main = el("div", "sb-as-lead-main");

    const sourceCard = el("section", "sb-as-lead-card");
    sourceCard.append(
      el("div", "sb-as-lead-card-title", ownOnly ? "连接你的抖音账号" : "看谁的内容？"),
      el("div", "sb-as-lead-card-copy", ownOnly ? "授权后，只从这个账号发布的作品评论中找客户。" : "自己的账号可以进入潜客结果并支持后续人工触达；其他账号只做公开内容分析。")
    );
    const ownerGrid = el("div", "sb-as-lead-source-grid");
    const addOwner = (value, icon, title, copy) => {
      const button = el("button", `sb-as-lead-source${owner === value ? " is-selected" : ""}`);
      button.type = "button"; button.setAttribute("aria-pressed", owner === value ? "true" : "false");
      button.append(el("span", "sb-as-lead-source-icon", icon), el("strong", null, title), el("small", null, copy));
      button.addEventListener("click", () => {
        flow.commentSourceOwner = value;
        flow.setupError = null;
        if (value === "other") {
          flow.accountRef = "";
          flow.account = "";
          flow.accountIdentity = null;
          flow.accountResolveStatus = "idle";
          flow.accountResolveError = null;
        } else {
          const selected = (flow.authorizedAccounts || []).find((account) => account.id === flow.accountId) || flow.authorizedAccounts?.[0];
          if (selected) {
            flow.accountId = selected.id || "";
            flow.account = selected.name || selected.identity?.nickname || "";
            flow.accountIdentity = selected.identity || null;
            if (flow.commentSourceDimension === "account") flow.accountRef = selected.identity?.profileUrl || selected.identity?.uniqueId || "";
          }
        }
        render();
      });
      ownerGrid.appendChild(button);
    };
    if (!ownOnly) {
      addOwner("own", "我", "我的账号", "读取我发布的作品评论");
      addOwner("other", "他", "其他账号", "读取对方公开作品评论");
      sourceCard.appendChild(ownerGrid);
    }

    if (owner === "own") {
      sourceCard.appendChild(acquisitionAccountControl(flow, (selected) => {
        flow.accountRef = dimension === "account" ? selected?.identity?.profileUrl || selected?.identity?.uniqueId || "" : "";
        flow.accountResolveStatus = dimension === "account" && flow.accountRef ? "ready" : "idle";
        flow.setupError = null;
        render();
      }));
    }

    const scopeTitle = el("div", "sb-as-lead-card-title"); scopeTitle.style.marginTop = "18px"; scopeTitle.textContent = "按什么范围看？";
    sourceCard.appendChild(scopeTitle);
    const scopeCopy = el("div", "sb-as-lead-card-copy", "按账号适合全面筛选，按作品适合只看你指定的几条内容。");
    sourceCard.appendChild(scopeCopy);
    const dimensionGrid = el("div", "sb-as-lead-scope-grid is-dimension");
    const addDimension = (value, title, copy) => {
      const button = el("button", `sb-as-lead-scope${dimension === value ? " is-selected" : ""}`);
      button.type = "button"; button.setAttribute("aria-pressed", dimension === value ? "true" : "false");
      button.append(el("strong", null, title), el("small", null, copy));
      button.addEventListener("click", () => {
        flow.commentSourceDimension = value;
        flow.setupError = null;
        if (value === "works") {
          if (!flow.commentWorkInput && parseCommentSource(flow.accountRef).kind === "video") flow.commentWorkInput = flow.accountRef;
          flow.accountRef = owner === "other" ? "" : flow.accountRef;
          flow.accountResolveStatus = "idle";
        } else {
          flow.commentWorkInput = "";
          if (owner === "own") {
            const identity = flow.accountIdentity || {};
            flow.accountRef = identity.profileUrl || identity.uniqueId || "";
            flow.accountResolveStatus = flow.accountRef ? "ready" : "idle";
          }
        }
        render();
      });
      dimensionGrid.appendChild(button);
    };
    addDimension("account", "按账号", "再筛选最近哪些作品");
    addDimension("works", "按作品", "只看指定作品");
    sourceCard.appendChild(dimensionGrid);

    if (owner === "other" && dimension === "account") {
      const label = el("label", "sb-as-use-field full", "对方的账号主页");
      const accountRef = document.createElement("input");
      accountRef.id = "sb-comment-source"; accountRef.type = "url"; accountRef.value = flow.accountRef || "";
      accountRef.placeholder = "粘贴抖音账号主页链接";
      accountRef.addEventListener("input", () => { flow.accountRef = accountRef.value; flow.setupError = null; scheduleLeadMinerAccountResolve(flow, accountRef.value); });
      label.appendChild(accountRef); sourceCard.appendChild(label);
      if (flow.accountResolveStatus === "ready" && flow.accountIdentity) sourceCard.appendChild(el("div", "sb-as-lead-auth is-ready", `已识别：${flow.accountIdentity.nickname || flow.account || "公开账号"}`));
      else if (["waiting", "loading"].includes(flow.accountResolveStatus)) sourceCard.appendChild(el("div", "sb-as-lead-auth is-progress", "正在识别这个公开账号…"));
      else if (flow.accountResolveStatus === "error") sourceCard.appendChild(el("div", "sb-as-lead-auth is-warning", flow.accountResolveError || "这个主页没能打开，请检查链接"));
    }

    if (dimension === "account") {
      const fields = el("div", "sb-as-lead-fields");
      const scope = document.createElement("select"); scope.setAttribute("aria-label", "读取作品数量");
      ["最近10条作品", "最近30条作品", "最近50条作品", "自定义条数"].forEach(value => { const option = el("option", null, value); option.value = value; scope.appendChild(option); });
      scope.value = flow.workScope || "最近30条作品";
      scope.addEventListener("change", () => { flow.workScope = scope.value; render(); });
      appendLabeledField(fields, "看最近多少条作品", scope);
      if (flow.workScope === "自定义条数") {
        const count = document.createElement("input"); count.type = "number"; count.min = "1"; count.max = "300"; count.value = String(flow.workCount || 30);
        count.addEventListener("input", () => { flow.workCount = normalizeRecentWorkCount(count.value); });
        appendLabeledField(fields, "作品条数", count);
      }
      sourceCard.appendChild(fields);
    } else {
      const label = el("label", "sb-as-use-field full", "指定作品链接");
      const works = document.createElement("textarea"); works.rows = 3; works.className = "sb-as-lead-url"; works.value = flow.commentWorkInput || "";
      works.placeholder = "粘贴 1-20 条抖音作品链接，可换行或用空格分隔";
      works.addEventListener("input", () => { flow.commentWorkInput = works.value; flow.setupError = null; });
      label.appendChild(works); sourceCard.appendChild(label);
      const parsed = parseCommentSources(flow.commentWorkInput || "");
      const countText = parsed.kind === "videos" ? `已添加 ${parsed.videoIds.length} 条作品` : "支持视频和图文作品链接";
      sourceCard.appendChild(el("div", "sb-as-lead-auth", countText));
    }
    main.appendChild(sourceCard);

    const targetCard = el("section", "sb-as-lead-card");
    targetCard.append(el("div", "sb-as-lead-card-title", filterMode ? "哪些评论需要留下？" : "想找什么样的人？"), el("div", "sb-as-lead-card-copy", filterMode ? "选择评论信号，Agent 会保留命中的原话和判断理由。" : "可以选择常见购买信号，也可以直接描述你想找的人。"));
    mountTaskChoices(targetCard, { flow, group: filterMode ? "comments" : "audience", field: "product", initialText });
    const advanced = document.createElement("details"); advanced.className = "sb-as-lead-advanced";
    const advancedSummary = document.createElement("summary"); advancedSummary.append(el("strong", null, "补充筛选条件"), el("span", null, "排除同行、抽奖和无关留言")); advanced.appendChild(advancedSummary);
    const advancedFields = el("div", "sb-as-lead-advanced-fields");
    const requirements = document.createElement("textarea"); requirements.rows = 3; requirements.value = flow.requirements || ""; requirements.placeholder = "例如：忽略抽奖、同行和无关留言；只保留明确问价格或比较方案的人";
    requirements.addEventListener("input", () => { flow.requirements = requirements.value; });
    appendLabeledField(advancedFields, "排除或补充条件", requirements, true);
    advanced.appendChild(advancedFields); targetCard.appendChild(advanced); main.appendChild(targetCard);

    layout.appendChild(main); panel.appendChild(layout);
    if (flow.setupError) panel.appendChild(el("div", "sb-as-lead-validation", flow.setupError.message));
    const actions = el("div", "sb-as-lead-actions");
    const start = el("button", "primary", filterMode ? "筛选这些评论" : owner === "other" ? "开始筛选" : "开始找客户"); start.type = "button";
    start.addEventListener("click", () => { const validation = validateLeadMinerSetup(flow, { requireOwnAccount: ownOnly }); if (validation) { flow.setupError = validation; render(); return; } flow.setupError = null; startUse(getMarketplaceAgent(state.useId)); });
    actions.appendChild(start); panel.appendChild(actions);
  }

  function renderCommentLeadMinerReview(panel, flow, agent = getMarketplaceAgent(state.useId)) {
    const filterMode = isCommentFilterAgent(agent);
    const source = parseCommentSource(flow.accountRef);
    const selectedWorks = parseCommentSources(flow.commentWorkInput || flow.accountRef);
    const dimension = flow.commentSourceDimension === "works" || selectedWorks.kind === "videos" ? "works" : "account";
    const sourceRows = dimension === "works"
      ? [["内容来源", flow.commentSourceOwner === "other" ? "其他账号的公开作品" : "我的账号作品"], ["作品范围", selectedWorks.kind === "videos" ? `${selectedWorks.videoIds.length} 条指定作品` : "待添加作品"], ...(selectedWorks.kind === "videos" ? [["作品链接", selectedWorks.urls.join("\n")]] : [])]
      : [["内容来源", flow.commentSourceOwner === "other" ? "其他账号的公开作品" : "我的账号作品"], ["识别账号", flow.account || flow.accountIdentity?.nickname || (flow.commentSourceOwner === "other" ? "已识别公开主页" : "我的账号")], ...(flow.accountIdentity?.uniqueId ? [["抖音号", flow.accountIdentity.uniqueId]] : []), ["公开主页", source.url || flow.accountRef], ["作品范围", workScopeLabel(flow.workScope, flow.workCount)]];
    panel.append(el("div", "sb-as-use-panel-title", filterMode ? "确认这次评论筛选" : "确认这次筛选任务"), el("div", "sb-as-use-panel-copy", filterMode ? "确认后，Agent 会按你的条件逐条判断评论是否匹配，不会进行购买意向分层或自动联系用户。" : "确认后，Agent 会读取公开作品评论并保留原话、来源作品和时间，不会自动联系用户。"));
    const review = el("div", "sb-as-use-review");
    const list = el("div", "sb-as-use-review-list");
    [...sourceRows, ["评论时间", effectiveWindowLabel(flow)], ...(filterMode ? [["筛选条件", flow.product.trim() || "未限定"]] : [["人群类型", flow.audienceTypes.join("、") || "自由描述"], ["筛选描述", flow.product.trim() || "未限定"], ["输出范围", flow.threshold]]), ...(flow.requirements?.trim() ? [["补充要求", flow.requirements.trim()]] : [])].filter(([, value]) => String(value || "").trim()).forEach(([label, value]) => {
      const row = el("div", "sb-as-use-review-row");
      row.append(el("span", null, label), el("strong", null, value));
      list.appendChild(row);
    });
    const evidence = el("div", "sb-as-use-evidence");
    evidence.appendChild(el("div", "sb-as-use-evidence-title", "结果会保留这些证据"));
    (filterMode ? [["原始评论", "这个体验太差了，一直漏水"], ["来源作品", "商品体验 · 作品视频"], ["判断理由", "评论直接表达负面体验，匹配筛选条件"]] : [["原始评论", "想问下这款保温杯多少钱？"], ["来源作品", "半自动咖啡机 · 商品视频"], ["判断理由", "命中询价 + 购买时间信号"]]).forEach(([label, value]) => {
      const item = el("div", "sb-as-use-evidence-item");
      item.append(el("strong", null, label), el("span", null, value));
      evidence.appendChild(item);
    });
    review.append(list, evidence);
    panel.appendChild(review);
    const notice = el("div", "sb-as-use-notice", isCommentFilterAgent(getMarketplaceAgent(state.useId))
      ? "结果按评论筛选条件交付，保留原话、来源作品、时间和判断理由，不进入潜客意向通讯录。"
      : "高意向和中意向用户会进入成果中心的潜客分类；无法确认意向的评论会标记为待分析，不会被当成有效潜客。");
    panel.appendChild(notice);
    const actions = el("div", "sb-as-use-actions");
    const back = el("button", null, "返回修改");
    back.type = "button";
    back.addEventListener("click", () => { flow.step = "setup"; render(); });
    const start = el("button", "primary", "确认并开始筛选");
    start.type = "button";
    start.addEventListener("click", () => startUse(getMarketplaceAgent(state.useId)));
    actions.append(back, start);
    panel.appendChild(actions);
  }

  function leadRecipientId(lead) {
    return lead?.secId || lead?.sec_id || lead?.secUid || lead?.sec_uid
      || lead?.source?.secId || lead?.source?.sec_id || lead?.source?.secUid || lead?.source?.sec_uid
      || privateOutreachProfileIdentifier(lead?.profileUrl || lead?.profile_url)
      || privateOutreachProfileIdentifier(lead?.source?.profileUrl || lead?.source?.profile_url)
      || null;
  }

  function openLeadOutreachDialog(lead, flow) {
    if (!privateOutreachUsesProspectBoundary(flow)) return;
    if (outreachOverlay?.isConnected) return;
    const sourceRecordId = lead?.sourceRecordId || lead?.recordId || lead?.leadId || lead?.id || "";
    const record = sourceRecordId ? prospectStore.get(sourceRecordId) : null;
    const recipient = leadRecipientId(record);
    const name = record?.nickname || record?.name || lead?.nickname || lead?.account || "这位抖音用户";
    const quote = String(record?.quote || record?.comment || record?.text || lead?.text || "").trim();
    const sameAccount = !record?.source?.accountId || !flow?.accountId || record.source.accountId === flow.accountId;
    const eligible = Boolean(record?.id && recipient && isPrivateOutreachRecordCandidate(record, PRIVATE_OUTREACH_MODES.PROSPECTS) && isContactableRecord(record) && sameAccount);
    const overlay = el("div", "sb-as-outreach-overlay");
    outreachOverlay = overlay;
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", `触达${name}`);
    const dialog = el("div", "sb-as-outreach-dialog");
    const head = el("div", "sb-as-outreach-dialog-head");
    const headCopy = el("div");
    headCopy.append(el("div", "sb-as-outreach-dialog-title", `触达${name}`), el("div", "sb-as-outreach-dialog-sub", "将通过当前已授权的抖音云电脑发送私信，发送前请确认内容。"));
    const close = el("button", "sb-as-outreach-close", "×");
    close.type = "button";
    close.setAttribute("aria-label", "关闭触达窗口");
    head.append(headCopy, close);
    dialog.appendChild(head);
    const evidence = el("div", "sb-as-outreach-evidence");
    evidence.append(el("strong", null, `筛选证据 · ${record?.score ?? lead?.score ?? "—"} 分 · ${record?.tier === "high" || lead?.tier === "high" ? "高意向" : record?.tier === "medium" || lead?.tier === "medium" ? "中意向" : "低意向"}`), document.createTextNode(quote ? `“${quote}”` : "该用户已被筛选为可跟进潜客。"));
    dialog.appendChild(evidence);
    const textarea = document.createElement("textarea");
    textarea.className = "sb-as-outreach-textarea";
    textarea.value = quote ? `你好，看到你在作品评论里提到“${quote.slice(0, 48)}${quote.length > 48 ? "…" : ""}”，想了解一下你的具体需求吗？` : "你好，看到你关注了我们的内容，想了解一下你的具体需求吗？";
    textarea.maxLength = 500;
    textarea.setAttribute("aria-label", "私信内容");
    dialog.appendChild(textarea);
    const status = el("div", "sb-as-outreach-status", eligible ? "发送前会再次验证成果来源、账号归属和云电脑授权。" : "该记录不是当前账号下尚未触达的可触达潜客，不能发起私信。");
    if (!eligible) status.classList.add("is-error");
    dialog.appendChild(status);
    const actions = el("div", "sb-as-outreach-actions");
    const cancel = el("button", null, "取消");
    cancel.type = "button";
    const confirm = el("button", "primary", "确认发送私信");
    confirm.type = "button";
    confirm.disabled = !eligible;
    const closeDialog = () => {
      if (outreachOverlay === overlay) outreachOverlay = null;
      overlay.remove();
    };
    close.addEventListener("click", closeDialog);
    cancel.addEventListener("click", closeDialog);
    overlay.addEventListener("click", (event) => { if (event.target === overlay) closeDialog(); });
    confirm.addEventListener("click", async () => {
      const content = textarea.value.trim();
      if (!content || !eligible || confirm.disabled) return;
      confirm.disabled = true;
      cancel.disabled = true;
      close.disabled = true;
      status.className = "sb-as-outreach-status";
      status.textContent = "正在检查授权并发送，云电脑可能需要几秒钟…";
      try {
        const sync = await prospectStore.flushRemoteSync?.();
        if (sync?.pending || sync?.syncing) {
          throw Object.assign(new Error(sync?.lastError
            ? `成果中心同步未完成：${sync.lastError}`
            : "成果中心仍在同步，请稍后再发送"), { code: "PROSPECT_RESULTS_SYNC_PENDING" });
        }
        const taskId = newTaskId("lead-outreach");
        const result = await executeCoreAgent({
          taskId,
          taskRunId: newTaskId("run"),
          conversationId: `agent-square-${taskId}`,
          agentId: "mkt-cold-writer",
          accountId: flow.accountId || "",
          accountKey: flow.accountWorkKey || flow.accountId || "",
          accountName: flow.account || "",
          accountIdentity: flow.accountIdentity || null,
          goal: "向已核验潜客发送首轮私信",
          lead: { sourceRecordId: record.id },
          content,
          idempotencyKey: `lead-outreach-${record.id}-${Date.now()}`,
          confirm: "SEND"
        }, 180000);
        const receiptState = privateOutreachReceiptState(result);
        if (receiptState === "sent") {
          lead.outreachStatus = "sent";
          status.className = "sb-as-outreach-status is-success";
          status.textContent = result?.message || "私信已收到平台成功回执。";
          pushActivity(state.useId, `已向${name}发送真实私信，并收到平台成功回执。`);
          render();
          window.setTimeout(closeDialog, 1200);
          return;
        }
        if (receiptState === "pending" || receiptState == null) {
          lead.outreachStatus = "pending";
          status.className = "sb-as-outreach-status";
          status.textContent = "云电脑已提交发送动作，正在等待平台最终回执；确认前不会计入已触达。";
          pushActivity(state.useId, `已向${name}提交私信触达，等待平台最终回执。`);
          render();
          cancel.disabled = false;
          close.disabled = false;
          return;
        }
        lead.outreachStatus = "error";
        status.className = "sb-as-outreach-status is-error";
        status.textContent = result?.message || "平台未确认私信发送成功。";
        pushActivity(state.useId, `向${name}发起私信触达未获得平台成功回执。`);
        render();
        cancel.disabled = false;
        close.disabled = false;
      } catch (error) {
        confirm.disabled = false;
        cancel.disabled = false;
        close.disabled = false;
        status.className = "sb-as-outreach-status is-error";
        status.textContent = error?.code === "DOUYIN_AUTHORIZATION_REQUIRED"
          ? "云电脑尚未完成抖音授权，请先打开云电脑登录后再发送。"
          : error?.code === "PROSPECT_RESULTS_SYNC_PENDING"
            ? error.message
            : error?.details?.outcome === "unknown"
            ? "云电脑连接中断，发送结果未知，请先核对原请求结果后再重试。"
            : error?.details?.phase === "provider_action_failed"
              ? `云电脑已提交私信动作，但云端执行阶段失败：${error?.message || "云电脑未返回成功结果"}`
              : `发送失败：${error?.message || "云电脑未返回成功结果"}`;
      }
    });
    actions.append(cancel, confirm);
    dialog.appendChild(actions);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    textarea.focus();
  }

  function renderLeadOutreachPanel(panel, flow) {
    if (!privateOutreachUsesProspectBoundary(flow)) return;
    if (flow.analysisOnly || flow.sourceOwner === "other" || flow.sourceScope === "public_content") return;
    const leads = Array.isArray(flow.resultSnapshot?.leads) ? flow.resultSnapshot.leads.slice(0, 12) : [];
    if (!leads.length) return;
    const section = el("div", "sb-as-outreach");
    const head = el("div", "sb-as-outreach-head");
    head.append(el("strong", "sb-as-outreach-title", "选择潜客并触达"), el("span", "sb-as-outreach-count", `${leads.length} 条结果`));
    section.appendChild(head);
    const list = el("div", "sb-as-outreach-list");
    leads.forEach((lead) => {
      const sourceRecordId = lead?.sourceRecordId || lead?.recordId || lead?.leadId || lead?.id || "";
      const record = sourceRecordId ? prospectStore.get(sourceRecordId) : null;
      const recipient = leadRecipientId(record);
      const sameAccount = !record?.source?.accountId || !flow?.accountId || record.source.accountId === flow.accountId;
      const eligible = Boolean(record?.id && recipient && isPrivateOutreachRecordCandidate(record, PRIVATE_OUTREACH_MODES.PROSPECTS) && isContactableRecord(record) && sameAccount);
      const item = el("div", "sb-as-outreach-item");
      const copy = el("div", "sb-as-outreach-item-copy");
      const name = record?.nickname || record?.name || lead?.nickname || lead?.account || "抖音用户";
      const tier = record?.tier === "high" || lead?.tier === "high" ? "高意向" : record?.tier === "medium" || lead?.tier === "medium" ? "中意向" : "低意向";
      const nameRow = el("div", "sb-as-outreach-item-name");
      nameRow.append(el("span", null, name), el("i", null, tier));
      const intent = lead?.intent || {};
      copy.append(nameRow, el("p", null, record?.quote || record?.comment || lead?.text || "已识别到需求信号，点击查看证据并编辑触达内容。"), el("div", "sb-as-outreach-item-meta", `${record?.score ?? lead?.score ?? "—"} 分 · 置信度 ${intent.confidence == null ? "—" : `${Math.round(Number(intent.confidence) * 100)}%`} · ${eligible ? "可触达" : "当前不可触达"}`), el("div", "sb-as-outreach-item-reason", record?.reason || intent.reason || "按已授权账号内的证据进行判断"));
      const outreachStatus = record?.outreachStatus || lead?.outreachStatus;
      const button = el("button", null, outreachStatus === "sent" ? "已触达" : outreachStatus === "pending" ? "等待回执" : "发起触达");
      button.type = "button";
      button.disabled = outreachStatus === "sent" || outreachStatus === "pending" || !eligible;
      button.title = !eligible
        ? "仅当前账号下、成果中心中尚未触达的已核验潜客可发送首轮私信"
        : outreachStatus === "pending"
          ? "云电脑已提交发送动作，等待平台最终回执"
          : outreachStatus === "sent"
            ? "已收到平台成功回执"
            : "编辑并确认发送私信";
      button.addEventListener("click", () => openLeadOutreachDialog(lead, flow));
      item.append(copy, button);
      list.appendChild(item);
    });
    section.appendChild(list);
    panel.appendChild(section);
  }

  function renderCommentLeadMinerRunning(panel, flow) {
    const collectionOnly = isCompositeFinderAgent(getMarketplaceAgent(flow.agentId || state.useId));
    const failed = Boolean(flow.error);
    const pending = flow.status === "PENDING";
    const resultState = leadMinerResultState(flow.resultSnapshot);
    const completed = flow.progress >= 100;
    const accountLabel = flow.account || flow.accountRef || "公开抖音账号";
    const selectedWorks = parseCommentSources(flow.commentWorkInput || flow.accountRef);
    const rangeLabel = flow.sourceDimension === "works" && selectedWorks.kind === "videos"
      ? `${selectedWorks.videoIds.length} 条指定作品`
      : workScopeLabel(flow.workScope, flow.workCount);
    const title = failed
      ? (collectionOnly ? "用户发现未完成" : "筛选任务未完成")
      : completed && resultState === "empty"
        ? "这个时间范围没有公开作品"
      : completed && resultState === "no_comments"
          ? "已读取作品，时间范围内没有评论"
      : completed && resultState === "no_match"
            ? (collectionOnly ? "已完成，暂未发现用户" : "已完成，暂未发现符合条件的潜客")
            : completed
              ? (collectionOnly ? "用户发现已完成" : "筛选任务已完成")
              : pending
                ? "等待采集服务返回"
                : (collectionOnly ? "正在整理作品评论" : "正在筛选作品评论");
    panel.append(el("div", "sb-as-use-panel-title", title), el("div", "sb-as-use-panel-copy", `${accountLabel} · ${rangeLabel} · ${effectiveWindowLabel(flow)}`));
    if (failed) {
      panel.appendChild(el("div", "sb-as-use-notice", `${flow.error.message || "真实采集服务暂时不可用"}${flow.error.code ? `（${flow.error.code}）` : ""}`));
      const retryActions = el("div", "sb-as-use-actions");
      const back = el("button", null, "返回修改");
      back.type = "button";
      back.addEventListener("click", () => { flow.step = "setup"; flow.error = null; render(); });
      const retry = el("button", "primary", "重新连接并执行");
      retry.type = "button";
      retry.addEventListener("click", () => { flow.error = null; startUse(getMarketplaceAgent(state.useId)); });
      retryActions.append(back, retry);
      panel.appendChild(retryActions);
      return;
    }
    const progress = el("div", `sb-as-use-progress${completed ? "" : " is-live"}`);
    const bar = el("i");
    bar.style.width = `${flow.progress}%`;
    progress.appendChild(bar);
    panel.appendChild(progress);
    const meta = el("div", "sb-as-use-progress-meta");
    const progressLabel = flow.progress < 100
      ? (pending ? "任务已提交，等待回传" : "实时执行中")
      : resultState === "empty"
        ? (collectionOnly ? "未读取到作品，未新增用户" : "未读取到作品，未新增潜客")
      : resultState === "no_comments"
          ? "已读取作品，时间范围内无评论"
          : resultState === "no_match"
            ? (collectionOnly ? "已读取评论，未发现用户" : "已读取评论，未发现符合条件的潜客")
            : "已完成并写入成果中心";
    const statusNode = el("span", null, progressLabel);
    if (flow.progress < 100) {
      const dots = el("span", "sb-as-live-dots");
      dots.append(el("i"), el("i"), el("i"));
      statusNode.appendChild(dots);
    }
    meta.append(statusNode, el("span", null, `${flow.progress}%`));
    panel.appendChild(meta);
    const checks = el("div", "sb-as-use-checklist");
    const activeCheckIndex = flow.checks.findIndex((done) => !done);
    const checklist = collectionOnly
      ? ["确认已授权账号", "读取作品和评论原文", "整理并去重用户", "保留来源证据"]
      : ["确认公开主页", "读取作品和评论回复", "识别需求并去重", "生成带证据的潜客表单"];
    checklist.forEach((label, index) => {
      const stateClass = flow.checks[index] ? " is-done" : index === activeCheckIndex ? " is-active" : "";
      const row = el("div", `sb-as-use-check${stateClass}`);
      row.append(el("i", null, flow.checks[index] ? "✓" : "·"), el("span", null, label));
      checks.appendChild(row);
    });
    panel.appendChild(checks);
    if (flow.liveFindings?.length) {
      const feed = el("div", "sb-as-use-live-feed");
      flow.liveFindings.forEach(({ text, score, tier }) => {
        const item = el("div", "sb-as-use-live-item");
        item.append(el("i"));
        const copy = el("div");
        copy.append(el("strong", null, text), el("span", null, collectionOnly ? "作品评论 · 待判断" : `作品评论 · ${tier}`));
        if (!collectionOnly) item.append(copy, el("span", null, `${score} 分`));
        else item.appendChild(copy);
        feed.appendChild(item);
      });
      panel.appendChild(feed);
    }
    if (flow.progress >= 100) {
      const result = el("div", "sb-as-use-running-summary");
      const counts = flow.resultSnapshot?.counts || {};
      const summaryItems = collectionOnly
        ? [[counts.comments ?? "—", "评论已读取"], [counts.candidates ?? "—", "发现用户"], [counts.pendingAnalysis ?? counts.candidates ?? "—", "待判断"]]
        : [[counts.comments ?? "—", "评论已读取"], [counts.candidates ?? "—", "去重后用户"], [counts.high ?? "—", "高意向"], [counts.medium ?? "—", "中意向"], [counts.low ?? "—", "低意向"]];
      summaryItems.forEach(([value, label]) => { const item = el("div", "sb-as-use-running-pill"); item.append(el("strong", null, String(value)), document.createTextNode(label)); result.appendChild(item); });
      panel.appendChild(result);
      const analysis = flow.resultSnapshot?.analysis || {};
      const analysisLabel = analysis.mode === "model" ? `已使用大模型判断（${analysis.model || "已配置模型"}）` : "模型不可用时使用规则兜底";
      const outreachCopy = flow.analysisOnly
        ? "公开账号结果仅用于分析，不提供私信触达。"
        : "选择下方潜客后，可编辑内容并确认发送真实私信。";
      const resultNotice = resultState === "empty"
        ? "当前时间范围没有公开作品，未读取评论，也没有新增潜客。请扩大时间范围或增加作品条数后重试。"
        : resultState === "no_comments"
          ? "已读取最近作品，但在当前评论时间范围内没有评论。请扩大评论时间范围后重试。"
          : resultState === "no_match"
            ? "已读取公开评论，但没有评论符合当前筛选条件。你可以调整目标描述后重新筛选。"
            : collectionOnly
              ? "已写入成果中心。每位用户都保留原始评论、来源作品和时间，等待「客户分析员」继续分析。"
              : `已写入成果中心。${flow.resultSnapshot?.pending ? "部分评论仍在采集，任务会在回传后继续更新。" : "每位用户都包含原始评论、来源作品、评论时间、意向等级、置信度和判断理由。"} ${analysisLabel}。${outreachCopy}`;
      panel.appendChild(el("div", "sb-as-use-notice", resultNotice));
      if (!collectionOnly) renderLeadOutreachPanel(panel, flow);
      const actions = el("div", "sb-as-use-actions");
      if (resultState !== "empty") {
        const resultButton = el("button", "primary", "查看成果中心");
        resultButton.type = "button";
        resultButton.addEventListener("click", () => globalThis.__SALEBUDDY__?.navFrameworkReady?.then?.((framework) => framework?.openProspects?.()));
        actions.appendChild(resultButton);
      }
      panel.appendChild(actions);
    }
  }

  function renderCommentFilterRunning(panel, flow) {
    const failed = Boolean(flow.error);
    const pending = flow.status === "PENDING";
    const completed = flow.progress >= 100;
    const accountLabel = flow.account || flow.accountRef || "公开抖音账号";
    const snapshot = flow.resultSnapshot || {};
    const title = failed ? "评论筛选未完成" : completed ? "评论筛选已完成" : pending ? "等待采集服务返回" : "正在筛选评论";
    panel.append(el("div", "sb-as-use-panel-title", title), el("div", "sb-as-use-panel-copy", `${accountLabel} · ${workScopeLabel(flow.workScope, flow.workCount)} · ${effectiveWindowLabel(flow)}`));
    if (failed) {
      panel.appendChild(el("div", "sb-as-use-notice", `${flow.error.message || "真实采集服务暂时不可用"}${flow.error.code ? `（${flow.error.code}）` : ""}`));
      const actions = el("div", "sb-as-use-actions");
      const back = el("button", null, "返回修改"); back.type = "button"; back.addEventListener("click", () => { flow.step = "setup"; flow.error = null; render(); });
      const retry = el("button", "primary", "重新连接并执行"); retry.type = "button"; retry.addEventListener("click", () => { flow.error = null; startUse(getMarketplaceAgent(state.useId)); });
      actions.append(back, retry); panel.appendChild(actions); return;
    }
    const progress = el("div", `sb-as-use-progress${completed ? "" : " is-live"}`); const bar = el("i"); bar.style.width = `${flow.progress}%`; progress.appendChild(bar); panel.appendChild(progress);
    const meta = el("div", "sb-as-use-progress-meta");
    const statusNode = el("span", null, completed ? "已完成" : pending ? "任务已提交，等待回传" : "实时执行中");
    if (!completed) {
      const dots = el("span", "sb-as-live-dots");
      dots.append(el("i"), el("i"), el("i"));
      statusNode.appendChild(dots);
    }
    meta.append(statusNode, el("span", null, `${flow.progress}%`)); panel.appendChild(meta);
    const checks = el("div", "sb-as-use-checklist");
    const activeCheckIndex = flow.checks.findIndex((done) => !done);
    ["确认公开主页", "读取作品和评论", "按条件判断匹配", "整理评论证据"].forEach((label, index) => { const stateClass = flow.checks[index] ? " is-done" : index === activeCheckIndex ? " is-active" : ""; const row = el("div", `sb-as-use-check${stateClass}`); row.append(el("i", null, flow.checks[index] ? "✓" : "·"), el("span", null, label)); checks.appendChild(row); });
    panel.appendChild(checks);
    if (completed) {
      const counts = snapshot.counts || {}; const summary = el("div", "sb-as-use-running-summary");
      [[counts.comments ?? "—", "评论已读取"], [counts.matched ?? counts.candidates ?? "—", "匹配评论"], [counts.unmatched ?? "—", "不匹配评论"]].forEach(([value, label]) => { const item = el("div", "sb-as-use-running-pill"); item.append(el("strong", null, String(value)), document.createTextNode(label)); summary.appendChild(item); });
      panel.appendChild(summary);
      const analysis = snapshot.analysis || {};
      const modelLabel = analysis.source === "model" ? `已使用大模型判断（${analysis.model || "已配置模型"}）` : "模型不可用时使用规则兜底";
      const matched = Array.isArray(snapshot.leads) ? snapshot.leads.slice(0, 20) : [];
      panel.appendChild(el("div", "sb-as-use-notice", matched.length ? `已整理匹配评论，保留用户、原话、来源作品和时间证据。${modelLabel}。` : `没有评论匹配当前条件。你可以调整筛选描述后重新执行。${modelLabel}。`));
      if (matched.length) {
        const list = el("div", "sb-as-use-live-feed");
        matched.forEach((lead) => { const item = el("div", "sb-as-use-live-item"); item.append(el("i")); const copy = el("div"); copy.append(el("strong", null, lead.text || "匹配评论"), el("span", null, `${lead.nickname || "抖音用户"} · ${lead.source?.videoTitle || "来源作品"} · ${lead.filter?.reason || "符合筛选条件"}`)); item.append(copy); list.appendChild(item); });
        panel.appendChild(list);
      }
      if (flow.taskId) {
        const actions = el("div", "sb-as-use-actions");
        const download = el("button", "primary", "下载评论结果");
        download.type = "button";
        download.addEventListener("click", () => {
          const baseUrl = globalThis.__SALEBUDDY_CONFIG__?.controlPlaneUrl
            || document.querySelector('meta[name="salebuddy-control-plane"]')?.content
            || "http://127.0.0.1:6681";
          window.open(`${String(baseUrl).replace(/\/$/, "")}/v1/connectors/prospect/runs/${encodeURIComponent(flow.taskId)}.xlsx`, "_blank", "noopener");
        });
        actions.appendChild(download); panel.appendChild(actions);
      }
    }
  }

  function taskPersonAvatar(person, name) {
    const avatar = el("span", "sb-task-person-avatar");
    mountPersonAvatar(avatar, person || {}, { name: name || person?.nickname || "账号" });
    return avatar;
  }

  function acquisitionAccountControl(flow, onAccountChange = null, options = {}) {
    const accounts = flow.authorizedAccounts || [];
    const account = document.createElement("select");
    (accounts.length ? accounts : [{ id: "", name: flow.loadingAccounts ? "正在读取已授权账号…" : "尚未授权抖音账号" }]).forEach((value) => {
      const option = el("option", null, concreteAccountName(value.name, value.identity?.accountName, value.identity?.account_name, value.identity?.nickname, value.identity?.nick_name) || "账号名称未返回");
      option.value = value.id || "";
      account.appendChild(option);
    });
    account.value = flow.accountId || accounts[0]?.id || "";
    account.setAttribute("aria-label", "使用账号");
    account.disabled = !accounts.length || flow.authorizing;
    account.addEventListener("change", () => {
      const selected = accounts.find((value) => value.id === account.value) || accounts[0];
      flow.accountId = selected?.id || "";
      flow.account = selected?.name || "";
      flow.accountIdentity = selected?.identity || null;
      flow.executionAgentId = selected?.agentId || flow.agentId;
      flow.setupError = null;
      mountPersonAvatar(avatar, flow.accountIdentity || {}, { name: flow.account });
      onAccountChange?.(selected);
    });
    const control = el("div", `sb-task-account sb-task-account-picker${options.className ? ` ${options.className}` : ""}`);
    const selected = accounts.find(value => value.id === account.value) || accounts[0];
    const avatar = taskPersonAvatar(selected?.identity || flow.accountIdentity, selected?.name || flow.account);
    const requiresReauthorization = flow.authErrorCode === "DOUYIN_CLOUD_START_STUCK";
    const canRestart = ["DOUYIN_PROVISIONING_TIMEOUT", "DOUYIN_MCP_TIMEOUT", "CONTROL_PLANE_TIMEOUT", "DOUYIN_CLOUD_OFFLINE", "DOUYIN_CLOUD_DISCONNECTED", "DOUYIN_AGENT_KEY_ROTATED"].includes(flow.authErrorCode);
    const authorize = el("button", null, flow.authorizing ? "启动中…" : (requiresReauthorization ? "清理后重新授权" : canRestart ? "重启云电脑" : (accounts.length ? "添加账号" : "连接抖音账号")));
    authorize.type = "button";
    authorize.disabled = Boolean(flow.authorizing);
    authorize.style.cssText = "height:38px;padding:0 12px;border:1px solid #4267A5;border-radius:9px;background:#eff3fa;color:#34578f;font:inherit;font-size:11px;font-weight:650;white-space:nowrap;cursor:pointer";
    authorize.addEventListener("click", () => requiresReauthorization
      ? reauthorizeMcp(flow)
      : startMcpAuthorization(flow, { restart: canRestart, addAccount: accounts.length > 0 && !canRestart }));
    const selector = el("label", "sb-task-account-selector");
    const caption = el("span", "sb-task-account-caption", options.caption || "使用这个抖音账号");
    selector.append(avatar, caption, account); control.appendChild(selector);
    if (accounts.length && !flow.authError) {
      const settings = makeTaskSettings("账号设置"); settings.appendChild(authorize); control.appendChild(settings);
    } else control.appendChild(authorize);
    return control;
  }

  function renderAccountAnalysisSetup(panel, flow) {
    const isBatch = flow.analysisAccounts.length > 1;
    panel.classList.add("sb-as-account-analysis-setup");
    if (isBatch) {
      const source = el("section", "sb-as-analysis-source sb-as-analysis-batch");
      const sourceHead = el("div", "sb-as-analysis-source-head");
      sourceHead.append(el("strong", null, "分析这批抖音账号"), el("span", null, `${flow.analysisAccounts.length} 个公开账号`));
      source.appendChild(sourceHead);
      source.appendChild(el("small", null, flow.sourceTaskTitle ? `来自找人任务：“${flow.sourceTaskTitle}”` : "来自刚完成的公开找人任务"));
      if (flow.sourceTaskGoal && flow.sourceTaskGoal !== flow.sourceTaskTitle) source.appendChild(el("small", null, `找人目的：${flow.sourceTaskGoal}`));
      const accountList = el("div", "sb-as-analysis-account-list");
      flow.analysisAccounts.slice(0, ACCOUNT_ANALYSIS_LIMIT).forEach((account) => accountList.appendChild(el("span", null, account.nickname || account.id)));
      if (flow.analysisAccounts.length > ACCOUNT_ANALYSIS_LIMIT) accountList.appendChild(el("span", null, `还有 ${flow.analysisAccounts.length - ACCOUNT_ANALYSIS_LIMIT} 个`));
      source.appendChild(accountList);
      source.appendChild(el("small", null, "将依据这些账号的公开主页、作品和原始依据，生成一份汇总分析报告。不会执行触达。"));
      panel.appendChild(source);
    } else {
      const source = el("section", "sb-as-analysis-source sb-as-analysis-single");
      const sourceHead = el("div", "sb-as-analysis-source-head");
      sourceHead.append(el("strong", null, "把一个公开抖音账号交给我"), el("span", null, "只读公开资料"));
      const urlLabel = el("label", "sb-as-analysis-link-dock");
      urlLabel.htmlFor = "sb-analysis-profile-url";
      const marker = el("span", "sb-as-analysis-link-mark", "抖");
      marker.setAttribute("aria-hidden", "true");
      const field = el("span", "sb-as-analysis-link-field");
      field.appendChild(el("span", "sb-as-analysis-link-label", "抖音账号主页链接"));
      const url = document.createElement("input");
      url.id = urlLabel.htmlFor;
      url.className = "sb-as-analysis-url";
      url.type = "url";
      url.autocomplete = "url";
      url.setAttribute("aria-label", "抖音账号主页链接");
      const prefilledUrl = flow.analysisUrls || flow.analysisAccounts[0]?.profileUrl || (flow.analysisAccounts[0]?.secUid ? `https://www.douyin.com/user/${encodeURIComponent(flow.analysisAccounts[0].secUid)}` : "");
      url.value = prefilledUrl;
      if (!flow.analysisUrls && url.value) flow.analysisUrls = url.value;
      source.classList.toggle("has-url", Boolean(url.value));
      url.placeholder = "粘贴账号主页链接，例如 douyin.com/user/...";
      url.addEventListener("input", () => {
        flow.analysisUrls = url.value;
        flow.error = null;
        source.classList.remove("is-error");
        source.classList.toggle("has-url", Boolean(url.value.trim()));
      });
      field.appendChild(url);
      urlLabel.append(marker, field, el("span", "sb-as-analysis-link-side", "公开账号"));
      const sourceFoot = el("div", "sb-as-analysis-source-foot");
      sourceFoot.append(el("span", null, "读取主页、作品和公开互动"), el("span", null, "不会触达该账号"));
      source.append(sourceHead, urlLabel, sourceFoot);
      panel.appendChild(source);
    }
    mountTaskChoices(panel, { flow, group: "analysis", field: "analysisGoal", defaults: ["overview"], initialText: flow.analysisGoal === "了解账号主要做什么、有哪些需求，以及哪些信息还需要确认。" ? "" : flow.analysisGoal });
    if (flow.error) panel.appendChild(el("div", "sb-as-use-notice is-error", flow.error.message));
    const start = el("button", "primary", isBatch ? "生成批量分析报告" : "开始分析"); start.type = "button";
    start.addEventListener("click", () => startUse(getMarketplaceAgent(flow.agentId)));
    const actions = el("div", "sb-as-use-actions sb-as-analysis-actions");
    actions.append(el("span", "sb-as-analysis-start-note", isBatch ? "完成后会生成 HTML 汇总报告，并发送到对话和文件中心" : "完成后会生成 HTML 分析报告，并发送到对话和文件中心"), start);
    panel.appendChild(actions);
  }

  function renderStandaloneUserAnalysisSetup(panel, flow) {
    const defaultGoal = "了解账号主要做什么、有哪些需求，以及哪些信息还需要确认。";
    const accounts = normalizeAnalysisAccounts(flow.analysisAccounts || []);
    flow.analysisAccounts = accounts;
    if (flow.analysisGoal === defaultGoal) flow.analysisGoal = "";
    panel.classList.add("sb-as-user-analysis-setup");
    panel.append(
      el("div", "sb-as-use-panel-title", "单独做用户分析"),
      el("div", "sb-as-use-panel-copy", "输入你想回答的问题，基于已选择或提供的用户公开资料生成分析报告，不进入潜客筛选和触达流程。")
    );

    if (accounts.length) {
      const source = el("section", "sb-as-user-analysis-source");
      const head = el("div", "sb-as-user-analysis-source-head");
      head.append(el("strong", null, "本次分析对象"), el("span", null, `${accounts.length} 位用户`));
      source.appendChild(head);
      const list = el("div", "sb-as-analysis-account-list");
      accounts.slice(0, ACCOUNT_ANALYSIS_LIMIT).forEach((account) => list.appendChild(el("span", null, account.nickname || account.id)));
      if (accounts.length > ACCOUNT_ANALYSIS_LIMIT) list.appendChild(el("span", null, `还有 ${accounts.length - ACCOUNT_ANALYSIS_LIMIT} 位`));
      source.appendChild(list);
      source.appendChild(el("small", null, "只读取这些用户已有的公开资料和来源证据，不判断购买意向，也不会发送私信。"));
      panel.appendChild(source);
    } else {
      const source = el("section", "sb-as-user-analysis-source");
      const label = el("label", "sb-as-user-analysis-url-field", "分析对象主页链接");
      const url = document.createElement("input");
      url.type = "url";
      url.value = flow.analysisUrls || "";
      url.placeholder = "粘贴一个抖音账号主页链接，例如 douyin.com/user/...";
      url.setAttribute("aria-label", "分析对象主页链接");
      url.addEventListener("input", () => { flow.analysisUrls = url.value; flow.error = null; start.disabled = !canStart(); });
      label.appendChild(url);
      source.append(label, el("small", null, "只读取公开主页、作品和可见互动，不会触达该账号。"));
      panel.appendChild(source);
    }

    const prompt = el("label", "sb-as-user-analysis-prompt", "分析提示词");
    const promptInput = document.createElement("textarea");
    promptInput.rows = 4;
    promptInput.value = flow.analysisGoal || "";
    promptInput.placeholder = "例如：分析这些用户的购买需求、价格敏感度和下一步跟进重点";
    promptInput.setAttribute("aria-label", "分析提示词");
    promptInput.addEventListener("input", () => { flow.analysisGoal = promptInput.value; flow.error = null; start.disabled = !canStart(); });
    prompt.appendChild(promptInput);
    panel.appendChild(prompt);

    const canStart = () => Boolean(String(flow.analysisGoal || "").trim() && (accounts.length || String(flow.analysisUrls || "").trim()));
    if (flow.error) panel.appendChild(el("div", "sb-as-use-notice is-error", flow.error.message));
    const start = el("button", "primary", "生成用户分析报告");
    start.type = "button";
    start.disabled = !canStart();
    start.addEventListener("click", () => startUse(getMarketplaceAgent(flow.agentId)));
    const actions = el("div", "sb-as-use-actions sb-as-user-analysis-actions");
    actions.append(el("span", "sb-as-user-analysis-start-note", "报告会发送到当前对话并保存到文件中心，不会生成潜客，也不会启动触达。"), start);
    panel.appendChild(actions);
  }

  function renderAccountAnalysisRunning(panel, flow) {
    panel.appendChild(el("h2", null, flow.requesting ? "正在分析账号资料" : flow.error ? "账号分析未完成" : "账号分析报告"));
    if (flow.error) panel.appendChild(el("div", "sb-as-use-notice is-error", flow.error.message));
    if (flow.analysisResult) {
      renderAccountAnalysisOverview(panel, flow.analysisResult.accounts, { goal: flow.analysisGoal, summary: flow.analysisResult.summary });
      renderAccountAnalysisReports(panel, flow.analysisResult.accounts);
    }
    if (!flow.requesting) {
      const actions = el("div", "sb-as-use-actions");
      const back = el("button", null, "调整分析目标"); back.type = "button"; back.addEventListener("click", () => { flow.step = "setup"; render(); });
      const results = el("button", "primary", "查看成果中心"); results.type = "button"; results.addEventListener("click", () => globalThis.__SALEBUDDY__?.navFrameworkReady?.then?.(framework => framework?.openProspects?.()));
      actions.append(back, results); panel.appendChild(actions);
    }
  }

  async function startAccountAnalysis(agent, flow) {
    if (flow.requesting) return;
    const goal = String(flow.analysisGoal || "").trim();
    if (!goal) {
      flow.error = { code: "ACCOUNT_ANALYSIS_GOAL_REQUIRED", message: "请先输入这次分析要回答的问题" };
      flow.step = "setup";
      render();
      return;
    }
    flow.analysisGoal = goal;
    const isBatch = flow.analysisAccounts.length > 1;
    if (isBatch) {
      const batch = buildAccountAnalysisBatch(flow.analysisAccounts);
      if (!batch.canAnalyze) {
        flow.error = { message: batch.exceedsLimit ? `一次最多同时分析 ${batch.limit} 个账号，请返回找人结果选择不超过 ${batch.limit} 个账号。` : "至少需要一个可分析账号" };
        render();
        return;
      }
      flow.analysisAccounts = batch.accounts;
    }
    const rawUrl = String(flow.analysisUrls || "").trim();
    let accounts = flow.analysisAccounts;
    if (!isBatch) {
      const selectedAccount = !rawUrl && flow.analysisAccounts.length === 1;
      if (selectedAccount) {
        accounts = normalizeAnalysisAccounts(flow.analysisAccounts);
      } else {
        const urls = rawUrl.split(/\s+/).filter(Boolean);
        if (urls.length !== 1 || !douyinProfileUrl(rawUrl)) {
          flow.error = { message: rawUrl ? "请输入有效的抖音账号主页链接" : "请先粘贴一个抖音账号主页链接" };
          render();
          return;
        }
        const existing = flow.analysisAccounts.find(account => accountAnalysisPrefillUrl(account) === rawUrl);
        accounts = normalizeAnalysisAccounts([{ ...(existing || {}), profileUrl: rawUrl }]);
      }
      if (accounts.length !== 1) { flow.error = { message: "请输入有效的抖音账号主页链接" }; render(); return; }
      flow.analysisAccounts = accounts;
    }
    flow.step = "running"; flow.requesting = true; flow.error = null; flow.analysisResult = null;
    flow.taskId = newTaskId("account-analysis"); flow.taskRunId = newTaskId("run");
    beginWork(agent.id, { task: flow.analysisGoal, phase: "分析公开账号资料", metadata: { taskId: flow.taskId, taskRunId: flow.taskRunId, progressSource: "none", publicDataTask: true } });
    render();
    try {
      const base = String(controlPlaneBaseUrl()).replace(/\/$/, "");
      const read = async (url, options = {}) => {
        const response = await fetch(url, options); const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || "账号分析请求失败");
        return data;
      };
      let result = await read(`${base}/v1/agents/account-analysis/run`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accounts, goal: flow.analysisGoal, taskId: flow.taskId, taskRunId: flow.taskRunId, sourceTaskId: flow.sourceTaskId, sourceResultId: flow.sourceResultId, sourceTaskTitle: flow.sourceTaskTitle, sourceTaskGoal: flow.sourceTaskGoal }) });
      while (result.status === "running") {
        await new Promise(resolve => setTimeout(resolve, 1500));
        result = await read(`${base}/v1/agents/account-analysis/runs/${encodeURIComponent(flow.taskId)}`);
      }
      if (result.status === "failed") throw new Error(result.error?.message || "账号分析失败");
      result = {
        ...result,
        links: {
          ...(result.links || {}),
          sourceTaskId: result.links?.sourceTaskId || flow.sourceTaskId || null,
          sourceResultId: result.links?.sourceResultId || flow.sourceResultId || null,
          sourceTaskTitle: result.links?.sourceTaskTitle || flow.sourceTaskTitle || null,
          sourceTaskGoal: result.links?.sourceTaskGoal || flow.sourceTaskGoal || null
        }
      };
      const reportFile = accountAnalysisReportFile(result, { createdBy: agent.name });
      const fileId = addFile(reportFile);
      const artifact = { id: fileId, name: reportFile.name, type: reportFile.type, projectName: reportFile.projectName, summary: "可在文件中心预览完整研究报告", sourceTaskTitle: reportFile.sourceTaskTitle, sourceTaskGoal: reportFile.sourceTaskGoal };
      const conversationMessage = accountAnalysisReportConversationMessage({ ...reportFile, ...artifact });
      recordAgentActivity(agent.id, {
        type: "completed",
        taskId: flow.taskId,
        taskRunId: flow.taskRunId,
        activityKey: `account-analysis-report:${flow.taskId}`,
        metadata: { deliverToConversation: true }
      }, {
        journal: agentActivityJournal,
        fromName: agent.name,
        text: conversationMessage.text,
        artifact: conversationMessage.artifact
      });
      flow.analysisResult = { ...result, artifacts: [...(Array.isArray(result.artifacts) ? result.artifacts : []), artifact] };
      agentResultRecorder.record({ ...flow.analysisResult, agentName: agent.name });
      finishWork(agent.id, result.summary, { taskId: flow.taskId, taskRunId: flow.taskRunId, suppressCompletionNotification: true });
    } catch (error) {
      flow.error = { message: error.message || "账号分析失败" };
      reportWorkError(agent.id, flow.error.message);
    } finally {
      flow.requesting = false;
      if (!disposed && state.useFlow === flow) render();
    }
  }

  function renderLiveLeadSetup(panel, flow) {
    mountTaskChoices(panel, { flow, group: "audience", field: "product" });
    panel.appendChild(acquisitionAccountControl(flow));
    if (flow.authorizing || ["starting", "opening", "waiting_login"].includes(flow.authPhase)) panel.appendChild(buildCloudAuthorizationStatus(flow));
    if (flow.authError || flow.setupError) panel.appendChild(el("div", "sb-as-use-notice is-error", flow.setupError || flow.authError));
    const actions = el("div", "sb-as-use-actions");
    const start = el("button", "primary", flow.authorizing ? "正在连接账号…" : "找直播间的客户"); start.type = "button"; start.disabled = Boolean(flow.authorizing);
    start.addEventListener("click", () => {
      if (!flow.authorizedAccounts?.length) { startMcpAuthorization(flow); return; }
      const error = validateLiveLeadSetup(flow);
      if (error) { flow.setupError = error; render(); return; }
      startUse(getMarketplaceAgent(flow.agentId));
    });
    actions.appendChild(start); panel.appendChild(actions);
  }

  function renderLiveDanmakuAnalysisSetup(panel, flow) {
    panel.classList.add("sb-as-live-danmaku-analysis-setup");
    flow.liveDanmakuSignals = [...DEFAULT_LIVE_SIGNALS];
    const accounts = flow.authorizedAccounts || [];
    const shell = el("div", "sb-as-gold-shell sb-as-live-shell");
    const hero = el("header", "sb-as-gold-hero");
    const heroMark = el("div", "sb-as-gold-hero-mark");
    mountGrokBotAvatar(heroMark, "mkt-live-danmaku-analysis", { alt: "直播间弹幕分析", state: "idle", trackPointer: false, mode: "agent-square" });
    const heroCopy = el("div", "sb-as-gold-hero-copy");
    heroCopy.append(
      el("h1", "sb-as-gold-title", "我来帮你看懂这场直播"),
      el("p", "sb-as-gold-subtitle", "连接账号后，我会持续读懂新弹幕，把观众反复问什么、在意什么和准备购买什么整理出来。")
    );
    hero.append(heroMark, heroCopy);
    shell.appendChild(hero);

    const account = acquisitionAccountControl(flow, () => render(), { className: "sb-as-live-account", caption: "工作账号" });
    shell.appendChild(account);
    if (flow.authorizing || ["starting", "opening", "waiting_login"].includes(flow.authPhase)) shell.appendChild(buildCloudAuthorizationStatus(flow));
    if (flow.authError) shell.appendChild(el("div", "sb-as-use-notice is-error sb-as-live-error", flow.authError));

    appendLiveDanmakuGoalComposer(shell, flow);

    if (flow.setupError) shell.appendChild(el("div", "sb-as-use-notice is-error sb-as-live-error", flow.setupError));
    const launch = el("footer", "sb-as-live-launch");
    const launchCopy = el("div", "sb-as-live-launch-copy");
    launchCopy.append(
      el("strong", null, accounts.length ? "账号已连接，我可以开始分析" : "连接账号，我就开始分析"),
      el("span", null, "我会把分析结果保留在任务记录中，直播结束或账号离线时也不会丢失。")
    );
    const start = el("button", "sb-as-live-launch-button", flow.authorizing ? "正在连接账号…" : "开始分析弹幕");
    start.type = "button";
    start.disabled = Boolean(flow.authorizing || flow.requesting);
    start.addEventListener("click", () => {
      if (!flow.authorizedAccounts?.length) { startMcpAuthorization(flow); return; }
      const error = validateLiveDanmakuAnalysisSetup(flow);
      if (error) { flow.setupError = error; render(); return; }
      startUse(getMarketplaceAgent(state.useId));
    });
    launch.append(launchCopy, start);
    shell.appendChild(launch);
    panel.appendChild(shell);
  }

  function renderCommentAcquisitionSetup(panel, flow) {
    flow.approvalMode = "auto";
    panel.appendChild(acquisitionAccountControl(flow, () => render()));
    panel.appendChild(el("div", "sb-as-use-notice", `${DOUYIN_AUTO_AUDIENCE_GOAL}，并根据每条互动证据自动生成首次私信。后续对话按已保存的接待方式承接。`));
    if (flow.authorizing || ["starting", "opening", "waiting_login"].includes(flow.authPhase)) panel.appendChild(buildCloudAuthorizationStatus(flow));
    if (flow.setupError || flow.authError) panel.appendChild(el("div", "sb-as-use-notice is-error", flow.setupError || flow.authError));
    const actions = el("div", "sb-as-use-actions");
    const inbox = el("button", null, "配置接待方式（必填）");
    inbox.type = "button";
    inbox.disabled = Boolean(flow.authorizing);
    inbox.addEventListener("click", () => {
      flow.mode = "inbox";
      flow.managerCombinedStart = true;
      flow.step = "setup";
      flow.setupError = null;
      flow.error = null;
      if (flow.accountId) void loadAccountReception(flow);
      render();
    });
    const start = el("button", "primary", flow.authorizing ? "正在连接账号…" : "开始找客户"); start.type = "button"; start.disabled = Boolean(flow.authorizing || flow.requesting);
    start.addEventListener("click", () => {
      if (!flow.authorizedAccounts?.length) { startMcpAuthorization(flow); return; }
      const error = validateCommentAcquisitionSetup(flow);
      if (error) { flow.setupError = error; render(); return; }
      flow.setupError = null; startUse(getMarketplaceAgent(state.useId));
    });
    actions.append(inbox, start); panel.appendChild(actions);
  }

  function renderCommentAcquisitionRunning(panel, flow) {
    const finderListener = isFinderListenerFlow({ id: flow.agentId }, flow);
    const sourceScope = finderListener ? finderListenerSourceScope(flow) : flow.sourceScope || flow.taskSnapshot?.config?.sourceScope?.kind;
    const liveOnly = sourceScope === "authorized_account_live";
    const taskState = String(flow.taskState || "running").toLowerCase();
    const failed = taskState === "error" || Boolean(flow.error);
    const paused = taskState === "paused";
    const systemPaused = paused && flow.taskSnapshot?.systemPause?.reason === "system_duplicate_consolidation";
    const stopped = taskState === "stopped";
    const resumeBlocked = flow.taskSnapshot?.resumeBlocked;
    const requiresAuthorization = resumeBlocked?.reason === "authorization_required";
    const taskError = flow.error || flow.taskSnapshot?.lastError || null;
    const managerPartialStart = flow.managerInboxRuntimeStarted === true && flow.managerAcquisitionStartFailed === true;
    const title = stopped ? "任务已关闭" : failed ? (managerPartialStart ? "完整获客任务尚未启动" : finderListener ? "找客任务异常" : "获客任务异常") : requiresAuthorization ? "需要重新连接抖音账号" : systemPaused ? (finderListener ? "已保留最新一项找客任务" : "已保留最新一项获客任务") : paused ? (finderListener ? "找客任务已暂停" : "获客任务已暂停") : `${getMarketplaceAgent(flow.agentId || "mkt-comment-acquisition").name}工作中`;
    const listenerCopy = finderListener
      ? `${finderListenerSourceLabel(sourceScope)} · 汇总全部互动用户并保留原始证据`
      : liveOnly ? "直播弹幕 · 观众意向 · 客户名单" : "评论 · 直播 · 互动关注 · 首次触达";
    panel.append(el("div", "sb-as-use-panel-title", title), el("div", "sb-as-use-panel-copy", failed ? (managerPartialStart ? "私信承接仍在运行。只需继续启动完整获客，不会重复启动私信承接。" : taskError?.message || "长期任务运行失败") : requiresAuthorization ? (resumeBlocked.message || "账号重新连接后，会从上次进度继续。") : systemPaused ? (finderListener ? "旧任务已安全暂停，避免重复监听同一批新信号" : liveOnly ? "旧任务已安全暂停，避免重复读取同一直播间" : "旧任务已安全暂停，避免重复联系同一批用户") : listenerCopy));
    if (flow.taskSnapshot?.lastError && !failed && !requiresAuthorization) panel.appendChild(el("div", "sb-as-use-notice is-error", flow.taskSnapshot.lastError.message));
    const sources = flow.taskSnapshot?.lastScan?.sources || flow.resultSnapshot?.sources || {};
    Object.entries(sources).forEach(([name, source]) => {
      const sourceLabel = name === "live" ? "直播" : name === "comments" || name === "comment" ? "作品评论" : "互动通知";
      panel.appendChild(el("div", `sb-as-use-notice${source.state === "degraded" ? " is-error" : ""}`, `${sourceLabel}：${source.state === "degraded" ? source.error?.message || "暂不可用，等待重试" : source.state === "waiting" ? "等待新的互动信号" : "已接入"}`));
    });
    if (failed) panel.appendChild(el("div", "sb-as-use-notice is-error", `${taskError?.message || "任务异常"}${taskError?.code ? `（${taskError.code}）` : ""}`));
    if (requiresAuthorization) panel.appendChild(el("div", "sb-as-use-notice", resumeBlocked.message || "账号重新连接后，会从上次进度继续。"));
    if (!failed && flow.duplicateTask) panel.appendChild(el("div", "sb-as-use-notice", "检测到相同任务已在运行，已切换到现有任务；本次没有重复创建或发送。"));
    if (systemPaused) panel.appendChild(el("div", "sb-as-use-notice", flow.taskSnapshot.systemPause.message || "同一账号只保留一项持续获客任务，已保留最新任务继续执行。"));
    const progress = el("div", "sb-as-use-progress is-live is-indeterminate"); progress.appendChild(el("i")); panel.appendChild(progress);
    const meta = el("div", "sb-as-use-progress-meta"); meta.append(el("span", null, failed ? "等待处理异常" : requiresAuthorization ? "等待账号重新连接" : systemPaused ? "已避免重复联系" : paused ? "任务已暂停" : "长期监听中"), el("span", null, flow.taskState || "running")); panel.appendChild(meta);
    const checks = el("div", "sb-as-use-checklist");
    const capabilityState = commentAcquisitionCapabilityState(flow.taskSnapshot || {}, flow.approvalMode);
    [
      ["已连接授权账号", capabilityState.connected],
      [finderListener ? "持续接收找客信号" : "持续接收获客信号", capabilityState.listening],
      [finderListener ? "等待客户分析员判断意向" : "AI 判断目标匹配", capabilityState.analyzed],
      ...(finderListener || liveOnly ? [] : [["按规则自动发送私信", capabilityState.touched]])
    ].forEach(([label, done]) => {
      const row = el("div", `sb-as-use-check${done ? " is-done" : " is-active"}`); row.append(el("i", null, done ? "✓" : "·"), el("span", null, label)); checks.appendChild(row);
    });
    panel.appendChild(checks);
    const snapshot = flow.taskSnapshot || {};
    const counts = snapshot.counts || flow.resultSnapshot?.counts || {};
    if (Object.keys(counts).length) {
      const result = el("div", "sb-as-use-result"); [[counts.signals ?? counts.comments ?? 0, counts.signals != null ? "本轮互动信号" : "已读取评论"], [counts.matched ?? counts.candidates ?? 0, finderListener ? "已汇总用户" : "AI 匹配用户"], ...(finderListener || liveOnly ? [] : [[counts.sent ?? counts.delivered ?? 0, "已触达"]])].forEach(([value, label]) => { const item = el("div"); item.append(el("strong", "accent", String(value)), el("span", null, label)); result.appendChild(item); }); panel.appendChild(result);
    }
    if (!failed && finderListener) panel.appendChild(el("div", "sb-as-use-notice", `监听账号：${concreteAccountName(flow.account, flow.authorizedAccounts?.[0]?.name, flow.authorizedAccounts?.[0]?.identity?.accountName, flow.authorizedAccounts?.[0]?.identity?.account_name, flow.authorizedAccounts?.[0]?.identity?.nickname, flow.authorizedAccounts?.[0]?.identity?.nick_name) || "账号名称未返回"} · 互动用户会自动归档到成果中心，等待客户分析员判断，不会发送私信。`));
    else if (!failed && !liveOnly) panel.appendChild(el("div", "sb-as-use-notice", `监听账号：${concreteAccountName(flow.account, flow.authorizedAccounts?.[0]?.name, flow.authorizedAccounts?.[0]?.identity?.accountName, flow.authorizedAccounts?.[0]?.identity?.account_name, flow.authorizedAccounts?.[0]?.identity?.nickname, flow.authorizedAccounts?.[0]?.identity?.nick_name) || "账号名称未返回"} · 触达渠道：真实私信 · 自动发送`));
    const actions = el("div", "sb-as-use-actions");
    if (failed) {
      const retry = el("button", "primary", managerPartialStart ? "继续启动完整获客" : flow.taskKey ? "重试任务" : "重新启动任务");
      retry.type = "button";
      retry.addEventListener("click", () => {
        const agent = getMarketplaceAgent(flow.agentId || state.useId);
        if (managerPartialStart) {
          void retryCompleteAcquisitionAfterInbox(agent, flow);
          return;
        }
        if (flow.taskKey) {
          void controlCommentAcquisitionTask(flow, "retry", retry).catch(() => {});
          return;
        }
        void startCommentAcquisition(agent, flow);
      });
      actions.appendChild(retry);
    } else if (requiresAuthorization) {
      const reconnect = el("button", "primary", "重新连接账号"); reconnect.type = "button";
      reconnect.addEventListener("click", () => startMcpAuthorization(flow));
      actions.appendChild(reconnect);
    }
    const realtimeButton = el("button", null, "查看实时工作");
    realtimeButton.type = "button";
    realtimeButton.addEventListener("click", () => globalThis.__SALEBUDDY__?.navFrameworkReady?.then?.((framework) => framework?.openRealtimeWork?.({
      selectedAgentId: flow.agentId,
      taskId: flow.taskId || flow.taskSnapshot?.context?.taskId || null,
      taskRunId: flow.taskRunId || flow.taskSnapshot?.context?.taskRunId || null,
      accountId: flow.accountId || flow.taskSnapshot?.context?.accountId || null
    })));
    actions.appendChild(realtimeButton);
    const resultButton = el("button", null, "查看成果中心"); resultButton.type = "button"; resultButton.addEventListener("click", () => globalThis.__SALEBUDDY__?.navFrameworkReady?.then?.((framework) => framework?.openProspects?.())); actions.appendChild(resultButton);
    panel.appendChild(actions);
  }

  function renderLiveDanmakuOutreachSetup(panel, flow) {
    panel.classList.add("sb-as-live-danmaku-outreach-setup");
    flow.analysisKind = "live_danmaku_outreach";
    flow.liveDanmakuSignals = ["danmaku"];
    flow.approvalMode = "auto";
    flow.touchChannel = "private_message";
    const settings = normalizeLiveDanmakuOutreachSettings(flow);
    flow.liveDanmakuOutreachGoal = settings.goal;
    flow.liveDanmakuOutreachMessage = flow.liveDanmakuOutreachMessage
      ?? flow.outreachMessage
      ?? flow.configuration?.touchContent?.message
      ?? flow.configuration?.contentPolicy?.strategy
      ?? flow.configuration?.contentPolicy?.template
      ?? "";
    flow.maxTouchesPerDay = null;
    flow.minIntervalMinutes = settings.minIntervalMinutes;
    const accounts = flow.authorizedAccounts || [];
    const loading = Boolean(flow.authorizing || flow.requesting || flow.starting);
    const shell = el("div", "sb-as-gold-shell sb-as-live-outreach-shell");

    const hero = el("header", "sb-as-gold-hero");
    const heroMark = el("div", "sb-as-gold-hero-mark");
    mountGrokBotAvatar(heroMark, "mkt-live-danmaku-outreach", { alt: "电商直播间未成交客户触达", state: "idle", trackPointer: false, mode: "agent-square" });
    const heroCopy = el("div", "sb-as-gold-hero-copy");
    heroCopy.append(
      el("h1", "sb-as-gold-title", "我来接住直播间的新客户"),
      el("p", "sb-as-gold-subtitle", "连接账号后，我会根据你设定的触达目的，向当前直播间的新弹幕用户发出首次私信；不填写开场消息时，内容和策略由大模型自主决定，帮助你持续促进转化。")
    );
    hero.append(heroMark, heroCopy);
    shell.appendChild(hero);

    const account = acquisitionAccountControl(flow, () => render(), { className: "sb-as-live-account", caption: "工作账号" });
    shell.appendChild(account);
    if (flow.authorizing || ["starting", "opening", "waiting_login"].includes(flow.authPhase)) shell.appendChild(buildCloudAuthorizationStatus(flow));
    if (flow.authError) shell.appendChild(el("div", "sb-as-use-notice is-error sb-as-live-outreach-error", flow.authError));

    const config = el("section", "sb-as-live-outreach-config");
    const configHead = el("div", "sb-as-live-outreach-config-head");
    configHead.append(
      el("strong", null, "告诉我这次怎么触达"),
      el("span", null, "目的必填，其余设置都可以留给我")
    );
    config.appendChild(configHead);
    const configGrid = el("div", "sb-as-live-outreach-config-grid");
    const purposeColumn = el("div", "sb-as-live-outreach-config-field");
    const purposeLabel = el("span", null, "这次触达是为了什么？");
    purposeLabel.appendChild(el("em", null, "*"));
    const purpose = document.createElement("textarea");
    purpose.className = "sb-as-live-outreach-purpose";
    purpose.rows = 2;
    purpose.required = true;
    purpose.setAttribute("aria-label", "直播间触达目的");
    purpose.value = flow.liveDanmakuOutreachGoal;
    purpose.placeholder = "例如：承接用户咨询，并引导有兴趣的人留下联系方式";
    purpose.addEventListener("input", () => {
      flow.liveDanmakuOutreachGoal = purpose.value;
      flow.setupError = null;
    });
    purposeColumn.append(purposeLabel, purpose);
    const purposeSuggestions = el("div", "sb-as-live-outreach-suggestions");
    purposeSuggestions.appendChild(el("span", null, "可以直接选"));
    [
      ["承接咨询", "承接用户在直播间提出的问题，邀请他继续了解商品。"],
      ["获取线索", "先回应用户兴趣，再自然引导用户留下联系方式。"],
      ["引导预约", "围绕用户需求沟通，推动预约、到店或下一步咨询。"]
    ].forEach(([label, value]) => {
      const suggestion = el("button", "sb-as-live-outreach-suggestion", label);
      suggestion.type = "button";
      suggestion.addEventListener("click", () => {
        flow.liveDanmakuOutreachGoal = value;
        flow.setupError = null;
        render();
      });
      purposeSuggestions.appendChild(suggestion);
    });
    purposeColumn.appendChild(purposeSuggestions);
    purposeColumn.appendChild(el("small", null, "它会作为 AI 生成和判断是否需要人工接管的业务目标。"));
    configGrid.appendChild(purposeColumn);

    const frequency = el("div", "sb-as-live-outreach-frequency");
    const messageField = el("label", "sb-as-live-outreach-config-field");
    messageField.append(el("span", null, "自定义开场消息（可选）"));
    const message = document.createElement("textarea");
    message.className = "sb-as-live-outreach-message";
    message.rows = 2;
    message.setAttribute("aria-label", "直播间触达开场消息");
    message.value = flow.liveDanmakuOutreachMessage || "";
    message.placeholder = LIVE_DANMAKU_OUTREACH_DEFAULT_MESSAGE;
    message.addEventListener("input", () => {
      flow.liveDanmakuOutreachMessage = message.value;
      flow.setupError = null;
    });
    messageField.appendChild(message);
    frequency.appendChild(messageField);
    const frequencyRow = el("div", "sb-as-live-outreach-frequency-row");
    const intervalField = el("label");
    intervalField.appendChild(el("span", null, "每条消息间隔"));
    const interval = document.createElement("select");
    interval.setAttribute("aria-label", "每条消息间隔");
    [[0, "收到弹幕后立即发送"], [1, "间隔 1 分钟"], [3, "间隔 3 分钟"], [5, "间隔 5 分钟"], [15, "间隔 15 分钟"]].forEach(([value, label]) => {
      const option = el("option", null, label);
      option.value = String(value);
      interval.appendChild(option);
    });
    interval.value = String(flow.minIntervalMinutes);
    interval.addEventListener("change", () => { flow.minIntervalMinutes = Number(interval.value); });
    intervalField.appendChild(interval);
    frequencyRow.appendChild(intervalField);
    frequency.appendChild(frequencyRow);
    frequency.appendChild(el("small", null, "每位用户只触达一次；当平台提示当前账号达到私信触达额度时，自动暂停并通知你。"));
    configGrid.appendChild(frequency);
    config.appendChild(configGrid);
    const configNote = el("div", "sb-as-live-outreach-config-note");
    configNote.append(el("i", null, "i"), el("span", null, "触达数量由当前抖音账号的实际可用额度决定，不在这里预设固定上限；直播间范围、触达渠道和风险转人工规则保持固定。"));
    config.appendChild(configNote);
    shell.appendChild(config);

    const automation = el("section", "sb-as-live-outreach-automation");
    const automationHead = el("div", "sb-as-live-outreach-automation-head");
    automationHead.append(
      el("strong", null, "我会自动完成"),
      el("span", null, "启动后持续监听当前直播间")
    );
    const automationList = el("div", "sb-as-live-outreach-automation-list");
    [
      ["接收新弹幕", "只处理启动后的当前直播间消息"],
      ["逐位完成首次触达", "同一用户只触达一次"],
      ["遇到风险交给人工", "拒绝、投诉或退款会暂停自动发送"]
    ].forEach(([title, copy]) => {
      const item = el("div", "sb-as-live-outreach-automation-item");
      item.append(el("i"));
      const itemCopy = el("div");
      itemCopy.append(el("strong", null, title), el("span", null, copy));
      item.appendChild(itemCopy);
      automationList.appendChild(item);
    });
    automation.append(automationHead, automationList);
    shell.appendChild(automation);
    const scope = el("div", "sb-as-live-outreach-scope");
    scope.append(el("i", null, "✓"), el("span", null, `范围已经固定：${LIVE_DANMAKU_OUTREACH_SCOPE} 不读取点赞、送礼、关注或进场信号。`));
    shell.appendChild(scope);

    if (flow.setupError) shell.appendChild(el("div", "sb-as-use-notice is-error sb-as-live-outreach-error", flow.setupError));
    const launch = el("footer", "sb-as-live-launch sb-as-live-outreach-launch");
    const launchCopy = el("div", "sb-as-live-launch-copy sb-as-live-outreach-launch-copy");
    launchCopy.append(
      el("strong", null, accounts.length ? "账号已连接，可以开始触达" : "连接账号，我就开始触达"),
      el("span", null, "启动后会在后台持续运行，你可以随时在任务记录中查看触达结果。")
    );
    const start = el("button", "sb-as-live-launch-button sb-as-live-outreach-launch-button", flow.authorizing ? "正在连接账号…" : "开始监听并触达");
    start.type = "button";
    start.disabled = loading;
    start.addEventListener("click", () => {
      if (!flow.authorizedAccounts?.length) { startMcpAuthorization(flow); return; }
      const error = validateLiveDanmakuOutreachSetup(flow);
      if (error) { flow.setupError = error; render(); return; }
      startUse(getMarketplaceAgent(state.useId));
    });
    launch.append(launchCopy, start);
    shell.appendChild(launch);
    panel.appendChild(shell);
  }

  function renderLiveDanmakuAnalysisRunning(panel, flow) {
    const taskState = String(flow.taskState || "running").toLowerCase();
    const failed = taskState === "error" || Boolean(flow.error);
    const paused = taskState === "paused";
    const stopped = taskState === "stopped";
    const resumeBlocked = flow.taskSnapshot?.resumeBlocked;
    const requiresAuthorization = resumeBlocked?.reason === "authorization_required";
    const taskError = flow.error || flow.taskSnapshot?.lastError || null;
    const analysis = flow.liveDanmakuAnalysis || flow.resultSnapshot?.danmakuAnalysis || flow.taskSnapshot?.resultSnapshot?.danmakuAnalysis || null;
    const collection = flow.resultSnapshot?.collectionSnapshot || flow.taskSnapshot?.resultSnapshot?.collectionSnapshot || flow.taskSnapshot?.collectionSnapshot || {};
    const completed = taskState === "completed" || taskState === "succeeded" || Boolean(analysis && collection.state === "ended");
    const counts = analysis?.counts || flow.resultSnapshot?.counts || flow.taskSnapshot?.counts || {};
    const title = stopped ? "直播间弹幕分析已关闭" : failed ? "直播间弹幕分析异常" : requiresAuthorization ? "需要重新连接抖音账号" : paused ? "直播间弹幕分析已暂停" : completed ? "直播间优化策略已完成" : "直播间弹幕采集中";
    const copy = failed
      ? taskError?.message || "直播间弹幕分析任务运行失败"
      : requiresAuthorization
        ? resumeBlocked.message || "账号重新连接后，会从上次进度继续。"
        : completed ? `监听账号：${flow.account || "已授权账号"} · 直播已结束，已基于整场用户反馈生成下一场优化策略` : `监听账号：${flow.account || "已授权账号"} · 持续采集直播间弹幕，直播结束后统一分析`;
    panel.append(el("div", "sb-as-use-panel-title", title), el("div", "sb-as-use-panel-copy", copy));
    if (flow.liveDanmakuGoal) panel.appendChild(el("div", "sb-as-use-notice", `分析目标：${flow.liveDanmakuGoal}`));
    if (taskError && !failed) panel.appendChild(el("div", "sb-as-use-notice is-error", taskError.message || "部分数据源暂不可用"));
    if (failed) panel.appendChild(el("div", "sb-as-use-notice is-error", `${taskError?.message || "任务异常"}${taskError?.code ? `（${taskError.code}）` : ""}`));
    if (requiresAuthorization) panel.appendChild(el("div", "sb-as-use-notice", resumeBlocked.message || "账号重新连接后，会从上次进度继续。"));

    if (!completed && !failed && !stopped) {
      const progress = el("div", "sb-as-use-progress is-live is-indeterminate");
      progress.appendChild(el("i"));
      panel.appendChild(progress);
      const meta = el("div", "sb-as-use-progress-meta");
      meta.append(el("span", null, paused ? "任务已暂停" : `已采集 ${collection.totalDanmaku || counts.danmaku || 0} 条弹幕 · ${collection.uniqueUsers || counts.uniqueUsers || 0} 位用户`), el("span", null, flow.taskState || "running"));
      panel.appendChild(meta);
    }

    const checks = el("div", "sb-as-use-checklist");
    const sourceStates = flow.taskSnapshot?.lastScan?.sources || flow.resultSnapshot?.sources || {};
    const hasLiveSource = ["available", "ready", "received", "receiving", "ended"].includes(sourceStates.live?.state);
    [["已连接授权账号", Boolean(flow.accountId) && !requiresAuthorization], ["持续采集整场直播弹幕", Boolean(collection.totalDanmaku || hasLiveSource || (!failed && !stopped))], ["直播结束后统一生成优化策略", completed], ["策略已发送到成员对话和文件中心", completed]].forEach(([label, done]) => {
      const row = el("div", `sb-as-use-check${done ? " is-done" : " is-active"}`);
      row.append(el("i", null, done ? "✓" : "·"), el("span", null, label));
      checks.appendChild(row);
    });
    panel.appendChild(checks);

    if (Object.keys(counts).length) {
      const result = el("div", "sb-as-use-result sb-as-live-danmaku-result");
      [[collection.totalDanmaku ?? counts.danmaku ?? 0, "整场弹幕", "accent"], [collection.uniqueUsers ?? counts.uniqueUsers ?? 0, "互动用户", ""], [completed ? (analysis?.optimization?.priorityTopics?.length || 0) : "—", completed ? "优化重点" : "直播结束后分析", "accent"]].forEach(([value, label, className]) => {
        const item = el("div");
        item.append(el("strong", className, String(value)), el("span", null, label));
        result.appendChild(item);
      });
      panel.appendChild(result);
    }

    if (completed && analysis?.topics?.length) {
      const topicSection = el("section", "sb-as-live-danmaku-section");
      topicSection.appendChild(el("strong", null, "高频主题与转化阻力"));
      analysis.topics.forEach((topic) => {
        const row = el("div", "sb-as-use-notice");
        row.append(el("strong", null, `${topic.label} · ${topic.count} 条`), el("div", null, topic.examples?.join("；") || "暂无原始表达"));
        topicSection.appendChild(row);
      });
      panel.appendChild(topicSection);
    }

    if (completed && analysis?.optimization) {
      const strategySection = el("section", "sb-as-live-danmaku-section");
      strategySection.appendChild(el("strong", null, "下一场直播优化策略"));
      if (analysis.optimization.headline) strategySection.appendChild(el("div", "sb-as-use-notice", analysis.optimization.headline));
      (analysis.optimization.nextLiveActions || []).slice(0, 5).forEach((action) => strategySection.appendChild(el("div", "sb-as-use-notice", action)));
      panel.appendChild(strategySection);
    }
    panel.appendChild(el("div", "sb-as-use-notice", "本 Agent 会持续采集直播间弹幕；直播结束后，基于整场用户反馈生成下一场直播优化策略，不负责私信触达或用户跟进排序。"));

    const actions = el("div", "sb-as-use-actions");
    if (failed) {
      const retry = el("button", "primary", flow.taskKey ? "重试任务" : "重新启动任务");
      retry.type = "button";
      retry.addEventListener("click", () => flow.taskKey ? void controlCommentAcquisitionTask(flow, "retry", retry).catch(() => {}) : void startLiveDanmakuAnalysis(getMarketplaceAgent(flow.agentId || state.useId), flow));
      actions.appendChild(retry);
    } else if (requiresAuthorization) {
      const reconnect = el("button", "primary", "重新连接账号");
      reconnect.type = "button";
      reconnect.addEventListener("click", () => startMcpAuthorization(flow));
      actions.appendChild(reconnect);
    }
    const realtimeButton = el("button", null, "查看实时工作");
    realtimeButton.type = "button";
    realtimeButton.addEventListener("click", () => globalThis.__SALEBUDDY__?.navFrameworkReady?.then?.((framework) => framework?.openRealtimeWork?.({ selectedAgentId: flow.agentId, taskId: flow.taskId || null, taskRunId: flow.taskRunId || null, accountId: flow.accountId || null })));
    const resultButton = el("button", null, "查看成果中心");
    resultButton.type = "button";
    resultButton.addEventListener("click", () => globalThis.__SALEBUDDY__?.navFrameworkReady?.then?.((framework) => framework?.openProspects?.()));
    actions.append(realtimeButton, resultButton);
    panel.appendChild(actions);
  }

  function renderLiveDanmakuOutreachRunning(panel, flow) {
    const taskState = String(flow.taskState || "running").toLowerCase();
    const failed = taskState === "error" || Boolean(flow.error);
    const paused = taskState === "paused";
    const stopped = taskState === "stopped";
    const resumeBlocked = flow.taskSnapshot?.resumeBlocked;
    const requiresAuthorization = resumeBlocked?.reason === "authorization_required";
    const taskError = flow.error || flow.taskSnapshot?.lastError || null;
    const snapshot = flow.taskSnapshot || {};
    const outreachSettings = normalizeLiveDanmakuOutreachSettings({
      ...flow,
      configuration: flow.configuration || snapshot.configuration || snapshot.config || null
    });
    const counts = snapshot.counts || flow.resultSnapshot?.counts || {};
    const sources = snapshot.lastScan?.sources || flow.resultSnapshot?.sources || {};
    const hasLiveSource = ["available", "ready", "received", "receiving", "waiting"].includes(String(sources.live?.state || "").toLowerCase());
    const queue = Array.isArray(flow.approvalQueue) ? flow.approvalQueue : [];
    const touched = Number(counts.sent ?? counts.delivered ?? snapshot.counters?.sent ?? 0);
    const candidates = Number(counts.candidates ?? counts.matched ?? counts.signals ?? snapshot.counters?.candidates ?? 0);
    const pending = Number(counts.pending ?? snapshot.counters?.pending ?? queue.length ?? 0);
    const title = stopped
      ? "直播间未成交客户触达已关闭"
      : failed
        ? "直播间未成交客户触达异常"
        : requiresAuthorization
          ? "需要重新连接抖音账号"
          : paused
            ? "直播间未成交客户触达已暂停"
            : "直播间未成交客户触达中";
    const copy = failed
      ? taskError?.message || "直播间未成交客户触达任务运行失败"
      : requiresAuthorization
        ? resumeBlocked.message || "账号重新连接后，会从上次进度继续。"
        : `监听账号：${flow.account || "已授权账号"} · 当前直播间新弹幕会直接进入首次私信触达`;
    panel.append(el("div", "sb-as-use-panel-title", title), el("div", "sb-as-use-panel-copy", copy));
    panel.appendChild(el("div", "sb-as-use-notice", `本次触达目的：${outreachSettings.goal}`));
    if (taskError && !failed) panel.appendChild(el("div", "sb-as-use-notice is-error", taskError.message || "部分数据源暂不可用"));
    if (failed) panel.appendChild(el("div", "sb-as-use-notice is-error", `${taskError?.message || "任务异常"}${taskError?.code ? `（${taskError.code}）` : ""}`));
    if (requiresAuthorization) panel.appendChild(el("div", "sb-as-use-notice", resumeBlocked.message || "账号重新连接后，会从上次进度继续。"));

    if (!failed && !stopped) {
      const progress = el("div", "sb-as-use-progress is-live is-indeterminate");
      progress.appendChild(el("i"));
      panel.appendChild(progress);
      const meta = el("div", "sb-as-use-progress-meta");
      meta.append(el("span", null, paused ? "任务已暂停" : "等待直播间新弹幕"), el("span", null, flow.taskState || "running"));
      panel.appendChild(meta);
    }

    const checks = el("div", "sb-as-use-checklist");
    [
      ["已连接授权账号", Boolean(flow.accountId) && !requiresAuthorization],
      ["持续接收直播间新弹幕", hasLiveSource || (!failed && !stopped)],
      ["弹幕用户进入触达队列", candidates > 0 || pending > 0 || (!failed && !stopped)],
      ["发送私信并记录回执", touched > 0 || (!failed && !stopped && snapshot.counters?.sent != null)]
    ].forEach(([label, done]) => {
      const row = el("div", `sb-as-use-check${done ? " is-done" : " is-active"}`);
      row.append(el("i", null, done ? "✓" : "·"), el("span", null, label));
      checks.appendChild(row);
    });
    panel.appendChild(checks);

    if (candidates || touched || pending) {
      const result = el("div", "sb-as-use-result sb-as-live-danmaku-outreach-result");
      [[candidates, "弹幕用户", "accent"], [touched, "已发送私信", "accent"], [pending, "待处理", ""]].forEach(([value, label, className]) => {
        const item = el("div");
        item.append(el("strong", className, String(value)), el("span", null, label));
        result.appendChild(item);
      });
      panel.appendChild(result);
    }
    panel.appendChild(el("div", "sb-as-use-notice", "每条新弹幕只作为触达触发条件，不做成交、购买意向或用户价值判断；具体发送结果会保留在成果中心。"));

    const actions = el("div", "sb-as-use-actions");
    if (failed) {
      const retry = el("button", "primary", flow.taskKey ? "重试任务" : "重新启动任务");
      retry.type = "button";
      retry.addEventListener("click", () => flow.taskKey ? void controlCommentAcquisitionTask(flow, "retry", retry).catch(() => {}) : void startLiveDanmakuOutreach(getMarketplaceAgent(flow.agentId || state.useId), flow));
      actions.appendChild(retry);
    } else if (requiresAuthorization) {
      const reconnect = el("button", "primary", "重新连接账号");
      reconnect.type = "button";
      reconnect.addEventListener("click", () => startMcpAuthorization(flow));
      actions.appendChild(reconnect);
    }
    const realtimeButton = el("button", null, "查看实时工作");
    realtimeButton.type = "button";
    realtimeButton.addEventListener("click", () => globalThis.__SALEBUDDY__?.navFrameworkReady?.then?.((framework) => framework?.openRealtimeWork?.({ selectedAgentId: flow.agentId, taskId: flow.taskId || null, taskRunId: flow.taskRunId || null, accountId: flow.accountId || null })));
    const resultButton = el("button", null, "查看触达结果");
    resultButton.type = "button";
    resultButton.addEventListener("click", () => globalThis.__SALEBUDDY__?.navFrameworkReady?.then?.((framework) => framework?.openProspects?.()));
    actions.append(realtimeButton, resultButton);
    panel.appendChild(actions);
  }

  function appendViralWorkAnalysisHero(shell, title, subtitle) {
    const hero = el("header", "sb-as-gold-hero");
    const heroMark = el("div", "sb-as-gold-hero-mark");
    mountGrokBotAvatar(heroMark, "mkt-viral-work-analysis", { alt: "爆款作品分析", state: "idle", trackPointer: false, mode: "agent-square" });
    const heroCopy = el("div", "sb-as-gold-hero-copy");
    heroCopy.append(
      el("h1", "sb-as-gold-title", title),
      el("p", "sb-as-gold-subtitle", subtitle)
    );
    hero.append(heroMark, heroCopy);
    shell.appendChild(hero);
  }

  function renderViralWorkAnalysisSetup(panel, flow) {
    panel.classList.add("sb-as-viral-work-analysis-setup");
    const shell = el("div", "sb-as-gold-shell sb-as-viral-shell");
    appendViralWorkAnalysisHero(
      shell,
      "我来帮你拆解这条爆款作品",
      "把作品链接发给我，我会先真正理解视频内容、画面和结构，再判断它为什么可能获得流量，最后给你下一轮可以验证的创作打法。"
    );

    const composer = el("section", "sb-as-viral-source");
    const primary = el("div", "sb-as-viral-primary");
    primary.appendChild(el("div", "sb-as-viral-source-kicker", "把你想研究的作品发给我"));
    const urlRow = el("div", "sb-as-viral-url-row");
    urlRow.appendChild(el("span", "sb-as-viral-url-icon", "↗"));
    const workUrl = document.createElement("input");
    workUrl.type = "url";
    workUrl.className = "sb-as-viral-url-input";
    workUrl.value = flow.workUrl || "";
    workUrl.placeholder = "把抖音作品链接粘贴给我（支持 /video/ 或 /jingxuan?modal_id=...）";
    workUrl.autocomplete = "url";
    workUrl.setAttribute("aria-label", "抖音作品链接");
    workUrl.addEventListener("input", () => {
      flow.workUrl = workUrl.value;
      flow.setupError = null;
    });
    urlRow.appendChild(workUrl);
    primary.appendChild(urlRow);
    primary.appendChild(el("span", "sb-as-viral-source-help", "这是公开作品，我会直接解析视频本身和可见评论，不需要登录抖音账号，也不会发送私信。"));
    composer.appendChild(primary);

    const focus = el("div", "sb-as-viral-focus");
    const focusHead = el("div", "sb-as-viral-focus-head");
    focusHead.append(
      el("div", "sb-as-viral-focus-label", "你想让我重点拆解什么？（可选）"),
      el("span", "sb-as-viral-focus-hint", "不填也可以，我会自己判断重点")
    );
    focus.appendChild(focusHead);
    const goal = document.createElement("textarea");
    goal.rows = 3;
    goal.className = "sb-as-viral-focus-input";
    goal.value = flow.viralWorkGoal || VIRAL_WORK_ANALYSIS_DEFAULT_GOAL;
    goal.placeholder = "例如：重点拆解前 3 秒的流量抓手、信息密度和下一条怎么测试";
    goal.setAttribute("aria-label", "爆款作品分析目标");
    goal.addEventListener("input", () => {
      flow.viralWorkGoal = goal.value;
      flow.setupError = null;
    });
    focus.appendChild(goal);

    const suggestions = el("div", "sb-as-viral-suggestions");
    suggestions.appendChild(el("span", "sb-as-viral-suggestions-label", "你也可以直接选一个重点"));
    [
      ["开头抓手", "重点拆解前 3 秒如何让用户停下来。"],
      ["内容结构", "重点拆解内容推进、转折和信息密度。"],
      ["流量机制", "重点判断这条作品可能获得传播的关键原因。"],
      ["可复用打法", "重点提炼下一条可以直接验证的创作方案。"]
    ].forEach(([label, value]) => {
      const suggestion = el("button", "sb-as-viral-suggestion", label);
      suggestion.type = "button";
      suggestion.addEventListener("click", () => {
        flow.viralWorkGoal = value;
        flow.setupError = null;
        render();
      });
      suggestions.appendChild(suggestion);
    });
    focus.appendChild(suggestions);
    composer.appendChild(focus);

    const note = el("div", "sb-as-viral-note");
    note.append(el("i", null, "i"), el("span", null, "我会区分视频事实、数据事实、流量机制判断和下一轮创作测试，避免把推测当成结论。"));
    composer.appendChild(note);
    if (flow.setupError) composer.appendChild(el("div", "sb-as-use-notice is-error sb-as-viral-error", flow.setupError));
    shell.appendChild(composer);

    const launch = el("footer", "sb-as-viral-launch");
    const start = el("button", "sb-as-viral-launch-button", flow.requesting ? "正在分析…" : "开始分析作品");
    start.type = "button";
    start.disabled = Boolean(flow.requesting);
    start.addEventListener("click", () => startUse(getMarketplaceAgent(state.useId)));
    launch.appendChild(start);
    shell.appendChild(launch);
    panel.appendChild(shell);
  }

  function renderViralWorkAnalysisRunning(panel, flow) {
    panel.classList.add("sb-as-viral-work-analysis-running");
    const result = flow.viralWorkAnalysis || flow.resultSnapshot || null;
    const failed = flow.status === "failed" || Boolean(flow.error);
    const title = failed ? "爆款作品分析异常" : result ? "爆款作品分析结果" : "爆款作品分析中";
    const copy = failed
      ? flow.error?.message || "这条作品暂时没有完成分析"
      : result
        ? "视频事实、流量信号和下一轮创作测试已经整理完成。"
        : "正在读取视频并解析画面、口播、字幕和内容节奏。";
    const shell = el("div", "sb-as-gold-shell sb-as-viral-shell");
    appendViralWorkAnalysisHero(shell, title, copy);
    const body = el("div", "sb-as-viral-running-body");
    if (flow.workUrl) {
      const source = el("div", "sb-as-use-notice");
      source.append(document.createTextNode("分析作品："));
      const link = el("a", null, flow.workUrl);
      link.href = flow.workUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      source.appendChild(link);
      body.appendChild(source);
    }
    if (flow.viralWorkGoal) body.appendChild(el("div", "sb-as-use-notice", `分析目标：${flow.viralWorkGoal}`));

    if (!result && !failed) {
      const progress = el("div", "sb-as-use-progress");
      const bar = el("i");
      bar.style.width = `${Math.max(0, Math.min(90, Number(flow.progress) || 0))}%`;
      progress.appendChild(bar);
      body.appendChild(progress);
      const meta = el("div", "sb-as-use-progress-meta");
      meta.append(el("span", null, flow.phase || "等待分析服务接收任务"), el("span", null, `${Math.max(0, Number(flow.progress) || 0)}%`));
      body.appendChild(meta);
      const checks = el("div", "sb-as-use-checklist");
      [["校验作品链接", 5], ["读取公开作品详情", 25], ["整理公开评论", 40], ["解析视频内容", 60], ["选择视频代表画面", 78], ["生成分析报告", 90]].forEach(([label, threshold]) => {
        const isDone = Number(flow.progress) >= threshold;
        const isActive = !isDone && Number(flow.progress) >= threshold - 15;
        const row = el("div", `sb-as-use-check${isDone ? " is-done" : isActive ? " is-active" : ""}`);
        row.append(el("i", null, isDone ? "✓" : isActive ? "·" : ""), el("span", null, label));
        checks.appendChild(row);
      });
      body.appendChild(checks);
    }

    if (result) {
      renderViralWorkAnalysisOverview(body, result);
      renderViralWorkAnalysisDetails(body, result);
    }
    if (failed) body.appendChild(el("div", "sb-as-use-notice is-error", `${flow.error?.message || "分析失败"}${flow.error?.code ? `（${flow.error.code}）` : ""}`));

    const actions = el("div", "sb-as-use-actions");
    const edit = el("button", null, result ? "再次分析" : "返回修改");
    edit.type = "button";
    edit.addEventListener("click", () => {
      flow.step = "setup";
      flow.requesting = false;
      flow.error = null;
      flow.setupError = null;
      flow.status = "";
      flow.progress = 0;
      flow.taskId = "";
      flow.taskRunId = "";
      flow.viralWorkAnalysis = null;
      flow.resultSnapshot = null;
      flow.analysisResult = null;
      render();
    });
    actions.appendChild(edit);
    const realtimeButton = el("button", null, "查看实时工作");
    realtimeButton.type = "button";
    realtimeButton.addEventListener("click", () => globalThis.__SALEBUDDY__?.navFrameworkReady?.then?.((framework) => framework?.openRealtimeWork?.({
      selectedAgentId: flow.agentId,
      taskId: flow.taskId || null,
      taskRunId: flow.taskRunId || null
    })));
    actions.appendChild(realtimeButton);
    if (result) {
      const results = el("button", "primary", "查看成果中心");
      results.type = "button";
      results.addEventListener("click", () => globalThis.__SALEBUDDY__?.navFrameworkReady?.then?.((framework) => framework?.openProspects?.()));
      actions.appendChild(results);
    } else if (failed) {
      const retry = el("button", "primary", "重新分析");
      retry.type = "button";
      retry.addEventListener("click", () => startUse(getMarketplaceAgent(state.useId)));
      actions.appendChild(retry);
    }
    body.appendChild(actions);
    shell.appendChild(body);
    panel.appendChild(shell);
  }

  async function startViralWorkAnalysis(agent, flow) {
    if (!flow || flow.requesting) return;
    const validation = validateViralWorkAnalysisSetup(flow);
    if (validation) {
      flow.setupError = validation;
      flow.step = "setup";
      render();
      return;
    }

    const payload = buildViralWorkAnalysisTaskPayload({
      ...flow,
      taskId: flow.taskId || newTaskId("viral-work-analysis"),
      taskRunId: newTaskId("run"),
      conversationId: `agent-square-${flow.taskId || "viral-work-analysis"}`
    });
    flow.step = "running";
    flow.requesting = true;
    flow.status = "running";
    flow.error = null;
    flow.setupError = null;
    flow.progress = 0;
    flow.phase = "等待分析服务接收任务";
    flow.taskId = payload.taskId;
    flow.taskRunId = payload.taskRunId;
    flow.analysisKind = "viral_work";
    flow.sourceScope = "public_work_link";
    flow.source = "抖音公开作品链接";
    flow.executionAgentId = agent.id;
    flow.configuration = structuredClone(payload.config);
    beginWork(agent.id, {
      task: payload.goal,
      phase: flow.phase,
      progress: flow.progress,
      projectId: null,
      metadata: {
        progressSource: "backend",
        publicDataTask: true,
        analysisKind: "viral_work",
        sourceScope: "public_work_link",
        sourceUrl: flow.workUrl,
        goal: flow.viralWorkGoal,
        taskId: flow.taskId,
        taskRunId: flow.taskRunId
      }
    });
    pushActivity(agent.id, "已收到作品链接，正在解析视频画面、口播、字幕和内容结构。");
    render();
    void globalThis.__SALEBUDDY__?.navFrameworkReady?.then?.((framework) => framework?.openRealtimeWork?.({
      selectedAgentId: agent.id,
      taskId: flow.taskId,
      taskRunId: flow.taskRunId
    }));

    try {
      const started = await executeCoreAgent({ ...payload, agentId: agent.id, executionAgentId: agent.id }, 300000);
      const result = started?.resultSnapshot || started?.result || started?.snapshot || null;
      if (!result || result.analysisKind !== "viral_work") {
        throw Object.assign(new Error("分析服务没有返回有效的作品分析结果"), { code: "VIRAL_WORK_ANALYSIS_RESULT_INVALID" });
      }
      const reportFile = viralWorkAnalysisReportFile({ ...result, taskId: flow.taskId, taskRunId: flow.taskRunId, sourceUrl: result.sourceUrl || flow.workUrl }, { createdBy: agent.name });
      const fileId = addFile({ ...reportFile, taskId: flow.taskId, taskRunId: flow.taskRunId, agentId: agent.id });
      const artifact = {
        id: fileId,
        name: reportFile.name,
        type: reportFile.type,
        projectName: reportFile.projectName,
        summary: "可在文件中心预览完整分析报告",
        sourceTaskTitle: reportFile.sourceTaskTitle
      };
      const conversation = viralWorkAnalysisReportConversationMessage({ ...reportFile, ...artifact });
      recordAgentActivity(agent.id, {
        type: "completed",
        taskId: flow.taskId,
        taskRunId: flow.taskRunId,
        activityKey: `viral-work-analysis-report:${flow.taskId}`,
        metadata: { deliverToConversation: true }
      }, {
        journal: agentActivityJournal,
        fromName: agent.name,
        text: conversation.text,
        artifact: conversation.artifact
      });

      flow.viralWorkAnalysis = { ...result, taskId: flow.taskId, taskRunId: flow.taskRunId, artifacts: [...(Array.isArray(result.artifacts) ? result.artifacts : []), artifact] };
      flow.resultSnapshot = flow.viralWorkAnalysis;
      flow.analysisResult = flow.viralWorkAnalysis;
      flow.status = String(result.status || started.status || "completed").toLowerCase();
      flow.progress = 100;
      const realtimeSnapshot = { ...flow.viralWorkAnalysis };
      if (realtimeSnapshot.videoFrames && typeof realtimeSnapshot.videoFrames === "object") {
        const { frames: _frames, ...videoFrames } = realtimeSnapshot.videoFrames;
        realtimeSnapshot.videoFrames = videoFrames;
      }
      agentResultRecorder.record({
        ...flow.viralWorkAnalysis,
        agentId: agent.id,
        agentName: agent.name,
        taskId: flow.taskId,
        taskRunId: flow.taskRunId,
        title: flow.viralWorkAnalysis.title || "爆款作品分析报告",
        summary: flow.viralWorkAnalysis.summary,
        source: "抖音公开作品链接",
        status: flow.status === "partial" ? "partial" : "completed",
        metrics: flow.viralWorkAnalysis.metrics,
        items: [],
        artifacts: [artifact],
        sourceScope: "public_work_link",
        inputs: {
          ...(flow.viralWorkAnalysis.inputs || {}),
          goal: flow.viralWorkGoal,
          sourceScope: "public_work_link",
          workUrl: flow.workUrl
        }
      });
      updateWork(agent.id, {
        progress: 100,
        phase: flow.status === "partial" ? "部分报告已生成" : "分析报告已生成",
        metadata: {
          status: flow.status,
          progressSource: "backend",
          analysisKind: "viral_work",
          publicDataTask: true,
          sourceScope: "public_work_link",
          sourceUrl: flow.workUrl,
          goal: flow.viralWorkGoal,
          taskId: flow.taskId,
          taskRunId: flow.taskRunId,
          resultSnapshot: realtimeSnapshot
        }
      });
      finishWork(agent.id, flow.viralWorkAnalysis.summary || "爆款作品分析报告", { taskId: flow.taskId, taskRunId: flow.taskRunId, suppressCompletionNotification: true });
      pushActivity(agent.id, flow.status === "partial" ? "作品数据已读取，评论数据部分可用，报告已生成。" : "爆款作品分析已完成，报告已同步到成果中心和文件中心。");
    } catch (error) {
      flow.status = "failed";
      flow.progress = 0;
      flow.error = { code: error?.code || "VIRAL_WORK_ANALYSIS_FAILED", message: error?.message || "爆款作品分析失败" };
      updateWork(agent.id, {
        progress: 0,
        phase: "执行失败",
        metadata: {
          status: "failed",
          progressSource: "backend",
          analysisKind: "viral_work",
          publicDataTask: true,
          sourceScope: "public_work_link",
          sourceUrl: flow.workUrl,
          goal: flow.viralWorkGoal,
          taskId: flow.taskId,
          taskRunId: flow.taskRunId
        }
      });
      reportWorkError(agent.id, `爆款作品分析未完成：${flow.error.message}`, { taskId: flow.taskId, taskRunId: flow.taskRunId });
    } finally {
      flow.requesting = false;
      if (!disposed && state.useFlow === flow) render();
    }
  }

  function finderAccountLabel(account) {
    const profile = account?.profile || account?.identity || {};
    return String(profile.nickname || profile.nick_name || profile.name || profile.unique_id || profile.uniqueId || account?.sec_uid || "未命名账号").trim();
  }

  function finderAccountEvidence(account) {
    const profile = account?.profile || {};
    const followers = profile.follower_count ?? profile.followers ?? profile.followerCount;
    const awemeCount = profile.aweme_count ?? profile.awemeCount ?? profile.video_count ?? profile.videoCount;
    const live = account?.live?.is_live ?? account?.live?.isLive ?? account?.live?.live;
    const parts = [];
    if (account?.growth?.newFollowers != null) parts.push(`近 ${account.growth.windowDays || "?"} 天涨粉 ${Number(account.growth.newFollowers).toLocaleString("zh-CN")}`);
    if (followers != null) parts.push(`粉丝 ${followers}`);
    if (awemeCount != null) parts.push(`作品 ${awemeCount}`);
    if (live === true) parts.push("正在直播");
    if (account?.videos?.length) parts.push(`近期作品 ${account.videos.length} 条`);
    return parts.join(" · ") || "已完成账号解析，待补充更多画像数据";
  }

  function finderCombinedInputs(flow) {
    return [String(flow?.finderInputs || "").trim(), ...(flow?.finderFileUrls || [])]
      .filter(Boolean)
      .join("\n");
  }

  function finderReferenceCount(flow) {
    const combined = finderCombinedInputs(flow);
    const urls = mergePrivateOutreachUrls(combined);
    if (urls.length) return urls.length;
    return combined.split(/\n+/).map((value) => value.trim()).filter(Boolean).length;
  }

  function renderUserResearchSetup(panel, flow) {
    panel.classList.add("sb-as-finder-consumer");
    mountTaskChoices(panel, { flow, group: "research", field: "finderGoal", filters: true, onChange: (_goal, edited) => { if (edited) flow.fieldErrors = {}; } });
    const fields = el("div", "sb-as-use-fields");
    const surveyUrl = document.createElement("input");
    surveyUrl.type = "url";
    surveyUrl.value = flow.surveyUrl || "";
    surveyUrl.placeholder = "粘贴问卷链接，例如 https://wj.qq.com/...";
    surveyUrl.addEventListener("input", () => { flow.surveyUrl = surveyUrl.value; flow.fieldErrors = {}; });
    appendLabeledField(fields, "问卷链接", surveyUrl, true);
    const resultLimit = document.createElement("select");
    [[10, "先找 10 位"], [20, "找 20 位"], [50, "找 50 位"]].forEach(([value, label]) => {
      const option = el("option", null, label); option.value = String(value); resultLimit.appendChild(option);
    });
    resultLimit.value = String(flow.finderResultLimit || 10);
    resultLimit.addEventListener("change", () => { flow.finderResultLimit = Number(resultLimit.value) || 10; });
    appendLabeledField(fields, "希望邀请多少人", resultLimit);
    panel.appendChild(fields);

    const references = document.createElement("details");
    references.className = "sb-as-finder-source";
    const summary = document.createElement("summary");
    const summaryCopy = el("div");
    summaryCopy.append(el("strong", null, "添加参考账号"), el("span", null, "可选 · 帮助理解你要找的人"));
    summary.appendChild(summaryCopy);
    const input = document.createElement("textarea");
    input.className = "sb-as-finder-source-input";
    input.rows = 3;
    input.value = flow.finderInputs || "";
    input.placeholder = "每行一个抖音主页链接；不添加也可以直接开始";
    input.addEventListener("input", () => { flow.finderInputs = input.value; });
    const body = el("div", "sb-as-finder-source-body");
    const fileLabel = el("label", "sb-as-finder-file");
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".txt,.csv,.tsv,.xls,.xlsx,text/plain,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    const fileCopy = el("div");
    fileCopy.append(
      el("strong", null, flow.finderFileName ? "已添加参考名单" : "上传参考账号名单"),
      el("span", null, flow.finderFileName || "支持 TXT、CSV、TSV、XLS、XLSX；只在本地读取主页链接")
    );
    fileLabel.append(el("span", "sb-as-finder-file-icon", "↑"), fileCopy, fileInput);
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      try {
        const parsed = await readPrivateOutreachFile(file);
        flow.finderFileName = parsed.name;
        flow.finderFileUrls = parsed.urls;
        flow.finderFileError = parsed.urls.length ? null : "名单中没有找到抖音账号主页";
      } catch (error) {
        flow.finderFileName = file.name;
        flow.finderFileUrls = [];
        flow.finderFileError = error?.message || "名单读取失败";
      }
      render();
    });
    body.append(input, fileLabel, el("div", "sb-as-finder-source-foot", "参考账号只用于提高筛选精准度，不会被自动触达。"));
    if (flow.finderFileError) body.appendChild(el("div", "sb-as-use-notice is-error", flow.finderFileError));
    references.append(summary, body);
    panel.appendChild(references);

    const errors = flow.fieldErrors || {};
    if (errors.finderGoal || errors.surveyUrl) panel.appendChild(el("div", "sb-as-use-notice is-error", [errors.finderGoal, errors.surveyUrl].filter(Boolean).join(" ")));
    const actions = el("div", "sb-as-use-actions sb-as-finder-actions");
    const start = el("button", "primary", "先找合适的人");
    start.type = "button";
    start.addEventListener("click", () => {
      flow.fieldErrors = validateUserResearchSetup(flow);
      if (Object.keys(flow.fieldErrors).length) { render(); return; }
      flow.researchPhase = "finding";
      startUse(getMarketplaceAgent(state.useId));
    });
    actions.appendChild(start);
    panel.appendChild(actions);
  }

  function renderUserResearchReview(panel, flow) {
    const candidates = Array.isArray(flow.surveyCandidates) ? flow.surveyCandidates : [];
    const selected = new Set(flow.surveySelectedIds || []);
    panel.append(
      el("div", "sb-as-use-panel-title", `找到 ${candidates.length} 位可邀请的受访者`),
      el("div", "sb-as-use-panel-copy", "核对匹配理由，选择发送账号和邀请对象。只有点击“确认并发送问卷”后才会真实发送私信。")
    );
    const list = el("div", "sb-as-finder-result sb-as-user-research-list");
    candidates.forEach((candidate) => {
      const row = el("label", "sb-as-finder-result-row");
      const copy = el("div");
      const check = document.createElement("input");
      check.type = "checkbox";
      check.checked = selected.has(candidate.accountId || candidate.id);
      check.addEventListener("change", () => {
        const id = candidate.accountId || candidate.id;
        flow.surveySelectedIds = check.checked
          ? [...new Set([...(flow.surveySelectedIds || []), id])]
          : (flow.surveySelectedIds || []).filter((value) => value !== id);
        render();
      });
      const reasons = Array.isArray(candidate.reasons) && candidate.reasons.length ? candidate.reasons.join("；") : candidate.reason || finderAccountEvidence(candidate);
      copy.append(el("strong", null, finderAccountLabel(candidate)), el("span", null, reasons));
      const score = el("div", "sb-as-finder-score", candidate.score == null ? "—" : String(candidate.score));
      row.append(check, copy, score);
      list.appendChild(row);
    });
    panel.appendChild(list);

    const fields = el("div", "sb-as-use-fields");
    const accounts = flow.authorizedAccounts || [];
    const accountSelect = document.createElement("select");
    (accounts.length ? accounts : [{ id: "", name: flow.loadingAccounts ? "正在读取登录账号…" : "还没有可用的登录账号" }]).forEach((account) => {
      const option = el("option", null, account.name || "账号名称未返回"); option.value = account.id || ""; accountSelect.appendChild(option);
    });
    accountSelect.value = flow.accountId || accounts[0]?.id || "";
    accountSelect.disabled = !accounts.length;
    accountSelect.addEventListener("change", () => {
      const account = accounts.find((item) => item.id === accountSelect.value) || null;
      flow.accountId = account?.id || "";
      flow.account = account?.name || "";
      flow.accountIdentity = account?.identity || null;
      flow.executionAgentId = account?.agentId || "mkt-cold-writer";
    });
    const accountControl = el("div");
    accountControl.style.cssText = "display:flex;align-items:center;gap:8px";
    accountSelect.style.flex = "1";
    const authorize = el("button", "sb-as-inbox-authorize", accounts.length ? "授权新账号" : "连接抖音账号");
    authorize.type = "button";
    authorize.addEventListener("click", () => { flow.executionAgentId = "mkt-cold-writer"; startMcpAuthorization(flow); });
    accountControl.append(accountSelect, authorize);
    appendLabeledField(fields, "用哪个账号发送", accountControl, true);
    const message = document.createElement("textarea");
    message.rows = 4;
    message.value = flow.message || buildSurveyInvitation({ audienceGoal: flow.finderGoal, questionnaireUrl: flow.surveyUrl });
    message.addEventListener("input", () => { flow.message = message.value; });
    appendLabeledField(fields, "问卷邀请内容", message, true);
    panel.appendChild(fields);
    panel.appendChild(el("div", "sb-as-use-notice", `将向 ${selected.size} 位用户发送。发送动作会逐条打开真实主页并等待平台回执，不会把提交动作当作成功。`));
    if (flow.authError) panel.appendChild(el("div", "sb-as-use-notice is-error", flow.authError));
    const actions = el("div", "sb-as-use-actions");
    const back = el("button", null, "调整人群条件");
    back.type = "button";
    back.addEventListener("click", () => { flow.step = "setup"; flow.researchPhase = "setup"; render(); });
    const send = el("button", "primary", "确认并发送问卷");
    send.type = "button";
    send.disabled = !selected.size;
    send.addEventListener("click", () => {
      if (!flow.accountId) { flow.authError = "请选择一个已登录的抖音账号，或先连接新账号。"; render(); return; }
      flow.message = buildSurveyInvitation({ questionnaireUrl: flow.surveyUrl, customMessage: message.value });
      flow.targetEntries = buildSurveyOutreachTargets(candidates, { selectedIds: flow.surveySelectedIds });
      flow.researchPhase = "outreach";
      startPrivateOutreach(getMarketplaceAgent(state.useId), flow);
    });
    actions.append(back, send);
    panel.appendChild(actions);
  }

  function renderUserResearchRunning(panel, flow) {
    if (flow.researchPhase === "outreach") renderPrivateOutreachRunning(panel, flow);
    else renderDouyinFinderRunning(panel, flow);
  }

  function selectedChoiceLabels(flow, group) {
    const state = flow.taskChoices?.[group] || {};
    const catalog = TASK_CHOICES[group];
    return (catalog?.options || [])
      .filter((choice) => state.selected?.includes(choice.id))
      .map((choice) => choice.label);
  }

  function publicFinderTargetText(flow) {
    return String(flow.publicFinderQuery || "").trim();
  }

  function hasPublicFinderTarget(flow) {
    return Boolean(publicFinderTargetText(flow));
  }

  function publicFinderNeedsBusinessAccount(flow = {}) {
    return needsPublicFinderBusinessAccount({
      query: flow.publicFinderQuery
    });
  }

  function publicFinderBusinessAccountError(flow = {}) {
    return validatePublicFinderBusinessAccount({
      required: publicFinderNeedsBusinessAccount(flow),
      businessAccountUrl: flow.publicFinderAccountUrl
    });
  }

  function publicFinderCanStart(flow = {}) {
    return hasPublicFinderTarget(flow)
      && flow.publicFinderAccountStatus !== "loading"
      && !publicFinderBusinessAccountError(flow);
  }

  function publicFinderReferenceUrls(value) {
    const values = String(value || "")
      .split(/[\n\r,，;；]+/)
      .map((item) => item.trim())
      .filter(Boolean);
    return [...new Set(values)].slice(0, 20);
  }

  function publicFinderAccountName(identity) {
    return String(identity?.nickname || identity?.uniqueId || identity?.unique_id || "已识别账号").trim();
  }

  async function resolvePublicFinderBusinessAccount(flow) {
    const profileUrl = String(flow.publicFinderAccountUrl || "").trim();
    if (!profileUrl) {
      flow.publicFinderAccountStatus = "error";
      flow.publicFinderAccountError = "请先粘贴抖音账号主页链接";
      render();
      return;
    }
    try {
      if (!isDouyinProfileUrl(profileUrl)) throw new Error("invalid_profile_url");
    } catch {
      flow.publicFinderAccountStatus = "error";
      flow.publicFinderAccountError = "请输入有效的抖音账号主页链接";
      render();
      return;
    }
    flow.publicFinderAccountStatus = "loading";
    flow.publicFinderAccountError = null;
    render();
    try {
      const response = await fetch(`${String(controlPlaneBaseUrl()).replace(/\/$/, "")}/v1/connectors/prospect/resolve-account`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ profileUrl })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.accepted === false || !payload?.account) {
        const error = payload?.error || {};
        throw Object.assign(new Error(error.message || `账号识别失败（HTTP ${response.status}）`), { code: error.code || "ACCOUNT_RESOLUTION_FAILED" });
      }
      if (state.useFlow !== flow) return;
      flow.publicFinderAccountIdentity = payload.account;
      flow.publicFinderAccountStatus = "ready";
      flow.publicFinderAccountError = null;
      syncCompositeFinderFlow(flow);
      render();
    } catch (error) {
      if (state.useFlow !== flow) return;
      flow.publicFinderAccountStatus = "error";
      flow.publicFinderAccountError = error?.message || "账号识别失败，请检查链接是否公开可见";
      render();
    }
  }

  function renderPublicFinderBrief(panel, flow, { onChange = () => {} } = {}) {
    const brief = el("section", "sb-public-finder-brief");
    const heading = el("div", "sb-public-finder-brief-heading");
    heading.append(
      el("strong", null, "直接告诉我你想找什么人"),
      el("span", null, "不用先选分类。把行业、产品、城市、需求或合作方式直接说出来。")
    );
    const customField = el("label", "sb-public-finder-field sb-public-finder-goal-field");
    customField.appendChild(el("span", "sb-public-finder-label", "找人需求"));
    const goal = document.createElement("textarea");
    goal.rows = 4;
    goal.value = flow.publicFinderQuery || "";
    goal.placeholder = "例如：找公开表达过购买、询价或试驾需求的上海新能源 SUV 用户";
    goal.setAttribute("aria-label", "找人需求");
    customField.appendChild(goal);
    const promptLabel = el("div", "sb-public-finder-prompt-label", "可以这样说");
    const prompts = el("div", "sb-public-finder-prompts");
    const quickPrompts = [
      ["明确购买需求", "找公开表达过购买、询价或比较需求的人"],
      ["内容合作", "找持续发布相关内容、适合合作的创作者"],
      ["本地商家", "找上海正在经营的家居门店或装修服务商"],
      ["行业账号", "找新能源 SUV 行业里的品牌、商家或同行账号"]
    ];
    quickPrompts.forEach(([label, prompt]) => {
      const button = el("button", "sb-public-finder-prompt", label);
      button.type = "button";
      button.title = prompt;
      button.dataset.publicFinderPrompt = "true";
      button.addEventListener("click", () => {
        goal.value = prompt;
        flow.publicFinderQuery = prompt;
        syncCompositeFinderFlow(flow);
        onChange();
        goal.focus();
      });
      prompts.appendChild(button);
    });
    brief.append(heading, customField, promptLabel, prompts);

    const limit = el("label", "sb-public-finder-limit");
    limit.appendChild(el("span", "sb-public-finder-label", "希望找到多少个账号？"));
    const limitControl = el("div", "sb-public-finder-limit-control");
    const resultLimit = document.createElement("input");
    resultLimit.type = "number";
    resultLimit.min = "1";
    resultLimit.step = "1";
    resultLimit.value = String(flow.finderResultLimit || 10);
    resultLimit.setAttribute("aria-label", "希望找到多少个账号");
    limitControl.append(resultLimit, el("span", null, "个"));
    limit.appendChild(limitControl);

    const accountContext = document.createElement("details");
    accountContext.className = "sb-public-finder-context";
    const contextSummary = document.createElement("summary");
    const summaryCopy = el("span", "sb-public-finder-context-copy");
    const contextTitle = el("strong");
    const contextSubtitle = el("small");
    summaryCopy.append(
      contextTitle,
      contextSubtitle
    );
    contextSummary.appendChild(summaryCopy);
    const contextBody = el("div", "sb-public-finder-context-body");
    const businessField = el("label", "sb-public-finder-field");
    const businessLabel = el("span", "sb-public-finder-label");
    businessField.appendChild(businessLabel);
    const businessRow = el("div", "sb-public-finder-account-row");
    const businessAccount = document.createElement("input");
    businessAccount.type = "url";
    businessAccount.value = flow.publicFinderAccountUrl || "";
    businessAccount.placeholder = "粘贴抖音账号主页链接";
    businessAccount.setAttribute("aria-label", "我的抖音账号主页链接");
    const resolve = el("button", "sb-public-finder-resolve", "解析账号");
    resolve.type = "button";
    resolve.disabled = flow.publicFinderAccountStatus === "loading";
    businessRow.append(businessAccount, resolve);
    const businessHint = el("small", "sb-public-finder-hint");
    if (flow.publicFinderAccountStatus === "loading") businessHint.textContent = "正在解析账号…";
    else if (flow.publicFinderAccountStatus === "ready") businessHint.textContent = `已识别：${publicFinderAccountName(flow.publicFinderAccountIdentity)}。仅作为业务与内容参照，不会进入候选名单。`;
    else if (flow.publicFinderAccountError) businessHint.textContent = flow.publicFinderAccountError;
    else businessHint.textContent = "用于理解你的业务与内容，不会作为候选账号。";
    businessHint.classList.toggle("is-error", flow.publicFinderAccountStatus === "error");
    businessField.append(businessRow, businessHint);

    const referenceField = el("label", "sb-public-finder-field");
    referenceField.appendChild(el("span", "sb-public-finder-label", "参考账号（选填）"));
    const references = document.createElement("textarea");
    references.rows = 3;
    references.value = flow.publicFinderReferenceUrls || "";
    references.placeholder = "每行粘贴一个抖音主页链接，可填同行、创作者或活跃账号";
    references.setAttribute("aria-label", "参考账号主页链接");
    referenceField.append(references, el("small", "sb-public-finder-hint", "提交时只作筛选参照，不会加入候选名单。"));

    const sync = () => {
      flow.publicFinderQuery = goal.value;
      flow.publicFinderAccountUrl = businessAccount.value;
      flow.publicFinderReferenceUrls = references.value;
      flow.finderResultLimit = Math.max(1, Math.floor(Number(resultLimit.value) || 10));
      flow.publicFinderAccountError = null;
      if (!flow.publicFinderAccountUrl.trim()) {
        flow.publicFinderAccountIdentity = null;
        flow.publicFinderAccountStatus = "idle";
      }
      syncCompositeFinderFlow(flow);
      onChange();
    };
    goal.addEventListener("input", sync);
    businessAccount.addEventListener("input", sync);
    references.addEventListener("input", sync);
    resultLimit.addEventListener("input", sync);
    resolve.addEventListener("click", () => { sync(); void resolvePublicFinderBusinessAccount(flow); });

    contextBody.append(businessField, referenceField);
    accountContext.append(contextSummary, contextBody);
    brief.append(limit, accountContext);
    panel.appendChild(brief);

    const controls = { accountContext, contextTitle, contextSubtitle, businessField, businessLabel, businessAccount, businessHint, resolve };
    syncPublicFinderAccountPresentation(controls, flow);
    return controls;
  }

  function syncPublicFinderAccountPresentation(controls, flow = {}) {
    if (!controls) return;
    const required = publicFinderNeedsBusinessAccount(flow);
    controls.accountContext.open = required || Boolean(flow.publicFinderAccountUrl || flow.publicFinderReferenceUrls || flow.publicFinderAccountError);
    controls.accountContext.classList.toggle("is-required", required);
    controls.contextTitle.textContent = required ? "提供你的账号作为对标基准（必填）" : "使用账号辅助搜索（选填）";
    controls.contextSubtitle.textContent = required
      ? "竞品或同行账号需要基于你的账号定位，自己的主页链接不会进入候选名单"
      : "粘贴自己的业务账号或参考账号，让结果更贴近实际业务";
    controls.businessLabel.textContent = required ? "我的抖音账号主页链接（必填）" : "我的业务账号（选填）";
    controls.businessAccount.required = required;
    controls.businessAccount.setAttribute("aria-required", String(required));
    if (flow.publicFinderAccountStatus === "loading") controls.businessHint.textContent = "正在解析账号…";
    else if (flow.publicFinderAccountStatus === "ready") controls.businessHint.textContent = required
      ? `已识别：${publicFinderAccountName(flow.publicFinderAccountIdentity)}，将作为对标依据，不会进入候选名单。`
      : `已识别：${publicFinderAccountName(flow.publicFinderAccountIdentity)}。仅作为业务与内容参照，不会进入候选名单。`;
    else if (flow.publicFinderAccountError) controls.businessHint.textContent = flow.publicFinderAccountError;
    else if (required) controls.businessHint.textContent = "先粘贴你的抖音账号主页链接，才能查找竞品或同行账号。";
    else controls.businessHint.textContent = "用于理解你的业务与内容，不会作为候选账号。";
    controls.businessHint.classList.toggle("is-error", flow.publicFinderAccountStatus === "error" || (required && !String(flow.publicFinderAccountUrl || "").trim()));
    controls.resolve.disabled = flow.publicFinderAccountStatus === "loading";
  }

  function publicFinderFilterSummary(flow) {
    const filters = flow.taskChoices?.finderPublicPurpose || {};
    return [
      filters.industry ? `行业：${filters.industry}` : "",
      filters.region ? `地区：${filters.region}` : "",
      filters.followers ? `粉丝：${filters.followers}` : ""
    ].filter(Boolean).join("；");
  }

  function renderPublicFinderFilters(panel, flow, { onChange = () => {} } = {}) {
    flow.taskChoices ||= {};
    const filterState = flow.taskChoices.finderPublicPurpose ||= {};
    const filters = document.createElement("details");
    filters.className = "sb-public-finder-filters";
    filters.open = Boolean(filterState.industry || filterState.region || filterState.followers);
    const summary = document.createElement("summary");
    summary.append(
      el("strong", null, "添加筛选条件（选填）"),
      el("span", null, "行业、地区、粉丝规模")
    );
    const body = el("div", "sb-public-finder-filters-body");
    const fields = [
      ["industry", "行业", ["家居家装", "美妆护肤", "服饰穿搭", "餐饮美食", "数码科技", "汽车服务", "教育培训", "母婴育儿", "运动健身", "旅游出行", "宠物用品", "本地生活"]],
      ["region", "地区", ["北京", "上海", "广州", "深圳", "杭州", "成都", "重庆", "武汉", "南京", "苏州", "西安"]],
      ["followers", "粉丝规模", ["1000 以上", "1 万以上", "10 万以上"]]
    ];
    for (const [key, label, values] of fields) {
      const field = el("label", "sb-public-finder-filter-field");
      field.appendChild(el("span", null, label));
      const select = document.createElement("select");
      select.setAttribute("aria-label", `${label}筛选`);
      const defaultOption = el("option", null, `不限${label}`);
      defaultOption.value = "";
      select.appendChild(defaultOption);
      values.forEach((value) => {
        const option = el("option", null, value);
        option.value = value;
        select.appendChild(option);
      });
      select.value = filterState[key] || "";
      select.addEventListener("change", () => {
        filterState[key] = select.value;
        syncCompositeFinderFlow(flow);
        onChange();
      });
      field.appendChild(select);
      body.appendChild(field);
    }
    filters.append(summary, body);
    panel.appendChild(filters);
  }

  function syncCompositeFinderFlow(flow, signalText = "") {
    const publicFinder = flow.compositeFinderSource === "public";
    const contextLabel = selectedChoiceLabels(flow, publicFinder ? "finderPublicPurpose" : "finderOwnData").join("、");
    if (publicFinder) {
      const targetText = publicFinderTargetText(flow);
      const filterSummary = publicFinderFilterSummary(flow);
      flow.finderAccountContext = {
        businessAccountUrl: String(flow.publicFinderAccountUrl || "").trim(),
        referenceAccountUrls: publicFinderReferenceUrls(flow.publicFinderReferenceUrls)
      };
      flow.finderGoal = ["公域找人", targetText, filterSummary, String(signalText || "").trim()].filter(Boolean).join("\n");
      flow.product = "公开账号检索";
      flow.requirements = targetText;
      flow.audienceTypes = [];
      flow.source = "抖音公域公开资料";
      flow.sourceScope = "public_search";
      flow.commentSourceOwner = "other";
      flow.commentSourceDimension = "account";
      flow.executionAgentId = "mkt-find-people";
      flow.analysisOnly = true;
      return;
    }

    const listenerSourceScope = finderListenerSourceScope(flow);
    flow.finderGoal = ["我的账号", contextLabel].filter(Boolean).join("\n");
    flow.product = "账号互动用户汇总";
    flow.requirements = "";
    flow.audienceTypes = [];
    flow.source = `我的账号${finderListenerSourceLabel(listenerSourceScope)}`;
    flow.sourceScope = listenerSourceScope;
    flow.commentSourceOwner = "own";
    flow.commentSourceDimension = listenerSourceScope === "authorized_account_live" ? "live" : "account";
    flow.executionAgentId = "mkt-comment-acquisition";
    flow.analysisOnly = false;
  }

  function renderCompositeFinderSetup(panel, flow) {
    panel.classList.add("sb-as-finder-consumer", "sb-as-composite-finder");
    flow.compositeFinderStep ||= "source";
    if (flow.compositeFinderStep === "signals") flow.compositeFinderStep = "criteria";
    const step = flow.compositeFinderStep;
    const steps = el("div", "sb-composite-finder-steps");
    const publicFinder = flow.compositeFinderSource === "public";
    if (publicFinder) steps.classList.add("is-public");
    const stepLabels = publicFinder ? ["来源", "需求"] : ["来源", "互动范围"];
    const stepIndex = step === "source" ? 0 : 1;
    stepLabels.forEach((label, index) => {
      const current = index === stepIndex;
      const done = index < stepIndex;
      steps.appendChild(el("div", `sb-composite-finder-step${current ? " is-active" : done ? " is-done" : ""}`, `${index + 1}  ${label}`));
    });
    panel.appendChild(steps);

    if (step === "source") {
      panel.append(
        el("div", "sb-as-use-panel-title", "这次从哪里找人？"),
        el("div", "sb-as-use-panel-copy", "选择数据来源后再补充条件。公域找人只分析公开资料；我的账号只汇总启用后的新互动用户。")
      );
      const sourceGrid = el("div", "sb-composite-finder-source-grid");
      const sourceOptions = [
        {
          value: "own",
          title: "我的账号互动用户",
          copy: "持续汇总已授权账号的新评论、直播互动和账号互动通知"
        },
        {
          value: "public",
          title: "公域找人",
          copy: "从公开资料中找符合你描述的人、账号或商家"
        }
      ];
      const sourceButtons = [];
      const syncSourceSelection = () => {
        sourceButtons.forEach(({ value, button }) => {
          const selected = flow.compositeFinderSource === value;
          button.classList.toggle("is-selected", selected);
          button.setAttribute("aria-pressed", String(selected));
        });
        const next = panel.querySelector("[data-choice-start]");
        if (next) next.disabled = !flow.compositeFinderSource;
      };
      sourceOptions.forEach(({ value, title, copy }) => {
        const option = el("button", "sb-composite-finder-source-option");
        option.type = "button";
        option.dataset.finderSource = value;
        option.append(el("strong", null, title), el("span", null, copy));
        option.addEventListener("click", () => {
          flow.compositeFinderSource = value;
          flow.setupError = null;
          syncSourceSelection();
        });
        sourceButtons.push({ value, button: option });
        sourceGrid.appendChild(option);
      });
      panel.appendChild(sourceGrid);
      const actions = el("div", "sb-as-use-actions sb-as-finder-actions");
      const next = el("button", "primary", "下一步");
      next.type = "button";
      next.dataset.choiceStart = "true";
      next.disabled = !flow.compositeFinderSource;
      next.addEventListener("click", () => { flow.compositeFinderStep = "criteria"; flow.setupError = null; render(); });
      actions.appendChild(next);
      panel.appendChild(actions);
      syncSourceSelection();
      return;
    }

    if (flow.compositeFinderSource === "public") {
      panel.append(
        el("div", "sb-as-use-panel-title", "告诉我你要找谁"),
        el("div", "sb-as-use-panel-copy", "直接描述目标，系统只根据你的需求和公开资料搜索；不需要先绑定账号。若要找同行或竞品，会再要求提供账号作为参照。")
      );
      let publicFinderBrief = null;
      const syncPublicFinderStart = () => {
        syncPublicFinderAccountPresentation(publicFinderBrief, flow);
        const start = panel.querySelector("[data-choice-start]");
        if (start) start.disabled = !publicFinderCanStart(flow);
      };
      publicFinderBrief = renderPublicFinderBrief(panel, flow, {
        onChange: syncPublicFinderStart
      });
      renderPublicFinderFilters(panel, flow, {
        onChange: syncPublicFinderStart
      });
      if (flow.setupError) panel.appendChild(el("div", "sb-as-use-notice is-error", flow.setupError));
      const actions = el("div", "sb-as-use-actions sb-as-finder-actions");
      const back = el("button", null, "上一步");
      back.type = "button";
      back.addEventListener("click", () => { flow.compositeFinderStep = "source"; render(); });
      const start = el("button", "primary", "开始找人");
      start.type = "button";
      start.dataset.choiceStart = "true";
      start.disabled = !publicFinderCanStart(flow);
      start.addEventListener("click", () => {
        syncCompositeFinderFlow(flow);
        const accountError = publicFinderBusinessAccountError(flow);
        if (accountError) {
          flow.setupError = accountError;
          render();
          return;
        }
        if (flow.publicFinderAccountStatus === "loading") {
          flow.setupError = "正在识别你的账号，请稍候。";
          render();
          return;
        }
        const scopeError = douyinFinderScopeError(flow);
        if (scopeError) {
          flow.setupError = scopeError;
          render();
          return;
        }
        flow.setupError = null;
        startUse(getMarketplaceAgent(state.useId));
      });
      actions.append(back, start);
      panel.appendChild(actions);
      return;
    }

    const ownDataSources = finderOwnDataSelections(flow);
    const live = ownDataSources.length === 1 && ownDataSources[0] === "live";

    panel.append(
        el("div", "sb-as-use-panel-title", "选择要汇总的互动范围"),
        el("div", "sb-as-use-panel-copy", "可同时选择评论、直播间互动和账号互动通知。只处理启用后新出现的信号，所有出现过的用户都会被汇总并保留原始证据。")
    );

    panel.appendChild(acquisitionAccountControl(flow, () => render()));
    mountTaskChoices(panel, {
      flow,
      group: "finderOwnData",
      field: "compositeFinderDataSourceLabel",
      allowFreeText: false,
      onChange: () => {
        syncCompositeFinderFlow(flow);
        const next = panel.querySelector("[data-choice-start]");
        if (next) next.disabled = !flow.accountId || !flow.taskChoices.finderOwnData?.selected?.length;
      }
    });

    const actions = el("div", "sb-as-use-actions sb-as-finder-actions");
    const back = el("button", null, "上一步");
    back.type = "button";
    back.addEventListener("click", () => { flow.compositeFinderStep = "source"; render(); });
    const start = el("button", "primary", "开始汇总用户");
    start.type = "button";
    start.dataset.choiceStart = "true";
    start.disabled = !flow.accountId || !flow.taskChoices.finderOwnData?.selected?.length;
    start.addEventListener("click", () => {
      syncCompositeFinderFlow(flow);
      flow.setupError = null;
      startUse(getMarketplaceAgent(state.useId));
    });
    actions.append(back, start);
    panel.appendChild(actions);

    if (flow.setupError) panel.appendChild(el("div", "sb-as-use-notice is-error", flow.setupError));
  }

  function renderDouyinFinderSetup(panel, flow) {
    if (isCompositeFinderAgent(getMarketplaceAgent(state.useId))) {
      renderCompositeFinderSetup(panel, flow);
      return;
    }
    panel.classList.add("sb-as-finder-consumer");
    const finderChoices = flow.taskChoices.finder ||= {};
    if (!finderChoices.industry && flow.finderIndustry) finderChoices.industry = flow.finderIndustry;
    mountTaskChoices(panel, {
      flow, group: "finder", field: "finderGoal", filters: true,
      onChange: () => {
        const choice = flow.taskChoices.finder;
        if (Object.hasOwn(choice, "industry")) flow.finderIndustry = choice.industry || "";
        const requiresSpecificAudience = choice?.selected?.includes("audience");
        const button = panel.querySelector("[data-choice-start]");
        if (button) button.disabled = !flow.finderGoal.trim() || (requiresSpecificAudience && !String(choice.audienceQuery || "").trim());
      }
    });

    if (getMarketplaceAgent(state.useId)?.id === "mkt-find-people") {
      panel.appendChild(el("div", "sb-as-use-notice", "会综合评论区、直播间和账号搜索中的公开信息，去重后整理候选人；只负责找人，不会自动发私信。"));
    }

    if (flow.setupError) panel.appendChild(el("div", "sb-as-use-notice is-error", flow.setupError));
    const actions = el("div", "sb-as-use-actions sb-as-finder-actions");
    const next = el("button", "primary", "开始找人"); next.type = "button";
    next.dataset.choiceStart = "true";
    const finderChoice = flow.taskChoices.finder || {};
    next.disabled = !flow.finderGoal.trim() || (finderChoice.selected?.includes("audience") && !String(finderChoice.audienceQuery || "").trim());
    next.addEventListener("click", () => {
      flow.setupError = null;
      const scopeError = douyinFinderScopeError(flow);
      if (scopeError) {
        flow.setupError = scopeError;
        render();
        return;
      }
      if (!flow.finderGoal.trim()) {
        flow.setupError = "先选一种找人方式";
        render();
        return;
      }
      if (finderChoice.selected?.includes("audience") && !String(finderChoice.audienceQuery || "").trim()) {
        flow.setupError = "补充你具体想找的人群";
        render();
        return;
      }
      startUse(getMarketplaceAgent(state.useId));
    });
    actions.appendChild(next); panel.appendChild(actions);
  }

  function finderSpecialistEntries(flow) {
    const snapshot = flow.resultSnapshot && typeof flow.resultSnapshot === "object" ? flow.resultSnapshot : {};
    const collections = [snapshot.accounts, snapshot.leads, snapshot.candidates, snapshot.items, flow.liveFindings];
    return collections.find((items) => Array.isArray(items) && items.length) || [];
  }

  function renderFinderSpecialistWorksite(panel, flow) {
    const snapshot = flow.resultSnapshot || {};
    const counts = snapshot.counts || {};
    const entries = finderSpecialistEntries(flow);
    const failed = snapshot.status === "FAILED" || flow.status === "FAILED";
    const noCandidates = snapshot.status === "NO_CANDIDATES";
    const running = flow.requesting === true;
    const status = failed ? "任务异常" : running ? "正在搜寻" : noCandidates ? "未找到匹配对象" : "已完成";
    const worksite = createSpecialistWorksite(panel, {
      title: "潜客搜寻",
      subtitle: failed
        ? (flow.error?.message || snapshot.message || "找人任务没有完成")
        : running
          ? (snapshot.message || "正在从已选择的公开来源中整理候选对象。")
          : "只展示这次真实找到的人、来源和原始证据，不会自动触达。",
      status,
      tone: failed ? "is-error" : running ? "is-live" : noCandidates ? "" : "is-success"
    });

    specialistColumnHead(worksite.source, "本次来源", running ? "持续搜寻中" : "来源已保留");
    const sourceList = el("div", "sb-as-specialist-source-list");
    const sourceScope = snapshot.sourceScope || snapshot.inputs?.sourceScope || flow.sourceScope;
    specialistSourceItem(sourceList, "搜寻范围", specialistSourceScopeLabel(sourceScope) || flow.source || snapshot.source || "公开内容");
    specialistSourceItem(sourceList, "找人目标", flow.finderGoal || snapshot.query || snapshot.goal || "目标已保留");
    const discovered = counts.discovered ?? counts.matched ?? counts.delivered;
    if (discovered != null) specialistSourceItem(sourceList, "已找到", `${discovered} 位候选对象`);
    worksite.source.appendChild(sourceList);

    specialistColumnHead(worksite.queue, "找到的人", entries.length ? `${entries.length} 位` : "等待结果");
    const rows = el("div", "sb-as-specialist-rows");
    if (entries.length) {
      entries.forEach((entry, index) => {
        rows.appendChild(specialistRow(entry, index, "finder", flow.specialistSelectedId, { label: specialistTierLabel(entry) }, (nextId) => {
          flow.specialistSelectedId = nextId;
          render();
        }));
      });
      worksite.queue.appendChild(rows);
    } else {
      specialistEmpty(worksite.queue, running ? "正在等待符合条件的人" : "本次没有返回可展示的候选对象。");
    }

    const selected = specialistSelectedItem(flow, entries, "finder");
    specialistColumnHead(worksite.detail, "当前对象");
    if (selected) {
      const person = el("div", "sb-as-specialist-person");
      person.append(
        el("strong", null, specialistPersonName(selected)),
        el("span", null, specialistSourceLabel(selected, specialistSourceScopeLabel(sourceScope) || "来源已保留"))
      );
      const facts = el("div", "sb-as-specialist-facts");
      specialistFact(facts, "来源", specialistSourceLabel(selected, specialistSourceScopeLabel(sourceScope) || "来源已保留"));
      specialistFact(facts, "原始证据", specialistEvidence(selected) || "来源记录已保留，暂无可展示原文", true);
      if (selected.source?.videoTitle || selected.videoTitle) specialistFact(facts, "关联内容", selected.source?.videoTitle || selected.videoTitle);
      if (selected.reasons?.length || selected.reason) specialistFact(facts, "匹配原因", Array.isArray(selected.reasons) ? selected.reasons.slice(0, 2).join("；") : selected.reason);
      worksite.detail.append(person, facts);
    } else {
      specialistEmpty(worksite.detail, "找到对象后，来源与原始证据会显示在这里。");
    }
    if (Array.isArray(snapshot.errors) && snapshot.errors.length) worksite.detail.appendChild(el("div", "sb-as-specialist-notice is-error", `有 ${snapshot.errors.length} 项能力调用未完成，结果仍保留待核验状态。`));
    if (!running) {
      const actions = el("div", "sb-as-specialist-actions");
      const adjust = el("button", failed || noCandidates ? "primary" : "", failed ? "重新设置" : "调整条件再找");
      adjust.type = "button";
      adjust.addEventListener("click", () => {
        flow.step = "setup";
        flow.error = null;
        if (!failed) {
          flow.resultSnapshot = null;
          flow.taskId = "";
          flow.taskRunId = "";
        }
        render();
      });
      actions.appendChild(adjust);
      if (!failed && !noCandidates && entries.length) specialistResultsAction(actions);
      worksite.detail.appendChild(actions);
    }
  }

  function renderDouyinFinderRunning(panel, flow) {
    const snapshot = flow.resultSnapshot || {};
    const counts = snapshot.counts || {};
    const running = flow.requesting === true;
    const failed = snapshot.status === "FAILED" || flow.status === "FAILED";
    const noCandidates = snapshot.status === "NO_CANDIDATES";
    const title = running ? "正在找人" : failed ? "找人任务未完成" : noCandidates ? "暂未找到匹配账号" : "找人结果";
    const stageCopy = {
      queued: "我已收到你的目标，正在准备搜索。",
      starting: "我在按你的目标整理筛选条件。",
      searching: "我正在公开内容里找符合条件的账号。",
      search_retrying: "搜索有一点波动，我正在继续处理。",
      resolving: "我正在确认每个账号的身份和主页。",
      enriching: "我正在读取主页、作品和近期更新。",
      ranking: "我正在比较账号与这次目标的匹配程度。"
    }[snapshot.stage];
    const copy = failed
      ? (flow.error?.message || "本次任务没有完成，请稍后重试。")
      : running
        ? snapshot.message || stageCopy || "正在读取账号资料并按你的目标筛选，请稍候。"
        : snapshot.message || (snapshot.accounts?.length ? "候选账号已经按匹配程度整理完成。" : "本次查找已经完成。" );
    panel.append(el("div", "sb-as-use-panel-title", title));
    panel.appendChild(el("div", "sb-as-use-panel-copy", copy));
    if (running) {
      const working = el("div", "sb-as-finder-working");
      working.append(el("i"), el("span", null, "正在读取真实账号资料"));
      panel.appendChild(working);
    }
    const result = el("div", "sb-as-use-result is-finder");
    const targetCount = Number(snapshot.selection?.requested || flow.finderResultLimit || 0);
    const delivered = counts.delivered ?? counts.matched ?? 0;
    [[counts.discovered ?? 0, "搜索候选", "accent"], [counts.enriched ?? counts.resolved ?? counts.screened ?? 0, "深度核验", "accent"], [counts.qualified ?? counts.matched ?? 0, "符合目标", counts.qualified || counts.matched ? "accent" : "warn"], [targetCount ? `${delivered}/${targetCount}` : delivered, "已交付", delivered ? "accent" : "warn"]].forEach(([value, label, className]) => {
      const item = el("div");
      item.append(el("strong", className, String(value)), el("span", null, label));
      result.appendChild(item);
    });
    panel.appendChild(result);
    const accounts = Array.isArray(snapshot.accounts) ? snapshot.accounts : [];
    if (accounts.length) {
      const list = el("div", "sb-as-finder-result");
      accounts.forEach((account) => {
        const row = el("div", "sb-as-finder-result-row");
        const body = el("div"); body.append(el("strong", null, finderAccountLabel(account)), el("span", null, `${finderAccountEvidence(account)} · ${account.tier || "待核验"}${account.reasons?.length ? ` · ${account.reasons.slice(0, 2).join("；")}` : ""}`));
        const growthValue = account?.growth?.newFollowers;
        const growthDays = account?.growth?.windowDays || snapshot.growthIntent?.windowDays || "?";
        const metricValue = snapshot.growthIntent && growthValue != null
          ? `${Number(growthValue) > 0 ? "+" : ""}${Number(growthValue).toLocaleString("zh-CN")}`
          : account.score == null ? "-" : String(account.score);
        const metric = el("div", "sb-as-finder-score", metricValue);
        metric.title = snapshot.growthIntent ? `近 ${growthDays} 天涨粉` : "匹配评分";
        row.append(body, metric); list.appendChild(row);
      });
      panel.appendChild(list);
    }
    if (Array.isArray(snapshot.errors) && snapshot.errors.length) panel.appendChild(el("div", "sb-as-use-notice is-error", `有 ${snapshot.errors.length} 项能力调用未完成，已在结果中保留待核验状态。`));
    if (!running) {
      const actions = el("div", "sb-as-use-actions");
      if (failed || noCandidates) {
        const retry = el("button", "primary", failed ? "重新设置" : "调整目标"); retry.type = "button"; retry.addEventListener("click", () => { flow.step = "setup"; flow.error = null; render(); }); actions.appendChild(retry);
      } else {
        const back = el("button", null, "调整条件再找"); back.type = "button"; back.addEventListener("click", () => { flow.step = "setup"; flow.resultSnapshot = null; flow.taskId = ""; flow.taskRunId = ""; render(); });
        const analyze = el("button", null, "分析本次候选人");
        analyze.type = "button";
        analyze.disabled = !finderEntriesForAnalysis(flow).length;
        analyze.addEventListener("click", () => openIntentAnalystForFinder(flow));
        const resultButton = el("button", "primary", "查看成果中心");
        resultButton.type = "button";
        resultButton.addEventListener("click", () => globalThis.__SALEBUDDY__?.navFrameworkReady?.then?.((framework) => framework?.openProspects?.()));
        actions.append(back, analyze, resultButton);
      }
      panel.appendChild(actions);
    }
  }

  function intentCandidateFromRecord(record = {}) {
    const evidence = Array.isArray(record.evidence) ? record.evidence.map((item) => ({ ...item })) : [];
    return {
      sourceRecordId: record.id || "",
      leadId: record.source?.leadId || record.handle || record.id || "",
      nickname: record.name || "抖音用户",
      uniqueId: String(record.handle || "").replace(/^@+/, ""),
      secUid: record.source?.secUid || record.source?.sec_uid || "",
      text: evidence[0]?.quote || record.profile || "",
      source: { ...(record.source || {}), type: record.source?.type || "作品评论" },
      evidence,
      profileUrl: record.profileUrl || "",
      profileData: record.profileData || (record.profile && typeof record.profile === "object" ? { ...record.profile } : null),
      contentEvidence: Array.isArray(record.contentEvidence)
        ? record.contentEvidence.map((item) => ({ ...item }))
        : Array.isArray(record.recentWorks) ? record.recentWorks.map((item) => ({ ...item })) : []
    };
  }

  function finderEntriesForAnalysis(run = {}) {
    const snapshot = run?.resultSnapshot && typeof run.resultSnapshot === "object" ? run.resultSnapshot : run;
    const collections = [
      snapshot?.leads,
      snapshot?.candidates,
      snapshot?.users,
      snapshot?.items,
      snapshot?.records,
      snapshot?.accounts,
      run?.leads,
      run?.items
    ];
    return collections.find((value) => Array.isArray(value) && value.length) || [];
  }

  function intentCandidateFromFinderEntry(entry = {}, run = {}) {
    const source = entry?.source && typeof entry.source === "object" ? entry.source : {};
    const snapshot = run?.resultSnapshot && typeof run.resultSnapshot === "object" ? run.resultSnapshot : run;
    const identity = [
      entry.sourceRecordId,
      entry.recordId,
      entry.leadId,
      entry.secUid,
      entry.sec_uid,
      entry.uniqueId,
      entry.unique_id,
      entry.id,
      entry.profileUrl,
      entry.profile_url,
      entry.nickname,
      entry.name
    ].find((value) => String(value || "").trim());
    if (!identity) return null;
    const quote = entry.text || entry.comment || entry.content || entry.quote || entry.message || source.quote || "";
    const evidence = Array.isArray(entry.evidence) && entry.evidence.length
      ? entry.evidence.map((item) => ({ ...item }))
      : quote ? [{ quote: String(quote), source: source.type || entry.sourceType || "找人结果" }] : [];
    const sourceScope = entry.sourceScope
      || source.sourceScope
      || source.scope
      || run.sourceScope
      || snapshot.sourceScope
      || snapshot.inputs?.sourceScope
      || "unknown";
    return {
      sourceRecordId: String(entry.sourceRecordId || entry.recordId || identity),
      leadId: String(entry.leadId || identity),
      nickname: entry.nickname || entry.name || entry.account || "抖音用户",
      uniqueId: String(entry.uniqueId || entry.unique_id || "").replace(/^@+/, ""),
      secUid: entry.secUid || entry.sec_uid || "",
      text: String(quote || "").trim(),
      source: {
        ...source,
        type: source.type || entry.sourceType || run.source || "找人结果",
        sourceScope,
        sourceResultId: run.resultId || snapshot.resultId || "",
        sourceTaskId: run.taskId || snapshot.taskId || "",
        sourceTaskRunId: run.taskRunId || snapshot.taskRunId || "",
        accountId: run.accountId || snapshot.accountId || "",
        accountName: run.accountName || snapshot.accountName || ""
      },
      sourceScope,
      evidence,
      profileUrl: entry.profileUrl || entry.profile_url || entry.userUrl || entry.user_url || "",
      profileData: entry.profileData || (entry.profile && typeof entry.profile === "object" ? { ...entry.profile } : entry.account?.profile || null),
      contentEvidence: Array.isArray(entry.contentEvidence)
        ? entry.contentEvidence.map((item) => ({ ...item }))
        : Array.isArray(entry.recentWorks) ? entry.recentWorks.map((item) => ({ ...item })) : []
    };
  }

  function openIntentAnalystForFinder(flow) {
    const analyst = getMarketplaceAgent("mkt-intent-analyst");
    const snapshot = flow?.resultSnapshot && typeof flow.resultSnapshot === "object" ? flow.resultSnapshot : {};
    const run = {
      resultSnapshot: snapshot,
      resultId: flow?.resultId || snapshot.resultId || "",
      taskId: flow?.taskId || snapshot.taskId || "",
      taskRunId: flow?.taskRunId || snapshot.taskRunId || "",
      source: flow?.source || snapshot.source || "找客结果",
      sourceScope: flow?.sourceScope || snapshot.sourceScope || snapshot.inputs?.sourceScope || "",
      accountId: flow?.accountId || snapshot.accountId || "",
      accountName: flow?.account || snapshot.accountName || ""
    };
    const candidates = finderEntriesForAnalysis(run)
      .map((entry) => intentCandidateFromFinderEntry(entry, run))
      .filter(Boolean)
      .slice(0, 500);
    if (!analyst || !candidates.length) return;
    openUseFlow(analyst, {
      agentId: analyst.id,
      intentCandidates: candidates,
      intentSelectedIds: candidates.map((candidate) => candidate.sourceRecordId || candidate.leadId),
      intentGoal: intentAnalystDefaultGoal(),
      analysisScope: "user_intent",
      sourceResultId: run.resultId,
      sourceTaskId: run.taskId,
      sourceTaskTitle: "找客专员 · 本次名单",
      sourceTaskGoal: flow?.finderGoal || snapshot.query || snapshot.goal || "",
      sourceResultType: snapshot.resultType || "",
      sourceScope: run.sourceScope,
      sourceAccountId: run.accountId,
      sourceAccountName: run.accountName,
      prefilledFromFinder: true
    });
  }

  function latestFinderRunForAnalysis() {
    const runs = typeof prospectStore?.listRuns === "function" ? prospectStore.listRuns() : [];
    const completedStates = new Set(["completed", "succeeded", "success", "done"]);
    for (const run of Array.isArray(runs) ? runs : []) {
      if (run?.agentId !== "mkt-find-people") continue;
      const snapshot = run?.resultSnapshot && typeof run.resultSnapshot === "object" ? run.resultSnapshot : run;
      const status = String(run?.status || snapshot?.status || "").toLowerCase();
      const mode = snapshot?.analysis?.mode || snapshot?.inputs?.analysisMode;
      if (!completedStates.has(status) || mode !== "collect") continue;
      const candidates = finderEntriesForAnalysis(run)
        .map((entry) => intentCandidateFromFinderEntry(entry, run))
        .filter(Boolean)
        .slice(0, 500);
      if (candidates.length) return { run, candidates };
    }
    return null;
  }

  function intentCandidatesFromStore() {
    const records = typeof prospectStore?.list === "function" ? prospectStore.list() : [];
    return records
      .filter((record) => {
        if (!record || record.contactability?.allowed === false) return false;
        return awaitingIntentAnalysis(record);
      })
      .slice(0, 500)
      .map(intentCandidateFromRecord);
  }

  function intentAnalystDefaultGoal() {
    return "结合用户账号画像、互动原文和来源证据，自动判断每位用户是否值得继续跟进，并给出意向等级、判断依据和下一步建议。";
  }

  function buildIntentAnalysisGoal(flow = {}) {
    const focus = String(flow.intentFocus || "").trim();
    const base = intentAnalystDefaultGoal();
    return focus ? `${base}\n用户补充的特殊侧重点：${focus}` : base;
  }

  function renderIntentAnalystModeChooser(panel, flow) {
    panel.classList.add("sb-as-intent-analyst-choice");
    panel.append(
      el("div", "sb-as-use-panel-title", "客户分析员"),
      el("div", "sb-as-use-panel-copy", "先选择这次分析要解决的问题。两种分析都只读取已有数据或公开资料，不会自动触达。")
    );
    const grid = el("div", "sb-as-intent-mode-grid");
    [
      {
        value: "intent",
        title: "判断潜客意向",
        copy: "接收找客专员找到的互动用户，判断是否值得继续跟进，并同步到潜客线索。"
      },
      {
        value: "account_report",
        title: "单独做用户分析",
        copy: "输入分析提示词，针对已有用户或公开账号生成分析报告，不进入潜客筛选和触达流程。"
      }
    ].forEach(({ value, title, copy }) => {
      const option = el("button", "sb-as-intent-mode-option");
      option.type = "button";
      option.append(el("strong", null, title), el("span", null, copy), el("i", null, "进入"));
      option.addEventListener("click", () => {
        flow.analysisMode = value;
        flow.analysisKind = value === "account_report" ? "account_report" : "";
        flow.error = null;
        if (value === "account_report") {
          flow.analysisScope = "user_report";
          flow.analysisAccounts = normalizeAnalysisAccounts(flow.intentCandidates || []);
          flow.analysisUrls = "";
          flow.analysisGoal = "";
        }
        render();
      });
      grid.appendChild(option);
    });
    panel.appendChild(grid);
    panel.appendChild(el("div", "sb-as-use-notice", "意向判断的结果会回写成果中心；账号报告只会进入对话和文件中心，不会被当作潜客或触达对象。"));
  }

  function renderIntentAnalystSetup(panel, flow) {
    panel.classList.add("sb-as-intent-analyst-setup");
    flow.analysisScope = "user_intent";
    let candidates = Array.isArray(flow.intentCandidates) && flow.intentCandidates.length
      ? flow.intentCandidates
      : [];
    if (!candidates.length) {
      const pooled = intentCandidatesFromStore();
      if (pooled.length) {
        candidates = pooled;
        flow.intentCandidates = candidates;
        flow.intentSelectedIds = candidates.map((candidate) => candidate.sourceRecordId || candidate.leadId);
        flow.prefilledFromFinder = true;
        flow.sourceTaskTitle = "找客专员 · 待分析互动用户池";
        flow.sourceResultType = "互动用户";
      } else {
        const linked = latestFinderRunForAnalysis();
        if (linked?.candidates?.length) {
          candidates = linked.candidates;
          flow.intentCandidates = candidates;
          flow.intentSelectedIds = candidates.map((candidate) => candidate.sourceRecordId || candidate.leadId);
          flow.prefilledFromFinder = true;
          flow.sourceResultId = linked.run.resultId || linked.run.resultSnapshot?.resultId || "";
          flow.sourceTaskId = linked.run.taskId || linked.run.resultSnapshot?.taskId || "";
          flow.sourceTaskTitle = "找客专员 · 待分析互动用户池";
          flow.sourceTaskGoal = linked.run.query || linked.run.resultSnapshot?.query || linked.run.title || "";
          flow.sourceResultType = linked.run.resultType || linked.run.resultSnapshot?.resultType || "";
          flow.sourceScope = linked.run.sourceScope || linked.run.resultSnapshot?.sourceScope || linked.run.resultSnapshot?.inputs?.sourceScope || "";
          flow.sourceAccountId = linked.run.accountId || linked.run.resultSnapshot?.accountId || "";
          flow.sourceAccountName = linked.run.accountName || linked.run.resultSnapshot?.accountName || "";
        }
      }
    }
    if ((!Array.isArray(flow.intentCandidates) || !flow.intentCandidates.length) && candidates.length) flow.intentCandidates = candidates;
    if (candidates.length) {
      flow.analysisMode = "intent";
      flow.analysisKind = "";
    }
    if (!candidates.length && !flow.analysisMode) {
      renderIntentAnalystModeChooser(panel, flow);
      return;
    }
    const title = el("div", "sb-as-use-panel-title", candidates.length ? "选择待判断对象" : "先完成找客，再分析客户");
    const copy = el("div", "sb-as-use-panel-copy", candidates.length
      ? "AI 会结合用户账号画像、互动原文和来源证据自动完成判断，不需要你预先定义潜客类型；不会重新找人或自动发送私信。"
      : "找客专员先汇总互动用户，再由客户分析员判断购买意向；客户分析员不会重新搜索对象。");
    panel.append(title, copy);
    if (!candidates.length) {
      panel.appendChild(el("div", "sb-as-use-notice", "当前还没有待判断对象。正确使用顺序：找客专员 → 客户分析员 → 潜客触达专员。完成找客后再次打开客户分析员，最新名单会自动带入。"));
      const actions = el("div", "sb-as-use-actions");
      const finder = el("button", "primary", "先使用找客专员");
      finder.type = "button";
      finder.addEventListener("click", () => openFinderForDependency());
      actions.appendChild(finder);
      if (flow.analysisMode === "intent") {
        const back = el("button", null, "返回能力选择");
        back.type = "button";
        back.addEventListener("click", () => {
          flow.analysisMode = "";
          flow.analysisKind = "";
          flow.error = null;
          render();
        });
        actions.insertBefore(back, finder);
      }
      panel.appendChild(actions);
      return;
    }
    const source = el("div", "sb-as-intent-source");
    const sourceCopy = el("div", "sb-as-intent-source-copy");
    sourceCopy.append(el("strong", null, "本次待判断名单"), el("span", null, `来源：${flow.sourceTaskTitle || "已有潜客记录"}`));
    if (flow.sourceAccountName) sourceCopy.appendChild(el("small", null, `来源账号：${flow.sourceAccountName}`));
    if (flow.prefilledFromFinder) sourceCopy.appendChild(el("small", null, "已自动接收找客专员的最新名单"));
    source.append(sourceCopy, el("span", "sb-as-intent-source-count", `${candidates.length} 位待判断`));
    panel.appendChild(source);
    const intentGoal = intentAnalystDefaultGoal();
    flow.intentGoal = intentGoal;
    const focus = el("div", "sb-as-intent-focus");
    focus.appendChild(el("label", "sb-as-intent-focus-label", "补充特殊侧重点（选填）"));
    const focusInput = document.createElement("textarea");
    focusInput.rows = 3;
    focusInput.value = String(flow.intentFocus || "");
    focusInput.placeholder = "例如：特别关注近期准备到店、价格敏感或明确比较方案的人";
    focusInput.setAttribute("aria-label", "补充特殊侧重点（选填）");
    focusInput.addEventListener("input", () => {
      flow.intentFocus = focusInput.value;
      flow.analysisScope = "user_intent";
      flow.error = null;
    });
    focus.appendChild(focusInput);
    panel.appendChild(focus);
    const delivery = el("div", "sb-as-intent-delivery");
    delivery.append(
      el("strong", null, "本次会输出"),
      el("span", null, "重点潜客"),
      el("span", null, "待确认"),
      el("span", null, "暂不跟进"),
      el("small", null, "每位用户都会保留可回查的原始证据和下一步建议；分析过程不会代发私信。")
    );
    panel.appendChild(delivery);
    const candidateIds = candidates.map((candidate) => candidate.sourceRecordId || candidate.leadId || candidate.uniqueId || candidate.nickname).filter(Boolean);
    flow.intentSelectedIds = [...candidateIds];
    const listHead = el("div", "sb-as-intent-list-head");
    const tools = el("div", "sb-as-intent-list-tools");
    tools.appendChild(el("span", null, `${candidateIds.length} 位全部纳入判断`));
    listHead.append(el("strong", null, "待判断对象"), tools);
    panel.appendChild(listHead);
    const list = el("div", "sb-as-intent-candidate-list");
    candidates.forEach((candidate) => {
      const row = el("div", "sb-as-intent-candidate");
      const body = el("span", "sb-as-intent-candidate-copy");
      const rawSourceType = String(candidate.source?.type || "").trim();
      const sourceType = /direct|直接触达|私信/.test(rawSourceType) ? "用户指定对象" : rawSourceType || "来源已保留";
      const rawText = String(candidate.text || "").trim();
      const text = /用户指定.*直接触达|未进行潜客意向判断/.test(rawText)
        ? "用户已指定加入本次名单，等待根据来源记录完成意向判断。"
        : rawText || "原始表达已保留，等待完成意向判断。";
      const meta = [sourceType, candidate.source?.videoTitle || candidate.source?.videoId, "待判断"].filter(Boolean).join(" · ");
      body.append(el("strong", null, candidate.nickname || "抖音用户"), el("span", null, text), el("small", null, meta));
      row.appendChild(body);
      list.appendChild(row);
    });
    panel.appendChild(list);
    const actions = el("div", "sb-as-use-actions sb-as-intent-actions");
    actions.appendChild(el("div", "sb-as-intent-start-note", "确认后直接开始判断，结果会回写成果中心；不会自动发送私信。"));
    const start = el("button", "primary", candidateIds.length ? `开始判断 ${candidateIds.length} 位潜客` : "开始判断潜客");
    start.type = "button";
    start.disabled = candidateIds.length === 0;
    start.addEventListener("click", () => startUse(getMarketplaceAgent(state.useId)));
    actions.appendChild(start);
    panel.appendChild(actions);
  }

  function analysisSpecialistEntries(flow) {
    const snapshot = flow.resultSnapshot && typeof flow.resultSnapshot === "object" ? flow.resultSnapshot : {};
    const leads = Array.isArray(snapshot.leads) ? snapshot.leads : [];
    if (leads.length) return leads;
    const candidates = Array.isArray(flow.intentCandidates) ? flow.intentCandidates : [];
    const selectedIds = new Set(Array.isArray(flow.intentSelectedIds) ? flow.intentSelectedIds : []);
    return selectedIds.size
      ? candidates.filter((candidate) => selectedIds.has(candidate.sourceRecordId || candidate.leadId || candidate.uniqueId || candidate.nickname))
      : candidates;
  }

  function analysisFactSummary(item = {}) {
    const signals = Array.isArray(item.intent?.signals) ? item.intent.signals : Array.isArray(item.signals) ? item.signals : [];
    const facts = signals
      .map((signal) => specialistFirstText(signal?.label, signal?.text, signal?.value, signal))
      .filter(Boolean);
    return facts.join("；");
  }

  function analysisRecommendation(item = {}) {
    const next = specialistFirstText(item.recommendation, item.nextAction, item.intent?.nextAction);
    if (next) return next;
    const tier = String(item.intent?.tier || item.tier || "").toLowerCase();
    if (tier === "high") return "建议优先进入私信触达";
    if (tier === "medium") return "建议补充证据后再触达";
    if (tier === "low") return "建议暂不跟进";
    return "等待分析完成后确认下一步";
  }

  function renderAnalysisSpecialistWorksite(panel, flow) {
    const failed = Boolean(flow.error);
    const completed = flow.progress >= 100 && !flow.requesting;
    const entries = analysisSpecialistEntries(flow);
    const status = failed ? "判断异常" : completed ? "已完成" : "正在判断";
    const worksite = createSpecialistWorksite(panel, {
      title: "潜客判断",
      subtitle: failed
        ? (flow.error?.message || "潜客判断没有完成")
        : "基于已有对象的原始表达和来源证据判断购买意向；不重新找人，也不会自动发私信。",
      status,
      tone: failed ? "is-error" : completed ? "is-success" : "is-live"
    });

    specialistColumnHead(worksite.source, "待判断来源", entries.length ? `${entries.length} 位对象` : "等待来源数据");
    const sourceList = el("div", "sb-as-specialist-source-list");
    specialistSourceItem(sourceList, "来源任务", flow.sourceTaskTitle || "已有对象");
    specialistSourceItem(sourceList, "判断目标", flow.intentGoal || "判断购买意向，并给出可回查依据和下一步建议");
    specialistSourceItem(sourceList, "执行边界", "不重新找人，不自动发送私信");
    worksite.source.appendChild(sourceList);

    specialistColumnHead(worksite.queue, "判断队列", entries.length ? `${completed ? "结果已回写" : "逐项判断"}` : "暂无对象");
    const rows = el("div", "sb-as-specialist-rows");
    if (entries.length) {
      entries.forEach((entry, index) => {
        const state = completed
          ? { label: specialistTierLabel(entry), tone: "" }
          : { label: index === 0 ? "正在判断" : "等待判断", tone: "" };
        rows.appendChild(specialistRow(entry, index, "analysis", flow.specialistSelectedId, state, (nextId) => {
          flow.specialistSelectedId = nextId;
          render();
        }));
      });
      worksite.queue.appendChild(rows);
    } else {
      specialistEmpty(worksite.queue, failed ? "本次判断没有可回显的对象。" : "正在等待已选择对象进入判断队列。");
    }

    const selected = specialistSelectedItem(flow, entries, "analysis");
    specialistColumnHead(worksite.detail, "当前对象");
    if (selected) {
      const person = el("div", "sb-as-specialist-person");
      person.append(el("strong", null, specialistPersonName(selected)), el("span", null, specialistSourceLabel(selected, flow.sourceTaskTitle || "来源已保留")));
      const facts = el("div", "sb-as-specialist-facts");
      specialistFact(facts, "原始证据", specialistEvidence(selected) || "来源记录已保留，暂无可展示原文", true);
      specialistFact(
        facts,
        "AI归纳事实",
        analysisFactSummary(selected) || (completed ? "本次结果未返回可拆分的事实项。" : "等待分析完成后整理。")
      );
      const conclusion = specialistFirstText(selected.intent?.reason, selected.reason);
      specialistFact(
        facts,
        "结论与下一步",
        conclusion ? `${conclusion} ${analysisRecommendation(selected)}` : analysisRecommendation(selected)
      );
      worksite.detail.append(person, facts);
    } else {
      specialistEmpty(worksite.detail, "选择对象后，会按原始证据、AI归纳事实和结论与下一步依次展示。");
    }
    if (failed) {
      const actions = el("div", "sb-as-specialist-actions");
      const retry = el("button", "primary", "重新开始判断");
      retry.type = "button";
      retry.addEventListener("click", () => { flow.error = null; flow.step = "setup"; flow.progress = 0; render(); });
      actions.appendChild(retry);
      worksite.detail.appendChild(actions);
      return;
    }
    if (completed) {
      const actions = el("div", "sb-as-specialist-actions");
      const handoff = el("button", null, "选择触达对象");
      handoff.type = "button";
      handoff.disabled = !selected;
      handoff.addEventListener("click", () => {
        flow.handoffRecordId = selected?.sourceRecordId || selected?.recordId || selected?.leadId || "";
        openProspectSelectionForOutreach();
      });
      actions.appendChild(handoff);
      specialistResultsAction(actions, "查看成果中心");
      worksite.detail.appendChild(actions);
    }
  }

  function renderIntentAnalystRunning(panel, flow) {
    const failed = Boolean(flow.error);
    const completed = flow.progress >= 100 && !flow.requesting;
    const snapshot = flow.resultSnapshot || {};
    const title = failed ? "潜客判断未完成" : completed ? "潜客判断已完成" : "正在判断潜客意向";
    panel.append(el("div", "sb-as-use-panel-title", title), el("div", "sb-as-use-panel-copy", "正在核对每位用户的原始表达、来源证据和可确认信息；不会重新找人或自动发送私信。"));
    if (failed) {
      panel.appendChild(el("div", "sb-as-use-notice is-error", flow.error.message || "潜客判断暂时未完成"));
      const actions = el("div", "sb-as-use-actions");
      const retry = el("button", "primary", "重新开始判断");
      retry.type = "button";
      retry.addEventListener("click", () => { flow.error = null; flow.step = "setup"; flow.progress = 0; render(); });
      actions.appendChild(retry);
      panel.appendChild(actions);
      return;
    }
    const progress = el("div", `sb-as-use-progress${completed ? "" : " is-live"}`);
    const bar = el("i"); bar.style.width = `${flow.progress || 0}%`; progress.appendChild(bar); panel.appendChild(progress);
    const meta = el("div", "sb-as-use-progress-meta");
    meta.append(el("span", null, completed ? "已完成并回写潜客结果" : "正在读取原始证据并完成意向判断"), el("span", null, `${flow.progress || 0}%`));
    panel.appendChild(meta);
    const checks = el("div", "sb-as-use-checklist");
    const active = flow.checks.findIndex((done) => !done);
    ["读取待判断对象", "核对原始表达与来源", "判断购买意向", "回写潜客结果"].forEach((label, index) => {
      const done = Boolean(flow.checks[index]);
      const row = el("div", `sb-as-use-check${done ? " is-done" : index === active ? " is-active" : ""}`);
      row.append(el("i", null, done ? "✓" : "·"), el("span", null, label)); checks.appendChild(row);
    });
    panel.appendChild(checks);
    if (!completed) return;
    const counts = snapshot.counts || {};
    const summary = el("div", "sb-as-use-running-summary");
    [[counts.analyzed ?? snapshot.leads?.length ?? 0, "已判断"], [counts.high ?? 0, "重点潜客"], [counts.medium ?? 0, "待确认"], [counts.low ?? 0, "暂不跟进"]].forEach(([value, label]) => {
      const item = el("div", "sb-as-use-running-pill"); item.append(el("strong", null, String(value)), el("span", null, label)); summary.appendChild(item);
    });
    panel.appendChild(summary);
    const leads = Array.isArray(snapshot.leads) ? snapshot.leads : [];
    if (leads.length) {
      const list = el("div", "sb-as-intent-result-list");
      leads.slice(0, 12).forEach((lead) => {
        const tier = lead.tier === "high" ? "重点潜客" : lead.tier === "medium" ? "待确认" : "暂不跟进";
        const row = el("div", "sb-as-intent-result");
        row.append(el("strong", null, lead.nickname || "抖音用户"), el("span", null, `${tier} · ${lead.score ?? 0} 分`), el("p", null, lead.intent?.reason || lead.reason || "已根据来源证据完成意向判断"));
        list.appendChild(row);
      });
      panel.appendChild(list);
    }
    panel.appendChild(el("div", "sb-as-use-notice", "判断结果已回写成果中心，原始内容和来源证据继续保留。是否交给潜客触达专员，由你决定。"));
    const actions = el("div", "sb-as-use-actions");
    const resultButton = el("button", "primary", "查看成果中心");
    resultButton.type = "button";
    resultButton.addEventListener("click", () => globalThis.__SALEBUDDY__?.navFrameworkReady?.then?.((framework) => framework?.openProspects?.()));
    actions.appendChild(resultButton); panel.appendChild(actions);
  }

  async function startIntentAnalyst(agent, flow) {
    if (flow.requesting) return;
    flow.analysisScope = "user_intent";
    const intentGoal = buildIntentAnalysisGoal(flow);
    flow.intentGoal = intentGoal;
    const candidates = Array.isArray(flow.intentCandidates) ? flow.intentCandidates : [];
    const selected = candidates.slice(0, 500);
    flow.intentSelectedIds = selected.map((candidate) => candidate.sourceRecordId || candidate.leadId || candidate.uniqueId || candidate.nickname).filter(Boolean);
    if (!selected.length) {
      flow.error = { code: "INTENT_ANALYST_NO_CANDIDATES", message: "请先选择至少一位已经找到的用户。" };
      flow.step = "setup";
      render();
      return;
    }
    const sync = await prospectStore.flushRemoteSync?.();
    if (sync?.pending || sync?.syncing) {
      flow.error = {
        code: "PROSPECT_RESULTS_SYNC_PENDING",
        message: sync?.lastError
          ? `成果中心同步未完成：${sync.lastError}`
          : "成果中心仍在同步，请稍后再开始客户分析。"
      };
      flow.step = "setup";
      render();
      return;
    }
    flow.step = "running";
    flow.requesting = true;
    flow.progress = 20;
    flow.status = "RUNNING";
    flow.error = null;
    flow.checks = [true, false, false, false];
    flow.taskId ||= newTaskId("intent-analysis");
    flow.taskRunId ||= newTaskId("run");
    beginWork(agent.id, { task: intentGoal, phase: "读取待判断对象", progress: flow.progress, projectId: null, metadata: { taskId: flow.taskId, taskRunId: flow.taskRunId, mode: "user_intent", intentGoal, sourceResultId: flow.sourceResultId || null, sourceTaskId: flow.sourceTaskId || null } });
    pushActivity(agent.id, `已选择 ${selected.length} 位候选人，开始判断购买意向。`);
    render();
    void globalThis.__SALEBUDDY__?.navFrameworkReady?.then?.((framework) => framework?.openRealtimeWork?.({
      selectedAgentId: agent.id,
      taskId: flow.taskId,
      taskRunId: flow.taskRunId,
      accountId: flow.accountId || flow.sourceAccountId || null,
      accountKey: flow.accountWorkKey || null
    }));
    try {
      const result = await executeCoreAgent({
        taskId: flow.taskId,
        taskRunId: flow.taskRunId,
        conversationId: `agent-square-${flow.taskId}`,
        agentId: "mkt-intent-analyst",
        skillId: "lead_intent_analysis",
        goal: intentGoal,
        analysisMode: "intent",
        analysisScope: "user_intent",
        candidates: selected,
        sourceResultId: flow.sourceResultId || "",
        sourceTaskId: flow.sourceTaskId || "",
        sourceTaskTitle: flow.sourceTaskTitle || "",
        sourceTaskGoal: flow.sourceTaskGoal || "",
        sourceResultType: flow.sourceResultType || "",
        sourceScope: flow.sourceScope || "",
        sourceAccountId: flow.sourceAccountId || "",
        sourceAccountName: flow.sourceAccountName || "",
        accountId: flow.accountId || "",
        accountName: flow.account || ""
      }, 120000);
      if (result?.accepted === false) throw Object.assign(new Error(result?.error?.message || "客户分析服务未接受任务"), { code: result?.error?.code || "INTENT_ANALYSIS_REQUEST_FAILED" });
      flow.requesting = false;
      flow.status = result.status || "SUCCEEDED";
      flow.resultSnapshot = result.resultSnapshot || result.snapshot || {};
      flow.intentResult = flow.resultSnapshot;
      flow.progress = 100;
      flow.checks = [true, true, true, true];
      const identity = presentationOf(agent);
      prospectStore.ingestRun({
        resultSnapshot: { ...flow.resultSnapshot, leads: [] },
        taskId: flow.taskId,
        agentId: agent.id,
        agentName: identity.name,
        sourceContext: { source: "客户分析员", sourceScope: flow.sourceScope, sourceResultId: flow.sourceResultId, accountId: flow.accountId }
      });
      prospectStore.updateRun?.(flow.taskId, { resultSnapshot: flow.resultSnapshot });
      prospectStore.applyIntentAnalysis({
        leads: flow.resultSnapshot.leads || [],
        resultSnapshot: flow.resultSnapshot,
        taskId: flow.taskId,
        agentId: agent.id,
        agentName: identity.name,
        sourceResultId: flow.sourceResultId,
        sourceTaskId: flow.sourceTaskId,
        sourceScope: flow.sourceScope,
        sourceAccountId: flow.sourceAccountId || flow.accountId,
        sourceAccountName: flow.sourceAccountName || flow.accountName || flow.account,
        sourceResultType: flow.sourceResultType || "互动用户",
        sourceCandidates: selected
      });
      updateWork(agent.id, {
        phase: "已完成意向判断",
        progress: 100,
        metadata: {
          taskId: flow.taskId,
          taskRunId: flow.taskRunId,
          status: flow.status,
          resultSnapshot: flow.resultSnapshot,
          taskSnapshot: {
            taskId: flow.taskId,
            taskRunId: flow.taskRunId,
            status: flow.status,
            resultSnapshot: flow.resultSnapshot
          }
        }
      });
      finishWork(agent.id, "客户分析结果", { taskId: flow.taskId, taskRunId: flow.taskRunId });
      pushActivity(agent.id, "客户分析员已完成潜客判断，结果已更新到成果中心。");
    } catch (error) {
      flow.requesting = false;
      flow.status = "FAILED";
      flow.progress = 0;
      flow.error = { code: error.code || "INTENT_ANALYSIS_REQUEST_FAILED", message: error.message || "潜客判断暂时不可用" };
      updateWork(agent.id, { progress: 0, phase: "执行失败", metadata: { status: flow.status, error: flow.error.message } });
      reportWorkError(agent.id, `客户分析员未完成：${flow.error.message}`);
    }
    if (!disposed && state.useFlow === flow) render();
  }

  function renderUse() {
    const agent = getMarketplaceAgent(state.useId);
    const flow = state.useFlow;
    if (!agent || !flow) { state.view = "home"; render(); return; }
    const { name } = presentationOf(agent);
    setPageHeaderVisible(true);
    const inboxIntake = isInboxIntakeFlow(agent, flow);
    if (flow.step === "review" && (inboxIntake || isCommentAcquisitionAgent(agent) || isLiveDanmakuAnalysisAgent(agent) || isLiveDanmakuOutreachAgent(agent) || isViralWorkAnalysisAgent(agent))) flow.step = "setup";
    if (flow.step === "starting" && inboxIntake) flow.step = "setup";
    const taskCompose = flow.step === "setup" && isCommentAcquisitionAgent(agent) && !inboxIntake;
    page.setTitle(name);
    page.showBack(true, leaveUseFlow);

    const wrap = el("section", "sb-as-use");
    wrap.classList.add("sb-consumer-use");
    wrap.classList.toggle("is-task-compose", taskCompose);
    if (taskCompose) {
      const presence = el("div", "sb-task-presence");
      const avatar = el("div", "sb-task-face");
      mountGrokBotAvatar(avatar, agent.id, { alt: name, state: "idle", mode: "agent-square" });
      presence.append(avatar, el("h1", null, TASK_ENTRY_TITLES[agent.id] || name));
      wrap.appendChild(presence);
    }
    const panel = el("div", taskCompose ? "sb-as-use-panel sb-as-task-compose-panel" : "sb-as-use-panel");
    if (flow.step === "setup") {
      if (inboxIntake) renderInboxSetup(panel, flow);
      else if (isAccountAnalysisFlow(agent, flow)) renderAccountAnalysisSetup(panel, flow);
      else if (isIntentAnalystAgent(agent)) renderIntentAnalystSetup(panel, flow);
      else if (isLiveDanmakuAnalysisAgent(agent)) renderLiveDanmakuAnalysisSetup(panel, flow);
      else if (isLiveDanmakuOutreachAgent(agent)) renderLiveDanmakuOutreachSetup(panel, flow);
      else if (isViralWorkAnalysisAgent(agent)) renderViralWorkAnalysisSetup(panel, flow);
      else if (isCommentAcquisitionAgent(agent)) renderCommentAcquisitionSetup(panel, flow);
      else if (isPrivateOutreachAgent(agent)) renderPrivateOutreachSetup(panel, flow);
      else {
        panel.append(el("div", "sb-as-use-panel-title", "配置这次找人任务"), el("div", "sb-as-use-panel-copy", "告诉 Agent 要分析哪个账号、什么时间范围和什么需求信号。"));
        const fields = el("div", "sb-as-use-fields");
        const field = (label, control, full = false) => { const node = el("label", `sb-as-use-field${full ? " full" : ""}`, label); node.appendChild(control); fields.appendChild(node); };
        const account = document.createElement("select"); ["小满的好物小铺", "小满的家居日常", "小满的生活选物"].forEach((value) => account.appendChild(el("option", null, value))); account.value = flow.account; account.addEventListener("change", () => { flow.account = account.value; }); field("目标账号", account);
        const source = document.createElement("select"); const sources = ["商品作品评论区", "账号主页与粉丝列表", "评论区 + 直播互动"]; sources.forEach((value) => source.appendChild(el("option", null, value))); source.value = flow.source; source.addEventListener("change", () => { flow.source = source.value; }); field("数据来源", source);
        const windowInput = document.createElement("select"); ["近24小时", "近7天", "近30天"].forEach((value) => windowInput.appendChild(el("option", null, value))); windowInput.value = flow.window; windowInput.addEventListener("change", () => { flow.window = windowInput.value; }); field("时间范围", windowInput);
        const product = document.createElement("input"); product.value = flow.product; product.placeholder = "例如：保温杯、咖啡机"; product.addEventListener("input", () => { flow.product = product.value; }); field("关注商品或需求", product);
        const rules = document.createElement("input"); rules.value = flow.rules; rules.addEventListener("input", () => { flow.rules = rules.value; }); field("筛选规则", rules, true);
        panel.appendChild(fields);
        const actions = el("div", "sb-as-use-actions"); const cancel = el("button", null, "返回 Agent市场"); cancel.type = "button"; cancel.addEventListener("click", leaveUseFlow); const next = el("button", "primary", "生成执行方案"); next.type = "button"; next.addEventListener("click", () => { if (!flow.product.trim()) { product.focus(); return; } flow.step = "review"; render(); }); actions.append(cancel, next); panel.appendChild(actions);
      }
    } else if (flow.step === "review") {
      if (isPrivateOutreachAgent(agent)) renderPrivateOutreachReview(panel, flow);
      else {
        panel.append(el("div", "sb-as-use-panel-title", "确认执行方案"), el("div", "sb-as-use-panel-copy", "执行后会读取公开内容并保留原文、链接和时间；不会自动向用户发送消息。"));
        const summary = el("div", "sb-as-use-summary"); [["目标账号", flow.account], ["数据来源", flow.source], ["时间范围", flow.window], ["筛选目标", flow.product], ["过滤规则", flow.rules], ["结果去向", "成果中心 · 潜客分类"]].forEach(([label, value]) => { const item = el("div", "sb-as-use-summary-item"); item.append(el("span", null, label), el("strong", null, value)); summary.appendChild(item); }); panel.appendChild(summary);
        const actions = el("div", "sb-as-use-actions"); const back = el("button", null, "返回修改"); back.type = "button"; back.addEventListener("click", () => { flow.step = "setup"; render(); }); const start = el("button", "primary", "确认并开始"); start.type = "button"; start.addEventListener("click", () => startUse(agent)); actions.append(back, start); panel.appendChild(actions);
      }
    } else if (flow.step === "running") {
      if (inboxIntake) {
        if (isInboxAgent(agent)) renderConversationSpecialistWorksite(panel, flow);
        else renderInboxRunning(panel, flow);
      }
      else if (isAccountAnalysisFlow(agent, flow)) renderAccountAnalysisRunning(panel, flow);
      else if (isIntentAnalystAgent(agent)) renderAnalysisSpecialistWorksite(panel, flow);
      else if (isLiveDanmakuAnalysisAgent(agent)) renderLiveDanmakuAnalysisRunning(panel, flow);
      else if (isLiveDanmakuOutreachAgent(agent)) renderLiveDanmakuOutreachRunning(panel, flow);
      else if (isViralWorkAnalysisAgent(agent)) renderViralWorkAnalysisRunning(panel, flow);
      else if (isCompositeFinderAgent(agent) && isFinderListenerFlow(agent, flow)) renderCommentAcquisitionRunning(panel, flow);
      else if (isCompositeFinderAgent(agent)) renderFinderSpecialistWorksite(panel, flow);
      else if (isLongRunningAcquisitionAgent(agent)) renderCommentAcquisitionRunning(panel, flow);
      else if (isPrivateOutreachAgent(agent)) renderOutreachSpecialistWorksite(panel, flow);
      else {
        panel.append(el("div", "sb-as-use-panel-title", "Agent 正在执行"), el("div", "sb-as-use-panel-copy", `${flow.account} · ${flow.source} · ${flow.product}`));
        const progress = el("div", "sb-as-use-progress"); const bar = el("i"); bar.style.width = `${flow.progress}%`; progress.appendChild(bar); panel.appendChild(progress); const meta = el("div", "sb-as-use-progress-meta"); meta.append(el("span", null, flow.progress < 100 ? "实时执行中" : "已完成"), el("span", null, `${flow.progress}%`)); panel.appendChild(meta);
        const checks = el("div", "sb-as-use-checklist"); ["连接已授权账号", "读取内容与互动", "识别高/低意向信号", "整理潜客表单"].forEach((label, index) => { const row = el("div", `sb-as-use-check${flow.checks[index] ? " is-done" : ""}`); row.append(el("i", null, flow.checks[index] ? "✓" : "·"), el("span", null, label)); checks.appendChild(row); }); panel.appendChild(checks);
        if (flow.progress >= 100) {
          const result = el("div", "sb-as-use-result"); [["214", "有效候选", "accent"], ["68", "高意向", "accent"], ["47", "待补证据", "warn"]].forEach(([value, label, className]) => { const item = el("div"); item.append(el("strong", className, value), el("span", null, label)); result.appendChild(item); }); panel.appendChild(result);
          panel.appendChild(el("div", "sb-as-use-notice", "结果已写入成果中心：潜客类结果包含原话、来源、时间和意向标签；触达动作需要你确认后再交给触达师。"));
          const actions = el("div", "sb-as-use-actions"); const resultButton = el("button", "primary", "查看成果中心"); resultButton.type = "button"; resultButton.addEventListener("click", () => globalThis.__SALEBUDDY__?.navFrameworkReady?.then?.((framework) => framework?.openProspects?.())); actions.appendChild(resultButton); panel.appendChild(actions);
        }
      }
    }
    if (flow.step === "running" && !isAccountAnalysisFlow(agent, flow) && !isIntentAnalystAgent(agent) && !isLiveDanmakuAnalysisAgent(agent) && !isLiveDanmakuOutreachAgent(agent) && !isViralWorkAnalysisAgent(agent)) {
      const run = { ...(flow.taskSnapshot || {}), ...(flow.resultSnapshot || {}), agentId: agent.id, taskId: flow.taskId };
      if (buildAccountAnalysisResumeFlow({ run }).analysisAccounts.length) {
        const analyze = el("button", null, "分析这些账号"); analyze.type = "button";
        analyze.addEventListener("click", () => openAccountAnalysis({ run }));
        const actions = el("div", "sb-as-use-actions"); actions.appendChild(analyze); panel.appendChild(actions);
      }
    }
    wrap.appendChild(panel);
    root.appendChild(wrap);
  }

  async function startUse(agent) {
    const flow = state.useFlow;
    if (!agent || !isFirstReleaseAgent(agent)) {
      if (flow) {
        flow.step = "blocked";
        flow.error = {
          code: "AGENT_RETIRED",
          message: "该历史岗位已并入找客专员。请使用找客专员并选择“我的账号直播互动”。"
        };
      }
      render();
      return;
    }
    if (openManagerBindingConflictDialog(agent, flow)) return;
    if (flow?.accountBusyCheckPending) return;
    flow.accountBusyCheckPending = true;
    try {
      if (await guardAccountBusyBeforeStart(agent, flow)) return;
    } finally {
      if (state.useFlow === flow) flow.accountBusyCheckPending = false;
    }
    if (state.useFlow !== flow) return;
    if (isAccountAnalysisFlow(agent, flow)) { startAccountAnalysis(agent, flow); return; }
    if (isIntentAnalystAgent(agent)) { startIntentAnalyst(agent, flow); return; }
    if (isLiveDanmakuAnalysisAgent(agent)) { void startLiveDanmakuAnalysis(agent, flow); return; }
    if (isLiveDanmakuOutreachAgent(agent)) { void startLiveDanmakuOutreach(agent, flow); return; }
    if (isViralWorkAnalysisAgent(agent)) { void startViralWorkAnalysis(agent, flow); return; }
    if (isUserResearchAgent(agent)) {
      if (flow.researchPhase === "outreach") startPrivateOutreach(agent, flow);
      else startUserResearchFinder(agent, flow);
      return;
    }
    if (isDouyinFinderAgent(agent)) {
      if (isFinderListenerFlow(agent, flow)) startCommentAcquisition(agent, flow);
      else startDouyinFinder(agent, flow);
      return;
    }
    if (isInboxIntakeFlow(agent, flow)) {
      startInboxIntake(agent, flow);
      return;
    }
    if (isLongRunningAcquisitionAgent(agent)) {
      startCommentAcquisition(agent, flow);
      return;
    }
    if (isPrivateOutreachAgent(agent)) {
      startPrivateOutreach(agent, flow);
      return;
    }
    if (!isCommentScreeningAgent(agent)) {
      flow.step = "blocked";
      flow.error = { code: "AGENT_EXECUTOR_NOT_CONFIGURED", message: "该 Agent 的真实执行器尚未接入，暂不可执行。" };
      render();
      return;
    }
    startRealLeadMiner(agent, flow);
  }

  async function startUserResearchFinder(agent, flow) {
    flow.researchPhase = "finding";
    return startDouyinFinder(agent, flow);
  }

  async function startDouyinFinder(agent, flow) {
    if (!flow || flow.requesting) return;
    if (isUserResearchAgent(agent)) {
      const fieldErrors = validateUserResearchSetup(flow);
      if (Object.keys(fieldErrors).length) {
        flow.fieldErrors = fieldErrors;
        flow.researchPhase = "setup";
        flow.step = "setup";
        render();
        return;
      }
    }
    async function waitForDouyinFinderResult(base, taskId) {
      let consecutiveFailures = 0;
      while (flow.requesting === true && flow.taskId === taskId) {
        try {
          const response = await fetch(`${base}/v1/connectors/douyin-finder/runs/${encodeURIComponent(taskId)}`, {
            headers: { accept: "application/json" }
          });
          const snapshot = await response.json().catch(() => null);
          if (!response.ok) throw new Error(snapshot?.error?.message || `读取找人任务返回 HTTP ${response.status}`);
          consecutiveFailures = 0;
          flow.resultSnapshot = snapshot;
          flow.status = snapshot?.status || "RUNNING";
          const phase = {
            queued: "等待账号搜索",
            starting: "确认筛选条件",
            searching: "搜索真实候选",
            search_retrying: "重试候选搜索",
            resolving: "解析账号身份",
            enriching: "核验主页与作品",
            ranking: "比较粉丝增长"
          }[snapshot?.stage] || "读取真实账号资料";
          updateWork(agent.id, {
            phase,
            metadata: { status: flow.status, counts: snapshot?.counts || null }
          });
          render();
          if (snapshot?.status !== "RUNNING") return snapshot;
        } catch (error) {
          consecutiveFailures += 1;
          if (consecutiveFailures >= 10) throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 1200));
      }
      throw Object.assign(new Error("找人任务已停止等待"), { code: "DOUYIN_FINDER_POLL_CANCELLED" });
    }
    const compositePublicFinder = isCompositeFinderAgent(agent) && flow.compositeFinderSource === "public";
    const inputs = isDouyinFinderAgent(agent) || compositePublicFinder ? "" : finderCombinedInputs(flow);
    const accountContext = compositePublicFinder ? flow.finderAccountContext : null;
    if (compositePublicFinder) {
      const accountError = publicFinderBusinessAccountError(flow);
      if (accountError) {
        flow.setupError = accountError;
        flow.step = "setup";
        render();
        return;
      }
    }
    flow.step = "running";
    flow.requesting = true;
    flow.status = "RUNNING";
    flow.error = null;
    flow.resultSnapshot = null;
    flow.taskId ||= newTaskId("douyin-finder");
    flow.taskRunId ||= newTaskId("run");
    flow.checks = [true, false, false, false];
    beginWork(agent.id, {
      task: flow.finderGoal || "按命令检索抖音候选账号",
      phase: "读取账号资料",
      projectId: null,
      metadata: { progressSource: "none", taskId: flow.taskId, taskRunId: flow.taskRunId, mode: flow.finderMode }
    });
    pushActivity(agent.id, "我已收到找人目标，正在搜索真实候选账号并按条件核验。");
    render();
    void globalThis.__SALEBUDDY__?.navFrameworkReady?.then?.((framework) => framework?.openRealtimeWork?.({
      selectedAgentId: agent.id,
      taskId: flow.taskId,
      taskRunId: flow.taskRunId
    }));
    try {
      const base = String(controlPlaneBaseUrl()).replace(/\/$/, "");
      const response = await fetch(`${base}/v1/connectors/douyin-finder/run`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          taskId: flow.taskId,
          taskRunId: flow.taskRunId,
          conversationId: `agent-square-${flow.taskId}`,
          agentId: agent.id,
          goal: flow.finderGoal,
          inputs,
          accountContext: accountContext || undefined,
          publicFinderQuery: compositePublicFinder ? flow.publicFinderQuery || undefined : undefined,
          choices: compositePublicFinder ? structuredClone(flow.taskChoices || {}) : undefined,
          industry: flow.finderIndustry || undefined,
          mode: flow.finderMode,
          resultLimit: flow.finderResultLimit,
          videoCount: flow.finderVideoCount,
          since: flow.finderSince ? Math.floor(Date.parse(`${flow.finderSince}T00:00:00+08:00`) / 1000) : undefined,
          detailLimit: flow.finderDetailLimit,
          checkLive: flow.finderCheckLive,
          includeIndustryContext: flow.finderIncludeIndustry === true,
          fresh: flow.finderFresh
        })
      });
      let result = await response.json().catch(() => null);
      if (!response.ok || result?.accepted === false) {
        const error = result?.error || {};
        throw Object.assign(new Error(error.message || `找人服务返回 HTTP ${response.status}`), { code: error.code || "DOUYIN_FINDER_REQUEST_FAILED" });
      }
      flow.resultSnapshot = result;
      flow.status = result?.status || "RUNNING";
      render();
      if (result.status === "RUNNING") result = await waitForDouyinFinderResult(base, result.taskId || flow.taskId);
      flow.requesting = false;
      flow.status = result.status || "SUCCEEDED";
      flow.resultSnapshot = result;
      flow.checks = [true, true, true, true];
      const finderAccounts = normalizeDouyinFinderAccounts(result.accounts);
      if (isUserResearchAgent(agent)) {
        const addressable = buildSurveyOutreachTargets(finderAccounts);
        flow.surveyCandidates = addressable;
        flow.surveySelectedIds = addressable.map((account) => account.id).filter(Boolean);
        flow.message = buildSurveyInvitation({ audienceGoal: flow.finderGoal, questionnaireUrl: flow.surveyUrl, customMessage: flow.message });
        flow.researchPhase = "review";
        flow.step = "review";
        recordUserResearchResult(flow, { status: result.status === "FAILED" ? "failed" : "pending" });
        updateWork(agent.id, { phase: "等待确认受访者名单", metadata: { status: "pending_confirmation", counts: result.counts || null } });
        pushActivity(agent.id, flow.surveyCandidates.length
          ? `已找到 ${flow.surveyCandidates.length} 位可触达候选，等待你确认名单、发送账号和问卷邀请。`
          : "真实搜索已完成，但候选结果缺少可用于触达的抖音身份；本次不会进入发送。 ");
        render();
        return;
      }
      const finderIdentity = presentationOf(agent);
      const storedStatus = result.status === "PARTIAL" ? "partial" : result.status === "FAILED" ? "failed" : "completed";
      agentResultRecorder.record({
        agentId: agent.id,
        agentName: finderIdentity.name,
        taskId: result.taskId || flow.taskId,
        taskRunId: result.taskRunId || flow.taskRunId,
        title: `${result.goal || flow.finderGoal || "抖音候选账号"} · 找人结果`,
        summary: result.message || `已发现 ${result.counts?.discovered || 0} 个候选账号，匹配 ${result.counts?.matched || 0} 个。`,
        source: "抖音找人",
        status: storedStatus,
        counts: result.counts || {},
        growthIntent: result.growthIntent || null,
        selection: result.selection || null,
        inputs: {
          goal: result.goal || flow.finderGoal || "",
          sourceScope: "public_search",
          industry: flow.finderIndustry || "",
          mode: flow.finderMode || "full",
          resultLimit: flow.finderResultLimit || 10,
          optionalSeeds: inputs,
          accountContext: result.accountContext || accountContext,
          publicFinderQuery: compositePublicFinder ? flow.publicFinderQuery || "" : "",
          choices: structuredClone(flow.taskChoices || {})
        },
        items: finderAccounts,
        accounts: Array.isArray(result.accounts) ? result.accounts : [],
        errors: Array.isArray(result.errors) ? result.errors : []
      });
      updateWork(agent.id, { progress: 100, phase: "整理候选与证据", metadata: { status: flow.status, counts: result.counts || null } });
      finishWork(agent.id, "抖音候选账号清单");
      pushActivity(agent.id, result.status === "NO_CANDIDATES" ? "账号搜索接口已完成本轮检索，但没有返回符合条件的候选账号。" : "抖音账号候选已整理完成，画像、作品和验证依据已返回。 ");
      render();
    } catch (error) {
      flow.requesting = false;
      flow.status = "FAILED";
      flow.error = { code: error.code || "DOUYIN_FINDER_REQUEST_FAILED", message: error.message || "抖音找人服务暂时不可用" };
      if (isUserResearchAgent(agent)) recordUserResearchResult(flow, { status: "failed", error: flow.error });
      updateWork(agent.id, { progress: 0, phase: "执行失败", metadata: { status: flow.status, error: flow.error.message } });
      reportWorkError(agent.id, `抖音找人未完成：${flow.error.message}`);
      render();
    }
  }

  function recordLiveDanmakuAnalysisResult(flow, snapshot = flow?.taskSnapshot) {
    if (!flow || !snapshot) return null;
    const analysis = snapshot.resultSnapshot?.danmakuAnalysis
      || snapshot.danmakuAnalysis
      || flow.liveDanmakuAnalysis
      || flow.resultSnapshot?.danmakuAnalysis;
    const taskId = flow.taskId || snapshot.context?.taskId || snapshot.taskId || "";
    if (!taskId) return null;
    const taskState = String(flow.taskState || snapshot.taskState || snapshot.state || "running").toLowerCase();
    const completed = taskState === "completed" || taskState === "succeeded" || Boolean(analysis && snapshot.resultSnapshot?.collectionSnapshot?.state === "ended");
    const status = taskState === "error" ? "failed" : taskState === "stopped" ? "stopped" : completed ? "completed" : "running";
    const collection = snapshot.resultSnapshot?.collectionSnapshot || snapshot.collectionSnapshot || {};
    const counts = analysis?.counts || snapshot.resultSnapshot?.counts || {};
    const items = Array.isArray(analysis?.users) ? analysis.users : [];
    const signature = JSON.stringify({
      status,
      counts,
      collection,
      topics: (analysis?.topics || []).map((topic) => [topic.key, topic.count]),
      users: items.map((user) => [user.userId, user.danmakuCount, user.topics])
    });
    if (signature === flow.lastRecordedLiveDanmakuSignature) return null;
    flow.lastRecordedLiveDanmakuSignature = signature;
    if (completed && analysis) {
      const reportResult = { ...snapshot.resultSnapshot, ...analysis, danmakuAnalysis: analysis, taskId, taskRunId: flow.taskRunId || snapshot.context?.taskRunId || snapshot.taskRunId || "", generatedAt: analysis.observedAt || new Date().toISOString(), status: "completed" };
      const reportFile = liveDanmakuAnalysisReportFile(reportResult, { createdBy: "直播间弹幕分析" });
      const fileId = addFile({ ...reportFile, id: `live-danmaku-report:${taskId}`, taskId, taskRunId: reportResult.taskRunId, agentId: "mkt-live-danmaku-analysis" });
      const artifact = { id: fileId, name: reportFile.name, type: reportFile.type, projectName: reportFile.projectName, summary: "可在文件中心预览完整直播间分析报告", sourceTaskTitle: "直播间弹幕分析" };
      const conversation = liveDanmakuAnalysisReportConversationMessage({ ...reportFile, ...artifact });
      recordAgentActivity("mkt-live-danmaku-analysis", {
        type: "completed",
        taskId,
        taskRunId: reportResult.taskRunId,
        activityKey: `live-danmaku-analysis-report:${taskId}`,
        metadata: { deliverToConversation: true }
      }, {
        journal: agentActivityJournal,
        fromName: "直播间弹幕分析",
        text: conversation.text,
        artifact: conversation.artifact
      });
      return agentResultRecorder.record({
        ...reportResult,
        agentId: "mkt-live-danmaku-analysis",
        agentName: "直播间弹幕分析",
        title: "直播间弹幕分析报告",
        summary: analysis.summary || "直播间弹幕分析报告已完成。",
        source: "抖音直播间弹幕",
        status,
        counts,
        items,
        analysis,
        artifacts: [artifact],
        inputs: {
          goal: flow.liveDanmakuGoal || analysis.goal || "",
          sourceScope: "authorized_account_live",
          signals: [...DEFAULT_LIVE_SIGNALS],
          accountId: flow.accountId || snapshot.context?.accountId || "",
          accountName: flow.account || ""
        }
      });
    }
    return agentResultRecorder.record({
      agentId: "mkt-live-danmaku-analysis",
      agentName: "直播间弹幕分析",
      taskId,
      taskRunId: flow.taskRunId || snapshot.context?.taskRunId || snapshot.taskRunId || "",
      title: "直播间弹幕分析",
      summary: `已采集${collection.totalDanmaku || counts.danmaku || 0}条弹幕，直播结束后统一生成分析报告。`,
      source: "抖音直播间弹幕",
      status,
      counts,
      items: [],
      analysis: null,
      inputs: {
        goal: flow.liveDanmakuGoal || analysis.goal || "",
        sourceScope: "authorized_account_live",
        signals: [...DEFAULT_LIVE_SIGNALS],
        accountId: flow.accountId || snapshot.context?.accountId || "",
        accountName: flow.account || ""
      },
      artifacts: [],
      collectionSnapshot: collection
    });
  }

  async function startLiveDanmakuOutreach(agent, flow, { authorizedAccount = null } = {}) {
    if (!flow || flow.requesting) return;
    const validation = validateLiveDanmakuOutreachSetup(flow);
    if (validation) {
      flow.step = "setup";
      flow.setupError = validation;
      render();
      return;
    }
    const agentId = agent.id;
    const executionAgentId = "mkt-comment-acquisition";
    flow.sourceScope = "authorized_account_live";
    flow.analysisKind = "live_danmaku_outreach";
    flow.liveDanmakuSignals = ["danmaku"];
    flow.executionAgentId = executionAgentId;
    flow.requesting = true;
    flow.starting = true;
    flow.step = "running";
    flow.running = true;
    flow.error = null;
    flow.setupError = null;
    flow.taskState = "configuring";
    flow.taskId ||= newTaskId("live-danmaku-outreach");
    flow.taskRunId ||= newTaskId("run");
    const outreachSettings = normalizeLiveDanmakuOutreachSettings(flow);
    flow.liveDanmakuOutreachGoal = outreachSettings.goal;
    flow.liveDanmakuOutreachMessage = outreachSettings.message;
    flow.maxTouchesPerDay = outreachSettings.dailyMax;
    flow.minIntervalMinutes = outreachSettings.minIntervalMinutes;
    let account = authorizedAccount;
    try {
      if (!account) account = await verifyAcquisitionAuthorization(executionAgentId);
      flow.accountId = account?.id || flow.accountId;
      flow.account = account?.name || flow.account;
      flow.accountIdentity = account?.identity || flow.accountIdentity;
      flow.accountWorkKey = douyinAccountWorkKey(flow.accountIdentity, flow.accountId);
      flow.accountRef = account?.identity?.profileUrl || account?.identity?.uniqueId || flow.accountRef || "";
      const payload = buildLiveDanmakuOutreachTaskPayload({ ...flow, conversationId: `agent-square-${flow.taskId}` });
      flow.configuration = structuredClone(payload.config);
      beginWork(agentId, {
        task: outreachSettings.goal,
        phase: "创建直播间弹幕触达任务",
        projectId: null,
        metadata: {
          progressSource: "none",
          taskId: flow.taskId,
          taskRunId: flow.taskRunId,
          accountId: flow.accountId || null,
          accountKey: flow.accountWorkKey || flow.accountId || null,
          accountLabel: flow.account || account?.name || null,
          longRunning: true,
          sourceScope: "authorized_account_live",
          analysisKind: "live_danmaku_outreach",
          liveSignals: ["danmaku"],
          configuration: payload.config
        }
      });
      pushActivity(agentId, `正在接入授权账号的当前直播间；本次目的：${outreachSettings.goal} `);
      persistCloudTask(flow, { phase: "creating", taskId: flow.taskId, taskRunId: flow.taskRunId, taskState: "configuring", longRunning: true, sourceScope: "authorized_account_live", analysisKind: "live_danmaku_outreach" });
      render();
      const started = await executeCoreAgent({
        ...payload,
        agentId,
        executionAgentId,
        accountUseScope: agentId,
        accountName: flow.account || account?.name || "",
        accountKey: flow.accountWorkKey || flow.accountId,
        goal: outreachSettings.goal,
        config: payload.config
      }, 300000);
      const snapshot = started?.resultSnapshot || {};
      flow.taskKey = snapshot.key || flow.taskKey;
      if (!flow.taskKey) throw Object.assign(new Error("核心执行端未返回直播间弹幕触达任务编号"), { code: "CORE_AGENT_TASK_KEY_MISSING" });
      flow.taskState = String(snapshot.state || started?.status || "running").toLowerCase();
      flow.taskSnapshot = { ...snapshot, taskState: flow.taskState, configuration: payload.config };
      flow.configuration = started?.configuration && typeof started.configuration === "object" ? structuredClone(started.configuration) : structuredClone(payload.config);
      flow.resultSnapshot = snapshot.resultSnapshot || snapshot.result || flow.resultSnapshot || null;
      flow.requesting = false;
      flow.starting = false;
      flow.running = ["running", "degraded"].includes(flow.taskState);
      flow.step = "running";
      flow.duplicateTask = snapshot.existing === true;
      persistCloudTask(flow, { phase: "running", taskKey: flow.taskKey, taskId: flow.taskId, taskRunId: flow.taskRunId, taskState: flow.taskState, duplicateOfExistingTask: flow.duplicateTask, longRunning: true, sourceScope: "authorized_account_live", analysisKind: "live_danmaku_outreach" });
      updateWork(agentId, { phase: flow.duplicateTask ? "已切换到现有触达任务" : "直播间弹幕触达中", metadata: { progressSource: "none", taskId: flow.taskId, taskRunId: flow.taskRunId, taskKey: flow.taskKey, taskState: flow.taskState, longRunning: true, sourceScope: "authorized_account_live", analysisKind: "live_danmaku_outreach", liveSignals: ["danmaku"], configuration: payload.config } });
      pushActivity(agentId, flow.duplicateTask ? "检测到同一账号已有直播间弹幕触达任务，已切换到现有任务。" : `直播间弹幕触达任务已启动，本次目的：${outreachSettings.goal}`);
      pollCommentAcquisitionTask(agent, flow);
      render();
      void globalThis.__SALEBUDDY__?.navFrameworkReady?.then?.((framework) => framework?.openRealtimeWork?.({ selectedAgentId: agentId, taskId: flow.taskId, taskRunId: flow.taskRunId, accountId: flow.accountId || null, accountKey: flow.accountWorkKey || flow.accountId || null }));
    } catch (error) {
      if (handleAccountBusyStartError(agent, flow, error)) return;
      flow.requesting = false;
      flow.starting = false;
      flow.running = false;
      flow.taskState = "error";
      flow.error = { code: error?.code || "LIVE_DANMAKU_OUTREACH_START_FAILED", message: error?.message || "直播间弹幕触达启动失败" };
      persistCloudTask(flow, { phase: "error", errorCode: flow.error.code, errorMessage: flow.error.message, taskState: "error", failedAt: new Date().toISOString(), sourceScope: "authorized_account_live", analysisKind: "live_danmaku_outreach" });
      updateWork(agentId, { phase: "直播间弹幕触达启动失败", metadata: { progressSource: "none", taskState: "error", errorCode: flow.error.code, analysisKind: "live_danmaku_outreach" } });
      reportWorkError(agentId, `直播间弹幕触达未启动：${flow.error.message}`);
      render();
    }
  }

  async function startLiveDanmakuAnalysis(agent, flow, { authorizedAccount = null } = {}) {
    if (!flow || flow.requesting) return;
    const validation = validateLiveDanmakuAnalysisSetup(flow);
    if (validation) {
      flow.step = "setup";
      flow.setupError = validation;
      render();
      return;
    }
    const agentId = agent.id;
    const executionAgentId = "mkt-comment-acquisition";
    flow.sourceScope = "authorized_account_live";
    flow.analysisKind = "live_danmaku";
    flow.executionAgentId = executionAgentId;
    flow.requesting = true;
    flow.starting = true;
    flow.step = "running";
    flow.running = true;
    flow.error = null;
    flow.setupError = null;
    flow.taskState = "configuring";
    flow.taskId ||= newTaskId("live-danmaku-analysis");
    flow.taskRunId ||= newTaskId("run");
    let account = authorizedAccount;
    try {
      if (!account) account = await verifyAcquisitionAuthorization(executionAgentId);
      flow.accountId = account?.id || flow.accountId;
      flow.account = account?.name || flow.account;
      flow.accountIdentity = account?.identity || flow.accountIdentity;
      flow.accountWorkKey = douyinAccountWorkKey(flow.accountIdentity, flow.accountId);
      flow.accountRef = account?.identity?.profileUrl || account?.identity?.uniqueId || flow.accountRef || "";
      const payload = buildLiveDanmakuAnalysisTaskPayload({ ...flow, conversationId: `agent-square-${flow.taskId}` });
      flow.configuration = structuredClone(payload.config);
      beginWork(agentId, {
        task: "持续采集直播间弹幕，直播结束后统一生成分析报告",
        phase: "创建直播弹幕分析任务",
        projectId: null,
        metadata: {
          progressSource: "none",
          taskId: flow.taskId,
          taskRunId: flow.taskRunId,
          accountId: flow.accountId || null,
          accountKey: flow.accountWorkKey || flow.accountId || null,
          accountLabel: flow.account || account?.name || null,
          longRunning: true,
          sourceScope: "authorized_account_live",
          analysisKind: "live_danmaku",
          configuration: payload.config
        }
      });
      pushActivity(agentId, "正在接入授权账号的当前直播间，持续采集整场弹幕；直播结束后统一生成分析报告。 ");
      persistCloudTask(flow, { phase: "creating", taskId: flow.taskId, taskRunId: flow.taskRunId, taskState: "configuring", longRunning: true, sourceScope: "authorized_account_live", analysisKind: "live_danmaku" });
      render();
      const started = await executeCoreAgent({
        ...payload,
        agentId,
        executionAgentId,
        accountUseScope: agentId,
        accountName: flow.account || account?.name || "",
        accountKey: flow.accountWorkKey || flow.accountId,
        goal: flow.liveDanmakuGoal,
        config: payload.config
      }, 300000);
      const snapshot = started?.resultSnapshot || {};
      flow.taskKey = snapshot.key || flow.taskKey;
      if (!flow.taskKey) throw Object.assign(new Error("核心执行端未返回直播弹幕分析任务编号"), { code: "CORE_AGENT_TASK_KEY_MISSING" });
      flow.taskState = String(snapshot.state || started?.status || "running").toLowerCase();
      flow.taskSnapshot = { ...snapshot, taskState: flow.taskState, configuration: payload.config };
      flow.configuration = started?.configuration && typeof started.configuration === "object" ? structuredClone(started.configuration) : structuredClone(payload.config);
      flow.resultSnapshot = snapshot.resultSnapshot || snapshot.result || flow.resultSnapshot || null;
      flow.requesting = false;
      flow.starting = false;
      flow.running = ["running", "degraded"].includes(flow.taskState);
      flow.step = "running";
      flow.duplicateTask = snapshot.existing === true;
      persistCloudTask(flow, { phase: "running", taskKey: flow.taskKey, taskId: flow.taskId, taskRunId: flow.taskRunId, taskState: flow.taskState, duplicateOfExistingTask: flow.duplicateTask, longRunning: true, sourceScope: "authorized_account_live", analysisKind: "live_danmaku" });
      updateWork(agentId, { phase: flow.duplicateTask ? "已切换到现有分析任务" : "直播弹幕采集中", metadata: { progressSource: "none", taskId: flow.taskId, taskRunId: flow.taskRunId, taskKey: flow.taskKey, taskState: flow.taskState, longRunning: true, sourceScope: "authorized_account_live", analysisKind: "live_danmaku", configuration: payload.config } });
      pushActivity(agentId, flow.duplicateTask ? "检测到同一账号已有直播弹幕分析任务，已切换到现有任务。" : "直播间弹幕采集任务已启动，直播结束后会生成报告并发送到成员对话。 ");
      pollCommentAcquisitionTask(agent, flow);
      render();
      void globalThis.__SALEBUDDY__?.navFrameworkReady?.then?.((framework) => framework?.openRealtimeWork?.({ selectedAgentId: agentId, taskId: flow.taskId, taskRunId: flow.taskRunId, accountId: flow.accountId || null, accountKey: flow.accountWorkKey || flow.accountId || null }));
    } catch (error) {
      if (handleAccountBusyStartError(agent, flow, error)) return;
      flow.requesting = false;
      flow.starting = false;
      flow.running = false;
      flow.taskState = "error";
      flow.error = { code: error?.code || "LIVE_DANMAKU_ANALYSIS_START_FAILED", message: error?.message || "直播间弹幕分析启动失败" };
      persistCloudTask(flow, { phase: "error", errorCode: flow.error.code, errorMessage: flow.error.message, taskState: "error", failedAt: new Date().toISOString(), sourceScope: "authorized_account_live", analysisKind: "live_danmaku" });
      updateWork(agentId, { phase: "直播弹幕分析启动失败", metadata: { progressSource: "none", taskState: "error", errorCode: flow.error.code } });
      reportWorkError(agentId, `直播间弹幕分析未启动：${flow.error.message}`);
      render();
    }
  }

  async function startCommentAcquisition(agent, flow, { authorizedAccount = null } = {}) {
    if (!flow || flow.requesting) return;
    const finderListener = isFinderListenerFlow(agent, flow);
    const sourceScope = finderListener
      ? finderListenerSourceScope(flow)
      : "authorized_account_all_signals";
    const executionAgentId = finderListener ? "mkt-comment-acquisition" : agent.id;
    flow.sourceScope = sourceScope;
    flow.executionAgentId = executionAgentId;
    const validation = finderListener
      ? validateFinderListenerSetup(flow)
      : validateCommentAcquisitionSetup(flow);
    if (validation) {
      flow.step = "setup";
      flow.setupError = validation;
      render();
      return;
    }
    const agentId = agent.id;
    const retainSetupUntilAccepted = flow.managerFullStartPending === true;
    flow.requesting = true;
    let account = authorizedAccount;
    if (!account) {
      try {
        account = await verifyAcquisitionAuthorization(executionAgentId);
      } catch (error) {
        flow.requesting = false;
        flow.running = false;
        flow.step = "setup";
        flow.taskState = null;
        flow.setupError = error?.message || "请先完成抖音账号登录，确认登录后才能启动获客任务";
        flow.authErrorCode = error?.code || "DOUYIN_LOGIN_REQUIRED";
        render();
        return;
      }
    }
    flow.setupError = null;
    flow.step = retainSetupUntilAccepted ? "setup" : "running";
    flow.error = null;
    flow.duplicateTask = false;
    flow.taskState = "configuring";
    flow.taskId ||= newTaskId(finderListener ? "finder-listener" : "comment-acquisition");
    flow.taskRunId ||= newTaskId("run");
    flow.accountId = account?.id || flow.accountId;
    flow.account = account?.name || flow.account;
    flow.accountIdentity = account?.identity || flow.accountIdentity;
    flow.accountWorkKey = douyinAccountWorkKey(flow.accountIdentity, flow.accountId);
    flow.accountRef = account?.identity?.profileUrl || account?.identity?.uniqueId || flow.accountRef || "";
    const buildPayload = finderListener ? buildFinderListenerTaskPayload : buildCommentAcquisitionTaskPayload;
    const initialTaskConfig = buildPayload({ ...flow, conversationId: `agent-square-${flow.taskId}` }).config;
    flow.configuration = structuredClone(initialTaskConfig);
    beginWork(agentId, {
      task: finderListener
        ? `持续监听${finderListenerSourceLabel(sourceScope)}，汇总互动用户`
        : "持续汇集评论、直播与互动信号，识别并触达高意向客户",
      phase: finderListener ? "创建持续找客任务" : "创建长期获客任务",
      projectId: null,
      metadata: {
        progressSource: "none",
        taskId: flow.taskId,
        taskRunId: flow.taskRunId,
        accountId: flow.accountId || null,
        accountKey: flow.accountWorkKey || douyinAccountWorkKey(flow.accountIdentity, flow.accountId) || null,
        accountLabel: flow.account || account?.name || null,
        longRunning: true,
        sourceScope,
        configuration: initialTaskConfig
      }
    });
    pushActivity(agentId, finderListener
      ? `正在持续监听授权账号的${finderListenerSourceLabel(sourceScope)}，汇总互动用户和原始证据，等待客户分析员判断。`
      : "正在开启综合获客：接入互动通知与直播消息，识别高意向客户并完成首次触达。");
    persistCloudTask(flow, { phase: "creating", taskId: flow.taskId, taskRunId: flow.taskRunId, taskState: "configuring", longRunning: true });
    render();
    try {
      const payload = buildPayload({ ...flow, conversationId: `agent-square-${flow.taskId}` });
      const started = await executeCoreAgent({
        ...payload,
        agentId,
        executionAgentId: payload.executionAgentId || executionAgentId || undefined,
        accountUseScope: retainSetupUntilAccepted ? `${agentId}:acquisition` : agentId,
        accountName: flow.account || account?.name || "",
        accountKey: flow.accountWorkKey || douyinAccountWorkKey(flow.accountIdentity, flow.accountId) || flow.accountId,
        goal: finderListener
          ? `持续监听授权账号${finderListenerSourceLabel(sourceScope)}里的新信号，筛选潜在客户并保留原始证据，不触达用户`
          : flow.replyObjective || "持续监听授权账号的新评论、直播互动和账号互动，判断潜客并按策略推进",
        config: payload.config
      }, 300000);
      const snapshot = started?.resultSnapshot || {};
      flow.taskKey = snapshot.key || flow.taskKey;
      if (!flow.taskKey) throw Object.assign(new Error("核心执行端未返回长期任务编号"), { code: "CORE_AGENT_TASK_KEY_MISSING" });
      flow.requesting = false;
      flow.taskState = String(snapshot.state || started?.status || "running").toLowerCase();
      flow.taskSnapshot = { ...snapshot, taskState: flow.taskState, configuration: initialTaskConfig };
      flow.configuration = started?.configuration && typeof started.configuration === "object"
        ? structuredClone(started.configuration)
        : structuredClone(initialTaskConfig);
      flow.duplicateTask = snapshot.existing === true;
      flow.running = ["running", "degraded"].includes(flow.taskState);
      persistCloudTask(flow, { phase: "running", taskKey: flow.taskKey, taskId: flow.taskId, taskRunId: flow.taskRunId, taskState: flow.taskState, duplicateOfExistingTask: flow.duplicateTask, longRunning: true, sourceScope });
      updateWork(agentId, { phase: flow.duplicateTask ? "已切换到现有长期任务" : finderListener ? "持续找客中" : "持续获客中", metadata: { progressSource: "none", taskId: flow.taskId, taskRunId: flow.taskRunId, taskKey: flow.taskKey, taskState: flow.taskState, duplicateOfExistingTask: flow.duplicateTask, longRunning: true, sourceScope, configuration: initialTaskConfig } });
      pushActivity(agentId, flow.duplicateTask
        ? "检测到同一账号已有相同长期任务，已切换到现有任务；本次没有重复创建或发送。"
        : finderListener
        ? `找客任务已启动，正在等待${finderListenerSourceLabel(sourceScope)}的新信号；候选和原始证据会同步到成果中心。`
        : "综合获客任务已启动，正在接入各数据源；离开页面后仍会继续运行。");
      flow.step = "running";
      flow.managerFullStartPending = false;
      flow.starting = false;
      render();
      void globalThis.__SALEBUDDY__?.navFrameworkReady?.then?.((framework) => framework?.openRealtimeWork?.({
        selectedAgentId: agentId,
        taskId: flow.taskId,
        taskRunId: flow.taskRunId,
        accountId: flow.accountId || null,
        accountKey: flow.accountWorkKey || douyinAccountWorkKey(flow.accountIdentity, flow.accountId) || null
      }));
      pollCommentAcquisitionTask(agent, flow);
    } catch (error) {
      if (handleAccountBusyStartError(agent, flow, error)) return;
      flow.requesting = false;
      flow.running = false;
      flow.managerFullStartPending = false;
      flow.starting = false;
      flow.taskState = "error";
      flow.error = { code: error?.code || "ACQUISITION_TASK_START_FAILED", message: error?.message || "长期任务启动失败" };
      persistCloudTask(flow, { phase: "error", errorCode: flow.error.code, errorMessage: flow.error.message, taskState: "error", failedAt: new Date().toISOString() });
      updateWork(agentId, { phase: "长期任务启动失败", metadata: { progressSource: "none", taskState: "error", errorCode: flow.error.code } });
      reportWorkError(agentId, `${finderListener ? "持续找客" : "综合获客"}任务未启动：${flow.error.message}`);
      render();
    }
  }

  function applyCommentAcquisitionStatus(flow, result) {
    if (!result) return;
    flow.taskSnapshot = result;
    const nextConfiguration = result.configuration && typeof result.configuration === "object"
      ? structuredClone(result.configuration)
      : null;
    const configurationChanged = nextConfiguration
      && JSON.stringify(nextConfiguration) !== JSON.stringify(flow.configuration || null);
    if (configurationChanged) flow.configuration = nextConfiguration;
    flow.taskState = String(result.taskState || result.state || "running").toLowerCase();
    flow.runtimeState = result.runtimeState || null;
    flow.health = result.health || null;
    flow.approvalQueue = Array.isArray(result.approvalQueue) ? result.approvalQueue : flow.approvalQueue || [];
    flow.events = Array.isArray(result.events) ? result.events : flow.events || [];
    flow.resultSnapshot = result.resultSnapshot || result.snapshot || flow.resultSnapshot || null;
    const liveDanmakuAnalysis = isLiveDanmakuAnalysisFlow({ id: flow.agentId }, flow);
    const liveDanmakuOutreach = isLiveDanmakuOutreachFlow({ id: flow.agentId }, flow);
    if (liveDanmakuAnalysis) {
      flow.analysisKind = "live_danmaku";
      flow.sourceScope = "authorized_account_live";
      flow.liveDanmakuSignals = [...DEFAULT_LIVE_SIGNALS];
      flow.liveDanmakuAnalysis = flow.resultSnapshot?.danmakuAnalysis || result.danmakuAnalysis || flow.liveDanmakuAnalysis || null;
    } else if (liveDanmakuOutreach) {
      flow.analysisKind = "live_danmaku_outreach";
      flow.sourceScope = "authorized_account_live";
      flow.liveDanmakuSignals = ["danmaku"];
      flow.approvalMode = "auto";
      flow.touchChannel = "private_message";
      const outreachSettings = normalizeLiveDanmakuOutreachSettings({
        ...flow,
        configuration: flow.configuration || result.configuration || result.config || null
      });
      flow.liveDanmakuOutreachGoal = outreachSettings.goal;
      flow.liveDanmakuOutreachMessage = outreachSettings.message;
      flow.maxTouchesPerDay = outreachSettings.dailyMax;
      flow.minIntervalMinutes = outreachSettings.minIntervalMinutes;
    }
    if (["error", "stopped", "completed", "succeeded"].includes(flow.taskState)) flow.running = false;
    flow.error = flow.taskState === "error" ? (result.error || result.lastError || { code: "ACQUISITION_TASK_ERROR", message: "长期任务运行异常" }) : null;
    if (configurationChanged) {
      persistCloudTask(flow, {
        phase: ["running", "degraded"].includes(flow.taskState) ? "running" : flow.taskState,
        taskKey: flow.taskKey,
        taskState: flow.taskState,
        longRunning: true,
        sourceScope: flow.sourceScope
      });
    }
    if (liveDanmakuAnalysis) recordLiveDanmakuAnalysisResult(flow, result);
    else recordCommentAcquisitionResult(flow, result);
    updateWork(flow.agentId, {
      phase: flow.taskState === "stopped" ? (liveDanmakuAnalysis ? "直播弹幕分析已关闭" : liveDanmakuOutreach ? "直播间弹幕触达已关闭" : isFinderListenerFlow({ id: flow.agentId }, flow) ? "找客已关闭" : "获客已关闭") : flow.taskState === "completed" ? (liveDanmakuAnalysis ? "直播弹幕分析报告已完成" : "任务已完成") : result.resumeBlocked?.reason === "authorization_required" ? "等待账号重新连接" : flow.taskState === "paused" && result.systemPause?.reason === "system_duplicate_consolidation" ? "已保留最新任务" : flow.taskState === "paused" ? "长期任务已暂停" : flow.taskState === "error" ? "长期任务异常" : flow.taskState === "degraded" ? "等待数据源恢复" : liveDanmakuAnalysis ? "直播弹幕采集中" : liveDanmakuOutreach ? "直播间弹幕触达中" : isFinderListenerFlow({ id: flow.agentId }, flow) ? "持续找客中" : "持续获客中",
      metadata: {
        progressSource: "none",
        taskId: flow.taskId,
        taskRunId: flow.taskRunId,
        taskKey: flow.taskKey,
        taskState: flow.taskState,
        runtimeState: flow.runtimeState,
        health: flow.health,
        longRunning: true,
        configuration: flow.configuration || null,
        acquisitionSnapshot: result
      }
    });
  }

  function pollCommentAcquisitionTask(agent, flow) {
    if (!flow?.taskKey || flow.polling) return;
    flow.polling = true;
    const poll = async () => {
      if (!flow.polling || !flow.taskKey) { flow.polling = false; return; }
      const canRender = !disposed && state.view === "use" && state.useFlow === flow;
      try {
        const base = String(controlPlaneBaseUrl()).replace(/\/$/, "");
        const response = await fetch(`${base}/v1/douyin/acquisition/tasks/${encodeURIComponent(flow.taskKey)}`, { headers: { accept: "application/json" } });
        const result = await response.json().catch(() => null);
        if (!response.ok) throw Object.assign(new Error(result?.error?.message || `长期任务状态读取失败（HTTP ${response.status}）`), { code: result?.error?.code || "ACQUISITION_TASK_STATUS_FAILED" });
        applyCommentAcquisitionStatus(flow, result);
        if (canRender) render();
      } catch (error) {
        // A transient status read failure must not stop the durable backend task.
        flow.statusReadError = { code: error?.code || "ACQUISITION_TASK_STATUS_FAILED", message: error?.message || "暂时无法读取任务状态" };
        if (canRender) render();
      }
      if (flow.polling && flow.running !== false && !["error", "stopped", "completed", "succeeded"].includes(flow.taskState)) globalThis.setTimeout(poll, 5000);
      else flow.polling = false;
    };
    globalThis.setTimeout(poll, 1200);
  }

  async function controlCommentAcquisitionTask(flow, action, button = null) {
    if (!flow?.taskKey || button?.disabled) return;
    if (button) button.disabled = true;
    try {
      const base = String(controlPlaneBaseUrl()).replace(/\/$/, "");
      let result;
      if (["resume", "retry"].includes(action)) {
        const persistedTaskId = flow.taskId || flow.taskSnapshot?.context?.taskId || flow.taskSnapshot?.taskId || null;
        const persistedTaskRunId = flow.taskRunId || flow.taskSnapshot?.context?.taskRunId || flow.taskSnapshot?.taskRunId || null;
        if (!persistedTaskId) throw Object.assign(new Error("找不到需要恢复的任务标识，请刷新后重试"), { code: "ACQUISITION_TASK_ID_REQUIRED" });
        const finderListener = isFinderListenerFlow({ id: flow.agentId }, flow);
        const liveDanmakuAnalysis = isLiveDanmakuAnalysisFlow({ id: flow.agentId }, flow);
        const liveDanmakuOutreach = isLiveDanmakuOutreachFlow({ id: flow.agentId }, flow);
        const sourceScope = liveDanmakuAnalysis || liveDanmakuOutreach
          ? "authorized_account_live"
          : finderListener
          ? finderListenerSourceScope(flow)
          : "authorized_account_all_signals";
        const configuration = flow.configuration && typeof flow.configuration === "object"
          ? structuredClone(flow.configuration)
          : flow.taskSnapshot?.config && typeof flow.taskSnapshot.config === "object"
            ? structuredClone(flow.taskSnapshot.config)
            : {};
        const outreachSettings = normalizeLiveDanmakuOutreachSettings({ ...flow, configuration });
        const started = await executeCoreAgent({
          agentId: flow.agentId,
          taskId: persistedTaskId,
          taskRunId: persistedTaskRunId,
          taskKey: flow.taskKey,
          operation: action,
          conversationId: flow.taskSnapshot?.context?.conversationId || `agent-square-${persistedTaskId}`,
          accountId: flow.accountId,
          accountKey: flow.accountWorkKey || douyinAccountWorkKey(flow.accountIdentity, flow.accountId) || flow.accountId,
          accountName: flow.account || "",
          accountIdentity: flow.accountIdentity || flow.taskSnapshot?.accountIdentity || null,
          goal: liveDanmakuOutreach
            ? outreachSettings.goal
            : liveDanmakuAnalysis
            ? flow.liveDanmakuGoal || "梳理直播间高频问题、用户需求、购买意向和反对点。"
            : finderListener
            ? `持续监听授权账号${finderListenerSourceLabel(sourceScope)}的新信号，筛选潜在客户并保留原始证据，不发送私信`
            : "持续监听授权账号的新评论、直播互动和账号互动，判断潜客并按策略推进",
          config: {
            ...configuration,
            sourceScope: {
              ...(configuration.sourceScope && typeof configuration.sourceScope === "object" ? configuration.sourceScope : {}),
              kind: sourceScope
            },
            ...(liveDanmakuOutreach
              ? {
                discoveryOnly: false,
                analysisOnly: false,
                analysisKind: "live_danmaku_outreach",
                liveDanmakuOutreach: true,
                touchEveryLiveDanmaku: true,
                liveSignals: ["danmaku"],
                touchChannel: "private_message",
                approvalMode: "auto",
                audienceRules: {
                  ...(configuration.audienceRules && typeof configuration.audienceRules === "object" ? configuration.audienceRules : {}),
                  goal: outreachSettings.goal,
                  requirements: outreachSettings.goal,
                  minScore: 0
                },
                contentPolicy: {
                  ...(configuration.contentPolicy && typeof configuration.contentPolicy === "object" ? configuration.contentPolicy : {}),
                  quoteComment: false,
                  maxLength: 120,
                  template: outreachSettings.message,
                  strategy: outreachSettings.message,
                  conversionGoal: outreachSettings.goal
                },
                caps: {
                  ...(configuration.caps && typeof configuration.caps === "object" ? configuration.caps : {}),
                  dailyMax: outreachSettings.dailyMax,
                  sendIntervalMs: outreachSettings.minIntervalMinutes * 60 * 1000
                }
              }
              : liveDanmakuAnalysis
              ? { discoveryOnly: true, analysisOnly: true, analysisKind: "live_danmaku", liveSignals: [...DEFAULT_LIVE_SIGNALS], approvalMode: "manual", autoStartCloud: false }
              : finderListener ? { discoveryOnly: true, approvalMode: "manual" } : {})
          }
        }, 300000);
        flow.taskKey = started?.resultSnapshot?.key || flow.taskKey;
        const statusResponse = await fetch(`${base}/v1/douyin/acquisition/tasks/${encodeURIComponent(flow.taskKey)}`, { headers: { accept: "application/json" } });
        result = await statusResponse.json().catch(() => null);
        if (!statusResponse.ok) throw Object.assign(new Error(result?.error?.message || `任务${action}失败`), { code: result?.error?.code || "ACQUISITION_TASK_ACTION_FAILED" });
      } else {
        const response = await fetch(`${base}/v1/douyin/acquisition/tasks/${encodeURIComponent(flow.taskKey)}/${action}`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({}) });
        result = await response.json().catch(() => null);
        if (!response.ok) throw Object.assign(new Error(result?.error?.message || `任务${action}失败`), { code: result?.error?.code || "ACQUISITION_TASK_ACTION_FAILED" });
      }
      applyCommentAcquisitionStatus(flow, result);
      flow.running = ["running", "degraded"].includes(String(flow.taskState || "").toLowerCase());
      const finderListener = isFinderListenerFlow({ id: flow.agentId }, flow);
      const liveDanmakuOutreach = isLiveDanmakuOutreachFlow({ id: flow.agentId }, flow);
      pushActivity(flow.agentId, finderListener
        ? (action === "stop" ? "找客监听已停止，候选名单和原始证据保留。" : action === "pause" ? "已暂停找客监听，现有候选保留。" : action === "retry" ? "已读取已保存的找人条件，继续监听新信号。" : "已恢复找客监听。")
        : liveDanmakuOutreach
        ? (action === "stop" ? "直播间弹幕触达已停止，已记录的触达结果保留。" : action === "pause" ? "已暂停直播间弹幕触达，现有记录保留。" : action === "retry" ? "已读取直播间弹幕触达配置，继续监听新弹幕。" : "已恢复直播间弹幕触达。")
        : action === "stop" ? "已关闭自动获客，现有记录保留。" : action === "pause" ? "已暂停综合获客，现有记录保留。" : action === "retry" ? "获客配置已读取，正在继续自动获客。" : "已恢复综合获客。");
      persistCloudTask(flow, { phase: action === "stop" ? "stopped" : action === "pause" ? "paused" : "running", taskState: flow.taskState });
      if (["resume", "retry"].includes(action)) pollCommentAcquisitionTask(getMarketplaceAgent(flow.agentId), flow);
      render();
    } catch (error) {
      if (button) button.disabled = false;
      flow.statusReadError = { code: error?.code || "ACQUISITION_TASK_ACTION_FAILED", message: error?.message || "任务操作失败" };
      render();
      throw error;
    }
  }

async function startPrivateOutreachMock(agent, flow, targets) {
    const agentId = flow.agentId || agent.id;
    flow.taskId ||= newTaskId("mock-private-outreach");
    flow.taskRunId ||= `${flow.taskId}:run`;
    flow.accountWorkKey ||= douyinAccountWorkKey(flow.accountIdentity, flow.accountId);
    flow.step = "running";
    flow.requesting = true;
    flow.error = null;
    flow.receiptPending = false;
    flow.receiptPendingAt = null;
    flow.result = null;
    flow.checks = [true, false, false, false];
    flow.activeTargetIndex = null;
    flow.targetEntries = flow.targetEntries.map((entry) => entry.status === "ready"
      ? { ...entry, status: "pending", error: null }
      : entry);
    beginWork(agentId, {
      task: `模拟给 ${targets.length} 位抖音用户发送私信`,
      phase: "模拟确认触达名单",
      projectId: null,
      metadata: {
        progressSource: "none",
        taskId: flow.taskId,
        taskRunId: flow.taskRunId,
        accountId: flow.accountId || null,
        accountKey: flow.accountWorkKey || null,
        executionAgentId: agentId,
        outreachMode: privateOutreachMode(flow),
        targetCount: targets.length,
        mock: true
      }
    });
    pushActivity(agentId, `Mock 预览已确认 ${targets.length} 位${privateOutreachMode(flow) === PRIVATE_OUTREACH_MODES.ALL_FOUND ? "用户" : "潜客"}，准备模拟首轮私信。`);
    updateWork(agentId, {
      phase: "模拟发送私信",
      metadata: { progressSource: "none", cloudWatch: "action_in_flight", mock: true, outreachMode: privateOutreachMode(flow), targetCount: targets.length }
    });
    render();

    await new Promise((resolve) => window.setTimeout(resolve, 240));
    if (disposed || state.useFlow !== flow) return;
    const result = createPrivateOutreachMockResult(targets, flow.message.trim());
    const resultById = new Map(result.entries.map((entry) => [entry.recordId || entry.sourceRecordId, entry]));
    flow.targetEntries = flow.targetEntries.map((entry) => {
      const key = entry.recordId || entry.sourceRecordId;
      return resultById.get(key) || entry;
    });
    flow.requesting = false;
    flow.activeTargetIndex = null;
    flow.checks = [true, true, true, true];
    flow.result = result;
    flow.mockResult = true;
    flow.error = null;
    updateWork(agentId, {
      phase: "模拟私信发送完成",
      metadata: {
        progressSource: "none",
        cloudWatch: "completed",
        mock: true,
        outreachMode: privateOutreachMode(flow),
        targetCount: result.total,
        sentCount: result.sent,
        failedCount: result.failed,
        unknownCount: result.unknown
      }
    });
    pushActivity(agentId, `Mock 预览已模拟完成 ${result.sent} 条私信，并返回逐条成功回执。`);
    finishWork(agentId, "模拟私信发送结果");
    render();
    if (!embedded) {
      void globalThis.__SALEBUDDY__?.navFrameworkReady?.then?.((framework) => framework?.openRealtimeWork?.({
        selectedAgentId: agentId,
        taskId: flow.taskId,
        accountId: flow.accountId || null,
        accountKey: flow.accountWorkKey || null
      }));
    }
  }

  async function startPrivateOutreach(agent, flow) {
    if (flow.requesting) return;
    const rawTargets = (Array.isArray(flow.targetEntries) ? flow.targetEntries : [])
      .filter((entry) => entry?.status === "ready");
    const targets = privateOutreachReadyEntries(flow);
    if (!flow.authorizedAccounts?.length) {
      flow.step = "setup";
      flow.authError = "请先打开云电脑，在云电脑内登录抖音后再发送";
      render();
      return;
    }
    if (privateOutreachUsesProspectBoundary(flow) && rawTargets.some((entry) => !privateOutreachEntryIsAllowed(flow, entry))) {
      flow.step = "setup";
      flow.targetResolveError = privateOutreachMode(flow) === PRIVATE_OUTREACH_MODES.ALL_FOUND
        ? "只能触达当前账号找到且尚未触达的用户"
        : "只能触达当前账号通过评论、直播或互动任务找到的待确认触达潜客";
      render();
      return;
    }
    if (!targets.length || !flow.message?.trim()) {
      flow.step = "setup";
      flow.targetResolveError = targets.length ? null : privateOutreachUsesProspectBoundary(flow)
        ? privateOutreachMode(flow) === PRIVATE_OUTREACH_MODES.ALL_FOUND
          ? "请先选择当前账号下尚未触达的找到的人"
          : "请先从成果中心选择当前账号下的待确认触达潜客"
        : "请先识别至少一个可发送的目标";
      render();
      return;
    }
    if (privateOutreachUsesProspectBoundary(flow)) {
      const sync = await prospectStore.flushRemoteSync?.();
      if (sync?.pending || sync?.syncing) {
        flow.step = "setup";
        flow.targetResolveError = sync?.lastError
          ? `成果中心同步未完成：${sync.lastError}`
          : "成果中心仍在同步，请稍后再发送";
        render();
        return;
      }
    }
    if (flow.mockPreview) {
      await startPrivateOutreachMock(agent, flow, targets);
      return;
    }
    flow.step = "running";
    flow.requesting = true;
    flow.checks = [true, false, false, false];
    flow.error = null;
    flow.receiptPending = false;
    flow.receiptPendingAt = null;
    flow.result = null;
    flow.activeTargetIndex = null;
    flow.targetEntries = flow.targetEntries.map((entry) => entry.status === "ready"
      ? { ...entry, status: "pending", error: null }
      : entry);
    const agentId = flow.agentId || agent.id;
    const providerAgentId = authorizationAgentId(flow);
    // A new user-confirmed attempt gets a fresh provider request id. Each
    // target then receives its own id so a batch can be retried safely.
    if (!isUserResearchAgent(agent)) flow.taskId = newTaskId("private-outreach");
    else flow.taskId ||= newTaskId("user-research");
    const settlePrivateOutreachFailure = (error) => {
      // A provider can acknowledge the browser action and lose the final
      // receipt while the cloud desktop remains online. Treat that outcome as
      // pending even when it arrives through the outer error path; only a
      // confirmed rejection/offline condition is a terminal failure.
      const receiptPending = privateOutreachHasNoReceipt(error) || error?.details?.outcome === "unknown";
      if (receiptPending) {
        flow.requesting = false;
        flow.error = null;
        flow.receiptPending = true;
        flow.receiptPendingAt = new Date().toISOString();
        flow.result = {
          total: targets.length,
          sent: 0,
          failed: 0,
          unknown: targets.length,
          status: "pending"
        };
        flow.checks[3] = false;
        persistCloudTask(flow, {
          phase: "awaiting_receipt",
          errorCode: null,
          errorMessage: null,
          lastError: null,
          receiptPending: true,
          receiptPendingCode: PRIVATE_OUTREACH_RECEIPT_PENDING,
          receiptPendingAt: flow.receiptPendingAt,
          targetCount: targets.length,
          sentCount: 0,
          failedCount: 0,
          unknownCount: targets.length
        });
        updateWork(agentId, {
          phase: "等待平台回执",
          metadata: {
            progressSource: "none",
            cloudWatch: "waiting_receipt",
            receiptPending: true,
            receiptPendingCode: PRIVATE_OUTREACH_RECEIPT_PENDING,
            targetCount: targets.length,
            sentCount: 0,
            failedCount: 0,
            unknownCount: targets.length
          }
        });
        pushActivity(agentId, "云电脑已提交私信动作，平台最终回执尚未返回；我会继续核对，不会自动重复发送。");
        recordPrivateOutreachResult(flow, { status: "pending" });
        render();
        return;
      }
      const normalized = error?.code && error?.message
        ? { code: error.code, message: error.message, details: error.details || null }
        : { code: "PRIVATE_OUTREACH_FAILED", message: String(error || "私信发送失败，请检查授权和目标主页"), details: null };
      flow.requesting = false;
      flow.error = normalized;
      persistCloudTask(flow, {
        phase: "error",
        errorCode: normalized.code,
        errorMessage: normalized.message,
        lastError: normalized.message,
        failedAt: new Date().toISOString()
      });
      updateWork(agentId, {
        phase: "私信发送失败",
        metadata: { progressSource: "none", cloudWatch: "failed", errorCode: normalized.code }
      });
      reportWorkError(agentId, "私信触达未完成：" + normalized.message);
      recordPrivateOutreachResult(flow, { status: "failed", error: normalized });
      render();
    };
    flow.accountWorkKey ||= douyinAccountWorkKey(flow.accountIdentity, flow.accountId);
    beginWork(agentId, { task: `给 ${targets.length} 位抖音用户发送私信`, phase: "解析目标主页", projectId: null, metadata: { progressSource: "none", taskId: flow.taskId, accountId: flow.accountId || null, accountKey: flow.accountWorkKey || null, executionAgentId: providerAgentId, outreachMode: privateOutreachMode(flow), targetCount: targets.length } });
    persistCloudTask(flow, {
      phase: "running",
      taskId: flow.taskId,
      outreachMode: privateOutreachMode(flow),
      errorCode: null,
      errorMessage: null,
      lastError: null,
      failedAt: null
    });
    recordPrivateOutreachResult(flow);
    pushActivity(agentId, `我正在为 ${targets.length} 位目标准备真实私信触达。`);
    render();
    if (!embedded) {
      void globalThis.__SALEBUDDY__?.navFrameworkReady?.then?.((framework) => framework?.openRealtimeWork?.({ selectedAgentId: agentId, taskId: flow.taskId, accountId: flow.accountId || null, accountKey: flow.accountWorkKey || null }));
    }
    let outreachPriorityReserved = false;
    try {
      updateWork(agentId, {
        phase: "确认云电脑连接",
        metadata: { progressSource: "none", cloudWatch: "checking", targetCount: targets.length }
      });
      const authorization = await waitForDouyinAuthorization(providerAgentId, {
        shouldContinue: () => !disposed && state.useFlow === flow && flow.requesting,
        onPending: () => {
          updateWork(agentId, {
            phase: "云电脑连接中，继续等待",
            metadata: { progressSource: "none", cloudWatch: "provisioning", targetCount: targets.length }
          });
          render();
        }
      });
      if (authorization.cloudError) throw authorization.cloudError;
      if (!authorization.account) {
        if (authorization.timedOut) {
          throw Object.assign(new Error("云电脑长时间未返回授权状态，任务已保留，请稍后在成员对话中检查或重启云电脑"), { code: "DOUYIN_PROVISIONING_TIMEOUT" });
        }
        throw Object.assign(new Error("云电脑内尚未检测到抖音登录，请完成授权后重试"), { code: "DOUYIN_AUTHORIZATION_REQUIRED" });
      }
      flow.accountIdentity = authorization.account.identity || flow.accountIdentity;
      flow.accountWorkKey = douyinAccountWorkKey(flow.accountIdentity, flow.accountId);
      updateWork(agentId, { metadata: { accountKey: flow.accountWorkKey || null } });
      await douyinMcpCall("POST", "/v1/douyin/mcp/outreach-priority/start", {
        agentId: providerAgentId,
        accountId: flow.accountId || null,
        taskId: flow.taskId,
        ttlMs: 2 * 60 * 60 * 1000
      }, 30000);
      outreachPriorityReserved = true;
      flow.checks[1] = true;
      updateWork(agentId, {
        phase: "云电脑在线，等待抖音执行",
        metadata: { progressSource: "none", cloudWatch: "running", targetCount: targets.length }
      });
      render();

      updateWork(agentId, {
        phase: "正在执行私信发送",
        metadata: { progressSource: "none", cloudWatch: "action_in_flight", targetCount: targets.length }
      });
      pushActivity(agentId, "云电脑已确认在线，我会逐条发送并等待每一条真实平台回执。 ");
      render();

      let sentCount = 0;
      let failedCount = 0;
      let unknownCount = 0;
      for (const [index, target] of targets.entries()) {
        const sourceRecordId = target.recordId || target.sourceRecordId || "";
        const entry = sourceRecordId
          ? flow.targetEntries.find((item) => (item.recordId || item.sourceRecordId || "") === sourceRecordId) || target
          : flow.targetEntries.find((item) => item.secId === target.secId && item.secUid === target.secUid) || target;
        flow.activeTargetIndex = index;
        entry.status = "sending";
        entry.error = null;
        updateWork(agentId, {
          phase: `正在发送第 ${index + 1} 条，共 ${targets.length} 条`,
          metadata: { progressSource: "none", cloudWatch: "action_in_flight", targetIndex: index, targetCount: targets.length }
        });
        render();
        try {
          entry.submittedAt = new Date().toISOString();
          const sent = privateOutreachUsesProspectBoundary(flow)
            ? await executeCoreAgent({
              agentId: "mkt-cold-writer",
              taskId: `${flow.taskId}:target:${index + 1}`,
              taskRunId: `${flow.taskRunId || flow.taskId}:target:${index + 1}`,
              conversationId: `agent-square-${flow.taskId}`,
              accountId: flow.accountId || "",
              accountKey: flow.accountWorkKey || flow.accountId || "",
              accountName: flow.account || "",
              accountIdentity: flow.accountIdentity || null,
              goal: "向已核验潜客发送首轮私信",
              lead: { sourceRecordId },
              content: flow.message.trim(),
              confirm: "SEND",
              idempotencyKey: `${flow.taskId}-${index + 1}`
            }, 0)
            : await douyinMcpCall("POST", "/v1/douyin/mcp/send-private-message", {
              agentId: providerAgentId,
              ownerAgentId: agentId,
              accountId: flow.accountId || null,
              taskId: flow.taskId,
              secId: target.secId || target.secUid,
              secUid: target.secUid || target.secId,
              content: flow.message.trim(),
              confirm: "SEND",
              reqId: `${flow.taskId}-${index + 1}`,
              // Keep the provider action explicit so the adapter does not infer
              // the mode from omitted fields or display metadata.
              actionType: 5,
              timeoutMs: 30 * 60 * 1000
            }, 0);
          entry.providerResult = sent;
          entry.receiptAt = new Date().toISOString();
          const receiptState = privateOutreachReceiptState(sent);
          if (receiptState === "failed") {
            entry.status = "error";
            entry.error = "平台返回发送失败状态";
            failedCount += 1;
            pushActivity(agentId, `第 ${index + 1} 条私信被平台拒绝或发送失败。`);
          } else if (receiptState === "pending") {
            entry.status = "unknown";
            entry.error = "平台已接收发送动作，等待最终回执";
            unknownCount += 1;
            pushActivity(agentId, `第 ${index + 1} 条私信已提交，正在等待平台最终回执。`);
          } else {
            entry.status = "sent";
            entry.sentAt = entry.receiptAt;
            sentCount += 1;
            flow.checks[2] = true;
            pushActivity(agentId, `第 ${index + 1} 条私信已收到平台成功回执。`);
          }
        } catch (error) {
          const noReceipt = privateOutreachHasNoReceipt(error);
          const unknown = error?.details?.outcome === "unknown";
          const pending = noReceipt || unknown;
          entry.status = pending ? "unknown" : "error";
          entry.error = pending
            ? noReceipt
              ? "平台已接收发送动作，等待最终回执"
              : "云电脑连接中断，发送结果未知"
            : error?.message || "平台未返回成功结果";
          if (pending) unknownCount += 1;
          else failedCount += 1;
          if (error?.code === "DOUYIN_AUTHORIZATION_REQUIRED") {
            for (const remaining of targets.slice(index + 1)) {
              const pending = flow.targetEntries.find((item) => item.secId === remaining.secId && item.secUid === remaining.secUid);
              if (pending) {
                pending.status = "error";
                pending.error = "授权状态失效，未执行";
                failedCount += 1;
              }
            }
            break;
          }
        }
        render();
      }
      flow.activeTargetIndex = null;
      flow.requesting = false;
      flow.checks[3] = true;
      const terminalEntries = flow.targetEntries.filter((entry) => ["sent", "error", "unknown", "duplicate"].includes(entry.status));
      const allProcessed = terminalEntries.length === flow.targetEntries.length;
      // A transport response can be lost after the provider has already
      // submitted the message. Keep that outcome pending instead of turning
      // the whole Agent work into an error or inviting an unsafe resend.
      const receiptPending = unknownCount > 0;
      // Keep the final milestone open until every provider action has a
      // terminal receipt; pending receipts are still an active task state.
      flow.checks[3] = !receiptPending;
      const resultStatus = receiptPending ? "pending" : sentCount > 0 ? "completed" : "failed";
      flow.result = { total: targets.length, sent: sentCount, failed: failedCount, unknown: unknownCount, status: resultStatus };
      flow.receiptPending = receiptPending;
      flow.receiptPendingAt = receiptPending ? new Date().toISOString() : null;
      flow.error = receiptPending || sentCount > 0 ? null : { code: "PRIVATE_OUTREACH_FAILED", message: "没有目标收到平台成功回执" };
      persistCloudTask(flow, {
        phase: receiptPending ? "awaiting_receipt" : allProcessed ? "completed" : "error",
        errorCode: flow.error?.code || null,
        errorMessage: flow.error?.message || null,
        ...(receiptPending
          ? {
            receiptPending: true,
            receiptPendingCode: PRIVATE_OUTREACH_RECEIPT_PENDING,
            receiptPendingAt: flow.receiptPendingAt
          }
          : {
            completedAt: new Date().toISOString(),
            receiptPending: false,
            receiptPendingCode: null,
            receiptPendingAt: null
          }),
        targetCount: targets.length,
        sentCount,
        failedCount,
        unknownCount
      });
      updateWork(agentId, {
        phase: receiptPending ? "等待平台回执" : sentCount > 0 ? "私信发送完成" : "私信发送失败",
        metadata: {
          progressSource: "none",
          cloudWatch: receiptPending ? "waiting_receipt" : sentCount > 0 ? "completed" : "failed",
          targetCount: targets.length,
          sentCount,
          failedCount,
          unknownCount,
          receiptPending,
          receiptPendingCode: receiptPending ? PRIVATE_OUTREACH_RECEIPT_PENDING : null
        }
      });
      pushActivity(agentId, receiptPending
        ? `云电脑已提交 ${targets.length} 个目标的私信动作，但 ${unknownCount} 个目标尚未收到平台回执；我会继续核对，不会自动重复发送。`
        : `本次已处理 ${targets.length} 个目标：成功 ${sentCount} 个，失败 ${failedCount} 个。`);
      if (!receiptPending && sentCount > 0) finishWork(agentId, "私信发送结果");
      if (!receiptPending && sentCount === 0) reportWorkError(agentId, "私信触达未完成：没有目标收到平台成功回执");
      recordPrivateOutreachResult(flow, { status: resultStatus, error: flow.error });
      render();
    } catch (error) {
      settlePrivateOutreachFailure({
        code: error?.code || "PRIVATE_OUTREACH_FAILED",
        message: error?.details?.outcome === "unknown"
          ? "云电脑连接中断，发送结果未知，请先核对原请求结果后再重试。"
          : error?.message || "私信发送失败，请检查授权和目标主页",
        details: error?.details || null,
        providerError: error?.details?.upstreamError || null
      });
    } finally {
      if (outreachPriorityReserved) {
        await douyinMcpCall("POST", "/v1/douyin/mcp/outreach-priority/finish", {
          agentId: providerAgentId,
          taskId: flow.taskId
        }, 15000).catch(() => {});
      }
    }
  }

  function inboxStartState(result) {
    const snapshot = result?.resultSnapshot || result || {};
    const state = snapshot?.startStatus?.state || snapshot?.state || snapshot?.status?.startStatus?.state || result?.status || "";
    return String(state).toLowerCase();
  }

  function markInboxStartAccepted(agent, flow, result) {
    const snapshot = result?.resultSnapshot || result || {};
    const agentId = flow.agentId || agent.id;
    const startState = inboxStartState(snapshot) || (snapshot?.runtime?.running ? "running" : "accepted");
    const managerCombinedStart = isCommentAcquisitionAgent({ id: agentId }) && flow.managerCombinedStart === true;
    const canonicalTaskId = result?.taskId || snapshot?.taskId || snapshot?.startStatus?.taskId || snapshot?.status?.startStatus?.taskId || "";
    const canonicalTaskRunId = result?.taskRunId || snapshot?.taskRunId || snapshot?.startStatus?.taskRunId || snapshot?.status?.startStatus?.taskRunId || "";
    const canonicalConversationId = result?.conversationId || snapshot?.conversationId || snapshot?.startStatus?.conversationId || snapshot?.status?.startStatus?.conversationId || "";
    if (canonicalTaskId) flow.inboxTaskId = canonicalTaskId;
    if (canonicalTaskRunId) flow.inboxTaskRunId = canonicalTaskRunId;
    if (canonicalConversationId) flow.inboxConversationId = canonicalConversationId;
    flow.starting = false;
    flow.startAcceptedState = startState;
    flow.running = true;
    flow.step = "running";
    flow.startError = null;
    flow.error = null;
    flow.inboxTakeoverOwnerAgentId = "";
    flow.statusSyncWarning = "";
    flow.inboxStatusFailures = 0;
    flow.checks = [startState === "running" || Boolean(snapshot?.runtime?.running), false, false, false];
    if (snapshot?.runtime || snapshot?.status?.runtime) applyInboxStatus(flow, snapshot);
    if (managerCombinedStart) {
      flow.managerInboxRuntimeStarted = true;
      flow.managerInboxRuntime = snapshot?.runtime || snapshot?.status?.runtime || { state: startState };
      persistCloudTask(flow, {
        phase: "running",
        inboxTaskId: flow.inboxTaskId,
        inboxTaskRunId: flow.inboxTaskRunId,
        inboxConversationId: flow.inboxConversationId,
        startRequestId: flow.startRequestId,
        inboxStartedAt: new Date().toISOString(),
        inboxActivityInitialized: true,
        inboxActivityKeys: Array.isArray(flow.inboxActivityKeys) ? flow.inboxActivityKeys : []
      });
      return;
    }
    if (!flow.workAccepted) {
      flow.workAccepted = true;
      flow.taskId = canonicalTaskId || flow.taskId || newTaskId("inbox-session");
      flow.taskRunId = canonicalTaskRunId || flow.taskRunId || "";
      beginWork(agentId, {
        task: "承接抖音新私信并生成回复",
        phase: startState === "running" ? "持续监听新私信" : "后端已接收，正在启动承接模块",
        projectId: null,
        metadata: {
          progressSource: "none",
          taskId: flow.taskId,
          accountId: flow.accountId || null,
          accountKey: flow.accountWorkKey || douyinAccountWorkKey(flow.accountIdentity, flow.accountId) || null,
          accountLabel: flow.account || flow.accountIdentity?.accountName || flow.accountIdentity?.nickname || null,
          longRunning: true,
          startRequestId: flow.startRequestId
        }
      });
      pushActivity(agentId, startState === "running" ? "私信承接已启动，后台会持续监听新会话。" : "承接方案已确认，后端已正式接收任务，正在启动长期监听。");
      persistCloudTask(flow, {
        phase: "running",
        taskId: flow.taskId,
        inboxTaskId: flow.inboxTaskId,
        inboxTaskRunId: flow.inboxTaskRunId,
        inboxConversationId: flow.inboxConversationId,
        startRequestId: flow.startRequestId,
        inboxStartedAt: new Date().toISOString(),
        inboxActivityInitialized: true,
        inboxActivityKeys: Array.isArray(flow.inboxActivityKeys) ? flow.inboxActivityKeys : []
      });
      void globalThis.__SALEBUDDY__?.navFrameworkReady?.then?.((framework) => framework?.openRealtimeWork?.({
        selectedAgentId: agentId,
        taskId: flow.taskId,
        accountId: flow.accountId || null,
        accountKey: flow.accountWorkKey || douyinAccountWorkKey(flow.accountIdentity, flow.accountId) || null
      }));
    }
    render();
    pollInboxStatus(agent, flow);
  }

  async function startCompleteAcquisitionAfterInbox(agent, flow, authorizedAccount = null) {
    if (!flow.managerCombinedStart) return;
    const inboxAlreadyRunning = flow.managerInboxRuntimeStarted === true;
    flow.managerCombinedStart = false;
    flow.managerFullStartPending = true;
    flow.starting = true;
    flow.mode = null;
    flow.running = false;
    flow.workAccepted = false;
    flow.step = "setup";
    flow.taskId = "";
    flow.taskRunId = "";
    await startCommentAcquisition(agent, flow, { authorizedAccount });
    if (!inboxAlreadyRunning) return;
    if (flow.taskState === "error" || flow.error || flow.setupError) {
      markManagerAcquisitionStartFailed(agent, flow, flow.error || {
        code: "ACQUISITION_TASK_START_FAILED",
        message: flow.setupError || "完整获客任务未能启动"
      });
      return;
    }
    flow.managerAcquisitionStartFailed = false;
    persistCloudTask(flow, {
      phase: "running",
      inboxTaskId: flow.inboxTaskId || null,
      inboxTaskRunId: flow.inboxTaskRunId || null,
      inboxConversationId: flow.inboxConversationId || null,
      managerInboxRuntimeStarted: true,
      managerInboxRuntime: flow.managerInboxRuntime || null,
      managerAcquisitionStartFailed: false,
      partialStart: null
    });
  }

  function markManagerAcquisitionStartFailed(agent, flow, error) {
    if (flow.managerInboxRuntimeStarted !== true) return;
    const cause = error?.message || "完整获客任务未能启动";
    flow.requesting = false;
    flow.running = false;
    flow.step = "running";
    flow.taskState = "error";
    flow.setupError = null;
    flow.managerAcquisitionStartFailed = true;
    flow.error = {
      code: error?.code || "ACQUISITION_TASK_START_FAILED",
      message: `私信承接已启动，但完整获客任务未能启动：${cause}。你可以继续启动完整获客，系统不会重复启动私信承接。`
    };
    persistCloudTask(flow, {
      phase: "error",
      taskState: "error",
      errorCode: flow.error.code,
      errorMessage: flow.error.message,
      failedAt: new Date().toISOString(),
      inboxTaskId: flow.inboxTaskId || null,
      managerInboxRuntimeStarted: true,
      managerInboxRuntime: flow.managerInboxRuntime || null,
      managerAcquisitionStartFailed: true,
      partialStart: "inbox_running_acquisition_failed"
    });
    updateWork(flow.agentId || agent.id, {
      phase: "私信承接已启动，等待完整获客重试",
      metadata: {
        progressSource: "none",
        taskState: "error",
        partialStart: "inbox_running_acquisition_failed",
        inboxTaskId: flow.inboxTaskId || null,
        taskKey: flow.taskKey || null
      }
    });
    pushActivity(flow.agentId || agent.id, "私信承接已经开始运行；完整获客任务尚未启动成功。承接不会停止，继续启动完整获客即可。 ");
    render();
  }

  async function retryCompleteAcquisitionAfterInbox(agent, flow) {
    if (!flow?.managerInboxRuntimeStarted || flow.requesting) return;
    flow.error = null;
    flow.setupError = null;
    flow.statusReadError = null;
    flow.step = "running";
    render();
    try {
      if (flow.taskKey && String(flow.taskState || "").toLowerCase() === "error") {
        await controlCommentAcquisitionTask(flow, "retry");
      } else {
        await startCommentAcquisition(agent, flow);
      }
      if (["running", "degraded"].includes(String(flow.taskState || "").toLowerCase())) {
        flow.managerAcquisitionStartFailed = false;
        persistCloudTask(flow, {
          phase: "running",
          managerInboxRuntimeStarted: true,
          managerInboxRuntime: flow.managerInboxRuntime || null,
          inboxTaskId: flow.inboxTaskId || null,
          managerAcquisitionStartFailed: false,
          partialStart: null
        });
        return;
      }
      markManagerAcquisitionStartFailed(agent, flow, flow.error || {
        code: "ACQUISITION_TASK_START_FAILED",
        message: "完整获客任务尚未恢复"
      });
    } catch (error) {
      markManagerAcquisitionStartFailed(agent, flow, error);
    }
  }

  async function startInboxIntake(agent, flow, { takeover = false } = {}) {
    if (!flow || flow.running || flow.starting || flow.planLoading) return;
    let authorizedAccount = null;
    flow.starting = true;
    flow.step = "setup";
    flow.setupError = null;
    flow.planError = null;
    flow.startError = null;
    flow.error = null;
    render();
    if (flow.managerCombinedStart) {
      try {
        authorizedAccount = await verifyAcquisitionAuthorization(agent.id);
        flow.accountId = authorizedAccount?.id || flow.accountId;
        flow.account = authorizedAccount?.name || flow.account;
        flow.accountIdentity = authorizedAccount?.identity || flow.accountIdentity;
        flow.accountWorkKey = douyinAccountWorkKey(flow.accountIdentity, flow.accountId);
        flow.accountRef = authorizedAccount?.identity?.profileUrl || authorizedAccount?.identity?.uniqueId || flow.accountRef || "";
      } catch (error) {
        flow.starting = false;
        flow.setupError = error?.message || "请先完成抖音账号登录，确认登录后才能启动获客任务";
        flow.authErrorCode = error?.code || "DOUYIN_LOGIN_REQUIRED";
        flow.step = "setup";
        render();
        return;
      }
      const managerSetupError = validateCommentAcquisitionSetup(flow);
      if (managerSetupError) {
        flow.starting = false;
        flow.setupError = managerSetupError;
        flow.step = "setup";
        render();
        return;
      }
      flow.setupError = null;
    }
    if (!flow.planToken || !flow.planConfirmable || !flow.inboxPlan) {
      const prepared = await generateInboxPlan(agent, flow);
      if (!prepared) {
        flow.starting = false;
        flow.step = "setup";
        render();
        return;
      }
    }
    saveInboxStrategy(flow);
    flow.starting = true;
    flow.step = "setup";
    flow.startError = null;
    flow.error = null;
    flow.startRequestId ||= newTaskId("inbox-start");
    render();

    try {
      const result = await executeCoreAgent({
        agentId: flow.agentId || agent.id,
        operation: "inbox_hosting",
        accountUseScope: flow.managerCombinedStart ? `${flow.agentId || agent.id}:inbox` : (flow.agentId || agent.id),
        taskId: flow.inboxTaskId || (isInboxAgent(agent) ? flow.taskId || null : null),
        taskRunId: flow.inboxTaskRunId || (isInboxAgent(agent) ? flow.taskRunId || null : null),
        conversationId: flow.inboxConversationId || null,
        accountId: flow.accountId || null,
        accountKey: flow.accountWorkKey || douyinAccountWorkKey(flow.accountIdentity, flow.accountId) || flow.accountId || null,
        accountName: flow.account || "",
        accountIdentity: flow.accountIdentity || null,
        goal: flow.agentId === GOLD_CUSTOMER_SERVICE_AGENT_ID || flow.agentId === DOUYIN_ACQUISITION_COMPLETE_AGENT_ID
          ? flow.replyObjective || "按目标承接抖音新私信"
          : "持续承接抖音新私信并按已确认策略回复",
        takeover: takeover === true,
        idempotencyKey: flow.startRequestId,
        config: {
          ...inboxConfiguration(flow),
          planToken: flow.planToken,
          startRequestId: flow.startRequestId,
          startPolling: true
        }
      }, 300000);
      const stateName = inboxStartState(result);
      if (!["accepted", "running"].includes(stateName)) {
        throw Object.assign(new Error("核心执行端尚未正式接收私信承接任务。"), {
          code: "DOUYIN_INBOX_START_NOT_ACCEPTED",
          details: result
        });
      }
      markInboxStartAccepted(agent, flow, result);
      await startCompleteAcquisitionAfterInbox(agent, flow, authorizedAccount);
    } catch (error) {
      flow.starting = false;
      const stalePlan = ["DOUYIN_INBOX_PLAN_STALE", "DOUYIN_INBOX_PLAN_ACCOUNT_MISMATCH", "DOUYIN_INBOX_PLAN_EXPIRED", "DOUYIN_INBOX_PLAN_TOKEN_INVALID", "DOUYIN_INBOX_PLAN_NOT_CONFIRMABLE", "DOUYIN_INBOX_PLAN_AGENT_MISMATCH"].includes(error?.code);
      if (stalePlan) {
        invalidateInboxPlan(flow);
        flow.planError = error?.message || "回复设置有变化，请重新启动。";
        flow.step = "setup";
      } else {
        if (handleAccountBusyStartError(agent, flow, error)) return;
        if (error?.code === "INBOX_RUNTIME_OWNER_ACTIVE" && error?.details?.canTakeover === true) {
          flow.inboxTakeoverOwnerAgentId = error.details.ownerAgentId || "";
          const owner = getMarketplaceAgent(flow.inboxTakeoverOwnerAgentId);
          const ownerName = owner ? displayAgentName(owner) : "另一个 Agent";
          flow.startError = `这个账号当前正在由${ownerName}承接。确认切换后，原承接任务会停止。`;
        } else {
          flow.startError = error?.message || "后端暂时未接收私信承接任务，请稍后重试。";
        }
        flow.step = "setup";
      }
      render();
    }
  }

  function normalizeInboxRuntimeError(value) {
    if (!value) return null;
    if (typeof value === "string") return { code: "DOUYIN_INBOX_RUNTIME_ERROR", message: value };
    return {
      ...value,
      code: value.code || "DOUYIN_INBOX_RUNTIME_ERROR",
      message: value.message || String(value)
    };
  }

  function inboxMessageSnapshot(message = {}) {
    return {
      messageId: message.messageId || message.message_id || message.id || message.msgId || "",
      conversationId: message.conversationId || message.conversation_id || "",
      nickname: message.nickname || message.nick_name || message.sender?.nickname || message.sender?.nick_name || "",
      secUid: message.secUid || message.sec_uid || message.sender?.secUid || message.sender?.sec_uid || "",
      secId: message.secId || message.sec_id || message.sender?.secId || message.sender?.sec_id || "",
      content: message.content || message.text || "",
      replyContent: message.replyContent || message.reply_content || "",
      handoffReason: message.handoffReason || message.handoff_reason || "",
      conversationMode: message.conversationMode || message.conversation_mode || "",
      conversationHistory: Array.isArray(message.conversationHistory)
        ? message.conversationHistory.slice(-50)
        : Array.isArray(message.conversation_history) ? message.conversation_history.slice(-50) : [],
      handoffAt: message.handoffAt || message.handoff_at || "",
      humanLastSentAt: message.humanLastSentAt || message.human_last_sent_at || "",
      status: message.status || "received",
      createdAt: message.createdAt || message.created_at || "",
      receivedAt: message.receivedAt || message.received_at || ""
    };
  }

  function applyInboxStatus(flow, result) {
    const runtime = result?.runtime || result?.status?.runtime || null;
    const runtimeError = normalizeInboxRuntimeError(runtime?.lastError);
    const runtimeHealthy = Boolean(runtime?.running);
    const eventStream = Array.isArray(result?.events) ? result.events : [];
    const previousMessages = flow.inboxHydrated ? new Set((Array.isArray(flow.messages) ? flow.messages : []).map((item) => item?.messageId || item?.id || item?.msgId).filter(Boolean)) : new Set();
    flow.runtime = runtime;
    if (runtime) {
      if (runtimeError && runtimeHealthy) {
        flow.error = null;
        flow.statusSyncWarning = `最近一次私信轮询暂时失败：${runtimeError.message}。承接任务仍在运行，系统会自动重试。`;
      } else {
        flow.error = runtimeError;
        if (!runtimeError && String(flow.statusSyncWarning || "").startsWith("最近一次私信轮询暂时失败")) {
          flow.statusSyncWarning = "";
        }
      }
    }
    if (result?.accountId || runtime?.accountId) flow.accountId = result?.accountId || runtime.accountId;
    if (result?.accountName || runtime?.accountName) flow.account = result?.accountName || runtime.accountName;
    const focusTargets = Array.isArray(flow.focusTargets) ? flow.focusTargets : [];
    flow.messages = (Array.isArray(result?.messages) ? result.messages : []).map((message) => {
      const secUid = message?.secUid || message?.sec_uid || message?.sender?.secUid || message?.sender?.sec_uid;
      const secId = message?.secId || message?.sec_id || message?.sender?.secId || message?.sender?.sec_id;
      const nickname = message?.nickname || message?.nick_name || message?.sender?.nickname || message?.sender?.nick_name;
      const target = focusTargets.find((item) => (secUid && [item.secUid, item.secId].includes(secUid)) || (secId && [item.secId, item.secUid].includes(secId)) || (nickname && item.nickname === nickname));
      return target ? { ...message, recordId: message.recordId || target.recordId, sourceRecordId: message.sourceRecordId || target.recordId } : message;
    });
    if (flow.inboxHydrated) {
      const incoming = flow.messages.filter((item) => {
        const id = item?.messageId || item?.id || item?.msgId;
        return id && !previousMessages.has(id);
      });
      if (incoming.length && !eventStream.length) {
        pushActivity(flow.agentId || "mkt-dm-inbox", `收到${incoming.length} 条新私信，正在按承接规则处理。`);
      }
    }
    if (eventStream.length) {
      const saved = readCloudTask(flow) || douyinCloudTaskStore.get(flow.agentId || "mkt-dm-inbox");
      const keys = new Set([...(Array.isArray(saved?.inboxActivityKeys) ? saved.inboxActivityKeys : []), ...(Array.isArray(flow.inboxActivityKeys) ? flow.inboxActivityKeys : [])]);
      for (const event of eventStream) {
        const key = [event?.type || "unknown", event?.messageId || event?.message_id || "", event?.at || event?.createdAt || "", event?.error?.code || ""].join("|");
        if (key !== "unknown|||") keys.add(key);
      }
      flow.inboxActivityKeys = [...keys].slice(-200);
    }
    flow.inboxHydrated = true;
    if (runtimeError && !runtimeHealthy) {
      flow.error = runtimeError;
      const message = runtimeError.message;
      if (message && flow.lastReportedInboxError !== message) {
        flow.lastReportedInboxError = message;
        reportWorkError(flow.agentId || "mkt-dm-inbox", `私信承接出现异常：${message}`);
      }
    } else if (!runtimeError) {
      flow.lastReportedInboxError = null;
    }
    if (runtime?.running != null) flow.running = Boolean(runtime.running);
    if (runtime) {
      const pollCount = Number(runtime.pollCount || 0);
      const handledCount = Number(runtime.sentCount || 0) + Number(runtime.handoffCount || 0);
      flow.checks = [
        Boolean(runtime.running),
        Boolean(runtime.polling) || pollCount > 0,
        pollCount > 0,
        handledCount > 0
      ];
      updateWork(flow.agentId || "mkt-dm-inbox", {
        phase: runtime.running
          ? runtimeError ? "持续监听新私信（最近一次轮询重试中）" : "持续监听新私信"
          : runtimeError ? "私信承接异常停止" : "承接已停止",
        metadata: {
          progressSource: "none",
          inboxMessages: (Array.isArray(flow.messages) ? flow.messages : []).slice(-50).map(inboxMessageSnapshot),
          runtime: {
            running: Boolean(runtime.running),
            polling: Boolean(runtime.polling),
            pollCount: Number(runtime.pollCount || 0),
            receivedCount: Number(runtime.receivedCount || 0),
            handoffCount: Number(runtime.handoffCount || 0),
            sentCount: Number(runtime.sentCount || 0)
          }
        }
      });
    }
    recordInboxResult(flow);
  }

  function pollInboxStatus(agent, flow) {
    if (flow.polling) return;
    flow.polling = true;
    const poll = async () => {
      // Inbox intake is a long-lived backend task. Navigating away from the
      // setup page must not cancel its status stream; only the task lifecycle
      // itself can stop this poller.
      if (!flow.running || !flow.polling) { flow.polling = false; return; }
      const canRender = !disposed && state.view === "use" && state.useFlow === flow;
      try {
        const result = await douyinMcpCall("GET", `/v1/douyin/inbox-agent/status?agentId=${encodeURIComponent(authorizationAgentId(flow))}`, null, 15000);
        applyInboxStatus(flow, result);
        flow.inboxStatusFailures = 0;
        flow.statusSyncWarning = "";
        if (result?.runtime?.running) flow.startAcceptedState = "running";
        if (canRender) render();
      } catch (error) {
        flow.inboxStatusFailures = Number(flow.inboxStatusFailures || 0) + 1;
        flow.statusSyncWarning = `状态同步暂时中断，正在自动重试（第 ${flow.inboxStatusFailures} 次）。承接任务不会因为一次状态读取超时而停止。`;
        if (canRender) render();
      }
      if (flow.running && flow.polling) globalThis.setTimeout(poll, 3000);
      else flow.polling = false;
    };
    globalThis.setTimeout(poll, 1200);
  }

  async function stopInboxAgent(flow, button) {
    if (button.disabled) return;
    button.disabled = true;
    try {
      await douyinMcpCall("POST", "/v1/douyin/inbox-agent/stop", { agentId: authorizationAgentId(flow), confirm: "STOP" }, 30000);
      flow.running = false;
      flow.polling = false;
      pushActivity(flow.agentId || "mkt-dm-inbox", "私信承接已停止，当前会话和处理记录已经保留。");
      finishWork(flow.agentId || "mkt-dm-inbox", "私信承接记录");
      recordInboxResult(flow, { status: "completed", force: true });
      persistCloudTask(flow, { phase: "authorized", inboxStoppedAt: new Date().toISOString() });
      render();
    } catch (error) {
      button.disabled = false;
      flow.error = { code: error?.code || "DOUYIN_INBOX_STOP_FAILED", message: error?.message || "停止承接失败" };
      reportWorkError(flow.agentId || "mkt-dm-inbox", `停止私信承接失败：${flow.error.message}`);
      recordInboxResult(flow, { status: "failed", force: true });
      render();
    }
  }

  function newTaskId(prefix) {
    const uuid = globalThis.crypto?.randomUUID?.();
    return `${prefix}-${uuid || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
  }

  function applyLeadMinerResult(agent, flow, result) {
    const collectionOnly = isCompositeFinderAgent(agent);
    flow.status = result.status || "SUCCEEDED";
    flow.resultSnapshot = result.resultSnapshot || null;
    if (flow.resultSnapshot && (Array.isArray(flow.resultSnapshot.leads) || isCommentFilterAgent(agent))) {
      const identity = presentationOf(agent);
      prospectStore.ingestRun({
        resultSnapshot: flow.resultSnapshot,
        taskId: flow.taskId,
        agentId: agent.id,
        agentName: identity.name,
        sourceContext: {
          accountId: flow.analysisOnly ? "" : flow.accountId || flow.account?.secId || flow.account?.sec_id || flow.account?.id || "",
          source: flow.analysisOnly ? "公开账号作品评论" : flow.source || "我的账号作品评论",
          sourceScope: flow.sourceScope || flow.resultSnapshot?.inputs?.sourceScope || flow.resultSnapshot?.sourceScope || "",
          window: flow.window,
          accountUrl: flow.accountRef || flow.account,
          query: flow.goal || flow.product
        }
      });
    }
    const resultStatus = String(flow.status || "").toUpperCase();
    flow.progress = resultStatus === "SUCCEEDED"
      ? 100
      : resultStatus === "FAILED"
        ? 0
        : Number.isFinite(Number(flow.progress))
          ? Math.max(0, Math.min(100, Number(flow.progress)))
          : 0;
    flow.checks = resultStatus === "SUCCEEDED" ? [true, true, true, true] : [true, true, false, false];
    updateWork(agent.id, {
      progress: flow.progress,
      phase: resultStatus === "SUCCEEDED" ? "整理结果与交付" : resultStatus === "FAILED" ? "执行失败" : "等待采集服务回传",
      metadata: { status: flow.status, counts: flow.resultSnapshot?.counts || null }
    });
    flow.liveFindings = (flow.resultSnapshot?.leads || []).slice(0, 5).map((lead) => ({
      text: lead.text || lead.nickname || "已识别潜客",
      score: collectionOnly ? null : lead.score ?? 0,
      tier: collectionOnly ? "待判断" : lead.tier === "high" ? "高意向" : lead.tier === "medium" ? "中意向" : "低意向"
    }));
    if (flow.progress >= 100 && !flow.resultRecorded) {
      flow.resultRecorded = true;
      finishWork(agent.id, collectionOnly ? "用户发现结果" : isCommentFilterAgent(agent) ? "评论筛选结果" : "潜客意向表单");
      flow.result = isCommentFilterAgent(agent)
        ? { total: flow.resultSnapshot?.counts?.matched || 0, matched: flow.resultSnapshot?.counts?.matched || 0 }
        : collectionOnly
          ? { total: flow.resultSnapshot?.counts?.candidates || 0, pendingAnalysis: flow.resultSnapshot?.counts?.pendingAnalysis || flow.resultSnapshot?.counts?.candidates || 0 }
        : {
          total: flow.resultSnapshot?.counts?.candidates || 0,
          high: (flow.resultSnapshot?.leads || []).filter((lead) => lead.tier === "high").length,
          medium: (flow.resultSnapshot?.leads || []).filter((lead) => lead.tier === "medium").length,
          low: (flow.resultSnapshot?.leads || []).filter((lead) => lead.tier === "low").length
        };
    }
  }

  function pollLeadMinerResult(agent, flow) {
    if (flow.polling || !flow.taskId) return;
    flow.polling = true;
    const startedAt = Date.now();
    const baseUrl = globalThis.__SALEBUDDY_CONFIG__?.controlPlaneUrl
      || document.querySelector('meta[name="salebuddy-control-plane"]')?.content
      || "http://127.0.0.1:6681";
    const poll = async () => {
      if (!flow.taskId) { flow.polling = false; return; }
      try {
        const response = await fetch(`${String(baseUrl).replace(/\/$/, "")}/v1/connectors/prospect/runs/${encodeURIComponent(flow.taskId)}`, {
          headers: { accept: "application/json" }
        });
        const result = await response.json().catch(() => null);
        if (response.ok && result?.status && result.status !== "PENDING") {
          flow.polling = false;
          applyLeadMinerResult(agent, flow, result);
      pushActivity(agent.id, isCommentFilterAgent(agent) ? "真实评论筛选完成，匹配评论证据已回传到成果中心。" : "真实评论筛选完成，结果已回传并归档到成果中心。");
          if (!disposed) render();
          return;
        }
      } catch {
        // Keep polling while the asynchronous Spider callback is in flight.
      }
      if (Date.now() - startedAt > 15 * 60 * 1000) {
        flow.polling = false;
        flow.status = "FAILED";
        flow.error = { code: "PROSPECT_CALLBACK_TIMEOUT", message: "采集服务超过 15 分钟未回传结果，请稍后重试。" };
        reportWorkError(agent.id, `作品评论筛选未完成：${flow.error.message}`);
        if (!disposed) render();
        return;
      }
      globalThis.setTimeout(poll, 4000);
    };
    globalThis.setTimeout(poll, 4000);
  }

  function daysForWindow(value) {
    return value === "近24小时" ? 1 : value === "近30天" ? 30 : 7;
  }

  function daysForRequirements(flow) {
    const text = String(flow.requirements || "");
    const match = text.match(/近\s*(\d+)\s*天|最近\s*(\d+)\s*天/);
    if (!match) return daysForWindow(flow.window);
    return Math.min(3650, Math.max(1, Number(match[1] || match[2])));
  }

  function effectiveWindowLabel(flow) {
    const days = daysForRequirements(flow);
    return days === 1 ? "近24小时" : `近${days}天`;
  }

  async function startRealLeadMiner(agent, flow) {
    if (flow.requesting) return;
    if (isFinderListenerFlow(agent, flow)) {
      flow.step = "setup";
      flow.setupError = "找客专员的授权账号任务只持续监听新信号，不支持历史回看。";
      render();
      return;
    }
    const requireOwnAccount = isCompositeFinderAgent(agent);
    const validation = validateLeadMinerSetup(flow, { requireOwnAccount });
    if (validation) { flow.setupError = validation; flow.step = "setup"; render(); return; }
    if (requireOwnAccount) {
      flow.requesting = true;
      let account;
      try {
        account = await verifyAcquisitionAuthorization(authorizationAgentId(flow));
      } catch (error) {
        flow.requesting = false;
        flow.step = "setup";
        flow.setupError = error?.message || "请先完成抖音账号登录，确认登录后才能启动找客户任务";
        flow.authErrorCode = error?.code || "DOUYIN_LOGIN_REQUIRED";
        render();
        return;
      }
      flow.accountId = account.id || flow.accountId;
      flow.account = account.name || flow.account;
      flow.accountIdentity = account.identity || flow.accountIdentity;
      if (flow.commentSourceDimension !== "works") {
        flow.accountRef = account.identity?.profileUrl || account.identity?.uniqueId || flow.accountRef || "";
      }
    }
    const sourceInput = commentSourcePayload(flow, { requireOwnAccount });
    flow.sourceScope = sourceInput.sourceScope;
    flow.sourceOwner = sourceInput.sourceOwner;
    flow.sourceDimension = sourceInput.sourceDimension;
    flow.analysisOnly = sourceInput.analysisOnly === true;
    const selectedWorkCount = Array.isArray(sourceInput.videoIds) ? sourceInput.videoIds.length : 0;
    const specificWorks = sourceInput.sourceDimension === "works";
    flow.step = "running";
    flow.requesting = true;
    flow.progress = 0;
    flow.status = "RUNNING";
    flow.checks = [true, false, false, false];
    flow.error = null;
    flow.taskId ||= newTaskId("lead-miner");
    flow.taskRunId ||= newTaskId("run");
    const accountLabel = specificWorks
      ? `${selectedWorkCount}条指定作品`
      : flow.account || flow.accountRef || (sourceInput.sourceOwner === "own" ? "我的抖音账号" : "公开抖音账号");
    const filterMode = isCommentFilterAgent(agent);
    const collectionOnly = isCompositeFinderAgent(agent);
    const audienceLabel = flow.audienceTypes.join("、");
    const productLabel = flow.product.trim();
    const targetLabel = audienceLabel && productLabel
      ? `${audienceLabel}的${productLabel}`
      : audienceLabel || productLabel || "目标人群";
    const userRequirements = String(flow.requirements || "").trim();
    const taskGoal = filterMode
      ? `从${accountLabel}的作品评论中筛选${productLabel || "符合条件"}的评论`
      : collectionOnly
        ? `从${accountLabel}的作品评论中收集${targetLabel}用户`
        : `从${accountLabel}的作品评论中筛选${targetLabel}潜客`;
    const combinedGoal = userRequirements ? `${taskGoal}。用户补充要求：${userRequirements}` : taskGoal;
    const requestLimits = leadMinerRequestLimits(flow.workScope, flow.workCount);
    beginWork(agent.id, { task: `${filterMode ? "筛选" : collectionOnly ? "收集" : "分析"}${accountLabel}的${targetLabel}`, phase: "连接公开采集服务", progress: flow.progress, projectId: null, metadata: { accountLabel, profileUrl: sourceInput.profileUrl || null, videoUrls: sourceInput.videoUrls || [], mode: filterMode ? "filter" : collectionOnly ? "collect" : "intent", taskId: flow.taskId, sourceScope: sourceInput.sourceScope, sourceOwner: sourceInput.sourceOwner, sourceDimension: sourceInput.sourceDimension, analysisOnly: sourceInput.analysisOnly } });
    pushActivity(agent.id, collectionOnly ? `已提交${accountLabel}的用户发现任务，等待真实采集结果。` : `已提交${accountLabel}的作品评论筛选任务，等待真实采集结果。`);
    render();
    void globalThis.__SALEBUDDY__?.navFrameworkReady?.then?.((framework) => framework?.openRealtimeWork?.({ selectedAgentId: agent.id }));
    try {
      const payload = {
        taskId: flow.taskId,
        taskRunId: flow.taskRunId,
        conversationId: `agent-square-${flow.taskId}`,
        agentId: agent.id,
        skillId: "lead_discovery",
        goal: combinedGoal,
        analysisMode: filterMode ? "filter" : collectionOnly ? "collect" : "intent",
        lookbackDays: daysForRequirements(flow),
        limit: requestLimits.commentLimit,
        commentLimit: requestLimits.commentLimit,
        minScore: filterMode || collectionOnly ? 0 : flow.threshold === "仅高意向" ? 80 : flow.threshold === "全部候选" ? 0 : 60,
        keywords: [...new Set([...flow.audienceTypes, ...(productLabel ? [productLabel] : [])])],
        includeReplies: flow.includeReplies,
        exclusionRules: userRequirements || flow.rules,
        userRequirements: userRequirements || undefined,
        ...sourceInput
      };
      const baseUrl = globalThis.__SALEBUDDY_CONFIG__?.controlPlaneUrl
        || document.querySelector('meta[name="salebuddy-control-plane"]')?.content
        || "http://127.0.0.1:6681";
      const response = await fetch(`${String(baseUrl).replace(/\/$/, "")}/v1/connectors/prospect/discover`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || result?.accepted === false) {
        const error = result?.error || {};
        const failure = new Error(error.message || `采集服务返回 HTTP ${response.status}`);
        failure.code = error.code || "PROSPECT_REQUEST_FAILED";
        throw failure;
      }
      flow.requesting = false;
      applyLeadMinerResult(agent, flow, result);
      if (flow.status === "PENDING") pollLeadMinerResult(agent, flow);
      pushActivity(agent.id, flow.progress >= 100
        ? (collectionOnly ? "用户发现完成，原始证据已写入成果中心。" : "真实评论筛选完成，结果已写入成果中心。")
        : "真实采集任务已提交，等待 Spider 回传。 ");
      render();
    } catch (error) {
      flow.requesting = false;
      flow.status = "FAILED";
      flow.progress = 0;
      flow.error = { code: error.code || "PROSPECT_REQUEST_FAILED", message: error.message || "真实采集服务暂时不可用" };
      updateWork(agent.id, { progress: 0, phase: "执行失败", metadata: { status: flow.status, error: flow.error.message } });
      reportWorkError(agent.id, `作品评论筛选未完成：${flow.error.message}`);
      render();
    }
  }

  function buildCard(agent) {
    const { placeholder = false } = arguments[1] || {};
    const { name, title } = presentationOf(agent);
    const category = displayedCategory(agent);
    const [accent, accentSoft, accentBorder] = marketplaceCardAccent(agent, category);
    const enabled = isFirstReleaseAgent(agent);
    const acquisitionGate = getAcquisitionCardViewModel(agent);
    return buildStandardCard({
      id: agent.id,
      name,
      title,
      avatarValue: agent.id,
      // Agent Center is the identity catalog. Live work states belong to Members.
      avatarState: "idle",
      accent: [accent, accentSoft, accentBorder],
      employmentStatus: isAgentReadyForUse(agent) ? "已雇佣" : "未雇佣",
      description: agent.desc,
      tags: agent.skills,
      actionButton: placeholder ? buildUnavailableButton() : buildHireButton(agent),
      disabledReason: placeholder ? "即将开放" : enabled ? acquisitionGate?.label : "当前版本仅开放获客专家及四个独立能力 Agent",
      disabled: placeholder || !enabled
    });
  }

  // ── 首页视图 ──
  function renderHome() {
    setPageHeaderVisible(false);
    page.setTitle("Agent市场");
    page.showBack(false);

    if (state.employmentError) {
      const error = el("div", "sb-as-employment-error", state.employmentError);
      error.setAttribute("role", "alert");
      root.appendChild(error);
    }

    const toolbar = el("div", "sb-as-toolbar");
    const cta = el("div", "sb-as-cta");
    cta.append(
      el("strong", null, "找到能直接帮你做事的 Agent"),
      el("span", null, "这些 Agent 覆盖找客户、分析账号、首次触达和私信接待，选一个就能开始")
    );
    toolbar.appendChild(cta);

    const mainFilterRow = el("div", "sb-as-filter-row sb-as-filter-main");
    const stageChips = el("div", "sb-as-chips");
    const stageEntries = [];
    const sectionByCategory = new Map();
    let activeFilter = state.categoryNav || "全部";
    for (const stage of AGENT_SQUARE_FILTER_ORDER) {
      const chip = el("button", "sb-as-chip");
      chip.type = "button";
      const iconConfig = AGENT_STAGE_ICONS[stage];
      if (iconConfig) {
        const icon = createFilledStageIcon(iconConfig.filledIcon, iconConfig.color);
        icon.classList.add("sb-as-chip-icon");
        chip.appendChild(icon);
      }
      chip.appendChild(el("span", "sb-as-chip-label", stage));
      chip.addEventListener("click", () => {
        state.categoryNav = stage;
        activeFilter = stage;
        updateFilterControls();
        const target = sectionByCategory.get(stage);
        target?.scrollIntoView?.({ behavior: "smooth", block: "start" });
      });
      stageEntries.push({ chip, value: stage });
      stageChips.appendChild(chip);
    }
    mainFilterRow.appendChild(stageChips);
    toolbar.appendChild(mainFilterRow);
    root.appendChild(toolbar);

    const sections = el("div", "sb-as-category-list");
    root.appendChild(sections);

    const allAgentsGrid = el("div", "sb-as-category-grid");
    const categoryRows = new Map(AGENT_WORKFLOW_DISPLAY_ORDER.map((category) => [
      category,
      el("div", "sb-as-category-grid")
    ]));
    renderTeamSection(sections, {
      includeReady: true,
      includeUnavailable: false,
      showTitle: false,
      targetRow: allAgentsGrid
    });
    renderTeamSection(sections, {
      includeReady: true,
      includeUnavailable: false,
      showTitle: false,
      targetRows: categoryRows
    });

    const hiddenIds = new Set([
      ...DEFAULT_INSTALLED_MARKETPLACE_IDS,
      ...listHiredAgents().map((agent) => agent.id)
    ]);
    const agentsByCategory = new Map(AGENT_WORKFLOW_DISPLAY_ORDER.map((category) => [category, []]));
    const availableAgents = MARKETPLACE_AGENTS
      .filter((agent) => !hiddenIds.has(agent.id))
      .filter(isFirstReleaseAgent)
      .sort((left, right) => {
        const leftCategory = workflowCategory(left) ? AGENT_WORKFLOW_DISPLAY_ORDER.indexOf(workflowCategory(left)) : -1;
        const rightCategory = workflowCategory(right) ? AGENT_WORKFLOW_DISPLAY_ORDER.indexOf(workflowCategory(right)) : -1;
        return leftCategory - rightCategory;
      });
    const placeholderAgents = AGENT_SQUARE_PLACEHOLDER_AGENTS.filter((agent) => !hiddenIds.has(agent.id));
    for (const agent of [...availableAgents, ...placeholderAgents]) {
      const category = workflowCategory(agent);
      const isPlaceholder = AGENT_SQUARE_PLACEHOLDER_AGENTS.some((item) => item.id === agent.id);
      const allCard = markMarketplaceCard(buildCard(agent, { placeholder: isPlaceholder }), agent);
      allAgentsGrid.appendChild(allCard);
      if (category && agentsByCategory.has(category)) agentsByCategory.get(category).push(agent);
    }
      removeDeveloperModeCards(allAgentsGrid);

    for (const category of AGENT_WORKFLOW_DISPLAY_ORDER) {
      const agents = sortMarketplaceAgentsForDisplay(agentsByCategory.get(category), { isReady: isFirstReleaseAgent });
      if (!agents.length) continue;
      for (const agent of agents) {
        const isPlaceholder = AGENT_SQUARE_PLACEHOLDER_AGENTS.some((item) => item.id === agent.id);
        categoryRows.get(category)?.appendChild(markMarketplaceCard(buildCard(agent, { placeholder: isPlaceholder }), agent));
      }
    }

    const allSection = buildCategorySection("全部", allAgentsGrid);
    allSection.id = "sb-as-category-all";
    sectionByCategory.set("全部", allSection);
    sections.appendChild(allSection);

    for (const category of AGENT_WORKFLOW_DISPLAY_ORDER) {
      const grid = categoryRows.get(category);
      if (!grid?.children.length) continue;
      const section = buildCategorySection(category, grid);
      section.id = `sb-as-category-${AGENT_WORKFLOW_DISPLAY_ORDER.indexOf(category) + 1}`;
      sectionByCategory.set(category, section);
      sections.appendChild(section);
    }

    updateFilterControls();

    function markMarketplaceCard(card, agent) {
      card.dataset.sbMarketCard = "true";
      card.dataset.sbAgentCard = "true";
      card.dataset.sbAgentId = agent.id;
      return card;
    }

    function removeDeveloperModeCards(row) {
      const developerModeCards = [...row.children].filter((card) => DEVELOPER_MODE_AGENT_IDS.has(card.dataset.sbAgentId));
      for (const card of developerModeCards) row.removeChild(card);
    }

    function buildCategorySection(category, grid) {
      const section = el("section", `sb-as-category-section${category === "全部" ? " is-all" : ""}`);
      if (category === "全部") {
        section.appendChild(grid);
        return section;
      }
      const head = el("div", "sb-as-category-head");
      const iconConfig = AGENT_STAGE_ICONS[category];
      if (iconConfig) {
        head.appendChild(createFilledStageIcon(iconConfig.filledIcon, iconConfig.color));
      } else {
        const marker = el("span", "sb-as-category-icon sb-as-category-mark", "✦");
        head.appendChild(marker);
      }
      const copy = el("div", "sb-as-category-copy");
      const title = el("div", "sb-as-category-title");
      title.append(el("span", null, category === "全部" ? "全部 Agent" : category), el("span", "sb-as-category-count", `${grid.children.length} 位`));
      copy.appendChild(title);
      head.appendChild(copy);
      section.append(head, grid);
      return section;
    }

    function updateFilterControls() {
      const total = allAgentsGrid.children.length;
      for (const { chip, value } of stageEntries) {
        const count = value === "全部"
          ? total
          : categoryRows.get(value)?.children.length || 0;
        chip.classList.toggle("sb-on", activeFilter === value);
        chip.dataset.count = String(count);
        chip.setAttribute("aria-label", `${value}，${count} 位目录成员`);
        chip.title = `${value} · ${count} 位目录成员`;
        const section = sectionByCategory.get(value);
        if (section?.id) chip.setAttribute("aria-controls", section.id);
      }
    }
  }

  function render() {
    if (disposed) return;
    root.textContent = "";
    if (state.view === "use") renderUse();
    else renderHome();
  }

  const initialAgent = initialAgentId ? getMarketplaceAgent(initialAgentId) : null;
  if (embedded) root.appendChild(el("div", "sb-as-embedded-loading", "正在打开潜客触达专员…"));
  else render();
  void refreshEmploymentContracts()
    .then(() => {
      employmentContractsLoaded = true;
      if (disposed) return;
      if (initialAgent && isFirstReleaseAgent(initialAgent)) {
        openUseFlow(initialAgent, resumeFlow);
        return;
      }
      if (state.view === "home") render();
    })
    .catch(() => {
      // Preserve the current projection while the control plane reconnects.
      employmentContractsLoaded = true;
      if (!disposed && state.view === "home") render();
    });

  // 团队成员状态变化时刷新「我的团队」（仅首页视图）
  const unsubscribe = teamLive?.subscribe?.(() => {
    if (state.view === "home") render();
  }) || (() => {});
  const unsubscribeLiveWork = subscribeWork(() => {
    if (state.view === "home") render();
  });
  void refreshRemoteOfficeStatus();
  remoteOfficeTimer = globalThis.setInterval?.(() => { void refreshRemoteOfficeStatus(); }, 3000) || null;

  const origClose = page.close;
  page.setGateway = (nextGateway) => {
    if (disposed) return;
    gateway = nextGateway || null;
    render();
  };
  page.close = () => {
    const activeFlow = state.useFlow;
    if (!embedded && !disposed && isCloudAuthorizationPending(activeFlow)) {
      const detachedFlow = cloudResumeFlow(activeFlow);
      void recordCloudExit(activeFlow);
      closeAuthWindow(activeFlow);
      clearAuthFeedback(activeFlow);
      state.useFlow = null;
      state.view = "home";
      closeCloudExitPrompt();
      openCloudExitPrompt(detachedFlow, { detached: true });
    }
    disposed = true;
    unsubscribe();
    unsubscribeLiveWork();
    if (remoteOfficeTimer != null) globalThis.clearInterval(remoteOfficeTimer);
    useTimers.forEach((timer) => window.clearTimeout(timer));
    outreachOverlay?.remove();
    outreachOverlay = null;
    origClose();
  };
  return page;
}
