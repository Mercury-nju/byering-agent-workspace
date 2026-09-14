import { prospectStore } from "../ui/prospect-store.js";
import { normalizeAgentResultSnapshot } from "./agent-result-contract.js";

/**
 * Persists a normalized Agent result into the shared Results Center store.
 * The store already upserts by taskId, so long-lived tasks can update one
 * record as their runtime state changes instead of creating duplicates.
 */
export function createAgentResultRecorder({ store = prospectStore, now = () => new Date().toISOString() } = {}) {
  function record({
    agentId,
    agentName,
    taskId,
    taskRunId = null,
    accountId = null,
    accountName = null,
    title,
    summary,
    source,
    status = "completed",
    counts = {},
    metrics = null,
    items = [],
    artifacts = [],
    generatedAt = null,
    ...extra
  } = {}) {
    if (!taskId || !store || typeof store.ingestRun !== "function") return null;
    const scopedItems = Array.isArray(items)
      ? items.map((item) => item && typeof item === "object" && !Array.isArray(item) && extra.sourceScope && !item.sourceScope
        ? { ...item, sourceScope: extra.sourceScope }
        : item)
      : [];
    const resultSnapshot = normalizeAgentResultSnapshot({
      ...extra,
      taskRunId,
      accountId,
      accountName,
      agentId,
      agentName,
      taskId,
      title,
      summary,
      status,
      counts,
      ...(metrics ? { metrics } : {}),
      items: scopedItems,
      artifacts: Array.isArray(artifacts) ? artifacts : [],
      generatedAt: generatedAt || now()
    }, { agentId, agentName, taskId, taskRunId, accountId, accountName, source, sourceScope: extra.sourceScope, title, summary, status, generatedAt: generatedAt || now() });
    store.ingestRun({
      resultSnapshot,
      taskId,
      agentId,
      agentName,
      sourceContext: {
        source,
        sourceScope: extra.sourceScope || resultSnapshot.inputs?.sourceScope || resultSnapshot.sourceScope || null,
        accountId,
        accountName,
        taskRunId,
        links: extra.links
      }
    });
    return store.listRuns().find((run) => run.taskId === taskId && run.agentId === agentId && run.accountId === (accountId || "")) || null;
  }

  return { record };
}

export const agentResultRecorder = createAgentResultRecorder();
