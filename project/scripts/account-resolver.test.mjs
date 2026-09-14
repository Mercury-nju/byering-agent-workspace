import assert from "node:assert/strict";
import test from "node:test";

import {
  AccountResolverError,
  createAccountResolver,
  normalizeAccountReference,
  normalizeResolvedAccount
} from "../backend/account-resolver.js";

test("direct Douyin uid and sec_id are normalized without a resolver provider", async () => {
  const resolver = createAccountResolver({ env: {} });
  const account = await resolver.resolve({
    uid: 89254962461,
    sec_uid: "MS4wLjABAAAAtest-sec",
    nickname: "广州黄老板二手车"
  });
  assert.equal(account.uid, "89254962461");
  assert.equal(account.secId, "MS4wLjABAAAAtest-sec");
  assert.equal(account.nickname, "广州黄老板二手车");
  assert.equal(account.source, "provided");
});

test("account name and Douyin handle are resolved through the configured provider", async () => {
  const calls = [];
  const resolver = createAccountResolver({
    provider: {
      async resolve(reference) {
        calls.push(reference);
        return {
          account: {
            uid: "89254962461",
            sec_uid: "MS4wLjABAAAAtest-sec",
            unique_id: "89254962461",
            nickname: "广州黄老板二手车",
            profile_url: "https://www.douyin.com/user/test"
          }
        };
      }
    },
    env: {}
  });
  const account = await resolver.resolve({ accountName: "广州黄老板二手车", uniqueId: "89254962461" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].uniqueId, "89254962461");
  assert.equal(account.uid, "89254962461");
  assert.equal(account.secId, "MS4wLjABAAAAtest-sec");
  assert.equal(account.uniqueId, "89254962461");
  assert.equal(account.source, "resolver");
});

test("account references fail closed when no resolver provider is configured", async () => {
  const resolver = createAccountResolver({ env: {} });
  await assert.rejects(
    resolver.resolve({ accountName: "广州黄老板二手车" }),
    (error) => error instanceof AccountResolverError
      && error.code === "ACCOUNT_RESOLVER_NOT_CONFIGURED"
      && error.statusCode === 503
  );
});

test("ambiguous account candidates require an explicit selection", async () => {
  const resolver = createAccountResolver({
    provider: async () => ({
      candidates: [
        { uid: "u-1", sec_id: "s-1", nickname: "黄老板一店" },
        { uid: "u-2", sec_id: "s-2", nickname: "黄老板二店" }
      ]
    }),
    env: {}
  });
  await assert.rejects(
    resolver.resolve({ accountName: "黄老板" }),
    (error) => error.code === "ACCOUNT_RESOLUTION_AMBIGUOUS"
      && error.statusCode === 409
      && error.details.candidates.length === 2
  );
});

test("selected candidate identity is forwarded to the resolver", async () => {
  const resolver = createAccountResolver({
    provider: async (reference) => {
      assert.equal(reference.selectedCandidateId, "u-2");
      return {
        candidates: [
          { uid: "u-1", sec_id: "s-1", nickname: "黄老板一店" },
          { uid: "u-2", sec_id: "s-2", nickname: "黄老板二店" }
        ]
      };
    },
    env: {}
  });
  const account = await resolver.resolve({ accountName: "黄老板", selectedCandidateId: "u-2" });
  assert.equal(account.uid, "u-2");
  assert.equal(account.secId, "s-2");
});

test("TikHub-style user_list responses normalize to an account", async () => {
  const resolver = createAccountResolver({
    provider: async () => ({
      data: {
        user_list: [{ user_info: {
          uid: "u-tikhub",
          sec_uid: "s-tikhub",
          unique_id: "douyin-handle",
          nickname: "目标账号"
        } }]
      }
    }),
    env: {}
  });
  const account = await resolver.resolve({ uniqueId: "douyin-handle" });
  assert.equal(account.uid, "u-tikhub");
  assert.equal(account.secId, "s-tikhub");
});

test("built-in TikHub provider resolves a Douyin handle without a separate proxy", async () => {
  const calls = [];
  const resolver = createAccountResolver({
    env: {
      BYERING_PROSPECT_ACCOUNT_RESOLVER_PROVIDER: "tikhub",
      BYERING_PROSPECT_TIKHUB_API_KEY: "test-key"
    },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({
        code: 200,
        data: {
          user: {
            uid: "u-tikhub",
            sec_uid: "s-tikhub",
            unique_id: "douyin-handle",
            nickname: "目标账号"
          }
        }
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
  });
  const account = await resolver.resolve({ uniqueId: "douyin-handle" });
  assert.equal(resolver.configured, true);
  assert.equal(resolver.provider, "tikhub");
  assert.equal(account.source, "tikhub");
  assert.equal(account.secId, "s-tikhub");
  assert.match(calls[0].url, /handler_user_profile_v2/);
  assert.match(calls[0].url, /unique_id=douyin-handle/);
  assert.equal(calls[0].options.headers.authorization, "Bearer test-key");
});

test("public profile URL supplies sec_id when the resolver omits it", async () => {
  const profileUrl = "https://www.douyin.com/user/MS4wLjABAAAAprofile-fallback-123";
  const resolver = createAccountResolver({
    provider: async (reference) => ({
      account: {
        nickname: "公开主页账号",
        unique_id: "public-handle",
        profile_url: reference.profileUrl
      }
    }),
    env: {}
  });
  const account = await resolver.resolve({ profileUrl });
  assert.equal(account.secId, "MS4wLjABAAAAprofile-fallback-123");
  assert.equal(account.nickname, "公开主页账号");
  assert.equal(account.uniqueId, "public-handle");
});

test("built-in TikHub profile URL accepts user_id as sec_id", async () => {
  const profileUrl = "https://www.douyin.com/user/MS4wLjABAAAAtikhub-url-id";
  const resolver = createAccountResolver({
    env: {
      BYERING_PROSPECT_ACCOUNT_RESOLVER_PROVIDER: "tikhub",
      BYERING_PROSPECT_TIKHUB_API_KEY: "test-key"
    },
    fetchImpl: async (url) => {
      if (url.includes("get_sec_user_id")) {
        return new Response(JSON.stringify({
          code: 200,
          data: { user_id: "MS4wLjABAAAAtikhub-url-id", unique_id: "url-handle" }
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      assert.match(url, /handler_user_profile_v2/);
      return new Response(JSON.stringify({
        code: 200,
        data: { user: { unique_id: "url-handle", nickname: "主页账号" } }
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
  });
  const account = await resolver.resolve({ profileUrl });
  assert.equal(account.secId, "MS4wLjABAAAAtikhub-url-id");
  assert.equal(account.uniqueId, "url-handle");
  assert.equal(account.nickname, "主页账号");
});

test("built-in TikHub profile URL enriches sec_id with the account nickname", async () => {
  const profileUrl = "https://www.douyin.com/user/MS4wLjABAAAAprofile-enrich-123";
  const resolver = createAccountResolver({
    env: {
      BYERING_PROSPECT_ACCOUNT_RESOLVER_PROVIDER: "tikhub",
      BYERING_PROSPECT_TIKHUB_API_KEY: "test-key"
    },
    fetchImpl: async (url) => {
      if (url.includes("get_sec_user_id")) {
        return new Response(JSON.stringify({
          code: 200,
          data: "MS4wLjABAAAAprofile-enrich-123"
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      assert.match(url, /handler_user_profile\?/);
      assert.match(url, /sec_user_id=MS4wLjABAAAAprofile-enrich-123/);
      return new Response(JSON.stringify({
        code: 200,
        data: { user: { sec_uid: "MS4wLjABAAAAprofile-enrich-123", unique_id: "enriched-handle", nickname: "主页真实名称" } }
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
  });
  const account = await resolver.resolve({ profileUrl });
  assert.equal(account.secId, "MS4wLjABAAAAprofile-enrich-123");
  assert.equal(account.uniqueId, "enriched-handle");
  assert.equal(account.nickname, "主页真实名称");
});

test("built-in TikHub provider searches by account name and preserves candidate ambiguity", async () => {
  const resolver = createAccountResolver({
    env: {
      BYERING_PROSPECT_ACCOUNT_RESOLVER_PROVIDER: "tikhub",
      BYERING_PROSPECT_TIKHUB_API_KEY: "test-key"
    },
    fetchImpl: async (url, options) => {
      assert.match(url, /fetch_user_search_v2/);
      assert.equal(options.method, "POST");
      assert.deepEqual(JSON.parse(options.body), { keyword: "黄老板", cursor: 0 });
      return new Response(JSON.stringify({
        code: 200,
        data: {
          user_list: [{ user_info: { uid: "u-1", sec_uid: "s-1", nickname: "黄老板一店" } }]
        }
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
  });
  const account = await resolver.resolve({ accountName: "黄老板" });
  assert.equal(account.uid, "u-1");
  assert.equal(account.secId, "s-1");
});

test("built-in TikHub provider exposes real account candidates for finder discovery", async () => {
  const resolver = createAccountResolver({
    env: {
      BYERING_PROSPECT_ACCOUNT_RESOLVER_PROVIDER: "tikhub",
      BYERING_PROSPECT_TIKHUB_API_KEY: "test-key"
    },
    fetchImpl: async (url, options) => {
      assert.match(url, /fetch_user_search_v2/);
      assert.deepEqual(JSON.parse(options.body), { keyword: "上海家居改造", cursor: 0 });
      return new Response(JSON.stringify({
        code: 200,
        data: {
          data: {
            user_list: [
              { user_id: "s-1", nick_name: "上海旧房改造", fans_cnt: 23000 },
              { user_id: "s-2", nick_name: "家居焕新日记", fans_cnt: 18000 }
            ],
            cursor: 10,
            has_more: true
          }
        }
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
  });
  const result = await resolver.search({ query: "上海家居改造", limit: 20 });
  assert.equal(result.query, "上海家居改造");
  assert.equal(result.candidates.length, 2);
  assert.deepEqual(result.candidates.map((candidate) => candidate.sec_uid), ["s-1", "s-2"]);
  assert.equal(result.candidates[0].nickname, "上海旧房改造");
  assert.equal(result.hasMore, true);
  assert.equal(result.cursor, 10);
});

test("built-in TikHub finder search forwards the next-page cursor", async () => {
  let requestBody = null;
  const resolver = createAccountResolver({
    env: {
      BYERING_PROSPECT_ACCOUNT_RESOLVER_PROVIDER: "tikhub",
      BYERING_PROSPECT_TIKHUB_API_KEY: "test-key"
    },
    fetchImpl: async (url, options) => {
      assert.match(String(url), /fetch_user_search_v2/);
      requestBody = JSON.parse(options.body);
      return new Response(JSON.stringify({ code: 200, data: { data: { user_list: [], cursor: 20, has_more: 0 } } }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
  });

  await resolver.search({ query: "AI 科普", cursor: 10 });

  assert.deepEqual(requestBody, { keyword: "AI 科普", cursor: 10 });
});

test("finder discovery retries a transient TikHub failure before failing the task", async () => {
  let calls = 0;
  const resolver = createAccountResolver({
    env: {
      BYERING_PROSPECT_ACCOUNT_RESOLVER_PROVIDER: "tikhub",
      BYERING_PROSPECT_TIKHUB_API_KEY: "test-key"
    },
    searchRetryDelayMs: 0,
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) {
        return new Response(JSON.stringify({ code: 503, message: "temporary unavailable" }), {
          status: 503,
          headers: { "content-type": "application/json" }
        });
      }
      return new Response(JSON.stringify({
        code: 200,
        data: { data: { user_list: [{ user_id: "s-recovered", nick_name: "恢复后的候选" }] } }
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
  });

  const result = await resolver.search({ query: "上海家居改造", limit: 12 });
  assert.equal(calls, 2);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].sec_uid, "s-recovered");
});

test("TikHub trend comparison batches five accounts and normalizes follower growth", async () => {
  const calls = [];
  const resolver = createAccountResolver({
    env: {
      BYERING_PROSPECT_ACCOUNT_RESOLVER_PROVIDER: "tikhub",
      BYERING_PROSPECT_TIKHUB_API_KEY: "test-key"
    },
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      const userIds = new URL(url).searchParams.get("user_list").split(",");
      return new Response(JSON.stringify({
        code: 200,
        data: {
          data: {
            userlist_resp: userIds.map((uid, index) => ({
              user_id: uid,
              user_name: `账号${uid}`,
              new_fans_count: String(100 - index),
              fans_count: "1000",
              new_like_count: "300",
              new_item_count: "2",
              aweme_url: `https://www.douyin.com/user/sec-${uid}`
            }))
          }
        }
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
  });
  const accounts = Array.from({ length: 6 }, (_, index) => ({ uid: `uid-${index}`, secId: `sec-uid-${index}` }));

  const result = await resolver.compareTrends({ accounts, days: 7 });

  assert.equal(calls.length, 2);
  assert.equal(calls.every(({ options }) => options.method === "POST"), true);
  assert.equal(calls.every(({ url }) => new URL(url).searchParams.get("days") === "7"), true);
  assert.equal(result.trends.length, 6);
  assert.deepEqual(result.trends[0], {
    uid: "uid-0",
    secId: "sec-uid-0",
    name: "账号uid-0",
    windowDays: 7,
    newFollowers: 100,
    currentFollowers: 1000,
    newLikes: 300,
    newItems: 2,
    source: "tikhub-daren-compare"
  });
});

test("TikHub trend comparison retries application-level rate limits", async () => {
  let calls = 0;
  const resolver = createAccountResolver({
    env: {
      BYERING_PROSPECT_ACCOUNT_RESOLVER_PROVIDER: "tikhub",
      BYERING_PROSPECT_TIKHUB_API_KEY: "test-key"
    },
    searchRetryAttempts: 3,
    searchRetryDelayMs: 0,
    trendRetryDelayMs: 0,
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) {
        return new Response(JSON.stringify({ code: 1003, message: "Rate limit exceeded" }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      return new Response(JSON.stringify({
        code: 200,
        data: { data: { userlist_resp: [{ user_id: "1001", user_name: "AI 科普", new_fans_count: "88", fans_count: "1000" }] } }
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
  });

  const result = await resolver.compareTrends({ accounts: [{ uid: "1001", name: "AI 科普" }], days: 7 });

  assert.equal(calls, 2);
  assert.equal(result.trends[0].newFollowers, 88);
});

test("TikHub user_id aliases the Spider sec_id field", async () => {
  const resolver = createAccountResolver({
    provider: async () => ({
      data: {
        user_list: [{
          user_info: {
            user_id: "MS4wLjABAAAAtikhub-sec-id",
            nick_name: "小满的好物店"
          }
        }]
      }
    }),
    env: {}
  });
  const account = await resolver.resolve({ accountName: "小满的好物店" });
  assert.equal(account.secId, "MS4wLjABAAAAtikhub-sec-id");
  assert.equal(account.nickname, "小满的好物店");
});

test("TikHub provider without a key stays unavailable instead of making anonymous calls", async () => {
  const resolver = createAccountResolver({
    env: { BYERING_PROSPECT_ACCOUNT_RESOLVER_PROVIDER: "tikhub" },
    fetchImpl: async () => { throw new Error("must not call upstream"); }
  });
  assert.equal(resolver.configured, false);
  await assert.rejects(
    resolver.resolve({ uniqueId: "douyin-handle" }),
    (error) => error.code === "ACCOUNT_RESOLVER_NOT_CONFIGURED"
      && error.details.required.includes("BYERING_PROSPECT_TIKHUB_API_KEY")
  );
});

test("account reference and resolved identity reject incomplete records", () => {
  assert.deepEqual(normalizeAccountReference({ unique_id: "89254962461" }), {
    accountName: null,
    uniqueId: "89254962461",
    profileUrl: null,
    uid: null,
    secId: null,
    selectedCandidateId: null,
    query: "89254962461"
  });
  assert.throws(
    () => normalizeResolvedAccount({ uid: "u-only" }),
    (error) => error.code === "ACCOUNT_IDENTITY_INCOMPLETE"
  );
});

test("public-only profiles without platform uid receive a stable collection uid", () => {
  const first = normalizeResolvedAccount({ sec_uid: "s-public-only", unique_id: "public_handle" });
  const second = normalizeResolvedAccount({ sec_uid: "s-public-only", unique_id: "public_handle" });
  assert.equal(first.uid, second.uid);
  assert.match(first.uid, /^public-/);
  assert.equal(first.douyinUid, undefined);
  assert.equal(first.secId, "s-public-only");
});

test("resolved accounts preserve nested avatar URLs", () => {
  const account = normalizeResolvedAccount({
    uid: "avatar-uid",
    sec_uid: "avatar-sec",
    unique_id: "avatar-handle",
    nickname: "头像账号",
    avatar_thumb: {
      url_list: ["https://cdn.example.com/avatar.webp"]
    }
  });

  assert.equal(account.avatarUrl, "https://cdn.example.com/avatar.webp");
});
