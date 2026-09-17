import assert from "node:assert/strict";
import test from "node:test";

import { createGoldAccountContextService } from "../backend/gold-account-context.js";

test("Gold account context reads the account profile, exactly three recent videos, and their comments before analysis", async () => {
  const calls = [];
  const service = createGoldAccountContextService({
    profileDataClient: {
      async profile(secUid, options) {
        calls.push({ type: "profile", secUid, options });
        return { sec_uid: secUid, nickname: "臻选新能源·上海", signature: "新能源 SUV 试驾预约" };
      },
      async videosLatest(secUid, options) {
        calls.push({ type: "videos", secUid, options });
        return {
          videos: [
            { aweme_id: "video-1", desc: "上海新能源 SUV 置换补贴", create_time: 3 },
            { aweme_id: "video-2", desc: "家用 SUV 怎么选", create_time: 2 },
            { aweme_id: "video-3", desc: "到店试驾体验", create_time: 1 },
            { aweme_id: "video-4", desc: "不应进入上下文", create_time: 0 }
          ]
        };
      }
    },
    commentDataClient: {
      async getComments(input) {
        calls.push({ type: "comments", input });
        return {
          comments: [
            { comment_id: "comment-1", aweme_id: "video-1", text: "这个价格包含购置税吗？" },
            { comment_id: "comment-2", aweme_id: "video-2", content: "可以零首付分期吗？" }
          ]
        };
      }
    },
    analyzer: async ({ objective, account, evidence }) => ({
      summary: `${account.nickname}围绕${objective}承接用户`,
      positioning: "新能源 SUV 试驾咨询",
      recurringQuestions: evidence.filter((item) => item.type === "comment").map((item) => item.text),
      unknowns: ["具体价格需人工确认"]
    }),
    now: () => 1_700_000_000_000
  });

  const snapshot = await service.run({
    accountId: "account-1",
    accountIdentity: { secUid: "sec-1" },
    objective: "拿到用户留资",
    force: true
  });

  assert.equal(snapshot.status, "ready");
  assert.equal(snapshot.account.secUid, "sec-1");
  assert.equal(snapshot.videos.length, 3);
  assert.equal(snapshot.videos.some((video) => video.id === "video-4"), false);
  assert.deepEqual(calls.map((call) => call.type), ["profile", "videos", "comments"]);
  assert.deepEqual(calls[2].input.videoIds, ["video-1", "video-2", "video-3"]);
  assert.equal(calls[0].options.fresh, true);
  assert.equal(calls[1].options.count, 3);
  assert.equal(calls[1].options.fresh, true);
  assert.equal(snapshot.analysis.summary, "臻选新能源·上海围绕拿到用户留资承接用户");
  assert.deepEqual(snapshot.analysis.recurringQuestions, ["这个价格包含购置税吗？", "可以零首付分期吗？"]);
  assert.equal(snapshot.evidence.filter((item) => item.type === "comment").length, 2);
  assert.ok(snapshot.revision);
});

test("Gold account context remains usable as a partial snapshot when public comments are unavailable", async () => {
  const service = createGoldAccountContextService({
    profileDataClient: {
      async profile() { return { sec_uid: "sec-2", nickname: "测试账号" }; },
      async videosLatest() { return { videos: [{ aweme_id: "video-1", desc: "测试作品" }] }; }
    },
    commentDataClient: {
      async getComments() { throw Object.assign(new Error("comment service unavailable"), { code: "UPSTREAM_DOWN" }); }
    },
    analyzer: async () => ({ summary: "基于公开资料完成初步分析" })
  });

  const snapshot = await service.run({ accountId: "account-2", accountIdentity: { secUid: "sec-2" } });

  assert.equal(snapshot.status, "partial");
  assert.equal(snapshot.errors[0].stage, "comments");
  assert.equal(snapshot.analysis.summary, "基于公开资料完成初步分析");
});
