import { randomUUID } from "node:crypto";

import { createLeadIntentAnalysisService } from "./lead-intent-analysis.js";

const DEFAULT_CONTEXT = Object.freeze({
  agentId: "mkt-intent-analyst",
  skillId: "lead_intent_analysis"
});

const INTENT_TERMS = Object.freeze([
  "想买", "购买", "报价", "价格", "预算", "多少钱", "落地", "优惠", "试驾", "咨询", "联系",
  "电话", "微信", "地址", "现车", "库存", "金融", "分期", "置换", "求购", "推荐", "在哪"
]);

const SECRET_KEY = /(?:authorization|(?:access|refresh)?[_-]?token|password|passwd|cookie|secret|csrf|jwt)/i;

export class ProspectIntentAnalysisError extends Error {
  constructor(message, { code = "PROSPECT_INTENT_ANALYSIS_ERROR", statusCode = 400, details = {} } = {}) {
    super(message);
    this.name = "ProspectIntentAnalysisError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = redact(details);
  }
}

/**
 * Evaluates already-collected candidates. It deliberately has no public-data
 * collector or RPA dependency, so it can never start the legacy data MCP.
 */
export function createProspectIntentAnalysisService({
  env = process.env,
  intentAnalyzer = null,
  intentAnalyzerFactory = createLeadIntentAnalysisService,
  now = () => new Date().toISOString()
} = {}) {
  const analyzer = intentAnalyzer ?? createConfiguredAnalyzer({ env, intentAnalyzerFactory });

  async function analyze(rawInput = {}) {
    if (!isRecord(rawInput)) throw new ProspectIntentAnalysisError("Prospect analysis request must be an object", {
      code: "PROSPECT_INPUT_INVALID",
      statusCode: 400
    });
    const context = normalizeContext(rawInput);
    const candidates = normalizeCandidates(rawInput);
    const goal = first(rawInput.goal, rawInput.query, "判断候选用户是否值得继续跟进，并给出可回查的依据和下一步建议");
    const analysisScope = first(rawInput.analysisScope, rawInput.analysis_scope, "user_intent");
    const result = await applyIntentAnalysis(candidates, {
      goal,
      account: rawInput.account || null,
      analyzer
    });
    const leads = result.leads;
    const counts = {
      candidates: leads.length,
      qualified: leads.filter((lead) => lead.tier === "high" || lead.tier === "medium").length,
      high: leads.filter((lead) => lead.tier === "high").length,
      medium: leads.filter((lead) => lead.tier === "medium").length,
      low: leads.filter((lead) => lead.tier === "low").length
    };
    const links = sourceLinks(rawInput);
    const snapshot = {
      schemaVersion: 1,
      source: "prospect_analysis",
      status: "completed",
      query: goal,
      generatedAt: now(),
      ...(rawInput.account ? { account: redactClone(rawInput.account) } : {}),
      sourceScope: first(rawInput.sourceScope, rawInput.source_scope, "candidate_list"),
      inputs: {
        analysisMode: "intent",
        analysisScope,
        ...links
      },
      links,
      counts,
      analysis: result.analysis,
      leads: redactClone(leads),
      qualified: redactClone(leads.filter((lead) => lead.tier === "high" || lead.tier === "medium")),
      comments: [],
      videos: [],
      traces: []
    };
    const events = [event(context, "task.execution.accepted", {
      source: "prospect_intent_analysis",
      provider: analyzer ? "ai" : "heuristic",
      agentId: context.agentId,
      mode: "intent_judgment"
    }, 0)];
    events.push(event(context, "task.result.snapshot.updated", { resultSnapshot: snapshot }, events.length));
    events.push(event(context, "prospect.intent.analysis.completed", {
      status: "SUCCEEDED",
      resultSnapshot: snapshot,
      source: "prospect_intent_analysis"
    }, events.length));
    return {
      accepted: true,
      dispatched: true,
      source: "prospect",
      status: "SUCCEEDED",
      resultSnapshot: snapshot,
      events
    };
  }

  return Object.freeze({
    kind: "prospect-intent-analysis",
    source: "prospect_intent_analysis",
    configured: true,
    modelConfigured: Boolean(analyzer),
    analyze
  });
}

function createConfiguredAnalyzer({ env, intentAnalyzerFactory }) {
  const apiKey = first(env?.BYERING_LLM_API_KEY, env?.DEEPSEEK_API_KEY, env?.OPENAI_API_KEY);
  if (!apiKey) return null;
  try {
    return intentAnalyzerFactory({
      endpoint: env.BYERING_LLM_ENDPOINT,
      baseUrl: env.BYERING_LLM_BASE_URL,
      apiKey,
      model: env.BYERING_LLM_MODEL,
      timeoutMs: env.BYERING_LLM_TIMEOUT_MS,
      maxAttempts: env.BYERING_LLM_MAX_ATTEMPTS
    });
  } catch {
    return null;
  }
}

function normalizeCandidates(rawInput) {
  const source = Array.isArray(rawInput.candidates)
    ? rawInput.candidates
    : Array.isArray(rawInput.leads)
      ? rawInput.leads
      : [];
  if (source.length > 500) throw new ProspectIntentAnalysisError("candidates must contain no more than 500 records", {
    code: "PROSPECT_INPUT_INVALID",
    statusCode: 400,
    details: { field: "candidates", max: 500 }
  });
  const goal = first(rawInput.goal, rawInput.query, "");
  return source.map((candidate, index) => {
    const item = redactClone(isRecord(candidate) ? candidate : {});
    const identity = first(item.leadId, item.recordId, item.sourceRecordId, item.secUid, item.sec_uid, item.uniqueId, item.unique_id, item.id, `candidate-${index + 1}`);
    const text = String(first(item.text, item.comment, item.content, item.evidence?.[0]?.quote, "") || "").trim();
    const fallback = scoreText(text, goal);
    return {
      ...item,
      id: String(first(item.id, identity)),
      leadId: String(identity),
      sourceRecordId: first(item.sourceRecordId, item.recordId, item.id),
      text,
      score: toNumber(item.score) ?? fallback.score,
      tier: String(first(item.tier, fallback.score >= 45 ? "high" : fallback.score >= 18 ? "medium" : "low")),
      matchedTerms: Array.isArray(item.matchedTerms) ? item.matchedTerms : fallback.matchedTerms
    };
  }).filter((candidate) => candidate.leadId && (candidate.text || candidate.nickname || candidate.name || candidate.uniqueId || candidate.secUid));
}

async function applyIntentAnalysis(leads, { goal, account, analyzer }) {
  if (!leads.length) return { leads, analysis: heuristicAnalysis(leads) };
  if (!analyzer || typeof analyzer.analyze !== "function") {
    return { leads: withHeuristicIntent(leads), analysis: heuristicAnalysis(leads) };
  }
  try {
    const result = await analyzer.analyze({
      goal,
      account,
      comments: leads.map((lead, index) => ({
        index,
        text: lead.text,
        videoTitle: lead.source?.videoTitle || "",
        observedAt: lead.source?.observedAt || "",
        profile: lead.profileData || lead.profile || {},
        recentWorks: lead.contentEvidence || lead.recentWorks || []
      }))
    });
    const byIndex = new Map((result.items || []).map((item) => [item.index, item]));
    const analyzedLeads = leads.map((lead, index) => {
      const item = byIndex.get(index);
      if (!item) return { ...lead, intent: heuristicIntent(lead, "模型未覆盖该线索，保留规则判断") };
      return {
        ...lead,
        score: item.score,
        tier: item.tier,
        intent: {
          tier: item.tier,
          score: item.score,
          confidence: item.confidence,
          reason: item.reason,
          signals: item.signals,
          ...(Array.isArray(item.traits) && item.traits.length ? { traits: item.traits } : {}),
          source: "model",
          provider: result.provider || null,
          model: result.model || null,
          generatedAt: result.generatedAt || null
        }
      };
    });
    return { leads: analyzedLeads, analysis: modelAnalysis(analyzedLeads, result) };
  } catch (error) {
    return {
      leads: withHeuristicIntent(leads, "模型不可用，按已采集的内容信号进行规则兜底"),
      analysis: heuristicAnalysis(leads, error)
    };
  }
}

function normalizeContext(input = {}) {
  const context = {
    taskId: first(input.taskId, input.task_id),
    taskRunId: first(input.taskRunId, input.task_run_id, input.runId, input.run_id),
    conversationId: first(input.conversationId, input.conversation_id),
    agentId: first(input.agentId, input.agent_id, DEFAULT_CONTEXT.agentId),
    skillId: first(input.skillId, input.skill_id, DEFAULT_CONTEXT.skillId),
    skillRunId: first(input.skillRunId, input.skill_run_id),
    tenantId: first(input.tenantId, input.tenant_id, input.tenant)
  };
  for (const field of ["taskId", "taskRunId", "conversationId", "agentId"]) {
    if (!context[field]) throw new ProspectIntentAnalysisError(`${field} is required`, {
      code: "PROSPECT_CONTEXT_REQUIRED",
      statusCode: 400,
      details: { field }
    });
  }
  if ((context.skillId && !context.skillRunId) || (!context.skillId && context.skillRunId)) {
    context.skillId = null;
    context.skillRunId = null;
  }
  return context;
}

function sourceLinks(input = {}) {
  return {
    sourceResultId: first(input.sourceResultId, input.source_result_id),
    sourceTaskId: first(input.sourceTaskId, input.source_task_id),
    sourceTaskTitle: first(input.sourceTaskTitle, input.source_task_title),
    sourceTaskGoal: first(input.sourceTaskGoal, input.source_task_goal),
    sourceResultType: first(input.sourceResultType, input.source_result_type),
    sourceAccountId: first(input.sourceAccountId, input.source_account_id),
    sourceAccountName: first(input.sourceAccountName, input.source_account_name)
  };
}

function modelAnalysis(leads, result) {
  return {
    mode: "model",
    source: "model",
    provider: result.provider || null,
    model: result.model || null,
    generatedAt: result.generatedAt || new Date().toISOString(),
    counts: countsFor(leads, leads.filter((lead) => lead.intent?.source === "model").length)
  };
}

function heuristicAnalysis(leads, error = null) {
  return {
    mode: "heuristic",
    source: "heuristic",
    ...(error ? { error: "MODEL_UNAVAILABLE", errorCode: error.code || null } : {}),
    counts: countsFor(leads, 0)
  };
}

function countsFor(leads, modelReviewed) {
  return {
    high: leads.filter((lead) => lead.tier === "high").length,
    medium: leads.filter((lead) => lead.tier === "medium").length,
    low: leads.filter((lead) => lead.tier === "low").length,
    modelReviewed
  };
}

function withHeuristicIntent(leads, reason = "按已采集的关键词和提问表达进行规则判断") {
  return leads.map((lead) => lead.intent ? lead : { ...lead, intent: heuristicIntent(lead, reason) });
}

function heuristicIntent(lead, reason) {
  return {
    tier: lead.tier,
    score: lead.score,
    confidence: 0,
    reason,
    signals: lead.matchedTerms || [],
    source: "heuristic"
  };
}

function scoreText(text) {
  const haystack = String(text || "").toLowerCase();
  const matchedTerms = INTENT_TERMS.filter((term) => haystack.includes(term.toLowerCase()));
  const questionBoost = /[?？]|怎么|如何|请问/.test(text) ? 1 : 0;
  return { score: Math.min(100, matchedTerms.length * 18 + questionBoost * 10), matchedTerms };
}

function event(context, type, payload, index = 0) {
  return {
    eventId: `prospect-intent:${context.taskId}:${index}:${randomUUID()}`,
    type,
    occurredAt: new Date().toISOString(),
    taskId: context.taskId,
    taskRunId: context.taskRunId,
    conversationId: context.conversationId,
    agentId: context.agentId,
    skillId: context.skillId,
    skillRunId: context.skillRunId,
    tenantId: context.tenantId,
    payload: redactClone(payload)
  };
}

function first(...values) {
  for (const value of values) {
    if (value === 0 || value === false) return value;
    if (typeof value === "string" && value.trim()) return value.trim();
    if (value != null && typeof value !== "string") return value;
  }
  return null;
}

function toNumber(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function redactClone(value) {
  return redact(value == null ? value : JSON.parse(JSON.stringify(value)));
}

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !SECRET_KEY.test(key))
    .map(([key, child]) => [key, redact(child)]));
}
