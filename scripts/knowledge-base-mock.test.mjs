import assert from "node:assert/strict";
import test from "node:test";
import { startKnowledgeBaseMock } from "./knowledge-base-mock.mjs";

test("knowledge-base mock returns compatible empty responses", async () => {
  const { server, port } = await startKnowledgeBaseMock({ port: 0, allowExistingService: false });
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const check = await fetch(`${baseUrl}/privilege/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ privilege_type: "scan_file" })
    });
    assert.deepEqual(await check.json(), { code: 0, status: 0 });

    const files = await fetch(`${baseUrl}/file/list`, { method: "POST", body: "{}" });
    assert.deepEqual(await files.json(), { code: 0, topics: [] });

    const preflight = await fetch(`${baseUrl}/file/list`, {
      method: "OPTIONS",
      headers: {
        Origin: "http://127.0.0.1:4173",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type"
      }
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("access-control-allow-origin"), "http://127.0.0.1:4173");

    const handshake = await fetch(`${baseUrl}/socket.io/?EIO=4&transport=polling`);
    assert.equal(handshake.status, 200);
    const handshakeBody = await handshake.text();
    const { sid } = JSON.parse(handshakeBody.slice(1));
    assert.match(handshakeBody, /^0/);

    const socketPost = await fetch(`${baseUrl}/socket.io/?EIO=4&transport=polling&sid=${sid}`, { method: "POST", body: "40" });
    assert.equal(await socketPost.text(), "ok");
    const socketConnect = await fetch(`${baseUrl}/socket.io/?EIO=4&transport=polling&sid=${sid}`);
    assert.equal(await socketConnect.text(), `40${JSON.stringify({ sid })}`);

    const granted = await fetch(`${baseUrl}/privilege/grant`, { method: "POST", body: "{}" });
    assert.deepEqual(await granted.json(), { code: 0, status: 1 });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
