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
