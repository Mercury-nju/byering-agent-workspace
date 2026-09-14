/**
 * Durable-feeling Agent activity inbox.
 *
 * Work-live remains the source of truth for UI state. Activity events are
 * journaled for the office and work history; they are not conversation turns
 * unless an event explicitly opts in to delivery.
 */
import { displayAgentName } from "../brand.js";
import { subscribeWork } from "./work-live.js";
import { activityEventKey, agentActivityJournal, recordAgentActivity } from "./agent-activity-journal.js";

const MAX_PENDING_EVENTS = 100;
let feedInstanceSequence = 0;

function quote(value) {
  const text = String(value || "").trim();
  return text ? `「${text}」` : "";
}

const ACQUISITION_AGENT_IDS = new Set(["mkt-comment-acquisition", "mkt-find-people"]);
const ACQUISITION_TYPES = new Set([
  "authorization", "access.authorization.requested", "access.authorization.granted", "access.authorization.cancelled", "access.authorization.failed",
  "cloud_lifecycle", "scan_window", "candidates_found", "intent_decision", "risk_decision", "touch_drafted", "touch_approved",
  "touch_submitted", "touch_receipt", "outreach.accepted", "outreach.sent", "reply.sent", "reply_received", "retry", "pause", "resume", "stop"
]);

function acquisitionEventType(event = {}) {
  return String(event.acquisitionType || event.eventType || event.type || "").trim().toLowerCase();
}

function isAcquisitionEvent(agentType, event = {}) {
  return ACQUISITION_AGENT_IDS.has(agentType) || ACQUISITION_TYPES.has(acquisitionEventType(event)) || Boolean(event.acquisition === true || event.metadata?.acquisition === true);
}

function value(event, ...keys) {
  for (const key of keys) {
    const parts = key.split(".");
    let current = event;
    for (const part of parts) current = current?.[part];
    if (current !== undefined && current !== null && current !== "") return current;
  }
  return null;
}

function countText(event) {
  const raw = value(event, "count", "candidateCount", "data.count", "payload.count");
  const count = raw == null ? NaN : Number(raw);
  return Number.isFinite(count) ? `共 ${count} 条` : "看到的内容已经留好了";
}

function formatAcquisitionMessage(event = {}) {
  const type = acquisitionEventType(event);
  const state = String(value(event, "state", "status", "receiptState", "data.state", "payload.state") || "").toLowerCase();
  const reason = value(event, "reason", "error.message", "error.code", "error_code", "code", "message", "text");
  if (type === "authorization" || type.startsWith("access.authorization.")) {
    if (type.endsWith("requested") || state === "requested") return "先帮我连上你的抖音账号，连好后才能继续。";
    if (type.endsWith("granted") || type.endsWith("resolved") || state === "granted") return "账号连好了，可以继续了。";
    if (type.endsWith("cancelled") || state === "cancelled") return "你取消了账号连接，这次先不继续。";
    if (type.endsWith("failed") || state === "failed") return `抖音账号授权失败${reason ? `：${reason}` : ""}，外部动作已暂停。`;
  }
  if (type === "cloud_lifecycle" || type === "cloud" || type === "agent.stage.started") {
    const labels = { provisioning: "启动中", connecting: "连接中", recovering: "恢复中", online: "已上线", disconnected: "已断开" };
    return `云电脑${labels[state] || "状态有变化"}${state === "disconnected" ? "，暂时看不到画面了。" : "。"}`;
  }
  if (type === "scan_window" || type === "lead.source.synced" || type === "scan.completed") return `这一轮的新评论和互动看完了，${countText(event)}。`;
  if (type === "candidates_found" || type === "lead.candidate" || type === "lead.qualified") return `找到一些值得了解的人，${countText(event)}，接下来看看他们具体需要什么。`;
  if (type === "intent_decision") return `这些人的需求我看过了${reason ? `：${reason}` : "，判断依据已经留好了"}。`;
  if (type === "risk_decision") return `能不能发这条消息，已经检查过了${reason ? `：${reason}` : ""}。`;
  if (type === "touch_drafted" || type === "outreach.ready" || type === "artifact.created") return "这条消息准备好了，接下来会按你设定的发送规则处理。";
  if (type === "touch_approved" || type === "approval.requested" || type === "approval.resolved") {
    if (state === "rejected" || event.approved === false || event.decision === "rejected") return "触达审批未通过，未发送这条消息。";
    if (state === "approved" || event.approved === true || event.decision === "approved") return "触达审批已批准，接下来按批准内容进入发送。";
    return "这条消息还在检查，暂时没有发送。";
  }
  if (type === "touch_submitted" || type === "outreach.sending" || type === "outreach.scheduled") return "正在发这条私信，还在等抖音确认结果。";
  if (type === "outreach.accepted") return "抖音已经接受发送请求，还在等最终结果。";
  if (type === "reply.sent") return "私信回复已经发出去了。";
  if (type === "touch_receipt" || type === "delivery.checking" || type === "outreach.sent" || type === "outreach.failed") {
    if (["delivered", "sent", "success"].includes(state) || type === "outreach.sent") return "这条私信发出去了。";
    if (["failed", "error"].includes(state) || type === "outreach.failed") return `平台回执显示触达失败${reason ? `：${reason}` : ""}，可以重试。`;
    return "抖音还没确认这条私信是否发出，暂时不能算发送成功。";
  }
  if (type === "reply_received" || type === "lead.replied") return "有人回复了，消息已经记下来了。";
  if (type === "retry" || type === "retry_started" || type === "task.retrying") return "这次没发成，已经安排重试，先等这次的结果。";
  if (type === "pause" || type === "task.paused") return "任务已暂停，未继续执行新的采集或触达动作。";
  if (type === "resume" || type === "task.resumed") return "继续了，我会按之前确定的要求往下做。";
  if (type === "stop" || type === "task.stopped" || type === "task.cancelled") return "任务已停止，后续采集和触达不会继续。";
  if (type === "error" || type === "task.failed") return `这一步没做成${reason ? `：${reason}` : ""}。已经做好的部分会保留。`;
  return null;
}

export function formatAgentActivityMessage(agentType, event = {}) {
  if (isAcquisitionEvent(agentType, event)) {
    const acquisitionText = formatAcquisitionMessage(event);
    if (acquisitionText) return acquisitionText;
  }
  const type = event?.type;
  const work = event?.work || {};
  if (type === "started") {
    const task = quote(work.task) || "当前任务";
    const phase = String(work.phase || "准备执行").trim();
    return `我开始处理${task}，现在先${phase}。`;
  }
  if (type === "activity") {
    const text = String(event.text || "").trim();
    return text || null;
  }
  if (type === "agent.stage.handoff.ready") {
    const next = Array.isArray(event.handoff?.toAgentIds) ? event.handoff.toAgentIds.length : 0;
    return next
      ? "这一阶段已经完成，结果和判断依据已交给下一位同事，后面不会再让你重复说明。"
      : "这一阶段已经完成，结果和判断依据已经留好。";
  }
  if (type === "updated") {
    const phase = String(work.phase || "执行中").trim();
    const progressMode = work.metadata?.progressMode;
    if (progressMode === "indeterminate") return `我正在${phase}。`;
    const progress = Number(work.progress);
    return Number.isFinite(progress) && progress > 0
      ? `我正在${phase}，当前进度 ${Math.round(progress)}%。`
      : `我正在${phase}。`;
  }
  if (type === "completed") {
    const artifact = quote(event.artifact);
    return artifact ? `做好了，${artifact}已经整理好了。你可以先看看，我们再聊下一步。` : "这一步做好了，结果已经留好了。接下来有什么想调整的，可以继续聊。";
  }
  if (type === "error") {
    const text = String(event.text || "工作遇到异常").trim();
    return `我遇到一个问题：${text}。我先停在这里，等你确认后再继续。`;
  }
  return null;
}

export function shouldDeliverAgentActivity(event = {}) {
  return event.deliverToConversation === true || event.metadata?.deliverToConversation === true;
}

export function createAgentActivityFeed({
  subscribe = subscribeWork,
  maxPending = MAX_PENDING_EVENTS,
  journal = agentActivityJournal,
  deliverToConversation = false
} = {}) {
  let gateway = null;
  let disposed = false;
  let draining = false;
  let gatewayUnsubscribe = () => {};
  const pending = [];
  const queued = new Set();
  const delivered = new Set();
  const sending = new Set();
  const lastUpdateNarrative = new Map();
  const deliveryOwner = `feed-${++feedInstanceSequence}`;

  const prepareEvent = (agentType, event) => {
    if (!agentType || !event || event.type === "cleared") return { key: null, text: null };
    const key = activityEventKey(agentType, event);
    const text = formatAgentActivityMessage(agentType, event);
    if (event.type === "updated") {
      if (lastUpdateNarrative.get(agentType) === text) return { key, text: null };
      lastUpdateNarrative.set(agentType, text);
    } else if (["started", "activity", "completed", "error"].includes(event.type)) {
      lastUpdateNarrative.delete(agentType);
    }
    if (text) {
      recordAgentActivity(agentType, event, {
        journal,
        text,
        fromName: displayAgentName({ agentType }),
        createdAt: event.occurredAt || event.createdAt
      });
    }
    return { key, text };
  };

  const queueEvent = (agentType, event) => {
    const key = activityEventKey(agentType, event);
    if (!agentType || !event || event.type === "cleared" || queued.has(key) || delivered.has(key)) return;
    queued.add(key);
    pending.push({ agentType, event, key });
    while (pending.length > Math.max(1, Number(maxPending) || MAX_PENDING_EVENTS)) {
      const removed = pending.shift();
      if (removed) queued.delete(removed.key);
    }
  };

  const send = async (agentType, event, key = activityEventKey(agentType, event), preparedText = null) => {
    if (disposed || !gateway?.action || !agentType) return false;
    if (delivered.has(key) || sending.has(key)) return true;
    const text = preparedText || prepareEvent(agentType, event).text;
    if (!text) return false;
    const claim = typeof journal.claimDelivery === "function"
      ? journal.claimDelivery(key, { owner: deliveryOwner })
      : true;
    if (!claim) {
      return false;
    }
    sending.add(key);
    let sent = false;
    try {
      const taskId = event.taskId || event.task_id || event.metadata?.taskId || event.work?.metadata?.taskId;
      const taskRunId = event.taskRunId || event.task_run_id || event.run_id || event.metadata?.taskRunId || event.work?.metadata?.taskRunId;
      const conversationId = event.conversationId || event.conversation_id || event.metadata?.conversationId || event.work?.metadata?.conversationId;
      const accountId = event.accountId || event.account_id || event.metadata?.accountId;
      const eventId = event.eventId || event.event_id || event.metadata?.eventId;
      const sequence = event.sequence ?? event.seq ?? event.metadata?.sequence;
      const context = {
        ...(taskId ? { taskId } : {}),
        ...(taskRunId ? { taskRunId } : {}),
        ...(conversationId ? { conversationId } : {}),
        ...(accountId ? { accountId } : {}),
        ...(eventId ? { eventId } : {}),
        ...(sequence !== undefined && sequence !== null ? { sequence } : {})
      };
      const result = await gateway.action("dm.message.send", {
        agentType,
        from: agentType,
        fromName: displayAgentName({ agentType }),
        text,
        ...context,
        metadata: {
          ...(event.metadata && typeof event.metadata === "object" ? event.metadata : {}),
          source: "agent-activity",
          activityKey: key,
          ...context
        }
      });
      if (result?.accepted === false || result?.ok === false) {
        throw new Error(result?.message || "Agent 对话消息未被网关接受");
      }
      delivered.add(key);
      sent = true;
      journal.completeDelivery?.(key, { owner: deliveryOwner });
      return true;
    } catch (error) {
      queueEvent(agentType, event);
      if (event.type === "updated") lastUpdateNarrative.delete(agentType);
      console.warn("[SaleBuddy] agent activity message unavailable", error);
      return false;
    } finally {
      if (!sent) journal.releaseDelivery?.(key, { owner: deliveryOwner });
      sending.delete(key);
    }
  };

  const drain = async () => {
    if (draining || disposed || !gateway?.action) return;
    draining = true;
    try {
      const attempts = pending.length;
      let attempted = 0;
      while (pending.length && attempted < attempts && !disposed && gateway?.action) {
        const item = pending.shift();
        if (!item) continue;
        queued.delete(item.key);
        attempted += 1;
        await send(item.agentType, item.event, item.key, formatAgentActivityMessage(item.agentType, item.event));
      }
    } finally {
      draining = false;
    }
  };

  const handle = (agentType, event) => {
    if (!agentType || !event || event.type === "cleared" || disposed) return;
    const { key, text } = prepareEvent(agentType, event);
    if (!text) return;
    if (!deliverToConversation && !shouldDeliverAgentActivity(event)) return;
    if (!gateway?.action) queueEvent(agentType, event);
    else void send(agentType, event, key, text);
  };
  const unsubscribe = typeof subscribe === "function" ? subscribe(handle) : () => {};

function handleGatewayEvent(event = {}) {
    const agentType = event.agentId || event.agent_id || event.metadata?.agentId || event.payload?.agentId;
    if (!agentType || !isAcquisitionEvent(agentType, event)) return;
    const rawType = String(event.type || "");
    const typeMap = {
      ACCESS_REQUIRED: "access.authorization.requested",
      ACCESS_GRANTED: "access.authorization.granted",
      ACCESS_CANCELLED: "access.authorization.cancelled",
      TASK_PAUSED: "pause",
      TASK_RESUMED: "resume",
      RETRY_STARTED: "retry",
      LEAD_SOURCE_SYNCED: "scan_window",
      LEAD_CANDIDATE: "candidates_found",
      LEAD_QUALIFIED: "candidates_found",
      LEAD_REPLIED: "reply_received",
      OUTREACH_READY: "touch_drafted",
      OUTREACH_SCHEDULED: "touch_submitted",
      OUTREACH_SENDING: "touch_submitted",
      OUTREACH_SENT: "touch_receipt",
      OUTREACH_FAILED: "touch_receipt",
      DELIVERY_CHECKING: "touch_receipt",
      APPROVAL_REQUESTED: "touch_approved",
      APPROVAL_RESOLVED: "touch_approved",
      RUN_ERROR: "error"
    };
    const mapped = {
      ...event,
      type: event.acquisitionType || typeMap[rawType] || event.type,
      eventId: event.eventId || event.event_id || event.metadata?.eventId || event.metadata?.event_id,
      sequence: event.sequence ?? event.seq ?? event.metadata?.sequence ?? event.metadata?.seq,
      taskId: event.taskId || event.task_id,
      taskRunId: event.taskRunId || event.task_run_id || event.run_id || event.metadata?.taskRunId || event.metadata?.task_run_id,
      conversationId: event.conversationId || event.conversation_id || event.metadata?.conversationId || event.metadata?.conversation_id,
      accountId: event.accountId || event.account_id,
      metadata: { ...(event.metadata || {}), acquisition: true }
    };
    handle(agentType, mapped);
  }

  return {
    attachGateway(nextGateway) {
      gatewayUnsubscribe?.();
      gateway = nextGateway || null;
      gatewayUnsubscribe = gateway?.on?.("ag_ui_event", handleGatewayEvent) || (() => {});
      void drain();
      return this;
    },
    emit(agentType, event) {
      const { key, text } = prepareEvent(agentType, event);
      if (!text) return Promise.resolve(false);
      if (!deliverToConversation && !shouldDeliverAgentActivity(event)) return Promise.resolve(false);
      if (!gateway?.action) {
        queueEvent(agentType, event);
        return Promise.resolve(false);
      }
      return send(agentType, event, key, text);
    },
    flush: drain,
    dispose() {
      disposed = true;
      pending.length = 0;
      queued.clear();
      gatewayUnsubscribe?.();
      unsubscribe?.();
    }
  };
}

const agentActivityFeed = createAgentActivityFeed();

export function attachAgentActivityGateway(gateway) {
  agentActivityFeed.attachGateway(gateway);
  return agentActivityFeed;
}

export { agentActivityFeed };
export { isAcquisitionEvent, formatAcquisitionMessage, ACQUISITION_AGENT_IDS };
