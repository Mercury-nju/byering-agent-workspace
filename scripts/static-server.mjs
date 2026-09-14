import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

const defaultRoot = fileURLToPath(new URL("../offline-pack/main/", import.meta.url));

function send(response, statusCode, body = "") {
  response.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8", "X-Content-Type-Options": "nosniff" });
  response.end(body);
}

export function createStaticServer({ root = defaultRoot } = {}) {
  const rootPath = resolve(root);
  const rootPrefix = `${rootPath}${sep}`;
  const canonicalRoot = realpath(rootPath);

  return createServer(async (request, response) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.setHeader("Allow", "GET, HEAD");
      send(response, 405, "Method Not Allowed");
      return;
    }

    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
    } catch {
      send(response, 400, "Bad Request");
      return;
    }

    const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const filePath = resolve(rootPath, relativePath);
    if (filePath !== rootPath && !filePath.startsWith(rootPrefix)) {
      send(response, 403, "Forbidden");
      return;
    }

    try {
      const [fileStats, canonicalPath, resolvedRoot] = await Promise.all([stat(filePath), realpath(filePath), canonicalRoot]);
      if (!fileStats.isFile() || (canonicalPath !== resolvedRoot && !canonicalPath.startsWith(`${resolvedRoot}${sep}`))) {
        send(response, 404, "Not Found");
        return;
      }

      response.writeHead(200, {
        "Content-Length": fileStats.size,
        "Content-Type": MIME_TYPES[extname(filePath).toLowerCase()] ?? "application/octet-stream",
        "X-Content-Type-Options": "nosniff"
      });
      if (request.method === "HEAD") {
        response.end();
        return;
      }
      createReadStream(filePath).pipe(response);
    } catch (error) {
      if (error?.code === "ENOENT" || error?.code === "ENOTDIR") {
        send(response, 404, "Not Found");
        return;
      }
      send(response, 500, "Internal Server Error");
    }
  });
}

export function startStaticServer({ root, host = "127.0.0.1", port = 4173, fallbackToRandomPort = false } = {}) {
  const server = createStaticServer({ root });

  return new Promise((resolve, reject) => {
    const listen = (listenPort, allowFallback) => {
      server.once("error", (error) => {
        if (allowFallback && error?.code === "EADDRINUSE") {
          listen(0, false);
          return;
        }
        reject(error);
      });
      server.listen(listenPort, host, () => resolve(server));
    };
    listen(port, fallbackToRandomPort);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 4173);
  const host = process.env.HOST ?? "127.0.0.1";
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error("PORT must be an integer between 0 and 65535");
  }
  const server = await startStaticServer({ host, port, fallbackToRandomPort: process.env.PORT === undefined });
  {
    const address = server.address();
    console.log(`Serving offline-pack/main at http://${host}:${address.port}/`);
  }
}
