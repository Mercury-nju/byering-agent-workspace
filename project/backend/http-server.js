import { createServer } from "node:http";
import { createCompanionService } from "./agent-companion.js";
import { companionTaskFacts } from "../src/salebuddy/runtime/assignment-handoff.js";
import { applyCompanionExecution } from "./companion-execution.js";
import { buildOfficeStatus, createOfficeOperations, officeReceiptState, OFFICE_AGENT_IDS } from "./office-status.js";
import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ControlPlaneError, createControlPlane } from "./control-plane.js";
import { createControlPlaneAuth } from "./auth.js";
import { createBrowserWorkspaceService } from "./browser-workspace.js";
import { createRequirementUnderstandingService } from "./requirement-understanding.js";
import { createClueHunterService } from "./cluehunter-service.js";
import { createProspectService } from "./prospect-service.js";
import { createProspectIntentAnalysisService } from "./prospect-intent-analysis-service.js";
import { createAccountResolver } from "./account-resolver.js";
import { createClueHunterCloudService } from "./cluehunter-cloud.js";
import { createDouyinMcpService, DEFAULT_PRIVATE_OUTREACH_ACTION_TYPE, normalizePrivateMessageResult } from "./douyin-mcp.js";
import { createDouyinInboxAgentService } from "./douyin-inbox-agent-service.js";
import { createDouyinAgentCloudRegistry } from "./douyin-agent-cloud-registry.js";
import { createDouyinAcquisitionService } from "./douyin-acquisition-service.js";
import { createAccountAnalysisService } from "./account-analysis-service.js";
import { createViralWorkAnalysisService } from "./viral-work-analysis-service.js";
import { createAccountReceptionStore, receptionAccountKeys } from "./account-reception-store.js";
import { createProspectRecordStore } from "./prospect-record-store.js";
import { createAgentResultRunStore } from "./agent-result-run-store.js";
import { createBusinessDemandStore } from "./business-demand-store.js";
import { applyReceptionStrategyUpdate, receptionStrategySavedConfirmation } from "./account-reception-conversation.js";
import { previewReception } from "./account-reception-preview.js";
import { createClueHunterPrivateOutreachExecutor } from "./cluehunter-private-outreach-executor.js";
import { createProspectWorkflowRunner } from "./prospect-workflow-runner.js";
import { createTaskDispatcher } from "./task-dispatcher.js";
import { createCoreAgentExecutionService } from "./core-agent-execution-service.js";
import { createEmploymentStore } from "./employment-store.js";
import { createLocalBrowserExecutor } from "./local-browser-executor.js";
import { FilePersistenceAdapter } from "./persistence.js";
import { createProspectWorkbook, prospectWorkbookFilename } from "./prospect-workbook.js";
import { normalizeAcquisitionTaskStatus } from "../src/salebuddy/agents/acquisition-contract.js";
import { isChiefAgentType } from "../src/salebuddy/agents/chief-conversation.js";
import { specialistConversationMetadata } from "../src/salebuddy/agents/direct-message-contract.js";
import { createAgentStore } from "../scripts/agent-store.mjs";
import { createAgentKnowledgeProvider } from "./knowledge-context.js";
import { createDouyinFinderService } from "./douyin-finder-service.js";
import { createDouyinAccountActionCoordinator, douyinAccountCoordinationKey } from "./douyin-account-action-coordinator.js";
import { createOfficeWorkReplayStore } from "./office-work-replay.js";
import { createManagedDailyReportService } from "./managed-daily-report.js";
import { aggregateAcquisitionBusinessMetrics, createAcquisitionBusinessConversationService } from "./acquisition-business-conversation.js";
import { createDouyinAgentDataClient, douyinAgentDataConfiguration } from "../src/salebuddy/bridge/douyin-agent-data.js";
import { createDouyinDataMcpClient, douyinDataMcpConfiguration } from "../src/salebuddy/bridge/douyin-data-mcp.js";
import { createGoldAccountContextService } from "./gold-account-context.js";
import { publicFinderNeedsBusinessAccount, validatePublicFinderBusinessAccount } from "../src/salebuddy/agents/public-finder-contract.js";
import {
  buildDouyinAcquisitionAccountCapabilityMatrix,
  DOUYIN_ACQUISITION_ACTIVE_AGENT_IDS,
  DOUYIN_ACQUISITION_CLOUD_AGENT_IDS,
  DOUYIN_ACCOUNT_CLOUD_RUNTIME_ID
} from "../src/salebuddy/agents/marketplace.js";

const DEFAULT_PRIVATE_OUTREACH_TIMEOUT_MS = 30 * 60 * 1000;
const MAX_PRIVATE_OUTREACH_TIMEOUT_MS = 60 * 60 * 1000;
const DEFAULT_AGENT_STORE_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)), "agents");
const ACQUISITION_AGENT_IDS = new Set(["mkt-comment-acquisition", "mkt-find-people"]);
const COMPREHENSIVE_ACQUISITION_AGENT_ID = "mkt-comment-acquisition";
const DOUYIN_ACCOUNT_CLOUD_AGENT_ID = DOUYIN_ACCOUNT_CLOUD_RUNTIME_ID;
const DOUYIN_CLOUD_AGENT_IDS = DOUYIN_ACQUISITION_CLOUD_AGENT_IDS;
const ACTIVE_COMPREHENSIVE_TASK_STATES = new Set(["configuring", "running", "paused", "degraded"]);
const INBOX_CAPABLE_AGENT_IDS = Object.freeze([
  COMPREHENSIVE_ACQUISITION_AGENT_ID,
  "mkt-dm-inbox",
  "mkt-gold-customer-service"
]);
const INBOX_CAPABLE_AGENT_ID_SET = new Set(INBOX_CAPABLE_AGENT_IDS);
const RECEPTION_STRATEGY_AGENT_IDS = new Set(INBOX_CAPABLE_AGENT_IDS);
const RECEPTION_STRATEGY_AGENT_NAMES = Object.freeze({
  "mkt-comment-acquisition": "获客专家",
  "mkt-dm-inbox": "私信客服",
  "mkt-gold-customer-service": "金牌客服"
});
const CORE_EXECUTION_AGENT_IDS = new Set([
  "mkt-comment-acquisition",
  "mkt-find-people",
  "mkt-intent-analyst",
  "mkt-live-danmaku-analysis",
  "mkt-live-danmaku-outreach",
  "mkt-viral-work-analysis",
  "mkt-cold-writer",
  "mkt-dm-inbox",
  "mkt-gold-customer-service"
]);
const ACCOUNT_SCOPED_DIRECT_MESSAGE_AGENT_IDS = new Set(CORE_EXECUTION_AGENT_IDS);
const ACCOUNT_ANALYSIS_AGENT_ID = "mkt-intent-analyst";

function enabledFlag(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function resolveLegacyPublicDiscoveryService(options, accountResolver) {
  const hasExplicitService = Object.hasOwn(options, "legacyPublicDiscoveryService")
    || Object.hasOwn(options, "prospectService");
  if (hasExplicitService) {
    return options.legacyPublicDiscoveryService ?? options.prospectService ?? null;
  }
  if (!enabledFlag(process.env.BYERING_ENABLE_LEGACY_PUBLIC_DISCOVERY)) return null;
  return createProspectService({ accountResolver });
}

function isPublicDouyinProfileUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    return ["http:", "https:"].includes(url.protocol)
      && /(^|\.)douyin\.com$/.test(url.hostname)
      && /^\/user\/[^/]+/.test(url.pathname);
  } catch {
    return false;
  }
}

function publicDouyinProfileUrls(text) {
  const candidates = String(text || "").match(/https?:\/\/[^\s<>'"`]+/giu) || [];
  return [...new Set(candidates
    .map(value => value.replace(/[，。；！!？?）】》〉]+$/u, ""))
    .filter(isPublicDouyinProfileUrl))];
}

function resolveDouyinCloudAgentId(agentId = "") {
  const id = String(agentId || "").trim();
  return DOUYIN_ACQUISITION_ACTIVE_AGENT_IDS.includes(id) ? DOUYIN_ACCOUNT_CLOUD_AGENT_ID : id;
}

function isLogicalDouyinAgentAccountId(accountId = "") {
  return /^douyin-agent:[a-z0-9_-]+$/i.test(String(accountId || "").trim());
}

function accountIdentityMatchesId(identity, accountId = "") {
  const requested = String(accountId || "").trim();
  if (!requested || !identity || typeof identity !== "object") return false;
  return [
    identity.account,
    identity.uid,
    identity.user_id,
    identity.userId,
    identity.sec_uid,
    identity.secUid,
    identity.sec_id,
    identity.secId,
    identity.unique_id,
    identity.uniqueId,
    identity.profile_url,
    identity.profileUrl
  ].some((value) => String(value || "").trim() === requested);
}

function resolvePersistedDouyinCloudScope(registry, agentId = "", scope = {}) {
  const requestedScope = scope && typeof scope === "object" ? scope : {};
  if (hasAccountIdentity(requestedScope.accountIdentity) || typeof registry?.list !== "function") return requestedScope;

  const cloudAgentId = resolveDouyinCloudAgentId(agentId);
  if (cloudAgentId !== DOUYIN_ACCOUNT_CLOUD_AGENT_ID) return requestedScope;

  const tenantId = optionalText(requestedScope.tenantId) || null;
  const accountId = optionalText(requestedScope.accountId) || null;
  const compatibleAgentIds = new Set([cloudAgentId, ...DOUYIN_CLOUD_AGENT_IDS]);
  const candidates = registry.list().filter((record) => {
    if (!compatibleAgentIds.has(String(record?.agentId || "").trim())) return false;
    if (!hasAccountIdentity(record?.accountIdentity)) return false;
    return tenantId ? record?.tenantId === tenantId : !record?.tenantId;
  });
  const directMatches = accountId
    ? candidates.filter((record) => record?.accountId === accountId || accountIdentityMatchesId(record?.accountIdentity, accountId))
    : [];
  const resolved = directMatches.length === 1
    ? directMatches[0]
    : ((!accountId || isLogicalDouyinAgentAccountId(accountId)) && candidates.length === 1 ? candidates[0] : null);

  if (!resolved) return requestedScope;
  return {
    ...requestedScope,
    accountIdentity: { ...resolved.accountIdentity },
    accountLabel: requestedScope.accountLabel || resolved.accountLabel || resolved.accountIdentity?.nickname || null
  };
}

function adoptDouyinAccountCloudBinding(registry, agentId = "", scope = {}) {
  const cloudAgentId = resolveDouyinCloudAgentId(agentId);
  if (cloudAgentId !== DOUYIN_ACCOUNT_CLOUD_AGENT_ID || typeof registry?.adopt !== "function") return cloudAgentId;
  const resolvedScope = resolvePersistedDouyinCloudScope(registry, agentId, scope);
  registry.adopt(cloudAgentId, { ...resolvedScope, fromAgentIds: DOUYIN_CLOUD_AGENT_IDS });
  return cloudAgentId;
}

function directAccountAnalysisInput(agentType, text) {
  if (agentType !== ACCOUNT_ANALYSIS_AGENT_ID) return null;
  const profileUrls = publicDouyinProfileUrls(text);
  if (profileUrls.length !== 1) return null;
  return {
    accounts: [{ profileUrl: profileUrls[0] }],
    goal: "分析这个抖音账号的内容方向、公开信息和仍需确认的情况。"
  };
}

function accountAnalysisResultText(result) {
  const report = Array.isArray(result?.accounts)
    ? result.accounts.find(account => account?.report?.status === "analyzed")?.report
    : null;
  const summary = optionalText(report?.summary || result?.summary);
  if (summary) return `账号分析已完成。\n${summary}\n\n完整的事实依据和待确认信息已整理到分析结果中。`;
  return "账号分析已完成。完整的事实依据和待确认信息已整理到分析结果中。";
}

function scheduleAccountAnalysisRun({ security, principal, body, onSettled = null }) {
  const service = security.accountAnalysisService;
  if (!service?.configured) throw new ControlPlaneError("账号分析模型未配置", { code: "ACCOUNT_ANALYSIS_NOT_CONFIGURED", statusCode: 503 });
  if (!Array.isArray(body.accounts) || !body.accounts.length || body.accounts.length > 20) {
    throw new ControlPlaneError("请选择 1-20 个账号", { code: "ACCOUNT_ANALYSIS_INPUT_INVALID", statusCode: 400 });
  }
  const taskId = optionalText(body.taskId) || `analysis-${randomUUID()}`;
  const key = `${principal?.tenantId || "local"}:${taskId}`;
  const runs = security.accountAnalysisRuns;
  if (runs.has(key)) return { accepted: true, ...runs.get(key) };
  if (runs.size >= 100) {
    const completed = [...runs.entries()].find(([, run]) => run.status !== "running");
    if (completed) runs.delete(completed[0]);
    else throw new ControlPlaneError("分析任务较多，请稍后再试", { code: "ACCOUNT_ANALYSIS_BUSY", statusCode: 429 });
  }
  const running = {
    taskId,
    taskRunId: body.taskRunId || null,
    agentId: ACCOUNT_ANALYSIS_AGENT_ID,
    status: "running",
    counts: { total: body.accounts.length },
    accounts: []
  };
  runs.set(key, running);
  const finishOffice = security.officeOperations.begin({
    tenantId: principal.tenantId || null,
    agentId: ACCOUNT_ANALYSIS_AGENT_ID,
    taskId,
    taskRunId: body.taskRunId
  });
  Promise.resolve()
    .then(() => service.run(applyCompanionExecution(
      { ...body, taskId },
      security.companion.context({ agentId: ACCOUNT_ANALYSIS_AGENT_ID, tenantId: principal.tenantId || null }, body.goal || "")
    )))
    .then(result => {
      runs.set(key, result);
      finishOffice(result.status || "completed", result);
      onSettled?.({ status: "completed", result });
    })
    .catch(error => {
      finishOffice("failed");
      const failed = {
        ...running,
        status: "failed",
        error: { code: error.code || "ACCOUNT_ANALYSIS_FAILED", message: error.message || "账号分析失败" }
      };
      runs.set(key, failed);
      onSettled?.({ status: "failed", result: failed });
    });
  return { accepted: true, ...running };
}

function startDirectAccountAnalysis({ security, principal, agentStore, storedId, agentType, message, input, conversationId = null }) {
  const profileUrl = input.accounts?.[0]?.profileUrl || null;
  const taskId = `analysis-${randomUUID()}`;
  const saveTaskState = (task) => {
    const metadata = {
      ...(message.metadata && typeof message.metadata === "object" ? message.metadata : {}),
      companionReply: { phase: "complete" },
      accountAnalysis: {
        taskId: task.taskId || taskId,
        status: task.status || "running",
        profileUrl,
        inReplyTo: message.id
      }
    };
    const durable = typeof agentStore.updateDm === "function"
      ? agentStore.updateDm(storedId, message.id, { metadata })
      : null;
    if (durable) message.metadata = durable.metadata;
  };
  const appendTaskUpdate = (text, task) => agentStore.appendDm(storedId, {
    from: agentType,
    fromName: "抖音账号分析",
    text,
    conversationId,
    metadata: {
      source: "account-analysis-task",
      accountAnalysis: { taskId: task.taskId || taskId, status: task.status, inReplyTo: message.id }
    }
  });
  try {
    const started = scheduleAccountAnalysisRun({
      security,
      principal,
      body: { ...input, taskId },
      onSettled: ({ status, result }) => {
        const task = { ...result, taskId: result?.taskId || taskId, status };
        saveTaskState(task);
        appendTaskUpdate(
          status === "completed"
            ? accountAnalysisResultText(result)
            : `这次账号分析没有完成：${optionalText(result?.error?.message) || "服务暂时不可用"}。`,
          task
        );
      }
    });
    saveTaskState(started);
    appendTaskUpdate("收到，已开始分析这个抖音账号的公开主页和近期作品。完成后我会在这里告诉你结论和还需要确认的地方。", started);
    return started;
  } catch (error) {
    const failed = { taskId, status: "failed" };
    saveTaskState(failed);
    appendTaskUpdate(`暂时无法开始账号分析：${error.message || "服务暂时不可用"}。`, failed);
    return failed;
  }
}

function resumePendingDirectAccountAnalysis({ security, principal, agentStore, storedId, agentType, messages }) {
  if (agentType !== ACCOUNT_ANALYSIS_AGENT_ID) return false;
  const pending = [...messages].reverse().find((message) => {
    if (message.from !== "user" || message.metadata?.accountAnalysis?.taskId) return false;
    return Boolean(directAccountAnalysisInput(agentType, message.text));
  });
  if (!pending) return false;
  return Boolean(startDirectAccountAnalysis({
    security,
    principal,
    agentStore,
    storedId,
    agentType,
    message: pending,
    input: directAccountAnalysisInput(agentType, pending.text),
    conversationId: pending.conversationId || null
  }));
}

function receptionStrategyContext({ registry, store, agentType, accountId, tenantId }) {
  if (!RECEPTION_STRATEGY_AGENT_IDS.has(agentType) || !registry || typeof registry.list !== "function") return null;
  const requestedAccountId = optionalText(accountId);
  const cloudAgentId = resolveDouyinCloudAgentId(agentType);
  const compatibleCloudRecordIds = new Set([cloudAgentId, ...DOUYIN_CLOUD_AGENT_IDS]);
  const recordAccountIds = (record) => [...new Set([
    record?.accountId,
    record?.agentId && `douyin-agent:${record.agentId}`,
    ...receptionAccountKeys(record?.accountIdentity)
  ].filter(Boolean).map(String))];
  const candidates = registry.list().filter((record) => {
    if (!compatibleCloudRecordIds.has(record?.agentId) || !record?.accountIdentity) return false;
    if (tenantId && record.tenantId !== tenantId) return false;
    return !requestedAccountId || recordAccountIds(record).includes(requestedAccountId);
  });
  if (candidates.length !== 1) return null;
  const owner = { tenantId, account: candidates[0].accountIdentity };
  // Reading a draft from the conversation must never change a production
  // reception strategy. Activation happens only after explicit confirmation.
  const configured = store.get(owner);
  return { owner, configured, accountId: requestedAccountId };
}

function updateReceptionStrategyFromConversation({ registry, store, agentType, accountId, tenantId, text }) {
  const context = receptionStrategyContext({ registry, store, agentType, accountId, tenantId });
  if (!context) return null;
  const update = applyReceptionStrategyUpdate(context.configured.settings, text);
  if (!update) return null;
  return {
    ...update,
    expectedRevision: context.configured.revision,
    accountId: context.accountId
  };
}

function pendingReceptionStrategyProposal(messages, agentType, conversationId = null) {
  return [...(Array.isArray(messages) ? messages : [])].reverse().find((message) =>
    message?.from === agentType
    && (!conversationId || message?.conversationId === conversationId)
    && message?.metadata?.receptionStrategyProposal
    && message.metadata.receptionStrategyProposal.status === "pending"
  ) || null;
}

function isReceptionStrategyConfirmation(text) {
  return /^(?:确认|确认修改|同意|按这个改|就这样改|可以执行|确认执行|保存|确认保存)[！!。\s]*$/u.test(String(text || "").trim());
}

function confirmReceptionStrategyProposal({ registry, store, agentType, accountId, tenantId, proposal }) {
  if (!proposal || typeof proposal !== "object") return null;
  const context = receptionStrategyContext({ registry, store, agentType, accountId, tenantId });
  if (!context || context.accountId !== optionalText(proposal.accountId)) return { stale: true };
  if (context.configured.revision !== Number(proposal.expectedRevision)) return { stale: true };
  try {
    if (context.configured.privateReception?.enabled !== true && typeof store.configurePrivateReception === "function") {
      store.configurePrivateReception(context.owner, { agentId: agentType });
    }
    const record = store.save(context.owner, proposal.settings, context.configured.revision);
    return {
      record,
      changes: Array.isArray(proposal.changes) ? proposal.changes : [],
      confirmation: receptionStrategySavedConfirmation(Array.isArray(proposal.changes) ? proposal.changes : [])
    };
  } catch (error) {
    if (error?.code === "RECEPTION_VERSION_CONFLICT") return { stale: true };
    throw error;
  }
}

export function createControlPlaneHttpServer({
  controlPlane = null,
  persistence = null,
  browserWorkspace = createBrowserWorkspaceService(),
  requirementService = createRequirementUnderstandingService(),
  clueHunterService = createClueHunterService(),
  prospectService = null,
  legacyPublicDiscoveryService = null,
  intentAnalysisService = null,
  douyinFinderService = null,
  accountAnalysisService = null,
  accountAnalysisRuns = new Map(),
  accountReceptionStore = null,
  businessDemandStore = null,
  accountContextService = null,
  douyinDataMcpService = null,
  prospectRecordStore = null,
  agentResultRunStore = null,
  accountResolver = createAccountResolver(),
  cloudDesktopService = null,
  douyinMcpService = null,
  douyinInboxAgentService = null,
  douyinAgentCloudRegistry = null,
  douyinAvatarFetcher = fetchDouyinAvatar,
  douyinAccountActionCoordinator = null,
  douyinAcquisitionService = null,
  acquisitionEventSink = null,
  douyinAcquisitionEventSink = null,
  douyinAcquisitionServiceOptions = null,
  agentStore = null,
  agentStoreRoot = null,
  knowledgeProvider = null,
  companionGenerator = undefined,
  officeReplayStore = null,
  activityEventSink = null,
  cloudDesktopMode = process.env.BYERING_CLOUD_DESKTOP_MODE || "local",
  localBrowserExecutor = null,
  prospectExecutor = null,
  taskDispatcher = null,
  coreAgentExecutionService = null,
  viralWorkAnalysisService = null,
  employmentStore = null,
  prospectRuns = new Map(),
  douyinFinderRuns = new Map(),
  allowedOrigins = defaultAllowedOrigins(),
  auth = null,
  bodyLimit = 1024 * 1024,
  clueHunterEventSecret = process.env.BYERING_CLUEHUNTER_EVENT_SECRET || process.env.BYERING_CLUEHUNTER_SIGNING_SECRET || null,
  clueHunterEventMaxSkewMs = 5 * 60 * 1000,
  prospectEventSecret = process.env.BYERING_PROSPECT_EVENT_SECRET || null,
  prospectEventMaxSkewMs = 5 * 60 * 1000,
  managedDailyReportService = null,
  managedDailyReportIntervalMs = 5 * 60 * 1000,
  inboxRuntimeRecoveryIntervalMs = 60 * 1000,
  allowLegacyProductExecution = false,
  now = () => Date.now()
} = {}) {
  const authoritativeControlPlane = controlPlane || createControlPlane({ browserWorkspace, douyinMcpService, requirementService, taskDispatcher, persistence: persistence || undefined });
  if (douyinMcpService && !authoritativeControlPlane.douyinMcpService) authoritativeControlPlane.douyinMcpService = douyinMcpService;
  const authoritativeClueHunterService = clueHunterService || createClueHunterService({ env: {} });
  const authoritativeProspectService = legacyPublicDiscoveryService ?? prospectService;
  const authoritativeIntentAnalysisService = intentAnalysisService || createProspectIntentAnalysisService({ env: {} });
  const authoritativeDouyinFinderService = douyinFinderService || createDouyinFinderService({ accountResolver });
  const authoritativeAccountAnalysisService = accountAnalysisService || createAccountAnalysisService();
  const receptionStore = accountReceptionStore || createAccountReceptionStore();
  const resolvedProspectRecordStore = prospectRecordStore || createProspectRecordStore();
  const resolvedAgentResultRunStore = agentResultRunStore || createAgentResultRunStore();
  const resolvedBusinessDemandStore = businessDemandStore || createBusinessDemandStore();
  const resolvedEmploymentStore = employmentStore || createEmploymentStore();
  const inboxPlanRegistry = createInboxPlanRegistry();
  const authoritativeDouyinAgentCloudRegistry = douyinAgentCloudRegistry;
  const authoritativeDouyinAccountActionCoordinator = douyinAccountActionCoordinator || createDouyinAccountActionCoordinator();
  const resolvedAgentStore = agentStore || createAgentStore(resolve(
    agentStoreRoot || process.env.BYERING_AGENT_STORE_ROOT || DEFAULT_AGENT_STORE_ROOT
  ), {
    seedMessages: process.env.MARVIS_ENABLE_GATEWAY_MOCK === "1",
    demoConversationMode: process.env.MARVIS_ENABLE_GATEWAY_MOCK === "1"
  });
  const resolvedKnowledgeProvider = knowledgeProvider || createAgentKnowledgeProvider({ agentStore: resolvedAgentStore });
  const resolvedAcquisitionEventSink = douyinAcquisitionEventSink
    || acquisitionEventSink
    || activityEventSink
    || createAcquisitionActivityBridge(authoritativeControlPlane);
  const resolvedInboxEventSink = createInboxActivityBridge(authoritativeControlPlane);
  if (typeof douyinInboxAgentService?.setEventSink === "function") {
    douyinInboxAgentService.setEventSink(resolvedInboxEventSink);
  }
  const rawAcquisitionOptions = douyinAcquisitionServiceOptions && typeof douyinAcquisitionServiceOptions === "object"
    ? douyinAcquisitionServiceOptions
    : {};
  const {
    prospectService: compatibilityLegacyPublicDiscoveryService,
    legacyPublicDiscoveryService: explicitLegacyPublicDiscoveryService,
    ...acquisitionOptions
  } = rawAcquisitionOptions;
  delete acquisitionOptions.publicReplyExecutor;
  const privateOutreachExecutionIdentityProvider = createColdWriterRpaIdentityProvider();
  const resolvedPrivateOutreachExecutor = createClueHunterPrivateOutreachExecutor({
    clueHunterService: authoritativeClueHunterService,
    executionIdentityProvider: privateOutreachExecutionIdentityProvider
  });
  const profileDataClient = Object.prototype.hasOwnProperty.call(rawAcquisitionOptions, "profileDataClient")
    ? rawAcquisitionOptions.profileDataClient
    : (() => {
      const configuration = douyinAgentDataConfiguration();
      return configuration.url
        ? createDouyinAgentDataClient({
          url: configuration.url,
          timeoutMs: 10_000,
          requestRetryAttempts: 1
        })
        : null;
  })();
  const publicCommentDataClient = douyinDataMcpService || (() => {
    const configuration = douyinDataMcpConfiguration();
    return configuration.url
      ? createDouyinDataMcpClient({ url: configuration.url, timeoutMs: configuration.timeoutMs })
      : null;
  })();
  const authoritativeAccountContextService = accountContextService || createGoldAccountContextService({
    profileDataClient,
    commentDataClient: publicCommentDataClient,
    analysisService: authoritativeAccountAnalysisService,
    now
  });
  const authoritativeViralWorkAnalysisService = viralWorkAnalysisService || createViralWorkAnalysisService({
    dataClient: profileDataClient,
    publicDiscoveryService: authoritativeProspectService
  });
  const inboxAgentServices = new Map();
  const inboxRuntimeOwners = new Map();
  const privateMessageInFlight = new Map();
  const officeOperations = createOfficeOperations();
  const acquisitionEventIds = new Set();
  const douyinAvatarCache = new Map();
  const douyinAvatarRefreshes = new Map();
  const getDouyinMcpService = (agentId = "", scope = {}) => {
    const resolvedScope = resolvePersistedDouyinCloudScope(authoritativeDouyinAgentCloudRegistry, agentId, scope);
    const cloudAgentId = adoptDouyinAccountCloudBinding(authoritativeDouyinAgentCloudRegistry, agentId, resolvedScope);
    return authoritativeDouyinAgentCloudRegistry && cloudAgentId
      ? authoritativeDouyinAgentCloudRegistry.getService(cloudAgentId, resolvedScope)
      : douyinMcpService;
  };
  const readPersistedDouyinAuthorization = async (agentId = "", scope = {}, mcp = null) => {
    const resolvedScope = resolvePersistedDouyinCloudScope(authoritativeDouyinAgentCloudRegistry, agentId, scope);
    const cloudAgentId = adoptDouyinAccountCloudBinding(authoritativeDouyinAgentCloudRegistry, agentId, resolvedScope);
    const status = authoritativeDouyinAgentCloudRegistry
      && cloudAgentId
      && typeof authoritativeDouyinAgentCloudRegistry.status === "function"
      ? await authoritativeDouyinAgentCloudRegistry.status(cloudAgentId, resolvedScope)
      : typeof mcp?.probeRemoteStatus === "function"
        ? await mcp.probeRemoteStatus()
        : typeof mcp?.status === "function"
          ? await mcp.status()
          : null;
    return requireDouyinAuthorization(mcp, status);
  };
  const getDouyinInboxAgentService = (agentId = COMPREHENSIVE_ACQUISITION_AGENT_ID, tenantId = null, scope = {}) => {
    const semanticAgentId = String(agentId || COMPREHENSIVE_ACQUISITION_AGENT_ID).trim();
    const resolvedScope = resolvePersistedDouyinCloudScope(authoritativeDouyinAgentCloudRegistry, semanticAgentId, { ...scope, tenantId });
    const cloudAgentId = adoptDouyinAccountCloudBinding(authoritativeDouyinAgentCloudRegistry, semanticAgentId, resolvedScope) || COMPREHENSIVE_ACQUISITION_AGENT_ID;
    const accountKey = douyinAccountCoordinationKey(resolvedScope.accountIdentity || null, resolvedScope.accountId || null);
    const runtimeKey = JSON.stringify([tenantId, semanticAgentId, accountKey || null]);
    const injectedAgentId = String(douyinInboxAgentService?.agentId || COMPREHENSIVE_ACQUISITION_AGENT_ID).trim();
    if (douyinInboxAgentService && typeof douyinInboxAgentService.status === "function" && injectedAgentId === semanticAgentId) {
      return douyinInboxAgentService;
    }
    if (authoritativeDouyinAgentCloudRegistry) {
      if (!inboxAgentServices.has(runtimeKey)) inboxAgentServices.set(runtimeKey, createDouyinInboxAgentService({
        douyinMcpService: authoritativeDouyinAgentCloudRegistry.getService(cloudAgentId, resolvedScope),
        accountActionCoordinator: authoritativeDouyinAccountActionCoordinator,
        agentId: semanticAgentId,
        knowledgeProvider: resolvedKnowledgeProvider,
        accountContextService: authoritativeAccountContextService,
        receptionStore,
        eventSink: resolvedInboxEventSink,
        ...(tenantId ? { stateFile: join(homedir(), ".byering", "douyin-inbox", `${createHmac("sha256", "inbox-scope").update(runtimeKey).digest("hex")}.json`) } : {})
      }));
      return inboxAgentServices.get(runtimeKey);
    }
    return douyinInboxAgentService;
  };
  const inboxRuntimeOwnerKey = ({ tenantId = null, accountIdentity = null, accountId = null } = {}) => {
    const accountKey = douyinAccountCoordinationKey(accountIdentity, accountId);
    return accountKey ? JSON.stringify([tenantId || null, accountKey]) : "";
  };
  const cancelInboxRuntimeTask = ({ service, agentId = null, reason = "INBOX_RUNTIME_STOPPED" } = {}) => {
    const runtime = service?.status?.() || {};
    const taskId = optionalText(runtime.taskId || runtime.runtime?.taskId);
    if (!taskId) return null;
    let snapshot;
    try {
      snapshot = authoritativeControlPlane.getTaskSnapshot(taskId);
    } catch {
      return null;
    }
    if (snapshot.state !== "RUNNING") return snapshot;
    authoritativeControlPlane.dispatch({
      type: "task.cancel",
      taskId: snapshot.taskId,
      taskRunId: optionalText(runtime.taskRunId || runtime.runtime?.taskRunId) || snapshot.taskRunId,
      conversationId: optionalText(runtime.conversationId || runtime.runtime?.conversationId) || snapshot.conversationId,
      agentId: optionalText(agentId) || snapshot.agentId,
      expectedVersion: snapshot.version,
      payload: { reason }
    });
    return authoritativeControlPlane.getTaskSnapshot(taskId);
  };
  const claimInboxRuntime = async ({ tenantId = null, agentId, service, accountIdentity = null, accountId = null, takeover = false } = {}) => {
    if (!INBOX_CAPABLE_AGENT_ID_SET.has(agentId) || !service) return { claimed: true, ownerAgentId: agentId || null };
    const ownerKey = inboxRuntimeOwnerKey({ tenantId, accountIdentity, accountId });
    if (!ownerKey) return { claimed: true, ownerAgentId: agentId };
    const ownerIdentity = hasAccountIdentity(accountIdentity)
      ? accountIdentity
      : (accountId ? { uid: accountId } : null);
    const persistedClaim = ownerIdentity && typeof receptionStore.claimPrivateReception === "function"
      ? receptionStore.claimPrivateReception({ tenantId, account: ownerIdentity }, { agentId, takeover: false })
      : null;
    if (persistedClaim?.claimed === false && takeover !== true) {
      return { claimed: false, ownerAgentId: persistedClaim.ownerAgentId, canTakeover: persistedClaim.canTakeover === true };
    }
    const current = inboxRuntimeOwners.get(ownerKey);
    const currentRunning = current?.service?.status?.()?.runtime?.running === true;
    if (current && currentRunning && current.service !== service) {
      if (!takeover) return { claimed: false, ownerAgentId: current.agentId, canTakeover: true };
      if (typeof current.service.stop !== "function") {
        throw new ControlPlaneError("当前账号的私信承接仍在运行，请先停止后再切换。", { code: "INBOX_RUNTIME_OWNER_ACTIVE", statusCode: 409 });
      }
      await current.service.stop();
      try {
        cancelInboxRuntimeTask({
          service: current.service,
          agentId: current.agentId,
          reason: "INBOX_RUNTIME_REPLACED_BY_CONFIRMED_TAKEOVER"
        });
      } finally {
        if (ownerIdentity) receptionStore.stopPrivateReception({ tenantId, account: ownerIdentity }, { agentId: current.agentId });
        inboxRuntimeOwners.delete(ownerKey);
      }
    }
    if (ownerIdentity && typeof receptionStore.claimPrivateReception === "function") {
      const claimed = receptionStore.claimPrivateReception({ tenantId, account: ownerIdentity }, { agentId, takeover: takeover === true });
      if (claimed?.claimed === false) {
        return { claimed: false, ownerAgentId: claimed.ownerAgentId, canTakeover: claimed.canTakeover === true };
      }
    }
    try {
      assertDouyinAccountAgentAvailable?.({ tenantId, agentId, accountIdentity, accountId });
    } catch (error) {
      if (ownerIdentity && typeof receptionStore.stopPrivateReception === "function") {
        try { receptionStore.stopPrivateReception({ tenantId, account: ownerIdentity }, { agentId }); } catch { /* preserve the availability error */ }
      }
      throw error;
    }
    inboxRuntimeOwners.set(ownerKey, { agentId, service });
    return { claimed: true, ownerAgentId: agentId };
  };
  const releaseInboxRuntime = ({ tenantId = null, agentId, service, accountIdentity = null, accountId = null } = {}) => {
    const ownerKey = inboxRuntimeOwnerKey({ tenantId, accountIdentity, accountId });
    if (ownerKey) {
      const current = inboxRuntimeOwners.get(ownerKey);
      if (current?.agentId === agentId && current?.service === service) inboxRuntimeOwners.delete(ownerKey);
      return;
    }
    for (const [key, current] of inboxRuntimeOwners.entries()) {
      if (current?.agentId === agentId && current?.service === service) inboxRuntimeOwners.delete(key);
    }
  };
  const stopCancelledInboxTask = async (command = {}, result = {}, principal = null) => {
    if (!isTaskCancellation(command) || String(result?.state || "").toUpperCase() !== "CANCELLED") return null;
    const payload = command.payload && typeof command.payload === "object" ? command.payload : {};
    const taskId = optionalText(result.taskId || command.taskId || payload.taskId);
    if (!taskId) return null;

    let task;
    try {
      task = authoritativeControlPlane.getTaskSnapshot(taskId);
    } catch {
      return null;
    }
    const agentId = optionalText(task.agentId || command.agentId || payload.agentId);
    if (!INBOX_CAPABLE_AGENT_ID_SET.has(agentId)) return null;

    const executionContext = task.executionContext && typeof task.executionContext === "object"
      ? task.executionContext
      : {};
    const tenantId = optionalText(task.tenantId || executionContext.tenantId || principal?.tenantId) || null;
    const accountId = optionalText(executionContext.accountId || command.accountId || payload.accountId);
    const accountIdentity = Object.keys(executionContext).length > 0 ? executionContext : null;
    const service = getDouyinInboxAgentService(agentId, tenantId, { tenantId, accountId, accountIdentity });
    if (!service || typeof service.stop !== "function") return null;

    const stopped = await service.stop({ reason: "user_cancelled", taskId, accountId });
    const outcome = stopped?.stopOutcome || {};
    if (outcome.runtimeTaskMatched === false || (outcome.durableStopped !== true && outcome.runtimeStopped !== true)) return stopped;

    releaseInboxRuntime({ tenantId, agentId, service, accountIdentity, accountId });
    const ownerIdentity = hasAccountIdentity(accountIdentity)
      ? accountIdentity
      : (accountId ? { uid: accountId } : null);
    if (ownerIdentity) receptionStore.stopPrivateReception({ tenantId, account: ownerIdentity }, { agentId });
    return stopped;
  };
  const authoritativeDouyinAcquisitionService = douyinAcquisitionService || createDouyinAcquisitionService({
    ...acquisitionOptions,
    legacyPublicDiscoveryService: explicitLegacyPublicDiscoveryService ?? compatibilityLegacyPublicDiscoveryService ?? null,
    accountResolver,
    cloudRegistry: authoritativeDouyinAgentCloudRegistry,
    eventSink: resolvedAcquisitionEventSink,
    // Direct HTTP-server instances are used by isolated tests and previews.
    // Durable recovery is enabled by startControlPlaneServer's explicit option.
    autoResume: false,
    profileDataClient
  });
  const acquisitionBusinessConversation = createAcquisitionBusinessConversationService({
    acquisitionService: authoritativeDouyinAcquisitionService,
    now
  });
  // A missing production-only Douyin key must make that capability unavailable,
  // not prevent the whole local control plane from starting.
  const authoritativeDouyinInboxAgentService = douyinInboxAgentService
    || (authoritativeDouyinAgentCloudRegistry?.configured ? getDouyinInboxAgentService() : null);
  const authoritativeCoreAgentExecutionService = coreAgentExecutionService || createCoreAgentExecutionService({
    douyinAcquisitionService: authoritativeDouyinAcquisitionService,
    intentAnalysisService: authoritativeIntentAnalysisService,
    viralWorkAnalysisService: authoritativeViralWorkAnalysisService,
    onViralWorkProgress: (request, progress = {}) => {
      officeOperations.update({
        tenantId: request.tenantId || null,
        agentId: request.agentId,
        taskId: request.taskId,
        taskRunId: request.taskRunId || null
      }, {
        phase: progress.phase || "分析中",
        progress: progress.progress,
        progressSource: "backend",
        analysisProcess: progress.analysisProcess,
        ...(progress.resultSnapshot ? { resultSnapshot: progress.resultSnapshot } : {}),
        metadata: {
          progressSource: "backend",
          analysisKind: "viral_work",
          status: progress.status || "running",
          sourceUrl: request.workUrl || request.videoUrl || null,
          goal: request.goal || null,
          taskId: request.taskId || null,
          taskRunId: request.taskRunId || null,
          ...(progress.resultSnapshot ? { resultSnapshot: progress.resultSnapshot } : {})
        }
      });
    },
    getInboxAgentService: getDouyinInboxAgentService,
    inboxExecutor: async ({ request, input }) => {
      const cloudScope = {
        tenantId: request.tenantId || null,
        accountId: request.accountId || request.accountKey || null,
        accountIdentity: request.accountIdentity || null,
        accountLabel: request.accountName || null
      };
      const service = getDouyinInboxAgentService(request.agentId, cloudScope.tenantId, cloudScope);
      const mcp = getDouyinMcpService(request.agentId, cloudScope);
      assertInboxAgentConfigured(service);
      assertDouyinMcpConfigured(mcp, "启动私信承接");
      const authorized = await readPersistedDouyinAuthorization(request.agentId, cloudScope, mcp);
      if (service.modelConfigured !== true) {
        throw new ControlPlaneError("回复模型未配置，无法启动真实自动回复，请配置 BYERING_LLM_API_KEY", {
          code: "DOUYIN_REPLY_MODEL_NOT_CONFIGURED",
          statusCode: 503
        });
      }
      const claimed = await claimInboxRuntime({
        tenantId: cloudScope.tenantId,
        agentId: request.agentId,
        service,
        accountIdentity: authorized.account,
        accountId: cloudScope.accountId,
        takeover: input.takeover === true
      });
      if (claimed?.claimed === false) {
        throw new ControlPlaneError(`当前账号的私信正在由${RECEPTION_STRATEGY_AGENT_NAMES[claimed.ownerAgentId] || "另一个 Agent"}承接。确认切换后，原承接任务会停止。`, {
          code: "INBOX_RUNTIME_OWNER_ACTIVE",
          statusCode: 409,
          details: { ownerAgentId: claimed.ownerAgentId, canTakeover: claimed.canTakeover === true }
        });
      }
      try {
        const startPlanToken = requiredText(input.planToken, "planToken");
        const startOptions = Object.freeze({
          ...input,
          accountId: cloudScope.accountId,
          accountIdentity: authorized.account,
          accountCoordinationKey: douyinAccountCoordinationKey(authorized.account, cloudScope.accountId),
          planToken: startPlanToken,
          startRequestId: requiredText(input.startRequestId, "startRequestId")
        });
        const result = await service.start(startOptions);
        const privateReception = receptionStore.enablePrivateReception({
          tenantId: cloudScope.tenantId,
          account: authorized.account
        }, { agentId: request.agentId });
        return {
          ...result,
          taskId: input.taskId,
          taskRunId: input.taskRunId,
          conversationId: input.conversationId,
          privateReception: privateReception.privateReception
        };
      } catch (error) {
        releaseInboxRuntime({
          tenantId: cloudScope.tenantId,
          agentId: request.agentId,
          service,
          accountIdentity: authorized.account,
          accountId: cloudScope.accountId
        });
        if (authorized.account && typeof receptionStore.stopPrivateReception === "function") {
          try { receptionStore.stopPrivateReception({ tenantId: cloudScope.tenantId, account: authorized.account }, { agentId: request.agentId }); } catch { /* preserve the original start failure */ }
        }
        throw error;
      }
    },
    outreachExecutor: resolvedPrivateOutreachExecutor,
    resolveOutreachLead: (input) => resolveVerifiedOutreachLead(resolvedProspectRecordStore, input),
    resolveReceptionStrategy: ({ tenantId, account }) => {
      if (!hasAccountIdentity(account)) return null;
      return receptionStore.get({ tenantId: tenantId || null, account });
    }
  });
  const resolvedTaskDispatcher = taskDispatcher
    || authoritativeControlPlane.taskDispatcher
    // An injected control plane is often a state-machine test harness. Keep it
    // inert unless its caller explicitly provides a dispatcher. Production
    // startup creates the plane here and always receives the core gateway.
    || (controlPlane ? null : createTaskDispatcher({
      executionService: authoritativeCoreAgentExecutionService,
      prospectService: prospectExecutor,
      cloudDesktopService: null,
      // A control-plane task can be resumed after a process restart. Recheck
      // the contract at dispatch time so an old queued command cannot execute
      // after the user has ended that Agent's employment.
      authorizeExecution: ({ request }) => requireActiveCoreAgentEmployment(
        resolvedEmploymentStore,
        { tenantId: request?.tenantId || null },
        request?.agentId
      )
    }));
  const accountCoordinationKeys = ({ accountIdentity = null, accountId = null } = {}) => {
    const keys = new Set();
    const source = accountIdentity && typeof accountIdentity === "object" && !Array.isArray(accountIdentity)
      ? accountIdentity
      : {};
    const nested = source.identity && typeof source.identity === "object" && !Array.isArray(source.identity)
      ? source.identity
      : {};
    for (const value of [source.sec_uid, source.secUid, source.sec_id, source.secId, nested.sec_uid, nested.secUid, nested.sec_id, nested.secId]) {
      if (value != null && String(value).trim()) keys.add(`douyin:sec:${String(value).trim()}`);
    }
    for (const value of [source.uid, source.user_id, source.userId, nested.uid, nested.user_id, nested.userId]) {
      if (value != null && String(value).trim()) keys.add(`douyin:uid:${String(value).trim()}`);
    }
    for (const value of [source.unique_id, source.uniqueId, nested.unique_id, nested.uniqueId]) {
      if (value != null && String(value).trim()) keys.add(`douyin:unique:${String(value).trim()}`);
    }
    for (const value of [source.profile_url, source.profileUrl, nested.profile_url, nested.profileUrl]) {
      if (value != null && String(value).trim()) keys.add(`douyin:profile:${String(value).trim()}`);
    }
    const fallback = accountId == null ? "" : String(accountId).trim();
    if (fallback) keys.add(`douyin:fallback:${fallback}`);
    return keys;
  };
  const preflightCoreExecution = async (request = {}, principal = null) => {
    const agentId = optionalText(request.agentId);
    if (!CORE_EXECUTION_AGENT_IDS.has(agentId) || ["mkt-intent-analyst", "mkt-viral-work-analysis"].includes(agentId)) return request;
    const cloudScope = douyinCloudScope(null, request, principal || anonymousPrincipal());
    const mcp = getDouyinMcpService(agentId, cloudScope);
    assertDouyinMcpConfigured(mcp, "执行 Agent 任务");
    const authorized = await readPersistedDouyinAuthorization(agentId, cloudScope, mcp);
    return {
      ...request,
      accountId: optionalText(request.accountId) || cloudScope.accountId || authorized.account?.uid || authorized.account?.secId || null,
      accountKey: optionalText(request.accountKey) || cloudScope.accountId || null,
      accountName: optionalText(request.accountName) || authorized.account?.nickname || null,
      accountIdentity: authorized.account,
      config: {
        ...(request.config && typeof request.config === "object" ? request.config : {}),
        accountIdentity: authorized.account
      }
    };
  };
  // Account occupation is enforced by the control plane per semantic Agent.
  // Distinct product Agents may share one cloud account; repeated starts of
  // the same Agent are rejected before an external runtime is leased.
  const assertDouyinAccountAgentAvailable = () => {};
  const readOfficeStatus = (tenantId = null) => {
    const acquisitionIds = [...DOUYIN_ACQUISITION_ACTIVE_AGENT_IDS];
    // Continuous acquisition and inbox work each expose their own durable
    // runtime state below. Project-style analysis and outreach work is held in
    // the control-plane operation store while it is running.
    const durableRuntimeAgentIds = new Set([
      COMPREHENSIVE_ACQUISITION_AGENT_ID,
      "mkt-find-people",
      "mkt-live-danmaku-outreach",
      ...INBOX_CAPABLE_AGENT_IDS
    ]);
    const sources = [{
      agentIds: OFFICE_AGENT_IDS.filter(id => !durableRuntimeAgentIds.has(id)),
      tasks: officeOperations.list()
    }];
    try {
      const service = authoritativeDouyinAcquisitionService;
      const tasks = service?.listRuntimeTasks?.() || service?.listTasks?.().map(task => ({ ...task, runtimeAlive: false })) || [];
      sources.push({ agentIds: acquisitionIds, tasks: tasks.map(task => ({
        ...task.context, key: task.key, state: task.state, runtimeAlive: task.runtimeAlive, listening: task.listening,
        lastError: task.lastError, resumeBlocked: task.resumeBlocked || null,
        startedAt: task.createdAt, updatedAt: task.updatedAt, longRunning: true,
        result: task.result || null, resultSnapshot: task.resultSnapshot || task.result?.resultSnapshot || null,
        approvalQueue: task.approvalQueue || [], candidateProfiles: task.candidateProfiles || {}, replies: task.replies || [],
        outreachQuota: task.outreachQuota || null,
        counters: task.counters || null, lastScan: task.lastScan || null, lastAnalysis: task.lastAnalysis || null,
        accountIdentity: task.accountIdentity || task.context?.accountIdentity || null,
        accountLabel: task.accountLabel || task.accountName || task.context?.accountLabel || null,
        configuration: task.configuration || null, config: task.config || null,
        configurationVersion: task.configurationVersion ?? null, configVersion: task.configVersion ?? null,
        taskVersion: task.taskVersion ?? task.version ?? null
      })) });
    } catch { sources.push({ agentIds: acquisitionIds, error: true }); }
    try {
      const scoped = [...inboxAgentServices.entries()].flatMap(([key, service]) => {
        const [owner, agentId] = JSON.parse(key);
        return (owner || null) === tenantId && INBOX_CAPABLE_AGENT_ID_SET.has(agentId) ? [{ agentId, service }] : [];
      });
    const injectedAgentId = String(authoritativeDouyinInboxAgentService?.agentId || COMPREHENSIVE_ACQUISITION_AGENT_ID).trim();
      if (authoritativeDouyinInboxAgentService
        && !tenantId
        && INBOX_CAPABLE_AGENT_ID_SET.has(injectedAgentId)
        && !scoped.some(({ service }) => service === authoritativeDouyinInboxAgentService)) {
        scoped.push({ agentId: injectedAgentId, service: authoritativeDouyinInboxAgentService });
      }
      if (scoped.length) sources.push({ agentIds: [...INBOX_CAPABLE_AGENT_IDS], tasks: scoped.map(({ agentId, service }) => {
        const snapshot = service.status();
        const runtime = snapshot.runtime;
        return { agentId, tenantId, accountId: snapshot.accountId,
          state: runtime?.running ? "running" : "stopped", listening: runtime?.running && !runtime?.polling,
          lastError: runtime?.running ? runtime.lastError : null, updatedAt: runtime?.updatedAt, longRunning: true };
      }) });
    } catch { sources.push({ agentIds: [...INBOX_CAPABLE_AGENT_IDS], error: true }); }
    return buildOfficeStatus({ tenantId, sources });
  };
  let inboxRuntimeRecoveryFlight = null;
  const resumePersistedInboxRuntimes = async (tenantId = null) => {
    // Startup recovery and the first office-status request often arrive at
    // nearly the same time. Only one is allowed to claim a cloud inbox
    // runtime, otherwise the same account can receive two start attempts.
    if (inboxRuntimeRecoveryFlight) return inboxRuntimeRecoveryFlight;
    inboxRuntimeRecoveryFlight = (async () => {
      if (authoritativeDouyinAgentCloudRegistry?.status) {
      try {
        const resumedScopes = new Set();
        const records = typeof authoritativeDouyinAgentCloudRegistry.list === "function"
          ? [...authoritativeDouyinAgentCloudRegistry.list()]
          : [];
        const injectedAgentId = String(authoritativeDouyinInboxAgentService?.agentId || "").trim();
        const hasInjectedInboxBinding = records.some((record) => {
          const recordAgentId = String(record?.agentId || "").trim();
          const semanticAgentId = recordAgentId === DOUYIN_ACCOUNT_CLOUD_AGENT_ID
            ? "mkt-dm-inbox"
            : recordAgentId;
          return semanticAgentId === injectedAgentId && !record?.tenantId;
        });
        // The cloud registry is authoritative for account bindings. The one
        // narrow exception is an injected durable inbox service that can
        // prove it has a saved task: it is safe to recover, but never enough
        // to claim an arbitrary logged-in account as a new task.
        if (!tenantId
          && INBOX_CAPABLE_AGENT_ID_SET.has(injectedAgentId)
          && authoritativeDouyinInboxAgentService?.canResumeSaved?.() === true
          && !hasInjectedInboxBinding) {
          records.push({ agentId: injectedAgentId, tenantId: null, durableInboxRecovery: true });
        }
        for (const record of records) {
          const persistedCloudAgentId = String(record?.agentId || "").trim();
          const agentId = persistedCloudAgentId === DOUYIN_ACCOUNT_CLOUD_AGENT_ID ? "mkt-dm-inbox" : persistedCloudAgentId;
          if (!INBOX_CAPABLE_AGENT_ID_SET.has(agentId)) continue;
          const scope = {
            tenantId: record?.tenantId || tenantId || null,
            accountId: record?.accountId || null,
            accountIdentity: record?.accountIdentity || null,
            accountLabel: record?.accountLabel || null
          };
          const resumeKey = JSON.stringify([agentId, scope.tenantId, douyinAccountCoordinationKey(scope.accountIdentity, scope.accountId)]);
          if (resumedScopes.has(resumeKey)) continue;
          resumedScopes.add(resumeKey);
          try {
            // Inbox recovery is semantic-agent work, but its RPA session always
            // belongs to the account-level cloud runtime.
            const cloudAgentId = adoptDouyinAccountCloudBinding(authoritativeDouyinAgentCloudRegistry, agentId, scope);
            const cloudStatus = await authoritativeDouyinAgentCloudRegistry.status(cloudAgentId, { ...scope, resumeSaved: true });
            const service = getDouyinInboxAgentService(agentId, scope.tenantId, scope);
            if (typeof service?.canResumeSaved !== "function" || !service.canResumeSaved()) continue;
            // A successful startup recovery may finish before the first office
            // status request. The listener is already live in that case, so a
            // second resume would create a duplicate polling attempt.
            if (service.status?.()?.runtime?.running === true) continue;
            const claimed = await claimInboxRuntime({
              tenantId: scope.tenantId,
              agentId,
              service,
              accountIdentity: cloudStatus.account || null,
              accountId: scope.accountId || service?.status?.().accountId,
              takeover: false
            });
            if (!claimed.claimed) continue;
            try {
              const resumed = await service.resumeSaved({
                accountIdentity: cloudStatus.account || null,
                accountName: cloudStatus.account?.nickname || null,
                accountCoordinationKey: douyinAccountCoordinationKey(cloudStatus.account, scope.accountId || service?.status?.().accountId)
              });
              if (resumed?.runtime?.running !== true) {
                releaseInboxRuntime({
                  tenantId: scope.tenantId,
                  agentId,
                  service,
                  accountIdentity: cloudStatus.account || null,
                  accountId: scope.accountId || resumed?.accountId
                });
              }
            } catch (error) {
              releaseInboxRuntime({
                tenantId: scope.tenantId,
                agentId,
                service,
                accountIdentity: cloudStatus.account || null,
                accountId: scope.accountId || service?.status?.().accountId
              });
              throw error;
            }
          } catch {
            // One unsupported inbox-capable Agent must not block the other.
          }
        }
      } catch {
        // The office view must keep rendering from the last local snapshot if
        // the provider status is temporarily unavailable.
      }
      }
    })().finally(() => {
      inboxRuntimeRecoveryFlight = null;
    });
    return inboxRuntimeRecoveryFlight;
  };
  const readOfficeStatusLive = async (tenantId = null) => {
    await reconcileCancelledAcquisitionTasks(tenantId);
    await resumePersistedInboxRuntimes(tenantId);
    return readOfficeStatus(tenantId);
  };

  const listCanonicalResults = (tenantId = null, { limit = 100, query = {} } = {}) => {
    const byTask = new Map();
    const add = (entry) => {
      const taskId = optionalText(entry?.taskId);
      const taskRunId = optionalText(entry?.taskRunId);
      const agentId = optionalText(entry?.agentId);
      const snapshot = entry?.resultSnapshot && typeof entry.resultSnapshot === "object"
        ? entry.resultSnapshot
        : null;
      if (!taskId || !agentId || !snapshot) return;
      const sourceContext = entry.sourceContext && typeof entry.sourceContext === "object" ? entry.sourceContext : {};
      const accountId = optionalText(snapshot.accountId || snapshot.account_id || entry.accountId || sourceContext.accountId);
      const key = JSON.stringify([taskId, taskRunId || null, agentId, accountId || null]);
      const incomingUpdatedAt = optionalText(entry.updatedAt || snapshot.generatedAt || snapshot.generated_at || entry.createdAt);
      const existing = byTask.get(key);
      const existingUpdatedAt = optionalText(existing?.updatedAt || existing?.resultSnapshot?.generatedAt);
      if (existing && existingUpdatedAt && incomingUpdatedAt && Date.parse(existingUpdatedAt) > Date.parse(incomingUpdatedAt)) return;
      byTask.set(key, {
        taskId,
        taskRunId,
        agentId,
        agentName: optionalText(snapshot.agentName || snapshot.agent_name || entry.agentName) || agentId,
        accountId,
        status: optionalText(snapshot.status || entry.status) || "unknown",
        resultSnapshot: {
          ...snapshot,
          taskId,
          taskRunId: taskRunId || snapshot.taskRunId || snapshot.task_run_id || null,
          agentId,
          agentName: optionalText(snapshot.agentName || snapshot.agent_name || entry.agentName) || agentId,
          accountId,
          status: optionalText(snapshot.status || entry.status) || "unknown",
          generatedAt: optionalText(snapshot.generatedAt || snapshot.generated_at || entry.updatedAt || entry.createdAt) || new Date().toISOString()
        },
        sourceContext: {
          source: optionalText(sourceContext.source || snapshot.source || entry.source) || "Agent 任务",
          sourceScope: sourceContext.sourceScope || snapshot.sourceScope || null,
          accountId,
          accountName: optionalText(sourceContext.accountName || snapshot.accountName || snapshot.account?.nickname),
          accountUrl: optionalText(sourceContext.accountUrl || snapshot.accountUrl || snapshot.account?.profileUrl),
          window: optionalText(sourceContext.window || snapshot.window),
          links: sourceContext.links || snapshot.links || {}
        },
        updatedAt: optionalText(entry.updatedAt || snapshot.generatedAt || snapshot.generated_at || entry.createdAt)
      });
    };

    for (const task of authoritativeControlPlane.listTaskSnapshots({ tenantId, resultsOnly: true, limit })) {
      add({
        ...task,
        source: "控制面任务",
        status: controlPlaneResultStatus(task.state),
        sourceContext: task.executionContext || {}
      });
    }
    if (typeof authoritativeDouyinAcquisitionService?.listTasks === "function") {
      for (const task of authoritativeDouyinAcquisitionService.listTasks()) {
        const context = task?.context || {};
        if ((context.tenantId || null) !== tenantId) continue;
        let resultSnapshot = task.resultSnapshot || task.result?.resultSnapshot || null;
        if (query?.dateKey) {
          const dailyMetrics = aggregateAcquisitionBusinessMetrics(task, query.dateKey, query.timeZone);
          if (!dailyMetrics.eventCount) continue;
          resultSnapshot = {
            ...(resultSnapshot || {}),
            generatedAt: dailyMetrics.lastEventAt || `${query.dateKey}T23:59:59.999+08:00`,
            counts: {
              ...(resultSnapshot?.counts && typeof resultSnapshot.counts === "object" ? resultSnapshot.counts : {}),
              candidates: dailyMetrics.candidates,
              qualified: dailyMetrics.qualified,
              sent: dailyMetrics.sent,
              replies: dailyMetrics.replies,
              failed: dailyMetrics.failed
            },
            metrics: {
              ...(resultSnapshot?.metrics && typeof resultSnapshot.metrics === "object" ? resultSnapshot.metrics : {}),
              touchRate: dailyMetrics.touchRate,
              replyRate: dailyMetrics.replyRate
            }
          };
        }
        add({
          ...context,
          agentName: task.agentName || context.agentName || null,
          status: acquisitionResultStatus(task.state),
          resultSnapshot,
          updatedAt: task.updatedAt,
          createdAt: task.createdAt,
          source: "抖音获客任务",
          sourceContext: {
            source: task.resultSnapshot?.source || task.result?.resultSnapshot?.source || "抖音获客任务",
            sourceScope: task.resultSnapshot?.sourceScope || context.sourceScope || null,
            accountId: context.accountId || null,
            accountName: context.accountName || context.account?.nickname || null,
            accountUrl: context.account?.profileUrl || null,
            links: task.resultSnapshot?.links || task.result?.resultSnapshot?.links || {}
          }
        });
      }
    }
    for (const entry of resolvedAgentResultRunStore.list(tenantId, { limit })) add(entry);
    return [...byTask.values()]
      .sort((left, right) => String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")))
      .slice(0, Math.max(1, Math.min(500, limit)));
  };
  if (!authoritativeControlPlane.chiefDataProvider) {
    authoritativeControlPlane.setChiefDataProvider?.(({ tenantId, limit, query }) => listCanonicalResults(tenantId, { limit, query }));
  }

  async function reconcileCancelledAcquisitionTasks(tenantId = null) {
    const service = authoritativeDouyinAcquisitionService;
    if (!service || typeof service.listTasks !== "function" || typeof service.stop !== "function") return;
    const tasks = service.listTasks();
    for (const task of tasks) {
      const context = task?.context || {};
      if ((context.tenantId || null) !== tenantId || !context.taskId) continue;
      let snapshot;
      try { snapshot = authoritativeControlPlane.getTaskSnapshot(context.taskId); } catch { continue; }
      if (String(snapshot?.state || "").toUpperCase() !== "CANCELLED") continue;
      if (String(task?.state || "").toLowerCase() === "stopped") continue;
      await service.stop(task.key, "control_plane_cancelled");
    }
  }
  const companion = createCompanionService({
    agentStore: resolvedAgentStore,
    generate: companionGenerator,
    readWork: owner => readOfficeStatus(owner.tenantId || null).works.find(work => work.agentType === owner.agentId) || null,
    readTask: owner => {
      const taskId = optionalText(owner?.taskScope?.taskId);
      if (!taskId) return null;
      try {
        const snapshot = authoritativeControlPlane.getTaskSnapshot(taskId);
        const taskTenantId = snapshot.tenantId || null;
        if (owner.tenantId && taskTenantId && owner.tenantId !== taskTenantId) return null;
        return companionTaskFacts(snapshot, {
          agentId: owner.agentId,
          taskRunId: optionalText(owner?.taskScope?.taskRunId)
        });
      } catch {
        return null;
      }
    }
  });
  const managedDailyReportCapable = ["listTaskSnapshots", "listTaskEvents", "recordArtifact"]
    .every((method) => typeof authoritativeControlPlane?.[method] === "function");
  const resolvedManagedDailyReportService = managedDailyReportService || (managedDailyReportCapable
    ? createManagedDailyReportService({
      controlPlane: authoritativeControlPlane,
      agentStore: resolvedAgentStore,
      now: () => new Date(now()).toISOString()
    })
    : null);
  const flushManagedDailyReports = () => resolvedManagedDailyReportService
    ? resolvedManagedDailyReportService
      .deliverDueReports({ at: new Date(now()).toISOString() })
      .catch(() => null)
    : Promise.resolve({ delivered: [], skipped: "control_plane_artifacts_unavailable" });
  const resolvedOfficeReplayStore = officeReplayStore || createOfficeWorkReplayStore();
  const authenticator = auth && typeof auth.authenticate === "function"
    ? auth
    : auth === false
      ? createControlPlaneAuth({ authRequired: false, apiKeys: [] })
      : createControlPlaneAuth(auth || {});
  if (authenticator.production && authenticator.configurationError) {
    throw authenticator.configurationError;
  }
  if (!authoritativeControlPlane.taskDispatcher) authoritativeControlPlane.taskDispatcher = resolvedTaskDispatcher;
  // The HTTP preflight and the control plane must share the same workspace
  // verifier; otherwise a direct worker command could bypass browser auth.
  if (!authoritativeControlPlane.browserWorkspace) authoritativeControlPlane.browserWorkspace = browserWorkspace;
  const server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
      const principal = request.method === "OPTIONS"
        ? anonymousPrincipal()
        : authenticator.authenticate(request, { path: requestUrl.pathname });
      await route(request, response, authoritativeControlPlane, browserWorkspace, authoritativeClueHunterService, authoritativeProspectService, allowedOrigins, bodyLimit, {
        clueHunterEventSecret,
        clueHunterEventMaxSkewMs,
        prospectEventSecret,
        prospectEventMaxSkewMs,
        accountResolver,
        cloudDesktopService,
        douyinMcpService,
        douyinAgentCloudRegistry: authoritativeDouyinAgentCloudRegistry,
        douyinAvatarFetcher,
        douyinAvatarCache,
        douyinAvatarRefreshes,
        douyinAccountActionCoordinator: authoritativeDouyinAccountActionCoordinator,
        douyinAcquisitionService: authoritativeDouyinAcquisitionService,
        acquisitionBusinessConversation,
        getDouyinMcpService,
        privateMessageInFlight,
        officeOperations,
        readOfficeStatus,
        readOfficeStatusLive,
        listCanonicalResults,
        agentResultRunStore: resolvedAgentResultRunStore,
        officeReplayStore: resolvedOfficeReplayStore,
        managedDailyReportService: resolvedManagedDailyReportService,
        controlPlane: authoritativeControlPlane,
        companion,
        douyinInboxAgentService: authoritativeDouyinInboxAgentService,
        getDouyinInboxAgentService,
        claimInboxRuntime,
        cancelInboxRuntimeTask,
        releaseInboxRuntime,
        stopCancelledInboxTask,
        assertDouyinAccountAgentAvailable,
        agentStore: resolvedAgentStore,
        knowledgeProvider: resolvedKnowledgeProvider,
        cloudDesktopMode,
        localBrowserExecutor,
        prospectExecutor,
        prospectRuns,
        douyinFinderRuns,
        douyinFinderService: authoritativeDouyinFinderService,
        intentAnalysisService: authoritativeIntentAnalysisService,
        coreAgentExecutionService: authoritativeCoreAgentExecutionService,
        preflightCoreExecution,
        accountAnalysisService: authoritativeAccountAnalysisService,
        accountAnalysisRuns,
        accountReceptionStore: receptionStore,
        inboxPlanRegistry,
        businessDemandStore: resolvedBusinessDemandStore,
        employmentStore: resolvedEmploymentStore,
        prospectRecordStore: resolvedProspectRecordStore,
        acquisitionEventIds,
        allowLegacyProductExecution,
        now,
        principal
      });
    } catch (error) {
      sendError(response, error);
    }
  });
  server.controlPlane = authoritativeControlPlane;
  server.persistence = authoritativeControlPlane.persistence;
  server.browserWorkspace = browserWorkspace;
  server.clueHunterService = authoritativeClueHunterService;
  server.prospectService = authoritativeProspectService;
  server.legacyPublicDiscoveryService = authoritativeProspectService;
  server.intentAnalysisService = authoritativeIntentAnalysisService;
  server.coreAgentExecutionService = authoritativeCoreAgentExecutionService;
  server.accountResolver = accountResolver;
  server.prospectRecordStore = resolvedProspectRecordStore;
  server.agentResultRunStore = resolvedAgentResultRunStore;
  server.businessDemandStore = resolvedBusinessDemandStore;
  server.employmentStore = resolvedEmploymentStore;
  server.cloudDesktopService = cloudDesktopService;
  server.douyinMcpService = douyinMcpService;
  server.douyinAgentCloudRegistry = authoritativeDouyinAgentCloudRegistry;
  server.douyinAccountActionCoordinator = authoritativeDouyinAccountActionCoordinator;
  server.douyinAcquisitionService = authoritativeDouyinAcquisitionService;
  server.douyinAcquisitionEventSink = resolvedAcquisitionEventSink;
  server.douyinInboxAgentService = authoritativeDouyinInboxAgentService;
  server.douyinInboxEventSink = resolvedInboxEventSink;
  server.knowledgeProvider = resolvedKnowledgeProvider;
  server.cloudDesktopMode = cloudDesktopMode;
  server.localBrowserExecutor = localBrowserExecutor;
  server.taskDispatcher = authoritativeControlPlane.taskDispatcher || resolvedTaskDispatcher;
  server.prospectRuns = prospectRuns;
  server.douyinFinderRuns = douyinFinderRuns;
  server.douyinFinderService = authoritativeDouyinFinderService;
  server.officeReplayStore = resolvedOfficeReplayStore;
  server.managedDailyReportService = resolvedManagedDailyReportService;
  server.flushManagedDailyReports = flushManagedDailyReports;
  server.resumePersistedInboxRuntimes = resumePersistedInboxRuntimes;
  server.authenticator = authenticator;
  const reportInterval = Number(managedDailyReportIntervalMs);
  const managedDailyReportTimer = resolvedManagedDailyReportService && Number.isFinite(reportInterval) && reportInterval > 0
    ? setInterval(flushManagedDailyReports, reportInterval)
    : null;
  managedDailyReportTimer?.unref?.();
  const recoveryInterval = Number(inboxRuntimeRecoveryIntervalMs);
  const inboxRuntimeRecoveryTimer = Number.isFinite(recoveryInterval) && recoveryInterval > 0
    ? setInterval(() => { void resumePersistedInboxRuntimes(); }, recoveryInterval)
    : null;
  inboxRuntimeRecoveryTimer?.unref?.();
  queueMicrotask(() => {
    void authoritativeControlPlane.recoverInterruptedAssignments?.();
    void resumePersistedInboxRuntimes();
  });
  if (resolvedManagedDailyReportService) queueMicrotask(flushManagedDailyReports);
  server.once("close", () => {
    if (managedDailyReportTimer) clearInterval(managedDailyReportTimer);
    if (inboxRuntimeRecoveryTimer) clearInterval(inboxRuntimeRecoveryTimer);
  });
  return server;
}

export function startControlPlaneServer({ port = Number(process.env.BYERING_BACKEND_PORT || 6681), host = "127.0.0.1", controlPlane, persistence = null, persistenceDir = process.env.BYERING_PERSISTENCE_DIR, defaultPersistenceDir = join(homedir(), ".byering", "control-plane"), requirementService = createRequirementUnderstandingService(), ...options } = {}) {
  const clueHunterService = options.clueHunterService || createClueHunterService();
  const cloudDesktopService = options.cloudDesktopService || createClueHunterCloudService();
  const douyinMcpService = options.douyinMcpService || createDouyinMcpService();
  const douyinAgentCloudRegistry = Object.hasOwn(options, "douyinAgentCloudRegistry")
    ? options.douyinAgentCloudRegistry
    : createDouyinAgentCloudRegistry({
    stateFile: options.douyinAgentCloudStateFile
      || process.env.BYERING_DOUYIN_AGENT_CLOUD_STATE_FILE
      || join(homedir(), ".byering", "douyin-agent-cloud.json"),
    createService: options.douyinAgentCloudCreateService,
    serviceOptions: options.douyinAgentCloudServiceOptions || {},
    serviceOptionsByAgent: options.douyinAgentCloudServiceOptionsByAgent
      || createDouyinAgentServiceOptionsByAgent(),
    // A production request must eventually surface a failed provider startup
    // instead of re-queuing the same persisted record forever. Keep the
    // registry's library default unbounded for callers that explicitly need
    // provider-owned startup, while the HTTP service gets a bounded default.
    provisioningTimeoutMs: options.douyinProvisioningTimeoutMs != null
      ? Number(options.douyinProvisioningTimeoutMs)
      : Number(process.env.BYERING_DOUYIN_PROVISIONING_TIMEOUT_MS) || 10 * 60 * 1000,
    recoveryTimeoutMs: options.douyinRecoveryTimeoutMs != null
      ? Number(options.douyinRecoveryTimeoutMs)
      : Number(process.env.BYERING_DOUYIN_RECOVERY_TIMEOUT_MS) || 180000
    });
  const douyinInboxAgentService = options.douyinInboxAgentService || null;
  const accountResolver = options.accountResolver || createAccountResolver();
  const prospectService = resolveLegacyPublicDiscoveryService(options, accountResolver);
  const intentAnalysisService = options.intentAnalysisService || createProspectIntentAnalysisService();
  const douyinFinderService = options.douyinFinderService || createDouyinFinderService({ accountResolver });
  const prospectExecutor = options.prospectExecutor || (prospectService
    ? createProspectWorkflowRunner({ prospectService })
    : null);
  const acquisitionEventSink = options.douyinAcquisitionEventSink
    || options.acquisitionEventSink
    || options.activityEventSink
    || null;
  const douyinAcquisitionService = options.douyinAcquisitionService || null;
  const rawAcquisitionOptions = options.douyinAcquisitionServiceOptions || {};
  const {
    prospectService: compatibilityLegacyPublicDiscoveryService,
    legacyPublicDiscoveryService: explicitLegacyPublicDiscoveryService,
    ...acquisitionOptions
  } = rawAcquisitionOptions;
  delete acquisitionOptions.publicReplyExecutor;
  const douyinAcquisitionServiceOptions = {
    accountResolver,
    cloudRegistry: douyinAgentCloudRegistry,
    stateFile: options.douyinAcquisitionStateFile,
    capabilityProbe: options.douyinAcquisitionCapabilityProbe,
    autoResume: options.douyinAcquisitionAutoResume !== false,
    ...acquisitionOptions,
    legacyPublicDiscoveryService: explicitLegacyPublicDiscoveryService
      ?? compatibilityLegacyPublicDiscoveryService
      ?? options.douyinLegacyPublicDiscoveryService
      ?? null
  };
  const cloudDesktopMode = options.cloudDesktopMode || process.env.BYERING_CLOUD_DESKTOP_MODE || "local";
  const resolvedPersistenceDir = persistenceDir || defaultPersistenceDir;
  const durablePersistence = controlPlane ? null : (persistence || new FilePersistenceAdapter({
    filePath: join(resolvedPersistenceDir, "control-plane.json")
  }));
  const browserProfileRoot = options.browserProfileRoot
    || process.env.BYERING_BROWSER_PROFILE_ROOT
    || join(homedir(), ".byering", "browser-workspaces");
  const browserSessionRegistryPath = options.browserSessionRegistryPath
    || process.env.BYERING_BROWSER_SESSION_REGISTRY
    || join(browserProfileRoot, "sessions.json");
  const browserWorkspace = options.browserWorkspace || createBrowserWorkspaceService({
    rootDir: browserProfileRoot,
    sessionRegistryPath: browserSessionRegistryPath
  });
  const localBrowserExecutor = options.localBrowserExecutor || (cloudDesktopMode === "local"
    ? createLocalBrowserExecutor({ browserWorkspace })
    : null);
  const taskDispatcher = options.taskDispatcher === undefined ? null : options.taskDispatcher;
  const prospectRuns = new Map();
  const server = createControlPlaneHttpServer({
    ...options,
    persistence: durablePersistence,
    clueHunterService,
    prospectService,
    legacyPublicDiscoveryService: prospectService,
    intentAnalysisService,
    accountResolver,
    prospectExecutor,
    taskDispatcher,
    cloudDesktopService,
    douyinMcpService,
    douyinInboxAgentService,
    douyinAgentCloudRegistry,
    douyinAcquisitionService,
    douyinAcquisitionServiceOptions,
    acquisitionEventSink,
    cloudDesktopMode,
    controlPlane: controlPlane || null,
    browserWorkspace,
    localBrowserExecutor,
    prospectRuns,
    douyinFinderService,
    douyinFinderRuns: options.douyinFinderRuns || new Map(),
    ...(controlPlane ? {} : { requirementService })
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.removeListener("error", reject);
      resolve(server);
    });
  });
}

async function route(request, response, controlPlane, browserWorkspace, clueHunterService, prospectService, allowedOrigins, bodyLimit, security = {}) {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  const principal = security.principal || anonymousPrincipal();
  setCorsHeaders(response, request.headers.origin, allowedOrigins);
  if (request.method === "OPTIONS") return sendJson(response, 204, null);
  if (request.method === "GET" && url.pathname === "/v1/office/status") {
    response.setHeader("Cache-Control", "no-store");
    return sendJson(response, 200, await (security.readOfficeStatusLive || security.readOfficeStatus)(principal.tenantId || null));
  }
  if (request.method === "GET" && url.pathname === "/v1/results") {
    response.setHeader("Cache-Control", "no-store");
    const limit = parseNonNegativeInteger(url.searchParams.get("limit"), 100);
    return sendJson(response, 200, {
      observedAt: new Date().toISOString(),
      runs: security.listCanonicalResults?.(principal.tenantId || null, { limit }) || [],
      prospects: security.prospectRecordStore?.list(principal.tenantId || null) || []
    });
  }
  if (url.pathname === "/v1/business-demands") {
    const store = security.businessDemandStore;
    if (!store || typeof store.create !== "function" || typeof store.list !== "function") {
      throw new ControlPlaneError("业务需求存储未配置", { code: "BUSINESS_DEMAND_STORE_UNAVAILABLE", statusCode: 503 });
    }
    if (request.method === "GET") {
      return sendJson(response, 200, {
        accepted: true,
        data: { demands: store.list(principal.tenantId || null, { status: optionalText(url.searchParams.get("status")), limit: parseNonNegativeInteger(url.searchParams.get("limit"), 100) }) }
      });
    }
    if (request.method === "POST") {
      const body = withTenantScope(await readJson(request, bodyLimit), principal);
      const agentId = requiredText(body.agentId, "agentId");
      const accountId = requiredText(body.accountId, "accountId");
      if (agentId !== "mkt-live-danmaku-outreach") {
        throw new ControlPlaneError("当前业务需求入口只接受直播间私信触达需求", { code: "BUSINESS_DEMAND_AGENT_INVALID", statusCode: 400 });
      }
      const demand = store.create(principal.tenantId || null, {
        kind: optionalText(body.kind) || "live_outreach_capacity",
        agentId,
        agentName: optionalText(body.agentName) || "直播追单助理",
        accountId,
        accountName: optionalText(body.accountName) || "当前抖音账号",
        sentCount: parseNonNegativeInteger(body.sentCount ?? body.sent_count, 0),
        quotaCode: optionalText(body.quotaCode ?? body.quota_code),
        clientRequestId: optionalText(body.clientRequestId ?? body.client_request_id)
      });
      return sendJson(response, 201, { accepted: true, data: { demand } });
    }
  }
  if (request.method === "PUT" && url.pathname === "/v1/results/runs") {
    if (!security.agentResultRunStore || typeof security.agentResultRunStore.upsert !== "function") {
      throw new ControlPlaneError("Agent 结果账本未配置", { code: "RESULT_RUN_STORE_UNAVAILABLE", statusCode: 503 });
    }
    const body = await readJson(request, bodyLimit);
    if (!Array.isArray(body?.runs)) {
      throw new ControlPlaneError("runs 必须是数组", { code: "RESULT_RUNS_INVALID", statusCode: 400 });
    }
    const accepted = security.agentResultRunStore.upsert(principal.tenantId || null, body.runs);
    return sendJson(response, 200, { runs: accepted });
  }
  if (url.pathname === "/v1/employment") {
    if (!security.employmentStore || typeof security.employmentStore.list !== "function") {
      throw new ControlPlaneError("雇佣合同存储未配置", { code: "EMPLOYMENT_STORE_UNAVAILABLE", statusCode: 503 });
    }
    if (request.method === "GET") {
      return sendJson(response, 200, {
        accepted: true,
        data: { contracts: security.employmentStore.list(principal.tenantId || null) }
      });
    }
    if (request.method === "POST") {
      const body = await readJson(request, bodyLimit);
      const contract = security.employmentStore.hire(principal.tenantId || null, body);
      return sendJson(response, 201, {
        accepted: true,
        data: { contract, contracts: security.employmentStore.list(principal.tenantId || null) }
      });
    }
  }
  if (request.method === "POST" && url.pathname === "/v1/core-agent-executions") {
    if (!security.coreAgentExecutionService || typeof security.coreAgentExecutionService.lease !== "function") {
      throw new ControlPlaneError("核心执行 MCP 未配置", {
        code: "CORE_AGENT_EXECUTION_NOT_CONFIGURED",
        statusCode: 503
      });
    }
    let requested = prepareCoreAgentExecutionRequest(
      withTenantScope(await readJson(request, bodyLimit), principal),
      { prospectRecordStore: security.prospectRecordStore, principal }
    );
    requested = await security.preflightCoreExecution?.(requested, principal) || requested;
    requested = attachVerifiedInboxPlan(security, requested);
    const contract = requireActiveCoreAgentEmployment(security.employmentStore, principal, requested.agentId);
    const durableTask = ensureCoreExecutionTask(controlPlane, requested, principal, security);
    const body = {
      ...requested,
      taskId: durableTask.taskId,
      taskRunId: requested.taskRunId || durableTask.taskRunId,
      conversationId: requested.conversationId || durableTask.conversationId,
      employment: contract
    };
    const finishOffice = security.officeOperations.begin({
      tenantId: principal.tenantId || null,
      agentId: body.agentId,
      taskId: body.taskId,
      taskRunId: body.taskRunId,
      goal: body.goal,
      accountId: body.accountKey || body.accountId || null,
      accountKey: body.accountKey || body.accountId || null
    });
    let result;
    try {
      result = await security.coreAgentExecutionService.lease(body);
      result = {
        ...result,
        taskId: body.taskId,
        taskRunId: body.taskRunId,
        conversationId: body.conversationId,
        agentId: body.agentId
      };
      finishOffice(result?.status || "unknown", result);
    } catch (error) {
      finishOffice("failed");
      throw error;
    }
    return sendConnectorResult(response, controlPlane, result, {
      taskId: body.taskId,
      tenantId: body.tenantId || principal.tenantId || null,
      source: "core-agent-execution"
    });
  }
  const employmentMatch = url.pathname.match(/^\/v1\/employment\/([^/]+)(?:\/(assign|welcome))?$/);
  if (employmentMatch) {
    if (!security.employmentStore || typeof security.employmentStore.list !== "function") {
      throw new ControlPlaneError("雇佣合同存储未配置", { code: "EMPLOYMENT_STORE_UNAVAILABLE", statusCode: 503 });
    }
    const agentId = decodeURIComponent(employmentMatch[1]);
    const operation = employmentMatch[2] || null;
    if (request.method === "DELETE" && !operation) {
      const contract = security.employmentStore.terminate(principal.tenantId || null, agentId);
      return sendJson(response, 200, {
        accepted: true,
        data: { contract, contracts: security.employmentStore.list(principal.tenantId || null) }
      });
    }
    if (request.method === "PUT" && operation === "assign") {
      const body = await readJson(request, bodyLimit);
      const contract = security.employmentStore.assign(principal.tenantId || null, agentId, body.projectId);
      return sendJson(response, 200, {
        accepted: true,
        data: { contract, contracts: security.employmentStore.list(principal.tenantId || null) }
      });
    }
    if (request.method === "POST" && operation === "welcome") {
      const contract = security.employmentStore.markWelcome(principal.tenantId || null, agentId);
      return sendJson(response, 200, {
        accepted: true,
        data: { contract, contracts: security.employmentStore.list(principal.tenantId || null) }
      });
    }
  }
  const artifactDownloadMatch = url.pathname.match(/^\/v1\/artifacts\/([^/]+)\/download$/);
  if (request.method === "GET" && artifactDownloadMatch) {
    const artifactId = decodeURIComponent(artifactDownloadMatch[1]);
    const artifact = security.managedDailyReportService?.findArtifact({
      artifactId,
      tenantId: principal.tenantId || null
    });
    if (!artifact) {
      throw new ControlPlaneError("找不到任务产出文件", { code: "TASK_ARTIFACT_NOT_FOUND", statusCode: 404 });
    }
    const fileName = String(artifact.name || "task-artifact.html").replace(/[\r\n"]/g, "_");
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": artifact.mimeType || "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`
    });
    response.end(String(artifact.content || ""));
    return;
  }
  const artifactMatch = url.pathname.match(/^\/v1\/artifacts\/([^/]+)$/);
  if (request.method === "DELETE" && artifactMatch) {
    const body = await readJson(request, bodyLimit);
    if (body?.confirm !== true) {
      throw new ControlPlaneError("删除任务产出文件前需要明确确认", {
        code: "TASK_ARTIFACT_DELETE_CONFIRMATION_REQUIRED",
        statusCode: 400
      });
    }
    if (!security.managedDailyReportService || typeof security.managedDailyReportService.removeArtifact !== "function") {
      throw new ControlPlaneError("任务产出文件存储不支持删除", {
        code: "TASK_ARTIFACT_DELETE_UNAVAILABLE",
        statusCode: 503
      });
    }
    const artifactId = decodeURIComponent(artifactMatch[1]);
    return sendJson(response, 200, security.managedDailyReportService.removeArtifact({
      artifactId,
      tenantId: principal.tenantId || null
    }));
  }
  if (request.method === "GET" && artifactMatch) {
    const artifactId = decodeURIComponent(artifactMatch[1]);
    const artifact = security.managedDailyReportService?.findArtifact({
      artifactId,
      tenantId: principal.tenantId || null
    });
    if (!artifact) {
      throw new ControlPlaneError("找不到任务产出文件", { code: "TASK_ARTIFACT_NOT_FOUND", statusCode: 404 });
    }
    response.setHeader("Cache-Control", "no-store");
    return sendJson(response, 200, { accepted: true, artifact });
  }
  if (request.method === "PUT" && url.pathname === "/v1/results/prospects") {
    const body = await readJson(request, bodyLimit);
    if (!Array.isArray(body?.records)) {
      throw new ControlPlaneError("records 必须是数组", { code: "RESULT_PROSPECTS_INVALID", statusCode: 400 });
    }
    const prospects = security.prospectRecordStore.upsert(principal.tenantId || null, body.records);
    return sendJson(response, 200, { prospects });
  }
  if (request.method === "DELETE" && url.pathname === "/v1/results/prospects") {
    if (!security.prospectRecordStore || typeof security.prospectRecordStore.remove !== "function") {
      throw new ControlPlaneError("潜客结果存储不支持清理", { code: "RESULT_PROSPECTS_DELETE_UNAVAILABLE", statusCode: 503 });
    }
    const body = await readJson(request, bodyLimit);
    const ids = Array.isArray(body?.ids)
      ? [...new Set(body.ids.map((id) => String(id || "").trim()).filter(Boolean))]
      : [];
    if (!ids.length && body?.confirmAll !== true) {
      throw new ControlPlaneError("清空全部潜客前需要明确确认", {
        code: "RESULT_PROSPECTS_CLEAR_CONFIRMATION_REQUIRED",
        statusCode: 400
      });
    }
    return sendJson(response, 200, security.prospectRecordStore.remove(principal.tenantId || null, ids.length ? ids : null));
  }
  if (request.method === "GET" && url.pathname === "/v1/office/replay") {
    response.setHeader("Cache-Control", "no-store");
    return sendJson(response, 200, security.officeReplayStore.list({
      tenantId: principal.tenantId || null,
      agentId: requiredText(url.searchParams.get("agentId"), "agentId"),
      taskId: optionalText(url.searchParams.get("taskId")),
      limit: parseNonNegativeInteger(url.searchParams.get("limit"), 8),
      latestOnly: url.searchParams.get("latestOnly") !== "0",
      successfulOnly: url.searchParams.get("successfulOnly") === "1"
    }));
  }
  if (request.method === "GET" && url.pathname === "/v1/office/replay/image") {
    const image = security.officeReplayStore.image({
      tenantId: principal.tenantId || null,
      agentId: requiredText(url.searchParams.get("agentId"), "agentId"),
      snapshotId: requiredText(url.searchParams.get("snapshotId"), "snapshotId")
    });
    if (!image) throw new ControlPlaneError("这张工作画面已经过期", { code: "OFFICE_REPLAY_SNAPSHOT_NOT_FOUND", statusCode: 404 });
    response.statusCode = 200;
    response.setHeader("Content-Type", image.contentType);
    response.setHeader("Content-Length", image.body.length);
    response.setHeader("Cache-Control", "private, no-store");
    return response.end(image.body);
  }
  if (request.method === "GET" && url.pathname === "/v1/office/replay/video") {
    const video = security.officeReplayStore.video({
      tenantId: principal.tenantId || null,
      agentId: requiredText(url.searchParams.get("agentId"), "agentId"),
      segmentId: requiredText(url.searchParams.get("segmentId"), "segmentId")
    });
    if (!video) throw new ControlPlaneError("这段工作画面已经过期", { code: "OFFICE_REPLAY_VIDEO_NOT_FOUND", statusCode: 404 });
    response.statusCode = 200;
    response.setHeader("Content-Type", video.contentType);
    response.setHeader("Content-Length", video.body.length);
    response.setHeader("Cache-Control", "private, no-store");
    return response.end(video.body);
  }
  if (request.method === "POST" && url.pathname === "/v1/office/replay/snapshot") {
    const body = await readJson(request, Math.max(bodyLimit, 1_500_000));
    const saved = security.officeReplayStore.capture({
      tenantId: principal.tenantId || null,
      agentId: requiredText(body.agentId, "agentId"),
      taskId: optionalText(body.taskId),
      taskRunId: optionalText(body.taskRunId),
      eventKey: requiredText(body.eventKey, "eventKey"),
      title: requiredText(body.title, "title"),
      detail: optionalText(body.detail) || "",
      imageData: requiredText(body.imageData, "imageData")
    });
    return sendJson(response, 201, saved);
  }
  if (request.method === "POST" && url.pathname === "/v1/office/replay/video") {
    const videoData = await readBinaryBody(request, Math.max(bodyLimit, 8 * 1024 * 1024));
    const saved = security.officeReplayStore.captureVideo({
      tenantId: principal.tenantId || null,
      agentId: requiredText(url.searchParams.get("agentId"), "agentId"),
      taskId: optionalText(url.searchParams.get("taskId")),
      taskRunId: optionalText(url.searchParams.get("taskRunId")),
      recordingId: requiredText(url.searchParams.get("recordingId"), "recordingId"),
      title: requiredText(url.searchParams.get("title"), "title"),
      detail: optionalText(url.searchParams.get("detail")) || "",
      outcome: optionalText(url.searchParams.get("outcome")) || "unknown",
      durationMs: parseNonNegativeInteger(url.searchParams.get("durationMs"), 5_000),
      videoData
    });
    return sendJson(response, 201, saved);
  }
  if (request.method === "POST" && url.pathname === "/v1/office/replay/task") {
    const body = await readJson(request, bodyLimit);
    return sendJson(response, 200, security.officeReplayStore.markTask({
      tenantId: principal.tenantId || null,
      agentId: requiredText(body.agentId, "agentId"),
      taskId: requiredText(body.taskId, "taskId"),
      recordingId: optionalText(body.recordingId),
      outcome: requiredText(body.outcome, "outcome")
    }));
  }
  if (request.method === "DELETE" && url.pathname === "/v1/office/replay") {
    if (!security.officeReplayStore || typeof security.officeReplayStore.purge !== "function") {
      throw new ControlPlaneError("工作回放存储不支持清理", { code: "OFFICE_REPLAY_PURGE_UNAVAILABLE", statusCode: 503 });
    }
    const body = await readJson(request, bodyLimit);
    const taskId = optionalText(body.taskId);
    if (!taskId && body.confirmAll !== true) {
      throw new ControlPlaneError("清空全部工作回放前需要明确确认", {
        code: "OFFICE_REPLAY_CLEAR_CONFIRMATION_REQUIRED",
        statusCode: 400
      });
    }
    return sendJson(response, 200, security.officeReplayStore.purge({
      tenantId: principal.tenantId || null,
      agentId: requiredText(body.agentId, "agentId"),
      taskId
    }));
  }
  if (url.pathname === "/v1/agents/companion") {
    const agentId = requiredText(url.searchParams.get("agentId"), "agentId");
    const owner = directMessageOwner(agentId, principal, optionalText(url.searchParams.get("accountId")));
    if (request.method === "GET") return sendJson(response, 200, security.companion.get(owner));
    const body = await readJson(request, bodyLimit);
    if (request.method === "PUT") return sendJson(response, 200, security.companion.update(owner, body));
    if (request.method === "PATCH") return sendJson(response, 200, security.companion.edit(owner, body));
    if (request.method === "DELETE") return sendJson(response, 200, security.companion.forget(owner, { ...body, memoryId: url.searchParams.get("memoryId"), reset: url.searchParams.get("reset") === "1" }));
  }
  if (request.method === "POST" && url.pathname === "/v1/direct-messages/action") {
    const body = await readJson(request, bodyLimit);
    const owner = directMessageOwner(requiredText(body.agentId, "agentId"), principal, optionalText(body.accountId));
    if (body.optionId === "undo-memory") return sendJson(response, 200, security.companion.undoMemory(owner, body));
    return sendJson(response, 200, security.companion.action(owner, body));
  }
  if (request.method === "POST" && url.pathname === "/v1/direct-messages/retry") {
    const body = await readJson(request, bodyLimit);
    const owner = directMessageOwner(requiredText(body.agentId, "agentId"), principal, optionalText(body.accountId));
    const message = security.agentStore.listDm(scopedDirectMessageAgentId(owner.agentId, principal, optionalText(body.accountId))).find(item => item.id === body.messageId && item.from === "user");
    if (!message) throw new ControlPlaneError("这条消息已经找不到了", { statusCode: 404 });
    void security.companion.reply(owner, message).catch(() => {});
    return sendJson(response, 202, { accepted: true });
  }
  if (request.method === "GET" && url.pathname === "/healthz") {
    const douyinMcpConfigured = security.douyinMcpService?.configured === true
      || security.douyinAgentCloudRegistry?.configured === true;
    const clueHunterCloudConfigured = security.cloudDesktopService?.configured === true;
    const cloudDesktopConfigured = clueHunterCloudConfigured || douyinMcpConfigured;
    const agentExecutionArchitecture = security.douyinAcquisitionService?.executionArchitecture?.() || null;
    const authorizedAccountExecutionReady = agentExecutionArchitecture?.authorizedAccountExecution?.configured === true
      || douyinMcpConfigured;
    const taskDispatchReady = controlPlane?.taskDispatcher?.configured === true;
    const coreAgentExecutionReady = security.coreAgentExecutionService?.configured === true;
    // Core Agent execution must not inherit the readiness of an opt-in legacy data connector.
    const executionReady = authorizedAccountExecutionReady;
    const executionSources = [
      douyinMcpConfigured ? "douyin-execution-mcp" : null,
      coreAgentExecutionReady ? "core-agent-execution" : null,
      clueHunterService?.configured === true ? "cluehunter" : null,
      security.localBrowserExecutor?.configured === true ? "local-browser" : null,
      prospectService?.configured === true ? "legacy-public-collection" : null,
      security.douyinFinderService?.configured === true ? "douyin-agent-data-api" : null,
      security.intentAnalysisService?.configured === true ? "intent-analysis" : null
    ].filter(Boolean);
    return sendJson(response, 200, {
      ok: true,
      executionReady,
      taskDispatchReady,
      legacyPublicDiscoveryReady: prospectService?.configured === true,
      accountResolverReady: security.accountResolver?.configured === true,
      capabilities: {
        accountResolution: security.accountResolver?.configured === true,
        legacyPublicCommentCollection: prospectService?.configured === true,
        legacyPublicCommentCallbacks: prospectService?.configured === true,
        douyinFinder: security.douyinFinderService?.configured === true,
        accountAnalysis: security.accountAnalysisService?.configured === true,
        candidateIntentAnalysis: security.intentAnalysisService?.configured === true,
        candidateIntentAnalysisModel: security.intentAnalysisService?.modelConfigured === true,
        douyinFinderAccountValidation: security.douyinFinderService?.configured === true,
        douyinFinderAccountDiscovery: security.douyinFinderService?.discoveryConfigured === true,
        cloudDesktopProvisioning: cloudDesktopConfigured,
        douyinMcp: douyinMcpConfigured,
        coreAgentExecution: coreAgentExecutionReady,
        douyinInboxAgent: security.douyinInboxAgentService?.configured === true,
        douyinInboxReplyModel: security.douyinInboxAgentService?.modelConfigured === true
      },
      cloudDesktopConfigured,
      cloudDesktopReady: cloudDesktopConfigured,
      rpaConnectionReady: cloudDesktopConfigured,
      cloudDesktopMode: security.cloudDesktopMode || "local",
      localBrowserExecution: security.localBrowserExecutor?.configured === true,
      cloudDesktopProvider: douyinMcpConfigured ? "douyin-mcp" : (clueHunterCloudConfigured ? "cluehunter" : null),
      cloudDesktopMissing: clueHunterCloudConfigured ? (security.cloudDesktopService?.missing || []) : [],
      douyinMcpConfigured,
      agentExecutionArchitecture,
      executionSource: executionSources.length ? executionSources.join("+") : null
    });
  }

  if (url.pathname === "/v1/accounts/reception" || url.pathname === "/v1/accounts/reception/preview" || url.pathname === "/v1/accounts/reception/conversations") {
    const body = request.method === "GET" ? {} : await readJson(request, bodyLimit);
    const requestedId = requiredText(body.accountId || url.searchParams.get("accountId"), "accountId");
    const records = security.douyinAgentCloudRegistry?.list?.() || [];
    const record = records.find(record => {
      if (principal?.tenantId && record.tenantId !== principal.tenantId) return false;
      return [record.accountId, record.agentId && `douyin-agent:${record.agentId}`, ...receptionAccountKeys(record.accountIdentity)]
        .filter(Boolean)
        .map(String)
        .includes(requestedId);
    });
    if (!record?.accountIdentity) throw new ControlPlaneError("未找到当前用户已绑定的抖音账号", { code: "RECEPTION_ACCOUNT_NOT_FOUND", statusCode: 404 });
    const owner = { tenantId: principal?.tenantId || null, account: record.accountIdentity };
    const store = security.accountReceptionStore;
    if (url.pathname.endsWith("/preview") && request.method === "POST") {
      return sendJson(response, 200, await previewReception({ settings: body.settings || store.get(owner).settings, message: body.message, history: body.history, instant: body.instant ?? Date.now() }));
    }
    if (url.pathname.endsWith("/conversations")) {
      if (request.method === "GET") return sendJson(response, 200, { conversations: store.conversations(owner) });
      if (request.method === "POST") return sendJson(response, 200, store.control(owner, requiredText(body.customerId, "customerId"), body.mode));
    } else {
      if (request.method === "GET") return sendJson(response, 200, store.get(owner));
      if (request.method === "PUT") return sendJson(response, 200, store.save(owner, body.settings, body.expectedRevision));
      if (request.method === "DELETE") {
        if (body.confirm !== true || !Number.isInteger(body.expectedRevision)) {
          throw new ControlPlaneError("清空接待策略前需要确认并携带当前版本", {
            code: "RECEPTION_CLEAR_CONFIRMATION_REQUIRED",
            statusCode: 400
          });
        }
        return sendJson(response, 200, store.clear(owner, body.expectedRevision));
      }
    }
    throw new ControlPlaneError("不支持的接待操作", { statusCode: 405 });
  }

  if (request.method === "POST" && url.pathname === "/v1/agents/account-analysis/run") {
    const body = withTenantScope(await readJson(request, bodyLimit), principal);
    return sendJson(response, 202, scheduleAccountAnalysisRun({ security, principal, body }));
  }
  const accountAnalysisMatch = url.pathname.match(/^\/v1\/agents\/account-analysis\/runs\/([^/]+)$/);
  if (request.method === "GET" && accountAnalysisMatch) {
    const key = `${principal?.tenantId || "local"}:${decodeURIComponent(accountAnalysisMatch[1])}`;
    const result = security.accountAnalysisRuns.get(key);
    if (!result) throw new ControlPlaneError("分析任务不存在", { code: "ACCOUNT_ANALYSIS_NOT_FOUND", statusCode: 404 });
    return sendJson(response, 200, result);
  }

  if (request.method === "POST" && url.pathname === "/v1/connectors/douyin-finder/run") {
    const finderService = security.douyinFinderService;
    if (!finderService || typeof finderService.run !== "function" || finderService.configured === false) {
      throw new ControlPlaneError("抖音找人数据服务未配置", {
        code: "DOUYIN_FINDER_NOT_CONFIGURED",
        statusCode: 503
      });
    }
    const body = withTenantScope(await readJson(request, bodyLimit), principal);
    const finderGoal = optionalText(body.goal || body.query || body.requirements || body.userRequirements) || "";
    const accountContext = body.accountContext && typeof body.accountContext === "object" ? body.accountContext : {};
    const businessAccountUrl = optionalText(
      accountContext.businessAccountUrl
      || accountContext.businessAccount?.profileUrl
      || body.businessAccountUrl
    ) || "";
    const requiresBusinessAccount = publicFinderNeedsBusinessAccount({
      purposeIds: body.choices?.finderPublicPurpose?.selected,
      query: body.publicFinderQuery || body.query,
      goal: finderGoal
    });
    const businessAccountError = validatePublicFinderBusinessAccount({
      required: requiresBusinessAccount,
      businessAccountUrl
    });
    if (businessAccountError) {
      throw new ControlPlaneError(businessAccountError, {
        code: businessAccountUrl ? "DOUYIN_FINDER_BUSINESS_ACCOUNT_INVALID" : "DOUYIN_FINDER_BUSINESS_ACCOUNT_REQUIRED",
        statusCode: 400,
        details: { required: true }
      });
    }
    const taskId = optionalText(body.taskId || body.task_id) || `finder-${randomUUID()}`;
    const taskRunId = optionalText(body.taskRunId || body.task_run_id || body.runId || body.run_id) || `run-${randomUUID()}`;
    const startedAt = new Date().toISOString();
    const running = {
      source: "douyin-agent-data",
      status: "RUNNING",
      started: true,
      stage: "queued",
      taskId,
      taskRunId,
      goal: finderGoal,
      counts: { input: 0, discovered: 0, screened: 0, resolved: 0, enriched: 0, qualified: 0, delivered: 0, matched: 0, failed: 0 },
      accounts: [],
      errors: [],
      startedAt,
      updatedAt: startedAt
    };
    if (security.douyinFinderRuns instanceof Map) {
      security.douyinFinderRuns.set(taskId, running);
      while (security.douyinFinderRuns.size > 100) security.douyinFinderRuns.delete(security.douyinFinderRuns.keys().next().value);
    }
    const onProgress = (progress = {}) => {
      if (!(security.douyinFinderRuns instanceof Map)) return;
      const current = security.douyinFinderRuns.get(taskId) || running;
      security.douyinFinderRuns.set(taskId, {
        ...current,
        status: "RUNNING",
        stage: optionalText(progress.stage) || current.stage,
        message: optionalText(progress.message) || current.message,
        counts: { ...(current.counts || {}), ...(progress.counts || {}) },
        updatedAt: new Date().toISOString()
      });
    };
    const finderAgentId = "mkt-find-people";
    const finishOffice = security.officeOperations.begin({ tenantId: principal.tenantId || null,
      agentId: finderAgentId, taskId, taskRunId, goal: running.goal });
    Promise.resolve()
      .then(() => finderService.run(applyCompanionExecution({ ...body, taskId, taskRunId, onProgress }, security.companion.context({ agentId: finderAgentId, tenantId: principal.tenantId || null }, body.goal || body.query || ""))))
      .then((result) => {
        finishOffice(result.status || "completed", result);
        if (!(security.douyinFinderRuns instanceof Map)) return;
        security.douyinFinderRuns.set(taskId, { ...result, taskId, taskRunId, startedAt, updatedAt: new Date().toISOString() });
      })
      .catch((error) => {
        finishOffice("failed");
        if (!(security.douyinFinderRuns instanceof Map)) return;
        security.douyinFinderRuns.set(taskId, {
          ...running,
          status: "FAILED",
          stage: "failed",
          error: { code: error?.code || "DOUYIN_FINDER_RUN_FAILED", message: error?.message || "抖音找人任务执行失败" },
          errors: [{ capability: "finder.run", code: error?.code || "DOUYIN_FINDER_RUN_FAILED", message: error?.message || "抖音找人任务执行失败" }],
          updatedAt: new Date().toISOString()
        });
      });
    return sendJson(response, 202, { accepted: true, ...running });
  }

  const douyinFinderRunMatch = url.pathname.match(/^\/v1\/connectors\/douyin-finder\/runs\/([^/]+)$/);
  if (request.method === "GET" && douyinFinderRunMatch) {
    const taskId = decodeURIComponent(douyinFinderRunMatch[1]);
    const run = security.douyinFinderRuns?.get(taskId);
    if (!run) throw new ControlPlaneError("找不到抖音找人任务", {
      code: "DOUYIN_FINDER_RUN_NOT_FOUND",
      statusCode: 404,
      details: { taskId }
    });
    return sendJson(response, 200, run);
  }

  if (request.method === "GET" && url.pathname === "/v1/knowledge/context") {
    const agentId = optionalText(url.searchParams.get("agentId") || url.searchParams.get("agent_id")) || COMPREHENSIVE_ACQUISITION_AGENT_ID;
    const result = await security.knowledgeProvider?.({ agentId });
    return sendJson(response, 200, {
      ok: true,
      agentId,
      entries: Array.isArray(result?.entries) ? result.entries : [],
      context: optionalText(result?.context) || ""
    });
  }

  const acquisitionService = security.douyinAcquisitionService;
  if (request.method === "GET" && url.pathname === "/v1/douyin/acquisition/tasks") {
    requireAcquisitionService(acquisitionService);
    const requestedAgentId = optionalText(url.searchParams.get("agentId") || url.searchParams.get("agent_id"));
    const requestedTaskId = optionalText(url.searchParams.get("taskId") || url.searchParams.get("task_id"));
    const requestedTaskRunId = optionalText(url.searchParams.get("taskRunId") || url.searchParams.get("task_run_id"));
    const requestedConversationId = optionalText(url.searchParams.get("conversationId") || url.searchParams.get("conversation_id"));
    const requestedAccountId = optionalText(url.searchParams.get("accountId") || url.searchParams.get("account_id"));
    const tenantId = optionalText(principal?.tenantId);
    const tasks = acquisitionService.listTasks()
      .filter((task) => {
        const context = task?.context || {};
        const taskTenantId = optionalText(context.tenantId || task.tenantId);
        return (!tenantId || taskTenantId === tenantId)
          && (!requestedAgentId || optionalText(context.agentId || task.agentId) === requestedAgentId)
          && (!requestedTaskId || optionalText(context.taskId || task.taskId) === requestedTaskId)
          && (!requestedTaskRunId || optionalText(context.taskRunId || task.taskRunId) === requestedTaskRunId)
          && (!requestedConversationId || optionalText(context.conversationId || task.conversationId) === requestedConversationId)
          && (!requestedAccountId || optionalText(context.accountId || task.accountId) === requestedAccountId);
      })
      .sort((left, right) => {
        const rightTimestamp = Date.parse(right?.updatedAt || right?.createdAt || "") || 0;
        const leftTimestamp = Date.parse(left?.updatedAt || left?.createdAt || "") || 0;
        return rightTimestamp - leftTimestamp;
      })
      .map(mapAcquisitionTaskSummary);
    response.setHeader("Cache-Control", "private, no-store");
    return sendJson(response, 200, { accepted: true, data: { tasks } });
  }
  if (request.method === "POST" && url.pathname === "/v1/douyin/acquisition/tasks") {
    requireAcquisitionService(acquisitionService);
    const body = withTenantScope(await readJson(request, bodyLimit), principal);
    const context = validateAcquisitionContext(body.context || body);
    assertCoreGatewayForProductExecution(security, context.agentId, "start");
    const config = stripAcquisitionSecrets(body.config || {});
    await assertAcquisitionLoginReady(security, { ...context, config });
    security.assertDouyinAccountAgentAvailable?.({
      tenantId: context.tenantId || principal?.tenantId || null,
      agentId: acquisitionRuntimeAgentId(context),
      accountIdentity: config.accountIdentity || null,
      accountId: context.accountId
    });
    if (context.agentId === "mkt-comment-acquisition") config.approvalMode = "auto";
    const task = await acquisitionService.createTask({ ...context, tenantId: principal?.tenantId || body.tenantId || null }, config);
    return sendJson(response, 201, redactAcquisition(task));
  }
  if (request.method === "POST" && url.pathname === "/v1/douyin/acquisition/events") {
    const body = withTenantScope(await readJson(request, bodyLimit), principal);
    const event = validateAcquisitionEvent(body);
    if (isAcquisitionConfigurationEvent(event.type)) {
      throw new ControlPlaneError("获客配置更新只能由内部获客服务提交", {
        code: "DOUYIN_ACQUISITION_CONFIG_EVENT_INTERNAL_ONLY",
        statusCode: 403
      });
    }
    const eventId = event.eventId || event.id || stableAcquisitionEvent(event);
    if (security.acquisitionEventIds?.has(eventId)) return sendJson(response, 200, { accepted: false, duplicate: true, eventId });
    security.acquisitionEventIds?.add(eventId);
    const ingested = typeof controlPlane?.ingestExecutionEvents === "function"
      ? controlPlane.ingestExecutionEvents({ taskId: event.taskId, tenantId: principal.tenantId, source: "douyin-acquisition", events: [{ ...event, eventId }] })
      : { acceptedCount: 0, duplicateCount: 0, currentSeq: null };
    return sendJson(response, 202, redactAcquisition({ accepted: true, duplicate: false, eventId, ingested }));
  }
  const acquisitionMatch = url.pathname.match(/^\/v1\/douyin\/acquisition\/tasks\/([^/]+)(?:\/(preview|start|resume|pause|stop|status|retry|approval|config|configuration|events))?$/);
  if (acquisitionMatch) {
    requireAcquisitionService(acquisitionService);
    const key = decodeURIComponent(acquisitionMatch[1]);
    const operation = acquisitionMatch[2] || "status";
    if (principal?.tenantId) assertAcquisitionServiceTaskTenant(acquisitionService, key, principal);
    if (request.method === "GET" && operation === "status") return sendJson(response, 200, mapAcquisitionTask(acquisitionService.status(key)));
    if (request.method === "GET" && operation === "events") {
      const task = acquisitionService.status(key);
      const afterSeq = parseNonNegativeInteger(url.searchParams.get("afterSeq"), 0);
      const events = (task.events || []).filter((event) => Number(event.seq || 0) > afterSeq);
      return sendJson(response, 200, redactAcquisition({ key, events }));
    }
    if (request.method !== "POST") return sendJson(response, 405, { accepted: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" } });
    const body = await readJson(request, bodyLimit);
    let result;
    if (operation === "preview") {
      const task = acquisitionService.status(key);
      assertCoreGatewayForProductExecution(security, acquisitionRuntimeAgentId(task), "preview");
      if (typeof acquisitionService.preview !== "function") {
        throw new ControlPlaneError("抖音获客服务不支持机会预览", { code: "DOUYIN_ACQUISITION_PREVIEW_UNAVAILABLE", statusCode: 503 });
      }
      result = await acquisitionService.preview(key, body);
    }
    else if (operation === "start") {
      const task = acquisitionService.status(key);
      assertCoreGatewayForProductExecution(security, acquisitionRuntimeAgentId(task), "start");
      await assertAcquisitionLoginReady(security, task);
      security.assertDouyinAccountAgentAvailable?.({
        tenantId: task?.context?.tenantId || principal?.tenantId || null,
        agentId: acquisitionRuntimeAgentId(task),
        accountIdentity: task?.accountIdentity || task?.config?.accountIdentity || task?.context?.accountIdentity || null,
        accountId: task?.context?.accountId
      });
      result = await acquisitionService.start(key, body);
    }
    else if (operation === "resume") {
      const task = acquisitionService.status(key);
      assertCoreGatewayForProductExecution(security, acquisitionRuntimeAgentId(task), "resume");
      result = await acquisitionService.resume(key, body);
    }
    else if (operation === "pause") result = await acquisitionService.pause(key);
    else if (operation === "stop") result = await acquisitionService.stop(key, optionalText(body.reason) || "user_requested");
    else if (operation === "retry") {
      const task = acquisitionService.status(key);
      assertCoreGatewayForProductExecution(security, acquisitionRuntimeAgentId(task), "retry");
      result = await acquisitionService.retry(key, optionalText(body.touchId || body.touch_id));
    }
    else if (operation === "approval") result = await acquisitionApproval(acquisitionService, key, body);
    else if (operation === "config" || operation === "configuration") {
      if (typeof acquisitionService.updateTaskConfig !== "function") {
        throw new ControlPlaneError("抖音获客服务不支持运行时配置更新", { code: "DOUYIN_ACQUISITION_CONFIG_UPDATE_UNAVAILABLE", statusCode: 503 });
      }
      if (!Number.isInteger(Number(body.expectedVersion)) || Number(body.expectedVersion) < 0) {
        throw new ControlPlaneError("获客策略更新必须携带任务版本", { code: "DOUYIN_ACQUISITION_TASK_VERSION_REQUIRED", statusCode: 400 });
      }
      const expectedVersion = Number(body.expectedVersion);
      if (body.payload && typeof body.payload === "object" && !Array.isArray(body.payload)) {
        const nestedExpectedVersion = body.payload.expectedVersion ?? body.payload.taskVersion;
        if (nestedExpectedVersion != null && Number(nestedExpectedVersion) !== expectedVersion) {
          throw new ControlPlaneError("任务版本不一致，请刷新后重试", { code: "DOUYIN_ACQUISITION_TASK_VERSION_MISMATCH", statusCode: 409 });
        }
        result = await acquisitionService.updateTaskConfig(key, { ...body.payload, expectedVersion });
      } else {
        result = await acquisitionService.updateTaskConfig(key, { ...body, expectedVersion });
      }
    }
    else throw new ControlPlaneError("未知的 acquisition 操作", { code: "DOUYIN_ACQUISITION_ACTION_INVALID", statusCode: 400 });
    return sendJson(response, 200, redactAcquisition(mapAcquisitionResult(result)));
  }

  if (request.method === "POST" && url.pathname === "/v1/douyin/mcp/start") {
    const body = await readJson(request, bodyLimit);
    const agentId = douyinAgentId(url, body);
    const cloudScope = douyinCloudScope(url, body, principal);
    const mcp = selectDouyinMcpService(security, agentId, cloudScope);
    if (!mcp?.configured) {
      throw new ControlPlaneError("Douyin MCP 未配置，无法启动云电脑", { code: "DOUYIN_MCP_NOT_CONFIGURED", statusCode: 503 });
    }
    const billingPlan = body.billingPlan || body.billing_plan || "monthly";
    if (!["hourly", "monthly"].includes(billingPlan)) {
      throw new ControlPlaneError("billingPlan 必须是 hourly 或 monthly", { code: "INVALID_BILLING_PLAN", statusCode: 400 });
    }
    const cloudAgentId = resolveDouyinCloudAgentId(agentId);
    const result = security.douyinAgentCloudRegistry && cloudAgentId
      ? await security.douyinAgentCloudRegistry.start(cloudAgentId, { ...cloudScope, billingPlan })
      : await mcp.start({ billingPlan });
    return sendJson(response, 202, result);
  }

  if (request.method === "POST" && url.pathname === "/v1/douyin/mcp/restart") {
    const body = await readJson(request, bodyLimit);
    const agentId = douyinAgentId(url, body);
    const cloudScope = douyinCloudScope(url, body, principal);
    const mcp = selectDouyinMcpService(security, agentId, cloudScope);
    if (!mcp?.configured) {
      throw new ControlPlaneError("Douyin MCP 未配置，无法重启云电脑", { code: "DOUYIN_MCP_NOT_CONFIGURED", statusCode: 503 });
    }
    const billingPlan = body.billingPlan || body.billing_plan || "monthly";
    if (!["hourly", "monthly"].includes(billingPlan)) {
      throw new ControlPlaneError("billingPlan 必须是 hourly 或 monthly", { code: "INVALID_BILLING_PLAN", statusCode: 400 });
    }
    const cloudAgentId = resolveDouyinCloudAgentId(agentId);
    const result = security.douyinAgentCloudRegistry && cloudAgentId
      ? await security.douyinAgentCloudRegistry.restart(cloudAgentId, { ...cloudScope, billingPlan })
      : (await mcp.stop(), await mcp.start({ billingPlan }));
    return sendJson(response, 202, result);
  }

  if (request.method === "POST" && url.pathname === "/v1/douyin/mcp/reauthorize") {
    const body = await readJson(request, bodyLimit);
    const agentId = douyinAgentId(url, body);
    const cloudScope = douyinCloudScope(url, body, principal);
    const mcp = selectDouyinMcpService(security, agentId, cloudScope);
    assertDouyinMcpConfigured(mcp, "重新授权云电脑");
    if (String(body.confirm || "").trim() !== "UNSUBSCRIBE") {
      throw new ControlPlaneError("重新授权前需要确认会清除当前云电脑和抖音登录态，请传 confirm=UNSUBSCRIBE", {
        code: "DOUYIN_UNSUBSCRIBE_CONFIRMATION_REQUIRED",
        statusCode: 400
      });
    }
    const cloudAgentId = resolveDouyinCloudAgentId(agentId);
    const result = security.douyinAgentCloudRegistry && cloudAgentId
      ? await security.douyinAgentCloudRegistry.reauthorize(cloudAgentId, {
          ...cloudScope,
          confirm: body.confirm,
          reason: optionalText(body.reason) || "user_requested"
        })
      : await mcp.unsubscribe({ confirm: body.confirm, reason: optionalText(body.reason) || "user_requested" });
    assertDouyinMcpResult(result, "清除旧 Douyin 云电脑会话失败");
    return sendJson(response, 200, result);
  }

  if (request.method === "GET" && url.pathname === "/v1/douyin/mcp/status") {
    const agentId = douyinAgentId(url);
    const cloudScope = resolvePersistedDouyinCloudScope(
      security.douyinAgentCloudRegistry,
      agentId,
      douyinCloudScope(url, null, principal)
    );
    const mcp = selectDouyinMcpService(security, agentId, cloudScope);
    if (!mcp?.configured) {
      throw new ControlPlaneError("Douyin MCP 未配置，无法查询云电脑状态", { code: "DOUYIN_MCP_NOT_CONFIGURED", statusCode: 503 });
    }
    // The registry is the source of truth for an Agent's persisted session.
    // It reconciles the provider state and updates the durable record, while a
    // direct MCP probe would bypass recovery and surface stale local errors.
    const cloudAgentId = resolveDouyinCloudAgentId(agentId);
    let result = security.douyinAgentCloudRegistry && cloudAgentId
      ? await security.douyinAgentCloudRegistry.status(cloudAgentId, cloudScope)
      : typeof mcp.probeRemoteStatus === "function"
        ? await mcp.probeRemoteStatus()
        : await mcp.status();
    const verifiedAccount = result?.account || null;
    const pendingAccountId = String(cloudScope.accountId || "").trim();
    if (verifiedAccount && pendingAccountId.startsWith("douyin-pending:")
      && typeof security.douyinAgentCloudRegistry?.bindAccountIdentity === "function") {
      const bound = security.douyinAgentCloudRegistry.bindAccountIdentity(
        cloudAgentId,
        cloudScope,
        verifiedAccount,
        optionalText(verifiedAccount.accountName || verifiedAccount.account_name || verifiedAccount.nickname || verifiedAccount.nick_name) || null
      );
      if (bound) result = { ...result, accountId: bound.accountId, accountKey: bound.accountId };
    }
    security.assertDouyinAccountAgentAvailable?.({
      tenantId: principal?.tenantId || null,
      agentId,
      accountIdentity: result?.account || null
    });
    return sendJson(response, 200, { ...result, agentId });
  }

  if (request.method === "POST" && url.pathname === "/v1/douyin/mcp/check-login") {
    const body = await readJson(request, bodyLimit);
    const agentId = douyinAgentId(url, body);
    const cloudScope = resolvePersistedDouyinCloudScope(
      security.douyinAgentCloudRegistry,
      agentId,
      douyinCloudScope(url, body, principal)
    );
    const mcp = selectDouyinMcpService(security, agentId, cloudScope);
    assertDouyinMcpConfigured(mcp, "检查云电脑登录状态");
    if (typeof mcp.checkLoginStatus !== "function") {
      throw new ControlPlaneError("Douyin MCP 不支持显式登录检查", {
        code: "DOUYIN_LOGIN_CHECK_UNAVAILABLE",
        statusCode: 503
      });
    }
    const checked = await mcp.checkLoginStatus({ reqId: optionalText(body.reqId ?? body.req_id) || randomUUID() });
    const cloudAgentId = resolveDouyinCloudAgentId(agentId);
    let result = typeof security.douyinAgentCloudRegistry?.status === "function" && cloudAgentId
      ? await security.douyinAgentCloudRegistry.status(cloudAgentId, { ...cloudScope, resumeSaved: false })
      : checked;
    const verifiedAccount = result?.account || checked?.account || null;
    const pendingAccountId = String(cloudScope.accountId || "").trim();
    if (verifiedAccount && pendingAccountId.startsWith("douyin-pending:")
      && typeof security.douyinAgentCloudRegistry?.bindAccountIdentity === "function") {
      const bound = security.douyinAgentCloudRegistry.bindAccountIdentity(
        cloudAgentId,
        cloudScope,
        verifiedAccount,
        optionalText(verifiedAccount.accountName || verifiedAccount.account_name || verifiedAccount.nickname || verifiedAccount.nick_name) || null
      );
      if (bound) result = { ...result, accountId: bound.accountId, accountKey: bound.accountId };
    }
    security.assertDouyinAccountAgentAvailable?.({
      tenantId: cloudScope.tenantId,
      agentId,
      accountIdentity: result?.account || checked?.account || null,
      accountId: cloudScope.accountId
    });
    return sendJson(response, 200, { ...checked, ...result, agentId });
  }

  if (request.method === "POST" && url.pathname === "/v1/douyin/mcp/open-login") {
    const body = await readJson(request, bodyLimit);
    const agentId = douyinAgentId(url, body);
    const cloudScope = douyinCloudScope(url, body, principal);
    const mcp = selectDouyinMcpService(security, agentId, cloudScope);
    if (!mcp?.configured) {
      throw new ControlPlaneError("Douyin MCP 未配置，无法打开云电脑登录页", { code: "DOUYIN_MCP_NOT_CONFIGURED", statusCode: 503 });
    }
    return sendJson(response, 200, await mcp.openLogin({
      force: body.force === true,
      wantQr: body.wantQr !== false
    }));
  }

  if (request.method === "GET" && url.pathname === "/v1/douyin/mcp/view-link") {
    const agentId = douyinAgentId(url);
    const cloudScope = douyinCloudScope(url, null, principal);
    const mcp = selectDouyinMcpService(security, agentId, cloudScope);
    if (!mcp?.configured) {
      throw new ControlPlaneError("Douyin MCP 未配置，无法读取云电脑画面", { code: "DOUYIN_MCP_NOT_CONFIGURED", statusCode: 503 });
    }
    const refresh = url.searchParams.get("refresh") === "1";
    let result = refresh && typeof mcp.refreshLoginView === "function"
      ? await mcp.refreshLoginView()
      : typeof mcp.getCachedLoginView === "function"
        ? mcp.getCachedLoginView()
        : { ok: false, error: { code: "DOUYIN_VIEW_LINK_MISSING", message: "当前没有可复用的云电脑画面凭据" } };
    if (result?.ok === false
      && ["DOUYIN_VIEW_LINK_MISSING", "DOUYIN_VIEW_LINK_EXPIRED"].includes(result?.error?.code)
      && typeof mcp.refreshLoginView === "function") {
      result = await mcp.refreshLoginView();
    }
    return sendJson(response, 200, result);
  }

  if (request.method === "POST" && url.pathname === "/v1/douyin/mcp/start-notification-mode") {
    const body = await readJson(request, bodyLimit);
    const agentId = douyinAgentId(url, body);
    const cloudScope = douyinCloudScope(url, body, principal);
    const mcp = selectDouyinMcpService(security, agentId, cloudScope);
    if (!mcp?.configured) {
      throw new ControlPlaneError("Douyin MCP 未配置，无法启动互动监听", { code: "DOUYIN_MCP_NOT_CONFIGURED", statusCode: 503 });
    }
    await resumeDouyinAgent(security, agentId, cloudScope);
    return sendJson(response, 200, await mcp.startNotificationMode());
  }

  if (request.method === "POST" && url.pathname === "/v1/douyin/mcp/pull-notifications") {
    const body = await readJson(request, bodyLimit);
    const agentId = douyinAgentId(url, body);
    const cloudScope = douyinCloudScope(url, body, principal);
    const mcp = selectDouyinMcpService(security, agentId, cloudScope);
    assertDouyinMcpConfigured(mcp, "读取评论通知");
    const resumedStatus = await resumeDouyinAgent(security, agentId, cloudScope);
    await requireDouyinAuthorization(mcp, resumedStatus);
    const cursor = parseNonNegativeInteger(body.cursor, 0);
    const limit = Math.min(100, Math.max(1, parseNonNegativeInteger(body.limit, 20)));
    const waitMs = Math.min(30000, parseNonNegativeInteger(body.waitMs ?? body.wait_ms, 0));
    const result = await mcp.pullNotifications({ cursor, limit, waitMs });
    assertDouyinMcpResult(result, "读取评论通知失败");
    return sendJson(response, 200, result);
  }

  if (request.method === "POST" && url.pathname === "/v1/douyin/mcp/start-message-mode") {
    const body = await readJson(request, bodyLimit);
    const agentId = douyinAgentId(url, body);
    const cloudScope = douyinCloudScope(url, body, principal);
    const mcp = selectDouyinMcpService(security, agentId, cloudScope);
    assertDouyinMcpConfigured(mcp, "启动私信承接");
    const resumedStatus = await resumeDouyinAgent(security, agentId, cloudScope);
    const status = await requireDouyinAuthorization(mcp, resumedStatus);
    security.assertDouyinAccountAgentAvailable?.({
      tenantId: cloudScope.tenantId,
      agentId,
      accountIdentity: status.account,
      accountId: cloudScope.accountId
    });
    const result = await mcp.startMessageMode();
    assertDouyinMcpResult(result, "私信承接模块启动失败");
    return sendJson(response, 200, { ...result, account: status.account || null });
  }

  if (request.method === "POST" && url.pathname === "/v1/douyin/mcp/pull-messages") {
    const body = await readJson(request, bodyLimit);
    const agentId = douyinAgentId(url, body);
    const cloudScope = douyinCloudScope(url, body, principal);
    const mcp = selectDouyinMcpService(security, agentId, cloudScope);
    assertDouyinMcpConfigured(mcp, "读取私信");
    const resumedStatus = await resumeDouyinAgent(security, agentId, cloudScope);
    const status = await requireDouyinAuthorization(mcp, resumedStatus);
    security.assertDouyinAccountAgentAvailable?.({
      tenantId: cloudScope.tenantId,
      agentId,
      accountIdentity: status.account,
      accountId: cloudScope.accountId
    });
    const cursor = parseNonNegativeInteger(body.cursor, 0);
    const limit = Math.min(100, Math.max(1, parseNonNegativeInteger(body.limit, 20)));
    const waitMs = Math.min(30000, parseNonNegativeInteger(body.waitMs ?? body.wait_ms, 0));
    const result = await mcp.pullMessages({ cursor, limit, waitMs });
    assertDouyinMcpResult(result, "读取私信失败");
    return sendJson(response, 200, result);
  }

  if (request.method === "POST" && url.pathname === "/v1/douyin/mcp/send-message") {
    const body = await readJson(request, bodyLimit);
    const agentId = douyinAgentId(url, body);
    const cloudScope = douyinCloudScope(url, body, principal);
    const mcp = selectDouyinMcpService(security, agentId, cloudScope);
    assertDouyinMcpConfigured(mcp, "发送私信");
    const resumedStatus = await resumeDouyinAgent(security, agentId, cloudScope);
    requireSendConfirmation(body);
    const content = requiredText(body.content, "content");
    const conversationId = optionalText(body.conversationId ?? body.conversation_id);
    const nickname = optionalText(body.nickname);
    const secUid = optionalText(body.secUid ?? body.sec_uid);
    if (!conversationId && !nickname && !secUid) {
      throw new ControlPlaneError("需要 conversationId、nickname 或 secUid 才能定位会话", { code: "DOUYIN_RECIPIENT_REQUIRED", statusCode: 400 });
    }
    const status = await requireDouyinAuthorization(mcp, resumedStatus);
    security.assertDouyinAccountAgentAvailable?.({
      tenantId: cloudScope.tenantId,
      agentId,
      accountIdentity: status.account,
      accountId: cloudScope.accountId
    });
    const mode = await mcp.startMessageMode();
    assertDouyinMcpResult(mode, "私信承接模块启动失败");
    const accountCoordinationKey = douyinAccountCoordinationKey(status.account, cloudScope.accountId);
    const send = () => mcp.sendMessage({
      conversationId,
      content,
      reqId: optionalText(body.reqId ?? body.req_id),
      nickname,
      secUid,
      unfamiliar: body.unfamiliar,
      timeoutMs: boundedTimeout(body.timeoutMs ?? body.timeout_ms, 30000, 120000)
    });
    const result = typeof security.douyinAccountActionCoordinator?.runInbox === "function"
      ? await security.douyinAccountActionCoordinator.runInbox(accountCoordinationKey, send, {
          action: "direct_reply",
          agentId: agentId || null,
          conversationId,
          secUid
        })
      : await send();
    assertDouyinMcpResult(result, "发送私信失败");
    return sendJson(response, 200, { ...result, sender: status.account || null });
  }

  if (url.pathname === "/v1/douyin/inbox-agent/status" && request.method === "GET") {
    const agentId = douyinAgentId(url) || COMPREHENSIVE_ACQUISITION_AGENT_ID;
    const cloudScope = douyinCloudScope(url, null, principal);
    const service = selectDouyinInboxAgentService(security, agentId, cloudScope);
    const mcp = selectDouyinMcpService(security, agentId, cloudScope);
    assertInboxAgentConfigured(service);
    const resumedStatus = await resumeDouyinAgent(security, agentId, { ...cloudScope, syncInboxRuntime: true });
    const cloudStatus = resumedStatus || (typeof mcp?.status === "function" ? await mcp.status() : null);
    if (cloudStatus?.account && typeof service.setAccountCoordinationKey === "function") {
      const runtimeStatus = service.status();
      service.setAccountCoordinationKey(douyinAccountCoordinationKey(cloudStatus.account, cloudScope.accountId || runtimeStatus?.accountId));
    }
    return sendJson(response, 200, service.status());
  }

  if (url.pathname === "/v1/douyin/inbox-agent/plan" && request.method === "POST") {
    const body = await readJson(request, bodyLimit);
    const agentId = douyinAgentId(url, body) || COMPREHENSIVE_ACQUISITION_AGENT_ID;
    const cloudScope = douyinCloudScope(url, body, principal);
    const service = selectDouyinInboxAgentService(security, agentId, cloudScope);
    const mcp = selectDouyinMcpService(security, agentId, cloudScope);
    assertInboxAgentConfigured(service);
    assertDouyinMcpConfigured(mcp, "生成私信承接方案");
    if (service.planModelConfigured === false) {
      throw new ControlPlaneError("承接方案模型未配置，无法生成真实私信承接方案，请配置 BYERING_LLM_API_KEY", {
        code: "DOUYIN_PLAN_MODEL_NOT_CONFIGURED",
        statusCode: 503
      });
    }
    const resumedStatus = await resumeDouyinAgent(security, agentId, cloudScope);
    const authorizedStatus = await requireDouyinAuthorization(mcp, resumedStatus);
    security.assertDouyinAccountAgentAvailable?.({
      tenantId: cloudScope.tenantId,
      agentId,
      accountIdentity: authorizedStatus.account,
      accountId: cloudScope.accountId
    });
    const planned = await service.plan({
      ...inboxConfigurationFromBody(body),
      tenantId: cloudScope.tenantId,
      accountId: cloudScope.accountId,
      accountIdentity: authorizedStatus.account
    });
    security.inboxPlanRegistry?.remember(planned.planToken);
    return sendJson(response, 200, planned);
  }

  if (url.pathname === "/v1/douyin/inbox-agent/start-status" && request.method === "GET") {
    const agentId = douyinAgentId(url) || COMPREHENSIVE_ACQUISITION_AGENT_ID;
    const startRequestId = requiredText(url.searchParams.get("startRequestId") || url.searchParams.get("start_request_id"), "startRequestId");
    const cloudScope = douyinCloudScope(url, null, principal);
    const service = selectDouyinInboxAgentService(security, agentId, cloudScope);
    assertInboxAgentConfigured(service);
    return sendJson(response, 200, service.startStatus(startRequestId));
  }

  if (url.pathname === "/v1/douyin/inbox-agent/start" && request.method === "POST") {
    const body = await readJson(request, bodyLimit);
    const agentId = douyinAgentId(url, body) || COMPREHENSIVE_ACQUISITION_AGENT_ID;
    assertCoreGatewayForProductExecution(security, agentId, "start");
    const cloudScope = douyinCloudScope(url, body, principal);
    const service = selectDouyinInboxAgentService(security, agentId, cloudScope);
    const mcp = selectDouyinMcpService(security, agentId, cloudScope);
    assertInboxAgentConfigured(service);
    assertDouyinMcpConfigured(mcp, "启动私信承接");
    const resumedStatus = await resumeDouyinAgent(security, agentId, cloudScope);
    const authorizedStatus = await requireDouyinAuthorization(mcp, resumedStatus);
    if (service.modelConfigured !== true) {
      throw new ControlPlaneError("回复模型未配置，无法启动真实自动回复，请配置 BYERING_LLM_API_KEY", {
        code: "DOUYIN_REPLY_MODEL_NOT_CONFIGURED",
        statusCode: 503
      });
    }
    const startRequestId = requiredText(body.startRequestId ?? body.start_request_id, "startRequestId");
    const claimed = await security.claimInboxRuntime?.({
      tenantId: cloudScope.tenantId,
      agentId,
      service,
      accountIdentity: authorizedStatus.account,
      accountId: cloudScope.accountId,
      takeover: body.takeover === true
    });
    if (claimed?.claimed === false) {
      throw new ControlPlaneError(`当前账号的私信正在由${RECEPTION_STRATEGY_AGENT_NAMES[claimed.ownerAgentId] || "另一个 Agent"}承接。确认切换后，原承接任务会停止。`, {
        code: "INBOX_RUNTIME_OWNER_ACTIVE",
        statusCode: 409,
        details: { ownerAgentId: claimed.ownerAgentId, canTakeover: claimed.canTakeover === true }
      });
    }
    const inboxConfiguration = inboxConfigurationFromBody(body);
    let task = null;
    let result;
    try {
      task = security.controlPlane.ensureManagedRuntimeTask({
        taskId: optionalText(body.taskId ?? body.task_id ?? body.inboxTaskId ?? body.inbox_task_id),
        taskRunId: optionalText(body.taskRunId ?? body.task_run_id),
        conversationId: optionalText(body.conversationId ?? body.conversation_id),
        agentId,
        tenantId: cloudScope.tenantId,
        goal: "持续承接抖音新私信并按已确认策略回复",
        executionContext: {
          ...(authorizedStatus.account && typeof authorizedStatus.account === "object" ? authorizedStatus.account : {}),
          tenantId: cloudScope.tenantId,
          accountId: cloudScope.accountId || inboxConfiguration.accountId,
          accountKey: douyinAccountCoordinationKey(authorizedStatus.account, cloudScope.accountId),
          accountUseScope: optionalText(body.accountUseScope || body.account_use_scope) || agentId,
          accountName: inboxConfiguration.accountName || cloudScope.accountLabel || authorizedStatus.account?.nickname || null,
          provider: "douyin"
        },
        configuration: {
          replyStyle: {
            replyRule: inboxConfiguration.replyRule,
            replyObjective: inboxConfiguration.replyObjective,
            replyTone: inboxConfiguration.replyTone,
            businessKnowledge: inboxConfiguration.businessKnowledge
          },
          handoffBoundary: inboxConfiguration.handoffRules,
          approvalMode: inboxConfiguration.autoReply ? "auto" : "manual"
        }
      });
      result = await service.start({
        ...inboxConfiguration,
        tenantId: cloudScope.tenantId,
        accountId: cloudScope.accountId,
        accountIdentity: authorizedStatus.account,
        taskId: task.taskId,
        taskRunId: task.taskRunId,
        conversationId: task.conversationId,
        planToken: requiredText(body.planToken ?? body.plan_token, "planToken"),
        startRequestId,
        startPolling: body.startPolling !== false,
        pollIntervalMs: body.pollIntervalMs,
        pollWaitMs: body.pollWaitMs,
        batchLimit: body.batchLimit,
        accountCoordinationKey: douyinAccountCoordinationKey(authorizedStatus.account, cloudScope.accountId)
      });
    } catch (error) {
      try {
        const snapshot = task?.taskId ? security.controlPlane.getTaskSnapshot(task.taskId) : null;
        if (snapshot?.state === "RUNNING") {
          security.controlPlane.dispatch({
            type: "task.fail",
            taskId: task.taskId,
            taskRunId: task.taskRunId,
            conversationId: task.conversationId,
            agentId,
            expectedVersion: snapshot.version,
            payload: { reason: "INBOX_RUNTIME_START_FAILED", error: { code: error?.code || null, message: error?.message || "启动私信承接失败" } }
          });
        }
      } catch {
        // Preserve the original runtime start failure when task finalization cannot be recorded.
      }
      security.releaseInboxRuntime?.({
        tenantId: cloudScope.tenantId,
        agentId,
        service,
        accountIdentity: authorizedStatus.account,
        accountId: cloudScope.accountId
      });
      if (authorizedStatus.account && typeof security.accountReceptionStore?.stopPrivateReception === "function") {
        try { security.accountReceptionStore.stopPrivateReception({ tenantId: cloudScope.tenantId, account: authorizedStatus.account }, { agentId }); } catch { /* preserve the original start failure */ }
      }
      throw error;
    }
    const privateReception = security.accountReceptionStore.enablePrivateReception({
      tenantId: cloudScope.tenantId,
      account: authorizedStatus.account
    }, { agentId });
    return sendJson(response, 200, {
      ...result,
      taskId: task.taskId,
      taskRunId: task.taskRunId,
      conversationId: task.conversationId,
      privateReception: privateReception.privateReception
    });
  }

  if (url.pathname === "/v1/douyin/inbox-agent/poll" && request.method === "POST") {
    const body = await readJson(request, bodyLimit);
    const agentId = douyinAgentId(url, body) || COMPREHENSIVE_ACQUISITION_AGENT_ID;
    assertCoreGatewayForProductExecution(security, agentId, "poll");
    const cloudScope = douyinCloudScope(url, body, principal);
    const service = selectDouyinInboxAgentService(security, agentId, cloudScope);
    const mcp = selectDouyinMcpService(security, agentId, cloudScope);
    assertInboxAgentConfigured(service);
    assertDouyinMcpConfigured(mcp, "读取私信");
    const resumedStatus = await resumeDouyinAgent(security, agentId, cloudScope);
    const authorizedStatus = await requireDouyinAuthorization(mcp, resumedStatus);
    const claimed = await security.claimInboxRuntime?.({
      tenantId: cloudScope.tenantId,
      agentId,
      service,
      accountIdentity: authorizedStatus.account,
      accountId: cloudScope.accountId || service.status?.().accountId,
      takeover: false
    });
    if (claimed?.claimed === false) {
      throw new ControlPlaneError(`当前账号的私信正在由${RECEPTION_STRATEGY_AGENT_NAMES[claimed.ownerAgentId] || "另一个 Agent"}承接。`, { code: "INBOX_RUNTIME_OWNER_ACTIVE", statusCode: 409 });
    }
    const runtime = service.status?.();
    if (runtime?.runtime?.running !== true || !optionalText(runtime?.taskId || runtime?.runtime?.taskId)) {
      security.releaseInboxRuntime?.({
        tenantId: cloudScope.tenantId,
        agentId,
        service,
        accountIdentity: authorizedStatus.account,
        accountId: cloudScope.accountId || runtime?.accountId
      });
      throw new ControlPlaneError("私信承接尚未启动，请先完成配置并启动 Agent。", {
        code: "INBOX_RUNTIME_NOT_STARTED",
        statusCode: 409
      });
    }
    return sendJson(response, 200, await service.pollOnce(body));
  }

  if (url.pathname === "/v1/douyin/inbox-agent/stop" && request.method === "POST") {
    const body = await readJson(request, bodyLimit);
    const agentId = douyinAgentId(url, body) || COMPREHENSIVE_ACQUISITION_AGENT_ID;
    const cloudScope = douyinCloudScope(url, body, principal);
    const service = selectDouyinInboxAgentService(security, agentId, cloudScope);
    assertInboxAgentConfigured(service);
    if (body.confirm !== "STOP") {
      throw new ControlPlaneError("停止私信承接前需要确认，请传 confirm=STOP", { code: "INBOX_STOP_CONFIRMATION_REQUIRED", statusCode: 400 });
    }
    const runtimeStatus = service.status?.();
    const requestedTaskId = optionalText(body.taskId ?? body.task_id);
    const runtimeTaskId = optionalText(runtimeStatus?.taskId || runtimeStatus?.runtime?.taskId);
    if (requestedTaskId && runtimeStatus?.runtime?.running === true && runtimeTaskId !== requestedTaskId) {
      throw new ControlPlaneError("当前运行的私信承接任务已变化，请刷新后再停止。", {
        code: "INBOX_RUNTIME_TASK_MISMATCH",
        statusCode: 409,
        details: { requestedTaskId, runtimeTaskId: runtimeTaskId || null }
      });
    }
    let accountIdentity = null;
    try {
      const mcp = selectDouyinMcpService(security, agentId, cloudScope);
      const status = typeof mcp?.status === "function" ? await mcp.status() : null;
      accountIdentity = status?.account || null;
    } catch {
      // A stopped runtime must still be released even if its status probe is unavailable.
    }
    const result = await service.stop({
      reason: "user_stopped",
      taskId: requestedTaskId,
      accountId: cloudScope.accountId || runtimeStatus?.accountId
    });
    let runtimeTask = null;
    let lifecycleError = null;
    try {
      runtimeTask = security.cancelInboxRuntimeTask?.({
        service,
        agentId,
        reason: "INBOX_RUNTIME_STOPPED_BY_USER"
      });
    } catch (error) {
      lifecycleError = error;
    } finally {
      security.releaseInboxRuntime?.({
        tenantId: cloudScope.tenantId,
        agentId,
        service,
        accountIdentity,
        accountId: cloudScope.accountId || runtimeStatus?.accountId || service.status?.().accountId
      });
    }
    const ownerIdentity = hasAccountIdentity(accountIdentity)
      ? accountIdentity
      : (cloudScope.accountId || runtimeStatus?.accountId ? { uid: cloudScope.accountId || runtimeStatus?.accountId } : null);
    const privateReception = ownerIdentity
      ? security.accountReceptionStore.stopPrivateReception({ tenantId: cloudScope.tenantId, account: ownerIdentity }, { agentId }).privateReception
      : null;
    if (lifecycleError) throw lifecycleError;
    return sendJson(response, 200, {
      ...result,
      privateReception,
      taskId: runtimeTask?.taskId || runtimeStatus?.taskId || null,
      taskState: runtimeTask?.state || null
    });
  }

  if (url.pathname === "/v1/douyin/inbox-agent/conversation/control" && request.method === "POST") {
    const body = await readJson(request, bodyLimit);
    const agentId = douyinAgentId(url, body) || COMPREHENSIVE_ACQUISITION_AGENT_ID;
    assertCoreGatewayForProductExecution(security, agentId, "conversation_control");
    const cloudScope = douyinCloudScope(url, body, principal);
    const service = selectDouyinInboxAgentService(security, agentId, cloudScope);
    const mcp = selectDouyinMcpService(security, agentId, cloudScope);
    assertInboxAgentConfigured(service);
    assertDouyinMcpConfigured(mcp, "控制私信会话");
    const resumedStatus = typeof mcp.probeRemoteStatus === "function"
      ? await mcp.probeRemoteStatus()
      : await resumeDouyinAgent(security, agentId, cloudScope);
    const authorizedStatus = await requireDouyinAuthorization(mcp, resumedStatus);
    security.assertDouyinAccountAgentAvailable?.({
      tenantId: cloudScope.tenantId,
      agentId,
      accountIdentity: authorizedStatus.account,
      accountId: cloudScope.accountId
    });
    const action = requiredText(body.action, "action");
    if (!["takeover", "resume_ai"].includes(action)) {
      throw new ControlPlaneError("只支持 takeover 或 resume_ai", { code: "DOUYIN_CONVERSATION_ACTION_INVALID", statusCode: 400 });
    }
    return sendJson(response, 200, await service.controlConversation({
      action,
      reason: optionalText(body.reason),
      conversationId: optionalText(body.conversationId ?? body.conversation_id),
      nickname: optionalText(body.nickname),
      secUid: optionalText(body.secUid ?? body.sec_uid),
      secId: optionalText(body.secId ?? body.sec_id)
    }));
  }

  if (url.pathname === "/v1/douyin/inbox-agent/conversation/message" && request.method === "POST") {
    const body = await readJson(request, bodyLimit);
    const agentId = douyinAgentId(url, body) || COMPREHENSIVE_ACQUISITION_AGENT_ID;
    assertCoreGatewayForProductExecution(security, agentId, "conversation_message");
    const cloudScope = douyinCloudScope(url, body, principal);
    const service = selectDouyinInboxAgentService(security, agentId, cloudScope);
    const mcp = selectDouyinMcpService(security, agentId, cloudScope);
    assertInboxAgentConfigured(service);
    assertDouyinMcpConfigured(mcp, "发送人工私信");
    requireSendConfirmation(body);
    const resumedStatus = typeof mcp.probeRemoteStatus === "function"
      ? await mcp.probeRemoteStatus()
      : await resumeDouyinAgent(security, agentId, cloudScope);
    const authorizedStatus = await requireDouyinAuthorization(mcp, resumedStatus);
    security.assertDouyinAccountAgentAvailable?.({
      tenantId: cloudScope.tenantId,
      agentId,
      accountIdentity: authorizedStatus.account,
      accountId: cloudScope.accountId
    });
    const mode = await mcp.startMessageMode();
    assertDouyinMcpResult(mode, "私信承接模块启动失败");
    const result = await service.sendHumanMessage({
      content: requiredText(body.content, "content"),
      clientMessageId: optionalText(body.clientMessageId ?? body.client_message_id),
      reqId: optionalText(body.reqId ?? body.req_id),
      conversationId: optionalText(body.conversationId ?? body.conversation_id),
      nickname: optionalText(body.nickname),
      secUid: optionalText(body.secUid ?? body.sec_uid),
      secId: optionalText(body.secId ?? body.sec_id)
    });
    return sendJson(response, 200, { ...result, sender: authorizedStatus.account || null });
  }

  const draftMatch = url.pathname.match(/^\/v1\/douyin\/inbox-agent\/drafts\/([^/]+)\/send$/);
  if (draftMatch && request.method === "POST") {
    const body = await readJson(request, bodyLimit);
    const agentId = douyinAgentId(url, body) || COMPREHENSIVE_ACQUISITION_AGENT_ID;
    const cloudScope = douyinCloudScope(url, body, principal);
    const service = selectDouyinInboxAgentService(security, agentId, cloudScope);
    const mcp = selectDouyinMcpService(security, agentId, cloudScope);
    assertInboxAgentConfigured(service);
    assertDouyinMcpConfigured(mcp, "发送私信回复");
    requireSendConfirmation(body);
    const resumedStatus = await resumeDouyinAgent(security, agentId, cloudScope);
    const authorizedStatus = await requireDouyinAuthorization(mcp, resumedStatus);
    security.assertDouyinAccountAgentAvailable?.({
      tenantId: cloudScope.tenantId,
      agentId,
      accountIdentity: authorizedStatus.account,
      accountId: cloudScope.accountId
    });
    return sendJson(response, 200, await service.sendDraft(decodeURIComponent(draftMatch[1])));
  }

  if (request.method === "POST" && url.pathname === "/v1/douyin/mcp/outreach-priority/start") {
    const body = await readJson(request, bodyLimit);
    const agentId = douyinAgentId(url, body);
    const taskId = requiredText(body.taskId ?? body.task_id, "taskId");
    const cloudScope = douyinCloudScope(url, body, principal);
    const mcp = selectDouyinMcpService(security, agentId, cloudScope);
    assertDouyinMcpConfigured(mcp, "启动私信触达任务");
    const resumedStatus = typeof mcp.probeRemoteStatus === "function"
      ? await mcp.probeRemoteStatus()
      : await resumeDouyinAgent(security, agentId, cloudScope);
    const status = await requireDouyinAuthorization(mcp, resumedStatus);
    security.assertDouyinAccountAgentAvailable?.({
      tenantId: cloudScope.tenantId,
      agentId,
      accountIdentity: status.account,
      accountId: cloudScope.accountId
    });
    const accountCoordinationKey = douyinAccountCoordinationKey(status.account, cloudScope.accountId);
    const priority = security.douyinAccountActionCoordinator?.beginOutreach?.(accountCoordinationKey, taskId, {
      agentId: agentId || null,
      ttlMs: body.ttlMs ?? body.ttl_ms
    }) || null;
    return sendJson(response, 200, { ok: true, taskId, accountCoordinationKey, priority });
  }

  if (request.method === "POST" && url.pathname === "/v1/douyin/mcp/outreach-priority/finish") {
    const body = await readJson(request, bodyLimit);
    const taskId = requiredText(body.taskId ?? body.task_id, "taskId");
    const released = security.douyinAccountActionCoordinator?.endOutreach?.(taskId) === true;
    return sendJson(response, 200, { ok: true, taskId, released });
  }

  if (request.method === "POST" && url.pathname === "/v1/douyin/mcp/send-private-message") {
    const body = await readJson(request, bodyLimit);
    const agentId = douyinAgentId(url, body);
    const ownerAgentId = optionalText(body.ownerAgentId || body.owner_agent_id);
    if (CORE_EXECUTION_AGENT_IDS.has(agentId) || CORE_EXECUTION_AGENT_IDS.has(ownerAgentId)) {
      throw new ControlPlaneError("产品 Agent 的私信执行必须通过核心执行网关，并遵守合同、账号与成果记录校验", {
        code: "CORE_AGENT_GATEWAY_REQUIRED",
        statusCode: 409,
        details: { agentId: agentId || ownerAgentId || null }
      });
    }
    const cloudScope = douyinCloudScope(url, body, principal);
    const mcp = selectDouyinMcpService(security, agentId, cloudScope);
    assertDouyinMcpConfigured(mcp, "发送私信");
    // The MCP adapter is a single-call stdio transport. Use the channel
    // server's read-only status endpoint for the preflight so no local MCP
    // status request can queue ahead of the mutating private-message call.
    const resumedStatus = typeof mcp.probeRemoteStatus === "function"
      ? await mcp.probeRemoteStatus()
      : await resumeDouyinAgent(security, agentId, cloudScope);
    requireSendConfirmation(body);
    const content = requiredText(body.content, "content");
    const secId = optionalText(body.secId ?? body.sec_id);
    const secUid = optionalText(body.secUid ?? body.sec_uid);
    if (!secId && !secUid) {
      throw new ControlPlaneError("缺少潜客的 secUid，无法安全定位私信对象", { code: "DOUYIN_RECIPIENT_ID_REQUIRED", statusCode: 400 });
    }
    if (secId && secUid && secId !== secUid) {
      throw new ControlPlaneError("secId 与 secUid 不一致，已拒绝发送以避免误触达", { code: "DOUYIN_RECIPIENT_ID_MISMATCH", statusCode: 400 });
    }
    const status = await requireDouyinAuthorization(mcp, resumedStatus);
    security.assertDouyinAccountAgentAvailable?.({
      tenantId: cloudScope.tenantId,
      agentId,
      accountIdentity: status.account,
      accountId: cloudScope.accountId
    });
    const accountCoordinationKey = douyinAccountCoordinationKey(status.account, cloudScope.accountId);
    const actionType = body.actionType ?? body.action_type ?? DEFAULT_PRIVATE_OUTREACH_ACTION_TYPE;
    const reqId = optionalText(body.reqId ?? body.req_id) || randomUUID();
    const outreachTaskId = optionalText(body.taskId ?? body.task_id);
    if (outreachTaskId) security.douyinAccountActionCoordinator?.touchOutreach?.(outreachTaskId);
    const operationKey = JSON.stringify([agentId || "default", cloudScope.tenantId || null, accountCoordinationKey || cloudScope.accountId || null]);
    if (security.privateMessageInFlight?.has(operationKey)) {
      throw new ControlPlaneError("当前私信专员已有一个触达动作在执行，请等待结果后再发起新的触达", {
        code: "DOUYIN_PRIVATE_MESSAGE_BUSY",
        statusCode: 409,
        details: { operation: "send_private_message", phase: "provider_action_in_flight", outcome: "unknown", agentId: agentId || null }
      });
    }
    const operationToken = Symbol("private-message");
    security.privateMessageInFlight?.set(operationKey, operationToken);
    const finishOffice = security.officeOperations.begin({ tenantId: principal.tenantId || null,
      agentId: agentId || COMPREHENSIVE_ACQUISITION_AGENT_ID,
      taskId: outreachTaskId || reqId, accountId: cloudScope.accountId || status.account?.uid || null });
    let result;
    try {
      const send = () => mcp.sendPrivateMessage({
        secId,
        secUid,
        content,
        reqId,
        // The provider locates the target from sec_id/sec_uid and performs
        // the profile-to-conversation navigation itself. Keep the product
        // request identical to the known-good direct MCP call; display names
        // and sender labels are UI metadata, not targeting inputs.
        // Private-message actions run on a remote browser and may spend several
        // minutes opening the conversation. The client watchdog observes the
        // worker; this timeout is only a generous broken-connection safeguard.
        timeoutMs: boundedTimeout(body.timeoutMs ?? body.timeout_ms, DEFAULT_PRIVATE_OUTREACH_TIMEOUT_MS, MAX_PRIVATE_OUTREACH_TIMEOUT_MS),
        followFirst: Boolean(body.followFirst ?? body.follow_first),
        followBeforeLetter: Boolean(body.followBeforeLetter ?? body.follow_before_letter),
        followOnly: Boolean(body.followOnly ?? body.follow_only),
        fetchPostOnly: Boolean(body.fetchPostOnly ?? body.fetch_post_only),
        actionType
      });
      result = typeof security.douyinAccountActionCoordinator?.runOutreach === "function"
        ? await security.douyinAccountActionCoordinator.runOutreach(accountCoordinationKey, send, {
            action: "private_outreach",
            agentId: agentId || null,
            reqId,
            targetSecUid: secUid || secId
          })
        : await send();
    } catch (error) {
      finishOffice("unknown");
      throw new ControlPlaneError(error?.message || "云电脑传输中断，未能确认私信结果", {
        code: error?.code || "DOUYIN_MCP_TRANSPORT_FAILED",
        statusCode: 502,
        details: {
          operation: "send_private_message",
          phase: "provider_transport_failed",
          outcome: "unknown",
          targetIdProvided: Boolean(secId || secUid),
          actionType,
          reqId,
          transportError: { code: error?.code || null, message: error?.message || null }
        }
      });
    } finally {
      if (security.privateMessageInFlight?.get(operationKey) === operationToken) {
        security.privateMessageInFlight.delete(operationKey);
      }
    }
    // Keep the HTTP boundary defensive: alternate MCP adapters may return a
    // nested no-receipt diagnostic even when the service implementation has
    // not normalized it yet. This is still an awaiting-receipt outcome, not a
    // failed send.
    result = normalizePrivateMessageResult(result, reqId);
    finishOffice(officeReceiptState(result));
    assertDouyinMcpResult(result, "发送私信失败", {
      operation: "send_private_message",
      phase: "provider_action_failed",
      targetIdProvided: Boolean(secId || secUid),
      actionType,
      reqId
    });
    return sendJson(response, 200, {
      ...result,
      sender: status.account || null,
      execution: {
        operation: "send_private_message",
        phase: "provider_action_returned",
        targetIdProvided: Boolean(secId || secUid),
        actionType,
        reqId
      }
    });
  }

  const clueHunterMatch = url.pathname.match(/^\/v1\/connectors\/cluehunter\/(lease|ack|authorize|status|submit)$/);
  if (request.method === "POST" && clueHunterMatch) {
    const operation = clueHunterMatch[1];
    const body = withTenantScope(await readJson(request, bodyLimit), principal);
    const result = await clueHunterService[operation](body);
    // Connector calls made with task context are also event ingress. The
    // dispatcher ingests its own results directly, while worker-facing HTTP
    // calls must persist the same canonical facts before returning success.
    if (body.taskId && Array.isArray(result?.events) && result.events.length
      && typeof controlPlane.ingestExecutionEvents === "function") {
      const ingested = controlPlane.ingestExecutionEvents({
        taskId: body.taskId,
        tenantId: body.tenantId || principal.tenantId || null,
        uid: body.uid || body.robotUid || null,
        source: "cluehunter",
        events: result.events
      });
      return sendJson(response, 200, { ...result, ingested: {
        acceptedCount: ingested.acceptedCount,
        duplicateCount: ingested.duplicateCount,
        currentSeq: ingested.currentSeq
      } });
    }
    return sendJson(response, 200, result);
  }

  if (request.method === "POST" && url.pathname === "/v1/connectors/prospect/resolve-account") {
    const resolver = security.accountResolver;
    if (!resolver || typeof resolver.resolve !== "function" || resolver.configured === false) {
      throw new ControlPlaneError("账号解析能力未配置", {
        code: "ACCOUNT_RESOLVER_NOT_CONFIGURED",
        statusCode: 503
      });
    }
    const body = withTenantScope(await readJson(request, bodyLimit), principal);
    const account = await resolver.resolve(body);
    return sendJson(response, 200, { accepted: true, source: "account_resolution", account });
  }

  if (request.method === "POST" && url.pathname === "/v1/connectors/prospect/resolve-accounts") {
    const resolver = security.accountResolver;
    if (!resolver || typeof resolver.resolve !== "function" || resolver.configured === false) {
      throw new ControlPlaneError("账号解析能力未配置", {
        code: "ACCOUNT_RESOLVER_NOT_CONFIGURED",
        statusCode: 503
      });
    }
    const body = withTenantScope(await readJson(request, bodyLimit), principal);
    const references = Array.isArray(body.accounts)
      ? body.accounts
      : Array.isArray(body.accountRefs)
        ? body.accountRefs
        : Array.isArray(body.accountList)
          ? body.accountList
          : null;
    if (!references || references.length < 1 || references.length > 50) {
      throw new ControlPlaneError("accounts must contain between 1 and 50 public references", {
        code: "PROSPECT_INPUT_INVALID",
        statusCode: 400,
        details: { field: "accounts", max: 50 }
      });
    }
    const results = [];
    for (const [index, reference] of references.entries()) {
      try {
        const account = await resolver.resolve(reference && typeof reference === "object"
          ? reference
          : { accountName: String(reference ?? "") });
        results.push({ index, account });
      } catch (error) {
        results.push({
          index,
          error: {
            code: error?.code || "ACCOUNT_RESOLUTION_FAILED",
            message: error?.message || "账号解析失败",
            statusCode: Number.isInteger(error?.statusCode) ? error.statusCode : 502
          }
        });
      }
    }
    return sendJson(response, 200, {
      accepted: results.every((item) => item.account),
      source: "account_resolution",
      accounts: results
    });
  }

  const prospectRunMatch = url.pathname.match(/^\/v1\/connectors\/prospect\/runs\/([^/]+)$/);
  const prospectWorkbookMatch = url.pathname.match(/^\/v1\/connectors\/prospect\/runs\/([^/]+)\.xlsx$/);
  if (request.method === "GET" && prospectWorkbookMatch) {
    const taskId = decodeURIComponent(prospectWorkbookMatch[1]);
    const run = findProspectRun(security, controlPlane, taskId, principal);
    if (!run) throw new ControlPlaneError("找不到公开找人任务", {
      code: "PROSPECT_RUN_NOT_FOUND",
      statusCode: 404,
      details: { taskId }
    });
    const filename = prospectWorkbookFilename(run.resultSnapshot || run);
    const workbook = createProspectWorkbook(run.resultSnapshot || run);
    response.statusCode = 200;
    response.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    response.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    response.end(workbook);
    return;
  }
  if (request.method === "GET" && prospectRunMatch) {
    const taskId = decodeURIComponent(prospectRunMatch[1]);
    const run = findProspectRun(security, controlPlane, taskId, principal);
    if (!run) throw new ControlPlaneError("找不到公开找人任务", {
      code: "PROSPECT_RUN_NOT_FOUND",
      statusCode: 404,
      details: { taskId }
    });
    return sendJson(response, 200, run);
  }

  if (request.method === "POST" && url.pathname === "/v1/connectors/prospect/analyze") {
    if (!security.coreAgentExecutionService || typeof security.coreAgentExecutionService.lease !== "function") {
      throw new ControlPlaneError("客户分析员 Agent 未配置", {
        code: "PROSPECT_INTENT_ANALYZER_NOT_CONFIGURED",
        statusCode: 503
      });
    }
    const parsedBody = await readJson(request, bodyLimit);
    const requested = prepareCoreAgentExecutionRequest(
      withTenantScope(parsedBody, principal),
      {
        prospectRecordStore: security.prospectRecordStore,
        principal,
        defaultAgentId: "mkt-intent-analyst"
      }
    );
    const agentId = requested.agentId;
    const contract = requireActiveCoreAgentEmployment(security.employmentStore, principal, agentId);
    const durableTask = ensureCoreExecutionTask(controlPlane, { ...requested, agentId }, principal, security);
    const body = {
      ...requested,
      agentId,
      taskId: durableTask.taskId,
      taskRunId: requested.taskRunId || durableTask.taskRunId,
      conversationId: requested.conversationId || durableTask.conversationId,
      employment: contract
    };
    const finishOffice = security.officeOperations.begin({
      tenantId: principal.tenantId || null,
      agentId: body.agentId || "mkt-intent-analyst",
      taskId: body.taskId,
      taskRunId: body.taskRunId,
      goal: body.goal
    });
    let result;
    try {
      result = await security.coreAgentExecutionService.lease(body);
      result = {
        ...result,
        taskId: body.taskId,
        taskRunId: body.taskRunId,
        conversationId: body.conversationId,
        agentId: body.agentId
      };
      finishOffice(result?.status || (result?.accepted ? "unknown" : "completed"), result);
    } catch (error) {
      finishOffice("failed");
      throw error;
    }
    if (body.taskId && result && security.prospectRuns instanceof Map) {
      security.prospectRuns.set(body.taskId, {
        ...result,
        taskId: body.taskId,
        updatedAt: new Date().toISOString()
      });
      while (security.prospectRuns.size > 100) {
        security.prospectRuns.delete(security.prospectRuns.keys().next().value);
      }
    }
    return sendConnectorResult(response, controlPlane, result, {
      taskId: body.taskId,
      tenantId: body.tenantId || principal.tenantId || null,
      source: "prospect"
    });
  }

  const prospectMatch = url.pathname.match(/^\/v1\/connectors\/prospect\/(discover|events)$/);
  if (request.method === "POST" && prospectMatch) {
    if (!prospectService || typeof prospectService[prospectMatch[1] === "discover" ? "discover" : "callback"] !== "function") {
      throw new ControlPlaneError("公开找人 Agent 未配置", {
        code: "PROSPECT_EXECUTOR_NOT_CONFIGURED",
        statusCode: 503
      });
    }
    const rawBody = prospectMatch[1] === "events" ? await readRawBody(request, bodyLimit) : null;
    if (prospectMatch[1] === "events" && security.prospectEventSecret) {
      verifyProspectEventSignature({
        request,
        rawBody,
        secret: security.prospectEventSecret,
        maxSkewMs: security.prospectEventMaxSkewMs,
        now: security.now
      });
    }
    const parsedBody = rawBody == null ? await readJson(request, bodyLimit) : parseJsonBody(rawBody);
    const callbackContext = prospectMatch[1] === "events"
      ? Object.fromEntries(["taskId", "taskRunId", "conversationId", "agentId", "tenantId", "goal", "accountName", "uniqueId", "profileUrl", "uid", "secId"]
        .map((key) => [key, url.searchParams.get(key)])
        .filter(([, value]) => value))
      : {};
    // Correlation values embedded in the callback URL are server-issued and
    // must win over any similarly named fields in an upstream payload.
    let body = withTenantScope({ ...parsedBody, ...callbackContext }, principal);
    if (prospectMatch[1] === "discover") {
      security.assertDouyinAccountAgentAvailable?.({
        tenantId: body.tenantId || principal?.tenantId || null,
        agentId: body.agentId || "mkt-find-people",
        accountIdentity: body.accountIdentity || body.sourceAccount || body.source_account || null,
        accountId: body.accountId || body.account_id || null
      });
      const durableTask = ensurePublicDiscoveryTask(controlPlane, body, principal);
      body = {
        ...body,
        taskId: durableTask.taskId,
        taskRunId: body.taskRunId || durableTask.taskRunId,
        conversationId: body.conversationId || durableTask.conversationId
      };
    }
    const finishOffice = security.officeOperations.begin({ tenantId: principal.tenantId || null,
      agentId: body.agentId || "mkt-find-people", taskId: body.taskId, taskRunId: body.taskRunId, goal: body.goal });
    let result;
    try {
      result = prospectMatch[1] === "discover"
        ? await prospectService.discover(body)
        : await (security.prospectExecutor?.callback || prospectService.callback).call(
        security.prospectExecutor || prospectService,
        body,
        body.response || body.data || body
      );
      finishOffice(result?.status || (result?.accepted ? "unknown" : "completed"), result);
    } catch (error) { finishOffice("failed"); throw error; }
    if (body.taskId && result && security.prospectRuns instanceof Map) {
      security.prospectRuns.set(body.taskId, {
        ...result,
        taskId: body.taskId,
        updatedAt: new Date().toISOString()
      });
      while (security.prospectRuns.size > 100) {
        security.prospectRuns.delete(security.prospectRuns.keys().next().value);
      }
    }
    const ingestTaskId = body.taskId;
    if (prospectMatch[1] === "discover") result = completeSynchronousDiscoveryResult(result, body);
    if (prospectMatch[1] === "discover" && result && typeof result === "object" && !Array.isArray(result)) {
      result = {
        ...result,
        taskId: body.taskId,
        taskRunId: body.taskRunId || null,
        conversationId: body.conversationId || null,
        agentId: body.agentId || "mkt-find-people"
      };
    }
    return sendConnectorResult(response, controlPlane, result, {
      taskId: ingestTaskId,
      tenantId: body.tenantId || principal.tenantId || null,
      source: "prospect"
    });
  }

  if (request.method === "POST" && url.pathname === "/v1/connectors/cluehunter/events") {
    const rawBody = await readRawBody(request, bodyLimit);
    const body = parseJsonBody(rawBody);
    verifyClueHunterEventSignature({
      request,
      rawBody,
      secret: security.clueHunterEventSecret,
      maxSkewMs: security.clueHunterEventMaxSkewMs,
      now: security.now
    });
    const events = Array.isArray(body.events)
      ? body.events
      : body.event && typeof body.event === "object"
        ? [body.event]
        : [];
    const executionInput = {
      taskId: body.taskId,
      uid: body.uid || null,
      source: body.source || "connector",
      events
    };
    if (body.tenantId) executionInput.tenantId = body.tenantId;
    return sendJson(response, 200, controlPlane.ingestExecutionEvents(executionInput));
  }

  if (request.method === "GET" && url.pathname === "/v1/connectors/douyin/accounts") {
    if (!browserWorkspace || typeof browserWorkspace.list !== "function") {
      throw new ControlPlaneError("抖音账号工作区未配置", {
        code: "DOUYIN_ACCOUNT_SOURCE_UNAVAILABLE",
        statusCode: 503
      });
    }
    // Account discovery is a read path. Refreshing every legacy browser
    // session here can block the realtime page on unavailable local handles.
    // Session owners persist verified identity changes independently.
    const receptionState = (identity) => {
      if (!security.accountReceptionStore?.get || !hasAccountIdentity(identity)) {
        return {
          receptionConfigured: false,
          privateReceptionEnabled: false,
          privateReceptionEligible: false,
          privateReceptionRunning: false,
          privateReceptionRuntimeState: "stopped",
          privateReception: null
        };
      }
      try {
        const record = security.accountReceptionStore.get({ tenantId: principal?.tenantId || null, account: identity });
        return {
          receptionConfigured: Number(record?.revision || 0) > 0,
          privateReceptionEnabled: record?.privateReception?.enabled === true,
          privateReceptionEligible: record?.privateReception?.enabled === true,
          privateReceptionRunning: record?.privateReception?.runtimeState === "running",
          privateReceptionRuntimeState: record?.privateReception?.runtimeState || "stopped",
          privateReception: record?.privateReception || null
        };
      } catch {
        return {
          receptionConfigured: false,
          privateReceptionEnabled: false,
          privateReceptionEligible: false,
          privateReceptionRunning: false,
          privateReceptionRuntimeState: "stopped",
          privateReception: null
        };
      }
    };
    const workspaceAccounts = browserWorkspace.list()
      .filter((session) => session?.provider === "douyin" && session.state === "READY")
      // READY is only a browser lifecycle state. A real account must also be
      // backed by the browser's verified Douyin session evidence.
      .filter((session) => session.authenticationVerified === true)
      // A login cookie only proves that a browser session is authenticated.
      // Do not expose the server-owned workspace label as a Douyin identity.
      .filter((session) => hasAccountIdentity(session.accountIdentity))
      .filter((session) => !principal?.tenantId || session.tenantId === principal.tenantId)
      .map((session) => {
        const identity = session.accountIdentity;
        const reception = receptionState(identity);
        return {
          id: session.accountKey,
          name: identity.accountName
            || (identity.uniqueId ? `抖音账号 @${identity.uniqueId.replace(/^@+/, "")}` : session.accountKey),
          handle: identity.uniqueId ? `@${identity.uniqueId.replace(/^@+/, "")}` : "",
          status: "已连接",
          computer: "在线",
          authenticationVerified: session.authenticationVerified === true,
          ...reception,
          identity,
          source: "browser-workspace"
        };
      });
    const agentCloudRecords = typeof security.douyinAgentCloudRegistry?.list === "function"
      ? security.douyinAgentCloudRegistry.list()
        .filter((record) => record?.sessionId && record.status === "online" && hasAccountIdentity(record.accountIdentity))
      : [];
    const capabilityAgentIdsByAccount = new Map();
    for (const record of agentCloudRecords) {
      const accountKey = receptionAccountKeys(record.accountIdentity).sort()[0] || null;
      if (!accountKey) continue;
      const ids = capabilityAgentIdsByAccount.get(accountKey) || new Set();
      ids.add(String(record.agentId || "").trim());
      capabilityAgentIdsByAccount.set(accountKey, ids);
    }
    const capabilityMatrixFor = (identity) => {
      const accountKey = receptionAccountKeys(identity).sort()[0] || null;
      return buildDouyinAcquisitionAccountCapabilityMatrix({
        agentIds: accountKey ? [...(capabilityAgentIdsByAccount.get(accountKey) || [])] : []
      });
    };
    const agentCloudAccounts = agentCloudRecords
      .map((record) => {
          const identity = record.accountIdentity;
          const reception = receptionState(identity);
          const handle = identity.account || identity.uniqueId || identity.unique_id || identity.uid || identity.userId || identity.user_id || "";
          const avatarSource = douyinAvatarSource(identity);
          return {
            id: record.accountId || `douyin-agent:${record.agentId}`,
            agentId: record.agentId,
            sessionId: record.sessionId,
            name: identity.nickname
              || identity.nick_name
              || identity.accountName
              || identity.account_name
              || identity.account
              || "账号名称未返回",
            handle: handle ? `@${String(handle).replace(/^@+/, "")}` : "",
            status: "已连接",
            computer: "在线",
            authenticationVerified: true,
            ...reception,
            capabilityMatrix: capabilityMatrixFor(identity),
            identity,
            avatar: `${url.origin}/v1/connectors/douyin/accounts/${encodeURIComponent(record.agentId)}/avatar${record.accountId ? `?accountId=${encodeURIComponent(record.accountId)}` : ""}`,
            source: "douyin-agent-cloud"
          };
      });
    const accounts = [...agentCloudAccounts, ...workspaceAccounts]
      .filter((account, index, source) => source.findIndex((candidate) => candidate.id === account.id) === index);
    return sendJson(response, 200, { accounts });
  }

  const douyinAvatarMatch = url.pathname.match(/^\/v1\/connectors\/douyin\/accounts\/([^/]+)\/avatar$/);
  if (request.method === "GET" && douyinAvatarMatch) {
    const agentId = decodeURIComponent(douyinAvatarMatch[1]);
    const requestedAccountId = optionalText(url.searchParams.get("accountId"));
    const record = security.douyinAgentCloudRegistry?.list?.().find((item) =>
      item?.agentId === agentId && (!requestedAccountId || item.accountId === requestedAccountId)
    );
    const identity = await refreshExpiredDouyinAvatarIdentity({ agentId, record, security });
    const source = douyinAvatarSource(identity);
    if (!source) throw new ControlPlaneError("抖音账号头像不存在", {
      code: "DOUYIN_ACCOUNT_AVATAR_NOT_FOUND",
      statusCode: 404,
      details: { agentId }
    });
    const cacheKey = `${agentId}:${source}`;
    let avatar = security.douyinAvatarCache?.get(cacheKey);
    if (!avatar) {
      avatar = await security.douyinAvatarFetcher(source);
      if (!avatar?.body?.length || !String(avatar.contentType || "").startsWith("image/")) {
        throw new ControlPlaneError("抖音账号头像读取失败", {
          code: "DOUYIN_ACCOUNT_AVATAR_UNAVAILABLE",
          statusCode: 502,
          details: { agentId }
        });
      }
      security.douyinAvatarCache?.set(cacheKey, avatar);
      while ((security.douyinAvatarCache?.size || 0) > 100) {
        security.douyinAvatarCache.delete(security.douyinAvatarCache.keys().next().value);
      }
    }
    response.statusCode = 200;
    response.setHeader("Content-Type", avatar.contentType);
    response.setHeader("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
    return response.end(avatar.body);
  }

  if (request.method === "POST" && url.pathname === "/v1/browser-sessions") {
    const body = withTenantScope(await readJson(request, bodyLimit), principal);
    if (body.provider === "douyin" && security.douyinMcpService?.configured === true) {
      throw new ControlPlaneError("抖音授权必须通过 Douyin MCP 云电脑，已阻止本地浏览器启动", {
        code: "DOUYIN_MCP_REQUIRED",
        statusCode: 410
      });
    }
    let cloudDesktop = null;
    let rpa = null;
    if (security.cloudDesktopMode === "cluehunter") {
      if (!security.cloudDesktopService || security.cloudDesktopService.configured !== true) {
        throw new ControlPlaneError("ClueHunter 云电脑未配置，已阻止本地浏览器降级", {
          code: "CLOUD_DESKTOP_NOT_CONFIGURED",
          statusCode: 503,
          details: { required: security.cloudDesktopService?.missing || [] }
        });
      }
      const cloudInput = {
        uid: body.executorUid || body.uid,
        tenant: body.legacyTenant || body.tenant || body.tenantId,
        regionId: body.regionId,
        robotInfoId: body.robotInfoId
      };
      const connection = typeof security.cloudDesktopService.connect === "function"
        ? await security.cloudDesktopService.connect(cloudInput)
        : { cloudDesktop: await security.cloudDesktopService.ensureReady(cloudInput) };
      cloudDesktop = connection.cloudDesktop || connection;
      rpa = connection.rpa || null;
    }
    const session = await browserWorkspace.start(body);
    return sendJson(response, 202, cloudDesktop ? { ...session, cloudDesktop, rpa } : session);
  }

  if (request.method === "POST" && url.pathname === "/v1/cloud-desktops/connect") {
    if (!security.cloudDesktopService || security.cloudDesktopService.configured !== true) {
      throw new ControlPlaneError("ClueHunter 云电脑与 RPA 未配置", {
        code: "CLOUD_DESKTOP_NOT_CONFIGURED",
        statusCode: 503,
        details: { required: security.cloudDesktopService?.missing || [] }
      });
    }
    const body = withTenantScope(await readJson(request, bodyLimit), principal);
    if (typeof security.cloudDesktopService.connect !== "function") {
      throw new ControlPlaneError("云电脑服务不支持 RPA 连接编排", {
        code: "CLOUD_DESKTOP_CONNECTOR_INVALID",
        statusCode: 503
      });
    }
    const connection = await security.cloudDesktopService.connect({
      uid: body.executorUid || body.uid,
      tenant: body.legacyTenant || body.tenant || body.tenantId,
      regionId: body.regionId,
      robotInfoId: body.robotInfoId
    });
    return sendJson(response, 202, connection);
  }

  if (request.method === "POST" && url.pathname === "/v1/cloud-desktops/apply") {
    if (!security.cloudDesktopService || security.cloudDesktopService.configured !== true) {
      throw new ControlPlaneError("ClueHunter 云电脑未配置", {
        code: "CLOUD_DESKTOP_NOT_CONFIGURED",
        statusCode: 503,
        details: { required: security.cloudDesktopService?.missing || [] }
      });
    }
    const body = withTenantScope(await readJson(request, bodyLimit), principal);
    return sendJson(response, 202, await security.cloudDesktopService.apply(body));
  }

  if (request.method === "POST" && url.pathname === "/v1/cloud-desktops/status") {
    if (!security.cloudDesktopService || security.cloudDesktopService.configured !== true) {
      throw new ControlPlaneError("ClueHunter 云电脑未配置", {
        code: "CLOUD_DESKTOP_NOT_CONFIGURED",
        statusCode: 503,
        details: { required: security.cloudDesktopService?.missing || [] }
      });
    }
    const body = withTenantScope(await readJson(request, bodyLimit), principal);
    return sendJson(response, 200, await security.cloudDesktopService.status(body));
  }

  const browserMatch = url.pathname.match(/^\/v1\/browser-sessions\/([^/]+)(?:\/(authorize|navigate|close))?$/);
  if (browserMatch) {
    const sessionId = decodeURIComponent(browserMatch[1]);
    const operation = browserMatch[2];
    await assertBrowserSessionTenant(browserWorkspace, sessionId, principal);
    if (request.method === "GET" && !operation) return sendJson(response, 200, await browserWorkspace.snapshot(sessionId));
    if (request.method === "POST" && operation === "authorize") return sendJson(response, 200, await browserWorkspace.authorize(sessionId));
    if (request.method === "POST" && operation === "navigate") {
      const body = await readJson(request, bodyLimit);
      return sendJson(response, 200, await browserWorkspace.navigate(sessionId, body.url));
    }
    if (request.method === "POST" && operation === "close") return sendJson(response, 200, await browserWorkspace.close(sessionId));
  }

  if (request.method === "POST" && url.pathname === "/v1/chief/messages/decision") {
    const body = withTenantScope(await readJson(request, bodyLimit), principal);
    return sendJson(response, 200, await controlPlane.decideChiefMessage({
      message: body.message || body.text || body.content,
      context: {
        ...(body.context && typeof body.context === "object" && !Array.isArray(body.context) ? body.context : {}),
        tenantId: principal?.tenantId || body.tenantId || null
      }
    }));
  }

  if (url.pathname === "/v1/direct-messages") {
    const agentStore = security.agentStore;
    if (!agentStore || typeof agentStore.listDm !== "function" || typeof agentStore.appendDm !== "function") {
      throw new ControlPlaneError("私聊消息存储未配置", { code: "DIRECT_MESSAGE_STORE_UNAVAILABLE", statusCode: 503 });
    }
    if (request.method === "GET") {
      const agentType = optionalText(url.searchParams.get("agentType")) || "main";
      const conversationId = optionalText(url.searchParams.get("conversationId"));
      const accountId = optionalText(url.searchParams.get("accountId"));
      const storedId = scopedDirectMessageAgentId(agentType, principal, accountId);
      let stored = agentStore.listDm(storedId);
      const owner = directMessageOwner(agentType, principal, accountId);
      if (resumePendingDirectAccountAnalysis({ security, principal, agentStore, storedId, agentType, messages: stored })) {
        stored = agentStore.listDm(storedId);
      }
      const messages = (security.companion.supports(agentType) ? security.companion.recover(owner, stored) : stored)
        .filter((message) => !conversationId || message.conversationId === conversationId)
        .slice(-200)
        .map((message) => ({ ...message, agentType }));
      return sendJson(response, 200, { accepted: true, data: { messages } });
    }
    if (request.method === "POST") {
      const body = withTenantScope(await readJson(request, bodyLimit), principal);
      const agentType = optionalText(body.agentType) || "main";
      const text = optionalText(body.text);
      if (!text) throw new ControlPlaneError("私聊消息不能为空", { code: "DIRECT_MESSAGE_TEXT_REQUIRED", statusCode: 400 });
      if (text.length > 3000) throw new ControlPlaneError("这条消息有点长，请分开说", { statusCode: 400 });
      const clientMessageId = optionalText(body.clientMessageId)?.slice(0, 100);
      const accountId = optionalText(body.accountId);
      const storedId = scopedDirectMessageAgentId(agentType, principal, accountId);
      const duplicate = clientMessageId && agentStore.listDm(storedId).find(item => item.from === "user" && item.metadata?.clientMessageId === clientMessageId);
      if (duplicate) return sendJson(response, 200, { accepted: true, data: { message: { ...duplicate, agentType } } });
      const metadata = body.metadata && typeof body.metadata === "object" ? { ...body.metadata } : {};
      delete metadata.companion; delete metadata.companionReply;
      if (clientMessageId) metadata.clientMessageId = clientMessageId;
      const from = optionalText(body.from) || "user";
      if (from === "user" && !isChiefAgentType(agentType)) {
        Object.assign(metadata, specialistConversationMetadata({ ...body, ...metadata }));
      }
      const conversationId = optionalText(body.conversationId);
      const pendingProposal = from === "user"
        ? pendingReceptionStrategyProposal(agentStore.listDm(storedId), agentType, conversationId)
        : null;
      const receptionConfirmation = from === "user" && pendingProposal && isReceptionStrategyConfirmation(text)
        ? confirmReceptionStrategyProposal({
          registry: security.douyinAgentCloudRegistry,
          store: security.accountReceptionStore,
          agentType,
          accountId,
          tenantId: principal.tenantId || null,
          proposal: pendingProposal.metadata.receptionStrategyProposal
        })
        : null;
      const receptionProposal = from === "user" && !receptionConfirmation
        ? updateReceptionStrategyFromConversation({
          registry: security.douyinAgentCloudRegistry,
          store: security.accountReceptionStore,
          agentType,
          accountId,
          tenantId: principal.tenantId || null,
          text
        })
        : null;
      if (receptionProposal) {
        metadata.receptionStrategyProposal = {
          status: "requested",
          changes: receptionProposal.changes,
          expectedRevision: receptionProposal.expectedRevision,
          accountId: receptionProposal.accountId
        };
      }
      if (receptionConfirmation?.record) {
        metadata.receptionStrategyConfirmation = {
          changes: receptionConfirmation.changes,
          revision: receptionConfirmation.record.revision,
          proposalMessageId: pendingProposal.id
        };
      }
      const message = agentStore.appendDm(storedId, {
        from,
        fromName: optionalText(body.fromName) || (body.from === "user" ? "我" : agentType),
        text,
        artifact: body.artifact && typeof body.artifact === "object" ? body.artifact : null,
        conversationId: optionalText(body.conversationId),
        metadata
      });
      const acquisitionBusinessReply = from === "user"
        && metadata.suppressAutoReply !== true
        && security.acquisitionBusinessConversation?.supports?.(agentType)
        ? await security.acquisitionBusinessConversation.handle({
          agentType,
          text,
          context: {
            ...body,
            ...metadata,
            agentId: agentType,
            tenantId: principal.tenantId || body.tenantId || null
          },
          messages: agentStore.listDm(storedId)
        })
        : null;
      if (acquisitionBusinessReply) {
        const reply = agentStore.appendDm(storedId, {
          from: agentType,
          fromName: RECEPTION_STRATEGY_AGENT_NAMES[agentType] || agentType,
          text: acquisitionBusinessReply.text,
          conversationId: optionalText(body.conversationId),
          metadata: {
            source: "acquisition-business-conversation",
            ...(acquisitionBusinessReply.metadata || {}),
            inReplyTo: message.id
          }
        });
        return sendJson(response, 201, { accepted: true, data: { message: { ...message, agentType }, reply: { ...reply, agentType } } });
      }
      const directAnalysis = from === "user" ? directAccountAnalysisInput(agentType, text) : null;
      if (directAnalysis) {
        startDirectAccountAnalysis({
          security,
          principal,
          agentStore,
          storedId,
          agentType,
          message,
          input: directAnalysis,
          conversationId: optionalText(body.conversationId)
        });
        return sendJson(response, 201, { accepted: true, data: { message: { ...message, agentType } } });
      }
      if (receptionConfirmation?.stale) {
        agentStore.appendDm(storedId, {
          from: agentType,
          fromName: RECEPTION_STRATEGY_AGENT_NAMES[agentType] || agentType,
          text: "这份调整在你确认前已经被其他操作更新了。我已保留当前对话，请重新告诉我需要怎么调整。",
          conversationId: optionalText(body.conversationId),
          metadata: {
            source: "reception-strategy",
            receptionStrategyProposal: { status: "stale", inReplyTo: message.id }
          }
        });
      }
      if (receptionConfirmation?.record) {
        agentStore.appendDm(storedId, {
          from: agentType,
          fromName: RECEPTION_STRATEGY_AGENT_NAMES[agentType] || agentType,
          text: receptionConfirmation.confirmation,
          conversationId: optionalText(body.conversationId),
          metadata: {
            source: "reception-strategy",
            receptionStrategyConfirmation: {
              changes: receptionConfirmation.changes,
              revision: receptionConfirmation.record.revision,
              inReplyTo: message.id,
              proposalMessageId: pendingProposal.id
            }
          }
        });
      }
      if (receptionProposal) {
        agentStore.appendDm(storedId, {
          from: agentType,
          fromName: RECEPTION_STRATEGY_AGENT_NAMES[agentType] || agentType,
          text: receptionProposal.confirmation,
          conversationId: optionalText(body.conversationId),
          metadata: {
            source: "reception-strategy",
            receptionStrategyProposal: {
              status: "pending",
              settings: receptionProposal.settings,
              changes: receptionProposal.changes,
              expectedRevision: receptionProposal.expectedRevision,
              accountId: receptionProposal.accountId,
              inReplyTo: message.id
            }
          }
        });
      }
      if (!receptionProposal && !receptionConfirmation && message.from === "user" && metadata.suppressAutoReply !== true && security.companion.supports(agentType)) {
        const companionReply = { phase: "thinking" };
        const durable = typeof agentStore.updateDm === "function"
          ? agentStore.updateDm(storedId, message.id, { metadata: { ...metadata, companionReply } })
          : null;
        message.metadata = durable?.metadata || { ...metadata, companionReply };
        void security.companion.reply({
          ...directMessageOwner(agentType, principal, accountId),
          conversationRole: metadata.conversationRole || null,
          taskScope: {
            taskId: metadata.taskId || optionalText(body.taskId) || null,
            taskRunId: metadata.taskRunId || optionalText(body.taskRunId) || null,
            accountId: metadata.accountId || optionalText(body.accountId) || null,
            conversationId: metadata.conversationId || optionalText(body.conversationId) || null
          }
        }, message).catch(() => {});
      }
      return sendJson(response, 201, { accepted: true, data: { message: { ...message, agentType } } });
    }
    if (request.method === "DELETE") {
      if (typeof agentStore.clearDm !== "function") {
        throw new ControlPlaneError("私聊消息存储不支持清理", { code: "DIRECT_MESSAGE_DELETE_UNAVAILABLE", statusCode: 503 });
      }
      const body = withTenantScope(await readJson(request, bodyLimit), principal);
      const agentType = requiredText(body.agentType, "agentType");
      const conversationId = optionalText(body.conversationId);
      if (!conversationId && body.confirmAll !== true) {
        throw new ControlPlaneError("清空全部私聊记录前需要明确确认", {
          code: "DIRECT_MESSAGE_CLEAR_CONFIRMATION_REQUIRED",
          statusCode: 400
        });
      }
      return sendJson(response, 200, {
        accepted: true,
        data: agentStore.clearDm(scopedDirectMessageAgentId(agentType, principal, optionalText(body.accountId)), { conversationId })
      });
    }
  }

  const taskMatch = url.pathname.match(/^\/v1\/tasks\/([^/]+)(?:\/(events|snapshot|start|commands))?$/);
  if (request.method === "GET" && taskMatch) {
    const taskId = decodeURIComponent(taskMatch[1]);
    assertTaskTenant(controlPlane, taskId, principal);
    if (taskMatch[2] === "events") {
      const afterSeq = parseNonNegativeInteger(url.searchParams.get("afterSeq"), 0);
      const limit = parseNonNegativeInteger(url.searchParams.get("limit"), 100);
      return sendJson(response, 200, { taskId, events: controlPlane.listTaskEvents(taskId, { afterSeq, limit }) });
    }
    return sendJson(response, 200, controlPlane.getTaskSnapshot(taskId));
  }

  if (request.method === "POST" && url.pathname === "/v1/commands") {
    let body = withTenantScope(await readJson(request, bodyLimit), principal);
    assertTaskTenant(controlPlane, body.taskId, principal);
    if (isAccessScopeConfirmation(body)) {
      const payload = body.payload && typeof body.payload === "object" ? body.payload : {};
      const sessionId = payload.browserSessionId || body.browserSessionId;
      if (!sessionId) {
        throw new ControlPlaneError("确认访问范围前必须绑定浏览器会话", {
          code: "BROWSER_SESSION_REQUIRED",
          statusCode: 400
        });
      }
      const session = String(sessionId).startsWith("douyin-mcp:")
        ? await verifyDouyinMcpSession(security.douyinMcpService, sessionId, payload)
        : (await assertBrowserSessionTenant(browserWorkspace, sessionId, principal), await browserWorkspace.authorize(sessionId));
      if (session.taskId && body.taskId && session.taskId !== body.taskId) {
        throw new ControlPlaneError("浏览器会话与当前任务不匹配", {
          code: "BROWSER_SESSION_TASK_MISMATCH",
          statusCode: 409,
          details: { sessionId, taskId: body.taskId, sessionTaskId: session.taskId }
        });
      }
      body = {
        ...body,
        payload: {
          ...payload,
          browserSessionId: session.sessionId,
          provider: payload.provider || session.provider,
          accountLabel: payload.accountLabel || session.accountLabel || null
        }
      };
    }
    // Acquisition task configuration is owned by the long-running service.
    // Route this strategy-only mutation directly to that service so a failed
    // validation cannot partially advance the generic control-plane task.
    if (isAcquisitionConfigCommand(body)) {
      assertAcquisitionControlPlaneVersion(controlPlane, body);
      const acquisitionTask = await applyAcquisitionConfigCommand(acquisitionService, body, principal);
      return sendJson(response, 202, {
        accepted: true,
        commandId: body.commandId || null,
        idempotencyKey: body.idempotencyKey || null,
        taskId: body.taskId || acquisitionTask.context?.taskId || null,
        taskRunId: body.taskRunId || acquisitionTask.context?.taskRunId || null,
        conversationId: body.conversationId || acquisitionTask.context?.conversationId || null,
        acquisitionTask: mapAcquisitionTask(acquisitionTask)
      });
    }
    const commandResult = await dispatchCommand(controlPlane, body, { acquisitionService, principal, stopCancelledInboxTask: security.stopCancelledInboxTask });
    return sendJson(response, 202, commandResult);
  }

  if (request.method === "POST" && url.pathname === "/v1/tasks") {
    const body = withTenantScope(await readJson(request, bodyLimit), principal);
    return sendJson(response, 202, await dispatchCommand(controlPlane, toCommandBody(body, "task.create"), { acquisitionService, principal, stopCancelledInboxTask: security.stopCancelledInboxTask }));
  }

  if (taskMatch && request.method === "DELETE") {
    if (taskMatch[2]) throw new ControlPlaneError("该任务资源不支持删除", { statusCode: 405 });
    const taskId = decodeURIComponent(taskMatch[1]);
    assertTaskTenant(controlPlane, taskId, principal);
    const task = controlPlane.getTaskSnapshot(taskId);
    const replay = security.officeReplayStore?.purge && task.agentId
      ? security.officeReplayStore.purge({ tenantId: principal.tenantId || null, agentId: task.agentId, taskId })
      : null;
    const deleted = controlPlane.purgeTask(taskId);
    return sendJson(response, 200, { ...deleted, replay });
  }

  if (taskMatch && request.method === "POST") {
    const taskId = decodeURIComponent(taskMatch[1]);
    assertTaskTenant(controlPlane, taskId, principal);
    const body = withTenantScope(await readJson(request, bodyLimit), principal);
    if (taskMatch[2] === "start") {
      return sendJson(response, 202, await dispatchCommand(controlPlane, toCommandBody(body, "task.run.start", taskId), { acquisitionService, principal, stopCancelledInboxTask: security.stopCancelledInboxTask }));
    }
    if (taskMatch[2] === "commands") {
      return sendJson(response, 202, await dispatchCommand(controlPlane, { ...body, taskId }, { acquisitionService, principal, stopCancelledInboxTask: security.stopCancelledInboxTask }));
    }
  }

  throw new ControlPlaneError("Route not found", { code: "NOT_FOUND", statusCode: 404 });
}

async function dispatchCommand(controlPlane, body, { acquisitionService = null, principal = null, stopCancelledInboxTask = null } = {}) {
  const result = typeof controlPlane.dispatchAsync === "function"
    ? await controlPlane.dispatchAsync(body)
    : controlPlane.dispatch(body);
  await stopCancelledAcquisitionTask(acquisitionService, body, result, principal);
  await stopCancelledInboxTask?.(body, result, principal);
  return result;
}

function isTaskCancellation(command = {}) {
  const type = String(command.type || command.commandType || "").trim().toLowerCase();
  return type === "task.cancel" || (!type && String(command.action || "").trim().toLowerCase() === "cancel");
}

async function stopCancelledAcquisitionTask(acquisitionService, command = {}, result = {}, principal = null) {
  if (!isTaskCancellation(command) || String(result?.state || "").toUpperCase() !== "CANCELLED") return;
  if (!acquisitionService || typeof acquisitionService.stop !== "function") return;
  const payload = command.payload && typeof command.payload === "object" ? command.payload : {};
  const resolvedCommand = {
    ...command,
    taskId: result.taskId || command.taskId || payload.taskId,
    taskRunId: command.taskRunId || payload.taskRunId || payload.runId,
    conversationId: command.conversationId || payload.conversationId,
    agentId: command.agentId || payload.agentId,
    accountId: command.accountId || payload.accountId
  };
  const key = optionalText(command.acquisitionTaskKey || payload.acquisitionTaskKey)
    || resolveAcquisitionTaskKey(acquisitionService, resolvedCommand, payload);
  if (!key) return;
  if (principal?.tenantId) assertAcquisitionServiceTaskTenant(acquisitionService, key, principal);
  await acquisitionService.stop(key, "user_cancelled");
}

async function applyAcquisitionConfigCommand(acquisitionService, command = {}, principal = null) {
  if (!acquisitionService || typeof acquisitionService.updateTaskConfig !== "function") return null;
  const type = String(command.type || command.commandType || command.action || "").trim().toLowerCase();
  if (!["task.config.update", "task.configuration.update", "task.strategy.update", "task.touch_content.update"].includes(type)) return null;
  const payload = command.payload && typeof command.payload === "object" ? command.payload : command;
  const explicitKey = optionalText(command.acquisitionTaskKey || payload.acquisitionTaskKey);
  const key = explicitKey || resolveAcquisitionTaskKey(acquisitionService, command, payload);
  if (!key) throw new ControlPlaneError("找不到唯一的获客任务，拒绝更新策略", { code: "DOUYIN_ACQUISITION_TASK_NOT_FOUND", statusCode: 404 });
  const task = acquisitionService.status(key);
  const expectedVersion = Number(command.expectedVersion);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 0) {
    throw new ControlPlaneError("获客策略更新必须携带任务版本", { code: "DOUYIN_ACQUISITION_TASK_VERSION_REQUIRED", statusCode: 400 });
  }
  if (command.taskId && task.context?.taskId !== command.taskId) {
    throw new ControlPlaneError("获客任务与控制面任务不匹配", { code: "DOUYIN_ACQUISITION_TASK_MISMATCH", statusCode: 409 });
  }
  if (principal?.tenantId) assertAcquisitionServiceTaskTenant(acquisitionService, key, principal);
  return acquisitionService.updateTaskConfig(key, { ...payload, expectedVersion });
}

function isAcquisitionConfigCommand(command = {}) {
  const type = String(command.type || command.commandType || command.action || "").trim().toLowerCase();
  if (!["task.config.update", "task.configuration.update", "task.strategy.update", "task.touch_content.update"].includes(type)) return false;
  const payload = command.payload && typeof command.payload === "object" ? command.payload : {};
  const agentId = optionalText(command.agentId || payload.agentId);
  return ACQUISITION_AGENT_IDS.has(agentId)
    || Boolean(optionalText(command.acquisitionTaskKey || payload.acquisitionTaskKey));
}

function resolveAcquisitionTaskKey(acquisitionService, command, payload) {
  if (typeof acquisitionService.listTasks !== "function") return null;
  const values = {
    taskId: optionalText(command.taskId || payload.taskId),
    taskRunId: optionalText(command.taskRunId || payload.taskRunId || payload.runId),
    conversationId: optionalText(command.conversationId || payload.conversationId),
    accountId: optionalText(command.accountId || payload.accountId),
    agentId: optionalText(command.agentId || payload.agentId),
    tenantId: optionalText(command.tenantId || payload.tenantId)
  };
  const candidates = acquisitionService.listTasks().filter((task) => {
    const context = task?.context || {};
    return Object.entries(values).every(([field, value]) => !value || String(context[field] || "") === value);
  });
  return candidates.length === 1 ? candidates[0].key : null;
}

function withTenantScope(body, principal) {
  const source = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  const tenantId = principal?.tenantId || null;
  if (!tenantId) return source;
  const payload = source.payload && typeof source.payload === "object" && !Array.isArray(source.payload)
    ? source.payload
    : null;
  const executionContext = payload?.executionContext && typeof payload.executionContext === "object" && !Array.isArray(payload.executionContext)
    ? payload.executionContext
    : null;
  const supplied = [source.tenantId, payload?.tenantId, executionContext?.tenantId]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  if (supplied.some((value) => value !== tenantId)) {
    throw new ControlPlaneError("请求超出当前 API key 的租户范围", {
      code: "TENANT_SCOPE_FORBIDDEN",
      statusCode: 403,
      details: { tenantId }
    });
  }
  if (!payload) return { ...source, tenantId };
  return {
    ...source,
    tenantId,
    payload: {
      ...payload,
      tenantId,
      ...(executionContext ? { executionContext: { ...executionContext, tenantId } } : {})
    }
  };
}

function directMessageAccountScope(agentType, accountId = null) {
  if (!ACCOUNT_SCOPED_DIRECT_MESSAGE_AGENT_IDS.has(agentType)) return null;
  const value = optionalText(accountId) || "unassigned";
  return `account-${createHmac("sha256", "byering-direct-message-account-scope").update(value).digest("hex").slice(0, 24)}`;
}

function directMessageOwner(agentType, principal, accountId = null) {
  return {
    agentId: agentType,
    tenantId: principal?.tenantId || null,
    accountScope: directMessageAccountScope(agentType, accountId)
  };
}

function scopedDirectMessageAgentId(agentType, principal, accountId = null) {
  if (!agentType || /[\\/:\u0000]/.test(agentType) || /^\.+$/.test(agentType) || agentType.length > 120) {
    throw new ControlPlaneError("成员名称无效", { code: "DIRECT_MESSAGE_AGENT_INVALID", statusCode: 400 });
  }
  const tenantId = optionalText(principal?.tenantId);
  const accountScope = directMessageAccountScope(agentType, accountId);
  return `${tenantId ? `${tenantId}::` : ""}${agentType}${accountScope ? `::${accountScope}` : ""}`;
}

function resolveVerifiedOutreachLead(store, { request = {}, lead = {}, tenantId = null, accountId = null } = {}) {
  if (!store || typeof store.list !== "function") {
    throw new ControlPlaneError("潜客成果存储未配置", {
      code: "CORE_AGENT_OUTREACH_LEAD_STORE_UNAVAILABLE",
      statusCode: 503
    });
  }
  const inputLead = request?.lead && typeof request.lead === "object" ? request.lead : {};
  const inputCandidate = request?.candidate && typeof request.candidate === "object" ? request.candidate : {};
  const sourceRecordId = optionalText(
    inputLead.sourceRecordId || inputLead.source_record_id || inputLead.recordId || inputLead.record_id || inputLead.leadId || inputLead.lead_id ||
    inputCandidate.sourceRecordId || inputCandidate.source_record_id || inputCandidate.recordId || inputCandidate.record_id || inputCandidate.leadId || inputCandidate.lead_id ||
    request?.sourceRecordId || request?.source_record_id || request?.recordId || request?.record_id || request?.leadId || request?.lead_id
  );
  if (!sourceRecordId) {
    throw new ControlPlaneError("请从成果中心选择已核验的潜客后再触达", {
      code: "CORE_AGENT_OUTREACH_LEAD_UNVERIFIED",
      statusCode: 409,
      details: { field: "sourceRecordId" }
    });
  }
  const record = store.list(tenantId || null).find((item) => String(item?.id || "") === sourceRecordId);
  if (!record) {
    throw new ControlPlaneError("这位潜客不在当前租户的成果中心，不能发起触达", {
      code: "CORE_AGENT_OUTREACH_LEAD_UNVERIFIED",
      statusCode: 409,
      details: { sourceRecordId }
    });
  }
  if (!isVerifiedContactableProspectRecord(record)) {
    throw new ControlPlaneError("这位用户的来源不具备私信触达资格", {
      code: "CORE_AGENT_OUTREACH_LEAD_UNVERIFIED",
      statusCode: 409,
      details: { sourceRecordId }
    });
  }
  if (optionalText(record.status) !== "待触达") {
    throw new ControlPlaneError("这位潜客当前不处于待触达状态，不能重复发送", {
      code: "CORE_AGENT_OUTREACH_LEAD_UNAVAILABLE",
      statusCode: 409,
      details: { sourceRecordId, status: optionalText(record.status) || null }
    });
  }
  const source = record.source && typeof record.source === "object" ? record.source : {};
  const recordAccountId = optionalText(
    record.accountId || record.account_id || record.sourceAccountId || record.source_account_id ||
    source.accountId || source.account_id || source.sourceAccountId || source.source_account_id
  );
  const targetAccountId = optionalText(accountId || request?.accountId || request?.account_id || request?.accountKey || request?.account_key);
  if (targetAccountId && !recordAccountId) {
    throw new ControlPlaneError("这位潜客缺少来源账号，不能发起跨账号不可核验的触达", {
      code: "CORE_AGENT_OUTREACH_ACCOUNT_UNVERIFIED",
      statusCode: 409,
      details: { sourceRecordId }
    });
  }
  if (targetAccountId && targetAccountId !== recordAccountId) {
    throw new ControlPlaneError("这位潜客不属于当前抖音账号，不能跨账号触达", {
      code: "CORE_AGENT_OUTREACH_ACCOUNT_MISMATCH",
      statusCode: 409,
      details: { sourceRecordId }
    });
  }
  return {
    ...record,
    sourceRecordId,
    secId: optionalText(
      record.secId || record.sec_id || record.douyinSecId || record.douyin_sec_id
      || source.secId || source.sec_id || source.douyinSecId || source.douyin_sec_id
      || record.contact?.secId || record.contact?.sec_id
    ),
    secUid: optionalText(
      record.secUid || record.sec_uid || record.douyinSecUid || record.douyin_sec_uid
      || source.secUid || source.sec_uid || source.douyinSecUid || source.douyin_sec_uid
      || record.contact?.secUid || record.contact?.sec_uid
    )
  };
}

const CONTACTABLE_PROSPECT_SOURCE_SCOPES = new Set([
  "own_account_comments",
  "own_account_live",
  "own_account_interactions",
  "own_account_all_signals",
  "own_inbox"
]);

function normalizedProspectSourceScope(value) {
  const raw = value && typeof value === "object"
    ? value.kind || value.type || value.sourceScope || value.scope || value.origin
    : value;
  const scope = optionalText(raw).toLowerCase().replace(/[\s-]+/g, "_");
  if (["authorized_account_comments", "authorized_account_works", "own_account_comments", "own_works", "self_comments", "own_comments"].includes(scope)) return "own_account_comments";
  if (["authorized_account_live", "own_account_live", "self_live", "own_live"].includes(scope)) return "own_account_live";
  if (["authorized_account_all_signals", "own_account_all_signals", "self_account_all_signals"].includes(scope)) return "own_account_all_signals";
  if (["authorized_account_interactions", "own_account_interactions", "own_interactions", "self_interactions"].includes(scope)) return "own_account_interactions";
  if (["authorized_account_inbox", "own_inbox", "inbox", "private_inbox"].includes(scope)) return "own_inbox";
  return scope;
}

function prospectSourceScope(record = {}) {
  const source = record?.source && typeof record.source === "object" ? record.source : {};
  return normalizedProspectSourceScope(
    record?.contactability?.sourceScope
    || record?.sourceScope
    || source.sourceScope
    || source.scope
    || source.type
    || source.sourceResultType
  );
}

function isVerifiedContactableProspectRecord(record = {}) {
  if (record?.contactability && typeof record.contactability.allowed === "boolean") {
    return record.contactability.allowed === true
      && CONTACTABLE_PROSPECT_SOURCE_SCOPES.has(prospectSourceScope(record));
  }
  return CONTACTABLE_PROSPECT_SOURCE_SCOPES.has(prospectSourceScope(record));
}

function sourceRecordIdFrom(value = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return optionalText(
    source.sourceRecordId || source.source_record_id || source.recordId || source.record_id || source.leadId || source.lead_id || source.id
  );
}

function verifiedAnalysisCandidate(record = {}) {
  const source = record.source && typeof record.source === "object" ? record.source : {};
  const evidence = Array.isArray(record.evidence) ? record.evidence : [];
  return {
    sourceRecordId: record.id,
    leadId: record.id,
    id: record.id,
    nickname: optionalText(record.nickname || record.name || record.account) || "抖音用户",
    uniqueId: (optionalText(record.uniqueId || record.unique_id || record.handle) || "").replace(/^@+/, ""),
    secId: optionalText(record.secId || record.sec_id || source.secId || source.sec_id || record.contact?.secId || record.contact?.sec_id),
    secUid: optionalText(record.secUid || record.sec_uid || source.secUid || source.sec_uid || record.contact?.secUid || record.contact?.sec_uid),
    text: optionalText(record.quote || record.comment || record.text || evidence[0]?.quote || record.reason || record.profile),
    source: {
      ...source,
      sourceScope: prospectSourceScope(record),
      accountId: optionalText(record.accountId || source.accountId || source.account_id),
      accountName: optionalText(record.accountName || source.accountName || source.account_name)
    },
    sourceScope: prospectSourceScope(record),
    evidence,
    profileUrl: optionalText(record.profileUrl || record.profile_url || source.profileUrl || source.profile_url)
  };
}

function prepareCoreAgentExecutionRequest(body = {}, {
  prospectRecordStore = null,
  principal = null,
  defaultAgentId = null
} = {}) {
  const request = body && typeof body === "object" && !Array.isArray(body) ? { ...body } : {};
  const agentId = optionalText(request.agentId) || optionalText(defaultAgentId);
  if (agentId) request.agentId = agentId;
  if (agentId !== "mkt-intent-analyst") return request;
  if (!prospectRecordStore || typeof prospectRecordStore.list !== "function") {
    throw new ControlPlaneError("潜客成果存储未配置", {
      code: "CORE_AGENT_ANALYSIS_RECORD_STORE_UNAVAILABLE",
      statusCode: 503
    });
  }
  const requestedCandidates = Array.isArray(request.candidates)
    ? request.candidates
    : (Array.isArray(request.leads) ? request.leads : []);
  if (!requestedCandidates.length) return request;
  const recordsById = new Map((prospectRecordStore.list(principal?.tenantId || request.tenantId || null) || [])
    .map((record) => [String(record?.id || ""), record]));
  const targetAccountId = optionalText(request.accountId || request.account_id || request.accountKey || request.account_key);
  let verifiedAccountId = targetAccountId;
  const candidates = requestedCandidates.map((candidate) => {
    const sourceRecordId = sourceRecordIdFrom(candidate);
    const record = sourceRecordId ? recordsById.get(sourceRecordId) : null;
    if (!record || !isVerifiedContactableProspectRecord(record)) {
      throw new ControlPlaneError("客户分析只能处理成果中心中来源可追溯的对象", {
        code: "CORE_AGENT_ANALYSIS_CANDIDATE_UNVERIFIED",
        statusCode: 409,
        details: { sourceRecordId: sourceRecordId || null }
      });
    }
    const source = record.source && typeof record.source === "object" ? record.source : {};
    const recordAccountId = optionalText(record.accountId || record.account_id || source.accountId || source.account_id);
    if (!recordAccountId) {
      throw new ControlPlaneError("客户分析对象缺少来源账号，不能纳入可追溯分析", {
        code: "CORE_AGENT_ANALYSIS_ACCOUNT_UNVERIFIED",
        statusCode: 409,
        details: { sourceRecordId }
      });
    }
    if (verifiedAccountId && recordAccountId !== verifiedAccountId) {
      throw new ControlPlaneError("客户分析不能混入其他抖音账号的成果", {
        code: "CORE_AGENT_ANALYSIS_ACCOUNT_MISMATCH",
        statusCode: 409,
        details: { sourceRecordId }
      });
    }
    verifiedAccountId ||= recordAccountId;
    return verifiedAnalysisCandidate(record);
  });
  return { ...request, ...(verifiedAccountId ? { accountId: verifiedAccountId } : {}), candidates };
}

function requireAcquisitionService(service) {
  if (!service || typeof service.status !== "function") {
    throw new ControlPlaneError("抖音获客服务未配置", { code: "DOUYIN_ACQUISITION_NOT_CONFIGURED", statusCode: 503 });
  }
}

function validateAcquisitionContext(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const context = {
    agentId: optionalText(source.agentId || source.agent_id),
    taskId: optionalText(source.taskId || source.task_id),
    taskRunId: optionalText(source.taskRunId || source.task_run_id || source.runId),
    conversationId: optionalText(source.conversationId || source.conversation_id),
    accountId: optionalText(source.accountId || source.account_id),
    tenantId: optionalText(source.tenantId || source.tenant_id) || null
  };
  const executionAgentId = optionalText(source.executionAgentId || source.execution_agent_id);
  if (executionAgentId) context.executionAgentId = executionAgentId;
  for (const field of ["agentId", "taskId", "taskRunId", "conversationId", "accountId"]) {
    if (!context[field]) throw new ControlPlaneError(`${field} is required`, { code: "DOUYIN_ACQUISITION_CONTEXT_REQUIRED", statusCode: 400, details: { field } });
  }
  return context;
}

function acquisitionRuntimeAgentId(context = {}) {
  const source = context?.context && typeof context.context === "object" ? context.context : context;
  return optionalText(source?.executionAgentId || source?.execution_agent_id || source?.agentId);
}

async function acquisitionApproval(service, key, body) {
  const decision = optionalText(body.decision || body.action).toLowerCase();
  if (decision === "approve") return service.approveTouch(key, requiredText(body.touchId || body.touch_id, "touchId"));
  if (decision === "reject") return service.rejectTouch(key, requiredText(body.touchId || body.touch_id, "touchId"), optionalText(body.reason) || "user_rejected");
  if (decision === "batch" || Array.isArray(body.touchIds || body.touch_ids)) {
    return service.approveBatch(key, { touchIds: body.touchIds || body.touch_ids || [], templateVersion: body.templateVersion || body.template_version || null });
  }
  throw new ControlPlaneError("approval decision must be approve, reject, or batch", { code: "DOUYIN_TOUCH_APPROVAL_INVALID", statusCode: 400 });
}

function mapAcquisitionTask(task) {
  const source = task && typeof task === "object" ? task : {};
  const mapping = normalizeAcquisitionTaskStatus(source.state);
  return redactAcquisition({ ...source, ...(mapping || { taskState: source.state, runtimeState: null, health: source.health || "UNKNOWN" }) });
}

function mapAcquisitionTaskSummary(task) {
  const source = task && typeof task === "object" ? task : {};
  const context = source.context && typeof source.context === "object" ? source.context : {};
  const mapped = normalizeAcquisitionTaskStatus(source.state);
  const configurationVersion = Number.isInteger(Number(source.configurationVersion ?? source.configVersion ?? source.configuration?.version))
    ? Number(source.configurationVersion ?? source.configVersion ?? source.configuration?.version)
    : null;
  return redactAcquisition({
    key: source.key || null,
    agentId: optionalText(context.agentId || source.agentId) || null,
    taskId: optionalText(context.taskId || source.taskId) || null,
    taskRunId: optionalText(context.taskRunId || source.taskRunId) || null,
    conversationId: optionalText(context.conversationId || source.conversationId) || null,
    accountId: optionalText(context.accountId || source.accountId) || null,
    tenantId: optionalText(context.tenantId || source.tenantId) || null,
    state: source.state || null,
    taskState: mapped?.taskState || source.state || null,
    runtimeState: mapped?.runtimeState || null,
    health: mapped?.health || source.health || "UNKNOWN",
    version: Number.isInteger(Number(source.version)) ? Number(source.version) : null,
    eventSeq: Number.isInteger(Number(source.eventSeq)) ? Number(source.eventSeq) : null,
    configVersion: configurationVersion,
    configurationVersion,
    configuration: configurationVersion == null ? null : { version: configurationVersion },
    accountIdentity: source.accountIdentity || null,
    createdAt: source.createdAt || null,
    updatedAt: source.updatedAt || null
  });
}

function controlPlaneResultStatus(state) {
  const normalized = String(state || "").trim().toLowerCase();
  if (["completed", "succeeded", "success", "done"].includes(normalized)) return "completed";
  if (["cancelled", "canceled", "stopped"].includes(normalized)) return "cancelled";
  if (["failed", "error", "blocked"].includes(normalized)) return "failed";
  if (["paused", "degraded"].includes(normalized)) return "partial";
  return "running";
}

function acquisitionResultStatus(state) {
  return controlPlaneResultStatus(state);
}

function mapAcquisitionResult(result) {
  if (!result || typeof result !== "object") return result;
  if (result.task && typeof result.task === "object") return { ...result, task: mapAcquisitionTask(result.task) };
  if (result.context || result.state) return mapAcquisitionTask(result);
  return result;
}

function validateAcquisitionEvent(body) {
  const source = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  const context = validateAcquisitionContext(source);
  const eventType = optionalText(source.type || source.eventType || source.event_type);
  if (!eventType) throw new ControlPlaneError("event type is required", { code: "DOUYIN_ACQUISITION_EVENT_INVALID", statusCode: 400 });
  return {
    eventId: optionalText(source.eventId || source.event_id || source.id) || null,
    type: eventType,
    ...context,
    occurredAt: optionalText(source.occurredAt || source.occurred_at) || new Date().toISOString(),
    payload: redactAcquisition(source.payload && typeof source.payload === "object" ? source.payload : {})
  };
}

function isAcquisitionConfigurationEvent(type) {
  const normalized = String(type || "").trim().toLowerCase();
  return normalized === "config_updated"
    || normalized === "configuration_updated"
    || normalized === "task.config.updated"
    || normalized === "task.configuration.updated";
}

function stableAcquisitionEvent(event) {
  const { occurredAt, ...dedupeFields } = event || {};
  return createHmac("sha256", "acquisition-event-dedupe").update(JSON.stringify(dedupeFields)).digest("hex");
}

function redactAcquisition(value) {
  if (Array.isArray(value)) return value.map(redactAcquisition);
  if (!value || typeof value !== "object") return value;
  const output = {};
  for (const [key, entry] of Object.entries(value)) {
    if (/(api[_-]?key|access[_-]?token|refresh[_-]?token|password|passwd|secret|cookie|csrf|authorization|jwt)/i.test(key)) output[key] = "[REDACTED]";
    else output[key] = redactAcquisition(entry);
  }
  return output;
}

function stripAcquisitionSecrets(value) {
  if (Array.isArray(value)) return value.map(stripAcquisitionSecrets);
  if (!value || typeof value !== "object") return value;
  const output = {};
  for (const [key, entry] of Object.entries(value)) {
    if (/(api[_-]?key|access[_-]?token|refresh[_-]?token|password|passwd|secret|cookie|csrf|authorization|jwt)/i.test(key)) continue;
    output[key] = stripAcquisitionSecrets(entry);
  }
  return output;
}

function assertTaskTenant(controlPlane, taskId, principal) {
  if (!principal?.tenantId || !taskId) return;
  if (typeof controlPlane?.persistence?.loadTask !== "function") {
    throw new ControlPlaneError("控制面无法核验任务租户归属", {
      code: "TASK_TENANT_SCOPE_UNAVAILABLE",
      statusCode: 503,
      details: { taskId }
    });
  }
  const task = controlPlane.persistence.loadTask(taskId);
  if (!task) {
    throw new ControlPlaneError("任务不存在或尚未同步到控制面", {
      code: "TASK_NOT_FOUND",
      statusCode: 404,
      details: { taskId }
    });
  }
  const tenantId = task.tenantId || task.executionContext?.tenantId || null;
  if (!tenantId) {
    throw new ControlPlaneError("任务没有绑定租户，拒绝跨租户访问", {
      code: "TASK_TENANT_UNBOUND",
      statusCode: 403,
      details: { taskId }
    });
  }
  if (tenantId !== principal.tenantId) {
    throw new ControlPlaneError("请求超出当前 API key 的租户范围", {
      code: "TENANT_SCOPE_FORBIDDEN",
      statusCode: 403,
      details: { taskId, tenantId: principal.tenantId }
    });
  }
}

function assertAcquisitionControlPlaneVersion(controlPlane, command) {
  const taskId = optionalText(command?.taskId);
  const expectedVersion = Number(command?.expectedVersion);
  if (!taskId || !Number.isInteger(expectedVersion) || expectedVersion < 0) {
    throw new ControlPlaneError("获客策略更新必须携带控制面任务版本", {
      code: "DOUYIN_ACQUISITION_TASK_VERSION_REQUIRED",
      statusCode: 400,
      details: { taskId: taskId || null }
    });
  }
  if (typeof controlPlane?.persistence?.loadTask !== "function") {
    throw new ControlPlaneError("控制面无法核验获客任务版本", {
      code: "TASK_VERSION_SCOPE_UNAVAILABLE",
      statusCode: 503,
      details: { taskId }
    });
  }
  const task = controlPlane.persistence.loadTask(taskId);
  if (!task) {
    throw new ControlPlaneError("任务不存在或尚未同步到控制面", {
      code: "TASK_NOT_FOUND",
      statusCode: 404,
      details: { taskId }
    });
  }
  // Acquisition events are mirrored as connector events, so currentSeq is
  // the shared optimistic version for this direct service-owned mutation.
  const currentVersion = Number(task.currentSeq ?? task.version ?? task.currentVersion ?? 0);
  if (expectedVersion !== currentVersion) {
    throw new ControlPlaneError("任务状态已变化，请刷新后重试", {
      code: "TASK_VERSION_STALE",
      statusCode: 409,
      details: { taskId, expectedVersion, currentVersion }
    });
  }
}

function assertAcquisitionServiceTaskTenant(acquisitionService, key, principal) {
  const task = acquisitionService.status(key);
  const tenantId = String(task?.context?.tenantId || task?.tenantId || "").trim();
  if (!tenantId) {
    throw new ControlPlaneError("获客任务没有绑定租户，拒绝访问", {
      code: "DOUYIN_ACQUISITION_TASK_TENANT_UNBOUND",
      statusCode: 403,
      details: { taskKey: key }
    });
  }
  if (tenantId !== principal.tenantId) {
    throw new ControlPlaneError("请求超出当前 API key 的租户范围", {
      code: "TENANT_SCOPE_FORBIDDEN",
      statusCode: 403,
      details: { taskKey: key, tenantId: principal.tenantId }
    });
  }
  return task;
}

async function assertBrowserSessionTenant(browserWorkspace, sessionId, principal) {
  if (!principal?.tenantId || !sessionId) return;
  if (typeof browserWorkspace?.snapshot !== "function") {
    throw new ControlPlaneError("浏览器会话无法核验租户归属", {
      code: "BROWSER_SESSION_TENANT_UNAVAILABLE",
      statusCode: 503,
      details: { sessionId }
    });
  }
  const snapshot = await browserWorkspace.snapshot(sessionId);
  const tenantId = String(snapshot?.tenantId || "").trim();
  if (!tenantId) {
    throw new ControlPlaneError("浏览器会话没有绑定租户，拒绝访问", {
      code: "BROWSER_SESSION_TENANT_UNBOUND",
      statusCode: 403,
      details: { sessionId }
    });
  }
  if (tenantId !== principal.tenantId) {
    throw new ControlPlaneError("请求超出当前 API key 的租户范围", {
      code: "TENANT_SCOPE_FORBIDDEN",
      statusCode: 403,
      details: { sessionId, tenantId: principal.tenantId }
    });
  }
}

async function verifyDouyinMcpSession(service, sessionId, payload = {}) {
  if (!service?.configured || typeof service.status !== "function") {
    throw new ControlPlaneError("Douyin MCP 未连接，无法核验云电脑登录", { code: "DOUYIN_MCP_NOT_CONFIGURED", statusCode: 503 });
  }
  const status = await service.status();
  const loginState = String(status?.login_state || status?.state || "").toLowerCase();
  const identity = status?.account && typeof status.account === "object"
    ? status.account
    : status?.accountIdentity || status?.identity || null;
  const loggedIn = ["logged_in", "authenticated", "authorized", "ready", "success", "已登录"].includes(loginState)
    || Boolean(identity && (identity.uniqueId || identity.profileUrl || identity.uid || identity.secId));
  if (!loggedIn) throw new ControlPlaneError("抖音云电脑尚未完成登录", { code: "AUTHORIZATION_PENDING", statusCode: 403 });
  return {
    sessionId,
    state: "READY",
    provider: "douyin",
    accountKey: payload.account || payload.accountKey || null,
    accountLabel: payload.account || null,
    accountIdentity: identity,
    authenticationVerified: true
  };
}

function anonymousPrincipal() {
  return { authenticated: false, tenantId: null, keyId: null, scopes: [] };
}

function toCommandBody(body, type, taskId = undefined) {
  const source = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  const payload = source.payload && typeof source.payload === "object" ? source.payload : stripCommandFields(source);
  return { ...source, type, ...(taskId ? { taskId } : {}), payload };
}

function stripCommandFields(source) {
  const fields = new Set(["type", "commandType", "commandId", "idempotencyKey", "taskId", "taskRunId", "runId", "conversationId", "agentId", "expectedVersion", "causationId", "correlationId", "actor", "createdAt", "metadata", "schemaVersion"]);
  return Object.fromEntries(Object.entries(source).filter(([key]) => !fields.has(key)));
}

function isAccessScopeConfirmation(body) {
  return body?.type === "access.scope.confirm" || body?.commandType === "access.scope.confirm";
}

async function readJson(request, bodyLimit) {
  return parseJsonBody(await readRawBody(request, bodyLimit));
}

async function readRawBody(request, bodyLimit) {
  return (await readBinaryBody(request, bodyLimit)).toString("utf8");
}

async function readBinaryBody(request, bodyLimit) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > bodyLimit) throw new ControlPlaneError("Request body is too large", { code: "PAYLOAD_TOO_LARGE", statusCode: 413 });
    chunks.push(chunk);
  }
  return chunks.length ? Buffer.concat(chunks) : Buffer.alloc(0);
}

function parseJsonBody(rawBody) {
  if (!rawBody) return {};
  try { return JSON.parse(rawBody); } catch {
    throw new ControlPlaneError("Request body must be valid JSON", { code: "INVALID_JSON", statusCode: 400 });
  }
}

function verifyClueHunterEventSignature({ request, rawBody, secret, maxSkewMs = 5 * 60 * 1000, now = () => Date.now() }) {
  if (typeof secret !== "string" || !secret.trim()) {
    throw new ControlPlaneError("ClueHunter event secret is not configured", {
      code: "CLUEHUNTER_EVENT_SECRET_REQUIRED",
      statusCode: 503
    });
  }
  const timestamp = String(request.headers["x-cluehunter-timestamp"] || "").trim();
  const signature = String(request.headers["x-cluehunter-signature"] || "").trim();
  if (!/^\d{10,16}$/.test(timestamp) || !/^sha256=[0-9a-f]{64}$/i.test(signature)) {
    throw new ControlPlaneError("ClueHunter event signature is required", {
      code: "CLUEHUNTER_EVENT_SIGNATURE_REQUIRED",
      statusCode: 401
    });
  }
  const timestampMs = Number(timestamp);
  const skew = Math.abs(Number(now()) - timestampMs);
  if (!Number.isFinite(timestampMs) || !Number.isFinite(skew) || skew > maxSkewMs) {
    throw new ControlPlaneError("ClueHunter event timestamp is outside the allowed window", {
      code: "CLUEHUNTER_EVENT_REPLAY",
      statusCode: 401,
      details: { maxSkewMs }
    });
  }
  const path = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`).pathname;
  const canonical = [timestamp, request.method.toUpperCase(), path, rawBody || ""].join("\n");
  const expected = Buffer.from(`sha256=${createHmac("sha256", secret).update(canonical).digest("hex")}`);
  const provided = Buffer.from(signature);
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    throw new ControlPlaneError("ClueHunter event signature is invalid", {
      code: "CLUEHUNTER_EVENT_SIGNATURE_INVALID",
      statusCode: 401
    });
  }
}

function verifyProspectEventSignature({ request, rawBody, secret, maxSkewMs = 5 * 60 * 1000, now = () => Date.now() }) {
  const timestamp = String(request.headers["x-prospect-timestamp"] || "").trim();
  const signature = String(request.headers["x-prospect-signature"] || "").trim();
  if (!/^\d{10,16}$/.test(timestamp) || !/^sha256=[0-9a-f]{64}$/i.test(signature)) {
    throw new ControlPlaneError("Prospect event signature is required", {
      code: "PROSPECT_EVENT_SIGNATURE_REQUIRED",
      statusCode: 401
    });
  }
  const timestampMs = Number(timestamp);
  const skew = Math.abs(Number(now()) - timestampMs);
  if (!Number.isFinite(timestampMs) || !Number.isFinite(skew) || skew > maxSkewMs) {
    throw new ControlPlaneError("Prospect event timestamp is outside the allowed window", {
      code: "PROSPECT_EVENT_REPLAY",
      statusCode: 401,
      details: { maxSkewMs }
    });
  }
  const path = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`).pathname;
  const canonical = [timestamp, request.method.toUpperCase(), path, rawBody || ""].join("\n");
  const expected = Buffer.from(`sha256=${createHmac("sha256", secret).update(canonical).digest("hex")}`);
  const provided = Buffer.from(signature);
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    throw new ControlPlaneError("Prospect event signature is invalid", {
      code: "PROSPECT_EVENT_SIGNATURE_INVALID",
      statusCode: 401
    });
  }
}

function parseNonNegativeInteger(value, fallback) {
  if (value == null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new ControlPlaneError("Query value must be a non-negative integer", { code: "INVALID_QUERY", statusCode: 400 });
  return parsed;
}

function optionalText(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function assertCoreGatewayForProductExecution(security, agentId, operation) {
  if (security?.allowLegacyProductExecution === true) return;
  const normalizedAgentId = optionalText(agentId);
  if (!CORE_EXECUTION_AGENT_IDS.has(normalizedAgentId)) return;
  throw new ControlPlaneError("产品 Agent 的真实执行必须通过核心执行网关，以统一完成账号授权、任务幂等、成果同步与审计。", {
    code: "CORE_AGENT_GATEWAY_REQUIRED",
    statusCode: 409,
    details: { agentId: normalizedAgentId, operation: optionalText(operation) || "execute" }
  });
}

function inboxConfigurationFromBody(body = {}) {
  return {
    accountId: optionalText(body.accountId ?? body.account_id),
    accountName: optionalText(body.accountName ?? body.account_name),
    strategyMode: optionalText(body.strategyMode ?? body.strategy_mode),
    strategyPlan: body.strategyPlan && typeof body.strategyPlan === "object" ? body.strategyPlan : null,
    autoReply: Boolean(body.autoReply ?? body.auto_reply),
    replyRule: optionalText(body.replyRule ?? body.reply_rule),
    replyObjective: optionalText(body.replyObjective ?? body.reply_objective),
    replyTone: optionalText(body.replyTone ?? body.reply_tone),
    businessKnowledge: optionalText(body.businessKnowledge ?? body.business_knowledge),
    approvedClaims: Array.isArray(body.approvedClaims) ? body.approvedClaims : [],
    handoffRules: Array.isArray(body.handoffRules)
      ? body.handoffRules
      : optionalText(body.handoffRules ?? body.handoff_rules),
    qualificationQuestions: Array.isArray(body.qualificationQuestions) ? body.qualificationQuestions : []
  };
}

function requiredText(value, field) {
  const text = optionalText(value);
  if (!text) throw new ControlPlaneError(`${field} 不能为空`, { code: "DOUYIN_INPUT_REQUIRED", statusCode: 400, details: { field } });
  return text;
}

function requireSendConfirmation(body) {
  if (body?.confirm !== "SEND") {
    throw new ControlPlaneError("真实发送前需要二次确认，请传 confirm=SEND", {
      code: "OUTREACH_CONFIRMATION_REQUIRED",
      statusCode: 400
    });
  }
}

function douyinAgentId(url, body = null) {
  return optionalText(body?.agentId ?? body?.agent_id)
    || optionalText(url?.searchParams?.get("agentId") || url?.searchParams?.get("agent_id"));
}

function douyinCloudScope(url, body = null, principal = null) {
  const source = body && typeof body === "object" ? body : {};
  const accountIdentity = source.accountIdentity
    || source.account_identity
    || source.config?.accountIdentity
    || source.config?.account_identity
    || source.config?.sourceScope?.accountIdentity
    || source.config?.sourceScope?.account_identity
    || source.account
    || null;
  return {
    tenantId: principal?.tenantId || optionalText(source.tenantId ?? source.tenant_id) || null,
    accountId: optionalText(source.accountId ?? source.account_id)
      || optionalText(url?.searchParams?.get("accountId") || url?.searchParams?.get("account_id"))
      || null,
    accountIdentity: accountIdentity && typeof accountIdentity === "object" ? accountIdentity : null,
    accountLabel: optionalText(source.accountLabel ?? source.account_label ?? source.accountName ?? source.account_name) || null
  };
}

function selectDouyinMcpService(security, agentId = "", scope = {}) {
  const resolvedScope = resolvePersistedDouyinCloudScope(security.douyinAgentCloudRegistry, agentId, scope);
  const cloudAgentId = adoptDouyinAccountCloudBinding(security.douyinAgentCloudRegistry, agentId, resolvedScope);
  if (security.douyinAgentCloudRegistry && cloudAgentId) {
    return security.getDouyinMcpService?.(cloudAgentId, resolvedScope) || security.douyinAgentCloudRegistry.getService(cloudAgentId, resolvedScope);
  }
  return security.douyinMcpService;
}

async function assertAcquisitionLoginReady(security, context = {}) {
  const ownerAgentId = optionalText(context?.context?.agentId || context?.agentId);
  if (!ACQUISITION_AGENT_IDS.has(ownerAgentId)) return null;
  const agentId = acquisitionRuntimeAgentId(context);
  const registry = security?.douyinAgentCloudRegistry;
  // Isolated HTTP tests can inject a non-cloud acquisition service. Production
  // cloud-backed tasks always use the authoritative Agent registry.
  if (!registry?.configured || typeof registry.status !== "function") return null;

  let status;
  const cloudScope = {
    tenantId: context?.context?.tenantId || context?.tenantId || null,
    accountId: context?.context?.accountId || context?.accountId || null,
    accountIdentity: context?.accountIdentity || context?.config?.accountIdentity || context?.context?.accountIdentity || null
  };
  const resolvedScope = resolvePersistedDouyinCloudScope(registry, agentId, cloudScope);
  const cloudAgentId = adoptDouyinAccountCloudBinding(registry, agentId, resolvedScope);
  try {
    status = await registry.status(cloudAgentId, { ...resolvedScope, resumeSaved: false });
  } catch (error) {
    throw new ControlPlaneError("请先完成抖音账号登录，确认登录后才能启动获客任务", {
      code: "DOUYIN_LOGIN_REQUIRED",
      statusCode: 409,
      details: { agentId, cloudAgentId, cause: error?.code || "DOUYIN_LOGIN_STATUS_UNAVAILABLE" }
    });
  }

  const loginState = String(
    status?.login_state
      || status?.loginState
      || status?.account?.login_state
      || status?.account?.loginState
      || "unknown"
  ).trim().toLowerCase();
  const authorized = ["logged_in", "authenticated", "authorized", "ready", "success", "已登录"].includes(loginState);
  if (!authorized) {
    throw new ControlPlaneError("请先完成抖音账号登录，确认登录后才能启动获客任务", {
      code: "DOUYIN_LOGIN_REQUIRED",
      statusCode: 409,
      details: { agentId, cloudAgentId, loginState }
    });
  }
  security.assertDouyinAccountAgentAvailable?.({
    tenantId: context?.context?.tenantId || context?.tenantId || null,
    agentId,
    accountIdentity: status.account || null,
    accountId: context?.context?.accountId || context?.accountId || null
  });
  return status;
}

export function createDouyinAgentServiceOptionsByAgent() {
  const scopedCloudAgents = new Set([DOUYIN_ACCOUNT_CLOUD_AGENT_ID]);
  return (agentId) => {
    const id = String(agentId || "").trim();
    const key = id.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase();
    if (!key) return {};
    const scopedApiKey = process.env[`BYERING_DOUYIN_MCP_API_KEY_${key}`]
      // Existing deployments may still use a product-scoped key. Reuse it for
      // the account carrier until the single carrier key is configured.
      || (id === DOUYIN_ACCOUNT_CLOUD_AGENT_ID
        ? process.env.BYERING_DOUYIN_MCP_API_KEY_MKT_COMMENT_ACQUISITION
          || process.env.BYERING_DOUYIN_MCP_API_KEY_MKT_DOUYIN_CHILD_CAPABILITIES
          || process.env.BYERING_DOUYIN_MCP_API_KEY_MKT_DM_INBOX
          || process.env.BYERING_DOUYIN_MCP_API_KEY_MKT_COLD_WRITER
        : null);
    const requireScopedApiKey = scopedCloudAgents.has(id);
    return {
      ...(scopedApiKey ? { apiKey: scopedApiKey } : {}),
      ...(requireScopedApiKey ? { requireScopedApiKey: true } : {})
    };
  };
}

function createColdWriterRpaIdentityProvider(env = process.env) {
  const source = env && typeof env === "object" ? env : {};
  const agentKey = "MKT_COLD_WRITER";
  return ({ agentId } = {}) => {
    if (String(agentId || "").trim() !== "mkt-cold-writer") return null;
    // This identity is the cloud RPA worker identity, not a Douyin account
    // value supplied by a browser request. The eventual ACK must come from
    // this same executor before the task can complete.
    const tenant = source[`BYERING_CLUEHUNTER_TENANT_ID_${agentKey}`]
      || source.BYERING_CLUEHUNTER_TENANT_ID
      || source.BYERING_CLUEHUNTER_CLOUD_TENANT_ID;
    const uid = source[`BYERING_CLUEHUNTER_UID_${agentKey}`]
      || source.BYERING_CLUEHUNTER_UID
      || source.BYERING_CLUEHUNTER_CLOUD_UID;
    if (tenant == null || uid == null) return null;
    return { tenant, uid };
  };
}

function selectDouyinInboxAgentService(security, agentId = COMPREHENSIVE_ACQUISITION_AGENT_ID, scope = {}) {
  const semanticAgentId = String(agentId || COMPREHENSIVE_ACQUISITION_AGENT_ID).trim();
  return security.getDouyinInboxAgentService?.(semanticAgentId, scope.tenantId || null, scope) || security.douyinInboxAgentService;
}

async function resumeDouyinAgent(security, agentId = "", { syncInboxRuntime = false, ...scope } = {}) {
  const resolvedScope = resolvePersistedDouyinCloudScope(security.douyinAgentCloudRegistry, agentId, scope);
  const cloudAgentId = adoptDouyinAccountCloudBinding(security.douyinAgentCloudRegistry, agentId, resolvedScope);
  if (security.douyinAgentCloudRegistry && cloudAgentId) {
    const cloudStatus = await security.douyinAgentCloudRegistry.status(cloudAgentId, { ...resolvedScope, resumeSaved: true });
    if (syncInboxRuntime && INBOX_CAPABLE_AGENT_ID_SET.has(agentId)) {
      const service = selectDouyinInboxAgentService(security, agentId, resolvedScope);
      if (typeof service?.canResumeSaved !== "function" || !service.canResumeSaved()) return cloudStatus;
      if (service.status?.()?.runtime?.running === true) return cloudStatus;
      const claimed = await security.claimInboxRuntime?.({
        tenantId: resolvedScope.tenantId || null,
        agentId,
        service,
        accountIdentity: cloudStatus.account || null,
        accountId: resolvedScope.accountId || service?.status?.().accountId,
        takeover: false
      });
      if (claimed?.claimed === false) return cloudStatus;
      try {
        const resumed = await service.resumeSaved({
          accountIdentity: cloudStatus.account || null,
          accountName: cloudStatus.account?.nickname || null,
          accountCoordinationKey: douyinAccountCoordinationKey(cloudStatus.account, resolvedScope.accountId || service?.status?.().accountId)
        });
        if (resumed?.runtime?.running !== true) {
          security.releaseInboxRuntime?.({
            tenantId: scope.tenantId || null,
            agentId,
            service,
            accountIdentity: cloudStatus.account || null,
            accountId: scope.accountId || resumed?.accountId
          });
        }
      } catch (error) {
        security.releaseInboxRuntime?.({
          tenantId: scope.tenantId || null,
          agentId,
          service,
          accountIdentity: cloudStatus.account || null,
          accountId: scope.accountId || service?.status?.().accountId
        });
        throw error;
      }
    }
    return cloudStatus;
  }
  return null;
}

function boundedTimeout(value, fallback, maximum) {
  if (value == null || value === "") return fallback;
  const timeout = Number(value);
  if (!Number.isInteger(timeout) || timeout < 1000 || timeout > maximum) {
    throw new ControlPlaneError(`timeoutMs 必须在 1000-${maximum} 之间`, { code: "INVALID_TIMEOUT", statusCode: 400 });
  }
  return timeout;
}

function assertDouyinMcpConfigured(service, operation) {
  if (!service?.configured) {
    throw new ControlPlaneError(`Douyin MCP 未配置，无法${operation}`, { code: "DOUYIN_MCP_NOT_CONFIGURED", statusCode: 503 });
  }
}

function assertInboxAgentConfigured(service) {
  if (!service || typeof service.status !== "function") {
    throw new ControlPlaneError("私信承接 Agent 未配置", { code: "DOUYIN_INBOX_AGENT_NOT_CONFIGURED", statusCode: 503 });
  }
}

async function requireDouyinAuthorization(service, statusOverride = null) {
  const status = statusOverride && typeof statusOverride === "object"
    ? statusOverride
    : await service.status();
  if (status?.ok === false && status?.error) {
    throw new ControlPlaneError(status.error.message || "云电脑当前不可用，请先重新连接", {
      code: status.error.code || "DOUYIN_CLOUD_OFFLINE",
      statusCode: Number.isInteger(status.error.statusCode) ? status.error.statusCode : 503,
      details: status.error.details || null
    });
  }
  const displayState = String(status?.display_state || status?.displayState || "").toLowerCase();
  if (displayState === "error") {
    throw new ControlPlaneError("云电脑当前处于异常状态，请先重新连接后再发送", {
      code: "DOUYIN_CLOUD_OFFLINE",
      statusCode: 503,
      details: { displayState, workerOnline: status?.worker?.online === true }
    });
  }
  const loginState = String(status?.login_state || status?.loginState || "").toLowerCase();
  const authorizedStates = new Set(["logged_in", "authenticated", "authorized", "ready", "success", "已登录"]);
  if (!authorizedStates.has(loginState) || !status?.account) {
    throw new ControlPlaneError("请先在云电脑中完成抖音授权登录", {
      code: "DOUYIN_AUTHORIZATION_REQUIRED",
      statusCode: 409,
      details: { loginState: loginState || "unknown", action: "open_login" }
    });
  }
  return status;
}

function assertDouyinMcpResult(result, fallback, context = {}) {
  if (result?.ok === false) {
    const upstream = result.error || {};
    throw new ControlPlaneError(upstream.message || fallback, {
      code: upstream.code || "DOUYIN_MCP_OPERATION_FAILED",
      statusCode: Number.isInteger(upstream.statusCode) && upstream.statusCode >= 400 ? upstream.statusCode : 502,
      details: {
        upstream: true,
        ...context,
        upstreamError: {
          code: upstream.code || null,
          message: upstream.message || null
        }
      }
    });
  }
  return result;
}

function hasAccountIdentity(identity) {
  if (!identity || typeof identity !== "object" || Array.isArray(identity)) return false;
  return [identity.profileUrl, identity.profile_url, identity.uniqueId, identity.unique_id, identity.uid, identity.secId, identity.sec_id, identity.secUid, identity.sec_uid]
    .some((value) => (typeof value === "string" && value.trim()) || (typeof value === "number" && Number.isFinite(value)));
}

function createAcquisitionActivityBridge(controlPlane) {
  return (event = {}) => {
    if (typeof controlPlane?.ingestExecutionEvents !== "function") return null;
    const taskId = event.taskId || event.task_id;
    if (!taskId) return null;
    ensureAcquisitionControlPlaneTask(controlPlane, event, taskId);
    const acquisitionType = String(event.acquisitionType || event.type || "").trim();
    const payload = event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
      ? { ...event.payload }
      : {};
    if (event.tenantId || event.tenant_id) payload.tenantId ||= event.tenantId || event.tenant_id;
    payload.acquisitionType ||= acquisitionType || null;
    for (const field of ["taskState", "runtimeState", "health"]) {
      if (event[field] != null && payload[field] == null) payload[field] = event[field];
    }
    const state = String(payload.state || payload.status || "").toLowerCase();
    let type = acquisitionType;
    if (acquisitionType === "authorization") {
      type = state === "granted" || state === "resolved" ? "access.authorization.granted"
        : state === "cancelled" || state === "rejected" ? "access.authorization.cancelled"
          : state === "failed" || state === "error" ? "task.execution.failed" : "access.authorization.requested";
    } else if (acquisitionType === "touch_receipt") {
      type = state === "accepted"
        ? "outreach.accepted"
        : ["delivered", "sent", "success", "succeeded"].includes(state)
          ? "outreach.sent"
          : ["failed", "rejected", "denied", "error"].includes(state) ? "outreach.failed" : "delivery.checking";
    } else if (acquisitionType === "cloud_lifecycle") {
      type = ["error", "failed", "disconnected"].includes(state) ? "task.integration.failed" : "agent.stage.started";
    } else if (acquisitionType === "scan_window") type = "lead.source.synced";
    else if (acquisitionType === "candidates_found") type = "lead.candidate";
    else if (acquisitionType === "touch_drafted") type = "outreach.ready";
    else if (acquisitionType === "touch_submitted") type = "outreach.sending";
    else if (acquisitionType === "reply_received") type = "lead.replied";
    else if (acquisitionType === "retry") type = "task.retrying";
    else if (acquisitionType === "pause") type = "task.paused";
    else if (acquisitionType === "resume") type = "task.resumed";
    else if (acquisitionType === "stop") type = "task.cancelled";
    else if (acquisitionType === "config_updated" || acquisitionType === "configuration_updated") type = "task.config.updated";
    else if (acquisitionType === "error") type = "task.failed";
    if (!type) return null;
    try {
      return controlPlane.ingestExecutionEvents({
        taskId: event.taskId || event.task_id,
        tenantId: event.tenantId || event.tenant_id || null,
        source: "douyin-acquisition-activity",
        events: [{
          ...event,
          type,
          eventId: event.eventId || event.event_id || randomUUID(),
          payload
        }]
      });
    } catch (error) {
      if (acquisitionType === "config_updated" || acquisitionType === "configuration_updated") throw error;
      return null;
    }
  };
}

function createInboxActivityBridge(controlPlane) {
  return (event = {}) => {
    if (typeof controlPlane?.ingestExecutionEvents !== "function" || event?.type !== "reply.sent") return null;
    const taskId = event.taskId || event.task_id;
    if (!taskId) return null;
    ensureAcquisitionControlPlaneTask(controlPlane, event, taskId);
    const payload = event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
      ? { ...event.payload }
      : {};
    for (const field of ["messageId", "replyId", "content", "deliveryState", "accountId", "agentId"]) {
      if (event[field] != null && payload[field] == null) payload[field] = event[field];
    }
    payload.deliveryState ||= "sent";
    return controlPlane.ingestExecutionEvents({
      taskId,
      tenantId: event.tenantId || event.tenant_id || null,
      source: "douyin-inbox-activity",
      events: [{
        ...event,
        type: "reply.sent",
        eventId: event.eventId || event.event_id || randomUUID(),
        payload
      }]
    });
  };
}

function ensureAcquisitionControlPlaneTask(controlPlane, event, taskId) {
  const persistence = controlPlane?.persistence;
  if (typeof persistence?.loadTask === "function" && persistence.loadTask(taskId)) return;
  if (typeof controlPlane?.dispatch !== "function") return;
  controlPlane.dispatch({
    type: "task.create",
    taskId,
    taskRunId: event.taskRunId || event.task_run_id || event.runId || event.run_id,
    conversationId: event.conversationId || event.conversation_id,
    agentId: event.agentId || event.agent_id,
    payload: {
      goal: "Douyin acquisition activity",
      tenantId: event.tenantId || event.tenant_id || null,
      executionContext: {
        tenantId: event.tenantId || event.tenant_id || null,
        accountId: event.accountId || event.account_id || null
      }
    }
  });
}

function setCorsHeaders(response, requestOrigin, allowedOrigins) {
  const origin = allowedOrigins.includes(requestOrigin) ? requestOrigin : null;
  if (origin) response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Vary", "Origin");
  response.setHeader("Access-Control-Allow-Headers", "content-type, authorization, x-api-key, x-byering-api-key, x-request-id, x-cluehunter-timestamp, x-cluehunter-signature, x-prospect-timestamp, x-prospect-signature");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
}

export function defaultAllowedOrigins({
  configuredOrigins = process.env.BYERING_CONTROL_PLANE_ORIGINS,
  rendererPort = Number(process.env.BYERING_RENDERER_PORT || process.env.MARVIS_PORT || 0)
} = {}) {
  if (configuredOrigins) return configuredOrigins.split(",").map((origin) => origin.trim()).filter(Boolean);
  const origins = [
    "http://127.0.0.1:6680",
    "http://localhost:6680",
    "http://127.0.0.1:8888",
    "http://localhost:8888",
    "http://127.0.0.1:8889",
    "http://localhost:8889",
    "http://127.0.0.1:18888",
    "http://localhost:18888"
  ];
  const port = Number(rendererPort);
  if (Number.isInteger(port) && port > 0 && port <= 65535) {
    origins.push(`http://127.0.0.1:${port}`, `http://localhost:${port}`);
  }
  return [...new Set(origins)];
}

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  if (statusCode === 204) return response.end();
  response.end(JSON.stringify(payload));
}

function douyinAvatarSource(identity = {}) {
  const value = identity?.avatar
    || identity?.avatarUrl
    || identity?.avatar_url
    || identity?.avatarThumb
    || identity?.avatar_thumb;
  if (typeof value === "string") return value.trim();
  const candidates = value?.url_list || value?.urlList || value?.urls;
  return Array.isArray(candidates) ? String(candidates.find(Boolean) || "").trim() : "";
}

async function refreshExpiredDouyinAvatarIdentity({ agentId, record, security }) {
  const identity = record?.accountIdentity && typeof record.accountIdentity === "object"
    ? record.accountIdentity
    : {};
  const source = douyinAvatarSource(identity);
  if (source && !isExpiredDouyinAvatarSource(source, security?.now?.() ?? Date.now())) return identity;

  const resolver = security?.accountResolver;
  const reference = douyinAvatarRefreshReference(identity);
  if (resolver?.configured !== true || typeof resolver.resolve !== "function" || !reference) return identity;

  const key = `${agentId}:${source || "missing"}`;
  const now = Number(security?.now?.() ?? Date.now());
  const cached = security?.douyinAvatarRefreshes?.get(key);
  if (cached?.until > now && cached.promise) return cached.promise;

  const refresh = Promise.resolve()
    .then(() => resolver.resolve(reference))
    .then((resolved) => {
      const avatarUrl = douyinAvatarSource(resolved);
      if (!avatarUrl) return identity;
      const refreshed = {
        ...identity,
        avatar: avatarUrl,
        avatarUrl,
        avatar_url: avatarUrl
      };
      const scope = {
        tenantId: record?.tenantId || null,
        accountId: record?.accountId || null,
        accountIdentity: identity,
        accountLabel: record?.accountLabel || null
      };
      security?.douyinAgentCloudRegistry?.refreshAccountIdentity?.(agentId, scope, refreshed);
      return refreshed;
    })
    .catch(() => identity);

  security?.douyinAvatarRefreshes?.set(key, { until: now + 60_000, promise: refresh });
  return refresh;
}

function isExpiredDouyinAvatarSource(source, now = Date.now()) {
  if (!source) return false;
  try {
    const url = new URL(source);
    const expires = Number(url.searchParams.get("x-expires") || url.searchParams.get("expires"));
    return Number.isFinite(expires) && expires > 0 && expires * 1000 <= Number(now);
  } catch {
    return false;
  }
}

function douyinAvatarRefreshReference(identity = {}) {
  const profileUrl = optionalText(identity.profileUrl || identity.profile_url || identity.homepageUrl || identity.homepage_url);
  if (profileUrl && /^https?:\/\//i.test(profileUrl)) return { profileUrl };

  const secId = optionalText(identity.secId || identity.sec_id || identity.secUid || identity.sec_uid || identity.secUserId || identity.sec_user_id);
  if (secId) return { profileUrl: `https://www.douyin.com/user/${encodeURIComponent(secId)}` };

  const uniqueId = optionalText(identity.uniqueId || identity.unique_id || identity.account || identity.handle);
  return uniqueId ? { uniqueId: uniqueId.replace(/^@+/, "") } : null;
}

async function fetchDouyinAvatar(source) {
  const proxyBase = process.env.BYERING_DOUYIN_AVATAR_PROXY || "https://images.weserv.nl/";
  const proxy = new URL(proxyBase);
  proxy.searchParams.set("url", source);
  proxy.searchParams.set("w", "160");
  proxy.searchParams.set("h", "160");
  proxy.searchParams.set("fit", "cover");
  const response = await fetch(proxy, {
    headers: { accept: "image/avif,image/webp,image/jpeg,image/png,*/*" },
    signal: AbortSignal.timeout(15_000)
  });
  if (!response.ok) throw new ControlPlaneError("抖音账号头像读取失败", {
    code: "DOUYIN_ACCOUNT_AVATAR_UPSTREAM_FAILED",
    statusCode: 502,
    details: { status: response.status }
  });
  const contentType = String(response.headers.get("content-type") || "application/octet-stream").split(";")[0];
  const body = Buffer.from(await response.arrayBuffer());
  if (body.length > 2 * 1024 * 1024) throw new ControlPlaneError("抖音账号头像文件过大", {
    code: "DOUYIN_ACCOUNT_AVATAR_TOO_LARGE",
    statusCode: 502
  });
  return { body, contentType };
}

function sendConnectorResult(response, controlPlane, result, { taskId = null, tenantId = null, source = "connector" } = {}) {
  if (taskId && Array.isArray(result?.events) && result.events.length
    && typeof controlPlane?.ingestExecutionEvents === "function") {
    const ingested = controlPlane.ingestExecutionEvents({
      taskId,
      tenantId,
      source,
      events: result.events
    });
    return sendJson(response, 200, {
      ...result,
      ingested: {
        acceptedCount: ingested.acceptedCount,
        duplicateCount: ingested.duplicateCount,
        currentSeq: ingested.currentSeq
      }
    });
  }
  return sendJson(response, 200, result);
}

const CORE_EXECUTION_DEFAULT_GOALS = Object.freeze({
  "mkt-comment-acquisition": "持续从已授权抖音账号中寻找、判断并推进潜客",
  "mkt-find-people": "从已授权抖音直播与互动中寻找潜客",
  "mkt-intent-analyst": "分析候选客户并输出可跟进的潜客判断",
  "mkt-live-danmaku-analysis": "分析授权账号当前直播间的弹幕与互动信号",
  "mkt-live-danmaku-outreach": "触达授权账号当前直播间每一位发弹幕的用户",
  "mkt-cold-writer": "向已核验潜客发送首轮私信",
  "mkt-dm-inbox": "持续承接抖音新私信并按已确认策略回复",
  "mkt-gold-customer-service": "使用金牌客服流程持续承接抖音新私信并推进下一步"
});

function requireActiveCoreAgentEmployment(employmentStore, principal, agentId) {
  const normalizedAgentId = optionalText(agentId);
  if (!normalizedAgentId) {
    throw new ControlPlaneError("核心执行请求缺少 Agent", {
      code: "CORE_AGENT_REQUIRED",
      statusCode: 400
    });
  }
  if (!employmentStore || typeof employmentStore.list !== "function") {
    throw new ControlPlaneError("雇佣合同存储未配置", {
      code: "EMPLOYMENT_STORE_UNAVAILABLE",
      statusCode: 503
    });
  }
  const contract = employmentStore.list(principal?.tenantId || null)
    .find((item) => item?.agentId === normalizedAgentId && item?.status === "active");
  if (!contract) {
    throw new ControlPlaneError("请先在 Agent 中心雇佣该 Agent，再开始执行任务", {
      code: "CORE_AGENT_EMPLOYMENT_REQUIRED",
      statusCode: 409,
      details: { agentId: normalizedAgentId }
    });
  }
  return contract;
}

function managedRuntimeAccountTokens(value = {}) {
  const source = value?.executionContext && typeof value.executionContext === "object"
    ? value.executionContext
    : value?.context && typeof value.context === "object"
      ? value.context
      : value;
  const identity = source?.accountIdentity && typeof source.accountIdentity === "object"
    ? source.accountIdentity
    : {};
  const tokens = new Set();
  const add = (candidate) => {
    const text = String(candidate || "").trim();
    if (text) tokens.add(text);
  };
  for (const value of [source?.accountKey, source?.accountRef, source?.accountId, source?.accountCoordinationKey]) add(value);
  for (const [field, prefix] of [
    ["secUid", "douyin:sec:"], ["sec_uid", "douyin:sec:"], ["secId", "douyin:sec:"], ["sec_id", "douyin:sec:"],
    ["uid", "douyin:uid:"], ["userId", "douyin:uid:"], ["user_id", "douyin:uid:"],
    ["uniqueId", "douyin:unique:"], ["unique_id", "douyin:unique:"],
    ["profileUrl", "douyin:profile:"], ["profile_url", "douyin:profile:"]
  ]) {
    const value = String(identity[field] || "").trim();
    if (!value) continue;
    add(value);
    add(`${prefix}${value}`);
    add(`douyin:${value}`);
  }
  return tokens;
}

function managedRuntimeAccountsMatch(left, right) {
  const leftTokens = managedRuntimeAccountTokens(left);
  const rightTokens = managedRuntimeAccountTokens(right);
  if (!leftTokens.size || !rightTokens.size) return false;
  return [...leftTokens].some((token) => rightTokens.has(token));
}

function managedRuntimeTaskIsActuallyActive(security = {}, task = {}) {
  const agentId = optionalText(task.agentId);
  const executionContext = task.executionContext && typeof task.executionContext === "object"
    ? task.executionContext
    : {};
  const accountUseScope = optionalText(executionContext.accountUseScope) || "";
  const isInboxRuntime = accountUseScope.endsWith(":inbox")
    || ["mkt-dm-inbox", "mkt-gold-customer-service"].includes(agentId);

  if (isInboxRuntime) {
    const service = security.getDouyinInboxAgentService?.(
      agentId,
      task.tenantId || executionContext.tenantId || null,
      { ...executionContext, tenantId: task.tenantId || executionContext.tenantId || null }
    );
    const snapshot = service?.status?.();
    return snapshot?.runtime?.running === true && managedRuntimeAccountsMatch(task, snapshot);
  }

  if (!DOUYIN_ACQUISITION_ACTIVE_AGENT_IDS.includes(agentId)) return true;
  const runtimeTasks = security.douyinAcquisitionService?.listRuntimeTasks?.() || [];
  return runtimeTasks.some((runtimeTask) => {
    if (runtimeTask?.runtimeAlive !== true) return false;
    const runtimeContext = runtimeTask.context && typeof runtimeTask.context === "object"
      ? runtimeTask.context
      : runtimeTask;
    const runtimeAgentId = optionalText(runtimeContext.agentId || runtimeTask.agentId || runtimeContext.executionAgentId);
    if (runtimeAgentId !== agentId && optionalText(runtimeContext.executionAgentId) !== agentId) return false;
    return managedRuntimeAccountsMatch(task, runtimeContext);
  });
}

function ensureCoreExecutionTask(controlPlane, body = {}, principal = null, security = {}) {
  if (!controlPlane || typeof controlPlane.ensureManagedRuntimeTask !== "function") {
    throw new ControlPlaneError("核心执行缺少任务生命周期服务", {
      code: "CORE_EXECUTION_TASK_LIFECYCLE_UNAVAILABLE",
      statusCode: 503
    });
  }
  const agentId = optionalText(body.agentId);
  const taskId = optionalText(body.taskId) || `core-${agentId || "agent"}-${randomUUID()}`;
  const accountId = optionalText(body.accountId || body.account_id);
  const accountKey = optionalText(body.accountKey || body.account_key || accountId);
  return controlPlane.ensureManagedRuntimeTask({
    taskId,
    taskRunId: optionalText(body.taskRunId || body.task_run_id),
    conversationId: optionalText(body.conversationId || body.conversation_id),
    agentId,
    tenantId: body.tenantId || principal?.tenantId || null,
    goal: optionalText(body.goal) || CORE_EXECUTION_DEFAULT_GOALS[agentId] || "执行核心 Agent 任务",
    executionContext: {
      tenantId: body.tenantId || principal?.tenantId || null,
      accountId,
      accountKey,
      accountUseScope: optionalText(body.accountUseScope || body.account_use_scope || body.config?.accountUseScope) || agentId,
      accountName: optionalText(body.accountName || body.account_name),
      accountIdentity: body.accountIdentity && typeof body.accountIdentity === "object" ? body.accountIdentity : null,
      provider: "douyin"
    },
    configuration: {
      source: "core_agent_execution",
      skillId: optionalText(body.skillId) || agentId,
      mode: optionalText(body.analysisMode || body.analysisScope || body.mode || body.operation) || null,
      ...(body.config && typeof body.config === "object"
        ? Object.fromEntries(Object.entries(body.config).filter(([key]) => !["planToken", "startRequestId", "verifiedInboxPlan"].includes(key)))
        : {})
    },
    isTaskActuallyActive: (task) => managedRuntimeTaskIsActuallyActive(security, task)
  });
}

function attachVerifiedInboxPlan(security = {}, request = {}) {
  if (optionalText(request.operation) !== "inbox_hosting") return request;
  const config = request.config && typeof request.config === "object" && !Array.isArray(request.config)
    ? request.config
    : {};
  const planToken = optionalText(config.planToken || request.planToken);
  if (!planToken) {
    throw new ControlPlaneError("planToken 不能为空", { code: "DOUYIN_INPUT_REQUIRED", statusCode: 400, details: { field: "planToken" } });
  }
  if (!security.inboxPlanRegistry?.resolve) {
    throw new ControlPlaneError("承接方案凭证无效", { code: "DOUYIN_INBOX_PLAN_TOKEN_INVALID", statusCode: 401 });
  }
  const verifiedInboxPlan = security.inboxPlanRegistry.resolve(planToken, {
    agentId: request.agentId,
    accountId: request.accountId
  });
  return {
    ...request,
    config: {
      ...config,
      verifiedInboxPlan
    }
  };
}

function createInboxPlanRegistry() {
  const plans = new Map();
  const fingerprint = (token) => createHash("sha256").update(String(token || "")).digest("hex");
  const decode = (token) => {
    const [encoded, signature, extra] = String(token || "").trim().split(".");
    if (!encoded || !signature || extra) return null;
    try {
      const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
      return payload && typeof payload === "object" ? payload : null;
    } catch {
      return null;
    }
  };
  const expired = (payload) => !Number.isFinite(Number(payload?.expiresAt)) || Date.now() >= Number(payload.expiresAt);
  const cleanup = () => {
    for (const [key, payload] of plans.entries()) if (expired(payload)) plans.delete(key);
  };
  return {
    remember(token) {
      const payload = decode(token);
      if (!payload || expired(payload)) return;
      cleanup();
      plans.set(fingerprint(token), payload);
    },
    resolve(token, { agentId = "", accountId = "" } = {}) {
      cleanup();
      const payload = plans.get(fingerprint(token));
      if (!payload) {
        throw new ControlPlaneError("承接方案凭证无效", { code: "DOUYIN_INBOX_PLAN_TOKEN_INVALID", statusCode: 401 });
      }
      if (expired(payload)) {
        throw new ControlPlaneError("承接方案已过期，请重新生成", { code: "DOUYIN_INBOX_PLAN_EXPIRED", statusCode: 409 });
      }
      if (optionalText(payload.agentId) !== optionalText(agentId)) {
        throw new ControlPlaneError("承接方案不属于当前 Agent", { code: "DOUYIN_INBOX_PLAN_AGENT_MISMATCH", statusCode: 409 });
      }
      if (optionalText(payload.accountId) !== optionalText(accountId)) {
        throw new ControlPlaneError("承接方案与当前抖音账号不一致", { code: "DOUYIN_INBOX_PLAN_ACCOUNT_MISMATCH", statusCode: 409 });
      }
      if (payload.confirmable !== true) {
        throw new ControlPlaneError("承接方案仍有阻断项，暂不能启用", { code: "DOUYIN_INBOX_PLAN_NOT_CONFIRMABLE", statusCode: 409 });
      }
      return payload;
    }
  };
}

function findProspectRun(security, controlPlane, taskId, principal) {
  assertTaskTenant(controlPlane, taskId, principal);
  const inMemory = security.prospectRuns?.get(taskId);
  if (inMemory) return inMemory;
  const snapshot = controlPlane?.getTaskSnapshot?.(taskId);
  const agentId = optionalText(snapshot?.agentId);
  if (!snapshot || !["mkt-find-people", "mkt-intent-analyst"].includes(agentId)) return null;
  return {
    accepted: true,
    dispatched: true,
    recovered: true,
    source: "control-plane",
    taskId: snapshot.taskId,
    taskRunId: snapshot.taskRunId || null,
    conversationId: snapshot.conversationId || null,
    agentId,
    status: snapshot.state,
    resultSnapshot: snapshot.resultSnapshot || {},
    updatedAt: snapshot.updatedAt || null
  };
}

function ensurePublicDiscoveryTask(controlPlane, body = {}, principal = null) {
  if (!controlPlane || typeof controlPlane.ensureManagedRuntimeTask !== "function") {
    throw new ControlPlaneError("公开找人缺少任务生命周期服务", {
      code: "PUBLIC_DISCOVERY_TASK_LIFECYCLE_UNAVAILABLE",
      statusCode: 503
    });
  }
  const taskId = optionalText(body.taskId) || `prospect-${randomUUID()}`;
  return controlPlane.ensureManagedRuntimeTask({
    taskId,
    taskRunId: optionalText(body.taskRunId),
    conversationId: optionalText(body.conversationId),
    agentId: optionalText(body.agentId) || "mkt-find-people",
    tenantId: body.tenantId || principal?.tenantId || null,
    goal: optionalText(body.goal) || "公开找人任务",
    executionContext: {
      tenantId: body.tenantId || principal?.tenantId || null,
      accountId: optionalText(body.accountId || body.account_id),
      accountKey: optionalText(body.accountKey || body.account_key),
      source: "legacy_public_discovery"
    },
    configuration: {
      source: "legacy_public_discovery",
      skillId: optionalText(body.skillId) || "lead_discovery"
    }
  });
}

function completeSynchronousDiscoveryResult(result, body = {}) {
  if (!result || typeof result !== "object" || Array.isArray(result)) return result;
  const events = Array.isArray(result.events) ? result.events.slice() : [];
  const hasTerminalEvent = events.some((event) => ["task.completed", "task.failed", "task.cancelled", "task.blocked"].includes(String(event?.type || "")));
  const status = String(result.status || result.state || "").trim().toLowerCase();
  const completed = result.completed === true || ["completed", "complete", "succeeded", "success"].includes(status);
  if (!completed || hasTerminalEvent) return { ...result, events };
  return {
    ...result,
    events: [...events, {
      eventId: `public-discovery:${body.taskId}:completed`,
      type: "task.completed",
      taskId: body.taskId,
      taskRunId: body.taskRunId || null,
      conversationId: body.conversationId || null,
      agentId: body.agentId || "mkt-find-people",
      payload: {
        resultSnapshot: result.resultSnapshot || result.snapshot || {
          source: "legacy_public_discovery",
          taskId: body.taskId,
          taskRunId: body.taskRunId || null,
          agentId: body.agentId || "mkt-find-people",
          generatedAt: new Date().toISOString()
        },
        text: "公开找人已完成，结果和原始证据已归档。"
      }
    }]
  };
}

function sendError(response, error) {
  const statusCode = error instanceof ControlPlaneError || Number.isInteger(error?.statusCode) ? error.statusCode : 500;
  const details = error?.details && typeof error.details === "object" && Object.keys(error.details).length
    ? error.details
    : undefined;
  sendJson(response, statusCode, {
    accepted: false,
    error: {
      code: error.code || "INTERNAL_ERROR",
      message: error.message || "Internal server error",
      details
    }
  });
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMainModule) {
  startControlPlaneServer().then((server) => {
    const address = server.address();
    console.log(`Byering control plane listening on http://${address.address}:${address.port}`);
  }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
