import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createControlPlane } from "../backend/control-plane.js";
import { startControlPlaneServer } from "../backend/http-server.js";
import { FilePersistenceAdapter, FilePersistenceError } from "../backend/persistence.js";

async function withStore(run) {
  const directory = await mkdtemp(join(tmpdir(), "byering-persistence-"));
  const filePath = join(directory, "control-plane.json");
  try {
    return await run({ directory, filePath });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("file adapter restores tasks, events, and commands after restart", async () => {
  await withStore(async ({ filePath }) => {
    const first = new FilePersistenceAdapter({ filePath });
    first.saveTask({ taskId: "task-1", state: "RUNNING", version: 2 });
    first.appendEvent("task-1", { eventId: "event-1", seq: 1, type: "task.created" });
    first.appendEvent("task-1", { eventId: "event-2", seq: 2, type: "task.run.started" });
    first.saveCommand("idem-1", { fingerprint: "fingerprint-1", ack: { accepted: true, taskId: "task-1" } });

    const restarted = new FilePersistenceAdapter({ filePath });
    assert.deepEqual(restarted.loadTask("task-1"), { taskId: "task-1", state: "RUNNING", version: 2 });
    assert.deepEqual(restarted.listEvents("task-1", { afterSeq: 1 }), [{ eventId: "event-2", seq: 2, type: "task.run.started" }]);
    assert.deepEqual(restarted.loadCommand("idem-1"), { fingerprint: "fingerprint-1", ack: { accepted: true, taskId: "task-1" } });
  });
});

test("control plane replays the same command after a process restart", async () => {
  await withStore(async ({ filePath }) => {
    const input = {
      type: "task.create",
      taskId: "task-restart",
      commandId: "command-restart",
      idempotencyKey: "idempotency-restart",
      payload: { goal: "重启后继续任务" }
    };
    const first = createControlPlane({ persistence: new FilePersistenceAdapter({ filePath }) });
    const created = first.dispatch(input);

    const second = createControlPlane({ persistence: new FilePersistenceAdapter({ filePath }) });
    const replay = second.dispatch(input);
    assert.deepEqual(replay, created);
    assert.equal(second.getTaskSnapshot("task-restart").state, "CREATED");
    assert.deepEqual(second.listTaskEvents("task-restart").map((event) => event.type), ["task.created"]);
  });
});

test("production HTTP startup restores task commands and events from BYERING_PERSISTENCE_DIR", async () => {
  await withStore(async ({ directory }) => {
    const requirementService = {
      async understand({ goal }) {
        return {
          schemaVersion: 1,
          source: "test",
          provider: "test",
          model: "fixture",
          generatedAt: "2026-08-19T00:00:00.000Z",
          title: "HTTP 重启需求",
          objective: goal,
          scope: "测试范围",
          deliverable: "测试结果",
          guardrail: "不执行外部动作",
          missing: [],
          assumptions: [],
          confidence: 1
        };
      }
    };
    const first = await startControlPlaneServer({
      port: 0,
      host: "127.0.0.1",
      persistenceDir: directory,
      requirementService,
      taskDispatcher: null
    });
    const firstUrl = `http://127.0.0.1:${first.address().port}`;
    const request = (base, path, options) => fetch(`${base}${path}`, {
      headers: { "content-type": "application/json" },
      ...options
    });
    const input = {
      commandId: "http-restart-command",
      idempotencyKey: "http-restart-idempotency",
      taskId: "http-restart-task",
      goal: "重启后恢复控制面任务"
    };
    const createdResponse = await request(firstUrl, "/v1/tasks", {
      method: "POST",
      body: JSON.stringify(input)
    });
    assert.equal(createdResponse.status, 202);
    const created = await createdResponse.json();
    const startedResponse = await request(firstUrl, `/v1/tasks/${created.taskId}/start`, {
      method: "POST",
      body: JSON.stringify({ commandId: "http-restart-start", idempotencyKey: "http-restart-start-idem", planVersion: 1 })
    });
    assert.equal(startedResponse.status, 202);
    await new Promise((resolve) => first.close(resolve));

    const second = await startControlPlaneServer({
      port: 0,
      host: "127.0.0.1",
      persistenceDir: directory,
      requirementService,
      taskDispatcher: null
    });
    try {
      const secondUrl = `http://127.0.0.1:${second.address().port}`;
      const replayResponse = await request(secondUrl, "/v1/tasks", {
        method: "POST",
        body: JSON.stringify(input)
      });
      assert.equal(replayResponse.status, 202);
      assert.deepEqual(await replayResponse.json(), created);

      const snapshotResponse = await request(secondUrl, `/v1/tasks/${created.taskId}`);
      assert.equal(snapshotResponse.status, 200);
      assert.equal((await snapshotResponse.json()).state, "WAITING_REQUIREMENT");
      const eventsResponse = await request(secondUrl, `/v1/tasks/${created.taskId}/events`);
      assert.equal(eventsResponse.status, 200);
      assert.deepEqual((await eventsResponse.json()).events.map((event) => event.type), [
        "task.created",
        "task.requirement.proposed",
        "task.run.started"
      ]);
    } finally {
      await new Promise((resolve) => second.close(resolve));
    }
  });
});

test("file adapter returns isolated clones and preserves event ordering limits", async () => {
  await withStore(async ({ filePath }) => {
    const store = new FilePersistenceAdapter({ filePath });
    store.saveTask({ taskId: "task-2", nested: { status: "created" } });
    store.appendEvent("task-2", { seq: 1, payload: { value: 1 } });
    store.appendEvent("task-2", { seq: 2, payload: { value: 2 } });
    store.appendEvent("task-2", { seq: 3, payload: { value: 3 } });

    const task = store.loadTask("task-2");
    task.nested.status = "mutated";
    const events = store.listEvents("task-2", { limit: 2 });
    events[0].payload.value = 99;

    assert.equal(store.loadTask("task-2").nested.status, "created");
    assert.deepEqual(store.listEvents("task-2", { limit: 2 }).map((event) => event.seq), [1, 2]);
    assert.equal(store.listEvents("task-2", { afterSeq: 1 }).at(0).payload.value, 2);
  });
});

test("deleteTask removes task and its event stream across restart", async () => {
  await withStore(async ({ filePath }) => {
    const store = new FilePersistenceAdapter({ filePath });
    store.saveTask({ taskId: "task-delete", state: "CREATED" });
    store.appendEvent("task-delete", { seq: 1, type: "task.created" });
    store.deleteTask("task-delete");

    const restarted = new FilePersistenceAdapter({ filePath });
    assert.equal(restarted.loadTask("task-delete"), null);
    assert.deepEqual(restarted.listEvents("task-delete"), []);
  });
});

test("corrupt state fails closed instead of resetting authoritative history", async () => {
  await withStore(async ({ filePath }) => {
    await writeFile(filePath, "{not-json", "utf8");
    assert.throws(
      () => new FilePersistenceAdapter({ filePath }),
      (error) => error instanceof FilePersistenceError && error.code === "PERSISTENCE_FILE_CORRUPT"
    );
    assert.equal(await readFile(filePath, "utf8"), "{not-json");
  });
});

test("writes leave no temporary files and produce a complete JSON snapshot", async () => {
  await withStore(async ({ directory, filePath }) => {
    const store = new FilePersistenceAdapter({ filePath });
    store.saveTask({ taskId: "task-atomic", state: "RUNNING" });
    const entries = await readdir(directory);
    assert.deepEqual(entries.sort(), ["control-plane.json"]);
    const parsed = JSON.parse(await readFile(filePath, "utf8"));
    assert.equal(parsed.version, 1);
    assert.equal(parsed.tasks["task-atomic"].state, "RUNNING");
    assert.deepEqual(parsed.events, {});
    assert.deepEqual(parsed.commands, {});
  });
});
