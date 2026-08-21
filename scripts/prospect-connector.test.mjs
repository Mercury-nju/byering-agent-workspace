import assert from "node:assert/strict";
import test from "node:test";

import {
  ProspectConnectorError,
  createProspectConnector,
  prospectConnectorConfiguration
} from "../src/salebuddy/bridge/prospect-connector.js";

test("connector sends the legacy SpiderApi snake_case request", async () => {
  const requests = [];
  const connector = createProspectConnector({
    baseUrl: "http://spider.internal:8881",
    fetchImpl: async (url, options) => {
      requests.push({ url: String(url), options });
      return {
        ok: true,
        status: 200,
        async text() { return JSON.stringify({ code: 0, data: { tasks: [] } }); }
      };
    }
  });
  const response = await connector.comments({
    uid: "123",
    tenant: 10001,
    platform: 4,
    callbackUrl: "https://byering.example/v1/connectors/prospect/events",
    videoIds: ["v1", "v2"]
  });
  assert.deepEqual(response, { tasks: [] });
  assert.equal(requests[0].url, "http://spider.internal:8881/api/v1/douyin/comments");
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    uid: "123",
    tenant: 10001,
    platform: 4,
    callback_url: "https://byering.example/v1/connectors/prospect/events",
    video_ids: ["v1", "v2"]
  });
});

test("connector accepts the deployed SpiderApi success code 200", async () => {
  const connector = createProspectConnector({
    baseUrl: "http://spider.internal:8881",
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async text() { return JSON.stringify({ code: 200, data: { tasks: [{ aweme_id: "video-1", status: "queued" }] } }); }
    })
  });
  const result = await connector.comments({ videoIds: ["video-1"] });
  assert.equal(result.tasks[0].aweme_id, "video-1");
});

test("connector accepts the live SpiderApi success code 200", async () => {
  const connector = createProspectConnector({
    baseUrl: "http://spider.internal:8881",
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({ code: 200, message: "Success", data: { status: "queued", trace_id: "trace-1" } });
      }
    })
  });

  assert.deepEqual(await connector.videoList({ uid: 123 }), { status: "queued", trace_id: "trace-1" });
});

test("connector rejects upstream failures without leaking credentials", async () => {
  const connector = createProspectConnector({
    baseUrl: "http://spider.internal:8881",
    apiToken: "do-not-print",
    fetchImpl: async () => ({
      ok: false,
      status: 500,
      async text() { return JSON.stringify({ code: 500, message: "failed", secret: "hidden" }); }
    })
  });
  await assert.rejects(
    connector.videoList({ uid: 123 }),
    (error) => error instanceof ProspectConnectorError
      && error.code === "PROSPECT_UPSTREAM_HTTP_ERROR"
      && !JSON.stringify(error.details).includes("hidden")
  );
});

test("connector reports deterministic configuration and remains fail-closed", async () => {
  assert.equal(prospectConnectorConfiguration({}).baseUrl, null);
  const connector = createProspectConnector({});
  assert.equal(connector.configured, false);
  await assert.rejects(
    connector.comments({ videoIds: ["v1"] }),
    (error) => error.code === "PROSPECT_NOT_CONFIGURED" && error.statusCode === 503
  );
});

test("keyword search is opt-in and exposed only when configured", () => {
  const disabled = createProspectConnector({ baseUrl: "http://spider" });
  assert.equal(disabled.searchConfigured, false);
  assert.equal(disabled.search, null);
  const enabled = createProspectConnector({ baseUrl: "http://spider", searchEnabled: true, fetchImpl: async () => ({ ok: true, status: 200, text: async () => "{}" }) });
  assert.equal(enabled.searchConfigured, true);
  assert.equal(typeof enabled.search, "function");
});
