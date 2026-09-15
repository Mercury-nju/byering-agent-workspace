import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createControlPlane } from "../backend/control-plane.js";
import { createControlPlaneHttpServer, createDouyinAgentServiceOptionsByAgent, startControlPlaneServer } from "../backend/http-server.js";

function context(overrides = {}) {
  return {
    agentId: "mkt-comment-acquisition",
    taskId: "task-http-1",
    taskRunId: "run-http-1",
    conversationId: "conversation-http-1",
    accountId: "account-http-1",
    ...overrides
  };
}

function fakeAcquisition() {
  const calls = [];
  const task = {
    key: "mkt-comment-acquisition::task-http-1::account-http-1",
    context: context(),
    config: { apiKey: "do-not-leak" },
    state: "running",
    eventSeq: 1,
    health: "OK",
    approvalQueue: [{ touchId: "touch-1", state: "pending_approval" }],
    events: [{ eventId: "event-1", type: "touch_drafted", agentId: context().agentId, taskId: context().taskId, taskRunId: context().taskRunId, conversationId: context().conversationId, accountId: context().accountId, payload: { apiKey: "should-not-leak" } }]
  };
  return {
    calls,
    stateFile: "/tmp/acquisition-http-test.json",
    createTask(input, config) { calls.push(["createTask", input, config]); return { ...task, context: input }; },
    preview(key) { calls.push(["preview", key]); return { ok: true, preview: true, task }; },
    start(key, options) { calls.push(["start", key, options]); return { ...task, state: "running" }; },
    resume(key, options) { calls.push(["resume", key, options]); return { ...task, state: "running" }; },
    pause(key) { calls.push(["pause", key]); return { ...task, state: "paused", health: "OK" }; },
    stop(key) { calls.push(["stop", key]); return { ...task, state: "stopped", health: "OK" }; },
    retry(key, touchId) { calls.push(["retry", key, touchId]); return { ...task, state: "running" }; },
    approveTouch(key, touchId) { calls.push(["approveTouch", key, touchId]); return { ...task, approvalQueue: [{ touchId, state: "approved" }] }; },
    approveBatch(key, options) { calls.push(["approveBatch", key, options]); return { ok: true, task }; },
    updateTaskConfig(key, payload) { calls.push(["updateTaskConfig", key, payload]); return { ...task, configurationVersion: payload.configVersion, configVersion: payload.configVersion, configuration: { version: payload.configVersion, ...payload.changes } }; },
    listTasks() { return [task]; },
    status() { return task; }
  };
}

async function fixture(t, options = {}) {
  const acquisition = options.acquisition || fakeAcquisition();
  const serverOptions = {
    port: 0,
    host: "127.0.0.1",
    auth: options.auth ?? false,
    douyinAcquisitionService: acquisition,
    douyinAgentCloudRegistry: options.douyinAgentCloudRegistry || { configured: false },
    douyinMcpService: options.douyinMcpService || { configured: false },
    douyinInboxAgentService: options.douyinInboxAgentService || { configured: false },
    clueHunterService: { configured: false },
    cloudDesktopService: { configured: false },
    prospectService: { configured: false },
    prospectExecutor: { configured: false },
    browserWorkspace: {},
    localBrowserExecutor: { configured: false },
    taskDispatcher: {},
    coreAgentExecutionService: options.coreAgentExecutionService || null,
    employmentStore: options.employmentStore || null,
    allowLegacyProductExecution: options.allowLegacyProductExecution ?? true
  };
  const server = options.controlPlane
    ? createControlPlaneHttpServer({ ...serverOptions, controlPlane: options.controlPlane })
    : await startControlPlaneServer(serverOptions);
  if (options.controlPlane) await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  const base = `http://${address.address}:${address.port}`;
  return { acquisition, server, request: (path, init = {}) => fetch(`${base}${path}`, { ...init, headers: { "content-type": "application/json", ...(init.headers || {}) } }) };
}

test("cloud status route reconciles the Agent registry instead of bypassing it", async (t) => {
  const calls = [];
  const registry = {
    configured: true,
    getService() {
      return {
        configured: true,
        async probeRemoteStatus() {
          calls.push("probeRemoteStatus");
          return { ok: true, state: "CONNECTING", display_state: "connecting" };
        }
      };
    },
    async status(agentId) {
      calls.push(["registry.status", agentId]);
      return { ok: true, state: "STARTING", display_state: "starting", agentId, sessionId: "saved-session" };
    }
  };
  const { request } = await fixture(t, { douyinAgentCloudRegistry: registry });
  const response = await request("/v1/douyin/mcp/status?agentId=mkt-dm-inbox");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.display_state, "starting");
  assert.deepEqual(calls, [["registry.status", "mkt-douyin-account-runtime"]]);
});

test("acquisition routes authenticate, validate context, and dispatch lifecycle actions", async (t) => {
  const { acquisition, request } = await fixture(t);
  const missing = await request("/v1/douyin/acquisition/tasks", { method: "POST", body: JSON.stringify({ agentId: "mkt-comment-acquisition" }) });
  assert.equal(missing.status, 400);
  const created = await request("/v1/douyin/acquisition/tasks", { method: "POST", body: JSON.stringify({ ...context(), config: { approvalMode: "manual" } }) });
  assert.equal(created.status, 201);
  const createdBody = await created.json();
  assert.equal(createdBody.context.taskId, context().taskId);
  assert.equal(createdBody.context.apiKey, undefined);
  assert.equal(createdBody.config.apiKey, "[REDACTED]");
  assert.equal(acquisition.calls[0][2].approvalMode, "auto");
  for (const action of ["preview", "start", "resume", "pause", "stop", "retry"]) {
    const response = await request(`/v1/douyin/acquisition/tasks/${encodeURIComponent(acquisition.calls[0][1].agentId + "::task-http-1::account-http-1")}/${action}`, { method: "POST", body: JSON.stringify({}) });
    assert.ok([200, 202].includes(response.status), action);
  }
  assert.deepEqual(acquisition.calls.slice(1, 7).map(([name]) => name), ["preview", "start", "resume", "pause", "stop", "retry"]);
});

test("product Agent execution routes reject direct starts when the core gateway is required", async (t) => {
  const { acquisition, request } = await fixture(t, { allowLegacyProductExecution: false });
  const created = await request("/v1/douyin/acquisition/tasks", {
    method: "POST",
    body: JSON.stringify(context())
  });
  assert.equal(created.status, 409);
  assert.equal((await created.json()).error.code, "CORE_AGENT_GATEWAY_REQUIRED");
  assert.equal(acquisition.calls.length, 0);

  const started = await request(`/v1/douyin/acquisition/tasks/${encodeURIComponent(acquisition.status().key)}/start`, {
    method: "POST",
    body: JSON.stringify({})
  });
  assert.equal(started.status, 409);
  assert.equal((await started.json()).error.code, "CORE_AGENT_GATEWAY_REQUIRED");
  assert.equal(acquisition.calls.length, 0);

  for (const operation of ["preview", "resume", "retry"]) {
    const response = await request(`/v1/douyin/acquisition/tasks/${encodeURIComponent(acquisition.status().key)}/${operation}`, {
      method: "POST",
      body: JSON.stringify({})
    });
    assert.equal(response.status, 409, operation);
    assert.equal((await response.json()).error.code, "CORE_AGENT_GATEWAY_REQUIRED", operation);
  }
  assert.equal(acquisition.calls.length, 0);
});

test("product inbox start and polling cannot bypass the core gateway", async (t) => {
  const { request } = await fixture(t, { allowLegacyProductExecution: false });
  for (const operation of ["start", "poll"]) {
    const response = await request(`/v1/douyin/inbox-agent/${operation}`, {
      method: "POST",
      body: JSON.stringify({ agentId: "mkt-dm-inbox" })
    });
    assert.equal(response.status, 409, operation);
    assert.equal((await response.json()).error.code, "CORE_AGENT_GATEWAY_REQUIRED", operation);
  }
});

test("finder live tasks authenticate against the account cloud while retaining finder ownership", async (t) => {
  const acquisition = fakeAcquisition();
  const cloudCalls = [];
  const registry = {
    configured: true,
    async status(agentId) {
      cloudCalls.push(agentId);
      return { ok: true, state: "ONLINE", login_state: "logged_in", account: { secId: "account-http-1" } };
    }
  };
  const { request } = await fixture(t, { acquisition, douyinAgentCloudRegistry: registry });
  const ownerContext = context({
    agentId: "mkt-find-people",
    executionAgentId: "mkt-comment-acquisition",
    taskId: "finder-live-http-task",
    taskRunId: "finder-live-http-run"
  });

  const response = await request("/v1/douyin/acquisition/tasks", {
    method: "POST",
    body: JSON.stringify({
      ...ownerContext,
      config: { sourceScope: { kind: "authorized_account_live" }, discoveryOnly: true }
    })
  });
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.deepEqual(cloudCalls, ["mkt-douyin-account-runtime"]);
  assert.equal(body.context.agentId, "mkt-find-people");
  assert.equal(body.context.executionAgentId, "mkt-comment-acquisition");
  assert.equal(acquisition.calls[0][1].agentId, "mkt-find-people");
  assert.equal(acquisition.calls[0][1].executionAgentId, "mkt-comment-acquisition");
  assert.equal(acquisition.calls[0][2].sourceScope.kind, "authorized_account_live");
});

test("acquisition start fails closed when the Douyin account is not logged in", async (t) => {
  const acquisition = fakeAcquisition();
  const registry = {
    configured: true,
    async status(agentId) {
      assert.equal(agentId, "mkt-douyin-account-runtime");
      return { ok: true, state: "ERROR", display_state: "error", login_state: "unknown", account: null };
    }
  };
  const { request } = await fixture(t, { acquisition, douyinAgentCloudRegistry: registry });
  const response = await request("/v1/douyin/acquisition/tasks", {
    method: "POST",
    body: JSON.stringify({ ...context(), config: { approvalMode: "manual" } })
  });
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.equal(body.accepted, false);
  assert.equal(body.error.code, "DOUYIN_LOGIN_REQUIRED");
  assert.equal(acquisition.calls.length, 0);

  const startResponse = await request(`/v1/douyin/acquisition/tasks/${encodeURIComponent(acquisition.status().key)}/start`, {
    method: "POST",
    body: JSON.stringify({})
  });
  const startBody = await startResponse.json();
  assert.equal(startResponse.status, 409);
  assert.equal(startBody.error.code, "DOUYIN_LOGIN_REQUIRED");
  assert.equal(acquisition.calls.length, 0);
});

test("core execution authenticates with the configured provider identity instead of a local Agent account key", async (t) => {
  const identity = { sec_uid: "sec-authorized-account", user_id: "58262205543", nickname: "一以万真" };
  const scopes = [];
  const leaseCalls = [];
  const registry = {
    configured: true,
    adopt(agentId, scope) {
      scopes.push(["adopt", agentId, scope]);
      return agentId;
    },
    getService(agentId, scope) {
      scopes.push(["service", agentId, scope]);
      return {
        configured: true,
        async status() {
          scopes.push(["status", agentId, scope]);
          return { ok: true, login_state: "logged_in", account: identity };
        }
      };
    }
  };
  const coreAgentExecutionService = {
    configured: true,
    async lease(input) {
      leaseCalls.push(input);
      return { accepted: true, status: "running", resultSnapshot: { key: "acquisition:provider-account" } };
    }
  };
  const employmentStore = {
    list() {
      return [{ agentId: "mkt-comment-acquisition", status: "active" }];
    }
  };
  const { request } = await fixture(t, {
    douyinAgentCloudRegistry: registry,
    coreAgentExecutionService,
    employmentStore
  });
  const response = await request("/v1/core-agent-executions", {
    method: "POST",
    body: JSON.stringify({
      ...context({ accountId: "douyin-agent:mkt-comment-acquisition" }),
      goal: "持续监听授权账号的新互动",
      config: { accountIdentity: identity, sourceScope: { accountIdentity: identity } }
    })
  });
  const body = await response.json();

  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(leaseCalls.length, 1);
  assert.equal(leaseCalls[0].accountIdentity.sec_uid, identity.sec_uid);
  assert.equal(leaseCalls[0].config.accountIdentity.sec_uid, identity.sec_uid);
  const statusScope = scopes.find(([kind]) => kind === "status")?.[2];
  assert.equal(statusScope.accountId, "douyin-agent:mkt-comment-acquisition");
  assert.equal(statusScope.accountIdentity.sec_uid, identity.sec_uid);
});

test("live danmaku analysis passes through the HTTP core execution gateway", async (t) => {
  const identity = { sec_uid: "sec-live-analysis-account", user_id: "58262205543", nickname: "一以万真" };
  const leaseCalls = [];
  const registry = {
    configured: true,
    adopt() {},
    getService() {
      return {
        configured: true,
        async status() {
          return { ok: true, login_state: "logged_in", account: identity };
        }
      };
    },
    async status() {
      return { ok: true, login_state: "logged_in", account: identity };
    }
  };
  const coreAgentExecutionService = {
    configured: true,
    async lease(input) {
      leaseCalls.push(input);
      return { accepted: true, status: "running" };
    }
  };
  const employmentStore = {
    list() {
      return [{ agentId: "mkt-live-danmaku-analysis", status: "active" }];
    }
  };
  const { request } = await fixture(t, {
    douyinAgentCloudRegistry: registry,
    coreAgentExecutionService,
    employmentStore
  });
  const response = await request("/v1/core-agent-executions", {
    method: "POST",
    body: JSON.stringify(context({
      agentId: "mkt-live-danmaku-analysis",
      taskId: "task-live-analysis-http-1",
      taskRunId: "run-live-analysis-http-1",
      conversationId: "conversation-live-analysis-http-1",
      accountId: "douyin-agent:mkt-live-danmaku-analysis",
      goal: "分析当前直播间弹幕和互动信号",
      config: {
        sourceScope: "authorized_account_live",
        analysisOnly: true,
        discoveryOnly: true,
        analysisKind: "live_danmaku",
        liveSignals: ["likes", "gifts"]
      }
    }))
  });
  const body = await response.json();

  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(leaseCalls.length, 1);
  assert.equal(leaseCalls[0].agentId, "mkt-live-danmaku-analysis");
  assert.equal(leaseCalls[0].accountIdentity.sec_uid, identity.sec_uid);
  assert.equal(leaseCalls[0].config.analysisKind, "live_danmaku");
});

test("core execution recovers the sole bound account when the UI sends only its local Agent account key", async (t) => {
  const identity = { sec_uid: "sec-bound-account", user_id: "58262205543", nickname: "一以万真" };
  const scopes = [];
  const leaseCalls = [];
  const registry = {
    configured: true,
    list() {
      return [{
        agentId: "mkt-douyin-account-runtime",
        tenantId: null,
        accountId: "douyin-agent:mkt-dm-inbox",
        accountIdentity: identity,
        sessionId: "sess-bound-account",
        status: "online"
      }];
    },
    adopt(agentId, scope) {
      scopes.push(["adopt", agentId, scope]);
      return agentId;
    },
    getService(agentId, scope) {
      scopes.push(["service", agentId, scope]);
      return {
        configured: true,
        async status() {
          scopes.push(["status", agentId, scope]);
          const bound = scope?.accountIdentity?.sec_uid === identity.sec_uid;
          return bound
            ? { ok: true, login_state: "logged_in", account: identity }
            : { ok: true, login_state: "logged_out", account: null };
        }
      };
    }
  };
  const coreAgentExecutionService = {
    configured: true,
    async lease(input) {
      leaseCalls.push(input);
      return { accepted: true, status: "running", resultSnapshot: { key: "acquisition:bound-account" } };
    }
  };
  const employmentStore = {
    list() {
      return [{ agentId: "mkt-comment-acquisition", status: "active" }];
    }
  };
  const { request } = await fixture(t, {
    douyinAgentCloudRegistry: registry,
    coreAgentExecutionService,
    employmentStore
  });
  const response = await request("/v1/core-agent-executions", {
    method: "POST",
    body: JSON.stringify({
      ...context({ accountId: "douyin-agent:mkt-comment-acquisition" }),
      goal: "持续监听授权账号的新互动",
      config: { sourceScope: { kind: "authorized_account_all_signals" } }
    })
  });
  const body = await response.json();

  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(leaseCalls.length, 1);
  assert.equal(leaseCalls[0].accountIdentity.sec_uid, identity.sec_uid);
  const statusScope = scopes.find(([kind]) => kind === "status")?.[2];
  assert.equal(statusScope.accountIdentity.sec_uid, identity.sec_uid);
});

test("core execution trusts the persisted cloud session when the scoped MCP instance reports a stale login state", async (t) => {
  const identity = { sec_uid: "sec-persisted-session", user_id: "58262205543", nickname: "一以万真" };
  const registryStatusCalls = [];
  const leaseCalls = [];
  const registry = {
    configured: true,
    list() {
      return [{
        agentId: "mkt-douyin-account-runtime",
        tenantId: null,
        accountId: "douyin-agent:mkt-comment-acquisition",
        accountIdentity: identity,
        sessionId: "sess-persisted-session",
        status: "online"
      }];
    },
    adopt(agentId) {
      return agentId;
    },
    getService() {
      return {
        configured: true,
        async status() {
          return { ok: true, login_state: "logged_out", account: null };
        }
      };
    },
    async status(agentId, scope) {
      registryStatusCalls.push([agentId, scope]);
      return { ok: true, login_state: "logged_in", account: identity, sessionId: "sess-persisted-session" };
    }
  };
  const coreAgentExecutionService = {
    configured: true,
    async lease(input) {
      leaseCalls.push(input);
      return { accepted: true, status: "running", resultSnapshot: { key: "acquisition:persisted-session" } };
    }
  };
  const employmentStore = {
    list() {
      return [{ agentId: "mkt-comment-acquisition", status: "active" }];
    }
  };
  const { request } = await fixture(t, {
    douyinAgentCloudRegistry: registry,
    coreAgentExecutionService,
    employmentStore
  });
  const response = await request("/v1/core-agent-executions", {
    method: "POST",
    body: JSON.stringify({
      ...context({ accountId: "douyin-agent:mkt-comment-acquisition" }),
      goal: "持续监听授权账号的新互动",
      config: { sourceScope: { kind: "authorized_account_all_signals" } }
    })
  });
  const body = await response.json();

  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(leaseCalls.length, 1);
  assert.ok(registryStatusCalls.length >= 1);
  assert.equal(registryStatusCalls.at(-1)[0], "mkt-douyin-account-runtime");
  assert.equal(registryStatusCalls.at(-1)[1].accountIdentity.sec_uid, identity.sec_uid);
});

test("cloud status resolves a local Agent account key to its sole bound cloud account", async (t) => {
  const identity = { sec_uid: "sec-status-bound-account", user_id: "58262205543", nickname: "一以万真" };
  const scopes = [];
  const registry = {
    configured: true,
    list() {
      return [{
        agentId: "mkt-douyin-account-runtime",
        tenantId: null,
        accountId: "douyin-agent:mkt-dm-inbox",
        accountIdentity: identity,
        sessionId: "sess-status-bound-account",
        status: "online"
      }];
    },
    adopt(agentId, scope) {
      scopes.push(["adopt", agentId, scope]);
      return agentId;
    },
    getService() {
      return { configured: true };
    },
    async status(agentId, scope) {
      scopes.push(["status", agentId, scope]);
      const bound = scope?.accountIdentity?.sec_uid === identity.sec_uid;
      return bound
        ? { ok: true, login_state: "logged_in", account: identity, sessionId: "sess-status-bound-account" }
        : { ok: true, login_state: "logged_out", account: null, sessionId: null };
    }
  };
  const { request } = await fixture(t, { douyinAgentCloudRegistry: registry });
  const response = await request("/v1/douyin/mcp/status?agentId=mkt-comment-acquisition&accountId=douyin-agent%3Amkt-comment-acquisition");
  const body = await response.json();

  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(body.login_state, "logged_in");
  const statusScope = scopes.find(([kind]) => kind === "status")?.[2];
  assert.equal(statusScope.accountIdentity.sec_uid, identity.sec_uid);
});

test("direct acquisition creation also uses account identity nested in its configuration", async (t) => {
  const identity = { sec_uid: "sec-configured-account", user_id: "58262205543" };
  const scopes = [];
  const registry = {
    configured: true,
    async status(agentId, scope) {
      scopes.push([agentId, scope]);
      return { ok: true, login_state: "logged_in", account: identity };
    }
  };
  const { request } = await fixture(t, { douyinAgentCloudRegistry: registry });
  const response = await request("/v1/douyin/acquisition/tasks", {
    method: "POST",
    body: JSON.stringify({
      ...context({ accountId: "douyin-agent:mkt-comment-acquisition" }),
      config: { accountIdentity: identity }
    })
  });

  assert.equal(response.status, 201);
  assert.equal(scopes.length, 1);
  assert.equal(scopes[0][1].accountId, "douyin-agent:mkt-comment-acquisition");
  assert.equal(scopes[0][1].accountIdentity.sec_uid, identity.sec_uid);
});

test("acquisition config route updates the real task strategy", async (t) => {
  const acquisition = fakeAcquisition();
  const { request } = await fixture(t, { acquisition });
  const key = encodeURIComponent(acquisition.status().key);
  const response = await request(`/v1/douyin/acquisition/tasks/${key}/config`, {
    method: "POST",
    body: JSON.stringify({
      baseConfigVersion: 1,
      configVersion: 2,
      expectedVersion: 1,
      effectiveScope: "future_only",
      changes: { touchContent: { message: "测试回复" } }
    })
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).configurationVersion, 2);
  assert.equal(acquisition.calls.at(-1)[0], "updateTaskConfig");
  assert.equal(acquisition.calls.at(-1)[2].changes.touchContent.message, "测试回复");
});

test("acquisition config route forwards envelope version and rejects nested mismatch", async (t) => {
  const acquisition = fakeAcquisition();
  const { request } = await fixture(t, { acquisition });
  const key = encodeURIComponent(acquisition.status().key);
  const response = await request(`/v1/douyin/acquisition/tasks/${key}/config`, {
    method: "POST",
    body: JSON.stringify({
      expectedVersion: 1,
      payload: {
        baseConfigVersion: 1,
        configVersion: 2,
        effectiveScope: "future_only",
        changes: { touchContent: { message: "包装格式测试" } }
      }
    })
  });
  assert.equal(response.status, 200);
  assert.equal(acquisition.calls.at(-1)[2].expectedVersion, 1);

  const mismatch = await request(`/v1/douyin/acquisition/tasks/${key}/config`, {
    method: "POST",
    body: JSON.stringify({
      expectedVersion: 1,
      payload: {
        expectedVersion: 0,
        baseConfigVersion: 1,
        configVersion: 2,
        effectiveScope: "future_only",
        changes: { touchContent: { message: "不应写入" } }
      }
    })
  });
  assert.equal(mismatch.status, 409);
  assert.equal((await mismatch.json()).error.code, "DOUYIN_ACQUISITION_TASK_VERSION_MISMATCH");
});

test("generic config commands route directly to the acquisition service", async (t) => {
  const acquisition = fakeAcquisition();
  const controlPlane = {
    persistence: { loadTask() { return { taskId: context().taskId, version: 7, currentSeq: 7, tenantId: null }; } },
    dispatch() { throw new Error("generic control-plane dispatch must not handle acquisition config"); }
  };
  const { request } = await fixture(t, { acquisition, controlPlane });
  const response = await request("/v1/commands", {
    method: "POST",
    body: JSON.stringify({
      action: "task.config.update",
      taskId: context().taskId,
      taskRunId: context().taskRunId,
      accountId: context().accountId,
      agentId: context().agentId,
      expectedVersion: 7,
      payload: {
        baseConfigVersion: 1,
        configVersion: 2,
        effectiveScope: "future_only",
        changes: { touchContent: { message: "通用命令测试" } }
      }
    })
  });
  assert.equal(response.status, 202);
  const body = await response.json();
  assert.equal(body.accepted, true);
  assert.equal(body.acquisitionTask.configurationVersion, 2);
  assert.equal(acquisition.calls.at(-1)[0], "updateTaskConfig");
  assert.equal(acquisition.calls.at(-1)[1], acquisition.status().key);
  assert.equal(acquisition.calls.at(-1)[2].expectedVersion, 7);
});

test("generic acquisition config uses the shared connector sequence and rejects replay", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-acquisition-generic-"));
  const prospectService = {
    configured: true,
    async discover() { return { accepted: true, status: "SUCCEEDED", resultSnapshot: { leads: [] }, events: [] }; }
  };
  const cloudRegistry = { configured: false, getService() { return { configured: false }; } };
  const server = await startControlPlaneServer({
    port: 0,
    host: "127.0.0.1",
    auth: false,
    prospectService,
    prospectExecutor: prospectService,
    accountResolver: { configured: false },
    douyinAgentCloudRegistry: cloudRegistry,
    clueHunterService: { configured: false },
    cloudDesktopService: { configured: false },
    douyinMcpService: { configured: false },
    browserWorkspace: {},
    taskDispatcher: {},
    localBrowserExecutor: { configured: false },
    persistenceDir: directory,
    douyinAcquisitionStateFile: join(directory, "acquisition.json"),
    douyinAcquisitionAutoResume: false
  });
  try {
    const contextValue = context({ taskId: "generic-e2e-task", taskRunId: "generic-e2e-run", conversationId: "generic-e2e-conversation", accountId: "generic-e2e-account" });
    const task = server.douyinAcquisitionService.createTask(contextValue, { approvalMode: "manual" });
    const controlPlaneTask = server.controlPlane.persistence.loadTask(contextValue.taskId);
    assert.equal(controlPlaneTask.currentSeq, task.eventSeq);
    const payload = {
      action: "task.config.update",
      agentId: contextValue.agentId,
      taskId: contextValue.taskId,
      taskRunId: contextValue.taskRunId,
      conversationId: contextValue.conversationId,
      accountId: contextValue.accountId,
      expectedVersion: controlPlaneTask.currentSeq,
      payload: {
        baseConfigVersion: 1,
        configVersion: 2,
        effectiveScope: "future_only",
        changes: { findingStrategy: { filters: { regions: ["上海"] } } }
      }
    };
    const first = await fetch(`http://127.0.0.1:${server.address().port}/v1/commands`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    assert.equal(first.status, 202);
    const replay = await fetch(`http://127.0.0.1:${server.address().port}/v1/commands`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    assert.equal(replay.status, 409);
    assert.equal((await replay.json()).error.code, "TASK_VERSION_STALE");
    assert.equal(server.douyinAcquisitionService.status(task.key).configurationVersion, 2);
  } finally {
    server.douyinAcquisitionService.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("public acquisition events cannot mutate configuration", async (t) => {
  const controlPlane = {
    ingestExecutionEvents() { throw new Error("configuration event must not reach the control plane"); }
  };
  const { request } = await fixture(t, { controlPlane });
  const response = await request("/v1/douyin/acquisition/events", {
    method: "POST",
    body: JSON.stringify({
      ...context(),
      type: "config_updated",
      eventId: "forged-config-event",
      payload: { effectiveScope: "future_only", configuration: { accountId: "forged" } }
    })
  });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, "DOUYIN_ACQUISITION_CONFIG_EVENT_INTERNAL_ONLY");
});

test("acquisition create route returns a structured conflict for duplicate active tasks", async (t) => {
  const acquisition = fakeAcquisition();
  acquisition.createTask = () => {
    throw Object.assign(new Error("同一抖音账号的同一 Agent 已存在相同获客任务"), {
      code: "DOUYIN_ACQUISITION_DUPLICATE_TASK",
      statusCode: 409,
      details: {
        existingTaskKey: "mkt-comment-acquisition::existing::account-http-1",
        existingState: "running"
      }
    });
  };
  const { request } = await fixture(t, { acquisition });
  const response = await request("/v1/douyin/acquisition/tasks", {
    method: "POST",
    body: JSON.stringify({ ...context({ taskId: "task-duplicate", taskRunId: "run-duplicate" }) })
  });
  const body = await response.json();
  assert.equal(response.status, 409);
  assert.equal(body.accepted, false);
  assert.equal(body.error.code, "DOUYIN_ACQUISITION_DUPLICATE_TASK");
  assert.equal(body.error.details.existingTaskKey, "mkt-comment-acquisition::existing::account-http-1");
});

test("acquisition routes reject unauthenticated control-plane access", async (t) => {
  const { request } = await fixture(t, { auth: { apiKeys: [{ key: "tenant-key", tenantId: "tenant-1" }] } });
  const response = await request("/v1/douyin/acquisition/tasks", { method: "POST", body: JSON.stringify({ ...context() }) });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, "CONTROL_PLANE_AUTH_REQUIRED");
});

test("acquisition status maps degraded health and keeps pending approval on the parent", async (t) => {
  const acquisition = fakeAcquisition();
  const taskKey = "mkt-comment-acquisition::task-http-1::account-http-1";
  acquisition.status = () => ({ ...fakeAcquisition().status(), key: taskKey, state: "degraded", health: "DEGRADED", approvalQueue: [{ touchId: "touch-1", state: "pending_approval" }] });
  const { request } = await fixture(t, { acquisition });
  const response = await request(`/v1/douyin/acquisition/tasks/${encodeURIComponent(taskKey)}`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.runtimeState, "RUNNING");
  assert.equal(body.health, "DEGRADED");
  assert.equal(body.state, "degraded");
  assert.equal(body.approvalQueue[0].state, "pending_approval");
  assert.notEqual(body.runtimeState, "WAITING_APPROVAL");
});

test("approval decisions use the acquisition service and outbound events are idempotent and correlated", async (t) => {
  const acquisition = fakeAcquisition();
  const { request } = await fixture(t, { acquisition });
  const key = encodeURIComponent(acquisition.calls[0]?.[1] || "mkt-comment-acquisition::task-http-1::account-http-1");
  const approval = await request(`/v1/douyin/acquisition/tasks/${key}/approval`, { method: "POST", body: JSON.stringify({ decision: "approve", touchId: "touch-1" }) });
  assert.equal(approval.status, 200);
  assert.equal(acquisition.calls.at(-1)[0], "approveTouch");
});

test("inbound acquisition events preserve context and deduplicate repeated event ids", async (t) => {
  const received = [];
  const controlPlane = {
    ingestExecutionEvents(input) { received.push(input); return { acceptedCount: 1, duplicateCount: 0, currentSeq: 1 }; }
  };
  const { request } = await fixture(t, { controlPlane });
  const event = { ...context(), type: "touch_receipt", eventId: "event-dedupe-1", payload: { apiKey: "secret" } };
  const first = await request("/v1/douyin/acquisition/events", { method: "POST", body: JSON.stringify(event) });
  const second = await request("/v1/douyin/acquisition/events", { method: "POST", body: JSON.stringify(event) });
  assert.equal(first.status, 202);
  assert.equal(second.status, 200);
  assert.equal((await second.json()).duplicate, true);
  assert.equal(received.length, 1);
  assert.equal(received[0].events[0].agentId, event.agentId);
  assert.equal(received[0].events[0].payload.apiKey, "[REDACTED]");
});

test("default control-plane startup wires the acquisition event sink into its durable service", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-acquisition-http-"));
  const mirrored = [];
  const acquisitionEventSink = (event) => mirrored.push(event);
  const prospectService = {
    configured: true,
    async discover() {
      return { accepted: true, status: "SUCCEEDED", resultSnapshot: { leads: [] }, events: [] };
    }
  };
  const server = await startControlPlaneServer({
    port: 0,
    host: "127.0.0.1",
    auth: false,
    clueHunterService: { configured: false },
    cloudDesktopService: { configured: false },
    douyinMcpService: { configured: false },
    douyinAgentCloudRegistry: { configured: false, getService() { return { configured: false }; } },
    accountResolver: { configured: true, async resolve() { return { uid: "account-http-1", secId: "sec-account-http-1" }; } },
    prospectService,
    prospectExecutor: prospectService,
    taskDispatcher: {},
    browserWorkspace: {},
    localBrowserExecutor: { configured: false },
    douyinAcquisitionStateFile: join(directory, "acquisition.json"),
    douyinAcquisitionAutoResume: false,
    acquisitionEventSink
  });
  try {
    assert.equal(server.douyinAcquisitionEventSink, acquisitionEventSink);
    const task = server.douyinAcquisitionService.createTask(context({ taskId: "task-http-default" }), {});
    assert.ok(mirrored.some((event) => event.type === "authorization" && event.taskId === task.context.taskId));
  } finally {
    server.douyinAcquisitionService.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("environment examples reserve the account cloud runtime MCP key", async () => {
  const envExample = await readFile(new URL("../.env.example", import.meta.url), "utf8");
  assert.match(envExample, /^BYERING_DOUYIN_MCP_API_KEY_MKT_DOUYIN_ACCOUNT_RUNTIME=/m);
  assert.doesNotMatch(envExample, /^BYERING_DOUYIN_MCP_API_KEY_MKT_DOUYIN_CHILD_CAPABILITIES=/m);
});

test("account cloud runtime resolves its dedicated MCP credential", () => {
  const envName = "BYERING_DOUYIN_MCP_API_KEY_MKT_DOUYIN_ACCOUNT_RUNTIME";
  const previous = process.env[envName];
  process.env[envName] = "account-runtime-key";
  try {
    const optionsByAgent = createDouyinAgentServiceOptionsByAgent();
    assert.deepEqual(optionsByAgent("mkt-douyin-account-runtime"), {
      apiKey: "account-runtime-key",
      requireScopedApiKey: true
    });
  } finally {
    if (previous === undefined) delete process.env[envName];
    else process.env[envName] = previous;
  }
});

test("account cloud runtime migrates from legacy product credentials", () => {
  const runtimeKey = "BYERING_DOUYIN_MCP_API_KEY_MKT_DOUYIN_ACCOUNT_RUNTIME";
  const legacyInboxKey = "BYERING_DOUYIN_MCP_API_KEY_MKT_DM_INBOX";
  const previousRuntime = process.env[runtimeKey];
  const previousLegacyInbox = process.env[legacyInboxKey];
  try {
    process.env[runtimeKey] = "account-runtime-key";
    process.env[legacyInboxKey] = "legacy-inbox-key";
    const optionsByAgent = createDouyinAgentServiceOptionsByAgent();
    assert.deepEqual(optionsByAgent("mkt-douyin-account-runtime"), {
      apiKey: "account-runtime-key",
      requireScopedApiKey: true
    });

    delete process.env[runtimeKey];
    assert.deepEqual(optionsByAgent("mkt-douyin-account-runtime"), {
      apiKey: "legacy-inbox-key",
      requireScopedApiKey: true
    });
  } finally {
    if (previousRuntime === undefined) delete process.env[runtimeKey];
    else process.env[runtimeKey] = previousRuntime;
    if (previousLegacyInbox === undefined) delete process.env[legacyInboxKey];
    else process.env[legacyInboxKey] = previousLegacyInbox;
  }
});

test("account cloud requires a scoped MCP key and retired live discovery owns no cloud key", () => {
  const agentIds = ["mkt-douyin-account-runtime"];
  const previousGlobal = process.env.BYERING_DOUYIN_MCP_API_KEY;
  const previousScoped = new Map();
  process.env.BYERING_DOUYIN_MCP_API_KEY = "legacy-global-key";
  for (const agentId of agentIds) {
    const suffix = agentId.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase();
    const envName = `BYERING_DOUYIN_MCP_API_KEY_${suffix}`;
    previousScoped.set(envName, process.env[envName]);
    delete process.env[envName];
  }

  try {
    const optionsByAgent = createDouyinAgentServiceOptionsByAgent();
    for (const agentId of agentIds) {
      assert.deepEqual(optionsByAgent(agentId), { requireScopedApiKey: true });
    }
    assert.deepEqual(optionsByAgent("mkt-live-lead-miner"), {});
    assert.deepEqual(optionsByAgent("mkt-comment-acquisition"), {});
    assert.deepEqual(optionsByAgent("mkt-cold-writer"), {});
    assert.deepEqual(optionsByAgent("mkt-dm-inbox"), {});
    assert.deepEqual(optionsByAgent("legacy-automation"), {});
  } finally {
    if (previousGlobal === undefined) delete process.env.BYERING_DOUYIN_MCP_API_KEY;
    else process.env.BYERING_DOUYIN_MCP_API_KEY = previousGlobal;
    for (const [envName, previous] of previousScoped) {
      if (previous === undefined) delete process.env[envName];
      else process.env[envName] = previous;
    }
  }
});

test("comment notification pull route uses the agent-scoped live MCP service", async (t) => {
  const calls = [];
  const scopes = [];
  const mcp = {
    configured: true,
    async status() { return { ok: true, login_state: "logged_in", worker: { online: true }, account: { user_id: "58262205543" } }; },
    async pullNotifications(input) {
      calls.push(input);
      return { ok: true, notifications: [{ msg_id: "n-1", comment_text: "你好" }], next_cursor: 1 };
    }
  };
  const registry = {
    configured: true,
    getService(agentId, scope) { assert.equal(agentId, "mkt-douyin-account-runtime"); scopes.push(["service", scope]); return mcp; },
    async status(agentId, scope) { assert.equal(agentId, "mkt-douyin-account-runtime"); scopes.push(["status", scope]); return mcp.status(); }
  };
  const { request } = await fixture(t, {
    douyinAgentCloudRegistry: registry,
    douyinMcpService: { configured: false }
  });
  const response = await request("/v1/douyin/mcp/pull-notifications", {
    method: "POST",
    body: JSON.stringify({
      agentId: "mkt-comment-acquisition",
      accountId: "account-b",
      accountIdentity: { secUid: "sec-account-b" },
      cursor: 1,
      limit: 50,
      waitMs: 5000
    })
  });
  const responseBody = await response.json();
  assert.equal(response.status, 200, JSON.stringify(responseBody));
  assert.deepEqual(calls, [{ cursor: 1, limit: 50, waitMs: 5000 }]);
  assert.deepEqual(scopes, [
    ["service", { tenantId: null, accountId: "account-b", accountIdentity: { secUid: "sec-account-b" }, accountLabel: null }],
    ["status", { tenantId: null, accountId: "account-b", accountIdentity: { secUid: "sec-account-b" }, accountLabel: null, resumeSaved: true }]
  ]);
  assert.equal(responseBody.next_cursor, 1);
});

test("start message mode trusts the reconciled Agent authorization status", async (t) => {
  const calls = [];
  const mcp = {
    configured: true,
    async status() {
      calls.push("mcp.status");
      return { ok: true, login_state: "logged_out", worker: { online: false }, account: null };
    },
    async startMessageMode() {
      calls.push("startMessageMode");
      return { ok: true, state: "running" };
    },
    async pullMessages() {
      calls.push("pullMessages");
      return { ok: true, messages: [], next_cursor: 0 };
    }
  };
  const registry = {
    configured: true,
    getService(agentId) {
      assert.equal(agentId, "mkt-douyin-account-runtime");
      return mcp;
    },
    async status(agentId) {
      assert.equal(agentId, "mkt-douyin-account-runtime");
      return {
        ok: true,
        display_state: "ready",
        login_state: "logged_in",
        worker: { online: true },
        account: { user_id: "58262205543" }
      };
    }
  };
  const { request } = await fixture(t, {
    douyinAgentCloudRegistry: registry,
    douyinMcpService: { configured: false }
  });
  const response = await request("/v1/douyin/mcp/start-message-mode", {
    method: "POST",
    body: JSON.stringify({ agentId: "mkt-dm-inbox" })
  });
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  assert.deepEqual(calls, ["startMessageMode"]);
  assert.equal(body.account.user_id, "58262205543");
});

test("inbox Agent start trusts the reconciled Agent authorization status", async (t) => {
  const stateDirectory = await mkdtemp(join(tmpdir(), "byering-inbox-http-"));
  const previousApiKey = process.env.BYERING_LLM_API_KEY;
  const previousStateFile = process.env.BYERING_DOUYIN_INBOX_STATE_FILE;
  process.env.BYERING_LLM_API_KEY = "test-llm-key";
  process.env.BYERING_DOUYIN_INBOX_STATE_FILE = join(stateDirectory, "state.json");
  t.after(() => {
    if (previousApiKey === undefined) delete process.env.BYERING_LLM_API_KEY;
    else process.env.BYERING_LLM_API_KEY = previousApiKey;
    if (previousStateFile === undefined) delete process.env.BYERING_DOUYIN_INBOX_STATE_FILE;
    else process.env.BYERING_DOUYIN_INBOX_STATE_FILE = previousStateFile;
  });

  const calls = [];
  const mcp = {
    configured: true,
    async status() {
      calls.push("mcp.status");
      return { ok: true, login_state: "logged_out", worker: { online: false }, account: null };
    },
    async startMessageMode() {
      calls.push("startMessageMode");
      return { ok: true, state: "running" };
    },
    async pullMessages() {
      calls.push("pullMessages");
      return { ok: true, messages: [], next_cursor: 0 };
    }
  };
  const registry = {
    configured: true,
    getService(agentId) {
      assert.equal(agentId, "mkt-douyin-account-runtime");
      return mcp;
    },
    async status(agentId) {
      assert.equal(agentId, "mkt-douyin-account-runtime");
      calls.push("registry.status");
      return {
        ok: true,
        display_state: "ready",
        login_state: "logged_in",
        worker: { online: true },
        account: { user_id: "58262205543", nickname: "一以万真" }
      };
    }
  };
  const inboxAgent = {
    agentId: "mkt-dm-inbox",
    configured: true,
    modelConfigured: true,
    planModelConfigured: true,
    status() { return { ok: true, agentId: "mkt-dm-inbox" }; },
    async plan() {
      calls.push("inbox.plan");
      return { ok: true, confirmable: true, planToken: "signed-plan", planRevision: "revision-1", plan: { source: "model" } };
    },
    async start() {
      calls.push("inbox.start");
      await mcp.startMessageMode();
      return { ok: true, runtime: { running: true } };
    }
  };
  const { request } = await fixture(t, {
    douyinAgentCloudRegistry: registry,
    douyinMcpService: { configured: false },
    douyinInboxAgentService: inboxAgent
  });

  const payload = {
    // The old inbox identifier is deliberately kept here to verify that
    // existing browser clients are routed to the comprehensive Agent session.
    agentId: "mkt-dm-inbox",
    accountId: "58262205543",
    accountName: "一以万真",
    autoReply: false,
    startPolling: false,
    replyRule: "仅用于验证授权状态",
    replyObjective: "验证私信承接启动",
    replyTone: "简洁",
    businessKnowledge: "测试知识",
    handoffRules: "无法确认的事实交给人工"
  };
  const planResponse = await request("/v1/douyin/inbox-agent/plan", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  assert.equal(planResponse.status, 200, await planResponse.text());

  const response = await request("/v1/douyin/inbox-agent/start", {
    method: "POST",
    body: JSON.stringify({ ...payload, planToken: "signed-plan", startRequestId: "start-auth-1" })
  });
  const body = await response.json();

  assert.equal(response.status, 200, JSON.stringify(body));
  assert.deepEqual(calls, ["registry.status", "inbox.plan", "registry.status", "inbox.start", "startMessageMode"]);
  assert.equal(body.runtime.running, true);
});

test("default acquisition activity bridge forwards canonical events when no sink is supplied", async (t) => {
  const received = [];
  const controlPlane = {
    ingestExecutionEvents(input) {
      received.push(input);
      return { acceptedCount: 1, duplicateCount: 0, currentSeq: 1 };
    }
  };
  const { server } = await fixture(t, { controlPlane });
  assert.equal(typeof server.douyinAcquisitionEventSink, "function");
  server.douyinAcquisitionEventSink({
    eventId: "activity-bridge-1",
    type: "touch_receipt",
    agentId: context().agentId,
    taskId: context().taskId,
    taskRunId: context().taskRunId,
    conversationId: context().conversationId,
    accountId: context().accountId,
    payload: { state: "delivered", acquisitionType: "touch_receipt" }
  });
  assert.equal(received.length, 1);
  assert.equal(received[0].events[0].type, "outreach.sent");
  assert.equal(received[0].events[0].payload.acquisitionType, "touch_receipt");
});

test("acquisition activity bridge keeps accepted separate from actually sent", async (t) => {
  const received = [];
  const controlPlane = {
    ingestExecutionEvents(input) {
      received.push(input);
      return { acceptedCount: 1, duplicateCount: 0, currentSeq: received.length };
    }
  };
  const { server } = await fixture(t, { controlPlane });
  const base = {
    agentId: context().agentId,
    taskId: context().taskId,
    taskRunId: context().taskRunId,
    conversationId: context().conversationId,
    accountId: context().accountId,
    type: "touch_receipt",
    acquisitionType: "touch_receipt"
  };
  server.douyinAcquisitionEventSink({ ...base, eventId: "activity-accepted-1", payload: { state: "accepted" } });
  server.douyinAcquisitionEventSink({ ...base, eventId: "activity-sent-1", payload: { state: "sent" } });
  assert.equal(received[0].events[0].type, "outreach.accepted");
  assert.equal(received[1].events[0].type, "outreach.sent");
});

test("default acquisition bridge registers acquisition tasks before mirroring activity", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-acquisition-bridge-"));
  const controlPlane = createControlPlane();
  const server = await startControlPlaneServer({
    port: 0,
    host: "127.0.0.1",
    auth: false,
    controlPlane,
    clueHunterService: { configured: false },
    cloudDesktopService: { configured: false },
    douyinMcpService: { configured: false },
    douyinAgentCloudRegistry: { configured: false, getService() { return { configured: false }; } },
    accountResolver: { configured: true, async resolve() { return { uid: "account-bridge-1", secId: "sec-account-bridge-1" }; } },
    prospectService: { configured: true, async discover() { return { accepted: true, status: "SUCCEEDED", resultSnapshot: { leads: [] }, events: [] }; } },
    prospectExecutor: { configured: true },
    taskDispatcher: {},
    browserWorkspace: {},
    localBrowserExecutor: { configured: false },
    douyinAcquisitionStateFile: join(directory, "acquisition.json"),
    douyinAcquisitionAutoResume: false
  });
  try {
    const task = server.douyinAcquisitionService.createTask(context({
      taskId: "task-bridge-1",
      taskRunId: "run-bridge-1",
      conversationId: "conversation-bridge-1",
      accountId: "account-bridge-1"
    }), {});
    const mirrored = server.douyinAcquisitionEventSink({
      eventId: "receipt-bridge-1",
      type: "touch_receipt",
      agentId: task.context.agentId,
      taskId: task.context.taskId,
      taskRunId: task.context.taskRunId,
      conversationId: task.context.conversationId,
      accountId: task.context.accountId,
      payload: { state: "delivered", acquisitionType: "touch_receipt" }
    });
    assert.ok(mirrored?.acceptedCount >= 1);
    const snapshot = controlPlane.getTaskSnapshot(task.context.taskId);
    assert.equal(snapshot.taskRunId, task.context.taskRunId);
    assert.ok(controlPlane.listTaskEvents(task.context.taskId).some((event) => event.type === "outreach.sent"));
  } finally {
    server.douyinAcquisitionService.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("acquisition bridge maps errors and synchronizes the authoritative task snapshot", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-acquisition-state-"));
  const controlPlane = createControlPlane();
  const server = await startControlPlaneServer({
    port: 0, host: "127.0.0.1", auth: false, controlPlane,
    clueHunterService: { configured: false }, cloudDesktopService: { configured: false },
    douyinMcpService: { configured: false }, douyinAgentCloudRegistry: { configured: false, getService() { return { configured: false }; } },
    accountResolver: { configured: true }, prospectService: { configured: true, async discover() { return { accepted: true, events: [] }; } },
    prospectExecutor: { configured: true }, taskDispatcher: {}, browserWorkspace: {}, localBrowserExecutor: { configured: false },
    douyinAcquisitionStateFile: join(directory, "acquisition.json"), douyinAcquisitionAutoResume: false
  });
  try {
    const base = context({ taskId: "task-state-sync", taskRunId: "run-state-sync" });
    server.douyinAcquisitionEventSink({ ...base, eventId: "state-sync-running", type: "cloud_lifecycle", taskState: "running", runtimeState: "RUNNING", health: "OK", payload: { state: "online" } });
    const event = { ...base, eventId: "state-sync-error", type: "error", taskState: "error", runtimeState: "FAILED", health: "ERROR", payload: { message: "cloud offline" } };
    const result = server.douyinAcquisitionEventSink(event);
    assert.ok(result?.acceptedCount >= 1);
    const snapshot = controlPlane.getTaskSnapshot(event.taskId);
    assert.equal(snapshot.state, "FAILED");
    assert.equal(controlPlane.persistence.loadTask(event.taskId).health, "ERROR");
    assert.equal(controlPlane.listTaskEvents(event.taskId).at(-1).type, "task.failed");
  } finally {
    server.douyinAcquisitionService.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("acquisition bridge mirrors future-only configuration updates into the control plane", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-acquisition-config-bridge-"));
  const controlPlane = createControlPlane();
  const server = await startControlPlaneServer({
    port: 0, host: "127.0.0.1", auth: false, controlPlane,
    clueHunterService: { configured: false }, cloudDesktopService: { configured: false },
    douyinMcpService: { configured: false }, douyinAgentCloudRegistry: { configured: false, getService() { return { configured: false }; } },
    accountResolver: { configured: true }, prospectService: { configured: true, async discover() { return { accepted: true, events: [] }; } },
    prospectExecutor: { configured: true }, taskDispatcher: {}, browserWorkspace: {}, localBrowserExecutor: { configured: false },
    douyinAcquisitionStateFile: join(directory, "acquisition.json"), douyinAcquisitionAutoResume: false
  });
  try {
    const base = context({ taskId: "task-config-bridge", taskRunId: "run-config-bridge" });
    server.douyinAcquisitionEventSink({ ...base, eventId: "config-bridge-start", type: "cloud_lifecycle", taskState: "running", runtimeState: "RUNNING", health: "OK", payload: { state: "online" } });
    const configuration = {
      version: 2,
      effectiveScope: "future_only",
      effectiveAt: "2026-09-03T00:00:00.000Z",
      effectiveFromSeq: 2,
      findingStrategy: { sourceScope: "own_works", filters: { intentSignals: ["价格"] } },
      touchContent: { message: "新的触达内容" }
    };
    const result = server.douyinAcquisitionEventSink({
      ...base,
      eventId: "config-bridge-update",
      type: "config_updated",
      payload: { configVersion: 2, configuration, changedSections: ["touchContent"] }
    });
    assert.ok(result?.acceptedCount >= 1);
    const snapshot = controlPlane.getTaskSnapshot(base.taskId);
    assert.equal(snapshot.configuration.version, 2);
    assert.equal(snapshot.configuration.touchContent.message, "新的触达内容");
    assert.equal(snapshot.configuration.findingStrategy.sourceScope, "own_works");
    assert.equal(controlPlane.listTaskEvents(base.taskId).at(-1).type, "task.config.updated");
  } finally {
    server.douyinAcquisitionService.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
