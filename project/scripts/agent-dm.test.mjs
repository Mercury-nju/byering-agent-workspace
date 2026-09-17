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
import {
  DEMO_DM_AGENT_TYPES,
  demoMemoryFor,
  mockChiefDecision,
  mockConversationReply,
  mockConversationTurn
} from "../src/salebuddy/agents/dm-scenarios.js";
import { createDemoDmGateway } from "../src/salebuddy/agents/dm-demo-client.js";
import { isPrivateConversationMessage } from "../src/salebuddy/agents/direct-message-contract.js";

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
    ["mkt-dm-inbox", "有人发私信了，帮我继续承接对话"],
    ["mkt-gold-customer-service", "用金牌客服接待新私信，先回答问题再推进下一步"]
  ];
  for (const [agentType, text] of cases) {
    const reply = mockConversationReply(agentType, text);
    assert(reply && reply.length > 20, `${agentType} 缺少自然语言回复`);
    assert(!reply.includes("工作状态"), `${agentType} 不应返回状态卡文案`);
    assert(!reply.includes("等待真实任务事件"), `${agentType} 不应返回虚构的等待状态`);
  }
  assert(/负责|可以|先从/.test(mockConversationReply("mkt-comment-acquisition", "你好")), "找客专员没有自然问候回复");
  assert(/分析|意向|报告/.test(mockConversationReply("mkt-intent-analyst", "你能做什么")), "客户分析员没有能力回复");
  assert(/确认|发送/.test(mockConversationReply("mkt-cold-writer", "确认发送")), "潜客触达专员没有确认回复");
  assert(!/已经发出|发送成功/.test(mockConversationReply("mkt-cold-writer", "确认发送")), "潜客触达专员不应提前宣称发送成功");
  assert(/会话|私信|回复/.test(mockConversationReply("mkt-dm-inbox", "当前进展怎么样了")), "私信客服没有进展回复");
  assert(/金牌客服|下一步|人工/.test(mockConversationReply("mkt-gold-customer-service", "当前进展怎么样了")), "金牌客服没有独立回复");
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

await run("mock conversation: business memory supports metrics, diagnosis, solution, and applied config", () => {
  const memory = demoMemoryFor("mkt-comment-acquisition");
  assert(memory.account.name === "臻选新能源·上海", "获客管家缺少当前账号记忆");
  assert(memory.yesterday.foundUsers === 138, "获客管家缺少昨日获客数据");
  assert(memory.yesterday.aLeads === 9, "获客管家缺少昨日 A 级用户数据");
  assert(memory.yesterday.qualifiedLeads === 0, "获客管家缺少昨日转化数据");

  const metrics = mockConversationTurn("mkt-comment-acquisition", "昨天的数据怎么样？转化了多少线索？");
  assert(/138/.test(metrics.text) && /0/.test(metrics.text), `昨日数据回复不完整：${metrics.text}`);
  assert(/转化|线索/.test(metrics.text), "昨日数据回复没有说明转化线索");
  assert(/44\.44%/.test(mockConversationTurn("mkt-comment-acquisition", "昨天的触达率怎么样？").text), "触达率没有按 A 级用户口径计算");

  const improvement = mockConversationTurn("mkt-comment-acquisition", "这个数据表现怎么样可以变得更好？", { state: metrics.state });
  assert(improvement.proposal?.status === "pending", "自然语言的改善问题没有生成待确认配置");

  const diagnosis = mockConversationTurn("mkt-comment-acquisition", "为什么转化率低？", { state: metrics.state });
  assert(/触达|窗口|原因/.test(diagnosis.text), `低转化原因没有结合业务记忆：${diagnosis.text}`);

  const solution = mockConversationTurn("mkt-comment-acquisition", "后面要怎么解决？", { state: diagnosis.state });
  assert(solution.proposal?.status === "pending", "解决方案没有生成待确认配置");
  assert(/生效|确认/.test(solution.text), "配置提案没有请求用户确认");

  const cancelled = mockConversationTurn("mkt-comment-acquisition", "先不要生效", { state: solution.state });
  assert(!cancelled.appliedConfig && cancelled.state.pendingProposal, "取消配置后不应生效");

  const applied = mockConversationTurn("mkt-comment-acquisition", "ok，我觉得可以，就这样调整", { state: cancelled.state });
  assert(applied.appliedConfig?.touchWindow === "2 小时内", "确认后没有应用首触窗口配置");
  assert(!applied.state.pendingProposal, "确认后仍保留待确认配置");
  assert(/已生效/.test(applied.text), `确认后的回复没有说明已生效：${applied.text}`);
});

await run("mock conversation: every turn carries the Agent conversation contract", () => {
  const finder = mockConversationTurn("mkt-find-people", "昨天找到了多少人？");
  const outreach = mockConversationTurn("mkt-cold-writer", "后面怎么优化？");
  assert(finder.state.conversationScenarioId === "conversation:mkt-find-people", "找客专员没有绑定对话契约");
  assert(finder.state.conversationFamily === "discovery", "找客专员没有绑定 discovery 场景族");
  assert(outreach.state.conversationScenarioId === "conversation:mkt-cold-writer", "潜客触达专员没有绑定对话契约");
  assert(outreach.state.conversationFamily === "outreach", "潜客触达专员没有绑定 outreach 场景族");
});

await run("mock conversation: every investor-demo Agent has domain memory and an actionable improvement flow", () => {
  for (const agentType of DEMO_DM_AGENT_TYPES) {
    const memory = demoMemoryFor(agentType);
    assert(memory.businessContext?.length > 20, `${agentType} 缺少业务记忆摘要`);
    assert(memory.metrics && Object.keys(memory.metrics).length > 0, `${agentType} 缺少业务指标记忆`);
    const result = mockConversationTurn(agentType, "后面怎么优化？");
    assert(result.text.length > 30, `${agentType} 优化回复过短`);
    assert(result.proposal?.changes?.length > 0, `${agentType} 没有给出可执行配置提案`);
    assert(/确认|生效/.test(result.text), `${agentType} 没有请求配置生效确认`);
  }
});

await run("demo gateway: confirmed strategy persists at Agent level across conversations", async () => {
  const gateway = createDemoDmGateway({ delayMs: 5 });
  const agentType = "mkt-comment-acquisition";
  const send = async (conversationId, text) => {
    await gateway.action("dm.message.send", { agentType, from: "user", fromName: "我", text, conversationId });
    await sleep(20);
    const messages = (await gateway.action("dm.message.list", { agentType }))?.data?.messages || [];
    return messages.filter((message) => message.conversationId === conversationId).at(-1);
  };

  await send("config-persistence-flow", "后面要怎么解决？");
  const applied = await send("config-persistence-flow", "ok，就这样调整");
  assert(applied?.metadata?.demoConfigApplied?.touchWindow === "2 小时内", "网关没有保存 Agent 级策略");
  assert(gateway.getDemoConfig(agentType).priorityRule === "价格 + 到店信号优先", "网关没有暴露已生效的 Agent 配置");

  const nextConversation = await send("new-conversation-after-config", "后面怎么优化？");
  assert(/2 小时内/.test(nextConversation?.text || ""), "新会话没有读取已生效的 Agent 配置");
  gateway.dispose();
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

  await run("store: 投资人演示覆盖幕僚长与五位抖音 Agent", () => {
    for (const agentType of DEMO_DM_AGENT_TYPES) {
      const messages = store.listDm(agentType);
      assert(messages.length >= 4, `${agentType} 演示对话不足`);
      assert(messages.some((item) => item.from === "user"), `${agentType} 缺用户输入`);
      assert(messages.some((item) => item.artifact?.content), `${agentType} 缺可查看的业务产出`);
      assert(messages.filter((item) => item.from !== "user").every(isPrivateConversationMessage), `${agentType} 的演示回复不能被对话过滤器丢弃`);
      assert(!messages.every((item) => /工作状态|等待真实任务事件/.test(item.text)), `${agentType} 不能只有状态通知`);
    }
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

  await run("gateway: mock 演示会话隔离旧的运行日志", async () => {
    const messages = (await action("dm.message.list", { agentType: "mkt-comment-acquisition" }))?.data?.messages || [];
    assert(messages.length >= 6, "抖音获客管家应有完整演示历史");
    assert(messages.some((item) => item.artifact?.name === "抖音获客管家日报-2026-09-14.html"), "缺日报产出卡片");
    assert(messages.some((item) => /4,286|138 位|26 位/.test(item.text)), "缺少具体获客数据");
    assert(!messages.some((item) => /今天的托管工作我已经整理好了/.test(item.text)), "不应显示旧的重复日报消息");
  });

  await run("gateway: demo Agent remembers a proposal until explicit confirmation", async () => {
    const agentType = "mkt-comment-acquisition";
    const conversationId = "investor-memory-flow";
    const sendAndWait = async (text) => {
      await action("dm.message.send", { agentType, from: "user", fromName: "我", text, conversationId });
      await sleep(1500);
      const messages = (await action("dm.message.list", { agentType }))?.data?.messages || [];
      return messages.filter((item) => item.conversationId === conversationId);
    };

    const metrics = await sendAndWait("昨天的数据怎么样？转化了多少线索？");
    assert(metrics.at(-1)?.from === agentType && /138|0/.test(metrics.at(-1)?.text || ""), "网关没有返回带记忆的昨日数据");
    await sendAndWait("为什么转化率低？");
    const proposalMessages = await sendAndWait("后面要怎么解决？");
    const proposal = proposalMessages.at(-1);
    assert(proposal?.metadata?.demoProposal?.status === "pending", "网关没有保存待确认提案");

    const appliedMessages = await sendAndWait("可以");
    const applied = appliedMessages.at(-1);
    assert(applied?.metadata?.demoConfigApplied?.touchWindow === "2 小时内", "网关确认后没有应用配置");
    assert(/已生效/.test(applied?.text || ""), "网关没有返回配置已生效提示");
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
