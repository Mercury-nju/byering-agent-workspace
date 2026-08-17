/**
 * agents/file-store.js
 * 项目共享文件夹数据源：本地持久化（localStorage）的文件列表 + 发布订阅。
 * 任务运行（task-runner 引擎）在子任务完成时把产出物落库；
 * 文件中心（file-center）读取渲染，支持按 id 预览。
 * type: "sheet"（表格/CSV）| "doc"（文档/Markdown）
 */

const STORAGE_KEY = "salebuddy.files.v1";
const MAX_FILES = 120;

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

function writeAll(files) {
  cache = files.slice(0, MAX_FILES);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch { /* 存储满时静默降级为内存态 */ }
  for (const fn of listeners) {
    try { fn(cache); } catch { /* 单个订阅者异常不影响其他 */ }
  }
}

/** 新增文件（同名去重：覆盖同项目组同名文件），返回文件 id。 */
export function addFile({ name, type, content, projectId, projectName, taskId, createdBy }) {
  const files = readAll();
  const now = new Date().toISOString();
  const existing = files.find((f) => f.name === name && f.projectId === projectId);
  if (existing) {
    Object.assign(existing, { type, content, projectId: projectId || null, projectName, taskId, createdBy, updated_at: now });
    writeAll(files);
    return existing.id;
  }
  const id = `file-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  files.unshift({
    id,
    name,
    type: type || "doc",
    content: content || "",
    projectId: projectId || null,
    projectName: projectName || "",
    taskId: taskId || null,
    createdBy: createdBy || "",
    created_at: now,
    updated_at: now
  });
  writeAll(files);
  return id;
}

/** 全部文件（新的在前）。 */
export function listFiles() {
  return readAll().slice();
}

export function getFile(id) {
  return readAll().find((f) => f.id === id) || null;
}

/** 订阅变更，返回退订函数。 */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
