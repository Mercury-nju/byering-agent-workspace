import assert from "node:assert/strict";
import test from "node:test";
import { createControlPlane, ControlPlaneError } from "../backend/control-plane.js";
import { createControlPlaneHttpServer } from "../backend/http-server.js";

function fixture() {
  let sequence = 0;
  return createControlPlane({
    idFactory: () => `fixture-${++sequence}`,
    now: () => "2026-08-19T00:00:00.000Z",
    requirementService: {
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
    }
  });
}

test("task.create is authoritative and idempotent", () => {
  const plane = fixture();
  const input = {
    type: "task.create",
    commandId: "cmd-create",
    idempotencyKey: "idem-create",
    payload: { goal: "找出适合触达的潜在客户" }
  };
  const first = plane.dispatch(input);
  const replay = plane.dispatch(input);
  assert.deepEqual(replay, first);
  assert.equal(first.accepted, true);
  assert.equal(first.state, "CREATED");
  assert.equal(first.currentVersion, 0);
  assert.equal(first.currentSeq, 1);
  assert.equal(plane.getTaskSnapshot(first.taskId).goal, "找出适合触达的潜在客户");

  assert.throws(() => plane.dispatch({
    ...input,
    payload: { goal: "不同目标" }
  }), (error) => error instanceof ControlPlaneError && error.code === "IDEMPOTENCY_CONFLICT");
});

test("chief reads and summarizes real Agent result records", async () => {
  const plane = createControlPlane({
    now: () => "2026-09-16T10:00:00.000Z",
    chiefDataProvider: async ({ tenantId }) => {
      assert.equal(tenantId, "tenant-a");
      return [{
        taskId: "result-task-1",
        taskRunId: "result-run-1",
        agentId: "mkt-find-people",
        agentName: "找客专员",
        status: "completed",
        updatedAt: "2026-09-15T08:00:00.000Z",
        resultSnapshot: {
          generatedAt: "2026-09-15T08:00:00.000Z",
          summary: "已保留候选客户和来源证据",
          counts: { candidates: 12, qualified: 5 },
          evidence: [{ id: "e-1" }]
        }
      }];
    }
  });

  const result = await plane.decideChiefMessage({
    message: "昨天每个 Agent 产生了什么数据？",
    context: { tenantId: "tenant-a" }
  });

  assert.equal(result.decision.intent, "data_query");
  assert.equal(result.decision.responseMode, "result_card");
  assert.equal(result.shouldCreateTask, false);
  assert.equal(result.chiefData.agentCount, 1);
  assert.deepEqual(result.chiefData.agents[0].counts, { candidates: 12, qualified: 5 });
  assert.match(result.message, /找客专员/);
  assert.match(result.message, /候选客户 12/);
});

test("managed runtimes cannot silently replace a supplied terminal task id", () => {
  const plane = fixture();
  const managed = plane.ensureManagedRuntimeTask({
    taskId: "managed-terminal",
    taskRunId: "managed-run",
    agentId: "mkt-dm-inbox",
    tenantId: "tenant-a",
    goal: "持续承接私信"
  });
  plane.ingestExecutionEvents({
    taskId: managed.taskId,
    tenantId: "tenant-a",
    source: "test",
    events: [{
      eventId: "managed-terminal-complete",
      type: "task.completed",
      payload: { resultSnapshot: { status: "completed" } }
    }]
  });
  assert.equal(plane.getTaskSnapshot(managed.taskId).state, "SUCCEEDED");
  assert.deepEqual(plane.listTaskSnapshots({ includeTerminal: false }), []);
  assert.throws(() => plane.ensureManagedRuntimeTask({
    taskId: managed.taskId,
    agentId: "mkt-dm-inbox",
    tenantId: "tenant-a",
    goal: "持续承接私信"
  }), (error) => error instanceof ControlPlaneError && error.code === "MANAGED_RUNTIME_TASK_NOT_RUNNING");
});

test("task start, events, subscription, and snapshot stay in one ordered log", async () => {
  const plane = fixture();
  const created = await plane.dispatchAsync({ type: "task.create", payload: { goal: "分析线索" } });
  const observed = [];
  const unsubscribe = plane.subscribe(created.taskId, (event) => observed.push(event));

  const primed = plane.dispatch({
    type: "task.run.start",
    taskId: created.taskId,
    expectedVersion: created.currentVersion,
    payload: { requirementsConfirmed: false }
  });
  const started = plane.dispatch({
    type: "task.requirement.confirm",
    taskId: created.taskId,
    expectedVersion: primed.currentVersion,
    payload: { proposalVersion: created.data.requirement.proposalVersion }
  });
  unsubscribe();
  assert.equal(started.state, "RUNNING");
  assert.equal(started.currentVersion, 2);
  assert.equal(observed.length, 3);
  assert.equal(observed[0].type, "task.run.started");
  assert.equal(observed[0].seq, 3);
  assert.equal(observed[1].type, "task.requirement.confirmed");
  assert.equal(observed[1].seq, 4);
  assert.equal(observed[2].type, "task.assignment.proposed");
  assert.equal(observed[2].seq, 5);
  assert.equal(Object.isFrozen(observed[0]), false, "listeners receive a safe copy");

  const snapshot = plane.getTaskSnapshot(created.taskId);
  assert.equal(snapshot.state, "RUNNING");
  assert.equal(snapshot.currentSeq, 5);
  assert.deepEqual(plane.listTaskEvents(created.taskId, { afterSeq: 2 }).map((event) => event.seq), [3, 4, 5]);
});

test("a direct product Agent request blocks the task when its capability does not match", async () => {
  const plane = fixture();
  const created = await plane.dispatchAsync({
    type: "task.create",
    agentId: "mkt-intent-analyst",
    payload: { goal: "找一批新能源车潜客，只使用公开信息，不执行触达" }
  });
  const primed = plane.dispatch({
    type: "task.start",
    taskId: created.taskId,
    expectedVersion: created.currentVersion,
    payload: { requirementsConfirmed: false }
  });
  const confirmed = plane.dispatch({
    type: "task.requirement.confirm",
    taskId: created.taskId,
    expectedVersion: primed.currentVersion,
    payload: { proposalVersion: created.data.requirement.proposalVersion }
  });

  assert.equal(confirmed.state, "BLOCKED");
  assert.equal(confirmed.data.assignment.status, "BLOCKED");
  assert.deepEqual(confirmed.data.assignment.incompatibleCapabilities, ["douyin_account_discovery"]);
  assert.equal(confirmed.data.workflow.productRoute, "requested_product_incompatible");
  assert.equal(confirmed.data.workflow.orchestratorAgentId, "chief_of_staff");
  const snapshot = plane.getTaskSnapshot(created.taskId);
  assert.equal(snapshot.state, "BLOCKED");
  assert.equal(snapshot.accessRequest.status, "BLOCKED");
  assert.ok(plane.listTaskEvents(created.taskId).some((event) => event.type === "task.blocked"));
});

test("plan-only chief requirements complete with a structured plan and no external execution", async () => {
  let sequence = 0;
  let dispatchCalls = 0;
  const plane = createControlPlane({
    idFactory: () => `plan-${++sequence}`,
    now: () => "2026-09-06T12:00:00.000Z",
    requirementService: {
      async understand({ goal }) {
        return {
          schemaVersion: 1,
          source: "test",
          provider: "test",
          model: "fixture",
          generatedAt: "2026-09-06T12:00:00.000Z",
          title: "本周抖音潜客筛选计划",
          objective: goal,
          scope: "仅输出任务拆解、Agent 分工和验收标准，不读取数据",
          deliverable: "可执行计划",
          guardrail: "不搜索账号，不发送消息",
          missing: [],
          assumptions: [],
          confidence: 1,
          touchPlan: { action: "只做规划，不执行数据采集" }
        };
      }
    },
    taskDispatcher: {
      assertReadyFor() {},
      shouldDispatch() { return false; },
      async dispatch() { dispatchCalls += 1; return { dispatched: true }; }
    }
  });

  const created = await plane.dispatchAsync({ type: "task.create", payload: { goal: "制定本周抖音获客执行计划" } });
  const primed = plane.dispatch({
    type: "task.start",
    taskId: created.taskId,
    expectedVersion: created.currentVersion,
    payload: { requirementsConfirmed: false }
  });
  const confirmed = await plane.dispatchAsync({
    type: "task.requirement.confirm",
    taskId: created.taskId,
    expectedVersion: primed.currentVersion,
    payload: { proposalVersion: created.data.requirement.proposalVersion }
  });

  assert.equal(confirmed.state, "SUCCEEDED");
  assert.equal(dispatchCalls, 0);
  const snapshot = plane.getTaskSnapshot(created.taskId);
  assert.equal(snapshot.workflow.id, "plan_only");
  assert.equal(snapshot.assignment.assignments.length, 1);
  assert.equal(snapshot.assignment.assignments[0].agentId, "chief_of_staff");
  assert.equal(snapshot.resultSnapshot.type, "execution_plan");
  assert.equal(snapshot.resultSnapshot.source, "chief_of_staff");
  assert.deepEqual(snapshot.resultSnapshot.plan.map((item) => item.agentId), [
    "chief_of_staff",
    "acquisition_strategist",
    "lead_miner",
    "lead_analyst",
    "prospect_researcher",
    "risk_specialist"
  ]);
  assert.ok(snapshot.resultSnapshot.plan.every((item) => item.plannedOnly === true));
  assert.match(snapshot.resultSnapshot.summary, /方案/);
  assert.deepEqual(plane.listTaskEvents(created.taskId).slice(-2).map((event) => event.type), [
    "task.result.snapshot.updated",
    "task.completed"
  ]);
});

test("task start cannot bypass the persisted requirement confirmation", () => {
  const plane = fixture();
  const created = plane.dispatch({ type: "task.create", payload: { goal: "不能绕过需求确认" } });

  assert.throws(
    () => plane.dispatch({
      type: "task.run.start",
      taskId: created.taskId,
      expectedVersion: 0,
      payload: { requirementsConfirmed: true }
    }),
    (error) => error instanceof ControlPlaneError && error.code === "REQUIREMENT_CONFIRMATION_REQUIRED"
  );
  assert.equal(plane.getTaskSnapshot(created.taskId).state, "CREATED");
  assert.equal(plane.getTaskSnapshot(created.taskId).version, 0);
  assert.deepEqual(plane.listTaskEvents(created.taskId).map((event) => event.type), ["task.created"]);
});

test("optimistic version check rejects stale task commands without mutating state", async () => {
  const plane = fixture();
  const created = await plane.dispatchAsync({ type: "task.create", payload: { goal: "检查版本" } });
  const primed = plane.dispatch({ type: "task.start", taskId: created.taskId, expectedVersion: created.currentVersion, payload: { requirementsConfirmed: false } });
  plane.dispatch({ type: "task.requirement.confirm", taskId: created.taskId, expectedVersion: primed.currentVersion, payload: { proposalVersion: created.data.requirement.proposalVersion } });

  assert.throws(() => plane.dispatch({
    type: "task.pause",
    taskId: created.taskId,
    expectedVersion: 1
  }), (error) => error instanceof ControlPlaneError && error.code === "STALE_TASK_VERSION");
  assert.equal(plane.getTaskSnapshot(created.taskId).state, "RUNNING");
  assert.equal(plane.getTaskSnapshot(created.taskId).version, 2);
});

test("live configuration updates persist only future strategy changes and emit a canonical event", async () => {
  const plane = fixture();
  const created = await plane.dispatchAsync({ type: "task.create", payload: { goal: "运行中的获客任务" } });
  const primed = plane.dispatch({
    type: "task.start",
    taskId: created.taskId,
    expectedVersion: created.currentVersion,
    payload: { requirementsConfirmed: false }
  });
  const started = await plane.dispatchAsync({
    type: "task.requirement.confirm",
    taskId: created.taskId,
    expectedVersion: primed.currentVersion,
    payload: { proposalVersion: created.data.requirement.proposalVersion }
  });

  const updated = plane.dispatch({
    type: "task.strategy.update",
    taskId: created.taskId,
    expectedVersion: started.currentVersion,
    payload: {
      baseConfigVersion: 1,
      configVersion: 2,
      effectiveScope: "future_only",
      changes: {
        strategy: { intentSignals: ["价格"], filters: { industries: ["汽车"], minFollowers: 1000 } },
        touchContent: { message: "测试" },
        frequency: { maxPerDay: 5, intervalSeconds: 120 }
      }
    }
  });

  assert.equal(updated.state, "RUNNING");
  assert.equal(updated.currentVersion, started.currentVersion + 1);
  const snapshot = plane.getTaskSnapshot(created.taskId);
  assert.equal(snapshot.configuration.version, 2);
  assert.deepEqual(snapshot.configuration.findingStrategy.intentSignals, ["价格"]);
  assert.deepEqual(snapshot.configuration.findingStrategy.filters, { industries: ["汽车"], minFollowers: 1000 });
  assert.equal(snapshot.configuration.frequency.intervalSeconds, 120);
  assert.equal(snapshot.configuration.touchContent.message, "测试");
  const event = plane.listTaskEvents(created.taskId).at(-1);
  assert.equal(event.type, "task.config.updated");
  assert.equal(event.payload.effectiveScope, "future_only");
  assert.equal(event.payload.configurationVersion, 2);
  assert.deepEqual(event.payload.updatedSections, ["touchContent", "frequency", "findingStrategy"]);

  assert.throws(() => plane.dispatch({
    type: "task.config.update",
    taskId: created.taskId,
    expectedVersion: updated.currentVersion,
    payload: {
      baseConfigVersion: 1,
      configVersion: 2,
      effectiveScope: "future_only",
      changes: { touchContent: "过期修改" }
    }
  }), (error) => error instanceof ControlPlaneError && error.code === "STALE_CONFIGURATION_VERSION");

  assert.throws(() => plane.dispatch({
    type: "task.config.update",
    taskId: created.taskId,
    expectedVersion: updated.currentVersion,
    payload: {
      baseConfigVersion: 2,
      configVersion: 3,
      effectiveScope: "future_only",
      changes: { approvalMode: "auto" }
    }
  }), (error) => error instanceof ControlPlaneError && error.code === "CONFIG_UPDATE_CONFIRMATION_REQUIRED");

  assert.throws(() => plane.dispatch({
    type: "task.config.update",
    taskId: created.taskId,
    expectedVersion: updated.currentVersion,
    payload: {
      baseConfigVersion: 2,
      configVersion: 3,
      effectiveScope: "future_only",
      changes: { frequency: { maxPerDay: 20 } }
    }
  }), (error) => error instanceof ControlPlaneError && error.code === "CONFIG_UPDATE_CONFIRMATION_REQUIRED");

  const paused = plane.dispatch({
    type: "task.pause",
    taskId: created.taskId,
    expectedVersion: updated.currentVersion
  });
  const pausedUpdate = plane.dispatch({
    type: "task.config.update",
    taskId: created.taskId,
    expectedVersion: paused.currentVersion,
    payload: {
      baseConfigVersion: 2,
      configVersion: 3,
      effectiveScope: "future_only",
      changes: { approvalMode: "auto" },
      confirmation: { confirmed: true }
    }
  });
  assert.equal(pausedUpdate.state, "PAUSED");
  assert.equal(plane.getTaskSnapshot(created.taskId).configuration.version, 3);

  const touchOnlyUpdate = plane.dispatch({
    type: "task.touch_content.update",
    taskId: created.taskId,
    expectedVersion: pausedUpdate.currentVersion,
    payload: {
      baseConfigVersion: 3,
      configVersion: 4,
      effectiveScope: "future_only",
      changes: { touchContent: { message: "仅更新触达文案" } }
    }
  });
  assert.equal(touchOnlyUpdate.state, "PAUSED");
  const touchOnlySnapshot = plane.getTaskSnapshot(created.taskId);
  assert.equal(touchOnlySnapshot.configuration.version, 4);
  assert.equal(touchOnlySnapshot.configuration.touchContent.message, "仅更新触达文案");
  assert.deepEqual(touchOnlySnapshot.configuration.findingStrategy.filters, { industries: ["汽车"], minFollowers: 1000 });
  assert.equal(touchOnlySnapshot.configuration.frequency.intervalSeconds, 120);
});

test("external terminal events use the control-plane state transition", async () => {
  const plane = fixture();
  const created = await plane.dispatchAsync({ type: "task.create", payload: { goal: "禁止外部伪造终态" } });
  plane.dispatch({
    type: "task.start",
    taskId: created.taskId,
    expectedVersion: created.currentVersion,
    payload: { requirementsConfirmed: false }
  });
  const confirmed = await plane.dispatchAsync({
    type: "task.requirement.confirm",
    taskId: created.taskId,
    expectedVersion: 1,
    payload: { proposalVersion: created.data.requirement.proposalVersion, requiresAccess: false }
  });
  assert.equal(confirmed.state, "RUNNING");

  const result = plane.ingestExecutionEvents({
    taskId: created.taskId,
    events: [{
      eventId: "external-completed",
      type: "task.completed",
      payload: { resultSnapshot: { metrics: [], source: "cluehunter" }, text: "已完成" }
    }]
  });
  assert.equal(result.acceptedCount, 1);
  const after = plane.getTaskSnapshot(created.taskId);
  assert.equal(after.state, "SUCCEEDED");
  assert.equal(after.version, 3);
  assert.equal(after.resultSnapshot.source, "cluehunter");
  assert.equal(plane.listTaskEvents(created.taskId).at(-1).type, "task.completed");

  assert.throws(
    () => plane.ingestExecutionEvents({
      taskId: created.taskId,
      events: [{ eventId: "external-unknown", type: "made.up.event", payload: {} }]
    }),
    (error) => error instanceof ControlPlaneError && error.code === "EXECUTION_EVENT_TYPE_UNSUPPORTED"
  );
});

test("a final first-outreach receipt updates the candidate and completes the single outreach task", async () => {
  const plane = fixture();
  const created = await plane.dispatchAsync({
    type: "task.create",
    payload: { goal: "核验外部任务回执" }
  });
  const started = plane.dispatch({
    type: "task.start",
    taskId: created.taskId,
    expectedVersion: created.currentVersion,
    payload: { requirementsConfirmed: false }
  });
  const confirmed = await plane.dispatchAsync({
    type: "task.requirement.confirm",
    taskId: created.taskId,
    expectedVersion: started.currentVersion,
    payload: { proposalVersion: created.data.requirement.proposalVersion, requiresAccess: false }
  });
  assert.equal(confirmed.state, "RUNNING");

  const pendingSnapshot = {
    type: "single_outreach",
    approvalQueue: [{
      id: "outreach:lead-1",
      state: "pending",
      lead: { id: "lead-1", secUid: "sec-1", nickname: "上海周先生" },
      content: "你好，想了解一下你的购车计划。",
      requestId: "request-1",
      commandId: "rpa-command-1",
      receipt: { state: "pending", reqId: "request-1", commandId: "rpa-command-1", receiptPending: true }
    }]
  };
  plane.ingestExecutionEvents({
    taskId: created.taskId,
    events: [{
      eventId: "outreach-pending-snapshot",
      type: "task.result.snapshot.updated",
      agentId: "mkt-cold-writer",
      payload: { resultSnapshot: pendingSnapshot }
    }]
  });

  plane.ingestExecutionEvents({
    taskId: created.taskId,
    events: [{
      eventId: "outreach-final-receipt",
      type: "outreach.sent",
      agentId: "mkt-cold-writer",
      payload: {
        deliveryState: "sent",
        messageId: "message-1",
        commandId: "rpa-command-1"
      }
    }]
  });

  const after = plane.getTaskSnapshot(created.taskId);
  assert.equal(after.state, "SUCCEEDED");
  assert.equal(after.resultSnapshot.approvalQueue[0].state, "sent");
  assert.equal(after.resultSnapshot.approvalQueue[0].receipt.messageId, "message-1");
  assert.equal(after.resultSnapshot.approvalQueue[0].lead.nickname, "上海周先生");
  assert.ok(plane.listTaskEvents(created.taskId).some((event) => event.type === "task.completed"));
});

test("resolved account identity is accepted as a durable workflow fact", async () => {
  const plane = fixture();
  const created = await plane.dispatchAsync({ type: "task.create", payload: { goal: "解析目标账号" } });

  const result = plane.ingestExecutionEvents({
    taskId: created.taskId,
    events: [{
      eventId: "external-account-resolved",
      type: "account.resolved",
      agentId: "acquisition_strategist",
      payload: {
        account: { uid: "u-1", secId: "sec-1", uniqueId: "huanglaoban" },
        source: "account_resolver"
      }
    }]
  });

  assert.equal(result.acceptedCount, 1);
  const event = plane.listTaskEvents(created.taskId).at(-1);
  assert.equal(event.type, "account.resolved");
  assert.equal(event.agentId, "acquisition_strategist");
  assert.equal(event.skillId, "account_resolution");
  assert.equal(event.payload.account.secId, "sec-1");
});

test("task creation persists structured account references for acquisition strategist", () => {
  const plane = createControlPlane({ idFactory: () => "structured-account" });
  const ack = plane.dispatch({
    type: "task.create",
    payload: {
      goal: "分析这个账号的视频和评论",
      accountName: "广州黄老板二手车",
      uniqueId: "89254962461",
      profileUrl: "https://www.douyin.com/user/example"
    }
  });
  const snapshot = plane.getTaskSnapshot(ack.taskId);
  assert.equal(snapshot.executionContext.accountName, "广州黄老板二手车");
  assert.equal(snapshot.executionContext.uniqueId, "89254962461");
  assert.equal(snapshot.executionContext.profileUrl, "https://www.douyin.com/user/example");
});

test("task creation strips listener schedules from the initial product Agent execution configuration", () => {
  const plane = fixture();
  const created = plane.dispatch({
    type: "task.create",
    agentId: "mkt-comment-acquisition",
    payload: {
      goal: "持续寻找购车意向客户",
      accountId: "douyin-account-1",
      config: {
        sourceScope: { kind: "authorized_account_interactions" },
        audienceRules: { goal: "近期明确询价的人" },
        workWindow: { timeWindow: "09:00-21:00" }
      }
    }
  });
  const snapshot = plane.getTaskSnapshot(created.taskId);
  assert.deepEqual(snapshot.configuration.executionConfig, {
    sourceScope: { kind: "authorized_account_interactions" },
    audienceRules: { goal: "近期明确询价的人" },
    workWindow: {}
  });
  assert.equal(Object.hasOwn(snapshot.configuration, "timeWindow"), false);
});

test("native HTTP control plane exposes create, start, snapshot, and event polling", async (t) => {
  const server = createControlPlaneHttpServer({ controlPlane: fixture() });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, options) => fetch(`${base}${path}`, {
    headers: { "content-type": "application/json" },
    ...options
  });

  const createdResponse = await request("/v1/tasks", {
    method: "POST",
    body: JSON.stringify({ goal: "通过 HTTP 创建任务" })
  });
  assert.equal(createdResponse.status, 202);
  const created = await createdResponse.json();
  assert.equal(created.state, "CREATED");

  const primedResponse = await request(`/v1/tasks/${created.taskId}/start`, {
    method: "POST",
    body: JSON.stringify({ requirementsConfirmed: false })
  });
  assert.equal(primedResponse.status, 202);
  const primed = await primedResponse.json();
  assert.equal(primed.state, "WAITING_REQUIREMENT");

  const confirmedResponse = await request("/v1/commands", {
    method: "POST",
    body: JSON.stringify({
      type: "task.requirement.confirm",
      taskId: created.taskId,
      expectedVersion: primed.currentVersion,
      payload: { proposalVersion: created.data.requirement.proposalVersion }
    })
  });
  assert.equal(confirmedResponse.status, 202);
  assert.equal((await confirmedResponse.json()).state, "RUNNING");

  const snapshotResponse = await request(`/v1/tasks/${created.taskId}`);
  assert.equal(snapshotResponse.status, 200);
  assert.equal((await snapshotResponse.json()).state, "RUNNING");

  const eventsResponse = await request(`/v1/tasks/${created.taskId}/events?afterSeq=1`);
  assert.equal(eventsResponse.status, 200);
  const events = await eventsResponse.json();
  assert.deepEqual(events.events.map((event) => event.seq), [2, 3, 4, 5]);

  const invalidResponse = await request("/v1/tasks", {
    method: "POST",
    body: JSON.stringify({})
  });
  assert.equal(invalidResponse.status, 400);
  assert.equal((await invalidResponse.json()).error.code, "TASK_GOAL_REQUIRED");
});

test("decision-aware low-risk public discovery confirms and dispatches without impersonating a product Agent", async () => {
  let sequence = 0;
  const dispatched = [];
  const plane = createControlPlane({
    idFactory: () => `auto-${++sequence}`,
    now: () => "2026-09-06T00:00:00.000Z",
    requirementService: {
      async understand({ goal }) {
        return {
          schemaVersion: 1,
          source: "test",
          provider: "test",
          model: "fixture",
          generatedAt: "2026-09-06T00:00:00.000Z",
          title: "公开账号筛选",
          objective: goal,
          scope: "仅搜索公开账号资料",
          deliverable: "候选账号名单和匹配依据",
          guardrail: "不登录账号，不发送消息",
          missing: [],
          assumptions: [],
          confidence: 1,
          intent: "task",
          riskLevel: "low",
          requiredCapabilities: ["douyin_account_discovery"],
          blockingMissing: []
        };
      }
    },
    taskDispatcher: {
      assertReadyFor() {},
      shouldDispatch({ ack }) { return ack?.state === "RUNNING"; },
      executionTarget({ task }) {
        const step = task.assignment?.execution?.steps?.find((candidate) => candidate.status === "PENDING");
        return step ? {
          mode: "assignment_step",
          stepId: step.id,
          agentId: step.agentId,
          taskRunId: step.taskRunId,
          parentTaskId: task.taskId,
          parentTaskRunId: task.taskRunId
        } : null;
      },
      async dispatch(input) {
        dispatched.push(input);
        return { dispatched: true, source: "prospect" };
      }
    }
  });

  const created = await plane.dispatchAsync({
    type: "task.create",
    agentId: "chief_of_staff",
    payload: { goal: "帮我找近期 AI 科普类博主粉丝增长最快的人" }
  });
  const started = await plane.dispatchAsync({
    type: "task.run.start",
    taskId: created.taskId,
    expectedVersion: created.currentVersion,
    payload: { planVersion: 1, requirementsConfirmed: false, autoConfirmLowRisk: true }
  });

  assert.equal(started.state, "RUNNING");
  assert.equal(plane.getTaskSnapshot(created.taskId).requirements.status, "CONFIRMED");
  assert.equal(plane.getTaskSnapshot(created.taskId).workflow.id, "find_only");
  assert.equal(plane.getTaskSnapshot(created.taskId).workflow.executionBoundary, "legacy_public_discovery");
  assert.equal(plane.getTaskSnapshot(created.taskId).workflow.productRoute, undefined);
  assert.deepEqual(
    plane.getTaskSnapshot(created.taskId).assignment.assignments.map((item) => item.executionRole),
    ["coordination", "specialist", "specialist", "specialist", "specialist", "specialist"]
  );
  assert.deepEqual(
    plane.listTaskEvents(created.taskId).map((event) => event.type),
    ["task.created", "task.requirement.proposed", "task.run.started", "task.requirement.confirmed", "task.assignment.proposed", "task.execution.dispatched"]
  );
  assert.equal(dispatched.length, 1);
  assert.equal(dispatched[0].executionTarget, undefined);
  const snapshot = plane.getTaskSnapshot(created.taskId);
  assert.deepEqual(snapshot.assignment.execution.steps, []);
});

test("chief account-bound orchestration waits for browser authorization before executing product Agents", async () => {
  let sequence = 0;
  const dispatched = [];
  const plane = createControlPlane({
    idFactory: () => `sequence-${++sequence}`,
    now: () => "2026-09-12T09:00:00.000Z",
    requirementService: {
      async understand({ goal }) {
        return {
          schemaVersion: 1,
          source: "test",
          provider: "test",
          model: "fixture",
          generatedAt: "2026-09-12T09:00:00.000Z",
          title: "抖音潜客筛选与分析",
          objective: goal,
          scope: "需要连接已授权抖音账号后读取直播间、评论与互动",
          deliverable: "候选名单与分析结论",
          guardrail: "仅分析，不发送消息",
          missing: [],
          assumptions: [],
          confidence: 1,
          intent: "task",
          riskLevel: "low",
          requiredCapabilities: ["douyin_account_discovery", "douyin_comment_analysis"],
          blockingMissing: []
        };
      }
    },
    taskDispatcher: {
      assertReadyFor() {},
      shouldDispatch({ ack }) { return ack?.state === "RUNNING"; },
      async dispatch(input) {
        dispatched.push(input);
        return { dispatched: true, source: "test-executor" };
      }
    }
  });

  const created = await plane.dispatchAsync({
    type: "task.create",
    agentId: "chief_of_staff",
    payload: { goal: "在已授权抖音账号中找人并完成意向分析" }
  });
  const started = await plane.dispatchAsync({
    type: "task.run.start",
    taskId: created.taskId,
    expectedVersion: created.currentVersion,
    payload: { planVersion: 1, requirementsConfirmed: false, autoConfirmLowRisk: true }
  });
  assert.equal(started.state, "WAITING_ACCESS");
  assert.equal(plane.getTaskSnapshot(created.taskId).workflow.executionBoundary, "product_agents");
  assert.deepEqual(
    plane.getTaskSnapshot(created.taskId).assignment.execution.steps.map((step) => step.agentId),
    ["mkt-find-people", "mkt-intent-analyst"]
  );
  assert.equal(dispatched.length, 0);
});

test("decision-aware start still waits when a blocking requirement is missing", async () => {
  let sequence = 0;
  const plane = createControlPlane({
    idFactory: () => `blocked-${++sequence}`,
    now: () => "2026-09-06T00:00:00.000Z",
    requirementService: {
      async understand({ goal }) {
        return {
          schemaVersion: 1,
          source: "test",
          provider: "test",
          model: "fixture",
          generatedAt: "2026-09-06T00:00:00.000Z",
          title: "账号触达",
          objective: goal,
          scope: "指定对象",
          deliverable: "发送结果",
          guardrail: "仅发送已确认内容",
          missing: ["触达账号"],
          assumptions: [],
          confidence: 0.7,
          intent: "task",
          riskLevel: "bounded_external",
          requiredCapabilities: ["douyin_private_outreach"],
          blockingMissing: ["触达账号"]
        };
      }
    }
  });

  const created = await plane.dispatchAsync({ type: "task.create", payload: { goal: "给这些用户发送私信" } });
  const started = plane.dispatch({
    type: "task.run.start",
    taskId: created.taskId,
    expectedVersion: created.currentVersion,
    payload: { planVersion: 1, requirementsConfirmed: false, autoConfirmLowRisk: true }
  });

  assert.equal(started.state, "WAITING_REQUIREMENT");
  assert.equal(plane.getTaskSnapshot(created.taskId).requirements.status, "PROPOSED");
  assert.equal(plane.getTaskSnapshot(created.taskId).assignment, null);
});

test("chief message decision is a deterministic global concierge and never creates a task", async () => {
  let calls = 0;
  const plane = createControlPlane({
    now: () => "2026-09-06T00:00:00.000Z",
    requirementService: {
      async understand({ goal }) {
        calls += 1;
        const conversation = goal === "你能做什么？";
        return {
          schemaVersion: 1,
          source: "test",
          provider: "test",
          model: "fixture",
          generatedAt: "2026-09-06T00:00:00.000Z",
          title: conversation ? "能力说明" : "公开账号筛选",
          objective: goal,
          scope: conversation ? "回答当前问题" : "公开资料",
          deliverable: conversation ? "直接答复" : "候选名单",
          guardrail: "不编造执行结果",
          missing: [],
          assumptions: [],
          confidence: 1,
          intent: conversation ? "conversation" : "task",
          riskLevel: "low",
          requiredCapabilities: conversation ? [] : ["douyin_account_discovery"],
          blockingMissing: [],
          userMessage: conversation ? "我负责理解目标、安排合适的 Agent、跟进执行并汇总结论。" : "我会安排抖音找人专家开始筛选。"
        };
      }
    }
  });

  const conversation = await plane.decideChiefMessage({ message: "你能做什么？" });
  assert.equal(conversation.decision.intent, "conversation");
  assert.equal(conversation.shouldCreateTask, false);
  assert.equal(conversation.decisionId, null);
  assert.match(conversation.message, /全局运营管家/);
  assert.match(conversation.message, /不拆分、派发、启动或控制任务/);

  const routedTask = await plane.decideChiefMessage({ message: "帮我找近期 AI 科普类博主粉丝增长最快的人" });
  assert.equal(routedTask.decision.intent, "conversation");
  assert.equal(routedTask.shouldCreateTask, false);
  assert.equal(routedTask.decisionId, null);
  assert.match(routedTask.message, /不创建、派发、启动或控制任务/);

  const control = await plane.decideChiefMessage({ message: "暂停当前任务" });
  assert.equal(control.decision.intent, "conversation");
  assert.equal(control.shouldCreateTask, false);
  assert.match(control.message, /不提供暂停、继续、取消或重试/);

  const finderGuidance = await plane.decideChiefMessage({ message: "找客专员能做什么？" });
  assert.equal(finderGuidance.decision.intent, "conversation");
  assert.equal(finderGuidance.shouldCreateTask, false);
  assert.match(finderGuidance.message, /寻找候选客户请使用找客专员/);

  const inboxGuidance = await plane.decideChiefMessage({ message: "我想接待新私信" });
  assert.equal(inboxGuidance.decision.intent, "conversation");
  assert.equal(inboxGuidance.shouldCreateTask, false);
  assert.match(inboxGuidance.message, /承接新私信请使用私信客服/);

  const status = await plane.decideChiefMessage({ message: "查看所有 Agent 和任务状态" });
  assert.equal(status.decision.intent, "status_query");
  assert.equal(status.shouldCreateTask, false);
  assert.deepEqual(status.overview, { total: 0, running: 0, waiting: 0, blocked: 0, completed: 0, active: [] });
  assert.match(status.message, /当前任务总览/);

  plane.listTaskSnapshots = () => [{ taskId: "task-running", state: "RUNNING", goal: "核验新线索" }];
  const populatedStatus = await plane.decideChiefMessage({ message: "查看所有 Agent 和任务状态" });
  assert.equal(populatedStatus.overview.running, 1);
  assert.match(populatedStatus.message, /执行中 1 项/);
  assert.match(populatedStatus.message, /核验新线索（执行中）/);
  assert.equal(calls, 0, "the chief must not call requirement understanding for concierge messages");
});

test("chief message does not issue a reusable task decision for another tenant", async () => {
  const plane = createControlPlane({
    requirementService: {
      async understand({ goal }) {
        return {
          title: "公开账号筛选",
          objective: goal,
          scope: "公开资料",
          deliverable: "候选名单",
          guardrail: "不编造结果",
          missing: [],
          assumptions: [],
          confidence: 1,
          intent: "task",
          riskLevel: "low",
          requiredCapabilities: ["douyin_account_discovery"],
          blockingMissing: [],
          userMessage: "我会安排抖音找人专家开始筛选。"
        };
      }
    }
  });
  const goal = "帮我找近期 AI 科普类博主粉丝增长最快的人";
  const routed = await plane.decideChiefMessage({ message: goal, context: { tenantId: "tenant-a" } });
  assert.equal(routed.decisionId, null);
  assert.equal(routed.shouldCreateTask, false);
  assert.equal(plane.persistence.tasks.size, 0);
});

test("chief preserves a child Agent cancellation instead of rewriting it as failure", () => {
  const plane = createControlPlane({
    now: () => "2026-09-12T14:00:00.000Z",
    requirementService: null
  });
  plane.persistence.saveTask({
    taskId: "chief-cancelled-task",
    taskRunId: "chief-cancelled-run",
    conversationId: "chief-cancelled-conversation",
    goal: "持续寻找潜客",
    state: "RUNNING",
    version: 1,
    currentSeq: 0,
    agentId: "chief_of_staff",
    tenantId: null,
    createdAt: "2026-09-12T09:00:00.000Z",
    updatedAt: "2026-09-12T09:00:00.000Z",
    requirements: { confirmed: true, status: "CONFIRMED", proposal: {} },
    configuration: { version: 1 },
    executionContext: {},
    assignment: {
      status: "RUNNING",
      execution: {
        status: "RUNNING",
        startedAt: "2026-09-12T09:00:00.000Z",
        completedAt: null,
        steps: [{
          id: "step-1-mkt-find-people",
          index: 0,
          agentId: "mkt-find-people",
          agentName: "抖音找人管家",
          taskRunId: "chief-cancelled-run:step-1-mkt-find-people",
          dependsOn: [],
          status: "RUNNING",
          attempts: 1,
          startedAt: "2026-09-12T09:00:00.000Z",
          completedAt: null,
          failedAt: null
        }]
      }
    },
    pendingApproval: null,
    lastCommandId: "seed"
  });

  plane.ingestExecutionEvents({
    taskId: "chief-cancelled-task",
    events: [{
      eventId: "child-cancelled",
      type: "task.cancelled",
      taskId: "chief-cancelled-task",
      taskRunId: "chief-cancelled-run:step-1-mkt-find-people",
      agentId: "mkt-find-people",
      payload: { assignmentStepId: "step-1-mkt-find-people", reason: "USER_STOPPED" }
    }]
  });

  const snapshot = plane.getTaskSnapshot("chief-cancelled-task");
  assert.equal(snapshot.state, "CANCELLED");
  assert.equal(snapshot.assignment.status, "CANCELLED");
  assert.equal(snapshot.assignment.execution.status, "CANCELLED");
  assert.equal(snapshot.assignment.execution.steps[0].status, "CANCELLED");
});

test("a long-lived inbox runtime receives one server-owned running task before work begins", () => {
  let sequence = 0;
  const plane = createControlPlane({
    idFactory: () => `managed-${++sequence}`,
    now: () => "2026-09-12T14:00:00.000Z",
    requirementService: null
  });

  const first = plane.ensureManagedRuntimeTask({
    agentId: "mkt-dm-inbox",
    tenantId: "tenant-a",
    goal: "持续承接抖音新私信",
    executionContext: { accountId: "douyin-a", accountKey: "douyin-a", provider: "douyin" },
    configuration: { replyStyle: { tone: "自然、专业" } }
  });
  const repeated = plane.ensureManagedRuntimeTask({
    taskId: first.taskId,
    agentId: "mkt-dm-inbox",
    tenantId: "tenant-a",
    goal: "持续承接抖音新私信",
    executionContext: { accountId: "douyin-a", accountKey: "douyin-a", provider: "douyin" }
  });

  assert.equal(first.state, "RUNNING");
  assert.equal(repeated.taskId, first.taskId);
  assert.equal(plane.getTaskSnapshot(first.taskId).executionContext.accountId, "douyin-a");
  assert.equal(plane.getTaskSnapshot(first.taskId).configuration.replyStyle.tone, "自然、专业");
  assert.deepEqual(plane.listTaskEvents(first.taskId).map((event) => event.type), [
    "task.created",
    "task.requirement.confirmed",
    "task.run.started"
  ]);
});

test("unbounded task scans retain every matching task for scheduled reconciliation", () => {
  const plane = fixture();
  for (let index = 0; index < 501; index += 1) {
    plane.persistence.saveTask({
      taskId: `bulk-task-${index + 1}`,
      taskRunId: `bulk-run-${index + 1}`,
      conversationId: `bulk-conversation-${index + 1}`,
      agentId: "mkt-find-people",
      tenantId: "tenant-bulk",
      goal: "持续找人",
      state: "RUNNING",
      version: 0,
      currentSeq: 0,
      createdAt: "2026-09-12T14:00:00.000Z",
      updatedAt: "2026-09-12T14:00:00.000Z"
    });
  }

  assert.equal(plane.listTaskSnapshots({ tenantId: "tenant-bulk", limit: Infinity }).length, 501);
});

test("restart recovers a chief assignment step that started before dispatch was durably recorded", async () => {
  let sequence = 0;
  const dispatched = [];
  const plane = createControlPlane({
    idFactory: () => `recovery-${++sequence}`,
    now: () => "2026-09-12T10:00:00.000Z",
    requirementService: {
      async understand({ goal }) {
        return {
          schemaVersion: 1,
          source: "test",
          provider: "test",
          model: "fixture",
          generatedAt: "2026-09-12T10:00:00.000Z",
          title: "找人任务",
          objective: goal,
          scope: "公开抖音信息",
          deliverable: "候选名单",
          guardrail: "不发送消息",
          missing: [],
          assumptions: [],
          confidence: 1,
          intent: "task",
          riskLevel: "low",
          requiredCapabilities: ["douyin_account_discovery"],
          requestedAgentId: "mkt-find-people",
          blockingMissing: []
        };
      }
    },
    browserWorkspace: {
      async authorize(sessionId) {
        return {
          sessionId,
          state: "READY",
          provider: "douyin",
          accountKey: "account-recovery",
          executorUid: "robot-recovery"
        };
      }
    },
    taskDispatcher: {
      assertReadyFor() {},
      shouldDispatch({ ack }) { return ack?.state === "RUNNING"; },
      async dispatch(input) {
        dispatched.push(input);
        return { dispatched: true, source: "test-executor" };
      }
    }
  });

  const created = await plane.dispatchAsync({
    type: "task.create",
    agentId: "chief_of_staff",
    payload: { goal: "从公开抖音互动中找潜在客户" }
  });
  const waitingAccess = await plane.dispatchAsync({
    type: "task.run.start",
    taskId: created.taskId,
    expectedVersion: created.currentVersion,
    payload: { planVersion: 1, requirementsConfirmed: false, autoConfirmLowRisk: true }
  });
  assert.equal(waitingAccess.state, "WAITING_ACCESS");
  const granted = await plane.dispatchAsync({
    type: "access.scope.confirm",
    taskId: created.taskId,
    expectedVersion: waitingAccess.currentVersion,
    payload: {
      browserSessionId: "browser-session-recovery",
      provider: "douyin",
      account: "account-recovery",
      scopes: ["read"]
    }
  });
  assert.equal(granted.state, "RUNNING");

  const interrupted = plane.persistence.loadTask(created.taskId);
  const step = interrupted.assignment.execution.steps[0];
  step.status = "RUNNING";
  step.startedAt = "2026-09-12T10:00:00.000Z";
  interrupted.assignment.execution.status = "RUNNING";
  plane.persistence.saveTask(interrupted);
  plane.persistence.events.set(created.taskId, plane.persistence.events.get(created.taskId)
    .filter((event) => event.type !== "task.execution.dispatched"));
  dispatched.length = 0;

  const recovered = await plane.recoverInterruptedAssignments();
  assert.deepEqual(recovered, [{ taskId: created.taskId, stepId: step.id }]);
  assert.equal(dispatched.length, 1);
  assert.equal(dispatched[0].executionTarget.stepId, step.id);
  assert.equal(plane.getTaskSnapshot(created.taskId).assignment.execution.steps[0].status, "RUNNING");
  assert.equal(plane.listTaskEvents(created.taskId).filter((event) => event.type === "task.execution.dispatched").length, 1);
});
