/**
 * Convert AG-UI gateway messages into the canonical task-runner events.
 * The adapter is deliberately stateful: remote text arrives as deltas and
 * remote retries may replay the same sequence number.
 */

function streamKey(source) {
  return source.messageId || source.message_id || source.response_id || source.run_id || "default";
}

function followupIdOf(source = {}) {
  return source.followupId
    || source.followup_id
    || source.data?.followupId
    || source.data?.followup_id
    || source.metadata?.followupId
    || source.metadata?.followup_id
    || null;
}

function eventKey(source) {
  const explicit = source.eventId || source.event_id || source.id;
  if (explicit) return `id:${explicit}`;
  if (source.run_id != null && source.seq != null) return `seq:${source.run_id}:${source.seq}`;
  if (source.seq != null) return `seq:${source.seq}`;
  return null;
}

function canonicalMeta(source, taskId) {
  return {
    taskId: taskId || source.taskId || source.task_id || null,
    runId: source.run_id || source.runId || null,
    conversationId: source.conversation_id || source.conversationId || null,
    remoteEventId: source.eventId || source.event_id || source.id || null,
    remoteSeq: source.seq ?? null,
    occurredAt: source.occurredAt || source.occurred_at || source.timestamp || null,
    protocolType: source.type || null
  };
}

function executionFields(source = {}) {
  const payload = source.payload && typeof source.payload === "object" ? source.payload : source;
  const fields = {};
  for (const key of [
    "source", "accepted", "commandId", "queue", "status", "action", "actionType", "channel",
    "leadId", "lead_id", "replyId", "reply_id", "messageId", "message_id", "videoId", "video_id",
    "deliveryState", "errorCode", "error_code", "reason", "retryable", "score", "tier", "count",
    "leads", "candidates", "resultSnapshot", "result_snapshot", "artifacts", "artifact", "file"
  ]) {
    if (payload[key] !== undefined) fields[key] = payload[key];
  }
  if (fields.leadId == null && fields.lead_id != null) fields.leadId = fields.lead_id;
  if (fields.errorCode == null && fields.error_code != null) fields.errorCode = fields.error_code;
  return fields;
}

function lifecycleStatus(source = {}) {
  return String(source.status || source.data?.status || "SUCCEEDED").trim().toUpperCase();
}

function lifecycleKind(status) {
  if (["FAILED", "ERROR", "CANCELLED", "REJECTED"].includes(status)) return "error";
  if (["PENDING", "QUEUED", "RUNNING", "WAITING", "PROCESSING", "DISPATCHED"].includes(status)) return "pending";
  return "done";
}

// Server stage identities are authoritative. Keep the UI label mapping here
// so an event without display metadata never falls back to a demo operator.
const REMOTE_AGENT_PRESENTATION = Object.freeze({
  chief_of_staff: Object.freeze({ agentName: "幕僚长", skill: "需求理解与任务编排" }),
  acquisition_strategist: Object.freeze({ agentName: "账号发现与解析师", skill: "账号发现与解析" }),
  lead_miner: Object.freeze({ agentName: "线索猎人", skill: "公开作品与评论采集" }),
  lead_analyst: Object.freeze({ agentName: "线索分析师", skill: "购车意向分层" }),
  prospect_researcher: Object.freeze({ agentName: "客户研究员", skill: "线索证据简报" }),
  risk_specialist: Object.freeze({ agentName: "风险专员", skill: "风险与触达边界审查" })
});

function remoteAgentPresentation(agentId, value = {}) {
  const known = REMOTE_AGENT_PRESENTATION[agentId] || {};
  return {
    agentName: value.agentName || value.agent_name || known.agentName || agentId || "服务端 Agent",
    agentType: value.agentType || value.agent_type || agentId || null,
    skillId: value.skillId || value.skill_id || null,
    skill: value.skill || known.skill || null
  };
}

export function createGatewayEventAdapter({ taskId = null, onEvent = null } = {}) {
  const seen = new Set();
  const streams = new Map();
  const subagents = new Map();
  const output = (source, event) => {
    const canonical = { ...canonicalMeta(source, taskId), ...event };
    if (typeof onEvent === "function") onEvent(canonical);
    return canonical;
  };

  function accept(source = {}) {
    if (!source || typeof source !== "object") return [];
    const key = eventKey(source);
    if (key && seen.has(key)) return [];
    if (key) seen.add(key);

    const type = source.type || source.event;
    const meta = canonicalMeta(source, taskId);
    const emitted = [];
    const push = (event) => emitted.push(output(source, { ...meta, ...event }));
    const ensureSubagent = (agentId, value = {}) => {
      const existing = subagents.get(agentId);
      if (existing) return existing;
      const presentation = remoteAgentPresentation(agentId, value);
      const known = { index: subagents.size, ...presentation, ...value, agentId };
      subagents.set(agentId, known);
      push({
        t: "sub-start",
        i: known.index,
        agentId,
        agentName: known.agentName,
        agentType: known.agentType,
        skillId: known.skillId,
        skill: known.skill,
        text: value.text || null
      });
      push({
        t: "sub-accepted",
        i: known.index,
        agentId,
        agentName: known.agentName,
        agentType: known.agentType,
        skillId: known.skillId,
        skill: known.skill
      });
      push({
        t: "sub-started",
        i: known.index,
        agentId,
        agentName: known.agentName,
        agentType: known.agentType,
        skillId: known.skillId,
        skill: known.skill
      });
      return known;
    };
    const id = streamKey(source);

    if (type === "RUN_STARTED") {
      push({ t: "run-started" });
      push({ t: "progress-start" });
    } else if (type === "TEXT_MESSAGE_START") {
      const followupId = followupIdOf(source);
      streams.set(id, { text: "", followupId });
      push({ t: followupId ? "followup-stream-start" : "chief-stream-start", streamId: id, followupId });
    } else if (type === "TEXT_MESSAGE_CONTENT") {
      const delta = String(source.delta ?? source.text ?? source.content ?? "");
      const stream = streams.get(id) || { text: "", followupId: followupIdOf(source) };
      stream.text = `${stream.text || ""}${delta}`;
      stream.followupId ||= followupIdOf(source);
      streams.set(id, stream);
      push({ t: stream.followupId ? "followup-stream-delta" : "chief-stream-delta", streamId: id, followupId: stream.followupId || null, text: delta });
    } else if (type === "TEXT_MESSAGE_END") {
      const stream = streams.get(id) || { text: String(source.text || ""), followupId: followupIdOf(source) };
      const followupId = stream.followupId || followupIdOf(source);
      push({ t: followupId ? "followup-stream-end" : "chief-stream-end", streamId: id, followupId: followupId || null, text: stream.text || String(source.text || "") });
      streams.delete(id);
    } else if (["FOLLOWUP_COMPLETED", "followup.completed"].includes(type)) {
      const followupId = followupIdOf(source);
      push({ t: "followup-chief", followupId, text: source.text || source.data?.text || source.message || "" });
    } else if (["FOLLOWUP_FAILED", "followup.failed"].includes(type)) {
      const followupId = followupIdOf(source);
      push({ t: "followup-failed", followupId, text: source.text || source.error?.message || "追问未送达，请稍后重试。", errorCode: source.errorCode || source.error_code || null, retryable: source.retryable !== false });
    } else if (["APPROVAL_REQUESTED", "approval.requested"].includes(type)) {
      push({
        t: "approval-show",
        approval: source.approval || source.data?.approval || {},
        approvalId: source.approval?.id || source.data?.approval?.id || source.approvalId || null,
        text: source.text || "有一项对外动作需要你确认。"
      });
    } else if (["APPROVAL_RESOLVED", "approval.resolved"].includes(type)) {
      push({
        t: "approval-resolved",
        ok: Boolean(source.ok ?? source.approved ?? source.data?.ok),
        approval: source.approval || source.data?.approval || {},
        approvalId: source.approvalId || source.approval?.id || source.data?.approval?.id || null,
        selectedIds: source.selectedIds || source.data?.selectedIds || []
      });
    } else if (["TASK_PAUSED", "task.paused"].includes(type)) {
      push({ t: "task-paused", reason: source.reason || source.text || "任务已暂停" });
    } else if (["TASK_RESUMED", "task.resumed"].includes(type)) {
      push({ t: "task-resumed", stage: source.stage || source.data?.stage || null });
    } else if (["RETRY_STARTED", "TASK_RETRY_STARTED", "task.retry_started"].includes(type)) {
      push({ t: "task-retry-requested", stepId: source.stepId || source.data?.stepId || null });
    } else if (["HANDOFF_REQUESTED", "HANDOFF_ACCEPTED", "HUMAN_TAKEOVER", "handoff"].includes(type)) {
      push({ t: "handoff", reason: source.reason || source.text || "已转人工处理" });
    } else if (["LEAD_REPLIED", "lead.replied"].includes(type)) {
      push({
        t: "lead-replied",
        replyText: source.replyText || source.text || source.data?.replyText || "收到新的客户回复",
        ...executionFields(source)
      });
    } else if (["LEAD_DO_NOT_CONTACT", "lead.do_not_contact"].includes(type)) {
      push({ t: "lead-do-not-contact", reason: source.reason || source.text || "客户已拒绝继续触达", ...executionFields(source) });
    } else if (["TASK_EXECUTION_ACCEPTED", "task.execution.accepted"].includes(type)) {
      push({
        t: "dispatch",
        text: source.text || "任务已进入真实执行队列",
        ...executionFields(source)
      });
    } else if (["ACCOUNT_RESOLVED", "account.resolved"].includes(type)) {
      push({
        t: "account-resolved",
        agentId: source.agentId || source.agent_id || "acquisition_strategist",
        skillId: source.skillId || source.skill_id || "account_resolution",
        account: source.account || source.data?.account || null,
        text: source.text || "目标账号已解析"
      });
    } else if (["LEAD_SOURCE_SYNCED", "lead.source.synced"].includes(type)) {
      push({
        t: "lead-candidate",
        text: source.text || "已同步新的线索来源",
        ...executionFields(source)
      });
    } else if (["LEAD_CANDIDATE", "lead.candidate"].includes(type)) {
      push({ t: "lead-candidate", ...executionFields(source) });
    } else if (["LEAD_QUALIFIED", "lead.qualified"].includes(type)) {
      push({ t: "lead-qualified", ...executionFields(source) });
    } else if (["LEAD_REJECTED", "lead.rejected"].includes(type)) {
      push({ t: "lead-rejected", ...executionFields(source) });
    } else if (["OUTREACH_SCHEDULED", "outreach.scheduled"].includes(type)) {
      push({ t: "outreach-scheduled", at: source.at || source.scheduledAt || source.data?.scheduledAt || null, ...executionFields(source) });
    } else if (["OUTREACH_SENDING", "outreach.sending"].includes(type)) {
      push({ t: "outreach-sending", ...executionFields(source) });
    } else if (["OUTREACH_SENT", "outreach.sent"].includes(type)) {
      push({ t: "outreach-sent", deliveryState: source.deliveryState || source.data?.deliveryState || "submitted", ...executionFields(source) });
    } else if (["DELIVERY_CHECKING", "delivery.checking"].includes(type)) {
      push({ t: "delivery-checking" });
    } else if (["OUTREACH_FAILED", "outreach.failed"].includes(type)) {
      push({ t: "outreach-failed", errorCode: source.errorCode || source.data?.errorCode || null, retryable: source.retryable !== false, text: source.text || source.reason || "触达执行失败", ...executionFields(source) });
    } else if (["ARTIFACT_CREATED", "FILE_CREATED", "artifact.created"].includes(type)) {
      const artifact = source.artifact || source.file || source.data?.artifact || source.data?.file || {};
      push({ t: "file", id: artifact.id || source.id, name: artifact.name || source.name || "未命名产出", ftype: artifact.type || artifact.ftype || "doc", artifact });
    } else if (["RESULT_UPDATED", "task.result.updated", "result.snapshot.updated"].includes(type)) {
      const resultSnapshot = source.resultSnapshot || source.result_snapshot || source.result || source.data?.resultSnapshot || null;
      const artifacts = source.artifacts || source.data?.artifacts || [];
      for (const artifact of Array.isArray(artifacts) ? artifacts : []) {
        push({ t: "file", id: artifact.id, name: artifact.name || "未命名产出", ftype: artifact.type || artifact.ftype || "doc", artifact });
      }
      // A partial result must not terminate the task. It is still emitted so
      // consumers that maintain a projection can update their result card.
      push({ t: "result-updated", resultSnapshot, artifacts });
    } else if (["AGENT_STAGE_STARTED", "agent.stage.started"].includes(type)) {
      const agentId = source.agentId || source.agent_id || source.stage || `${id}-stage-${subagents.size}`;
      const existed = subagents.has(agentId);
      const presentation = remoteAgentPresentation(agentId, source);
      const known = ensureSubagent(agentId, {
        agentId,
        ...presentation,
        agentName: source.stageName || presentation.agentName,
        skillId: source.skillId || source.skill_id || presentation.skillId,
        skill: source.skill || presentation.skill
      });
      if (existed) {
        push({
          t: "sub-started",
          i: known.index,
          agentId,
          agentName: source.agentName || source.agent_name || known.agentName,
          agentType: source.agentType || source.agent_type || known.agentType || agentId,
          skillId: source.skillId || source.skill_id || known.skillId || null,
          skill: source.skill || known.skill || null,
          text: source.text || source.data?.text || "已开始处理这一步。"
        });
      }
    } else if (["AGENT_STAGE_COMPLETED", "agent.stage.completed", "prospect.discovery.completed"].includes(type)) {
      const agentId = source.agentId || source.agent_id || source.stage || `${id}-stage-${subagents.size}`;
      const presentation = remoteAgentPresentation(agentId, source);
      const known = ensureSubagent(agentId, {
        agentId,
        ...presentation,
        agentName: source.stageName || presentation.agentName,
        skillId: source.skillId || source.skill_id || presentation.skillId,
        skill: source.skill || presentation.skill
      });
      const status = lifecycleStatus(source);
      const kind = lifecycleKind(status);
      const common = {
        i: known.index,
        agentId,
        agentName: source.agentName || source.agent_name || known.agentName,
        agentType: source.agentType || source.agent_type || known.agentType || agentId,
        skillId: source.skillId || source.skill_id || known.skillId || null,
        skill: source.skill || known.skill || null,
        status,
        text: source.text || source.data?.text || null
      };
      if (kind === "pending") {
        push({
          t: "sub-log",
          ...common,
          pct: source.pct ?? source.progress ?? source.data?.pct ?? 0,
          text: common.text || "已提交真实数据采集，等待异步回调，尚未完成这一步。",
          evidence: Array.isArray(source.evidence) ? source.evidence : []
        });
      } else if (kind === "error") {
        push({
          t: "sub-error",
          ...common,
          text: common.text || "这一步执行失败，未产生可核验结果。",
          errorCode: source.errorCode || source.error_code || source.data?.errorCode || null
        });
      } else {
        push({
          t: "sub-done",
          ...common,
          text: common.text || "这一步已完成，结果已交给下一位 Agent。"
        });
      }
      const resultSnapshot = source.resultSnapshot || source.result_snapshot || source.data?.resultSnapshot || null;
      if (resultSnapshot) push({ t: "result-updated", resultSnapshot, artifacts: source.artifacts || [] });
    } else if (["REQUIREMENT_CONFIRMED", "task.requirement.confirmed"].includes(type)) {
      push({ t: "requirement-confirmed", proposal: source.proposal || source.data?.proposal || null, text: source.text || "需求已确认" });
    } else if (["ASSIGNMENT_PROPOSED", "task.assignment.proposed", "plan.assignment.proposed"].includes(type)) {
      push({
        t: "assignment-plan",
        protocolType: "ASSIGNMENT_PROPOSED",
        assignments: source.assignments || source.data?.assignments || source.assignment?.assignments || source.data?.assignment?.assignments || [],
        text: source.text || "任务已拆解，责任 Agent 已锁定。"
      });
    } else if (["ACCESS_REQUIRED", "access.authorization.requested", "access.scope.requested"].includes(type)) {
      push({
        t: source.authorizationStarted || source.data?.authorizationStarted ? "auth-started" : "auth-required",
        provider: source.provider || source.data?.provider || "抖音账号",
        account: source.account || source.accountLabel || source.data?.account || source.data?.accountLabel || "",
        scopes: source.scopes || source.data?.scopes || [],
        text: source.text || "需要确认账号授权。"
      });
    } else if (["SCOPE_CONFIRMED", "access.scope.confirmed"].includes(type)) {
      push({
        t: "scope-confirmed",
        provider: source.provider || source.data?.provider || "抖音账号",
        account: source.account || source.accountLabel || source.data?.account || source.data?.accountLabel || "",
        browserSessionId: source.browserSessionId || source.data?.browserSessionId || null,
        scopes: source.scopes || source.data?.scopes || [],
        text: source.text || "授权范围已确认，任务可以开始执行。"
      });
    } else if (["ACCESS_GRANTED", "access.authorization.granted"].includes(type)) {
      const stage = source.stage || source.data?.stage || "authorization";
      if (stage === "scope") {
        push({
          t: "scope-confirmed",
          provider: source.provider || source.data?.provider || "抖音账号",
          account: source.account || source.accountLabel || source.data?.account || source.data?.accountLabel || "",
          browserSessionId: source.browserSessionId || source.data?.browserSessionId || null,
          scopes: source.scopes || source.data?.scopes || [],
          text: source.text || "授权范围已确认，任务可以开始执行。"
        });
      } else {
        push({
          t: "auth-granted",
          provider: source.provider || source.data?.provider || "抖音账号",
          account: source.account || source.accountLabel || source.data?.account || source.data?.accountLabel || "",
          browserSessionId: source.browserSessionId || source.data?.browserSessionId || null,
          text: source.text || "账号已完成真实登录核验。"
        });
        push({
          t: "scope-required",
          provider: source.provider || source.data?.provider || "抖音账号",
          account: source.account || source.accountLabel || source.data?.account || source.data?.accountLabel || "",
          browserSessionId: source.browserSessionId || source.data?.browserSessionId || null,
          scopes: source.scopes || source.data?.scopes || [],
          text: "请选择本次任务允许读取和执行的范围。"
        });
      }
    } else if (["ACCESS_CANCELLED", "access.authorization.cancelled"].includes(type)) {
      push({ t: "auth-cancelled", text: source.text || "账号授权未完成，任务保持暂停。", reason: source.reason || "cancelled" });
    } else if (["REQUIREMENT_PROPOSED", "task.requirement.proposed", "requirement.proposed"].includes(type)) {
      const proposal = source.proposal || source.data?.proposal || source.requirement || source.data?.requirement || null;
      if (proposal) push({ t: "requirement-proposed", proposal, source: proposal.source || source.source || "model" });
    } else if (type === "CUSTOM" && source.name === "subagent_start") {
      const value = source.value || {};
      const agentId = value.agentId || value.agent_id || `${id}-sub-${subagents.size}`;
      const index = subagents.size;
      subagents.set(agentId, { index, ...value });
      push({
        t: "sub-start",
        i: index,
        agentId,
        agentName: value.agentName || value.agent_name || "项目执行 Agent",
        agentType: value.agentType || value.agent_type || value.agentId || null,
        skillId: value.skillId || value.skill_id || null,
        skill: value.skill || null,
        text: value.text || null
      });
      push({
        t: "sub-accepted",
        i: index,
        agentId,
        agentName: value.agentName || value.agent_name || "项目执行 Agent",
        agentType: value.agentType || value.agent_type || value.agentId || null,
        skillId: value.skillId || value.skill_id || null,
        skill: value.skill || null
      });
      push({
        t: "sub-started",
        i: index,
        agentId,
        agentName: value.agentName || value.agent_name || "项目执行 Agent",
        agentType: value.agentType || value.agent_type || value.agentId || null,
        skillId: value.skillId || value.skill_id || null,
        skill: value.skill || null
      });
    } else if (type === "CUSTOM" && source.name === "subagent_end") {
      const value = source.value || {};
      const agentId = value.agentId || value.agent_id || `${id}-sub-${subagents.size}`;
      const known = ensureSubagent(agentId, value);
      const status = lifecycleStatus(value);
      const kind = lifecycleKind(status);
      push({
        t: kind === "error" ? "sub-error" : kind === "pending" ? "sub-log" : "sub-done",
        i: known.index,
        agentId,
        agentName: value.agentName || value.agent_name || known.agentName || "项目执行 Agent",
        agentType: value.agentType || value.agent_type || known.agentType || value.agentId || null,
        skillId: value.skillId || value.skill_id || known.skillId || null,
        skill: value.skill || known.skill || null,
        status,
        pct: value.pct ?? value.progress ?? 0,
        text: value.text || (kind === "error" ? "这一步没有顺利完成，任务已暂停。" : kind === "pending" ? "已提交处理，等待真实结果回传，尚未完成这一步。" : "我已完成这一步，结果和工作依据已经整理好。"),
        errorCode: value.errorCode || value.error_code || null
      });
    } else if (type === "CUSTOM" && ["subagent_log", "subagent_progress"].includes(source.name)) {
      const value = source.value || {};
      const agentId = value.agentId || value.agent_id;
      const known = ensureSubagent(agentId, value);
      push({
        t: "sub-log",
        i: known.index,
        agentId,
        agentName: value.agentName || value.agent_name || known.agentName || "项目执行 Agent",
        agentType: value.agentType || value.agent_type || known.agentType || value.agentId || null,
        skillId: value.skillId || value.skill_id || known.skillId || null,
        skill: value.skill || known.skill || null,
        text: value.text || value.message || "已取得新的工作进展。",
        lineIndex: value.lineIndex ?? value.line_index ?? 0,
        pct: value.pct ?? value.progress ?? 0,
        evidence: Array.isArray(value.evidence) ? value.evidence : []
      });
    } else if (type === "RUN_FINISHED") {
      push({ t: "run-finished", text: source.text || "" });
      for (const artifact of source.artifacts || source.data?.artifacts || []) {
        push({ t: "file", id: artifact.id, name: artifact.name || "未命名产出", ftype: artifact.type || "doc", artifact });
      }
      push({
        t: "summary",
        text: source.text || "任务已完成，结果正在整理",
        resultSnapshot: source.resultSnapshot || source.result || source.data?.resultSnapshot || null,
        artifacts: source.artifacts || source.data?.artifacts || []
      });
    } else if (type === "RUN_ERROR") {
      const error = source.error || source.data?.error || {};
      push({
        t: "task-error",
        text: source.text || error.message || source.reason || "任务执行失败，等待处理。",
        errorCode: source.errorCode || source.error_code || error.code || null,
        retryable: source.retryable !== false,
        ...executionFields(source)
      });
    }
    return emitted;
  }

  return {
    accept,
    reset() {
      seen.clear();
      streams.clear();
      subagents.clear();
    }
  };
}
