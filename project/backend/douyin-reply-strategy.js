const DEFAULT_OBJECTIVE = "先解决用户当前问题，再把对话推进到可跟进的下一步，不强行销售";
const DEFAULT_TONE = "专业、简短、自然，像一个懂业务的人在回复";
const DEFAULT_KNOWLEDGE = "";

export const INBOX_INTENTS = Object.freeze({
  greeting: "greeting",
  productQuestion: "product_question",
  priceQuestion: "price_question",
  purchaseIntent: "purchase_intent",
  informationRequest: "information_request",
  complaint: "complaint",
  optOut: "opt_out",
  unclear: "unclear"
});

export const INBOX_ACTIONS = Object.freeze({
  welcome: "welcome",
  answer: "answer",
  qualify: "qualify",
  handoff: "handoff",
  stop: "stop",
  clarify: "clarify"
});

export function createReplyStrategy(input = {}) {
  const strategy = input && typeof input === "object" ? input : {};
  return {
    objective: text(strategy.objective) || DEFAULT_OBJECTIVE,
    continuousConversion: strategy.continuousConversion === true,
    tone: text(strategy.tone) || DEFAULT_TONE,
    knowledge: text(strategy.knowledge || strategy.businessKnowledge) || DEFAULT_KNOWLEDGE,
    approvedClaims: stringList(strategy.approvedClaims),
    handoffRules: stringList(strategy.handoffRules),
    qualificationQuestions: stringList(strategy.qualificationQuestions)
  };
}

export function planReply(message, { strategy = createReplyStrategy(), conversation = null } = {}) {
  const content = text(message?.content);
  const intent = classifyIntent(content);
  const stage = conversation?.stage || (conversation?.messageCount ? "active" : "new");
  if (stage === "closed") return { reply: false, intent, stage, action: INBOX_ACTIONS.stop, reason: "conversation_closed" };
  if (intent === INBOX_INTENTS.optOut) {
    return { reply: false, intent, stage, action: INBOX_ACTIONS.stop, reason: "user_opt_out" };
  }
  if (intent === INBOX_INTENTS.complaint) {
    return { reply: true, intent, stage, action: INBOX_ACTIONS.handoff, requiresHandoff: true, reason: "complaint_handoff" };
  }
  if (intent === INBOX_INTENTS.priceQuestion) {
    return { reply: true, intent, stage, action: INBOX_ACTIONS.answer, requiresHandoff: true, reason: "price_requires_approved_info" };
  }
  if (intent === INBOX_INTENTS.purchaseIntent) {
    return { reply: true, intent, stage, action: INBOX_ACTIONS.qualify, requiresHandoff: !strategy.continuousConversion, reason: strategy.continuousConversion ? "purchase_qualification" : "purchase_handoff" };
  }
  if (intent === INBOX_INTENTS.greeting) {
    return { reply: true, intent, stage, action: stage === "new" ? INBOX_ACTIONS.welcome : INBOX_ACTIONS.clarify, reason: "greeting" };
  }
  if (intent === INBOX_INTENTS.productQuestion || intent === INBOX_INTENTS.informationRequest) {
    return { reply: true, intent, stage, action: INBOX_ACTIONS.answer, reason: "answer_with_approved_knowledge" };
  }
  return { reply: true, intent, stage, action: INBOX_ACTIONS.clarify, reason: "unclear_need_clarification" };
}

export function classifyIntent(content) {
  const value = text(content);
  if (!value) return INBOX_INTENTS.unclear;
  if (/(不要再发|不要再联系|别联系|不需要了|退订|拉黑|举报|取消订阅)/i.test(value)) return INBOX_INTENTS.optOut;
  if (/(投诉|被骗|骗人|退款|退货|售后|坏了|不满意|举报)/i.test(value)) return INBOX_INTENTS.complaint;
  if (/(多少钱|价格|报价|优惠|折扣|怎么收费|费用)/i.test(value)) return INBOX_INTENTS.priceQuestion;
  if (/(购买|买一个|下单|怎么买|怎么订|想要|我要|发货|付款)/i.test(value)) return INBOX_INTENTS.purchaseIntent;
  if (/(资料|参数|规格|尺寸|地址|链接|介绍|详情|怎么用|功能|区别|适合)/i.test(value)) return INBOX_INTENTS.productQuestion;
  if (/(案例|效果|服务|合作|联系|电话|微信|联系方式)/i.test(value)) return INBOX_INTENTS.informationRequest;
  if (/^(你好|您好|嗨|哈喽|在吗|有人吗|hello|hi)[！!。,.，？?\s]*$/i.test(value)) return INBOX_INTENTS.greeting;
  return INBOX_INTENTS.unclear;
}

export function conversationForState(state, message) {
  const key = message?.conversationId || message?.nickname || message?.secUid || "unknown";
  const conversations = state?.conversations && typeof state.conversations === "object" ? state.conversations : {};
  return conversations[key] || { key, messageCount: 0, stage: "new", lastIntent: null, lastAction: null, recentMessages: [] };
}

export function updateConversation(state, message, decision) {
  const key = message?.conversationId || message?.nickname || message?.secUid || "unknown";
  if (!state.conversations || typeof state.conversations !== "object") state.conversations = {};
  const current = conversationForState(state, message);
  const next = {
    ...current,
    messageCount: current.messageCount + 1,
    stage: decision?.action === INBOX_ACTIONS.handoff ? "handoff" : decision?.action === INBOX_ACTIONS.stop ? "closed" : "active",
    lastIntent: decision?.intent || current.lastIntent,
    lastAction: decision?.action || current.lastAction,
    recentMessages: [...(current.recentMessages || []), { role: "user", content: message.content, at: message.createdAt || Date.now() }].slice(-10)
  };
  state.conversations[key] = next;
  const keys = Object.keys(state.conversations);
  if (keys.length > 1000) delete state.conversations[keys[0]];
  return next;
}

export function validateReply(content, { strategy = createReplyStrategy(), decision = {} } = {}) {
  const value = text(content);
  if (!value) return { ok: false, reason: "empty_reply" };
  if (value.length > 500) return { ok: false, reason: "reply_too_long" };
  if (/(作为AI|语言模型|根据你的提示)/i.test(value)) return { ok: false, reason: "meta_disclosure" };
  if (/(保证|百分之百|绝对有效|稳赚|无风险)/i.test(value)) return { ok: false, reason: "unsupported_promise" };
  if (decision.intent === INBOX_INTENTS.optOut) return { ok: false, reason: "opt_out_reply_forbidden" };
  if (strategy.approvedClaims.length && strategy.approvedClaims.every((claim) => !value.includes(claim)) && decision.action === INBOX_ACTIONS.answer && !strategy.knowledge) {
    return { ok: false, reason: "no_approved_knowledge" };
  }
  return { ok: true, content: value };
}

function text(value) { return typeof value === "string" ? value.trim() : ""; }
function stringList(value) { return Array.isArray(value) ? value.map(text).filter(Boolean).slice(0, 30) : []; }
