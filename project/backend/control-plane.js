import { randomUUID } from "node:crypto";
import { buildAssignmentHandoff } from "../src/salebuddy/runtime/assignment-handoff.js";
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
  EXECUTION_BOUNDARIES,
  WORKFLOW_IDS,
  assignmentPlanForWorkflow,
  buildCapabilityAssignmentPlan,
  getWorkflowDefinition,
  resolveExecutionBoundary,
  selectWorkflowForRequirement
} from "../src/salebuddy/runtime/workflow-definitions.js";
import { CHIEF_INTENTS, classifyChiefInput } from "../src/salebuddy/agents/chief-decision-policy.js";

const API_COMMAND_ALIASES = Object.freeze({
  "task.run.start": COMMAND_TYPES.TASK_START,
  "task.configuration.update": COMMAND_TYPES.TASK_CONFIG_UPDATE,
  "task.strategy.update": COMMAND_TYPES.TASK_CONFIG_UPDATE,
  "task.touch_content.update": COMMAND_TYPES.TASK_CONFIG_UPDATE,
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
  [COMMAND_TYPES.TASK_CONFIG_UPDATE]: "task.config.updated",
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
  "outreach.accepted",
  "outreach.sent",
  "outreach.failed",
  "reply.sent",
  "delivery.checking",
  "artifact.created",
  "task.result.updated",
  "task.result.snapshot.updated",
  "task.config.updated",
  "task.configuration.updated",
  "prospect.discovery.completed",
  "agent.stage.started",
  "agent.stage.completed"
]);

function requiresAuthorizedExecution(workflow, executionBoundary) {
  return workflow?.requiresAccess === true
    || executionBoundary === EXECUTION_BOUNDARIES.PRODUCT_AGENTS;
}

function isChiefAssignmentTask(task = {}) {
  return task?.agentId === "chief_of_staff"
    && Array.isArray(task?.assignment?.execution?.steps);
}

function assignmentStepRunId(taskRunId, index, agentId) {
  return `${taskRunId}:step-${index + 1}-${agentId}`;
}

function assignmentExecutionFor(task, assignments = []) {
  return {
    status: "PENDING",
    startedAt: null,
    completedAt: null,
    steps: assignments
      .filter((assignment) => assignment?.executionRole === "product_agent")
      .map((assignment, index) => ({
        id: `step-${index + 1}-${assignment.agentId}`,
        index,
        agentId: assignment.agentId,
        agentName: assignment.agentName || assignment.agentId,
        taskRunId: assignmentStepRunId(task.taskRunId, index, assignment.agentId),
        dependsOn: Array.isArray(assignment.dependsOn) ? [...assignment.dependsOn] : [],
        status: "PENDING",
        attempts: 0,
        startedAt: null,
        completedAt: null,
        failedAt: null,
        handoff: null
      }))
  };
}

function readyAssignmentStep(task = {}) {
  if (!isChiefAssignmentTask(task)) return null;
  const steps = task.assignment.execution.steps;
  const completedAgents = new Set(steps
    .filter((step) => step?.status === "COMPLETED")
    .map((step) => step?.agentId)
    .filter(Boolean));
  return steps.find((step) => step?.status === "PENDING"
    && (Array.isArray(step.dependsOn) ? step.dependsOn : []).every((agentId) => completedAgents.has(agentId))) || null;
}

function assignmentExecutionTarget(task = {}) {
  const step = readyAssignmentStep(task);
  if (!step) return null;
  return {
    mode: "assignment_step",
    stepId: step.id,
    agentId: step.agentId,
    taskRunId: step.taskRunId,
    parentTaskId: task.taskId,
    parentTaskRunId: task.taskRunId
  };
}

function assignmentStepForExternalEvent(task = {}, incoming = {}) {
  if (!isChiefAssignmentTask(task)) return null;
  const runId = normalizeNullableString(incoming.taskRunId || incoming.task_run_id || incoming.runId || incoming.run_id);
  const stepId = normalizeNullableString(incoming.payload?.assignmentStepId || incoming.payload?.assignment_step_id);
  if (runId && stepId) {
    return task.assignment.execution.steps.find((step) => step.taskRunId === runId && step.id === stepId) || null;
  }
  return task.assignment.execution.steps.find((step) => step.taskRunId === runId || step.id === stepId) || null;
}

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
  constructor({ persistence = new MemoryPersistenceAdapter(), idFactory, now = () => new Date().toISOString(), defaultAgentId = "chief_of_staff", requirementService = createRequirementUnderstandingService(), browserWorkspace = null, douyinMcpService = null, taskDispatcher = null } = {}) {
    this.persistence = persistence;
    this.idFactory = typeof idFactory === "function" ? idFactory : () => randomUUID();
    this.now = now;
    this.defaultAgentId = defaultAgentId;
    this.requirementService = requirementService;
    this.browserWorkspace = browserWorkspace;
    this.douyinMcpService = douyinMcpService;
    this.taskDispatcher = taskDispatcher;
    this.requirementRuns = new Map();
    this.assignmentRuns = new Map();
    this.chiefDecisions = new Map();
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
    const cachedDecision = type === COMMAND_TYPES.TASK_CREATE
      ? this.consumeChiefDecision(
          input.payload?.chiefDecisionId,
          input.payload?.goal ?? input.payload?.objective ?? input.payload?.input,
          input.payload?.tenantId || input.payload?.executionContext?.tenantId || input.tenantId
        )
      : null;
    const initialAck = this.dispatch({ ...input, type });
    const taskId = initialAck.taskId;
    const task = this.requireTask(taskId);
    if (cachedDecision) {
      return this.persistRequirementProposal({
        task,
        proposal: cachedDecision.proposal,
        command: input,
        ack: initialAck
      });
    }
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

  async decideChiefMessage({ message, context = {} } = {}) {
    const text = String(message || "").trim();
    if (!text) {
      throw new ControlPlaneError("幕僚长消息不能为空", {
        code: "CHIEF_MESSAGE_REQUIRED",
        statusCode: 400
      });
    }
    const tenantId = normalizeNullableString(context?.tenantId);
    const taskSnapshots = this.listTaskSnapshots({ tenantId, includeTerminal: true, limit: 50 });
    const overview = summarizeChiefTasks(taskSnapshots);
    const decision = classifyChiefInput(text);
    return {
      accepted: true,
      decisionId: null,
      decision: clone(decision),
      requirement: null,
      shouldCreateTask: false,
      overview,
      message: chiefConciergeMessage({ input: text, decision, overview })
    };
  }

  consumeChiefDecision(decisionId, goal, tenantId = null) {
    const key = normalizeNullableString(decisionId);
    if (!key) return null;
    const cached = this.chiefDecisions.get(key);
    this.chiefDecisions.delete(key);
    const expectedTenantId = normalizeNullableString(cached?.tenantId);
    const actualTenantId = normalizeNullableString(tenantId);
    if (!cached || cached.message !== String(goal || "").trim() || expectedTenantId !== actualTenantId) {
      throw new ControlPlaneError("幕僚长决策已失效，请重新提交", {
        code: "CHIEF_DECISION_INVALID",
        statusCode: 409
      });
    }
    return cached;
  }

  /**
   * The synchronous command path is replay-only. Real external execution is
   * attached to this async boundary so a browser request cannot mark a task as
   * running without the configured executor receiving a lease.
   */
  async dispatchWithTaskExecution(input = {}) {
    const type = normalizeApiType(input.type ?? input.commandType);
    const task = input.taskId ? this.persistence.loadTask(input.taskId) : null;
    // Requirement confirmation creates the durable workflow and its executor
    // boundary. Do not validate against the pre-confirmation task snapshot:
    // it has no workflow yet and can be misrouted as public discovery.
    if (type !== COMMAND_TYPES.REQUIREMENT_CONFIRM && this.taskDispatcher?.assertReadyFor) {
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
    const assignmentTarget = currentTask.state === TASK_STATES.RUNNING
      ? assignmentExecutionTarget(currentTask)
      : null;
    if (assignmentTarget) {
      return this.dispatchAssignmentStep({
        ack,
        input,
        type,
        task: currentTask,
        command: executionCommand,
        executionTarget: assignmentTarget
      });
    }
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
      // Persist the lease acknowledgement before accepting executor callbacks.
      // A fast executor may return a terminal event in its first response; if
      // that event is applied first, the durable task can become terminal
      // before the dispatch event is recorded.
      const event = this.appendTaskEvent(currentTask, executionEventCommand(input, type, ack), "task.execution.dispatched", {
        commandType: type,
        state: currentTask.state,
        execution: clone(execution)
      });
      const executionEvents = Array.isArray(execution.events) ? execution.events : [];
      let eventSeq = event.seq;
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
      return {
        ...ack,
        currentSeq: eventSeq,
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

  listAllTaskEvents(taskId) {
    const events = [];
    let afterSeq = 0;
    while (true) {
      const page = this.persistence.listEvents(taskId, { afterSeq, limit: 1000 });
      if (!page.length) return events;
      events.push(...page);
      afterSeq = page.at(-1).seq;
      if (page.length < 1000) return events;
    }
  }

  async dispatchAssignmentStep({ ack, input, type, task, command, executionTarget }) {
    const runKey = `${task.taskId}:${executionTarget.stepId}`;
    const active = this.assignmentRuns.get(runKey);
    if (active) return active;
    const run = this.executeAssignmentStep({ ack, input, type, task, command, executionTarget })
      .finally(() => this.assignmentRuns.delete(runKey));
    this.assignmentRuns.set(runKey, run);
    return run;
  }

  async executeAssignmentStep({ ack, input, type, task, command, executionTarget }) {
    const current = this.requireTask(task.taskId);
    const step = current.assignment?.execution?.steps?.find((candidate) => candidate.id === executionTarget.stepId);
    if (!step || step.status !== "PENDING") return ack;

    const existing = this.listAllTaskEvents(current.taskId)
      .find((event) => event.type === "task.execution.dispatched"
        && event.payload?.execution?.assignmentStepId === executionTarget.stepId);
    if (existing) {
      return {
        ...ack,
        currentSeq: existing.seq,
        data: { ...(ack.data || {}), execution: clone(existing.payload?.execution || null) }
      };
    }

    step.status = "RUNNING";
    step.attempts = Number(step.attempts || 0) + 1;
    step.startedAt = this.now();
    current.assignment.execution.status = "RUNNING";
    current.assignment.execution.startedAt ||= step.startedAt;
    current.updatedAt = this.now();
    this.persistence.saveTask(current);
    const startedEvent = this.appendTaskEvent(current, {
      commandId: `${command.commandId}:assignment:${step.id}:started`,
      correlationId: command.correlationId || command.commandId,
      agentId: step.agentId,
      type: command.type,
      payload: command.payload || {}
    }, "agent.stage.started", {
      assignmentStepId: step.id,
      parentTaskId: current.taskId,
      parentTaskRunId: current.taskRunId,
      taskRunId: step.taskRunId,
      agentId: step.agentId,
      text: `${step.agentName} 已开始处理本步骤。`
    });

    try {
      const execution = await this.taskDispatcher.dispatch({
        command: { ...command, agentId: step.agentId },
        task: current,
        ack,
        executionTarget
      });
      if (!execution?.dispatched) {
        step.status = "PENDING";
        step.startedAt = null;
        current.assignment.execution.status = "PENDING";
        current.updatedAt = this.now();
        this.persistence.saveTask(current);
        return ack;
      }
      const dispatchedEvent = this.appendTaskEvent(current, executionEventCommand(input, type, ack), "task.execution.dispatched", {
        commandType: type,
        state: current.state,
        execution: {
          ...clone(execution),
          assignmentStepId: step.id,
          parentTaskId: current.taskId,
          parentTaskRunId: current.taskRunId,
          taskRunId: step.taskRunId,
          executorAgentId: step.agentId
        }
      });
      const executionEvents = Array.isArray(execution.events) ? execution.events : [];
      let eventSeq = Math.max(startedEvent.seq, dispatchedEvent.seq);
      if (executionEvents.length) {
        const ingested = this.ingestExecutionEvents({
          taskId: current.taskId,
          tenantId: current.tenantId || current.executionContext?.tenantId || null,
          events: executionEvents,
          uid: execution.uid || current.executionContext?.uid || current.accessRequest?.executorUid || null,
          source: execution.source || execution.executor || execution.kind || "cluehunter"
        });
        eventSeq = ingested.currentSeq;
      }
      return {
        ...ack,
        currentSeq: eventSeq,
        data: {
          ...(ack.data || {}),
          execution: {
            ...clone(execution),
            assignmentStepId: step.id,
            taskRunId: step.taskRunId,
            executorAgentId: step.agentId
          }
        }
      };
    } catch (error) {
      const latest = this.requireTask(current.taskId);
      const failedStep = latest.assignment?.execution?.steps?.find((candidate) => candidate.id === step.id);
      if (failedStep) {
        failedStep.status = "FAILED";
        failedStep.failedAt = this.now();
        latest.assignment.execution.status = "FAILED";
      }
      latest.assignment.status = "FAILED";
      latest.updatedAt = this.now();
      this.persistence.saveTask(latest);
      this.appendTaskEvent(latest, {
        commandId: `${command.commandId}:assignment:${step.id}:failed`,
        correlationId: command.correlationId || command.commandId,
        agentId: step.agentId,
        type: command.type,
        payload: command.payload || {}
      }, "agent.stage.failed", {
        assignmentStepId: step.id,
        taskRunId: step.taskRunId,
        agentId: step.agentId,
        code: error?.code || "TASK_DISPATCH_FAILED",
        message: safeDispatchMessage(error?.message || "任务执行未能派发"),
        text: `${step.agentName} 未能启动，本任务已停止。`
      });
      if (latest.state === TASK_STATES.RUNNING) {
        this.dispatch({
          type: COMMAND_TYPES.FAIL,
          taskId: latest.taskId,
          taskRunId: latest.taskRunId,
          conversationId: latest.conversationId,
          agentId: "chief_of_staff",
          payload: { reason: "ASSIGNMENT_STEP_DISPATCH_FAILED", assignmentStepId: step.id }
        });
      }
      throw error;
    }
  }

  async resumeAssignmentExecution(taskId) {
    const task = this.requireTask(taskId);
    if (task.state !== TASK_STATES.RUNNING) return null;
    const executionTarget = assignmentExecutionTarget(task);
    if (!executionTarget) return null;
    const commandId = `assignment:${task.taskId}:${executionTarget.stepId}:resume`;
    const command = {
      commandId,
      idempotencyKey: commandId,
      type: COMMAND_TYPES.RESUME,
      taskId: task.taskId,
      taskRunId: task.taskRunId,
      conversationId: task.conversationId,
      agentId: "chief_of_staff",
      payload: {}
    };
    return this.dispatchAssignmentStep({
      ack: {
        accepted: true,
        commandId,
        idempotencyKey: commandId,
        taskId: task.taskId,
        taskRunId: task.taskRunId,
        conversationId: task.conversationId,
        state: TASK_STATES.RUNNING,
        previousState: TASK_STATES.RUNNING,
        currentSeq: task.currentSeq,
        currentVersion: task.version
      },
      input: command,
      type: COMMAND_TYPES.RESUME,
      task,
      command,
      executionTarget
    });
  }

  /**
   * Restores a chief step that was persisted as running before the external
   * dispatcher acknowledgement could be recorded. The step is reset only when
   * no durable dispatch event exists, so a restart never leases known work
   * twice.
   */
  async recoverInterruptedAssignments() {
    if (typeof this.taskDispatcher?.dispatch !== "function" || typeof this.persistence.listTasks !== "function") return [];
    const recovered = [];
    const tasks = this.persistence.listTasks()
      .filter((task) => task?.state === TASK_STATES.RUNNING && isChiefAssignmentTask(task));

    for (const taskRecord of tasks) {
      const task = this.requireTask(taskRecord.taskId);
      const step = task.assignment.execution.steps.find((candidate) => candidate?.status === "RUNNING");
      if (!step) continue;
      const alreadyDispatched = this.listAllTaskEvents(task.taskId)
        .some((event) => event.type === "task.execution.dispatched"
          && event.payload?.execution?.assignmentStepId === step.id);
      if (alreadyDispatched) continue;

      step.status = "PENDING";
      step.startedAt = null;
      task.assignment.execution.status = "PENDING";
      task.assignment.execution.startedAt = null;
      task.updatedAt = this.now();
      this.persistence.saveTask(task);
      this.appendTaskEvent(task, {
        commandId: `assignment:${task.taskId}:${step.id}:recovered`,
        correlationId: task.taskId,
        agentId: "chief_of_staff",
        type: COMMAND_TYPES.RESUME,
        payload: {}
      }, "agent.stage.recovered", {
        assignmentStepId: step.id,
        taskRunId: step.taskRunId,
        agentId: step.agentId,
        text: `${step.agentName} 的启动记录未完成，系统正在恢复派发。`
      });
      recovered.push({ taskId: task.taskId, stepId: step.id });

      try {
        await this.resumeAssignmentExecution(task.taskId);
      } catch {
        // executeAssignmentStep records the terminal failure if re-dispatching
        // cannot start. Continue recovering unrelated tasks.
      }
    }
    return recovered;
  }

  /**
   * Registers a configured, long-running integration job as a first-class
   * task. The integration has already passed its own configuration and
   * authorization gates; this method only establishes the durable lifecycle
   * record before the external runtime is allowed to start work.
   */
  ensureManagedRuntimeTask({ taskId = null, taskRunId = null, conversationId = null, agentId, tenantId = null, goal, executionContext = {}, configuration = {} } = {}) {
    const normalizedAgentId = normalizeNullableString(agentId);
    const normalizedGoal = normalizeNullableString(goal);
    if (!normalizedAgentId || !normalizedGoal) {
      throw new ControlPlaneError("长期任务需要 Agent 和目标", {
        code: "MANAGED_RUNTIME_TASK_INVALID",
        statusCode: 400
      });
    }
    const normalizedTenantId = normalizeNullableString(tenantId);
    const normalizedContext = normalizeExecutionContext({ executionContext, tenantId: normalizedTenantId });
    const requestedTaskId = normalizeNullableString(taskId);
    const existing = requestedTaskId ? this.persistence.loadTask(requestedTaskId) : null;
    if (existing && existing.state === TASK_STATES.RUNNING) {
      const existingTenantId = existing.tenantId || existing.executionContext?.tenantId || null;
      const existingAccount = existing.executionContext?.accountKey || existing.executionContext?.accountId || null;
      const requestedAccount = normalizedContext.accountKey || normalizedContext.accountId || null;
      if (existing.agentId !== normalizedAgentId || existingTenantId !== normalizedTenantId || (requestedAccount && existingAccount && requestedAccount !== existingAccount)) {
        throw new ControlPlaneError("不能将已有运行任务绑定到另一个 Agent 或账号", {
          code: "MANAGED_RUNTIME_TASK_SCOPE_MISMATCH",
          statusCode: 409,
          details: { taskId: existing.taskId }
        });
      }
      return this.getTaskSnapshot(existing.taskId);
    }

    // A caller that explicitly supplies a task id is continuing that exact
    // job. Starting a fresh task under a generated id would sever the link
    // between the cloud runtime, its results, and the UI that initiated it.
    if (existing) {
      throw new ControlPlaneError("该任务已经结束，不能作为长期任务继续运行", {
        code: "MANAGED_RUNTIME_TASK_NOT_RUNNING",
        statusCode: 409,
        details: { taskId: existing.taskId, state: existing.state }
      });
    }

    const managedTaskId = requestedTaskId || this.makeId("task");
    const managedTaskRunId = taskRunId;
    const managedConversationId = conversationId;
    const commandBase = {
      commandId: `managed-runtime:${managedTaskId}:create`,
      idempotencyKey: `managed-runtime:${managedTaskId}:create`,
      type: COMMAND_TYPES.TASK_CREATE,
      taskId: managedTaskId,
      taskRunId: managedTaskRunId,
      conversationId: managedConversationId,
      agentId: normalizedAgentId,
      payload: {
        goal: normalizedGoal,
        tenantId: normalizedTenantId,
        executionContext: normalizedContext,
        ...(configuration && typeof configuration === "object" && !Array.isArray(configuration) ? configuration : {})
      }
    };
    this.dispatch(commandBase);
    const task = this.requireTask(managedTaskId);
    task.requirements = {
      confirmed: true,
      status: "CONFIRMED",
      proposal: {
        schemaVersion: 1,
        source: "managed_runtime",
        title: normalizedGoal,
        objective: normalizedGoal,
        confirmationPolicy: "explicit_configuration",
        confirmedAt: this.now()
      }
    };
    task.version += 1;
    task.updatedAt = this.now();
    task.lastCommandId = `managed-runtime:${managedTaskId}:requirement-confirm`;
    this.appendTaskEvent(task, {
      commandId: task.lastCommandId,
      correlationId: task.taskId,
      agentId: normalizedAgentId,
      type: COMMAND_TYPES.REQUIREMENT_CONFIRM,
      payload: {}
    }, "task.requirement.confirmed", {
      commandType: COMMAND_TYPES.REQUIREMENT_CONFIRM,
      state: TASK_STATES.CREATED,
      version: task.version,
      managedRuntime: true,
      text: "已确认长期托管任务的配置与授权范围。"
    });
    task.state = TASK_STATES.RUNNING;
    task.version += 1;
    task.updatedAt = this.now();
    task.lastCommandId = `managed-runtime:${managedTaskId}:start`;
    this.appendTaskEvent(task, {
      commandId: task.lastCommandId,
      correlationId: task.taskId,
      agentId: normalizedAgentId,
      type: COMMAND_TYPES.TASK_START,
      payload: {}
    }, "task.run.started", {
      commandType: COMMAND_TYPES.TASK_START,
      fromState: TASK_STATES.CREATED,
      state: TASK_STATES.RUNNING,
      version: task.version,
      managedRuntime: true,
      text: "长期托管任务已启动，等待运行时持续回传真实进展。"
    });
    return this.getTaskSnapshot(task.taskId);
  }

  async verifyBrowserSession(input = {}) {
    const sessionId = input.payload?.browserSessionId;
    if (String(sessionId || "").startsWith("douyin-mcp:") && this.douyinMcpService?.configured) {
      const status = await this.douyinMcpService.status();
      const loginState = String(status?.login_state || status?.state || "").toLowerCase();
      const account = status?.account && typeof status.account === "object" ? status.account : null;
      const identity = account || status?.accountIdentity || status?.identity || null;
      const loggedIn = ["logged_in", "authenticated", "authorized", "ready", "success", "已登录"].includes(loginState)
        || Boolean(identity && (identity.uniqueId || identity.profileUrl || identity.uid || identity.secId));
      if (!loggedIn) {
        throw new ControlPlaneError("抖音云电脑尚未完成登录", { code: "AUTHORIZATION_PENDING", statusCode: 403 });
      }
      return {
        sessionId,
        state: "READY",
        provider: "douyin",
        accountKey: input.payload?.account || input.payload?.accountKey || null,
        accountLabel: input.payload?.account || null,
        accountIdentity: identity,
        authenticationVerified: true
      };
    }
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
    return this.persistRequirementProposal({ task, proposal, command, ack });
  }

  persistRequirementProposal({ task, proposal, command, ack }) {
    const proposalVersion = Number(task.requirements?.proposalVersion || task.requirements?.proposal?.proposalVersion || 0) || 1;
    const normalized = clone(normalizeRequirementProposal({ ...proposal, proposalVersion }, {
      source: proposal?.source || "model",
      provider: proposal?.provider || null,
      model: proposal?.model || null,
      generatedAt: proposal?.generatedAt || this.now(),
      originalInput: task.goal,
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
        statusCode: ["STALE_TASK_VERSION", "STALE_CONFIGURATION_VERSION"].includes(error.code) ? 409 : 422,
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
      startedAt: task.startedAt || null,
      updatedAt: task.updatedAt,
      requirements: task.requirements,
      configuration: task.configuration || initialTaskConfiguration({}, task.createdAt),
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

  /**
   * Removes a terminal task together with its durable event stream. Active
   * work must be stopped through the normal command lifecycle first so an
   * external executor can receive the cancellation and release its runtime.
   */
  purgeTask(taskId) {
    const task = this.requireTask(taskId);
    const terminal = new Set([
      TASK_STATES.SUCCEEDED,
      TASK_STATES.FAILED,
      TASK_STATES.CANCELLED,
      TASK_STATES.BLOCKED
    ]);
    if (!terminal.has(task.state)) {
      throw new ControlPlaneError("运行中的任务不能直接删除，请先停止任务", {
        code: "TASK_PURGE_REQUIRES_TERMINAL_STATE",
        statusCode: 409,
        details: { taskId: task.taskId, state: task.state }
      });
    }
    if (typeof this.persistence.deleteTask !== "function") {
      throw new ControlPlaneError("Persistence adapter does not support task deletion", {
        code: "TASK_PURGE_UNAVAILABLE",
        statusCode: 503
      });
    }
    this.persistence.deleteTask(task.taskId);
    this.listeners.delete(task.taskId);
    return {
      accepted: true,
      taskId: task.taskId,
      taskRunId: task.taskRunId || null,
      deletedAt: this.now()
    };
  }

  listTaskSnapshots({ tenantId = null, includeTerminal = true, resultsOnly = false, limit = 100 } = {}) {
    if (typeof this.persistence.listTasks !== "function") {
      throw new ControlPlaneError("Persistence adapter does not support task listing", {
        code: "TASK_LIST_UNAVAILABLE",
        statusCode: 503
      });
    }
    const terminal = new Set([TASK_STATES.SUCCEEDED, TASK_STATES.FAILED, TASK_STATES.CANCELLED, TASK_STATES.BLOCKED]);
    const unbounded = limit === Infinity || limit === "all";
    const max = unbounded
      ? Number.POSITIVE_INFINITY
      : Math.max(1, Math.min(500, Number.isInteger(limit) ? limit : 100));
    return this.persistence.listTasks()
      .filter((task) => {
        const taskTenantId = task.tenantId || task.executionContext?.tenantId || null;
        if (tenantId && taskTenantId !== tenantId) return false;
        if (!includeTerminal && terminal.has(task.state)) return false;
        if (resultsOnly && !task.resultSnapshot) return false;
        return true;
      })
      .sort((left, right) => String(right.updatedAt || right.createdAt || "").localeCompare(String(left.updatedAt || left.createdAt || "")))
      .slice(0, max)
      .map((task) => this.getTaskSnapshot(task.taskId));
  }

  listTaskEvents(taskId, options = {}) {
    this.requireTask(taskId);
    return this.persistence.listEvents(taskId, options).map(clone);
  }

  /**
   * Records a first-class task artifact without pretending that an internal
   * product report came from an external executor callback. The same artifact
   * is retained on the task result snapshot and in the durable event stream.
   */
  recordArtifact({ taskId, tenantId = null, agentId = null, artifact, source = "internal" } = {}) {
    const task = this.requireTask(taskId);
    if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) {
      throw new ControlPlaneError("任务产出文件格式无效", { code: "TASK_ARTIFACT_INVALID", statusCode: 400 });
    }
    const artifactId = normalizeNullableString(artifact.id);
    if (!artifactId) {
      throw new ControlPlaneError("任务产出文件缺少 id", { code: "TASK_ARTIFACT_ID_REQUIRED", statusCode: 400 });
    }
    const taskTenantId = task.tenantId || task.executionContext?.tenantId || null;
    if (tenantId && taskTenantId && tenantId !== taskTenantId) {
      throw new ControlPlaneError("任务产出文件与任务租户不匹配", {
        code: "TENANT_SCOPE_FORBIDDEN",
        statusCode: 403,
        details: { taskId }
      });
    }

    const currentSnapshot = task.resultSnapshot && typeof task.resultSnapshot === "object"
      ? clone(task.resultSnapshot)
      : {
          source: source || "internal",
          taskId: task.taskId,
          taskRunId: task.taskRunId,
          agentId: task.agentId,
          agentName: task.agentId,
          accountId: task.executionContext?.accountId || null,
          generatedAt: this.now()
        };
    const artifacts = Array.isArray(currentSnapshot.artifacts) ? currentSnapshot.artifacts : [];
    const suppressedArtifacts = Array.isArray(currentSnapshot.suppressedArtifacts)
      ? currentSnapshot.suppressedArtifacts
      : [];
    if (suppressedArtifacts.some((item) => (item?.id || item) === artifactId)) {
      return {
        accepted: true,
        duplicate: true,
        suppressed: true,
        taskId: task.taskId,
        taskRunId: task.taskRunId,
        currentSeq: task.currentSeq,
        artifact: null
      };
    }
    const existing = artifacts.find((item) => (item?.id || item?.name) === artifactId);
    if (existing) {
      return {
        accepted: true,
        duplicate: true,
        taskId: task.taskId,
        taskRunId: task.taskRunId,
        currentSeq: task.currentSeq,
        artifact: clone(existing)
      };
    }

    const recordedArtifact = clone({
      ...artifact,
      taskId: artifact.taskId || task.taskId,
      taskRunId: artifact.taskRunId || task.taskRunId,
      agentId: artifact.agentId || agentId || task.agentId,
      accountId: artifact.accountId || task.executionContext?.accountId || null,
      createdAt: artifact.createdAt || this.now()
    });
    task.resultSnapshot = {
      ...currentSnapshot,
      taskId: task.taskId,
      taskRunId: task.taskRunId,
      agentId: task.agentId,
      accountId: currentSnapshot.accountId || task.executionContext?.accountId || null,
      artifacts: [...artifacts, recordedArtifact],
      generatedAt: this.now()
    };
    task.updatedAt = this.now();
    const event = this.appendTaskEvent(task, {
      commandId: `artifact:${artifactId}`,
      correlationId: task.taskId,
      agentId: agentId || task.agentId,
      type: "task.artifact.record"
    }, "artifact.created", {
      source,
      artifact: recordedArtifact,
      resultSnapshot: clone(task.resultSnapshot),
      text: recordedArtifact.summary || recordedArtifact.name || "任务产出已归档"
    });
    return {
      accepted: true,
      duplicate: false,
      taskId: task.taskId,
      taskRunId: task.taskRunId,
      currentSeq: event.seq,
      artifact: recordedArtifact
    };
  }

  /**
   * Removes a task artifact from all readable task state. The original
   * artifact payload is redacted from its creation event, while a separate
   * deletion event preserves only the audit metadata needed for traceability.
   */
  removeArtifact({ taskId, artifactId, tenantId = null } = {}) {
    const task = this.requireTask(taskId);
    const normalizedArtifactId = normalizeNullableString(artifactId);
    if (!normalizedArtifactId) {
      throw new ControlPlaneError("任务产出文件缺少 id", { code: "TASK_ARTIFACT_ID_REQUIRED", statusCode: 400 });
    }
    const taskTenantId = task.tenantId || task.executionContext?.tenantId || null;
    if (tenantId && taskTenantId && tenantId !== taskTenantId) {
      throw new ControlPlaneError("任务产出文件与任务租户不匹配", {
        code: "TENANT_SCOPE_FORBIDDEN",
        statusCode: 403,
        details: { taskId }
      });
    }
    const currentSnapshot = task.resultSnapshot && typeof task.resultSnapshot === "object"
      ? clone(task.resultSnapshot)
      : {};
    const artifacts = Array.isArray(currentSnapshot.artifacts) ? currentSnapshot.artifacts : [];
    const artifact = artifacts.find((item) => (item?.id || item?.name) === normalizedArtifactId);
    if (!artifact) {
      throw new ControlPlaneError("找不到任务产出文件", {
        code: "TASK_ARTIFACT_NOT_FOUND",
        statusCode: 404,
        details: { taskId, artifactId: normalizedArtifactId }
      });
    }
    if (typeof this.persistence.replaceEvents !== "function") {
      throw new ControlPlaneError("Persistence adapter does not support artifact redaction", {
        code: "TASK_ARTIFACT_DELETE_UNAVAILABLE",
        statusCode: 503
      });
    }

    const deletedAt = this.now();
    const removedArtifact = {
      id: artifact.id || normalizedArtifactId,
      name: artifact.name || null,
      taskId: task.taskId,
      taskRunId: task.taskRunId || null,
      agentId: artifact.agentId || task.agentId,
      deletedAt
    };
    const remainingArtifacts = artifacts.filter((item) => (item?.id || item?.name) !== normalizedArtifactId);
    const suppressedArtifacts = Array.isArray(currentSnapshot.suppressedArtifacts)
      ? currentSnapshot.suppressedArtifacts.filter((item) => (item?.id || item) !== normalizedArtifactId)
      : [];
    task.resultSnapshot = {
      ...currentSnapshot,
      artifacts: remainingArtifacts,
      suppressedArtifacts: [...suppressedArtifacts, removedArtifact],
      generatedAt: deletedAt
    };
    task.updatedAt = deletedAt;

    const events = readAllTaskEvents(this.persistence, task.taskId, task.currentSeq);
    this.persistence.replaceEvents(task.taskId, events.map((event) => redactArtifactFromEvent(event, normalizedArtifactId)));
    this.persistence.saveTask(task);
    const event = this.appendTaskEvent(task, {
      commandId: `artifact:${normalizedArtifactId}:deleted`,
      correlationId: task.taskId,
      agentId: removedArtifact.agentId,
      type: "task.artifact.delete"
    }, "artifact.deleted", {
      artifact: removedArtifact,
      text: removedArtifact.name || "任务产出文件已删除"
    });
    return {
      accepted: true,
      taskId: task.taskId,
      taskRunId: task.taskRunId,
      currentSeq: event.seq,
      artifact: removedArtifact
    };
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
    const existing = this.listAllTaskEvents(taskId);
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
      const assignmentStep = assignmentStepForExternalEvent(task, incoming);
      if (incomingTaskId && incomingTaskId !== task.taskId) throw externalIdentityMismatch("taskId", task.taskId);
      if (incomingRunId && incomingRunId !== task.taskRunId && !assignmentStep) throw externalIdentityMismatch("taskRunId", task.taskRunId);
      if (incomingConversationId && incomingConversationId !== task.conversationId) throw externalIdentityMismatch("conversationId", task.conversationId);
      const payload = {
        ...sanitizeExternalPayload(incoming.payload && typeof incoming.payload === "object" && !Array.isArray(incoming.payload) ? incoming.payload : {}),
        source,
        externalEventId,
        externalType: type,
        externalSeq: Number.isInteger(incoming.seq) ? incoming.seq : Number.isInteger(incoming.sequence) ? incoming.sequence : null,
        externalOccurredAt: incoming.occurredAt || incoming.occurred_at || null
      };

      if (assignmentStep && EXTERNAL_TERMINAL_EVENT_TYPES.has(type)) {
        const connectorEvent = this.appendTaskEvent(task, {
          commandId: `external:${externalEventId}`,
          correlationId: incoming.correlationId || incoming.correlation_id || task.taskId,
          agentId: incoming.agentId || incoming.agent_id || assignmentStep.agentId,
          type: "connector.event",
          payload: {}
        }, type, {
          ...payload,
          assignmentStepId: assignmentStep.id,
          parentTaskId: task.taskId,
          parentTaskRunId: task.taskRunId,
          taskRunId: assignmentStep.taskRunId,
          executorAgentId: assignmentStep.agentId
        });
        const completed = type === "task.completed";
        const cancelled = type === "task.cancelled";
        const blocked = type === "task.blocked";
        const terminalStatus = completed
          ? "COMPLETED"
          : cancelled
            ? "CANCELLED"
            : blocked
              ? "BLOCKED"
              : "FAILED";
        assignmentStep.status = terminalStatus;
        assignmentStep.completedAt = completed ? this.now() : null;
        assignmentStep.failedAt = completed ? null : this.now();
        const steps = task.assignment.execution.steps;
        const successors = completed
          ? steps.filter((step) => step?.status === "PENDING" && (step.dependsOn || []).includes(assignmentStep.agentId))
          : [];
        assignmentStep.handoff = completed && successors.length
          ? buildAssignmentHandoff({ task, step: assignmentStep, payload, createdAt: assignmentStep.completedAt, successorSteps: successors })
          : null;
        task.assignment.execution.status = completed ? "RUNNING" : terminalStatus;
        task.assignment.status = completed ? "RUNNING" : terminalStatus;
        task.updatedAt = this.now();
        this.persistence.saveTask(task);
        this.appendTaskEvent(task, {
          commandId: `external:${externalEventId}:stage`,
          correlationId: incoming.correlationId || incoming.correlation_id || task.taskId,
          agentId: assignmentStep.agentId,
          type: "connector.event",
          payload: {}
        }, completed ? "agent.stage.completed" : cancelled ? "agent.stage.cancelled" : blocked ? "agent.stage.blocked" : "agent.stage.failed", {
          ...payload,
          assignmentStepId: assignmentStep.id,
          taskRunId: assignmentStep.taskRunId,
          agentId: assignmentStep.agentId,
          terminalState: terminalStatus,
          text: completed
            ? `${assignmentStep.agentName} 已完成本步骤。`
            : cancelled
              ? `${assignmentStep.agentName} 已停止本步骤。`
              : blocked
                ? `${assignmentStep.agentName} 已阻塞本步骤，等待处理。`
                : `${assignmentStep.agentName} 未完成本步骤。`
        });
        if (assignmentStep.handoff) {
          this.appendTaskEvent(task, {
            commandId: `external:${externalEventId}:handoff`,
            correlationId: incoming.correlationId || incoming.correlation_id || task.taskId,
            agentId: assignmentStep.agentId,
            type: "connector.event",
            payload: {}
          }, "agent.stage.handoff.ready", {
            assignmentStepId: assignmentStep.id,
            taskRunId: assignmentStep.taskRunId,
            agentId: assignmentStep.agentId,
            handoff: assignmentStep.handoff,
            text: `${assignmentStep.agentName} 已把本步骤的结果和依据交给下一位 Agent。`
          });
        }
        if (!completed) {
          const terminalCommandType = cancelled
            ? COMMAND_TYPES.CANCEL
            : blocked
              ? COMMAND_TYPES.BLOCK
              : COMMAND_TYPES.FAIL;
          this.dispatch({
            type: terminalCommandType,
            taskId: task.taskId,
            taskRunId: task.taskRunId,
            conversationId: task.conversationId,
            agentId: "chief_of_staff",
            payload: {
              reason: cancelled
                ? "ASSIGNMENT_STEP_CANCELLED"
                : blocked
                  ? "ASSIGNMENT_STEP_BLOCKED"
                  : "ASSIGNMENT_STEP_FAILED",
              assignmentStepId: assignmentStep.id
            }
          });
          Object.assign(task, this.requireTask(task.taskId));
        } else if (steps.every((step) => step.status === "COMPLETED")) {
          task.assignment.status = "COMPLETED";
          task.assignment.execution.status = "COMPLETED";
          task.assignment.execution.completedAt = this.now();
          task.updatedAt = this.now();
          this.persistence.saveTask(task);
          this.dispatch({
            type: COMMAND_TYPES.COMPLETE,
            taskId: task.taskId,
            taskRunId: task.taskRunId,
            conversationId: task.conversationId,
            agentId: "chief_of_staff",
            payload: { reason: "ASSIGNMENT_STEPS_COMPLETED" }
          });
          Object.assign(task, this.requireTask(task.taskId));
        } else {
          queueMicrotask(() => {
            void this.resumeAssignmentExecution(task.taskId);
          });
        }
        accepted.push(connectorEvent);
        seen.add(externalEventId);
        continue;
      }

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
        syncExternalAcquisitionState(latest, payload);
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
      syncExternalAcquisitionState(task, payload);
      const followUpTerminalEvent = singleOutreachTerminalEvent(task, incoming, type, payload, externalEventId);
      if (followUpTerminalEvent) {
        task.updatedAt = this.now();
        this.persistence.saveTask(task);
        const finalized = this.ingestExecutionEvents({
          taskId: task.taskId,
          tenantId,
          uid,
          source,
          events: [followUpTerminalEvent]
        });
        Object.assign(task, this.requireTask(task.taskId));
        accepted.push(...finalized.events);
      }
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
    if (canAutoConfirmLowRiskTask(task, command)) {
      return this.applyAutoConfirmedTaskStart(task, command);
    }
    let effectiveCommand = command;
    if (command.type === COMMAND_TYPES.REQUIREMENT_CONFIRM) {
      const proposal = task.requirements?.proposal || {};
      const workflow = selectWorkflowForRequirement(proposal, {
        // The client hint is intentionally advisory. The workflow selector
        // requires an explicit external action in the persisted proposal or
        // original goal before it can open an account-access gate.
        requiresAccess: command.payload?.requiresAccess === true,
        goal: task.goal
      });
      const executionBoundary = resolveExecutionBoundary(proposal, {
        taskAgentId: task.agentId,
        requiresAccess: command.payload?.requiresAccess === true,
        goal: task.goal
      });
      effectiveCommand = {
        ...command,
        payload: {
          ...(command.payload || {}),
          requiresAccess: requiresAuthorizedExecution(workflow, executionBoundary)
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
    if (effectiveCommand.type === COMMAND_TYPES.TASK_CONFIG_UPDATE) {
      assertTaskConfigurationVersion(task, effectiveCommand.payload);
      assertTaskConfigurationSafety(task, effectiveCommand.payload);
    }
    this.assertTaskStartGates(task, effectiveCommand);
    const fromState = task.state;
    const nextState = transitionTaskState(fromState, effectiveCommand, { currentVersion: task.version });
    task.state = nextState;
    task.version += 1;
    task.updatedAt = this.now();
    task.lastCommandId = effectiveCommand.commandId;
    const configurationUpdate = this.applyTaskMetadata(task, effectiveCommand);
    const eventType = effectiveCommand.type === COMMAND_TYPES.ACCESS_REQUEST && effectiveCommand.payload?.authorizationConfirmed === true
      ? "access.authorization.granted"
      : EVENT_TYPES[effectiveCommand.type] || "task.command.applied";
    const event = this.appendTaskEvent(task, effectiveCommand, eventType, {
      commandType: effectiveCommand.type,
      fromState,
      state: nextState,
      version: task.version,
      ...(configurationUpdate || {}),
      ...(eventType === "access.authorization.granted"
        ? { stage: effectiveCommand.type === COMMAND_TYPES.ACCESS_GRANT ? "scope" : "authorization" }
        : {}),
      ...effectiveCommand.payload
    });
    const ack = this.ack(effectiveCommand, task, event, { previousState: fromState });
    if (effectiveCommand.type === COMMAND_TYPES.REQUIREMENT_CONFIRM) {
      const gateEvents = this.appendRequirementGates(task, effectiveCommand);
      const latestTask = this.requireTask(task.taskId);
      return {
        ...ack,
        state: latestTask.state,
        currentVersion: latestTask.version,
        currentSeq: gateEvents.at(-1)?.seq || ack.currentSeq,
        data: {
          assignment: clone(latestTask.assignment),
          access: clone(latestTask.accessRequest),
          workflow: clone(latestTask.workflow),
          ...(latestTask.resultSnapshot ? { resultSnapshot: clone(latestTask.resultSnapshot) } : {})
        }
      };
    }
    return ack;
  }

  applyAutoConfirmedTaskStart(task, command) {
    const previousState = task.state;
    const primed = this.apply({
      ...command,
      payload: {
        ...(command.payload || {}),
        requirementsConfirmed: false,
        autoConfirmLowRisk: false
      }
    });
    const proposal = task.requirements?.proposal;
    const confirmed = this.apply({
      ...command,
      commandId: `${command.commandId}:auto-confirm`,
      idempotencyKey: `${command.idempotencyKey}:auto-confirm`,
      expectedVersion: primed.currentVersion,
      type: COMMAND_TYPES.REQUIREMENT_CONFIRM,
      payload: {
        proposalVersion: proposal?.proposalVersion ?? proposal?.version ?? proposal?.schemaVersion ?? 1,
        requiresAccess: false,
        confirmationSource: "chief_decision_policy",
        automatic: true
      }
    });
    return {
      ...confirmed,
      commandId: command.commandId,
      idempotencyKey: command.idempotencyKey,
      previousState,
      data: {
        ...(confirmed.data || {}),
        automaticRequirementConfirmation: true
      }
    };
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
    const selectedWorkflow = selectWorkflowForRequirement(task.requirements?.proposal || {}, {
      requiresAccess: command.payload?.requiresAccess === true,
      goal: task.goal
    });
    const proposal = task.requirements?.proposal || {};
    const requestedProductAgentId = proposal?.decision?.requestedAgentId
      || proposal?.requestedAgentId
      || task.agentId;
    const executionBoundary = resolveExecutionBoundary(proposal, {
      taskAgentId: task.agentId,
      requiresAccess: command.payload?.requiresAccess === true,
      goal: task.goal
    });
    const capabilityPlan = buildCapabilityAssignmentPlan({
      ...proposal,
      decision: {
        ...(proposal.decision || {}),
        requestedAgentId: requestedProductAgentId
      }
    }, {
      requiresAccess: command.payload?.requiresAccess === true,
      goal: task.goal,
      productRouting: executionBoundary === EXECUTION_BOUNDARIES.PRODUCT_AGENTS
    });
    const workflow = capabilityPlan.workflow || selectedWorkflow;
    const assignments = capabilityPlan.assignments.length || capabilityPlan.blocked
      ? capabilityPlan.assignments
      : assignmentPlanForWorkflow(workflow.id);
    const requiresAccess = requiresAuthorizedExecution(workflow, executionBoundary);
    const accessRequest = normalizeAccessRequest(command.payload);
    task.workflow = {
      id: workflow.id,
      displayName: workflow.displayName,
      executionBoundary,
      requiresAccess,
      allowsOutreach: workflow.allowsOutreach,
      agentIds: assignments.map((assignment) => assignment.agentId),
      runtimeAgentIds: [...workflow.agentIds],
      ...(capabilityPlan.productRoute ? {
        productRoute: capabilityPlan.productRoute.mode,
        orchestratorAgentId: capabilityPlan.productRoute.orchestratorAgentId
      } : {}),
      selectedAt: this.now()
    };
    task.assignment = {
      status: capabilityPlan.blocked ? "BLOCKED" : "PROPOSED",
      assignments,
      execution: capabilityPlan.blocked ? null : assignmentExecutionFor(task, assignments),
      requiredCapabilities: capabilityPlan.requiredCapabilities,
      missingCapabilities: capabilityPlan.missingCapabilities,
      missingAgentIds: capabilityPlan.missingAgentIds || [],
      incompatibleCapabilities: capabilityPlan.incompatibleCapabilities || [],
      proposedAt: this.now()
    };
    task.accessRequest = capabilityPlan.blocked
      ? {
          status: "BLOCKED",
          requestedAt: this.now()
        }
      : requiresAccess
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
      status: task.assignment.status,
      assignments,
      execution: task.assignment.execution,
      workflow: task.workflow,
      text: capabilityPlan.blocked
        ? capabilityPlan.incompatibleCapabilities?.length
          ? "指定的 Agent 不覆盖当前目标所需能力，任务未进入执行或授权阶段。"
          : "当前账号缺少完成这项任务所需的 Agent 配置，任务未进入执行或授权阶段。"
        : workflow.id === "plan_only"
        ? "幕僚长已按确认后的目标形成执行方案；本任务不会读取业务数据或调用外部执行器。"
        : requiresAccess
          ? "任务已按确认后的目标拆解，责任 Agent 已锁定；账号授权前不会读取或发送业务数据。"
        : executionBoundary === EXECUTION_BOUNDARIES.LEGACY_PUBLIC_DISCOVERY
            ? "任务已按确认后的目标拆解，公开数据找人链路已就绪，不会读取账号私域数据或执行触达。"
            : "任务已按确认后的目标拆解，责任 Agent 已锁定；将按该 Agent 的授权执行、数据查询和分析边界运行。"
    });
    if (workflow.id === "plan_only") {
      task.assignment.status = "COMPLETED";
      const resultSnapshot = buildPlanResultSnapshot({
        task,
        workflow,
        assignments,
        completedAt: this.now()
      });
      task.resultSnapshot = clone(resultSnapshot);
      task.updatedAt = this.now();
      this.persistence.saveTask(task);
      const resultEvent = this.appendTaskEvent(task, eventCommand, "task.result.snapshot.updated", {
        resultSnapshot,
        text: resultSnapshot.summary
      });
      this.apply({
        commandId: `${command.commandId}:plan-complete`,
        idempotencyKey: `${command.idempotencyKey}:plan-complete`,
        correlationId: command.correlationId || command.commandId,
        taskId: task.taskId,
        taskRunId: task.taskRunId,
        conversationId: task.conversationId,
        agentId: "chief_of_staff",
        expectedVersion: task.version,
        type: COMMAND_TYPES.COMPLETE,
        payload: {
          resultSnapshot,
          text: "方案规划已完成，未读取业务数据，也未执行任何外部动作。"
        }
      });
      const completedEvent = this.persistence.listEvents(task.taskId, { afterSeq: resultEvent.seq, limit: 1 })[0];
      Object.assign(task, this.requireTask(task.taskId));
      return [assignmentEvent, resultEvent, completedEvent].filter(Boolean);
    }
    if (capabilityPlan.blocked) {
      const blocked = this.apply({
        commandId: `${command.commandId}:capability-blocked`,
        idempotencyKey: `${command.idempotencyKey}:capability-blocked`,
        correlationId: command.correlationId || command.commandId,
        taskId: task.taskId,
        taskRunId: task.taskRunId,
        conversationId: task.conversationId,
        agentId: "chief_of_staff",
        expectedVersion: task.version,
        type: COMMAND_TYPES.BLOCK,
        payload: {
          reason: capabilityPlan.incompatibleCapabilities?.length
            ? "REQUESTED_PRODUCT_AGENT_INCOMPATIBLE"
            : "PRODUCT_AGENT_UNAVAILABLE",
          requiredCapabilities: capabilityPlan.requiredCapabilities,
          missingAgentIds: capabilityPlan.missingAgentIds || [],
          incompatibleCapabilities: capabilityPlan.incompatibleCapabilities || [],
          text: "任务未进入执行；请调整目标，或选择覆盖该能力的 Agent。"
        }
      });
      const blockedEvent = this.persistence.listEvents(task.taskId, { afterSeq: blocked.currentSeq - 1, limit: 1 })[0];
      Object.assign(task, this.requireTask(task.taskId));
      return [assignmentEvent, blockedEvent].filter(Boolean);
    }
    if (!requiresAccess) return [assignmentEvent];
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
      configuration: initialTaskConfiguration({ ...command.payload, agentId: command.agentId }, createdAt),
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
    if (command.type === COMMAND_TYPES.COMPLETE && command.payload?.resultSnapshot && typeof command.payload.resultSnapshot === "object") {
      task.resultSnapshot = clone(command.payload.resultSnapshot);
    }
    if (command.type === COMMAND_TYPES.REQUIREMENT_EDIT) {
      const value = command.payload.text ?? command.payload.goal ?? command.payload.objective ?? command.payload.input;
      task.goal = value;
      const previousVersion = Number(task.requirements?.proposalVersion || task.requirements?.proposal?.proposalVersion || 0);
      task.requirements = { confirmed: false, status: "PENDING", proposalVersion: previousVersion + 1 };
    }
    if (command.type === COMMAND_TYPES.APPROVAL_REQUEST) task.pendingApproval = clone(command.payload);
    if (command.type === COMMAND_TYPES.APPROVAL_DECISION) task.pendingApproval = null;
    if (command.type === COMMAND_TYPES.TASK_CONFIG_UPDATE) {
      return applyTaskConfigurationUpdate(task, command.payload, this.now());
    }
    return null;
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

function buildPlanResultSnapshot({ task, workflow, assignments, completedAt }) {
  const requirement = task.requirements?.proposal || {};
  const missing = Array.isArray(requirement.missing) ? requirement.missing.filter(Boolean) : [];
  const risks = [requirement.guardrail, ...missing].filter(Boolean);
  const planningTarget = [requirement.objective, requirement.title, requirement.touchPlan?.action, task.goal].filter(Boolean).join(" ");
  const plannedWorkflowId = /触达|私信|外联|跟进|联系|发送|回复|outreach|message|send|dm/i.test(planningTarget)
    ? WORKFLOW_IDS.FIND_AND_OUTREACH
    : /获客|潜客|客户|线索|找人|筛选|评论|账号|搜索|检索/i.test(planningTarget)
      ? WORKFLOW_IDS.FIND_ONLY
      : WORKFLOW_IDS.PLAN_ONLY;
  const plannedWorkflow = getWorkflowDefinition(plannedWorkflowId) || workflow;
  const plannedAssignments = plannedWorkflowId === WORKFLOW_IDS.PLAN_ONLY
    ? assignments
    : assignmentPlanForWorkflow(plannedWorkflowId);
  return {
    type: "execution_plan",
    source: "chief_of_staff",
    status: "completed",
    title: requirement.title || "幕僚长执行方案",
    objective: requirement.objective || task.goal || "",
    summary: "幕僚长已完成任务拆解、责任分工、验收标准和风险边界，方案可直接用于后续执行。",
    decision: `本次采用${workflow.displayName}，仅交付方案；后续执行建议采用${plannedWorkflow.displayName}。当前未读取业务数据，也未调用外部执行器。`,
    plan: plannedAssignments.map((assignment, index) => ({
      step: index + 1,
      agentId: assignment.agentId,
      agentName: assignment.agentName,
      responsibility: assignment.skill,
      mission: assignment.mission,
      acceptance: assignment.acceptance,
      plannedOnly: true
    })),
    acceptanceCriteria: [requirement.deliverable, ...plannedAssignments.map((assignment) => assignment.acceptance)].filter(Boolean),
    risks,
    guardrail: requirement.guardrail || null,
    scope: requirement.scope || null,
    completedAt
  };
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
    ["accountId", value("accountId") || value("account_id")],
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
  if (type === "task.config.updated" || type === "task.configuration.updated") {
    const configuration = payload.configuration && typeof payload.configuration === "object" && !Array.isArray(payload.configuration)
      ? payload.configuration
      : null;
    if (configuration) task.configuration = clone(configuration);
  }
  const snapshot = payload.resultSnapshot || payload.result_snapshot || payload.result;
  if (snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)) {
    task.resultSnapshot = clone(snapshot);
  }
  if (type === "artifact.created") {
    const artifact = payload.artifact || payload.file || null;
    const artifactId = artifact?.id || artifact?.name || null;
    if (artifact && typeof artifact === "object" && artifactId) {
      const current = task.resultSnapshot && typeof task.resultSnapshot === "object" ? task.resultSnapshot : {};
      const artifacts = Array.isArray(current.artifacts) ? current.artifacts : [];
      if (!artifacts.some((item) => (item?.id || item?.name) === artifactId)) {
        task.resultSnapshot = { ...current, artifacts: [...artifacts, clone(artifact)] };
      }
    }
  }
  if (type === "lead.source.synced" || type === "lead.qualified") {
    task.resultSnapshot = {
      ...(task.resultSnapshot || {}),
      leads: payload.leads || payload.candidates || payload.leadCount || task.resultSnapshot?.leads || null,
      updatedAt: payload.externalOccurredAt || new Date().toISOString()
    };
  }
  if (type === "outreach.accepted" || type === "outreach.sent" || type === "reply.sent" || type === "outreach.failed") {
    task.resultSnapshot = mergeOutreachReceiptSnapshot(task.resultSnapshot, type, payload);
    const previous = task.resultSnapshot?.outreach || {};
    const accepted = type === "outreach.accepted" || (type === "reply.sent" && payload.deliveryState === "accepted");
    task.resultSnapshot = {
      ...(task.resultSnapshot || {}),
      outreach: {
        ...previous,
        lastEvent: type,
        accepted: accepted ? Number(previous.accepted || 0) + 1 : Number(previous.accepted || 0),
        sent: type === "outreach.sent" || (type === "reply.sent" && payload.deliveryState !== "accepted") ? Number(previous.sent || 0) + 1 : Number(previous.sent || 0),
        failed: type === "outreach.failed" ? Number(previous.failed || 0) + 1 : Number(previous.failed || 0)
      }
    };
  }
}

function singleOutreachTerminalEvent(task, incoming, type, payload, externalEventId) {
  if (payload?.completionManaged === "core_event") return null;
  if (task?.resultSnapshot?.type !== "single_outreach") return null;
  if (![TASK_STATES.RUNNING, TASK_STATES.PAUSED].includes(task.state)) return null;
  if (type === "outreach.sent") {
    return {
      eventId: `${externalEventId}:single-outreach-completed`,
      type: "task.completed",
      taskId: task.taskId,
      taskRunId: incoming.taskRunId || incoming.task_run_id || task.taskRunId,
      conversationId: incoming.conversationId || incoming.conversation_id || task.conversationId,
      agentId: incoming.agentId || incoming.agent_id || task.agentId,
      payload: {
        resultSnapshot: clone(task.resultSnapshot),
        reason: "OUTREACH_DELIVERY_CONFIRMED",
        text: "私信已收到平台成功回执。"
      }
    };
  }
  if (type === "outreach.failed" && payload?.retryable !== true) {
    return {
      eventId: `${externalEventId}:single-outreach-failed`,
      type: "task.failed",
      taskId: task.taskId,
      taskRunId: incoming.taskRunId || incoming.task_run_id || task.taskRunId,
      conversationId: incoming.conversationId || incoming.conversation_id || task.conversationId,
      agentId: incoming.agentId || incoming.agent_id || task.agentId,
      payload: {
        resultSnapshot: clone(task.resultSnapshot),
        reason: "OUTREACH_DELIVERY_FAILED",
        text: "私信未获得成功回执。"
      }
    };
  }
  return null;
}

function mergeOutreachReceiptSnapshot(snapshot, type, payload) {
  const current = snapshot && typeof snapshot === "object" && !Array.isArray(snapshot) ? clone(snapshot) : {};
  const queue = Array.isArray(current.approvalQueue) ? current.approvalQueue.slice() : [];
  const deliveryState = type === "outreach.sent"
    ? "sent"
    : type === "outreach.failed"
      ? "failed"
      : "pending";
  const incomingRecipient = payload.lead || payload.recipient || payload.candidate || {};
  const requestedReceiptKeys = new Set([
    normalizeNullableString(payload.reqId || payload.req_id || payload.requestId || payload.request_id),
    normalizeNullableString(payload.commandId || payload.command_id || payload.letterInfoId || payload.letter_info_id),
    normalizeNullableString(payload.ackId || payload.ack_id)
  ].filter(Boolean));
  const incomingIdentity = outreachRecipientIdentity(mergeOutreachRecipient(incomingRecipient, payload));
  const receiptMatchIndex = queue.findIndex((item) => receiptKeysForQueueItem(item).some((key) => requestedReceiptKeys.has(key)));
  const identityMatchIndex = incomingIdentity
    ? queue.findIndex((item) => outreachRecipientIdentity(item?.lead || item?.recipient || item) === incomingIdentity)
    : -1;
  // A single-outreach task deliberately owns exactly one target. When a
  // legacy ACK omits recipient identifiers, its task context is sufficient to
  // attach it without guessing across a multi-recipient queue.
  const index = receiptMatchIndex >= 0
    ? receiptMatchIndex
    : identityMatchIndex >= 0
      ? identityMatchIndex
      : queue.length === 1 ? 0 : -1;
  const previous = index >= 0 && queue[index] && typeof queue[index] === "object" ? queue[index] : {};
  const recipient = mergeOutreachRecipient({
    ...(previous.lead || {}),
    ...(previous.recipient || {}),
    ...(incomingRecipient && typeof incomingRecipient === "object" ? incomingRecipient : {})
  }, payload);
  const receipt = compactExternalRecord({
    state: deliveryState,
    providerState: normalizeNullableString(payload.providerState || payload.provider_state || payload.deliveryState || payload.delivery_state || payload.state),
    receiptPending: type !== "outreach.sent",
    messageId: normalizeNullableString(payload.messageId || payload.message_id),
    reqId: normalizeNullableString(payload.reqId || payload.req_id || payload.requestId || payload.request_id),
    commandId: normalizeNullableString(payload.commandId || payload.command_id || payload.letterInfoId || payload.letter_info_id),
    ackId: normalizeNullableString(payload.ackId || payload.ack_id),
    updatedAt: payload.externalOccurredAt || new Date().toISOString()
  });
  const candidateId = outreachRecipientIdentity(recipient);
  const nextItem = {
    ...previous,
    ...(candidateId ? { id: previous.id || `outreach:${candidateId}` } : {}),
    lead: { ...(previous.lead || {}), ...recipient },
    recipient: { ...(previous.recipient || previous.lead || {}), ...recipient },
    ...(payload.content ? { content: payload.content } : {}),
    state: deliveryState,
    deliveryState,
    receipt: { ...(previous.receipt || {}), ...receipt },
    updatedAt: receipt.updatedAt
  };
  if (candidateId || index >= 0) {
    if (index >= 0) queue[index] = nextItem;
    else queue.push(nextItem);
  }
  const updateLeadList = (items) => {
    if (!Array.isArray(items)) return candidateId ? [recipient] : items;
    const previousIdentity = outreachRecipientIdentity(previous.lead || previous.recipient || previous);
    const found = items.findIndex((item) => {
      const itemIdentity = outreachRecipientIdentity(item);
      return itemIdentity === candidateId || (previousIdentity && itemIdentity === previousIdentity);
    });
    if (found < 0) return candidateId ? [...items, recipient] : items;
    return items.map((item, itemIndex) => itemIndex === found ? { ...item, ...recipient } : item);
  };
  const queueCounts = queue.reduce((counts, item) => {
    const state = String(item?.state || item?.deliveryState || "").toLowerCase();
    if (["sent", "delivered"].includes(state)) counts.sent += 1;
    else if (state === "failed") counts.failed += 1;
    else counts.pending += 1;
    return counts;
  }, { pending: 0, sent: 0, failed: 0 });
  return {
    ...current,
    ...(queue.length ? { approvalQueue: queue } : {}),
    ...(candidateId ? { leads: updateLeadList(current.leads), candidates: updateLeadList(current.candidates) } : {}),
    delivery: { ...(current.delivery || {}), ...receipt },
    counts: {
      ...(current.counts || {}),
      candidates: Math.max(Number(current.counts?.candidates || 0), queue.length),
      pending: queueCounts.pending,
      sent: queueCounts.sent,
      delivered: queue.filter((item) => String(item?.deliveryState || "").toLowerCase() === "delivered").length,
      failed: queueCounts.failed
    },
    updatedAt: receipt.updatedAt
  };
}

function receiptKeysForQueueItem(item = {}) {
  const receipt = item?.receipt && typeof item.receipt === "object" ? item.receipt : {};
  return [
    item.requestId,
    item.reqId,
    item.commandId,
    receipt.reqId,
    receipt.req_id,
    receipt.commandId,
    receipt.command_id,
    receipt.letterInfoId,
    receipt.letter_info_id,
    receipt.ackId,
    receipt.ack_id
  ].map(normalizeNullableString).filter(Boolean);
}

function mergeOutreachRecipient(value, payload = {}) {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const id = normalizeNullableString(
    input.id || input.leadId || input.lead_id || input.sourceRecordId || input.source_record_id
    || input.secUid || input.sec_uid || input.secId || input.sec_id
    || payload.leadId || payload.lead_id || payload.secUid || payload.sec_uid || payload.secId || payload.sec_id
  );
  const nickname = normalizeNullableString(input.nickname || input.name || input.displayName || input.display_name || payload.nickname || payload.name);
  return compactExternalRecord({
    ...input,
    id,
    leadId: input.leadId || input.lead_id || id,
    nickname: nickname || input.nickname || input.name || null,
    name: input.name || nickname || null,
    secId: input.secId || input.sec_id || payload.secId || payload.sec_id || null,
    secUid: input.secUid || input.sec_uid || payload.secUid || payload.sec_uid || null
  });
}

function outreachRecipientIdentity(value = {}) {
  return normalizeNullableString(value.id || value.leadId || value.lead_id || value.sourceRecordId || value.source_record_id || value.secUid || value.sec_uid || value.secId || value.sec_id);
}

function compactExternalRecord(value = {}) {
  return Object.fromEntries(Object.entries(value)
    .filter(([, item]) => item !== undefined && item !== null && item !== ""));
}

function syncExternalAcquisitionState(task, payload) {
  const runtimeState = String(payload?.runtimeState || "").trim().toUpperCase();
  if ([TASK_STATES.CREATED, TASK_STATES.RUNNING, TASK_STATES.PAUSED, TASK_STATES.FAILED, TASK_STATES.CANCELLED].includes(runtimeState)) {
    task.state = runtimeState;
  }
  const health = String(payload?.health || "").trim().toUpperCase();
  if (health) task.health = health;
}

function initialTaskConfiguration(payload = {}, timestamp = new Date().toISOString()) {
  const continuousListener = ["mkt-comment-acquisition", "mkt-find-people"].includes(String(payload.agentId || "").trim());
  const executionConfig = payload.config && typeof payload.config === "object" && !Array.isArray(payload.config)
    ? clone(payload.config)
    : (payload.configuration && typeof payload.configuration === "object" && !Array.isArray(payload.configuration)
      ? clone(payload.configuration)
      : null);
  if (continuousListener && executionConfig?.workWindow && typeof executionConfig.workWindow === "object") {
    delete executionConfig.workWindow.schedule;
    delete executionConfig.workWindow.timeWindow;
    delete executionConfig.workWindow.time_window;
    delete executionConfig.workWindow.timezone;
  }
  return {
    version: 1,
    effectiveScope: "task_start",
    findingStrategy: clone(payload.findingStrategy || null),
    touchChannel: payload.touchChannel || null,
    touchContent: clone(payload.touchContent || null),
    replyStyle: clone(payload.replyStyle || null),
    handoffBoundary: clone(payload.handoffBoundary || null),
    frequency: clone(payload.frequency || null),
    ...(continuousListener ? {} : { timeWindow: clone(payload.timeWindow || null) }),
    approvalMode: payload.approvalMode || null,
    // Keep the product Agent's complete first-run configuration durable. The
    // runtime dispatcher reads this when later commands only carry an ID.
    executionConfig: clone(executionConfig),
    updatedAt: timestamp
  };
}

function assertTaskConfigurationVersion(task, payload) {
  const current = Number(task.configuration?.version || 1);
  if (payload.baseConfigVersion !== current) {
    throw new ControlPlaneError("Configuration version is stale", {
      code: "STALE_CONFIGURATION_VERSION",
      statusCode: 409,
      details: {
        taskId: task.taskId,
        baseConfigVersion: payload.baseConfigVersion,
        currentConfigVersion: current
      }
    });
  }
}

function assertTaskConfigurationSafety(task, payload) {
  const previous = task.configuration || initialTaskConfiguration({}, task.createdAt);
  const next = mergeConfiguration(previous, payload.changes);
  const previousStrategy = previous.findingStrategy;
  const nextStrategy = next.findingStrategy;
  const scopeChanged = isRecord(nextStrategy)
    && (nextStrategy.sourceScope !== undefined || nextStrategy.scope !== undefined)
    && !sameScopeValue(previousStrategy?.sourceScope ?? previousStrategy?.scope, nextStrategy.sourceScope ?? nextStrategy.scope);
  const scopeExpanded = isRecord(nextStrategy)
    && (nextStrategy.scopeExpansion === true || nextStrategy.expandScope === true)
    && !(previousStrategy?.scopeExpansion === true || previousStrategy?.expandScope === true);
  if ((scopeChanged || scopeExpanded) && payload.confirmation?.confirmed !== true) {
    throw new ControlPlaneError("Changing the acquisition scope requires explicit confirmation", {
      code: "CONFIG_UPDATE_CONFIRMATION_REQUIRED",
      statusCode: 422,
      details: { field: "changes.findingStrategy", reason: "scope_changed" }
    });
  }
  const frequency = next.frequency;
  if (!frequency || typeof frequency !== "object" || Array.isArray(frequency)) return;

  const previousFrequency = previous.frequency;
  if (!previousFrequency || typeof previousFrequency !== "object" || Array.isArray(previousFrequency)) return;

  const nextMaxPerDay = frequency.maxPerDay ?? frequency.maxTouchesPerDay;
  const previousMaxPerDay = previousFrequency.maxPerDay ?? previousFrequency.maxTouchesPerDay;
  const relaxed = (
    isNumber(nextMaxPerDay) && isNumber(previousMaxPerDay) && nextMaxPerDay > previousMaxPerDay
  ) || (
    isNumber(frequency.intervalSeconds) && isNumber(previousFrequency.intervalSeconds) && frequency.intervalSeconds < previousFrequency.intervalSeconds
  ) || (
    isNumber(frequency.minDelaySeconds) && isNumber(previousFrequency.minDelaySeconds) && frequency.minDelaySeconds < previousFrequency.minDelaySeconds
  ) || (
    isNumber(frequency.cooldownSeconds) && isNumber(previousFrequency.cooldownSeconds) && frequency.cooldownSeconds < previousFrequency.cooldownSeconds
  ) || (
    isNumber(frequency.minIntervalMinutes) && isNumber(previousFrequency.minIntervalMinutes) && frequency.minIntervalMinutes < previousFrequency.minIntervalMinutes
  );

  if (relaxed && payload.confirmation?.confirmed !== true) {
    throw new ControlPlaneError("Increasing outreach frequency requires explicit confirmation", {
      code: "CONFIG_UPDATE_CONFIRMATION_REQUIRED",
      statusCode: 422,
      details: { field: "changes.frequency", reason: "frequency_relaxed" }
    });
  }
}

function applyTaskConfigurationUpdate(task, payload, timestamp) {
  const previous = task.configuration || initialTaskConfiguration({}, task.createdAt);
  const next = {
    ...mergeConfiguration(previous, payload.changes),
    version: payload.configVersion,
    effectiveScope: payload.effectiveScope,
    effectiveAt: timestamp,
    effectiveFromSeq: Number(task.currentSeq || 0) + 1,
    updatedAt: timestamp
  };
  task.configuration = next;
  return {
    configuration: clone(next),
    previousConfiguration: clone(previous),
    configurationVersion: next.version,
    previousConfigurationVersion: previous.version,
    effectiveScope: payload.effectiveScope,
    changes: clone(payload.changes),
    updatedSections: Object.keys(payload.changes),
    ...(payload.confirmation ? { confirmation: clone(payload.confirmation) } : {})
  };
}

function mergeConfiguration(base, patch) {
  const result = clone(base || {});
  for (const [key, value] of Object.entries(patch || {})) {
    if (isRecord(value) && isRecord(result[key])) result[key] = mergeConfiguration(result[key], value);
    else result[key] = clone(value);
  }
  return result;
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sameValue(left, right) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function sameScopeValue(left, right) {
  if (typeof left === "string" && isRecord(right)) return left === (right.kind ?? right.type ?? right.scope);
  if (typeof right === "string" && isRecord(left)) return right === (left.kind ?? left.type ?? left.scope);
  return sameValue(left, right);
}

function isNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function providersMatch(requested, actual) {
  const normalize = (value) => {
    const raw = String(value || "").trim().toLowerCase();
    if (["douyin", "抖音", "抖音账号", "内容账号"].includes(raw)) return "douyin";
    return raw;
  };
  return Boolean(normalize(requested)) && normalize(requested) === normalize(actual);
}

function canAutoConfirmLowRiskTask(task, command) {
  if (command.type !== COMMAND_TYPES.TASK_START || task.state !== TASK_STATES.CREATED) return false;
  if (command.payload?.autoConfirmLowRisk !== true) return false;
  const requirement = task.requirements || {};
  const decision = requirement.proposal?.decision || {};
  return requirement.status === "PROPOSED"
    && requirement.confirmed !== true
    && decision.intent === "task"
    && decision.riskLevel === "low"
    && decision.confirmationPolicy === "none"
    && decision.shouldCreateTask === true
    && Array.isArray(decision.blockingMissing)
    && decision.blockingMissing.length === 0;
}

function summarizeChiefTasks(tasks = []) {
  const overview = {
    total: 0,
    running: 0,
    waiting: 0,
    blocked: 0,
    completed: 0,
    active: []
  };
  for (const task of Array.isArray(tasks) ? tasks : []) {
    overview.total += 1;
    const state = String(task?.state || "").toUpperCase();
    if ([TASK_STATES.RUNNING, TASK_STATES.RETRYING].includes(state)) {
      overview.running += 1;
      if (overview.active.length < 5) overview.active.push({
        taskId: task.taskId,
        title: task.requirements?.proposal?.title || task.goal || "未命名任务",
        state: chiefTaskStateLabel(state)
      });
      continue;
    }
    if ([TASK_STATES.CREATED, TASK_STATES.PAUSED].includes(state)) {
      overview.waiting += 1;
      continue;
    }
    if ([TASK_STATES.BLOCKED, TASK_STATES.FAILED].includes(state)) {
      overview.blocked += 1;
      continue;
    }
    overview.completed += 1;
  }
  return overview;
}

function chiefTaskStateLabel(state) {
  const labels = {
    [TASK_STATES.CREATED]: "待启动",
    [TASK_STATES.RUNNING]: "执行中",
    [TASK_STATES.PAUSED]: "已暂停",
    [TASK_STATES.RETRYING]: "重试中",
    [TASK_STATES.SUCCEEDED]: "已完成",
    [TASK_STATES.FAILED]: "执行失败",
    [TASK_STATES.CANCELLED]: "已取消",
    [TASK_STATES.BLOCKED]: "已阻塞"
  };
  return labels[state] || "状态未知";
}

function chiefConciergeMessage({ input = "", decision = {}, overview = {} } = {}) {
  if (decision.intent === CHIEF_INTENTS.STATUS_QUERY) {
    const summary = `当前任务总览：执行中 ${overview.running || 0} 项，等待处理 ${overview.waiting || 0} 项，阻塞 ${overview.blocked || 0} 项，已结束 ${overview.completed || 0} 项。`;
    const active = Array.isArray(overview.active) && overview.active.length
      ? `正在关注：${overview.active.map((task) => `${task.title}（${task.state}）`).join("；")}。`
      : "当前没有执行中的任务。";
    return `${summary}${active}`;
  }
  if (isChiefControlRequest(input)) return "幕僚长一期只负责查看全局状态和咨询引导，不提供暂停、继续、取消或重试。请在对应任务或专业 Agent 的工作页操作。";
  if (isChiefCapabilityQuestion(input)) {
    return "我是全局运营管家：可以查看所有 Agent 的工作状态、任务进展和已有数据，并引导你前往对应专业 Agent。我不拆分、派发、启动或控制任务，更不会代替你的账号对外发送消息。";
  }
  const guidance = chiefConsultationGuidance(input);
  if (guidance) return guidance;
  return "幕僚长不创建、派发、启动或控制任务。我可以查看全局 Agent 状态、汇总已有数据，并引导你前往对应专业 Agent 发起具体业务。";
}

function isChiefCapabilityQuestion(input) {
  return /(?:你|幕僚长).{0,8}(?:能|可以|会).{0,8}(?:做什么|帮我做什么|怎么帮我|提供什么)|(?:你|幕僚长).{0,8}(?:有什么能力|职责是什么|负责什么)/u.test(String(input || ""));
}

function isChiefControlRequest(input) {
  return /(?:暂停|停止|终止|取消|继续|恢复|重试).{0,8}(?:任务|执行|工作)?/u.test(String(input || ""));
}

function chiefConsultationGuidance(input) {
  const text = String(input || "").trim();
  if (!text) return "";
  if (/(?:获客专家|持续).{0,20}(?:获客|评论|直播|互动|账号)|(?:账号|评论|直播|互动).{0,20}(?:持续|自动).{0,12}(?:获客|找客户|找潜客)/u.test(text)) {
    return "持续处理已授权账号的新评论、直播和互动信号，请使用获客专家。它需要先完成账号授权、业务资料和接待策略配置，随后按已确认策略运行。";
  }
  if (/(?:私信客服|自动回复|接待).{0,20}(?:私信|咨询)?|(?:私信|咨询).{0,20}(?:承接|接待|自动回复)/u.test(text)) {
    return "承接新私信请使用私信客服。先选择并授权账号，再配置业务资料、回复规则和人工交接边界。";
  }
  if (/(?:潜客激活专员|首次触达|待触达)|(?:联系|触达|发(?:送)?私信).{0,20}(?:潜客|客户|用户|名单|这些)?/u.test(text)) {
    return "联系已确认潜客请使用潜客激活专员。它只处理待触达名单；发送前需要确认发送账号、对象和内容。";
  }
  if (/(?:客户分析员|分析).{0,20}(?:候选|客户|潜客|意向|名单)|(?:候选|客户|潜客|意向|名单).{0,20}(?:分析|判断|优先级)/u.test(text)) {
    return "判断候选客户意向请使用客户分析员。它需要已有候选名单和来源证据，输出意向等级、理由和下一步建议，不会重新找人或发送消息。";
  }
  if (/(?:找客专员|找人|找客户|找潜客|搜索|筛选).{0,20}(?:人|客户|潜客|账号|评论|互动)?/u.test(text)) {
    return "寻找候选客户请使用找客专员。它负责公开找人或监听已授权账号的新互动，保留候选和原始证据，但不会发送私信。";
  }
  return "";
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

function readAllTaskEvents(persistence, taskId, currentSeq) {
  const events = [];
  let afterSeq = 0;
  const expected = Math.max(0, Number(currentSeq) || 0);
  while (afterSeq < expected) {
    const page = persistence.listEvents(taskId, { afterSeq, limit: 1000 });
    if (!page.length) break;
    events.push(...page);
    afterSeq = page.at(-1).seq;
  }
  return events;
}

function redactArtifactFromEvent(event, artifactId) {
  const next = clone(event);
  if (next?.type !== "artifact.created" || !next.payload || typeof next.payload !== "object") return next;
  const recorded = next.payload.artifact;
  if ((recorded?.id || recorded?.name) !== artifactId) return next;
  const resultSnapshot = next.payload.resultSnapshot && typeof next.payload.resultSnapshot === "object"
    ? { ...next.payload.resultSnapshot }
    : null;
  if (Array.isArray(resultSnapshot?.artifacts)) {
    resultSnapshot.artifacts = resultSnapshot.artifacts.filter((artifact) => (artifact?.id || artifact?.name) !== artifactId);
  }
  next.payload = {
    ...next.payload,
    artifact: { id: artifactId, redacted: true },
    ...(resultSnapshot ? { resultSnapshot } : {}),
    text: "任务产出文件已删除"
  };
  return next;
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
