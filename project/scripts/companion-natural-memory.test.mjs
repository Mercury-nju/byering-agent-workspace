import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAgentStore } from "./agent-store.mjs";
import { createCompanionService } from "../backend/agent-companion.js";
import { retrieveCompanionMemory, retrieveCompanionHistory, automaticMemoryCandidates } from "../backend/companion-memory.js";

function fixture(t, generate) {
  const root = mkdtempSync(join(tmpdir(), "natural-memory-")); t.after(() => rmSync(root, { recursive: true, force: true }));
  const store = createAgentStore(root, { seedMessages: false });
  const service = createCompanionService({ agentStore: store, generate });
  const owner = { agentId: "mkt-douyin-finder", tenantId: "a" };
  return { service, store, owner };
}
test("natural facts are remembered without approval cards and can be undone", async t => {
  const { service, store, owner } = fixture(t, async () => ({ text: "那我们先看上海的家装客户。", memories: [
    { key: "business", topic: "行业", text: "用户做家装", subject: "user", basis: "stated", temporal: "stable", evidence: "我做家装" },
    { key: "audience", topic: "服务地区", text: "用户主要服务上海客户", subject: "user", basis: "stated", temporal: "stable", evidence: "主要服务上海客户" }
  ] }));
  const user = store.appendDm(service.scope(owner), { from: "user", text: "我做家装，主要服务上海客户" });
  const reply = await service.reply(owner, user);
  assert.equal(service.get(owner).memories.length, 2);
  assert.equal(reply.metadata.companion.cards.some(card => card.kind === "memory"), false);
  assert.equal(service.get(owner).memories[0].expiresAt, null);
  assert.equal(service.get(owner).revision, 2);
  service.undoMemory(owner, { messageId: reply.id });
  assert.equal(service.get(owner).memories.length, 0);
  assert.equal(service.get(owner).revision, 3);
});
test("active memory stays bounded while direct questions can recover archived facts", t => {
  const { service, owner } = fixture(t);
  for (let i = 0; i < 70; i++) service.remember(owner, { key: `fact-${i}`, text: i === 0 ? "上海展厅的预算是五万元" : `其他独立事实 ${i}` });
  assert.equal(service.get(owner).memories.length, 70);
  assert.equal(service.get(owner).memories.filter(item => item.status === "active").length, 60);
  assert.equal(service.get(owner).memories.filter(item => item.status === "archived").length, 10);
  assert.doesNotMatch(service.context(owner, "完全无关的问题").context, /五万元/);
  assert.match(service.context(owner, "上海展厅预算").context, /五万元/);
  const selected = retrieveCompanionMemory(service.get(owner).memories, "上海展厅预算", { budget: 100, includeArchived: true });
  assert.match(selected[0].text, /五万元/);
});
test("memory history has a finite retention window", t => {
  const { service, owner } = fixture(t);
  for (let i = 0; i < 260; i++) service.remember(owner, { key: `fact-${i}`, text: `可归档事实 ${i}` });
  const memories = service.get(owner).memories;
  assert.equal(memories.length, 240);
  assert.equal(memories.filter(item => item.status === "active").length, 60);
  assert.equal(memories.filter(item => item.status === "archived").length, 180);
  assert.equal(memories.some(item => item.text === "可归档事实 0"), false);
  assert.equal(memories.some(item => item.text === "可归档事实 259"), true);
});
test("unrelated same-category facts coexist and explicit corrections target a known fact", t => {
  const { service, owner } = fixture(t);
  service.remember(owner, { key: "business", topic: "行业", text: "做家装" });
  const first = service.get(owner).memories[0];
  service.remember(owner, { key: "business", topic: "展厅", text: "有一家展厅" });
  assert.equal(service.get(owner).memories.length, 2);
  service.remember(owner, { key: "business", topic: "行业", text: "现在做软装", supersedes: first.id });
  assert.equal(service.get(owner).memories.length, 2);
  assert.equal(service.get(owner).memories.some(item => item.text === "做家装"), false);
});
test("third-party facts, guesses and unsupported evidence are not automatically promoted", () => {
  const user = { text: "我的客户是老师" };
  const candidates = automaticMemoryCandidates({ memories: [
    { key: "business", text: "用户是老师", subject: "customer", basis: "stated", temporal: "stable", evidence: "我的客户是老师" },
    { key: "business", text: "用户是老师", subject: "user", basis: "inferred", temporal: "stable", evidence: "我的客户是老师" },
    { key: "business", text: "用户做家装", subject: "user", basis: "stated", temporal: "stable", evidence: "我做家装" }
  ] }, user, []);
  assert.equal(candidates.length, 0);
});
test("older conversation recall is relevant and respects excluded messages", () => {
  const messages = [{ id: "old", from: "user", text: "上海展厅预算是五万元" }, { id: "other", from: "user", text: "早餐吃什么" }];
  assert.equal(retrieveCompanionHistory(messages, "展厅预算")[0].id, "old");
  assert.equal(retrieveCompanionHistory(messages, "展厅预算", { excludeIds: ["old"] }).length, 0);
});

test("explicit remembering has priority and forgetting in chat removes the fact", async t => {
  let id;
  const { service, store, owner } = fixture(t, async () => ({ text: "好，不再参考这个预算。", forgetMemoryIds: [id] }));
  service.remember(owner, { key: "business", topic: "预算", text: "展厅预算五万元", explicit: true });
  id = service.get(owner).memories[0].id;
  const user = store.appendDm(service.scope(owner), { from: "user", text: "忘掉展厅预算" });
  const reply = await service.reply(owner, user);
  assert.equal(service.get(owner).memories.length, 0);
  assert.equal(reply.metadata.companion.memoryForgotten, 1);
});

test("temporary notes expire at their actual deadline while stable facts persist", t => {
  const { service, owner } = fixture(t);
  service.remember(owner, { key: "business", topic: "行业", text: "做家装", temporal: "stable" });
  service.remember(owner, { key: "business", topic: "旧预算", text: "已过期的预算", temporal: "temporary", validUntil: "2020-01-01T00:00:00Z" });
  assert.equal(service.get(owner).memories.length, 1);
  assert.equal(service.get(owner).memories[0].expiresAt, null);
});

test("related old messages are available beyond the recent-turn window, but not after forgetting", async t => {
  let seen;
  const { service, store, owner } = fixture(t, async input => { seen = input; return { text: "先核对一下。" }; });
  store.appendDm(service.scope(owner), { from: "user", text: "上海展厅预算是五万元" });
  for (let i = 0; i < 30; i++) store.appendDm(service.scope(owner), { from: "user", text: `无关话题${i}` });
  let user = store.appendDm(service.scope(owner), { from: "user", text: "展厅预算是多少" }); await service.reply(owner, user);
  assert.ok(seen.recalledHistory.some(message => message.text.includes("五万元")));
  service.forget(owner, { reset: true, expectedRevision: 0 });
  user = store.appendDm(service.scope(owner), { from: "user", text: "展厅预算是多少" }); await service.reply(owner, user);
  assert.equal(JSON.stringify(seen).includes("五万元"), false);
});

test("disabled memory does not learn natural statements", async t => {
  const { service, store, owner } = fixture(t, async () => ({ text: "我们先聊聊。", memories: [{ key: "business", text: "做家装", evidence: "我做家装", subject: "user", basis: "stated", temporal: "stable" }] }));
  service.update(owner, { settings: { remember: false }, expectedRevision: 0 });
  const user = store.appendDm(service.scope(owner), { from: "user", text: "我做家装" }); await service.reply(owner, user);
  assert.equal(service.get(owner).memories.length, 0);
});
