import assert from "node:assert/strict";
import test from "node:test";

import {
  DouyinAgentDataError,
  createDouyinAgentDataClient,
  douyinAgentDataConfiguration
} from "../src/salebuddy/bridge/douyin-agent-data.js";

test("Agent Data client maps every documented capability to REST query parameters", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    const path = new URL(url).pathname;
    const data = path === "/health"
      ? { status: "ok" }
      : path === "/v1/account/resolve"
        ? { sec_uid: "MS4wLjABAAAAabcdefghijklmnop", profile_url: "https://www.douyin.com/user/MS4wLjABAAAAabcdefghijklmnop" }
        : path === "/v1/account/profile"
          ? { sec_uid: "MS4wLjABAAAAabcdefghijklmnop", nickname: "测试账号" }
            : path === "/v1/account/videos-latest"
            ? { items: [{ aweme_id: "v-1" }] }
            : path === "/v1/account/videos"
              ? { items: [{ aweme_id: "v-2" }], cursor: "next", has_more: true }
            : path === "/v1/video/detail"
              ? { aweme_id: "v-1", desc: "作品" }
              : path === "/v1/live/room"
                ? { is_live: true }
                : path === "/v1/industry/list"
                  ? { items: [{ industry: "教育培训" }] }
                  : { items: [{ word: "课程" }] };
    return new Response(JSON.stringify({ code: 0, msg: "ok", data }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const client = createDouyinAgentDataClient({ url: "http://api.test", apiKey: "secret-key", fetchImpl });
  assert.deepEqual(await client.health(), { status: "ok" });
  assert.equal((await client.resolve("https://www.douyin.com/user/foo")).sec_uid, "MS4wLjABAAAAabcdefghijklmnop");
  assert.equal((await client.profile("MS4wLjABAAAAabcdefghijklmnop", { fresh: true })).nickname, "测试账号");
  assert.equal((await client.videosLatest("MS4wLjABAAAAabcdefghijklmnop", { count: 4 })).items[0].aweme_id, "v-1");
  assert.equal((await client.videos("MS4wLjABAAAAabcdefghijklmnop", { cursor: "next", since: 1750000000, count: 4 })).items[0].aweme_id, "v-2");
  assert.equal((await client.videoDetail({ awemeId: "v-1" })).aweme_id, "v-1");
  assert.equal((await client.liveRoom({ secUid: "MS4wLjABAAAAabcdefghijklmnop" })).is_live, true);
  assert.equal((await client.industryList()).items[0].industry, "教育培训");
  assert.equal((await client.hotwords("教育培训", { category: "课程", window: "7d", limit: 5 })).items[0].word, "课程");
  assert.equal(calls.every(({ options }) => options.headers["x-api-key"] === "secret-key"), true);
  assert.equal(new URL(calls[2].url).searchParams.get("fresh"), "true");
  assert.equal(new URL(calls[3].url).searchParams.get("count"), "4");
  assert.equal(new URL(calls[4].url).searchParams.get("cursor"), "next");
  assert.equal(new URL(calls[4].url).searchParams.get("since"), "1750000000");
});

test("Agent Data client keeps configuration explicit and errors are redacted", async () => {
  assert.equal(douyinAgentDataConfiguration({}).url, "http://118.196.140.64:8080");
  const client = createDouyinAgentDataClient({ url: "http://api.test", fetchImpl: async () => new Response(JSON.stringify({ code: 401, msg: "bad key", data: { api_key: "secret" } }), { status: 401 }) });
  await assert.rejects(client.health(), (error) => {
    assert.ok(error instanceof DouyinAgentDataError);
    assert.equal(error.statusCode, 400);
    assert.equal(JSON.stringify(error.details).includes("secret"), false);
    return true;
  });
});

test("Agent Data client waits and retries provider rate limits", async () => {
  let calls = 0;
  const client = createDouyinAgentDataClient({
    url: "http://api.test",
    requestRetryDelayMs: 0,
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) {
        return new Response(JSON.stringify({ code: 1003, msg: "rate limited, retry after 1s", data: null }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      return new Response(JSON.stringify({ code: 0, msg: "ok", data: { sec_uid: "s-recovered", nickname: "恢复账号" } }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
  });

  const profile = await client.profile("s-recovered");
  assert.equal(calls, 2);
  assert.equal(profile.nickname, "恢复账号");
});
