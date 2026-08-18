import assert from "node:assert/strict";
import test from "node:test";
import { createControlPlane, ControlPlaneError } from "../backend/control-plane.js";
import { createControlPlaneHttpServer } from "../backend/http-server.js";

function fixture() {
  let sequence = 0;
  return createControlPlane({
    idFactory: () => `fixture-${++sequence}`,
    now: () => "2026-08-19T00:00:00.000Z"
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

test("task start, events, subscription, and snapshot stay in one ordered log", () => {
  const plane = fixture();
  const created = plane.dispatch({ type: "task.create", payload: { goal: "分析线索" } });
  const observed = [];
  const unsubscribe = plane.subscribe(created.taskId, (event) => observed.push(event));

  const started = plane.dispatch({
    type: "task.run.start",
    taskId: created.taskId,
    expectedVersion: 0,
    payload: { requirementsConfirmed: true }
  });
  unsubscribe();
  assert.equal(started.state, "RUNNING");
  assert.equal(started.currentVersion, 1);
  assert.equal(observed.length, 1);
  assert.equal(observed[0].type, "task.run.started");
  assert.equal(observed[0].seq, 2);
  assert.equal(Object.isFrozen(observed[0]), false, "listeners receive a safe copy");

  const snapshot = plane.getTaskSnapshot(created.taskId);
  assert.equal(snapshot.state, "RUNNING");
  assert.equal(snapshot.currentSeq, 2);
  assert.deepEqual(plane.listTaskEvents(created.taskId, { afterSeq: 1 }).map((event) => event.seq), [2]);
});

test("optimistic version check rejects stale task commands without mutating state", () => {
  const plane = fixture();
  const created = plane.dispatch({ type: "task.create", payload: { goal: "检查版本" } });
  plane.dispatch({ type: "task.start", taskId: created.taskId, expectedVersion: 0, payload: { requirementsConfirmed: true } });

  assert.throws(() => plane.dispatch({
    type: "task.pause",
    taskId: created.taskId,
    expectedVersion: 0
  }), (error) => error instanceof ControlPlaneError && error.code === "STALE_TASK_VERSION");
  assert.equal(plane.getTaskSnapshot(created.taskId).state, "RUNNING");
  assert.equal(plane.getTaskSnapshot(created.taskId).version, 1);
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

  const startedResponse = await request(`/v1/tasks/${created.taskId}/start`, {
    method: "POST",
    body: JSON.stringify({ requirementsConfirmed: true })
  });
  assert.equal(startedResponse.status, 202);
  assert.equal((await startedResponse.json()).state, "RUNNING");

  const snapshotResponse = await request(`/v1/tasks/${created.taskId}`);
  assert.equal(snapshotResponse.status, 200);
  assert.equal((await snapshotResponse.json()).state, "RUNNING");

  const eventsResponse = await request(`/v1/tasks/${created.taskId}/events?afterSeq=1`);
  assert.equal(eventsResponse.status, 200);
  const events = await eventsResponse.json();
  assert.deepEqual(events.events.map((event) => event.seq), [2]);

  const invalidResponse = await request("/v1/tasks", {
    method: "POST",
    body: JSON.stringify({})
  });
  assert.equal(invalidResponse.status, 400);
  assert.equal((await invalidResponse.json()).error.code, "TASK_GOAL_REQUIRED");
});
