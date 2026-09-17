import test from "node:test";
import assert from "node:assert/strict";
import {
  createDouyinInboxAgent,
  createMemoryStateStore,
  normalizeMessage
} from "../backend/douyin-inbox-agent.js";

function createFakeMcp(messages = []) {
  const calls = [];
  let queue = [...messages];
  return {
    calls,
    async startMessageMode() {
      calls.push({ name: "startMessageMode" });
      return { ok: true, state: "running" };
    },
    async pullMessages({ cursor, limit, waitMs }) {
      calls.push({ name: "pullMessages", cursor, limit, waitMs });
      const batch = queue;
      queue = [];
      return { ok: true, messages: batch, next_cursor: cursor + batch.length };
    },
    async sendMessage(payload) {
      calls.push({ name: "sendMessage", payload });
      return { ok: true, message_id: payload.reqId };
    }
  };
}

test("stop wakes a sleeping poll loop without waiting for another interval", async () => {
  const agent = createDouyinInboxAgent({ douyinMcpService: createFakeMcp(), pollIntervalMs: 60000, pollWaitMs: 0 });
  await agent.start();
  await new Promise(resolve => setTimeout(resolve, 10));
  let timer;
  try {
    await Promise.race([agent.stop(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("stop did not wake polling")), 150); })]);
  } finally { clearTimeout(timer); }
  assert.equal(agent.status().running, false);
});

test("stop during reply generation prevents a late send", async () => {
  let release;
  let began;
  const ready = new Promise(resolve => { began = resolve; });
  const mcp = createFakeMcp([{ msg_id: "late", conversation_id: "c", content: "Hello" }]);
  const agent = createDouyinInboxAgent({ douyinMcpService: mcp, replyGenerator: async () => { began(); await new Promise(resolve => { release = resolve; }); return "Hello"; } });
  await agent.start({ startPolling: false });
  const poll = agent.pollOnce();
  await ready;
  await agent.stop();
  release();
  await poll;
  assert.equal(mcp.calls.filter(c => c.name === "sendMessage").length, 0);
});

test("stopping while message mode starts cannot resurrect replies", async () => {
  let release;
  let began;
  const ready = new Promise(resolve => { began = resolve; });
  const mcp = createFakeMcp();
  mcp.startMessageMode = async () => { began(); return new Promise(resolve => { release = resolve; }); };
  const agent = createDouyinInboxAgent({ douyinMcpService: mcp });
  const starting = agent.start({ startPolling: false });
  await ready;
  await agent.stop();
  release({ ok: true });
  await starting;
  assert.equal(agent.status().running, false);
});

test("inbox intake always sends safe replies even when draft mode is requested", async () => {
  const mcp = createFakeMcp([{
    msg_id: "m-1",
    conversation_id: "c-1",
    sender: { nickname: "客户A", sec_uid: "u-1" },
    content: "你好，想了解服务"
  }]);
  const events = [];
  const agent = createDouyinInboxAgent({
    douyinMcpService: mcp,
    stateStore: createMemoryStateStore(),
    replyGenerator: async (message) => `收到：${message.content}`,
    onEvent: (event) => events.push(event),
    pollWaitMs: 0
  });

  await agent.start({ startPolling: false });
  const result = await agent.pollOnce({ waitMs: 0 });
  await agent.stop();

  assert.equal(result.outcomes[0].status, "sent");
  assert.equal(mcp.calls.filter((call) => call.name === "sendMessage").length, 1);
  assert.ok(events.some((event) => event.type === "reply.sent"));
  assert.equal(agent.status().mode, "auto");
  assert.equal(agent.status().cursor, 1);
});

test("human takeover stops AI generation and outbound RPA sends for one conversation", async () => {
  const mcp = createFakeMcp([{
    msg_id: "m-human",
    conversation_id: "c-human",
    sender: { nickname: "客户人工", sec_uid: "u-human" },
    content: "我想找人工客服"
  }]);
  let generated = 0;
  const events = [];
  const agent = createDouyinInboxAgent({
    douyinMcpService: mcp,
    stateStore: createMemoryStateStore(),
    getConversationState: async () => ({ mode: "human" }),
    replyGenerator: async () => { generated += 1; return "这条回复不应该发送"; },
    onEvent: (event) => events.push(event),
    pollWaitMs: 0
  });

  await agent.start({ startPolling: false });
  const result = await agent.pollOnce({ waitMs: 0 });
  await agent.stop();

  assert.equal(result.outcomes[0].status, "human");
  assert.equal(result.outcomes[0].reason, "human_takeover");
  assert.equal(generated, 0);
  assert.equal(mcp.calls.filter((call) => call.name === "sendMessage").length, 0);
  assert.ok(events.some((event) => event.type === "reply.skipped" && event.reason === "human_takeover"));
});

test("takeover during generation prevents the late AI reply from reaching RPA", async () => {
  let stateReads = 0;
  let releaseGeneration;
  let generationStarted;
  const started = new Promise(resolve => { generationStarted = resolve; });
  const mcp = createFakeMcp([{
    msg_id: "m-race",
    conversation_id: "c-race",
    sec_uid: "u-race",
    content: "请介绍一下"
  }]);
  const agent = createDouyinInboxAgent({
    douyinMcpService: mcp,
    stateStore: createMemoryStateStore(),
    getConversationState: async () => ({ mode: ++stateReads >= 2 ? "human" : "auto" }),
    replyGenerator: async () => {
      generationStarted();
      await new Promise(resolve => { releaseGeneration = resolve; });
      return "这条回复不能在接管后发送";
    },
    pollWaitMs: 0
  });

  await agent.start({ startPolling: false });
  const poll = agent.pollOnce({ waitMs: 0 });
  await started;
  releaseGeneration();
  const result = await poll;
  await agent.stop();

  assert.equal(result.outcomes[0].status, "human");
  assert.equal(result.outcomes[0].reason, "human_takeover");
  assert.equal(mcp.calls.filter((call) => call.name === "sendMessage").length, 0);
});

test("policy boundaries hand the conversation to a human without creating a sendable draft", async () => {
  const mcp = createFakeMcp([{
    msg_id: "m-handoff",
    conversation_id: "c-handoff",
    sender: { nickname: "客户边界", sec_uid: "u-handoff" },
    content: "这个价格你能承诺吗？"
  }]);
  const events = [];
  const agent = createDouyinInboxAgent({
    douyinMcpService: mcp,
    stateStore: createMemoryStateStore(),
    shouldReply: async () => ({ reply: true, requiresHandoff: true, reason: "price_commitment" }),
    replyGenerator: async () => "这条内容不应进入待确认发送。",
    onEvent: (event) => events.push(event),
    pollWaitMs: 0
  });

  await agent.start({ autoReply: false, startPolling: false });
  const result = await agent.pollOnce({ waitMs: 0 });
  await agent.stop();

  assert.equal(result.outcomes[0].status, "handoff");
  assert.equal(result.outcomes[0].reason, "price_commitment");
  assert.equal(mcp.calls.filter((call) => call.name === "sendMessage").length, 0);
  assert.equal(agent.listDrafts().length, 0);
  assert.equal(agent.status().handoffCount, 1);
  assert.ok(events.some((event) => event.type === "reply.handoff"));
  assert.ok(!events.some((event) => event.type === "reply.drafted"));
});

test("auto mode replies once and deduplicates repeated messages", async () => {
  const mcp = createFakeMcp([{
    message_id: "m-2",
    conversationId: "c-2",
    nickname: "客户B",
    content: "可以发资料吗？"
  }]);
  const agent = createDouyinInboxAgent({
    douyinMcpService: mcp,
    autoReply: true,
    stateStore: createMemoryStateStore(),
    replyGenerator: async () => ({ content: "可以，我先确认一下你的需求。" }),
    pollWaitMs: 0
  });

  await agent.start({ autoReply: true, startPolling: false });
  const first = await agent.pollOnce({ waitMs: 0 });
  const second = await agent.pollOnce({ waitMs: 0 });
  await agent.stop();

  assert.equal(first.outcomes[0].status, "sent");
  assert.equal(second.count, 0);
  const sends = mcp.calls.filter((call) => call.name === "sendMessage");
  assert.equal(sends.length, 1);
  assert.equal(sends[0].payload.conversationId, "c-2");
  assert.equal(sends[0].payload.reqId, "douyin-inbox:m-2");
  assert.equal(agent.status().sentCount, 1);
});

test("automatic replies use the shared account queue", async () => {
  const mcp = createFakeMcp([{
    message_id: "m-priority",
    conversationId: "c-priority",
    nickname: "客户优先级",
    content: "现在方便吗？"
  }]);
  const coordinationCalls = [];
  const accountActionCoordinator = {
    async runInbox(accountKey, operation, metadata) {
      coordinationCalls.push({ accountKey, metadata });
      return operation();
    }
  };
  const agent = createDouyinInboxAgent({
    douyinMcpService: mcp,
    accountActionCoordinator,
    autoReply: true,
    stateStore: createMemoryStateStore(),
    replyGenerator: async () => "方便，请讲。",
    pollWaitMs: 0
  });

  await agent.start({
    autoReply: true,
    startPolling: false,
    accountId: "logical-inbox-account",
    accountCoordinationKey: "douyin:sec-sender"
  });
  await agent.pollOnce({ waitMs: 0 });
  await agent.stop();

  assert.equal(coordinationCalls.length, 1);
  assert.equal(coordinationCalls[0].accountKey, "douyin:sec-sender");
  assert.equal(coordinationCalls[0].metadata.action, "reply");
});

test("a restored inbox runtime can refresh its real account coordination key", async () => {
  const mcp = createFakeMcp([{
    message_id: "m-restored-priority",
    conversationId: "c-restored-priority",
    nickname: "客户恢复态",
    content: "你好"
  }]);
  const coordinationKeys = [];
  const agent = createDouyinInboxAgent({
    douyinMcpService: mcp,
    accountActionCoordinator: {
      async runInbox(accountKey, operation) {
        coordinationKeys.push(accountKey);
        return operation();
      }
    },
    autoReply: true,
    stateStore: createMemoryStateStore({ accountId: "legacy-agent-slot", autoReply: true }),
    replyGenerator: async () => "你好，请讲。",
    pollWaitMs: 0
  });

  agent.setAccountCoordinationKey("douyin:sec:restored-sender");
  await agent.start({ autoReply: true, startPolling: false });
  await agent.pollOnce({ waitMs: 0 });
  await agent.stop();

  assert.deepEqual(coordinationKeys, ["douyin:sec:restored-sender"]);
});

test("outbound messages are ignored to prevent reply loops", async () => {
  const mcp = createFakeMcp([{
    id: "m-out",
    conversation_id: "c-out",
    content: "此前已发送",
    is_self: true
  }]);
  const agent = createDouyinInboxAgent({
    douyinMcpService: mcp,
    autoReply: true,
    stateStore: createMemoryStateStore(),
    pollWaitMs: 0
  });

  await agent.start({ autoReply: true, startPolling: false });
  const result = await agent.pollOnce({ waitMs: 0 });
  await agent.stop();

  assert.equal(result.outcomes[0].reason, "outbound_message");
  assert.equal(mcp.calls.filter((call) => call.name === "sendMessage").length, 0);
});

test("lead capture messages are recorded and never receive an automatic reply", async () => {
  const mcp = createFakeMcp([{
    id: "m-lead",
    conversation_id: "c-lead",
    nickname: "客户留资",
    sec_uid: "u-lead",
    content: "可以，加微信 wxid_demo123456"
  }]);
  const events = [];
  const agent = createDouyinInboxAgent({
    douyinMcpService: mcp,
    autoReply: true,
    stateStore: createMemoryStateStore(),
    replyGenerator: async () => "不应该发送",
    onEvent: (event) => events.push(event),
    pollWaitMs: 0
  });

  await agent.start({ autoReply: true, startPolling: false });
  const result = await agent.pollOnce({ waitMs: 0 });
  await agent.stop();

  assert.equal(result.outcomes[0].status, "captured");
  assert.equal(result.outcomes[0].reason, "lead_captured");
  assert.deepEqual(result.outcomes[0].leadCapture, { phone: null, email: null, wechat: "wxid_demo123456", source: "私信" });
  assert.equal(mcp.calls.filter((call) => call.name === "sendMessage").length, 0);
  assert.deepEqual(events.find((event) => event.type === "lead.captured")?.leadCapture, { phone: null, email: null, wechat: "wxid_demo123456", source: "私信" });
  assert.ok(events.some((event) => event.type === "reply.skipped" && event.reason === "lead_captured"));
});

test("cursor and reply idempotency survive a new runtime instance", async () => {
  const store = createMemoryStateStore();
  const mcp = createFakeMcp([{
    id: "m-persisted",
    conversation_id: "c-persisted",
    nickname: "客户D",
    content: "还在吗？"
  }]);
  const first = createDouyinInboxAgent({
    douyinMcpService: mcp,
    autoReply: true,
    stateStore: store,
    replyGenerator: async () => "在的，我来帮你。"
  });
  await first.start({ autoReply: true, startPolling: false });
  await first.pollOnce({ waitMs: 0 });
  await first.stop();

  const second = createDouyinInboxAgent({
    douyinMcpService: mcp,
    autoReply: true,
    stateStore: store,
    replyGenerator: async () => "不应再次发送"
  });
  await second.start({ startPolling: false });
  assert.equal(second.status().cursor, 1);
  const result = await second.pollOnce({ waitMs: 0 });
  assert.equal(result.count, 0);
  assert.equal(mcp.calls.filter((call) => call.name === "sendMessage").length, 1);
});

test("a legacy zero cursor resynchronizes after the provider rejects the stale cursor", async () => {
  const calls = [];
  const events = [];
  const mcp = {
    async startMessageMode() {
      return { ok: true, state: "running" };
    },
    async pullMessages({ cursor, limit, waitMs }) {
      calls.push({ cursor, limit, waitMs });
      if (cursor === 0) {
        return { ok: false, error: { code: "worker_timeout", message: "stale cursor timed out" } };
      }
      if (cursor == null) {
        return { ok: true, messages: [], next_cursor: 2246 };
      }
      return {
        ok: true,
        messages: [{
          message_id: "m-after-resync",
          conversation_id: "c-after-resync",
          nickname: "国王",
          sec_uid: "sec-king",
          content: "你好"
        }],
        next_cursor: 2247
      };
    },
    async sendMessage(payload) {
      calls.push({ send: payload });
      return { ok: true, message_id: payload.reqId };
    }
  };
  const agent = createDouyinInboxAgent({
    douyinMcpService: mcp,
    stateStore: createMemoryStateStore({ cursor: 0, autoReply: true }),
    replyGenerator: async () => "你好，请问有什么可以帮你？",
    onEvent: (event) => events.push(event),
    pollWaitMs: 0
  });

  await agent.start({ startPolling: false });
  const synchronized = await agent.pollOnce({ waitMs: 0 });
  const received = await agent.pollOnce({ waitMs: 0 });
  await agent.stop();

  assert.equal(synchronized.count, 0);
  assert.equal(synchronized.resynchronized, true);
  assert.equal(agent.status().cursor, 2247);
  assert.equal(received.outcomes[0].status, "sent");
  assert.deepEqual(calls.slice(0, 3).map((call) => call.cursor), [0, null, 2246]);
  assert.ok(events.some((event) => event.type === "cursor.resynchronized" && event.nextCursor === 2246));
});

test("a legacy zero cursor resynchronizes when the provider reports a stalled worker cursor", async () => {
  const calls = [];
  const mcp = {
    async startMessageMode() {
      return { ok: true, state: "running" };
    },
    async pullMessages({ cursor }) {
      calls.push(cursor);
      if (cursor === 0) return { ok: true, messages: [], next_cursor: 0, source: "worker" };
      if (cursor == null) return { ok: true, messages: [], next_cursor: 2246, source: "worker" };
      return { ok: true, messages: [], next_cursor: cursor, source: "worker" };
    }
  };
  const agent = createDouyinInboxAgent({
    douyinMcpService: mcp,
    stateStore: createMemoryStateStore({ cursor: 0, autoReply: true }),
    pollWaitMs: 0
  });

  await agent.start({ startPolling: false });
  const result = await agent.pollOnce({ waitMs: 0 });
  await agent.stop();

  assert.equal(result.resynchronized, true);
  assert.equal(agent.status().cursor, 2246);
  assert.deepEqual(calls, [0, null]);
});

test("normalizes common MCP message envelopes", () => {
  const message = normalizeMessage({
    msg_id: 42,
    data: "ignored",
    from: { nick_name: "客户C", sec_id: "sec-c" },
    chat_id: "chat-c",
    text: "hello",
    direction: "inbound"
  });
  assert.deepEqual(message, {
    id: "42",
    content: "hello",
    conversationId: "chat-c",
    nickname: "客户C",
    userId: null,
    secUid: "sec-c",
    uniqueId: null,
    externalUserId: "sec-c",
    avatarUrl: null,
    isOutbound: false,
    createdAt: null,
    sender: { nick_name: "客户C", sec_id: "sec-c" },
    raw: {
      msg_id: 42,
      data: "ignored",
      from: { nick_name: "客户C", sec_id: "sec-c" },
      chat_id: "chat-c",
      text: "hello",
      direction: "inbound"
    }
  });
});

test("normalizes nested Douyin text payloads and provider send direction", () => {
  const incoming = normalizeMessage({
    msg_id: "m-nested-in",
    conversation_id: "c-nested",
    direction: "receive",
    content: { type: 0, text: "真实私信正文" },
    sender: { nickname: "客户D", sec_uid: "sec-d" }
  });
  const outgoing = normalizeMessage({
    msg_id: "m-nested-out",
    conversation_id: "c-nested",
    direction: "send",
    content: { type: 0, text: "真实自动回复" },
    sender: { nickname: "当前账号", sec_uid: "sec-self" }
  });

  assert.equal(incoming.content, "真实私信正文");
  assert.equal(incoming.isOutbound, false);
  assert.equal(outgoing.content, "真实自动回复");
  assert.equal(outgoing.isOutbound, true);
});
