import assert from "node:assert/strict";
import test from "node:test";

import {
  ClueHunterConnectorError,
  createClueHunterConnector,
  mapLegacyAckToEvents,
  mapLegacyHeartbeatToEvents
} from "../src/salebuddy/bridge/cluehunter-connector.js";

const context = {
  taskId: "task-clue-1",
  taskRunId: "run-clue-1",
  conversationId: "conversation-clue-1",
  agentId: "outreach_specialist",
  skillId: "execute_outreach",
  skillRunId: "skill-run-clue-1"
};

function response(body, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body; },
    async text() { return JSON.stringify(body); }
  };
}

function fetchRecorder(queue = []) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const next = queue.shift();
    if (next instanceof Error) throw next;
    return next || response({ code: 0, data: [] });
  };
  return { fetchImpl, calls };
}

test("connector requires a private base URL and signing secret", () => {
  assert.throws(() => createClueHunterConnector({ secret: "secret" }), (error) => {
    assert.ok(error instanceof ClueHunterConnectorError);
    assert.equal(error.code, "CONFIG_INVALID");
    return true;
  });
  assert.throws(() => createClueHunterConnector({ baseUrl: "https://cluehunter.test" }), (error) => error.code === "CONFIG_INVALID");
  assert.throws(() => createClueHunterConnector({ baseUrl: "http://", secret: "secret" }), (error) => error.code === "CONFIG_INVALID");
});

test("lease posts the old heartbeat contract and maps each command to a canonical event", async () => {
  const recorder = fetchRecorder([response({ code: 0, data: [
    { ackId: "ack-4", actionType: 4, content: "你好，方便交流吗？", operatedUserId: "customer-1", operatedAccountSecId: "sec-1" },
    { ackId: "ack-23", actionType: 23, content: "欢迎留言", videoId: "video-1", originalComment: "想了解" }
  ] })]);
  const connector = createClueHunterConnector({ baseUrl: "https://cluehunter.test/", secret: "secret", fetchImpl: recorder.fetchImpl, now: () => 1710000000000 });

  const result = await connector.lease({ uid: "robot-1", token: "jwt-robot-1", platform: 1, subProcess: false, ...context });
  assert.equal(recorder.calls.length, 1);
  assert.equal(new URL(recorder.calls[0].url).pathname, "/api/rpa/robot/heartbeat");
  assert.deepEqual(JSON.parse(recorder.calls[0].init.body), { uid: "robot-1", platform: 1, subProcess: 0 });
  assert.match(recorder.calls[0].init.headers["x-cluehunter-signature"], /^sha256=/);
  assert.equal(recorder.calls[0].init.headers.authorization, "Bearer jwt-robot-1");
  assert.equal(recorder.calls[0].init.headers["x-cluehunter-uid"], "robot-1");
  assert.equal(result.commands.length, 2);
  assert.deepEqual(result.events.map((event) => event.type), ["outreach.sending", "outreach.sending"]);
  assert.equal(result.events[0].payload.legacy.actionType, 4);
  assert.equal(result.events[0].payload.legacy.ackId, "ack-4");
  assert.equal(result.events[0].payload.leadId, "customer-1");
  assert.equal(result.events[1].payload.channel, "video_comment");
});

test("legacy ACK success/failure becomes sent or failed without allowing an unknown action to succeed", () => {
  const success = mapLegacyAckToEvents({ ackId: "ack-4", actionType: 4, result: "SUCCESS", resultCode: 0 }, context);
  assert.equal(success.length, 1);
  assert.equal(success[0].type, "outreach.sent");
  assert.equal(success[0].payload.deliveryState, "success");

  const failure = mapLegacyAckToEvents({ ackId: "ack-4", actionType: 4, result: "FAIL", resultCode: 500, reason: "登录态失效" }, context);
  assert.equal(failure[0].type, "outreach.failed");
  assert.equal(failure[0].payload.retryable, false);

  assert.throws(() => mapLegacyAckToEvents({ ackId: "ack-unknown", actionType: 999, result: "SUCCESS" }, context), (error) => error.code === "UNKNOWN_ACTION");
  assert.throws(() => mapLegacyHeartbeatToEvents([{ actionType: 4 }], context), (error) => error.code === "ACK_ID_REQUIRED");
});

test("ack is idempotent by ackId/action, coalesces concurrent calls, and requires explicit upstream success", async () => {
  const recorder = fetchRecorder([response({ code: 0, data: true }), response({ code: 1, msg: "duplicate" })]);
  const connector = createClueHunterConnector({ baseUrl: "https://cluehunter.test", secret: "secret", fetchImpl: recorder.fetchImpl, now: () => 1710000000000 });
  const input = { ...context, uid: "robot-1", ackId: "ack-4", actionType: 4, result: "SUCCESS", resultCode: 0 };

  const [first, second] = await Promise.all([
    connector.ack(input),
    connector.ack({ ...input, idempotencyKey: "caller-must-not-change-key" })
  ]);
  assert.equal(recorder.calls.length, 1);
  assert.equal(first.events[0].type, "outreach.sent");
  assert.equal(second.idempotent, true);
  assert.equal(recorder.calls[0].init.headers["x-idempotency-key"], "ack:robot-1:ack-4:4");

  await assert.rejects(
    connector.ack({ ...input, result: "FAIL", resultCode: 500 }),
    (error) => error instanceof ClueHunterConnectorError && error.code === "IDEMPOTENCY_CONFLICT"
  );
  assert.equal(recorder.calls.length, 1);

  await assert.rejects(
    connector.ack({ ...input, ackId: "ack-fail", result: "FAIL", resultCode: 500 }),
    (error) => error instanceof ClueHunterConnectorError && error.code === "UPSTREAM_REJECTED"
  );
  assert.equal(recorder.calls.length, 2);

  const nestedSuccess = fetchRecorder([response({ code: 0, data: { result: "SUCCESS" } })]);
  const nestedConnector = createClueHunterConnector({ baseUrl: "https://cluehunter.test", secret: "secret", fetchImpl: nestedSuccess.fetchImpl });
  const nested = await nestedConnector.ack({ ...input, ackId: "ack-nested" });
  assert.equal(nested.accepted, true);

  const ambiguous = fetchRecorder([response({ code: 0, data: "ok" })]);
  const strictConnector = createClueHunterConnector({ baseUrl: "https://cluehunter.test", secret: "secret", fetchImpl: ambiguous.fetchImpl });
  await assert.rejects(strictConnector.ack({ ...input, ackId: "ack-ambiguous" }), (error) => error.code === "ACK_RESPONSE_AMBIGUOUS");
});

test("authorize and status use explicit old endpoints and refuse malformed success envelopes", async () => {
  const recorder = fetchRecorder([
    response({ code: 0, data: true }),
    response({ code: 0, data: true }),
    response({ code: 0, data: { login: true, account: "sales-1" } }),
    response({ code: 0, data: null })
  ]);
  const connector = createClueHunterConnector({
    baseUrl: "https://cluehunter.test",
    secret: "secret",
    fetchImpl: recorder.fetchImpl,
    paths: { status: "/api/rpa/robot/ws/status" }
  });

  const authorized = await connector.authorize({ ...context, uid: "robot-1", resultCode: 0, userId: "douyin-user-1", account: "sales-1" });
  assert.equal(new URL(recorder.calls[0].url).pathname, "/api/rpa/robot/accountAuthAck");
  assert.equal(authorized.events[0].type, "access.authorization.granted");
  assert.equal(authorized.events[0].payload.account, "sales-1");
  const authorizedAgain = await connector.authorize({ ...context, uid: "robot-1", resultCode: 0, userId: "douyin-user-1", account: "sales-1" });
  assert.notEqual(authorized.events[0].eventId, authorizedAgain.events[0].eventId);

  const status = await connector.status({ ...context, uid: "robot-1", status: "READY" });
  assert.equal(new URL(recorder.calls[2].url).pathname, "/api/rpa/robot/ws/status");
  assert.equal(status.events[0].type, "access.authorization.granted");

  await assert.rejects(connector.status({ ...context, uid: "robot-1", status: "READY", idempotencyKey: "status-bad" }), (error) => error.code === "UPSTREAM_EMPTY");
});

test("authorization and status operations coalesce explicit idempotency keys", async () => {
  const recorder = fetchRecorder([
    response({ code: 0, data: true }),
    response({ code: 0, data: "READY" })
  ]);
  const connector = createClueHunterConnector({
    baseUrl: "https://cluehunter.test",
    secret: "secret",
    fetchImpl: recorder.fetchImpl
  });

  const authInput = { ...context, uid: "robot-1", idempotencyKey: "auth-once" };
  const [authFirst, authSecond] = await Promise.all([
    connector.authorize(authInput),
    connector.authorize({ ...authInput })
  ]);
  assert.equal(recorder.calls.length, 1);
  assert.equal(authFirst.idempotent, false);
  assert.equal(authSecond.idempotent, true);

  const statusInput = { ...context, uid: "robot-1", idempotencyKey: "status-once" };
  const [statusFirst, statusSecond] = await Promise.all([
    connector.status(statusInput),
    connector.status({ ...statusInput })
  ]);
  assert.equal(recorder.calls.length, 2);
  assert.equal(statusFirst.idempotent, false);
  assert.equal(statusSecond.idempotent, true);
  assert.equal(statusFirst.events[0].type, "access.authorization.granted");
});

test("submit requires an explicit protected endpoint and an unambiguous acceptance", async () => {
  const contextInput = {
    ...context,
    uid: "robot-1",
    idempotencyKey: "submit-once",
    actionType: 4,
    leadId: "lead-1",
    content: "方便了解一下吗？"
  };
  const unconfigured = createClueHunterConnector({
    baseUrl: "https://cluehunter.test",
    secret: "secret",
    fetchImpl: fetchRecorder().fetchImpl
  });
  await assert.rejects(unconfigured.submit(contextInput), (error) => error.code === "SUBMIT_NOT_CONFIGURED");

  const ambiguousRecorder = fetchRecorder([response({ code: 0, data: { accepted: true } })]);
  const ambiguous = createClueHunterConnector({
    baseUrl: "https://cluehunter.test",
    secret: "secret",
    paths: { submit: "/internal/rpa/submit" },
    fetchImpl: ambiguousRecorder.fetchImpl
  });
  await assert.rejects(ambiguous.submit(contextInput), (error) => error.code === "SUBMIT_RESPONSE_INVALID");

  const recorder = fetchRecorder([response({ code: 0, data: {
    accepted: true,
    commandId: "letter-1",
    queue: "video_comment_high",
    status: "WAIT"
  } })]);
  const connector = createClueHunterConnector({
    baseUrl: "https://cluehunter.test",
    secret: "secret",
    paths: { submit: "/internal/rpa/submit" },
    fetchImpl: recorder.fetchImpl
  });
  const submitted = await connector.submit(contextInput);
  assert.equal(submitted.accepted, true);
  assert.equal(submitted.commandId, "letter-1");
  assert.equal(submitted.events[0].type, "task.execution.accepted");
  assert.equal(new URL(recorder.calls[0].url).pathname, "/internal/rpa/submit");
  assert.equal(recorder.calls[0].init.headers["x-idempotency-key"], "submit:robot-1:submit-once");
  assert.equal(JSON.parse(recorder.calls[0].init.body).content, "方便了解一下吗？");
});

test("legacy submit maps the Java queue contract and signs its dedicated headers", async () => {
  const recorder = fetchRecorder([response({ code: 0, data: {
    accepted: true,
    commandId: "101",
    queue: "VIDEO_COMMENT_HIGH_INTENTION",
    status: "QUEUED"
  } })]);
  const connector = createClueHunterConnector({
    baseUrl: "https://cluehunter.test",
    secret: "secret",
    paths: { submit: "/api/rpa/robot/submit" },
    fetchImpl: recorder.fetchImpl,
    now: () => 1710000000000
  });
  const result = await connector.submit({
    ...context,
    tenantId: "42",
    uid: "1001",
    idempotencyKey: "submit-legacy-1",
    actionType: 4,
    leadId: "customer-1",
    leadSecUid: "sec-1",
    content: "方便了解一下吗？"
  });
  const call = recorder.calls[0];
  const body = JSON.parse(call.init.body);
  assert.equal(body.tenant, 42);
  assert.equal(body.uid, 1001);
  assert.equal(body.action, 4);
  assert.equal(body.queue, "VIDEO_COMMENT_HIGH_INTENTION");
  assert.equal(body.consumerOpenId, "customer-1");
  assert.equal(body.consumerSecUid, "sec-1");
  assert.equal(body.content, "方便了解一下吗？");
  assert.equal(call.init.headers["Idempotency-Key"], "submit:1001:submit-legacy-1");
  assert.match(call.init.headers.signature, /^[A-Za-z0-9+/]+=*$/);
  assert.equal(result.accepted, true);
});

test("legacy submit rejects missing numeric execution identity before network", async () => {
  const recorder = fetchRecorder();
  const connector = createClueHunterConnector({
    baseUrl: "https://cluehunter.test",
    secret: "secret",
    paths: { submit: "/api/rpa/robot/submit" },
    fetchImpl: recorder.fetchImpl
  });
  await assert.rejects(
    connector.submit({ ...context, uid: "browser-session-1", actionType: 4, idempotencyKey: "legacy-identity" }),
    (error) => error.code === "TENANT_REQUIRED"
  );
  assert.equal(recorder.calls.length, 0);
});
