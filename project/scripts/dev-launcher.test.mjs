import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { defaultAllowedOrigins } from "../backend/http-server.js";
import { runtimeConfigScript } from "./static-server.mjs";

const source = fs.readFileSync(new URL("./dev.mjs", import.meta.url), "utf8");
const packageJson = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("dev launcher starts the web renderer and control plane together", () => {
  assert.equal(packageJson.scripts.dev, "node scripts/dev.mjs");
  assert.equal(packageJson.scripts["dev:demo"], "node scripts/dev.mjs --mock");
  assert.equal(packageJson.scripts["dev:mock"], "node scripts/dev.mjs --mock --web-port=8890 --backend-port=6690 --gateway-port=5190");
  assert.equal(packageJson.scripts["dev:production"], "node scripts/dev.mjs --production --web-port=8888 --backend-port=6681");
  assert.match(source, /backend\/http-server\.js/);
  assert.match(source, /scripts\/static-server\.mjs/);
  assert.match(source, /commandArgs\.includes\("--mock"\)/);
  assert.match(source, /commandOption\("--backend-port"\)/);
  assert.match(source, /BYERING_BACKEND_PORT/);
  assert.match(source, /BYERING_CONTROL_PLANE_URL/);
  assert.match(source, /BYERING_RENDERER_PORT/);
  assert.match(source, /SIGINT/);
  assert.match(source, /SIGTERM/);
});

test("mock renderer configuration targets its paired services", () => {
  const config = runtimeConfigScript({ runtimeMode: "mock", backendPort: 6690, gatewayPort: 5190 });
  assert.match(config, /runtimeMode:"mock"/);
  assert.match(config, /controlPlaneUrl:"http:\/\/127\.0\.0\.1:6690"/);
  assert.match(config, /agentGatewayUrl:"ws:\/\/127\.0\.0\.1:5190\/agent"/);
});

test("renderer configuration preserves an explicitly configured control plane URL", () => {
  const config = runtimeConfigScript({
    runtimeMode: "production",
    controlPlaneUrl: "https://control.example.test/"
  });
  assert.match(config, /controlPlaneUrl:"https:\/\/control\.example\.test"/);
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
