#!/usr/bin/env node
/**
 * 团队状态派生测试（agents/status.js）+ 与 gateway-mock 数据的一致性验证
 * 运行：node scripts/team-status.test.mjs
 */
import {
  deriveTeamStatus,
  latestAssistantMessage,
  extractSubagents,
  hasPendingApproval,
  TEAM_STATES
} from "../src/salebuddy/agents/status.js";
import { AGENT_TYPE_DEFAULTS } from "../src/salebuddy/agents/model.js";
import { startGatewayMock } from "./gateway-mock.mjs";

const KNOWN = Object.keys(AGENT_TYPE_DEFAULTS);
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

await run("latestAssistantMessage 取最后一条 assistant", () => {
  const messages = [
    { role: "user", content: [] },
    { role: "assistant", id: "a1", status: "completed" },
    { role: "assistant", id: "a2", status: "generating" }
  ];
  assert(latestAssistantMessage(messages)?.id === "a2", "未取到最后一条");
  assert(latestAssistantMessage([{ role: "user" }]) === null, "无 assistant 应返回 null");
});

await run("extractSubagents 与 dCe 同形（name 即 agentType）", () => {
  const message = {
    role: "assistant",
    status: "generating",
    content: [
      { type: "message", text: "安排中" },
      { type: "subagent", data: { id: "s1", name: "Browser Agent", parentAgentId: "main", status: "running" } },
      { type: "subagent", data: { id: "s2", name: "File Agent", status: "failed" } }
    ]
  };
  const subs = extractSubagents(message);
  assert(subs.length === 2 && subs[0].name === "Browser Agent" && subs[0].status === "running", "提取失败");
  assert(subs[1].status === "failed" && subs[1].parentAgentId === null, "缺省字段处理错误");
});

await run("deriveTeamStatus：主 Agent generating → 工作中并携带任务", () => {
  const conversations = [{ id: "c1", title: "找 200 个潜在客户", status: "in_progress" }];
  const team = deriveTeamStatus(conversations, () => [{ role: "assistant", status: "generating", content: [] }], KNOWN);
  const main = team.get("main");
  assert(main.state === TEAM_STATES.WORKING && main.currentTask === "找 200 个潜在客户", "主 Agent 状态错误");
  assert(team.get("File Agent").state === TEAM_STATES.IDLE, "无活动员工应空闲");
});

await run("deriveTeamStatus：subagent running/failed → 工作/阻塞，completed 不产生活动", () => {
  const conversations = [{ id: "c1", title: "触达方案", status: "in_progress" }];
  const message = {
    role: "assistant",
    status: "generating",
    content: [
      { type: "subagent", data: { id: "s1", name: "Browser Agent", status: "running" } },
      { type: "subagent", data: { id: "s2", name: "File Agent", status: "failed" } },
      { type: "subagent", data: { id: "s3", name: "Search Agent", status: "completed" } }
    ]
  };
  const team = deriveTeamStatus(conversations, () => [message], KNOWN);
  assert(team.get("Browser Agent").state === TEAM_STATES.WORKING, "running 应为工作中");
  assert(team.get("File Agent").state === TEAM_STATES.BLOCKED, "failed 应为阻塞");
  assert(team.get("Search Agent").state === TEAM_STATES.IDLE, "completed 不应产生活动状态");
});

await run("deriveTeamStatus：待审批标记", () => {
  const conversations = [{ id: "c1", title: "发邮件", status: "in_progress" }];
  const withApproval = {
    role: "assistant",
    status: "generating",
    content: [{ type: "approval", data: { status: "pending", action: "发送邮件" } }]
  };
  assert(hasPendingApproval(withApproval), "待审批检测失败");
  const team = deriveTeamStatus(conversations, () => [withApproval], KNOWN);
  assert(team.get("main").waitingApproval === true, "主 Agent 应标记待审批");
});

await run("deriveTeamStatus：全部完成 → 全员空闲", () => {
  const conversations = [{ id: "c1", title: "已完成任务", status: "completed" }];
  const message = {
    role: "assistant",
    status: "completed",
    content: [{ type: "subagent", data: { id: "s1", name: "Browser Agent", status: "completed" } }]
  };
  const team = deriveTeamStatus(conversations, () => [message], KNOWN);
  for (const [, entry] of team) {
    assert(entry.state === TEAM_STATES.IDLE || entry.state === TEAM_STATES.OFFLINE, `${entry.agentType} 完成态下不应工作`);
    assert(entry.activeConversations === 0, `${entry.agentType} 不应有活动会话`);
  }
});

// ── 与 gateway-mock 真实数据的一致性 ──────────────────────────
const TEST_PORT = 5197;
const server = startGatewayMock({ port: TEST_PORT });
await new Promise((resolve) => server.on("listening", resolve));
try {
  const socket = new WebSocket(`ws://127.0.0.1:${TEST_PORT}/agent?token=team-status`, "ws-ag-ui");
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let seq = 0;
  const pendingAcks = new Map();
  socket.addEventListener("message", (event) => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    if (message?.type === "ack" && pendingAcks.has(message.requestId)) {
      pendingAcks.get(message.requestId)(message.data);
      pendingAcks.delete(message.requestId);
    }
  });
  const action = (actionName, payload = {}) => new Promise((resolve, reject) => {
    const requestId = `ts-${++seq}`;
    pendingAcks.set(requestId, resolve);
    setTimeout(() => reject(new Error(`ack timeout: ${actionName}`)), 3000);
    socket.send(JSON.stringify({ event: "gateway.action", requestId, payload: { action: actionName, ...payload } }));
  });

  await run("一致性：mock 种子历史会话 → Browser Agent 工作中、main 工作中", async () => {
    const conversationsResult = await action("conversations.list", { limit: 50 });
    const conversations = conversationsResult?.data?.conversations || [];
    const cache = new Map();
    for (const c of conversations.filter((x) => x.status === "in_progress")) {
      const result = await action("message.action.list", { conversation_id: c.id });
      cache.set(c.id, result?.data?.messages || []);
    }
    const team = deriveTeamStatus(conversations, (id) => cache.get(id) || [], KNOWN);
    assert(team.get("Browser Agent").state === TEAM_STATES.WORKING, "种子会话的 Browser Agent 应为工作中");
    assert(team.get("Browser Agent").currentTask === "历史会话（含进行中 subagent）", "任务名应来自会话标题");
    assert(team.get("main").state === TEAM_STATES.WORKING, "主 Agent 应为工作中");
  });

  socket.close();
} finally {
  server.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n团队状态结果：${results.length - failed.length} 通过 / ${failed.length} 失败`);
process.exit(failed.length ? 1 : 0);
