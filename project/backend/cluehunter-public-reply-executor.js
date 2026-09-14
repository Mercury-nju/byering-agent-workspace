/**
 * Real ClueHunter executor for public replies to Douyin video comments.
 *
 * This adapter is intentionally strict: a public reply without a stable
 * comment/video locator or a bound RPA execution identity must never be
 * dispatched, and it never falls back to private-message sending.
 */

const ACTION_TYPE = 23;
const ACTION = "video_comment_reply";

export class ClueHunterPublicReplyError extends Error {
  constructor(message, code, details = {}, statusCode = 400) {
    super(message);
    this.name = "ClueHunterPublicReplyError";
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

function locationFrom(input) {
  const lead = input?.lead || {};
  const source = lead?.source || {};
  return {
    commentId: pick(lead.commentId, lead.comment_id, lead.commentID, source.commentId, source.comment_id),
    videoId: pick(lead.videoId, lead.video_id, source.videoId, source.video_id),
    videoUrl: pick(lead.videoUrl, lead.video_url, source.videoUrl, source.video_url, source.url)
  };
}

function targetFrom(input) {
  const lead = input?.lead || {};
  return {
    secUid: pick(lead.secUid, lead.sec_uid, lead.targetSecUid, lead.target_sec_uid),
    secId: pick(lead.secId, lead.sec_id, lead.targetSecId, lead.target_sec_id),
    openId: pick(lead.externalUserId, lead.external_user_id, lead.userId, lead.user_id, lead.openId, lead.open_id),
    nickname: pick(lead.nickname, lead.account, lead.name)
  };
}

function executionIdentityFrom(input, resolvedIdentity = null) {
  const account = input?.account || {};
  const identity = resolvedIdentity !== null && resolvedIdentity !== undefined
    ? resolvedIdentity
    : (input?.executionIdentity || {});
  const uid = pick(
    identity.uid, identity.executorUid, identity.executor_uid, identity.robotUid, identity.robot_uid,
    account.executorUid, account.executor_uid, account.rpaUid, account.rpa_uid,
    account.robotUid, account.robot_uid, account.uid
  );
  const tenant = pick(identity.tenant, identity.tenantId, identity.tenant_id, account.tenant, account.tenantId, account.tenant_id);
  return { uid, tenant };
}

function contextFrom(input) {
  const context = input?.taskContext || input?.task?.context || input?.context || {};
  return {
    agentId: pick(context.agentId, context.agent_id),
    taskId: pick(context.taskId, context.task_id),
    taskRunId: pick(context.taskRunId, context.task_run_id, context.runId, context.run_id),
    conversationId: pick(context.conversationId, context.conversation_id),
    accountId: pick(context.accountId, context.account_id)
  };
}

function requireContext(context) {
  for (const field of ["agentId", "taskId", "taskRunId", "conversationId", "accountId"]) {
    if (!context[field]) {
      throw new ClueHunterPublicReplyError(`ClueHunter public reply requires ${field}`, "CLUEHUNTER_CONTEXT_REQUIRED", { field });
    }
  }
  if (context.agentId !== "mkt-comment-acquisition") {
    throw new ClueHunterPublicReplyError("Public comment replies must remain bound to mkt-comment-acquisition", "DOUYIN_PUBLIC_REPLY_AGENT_INVALID", { agentId: context.agentId });
  }
}

function buildSubmitPayload(input) {
  const content = nonEmpty(input?.content);
  if (!content) throw new ClueHunterPublicReplyError("Public reply content is required", "DOUYIN_PUBLIC_REPLY_CONTENT_REQUIRED");

  const location = locationFrom(input);
  if (!location.commentId || (!location.videoId && !location.videoUrl)) {
    throw new ClueHunterPublicReplyError(
      "Public reply requires commentId and videoId or videoUrl",
      "DOUYIN_PUBLIC_REPLY_LOCATION_REQUIRED",
      { required: ["commentId", "videoId|videoUrl"] }
    );
  }

  const target = targetFrom(input);
  if (!target.secUid && !target.secId && !target.openId) {
    throw new ClueHunterPublicReplyError(
      "Public reply requires a stable target user identifier",
      "DOUYIN_PUBLIC_REPLY_TARGET_REQUIRED",
      { required: ["secUid|secId|externalUserId|userId"] }
    );
  }

  const identity = executionIdentityFrom(input);
  if (!isNumericIdentity(identity.uid) || !isNumericIdentity(identity.tenant)) {
    throw new ClueHunterPublicReplyError(
      "Public reply requires a numeric ClueHunter tenant and robot uid bound to this Agent account",
      "CLUEHUNTER_EXECUTION_IDENTITY_REQUIRED",
      { required: ["server RPA tenant", "server RPA robot uid"] }
    );
  }

  const context = contextFrom(input);
  requireContext(context);
  const idempotencyKey = pick(input.reqId, input.requestId, input.touch?.requestId);
  if (!idempotencyKey) throw new ClueHunterPublicReplyError("Public reply request id is required", "DOUYIN_PUBLIC_REPLY_REQUEST_ID_REQUIRED");

  const account = input?.account || {};
  return {
    uid: identity.uid,
    tenant: identity.tenant,
    ...context,
    actionType: ACTION_TYPE,
    action: ACTION,
    idempotencyKey,
    channel: "video_comment",
    commentId: location.commentId,
    ...(location.videoId ? { videoId: location.videoId } : {}),
    ...(location.videoUrl ? { videoUrl: location.videoUrl } : {}),
    ...(target.secUid ? { consumerSecUid: target.secUid } : {}),
    ...(target.secId ? { consumerOpenId: target.secId } : {}),
    ...(target.openId ? { consumerOpenId: target.openId } : {}),
    ...(target.nickname ? { consumerNickname: target.nickname } : {}),
    ...(pick(account.secId, account.sec_id) ? { operatedAccountSecId: pick(account.secId, account.sec_id) } : {}),
    ...(pick(account.nickname, account.account) ? { operatedNickname: pick(account.nickname, account.account) } : {}),
    content
  };
}

export function createClueHunterPublicReplyExecutor({ clueHunterService, executionIdentityProvider = null } = {}) {
  return async function sendPublicReply(input = {}) {
    if (!clueHunterService || typeof clueHunterService.submit !== "function") {
      throw new ClueHunterPublicReplyError("ClueHunter submit service is unavailable", "CLUEHUNTER_SUBMIT_UNAVAILABLE", {}, 503);
    }
    const resolvedIdentity = typeof executionIdentityProvider === "function"
      ? await executionIdentityProvider({
        agentId: contextFrom(input).agentId,
        taskContext: input.taskContext || input.task?.context || input.context || {},
        account: input.account || {},
        lead: input.lead || {}
      })
      : undefined;
    const payload = buildSubmitPayload(
      resolvedIdentity !== undefined
        ? { ...input, executionIdentity: resolvedIdentity || {} }
        : input
    );
    const result = await clueHunterService.submit(payload);
    if (!result?.accepted) {
      throw new ClueHunterPublicReplyError("ClueHunter did not accept the public reply", "CLUEHUNTER_SUBMIT_REJECTED", { result });
    }
    const commandId = pick(result.commandId, result.command_id, result.submission?.commandId, result.submission?.id);
    if (!commandId) {
      throw new ClueHunterPublicReplyError("ClueHunter accepted without a command id", "CLUEHUNTER_SUBMIT_RECEIPT_INVALID", { result });
    }
    return {
      ok: true,
      state: "accepted",
      message_id: commandId,
      commandId,
      queue: pick(result.queue, result.submission?.queue),
      status: pick(result.status, result.submission?.status) || "QUEUED"
    };
  };
}
