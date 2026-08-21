import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { createControlPlane } from "../backend/control-plane.js";
import { createControlPlaneHttpServer } from "../backend/http-server.js";

function requirementService() {
  return {
    async understand({ goal }) {
      return {
        schemaVersion: 1,
        source: "test",
        provider: "test",
        model: "fixture",
        generatedAt: "2026-08-19T00:00:00.000Z",
        title: "测试需求",
        objective: goal || "测试目标",
        scope: "测试数据",
        deliverable: "测试结果",
        guardrail: "不执行外部动作",
        missing: [],
        assumptions: [],
        confidence: 1
      };
    }
  };
}

async function openServer(options = {}) {
  const server = createControlPlaneHttpServer({
    controlPlane: createControlPlane({ requirementService: requirementService() }),
    ...options
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return server;
}

function request(server, path, options = {}) {
  const headers = { "content-type": "application/json", ...(options.headers || {}) };
  return fetch(`http://127.0.0.1:${server.address().port}${path}`, { ...options, headers });
}

function signedEvent(body, secret = "event-secret") {
  const raw = JSON.stringify(body);
  const timestamp = String(Date.now());
  const canonical = [timestamp, "POST", "/v1/connectors/cluehunter/events", raw].join("\n");
  return {
    raw,
    headers: {
      "content-type": "application/json",
      "x-cluehunter-timestamp": timestamp,
      "x-cluehunter-signature": `sha256=${createHmac("sha256", secret).update(canonical).digest("hex")}`
    }
  };
}

test("configured API keys protect control-plane routes and bind tasks to one tenant", async (t) => {
  const server = await openServer({
    auth: { apiKeys: { "tenant-a": "key-a", "tenant-b": "key-b" } }
  });
  t.after(() => server.close());

  const health = await request(server, "/healthz");
  assert.equal(health.status, 200, "health checks stay public");
  const preflight = await request(server, "/v1/tasks", { method: "OPTIONS" });
  assert.equal(preflight.status, 204, "CORS preflight stays public");

  const unauthenticated = await request(server, "/v1/tasks", {
    method: "POST",
    body: JSON.stringify({ goal: "拒绝匿名请求" })
  });
  assert.equal(unauthenticated.status, 401);
  assert.equal((await unauthenticated.json()).error.code, "CONTROL_PLANE_AUTH_REQUIRED");

  const mixedCredentials = await request(server, "/v1/tasks", {
    method: "POST",
    headers: { authorization: "Bearer key-a", "x-api-key": "not-a-key" },
    body: JSON.stringify({ goal: "拒绝混合凭据" })
  });
  assert.equal(mixedCredentials.status, 401);
  assert.equal((await mixedCredentials.json()).error.code, "CONTROL_PLANE_AUTH_INVALID");

  const createdResponse = await request(server, "/v1/tasks", {
    method: "POST",
    headers: { authorization: "Bearer key-a" },
    body: JSON.stringify({ goal: "租户 A 的任务" })
  });
  assert.equal(createdResponse.status, 202);
  const created = await createdResponse.json();
  const snapshot = server.controlPlane.getTaskSnapshot(created.taskId);
  assert.equal(snapshot.tenantId, "tenant-a");

  const conflictingTenant = await request(server, "/v1/tasks", {
    method: "POST",
    headers: { "x-api-key": "key-a" },
    body: JSON.stringify({ tenantId: "tenant-b", goal: "越权任务" })
  });
  assert.equal(conflictingTenant.status, 403);
  assert.equal((await conflictingTenant.json()).error.code, "TENANT_SCOPE_FORBIDDEN");

  const crossTenantRead = await request(server, `/v1/tasks/${created.taskId}`, {
    headers: { "x-byering-api-key": "key-b" }
  });
  assert.equal(crossTenantRead.status, 403);
  assert.equal((await crossTenantRead.json()).error.code, "TENANT_SCOPE_FORBIDDEN");

  const sameTenantRead = await request(server, `/v1/tasks/${created.taskId}`, {
    headers: { authorization: "Bearer key-a" }
  });
  assert.equal(sameTenantRead.status, 200);
  assert.equal((await sameTenantRead.json()).tenantId, "tenant-a");
});

test("auth-required mode fails closed when no API key is configured", async (t) => {
  const server = await openServer({ auth: { authRequired: true, apiKeys: {} } });
  t.after(() => server.close());

  const health = await request(server, "/healthz");
  assert.equal(health.status, 200);
  const response = await request(server, "/v1/tasks", {
    method: "POST",
    body: JSON.stringify({ goal: "配置缺失时不能执行" })
  });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "CONTROL_PLANE_AUTH_NOT_CONFIGURED");
});

test("tenant-scoped production mode rejects an unbound API key", async (t) => {
  const server = await openServer({ auth: { authRequired: true, apiKeys: ["unscoped-secret"] } });
  t.after(() => server.close());

  const response = await request(server, "/v1/tasks", {
    method: "POST",
    headers: { authorization: "Bearer unscoped-secret" },
    body: JSON.stringify({ goal: "不允许无租户身份" })
  });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "CONTROL_PLANE_TENANT_MAPPING_REQUIRED");
});

test("local development remains anonymous when authentication is not configured", async (t) => {
  const server = await openServer({ auth: { authRequired: false, apiKeys: [] } });
  t.after(() => server.close());

  const response = await request(server, "/v1/tasks", {
    method: "POST",
    body: JSON.stringify({ goal: "本地开发任务" })
  });
  assert.equal(response.status, 202);
  const created = await response.json();
  assert.equal(server.controlPlane.getTaskSnapshot(created.taskId).tenantId, null);
});

test("signed connector callbacks cannot cross a bound task tenant", async (t) => {
  const server = await openServer({
    clueHunterEventSecret: "event-secret",
    auth: { apiKeys: { "tenant-a": "key-a" } }
  });
  t.after(() => server.close());
  const createdResponse = await request(server, "/v1/tasks", {
    method: "POST",
    headers: { authorization: "Bearer key-a" },
    body: JSON.stringify({ goal: "回调租户校验" })
  });
  const created = await createdResponse.json();
  const event = { eventId: "event-tenant-1", type: "outreach.sent", payload: { leadId: "lead-1" } };
  const callback = async (tenantId) => {
    const body = { taskId: created.taskId, ...(tenantId ? { tenantId } : {}), events: [event] };
    const signed = signedEvent(body);
    return request(server, "/v1/connectors/cluehunter/events", {
      method: "POST",
      headers: signed.headers,
      body: signed.raw
    });
  };
  const missingTenant = await callback(null);
  assert.equal(missingTenant.status, 409);
  assert.equal((await missingTenant.json()).error.code, "TENANT_SCOPE_REQUIRED");
  const wrongTenant = await callback("tenant-b");
  assert.equal(wrongTenant.status, 409);
  assert.equal((await wrongTenant.json()).error.code, "TENANT_SCOPE_FORBIDDEN");
  const accepted = await callback("tenant-a");
  assert.equal(accepted.status, 200);
  assert.equal((await accepted.json()).acceptedCount, 1);
});

test("browser session creation is tenant-bound and cannot be read by another tenant", async (t) => {
  const starts = [];
  const browserWorkspace = {
    async start(input) {
      starts.push(input);
      return {
        sessionId: "session-tenant-a",
        workspaceId: "workspace-tenant-a",
        tenantId: input.tenantId,
        provider: input.provider,
        accountKey: input.accountKey,
        state: "AUTHORIZING"
      };
    },
    async snapshot() {
      return { sessionId: "session-tenant-a", tenantId: "tenant-a", state: "AUTHORIZING" };
    }
  };
  const server = await openServer({ browserWorkspace, auth: { apiKeys: { "tenant-a": "key-a", "tenant-b": "key-b" } } });
  t.after(() => server.close());
  const created = await request(server, "/v1/browser-sessions", {
    method: "POST",
    headers: { authorization: "Bearer key-a" },
    body: JSON.stringify({ provider: "douyin", accountKey: "account-a" })
  });
  assert.equal(created.status, 202);
  assert.equal(starts[0].tenantId, "tenant-a");
  const crossTenant = await request(server, "/v1/browser-sessions/session-tenant-a", {
    headers: { authorization: "Bearer key-b" }
  });
  assert.equal(crossTenant.status, 403);
  assert.equal((await crossTenant.json()).error.code, "TENANT_SCOPE_FORBIDDEN");
});
