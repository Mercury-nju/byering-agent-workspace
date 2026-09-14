import test from "node:test";
import assert from "node:assert/strict";
import { createControlPlaneHttpServer } from "../backend/http-server.js";
import { createControlPlane } from "../backend/control-plane.js";
import { createOfficeStatusStore } from "../src/salebuddy/bridge/office-status.js";
import { buildOfficeAgentRoster } from "../src/salebuddy/ui/office-agent-runtime.js";
import { officeWorkState } from "../src/salebuddy/ui/office-workspace-state.js";
import { createOfficeWorkReplayStore } from "../backend/office-work-replay.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function setup(t, options = {}) {
  const server = createControlPlaneHttpServer({ auth: false, ...options });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => {
    server.closeAllConnections();
    server.close(resolve);
  }));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, snapshot: async (headers = {}) => {
    const response = await fetch(`${base}/v1/office/status`, { headers });
    assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store");
    return response.json();
  } };
}

test("HTTP status keeps legacy finder operations out of the active Douyin workbench", async t => {
  let finish, calls = 0;
  const { base, snapshot } = await setup(t, { douyinFinderService: { configured: true,
    run: () => { calls++; return new Promise(resolve => { finish = resolve; }); } } });
  await snapshot(); assert.equal(calls, 0);
  const response = await fetch(`${base}/v1/connectors/douyin-finder/run`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ taskId: "office-finder", agentId: "mkt-douyin-finder", goal: "test" }) });
  assert.equal(response.status, 202);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 1);
  assert.equal((await snapshot()).works.find(w => w.agentType === "mkt-douyin-finder"), undefined);
  finish({ status: "SUCCEEDED", taskId: "office-finder", accounts: [] });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal((await snapshot()).works.find(w => w.agentType === "mkt-douyin-finder"), undefined);
  assert.equal(calls, 1);
});

test("backend state, store, label and workspace agree across start, pause, stop and stale data", async t => {
  const task = { context: { agentId: "mkt-comment-acquisition", taskId: "office-acquisition", accountId: "account-1" }, state: "running", runtimeAlive: true, listening: false };
  const { snapshot } = await setup(t, { douyinAcquisitionService: { listRuntimeTasks: () => [task] } });
  const store = createOfficeStatusStore({ fetchSnapshot: snapshot, getAgentIds: () => [task.context.agentId],
    getLocalWorks: () => [{ agentType: task.context.agentId, state: "working", metadata: { taskState: "running" } }] });
  t.after(() => store.dispose());
  for (const [backendState, alive, listening, expected] of [["running", true, false, "working"], ["running", true, true, "working"], ["paused", false, false, "idle"], ["stopped", false, false, "idle"], ["running", false, false, "unknown"]]) {
    Object.assign(task, { state: backendState, runtimeAlive: alive, listening }); await store.refresh();
    const roster = buildOfficeAgentRoster({ activatedAgents: [{ id: task.context.agentId }], works: store.getWorks() });
    assert.equal(roster.roster[0].state, expected);
    assert.equal(officeWorkState(store.getWork(task.context.agentId)).kind, expected);
  }
});

test("office HTTP keeps a reauthorization-required durable task actionable", async t => {
  const task = {
    context: { agentId: "mkt-comment-acquisition", taskId: "office-reauthorize", accountId: "account-1" },
    state: "degraded",
    runtimeAlive: false,
    resumeBlocked: {
      reason: "authorization_required",
      message: "抖音账号需要重新连接后，自动获客会继续。"
    }
  };
  const { snapshot } = await setup(t, { douyinAcquisitionService: { listRuntimeTasks: () => [task] } });
  const work = (await snapshot()).works.find(item => item.agentType === task.context.agentId);
  assert.equal(work.state, "attention");
  assert.equal(work.metadata.resumeBlocked.reason, "authorization_required");
  assert.equal(officeWorkState(work).label, "账号已掉线");
});

test("cancelling a control-plane acquisition task stops its runtime and removes it from realtime work", async t => {
  const task = {
    key: "acquisition-cancel-key",
    context: {
      agentId: "mkt-comment-acquisition",
      taskId: "office-cancel-acquisition",
      taskRunId: "run-cancel-acquisition",
      accountId: "account-1"
    },
    state: "degraded",
    runtimeAlive: false,
    lastError: { code: "DOUYIN_AUTH_EXPIRED", message: "抖音授权已失效" },
    resumeBlocked: {
      reason: "authorization_required",
      message: "抖音账号需要重新连接后，自动获客会继续。"
    }
  };
  let stops = 0;
  const acquisitionService = {
    listTasks: () => [task],
    listRuntimeTasks: () => [task],
    status(key) {
      assert.equal(key, task.key);
      return task;
    },
    async stop(key, reason) {
      assert.equal(key, task.key);
      assert.equal(reason, "user_cancelled");
      stops += 1;
      task.state = "stopped";
      task.runtimeAlive = false;
      task.lastError = null;
      task.resumeBlocked = null;
      return task;
    }
  };
  const controlPlane = createControlPlane();
  controlPlane.dispatch({
    type: "task.create",
    taskId: task.context.taskId,
    taskRunId: task.context.taskRunId,
    agentId: task.context.agentId,
    payload: { goal: "持续获客" }
  });
  const { base, snapshot } = await setup(t, { controlPlane, douyinAcquisitionService: acquisitionService });
  const response = await fetch(`${base}/v1/commands`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "task.cancel",
      taskId: task.context.taskId,
      taskRunId: task.context.taskRunId,
      agentId: task.context.agentId,
      accountId: task.context.accountId,
      expectedVersion: 0
    })
  });

  assert.equal(response.status, 202);
  assert.equal((await response.json()).state, "CANCELLED");
  assert.equal(stops, 1);
  const work = (await snapshot()).works.find(item => item.agentType === task.context.agentId);
  assert.equal(work.state, "idle");
  assert.equal(work.metadata.activeTaskCount, 0);
});

test("cancelling an inbox task from a conversation stops only its matching runtime", async t => {
  const taskId = "office-cancel-inbox";
  const taskRunId = "run-cancel-inbox";
  let running = true;
  const stopCalls = [];
  const inboxService = {
    agentId: "mkt-dm-inbox",
    status() {
      return {
        accountId: "account-1",
        taskId,
        taskRunId,
        runtime: { running }
      };
    },
    async stop(options) {
      stopCalls.push(options);
      running = false;
      return {
        ...this.status(),
        stopOutcome: {
          taskId,
          durableStopped: true,
          runtimeStopped: true,
          runtimeTaskMatched: true
        }
      };
    }
  };
  const controlPlane = createControlPlane();
  controlPlane.ensureManagedRuntimeTask({
    taskId,
    taskRunId,
    agentId: "mkt-dm-inbox",
    goal: "持续承接抖音新私信",
    executionContext: { accountId: "account-1", accountKey: "douyin:account-1" }
  });
  const { base } = await setup(t, { controlPlane, douyinInboxAgentService: inboxService });

  const response = await fetch(`${base}/v1/commands`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "task.cancel",
      taskId,
      taskRunId,
      agentId: "mkt-dm-inbox",
      accountId: "account-1",
      expectedVersion: 2
    })
  });

  const responseBody = await response.json();
  assert.equal(response.status, 202, JSON.stringify(responseBody));
  assert.equal(responseBody.state, "CANCELLED");
  assert.deepEqual(stopCalls, [{ reason: "user_cancelled", taskId, accountId: "account-1" }]);
  assert.equal(running, false);
});

test("a stale inbox stop request cannot stop a newer runtime for the same account", async t => {
  let stopCalls = 0;
  const inboxService = {
    agentId: "mkt-dm-inbox",
    status() {
      return {
        accountId: "account-1",
        taskId: "newer-inbox-task",
        runtime: { running: true }
      };
    },
    async stop() {
      stopCalls += 1;
      throw Error("must not stop the newer runtime");
    }
  };
  const { base } = await setup(t, { douyinInboxAgentService: inboxService });

  const response = await fetch(`${base}/v1/douyin/inbox-agent/stop`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      agentId: "mkt-dm-inbox",
      accountId: "account-1",
      taskId: "older-inbox-task",
      confirm: "STOP"
    })
  });

  const responseBody = await response.json();
  assert.equal(response.status, 409, JSON.stringify(responseBody));
  assert.equal(responseBody.error.code, "INBOX_RUNTIME_TASK_MISMATCH");
  assert.equal(stopCalls, 0);
});

test("office status reclaims an already-cancelled acquisition task left by an older runtime", async t => {
  const task = {
    key: "legacy-cancel-key",
    context: {
      agentId: "mkt-comment-acquisition",
      taskId: "legacy-cancelled-acquisition",
      taskRunId: "legacy-cancelled-run",
      accountId: "account-1"
    },
    state: "degraded",
    runtimeAlive: false,
    lastError: { code: "DOUYIN_AUTH_EXPIRED", message: "抖音授权已失效" },
    resumeBlocked: { reason: "authorization_required", message: "抖音账号需要重新连接后，自动获客会继续。" }
  };
  let stops = 0;
  const acquisitionService = {
    listTasks: () => [task],
    listRuntimeTasks: () => [task],
    status: () => task,
    async stop(key, reason) {
      assert.equal(key, task.key);
      assert.equal(reason, "control_plane_cancelled");
      stops += 1;
      task.state = "stopped";
      task.lastError = null;
      task.resumeBlocked = null;
      return task;
    }
  };
  const controlPlane = createControlPlane();
  controlPlane.dispatch({
    type: "task.create",
    taskId: task.context.taskId,
    taskRunId: task.context.taskRunId,
    agentId: task.context.agentId,
    payload: { goal: "历史获客任务" }
  });
  controlPlane.dispatch({
    type: "task.cancel",
    taskId: task.context.taskId,
    expectedVersion: 0
  });
  const { snapshot } = await setup(t, { controlPlane, douyinAcquisitionService: acquisitionService });

  const work = (await snapshot()).works.find(item => item.agentType === task.context.agentId);
  assert.equal(stops, 1);
  assert.equal(work.state, "idle");
  assert.equal(work.metadata.activeTaskCount, 0);
});

test("office HTTP returns the saved acquisition configuration needed by strategy editing", async t => {
  const task = {
    context: { agentId: "mkt-comment-acquisition", taskId: "office-config", taskRunId: "run-config", accountId: "account-1" },
    state: "running",
    runtimeAlive: true,
    config: {
      sourceScope: { kind: "authorized_account_comments", accountId: "private-account", accountName: "private-name" },
      workWindow: { timeWindow: "09:00-21:00" },
      frequency: { mode: "每小时一次" },
      audienceRules: { goal: "明确询价的人", minScore: 85 },
      touchChannel: "private_message",
      contentPolicy: { strategy: "先回应具体留言，再确认需求", replyStyle: "自然", template: "不应重复展示的原始模板" },
      caps: { dailyMax: 20, sendIntervalMs: 600000 },
      stopConditions: { stopOnOptOut: true },
      accountIdentity: { nickname: "不应泄露" }
    },
    configurationVersion: 4
  };
  const { snapshot } = await setup(t, { douyinAcquisitionService: { listRuntimeTasks: () => [task] } });
  const work = (await snapshot()).works.find(item => item.agentType === task.context.agentId);
  assert.deepEqual(work.metadata.configuration, {
    version: 4,
    findingStrategy: {
      sourceScope: { kind: "authorized_account_comments" },
      audienceGoal: "明确询价的人",
      minScore: 85
    },
    touchContent: {
      channel: "private_message",
      message: "先回应具体留言，再确认需求",
      strategy: "先回应具体留言，再确认需求",
      replyStyle: "自然"
    },
    frequency: { mode: "每小时一次", maxTouchesPerDay: 20, minIntervalMinutes: 10 },
    // Account listeners run continuously. Reception hours are configured in
    // the separate private-message reception policy.
  });
  assert.equal(JSON.stringify(work.metadata.configuration).includes("private-account"), false);
  assert.equal(JSON.stringify(work.metadata.configuration).includes("不应泄露"), false);
});

test("office status hides legacy listener schedules and historical lookback", async t => {
  const task = {
    context: { agentId: "mkt-comment-acquisition", taskId: "office-listener-migration", taskRunId: "run-listener-migration", accountId: "account-1" },
    state: "running",
    runtimeAlive: true,
    config: {
      sourceScope: { kind: "authorized_account_interactions", lookbackDays: 30 },
      findingStrategy: { timeWindow: "最近 7 天", audienceGoal: "近期明确询价的人" },
      workWindow: { timeWindow: "09:00-21:00", lookbackDays: 7 }
    }
  };
  const { snapshot } = await setup(t, { douyinAcquisitionService: { listRuntimeTasks: () => [task] } });
  const work = (await snapshot()).works.find(item => item.agentType === "mkt-comment-acquisition");
  assert.equal(Object.hasOwn(work.metadata.configuration, "timeWindow"), false);
  assert.equal(JSON.stringify(work.metadata.configuration).includes("最近 7 天"), false);
  assert.equal(JSON.stringify(work.metadata.configuration).includes("lookbackDays"), false);
});

test("office endpoint isolates tenant tasks and rejects unauthenticated reads", async t => {
  const auth = { authenticate(request) { const tenantId = request.headers["x-test-tenant"]; if (!tenantId) throw Object.assign(Error("Unauthorized"), { statusCode: 401 }); return { tenantId, authenticated: true }; } };
  const { base, snapshot } = await setup(t, { auth, douyinAcquisitionService: { listRuntimeTasks: () => ["a", "b"].map(tenantId => ({
    context: { tenantId, agentId: "mkt-comment-acquisition", taskId: `secret-${tenantId}` }, state: "running", runtimeAlive: true
  })) } });
  assert.equal((await fetch(`${base}/v1/office/status`)).status, 401);
  const data = await snapshot({ "x-test-tenant": "a" });
  assert.equal(JSON.stringify(data).includes("secret-b"), false);
  assert.equal(data.works.find(w => w.agentType === "mkt-comment-acquisition").metadata.taskId, "secret-a");
});

test("inbox listening status reads existing runtime without starting or polling it", async t => {
  let reads = 0;
  const { snapshot } = await setup(t, { douyinInboxAgentService: { agentId: "mkt-dm-inbox",
    status() { reads++; return { accountId: "account-1", runtime: { running: true, polling: false } }; },
    start() { throw Error("Must not start"); }, pollOnce() { throw Error("Must not poll"); } } });
  assert.equal((await snapshot()).works.find(w => w.agentType === "mkt-dm-inbox").state, "working");
  assert.equal(reads, 1);
});

test("office status resumes a durable inbox task even when the remote listener needs to restart", async t => {
  let resumed = 0;
  const inbox = {
    agentId: "mkt-dm-inbox",
    canResumeSaved: () => true,
    status() {
      return resumed
        ? { accountId: "account-1", accountName: "测试账号", runtime: { running: true, polling: false } }
        : { accountId: null, accountName: null, runtime: null };
    },
    async resumeSaved({ accountIdentity }) {
      assert.equal(accountIdentity.nickname, "测试账号");
      resumed += 1;
      return this.status();
    }
  };
  const registry = {
    async status(agentId) {
      assert.equal(agentId, "mkt-douyin-account-runtime");
      return { message_mode: "not_started", account: { uid: "account-1", nickname: "测试账号" } };
    },
    getService() { return { configured: true }; }
  };
  const { snapshot } = await setup(t, { douyinAgentCloudRegistry: registry, douyinInboxAgentService: inbox });
  const work = (await snapshot()).works.find(item => item.agentType === "mkt-dm-inbox");
  assert.equal(resumed, 1);
  assert.equal(work.state, "working");
});

test("office status never revives a stopped inbox task from a remote listener alone", async t => {
  let resumed = 0;
  const inbox = {
    agentId: "mkt-dm-inbox",
    canResumeSaved: () => false,
    status() { return { accountId: null, accountName: null, runtime: null }; },
    async resumeSaved() {
      resumed += 1;
      return this.status();
    }
  };
  const registry = {
    async status() {
      return { message_mode: "running", account: { uid: "account-1", nickname: "测试账号" } };
    },
    getService() { return { configured: true }; }
  };
  const { snapshot } = await setup(t, { douyinAgentCloudRegistry: registry, douyinInboxAgentService: inbox });
  const work = (await snapshot()).works.find(item => item.agentType === "mkt-dm-inbox");
  assert.equal(resumed, 0);
  assert.equal(work.state, "idle");
});

test("legacy discovery operations do not reappear in the active Douyin workbench", async t => {
  let finish, entered;
  const { base, snapshot } = await setup(t, { prospectService: { configured: true,
    discover: () => { entered?.(); return new Promise(resolve => { finish = resolve; }); } } });
  for (const agentId of ["mkt-lead-miner", "mkt-comment-filter", "mkt-user-research"]) {
    const started = new Promise(resolve => { entered = resolve; });
    const request = fetch(`${base}/v1/connectors/prospect/discover`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ taskId: `test-${agentId}`, agentId }) });
    await started;
    assert.equal((await snapshot()).works.find(work => work.agentType === agentId), undefined);
    finish({ status: "SUCCEEDED", events: [] }); await request;
    assert.equal((await snapshot()).works.find(work => work.agentType === agentId), undefined);
  }
});

test("model-only account analysis does not occupy an active Douyin Agent slot", async t => {
  let finish;
  const { base, snapshot } = await setup(t, { accountAnalysisService: { configured: true,
    run: () => new Promise(resolve => { finish = resolve; }) } });
  const response = await fetch(`${base}/v1/agents/account-analysis/run`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ taskId: "test-model", accounts: [{ uid: "test" }] }) });
  assert.equal(response.status, 202);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal((await snapshot()).works.find(work => work.agentType === "mkt-research-expert"), undefined);
  finish({ status: "completed" }); await new Promise(resolve => setImmediate(resolve));
  assert.equal((await snapshot()).works.find(work => work.agentType === "mkt-research-expert"), undefined);
});

test("direct private outreach cannot bypass the active product Agent gateway", async t => {
  let calls = 0;
  const { base, snapshot } = await setup(t, { douyinMcpService: { configured: true,
    probeRemoteStatus: async () => ({ login_state: "logged_in", account: { uid: "sender" } }),
    sendPrivateMessage: () => { calls += 1; return { ok: true, state: "delivered", message_id: "fixture" }; } } });
  const response = await fetch(`${base}/v1/douyin/mcp/send-private-message`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      agentId: "mkt-cold-writer",
      ownerAgentId: "mkt-cold-writer",
      taskId: "test-mkt-cold-writer",
      content: "fixture",
      secUid: "fixture",
      confirm: "SEND"
    })
  });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error.code, "CORE_AGENT_GATEWAY_REQUIRED");
  assert.equal(calls, 0);
  assert.equal((await snapshot()).works.find(work => work.agentType === "mkt-cold-writer")?.state, "idle");
});

test("office replay persists only real JPEG frames, keeps thirty recent frames, and isolates tenants", async t => {
  const root = mkdtempSync(join(tmpdir(), "byering-office-replay-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const auth = { authenticate(request) { const tenantId = request.headers["x-test-tenant"]; if (!tenantId) throw Object.assign(Error("Unauthorized"), { statusCode: 401 }); return { tenantId, authenticated: true }; } };
  const { base } = await setup(t, { auth, officeReplayStore: createOfficeWorkReplayStore({ root }) });
  const frame = "data:image/jpeg;base64,/9j/2Q==";
  for (let index = 0; index < 32; index++) {
    const response = await fetch(`${base}/v1/office/replay/snapshot`, { method: "POST", headers: { "content-type": "application/json", "x-test-tenant": "a" }, body: JSON.stringify({
      agentId: "mkt-comment-acquisition", taskId: "task-a", eventKey: `frame-${index}`, title: `第 ${index} 个画面`, imageData: frame
    }) });
    assert.equal(response.status, 201);
  }
  const listing = await fetch(`${base}/v1/office/replay?agentId=mkt-comment-acquisition&taskId=task-a&limit=30`, { headers: { "x-test-tenant": "a" } });
  assert.equal(listing.status, 200); assert.equal(listing.headers.get("cache-control"), "no-store");
  const replay = await listing.json();
  assert.equal(replay.snapshots.length, 30);
  assert.equal(replay.snapshots[0].title, "第 31 个画面");
  const image = await fetch(`${base}${replay.snapshots[0].imageUrl}`, { headers: { "x-test-tenant": "a" } });
  assert.equal(image.status, 200); assert.equal(image.headers.get("content-type"), "image/jpeg");
  assert.deepEqual([...new Uint8Array(await image.arrayBuffer())], [0xff, 0xd8, 0xff, 0xd9]);
  const otherTenant = await fetch(`${base}/v1/office/replay?agentId=mkt-comment-acquisition&taskId=task-a`, { headers: { "x-test-tenant": "b" } });
  assert.equal((await otherTenant.json()).snapshots.length, 0);
  const invalid = await fetch(`${base}/v1/office/replay/snapshot`, { method: "POST", headers: { "content-type": "application/json", "x-test-tenant": "a" }, body: JSON.stringify({ agentId: "mkt-comment-acquisition", eventKey: "not-an-image", title: "invalid", imageData: "data:image/png;base64,AAAA" }) });
  assert.equal(invalid.status, 400);
});

test("office replay keeps the latest three recorded WebM segments for the active task", async t => {
  const root = mkdtempSync(join(tmpdir(), "byering-office-video-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const auth = { authenticate(request) { const tenantId = request.headers["x-test-tenant"]; if (!tenantId) throw Object.assign(Error("Unauthorized"), { statusCode: 401 }); return { tenantId, authenticated: true }; } };
  const { base } = await setup(t, { auth, officeReplayStore: createOfficeWorkReplayStore({ root }) });
  const webm = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x93]);
  for (let index = 0; index < 4; index++) {
    const query = new URLSearchParams({ agentId: "mkt-comment-acquisition", taskId: "task-video", recordingId: "recording-a", title: `第 ${index} 段`, durationMs: "5000" });
    const response = await fetch(`${base}/v1/office/replay/video?${query}`, { method: "POST", headers: { "content-type": "video/webm", "x-test-tenant": "a" }, body: webm });
    assert.equal(response.status, 201);
  }
  const listing = await fetch(`${base}/v1/office/replay?agentId=mkt-comment-acquisition&taskId=task-video`, { headers: { "x-test-tenant": "a" } });
  assert.equal(listing.status, 200);
  const replay = await listing.json();
  assert.equal(replay.segments.length, 3);
  assert.equal(replay.segments[0].title, "第 3 段");
  const video = await fetch(`${base}${replay.segments[0].videoUrl}`, { headers: { "x-test-tenant": "a" } });
  assert.equal(video.status, 200);
  assert.equal(video.headers.get("content-type"), "video/webm");
  assert.deepEqual([...new Uint8Array(await video.arrayBuffer())], [...webm]);
  const invalid = await fetch(`${base}/v1/office/replay/video?agentId=mkt-comment-acquisition&recordingId=invalid&title=invalid`, { method: "POST", headers: { "content-type": "video/webm", "x-test-tenant": "a" }, body: Buffer.from("not-webm") });
  assert.equal(invalid.status, 400);
});

test("office replay can select the latest successful task and exclude failed or cancelled work", async t => {
  const root = mkdtempSync(join(tmpdir(), "byering-office-success-replay-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const auth = { authenticate(request) { const tenantId = request.headers["x-test-tenant"]; if (!tenantId) throw Object.assign(Error("Unauthorized"), { statusCode: 401 }); return { tenantId, authenticated: true }; } };
  const { base } = await setup(t, { auth, officeReplayStore: createOfficeWorkReplayStore({ root }) });
  const webm = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x93]);
  for (const taskId of ["task-failed", "task-success", "task-cancelled"]) {
    const segments = taskId === "task-success" ? 3 : 1;
    for (let index = 0; index < segments; index++) {
      const query = new URLSearchParams({ agentId: "mkt-comment-acquisition", taskId, recordingId: taskId, title: `${taskId}-${index}`, durationMs: "5000" });
      const response = await fetch(`${base}/v1/office/replay/video?${query}`, { method: "POST", headers: { "content-type": "video/webm", "x-test-tenant": "a" }, body: webm });
      assert.equal(response.status, 201);
    }
  }
  for (const [taskId, outcome] of [["task-failed", "failed"], ["task-success", "success"], ["task-cancelled", "cancelled"]]) {
    const response = await fetch(`${base}/v1/office/replay/task`, { method: "POST", headers: { "content-type": "application/json", "x-test-tenant": "a" }, body: JSON.stringify({ agentId: "mkt-comment-acquisition", taskId, recordingId: taskId, outcome }) });
    assert.equal(response.status, 200);
  }
  const listing = await fetch(`${base}/v1/office/replay?agentId=mkt-comment-acquisition&successfulOnly=1`, { headers: { "x-test-tenant": "a" } });
  assert.equal(listing.status, 200);
  const replay = await listing.json();
  assert.equal(replay.taskId, "task-success");
  assert.equal(replay.segments.length, 3);
  assert.deepEqual([...new Set(replay.segments.map(segment => segment.taskId))], ["task-success"]);
  assert.equal(replay.segments.every(segment => segment.outcome === "success"), true);
});

test("office replay deletion requires an explicit full-history confirmation", async t => {
  const root = mkdtempSync(join(tmpdir(), "byering-office-purge-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const auth = { authenticate(request) { const tenantId = request.headers["x-test-tenant"]; if (!tenantId) throw Object.assign(Error("Unauthorized"), { statusCode: 401 }); return { tenantId, authenticated: true }; } };
  const { base } = await setup(t, { auth, officeReplayStore: createOfficeWorkReplayStore({ root }) });
  const webm = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x93]);
  const query = new URLSearchParams({ agentId: "mkt-comment-acquisition", taskId: "task-delete", recordingId: "recording-delete", title: "delete", durationMs: "5000" });
  await fetch(`${base}/v1/office/replay/video?${query}`, { method: "POST", headers: { "content-type": "video/webm", "x-test-tenant": "a" }, body: webm });
  const denied = await fetch(`${base}/v1/office/replay`, { method: "DELETE", headers: { "content-type": "application/json", "x-test-tenant": "a" }, body: JSON.stringify({ agentId: "mkt-comment-acquisition" }) });
  assert.equal(denied.status, 400);
  const deleted = await fetch(`${base}/v1/office/replay`, { method: "DELETE", headers: { "content-type": "application/json", "x-test-tenant": "a" }, body: JSON.stringify({ agentId: "mkt-comment-acquisition", taskId: "task-delete" }) });
  assert.equal(deleted.status, 200);
  const listing = await fetch(`${base}/v1/office/replay?agentId=mkt-comment-acquisition&taskId=task-delete`, { headers: { "x-test-tenant": "a" } });
  assert.equal((await listing.json()).segments.length, 0);
});
