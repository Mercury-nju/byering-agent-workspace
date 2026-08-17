/**
 * agents/task-store.js
 * 任务看板数据源：本地持久化（localStorage）的任务列表 + 发布订阅。
 * 任务对话（task-runner）提交时写入、状态流转时更新；看板（kanban）读取渲染。
 * 状态机：progress（进行中）→ approval（待审批）→ progress → done（已完成）。
 */

const STORAGE_KEY = "salebuddy.tasks.v1";
const MAX_TASKS = 60;

let cache = null;
const listeners = new Set();

function readAll() {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    cache = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(cache)) cache = [];
  } catch {
    cache = [];
  }
  return cache;
}

function writeAll(tasks) {
  cache = tasks.slice(0, MAX_TASKS);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch { /* 存储满时静默降级为内存态 */ }
  for (const fn of listeners) {
    try { fn(cache); } catch { /* 单个订阅者异常不影响其他 */ }
  }
}

/** 新增任务（置顶），返回任务 id。title 为截断展示名，taskText 保留完整原文供重开对话。 */
export function addTask({ title, projectId, projectName, projectMembers = [], taskText, online = false }) {
  const tasks = readAll();
  const id = `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date().toISOString();
  tasks.unshift({
    id,
    title: title || "未命名任务",
    taskText: taskText || title || "",
    projectId: projectId || null,
    projectName: projectName || "",
    projectMembers: Array.isArray(projectMembers) ? [...new Set(projectMembers)] : [],
    online: Boolean(online),
    status: "progress",
    preview: "任务已提交，幕僚长正在确认业务目标、数据范围和验收口径…",
    created_at: now,
    updated_at: now
  });
  writeAll(tasks);
  return id;
}

/** 更新任务状态/进展摘要。 */
export function updateTask(id, patch) {
  const tasks = readAll();
  const task = tasks.find((t) => t.id === id);
  if (!task) return;
  Object.assign(task, patch, { updated_at: new Date().toISOString() });
  writeAll(tasks);
}

/** 全部任务（新的在前）。 */
export function listTasks() {
  return readAll().slice();
}

/** 订阅变更，返回退订函数。 */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
