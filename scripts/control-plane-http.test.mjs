import assert from "node:assert/strict";
import test from "node:test";
import { createControlPlane } from "../backend/control-plane.js";
import { createControlPlaneHttpServer } from "../backend/http-server.js";
import { ControlPlaneHttpClient, createHybridGateway, isControlPlaneAction, toAgUiEvent } from "../src/salebuddy/bridge/control-plane-http.js";

function testRequirementService() {
  return {
    async understand({ goal }) {
      return {
        schemaVersion: 1,
        source: "test",
        provider: "test",
        model: "fixture",
        generatedAt: "2026-08-19T00:00:00.000Z",
        title: "测试需求",
        objective: goal || "测试目标",
        scope: "测试数据",
        deliverable: "测试结果",
        guardrail: "不执行外部动作",
        missing: [],
        assumptions: [],
        confidence: 1
      };
    }
  };
}

test("control-plane events map to explicit AG-UI gate types", () => {
  const base = { taskId: "task-map-1", taskRunId: "run-map-1", conversationId: "conv-map-1", seq: 1, eventId: "event-map-1", occurredAt: "2026-08-19T00:00:00.000Z" };
  assert.equal(toAgUiEvent({ ...base, type: "task.requirement.confirmed", payload: {} }).type, "REQUIREMENT_CONFIRMED");
  assert.equal(toAgUiEvent({ ...base, type: "task.assignment.proposed", payload: { assignments: [{ agentName: "线索猎人" }] } }).type, "ASSIGNMENT_PROPOSED");
  assert.equal(toAgUiEvent({ ...base, type: "access.authorization.requested", payload: { provider: "抖音账号", scopes: ["直播互动"] } }).type, "ACCESS_REQUIRED");
  assert.equal(toAgUiEvent({ ...base, type: "access.authorization.granted", payload: { stage: "authorization" } }).type, "ACCESS_GRANTED");
  const scopeGranted = toAgUiEvent({ ...base, type: "access.authorization.granted", payload: { stage: "scope" } });
  assert.equal(scopeGranted.type, "ACCESS_GRANTED");
  assert.equal(scopeGranted.stage, "scope");
  const accountResolved = toAgUiEvent({
    ...base,
    type: "account.resolved",
    payload: { account: { uid: "u-1", secId: "sec-1", uniqueId: "huanglaoban" } }
  });
  assert.equal(accountResolved.type, "ACCOUNT_RESOLVED");
  assert.equal(accountResolved.agentId, "acquisition_strategist");
  assert.equal(accountResolved.account.secId, "sec-1");
});

test("durable task subscription is a supported control-plane action", () => {
  assert.equal(isControlPlaneAction("task.run.snapshot"), true);
  assert.equal(isControlPlaneAction("task.run.subscribe"), true);
});

test("control-plane HTTP client attaches an explicitly configured API key", async () => {
  const calls = [];
  const client = new ControlPlaneHttpClient({
    baseUrl: "http://control-plane.test",
    apiKey: "tenant-a-key",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
  });
  await client.connect();
  assert.equal(calls[0].options.headers.authorization, "Bearer tenant-a-key");
});

test("control-plane execution facts map to consumable AG-UI business events", () => {
  const base = { taskId: "task-result-1", taskRunId: "run-result-1", conversationId: "conv-result-1", seq: 7, eventId: "event-result-1" };
  const accepted = toAgUiEvent({
    ...base,
    type: "task.execution.accepted",
    payload: { accepted: true, commandId: "cmd-1", queue: "touch", status: "WAIT" }
  });
  assert.equal(accepted.type, "TASK_EXECUTION_ACCEPTED");
  assert.equal(accepted.commandId, "cmd-1");

  const sent = toAgUiEvent({
    ...base,
    eventId: "event-result-2",
    type: "outreach.sent",
    payload: { leadId: "lead-1", deliveryState: "submitted" }
  });
  assert.equal(sent.type, "OUTREACH_SENT");
  assert.equal(sent.leadId, "lead-1");

  const result = toAgUiEvent({
    ...base,
    eventId: "event-result-3",
    type: "task.result.updated",
    payload: {
      resultSnapshot: { source: "cluehunter", counts: { leads: 2 } },
      artifacts: [{ id: "file-1", name: "线索.csv", type: "sheet" }]
    }
  });
  assert.equal(result.type, "RESULT_UPDATED");
  assert.equal(result.resultSnapshot.counts.leads, 2);
  assert.equal(result.artifacts[0].id, "file-1");

  const completed = toAgUiEvent({
    ...base,
    eventId: "event-result-4",
    type: "task.completed",
    payload: {
      resultSnapshot: { source: "cluehunter", counts: { leads: 2, outreach: 1 } },
      artifacts: [{ id: "file-2", name: "触达结果.csv", type: "sheet" }],
      text: "已完成"
    }
  });
  assert.equal(completed.type, "RUN_FINISHED");
  assert.equal(completed.text, "已完成");
  assert.equal(completed.resultSnapshot.counts.outreach, 1);
  assert.equal(completed.artifacts[0].id, "file-2");
});

test("browser control-plane client creates, starts, snapshots, and replays task events", async () => {
  const server = createControlPlaneHttpServer({ controlPlane: createControlPlane({ requirementService: testRequirementService() }) });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const client = new ControlPlaneHttpClient({ baseUrl: `http://127.0.0.1:${address.port}`, pollIntervalMs: 20 });
  try {
    await client.connect();
    const created = await client.action("task.create", {
      commandId: "cmd-http-create",
      idempotencyKey: "idem-http-create",
      payload: { goal: "找潜客", projectId: "room-leads" }
    });
    assert.equal(created.accepted, true);
    assert.ok(created.taskId);

    const run = await client.run({ taskId: created.taskId, taskRunId: created.taskRunId, conversationId: created.conversationId, input: "找潜客" });
    assert.equal(run.ok, true);
    assert.equal(run.taskId, created.taskId);
    assert.equal(run.conversation_id, created.conversationId);

    const subscriptionAck = await client.action("task.run.subscribe", { taskId: created.taskId });
    assert.equal(subscriptionAck.accepted, true);

    const events = await client.events(created.taskId, { afterSeq: 0 });
    assert.deepEqual(events.events.map((event) => event.type), ["task.created", "task.requirement.proposed", "task.run.started"]);
  } finally {
    client.disconnect();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("control-plane event replay preserves the real requirement proposal as AG-UI", async () => {
  const server = createControlPlaneHttpServer({ controlPlane: createControlPlane({ requirementService: testRequirementService() }) });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const client = new ControlPlaneHttpClient({ baseUrl: `http://127.0.0.1:${address.port}`, pollIntervalMs: 10 });
  try {
    await client.connect();
    const created = await client.action("task.create", {
      commandId: "cmd-http-requirement-event",
      idempotencyKey: "idem-http-requirement-event",
      payload: { goal: "验证真实需求事件" }
    });
    const proposalEvent = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("requirement proposal event timed out")), 500);
      client.on("ag_ui_event", (event) => {
        if (event.type !== "REQUIREMENT_PROPOSED") return;
        clearTimeout(timer);
        resolve(event);
      });
    });
    client.subscribeTask(created.taskId);
    const event = await proposalEvent;
    assert.equal(event.proposal.title, "测试需求");
    assert.equal(event.proposal.objective, "验证真实需求事件");
  } finally {
    client.disconnect();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("hybrid gateway keeps native agent streaming while routing task commands to control plane", async () => {
  const actions = [];
  const runs = [];
  const native = {
    action: async () => { throw new Error("office action should not be used"); },
    run: async (payload) => { runs.push(payload); return { run_id: "agent-run-1" }; },
    on: (eventName) => {
      assert.equal(eventName, "ag_ui_event");
      return () => {};
    }
  };
  const controlPlane = {
    connected: true,
    connect: async () => {},
    action: async (actionName) => { actions.push(actionName); return { accepted: true }; },
    run: async () => ({ accepted: true, taskId: "task-1", taskRunId: "run-1", conversationId: "conv-1" }),
    on: () => () => {}
  };
  const hybrid = createHybridGateway({ nativeGateway: native, controlPlane });
  const ack = await hybrid.run({ taskId: "task-1", conversation_id: "conv-1" });
  assert.equal(ack.agent.run_id, "agent-run-1");
  assert.equal(runs[0].taskId, "task-1");
  await hybrid.action("task.pause", { taskId: "task-1" });
  assert.deepEqual(actions, ["task.pause"]);
});

test("hybrid gateway refuses to claim execution without a real Agent Gateway", async () => {
  const controlPlane = {
    connected: true,
    connect: async () => {},
    run: async () => ({ accepted: true, taskId: "task-no-agent", taskRunId: "run-no-agent", conversationId: "conv-no-agent" }),
    on: () => () => {}
  };
  const hybrid = createHybridGateway({ controlPlane });
  await assert.rejects(
    () => hybrid.run({ taskId: "task-no-agent" }),
    (error) => error?.code === "AGENT_GATEWAY_UNAVAILABLE"
  );
});

test("hybrid gateway can use the configured ClueHunter executor without a native Agent Gateway", async () => {
  const controlPlane = {
    connected: true,
    executionReady: true,
    executionSource: "cluehunter",
    connect: async () => {},
    run: async () => ({ accepted: true, state: "RUNNING", taskId: "task-cluehunter", taskRunId: "run-cluehunter" }),
    on: () => () => {}
  };
  const hybrid = createHybridGateway({ controlPlane });
  const ack = await hybrid.run({ taskId: "task-cluehunter" });
  assert.equal(ack.executionSource, "cluehunter");
  assert.equal(ack.taskId, "task-cluehunter");
});

test("hybrid gateway does not open the native executor while a server gate is pending", async () => {
  let nativeRuns = 0;
  const native = {
    run: async () => { nativeRuns += 1; return { run_id: "must-not-run" }; },
    on: () => () => {}
  };
  const controlPlane = {
    connected: true,
    connect: async () => {},
    run: async () => ({ accepted: true, state: "WAITING_ACCESS", taskId: "task-gated" }),
    on: () => () => {}
  };
  const hybrid = createHybridGateway({ nativeGateway: native, controlPlane });
  const ack = await hybrid.run({ taskId: "task-gated" });
  assert.equal(ack.state, "WAITING_ACCESS");
  assert.equal(nativeRuns, 0);
});

test("browser workspace endpoints expose real-session state without exposing cookies", async () => {
  let ready = false;
  const browserWorkspace = {
    async start(input) {
      return { sessionId: "session-1", workspaceId: "workspace-1", provider: input.provider, state: "AUTHORIZING", authUrl: "https://www.douyin.com/login?source=byering" };
    },
    async snapshot() {
      return { sessionId: "session-1", workspaceId: "workspace-1", provider: "douyin", state: ready ? "READY" : "AUTHORIZING", authUrl: "https://www.douyin.com/login?source=byering" };
    },
    async authorize() {
      if (!ready) {
        const error = new Error("pending");
        error.code = "AUTHORIZATION_PENDING";
        error.statusCode = 409;
        throw error;
      }
      return { sessionId: "session-1", workspaceId: "workspace-1", provider: "douyin", state: "READY", accountLabel: "抖音测试账号" };
    },
    async close() { return { sessionId: "session-1", state: "DESTROYED" }; }
  };
  const server = createControlPlaneHttpServer({ controlPlane: createControlPlane({ requirementService: testRequirementService() }), browserWorkspace });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const client = new ControlPlaneHttpClient({ baseUrl: `http://127.0.0.1:${address.port}` });
  try {
    const started = await client.browserSessionStart({ tenantId: "tenant-1", provider: "douyin", accountKey: "seller-1" });
    assert.equal(started.state, "AUTHORIZING");
    await assert.rejects(() => client.browserSessionAuthorize(started.sessionId), /pending/);
    ready = true;
    const authorized = await client.browserSessionAuthorize(started.sessionId);
    assert.equal(authorized.state, "READY");
    assert.equal(authorized.cookies, undefined);
  } finally {
    client.disconnect();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("access scope confirmation requires a live browser workspace bound to the task", async (t) => {
  const controlPlane = createControlPlane({ idFactory: (() => { let n = 0; return () => `scope-${++n}`; })(), requirementService: testRequirementService() });
  let authorized = false;
  const browserWorkspace = {
    async authorize(sessionId) {
      if (!authorized) {
        const error = new Error("login pending");
        error.code = "AUTHORIZATION_PENDING";
        error.statusCode = 409;
        throw error;
      }
      return { sessionId, taskId: "task-scope-1", provider: "douyin", accountLabel: "抖音账号" };
    }
  };
  const server = createControlPlaneHttpServer({ controlPlane, browserWorkspace });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, options) => fetch(`${base}${path}`, {
    headers: { "content-type": "application/json" },
    ...options
  });
  const created = await (await request("/v1/tasks", {
    method: "POST",
    body: JSON.stringify({ goal: "授权后找潜客并发送首条私信", taskId: "task-scope-1" })
  })).json();
  const start = await (await request(`/v1/tasks/${created.taskId}/start`, {
    method: "POST",
    body: JSON.stringify({ expectedVersion: 0, requirementsConfirmed: false })
  })).json();
  assert.equal(start.state, "WAITING_REQUIREMENT");
  const confirmed = await (await request("/v1/commands", {
    method: "POST",
    body: JSON.stringify({ type: "task.requirement.confirm", taskId: created.taskId, expectedVersion: 1, payload: { requiresAccess: true } })
  })).json();
  assert.equal(confirmed.state, "WAITING_ACCESS");
  const pending = await request("/v1/commands", {
    method: "POST",
    body: JSON.stringify({ type: "access.scope.confirm", taskId: created.taskId, expectedVersion: 2, payload: { browserSessionId: "session-scope-1", scopes: ["私信发送"] } })
  });
  assert.equal(pending.status, 409);
  assert.equal((await pending.json()).error.code, "AUTHORIZATION_PENDING");

  authorized = true;
  const granted = await request("/v1/commands", {
    method: "POST",
    body: JSON.stringify({ type: "access.scope.confirm", taskId: created.taskId, expectedVersion: 2, payload: { browserSessionId: "session-scope-1", scopes: ["私信发送"] } })
  });
  assert.equal(granted.status, 202);
  assert.equal((await granted.json()).state, "RUNNING");
  assert.equal(controlPlane.getTaskSnapshot(created.taskId).browserSessionId, "session-scope-1");
});
