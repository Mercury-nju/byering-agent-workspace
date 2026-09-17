import assert from "node:assert/strict";
import test from "node:test";

import { ControlPlane, ControlPlaneError, findActiveManagedRuntimeTask } from "../backend/control-plane.js";
import { MemoryPersistenceAdapter } from "../backend/persistence.js";
import { TASK_STATES } from "../src/salebuddy/runtime/task-protocol.js";

const baseTask = {
  taskId: "task-running",
  taskRunId: "run-running",
  agentId: "mkt-live-danmaku-analysis",
  tenantId: "tenant-1",
  state: TASK_STATES.RUNNING,
  goal: "分析直播间新弹幕",
  executionContext: {
    tenantId: "tenant-1",
    accountId: "account-1",
    accountKey: "douyin:sec:account-1"
  }
};

test("findActiveManagedRuntimeTask matches the same Agent and account only", () => {
  assert.equal(findActiveManagedRuntimeTask([baseTask], {
    agentId: baseTask.agentId,
    tenantId: baseTask.tenantId,
    accountKey: baseTask.executionContext.accountKey,
    taskId: "task-new"
  }), baseTask);
  assert.equal(findActiveManagedRuntimeTask([baseTask], {
    agentId: "mkt-live-danmaku-outreach",
    tenantId: baseTask.tenantId,
    accountKey: baseTask.executionContext.accountKey,
    taskId: "task-new"
  }), null);
  assert.equal(findActiveManagedRuntimeTask([{ ...baseTask, state: TASK_STATES.SUCCEEDED }], {
    agentId: baseTask.agentId,
    tenantId: baseTask.tenantId,
    accountKey: baseTask.executionContext.accountKey,
    taskId: "task-new"
  }), null);
});

test("ControlPlane rejects a fresh duplicate runtime before external execution", () => {
  const controlPlane = new ControlPlane({
    persistence: new MemoryPersistenceAdapter(),
    idFactory: (() => {
      let index = 0;
      return () => `generated-${++index}`;
    })()
  });
  const shared = {
    agentId: "mkt-live-danmaku-analysis",
    tenantId: "tenant-1",
    goal: "分析直播间新弹幕",
    executionContext: {
      tenantId: "tenant-1",
      accountId: "account-1",
      accountKey: "douyin:sec:account-1"
    }
  };
  const first = controlPlane.ensureManagedRuntimeTask({ ...shared, taskId: "task-first" });
  assert.equal(first.state, TASK_STATES.RUNNING);

  assert.throws(
    () => controlPlane.ensureManagedRuntimeTask({ ...shared, taskId: "task-second" }),
    (error) => error instanceof ControlPlaneError
      && error.code === "MANAGED_RUNTIME_ACCOUNT_IN_USE"
      && error.statusCode === 409
      && error.details.existingTaskId === "task-first"
  );
});

test("Gold customer service and legacy DM inbox cannot own the same account at the same time", () => {
  const controlPlane = new ControlPlane({ persistence: new MemoryPersistenceAdapter() });
  const sharedContext = {
    tenantId: "tenant-1",
    accountId: "account-1",
    accountKey: "douyin:sec:account-1"
  };

  controlPlane.ensureManagedRuntimeTask({
    taskId: "legacy-inbox",
    agentId: "mkt-dm-inbox",
    tenantId: "tenant-1",
    goal: "按高级私信策略承接新消息",
    executionContext: { ...sharedContext, accountUseScope: "mkt-dm-inbox" }
  });

  assert.throws(
    () => controlPlane.ensureManagedRuntimeTask({
      taskId: "gold-inbox",
      agentId: "mkt-gold-customer-service",
      tenantId: "tenant-1",
      goal: "按目标自动承接新消息",
      executionContext: { ...sharedContext, accountUseScope: "mkt-gold-customer-service" }
    }),
    (error) => error instanceof ControlPlaneError
      && error.code === "MANAGED_RUNTIME_ACCOUNT_IN_USE"
      && error.details.existingAgentId === "mkt-dm-inbox"
  );
});

test("ControlPlane ignores a durable occupation when the runtime is no longer active", () => {
  const controlPlane = new ControlPlane({
    persistence: new MemoryPersistenceAdapter(),
    idFactory: (() => {
      let index = 0;
      return () => `generated-${++index}`;
    })()
  });
  const shared = {
    agentId: "mkt-comment-acquisition",
    tenantId: "tenant-1",
    goal: "持续处理授权抖音账号任务",
    executionContext: {
      tenantId: "tenant-1",
      accountId: "account-1",
      accountKey: "douyin:sec:account-1"
    }
  };
  controlPlane.ensureManagedRuntimeTask({ ...shared, taskId: "stale-task" });

  const next = controlPlane.ensureManagedRuntimeTask({
    ...shared,
    taskId: "fresh-task",
    isTaskActuallyActive: () => false
  });

  assert.equal(next.taskId, "fresh-task");
  assert.equal(next.state, TASK_STATES.RUNNING);
});

test("composite Agent sub-runtimes can share an account while default starts remain blocked", () => {
  const controlPlane = new ControlPlane({ persistence: new MemoryPersistenceAdapter() });
  const shared = {
    agentId: "mkt-comment-acquisition",
    tenantId: "tenant-1",
    goal: "持续处理授权账号任务",
    executionContext: {
      tenantId: "tenant-1",
      accountId: "account-1",
      accountKey: "douyin:sec:account-1"
    }
  };
  controlPlane.ensureManagedRuntimeTask({
    ...shared,
    taskId: "task-inbox",
    executionContext: { ...shared.executionContext, accountUseScope: "mkt-comment-acquisition:inbox" }
  });
  controlPlane.ensureManagedRuntimeTask({
    ...shared,
    taskId: "task-acquisition",
    executionContext: { ...shared.executionContext, accountUseScope: "mkt-comment-acquisition:acquisition" }
  });
  assert.throws(
    () => controlPlane.ensureManagedRuntimeTask({ ...shared, taskId: "task-external" }),
    (error) => error?.code === "MANAGED_RUNTIME_ACCOUNT_IN_USE"
  );
});
