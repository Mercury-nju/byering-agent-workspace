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
  assert.equal(calls[1].input.payload.requirementsConfirmed, false);
});

test("remote task can be primed behind the requirement and access gates", async () => {
  let request;
  const commandClient = {
    send: async (type, input) => {
      request = { type, input };
      return { accepted: true, data: { taskId: "srv-task-2", taskRunId: "srv-run-2", conversationId: "srv-conv-2", currentVersion: 1 } };
    }
  };
  await startRemoteTask({
    commandClient,
    identity: { taskId: "srv-task-2", taskRunId: "srv-run-2", conversationId: "srv-conv-2", currentVersion: 0 },
    taskText: "找潜客",
    requirementsConfirmed: false,
    requiresAccess: false
  });
  assert.equal(request.input.payload.requirementsConfirmed, false);
  assert.equal(request.input.payload.requiresAccess, false);
});

test("remote task identity carries the server requirement proposal", async () => {
  const created = await createRemoteTask({
    commandClient: {
      send: async () => ({
        accepted: true,
        data: {
          taskId: "srv-task-proposal",
          taskRunId: "srv-run-proposal",
          conversationId: "srv-conv-proposal",
          currentVersion: 0,
          requirement: {
            schemaVersion: 1,
            source: "model",
            title: "真实需求",
            objective: "可执行目标",
            scope: "已授权范围",
            deliverable: "结构化结果",
            guardrail: "不越权执行"
          }
        }
      })
    },
    taskText: "找潜客"
  });

  assert.equal(created.requirement.source, "model");
  assert.equal(created.requirement.objective, "可执行目标");
});

test("remote identity rejects incomplete server responses", async () => {
  assert.deepEqual(remoteTaskIdentity({ data: { task_id: "task-1", run_id: "run-1", conversation_id: "conv-1" } }), {
    taskId: "task-1", taskRunId: "run-1", conversationId: "conv-1", currentVersion: null, currentSeq: null, requirement: null
  });
  await assert.rejects(
    createRemoteTask({ commandClient: { send: async () => ({ accepted: true, data: { taskId: "task-only" } }) }, taskText: "测试" }),
    (error) => error instanceof RemoteTaskBootstrapError && error.code === "REMOTE_TASK_IDENTITY_INCOMPLETE"
  );
});
