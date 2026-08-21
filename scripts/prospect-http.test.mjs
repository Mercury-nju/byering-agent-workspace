import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { createControlPlaneHttpServer } from "../backend/http-server.js";

const prospectSecret = "prospect-event-secret";
const prospectNow = 1710000000000;

function signedProspect(body, path = "/v1/connectors/prospect/events?taskId=task-signed&taskRunId=run-signed&conversationId=conv-signed") {
  const raw = JSON.stringify(body);
  const canonical = [String(prospectNow), "POST", path.split("?")[0], raw].join("\n");
  return {
    raw,
    headers: {
      "content-type": "application/json",
      "x-prospect-timestamp": String(prospectNow),
      "x-prospect-signature": `sha256=${createHmac("sha256", prospectSecret).update(canonical).digest("hex")}`
    }
  };
}

test("prospect HTTP endpoints expose discovery and correlate Spider callbacks", async (t) => {
  const calls = [];
  const prospectService = {
    configured: true,
    async discover(body) {
      calls.push(["discover", body]);
      return { accepted: true, source: "prospect", events: [] };
    },
    async callback(body, response) {
      calls.push(["callback", body, response]);
      return { accepted: true, source: "prospect", events: [] };
    }
  };
  const server = createControlPlaneHttpServer({
    auth: false,
    prospectService,
    clueHunterService: { configured: false },
    taskDispatcher: { configured: true }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => server.close());
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;

  const discover = await fetch(`${base}/v1/connectors/prospect/discover`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ taskId: "task-http", taskRunId: "run-http", conversationId: "conv-http", goal: "找潜客", videoIds: ["v1"] })
  });
  assert.equal(discover.status, 200);
  assert.equal((await discover.json()).source, "prospect");

  const callback = await fetch(`${base}/v1/connectors/prospect/events?taskId=task-http&taskRunId=run-http&conversationId=conv-http&goal=%E6%89%BE%E6%BD%9C%E5%AE%A2`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ taskId: "spoofed-task", itemList: [{ video_id: "v1" }] })
  });
  assert.equal(callback.status, 200);
  assert.equal((await callback.json()).source, "prospect");
  assert.equal(calls[0][0], "discover");
  assert.equal(calls[1][0], "callback");
  assert.equal(calls[1][1].taskId, "task-http");
  assert.equal(calls[1][1].taskRunId, "run-http");
});

test("prospect HTTP exposes account resolution as a strategy capability", async (t) => {
  const calls = [];
  const server = createControlPlaneHttpServer({
    auth: false,
    accountResolver: {
      configured: true,
      async resolve(input) {
        calls.push(input);
        return {
          uid: "89254962461",
          secId: "MS4wLjABAAAAtest-sec",
          uniqueId: input.uniqueId,
          nickname: "广州黄老板二手车",
          source: "resolver"
        };
      }
    },
    prospectService: { configured: false },
    clueHunterService: { configured: false },
    taskDispatcher: { configured: true }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => server.close());
  const response = await fetch(`http://127.0.0.1:${server.address().port}/v1/connectors/prospect/resolve-account`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ uniqueId: "89254962461" })
  });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.account.uid, "89254962461");
  assert.equal(payload.account.secId, "MS4wLjABAAAAtest-sec");
  assert.equal(calls[0].uniqueId, "89254962461");
});

test("prospect HTTP resolves a bounded batch of public account references", async (t) => {
  const calls = [];
  const server = createControlPlaneHttpServer({
    auth: false,
    accountResolver: {
      configured: true,
      async resolve(input) {
        calls.push(input);
        return { uid: input.uniqueId || `uid-${input.accountName}`, secId: `sec-${input.accountName || input.uniqueId}`, nickname: input.accountName || input.uniqueId };
      }
    },
    prospectService: { configured: false },
    clueHunterService: { configured: false },
    taskDispatcher: { configured: true }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => server.close());
  const response = await fetch(`http://127.0.0.1:${server.address().port}/v1/connectors/prospect/resolve-accounts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ accounts: [{ accountName: "账号甲" }, { uniqueId: "89254962461" }] })
  });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.accepted, true);
  assert.equal(payload.accounts.length, 2);
  assert.equal(payload.accounts[0].account.nickname, "账号甲");
  assert.equal(payload.accounts[1].account.uid, "89254962461");
  assert.equal(calls.length, 2);
});

test("prospect callback endpoint verifies optional HMAC signatures", async (t) => {
  let callbackCount = 0;
  const server = createControlPlaneHttpServer({
    auth: false,
    now: () => prospectNow,
    prospectEventSecret: prospectSecret,
    prospectService: {
      configured: true,
      async callback(body) {
        callbackCount += 1;
        assert.equal(body.taskId, "task-signed");
        return { accepted: true, source: "prospect", events: [] };
      }
    },
    clueHunterService: { configured: false },
    taskDispatcher: { configured: true }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => server.close());
  const body = { comments: [{ aweme_id: "v1", text: "有现车吗？" }] };
  const signed = signedProspect(body);
  const base = `http://127.0.0.1:${server.address().port}`;
  const accepted = await fetch(`${base}/v1/connectors/prospect/events?taskId=task-signed&taskRunId=run-signed&conversationId=conv-signed`, {
    method: "POST",
    headers: signed.headers,
    body: signed.raw
  });
  assert.equal(accepted.status, 200);
  assert.equal(callbackCount, 1);

  const invalid = await fetch(`${base}/v1/connectors/prospect/events?taskId=task-signed&taskRunId=run-signed&conversationId=conv-signed`, {
    method: "POST",
    headers: { ...signed.headers, "x-prospect-signature": "sha256=" + "0".repeat(64) },
    body: signed.raw
  });
  assert.equal(invalid.status, 401);
  assert.equal((await invalid.json()).error.code, "PROSPECT_EVENT_SIGNATURE_INVALID");
});
