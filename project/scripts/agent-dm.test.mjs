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
import { mockChiefDecision, mockConversationReply } from "../src/salebuddy/agents/dm-scenarios.js";

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

await run("mock conversation: current Douyin Agents respond like role-specific teammates", () => {
  const cases = [
    ["mkt-comment-acquisition", "帮我把评论、直播和互动里的用户都找出来"],
    ["mkt-find-people", "开始找人，先看直播和评论"],
    ["mkt-intent-analyst", "分析这批用户，筛出高意向潜客并给报告"],
    ["mkt-cold-writer", "确认发送，先联系待触达潜客"],
    ["mkt-dm-inbox", "有人发私信了，帮我继续承接对话"]
  ];
  for (const [agentType, text] of cases) {
    const reply = mockConversationReply(agentType, text);
    assert(reply && reply.length > 20, `${agentType} 缺少自然语言回复`);
    assert(!reply.includes("工作状态"), `${agentType} 不应返回状态卡文案`);
    assert(!reply.includes("等待真实任务事件"), `${agentType} 不应返回虚构的等待状态`);
  }
  assert(/负责|可以|先从/.test(mockConversationReply("mkt-comment-acquisition", "你好")), "找客专员没有自然问候回复");
  assert(/分析|意向|报告/.test(mockConversationReply("mkt-intent-analyst", "你能做什么")), "客户分析员没有能力回复");
  assert(/确认|发送/.test(mockConversationReply("mkt-cold-writer", "确认发送")), "潜客激活专员没有确认回复");
  assert(!/已经发出|发送成功/.test(mockConversationReply("mkt-cold-writer", "确认发送")), "潜客激活专员不应提前宣称发送成功");
  assert(/会话|私信|回复/.test(mockConversationReply("mkt-dm-inbox", "当前进展怎么样了")), "私信客服没有进展回复");
});

await run("mock conversation: chief routes status, guidance, and capability questions as messages", () => {
  const status = mockChiefDecision("查看所有 Agent 和任务状态");
  assert(status.decision.intent === "status_query", "幕僚长状态查询意图错误");
  assert(status.decision.responseMode === "status_card", "幕僚长状态查询展示模式错误");
  assert(/当前任务总览/.test(status.message), "幕僚长状态回复缺少任务总览");
  assert(/潜客拓展项目/.test(status.message), "幕僚长状态回复缺少当前任务");

  const guidance = mockChiefDecision("我想找评论和直播里的潜客");
  assert(guidance.decision.intent === "conversation", "幕僚长咨询应保持对话意图");
  assert(/找客专员/.test(guidance.message), "幕僚长没有引导到找客专员");

  const capability = mockChiefDecision("幕僚长能做什么？");
  assert(/全局运营管家/.test(capability.message), "幕僚长没有返回能力说明");
  assert(capability.shouldCreateTask === false, "幕僚长咨询不应创建任务");
  assert(mockChiefDecision("") === null, "空消息不应生成幕僚长回复");
});

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
    assert(profile.identity.name === "评论区找客户", `广场成员姓名错误：${profile.identity.name}`);
    assert(profile.identity.title === "评论区找客户", `广场成员职位错误：${profile.identity.title}`);
    assert(profile.role.responsibilities.includes("评论区潜客发现"), "广场成员职责未带入");
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
    await action("dm.message.send", { agentType: "Browser Agent", from: "user", fromName: "我", text: "第一批线索什么时候好？", conversationId: "mock-conversation-1" });
    await sleep(1500);
    const messages = (await action("dm.message.list", { agentType: "Browser Agent" }))?.data?.messages || [];
    assert(messages.length === before + 2, `应新增一问一答，实际新增 ${messages.length - before} 条`);
    const reply = messages[messages.length - 1];
    assert(reply.from === "Browser Agent" && reply.fromName === "线索猎人", `回复者错误：${reply.fromName}`);
    assert(/检索|线索|评论/.test(reply.text), `线索猎人回复不符合岗位：${reply.text}`);
    assert(!reply.text.includes("稍后给你反馈"), "不应继续使用统一占位回复");
    assert(reply.metadata?.source === "member-conversation", "Agent 回复缺少私聊消息来源");
    assert(reply.metadata?.conversationRole === "specialist-executor", "Agent 回复缺少执行 Agent 会话角色");
    assert(reply.metadata?.conversationId === "mock-conversation-1", "Agent 回复未保留会话上下文");
    assert(reply.metadata?.inReplyTo === messages[messages.length - 2]?.id, "Agent 回复未指向用户消息");
  });

  await run("gateway: chief.message.decide 返回可渲染消息且不会重复自动回复", async () => {
    const before = ((await action("dm.message.list", { agentType: "main" }))?.data?.messages || []).length;
    const userMessage = await action("dm.message.send", {
      agentType: "main",
      from: "user",
      fromName: "我",
      text: "查看所有 Agent 和任务状态",
      conversationId: "chief-of-staff",
      metadata: { source: "chief-conversation", suppressAutoReply: true }
    });
    assert(userMessage?.code === 0, "幕僚长用户消息未被接受");
    const decision = await action("chief.message.decide", { message: "查看所有 Agent 和任务状态" });
    assert(decision?.code === 0, "幕僚长决策未被接受");
    assert(decision.data.decision.responseMode === "status_card", "幕僚长决策展示模式错误");
    assert(/当前任务总览/.test(decision.data.message), "幕僚长决策缺少任务总览");
    await action("dm.message.send", {
      agentType: "main",
      from: "main",
      fromName: "Byering · 幕僚长",
      text: decision.data.message,
      conversationId: "chief-of-staff",
      metadata: { source: "chief-conversation", chiefDecision: decision.data.decision }
    });
    await sleep(1500);
    const messages = (await action("dm.message.list", { agentType: "main" }))?.data?.messages || [];
    assert(messages.length === before + 2, `幕僚长应新增一问一答，实际新增 ${messages.length - before} 条`);
    assert(messages.at(-1)?.from === "main", "幕僚长回复身份错误");
    assert(messages.at(-1)?.metadata?.source === "chief-conversation", "幕僚长回复缺少会话来源");
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
