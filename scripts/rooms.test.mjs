#!/usr/bin/env node
/**
 * 项目组（任务房间）数据层测试
 * 覆盖：rooms-store 单元 + gateway room.* action 端到端
 * 运行：node scripts/rooms.test.mjs
 */
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRoomsStore } from "./rooms-store.mjs";
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

// ── rooms-store 单元（临时目录，不污染项目数据）─────────────────
const storeRoot = mkdtempSync(path.join(tmpdir(), "sb-rooms-"));
try {
  const store = createRoomsStore(storeRoot);

  await run("store: 种子两个项目组且带最后消息摘要", () => {
    const rooms = store.listRooms();
    assert(rooms.length === 2, `应为 2 个种子项目组，实际 ${rooms.length}`);
    for (const room of rooms) {
      for (const field of ["id", "name", "goal", "owner", "members", "status", "createdAt", "lastMessage"]) {
        assert(room[field] !== undefined, `项目组缺少字段 ${field}`);
      }
      assert(room.lastMessage.length > 0, "种子项目组应有最后消息摘要");
    }
  });

  await run("store: 种子消息按项目组分文件存放", () => {
    const leads = store.listMessages("room-leads");
    const content = store.listMessages("room-content");
    assert(leads.length === 3 && content.length === 2, "种子消息条数不符");
    assert(leads.every((m) => m.roomId === "room-leads"), "消息 roomId 不一致");
  });

  await run("store: appendMessage 自动更新 lastMessage", () => {
    const message = store.appendMessage("room-leads", { from: "user", fromName: "我", text: "本周先聚焦 SaaS 行业" });
    assert(message.id && message.createdAt, "消息应带 id 与 createdAt");
    const room = store.listRooms().find((item) => item.id === "room-leads");
    assert(room.lastMessage.includes("本周先聚焦 SaaS 行业"), "lastMessage 未更新");
    assert(store.listMessages("room-leads").length === 4, "消息未落盘");
  });

  await run("store: createRoom 建立空消息文件", () => {
    const room = store.createRoom({ name: "单元测试项目组", goal: "验证创建", members: ["main"] });
    assert(room.id && room.status === "active", "新项目组状态错误");
    assert(room.conversationId, "新项目组应绑定办公室会话");
    assert(existsSync(path.join(storeRoot, "messages", `${room.id}.json`)), "缺消息文件");
    assert(store.listRooms().length === 3, "项目组列表未追加");
  });

  await run("store: 项目组绑定办公室会话且可切换激活", () => {
    const rooms = store.listRooms();
    assert(rooms.every((room) => room.conversationId), "每个项目组都应有 conversationId");
    assert(store.getActiveRoomId() === "room-leads", "默认激活 room-leads");
    const switched = store.setActiveRoom("room-content");
    assert(switched?.id === "room-content", "切换返回值错误");
    assert(store.getActiveRoomId() === "room-content", "激活项目组未持久化");
    assert(store.setActiveRoom("room-none") === null, "不存在项目组应返回 null");
  });
} finally {
  rmSync(storeRoot, { recursive: true, force: true });
}

// ── gateway room.* action 端到端 ─────────────────────────────
const TEST_PORT = 5199;
const server = startGatewayMock({ port: TEST_PORT });
await new Promise((resolve) => server.on("listening", resolve));

let createdRoomId = null;
try {
  const socket = new WebSocket(`ws://127.0.0.1:${TEST_PORT}/agent?token=rooms-test`, "ws-ag-ui");
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
    const requestId = `rm-${++seq}`;
    pending.set(requestId, resolve);
    setTimeout(() => reject(new Error(`ack timeout: ${actionName}`)), 3000);
    socket.send(JSON.stringify({ event: "gateway.action", requestId, payload: { action: actionName, ...payload } }));
  });

  await run("gateway: room.action.list 返回种子项目组", async () => {
    const result = await action("room.action.list");
    const rooms = result?.data?.rooms || [];
    assert(rooms.length >= 2, `至少 2 个种子项目组，实际 ${rooms.length}`);
    assert(rooms.some((r) => r.id === "room-leads"), "缺 room-leads");
  });

  await run("gateway: room.message.list 返回种子群聊", async () => {
    const result = await action("room.message.list", { roomId: "room-leads" });
    const messages = result?.data?.messages || [];
    assert(messages.length >= 3, `至少 3 条种子消息，实际 ${messages.length}`);
  });

  await run("gateway: room.message.send 后 Byering 模拟回复", async () => {
    const sent = await action("room.message.send", { roomId: "room-leads", from: "user", fromName: "我", text: "测试：先跑一轮评分" });
    assert(sent?.data?.message?.id, "发送未返回消息");
    await sleep(1500); // 模拟回复延迟 1200ms
    const messages = (await action("room.message.list", { roomId: "room-leads" }))?.data?.messages || [];
    const last = messages[messages.length - 1];
    assert(last?.from === "main" && last?.fromName === "Byering · 幕僚长", `最后一条应为 Byering 回复，实际 ${last?.fromName}`);
    const rooms = (await action("room.action.list"))?.data?.rooms || [];
    const room = rooms.find((item) => item.id === "room-leads");
    assert(room?.lastMessage.includes("收到，我来拆解"), "lastMessage 应同步为 Byering 回复");
  });

  await run("gateway: room.action.create 创建新项目组", async () => {
    const created = await action("room.action.create", { name: "端到端验证项目组", goal: "测试创建", members: ["main", "App Agent"] });
    const room = created?.data?.room;
    assert(room?.id && room.name === "端到端验证项目组", "创建结果错误");
    createdRoomId = room.id;
    const rooms = (await action("room.action.list"))?.data?.rooms || [];
    assert(rooms.some((item) => item.id === room.id), "新项目组未出现在列表");
    const messages = (await action("room.message.list", { roomId: room.id }))?.data?.messages || [];
    assert(messages.length === 0, "新项目组消息应为空");
  });

  // 记录测试前的激活项目组，结束恢复，避免影响预览环境共享数据
  const initialOffice = (await action("room.office.current"))?.data || {};

  await run("gateway: 每个项目组绑定独立办公室会话", async () => {
    const rooms = (await action("room.action.list"))?.data?.rooms || [];
    assert(rooms.every((room) => room.conversationId), "项目组缺 conversationId");
    const conversations = (await action("conversations.list", { limit: 50 }))?.data?.conversations || [];
    for (const room of rooms) {
      assert(conversations.some((c) => c.id === room.conversationId && c.title === room.name), `缺 ${room.name} 的办公室会话`);
    }
  });

  await run("gateway: room.office.switch 切换办公室", async () => {
    const target = initialOffice.roomId === "room-leads" ? "room-content" : "room-leads";
    const switched = (await action("room.office.switch", { roomId: target }))?.data || {};
    assert(switched.roomId === target && switched.conversationId, "切换返回值错误");
    const current = (await action("room.office.current"))?.data || {};
    assert(current.roomId === target, "current 未更新");
    const conversations = (await action("conversations.list", { limit: 50 }))?.data?.conversations || [];
    const activeConv = conversations.find((c) => c.id === switched.conversationId);
    assert(activeConv?.status === "in_progress", "目标会话应为进行中");
    const other = conversations.find((c) => c.id === `conv-${initialOffice.roomId}`);
    assert(!other || other.status === "completed", "原会话应转为已完成");
    // 消息层同步：目标会话 subagent running
    const messages = (await action("message.action.list", { conversation_id: switched.conversationId }))?.data?.messages || [];
    const assistant = messages.find((m) => m.role === "assistant");
    assert(assistant?.status === "generating", "目标会话主 Agent 应 generating");
    assert((assistant?.content || []).some((c) => c.type === "subagent" && c.data.status === "running"), "目标会话应有 running subagent");
  });

  // 恢复测试前的激活项目组
  if (initialOffice.roomId) await action("room.office.switch", { roomId: initialOffice.roomId });

  socket.close();
} finally {
  // 清理端到端测试创建的项目组（mock 数据目录落盘，测试不留痕）
  if (createdRoomId) {
    const roomsFile = path.join(projectRoot, "rooms", "rooms.json");
    try {
      const rooms = JSON.parse(readFileSync(roomsFile, "utf8")).filter((item) => item.id !== createdRoomId);
      writeFileSync(roomsFile, JSON.stringify(rooms, null, 2) + "\n");
      rmSync(path.join(projectRoot, "rooms", "messages", `${createdRoomId}.json`), { force: true });
    } catch { /* 清理失败不影响结果 */ }
  }
  server.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n项目组结果：${results.length - failed.length} 通过 / ${failed.length} 失败`);
process.exit(failed.length ? 1 : 0);
