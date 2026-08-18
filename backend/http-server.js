import { createServer } from "node:http";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { ControlPlaneError, createControlPlane } from "./control-plane.js";

export function createControlPlaneHttpServer({ controlPlane = createControlPlane(), bodyLimit = 1024 * 1024 } = {}) {
  const server = createServer(async (request, response) => {
    try {
      await route(request, response, controlPlane, bodyLimit);
    } catch (error) {
      sendError(response, error);
    }
  });
  server.controlPlane = controlPlane;
  return server;
}

export function startControlPlaneServer({ port = Number(process.env.BYERING_BACKEND_PORT || 6681), host = "127.0.0.1", ...options } = {}) {
  const server = createControlPlaneHttpServer(options);
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.removeListener("error", reject);
      resolve(server);
    });
  });
}

async function route(request, response, controlPlane, bodyLimit) {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  setCorsHeaders(response);
  if (request.method === "OPTIONS") return sendJson(response, 204, null);
  if (request.method === "GET" && url.pathname === "/healthz") return sendJson(response, 200, { ok: true });

  const taskMatch = url.pathname.match(/^\/v1\/tasks\/([^/]+)(?:\/(events|snapshot|start|commands))?$/);
  if (request.method === "GET" && taskMatch) {
    const taskId = decodeURIComponent(taskMatch[1]);
    if (taskMatch[2] === "events") {
      const afterSeq = parseNonNegativeInteger(url.searchParams.get("afterSeq"), 0);
      const limit = parseNonNegativeInteger(url.searchParams.get("limit"), 100);
      return sendJson(response, 200, { taskId, events: controlPlane.listTaskEvents(taskId, { afterSeq, limit }) });
    }
    return sendJson(response, 200, controlPlane.getTaskSnapshot(taskId));
  }

  if (request.method === "POST" && url.pathname === "/v1/commands") {
    return sendJson(response, 202, controlPlane.dispatch(await readJson(request, bodyLimit)));
  }

  if (request.method === "POST" && url.pathname === "/v1/tasks") {
    const body = await readJson(request, bodyLimit);
    return sendJson(response, 202, controlPlane.dispatch(toCommandBody(body, "task.create")));
  }

  if (taskMatch && request.method === "POST") {
    const taskId = decodeURIComponent(taskMatch[1]);
    const body = await readJson(request, bodyLimit);
    if (taskMatch[2] === "start") {
      return sendJson(response, 202, controlPlane.dispatch(toCommandBody(body, "task.run.start", taskId)));
    }
    if (taskMatch[2] === "commands") {
      return sendJson(response, 202, controlPlane.dispatch({ ...body, taskId }));
    }
  }

  throw new ControlPlaneError("Route not found", { code: "NOT_FOUND", statusCode: 404 });
}

function toCommandBody(body, type, taskId = undefined) {
  const source = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  const payload = source.payload && typeof source.payload === "object" ? source.payload : stripCommandFields(source);
  return { ...source, type, ...(taskId ? { taskId } : {}), payload };
}

function stripCommandFields(source) {
  const fields = new Set(["type", "commandType", "commandId", "idempotencyKey", "taskId", "taskRunId", "runId", "conversationId", "agentId", "expectedVersion", "causationId", "correlationId", "actor", "createdAt", "metadata", "schemaVersion"]);
  return Object.fromEntries(Object.entries(source).filter(([key]) => !fields.has(key)));
}

async function readJson(request, bodyLimit) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > bodyLimit) throw new ControlPlaneError("Request body is too large", { code: "PAYLOAD_TOO_LARGE", statusCode: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ControlPlaneError("Request body must be valid JSON", { code: "INVALID_JSON", statusCode: 400 });
  }
}

function parseNonNegativeInteger(value, fallback) {
  if (value == null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new ControlPlaneError("Query value must be a non-negative integer", { code: "INVALID_QUERY", statusCode: 400 });
  return parsed;
}

function setCorsHeaders(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Headers", "content-type, authorization, x-request-id");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
}

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  if (statusCode === 204) return response.end();
  response.end(JSON.stringify(payload));
}

function sendError(response, error) {
  const statusCode = error instanceof ControlPlaneError ? error.statusCode : 500;
  sendJson(response, statusCode, {
    accepted: false,
    error: {
      code: error.code || "INTERNAL_ERROR",
      message: error.message || "Internal server error",
      details: error.details || undefined
    }
  });
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMainModule) {
  startControlPlaneServer().then((server) => {
    const address = server.address();
    console.log(`Byering control plane listening on http://${address.address}:${address.port}`);
  }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
