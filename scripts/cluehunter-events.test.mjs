import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { createControlPlaneHttpServer } from "../backend/http-server.js";

const secret = "event-secret";
const now = 1710000000000;

function sign(body, timestamp = String(now), path = "/v1/connectors/cluehunter/events") {
  const raw = JSON.stringify(body);
  const canonical = [timestamp, "POST", path, raw].join("\n");
  return {
    raw,
    headers: {
      "content-type": "application/json",
      "x-cluehunter-timestamp": timestamp,
      "x-cluehunter-signature": `sha256=${createHmac("sha256", secret).update(canonical).digest("hex")}`
    }
  };
}

async function startServer(options = {}) {
  const server = createControlPlaneHttpServer({ clueHunterEventSecret: secret, now: () => now, ...options });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return server;
}

test("ClueHunter events endpoint verifies HMAC and forwards execution facts", async (t) => {
  const calls = [];
  const server = await startServer({
    controlPlane: {
      ingestExecutionEvents(input) {
        calls.push(input);
        return { accepted: true, taskId: input.taskId, acceptedCount: input.events.length, duplicateCount: 0, currentSeq: 4, events: [] };
      }
    }
  });
  t.after(() => server.close());
  const body = {
    taskId: "task-1",
    uid: "robot-1",
    source: "cluehunter",
    events: [{ eventId: "remote-1", type: "outreach.sent", payload: { leadId: "lead-1" } }]
  };
  const signed = sign(body);
  const response = await fetch(`http://127.0.0.1:${server.address().port}/v1/connectors/cluehunter/events`, {
    method: "POST",
    headers: signed.headers,
    body: signed.raw
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    accepted: true,
    taskId: "task-1",
    acceptedCount: 1,
    duplicateCount: 0,
    currentSeq: 4,
    events: []
  });
  assert.deepEqual(calls, [{ taskId: "task-1", uid: "robot-1", source: "cluehunter", events: body.events }]);
});

test("ClueHunter events endpoint rejects missing, invalid, and replayed signatures", async (t) => {
  const server = await startServer({ controlPlane: { ingestExecutionEvents() { throw new Error("must not be called"); } } });
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}/v1/connectors/cluehunter/events`;
  const body = { taskId: "task-1", events: [{ eventId: "remote-1", type: "outreach.sent" }] };

  const missing = await fetch(base, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  assert.equal(missing.status, 401);
  assert.equal((await missing.json()).error.code, "CLUEHUNTER_EVENT_SIGNATURE_REQUIRED");

  const signed = sign(body);
  const invalid = await fetch(base, {
    method: "POST",
    headers: { ...signed.headers, "x-cluehunter-signature": `${signed.headers["x-cluehunter-signature"].slice(0, -1)}0` },
    body: signed.raw
  });
  assert.equal(invalid.status, 401);
  assert.equal((await invalid.json()).error.code, "CLUEHUNTER_EVENT_SIGNATURE_INVALID");

  const replay = sign(body, String(now - 5 * 60 * 1000 - 1));
  const replayResponse = await fetch(base, { method: "POST", headers: replay.headers, body: replay.raw });
  assert.equal(replayResponse.status, 401);
  assert.equal((await replayResponse.json()).error.code, "CLUEHUNTER_EVENT_REPLAY");
});

test("ClueHunter events endpoint fails closed when no event secret is configured", async (t) => {
  const server = createControlPlaneHttpServer({
    clueHunterEventSecret: null,
    controlPlane: { ingestExecutionEvents() { throw new Error("must not be called"); } }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const response = await fetch(`http://127.0.0.1:${server.address().port}/v1/connectors/cluehunter/events`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}"
  });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "CLUEHUNTER_EVENT_SECRET_REQUIRED");
});

