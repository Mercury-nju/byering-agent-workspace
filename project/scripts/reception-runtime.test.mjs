import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createAccountReceptionStore } from "../backend/account-reception-store.js";
import { createReceptionReplyHandler } from "../backend/account-reception-runtime.js";
import { createDouyinInboxAgent, createMemoryStateStore } from "../backend/douyin-inbox-agent.js";

function setup(t, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), "reception-run-")); t.after(() => rmSync(dir, { recursive: true, force: true }));
  let instant = Date.parse("2026-09-07T14:00:00Z");
  const store = createAccountReceptionStore({ stateFile: join(dir, "settings.json"), now: () => instant });
  const owner = { account: { uid: "owner" } };
  store.save(owner, { knowledge: "支持预约咨询", habits: { mergeSeconds: 0 }, schedule: { mode: "daily", intervals: [{ start: "09:00", end: "18:00" }], outside: "away" } }, 0);
  const sends = [], generated = [];
  const handler = createReceptionReplyHandler({ store, getOwner: () => owner, now: () => instant, generate: async (message, details) => { generated.push(details); return { content: "你好，想了解什么？" }; }, ...options });
  const handle = message => handler({ message: { id: "m1", secUid: "customer", conversationId: "c", nickname: "客户", content: "你好", ...message }, send: async payload => { sends.push(payload); return { ok: true }; }, active: () => true });
  return { store, owner, sends, generated, handler, handle, setTime: value => { instant = Date.parse(value); } };
}
test("off-hours sends one away reply and keeps messages pending until working hours", async t => {
  const f = setup(t);
  assert.equal((await f.handle({})).status, "deferred");
  await f.handle({ id: "m2", content: "还在吗" });
  assert.equal(f.sends.length, 1); assert.equal(f.generated.length, 0);
  f.setTime("2026-09-08T02:00:00Z");
  assert.equal((await f.handle({})).status, "sent");
  assert.equal(f.sends.length, 2);
});
test("policy changes and human takeover during generation prevent stale replies", async t => {
  let f;
  f = setup(t, { generate: async () => { f.store.control(f.owner, "customer", "human"); return { content: "must not send" }; } });
  f.setTime("2026-09-08T02:00:00Z");
  await f.handle({}); assert.equal(f.sends.length, 0);
  f.store.control(f.owner, "customer", "auto");
  const changed = createReceptionReplyHandler({ store: f.store, getOwner: () => f.owner, now: () => Date.parse("2026-09-08T02:00:00Z"), generate: async () => { const current = f.store.get(f.owner); f.store.save(f.owner, { ...current.settings, tone: "direct" }, current.revision); return { content: "stale" }; } });
  const result = await changed({ message: { id: "m2", secUid: "customer", content: "hi" }, send: async () => assert.fail("Stale policy"), active: () => true });
  assert.equal(result.status, "deferred");
});
test("opt-out is enforced outside working hours without sending an away reply", async t => {
  const f = setup(t);
  await f.handle({ content: "不要再联系我" });
  assert.equal(f.sends.length, 0);
  assert.equal(f.store.conversation(f.owner, "customer").mode, "closed");
});

test("a queued send rechecks working hours at the actual send boundary", async t => {
  const f = setup(t); f.setTime("2026-09-08T09:59:00Z");
  let sends = 0;
  const result = await f.handler({ message: { id: "boundary", secUid: "customer", content: "你好" }, active: () => true, send: async (_payload, check) => {
    f.setTime("2026-09-08T10:00:00Z");
    if (!check()) return { cancelled: true };
    sends++; return { ok: true };
  } });
  assert.equal(result.status, "deferred"); assert.equal(sends, 0);
});

test("a second Agent with a different batch cannot send the same incoming message again", async t => {
  const f = setup(t); f.setTime("2026-09-08T02:00:00Z");
  const send = async (_payload, check) => check() ? { ok: true } : { cancelled: true };
  const first = await f.handler({ message: { id: "two", batchIds: ["one", "two"], secUid: "customer", content: "你好\n想预约" }, send });
  assert.equal(first.status, "sent");
  const replay = await f.handler({ message: { id: "two", secUid: "customer", content: "想预约" }, send: () => assert.fail("duplicate send") });
  assert.equal(replay.status, "duplicate");
});

test("answer-only reception uses the user's question as the stopping point", async t => {
  const f = setup(t); f.setTime("2026-09-08T02:00:00Z");
  const current = f.store.get(f.owner);
  f.store.save(f.owner, { ...current.settings, goal: "answer" }, current.revision);

  const result = await f.handle({ content: "这个服务怎么用？" });

  assert.equal(result.status, "sent");
  assert.match(f.generated[0].context.strategy.objective, /回答问题/);
  assert.match(f.generated[0].context.replyRule, /问题解决后不主动引导留资、预约或继续追问/);
});

test("the inbox persists deferred messages and combines a customer burst after restart", async t => {
  const f = setup(t);
  const stateStore = createMemoryStateStore();
  let messages = [{ msg_id: "one", sec_uid: "customer", content: "你好" }, { msg_id: "two", sec_uid: "customer", content: "想预约" }];
  const mcp = { startMessageMode: async () => ({ ok: true }), pullMessages: async () => { const batch = messages; messages = []; return { messages: batch, next_cursor: 2 }; }, sendMessage: async payload => { f.sends.push(payload); return { ok: true }; } };
  const agent = createDouyinInboxAgent({ douyinMcpService: mcp, stateStore, receptionHandler: f.handler, now: () => Date.parse("2026-09-07T14:00:00Z") });
  await agent.start({ startPolling: false }); await agent.pollOnce(); await agent.stop();
  assert.equal((await stateStore.load()).pendingMessages.length, 2);
  f.setTime("2026-09-08T02:00:00Z");
  const restored = createDouyinInboxAgent({ douyinMcpService: mcp, stateStore, receptionHandler: f.handler });
  await restored.start({ startPolling: false }); await restored.pollOnce(); await restored.stop();
  assert.equal((await stateStore.load()).pendingMessages.length, 0);
  assert.equal(f.generated.length, 1);
  assert.equal(f.generated[0].messageText, "你好\n想预约");
});
