const PRIVATE_ACTIONS = new Set(["private_message", "private_message_without_follow"]);
const COMMENT_ACTIONS = new Set(["video_comment_reply", "barrage_reply"]);

export class LocalBrowserExecutorError extends Error {
  constructor(message, { code = "LOCAL_BROWSER_EXECUTOR_ERROR", statusCode = 503, details = {} } = {}) {
    super(message);
    this.name = "LocalBrowserExecutorError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

function text(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function recipientValue(request = {}, key) {
  const recipient = request.recipient && typeof request.recipient === "object" ? request.recipient : {};
  return text(request[key]) || text(recipient[key]);
}

function normalizeAction(request = {}) {
  const actionType = text(request.actionType || request.action || request.channel)?.toLowerCase();
  if (!actionType || (!PRIVATE_ACTIONS.has(actionType) && !COMMENT_ACTIONS.has(actionType))) {
    throw new LocalBrowserExecutorError("本机浏览器执行器不支持该外部动作", {
      code: "LOCAL_ACTION_UNSUPPORTED",
      statusCode: 400,
      details: { actionType: actionType || null }
    });
  }
  const message = text(request.message || request.content);
  if (!message) {
    throw new LocalBrowserExecutorError("外部动作缺少待发送内容", {
      code: "LOCAL_ACTION_INPUT_REQUIRED",
      statusCode: 400,
      details: { field: "message" }
    });
  }
  if (PRIVATE_ACTIONS.has(actionType)) {
    const profileUrl = recipientValue(request, "profileUrl") || recipientValue(request, "profile_url");
    const secUid = recipientValue(request, "secUid") || recipientValue(request, "sec_uid");
    const uniqueId = recipientValue(request, "uniqueId") || recipientValue(request, "unique_id");
    const uid = recipientValue(request, "uid") || recipientValue(request, "externalUserId");
    if (!profileUrl && !secUid && !uniqueId && !uid) {
      throw new LocalBrowserExecutorError("私信动作缺少抖音收件人身份", {
        code: "LOCAL_ACTION_INPUT_REQUIRED",
        statusCode: 400,
        details: { field: "recipient" }
      });
    }
    return { actionType, message, profileUrl, secUid, uniqueId, uid };
  }
  const videoUrl = text(request.videoUrl || request.video_url);
  const videoId = text(request.videoId || request.video_id || request.shortVideoId || request.short_video_id);
  if (!videoUrl && !videoId) {
    throw new LocalBrowserExecutorError("评论回复动作缺少作品身份", {
      code: "LOCAL_ACTION_INPUT_REQUIRED",
      statusCode: 400,
      details: { field: "videoId" }
    });
  }
  return { actionType, message, videoUrl, videoId, commentId: text(request.commentId || request.comment_id) };
}

function externalEvent(request, action, result) {
  const eventId = result.externalActionId || `${request.taskId || "task"}:${request.commandId || "command"}:outreach.sent`;
  return {
    eventId,
    type: "outreach.sent",
    taskId: request.taskId || null,
    taskRunId: request.taskRunId || null,
    source: "local-browser",
    payload: {
      actionType: action.actionType,
      status: "SENT",
      externalActionId: result.externalActionId || null,
      recipient: action.profileUrl || action.secUid || action.uniqueId || action.uid || null,
      videoId: action.videoId || null
    }
  };
}

export function createLocalBrowserExecutor({ browserWorkspace } = {}) {
  if (!browserWorkspace || typeof browserWorkspace.snapshot !== "function" || typeof browserWorkspace.execute !== "function") {
    throw new TypeError("Local browser executor requires a browser workspace with snapshot and execute");
  }

  async function assertReady(request = {}) {
    const sessionId = text(request.browserSessionId || request.browser_session_id);
    if (!sessionId) {
      throw new LocalBrowserExecutorError("真实触达必须绑定本机浏览器会话", {
        code: "BROWSER_SESSION_REQUIRED",
        statusCode: 409
      });
    }
    const session = await browserWorkspace.snapshot(sessionId);
    if (session?.state !== "READY") {
      throw new LocalBrowserExecutorError("抖音本机浏览器尚未完成登录", {
        code: session?.state === "REAUTH_REQUIRED" ? "REAUTH_REQUIRED" : "AUTHORIZATION_PENDING",
        statusCode: 409,
        details: { sessionId, state: session?.state || null }
      });
    }
    return { sessionId, session };
  }

  async function submit(request = {}) {
    const action = normalizeAction(request);
    const { sessionId } = await assertReady(request);
    const result = await browserWorkspace.execute(sessionId, {
      ...action,
      taskId: request.taskId || null,
      taskRunId: request.taskRunId || null,
      commandId: request.commandId || null
    });
    if (!result || result.accepted !== true) {
      throw new LocalBrowserExecutorError("本机浏览器未确认外部动作已完成", {
        code: result?.code || "LOCAL_ACTION_NOT_CONFIRMED",
        statusCode: 502,
        details: { actionType: action.actionType }
      });
    }
    return {
      accepted: true,
      dispatched: true,
      source: "local-browser",
      kind: "local-browser",
      status: "SENT",
      actionType: action.actionType,
      externalActionId: result.externalActionId || null,
      events: [externalEvent(request, action, result)]
    };
  }

  async function lease(request = {}) {
    const { sessionId } = await assertReady(request);
    return {
      accepted: true,
      dispatched: true,
      source: "local-browser",
      kind: "local-browser",
      status: "READY",
      browserSessionId: sessionId,
      events: []
    };
  }

  return Object.freeze({
    kind: "local-browser",
    source: "local-browser",
    configured: true,
    requiresExecutorUid: false,
    submit,
    lease
  });
}
