/**
 * agents/work-live.js
 * 在制工作实时源：任务引擎（task-runner）把每个成员当前在干什么写进来，
 * 云电脑快照（cloud-desktop）据此渲染真实工作画面——
 * 任务跑到哪一步，对应成员的云电脑就显示他在干的这件事。
 * 纯内存（模块级），随页面刷新清空；成员无在制工作时由云电脑显示空状态。
 * 同一个 Agent 可以同时为不同抖音账号执行不同任务，因此运行记录必须以
 * Agent + task/run/account 作为主键，而不能只按 Agent 覆盖。
 * 每次变化同时带有递增序号，供私聊活动流做幂等镜像。
 */

import { normalizeAcquisitionTaskStatus } from "./acquisition-contract.js";
import { DOUYIN_ACQUISITION_ACTIVE_AGENT_IDS } from "./marketplace.js";

const works = new Map(); // workKey -> { agentType, task, phase, projectId, activities: [], state: "working"|"done", artifact }
const listeners = new Set();
let sequence = 0;
const ACQUISITION_AGENT_IDS = new Set(DOUYIN_ACQUISITION_ACTIVE_AGENT_IDS);

function acquisitionMetadata(agentType, metadata, progress) {
  if (!ACQUISITION_AGENT_IDS.has(String(agentType || ""))) return metadata;
  const source = metadata && typeof metadata === "object" ? metadata : {};
  const taskState = String(source.taskState || source.acquisitionTaskState || "configuring").toLowerCase();
  const normalized = normalizeAcquisitionTaskStatus(taskState);
  const providerProgress = source.progressSource === "provider" && Number.isFinite(Number(progress));
  return {
    ...source,
    taskId: source.taskId || source.task_id || null,
    taskRunId: source.taskRunId || source.task_run_id || null,
    accountId: source.accountId || source.account_id || null,
    cloudState: source.cloudState || source.cloud_state || null,
    taskState: normalized?.taskState || taskState,
    acquisitionTaskState: normalized?.taskState || taskState,
    retryCount: Math.max(0, Number.isFinite(Number(source.retryCount)) ? Math.floor(Number(source.retryCount)) : 0),
    progressMode: source.progressMode === "provider" && providerProgress ? "provider" : "indeterminate",
    pendingApprovalCount: Math.max(0, Number.isFinite(Number(source.pendingApprovalCount)) ? Math.floor(Number(source.pendingApprovalCount)) : 0)
  };
}

function workScope(metadata = {}) {
  const source = metadata && typeof metadata === "object" ? metadata : {};
  return {
    taskId: String(source.taskId || source.task_id || "").trim(),
    taskRunId: String(source.taskRunId || source.task_run_id || source.runId || "").trim(),
    accountId: String(source.accountId || source.account_id || source.accountKey || "").trim()
  };
}

function workKey(agentType, metadata = {}) {
  const scope = workScope(metadata);
  return [String(agentType || "").trim(), scope.taskId, scope.taskRunId, scope.accountId].join("|");
}

function matchesScope(work, scope = {}) {
  if (!work) return false;
  const workScopeValue = workScope(work.metadata);
  return (!scope.taskId || workScopeValue.taskId === scope.taskId)
    && (!scope.taskRunId || workScopeValue.taskRunId === scope.taskRunId)
    && (!scope.accountId || workScopeValue.accountId === scope.accountId);
}

function latestWork(agentType, scope = {}) {
  const candidates = [...works.values()]
    .filter((work) => work.agentType === agentType && matchesScope(work, scope))
    .sort((left, right) => {
      const leftActive = left.state === "working" ? 1 : 0;
      const rightActive = right.state === "working" ? 1 : 0;
      return rightActive - leftActive || Number(right.updatedAt || right.startedAt || 0) - Number(left.updatedAt || left.startedAt || 0);
    });
  return candidates[0] || null;
}

function resolveWork(agentType, metadata = null) {
  const scope = workScope(metadata || {});
  const scoped = scope.taskId || scope.taskRunId || scope.accountId;
  if (scoped) return latestWork(agentType, scope);
  return latestWork(agentType);
}

function persistWork(work, previousKey = null) {
  const key = workKey(work.agentType, work.metadata);
  if (previousKey && previousKey !== key) works.delete(previousKey);
  works.set(key, work);
  return key;
}

function snapshotWork(work, agentType = null) {
  if (!work) return null;
  const snapshot = { ...work, activities: [...(work.activities || [])] };
  snapshot.metadata = acquisitionMetadata(agentType || snapshot.agentType, snapshot.metadata, snapshot.progress);
  const normalized = normalizeAcquisitionTaskStatus(snapshot.metadata?.taskState);
  if (normalized) Object.assign(snapshot, {
    taskId: snapshot.metadata.taskId,
    taskRunId: snapshot.metadata.taskRunId,
    accountId: snapshot.metadata.accountId,
    cloudState: snapshot.metadata.cloudState,
    taskState: normalized.taskState,
    runtimeState: normalized.runtimeState,
    health: normalized.health,
    retryCount: snapshot.metadata.retryCount,
    pendingApprovalCount: snapshot.metadata.pendingApprovalCount,
    progressMode: snapshot.metadata.progressMode,
    acquisitionTaskState: normalized.taskState
  });
  return snapshot;
}

function notify(agentType, event = null) {
  for (const fn of listeners) {
    try { fn(agentType, event); } catch { /* 单个订阅者异常不影响其他 */ }
  }
}

/** 清空所有在制任务。 */
export function endAllWork() {
  works.clear();
  notify(null, { type: "cleared", sequence: ++sequence });
}

/** 成员开始一个子任务：覆盖同一 Agent 的上一轮状态，保留其他 Agent 的并行任务。 */
export function beginWork(agentType, { task = "", phase = "", projectId = null, progress = 0, metadata = null } = {}) {
  const now = Date.now();
  const normalizedMetadata = acquisitionMetadata(agentType, metadata, progress);
  const work = { agentType, task, phase, projectId, progress: Number.isFinite(Number(progress)) ? Math.max(0, Math.min(100, Number(progress))) : 0, metadata: normalizedMetadata, activities: [], state: "working", artifact: null, startedAt: now, updatedAt: now };
  persistWork(work);
  notify(agentType, { type: "started", sequence: ++sequence, work: snapshotWork(work, agentType) });
}

/** Update the live execution state without fabricating progress. */
export function updateWork(agentType, patch = {}) {
  const work = resolveWork(agentType, patch?.metadata);
  if (!work || !patch || typeof patch !== "object") return;
  const previousKey = workKey(agentType, work.metadata);
  if (patch.phase != null) work.phase = String(patch.phase);
  if (patch.task != null) work.task = String(patch.task);
  if (patch.progress != null && Number.isFinite(Number(patch.progress))) work.progress = Math.max(0, Math.min(100, Number(patch.progress)));
  if (patch.metadata && typeof patch.metadata === "object") {
    work.metadata = { ...(work.metadata || {}), ...patch.metadata };
    if (patch.metadata.acquisitionTaskState && !patch.metadata.taskState) work.metadata.taskState = patch.metadata.acquisitionTaskState;
    if (patch.metadata.taskState && !patch.metadata.acquisitionTaskState) work.metadata.acquisitionTaskState = patch.metadata.taskState;
  }
  work.metadata = acquisitionMetadata(agentType, work.metadata, work.progress);
  work.updatedAt = Date.now();
  persistWork(work, previousKey);
  notify(agentType, { type: "updated", sequence: ++sequence, work: snapshotWork(work, agentType) });
}

/** 追加一条工作动态（成员的发言即工作内容的实时反映）。 */
export function pushActivity(agentType, text, metadata = null) {
  const work = resolveWork(agentType, metadata);
  if (!work) return;
  const message = String(text || "").trim();
  if (!message) return;
  work.activities.push(message);
  if (work.activities.length > 24) work.activities.shift();
  work.updatedAt = Date.now();
  persistWork(work);
  notify(agentType, { type: "activity", sequence: ++sequence, text: message, work: snapshotWork(work, agentType) });
}

/** Report an error while preserving the current work context for subscribers. */
export function reportWorkError(agentType, text, metadata = null) {
  const key = String(agentType || "").trim();
  if (!key) return;
  let work = resolveWork(key, metadata);
  if (!work) {
    const now = Date.now();
    work = { agentType: key, task: "", phase: "", projectId: null, activities: [], state: "working", artifact: null, startedAt: now, updatedAt: now, metadata: acquisitionMetadata(key, metadata, 0) };
    persistWork(work);
  }
  work.updatedAt = Date.now();
  persistWork(work);
  const message = String(text || "工作遇到异常").trim() || "工作遇到异常";
  work.lastError = message;
  // Errors are part of the live work narrative; otherwise the realtime page
  // keeps showing the last successful activity and looks permanently stuck.
  if (work.activities.at(-1) !== message) {
    work.activities.push(message);
    if (work.activities.length > 24) work.activities.shift();
  }
  notify(key, { type: "error", sequence: ++sequence, text: message, work: snapshotWork(work, key) });
}

/** 子任务完成：标记完成并挂上产出物名。 */
export function finishWork(agentType, artifact = null, metadata = null) {
  const work = resolveWork(agentType, metadata);
  if (!work) return;
  work.state = "done";
  work.artifact = artifact;
  work.completedAt = Date.now();
  work.updatedAt = work.completedAt;
  persistWork(work);
  notify(agentType, { type: "completed", sequence: ++sequence, artifact, work: snapshotWork(work, agentType) });
}

/** 读取某成员的在制工作；无则 null（云电脑据此显示空状态）。 */
export function getWork(agentType, metadata = null) {
  return snapshotWork(resolveWork(agentType, metadata), agentType);
}

/** Read all live work entries for the realtime work surface. */
export function listWorks() {
  return [...works.values()]
    .sort((left, right) => Number(right.updatedAt || right.startedAt || 0) - Number(left.updatedAt || left.startedAt || 0))
    .map((work) => snapshotWork(work, work.agentType));
}

/** 项目内读取在制工作；不属于当前项目时视为空闲，避免跨群泄露。 */
export function getWorkForProject(agentType, projectId = null) {
  if (!projectId) return getWork(agentType);
  const work = listWorks().find((item) => item.agentType === agentType && item.projectId === projectId) || null;
  return work ? snapshotWork(work, agentType) : null;
}

/** 是否有任何成员在制（用于判断办公室是否「在跑任务」）。 */
export function hasAnyWork() {
  return works.size > 0;
}

/** 订阅变化（agentType 为 null 表示整体清空），返回退订函数。 */
export function subscribeWork(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
