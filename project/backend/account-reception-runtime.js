import { createHash } from "node:crypto";
import { receptionGoalObjective, receptionResponseStyle, receptionWindow, receptionPrompt } from "../src/salebuddy/agents/account-reception.js";
import { classifyIntent, INBOX_INTENTS, validateReply } from "./douyin-reply-strategy.js";

const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 32);
export function receptionDecision(message, settings, conversation, now) {
  const intent = classifyIntent(message.content);
  if (intent === INBOX_INTENTS.optOut) return { action: "closed", reason: "user_opt_out" };
  if (/转人工|真人|人工客服|找老板/.test(message.content)) return { action: "human", reason: "human_requested" };
  if (["human", "closed"].includes(conversation.mode)) return { action: conversation.mode, reason: "conversation_owned" };
  if (intent === INBOX_INTENTS.complaint || (settings.handoff.price && intent === INBOX_INTENTS.priceQuestion)) return { action: "human", reason: "policy_boundary" };
  const window = receptionWindow(settings, now);
  if (!window.open) return { action: window.reason === "paused" ? "paused" : "away", reason: window.reason };
  if (!settings.knowledge.trim()) return { action: "human", reason: "knowledge_missing" };
  return { action: "reply", reason: "working", intent };
}

export function createReceptionReplyHandler({ store, getOwner, generate, getTaskContext = () => ({}), now = () => Date.now() } = {}) {
  return async function handle({ message, send, active = () => true }) {
    const owner = getOwner();
    if (!owner) throw Object.assign(new Error("当前账号尚未绑定接待配置"), { code: "RECEPTION_ACCOUNT_REQUIRED" });
    const customer = message.secUid || message.conversationId;
    if (!customer || !message.content) return { status: "skipped", reason: "identity_or_content_missing" };
    const current = store.get(owner);
    if (!current.revision) return { status: "deferred", reason: "account_policy_not_saved" };
    const settings = current.settings;
    const conversation = store.conversation(owner, customer);
    const decision = receptionDecision(message, settings, conversation, now());
    const patch = { name: message.nickname || conversation.name, lastMessage: message.content.slice(0, 1000) };
    if (["closed", "human"].includes(decision.action)) {
      store.updateConversation(owner, customer, { ...patch, mode: decision.action });
      return { status: decision.action === "human" ? "handoff" : "skipped", reason: decision.reason };
    }
    if (decision.action === "paused") return { status: "deferred", reason: "account_paused" };
    const ids = message.batchIds || [message.id];
    const deliveryIds = ids.map(id => `message:${customer}:${id}`);
    const requestId = `reception:${hash([owner.tenantId || "local", customer, ids])}`;
    if (store.wasSubmitted(owner, requestId) || deliveryIds.every(id => store.wasSubmitted(owner, id))) return { status: "duplicate", reason: "already_submitted" };
    if (deliveryIds.some(id => store.wasSubmitted(owner, id))) return { status: "deferred", reason: "partially_handled", handledIds: ids.filter((_, index) => store.wasSubmitted(owner, deliveryIds[index])) };
    const check = (away = false) => {
      if (!active()) return false;
      const latest = store.get(owner), chat = store.conversation(owner, customer);
      if (latest.revision !== current.revision || ["human", "closed"].includes(chat.mode)) return false;
      const window = receptionWindow(latest.settings, now());
      return away ? !window.open && window.reason === "outside_hours" : window.open;
    };
    if (decision.action === "away") {
      if (!conversation.awayPeriod) store.updateConversation(owner, customer, { ...patch, awayPeriod: message.id || hash(ids) });
      const period = store.conversation(owner, customer).awayPeriod;
      const awayId = `away:${customer}:${period}`;
      if (settings.schedule.outside === "away" && !store.wasSubmitted(owner, awayId) && check(true)) {
        const reserve = () => check(true) && store.reserve(owner, awayId);
        const result = await send({ secUid: message.secUid, conversationId: message.conversationId, nickname: message.nickname, content: settings.schedule.awayMessage, reqId: awayId }, reserve);
        if (result?.ok === false) throw new Error("离线留言未发送成功");
        if (!result?.cancelled) store.delivered(owner, awayId);
      }
      return { status: "deferred", reason: "outside_hours" };
    }
    const waitMs = settings.habits.mergeSeconds * 1000;
    if (message.receivedAt && now() - message.receivedAt < waitMs) return { status: "deferred", reason: "waiting_for_message_burst" };
    const task = getTaskContext();
    const draft = await generate(message, {
      messageText: message.content,
      reception: settings,
      conversation: { ...conversation, recentMessages: conversation.history || [] },
      context: {
        replyRule: `${receptionPrompt(settings)}\n${conversation.mode === "done" ? "本会话目标已完成，不再重复邀请，只回答新问题。" : ""}`,
        knowledgeContext: settings.knowledge,
        strategy: { objective: `${receptionGoalObjective(settings)}${task.explicitObjective ? `\n本次任务补充目标：${task.explicitObjective}` : ""}`, tone: receptionResponseStyle(settings), approvedClaims: [], handoffRules: ["对方拒绝", "要求人工", "投诉退款", "无法确认的事实"], qualificationQuestions: [] }
      }
    });
    if (!check()) return { status: "deferred", reason: "policy_or_owner_changed" };
    const content = String(draft?.content || (typeof draft === "string" ? draft : "")).trim();
    if (draft?.send === false || !validateReply(content).ok) {
      store.updateConversation(owner, customer, { ...patch, mode: "human" });
      return { status: "handoff", reason: "reply_needs_review" };
    }
    const result = await send({ secUid: message.secUid, conversationId: message.conversationId, nickname: message.nickname, content, reqId: requestId }, () => check() && store.reserveMany(owner, [requestId, ...deliveryIds]));
    if (result?.cancelled) return { status: "deferred", reason: "send_cancelled" };
    if (result?.ok === false) throw new Error("私信发送失败，请核对发送记录");
    store.delivered(owner, requestId);
    const latestConversation = store.conversation(owner, customer);
    store.updateConversation(owner, customer, { ...patch, awayPeriod: null, history: [...(latestConversation.history || []), { role: "user", content: message.content }, { role: "assistant", content }].slice(-20) });
    return { status: "sent", content, result };
  };
}
