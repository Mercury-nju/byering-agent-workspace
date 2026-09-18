import { receptionGoalObjective, receptionResponseStyle } from "../src/salebuddy/agents/account-reception.js";
import { VIRAL_WORK_ANALYSIS_DEFAULT_GOAL } from "../src/salebuddy/agents/viral-work-analysis.js";
import { DOUYIN_AUTO_AUDIENCE_GOAL } from "../src/salebuddy/agents/acquisition-contract.js";

const PRODUCT_AGENT_IDS = new Set([
  "mkt-comment-acquisition",
  "mkt-find-people",
  "mkt-live-danmaku-analysis",
  "mkt-live-danmaku-outreach",
  "mkt-viral-work-analysis",
  "mkt-intent-analyst",
  "mkt-cold-writer",
  "mkt-dm-inbox",
  "mkt-gold-customer-service"
]);

const ACQUISITION_AGENT_ID = "mkt-comment-acquisition";
const FINDER_AGENT_ID = "mkt-find-people";
const LIVE_DANMAKU_ANALYSIS_AGENT_ID = "mkt-live-danmaku-analysis";
const LIVE_DANMAKU_OUTREACH_AGENT_ID = "mkt-live-danmaku-outreach";
const VIRAL_WORK_ANALYSIS_AGENT_ID = "mkt-viral-work-analysis";
const GOLD_CUSTOMER_SERVICE_AGENT_ID = "mkt-gold-customer-service";

export class CoreAgentExecutionError extends Error {
  constructor(message, { code = "CORE_AGENT_EXECUTION_ERROR", statusCode = 400, details = {} } = {}) {
    super(message);
    this.name = "CoreAgentExecutionError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

/**
 * The only execution boundary for the product Agents. It selects a
 * capability inside the authorized Douyin account runtime without exposing
 * the legacy public discovery adapter to normal product tasks.
 */
export function createCoreAgentExecutionService({
  douyinAcquisitionService = null,
  intentAnalysisService = null,
  getInboxAgentService = null,
  inboxExecutor = null,
  outreachExecutor = null,
  resolveOutreachLead = null,
  resolveReceptionStrategy = null,
  viralWorkAnalysisService = null,
  onViralWorkProgress = null,
  now = () => new Date().toISOString()
} = {}) {
  const capabilityReady = Object.freeze({
    acquisition: Boolean(douyinAcquisitionService?.createTask && douyinAcquisitionService?.start),
    analysis: Boolean(intentAnalysisService?.analyze),
    outreach: typeof outreachExecutor === "function",
    inbox: typeof inboxExecutor === "function" || typeof getInboxAgentService === "function",
    viralWorkAnalysis: typeof viralWorkAnalysisService?.run === "function"
  });
  // The public work analyzer is an optional standalone capability. Keep the
  // legacy configured flag compatible for callers that only provide account
  // runtime dependencies, while gating its own route explicitly below.
  const configured = capabilityReady.acquisition
    && capabilityReady.analysis
    && capabilityReady.outreach
    && capabilityReady.inbox;

  async function lease(rawRequest = {}) {
    const request = normalizeRequest(rawRequest);
    if (!PRODUCT_AGENT_IDS.has(request.agentId)) {
      throw executionError("该 Agent 不具备独立执行资格", "CORE_AGENT_UNSUPPORTED", 409, { agentId: request.agentId });
    }
    switch (request.agentId) {
      case ACQUISITION_AGENT_ID:
        return request.operation === "inbox_hosting" ? startInboxHosting(request) : startAcquisition(request);
      case FINDER_AGENT_ID:
        return startFinder(request);
      case LIVE_DANMAKU_ANALYSIS_AGENT_ID:
        return startLiveDanmakuAnalysis(request);
      case LIVE_DANMAKU_OUTREACH_AGENT_ID:
        return startLiveDanmakuOutreach(request);
      case VIRAL_WORK_ANALYSIS_AGENT_ID:
        return analyzeViralWork(request);
      case "mkt-intent-analyst":
        return analyzeCandidates(request);
      case "mkt-cold-writer":
        return sendFirstOutreach(request);
      case "mkt-dm-inbox":
        return startInboxHosting(request);
      case "mkt-gold-customer-service":
        return startInboxHosting(request);
      default:
        throw executionError("该 Agent 不具备独立执行资格", "CORE_AGENT_UNSUPPORTED", 409, { agentId: request.agentId });
    }
  }

  async function startAcquisition(request) {
    const reception = request.agentId === ACQUISITION_AGENT_ID
      ? await optionalReceptionStrategy(request)
      : await requireReceptionStrategy(request);
    const config = acquisitionConfig(request, "authorized_account_all_signals");
    attachReceptionReference(config, reception);
    const context = acquisitionContext(request);
    return startAcquisitionTask(request, context, config, "acquisition_started");
  }

  async function startFinder(request) {
    const config = finderListenerConfig(request);
    const context = {
      ...acquisitionContext(request),
      executionAgentId: ACQUISITION_AGENT_ID
    };
    return startAcquisitionTask(request, context, config, "finder_listener_started");
  }

  async function startLiveDanmakuAnalysis(request) {
    const config = acquisitionConfig(request, "authorized_account_live", {
      discoveryOnly: true,
      analysisOnly: true,
      analysisKind: "live_danmaku",
      liveSignals: ["danmaku"],
      approvalMode: "manual",
      autoStartCloud: false
    });
    const context = {
      ...acquisitionContext(request),
      executionAgentId: ACQUISITION_AGENT_ID
    };
    return startAcquisitionTask(request, context, config, "live_danmaku_analysis_started");
  }

  async function startLiveDanmakuOutreach(request) {
    const requestedAudience = record(request.config?.audienceRules) ? request.config.audienceRules : {};
    const requestedContent = record(request.config?.contentPolicy) ? request.config.contentPolicy : {};
    const requestedCaps = record(request.config?.caps) ? request.config.caps : {};
    const requestedCapsWithoutDailyLimit = Object.fromEntries(
      Object.entries(requestedCaps).filter(([key]) => !["dailyMax", "maxTouchesPerDay"].includes(key))
    );
    const config = acquisitionConfig(request, "authorized_account_live", {
      discoveryOnly: false,
      analysisOnly: false,
      analysisKind: "live_danmaku_outreach",
      liveDanmakuOutreach: true,
      touchEveryLiveDanmaku: true,
      liveSignals: ["danmaku"],
      touchChannel: "private_message",
      approvalMode: "auto",
      contentPolicy: {
        quoteComment: false,
        maxLength: 120,
        template: "看到你刚才在直播间留言了，方便说说你想了解什么吗？",
        strategy: "看到你刚才在直播间留言了，方便说说你想了解什么吗？",
        ...requestedContent,
        conversionGoal: cleanText(requestedContent.conversionGoal || requestedAudience.goal)
      },
      caps: { dailyMax: null, sendIntervalMs: 0, cooldownMs: 0, ...requestedCapsWithoutDailyLimit },
      audienceRules: {
        goal: cleanText(requestedAudience.goal) || "承接直播间互动，邀请有兴趣的用户继续了解商品。",
        requirements: cleanText(requestedAudience.requirements || requestedAudience.goal),
        minScore: requestedAudience.minScore ?? 0,
        ...requestedAudience
      },
      autoStartCloud: false
    });
    const context = {
      ...acquisitionContext(request),
      executionAgentId: ACQUISITION_AGENT_ID
    };
    return startAcquisitionTask(request, context, config, "live_danmaku_outreach_started");
  }

  async function analyzeViralWork(request) {
    assertCapability("viralWorkAnalysis", "抖音爆款拆解官能力不可用");
    const workUrl = cleanText(request.workUrl || request.work_url || request.videoUrl || request.video_url || request.config?.workUrl);
    if (!workUrl) {
      throw executionError("抖音爆款拆解官需要提供作品链接", "CORE_AGENT_INPUT_REQUIRED", 409, { field: "workUrl" });
    }
    try {
      const result = await viralWorkAnalysisService.run({
        ...request,
        workUrl,
        goal: cleanText(request.goal || request.config?.goal) || VIRAL_WORK_ANALYSIS_DEFAULT_GOAL,
        commentLimit: request.commentLimit || request.config?.commentLimit,
        fresh: request.fresh === true || request.config?.fresh === true,
        ...(typeof onViralWorkProgress === "function"
          ? { onProgress: (snapshot) => onViralWorkProgress(request, snapshot) }
          : {})
      });
      const resultSnapshot = result?.resultSnapshot || result || null;
      return accepted(request, "viral_work_analysis_completed", {
        status: cleanText(result?.status).toUpperCase() || "SUCCEEDED",
        resultSnapshot,
        eventDescriptors: [{
          suffix: "completed",
          type: "task.completed",
          payload: {
            resultSnapshot,
            reason: "VIRAL_WORK_ANALYSIS_COMPLETED",
            text: "抖音爆款拆解官已完成，报告已生成。"
          }
        }]
      });
    } catch (error) {
      throw normalizeServiceError(error, "CORE_AGENT_VIRAL_WORK_ANALYSIS_FAILED");
    }
  }

  async function startAcquisitionTask(request, context, config, operation) {
    assertCapability("acquisition", "授权账号任务执行能力不可用");
    const lifecycleOperation = ["resume", "retry"].includes(cleanText(request.operation))
      ? cleanText(request.operation)
      : null;
    if (lifecycleOperation) {
      const taskKey = cleanText(request.taskKey || request.task_key);
      if (!taskKey) {
        throw executionError("恢复长期任务必须提供已有任务编号", "CORE_AGENT_TASK_KEY_REQUIRED", 409, {
          agentId: request.agentId,
          operation: lifecycleOperation
        });
      }
      try {
        if (typeof douyinAcquisitionService.status !== "function") {
          throw executionError("核心执行缺少长期任务状态校验能力", "CORE_AGENT_LIFECYCLE_UNAVAILABLE", 503);
        }
        const existingTask = await douyinAcquisitionService.status(taskKey);
        assertAcquisitionTaskScope(existingTask, request, context);
        const result = lifecycleOperation === "resume"
          ? await douyinAcquisitionService.resume(taskKey, { schedule: true })
          : await douyinAcquisitionService.retry(taskKey, cleanText(request.touchId || request.touch_id));
        return accepted(request, `${operation}_${lifecycleOperation}`, {
          status: cleanText(result?.state || result?.status) || "RUNNING",
          resultSnapshot: acquisitionLifecycleSnapshot(result, taskKey)
        });
      } catch (error) {
        throw normalizeServiceError(error, "CORE_AGENT_ACQUISITION_LIFECYCLE_FAILED");
      }
    }
    try {
      const task = await douyinAcquisitionService.createTask(context, config);
      const started = await douyinAcquisitionService.start(task?.key || context, {
        runImmediately: false,
        schedule: true
      });
      return accepted(request, operation, {
        status: cleanText(started?.state || started?.status) || "RUNNING",
        resultSnapshot: compactSnapshot(started, ["key", "state", "status", "health", "counters", "nextRunAt"])
      });
    } catch (error) {
      if (error?.code === "DOUYIN_ACQUISITION_DUPLICATE_TASK") {
        const details = error.details || {};
        throw executionError(
          "这个抖音账号已经在使用该 Agent，无需重复启动。",
          "MANAGED_RUNTIME_ACCOUNT_IN_USE",
          409,
          {
            existingTaskKey: details.existingTaskKey || null,
            existingTaskId: details.existingTaskId || null,
            existingTaskRunId: details.existingTaskRunId || null,
            existingState: details.existingState || "running",
            existingAgentId: request.agentId,
            existingGoal: request.goal || null,
            existingAccountKey: request.accountKey || request.accountId || null
          }
        );
      }
      throw normalizeServiceError(error, "CORE_AGENT_ACQUISITION_FAILED");
    }
  }

  async function analyzeCandidates(request) {
    assertCapability("analysis", "客户分析能力不可用");
    const candidates = list(request.candidates || request.leads);
    if (candidates.length === 0) {
      throw executionError("客户分析员需要先接收待分析的候选客户", "CORE_AGENT_INPUT_REQUIRED", 409, {
        field: "candidates"
      });
    }
    try {
      const result = await intentAnalysisService.analyze({
        taskId: request.taskId,
        taskRunId: request.taskRunId,
        conversationId: request.conversationId,
        agentId: request.agentId,
        goal: request.goal,
        account: request.account || accountReference(request),
        // Analysis consumes an explicit candidate list. It must not claim that
        // candidates came from a continuously monitored authorized account.
        sourceScope: request.sourceScope || request.config?.sourceScope?.kind || "candidate_list",
        analysisScope: request.analysisScope,
        candidates
      });
      const resultSnapshot = result?.resultSnapshot || null;
      return accepted(request, "analysis_completed", {
        status: cleanText(result?.status) || "SUCCEEDED",
        resultSnapshot,
        eventDescriptors: [{
          suffix: "completed",
          type: "task.completed",
          payload: {
            resultSnapshot,
            reason: "ANALYSIS_COMPLETED",
            text: "客户分析已完成，已将潜客判断和原始证据归档。"
          }
        }]
      });
    } catch (error) {
      throw normalizeServiceError(error, "CORE_AGENT_ANALYSIS_FAILED");
    }
  }

  async function sendFirstOutreach(request) {
    if (request.confirm !== "SEND" && request.sendConfirmed !== true) {
      throw executionError("发送私信前需要明确确认", "CORE_AGENT_SEND_CONFIRMATION_REQUIRED", 409);
    }
    const content = cleanText(request.content || request.message);
    const secId = cleanText(request.secId);
    const secUid = cleanText(request.secUid);
    const candidate = firstRecord(request.lead, request.candidate, request.prospect, request.recipient, request.config?.lead, request.config?.candidate);
    if (!content || ((!secId && !secUid) && !candidate)) {
      throw executionError("潜客触达需要目标账号和发送内容", "CORE_AGENT_INPUT_REQUIRED", 400, {
        fields: [!content ? "content" : null, !secId && !secUid && !candidate ? "lead_or_secId_or_secUid" : null].filter(Boolean)
      });
    }
    assertCapability("outreach", "授权账号的私信执行能力不可用");
    try {
      const requestId = cleanText(request.idempotencyKey || request.commandId || request.taskRunId);
      const lead = await resolveOutreachRecipient(request, { secId, secUid });
      const result = await outreachExecutor({
        taskContext: {
          agentId: request.agentId,
          taskId: request.taskId,
          taskRunId: request.taskRunId,
          conversationId: request.conversationId,
          accountId: request.accountId || request.accountKey
        },
        account: compactRecord({
          ...accountReference(request),
          ...(record(request.accountIdentity) ? request.accountIdentity : {})
        }),
        lead,
        secId: lead.secId || undefined,
        secUid: lead.secUid || undefined,
        content,
        requestId,
        reqId: requestId,
        idempotencyKey: requestId
      });
      if (result?.accepted === false || result?.ok === false) {
        throw executionError("私信发送未被执行端接受", "CORE_AGENT_OUTREACH_REJECTED", 409, { result });
      }
      assertExecutorIdentityMatches(request, result);
      // Command acceptance is intentionally not a delivery receipt. Only the
      // signed RPA ACK may transition this one-off task to SUCCEEDED.
      const delivery = normalizeOutreachDelivery(result, { submissionOnly: true });
      const resultSnapshot = outreachResultSnapshot(request, { content, lead, delivery, occurredAt: now() });
      return accepted(request, "outreach_receipt_pending", {
        status: "RUNNING",
        resultSnapshot,
        eventDescriptors: outreachEventDescriptors({ request, content, lead, delivery, resultSnapshot })
      });
    } catch (error) {
      throw normalizeServiceError(error, "CORE_AGENT_OUTREACH_FAILED");
    }
  }

  async function startInboxHosting(request) {
    assertCapability("inbox", "授权账号的私信承接能力不可用");
    const isObjectiveFirstInbox = request.agentId === ACQUISITION_AGENT_ID || request.agentId === GOLD_CUSTOMER_SERVICE_AGENT_ID;
    const reception = isObjectiveFirstInbox
      ? await optionalReceptionStrategy(request)
      : await requireReceptionStrategy(request);
    const callerConfig = record(request.config) ? request.config : {};
    const hasSavedReception = Number(reception?.revision) > 0 && record(reception?.settings);
    const settings = hasSavedReception ? reception.settings : callerConfig;
    const schedule = record(settings.schedule) ? settings.schedule : {};
    try {
      const input = {
        taskId: request.taskId,
        taskRunId: request.taskRunId,
        conversationId: request.conversationId,
        tenantId: request.tenantId,
        accountId: request.accountId || request.accountKey,
        accountName: request.accountName,
        accountIdentity: request.accountIdentity,
        accountCoordinationKey: request.accountKey || request.accountId,
        taskObjective: request.goal,
        autoReply: true,
        startPolling: true,
        planToken: cleanText(request.config?.planToken || request.planToken),
        startRequestId: cleanText(request.config?.startRequestId || request.startRequestId || request.idempotencyKey),
        pollIntervalMs: request.config?.pollIntervalMs ?? request.pollIntervalMs,
        pollWaitMs: request.config?.pollWaitMs ?? request.pollWaitMs,
        batchLimit: request.config?.batchLimit ?? request.batchLimit,
        receptionRevision: hasSavedReception ? Number(reception.revision) : null,
        receptionSettings: hasSavedReception ? settings : null,
        replyRule: hasSavedReception
          ? cleanText(settings.answerRules || settings.replyRule) || "只根据已保存的业务资料回答，不确定的信息不猜测。"
          : isObjectiveFirstInbox
            ? cleanText(callerConfig.replyRule) || "由 AI 根据当前对话、目标和已确认资料设计回复；没有依据的事实不猜测，需要人工确认时停止自动回复。"
            : "只根据已保存的业务资料回答，不确定的信息不猜测。",
        replyObjective: hasSavedReception
          ? isObjectiveFirstInbox
            ? cleanText(callerConfig.replyObjective) || cleanText(settings.goalDetails || settings.replyObjective) || receptionGoalObjective(settings)
            : cleanText(settings.goalDetails || settings.replyObjective) || receptionGoalObjective(settings)
          : cleanText(callerConfig.replyObjective),
        replyTone: hasSavedReception
          ? receptionResponseStyle(settings)
          : isObjectiveFirstInbox
            ? cleanText(callerConfig.replyTone) || "自然、专业、简短，先解决当前问题，再根据目标推进对话。"
            : receptionResponseStyle(settings),
        businessKnowledge: hasSavedReception ? cleanText(settings.knowledge) : cleanText(callerConfig.businessKnowledge),
        handoffRules: hasSavedReception
          ? normalizeHandoffRules(settings.handoff)
          : isObjectiveFirstInbox
            ? cleanText(callerConfig.handoffRules) || ["价格承诺", "投诉退款", "无法确认的事实"]
            : cleanText(callerConfig.handoffRules) || normalizeHandoffRules(settings.handoff),
        strategyMode: cleanText(callerConfig.strategyMode),
        strategyPlan: callerConfig.strategyPlan && typeof callerConfig.strategyPlan === "object" ? callerConfig.strategyPlan : null,
        verifiedInboxPlan: callerConfig.verifiedInboxPlan && typeof callerConfig.verifiedInboxPlan === "object"
          ? callerConfig.verifiedInboxPlan
          : null,
        schedule,
        takeover: request.takeover === true
      };
      const result = typeof inboxExecutor === "function"
        ? await inboxExecutor({ request, config: callerConfig, input })
        : await startInboxWithService(request, input);
      return accepted(request, "inbox_hosting_started", {
        status: cleanText(result?.status) || "RUNNING",
        resultSnapshot: compactSnapshot(result, ["status", "runtimeId", "managed", "accountId", "runtime", "privateReception"])
      });
    } catch (error) {
      throw normalizeServiceError(error, "CORE_AGENT_INBOX_FAILED");
    }
  }

  async function startInboxWithService(request, input) {
    const inbox = getInboxAgentService?.(request.agentId, request.tenantId, accountScope(request));
    if (!inbox || typeof inbox.startManaged !== "function") {
      throw executionError("授权账号的私信承接能力不可用", "CORE_AGENT_EXECUTOR_UNAVAILABLE", 503);
    }
    return inbox.startManaged(input);
  }

  async function requireReceptionStrategy(request) {
    if (typeof resolveReceptionStrategy !== "function") return null;
    let reception;
    try {
      reception = await resolveReceptionStrategy({
        request,
        tenantId: request.tenantId || null,
        account: request.accountIdentity || null,
        accountId: request.accountId || request.accountKey || null
      });
    } catch (error) {
      throw normalizeServiceError(error, "CORE_AGENT_RECEPTION_STRATEGY_LOOKUP_FAILED");
    }
    if (!record(reception) || Number(reception.revision) <= 0 || !record(reception.settings)) {
      throw executionError("请先为这个抖音账号保存接待方式，再启动需要私信承接的 Agent", "CORE_AGENT_RECEPTION_STRATEGY_REQUIRED", 409, {
        agentId: request.agentId,
        accountId: request.accountId || request.accountKey || null
      });
    }
    return reception;
  }

  async function optionalReceptionStrategy(request) {
    if (typeof resolveReceptionStrategy !== "function") return null;
    try {
      const reception = await resolveReceptionStrategy({
        request,
        tenantId: request.tenantId || null,
        account: request.accountIdentity || null,
        accountId: request.accountId || request.accountKey || null
      });
      return Number(reception?.revision) > 0 && record(reception?.settings) ? reception : null;
    } catch (error) {
      throw normalizeServiceError(error, "CORE_AGENT_RECEPTION_STRATEGY_LOOKUP_FAILED");
    }
  }

  function assertCapability(capability, message) {
    if (capabilityReady[capability]) return;
    throw executionError(message, "CORE_AGENT_EXECUTION_NOT_CONFIGURED", 503, { capability });
  }

  async function resolveOutreachRecipient(request, directAddress) {
    const rawLead = outreachLead(request, directAddress);
    if (typeof resolveOutreachLead !== "function") {
      if (!rawLead.secId && !rawLead.secUid) {
        throw executionError("潜客触达需要可验证的抖音账号", "CORE_AGENT_INPUT_REQUIRED", 400, { field: "lead" });
      }
      return rawLead;
    }
    let resolved;
    try {
      resolved = await resolveOutreachLead({
        request,
        lead: rawLead,
        tenantId: request.tenantId || null,
        accountId: request.accountId || request.accountKey || null
      });
    } catch (error) {
      throw normalizeServiceError(error, "CORE_AGENT_OUTREACH_LEAD_UNVERIFIED");
    }
    if (!record(resolved)) {
      throw executionError("只能触达成果中心中已核验的潜客", "CORE_AGENT_OUTREACH_LEAD_UNVERIFIED", 409);
    }
    const lead = outreachLead({ ...request, lead: resolved }, {
      secId: cleanText(resolved.secId || resolved.sec_id),
      secUid: cleanText(resolved.secUid || resolved.sec_uid)
    });
    if (!lead.secId && !lead.secUid) {
      throw executionError("该潜客缺少可验证的抖音账号，不能发起触达", "CORE_AGENT_OUTREACH_LEAD_UNVERIFIED", 409, {
        leadId: lead.id || rawLead.id || null
      });
    }
    return lead;
  }

  function accepted(request, operation, { status = "RUNNING", resultSnapshot = null, eventDescriptors = [] } = {}) {
    return {
      accepted: true,
      dispatched: true,
      source: "core-agent-execution",
      status,
      ...(resultSnapshot ? { resultSnapshot } : {}),
      events: eventsFor(request, operation, resultSnapshot, eventDescriptors)
    };
  }

  function eventsFor(request, operation, resultSnapshot = null, eventDescriptors = []) {
    const occurredAt = now();
    const base = {
      taskId: request.taskId,
      taskRunId: request.taskRunId,
      conversationId: request.conversationId,
      agentId: request.agentId,
      occurredAt
    };
    const events = [{
      eventId: `core:${request.agentId}:${request.taskRunId || request.taskId}:${operation}:accepted`,
      type: "task.execution.accepted",
      ...base,
      payload: { source: "core-agent-execution", operation }
    }];
    if (resultSnapshot) {
      events.push({
        eventId: `core:${request.agentId}:${request.taskRunId || request.taskId}:${operation}:snapshot`,
        type: "task.result.snapshot.updated",
        ...base,
        payload: { resultSnapshot }
      });
    }
    for (const [index, descriptor] of (Array.isArray(eventDescriptors) ? eventDescriptors : []).entries()) {
      const type = cleanText(descriptor?.type);
      if (!type) continue;
      const suffix = cleanText(descriptor?.suffix) || String(index + 1);
      events.push({
        eventId: `core:${request.agentId}:${request.taskRunId || request.taskId}:${operation}:${suffix}`,
        type,
        ...base,
        payload: record(descriptor?.payload) ? descriptor.payload : {}
      });
    }
    return events;
  }

  return Object.freeze({
    kind: "core-agent-execution",
    configured,
    requiresExecutorUid: true,
    acceptsExecutionPayload: true,
    lease
  });
}

function normalizeRequest(raw) {
  if (!record(raw)) throw executionError("核心执行请求必须是对象", "CORE_AGENT_INPUT_INVALID", 400);
  return {
    ...raw,
    agentId: cleanText(raw.agentId),
    taskId: cleanText(raw.taskId),
    taskRunId: cleanText(raw.taskRunId),
    conversationId: cleanText(raw.conversationId),
    tenantId: cleanText(raw.tenantId),
    accountId: cleanText(raw.accountId),
    accountKey: cleanText(raw.accountKey),
    accountName: cleanText(raw.accountName),
    taskKey: cleanText(raw.taskKey || raw.task_key),
    operation: cleanText(raw.operation),
    secId: cleanText(raw.secId || raw.sec_id),
    secUid: cleanText(raw.secUid || raw.sec_uid),
    config: record(raw.config) ? raw.config : record(raw.configuration) ? raw.configuration : {}
  };
}

function acquisitionContext(request) {
  const accountId = request.accountId || request.accountKey || cleanText(request.config?.accountId);
  if (!accountId) throw executionError("请先选择并授权一个抖音账号", "CORE_AGENT_ACCOUNT_REQUIRED", 409);
  return {
    agentId: request.agentId,
    taskId: request.taskId,
    taskRunId: request.taskRunId,
    conversationId: request.conversationId,
    tenantId: request.tenantId,
    accountId,
    accountRef: request.accountRef || request.accountKey || accountId,
    accountIdentity: request.accountIdentity || null
  };
}

function acquisitionConfig(request, sourceKind, additions = {}) {
  const config = stripHistoricalScanFields({ ...request.config });
  for (const field of ["workSchedule", "contactTiming", "schedule", "timeWindow", "time_window"]) delete config[field];
  const workWindow = stripHistoricalScanFields(config.workWindow);
  const sourceScope = { ...stripHistoricalScanFields(config.sourceScope), kind: sourceKind };
  const hasFilters = isObjectRecord(config.filters);
  const hasFindingStrategy = isObjectRecord(config.findingStrategy);
  const filters = stripHistoricalScanFields(config.filters);
  const findingStrategy = stripHistoricalScanFields(config.findingStrategy);
  if (hasFilters) config.filters = filters;
  else delete config.filters;
  if (hasFindingStrategy) {
    const hasStrategySourceScope = isObjectRecord(findingStrategy.sourceScope);
    const hasStrategyWorkWindow = isObjectRecord(findingStrategy.workWindow);
    const strategySourceScope = stripHistoricalScanFields(findingStrategy.sourceScope);
    if (hasStrategySourceScope) findingStrategy.sourceScope = strategySourceScope;
    else delete findingStrategy.sourceScope;
    const strategyWorkWindow = stripHistoricalScanFields(findingStrategy.workWindow);
    if (hasStrategyWorkWindow) findingStrategy.workWindow = strategyWorkWindow;
    else delete findingStrategy.workWindow;
    config.findingStrategy = findingStrategy;
  } else {
    delete config.findingStrategy;
  }
  // These two product Agents are listeners. Historical scans belong to public
  // discovery or a separate project, never to an always-on account task.
  const next = {
    ...config,
    ...additions,
    accountId: cleanText(config.accountId) || request.accountId || request.accountKey,
    accountRef: config.accountRef || request.accountRef || request.accountKey || request.accountId,
    accountIdentity: config.accountIdentity || request.accountIdentity || null,
    workWindow,
    sourceScope
  };
  if (request.agentId === LIVE_DANMAKU_ANALYSIS_AGENT_ID || next.analysisKind === "live_danmaku") next.liveSignals = ["danmaku"];
  if (request.agentId === ACQUISITION_AGENT_ID && sourceKind === "authorized_account_all_signals") {
    next.accountContext = {
      mode: "automatic",
      includeProfile: true,
      includeRecentWorks: true,
      identifyServiceUsers: true
    };
    const configuredAudience = isObjectRecord(next.audienceRules) ? next.audienceRules : {};
    next.audienceRules = {
      mode: "account_context",
      goal: DOUYIN_AUTO_AUDIENCE_GOAL,
      requirements: "",
      minScore: configuredAudience.minScore ?? 80,
      autoIdentifyAccountPositioning: true,
      autoIdentifyServiceUsers: true
    };
    next.contentPolicy = {
      ...(isObjectRecord(next.contentPolicy) ? next.contentPolicy : {}),
      mode: "evidence_first",
      template: "",
      strategy: "",
      conversionGoal: cleanText(config.replyObjective || config.conversionGoal || config.contentPolicy?.conversionGoal || request.goal)
    };
  }
  return next;
}

function stripHistoricalScanFields(value) {
  const next = record(value) ? { ...value } : {};
  for (const field of [
    "timeWindow",
    "time_window",
    "schedule",
    "workSchedule",
    "timezone",
    "lookbackDays",
    "lookback_days",
    "days",
    "start",
    "end",
    "from",
    "to",
    "dateRange",
    "date_range",
    "historyWindow",
    "history_window",
    "contentRange",
    "content_range",
    "workScope",
    "work_scope",
    "workCount",
    "work_count"
  ]) {
    delete next[field];
  }
  return next;
}

function isObjectRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function finderListenerConfig(request) {
  const sourceKind = normalizeFinderListenerSource(finderListenerSourceValue(request));
  const config = acquisitionConfig(request, sourceKind, {
    discoveryOnly: true,
    approvalMode: "manual",
    autoStartCloud: false
  });
  for (const field of ["touchChannel", "touchContent", "contentPolicy", "frequency", "caps", "platformConstraints", "stopConditions", "contactTiming", "workWindow", "workSchedule", "schedule"]) delete config[field];
  return config;
}

function finderListenerSourceValue(request = {}) {
  const configuredScope = request.config?.sourceScope;
  if (record(configuredScope)) {
    return configuredScope.kind ?? configuredScope.type ?? configuredScope.scope ?? request.sourceScope;
  }
  return configuredScope ?? request.sourceScope;
}

function normalizeFinderListenerSource(value) {
  const source = cleanText(value).toLowerCase();
  if (!source) return "authorized_account_comments";
  if (["authorized_account_all_signals", "own_account_all_signals", "all", "all_signals"].includes(source)) return "authorized_account_all_signals";
  if (["authorized_account_live", "live", "live_room"].includes(source)) return "authorized_account_live";
  if (["authorized_account_interactions", "interactions", "interaction"].includes(source)) return "authorized_account_interactions";
  if (["authorized_account_comments", "comments", "comment"].includes(source)) return "authorized_account_comments";
  throw executionError("找客专员的长期任务只能监听已授权账号的评论、直播互动、账号互动通知或它们的组合；公域找人应走公开找人服务", "CORE_AGENT_FINDER_LISTENER_SOURCE_INVALID", 409, {
    sourceScope: source
  });
}

function attachReceptionReference(config, reception) {
  if (!record(reception)) return config;
  config.reception = {
    revision: Number(reception.revision),
    settings: reception.settings
  };
  return config;
}

function normalizeHandoffRules(value) {
  const handoff = record(value) ? value : {};
  const rules = [];
  if (handoff.price !== false) rules.push("具体价格与报价转人工");
  if (handoff.complaints !== false) rules.push("投诉与售后争议转人工");
  if (handoff.unknown !== false) rules.push("无法确认的信息转人工");
  if (handoff.humanRequest !== false) rules.push("用户要求人工时立即转人工");
  return rules.join("；");
}

function assertAcquisitionTaskScope(task, request, context) {
  const taskContext = record(task?.context) ? task.context : task;
  const taskAgentId = cleanText(taskContext?.agentId || task?.agentId);
  const taskAccountId = cleanText(taskContext?.accountId || task?.accountId);
  const taskTenantId = cleanText(taskContext?.tenantId || task?.tenantId);
  if (taskAgentId && taskAgentId !== request.agentId) {
    throw executionError("不能操作其他 Agent 的长期任务", "CORE_AGENT_TASK_SCOPE_MISMATCH", 409, {
      taskAgentId,
      requestedAgentId: request.agentId
    });
  }
  if (taskAccountId && context.accountId && taskAccountId !== context.accountId) {
    throw executionError("不能跨抖音账号恢复或重试长期任务", "CORE_AGENT_TASK_SCOPE_MISMATCH", 409, {
      taskAccountId,
      requestedAccountId: context.accountId
    });
  }
  if (taskTenantId && request.tenantId && taskTenantId !== request.tenantId) {
    throw executionError("不能跨租户操作长期任务", "CORE_AGENT_TASK_SCOPE_MISMATCH", 403, {
      taskTenantId,
      requestedTenantId: request.tenantId
    });
  }
}

function acquisitionLifecycleSnapshot(result, fallbackKey) {
  const candidate = record(result?.task) ? result.task : result;
  const snapshot = compactSnapshot(candidate, ["key", "state", "status", "health", "counters", "nextRunAt"]);
  return snapshot || { key: fallbackKey };
}

function accountScope(request) {
  return {
    tenantId: request.tenantId || undefined,
    accountId: request.accountId || request.accountKey || undefined,
    accountKey: request.accountKey || request.accountId || undefined,
    accountIdentity: request.accountIdentity || undefined
  };
}

function accountReference(request) {
  return {
    accountId: request.accountId || request.accountKey || undefined,
    accountName: request.accountName || undefined
  };
}

function assertExecutorIdentityMatches(request, result) {
  const expectedUid = cleanText(request.uid || request.robotUid || request.robot_uid);
  const executorUid = cleanText(result?.executorUid || result?.executor_uid || result?.uid);
  if (expectedUid && executorUid && expectedUid !== executorUid) {
    throw executionError("云电脑执行身份与当前任务授权身份不一致", "CORE_AGENT_EXECUTOR_IDENTITY_MISMATCH", 409, {
      expectedUid,
      executorUid
    });
  }
}

function compactSnapshot(input, fields) {
  if (!record(input)) return null;
  const output = {};
  for (const field of fields) {
    if (input[field] !== undefined) output[field] = input[field];
  }
  return Object.keys(output).length ? output : null;
}

function normalizeOutreachDelivery(result = {}, { submissionOnly = false } = {}) {
  const receipt = record(result?.receipt) ? result.receipt : {};
  const providerState = cleanText(
    receipt.state || receipt.deliveryState || receipt.delivery_state || receipt.status
    || result.state || result.deliveryState || result.delivery_state || result.status
  ).toLowerCase();
  const commandId = cleanText(
    receipt.commandId || receipt.command_id || receipt.letterInfoId || receipt.letter_info_id
    || result.commandId || result.command_id || result.letterInfoId || result.letter_info_id
  ) || null;
  const messageId = cleanText(
    receipt.messageId || receipt.message_id || receipt.id
    || result.messageId || result.message_id || result.id
  ) || null;
  const reqId = cleanText(receipt.reqId || receipt.req_id || result.reqId || result.req_id || result.requestId || result.idempotencyKey) || null;
  const receiptPending = submissionOnly
    || result?.receiptPending === true
    || receipt?.receiptPending === true
    || ["pending", "accepted", "queued", "submitted", "sending"].includes(providerState);
  const finalState = ["sent", "delivered", "success", "succeeded", "completed"].includes(providerState);
  const confirmed = !submissionOnly && !receiptPending && (finalState || Boolean(messageId));
  const deliveryState = confirmed ? (providerState === "delivered" ? "delivered" : "sent") : "pending";
  return {
    confirmed,
    receiptPending: !confirmed,
    deliveryState,
    providerState: providerState || (confirmed ? "sent" : "pending"),
    messageId,
    commandId,
    reqId,
    message: cleanText(result?.message || receipt.message) || null
  };
}

function outreachLead(request, { secId, secUid }) {
  const candidate = firstRecord(request.lead, request.candidate, request.prospect, request.recipient, request.config?.lead, request.config?.candidate) || {};
  const id = cleanText(
    candidate.leadId || candidate.lead_id || candidate.id || candidate.sourceRecordId || candidate.source_record_id
    || candidate.secUid || candidate.sec_uid || candidate.secId || candidate.sec_id || secUid || secId
  );
  const nickname = cleanText(candidate.nickname || candidate.name || candidate.displayName || candidate.display_name || request.nickname || request.recipientName) || "待触达用户";
  const source = firstRecord(candidate.source, candidate.sourceContext, candidate.evidence?.source);
  const originalContent = cleanText(candidate.originalContent || candidate.original_content || candidate.comment || candidate.text || candidate.message);
  const lead = compactRecord({
    id,
    leadId: id,
    nickname,
    name: nickname,
    secId: cleanText(candidate.secId || candidate.sec_id || secId) || null,
    secUid: cleanText(candidate.secUid || candidate.sec_uid || secUid) || null,
    source: source ? compactRecord(source) : null,
    sourceType: cleanText(candidate.sourceType || candidate.source_type || source?.type) || null,
    sourceLabel: cleanText(candidate.sourceLabel || candidate.source_label || source?.label || source?.name) || null,
    sourceTitle: cleanText(candidate.sourceTitle || candidate.source_title || source?.title || candidate.workTitle || candidate.work_title) || null,
    originalContent: originalContent || null,
    evidence: originalContent ? { originalContent } : null
  });
  return lead;
}

function outreachResultSnapshot(request, { content, lead, delivery, occurredAt }) {
  const receipt = compactRecord({
    state: delivery.deliveryState,
    providerState: delivery.providerState,
    receiptPending: delivery.receiptPending,
    messageId: delivery.messageId,
    commandId: delivery.commandId,
    reqId: delivery.reqId,
    message: delivery.message,
    updatedAt: occurredAt
  });
  const queueItem = compactRecord({
    id: `outreach:${request.taskRunId || request.taskId || "task"}:${lead.id || lead.secUid || lead.secId || "recipient"}`,
    lead,
    recipient: lead,
    content,
    state: delivery.deliveryState,
    deliveryState: delivery.deliveryState,
    requestId: delivery.reqId,
    commandId: delivery.commandId,
    receipt,
    updatedAt: occurredAt
  });
  return {
    schemaVersion: 1,
    type: "single_outreach",
    agentId: request.agentId,
    taskId: request.taskId,
    taskRunId: request.taskRunId,
    accountId: request.accountId || request.accountKey || null,
    generatedAt: occurredAt,
    leads: [lead],
    candidates: [lead],
    approvalQueue: [queueItem],
    delivery: receipt,
    counts: {
      candidates: 1,
      pending: delivery.confirmed ? 0 : 1,
      sent: delivery.confirmed ? 1 : 0,
      delivered: delivery.deliveryState === "delivered" ? 1 : 0
    },
    outreach: {
      lastEvent: delivery.confirmed ? "outreach.sent" : "outreach.accepted",
      accepted: delivery.confirmed ? 0 : 1,
      sent: delivery.confirmed ? 1 : 0,
      failed: 0
    }
  };
}

function outreachEventDescriptors({ request, content, lead, delivery, resultSnapshot }) {
  const receiptPayload = compactRecord({
    lead,
    recipient: lead,
    content,
    deliveryState: delivery.deliveryState,
    providerState: delivery.providerState,
    receiptPending: delivery.receiptPending,
    messageId: delivery.messageId,
    commandId: delivery.commandId,
    reqId: delivery.reqId,
    message: delivery.message
  });
  if (delivery.confirmed) {
    return [
      {
        suffix: "receipt",
        type: "outreach.sent",
        payload: { ...receiptPayload, completionManaged: "core_event" }
      },
      {
        suffix: "completed",
        type: "task.completed",
        payload: {
          resultSnapshot,
          reason: "OUTREACH_DELIVERY_CONFIRMED",
          text: "私信已收到平台成功回执。"
        }
      }
    ];
  }
  return [
    { suffix: "accepted", type: "outreach.accepted", payload: receiptPayload },
    {
      suffix: "checking",
      type: "delivery.checking",
      payload: {
        ...receiptPayload,
        text: "平台已接收发送动作，等待最终回执。"
      }
    }
  ];
}

function firstRecord(...values) {
  return values.find(record) || null;
}

function compactRecord(input) {
  if (!record(input)) return {};
  return Object.fromEntries(Object.entries(input)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => [key, record(value) ? compactRecord(value) : value]));
}

function normalizeServiceError(error, fallbackCode) {
  if (error instanceof CoreAgentExecutionError) return error;
  return executionError(error?.message || "核心执行服务暂时不可用", error?.code || fallbackCode, error?.statusCode || 502, error?.details || {});
}

function executionError(message, code, statusCode, details = {}) {
  return new CoreAgentExecutionError(message, { code, statusCode, details });
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function list(value) {
  return Array.isArray(value) ? value.filter(record) : [];
}

function record(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
