import assert from "node:assert/strict";
import test from "node:test";
import { createControlPlane } from "../backend/control-plane.js";
import { createControlPlaneHttpServer } from "../backend/http-server.js";
import { ControlPlaneHttpClient, createHybridGateway } from "../src/salebuddy/bridge/control-plane-http.js";

test("browser control-plane client creates, starts, snapshots, and replays task events", async () => {
  const server = createControlPlaneHttpServer({ controlPlane: createControlPlane() });
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

    const events = await client.events(created.taskId, { afterSeq: 0 });
    assert.deepEqual(events.events.map((event) => event.type), ["task.created", "task.run.started"]);
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
    on: (eventName, listener) => {
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
