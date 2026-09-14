const KNOWLEDGE_KINDS = new Set(["userRules", "projectRules", "lessons", "feedback", "bestPractices"]);
const SHARED_SCOPES = new Set(["project", "organization"]);
const KIND_LABELS = Object.freeze({
  userRules: "用户偏好",
  projectRules: "项目背景",
  lessons: "经验总结",
  feedback: "纠正反馈",
  bestPractices: "工作方法"
});
const SCOPE_LABELS = Object.freeze({
  task: "本次任务",
  project: "当前项目",
  agent: "该 Agent",
  organization: "整个组织"
});

export function collectAgentKnowledge({ agentStore, agentId = "mkt-comment-acquisition" } = {}) {
  if (!agentStore || typeof agentStore.listMemory !== "function") return [];
  const ownEntries = readEntries(agentStore, agentId).map((entry) => ({ ...entry, sourceAgentId: agentId }));
  const sharedEntries = agentId === "main"
    ? []
    : readEntries(agentStore, "main")
      .filter((entry) => SHARED_SCOPES.has(entry.scope))
      .map((entry) => ({ ...entry, sourceAgentId: "main" }));
  return [...ownEntries, ...sharedEntries]
    .filter(isActiveKnowledge)
    .sort((left, right) => knowledgeDate(right) - knowledgeDate(left));
}

export function buildKnowledgeContext(entries = [], { maxEntries = 24, maxChars = 8000 } = {}) {
  const limit = Math.max(0, Number(maxEntries) || 0);
  const maxLength = Math.max(0, Number(maxChars) || 0);
  const lines = [];
  let length = 0;
  for (const entry of entries.slice(0, limit)) {
    const text = cleanText(entry?.text);
    if (!text) continue;
    const line = `[${KIND_LABELS[entry.kind] || entry.kind || "知识"} · ${SCOPE_LABELS[entry.scope] || entry.scope || "该 Agent"}] ${text}`;
    const remaining = maxLength - length - (lines.length ? 1 : 0);
    if (remaining <= 0) break;
    const clipped = line.length > remaining ? line.slice(0, remaining).trimEnd() : line;
    if (!clipped) break;
    lines.push(clipped);
    length += clipped.length + (lines.length > 1 ? 1 : 0);
    if (clipped.length < line.length) break;
  }
  return lines.join("\n");
}

export function createAgentKnowledgeProvider({ agentStore } = {}) {
  return async ({ agentId = "mkt-comment-acquisition" } = {}) => {
    const entries = collectAgentKnowledge({ agentStore, agentId });
    return { agentId, entries, context: buildKnowledgeContext(entries) };
  };
}

function readEntries(agentStore, agentId) {
  const entries = agentStore.listMemory(agentId);
  return Array.isArray(entries) ? entries : [];
}

function isActiveKnowledge(entry) {
  return KNOWLEDGE_KINDS.has(entry?.kind)
    && cleanText(entry?.text)
    && entry?.status === "active";
}

function knowledgeDate(entry) {
  const value = Date.parse(entry?.updatedAt || entry?.createdAt || "");
  return Number.isFinite(value) ? value : 0;
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}
