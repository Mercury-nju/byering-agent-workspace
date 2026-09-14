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

test("comment lead miner rejects public comment discovery", async () => {
  let connectorCalled = false;
  const service = createProspectService({
    connector: {
      configured: true,
      async videoList() { connectorCalled = true; return { data: { itemList: [] } }; },
      async comments() { connectorCalled = true; return { data: { comments: [] } }; }
    }
  });
  await assert.rejects(
    service.discover(context({
      agentId: "mkt-lead-miner",
      sourceOwner: "other",
      sourceScope: "public_content",
      analysisOnly: true,
      profileUrl: "https://www.douyin.com/user/public"
    })),
    (error) => error instanceof ProspectServiceError
      && error.code === "PROSPECT_OWN_ACCOUNT_REQUIRED"
      && error.statusCode === 400
  );
  assert.equal(connectorCalled, false);
});

test("comment lead miner requires an authorized account id", async () => {
  const service = createProspectService({
    connector: {
      configured: true,
      async videoList() { throw new Error("must not collect"); },
      async comments() { throw new Error("must not collect"); }
    }
  });
  await assert.rejects(
    service.discover(context({
      agentId: "mkt-lead-miner",
      sourceOwner: "own",
      sourceScope: "own_account_comments",
      analysisOnly: false,
      profileUrl: "https://www.douyin.com/user/owner"
    })),
    (error) => error instanceof ProspectServiceError
      && error.code === "PROSPECT_OWN_ACCOUNT_REQUIRED"
      && error.details?.field === "accountId"
  );
});

test("comment lead miner collects explicitly selected works for its authorized account", async () => {
  let commentRequest;
  const service = createProspectService({
    connector: {
      configured: true,
      async videoList() { throw new Error("selected works must not list all account videos"); },
      async comments(input) {
        commentRequest = input;
        return { data: { comments: [{ aweme_id: "video-own", uid: "buyer-own", text: "请问多少钱？" }] } };
      }
    }
  });
  const result = await service.discover(context({
    agentId: "mkt-lead-miner",
    sourceOwner: "own",
    sourceScope: "own_account_comments",
    sourceDimension: "works",
    analysisOnly: false,
    accountId: "douyin-agent:mkt-lead-miner",
    uid: "owner-uid",
    secId: "owner-sec",
    profileUrl: "https://www.douyin.com/user/owner",
    videoIds: ["video-own"],
    videoUrls: ["https://www.douyin.com/video/video-own"]
  }));
  assert.equal(result.accepted, true);
  assert.deepEqual(commentRequest.videoIds, ["video-own"]);
  assert.equal(commentRequest.secId, "owner-sec");
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

test("profile URL discovery resolves the visible account identity before collection", async () => {
  let resolvedInput;
  const service = createProspectService({
    accountResolver: {
      configured: true,
      async resolve(input) {
        resolvedInput = input;
        return {
          uid: "2230275916170030",
          secId: "MS4wLjABAAAAtest-profile-sec",
          uniqueId: "83363861802",
          nickname: "浩鑫影视",
          profileUrl: input.profileUrl,
          source: "resolver"
        };
      }
    },
    connector: {
      configured: true,
      async videoList(input) {
        assert.equal(input.uid, "2230275916170030");
        assert.equal(input.secId, "MS4wLjABAAAAtest-profile-sec");
        return { data: { itemList: [] } };
      },
      async comments() { return { data: { comments: [] } }; }
    }
  });
  const profileUrl = "https://www.douyin.com/user/MS4wLjABAAAAtest-profile-sec";
  const result = await service.discover({
    taskId: "task-profile-resolve",
    taskRunId: "run-profile-resolve",
    conversationId: "conversation-profile-resolve",
    profileUrl,
    goal: "读取主页作品评论"
  });
  assert.equal(resolvedInput.profileUrl, profileUrl);
  assert.equal(result.resultSnapshot.account.nickname, "浩鑫影视");
  assert.equal(result.resultSnapshot.account.uniqueId, "83363861802");
});

test("recent work count is independent from the comment time window", async () => {
  let videoRequest;
  const service = createProspectService({
    accountResolver: {
      configured: true,
      async resolve(input) {
        return { uid: "uid-window", secId: "sec-window", nickname: "窗口账号", profileUrl: input.profileUrl };
      }
    },
    connector: {
      configured: true,
      async videoList(input) {
        videoRequest = input;
        return { data: { itemList: [{ videoId: "video-window", title: "作品" }] } };
      },
      async comments() {
        return { data: { comments: [{ aweme_id: "video-window", uid: "lead-window", text: "请问价格？", create_time: Math.floor(Date.now() / 1000) }] } };
      }
    }
  });
  const result = await service.discover({
    taskId: "task-window",
    taskRunId: "run-window",
    conversationId: "conversation-window",
    profileUrl: "https://www.douyin.com/user/window",
    videoLimit: 10,
    commentLimit: 50,
    lookbackDays: 7,
    goal: "读取作品评论"
  });
  assert.equal(videoRequest.lastTime, undefined);
  assert.equal(result.resultSnapshot.counts.videos, 1);
  assert.equal(result.resultSnapshot.counts.comments, 1);
});

test("comment filter mode returns matched comments without purchase intent tiers", async () => {
  const service = createProspectService({
    intentAnalyzer: {
      async analyze(input) {
        assert.equal(input.mode, "filter");
        return {
          mode: "filter", source: "model", provider: "llm.test", model: "filter-model", generatedAt: "2026-08-31T00:00:00.000Z",
          items: input.comments.map((comment, index) => ({
            index,
            matched: index === 0,
            confidence: index === 0 ? 0.95 : 0.9,
            reason: index === 0 ? "明确表达不满" : "中性讨论",
            signals: index === 0 ? ["太差"] : []
          }))
        };
      }
    },
    connector: {
      configured: true,
      async videoList() { return { data: { itemList: [{ videoId: "video-filter", title: "作品" }] } }; },
      async comments() {
        return { data: { comments: [
          { aweme_id: "video-filter", uid: "negative-user", text: "这个太差了" },
          { aweme_id: "video-filter", uid: "neutral-user", text: "颜色很好看" }
        ] } };
      }
    }
  });
  const result = await service.discover({
    ...context({ goal: "筛选负面评价", analysisMode: "filter" }),
    uid: "account-filter"
  });
  assert.equal(result.resultSnapshot.analysis.mode, "filter");
  assert.equal(result.resultSnapshot.analysis.source, "model");
  assert.equal(result.resultSnapshot.analysis.counts.matched, 1);
  assert.equal(result.resultSnapshot.counts.high, 0);
  assert.equal(result.resultSnapshot.leads.length, 1);
  assert.equal(result.resultSnapshot.leads[0].filter.matched, true);
  assert.equal(result.resultSnapshot.leads[0].tier, undefined);
  assert.equal(result.resultSnapshot.comments[1].filter.matched, false);
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

test("prospect service applies model intent decisions and preserves auditable fields", async () => {
  const calls = [];
  const service = createProspectService({
    env: {},
    intentAnalyzer: {
      async analyze(input) {
        calls.push(input);
        return {
          source: "model",
          provider: "llm.test",
          model: "test-model",
          generatedAt: "2026-08-31T00:00:00.000Z",
          items: [
            { index: 0, tier: "high", score: 92, confidence: 0.97, reason: "明确询价并给出预算", signals: ["价格", "预算"] },
            { index: 1, tier: "low", score: 6, confidence: 0.88, reason: "只有泛兴趣表达", signals: ["泛兴趣"] }
          ]
        };
      }
    },
    connector: {
      configured: true,
      async videoList() { return { data: { itemList: [{ videoId: "v-intent", title: "作品" }] } }; },
      async comments() { return { data: { comments: [
        { aweme_id: "v-intent", uid: "buyer", text: "预算 20 万，多少钱？" },
        { aweme_id: "v-intent", uid: "viewer", text: "拍得不错" }
      ] } }; }
    }
  });
  const result = await service.discover({ ...context({ taskId: "task-intent", taskRunId: "run-intent" }) });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].comments.length, 2);
  assert.equal(result.resultSnapshot.analysis.mode, "model");
  assert.deepEqual(result.resultSnapshot.analysis.counts, { high: 1, medium: 0, low: 1, modelReviewed: 2 });
  assert.equal(result.resultSnapshot.leads.find((lead) => lead.leadId === "buyer").intent.reason, "明确询价并给出预算");
  assert.equal(result.resultSnapshot.leads.find((lead) => lead.leadId === "buyer").intent.source, "model");
});

test("prospect service records heuristic fallback when intent model is unavailable", async () => {
  const service = createProspectService({
    env: {},
    intentAnalyzer: { async analyze() { throw new Error("model offline"); } },
    connector: {
      configured: true,
      async videoList() { return { data: { itemList: [{ videoId: "v-fallback" }] } }; },
      async comments() { return { data: { comments: [{ aweme_id: "v-fallback", uid: "viewer", text: "拍得不错" }] } }; }
    }
  });
  const result = await service.discover({ ...context({ taskId: "task-fallback", taskRunId: "run-fallback" }) });
  assert.equal(result.resultSnapshot.analysis.mode, "heuristic");
  assert.equal(result.resultSnapshot.analysis.error, "MODEL_UNAVAILABLE");
  assert.equal(result.resultSnapshot.leads[0].intent.source, "heuristic");
});

test("composite finder collection mode preserves raw candidates without intent ranking", async () => {
  let analyzerCalled = false;
  const service = createProspectService({
    env: {},
    intentAnalyzer: { async analyze() { analyzerCalled = true; throw new Error("must not analyze during discovery"); } },
    connector: {
      configured: true,
      async videoList() { return { data: { itemList: [{ videoId: "v-collect", title: "作品" }] } }; },
      async comments() { return { data: { comments: [{ aweme_id: "v-collect", uid: "collect-user", text: "想了解价格" }] } }; }
    }
  });
  const result = await service.discover({
    ...context({
      taskId: "task-collect",
      taskRunId: "run-collect",
      agentId: "mkt-find-people",
      sourceOwner: "own",
      sourceScope: "own_account_comments",
      analysisOnly: false,
      accountId: "douyin-agent:mkt-find-people",
      analysisMode: "collect",
      uid: "owner-uid",
      secId: "owner-sec"
    })
  });
  const lead = result.resultSnapshot.leads[0];
  assert.equal(analyzerCalled, false);
  assert.equal(result.resultSnapshot.analysis.mode, "collect");
  assert.equal(result.resultSnapshot.counts.pendingAnalysis, 1);
  assert.equal(lead.score, undefined);
  assert.equal(lead.tier, undefined);
  assert.equal(lead.intent, undefined);
});

test("intent analyst evaluates supplied candidates without fetching new Douyin data", async () => {
  let analyzerInput;
  const service = createProspectService({
    env: {},
    connector: {
      configured: true,
      async videoList() { throw new Error("intent analysis must not fetch videos"); },
      async comments() { throw new Error("intent analysis must not fetch comments"); }
    },
    intentAnalyzer: {
      async analyze(input) {
        analyzerInput = input;
        return {
          source: "model",
          provider: "llm.test",
          model: "intent-model",
          generatedAt: "2026-09-10T00:00:00.000Z",
          items: [{ index: 0, tier: "high", score: 91, confidence: 0.94, reason: "明确询价并给出预算", signals: ["价格", "预算"] }]
        };
      }
    }
  });
  const result = await service.analyze({
    ...context({
      taskId: "task-intent-agent",
      taskRunId: "run-intent-agent",
      agentId: "mkt-intent-analyst",
      skillId: "intent_analysis",
      goal: "判断这些用户的联系优先级"
    }),
    sourceResultId: "run:mkt-find-people::task-collect::account-1",
    sourceTaskId: "task-collect",
    sourceScope: "own_account_comments",
    candidates: [{
      sourceRecordId: "lead:source::collect-user",
      leadId: "collect-user",
      nickname: "待判断用户",
      secUid: "sec-collect-user",
      text: "预算 20 万，多少钱？",
      source: { videoId: "v-collect", videoTitle: "作品" },
      evidence: [{ quote: "预算 20 万，多少钱？", videoId: "v-collect" }]
    }]
  });
  assert.equal(analyzerInput.comments.length, 1);
  assert.equal(analyzerInput.comments[0].text, "预算 20 万，多少钱？");
  assert.equal(result.resultSnapshot.analysis.mode, "model");
  assert.equal(result.resultSnapshot.leads[0].sourceRecordId, "lead:source::collect-user");
  assert.equal(result.resultSnapshot.leads[0].tier, "high");
  assert.equal(result.resultSnapshot.leads[0].score, 91);
  assert.equal(result.resultSnapshot.links.sourceTaskId, "task-collect");
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
