import assert from "node:assert/strict";
import test from "node:test";

import { COMMAND_TYPES } from "../src/salebuddy/runtime/task-protocol.js";
import {
  TASK_COMMAND_ACTIONS,
  TaskCommandClientError,
  createTaskCommandClient
} from "../src/salebuddy/runtime/task-command-client.js";

test("command client sends canonical envelope through the mapped Gateway action", async () => {
  const calls = [];
  const client = createTaskCommandClient({
    actor: "user-1",
    idFactory: (prefix, sequence) => `${prefix}-${sequence}`,
    gateway: {
      action: async (action, payload) => {
        calls.push({ action, payload });
        return { accepted: true, currentSeq: 12 };
      }
    }
  });

  const result = await client.send(COMMAND_TYPES.APPROVAL_DECISION, {
    taskId: "task-1",
    payload: { approvalId: "approval-1", ok: true }
  });

  assert.equal(calls[0].action, "approval.action.respond");
  assert.equal(calls[0].payload.decision, "approved");
  assert.equal(calls[0].payload.ok, undefined);
  assert.equal(calls[0].payload.taskId, "task-1");
  assert.equal(calls[0].payload.commandId, "cmd-1");
  assert.equal(result.currentSeq, 12);
  assert.equal(result.command.payload.decision, "approved");
});

test("in-flight commands with the same idempotency key share one Gateway call", async () => {
  let resolve;
  let callCount = 0;
  const client = createTaskCommandClient({
    gateway: { action: () => { callCount += 1; return new Promise((done) => { resolve = done; }); } }
  });
  const input = { taskId: "task-1", commandId: "cmd-same", idempotencyKey: "idem-same", payload: { text: "继续" } };
  const first = client.send(COMMAND_TYPES.REPLY, input);
  const second = client.send(COMMAND_TYPES.REPLY, input);
  resolve({ accepted: true });
  await Promise.all([first, second]);
  assert.equal(callCount, 1);
  assert.equal(client.pendingCount(), 0);
});

test("rejected Gateway acknowledgements become typed command errors", async () => {
  const client = createTaskCommandClient({ gateway: { action: async () => ({ accepted: false, code: "SCOPE_NOT_GRANTED" }) } });
  await assert.rejects(
    client.send(COMMAND_TYPES.TASK_START, { taskId: "task-1" }),
    (error) => error instanceof TaskCommandClientError && error.code === "SCOPE_NOT_GRANTED"
  );
});

test("unmapped or invalid commands fail before a Gateway call", async () => {
  const client = createTaskCommandClient({ gateway: { action: async () => assert.fail("should not call") } });
  await assert.rejects(client.send("unknown.command", { taskId: "task-1" }), /Unknown command type/);
  assert.equal(TASK_COMMAND_ACTIONS[COMMAND_TYPES.HANDOFF], "task.handoff");
});
