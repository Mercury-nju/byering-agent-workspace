import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startGatewayMock } from "./gateway-mock.mjs";
import { patchRecoveredBrand } from "./brand-patch.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function cliPort() {
  const index = process.argv.findIndex((arg) => arg === "--port" || arg === "-p");
  if (index >= 0 && process.argv[index + 1]) return Number(process.argv[index + 1]);
  const inline = process.argv.find((arg) => arg.startsWith("--port="));
  return inline ? Number(inline.split("=")[1]) : null;
}

const defaultPort = cliPort() || Number(process.env.MARVIS_PORT || 4173);

const mime = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".wasm": "application/wasm",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf"
};

function safePath(rootDir, urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const requested = decoded === "/" || decoded.startsWith("/share/") ? "/index.html" : decoded;
  const resolved = path.resolve(rootDir, `.${requested}`);
  return resolved.startsWith(rootDir + path.sep) ? resolved : null;
}

export function patchRecoveredBundle(filePath, body) {
  if (filePath.endsWith("index-CriD6gLK.js")) {
    let source = body.toString("utf8");
    const from = 'children:"新建对话"';
    if (source.includes(from)) source = source.split(from).join('children:"新任务"');
    return Buffer.from(source);
  }
  if (!filePath.endsWith("treemap-KZPCXAKY-Dm7XgKSQ.js")) return body;
  let source = body.toString("utf8");
  const loginNeedle = "async login(e={}){await this.initPromise;";
  if (source.includes(loginNeedle)) source = source.replace(loginNeedle, "async login(e={}){await this.initPromise;return;");
  const retryNeedle = "h.useEffect(()=>{e?i():x()},[])";
  if (source.includes(retryNeedle)) source = source.replace(retryNeedle, "h.useEffect(()=>{e?i():x();const t=setTimeout(()=>x(),1500);return()=>clearTimeout(t)},[])");
  return patchRecoveredBrand(filePath, Buffer.from(source));
}

export function createStaticServer({ rootDir = root, port = defaultPort, gatewayPort = Number(process.env.MARVIS_GATEWAY_PORT || 5152) } = {}) {
  if (process.env.MARVIS_DISABLE_GATEWAY_MOCK !== "1") startGatewayMock({ port: gatewayPort });
  return http.createServer(async (request, response) => {
    const filePath = safePath(rootDir, request.url || "/");
    if (!filePath) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }
    try {
      const body = patchRecoveredBundle(filePath, await readFile(filePath));
      response.writeHead(200, { "Content-Type": mime[path.extname(filePath)] || "application/octet-stream", "Cache-Control": "no-cache" });
      response.end(body);
    } catch (error) {
      response.writeHead(error.code === "ENOENT" ? 404 : 500);
      response.end(error.code === "ENOENT" ? "Not found" : "Server error");
    }
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const server = createStaticServer({ port: defaultPort });
  server.listen(defaultPort, "127.0.0.1", () => {
    console.log(`Byering recovered renderer: http://127.0.0.1:${defaultPort}/`);
  });
}
