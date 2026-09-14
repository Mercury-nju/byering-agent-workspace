import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { startStaticServer } from "./static-server.mjs";

async function startServer(root) {
  const server = await startStaticServer({ root, port: 0 });
  const { port } = server.address();
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

test("static server serves assets and rejects invalid paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "byering-static-server-"));
  await writeFile(join(root, "index.html"), "<h1>Byering</h1>");
  await writeFile(join(root, "app.js"), "export default 'Byering';");
  const { server, baseUrl } = await startServer(root);

  try {
    const index = await fetch(`${baseUrl}/`);
    assert.equal(index.status, 200);
    assert.match(index.headers.get("content-type"), /^text\/html/);
    assert.equal(await index.text(), "<h1>Byering</h1>");

    const asset = await fetch(`${baseUrl}/app.js`, { method: "HEAD" });
    assert.equal(asset.status, 200);
    assert.match(asset.headers.get("content-type"), /^text\/javascript/);
    assert.equal(asset.headers.get("content-length"), String(Buffer.byteLength("export default 'Byering';")));

    assert.equal((await fetch(`${baseUrl}/missing.js`)).status, 404);
    assert.equal((await fetch(`${baseUrl}/%2e%2e/package.json`)).status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("static server falls back to a free port", async () => {
  const root = await mkdtemp(join(tmpdir(), "byering-static-server-"));
  await writeFile(join(root, "index.html"), "ok");
  const occupied = await startStaticServer({ root, port: 0 });
  const occupiedPort = occupied.address().port;

  try {
    const fallback = await startStaticServer({ root, port: occupiedPort, fallbackToRandomPort: true });
    try {
      assert.notEqual(fallback.address().port, occupiedPort);
    } finally {
      await new Promise((resolve) => fallback.close(resolve));
    }
  } finally {
    await new Promise((resolve) => occupied.close(resolve));
  }
});
