import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("./dev.mjs", import.meta.url), "utf8");
const packageJson = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("dev launcher starts the web renderer and control plane together", () => {
  assert.equal(packageJson.scripts.dev, "node scripts/dev.mjs");
  assert.match(source, /backend\/http-server\.js/);
  assert.match(source, /scripts\/static-server\.mjs/);
  assert.match(source, /BYERING_BACKEND_PORT/);
  assert.match(source, /SIGINT/);
  assert.match(source, /SIGTERM/);
});
