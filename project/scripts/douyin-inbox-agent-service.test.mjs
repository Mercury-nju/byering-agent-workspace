import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDouyinInboxAgentService } from "../backend/douyin-inbox-agent-service.js";

function fakeMcp() {
  const calls = [];
  let queue = [{ msg_id: "in-1", conversation_id: "c-1", nickname: "客户", content: "你好" }];
  return {
    calls,
    configured: true,
    async startMessageMode() { calls.push("start"); return { ok: true }; },
    async pullMessages({ cursor }) { calls.push({ cursor }); const batch = queue; queue = []; return { ok: true, messages: batch, next_cursor: cursor + batch.length }; },
    async sendMessage(payload) { calls.push({ send: payload }); return { ok: true }; },
    async status() { return { login_state: "logged_in", account: { id: "account-1" } }; }
  };
}

function completePlanInput(overrides = {}) {
  return {
    accountId: "account-1",
    accountName: "测试账号",
    replyRule: "产品功能、使用方法和服务范围可以直接回答。",
    replyObjective: "先解决问题，再确认需求并推进下一步。",
    replyTone: "专业、简短、自然。",
    businessKnowledge: "标准版支持 3 个账号，服务时间为工作日 9:00-18:00。",
    handoffRules: ["价格谈判", "投诉退款", "无法确认的事实"],
    ...overrides
  };
}

function completeModelPlan(overrides = {}) {
  return {
    summary: "先解决用户问题，再根据需求推进，超出已知事实时转人工。",
    directAnswerScope: ["产品功能", "使用方法", "服务范围"],
    responsePriorities: ["先回答当前问题", "一次只推进一个下一步"],
    conversationObjective: "确认需求并推进下一步",
    handoffRules: ["价格谈判", "投诉退款", "无法确认的事实"],
    allowedFacts: [
      { fact: "标准版支持 3 个账号", sourceId: "task-business-knowledge" },
      { fact: "服务时间为工作日 9:00-18:00", sourceId: "task-business-knowledge" }
    ],
    exampleReplies: ["你好，标准版支持 3 个账号。你目前主要想解决哪类使用问题？"],
    knowledgeGaps: [],
    ...overrides
  };
}

test("managed replies give the model both sides of the previous conversation", async t => {
  const directory = await mkdtemp(join(tmpdir(), "byering-inbox-history-"));
  const mcp = fakeMcp();
  let batch = 0;
  mcp.pullMessages = async () => ({ ok: true, next_cursor: ++batch, messages: [{ msg_id: `history-${batch}`, conversation_id: "history", sec_uid: "person", content: batch === 1 ? "你好" : "明天下午" }] });
  const requests = [];
  const service = createDouyinInboxAgentService({ douyinMcpService: mcp, stateFile: join(directory, "inbox.json"), env: { BYERING_LLM_API_KEY: "test" },
    fetchImpl: async (_url, options) => { requests.push(JSON.parse(options.body)); return { ok: true, text: async () => JSON.stringify({ choices: [{ message: { content: "你方便什么时间沟通？" } }] }) }; }
  });
  t.after(() => service.stop());
  await service.startManaged({ ...completePlanInput(), startPolling: false });
  await service.pollOnce({ waitMs: 0 });
  await service.pollOnce({ waitMs: 0 });
  assert.deepEqual(requests[1].messages.slice(1).map(({ role, content }) => ({ role, content })), [
    { role: "user", content: "你好" }, { role: "assistant", content: "你方便什么时间沟通？" }, { role: "user", content: "明天下午" }
  ]);
});

async function startWithConfirmedPlan(service, overrides = {}, startRequestId = `start-${Math.random().toString(36).slice(2)}`) {
  const input = completePlanInput(overrides);
  const planned = await service.plan(input);
  return service.start({ ...input, planToken: planned.planToken, startRequestId });
}

test("inbox preflight rejects incomplete setup without starting the MCP runtime", async () => {
  const mcp = fakeMcp();
  const service = createDouyinInboxAgentService({
    douyinMcpService: mcp,
    env: { BYERING_LLM_API_KEY: "test-key", BYERING_INBOX_PLAN_SIGNING_SECRET: "test-signing-secret-32-bytes-long" },
    planGenerator: async () => completeModelPlan()
  });

  await assert.rejects(() => service.plan({ accountId: "account-1" }), (error) => {
    assert.equal(error.code, "DOUYIN_INBOX_PLAN_INVALID_CONFIG");
    assert.equal(error.statusCode, 400);
    assert.ok(error.details.fieldErrors.businessKnowledge);
    assert.ok(error.details.fieldErrors.replyRule);
    return true;
  });
  assert.deepEqual(mcp.calls, []);
});

test("managed inbox startup runs the real auto-reply runtime without a second user confirmation", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-inbox-managed-"));
  const mcp = fakeMcp();
  const service = createDouyinInboxAgentService({
    douyinMcpService: mcp,
    stateFile: join(directory, "inbox.json"),
    env: { BYERING_LLM_API_KEY: "test-key" },
    replyGenerator: async () => ({ content: "你好，请问你想具体了解哪方面？", send: true })
  });

  const started = await service.startManaged({
    ...completePlanInput(),
    startPolling: false,
    accountCoordinationKey: "douyin:account-1"
  });
  assert.equal(started.runtime.running, true);
  assert.equal(started.runtime.accountId, "account-1");
  assert.equal(mcp.calls[0], "start");

  const polled = await service.pollOnce({ waitMs: 0 });
  assert.equal(polled.count, 1);
  assert.equal(polled.outcomes[0].status, "sent");
  assert.equal(mcp.calls.some((call) => call?.send?.content === "你好，请问你想具体了解哪方面？"), true);
});

test("managed inbox replies publish a control-plane-ready success event with execution context", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-inbox-events-"));
  const mcp = fakeMcp();
  const mirrored = [];
  const service = createDouyinInboxAgentService({
    douyinMcpService: mcp,
    stateFile: join(directory, "inbox.json"),
    env: { BYERING_LLM_API_KEY: "test-key" },
    replyGenerator: async () => ({ content: "收到，我来帮你看看。", send: true }),
    eventSink: (event) => mirrored.push(event)
  });

  await service.startManaged({
    ...completePlanInput(),
    startPolling: false,
    taskId: "inbox-task-1",
    taskRunId: "inbox-run-1",
    conversationId: "inbox-conversation-1"
  });
  await service.pollOnce({ waitMs: 0 });

  const reply = mirrored.find((event) => event.type === "reply.sent");
  assert.ok(reply);
  assert.equal(reply.taskId, "inbox-task-1");
  assert.equal(reply.taskRunId, "inbox-run-1");
  assert.equal(reply.conversationId, "inbox-conversation-1");
  assert.equal(reply.messageId, "in-1");
  assert.equal(reply.deliveryState, "sent");
});

test("injected inbox services can receive the server-owned event sink", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-inbox-event-sink-"));
  const mcp = fakeMcp();
  const mirrored = [];
  const service = createDouyinInboxAgentService({
    douyinMcpService: mcp,
    stateFile: join(directory, "inbox.json"),
    env: { BYERING_LLM_API_KEY: "test-key" },
    replyGenerator: async () => ({ content: "收到，我来帮你看看。", send: true })
  });
  service.setEventSink((event) => mirrored.push(event));

  await service.startManaged({
    ...completePlanInput(),
    startPolling: false,
    taskId: "inbox-injected-task",
    taskRunId: "inbox-injected-run"
  });
  await service.pollOnce({ waitMs: 0 });

  assert.ok(mirrored.some((event) => event.type === "reply.sent"));
});

test("inbox preflight returns a signed model plan and does not start message mode", async () => {
  const mcp = fakeMcp();
  const service = createDouyinInboxAgentService({
    douyinMcpService: mcp,
    env: { BYERING_LLM_API_KEY: "test-key", BYERING_INBOX_PLAN_SIGNING_SECRET: "test-signing-secret-32-bytes-long" },
    now: () => Date.parse("2026-09-04T08:00:00.000Z"),
    planGenerator: async () => completeModelPlan()
  });

  const result = await service.plan(completePlanInput());
  assert.equal(result.confirmable, true);
  assert.equal(result.plan.source, "model");
  assert.equal(result.plan.model != null, true);
  assert.equal(result.plan.generatedAt, "2026-09-04T08:00:00.000Z");
  assert.match(result.planToken, /^[^.]+\.[^.]+$/);
  assert.deepEqual(mcp.calls, []);
});

test("inbox preflight repairs one invalid model plan before returning a signed plan", async () => {
  const outputs = [
    { summary: "缺少必要字段" },
    completeModelPlan()
  ];
  const attempts = [];
  const service = createDouyinInboxAgentService({
    douyinMcpService: fakeMcp(),
    env: { BYERING_LLM_API_KEY: "test-key", BYERING_INBOX_PLAN_SIGNING_SECRET: "test-signing-secret-32-bytes-long" },
    planGenerator: async (input) => {
      attempts.push(input);
      return outputs.shift();
    }
  });

  const result = await service.plan(completePlanInput());

  assert.equal(result.confirmable, true);
  assert.equal(attempts.length, 2);
  assert.equal(attempts[1].repairAttempt, 1);
  assert.match(attempts[1].validationError, /missing/i);
});

test("inbox preflight fails closed after two invalid model plans", async () => {
  let calls = 0;
  const mcp = fakeMcp();
  const service = createDouyinInboxAgentService({
    douyinMcpService: mcp,
    env: { BYERING_LLM_API_KEY: "test-key", BYERING_INBOX_PLAN_SIGNING_SECRET: "test-signing-secret-32-bytes-long" },
    planGenerator: async () => {
      calls += 1;
      return { summary: "仍然缺少必要字段" };
    }
  });

  await assert.rejects(() => service.plan(completePlanInput()), { code: "DOUYIN_INBOX_PLAN_UNAVAILABLE" });
  assert.equal(calls, 2);
  assert.deepEqual(mcp.calls, []);
});

test("inbox preflight falls back to a signed baseline when the plan provider times out", async () => {
  const service = createDouyinInboxAgentService({
    douyinMcpService: fakeMcp(),
    env: { BYERING_LLM_API_KEY: "test-key", BYERING_INBOX_PLAN_SIGNING_SECRET: "test-signing-secret-32-bytes-long" },
    planGenerator: async () => {
      throw Object.assign(new Error("provider timed out"), { code: "DOUYIN_INBOX_PLAN_MODEL_TIMEOUT" });
    }
  });

  const result = await service.plan(completePlanInput());

  assert.equal(result.confirmable, true);
  assert.equal(result.plan.source, "configuration");
  assert.equal(result.plan.provider, "local-policy");
  assert.match(result.planToken, /^[^.]+\.[^.]+$/);
});

test("client knowledgeContext cannot bypass required business knowledge", async () => {
  const service = createDouyinInboxAgentService({
    douyinMcpService: fakeMcp(),
    env: { BYERING_LLM_API_KEY: "test-key", BYERING_INBOX_PLAN_SIGNING_SECRET: "test-signing-secret-32-bytes-long" },
    planGenerator: async () => completeModelPlan()
  });

  await assert.rejects(() => service.plan(completePlanInput({
    businessKnowledge: "",
    knowledgeContext: "客户端伪造的业务知识"
  })), (error) => {
    assert.equal(error.code, "DOUYIN_INBOX_PLAN_INVALID_CONFIG");
    assert.ok(error.details.fieldErrors.businessKnowledge);
    return true;
  });
});

test("inbox start rejects forged, expired, and stale plan tokens", async () => {
  let clock = Date.parse("2026-09-04T08:00:00.000Z");
  const service = createDouyinInboxAgentService({
    douyinMcpService: fakeMcp(),
    env: { BYERING_LLM_API_KEY: "test-key", BYERING_INBOX_PLAN_SIGNING_SECRET: "test-signing-secret-32-bytes-long" },
    now: () => clock,
    planGenerator: async () => completeModelPlan()
  });
  const planned = await service.plan(completePlanInput());

  await assert.rejects(() => service.start({ ...completePlanInput(), planToken: `${planned.planToken}x`, startRequestId: "start-forged" }), { code: "DOUYIN_INBOX_PLAN_TOKEN_INVALID" });
  await assert.rejects(() => service.start({ ...completePlanInput({ replyTone: "活泼" }), planToken: planned.planToken, startRequestId: "start-stale" }), { code: "DOUYIN_INBOX_PLAN_STALE" });
  clock += 31 * 60 * 1000;
  await assert.rejects(() => service.start({ ...completePlanInput(), planToken: planned.planToken, startRequestId: "start-expired" }), { code: "DOUYIN_INBOX_PLAN_EXPIRED" });
});

test("blocking plan gaps cannot be started", async () => {
  const service = createDouyinInboxAgentService({
    douyinMcpService: fakeMcp(),
    env: { BYERING_LLM_API_KEY: "test-key", BYERING_INBOX_PLAN_SIGNING_SECRET: "test-signing-secret-32-bytes-long" },
    planGenerator: async () => completeModelPlan({ knowledgeGaps: [{ severity: "blocking", field: "businessKnowledge", message: "缺少服务范围" }] })
  });
  const planned = await service.plan(completePlanInput());
  assert.equal(planned.confirmable, false);
  await assert.rejects(() => service.start({ ...completePlanInput(), planToken: planned.planToken, startRequestId: "start-blocked" }), { code: "DOUYIN_INBOX_PLAN_NOT_CONFIRMABLE" });
});

test("accepted inbox starts are idempotent across service recreation", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-inbox-preflight-"));
  const stateFile = join(directory, "state.json");
  const env = { BYERING_LLM_API_KEY: "test-key", BYERING_INBOX_PLAN_SIGNING_SECRET: "test-signing-secret-32-bytes-long" };
  const mcp = fakeMcp();
  const service = createDouyinInboxAgentService({ douyinMcpService: mcp, stateFile, env, replyGenerator: async () => "收到。", planGenerator: async () => completeModelPlan() });
  const planned = await service.plan(completePlanInput());
  const first = await service.start({ ...completePlanInput(), planToken: planned.planToken, startRequestId: "start-once", startPolling: false });
  assert.equal(first.startStatus.state, "running");
  assert.equal(mcp.calls.filter((entry) => entry === "start").length, 1);

  const recreated = createDouyinInboxAgentService({ douyinMcpService: mcp, stateFile, env, replyGenerator: async () => "收到。", planGenerator: async () => completeModelPlan() });
  const recovered = await recreated.start({ ...completePlanInput(), planToken: planned.planToken, startRequestId: "start-once", startPolling: false });
  assert.equal(recovered.startStatus.state, "running");
  assert.equal(mcp.calls.filter((entry) => entry === "start").length, 1);
  assert.equal(recreated.startStatus("start-once").state, "running");
});

test("saved running inbox resumes its local runtime after service recreation", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-inbox-resume-"));
  const stateFile = join(directory, "state.json");
  const env = { BYERING_LLM_API_KEY: "test-key", BYERING_INBOX_PLAN_SIGNING_SECRET: "test-signing-secret-32-bytes-long" };
  const mcp = fakeMcp();
  const first = createDouyinInboxAgentService({
    douyinMcpService: mcp,
    stateFile,
    env,
    replyGenerator: async () => "收到。",
    planGenerator: async () => completeModelPlan()
  });
  const started = await startWithConfirmedPlan(first, { startPolling: false }, "resume-start");

  const recreated = createDouyinInboxAgentService({
    douyinMcpService: mcp,
    stateFile,
    env,
    replyGenerator: async () => "收到。",
    planGenerator: async () => completeModelPlan()
  });
  const resumed = await recreated.resumeSaved({
    accountIdentity: { uid: "account-1", nickname: "测试账号" },
    startPolling: false
  });

  assert.equal(resumed.runtime.running, true);
  assert.equal(resumed.runtime.accountId, "account-1");
  assert.equal(resumed.runtime.accountName, "测试账号");
  assert.equal(resumed.taskId, started.taskId);
  assert.equal(resumed.taskRunId, started.taskRunId);
  assert.equal(resumed.conversationId, started.conversationId);
  assert.equal(mcp.calls.filter(entry => entry === "start").length, 2);
});

test("a stopped inbox start is not resumed after service recreation", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-inbox-stopped-resume-"));
  const stateFile = join(directory, "state.json");
  const env = { BYERING_LLM_API_KEY: "test-key", BYERING_INBOX_PLAN_SIGNING_SECRET: "test-signing-secret-32-bytes-long" };
  const mcp = fakeMcp();
  const first = createDouyinInboxAgentService({
    douyinMcpService: mcp,
    stateFile,
    env,
    replyGenerator: async () => "收到。",
    planGenerator: async () => completeModelPlan()
  });
  await startWithConfirmedPlan(first, { startPolling: false }, "stopped-resume-start");
  await first.stop();

  const recreated = createDouyinInboxAgentService({
    douyinMcpService: mcp,
    stateFile,
    env,
    replyGenerator: async () => "收到。",
    planGenerator: async () => completeModelPlan()
  });
  const resumed = await recreated.resumeSaved({
    accountIdentity: { uid: "account-1", nickname: "测试账号" },
    startPolling: false
  });

  assert.equal(first.startStatus("stopped-resume-start").state, "stopped");
  assert.equal(resumed.runtime, null);
  assert.equal(mcp.calls.filter(entry => entry === "start").length, 1);
});

test("a restarted service can stop a durable inbox task before its local runtime is recreated", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-inbox-stop-restored-"));
  const stateFile = join(directory, "state.json");
  const env = { BYERING_LLM_API_KEY: "test-key", BYERING_INBOX_PLAN_SIGNING_SECRET: "test-signing-secret-32-bytes-long" };
  const mcp = fakeMcp();
  const first = createDouyinInboxAgentService({
    douyinMcpService: mcp,
    stateFile,
    env,
    replyGenerator: async () => "收到。",
    planGenerator: async () => completeModelPlan()
  });
  const started = await startWithConfirmedPlan(first, { startPolling: false }, "stop-restored-start");

  const recreated = createDouyinInboxAgentService({
    douyinMcpService: mcp,
    stateFile,
    env,
    replyGenerator: async () => "收到。",
    planGenerator: async () => completeModelPlan()
  });
  const stopped = await recreated.stop({ taskId: started.taskId, accountId: "account-1" });

  assert.equal(recreated.startStatus("stop-restored-start").state, "stopped");
  assert.equal(stopped.taskId, started.taskId);
  assert.equal(stopped.runtime, null);
  assert.equal(recreated.canResumeSaved(), false);
});

test("stopping an old inbox task never stops a newer active runtime", async t => {
  const directory = await mkdtemp(join(tmpdir(), "byering-inbox-stop-boundary-"));
  const service = createDouyinInboxAgentService({
    douyinMcpService: fakeMcp(),
    stateFile: join(directory, "state.json"),
    env: { BYERING_LLM_API_KEY: "test-key" },
    replyGenerator: async () => "收到。"
  });
  t.after(() => service.stop());

  await service.startManaged({
    ...completePlanInput(),
    startPolling: false,
    taskId: "newer-inbox-task",
    taskRunId: "newer-inbox-run"
  });
  const stopped = await service.stop({ taskId: "older-inbox-task", accountId: "account-1" });

  assert.equal(stopped.stopOutcome.runtimeTaskMatched, false);
  assert.equal(stopped.stopOutcome.runtimeStopped, false);
  assert.equal(service.status().runtime.running, true);
  assert.equal(service.status().taskId, "newer-inbox-task");
});

test("service always auto-sends safe inbox replies and exposes no approval drafts", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-inbox-"));
  const mcp = fakeMcp();
  const service = createDouyinInboxAgentService({
    douyinMcpService: mcp,
    stateFile: join(directory, "state.json"),
    replyGenerator: async () => "收到，我来帮你。",
    planGenerator: async () => completeModelPlan(),
    env: { BYERING_LLM_API_KEY: "test-key", BYERING_INBOX_PLAN_SIGNING_SECRET: "test-signing-secret-32-bytes-long" }
  });
  await startWithConfirmedPlan(service, { startPolling: false }, "draft-start");
  await service.pollOnce({ waitMs: 0 });
  assert.deepEqual(service.listDrafts(), []);
  assert.equal(mcp.calls.filter((entry) => entry.send).length, 1);
  assert.equal(mcp.calls.find((entry) => entry.send).send.reqId, "douyin-inbox:in-1");
  await assert.rejects(() => service.sendDraft("draft:in-1"), { code: "DOUYIN_MANUAL_REPLY_DISABLED" });
  const saved = JSON.parse(await readFile(join(directory, "state.json"), "utf8"));
  assert.equal(saved.cursor, 1);
  assert.equal(saved.autoReply, true);
});

test("automatic inbox replies use the account queue even when manual mode is requested", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-inbox-priority-"));
  const mcp = fakeMcp();
  const coordinationCalls = [];
  const service = createDouyinInboxAgentService({
    douyinMcpService: mcp,
    accountActionCoordinator: {
      async runInbox(accountKey, operation, metadata) {
        coordinationCalls.push({ accountKey, metadata });
        return operation();
      }
    },
    stateFile: join(directory, "state.json"),
    replyGenerator: async () => "收到，我来帮你。",
    planGenerator: async () => completeModelPlan(),
    env: { BYERING_LLM_API_KEY: "test-key", BYERING_INBOX_PLAN_SIGNING_SECRET: "test-signing-secret-32-bytes-long" }
  });
  await startWithConfirmedPlan(service, {
    autoReply: false,
    startPolling: false,
    accountCoordinationKey: "douyin:sec-sender"
  }, "priority-draft-start");
  await service.pollOnce({ waitMs: 0 });

  assert.equal(coordinationCalls.length, 1);
  assert.equal(coordinationCalls[0].accountKey, "douyin:sec-sender");
  assert.equal(coordinationCalls[0].metadata.action, "reply");
});

test("service refreshes a running inbox account coordination key", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-inbox-refresh-key-"));
  const service = createDouyinInboxAgentService({
    douyinMcpService: fakeMcp(),
    stateFile: join(directory, "state.json"),
    replyGenerator: async () => "收到。",
    planGenerator: async () => completeModelPlan(),
    env: { BYERING_LLM_API_KEY: "test-key", BYERING_INBOX_PLAN_SIGNING_SECRET: "test-signing-secret-32-bytes-long" }
  });
  await startWithConfirmedPlan(service, { startPolling: false }, "refresh-key-start");

  assert.equal(service.setAccountCoordinationKey("douyin:sec:refreshed-sender"), "douyin:sec:refreshed-sender");
  assert.equal(service.status().runtime.accountCoordinationKey, "douyin:sec:refreshed-sender");
});

test("service returns a configuration error instead of a canned reply", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-inbox-"));
  const mcp = fakeMcp();
  const service = createDouyinInboxAgentService({ douyinMcpService: mcp, stateFile: join(directory, "state.json"), env: {} });
  assert.equal(service.modelConfigured, false);
  await assert.rejects(() => service.plan(completePlanInput()), { code: "DOUYIN_INBOX_PLAN_SIGNING_NOT_CONFIGURED" });
});

test("service loads stored knowledge before starting automatic replies", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-inbox-"));
  const mcp = fakeMcp();
  let requestBody = null;
  const service = createDouyinInboxAgentService({
    douyinMcpService: mcp,
    stateFile: join(directory, "state.json"),
    env: { BYERING_LLM_API_KEY: "test-key", BYERING_INBOX_PLAN_SIGNING_SECRET: "test-signing-secret-32-bytes-long" },
    knowledgeProvider: async () => ({ context: "产品只支持企业客户。", entries: [{ id: "k-1", text: "产品只支持企业客户。" }] }),
    planGenerator: async () => completeModelPlan({ allowedFacts: [{ fact: "产品只支持企业客户。", sourceId: "k-1" }] }),
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return new Response(JSON.stringify({ choices: [{ message: { content: "你好，我来帮你。" } }] }), { status: 200 });
    }
  });
  await startWithConfirmedPlan(service, { autoReply: true, startPolling: false, businessKnowledge: "" }, "stored-knowledge-start");
  await service.pollOnce({ waitMs: 0 });
  assert.match(requestBody.messages[0].content, /产品只支持企业客户/);
});

test("service keeps the selected Douyin account identity with the running inbox session", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-inbox-"));
  const service = createDouyinInboxAgentService({
    douyinMcpService: fakeMcp(),
    stateFile: join(directory, "state.json"),
    env: { BYERING_LLM_API_KEY: "test-key", BYERING_INBOX_PLAN_SIGNING_SECRET: "test-signing-secret-32-bytes-long" },
    replyGenerator: async () => "收到。",
    planGenerator: async () => completeModelPlan()
  });

  const result = await startWithConfirmedPlan(service, {
    accountId: "account-a",
    accountName: "账号 A",
    startPolling: false
  }, "account-start");

  assert.equal(result.accountId, "account-a");
  assert.equal(result.accountName, "账号 A");
  const saved = JSON.parse(await readFile(join(directory, "state.json"), "utf8"));
  assert.equal(saved.accountId, "account-a");
  assert.equal(saved.accountName, "账号 A");
});

test("automatic replies fail closed when stored knowledge cannot be loaded", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-inbox-"));
  const service = createDouyinInboxAgentService({
    douyinMcpService: fakeMcp(),
    stateFile: join(directory, "state.json"),
    env: { BYERING_LLM_API_KEY: "test-key", BYERING_INBOX_PLAN_SIGNING_SECRET: "test-signing-secret-32-bytes-long" },
    planGenerator: async () => completeModelPlan(),
    knowledgeProvider: async () => { throw new Error("store unavailable"); }
  });
  await assert.rejects(() => service.plan(completePlanInput({ autoReply: true, startPolling: false, businessKnowledge: "" })), { code: "DOUYIN_KNOWLEDGE_UNAVAILABLE" });
});
