import http from "node:http";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAgentStore } from "./agent-store.mjs";
import { createRoomsStore } from "./rooms-store.mjs";
import { roleReply } from "../src/salebuddy/agents/dm-scenarios.js";
import { resolveBusinessPrompt } from "../src/salebuddy/business/prompt-catalog.js";
import { buildMaterialArtifact } from "../src/salebuddy/materials/material-generator.js";
import PptxGenJS from "pptxgenjs";

const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function json(response, status, body, origin = "*") {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Content-Type, x-businessid, x-timestamp, x-nonce, x-signature, authorization",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS"
  });
  response.end(status === 204 ? undefined : JSON.stringify(body));
}

function ok(data = {}) {
  return { code: 0, data };
}

function conversation(id, title, status = "completed") {
  const now = new Date().toISOString();
  return {
    id,
    title,
    status,
    created_at: now,
    updated_at: now,
    metadata: { source: "recovered-office" },
    message_count: status === "completed" ? 1 : 0,
    last_message_preview: status === "completed" ? "已连接到恢复版办公室。" : "正在处理中…"
  };
}

function readJson(request) {
  return new Promise((resolve) => {
    let body = "";
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch { resolve({}); }
    });
  });
}

function websocketFrame(text) {
  const payload = Buffer.from(text);
  if (payload.length < 126) return Buffer.concat([Buffer.from([0x81, payload.length]), payload]);
  if (payload.length < 65536) {
    const header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(payload.length, 2);
    return Buffer.concat([header, payload]);
  }
  const header = Buffer.alloc(10);
  header[0] = 0x81;
  header[1] = 127;
  header.writeBigUInt64BE(BigInt(payload.length), 2);
  return Buffer.concat([header, payload]);
}

function parseWebsocketFrames(buffer) {
  const frames = [];
  let offset = 0;
  while (buffer.length - offset >= 2) {
    const first = buffer[offset];
    const second = buffer[offset + 1];
    const opcode = first & 0x0f;
    let length = second & 0x7f;
    let headerLength = 2;
    if (length === 126) {
      if (buffer.length - offset < 4) break;
      length = buffer.readUInt16BE(offset + 2);
      headerLength = 4;
    } else if (length === 127) {
      if (buffer.length - offset < 10) break;
      const longLength = buffer.readBigUInt64BE(offset + 2);
      if (longLength > BigInt(Number.MAX_SAFE_INTEGER)) break;
      length = Number(longLength);
      headerLength = 10;
    }
    const masked = (second & 0x80) !== 0;
    const maskLength = masked ? 4 : 0;
    if (buffer.length - offset < headerLength + maskLength + length) break;
    let payload = buffer.subarray(offset + headerLength + maskLength, offset + headerLength + maskLength + length);
    if (masked) {
      const mask = buffer.subarray(offset + headerLength, offset + headerLength + 4);
      payload = Buffer.from(payload);
      for (let index = 0; index < payload.length; index += 1) payload[index] ^= mask[index % 4];
    }
    frames.push({ opcode, payload });
    offset += headerLength + maskLength + length;
  }
  return { frames, remaining: buffer.subarray(offset) };
}

function createGatewayState() {
  const rooms = createRoomsStore(path.join(projectRoot, "rooms"));
  const activeRoomId = rooms.getActiveRoomId();
  const conversations = [
    conversation("recovered-office-1", "恢复版办公室"),
    conversation("recovered-office-history", "历史会话（含进行中 subagent）", "in_progress")
  ];
  const messages = {
    "recovered-office-history": [{
      id: "history-assistant-1",
      role: "assistant",
      status: "generating",
      content: [{
        type: "subagent",
        data: { id: "history-sub-browser", name: "Browser Agent", parentAgentId: "main", status: "running", contents: [] }
      }]
    }]
  };
  // 每个项目组绑定一个办公室会话：激活项目组的会话进行中（成员工作中），其余已完成
  for (const room of rooms.listRooms()) {
    const active = room.id === activeRoomId;
    conversations.push(conversation(room.conversationId, room.name, active ? "in_progress" : "completed"));
    messages[room.conversationId] = [{
      id: `room-office-${room.id}`,
      role: "assistant",
      status: active ? "generating" : "complete",
      content: (room.members || []).filter((member) => member !== "main").map((member, index) => ({
        type: "subagent",
        data: { id: `room-sub-${room.id}-${index}`, name: member, parentAgentId: "main", status: active ? "running" : "completed", contents: [] }
      }))
    }];
  }
  return {
    conversations,
    // conversationId -> renderer 消息结构（与 dCe 适配器期望的形状一致）
    messages,
    schedules: [],
    clients: new Set(),
    runCounter: 0,
    inProgress: new Set(),
    shares: [],
    materials: new Map(),
    agents: createAgentStore(path.join(projectRoot, "agents")),
    rooms,
    settings: {
      plan: "专业版",
      credits: 1280,
      selectedCredit: 500,
      connectedConnectorIds: [],
      customConnectors: [],
      payments: [{ id: "visa-4242", brand: "VISA", title: "Visa •••• 4242", meta: "到期 08/28", primary: true }],
      billing: [
        { id: "bill-2026-08-plan", date: "2026/08/01", title: "专业版订阅", amount: "¥199.00", status: "已支付" },
        { id: "bill-2026-07-credit", date: "2026/07/24", title: "积分充值 · 1,000", amount: "¥100.00", status: "已支付" },
        { id: "bill-2026-07-plan", date: "2026/07/01", title: "专业版订阅", amount: "¥199.00", status: "已支付" }
      ]
    }
  };
}

function sendEvent(client, event, data = {}) {
  if (client.socket.destroyed) return;
  client.socket.write(websocketFrame(JSON.stringify({ type: "event", event, data })));
}

function sendAck(client, requestId, data) {
  if (client.socket.destroyed) return;
  client.socket.write(websocketFrame(JSON.stringify({ type: "ack", requestId, data })));
}

export async function buildPptx({ title, transcript, duration } = {}) {
  const pptx = new PptxGenJS();
  pptx.author = "倾耳";
  pptx.subject = "录音转物料";
  pptx.title = title || "未命名访谈物料";
  const slide = pptx.addSlide();
  slide.background = { color: "F7F8FA" };
  slide.addText(title || "未命名访谈物料", { x: 0.7, y: 0.7, w: 11.8, h: 0.6, fontFace: "Arial", fontSize: 26, bold: true, color: "17191D", margin: 0 });
  slide.addText("倾耳 · 录音转物料", { x: 0.7, y: 1.45, w: 11.8, h: 0.35, fontFace: "Arial", fontSize: 12, color: "68707C", margin: 0 });
  slide.addText(`录音时长：${Number(duration) || 0} 秒\n\n${transcript || "录音已完成，待接入转写服务后会自动填充逐字稿。"}`, { x: 0.7, y: 2.1, w: 11.6, h: 3.4, fontFace: "Arial", fontSize: 18, color: "20242B", breakLine: false, fit: "shrink", margin: 0.08, valign: "top" });
  return pptx.write({ outputType: "nodebuffer" });
}

async function actionResult(state, action, payload) {
  if (action === "conversations.list") {
    const limit = Number(payload?.limit) || 20;
    const conversations = state.conversations.slice(0, limit);
    return { ok: true, data: { conversations, has_more: false, next_cursor: null, total: state.conversations.length } };
  }
  if (action === "schedule.action.list") return ok(state.schedules);
  if (action === "schedule.action.create") {
    const item = { id: `schedule-${Date.now()}`, ...(payload?.schedule || payload || {}) };
    state.schedules.push(item);
    return ok(item);
  }
  if (action === "schedule.action.update") {
    const id = payload?.id || payload?.schedule?.id;
    const index = state.schedules.findIndex((item) => item.id === id);
    if (index >= 0) state.schedules[index] = { ...state.schedules[index], ...(payload.schedule || payload) };
    return ok(index >= 0 ? state.schedules[index] : {});
  }
  if (action === "schedule.action.delete") {
    const id = payload?.id;
    state.schedules = state.schedules.filter((item) => item.id !== id);
    return ok({ id });
  }
  if (action === "schedule.action.read") return ok(state.schedules.find((item) => item.id === payload?.id) || {});
  if (action === "schedule.action.exec") return ok({ id: payload?.id, executed: true });
  if (action === "skill.action.list") return ok([]);
  if (action.startsWith("message.action.")) {
    const conversationId = payload?.conversation_id || payload?.conversationId || payload?.id;
    const messages = state.messages[conversationId] || [];
    return ok({ messages, has_more: false, next_cursor: null, total: messages.length });
  }
  if (action === "switch.action.get") return ok({ luckin_ordering_switch: 0 });
  if (action === "location.action.query") return ok({ city: "", province: "", country: "" });
  if (action.startsWith("weixin.")) return ok({ connected: false, status: "disconnected" });
  if (action === "account.settings.get") return ok({ settings: state.settings });
  if (action === "connector.connect") {
    const id = payload?.connectorId;
    if (!id) return { code: -1, message: "connectorId is required" };
    if (!state.settings.connectedConnectorIds.includes(id)) state.settings.connectedConnectorIds.push(id);
    return ok({ connected: true, connectorId: id });
  }
  if (action === "connector.disconnect") {
    const id = payload?.connectorId;
    state.settings.connectedConnectorIds = state.settings.connectedConnectorIds.filter((value) => value !== id);
    return ok({ connected: false, connectorId: id });
  }
  if (action === "connector.custom.create") {
    const connector = { id: `custom-${Date.now()}`, ...(payload?.connector || {}) };
    state.settings.customConnectors.push(connector);
    return ok({ connector });
  }
  if (action === "billing.plan.update") {
    const plan = payload?.plan;
    if (!["基础版", "专业版", "企业版"].includes(plan)) return { code: -1, message: "unknown plan" };
    state.settings.plan = plan;
    state.settings.billing.unshift({ id: `bill-${Date.now()}`, date: new Date().toISOString().slice(0, 10).replaceAll("-", "/"), title: `${plan}订阅`, amount: plan === "基础版" ? "¥0.00" : plan === "专业版" ? "¥199.00" : "¥699.00", status: "待确认" });
    return ok({ settings: state.settings });
  }
  if (action === "billing.credits.recharge") {
    const amount = Number(payload?.credits ?? payload?.amount);
    if (!Number.isFinite(amount) || amount <= 0) return { code: -1, message: "credits must be positive" };
    state.settings.credits += Math.round(amount);
    state.settings.billing.unshift({ id: `bill-${Date.now()}`, date: new Date().toISOString().slice(0, 10).replaceAll("-", "/"), title: `积分充值 · ${Math.round(amount).toLocaleString("zh-CN")}`, amount: `¥${(amount / 10).toFixed(2)}`, status: "待确认" });
    return ok({ settings: state.settings });
  }
  if (action === "billing.payment.add") {
    const payment = payload?.payment || payload || {};
    const digits = String(payment.last4 || "").replace(/\D/g, "").slice(-4);
    if (digits.length !== 4) return { code: -1, message: "last4 is required" };
    const next = { id: `card-${Date.now()}`, brand: payment.brand || "CARD", title: `银行卡 •••• ${digits}`, meta: `到期 ${payment.expiry || "未填写"}`, primary: state.settings.payments.length === 0 };
    state.settings.payments.push(next);
    return ok({ payment: next, settings: state.settings });
  }
  if (action === "billing.payment.default") {
    state.settings.payments.forEach((payment) => { payment.primary = payment.id === payload?.paymentId; });
    return ok({ settings: state.settings });
  }
  if (action === "billing.payment.remove") {
    if (state.settings.payments.length <= 1) return { code: -1, message: "at least one payment method is required" };
    state.settings.payments = state.settings.payments.filter((payment) => payment.id !== payload?.paymentId);
    return ok({ settings: state.settings });
  }
  if (action === "billing.list") return ok({ billing: state.settings.billing });
  // ── SaleBuddy 员工模型持久化（agent-store，磁盘落地 agents/<agentId>/）──
  if (action === "agent.profile.get") return ok({ profile: state.agents.getProfile(payload?.agentType || "main") });
  if (action === "agent.profile.update") return ok({ profile: state.agents.updateProfile(payload?.agentType || "main", payload?.patch || {}) });
  if (action === "agent.memory.list") return ok({ entries: state.agents.listMemory(payload?.agentType || "main", payload?.kind || null) });
  if (action === "agent.memory.append") {
    const entry = payload?.entry || {};
    return ok({ entry: state.agents.appendMemory(payload?.agentType || "main", entry) });
  }
  if (action === "agent.memory.revise") return ok({ entry: state.agents.reviseMemory(payload?.agentType || "main", payload?.entryId, payload?.text) });
  if (action === "agent.memory.rollback") return ok({ entry: state.agents.rollbackMemory(payload?.agentType || "main", payload?.entryId) });
  if (action === "agent.memory.delete") return ok({ entry: state.agents.deleteMemory(payload?.agentType || "main", payload?.entryId) });
  if (action === "agent.permission.get") return ok({ permission: state.agents.getPermission(payload?.agentType || "main") });
  if (action === "agent.permission.update") return ok({ permission: state.agents.updatePermission(payload?.agentType || "main", payload?.permission || {}) });
  // ── SaleBuddy 项目组（任务房间）──
  if (action === "room.action.list") return ok({ rooms: state.rooms.listRooms() });
  if (action === "room.action.create") {
    const room = state.rooms.createRoom(payload || {});
    // 新项目组同步生成办公室会话（初始为已完成，切换后激活）
    state.conversations.push(conversation(room.conversationId, room.name, "completed"));
    state.messages[room.conversationId] = [{
      id: `room-office-${room.id}`,
      role: "assistant",
      status: "complete",
      content: (room.members || []).filter((member) => member !== "main").map((member, index) => ({
        type: "subagent",
        data: { id: `room-sub-${room.id}-${index}`, name: member, parentAgentId: "main", status: "completed", contents: [] }
      }))
    }];
    return ok({ room });
  }
  if (action === "room.message.list") return ok({ messages: state.rooms.listMessages(payload?.roomId) });
  if (action === "room.message.send") {
    const message = state.rooms.appendMessage(payload?.roomId, payload || {});
    // 模拟协作：用户发言后 SaleBuddy 简短回应（UI 轮询可见）
    if ((payload?.from || "user") === "user") {
      setTimeout(() => {
        const business = resolveBusinessPrompt(payload?.text);
        state.rooms.appendMessage(payload?.roomId, {
          from: "main",
          fromName: "Byering · 幕僚长",
          text: `收到，我来拆解${business.label}任务，先确认目标、数据范围和验收口径，再安排对应成员跟进；外部动作会在审批后执行。`
        });
      }, 1200);
    }
    return ok({ message });
  }
  // ── SaleBuddy 办公室 × 项目组：每个办公室对应一个项目组，支持切换 ──
  if (action === "room.office.current") {
    const roomId = state.rooms.getActiveRoomId();
    const room = state.rooms.listRooms().find((item) => item.id === roomId) || null;
    return ok({ roomId: room?.id || null, conversationId: room?.conversationId || null });
  }
  if (action === "room.office.switch") {
    const room = state.rooms.setActiveRoom(payload?.roomId);
    if (!room) return ok({ roomId: null, conversationId: null, error: "room not found" });
    for (const item of state.rooms.listRooms()) {
      const conv = state.conversations.find((c) => c.id === item.conversationId);
      if (!conv) continue;
      const active = item.id === room.id;
      conv.status = active ? "in_progress" : "completed";
      conv.updated_at = new Date().toISOString();
      const assistant = (state.messages[item.conversationId] || []).find((m) => m.role === "assistant");
      if (assistant) {
        assistant.status = active ? "generating" : "complete";
        for (const content of assistant.content || []) {
          if (content.type === "subagent") content.data.status = active ? "running" : "completed";
        }
      }
    }
    return ok({ roomId: room.id, conversationId: room.conversationId });
  }
  // ── SaleBuddy 私聊（与指定 Agent 的 1:1 会话）──
  if (action === "dm.message.list") return ok({ messages: state.agents.listDm(payload?.agentType || "main") });
  if (action === "dm.message.send") {
    const agentType = payload?.agentType || "main";
    const message = state.agents.appendDm(agentType, payload || {});
    // Simulated collaboration: every employee replies in their own role.
    if ((payload?.from || "user") === "user") {
      setTimeout(() => {
        const name = state.agents.getProfile(agentType)?.identity?.name || agentType;
        state.agents.appendDm(agentType, { from: agentType, fromName: name, text: roleReply(agentType, payload?.text) });
      }, 1200);
    }
    return ok({ message });
  }
  // ── SaleBuddy 云电脑（Agent 工作区文件概览）──
  if (action === "agent.workspace.list") return ok({ workspace: state.agents.listWorkspace(payload?.agentType || "main") });
  if (action === "material.generate") {
    const formatId = payload?.formatId;
    if (formatId === "ppt") {
      const body = await buildPptx({ title: payload?.title, transcript: payload?.transcript, duration: payload?.duration });
      const materialId = payload?.materialId || `material-${Date.now()}`;
      const result = { materialId, formatId, mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", bodyBase64: body.toString("base64"), ready: true };
      state.materials.set(materialId, result);
      return ok(result);
    }
    const artifact = buildMaterialArtifact({ formatId, title: payload?.title, transcript: payload?.transcript, duration: payload?.duration });
    if (!artifact.ready) return { code: -1, message: artifact.code, data: artifact };
    const materialId = payload?.materialId || `material-${Date.now()}`;
    const body = typeof artifact.body === "string" ? Buffer.from(artifact.body).toString("base64") : Buffer.from(artifact.body).toString("base64");
    const result = { materialId, formatId, mimeType: artifact.mimeType, bodyBase64: body, ready: true };
    state.materials.set(materialId, result);
    return ok(result);
  }
  if (action === "share.create") {
    const materialId = payload?.materialId;
    if (!materialId) return { code: -1, message: "materialId is required" };
    const now = Date.now();
    const share = {
      id: `share-${crypto.randomUUID()}`,
      token: crypto.randomUUID().replaceAll("-", ""),
      materialId,
      title: payload?.title || "未命名物料",
      ownerId: payload?.ownerId || "local-user",
      permission: payload?.permission || "viewer",
      createdAt: new Date(now).toISOString(),
      expiresAt: payload?.expiresInMs == null ? null : new Date(now + Math.max(0, Number(payload.expiresInMs))).toISOString()
    };
    state.shares = [share, ...state.shares.filter((item) => item.materialId !== materialId)];
    return ok({ share: { ...share, url: `/share/${share.token}` } });
  }
  if (action === "share.get") {
    const share = state.shares.find((item) => item.token === payload?.token) || null;
    if (!share) return ok({ share: null });
    const expired = Boolean(share.expiresAt && Date.parse(share.expiresAt) <= Date.now());
    return ok({ share: { ...share, expired, url: `/share/${share.token}` } });
  }
  return { ok: true, data: {} };
}

/**
 * subagent 场景时间线。
 * 事件形状与生产渲染器的期望严格一致（见 OFFICE-ARCHITECTURE.md §7、§15）：
 *   - 主 Agent：RUN_STARTED / TEXT_MESSAGE_* / RUN_FINISHED
 *   - subagent：ag_ui_event { type:"CUSTOM", name:"subagent_start"|"subagent_end",
 *                 value:{ agentId, agentName, parentAgentId, status? }, response_id }
 *   agentName 必须是办公室已确认的角色名（"Browser Agent" 等），dCe 用它映射 agentType。
 * 场景通过 payload.scenario 选择：single（默认）/ parallel / fail。
 */
const SCENARIOS = {
  single: {
    mainTexts: ["收到目标，我来拆解并组织协调。", "已安排 Browser Agent 执行网页检索。", "Browser Agent 已完成，正在汇总结果。"],
    agents: [{ name: "Browser Agent", startAt: 500, endAt: 2500, status: "completed" }],
    finishAt: 3000
  },
  parallel: {
    mainTexts: ["收到目标，我来拆解并组织协调。", "已并行安排三名专员执行。", "全部专员已完成，正在汇总结果。"],
    agents: [
      { name: "Browser Agent", startAt: 500, endAt: 2200, status: "completed" },
      { name: "File Agent", startAt: 800, endAt: 2600, status: "completed" },
      { name: "Search Agent", startAt: 1100, endAt: 3000, status: "completed" }
    ],
    finishAt: 3400
  },
  fail: {
    mainTexts: ["收到目标，我来拆解并组织协调。", "已安排 Browser Agent 与 File Agent 协作。", "File Agent 执行失败，已记录并继续交付可用结果。"],
    agents: [
      { name: "Browser Agent", startAt: 500, endAt: 2400, status: "completed" },
      { name: "File Agent", startAt: 800, endAt: 2000, status: "failed" }
    ],
    finishAt: 2800
  }
};

function scheduleRun(state, client, payload) {
  const conversationId = payload?.conversation_id || `recovered-office-${Date.now()}`;
  // 幂等：同一会话已有进行中的 run 时，不重复播放时间线
  if (state.inProgress.has(conversationId)) return;
  state.inProgress.add(conversationId);

  const scenario = SCENARIOS[payload?.scenario] || SCENARIOS.single;
  const runId = `run-${++state.runCounter}`;
  const messageId = `assistant-${runId}`;
  const now = () => new Date().toISOString();
  let seq = 0;
  const emit = (type, extra = {}) => sendEvent(client, "ag_ui_event", {
    type, conversation_id: conversationId, run_id: runId, response_id: runId,
    messageId, seq: ++seq, timestamp: now(), ...extra
  });
  const emitSubagent = (name, value) => emit("CUSTOM", { name, value });
  const emitSubagentProgress = (agentId, agent, index) => emitSubagent("subagent_progress", {
    agentId,
    agentName: agent.name,
    parentAgentId: "main",
    progress: 42,
    text: `${agent.name} 已取得阶段性结果，正在整理可核验依据。`,
    evidence: [{ type: "source", label: "公开工作记录", ref: `${agentId}-evidence-${index + 1}` }]
  });
  const at = (ms, fn) => setTimeout(fn, ms);

  const pending = conversation(conversationId, payload?.title || "新建恢复任务", "in_progress");
  state.conversations = [pending, ...state.conversations.filter((item) => item.id !== conversationId)];

  emit("RUN_STARTED", { metadata: { source: "recovered-office" } });
  emit("TEXT_MESSAGE_START");
  emit("TEXT_MESSAGE_CONTENT", { delta: scenario.mainTexts[0] });

  for (const [index, agent] of scenario.agents.entries()) {
    const agentId = `sub-${runId}-${index}`;
    at(agent.startAt, () => {
      emitSubagent("subagent_start", { agentId, agentName: agent.name, parentAgentId: "main" });
      if (index === 0) emit("TEXT_MESSAGE_CONTENT", { delta: scenario.mainTexts[1] });
    });
    at(Math.min(agent.endAt - 100, agent.startAt + 350), () => emitSubagentProgress(agentId, agent, index));
    at(agent.endAt, () => emitSubagent("subagent_end", { agentId, agentName: agent.name, parentAgentId: "main", status: agent.status }));
  }

  at(scenario.finishAt, () => {
    emit("TEXT_MESSAGE_CONTENT", { delta: scenario.mainTexts[2] });
    emit("TEXT_MESSAGE_END");
    emit("RUN_FINISHED");
    // 记录最终消息，供历史恢复（message.action.list）使用
    state.messages[conversationId] = [{
      id: messageId,
      role: "assistant",
      status: "completed",
      content: [
        { type: "message", text: scenario.mainTexts.join("") },
        ...scenario.agents.map((agent, index) => ({
          type: "subagent",
          data: { id: `sub-${runId}-${index}`, name: agent.name, parentAgentId: "main", status: agent.status, contents: [] }
        }))
      ]
    }];
    state.conversations = [conversation(conversationId, pending.title, "completed"), ...state.conversations.filter((item) => item.id !== conversationId)];
    state.inProgress.delete(conversationId);
  });
}

async function handleSocketMessage(state, client, raw) {
  let message;
  try { message = JSON.parse(raw); } catch { return; }
  const event = message?.event;
  const requestId = message?.requestId;
  const payload = message?.payload || {};
  if (!requestId) return;
  if (event === "agent.run") {
    sendAck(client, requestId, { ok: true, conversation_id: payload.conversation_id || null });
    setTimeout(() => scheduleRun(state, client, payload), 20);
    return;
  }
  if (event === "agent.cancel") {
    sendAck(client, requestId, { ok: true });
    return;
  }
  if (event === "agent.warmup") {
    sendAck(client, requestId, { ok: true, ready: true });
    sendEvent(client, "agent.warmup", { status: "ready" });
    return;
  }
  const action = payload.action || event;
  const result = await actionResult(state, action, payload);
  sendAck(client, requestId, result);
}

export function startGatewayMock({ port = 5151 } = {}) {
  const state = createGatewayState();
  const server = http.createServer(async (request, response) => {
    if (request.method === "OPTIONS") {
      json(response, 204, undefined, request.headers.origin || "*");
      return;
    }
    if (request.url === "/health") { json(response, 200, { code: 0, data: { status: "ok" } }); return; }
    if (request.method !== "POST") { json(response, 405, { code: -1, message: "Method not allowed" }); return; }
    await readJson(request);
    const route = new URL(request.url || "/", "http://127.0.0.1").pathname;
    if (route === "/privilege/check" || route === "/privilege/grant") { json(response, 200, ok({ status: 1 })); return; }
    if (route === "/file/list" || route === "/file/info") { json(response, 200, ok({ topics: [] })); return; }
    if (route === "/whitelist/list") { json(response, 200, ok({ whitelistDirs: [] })); return; }
    if (route === "/hidden/get") { json(response, 200, ok({ items: [] })); return; }
    json(response, 200, ok({}));
  });
  server.on("upgrade", (request, socket) => {
    if (!request.url?.startsWith("/agent")) { socket.destroy(); return; }
    const key = request.headers["sec-websocket-key"];
    if (!key) { socket.destroy(); return; }
    const accept = crypto.createHash("sha1").update(key + WS_GUID).digest("base64");
    const protocol = request.headers["sec-websocket-protocol"];
    socket.write([
      "HTTP/1.1 101 Switching Protocols",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${accept}`,
      ...(protocol ? [`Sec-WebSocket-Protocol: ${protocol.split(",")[0].trim()}`] : []),
      "\r\n"
    ].join("\r\n"));
    const client = { socket, buffer: Buffer.alloc(0) };
    state.clients.add(client);
    socket.on("data", (chunk) => {
      const parsed = parseWebsocketFrames(Buffer.concat([client.buffer, chunk]));
      client.buffer = parsed.remaining;
      for (const frame of parsed.frames) {
        if (frame.opcode === 0x8) { socket.end(); return; }
        if (frame.opcode === 0x1) handleSocketMessage(state, client, frame.payload.toString("utf8")).catch((error) => console.warn(`[gateway-mock] action failed: ${error.message}`));
      }
    });
    const heartbeat = setInterval(() => sendEvent(client, "gateway.tick", { timestamp: Date.now() }), 20000);
    socket.on("error", () => { clearInterval(heartbeat); state.clients.delete(client); });
    socket.on("close", () => { clearInterval(heartbeat); state.clients.delete(client); });
    sendEvent(client, "gateway.connected", { agentConnectionStatus: "Ready" });
    sendEvent(client, "gateway.tick", { timestamp: Date.now() });
  });
  server.on("error", (error) => console.warn(`[gateway-mock] ${error.message}`));
  server.listen(port, "127.0.0.1", () => console.log(`Marvis recovered gateway: http://127.0.0.1:${port}/`));
  return server;
}
