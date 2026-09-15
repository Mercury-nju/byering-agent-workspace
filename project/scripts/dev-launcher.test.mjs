import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { defaultAllowedOrigins } from "../backend/http-server.js";

const source = fs.readFileSync(new URL("./dev.mjs", import.meta.url), "utf8");
const packageJson = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("dev launcher starts the web renderer and control plane together", () => {
  assert.equal(packageJson.scripts.dev, "node scripts/dev.mjs");
  assert.match(source, /backend\/http-server\.js/);
  assert.match(source, /scripts\/static-server\.mjs/);
  assert.match(source, /BYERING_BACKEND_PORT/);
  assert.match(source, /BYERING_RENDERER_PORT/);
  assert.match(source, /SIGINT/);
  assert.match(source, /SIGTERM/);
});

test("control plane allows the renderer origin when the dev web port changes", () => {
  const origins = defaultAllowedOrigins({ configuredOrigins: "", rendererPort: 8889 });
  assert.ok(origins.includes("http://127.0.0.1:8889"));
  assert.ok(origins.includes("http://localhost:8889"));
});

test("control plane keeps the supported desktop renderer port in its fallback origins", () => {
  const origins = defaultAllowedOrigins({ configuredOrigins: "", rendererPort: 0 });
  assert.ok(origins.includes("http://127.0.0.1:8889"));
  assert.ok(origins.includes("http://localhost:8889"));
});
