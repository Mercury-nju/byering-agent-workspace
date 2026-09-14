import assert from "node:assert/strict";
import test from "node:test";
import { bootstrapClueHunter, bootstrapFromAccountPassword, identityFromCurrentUser } from "./cluehunter-bootstrap.mjs";

const token = [
  Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url"),
  Buffer.from(JSON.stringify({ sub: "123", tenant: 456 })).toString("base64url"),
  "signature"
].join(".");

test("derives tenant and uid from the ClueHunter identity response and token", () => {
  assert.deepEqual(identityFromCurrentUser({
    token,
    response: { success: true, data: { tenant: 456, shopUid: 999 } }
  }), { tenantId: 456, uid: 123 });
});

test("bootstraps cloud configuration without exposing token in output values", async () => {
  const calls = [];
  const result = await bootstrapClueHunter({
    token,
    persist: false,
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), authorization: init.headers.authorization });
      return new Response(JSON.stringify({ success: true, data: { tenant: 456, shopUid: 999 } }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/api\/auth\/currentUserInfo$/);
  assert.equal(result.identity.tenantId, 456);
  assert.equal(result.identity.uid, 123);
  assert.equal(result.values.BYERING_CLUEHUNTER_TENANT_ID, "456");
  assert.equal(result.values.BYERING_CLUEHUNTER_UID, "123");
});

test("logs in through the legacy account-password endpoint before bootstrapping", async () => {
  const calls = [];
  const result = await bootstrapFromAccountPassword({
    account: "owner@example.com",
    password: "not-persisted",
    persist: false,
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), body: init.body });
      if (String(url).endsWith("/accountPassword/login")) {
        return new Response(JSON.stringify({ success: true, data: { token } }), { status: 200 });
      }
      return new Response(JSON.stringify({ success: true, data: { tenant: 456, shopUid: 999 } }), { status: 200 });
    }
  });
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /\/api\/auth\/accountPassword\/login$/);
  assert.deepEqual(JSON.parse(calls[0].body), { account: "owner@example.com", password: "not-persisted" });
  assert.match(calls[1].url, /\/api\/auth\/currentUserInfo$/);
  assert.equal(result.identity.tenantId, 456);
  assert.equal(result.identity.uid, 123);
});
