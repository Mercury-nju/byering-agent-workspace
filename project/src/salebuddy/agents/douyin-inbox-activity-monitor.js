/**
 * Application-level bridge for the backend inbox runtime.
 *
 * The Agent Square UI is disposable, but the inbox service is long-lived.
 * This monitor keeps a small cursor in the resumable cloud task and records
 * backend events for the office/work history. Runtime events are not DMs.
 */
import { displayAgentName } from "../brand.js";
import { douyinCloudTaskStore } from "./douyin-cloud-state.js";
import { agentActivityJournal, recordAgentActivity } from "./agent-activity-journal.js";

const DEFAULT_AGENT_ID = "mkt-dm-inbox";
const DEFAULT_INTERVAL_MS = 5000;
const MAX_EVENT_KEYS = 200;

function eventKey(event = {}) {
  return [
    event.type || "unknown",
    event.messageId || event.message_id || "",
    event.at || event.createdAt || "",
    event.error?.code || ""
  ].join("|");
}

export function formatDouyinInboxEvent(event = {}) {
  const type = event.type;
  if (type === "agent.started") return "私信承接已经在后台运行，我会继续监听新会话。";
  if (type === "message.received") return `收到来自${event.message?.nickname || "抖音用户"}的新私信，我正在分析需求。`;
  if (type === "reply.handoff" || type === "reply.drafted") return "这条会话命中人工接管边界，已停止自动回复并保留完整上下文。";
  if (type === "reply.sent") return "一条私信回复已经发送，结果已记录。";
  if (type === "reply.error") return `回复处理遇到异常：${event.error?.message || "暂时无法生成或发送回复"}。`;
  if (type === "poll.error") return `后台读取新私信时遇到异常：${event.error?.message || "连接暂时不可用"}，我会继续重试。`;
  if (type === "agent.stopped") return "私信承接已经停止，已有会话和处理记录仍会保留。";
  if (type === "poll.completed" && Number(event.count) > 0) return `我刚处理了 ${event.count} 条新私信，详情和回复状态已经记录。`;
  return null;
}

export function createDouyinInboxActivityMonitor({
  gateway = null,
  fetchImpl = globalThis.fetch,
  taskStore = douyinCloudTaskStore,
  agentId = DEFAULT_AGENT_ID,
  baseUrl = "http://127.0.0.1:6681",
  intervalMs = DEFAULT_INTERVAL_MS,
  now = () => new Date().toISOString(),
  journal = agentActivityJournal
} = {}) {
  let disposed = false;
  let inFlight = false;
  let timer = null;

  async function send(text, { activityKey = `inbox-message:${text}`, createdAt = null } = {}) {
    if (!text) return false;
    const event = { type: "activity", activityKey };
    recordAgentActivity(agentId, event, {
      journal,
      text,
      createdAt: createdAt || undefined,
      fromName: displayAgentName({ agentType: agentId })
    });
    return true;
  }

  async function sync() {
    if (disposed || inFlight || typeof fetchImpl !== "function") return false;
    const task = taskStore.get(agentId);
    if (!task || task.phase !== "running") return false;
    inFlight = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const url = `${String(baseUrl).replace(/\/$/, "")}/v1/douyin/inbox-agent/status?agentId=${encodeURIComponent(agentId)}`;
      const response = await fetchImpl(url, { headers: { accept: "application/json" }, signal: controller.signal });
      const status = await response.json().catch(() => null);
      if (!response.ok || status?.ok === false) throw new Error(status?.error?.message || `私信承接状态返回 HTTP ${response.status}`);
      const events = Array.isArray(status?.events) ? status.events : [];
      const seen = new Set(Array.isArray(task.inboxActivityKeys) ? task.inboxActivityKeys : []);
      const initialized = task.inboxActivityInitialized === true;
      if (!initialized) {
        const running = status?.runtime?.running === true;
        const confirmed = await send(running
          ? "我已经确认私信承接仍在后台运行，历史状态已接续。"
          : "我检查到私信承接当前没有运行，稍后需要重新启动。 ", {
            activityKey: `inbox-runtime:${task.inboxStartedAt || task.startedAt || task.updatedAt || "current"}:${running ? "running" : "stopped"}`
          });
        if (!confirmed) return false;
        for (const event of events) {
          const key = eventKey(event);
          const text = formatDouyinInboxEvent(event);
          if (key && text) {
            recordAgentActivity(agentId, { ...event, activityKey: `inbox-event:${key}` }, {
              journal,
              text,
              createdAt: event.at || event.createdAt || undefined,
              fromName: displayAgentName({ agentType: agentId })
            });
          }
          seen.add(key);
        }
        taskStore.update(agentId, {
          inboxActivityInitialized: true,
          inboxActivityKeys: [...seen].filter(Boolean).slice(-MAX_EVENT_KEYS),
          inboxLastCheckedAt: now()
        });
        return true;
      }
      for (const event of events) {
        const key = eventKey(event);
        if (seen.has(key)) continue;
        const text = formatDouyinInboxEvent(event);
        if (text && !(await send(text, {
          activityKey: `inbox-event:${key}`,
          createdAt: event.at || event.createdAt || null
        }))) continue;
        if (key) seen.add(key);
      }
      taskStore.update(agentId, {
        inboxActivityInitialized: true,
        inboxActivityKeys: [...seen].slice(-MAX_EVENT_KEYS),
        inboxLastCheckedAt: now()
      });
      return true;
    } catch (error) {
      console.warn("[SaleBuddy] Douyin inbox status monitor failed", error);
      return false;
    } finally {
      clearTimeout(timeout);
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
