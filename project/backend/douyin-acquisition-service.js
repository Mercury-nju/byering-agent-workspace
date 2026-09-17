import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { createHash, randomUUID } from "node:crypto";

import {
  APPROVAL_MODES,
  CLOUD_STATES,
  EVENT_TYPES,
  TASK_STATES,
  TOUCH_STATES,
  canTransitionTask,
  transitionTask,
  transitionTouch
} from "../src/salebuddy/agents/acquisition-contract.js";
import { createAccountResolver, normalizeAccountReference, normalizeResolvedAccount } from "./account-resolver.js";
import { createDouyinCommentNotificationSource } from "./douyin-comment-notification-source.js";
import { createDouyinInteractionSource } from "./douyin-interaction-source.js";
import { normalizeMessage } from "./douyin-inbox-agent.js";
import { classifyIntent, INBOX_INTENTS } from "./douyin-reply-strategy.js";
import { extractLeadContact } from "../src/salebuddy/agents/lead-capture.js";
import { analyzeLiveDanmakuSignals } from "../src/salebuddy/agents/live-danmaku-analysis.js";
import {
  DOUYIN_ACCOUNT_CLOUD_RUNTIME_ID,
  DOUYIN_ACQUISITION_LEGACY_CLOUD_AGENT_IDS
} from "../src/salebuddy/agents/marketplace.js";
import { DOUYIN_AUTO_AUDIENCE_GOAL } from "../src/salebuddy/agents/acquisition-contract.js";

let defaultCloudRegistryFactory = null;
try {
  ({ createDouyinAgentCloudRegistry: defaultCloudRegistryFactory } = await import("./douyin-agent-cloud-registry.js"));
} catch (error) {
  if (error?.code !== "ERR_MODULE_NOT_FOUND") throw error;
}

const SNAPSHOT_VERSION = 1;
const MAX_EVENTS = 500;
const MAX_REPLIES = 200;
const LIVE_DANMAKU_ANALYSIS_AGENT_ID = "mkt-live-danmaku-analysis";
const LIVE_DANMAKU_OUTREACH_AGENT_ID = "mkt-live-danmaku-outreach";
const AGENT_IDS = new Set(["mkt-comment-acquisition", "mkt-find-people", LIVE_DANMAKU_ANALYSIS_AGENT_ID, LIVE_DANMAKU_OUTREACH_AGENT_ID]);
const EXECUTION_AGENT_IDS = new Set(["mkt-comment-acquisition"]);
const FINDER_AGENT_ID = "mkt-find-people";
const COMPREHENSIVE_AGENT_ID = "mkt-comment-acquisition";
const COMPREHENSIVE_SOURCE_SCOPE = "authorized_account_all_signals";
const LEGACY_COMPREHENSIVE_SOURCE_SCOPE = "authorized_account_interactions";
const AUTHORIZED_LISTENER_SOURCE_SCOPES = new Set([
  COMPREHENSIVE_SOURCE_SCOPE,
  LEGACY_COMPREHENSIVE_SOURCE_SCOPE,
  "authorized_account_comments",
  "authorized_account_live"
]);
const RETIRED_LIVE_AGENT_ID = "mkt-live-lead-miner";
const DOUYIN_ACCOUNT_CLOUD_AGENT_ID = DOUYIN_ACCOUNT_CLOUD_RUNTIME_ID;
const DOUYIN_RUNTIME_LEGACY_CLOUD_AGENT_IDS = Object.freeze([
  ...new Set([...DOUYIN_ACQUISITION_LEGACY_CLOUD_AGENT_IDS, RETIRED_LIVE_AGENT_ID])
]);
const TRANSIENT_CODES = new Set([
  "DOUYIN_MCP_TIMEOUT", "NETWORK_ERROR", "ETIMEDOUT", "ECONNRESET",
  "DOUYIN_NOTIFICATION_MODE_NOT_READY", "DOUYIN_NOTIFICATION_STARTING", "DOUYIN_CLOUD_NOT_READY"
]);
const PROVIDER_OUTREACH_QUOTA_CODES = new Set([
  "DOUYIN_DM_DAILY_LIMIT",
  "DOUYIN_MESSAGE_RATE_LIMIT",
  "DOUYIN_OUTREACH_QUOTA_EXCEEDED",
  "DOUYIN_PRIVATE_MESSAGE_LIMIT",
  "MESSAGE_RATE_LIMIT",
  "PLATFORM_RATE_LIMIT",
  "QUOTA_EXCEEDED",
  "RATE_LIMITED",
  "TOO_MANY_REQUESTS"
]);
const HUMAN_TERMS = ["价格", "多少钱", "报价", "优惠", "折扣", "投诉", "退款", "退货", "合同", "承诺", "保证", "效果", "太贵", "赔偿"];
const TASK_DEDUP_STATES = new Set([
  TASK_STATES.CONFIGURING,
  TASK_STATES.RUNNING,
  TASK_STATES.PAUSED,
  TASK_STATES.DEGRADED
]);
const TASK_FINGERPRINT_IGNORED_KEYS = new Set(["accountIdentity", "accountRef", "cursor"]);
// These Agent ids own durable account-scoped listeners. Finder also has a
// public one-off mode, but its authorized-account mode is a listener and must
// receive the same deduplication and cloud-authentication guarantees.
const CONTINUOUS_AGENT_IDS = new Set([COMPREHENSIVE_AGENT_ID, FINDER_AGENT_ID, LIVE_DANMAKU_ANALYSIS_AGENT_ID, LIVE_DANMAKU_OUTREACH_AGENT_ID]);
const SYSTEM_DUPLICATE_PAUSE_REASON = "system_duplicate_consolidation";
const STALE_ERROR_RETENTION_MS = 72 * 60 * 60 * 1000;

export function isProviderOutreachQuotaError(value) {
  const queue = [value];
  const seen = new Set();
  while (queue.length) {
    const current = queue.shift();
    if (!current || (typeof current !== "object" && typeof current !== "string")) continue;
    if (typeof current === "object") {
      if (seen.has(current)) continue;
      seen.add(current);
      for (const key of ["error", "details", "data", "result", "response"]) {
        if (current[key]) queue.push(current[key]);
      }
      const code = String(current.code || current.errorCode || current.error_code || current.reason || current.status || "").trim().toUpperCase();
      if (PROVIDER_OUTREACH_QUOTA_CODES.has(code) || Number(current.statusCode || current.status_code) === 429 || code === "429") return true;
      if (/(?:RATE|LIMIT|QUOTA|FREQUENCY|FREQ|TOO_MANY)/.test(code)) return true;
      const message = String(current.message || current.detail || current.errorMessage || current.error_message || "");
      if (code === "PRIVATE_MESSAGE_FAILED" && (
        /(?:操作频繁|发送频繁|请求过于频繁)/u.test(message)
        || /(?:账号|账户|每日|今日|当天|频控|额度|配额|上限)/u.test(message) && /(?:私信|消息|触达|发送)/u.test(message)
      )) return true;
      queue.push(message);
      continue;
    }
    if (/(?:操作频繁|发送频繁|请求过于频繁)/u.test(current)
      || /(?:账号|账户|每日|今日|当天|频控|额度|配额|上限)/u.test(current) && /(?:私信|消息|触达|发送)/u.test(current)) return true;
  }
  return false;
}

/**
 * Durable long-running controller for the comment/live acquisition experts.
 *
 * The service owns task lifecycle and touch idempotency. Public discovery,
 * account resolution, and cloud sessions remain delegated to their existing
 * adapters so this module does not create a second MCP or Agent hierarchy.
 */
export function createDouyinAcquisitionService({
  legacyPublicDiscoveryService = null,
  // Kept as a migration alias for injected integrations. New callers must use
  // legacyPublicDiscoveryService so the optional legacy boundary is explicit.
  prospectService = null,
  commentNotificationSource = null,
  interactionSource = null,
  accountResolver = createAccountResolver(),
  cloudRegistry = defaultCloudRegistryFactory ? defaultCloudRegistryFactory() : null,
  stateFile = process.env.BYERING_DOUYIN_ACQUISITION_STATE_FILE
    || join(homedir(), ".byering", "douyin-acquisition.json"),
  now = () => new Date().toISOString(),
  sleep = defaultSleep,
  eventSink = null,
  touchGenerator = null,
  capabilityProbe = null,
  profileDataClient = null,
  profileDataTimeoutMs = 10_000,
  pollIntervalMs = 60_000,
  maxScanAttempts = 2,
  autoResume = true,
  leaseTtlMs = 120_000
} = {}) {
  const publicDiscoveryService = legacyPublicDiscoveryService ?? prospectService;
  if (publicDiscoveryService && typeof publicDiscoveryService.discover !== "function") {
    throw new TypeError("legacyPublicDiscoveryService.discover is required");
  }
  const target = String(stateFile || "").trim();
  if (!target) throw new TypeError("stateFile is required");
  mkdirSync(dirname(target), { recursive: true });
  const state = loadSnapshot(target);
  const baselineTasks = clone(state.tasks);
  const baselineCapabilities = clone(state.capabilities);
  const ownerId = `runner:${randomUUID()}`;
  const runners = new Map();
  const activeRuns = new Map();
  const timers = new Map();
  const leaseTimers = new Map();
  const leaseRecoveryTimers = new Map();
  const authorizedCommentSource = commentNotificationSource || (cloudRegistry
    ? createDouyinCommentNotificationSource({ cloudRegistry })
    : null);
  const comprehensiveSource = interactionSource || (cloudRegistry
    ? createDouyinInteractionSource({
      cloudRegistry,
      commentSource: authorizedCommentSource,
      profileDataClient,
      profileDataTimeoutMs,
      now
    }) : null);

  function taskRuntimeAlive(task = {}, leases = state.leases, runtimeKeys = runners) {
    const expiresAt = Date.parse(leases?.[task?.key]?.expiresAt || "");
    const nowAt = Date.parse(now());
    return (runtimeKeys?.has(task?.key) || Boolean(leases?.[task?.key]?.owner))
      && Number.isFinite(expiresAt)
      && Number.isFinite(nowAt)
      && expiresAt > nowAt;
  }

  function taskOccupationActive(task = {}, leases = state.leases, runtimeKeys = runners) {
    return task.state !== TASK_STATES.RUNNING || taskRuntimeAlive(task, leases, runtimeKeys);
  }

  maintainPersistedTasks();
  if (autoResume) queueMicrotask(() => resumePersisted({ runImmediately: true }).catch(() => {}));

  function persist() {
    const result = withLeaseLock(() => {
      const latest = loadSnapshot(target);
      const dirtyTaskKeys = new Set();
      for (const [key, task] of Object.entries(state.tasks || {})) {
        if (JSON.stringify(task) !== JSON.stringify(baselineTasks[key])) dirtyTaskKeys.add(key);
      }
      for (const key of dirtyTaskKeys) latest.tasks[key] = clone(state.tasks[key]);
      const capabilities = { ...(latest.capabilities || {}) };
      for (const [key, capability] of Object.entries(state.capabilities || {})) {
        if (JSON.stringify(capability) !== JSON.stringify(baselineCapabilities[key])) capabilities[key] = clone(capability);
      }
      const leases = { ...(latest.leases || {}) };
      for (const [key, lease] of Object.entries(state.leases || {})) {
        if (lease?.owner === ownerId) leases[key] = clone(lease);
      }
      latest.version = SNAPSHOT_VERSION;
      latest.tasks = latest.tasks || {};
      latest.capabilities = capabilities;
      latest.leases = leases;
      writeSnapshot(target, latest);
      for (const key of dirtyTaskKeys) baselineTasks[key] = clone(state.tasks[key]);
      for (const [key, capability] of Object.entries(state.capabilities || {})) {
        if (JSON.stringify(capability) !== JSON.stringify(baselineCapabilities[key])) baselineCapabilities[key] = clone(capability);
      }
      state.leases = leases;
      return true;
    });
    if (result === null) throw acquisitionError("获客状态持久化锁被占用", "DOUYIN_ACQUISITION_PERSIST_LOCKED", 503);
  }

  persistInjectedCapabilities();

  function cloudBindingForTask(task = {}) {
    const scope = cloudScopeForTask(task);
    const executionAgentId = acquisitionExecutionAgentId(task.context);
    if (!EXECUTION_AGENT_IDS.has(executionAgentId)) return { agentId: executionAgentId, scope };
    if (typeof cloudRegistry?.adopt === "function") {
      cloudRegistry.adopt(DOUYIN_ACCOUNT_CLOUD_AGENT_ID, {
        ...scope,
        fromAgentIds: DOUYIN_RUNTIME_LEGACY_CLOUD_AGENT_IDS
      });
    }
    return { agentId: DOUYIN_ACCOUNT_CLOUD_AGENT_ID, scope };
  }

  function createTask(rawContext = {}, rawConfig = {}) {
    if (rawContext?.context) {
      rawConfig = rawContext.config || rawConfig;
      rawContext = rawContext.context;
    }
    const context = normalizeContext(rawContext);
    const config = normalizeComprehensiveScope(context, normalizeConfig(rawConfig));
    if (context.agentId === COMPREHENSIVE_AGENT_ID) {
      assertComprehensiveTouchChannel(config.touchChannel);
    }
    if (context.agentId === FINDER_AGENT_ID && !isFinderListenerSourceScope(config.sourceScope)) {
      throw acquisitionError("找客专员只可持续监听授权账号的新评论、直播互动、账号互动通知或它们的组合", "DOUYIN_ACQUISITION_SOURCE_SCOPE_INVALID", 400);
    }
    if (context.agentId === FINDER_AGENT_ID && config.discoveryOnly !== true) {
      throw acquisitionError("找客专员只负责发现和归档候选客户，不能在监听任务中创建或发送触达内容", "DOUYIN_DISCOVERY_ONLY_REQUIRED", 400);
    }
    if (context.agentId === LIVE_DANMAKU_ANALYSIS_AGENT_ID && config.sourceScope?.kind !== "authorized_account_live") {
      throw acquisitionError("直播间弹幕分析只能读取已授权账号当前直播间", "DOUYIN_LIVE_ANALYSIS_SOURCE_SCOPE_INVALID", 400);
    }
    if (context.agentId === LIVE_DANMAKU_ANALYSIS_AGENT_ID && config.analysisOnly !== true) {
      throw acquisitionError("直播间弹幕分析只能以分析模式运行", "DOUYIN_LIVE_ANALYSIS_ONLY_REQUIRED", 400);
    }
    if (context.agentId === LIVE_DANMAKU_ANALYSIS_AGENT_ID && config.discoveryOnly !== true) {
      throw acquisitionError("直播间弹幕分析不支持触达，只能归档和分析互动信号", "DOUYIN_DISCOVERY_ONLY_REQUIRED", 400);
    }
    if (context.agentId === LIVE_DANMAKU_OUTREACH_AGENT_ID && config.sourceScope?.kind !== "authorized_account_live") {
      throw acquisitionError("直播间未成交客户触达只能读取已授权账号当前直播间", "DOUYIN_LIVE_OUTREACH_SOURCE_SCOPE_INVALID", 400);
    }
    if (context.agentId === LIVE_DANMAKU_OUTREACH_AGENT_ID && config.liveDanmakuOutreach !== true) {
      throw acquisitionError("直播间未成交客户触达必须以弹幕直接触达模式运行", "DOUYIN_LIVE_OUTREACH_MODE_REQUIRED", 400);
    }
    const key = acquisitionOwnerKey(context);
    const taskFingerprint = acquisitionTaskFingerprint(context, config);
    const localExisting = state.tasks[key];
    if (localExisting) return clone(localExisting);
    const task = {
      schemaVersion: 1,
      key,
      taskFingerprint,
      context,
      config,
      accountIdentity: config.accountIdentity || null,
      configuration: canonicalConfiguration(config),
      configurationVersion: 1,
      configVersion: 1,
      state: TASK_STATES.CONFIGURING,
      cloudState: null,
      health: "OK",
      cursor: clone(config.cursor || null),
      messageCursor: 0,
      lastSuccessfulScan: null,
      lastScan: null,
      lastAnalysis: null,
      previewSnapshot: null,
      previewCursor: null,
      resultSnapshot: null,
      nextRunAt: null,
      approvalQueue: [],
      seenCandidates: {},
      candidateProfiles: {},
      suppressedRecipients: {},
      replies: [],
      liveDanmakuSignals: [],
      events: [],
      eventSeq: 0,
      retryCounts: { scan: 0, touch: 0, receipt: 0 },
      counters: { scans: 0, candidates: 0, duplicates: 0, drafts: 0, skipped: 0, accepted: 0, sent: 0, delivered: 0, replies: 0, captured: 0 },
      lastSendAt: null,
      sendHistory: [],
      lastReceipt: null,
      lastError: null,
      resumeBlocked: null,
      createdAt: now(),
      updatedAt: now()
    };
    const result = withLeaseLock(() => {
      const latest = loadSnapshot(target);
      const existing = latest.tasks?.[key];
      if (existing) return { existing };
      const duplicate = findDuplicateTask(
        latest.tasks || {},
        key,
        context,
        config,
        taskFingerprint,
        (candidate) => taskOccupationActive(candidate, latest.leases, runners)
      );
      if (duplicate) return { duplicate };
      latest.tasks ||= {};
      latest.tasks[key] = task;
      latest.version = SNAPSHOT_VERSION;
      latest.capabilities ||= {};
      latest.leases ||= {};
      writeSnapshot(target, latest);
      return { created: task };
    });
    if (result === null) throw acquisitionError("获客状态持久化锁被占用", "DOUYIN_ACQUISITION_PERSIST_LOCKED", 503);
    if (result.existing) {
      state.tasks[key] = clone(result.existing);
      baselineTasks[key] = clone(result.existing);
      return clone(result.existing);
    }
    if (result.duplicate) throw duplicateTaskError(result.duplicate, taskFingerprint);
    state.tasks[key] = task;
    baselineTasks[key] = clone(task);
    emit(task, EVENT_TYPES.AUTHORIZATION, { status: "required", accountId: context.accountId });
    return clone(task);
  }

  async function start(keyOrContext, options = {}) {
    const task = requireTask(keyOrContext);
    if (task.resumeBlocked?.reason === "touch_channel_reconfiguration_required") {
      throw acquisitionError(task.resumeBlocked.message, "DOUYIN_COMMENT_ACQUISITION_TOUCH_CHANNEL_FIXED", 409);
    }
    const activeTask = findExclusiveContinuousTask(
      state.tasks,
      task.key,
      task.context,
      task.config,
      (candidate) => taskOccupationActive(candidate)
    );
    if (activeTask) throw exclusiveTaskError(activeTask);
    const cloud = cloudBindingForTask(task);
    const includesLive = includesLiveSignals(task);
    const liveService = includesLive ? cloudRegistry?.getService?.(cloud.agentId, cloud.scope) : null;
    const liveExecutorReady = includesLive && comprehensiveSource?.scan && liveService?.startLivePolling && liveService?.pullLiveMessages;
    if (includesLive && !liveExecutorReady && !isCapabilityReady("liveAcquisition")) {
      throw acquisitionError("直播间互动能力尚未通过真实探测，暂不可启动", "DOUYIN_LIVE_CAPABILITY_NOT_READY", 409);
    }
    if (task.state === TASK_STATES.STOPPED) throw acquisitionError("任务已关闭，请创建新任务", "DOUYIN_ACQUISITION_STOPPED", 409);
    if (task.state === TASK_STATES.COMPLETED) throw acquisitionError("任务已完成，请创建新任务", "DOUYIN_ACQUISITION_COMPLETED", 409);
    if (task.state === TASK_STATES.ERROR) {
      if (options.retry !== true) throw acquisitionError("任务处于异常状态，请先重试或创建新任务", "DOUYIN_ACQUISITION_ERROR", 409);
      task.state = TASK_STATES.RUNNING;
      task.lastError = null;
    } else if (task.state === TASK_STATES.CONFIGURING || task.state === TASK_STATES.PAUSED || task.state === TASK_STATES.DEGRADED) {
      if (task.state === TASK_STATES.CONFIGURING) task.state = transitionTask(task.state, TASK_STATES.RUNNING);
      else if (task.state === TASK_STATES.PAUSED) task.state = transitionTask(task.state, TASK_STATES.RUNNING);
      else task.state = TASK_STATES.RUNNING;
      task.lastError = null;
    }
    task.updatedAt = now();
    task.systemPause = null;
    task.resumeBlocked = null;
    persist();
    emit(task, task.state === TASK_STATES.RUNNING && task.counters.scans ? EVENT_TYPES.RESUME : EVENT_TYPES.CLOUD_LIFECYCLE, {
      status: "running",
      phase: "task_started",
      cloudState: task.cloudState
    });
    if (!acquireRunnerLease(task.key)) return clone(task);
    ensureRunner(task);
    if (options.runImmediately !== false) await runOnce(task.key, { schedule: true, usePreview: options.fromPreview === true });
    else if (options.schedule === true || requiresAuthenticatedCloud(task)) schedule(task.key);
    return clone(task);
  }

  async function preview(keyOrContext) {
    const task = requireTask(keyOrContext);
    if (task.state !== TASK_STATES.CONFIGURING) {
      throw acquisitionError("只有尚未启动的任务可以先预览机会", "DOUYIN_ACQUISITION_PREVIEW_INVALID", 409, { state: task.state });
    }
    if (activeRuns.has(task.key)) return { ok: false, busy: true, preview: true, task: clone(task) };
    const run = previewExclusive(task.key);
    activeRuns.set(task.key, run);
    try { return await run; }
    catch (error) {
      if (!shouldContainRunError(task, error)) throw error;
      markError(task, error, EVENT_TYPES.ERROR);
      return { ok: false, preview: true, error: task.lastError, task: clone(task) };
    } finally {
      activeRuns.delete(task.key);
    }
  }

  async function previewExclusive(keyOrContext) {
    const task = requireTask(keyOrContext);
    const cloud = await refreshCloud(task);
    if (task.state === TASK_STATES.ERROR) return { ok: false, preview: true, error: task.lastError, task: clone(task) };
    let account;
    try {
      account = await resolveAccount(task, cloud?.snapshot || null);
    } catch (error) {
      markError(task, error, EVENT_TYPES.ERROR);
      return { ok: false, preview: true, error: task.lastError, task: clone(task) };
    }
    const executionConfig = normalizeConfig(task.config);
    const scan = await scanWithRetry(task, account, executionConfig, { preview: true });
    if (!scan.ok) return { ...scan, preview: true, task: clone(task) };
    const observedAt = now();
    const snapshot = {
      ...clone(scan.snapshot || {}),
      status: "preview_ready",
      leads: clone(scan.leads || []),
      counts: { ...(scan.snapshot?.counts || {}), candidates: scan.leads.length },
      updatedAt: observedAt
    };
    task.previewCursor = clone(scan.nextCursor ?? task.cursor);
    task.previewSnapshot = snapshot;
    task.lastScan = clone(scan.snapshot || {});
    task.lastAnalysis = clone(task.lastScan.analysis || null);
    task.lastSuccessfulPreview = observedAt;
    task.updatedAt = observedAt;
    persist();
    emit(task, EVENT_TYPES.SCAN_WINDOW, {
      preview: true,
      cursor: task.previewCursor,
      candidates: scan.leads.length,
      newCandidates: scan.leads.length,
      duplicates: 0,
      observedAt,
      scan: task.lastScan,
      analysis: task.lastAnalysis,
      previewSnapshot: task.previewSnapshot
    }, `preview:${task.key}:${stable(task.previewCursor || observedAt)}`);
    return { ok: true, preview: true, task: clone(task) };
  }

  async function runOnce(keyOrContext, options = {}) {
    const task = requireTask(keyOrContext);
    if (activeRuns.has(task.key)) return { ok: false, busy: true, leaseHeld: true, activeRun: true, task: clone(task) };
    const run = runOnceExclusive(task.key, options);
    activeRuns.set(task.key, run);
    try { return await run; }
    catch (error) {
      if (!shouldContainRunError(task, error)) throw error;
      markError(task, error, EVENT_TYPES.ERROR);
      return { ok: false, error: task.lastError, task: clone(task) };
    } finally {
      activeRuns.delete(task.key);
      if (requiresAuthenticatedCloud(task) && [TASK_STATES.RUNNING, TASK_STATES.DEGRADED].includes(task.state)) schedule(task.key);
    }
  }

  async function runOnceExclusive(keyOrContext, { schedule: scheduleRun = false, usePreview = false } = {}) {
    const task = requireTask(keyOrContext);
    if (task.state === TASK_STATES.STOPPED) throw acquisitionError("任务已关闭", "DOUYIN_ACQUISITION_STOPPED", 409);
    if (task.state === TASK_STATES.PAUSED) throw acquisitionError("任务已暂停", "DOUYIN_ACQUISITION_PAUSED", 409);
    if (![TASK_STATES.RUNNING, TASK_STATES.DEGRADED].includes(task.state)) throw acquisitionError("任务尚未启动", "DOUYIN_ACQUISITION_NOT_RUNNING", 409);
    if (!acquireRunnerLease(task.key)) return { ok: false, leaseHeld: true, task: clone(task) };
    ensureRunner(task);
    const cloud = await refreshCloud(task);
    if (task.state === TASK_STATES.ERROR) return { ok: false, error: task.lastError, task: clone(task) };
    if (requiresAuthenticatedCloud(task) && (task.cloudState !== CLOUD_STATES.ONLINE || task.state === TASK_STATES.STOPPED || task.state === TASK_STATES.PAUSED)) {
      return { ok: false, waiting: true, task: clone(task) };
    }

    let account = task.accountIdentity;
    try {
      account = await resolveAccount(task, cloud?.snapshot || null);
    } catch (error) {
      markError(task, error, EVENT_TYPES.ERROR);
      return { ok: false, error: task.lastError, task: clone(task) };
    }

    const executionConfig = normalizeConfig(task.config);
    const executionConfigVersion = task.configurationVersion || task.configVersion || 1;
    const previewConsumed = usePreview && task.previewSnapshot;
    const scan = previewConsumed
      ? { ok: true, leads: clone(task.previewSnapshot.leads || []), profiles: task.candidateProfiles || {}, nextCursor: clone(task.previewCursor ?? task.cursor), snapshot: clone(task.previewSnapshot) }
      : await scanWithRetry(task, account, executionConfig);
    if ([TASK_STATES.STOPPED, TASK_STATES.PAUSED].includes(task.state)) return { ok: false, cancelled: true, task: clone(task) };
    if (!scan.ok) {
      if (scheduleRun) schedule(task.key);
      return { ...scan, task: clone(task) };
    }
    const liveAnalysisTask = isLiveDanmakuAnalysis(task);
    const draftResult = liveAnalysisTask
      ? { newCandidates: 0, duplicates: 0, drafts: [] }
      : await processCandidates(task, scan.leads, executionConfig, executionConfigVersion);
    let danmakuAnalysis = null;
    let collectionSnapshot = null;
    if (liveAnalysisTask) {
      task.liveDanmakuSignals = appendLiveDanmakuSignals(task.liveDanmakuSignals, scan.liveSignals || []);
      collectionSnapshot = buildLiveCollectionSnapshot(task.liveDanmakuSignals, scan.snapshot?.sources?.live, now());
      const liveEnded = scan.snapshot?.sources?.live?.state === "ended";
      if (liveEnded) {
        danmakuAnalysis = typeof comprehensiveSource?.finalizeLiveDanmakuAnalysis === "function"
          ? await comprehensiveSource.finalizeLiveDanmakuAnalysis({ signals: task.liveDanmakuSignals, goal: executionConfig.audienceRules.goal, account, now: now() })
          : analyzeLiveDanmakuSignals({ signals: task.liveDanmakuSignals, goal: executionConfig.audienceRules.goal, now: now() });
      }
    }
    if (isComprehensive(task) || usesAuthorizedInteractionListener(task)) {
      task.cursor = scan.nextCursor ?? task.cursor;
      task.candidateProfiles = scan.profiles || task.candidateProfiles;
      if (previewConsumed) {
        task.previewSnapshot = null;
        task.previewCursor = null;
      }
      persist();
    }
    if (isComprehensive(task) && !isDiscoveryOnly(task)) await pullReplies(task, cloud?.service || null);
    await processApprovedTouches(task);
    task.counters.scans += 1;
    task.lastSuccessfulScan = now();
    task.lastScan = clone(scan.snapshot || {});
    task.lastAnalysis = clone(danmakuAnalysis || task.lastScan.analysis || null);
    task.resultSnapshot = {
      ...clone(task.lastScan),
      status: liveAnalysisTask && !danmakuAnalysis ? "collecting" : "completed",
      leads: danmakuAnalysis ? clone(danmakuAnalysis.users) : clone(scan.leads),
      ...(collectionSnapshot ? { collectionSnapshot: clone(collectionSnapshot) } : {}),
      ...(danmakuAnalysis ? { danmakuAnalysis: clone(danmakuAnalysis) } : {}),
      counts: {
        ...(task.lastScan.counts || {}),
        ...(danmakuAnalysis ? danmakuAnalysis.counts : {}),
        ...(collectionSnapshot ? { danmaku: collectionSnapshot.totalDanmaku, uniqueUsers: collectionSnapshot.uniqueUsers } : {}),
        candidates: danmakuAnalysis ? danmakuAnalysis.users.length : liveAnalysisTask ? 0 : scan.leads.length,
        drafts: draftResult.drafts.length,
        newCandidates: draftResult.newCandidates,
        duplicates: draftResult.duplicates
      },
      updatedAt: task.lastSuccessfulScan
    };
    const degradedSources = Object.entries(scan.snapshot?.sources || {}).filter(([, source]) => source.state === "degraded");
    task.lastError = degradedSources.length ? { code: "DOUYIN_SOURCE_DEGRADED", message: "部分数据源暂不可用，其他来源继续运行", sources: Object.fromEntries(degradedSources) } : null;
    if (danmakuAnalysis && [TASK_STATES.RUNNING, TASK_STATES.DEGRADED].includes(task.state)) {
      task.state = transitionTask(task.state, TASK_STATES.COMPLETED);
      task.completionReason = "live_ended";
    } else if (task.state === TASK_STATES.DEGRADED) task.state = TASK_STATES.RUNNING;
    task.health = degradedSources.length ? "DEGRADED" : "OK";
    task.updatedAt = now();
    persist();
    emit(task, EVENT_TYPES.SCAN_WINDOW, {
      cursor: task.cursor,
      candidates: danmakuAnalysis ? danmakuAnalysis.users.length : liveAnalysisTask ? 0 : scan.leads.length,
      newCandidates: draftResult.newCandidates,
      duplicates: draftResult.duplicates,
      observedAt: task.lastSuccessfulScan,
      scan: task.lastScan,
      analysis: task.lastAnalysis,
      resultSnapshot: task.resultSnapshot,
      collectionSnapshot
    }, `scan:${task.counters.scans}`);
    if (scheduleRun) schedule(task.key);
    return {
      ok: true,
      newCandidates: draftResult.newCandidates,
      duplicates: draftResult.duplicates,
      drafts: draftResult.drafts,
      task: clone(task)
    };
  }

  async function scanWithRetry(task, account, executionConfig = task.config, { preview = false } = {}) {
    const attempts = Math.max(1, Math.floor(Number(maxScanAttempts) || 1));
    const requestId = `acq-scan:${task.key}:${stable(task.cursor || "initial")}`;
    let lastError = null;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const analysisMode = [FINDER_AGENT_ID, LIVE_DANMAKU_ANALYSIS_AGENT_ID, LIVE_DANMAKU_OUTREACH_AGENT_ID].includes(task.context.agentId) ? "collect" : "intent";
        if (isComprehensive(task) || usesAuthorizedInteractionListener(task)) {
          if (!comprehensiveSource?.scan) throw acquisitionError("综合获客数据源不可用", "DOUYIN_SOURCE_UNAVAILABLE", 503);
          const cloud = cloudBindingForTask(task);
          return { ...await comprehensiveSource.scan({
            agentId: cloud.agentId, account, cursor: task.cursor,
            ...cloud.scope,
            goal: executionConfig.audienceRules.goal, analysisMode, liveSignals: executionConfig.liveSignals, profiles: task.candidateProfiles || {},
            limit: executionConfig.workWindow.commentLimit || 100, requestId,
            liveOnly: isLiveDiscovery(task),
            includeNotifications: !isLiveDiscovery(task),
            includeLive: includesLiveSignals(task),
            includeAccountContext: isComprehensive(task),
            listenerKey: task.key,
            isActive: () => preview || [TASK_STATES.RUNNING, TASK_STATES.DEGRADED].includes(task.state)
          }), ok: true };
        }
        if (usesAuthorizedCommentNotifications(task)) {
          if (!authorizedCommentSource || typeof authorizedCommentSource.scan !== "function") {
            throw acquisitionError("抖音评论监听来源不可用", "DOUYIN_NOTIFICATION_SOURCE_UNAVAILABLE", 503);
          }
          const cloud = cloudBindingForTask(task);
          const notificationResult = await authorizedCommentSource.scan({
            agentId: cloud.agentId,
            account,
            ...cloud.scope,
            cursor: task.cursor,
            goal: executionConfig.audienceRules.goal,
            minScore: executionConfig.audienceRules.minScore,
            analysisMode,
            limit: executionConfig.workWindow.commentLimit || 100,
            requestId
          });
          task.cursor = notificationResult?.nextCursor ?? notificationResult?.snapshot?.nextCursor ?? task.cursor;
          return {
            ok: true,
            leads: Array.isArray(notificationResult?.leads) ? notificationResult.leads : [],
            snapshot: notificationResult?.snapshot || {}
          };
        }
        if (!publicDiscoveryService) {
          throw acquisitionError(
            "公开作品评论采集未配置；请启用旧公开采集适配器后再使用该来源",
            "DOUYIN_LEGACY_PUBLIC_COLLECTION_NOT_CONFIGURED",
            503,
            { sourceScope: task.config.sourceScope?.kind || task.config.sourceScope?.type || null }
          );
        }
        const input = discoveryInput(task, account, requestId, executionConfig);
        const result = await publicDiscoveryService.discover(input, { reqId: requestId, requestId });
        const snapshot = result?.resultSnapshot || {};
        const leads = Array.isArray(snapshot.leads) ? snapshot.leads : Array.isArray(snapshot.candidates) ? snapshot.candidates : [];
        task.cursor = result?.nextCursor ?? snapshot.nextCursor ?? snapshot.cursor ?? task.cursor;
        return { ok: true, leads, snapshot };
      } catch (error) {
        if ([TASK_STATES.STOPPED, TASK_STATES.PAUSED].includes(task.state)) return { ok: false, cancelled: true };
        lastError = error;
        if (!isTransient(error) || attempt >= attempts) break;
        task.retryCounts.scan += 1;
        task.health = "DEGRADED";
        if (task.state === TASK_STATES.RUNNING) task.state = TASK_STATES.DEGRADED;
        task.lastError = serializeError(error);
        task.updatedAt = now();
        persist();
        emit(task, EVENT_TYPES.RETRY, { operation: "scan", attempt, requestId, error: task.lastError }, `scan-retry:${requestId}:${attempt}`);
        await sleep(Math.min(1000, 100 * attempt));
      }
    }
    if (attempts === 1) task.retryCounts.scan += 1;
    task.health = "DEGRADED";
    if (task.state === TASK_STATES.RUNNING) task.state = TASK_STATES.DEGRADED;
    task.lastError = serializeError(lastError);
    task.nextRunAt = now();
    task.updatedAt = now();
    persist();
    emit(task, EVENT_TYPES.RETRY, { operation: "scan", queued: true, requestId, error: task.lastError }, `scan-queued:${requestId}`);
    return { ok: false, retryQueued: true, error: task.lastError };
  }

  async function processCandidates(task, leads, executionConfig = task.config, executionConfigVersion = task.configurationVersion || task.configVersion || 1) {
    let newCandidates = 0;
    let duplicates = 0;
    const drafts = [];
    for (const rawLead of leads) {
      if ([TASK_STATES.STOPPED, TASK_STATES.PAUSED].includes(task.state)) break;
      const candidate = clone(rawLead || {});
      const candidateKey = candidateIdentity(candidate);
      if (isDiscoveryOnly(task)) {
        if (task.seenCandidates[candidateKey]) { duplicates += 1; task.counters.duplicates += 1; }
        else { newCandidates += 1; task.counters.candidates += 1; task.seenCandidates[candidateKey] = now(); }
        emit(task, EVENT_TYPES.CANDIDATES_FOUND, { candidateKey, candidate }, `candidate:${candidateKey}`);
        emit(task, EVENT_TYPES.INTENT_DECISION, { candidateKey, candidate, intent: candidate.intent || null }, `intent:${candidateKey}:${stable(candidate.evidence || candidate)}`);
        continue;
      }
      if (task.seenCandidates[candidateKey]) {
        // New evidence may qualify a previously skipped customer, but never
        // recreate a submitted/sent/unknown first-contact attempt.
        const previous = task.approvalQueue.find(touch => touch.candidateKey === candidateKey);
        if (isComprehensive(task) && previous?.state === TOUCH_STATES.STOPPED
          && previous.history?.some(entry => entry.reason === "auto_policy_skipped")
          && reviewRisk(candidate, executionConfig).action === "auto_send") {
          previous.lead = candidate;
          previous.risk = reviewRisk(candidate, executionConfig);
          const refreshedDraft = await makeDraft(candidate, executionConfig, touchGenerator);
          previous.content = refreshedDraft.content;
          previous.contentBasis = refreshedDraft.contentBasis;
          previous.state = TOUCH_STATES.APPROVED;
          previous.autoApproved = true;
          previous.configVersion = executionConfigVersion;
          auditTouch(previous, TOUCH_STATES.APPROVED, "new_evidence_qualified");
          emit(task, EVENT_TYPES.INTENT_DECISION, { candidateKey, candidate, intent: candidate.intent }, `intent:${candidateKey}:${stable(candidate.evidence || candidate)}`);
        }
        duplicates += 1;
        task.counters.duplicates += 1;
        continue;
      }
      task.seenCandidates[candidateKey] = now();
      task.counters.candidates += 1;
      newCandidates += 1;
      emit(task, EVENT_TYPES.CANDIDATES_FOUND, { candidateKey, candidate }, `candidate:${candidateKey}`);
      const directLiveOutreach = isLiveDanmakuOutreach(task);
      const risk = directLiveOutreach ? reviewLiveDanmakuOutreachRisk(candidate) : reviewRisk(candidate, executionConfig);
      if (!directLiveOutreach) {
        emit(task, EVENT_TYPES.INTENT_DECISION, { candidateKey, candidate, intent: candidate.intent || null }, `intent:${candidateKey}`);
      }
      emit(task, EVENT_TYPES.RISK_DECISION, { candidateKey, risk }, `risk:${candidateKey}`);
      const draft = directLiveOutreach
        ? makeLiveDanmakuOutreachDraft(executionConfig)
        : await makeDraft(candidate, executionConfig, touchGenerator);
      const touch = {
        touchId: `touch:${stable(`${task.key}:${candidateKey}`)}`,
        candidateKey,
        lead: candidate,
        channel: executionConfig.touchChannel,
        content: draft.content,
        contentBasis: draft.contentBasis,
        risk,
        configVersion: executionConfigVersion,
        autoApproved: executionConfig.approvalMode === APPROVAL_MODES.AUTO && risk.action === "auto_send",
        state: TOUCH_STATES.DRAFT,
        requestId: `acq:${task.key}:${stable(candidateKey)}`,
        history: [],
        createdAt: now(),
        updatedAt: now()
      };
      task.approvalQueue.push(touch);
      if (executionConfig.approvalMode === APPROVAL_MODES.AUTO && risk.action !== "auto_send") {
        transitionTouch(touch.state, TOUCH_STATES.STOPPED);
        touch.state = TOUCH_STATES.STOPPED;
        auditTouch(touch, TOUCH_STATES.STOPPED, "auto_policy_skipped");
        task.counters.skipped = Number(task.counters.skipped || 0) + 1;
      } else {
        transitionTouch(touch.state, TOUCH_STATES.PENDING_APPROVAL);
        touch.state = TOUCH_STATES.PENDING_APPROVAL;
        auditTouch(touch, TOUCH_STATES.PENDING_APPROVAL, "draft_created");
        task.counters.drafts += 1;
        drafts.push(clone(touch));
        emit(task, EVENT_TYPES.TOUCH_DRAFTED, { touch: clone(touch) }, `draft:${touch.touchId}`);
      }
      if (touch.autoApproved && touch.state === TOUCH_STATES.PENDING_APPROVAL) {
        transitionTouch(touch.state, TOUCH_STATES.APPROVED);
        touch.state = TOUCH_STATES.APPROVED;
        auditTouch(touch, TOUCH_STATES.APPROVED, "auto_approved");
        emit(task, EVENT_TYPES.TOUCH_APPROVED, { touchId: touch.touchId, mode: APPROVAL_MODES.AUTO }, `approved:${touch.touchId}`);
      }
    }
    persist();
    return { newCandidates, duplicates, drafts };
  }

  async function processApprovedTouches(task) {
    if (isDiscoveryOnly(task)) return;
    for (const touch of task.approvalQueue) {
      if (touch.state !== TOUCH_STATES.APPROVED || touch.risk.action !== "auto_send") continue;
      if (touch.autoApproved !== true && task.config.approvalMode !== APPROVAL_MODES.AUTO) continue;
      await sendTouch(task, touch);
    }
  }

  async function approveTouch(keyOrContext, touchId) {
    const task = requireTask(keyOrContext);
    if (task.state !== TASK_STATES.RUNNING) {
      throw acquisitionError("父任务未处于运行状态，不能发送", "DOUYIN_TOUCH_PARENT_NOT_RUNNING", 409, { state: task.state });
    }
    const touch = findTouch(task, touchId);
    if (touch.state !== TOUCH_STATES.PENDING_APPROVAL) throw acquisitionError("该触达不在待确认状态", "DOUYIN_TOUCH_APPROVAL_INVALID", 409);
    if (touch.risk.action === "human_required") return clone(touch);
    transitionTouch(touch.state, TOUCH_STATES.APPROVED);
    touch.state = TOUCH_STATES.APPROVED;
    auditTouch(touch, TOUCH_STATES.APPROVED, "user_approved");
    emit(task, EVENT_TYPES.TOUCH_APPROVED, { touchId: touch.touchId, mode: task.config.approvalMode }, `approved:${touch.touchId}`);
    await sendTouch(task, touch);
    return clone(touch);
  }

  async function approveBatch(keyOrContext, { touchIds = [], templateVersion = null } = {}) {
    const task = requireTask(keyOrContext);
    const wanted = new Set(touchIds.map(String));
    const selected = task.approvalQueue.filter((touch) => wanted.has(touch.touchId));
    if (!selected.length) throw acquisitionError("没有可确认的触达草稿", "DOUYIN_TOUCH_NOT_FOUND", 404);
    task.batchApproval = { touchIds: selected.map((touch) => touch.touchId), templateVersion, count: selected.length, approvedAt: now() };
    for (const touch of selected) if (touch.state === TOUCH_STATES.PENDING_APPROVAL && touch.risk.action !== "human_required") await approveTouch(task.key, touch.touchId);
    persist();
    return { ok: true, count: selected.length, task: clone(task) };
  }

  function rejectTouch(keyOrContext, touchId, reason = "user_rejected") {
    const task = requireTask(keyOrContext);
    const touch = findTouch(task, touchId);
    if (touch.state !== TOUCH_STATES.PENDING_APPROVAL) throw acquisitionError("该触达不在待确认状态", "DOUYIN_TOUCH_APPROVAL_INVALID", 409);
    transitionTouch(touch.state, TOUCH_STATES.REJECTED);
    touch.state = TOUCH_STATES.REJECTED;
    auditTouch(touch, TOUCH_STATES.REJECTED, reason);
    persist();
    return clone(touch);
  }

  async function retry(keyOrContext, touchId = null) {
    const task = requireTask(keyOrContext);
    if (touchId == null) {
      if (![TASK_STATES.ERROR, TASK_STATES.DEGRADED, TASK_STATES.PAUSED].includes(task.state)) {
        throw acquisitionError("当前父任务不可重试", "DOUYIN_ACQUISITION_RETRY_INVALID", 409, { state: task.state });
      }
      task.lastError = null;
      task.state = TASK_STATES.RUNNING;
      task.health = "OK";
      persist();
      return runOnce(task.key);
    }
    const touch = findTouch(task, touchId);
    if (touch.state === TOUCH_STATES.UNKNOWN) {
      await reconcileTouch(task.key, touchId);
      if (touch.state !== TOUCH_STATES.FAILED) {
        throw acquisitionError("未知回执必须先完成回执核对，确认失败后才能重试", "DOUYIN_TOUCH_RETRY_REQUIRES_RECONCILE", 409);
      }
    }
    if (touch.state !== TOUCH_STATES.FAILED) throw acquisitionError("该触达当前不可重试", "DOUYIN_TOUCH_RETRY_INVALID", 409);
    transitionTouch(touch.state, TOUCH_STATES.RETRY_QUEUED);
    auditTouch(touch, TOUCH_STATES.RETRY_QUEUED, "retry_requested");
    transitionTouch(touch.state, task.config.approvalMode === APPROVAL_MODES.AUTO && touch.risk.action === "auto_send" ? TOUCH_STATES.APPROVED : TOUCH_STATES.PENDING_APPROVAL);
    touch.state = task.config.approvalMode === APPROVAL_MODES.AUTO && touch.risk.action === "auto_send" ? TOUCH_STATES.APPROVED : TOUCH_STATES.PENDING_APPROVAL;
    auditTouch(touch, touch.state, "retry_queued");
    task.retryCounts.touch += 1;
    persist();
    if (touch.state === TOUCH_STATES.APPROVED) await sendTouch(task, touch);
    return clone(touch);
  }

  async function reconcileTouch(keyOrContext, touchId) {
    const task = requireTask(keyOrContext);
    const touch = findTouch(task, touchId);
    if (touch.state !== TOUCH_STATES.UNKNOWN) return clone(touch);
    const cloud = cloudBindingForTask(task);
    const service = cloudRegistry?.getService?.(cloud.agentId, cloud.scope);
    const query = service?.getMessageStatus || service?.queryMessageStatus || service?.messageStatus;
    if (typeof query !== "function") return clone(touch);
    transitionTouch(touch.state, TOUCH_STATES.DELIVERY_CHECKING);
    touch.state = TOUCH_STATES.DELIVERY_CHECKING;
    auditTouch(touch, TOUCH_STATES.DELIVERY_CHECKING, "receipt_reconcile");
    let result;
    try { result = await query.call(service, { reqId: touch.requestId, requestId: touch.requestId, messageId: touch.providerMessageId }); }
    catch (error) {
      task.retryCounts.receipt += 1;
      touch.lastError = serializeError(error);
      transitionTouch(touch.state, TOUCH_STATES.UNKNOWN);
      touch.state = TOUCH_STATES.UNKNOWN;
      auditTouch(touch, TOUCH_STATES.UNKNOWN, "receipt_reconcile_failed");
      persist();
      return clone(touch);
    }
    applyReceipt(task, touch, result, eventSink);
    persist();
    return clone(touch);
  }

  async function sendTouch(task, touch) {
    if (isDiscoveryOnly(task)) return touch;
    if (touch.state !== TOUCH_STATES.APPROVED) return touch;
    if (task.state !== TASK_STATES.RUNNING) return touch;
    if (task.suppressedRecipients?.[touch.candidateKey]) {
      touch.state = TOUCH_STATES.STOPPED;
      auditTouch(touch, TOUCH_STATES.STOPPED, "recipient_opt_out");
      persist();
      return touch;
    }
    if (touch.risk.action === "human_required" || touch.channel === "human_required") return touch;
    if (!isComprehensivePrivateTouchChannel(touch.channel)) {
      markTouchFailed(task, touch, acquisitionError(
        "当前获客任务只支持私信首触达",
        "DOUYIN_COMMENT_ACQUISITION_TOUCH_CHANNEL_FIXED",
        409
      ));
      persist();
      return touch;
    }
    const sendWindow = checkSendWindow(task, now());
    if (!sendWindow.allowed) {
      if (sendWindow.reason === "daily_cap" && !isComprehensive(task)) {
      touch.state = TOUCH_STATES.STOPPED;
      auditTouch(touch, TOUCH_STATES.STOPPED, "daily_cap_reached");
      } else {
        task.nextRunAt = sendWindow.nextAt;
      }
      persist();
      return touch;
    }
    const cloud = cloudBindingForTask(task);
    const service = cloudRegistry?.getService?.(cloud.agentId, cloud.scope);
    if (!service || typeof service.sendPrivateMessage !== "function") {
      markTouchFailed(task, touch, acquisitionError("抖音私信发送接口不可用", "DOUYIN_SEND_UNAVAILABLE", 503));
      return touch;
    }
    transitionTouch(touch.state, TOUCH_STATES.SUBMITTED);
    touch.state = TOUCH_STATES.SUBMITTED;
    auditTouch(touch, TOUCH_STATES.SUBMITTED, "send_submitted");
    emit(task, EVENT_TYPES.TOUCH_SUBMITTED, { touchId: touch.touchId, requestId: touch.requestId }, `submitted:${touch.touchId}`);
    recordSendAttempt(task, now());
    let receipt;
    try {
      receipt = await service.sendPrivateMessage({
        secId: touch.lead.secId || touch.lead.sec_id || null,
        secUid: touch.lead.secUid || touch.lead.sec_uid || null,
        nickname: touch.lead.nickname || touch.lead.account || null,
        content: touch.content,
        reqId: touch.requestId,
        requestId: touch.requestId,
        operatedAccountSecId: task.accountIdentity?.secId || null,
        operatedNickname: task.accountIdentity?.nickname || null
      });
    } catch (error) {
      if (isLiveDanmakuOutreach(task) && isProviderOutreachQuotaError(error)) {
        markProviderOutreachQuotaReached(task, error);
        return touch;
      }
      if (isTransient(error)) {
        markTouchUnknown(task, touch, error);
      } else markTouchFailed(task, touch, error);
      persist();
      return touch;
    }
    if (isLiveDanmakuOutreach(task) && isProviderOutreachQuotaError(receipt)) {
      markProviderOutreachQuotaReached(task, receipt);
      return touch;
    }
    applyReceipt(task, touch, receipt, eventSink);
    persist();
    return touch;
  }

  function markProviderOutreachQuotaReached(task, error) {
    const providerError = serializeError(error);
    const sentCount = Number(task.counters?.sent || 0);
    const nextAt = error?.nextAt || error?.next_at || error?.resetAt || error?.reset_at || error?.error?.nextAt || error?.error?.resetAt || null;
    const detectedAt = now();
    task.outreachQuota = {
      reached: true,
      source: "provider",
      sentCount,
      detectedAt,
      code: providerError.code,
      message: providerError.message,
      ...(nextAt ? { nextAt } : {})
    };
    task.lastError = {
      ...providerError,
      code: "DOUYIN_ACCOUNT_OUTREACH_QUOTA_REACHED",
      message: "当前账号的私信触达额度已用尽，后续触达已暂停。",
      details: { providerCode: providerError.code, providerMessage: providerError.message, sentCount }
    };
    task.resumeBlocked = {
      reason: "provider_outreach_quota_reached",
      message: task.lastError.message,
      detectedAt,
      ...(nextAt ? { nextAt } : {})
    };
    if (task.state !== TASK_STATES.PAUSED && canTransitionTask(task.state, TASK_STATES.PAUSED)) {
      transitionTask(task.state, TASK_STATES.PAUSED);
    }
    task.state = TASK_STATES.PAUSED;
    task.health = "ATTENTION";
    task.nextRunAt = nextAt || null;
    task.updatedAt = detectedAt;
    persist();
    emit(task, EVENT_TYPES.QUOTA_REACHED, {
      outreachQuota: task.outreachQuota,
      error: task.lastError
    }, `quota:${task.context.accountId}:${sentCount}:${providerError.code}`);
  }

  async function pause(keyOrContext) {
    const task = requireTask(keyOrContext);
    if (task.state === TASK_STATES.PAUSED) return clone(task);
    if (task.state === TASK_STATES.STOPPED) return clone(task);
    if (!canTransitionTask(task.state, TASK_STATES.PAUSED)) throw acquisitionError("当前任务不可暂停", "DOUYIN_ACQUISITION_PAUSE_INVALID", 409);
    transitionTask(task.state, TASK_STATES.PAUSED);
    task.state = TASK_STATES.PAUSED;
    clearSchedule(task.key);
    releaseRunnerLease(task.key);
    task.updatedAt = now();
    persist();
    emit(task, EVENT_TYPES.PAUSE, { reason: "user_requested" });
    if (requiresAuthenticatedCloud(task)) await stopManagedIntake(task);
    return clone(task);
  }

  async function resume(keyOrContext, options = {}) {
    return start(keyOrContext, { ...options, runImmediately: options.runImmediately === true });
  }

  async function stop(keyOrContext, reason = "user_requested") {
    const task = requireTask(keyOrContext);
    if (task.state === TASK_STATES.STOPPED) return clone(task);
    clearSchedule(task.key);
    runners.delete(task.key);
    releaseRunnerLease(task.key);
    // Explicit close is allowed from error as a lifecycle cleanup operation.
    if (task.state !== TASK_STATES.STOPPED && task.state !== TASK_STATES.ERROR) {
      if (canTransitionTask(task.state, TASK_STATES.STOPPED)) transitionTask(task.state, TASK_STATES.STOPPED);
    }
    task.state = TASK_STATES.STOPPED;
    task.nextRunAt = null;
    task.resumeBlocked = null;
    task.lastError = null;
    task.updatedAt = now();
    persist();
    emit(task, EVENT_TYPES.STOP, { reason });
    if (requiresAuthenticatedCloud(task)) await stopManagedIntake(task);
    return clone(task);
  }

  async function stopManagedIntake(task) {
    const errors = [];
    try {
      const cloud = cloudBindingForTask(task);
      await comprehensiveSource?.stop?.({
        agentId: cloud.agentId,
        ...cloud.scope,
        listenerKey: task.key,
        stopLive: includesLiveSignals(task)
      });
    } catch (error) { errors.push(serializeError(error)); }
    if (errors.length) task.lastError = errors[0];
    persist();
  }

  function status(keyOrContext) { return clone(requireTask(keyOrContext)); }
  function listTasks({ includeArchived = false } = {}) { return activeTasks({ includeArchived }).map(clone); }

  function listRuntimeTasks({ includeArchived = false } = {}) {
    return activeTasks({ includeArchived }).map(task => ({
      ...clone(task),
      runtimeAlive: runners.has(task.key) && Date.parse(state.leases?.[task.key]?.expiresAt || "") > Date.parse(now()),
      listening: runners.has(task.key) && !activeRuns.has(task.key)
    }));
  }

  function activeTasks({ includeArchived = false } = {}) {
    return Object.values(state.tasks).filter((task) => includeArchived || !task.archivedAt);
  }

  function maintainPersistedTasks() {
    let changed = migrateListenerTaskRuntimeSchedules();
    changed = migrateComprehensiveTaskScopes() || changed;
    changed = retireLegacyLiveTasks() || changed;
    changed = archiveStaleErrors() || changed;
    changed = consolidateContinuousTasks() || changed;
    if (changed) persist();
  }

  function migrateListenerTaskRuntimeSchedules() {
    let changed = false;
    for (const task of Object.values(state.tasks || {})) {
      if (!isListenerSourceScope(task?.config?.sourceScope)) continue;
      const nextConfig = normalizeComprehensiveScope(task.context, normalizeConfig(task.config));
      const nextConfiguration = canonicalConfiguration(nextConfig);
      if (JSON.stringify(task.config) === JSON.stringify(nextConfig)
        && JSON.stringify(task.configuration) === JSON.stringify(nextConfiguration)) continue;
      task.config = nextConfig;
      task.configuration = nextConfiguration;
      task.taskFingerprint = acquisitionTaskFingerprint(task.context, task.config);
      task.updatedAt = task.state === TASK_STATES.ERROR ? (task.updatedAt || now()) : now();
      changed = true;
    }
    return changed;
  }

  function migrateComprehensiveTaskScopes() {
    let changed = false;
    for (const task of Object.values(state.tasks || {})) {
      if (task?.context?.agentId !== COMPREHENSIVE_AGENT_ID) continue;
      const nextConfig = normalizeComprehensiveScope(task.context, normalizeConfig(task.config));
      const nextConfiguration = canonicalConfiguration(nextConfig);
      const configurationChanged = JSON.stringify(task.config) !== JSON.stringify(nextConfig)
        || JSON.stringify(task.configuration) !== JSON.stringify(nextConfiguration);
      if (configurationChanged) {
        task.config = nextConfig;
        task.configuration = nextConfiguration;
        task.taskFingerprint = acquisitionTaskFingerprint(task.context, task.config);
        task.updatedAt = task.state === TASK_STATES.ERROR ? (task.updatedAt || now()) : now();
        changed = true;
      }
      if (!isComprehensivePrivateTouchChannel(nextConfig.touchChannel)) {
        if (task.resumeBlocked?.reason !== "touch_channel_reconfiguration_required") {
          task.state = TASK_STATES.PAUSED;
          task.health = "ATTENTION";
          task.nextRunAt = null;
          task.resumeBlocked = {
            reason: "touch_channel_reconfiguration_required",
            message: "获客专家现仅支持私信首触达。请确认私信策略后再继续运行。",
            blockedAt: now()
          };
          task.lastError = serializeError(acquisitionError(
            "获客专家不再支持公开评论回复，请切换为私信首触达后继续运行",
            "DOUYIN_COMMENT_ACQUISITION_TOUCH_CHANNEL_FIXED",
            409
          ));
          task.updatedAt = now();
          changed = true;
        }
      } else if (task.resumeBlocked?.reason === "touch_channel_reconfiguration_required") {
        task.resumeBlocked = null;
        if (task.health === "ATTENTION") task.health = "OK";
        if (task.lastError?.code === "DOUYIN_COMMENT_ACQUISITION_TOUCH_CHANNEL_FIXED") task.lastError = null;
        task.updatedAt = now();
        changed = true;
      }
    }
    return changed;
  }

  function retireLegacyLiveTasks() {
    let changed = false;
    for (const task of Object.values(state.tasks)) {
      if (task?.context?.agentId !== RETIRED_LIVE_AGENT_ID) continue;
      if (task.state === TASK_STATES.STOPPED && task.resumeBlocked?.reason === "agent_retired") continue;
      task.state = TASK_STATES.STOPPED;
      task.nextRunAt = null;
      task.resumeBlocked = {
        reason: "agent_retired",
        message: "直播间找客户已并入找客专员。历史记录仍可查看，不能继续恢复运行。"
      };
      task.updatedAt = now();
      changed = true;
    }
    return changed;
  }

  function archiveStaleErrors() {
    const cutoff = Date.parse(now()) - STALE_ERROR_RETENTION_MS;
    if (!Number.isFinite(cutoff)) return false;
    let changed = false;
    for (const task of Object.values(state.tasks)) {
      if (task.archivedAt || task.state !== TASK_STATES.ERROR) continue;
      const updatedAt = Date.parse(task.updatedAt || task.createdAt || "");
      if (!Number.isFinite(updatedAt) || updatedAt > cutoff) continue;
      task.archivedAt = now();
      task.archiveReason = "stale_error_retention";
      task.updatedAt = now();
      changed = true;
    }
    return changed;
  }

  function consolidateContinuousTasks() {
    const groups = [];
    for (const task of activeTasks()) {
      if (!isContinuousContext(task.context) || !TASK_DEDUP_STATES.has(task.state)) continue;
      const semanticAgentId = String(task.context?.agentId || "").trim();
      const matchingGroups = groups.filter((group) => group.agentId === semanticAgentId
        && group.tasks.some((member) => shareTaskAccount(member, task)));
      if (!matchingGroups.length) {
        groups.push({ agentId: semanticAgentId, tasks: [task] });
        continue;
      }
      const primaryGroup = matchingGroups[0];
      primaryGroup.tasks.push(task);
      for (const duplicateGroup of matchingGroups.slice(1)) {
        primaryGroup.tasks.push(...duplicateGroup.tasks);
        groups.splice(groups.indexOf(duplicateGroup), 1);
      }
    }
    let changed = false;
    for (const { tasks: group } of groups) {
      if (group.length < 2) continue;
      const primary = selectContinuousPrimary(group);
      const duplicates = group.filter(task => task.key !== primary.key);
      if (group.every(isSystemDuplicatePaused)) {
        const previousState = primary.systemPause?.previousState;
        primary.state = [TASK_STATES.RUNNING, TASK_STATES.DEGRADED].includes(previousState)
          ? previousState
          : TASK_STATES.DEGRADED;
        primary.health = primary.state === TASK_STATES.RUNNING ? "OK" : "DEGRADED";
        primary.nextRunAt = null;
        primary.systemPause = null;
        primary.updatedAt = now();
        changed = true;
      }
      for (const task of duplicates) {
        if (task.systemPause?.reason === SYSTEM_DUPLICATE_PAUSE_REASON && task.systemPause.primaryTaskKey === primary.key) continue;
        clearSchedule(task.key);
        releaseRunnerLease(task.key);
        task.state = TASK_STATES.PAUSED;
        task.health = "ATTENTION";
        task.nextRunAt = null;
        task.systemPause = {
          reason: SYSTEM_DUPLICATE_PAUSE_REASON,
          primaryTaskKey: primary.key,
          previousState: task.state,
          pausedAt: now(),
          message: "同一账号只保留一个持续获客任务，已保留最新任务继续执行。"
        };
        task.updatedAt = now();
        changed = true;
      }
    }
    return changed;
  }

  /** Apply a versioned sparse patch to the strategy layer of a running task. */
  function updateTaskConfig(keyOrContext, rawPayload = {}) {
    const task = requireTask(keyOrContext);
    const payload = normalizeConfigurationUpdatePayload(rawPayload, {
      listener: isListenerSourceScope(task.config?.sourceScope)
    });
    const requestedApprovalMode = payload.changes?.touchContent?.approvalMode;
    if (task.context.agentId === "mkt-comment-acquisition" && requestedApprovalMode && requestedApprovalMode !== APPROVAL_MODES.AUTO) {
      throw acquisitionError("评论区获客管家固定为自动发送，不能切换为人工确认", "DOUYIN_COMMENT_ACQUISITION_AUTO_SEND_REQUIRED", 400);
    }
    const requestedLiveDailyCap = payload.changes?.frequency || {};
    if (isLiveDanmakuOutreach(task)
      && (Object.prototype.hasOwnProperty.call(requestedLiveDailyCap, "maxTouchesPerDay")
        || Object.prototype.hasOwnProperty.call(requestedLiveDailyCap, "dailyMax"))) {
      throw acquisitionError("直播间私信触达数量由抖音账号实际额度决定，不能设置产品侧固定上限", "DOUYIN_LIVE_OUTREACH_PRODUCT_CAP_FORBIDDEN", 400);
    }
    if (payload.expectedVersion !== null) {
      const currentTaskVersion = Number(task.eventSeq || 0);
      if (payload.expectedVersion !== currentTaskVersion) {
        throw acquisitionError("任务状态已变化，请刷新后重试", "DOUYIN_ACQUISITION_TASK_VERSION_STALE", 409, {
          taskKey: task.key,
          expectedVersion: payload.expectedVersion,
          currentVersion: currentTaskVersion
        });
      }
    }
    const currentVersion = Number(task.configurationVersion || task.configVersion || task.configuration?.version || 1);
    if (payload.baseConfigVersion !== currentVersion) {
      throw acquisitionError("任务配置版本已变化，请刷新后重试", "DOUYIN_ACQUISITION_CONFIG_STALE", 409, {
        taskKey: task.key,
        baseConfigVersion: payload.baseConfigVersion,
        currentConfigVersion: currentVersion
      });
    }
    if (payload.configVersion !== payload.baseConfigVersion + 1) {
      throw acquisitionError("configVersion 必须是 baseConfigVersion 加一", "DOUYIN_ACQUISITION_CONFIG_VERSION_INVALID", 400, {
        baseConfigVersion: payload.baseConfigVersion,
        configVersion: payload.configVersion
      });
    }
    if (payload.effectiveScope !== "future_only") {
      throw acquisitionError("任务配置更新仅对未来执行生效", "DOUYIN_ACQUISITION_CONFIG_SCOPE_INVALID", 400);
    }
    if (AGENT_IDS.has(task.context.agentId) && Object.prototype.hasOwnProperty.call(payload.changes?.findingStrategy || {}, "sourceScope")) {
      throw acquisitionError("获客 Agent 的找人来源由固定能力预设，不能修改", "DOUYIN_ACQUISITION_SOURCE_SCOPE_FIXED", 400);
    }
    if (isDiscoveryOnly(task) && ["touchContent", "frequency", "stopConditions"].some((section) => Object.prototype.hasOwnProperty.call(payload.changes || {}, section))) {
      throw acquisitionError("找客专员的持续监听只允许调整找人条件，不包含触达策略", "DOUYIN_DISCOVERY_ONLY_CONFIG_INVALID", 400);
    }
    if (task.context.agentId === COMPREHENSIVE_AGENT_ID
      && Object.prototype.hasOwnProperty.call(payload.changes?.frequency || {}, "mode")) {
      throw acquisitionError("获客专家会在识别到高意向潜客后自动完成首次私信触达，不支持修改触达时机", "DOUYIN_COMMENT_ACQUISITION_TRIGGER_FIXED", 400);
    }
    if (task.context.agentId === COMPREHENSIVE_AGENT_ID && Object.prototype.hasOwnProperty.call(payload.changes || {}, "stopConditions")) {
      throw acquisitionError("获客专家持续监听账号新信号；拒绝、退订和人工交接只作用于对应潜客，不能修改为任务停止条件", "DOUYIN_COMMENT_ACQUISITION_STOP_CONDITIONS_FIXED", 400);
    }
    assertListenerConfigurationHasNoHistoricalLookback(task.config, payload.changes);
    const currentConfiguration = canonicalConfiguration(task.config);
    const nextConfiguration = deepMerge(currentConfiguration, payload.changes);
    if (task.context.agentId === COMPREHENSIVE_AGENT_ID) {
      assertComprehensiveTouchChannel(nextConfiguration.touchContent?.channel);
    }
    const changedSections = changedConfigurationSections(currentConfiguration, nextConfiguration);
    if (!changedSections.length) throw acquisitionError("没有检测到实际配置变化", "DOUYIN_ACQUISITION_CONFIG_NOOP", 400);
    if (configurationUpdateIsRisky(currentConfiguration, nextConfiguration) && payload.confirmation?.confirmed !== true) {
      throw acquisitionError("该配置变更会放宽触达策略，需要明确确认", "DOUYIN_ACQUISITION_CONFIG_CONFIRMATION_REQUIRED", 400, { changedSections });
    }
    const beforeTask = clone(task);
    const effectiveAt = now();
    const effectiveFromSeq = Number(task.eventSeq || 0) + 1;
    try {
      const appliedConfig = normalizeComprehensiveScope(
        task.context,
        applyCanonicalConfiguration(task.config, nextConfiguration)
      );
      const appliedConfiguration = canonicalConfiguration(appliedConfig);
      task.config = appliedConfig;
      task.configuration = { ...clone(appliedConfiguration), version: payload.configVersion, effectiveScope: "future_only", effectiveAt, effectiveFromSeq };
      task.configurationVersion = payload.configVersion;
      task.configVersion = payload.configVersion;
      task.configEffectiveAt = effectiveAt;
      task.configEffectiveFromSeq = effectiveFromSeq;
      if (task.resumeBlocked?.reason === "touch_channel_reconfiguration_required") {
        task.resumeBlocked = null;
        if (task.health === "ATTENTION") task.health = "OK";
        if (task.lastError?.code === "DOUYIN_COMMENT_ACQUISITION_TOUCH_CHANNEL_FIXED") task.lastError = null;
      }
      task.updatedAt = effectiveAt;
      persist();
      emit(task, EVENT_TYPES.CONFIG_UPDATED, {
        baseConfigVersion: payload.baseConfigVersion,
        configVersion: payload.configVersion,
        effectiveScope: "future_only",
        effectiveAt,
        effectiveFromSeq,
        changedSections,
        changes: clone(payload.changes),
        previous: { version: currentVersion, configuration: clone(currentConfiguration) },
        configuration: clone(task.configuration),
        reason: payload.reason || null
      }, `config:${payload.configVersion}`, { requireDelivery: true });
    } catch (error) {
      Object.assign(task, beforeTask);
      persist();
      throw error;
    }
    return clone(task);
  }

  async function resumePersisted({ runImmediately = false } = {}) {
    maintainPersistedTasks();
    let resumed = 0;
    for (const task of activeTasks()) {
      if (![TASK_STATES.RUNNING, TASK_STATES.DEGRADED].includes(task.state)) continue;
      if (requiresAuthenticatedCloud(task)) {
        await refreshCloud(task);
        if (task.resumeBlocked?.reason === "authorization_required") {
          clearSchedule(task.key);
          releaseRunnerLease(task.key);
          continue;
        }
      }
      if (!acquireRunnerLease(task.key)) {
        scheduleLeaseRecovery(task.key, runImmediately);
        continue;
      }
      clearLeaseRecovery(task.key);
      if (runners.has(task.key)) continue;
      ensureRunner(task);
      resumed += 1;
      if (runImmediately && (!requiresAuthenticatedCloud(task) || task.cloudState === CLOUD_STATES.ONLINE)) await runOnce(task.key, { schedule: true });
      else schedule(task.key);
    }
    return resumed;
  }

  function close() {
    for (const key of timers.keys()) clearSchedule(key);
    for (const key of leaseTimers.keys()) clearLeaseRenewal(key);
    for (const key of leaseRecoveryTimers.keys()) clearLeaseRecovery(key);
    for (const key of runners.keys()) releaseRunnerLease(key);
    runners.clear();
  }

  function isCapabilityReady(capability) {
    const persisted = state.capabilities?.[capability];
    if (persisted) return persisted === true || (persisted.state === "passed" && persisted.executorReady === true);
    if (typeof capabilityProbe === "function") return capabilityProbe(capability) === true;
    const probe = capabilityProbe?.[capability] || capabilityProbe?.get?.(capability);
    return probe === true || (probe?.state === "passed" && probe?.executorReady === true);
  }

  function recordCapabilityProbe(capability, probe) {
    const name = String(capability || "").trim();
    if (!name) throw acquisitionError("能力名称不能为空", "DOUYIN_CAPABILITY_REQUIRED", 400);
    const normalized = normalizeCapabilityProbe(probe);
    if (!normalized) throw acquisitionError("能力探测结果无效", "DOUYIN_CAPABILITY_PROBE_INVALID", 400);
    state.capabilities[name] = { ...normalized, observedAt: normalized.observedAt || now() };
    persist();
    return clone(state.capabilities[name]);
  }

  function readCapabilityProbe(capability) {
    return clone(state.capabilities?.[String(capability || "").trim()] || null);
  }

  function persistInjectedCapabilities() {
    if (!capabilityProbe || typeof capabilityProbe === "function") return;
    const entries = capabilityProbe instanceof Map ? capabilityProbe.entries() : Object.entries(capabilityProbe);
    let changed = false;
    for (const [name, probe] of entries) {
      const normalized = normalizeCapabilityProbe(probe);
      if (!normalized) continue;
      const next = { ...normalized, observedAt: normalized.observedAt || now() };
      if (JSON.stringify(state.capabilities?.[name]) !== JSON.stringify(next)) {
        state.capabilities[name] = next;
        changed = true;
      }
    }
    if (changed) persist();
  }

  function ensureRunner(task) {
    if (!runners.has(task.key)) runners.set(task.key, { startedAt: now() });
    scheduleLeaseRenewal(task.key);
  }

  function acquireRunnerLease(key) {
    const leaseKey = String(key);
    return withLeaseLock(() => {
      const latest = loadSnapshot(target);
      const current = latest.leases?.[leaseKey] || null;
      const nowMs = Date.parse(String(now())) || Date.now();
      const expiresMs = Date.parse(String(current?.expiresAt || ""));
      if (current && current.owner !== ownerId && Number.isFinite(expiresMs) && expiresMs > nowMs) {
        state.leases = latest.leases || {};
        return false;
      }
      latest.leases ||= {};
      latest.leases[leaseKey] = {
        owner: ownerId,
        acquiredAt: current?.owner === ownerId ? current.acquiredAt : new Date(nowMs).toISOString(),
        renewedAt: new Date(nowMs).toISOString(),
        expiresAt: new Date(nowMs + leaseDuration()).toISOString()
      };
      writeSnapshot(target, latest);
      state.leases = latest.leases;
      return true;
    });
  }

  function renewRunnerLease(key) {
    const leaseKey = String(key);
    return withLeaseLock(() => {
      const latest = loadSnapshot(target);
      const current = latest.leases?.[leaseKey];
      if (!current || current.owner !== ownerId) return false;
      const nowMs = Date.parse(String(now())) || Date.now();
      latest.leases[leaseKey] = { ...current, renewedAt: new Date(nowMs).toISOString(), expiresAt: new Date(nowMs + leaseDuration()).toISOString() };
      writeSnapshot(target, latest);
      state.leases = latest.leases;
      return true;
    });
  }

  function releaseRunnerLease(key) {
    const leaseKey = String(key);
    clearLeaseRenewal(leaseKey);
    return withLeaseLock(() => {
      const latest = loadSnapshot(target);
      const current = latest.leases?.[leaseKey];
      if (!current || current.owner !== ownerId) {
        state.leases = latest.leases || {};
        return false;
      }
      delete latest.leases[leaseKey];
      writeSnapshot(target, latest);
      state.leases = latest.leases;
      return true;
    });
  }

  function scheduleLeaseRenewal(key) {
    const leaseKey = String(key);
    if (leaseTimers.has(leaseKey)) return;
    const timer = setTimeout(() => {
      leaseTimers.delete(leaseKey);
      if (!runners.has(leaseKey)) return;
      if (renewRunnerLease(leaseKey)) scheduleLeaseRenewal(leaseKey);
    }, Math.max(1_000, Math.floor(leaseDuration() / 2)));
    timer.unref?.();
    leaseTimers.set(leaseKey, timer);
  }

  function clearLeaseRenewal(key) {
    const timer = leaseTimers.get(String(key));
    if (timer) clearTimeout(timer);
    leaseTimers.delete(String(key));
  }

  function scheduleLeaseRecovery(key, runImmediately) {
    const leaseKey = String(key);
    if (leaseRecoveryTimers.has(leaseKey)) return;
    const latest = loadSnapshot(target);
    const expiresAt = Date.parse(String(latest.leases?.[leaseKey]?.expiresAt || ""));
    const nowMs = Date.parse(String(now())) || Date.now();
    const delay = Number.isFinite(expiresAt)
      ? Math.max(250, expiresAt - nowMs + 100)
      : leaseDuration();
    const timer = setTimeout(async () => {
      leaseRecoveryTimers.delete(leaseKey);
      const task = state.tasks[leaseKey];
      if (!task || ![TASK_STATES.RUNNING, TASK_STATES.DEGRADED].includes(task.state)) return;
      try { await resumePersisted({ runImmediately }); } catch { scheduleLeaseRecovery(leaseKey, runImmediately); }
    }, delay);
    timer.unref?.();
    leaseRecoveryTimers.set(leaseKey, timer);
  }

  function clearLeaseRecovery(key) {
    const timer = leaseRecoveryTimers.get(String(key));
    if (timer) clearTimeout(timer);
    leaseRecoveryTimers.delete(String(key));
  }

  function leaseDuration() {
    return Math.max(5_000, Number(leaseTtlMs) || 120_000);
  }

  function withLeaseLock(callback) {
    const lockPath = `${target}.lease.lock`;
    let descriptor = null;
    const staleAfter = leaseDuration();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        descriptor = openSync(lockPath, "wx", 0o600);
        break;
      } catch (error) {
        if (error?.code !== "EEXIST") throw error;
        try {
          if (Date.now() - statSync(lockPath).mtimeMs > staleAfter) unlinkSync(lockPath);
        } catch { /* another owner may be completing the lock operation */ }
      }
    }
    if (descriptor == null) return null;
    try { return callback(); } finally {
      closeSync(descriptor);
      try { unlinkSync(lockPath); } catch { /* lock already reclaimed */ }
    }
  }

  function schedule(key) {
    if (!runners.has(key) || timers.has(key)) return;
    if (![TASK_STATES.RUNNING, TASK_STATES.DEGRADED].includes(state.tasks[key]?.state)) return;
    const delay = Math.max(0, Number(pollIntervalMs) || 60_000);
    const timer = setTimeout(async () => {
      timers.delete(key);
      try { await runOnce(key, { schedule: true }); } catch (error) {
        const task = state.tasks[key];
        if (task && task.state !== TASK_STATES.STOPPED) markError(task, error, EVENT_TYPES.ERROR);
      }
    }, delay);
    timer.unref?.();
    timers.set(key, timer);
  }

  function clearSchedule(key) {
    const timer = timers.get(key);
    if (timer) clearTimeout(timer);
    timers.delete(key);
  }

  async function refreshCloud(task) {
    if (!cloudRegistry || typeof cloudRegistry.status !== "function") return { service: null, snapshot: null };
    let snapshot;
    const cloud = cloudBindingForTask(task);
    try { snapshot = await cloudRegistry.status(cloud.agentId, { ...cloud.scope, resumeSaved: false }); }
    catch (error) {
      task.cloudState = CLOUD_STATES.CONNECTING;
      task.health = "DEGRADED";
      if (task.state === TASK_STATES.RUNNING) task.state = TASK_STATES.DEGRADED;
      task.lastError = serializeError(error);
      persist();
      emit(task, EVENT_TYPES.CLOUD_LIFECYCLE, { state: task.cloudState, error: task.lastError }, `cloud-error:${task.cloudState}`);
      return { service: null, snapshot: null };
    }
    const normalized = normalizeCloudState(snapshot);
    task.cloudState = normalized.state;
    if (normalized.state === CLOUD_STATES.PROVISIONING || normalized.state === CLOUD_STATES.CONNECTING || normalized.state === CLOUD_STATES.RECOVERING) {
      task.health = "DEGRADED";
      if (task.state === TASK_STATES.RUNNING) task.state = TASK_STATES.DEGRADED;
      if (normalized.state === CLOUD_STATES.PROVISIONING && task.config.autoStartCloud && !requiresAuthenticatedCloud(task)
        && typeof cloudRegistry.start === "function" && !runners.get(task.key)?.cloudStartPending) {
        runners.get(task.key).cloudStartPending = true;
        Promise.resolve(cloudRegistry.start(cloud.agentId, cloud.scope)).catch(() => {}).finally(() => {
          if (runners.get(task.key)) runners.get(task.key).cloudStartPending = false;
        });
      }
    } else if (normalized.confirmedDisconnect || normalized.authLost) {
      markError(task, acquisitionError(normalized.authLost ? "抖音授权已失效" : "抖音云电脑已确认掉线", normalized.authLost ? "DOUYIN_AUTH_EXPIRED" : "DOUYIN_CLOUD_OFFLINE", 503), EVENT_TYPES.ERROR);
      if (normalized.authLost) {
        task.resumeBlocked = {
          reason: "authorization_required",
          message: "抖音账号需要重新连接后，自动获客会继续。",
          blockedAt: now()
        };
      }
    } else if (normalized.state === CLOUD_STATES.ONLINE) {
      task.health = "OK";
      if (task.state === TASK_STATES.DEGRADED) task.state = TASK_STATES.RUNNING;
      task.resumeBlocked = null;
    }
    task.updatedAt = now();
    persist();
    emit(task, EVENT_TYPES.CLOUD_LIFECYCLE, { state: task.cloudState, health: task.health }, `cloud:${task.cloudState}:${task.health}`);
    return { service: cloudRegistry.getService?.(cloud.agentId, cloud.scope) || null, snapshot, normalized };
  }

  async function resolveAccount(task, cloudSnapshot = null) {
    const configuredIdentity = task.accountIdentity || task.config.accountIdentity || null;
    if (configuredIdentity?.secId || configuredIdentity?.secUid || configuredIdentity?.uid || configuredIdentity?.userId) {
      task.accountIdentity = normalizeResolvedAccount(configuredIdentity, { source: "provided" });
      return task.accountIdentity;
    }
    const cloudIdentity = cloudSnapshot?.account || cloudSnapshot?.accountIdentity || null;
    if (cloudIdentity?.secId || cloudIdentity?.sec_uid || cloudIdentity?.secUid || cloudIdentity?.uid || cloudIdentity?.user_id) {
      task.accountIdentity = normalizeResolvedAccount(cloudIdentity, { source: "cloud" });
      persist();
      emit(task, EVENT_TYPES.AUTHORIZATION, { status: "resolved", account: task.accountIdentity }, `account:${task.context.accountId}`);
      return task.accountIdentity;
    }
    if (!accountResolver || typeof accountResolver.resolve !== "function") return task.accountIdentity;
    const configuredReference = task.config.accountIdentity && typeof task.config.accountIdentity === "object"
      ? task.config.accountIdentity
      : {};
    const accountRef = typeof task.config.accountRef === "string" ? task.config.accountRef.trim() : "";
    const reference = Object.keys(configuredReference).length
      ? configuredReference
      : accountRef && /^https?:\/\//i.test(accountRef)
        ? { profileUrl: accountRef }
        : { accountId: task.context.accountId, uid: task.context.accountId };
    const resolved = await accountResolver.resolve(reference);
    task.accountIdentity = normalizeResolvedAccount(resolved, { source: resolved?.source || "resolver" });
    persist();
    emit(task, EVENT_TYPES.AUTHORIZATION, { status: "resolved", account: task.accountIdentity }, `account:${task.context.accountId}`);
    return task.accountIdentity;
  }

  async function pullReplies(task, service) {
    if (!service || typeof service.pullMessages !== "function") return;
    let result;
    try { result = await service.pullMessages({ cursor: task.messageCursor || 0, limit: 20, waitMs: 0 }); }
    catch { return; }
    const messages = Array.isArray(result?.messages) ? result.messages : [];
    task.messageCursor = result?.next_cursor ?? result?.nextCursor ?? task.messageCursor;
    for (const message of messages) {
      const normalized = normalizeMessage(message);
      if (normalized.isOutbound) continue;
      if (isComprehensive(task) && classifyIntent(normalized.content) === INBOX_INTENTS.optOut && normalized.secUid) {
        task.suppressedRecipients ||= {};
        task.suppressedRecipients[normalized.secUid] = now();
      }
      const identity = String(message?.msg_id || message?.message_id || message?.id || stable(message));
      if (task.replies.some((reply) => reply.messageId === identity)) continue;
      const receivedAt = now();
      const candidate = findCandidateForReply(task, normalized);
      const leadCapture = extractLeadContact(normalized.content);
      if (candidate && normalized.content) {
        const replyEvidence = {
          content: normalized.content,
          source: "douyin_private_message",
          observedAt: normalized.createdAt || receivedAt,
          ...(normalized.messageId ? { messageId: normalized.messageId } : {})
        };
        candidate.facts = {
          ...(candidate.facts || {}),
          storeConversation: { value: normalized.content, ...replyEvidence }
        };
        candidate.factSources = { ...(candidate.factSources || {}), storeConversation: "douyin_private_message" };
        candidate.factAvailability = { ...(candidate.factAvailability || {}), storeConversation: "available" };
        candidate.incomingContent = normalized.content;
        candidate.replyReceivedAt = normalized.createdAt || receivedAt;
        candidate.replies = [...(Array.isArray(candidate.replies) ? candidate.replies : []), replyEvidence].slice(-20);
        const candidateKey = candidateIdentity(candidate);
        if (candidateKey) {
          task.candidateProfiles[candidateKey] = {
            ...(task.candidateProfiles[candidateKey] || {}),
            ...candidate
          };
        }
        for (const touch of task.approvalQueue) {
          if (touch.candidateKey !== candidateKey) continue;
          touch.lead = {
            ...(touch.lead || {}),
            facts: { ...(touch.lead?.facts || {}), ...candidate.facts },
            factSources: { ...(touch.lead?.factSources || {}), ...candidate.factSources },
            factAvailability: { ...(touch.lead?.factAvailability || {}), ...candidate.factAvailability },
            incomingContent: normalized.content,
            replyReceivedAt: normalized.createdAt || receivedAt,
            replies: candidate.replies
          };
        }
      }
      if (leadCapture) {
        const captureKey = candidate ? candidateIdentity(candidate) : (normalized.secUid || normalized.secId || normalized.nickname || identity);
        const alreadyCaptured = task.replies.some((reply) => {
          if (!reply.leadCapture) return false;
          const replyKey = reply.candidateKey || reply.leadId || reply.secUid || reply.sec_uid || reply.nickname;
          return String(replyKey || "") === String(captureKey || "");
        });
        if (!alreadyCaptured) task.counters.captured = Number(task.counters.captured || 0) + 1;
        if (candidate) {
          const captureState = {
            leadCapture,
            leadCaptureStatus: "captured",
            leadCaptureQuote: normalized.content,
            leadCaptureObservedAt: normalized.createdAt || receivedAt
          };
          Object.assign(candidate, captureState);
          for (const touch of task.approvalQueue) {
            if (touch.candidateKey === candidateIdentity(candidate)) Object.assign(touch.lead, captureState);
          }
        }
      }
      task.replies.push({
        messageId: identity,
        ...(candidate?.leadId || candidate?.id ? { leadId: candidate.leadId || candidate.id } : {}),
        ...(candidate ? { candidateKey: candidateIdentity(candidate) } : {}),
        ...clone(message),
        ...(normalized.content ? { content: normalized.content } : {}),
        ...(normalized.nickname ? { nickname: normalized.nickname } : {}),
        ...(normalized.userId ? { userId: normalized.userId } : {}),
        ...(normalized.secUid ? { secUid: normalized.secUid } : {}),
        ...(normalized.uniqueId ? { uniqueId: normalized.uniqueId } : {}),
        ...(normalized.externalUserId ? { externalUserId: normalized.externalUserId } : {}),
        ...(normalized.avatarUrl ? { avatarUrl: normalized.avatarUrl } : {}),
        ...(normalized.conversationId ? { conversationId: normalized.conversationId } : {}),
        ...(normalized.createdAt ? { createdAt: normalized.createdAt } : {}),
        receivedAt,
        ...(leadCapture ? {
          leadCapture,
          leadCaptureStatus: "captured",
          leadCaptureQuote: normalized.content,
          leadCaptureObservedAt: normalized.createdAt || receivedAt
        } : {})
      });
      if (task.replies.length > MAX_REPLIES) task.replies.splice(0, task.replies.length - MAX_REPLIES);
      task.counters.replies += 1;
      emit(task, EVENT_TYPES.REPLY_RECEIVED, { message: clone(message) }, `reply:${identity}`);
      if (!isComprehensive(task) && task.config.stopConditions.stopOnReply === true) await stop(task.key, "reply_received");
    }
  }

  function findCandidateForReply(task, message) {
    const candidates = [
      ...Object.values(task.candidateProfiles || {}),
      ...task.approvalQueue.map((touch) => touch?.lead).filter(Boolean)
    ];
    const replyKeys = new Set([
      message.secUid,
      message.secId,
      message.externalUserId,
      message.userId,
      message.uniqueId,
      message.nickname
    ].filter(Boolean).map(value => String(value)));
    return candidates.find((candidate) => [
      candidateIdentity(candidate),
      candidate.leadId,
      candidate.id,
      candidate.secUid,
      candidate.sec_uid,
      candidate.secId,
      candidate.sec_id,
      candidate.externalUserId,
      candidate.userId,
      candidate.uniqueId,
      candidate.nickname
    ].filter(Boolean).some(value => replyKeys.has(String(value)))) || null;
  }

  function emit(task, type, payload = {}, dedupeKey = null, { requireDelivery = false } = {}) {
    const eventKey = dedupeKey || stable(payload);
    const existing = task.events.find((item) => item.type === type && item.eventKey === eventKey);
    if (existing) return existing;
    const snapshot = taskStateSnapshot(task);
    const event = {
      eventId: `acq:${task.key}:${task.eventSeq + 1}:${type}:${stable(eventKey)}`,
      eventKey,
      seq: ++task.eventSeq,
      type,
      occurredAt: now(),
      agentId: task.context.agentId,
      taskId: task.context.taskId,
      taskRunId: task.context.taskRunId,
      conversationId: task.context.conversationId,
      accountId: task.context.accountId,
      tenantId: task.context.tenantId,
      ...snapshot,
      payload: { ...clone(payload), ...snapshot }
    };
    task.events.push(event);
    if (task.events.length > MAX_EVENTS) task.events.splice(0, task.events.length - MAX_EVENTS);
    task.updatedAt = now();
    persist();
    try {
      const delivery = eventSink?.(clone(event));
      if (requireDelivery && eventSink && (delivery === null || delivery === false)) {
        throw acquisitionError("获客配置未能同步到控制面", "DOUYIN_ACQUISITION_CONFIG_SYNC_FAILED", 503, { taskKey: task.key });
      }
    } catch (error) {
      if (requireDelivery) throw error;
      /* Event delivery must not stop ordinary task execution. */
    }
    return event;
  }

  return Object.freeze({
    stateFile: target,
    createTask,
    start,
    preview,
    runOnce,
    pause,
    resume,
    stop,
    retry,
    approveTouch,
    approveBatch,
    rejectTouch,
    reconcileTouch,
    updateTaskConfig,
    recordCapabilityProbe,
    readCapabilityProbe,
    status,
    listTasks,
    listRuntimeTasks,
    resumePersisted,
    close,
    ownerKey: acquisitionOwnerKey,
    executionArchitecture: () => ({
      authorizedAccountExecution: {
        provider: "douyin-execution-mcp",
        configured: Boolean(comprehensiveSource || authorizedCommentSource),
        scopes: [COMPREHENSIVE_SOURCE_SCOPE, "authorized_account_interactions", "authorized_account_comments", "authorized_account_live"]
      },
      profileEnrichment: {
        provider: "douyin-agent-data-api",
        configured: Boolean(profileDataClient)
      },
      legacyPublicCommentCollection: {
        provider: "legacy-public-discovery-adapter",
        configured: Boolean(publicDiscoveryService)
      },
      publicCommentReply: {
        provider: "not_part_of_core_agent_execution",
        configured: false
      }
    })
  });

  function requireTask(keyOrContext) {
    const key = typeof keyOrContext === "string" ? keyOrContext : acquisitionOwnerKey(keyOrContext?.context || keyOrContext || {});
    const task = state.tasks[key];
    if (!task) throw acquisitionError("获客任务不存在", "DOUYIN_ACQUISITION_TASK_NOT_FOUND", 404);
    return task;
  }

  function usesAuthorizedCommentNotifications(task) {
    return ["mkt-comment-acquisition", FINDER_AGENT_ID].includes(task.context.agentId)
      && String(task.config.sourceScope?.kind || "").trim() === "authorized_account_comments";
  }

  function findTouch(task, touchId) {
    const touch = task.approvalQueue.find((item) => item.touchId === touchId);
    if (!touch) throw acquisitionError("触达草稿不存在", "DOUYIN_TOUCH_NOT_FOUND", 404);
    return touch;
  }

  function markError(task, error, eventType) {
    if ([TASK_STATES.STOPPED, TASK_STATES.PAUSED].includes(task.state)) return;
    const recoverable = shouldKeepTaskActiveAfterError(task, error);
    task.state = recoverable ? TASK_STATES.DEGRADED : TASK_STATES.ERROR;
    task.health = recoverable ? "DEGRADED" : "ERROR";
    task.lastError = serializeError(error);
    task.updatedAt = now();
    persist();
    emit(task, recoverable ? EVENT_TYPES.RETRY : eventType, { error: task.lastError, queued: recoverable });
  }
}

export function acquisitionOwnerKey(context = {}) {
  const normalized = normalizeContext(context);
  return `${normalized.agentId}::${normalized.taskId}::${normalized.accountId}`;
}

export function acquisitionTaskFingerprint(context = {}, config = {}) {
  const normalizedContext = normalizeContext(context);
  const normalizedConfig = normalizeComprehensiveScope(normalizedContext, normalizeConfig(config));
  return `acq-task:${stableCanonical({
    agentId: normalizedContext.agentId,
    accountKeys: taskAccountKeys(normalizedContext, normalizedConfig),
    config: taskConfigForFingerprint(normalizedConfig)
  })}`;
}

export function normalizeAcquisitionContext(context = {}) { return normalizeContext(context); }
export function normalizeAcquisitionConfig(config = {}) { return normalizeConfig(config); }

function normalizeContext(value) {
  const source = value && typeof value === "object" ? value : {};
  const context = {
    agentId: String(source.agentId || source.agent_id || "").trim(),
    taskId: String(source.taskId || source.task_id || "").trim(),
    taskRunId: String(source.taskRunId || source.task_run_id || source.runId || "").trim(),
    conversationId: String(source.conversationId || source.conversation_id || "").trim(),
    accountId: String(source.accountId || source.account_id || "").trim(),
    tenantId: String(source.tenantId || source.tenant_id || "").trim() || null
  };
  const executionAgentId = String(source.executionAgentId || source.execution_agent_id || "").trim();
  if (executionAgentId) context.executionAgentId = executionAgentId;
  if (context.agentId === RETIRED_LIVE_AGENT_ID) {
    throw acquisitionError("直播间找客户已并入找客专员。请使用找客专员并选择“我的账号直播互动”。", "DOUYIN_ACQUISITION_AGENT_RETIRED", 410);
  }
  if (!AGENT_IDS.has(context.agentId)) throw acquisitionError("仅支持获客专家、找客专员、直播间弹幕分析或直播间未成交客户触达", "DOUYIN_ACQUISITION_AGENT_INVALID", 400);
  const runtimeAgentId = acquisitionExecutionAgentId(context);
  if (!EXECUTION_AGENT_IDS.has(runtimeAgentId)) {
    throw acquisitionError("获客执行身份无效", "DOUYIN_ACQUISITION_EXECUTION_AGENT_INVALID", 400);
  }
  if (context.agentId === FINDER_AGENT_ID && runtimeAgentId !== COMPREHENSIVE_AGENT_ID) {
    throw acquisitionError("找客专员的授权账号监听必须使用已授权账号对应的云电脑", "DOUYIN_ACQUISITION_EXECUTION_AGENT_INVALID", 400);
  }
  const delegatedAgent = [LIVE_DANMAKU_ANALYSIS_AGENT_ID, LIVE_DANMAKU_OUTREACH_AGENT_ID].includes(context.agentId);
  if (context.agentId !== FINDER_AGENT_ID && !delegatedAgent && executionAgentId && runtimeAgentId !== context.agentId) {
    throw acquisitionError("当前获客任务不支持委托其他云电脑执行", "DOUYIN_ACQUISITION_EXECUTION_AGENT_INVALID", 400);
  }
  for (const field of ["taskId", "taskRunId", "conversationId", "accountId"]) if (!context[field]) throw acquisitionError(`${field} is required`, "DOUYIN_ACQUISITION_CONTEXT_REQUIRED", 400, { field });
  return context;
}

function normalizeConfig(value) {
  const source = value && typeof value === "object" ? value : {};
  const sourceScope = { ...(source.sourceScope || {}) };
  const audienceRules = { ...(source.audienceRules || {}) };
  const contentPolicy = { quoteComment: true, maxLength: 120, template: "看到你说：{{comment}}，如果方便我可以继续帮你确认。", strategy: "", ...(source.contentPolicy || {}) };
  const liveDanmakuOutreach = source.liveDanmakuOutreach === true || source.outreachKind === "live_danmaku_every_user";
  const capSource = source.caps && typeof source.caps === "object" ? source.caps : {};
  const caps = { dailyMax: liveDanmakuOutreach ? null : 50, sendIntervalMs: 0, cooldownMs: 0, ...capSource };
  if (liveDanmakuOutreach) caps.dailyMax = null;
  const platformConstraints = {
    ...((source.platformConstraints && typeof source.platformConstraints === "object") ? source.platformConstraints : {}),
    ...((capSource.platformConstraints && typeof capSource.platformConstraints === "object") ? capSource.platformConstraints : {})
  };
  const isListener = isListenerSourceScope(sourceScope);
  const workWindow = { ...(source.workWindow || {}) };
  if (isListener) {
    // Authorized-account listeners run continuously. First outreach happens
    // when a high-intent signal arrives; reception schedules live elsewhere.
    delete workWindow.schedule;
    delete workWindow.timeWindow;
    delete workWindow.time_window;
    delete workWindow.timezone;
    delete workWindow.workSchedule;
    delete workWindow.lookbackDays;
    delete workWindow.lookback_days;
    delete workWindow.days;
    delete workWindow.start;
    delete workWindow.end;
    delete sourceScope.lookbackDays;
    delete sourceScope.lookback_days;
    delete sourceScope.timeWindow;
    delete sourceScope.time_window;
    delete sourceScope.days;
    delete sourceScope.start;
    delete sourceScope.end;
    delete sourceScope.schedule;
    delete sourceScope.timezone;
  }
  const discoveryOnly = !liveDanmakuOutreach && (source.discoveryOnly === true || sourceScope.kind === "authorized_account_live");
  const normalized = {
    sourceScope,
    discoveryOnly,
    analysisOnly: source.analysisOnly === true,
    analysisKind: String(source.analysisKind || "").trim(),
    liveDanmakuOutreach,
    touchEveryLiveDanmaku: source.touchEveryLiveDanmaku === true,
    liveSignals: Array.isArray(source.liveSignals)
      ? [...new Set(source.liveSignals.map((value) => String(value || "").trim().toLowerCase()).filter(Boolean))]
      : [],
    accountRef: source.accountRef || source.account || sourceScope.accountRef || null,
    accountIdentity: source.accountIdentity || null,
    cursor: source.cursor ?? null,
    workWindow,
    audienceRules: { goal: String(audienceRules.goal || source.goal || "公开抖音评论潜客发现"), minScore: audienceRules.minScore ?? source.minScore ?? 80, ...audienceRules },
    autoStartCloud: source.autoStartCloud !== false
  };
  if (normalized.analysisKind === "live_danmaku") normalized.liveSignals = ["danmaku"];
  if (discoveryOnly) {
    normalized.approvalMode = APPROVAL_MODES.MANUAL;
    normalized.autoStartCloud = false;
    return normalized;
  }
  normalized.frequency = source.frequency || source.frequencyMs || 60_000;
  normalized.touchChannel = source.touchChannel || "private_message";
  normalized.approvalMode = isComprehensiveSourceScope(sourceScope.kind) ? APPROVAL_MODES.AUTO : Object.values(APPROVAL_MODES).includes(source.approvalMode) ? source.approvalMode : APPROVAL_MODES.MANUAL;
  normalized.contentPolicy = contentPolicy;
  normalized.caps = caps;
  normalized.platformConstraints = platformConstraints;
  normalized.stopConditions = { ...(source.stopConditions || {}), ...(isComprehensiveSourceScope(sourceScope.kind) ? { stopOnReply: false } : {}) };
  if (liveDanmakuOutreach) {
    normalized.discoveryOnly = false;
    normalized.analysisOnly = false;
    normalized.analysisKind = "live_danmaku_outreach";
    normalized.liveSignals = ["danmaku"];
    normalized.touchEveryLiveDanmaku = true;
    normalized.touchChannel = "private_message";
    normalized.approvalMode = APPROVAL_MODES.AUTO;
  }
  return normalized;
}

function listenerWorkSchedule(value) {
  const raw = isRecord(value) ? value.schedule : value;
  const schedule = typeof raw === "string" ? raw.trim() : "";
  return /^\d{1,2}:\d{2}\s*(?:-|~|至|到)\s*\d{1,2}:\d{2}$/.test(schedule) ? schedule : "";
}

const CONFIGURATION_UPDATE_WHITELIST = Object.freeze({
  findingStrategy: new Set(["sourceScope", "audienceGoal", "requirements", "intentSignals", "minScore", "filters", "scopeExpansion", "expandScope", "scope"]),
  touchContent: new Set(["channel", "message", "text", "template", "strategy", "replyStyle", "handoffBoundary", "approvalMode", "conversionGoal"]),
  frequency: new Set(["mode", "interval", "maxTouchesPerDay", "minIntervalMinutes", "dailyMax", "sendIntervalMs", "cooldownMs", "maxPerMinute"]),
  timeWindow: new Set(["timezone", "schedule"]),
  stopConditions: new Set(["stopOnReply", "stopOnOptOut", "maxFailures", "dailyCapReached", "onError"])
});

function canonicalConfiguration(config = {}) {
  const source = normalizeConfig(config);
  const liveDanmakuOutreach = source.liveDanmakuOutreach === true;
  const audience = source.audienceRules && typeof source.audienceRules === "object" ? source.audienceRules : {};
  const content = source.contentPolicy && typeof source.contentPolicy === "object" ? source.contentPolicy : {};
  const caps = source.caps && typeof source.caps === "object" ? source.caps : {};
  const frequency = source.frequency && typeof source.frequency === "object" && !Array.isArray(source.frequency)
    ? source.frequency
    : {};
  const frequencyMode = frequency.mode ?? (typeof source.frequency === "string" || typeof source.frequency === "number" ? source.frequency : null);
  const findingStrategy = {
    sourceScope: sourceScopeValue(source.sourceScope),
    audienceGoal: audience.goal ?? null,
    requirements: audience.requirements ?? null,
    ...(audience.intentSignals !== undefined ? { intentSignals: clone(audience.intentSignals) } : {}),
    ...(audience.minScore !== undefined ? { minScore: audience.minScore } : {}),
    ...(audience.filters !== undefined ? { filters: clone(audience.filters) } : {})
  };
  if (source.discoveryOnly === true) {
    return {
      findingStrategy,
      ...(source.analysisOnly ? { analysisOnly: true } : {}),
      ...(source.analysisKind ? { analysisKind: source.analysisKind } : {}),
      ...(source.liveSignals?.length ? { liveSignals: clone(source.liveSignals) } : {})
    };
  }
  return {
    findingStrategy,
    touchContent: {
      channel: source.touchChannel ?? null,
      message: content.strategy || content.template || null,
      ...(content.strategy !== undefined ? { strategy: content.strategy } : {}),
      ...(content.replyStyle !== undefined ? { replyStyle: content.replyStyle } : {}),
      ...(content.conversionGoal !== undefined ? { conversionGoal: content.conversionGoal } : {}),
      ...(content.handoffBoundary !== undefined ? { handoffBoundary: content.handoffBoundary } : {}),
      approvalMode: source.approvalMode ?? null
    },
    frequency: {
      mode: frequencyMode,
      maxTouchesPerDay: liveDanmakuOutreach ? null : caps.dailyMax ?? frequency.maxTouchesPerDay ?? null,
      minIntervalMinutes: Number.isFinite(Number(caps.sendIntervalMs)) && Number(caps.sendIntervalMs) > 0
        ? Number(caps.sendIntervalMs) / 60_000
        : frequency.minIntervalMinutes ?? 0,
      ...(caps.cooldownMs !== undefined ? { cooldownMs: caps.cooldownMs } : {}),
      ...(source.platformConstraints?.maxPerMinute !== undefined ? { maxPerMinute: source.platformConstraints.maxPerMinute } : {})
    },
    stopConditions: clone(source.stopConditions || {}),
    ...(source.liveDanmakuOutreach === true ? {
      liveDanmakuOutreach: true,
      touchEveryLiveDanmaku: source.touchEveryLiveDanmaku === true
    } : {})
  };
}

function sourceScopeValue(scope) {
  if (typeof scope === "string") return scope;
  if (!scope || typeof scope !== "object" || Array.isArray(scope)) return scope ?? null;
  return clone(scope);
}

function normalizeConfigurationUpdatePayload(rawPayload = {}, { listener = false } = {}) {
  const source = rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload) ? rawPayload : {};
  const payload = source.payload && typeof source.payload === "object" && !Array.isArray(source.payload) ? source.payload : source;
  const baseConfigVersion = Number(payload.baseConfigVersion);
  const configVersion = Number(payload.configVersion);
  const expectedVersion = payload.expectedVersion == null && payload.taskVersion == null
    ? null
    : Number(payload.expectedVersion ?? payload.taskVersion);
  if (expectedVersion !== null && (!Number.isInteger(expectedVersion) || expectedVersion < 0)) {
    throw acquisitionError("expectedVersion 必须是非负整数", "DOUYIN_ACQUISITION_TASK_VERSION_REQUIRED", 400);
  }
  if (!Number.isInteger(baseConfigVersion) || baseConfigVersion < 1) throw acquisitionError("baseConfigVersion 必须是正整数", "DOUYIN_ACQUISITION_CONFIG_VERSION_REQUIRED", 400);
  if (!Number.isInteger(configVersion) || configVersion < 1) throw acquisitionError("configVersion 必须是正整数", "DOUYIN_ACQUISITION_CONFIG_VERSION_REQUIRED", 400);
  if (payload.effectiveScope !== "future_only") throw acquisitionError("任务配置更新仅支持 future_only", "DOUYIN_ACQUISITION_CONFIG_SCOPE_INVALID", 400);
  if (!payload.changes || typeof payload.changes !== "object" || Array.isArray(payload.changes)) throw acquisitionError("changes 必须是非空对象", "DOUYIN_ACQUISITION_CONFIG_CHANGES_REQUIRED", 400);
  const rawChanges = payload.changes;
  const changes = { ...rawChanges };
  if (isRecord(changes.strategy) || isRecord(changes.discovery)) {
    changes.findingStrategy = {
      ...(isRecord(changes.discovery) ? changes.discovery : {}),
      ...(isRecord(changes.strategy) ? changes.strategy : {}),
      ...(isRecord(changes.findingStrategy) ? changes.findingStrategy : {})
    };
    delete changes.strategy;
    delete changes.discovery;
  }
  if (isRecord(changes.findingStrategy) && changes.findingStrategy.scope !== undefined) {
    const findingStrategy = { ...changes.findingStrategy };
    const scopeAlias = findingStrategy.scope;
    if (findingStrategy.sourceScope !== undefined && JSON.stringify(findingStrategy.sourceScope) !== JSON.stringify(scopeAlias)) {
      throw acquisitionError("findingStrategy.scope 与 sourceScope 不一致", "DOUYIN_ACQUISITION_CONFIG_SCOPE_ALIAS_MISMATCH", 400);
    }
    if (findingStrategy.sourceScope === undefined) findingStrategy.sourceScope = scopeAlias;
    delete findingStrategy.scope;
    changes.findingStrategy = findingStrategy;
  }
  if (isRecord(changes.runtimeRules) || isRecord(changes.runtime)) {
    const runtime = {
      ...(isRecord(changes.runtime) ? changes.runtime : {}),
      ...(isRecord(changes.runtimeRules) ? changes.runtimeRules : {})
    };
    const frequency = {
      ...(isRecord(changes.frequency) ? changes.frequency : {}),
      ...(runtime.frequency !== undefined ? { mode: runtime.frequency } : {}),
      ...(runtime.maxTouchesPerDay !== undefined ? { maxTouchesPerDay: runtime.maxTouchesPerDay } : {}),
      ...(runtime.minIntervalMinutes !== undefined ? { minIntervalMinutes: runtime.minIntervalMinutes } : {})
    };
    if (Object.keys(frequency).length) changes.frequency = frequency;
    else delete changes.frequency;
    if (runtime.schedule !== undefined) changes.timeWindow = {
      ...(isRecord(changes.timeWindow) ? changes.timeWindow : {}),
      schedule: runtime.schedule
    };
    if (runtime.stopConditions !== undefined) changes.stopConditions = runtime.stopConditions;
    delete changes.runtimeRules;
    delete changes.runtime;
  }
  if (typeof changes.touchContent === "string") changes.touchContent = { message: changes.touchContent };
  if (typeof changes.stopConditions === "string") changes.stopConditions = { onError: changes.stopConditions };
  if (listener && listenerConfigurationHasHistoricalLookback(changes)) {
    throw acquisitionError("持续监听任务只处理新的评论、直播互动和账号通知，不能设置历史内容回溯范围", "DOUYIN_LISTENER_LOOKBACK_FORBIDDEN", 400);
  }
  if (listener && Object.prototype.hasOwnProperty.call(changes, "timeWindow")) {
    throw acquisitionError("持续监听与首次触达全天运行；工作时间只在私信承接策略中配置", "DOUYIN_LISTENER_SCHEDULE_FIXED", 400);
  }
  validateConfigurationChanges(changes);
  return {
    baseConfigVersion,
    configVersion,
    expectedVersion,
    effectiveScope: payload.effectiveScope,
    changes,
    confirmation: payload.confirmation === true ? { confirmed: true } : payload.confirmation,
    reason: payload.reason || null
  };
}

function validateConfigurationChanges(changes) {
  const sections = Object.keys(changes);
  if (!sections.length) throw acquisitionError("至少需要一项配置变更", "DOUYIN_ACQUISITION_CONFIG_CHANGES_REQUIRED", 400);
  for (const section of sections) {
    if (!Object.prototype.hasOwnProperty.call(CONFIGURATION_UPDATE_WHITELIST, section)) {
      throw acquisitionError(`不允许修改配置项：${section}`, "DOUYIN_ACQUISITION_CONFIG_FIELD_FORBIDDEN", 400, { field: `changes.${section}` });
    }
    validateConfigurationValue(changes[section], CONFIGURATION_UPDATE_WHITELIST[section], `changes.${section}`);
  }
}

function validateConfigurationValue(value, whitelist, path) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => validateConfigurationValue(entry, whitelist, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, entry] of Object.entries(value)) {
    if (!whitelist.has(key)) throw acquisitionError(`不允许修改配置项：${path}.${key}`, "DOUYIN_ACQUISITION_CONFIG_FIELD_FORBIDDEN", 400, { field: `${path}.${key}` });
    const childWhitelist = key === "sourceScope"
      ? new Set(["kind", "type", "scope", "videoIds", "videoUrls", "videoLimit", "commentLimit"])
      : key === "filters"
        ? new Set(["industries", "regions", "fanRange", "minFollowers", "maxFollowers", "minPlayCount", "maxPlayCount", "keywords", "excludeKeywords", "intentSignals", "minScore", "accountTypes", "verifiedOnly", "commentLimit", "videoLimit", "gender", "ageRange"])
        : whitelist;
    validateConfigurationValue(entry, childWhitelist, `${path}.${key}`);
  }
}

function deepMerge(base, patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return clone(patch);
  const result = base && typeof base === "object" && !Array.isArray(base) ? clone(base) : {};
  for (const [key, value] of Object.entries(patch)) {
    result[key] = value && typeof value === "object" && !Array.isArray(value)
      ? deepMerge(result[key], value)
      : clone(value);
  }
  return result;
}

function changedConfigurationSections(before, after) {
  return Object.keys(after).filter((section) => JSON.stringify(before?.[section]) !== JSON.stringify(after?.[section]));
}

function configurationUpdateIsRisky(before, after) {
  const beforeTouch = before?.touchContent || {};
  const afterTouch = after?.touchContent || {};
  if (afterTouch.approvalMode === APPROVAL_MODES.AUTO && beforeTouch.approvalMode !== APPROVAL_MODES.AUTO) return true;
  if (afterTouch.channel !== beforeTouch.channel && afterTouch.channel === "private_message") return true;
  const beforeStrategy = before?.findingStrategy || {};
  const afterStrategy = after?.findingStrategy || {};
  if (afterStrategy.scopeExpansion === true && beforeStrategy.scopeExpansion !== true) return true;
  if (afterStrategy.expandScope === true && beforeStrategy.expandScope !== true) return true;
  if (!sameSourceScope(afterStrategy.sourceScope, beforeStrategy.sourceScope) && afterStrategy.sourceScope != null) return true;
  const beforeFrequency = before?.frequency || {};
  const afterFrequency = after?.frequency || {};
  const beforeMax = Number(beforeFrequency.maxTouchesPerDay);
  const afterMax = Number(afterFrequency.maxTouchesPerDay);
  if (Number.isFinite(beforeMax) && Number.isFinite(afterMax) && afterMax > beforeMax) return true;
  const beforeInterval = Number(beforeFrequency.minIntervalMinutes);
  const afterInterval = Number(afterFrequency.minIntervalMinutes);
  return Number.isFinite(beforeInterval) && Number.isFinite(afterInterval) && afterInterval < beforeInterval;
}

function sameSourceScope(left, right) {
  if (typeof left === "string" && right && typeof right === "object") {
    return left === (right.kind ?? right.type ?? right.scope);
  }
  if (typeof right === "string" && left && typeof left === "object") {
    return right === (left.kind ?? left.type ?? left.scope);
  }
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function applyCanonicalConfiguration(config, canonical) {
  const next = normalizeConfig(config);
  const strategy = canonical.findingStrategy || {};
  const touch = canonical.touchContent || {};
  const frequency = canonical.frequency || {};
  if (strategy.sourceScope !== undefined && strategy.sourceScope !== null) {
    const existingScope = next.sourceScope && typeof next.sourceScope === "object" ? next.sourceScope : {};
    next.sourceScope = typeof strategy.sourceScope === "object" ? deepMerge(existingScope, strategy.sourceScope) : { ...existingScope, kind: strategy.sourceScope };
  }
  if (strategy.audienceGoal !== undefined) next.audienceRules.goal = strategy.audienceGoal;
  if (strategy.requirements !== undefined) next.audienceRules.requirements = strategy.requirements;
  if (strategy.intentSignals !== undefined) next.audienceRules.intentSignals = clone(strategy.intentSignals);
  if (strategy.minScore !== undefined) next.audienceRules.minScore = strategy.minScore;
  if (strategy.filters !== undefined) next.audienceRules.filters = deepMerge(next.audienceRules.filters, strategy.filters);
  if (next.discoveryOnly === true) {
    return normalizeConfig(next);
  }
  if (touch.channel !== undefined) next.touchChannel = touch.channel;
  if (touch.message !== undefined || touch.text !== undefined || touch.template !== undefined) {
    const message = touch.message ?? touch.text ?? touch.template;
    next.contentPolicy.template = message;
    if (touch.strategy === undefined) next.contentPolicy.strategy = message;
  }
  if (touch.strategy !== undefined) next.contentPolicy.strategy = touch.strategy;
  if (touch.replyStyle !== undefined) next.contentPolicy.replyStyle = touch.replyStyle;
  if (touch.conversionGoal !== undefined) next.contentPolicy.conversionGoal = touch.conversionGoal;
  if (touch.handoffBoundary !== undefined) next.contentPolicy.handoffBoundary = touch.handoffBoundary;
  if (touch.approvalMode !== undefined) next.approvalMode = touch.approvalMode;
  if (frequency.mode !== undefined) next.frequency = frequency.mode;
  if (frequency.maxTouchesPerDay !== undefined || frequency.dailyMax !== undefined) next.caps.dailyMax = frequency.maxTouchesPerDay ?? frequency.dailyMax;
  if (frequency.minIntervalMinutes !== undefined) next.caps.sendIntervalMs = Math.max(0, Number(frequency.minIntervalMinutes) * 60_000);
  if (frequency.sendIntervalMs !== undefined) next.caps.sendIntervalMs = frequency.sendIntervalMs;
  if (frequency.cooldownMs !== undefined) next.caps.cooldownMs = frequency.cooldownMs;
  if (frequency.maxPerMinute !== undefined) next.platformConstraints.maxPerMinute = frequency.maxPerMinute;
  if (!isListenerSourceScope(next.sourceScope) && canonical.timeWindow !== undefined && canonical.timeWindow !== null) {
    next.workWindow = canonical.timeWindow && typeof canonical.timeWindow === "object" && !Array.isArray(canonical.timeWindow)
      ? deepMerge(next.workWindow, canonical.timeWindow)
      : { ...next.workWindow, timeWindow: clone(canonical.timeWindow) };
  }
  if (canonical.stopConditions !== undefined) next.stopConditions = deepMerge(next.stopConditions, canonical.stopConditions);
  return normalizeConfig(next);
}

function isListenerSourceScope(scope = {}) {
  return AUTHORIZED_LISTENER_SOURCE_SCOPES.has(String(scope?.kind || "").trim());
}

function isComprehensiveSourceScope(value) {
  return [COMPREHENSIVE_SOURCE_SCOPE, LEGACY_COMPREHENSIVE_SOURCE_SCOPE].includes(String(value || "").trim());
}

function normalizeComprehensiveScope(context = {}, config = {}) {
  if (context?.agentId !== COMPREHENSIVE_AGENT_ID) return config;
  const sourceScope = comprehensiveScopeIdentity(config.sourceScope);
  const configuredAudience = isRecord(config.audienceRules) ? config.audienceRules : {};
  const configuredContent = isRecord(config.contentPolicy) ? config.contentPolicy : {};
  return {
    ...config,
    sourceScope: { ...sourceScope, kind: COMPREHENSIVE_SOURCE_SCOPE },
    discoveryOnly: false,
    accountContext: {
      mode: "automatic",
      includeProfile: true,
      includeRecentWorks: true,
      identifyServiceUsers: true
    },
    audienceRules: {
      mode: "account_context",
      goal: DOUYIN_AUTO_AUDIENCE_GOAL,
      requirements: "",
      minScore: configuredAudience.minScore ?? 80,
      autoIdentifyAccountPositioning: true,
      autoIdentifyServiceUsers: true
    },
    touchChannel: normalizeComprehensiveTouchChannel(config.touchChannel),
    approvalMode: APPROVAL_MODES.AUTO,
    contentPolicy: {
      ...configuredContent,
      mode: "evidence_first",
      template: "",
      strategy: ""
    },
    frequency: {
      ...(isRecord(config.frequency) ? config.frequency : {}),
      mode: "识别到高意向潜客后自动触达"
    },
    // The task is an account-level listener. Individual prospect boundaries
    // must never be represented as a condition that stops the listener.
    stopConditions: { stopOnReply: false, stopOnOptOut: true }
  };
}

function normalizeComprehensiveTouchChannel(value) {
  const channel = String(value || "private_message").trim().toLowerCase();
  if (["", "private_message", "private-message", "direct_message", "dm"].includes(channel)) {
    return "private_message";
  }
  return channel;
}

function isComprehensivePrivateTouchChannel(value) {
  return normalizeComprehensiveTouchChannel(value) === "private_message";
}

function assertComprehensiveTouchChannel(value) {
  if (isComprehensivePrivateTouchChannel(value)) return;
  throw acquisitionError(
    "获客专家只处理账号新增信号，并通过私信完成首次触达；公开评论回复不属于该 Agent 的运行范围",
    "DOUYIN_COMMENT_ACQUISITION_TOUCH_CHANNEL_FIXED",
    400
  );
}

function comprehensiveScopeIdentity(value) {
  if (!isRecord(value)) return {};
  const identity = {};
  for (const field of [
    "accountId", "account_id", "accountRef", "account_ref",
    "secId", "sec_id", "secUid", "sec_uid", "uid",
    "userId", "user_id", "uniqueId", "unique_id",
    "profileUrl", "profile_url", "nickname"
  ]) {
    if (value[field] !== undefined && value[field] !== null && value[field] !== "") identity[field] = clone(value[field]);
  }
  return identity;
}

function assertListenerConfigurationHasNoHistoricalLookback(config, changes = {}) {
  if (!isListenerSourceScope(config?.sourceScope)) return;
  if (listenerConfigurationHasHistoricalLookback(changes)) {
    throw acquisitionError("持续监听任务只处理新的评论、直播互动和账号通知，不能设置历史内容回溯范围", "DOUYIN_LISTENER_LOOKBACK_FORBIDDEN", 400);
  }
}

function listenerConfigurationHasHistoricalLookback(changes = {}) {
  const strategy = changes.findingStrategy && typeof changes.findingStrategy === "object" ? changes.findingStrategy : {};
  const rawTimeWindow = changes.timeWindow;
  const runtime = rawTimeWindow && typeof rawTimeWindow === "object" && !Array.isArray(rawTimeWindow) ? rawTimeWindow : {};
  const scope = strategy.sourceScope && typeof strategy.sourceScope === "object" ? strategy.sourceScope : {};
  const filters = strategy.filters && typeof strategy.filters === "object" ? strategy.filters : {};
  const has = (value, field) => Object.prototype.hasOwnProperty.call(value, field);
  const directTimeWindowIsHistorical = rawTimeWindow !== undefined
    && rawTimeWindow !== null
    && rawTimeWindow !== ""
    && (!isRecord(rawTimeWindow)
      ? !listenerWorkSchedule(rawTimeWindow)
      : Object.keys(rawTimeWindow).some((field) => !["schedule", "timezone"].includes(field))
        || (rawTimeWindow.schedule !== undefined && !listenerWorkSchedule(rawTimeWindow.schedule)));
  return directTimeWindowIsHistorical
    || ["timeWindow", "time_window", "lookbackDays", "lookback_days", "days", "start", "end"].some((field) => has(strategy, field))
    || ["timeWindow", "time_window", "lookbackDays", "lookback_days", "days", "start", "end"].some((field) => has(scope, field))
    || ["timeWindow", "time_window", "lookbackDays", "lookback_days", "days", "start", "end"].some((field) => has(filters, field))
    || ["lookbackDays", "lookback_days", "days", "start", "end"].some((field) => has(runtime, field));
}

function taskAccountKeys(context, config) {
  const identity = config.accountIdentity && typeof config.accountIdentity === "object" ? config.accountIdentity : {};
  const scope = config.sourceScope && typeof config.sourceScope === "object" ? config.sourceScope : {};
  const normalized = normalizeAccountReference({
    ...scope,
    ...identity,
    profileUrl: identity.profileUrl || identity.profile_url || scope.profileUrl || scope.profile_url
      || (typeof config.accountRef === "string" && /^https?:\/\//i.test(config.accountRef) ? config.accountRef : null),
    query: typeof config.accountRef === "string" ? config.accountRef : null
  });
  const externalIdentity = [
    identity.secId,
    identity.sec_id,
    identity.secUid,
    identity.sec_uid,
    identity.uid,
    identity.userId,
    identity.user_id,
    identity.uniqueId,
    identity.unique_id,
    identity.profileUrl,
    identity.profile_url,
    normalized.secId,
    normalized.uid,
    normalized.uniqueId,
    normalized.profileUrl,
    typeof config.accountRef === "string" ? config.accountRef : ""
  ].map((value) => String(value || "").trim()).filter(Boolean);
  const keys = [`account:${context.accountId}`, ...(scope.accountId ? [`account:${scope.accountId}`] : [])];
  externalIdentity.forEach((value) => keys.push(`external:${value}`));
  return [...new Set(keys)].sort();
}

function cloudScopeForTask(task = {}) {
  const context = task.context && typeof task.context === "object" ? task.context : {};
  const config = task.config && typeof task.config === "object" ? task.config : {};
  const sourceScope = config.sourceScope && typeof config.sourceScope === "object" ? config.sourceScope : {};
  const accountIdentity = task.accountIdentity || config.accountIdentity || context.accountIdentity || null;
  return {
    tenantId: context.tenantId || null,
    accountId: context.accountId || sourceScope.accountId || null,
    accountIdentity,
    accountLabel: accountIdentity?.nickname || config.accountName || sourceScope.accountName || null
  };
}

function taskConfigForFingerprint(config) {
  const normalized = stripFingerprintVolatileFields(config);
  if (normalized.sourceScope && typeof normalized.sourceScope === "object") {
    const { accountId, accountName, ...semanticScope } = normalized.sourceScope;
    normalized.sourceScope = semanticScope;
  }
  return normalized;
}

function stripFingerprintVolatileFields(value) {
  if (Array.isArray(value)) return value.map(stripFingerprintVolatileFields);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !TASK_FINGERPRINT_IGNORED_KEYS.has(key))
    .map(([key, entry]) => [key, stripFingerprintVolatileFields(entry)]));
}

function stableCanonical(value) {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex").slice(0, 20);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

function findDuplicateTask(tasks, key, context, config, taskFingerprint, isTaskActuallyActive = null) {
  const exclusive = findExclusiveContinuousTask(tasks, key, context, config, isTaskActuallyActive);
  if (exclusive) return exclusive;
  const currentAccountKeys = new Set(taskAccountKeys(context, config));
  return Object.values(tasks || {}).find((task) => {
    if (!task || task.key === key || task.archivedAt || !TASK_DEDUP_STATES.has(task.state)) return false;
    if (typeof isTaskActuallyActive === "function" && isTaskActuallyActive(task) !== true) return false;
    const otherContext = task.context;
    const otherConfig = task.config;
    if (!otherContext || !otherConfig || otherContext.agentId !== context.agentId) return false;
    return taskAccountKeys(otherContext, otherConfig).some((accountKey) => currentAccountKeys.has(accountKey));
  });
}

function findExclusiveContinuousTask(tasks, key, context, config, isTaskActuallyActive = null) {
  if (!isContinuousContext(context)) return null;
  const currentAccountKeys = new Set(taskAccountKeys(context, config));
  const semanticAgentId = String(context?.agentId || "").trim();
  return Object.values(tasks || {}).find((task) => {
    if (!task || task.key === key || task.archivedAt || !TASK_DEDUP_STATES.has(task.state)) return false;
    if (typeof isTaskActuallyActive === "function" && isTaskActuallyActive(task) !== true) return false;
    if (String(task.context?.agentId || "").trim() !== semanticAgentId) return false;
    return taskAccountKeys(task.context, task.config).some((accountKey) => currentAccountKeys.has(accountKey));
  }) || null;
}

function shareTaskAccount(left, right) {
  const leftKeys = new Set(taskAccountKeys(left.context || {}, left.config || {}));
  return taskAccountKeys(right.context || {}, right.config || {}).some((accountKey) => leftKeys.has(accountKey));
}

function isContinuousAgent(agentId) {
  return CONTINUOUS_AGENT_IDS.has(String(agentId || "").trim());
}

function acquisitionExecutionAgentId(context = {}) {
  return String(context?.executionAgentId || context?.execution_agent_id || context?.agentId || "").trim();
}

function isContinuousContext(context = {}) {
  return isContinuousAgent(context.agentId);
}

function compareTaskRecency(left, right) {
  const leftAt = Date.parse(left?.updatedAt || left?.createdAt || "") || 0;
  const rightAt = Date.parse(right?.updatedAt || right?.createdAt || "") || 0;
  if (leftAt !== rightAt) return rightAt - leftAt;
  const leftCreated = Date.parse(left?.createdAt || "") || 0;
  const rightCreated = Date.parse(right?.createdAt || "") || 0;
  return rightCreated - leftCreated;
}

function isSystemDuplicatePaused(task) {
  return task?.state === TASK_STATES.PAUSED
    && task.systemPause?.reason === SYSTEM_DUPLICATE_PAUSE_REASON;
}

function selectContinuousPrimary(tasks) {
  const runnable = tasks.filter(task => task.state !== TASK_STATES.PAUSED);
  const candidates = runnable.length ? runnable : tasks.filter(task => !isSystemDuplicatePaused(task));
  const pool = candidates.length ? candidates : tasks;
  return [...pool].sort((left, right) => {
    const leftCreated = Date.parse(left?.createdAt || "") || 0;
    const rightCreated = Date.parse(right?.createdAt || "") || 0;
    if (leftCreated !== rightCreated) return rightCreated - leftCreated;
    return String(right?.key || "").localeCompare(String(left?.key || ""));
  })[0];
}

function duplicateTaskError(existing, taskFingerprint) {
  return acquisitionError(
    "同一抖音账号的同一 Agent 已存在相同获客任务，请继续使用现有任务或先停止原任务",
    "DOUYIN_ACQUISITION_DUPLICATE_TASK",
    409,
    {
      existingTaskKey: existing.key,
      existingTaskId: existing.context?.taskId || null,
      existingTaskRunId: existing.context?.taskRunId || null,
      existingState: existing.state || null,
      taskFingerprint
    }
  );
}

function exclusiveTaskError(existing) {
  return acquisitionError(
    "这个抖音账号已经有一项持续获客在进行中，请继续调整现有任务，避免重复联系同一批用户。",
    "DOUYIN_ACQUISITION_ACTIVE_ACCOUNT_TASK",
    409,
    {
      existingTaskKey: existing.key,
      existingTaskId: existing.context?.taskId || null,
      existingTaskRunId: existing.context?.taskRunId || null,
      existingState: existing.state || null
    }
  );
}

function discoveryInput(task, account, requestId, executionConfig = task.config) {
  const scope = executionConfig.sourceScope || {};
  const input = {
    taskId: task.context.taskId,
    taskRunId: task.context.taskRunId,
    conversationId: task.context.conversationId,
    agentId: task.context.agentId,
    goal: executionConfig.audienceRules.goal,
    minScore: executionConfig.audienceRules.minScore,
    analysisMode: task.context.agentId === FINDER_AGENT_ID ? "collect" : "intent",
    cursor: task.cursor,
    videoIds: scope.videoIds || scope.video_ids,
    videoUrls: scope.videoUrls || scope.video_urls,
    uid: account?.uid || account?.douyinUid,
    secId: account?.secId,
    uniqueId: account?.uniqueId,
    accountName: account?.nickname,
    accountRefs: task.config.accountRef ? [task.config.accountRef] : undefined,
    videoLimit: executionConfig.workWindow.videoLimit,
    commentLimit: executionConfig.workWindow.commentLimit,
    limit: executionConfig.workWindow.commentLimit || 100,
    reqId: requestId
  };
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined && value !== null && value !== ""));
}

async function makeDraft(candidate, config, generator = null) {
  const policy = config.contentPolicy && typeof config.contentPolicy === "object" ? config.contentPolicy : {};
  const contentBasis = buildContentBasis(candidate);
  const strategy = String(policy.strategy || policy.template || "").trim();
  const hasCustomGenerator = typeof generator === "function";
  const generate = hasCustomGenerator
    ? generator
    : typeof policy.generate === "function" ? policy.generate : null;
  if (generate) {
    const generated = hasCustomGenerator
      ? await generate({ candidate: clone(candidate), config, strategy, contentBasis: clone(contentBasis) })
      : await generate(candidate, config, { strategy, contentBasis: clone(contentBasis) });
    const generatedContent = typeof generated === "object" && generated !== null
      ? generated.content ?? generated.message ?? ""
      : generated;
    return {
      content: shortDraft(generatedContent, policy.maxLength),
      contentBasis: {
        ...contentBasis,
        generator: hasCustomGenerator ? "custom_touch_generator" : "custom_content_policy",
        ...(typeof generated === "object" && generated?.contentBasis ? generated.contentBasis : {})
      }
    };
  }
  return {
    content: shortDraft(renderPersonalizedDraft(strategy, contentBasis, policy), policy.maxLength),
    contentBasis
  };
}

function makeLiveDanmakuOutreachDraft(config = {}) {
  const policy = config.contentPolicy && typeof config.contentPolicy === "object" ? config.contentPolicy : {};
  const content = shortDraft(policy.strategy || policy.template || "看到你刚才在直播间留言了，方便说说你想了解什么吗？", policy.maxLength);
  return {
    content,
    contentBasis: {
      generator: "live_danmaku_outreach_fixed_message",
      sourceType: "live_chat",
      sourceLabel: "直播间",
      quote: "",
      intentType: null,
      intentScore: null,
      intentTier: null,
      intentReason: null,
      signals: []
    }
  };
}

function buildContentBasis(candidate = {}) {
  const evidence = Array.isArray(candidate.evidence) ? candidate.evidence : [];
  const source = candidate.source && typeof candidate.source === "object" ? candidate.source : {};
  const sourceType = String(source.type || source.kind || evidence.find(item => item?.type)?.type || "comment").trim().toLowerCase() || "comment";
  const evidenceItems = evidence.filter(item => String(item?.quote || item?.text || item?.content || "").trim());
  const datedEvidence = evidenceItems.filter(item => Number.isFinite(Date.parse(String(item?.observedAt || item?.createdAt || item?.timestamp || ""))));
  const latestEvidence = (datedEvidence.length ? datedEvidence : evidenceItems).reduce((latest, item) => {
    if (!latest) return item;
    const latestTime = Date.parse(String(latest?.observedAt || latest?.createdAt || latest?.timestamp || ""));
    const itemTime = Date.parse(String(item?.observedAt || item?.createdAt || item?.timestamp || ""));
    if (Number.isFinite(itemTime) && (!Number.isFinite(latestTime) || itemTime >= latestTime)) return item;
    if (!Number.isFinite(itemTime) && !Number.isFinite(latestTime)) return item;
    return latest;
  }, null) || evidenceItems.at(-1);
  const quote = shortDraft(
    latestEvidence?.quote
      || latestEvidence?.text
      || latestEvidence?.content
      || candidate.text || candidate.comment || candidate.content || "",
    56
  );
  const intent = candidate.intent && typeof candidate.intent === "object" ? candidate.intent : {};
  const sourceLabel = sourceType.includes("live") || sourceType.includes("danmaku") || sourceType.includes("chat")
    ? "直播间"
    : sourceType.includes("follow") || sourceType.includes("like") || sourceType.includes("notification") || sourceType.includes("interaction")
      ? "互动"
      : "评论区";
  const text = [quote, ...(Array.isArray(intent.signals) ? intent.signals : [])].join(" ");
  const intentType = /价格|多少钱|预算|预约|试驾|怎么|如何|能否|是否|车型|购买|联系|在哪|报价/.test(text)
    ? "question"
    : /想|需要|换车|不知道|困扰|求|找|考虑|准备/.test(text)
      ? "need"
      : "interaction";
  return {
    generator: "evidence_rules_v1",
    sourceType,
    sourceLabel,
    quote,
    intentType,
    intentScore: intent.score ?? candidate.score ?? null,
    intentTier: intent.tier || candidate.tier || null,
    intentReason: intent.reason || intent.explanation || candidate.reason || candidate.matchReason || null,
    signals: Array.isArray(intent.signals) ? intent.signals.slice(0, 8) : []
  };
}

function renderPersonalizedDraft(strategy, basis, policy = {}) {
  const quote = basis.quote || "你的留言";
  const sourceLabel = basis.sourceLabel || "评论区";
  const instructionLike = /^(先|根据|结合|围绕|不要|避免|语气|优先|仅|只|从)/.test(strategy) || /触达策略|个性化|自然交流/.test(strategy);
  const greetingMatch = strategy.match(/^(你好|您好)[，,：:\s]*/);
  const greeting = greetingMatch?.[1] || "你好";
  const remainder = strategy.replace(/^(你好|您好)[，,：:\s]*/, "").replace(/^看到你[^，,。！？!?]*[，,。！？!?]\s*/, "").trim();
  if (strategy.includes("{{comment}}")) {
    return strategy.replace(/\{\{comment\}\}/g, policy.quoteComment === false ? quote : quote);
  }
  if (instructionLike || !remainder) {
    if (basis.intentType === "question") return `${greeting}，看到你在${sourceLabel}问“${quote}”了，方便说说你现在最想了解什么吗？`;
    if (basis.intentType === "need") return `${greeting}，看到你在${sourceLabel}提到“${quote}”了，想先确认一下，你现在最想解决的是这个问题吗？`;
    return `${greeting}，看到你刚才在${sourceLabel}有互动，方便说说你具体想了解什么吗？`;
  }
  const evidenceLead = basis.intentType === "question"
    ? `看到你在${sourceLabel}问“${quote}”了`
    : basis.intentType === "need"
      ? `看到你在${sourceLabel}提到“${quote}”了`
      : `看到你刚才在${sourceLabel}有互动`;
  return `${greeting}，${evidenceLead}，${remainder}`;
}

function shortDraft(value, maxLength = 120) {
  const limit = Number(maxLength) || 120;
  return String(value || "").trim().slice(0, limit);
}

function reviewRisk(candidate, config = {}) {
  const comprehensive = isComprehensiveSourceScope(config.sourceScope?.kind);
  const text = [candidate.text || candidate.comment || candidate.content || "", ...(comprehensive ? (candidate.evidence || []).map(item => item.quote || "") : [])].join("\n");
  const terms = comprehensive
    ? ["投诉", "退款", "退货", "赔偿", "别联系", "不要联系", "退订"] : HUMAN_TERMS;
  const matchedTerms = terms.filter((term) => text.includes(term));
  if (matchedTerms.length) return { action: "human_required", matchedTerms, reason: "涉及价格、投诉、退款、承诺或其他不适合自动触达的内容" };
  if (!(candidate.secId || candidate.secUid || candidate.sec_id || candidate.sec_uid)) return { action: "human_required", matchedTerms: [], reason: "缺少可验证的抖音用户身份" };
  const rawScore = candidate.intent?.score ?? candidate.score;
  const intentScore = Number(rawScore);
  const tier = String(candidate.intent?.tier || candidate.tier || "").trim().toLowerCase();
  const configuredThreshold = Number(config.audienceRules?.minScore);
  const autoSendThreshold = Math.max(80, Number.isFinite(configuredThreshold) ? configuredThreshold : 80);
  const highIntent = tier === "high" || (!tier && Number.isFinite(intentScore) && intentScore >= autoSendThreshold);
  if (!highIntent || !Number.isFinite(intentScore) || intentScore < autoSendThreshold) {
    return {
      action: "manual_review",
      matchedTerms: [],
      reason: `意向分未达到自动触达门槛（${autoSendThreshold}），已跳过自动发送`
    };
  }
  return { action: "auto_send", matchedTerms: [], reason: "高意向、低风险且包含可触达用户身份" };
}

function reviewLiveDanmakuOutreachRisk(candidate = {}) {
  const text = [candidate.text || candidate.comment || candidate.content || "", ...(candidate.evidence || []).map(item => item?.quote || "")].join("\n");
  const matchedTerms = ["别联系", "不要联系", "退订", "投诉", "退款", "退货"].filter((term) => text.includes(term));
  if (matchedTerms.length) {
    return { action: "human_required", matchedTerms, reason: "用户明确拒绝联系或提出投诉、退款等需要人工处理的事项" };
  }
  if (!(candidate.secId || candidate.secUid || candidate.sec_id || candidate.sec_uid)) {
    return { action: "human_required", matchedTerms: [], reason: "缺少可验证的抖音用户身份" };
  }
  return { action: "auto_send", matchedTerms: [], reason: "用户在授权直播间发出弹幕，按 Agent 规则直接进入首次触达" };
}

function candidateIdentity(candidate) {
  return String(candidate.secUid || candidate.sec_uid || candidate.externalUserId || candidate.leadId || candidate.uniqueId || candidate.unique_id || candidate.id || stable({ videoId: candidate.source?.videoId, commentId: candidate.commentId, text: candidate.text }));
}

function isComprehensive(task) {
  return task.context.agentId === COMPREHENSIVE_AGENT_ID
    && isComprehensiveSourceScope(task.config.sourceScope?.kind);
}

function isLiveDanmakuAnalysis(task) {
  return task?.context?.agentId === LIVE_DANMAKU_ANALYSIS_AGENT_ID;
}

function liveSignalIdentity(signal = {}) {
  const explicit = signal.eventId || signal.event_id || signal.msgId || signal.msg_id || signal.messageId || signal.message_id || signal.id;
  if (explicit) return String(explicit);
  const evidence = Array.isArray(signal.evidence) ? signal.evidence : [];
  const evidenceIds = evidence.map(item => item?.eventId || item?.event_id || item?.id).filter(Boolean);
  return evidenceIds.length ? evidenceIds.join("|") : stable(signal);
}

function appendLiveDanmakuSignals(previous = [], next = []) {
  const merged = new Map();
  for (const signal of Array.isArray(previous) ? previous : []) merged.set(liveSignalIdentity(signal), signal);
  for (const signal of Array.isArray(next) ? next : []) merged.set(liveSignalIdentity(signal), signal);
  return [...merged.values()];
}

function liveSignalEvents(signals = []) {
  return (Array.isArray(signals) ? signals : []).flatMap(signal => {
    const evidence = Array.isArray(signal?.evidence) && signal.evidence.length ? signal.evidence : [signal];
    return evidence.filter(item => String(item?.type || item?.eventType || signal?.source?.type || signal?.type || "").toLowerCase().replace(/[ -]/g, "_") === "live_chat");
  });
}

function buildLiveCollectionSnapshot(signals = [], source = {}, observedAt = null) {
  const events = liveSignalEvents(signals);
  const users = new Set(events.map(item => item?.userId || item?.user_id || item?.secUid || item?.sec_uid || item?.secId || item?.sec_id).filter(Boolean));
  return {
    state: source?.state === "ended" ? "ended" : "collecting",
    totalDanmaku: events.length,
    uniqueUsers: users.size,
    lastBatchDanmaku: Number(source?.count || 0),
    lastCollectedAt: observedAt,
    sourceState: source?.state || "waiting",
    ...(source?.reason ? { reason: source.reason } : {})
  };
}

function isLiveDanmakuOutreach(task) {
  return task?.context?.agentId === LIVE_DANMAKU_OUTREACH_AGENT_ID
    && task?.config?.liveDanmakuOutreach === true;
}

function isFinderListenerSourceScope(scope = {}) {
  return ["authorized_account_all_signals", "authorized_account_comments", "authorized_account_live", "authorized_account_interactions"].includes(String(scope?.kind || "").trim());
}

function isDiscoveryOnly(task) {
  return task?.config?.discoveryOnly === true;
}

function usesAuthorizedInteractionListener(task) {
  const agentId = task?.context?.agentId;
  const scopeKind = String(task?.config?.sourceScope?.kind || "").trim();
  return (agentId === FINDER_AGENT_ID
    && scopeKind === "authorized_account_interactions")
    || (agentId === FINDER_AGENT_ID && scopeKind === "authorized_account_live")
    || (agentId === FINDER_AGENT_ID && scopeKind === COMPREHENSIVE_SOURCE_SCOPE)
    || (agentId === LIVE_DANMAKU_ANALYSIS_AGENT_ID && scopeKind === "authorized_account_live")
    || (agentId === LIVE_DANMAKU_OUTREACH_AGENT_ID && scopeKind === "authorized_account_live");
}

function includesLiveSignals(task) {
  const scopeKind = String(task?.config?.sourceScope?.kind || "").trim();
  return isComprehensive(task)
    || (task?.context?.agentId === FINDER_AGENT_ID
      && ["authorized_account_live", COMPREHENSIVE_SOURCE_SCOPE].includes(scopeKind))
    || (task?.context?.agentId === LIVE_DANMAKU_ANALYSIS_AGENT_ID && scopeKind === "authorized_account_live")
    || (task?.context?.agentId === LIVE_DANMAKU_OUTREACH_AGENT_ID && scopeKind === "authorized_account_live");
}

function requiresAuthenticatedCloud(task) {
  return isContinuousContext(task?.context);
}

function isCloudRecoveryError(error) {
  return new Set(["DOUYIN_AUTH_EXPIRED", "DOUYIN_CLOUD_OFFLINE", "DOUYIN_CLOUD_NOT_READY"]).has(String(error?.code || ""));
}

function shouldKeepTaskActiveAfterError(task, error) {
  return isDiscoveryOnly(task) || isComprehensive(task) || isCloudRecoveryError(error);
}

function shouldContainRunError(task, error) {
  const code = String(error?.code || "");
  if (["DOUYIN_ACQUISITION_STOPPED", "DOUYIN_ACQUISITION_PAUSED", "DOUYIN_ACQUISITION_NOT_RUNNING"].includes(code)) return false;
  return shouldKeepTaskActiveAfterError(task, error);
}

function isLiveDiscovery(task) {
  const scope = task.config.sourceScope || {};
  const runtimeAgentId = acquisitionExecutionAgentId(task.context);
  const finderLive = task.context.agentId === FINDER_AGENT_ID
    && scope.kind === "authorized_account_live"
    && runtimeAgentId === COMPREHENSIVE_AGENT_ID;
  const liveAnalysis = task.context.agentId === LIVE_DANMAKU_ANALYSIS_AGENT_ID
    && scope.kind === "authorized_account_live"
    && runtimeAgentId === COMPREHENSIVE_AGENT_ID;
  const liveOutreach = task.context.agentId === LIVE_DANMAKU_OUTREACH_AGENT_ID
    && scope.kind === "authorized_account_live"
    && runtimeAgentId === COMPREHENSIVE_AGENT_ID;
  return finderLive || liveAnalysis || liveOutreach;
}

function withinCaps(task, currentTime) {
  const max = Number(task.config.caps.dailyMax);
  const day = value => new Date(Date.parse(value) + 8 * 3600000).toISOString().slice(0, 10);
  const count = isComprehensive(task)
    ? (task.sendHistory || []).filter(entry => Number.isFinite(Date.parse(entry)) && day(entry) === day(currentTime)).length
    : task.counters.sent;
  return !Number.isFinite(max) || max <= 0 || count < max;
}

function checkSendWindow(task, currentTime = new Date().toISOString()) {
  if (!withinCaps(task, currentTime)) {
    const nextDay = Math.floor((Date.parse(currentTime) + 8 * 3600000) / 86400000) * 86400000 + 86400000 - 8 * 3600000;
    return { allowed: false, reason: "daily_cap", nextAt: new Date(nextDay).toISOString() };
  }
  const nowMs = Date.parse(String(currentTime)) || Date.now();
  const lastSendMs = Date.parse(String(task.lastSendAt || ""));
  const intervalMs = Math.max(
    Number(task.config.caps.sendIntervalMs) || 0,
    Number(task.config.caps.cooldownMs) || 0,
    Number(task.config.platformConstraints?.minIntervalMs) || Number(task.config.platformConstraints?.min_interval_ms) || 0
  );
  if (Number.isFinite(lastSendMs) && intervalMs > 0 && nowMs - lastSendMs < intervalMs) {
    return { allowed: false, reason: "interval", nextAt: new Date(lastSendMs + intervalMs).toISOString() };
  }
  const history = Array.isArray(task.sendHistory) ? task.sendHistory : [];
  const recent = history.filter((entry) => {
    const timestamp = Date.parse(String(entry));
    return Number.isFinite(timestamp) && nowMs - timestamp < 60_000;
  });
  const maxPerMinute = Number(task.config.platformConstraints?.maxPerMinute)
    || Number(task.config.platformConstraints?.max_per_minute)
    || 0;
  if (Number.isFinite(maxPerMinute) && maxPerMinute > 0 && recent.length >= maxPerMinute) {
    const oldest = Math.min(...recent.map((entry) => Date.parse(String(entry))));
    return { allowed: false, reason: "platform_rate", nextAt: new Date(oldest + 60_000).toISOString() };
  }
  return { allowed: true, reason: null, nextAt: null };
}

function recordSendAttempt(task, currentTime = new Date().toISOString()) {
  const observedAt = new Date(Date.parse(String(currentTime)) || Date.now()).toISOString();
  task.lastSendAt = observedAt;
  task.sendHistory = Array.isArray(task.sendHistory) ? task.sendHistory : [];
  task.sendHistory.push(observedAt);
  task.sendHistory = task.sendHistory.filter(entry => Date.parse(observedAt) - Date.parse(entry) < 48 * 3600000);
  task.nextRunAt = null;
}

function auditTouch(touch, state, reason) {
  touch.history ||= [];
  touch.history.push({ state, reason, at: new Date().toISOString() });
  touch.updatedAt = new Date().toISOString();
}

function applyReceipt(task, touch, result, eventSink = null) {
  const receipt = result?.receipt && typeof result.receipt === "object" ? result.receipt : result;
  const error = receipt?.error || result?.error;
  if (receipt?.ok === false || result?.ok === false || error) {
    const failure = error || receipt || result;
    if (isTransient(failure)) {
      markTouchUnknown(task, touch, failure, "send_response_lost");
    } else {
      markTouchFailed(task, touch, failure);
    }
    return;
  }
  const rawState = receipt?.state ?? receipt?.status ?? receipt?.delivery_state ?? receipt?.deliveryState;
  let state = rawState == null || String(rawState).trim() === ""
    ? "unknown"
    : String(rawState).toLowerCase();
  const knownStates = new Set(["accepted", "delivered", "sent", "success", "succeeded", "failed", "rejected", "denied", "unknown", "pending", "processing", "error"]);
  if (!knownStates.has(state) || state === "ok" || String(receipt?.status || "").toLowerCase() === "ok") state = "unknown";
  touch.providerMessageId = receipt?.message_id || receipt?.messageId || receipt?.id || touch.providerMessageId || null;
  task.lastReceipt = { touchId: touch.touchId, state, at: new Date().toISOString(), providerMessageId: touch.providerMessageId };
  emitReceipt(task, touch, state, receipt, eventSink);
  if (["unknown", "pending", "processing"].includes(state)) {
    if (touch.state === TOUCH_STATES.DELIVERY_CHECKING) {
      transitionTouch(touch.state, TOUCH_STATES.UNKNOWN);
      touch.state = TOUCH_STATES.UNKNOWN;
      auditTouch(touch, TOUCH_STATES.UNKNOWN, "provider_receipt_still_unknown");
      return;
    }
    transitionTouch(touch.state, TOUCH_STATES.UNKNOWN);
    touch.state = TOUCH_STATES.UNKNOWN;
    auditTouch(touch, TOUCH_STATES.UNKNOWN, "provider_receipt_unknown");
    return;
  }
  if (["failed", "rejected", "denied"].includes(state)) {
    markTouchFailed(task, touch, result);
    return;
  }
  if (touch.state === TOUCH_STATES.DELIVERY_CHECKING) {
    if (!["delivered", "sent", "success", "succeeded"].includes(state)) {
      auditTouch(touch, TOUCH_STATES.UNKNOWN, "provider_receipt_not_final");
      touch.state = TOUCH_STATES.UNKNOWN;
      return;
    }
    transitionTouch(touch.state, TOUCH_STATES.DELIVERED);
    touch.state = TOUCH_STATES.DELIVERED;
    auditTouch(touch, TOUCH_STATES.DELIVERED, "provider_delivered");
    task.counters.delivered += 1;
    task.counters.sent += 1;
    return;
  }
  const finalState = ["delivered", "sent", "success", "succeeded"].includes(state);
  if (touch.state === TOUCH_STATES.SUBMITTED) transitionTouch(touch.state, TOUCH_STATES.ACCEPTED);
  touch.state = TOUCH_STATES.ACCEPTED;
  auditTouch(touch, TOUCH_STATES.ACCEPTED, finalState ? "provider_accepted_and_delivered" : "provider_accepted");
  if (finalState) {
    transitionTouch(touch.state, TOUCH_STATES.DELIVERED);
    touch.state = TOUCH_STATES.DELIVERED;
    auditTouch(touch, TOUCH_STATES.DELIVERED, "provider_delivered");
    task.counters.delivered += 1;
    task.counters.sent += 1;
    return;
  }
  task.counters.accepted = Number(task.counters.accepted || 0) + 1;
}

function emitReceipt(task, touch, state, result, eventSink = null) {
  const event = {
    touchId: touch.touchId,
    requestId: touch.requestId,
    state,
    providerMessageId: result?.message_id || result?.messageId || result?.id || null
  };
  const existing = task.events.some((item) => item.type === EVENT_TYPES.TOUCH_RECEIPT && item.payload?.touchId === touch.touchId && item.payload?.state === state);
  if (existing) return;
  const snapshot = taskStateSnapshot(task);
  const eventRecord = {
    eventId: `acq:${task.key}:receipt:${touch.touchId}:${state}`,
    eventKey: `receipt:${touch.touchId}:${state}`,
    seq: ++task.eventSeq,
    type: EVENT_TYPES.TOUCH_RECEIPT,
    occurredAt: new Date().toISOString(),
    agentId: task.context.agentId,
    taskId: task.context.taskId,
    taskRunId: task.context.taskRunId,
    conversationId: task.context.conversationId,
    accountId: task.context.accountId,
    tenantId: task.context.tenantId,
    ...snapshot,
    payload: { ...event, ...snapshot }
  };
  task.events.push(eventRecord);
  try { eventSink?.(clone(eventRecord)); } catch { /* event delivery must not stop task execution */ }
  return eventRecord;
}

function taskStateSnapshot(task) {
  const taskState = String(task?.state || "").toLowerCase();
  const runtimeState = taskState === "configuring" ? "CREATED"
    : taskState === "degraded" ? "RUNNING"
      : taskState === "running" ? "RUNNING"
        : taskState === "paused" ? "PAUSED"
          : taskState === "error" ? "FAILED"
            : taskState === "completed" ? "SUCCEEDED"
            : taskState === "stopped" ? "CANCELLED" : null;
  const health = taskState === "error" ? "ERROR" : taskState === "stopped" && task?.health === "OK"
    ? "UNKNOWN" : task?.health || "UNKNOWN";
  return { taskState: taskState || null, runtimeState, health };
}

function markTouchFailed(task, touch, error) {
  if ([TOUCH_STATES.APPROVED, TOUCH_STATES.PENDING_APPROVAL, TOUCH_STATES.RETRY_QUEUED].includes(touch.state)) {
    transitionTouch(touch.state, TOUCH_STATES.STOPPED);
    touch.state = TOUCH_STATES.STOPPED;
    touch.lastError = serializeError(error);
    auditTouch(touch, TOUCH_STATES.STOPPED, "send_not_attempted");
    return;
  }
  if (touch.state === TOUCH_STATES.SUBMITTED || touch.state === TOUCH_STATES.DELIVERY_CHECKING) transitionTouch(touch.state, TOUCH_STATES.FAILED);
  touch.state = TOUCH_STATES.FAILED;
  touch.lastError = serializeError(error);
  auditTouch(touch, TOUCH_STATES.FAILED, "provider_failed");
}

function markTouchUnknown(task, touch, error, reason = "send_response_lost") {
  if (touch.state === TOUCH_STATES.SUBMITTED || touch.state === TOUCH_STATES.DELIVERY_CHECKING) {
    transitionTouch(touch.state, TOUCH_STATES.UNKNOWN);
  }
  touch.state = TOUCH_STATES.UNKNOWN;
  touch.lastError = serializeError(error);
  auditTouch(touch, TOUCH_STATES.UNKNOWN, reason);
}

function normalizeCloudState(snapshot = {}) {
  const state = String(snapshot.state || snapshot.display_state || snapshot.displayState || snapshot.session_state || "").toLowerCase();
  const authLost = ["logged_out", "logout", "unauthorized", "authorization_expired"].includes(String(snapshot.login_state || snapshot.loginState || "").toLowerCase());
  if (snapshot.provisioning === true || ["starting", "provisioning", "initializing", "booting"].includes(state)) return { state: CLOUD_STATES.PROVISIONING, authLost };
  if (["connecting", "recovering"].includes(state)) return { state: state === "recovering" ? CLOUD_STATES.RECOVERING : CLOUD_STATES.CONNECTING, authLost };
  if (snapshot.ok === false || state === "error" || snapshot.error?.code === "DOUYIN_CLOUD_OFFLINE") return { state: CLOUD_STATES.DISCONNECTED, confirmedDisconnect: true, authLost };
  if (authLost) return { state: CLOUD_STATES.DISCONNECTED, authLost: true };
  if (["online", "active", "ready", "logged_in"].includes(state) || snapshot.login_state === "logged_in") return { state: CLOUD_STATES.ONLINE };
  return { state: CLOUD_STATES.CONNECTING, authLost };
}

function isTransient(error) {
  const code = String(error?.code || error?.error?.code || "").toUpperCase();
  const message = String(error?.message || error?.error?.message || "").toLowerCase();
  return TRANSIENT_CODES.has(code)
    || /timeout|timed out|network|connection reset|temporarily unavailable|notification.*(starting|not ready)|cloud.*not ready/.test(message);
}

function serializeError(error) {
  return { code: error?.code || error?.error?.code || "DOUYIN_ACQUISITION_ERROR", message: error?.message || error?.error?.message || String(error), statusCode: error?.statusCode || null };
}

function acquisitionError(message, code, statusCode = 400, details = {}) {
  return Object.assign(new Error(message), { code, statusCode, details });
}

function stable(value) { return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 20); }
function isRecord(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
function defaultSleep(delayMs) { return delayMs ? new Promise((resolve) => setTimeout(resolve, delayMs)) : Promise.resolve(); }

function loadSnapshot(filePath) {
  if (!existsSync(filePath)) return { version: SNAPSHOT_VERSION, tasks: {}, capabilities: {}, leases: {} };
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8"));
    if (parsed?.version !== SNAPSHOT_VERSION || !parsed.tasks || typeof parsed.tasks !== "object" || Array.isArray(parsed.tasks)) throw new Error("invalid snapshot");
    return {
      ...parsed,
      capabilities: parsed.capabilities && typeof parsed.capabilities === "object" && !Array.isArray(parsed.capabilities) ? parsed.capabilities : {},
      leases: parsed.leases && typeof parsed.leases === "object" && !Array.isArray(parsed.leases) ? parsed.leases : {}
    };
  } catch (cause) {
    throw Object.assign(new Error("抖音获客任务持久化文件损坏"), { code: "DOUYIN_ACQUISITION_STATE_CORRUPT", cause });
  }
}

function normalizeCapabilityProbe(value) {
  if (value === true) return { state: "passed", executorReady: true };
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const state = String(value.state || value.status || "").trim().toLowerCase();
  if (!state) return null;
  return { ...clone(value), state, executorReady: value.executorReady === true };
}

function writeSnapshot(filePath, snapshot) {
  const temp = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(temp, `${JSON.stringify(snapshot)}\n`, { encoding: "utf8", mode: 0o600 });
  renameSync(temp, filePath);
}
