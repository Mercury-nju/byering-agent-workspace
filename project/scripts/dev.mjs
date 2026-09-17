import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtimeMode = process.env.BYERING_RUNTIME_MODE === "mock" ? "mock" : "production";
const defaultPorts = runtimeMode === "mock" ? { web: 8890, backend: 6690 } : { web: 8888, backend: 6681 };
const webPort = Number(process.env.MARVIS_PORT || defaultPorts.web);
const backendPort = Number(process.env.BYERING_BACKEND_PORT || defaultPorts.backend);

const children = [
  spawn(process.execPath, ["--env-file-if-exists=.env.local", "backend/http-server.js"], {
    cwd: root,
    env: {
      ...process.env,
      BYERING_BACKEND_PORT: String(backendPort),
      BYERING_RENDERER_PORT: String(webPort),
      BYERING_RUNTIME_MODE: runtimeMode
    },
    stdio: "inherit"
  }),
  spawn(process.execPath, ["scripts/static-server.mjs", "--port", String(webPort)], {
    cwd: root,
    env: { ...process.env, BYERING_RUNTIME_MODE: runtimeMode },
    stdio: "inherit"
  })
];

let stopping = false;

function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
  setTimeout(() => process.exit(exitCode), 500);
}

for (const child of children) {
  child.once("error", () => stop(1));
  child.once("exit", (code, signal) => {
    if (stopping) return;
    const failed = signal !== "SIGTERM" && code !== 0;
    stop(failed ? code || 1 : 0);
  });
}

process.once("SIGINT", () => stop(0));
process.once("SIGTERM", () => stop(0));

console.log(`Byering mode: ${runtimeMode === "mock" ? "纯 Mock · 开发/演示" : "正式本地 · 真实逻辑"}`);
console.log(`Byering web: http://127.0.0.1:${webPort}/`);
console.log(`Byering control plane: http://127.0.0.1:${backendPort}`);
console.log(`Byering runtime config: http://127.0.0.1:${webPort}/runtime-config.js`);
