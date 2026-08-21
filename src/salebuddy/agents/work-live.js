/**
 * agents/work-live.js
 * 在制工作实时源：任务引擎（task-runner）把每个成员当前在干什么写进来，
 * 云电脑快照（cloud-desktop）据此渲染真实工作画面——
 * 任务跑到哪一步，对应成员的云电脑就显示他在干的这件事。
 * 纯内存（模块级），随页面刷新清空；成员无在制工作时由云电脑显示空状态。
 */

const works = new Map(); // agentType -> { task, phase, projectId, activities: [], state: "working"|"done", artifact }
const listeners = new Set();

function notify(agentType) {
  for (const fn of listeners) {
    try { fn(agentType); } catch { /* 单个订阅者异常不影响其他 */ }
  }
}

/** 新任务启动：清掉上一轮所有在制状态。 */
export function endAllWork() {
  works.clear();
  notify(null);
}

/** 成员开始一个子任务。 */
export function beginWork(agentType, { task = "", phase = "", projectId = null } = {}) {
  works.set(agentType, { task, phase, projectId, activities: [], state: "working", artifact: null, startedAt: Date.now() });
  notify(agentType);
}

/** 追加一条工作动态（成员的发言即工作内容的实时反映）。 */
export function pushActivity(agentType, text) {
  const work = works.get(agentType);
  if (!work) return;
  work.activities.push(String(text || ""));
  if (work.activities.length > 24) work.activities.shift();
  notify(agentType);
}

/** 子任务完成：标记完成并挂上产出物名。 */
export function finishWork(agentType, artifact = null) {
  const work = works.get(agentType);
  if (!work) return;
  work.state = "done";
  work.artifact = artifact;
  notify(agentType);
}

/** 读取某成员的在制工作；无则 null（云电脑据此显示空状态）。 */
export function getWork(agentType) {
  return works.get(agentType) || null;
}

/** 项目内读取在制工作；不属于当前项目时视为空闲，避免跨群泄露。 */
export function getWorkForProject(agentType, projectId = null) {
  const work = getWork(agentType);
  if (!projectId) return work;
  return work?.projectId === projectId ? work : null;
}

/** 是否有任何成员在制（用于判断办公室是否「在跑任务」）。 */
export function hasAnyWork() {
  return works.size > 0;
}

/** 订阅变化（agentType 为 null 表示整体清空），返回退订函数。 */
export function subscribeWork(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
