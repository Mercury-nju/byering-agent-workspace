import assert from "node:assert/strict";
import test from "node:test";

import { createClueHunterService } from "../backend/cluehunter-service.js";
import { ClueHunterConnectorError } from "../src/salebuddy/bridge/cluehunter-connector.js";
import { createControlPlaneHttpServer } from "../backend/http-server.js";

const context = {
  uid: "robot-1",
  taskId: "task-1",
  taskRunId: "run-1",
  conversationId: "conversation-1",
  agentId: "agent-1"
};

function createFakeConnector() {
  const calls = [];
  const connector = {};
  for (const operation of ["lease", "ack", "authorize", "status"]) {
    connector[operation] = async (input) => {
      calls.push({ operation, input });
      return { accepted: true, operation, input };
    };
  }
  return { connector, calls };
}

async function startServer(options = {}) {
  const server = createControlPlaneHttpServer(options);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return server;
}

test("ClueHunter service validates context and forwards only server-approved input", async () => {
  const { connector, calls } = createFakeConnector();
  const service = createClueHunterService({ connector });
  const result = await service.ack({
    ...context,
    ackId: "ack-1",
    actionType: 4,
    result: "SUCCESS",
    content: "你好"
  });
  assert.equal(result.accepted, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].input.content, "你好");
  for (const field of ["authorizationToken", "token", "tokenProvider"]) {
    await assert.rejects(
      () => service.lease({ ...context, [field]: "client-secret" }),
      (error) => error?.code === "CLUEHUNTER_CREDENTIALS_FORBIDDEN" && error?.statusCode === 400
    );
  }
  await assert.rejects(
    () => service.status({ ...context, conversationId: "" }),
    (error) => error?.code === "CLUEHUNTER_INPUT_INVALID" && error?.statusCode === 400
  );
});

test("unconfigured ClueHunter service fails closed with 503", async () => {
  const service = createClueHunterService({ env: {} });
  assert.equal(service.configured, false);
  await assert.rejects(
    () => service.status(context),
    (error) => error?.code === "CLUEHUNTER_NOT_CONFIGURED" && error?.statusCode === 503
  );
});

test("HTTP routes expose all ClueHunter operations and preserve connector errors", async (t) => {
  const { connector, calls } = createFakeConnector();
  const service = createClueHunterService({ connector });
  const server = await startServer({ clueHunterService: service });
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  for (const operation of ["lease", "ack", "authorize", "status"]) {
    const payload = operation === "ack"
      ? { ...context, ackId: "ack-http-1", actionType: 4, result: "SUCCESS" }
      : context;
    const response = await fetch(`${baseUrl}/v1/connectors/cluehunter/${operation}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.accepted, true);
    assert.equal(body.operation, operation);
  }
  assert.deepEqual(calls.map((call) => call.operation), ["lease", "ack", "authorize", "status"]);

  const notFound = await fetch(`${baseUrl}/v1/connectors/cluehunter/unknown`, { method: "POST" });
  assert.equal(notFound.status, 404);
});

test("HTTP submit exposes the explicit legacy queue contract", async (t) => {
  const calls = [];
  const connector = {
    lease: async () => ({ accepted: true }),
    ack: async () => ({ accepted: true }),
    authorize: async () => ({ accepted: true }),
    status: async () => ({ accepted: true }),
    submit: async (input) => {
      calls.push(input);
      return { accepted: true, commandId: "letter-1", queue: "video_comment_high", status: "WAIT" };
    }
  };
  const server = await startServer({ clueHunterService: createClueHunterService({ connector }) });
  t.after(() => server.close());
  const response = await fetch(`http://127.0.0.1:${server.address().port}/v1/connectors/cluehunter/submit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...context,
      idempotencyKey: "submit-1",
      actionType: 4,
      leadId: "lead-1",
      content: "你好"
    })
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    accepted: true,
    commandId: "letter-1",
    queue: "video_comment_high",
    status: "WAIT"
  });
  assert.equal(calls[0].leadId, "lead-1");
});

test("HTTP connector events are persisted when a worker call carries task context", async (t) => {
  const calls = [];
  const connector = createFakeConnector().connector;
  connector.ack = async () => ({
    accepted: true,
    events: [{ eventId: "ack-event-1", type: "outreach.sent", taskId: context.taskId, payload: { leadId: "lead-1" } }]
  });
  const controlPlane = {
    ingestExecutionEvents(input) {
      calls.push(input);
      return { accepted: true, acceptedCount: input.events.length, duplicateCount: 0, currentSeq: 9 };
    }
  };
  const server = await startServer({ controlPlane, clueHunterService: createClueHunterService({ connector }) });
  t.after(() => server.close());
  const response = await fetch(`http://127.0.0.1:${server.address().port}/v1/connectors/cluehunter/ack`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...context, ackId: "ack-http-event", actionType: 4, result: "SUCCESS" })
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ingested.acceptedCount, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].taskId, context.taskId);
  assert.equal(calls[0].events[0].eventId, "ack-event-1");
});

test("HTTP returns 503 when ClueHunter is not configured", async (t) => {
  const server = await startServer({ clueHunterService: null });
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${baseUrl}/v1/connectors/cluehunter/lease`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(context)
  });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    accepted: false,
    error: { code: "CLUEHUNTER_NOT_CONFIGURED", message: "ClueHunter connector is not configured" }
  });
});

test("explicitly disabled ClueHunter service also fails closed", async (t) => {
  const server = await startServer({ clueHunterService: null });
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${baseUrl}/v1/connectors/cluehunter/status`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(context)
  });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "CLUEHUNTER_NOT_CONFIGURED");
});

test("HTTP connector failures redact credentials from upstream details", async (t) => {
  const connector = createFakeConnector().connector;
  connector.status = async () => {
    throw new ClueHunterConnectorError("upstream rejected", "UPSTREAM_REJECTED", {
      upstream: { accessToken: "secret", nested: { cookie: "session" }, message: "invalid" }
    });
  };
  const server = await startServer({ clueHunterService: createClueHunterService({ connector }) });
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${baseUrl}/v1/connectors/cluehunter/status`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(context)
  });
  assert.equal(response.status, 502);
  const body = await response.json();
  assert.equal(body.error.details.upstream.accessToken, undefined);
  assert.equal(body.error.details.upstream.nested.cookie, undefined);
  assert.equal(body.error.details.upstream.message, "invalid");
});

test("legacy submit identity validation is reported as a client error", async (t) => {
  const connector = createFakeConnector().connector;
  connector.submit = async () => {
    throw new ClueHunterConnectorError("tenant is required", "TENANT_REQUIRED");
  };
  const server = await startServer({ clueHunterService: createClueHunterService({ connector }) });
  t.after(() => server.close());
  const response = await fetch(`http://127.0.0.1:${server.address().port}/v1/connectors/cluehunter/submit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...context, idempotencyKey: "legacy-identity", actionType: 4 })
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, "TENANT_REQUIRED");
});
