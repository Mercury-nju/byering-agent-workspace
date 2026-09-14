/**
 * Durable ClueHunter executor for the one-off first outreach Agent.
 *
 * A command submission is intentionally not a delivery success. The caller
 * keeps the task running until the cloud RPA sends a terminal ACK through the
 * signed ClueHunter event boundary.
 */

const ACTION_TYPE = 4;
const ACTION = "private_message";
const AGENT_ID = "mkt-cold-writer";

export class ClueHunterPrivateOutreachError extends Error {
  constructor(message, code, details = {}, statusCode = 400) {
    super(message);
    this.name = "ClueHunterPrivateOutreachError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

function nonEmpty(value) {
  return value === undefined || value === null ? null : String(value).trim() || null;
}

function pick(...values) {
  for (const value of values) {
    const result = nonEmpty(value);
    if (result) return result;
  }
  return null;
}

function isNumericIdentity(value) {
  return /^\d+$/.test(String(value ?? ""));
}

function contextFrom(input = {}) {
  const context = input.taskContext || input.task?.context || input.context || {};
  return {
    agentId: pick(context.agentId, context.agent_id),
    taskId: pick(context.taskId, context.task_id),
    taskRunId: pick(context.taskRunId, context.task_run_id, context.runId, context.run_id),
    conversationId: pick(context.conversationId, context.conversation_id),
    accountId: pick(context.accountId, context.account_id)
  };
}

function targetFrom(input = {}) {
  const lead = input.lead || input.recipient || input.candidate || {};
  return {
    id: pick(lead.id, lead.leadId, lead.lead_id, lead.sourceRecordId, lead.source_record_id),
    secUid: pick(lead.secUid, lead.sec_uid, lead.targetSecUid, lead.target_sec_uid, input.secUid, input.sec_uid),
    secId: pick(lead.secId, lead.sec_id, lead.targetSecId, lead.target_sec_id, input.secId, input.sec_id),
    openId: pick(lead.externalUserId, lead.external_user_id, lead.userId, lead.user_id, lead.openId, lead.open_id),
    nickname: pick(lead.nickname, lead.name, lead.displayName, lead.display_name, input.nickname)
  };
}

function requireContext(context) {
  for (const field of ["agentId", "taskId", "taskRunId", "conversationId", "accountId"]) {
    if (!context[field]) {
      throw new ClueHunterPrivateOutreachError(`ClueHunter private outreach requires ${field}`, "CLUEHUNTER_CONTEXT_REQUIRED", { field });
    }
  }
  if (context.agentId !== AGENT_ID) {
    throw new ClueHunterPrivateOutreachError(
      "Private first outreach must remain bound to mkt-cold-writer",
      "DOUYIN_PRIVATE_OUTREACH_AGENT_INVALID",
      { agentId: context.agentId }
    );
  }
}

function requireExecutionIdentity(identity = {}) {
  const uid = pick(identity.uid, identity.executorUid, identity.executor_uid, identity.robotUid, identity.robot_uid);
  const tenant = pick(identity.tenant, identity.tenantId, identity.tenant_id);
  if (!isNumericIdentity(uid) || !isNumericIdentity(tenant)) {
    throw new ClueHunterPrivateOutreachError(
      "Private outreach requires a numeric ClueHunter tenant and robot uid bound to this Agent account",
      "CLUEHUNTER_EXECUTION_IDENTITY_REQUIRED",
      { required: ["server RPA tenant", "server RPA robot uid"] }
    );
  }
  return { uid, tenant };
}

function buildSubmitPayload(input = {}) {
  const content = nonEmpty(input.content || input.message);
  if (!content) {
    throw new ClueHunterPrivateOutreachError("Private outreach content is required", "DOUYIN_PRIVATE_OUTREACH_CONTENT_REQUIRED");
  }
  const context = contextFrom(input);
  requireContext(context);
  const target = targetFrom(input);
  if (!target.secUid && !target.secId && !target.openId) {
    throw new ClueHunterPrivateOutreachError(
      "Private outreach requires a stable target user identifier",
      "DOUYIN_PRIVATE_OUTREACH_TARGET_REQUIRED",
      { required: ["secUid|secId|externalUserId|userId"] }
    );
  }
  const identity = requireExecutionIdentity(input.executionIdentity || {});
  const idempotencyKey = pick(input.reqId, input.requestId, input.idempotencyKey);
  if (!idempotencyKey) {
    throw new ClueHunterPrivateOutreachError("Private outreach request id is required", "DOUYIN_PRIVATE_OUTREACH_REQUEST_ID_REQUIRED");
  }
  const account = input.account || {};
  return {
    uid: identity.uid,
    tenant: identity.tenant,
    ...context,
    actionType: ACTION_TYPE,
    action: ACTION,
    channel: "private_message",
    idempotencyKey,
    ...(target.id ? { leadId: target.id } : {}),
    ...(target.secUid ? { consumerSecUid: target.secUid } : {}),
    ...(target.secId ? { consumerOpenId: target.secId } : {}),
    ...(target.openId ? { consumerOpenId: target.openId } : {}),
    ...(target.nickname ? { consumerNickname: target.nickname } : {}),
    ...(pick(account.secId, account.sec_id) ? { operatedAccountSecId: pick(account.secId, account.sec_id) } : {}),
    ...(pick(account.nickname, account.account, account.name) ? { operatedNickname: pick(account.nickname, account.account, account.name) } : {}),
    content
  };
}

export function createClueHunterPrivateOutreachExecutor({ clueHunterService, executionIdentityProvider = null } = {}) {
  return async function submitPrivateOutreach(input = {}) {
    if (!clueHunterService || typeof clueHunterService.submit !== "function") {
      throw new ClueHunterPrivateOutreachError("ClueHunter submit service is unavailable", "CLUEHUNTER_SUBMIT_UNAVAILABLE", {}, 503);
    }
    const context = contextFrom(input);
    const resolvedIdentity = typeof executionIdentityProvider === "function"
      ? await executionIdentityProvider({
        agentId: context.agentId,
        taskContext: input.taskContext || input.task?.context || input.context || {},
        account: input.account || {},
        lead: input.lead || input.recipient || input.candidate || {}
      })
      : input.executionIdentity;
    const payload = buildSubmitPayload({ ...input, executionIdentity: resolvedIdentity || {} });
    const result = await clueHunterService.submit(payload);
    if (!result?.accepted) {
      throw new ClueHunterPrivateOutreachError("ClueHunter did not accept the private outreach", "CLUEHUNTER_SUBMIT_REJECTED", { result });
    }
    const commandId = pick(result.commandId, result.command_id, result.submission?.commandId, result.submission?.id);
    if (!commandId) {
      throw new ClueHunterPrivateOutreachError("ClueHunter accepted without a command id", "CLUEHUNTER_SUBMIT_RECEIPT_INVALID", { result });
    }
    return {
      accepted: true,
      state: "accepted",
      receiptPending: true,
      commandId,
      reqId: payload.idempotencyKey,
      queue: pick(result.queue, result.submission?.queue),
      status: pick(result.status, result.submission?.status) || "QUEUED",
      executorUid: payload.uid,
      executorTenant: payload.tenant
    };
  };
}
