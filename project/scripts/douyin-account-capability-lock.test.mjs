import assert from "node:assert/strict";
import test from "node:test";

import { createControlPlaneHttpServer } from "../backend/http-server.js";
import { DOUYIN_ACCOUNT_CLOUD_RUNTIME_ID } from "../src/salebuddy/agents/marketplace.js";

const ACCOUNT_ID = "douyin-account-1";

function managerTask(state = "running") {
  return {
    key: `mkt-comment-acquisition::manager-task::${ACCOUNT_ID}`,
    state,
    context: {
      agentId: "mkt-comment-acquisition",
      taskId: "manager-task",
      taskRunId: "manager-run",
      conversationId: "manager-conversation",
      accountId: ACCOUNT_ID,
      tenantId: null
    },
    accountIdentity: { uid: ACCOUNT_ID, secUid: "manager-sec-uid" },
    config: { accountIdentity: { uid: ACCOUNT_ID, secUid: "manager-sec-uid" } }
  };
}

function fixture(t, { managerState = "running", prospectService = null, bindings = [] } = {}) {
  const calls = [];
  const registryCalls = [];
  const mcp = {
    configured: true,
    async probeRemoteStatus() {
      registryCalls.push(["probeRemoteStatus"]);
      return { ok: true, login_state: "logged_in", account: { uid: ACCOUNT_ID, sec_uid: "manager-sec-uid" } };
    },
    async status() {
      return { ok: true, login_state: "logged_in", account: { uid: ACCOUNT_ID, sec_uid: "manager-sec-uid" } };
    },
    async startMessageMode() {
      registryCalls.push(["startMessageMode"]);
      return { ok: true, state: "running" };
    },
    async sendPrivateMessage(input) {
      registryCalls.push(["sendPrivateMessage", input]);
      return { ok: true, delivered: true };
    }
  };
  const acquisition = {
    listTasks: () => [managerTask(managerState)],
    status: () => managerTask(managerState),
    createTask(input) {
      calls.push(["createTask", input]);
      return managerTask("configuring");
    }
  };
  const registry = {
    configured: true,
    getService(agentId, scope = {}) {
      registryCalls.push(["getService", agentId, scope]);
      return mcp;
    },
    async status(agentId, scope = {}) {
      registryCalls.push(["status", agentId, scope]);
      return mcp.status();
    },
    async start(agentId, options = {}) {
      registryCalls.push(["start", agentId, options]);
      return { ok: true, state: "STARTING", agentId, accountId: options.accountId || null };
    },
    list: () => bindings
  };
  const inbox = {
    agentId: "mkt-dm-inbox",
    configured: true,
    modelConfigured: true,
    planModelConfigured: true,
    status: () => ({ accountId: ACCOUNT_ID, runtime: { running: false } }),
    async plan() {
      calls.push(["inbox.plan"]);
      return { ok: true, planToken: "signed-plan" };
    },
    async start() {
      calls.push(["inbox.start"]);
      return { ok: true };
    }
  };
  const server = createControlPlaneHttpServer({
    auth: false,
    allowLegacyProductExecution: true,
    douyinAcquisitionService: acquisition,
    douyinAgentCloudRegistry: registry,
    douyinInboxAgentService: inbox,
    prospectService,
    clueHunterService: { configured: false },
    taskDispatcher: { configured: true }
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { calls, registryCalls, server };
}

async function start(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return `http://127.0.0.1:${server.address().port}`;
}

function post(base, path, body) {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

test("different Douyin product Agents use one account-level cloud runtime and reject legacy execution bypasses", async (t) => {
  const { calls, registryCalls, server } = fixture(t);
  const base = await start(server);

  const finder = await post(base, "/v1/douyin/acquisition/tasks", {
    agentId: "mkt-find-people",
    taskId: "finder-task",
    taskRunId: "finder-run",
    conversationId: "finder-conversation",
    accountId: ACCOUNT_ID,
    config: { accountIdentity: { uid: ACCOUNT_ID } }
  });
  assert.equal(finder.status, 201);

  const inbox = await post(base, "/v1/douyin/inbox-agent/plan", {
    agentId: "mkt-dm-inbox",
    accountId: ACCOUNT_ID,
    replyRule: "仅回答已确认的产品信息",
    replyObjective: "确认客户需求",
    replyTone: "简洁",
    businessKnowledge: "测试知识"
  });
  assert.equal(inbox.status, 200);

  const messageMode = await post(base, "/v1/douyin/mcp/start-message-mode", {
    agentId: "mkt-dm-inbox",
    accountId: ACCOUNT_ID
  });
  assert.equal(messageMode.status, 200);

  const outreach = await post(base, "/v1/douyin/mcp/send-private-message", {
    agentId: "mkt-cold-writer",
    accountId: ACCOUNT_ID,
    secUid: "lead-sec-uid",
    content: "你好，想了解一下你的需求。",
    confirm: "SEND"
  });
  assert.equal(outreach.status, 409);
  assert.equal((await outreach.json()).error.code, "CORE_AGENT_GATEWAY_REQUIRED");

  assert.equal(calls[0][0], "createTask");
  assert.equal(calls[1][0], "inbox.plan");
  assert.equal(registryCalls.some(([action]) => action === "sendPrivateMessage"), false);
  assert.ok(registryCalls.some(([action]) => action === "startMessageMode"));
  const cloudAgentIds = registryCalls
    .filter(([action]) => ["getService", "status"].includes(action))
    .map(([, agentId]) => agentId);
  assert.ok(cloudAgentIds.includes(DOUYIN_ACCOUNT_CLOUD_RUNTIME_ID));
  assert.equal(cloudAgentIds.includes("mkt-comment-acquisition"), false);
  assert.equal(cloudAgentIds.includes("mkt-dm-inbox"), false);
  assert.equal(cloudAgentIds.includes("mkt-cold-writer"), false);
});

test("a legacy complete-agent cloud record is compatible with a single-capability Agent", async (t) => {
  const { calls, server } = fixture(t, {
    bindings: [{
      agentId: "mkt-comment-acquisition",
      sessionId: "manager-cloud",
      accountIdentity: { uid: ACCOUNT_ID, secUid: "manager-sec-uid" }
    }]
  });
  const base = await start(server);
  const response = await post(base, "/v1/douyin/acquisition/tasks", {
    agentId: "mkt-find-people",
    taskId: "finder-task",
    taskRunId: "finder-run",
    conversationId: "finder-conversation",
    accountId: ACCOUNT_ID,
    config: { accountIdentity: { uid: ACCOUNT_ID } }
  });
  assert.equal(response.status, 201);
  assert.equal(calls.length, 1);
});

test("a legacy single-capability cloud record is compatible with the complete Agent", async (t) => {
  const { calls, registryCalls, server } = fixture(t, {
    bindings: [{
      agentId: "mkt-douyin-child-capabilities",
      sessionId: "children-cloud",
      accountIdentity: { uid: ACCOUNT_ID, secUid: "manager-sec-uid" }
    }]
  });
  const base = await start(server);
  const manager = await post(base, "/v1/douyin/acquisition/tasks", {
    agentId: "mkt-comment-acquisition",
    accountId: ACCOUNT_ID,
    taskId: "manager-task",
    taskRunId: "manager-run",
    conversationId: "manager-conversation",
    config: { accountIdentity: { uid: ACCOUNT_ID } }
  });
  assert.equal(manager.status, 201);

  const inbox = await post(base, "/v1/douyin/inbox-agent/plan", {
    agentId: "mkt-dm-inbox",
    accountId: ACCOUNT_ID,
    replyRule: "仅回答已确认的产品信息",
    replyObjective: "确认客户需求",
    replyTone: "简洁",
    businessKnowledge: "测试知识"
  });
  assert.equal(inbox.status, 200);
  assert.deepEqual(calls.map(([type]) => type), ["createTask", "inbox.plan"]);
  assert.ok(registryCalls.some(([, agentId]) => agentId === DOUYIN_ACCOUNT_CLOUD_RUNTIME_ID));
});

test("starting from different Douyin product Agents uses one runtime per account", async (t) => {
  const { registryCalls, server } = fixture(t);
  const base = await start(server);

  const first = await post(base, "/v1/douyin/mcp/start", {
    agentId: "mkt-comment-acquisition",
    accountId: ACCOUNT_ID,
    accountIdentity: { uid: ACCOUNT_ID },
    billingPlan: "monthly"
  });
  const second = await post(base, "/v1/douyin/mcp/start", {
    agentId: "mkt-dm-inbox",
    accountId: "douyin-account-2",
    accountIdentity: { uid: "douyin-account-2" },
    billingPlan: "monthly"
  });

  assert.equal(first.status, 202);
  assert.equal(second.status, 202);
  assert.deepEqual(
    registryCalls.filter(([action]) => action === "start").map(([, agentId, options]) => [agentId, options.accountId, options.tenantId]),
    [
      [DOUYIN_ACCOUNT_CLOUD_RUNTIME_ID, ACCOUNT_ID, null],
      [DOUYIN_ACCOUNT_CLOUD_RUNTIME_ID, "douyin-account-2", null]
    ]
  );
});
