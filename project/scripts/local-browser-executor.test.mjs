import test from "node:test";
import assert from "node:assert/strict";
import { createLocalBrowserExecutor, LocalBrowserExecutorError } from "../backend/local-browser-executor.js";

function workspace({ state = "READY" } = {}) {
  const calls = [];
  return {
    calls,
    async snapshot(sessionId) {
      calls.push(["snapshot", sessionId]);
      return { sessionId, state, tenantId: "tenant-1", accountKey: "douyin-1" };
    },
    async execute(sessionId, input) {
      calls.push(["execute", sessionId, input]);
      return {
        accepted: true,
        actionType: input.actionType,
        externalActionId: "local-action-1"
      };
    }
  };
}

test("local browser executor performs an approved Douyin action through the verified session", async () => {
  const browserWorkspace = workspace();
  const executor = createLocalBrowserExecutor({ browserWorkspace });
  const result = await executor.submit({
    taskId: "task-1",
    taskRunId: "run-1",
    browserSessionId: "session-1",
    tenantId: "tenant-1",
    actionType: "private_message",
    recipient: { secUid: "sec-1" },
    message: "你好"
  });

  assert.equal(result.accepted, true);
  assert.equal(result.source, "local-browser");
  assert.equal(result.events[0].type, "outreach.sent");
  assert.equal(browserWorkspace.calls[1][0], "execute");
  assert.equal(browserWorkspace.calls[1][2].actionType, "private_message");
});

test("local browser executor never reports success when the verified session is not ready", async () => {
  const browserWorkspace = workspace({ state: "AUTHORIZING" });
  const executor = createLocalBrowserExecutor({ browserWorkspace });

  await assert.rejects(
    () => executor.submit({ browserSessionId: "session-1", actionType: "private_message", recipient: { secUid: "sec-1" }, message: "你好" }),
    (error) => error instanceof LocalBrowserExecutorError && error.code === "AUTHORIZATION_PENDING"
  );
  assert.equal(browserWorkspace.calls.some(([name]) => name === "execute"), false);
});

test("local browser executor rejects unsupported or incomplete external actions", async () => {
  const executor = createLocalBrowserExecutor({ browserWorkspace: workspace() });

  await assert.rejects(
    () => executor.submit({ browserSessionId: "session-1", actionType: "private_message" }),
    (error) => error.code === "LOCAL_ACTION_INPUT_REQUIRED"
  );
  await assert.rejects(
    () => executor.submit({ browserSessionId: "session-1", actionType: "follow_account" }),
    (error) => error.code === "LOCAL_ACTION_UNSUPPORTED"
  );
});
