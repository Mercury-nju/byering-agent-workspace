import { createHash } from "node:crypto";

const FIND_ONLY_WORKFLOW = "find_only";

const STAGES = Object.freeze([
  {
    agentId: "lead_analyst",
    skillId: "public_lead_analysis",
    label: "线索分析师"
  },
  {
    agentId: "prospect_researcher",
    skillId: "public_prospect_research",
    label: "客户研究员"
  },
  {
    agentId: "risk_specialist",
    skillId: "public_lead_risk_review",
    label: "风险专员"
  }
]);

const SECRET_KEY = /(?:authorization|(?:access|refresh)?[_-]?token|password|passwd|cookie|secret|csrf|jwt)/i;

export class ProspectWorkflowError extends Error {
  constructor(message, { code = "PROSPECT_WORKFLOW_FAILED", statusCode = 502, details = {} } = {}) {
    super(message);
    this.name = "ProspectWorkflowError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = redact(details);
  }
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !SECRET_KEY.test(key) && key !== "cause")
    .map(([key, child]) => [key, redact(child)]));
}

function stableEventId(request, type, suffix) {
  const source = [request.taskId, request.taskRunId, type, suffix].map((value) => String(value || "")).join(":");
  return `prospect-workflow:${createHash("sha256").update(source).digest("hex").slice(0, 32)}`;
}

function contextOf(request = {}) {
  const taskId = nonEmpty(request.taskId || request.task_id);
  const taskRunId = nonEmpty(request.taskRunId || request.task_run_id || request.runId || request.run_id);
  const conversationId = nonEmpty(request.conversationId || request.conversation_id);
  if (!taskId || !taskRunId || !conversationId) {
    throw new ProspectWorkflowError("taskId, taskRunId, and conversationId are required", {
      code: "PROSPECT_CONTEXT_REQUIRED",
      statusCode: 400
    });
  }
  return { taskId, taskRunId, conversationId };
}

function eventFor(context, type, agentId, skillId, payload, suffix) {
  return {
    eventId: stableEventId(context, type, suffix),
    taskId: context.taskId,
    taskRunId: context.taskRunId,
    conversationId: context.conversationId,
    agentId,
    skillId,
    skillRunId: `${context.taskRunId}:${agentId}`,
    type,
    occurredAt: new Date().toISOString(),
    payload: clone(payload)
  };
}

function leadKey(lead, index) {
  return String(lead?.leadId || lead?.externalUserId || lead?.secUid || lead?.uniqueId || lead?.id || `lead-${index}`);
}

function publicBriefFor(lead) {
  const source = isRecord(lead?.source) ? lead.source : {};
  const evidence = Array.isArray(lead?.evidence) ? lead.evidence : [];
  return {
    source: "douyin_public",
    videoId: source.videoId || null,
    videoTitle: source.videoTitle || null,
    videoUrl: source.videoUrl || source.url || null,
    observedAt: source.observedAt || lead?.discoveredAt || null,
    evidenceCount: evidence.length,
    evidence: evidence.slice(0, 5).map((item) => ({
      type: item.type || "public_signal",
      quote: item.quote || item.text || null,
      observedAt: item.observedAt || null,
      sourceUrl: item.sourceUrl || source.url || source.videoUrl || null
    }))
  };
}

function analyzeLeads(snapshot) {
  const leads = Array.isArray(snapshot?.leads) ? snapshot.leads : [];
  const unique = new Map();
  for (const [index, lead] of leads.entries()) {
    if (!isRecord(lead)) continue;
    const key = leadKey(lead, index);
    const prior = unique.get(key);
    if (!prior || Number(lead.score || 0) > Number(prior.score || 0)) unique.set(key, clone(lead));
  }
  const analyzed = [...unique.values()].sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
  return analyzed.map((lead, index) => ({ ...lead, rank: index + 1 }));
}

function applyResearch(leads) {
  return leads.map((lead) => ({ ...lead, publicBrief: publicBriefFor(lead) }));
}

function applyRisk(leads) {
  return leads.map((lead) => {
    const flags = [];
    if (!lead.externalUserId && !lead.secUid && !lead.uniqueId) flags.push("IDENTITY_INCOMPLETE");
    if (!lead.text && (!lead.evidence || lead.evidence.length === 0)) flags.push("EVIDENCE_MISSING");
    return {
      ...lead,
      risk: {
        status: flags.length ? "review" : "clear",
        flags
      }
    };
  });
}

function snapshotWith(snapshot, leads, status = snapshot?.status || "completed", workflow = {}) {
  const source = isRecord(snapshot) ? clone(snapshot) : {};
  const qualified = leads.filter((lead) => lead.tier === "high" || lead.tier === "medium");
  const counts = isRecord(source.counts) ? source.counts : {};
  return {
    ...source,
    schemaVersion: Number(source.schemaVersion || 1),
    status,
    counts: {
      ...counts,
      candidates: leads.length,
      qualified: qualified.length
    },
    leads: clone(leads),
    qualified: clone(qualified),
    workflow: {
      ...(isRecord(source.workflow) ? source.workflow : {}),
      id: FIND_ONLY_WORKFLOW,
      ...workflow
    }
  };
}

function stagePayload(stage, snapshot, status, extra = {}) {
  return {
    stage: stage.agentId,
    agentId: stage.agentId,
    skillId: stage.skillId,
    status,
    resultSnapshot: clone(snapshot),
    ...extra
  };
}

export function createProspectWorkflowRunner({ prospectService = null, now = () => new Date().toISOString() } = {}) {
  const configured = Boolean(prospectService && prospectService.configured !== false
    && (typeof prospectService.lease === "function" || typeof prospectService.discover === "function"));

  async function lease(request = {}) {
    if (!configured) {
      throw new ProspectWorkflowError("公开找人 Agent 未配置", {
        code: "PROSPECT_EXECUTOR_NOT_CONFIGURED",
        statusCode: 503
      });
    }
    const context = contextOf(request);
    const raw = await (typeof prospectService.lease === "function"
      ? prospectService.lease(request)
      : prospectService.discover(request));
    if (!isRecord(raw)) throw new ProspectWorkflowError("公开找人 Agent 返回了无效结果", {
      code: "PROSPECT_RESULT_INVALID",
      statusCode: 502
    });

    const baseEvents = (Array.isArray(raw.events) ? raw.events : [])
      .filter((event) => event && event.type !== "task.completed")
      .map((event) => clone(event));
    const rawSnapshot = isRecord(raw.resultSnapshot) ? clone(raw.resultSnapshot) : {
      schemaVersion: 1,
      status: raw.status === "PENDING" ? "pending" : "completed",
      counts: { videos: 0, comments: 0, candidates: 0, qualified: 0 },
      leads: [],
      qualified: []
    };
    const pending = String(raw.status || rawSnapshot.status || "").toUpperCase() === "PENDING"
      || rawSnapshot.status === "pending";
    let snapshot = snapshotWith(rawSnapshot, Array.isArray(rawSnapshot.leads) ? rawSnapshot.leads : [], pending ? "pending" : "completed", {
      agents: ["chief_of_staff", "acquisition_strategist", "lead_miner"],
      completedAgentId: pending ? "lead_miner" : null
    });
    const accountEvents = baseEvents.filter((event) => event.type === "account.resolved");
    const otherBaseEvents = baseEvents.filter((event) => event.type !== "account.resolved");
    const events = [];
    if (accountEvents.length) {
      events.push(eventFor(context, "agent.stage.started", "acquisition_strategist", "account_resolution", {
        stage: "acquisition_strategist",
        status: "RUNNING",
        resultSnapshot: snapshot
      }, "acquisition_strategist:started"));
      events.push(...accountEvents);
      events.push(eventFor(context, "agent.stage.completed", "acquisition_strategist", "account_resolution", {
        stage: "acquisition_strategist",
        status: "SUCCEEDED",
        resultSnapshot: snapshot,
        account: accountEvents[0].payload?.account || null
      }, "acquisition_strategist:completed"));
    }
    events.push(...otherBaseEvents);
    events.push(eventFor(context, "agent.stage.completed", "lead_miner", "public_prospect_discovery", {
      stage: "lead_miner",
      status: pending ? "PENDING" : "SUCCEEDED",
      resultSnapshot: snapshot
    }, `lead_miner:${pending ? "pending" : "completed"}`));

    if (pending) {
      return { ...clone(raw), status: "PENDING", resultSnapshot: snapshot, events };
    }

    let leads = analyzeLeads(snapshot);
    for (const stage of STAGES) {
      events.push(eventFor(context, "agent.stage.started", stage.agentId, stage.skillId,
        stagePayload(stage, snapshot, "RUNNING"), `${stage.agentId}:started`));
      if (stage.agentId === "prospect_researcher") leads = applyResearch(leads);
      if (stage.agentId === "risk_specialist") leads = applyRisk(leads);
      snapshot = snapshotWith(snapshot, leads, "completed", {
        agents: ["chief_of_staff", "acquisition_strategist", "lead_miner", ...STAGES.slice(0, STAGES.findIndex((item) => item.agentId === stage.agentId) + 1).map((item) => item.agentId)],
        completedAgentId: stage.agentId,
        currentAgentId: stage.agentId
      });
      const extra = stage.agentId === "lead_analyst"
        ? { qualifiedCount: snapshot.counts.qualified, candidateCount: snapshot.counts.candidates }
        : stage.agentId === "prospect_researcher"
          ? { briefCount: leads.filter((lead) => lead.publicBrief).length }
          : { riskCount: leads.filter((lead) => lead.risk?.status === "clear").length };
      events.push(eventFor(context, "agent.stage.completed", stage.agentId, stage.skillId,
        stagePayload(stage, snapshot, "SUCCEEDED", extra), `${stage.agentId}:completed`));
    }

    snapshot = snapshotWith(snapshot, leads, "completed", {
      agents: ["chief_of_staff", "acquisition_strategist", "lead_miner", ...STAGES.map((stage) => stage.agentId)],
      completedAgentId: "risk_specialist",
      currentAgentId: null
    });
    events.push(eventFor(context, "task.result.snapshot.updated", "risk_specialist", "public_lead_risk_review", {
      resultSnapshot: snapshot,
      workflowId: FIND_ONLY_WORKFLOW
    }, "result"));
    events.push(eventFor(context, "task.completed", "risk_specialist", "public_lead_risk_review", {
      status: "SUCCEEDED",
      source: "prospect",
      workflowId: FIND_ONLY_WORKFLOW,
      resultSnapshot: snapshot,
      completedAgentId: "risk_specialist",
      text: "公开找人流程已完成，候选线索、证据和风险标记已整理。"
    }, "terminal"));
    return {
      ...clone(raw),
      status: "SUCCEEDED",
      source: "prospect",
      resultSnapshot: snapshot,
      events
    };
  }

  async function callback(request = {}, response = {}) {
    if (!configured || typeof prospectService.callback !== "function") {
      throw new ProspectWorkflowError("公开找人回调处理器未配置", {
        code: "PROSPECT_CALLBACK_NOT_CONFIGURED",
        statusCode: 503
      });
    }
    const raw = await prospectService.callback(request, response);
    // Callback delivery is the same workflow boundary as an initial lease:
    // the collector only supplies public records, while the Agent stages own
    // analysis, research, risk review, and the terminal transition.
    const processor = createProspectWorkflowRunner({
      prospectService: {
        configured: true,
        kind: "prospect",
        requiresExecutorUid: false,
        lease: async () => raw
      },
      now
    });
    return processor.lease(request);
  }

  return Object.freeze({
    kind: "prospect-workflow",
    source: "prospect",
    configured,
    requiresExecutorUid: false,
    lease,
    discover: lease,
    callback
  });
}

export { STAGES as PROSPECT_WORKFLOW_STAGES };
