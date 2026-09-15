import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeReception, receptionPrompt, receptionWindow, RECEPTION_GOALS } from "../src/salebuddy/agents/account-reception.js";
import { createAccountReceptionStore } from "../backend/account-reception-store.js";
import { createControlPlaneHttpServer } from "../backend/http-server.js";
import { previewReception } from "../backend/account-reception-preview.js";
import { createDouyinInboxAgentService } from "../backend/douyin-inbox-agent-service.js";

test("hours support split shifts, weekdays, timezone and overnight continuation", () => {
  const settings = normalizeReception({ schedule: { mode: "custom", timezone: "Asia/Shanghai", days: [1], intervals: [{ start: "09:00", end: "12:00" }, { start: "14:00", end: "18:00" }] } });
  assert.equal(receptionWindow(settings, "2026-09-07T01:00:00Z").open, true);
  assert.equal(receptionWindow(settings, "2026-09-07T04:00:00Z").open, false);
  assert.equal(receptionWindow(settings, "2026-09-07T06:00:00Z").open, true);
  assert.equal(receptionWindow(settings, "2026-09-08T01:00:00Z").open, false);
  const night = normalizeReception({ schedule: { mode: "custom", timezone: "Asia/Shanghai", days: [1], intervals: [{ start: "22:00", end: "02:00" }] } });
  assert.equal(receptionWindow(night, "2026-09-07T17:00:00Z").open, true);
  assert.equal(receptionWindow(night, "2026-09-07T18:00:00Z").open, false);
});

test("invalid timezone and empty or ambiguous working hours are rejected", () => {
  for (const schedule of [
    { timezone: "not-a-zone" }, { mode: "custom", days: [] },
    { mode: "custom", intervals: [{ start: "25:00", end: "12:00" }] },
    { mode: "custom", intervals: [{ start: "09:00", end: "09:00" }] }
  ]) assert.throws(() => normalizeReception({ schedule }), /接待|时区/);
});

test("reception supports role-specific identities while rejecting unknown identities", () => {
  assert.equal(normalizeReception({ persona: { role: "sales" } }).persona.role, "sales");
  assert.equal(normalizeReception({ persona: { role: "partnership" } }).persona.role, "partnership");
  assert.equal(normalizeReception({ persona: { role: "custom", name: "小林" } }).persona.name, "小林");
  assert.throws(() => normalizeReception({ persona: { role: "invented-role" } }), /不支持/);
});

test("custom persona details survive normalization and shape the reply style", () => {
  const settings = normalizeReception({ persona: { role: "custom", name: "懂装修的邻家顾问", description: "像熟悉的朋友一样自然沟通" } });
  assert.deepEqual(settings.persona, { role: "custom", name: "懂装修的邻家顾问", brand: "", description: "像熟悉的朋友一样自然沟通" });
  assert.match(receptionPrompt(settings), /对外身份：懂装修的邻家顾问/);
  assert.match(receptionPrompt(settings), /表达方式：自定义人设：像熟悉的朋友一样自然沟通/);
});

test("reception identity owns expression while retired tone and address settings are ignored", () => {
  const settings = normalizeReception({ persona: { role: "sales" }, tone: "patient", address: "您" });
  assert.equal("tone" in settings, false);
  assert.equal("address" in settings, false);
  assert.match(receptionPrompt(settings), /表达方式：金牌销售：主动了解需求，推荐合适的产品或方案/);
  assert.doesNotMatch(receptionPrompt(settings), /语气：|称呼对方为/);
});

test("reception goals describe the user's intended conversation outcome", () => {
  assert.deepEqual(RECEPTION_GOALS, {
    answer: "回答问题",
    contact: "留下联系方式",
    appointment: "预约到店",
    survey: "填写问卷"
  });
  assert.equal(normalizeReception().goal, "contact");
  assert.equal(normalizeReception({ goal: "understand" }).goal, "answer");
  assert.equal(normalizeReception({ goal: "answer" }).goal, "answer");
  assert.match(receptionPrompt(normalizeReception({ knowledge: "可确认的业务资料" })), /对话目标：留下联系方式/);
  const answerPrompt = receptionPrompt(normalizeReception({ goal: "answer", knowledge: "可确认的业务资料" }));
  assert.match(answerPrompt, /对话目标：回答问题/);
  assert.match(answerPrompt, /问题解决后不主动引导留资、预约或继续追问/);
});

test("account policy survives restart and shares aliases across Agents but not tenants", t => {
  const dir = mkdtempSync(join(tmpdir(), "reception-")); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, "settings.json");
  const store = createAccountReceptionStore({ stateFile: path });
  const owner = { tenantId: "tenant-a", account: { uid: "123", secUid: "sec-123" } };
  store.save(owner, { persona: { role: "shop", name: "小林", brand: "测试店" }, knowledge: "营业时间9点至18点" }, 0);
  const restored = createAccountReceptionStore({ stateFile: path });
  assert.equal(restored.get({ tenantId: "tenant-a", account: { secUid: "sec-123" } }).settings.persona.name, "小林");
  assert.equal(restored.get({ tenantId: "tenant-b", account: { uid: "123" } }).revision, 0);
  assert.throws(() => restored.save(owner, {}, 0), error => error.code === "RECEPTION_VERSION_CONFLICT");
  assert.equal(restored.get(owner).settings.knowledge, "营业时间9点至18点");
});

test("human takeover and sent message reservations are shared across account aliases", t => {
  const dir = mkdtempSync(join(tmpdir(), "reception-control-")); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const store = createAccountReceptionStore({ stateFile: join(dir, "settings.json") });
  const owner = { account: { uid: "123", secUid: "sec-123" } };
  store.save(owner, {}, 0);
  store.control(owner, "customer", "human");
  assert.equal(store.conversation({ account: { secUid: "sec-123" } }, "customer").mode, "human");
  assert.equal(store.reserve(owner, "reply:message-1"), true);
  assert.equal(store.reserve(owner, "reply:message-1"), false);
  store.control(owner, "customer", "auto");
  assert.equal(store.conversation(owner, "customer").mode, "auto");
});

test("private reception keeps the active runtime owner when an old Agent stops late", t => {
  const dir = mkdtempSync(join(tmpdir(), "reception-owner-")); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const store = createAccountReceptionStore({ stateFile: join(dir, "settings.json") });
  const owner = { account: { uid: "123" } };
  store.save(owner, {}, 0);
  store.enablePrivateReception(owner, { agentId: "mkt-comment-acquisition" });
  store.enablePrivateReception(owner, { agentId: "mkt-dm-inbox" });

  store.stopPrivateReception(owner, { agentId: "mkt-comment-acquisition" });
  const current = store.get(owner).privateReception;
  assert.equal(current.runtimeState, "running");
  assert.equal(current.activeAgentId, "mkt-dm-inbox");

  store.stopPrivateReception(owner, { agentId: "mkt-dm-inbox" });
  const stopped = store.get(owner).privateReception;
  assert.equal(stopped.runtimeState, "stopped");
  assert.equal(stopped.activeAgentId, null);
});

test("HTTP policy uses verified account aliases and rejects unknown accounts and stale saves", async t => {
  const dir = mkdtempSync(join(tmpdir(), "reception-http-"));
  const store = createAccountReceptionStore({ stateFile: join(dir, "settings.json") });
  const server = createControlPlaneHttpServer({ auth: false, accountReceptionStore: store, douyinAgentCloudRegistry: { list: () => [{ agentId: "mkt-dm-inbox", accountIdentity: { uid: "123", secUid: "sec-123" } }], getService: () => ({ configured: true }) } });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}/v1/accounts/reception`;
  const preflight = await fetch(base, { method: "OPTIONS", headers: { origin: "http://127.0.0.1:8888", "access-control-request-method": "PUT" } });
  assert.match(preflight.headers.get("access-control-allow-methods") || "", /PUT/);
  const recoveredRendererPreflight = await fetch(base, { method: "OPTIONS", headers: { origin: "http://127.0.0.1:18888", "access-control-request-method": "PUT" } });
  assert.equal(recoveredRendererPreflight.headers.get("access-control-allow-origin"), "http://127.0.0.1:18888");
  assert.equal((await fetch(`${base}?accountId=other`)).status, 404);
  const save = () => fetch(base, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ accountId: "123", expectedRevision: 0, settings: { knowledge: "预约周一开放" } }) });
  assert.equal((await save()).status, 200);
  assert.equal((await fetch(`${base}?accountId=sec-123`).then(r => r.json())).settings.knowledge, "预约周一开放");
  assert.equal((await save()).status, 409);
});

test("Douyin account directory separates saved reception settings from enabled private reception", async t => {
  const dir = mkdtempSync(join(tmpdir(), "reception-directory-"));
  const store = createAccountReceptionStore({ stateFile: join(dir, "settings.json") });
  const registry = {
    list: () => [
      { agentId: "mkt-comment-acquisition", sessionId: "session-1", status: "online", accountIdentity: { uid: "configured", nickname: "已配置账号" } },
      { agentId: "mkt-dm-inbox", sessionId: "session-2", status: "online", accountIdentity: { uid: "new", nickname: "未配置账号" } }
    ],
    getService: () => ({ configured: true })
  };
  store.save({ account: { uid: "configured" } }, { knowledge: "只卖椅子" }, 0);
  const server = createControlPlaneHttpServer({ auth: false, accountReceptionStore: store, douyinAgentCloudRegistry: registry });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); rmSync(dir, { recursive: true, force: true }); });

  const response = await fetch(`http://127.0.0.1:${server.address().port}/v1/connectors/douyin/accounts`);
  const accounts = (await response.json()).accounts;
  assert.equal(response.status, 200);
  assert.deepEqual(
    accounts.find(account => account.identity.uid === "configured")?.capabilityMatrix
      ?.map(({ agentId, binding }) => [agentId, binding]),
      [
        ["mkt-comment-acquisition", "account_cloud"],
        ["mkt-find-people", "account_cloud"],
        ["mkt-intent-analyst", "account_cloud"],
        ["mkt-cold-writer", "account_cloud"],
        ["mkt-dm-inbox", "account_cloud"],
        ["mkt-gold-customer-service", "account_cloud"],
        ["mkt-live-danmaku-analysis", "account_cloud"]
      ]
  );
  assert.equal(accounts.find(account => account.identity.uid === "configured")?.receptionConfigured, true);
  assert.equal(accounts.find(account => account.identity.uid === "new")?.receptionConfigured, false);
  assert.equal(accounts.find(account => account.identity.uid === "configured")?.privateReceptionEnabled, false);
  store.enablePrivateReception({ account: { uid: "configured" } }, { agentId: "mkt-dm-inbox" });
  const refreshed = (await fetch(`http://127.0.0.1:${server.address().port}/v1/connectors/douyin/accounts`).then(result => result.json())).accounts;
  assert.equal(refreshed.find(account => account.identity.uid === "configured")?.privateReceptionEnabled, true);
  assert.equal(refreshed.find(account => account.identity.uid === "configured")?.privateReceptionRuntimeState, "running");
  assert.deepEqual(refreshed.find(account => account.identity.uid === "configured")?.privateReception?.agentIds, ["mkt-dm-inbox"]);
  store.stopPrivateReception({ account: { uid: "configured" } }, { agentId: "mkt-dm-inbox" });
  const stopped = (await fetch(`http://127.0.0.1:${server.address().port}/v1/connectors/douyin/accounts`).then(result => result.json())).accounts;
  assert.equal(stopped.find(account => account.identity.uid === "configured")?.privateReceptionEnabled, true);
  assert.equal(stopped.find(account => account.identity.uid === "configured")?.privateReceptionRuntimeState, "stopped");
});

test("获客专家 chat strategy request requires confirmation before it persists the account reception policy", async t => {
  const dir = mkdtempSync(join(tmpdir(), "reception-chat-update-"));
  const store = createAccountReceptionStore({ stateFile: join(dir, "settings.json") });
  const server = createControlPlaneHttpServer({
    auth: false,
    // This test exercises the strategy-chat path, not product task execution.
    // Keep its legacy execution dependency out of scope.
    allowLegacyProductExecution: true,
    agentStoreRoot: join(dir, "agent-store"),
    accountReceptionStore: store,
    douyinAgentCloudRegistry: {
      list: () => [{ agentId: "mkt-comment-acquisition", accountIdentity: { uid: "123", secUid: "sec-123" } }],
      getService: () => ({ configured: true })
    }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); rmSync(dir, { recursive: true, force: true }); });

  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${base}/v1/direct-messages`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      agentType: "mkt-comment-acquisition",
      from: "user",
      fromName: "我",
      text: "私信回复简短一点，以留下联系方式为目标"
    })
  });

  const responseBody = await response.json();
  assert.equal(response.status, 201, JSON.stringify(responseBody));
  assert.equal(store.get({ account: { uid: "123" } }).revision, 0);

  const proposed = await fetch(`${base}/v1/direct-messages?agentType=mkt-comment-acquisition`).then(result => result.json());
  const proposal = proposed.data.messages.at(-1);
  assert.equal(proposal.fromName, "获客专家");
  assert.match(proposal.text, /确认后，之后收到的新私信会按这个方式回复/);
  assert.equal(proposal.metadata?.receptionStrategyProposal?.status, "pending");

  const confirmation = await fetch(`${base}/v1/direct-messages`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      agentType: "mkt-comment-acquisition",
      from: "user",
      fromName: "我",
      text: "确认"
    })
  });
  assert.equal(confirmation.status, 201, await confirmation.text());
  assert.equal(store.get({ account: { uid: "123" } }).revision, 1);
  assert.equal(store.get({ account: { secUid: "sec-123" } }).settings.length, "short");
  assert.equal(store.get({ account: { secUid: "sec-123" } }).settings.goal, "contact");
  const messages = await fetch(`${base}/v1/direct-messages?agentType=mkt-comment-acquisition`).then(result => result.json());
  assert.equal(messages.data.messages.at(-1).fromName, "获客专家");
  assert.match(messages.data.messages.at(-1).text, /已按你的确认保存这个账号的私信接待回复长度改为“简短一点”，对话目标改为“留下联系方式”/);
});

test("同一个授权账号只能由一个私信承接 Agent 运行", async t => {
  const dir = mkdtempSync(join(tmpdir(), "reception-start-enable-"));
  const store = createAccountReceptionStore({ stateFile: join(dir, "settings.json") });
  const managerRuntime = { running: false };
  let managerStartContext = null;
  let pollAttempts = 0;
  const managerService = {
    agentId: "mkt-comment-acquisition",
    configured: true,
    modelConfigured: true,
    status: () => ({
      runtime: { ...managerRuntime },
      accountId: "account-1",
      taskId: managerStartContext?.taskId || null,
      taskRunId: managerStartContext?.taskRunId || null,
      conversationId: managerStartContext?.conversationId || null
    }),
    async start(options) {
      managerStartContext = options;
      managerRuntime.running = true;
      return { ok: true, runtime: { ...managerRuntime } };
    },
    async stop() { managerRuntime.running = false; return { ok: true }; },
    async pollOnce() { pollAttempts += 1; return { ok: true }; },
    startStatus: () => ({ state: "accepted" })
  };
  const mcp = {
    configured: true,
    async status() {
      return { ok: true, login_state: "logged_in", account: { uid: "account-1", sec_uid: "sender-1" } };
    }
  };
  const registry = {
    configured: true,
    getService: () => mcp,
    async status() {
      return { ok: true, login_state: "logged_in", account: { uid: "account-1", sec_uid: "sender-1" } };
    },
    list: () => []
  };
  const server = createControlPlaneHttpServer({
    auth: false,
    allowLegacyProductExecution: true,
    accountReceptionStore: store,
    douyinInboxAgentService: managerService,
    douyinAgentCloudRegistry: registry
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;

  const started = await fetch(`${base}/v1/douyin/inbox-agent/start`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      agentId: "mkt-comment-acquisition",
      accountId: "account-1",
      accountName: "测试账号",
      planToken: "signed-plan",
      startRequestId: "manager-inbox-start",
      startPolling: false
    })
  });
  const startedBody = await started.json();
  assert.equal(started.status, 200, JSON.stringify(startedBody));
  assert.ok(startedBody.taskId);
  assert.ok(startedBody.taskRunId);
  assert.ok(startedBody.conversationId);
  const runtimeTask = server.controlPlane.getTaskSnapshot(startedBody.taskId);
  assert.equal(runtimeTask.state, "RUNNING");
  assert.equal(runtimeTask.agentId, "mkt-comment-acquisition");
  assert.equal(runtimeTask.executionContext.accountId, "account-1");
  assert.equal(store.get({ account: { uid: "account-1" } }).privateReception.enabled, true);
  assert.equal(store.get({ account: { uid: "account-1" } }).privateReception.runtimeState, "running");
  assert.deepEqual(store.get({ account: { sec_uid: "sender-1" } }).privateReception.agentIds, ["mkt-comment-acquisition"]);

  const duplicate = await fetch(`${base}/v1/douyin/inbox-agent/poll`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ agentId: "mkt-dm-inbox", accountId: "account-1" })
  });
  const body = await duplicate.json();
  assert.equal(duplicate.status, 409);
  assert.equal(body.error.code, "INBOX_RUNTIME_OWNER_ACTIVE");
  assert.match(body.error.message, /获客专家/);

  const stopped = await fetch(`${base}/v1/douyin/inbox-agent/stop`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ agentId: "mkt-comment-acquisition", accountId: "account-1", confirm: "STOP" })
  });
  assert.equal(stopped.status, 200, await stopped.text());
  assert.equal(server.controlPlane.getTaskSnapshot(startedBody.taskId).state, "CANCELLED");
  const reception = store.get({ account: { uid: "account-1" } }).privateReception;
  assert.equal(reception.enabled, true);
  assert.equal(reception.runtimeState, "stopped");

  const idlePoll = await fetch(`${base}/v1/douyin/inbox-agent/poll`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ agentId: "mkt-comment-acquisition", accountId: "account-1" })
  });
  const idlePollBody = await idlePoll.json();
  assert.equal(idlePoll.status, 409);
  assert.equal(idlePollBody.error.code, "INBOX_RUNTIME_NOT_STARTED");
  assert.equal(pollAttempts, 0);
});

test("preview uses the same persona and knowledge without any send transport", async () => {
  let input;
  const result = await previewReception({ settings: { persona: { name: "小林", role: "adviser" }, knowledge: "预约周一开放", schedule: { mode: "always" } }, message: "怎么预约" }, {
    env: { BYERING_LLM_API_KEY: "test" },
    fetchImpl: async (_url, options) => { input = JSON.parse(options.body); return { ok: true, text: async () => JSON.stringify({ choices: [{ message: { content: JSON.stringify({ content: "周一可以预约，你方便什么时候沟通？", send: true }) } }] }) }; }
  });
  assert.equal(result.sent, false); assert.equal(result.action, "reply");
  assert.match(input.messages[0].content, /小林/); assert.match(input.messages[0].content, /预约周一开放/);
});

test("two Agents read updated account rules instead of their task-local tone or knowledge", async t => {
  const dir = mkdtempSync(join(tmpdir(), "reception-agents-"));
  const store = createAccountReceptionStore({ stateFile: join(dir, "settings.json") });
  const owner = { account: { uid: "owner", secUid: "owner-sec" } };
  store.save(owner, { knowledge: "只卖桌子", persona: { name: "小林" }, habits: { mergeSeconds: 0 } }, 0);
  const calls = [];
  const create = agentId => {
    let seq = 0;
    return createDouyinInboxAgentService({ agentId, stateFile: join(dir, `${agentId}.json`), receptionStore: store,
      douyinMcpService: { configured: true, startMessageMode: async () => ({ ok: true }), pullMessages: async () => ({ messages: [{ msg_id: `${agentId}-${++seq}`, sec_uid: `customer-${agentId}`, content: "你好" }], next_cursor: seq }), sendMessage: async () => ({ ok: true }) },
      replyGenerator: async (_message, details) => { calls.push(details.context); return { content: "你好，想了解哪款桌子？", send: true }; }
    });
  };
  const inbox = create("mkt-dm-inbox"), acquisition = create("mkt-comment-acquisition");
  t.after(async () => { await inbox.stop(); await acquisition.stop(); rmSync(dir, { recursive: true, force: true }); });
  await inbox.startManaged({ accountId: "owner", accountIdentity: owner.account, startPolling: false, replyTone: "must not win", businessKnowledge: "错误业务资料" });
  await acquisition.startManaged({ accountId: "owner-sec", accountIdentity: { secUid: "owner-sec" }, startPolling: false });
  await inbox.pollOnce(); await acquisition.pollOnce();
  assert.ok(calls.every(call => call.knowledgeContext === "只卖桌子" && call.replyRule.includes("小林")));
  const saved = store.get(owner); store.save(owner, { ...saved.settings, persona: { ...saved.settings.persona, name: "小李" }, knowledge: "只卖椅子" }, saved.revision);
  await inbox.pollOnce(); await acquisition.pollOnce();
  assert.ok(calls.slice(-2).every(call => call.knowledgeContext === "只卖椅子" && call.replyRule.includes("小李")));
});
