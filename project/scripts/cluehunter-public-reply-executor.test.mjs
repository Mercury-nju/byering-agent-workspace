import assert from "node:assert/strict";
import test from "node:test";

import {
  ClueHunterPublicReplyError,
  createClueHunterPublicReplyExecutor
} from "../backend/cluehunter-public-reply-executor.js";

function input(overrides = {}) {
  return {
    content: "你好，看到你在视频下的留言了。",
    reqId: "touch-request-1",
    account: {
      uid: "9001",
      tenantId: "7001",
      secId: "sender-sec-id",
      nickname: "品牌账号"
    },
    taskContext: {
      agentId: "mkt-comment-acquisition",
      taskId: "task-comment-1",
      taskRunId: "run-comment-1",
      conversationId: "conversation-comment-1",
      accountId: "account-comment-1"
    },
    lead: {
      commentId: "comment-123",
      videoId: "video-456",
      videoUrl: "https://www.douyin.com/video/456",
      secUid: "target-sec-uid",
      externalUserId: "target-open-id",
      nickname: "潜客"
    },
    ...overrides
  };
}

test("submits a real action 23 video comment reply with task, account, lead, and content context", async () => {
  const calls = [];
  const executor = createClueHunterPublicReplyExecutor({
    clueHunterService: {
      async submit(payload) {
        calls.push(payload);
        return { accepted: true, commandId: "command-1", queue: "VIDEO_COMMENT_REPLY", status: "QUEUED" };
      }
    }
  });

  const result = await executor(input());

  assert.deepEqual(result, {
    ok: true,
    state: "accepted",
    message_id: "command-1",
    commandId: "command-1",
    queue: "VIDEO_COMMENT_REPLY",
    status: "QUEUED"
  });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    uid: "9001",
    tenant: "7001",
    taskId: "task-comment-1",
    taskRunId: "run-comment-1",
    conversationId: "conversation-comment-1",
    agentId: "mkt-comment-acquisition",
    accountId: "account-comment-1",
    actionType: 23,
    action: "video_comment_reply",
    idempotencyKey: "touch-request-1",
    channel: "video_comment",
    commentId: "comment-123",
    videoId: "video-456",
    videoUrl: "https://www.douyin.com/video/456",
    consumerSecUid: "target-sec-uid",
    consumerOpenId: "target-open-id",
    consumerNickname: "潜客",
    operatedAccountSecId: "sender-sec-id",
    operatedNickname: "品牌账号",
    content: "你好，看到你在视频下的留言了。"
  });
});

test("fails closed when comment or video locator is missing", async () => {
  const calls = [];
  const executor = createClueHunterPublicReplyExecutor({
    clueHunterService: { async submit(payload) { calls.push(payload); } }
  });

  await assert.rejects(
    () => executor(input({ lead: { secUid: "target-sec-uid" } })),
    (error) => error instanceof ClueHunterPublicReplyError
      && error.code === "DOUYIN_PUBLIC_REPLY_LOCATION_REQUIRED"
  );
  await assert.rejects(
    () => executor(input({ lead: { commentId: "comment-123", secUid: "target-sec-uid" } })),
    (error) => error instanceof ClueHunterPublicReplyError
      && error.code === "DOUYIN_PUBLIC_REPLY_LOCATION_REQUIRED"
  );
  assert.equal(calls.length, 0);
});

test("fails closed when the target user or sender execution identity is not addressable", async () => {
  const calls = [];
  const executor = createClueHunterPublicReplyExecutor({
    clueHunterService: { async submit(payload) { calls.push(payload); } }
  });

  await assert.rejects(
    () => executor(input({ lead: { commentId: "comment-123", videoId: "video-456", nickname: "只有昵称" } })),
    (error) => error instanceof ClueHunterPublicReplyError
      && error.code === "DOUYIN_PUBLIC_REPLY_TARGET_REQUIRED"
  );
  await assert.rejects(
    () => executor(input({ account: { uid: "not-a-number", tenantId: "7001" } })),
    (error) => error instanceof ClueHunterPublicReplyError
      && error.code === "CLUEHUNTER_EXECUTION_IDENTITY_REQUIRED"
  );
  assert.equal(calls.length, 0);
});

test("does not convert a ClueHunter submit failure into a private-message fallback", async () => {
  let calls = 0;
  const upstreamError = Object.assign(new Error("submit unavailable"), { code: "SUBMIT_NOT_CONFIGURED" });
  const executor = createClueHunterPublicReplyExecutor({
    clueHunterService: {
      async submit() {
        calls += 1;
        throw upstreamError;
      }
    }
  });

  await assert.rejects(() => executor(input()), (error) => error === upstreamError);
  assert.equal(calls, 1);
});

test("uses the server-side RPA identity provider when account metadata is only Douyin identity", async () => {
  const calls = [];
  const executor = createClueHunterPublicReplyExecutor({
    executionIdentityProvider: ({ agentId }) => {
      assert.equal(agentId, "mkt-comment-acquisition");
      return { tenant: "7100", uid: "9100" };
    },
    clueHunterService: {
      async submit(payload) {
        calls.push(payload);
        return { accepted: true, commandId: "command-server-identity" };
      }
    }
  });

  await executor(input({ account: { secId: "douyin-sec-id", uid: "douyin-uid" } }));

  assert.equal(calls[0].tenant, "7100");
  assert.equal(calls[0].uid, "9100");
});

test("does not fall back to a numeric Douyin uid when the server-side RPA identity is missing", async () => {
  const executor = createClueHunterPublicReplyExecutor({
    executionIdentityProvider: () => null,
    clueHunterService: { async submit() { throw new Error("must not submit"); } }
  });

  await assert.rejects(
    () => executor(input({ account: { uid: "123456789", secId: "douyin-sec-id" } })),
    (error) => error instanceof ClueHunterPublicReplyError
      && error.code === "CLUEHUNTER_EXECUTION_IDENTITY_REQUIRED"
  );
});
