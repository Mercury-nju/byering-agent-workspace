import test from "node:test";
import assert from "node:assert/strict";
import {
  activeAgentSquareWorkForAgent,
  activeAgentSquareWorkForAccount,
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

test("Agent Square does not treat an unconfirmed remote task as account occupation", () => {
  const stale = {
    agentType: agentId,
    state: "working",
    accountKey: "douyin:sec:account-1",
    metadata: { taskState: "unknown", taskId: "stale-task" }
  };

  assert.equal(isActiveAgentSquareWork(stale), false);
  assert.equal(activeAgentSquareWorkForAccount([stale], {
    agentId,
    accountKey: "douyin:sec:account-1",
    taskId: "new-task"
  }), null);
});

test("Agent Square finds an active task occupying the same account and Agent", () => {
  const work = {
    agentType: agentId,
    state: "working",
    accountKey: "douyin:sec:account-1",
    taskId: "running-task",
    metadata: { taskState: "running" }
  };

  assert.equal(activeAgentSquareWorkForAccount([work], {
    agentId,
    accountKey: "douyin:sec:account-1",
    taskId: "new-task"
  }), work);
  assert.equal(activeAgentSquareWorkForAccount([work], {
    agentId: "mkt-live-danmaku-analysis",
    accountKey: "douyin:sec:account-1",
    taskId: "new-task"
  }), null);
  assert.equal(activeAgentSquareWorkForAccount([work], {
    agentId,
    accountKey: "douyin:sec:account-1",
    taskId: "running-task"
  }), null);
});
