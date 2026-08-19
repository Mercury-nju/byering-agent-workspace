import assert from "node:assert/strict";
import test from "node:test";
import { COMMAND_TYPES } from "../src/salebuddy/runtime/task-protocol.js";
import {
  RemoteTaskBootstrapError,
  createRemoteTask,
  remoteTaskIdentity,
  startRemoteTask
} from "../src/salebuddy/runtime/remote-task-bootstrap.js";

test("remote task bootstrap keeps server task, run, and conversation identities", async () => {
  const calls = [];
  const commandClient = {
    send: async (type, input) => {
      calls.push({ type, input });
      if (type === COMMAND_TYPES.TASK_CREATE) {
        return { accepted: true, data: { taskId: "srv-task-1", taskRunId: "srv-run-1", conversationId: "srv-conv-1", currentVersion: 0 } };
      }
      return { accepted: true, data: { taskId: "srv-task-1", taskRunId: "srv-run-1", conversationId: "srv-conv-1", currentVersion: 1 } };
    }
  };

  const created = await createRemoteTask({ commandClient, taskText: "找出潜在客户", projectId: "room-1", localTaskId: "local-task-1" });
  const started = await startRemoteTask({ commandClient, identity: created, taskText: "找出潜在客户", projectId: "room-1", localTaskId: "local-task-1" });

  assert.deepEqual({ taskId: created.taskId, taskRunId: created.taskRunId, conversationId: created.conversationId }, {
    taskId: "srv-task-1", taskRunId: "srv-run-1", conversationId: "srv-conv-1"
  });
  assert.equal(calls[0].type, COMMAND_TYPES.TASK_CREATE);
  assert.equal(calls[0].input.taskId, undefined);
  assert.equal(calls[0].input.metadata.clientTaskId, "local-task-1");
  assert.equal(calls[1].type, COMMAND_TYPES.TASK_START);
  assert.equal(calls[1].input.taskId, "srv-task-1");
  assert.equal(calls[1].input.conversationId, "srv-conv-1");
  assert.equal(calls[1].input.expectedVersion, 0);
  assert.equal(started.currentVersion, 1);
});

test("remote identity rejects incomplete server responses", async () => {
  assert.deepEqual(remoteTaskIdentity({ data: { task_id: "task-1", run_id: "run-1", conversation_id: "conv-1" } }), {
    taskId: "task-1", taskRunId: "run-1", conversationId: "conv-1", currentVersion: null, currentSeq: null
  });
  await assert.rejects(
    createRemoteTask({ commandClient: { send: async () => ({ accepted: true, data: { taskId: "task-only" } }) }, taskText: "测试" }),
    (error) => error instanceof RemoteTaskBootstrapError && error.code === "REMOTE_TASK_IDENTITY_INCOMPLETE"
  );
});
