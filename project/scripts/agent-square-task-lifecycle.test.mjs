import test from "node:test";
import assert from "node:assert/strict";
import {
  activeAgentSquareWorkForAgent,
  agentSquareCancelPayload,
  isActiveAgentSquareWork
} from "../src/salebuddy/ui/agent-square.js";

const agentId = "mkt-comment-acquisition";

test("Agent Square treats a task awaiting attention as active and cancellable", () => {
  const work = {
    agentType: agentId,
    state: "working",
    metadata: {
      taskState: "attention",
      taskId: "comment-task-1",
      taskRunId: "run-1",
      accountId: "douyin-agent:mkt-comment-acquisition"
    }
  };

  assert.equal(isActiveAgentSquareWork(work), true);
  assert.equal(activeAgentSquareWorkForAgent([work], agentId), work);
  assert.deepEqual(agentSquareCancelPayload(agentId, work), {
    agentId,
    action: "cancel",
    taskId: "comment-task-1",
    taskRunId: "run-1",
    accountId: "douyin-agent:mkt-comment-acquisition"
  });
});

test("Agent Square releases an Agent after its task is terminal", () => {
  const completed = {
    agentType: agentId,
    state: "done",
    metadata: { taskState: "cancelled", taskId: "comment-task-1" }
  };

  assert.equal(isActiveAgentSquareWork(completed), false);
  assert.equal(activeAgentSquareWorkForAgent([completed], agentId), null);
});
