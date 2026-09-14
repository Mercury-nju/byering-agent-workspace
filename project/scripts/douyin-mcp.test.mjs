import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildPrivateMessageArguments, createDouyinMcpService, normalizePrivateMessageResult, retryTransientDouyinCall, retryTransientPrivateMessage } from "../backend/douyin-mcp.js";

test("restart stops through the channel API without requiring a patched MCP tool or unsubscribe", async t => {
  const calls = [];
  const server = createServer((request, response) => {
    calls.push([request.method, request.url]); response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ ok: true }));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const service = createDouyinMcpService({ python: process.execPath, adapter: "unused", apiKey: "test", sessionId: "test-session", channelServerUrl: `http://127.0.0.1:${server.address().port}` });
  t.after(async () => { service.close(); await new Promise(resolve => server.close(resolve)); });
  assert.equal((await service.stop()).ok, true);
  assert.deepEqual(calls, [["POST", "/v1/sessions/test-session/stop"]]);
  assert.equal(service.getSessionId(), "test-session");
});

test("passive cloud status reads never enqueue a browser login check", async (t) => {
  const temp = await mkdtemp(join(tmpdir(), "byering-douyin-mcp-passive-status-"));
  const runner = join(temp, "fake-python");
  await writeFile(runner, `#!/usr/bin/env node
const readline = require("node:readline");
readline.createInterface({ input: process.stdin }).on("line", () => {});
`);
  await chmod(runner, 0o755);

  const calls = [];
  const server = createServer((request, response) => {
    calls.push([request.method, request.url]);
    response.setHeader("content-type", "application/json");
    if (request.method === "GET" && request.url === "/v1/sessions/test-session/status") {
      response.end(JSON.stringify({ ok: true, login_state: "logged_out", display_state: "login_required", worker: { online: true } }));
      return;
    }
    response.statusCode = 500;
    response.end(JSON.stringify({ ok: false, error: { code: "unexpected_request", message: request.url } }));
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const service = createDouyinMcpService({
    python: runner,
    adapter: fileURLToPath(new URL("../backend/douyin-mcp.js", import.meta.url)),
    channelServerUrl: `http://127.0.0.1:${server.address().port}`,
    apiKey: "test-key",
    sessionId: "test-session"
  });
  t.after(async () => {
    service.close();
    await new Promise((resolve) => server.close(resolve));
    await rm(temp, { recursive: true, force: true });
  });

  const status = await service.probeRemoteStatus();

  assert.equal(status.ok, true);
  assert.deepEqual(calls, [["GET", "/v1/sessions/test-session/status"]]);
});

test("explicit login verification enqueues exactly one browser login check", async (t) => {
  const temp = await mkdtemp(join(tmpdir(), "byering-douyin-mcp-login-check-"));
  const runner = join(temp, "fake-python");
  await writeFile(runner, `#!/usr/bin/env node
const readline = require("node:readline");
readline.createInterface({ input: process.stdin }).on("line", () => {});
`);
  await chmod(runner, 0o755);

  const calls = [];
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    calls.push([request.method, request.url, JSON.parse(body || "{}")]);
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ ok: true, login_state: "logged_in", display_state: "ready", worker: { online: true } }));
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const service = createDouyinMcpService({
    python: runner,
    adapter: fileURLToPath(new URL("../backend/douyin-mcp.js", import.meta.url)),
    channelServerUrl: `http://127.0.0.1:${server.address().port}`,
    apiKey: "test-key",
    sessionId: "test-session"
  });
  t.after(async () => {
    service.close();
    await new Promise((resolve) => server.close(resolve));
    await rm(temp, { recursive: true, force: true });
  });

  const status = await service.checkLoginStatus({ reqId: "manual-login-check" });

  assert.equal(status.login_state, "logged_in");
  assert.deepEqual(calls, [["POST", "/v1/sessions/test-session/status/check", { req_id: "manual-login-check", wait_ms: 1000 }]]);
});

test("coalesces concurrent cloud view requests into one remote login command", async (t) => {
  const temp = await mkdtemp(join(tmpdir(), "byering-douyin-mcp-view-cache-"));
  const runner = join(temp, "fake-python");
  await writeFile(runner, `#!/usr/bin/env node
const readline = require("node:readline");
let calls = 0;
readline.createInterface({ input: process.stdin }).on("line", (line) => {
  const request = JSON.parse(line);
  calls += 1;
  const payload = Buffer.from(JSON.stringify({ targetUrl: "wss://cloud.example/vnc", expiresAt: Math.floor(Date.now() / 1000) + 300 })).toString("base64url");
  setTimeout(() => process.stdout.write(JSON.stringify({
    id: request.id,
    result: { ok: true, view_page_url: "https://cloud.example/cloud-view/" + payload + ".signature", remoteCalls: calls }
  }) + "\\n"), 40);
});
`);
  await chmod(runner, 0o755);
  const service = createDouyinMcpService({
    python: runner,
    adapter: fileURLToPath(new URL("../backend/douyin-mcp.js", import.meta.url)),
    apiKey: "test-key"
  });
  t.after(async () => {
    service.close();
    await rm(temp, { recursive: true, force: true });
  });

  const [first, second] = await Promise.all([service.openLogin(), service.openLogin()]);
  const cached = service.getCachedLoginView();

  assert.equal(first.remoteCalls, 1);
  assert.equal(second.remoteCalls, 1);
  assert.equal(cached.cached, true);
  assert.equal(cached.remoteCalls, 1);
});

test("refreshes the viewer credential through the existing remote session and caches it", async (t) => {
  const temp = await mkdtemp(join(tmpdir(), "byering-douyin-mcp-view-refresh-"));
  const runner = join(temp, "fake-python");
  await writeFile(runner, "#!/usr/bin/env node\nsetInterval(() => {}, 1000);\n");
  await chmod(runner, 0o755);
  const calls = [];
  const payload = Buffer.from(JSON.stringify({
    targetUrl: "wss://cloud.example/vnc/existing-session",
    expiresAt: Math.floor(Date.now() / 1000) + 300
  })).toString("base64url");
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    calls.push({ method: request.method, url: request.url, body: body ? JSON.parse(body) : null });
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({
      ok: true,
      view_page_url: `https://cloud.example/cloud-view/${payload}.signature`
    }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const service = createDouyinMcpService({
    python: runner,
    adapter: fileURLToPath(new URL("../backend/douyin-mcp.js", import.meta.url)),
    channelServerUrl: `http://127.0.0.1:${server.address().port}`,
    apiKey: "test-key",
    sessionId: "existing-session"
  });
  t.after(async () => {
    service.close();
    await new Promise((resolve) => server.close(resolve));
    await rm(temp, { recursive: true, force: true });
  });

  const refreshed = await service.refreshLoginView();
  const cached = service.getCachedLoginView();

  assert.equal(refreshed.ok, true);
  assert.equal(cached.cached, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].url, "/v1/sessions/existing-session/login/open");
  assert.equal(calls[0].body.want_qr, false);
});

test("forced login opens the QR login view through the current cloud session", async (t) => {
  const temp = await mkdtemp(join(tmpdir(), "byering-douyin-mcp-open-qr-"));
  const runner = join(temp, "fake-python");
  await writeFile(runner, "#!/usr/bin/env node\nsetInterval(() => {}, 1000);\n");
  await chmod(runner, 0o755);
  const calls = [];
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    calls.push({ method: request.method, url: request.url, body: body ? JSON.parse(body) : null });
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ ok: true, view_page_url: "https://cloud.example/qr-login" }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const service = createDouyinMcpService({
    python: runner,
    adapter: fileURLToPath(new URL("../backend/douyin-mcp.js", import.meta.url)),
    channelServerUrl: `http://127.0.0.1:${server.address().port}`,
    apiKey: "test-key",
    sessionId: "existing-session"
  });
  t.after(async () => {
    service.close();
    await new Promise((resolve) => server.close(resolve));
    await rm(temp, { recursive: true, force: true });
  });

  const login = await service.openLogin({ force: true, wantQr: true });

  assert.equal(login.cloudViewUrl, "https://cloud.example/qr-login");
  assert.deepEqual(calls, [{
    method: "POST",
    url: "/v1/sessions/existing-session/login/open",
    body: { req_id: calls[0].body.req_id, want_qr: true }
  }]);
});

test("viewer credential refresh never provisions a cloud session implicitly", async () => {
  const service = createDouyinMcpService({
    python: process.execPath,
    adapter: fileURLToPath(new URL("../backend/douyin-mcp.js", import.meta.url)),
    apiKey: "test-key"
  });

  const result = await service.refreshLoginView();

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "DOUYIN_SESSION_ID_MISSING");
  assert.equal(service.getSessionId(), null);
});

test("includes the operated Douyin account identity in private-message arguments", () => {
  const args = buildPrivateMessageArguments({
    secId: "sec-target",
    content: "你好",
    reqId: "private-outreach-stable-2",
    operatedAccountSecId: "sec-sender",
    operatedNickname: "一以万真"
  });

  assert.equal(args.sec_id, "sec-target");
  assert.equal(args.operatedAccountSecId, "sec-sender");
  assert.equal(args.operatedNickname, "一以万真");
});

test("defaults direct private-message calls to the provider outreach action", () => {
  const args = buildPrivateMessageArguments({
    secId: "sec-target",
    content: "你好",
    reqId: "private-outreach-default-action"
  });

  assert.equal(args.action_type, 5);
});

test("sends structured text content to the REST private-message endpoint", async (t) => {
  const temp = await mkdtemp(join(tmpdir(), "byering-douyin-mcp-rest-content-"));
  const runner = join(temp, "fake-python");
  await writeFile(runner, `#!/usr/bin/env node
const readline = require("node:readline");
readline.createInterface({ input: process.stdin }).on("line", () => {});
`);
  await chmod(runner, 0o755);

  let receivedPayload = null;
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    response.setHeader("content-type", "application/json");
    if (request.method === "POST" && request.url === "/v1/sessions/test-session/private-messages") {
      receivedPayload = JSON.parse(body);
      response.end(JSON.stringify({ ok: true, state: "sent", message_id: "msg-rest-content" }));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ ok: false, error: { code: "not_found", message: "not found" } }));
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const service = createDouyinMcpService({
    python: runner,
    adapter: fileURLToPath(new URL("../backend/douyin-mcp.js", import.meta.url)),
    channelServerUrl: `http://127.0.0.1:${server.address().port}`,
    apiKey: "test-key",
    sessionId: "test-session"
  });
  t.after(async () => {
    service.close();
    await new Promise((resolve) => server.close(resolve));
    await rm(temp, { recursive: true, force: true });
  });

  const result = await service.sendPrivateMessage({
    secId: "sec-target",
    secUid: "sec-target",
    content: "测试",
    reqId: "rest-content-1",
    timeoutMs: 1000
  });

  assert.equal(result.ok, true);
  assert.deepEqual(receivedPayload.content, { type: "text", text: "测试" });
});

test("retries a transient private-message read timeout with the same request id", async () => {
  const calls = [];
  const payload = { reqId: "private-outreach-stable-1", secId: "sec-target", content: "你好" };
  let attempt = 0;

  const result = await retryTransientPrivateMessage(async () => {
    calls.push({ ...payload });
    attempt += 1;
    if (attempt === 1) return { ok: false, error: { code: "network_error", message: "The read operation timed out" } };
    return { ok: true, message: "sent" };
  }, { delayMs: 0 });

  assert.equal(result.ok, true);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], calls[1]);
});

test("does not retry a non-transient private-message failure", async () => {
  let attempts = 0;
  const result = await retryTransientPrivateMessage(async () => {
    attempts += 1;
    return { ok: false, error: { code: "recipient_not_found", message: "目标用户不存在" } };
  }, { delayMs: 0 });

  assert.equal(result.ok, false);
  assert.equal(attempts, 1);
});

test("does not retry a definitive private-message window-open failure", async () => {
  let attempts = 0;
  const result = await retryTransientPrivateMessage(async () => {
    attempts += 1;
    return { ok: false, error: { code: "private_message_failed", message: "私信窗口打开失败" } };
  }, { delayMs: 0 });

  assert.equal(result.ok, false);
  assert.equal(attempts, 1);
});

test("normalizes a provider no-receipt failure into a pending receipt", async (t) => {
  const temp = await mkdtemp(join(tmpdir(), "byering-douyin-mcp-pending-receipt-"));
  const runner = join(temp, "fake-python");
  await writeFile(runner, `#!/usr/bin/env node
const readline = require("node:readline");
readline.createInterface({ input: process.stdin }).on("line", () => {
  throw new Error("stdio fallback should not run for a pending provider receipt");
});

test("normalizes nested provider no-receipt diagnostics into a pending receipt", () => {
  const result = normalizePrivateMessageResult({
    ok: false,
    error: {
      code: "private_message_failed",
      details: { message: "没有目标收到平台成功回执" }
    }
  }, "pending-receipt-nested");

  assert.equal(result.ok, true);
  assert.equal(result.state, "pending");
  assert.equal(result.receiptPending, true);
  assert.equal(result.req_id, "pending-receipt-nested");
});
`);
  await chmod(runner, 0o755);

  const server = createServer((request, response) => {
    response.setHeader("content-type", "application/json");
    if (request.method === "POST" && request.url === "/v1/sessions/test-session/private-messages") {
      response.end(JSON.stringify({
        ok: false,
        error: { code: "private_message_failed", message: "没有目标收到平台成功回执" }
      }));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ ok: false, error: { code: "not_found", message: "not found" } }));
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const service = createDouyinMcpService({
    python: runner,
    adapter: fileURLToPath(new URL("../backend/douyin-mcp.js", import.meta.url)),
    channelServerUrl: `http://127.0.0.1:${server.address().port}`,
    apiKey: "test-key",
    sessionId: "test-session"
  });
  t.after(async () => {
    service.close();
    await new Promise((resolve) => server.close(resolve));
    await rm(temp, { recursive: true, force: true });
  });

  const result = await service.sendPrivateMessage({
    secId: "sec-target",
    content: "测试",
    reqId: "pending-receipt-1",
    timeoutMs: 1000
  });

  assert.equal(result.ok, true);
  assert.equal(result.state, "pending");
  assert.equal(result.receiptPending, true);
  assert.equal(result.req_id, "pending-receipt-1");
});

test("retries a transient status read timeout before surfacing failure", async () => {
  let attempts = 0;
  const result = await retryTransientDouyinCall(async () => {
    attempts += 1;
    return attempts === 1
      ? { ok: false, error: { code: "network_error", message: "The read operation timed out" } }
      : { ok: true, login_state: "logged_in" };
  }, { delayMs: 0 });

  assert.equal(result.ok, true);
  assert.equal(attempts, 2);
});

test("retries a closed MCP transport before surfacing failure", async () => {
  let attempts = 0;
  const result = await retryTransientDouyinCall(async () => {
    attempts += 1;
    return attempts === 1
      ? { ok: false, error: { code: "mcp_call_failed", message: "Transport closed" } }
      : { ok: true, login_state: "logged_in" };
  }, { delayMs: 0 });

  assert.equal(result.ok, true);
  assert.equal(attempts, 2);
});

test("pulls notifications through the channel REST endpoint when the stdio adapter is blocked", async (t) => {
  const temp = await mkdtemp(join(tmpdir(), "byering-douyin-mcp-notification-rest-"));
  const runner = join(temp, "fake-python");
  await writeFile(runner, `#!/usr/bin/env node
const readline = require("node:readline");
const input = readline.createInterface({ input: process.stdin });
input.on("line", (line) => {
  const request = JSON.parse(line);
  setTimeout(() => process.stdout.write(JSON.stringify({ id: request.id, result: { ok: true, items: [] } }) + "\\n"), 200);
});
`);
  await chmod(runner, 0o755);

  let restCalls = 0;
  const server = createServer((request, response) => {
    if (request.method === "GET" && request.url === "/v1/sessions/test-session/notifications?cursor=0&max=20&wait_ms=0") {
      restCalls += 1;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ ok: true, notifications: [{ cursor: 1, content: { type: "text", text: "测试评论" } }], next_cursor: 1 }));
      return;
    }
    response.statusCode = 404;
    response.end();
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const service = createDouyinMcpService({
    python: runner,
    adapter: fileURLToPath(new URL("../backend/douyin-mcp.js", import.meta.url)),
    channelServerUrl: `http://127.0.0.1:${server.address().port}`,
    apiKey: "test-key",
    sessionId: "test-session"
  });
  t.after(async () => {
    service.close();
    await new Promise((resolve) => server.close(resolve));
    await rm(temp, { recursive: true, force: true });
  });

  const result = await service.pullNotifications({ cursor: 0, limit: 20, waitMs: 0 });

  assert.equal(restCalls, 1);
  assert.equal(result.next_cursor, 1);
  assert.equal(result.notifications[0].content.text, "测试评论");
});

test("serializes message and notification pulls for one cloud worker", async (t) => {
  const temp = await mkdtemp(join(tmpdir(), "byering-douyin-mcp-pull-queue-"));
  const runner = join(temp, "fake-python");
  await writeFile(runner, `#!/usr/bin/env node
const readline = require("node:readline");
readline.createInterface({ input: process.stdin }).on("line", () => {});
`);
  await chmod(runner, 0o755);

  let active = 0;
  let maxActive = 0;
  const calls = [];
  const server = createServer((request, response) => {
    if (request.method !== "GET" || !request.url.startsWith("/v1/sessions/test-session/")) {
      response.statusCode = 404;
      return response.end();
    }
    active += 1;
    maxActive = Math.max(maxActive, active);
    calls.push(request.url);
    setTimeout(() => {
      active -= 1;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify(request.url.includes("/messages")
        ? { ok: true, messages: [], next_cursor: 0 }
        : { ok: true, notifications: [], next_cursor: 0 }));
    }, 40);
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const service = createDouyinMcpService({
    python: runner,
    adapter: fileURLToPath(new URL("../backend/douyin-mcp.js", import.meta.url)),
    channelServerUrl: `http://127.0.0.1:${server.address().port}`,
    apiKey: "test-key",
    sessionId: "test-session"
  });
  t.after(async () => {
    service.close();
    await new Promise((resolve) => server.close(resolve));
    await rm(temp, { recursive: true, force: true });
  });

  await Promise.all([
    service.pullMessages({ cursor: 0, limit: 20, waitMs: 0 }),
    service.pullNotifications({ cursor: 0, limit: 20, waitMs: 0 })
  ]);

  assert.equal(maxActive, 1);
  assert.deepEqual(calls, [
    "/v1/sessions/test-session/messages?cursor=0&max=20&wait_ms=0",
    "/v1/sessions/test-session/notifications?cursor=0&max=20&wait_ms=0"
  ]);
});

test("restarts message mode when remote state is still starting", async (t) => {
  const temp = await mkdtemp(join(tmpdir(), "byering-douyin-mcp-message-mode-recovery-"));
  const runner = join(temp, "fake-python");
  await writeFile(runner, `#!/usr/bin/env node
const readline = require("node:readline");
readline.createInterface({ input: process.stdin }).on("line", (line) => {
  const request = JSON.parse(line);
  process.stdout.write(JSON.stringify({ id: request.id, result: { ok: true, state: "starting" } }) + "\\n");
});
`);
  await chmod(runner, 0o755);

  let messageMode = "starting";
  let startCalls = 0;
  const server = createServer((request, response) => {
    response.setHeader("content-type", "application/json");
    if (request.method === "GET" && request.url === "/v1/sessions/test-session/status") {
      response.end(JSON.stringify({ ok: true, message_mode: messageMode }));
      return;
    }
    if (request.method === "POST" && request.url === "/v1/sessions/test-session/message-mode/start") {
      startCalls += 1;
      messageMode = "running";
      response.end(JSON.stringify({ ok: true, state: "running" }));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ ok: false, error: { code: "not_found", message: "not found" } }));
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const service = createDouyinMcpService({
    python: runner,
    adapter: fileURLToPath(new URL("../backend/douyin-mcp.js", import.meta.url)),
    channelServerUrl: `http://127.0.0.1:${server.address().port}`,
    apiKey: "test-key",
    sessionId: "test-session"
  });
  t.after(async () => {
    service.close();
    await new Promise((resolve) => server.close(resolve));
    await rm(temp, { recursive: true, force: true });
  });

  const recovered = await service.startMessageMode();
  const reused = await service.startMessageMode();

  assert.equal(recovered.state, "running");
  assert.equal(reused.reused, true);
  assert.equal(startCalls, 1);
});

test("falls back to an existing conversation when proactive private-message window cannot open", async (t) => {
  const temp = await mkdtemp(join(tmpdir(), "byering-douyin-mcp-message-fallback-"));
  const runner = join(temp, "fake-python");
  await writeFile(runner, `#!/usr/bin/env node
const readline = require("node:readline");
const input = readline.createInterface({ input: process.stdin });
input.on("line", () => {});
`);
  await chmod(runner, 0o755);

  const calls = [];
  const server = createServer(async (request, response) => {
    calls.push(request.url);
    let body = "";
    for await (const chunk of request) body += chunk;
    response.setHeader("content-type", "application/json");
    if (request.url === "/v1/sessions/test-session/private-messages") {
      response.end(JSON.stringify({ ok: false, error: { code: "douyin_error", message: "私信窗口打开失败" } }));
      return;
    }
    if (request.url === "/v1/sessions/test-session/messages") {
      const payload = JSON.parse(body);
      response.end(JSON.stringify({ ok: true, server_msg_id: "msg-1", sent_at: 1788380352, req_id: payload.req_id }));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ ok: false, error: { code: "not_found", message: "not found" } }));
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const service = createDouyinMcpService({
    python: runner,
    adapter: fileURLToPath(new URL("../backend/douyin-mcp.js", import.meta.url)),
    channelServerUrl: `http://127.0.0.1:${server.address().port}`,
    apiKey: "test-key",
    sessionId: "test-session"
  });
  t.after(async () => {
    service.close();
    await new Promise((resolve) => server.close(resolve));
    await rm(temp, { recursive: true, force: true });
  });

  const result = await service.sendPrivateMessage({
    secId: "sec-target",
    secUid: "sec-target",
    nickname: "LIA、",
    content: "测试",
    reqId: "message-fallback-1",
    timeoutMs: 1000
  });

  assert.equal(result.ok, true);
  assert.equal(result.server_msg_id, "msg-1");
  assert.deepEqual(calls, [
    "/v1/sessions/test-session/private-messages",
    "/v1/sessions/test-session/messages"
  ]);
});

test("retries a private-message window after the cloud browser becomes ready", async (t) => {
  const temp = await mkdtemp(join(tmpdir(), "byering-douyin-mcp-window-retry-"));
  const runner = join(temp, "fake-python");
  await writeFile(runner, `#!/usr/bin/env node
const readline = require("node:readline");
readline.createInterface({ input: process.stdin }).on("line", () => {});
`);
  await chmod(runner, 0o755);

  const calls = [];
  let privateMessageAttempts = 0;
  const server = createServer(async (request, response) => {
    calls.push(request.url);
    response.setHeader("content-type", "application/json");
    if (request.method === "GET" && request.url === "/v1/sessions/test-session/status") {
      response.end(JSON.stringify({
        ok: true,
        display_state: "ready",
        login_state: "logged_in",
        worker: { online: true },
        account: { nickname: "店主账号", sec_uid: "sec-sender" }
      }));
      return;
    }
    if (request.url === "/v1/sessions/test-session/private-messages") {
      privateMessageAttempts += 1;
      response.end(JSON.stringify(privateMessageAttempts === 1
        ? { ok: false, error: { code: "private_message_failed", message: "私信窗口打开失败" } }
        : { ok: true, state: "sent", server_msg_id: "msg-2", req_id: "window-retry-1" }));
      return;
    }
    if (request.url === "/v1/sessions/test-session/messages") {
      response.end(JSON.stringify({ ok: false, error: { code: "private_message_failed", message: "私信窗口打开失败" } }));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ ok: false, error: { code: "not_found", message: "not found" } }));
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const service = createDouyinMcpService({
    python: runner,
    adapter: fileURLToPath(new URL("../backend/douyin-mcp.js", import.meta.url)),
    channelServerUrl: `http://127.0.0.1:${server.address().port}`,
    apiKey: "test-key",
    sessionId: "test-session",
    privateMessageRetryDelayMs: 0
  });
  t.after(async () => {
    service.close();
    await new Promise((resolve) => server.close(resolve));
    await rm(temp, { recursive: true, force: true });
  });

  const result = await service.sendPrivateMessage({
    secId: "sec-target",
    secUid: "sec-target",
    nickname: "LIA、",
    content: "测试",
    reqId: "window-retry-1",
    timeoutMs: 1000
  });

  assert.equal(result.ok, true);
  assert.equal(result.state, "sent");
  assert.equal(privateMessageAttempts, 2);
  assert.deepEqual(calls, [
    "/v1/sessions/test-session/private-messages",
    "/v1/sessions/test-session/messages",
    "/v1/sessions/test-session/status",
    "/v1/sessions/test-session/private-messages"
  ]);
});

test("restarts the local worker after a status call timeout", async (t) => {
  const temp = await mkdtemp(join(tmpdir(), "byering-douyin-mcp-timeout-recovery-"));
  const runner = join(temp, "fake-python");
  const attemptsFile = join(temp, "attempts");
  await writeFile(runner, `#!/usr/bin/env node
const fs = require("node:fs");
const readline = require("node:readline");
const attemptsFile = process.env.ATTEMPTS_FILE;
const attempt = Number(fs.readFileSync(attemptsFile, "utf8") || "0") + 1;
fs.writeFileSync(attemptsFile, String(attempt));
const input = readline.createInterface({ input: process.stdin });
input.on("line", (line) => {
  const request = JSON.parse(line);
  if (attempt === 1) return;
  process.stdout.write(JSON.stringify({ id: request.id, result: { ok: true, login_state: "logged_in" } }) + "\\n");
});
`);
  await writeFile(attemptsFile, "0");
  await chmod(runner, 0o755);
  const service = createDouyinMcpService({
    python: runner,
    adapter: fileURLToPath(new URL("../backend/douyin-mcp.js", import.meta.url)),
    apiKey: "test-key",
    sessionId: "test-session",
    statusTimeoutMs: 250,
    env: { ATTEMPTS_FILE: attemptsFile }
  });
  t.after(() => service.close());

  const result = await service.resume();

  assert.equal(result.ok, true);
  assert.equal(Number(await readFile(attemptsFile, "utf8")), 2);
});

test("does not abort a provider action on a transient remote offline status", async (t) => {
  const temp = await mkdtemp(join(tmpdir(), "byering-douyin-mcp-test-"));
  const runner = join(temp, "fake-python");
  await writeFile(runner, `#!/usr/bin/env node
const readline = require("node:readline");
const input = readline.createInterface({ input: process.stdin });
input.on("line", (line) => {
  const request = JSON.parse(line);
  setTimeout(() => process.stdout.write(JSON.stringify({
    id: request.id,
    result: request.name === "douyin.send_private_message" ? { ok: true, message: "sent" } : { ok: true }
  }) + "\\n"), 60);
});
`);
  await chmod(runner, 0o755);

  const statusServer = createServer((request, response) => {
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({
      ok: true,
      session_state: "active",
      login_state: "logged_in",
      display_state: "error",
      worker: { online: false },
      account: { nickname: "店主账号", sec_uid: "sec-sender" }
    }));
  });
  await new Promise((resolve, reject) => {
    statusServer.once("error", reject);
    statusServer.listen(0, "127.0.0.1", resolve);
  });
  const port = statusServer.address().port;
  const service = createDouyinMcpService({
    python: runner,
    adapter: fileURLToPath(new URL("../backend/douyin-mcp.js", import.meta.url)),
    channelServerUrl: `http://127.0.0.1:${port}`,
    apiKey: "test-key",
    sessionId: "test-session"
  });
  t.after(async () => {
    service.close();
    await new Promise((resolve) => statusServer.close(resolve));
    await rm(temp, { recursive: true, force: true });
  });

  const result = await service.sendPrivateMessage({
    secId: "sec-target",
    secUid: "sec-target",
    content: "你好",
    reqId: "remote-offline-transient-1",
    timeoutMs: 1000
  });

  assert.equal(result.ok, true);
  assert.equal(result.message, "sent");
});

test("waits for remote recovery before retrying a transport failure", async (t) => {
  const temp = await mkdtemp(join(tmpdir(), "byering-douyin-mcp-recovery-"));
  const runner = join(temp, "fake-python");
  await writeFile(runner, `#!/usr/bin/env node
const readline = require("node:readline");
let sends = 0;
const input = readline.createInterface({ input: process.stdin });
input.on("line", (line) => {
  const request = JSON.parse(line);
  if (request.name === "douyin.send_private_message") sends += 1;
  setTimeout(() => process.stdout.write(JSON.stringify({
    id: request.id,
    result: request.name === "douyin.send_private_message" && sends === 1
      ? { ok: false, error: { code: "network_error", message: "Transport closed" } }
      : { ok: true, message: "sent" }
  }) + "\\n"), 20);
});
`);
  await chmod(runner, 0o755);

  let statusReads = 0;
  const statusServer = createServer((request, response) => {
    statusReads += 1;
    response.setHeader("content-type", "application/json");
    const recovered = statusReads > 1;
    response.end(JSON.stringify({
      ok: true,
      session_state: "active",
      login_state: "logged_in",
      display_state: recovered ? "ready" : "error",
      worker: { online: recovered },
      account: { nickname: "店主账号", sec_uid: "sec-sender" }
    }));
  });
  await new Promise((resolve, reject) => {
    statusServer.once("error", reject);
    statusServer.listen(0, "127.0.0.1", resolve);
  });
  const service = createDouyinMcpService({
    python: runner,
    adapter: fileURLToPath(new URL("../backend/douyin-mcp.js", import.meta.url)),
    channelServerUrl: `http://127.0.0.1:${statusServer.address().port}`,
    apiKey: "test-key",
    sessionId: "test-session"
  });
  t.after(async () => {
    service.close();
    await new Promise((resolve) => statusServer.close(resolve));
    await rm(temp, { recursive: true, force: true });
  });

  const result = await service.sendPrivateMessage({
    secId: "sec-target",
    secUid: "sec-target",
    content: "你好",
    reqId: "remote-recovery-1",
    timeoutMs: 1000
  });

  assert.equal(result.ok, true);
  assert.equal(result.message, "sent");
  assert.equal(statusReads, 2);
});

test("accepts provider private-message receipts expressed as state and message id", async (t) => {
  const temp = await mkdtemp(join(tmpdir(), "byering-douyin-mcp-direct-receipt-"));
  const runner = join(temp, "fake-python");
  const marker = join(temp, "stdio-called");
  await writeFile(runner, `#!/usr/bin/env node
const fs = require("node:fs");
const readline = require("node:readline");
const input = readline.createInterface({ input: process.stdin });
input.on("line", () => fs.appendFileSync(process.env.STDIO_MARKER, "called\\n"));
`);
  await chmod(runner, 0o755);

  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    response.setHeader("content-type", "application/json");
    if (request.method === "POST" && request.url === "/v1/sessions/test-session/private-messages") {
      const payload = JSON.parse(body);
      response.end(JSON.stringify({ ok: true, state: "sent", message_id: "msg-state-1", req_id: payload.req_id }));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ ok: false, error: { code: "not_found", message: "not found" } }));
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const service = createDouyinMcpService({
    python: runner,
    adapter: fileURLToPath(new URL("../backend/douyin-mcp.js", import.meta.url)),
    channelServerUrl: `http://127.0.0.1:${server.address().port}`,
    apiKey: "test-key",
    sessionId: "test-session",
    env: { STDIO_MARKER: marker }
  });
  t.after(async () => {
    service.close();
    await new Promise((resolve) => server.close(resolve));
    await rm(temp, { recursive: true, force: true });
  });

  const result = await service.sendPrivateMessage({
    secId: "sec-target",
    secUid: "sec-target",
    content: "测试",
    reqId: "direct-state-receipt-1",
    timeoutMs: 1000
  });

  assert.equal(result.ok, true);
  assert.equal(result.state, "sent");
  assert.equal(result.message_id, "msg-state-1");
  await new Promise((resolve) => setTimeout(resolve, 20));
  await assert.rejects(readFile(marker, "utf8"), { code: "ENOENT" });
});
