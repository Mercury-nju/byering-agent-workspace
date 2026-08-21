import { randomUUID } from "node:crypto";
import {
  COMMAND_TYPES,
  TASK_STATES,
  createCommandEnvelope,
  createEventEnvelope,
  transitionTaskState
} from "../src/salebuddy/runtime/task-protocol.js";
import { MemoryPersistenceAdapter } from "./persistence.js";
import {
  createRequirementUnderstandingService,
  RequirementUnderstandingError,
  normalizeRequirementProposal
} from "./requirement-understanding.js";
import {
  assignmentPlanForWorkflow,
  selectWorkflowForRequirement
} from "../src/salebuddy/runtime/workflow-definitions.js";

const API_COMMAND_ALIASES = Object.freeze({
  "task.run.start": COMMAND_TYPES.TASK_START,
  "task.requirement.confirm": COMMAND_TYPES.REQUIREMENT_CONFIRM,
  "task.requirement.edit": COMMAND_TYPES.REQUIREMENT_EDIT,
  "access.authorization.start": COMMAND_TYPES.ACCESS_REQUEST,
  "access.authorization.cancel": COMMAND_TYPES.ACCESS_CANCEL,
  "access.scope.confirm": COMMAND_TYPES.ACCESS_GRANT,
  "approval.action.request": COMMAND_TYPES.APPROVAL_REQUEST,
  "approval.action.respond": COMMAND_TYPES.APPROVAL_DECISION,
  "task.followup.send": COMMAND_TYPES.REPLY
});

const EVENT_TYPES = Object.freeze({
  [COMMAND_TYPES.TASK_START]: "task.run.started",
  [COMMAND_TYPES.REQUIREMENT_REQUEST]: "task.requirement.requested",
  [COMMAND_TYPES.REQUIREMENT_EDIT]: "task.requirement.edited",
  [COMMAND_TYPES.REQUIREMENT_CONFIRM]: "task.requirement.confirmed",
  [COMMAND_TYPES.ACCESS_REQUEST]: "access.authorization.requested",
  [COMMAND_TYPES.ACCESS_CANCEL]: "access.authorization.cancelled",
  [COMMAND_TYPES.ACCESS_GRANT]: "access.authorization.granted",
  [COMMAND_TYPES.APPROVAL_REQUEST]: "approval.requested",
  [COMMAND_TYPES.APPROVAL_DECISION]: "approval.resolved",
  [COMMAND_TYPES.PAUSE]: "task.paused",
  [COMMAND_TYPES.RESUME]: "task.resumed",
  [COMMAND_TYPES.RETRY]: "task.retrying",
  [COMMAND_TYPES.CANCEL]: "task.cancelled",
  [COMMAND_TYPES.REQUEST_REPLY]: "conversation.reply.requested",
  [COMMAND_TYPES.REPLY]: "conversation.reply.received",
  [COMMAND_TYPES.HANDOFF]: "task.handoff.requested",
  [COMMAND_TYPES.HANDOFF_RESOLVE]: "task.handoff.resolved",
  [COMMAND_TYPES.COMPLETE]: "task.completed",
  [COMMAND_TYPES.FAIL]: "task.failed",
  [COMMAND_TYPES.BLOCK]: "task.blocked"
});

const EXTERNAL_TERMINAL_EVENT_TYPES = new Set([
  "task.completed",
  "task.failed",
  "task.cancelled",
  "task.blocked",
  "task.execution.failed"
]);

const EXTERNAL_EVENT_TYPES = new Set([
  ...EXTERNAL_TERMINAL_EVENT_TYPES,
  "task.execution.accepted",
  "task.integration.failed",
  "account.resolved",
  "lead.source.synced",
  "lead.candidate",
  "lead.qualified",
  "lead.rejected",
  "lead.replied",
  "lead.do_not_contact",
  "outreach.ready",
  "outreach.scheduled",
  "outreach.sending",
  "outreach.sent",
  "outreach.failed",
  "delivery.checking",
  "artifact.created",
  "task.result.updated",
  "task.result.snapshot.updated",
  "prospect.discovery.completed",
  "agent.stage.started",
  "agent.stage.completed"
]);

export class ControlPlaneError extends Error {
  constructor(message, { code = "CONTROL_PLANE_ERROR", statusCode = 400, details = {} } = {}) {
    super(message);
    this.name = "ControlPlaneError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details && typeof details === "object" ? details : {};
    Object.assign(this, details);
  }
}

/**
 * Authoritative task command store. It is synchronous by design for the
 * in-memory adapter; a durable adapter may be introduced behind this boundary.
 */
export class ControlPlane {
  constructor({ persistence = new MemoryPersistenceAdapter(), idFactory, now = () => new Date().toISOString(), defaultAgentId = "chief_of_staff", requirementService = createRequirementUnderstandingService(), browserWorkspace = null, taskDispatcher = null } = {}) {
    this.persistence = persistence;
    this.idFactory = typeof idFactory === "function" ? idFactory : () => randomUUID();
    this.now = now;
    this.defaultAgentId = defaultAgentId;
    this.requirementService = requirementService;
    this.browserWorkspace = browserWorkspace;
    this.taskDispatcher = taskDispatcher;
    this.requirementRuns = new Map();
    this.verifiedAccess = new Map();
    this.listeners = new Map();
  }

  /**
   * Async command boundary for commands that need the real requirement
   * understanding Agent. Synchronous dispatch remains available for replay,
   * state transitions, and commands that do not call a model.
   */
  async dispatchAsync(input = {}) {
    const type = normalizeApiType(input.type ?? input.commandType);
    if (type === COMMAND_TYPES.ACCESS_REQUEST && input.payload?.authorizationConfirmed === true) {
      const session = await this.verifyBrowserSession(input);
      return this.dispatchWithTaskExecution({
        ...input,
        type,
        payload: {
          ...(input.payload || {}),
          browserSessionId: session.sessionId,
          provider: input.payload.provider || session.provider || null,
          accountLabel: input.payload.accountLabel || session.accountLabel || null,
          executorUid: session.executorUid || null,
          executionContext: {
            ...(input.payload?.executionContext || {}),
            uid: session.executorUid || null
          }
        }
      });
    }
    if (type === COMMAND_TYPES.ACCESS_GRANT) {
      const idempotencyKey = input.idempotencyKey || this.makeId("idem");
      const session = await this.verifyBrowserSession(input);
      this.verifiedAccess.set(idempotencyKey, session);
      try {
        return this.dispatchWithTaskExecution({
          ...input,
          type,
          idempotencyKey,
          payload: {
            ...(input.payload || {}),
            browserSessionId: session.sessionId,
            provider: session.provider || input.payload?.provider || null,
            account: session.accountKey || input.payload?.account || null,
            executorUid: session.executorUid || null,
            executionContext: {
              ...(input.payload?.executionContext || {}),
              uid: session.executorUid || null,
              accountKey: session.accountKey || input.payload?.accountKey || null,
              provider: session.provider || input.payload?.provider || null
            }
          }
        });
      } finally {
        this.verifiedAccess.delete(idempotencyKey);
      }
    }
    if (![COMMAND_TYPES.TASK_CREATE, COMMAND_TYPES.REQUIREMENT_REQUEST, COMMAND_TYPES.REQUIREMENT_EDIT].includes(type)) {
      return this.dispatchWithTaskExecution({ ...input, type });
    }
    const initialAck = this.dispatch({ ...input, type });
    const taskId = initialAck.taskId;
    const task = this.requireTask(taskId);
    // A requirement edit must always reach the model again. Reusing the old
    // proposal here would make an edit look accepted while keeping stale
    // requirements and proposal versions.
    if (type !== COMMAND_TYPES.REQUIREMENT_EDIT && task.requirements?.status === "PROPOSED" && task.requirements.proposal) {
      return {
        ...initialAck,
        data: { ...(initialAck.data || {}), requirement: clone(task.requirements.proposal) }
      };
    }
    if (!this.requirementService || typeof this.requirementService.understand !== "function") {
      throw new ControlPlaneError("需求理解 Agent 未配置，任务不会使用前端模板继续执行", {
        code: "REQUIREMENT_AGENT_NOT_CONFIGURED",
        statusCode: 503,
        details: { taskId }
      });
    }
    const current = this.requirementRuns.get(taskId);
    if (current) return current;
    const run = this.generateRequirementProposal({ taskId, command: input, ack: initialAck })
      .finally(() => this.requirementRuns.delete(taskId));
    this.requirementRuns.set(taskId, run);
    return run;
  }

  /**
   * The synchronous command path is replay-only. Real external execution is
   * attached to this async boundary so a browser request cannot mark a task as
   * running without the configured executor receiving a lease.
   */
  async dispatchWithTaskExecution(input = {}) {
    const type = normalizeApiType(input.type ?? input.commandType);
    const task = input.taskId ? this.persistence.loadTask(input.taskId) : null;
    if (this.taskDispatcher?.assertReadyFor) {
      this.taskDispatcher.assertReadyFor({
        command: { ...input, type },
        task: task || { taskId: input.taskId || null }
      });
    }
    const ack = this.dispatch({ ...input, type });
    if (!this.taskDispatcher?.dispatch || !ack?.taskId) return ack;

    const currentTask = this.requireTask(ack.taskId);
    const executionCommand = {
      ...input,
      type,
      commandId: ack.commandId,
      idempotencyKey: ack.idempotencyKey,
      taskId: ack.taskId,
      taskRunId: ack.taskRunId,
      conversationId: ack.conversationId,
      agentId: currentTask.agentId || input.agentId || this.defaultAgentId
    };
    if (!this.taskDispatcher.shouldDispatch?.({
      command: executionCommand,
      task: currentTask,
      ack
    })) return ack;

    // A replay with the same command must not lease the same executor twice.
    const existing = this.persistence.listEvents(currentTask.taskId)
      .find((event) => event.type === "task.execution.dispatched" && event.causationId === ack.commandId);
    if (existing) {
      return {
        ...ack,
        currentSeq: existing.seq,
        data: { ...(ack.data || {}), execution: clone(existing.payload?.execution || null) }
      };
    }

    try {
      const execution = await this.taskDispatcher.dispatch({
        command: executionCommand,
        task: currentTask,
        ack
      });
      if (!execution?.dispatched) return ack;
      const executionEvents = Array.isArray(execution.events) ? execution.events : [];
      let eventSeq = currentTask.currentSeq;
      if (executionEvents.length) {
        const ingested = this.ingestExecutionEvents({
          taskId: currentTask.taskId,
          tenantId: currentTask.tenantId || currentTask.executionContext?.tenantId || null,
          events: executionEvents,
          uid: execution.uid || currentTask.executionContext?.uid || currentTask.accessRequest?.executorUid || null,
          source: execution.source || execution.executor || execution.kind || "cluehunter"
        });
        eventSeq = ingested.currentSeq;
        Object.assign(currentTask, this.requireTask(currentTask.taskId));
      }
      const event = this.appendTaskEvent(currentTask, executionEventCommand(input, type, ack), "task.execution.dispatched", {
        commandType: type,
        state: currentTask.state,
        execution: clone(execution)
      });
      return {
        ...ack,
        currentSeq: Math.max(eventSeq, event.seq),
        data: { ...(ack.data || {}), execution: clone(execution) }
      };
    } catch (error) {
      const code = error?.code || "TASK_DISPATCH_FAILED";
      const message = error?.message || "Task execution dispatch failed";
      const taskAfterFailure = this.requireTask(ack.taskId);
      const failureEvent = this.appendTaskEvent(taskAfterFailure, executionEventCommand(input, type, ack), "task.execution.failed", {
        commandType: type,
        code,
        message: safeDispatchMessage(message)
      });
      if (taskAfterFailure.state === TASK_STATES.RUNNING) {
        try {
          this.dispatch({
            type: COMMAND_TYPES.FAIL,
            taskId: taskAfterFailure.taskId,
            taskRunId: taskAfterFailure.taskRunId,
            conversationId: taskAfterFailure.conversationId,
            agentId: taskAfterFailure.agentId,
            payload: {
              reason: "TASK_DISPATCH_FAILED",
              error: { code, message: safeDispatchMessage(message) },
              failedAfterSeq: failureEvent.seq
            }
          });
        } catch {
          // Preserve the original dispatch failure. The execution.failed event
          // remains the recovery marker if a durable adapter rejects this fail.
        }
      }
      throw new ControlPlaneError("Task execution dispatch failed", {
        code: "TASK_DISPATCH_FAILED",
        statusCode: Number.isInteger(error?.statusCode) ? error.statusCode : 502,
        details: {
          causeCode: code,
          taskId: ack.taskId,
          ...(error?.details && typeof error.details === "object" ? error.details : {})
        }
      });
    }
  }

  async verifyBrowserSession(input = {}) {
    const sessionId = input.payload?.browserSessionId;
    if (!this.browserWorkspace || typeof this.browserWorkspace.authorize !== "function") {
      throw new ControlPlaneError("确认访问范围前必须由浏览器工作区验证登录状态", {
        code: "BROWSER_SESSION_VERIFICATION_REQUIRED",
        statusCode: 403
      });
    }
    if (!sessionId) {
      throw new ControlPlaneError("确认访问范围前必须绑定浏览器会话", {
        code: "BROWSER_SESSION_REQUIRED",
        statusCode: 400
      });
    }
    const session = await this.browserWorkspace.authorize(sessionId);
    // Older connector adapters returned a verified session without repeating
    // the state field. Production browser workspaces always return READY;
    // preserve that adapter contract while still rejecting explicit pending
    // or destroyed states.
    if (!session || (session.state != null && session.state !== "READY")) {
      throw new ControlPlaneError("抖音浏览器会话尚未验证完成", {
        code: "AUTHORIZATION_PENDING",
        statusCode: 409,
        details: { sessionId, state: session?.state || null }
      });
    }
    const task = this.requireTask(input.taskId);
    if (session.taskId && session.taskId !== task.taskId) {
      throw new ControlPlaneError("浏览器会话与当前任务不匹配", {
        code: "BROWSER_SESSION_TASK_MISMATCH",
        statusCode: 409,
        details: { sessionId, taskId: task.taskId, sessionTaskId: session.taskId }
      });
    }
    const requestedAccess = task.accessRequest || {};
    if (requestedAccess.provider && !providersMatch(requestedAccess.provider, session.provider)) {
      throw new ControlPlaneError("浏览器会话的平台与当前任务不匹配", {
        code: "BROWSER_SESSION_PROVIDER_MISMATCH",
        statusCode: 409,
        details: { sessionId, taskId: task.taskId }
      });
    }
    if (requestedAccess.account && !session.accountKey && !session.accountLabel) {
      throw new ControlPlaneError("浏览器会话没有返回可核验的账号身份", {
        code: "BROWSER_ACCOUNT_IDENTITY_REQUIRED",
        statusCode: 409,
        details: { sessionId, taskId: task.taskId }
      });
    }
    if (requestedAccess.account && session.accountKey && requestedAccess.account !== session.accountKey) {
      throw new ControlPlaneError("浏览器会话的账号工作区与当前任务不匹配", {
        code: "BROWSER_SESSION_ACCOUNT_MISMATCH",
        statusCode: 409,
        details: { sessionId, taskId: task.taskId }
      });
    }
    if (requestedAccess.account && session.accountLabel && requestedAccess.account !== session.accountLabel) {
      throw new ControlPlaneError("浏览器会话的账号与当前任务不匹配", {
        code: "BROWSER_SESSION_ACCOUNT_MISMATCH",
        statusCode: 409,
        details: { sessionId, taskId: task.taskId }
      });
    }
    return session;
  }

  async generateRequirementProposal({ taskId, command, ack }) {
    const task = this.requireTask(taskId);
    let proposal;
    try {
      proposal = await this.requirementService.understand({
        taskId,
        goal: task.goal,
        context: {
          projectId: command.payload?.projectId || null,
          projectName: command.payload?.projectName || null,
          scenario: command.payload?.scenario || null,
          previousProposal: task.requirements?.proposal || null
        }
      });
    } catch (error) {
      const failedTask = this.requireTask(taskId);
      const failureCode = error?.code || "REQUIREMENT_AGENT_FAILED";
      const failureMessage = error?.message || "需求理解 Agent 执行失败";
      failedTask.requirements = {
        confirmed: false,
        status: "FAILED",
        error: { code: failureCode, message: failureMessage },
        failedAt: this.now()
      };
      failedTask.updatedAt = this.now();
      this.persistence.saveTask(failedTask);
      this.appendTaskEvent(failedTask, buildEventCommand(command, ack, failedTask), "task.requirement.failed", {
        commandType: normalizeApiType(command.type ?? command.commandType),
        error: { code: failureCode, message: failureMessage },
        status: "FAILED"
      });
      if (error instanceof RequirementUnderstandingError) throw error;
      throw new ControlPlaneError(error?.message || "需求理解 Agent 执行失败", {
        code: error?.code || "REQUIREMENT_AGENT_FAILED",
        statusCode: 502,
        details: { taskId }
      });
    }
    const proposalVersion = Number(task.requirements?.proposalVersion || task.requirements?.proposal?.proposalVersion || 0) || 1;
    const normalized = clone(normalizeRequirementProposal({ ...proposal, proposalVersion }, {
      source: proposal?.source || "model",
      provider: proposal?.provider || null,
      model: proposal?.model || null,
      generatedAt: proposal?.generatedAt || this.now(),
      proposalVersion
    }));
    task.requirements = {
      confirmed: false,
      status: "PROPOSED",
      proposalVersion: normalized.proposalVersion,
      proposal: normalized,
      generatedAt: normalized.generatedAt || this.now()
    };
    task.updatedAt = this.now();
    this.persistence.saveTask(task);
    const eventCommand = buildEventCommand(command, ack, task);
    const event = this.appendTaskEvent(task, eventCommand, "task.requirement.proposed", {
      commandType: normalizeApiType(command.type ?? command.commandType),
      proposal: normalized,
      status: "PROPOSED"
    });
    const result = {
      ...ack,
      currentSeq: event.seq,
      data: { ...(ack.data || {}), requirement: normalized }
    };
    const record = this.persistence.loadCommand(ack.idempotencyKey);
    if (record) this.persistence.saveCommand(ack.idempotencyKey, { ...record, ack: result });
    return clone(result);
  }

  dispatch(input = {}) {
    const type = normalizeApiType(input.type ?? input.commandType);
    const inputPayload = type === COMMAND_TYPES.TASK_START && input.taskId
      ? enrichStartPayload(this.persistence.loadTask(input.taskId), input.payload)
      : input.payload;
    let command;
    try {
      command = createCommandEnvelope({
        ...input,
        type,
        ...(inputPayload === undefined ? {} : { payload: inputPayload }),
        commandId: input.commandId || this.makeId("cmd"),
        idempotencyKey: input.idempotencyKey || this.makeId("idem"),
        createdAt: input.createdAt || this.now()
      });
    } catch (error) {
      throw new ControlPlaneError(error.message, {
        code: error.code || "INVALID_COMMAND",
        statusCode: 400,
        details: { field: error.field }
      });
    }

    const fingerprint = stableStringify({
      schemaVersion: command.schemaVersion,
      idempotencyKey: command.idempotencyKey,
      taskId: command.taskId,
      taskRunId: command.taskRunId,
      conversationId: command.conversationId,
      agentId: command.agentId,
      expectedVersion: command.expectedVersion,
      causationId: command.causationId,
      correlationId: command.correlationId,
      type: command.type,
      payload: command.payload,
      actor: command.actor,
      metadata: command.metadata
    });
    const prior = this.persistence.loadCommand(command.idempotencyKey);
    if (prior) {
      if (prior.fingerprint !== fingerprint) {
        throw new ControlPlaneError("Idempotency key is already used for a different command", {
          code: "IDEMPOTENCY_CONFLICT",
          statusCode: 409,
          details: { commandId: command.commandId, idempotencyKey: command.idempotencyKey }
        });
      }
      return clone(prior.ack);
    }

    let ack;
    try {
      ack = this.apply(command);
    } catch (error) {
      if (error instanceof ControlPlaneError) throw error;
      throw new ControlPlaneError(error.message, {
        code: error.code || "COMMAND_REJECTED",
        statusCode: error.code === "STALE_TASK_VERSION" ? 409 : 422,
        details: { commandId: command.commandId }
      });
    }
    this.persistence.saveCommand(command.idempotencyKey, { fingerprint, ack });
    return clone(ack);
  }

  getTaskSnapshot(taskId) {
    const task = this.requireTask(taskId);
    return clone({
      taskId: task.taskId,
      taskRunId: task.taskRunId,
      conversationId: task.conversationId,
      goal: task.goal,
      state: task.state,
      version: task.version,
      currentSeq: task.currentSeq,
      agentId: task.agentId,
      tenantId: task.tenantId || task.executionContext?.tenantId || null,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      requirements: task.requirements,
      workflow: task.workflow || null,
      pendingApproval: task.pendingApproval,
      assignment: task.assignment || null,
      accessRequest: task.accessRequest || null,
      executionContext: task.executionContext || null,
      browserSessionId: task.browserSessionId || null,
      executorUid: task.executionContext?.uid || task.accessRequest?.executorUid || null,
      resultSnapshot: task.resultSnapshot || null,
      lastCommandId: task.lastCommandId
    });
  }

  listTaskEvents(taskId, options = {}) {
    this.requireTask(taskId);
    return this.persistence.listEvents(taskId, options).map(clone);
  }

  /**
   * Ingest signed connector facts into the same durable event stream used by
   * browser commands. Connector event IDs are retained inside the payload so
   * retries are idempotent without trusting their remote sequence numbers.
   */
  ingestExecutionEvents({ taskId, tenantId = null, events = [], uid = null, source = "connector" } = {}) {
    const task = this.requireTask(taskId);
    if (!Array.isArray(events) || !events.length) {
      throw new ControlPlaneError("至少需要一个外部执行事件", {
        code: "EXECUTION_EVENTS_REQUIRED",
        statusCode: 400,
        details: { taskId }
      });
    }
    const expectedUid = task.executionContext?.uid || task.accessRequest?.executorUid || null;
    const expectedTenantId = task.tenantId || task.executionContext?.tenantId || null;
    if (expectedTenantId && !tenantId) {
      throw new ControlPlaneError("外部执行事件必须包含任务租户", {
        code: "TENANT_SCOPE_REQUIRED",
        statusCode: 409,
        details: { taskId }
      });
    }
    if (tenantId && expectedTenantId && tenantId !== expectedTenantId) {
      throw new ControlPlaneError("外部执行事件与任务租户不匹配", {
        code: "TENANT_SCOPE_FORBIDDEN",
        statusCode: 409,
        details: { taskId }
      });
    }
    if (uid && expectedUid && uid !== expectedUid) {
      throw new ControlPlaneError("外部执行器与任务授权账号不匹配", {
        code: "EXECUTOR_ID_MISMATCH",
        statusCode: 409,
        details: { taskId }
      });
    }
    const existing = this.persistence.listEvents(taskId, { limit: 1000 });
    const seen = new Set(existing.map((event) => event.payload?.externalEventId).filter(Boolean));
    const accepted = [];
    for (const incoming of events) {
      if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) {
        throw new ControlPlaneError("外部执行事件格式无效", { code: "EXECUTION_EVENT_INVALID", statusCode: 400 });
      }
      const externalEventId = normalizeNullableString(incoming.eventId || incoming.event_id || incoming.id);
      const type = normalizeNullableString(incoming.type || incoming.event);
      if (!externalEventId || !type) {
        throw new ControlPlaneError("外部执行事件必须包含 eventId 和 type", {
          code: "EXECUTION_EVENT_INVALID",
          statusCode: 400,
          details: { taskId }
        });
      }
      if (!EXTERNAL_EVENT_TYPES.has(type)) {
        throw new ControlPlaneError("不支持的外部执行事件类型", {
          code: "EXECUTION_EVENT_TYPE_UNSUPPORTED",
          statusCode: 400,
          details: { taskId, type }
        });
      }
      if (seen.has(externalEventId)) continue;
      const incomingTaskId = normalizeNullableString(incoming.taskId || incoming.task_id);
      const incomingRunId = normalizeNullableString(incoming.taskRunId || incoming.task_run_id || incoming.runId || incoming.run_id);
      const incomingConversationId = normalizeNullableString(incoming.conversationId || incoming.conversation_id);
      if (incomingTaskId && incomingTaskId !== task.taskId) throw externalIdentityMismatch("taskId", task.taskId);
      if (incomingRunId && incomingRunId !== task.taskRunId) throw externalIdentityMismatch("taskRunId", task.taskRunId);
      if (incomingConversationId && incomingConversationId !== task.conversationId) throw externalIdentityMismatch("conversationId", task.conversationId);
      const payload = {
        ...sanitizeExternalPayload(incoming.payload && typeof incoming.payload === "object" && !Array.isArray(incoming.payload) ? incoming.payload : {}),
        source,
        externalEventId,
        externalType: type,
        externalSeq: Number.isInteger(incoming.seq) ? incoming.seq : Number.isInteger(incoming.sequence) ? incoming.sequence : null,
        externalOccurredAt: incoming.occurredAt || incoming.occurred_at || null
      };

      if (EXTERNAL_TERMINAL_EVENT_TYPES.has(type)) {
        // A signed worker callback may report completion, but it must still
        // pass the same deterministic state transition used by API commands.
        // This keeps the task snapshot and the streamed terminal event in
        // lockstep instead of letting an external string mark the UI done.
        const commandType = type === "task.completed"
          ? COMMAND_TYPES.COMPLETE
          : type === "task.cancelled"
            ? COMMAND_TYPES.CANCEL
            : type === "task.blocked"
              ? COMMAND_TYPES.BLOCK
              : COMMAND_TYPES.FAIL;
        const terminalCommand = {
          commandId: `external:${externalEventId}`,
          idempotencyKey: `external:${externalEventId}`,
          taskId: task.taskId,
          taskRunId: task.taskRunId,
          conversationId: task.conversationId,
          agentId: incoming.agentId || incoming.agent_id || task.agentId,
          expectedVersion: task.version,
          type: commandType,
          payload
        };
        this.apply(terminalCommand);
        const latest = this.requireTask(taskId);
        const event = this.persistence.listEvents(taskId, { afterSeq: latest.currentSeq - 1, limit: 1 })[0];
        applyExternalResultSnapshot(latest, type, payload);
        latest.updatedAt = this.now();
        this.persistence.saveTask(latest);
        Object.assign(task, latest);
        accepted.push(event);
        seen.add(externalEventId);
        continue;
      }
      const event = this.appendTaskEvent(task, {
        commandId: `external:${externalEventId}`,
        correlationId: incoming.correlationId || incoming.correlation_id || task.taskId,
        agentId: incoming.agentId || incoming.agent_id || task.agentId,
        skillId: incoming.skillId || incoming.skill_id || payload.skillId || payload.skill_id
          || (type === "account.resolved" ? "account_resolution" : null),
        skillRunId: incoming.skillRunId || incoming.skill_run_id || payload.skillRunId || payload.skill_run_id
          || ((incoming.skillId || incoming.skill_id || payload.skillId || payload.skill_id || type === "account.resolved")
            ? `${task.taskRunId}:${incoming.agentId || incoming.agent_id || task.agentId}`
            : null),
        type: "connector.event",
        payload: {}
      }, type, payload);
      accepted.push(event);
      seen.add(externalEventId);
      applyExternalResultSnapshot(task, type, payload);
    }
    if (accepted.length) {
      task.updatedAt = this.now();
      this.persistence.saveTask(task);
    }
    return {
      accepted: true,
      taskId: task.taskId,
      currentSeq: task.currentSeq,
      acceptedCount: accepted.length,
      duplicateCount: events.length - accepted.length,
      events: clone(accepted)
    };
  }

  subscribe(taskId, listener) {
    if (typeof listener !== "function") throw new TypeError("listener must be a function");
    this.requireTask(taskId);
    const listeners = this.listeners.get(taskId) || new Set();
    listeners.add(listener);
    this.listeners.set(taskId, listeners);
    return () => {
      listeners.delete(listener);
      if (!listeners.size) this.listeners.delete(taskId);
    };
  }

  apply(command) {
    if (command.type === COMMAND_TYPES.TASK_CREATE) return this.createTask(command);
    if (command.type === COMMAND_TYPES.CONVERSATION_CREATE) return this.createConversation(command);
    if (command.type === COMMAND_TYPES.MESSAGE_SEND) return this.sendMessage(command);

    const task = this.requireTask(command.taskId);
    let effectiveCommand = command;
    if (command.type === COMMAND_TYPES.REQUIREMENT_CONFIRM) {
      const workflow = selectWorkflowForRequirement(task.requirements?.proposal || {}, {
        // The client hint is intentionally advisory. The workflow selector
        // requires an explicit external action in the persisted proposal or
        // original goal before it can open an account-access gate.
        requiresAccess: command.payload?.requiresAccess === true,
        goal: task.goal
      });
      effectiveCommand = {
        ...command,
        payload: {
          ...(command.payload || {}),
          requiresAccess: workflow.requiresAccess
        }
      };
    }
    if (effectiveCommand.type === COMMAND_TYPES.ACCESS_GRANT && !this.verifiedAccess.has(effectiveCommand.idempotencyKey)) {
      throw new ControlPlaneError("确认访问范围前必须由浏览器工作区验证登录状态", {
        code: "BROWSER_SESSION_VERIFICATION_REQUIRED",
        statusCode: 403,
        details: { taskId: task.taskId }
      });
    }
    if (effectiveCommand.type === COMMAND_TYPES.REQUIREMENT_CONFIRM) {
      const proposal = task.requirements?.proposal;
      if (!proposal) {
        throw new ControlPlaneError("确认需求前必须先完成服务端需求理解", {
          code: "REQUIREMENT_PROPOSAL_REQUIRED",
          statusCode: 409,
          details: { taskId: task.taskId }
        });
      }
      const requestedVersion = effectiveCommand.payload?.proposalVersion;
      const actualVersion = proposal.proposalVersion ?? proposal.version ?? proposal.schemaVersion ?? 1;
      if (requestedVersion != null && Number(requestedVersion) !== Number(actualVersion)) {
        throw new ControlPlaneError("需求理解版本已变化，请重新核对需求卡", {
          code: "REQUIREMENT_PROPOSAL_STALE",
          statusCode: 409,
          details: { taskId: task.taskId, requestedVersion, actualVersion }
        });
      }
    }
    this.assertTaskStartGates(task, effectiveCommand);
    const fromState = task.state;
    const nextState = transitionTaskState(fromState, effectiveCommand, { currentVersion: task.version });
    task.state = nextState;
    task.version += 1;
    task.updatedAt = this.now();
    task.lastCommandId = effectiveCommand.commandId;
    this.applyTaskMetadata(task, effectiveCommand);
    const eventType = effectiveCommand.type === COMMAND_TYPES.ACCESS_REQUEST && effectiveCommand.payload?.authorizationConfirmed === true
      ? "access.authorization.granted"
      : EVENT_TYPES[effectiveCommand.type] || "task.command.applied";
    const event = this.appendTaskEvent(task, effectiveCommand, eventType, {
      commandType: effectiveCommand.type,
      fromState,
      state: nextState,
      version: task.version,
      ...(eventType === "access.authorization.granted"
        ? { stage: effectiveCommand.type === COMMAND_TYPES.ACCESS_GRANT ? "scope" : "authorization" }
        : {}),
      ...effectiveCommand.payload
    });
    const ack = this.ack(effectiveCommand, task, event, { previousState: fromState });
    if (effectiveCommand.type === COMMAND_TYPES.REQUIREMENT_CONFIRM) {
      const gateEvents = this.appendRequirementGates(task, effectiveCommand);
      return {
        ...ack,
        currentSeq: gateEvents.at(-1)?.seq || ack.currentSeq,
        data: {
          assignment: clone(task.assignment),
          access: clone(task.accessRequest),
          workflow: clone(task.workflow)
        }
      };
    }
    return ack;
  }

  assertTaskStartGates(task, command) {
    if (command.type !== COMMAND_TYPES.TASK_START) return;

    const payload = command.payload || {};
    const requirement = task.requirements || {};
    const hasConfirmedRequirement = requirement.confirmed === true
      && requirement.status === "CONFIRMED"
      && requirement.proposal != null;

    // A task may be primed into WAITING_REQUIREMENT, but it may never enter
    // execution directly from CREATED. The proposal and confirmation must be
    // persisted by the control plane so a client cannot claim either locally.
    if (task.state === TASK_STATES.CREATED && payload.requirementsConfirmed === true) {
      throw new ControlPlaneError("任务必须先完成服务端需求理解并确认，不能直接开始执行", {
        code: "REQUIREMENT_CONFIRMATION_REQUIRED",
        statusCode: 409,
        details: {
          taskId: task.taskId,
          state: task.state,
          requirementStatus: requirement.status || "PENDING"
        }
      });
    }

    // Retries reuse the persisted plan. They cannot be used to revive a task
    // whose requirement card was never confirmed or whose external account
    // scope is no longer granted.
    if (task.state === TASK_STATES.RETRYING && !hasConfirmedRequirement) {
      throw new ControlPlaneError("重试前必须存在已确认的服务端需求", {
        code: "REQUIREMENT_CONFIRMATION_REQUIRED",
        statusCode: 409,
        details: { taskId: task.taskId, state: task.state }
      });
    }
    if (task.state === TASK_STATES.RETRYING && (payload.requiresAccess === true || task.accessRequest)) {
      if (task.accessRequest?.status !== "GRANTED") {
        throw new ControlPlaneError("重试前必须重新确认已授权的访问范围", {
          code: "ACCESS_SCOPE_REQUIRED",
          statusCode: 409,
          details: {
            taskId: task.taskId,
            state: task.state,
            accessStatus: task.accessRequest?.status || "REQUIRED"
          }
        });
      }
    }
  }

  appendRequirementGates(task, command) {
    const eventCommand = {
      commandId: command.commandId,
      correlationId: command.correlationId || command.commandId,
      agentId: command.agentId || task.agentId,
      type: command.type,
      payload: command.payload || {}
    };
    const workflow = selectWorkflowForRequirement(task.requirements?.proposal || {}, {
      requiresAccess: command.payload?.requiresAccess === true,
      goal: task.goal
    });
    const assignments = assignmentPlanForWorkflow(workflow.id);
    const accessRequest = normalizeAccessRequest(command.payload);
    task.workflow = {
      id: workflow.id,
      displayName: workflow.displayName,
      requiresAccess: workflow.requiresAccess,
      allowsOutreach: workflow.allowsOutreach,
      agentIds: [...workflow.agentIds],
      selectedAt: this.now()
    };
    task.assignment = {
      status: "PROPOSED",
      assignments,
      proposedAt: this.now()
    };
    task.accessRequest = workflow.requiresAccess
      ? {
          status: "REQUIRED",
          ...accessRequest,
          requestedAt: this.now()
        }
      : {
          status: "NOT_REQUIRED",
          requestedAt: this.now()
        };
    task.updatedAt = this.now();
    this.persistence.saveTask(task);
    const assignmentEvent = this.appendTaskEvent(task, eventCommand, "task.assignment.proposed", {
      status: "PROPOSED",
      assignments,
      workflow: task.workflow,
      text: workflow.requiresAccess
        ? "任务已按确认后的目标拆解，责任 Agent 已锁定；账号授权前不会读取或发送业务数据。"
        : "任务已按确认后的目标拆解，公开数据找人链路已就绪，不会读取账号私域数据或执行触达。"
    });
    if (!workflow.requiresAccess) return [assignmentEvent];
    const accessEvent = this.appendTaskEvent(task, eventCommand, "access.authorization.requested", {
      stage: "authorization",
      status: "REQUIRED",
      ...accessRequest,
      text: `需要连接${accessRequest.provider}${accessRequest.account ? `（${accessRequest.account}）` : ""}，确认后才会读取授权范围。`
    });
    return [assignmentEvent, accessEvent];
  }

  createTask(command) {
    const taskId = command.taskId || this.makeId("task");
    if (this.persistence.loadTask(taskId)) {
      throw new ControlPlaneError("Task already exists", { code: "TASK_ALREADY_EXISTS", statusCode: 409, details: { taskId } });
    }
    const taskRunId = command.taskRunId || this.makeId("run");
    const conversationId = command.conversationId || this.makeId("conv");
    const createdAt = this.now();
    const task = {
      taskId,
      taskRunId,
      conversationId,
      goal: command.payload.goal ?? command.payload.objective ?? command.payload.input,
      state: TASK_STATES.CREATED,
      version: 0,
      currentSeq: 0,
      agentId: command.agentId || this.defaultAgentId,
      tenantId: normalizeNullableString(command.payload?.tenantId)
        || normalizeExecutionContext(command.payload).tenantId
        || null,
      createdAt,
      updatedAt: createdAt,
      requirements: { confirmed: false },
      pendingApproval: null,
      executionContext: normalizeExecutionContext(command.payload),
      lastCommandId: command.commandId
    };
    this.persistence.saveTask(task);
    const event = this.appendTaskEvent(task, command, "task.created", {
      commandType: command.type,
      state: task.state,
      version: task.version,
      goal: task.goal
    });
    return this.ack(command, task, event);
  }

  createConversation(command) {
    const conversationId = command.conversationId || this.makeId("conv");
    return {
      accepted: true,
      commandId: command.commandId,
      conversationId,
      currentSeq: null,
      currentVersion: null,
      data: { conversationId }
    };
  }

  sendMessage(command) {
    const task = command.taskId ? this.requireTask(command.taskId) : null;
    let event = null;
    if (task) {
      event = this.appendTaskEvent(task, command, "conversation.message.sent", {
        commandType: command.type,
        ...command.payload
      });
      task.updatedAt = this.now();
      task.lastCommandId = command.commandId;
      this.persistence.saveTask(task);
    }
    return this.ack(command, task, event, { data: { conversationId: command.conversationId } });
  }

  applyTaskMetadata(task, command) {
    if (command.payload?.browserSessionId) task.browserSessionId = command.payload.browserSessionId;
    const executionContext = normalizeExecutionContext(command.payload);
    if (Object.keys(executionContext).length) {
      task.executionContext = { ...(task.executionContext || {}), ...executionContext };
    }
    if (command.type === COMMAND_TYPES.ACCESS_REQUEST && command.payload?.authorizationConfirmed === true) {
      task.accessRequest = {
        ...(task.accessRequest || normalizeAccessRequest(command.payload)),
        status: "AUTHORIZED",
        browserSessionId: command.payload.browserSessionId,
        executorUid: command.payload.executorUid || task.accessRequest?.executorUid || null,
        authorizedAt: this.now()
      };
    }
    if (command.type === COMMAND_TYPES.ACCESS_GRANT) {
      task.accessRequest = {
        ...(task.accessRequest || normalizeAccessRequest(command.payload)),
        status: "GRANTED",
        browserSessionId: command.payload.browserSessionId || task.browserSessionId || null,
        executorUid: command.payload.executorUid || task.accessRequest?.executorUid || null,
        scopes: normalizeStringArray(command.payload.scopes || task.accessRequest?.scopes),
        grantedAt: this.now()
      };
    }
    if (command.type === COMMAND_TYPES.REQUIREMENT_CONFIRM) {
      task.requirements.confirmed = true;
      task.requirements.status = "CONFIRMED";
    }
    if (command.type === COMMAND_TYPES.REQUIREMENT_EDIT) {
      const value = command.payload.text ?? command.payload.goal ?? command.payload.objective ?? command.payload.input;
      task.goal = value;
      const previousVersion = Number(task.requirements?.proposalVersion || task.requirements?.proposal?.proposalVersion || 0);
      task.requirements = { confirmed: false, status: "PENDING", proposalVersion: previousVersion + 1 };
    }
    if (command.type === COMMAND_TYPES.APPROVAL_REQUEST) task.pendingApproval = clone(command.payload);
    if (command.type === COMMAND_TYPES.APPROVAL_DECISION) task.pendingApproval = null;
  }

  appendTaskEvent(task, command, type, payload) {
    const event = createEventEnvelope({
      schemaVersion: 1,
      eventId: this.makeId("evt"),
      seq: task.currentSeq + 1,
      taskId: task.taskId,
      taskRunId: task.taskRunId,
      conversationId: task.conversationId,
      agentId: command.agentId || task.agentId || this.defaultAgentId,
      agentRunId: null,
      skillId: command.skillId || payload?.skillId || payload?.skill_id || null,
      skillRunId: command.skillRunId || payload?.skillRunId || payload?.skill_run_id || null,
      causationId: command.commandId,
      correlationId: command.correlationId || command.commandId,
      type,
      occurredAt: this.now(),
      payload
    });
    task.currentSeq = event.seq;
    this.persistence.appendEvent(task.taskId, event);
    this.persistence.saveTask(task);
    const listeners = this.listeners.get(task.taskId);
    if (listeners) listeners.forEach((listener) => listener(clone(event)));
    return event;
  }

  ack(command, task, event, extra = {}) {
    return {
      accepted: true,
      commandId: command.commandId,
      idempotencyKey: command.idempotencyKey,
      taskId: task?.taskId || command.taskId || null,
      taskRunId: task?.taskRunId || command.taskRunId || null,
      conversationId: task?.conversationId || command.conversationId || null,
      state: task?.state || null,
      currentVersion: task?.version ?? null,
      currentSeq: event?.seq ?? task?.currentSeq ?? null,
      data: extra.data || null,
      previousState: extra.previousState || null
    };
  }

  requireTask(taskId) {
    if (typeof taskId !== "string" || !taskId.trim()) {
      throw new ControlPlaneError("taskId is required", { code: "TASK_ID_REQUIRED", statusCode: 400 });
    }
    const task = this.persistence.loadTask(taskId);
    if (!task) throw new ControlPlaneError("Task not found", { code: "TASK_NOT_FOUND", statusCode: 404, details: { taskId } });
    return task;
  }

  makeId(prefix) {
    return `${prefix}-${this.idFactory()}`;
  }
}

function enrichStartPayload(task, payload) {
  if (!task || !payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  const hasInput = ["goal", "objective", "input", "planVersion"].some((key) => payload[key] !== undefined && payload[key] !== null && payload[key] !== "");
  return hasInput ? payload : { ...payload, goal: task.goal };
}

function buildEventCommand(input, ack, task) {
  return {
    commandId: ack.commandId || input.commandId || `requirement-${task.taskId}`,
    correlationId: input.correlationId || input.taskId || task.taskId,
    agentId: input.agentId || task.agentId,
    type: normalizeApiType(input.type ?? input.commandType),
    payload: input.payload && typeof input.payload === "object" ? input.payload : {}
  };
}

function executionEventCommand(input, type, ack) {
  return {
    commandId: ack.commandId || input.commandId || `execution-${ack.taskId}`,
    correlationId: input.correlationId || ack.taskId,
    agentId: input.agentId || null,
    type,
    payload: {}
  };
}

function safeDispatchMessage(value) {
  const message = String(value || "Task execution dispatch failed");
  return message.length > 240 ? `${message.slice(0, 237)}...` : message;
}

function normalizeAccessRequest(payload = {}) {
  const provider = normalizeNullableString(payload.provider) || "抖音账号";
  const account = normalizeNullableString(payload.account || payload.accountLabel);
  const scopes = normalizeStringArray(payload.scopes);
  const executorUid = normalizeNullableString(payload.executorUid);
  return { provider, account, scopes, executorUid };
}

function normalizeExecutionContext(payload = {}) {
  const source = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
  const nested = source.executionContext && typeof source.executionContext === "object" && !Array.isArray(source.executionContext)
    ? source.executionContext
    : {};
  const value = (field) => normalizeNullableString(nested[field] ?? source[field]);
  return Object.fromEntries([
    ["uid", value("uid") || value("robotUid") || value("executorUid")],
    ["secId", value("secId") || value("sec_id") || value("secUid") || value("sec_uid")],
    ["uniqueId", value("uniqueId") || value("unique_id") || value("douyinId") || value("douyin_id")],
    ["accountName", value("accountName") || value("account_name") || value("nickname")],
    ["profileUrl", value("profileUrl") || value("profile_url")],
    ["accountCode", value("accountCode") || value("account_code")],
    ["tenantId", value("tenantId")],
    ["accountKey", value("accountKey")],
    ["accountLabel", value("accountLabel")],
    ["provider", value("provider")],
    ["deviceId", value("deviceId")],
    ["platform", value("platform")]
  ].filter(([, item]) => item));
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => normalizeNullableString(item)).filter(Boolean))];
}

function normalizeNullableString(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function externalIdentityMismatch(field, expected) {
  return new ControlPlaneError(`外部执行事件的 ${field} 与任务不匹配`, {
    code: "EXECUTION_CONTEXT_MISMATCH",
    statusCode: 409,
    details: { field, expected }
  });
}

const EXTERNAL_SECRET_KEY = /(?:authorization|(?:access|refresh)?[_-]?token|password|passwd|cookie|secret|csrf|jwt)/i;

function sanitizeExternalPayload(value, depth = 0) {
  if (depth > 8) return null;
  if (value == null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 1000).map((item) => sanitizeExternalPayload(item, depth + 1));
  if (typeof value !== "object") return null;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !EXTERNAL_SECRET_KEY.test(key) && !key.startsWith("_") && key !== "analysis_trace")
    .map(([key, item]) => [key, sanitizeExternalPayload(item, depth + 1)]));
}

function applyExternalResultSnapshot(task, type, payload) {
  const snapshot = payload.resultSnapshot || payload.result_snapshot || payload.result;
  if (snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)) {
    task.resultSnapshot = clone(snapshot);
  }
  if (type === "lead.source.synced" || type === "lead.qualified") {
    task.resultSnapshot = {
      ...(task.resultSnapshot || {}),
      leads: payload.leads || payload.candidates || payload.leadCount || task.resultSnapshot?.leads || null,
      updatedAt: payload.externalOccurredAt || new Date().toISOString()
    };
  }
  if (type === "outreach.sent" || type === "outreach.failed") {
    const previous = task.resultSnapshot?.outreach || {};
    task.resultSnapshot = {
      ...(task.resultSnapshot || {}),
      outreach: {
        ...previous,
        lastEvent: type,
        sent: type === "outreach.sent" ? Number(previous.sent || 0) + 1 : Number(previous.sent || 0),
        failed: type === "outreach.failed" ? Number(previous.failed || 0) + 1 : Number(previous.failed || 0)
      }
    };
  }
}

function providersMatch(requested, actual) {
  const normalize = (value) => {
    const raw = String(value || "").trim().toLowerCase();
    if (["douyin", "抖音", "抖音账号", "内容账号"].includes(raw)) return "douyin";
    return raw;
  };
  return Boolean(normalize(requested)) && normalize(requested) === normalize(actual);
}

export function createControlPlane(options = {}) {
  return new ControlPlane(options);
}

export function normalizeApiType(type) {
  if (typeof type !== "string" || !type.trim()) {
    throw new ControlPlaneError("Command type is required", { code: "COMMAND_TYPE_REQUIRED", statusCode: 400 });
  }
  return API_COMMAND_ALIASES[type.trim()] || type.trim();
}

function clone(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
