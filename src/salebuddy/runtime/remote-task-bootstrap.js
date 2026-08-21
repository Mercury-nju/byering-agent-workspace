import { COMMAND_TYPES } from "./task-protocol.js";

export class RemoteTaskBootstrapError extends Error {
  constructor(message, { code = "REMOTE_TASK_BOOTSTRAP_FAILED", cause } = {}) {
    super(message);
    this.name = "RemoteTaskBootstrapError";
    this.code = code;
    this.cause = cause;
  }
}

function responseData(response) {
  const outer = response && typeof response === "object" ? response : {};
  const data = outer.data && typeof outer.data === "object" ? outer.data : outer;
  return data.data && typeof data.data === "object" ? { ...data, ...data.data } : data;
}

export function remoteTaskIdentity(response) {
  const data = responseData(response);
  return {
    taskId: data.taskId || data.task_id || null,
    taskRunId: data.taskRunId || data.task_run_id || data.runId || data.run_id || null,
    conversationId: data.conversationId || data.conversation_id || null,
    currentVersion: data.currentVersion ?? data.version ?? null,
    currentSeq: data.currentSeq ?? data.seq ?? null,
    requirement: data.requirement || data.requirementProposal || data.requirement_proposal || null
  };
}

function requireRemoteIdentity(identity, stage) {
  if (!identity.taskId || !identity.taskRunId || !identity.conversationId) {
    throw new RemoteTaskBootstrapError(`服务端${stage}没有返回完整任务身份`, {
      code: "REMOTE_TASK_IDENTITY_INCOMPLETE"
    });
  }
  return identity;
}

/** Create the authoritative server task without leaking the local UI task id. */
export async function createRemoteTask({ commandClient, taskText, projectId, projectName, localTaskId, scenario } = {}) {
  if (!commandClient || typeof commandClient.send !== "function") {
    throw new RemoteTaskBootstrapError("在线任务缺少命令客户端", { code: "REMOTE_COMMAND_CLIENT_REQUIRED" });
  }
  try {
    const response = await commandClient.send(COMMAND_TYPES.TASK_CREATE, {
      commandId: localTaskId ? `task-create-${localTaskId}` : undefined,
      idempotencyKey: localTaskId ? `task-create-${localTaskId}` : undefined,
      correlationId: localTaskId || undefined,
      metadata: { clientTaskId: localTaskId || null },
      payload: {
        goal: taskText,
        projectId: projectId || null,
        projectName: projectName || null,
        scenario: scenario || null
      }
    });
    return { response, ...requireRemoteIdentity(remoteTaskIdentity(response), "任务创建响应") };
  } catch (error) {
    if (error instanceof RemoteTaskBootstrapError) throw error;
    throw new RemoteTaskBootstrapError(`服务端任务创建失败：${error?.message || "连接异常"}`, {
      code: "REMOTE_TASK_CREATE_FAILED",
      cause: error
    });
  }
}

/** Move the authoritative task into RUNNING before opening the AG-UI run stream. */
export async function startRemoteTask({ commandClient, identity, taskText, projectId, projectName, localTaskId, requirementsConfirmed = false, requiresAccess = false } = {}) {
  const remote = requireRemoteIdentity(identity || {}, "任务启动前");
  try {
    const response = await commandClient.send(COMMAND_TYPES.TASK_START, {
      commandId: `task-start-${remote.taskId}-${remote.currentVersion ?? 0}`,
      idempotencyKey: `task-start-${remote.taskId}-${remote.currentVersion ?? 0}`,
      taskId: remote.taskId,
      taskRunId: remote.taskRunId,
      conversationId: remote.conversationId,
      expectedVersion: remote.currentVersion ?? 0,
      correlationId: localTaskId || undefined,
      payload: {
        goal: taskText,
        projectId: projectId || null,
        projectName: projectName || null,
        requirementsConfirmed: requirementsConfirmed === true,
        requiresAccess: requiresAccess === true
      }
    });
    return { response, ...remoteTaskIdentity(response), taskId: remote.taskId, taskRunId: remote.taskRunId, conversationId: remote.conversationId };
  } catch (error) {
    if (error instanceof RemoteTaskBootstrapError) throw error;
    throw new RemoteTaskBootstrapError(`服务端任务启动失败：${error?.message || "连接异常"}`, {
      code: "REMOTE_TASK_START_FAILED",
      cause: error
    });
  }
}
