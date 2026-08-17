#!/usr/bin/env node
/**
 * 私聊（dm.message.*）与云电脑（agent.workspace.list）数据层测试
 * 运行：node scripts/agent-dm.test.mjs
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAgentStore } from "./agent-store.mjs";
import { startGatewayMock } from "./gateway-mock.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const results = [];
const record = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
};
const assert = (condition, message) => { if (!condition) throw new Error(message); };
async function run(name, fn) {
  try { await fn(); record(name, true); }
  catch (error) { record(name, false, error.message); }
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const CORE_AGENT_TYPES = ["main", "Browser Agent", "Search Agent", "App Agent", "File Agent", "Computer Agent"];

// ── agent-store 私聊与工作区单元 ─────────────────────────────
const storeRoot = mkdtempSync(path.join(tmpdir(), "sb-dm-"));
try {
  const store = createAgentStore(storeRoot);

  await run("store: 六位员工均有独立历史对话与产出", () => {
    const artifactNames = new Set();
    for (const agentType of CORE_AGENT_TYPES) {
      const messages = store.listDm(agentType);
      assert(messages.length >= 4, `${agentType} 历史对话不足`);
      assert(messages.some((item) => item.from === "user"), `${agentType} 缺用户对话`);
      const artifactMessage = messages.find((item) => item.artifact);
      assert(artifactMessage?.artifact?.name, `${agentType} 缺产出物`);
      assert(artifactMessage.artifact.content, `${agentType} 产出缺可预览内容`);
      artifactNames.add(artifactMessage.artifact.name);
    }
    assert(artifactNames.size === CORE_AGENT_TYPES.length, "六位员工的产出不应复用同一份模板");
  });

  await run("store: appendDm/listDm 往返一致并保留产出字段", () => {
    const before = store.listDm("File Agent").length;
    const artifact = { name: "周报.md", type: "doc", summary: "项目周报已整理", content: "# 周报" };
    const message = store.appendDm("File Agent", { from: "user", fromName: "我", text: "帮我整理周报", artifact });
    assert(message.id && message.agentType === "File Agent", "消息字段缺失");
    const messages = store.listDm("File Agent");
    assert(messages.length === before + 1 && messages.at(-1).text === "帮我整理周报", "私聊未落盘");
    assert(messages.at(-1).artifact?.name === "周报.md", "产出字段未落盘");
    assert(!store.listDm("Search Agent").some((item) => item.text === "帮我整理周报"), "不同 Agent 私聊应隔离");
  });

  await run("store: listWorkspace 返回分区与文件", () => {
    const workspace = store.workspacePath("File Agent");
    writeFileSync(path.join(workspace, "output", "周报.md"), "# 周报");
    const result = store.listWorkspace("File Agent");
    assert(result.path.endsWith("workspace"), "路径错误");
    const dirs = result.sections.map((s) => s.dir);
    assert(dirs.join(",") === "根目录,inbox,output", `分区错误：${dirs}`);
    const output = result.sections.find((s) => s.dir === "output");
    assert(output.files.length === 1 && output.files[0].name === "周报.md" && output.files[0].size > 0, "文件列表错误");
  });

  await run("store: Agent广场成员档案带中文种子", () => {
    const profile = store.getProfile("mkt-lead-miner");
    assert(profile.identity.name === "周砚", `广场成员姓名错误：${profile.identity.name}`);
    assert(profile.identity.title === "线索挖掘机", `广场成员职位错误：${profile.identity.title}`);
    assert(profile.role.responsibilities.includes("线索挖掘"), "广场成员职责未带入");
    assert(profile.skills.length === 3 && profile.tools.length === 3, "广场成员技能/工具未带入");
    const plain = store.getProfile("mkt-unknown-xyz");
    assert(plain.identity.name === "mkt-unknown-xyz", "未知成员应回落默认档案");
  });
} finally {
  rmSync(storeRoot, { recursive: true, force: true });
}

// ── gateway 端到端 ───────────────────────────────────────────
const TEST_PORT = 5196;
const server = startGatewayMock({ port: TEST_PORT });
await new Promise((resolve) => server.on("listening", resolve));
try {
  const socket = new WebSocket(`ws://127.0.0.1:${TEST_PORT}/agent?token=dm-test`, "ws-ag-ui");
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let seq = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    if (message?.type === "ack" && pending.has(message.requestId)) {
      pending.get(message.requestId)(message.data);
      pending.delete(message.requestId);
    }
  });
  const action = (actionName, payload = {}) => new Promise((resolve, reject) => {
    const requestId = `dm-${++seq}`;
    pending.set(requestId, resolve);
    setTimeout(() => reject(new Error(`ack timeout: ${actionName}`)), 3000);
    socket.send(JSON.stringify({ event: "gateway.action", requestId, payload: { action: actionName, ...payload } }));
  });

  await run("gateway: dm.message.send 后对应 Agent 模拟回复", async () => {
    const before = ((await action("dm.message.list", { agentType: "Browser Agent" }))?.data?.messages || []).length;
    await action("dm.message.send", { agentType: "Browser Agent", from: "user", fromName: "我", text: "第一批线索什么时候好？" });
    await sleep(1500);
    const messages = (await action("dm.message.list", { agentType: "Browser Agent" }))?.data?.messages || [];
    assert(messages.length === before + 2, `应新增一问一答，实际新增 ${messages.length - before} 条`);
    const reply = messages[messages.length - 1];
    assert(reply.from === "Browser Agent" && reply.fromName === "线索猎人", `回复者错误：${reply.fromName}`);
    assert(/检索|线索|评论/.test(reply.text), `线索猎人回复不符合岗位：${reply.text}`);
    assert(!reply.text.includes("稍后给你反馈"), "不应继续使用统一占位回复");
  });

  await run("gateway: 不同 Agent 私聊互相隔离", async () => {
    const browserCount = ((await action("dm.message.list", { agentType: "Browser Agent" }))?.data?.messages || []).length;
    const searchCount = ((await action("dm.message.list", { agentType: "Search Agent" }))?.data?.messages || []).length;
    assert(browserCount > 0, "Browser Agent 应有私聊记录");
    assert(searchCount >= 4, "数据分析师应有自己的历史对话");
    const searchMessages = (await action("dm.message.list", { agentType: "Search Agent" }))?.data?.messages || [];
    assert(!searchMessages.some((item) => item.text === "第一批线索什么时候好？"), "Search Agent 不应看到 Browser Agent 的私聊");
  });

  await run("gateway: agent.workspace.list 返回云电脑分区", async () => {
    const workspace = (await action("agent.workspace.list", { agentType: "File Agent" }))?.data?.workspace;
    assert(workspace?.path?.includes("workspace"), "缺工作区路径");
    assert((workspace?.sections || []).length === 3, "应为 3 个分区");
  });

  await run("gateway: 广场成员私聊回复带中文名", async () => {
    await action("dm.message.send", { agentType: "mkt-follow-up", from: "user", fromName: "我", text: "帮我排一下本周跟进" });
    await sleep(1500);
    const messages = (await action("dm.message.list", { agentType: "mkt-follow-up" }))?.data?.messages || [];
    const reply = messages[messages.length - 1];
    assert(reply?.fromName === "跟跟", `广场成员回复者错误：${reply?.fromName}`);
  });

  await run("gateway: 雇佣后的 Agent 主动首句不会触发额外自动回复", async () => {
    const agentType = "mkt-lead-miner";
    const before = ((await action("dm.message.list", { agentType }))?.data?.messages || []).length;
    await action("dm.message.send", {
      agentType,
      from: agentType,
      fromName: "周砚",
      text: "你好，我是周砚，负责线索挖掘。最近有什么需要我帮你处理的客户或线索吗？"
    });
    await sleep(1500);
    const messages = (await action("dm.message.list", { agentType }))?.data?.messages || [];
    assert(messages.length === before + 1, `主动首句应只新增 1 条，实际新增 ${messages.length - before} 条`);
    assert(messages.at(-1)?.from === agentType && messages.at(-1)?.fromName === "周砚", "主动首句身份错误");
  });

  socket.close();
} finally {
  server.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n私聊/云电脑结果：${results.length - failed.length} 通过 / ${failed.length} 失败`);
process.exit(failed.length ? 1 : 0);
