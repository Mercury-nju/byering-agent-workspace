import { createModelReplyGenerator } from "./douyin-inbox-agent-service.js";
import { receptionDecision } from "./account-reception-runtime.js";
import { normalizeReception, receptionGoalObjective, receptionPrompt, receptionResponseStyle } from "../src/salebuddy/agents/account-reception.js";
import { validateReply } from "./douyin-reply-strategy.js";

export async function previewReception({ settings: input, message, history = [], instant = Date.now() }, { env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const settings = normalizeReception(input);
  if (!String(message || "").trim() || String(message).length > 2000) throw Object.assign(new Error("请输入一句试聊消息（不超过2000字）"), { statusCode: 400 });
  if (!Number.isFinite(new Date(instant).getTime())) throw Object.assign(new Error("试聊时间不正确"), { statusCode: 400 });
  const decision = receptionDecision({ content: message }, settings, { mode: "auto" }, instant);
  if (decision.action !== "reply") return { action: decision.action, reply: decision.action === "away" && settings.schedule.outside === "away" ? settings.schedule.awayMessage : "", reason: decision.reason, sent: false };
  const generate = createModelReplyGenerator({ env, fetchImpl, now: () => Date.now(), getContext: () => ({
    replyRule: receptionPrompt(settings), knowledgeContext: settings.knowledge,
    strategy: { objective: receptionGoalObjective(settings), tone: receptionResponseStyle(settings), approvedClaims: [], handoffRules: ["要求人工", "投诉退款", "无法确认的事实"], qualificationQuestions: [] }
  }) });
  const result = await generate({ content: String(message) }, { reception: settings, conversation: { recentMessages: (Array.isArray(history) ? history : []).slice(-10).filter(item => ["user", "assistant"].includes(item.role) && typeof item.content === "string").map(item => ({ role: item.role, content: item.content.slice(0, 2000) })) } });
  if (result.send === false || !validateReply(result.content).ok) return { action: "human", reply: "", reason: "reply_needs_review", sent: false };
  return { action: "reply", reply: result.content, sent: false, model: env.BYERING_LLM_MODEL || "doubao-seed-2-1-pro-260628" };
}
