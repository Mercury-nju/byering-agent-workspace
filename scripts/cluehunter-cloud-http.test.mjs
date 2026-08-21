import test from "node:test";
import assert from "node:assert/strict";
import { createControlPlaneHttpServer } from "../backend/http-server.js";

function fakeWorkspace() {
  return {
    async start(input) {
      return {
        sessionId: "session-cloud",
        workspaceId: "workspace-cloud",
        taskId: input.taskId || null,
        tenantId: input.tenantId || null,
        provider: input.provider || "douyin",
        accountKey: input.accountKey,
        state: "AUTHORIZING"
      };
    },
    async snapshot() { return { sessionId: "session-cloud", taskId: null, tenantId: null, state: "AUTHORIZING" }; },
    async authorize() { return { sessionId: "session-cloud", state: "READY" }; },
    async navigate() { return {}; },
    async close() { return {}; }
  };
}

function start({ cloudDesktopService, cloudDesktopMode = "cluehunter" }) {
  const server = createControlPlaneHttpServer({
    browserWorkspace: fakeWorkspace(),
    cloudDesktopService,
    cloudDesktopMode,
    auth: false,
    requirementService: { understand: async () => ({ schemaVersion: 1, title: "x", goal: "x", scope: [], deliverables: [], stopConditions: [], riskNotes: [] }) },
    prospectService: { configured: false },
    clueHunterService: { configured: false }
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

test("cloud browser session fails closed instead of opening a local browser when provisioning is unavailable", async () => {
  const server = await start({ cloudDesktopService: { configured: false, missing: ["BYERING_CLUEHUNTER_BASE_URL"] } });
  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/v1/browser-sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "douyin", accountKey: "test", taskId: "task-1" })
    });
    const body = await response.json();
    assert.equal(response.status, 503);
    assert.equal(body.error.code, "CLOUD_DESKTOP_NOT_CONFIGURED");
    assert.deepEqual(body.error.details.required, ["BYERING_CLUEHUNTER_BASE_URL"]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("cloud browser session provisions first and only then creates the browser workspace", async () => {
  const calls = [];
  const server = await start({
    cloudDesktopService: {
      configured: true,
      missing: [],
      async ensureReady(input) { calls.push(input); return { ready: true, status: 3, provisioned: true }; }
    }
  });
  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/v1/browser-sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "douyin", accountKey: "test", taskId: "task-1" })
    });
    const body = await response.json();
    assert.equal(response.status, 202);
    assert.equal(body.cloudDesktop.ready, true);
    assert.equal(calls.length, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("cloud connect exposes the provision-and-start-RPA orchestration", async () => {
  const calls = [];
  const server = await start({
    cloudDesktopService: {
      configured: true,
      missing: [],
      async connect(input) {
        calls.push(input);
        return {
          accepted: true,
          connected: true,
          cloudDesktop: { ready: true, status: 3 },
          rpa: { accepted: true, started: true }
        };
      }
    }
  });
  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/v1/cloud-desktops/connect`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ uid: "20", tenant: "10", regionId: "cn-test" })
    });
    const body = await response.json();
    assert.equal(response.status, 202);
    assert.equal(body.connected, true);
    assert.equal(body.rpa.started, true);
    assert.deepEqual(calls, [{ uid: "20", tenant: "10", regionId: "cn-test", robotInfoId: undefined }]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
