/**
 * agents/file-store.js
 * 项目共享文件夹数据源：本地持久化（localStorage）的文件列表 + 发布订阅。
 * 任务运行（task-runner 引擎）在子任务完成时把产出物落库；
 * 文件中心（file-center）读取渲染，支持按 id 预览。
 * type: "sheet"（表格/CSV）| "doc"（文档/Markdown）| "html"（独立网页文件）
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

/** Adds a file and returns its id, retaining server artifact ids when present. */
export function addFile({ id = null, name, type, mimeType, content, projectId, projectName, taskId, taskRunId, agentId, accountId, reportDate, artifactKind, createdBy, createdAt, updatedAt, sourceTaskId, sourceTaskTitle, sourceTaskGoal, sourceResultId, accountCount, accountNames, summary, metadata }) {
  const files = readAll();
  const now = new Date().toISOString();
  const canonicalId = String(id || "").trim() || null;
  const existing = canonicalId
    ? files.find((file) => file.id === canonicalId)
    : files.find((file) => file.name === name && file.projectId === projectId);
  const provenance = Object.fromEntries(Object.entries({
    taskRunId,
    agentId,
    accountId,
    reportDate,
    artifactKind,
    sourceTaskId,
    sourceTaskTitle,
    sourceTaskGoal,
    sourceResultId,
    accountCount,
    accountNames,
    summary,
    metadata
  }).filter(([, value]) => value != null && value !== "" && (!Array.isArray(value) || value.length)));
  if (existing) {
    Object.assign(existing, { name, type, mimeType: mimeType || null, content, projectId: projectId || null, projectName, taskId, createdBy, ...provenance, updated_at: updatedAt || now });
    writeAll(files);
    return existing.id;
  }
  const fileId = canonicalId || `file-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  files.unshift({
    id: fileId,
    name,
    type: type || "doc",
    mimeType: mimeType || null,
    content: content || "",
    projectId: projectId || null,
    projectName: projectName || "",
    taskId: taskId || null,
    createdBy: createdBy || "",
    ...provenance,
    created_at: createdAt || now,
    updated_at: updatedAt || createdAt || now
  });
  writeAll(files);
  return fileId;
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
