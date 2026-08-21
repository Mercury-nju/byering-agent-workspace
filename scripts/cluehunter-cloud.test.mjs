import test from "node:test";
import assert from "node:assert/strict";
import { createClueHunterCloudService, CLOUD_DESKTOP_APPLY_STATUS } from "../backend/cluehunter-cloud.js";

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, async text() { return JSON.stringify(body); } };
}

const env = {
  BYERING_CLUEHUNTER_BASE_URL: "https://cluehunter.test",
  BYERING_CLUEHUNTER_AUTH_TOKEN: "token",
  BYERING_CLUEHUNTER_TENANT_ID: "10",
  BYERING_CLUEHUNTER_UID: "20",
  BYERING_CLUEHUNTER_REGION_ID: "cn-test"
};

test("cloud service fails closed when required provisioning config is missing", async () => {
  const service = createClueHunterCloudService({ env: {} , fetchImpl: async () => response({}) });
  assert.equal(service.configured, false);
  await assert.rejects(() => service.ensureReady(), (error) => error.code === "CLOUD_DESKTOP_NOT_CONFIGURED");
});

test("cloud service applies and polls until the legacy status reaches ready", async () => {
  const calls = [];
  let current = CLOUD_DESKTOP_APPLY_STATUS.APPLYING;
  const service = createClueHunterCloudService({
    env,
    fetchImpl: async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body), authorization: options.headers.authorization });
      if (url.endsWith("/apply")) return response({ code: 0, data: true });
      current = CLOUD_DESKTOP_APPLY_STATUS.READY;
      return response({ code: 0, data: { status: current } });
    },
    sleepImpl: async () => {}
  });
  const result = await service.ensureReady();
  assert.equal(result.ready, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].body.uid, 20);
  assert.equal(calls[0].body.tenant, 10);
  assert.equal(calls[0].body.regionId, "cn-test");
  assert.equal(calls[0].authorization, "Bearer token");
});

test("already-applied upstream response is idempotently accepted", async () => {
  let statusCalls = 0;
  const service = createClueHunterCloudService({
    env,
    fetchImpl: async (url) => {
      if (url.endsWith("/apply")) return response({ success: false, msg: "已经申请过云电脑" }, 400);
      statusCalls += 1;
      return response({ code: 0, data: { status: 3 } });
    },
    sleepImpl: async () => {}
  });
  const result = await service.ensureReady();
  assert.equal(result.ready, true);
  assert.equal(statusCalls, 1);
});

test("failed provisioning never reports ready", async () => {
  const service = createClueHunterCloudService({
    env,
    fetchImpl: async (url) => url.endsWith("/apply")
      ? response({ code: 0, data: true })
      : response({ code: 0, data: { status: 2 } }),
    sleepImpl: async () => {}
  });
  await assert.rejects(() => service.ensureReady(), (error) => error.code === "CLOUD_DESKTOP_APPLY_FAILED");
});

test("connect uses the legacy GET startJob contract after provisioning", async () => {
  const calls = [];
  const service = createClueHunterCloudService({
    env,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith("/apply")) return response({ code: 0, data: true });
      if (url.endsWith("/applyStatus")) return response({ code: 0, data: { status: 3 } });
      if (url.endsWith("/startJob")) return response({ code: 0, data: true });
      throw new Error(`unexpected URL: ${url}`);
    },
    sleepImpl: async () => {}
  });

  const result = await service.connect();
  assert.equal(result.connected, true);
  assert.equal(result.cloudDesktop.ready, true);
  assert.equal(result.rpa.started, true);
  assert.deepEqual(calls.map(({ url }) => new URL(url).pathname), [
    "/api/cloud/desktop/apply",
    "/api/cloud/desktop/applyStatus",
    "/self/rpa/startJob"
  ]);
  assert.equal(calls[2].options.method, "GET");
  assert.equal(Object.hasOwn(calls[2].options, "body"), false);
});

test("concurrent connect calls share one cloud and RPA startup", async () => {
  let calls = 0;
  const service = createClueHunterCloudService({
    env,
    fetchImpl: async (url) => {
      calls += 1;
      if (url.endsWith("/apply")) return response({ code: 0, data: true });
      if (url.endsWith("/applyStatus")) return response({ code: 0, data: { status: 3 } });
      return response({ code: 0, data: true });
    },
    sleepImpl: async () => {}
  });
  const [first, second] = await Promise.all([service.connect(), service.connect()]);
  assert.equal(first.connected, true);
  assert.equal(second.connected, true);
  assert.equal(calls, 3);
});
