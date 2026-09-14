/**
 * agents/resource-store.js
 * 资源中心数据源：账户余额、本月预算、成本流水、任务成本卷积，localStorage 持久化 + 发布订阅。
 * 任务运行（task-runner 引擎）在子任务完成时记录该成员的成本（Token/API/云电脑/数据采购/邮件短信），
 * 产出物落库时记录存储成本；任务完结时卷积任务级成本与产出（文件数/线索数/耗时）。
 * kind: "token" | "api" | "cloud" | "storage" | "mail" | "data"
 */

const STORAGE_KEY = "salebuddy.resources.v1";
const MAX_ENTRIES = 400;

export const KIND_LABELS = {
  token: "模型 Token",
  api: "API 调用",
  cloud: "云电脑",
  storage: "存储",
  mail: "邮件短信",
  data: "数据采购"
};

let cache = null;
const listeners = new Set();

function daysAgo(n, hour = 10) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, Math.floor(Math.random() * 50) + 5, 0, 0);
  return d.toISOString();
}

function seedState() {
  // 首次打开前的历史数据：让面板有真实经营感
  const entries = [];
  const push = (taskId, projectName, agent, kind, label, amount, at) => {
    entries.push({
      id: `cost-${entries.length.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      taskId, projectName, agent, kind, label,
      amount: Math.round(amount * 100) / 100,
      created_at: at
    });
  };
  const T1 = "task-seed-1"; // 本地餐饮客户名单整理
  const T2 = "task-seed-2"; // 7月内容选题日历
  const T3 = "task-seed-3"; // 美业客户首触话术库
  const P1 = "潜在客户拓展项目组";
  const P2 = "触达内容共创项目组";

  // T1（6 天前完成）
  push(T1, P1, "线索猎人", "token", "模型 Token · 检索与判断", 2.86, daysAgo(6, 9));
  push(T1, P1, "线索猎人", "api", "地图/点评 API · 商户检索", 1.45, daysAgo(6, 9));
  push(T1, P1, "线索分析师", "token", "模型 Token · 清洗评分", 2.12, daysAgo(6, 10));
  push(T1, P1, "线索分析师", "data", "数据采购 · 工商信息补全", 4.80, daysAgo(6, 10));
  push(T1, P1, "内容策划", "token", "模型 Token · 名单标注", 1.36, daysAgo(6, 11));
  push(T1, P1, "触达策略师", "mail", "邮件短信 · 首触 86 人", 3.44, daysAgo(6, 14));
  push(T1, P1, "触达策略师", "cloud", "云电脑 · 4.2 小时", 6.30, daysAgo(6, 14));
  // T2（3 天前完成）
  push(T2, P2, "线索猎人", "api", "热点/搜索 API · 趋势采样", 0.92, daysAgo(3, 9));
  push(T2, P2, "线索分析师", "token", "模型 Token · 对标拆解", 2.64, daysAgo(3, 10));
  push(T2, P2, "内容策划", "token", "模型 Token · 日历与脚本", 3.18, daysAgo(3, 11));
  push(T2, P2, "内容策划", "cloud", "云电脑 · 2.6 小时", 3.90, daysAgo(3, 11));
  push(T2, P2, "内容策划", "storage", "文件存储 · 5 份产出", 0.10, daysAgo(3, 11));
  // T3（1 天前完成）
  push(T3, P1, "内容策划", "token", "模型 Token · 话术撰写", 2.42, daysAgo(1, 15));
  push(T3, P1, "触达策略师", "token", "模型 Token · 要点清单", 1.58, daysAgo(1, 16));
  push(T3, P1, "触达策略师", "cloud", "云电脑 · 1.8 小时", 2.70, daysAgo(1, 16));
  push(T3, P1, "触达策略师", "storage", "文件存储 · 3 份产出", 0.06, daysAgo(1, 16));

  const tasks = {};
  tasks[T1] = { taskId: T1, title: "本地餐饮客户名单整理", projectName: P1, cost: 22.23, files: 3, leads: 86, status: "done", durationMin: 47, done_at: daysAgo(6, 14) };
  tasks[T2] = { taskId: T2, title: "7 月内容选题日历", projectName: P2, cost: 10.74, files: 5, leads: 0, status: "done", durationMin: 38, done_at: daysAgo(3, 11) };
  tasks[T3] = { taskId: T3, title: "美业客户首触话术库", projectName: P1, cost: 6.76, files: 3, leads: 0, status: "done", durationMin: 26, done_at: daysAgo(1, 16) };

  const spent = entries.reduce((sum, e) => sum + e.amount, 0);
  return {
    balance: Math.round((1286.4 - spent) * 100) / 100,
    monthBudget: 300,
    approvalLine: 25,
    entries,
    tasks
  };
}

function readState() {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    cache = raw ? JSON.parse(raw) : null;
    if (!cache || !Array.isArray(cache.entries) || typeof cache.balance !== "number") cache = null;
  } catch {
    cache = null;
  }
  if (!cache) {
    cache = seedState();
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cache)); } catch { /* 降级内存态 */ }
  }
  return cache;
}

function writeState() {
  cache.entries = cache.entries.slice(0, MAX_ENTRIES);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch { /* 存储满时静默降级为内存态 */ }
  for (const fn of listeners) {
    try { fn(cache); } catch { /* 单个订阅者异常不影响其他 */ }
  }
}

/** 记一笔成本：扣余额、写流水、累加任务成本。 */
export function recordCost({ taskId = null, projectName = "", agent = "", kind = "token", label = "", amount = 0 }) {
  const state = readState();
  const value = Math.round(amount * 100) / 100;
  if (value <= 0) return null;
  const entry = {
    id: `cost-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    taskId, projectName, agent, kind,
    label: label || KIND_LABELS[kind] || kind,
    amount: value,
    created_at: new Date().toISOString()
  };
  state.entries.unshift(entry);
  state.balance = Math.round((state.balance - value) * 100) / 100;
  if (taskId) {
    const task = state.tasks[taskId] || { taskId, title: "", projectName, cost: 0, files: 0, leads: 0, status: "running" };
    task.cost = Math.round(((task.cost || 0) + value) * 100) / 100;
    task.projectName = task.projectName || projectName;
    state.tasks[taskId] = task;
  }
  writeState();
  return entry;
}

/** 任务级卷积：状态 / 标题 / 产出文件数 / 线索数 / 耗时（分钟）。 */
export function rollupTask(taskId, patch) {
  if (!taskId) return;
  const state = readState();
  const task = state.tasks[taskId] || { taskId, cost: 0, files: 0, leads: 0 };
  Object.assign(task, patch);
  state.tasks[taskId] = task;
  writeState();
}

/** 完整状态（副本）。 */
export function getState() {
  const state = readState();
  return {
    balance: state.balance,
    monthBudget: state.monthBudget,
    approvalLine: state.approvalLine,
    entries: state.entries.slice(),
    tasks: Object.values(state.tasks).map((t) => ({ ...t }))
  };
}

export function setMonthBudget(value) {
  const state = readState();
  state.monthBudget = Math.max(0, Math.round(value * 100) / 100);
  writeState();
}

export function setApprovalLine(value) {
  const state = readState();
  state.approvalLine = Math.max(0, Math.round(value * 100) / 100);
  writeState();
}

/** 订阅变更，返回退订函数。 */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
