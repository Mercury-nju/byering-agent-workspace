import assert from "node:assert/strict";
import test from "node:test";

import {
  ProspectServiceError,
  createProspectService,
  scoreText
} from "../backend/prospect-service.js";

function context(overrides = {}) {
  return {
    taskId: "task-prospect-1",
    taskRunId: "run-prospect-1",
    conversationId: "conversation-prospect-1",
    agentId: "lead_miner",
    goal: "找最近问价格和预算的客户",
    uid: 123456,
    tenant: 10001,
    ...overrides
  };
}

test("public prospect service fails closed when SpiderApi is not configured", async () => {
  const service = createProspectService({ env: {} });
  assert.equal(service.configured, false);
  await assert.rejects(
    service.discover(context()),
    (error) => error instanceof ProspectServiceError
      && error.code === "PROSPECT_NOT_CONFIGURED"
      && error.statusCode === 503
  );
});

test("prospect service uses SpiderApi video and comments endpoints and emits lead events", async () => {
  const calls = [];
  const service = createProspectService({
    connector: {
      configured: true,
      async videoList(input) {
        calls.push(["videoList", input]);
        return {
          code: 0,
          data: {
            itemList: [{
              videoId: "video-1",
              title: "新车介绍",
              shareUrl: "https://www.douyin.com/video/video-1",
              commentCount: 2,
              author: { uid: "author-1", nickname: "门店账号" }
            }]
          }
        };
      },
      async comments(input) {
        calls.push(["comments", input]);
        return {
          code: 0,
          data: {
            comments: [
              {
                aweme_id: "video-1",
                cid: "comment-1",
                text: "这款多少钱？预算 20 万，能试驾吗",
                user: { uid: "user-1", sec_uid: "sec-user-1", unique_id: "zhang001", nickname: "张先生", avatar_thumb: { url_list: ["https://img.example/avatar.jpg"] } },
                create_time: "2026-08-20T00:00:00.000Z"
              },
              {
                aweme_id: "video-1",
                cid: "comment-2",
                text: "拍得不错",
                user: { uid: "user-2", nickname: "路人" }
              }
            ]
          }
        };
      }
    }
  });

  const result = await service.discover(context());
  assert.equal(result.accepted, true);
  assert.equal(result.source, "prospect");
  assert.equal(result.status, "SUCCEEDED");
  assert.equal(result.resultSnapshot.counts.videos, 1);
  assert.equal(result.resultSnapshot.counts.comments, 2);
  assert.equal(result.resultSnapshot.counts.candidates, 2);
  assert.equal(result.resultSnapshot.counts.qualified, 1);
  assert.equal(result.resultSnapshot.leads[0].leadId, "user-1");
  assert.equal(result.resultSnapshot.leads[0].externalUserId, "user-1");
  assert.equal(result.resultSnapshot.leads[0].secUid, "sec-user-1");
  assert.equal(result.resultSnapshot.leads[0].uniqueId, "zhang001");
  assert.equal(result.resultSnapshot.leads[0].avatar, "https://img.example/avatar.jpg");
  assert.equal(result.resultSnapshot.leads[0].source.videoId, "video-1");
  assert.ok(result.events.some((event) => event.type === "lead.source.synced"));
  assert.ok(result.events.some((event) => event.type === "lead.qualified"));
  assert.ok(result.events.some((event) => event.type === "prospect.discovery.completed"));
  assert.deepEqual(calls.map(([name]) => name), ["videoList", "comments"]);
  assert.equal(calls[0][1].lastTime, undefined);
  assert.deepEqual(calls[1][1].videoIds, ["video-1"]);
});

test("prospect service preserves snake_case sec_id for direct SpiderApi inputs", async () => {
  const calls = [];
  const service = createProspectService({
    connector: {
      configured: true,
      async videoList(input) {
        calls.push(input);
        return { data: { itemList: [{ videoId: "video-snake" }] } };
      },
      async comments() {
        return { data: { comments: [{ aweme_id: "video-snake", uid: "buyer-snake", text: "请问价格？" }] } };
      }
    }
  });
  await service.discover({
    taskId: "task-snake-account",
    taskRunId: "run-snake-account",
    conversationId: "conversation-snake-account",
    uid: "local-uid",
    sec_id: "sec-snake",
    goal: "分析指定账号"
  });
  assert.equal(calls[0].uid, "local-uid");
  assert.equal(calls[0].secId, "sec-snake");
  assert.equal(calls[0].sec_id, "sec-snake");
});

test("account discovery resolves a visible Douyin handle before SpiderApi collection", async () => {
  const calls = [];
  const service = createProspectService({
    accountResolver: {
      async resolve(input) {
        assert.equal(input.uniqueId, "89254962461");
        assert.equal(input.accountName, "广州黄老板二手车");
        return {
          uid: "89254962461",
          secId: "MS4wLjABAAAAtest-sec",
          uniqueId: "89254962461",
          nickname: "广州黄老板二手车",
          source: "resolver"
        };
      }
    },
    connector: {
      configured: true,
      async videoList(input) {
        calls.push(["videoList", input]);
        assert.equal(input.uid, "89254962461");
        assert.equal(input.secId, "MS4wLjABAAAAtest-sec");
        return { data: { itemList: [{ videoId: "video-resolved", title: "现车展示" }] } };
      },
      async comments(input) {
        calls.push(["comments", input]);
        return { data: { comments: [{ aweme_id: "video-resolved", uid: "lead-1", text: "请问预算和落地价？" }] } };
      }
    }
  });
  const result = await service.discover({
    taskId: "task-account-resolve",
    taskRunId: "run-account-resolve",
    conversationId: "conversation-account-resolve",
    goal: "分析账号名称：广州黄老板二手车，抖音号：89254962461 的视频评论并找出高意向客户"
  });
  assert.equal(result.resultSnapshot.account.uid, "89254962461");
  assert.equal(result.resultSnapshot.account.secId, "MS4wLjABAAAAtest-sec");
  assert.equal(result.resultSnapshot.account.nickname, "广州黄老板二手车");
  assert.ok(result.events.some((item) => item.type === "account.resolved"));
  assert.deepEqual(calls.map(([name]) => name), ["videoList", "comments"]);
});

test("account discovery resolves a visible name without requiring a label", async () => {
  const service = createProspectService({
    accountResolver: {
      async resolve(input) {
        assert.equal(input.accountName, "广州黄老板二手车");
        return { uid: "douyin-user", secId: "sec-user", nickname: input.accountName };
      }
    },
    connector: {
      configured: true,
      async videoList(input) {
        assert.equal(input.secId, "sec-user");
        return { data: { itemList: [] } };
      },
      async comments() { return { data: { comments: [] } }; }
    }
  });
  const result = await service.discover({
    taskId: "task-inferred-account",
    taskRunId: "run-inferred-account",
    conversationId: "conversation-inferred-account",
    goal: "分析广州黄老板二手车的视频和评论"
  });
  assert.equal(result.resultSnapshot.account.nickname, "广州黄老板二手车");
});

test("account discovery accepts the visible 抖音账号 label used in task text", async () => {
  let reference;
  const service = createProspectService({
    accountResolver: {
      async resolve(input) {
        reference = input;
        return { uid: "douyin-user", secId: "sec-user", nickname: input.accountName };
      }
    },
    connector: {
      configured: true,
      async videoList() { return { data: { itemList: [] } }; },
      async comments() { return { data: { comments: [] } }; }
    }
  });
  await service.discover({
    taskId: "task-labeled-douyin-account",
    taskRunId: "run-labeled-douyin-account",
    conversationId: "conversation-labeled-douyin-account",
    goal: "分析抖音账号：广州黄老板二手车，抖音号：89254962461 的公开视频"
  });
  assert.equal(reference.accountName, "广州黄老板二手车");
  assert.equal(reference.uniqueId, "89254962461");
});

test("account discovery does not silently succeed when visible account data cannot be resolved", async () => {
  const service = createProspectService({
    env: {},
    connector: {
      configured: true,
      async videoList() { throw new Error("must not call SpiderApi"); },
      async comments() { throw new Error("must not call SpiderApi"); }
    }
  });
  await assert.rejects(
    service.discover({
      taskId: "task-account-unresolved",
      taskRunId: "run-account-unresolved",
      conversationId: "conversation-account-unresolved",
      accountName: "广州黄老板二手车",
      goal: "分析这个抖音账号的公开视频和评论"
    }),
    (error) => error.code === "ACCOUNT_RESOLVER_NOT_CONFIGURED" && error.statusCode === 503
  );
});

test("keyword-only prospect discovery rejects when no real search provider is configured", async () => {
  const service = createProspectService({
    connector: {
      configured: true,
      async videoList() { throw new Error("must not call account endpoint"); },
      async comments() { throw new Error("must not call comments endpoint"); }
    }
  });
  await assert.rejects(
    service.discover({
      taskId: "task-1",
      taskRunId: "run-1",
      conversationId: "conversation-1",
      goal: "找北京地区买车客户"
    }),
    (error) => error.code === "PROSPECT_PUBLIC_SEARCH_NOT_CONFIGURED" && error.statusCode === 503
  );
});

test("video-id seed can be enriched without a logged-in account", async () => {
  const service = createProspectService({
    connector: {
      configured: true,
      async videoList() { throw new Error("video list is not needed for a known video"); },
      async comments(input) {
        assert.deepEqual(input.videoIds, ["video-9"]);
        return { data: { comments: [{ video_id: "video-9", uid: "user-9", content: "请问落地价？" }] } };
      }
    }
  });
  const result = await service.discover({
    taskId: "task-9",
    taskRunId: "run-9",
    conversationId: "conversation-9",
    videoIds: "video-9",
    goal: "找高意向客户"
  });
  assert.equal(result.resultSnapshot.counts.candidates, 1);
  assert.equal(result.resultSnapshot.leads[0].leadId, "user-9");
  assert.equal(result.resultSnapshot.leads[0].tier, "medium");
});

test("a full public Douyin video URL is reduced to its aweme id before comment collection", async () => {
  const calls = [];
  const service = createProspectService({
    connector: {
      configured: true,
      async videoList() { throw new Error("video list is not needed for a known video"); },
      async comments(input) {
        calls.push(input);
        return { data: { comments: [{ aweme_id: "1234567890123456789", uid: "video-url-user", text: "请问落地价？" }] } };
      }
    }
  });
  const result = await service.discover({
    taskId: "task-video-url",
    taskRunId: "run-video-url",
    conversationId: "conversation-video-url",
    videoUrls: "https://www.douyin.com/video/1234567890123456789",
    goal: "分析这条作品评论"
  });
  assert.deepEqual(calls[0].videoIds, ["1234567890123456789"]);
  assert.equal(result.resultSnapshot.counts.candidates, 1);
});

test("natural task text can carry a full video URL without requiring account resolution", async () => {
  const calls = [];
  const service = createProspectService({
    connector: {
      configured: true,
      async videoList() { throw new Error("video list is not needed for a known video"); },
      async comments(input) {
        calls.push(input.videoIds);
        return { data: { comments: [{ aweme_id: "998877665544", uid: "goal-url-user", text: "预算 20 万能落地吗？" }] } };
      }
    }
  });
  await service.discover({
    taskId: "task-goal-video-url",
    taskRunId: "run-goal-video-url",
    conversationId: "conversation-goal-video-url",
    goal: "抓取这条作品评论：https://www.douyin.com/video/998877665544"
  });
  assert.deepEqual(calls, [["998877665544"]]);
});

test("batch account discovery resolves each public reference and aggregates evidence", async () => {
  const resolved = new Map([
    ["账号甲", { uid: "uid-a", secId: "sec-a", nickname: "账号甲" }],
    ["账号乙", { uid: "uid-b", secId: "sec-b", nickname: "账号乙" }]
  ]);
  const calls = [];
  const service = createProspectService({
    accountResolver: {
      async resolve(input) {
        return resolved.get(input.accountName);
      }
    },
    connector: {
      configured: true,
      async videoList(input) {
        calls.push(["videoList", input.uid]);
        return { data: { itemList: [{ videoId: `video-${input.uid}`, title: input.nickname }] } };
      },
      async comments(input) {
        calls.push(["comments", input.videoIds[0]]);
        return { data: { comments: [{ aweme_id: input.videoIds[0], uid: `lead-${input.uid}`, text: "请问预算和价格？" }] } };
      }
    }
  });
  const result = await service.discover({
    taskId: "task-account-batch",
    taskRunId: "run-account-batch",
    conversationId: "conversation-account-batch",
    accounts: ["账号甲", "账号乙"],
    goal: "从公开作品评论找购车客户"
  });
  assert.equal(result.status, "SUCCEEDED");
  assert.equal(result.resultSnapshot.batch, true);
  assert.equal(result.resultSnapshot.counts.accounts, 2);
  assert.equal(result.resultSnapshot.counts.videos, 2);
  assert.equal(result.resultSnapshot.counts.candidates, 2);
  assert.deepEqual(calls, [
    ["videoList", "uid-a"],
    ["comments", "video-uid-a"],
    ["videoList", "uid-b"],
    ["comments", "video-uid-b"]
  ]);
  assert.equal(new Set(result.events.map((event) => event.eventId)).size, result.events.length);
});

test("natural task text can carry a bounded account list", async () => {
  const accountNames = [];
  const service = createProspectService({
    accountResolver: {
      async resolve(input) {
        accountNames.push(input.accountName);
        return { uid: `uid-${input.accountName}`, secId: `sec-${input.accountName}`, nickname: input.accountName };
      }
    },
    connector: {
      configured: true,
      async videoList(input) { return { data: { itemList: [{ videoId: `video-${input.uid}` }] } }; },
      async comments(input) { return { data: { comments: [{ aweme_id: input.videoIds[0], uid: input.uid, text: "请问价格？" }] } }; }
    }
  });
  const result = await service.discover({
    taskId: "task-goal-account-list",
    taskRunId: "run-goal-account-list",
    conversationId: "conversation-goal-account-list",
    goal: "分析抖音账号：账号甲、账号乙的公开视频和评论"
  });
  assert.deepEqual(accountNames, ["账号甲", "账号乙"]);
  assert.equal(result.resultSnapshot.counts.accounts, 2);
});

test("a single account prompt with a handle is not expanded into a fake batch", async () => {
  const calls = [];
  const service = createProspectService({
    accountResolver: {
      async resolve(input) {
        calls.push(input);
        return { uid: "uid-single", secId: "sec-single", nickname: input.accountName || "账号甲" };
      }
    },
    connector: {
      configured: true,
      async videoList(input) {
        return { data: { itemList: [{ videoId: `video-${input.uid}` }] } };
      },
      async comments(input) {
        return { data: { comments: [{ aweme_id: input.videoIds[0], uid: "lead-single", text: "请问价格？" }] } };
      }
    }
  });
  const result = await service.discover({
    taskId: "task-single-account",
    taskRunId: "run-single-account",
    conversationId: "conversation-single-account",
    goal: "分析抖音账号：广州黄老板二手车，抖音号：89254962461，抓取公开视频和公开评论"
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].accountName, "广州黄老板二手车");
  assert.equal(result.resultSnapshot.batch, undefined);
  assert.equal(result.resultSnapshot.counts.accounts, undefined);
});

test("nested credentials in an account batch are rejected", async () => {
  const service = createProspectService({
    connector: { configured: true, videoList: async () => ({}), comments: async () => ({}) }
  });
  await assert.rejects(
    service.discover({
      taskId: "task-batch-secret",
      taskRunId: "run-batch-secret",
      conversationId: "conversation-batch-secret",
      accounts: [{ accountName: "账号甲", password: "should-not-pass" }],
      goal: "找公开潜客"
    }),
    (error) => error.code === "PROSPECT_CREDENTIALS_FORBIDDEN" && error.statusCode === 400
  );
});

test("short video URLs still fail closed because they need a redirect resolver", async () => {
  const service = createProspectService({
    connector: { configured: true, videoList: async () => ({}), comments: async () => ({}) }
  });
  await assert.rejects(
    service.discover({
      taskId: "task-url-seed",
      taskRunId: "run-url-seed",
      conversationId: "conversation-url-seed",
      videoUrls: "https://v.douyin.com/abc123/",
      goal: "找潜客"
    }),
    (error) => error.code === "PROSPECT_VIDEO_ID_REQUIRED" && error.statusCode === 400
  );
});

test("callback normalizes asynchronous SpiderApi comment payload into stage events", async () => {
  const service = createProspectService({
    connector: { configured: true, videoList: async () => ({}), comments: async () => ({}) }
  });
  const result = await service.callback({
    taskId: "task-callback",
    taskRunId: "run-callback",
    conversationId: "conversation-callback",
    goal: "找客户"
  }, {
    uid: "123",
    comments: [{ aweme_id: "v1", cid: "c1", text: "有现车吗？", user: { uid: "u1", nickname: "李先生" } }]
  });
  assert.equal(result.status, "SUCCEEDED");
  assert.ok(result.events.at(-1).type === "prospect.discovery.completed");
  assert.equal(result.resultSnapshot.leads[0].account, "李先生");
});

test("pending Spider callbacks do not emit a stage completion event", async () => {
  const service = createProspectService({
    connector: { configured: true, videoList: async () => ({}), comments: async () => ({}) }
  });
  const result = await service.callback({
    taskId: "task-pending-callback",
    taskRunId: "run-pending-callback",
    conversationId: "conversation-pending-callback",
    goal: "找客户"
  }, {
    trace_id: "trace-pending",
    status: "queued"
  });
  assert.equal(result.status, "PENDING");
  assert.equal(result.resultSnapshot.status, "pending");
  assert.equal(result.events.some((event) => event.type === "prospect.discovery.completed"), false);
});

test("duplicate public identities are merged by sec_uid before uid", async () => {
  const service = createProspectService({
    connector: {
      configured: true,
      videoList: async () => ({ data: { itemList: [{ videoId: "v-dup" }] } }),
      comments: async () => ({ data: { comments: [
        { aweme_id: "v-dup", uid: "uid-a", text: "请问价格？", user: { sec_uid: "same-sec", nickname: "用户甲" } },
        { aweme_id: "v-dup", uid: "uid-b", text: "有现车吗？预算多少？", user: { sec_uid: "same-sec", nickname: "用户甲" } }
      ] } })
    }
  });
  const result = await service.discover({
    taskId: "task-dedup",
    taskRunId: "run-dedup",
    conversationId: "conversation-dedup",
    uid: 123,
    goal: "找高意向客户"
  });
  assert.equal(result.resultSnapshot.counts.comments, 2);
  assert.equal(result.resultSnapshot.counts.candidates, 1);
  assert.equal(result.resultSnapshot.leads[0].secUid, "same-sec");
  assert.equal(result.resultSnapshot.leads[0].evidence.length, 2);
});

test("video-list callback continues into the comments SpiderApi call", async () => {
  const calls = [];
  const service = createProspectService({
    callbackUrl: "https://byering.example/v1/connectors/prospect/events",
    connector: {
      configured: true,
      videoList: async () => ({}),
      comments: async (input) => {
        calls.push(input);
        return { code: 200, data: { comments: [{ aweme_id: "video-1", uid: "u-1", text: "请问价格？" }] } };
      }
    }
  });
  const result = await service.callback({
    taskId: "task-video-callback",
    taskRunId: "run-video-callback",
    conversationId: "conversation-video-callback",
    goal: "找买车客户"
  }, {
    itemList: [{ video_id: "video-1", share_url: "https://www.douyin.com/video/video-1" }]
  });
  assert.deepEqual(calls[0].videoIds, ["video-1"]);
  assert.equal(result.resultSnapshot.counts.candidates, 1);
  assert.ok(result.events.some((event) => event.type === "prospect.discovery.completed"));
});

test("queued comments tasks remain pending instead of becoming empty leads", async () => {
  const service = createProspectService({
    connector: {
      configured: true,
      videoList: async () => ({ code: 200, data: { itemList: [{ videoId: "video-queued" }] } }),
      comments: async () => ({ code: 200, data: {
        tasks: [{ aweme_id: "video-queued", status: "queued", trace_id: "trace-comments" }]
      } })
    }
  });
  const result = await service.discover({
    taskId: "task-comments-queued",
    taskRunId: "run-comments-queued",
    conversationId: "conversation-comments-queued",
    uid: 321,
    goal: "找潜客"
  });
  assert.equal(result.status, "PENDING");
  assert.equal(result.resultSnapshot.counts.candidates, 0);
  assert.equal(result.resultSnapshot.leads.length, 0);
  assert.equal(result.resultSnapshot.traces[0].traceId, "trace-comments");
  assert.equal(result.events.some((event) => event.type === "prospect.discovery.completed"), false);
});

test("video callback preserves the queued comments trace for resume", async () => {
  const service = createProspectService({
    callbackUrl: "https://byering.example/v1/connectors/prospect/events",
    connector: {
      configured: true,
      videoList: async () => ({}),
      comments: async () => ({ code: 200, data: {
        tasks: [{ aweme_id: "video-callback-queued", status: "queued", trace_id: "trace-callback-comments" }]
      } })
    }
  });
  const result = await service.callback({
    taskId: "task-callback-queued",
    taskRunId: "run-callback-queued",
    conversationId: "conversation-callback-queued",
    goal: "找潜客"
  }, { itemList: [{ video_id: "video-callback-queued" }] });
  assert.equal(result.status, "PENDING");
  assert.deepEqual(result.resultSnapshot.traces, [{ operation: "comments", traceId: "trace-callback-comments" }]);
});

test("incremental callbacks keep stable ids for old leads and unique ids for new leads", async () => {
  let batch = 0;
  const service = createProspectService({
    connector: {
      configured: true,
      videoList: async () => ({ data: { itemList: [{ videoId: "video-incremental" }] } }),
      comments: async () => {
        batch += 1;
        const comments = [{ aweme_id: "video-incremental", uid: "user-old", text: "请问价格？" }];
        if (batch > 1) comments.push({ aweme_id: "video-incremental", uid: "user-new", text: "有现车吗？" });
        return { data: { comments } };
      }
    }
  });
  const input = {
    taskId: "task-incremental",
    taskRunId: "run-incremental",
    conversationId: "conversation-incremental",
    uid: 789,
    goal: "找潜客"
  };
  const first = await service.discover(input);
  const second = await service.discover(input);
  const firstIds = first.events.filter((event) => event.type === "lead.candidate").map((event) => event.eventId);
  const secondIds = second.events.filter((event) => event.type === "lead.candidate").map((event) => event.eventId);
  assert.equal(firstIds.length, 1);
  assert.equal(secondIds.length, 2);
  assert.ok(secondIds.includes(firstIds[0]));
  assert.equal(new Set(secondIds).size, 2);
});

test("signal scoring is deterministic and never requires a model or account", () => {
  assert.deepEqual(scoreText("预算 20 万，想了解落地价", "找买车客户"), {
    score: 36,
    matchedTerms: ["预算", "落地"]
  });
  assert.equal(scoreText("拍得不错", "").score, 0);
});

test("minScore filters public candidates while preserving the raw comment count", async () => {
  const service = createProspectService({
    connector: {
      configured: true,
      async videoList() { return { data: { itemList: [{ videoId: "v-score" }] } }; },
      async comments() {
        return { data: { comments: [
          { aweme_id: "v-score", uid: "qualified", text: "预算 20 万，请问落地价？" },
          { aweme_id: "v-score", uid: "weak", text: "拍得不错" }
        ] } };
      }
    }
  });
  const result = await service.discover({
    taskId: "task-min-score",
    taskRunId: "run-min-score",
    conversationId: "conversation-min-score",
    uid: "account-score",
    minScore: 30,
    goal: "筛选公开评论"
  });
  assert.equal(result.resultSnapshot.counts.comments, 2);
  assert.equal(result.resultSnapshot.counts.candidates, 1);
  assert.equal(result.resultSnapshot.leads[0].leadId, "qualified");
});

test("configured callback URL is correlated with the task without exposing account credentials", async () => {
  let request;
  const service = createProspectService({
    callbackUrl: "https://byering.example/v1/connectors/prospect/events",
    connector: {
      configured: true,
      videoList: async (input) => { request = input; return { code: 200, data: { itemList: [] } }; },
      comments: async () => ({ code: 200, data: { tasks: [] } })
    }
  });
  await service.discover({
    taskId: "task-callback-url",
    taskRunId: "run-callback-url",
    conversationId: "conversation-callback-url",
    uid: 99,
    goal: "找潜客"
  });
  const callback = new URL(request.callbackUrl);
  assert.equal(callback.searchParams.get("taskId"), "task-callback-url");
  assert.equal(callback.searchParams.get("taskRunId"), "run-callback-url");
  assert.equal(callback.searchParams.get("conversationId"), "conversation-callback-url");
});
