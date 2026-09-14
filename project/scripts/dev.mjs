import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webPort = Number(process.env.MARVIS_PORT || 8888);
const backendPort = Number(process.env.BYERING_BACKEND_PORT || 6681);

const children = [
  spawn(process.execPath, ["--env-file-if-exists=.env.local", "backend/http-server.js"], {
    cwd: root,
    env: { ...process.env, BYERING_BACKEND_PORT: String(backendPort) },
    stdio: "inherit"
  }),
  spawn(process.execPath, ["scripts/static-server.mjs", "--port", String(webPort)], {
    cwd: root,
    env: process.env,
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

console.log(`Byering web: http://127.0.0.1:${webPort}/`);
console.log(`Byering control plane: http://127.0.0.1:${backendPort}`);
