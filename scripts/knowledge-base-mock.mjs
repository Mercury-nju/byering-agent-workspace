import { createServer } from "node:http";

function setCors(request, response) {
  const origin = request.headers.origin;
  if (origin) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Vary", "Origin");
  }
}

function sendJson(request, response, statusCode, body) {
  setCors(request, response);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(JSON.stringify(body));
}

function sendText(request, response, statusCode, body) {
  setCors(request, response);
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(body);
}

async function readText(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1_000_000) throw new Error("Request body too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function readJson(request) {
  const text = await readText(request);
  return text === "" ? {} : JSON.parse(text);
}

function responseFor(pathname, body, state) {
  const command = pathname.replace(/^\/+/, "");

  switch (command) {
    case "health":
      return { code: 0 };
    case "privilege/check":
      return { code: 0, status: state.privilegeGranted ? 1 : 0 };
    case "privilege/grant":
      state.privilegeGranted = true;
      return { code: 0, status: 1 };
    case "hidden/get":
      return { code: 0, items: state.hiddenItems };
    case "hidden/set":
      state.hiddenItems = Array.isArray(body.items) ? body.items : state.hiddenItems;
      return { code: 0 };
    case "file/list":
      return { code: 0, topics: [] };
    case "file/filter":
      return { code: 0, filters: [] };
    case "face/cluster/list":
      return { code: 0, totalCount: 0, clusters: [], faces: [] };
    case "face/list":
      return { code: 0, totalCount: 0, faces: [] };
    default:
      // ponytail: empty local knowledge base only; replace with the real daemon for indexing or file access.
      return { code: 0 };
  }
}

export function createKnowledgeBaseMock() {
  const state = { hiddenItems: [], privilegeGranted: false };
  const sockets = new Map();
  let nextSocketId = 1;

  return createServer(async (request, response) => {
    if (request.method === "OPTIONS") {
      setCors(request, response);
      response.writeHead(204, {
        "Access-Control-Allow-Headers": request.headers["access-control-request-headers"] ?? "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS"
      });
      response.end();
      return;
    }

    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname === "/socket.io/") {
      if (url.searchParams.get("transport") !== "polling") {
        sendText(request, response, 400, "Unsupported transport");
        return;
      }

      const socketId = url.searchParams.get("sid");
      if (request.method === "GET" && !socketId) {
        const sid = `mock-${nextSocketId++}`;
        sockets.set(sid, { connected: false });
        sendText(request, response, 200, `0${JSON.stringify({ sid, upgrades: [], pingInterval: 25000, pingTimeout: 20000, maxPayload: 1000000 })}`);
        return;
      }

      const socket = sockets.get(socketId);
      if (!socket) {
        sendText(request, response, 400, "Unknown session");
        return;
      }
      if (request.method === "POST") {
        await readText(request);
        sendText(request, response, 200, "ok");
        return;
      }
      if (request.method === "GET") {
        if (!socket.connected) {
          socket.connected = true;
          sendText(request, response, 200, `40${JSON.stringify({ sid: socketId })}`);
          return;
        }
        sendText(request, response, 200, "2");
        return;
      }
      sendText(request, response, 405, "Method Not Allowed");
      return;
    }

    if (request.method !== "POST") {
      sendJson(request, response, 405, { code: 405, message: "Method Not Allowed" });
      return;
    }

    try {
      const body = await readJson(request);
      sendJson(request, response, 200, responseFor(url.pathname, body, state));
    } catch (error) {
      sendJson(request, response, 400, { code: 400, message: error instanceof Error ? error.message : "Bad Request" });
    }
  });
}

export function startKnowledgeBaseMock({ host = "127.0.0.1", port = 5151, allowExistingService = true } = {}) {
  const server = createKnowledgeBaseMock();

  return new Promise((resolve, reject) => {
    server.once("error", (error) => {
      if (allowExistingService && error?.code === "EADDRINUSE") {
        resolve({ server: null, port, usingExistingService: true });
        return;
      }
      reject(error);
    });
    server.listen(port, host, () => resolve({ server, port: server.address().port, usingExistingService: false }));
  });
}
