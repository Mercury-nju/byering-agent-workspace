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
