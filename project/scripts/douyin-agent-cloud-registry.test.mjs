import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDouyinAgentCloudRegistry } from "../backend/douyin-agent-cloud-registry.js";

function fakeFactory(calls) {
  return ({ sessionId = "" } = {}) => {
    const service = {
      configured: true,
      calls,
      isStarted: false,
      currentSessionId: sessionId || null,
      async start() {
        calls.push({ operation: "start", sessionId: this.currentSessionId });
        this.currentSessionId ||= "session-created-once";
        this.isStarted = true;
        return { ok: true, session_id: this.currentSessionId };
      },
      async resume() {
        calls.push({ operation: "resume", sessionId: this.currentSessionId });
        this.isStarted = true;
        return { ok: true, login_state: "logged_in", account: { unique_id: "creator" } };
      },
      async status() {
        calls.push({ operation: "status", sessionId: this.currentSessionId });
        return { ok: true, login_state: "logged_in", account: { unique_id: "creator" } };
      },
      getSessionId() { return this.currentSessionId; },
      close() {}
    };
    return service;
  };
}

test("registry persists one cloud session per Agent and resumes it after process restart", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-agent-cloud-"));
  const stateFile = join(directory, "registry.json");
  const firstCalls = [];
  const first = createDouyinAgentCloudRegistry({ stateFile, createService: fakeFactory(firstCalls) });

  const started = await first.start("mkt-dm-inbox", { billingPlan: "monthly" });
  assert.equal(started.sessionId, "session-created-once");
  assert.equal(firstCalls.filter((call) => call.operation === "start").length, 1);

  const saved = JSON.parse(await readFile(stateFile, "utf8"));
  assert.equal(saved.agents["mkt-dm-inbox"].sessionId, "session-created-once");

  const secondCalls = [];
  const second = createDouyinAgentCloudRegistry({ stateFile, createService: fakeFactory(secondCalls) });
  const resumed = await second.status("mkt-dm-inbox");
  assert.equal(resumed.sessionId, "session-created-once");
  assert.equal(secondCalls[0].operation, "resume");
  assert.equal(secondCalls.filter((call) => call.operation === "start").length, 0);
  assert.equal(second.get("mkt-dm-inbox").status, "online");
});

test("registry provisions a separate cloud session for each account of the same Agent", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-agent-cloud-account-scope-"));
  const stateFile = join(directory, "registry.json");
  let sequence = 0;
  const services = [];
  const registry = createDouyinAgentCloudRegistry({
    stateFile,
    createService: () => {
      const sessionId = `session-${++sequence}`;
      const service = {
        configured: true,
        async start() { return { ok: true, session_id: sessionId }; },
        async status() { return { ok: true, login_state: "logged_in" }; },
        getSessionId() { return sessionId; },
        close() {}
      };
      services.push(service);
      return service;
    }
  });

  const first = await registry.start("mkt-comment-acquisition", {
    accountId: "douyin-account-a",
    accountIdentity: { uid: "douyin-account-a" }
  });
  const second = await registry.start("mkt-comment-acquisition", {
    accountId: "douyin-account-b",
    accountIdentity: { uid: "douyin-account-b" }
  });

  assert.notEqual(first.sessionId, second.sessionId);
  assert.equal(services.length, 2);
  assert.equal(registry.get("mkt-comment-acquisition", { accountId: "douyin-account-a" }).sessionId, first.sessionId);
  assert.equal(registry.get("mkt-comment-acquisition", { accountId: "douyin-account-b" }).sessionId, second.sessionId);
  assert.equal(registry.list().filter((record) => record.agentId === "mkt-comment-acquisition").length, 2);
});

test("registry binds a new account authorization without replacing an existing account session", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-agent-cloud-new-account-"));
  const stateFile = join(directory, "registry.json");
  let sequence = 0;
  const registry = createDouyinAgentCloudRegistry({
    stateFile,
    createService: () => {
      const sessionId = `session-${++sequence}`;
      return {
        configured: true,
        async start() { return { ok: true, session_id: sessionId }; },
        getSessionId() { return sessionId; },
        close() {}
      };
    }
  });

  const first = await registry.start("mkt-douyin-account-runtime", {
    accountId: "douyin-account:first",
    accountIdentity: { uid: "first" }
  });
  const pending = await registry.start("mkt-douyin-account-runtime", {
    accountId: "douyin-pending:second-login"
  });
  const bound = registry.bindAccountIdentity("mkt-douyin-account-runtime", {
    accountId: "douyin-pending:second-login"
  }, { uid: "second", nickname: "第二个账号" });

  assert.equal(first.sessionId, "session-1");
  assert.equal(pending.sessionId, "session-2");
  assert.equal(bound.accountId, "douyin-account:second");
  assert.equal(registry.get("mkt-douyin-account-runtime", { accountId: "douyin-account:first" }).sessionId, "session-1");
  assert.equal(registry.get("mkt-douyin-account-runtime", { accountId: "douyin-account:second" }).sessionId, "session-2");
  assert.equal(registry.list().filter((record) => record.agentId === "mkt-douyin-account-runtime").length, 2);
});

test("registry binds an existing unscoped login to the first logical product account scope", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-agent-cloud-logical-account-"));
  const stateFile = join(directory, "registry.json");
  const calls = [];
  const agentId = "mkt-douyin-account-runtime";
  const scope = {
    accountId: "douyin-agent:mkt-comment-acquisition",
    accountIdentity: { uid: "58262205543", secId: "sec-yiyiwanzhen" }
  };
  const registry = createDouyinAgentCloudRegistry({ stateFile, createService: fakeFactory(calls) });

  await registry.start(agentId, { billingPlan: "monthly" });
  const status = await registry.status(agentId, scope);

  assert.equal(status.sessionId, "session-created-once");
  assert.equal(status.login_state, "logged_in");
  assert.equal(registry.get(agentId, scope).sessionId, "session-created-once");
  assert.equal(registry.list().some((record) => record.bindingKey === agentId), false);

  const sameAccountDifferentProductScope = await registry.status(agentId, {
    accountId: "douyin-agent:mkt-dm-inbox",
    accountIdentity: scope.accountIdentity
  });
  assert.equal(sameAccountDifferentProductScope.sessionId, "session-created-once");
});

test("registry reuses an account cloud when a later request carries the account user ID", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-agent-cloud-account-alias-"));
  const stateFile = join(directory, "registry.json");
  const agentId = "mkt-douyin-account-runtime";
  const accountIdentity = { uid: "58262205543", secId: "sec-yiyiwanzhen" };

  const first = createDouyinAgentCloudRegistry({ stateFile, createService: fakeFactory([]) });
  await first.start(agentId, {
    accountId: "douyin-agent:mkt-comment-acquisition",
    accountIdentity
  });

  const calls = [];
  const restarted = createDouyinAgentCloudRegistry({ stateFile, createService: fakeFactory(calls) });
  const status = await restarted.status(agentId, {
    accountId: accountIdentity.uid,
    accountIdentity
  });

  assert.equal(status.sessionId, "session-created-once");
  assert.deepEqual(calls, [{ operation: "resume", sessionId: "session-created-once" }]);
  assert.equal(restarted.get(agentId, { accountIdentity }).sessionId, "session-created-once");
});

test("registry persists a refreshed verified account avatar without changing its cloud session", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-agent-cloud-avatar-"));
  const stateFile = join(directory, "registry.json");
  const scope = {
    accountId: "58262205543",
    accountIdentity: {
      uid: "58262205543",
      secId: "sec-yiyiwanzhen",
      nickname: "一以万真",
      avatarUrl: "https://p3-pc-sign.douyinpic.com/expired.jpeg?x-expires=1"
    }
  };
  const registry = createDouyinAgentCloudRegistry({ stateFile, createService: fakeFactory([]) });
  await registry.start("mkt-dm-inbox", scope);

  const refreshed = registry.refreshAccountIdentity("mkt-dm-inbox", scope, {
    ...scope.accountIdentity,
    avatar: "https://p3-pc-sign.douyinpic.com/fresh.jpeg?x-expires=1893456000",
    avatarUrl: "https://p3-pc-sign.douyinpic.com/fresh.jpeg?x-expires=1893456000"
  });

  assert.equal(refreshed.sessionId, "session-created-once");
  assert.equal(refreshed.accountIdentity.avatarUrl, "https://p3-pc-sign.douyinpic.com/fresh.jpeg?x-expires=1893456000");

  const restarted = createDouyinAgentCloudRegistry({ stateFile, createService: fakeFactory([]) });
  assert.equal(
    restarted.get("mkt-dm-inbox", scope).accountIdentity.avatarUrl,
    "https://p3-pc-sign.douyinpic.com/fresh.jpeg?x-expires=1893456000"
  );
});

test("registry records provisioning immediately and coalesces duplicate Agent starts", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-agent-cloud-"));
  const stateFile = join(directory, "registry.json");
  const calls = [];
  let releaseStart;
  const createService = () => ({
    configured: true,
    isStarted: false,
    async start({ reqId } = {}) {
      calls.push({ operation: "start", reqId });
      await new Promise((resolve) => { releaseStart = resolve; });
      this.isStarted = true;
      return { ok: true, session_id: "session-provisioned" };
    },
    async status() {
      throw new Error("status must not call the remote service while provisioning");
    },
    getSessionId() { return this.isStarted ? "session-provisioned" : null; },
    close() {}
  });
  const registry = createDouyinAgentCloudRegistry({ stateFile, createService });

  const first = registry.start("mkt-dm-inbox", { billingPlan: "monthly" });
  await new Promise((resolve) => setImmediate(resolve));
  const savedWhileStarting = JSON.parse(await readFile(stateFile, "utf8"));
  const record = savedWhileStarting.agents["mkt-dm-inbox"];
  assert.equal(record.status, "starting");
  assert.equal(record.billingPlan, "monthly");
  assert.match(record.provisioningRequestId, /^[0-9a-f-]{36}$/);
  assert.equal(calls[0].reqId, record.provisioningRequestId);

  const status = await registry.status("mkt-dm-inbox");
  assert.equal(status.state, "STARTING");
  assert.equal(status.provisioning, true);
  assert.equal(status.sessionId, null);

  const second = registry.start("mkt-dm-inbox", { billingPlan: "monthly" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.length, 1);
  releaseStart();
  const [started, reused] = await Promise.all([first, second]);
  assert.equal(started.sessionId, "session-provisioned");
  assert.equal(reused.sessionId, "session-provisioned");
  assert.equal(registry.get("mkt-dm-inbox").status, "online");
});

test("registry expires an in-flight provisioning request instead of leaving it starting forever", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-agent-cloud-"));
  const stateFile = join(directory, "registry.json");
  let now = Date.parse("2026-08-31T08:00:00.000Z");
  let releaseStart;
  let startCalls = 0;
  const createService = () => ({
    configured: true,
    currentSessionId: null,
    async start() {
      startCalls += 1;
      if (startCalls === 1) {
        await new Promise((resolve) => { releaseStart = resolve; });
        return { ok: true, session_id: "stale-session" };
      }
      this.currentSessionId = "restarted-session";
      return { ok: true, session_id: this.currentSessionId };
    },
    async status() { return { ok: true, session_state: "active", worker: { online: true } }; },
    close() {},
    getSessionId() { return this.currentSessionId; }
  });
  const registry = createDouyinAgentCloudRegistry({
    stateFile,
    createService,
    now: () => now,
    provisioningTimeoutMs: 5 * 60 * 1000
  });

  const pending = registry.start("mkt-dm-inbox");
  pending.catch(() => {});
  await new Promise((resolve) => setImmediate(resolve));
  now += 6 * 60 * 1000;

  const status = await registry.status("mkt-dm-inbox");
  assert.equal(status.state, "ERROR");
  assert.equal(status.error.code, "DOUYIN_PROVISIONING_TIMEOUT");
  assert.equal(registry.get("mkt-dm-inbox").status, "error");

  const restarted = await registry.restart("mkt-dm-inbox");
  assert.equal(restarted.sessionId, "restarted-session");
  assert.equal(startCalls, 2);
  releaseStart();
  await assert.rejects(() => pending, { code: "DOUYIN_PROVISIONING_TIMEOUT" });
  assert.equal(registry.get("mkt-dm-inbox").status, "online");
  assert.equal(registry.get("mkt-dm-inbox").sessionId, "restarted-session");
});

test("registry keeps provider startup pending past the default wall-clock estimate", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-agent-cloud-"));
  const stateFile = join(directory, "registry.json");
  let now = Date.parse("2026-08-31T08:00:00.000Z");
  let releaseStart;
  const registry = createDouyinAgentCloudRegistry({
    stateFile,
    now: () => now,
    createService: () => ({
      configured: true,
      async start() {
        await new Promise((resolve) => { releaseStart = resolve; });
        return { ok: true, session_id: "eventual-session" };
      },
      close() {},
      getSessionId() { return null; }
    })
  });

  const pending = registry.start("mkt-dm-inbox");
  await new Promise((resolve) => setImmediate(resolve));
  now += 20 * 60 * 1000;
  const status = await registry.status("mkt-dm-inbox");
  assert.equal(status.state, "STARTING");
  assert.equal(registry.get("mkt-dm-inbox").status, "starting");
  releaseStart();
  await pending;
  assert.equal(registry.get("mkt-dm-inbox").sessionId, "eventual-session");
});

test("registry keeps a transient startup read timeout in starting state", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-agent-cloud-"));
  const stateFile = join(directory, "registry.json");
  const registry = createDouyinAgentCloudRegistry({
    stateFile,
    createService: () => ({
      configured: true,
      async start() {
        throw Object.assign(new Error("read operation timed out"), { code: "DOUYIN_MCP_TIMEOUT" });
      },
      close() {},
      getSessionId() { return null; }
    })
  });

  await assert.rejects(() => registry.start("mkt-dm-inbox"), { code: "DOUYIN_MCP_TIMEOUT" });
  assert.equal(registry.get("mkt-dm-inbox").status, "starting");
  assert.equal(registry.get("mkt-dm-inbox").lastError, null);
  const status = await registry.status("mkt-dm-inbox", { resumeSaved: false });
  assert.equal(status.state, "STARTING");
});

test("registry stops retrying when the provider reports an already-running worker", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-agent-cloud-"));
  const stateFile = join(directory, "registry.json");
  const registry = createDouyinAgentCloudRegistry({
    stateFile,
    createService: () => ({
      configured: true,
      async start() {
        throw Object.assign(new Error("another worker owns this API key"), {
          code: "DOUYIN_MCP_WORKER_ALREADY_RUNNING"
        });
      },
      close() {},
      getSessionId() { return null; }
    })
  });

  await assert.rejects(() => registry.start("mkt-dm-inbox"), { code: "DOUYIN_MCP_WORKER_ALREADY_RUNNING" });
  assert.equal(registry.get("mkt-dm-inbox").status, "error");
  assert.equal(registry.get("mkt-dm-inbox").lastError.code, "DOUYIN_MCP_WORKER_ALREADY_RUNNING");
  const status = await registry.status("mkt-dm-inbox", { resumeSaved: false });
  assert.equal(status.state, "ERROR");
  assert.equal(status.error.code, "DOUYIN_MCP_WORKER_ALREADY_RUNNING");
});

test("registry does not mark an unresolved provider startup as online", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-agent-cloud-"));
  const stateFile = join(directory, "registry.json");
  const registry = createDouyinAgentCloudRegistry({
    stateFile,
    createService: () => ({
      configured: true,
      async start() {
        return {
          ok: true,
          session_id: "provider-session",
          session_state: "active",
          display_state: "starting",
          login_state: "unknown",
          worker: { online: false },
          start_wait: { event_received: false, resolved: false }
        };
      },
      close() {},
      getSessionId() { return "provider-session"; }
    })
  });

  const started = await registry.start("mkt-dm-inbox");
  assert.equal(started.sessionId, "provider-session");
  assert.equal(registry.get("mkt-dm-inbox").status, "starting");
  assert.equal(registry.get("mkt-dm-inbox").lastError, null);
});

test("registry gives each Agent its own MCP credentials and rejects a shared key", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-agent-cloud-"));
  const stateFile = join(directory, "registry.json");
  const calls = [];
  const createService = ({ apiKey = "" } = {}) => ({
    configured: true,
    currentSessionId: null,
    async start() {
      calls.push({ operation: "start", apiKey });
      this.currentSessionId = `session-${apiKey}`;
      return { ok: true, session_id: this.currentSessionId };
    },
    async status() { return { ok: true, session_state: "active", worker: { online: true }, login_state: "logged_in" }; },
    getSessionId() { return this.currentSessionId; },
    close() {}
  });
  const registry = createDouyinAgentCloudRegistry({
    stateFile,
    createService,
    serviceOptionsByAgent: {
      "mkt-dm-inbox": { apiKey: "inbox-key" },
      "mkt-cold-writer": { apiKey: "outreach-key" }
    }
  });

  await registry.start("mkt-dm-inbox");
  await registry.start("mkt-cold-writer");
  assert.deepEqual(calls.map((call) => call.apiKey), ["inbox-key", "outreach-key"]);

  const collisionRegistry = createDouyinAgentCloudRegistry({
    stateFile: join(directory, "collision.json"),
    createService,
    serviceOptions: { apiKey: "same-key" }
  });
  await collisionRegistry.start("mkt-dm-inbox");
  assert.throws(() => collisionRegistry.start("mkt-cold-writer"), { code: "DOUYIN_AGENT_API_KEY_SHARED" });
});

test("registry maintains separate sessions for unrelated runtime keys", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-agent-cloud-"));
  const stateFile = join(directory, "registry.json");
  const calls = [];
  const createService = ({ apiKey = "" } = {}) => ({
    configured: true,
    currentSessionId: null,
    async start() {
      calls.push({ agentApiKey: apiKey });
      this.currentSessionId = `session-${apiKey}`;
      return { ok: true, session_id: this.currentSessionId };
    },
    async status() { return { ok: true, session_state: "active", worker: { online: true }, login_state: "logged_in" }; },
    getSessionId() { return this.currentSessionId; },
    close() {}
  });
  const registry = createDouyinAgentCloudRegistry({
    stateFile,
    createService,
    serviceOptionsByAgent: {
      "runtime-one": { apiKey: "runtime-one-key" },
      "runtime-two": { apiKey: "runtime-two-key" }
    }
  });

  await registry.start("runtime-one");
  await registry.start("runtime-two");
  assert.deepEqual(calls.map((call) => call.agentApiKey), ["runtime-one-key", "runtime-two-key"]);
  assert.notEqual(registry.get("runtime-one").sessionId, registry.get("runtime-two").sessionId);
});

test("registry fails closed when an Agent requires a scoped key but none is configured", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-agent-cloud-"));
  const stateFile = join(directory, "registry.json");
  let createCalls = 0;
  const registry = createDouyinAgentCloudRegistry({
    stateFile,
    serviceOptions: { apiKey: "legacy-global-key" },
    serviceOptionsByAgent: {
      "mkt-comment-acquisition": { requireScopedApiKey: true }
    },
    createService() {
      createCalls += 1;
      return { configured: true };
    }
  });

  assert.throws(() => registry.getService("mkt-comment-acquisition"), {
    code: "DOUYIN_AGENT_API_KEY_REQUIRED"
  });
  assert.throws(() => registry.start("mkt-comment-acquisition"), {
    code: "DOUYIN_AGENT_API_KEY_REQUIRED"
  });
  await assert.rejects(() => registry.status("mkt-comment-acquisition"), {
    code: "DOUYIN_AGENT_API_KEY_REQUIRED"
  });
  assert.equal(createCalls, 0);
});

test("registry still permits the legacy global key for Agents without scoped-key enforcement", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-agent-cloud-"));
  const calls = [];
  const registry = createDouyinAgentCloudRegistry({
    stateFile: join(directory, "registry.json"),
    serviceOptions: { apiKey: "legacy-global-key" },
    serviceOptionsByAgent: {
      "legacy-automation": {}
    },
    createService({ apiKey = "" } = {}) {
      calls.push(apiKey);
      return {
        configured: true,
        currentSessionId: null,
        async start() {
          this.currentSessionId = "legacy-session";
          return { ok: true, session_id: this.currentSessionId };
        },
        getSessionId() { return this.currentSessionId; },
        close() {}
      };
    }
  });

  await registry.start("legacy-automation");
  assert.deepEqual(calls, ["legacy-global-key"]);
});

test("registry probes the saved remote session when refresh skips local MCP resume", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-agent-cloud-"));
  const stateFile = join(directory, "registry.json");
  const calls = [];
  const createService = ({ sessionId = "" } = {}) => ({
    configured: true,
    isStarted: false,
    async probeRemoteStatus() {
      calls.push({ operation: "probeRemoteStatus", sessionId });
      return { ok: true, session_state: "active", display_state: "ready", login_state: "logged_in", worker: { online: true } };
    },
    async status() {
      calls.push({ operation: "status", sessionId });
      return { ok: true, state: "NOT_STARTED", login_state: "logged_out", worker: { online: false } };
    },
    getSessionId() { return sessionId; },
    close() {}
  });
  const state = {
    version: 1,
    agents: {
      "mkt-comment-acquisition": {
        agentId: "mkt-comment-acquisition",
        sessionId: "saved-session",
        status: "error",
        lastError: { code: "DOUYIN_CLOUD_OFFLINE", message: "old local transport timeout" }
      }
    }
  };
  await import("node:fs/promises").then(({ writeFile }) => writeFile(stateFile, `${JSON.stringify(state)}\n`));
  const registry = createDouyinAgentCloudRegistry({
    stateFile,
    createService,
    serviceOptions: { apiKey: "comment-key" }
  });
  const refreshed = await registry.status("mkt-comment-acquisition", { resumeSaved: false });
  assert.equal(refreshed.display_state, "ready");
  assert.equal(refreshed.login_state, "logged_in");
  assert.deepEqual(calls.map((call) => call.operation), ["probeRemoteStatus"]);
});

test("registry reconciles a recoverable error from the remote session before resuming MCP transport", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-agent-cloud-"));
  const stateFile = join(directory, "registry.json");
  const calls = [];
  const state = {
    version: 1,
    agents: {
      "mkt-dm-inbox": {
        agentId: "mkt-dm-inbox",
        sessionId: "saved-session",
        status: "error",
        startedAt: "2026-08-31T08:00:00.000Z",
        lastError: { code: "DOUYIN_PROVISIONING_TIMEOUT", message: "stale local timeout" }
      }
    }
  };
  await import("node:fs/promises").then(({ writeFile }) => writeFile(stateFile, `${JSON.stringify(state)}\n`));
  const registry = createDouyinAgentCloudRegistry({
    stateFile,
    serviceOptions: { apiKey: "inbox-key" },
    createService: ({ sessionId = "" } = {}) => ({
      configured: true,
      async probeRemoteStatus() {
        calls.push("probeRemoteStatus");
        return { ok: true, session_state: "active", display_state: "starting", worker: { online: false }, login_state: "unknown" };
      },
      async resume() {
        calls.push("resume");
        throw new Error("MCP transport should not be resumed for a healthy saved session");
      },
      getSessionId() { return sessionId; },
      close() {}
    })
  });

  const refreshed = await registry.status("mkt-dm-inbox");
  assert.equal(refreshed.display_state, "starting");
  assert.equal(refreshed.sessionId, "saved-session");
  assert.equal(registry.get("mkt-dm-inbox").status, "starting");
  assert.deepEqual(calls, ["probeRemoteStatus"]);
});

test("registry waits for the saved cloud worker to recover after restart returns an early display error", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-agent-cloud-"));
  const stateFile = join(directory, "registry.json");
  const calls = [];
  const state = {
    version: 1,
    agents: {
      "mkt-dm-inbox": {
        agentId: "mkt-dm-inbox",
        sessionId: "saved-session",
        status: "error",
        billingPlan: "hourly",
        accountLabel: "一以万真",
        lastError: { code: "DOUYIN_CLOUD_OFFLINE", message: "worker heartbeat stopped" }
      }
    }
  };
  await import("node:fs/promises").then(({ writeFile }) => writeFile(stateFile, `${JSON.stringify(state)}\n`));
  const registry = createDouyinAgentCloudRegistry({
    stateFile,
    serviceOptions: { apiKey: "inbox-key" },
    createService: ({ sessionId = "" } = {}) => ({
      configured: true,
      currentSessionId: sessionId,
      async stop() {
        calls.push("stop");
        return { ok: true, session_id: sessionId };
      },
      async waitForRemoteStop() {
        calls.push("waitForRemoteStop");
        return true;
      },
      async start() {
        calls.push("start");
        return {
          ok: true,
          session_id: sessionId,
          session_state: "active",
          display_state: "error",
          login_state: "logged_in",
          worker: { online: false }
        };
      },
      async waitForRemoteRecovery() {
        calls.push("waitForRemoteRecovery");
        return true;
      },
      async probeRemoteStatus() {
        calls.push("probeRemoteStatus");
        return {
          ok: true,
          session_state: "active",
          display_state: "ready",
          login_state: "logged_in",
          worker: { online: true },
          account: { account_name: "一以万真", unique_id: "creator" }
        };
      },
      getSessionId() { return this.currentSessionId; },
      close() {}
    })
  });

  const restarted = await registry.restart("mkt-dm-inbox", { billingPlan: "hourly" });

  assert.equal(restarted.display_state, "ready");
  assert.equal(restarted.worker.online, true);
  assert.equal(restarted.account.account_name, "一以万真");
  assert.equal(registry.get("mkt-dm-inbox").status, "online");
  assert.equal(registry.get("mkt-dm-inbox").accountLabel, "一以万真");
  assert.deepEqual(calls, ["stop", "waitForRemoteStop", "start", "waitForRemoteRecovery", "probeRemoteStatus"]);
});

test("registry exposes an existing session as connecting while restart is in flight", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-agent-cloud-"));
  const stateFile = join(directory, "registry.json");
  let releaseStart;
  const state = {
    version: 1,
    agents: {
      "mkt-dm-inbox": {
        agentId: "mkt-dm-inbox",
        sessionId: "saved-session",
        status: "error",
        lastError: { code: "DOUYIN_CLOUD_OFFLINE", message: "stale worker" }
      }
    }
  };
  await import("node:fs/promises").then(({ writeFile }) => writeFile(stateFile, `${JSON.stringify(state)}\n`));
  const registry = createDouyinAgentCloudRegistry({
    stateFile,
    serviceOptions: { apiKey: "inbox-key" },
    createService: ({ sessionId = "" } = {}) => ({
      configured: true,
      async stop() { return { ok: true }; },
      async start() {
        await new Promise((resolve) => { releaseStart = resolve; });
        return { ok: true, session_id: sessionId, display_state: "ready", worker: { online: true } };
      },
      getSessionId() { return sessionId; },
      close() {}
    })
  });

  const restart = registry.restart("mkt-dm-inbox");
  await new Promise((resolve) => setImmediate(resolve));
  const status = await registry.status("mkt-dm-inbox");

  assert.equal(status.state, "CONNECTING");
  assert.equal(status.display_state, "connecting");
  assert.equal(status.sessionId, "saved-session");
  assert.equal(status.provisioning, false);
  assert.equal(registry.get("mkt-dm-inbox").lastError, null);
  releaseStart();
  await restart;
});

test("registry never reports a stopped remote worker as online", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-agent-cloud-"));
  const stateFile = join(directory, "registry.json");
  const state = {
    version: 1,
    agents: {
      "mkt-dm-inbox": {
        agentId: "mkt-dm-inbox",
        sessionId: "saved-session",
        status: "online",
        lastError: null
      }
    }
  };
  await import("node:fs/promises").then(({ writeFile }) => writeFile(stateFile, `${JSON.stringify(state)}\n`));
  const registry = createDouyinAgentCloudRegistry({
    stateFile,
    serviceOptions: { apiKey: "inbox-key" },
    createService: ({ sessionId = "" } = {}) => ({
      configured: true,
      async probeRemoteStatus() {
        return {
          ok: true,
          session_state: "stopped",
          display_state: "stopped",
          login_state: "logged_in",
          worker: { online: false }
        };
      },
      getSessionId() { return sessionId; },
      close() {}
    })
  });

  const status = await registry.status("mkt-dm-inbox", { resumeSaved: false });

  assert.equal(status.session_state, "stopped");
  assert.equal(registry.get("mkt-dm-inbox").status, "error");
  assert.equal(registry.get("mkt-dm-inbox").lastError.code, "DOUYIN_CLOUD_OFFLINE");
});

test("registry identifies a stale provider start command instead of suggesting another restart", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-agent-cloud-"));
  const stateFile = join(directory, "registry.json");
  const state = {
    version: 1,
    agents: {
      "mkt-dm-inbox": { agentId: "mkt-dm-inbox", sessionId: "saved-session", status: "online" }
    }
  };
  await import("node:fs/promises").then(({ writeFile }) => writeFile(stateFile, `${JSON.stringify(state)}\n`));
  const registry = createDouyinAgentCloudRegistry({
    stateFile,
    serviceOptions: { apiKey: "inbox-key" },
    createService: ({ sessionId = "" } = {}) => ({
      configured: true,
      async probeRemoteStatus() {
        return {
          ok: true,
          session_state: "active",
          display_state: "error",
          login_state: "logged_in",
          worker: { online: false },
          login_check: { command_state: "already_pending", event_received: false }
        };
      },
      getSessionId() { return sessionId; },
      close() {}
    })
  });

  await registry.status("mkt-dm-inbox", { resumeSaved: false });

  assert.equal(registry.get("mkt-dm-inbox").status, "error");
  assert.equal(registry.get("mkt-dm-inbox").lastError.code, "DOUYIN_CLOUD_START_STUCK");
  assert.equal(registry.get("mkt-dm-inbox").lastError.details.action, "reauthorize");
});

test("registry keeps a saved session connecting through a transient status transport failure", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-agent-cloud-"));
  const stateFile = join(directory, "registry.json");
  const state = {
    version: 1,
    agents: {
      "mkt-dm-inbox": {
        agentId: "mkt-dm-inbox",
        sessionId: "saved-session",
        status: "starting",
        lastError: null
      }
    }
  };
  await import("node:fs/promises").then(({ writeFile }) => writeFile(stateFile, `${JSON.stringify(state)}\n`));
  const registry = createDouyinAgentCloudRegistry({
    stateFile,
    serviceOptions: { apiKey: "inbox-key" },
    createService: () => ({
      configured: true,
      async probeRemoteStatus() {
        return { ok: false, error: { code: "DOUYIN_REMOTE_STATUS_NETWORK", message: "temporary EOF" } };
      },
      async resume() {
        throw Object.assign(new Error("transport closed"), { code: "network_error" });
      },
      getSessionId() { return "saved-session"; },
      close() {}
    })
  });

  const status = await registry.status("mkt-dm-inbox");
  assert.equal(status.state, "CONNECTING");
  assert.equal(status.sessionId, "saved-session");
  assert.equal(registry.get("mkt-dm-inbox").status, "starting");
  assert.equal(registry.get("mkt-dm-inbox").lastError, null);
});

test("registry keeps a saved cloud session in starting state while the provider is still provisioning", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-agent-cloud-"));
  const stateFile = join(directory, "registry.json");
  let now = Date.parse("2026-08-31T08:00:00.000Z");
  const createService = () => ({
    configured: true,
    currentSessionId: null,
    async start() { this.currentSessionId = "session-stuck"; return { ok: true, session_id: this.currentSessionId }; },
    async resume() { return this.status(); },
    async status() { return { ok: true, session_state: "active", display_state: "starting", worker: { online: false }, login_state: "unknown" }; },
    getSessionId() { return this.currentSessionId; },
    close() {}
  });
  const registry = createDouyinAgentCloudRegistry({
    stateFile,
    createService,
    now: () => now,
    provisioningTimeoutMs: 5 * 60 * 1000
  });

  await registry.start("mkt-dm-inbox");
  now += 6 * 60 * 1000;
  const status = await registry.status("mkt-dm-inbox");
  assert.equal(status.display_state, "starting");
  assert.equal(status.sessionId, "session-stuck");
  assert.equal(registry.get("mkt-dm-inbox").status, "starting");
});

test("registry restarts a stuck cloud by stopping the old session first", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-agent-cloud-"));
  const stateFile = join(directory, "registry.json");
  const calls = [];
  const createService = () => ({
    configured: true,
    currentSessionId: null,
    async start() { calls.push("start"); this.currentSessionId = "session-restarted"; return { ok: true, session_id: this.currentSessionId }; },
    async stop() { calls.push("stop"); return { ok: true, state: "stopped" }; },
    async status() { return { ok: true, session_state: "active", worker: { online: true }, login_state: "logged_in" }; },
    getSessionId() { return this.currentSessionId; },
    close() {}
  });
  const registry = createDouyinAgentCloudRegistry({ stateFile, createService });

  await registry.start("mkt-dm-inbox");
  await registry.restart("mkt-dm-inbox");
  assert.deepEqual(calls, ["start", "stop", "start"]);
});

test("registry lets the historical session owner recover a legacy shared session", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-agent-cloud-"));
  const stateFile = join(directory, "registry.json");
  const calls = [];
  const createService = () => ({
    configured: true,
    currentSessionId: "legacy-session",
    async stop() { calls.push("stop"); return { ok: true, state: "stopped" }; },
    async start() { calls.push("start"); this.currentSessionId = "fresh-session"; return { ok: true, session_id: this.currentSessionId }; },
    async status() { return { ok: true, session_state: "active", worker: { online: true } }; },
    getSessionId() { return this.currentSessionId; }
  });
  await import("node:fs/promises").then(({ writeFile }) => writeFile(stateFile, `${JSON.stringify({
    version: 1,
    agents: {
      "mkt-dm-inbox": { agentId: "mkt-dm-inbox", sessionId: "legacy-session", status: "online", updatedAt: "2026-08-31T11:18:01.000Z" },
      "mkt-cold-writer": { agentId: "mkt-cold-writer", sessionId: "legacy-session", status: "online", startedAt: "2026-08-31T07:40:12.000Z", updatedAt: "2026-08-31T11:34:08.000Z" }
    }
  })}\n`));
  const registry = createDouyinAgentCloudRegistry({ stateFile, createService, serviceOptions: { apiKey: "legacy-key" } });

  await assert.rejects(() => registry.status("mkt-dm-inbox"), { code: "DOUYIN_AGENT_API_KEY_SHARED" });
  const restarted = await registry.restart("mkt-cold-writer");
  assert.equal(restarted.sessionId, "fresh-session");
  assert.deepEqual(calls, ["stop", "start"]);
  assert.equal(registry.get("mkt-cold-writer").ownershipAt, "2026-08-31T07:40:12.000Z");
});

test("registry exposes a key rotation as an explicit reauthorization state", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-agent-cloud-"));
  const stateFile = join(directory, "registry.json");
  const createService = () => ({
    configured: true,
    async status() { throw new Error("the old session must not be resumed with the new key"); },
    getSessionId() { return null; }
  });
  await import("node:fs/promises").then(({ writeFile }) => writeFile(stateFile, `${JSON.stringify({
    version: 1,
    agents: {
      "mkt-dm-inbox": {
        agentId: "mkt-dm-inbox",
        sessionId: "legacy-session",
        providerKeyFingerprint: "old-key-fingerprint",
        status: "online",
        updatedAt: "2026-08-31T11:18:01.000Z"
      }
    }
  })}\n`));
  const registry = createDouyinAgentCloudRegistry({
    stateFile,
    createService,
    serviceOptionsByAgent: { "mkt-dm-inbox": { apiKey: "new-key" } }
  });

  const status = await registry.status("mkt-dm-inbox");
  assert.equal(status.state, "NOT_STARTED");
  assert.equal(status.error.code, "DOUYIN_AGENT_KEY_ROTATED");
  assert.equal(registry.get("mkt-dm-inbox").sessionId, null);
  const refreshed = await registry.status("mkt-dm-inbox");
  assert.equal(refreshed.error.code, "DOUYIN_AGENT_KEY_ROTATED");
});

test("registry migrates legacy sessions without a stored key fingerprint", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-agent-cloud-"));
  const stateFile = join(directory, "registry.json");
  await import("node:fs/promises").then(({ writeFile }) => writeFile(stateFile, `${JSON.stringify({
    version: 1,
    agents: {
      "mkt-dm-inbox": { agentId: "mkt-dm-inbox", sessionId: "legacy-session", status: "online" }
    }
  })}\n`));
  const registry = createDouyinAgentCloudRegistry({
    stateFile,
    createService: () => ({ configured: true, getSessionId() { return null; } }),
    serviceOptionsByAgent: { "mkt-dm-inbox": { apiKey: "new-key" } }
  });

  const status = await registry.status("mkt-dm-inbox");
  assert.equal(status.error.code, "DOUYIN_AGENT_KEY_ROTATED");
});

test("registry adopts a scoped legacy product session into an account cloud runtime", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-agent-cloud-"));
  const stateFile = join(directory, "registry.json");
  const scope = { accountId: "douyin-account-1", accountIdentity: { uid: "douyin-account-1" } };
  await import("node:fs/promises").then(({ writeFile }) => writeFile(stateFile, `${JSON.stringify({
    version: 1,
    agents: {
      "mkt-comment-acquisition::local::account%3Adouyin-account-1": {
        agentId: "mkt-comment-acquisition",
        bindingKey: "mkt-comment-acquisition::local::account%3Adouyin-account-1",
        accountId: "douyin-account-1",
        accountIdentity: { uid: "douyin-account-1" },
        sessionId: "legacy-session",
        status: "online"
      }
    }
  })}\n`));
  const calls = [];
  const registry = createDouyinAgentCloudRegistry({
    stateFile,
    createService: ({ sessionId = "" } = {}) => ({
      configured: true,
      isStarted: true,
      async status() { calls.push(sessionId); return { ok: true, session_state: "active", worker: { online: true } }; },
      getSessionId() { return sessionId; }
    })
  });

  const adopted = registry.adopt("mkt-douyin-account-runtime", {
    ...scope,
    fromAgentIds: ["mkt-comment-acquisition", "mkt-douyin-child-capabilities"]
  });
  assert.equal(adopted.agentId, "mkt-douyin-account-runtime");
  assert.equal(adopted.sessionId, "legacy-session");
  assert.equal(registry.get("mkt-comment-acquisition", scope), null);
  const status = await registry.status("mkt-douyin-account-runtime", { ...scope, resumeSaved: false });
  assert.equal(status.sessionId, "legacy-session");
  assert.deepEqual(calls, ["legacy-session"]);
});

test("registry replaces a stale canonical key-conflict record with its healthy legacy carrier", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-agent-cloud-"));
  const stateFile = join(directory, "registry.json");
  const scope = { accountId: "douyin-account-1", accountIdentity: { uid: "douyin-account-1" } };
  const canonicalKey = "mkt-douyin-account-runtime::local::account%3Adouyin-account-1";
  const legacyKey = "mkt-comment-acquisition::local::account%3Adouyin-account-1";
  await import("node:fs/promises").then(({ writeFile }) => writeFile(stateFile, `${JSON.stringify({
    version: 1,
    agents: {
      [canonicalKey]: {
        agentId: "mkt-douyin-account-runtime",
        bindingKey: canonicalKey,
        accountId: "douyin-account-1",
        accountIdentity: { uid: "douyin-account-1" },
        sessionId: "shared-session",
        status: "error",
        lastError: { code: "DOUYIN_AGENT_API_KEY_SHARED", message: "stale conflict" }
      },
      [legacyKey]: {
        agentId: "mkt-comment-acquisition",
        bindingKey: legacyKey,
        accountId: "douyin-account-1",
        accountIdentity: { uid: "douyin-account-1" },
        sessionId: "shared-session",
        status: "online"
      }
    }
  })}\n`));
  const registry = createDouyinAgentCloudRegistry({
    stateFile,
    createService: ({ sessionId = "" } = {}) => ({
      configured: true,
      async status() { return { ok: true, session_state: "active", worker: { online: true } }; },
      getSessionId() { return sessionId; }
    })
  });

  const adopted = registry.adopt("mkt-douyin-account-runtime", {
    ...scope,
    fromAgentIds: ["mkt-comment-acquisition"]
  });
  assert.equal(adopted.status, "online");
  assert.equal(adopted.lastError, null);
  assert.equal(registry.get("mkt-comment-acquisition", scope), null);
  const status = await registry.status("mkt-douyin-account-runtime", { ...scope, resumeSaved: false });
  assert.equal(status.sessionId, "shared-session");
  assert.equal(status.error, undefined);
});

test("registry repairs duplicate unscoped and account-scoped records for one account cloud", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-agent-cloud-"));
  const stateFile = join(directory, "registry.json");
  const agentId = "mkt-douyin-account-runtime";
  const scope = { accountIdentity: { sec_uid: "sec-account-1", uid: "douyin-account-1" } };
  const scopedKey = `${agentId}::local::identity%3Asec-account-1`;
  const record = {
    agentId,
    accountIdentity: scope.accountIdentity,
    sessionId: "shared-session",
    status: "online",
    providerKeyFingerprint: null
  };
  await import("node:fs/promises").then(({ writeFile }) => writeFile(stateFile, `${JSON.stringify({
    version: 1,
    agents: {
      [agentId]: { ...record, bindingKey: agentId },
      [scopedKey]: { ...record, bindingKey: scopedKey }
    }
  })}\n`));

  const calls = [];
  const registry = createDouyinAgentCloudRegistry({
    stateFile,
    createService: ({ sessionId = "" } = {}) => ({
      configured: true,
      async status() {
        calls.push(sessionId);
        return { ok: true, session_state: "active", login_state: "logged_in", worker: { online: true } };
      },
      getSessionId() { return sessionId; }
    })
  });

  const status = await registry.status(agentId, { resumeSaved: false });
  assert.equal(status.sessionId, "shared-session");
  assert.equal(status.login_state, "logged_in");
  assert.deepEqual(calls, ["shared-session"]);
  assert.equal(registry.list().filter((entry) => entry.agentId === agentId).length, 1);
  assert.equal(registry.get(agentId).bindingKey, scopedKey);
});

test("registry removes the unscoped carrier after binding it to an identified account", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-agent-cloud-"));
  const stateFile = join(directory, "registry.json");
  const agentId = "mkt-douyin-account-runtime";
  const scope = { accountIdentity: { sec_uid: "sec-account-1", uid: "douyin-account-1" } };
  await import("node:fs/promises").then(({ writeFile }) => writeFile(stateFile, `${JSON.stringify({
    version: 1,
    agents: {
      [agentId]: {
        agentId,
        bindingKey: agentId,
        accountIdentity: scope.accountIdentity,
        sessionId: "shared-session",
        status: "online"
      }
    }
  })}\n`));

  const registry = createDouyinAgentCloudRegistry({
    stateFile,
    createService: ({ sessionId = "" } = {}) => ({
      configured: true,
      async status() { return { ok: true, login_state: "logged_in", worker: { online: true } }; },
      getSessionId() { return sessionId; }
    })
  });

  const bound = registry.adopt(agentId, scope);
  assert.equal(bound.sessionId, "shared-session");
  assert.equal(registry.list().filter((entry) => entry.agentId === agentId).length, 1);
  assert.equal(registry.get(agentId).bindingKey, `${agentId}::local::identity%3Asec-account-1`);
});
