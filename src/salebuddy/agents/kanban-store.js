/**
 * Local customization store for project boards.
 * Custom display tasks intentionally stay separate from task-store conversations.
 */

export const KANBAN_STORAGE_KEY = "salebuddy.kanban.custom.v1";
export const KANBAN_STORAGE_VERSION = 1;

let memoryEnvelope = { version: KANBAN_STORAGE_VERSION, boards: {} };

const DEFAULT_COLUMNS = Object.freeze([
  { id: "todo", title: "待跟进" },
  { id: "doing", title: "触达中" },
  { id: "approval", title: "待审核" },
  { id: "done", title: "已完成" }
]);

const DEFAULT_VIEW = Object.freeze({
  theme: "light",
  layout: "dashboard",
  density: "comfortable",
  accent: "blue",
  components: ["records", "metrics", "files", "trend", "tasks"]
});

const DEFAULT_CANVAS_WIDGETS = Object.freeze([
  { mountId: "mount-metrics", widgetId: "metrics", x: 0, y: 0, w: 1, h: 2 },
  { mountId: "mount-records", widgetId: "records", x: 1, y: 0, w: 2, h: 2 },
  { mountId: "mount-files", widgetId: "files", x: 3, y: 0, w: 1, h: 2 },
  { mountId: "mount-trend", widgetId: "trend", x: 0, y: 2, w: 4, h: 2 },
  { mountId: "mount-tasks", widgetId: "tasks", x: 0, y: 4, w: 4, h: 1 }
]);

const LEGACY_DEFAULT_CANVAS_WIDGETS = Object.freeze([
  { mountId: "mount-metrics", widgetId: "metrics", x: 0, y: 0, w: 1, h: 1 },
  { mountId: "mount-records", widgetId: "records", x: 1, y: 0, w: 2, h: 2 },
  { mountId: "mount-trend", widgetId: "trend", x: 0, y: 1, w: 1, h: 2 },
  { mountId: "mount-files", widgetId: "files", x: 3, y: 0, w: 1, h: 2 },
  { mountId: "mount-tasks", widgetId: "tasks", x: 0, y: 3, w: 4, h: 1 }
]);

export const SEED_SALES_ROOM = Object.freeze({
  id: "seed-sales-ops",
  name: "销售运营总览",
  goal: "从线索挖掘到首触转化，持续推进高意向客户进入下一步",
  owner: "main",
  members: ["main", "Browser Agent", "Search Agent", "App Agent"],
  status: "active",
  lastMessage: "今日已补全 96 条候选线索，13 条进入高意向池。",
  deliverables: ["线索清单", "触达方案", "跟进复盘"]
});

function text(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function id(prefix, used = new Set()) {
  let next = `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  while (used.has(next)) next = `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
  return next;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function statusForRecord(record) {
  const status = text(record?.status).toLowerCase();
  if (status.includes("完成") || status.includes("已签") || status === "done") return "done";
  if (status.includes("审核") || status.includes("审批") || status === "approval") return "approval";
  if (status.includes("进行") || status.includes("触达") || status === "progress" || status === "doing") return "doing";
  return "todo";
}

function makeTask(title, detail, status, used) {
  return {
    id: id("task", used),
    title: text(title, "销售跟进任务"),
    detail: text(detail),
    status: ["todo", "doing", "approval", "done"].includes(status) ? status : "todo"
  };
}

function normalizeView(view, fallback = DEFAULT_VIEW) {
  const source = view && typeof view === "object" ? view : {};
  const base = fallback && typeof fallback === "object" ? fallback : DEFAULT_VIEW;
  const themes = ["light", "ink", "paper"];
  const layouts = ["dashboard", "grid", "focus"];
  const densities = ["comfortable", "compact"];
  const accents = ["blue", "green", "orange"];
  const components = ["records", "metrics", "files", "trend", "tasks"];
  const selected = Array.isArray(source.components) ? source.components.filter((item) => components.includes(item)) : [];
  return {
    theme: themes.includes(source.theme) ? source.theme : text(base.theme, "light"),
    layout: layouts.includes(source.layout) ? source.layout : text(base.layout, "dashboard"),
    density: densities.includes(source.density) ? source.density : text(base.density, "comfortable"),
    accent: accents.includes(source.accent) ? source.accent : text(base.accent, "blue"),
    components: selected.length ? [...new Set(selected)] : [...(base.components || DEFAULT_VIEW.components)]
  };
}

function canvasId(prefix = "canvas") {
  return id(prefix);
}

function normalizeCanvas(canvas, fallback = null) {
  const source = canvas && typeof canvas === "object" ? canvas : {};
  const base = fallback && typeof fallback === "object" ? fallback : { placements: DEFAULT_CANVAS_WIDGETS, annotations: [], runs: [], history: [] };
  const sourcePlacements = Array.isArray(source.placements) ? source.placements : null;
  const isLegacyDefault = sourcePlacements?.length === LEGACY_DEFAULT_CANVAS_WIDGETS.length
    && sourcePlacements.every((placement) => {
      const legacy = LEGACY_DEFAULT_CANVAS_WIDGETS.find((item) => item.mountId === placement?.mountId);
      return legacy && ["widgetId", "x", "y", "w", "h"].every((key) => placement[key] === legacy[key]);
    });
  const rawPlacements = isLegacyDefault ? DEFAULT_CANVAS_WIDGETS : (sourcePlacements || base.placements);
  const placements = rawPlacements.map((placement, index) => ({
    mountId: text(placement?.mountId, `mount-${index + 1}`),
    widgetId: text(placement?.widgetId, "metrics"),
    x: Math.max(0, Number.isFinite(placement?.x) ? placement.x : 0),
    y: Math.max(0, Number.isFinite(placement?.y) ? placement.y : index),
    w: Math.max(1, Math.min(4, Number.isFinite(placement?.w) ? placement.w : 1)),
    h: Math.max(1, Math.min(4, Number.isFinite(placement?.h) ? placement.h : 1)),
    viewState: placement?.viewState && typeof placement.viewState === "object" ? clone(placement.viewState) : {}
  }));
  const mountIds = new Set(placements.map((placement) => placement.mountId));
  const annotations = (Array.isArray(source.annotations) ? source.annotations : base.annotations || [])
    .filter((annotation) => !annotation?.mountId || mountIds.has(annotation.mountId))
    .map((annotation) => ({ id: text(annotation.id, canvasId("annotation")), mountId: text(annotation.mountId), text: text(annotation.text), createdAt: text(annotation.createdAt, new Date().toISOString()) }))
    .filter((annotation) => annotation.text);
  const runs = (Array.isArray(source.runs) ? source.runs : base.runs || [])
    .filter((run) => !run?.mountId || mountIds.has(run.mountId))
    .map((run) => ({
      id: text(run.id, canvasId("run")),
      mountId: text(run.mountId),
      taskId: text(run.taskId),
      status: ["queued", "running", "approval", "completed", "failed", "cancelled"].includes(run.status) ? run.status : "queued",
      prompt: text(run.prompt),
      result: text(run.result),
      startedAt: text(run.startedAt, new Date().toISOString()),
      updatedAt: text(run.updatedAt, new Date().toISOString())
    }));
  const history = (Array.isArray(source.history) ? source.history : base.history || [])
    .map((entry) => ({ ...entry, id: text(entry?.id, canvasId("history")), mountId: text(entry?.mountId), title: text(entry?.title, "组件运行记录"), status: text(entry?.status), createdAt: text(entry?.createdAt, new Date().toISOString()) }))
    .filter((entry) => entry.mountId && mountIds.has(entry.mountId));
  return { placements, annotations, runs, history };
}

export function createDefaultBoardConfig(room = SEED_SALES_ROOM, dashboard = null) {
  const used = new Set();
  const records = dashboard?.records?.items || [];
  const firstRecord = records[0];
  const deliverables = room?.deliverables || ["线索清单", "触达方案", "跟进复盘"];
  const tasks = [
    makeTask("补全潜客线索联系方式", "联系方式补全率目标 ≥ 60%，优先处理高意向客户", "todo", used),
    makeTask(firstRecord?.title || "分级高意向客户", firstRecord?.meta || "按行业、规模和购买意向分级", "doing", used),
    makeTask(`审核${deliverables[1] || "首触方案"}`, room?.acceptance || "触达策略师确认话术与触达节奏", "approval", used),
    makeTask(dashboard?.primary ? `${dashboard.primary.label} ${dashboard.primary.value}${dashboard.primary.unit || ""}` : "完成首轮客户触达", "沉淀到项目共享文件并同步跟进结果", "done", used)
  ];
  const columns = DEFAULT_COLUMNS.map((column) => ({ ...column, tasks: [] }));
  tasks.forEach((task) => columns.find((column) => column.id === task.status).tasks.push(task));
  return {
    title: text(room?.name, "销售运营总览"),
    columns,
    view: normalizeView(),
    canvas: normalizeCanvas(),
    updatedAt: new Date().toISOString()
  };
}

export function suggestBoardConfig(prompt, room = SEED_SALES_ROOM, dashboard = null) {
  const request = text(prompt).toLowerCase();
  const explicitTitle = text(prompt).match(/([\u4e00-\u9fa5A-Za-z0-9]{2,18})看板/)?.[1]
    ?.replace(/^(帮我)?(做一个|创建一个|搭建一个|创建|搭建|做)/, "")
    .replace(/^(深色科技感|暖白杂志感|深色|暗色|暖白|浅色|紧凑|网格卡片|单列|聚焦重点)的?/, "")
    .trim();
  const mode = /内容|文案|发布|素材|选题/.test(request)
    ? "content"
    : /客户|跟进|成交|报价|crm|回访/.test(request)
      ? "customer"
      : "lead";
  const visual = {
    theme: /深色|暗色|黑底|科技/.test(request) ? "ink" : /纸张|米白|编辑|杂志/.test(request) ? "paper" : "light",
    layout: /单列|聚焦|重点/.test(request) ? "focus" : /网格|卡片|左右/.test(request) ? "grid" : "dashboard",
    density: /紧凑|密集|信息量大/.test(request) ? "compact" : "comfortable",
    accent: /绿色|增长|健康/.test(request) ? "green" : /橙色|提醒|风险/.test(request) ? "orange" : "blue"
  };
  const base = createDefaultBoardConfig(room, dashboard);
  const used = new Set();
  const templates = {
    customer: {
      title: "客户跟进看板",
      columns: [
        ["todo", "待联系", "录入新客户", "记录客户行业、预算和下一步动作"],
        ["doing", "跟进中", "首次联系", "跟踪客户回复、异议和意向等级"],
        ["approval", "报价审核", "报价方案审核", "确认价格、权益和交付承诺后再发送"],
        ["done", "已成交", "已成交客户复盘", "沉淀成交原因并安排 onboarding" ]
      ]
    },
    content: {
      title: "内容交付看板",
      columns: [
        ["todo", "待选题", "收集客户问题", "从真实客户对话中提炼选题和内容目标"],
        ["doing", "创作中", "生成个性化沟通内容", "按客户画像输出首触文案和 A/B 版本"],
        ["approval", "待审核", "触达策略师审核", "检查事实、承诺边界和品牌语气"],
        ["done", "已发布", "发布并复盘", "记录触达、回复和转化结果" ]
      ]
    },
    lead: {
      title: "潜客转化看板",
      columns: [
        ["todo", "待跟进", "补全潜客线索联系方式", "联系方式补全率目标 ≥ 60%，优先处理高意向客户"],
        ["doing", "触达中", "分级高意向客户", "按行业、规模和购买意向分级"],
        ["approval", "待审核", "审核触达方案", room?.acceptance || "触达策略师确认话术与触达节奏"],
        ["done", "已完成", dashboard?.primary ? `${dashboard.primary.label} ${dashboard.primary.value}${dashboard.primary.unit || ""}` : "完成首轮客户触达", "沉淀到项目共享文件并同步跟进结果"]
      ]
    }
  }[mode];
  const config = {
    ...base,
    title: explicitTitle ? `${explicitTitle}看板` : templates.title,
    view: normalizeView({ ...base.view, ...visual }),
    columns: templates.columns.map(([columnId, title, taskTitle, detail]) => ({
      id: columnId,
      title,
      tasks: [makeTask(taskTitle, detail, columnId, used)]
    }))
  };
  config.updatedAt = new Date().toISOString();
  return config;
}

function normalizeTask(task, used) {
  const safeId = text(task?.id) || id("task", used);
  used.add(safeId);
  return {
    id: safeId,
    title: text(task?.title, "销售跟进任务"),
    detail: text(task?.detail),
    status: ["todo", "doing", "approval", "done"].includes(task?.status) ? task.status : "todo"
  };
}

export function normalizeBoardConfig(input, fallback) {
  const source = input && typeof input === "object" ? input : {};
  const base = fallback && typeof fallback === "object" ? fallback : createDefaultBoardConfig();
  const used = new Set();
  const rawColumns = Array.isArray(source.columns) ? source.columns : [];
  const columns = rawColumns.map((column, index) => {
    const candidate = text(column?.id) || `custom-${index + 1}`;
    const columnId = used.has(candidate) ? id("column", used) : candidate;
    used.add(columnId);
    const rawTasks = Array.isArray(column?.tasks) ? column.tasks : [];
    return {
      id: columnId,
      title: text(column?.title, `第 ${index + 1} 列`),
      tasks: rawTasks.map((task) => normalizeTask(task, used))
    };
  });
  const safeColumns = columns.length ? columns : clone(base.columns || DEFAULT_COLUMNS).map((column) => ({
    ...column,
    tasks: (column.tasks || []).map((task) => normalizeTask(task, used))
  }));
  return {
    title: text(source.title, text(base.title, "销售运营总览")),
    columns: safeColumns,
    view: normalizeView(source.view, base.view || DEFAULT_VIEW),
    canvas: normalizeCanvas(source.canvas, base.canvas),
    updatedAt: text(source.updatedAt, new Date().toISOString())
  };
}

export function createDefaultCanvas() {
  return normalizeCanvas();
}

export function updateCanvasPlacement(config, mountId, patch = {}) {
  const next = normalizeBoardConfig(config);
  const placement = next.canvas.placements.find((item) => item.mountId === mountId);
  if (!placement) return next;
  for (const key of ["x", "y", "w", "h"]) {
    if (patch[key] !== undefined && Number.isFinite(Number(patch[key]))) placement[key] = Number(patch[key]);
  }
  if (patch.viewState && typeof patch.viewState === "object") placement.viewState = { ...placement.viewState, ...clone(patch.viewState) };
  next.updatedAt = new Date().toISOString();
  return next;
}

export function addCanvasAnnotation(config, annotation = {}) {
  const next = normalizeBoardConfig(config);
  if (!text(annotation.text)) return next;
  const mountId = text(annotation.mountId);
  const existing = next.canvas.annotations.find((item) => item.mountId === mountId);
  if (existing) {
    existing.text = text(annotation.text);
    existing.createdAt = new Date().toISOString();
  } else {
    next.canvas.annotations.push({ id: canvasId("annotation"), mountId, text: text(annotation.text), createdAt: new Date().toISOString() });
  }
  next.updatedAt = new Date().toISOString();
  return next;
}

export function addCanvasRun(config, run = {}) {
  const next = normalizeBoardConfig(config);
  const now = new Date().toISOString();
  next.canvas.runs.unshift({ id: canvasId("run"), mountId: text(run.mountId), taskId: text(run.taskId), status: ["queued", "running", "approval", "completed", "failed", "cancelled"].includes(run.status) ? run.status : "queued", prompt: text(run.prompt), result: text(run.result), startedAt: text(run.startedAt, now), updatedAt: now });
  next.updatedAt = now;
  return next;
}

export function updateCanvasRun(config, runId, patch = {}) {
  const next = normalizeBoardConfig(config);
  const run = next.canvas.runs.find((item) => item.id === runId);
  if (!run) return next;
  if (patch.status && ["queued", "running", "approval", "completed", "failed", "cancelled"].includes(patch.status)) run.status = patch.status;
  if (patch.result !== undefined) run.result = text(patch.result);
  run.updatedAt = new Date().toISOString();
  if (["completed", "failed", "cancelled"].includes(run.status)) next.canvas.history.unshift({ id: canvasId("history"), mountId: run.mountId, title: run.prompt || "组件运行记录", status: run.status, createdAt: run.updatedAt });
  next.updatedAt = run.updatedAt;
  return next;
}

export function removeCanvasWidget(config, mountId) {
  const next = normalizeBoardConfig(config);
  next.canvas.placements = next.canvas.placements.filter((item) => item.mountId !== mountId);
  next.canvas.annotations = next.canvas.annotations.filter((item) => item.mountId !== mountId);
  next.canvas.runs = next.canvas.runs.filter((item) => item.mountId !== mountId);
  next.canvas.history = next.canvas.history.filter((item) => item.mountId !== mountId);
  next.updatedAt = new Date().toISOString();
  return next;
}

function readEnvelope() {
  try {
    const raw = globalThis.localStorage?.getItem(KANBAN_STORAGE_KEY);
    if (!globalThis.localStorage) return memoryEnvelope;
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || parsed.version !== KANBAN_STORAGE_VERSION || !parsed.boards || typeof parsed.boards !== "object") {
      return memoryEnvelope;
    }
    memoryEnvelope = parsed;
    return parsed;
  } catch {
    return memoryEnvelope;
  }
}

export function readBoardConfig(roomId, fallback) {
  const envelope = readEnvelope();
  return normalizeBoardConfig(envelope.boards[roomId], fallback);
}

export function writeBoardConfig(roomId, config) {
  if (!roomId) return normalizeBoardConfig(config);
  const envelope = readEnvelope();
  envelope.boards[roomId] = normalizeBoardConfig(config);
  memoryEnvelope = envelope;
  try {
    globalThis.localStorage?.setItem(KANBAN_STORAGE_KEY, JSON.stringify(envelope));
  } catch {
    // Memory fallback is handled by the caller's current draft.
  }
  return envelope.boards[roomId];
}

export function removeBoardConfig(roomId) {
  if (!roomId) return;
  const envelope = readEnvelope();
  delete envelope.boards[roomId];
  memoryEnvelope = envelope;
  try {
    globalThis.localStorage?.setItem(KANBAN_STORAGE_KEY, JSON.stringify(envelope));
  } catch {
    // Keep the in-memory envelope when storage is unavailable.
  }
}

export function addBoardColumn(config, title = "新列") {
  const next = normalizeBoardConfig(config);
  const used = new Set(next.columns.map((column) => column.id));
  next.columns.push({ id: id("column", used), title: text(title, "新列"), tasks: [] });
  next.updatedAt = new Date().toISOString();
  return next;
}

export function updateBoardColumn(config, columnId, patch = {}) {
  const next = normalizeBoardConfig(config);
  const column = next.columns.find((item) => item.id === columnId);
  if (!column) return next;
  if (patch.title !== undefined) column.title = text(patch.title, column.title);
  next.updatedAt = new Date().toISOString();
  return next;
}

export function removeBoardColumn(config, columnId) {
  const next = normalizeBoardConfig(config);
  if (next.columns.length <= 1) return next;
  next.columns = next.columns.filter((column) => column.id !== columnId);
  next.updatedAt = new Date().toISOString();
  return next;
}

export function moveBoardColumn(config, columnId, direction) {
  const next = normalizeBoardConfig(config);
  const index = next.columns.findIndex((column) => column.id === columnId);
  const target = direction === "left" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= next.columns.length) return next;
  [next.columns[index], next.columns[target]] = [next.columns[target], next.columns[index]];
  next.updatedAt = new Date().toISOString();
  return next;
}

export function addBoardTask(config, columnId, task = {}) {
  const next = normalizeBoardConfig(config);
  const column = next.columns.find((item) => item.id === columnId) || next.columns[0];
  const used = new Set(next.columns.flatMap((item) => item.tasks.map((entry) => entry.id)));
  column.tasks.push(makeTask(task.title, task.detail, task.status || "todo", used));
  next.updatedAt = new Date().toISOString();
  return next;
}

export function updateBoardTask(config, columnId, taskId, patch = {}) {
  const next = normalizeBoardConfig(config);
  const column = next.columns.find((item) => item.id === columnId);
  const task = column?.tasks.find((item) => item.id === taskId);
  if (!task) return next;
  if (patch.title !== undefined) task.title = text(patch.title, task.title);
  if (patch.detail !== undefined) task.detail = text(patch.detail);
  if (patch.status !== undefined && ["todo", "doing", "approval", "done"].includes(patch.status)) task.status = patch.status;
  next.updatedAt = new Date().toISOString();
  return next;
}

export function removeBoardTask(config, columnId, taskId) {
  const next = normalizeBoardConfig(config);
  const column = next.columns.find((item) => item.id === columnId);
  if (column) column.tasks = column.tasks.filter((task) => task.id !== taskId);
  next.updatedAt = new Date().toISOString();
  return next;
}

function columnForStatus(columns, status, currentColumnId) {
  const byId = columns.find((column) => column.id === status);
  if (byId) return byId;
  const keywords = {
    todo: ["待", "跟进", "线索"],
    doing: ["进行", "触达", "执行"],
    approval: ["审核", "审批", "确认"],
    done: ["完成", "转化", "签约"]
  }[status] || [];
  return columns.find((column) => keywords.some((keyword) => column.title.includes(keyword)))
    || columns.find((column) => column.id === currentColumnId)
    || columns[0];
}

export function organizeBoardTasks(config) {
  const next = normalizeBoardConfig(config);
  const allTasks = next.columns.flatMap((column) => column.tasks.map((task) => ({ task, currentColumnId: column.id })));
  next.columns.forEach((column) => { column.tasks = []; });
  allTasks.forEach(({ task, currentColumnId }) => columnForStatus(next.columns, task.status, currentColumnId).tasks.push(task));
  next.updatedAt = new Date().toISOString();
  return next;
}
