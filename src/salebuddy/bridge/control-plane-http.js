/**
 * Browser transport for the server-authoritative task control plane.
 *
 * The existing WebSocket gateway owns office/project capabilities. This
 * adapter owns durable task commands and event replay so a task can continue
 * after a page refresh without making the UI the source of truth.
 */

const DEFAULT_BASE_URL = "http://127.0.0.1:6681";
const DEFAULT_TIMEOUT_MS = 8000;
const CONNECT_TIMEOUT_MS = 1200;
// Requirement understanding may retry the provider call; keep the client
// deadline above the maximum synchronous server-side proposal window.
const TASK_COMMAND_TIMEOUT_MS = 135000;
const DEFAULT_POLL_INTERVAL_MS = 450;

const COMMAND_ENVELOPE_FIELDS = new Set([
  "type", "commandType", "commandId", "idempotencyKey", "taskId", "taskRunId", "runId",
  "conversationId", "agentId", "expectedVersion", "causationId", "correlationId",
  "actor", "createdAt", "metadata", "schemaVersion", "payload"
]);

const CONTROL_PLANE_ACTIONS = new Set([
  "task.create", "task.run.start", "task.requirement.request", "task.requirement.edit",
  "task.requirement.confirm", "access.authorization.start", "access.authorization.cancel",
  "access.scope.confirm", "approval.action.request", "approval.action.respond",
  "task.pause", "task.resume", "task.retry", "task.handoff", "task.handoff.resolve",
  "task.cancel", "task.complete", "task.fail", "task.block", "task.followup.send",
  "conversation.reply.request", "conversation.create", "message.send",
  "task.run.snapshot", "task.run.subscribe"
]);

export function isControlPlaneAction(action) {
  return CONTROL_PLANE_ACTIONS.has(action);
}

export class ControlPlaneHttpError extends Error {
  constructor(message, { code = "CONTROL_PLANE_HTTP_ERROR", status = 0, details = null } = {}) {
    super(message);
    this.name = "ControlPlaneHttpError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export class ControlPlaneHttpClient {
  constructor({
    baseUrl = DEFAULT_BASE_URL,
    fetchImpl = globalThis.fetch,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    apiKey = null,
    apiKeyHeader = "authorization"
  } = {}) {
    if (typeof fetchImpl !== "function") throw new TypeError("Control plane client requires fetch");
    this.baseUrl = String(baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");
    this.fetchImpl = fetchImpl;
    this.pollIntervalMs = Math.max(100, Number(pollIntervalMs) || DEFAULT_POLL_INTERVAL_MS);
    this.timeoutMs = Math.max(500, Number(timeoutMs) || DEFAULT_TIMEOUT_MS);
    this.apiKey = String(apiKey || "").trim() || null;
    this.apiKeyHeader = String(apiKeyHeader || "authorization").toLowerCase();
    this.connected = false;
    this.executionReady = false;
    this.executionSource = null;
    this.cloudDesktopMode = null;
    this.listeners = new Map();
    this.subscriptions = new Map();
  }

  async connect() {
    const response = await this.request("/healthz", { method: "GET" }, { timeoutMs: CONNECT_TIMEOUT_MS });
    if (response?.ok !== true) {
      throw new ControlPlaneHttpError("控制面健康检查未通过", { code: "CONTROL_PLANE_NOT_READY" });
    }
    this.connected = true;
    this.executionReady = response?.executionReady === true;
    this.executionSource = response?.executionSource || null;
    this.cloudDesktopMode = response?.cloudDesktopMode || null;
    return response;
  }

  disconnect() {
    for (const taskId of this.subscriptions.keys()) this.unsubscribeTask(taskId);
    this.connected = false;
    this.executionReady = false;
    this.executionSource = null;
    this.cloudDesktopMode = null;
  }

  async action(actionName, payload = {}, options = {}) {
    if (!isControlPlaneAction(actionName)) {
      throw new ControlPlaneHttpError(`控制面不支持 action: ${actionName}`, { code: "UNSUPPORTED_CONTROL_PLANE_ACTION" });
    }
    const command = commandBody(actionName, payload);
    if (actionName === "task.run.snapshot") return this.snapshot(command.taskId);
    if (actionName === "task.run.subscribe") {
      this.subscribeTask(command.taskId);
      return { accepted: true, taskId: command.taskId, currentSeq: this.subscriptions.get(command.taskId)?.cursor || 0 };
    }
    const path = actionName === "task.create" ? "/v1/tasks" : "/v1/commands";
    return this.request(path, {
      method: "POST",
      body: JSON.stringify(command)
    }, { timeoutMs: options.timeoutMs || TASK_COMMAND_TIMEOUT_MS, ...options });
  }

  async run(payload = {}, options = {}) {
    const taskId = payload.taskId || payload.task_id;
    if (!taskId) throw new ControlPlaneHttpError("task.run.start requires taskId", { code: "TASK_ID_REQUIRED" });
    const snapshot = await this.snapshot(taskId);
    const state = snapshot?.state || snapshot?.data?.state;
    // A persisted task may look runnable after a page refresh while the
    // account session has expired. Re-check the account workspace before any
    // native Agent Gateway execution is allowed to start.
    if (snapshot?.browserSessionId) {
      await this.browserSessionAuthorize(snapshot.browserSessionId, options);
    }
    let ack;
    if (["RUNNING", "WAITING_ACCESS", "WAITING_APPROVAL", "PAUSED", "WAITING_REPLY", "HANDOFF_REQUIRED"].includes(state)) {
      ack = identityAck(snapshot);
    } else {
      ack = await this.action("task.run.start", {
        ...payload,
        taskId,
        taskRunId: payload.taskRunId || payload.task_run_id,
        conversationId: payload.conversationId || payload.conversation_id,
        payload: {
          goal: payload.goal || payload.input || payload.title || "",
          planVersion: payload.planVersion || 1,
          // A fresh server task must only be primed into the requirement gate.
          // Execution starts after the persisted proposal confirmation (and
          // any access grant) has produced a RUNNING snapshot.
          requirementsConfirmed: payload.requirementsConfirmed === true,
          requiresAccess: payload.requiresAccess === true,
          projectId: payload.projectId || payload.project_id || null,
          projectName: payload.projectName || payload.project_name || null,
          scenario: payload.scenario || null
        }
      }, options);
    }
    this.subscribeTask(taskId);
    return {
      ...ack,
      ok: ack?.accepted !== false,
      run_id: ack?.taskRunId || ack?.task_run_id || ack?.runId || ack?.run_id || snapshot?.taskRunId,
      conversation_id: ack?.conversationId || ack?.conversation_id || snapshot?.conversationId,
      taskRunId: ack?.taskRunId || snapshot?.taskRunId,
      conversationId: ack?.conversationId || snapshot?.conversationId
    };
  }

  async cancel(payload = {}, options = {}) {
    return this.action("task.cancel", payload, options);
  }

  async browserSessionStart(payload = {}, options = {}) {
    return this.request("/v1/browser-sessions", {
      method: "POST",
      body: JSON.stringify(payload)
    }, { timeoutMs: TASK_COMMAND_TIMEOUT_MS, ...options });
  }

  async browserSessionStatus(sessionId, options = {}) {
    if (!sessionId) throw new ControlPlaneHttpError("浏览器会话需要 sessionId", { code: "SESSION_ID_REQUIRED" });
    return this.request(`/v1/browser-sessions/${encodeURIComponent(sessionId)}`, { method: "GET" }, options);
  }

  async browserSessionAuthorize(sessionId, options = {}) {
    if (!sessionId) throw new ControlPlaneHttpError("浏览器会话需要 sessionId", { code: "SESSION_ID_REQUIRED" });
    return this.request(`/v1/browser-sessions/${encodeURIComponent(sessionId)}/authorize`, { method: "POST", body: "{}" }, options);
  }

  async browserSessionNavigate(sessionId, url, options = {}) {
    if (!sessionId) throw new ControlPlaneHttpError("浏览器会话需要 sessionId", { code: "SESSION_ID_REQUIRED" });
    return this.request(`/v1/browser-sessions/${encodeURIComponent(sessionId)}/navigate`, { method: "POST", body: JSON.stringify({ url }) }, options);
  }

  async browserSessionClose(sessionId, options = {}) {
    if (!sessionId) throw new ControlPlaneHttpError("浏览器会话需要 sessionId", { code: "SESSION_ID_REQUIRED" });
    return this.request(`/v1/browser-sessions/${encodeURIComponent(sessionId)}/close`, { method: "POST", body: "{}" }, options);
  }

  async snapshot(taskId) {
    if (!taskId) throw new ControlPlaneHttpError("任务快照需要 taskId", { code: "TASK_ID_REQUIRED" });
    return this.request(`/v1/tasks/${encodeURIComponent(taskId)}`, { method: "GET" });
  }

  async events(taskId, { afterSeq = 0, limit = 100 } = {}) {
    if (!taskId) throw new ControlPlaneHttpError("任务事件需要 taskId", { code: "TASK_ID_REQUIRED" });
    const query = new URLSearchParams({ afterSeq: String(Math.max(0, Number(afterSeq) || 0)), limit: String(Math.max(1, Number(limit) || 100)) });
    return this.request(`/v1/tasks/${encodeURIComponent(taskId)}/events?${query}`, { method: "GET" });
  }

  on(eventName, listener) {
    if (typeof listener !== "function") throw new TypeError("event listener must be a function");
    const listeners = this.listeners.get(eventName) || new Set();
    listeners.add(listener);
    this.listeners.set(eventName, listeners);
    return () => {
      listeners.delete(listener);
      if (!listeners.size) this.listeners.delete(eventName);
    };
  }

  subscribeTask(taskId) {
    if (!taskId) return () => {};
    const existing = this.subscriptions.get(taskId);
    if (existing) return () => this.unsubscribeTask(taskId);
    const subscription = { cursor: 0, timer: null, running: true, polling: false };
    this.subscriptions.set(taskId, subscription);
    const poll = async () => {
      if (!subscription.running || subscription.polling) return;
      subscription.polling = true;
      try {
        const result = await this.events(taskId, { afterSeq: subscription.cursor });
        for (const event of result?.events || []) {
          subscription.cursor = Math.max(subscription.cursor, Number(event.seq) || 0);
          this.emit("task.event", event);
          const agUi = toAgUiEvent(event);
          if (agUi) this.emit("ag_ui_event", agUi);
        }
      } catch (error) {
        this.emit("task.connection", { taskId, state: "reconnecting", error });
      } finally {
        subscription.polling = false;
        if (subscription.running) subscription.timer = setTimeout(poll, this.pollIntervalMs);
      }
    };
    poll();
    return () => this.unsubscribeTask(taskId);
  }

  unsubscribeTask(taskId) {
    const subscription = this.subscriptions.get(taskId);
    if (!subscription) return;
    subscription.running = false;
    if (subscription.timer) clearTimeout(subscription.timer);
    this.subscriptions.delete(taskId);
  }

  emit(eventName, payload) {
    this.listeners.get(eventName)?.forEach((listener) => {
      try { listener(payload); } catch (error) { setTimeout(() => { throw error; }, 0); }
    });
  }

  async request(path, { method = "GET", body, headers = {}, signal } = {}, { timeoutMs = this.timeoutMs } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...(this.apiKey
            ? { [this.apiKeyHeader]: this.apiKeyHeader === "authorization" ? `Bearer ${this.apiKey}` : this.apiKey }
            : {}),
          ...headers
        },
        body,
        signal: signal || controller.signal
      });
      const raw = await response.text();
      let data = null;
      try { data = raw ? JSON.parse(raw) : null; } catch { data = { raw }; }
      if (!response.ok) {
        const error = data?.error || {};
        throw new ControlPlaneHttpError(error.message || `控制面请求失败 (${response.status})`, {
          code: error.code || `HTTP_${response.status}`,
          status: response.status,
          details: error.details || data
        });
      }
      this.connected = true;
      return data;
    } catch (error) {
      if (error instanceof ControlPlaneHttpError) throw error;
      const message = error?.name === "AbortError" ? "控制面请求超时" : (error?.message || "控制面连接失败");
      throw new ControlPlaneHttpError(message, { code: error?.name === "AbortError" ? "CONTROL_PLANE_TIMEOUT" : "CONTROL_PLANE_UNAVAILABLE", details: error });
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Combine the existing office WebSocket with the durable task transport. */
export function createHybridGateway({ nativeGateway = null, controlPlane = null } = {}) {
  if (!nativeGateway && !controlPlane) return null;
  const taskActions = controlPlane ? CONTROL_PLANE_ACTIONS : new Set();
  const hybrid = {
    nativeGateway,
    controlPlane,
    controlPlaneReady: Boolean(controlPlane?.connected),
    executionReady: Boolean(controlPlane?.executionReady || nativeGateway?.run),
    executionSource: controlPlane?.executionSource || (nativeGateway?.run ? "agent-gateway" : null),
    cloudDesktopMode: controlPlane?.cloudDesktopMode || null,
    async connect() {
      await Promise.all([
        nativeGateway?.connect?.() || Promise.resolve(),
        controlPlane?.connect?.() || Promise.resolve()
      ]);
      hybrid.controlPlaneReady = Boolean(controlPlane?.connected);
      hybrid.executionReady = Boolean(controlPlane?.executionReady || nativeGateway?.run);
      hybrid.executionSource = controlPlane?.executionSource || (nativeGateway?.run ? "agent-gateway" : null);
      hybrid.cloudDesktopMode = controlPlane?.cloudDesktopMode || null;
      return hybrid;
    },
    action(actionName, payload = {}, options = {}) {
      if (taskActions.has(actionName)) return controlPlane.action(actionName, payload, options);
      if (!nativeGateway?.action) return Promise.reject(new Error(`没有可用的 Gateway action: ${actionName}`));
      return nativeGateway.action(actionName, payload, options);
    },
    run(payload = {}, options = {}) {
      if (!controlPlane) return nativeGateway?.run?.(payload, options);
      if (!nativeGateway?.run) {
        if (controlPlane.executionReady === true) {
          return controlPlane.run(payload, options).then((ack) => ({
            ...ack,
            executionSource: controlPlane.executionSource || "control-plane"
          }));
        }
        const error = new Error("没有配置真实执行器，任务不会被标记为已执行");
        error.code = "AGENT_GATEWAY_UNAVAILABLE";
        return Promise.reject(error);
      }
      return controlPlane.run(payload, options).then(async (durableAck) => {
        // A durable acknowledgement can represent a gate, not an executable
        // run. Never open the native Agent Gateway until the control plane has
        // authoritatively moved the task into RUNNING.
        if (durableAck?.state && durableAck.state !== "RUNNING") return durableAck;
        if (!nativeGateway?.run) return durableAck;
        // The control plane owns task identity/state; the Agent Gateway owns
        // actual LangGraph execution and AG-UI streaming.
        const agentAck = await nativeGateway.run({
          ...payload,
          taskId: durableAck.taskId || payload.taskId,
          taskRunId: durableAck.taskRunId || payload.taskRunId || payload.task_run_id,
          task_run_id: durableAck.taskRunId || payload.taskRunId || payload.task_run_id,
          conversationId: durableAck.conversationId || payload.conversationId || payload.conversation_id,
          conversation_id: durableAck.conversationId || payload.conversationId || payload.conversation_id
        }, options);
        return { ...durableAck, ...agentAck, durable: durableAck, agent: agentAck };
      });
    },
    cancel(payload = {}, options = {}) {
      if (controlPlane && (payload.taskId || payload.task_id)) return controlPlane.cancel(payload, options);
      return nativeGateway?.cancel?.(payload, options);
    },
    browserSessionStart(payload = {}, options = {}) {
      if (!controlPlane?.browserSessionStart) return Promise.reject(new Error("没有可用的浏览器工作区"));
      return controlPlane.browserSessionStart(payload, options);
    },
    browserSessionStatus(sessionId, options = {}) {
      if (!controlPlane?.browserSessionStatus) return Promise.reject(new Error("没有可用的浏览器工作区"));
      return controlPlane.browserSessionStatus(sessionId, options);
    },
    browserSessionAuthorize(sessionId, options = {}) {
      if (!controlPlane?.browserSessionAuthorize) return Promise.reject(new Error("没有可用的浏览器工作区"));
      return controlPlane.browserSessionAuthorize(sessionId, options);
    },
    browserSessionNavigate(sessionId, url, options = {}) {
      if (!controlPlane?.browserSessionNavigate) return Promise.reject(new Error("没有可用的浏览器工作区"));
      return controlPlane.browserSessionNavigate(sessionId, url, options);
    },
    browserSessionClose(sessionId, options = {}) {
      if (!controlPlane?.browserSessionClose) return Promise.reject(new Error("没有可用的浏览器工作区"));
      return controlPlane.browserSessionClose(sessionId, options);
    },
    subscribeTask(taskId) {
      return controlPlane?.subscribeTask?.(taskId) || (() => {});
    },
    unsubscribeTask(taskId) {
      return controlPlane?.unsubscribeTask?.(taskId) || (() => {});
    },
    on(eventName, listener) {
      const unsubs = [];
      if (nativeGateway?.on) unsubs.push(nativeGateway.on(eventName, listener));
      if (controlPlane?.on) {
        unsubs.push(controlPlane.on(eventName, (payload) => {
          // Native AG-UI is authoritative for lifecycle messages whenever an
          // Agent Gateway is present. Keep control-plane approval/recovery
          // events, but do not render a second RUN_STARTED/RUN_FINISHED.
          if (eventName === "ag_ui_event" && nativeGateway && ["RUN_STARTED", "RUN_FINISHED", "RUN_ERROR"].includes(payload?.type)) return;
          listener(payload);
        }));
      }
      return () => unsubs.forEach((unsubscribe) => unsubscribe?.());
    }
  };
  return hybrid;
}

function commandBody(actionName, input = {}) {
  const source = isRecord(input) ? input : {};
  const payload = isRecord(source.payload)
    ? source.payload
    : Object.fromEntries(Object.entries(source).filter(([key]) => !COMMAND_ENVELOPE_FIELDS.has(key)));
  const body = { ...source, type: actionName, payload };
  delete body.commandType;
  delete body.runId;
  return body;
}

function identityAck(snapshot) {
  return {
    accepted: true,
    taskId: snapshot.taskId,
    taskRunId: snapshot.taskRunId,
    conversationId: snapshot.conversationId,
    currentVersion: snapshot.version,
    currentSeq: snapshot.currentSeq,
    data: { ...snapshot }
  };
}

export function toAgUiEvent(event) {
  if (!event || typeof event !== "object") return null;
  const payload = isRecord(event.payload) ? event.payload : {};
  const base = {
    task_id: event.taskId,
    run_id: event.taskRunId,
    conversation_id: event.conversationId,
    seq: event.seq,
    event_id: event.eventId,
    occurred_at: event.occurredAt,
    ...payload
  };
  // Execution facts arrive from the ClueHunter callback through the durable
  // control plane. Keep their business payload at the top level so the
  // existing AG-UI adapter can render the same cards as native gateway runs.
  const executionPayload = {
    ...base,
    ...(isRecord(payload.data) ? payload.data : {}),
    ...(payload.resultSnapshot || payload.result_snapshot ? {
      resultSnapshot: payload.resultSnapshot || payload.result_snapshot
    } : {}),
    ...(Array.isArray(payload.artifacts) ? { artifacts: payload.artifacts } : {})
  };
  switch (event.type) {
    case "task.run.started": return { ...base, type: "RUN_STARTED" };
    case "task.requirement.confirmed": return { ...base, type: "REQUIREMENT_CONFIRMED" };
    case "task.assignment.proposed": return { ...base, type: "ASSIGNMENT_PROPOSED", assignments: payload.assignments || [] };
    case "access.authorization.requested": return { ...base, type: "ACCESS_REQUIRED", ...payload };
    case "access.authorization.granted":
      // Keep one AG-UI vocabulary for the browser and the durable control
      // plane. The task runner's adapter handles ACCESS_GRANTED with a
      // `stage=scope` payload, while SCOPE_CONFIRMED is a native-only alias.
      // Mapping both forms to ACCESS_GRANTED prevents the online task from
      // getting stuck at the scope gate after the user has confirmed it.
      return { ...base, type: "ACCESS_GRANTED", ...payload };
    case "access.scope.confirmed":
      return { ...base, type: "ACCESS_GRANTED", stage: "scope", ...payload };
    case "access.authorization.cancelled": return { ...base, type: "ACCESS_CANCELLED", ...payload };
    case "task.completed":
      // Result facts are emitted on the terminal event by the connector. Keep
      // them at the top level so the AG-UI adapter can build the same result
      // projection as incremental lead/outreach events.
      return {
        ...executionPayload,
        type: "RUN_FINISHED",
        ...(payload.text || payload.message ? { text: payload.text || payload.message } : {})
      };
    case "task.failed": return { ...base, type: "RUN_ERROR", error: payload.error || { message: payload.text || "任务执行失败" } };
    case "task.paused": return { ...base, type: "TASK_PAUSED" };
    case "task.resumed": return { ...base, type: "TASK_RESUMED" };
    case "task.retrying": return { ...base, type: "RETRY_STARTED" };
    case "approval.requested": return { ...base, type: "APPROVAL_REQUESTED", approval: payload.approval || payload };
    case "approval.resolved": return { ...base, type: "APPROVAL_RESOLVED", approved: payload.decision === "approved", ok: payload.decision === "approved" };
    case "task.requirement.proposed": {
      const proposal = payload.proposal || payload.requirement || null;
      return proposal ? { ...base, type: "REQUIREMENT_PROPOSED", proposal } : null;
    }
    case "task.requirement.failed":
      return { ...base, type: "RUN_ERROR", error: payload.error || { code: payload.errorCode || "REQUIREMENT_FAILED", message: payload.text || "需求理解失败" } };
    case "task.execution.accepted":
      return { ...executionPayload, type: "TASK_EXECUTION_ACCEPTED" };
    case "account.resolved":
      return {
        ...executionPayload,
        type: "ACCOUNT_RESOLVED",
        agentId: event.agentId || payload.agentId || "acquisition_strategist",
        skillId: event.skillId || payload.skillId || "account_resolution",
        account: payload.account || null
      };
    case "agent.stage.started":
      return {
        ...executionPayload,
        type: "AGENT_STAGE_STARTED",
        agentId: event.agentId || payload.agentId || payload.agent_id || null,
        skillId: event.skillId || payload.skillId || payload.skill_id || null,
        stage: payload.stage || payload.agentId || event.agentId || null
      };
    case "agent.stage.completed":
      return {
        ...executionPayload,
        type: "AGENT_STAGE_COMPLETED",
        agentId: event.agentId || payload.agentId || payload.agent_id || null,
        skillId: event.skillId || payload.skillId || payload.skill_id || null,
        stage: payload.stage || payload.agentId || event.agentId || null
      };
    case "prospect.discovery.completed":
      return {
        ...executionPayload,
        type: "AGENT_STAGE_COMPLETED",
        agentId: event.agentId || payload.agentId || "lead_miner",
        skillId: event.skillId || payload.skillId || "public_prospect_discovery",
        stage: payload.stage || "lead_miner"
      };
    case "task.execution.failed":
    case "task.integration.failed":
      return {
        ...executionPayload,
        type: "RUN_ERROR",
        error: payload.error || {
          code: payload.errorCode || payload.error_code || "EXECUTION_FAILED",
          message: payload.text || payload.reason || "真实执行失败"
        }
      };
    case "lead.source.synced": return { ...executionPayload, type: "LEAD_SOURCE_SYNCED" };
    case "lead.candidate": return { ...executionPayload, type: "LEAD_CANDIDATE" };
    case "lead.qualified": return { ...executionPayload, type: "LEAD_QUALIFIED" };
    case "lead.rejected": return { ...executionPayload, type: "LEAD_REJECTED" };
    case "lead.replied": return { ...executionPayload, type: "LEAD_REPLIED" };
    case "lead.do_not_contact": return { ...executionPayload, type: "LEAD_DO_NOT_CONTACT" };
    case "outreach.ready": return { ...executionPayload, type: "OUTREACH_READY" };
    case "outreach.scheduled": return { ...executionPayload, type: "OUTREACH_SCHEDULED" };
    case "outreach.sending": return { ...executionPayload, type: "OUTREACH_SENDING" };
    case "outreach.sent": return { ...executionPayload, type: "OUTREACH_SENT" };
    case "outreach.failed": return { ...executionPayload, type: "OUTREACH_FAILED" };
    case "delivery.checking": return { ...executionPayload, type: "DELIVERY_CHECKING" };
    case "artifact.created": return { ...executionPayload, type: "ARTIFACT_CREATED", artifact: payload.artifact || payload.file || payload };
    case "task.result.updated":
    case "result.snapshot.updated":
      return { ...executionPayload, type: "RESULT_UPDATED" };
    case "conversation.message.sent":
      if (payload.from === "user" || payload.role === "user") return null;
      return { ...base, type: "TEXT_MESSAGE_CONTENT", delta: String(payload.text || payload.content || "") };
    default:
      return null;
  }
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
