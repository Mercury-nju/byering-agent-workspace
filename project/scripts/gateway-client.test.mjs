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
