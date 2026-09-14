import assert from "node:assert/strict";
import test from "node:test";

import {
  ClueHunterPrivateOutreachError,
  createClueHunterPrivateOutreachExecutor
} from "../backend/cluehunter-private-outreach-executor.js";

function input(overrides = {}) {
  return {
    content: "你好，看到你在咨询新能源车，方便了解一下需求吗？",
    reqId: "outreach-request-1",
    taskContext: {
      agentId: "mkt-cold-writer",
      taskId: "task-outreach-1",
      taskRunId: "run-outreach-1",
      conversationId: "conversation-outreach-1",
      accountId: "account-outreach-1"
    },
    account: { secId: "brand-sec-id", nickname: "品牌账号" },
    lead: { id: "lead-1", secUid: "target-sec-uid", nickname: "上海周先生" },
    ...overrides
  };
}

test("submits first outreach to cloud RPA with durable task and recipient context", async () => {
  const calls = [];
  const executor = createClueHunterPrivateOutreachExecutor({
    executionIdentityProvider: () => ({ tenant: "7001", uid: "9001" }),
    clueHunterService: {
      async submit(payload) {
        calls.push(payload);
        return { accepted: true, commandId: "rpa-command-1", queue: "VIDEO_COMMENT_HIGH_INTENTION", status: "QUEUED" };
      }
    }
  });

  const result = await executor(input());
  assert.deepEqual(result, {
    accepted: true,
    state: "accepted",
    receiptPending: true,
    commandId: "rpa-command-1",
    reqId: "outreach-request-1",
    queue: "VIDEO_COMMENT_HIGH_INTENTION",
    status: "QUEUED",
    executorUid: "9001",
    executorTenant: "7001"
  });
  assert.deepEqual(calls[0], {
    uid: "9001",
    tenant: "7001",
    agentId: "mkt-cold-writer",
    taskId: "task-outreach-1",
    taskRunId: "run-outreach-1",
    conversationId: "conversation-outreach-1",
    accountId: "account-outreach-1",
    actionType: 4,
    action: "private_message",
    channel: "private_message",
    idempotencyKey: "outreach-request-1",
    leadId: "lead-1",
    consumerSecUid: "target-sec-uid",
    consumerNickname: "上海周先生",
    operatedAccountSecId: "brand-sec-id",
    operatedNickname: "品牌账号",
    content: "你好，看到你在咨询新能源车，方便了解一下需求吗？"
  });
});

test("fails closed when the cloud RPA identity or target is absent", async () => {
  const executor = createClueHunterPrivateOutreachExecutor({
    executionIdentityProvider: () => null,
    clueHunterService: { async submit() { throw new Error("must not submit"); } }
  });
  await assert.rejects(
    () => executor(input()),
    (error) => error instanceof ClueHunterPrivateOutreachError && error.code === "CLUEHUNTER_EXECUTION_IDENTITY_REQUIRED"
  );

  const noTarget = createClueHunterPrivateOutreachExecutor({
    executionIdentityProvider: () => ({ tenant: "7001", uid: "9001" }),
    clueHunterService: { async submit() { throw new Error("must not submit"); } }
  });
  await assert.rejects(
    () => noTarget(input({ lead: { nickname: "只有昵称" } })),
    (error) => error instanceof ClueHunterPrivateOutreachError && error.code === "DOUYIN_PRIVATE_OUTREACH_TARGET_REQUIRED"
  );
});

test("does not reinterpret an RPA queue acceptance as a delivered private message", async () => {
  const executor = createClueHunterPrivateOutreachExecutor({
    executionIdentityProvider: () => ({ tenant: "7001", uid: "9001" }),
    clueHunterService: {
      async submit() {
        return { accepted: true, commandId: "rpa-command-2", queue: "VIDEO_COMMENT_HIGH_INTENTION", status: "QUEUED" };
      }
    }
  });
  const result = await executor(input());
  assert.equal(result.receiptPending, true);
  assert.equal(result.state, "accepted");
  assert.equal(Object.hasOwn(result, "messageId"), false);
});
