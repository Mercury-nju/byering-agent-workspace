/**
 * Durable conversation contract for the chief of staff.
 *
 * The office rail and the member DM are two views over this same conversation.
 * Specialist agents keep their existing agentType and conversation behavior.
 */
export const CHIEF_AGENT_TYPE = "main";
export const CHIEF_CONVERSATION_ID = "chief-of-staff";
export const CHIEF_AGENT_ALIASES = Object.freeze([CHIEF_AGENT_TYPE, "chief_of_staff"]);

export function isChiefAgentType(agentType) {
  return CHIEF_AGENT_ALIASES.includes(String(agentType || ""));
}

export function chiefDmPayload(extra = {}) {
  return {
    agentType: CHIEF_AGENT_TYPE,
    conversationId: CHIEF_CONVERSATION_ID,
    ...extra
  };
}

export function dmPayloadFor(agentType, extra = {}) {
  if (isChiefAgentType(agentType)) return chiefDmPayload(extra);
  return { agentType, ...extra };
}

export function normalizeChiefMessages(messages = []) {
  return (Array.isArray(messages) ? messages : [])
    .filter((message) => message && typeof message === "object" && String(message.text || "").trim())
    .map((message) => ({
      id: message.id || `${message.from || ""}:${message.createdAt || ""}:${message.text}`,
      role: message.from === "user" ? "user" : "assistant",
      text: String(message.text),
      from: message.from || CHIEF_AGENT_TYPE,
      fromName: message.fromName || (message.from === "user" ? "我" : "Byering · 幕僚长"),
      createdAt: message.createdAt || null,
      metadata: message.metadata || null
    }));
}
