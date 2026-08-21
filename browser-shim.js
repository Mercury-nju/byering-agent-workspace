import { seedDmMessages, roleReply } from "./src/salebuddy/agents/dm-scenarios.js";
import { fillProfileDefaults } from "./src/salebuddy/agents/model.js";
import { marketplaceProfileSeed } from "./src/salebuddy/agents/marketplace.js";

// Browser-only fallback for the Electron bridge. The real bridge is injected by preload-reconstructed.mjs.
// The recovered web build has no Electron-managed gateway, agent, or knowledge-base
// processes, so mark the native startup check as passed before the app is imported.
const isElectronRuntime = /Electron/i.test(navigator.userAgent);
if (!isElectronRuntime) {
  // The recovered browser build may expose a deterministic gateway only when
  // the user explicitly opts into demo mode. Production must fail closed and
  // wait for the real Agent Gateway instead of replaying fake business work.
  const isRecoveredDemoMode = (() => {
    try {
      return globalThis.__SALEBUDDY_CONFIG__?.demoMode === true
        || new URLSearchParams(location.search).get("demo") === "1";
    } catch {
      return false;
    }
  })();
  window.__MARVIS_RECOVERED_BROWSER__ = true;
  const createMemoryStorage = () => {
    const values = Object.create(null);
    return {
      getItem: (key) => (Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null),
      setItem: (key, value) => { values[key] = String(value); },
      removeItem: (key) => { delete values[key]; },
      clear: () => { Object.keys(values).forEach((key) => delete values[key]); }
    };
  };
  try {
    if (typeof window.sessionStorage === "undefined") {
      Object.defineProperty(window, "sessionStorage", { value: createMemoryStorage(), configurable: true });
    }
    if (typeof window.localStorage === "undefined") {
      Object.defineProperty(window, "localStorage", { value: createMemoryStorage(), configurable: true });
    }
    window.sessionStorage.setItem("ai-launcher_startCheckerPassed", "true");
  } catch {
    // Storage can be unavailable in a restricted browser context.
  }
  try {
    localStorage.setItem("ai-launcher_startCheckerPassed", "1");
  } catch {
    // Storage can be unavailable in a restricted browser context.
    try {
      const marker = "ai-launcher_startCheckerPassed=1";
      if (!window.location.href.includes(marker)) {
        const separator = window.location.search ? "&" : "?";
        window.history.replaceState(null, "", `${window.location.href}${separator}${marker}`);
      }
    } catch {
      // The URL may also be immutable in a restricted browser context.
    }
  }

  // Recreate the small native callback surface used by the recovered renderer.
  // This keeps the browser build on the same gateway/token path as Electron.
  if (!window.CallBridge) {
    const contentChangedListeners = new Set();
    const supported = new Set([
      "AiStarter.GetGatewayToken",
      "AiStarter.GetGatewayRunningStatus",
      "AiStarter.GetCpuId",
      "AiStarter.GetVersion",
      "MarvisAgent.GetAgentRunningStatus",
      "KnowledgeBase.GetPort",
      "KnowledgeBase.GetStatus",
      "KnowledgeBase.GetKnowledgeBaseRunningStatus"
    ]);
    const responseFor = (methodPath, args) => {      if (methodPath === "application.GetApiList" || methodPath === "window.GetApiList") {
        const apis = [
          ["AiStarter", [...supported].filter((key) => key.startsWith("AiStarter.")).map((key) => key.split(".")[1])],
          ["KnowledgeBase", [...supported].filter((key) => key.startsWith("KnowledgeBase.")).map((key) => key.split(".")[1])],
          ["MarvisAgent", ["GetAgentRunningStatus"]],
          ["application", ["GetApiList", "GetChannel", "GetGuid"]],
          ["window", ["GetWebWindowId"]]
        ];
        return JSON.stringify(apis.map(([module_name, apiList]) => ({ module_name, apis: apiList })));
      }
      if (methodPath === "window.GetWebWindowId") return "recovered-browser-window";
      if (methodPath === "AiStarter.CheckHasApi") {
        const key = `${args?.[0] || ""}.${args?.[1] || ""}`;
        return supported.has(key) ? "1" : "0";
      }
      if (methodPath === "AiStarter.GetGatewayToken") {
        return JSON.stringify({ port: 5152, token: "recovered-browser-token" });
      }
      if (methodPath === "AiStarter.GetGatewayRunningStatus") {
        return JSON.stringify({ is_running: true, is_connected: true, status_code: 31 });
      }
      if (methodPath === "MarvisAgent.GetAgentRunningStatus") {
        return JSON.stringify({ is_running: true, is_connected: true, status_code: 31 });
      }
      if (methodPath === "KnowledgeBase.GetKnowledgeBaseRunningStatus") {
        return JSON.stringify({ is_running: true, status_code: 31 });
      }
      if (methodPath === "KnowledgeBase.GetStatus") return JSON.stringify({ status_code: 31 });
      if (methodPath === "KnowledgeBase.GetPort") return "5152";
      if (methodPath === "AiStarter.GetCpuId") return "recovered-browser";
      if (methodPath === "AiStarter.GetVersion") return "recovered-browser";
      if (methodPath === "application.GetAllAppsInfo" || methodPath === "application.GetAppsList") return "[]";
      return "{}";
    };
    window.CallBridge = {
      addEventListener(eventName, listener) {
        if (eventName === "ContentChanged") contentChangedListeners.add(listener);
      },
      removeEventListener(eventName, listener) {
        if (eventName === "ContentChanged") contentChangedListeners.delete(listener);
      },
      invokeMethod(methodPath, callbackId, ...args) {
        window.setTimeout(() => {
          const body = responseFor(methodPath, args);
          contentChangedListeners.forEach((listener) => listener(callbackId, 0, body, ""));
        }, 0);
      }
    };
  }

  // The in-app browser rejects the recovered WebSocket handshake even though
  // native clients accept it. Keep the same AG-UI envelope locally so the
  // renderer can exercise sessions and Agent runs without a native socket.
  if (isRecoveredDemoMode && !window.__MARVIS_RECOVERED_NATIVE_WEBSOCKET__) {
    const historyMessage = {
      id: "history-assistant-1",
      role: "assistant",
      status: "generating",
      content: [{
        type: "subagent",
        data: { id: "history-sub-browser", name: "Browser Agent", parentAgentId: "main", status: "running", contents: [] }
      }]
    };
    const state = window.__MARVIS_RECOVERED_WS_STATE__ || {
      runCounter: 0,
      inProgress: new Set(),
      conversations: [{
        id: "recovered-office-1",
        title: "恢复版办公室",
        status: "completed",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        metadata: { source: "recovered-office" },
        message_count: 1,
        last_message_preview: "已连接到恢复版办公室。"
      }, {
        id: "recovered-office-history",
        title: "历史会话（含进行中 subagent）",
        status: "in_progress",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        metadata: { source: "recovered-office" },
        message_count: 1,
        last_message_preview: "Browser Agent 正在执行中…"
      }],
      messages: { "recovered-office-history": [historyMessage] },
      schedules: []
    };
    window.__MARVIS_RECOVERED_WS_STATE__ = state;
    const emit = (socket, type, payload) => {
      const event = { type, data: JSON.stringify(payload) };
      socket.listeners[type]?.forEach((listener) => listener(event));
      socket[`on${type}`]?.(event);
    };
    const envelope = (socket, event, data) => emit(socket, "message", { type: "ack", event, requestId: data.requestId, data: data.result });
    // ── SaleBuddy 员工模型本地持久化（与 scripts/agent-store.mjs 同协议，localStorage 落地）──
    const AGENT_DEFAULTS = {
        main: { role: "Byering · 幕僚长", title: "AI 组织负责人", responsibilities: ["理解用户目标", "拆解任务", "组织与协调 Agent 团队", "审核交付质量", "向用户汇报"] },
      "Browser Agent": { role: "线索猎人", title: "B2B 线索研究员", responsibilities: ["搜索潜在客户", "分析公司主页", "补全联系方式", "验证线索真实性"] },
      "Search Agent": { role: "数据分析师", title: "数据清洗与评估", responsibilities: ["清洗重复数据", "线索评分", "数据归因与来源核验", "输出分析结论"] },
      "App Agent": { role: "销售顾问", title: "触达策略制定", responsibilities: ["制定触达方案", "设计沟通节奏", "评估转化路径"] },
      "File Agent": { role: "内容策划", title: "内容与文档产出", responsibilities: ["生成沟通内容", "撰写报告", "管理文件产出"] },
      "Computer Agent": { role: "开发助手", title: "技术执行", responsibilities: ["脚本与自动化", "环境操作", "工具集成"] }
    };
    const agentStoreKey = (agentType) => `salebuddy:agentstore:${agentType}`;
    // Agent广场可雇佣成员（与 src/salebuddy/agents/marketplace.js 目录同步的精简副本）
    const MARKETPLACE_DEFAULTS = {
      "mkt-lead-miner": { name: "老周", title: "线索挖掘机", skills: ["线索挖掘", "名录补全", "决策人定位"] },
      "mkt-market-scout": { name: "小探", title: "市场情报员", skills: ["行业研究", "竞品监控", "标讯订阅"] },
      "mkt-cold-writer": { name: "阿触", title: "冷启动外联", skills: ["首触话术", "邮件撰写", "A/B 测试"] },
      "mkt-follow-up": { name: "跟跟", title: "跟进管家", skills: ["跟进排期", "丢单预警", "节奏设计"] },
      "mkt-phone-sdr": { name: "声声", title: "电销专员", skills: ["外呼脚本", "异议应答", "意向分级"] },
      "mkt-copywriter": { name: "笔笔", title: "内容写手", skills: ["公众号", "朋友圈文案", "案例包装"] },
      "mkt-designer": { name: "图图", title: "视觉设计", skills: ["海报设计", "朋友圈素材", "品牌视觉"] },
      "mkt-private-op": { name: "营营", title: "私域运营", skills: ["社群运营", "朋友圈日历", "裂变活动"] },
      "mkt-cs-manager": { name: "安安", title: "客户成功", skills: ["新客引导", "续约提醒", "满意度回访"] },
      "mkt-quote": { name: "价价", title: "报价合同", skills: ["报价单", "合同初稿", "条款核对"] },
      "mkt-data-analyst": { name: "数数", title: "销售数据分析", skills: ["漏斗分析", "业绩归因", "销售周报"] },
      "mkt-bid": { name: "标标", title: "投标专员", skills: ["标讯监控", "标书撰写", "资质管理"] }
    };
    const readAgentRecord = (agentType) => {
      try {
        const raw = localStorage.getItem(agentStoreKey(agentType));
        if (raw) {
          const record = JSON.parse(raw);
          record.profile = fillProfileDefaults(record.profile, marketplaceProfileSeed(agentType));
          return record;
        }
      } catch { /* fall through */ }
      const market = MARKETPLACE_DEFAULTS[agentType] || null;
      const defaults = AGENT_DEFAULTS[agentType] || { role: market?.name || agentType, title: market?.title || "", responsibilities: market?.skills || [] };
      const now = new Date().toISOString();
      const profile = {
          agentType,
          identity: { name: defaults.role, avatar: null, title: defaults.title, languageStyle: "", signature: "" },
          soul: { principles: [], deliveryStandard: "", safetyRules: [], honestyRules: [] },
          role: { position: defaults.role, responsibilities: defaults.responsibilities, reportsTo: "main" },
          skills: market ? [...market.skills] : [],
          tools: [],
          scope: { dataAccess: [], forbiddenZones: [] },
          permission: { approvalRequired: [], limits: {}, forbidden: [] },
          budget: { daily: null, monthly: null, perTask: null, modelTier: "standard", maxCalls: null },
          meta: { createdAt: now, updatedAt: now, version: 1 }
        };
      return {
        profile: fillProfileDefaults(profile, marketplaceProfileSeed(agentType)),
        memory: []
      };
    };
    const writeAgentRecord = (agentType, record) => {
      try { localStorage.setItem(agentStoreKey(agentType), JSON.stringify(record)); } catch { /* ignore */ }
      return record;
    };
    const deepMerge = (target, patch) => {
      const merged = { ...target };
      for (const [key, value] of Object.entries(patch || {})) {
        if (value && typeof value === "object" && !Array.isArray(value) && target?.[key] && typeof target[key] === "object" && !Array.isArray(target[key])) {
          merged[key] = deepMerge(target[key], value);
        } else merged[key] = value;
      }
      return merged;
    };
    const agentActionResult = (action, payload) => {
      const agentType = payload?.agentType || "main";
      const record = readAgentRecord(agentType);
      if (action === "agent.profile.get") return { profile: record.profile };
      if (action === "agent.profile.update") {
        record.profile = deepMerge(record.profile, payload?.patch || {});
        record.profile.meta = { ...record.profile.meta, updatedAt: new Date().toISOString(), version: (record.profile.meta?.version || 0) + 1 };
        writeAgentRecord(agentType, record);
        return { profile: record.profile };
      }
      if (action === "agent.memory.list") {
        const kind = payload?.kind || null;
        return { entries: kind ? record.memory.filter((entry) => entry.kind === kind) : record.memory };
      }
      if (action === "agent.memory.append") {
        const input = payload?.entry || {};
        const now = new Date().toISOString();
        const entry = {
          id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          kind: input.kind || "feedback",
          text: String(input.text || ""),
          scope: input.scope || "agent",
          source: input.source || "user",
          status: "active",
          version: 1,
          history: [],
          createdAt: now,
          updatedAt: now,
          expiresAt: null
        };
        record.memory.push(entry);
        writeAgentRecord(agentType, record);
        return { entry };
      }
      if (action === "agent.memory.revise" || action === "agent.memory.rollback") {
        const index = record.memory.findIndex((entry) => entry.id === payload?.entryId);
        if (index < 0) return { entry: null };
        const entry = record.memory[index];
        if (action === "agent.memory.revise") {
          entry.history = [...(entry.history || []), { text: entry.text, version: entry.version, replacedAt: new Date().toISOString() }];
          entry.text = String(payload?.text || "");
          entry.version += 1;
        } else {
          const previous = (entry.history || []).pop();
          if (previous) { entry.text = previous.text; entry.version = previous.version; }
          else entry.status = "rolled-back";
        }
        entry.updatedAt = new Date().toISOString();
        record.memory[index] = entry;
        writeAgentRecord(agentType, record);
        return { entry };
      }
      if (action === "agent.permission.get") return { permission: record.profile.permission };
      if (action === "agent.permission.update") {
        record.profile.permission = deepMerge(record.profile.permission, payload?.permission || {});
        writeAgentRecord(agentType, record);
        return { permission: record.profile.permission };
      }
      return null;
    };

    // ── SaleBuddy 项目组（localStorage 持久化，与 scripts/rooms-store.mjs 同协议）──
    const ROOMS_KEY = "salebuddy:rooms";
    const roomMessagesKey = (roomId) => `salebuddy:room-messages:${roomId}`;
    const DEFAULT_ROOMS = [
      { id: "room-leads", name: "潜在客户拓展项目组", goal: "找到 200 个符合条件的潜在客户，并制定一套可执行的触达方案", owner: "main", members: ["main", "Browser Agent", "Search Agent", "App Agent"], deadline: "2026-08-20T18:00", budget: 120, tools: ["全网搜索", "工商数据", "地图采集", "邮箱"], dataScope: ["公开网页", "工商公开信息", "项目共享文件"], deliverables: ["线索清单", "触达方案", "话术包"], acceptance: "200 个有效潜客，联系方式补全率 ≥ 60%，触达方案通过审批", maxRetries: 3, status: "active", createdAt: "2026-08-05T09:30:00.000Z", lastMessage: "线索猎人已完成第一轮检索，数据分析师开始清洗评分。", conversationId: "conv-room-leads" },
      { id: "room-content", name: "触达内容共创项目组", goal: "为首批 50 个高评分线索生成个性化沟通内容", owner: "main", members: ["main", "App Agent", "File Agent"], deadline: "2026-08-15T18:00", budget: 60, tools: ["文档", "素材库", "模板库"], dataScope: ["线索清单", "话术库", "素材库"], deliverables: ["个性化沟通内容 50 份"], acceptance: "50 份内容全部通过销售顾问审阅，无夸大承诺类表述", maxRetries: 2, status: "active", createdAt: "2026-08-05T14:10:00.000Z", lastMessage: "内容策划已产出 12 份初稿，等待销售顾问审阅。", conversationId: "conv-room-content" }
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
    const readJson = (key, fallback) => {
      try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
    };
    const writeJson = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ } return value; };
    const readRooms = () => {
      const rooms = readJson(ROOMS_KEY, null);
      if (rooms) {
        // 迁移：老房间补 PRD 十项定义字段（种子房按 id 回填）
        const seedsById = new Map(DEFAULT_ROOMS.map((room) => [room.id, room]));
        let dirty = false;
        for (const room of rooms) {
          const seed = seedsById.get(room.id) || {};
          for (const key of ["deadline", "budget", "tools", "dataScope", "deliverables", "acceptance", "maxRetries"]) {
            if (room[key] === undefined) { room[key] = seed[key] ?? (Array.isArray(seed[key]) ? [] : null); dirty = true; }
          }
        }
        if (dirty) writeJson(ROOMS_KEY, rooms);
        return rooms;
      }
      for (const [roomId, messages] of Object.entries(DEFAULT_MESSAGES)) writeJson(roomMessagesKey(roomId), messages);
      return writeJson(ROOMS_KEY, DEFAULT_ROOMS);
    };
    const appendRoomMessage = (roomId, { from, fromName, text }) => {
      const messages = readJson(roomMessagesKey(roomId), []);
      const message = { id: `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, roomId, from: from || "user", fromName: fromName || "我", text: String(text || ""), createdAt: new Date().toISOString() };
      messages.push(message);
      writeJson(roomMessagesKey(roomId), messages);
      const rooms = readRooms();
      const room = rooms.find((item) => item.id === roomId);
      if (room) { room.lastMessage = `${message.fromName}：${message.text}`.slice(0, 60); writeJson(ROOMS_KEY, rooms); }
      return message;
    };
    // ── 办公室 × 项目组：每个项目组绑定一个办公室会话，localStorage 记录激活项目组 ──
    const ACTIVE_ROOM_KEY = "salebuddy:active-room";
    const seedRoomConversations = () => {
      const rooms = readRooms();
      let dirty = false;
      for (const room of rooms) {
        if (!room.conversationId) { room.conversationId = `conv-${room.id}`; dirty = true; }
      }
      if (dirty) writeJson(ROOMS_KEY, rooms);
      const activeRoomId = readJson(ACTIVE_ROOM_KEY, rooms[0]?.id || null);
      for (const room of rooms) {
        const active = room.id === activeRoomId;
        const now = new Date().toISOString();
        if (!state.conversations.find((item) => item.id === room.conversationId)) {
          state.conversations.push({ id: room.conversationId, title: room.name, status: active ? "in_progress" : "completed", created_at: now, updated_at: now, metadata: { source: "salebuddy-room" }, message_count: 1, last_message_preview: room.lastMessage || "" });
        }
        if (!state.messages[room.conversationId]) {
          state.messages[room.conversationId] = [{ id: `room-office-${room.id}`, role: "assistant", status: active ? "generating" : "complete", content: (room.members || []).filter((member) => member !== "main").map((member, index) => ({ type: "subagent", data: { id: `room-sub-${room.id}-${index}`, name: member, parentAgentId: "main", status: active ? "running" : "completed", contents: [] } })) }];
        }
      }
    };
    seedRoomConversations();
    const switchOfficeRoom = (roomId) => {
      const rooms = readRooms();
      const room = rooms.find((item) => item.id === roomId) || null;
      if (!room) return null;
      writeJson(ACTIVE_ROOM_KEY, room.id);
      for (const item of rooms) {
        const conv = state.conversations.find((c) => c.id === item.conversationId);
        if (!conv) continue;
        const active = item.id === room.id;
        conv.status = active ? "in_progress" : "completed";
        conv.updated_at = new Date().toISOString();
        const assistant = (state.messages[item.conversationId] || []).find((m) => m.role === "assistant");
        if (assistant) {
          assistant.status = active ? "generating" : "complete";
          for (const content of assistant.content || []) if (content.type === "subagent") content.data.status = active ? "running" : "completed";
        }
      }
      return room;
    };
    const roomActionResult = (action, payload) => {
      if (action === "room.action.list") return { rooms: readRooms() };
      if (action === "room.action.create") {
        const rooms = readRooms();
        const room = {
          id: `room-${Date.now().toString(36)}`,
          name: String(payload?.name || "未命名项目组"),
          goal: payload?.goal || "",
          owner: payload?.owner || "main",
          members: payload?.members || ["main"],
          deadline: payload?.deadline || null,
          budget: payload?.budget == null ? null : Number(payload.budget),
          tools: Array.isArray(payload?.tools) ? payload.tools : [],
          dataScope: Array.isArray(payload?.dataScope) ? payload.dataScope : [],
          deliverables: Array.isArray(payload?.deliverables) ? payload.deliverables : [],
          acceptance: String(payload?.acceptance || ""),
          maxRetries: Number.isFinite(Number(payload?.maxRetries)) ? Number(payload.maxRetries) : 3,
          status: "active",
          createdAt: new Date().toISOString(),
          lastMessage: "",
          conversationId: `conv-room-${Date.now().toString(36)}`
        };
        rooms.push(room);
        writeJson(ROOMS_KEY, rooms);
        writeJson(roomMessagesKey(room.id), []);
        // 新项目组同步生成办公室会话（初始为已完成，切换后激活）
        const now = new Date().toISOString();
        state.conversations.push({ id: room.conversationId, title: room.name, status: "completed", created_at: now, updated_at: now, metadata: { source: "salebuddy-room" }, message_count: 1, last_message_preview: "" });
        state.messages[room.conversationId] = [{ id: `room-office-${room.id}`, role: "assistant", status: "complete", content: (room.members || []).filter((member) => member !== "main").map((member, index) => ({ type: "subagent", data: { id: `room-sub-${room.id}-${index}`, name: member, parentAgentId: "main", status: "completed", contents: [] } })) }];
        return { room };
      }
      if (action === "room.message.list") return { messages: readJson(roomMessagesKey(payload?.roomId), []) };
      if (action === "room.message.send") {
        const message = appendRoomMessage(payload?.roomId, payload || {});
        if ((payload?.from || "user") === "user") {
          window.setTimeout(() => appendRoomMessage(payload?.roomId, { from: "main", fromName: "Byering · 幕僚长", text: "收到，我来拆解并安排对应成员跟进，进展会同步到项目组。" }), 1200);
        }
        return { message };
      }
      if (action === "room.office.current") {
        const rooms = readRooms();
        const roomId = readJson(ACTIVE_ROOM_KEY, rooms[0]?.id || null);
        const room = rooms.find((item) => item.id === roomId) || null;
        return { roomId: room?.id || null, conversationId: room?.conversationId || null };
      }
      if (action === "room.office.switch") {
        const room = switchOfficeRoom(payload?.roomId);
        if (!room) return { roomId: null, conversationId: null, error: "room not found" };
        return { roomId: room.id, conversationId: room.conversationId };
      }
      return null;
    };

    // ── SaleBuddy 私聊（localStorage 镜像，键 salebuddy:dm:<agentType>）──
    const dmKey = (agentType) => `salebuddy:dm:${agentType || "main"}`;
    const AGENT_NAMES = { main: "Byering · 幕僚长", "Browser Agent": "线索猎人", "Search Agent": "数据分析师", "App Agent": "销售顾问", "File Agent": "内容策划", "Computer Agent": "开发助手" };
    const displayName = (agentType) => AGENT_NAMES[agentType] || MARKETPLACE_DEFAULTS[agentType]?.name || agentType;
    const readDm = (agentType) => {
      const messages = readJson(dmKey(agentType), []);
      const seeds = seedDmMessages(agentType);
      if (seeds.length && !messages.some((message) => String(message.id || "").startsWith("dm-seed-"))) {
        const migrated = [...seeds, ...messages];
        writeJson(dmKey(agentType), migrated);
        return migrated;
      }
      return messages;
    };
    const appendDm = (agentType, { from, fromName, text, artifact = null }) => {
      const messages = readDm(agentType);
      const message = { id: `dm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, agentType, from: from || "user", fromName: fromName || "我", text: String(text || ""), ...(artifact ? { artifact: { ...artifact } } : {}), createdAt: new Date().toISOString() };
      messages.push(message);
      writeJson(dmKey(agentType), messages);
      return message;
    };
    const dmActionResult = (action, payload) => {
      const agentType = payload?.agentType || "main";
      if (action === "dm.message.list") return { messages: readDm(agentType) };
      if (action === "dm.message.send") {
        const message = appendDm(agentType, payload || {});
        if ((payload?.from || "user") === "user") {
          window.setTimeout(() => appendDm(agentType, { from: agentType, fromName: displayName(agentType), text: roleReply(agentType) }), 1200);
        }
        return { message };
      }
      if (action === "agent.workspace.list") {
        return { workspace: { path: `云电脑/${displayName(agentType)}`, sections: [
          { dir: "根目录", files: [{ name: "IDENTITY.md", size: 1024, updatedAt: new Date().toISOString() }] },
          { dir: "inbox", files: [] },
          { dir: "output", files: [] }
        ] } };
      }
      return null;
    };

    const resultFor = (action, payload) => {
      if (action === "conversations.list") return { ok: true, data: { conversations: state.conversations, has_more: false, next_cursor: null, total: state.conversations.length } };
      if (action === "schedule.action.list") return { code: 0, data: state.schedules };
      if (action === "skill.action.list") return { code: 0, data: [] };
      if (action.startsWith("message.action.")) {
        const messages = state.messages[payload?.conversation_id || payload?.conversationId || payload?.id] || [];
        return { code: 0, data: { messages, has_more: false, next_cursor: null, total: messages.length } };
      }
      if (action === "switch.action.get") return { code: 0, data: { luckin_ordering_switch: 0 } };
      if (action === "location.action.query") return { code: 0, data: { city: "", province: "", country: "" } };
      if (action.startsWith("weixin.")) return { code: 0, data: { connected: false, status: "disconnected" } };
      const agentResult = agentActionResult(action, payload);
      if (agentResult) return { code: 0, data: agentResult };
      const roomResult = roomActionResult(action, payload);
      if (roomResult) return { code: 0, data: roomResult };
      const dmResult = dmActionResult(action, payload);
      if (dmResult) return { code: 0, data: dmResult };
      return { ok: true, data: {} };
    };
    class RecoveredWebSocket {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;
      constructor(url, protocol) {
        this.url = url;
        this.protocol = Array.isArray(protocol) ? protocol[0] || "" : protocol || "";
        this.readyState = RecoveredWebSocket.CONNECTING;
        this.listeners = Object.create(null);
        window.setTimeout(() => {
          if (this.readyState !== RecoveredWebSocket.CONNECTING) return;
          this.readyState = RecoveredWebSocket.OPEN;
          emit(this, "open", {});
          emit(this, "message", { type: "event", event: "gateway.connected", data: { agentConnectionStatus: "Ready" } });
          emit(this, "message", { type: "event", event: "gateway.tick", data: { timestamp: Date.now() } });
        }, 0);
      }
      addEventListener(type, listener) { (this.listeners[type] ||= new Set()).add(listener); }
      removeEventListener(type, listener) { this.listeners[type]?.delete(listener); }
      send(raw) {
        if (this.readyState !== RecoveredWebSocket.OPEN) throw new Error("WebSocket is not open");
        let request;
        try { request = JSON.parse(raw); } catch { return; }
        const action = request.payload?.action || request.event;
        if (request.event === "agent.run") {
          const conversationId = request.payload?.conversation_id || `recovered-office-${Date.now()}`;
          envelope(this, request.event, { requestId: request.requestId, result: { ok: true, conversation_id: conversationId } });
          // 幂等：同一会话已有进行中的 run 时不重复播放时间线
          if (state.inProgress.has(conversationId)) return;
          state.inProgress.add(conversationId);

          const scenarios = {
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
          const scenario = scenarios[request.payload?.scenario] || scenarios.single;
          const runId = `run-${++state.runCounter}`;
          const messageId = `assistant-${runId}`;
          let seq = 0;
          const sendAgui = (type, extra = {}) => emit(this, "message", { type: "event", event: "ag_ui_event", data: { type, conversation_id: conversationId, run_id: runId, response_id: runId, messageId, seq: ++seq, ...extra } });
          const sendSubagent = (name, value) => sendAgui("CUSTOM", { name, value });
          const sendSubagentProgress = (agentId, agent, index) => sendSubagent("subagent_progress", {
            agentId,
            agentName: agent.name,
            parentAgentId: "main",
            progress: 42,
            text: `${agent.name} 已取得阶段性结果，正在整理可核验依据。`,
            evidence: [{ type: "source", label: "公开工作记录", ref: `${agentId}-evidence-${index + 1}` }]
          });
          const markConversation = (status, preview) => {
            const existing = state.conversations.find((item) => item.id === conversationId);
            const record = existing || { id: conversationId, created_at: new Date().toISOString(), metadata: { source: "recovered-office" } };
            Object.assign(record, { title: request.payload?.title || record.title || "新建恢复任务", status, updated_at: new Date().toISOString(), last_message_preview: preview });
            state.conversations = [record, ...state.conversations.filter((item) => item.id !== conversationId)];
          };
          markConversation("in_progress", "正在处理中…");

          sendAgui("RUN_STARTED", { metadata: { source: "recovered-office" } });
          sendAgui("TEXT_MESSAGE_START");
          sendAgui("TEXT_MESSAGE_CONTENT", { delta: scenario.mainTexts[0] });
          for (const [index, agent] of scenario.agents.entries()) {
            const agentId = `sub-${runId}-${index}`;
            window.setTimeout(() => {
              sendSubagent("subagent_start", { agentId, agentName: agent.name, parentAgentId: "main" });
              if (index === 0) sendAgui("TEXT_MESSAGE_CONTENT", { delta: scenario.mainTexts[1] });
            }, agent.startAt);
            window.setTimeout(() => sendSubagentProgress(agentId, agent, index), Math.min(agent.endAt - 100, agent.startAt + 350));
            window.setTimeout(() => sendSubagent("subagent_end", { agentId, agentName: agent.name, parentAgentId: "main", status: agent.status }), agent.endAt);
          }
          window.setTimeout(() => {
            sendAgui("TEXT_MESSAGE_CONTENT", { delta: scenario.mainTexts[2] });
            sendAgui("TEXT_MESSAGE_END");
            sendAgui("RUN_FINISHED");
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
            markConversation("completed", scenario.mainTexts[2]);
            state.inProgress.delete(conversationId);
          }, scenario.finishAt);
          return;
        }
        if (request.event === "agent.cancel") { envelope(this, request.event, { requestId: request.requestId, result: { ok: true } }); return; }
        if (request.event === "agent.warmup") {
          envelope(this, request.event, { requestId: request.requestId, result: { ok: true, ready: true } });
          emit(this, "message", { type: "event", event: "agent.warmup", data: { status: "ready" } });
          return;
        }
        window.setTimeout(() => envelope(this, request.event, { requestId: request.requestId, result: resultFor(action, request.payload) }), 0);
      }
      close(code = 1000, reason = "") {
        if (this.readyState === RecoveredWebSocket.CLOSED) return;
        this.readyState = RecoveredWebSocket.CLOSED;
        emit(this, "close", { code, reason, wasClean: code === 1000 });
      }
    }
    window.__MARVIS_RECOVERED_NATIVE_WEBSOCKET__ = window.WebSocket;
    window.WebSocket = RecoveredWebSocket;
  }
}

if (!window.marvis) {
  const noop = () => undefined;
  const asyncNoop = async () => undefined;
  window.marvis = new Proxy(
    {
      getVersion: () => "recovered-browser",
      getServicePorts: asyncNoop,
      waitForGateway: asyncNoop,
      notifyReady: noop,
      invoke: asyncNoop,
      onServicePortChanged: () => noop,
      onProcessEvent: () => noop,
      onMenuAction: () => noop,
      onContentChanged: () => noop
    },
    {
      get(target, property) {
        return property in target ? target[property] : asyncNoop;
      }
    }
  );
}
