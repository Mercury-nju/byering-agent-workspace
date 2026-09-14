/**
 * scripts/rooms-store.mjs
 * 项目组（任务房间）磁盘持久化（gateway-mock 使用）。
 *
 * 目录：rooms/
 *   rooms.json            项目组列表
 *   messages/<roomId>.json  各项目组群聊消息
 *
 * 数据模型（PRD 模块 4：任务房间十项定义）：
 *   Room { id, name, goal, owner, members[], deadline, budget, tools[], dataScope[],
 *          deliverables[], acceptance, maxRetries, status, createdAt, lastMessage }
 *   RoomMessage { id, roomId, from, fromName, text, createdAt }
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync } from "node:fs";
import path from "node:path";

function readJson(file, fallback) {
  try { return JSON.parse(readFileSync(file, "utf8")); } catch { return fallback; }
}

function writeJsonAtomic(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n");
  renameSync(tmp, file);
}

const DEFAULT_ROOMS = [
  {
    id: "room-leads",
    name: "潜在客户拓展项目组",
    goal: "找到 200 个符合条件的潜在客户，并制定一套可执行的触达方案",
    owner: "main",
    members: ["main", "Browser Agent", "Search Agent", "App Agent"],
    deadline: "2026-08-20T18:00",
    budget: 120,
    tools: ["全网搜索", "工商数据", "地图采集", "邮箱"],
    dataScope: ["公开网页", "工商公开信息", "项目共享文件"],
    deliverables: ["线索清单", "触达方案", "话术包"],
    acceptance: "200 个有效潜客，联系方式补全率 ≥ 60%，触达方案通过审批",
    maxRetries: 3,
    status: "active",
    createdAt: "2026-08-05T09:30:00.000Z",
    lastMessage: "线索猎人已完成第一轮检索，数据分析师开始清洗评分。",
    conversationId: "conv-room-leads"
  },
  {
    id: "room-content",
    name: "触达内容共创项目组",
    goal: "为首批 50 个高评分线索生成个性化沟通内容",
    owner: "main",
    members: ["main", "App Agent", "File Agent"],
    deadline: "2026-08-15T18:00",
    budget: 60,
    tools: ["文档", "素材库", "模板库"],
    dataScope: ["线索清单", "话术库", "素材库"],
    deliverables: ["个性化沟通内容 50 份"],
    acceptance: "50 份内容全部通过销售顾问审阅，无夸大承诺类表述",
    maxRetries: 2,
    status: "active",
    createdAt: "2026-08-05T14:10:00.000Z",
    lastMessage: "内容策划已产出 12 份初稿，等待销售顾问审阅。",
    conversationId: "conv-room-content"
  }
];

const DEFAULT_MESSAGES = {
  "room-leads": [
    { id: "msg-leads-1", roomId: "room-leads", from: "main", fromName: "Byering · 幕僚长", text: "项目组已成立。目标：200 个符合条件的潜在客户 + 可执行的触达方案。线索猎人先启动检索。", createdAt: "2026-08-05T09:31:00.000Z" },
    { id: "msg-leads-2", roomId: "room-leads", from: "Browser Agent", fromName: "线索猎人", text: "收到，已开始按画像条件检索，第一批候选 2 小时后汇总。", createdAt: "2026-08-05T09:32:00.000Z" },
    { id: "msg-leads-3", roomId: "room-leads", from: "Search Agent", fromName: "数据分析师", text: "我同步准备清洗与评分规则，等第一批数据到位即开始。", createdAt: "2026-08-05T09:33:00.000Z" }
  ],
  "room-content": [
    { id: "msg-content-1", roomId: "room-content", from: "main", fromName: "Byering · 幕僚长", text: "首批 50 个高评分线索已锁定，请内容策划按行业分组起草沟通内容。", createdAt: "2026-08-05T14:11:00.000Z" },
    { id: "msg-content-2", roomId: "room-content", from: "File Agent", fromName: "内容策划", text: "已完成 SaaS 组 12 份初稿，提交销售顾问审阅。", createdAt: "2026-08-05T15:40:00.000Z" }
  ]
};

export function createRoomsStore(root) {
  const roomsFile = path.join(root, "rooms.json");
  const metaFile = path.join(root, "meta.json");
  const messagesDir = path.join(root, "messages");
  mkdirSync(messagesDir, { recursive: true });
  if (!existsSync(roomsFile)) writeJsonAtomic(roomsFile, DEFAULT_ROOMS);
  for (const [roomId, messages] of Object.entries(DEFAULT_MESSAGES)) {
    const file = path.join(messagesDir, `${roomId}.json`);
    if (!existsSync(file)) writeJsonAtomic(file, messages);
  }
  // 迁移：老数据补 conversationId（每个项目组绑定一个办公室会话）与 PRD 十项定义字段
  {
    const rooms = readJson(roomsFile, []);
    const defaultsById = new Map(DEFAULT_ROOMS.map((room) => [room.id, room]));
    let dirty = false;
    for (const room of rooms) {
      if (!room.conversationId) { room.conversationId = `conv-${room.id}`; dirty = true; }
      const seed = defaultsById.get(room.id) || {};
      for (const key of ["deadline", "budget", "tools", "dataScope", "deliverables", "acceptance", "maxRetries"]) {
        if (room[key] === undefined) { room[key] = seed[key] ?? (Array.isArray(seed[key]) ? [] : null); dirty = true; }
      }
    }
    if (dirty) writeJsonAtomic(roomsFile, rooms);
  }
  if (!existsSync(metaFile)) writeJsonAtomic(metaFile, { activeRoomId: DEFAULT_ROOMS[0].id });

  return {
    listRooms() {
      return readJson(roomsFile, []);
    },

    /** 当前办公室对应的项目组（每个办公室 = 一个项目组） */
    getActiveRoomId() {
      return readJson(metaFile, {})?.activeRoomId || null;
    },

    setActiveRoom(roomId) {
      const rooms = this.listRooms();
      const room = rooms.find((item) => item.id === roomId);
      if (!room) return null;
      writeJsonAtomic(metaFile, { activeRoomId: roomId });
      return room;
    },

    createRoom({ name, goal = "", owner = "main", members = ["main"], deadline = null, budget = null, tools = [], dataScope = [], deliverables = [], acceptance = "", maxRetries = 3 }) {
      const rooms = this.listRooms();
      const room = {
        id: `room-${Date.now().toString(36)}`,
        name: String(name || "未命名项目组"),
        goal,
        owner,
        members,
        deadline: deadline || null,
        budget: budget == null ? null : Number(budget),
        tools: Array.isArray(tools) ? tools : [],
        dataScope: Array.isArray(dataScope) ? dataScope : [],
        deliverables: Array.isArray(deliverables) ? deliverables : [],
        acceptance: String(acceptance || ""),
        maxRetries: Number.isFinite(Number(maxRetries)) ? Number(maxRetries) : 3,
        status: "active",
        createdAt: new Date().toISOString(),
        lastMessage: "",
        conversationId: `conv-room-${Date.now().toString(36)}`
      };
      rooms.push(room);
      writeJsonAtomic(roomsFile, rooms);
      writeJsonAtomic(path.join(messagesDir, `${room.id}.json`), []);
      return room;
    },

    listMessages(roomId) {
      return readJson(path.join(messagesDir, `${roomId}.json`), []);
    },

    appendMessage(roomId, { from, fromName, text }) {
      const file = path.join(messagesDir, `${roomId}.json`);
      const messages = readJson(file, []);
      const message = {
        id: `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        roomId,
        from: from || "user",
        fromName: fromName || "我",
        text: String(text || ""),
        createdAt: new Date().toISOString()
      };
      messages.push(message);
      writeJsonAtomic(file, messages);

      // 更新项目组最后一条消息摘要
      const rooms = this.listRooms();
      const room = rooms.find((item) => item.id === roomId);
      if (room) {
        room.lastMessage = `${message.fromName}：${message.text}`.slice(0, 60);
        writeJsonAtomic(roomsFile, rooms);
      }
      return message;
    }
  };
}
