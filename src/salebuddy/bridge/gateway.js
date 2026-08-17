/**
 * bridge/gateway.js
 * SaleBuddy 新增 action 的 Gateway 客户端。
 *
 * 只承载新命名空间（agent.profile.* / agent.memory.* / room.action.* / budget.* 等），
 * 旧 action 仍由 bundle 自己的连接处理，本模块不重复实现。
 * 协议沿用已确认的 ws-ag-ui envelope：{ event:"gateway.action", requestId, payload:{ action, ... } }
 * 响应：{ type:"ack", requestId, data:{ code, data } }
 */

const DEFAULT_TIMEOUT_MS = 8000;

export class SaleBuddyGatewayClient {
  constructor({ url, protocols = "ws-ag-ui" } = {}) {
    this.url = url;
    this.protocols = protocols;
    this.socket = null;
    this.requestSeq = 0;
    this.pending = new Map();
    this.eventListeners = new Map();
  }

  /** 从恢复版 shim/bridge 推导 gateway 地址（与 bundle 同一来源）。 */
  static async discoverUrl({ timeoutMs = 3000 } = {}) {
    // 浏览器 shim 通过 CallBridge 提供 token+port；Electron 经 window.marvis。
    if (window.CallBridge) {
      const payload = await new Promise((resolve) => {
        const callbackId = `sb-gw-${Date.now()}`;
        const listener = (id, code, body) => {
          if (id !== callbackId || code !== 0) return;
          window.CallBridge.removeEventListener?.("ContentChanged", listener);
          try { resolve(JSON.parse(body || "{}")); } catch { resolve(null); }
        };
        window.CallBridge.addEventListener("ContentChanged", listener);
        setTimeout(() => {
          window.CallBridge.removeEventListener?.("ContentChanged", listener);
          resolve(null);
        }, timeoutMs);
        window.CallBridge.invokeMethod("AiStarter.GetGatewayToken", callbackId);
      });
      if (payload?.port) {
        const token = encodeURIComponent(payload.token || "");
        return `ws://127.0.0.1:${payload.port}/agent?token=${token}`;
      }
    }
    return null;
  }

  connect() {
    if (!this.url) return Promise.reject(new Error("gateway url unavailable"));
    if (this.socket && this.socket.readyState === 1) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(this.url, this.protocols);
      this.socket = socket;
      socket.addEventListener("open", () => resolve());
      socket.addEventListener("error", (event) => reject(event));
      socket.addEventListener("message", (event) => this.#onMessage(event));
      socket.addEventListener("close", () => {
        for (const [, { reject: rejectPending }] of this.pending) {
          rejectPending(new Error("gateway connection closed"));
        }
        this.pending.clear();
      });
    });
  }

  /** 调用一个新 action，返回 ack.data。 */
  action(actionName, payload = {}, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    const requestId = `sb-${++this.requestSeq}`;
    const envelope = { event: "gateway.action", requestId, payload: { action: actionName, ...payload } };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`gateway action timeout: ${actionName}`));
      }, timeoutMs);
      this.pending.set(requestId, { resolve, reject, timer });
      this.socket.send(JSON.stringify(envelope));
    });
  }

  on(eventName, listener) {
    (this.eventListeners.get(eventName) || this.eventListeners.set(eventName, new Set()).get(eventName)).add(listener);
    return () => this.eventListeners.get(eventName)?.delete(listener);
  }

  #onMessage(event) {
    let message = event;
    if (typeof event.data === "string") {
      try { message = JSON.parse(event.data); } catch { return; }
    }
    if (message?.type === "ack" && message.requestId && this.pending.has(message.requestId)) {
      const { resolve, timer } = this.pending.get(message.requestId);
      clearTimeout(timer);
      this.pending.delete(message.requestId);
      resolve(message.data);
      return;
    }
    if (message?.type === "event") {
      this.eventListeners.get(message.event)?.forEach((listener) => listener(message.data));
    }
  }
}

/** 新 action 命名空间常量（与 gateway-mock 扩展保持一一对应）。 */
export const SB_ACTIONS = Object.freeze({
  agentProfileGet: "agent.profile.get",
  agentProfileUpdate: "agent.profile.update",
  agentMemoryList: "agent.memory.list",
  agentMemoryAppend: "agent.memory.append",
  agentMemoryRollback: "agent.memory.rollback",
  agentPermissionGet: "agent.permission.get",
  agentPermissionUpdate: "agent.permission.update",
  roomCreate: "room.action.create",
  roomList: "room.action.list",
  roomUpdate: "room.action.update",
  roomClose: "room.action.close",
  budgetGet: "budget.get",
  budgetUpdate: "budget.update",
  usageSummary: "usage.summary",
  planGet: "plan.action.get",
  approvalRespond: "approval.action.respond",
  blockerReport: "blocker.action.report",
  shareCreate: "share.create",
  shareGet: "share.get",
  materialGenerate: "material.generate"
});
