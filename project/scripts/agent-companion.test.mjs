import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAgentStore } from "./agent-store.mjs";
import { createCompanionService } from "../backend/agent-companion.js";

function fixture(t, reply, options = {}) {
  const root = mkdtempSync(join(tmpdir(), "companion-")); t.after(() => rmSync(root, { recursive: true, force: true }));
  const store = createAgentStore(root, { seedMessages: false });
  const service = createCompanionService({ agentStore: store, generate: reply || (async () => ({ text: "我看到了，先一起把情况弄清楚。" })), ...options });
  return { service, store, owner: { agentId: "mkt-douyin-finder", tenantId: "a" } };
}
test("each agent has its own defaults but no fabricated personal memories", t => {
  const { service, owner } = fixture(t);
  assert.equal(service.get(owner).memories.length, 0);
  assert.notEqual(service.get(owner).persona.description, service.get({ ...owner, agentId: "mkt-dm-inbox" }).persona.description);
  assert.match(service.get({ ...owner, agentId: "mkt-intent-analyst" }).persona.description, /潜客判断/);
});

test("memories stay private by default and move across Agents only after an explicit share", t => {
  const { service, owner } = fixture(t);
  const analyst = { ...owner, agentId: "mkt-intent-analyst" };

  service.remember(owner, {
    key: "business",
    topic: "服务行业",
    text: "用户主营家装设计服务",
    scope: "shared",
    explicit: false
  });
  const first = service.get(owner);
  assert.equal(first.memories[0].scope, "agent");
  assert.doesNotMatch(service.context(analyst, "家装").context, /家装设计服务/);

  service.edit(owner, {
    memoryId: first.memories[0].id,
    scope: "shared",
    expectedRevision: first.revision,
    expectedSharedRevision: first.sharedRevision
  });
  const shared = service.get(owner);
  assert.equal(shared.memories[0].scope, "shared");
  assert.match(service.context(analyst, "家装").context, /家装设计服务/);

  service.remember(owner, {
    key: "tone",
    text: "说话直接一点",
    value: "direct",
    scope: "shared",
    explicit: true
  });
  const tone = service.get(owner).memories.find(memory => memory.key === "tone");
  assert.equal(tone.scope, "agent", "conversation settings never become shared memory");

  service.forget(owner, {
    memoryId: shared.memories[0].id,
    expectedRevision: shared.revision,
    expectedSharedRevision: shared.sharedRevision
  });
  assert.doesNotMatch(service.context(analyst, "家装").context, /家装设计服务/);
});

test("task facts are supplied as read-only context and never written as user memory", async t => {
  let generated;
  const taskFacts = {
    taskId: "task-knowledge",
    taskRunId: "run-knowledge:analysis",
    state: "RUNNING",
    stage: { stepId: "analysis", status: "RUNNING" },
    incomingHandoffs: [{ from: { agentId: "mkt-find-people" }, outputs: { qualifiedLeads: [{ id: "lead-1" }] } }]
  };
  const { service, store, owner } = fixture(t, async input => {
    generated = input;
    return { text: "我会按找客专员交来的候选人继续判断。" };
  }, {
    readTask: candidate => candidate.taskScope?.taskId === "task-knowledge" ? taskFacts : null
  });
  const scopedOwner = { ...owner, agentId: "mkt-intent-analyst", taskScope: { taskId: "task-knowledge", taskRunId: "run-knowledge:analysis" } };
  const message = store.appendDm(service.scope(scopedOwner), { from: "user", text: "这批候选人先怎么看？" });
  await service.reply(scopedOwner, message);

  assert.deepEqual(generated.taskFacts, taskFacts);
  assert.equal(service.get(scopedOwner).memories.length, 0);
});
test("confirmed preferences persist, isolate tenants and never mutate capability boundaries", t => {
  const { service, owner } = fixture(t);
  const before = service.get(owner);
  service.update(owner, { settings: { tone: "direct", detail: "brief", limits: { dailyMax: 9999 }, purpose: "anything" }, expectedRevision: 0 });
  const next = service.get(owner);
  assert.equal(next.settings.tone, "direct"); assert.equal(next.settings.limits, undefined);
  assert.deepEqual(next.persona.boundaries, before.persona.boundaries);
  assert.equal(service.get({ ...owner, tenantId: "b" }).settings.tone, "warm");
  assert.throws(() => service.update(owner, { settings: {}, expectedRevision: 0 }), /变化/);
});
test("legacy memory proposal cards remain actionable without duplicate writes", async t => {
  const { service, store, owner } = fixture(t, async () => ({ text: "以后要先看同城的吗？", memory: { text: "优先了解同城客户", key: "audience" } }));
  const user = store.appendDm(service.scope(owner), { from: "user", text: "我更想了解同城客户" });
  await service.reply(owner, user);
  assert.equal(service.get(owner).memories.length, 0);
  const card = { id: "legacy", kind: "memory", proposal: { key: "audience", text: "优先了解同城客户", revision: 0 }, options: [{ id: "remember" }] };
  const answer = store.appendDm(service.scope(owner), { from: owner.agentId, text: "旧版记忆建议", metadata: { companion: { cards: [card] } } });
  service.action(owner, { messageId: answer.id, cardId: card.id, optionId: "remember" });
  assert.equal(service.get(owner).memories[0].text, "优先了解同城客户");
  service.action(owner, { messageId: answer.id, cardId: card.id, optionId: "remember" });
  assert.equal(service.get(owner).memories.length, 1);
});
test("recall is budgeted without deleting stored facts and forgetting removes selected content", t => {
  const { service, owner } = fixture(t);
  for (let i = 0; i < 65; i++) service.remember(owner, { key: `note-${i}`, text: `用户确认的习惯 ${i}` });
  const state = service.get(owner); assert.equal(state.memories.length, 65);
  const id = state.memories[0].id, text = state.memories[0].text;
  service.forget(owner, { memoryId: id, expectedRevision: state.revision });
  assert.equal(service.context(owner).context.includes(text), false);
});
test("memory changes invalidate older outstanding proposals", async t => {
  const { service, store, owner } = fixture(t, async () => ({ text: "记住这个习惯吗？", memory: { key: "audience", text: "偏好同城" } }));
  const user = store.appendDm(service.scope(owner), { from: "user", text: "同城" }); await service.reply(owner, user);
  const answer = store.appendDm(service.scope(owner), { from: owner.agentId, text: "旧版建议", metadata: { companion: { cards: [{ id: "legacy", kind: "memory", proposal: { key: "audience", text: "偏好同城", revision: 0 }, options: [{ id: "remember" }] }] } } });
  service.forget(owner, { reset: true, expectedRevision: 0 });
  assert.throws(() => service.action(owner, { messageId: answer.id, cardId: answer.metadata.companion.cards[0].id, optionId: "remember" }), /变化/);
});

test("forgetting during generation discards stale personalized replies", async t => {
  let finish, started;
  const ready = new Promise(resolve => { started = resolve; });
  const { service, store, owner } = fixture(t, async () => { started(); return new Promise(resolve => { finish = resolve; }); });
  const user = store.appendDm(service.scope(owner), { from: "user", text: "说说看" });
  const pending = service.reply(owner, user); await ready;
  service.forget(owner, { reset: true, expectedRevision: 0 });
  finish({ text: "stale preference" }); await pending;
  assert.equal(store.listDm(service.scope(owner)).some(message => message.text === "stale preference"), false);
  assert.equal(store.listDm(service.scope(owner))[0].metadata.companionReply.phase, "failed");
});

test("new replies use bounded recent history and only confirmed memory", async t => {
  let context;
  const { service, store, owner } = fixture(t, async input => { context = input; return { text: "先看看这些信息。" }; });
  for (let i = 0; i < 35; i++) store.appendDm(service.scope(owner), { from: "user", text: `old-${i}` });
  const user = store.appendDm(service.scope(owner), { from: "user", text: "current" }); await service.reply(owner, user);
  assert.ok(context.history.length <= 12);
  assert.equal(context.history.at(-1).content, "current");
  assert.equal(context.history.some(message => message.content === "old-0"), false);
});

test("queued user messages receive the preceding answer in conversational order", async t => {
  let finish, entered, secondContext;
  const firstStarted = new Promise(resolve => { entered = resolve; });
  let calls = 0;
  const { service, store, owner } = fixture(t, async context => {
    if (++calls === 1) { entered(); return new Promise(resolve => { finish = resolve; }); }
    secondContext = context; return { text: "second answer" };
  });
  const first = store.appendDm(service.scope(owner), { from: "user", text: "first question" });
  const one = service.reply(owner, first); await firstStarted;
  const second = store.appendDm(service.scope(owner), { from: "user", text: "second question" });
  const two = service.reply(owner, second);
  assert.equal(store.listDm(service.scope(owner))[1].metadata.companionReply.phase, "queued");
  finish({ text: "first answer" }); await Promise.all([one, two]);
  assert.deepEqual(secondContext.history.map(item => item.content), ["first question", "first answer", "second question"]);
});
