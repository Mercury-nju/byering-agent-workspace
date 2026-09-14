/**
 * Shared display contract for private Agent conversations.
 *
 * Work activity is durable, but it is not a private message. Agent-side
 * conversation messages must carry an explicit conversation origin so legacy
 * onboarding greetings cannot appear as if the Agent initiated a DM.
 */
export function isAgentActivityMessage(message = {}) {
  return message?.metadata?.source === "agent-activity"
    || String(message?.id || "").startsWith("activity-");
}

export function isPrivateConversationMessage(message = {}) {
  if (!message || typeof message !== "object" || !String(message.text || "").trim()) return false;
  if (message.from === "user" || message.role === "user") return true;
  if (isAgentActivityMessage(message)) return false;
  return Boolean(
    message.metadata?.companion
      || message.metadata?.source === "chief-conversation"
      || message.metadata?.source === "member-conversation"
      || message.metadata?.source === "reception-strategy"
      || message.metadata?.source === "managed-daily-report"
  );
}

export function normalizePrivateConversationMessages(messages = []) {
  return (Array.isArray(messages) ? messages : [])
    .filter(isPrivateConversationMessage)
    .map((message) => ({
      ...message,
      role: message.from === "user" || message.role === "user" ? "user" : "agent",
      text: String(message.text)
    }));
}

export const SPECIALIST_CONVERSATION_ROLE = "specialist-executor";

export function specialistConversationMetadata(context = {}) {
  const value = key => {
    const candidate = context?.[key];
    return candidate == null ? "" : String(candidate).trim();
  };
  const metadata = {
    source: "member-conversation",
    conversationRole: SPECIALIST_CONVERSATION_ROLE,
    canCreateTeamTask: false,
    requiresChiefForNewTask: true
  };
  for (const key of ["taskId", "taskRunId", "accountId", "conversationId"]) {
    const candidate = value(key);
    if (candidate) metadata[key] = candidate;
  }
  return metadata;
}
