import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import { createBrowserWorkspaceService, WORKSPACE_STATES, BrowserWorkspaceError, isDouyinSessionReady } from "../backend/browser-workspace.js";

function fakeLauncher() {
  const launches = [];
  const records = new Map();
  return {
    launches,
    records,
    async launchPersistent(options) {
      launches.push(options);
      const record = { ready: false, url: options.loginUrl, closed: false };
      records.set(options.workspaceId, record);
      return {
        async status() {
          return { ready: record.ready, url: record.url, accountLabel: record.ready ? "抖音测试账号" : null };
        },
        async close() {
          record.closed = true;
        }
      };
    }
  };
}

test("same Douyin account reuses one persistent browser workspace", async () => {
  const launcher = fakeLauncher();
  const service = createBrowserWorkspaceService({ rootDir: "/tmp/byering-test-workspaces", launcher });

  const first = await service.start({ tenantId: "tenant-1", provider: "douyin", accountKey: "seller-1" });
  const second = await service.start({ tenantId: "tenant-1", provider: "douyin", accountKey: "seller-1" });

  assert.equal(first.sessionId, second.sessionId);
  assert.equal(second.accountKey, "seller-1");
  assert.equal(first.state, WORKSPACE_STATES.AUTHORIZING);
  assert.equal(launcher.launches.length, 1);
  assert.match(launcher.launches[0].profileDir, /byering-test-workspaces/);
});

test("authorization cannot be marked complete until browser reports a real login", async () => {
  const launcher = fakeLauncher();
  const service = createBrowserWorkspaceService({ rootDir: "/tmp/byering-test-workspaces", launcher });
  const session = await service.start({ tenantId: "tenant-1", provider: "douyin", accountKey: "seller-2" });

  await assert.rejects(
    () => service.authorize(session.sessionId),
    (error) => error instanceof BrowserWorkspaceError && error.code === "AUTHORIZATION_PENDING"
  );

  launcher.records.get(session.workspaceId).ready = true;
  const authorized = await service.authorize(session.sessionId);
  assert.equal(authorized.state, WORKSPACE_STATES.READY);
  assert.equal(authorized.accountLabel, "抖音测试账号");
});

test("workspace keeps the server-owned executor uid reported by the browser launcher", async () => {
  const launcher = fakeLauncher();
  const originalLaunch = launcher.launchPersistent;
  launcher.launchPersistent = async (options) => {
    const handle = await originalLaunch(options);
    const record = launcher.records.get(options.workspaceId);
    record.executorUid = "robot-douyin-1";
    return {
      ...handle,
      async status() {
        return {
          ...(await handle.status()),
          executorUid: record.executorUid
        };
      }
    };
  };
  const service = createBrowserWorkspaceService({ rootDir: "/tmp/byering-test-workspaces", launcher });
  const session = await service.start({ tenantId: "tenant-1", provider: "douyin", accountKey: "seller-uid" });
  assert.equal(session.executorUid, "robot-douyin-1");

  launcher.records.get(session.workspaceId).ready = true;
  const authorized = await service.authorize(session.sessionId);
  assert.equal(authorized.executorUid, "robot-douyin-1");
});

test("CSRF cookies alone never mark a Douyin workspace as logged in", () => {
  assert.equal(isDouyinSessionReady({ cookieNames: ["passport_csrf_token"], url: "https://www.douyin.com/" }), false);
  assert.equal(isDouyinSessionReady({ cookieNames: ["passport_csrf_token_default"], url: "https://www.douyin.com/" }), false);
  assert.equal(isDouyinSessionReady({ cookieNames: ["sessionid"], url: "https://www.douyin.com/" }), true);
  assert.equal(isDouyinSessionReady({ cookieNames: ["sessionid"], url: "https://www.douyin.com/passport/sso/login/callback/" }), false);
});

test("closing a workspace stops its browser session and prevents reuse", async () => {
  const launcher = fakeLauncher();
  const service = createBrowserWorkspaceService({ rootDir: "/tmp/byering-test-workspaces", launcher });
  const session = await service.start({ tenantId: "tenant-1", provider: "douyin", accountKey: "seller-3" });
  await service.close(session.sessionId);
  assert.equal(launcher.records.get(session.workspaceId).closed, true);
  assert.equal((await service.snapshot(session.sessionId)).state, WORKSPACE_STATES.DESTROYED);
});

test("persistent session registry restores the same browser workspace after service restart", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-browser-registry-"));
  try {
    const registryPath = join(directory, "sessions.json");
    const firstLauncher = fakeLauncher();
    const first = createBrowserWorkspaceService({
      rootDir: join(directory, "profiles"),
      sessionRegistryPath: registryPath,
      launcher: firstLauncher
    });
    const created = await first.start({ tenantId: "tenant-persist", provider: "douyin", accountKey: "seller-persist", taskId: "task-1" });

    const secondLauncher = fakeLauncher();
    const second = createBrowserWorkspaceService({
      rootDir: join(directory, "profiles"),
      sessionRegistryPath: registryPath,
      launcher: secondLauncher
    });
    const restored = await second.snapshot(created.sessionId);

    assert.equal(restored.sessionId, created.sessionId);
    assert.equal(restored.workspaceId, created.workspaceId);
    assert.equal(restored.taskId, "task-1");
    assert.equal(secondLauncher.launches.length, 1);
    assert.equal(secondLauncher.launches[0].restore, true);
    assert.equal(secondLauncher.launches[0].openLogin, false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("verified workspace executes a browser action and returns its external action id", async () => {
  const calls = [];
  const launcher = {
    async launchPersistent() {
      return {
        async status() { return { ready: true, url: "https://www.douyin.com/" }; },
        async execute(input) {
          calls.push(input);
          return { accepted: true, externalActionId: "browser-action-1" };
        },
        async close() {}
      };
    }
  };
  const service = createBrowserWorkspaceService({ rootDir: "/tmp/byering-test-workspaces", launcher });
  const session = await service.start({ tenantId: "tenant-1", provider: "douyin", accountKey: "seller-execute" });
  const result = await service.execute(session.sessionId, { actionType: "private_message", message: "你好" });
  assert.equal(result.accepted, true);
  assert.equal(result.externalActionId, "browser-action-1");
  assert.equal(calls.length, 1);
});

test("reopening an unverified persistent session returns it to the real Douyin login page", async () => {
  const navigations = [];
  const launcher = {
    async launchPersistent(options) {
      return {
        async status() { return { ready: false, url: "about:blank" }; },
        async navigate(url) { navigations.push(url); },
        async close() {}
      };
    }
  };
  const service = createBrowserWorkspaceService({ rootDir: "/tmp/byering-test-workspaces", launcher });
  await service.start({ tenantId: "tenant-1", provider: "douyin", accountKey: "seller-login-return" });
  await service.start({ tenantId: "tenant-1", provider: "douyin", accountKey: "seller-login-return" });
  assert.equal(navigations.length, 1);
  assert.match(navigations[0], /douyin\.com\/login/);
});
