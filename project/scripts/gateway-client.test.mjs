import assert from "node:assert/strict";
import test from "node:test";
import { isStyleMockPreview, previewMockGatewayUrl } from "../src/salebuddy/bridge/preview-mode.js";

test("style preview uses an explicit local mock gateway", () => {
  assert.equal(isStyleMockPreview("?page=contacts&preview=style", { hostname: "127.0.0.1" }), true);
  assert.equal(isStyleMockPreview("?page=contacts&preview=style", { hostname: "example.com" }), false);
  assert.equal(previewMockGatewayUrl("?page=contacts&preview=style"), "ws://127.0.0.1:5152/agent");
  assert.equal(previewMockGatewayUrl("?preview=style&mockGateway=ws://127.0.0.1:5196/agent"), "ws://127.0.0.1:5196/agent");
});

test("gateway client sends task runs through the AG-UI agent.run envelope", async () => {
  const previous = globalThis.WebSocket;
  const requests = [];
  class FakeWebSocket {
    static OPEN = 1;
    constructor() {
      this.readyState = 0;
      this.listeners = new Map();
      queueMicrotask(() => {
        this.readyState = FakeWebSocket.OPEN;
        this.listeners.get("open")?.forEach((listener) => listener());
      });
    }
    addEventListener(type, listener) {
      const set = this.listeners.get(type) || new Set();
      set.add(listener);
      this.listeners.set(type, set);
    }
    send(raw) {
      const request = JSON.parse(raw);
      requests.push(request);
      queueMicrotask(() => {
        this.listeners.get("message")?.forEach((listener) => listener({
          data: JSON.stringify({ type: "ack", requestId: request.requestId, data: { ok: true, taskRunId: "run-1" } })
        }));
      });
    }
  }
  globalThis.WebSocket = FakeWebSocket;
  try {
    const { SaleBuddyGatewayClient } = await import(`../src/salebuddy/bridge/gateway.js?test=${Date.now()}`);
    const client = new SaleBuddyGatewayClient({ url: "ws://gateway.test/agent" });
    await client.connect();
    const ack = await client.run({ conversation_id: "task-1", input: "找潜客" });

    assert.deepEqual(ack, { ok: true, taskRunId: "run-1" });
    assert.equal(requests[0].event, "agent.run");
    assert.equal(requests[0].payload.conversation_id, "task-1");
    assert.equal(Object.hasOwn(requests[0].payload, "action"), false);
  } finally {
    globalThis.WebSocket = previous;
  }
});

test("gateway client prefers the native socket behind the recovered demo shim", async () => {
  const { getWebSocketConstructor } = await import(`../src/salebuddy/bridge/gateway.js?native-test=${Date.now()}`);
  const shimSocket = class ShimSocket {};
  const nativeSocket = class NativeSocket {};

  assert.equal(
    getWebSocketConstructor({ WebSocket: shimSocket, __MARVIS_RECOVERED_NATIVE_WEBSOCKET__: nativeSocket }),
    nativeSocket
  );
  assert.equal(getWebSocketConstructor({ WebSocket: shimSocket }), shimSocket);
  assert.equal(
    getWebSocketConstructor({
      WebSocket: shimSocket,
      __MARVIS_RECOVERED_DEMO_WEBSOCKET__: true,
      __MARVIS_RECOVERED_NATIVE_WEBSOCKET__: nativeSocket
    }),
    shimSocket
  );
});

test("runtime mode is production by default and mock only by explicit environment", async () => {
  const { runtimeMode, runtimeModeLabel } = await import(`../src/salebuddy/bridge/runtime-mode.js?mode=${Date.now()}`);
  assert.equal(runtimeMode("?page=prospects", { envMock: false }), "production");
  assert.equal(runtimeMode("?page=prospects&mode=mock", { envMock: false }), "production");
  assert.equal(runtimeMode("?page=prospects", { envMock: true }), "mock");
  assert.equal(runtimeModeLabel("production"), "正式本地 · 真实逻辑");
  assert.equal(runtimeModeLabel("mock"), "纯 Mock · 开发/演示");
});
