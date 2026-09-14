import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { createControlPlane } from "../backend/control-plane.js";
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

async function runningSingleOutreachPlane() {
  let sequence = 0;
  const plane = createControlPlane({
    idFactory: () => `cluehunter-http-${++sequence}`,
    now: () => "2026-09-13T00:00:00.000Z",
    requirementService: {
      async understand({ goal }) {
        return {
          schemaVersion: 1,
          source: "test",
          provider: "test",
          model: "test",
          generatedAt: "2026-09-13T00:00:00.000Z",
          title: "测试触达",
          objective: goal,
          scope: "测试",
          deliverable: "测试",
          guardrail: "测试",
          missing: [],
          assumptions: [],
          confidence: 1
        };
      }
    }
  });
  const created = await plane.dispatchAsync({
    type: "task.create",
    payload: { goal: "核验外部任务回执" }
  });
  const started = plane.dispatch({
    type: "task.start",
    taskId: created.taskId,
    expectedVersion: created.currentVersion,
    payload: { requirementsConfirmed: false }
  });
  await plane.dispatchAsync({
    type: "task.requirement.confirm",
    taskId: created.taskId,
    expectedVersion: started.currentVersion,
    payload: { proposalVersion: created.data.requirement.proposalVersion, requiresAccess: false }
  });
  plane.ingestExecutionEvents({
    taskId: created.taskId,
    events: [{
      eventId: "submitted-first-outreach",
      type: "task.result.snapshot.updated",
      agentId: "mkt-cold-writer",
      payload: {
        resultSnapshot: {
          type: "single_outreach",
          approvalQueue: [{
            id: "outreach:lead-http-1",
            state: "pending",
            lead: { id: "lead-http-1", secUid: "sec-uid-http-1", nickname: "杭州林女士" },
            content: "你好，方便了解一下你的需求吗？",
            requestId: "run-http-1",
            commandId: "command-http-1",
            receipt: { state: "pending", reqId: "run-http-1", commandId: "command-http-1", receiptPending: true }
          }]
        }
      }
    }]
  });
  return { plane, taskId: created.taskId };
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

test("a signed final RPA receipt transitions the same pending outreach through the production HTTP event path", async (t) => {
  const { plane, taskId } = await runningSingleOutreachPlane();
  const server = await startServer({ controlPlane: plane });
  t.after(() => server.close());

  const body = {
    taskId,
    uid: "10401",
    source: "cluehunter",
    events: [{
      eventId: "final-first-outreach-http-1",
      type: "outreach.sent",
      agentId: "mkt-cold-writer",
      payload: {
        deliveryState: "sent",
        commandId: "command-http-1",
        reqId: "run-http-1",
        messageId: "message-http-1"
      }
    }]
  };
  const signed = sign(body);
  const response = await fetch(`http://127.0.0.1:${server.address().port}/v1/connectors/cluehunter/events`, {
    method: "POST",
    headers: signed.headers,
    body: signed.raw
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).acceptedCount, 2, "final delivery persists the receipt and the terminal task event");

  const snapshot = plane.getTaskSnapshot(taskId);
  assert.equal(snapshot.state, "SUCCEEDED");
  assert.equal(snapshot.resultSnapshot.approvalQueue[0].state, "sent");
  assert.equal(snapshot.resultSnapshot.approvalQueue[0].lead.nickname, "杭州林女士");
  assert.equal(snapshot.resultSnapshot.approvalQueue[0].receipt.messageId, "message-http-1");
  assert.deepEqual(
    plane.listTaskEvents(taskId).slice(-2).map((event) => event.type),
    ["outreach.sent", "task.completed"]
  );
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
