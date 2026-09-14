import assert from "node:assert/strict";
import test from "node:test";

import { createDouyinFinderService } from "../backend/douyin-finder-service.js";

const VALID_SEC_UID = "MS4wLjABAAAAabcdefghijklmnop";

function makeClient({ profile = {}, videos = [], live = { is_live: true }, errors = {} } = {}) {
  const calls = [];
  const fail = (name) => {
    const error = errors[name];
    if (error) throw error instanceof Error ? error : new Error(String(error));
  };
  return {
    configured: true,
    calls,
    async industryList() { fail("industryList"); calls.push("industry.list"); return { items: [{ industry: "教育培训" }, { industry: "家居" }] }; },
    async hotwords(industry) { fail("hotwords"); calls.push(`industry.hotwords:${industry}`); return { items: [{ word: "课程" }] }; },
    async resolve(input) { fail("resolve"); calls.push(`account.resolve:${input}`); return { sec_uid: VALID_SEC_UID, nickname: "候选账号", profile_url: input }; },
    async profile() { fail("profile"); calls.push("account.profile"); return { sec_uid: VALID_SEC_UID, nickname: "候选账号", follower_count: 18000, aweme_count: 120, province: "上海", ...profile }; },
    async videosLatest() { fail("videosLatest"); calls.push("account.videos-latest"); return { items: videos }; },
    async videos(secUid, input) { fail("videos"); calls.push(`account.videos:${input.cursor}:${input.since ?? ""}`); return { items: videos, cursor: "next", has_more: true, sec_uid: secUid }; },
    async videoDetail(input) { fail("videoDetail"); calls.push(`video.detail:${input.awemeId || input.url}`); return { aweme_id: input.awemeId || "v-1", desc: "作品详情" }; },
    async liveRoom() { fail("liveRoom"); calls.push("live.room"); return { is_live: true, ...live }; }
  };
}

function discoveredService(candidates = [{ profile_url: "https://www.douyin.com/user/discovered" }]) {
  return { async discover() { return { candidates }; } };
}

test("prompt matrix starts command-first retrieval without requiring IDs", async () => {
  const prompts = [
    "找近期在上海做家居直播、粉丝量 1 万以上的账号",
    "帮我找教育培训行业里最近发布课程内容的账号",
    "找本地汽车维修和保养商家账号，排除明显同行",
    "我没有账号链接，找最近在做新能源车测评的人"
  ];
  for (const goal of prompts) {
    const result = await createDouyinFinderService({ client: makeClient(), discoveryService: discoveredService() }).run({ goal });
    assert.equal(result.status, "SUCCEEDED");
    assert.equal(result.started, true);
    assert.equal(result.counts.discovered, 1);
    assert.equal(result.counts.resolved, 1);
  }
});

test("no discovery source fails before creating a fake finder run", async () => {
  const service = createDouyinFinderService({ client: makeClient() });
  assert.equal(service.discoveryConfigured, false);
  await assert.rejects(
    service.run({ goal: "找做新能源车测评的人" }),
    (error) => error.code === "DOUYIN_FINDER_DISCOVERY_NOT_CONFIGURED" && error.statusCode === 503
  );
});

test("industry-only prompt uses the industry capabilities without pretending to return accounts", async () => {
  const client = makeClient();
  const result = await createDouyinFinderService({ client }).run({
    goal: "先看教育培训行业热词",
    mode: "industry",
    industry: "教育培训"
  });
  assert.equal(result.status, "SUCCEEDED");
  assert.deepEqual(result.capabilitiesUsed, ["industry.list", "industry.hotwords"]);
  assert.equal(result.counts.matched, 0);
  assert.deepEqual(client.calls, ["industry.list", "industry.hotwords:教育培训"]);
});

test("natural-language constraints map to conservative filters", async () => {
  const cases = [
    ["找上海粉丝量 1 万以上的家居账号", { minFollowers: 10000, locations: ["上海"] }],
    ["找粉丝 1000 到 10 万的商家账号", { minFollowers: 1000, maxFollowers: 100000 }],
    ["找当前正在直播的教育培训账号", { liveOnly: true }],
    ["找获赞 1.5 万以上、作品 100 条以上的账号", { minLikes: 15000, minAwemeCount: 100 }],
    ["找已认证账号", { requiredVerify: true }],
    ["找未认证账号", { requiredVerify: false }],
    ["找账号并排除同行和抽奖", { excludeKeywords: ["同行", "抽奖"] }]
  ];
  for (const [goal, expected] of cases) {
    const result = await createDouyinFinderService({ client: makeClient(), discoveryService: discoveredService() }).run({ goal });
    for (const [key, value] of Object.entries(expected)) assert.deepEqual(result.criteria[key], value, `${goal}: ${key}`);
  }
});

test("the five verification modes call only their declared data capabilities", async () => {
  const expectations = {
    full: ["account.resolve", "account.profile", "account.videos-latest"],
    profile: ["account.resolve", "account.profile"],
    content: ["account.resolve", "account.videos-latest"],
    live: ["account.resolve", "live.room"],
    industry: ["industry.list", "industry.hotwords:教育培训"]
  };
  for (const [mode, expectedCalls] of Object.entries(expectations)) {
    const client = makeClient({ videos: [{ aweme_id: "v-1", desc: "课程" }] });
    const input = mode === "industry"
      ? { goal: "查教育培训热词", mode, industry: "教育培训" }
      : { goal: "验证这个账号", mode, inputs: "https://www.douyin.com/user/example" };
    const result = await createDouyinFinderService({ client }).run(input);
    assert.deepEqual(client.calls, expectedCalls.map((name) => name === "account.resolve" ? `${name}:https://www.douyin.com/user/example` : name));
    assert.equal(result.status, "SUCCEEDED");
  }
});

test("explicit live, detail, refresh, and industry options reach the right calls", async () => {
  const client = makeClient({ videos: [{ aweme_id: "v-1", desc: "课程直播" }] });
  const result = await createDouyinFinderService({ client }).run({
    goal: "找上海当前正在直播的教育培训账号",
    inputs: "https://www.douyin.com/user/example",
    industry: "教育培训",
    includeIndustryContext: true,
    detailLimit: 1,
    checkLive: true,
    fresh: true
  });
  assert.equal(result.status, "SUCCEEDED");
  assert.deepEqual(result.capabilitiesUsed.sort(), ["account.profile", "account.resolve", "account.videos-latest", "industry.hotwords", "industry.list", "live.room", "video.detail"]);
  assert.equal(result.accounts[0].videoDetails.length, 1);
  assert.equal(result.accounts[0].live.is_live, true);
});

test("作品时间范围 uses the paginated account videos capability", async () => {
  const client = makeClient({ videos: [{ aweme_id: "v-range", desc: "范围内作品" }] });
  const result = await createDouyinFinderService({ client }).run({
    goal: "找时间范围内持续创作的账号",
    inputs: "https://www.douyin.com/user/example",
    since: 1750000000,
    cursor: "0"
  });
  assert.equal(result.status, "SUCCEEDED");
  assert.equal(result.capabilitiesUsed.includes("account.videos"), true);
  assert.equal(client.calls.includes("account.videos:0:1750000000"), true);
});

test("candidate discovery accepts common account result shapes and deduplicates them", async () => {
  const client = makeClient();
  const discoveryService = {
    async discover() {
      return {
        accounts: [{ sec_uid: VALID_SEC_UID }, { secUid: VALID_SEC_UID }],
        users: [{ profile_url: "https://www.douyin.com/user/second" }]
      };
    }
  };
  const result = await createDouyinFinderService({ client, discoveryService }).run({ goal: "找教育培训账号" });
  assert.equal(result.status, "SUCCEEDED");
  assert.equal(result.counts.discovered, 2);
  assert.equal(result.counts.resolved, 2);
  assert.equal(client.calls.filter((call) => call.startsWith("account.resolve:")).length, 2);
});

test("public account context guides discovery without becoming candidate seeds", async () => {
  const client = makeClient();
  let discoveryInput = null;
  const result = await createDouyinFinderService({
    client,
    discoveryService: {
      async discover(input) {
        discoveryInput = input;
        return { candidates: [{ profile_url: "https://www.douyin.com/user/discovered" }] };
      }
    }
  }).run({
    goal: "找上海近期稳定更新、适合家居内容联动的创作者",
    resultLimit: 24,
    accountContext: {
      businessAccountUrl: "https://www.douyin.com/user/my-shop",
      referenceAccountUrls: [
        "https://www.douyin.com/user/creator-a",
        "https://www.douyin.com/user/creator-b"
      ]
    }
  });

  assert.deepEqual(discoveryInput.accountContext, {
    businessAccountUrl: "https://www.douyin.com/user/my-shop",
    referenceAccountUrls: [
      "https://www.douyin.com/user/creator-a",
      "https://www.douyin.com/user/creator-b"
    ]
  });
  assert.deepEqual(discoveryInput.referenceAccounts, [
    "https://www.douyin.com/user/creator-a",
    "https://www.douyin.com/user/creator-b"
  ]);
  assert.deepEqual(discoveryInput.optionalSeeds, []);
  assert.deepEqual(result.accountContext, discoveryInput.accountContext);
  assert.equal(result.selection.requested, 24);
  assert.equal(client.calls.includes("account.resolve:https://www.douyin.com/user/my-shop"), false);
  assert.equal(client.calls.includes("account.resolve:https://www.douyin.com/user/creator-a"), false);
});

test("empty discovery is a real result while failed discovery is an execution error", async () => {
  const empty = await createDouyinFinderService({ client: makeClient(), discoveryService: discoveredService([]) }).run({ goal: "找没有候选的人" });
  assert.equal(empty.status, "NO_CANDIDATES");
  assert.match(empty.message, /没有发现/);
  await assert.rejects(
    createDouyinFinderService({
      client: makeClient(),
      discoveryService: { async discover() { throw new Error("search unavailable"); } }
    }).run({ goal: "找搜索源故障时的人" }),
    (error) => error.code === "DOUYIN_FINDER_DISCOVERY_FAILED" && error.statusCode === 502
  );
});

test("input references deduplicate and respect the 50-account cap", async () => {
  const client = makeClient();
  const inputs = Array.from({ length: 75 }, (_, index) => `https://www.douyin.com/user/account-${index % 60}`);
  const result = await createDouyinFinderService({ client }).run({ goal: "验证一批候选账号", inputs });
  assert.equal(result.counts.input, 50);
  assert.equal(result.counts.resolved, 50);
  assert.equal(client.calls.filter((call) => call.startsWith("account.resolve:")).length, 50);
});

test("video URLs and explicit video IDs are sent to video detail", async () => {
  const client = makeClient();
  const result = await createDouyinFinderService({ client }).run({
    goal: "核验这个作品 https://www.douyin.com/video/123",
    inputs: "https://www.douyin.com/user/example",
    videoIds: ["v-explicit"],
    detailLimit: 0
  });
  assert.equal(result.status, "SUCCEEDED");
  assert.equal(client.calls.filter((call) => call.startsWith("video.detail:")).length, 2);
});

test("detail requests respect the 50-item cap", async () => {
  const client = makeClient({ videos: Array.from({ length: 60 }, (_, index) => ({ aweme_id: `v-${index}` })) });
  const result = await createDouyinFinderService({ client }).run({
    goal: "查看账号近期作品详情",
    inputs: "https://www.douyin.com/user/example",
    detailLimit: 60
  });
  assert.equal(result.status, "SUCCEEDED");
  assert.equal(result.accounts[0].videoDetails.length, 50);
  assert.equal(client.calls.filter((call) => call.startsWith("video.detail:")).length, 50);
});

test("single capability failures preserve partial evidence", async () => {
  const client = makeClient({ errors: { profile: new Error("profile down") }, videos: [{ aweme_id: "v-1" }] });
  const result = await createDouyinFinderService({ client }).run({
    goal: "验证账号",
    inputs: "https://www.douyin.com/user/example",
    detailLimit: 1
  });
  assert.equal(result.status, "PARTIAL");
  assert.equal(result.accounts.length, 1);
  assert.equal(result.accounts[0].videos.length, 1);
  assert.equal(result.errors[0].capability, "account.profile");
});

test("hard filters and exclusions affect matching without contaminating the command text", async () => {
  const client = makeClient({ profile: { follower_count: 500, province: "北京", nickname: "普通账号" }, live: { is_live: false } });
  const result = await createDouyinFinderService({ client, discoveryService: discoveredService() }).run({
    goal: "找上海粉丝量 1 万以上、当前正在直播的账号，排除同行"
  });
  assert.equal(result.status, "NO_CANDIDATES");
  assert.equal(result.accounts.length, 0);
  assert.equal(result.counts.qualified, 0);
  assert.deepEqual(result.criteria.excludeKeywords, ["同行"]);
});

test("100 concurrent command tasks remain isolated", async () => {
  let discoveryCalls = 0;
  const tasks = await Promise.all(Array.from({ length: 100 }, (_, index) => {
    const client = makeClient();
    const discoveryService = { async discover() { discoveryCalls += 1; return { candidates: [{ profile_url: `https://www.douyin.com/user/${index}` }] }; } };
    return createDouyinFinderService({ client, discoveryService }).run({ taskId: `stress-${index}`, goal: `找第 ${index} 批教育培训账号` });
  }));
  assert.equal(discoveryCalls, 100);
  assert.equal(tasks.length, 100);
  assert.equal(tasks.filter((result) => result.status === "SUCCEEDED").length, 100);
  assert.equal(new Set(tasks.map((result) => result.taskId)).size, 100);
});

test("candidate verification uses bounded concurrency instead of serial account calls", async () => {
  let active = 0;
  let peak = 0;
  const client = makeClient();
  client.resolve = async (input) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 20));
    active -= 1;
    return { sec_uid: input, nickname: input };
  };
  const candidates = Array.from({ length: 6 }, (_, index) => ({ sec_uid: `MS4wLjABAAAAcandidate${index}abcdef` }));
  const result = await createDouyinFinderService({ client, discoveryService: discoveredService(candidates) }).run({
    goal: "找家居改造账号",
    mode: "profile"
  });

  assert.equal(result.counts.resolved, 6);
  assert.equal(peak > 1, true);
  assert.equal(peak <= 4, true);
  assert.deepEqual(result.accounts.map((account) => account.reference), candidates.map((candidate) => candidate.sec_uid));
});
