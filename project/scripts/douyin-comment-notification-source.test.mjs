import assert from "node:assert/strict";
import test from "node:test";

import {
  createDouyinCommentNotificationSource,
  normalizeDouyinCommentNotification,
  normalizeDouyinInteractionNotification
} from "../backend/douyin-comment-notification-source.js";

test("follow notifications keep identity and avatar without inventing comment text", () => {
  const lead = normalizeDouyinInteractionNotification({ notification_id: "follow-1", notification_type: "follow", sender: { sec_uid: "person", nickname: "Person", avatar: "https://example.com/avatar.png" } });
  assert.equal(lead.secUid, "person");
  assert.equal(lead.avatarUrl, "https://example.com/avatar.png");
  assert.equal(lead.text, "");
  assert.equal(lead.evidence[0].type, "follow");
  assert.equal(lead.evidence[0].quote, "");
  assert.equal(normalizeDouyinInteractionNotification({ notification_type: "unknown", content: "Do not guess" }), null);
});

function createFakeCloud({ statuses = [], notifications = [], startResult = { ok: false, error_code: "worker_timeout" } } = {}) {
  const calls = { status: 0, start: 0, pull: [], getServiceScopes: [], statusScopes: [] };
  const service = {
    async startNotificationMode() {
      calls.start += 1;
      return startResult;
    },
    async pullNotifications(input) {
      calls.pull.push(input);
      return notifications.shift() || { ok: true, items: [], next_cursor: input.cursor };
    }
  };
  return {
    calls,
    async status(_agentId, scope) {
      calls.statusScopes.push(scope);
      const result = statuses[Math.min(calls.status, statuses.length - 1)] || { ok: true, state: "ONLINE", login_state: "logged_in", notification_mode: "running" };
      calls.status += 1;
      return result;
    },
    getService(_agentId, scope) { calls.getServiceScopes.push(scope); return service; }
  };
}

test("normalizes an RPA comment notification into a stable lead identity and source evidence", () => {
  const lead = normalizeDouyinCommentNotification({
    msg_id: "notification-1",
    comment: { cid: "comment-1", text: "请问这个方案多少钱？" },
    user: { sec_uid: "sec-user-1", uid: "uid-1", nickname: "张先生" },
    aweme: { aweme_id: "aweme-1", desc: "门店方案介绍", share_url: "https://www.douyin.com/video/aweme-1" },
    create_time: 1788307200
  });

  assert.equal(lead.commentId, "comment-1");
  assert.equal(lead.notificationId, "notification-1");
  assert.equal(lead.secUid, "sec-user-1");
  assert.equal(lead.externalUserId, "uid-1");
  assert.equal(lead.nickname, "张先生");
  assert.equal(lead.text, "请问这个方案多少钱？");
  assert.deepEqual(lead.source, {
    type: "comment",
    channel: "notification",
    videoId: "aweme-1",
    videoTitle: "门店方案介绍",
    videoUrl: "https://www.douyin.com/video/aweme-1",
    observedAt: 1788307200,
    notificationId: "notification-1"
  });
});

test("normalizes the provider's live comment notification shape", () => {
  const lead = normalizeDouyinCommentNotification({
    cursor: 1,
    channel: "douyin",
    notification_id: "7680950465470678053",
    notification_type: "comment",
    content: { type: "text", text: "这猫牛比" },
    notice_time: 1788360641,
    sender: {
      sec_uid: "sec-live-user-1",
      nickname: "LIA、",
      avatar: "https://example.com/avatar.jpg"
    }
  }, { now: () => "2026-09-02T10:00:00.000Z" });

  assert.equal(lead.notificationId, "7680950465470678053");
  assert.equal(lead.text, "这猫牛比");
  assert.equal(lead.secUid, "sec-live-user-1");
  assert.equal(lead.nickname, "LIA、");
  assert.equal(lead.source.observedAt, 1788360641);
});

test("waits through queued worker timeout, starts notification mode, and preserves model analysis metadata", async () => {
  const cloud = createFakeCloud({
    statuses: [
      { ok: true, state: "ONLINE", login_state: "logged_in", notification_mode: "starting" },
      { ok: true, state: "ONLINE", login_state: "logged_in", notification_mode: "running" }
    ],
    notifications: [{
      ok: true,
      data: {
        notifications: [{
          msg_id: "notification-2",
          comment_text: "预算 20 万，怎么预约？",
          user_info: { sec_uid: "sec-user-2", uid: "uid-2", nickname: "李女士" },
          video: { video_id: "video-2", title: "车型讲解" },
          timestamp: "2026-09-02T10:00:00.000Z"
        }]
      },
      next_cursor: 9
    }]
  });
  const analyses = [];
  const analyzer = {
    async analyze(input) {
      analyses.push(input);
      return {
        source: "model",
        provider: "llm.test",
        model: "test-model",
        generatedAt: "2026-09-02T10:00:01.000Z",
        items: [{ index: 0, tier: "high", score: 91, confidence: 0.97, reason: "评论直接表达预算和预约意向", signals: ["预算 20 万", "预约"] }]
      };
    }
  };
  const source = createDouyinCommentNotificationSource({
    cloudRegistry: cloud,
    analyzer,
    sleep: async () => {}
  });

  const result = await source.scan({
    agentId: "mkt-comment-acquisition",
    account: { uid: "account-1", nickname: "门店账号" },
    cursor: 4,
    goal: "找有明确购车预算并愿意预约的人",
    minScore: 80,
    limit: 20,
    requestId: "scan-1"
  });

  assert.equal(cloud.calls.start, 1);
  assert.deepEqual(cloud.calls.pull, [{ cursor: 4, limit: 20, waitMs: 0 }]);
  assert.equal(analyses.length, 1);
  assert.equal(analyses[0].comments[0].text, "预算 20 万，怎么预约？");
  assert.equal(result.ok, true);
  assert.equal(result.nextCursor, 9);
  assert.equal(result.leads.length, 1);
  assert.equal(result.leads[0].score, 91);
  assert.equal(result.leads[0].intent.source, "model");
  assert.equal(result.leads[0].intent.reason, "评论直接表达预算和预约意向");
  assert.equal(result.snapshot.analysis.source, "model");
});

test("treats an empty notification poll as a successful scan and keeps its cursor", async () => {
  const cloud = createFakeCloud({
    statuses: [{ ok: true, state: "ONLINE", login_state: "logged_in", notification_mode: "running" }],
    notifications: [{ ok: true, items: [], next_cursor: 12 }]
  });
  const source = createDouyinCommentNotificationSource({ cloudRegistry: cloud, sleep: async () => {} });

  const result = await source.scan({
    agentId: "mkt-comment-acquisition",
    account: { uid: "account-1" },
    cursor: 10,
    goal: "找客户"
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.leads, []);
  assert.equal(result.nextCursor, 12);
  assert.equal(result.snapshot.counts.notifications, 0);
});

test("keeps notification reads bound to the requested Douyin account scope", async () => {
  const cloud = createFakeCloud({
    statuses: [{ ok: true, state: "ONLINE", login_state: "logged_in", notification_mode: "running" }],
    notifications: [{ ok: true, items: [], next_cursor: 1 }]
  });
  const source = createDouyinCommentNotificationSource({ cloudRegistry: cloud, sleep: async () => {} });

  await source.scan({
    agentId: "mkt-comment-acquisition",
    accountId: "account-b",
    accountIdentity: { secUid: "sec-account-b" },
    tenantId: "tenant-1",
    account: { uid: "account-b" },
    goal: "找客户"
  });

  const expectedScope = { accountId: "account-b", accountIdentity: { secUid: "sec-account-b" }, tenantId: "tenant-1" };
  assert.deepEqual(cloud.calls.getServiceScopes, [expectedScope]);
  assert.deepEqual(cloud.calls.statusScopes, [{ ...expectedScope, resumeSaved: true }]);
});

test("distinguishes a logged-out account from an empty notification result", async () => {
  const cloud = createFakeCloud({
    statuses: [{ ok: true, state: "ONLINE", login_state: "logged_out", notification_mode: "running" }]
  });
  const source = createDouyinCommentNotificationSource({ cloudRegistry: cloud, sleep: async () => {} });

  await assert.rejects(
    () => source.scan({ agentId: "mkt-comment-acquisition", account: { uid: "account-1" }, goal: "找客户" }),
    (error) => error.code === "DOUYIN_AUTH_REQUIRED" && error.statusCode === 401
  );
  assert.equal(cloud.calls.pull.length, 0);
});
