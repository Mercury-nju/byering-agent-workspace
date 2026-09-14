import { isActiveMemory } from "../src/salebuddy/agents/memory-lifecycle.js";

const segmenter = new Intl.Segmenter("zh-CN", { granularity: "word" });
function terms(text) {
  return new Set([...segmenter.segment(String(text || "").toLowerCase())].filter(item => item.isWordLike && item.segment.length > 1).map(item => item.segment));
}
function relevance(query, text) {
  const words = terms(text);
  return [...query].reduce((score, term) => score + Number(words.has(term)), 0);
}

/** Storage and recall budgets are independent. Archived facts are opt-in and query-matched. */
export function retrieveCompanionMemory(memories, query, { budget = 3200, now = Date.now(), includeArchived = false } = {}) {
  const keywords = terms(query);
  const ranked = memories.filter(item => {
    if (isActiveMemory(item, now)) return true;
    if (!includeArchived || item?.status !== "archived") return false;
    return relevance(keywords, `${item.topic || ""} ${item.text}`) > 0;
  }).map(item => {
    const matchScore = relevance(keywords, `${item.topic || ""} ${item.text}`);
    return { item,
      score: matchScore * 20 + (item.explicit ? 5 : 0)
        + (matchScore > 0 && isActiveMemory(item, now) ? 100 : 0)
        + (["name", "business", "tone", "detail"].includes(item.key) ? 2 : 0)
    };
  }).sort((a, b) => b.score - a.score || b.item.updatedAt - a.item.updatedAt);
  const selected = []; let length = 0;
  for (const { item } of ranked) {
    const size = item.text.length + 40;
    if (length + size > budget) continue;
    selected.push(item); length += size;
  }
  return selected;
}

export function retrieveCompanionHistory(messages, query, { excludeIds = [], budget = 3000 } = {}) {
  const words = terms(query), excluded = new Set(excludeIds);
  const ranked = messages.filter(message => message.from === "user" && !excluded.has(message.id))
    .map(message => ({ message, score: relevance(words, message.text) })).filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || Date.parse(b.message.createdAt) - Date.parse(a.message.createdAt));
  const selected = []; let length = 0;
  for (const { message } of ranked) {
    const text = String(message.text).slice(0, 1000);
    if (length + text.length > budget) continue;
    selected.push({ id: message.id, text, createdAt: message.createdAt }); length += text.length;
  }
  return selected;
}

export function automaticMemoryCandidates(output, user, memories) {
  const items = Array.isArray(output.memories) ? output.memories : output.memory ? [output.memory] : [];
  return items.slice(0, 6).filter(item => {
    if (!item || item.subject !== "user" || !["stated", "explicit"].includes(item.basis)) return false;
    if (typeof item.evidence !== "string" || !item.evidence.trim() || !user.text.includes(item.evidence)) return false;
    if (item.temporal === "temporary" && !Number.isFinite(Date.parse(item.validUntil))) return false;
    if (item.temporal !== "stable" && item.temporal !== "temporary") return false;
    if (item.supersedes && !memories.some(memory => memory.id === item.supersedes)) return false;
    return typeof item.text === "string" && item.text.trim() && typeof item.key === "string";
  });
}
