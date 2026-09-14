import test from "node:test";
import assert from "node:assert/strict";
import { createStaticServer } from "./static-server.mjs";

test("static server serves imported office icons with a JavaScript MIME type", async t => {
  const server = createStaticServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  for (const file of ["createElement", "defaultAttributes", "icons/arrow-up", "icons/settings", "icons/maximize", "icons/refresh-cw"]) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/node_modules/lucide/dist/esm/${file}.mjs`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /javascript/);
    assert.match(await response.text(), /export/);
  }
});
