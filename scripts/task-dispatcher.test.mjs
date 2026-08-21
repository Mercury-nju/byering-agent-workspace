import test from "node:test";
import assert from "node:assert/strict";
import { createTaskDispatcher } from "../backend/task-dispatcher.js";
import { createControlPlane } from "../backend/control-plane.js";

function task(overrides = {}) {
  return {
    taskId: "task-1",
    taskRunId: "run-1",
    conversationId: "conversation-1",
    agentId: "chief_of_staff",
    accessRequest: { provider: "douyin", accountKey: "account-1", robotUid: "robot-1" },
    ...overrides
  };
}

function command(overrides = {}) {
  return {
    commandId: "command-1",
    idempotencyKey: "idem-1",
    type: "task.start",
    payload: { goal: "找潜客" },
    ...overrides
  };
}

test("dispatcher leases a runnable task with server-owned context", async () => {
  const calls = [];
  const dispatcher = createTaskDispatcher({
    executionService: {
      configured: true,
      lease: async (input) => {
        calls.push(input);
        return { accepted: true, events: [] };
      }
    }
  });

  const result = await dispatcher.dispatch({
    command: command(),
    ack: { accepted: true, state: "RUNNING" },
    task: task()
  });

  assert.equal(result.dispatched, true);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    uid: "robot-1",
    taskId: "task-1",
    taskRunId: "run-1",
    conversationId: "conversation-1",
    agentId: "chief_of_staff",
    provider: "douyin",
    accountKey: "account-1",
    commandId: "command-1",
    idempotencyKey: "idem-1"
  });
});

test("dispatcher ignores gate states and rejected approvals", async () => {
  let calls = 0;
  const dispatcher = createTaskDispatcher({
    executionService: { configured: true, lease: async () => { calls += 1; } }
  });

  for (const state of ["WAITING_REQUIREMENT", "WAITING_ACCESS", "WAITING_APPROVAL"]) {
    const result = await dispatcher.dispatch({ command: command(), ack: { state }, task: task() });
    assert.equal(result.dispatched, false);
  }
  const rejected = await dispatcher.dispatch({
    command: command({ type: "approval.decision", payload: { decision: "rejected" } }),
    ack: { state: "WAITING_APPROVAL" },
    task: task()
  });
  assert.equal(rejected.dispatched, false);
  assert.equal(calls, 0);
});

test("dispatcher fails closed when a runnable task has no robot binding", async () => {
  const dispatcher = createTaskDispatcher({
    executionService: { configured: true, lease: async () => ({ accepted: true }) }
  });

  await assert.rejects(
    dispatcher.dispatch({
      command: command(),
      ack: { accepted: true, state: "RUNNING" },
      task: task({ accessRequest: { provider: "douyin", accountKey: "account-1" } })
    }),
    (error) => error.code === "TASK_EXECUTOR_ID_REQUIRED" && error.statusCode === 409
  );
});

test("dispatcher fails closed when execution service is not configured", async () => {
  const dispatcher = createTaskDispatcher({
    executionService: { configured: false, lease: async () => ({ accepted: true }) }
  });

  await assert.rejects(
    dispatcher.dispatch({
      command: command({ payload: { actionType: 4, leadId: "lead-1", content: "你好" } }),
      ack: { accepted: true, state: "RUNNING" },
      task: task()
    }),
    (error) => error.code === "TASK_DISPATCH_NOT_CONFIGURED" && error.statusCode === 503
  );
});

test("unconfigured RPA does not block pure discovery", async () => {
  const dispatcher = createTaskDispatcher({
    executionService: { configured: false, lease: async () => ({ accepted: true }) }
  });
  dispatcher.assertReadyFor({
    command: command({ payload: { goal: "找潜客" } }),
    ack: { accepted: true, state: "RUNNING" },
    task: task({ goal: "只找潜客" })
  });
  const result = await dispatcher.dispatch({
    command: command({ payload: { goal: "找潜客" } }),
    ack: { accepted: true, state: "RUNNING" },
    task: task({ goal: "只找潜客" })
  });
  assert.deepEqual(result, { dispatched: false, reason: "executor_not_required" });
});

test("control plane dispatches only after a persisted requirement reaches RUNNING", async () => {
  const leases = [];
  let id = 0;
  const dispatcher = createTaskDispatcher({
    executionService: {
      configured: true,
      lease: async (input) => {
        leases.push(input);
        return { accepted: true, commands: [] };
      }
    }
  });
  const plane = createControlPlane({
    idFactory: () => `integration-${++id}`,
    requirementService: {
      async understand({ goal }) {
        return {
          schemaVersion: 1,
          source: "test",
          provider: "douyin",
          model: "fixture",
          generatedAt: "2026-08-19T00:00:00.000Z",
          title: "找人",
          objective: goal,
          scope: "公开抖音数据",
          deliverable: "候选线索",
          guardrail: "不自动发送",
          missing: [],
          assumptions: [],
          confidence: 1
        };
      }
    },
    taskDispatcher: dispatcher
  });

  const created = await plane.dispatchAsync({ type: "task.create", payload: { goal: "找潜客" } });
  const primed = plane.dispatch({
    type: "task.start",
    taskId: created.taskId,
    payload: { requirementsConfirmed: false, executionContext: { robotUid: "robot-1" } }
  });
  assert.equal(primed.state, "WAITING_REQUIREMENT");
  assert.equal(leases.length, 0);

  const confirmed = await plane.dispatchAsync({
    type: "task.requirement.confirm",
    taskId: created.taskId,
    expectedVersion: primed.currentVersion,
    payload: {
      proposalVersion: created.data.requirement.proposalVersion,
      executionContext: { robotUid: "robot-1" }
    }
  });
  assert.equal(confirmed.state, "RUNNING");
  assert.equal(leases.length, 1);
  assert.deepEqual(leases[0], {
    uid: "robot-1",
    taskId: created.taskId,
    taskRunId: confirmed.taskRunId,
    conversationId: confirmed.conversationId,
    agentId: "chief_of_staff",
    commandId: confirmed.commandId,
    idempotencyKey: confirmed.idempotencyKey
  });
  assert.equal(plane.listTaskEvents(created.taskId).at(-1).type, "task.execution.dispatched");
});

test("browser authorization binds the returned executor uid before an access grant runs", async () => {
  const leases = [];
  let id = 0;
  const plane = createControlPlane({
    idFactory: () => `access-${++id}`,
    requirementService: {
      async understand({ goal }) {
        return {
          schemaVersion: 1,
          source: "test",
          provider: "douyin",
          model: "fixture",
          generatedAt: "2026-08-19T00:00:00.000Z",
          title: "找人",
          objective: goal,
          scope: "公开抖音数据",
          deliverable: "候选线索",
          guardrail: "不自动发送",
          missing: [],
          assumptions: [],
          confidence: 1
        };
      }
    },
    browserWorkspace: {
      async authorize(sessionId) {
        return {
          sessionId,
          state: "READY",
          provider: "douyin",
          accountKey: "account-1",
          executorUid: "robot-1"
        };
      }
    },
    taskDispatcher: createTaskDispatcher({
      executionService: {
        configured: true,
        lease: async (input) => {
          leases.push(input);
          return { accepted: true };
        }
      }
    })
  });

  const created = await plane.dispatchAsync({ type: "task.create", payload: { goal: "找潜客并触达" } });
  const primed = plane.dispatch({ type: "task.start", taskId: created.taskId, payload: { requirementsConfirmed: false } });
  const waitingAccess = await plane.dispatchAsync({
    type: "task.requirement.confirm",
    taskId: created.taskId,
    expectedVersion: primed.currentVersion,
    payload: {
      proposalVersion: created.data.requirement.proposalVersion,
      requiresAccess: true,
      provider: "douyin",
      account: "account-1"
    }
  });
  assert.equal(waitingAccess.state, "WAITING_ACCESS");
  assert.equal(leases.length, 0);

  const granted = await plane.dispatchAsync({
    type: "access.scope.confirm",
    taskId: created.taskId,
    expectedVersion: waitingAccess.currentVersion,
    payload: {
      browserSessionId: "browser-session-1",
      provider: "douyin",
      account: "account-1",
      scopes: ["read"]
    }
  });
  assert.equal(granted.state, "RUNNING");
  assert.equal(leases.length, 1);
  assert.equal(leases[0].uid, "robot-1");
});

test("dispatcher prefers a real submit contract over heartbeat leasing", async () => {
  const calls = [];
  const dispatcher = createTaskDispatcher({
    executionService: {
      configured: true,
      lease: async () => { throw new Error("heartbeat must not be used for task submission"); },
      submit: async (input) => {
        calls.push(input);
        return { accepted: true, commandId: "letter-1", queue: "video_comment_high", status: "WAIT" };
      }
    }
  });
  const result = await dispatcher.dispatch({
    command: command({ payload: { actionType: 4, leadId: "lead-1", content: "你好" } }),
    ack: { accepted: true, state: "RUNNING" },
    task: task({ goal: "找潜客并准备触达" })
  });
  assert.equal(result.dispatched, true);
  assert.equal(result.status, "WAIT");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].actionType, 4);
  assert.equal(calls[0].leadId, "lead-1");
  assert.equal(calls[0].goal, "找潜客并准备触达");
});

test("dispatcher connects the cloud desktop and starts RPA before ClueHunter execution", async () => {
  const calls = [];
  const dispatcher = createTaskDispatcher({
    executionService: {
      configured: true,
      lease: async (input) => {
        calls.push(["lease", input]);
        return { accepted: true, leaseId: "lease-cloud" };
      }
    },
    cloudDesktopService: {
      configured: true,
      async connect(input) {
        calls.push(["connect", input]);
        return { connected: true, cloudDesktop: { ready: true }, rpa: { started: true } };
      }
    }
  });

  const result = await dispatcher.dispatch({
    command: command(),
    ack: { accepted: true, state: "RUNNING" },
    task: task({ executionContext: { tenantId: "10", regionId: "cn-test" } })
  });
  assert.equal(result.dispatched, true);
  assert.deepEqual(calls.map(([type]) => type), ["connect", "lease"]);
  assert.equal(calls[0][1].uid, "robot-1");
  assert.equal(calls[0][1].tenant, "10");
  assert.equal(result.cloudDesktop.ready, true);
  assert.equal(result.rpa.started, true);
  assert.equal(result.cloudDesktopReady, true);
  assert.equal(result.rpaStarted, true);
});

test("dispatcher refuses ClueHunter execution when the cloud/RPA connector is absent", async () => {
  const dispatcher = createTaskDispatcher({
    executionService: { configured: true, lease: async () => ({ accepted: true }) },
    cloudDesktopService: { configured: false, missing: ["BYERING_CLUEHUNTER_BASE_URL"] }
  });
  await assert.rejects(
    dispatcher.dispatch({
      command: command(),
      ack: { accepted: true, state: "RUNNING" },
      task: task()
    }),
    (error) => error.code === "CLOUD_DESKTOP_NOT_CONFIGURED" && error.statusCode === 503
  );
});

test("dispatcher keeps pure discovery on leasing when submit is also configured", async () => {
  const calls = [];
  const dispatcher = createTaskDispatcher({
    executionService: {
      configured: true,
      lease: async (input) => {
        calls.push(["lease", input]);
        return { accepted: true, leaseId: "lease-1" };
      },
      submit: async () => {
        calls.push(["submit"]);
        throw new Error("submit must only handle explicit outreach actions");
      }
    }
  });
  const result = await dispatcher.dispatch({
    command: command({ payload: { goal: "找潜客" } }),
    ack: { accepted: true, state: "RUNNING" },
    task: task({ goal: "只找潜客" })
  });
  assert.equal(result.dispatched, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "lease");
});

test("control plane persists connector execution events and result snapshot", async () => {
  let id = 0;
  const plane = createControlPlane({
    idFactory: () => `event-${++id}`,
    requirementService: {
      async understand({ goal }) {
        return {
          schemaVersion: 1,
          source: "test",
          provider: "douyin",
          model: "fixture",
          generatedAt: "2026-08-19T00:00:00.000Z",
          title: "找人",
          objective: goal,
          scope: "公开抖音数据",
          deliverable: "候选线索",
          guardrail: "不自动发送",
          missing: [],
          assumptions: [],
          confidence: 1
        };
      }
    },
    browserWorkspace: {
      async authorize(sessionId) {
        return {
          sessionId,
          state: "READY",
          provider: "douyin",
          accountKey: "account-1",
          executorUid: "robot-1"
        };
      }
    },
    taskDispatcher: createTaskDispatcher({
      executionService: {
        configured: true,
        submit: async () => ({
          accepted: true,
          commandId: "legacy-command-1",
          queue: "video_comment_high",
          status: "WAIT",
          uid: "robot-1",
          events: [{
            eventId: "legacy-event-1",
            type: "outreach.sent",
            payload: { leadId: "lead-1", token: "must-not-persist" }
          }]
        })
      }
    })
  });
  const created = await plane.dispatchAsync({ type: "task.create", payload: { goal: "找潜客并触达" } });
  const primed = plane.dispatch({ type: "task.start", taskId: created.taskId, payload: { requirementsConfirmed: false } });
  const confirmed = await plane.dispatchAsync({
    type: "task.requirement.confirm",
    taskId: created.taskId,
    expectedVersion: primed.currentVersion,
    payload: {
      proposalVersion: created.data.requirement.proposalVersion,
      executionContext: { robotUid: "robot-1" },
      actionType: 4,
      leadId: "lead-1",
      content: "你好"
    }
  });
  const granted = await plane.dispatchAsync({
    type: "access.scope.confirm",
    taskId: created.taskId,
    expectedVersion: confirmed.currentVersion,
    payload: {
      browserSessionId: "browser-session-1",
      provider: "douyin",
      account: "account-1",
      scopes: ["read", "send"],
      actionType: 4,
      leadId: "lead-1",
      content: "你好"
    }
  });
  const events = plane.listTaskEvents(created.taskId);
  const sent = events.find((event) => event.type === "outreach.sent");
  assert.ok(sent);
  assert.equal(sent.payload.token, undefined);
  assert.equal(plane.getTaskSnapshot(created.taskId).resultSnapshot.outreach.sent, 1);
  assert.equal(granted.state, "RUNNING");
});
