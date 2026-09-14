/**
 * bridge/context.js
 * 只读访问恢复版 bundle 暴露的集成点。bundle 是压缩生产代码，
 * 这些全局变量是它自己用于运行时集成的出口（见 recovered-protocol/store-model.md）。
 * 本模块只做"探测 + 只读快照 + 订阅"，绝不向 bundle 内部写入。
 */

const INTEGRATION_POINTS = [
  "__STORE__",
  "__STORE_STATE__",
  "__ROUTE__",
  "__TAB_ROUTERS__",
  "__HISTORY_TRACKERS__"
];

/** 当前可用的集成点清单（不等待）。 */
export function detectIntegrationPoints() {
  const report = {};
  for (const key of INTEGRATION_POINTS) {
    report[key] = typeof window !== "undefined" && window[key] != null;
  }
  return report;
}

/** 等待集成点出现（bundle 异步初始化），超时后返回实际检测结果。 */
export function waitForIntegrationPoints({ timeoutMs = 10000, intervalMs = 100 } = {}) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const timer = setInterval(() => {
      const report = detectIntegrationPoints();
      const allReady = Object.values(report).every(Boolean);
      if (allReady || Date.now() - startedAt >= timeoutMs) {
        clearInterval(timer);
        resolve(report);
      }
    }, intervalMs);
  });
}

/** 只读快照：返回当前 store 顶层状态的浅拷贝（不可用时返回 null）。 */
export function readStoreSnapshot() {
  const state = window.__STORE_STATE__;
  if (state == null) return null;
  if (typeof state === "function") {
    try { return state(); } catch { return null; }
  }
  return state;
}

/** 列出 store 顶层域（conversations / skill / autoTask ...）。 */
export function listStoreDomains() {
  const snapshot = readStoreSnapshot();
  if (snapshot && typeof snapshot === "object") return Object.keys(snapshot);
  const store = window.__STORE__;
  if (store && typeof store.getState === "function") {
    try { return Object.keys(store.getState()); } catch { return []; }
  }
  return [];
}

/** 订阅 store 变化。返回取消订阅函数；不可用时返回 noop。 */
export function subscribeStore(listener) {
  const store = window.__STORE__;
  if (store && typeof store.subscribe === "function") {
    return store.subscribe(() => listener(readStoreSnapshot()));
  }
  return () => {};
}

/** 读取路由信息（只读）。 */
export function readRouteInfo() {
  return {
    route: window.__ROUTE__ ?? null,
    tabRouters: window.__TAB_ROUTERS__ ?? null,
    historyTrackers: window.__HISTORY_TRACKERS__ ?? null
  };
}
