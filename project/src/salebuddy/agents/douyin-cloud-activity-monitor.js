/**
 * Background monitor for account-scoped Douyin cloud desktops.
 *
 * It turns remote readiness transitions into durable work history so the
 * office can explain what happened without polluting the Agent conversation.
 */
import { displayAgentName } from "../brand.js";
import { douyinCloudTaskStore, isDouyinCloudProvisioningStatus, isDouyinCloudReadyStatus } from "./douyin-cloud-state.js";
import { agentActivityJournal, recordAgentActivity } from "./agent-activity-journal.js";

const DEFAULT_AGENT_IDS = ["mkt-dm-inbox", "mkt-gold-customer-service", "mkt-cold-writer", "mkt-comment-acquisition", "mkt-find-people"];
const ACQUISITION_AGENT_IDS = new Set(["mkt-comment-acquisition", "mkt-find-people"]);
const DEFAULT_INTERVAL_MS = 5000;

export function cloudStateForStatus(status = {}) {
  const raw = String(status.cloudState || status.cloud_state || status.display_state || status.session_state || status.state || "").toLowerCase();
  if (["provisioning", "starting", "initializing", "booting"].includes(raw)) return "provisioning";
  if (["reconnecting", "connecting"].includes(raw)) return "connecting";
  if (["recovering", "recovery", "retrying"].includes(raw)) return "recovering";
  if (["auth-expired", "auth_expired", "authorization_expired", "auth_required"].includes(raw)) return "auth-expired";
  if (["disconnected", "offline", "closed", "terminated"].includes(raw) || status.worker?.online === false || status.error?.code === "DOUYIN_CLOUD_OFFLINE" || status.code === "DOUYIN_CLOUD_OFFLINE") return "disconnected";
  if (isDouyinCloudReadyStatus(status)) return "online";
  return null;
}

export function createDouyinCloudActivityMonitor({
  gateway = null,
  fetchImpl = globalThis.fetch,
  taskStore = douyinCloudTaskStore,
  agentIds = DEFAULT_AGENT_IDS,
  baseUrl = "http://127.0.0.1:6681",
  intervalMs = DEFAULT_INTERVAL_MS,
  journal = agentActivityJournal
} = {}) {
  let disposed = false;
  let inFlight = false;
  let timer = null;

  function contextFor(current = {}) {
    return Object.fromEntries(Object.entries({
      taskId: current.taskId || current.task?.taskId,
      taskRunId: current.taskRunId || current.task?.taskRunId,
      accountId: current.accountId || current.task?.accountId
    }).filter(([, value]) => value !== null && value !== undefined && value !== ""));
  }

  async function notifyReady(agentId) {
    const current = taskStore.get(agentId);
    if (!current || current.readyMessageSent) return true;
    const text = "该账号的云电脑已经准备好了。你可以点击“继续处理”，回到原来的配置流程完成抖音授权。";
    const activityKey = `cloud-ready:${current.startedAt || current.inboxStartedAt || current.updatedAt || "current"}`;
    recordAgentActivity(agentId, { type: "activity", activityKey }, {
      journal,
      text,
      fromName: displayAgentName({ agentType: agentId })
    });
    taskStore.update(agentId, { phase: "ready", readyMessageSent: true, readyMessageRecordedAt: new Date().toISOString(), readyMessageError: null });
    return true;
  }

  async function notifyError(agentId, status = {}, { cloudState = null } = {}) {
    const current = taskStore.get(agentId);
    if (!current || current.errorMessageSent) return true;
    const code = status?.error?.code || status?.code || "DOUYIN_CLOUD_STATUS_ERROR";
    const text = cloudState === "auth-expired"
      ? "抖音授权已失效，请重新登录后再继续当前任务。"
      : cloudState === "disconnected"
      ? "云电脑状态异常：已确认远端会话断开。当前任务已暂停，正在保留恢复上下文，请稍后重试。"
      : code === "DOUYIN_AGENT_KEY_ROTATED"
      ? "该账号的云电脑执行凭据已更新，旧会话不会继续复用。请回到 Agent 配置页重启云电脑并完成一次授权。"
      : code === "DOUYIN_AGENT_API_KEY_SHARED" || code === "DOUYIN_AGENT_SESSION_SHARED"
      ? "该账号的云电脑执行凭据存在冲突，当前任务已暂停。请重新连接账号后再继续。"
      : code === "DOUYIN_PROVISIONING_TIMEOUT"
      ? "该账号的云电脑启动超过预期时间，旧启动任务可能已卡住。当前任务已暂停，你可以回到 Agent 配置页点击“重启云电脑”。"
      : code === "DOUYIN_MCP_TIMEOUT" || code === "CONTROL_PLANE_TIMEOUT"
      ? "该账号的云电脑启动请求超时，当前任务已暂停。请回到 Agent 配置页检查状态，必要时点击“重启云电脑”。"
      : `云电脑状态异常：${status?.error?.message || "暂时无法确认远端状态"}。当前任务已暂停，请稍后重试。`;
    const activityKey = `cloud-error:${current.startedAt || current.inboxStartedAt || current.updatedAt || "current"}:${code}`;
    recordAgentActivity(agentId, { type: "error", activityKey }, {
      journal,
      text,
      fromName: displayAgentName({ agentType: agentId })
    });
    taskStore.update(agentId, { phase: "error", cloudState: cloudState || "disconnected", errorCode: code, errorMessage: text });
    taskStore.update(agentId, { errorMessageSent: true, errorMessageRecordedAt: new Date().toISOString(), errorMessageError: null });
    return true;
  }

  async function check(agentId) {
    const task = taskStore.get(agentId);
    if (!task || task.phase !== "provisioning" || task.readyMessageSent) return false;
    const acquisition = ACQUISITION_AGENT_IDS.has(agentId);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const url = `${String(baseUrl).replace(/\/$/, "")}/v1/douyin/mcp/status?agentId=${encodeURIComponent(agentId)}`;
      const response = await fetchImpl(url, { headers: { accept: "application/json" }, signal: controller.signal });
      const status = await response.json().catch(() => null);
      const cloudState = cloudStateForStatus(status || {});
      if (cloudState) taskStore.update(agentId, { cloudState });
      if (!response.ok || status?.ok === false) {
        const code = status?.error?.code || status?.code || "";
        if (acquisition && (cloudState === "auth-expired" || ["DOUYIN_AUTH_EXPIRED", "DOUYIN_AUTHORIZATION_REQUIRED", "AUTH_FAIL"].includes(code))) {
          return notifyError(agentId, status, { cloudState: "auth-expired" });
        }
        if (acquisition && ["DOUYIN_MCP_TIMEOUT", "CONTROL_PLANE_TIMEOUT", "DOUYIN_PROVISIONING_TIMEOUT"].includes(code)) {
          taskStore.update(agentId, { cloudState: "recovering", retryCount: Number(task.retryCount || 0) + 1, lastCloudError: status?.error || status });
          return true;
        }
        if (acquisition && cloudState === "disconnected") return notifyError(agentId, status, { cloudState });
        if (["DOUYIN_AGENT_KEY_ROTATED", "DOUYIN_AGENT_API_KEY_SHARED", "DOUYIN_AGENT_SESSION_SHARED", "DOUYIN_PROVISIONING_TIMEOUT", "DOUYIN_MCP_TIMEOUT", "CONTROL_PLANE_TIMEOUT"].includes(code)) {
          return notifyError(agentId, status);
        }
        return false;
      }
      if (cloudState === "disconnected") return notifyError(agentId, status, { cloudState });
      if (["provisioning", "connecting", "recovering"].includes(cloudState) || isDouyinCloudProvisioningStatus(status)) return true;
      if (!isDouyinCloudReadyStatus(status)) return false;
      return notifyReady(agentId);
    } catch {
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function sync() {
    if (disposed || inFlight || typeof fetchImpl !== "function") return false;
    inFlight = true;
    try {
      let changed = false;
      for (const agentId of [...new Set(agentIds || [])]) changed = (await check(agentId)) || changed;
      return changed;
    } finally {
      inFlight = false;
    }
  }

  function start() {
    if (timer || disposed) return monitor;
    void sync();
    timer = setInterval(() => { void sync(); }, Math.max(1000, Number(intervalMs) || DEFAULT_INTERVAL_MS));
    return monitor;
  }

  function dispose() {
    disposed = true;
    clearInterval(timer);
    timer = null;
  }

  const monitor = { sync, start, dispose };
  return monitor;
}
