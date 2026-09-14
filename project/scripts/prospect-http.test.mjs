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
  const intentAnalysisService = {
    configured: true,
    modelConfigured: true,
    async analyze(body) {
      calls.push(["analyze", body]);
      return { accepted: true, source: "prospect", status: "completed", resultSnapshot: { leads: body.candidates || [] }, events: [] };
    }
  };
  const server = createControlPlaneHttpServer({
    auth: false,
    prospectService,
    intentAnalysisService,
    employmentStore: {
      list: () => [{ agentId: "mkt-intent-analyst", status: "active" }]
    },
    prospectRecordStore: {
      list: () => [{
        id: "record-1",
        nickname: "候选用户",
        status: "待触达",
        secUid: "candidate-sec",
        contactability: { allowed: true, sourceScope: "own_account_live" },
        source: { sourceScope: "own_account_live", accountId: "account-analysis" }
      }]
    },
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

  const analyze = await fetch(`${base}/v1/connectors/prospect/analyze`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ taskId: "task-analysis", agentId: "mkt-intent-analyst", accountId: "account-analysis", candidates: [{ sourceRecordId: "record-1" }] })
  });
  assert.equal(analyze.status, 200);
  assert.equal((await analyze.json()).source, "core-agent-execution");

  const callback = await fetch(`${base}/v1/connectors/prospect/events?taskId=task-http&taskRunId=run-http&conversationId=conv-http&goal=%E6%89%BE%E6%BD%9C%E5%AE%A2`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ taskId: "spoofed-task", itemList: [{ video_id: "v1" }] })
  });
  assert.equal(callback.status, 200);
  assert.equal((await callback.json()).source, "prospect");
  assert.equal(calls[0][0], "discover");
  assert.equal(calls[1][0], "analyze");
  assert.equal(calls[1][1].agentId, "mkt-intent-analyst");
  assert.equal(calls[2][0], "callback");
  assert.equal(calls[2][1].taskId, "task-http");
  assert.equal(calls[2][1].taskRunId, "run-http");
});

test("Douyin MCP outreach requires cloud authorization and explicit confirmation", async (t) => {
  const calls = [];
  let authorized = false;
  const douyinMcpService = {
    configured: true,
    async status() {
      return authorized
        ? { ok: true, login_state: "logged_in", account: { sec_uid: "sec-sender", nickname: "店主账号", identity: { uniqueId: "shop_owner" } } }
        : { ok: true, login_state: "logged_out", account: null };
    },
    async sendPrivateMessage(payload) { calls.push(["send-private-message", payload]); return { ok: true, message: "sent" }; }
  };
  const server = createControlPlaneHttpServer({
    auth: false,
    douyinMcpService,
    prospectService: { configured: false },
    clueHunterService: { configured: false },
    taskDispatcher: { configured: true }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (body) => fetch(`${base}/v1/douyin/mcp/send-private-message`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });

  const missingConfirmation = await request({ secUid: "sec-1", content: "你好" });
  assert.equal(missingConfirmation.status, 400);
  assert.equal((await missingConfirmation.json()).error.code, "OUTREACH_CONFIRMATION_REQUIRED");

  const loggedOut = await request({ secUid: "sec-1", content: "你好", confirm: "SEND" });
  assert.equal(loggedOut.status, 409);
  assert.equal((await loggedOut.json()).error.code, "DOUYIN_AUTHORIZATION_REQUIRED");

  authorized = true;
  const sent = await request({ secUid: "sec-1", nickname: "潜客", content: "你好", confirm: "SEND", reqId: "outreach-1" });
  assert.equal(sent.status, 200);
  assert.equal((await sent.json()).message, "sent");
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1].secUid, "sec-1");
  assert.equal(calls[0][1].content, "你好");
  assert.equal(Object.hasOwn(calls[0][1], "nickname"), false);
  assert.equal(Object.hasOwn(calls[0][1], "operatedAccountSecId"), false);
  assert.equal(Object.hasOwn(calls[0][1], "operatedNickname"), false);
  assert.equal(calls[0][1].timeoutMs, 30 * 60 * 1000);
  assert.equal(calls[0][1].actionType, 5);
});

test("Douyin MCP outreach enters the real sender account priority queue", async (t) => {
  const coordinationCalls = [];
  const server = createControlPlaneHttpServer({
    auth: false,
    douyinMcpService: {
      configured: true,
      async status() {
        return { ok: true, login_state: "logged_in", account: { sec_uid: "shared-sender", nickname: "共享账号" } };
      },
      async sendPrivateMessage() { return { ok: true, message: "sent" }; }
    },
    douyinAccountActionCoordinator: {
      async runOutreach(accountKey, operation, metadata) {
        coordinationCalls.push({ accountKey, metadata });
        return operation();
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

  const response = await fetch(`http://127.0.0.1:${server.address().port}/v1/douyin/mcp/send-private-message`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      agentId: "mkt-user-research",
      accountId: "douyin-agent:mkt-user-research",
      secId: "target-sec",
      content: "你好",
      confirm: "SEND",
      reqId: "priority-outreach-1"
    })
  });

  assert.equal(response.status, 200);
  assert.equal(coordinationCalls.length, 1);
  assert.equal(coordinationCalls[0].accountKey, "douyin:sec:shared-sender");
  assert.equal(coordinationCalls[0].metadata.action, "private_outreach");
});

test("Douyin outreach task reserves account priority for the whole batch", async (t) => {
  const calls = [];
  const coordinator = {
    beginOutreach(accountKey, taskId, metadata) {
      calls.push(["begin", accountKey, taskId, metadata]);
      return { outreachTaskCount: 1 };
    },
    touchOutreach(taskId) {
      calls.push(["touch", taskId]);
    },
    endOutreach(taskId) {
      calls.push(["end", taskId]);
      return true;
    },
    async runOutreach(accountKey, operation) {
      calls.push(["send", accountKey]);
      return operation();
    }
  };
  const server = createControlPlaneHttpServer({
    auth: false,
    douyinMcpService: {
      configured: true,
      async status() {
        return { ok: true, login_state: "logged_in", account: { sec_uid: "batch-sender" } };
      },
      async sendPrivateMessage() { return { ok: true, message: "sent" }; }
    },
    douyinAccountActionCoordinator: coordinator,
    prospectService: { configured: false },
    clueHunterService: { configured: false },
    taskDispatcher: { configured: true }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body) => fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });

  const started = await post("/v1/douyin/mcp/outreach-priority/start", {
    agentId: "mkt-user-research",
    accountId: "logical-outreach-account",
    taskId: "batch-task-1"
  });
  assert.equal(started.status, 200);

  const sent = await post("/v1/douyin/mcp/send-private-message", {
    agentId: "mkt-user-research",
    accountId: "logical-outreach-account",
    taskId: "batch-task-1",
    secId: "target-sec",
    content: "你好",
    confirm: "SEND"
  });
  assert.equal(sent.status, 200);

  const finished = await post("/v1/douyin/mcp/outreach-priority/finish", {
    agentId: "mkt-cold-writer",
    taskId: "batch-task-1"
  });
  assert.equal(finished.status, 200);
  assert.deepEqual(calls.map((entry) => entry[0]), ["begin", "touch", "send", "end"]);
  assert.equal(calls[0][1], "douyin:sec:batch-sender");
});

test("direct inbox replies also use the account queue", async (t) => {
  const coordinationCalls = [];
  const server = createControlPlaneHttpServer({
    auth: false,
    douyinMcpService: {
      configured: true,
      async status() {
        return { ok: true, login_state: "logged_in", account: { sec_uid: "shared-inbox-sender" } };
      },
      async startMessageMode() { return { ok: true }; },
      async sendMessage() { return { ok: true, message: "sent" }; }
    },
    douyinAccountActionCoordinator: {
      async runInbox(accountKey, operation, metadata) {
        coordinationCalls.push({ accountKey, metadata });
        return operation();
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

  const response = await fetch(`http://127.0.0.1:${server.address().port}/v1/douyin/mcp/send-message`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ conversationId: "conversation-1", content: "收到", confirm: "SEND", reqId: "reply-1" })
  });

  assert.equal(response.status, 200);
  assert.equal(coordinationCalls.length, 1);
  assert.equal(coordinationCalls[0].accountKey, "douyin:sec:shared-inbox-sender");
  assert.equal(coordinationCalls[0].metadata.action, "direct_reply");
});

test("Douyin MCP outreach preserves provider action failure diagnostics", async (t) => {
  const douyinMcpService = {
    configured: true,
    async status() {
      return { ok: true, login_state: "logged_in", account: { sec_uid: "sec-sender", nickname: "店主账号" } };
    },
    async sendPrivateMessage() {
      return { ok: false, error: { code: "private_message_failed", message: "私信窗口打开失败" } };
    }
  };
  const server = createControlPlaneHttpServer({
    auth: false,
    douyinMcpService,
    prospectService: { configured: false },
    clueHunterService: { configured: false },
    taskDispatcher: { configured: true }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => server.close());

  const response = await fetch("http://127.0.0.1:" + server.address().port + "/v1/douyin/mcp/send-private-message", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ secId: "sec-target", content: "你好", confirm: "SEND" })
  });
  assert.equal(response.status, 502);
  const payload = await response.json();
  assert.equal(payload.error.message, "私信窗口打开失败");
  assert.equal(payload.error.details.operation, "send_private_message");
  assert.equal(payload.error.details.phase, "provider_action_failed");
  assert.equal(payload.error.details.targetIdProvided, true);
  assert.equal(payload.error.details.actionType, 5);
  assert.deepEqual(payload.error.details.upstreamError, {
    code: "private_message_failed",
    message: "私信窗口打开失败"
  });
});

test("Douyin MCP outreach marks transport failures as outcome unknown", async (t) => {
  const douyinMcpService = {
    configured: true,
    async status() {
      return { ok: true, login_state: "logged_in", account: { sec_uid: "sec-sender", nickname: "店主账号" } };
    },
    async sendPrivateMessage() {
      throw Object.assign(new Error("Transport closed"), { code: "mcp_call_failed" });
    }
  };
  const server = createControlPlaneHttpServer({
    auth: false,
    douyinMcpService,
    prospectService: { configured: false },
    clueHunterService: { configured: false },
    taskDispatcher: { configured: true }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => server.close());

  const response = await fetch("http://127.0.0.1:" + server.address().port + "/v1/douyin/mcp/send-private-message", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ secId: "sec-target", content: "你好", confirm: "SEND", reqId: "transport-unknown-1" })
  });
  assert.equal(response.status, 502);
  const payload = await response.json();
  assert.equal(payload.error.code, "mcp_call_failed");
  assert.equal(payload.error.details.phase, "provider_transport_failed");
  assert.equal(payload.error.details.outcome, "unknown");
  assert.equal(payload.error.details.reqId, "transport-unknown-1");
});

test("Douyin MCP private outreach uses the remote status probe before the mutating call", async (t) => {
  const calls = [];
  const service = {
    configured: true,
    async probeRemoteStatus() {
      calls.push("remote-status");
      return { ok: true, login_state: "logged_in", account: { sec_uid: "sec-sender", nickname: "店主账号" } };
    },
    async sendPrivateMessage(payload) {
      calls.push(["send-private-message", payload]);
      return { ok: true, message: "sent" };
    }
  };
  const server = createControlPlaneHttpServer({
    auth: false,
    douyinMcpService: { configured: true },
    douyinAgentCloudRegistry: {
      getService() { return service; },
      async status() { throw new Error("private outreach must not use the local MCP status preflight"); }
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

  const response = await fetch(`http://127.0.0.1:${server.address().port}/v1/douyin/mcp/send-private-message`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      agentId: "mkt-user-research",
      secId: "sec-target",
      secUid: "sec-target",
      content: "你好",
      confirm: "SEND",
      reqId: "remote-preflight-1"
    })
  });

  assert.equal(response.status, 200);
  assert.deepEqual(calls.map((entry) => Array.isArray(entry) ? entry[0] : entry), ["remote-status", "send-private-message"]);
});

test("Douyin MCP outreach rejects concurrent browser actions for different requests", async (t) => {
  let sendStarted;
  const started = new Promise((resolve) => { sendStarted = resolve; });
  let releaseSend;
  const firstSend = new Promise((resolve) => { releaseSend = resolve; });
  let calls = 0;
  const douyinMcpService = {
    configured: true,
    async status() {
      return { ok: true, login_state: "logged_in", account: { sec_uid: "sec-sender", nickname: "店主账号" } };
    },
    async sendPrivateMessage() {
      calls += 1;
      if (calls === 1) {
        sendStarted();
        return firstSend;
      }
      return { ok: true, message: "unexpected second send" };
    }
  };
  const server = createControlPlaneHttpServer({
    auth: false,
    douyinMcpService,
    prospectService: { configured: false },
    clueHunterService: { configured: false },
    taskDispatcher: { configured: true }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => server.close());
  const request = (reqId) => fetch("http://127.0.0.1:" + server.address().port + "/v1/douyin/mcp/send-private-message", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ secId: "sec-target", content: "你好", confirm: "SEND", reqId })
  });

  const first = request("concurrent-1");
  await started;
  const second = await request("concurrent-2");
  assert.equal(second.status, 409);
  const secondPayload = await second.json();
  assert.equal(secondPayload.error.code, "DOUYIN_PRIVATE_MESSAGE_BUSY");
  assert.equal(secondPayload.error.details.phase, "provider_action_in_flight");
  assert.equal(calls, 1);

  releaseSend({ ok: true, message: "sent" });
  const firstResponse = await first;
  assert.equal(firstResponse.status, 200);
});

test("Douyin MCP outreach rejects mismatched secId and secUid", async (t) => {
  const calls = [];
  const server = createControlPlaneHttpServer({
    auth: false,
    douyinMcpService: {
      configured: true,
      async status() {
        return { ok: true, login_state: "logged_in", account: { sec_uid: "sec-sender" } };
      },
      async sendPrivateMessage(payload) { calls.push(payload); return { ok: true, message: "sent" }; },
    },
    prospectService: { configured: false },
    clueHunterService: { configured: false },
    taskDispatcher: { configured: true },
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => server.close());
  const response = await fetch("http://127.0.0.1:" + server.address().port + "/v1/douyin/mcp/send-private-message", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ secId: "sec-a", secUid: "sec-b", content: "你好", confirm: "SEND" }),
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, "DOUYIN_RECIPIENT_ID_MISMATCH");
  assert.equal(calls.length, 0);
});

test("Douyin MCP restart routes to the Agent cloud registry", async (t) => {
  const calls = [];
  const registry = {
    getService() { return { configured: true }; },
    async restart(agentId, options) {
      calls.push({ agentId, options });
      return { ok: true, state: "STARTING", agentId, sessionId: "session-restarted" };
    }
  };
  const server = createControlPlaneHttpServer({
    auth: false,
    douyinMcpService: { configured: true },
    douyinAgentCloudRegistry: registry,
    prospectService: { configured: false },
    clueHunterService: { configured: false },
    taskDispatcher: { configured: true }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => server.close());
  const response = await fetch(`http://127.0.0.1:${server.address().port}/v1/douyin/mcp/restart`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ agentId: "mkt-cold-writer", billingPlan: "monthly" })
  });
  assert.equal(response.status, 202);
  assert.equal((await response.json()).sessionId, "session-restarted");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].agentId, "mkt-douyin-account-runtime");
  assert.equal(calls[0].options.billingPlan, "monthly");
  assert.equal(calls[0].options.accountId, null);
});

test("Douyin account listing only returns ready sessions with a real profile identity", async (t) => {
  const server = createControlPlaneHttpServer({
    auth: false,
    browserWorkspace: {
      list: () => [
        { provider: "douyin", state: "READY", authenticationVerified: true, tenantId: "local-user", accountKey: "real-1", accountLabel: "真实账号", accountIdentity: { uniqueId: "real_shop" } },
        { provider: "douyin", state: "READY", authenticationVerified: true, tenantId: "local-user", accountKey: "hidden-1", accountLabel: "槽位名称", accountIdentity: { accountName: "槽位名称", managedAccountKey: "hidden-1" } },
        { provider: "douyin", state: "READY", authenticationVerified: false, tenantId: "local-user", accountKey: "demo-1", accountLabel: "演示账号", accountIdentity: null },
        { provider: "douyin", state: "AUTHORIZING", tenantId: "local-user", accountKey: "pending-1", accountLabel: "待授权", accountIdentity: { uniqueId: "pending_shop" } }
      ]
    },
    prospectService: { configured: false },
    clueHunterService: { configured: false },
    taskDispatcher: { configured: false }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => server.close());
  const response = await fetch(`http://127.0.0.1:${server.address().port}/v1/connectors/douyin/accounts`);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(payload.accounts.map((account) => account.id), ["real-1"]);
  assert.equal(payload.accounts[0].handle, "@real_shop");
});

test("Douyin account listing includes each authenticated Agent cloud with its real nickname", async (t) => {
  let workspaceSnapshotCalls = 0;
  const avatarFetches = [];
  const server = createControlPlaneHttpServer({
    auth: false,
    browserWorkspace: {
      list: () => [{ sessionId: "legacy-browser-session" }],
      snapshot: async () => {
        workspaceSnapshotCalls += 1;
        throw new Error("Agent cloud account listing must not wait for legacy browser sessions");
      }
    },
    douyinAgentCloudRegistry: {
      getService: () => ({ configured: false }),
      list: () => [
        {
          agentId: "mkt-dm-inbox",
          sessionId: "session-king",
          status: "online",
          accountIdentity: {
            nickname: "国王",
            account: "guowang73732",
            uid: "43592743387647",
            secId: "sec-king",
            avatar: "https://p3-pc-sign.douyinpic.com/king.jpg"
          }
        },
        {
          agentId: "mkt-cold-writer",
          sessionId: "session-yiyiwanzhen",
          status: "online",
          accountIdentity: {
            nickname: "一以万真",
            account: "16764616",
            uid: "58262205543",
            secId: "sec-yiyiwanzhen"
          }
        }
      ]
    },
    douyinAvatarFetcher: async (source) => {
      avatarFetches.push(source);
      return { body: Buffer.from([0xff, 0xd8, 0xff, 0xd9]), contentType: "image/jpeg" };
    },
    prospectService: { configured: false },
    clueHunterService: { configured: false },
    taskDispatcher: { configured: false }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => server.close());

  const response = await fetch(`http://127.0.0.1:${server.address().port}/v1/connectors/douyin/accounts`);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(payload.accounts.map((account) => account.id), [
    "douyin-agent:mkt-dm-inbox",
    "douyin-agent:mkt-cold-writer"
  ]);
  assert.deepEqual(payload.accounts.map((account) => account.name), ["国王", "一以万真"]);
  assert.deepEqual(payload.accounts.map((account) => account.sessionId), ["session-king", "session-yiyiwanzhen"]);
  assert.match(payload.accounts[0].avatar, /\/v1\/connectors\/douyin\/accounts\/mkt-dm-inbox\/avatar$/);
  assert.match(payload.accounts[1].avatar, /\/v1\/connectors\/douyin\/accounts\/mkt-cold-writer\/avatar$/);
  assert.equal(workspaceSnapshotCalls, 0);

  const avatarResponse = await fetch(payload.accounts[0].avatar);
  assert.equal(avatarResponse.status, 200);
  assert.equal(avatarResponse.headers.get("content-type"), "image/jpeg");
  assert.deepEqual([...new Uint8Array(await avatarResponse.arrayBuffer())], [0xff, 0xd8, 0xff, 0xd9]);
  assert.deepEqual(avatarFetches, ["https://p3-pc-sign.douyinpic.com/king.jpg"]);
});

test("expired Douyin avatar refreshes from the verified public profile before it is served", async (t) => {
  const resolverCalls = [];
  const avatarFetches = [];
  const identityUpdates = [];
  let record = {
    agentId: "mkt-dm-inbox",
    sessionId: "session-yiyiwanzhen",
    status: "online",
    accountIdentity: {
      nickname: "一以万真",
      uniqueId: "58262205543",
      secId: "MS4wLjABAAAaunpKE2IXyHAxm4A24G5d1Cf5141pnZy8HwNR5f2-6pI_GYBVR-Pv23uFyfMPB_9I",
      avatarUrl: "https://p3-pc-sign.douyinpic.com/expired.jpeg?x-expires=1&x-signature=expired"
    }
  };
  const registry = {
    getService: () => ({ configured: false }),
    list: () => [record],
    refreshAccountIdentity(agentId, scope, identity) {
      identityUpdates.push({ agentId, scope, identity });
      record = { ...record, accountIdentity: identity };
      return record;
    }
  };
  const server = createControlPlaneHttpServer({
    auth: false,
    browserWorkspace: { list: () => [] },
    douyinAgentCloudRegistry: registry,
    accountResolver: {
      configured: true,
      async resolve(input) {
        resolverCalls.push(input);
        return {
          secId: record.accountIdentity.secId,
          uniqueId: record.accountIdentity.uniqueId,
          nickname: record.accountIdentity.nickname,
          avatarUrl: "https://p3-pc-sign.douyinpic.com/fresh.jpeg?x-expires=1893456000&x-signature=fresh"
        };
      }
    },
    douyinAvatarFetcher: async (source) => {
      avatarFetches.push(source);
      return { body: Buffer.from([0x89, 0x50, 0x4e, 0x47]), contentType: "image/png" };
    },
    prospectService: { configured: false },
    clueHunterService: { configured: false },
    taskDispatcher: { configured: false }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => server.close());

  const base = `http://127.0.0.1:${server.address().port}`;
  const account = (await fetch(`${base}/v1/connectors/douyin/accounts`).then((response) => response.json())).accounts[0];
  const avatarResponse = await fetch(account.avatar);

  assert.equal(avatarResponse.status, 200);
  assert.deepEqual(resolverCalls, [{
    profileUrl: "https://www.douyin.com/user/MS4wLjABAAAaunpKE2IXyHAxm4A24G5d1Cf5141pnZy8HwNR5f2-6pI_GYBVR-Pv23uFyfMPB_9I"
  }]);
  assert.deepEqual(avatarFetches, ["https://p3-pc-sign.douyinpic.com/fresh.jpeg?x-expires=1893456000&x-signature=fresh"]);
  assert.equal(identityUpdates.length, 1);
  assert.equal(record.accountIdentity.avatarUrl, "https://p3-pc-sign.douyinpic.com/fresh.jpeg?x-expires=1893456000&x-signature=fresh");
});

test("missing Douyin avatar hydrates from the verified public profile before the account card renders", async (t) => {
  const resolverCalls = [];
  const avatarFetches = [];
  let record = {
    agentId: "mkt-dm-inbox",
    sessionId: "session-yiyiwanzhen",
    status: "online",
    accountIdentity: {
      nickname: "一以万真",
      sec_uid: "MS4wLjABAAAANBL6nfSQoWxQtCW4BUuybMmvHB7lOGIggcL9tuV71tc"
    }
  };
  const registry = {
    getService: () => ({ configured: false }),
    list: () => [record],
    refreshAccountIdentity(agentId, scope, identity) {
      record = { ...record, accountIdentity: identity };
      return record;
    }
  };
  const server = createControlPlaneHttpServer({
    auth: false,
    browserWorkspace: { list: () => [] },
    douyinAgentCloudRegistry: registry,
    accountResolver: {
      configured: true,
      async resolve(input) {
        resolverCalls.push(input);
        return {
          secId: record.accountIdentity.sec_uid,
          nickname: record.accountIdentity.nickname,
          avatarUrl: "https://p3-pc-sign.douyinpic.com/yiyiwanzhen.jpeg?x-expires=1893456000&x-signature=fresh"
        };
      }
    },
    douyinAvatarFetcher: async (source) => {
      avatarFetches.push(source);
      return { body: Buffer.from([0x89, 0x50, 0x4e, 0x47]), contentType: "image/png" };
    },
    prospectService: { configured: false },
    clueHunterService: { configured: false },
    taskDispatcher: { configured: false }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => server.close());

  const base = `http://127.0.0.1:${server.address().port}`;
  const account = (await fetch(`${base}/v1/connectors/douyin/accounts`).then((response) => response.json())).accounts[0];
  assert.match(account.avatar, /\/v1\/connectors\/douyin\/accounts\/mkt-dm-inbox\/avatar$/);

  const avatarResponse = await fetch(account.avatar);
  assert.equal(avatarResponse.status, 200);
  assert.deepEqual(resolverCalls, [{
    profileUrl: "https://www.douyin.com/user/MS4wLjABAAAANBL6nfSQoWxQtCW4BUuybMmvHB7lOGIggcL9tuV71tc"
  }]);
  assert.deepEqual(avatarFetches, ["https://p3-pc-sign.douyinpic.com/yiyiwanzhen.jpeg?x-expires=1893456000&x-signature=fresh"]);
  assert.equal(record.accountIdentity.avatarUrl, "https://p3-pc-sign.douyinpic.com/yiyiwanzhen.jpeg?x-expires=1893456000&x-signature=fresh");
});

test("direct prospect discovery returns connector results without requiring a pre-created task", async (t) => {
  const server = createControlPlaneHttpServer({
    auth: false,
    prospectService: {
      configured: true,
      async discover(body) {
        return {
          accepted: true,
          source: "prospect",
          status: "SUCCEEDED",
          resultSnapshot: { counts: { comments: 1, candidates: 1, qualified: 1 } },
          events: [{
            eventId: `external:${body.taskId}`,
            taskId: body.taskId,
            taskRunId: body.taskRunId,
            conversationId: body.conversationId,
            type: "task.execution.accepted",
            seq: 1,
            payload: {}
          }]
        };
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
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${base}/v1/connectors/prospect/discover`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ taskId: "direct-task", taskRunId: "direct-run", conversationId: "direct-conv", goal: "找潜客" })
  });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.status, "SUCCEEDED");
  assert.equal(payload.taskId, "direct-task");
  assert.equal(payload.taskRunId, "direct-run");
  assert.equal(payload.conversationId, "direct-conv");
  assert.equal(payload.ingested.acceptedCount, 2);

  const run = await fetch(`${base}/v1/connectors/prospect/runs/direct-task`);
  assert.equal(run.status, 200);
  const stored = await run.json();
  assert.equal(stored.taskId, "direct-task");
  assert.equal(stored.resultSnapshot.counts.candidates, 1);

  const workbook = await fetch(`${base}/v1/connectors/prospect/runs/direct-task.xlsx`);
  assert.equal(workbook.status, 200);
  assert.match(workbook.headers.get("content-type") || "", /spreadsheetml/);
  assert.match(workbook.headers.get("content-disposition") || "", /attachment/);
  assert.equal((await workbook.arrayBuffer()).byteLength > 1000, true);
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
