import assert from "node:assert/strict";
import test from "node:test";

import { createDouyinFinderService, hasMatchEvidence } from "../backend/douyin-finder-service.js";

function fakeClient() {
  const calls = [];
  const client = {
    configured: true,
    calls,
    async industryList() { calls.push("industry.list"); return { items: [{ industry: "教育培训" }] }; },
    async hotwords(industry) { calls.push(`industry.hotwords:${industry}`); return { items: [{ word: "课程" }] }; },
    async resolve(input) { calls.push(`account.resolve:${input}`); return { sec_uid: "MS4wLjABAAAAabcdefghijklmnop", nickname: "示例账号", profile_url: input }; },
    async profile() { calls.push("account.profile"); return { sec_uid: "MS4wLjABAAAAabcdefghijklmnop", nickname: "示例账号", follower_count: 12000, aweme_count: 80, province: "上海" }; },
    async videosLatest() { calls.push("account.videos-latest"); return { items: [{ aweme_id: "v-1", desc: "上海课程分享", digg_count: 600 }] }; },
    async videoDetail() { calls.push("video.detail"); return { aweme_id: "v-1", desc: "详情" }; },
    async liveRoom() { calls.push("live.room"); return { is_live: true, title: "课程直播" }; }
  };
  return client;
}

test("finder evidence gate rejects empty evidence and accepts readable evidence", () => {
  assert.equal(hasMatchEvidence({ evidence: [{}] }), false);
  assert.equal(hasMatchEvidence({ evidence: [{ type: "content", keywords: ["家居改造"] }] }), true);
  assert.equal(hasMatchEvidence({ reasons: ["主页命中家居改造"] }), true);
});

test("finder service supports natural language plus all account data capabilities", async () => {
  const client = fakeClient();
  const service = createDouyinFinderService({ client, now: () => Date.parse("2026-09-03T00:00:00.000Z") });
  const result = await service.run({
    taskId: "task-1",
    taskRunId: "run-1",
    goal: "找上海的教育培训账号",
    inputs: "https://www.douyin.com/user/example",
    industry: "教育培训",
    detailLimit: 1,
    checkLive: true,
    includeIndustryContext: true,
    locations: ["上海"],
    minFollowers: 10000
  });
  assert.equal(result.status, "SUCCEEDED");
  assert.equal(result.stage, "completed");
  assert.equal(result.counts.matched, 1);
  assert.equal(result.counts.enriched, 1);
  assert.deepEqual(result.capabilitiesUsed.sort(), ["account.profile", "account.resolve", "account.videos-latest", "industry.hotwords", "industry.list", "live.room", "video.detail"]);
  assert.equal(result.industryContext.hotwords.items[0].word, "课程");
  assert.equal(result.accounts[0].score > 0, true);
});

test("finder service refuses to fake command-first discovery when account search is unavailable", async () => {
  const client = fakeClient();
  const service = createDouyinFinderService({ client });
  assert.equal(service.discoveryConfigured, false);
  await assert.rejects(
    service.run({ goal: "找教育培训账号", industry: "教育培训" }),
    (error) => {
      assert.equal(error.code, "DOUYIN_FINDER_DISCOVERY_NOT_CONFIGURED");
      assert.equal(error.statusCode, 503);
      assert.match(error.message, /账号搜索接口/);
      return true;
    }
  );
  assert.deepEqual(client.calls, []);
});

test("finder service enriches candidates discovered from the command", async () => {
  const client = fakeClient();
  const discoveryCalls = [];
  const service = createDouyinFinderService({
    client,
    discoveryService: {
      async discover(input) {
        discoveryCalls.push(input.goal);
        return { candidates: [{ sec_uid: "MS4wLjABAAAAabcdefghijklmnop" }] };
      }
    }
  });
  const result = await service.run({ goal: "找教育培训账号", detailLimit: 0 });
  assert.equal(result.status, "SUCCEEDED");
  assert.deepEqual(discoveryCalls, ["找教育培训账号"]);
  assert.equal(result.counts.discovered, 1);
  assert.equal(result.accounts.length, 1);
  assert.equal(result.counts.resolved, 1);
  assert.equal(result.accounts[0].evidence.some((item) => item.type === "profile"), true);
  assert.equal(result.capabilitiesUsed.includes("candidate.search"), true);
});

test("finder service retries one task-level discovery failure before ending the run", async () => {
  const client = fakeClient();
  const progress = [];
  let attempts = 0;
  const service = createDouyinFinderService({
    client,
    discoveryRetryDelayMs: 0,
    discoveryService: {
      async discover() {
        attempts += 1;
        if (attempts === 1) throw Object.assign(new Error("temporary upstream failure"), { code: "ACCOUNT_RESOLVER_UPSTREAM_REJECTED" });
        return { candidates: [{ sec_uid: "MS4wLjABAAAAabcdefghijklmnop" }] };
      }
    }
  });

  const result = await service.run({
    goal: "找教育培训账号",
    onProgress(event) { progress.push(event); }
  });

  assert.equal(attempts, 2);
  assert.equal(result.status, "SUCCEEDED");
  assert.equal(result.counts.discovered, 1);
  assert.equal(result.counts.delivered, 1);
  assert.equal(progress.some((event) => event.stage === "search_retrying"), true);
});

test("finder service uses account search without requiring reference accounts", async () => {
  const client = fakeClient();
  const searchCalls = [];
  const service = createDouyinFinderService({
    client,
    accountResolver: {
      async search(input) {
        searchCalls.push(input.query);
        return { candidates: [{ sec_uid: "MS4wLjABAAAAabcdefghijklmnop" }] };
      }
    }
  });
  const result = await service.run({ goal: "找上海做家居改造、近期还在更新的账号" });
  assert.deepEqual(searchCalls, ["找上海做家居改造、近期还在更新的账号"]);
  assert.equal(result.counts.input, 0);
  assert.equal(result.counts.discovered, 1);
  assert.equal(result.counts.resolved, 1);
});

test("finder service merges optional reference accounts with discovered candidates", async () => {
  const client = fakeClient();
  const service = createDouyinFinderService({
    client,
    accountResolver: {
      async search() {
        return { candidates: [{ sec_uid: "MS4wLjABAAAAsecondcandidate" }] };
      }
    }
  });
  const result = await service.run({
    goal: "找家居改造账号",
    inputs: "https://www.douyin.com/user/reference-account"
  });
  assert.equal(result.counts.input, 1);
  assert.equal(result.counts.discovered, 1);
  assert.equal(result.counts.resolved, 2);
  assert.equal(client.calls.filter((call) => call.startsWith("account.resolve:")).length, 2);
});

test("finder service treats a profile URL and its embedded sec_uid as one account", async () => {
  const client = fakeClient();
  const service = createDouyinFinderService({ client });
  const secUid = "MS4wLjABAAAAabcdefghijklmnop";
  const result = await service.run({
    goal: "验证这个账号",
    mode: "profile",
    inputs: `https://www.douyin.com/user/${secUid}?from_tab_name=main`
  });
  assert.equal(result.counts.input, 1);
  assert.equal(result.counts.resolved, 1);
  assert.equal(client.calls.filter((call) => call.startsWith("account.resolve:")).length, 1);
});

test("finder service turns common Chinese constraints in the command into filters", async () => {
  const client = fakeClient();
  const service = createDouyinFinderService({
    client,
    discoveryService: { async discover() { return { candidates: [{ profile_url: "https://www.douyin.com/user/demo" }] }; } }
  });
  const result = await service.run({ goal: "找上海粉丝量 1 万到 10 万的家居账号，排除同行" });
  assert.equal(result.criteria.minFollowers, 10000);
  assert.equal(result.criteria.maxFollowers, 100000);
  assert.deepEqual(result.criteria.locations, ["上海"]);
  assert.deepEqual(result.criteria.excludeKeywords, ["同行"]);
  assert.equal(result.accounts[0].matched, true);
});

test("finder service checks live status when the command explicitly requires a live account", async () => {
  const client = fakeClient();
  const service = createDouyinFinderService({
    client,
    discoveryService: { async discover() { return { candidates: [{ profile_url: "https://www.douyin.com/user/demo" }] }; } }
  });
  const result = await service.run({ goal: "找当前正在直播的教育培训账号" });
  assert.equal(result.criteria.liveOnly, true);
  assert.equal(client.calls.includes("live.room"), true);
  assert.equal(result.accounts[0].matched, true);
});

test("finder service ranks topic-relevant accounts by real follower growth", async () => {
  const candidates = [
    { sec_uid: "MS4wLjABAAAAaifastcandidate0001" },
    { sec_uid: "MS4wLjABAAAAsciencecandidate01" },
    { sec_uid: "MS4wLjABAAAAaislowcandidate0001" },
    { sec_uid: "MS4wLjABAAAAincidentalai000001" }
  ];
  const accountBySecUid = new Map([
    [candidates[0].sec_uid, { uid: "1001", nickname: "AI 增长快", signature: "专注 AI 科普和大模型知识" }],
    [candidates[1].sec_uid, { uid: "1002", nickname: "宇宙科普", signature: "分享天文与宇宙科普" }],
    [candidates[2].sec_uid, { uid: "1003", nickname: "AI 增长慢", signature: "每天讲一个 AI 科普知识" }],
    [candidates[3].sec_uid, { uid: "1004", nickname: "普通科普账号", signature: "分享历史与宇宙科普" }]
  ]);
  const trendCalls = [];
  const client = {
    configured: true,
    async resolve(secUid) {
      return { sec_uid: secUid, ...accountBySecUid.get(secUid) };
    },
    async profile(secUid) {
      return { sec_uid: secUid, follower_count: 10000, aweme_count: 30, ...accountBySecUid.get(secUid) };
    },
    async videosLatest(secUid) {
      const account = accountBySecUid.get(secUid);
      return { items: account.uid === "1004"
        ? [{ aweme_id: "1004-ai", desc: "AI 两周设计出新型火箭 #科普" }, { aweme_id: "1004-history", desc: "古代建筑是如何建造的 #科普" }]
        : [{ aweme_id: `${account.uid}-video`, desc: account.signature }] };
    }
  };
  const service = createDouyinFinderService({
    client,
    accountResolver: {
      async search() { return { candidates }; },
      async compareTrends(input) {
        trendCalls.push(input);
        return {
          source: "tikhub-daren-compare",
          windowDays: input.days,
          trends: [
            { uid: "1001", secId: candidates[0].sec_uid, name: "AI 增长快", newFollowers: 500, currentFollowers: 10500 },
            { uid: "1002", secId: candidates[1].sec_uid, name: "宇宙科普", newFollowers: 10000, currentFollowers: 500000 },
            { uid: "1003", secId: candidates[2].sec_uid, name: "AI 增长慢", newFollowers: 100, currentFollowers: 10100 },
            { uid: "1004", secId: candidates[3].sec_uid, name: "普通科普账号", newFollowers: 900, currentFollowers: 90000 }
          ]
        };
      }
    }
  });

  const result = await service.run({ goal: "帮我找近期ai科普类博主粉丝增长最快的人" });

  assert.equal(trendCalls.length, 1);
  assert.equal(trendCalls[0].days, 7);
  assert.deepEqual(result.accounts.map((account) => account.profile.nickname), ["AI 增长快", "AI 增长慢"]);
  assert.deepEqual(result.accounts.map((account) => account.matched), [true, true]);
  assert.equal(result.counts.resolved, 4);
  assert.equal(result.counts.excluded, 2);
  assert.equal(result.accounts[0].growth.newFollowers, 500);
  assert.equal(result.accounts[0].reasons.some((reason) => reason.includes("近7天新增粉丝 500")), true);
  assert.equal(result.capabilitiesUsed.includes("follower.growth"), true);
  assert.deepEqual(result.growthIntent, { metric: "followers", windowDays: 7, topicSignals: ["ai", "科普"] });
});

test("finder service applies strict AI science topic validation without a growth request", async () => {
  const relevant = "MS4wLjABAAAAaieducationcandidate";
  const irrelevant = "MS4wLjABAAAAaitoolcandidate0001";
  const profiles = new Map([
    [relevant, { uid: "2001", nickname: "AI 科普站", signature: "每天解读一个人工智能知识" }],
    [irrelevant, { uid: "2002", nickname: "AI 工具导航", signature: "收录热门 AI 软件" }]
  ]);
  const client = {
    configured: true,
    async resolve(secUid) { return { sec_uid: secUid, ...profiles.get(secUid) }; },
    async profile(secUid) { return { sec_uid: secUid, follower_count: 10000, aweme_count: 20, ...profiles.get(secUid) }; },
    async videosLatest(secUid) {
      return secUid === relevant
        ? { items: [{ desc: "如何理解大模型的工作原理" }, { desc: "AI 科普：什么是推理模型" }] }
        : { items: [{ desc: "本周 AI 工具清单" }] };
    }
  };
  const service = createDouyinFinderService({
    client,
    discoveryService: { async discover() { return { candidates: [{ sec_uid: relevant }, { sec_uid: irrelevant }] }; } }
  });

  const result = await service.run({ goal: "帮我找 AI 科普类博主", resultLimit: 10 });

  assert.equal(result.counts.discovered, 2);
  assert.equal(result.counts.qualified, 1);
  assert.equal(result.counts.delivered, 1);
  assert.equal(result.accounts[0].identity.nickname, "AI 科普站");
});

test("finder service uses a 30-day growth window when requested", async () => {
  const client = fakeClient();
  let requestedDays = null;
  const service = createDouyinFinderService({
    client,
    accountResolver: {
      async search() { return { candidates: [{ sec_uid: "MS4wLjABAAAAabcdefghijklmnop" }] }; },
      async compareTrends(input) {
        requestedDays = input.days;
        return { trends: [{ secId: "MS4wLjABAAAAabcdefghijklmnop", newFollowers: 80 }] };
      }
    }
  });

  await service.run({ goal: "找最近一个月 AI 科普账号粉丝增长最快的人" });

  assert.equal(requestedDays, 30);
});

test("finder service marks growth results partial when trend evidence is missing", async () => {
  const client = fakeClient();
  client.profile = async () => ({
    uid: "1001",
    sec_uid: "MS4wLjABAAAAabcdefghijklmnop",
    nickname: "AI 科普账号",
    signature: "AI 科普与人工智能知识",
    follower_count: 12000
  });
  const service = createDouyinFinderService({
    client,
    accountResolver: {
      async search() { return { candidates: [{ sec_uid: "MS4wLjABAAAAabcdefghijklmnop" }] }; },
      async compareTrends() { return { source: "tikhub-daren-compare", windowDays: 7, trends: [] }; }
    }
  });

  const result = await service.run({ goal: "帮我找近期 AI 科普类博主粉丝增长最快的人" });

  assert.equal(result.status, "PARTIAL");
  assert.equal(result.accounts[0].matched, false);
  assert.equal(result.accounts[0].tier, "待补数据");
  assert.match(result.accounts[0].reasons[0], /缺少近7天粉丝增长数据/);
});

test("finder service keeps paging until it can deliver the requested number of qualified accounts", async () => {
  const profiles = new Map([
    ["MS4wLjABAAAAordinaryscience001", { uid: "2001", nickname: "宇宙科普一", signature: "宇宙知识科普" }],
    ["MS4wLjABAAAAordinaryscience002", { uid: "2002", nickname: "健康科普二", signature: "健康知识科普" }],
    ["MS4wLjABAAAAordinaryscience003", { uid: "2003", nickname: "历史科普三", signature: "历史知识科普" }],
    ["MS4wLjABAAAAqualifiedaiblogger01", { uid: "3001", nickname: "AI 科普一", signature: "AI 科普博主，大模型教程" }],
    ["MS4wLjABAAAAqualifiedaiblogger02", { uid: "3002", nickname: "智能前沿二", signature: "人工智能行业观察" }],
    ["MS4wLjABAAAAqualifiedaiblogger03", { uid: "3003", nickname: "AI 科普三", signature: "AIGC 知识和 AI 教学" }]
  ]);
  const searchCursors = [];
  const client = {
    configured: true,
    async resolve(secUid) { return { sec_uid: secUid, ...profiles.get(secUid) }; },
    async profile(secUid) { return { sec_uid: secUid, follower_count: 10000, ...profiles.get(secUid) }; },
    async videosLatest(secUid) {
      const profile = profiles.get(secUid);
      return { items: profile.uid === "3002"
        ? [
            { aweme_id: "3002-video-1", desc: "AI 大模型入门教程" },
            { aweme_id: "3002-video-2", desc: "人工智能知识拆解" }
          ]
        : [{ aweme_id: `${profile.uid}-video`, desc: profile.signature }] };
    }
  };
  const accountResolver = {
    async search(input) {
      searchCursors.push(input.cursor || 0);
      if (!input.cursor) {
        return {
          candidates: [...profiles.keys()].slice(0, 4).map((sec_uid) => ({ sec_uid, ...profiles.get(sec_uid) })),
          cursor: 10,
          hasMore: true
        };
      }
      return {
        candidates: [...profiles.keys()].slice(4).map((sec_uid) => ({ sec_uid, ...profiles.get(sec_uid) })),
        cursor: 20,
        hasMore: false
      };
    },
    async compareTrends({ accounts, days }) {
      return {
        windowDays: days,
        trends: accounts.map((account, index) => ({ uid: account.uid, secId: account.secId, name: account.name, newFollowers: 300 - index }))
      };
    }
  };

  const result = await createDouyinFinderService({ client, accountResolver }).run({
    goal: "帮我找近期 AI 科普类博主粉丝增长最快的人",
    resultLimit: 3
  });

  assert.deepEqual(searchCursors, [0, 10]);
  assert.equal(result.accounts.length, 3);
  assert.equal(result.counts.matched, 3);
  assert.equal(result.counts.searchPages, 2);
  assert.equal(result.counts.discovered, 6);
  assert.equal(result.counts.screened, 3);
  assert.equal(result.counts.qualified, 3);
  assert.equal(result.counts.delivered, 3);
  assert.equal(result.counts.excluded, 3);
  assert.equal(result.selection.stopReason, "search_exhausted");
  assert.deepEqual(result.accounts.map((account) => account.profile.nickname), ["AI 科普一", "智能前沿二", "AI 科普三"]);
});

test("finder service derives the requested result count from natural language", async () => {
  const client = fakeClient();
  const service = createDouyinFinderService({
    client,
    discoveryService: {
      async discover() {
        return {
          candidates: [
            { sec_uid: "MS4wLjABAAAAresultcount000001" },
            { sec_uid: "MS4wLjABAAAAresultcount000002" },
            { sec_uid: "MS4wLjABAAAAresultcount000003" }
          ]
        };
      }
    }
  });

  const result = await service.run({ goal: "帮我找 2 个教育培训账号", resultLimit: 10 });

  assert.equal(result.selection.requested, 2);
  assert.equal(result.accounts.length, 2);
  assert.equal(result.counts.delivered, 2);
});

test("finder service accepts large bounded targets and rejects only unbounded or over-limit requests", async () => {
  const client = fakeClient();
  let discoveryCalls = 0;
  const service = createDouyinFinderService({
    client,
    discoveryService: {
      async discover() {
        discoveryCalls += 1;
        return { candidates: [{ sec_uid: "MS4wLjABAAAAbulkresult00000001" }], hasMore: false };
      }
    }
  });

  const bulk = await service.run({ goal: "帮我找 2000 个家居账号" });
  assert.equal(bulk.selection.requested, 2000);
  assert.equal(bulk.counts.delivered, 1);
  assert.equal(discoveryCalls, 1);
  const chineseBulk = await service.run({ goal: "帮我找两千个家居账号" });
  assert.equal(chineseBulk.selection.requested, 2000);
  await assert.rejects(
    service.run({ goal: "找某个行业所有的用户" }),
    (error) => error.code === "DOUYIN_FINDER_SCOPE_TOO_BROAD"
  );
  await assert.rejects(
    service.run({ goal: "找家居账号", resultLimit: 2001 }),
    (error) => error.code === "DOUYIN_FINDER_RESULT_LIMIT_EXCEEDED" && error.details.requestedLimit === 2001
  );
  await assert.rejects(
    service.run({ goal: "帮我找 2 个家居账号", resultLimit: 2001 }),
    (error) => error.code === "DOUYIN_FINDER_RESULT_LIMIT_EXCEEDED" && error.details.requestedLimit === 2001
  );
  assert.equal(discoveryCalls, 2);
});

test("finder service reports real intermediate stages through the run progress callback", async () => {
  const progress = [];
  const client = fakeClient();
  const service = createDouyinFinderService({
    client,
    discoveryService: {
      async discover() {
        return { candidates: [{ sec_uid: "MS4wLjABAAAAabcdefghijklmnop" }] };
      }
    }
  });

  await service.run({
    goal: "找教育培训账号",
    onProgress(snapshot) { progress.push(snapshot); }
  });

  assert.equal(progress.some((snapshot) => snapshot.stage === "searching" && snapshot.counts?.discovered === 1), true);
  assert.equal(progress.some((snapshot) => snapshot.stage === "resolving"), true);
  assert.equal(progress.some((snapshot) => snapshot.stage === "enriching" && snapshot.counts?.enriched === 1), true);
});
