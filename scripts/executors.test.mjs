import assert from "node:assert/strict";
import test from "node:test";
import { createExecutorRegistry, runExecutor, runParallelExecutors } from "../src/salebuddy/runtime/executors.js";

test("executor registry reports missing integrations instead of faking completion", async () => {
  const result = await runExecutor({ registry: createExecutorRegistry(), executorId: "search" });
  assert.equal(result.status, "blocked");
  assert.equal(result.code, "executor_not_configured");
});

test("parallel executor orchestration preserves per-agent status and events", async () => {
  const events = [];
  const registry = createExecutorRegistry({
    one: async ({ input }) => ({ value: input + 1 }),
    two: async () => ({ status: "blocked", code: "approval_required" })
  });
  const result = await runParallelExecutors({
    registry,
    jobs: [{ skillId: "a", executorId: "one", input: 1 }, { skillId: "b", executorId: "two" }],
    onEvent: (event) => events.push(event.type)
  });
  assert.equal(result.status, "blocked");
  assert.deepEqual(result.results.map((item) => item.status), ["completed", "blocked"]);
  assert.deepEqual(events, ["parallel.started", "executor.started", "executor.started", "executor.completed", "executor.completed", "parallel.completed"]);
});
