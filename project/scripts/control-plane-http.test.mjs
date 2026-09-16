import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createControlPlane } from "../backend/control-plane.js";
import { createControlPlaneHttpServer } from "../backend/http-server.js";
import { createProspectRecordStore } from "../backend/prospect-record-store.js";
import { ControlPlaneHttpClient, createHybridGateway, isControlPlaneAction, normalizeControlPlaneTaskSnapshot, toAgUiEvent } from "../src/salebuddy/bridge/control-plane-http.js";
import { createAgentStore } from "./agent-store.mjs";

test("control-plane status and events consume acquisition task mapping", () => {
  assert.deepEqual(normalizeControlPlaneTaskSnapshot({ taskId: "task-status-1", acquisitionTaskState: "degraded" }), {
    taskId: "task-status-1",
    acquisitionTaskState: "degraded",
    taskState: "degraded",
    runtimeState: "RUNNING",
    health: "DEGRADED"
  });
  const event = toAgUiEvent({
    taskId: "task-status-1",
    type: "task.run.started",
    payload: { acquisitionTaskState: "degraded" }
  });
  assert.equal(event.runtimeState, "RUNNING");
  assert.equal(event.health, "DEGRADED");
});

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

  const configuration = toAgUiEvent({
    ...base,
    type: "task.config.updated",
    payload: {
      configurationVersion: 2,
      effectiveScope: "future_only",
      updatedSections: ["touchContent"],
      configuration: { version: 2, touchContent: "测试" }
    }
  });
  assert.equal(configuration.type, "TASK_CONFIG_UPDATED");
  assert.equal(configuration.configurationVersion, 2);
  assert.equal(configuration.configuration.touchContent, "测试");

  const replySent = toAgUiEvent({
    ...base,
    type: "reply.sent",
    payload: { messageId: "message-1", deliveryState: "sent", content: "收到，我来帮你看看。" }
  });
  assert.equal(replySent.type, "OUTREACH_SENT");
  assert.equal(replySent.messageId, "message-1");
  assert.equal(replySent.deliveryState, "sent");
});

test("durable task subscription is a supported control-plane action", () => {
  assert.equal(isControlPlaneAction("task.run.snapshot"), true);
  assert.equal(isControlPlaneAction("task.run.subscribe"), true);
  assert.equal(isControlPlaneAction("task.config.update"), true);
  assert.equal(isControlPlaneAction("chief.message.decide"), true);
  assert.equal(isControlPlaneAction("dm.message.list"), true);
  assert.equal(isControlPlaneAction("dm.message.send"), true);
  assert.equal(isControlPlaneAction("douyin.acquisition.tasks.list"), true);
});

test("browser control-plane client lists durable acquisition tasks for conversation binding", async t => {
  const acquisitionService = {
    status() { return {}; },
    listTasks() {
      return [{
        key: "mkt-comment-acquisition::task-1::account-1",
        context: {
          agentId: "mkt-comment-acquisition",
          taskId: "task-1",
          taskRunId: "run-1",
          conversationId: "conversation-1",
          accountId: "account-1"
        },
        state: "running",
        eventSeq: 7,
        configurationVersion: 3,
        updatedAt: "2026-09-15T10:00:00.000Z"
      }];
    }
  };
  const server = createControlPlaneHttpServer({ auth: false, douyinAcquisitionService: acquisitionService });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const client = new ControlPlaneHttpClient({ baseUrl: `http://127.0.0.1:${server.address().port}` });

  const listed = await client.action("douyin.acquisition.tasks.list", {
    agentId: "mkt-comment-acquisition",
    accountId: "account-1"
  });
  assert.equal(listed.accepted, true);
  assert.equal(listed.data.tasks[0].taskId, "task-1");
  assert.equal(listed.data.tasks[0].configurationVersion, 3);
  assert.equal(listed.data.tasks[0].configuration.version, 3);
});

test("direct messages use the durable control-plane store without a native gateway", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-dm-http-"));
  const server = createControlPlaneHttpServer({
    auth: false,
    agentStore: createAgentStore(directory, { seedMessages: false })
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const client = new ControlPlaneHttpClient({ baseUrl: `http://127.0.0.1:${server.address().port}` });
  try {
    const sent = await client.action("dm.message.send", {
      agentType: "main",
      conversationId: "chief-of-staff",
      from: "user",
      fromName: "我",
      text: "你能做什么？",
      metadata: { suppressAutoReply: true }
    });
    assert.equal(sent.data.message.text, "你能做什么？");

    const listed = await client.action("dm.message.list", {
      agentType: "main",
      conversationId: "chief-of-staff"
    });
    assert.ok(listed.data.messages.some((message) => message.id === sent.data.message.id));
    assert.equal(listed.data.messages.some((message) => String(message.id).startsWith("dm-seed-")), false);
    assert.equal(listed.data.messages.at(-1).conversationId, "chief-of-staff");
  } finally {
    client.disconnect();
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});

test("results API stores customer asset lifecycle state outside the browser", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-results-assets-"));
  const server = createControlPlaneHttpServer({
    auth: false,
    prospectRecordStore: createProspectRecordStore({ stateFile: join(directory, "prospects.json") })
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const stored = await fetch(`${base}/v1/results/prospects`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ records: [{
        id: "lead-1",
        name: "小林",
        status: "已转化",
        conversionStatus: "已转化",
        updatedAt: "2026-09-12T12:00:00.000Z"
      }] })
    });
    assert.equal(stored.status, 200, await stored.text());

    const result = await fetch(`${base}/v1/results`).then((response) => response.json());
    assert.deepEqual(result.prospects, [{
      id: "lead-1",
      name: "小林",
      status: "已转化",
      conversionStatus: "已转化",
      updatedAt: "2026-09-12T12:00:00.000Z"
    }]);

    const missingConfirmation = await fetch(`${base}/v1/results/prospects`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({})
    });
    assert.equal(missingConfirmation.status, 400);
    const removed = await fetch(`${base}/v1/results/prospects`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: ["lead-1"] })
    });
    assert.equal(removed.status, 200, await removed.text());
    assert.deepEqual((await fetch(`${base}/v1/results`).then((response) => response.json())).prospects, []);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});

test("server wires the unified inbox event bridge into an injected inbox service", () => {
  let receivedSink = null;
  const injectedInbox = {
    agentId: "mkt-dm-inbox",
    status() { return { runtime: { running: false } }; },
    setEventSink(sink) { receivedSink = sink; }
  };
  const server = createControlPlaneHttpServer({ auth: false, douyinInboxAgentService: injectedInbox });

  assert.equal(typeof receivedSink, "function");
  receivedSink({
    eventId: "injected-reply-sent-1",
    type: "reply.sent",
    taskId: "injected-inbox-task",
    taskRunId: "injected-inbox-run",
    conversationId: "injected-inbox-conversation",
    messageId: "message-injected-1",
    content: "收到，我来帮你看看。"
  });

  const snapshot = server.controlPlane.getTaskSnapshot("injected-inbox-task");
  assert.equal(snapshot.resultSnapshot.outreach.sent, 1);
  assert.equal(snapshot.resultSnapshot.outreach.lastEvent, "reply.sent");
});

test("direct message actions use an operational timeout separate from health checks", async () => {
  const client = new ControlPlaneHttpClient({
    baseUrl: "http://control-plane.test",
    timeoutMs: 500,
    directMessageTimeoutMs: 30,
    fetchImpl: async (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    })
  });
  const startedAt = Date.now();
  await assert.rejects(
    client.action("dm.message.list", { agentType: "main" }),
    /控制面请求超时/
  );
  assert.ok(Date.now() - startedAt < 250, "the direct-message timeout must not inherit the 500ms health-check client timeout");
});

test("chief message decision endpoint answers consultation without creating a task", async () => {
  const server = createControlPlaneHttpServer({
    auth: false,
    controlPlane: createControlPlane({
      requirementService: {
        async understand({ goal }) {
          return {
            title: "能力说明",
            objective: goal,
            scope: "当前对话",
            deliverable: "直接回答",
            guardrail: "不创建任务",
            missing: [],
            assumptions: [],
            confidence: 1,
            intent: "conversation",
            riskLevel: "low",
            blockingMissing: [],
            userMessage: "我负责查看全局状态和已有任务。"
          };
        }
      }
    })
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const client = new ControlPlaneHttpClient({ baseUrl: `http://127.0.0.1:${server.address().port}` });
  try {
    const result = await client.action("chief.message.decide", { message: "你能做什么？" });
    assert.equal(result.decision.intent, "conversation");
    assert.equal(result.shouldCreateTask, false);
    assert.match(result.message, /全局运营管家/);
  } finally {
    client.disconnect();
    await new Promise((resolve) => server.close(resolve));
  }
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

test("knowledge context endpoint preserves the independent child Agent knowledge contract", async () => {
  const server = createControlPlaneHttpServer({
    auth: false,
    knowledgeProvider: async ({ agentId }) => ({
      agentId,
      entries: [{ id: "knowledge-1", kind: "projectRules", scope: "project", status: "active", text: "只使用已批准的业务事实。" }],
      context: "[项目背景 · 当前项目] 只使用已批准的业务事实。"
    })
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/v1/knowledge/context?agentId=mkt-dm-inbox`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.agentId, "mkt-dm-inbox");
    assert.equal(body.entries[0].id, "knowledge-1");
    assert.match(body.context, /已批准的业务事实/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("inbox preflight and start routes preserve the reviewed account-scoped configuration", async () => {
  let planned = null;
  let received = null;
  const inboxAgent = {
    agentId: "mkt-dm-inbox",
    configured: true,
    modelConfigured: true,
    planModelConfigured: true,
    async plan(options) {
      planned = options;
      return { ok: true, agentId: "mkt-dm-inbox", confirmable: true, planToken: "signed-plan", planRevision: "revision-1", plan: { source: "model" } };
    },
    async start(options) {
      received = options;
      return { ok: true, agentId: "mkt-dm-inbox", accountId: options.accountId, accountName: options.accountName };
    },
    startStatus(startRequestId) { return { startRequestId, state: "accepted" }; },
    status() { return { ok: true, agentId: "mkt-dm-inbox" }; }
  };
  const douyinMcp = {
    configured: true,
    async status() { return { login_state: "logged_in", account: { id: "account-a", sec_uid: "shared-sender" } }; }
  };
  const server = createControlPlaneHttpServer({
    auth: false,
    allowLegacyProductExecution: true,
    douyinInboxAgentService: inboxAgent,
    douyinMcpService: douyinMcp
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  try {
    const planResponse = await fetch(`http://127.0.0.1:${address.port}/v1/douyin/inbox-agent/plan`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        accountId: "account-a",
        accountName: "账号 A",
        autoReply: false,
        replyRule: "只回答确认过的产品事实。",
        replyObjective: "先解决问题再确认需求。",
        replyTone: "专业、自然。",
        businessKnowledge: "标准版支持三个账号。",
        handoffRules: "价格、退款和投诉交给人工。"
      })
    });
    assert.equal(planResponse.status, 200);
    assert.equal(planned.accountId, "account-a");
    assert.equal(planned.handoffRules, "价格、退款和投诉交给人工。");

    const response = await fetch(`http://127.0.0.1:${address.port}/v1/douyin/inbox-agent/start`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        accountId: "account-a",
        accountName: "账号 A",
        autoReply: false,
        handoffRules: "价格、退款和投诉交给人工。",
        planToken: "signed-plan",
        startRequestId: "start-route-1",
        startPolling: false
      })
    });
    assert.equal(response.status, 200);
    assert.equal(received.accountId, "account-a");
    assert.equal(received.accountName, "账号 A");
    assert.equal(received.handoffRules, "价格、退款和投诉交给人工。");
    assert.equal(received.planToken, "signed-plan");
    assert.equal(received.startRequestId, "start-route-1");
    assert.equal(received.accountCoordinationKey, "douyin:sec:shared-sender");

    const statusResponse = await fetch(`http://127.0.0.1:${address.port}/v1/douyin/inbox-agent/start-status?agentId=mkt-dm-inbox&startRequestId=start-route-1`);
    assert.equal(statusResponse.status, 200);
    assert.equal((await statusResponse.json()).state, "accepted");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("inbox status refreshes coordination with the real logged-in account", async () => {
  const refreshed = [];
  const inboxAgent = {
    agentId: "mkt-dm-inbox",
    configured: true,
    modelConfigured: true,
    planModelConfigured: true,
    status() { return { ok: true, agentId: "mkt-dm-inbox", accountId: "legacy-slot" }; },
    setAccountCoordinationKey(value) { refreshed.push(value); return value; }
  };
  const server = createControlPlaneHttpServer({
    auth: false,
    douyinInboxAgentService: inboxAgent,
    douyinMcpService: {
      configured: true,
      async status() {
        return { ok: true, login_state: "logged_in", account: { sec_uid: "restored-real-sender" } };
      }
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/v1/douyin/inbox-agent/status?agentId=mkt-dm-inbox`);
    assert.equal(response.status, 200);
    assert.deepEqual(refreshed, ["douyin:sec:restored-real-sender"]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
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

test("results endpoint returns only the authenticated tenant's canonical task and acquisition results", async (t) => {
  const controlPlane = createControlPlane();
  for (const tenantId of ["tenant-a", "tenant-b"]) {
    const taskId = `result-control-${tenantId}`;
    controlPlane.dispatch({
      type: "task.create",
      taskId,
      taskRunId: `run-control-${tenantId}`,
      agentId: "mkt-find-people",
      payload: { goal: "寻找直播间潜客", tenantId }
    });
    const task = controlPlane.persistence.loadTask(taskId);
    controlPlane.persistence.saveTask({
      ...task,
      state: "COMPLETED",
      updatedAt: `2026-09-12T10:0${tenantId.endsWith("a") ? "1" : "2"}:00.000Z`,
      resultSnapshot: {
        source: "我的账号直播间互动",
        sourceScope: "authorized_account_live",
        counts: { candidates: 1 },
        leads: [{ leadId: `lead-${tenantId}`, nickname: `用户-${tenantId}`, secUid: `sec-${tenantId}` }]
      }
    });
  }
  const acquisitionService = {
    listTasks: () => ["tenant-a", "tenant-b"].map((tenantId) => ({
      context: {
        tenantId,
        agentId: "mkt-comment-acquisition",
        taskId: `result-runtime-${tenantId}`,
        taskRunId: `run-runtime-${tenantId}`,
        accountId: `account-${tenantId}`
      },
      state: "running",
      updatedAt: `2026-09-12T10:1${tenantId.endsWith("a") ? "1" : "2"}:00.000Z`,
      resultSnapshot: {
        source: "已授权账号互动",
        sourceScope: "authorized_account_interactions",
        counts: { candidates: 1 },
        leads: [{ leadId: `runtime-lead-${tenantId}`, nickname: `运行用户-${tenantId}`, secUid: `runtime-sec-${tenantId}` }]
      }
    }))
  };
  const auth = {
    authenticate(request) {
      const tenantId = request.headers["x-test-tenant"];
      if (!tenantId) throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
      return { tenantId, authenticated: true };
    }
  };
  const server = createControlPlaneHttpServer({ controlPlane, douyinAcquisitionService: acquisitionService, auth });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;

  assert.equal((await fetch(`${base}/v1/results`)).status, 401);
  const response = await fetch(`${base}/v1/results?limit=10`, { headers: { "x-test-tenant": "tenant-a" } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json();
  assert.equal(body.runs.length, 2);
  assert.equal(body.runs.every((run) => run.taskId.endsWith("tenant-a")), true);
  assert.equal(JSON.stringify(body).includes("tenant-b"), false);
  assert.ok(body.runs.every((run) => run.resultSnapshot && run.sourceContext && run.accountId !== undefined));
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
    assert.equal(run.state, "RUNNING");

    const subscriptionAck = await client.action("task.run.subscribe", { taskId: created.taskId });
    assert.equal(subscriptionAck.accepted, true);

    const events = await client.events(created.taskId, { afterSeq: 0 });
    assert.deepEqual(events.events.map((event) => event.type), [
      "task.created",
      "task.requirement.proposed",
      "task.run.started",
      "task.requirement.confirmed",
      "task.assignment.proposed"
    ]);
  } finally {
    client.disconnect();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("control plane starts without optional Douyin credentials", () => {
  assert.doesNotThrow(() => createControlPlaneHttpServer({ auth: false }));
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

test("cloud open-login does not block behind saved-session resume probing", async (t) => {
  let resumeCalls = 0;
  let openLoginCalls = 0;
  let openLoginOptions = null;
  const mcp = {
    configured: true,
    async openLogin(options) {
      openLoginCalls += 1;
      openLoginOptions = options;
      return { ok: true, view_page_url: "https://cloud.example/view/session" };
    }
  };
  const registry = {
    getService() { return mcp; },
    async status() {
      resumeCalls += 1;
      await new Promise(() => {});
    }
  };
  const server = createControlPlaneHttpServer({
    controlPlane: createControlPlane({ requirementService: testRequirementService() }),
    auth: false,
    douyinAgentCloudRegistry: registry
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const response = await fetch(`http://127.0.0.1:${server.address().port}/v1/douyin/mcp/open-login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ agentId: "mkt-cold-writer", force: true, wantQr: true })
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).view_page_url, "https://cloud.example/view/session");
  assert.equal(openLoginCalls, 1);
  assert.deepEqual(openLoginOptions, { force: true, wantQr: true });
  assert.equal(resumeCalls, 0);
});

test("cloud view-link reuses a cached credential without opening the remote login page", async (t) => {
  let openLoginCalls = 0;
  let cachedViewCalls = 0;
  const mcp = {
    configured: true,
    async openLogin() {
      openLoginCalls += 1;
      return { ok: true, view_page_url: "https://cloud.example/view/new" };
    },
    getCachedLoginView() {
      cachedViewCalls += 1;
      return { ok: true, view_page_url: "https://cloud.example/view/cached" };
    }
  };
  const registry = { getService() { return mcp; } };
  const server = createControlPlaneHttpServer({
    controlPlane: createControlPlane({ requirementService: testRequirementService() }),
    auth: false,
    douyinAgentCloudRegistry: registry
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());

  const response = await fetch(`http://127.0.0.1:${server.address().port}/v1/douyin/mcp/view-link?agentId=mkt-dm-inbox`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).view_page_url, "https://cloud.example/view/cached");
  assert.equal(cachedViewCalls, 1);
  assert.equal(openLoginCalls, 0);
});

test("cloud view-link silently renews a missing viewer credential for the saved Agent session", async (t) => {
  let openLoginCalls = 0;
  let refreshViewCalls = 0;
  const mcp = {
    configured: true,
    async openLogin() {
      openLoginCalls += 1;
      return { ok: true, view_page_url: "https://cloud.example/view/interactive" };
    },
    getCachedLoginView() {
      return { ok: false, error: { code: "DOUYIN_VIEW_LINK_MISSING", message: "missing" } };
    },
    async refreshLoginView() {
      refreshViewCalls += 1;
      return { ok: true, view_page_url: "https://cloud.example/view/refreshed" };
    }
  };
  const registry = { getService() { return mcp; } };
  const server = createControlPlaneHttpServer({
    controlPlane: createControlPlane({ requirementService: testRequirementService() }),
    auth: false,
    douyinAgentCloudRegistry: registry
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());

  const response = await fetch(`http://127.0.0.1:${server.address().port}/v1/douyin/mcp/view-link?agentId=mkt-comment-acquisition`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).view_page_url, "https://cloud.example/view/refreshed");
  assert.equal(refreshViewCalls, 1);
  assert.equal(openLoginCalls, 0);
});

test("cloud view-link explicitly refreshes a valid viewer credential through the saved Agent session", async (t) => {
  let cachedViewCalls = 0;
  let refreshViewCalls = 0;
  const mcp = {
    configured: true,
    getCachedLoginView() {
      cachedViewCalls += 1;
      return { ok: true, view_page_url: "https://cloud.example/view/cached" };
    },
    async refreshLoginView() {
      refreshViewCalls += 1;
      return { ok: true, view_page_url: "https://cloud.example/view/refreshed" };
    }
  };
  const registry = { getService() { return mcp; } };
  const server = createControlPlaneHttpServer({
    controlPlane: createControlPlane({ requirementService: testRequirementService() }),
    auth: false,
    douyinAgentCloudRegistry: registry
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());

  const response = await fetch(`http://127.0.0.1:${server.address().port}/v1/douyin/mcp/view-link?agentId=mkt-comment-acquisition&refresh=1`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).view_page_url, "https://cloud.example/view/refreshed");
  assert.equal(refreshViewCalls, 1);
  assert.equal(cachedViewCalls, 0);
});

test("explicit cloud login check is the only route that requests browser verification", async (t) => {
  const calls = [];
  const mcp = {
    configured: true,
    async checkLoginStatus({ reqId }) {
      calls.push(reqId);
      return { ok: true, login_state: "logged_in", account: { nickname: "已登录账号" } };
    }
  };
  const registry = { getService() { return mcp; } };
  const server = createControlPlaneHttpServer({
    controlPlane: createControlPlane({ requirementService: testRequirementService() }),
    auth: false,
    douyinAgentCloudRegistry: registry
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());

  const response = await fetch(`http://127.0.0.1:${server.address().port}/v1/douyin/mcp/check-login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ agentId: "mkt-dm-inbox", reqId: "manual-check-1" })
  });

  assert.equal(response.status, 200);
  assert.equal((await response.json()).login_state, "logged_in");
  assert.deepEqual(calls, ["manual-check-1"]);
});
