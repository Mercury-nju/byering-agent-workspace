/**
 * Boundary adapter for the legacy ClueHunter Java/RPA service.
 *
 * The legacy service remains the source of truth for Douyin execution. This
 * module owns transport concerns, request signing, idempotency, and translation
 * into the Byering task-event envelope. It deliberately never treats an
 * unknown command or an ambiguous upstream response as success.
 */

import { createHmac } from "node:crypto";

import { createEventEnvelope } from "../runtime/task-protocol.js";

const DEFAULT_PATHS = Object.freeze({
  heartbeat: "/api/rpa/robot/heartbeat",
  ack: "/api/rpa/robot/ack",
  authorize: "/api/rpa/robot/accountAuthAck",
  status: "/api/rpa/robot/ws/status",
  // The legacy service does not expose this route yet. Deployments must set
  // an explicit path after the protected domain submit contract is deployed.
  submit: null
});

const LEGACY_SUBMIT_PATH = "/api/rpa/robot/submit";
const LEGACY_QUEUE_BY_ACTION = Object.freeze({
  // The legacy service routes touch letters by RpaQueues. Keep this mapping
  // deterministic so an Agent cannot invent a queue name at dispatch time.
  4: "VIDEO_COMMENT_HIGH_INTENTION",
  5: "VIDEO_COMMENT_HIGH_INTENTION",
  20: "FANS_FOLLOW",
  21: "INTERACT_ACTION_HIGH_INTENTION",
  23: "VIDEO_COMMENT_REPLY"
});

const ACTIONS = Object.freeze({
  0: "rpa_client_upgrade",
  1: "download_browser",
  2: "open_douyin",
  3: "douyin_qr_login",
  4: "private_message",
  5: "private_message_without_follow",
  6: "barrage_rotation",
  7: "barrage_reply",
  8: "follow_report",
  9: "follow_touch",
  10: "login_check",
  11: "live_monitor",
  12: "live_monitor_stop",
  13: "live_barrage_fetch",
  14: "live_barrage_fetch_stop",
  15: "tiktok_live_manager_login_check",
  16: "tiktok_live_screen_login_check",
  20: "follow_account",
  21: "cancel_follow",
  22: "live_status",
  23: "video_comment_reply",
  100: "douyin_qr_login",
  101: "douyin_sms_code",
  102: "douyin_sms_send",
  106: "douyin_force_logout",
  167: "douyin_websocket_reconnect",
  1000: "tiktok_qr_login",
  1001: "tiktok_mail_code",
  1002: "tiktok_mail_resend",
  1003: "tiktok_close_login_page",
  1004: "tiktok_force_logout",
  1005: "tiktok_websocket_monitor",
  1100: "douyin_phone_code_send",
  1101: "douyin_phone_code_verify",
  2001: "pull_video_list"
});

const AUTH_ACTIONS = new Set([
  "rpa_client_upgrade", "download_browser", "open_douyin", "douyin_qr_login",
  "login_check", "tiktok_live_manager_login_check", "tiktok_live_screen_login_check",
  "douyin_sms_code", "douyin_sms_send", "douyin_force_logout", "douyin_websocket_reconnect",
  "tiktok_qr_login", "tiktok_mail_code", "tiktok_mail_resend", "tiktok_close_login_page",
  "tiktok_force_logout", "tiktok_websocket_monitor", "douyin_phone_code_send", "douyin_phone_code_verify"
]);

const OUTREACH_ACTIONS = new Set([
  "private_message", "private_message_without_follow", "barrage_rotation", "barrage_reply",
  "follow_touch", "follow_account", "cancel_follow", "video_comment_reply"
]);

const RESULT_VALUES = new Set(["SUCCESS", "FAIL", "FAIL_RETRY", "ISSUED"]);

export class ClueHunterConnectorError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = "ClueHunterConnectorError";
    this.code = code;
    Object.assign(this, details);
    this.details = details;
  }
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function pick(source, ...keys) {
  for (const key of keys) {
    const value = source?.[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
}

function requireValue(value, field, code = "REQUIRED_FIELD") {
  const normalized = nonEmpty(value);
  if (!normalized) throw new ClueHunterConnectorError(`${field} is required`, code, { field });
  return normalized;
}

function normalizeActionType(value) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(number) || !Object.hasOwn(ACTIONS, number)) {
    throw new ClueHunterConnectorError(`Unknown ClueHunter action: ${String(value)}`, "UNKNOWN_ACTION", { actionType: value });
  }
  return number;
}

function normalizeResult(value) {
  const result = String(value || "").trim().toUpperCase();
  if (!RESULT_VALUES.has(result)) {
    throw new ClueHunterConnectorError(`Unknown RPA ACK result: ${String(value)}`, "RESULT_REQUIRED", { result: value });
  }
  return result;
}

function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

const SENSITIVE_KEY = /(?:authorization|access[_-]?token|refresh[_-]?token|password|passwd|cookie|secret|csrf|jwt)/i;

function redactSensitive(value) {
  if (Array.isArray(value)) return value.map(redactSensitive);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !SENSITIVE_KEY.test(key))
    .map(([key, item]) => [key, redactSensitive(item)]));
}

function stableFingerprint(value) {
  const normalize = (item) => {
    if (Array.isArray(item)) return item.map(normalize);
    if (isRecord(item)) {
      return Object.fromEntries(Object.keys(item).sort().map((key) => [key, normalize(item[key])]));
    }
    return item;
  };
  return JSON.stringify(normalize(value));
}

function parseJsonString(value) {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return value; }
}

function extractAckResult(value) {
  const candidate = parseJsonString(value);
  if (!isRecord(candidate)) return null;
  const result = pick(candidate, "result", "status");
  if (result == null) {
    const nested = pick(candidate, "data", "entity", "resultData");
    return nested && nested !== candidate ? extractAckResult(nested) : null;
  }
  try { return normalizeResult(result); } catch { return null; }
}

function assertAckAccepted(value, requestedResult) {
  const candidate = parseJsonString(value);
  const upstreamResult = extractAckResult(candidate);
  if (upstreamResult && upstreamResult !== requestedResult) {
    throw new ClueHunterConnectorError("ClueHunter ACK result does not match the submitted result", "ACK_RESULT_MISMATCH", {
      requestedResult,
      upstreamResult
    });
  }
  if (candidate === true) return candidate;
  if (upstreamResult === requestedResult) return candidate;
  if (isRecord(candidate) && (
    candidate.accepted === true ||
    candidate.success === true ||
    candidate.isSuccess === true ||
    candidate.ok === true ||
    candidate.code === 0 && (candidate.data === true || candidate.entity === true)
  )) return candidate;
  throw new ClueHunterConnectorError("ClueHunter ACK response is ambiguous", "ACK_RESPONSE_AMBIGUOUS", {
    upstream: redactSensitive(candidate)
  });
}

function assertSubmitAccepted(value) {
  if (!isRecord(value) || value.accepted !== true) {
    throw new ClueHunterConnectorError("ClueHunter submit response is ambiguous", "SUBMIT_RESPONSE_AMBIGUOUS", {
      upstream: redactSensitive(value)
    });
  }
  const commandId = nonEmpty(pick(value, "commandId", "command_id", "letterInfoId", "letter_info_id", "id"));
  const letterInfoId = nonEmpty(pick(value, "letterInfoId", "letter_info_id"));
  const queue = nonEmpty(pick(value, "queue", "queueName", "queue_name"));
  const status = nonEmpty(pick(value, "status"));
  if (!commandId || !queue || !status) {
    throw new ClueHunterConnectorError("ClueHunter submit response is incomplete", "SUBMIT_RESPONSE_INVALID", {
      upstream: redactSensitive(value),
      required: ["accepted", "commandId", "queue", "status"]
    });
  }
  return { commandId, letterInfoId, queue, status };
}

function withoutUndefined(value) {
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function canonicalContext(input = {}) {
  const taskId = requireValue(pick(input, "taskId", "task_id"), "taskId", "CONTEXT_REQUIRED");
  const taskRunId = requireValue(pick(input, "taskRunId", "task_run_id", "runId", "run_id"), "taskRunId", "CONTEXT_REQUIRED");
  const conversationId = requireValue(pick(input, "conversationId", "conversation_id"), "conversationId", "CONTEXT_REQUIRED");
  const agentId = requireValue(pick(input, "agentId", "agent_id"), "agentId", "CONTEXT_REQUIRED");
  const skillId = pick(input, "skillId", "skill_id");
  const skillRunId = pick(input, "skillRunId", "skill_run_id");
  if ((skillId && !skillRunId) || (!skillId && skillRunId)) {
    throw new ClueHunterConnectorError("skillId and skillRunId must be provided together", "CONTEXT_REQUIRED");
  }
  return {
    schemaVersion: 1,
    taskId,
    taskRunId,
    conversationId,
    agentId,
    skillId: skillId || null,
    skillRunId: skillRunId || null,
    agentRunId: pick(input, "agentRunId", "agent_run_id") || null,
    causationId: pick(input, "causationId", "causation_id") || null,
    correlationId: pick(input, "correlationId", "correlation_id") || null,
    seq: Number.isInteger(input.seq) && input.seq > 0 ? input.seq : 1,
    occurredAt: input.occurredAt || input.occurred_at || new Date().toISOString()
  };
}

function actionName(actionType) {
  return ACTIONS[normalizeActionType(actionType)];
}

function actionEventType(actionType, result = null) {
  const name = actionName(actionType);
  if (AUTH_ACTIONS.has(name)) {
    if (result === "SUCCESS") return "access.authorization.granted";
    if (result) return "access.authorization.failed";
    return "access.authorization.requested";
  }
  if (name === "pull_video_list") return result === "FAIL" || result === "FAIL_RETRY" ? "task.integration.failed" : "lead.source.synced";
  if (OUTREACH_ACTIONS.has(name)) {
    if (!result) return "outreach.sending";
    if (result === "SUCCESS") return "outreach.sent";
    if (result === "ISSUED") return "outreach.sending";
    return "outreach.failed";
  }
  return result === "FAIL" || result === "FAIL_RETRY" ? "task.integration.failed" : "task.progress";
}

function channelFor(name) {
  if (name === "private_message" || name === "private_message_without_follow") return "private_message";
  if (name === "video_comment_reply" || name === "barrage_reply") return "video_comment";
  if (name === "follow_touch" || name === "follow_account" || name === "cancel_follow") return "follow";
  return null;
}

function eventFromLegacy(source, context, { result = null, index = 0, namespace = "command", now = null } = {}) {
  const actionType = normalizeActionType(source.actionType ?? source.action_type);
  const name = ACTIONS[actionType];
  const ackId = nonEmpty(pick(source, "ackId", "ack_id"));
  if (!ackId) throw new ClueHunterConnectorError("ackId is required for a legacy command", "ACK_ID_REQUIRED");
  const normalizedContext = canonicalContext(context);
  const normalizedResult = result ? normalizeResult(result) : null;
  const type = actionEventType(actionType, normalizedResult);
  const payload = withoutUndefined({
    source: "cluehunter",
    channel: channelFor(name),
    leadId: pick(source, "operatedUserId", "operated_user_id", "userId", "user_id"),
    videoId: pick(source, "videoId", "video_id", "itemId", "item_id"),
    account: pick(source, "operatedAccount", "operated_account", "account"),
    content: pick(source, "content", "originalComment", "original_comment"),
    deliveryState: normalizedResult === "SUCCESS" ? "success" : normalizedResult === "ISSUED" ? "issued" : undefined,
    retryable: normalizedResult === "FAIL_RETRY" ? true : normalizedResult ? normalizedResult !== "FAIL" : undefined,
    errorCode: normalizedResult && normalizedResult !== "SUCCESS" && normalizedResult !== "ISSUED"
      ? pick(source, "resultCode", "result_code")
      : undefined,
    reason: normalizedResult && normalizedResult !== "SUCCESS" && normalizedResult !== "ISSUED"
      ? pick(source, "reason", "message")
      : undefined,
    action: name,
    actionType,
    legacy: redactSensitive(source)
  });
  return createEventEnvelope({
    ...normalizedContext,
    eventId: `cluehunter:${namespace}:${ackId}:${index}`,
    seq: normalizedContext.seq + index,
    occurredAt: now || normalizedContext.occurredAt,
    type,
    payload
  });
}

function unwrapData(body, { allowEmpty = false } = {}) {
  if (body == null) throw new ClueHunterConnectorError("ClueHunter returned an empty response", "RESPONSE_EMPTY");
  if (!isRecord(body)) return body;
  if (body.success === false || (body.code !== undefined && body.code !== 0 && body.code !== "0")) {
    throw new ClueHunterConnectorError(body.msg || body.message || "ClueHunter rejected the request", "UPSTREAM_REJECTED", { upstream: redactSensitive(body) });
  }
  const hasData = Object.hasOwn(body, "data") || Object.hasOwn(body, "entity") || Object.hasOwn(body, "result");
  const data = hasData ? (body.data ?? body.entity ?? body.result) : body;
  if ((data === undefined || data === null) && !allowEmpty) {
    throw new ClueHunterConnectorError("ClueHunter returned no usable data", "UPSTREAM_EMPTY", { upstream: cloneJson(body) });
  }
  return data;
}

function commandList(value) {
  if (Array.isArray(value)) return value;
  if (isRecord(value)) {
    const nested = value.data ?? value.entity ?? value.result ?? value.commands;
    if (Array.isArray(nested)) return nested;
  }
  throw new ClueHunterConnectorError("Heartbeat response must contain a command list", "RESPONSE_INVALID");
}

export function mapLegacyHeartbeatToEvents(commands, context = {}, options = {}) {
  return commandList(commands).map((command, index) => eventFromLegacy(command, context, { index, namespace: "heartbeat", now: options.now }));
}

export function mapLegacyAckToEvents(ack, context = {}, options = {}) {
  if (!isRecord(ack)) throw new ClueHunterConnectorError("ACK must be an object", "ACK_INVALID");
  const result = normalizeResult(pick(ack, "result", "status"));
  return [eventFromLegacy(ack, context, { result, namespace: "ack", now: options.now })];
}

function mapAuthorizationEvents(value, context, { now = null, status = false } = {}) {
  const normalizedValue = typeof value === "string" ? value.toUpperCase() : value;
  const source = isRecord(normalizedValue)
    ? normalizedValue
    : { status: normalizedValue, authorized: normalizedValue === true || normalizedValue === "READY" || normalizedValue === "SUCCESS" };
  const authorized = source.authorized === true || source.login === true || source.loggedIn === true || source.status === "READY" || source.status === "SUCCESS";
  const normalizedContext = canonicalContext(context);
  return [createEventEnvelope({
    ...normalizedContext,
    eventId: `cluehunter:authorization:${pick(source, "eventKey", "requestId", "request_id", "idempotencyKey") || normalizedContext.correlationId || `${normalizedContext.seq}-${now || normalizedContext.occurredAt}`}:${status ? "status" : "callback"}`,
    occurredAt: now || normalizedContext.occurredAt,
    type: authorized ? "access.authorization.granted" : "access.authorization.required",
    payload: withoutUndefined({
      source: "cluehunter",
      authorized,
      account: pick(source, "account", "nickname"),
      userId: pick(source, "userId", "user_id"),
      status: pick(source, "status"),
      legacy: redactSensitive(source)
    })
  })];
}

function joinUrl(baseUrl, path) {
  const base = new URL(baseUrl);
  if (!path.startsWith("/")) throw new ClueHunterConnectorError("Legacy path must be absolute", "CONFIG_INVALID");
  return new URL(path, base).toString();
}

function signRequest(secret, timestamp, method, path, body) {
  const canonical = [timestamp, method.toUpperCase(), path, body || ""].join("\n");
  return `sha256=${createHmac("sha256", secret).update(canonical).digest("hex")}`;
}

function signLegacySubmitRequest(secret, timestamp, method, path, body) {
  const canonical = [timestamp, method.toUpperCase(), path, body || ""].join("\n");
  return createHmac("sha256", secret).update(canonical).digest("base64");
}

function isLegacySubmitPath(path) {
  if (!path) return false;
  try { return new URL(path, "http://cluehunter.local").pathname === LEGACY_SUBMIT_PATH; } catch { return path === LEGACY_SUBMIT_PATH; }
}

function defaultLegacyQueue(actionType) {
  return LEGACY_QUEUE_BY_ACTION[actionType] || null;
}

function normalizedLegacySubmitPayload(input, { actionType, idempotencyKey } = {}) {
  const tenant = pick(input, "tenant", "tenantId", "tenant_id");
  const uid = pick(input, "uid", "robotId", "robot_id");
  if (!/^\d+$/.test(String(tenant || ""))) {
    throw new ClueHunterConnectorError("Legacy submit requires a numeric tenant", "TENANT_REQUIRED");
  }
  if (!/^\d+$/.test(String(uid || ""))) {
    throw new ClueHunterConnectorError("Legacy submit requires a numeric robot uid", "UID_INVALID");
  }
  const queue = nonEmpty(pick(input, "queue", "queueName", "queue_name")) || defaultLegacyQueue(actionType);
  if (!queue) {
    throw new ClueHunterConnectorError("Legacy submit requires a supported queue", "QUEUE_REQUIRED");
  }
  return withoutUndefined({
    ...input,
    tenant: Number(tenant),
    uid: Number(uid),
    action: actionType,
    actionType: undefined,
    queue,
    idempotencyKey,
    idempotency_key: undefined,
    requestId: undefined,
    request_id: undefined,
    consumerOpenId: pick(input, "consumerOpenId", "consumer_open_id", "leadId", "lead_id"),
    consumerSecUid: pick(input, "consumerSecUid", "consumer_sec_uid", "leadSecUid", "lead_sec_uid"),
    consumerNickname: pick(input, "consumerNickname", "consumer_nickname", "leadName", "lead_name"),
    consumerAvatar: pick(input, "consumerAvatar", "consumer_avatar", "leadAvatar", "lead_avatar"),
    content: pick(input, "content", "message", "text")
  });
}

export function createClueHunterConnector({
  baseUrl,
  secret,
  authorizationToken = null,
  tokenProvider = null,
  fetchImpl = globalThis.fetch,
  paths = {},
  timeoutMs = 10000,
  now = () => Date.now(),
  idempotencyTtlMs = 10 * 60 * 1000,
  maxIdempotencyEntries = 1000
} = {}) {
  let parsedBase;
  try { parsedBase = new URL(baseUrl); } catch { parsedBase = null; }
  if (!parsedBase || !/^https?:$/.test(parsedBase.protocol) || !nonEmpty(secret)) {
    throw new ClueHunterConnectorError("baseUrl and secret are required", "CONFIG_INVALID");
  }
  if (typeof fetchImpl !== "function") throw new ClueHunterConnectorError("fetchImpl is required", "CONFIG_INVALID");

  const endpoint = { ...DEFAULT_PATHS, ...paths };
  const idempotentResults = new Map();
  const operationResults = new Map();
  let operationSequence = 0;

  if (authorizationToken != null && (!nonEmpty(authorizationToken))) {
    throw new ClueHunterConnectorError("authorizationToken must be a non-empty string", "TOKEN_INVALID");
  }

  function pruneCache(cache) {
    const timestamp = Number(now()) || Date.now();
    for (const [key, entry] of cache) {
      if (entry.settledAt && timestamp - entry.settledAt > idempotencyTtlMs) cache.delete(key);
    }
    if (cache.size <= maxIdempotencyEntries) return;
    const settled = [...cache.entries()]
      .filter(([, entry]) => entry.settledAt)
      .sort(([, left], [, right]) => left.settledAt - right.settledAt);
    for (const [key] of settled.slice(0, cache.size - maxIdempotencyEntries)) cache.delete(key);
  }

  function cacheOperation(cache, key, fingerprint, operation) {
    pruneCache(cache);
    const existing = cache.get(key);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        throw new ClueHunterConnectorError("Idempotency key is already used for different input", "IDEMPOTENCY_CONFLICT", { key });
      }
      return { promise: existing.promise, reused: true };
    }
    const promise = Promise.resolve().then(operation);
    const entry = { fingerprint, promise, settledAt: 0 };
    cache.set(key, entry);
    promise.then(() => { entry.settledAt = Number(now()) || Date.now(); }, () => { cache.delete(key); });
    return { promise, reused: false };
  }

  async function resolveAuthorization(input = {}) {
    const direct = nonEmpty(input.authorizationToken || input.accessToken || input.token);
    if (direct) return direct;
    if (typeof tokenProvider === "function") {
      let provided;
      try { provided = await tokenProvider(input); } catch (error) {
        throw new ClueHunterConnectorError("Authorization token provider failed", "TOKEN_PROVIDER_FAILED", { cause: error });
      }
      if (provided == null) return null;
      if (!nonEmpty(provided)) throw new ClueHunterConnectorError("Authorization token must be a non-empty string", "TOKEN_INVALID");
      return nonEmpty(provided);
    }
    return authorizationToken ? nonEmpty(authorizationToken) : null;
  }

  async function request(method, path, payload, { idempotencyKey, allowEmpty = false, authorization, legacySubmit = false } = {}) {
    const url = joinUrl(parsedBase.toString(), path);
    const body = payload == null ? "" : JSON.stringify(payload);
    const timestamp = String(now());
    const headers = {
      accept: "application/json",
      "content-type": "application/json",
      "x-cluehunter-timestamp": timestamp,
      "x-cluehunter-signature": signRequest(secret, timestamp, method, new URL(url).pathname, body)
    };
    if (idempotencyKey) {
      headers["x-idempotency-key"] = idempotencyKey;
      if (legacySubmit) headers["Idempotency-Key"] = idempotencyKey;
    }
    if (legacySubmit) {
      // The submit endpoint in the legacy Java service uses its own header
      // names and Base64 signature format. Keep the generic headers above for
      // gateways that still inspect them, but always provide the old contract.
      headers.timestamp = timestamp;
      headers.signature = signLegacySubmitRequest(secret, timestamp, method, new URL(url).pathname, body);
    }
    if (payload?.uid != null) headers["x-cluehunter-uid"] = String(payload.uid);
    if (authorization) headers.authorization = `Bearer ${authorization}`;
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    let response;
    try {
      response = await fetchImpl(url, { method, headers, body, signal: controller?.signal });
    } catch (error) {
      throw new ClueHunterConnectorError("ClueHunter is unavailable", "UPSTREAM_UNAVAILABLE", { cause: error });
    } finally {
      if (timer) clearTimeout(timer);
    }
    let parsed;
    try { parsed = await response.json(); } catch (error) {
      throw new ClueHunterConnectorError("ClueHunter returned invalid JSON", "RESPONSE_INVALID", { cause: error });
    }
    if (!response.ok) {
      throw new ClueHunterConnectorError("ClueHunter HTTP request failed", "UPSTREAM_HTTP_ERROR", { status: response.status, upstream: redactSensitive(parsed) });
    }
    return unwrapData(parsed, { allowEmpty });
  }

  async function lease(input = {}) {
    const uid = requireValue(pick(input, "uid", "robotId", "robot_id"), "uid");
    const context = canonicalContext(input);
    const payload = withoutUndefined({
      uid,
      tenant: input.tenant,
      shopUid: input.shopUid,
      deviceId: input.deviceId,
      platform: input.platform ?? 1,
      subProcess: input.subProcess === true || input.subProcess === 1 ? 1 : 0
    });
    const data = await request("POST", endpoint.heartbeat, payload, {
      idempotencyKey: input.idempotencyKey,
      authorization: await resolveAuthorization(input)
    });
    const commands = commandList(data);
    return { accepted: true, uid, commands: cloneJson(commands), events: mapLegacyHeartbeatToEvents(commands, context, { now: new Date(now()).toISOString() }), idempotent: false };
  }

  async function ack(input = {}) {
    const uid = requireValue(pick(input, "uid", "robotId", "robot_id"), "uid");
    const ackId = requireValue(pick(input, "ackId", "ack_id"), "ackId", "ACK_ID_REQUIRED");
    const actionType = normalizeActionType(pick(input, "actionType", "action_type"));
    const result = normalizeResult(pick(input, "result", "status"));
    const key = `ack:${uid}:${ackId}:${actionType}`;
    const fingerprint = stableFingerprint({
      uid,
      ackId,
      actionType,
      result,
      resultCode: pick(input, "resultCode", "result_code"),
      reason: pick(input, "reason", "message"),
      content: pick(input, "content"),
      taskId: pick(input, "taskId", "task_id"),
      taskRunId: pick(input, "taskRunId", "task_run_id", "runId", "run_id"),
      conversationId: pick(input, "conversationId", "conversation_id"),
      agentId: pick(input, "agentId", "agent_id"),
      skillId: pick(input, "skillId", "skill_id"),
      skillRunId: pick(input, "skillRunId", "skill_run_id")
    });
    const cached = cacheOperation(idempotentResults, key, fingerprint, async () => {
      const payload = withoutUndefined({ ...input, uid, ackId, actionType, result });
      delete payload.authorizationToken;
      delete payload.accessToken;
      delete payload.token;
      const context = canonicalContext(input);
      const data = await request("POST", endpoint.ack, payload, {
        idempotencyKey: key,
        allowEmpty: false,
        authorization: await resolveAuthorization(input)
      });
      assertAckAccepted(data, result);
      return { accepted: true, uid, ack: cloneJson(data), events: mapLegacyAckToEvents(payload, context, { now: new Date(now()).toISOString() }), idempotent: false };
    });
    const resultObject = await cached.promise;
    return { ...cloneJson(resultObject), idempotent: cached.reused };
  }

  async function authorize(input = {}) {
    const uid = requireValue(pick(input, "uid", "robotId", "robot_id"), "uid");
    const context = canonicalContext(input);
    const payload = withoutUndefined({ ...input });
    delete payload.authorizationToken;
    delete payload.accessToken;
    delete payload.token;
    const eventKey = nonEmpty(input.requestId || input.request_id || input.idempotencyKey) || `${now()}-${++operationSequence}`;
    payload.eventKey = eventKey;
    const key = `authorize:${uid}:${eventKey}`;
    const fingerprint = stableFingerprint({ uid, payload });
    const cached = cacheOperation(operationResults, key, fingerprint, async () => {
      const data = await request("POST", endpoint.authorize, payload, {
        idempotencyKey: input.idempotencyKey || eventKey,
        allowEmpty: false,
        authorization: await resolveAuthorization(input)
      });
      const authorizationSource = isRecord(data) ? { ...payload, ...data } : { ...payload, authorized: data === true || data === "SUCCESS" };
      return { accepted: true, uid, authorization: cloneJson(data), events: mapAuthorizationEvents(authorizationSource, context, { now: new Date(now()).toISOString() }) };
    });
    const resultObject = await cached.promise;
    return { ...cloneJson(resultObject), idempotent: cached.reused };
  }

  async function status(input = {}) {
    const uid = requireValue(pick(input, "uid", "robotId", "robot_id"), "uid");
    const context = canonicalContext(input);
    const payload = withoutUndefined({ ...input });
    delete payload.authorizationToken;
    delete payload.accessToken;
    delete payload.token;
    const eventKey = nonEmpty(input.requestId || input.request_id || input.idempotencyKey) || `${now()}-${++operationSequence}`;
    payload.eventKey = eventKey;
    const key = `status:${uid}:${eventKey}`;
    const fingerprint = stableFingerprint({ uid, payload });
    const cached = cacheOperation(operationResults, key, fingerprint, async () => {
      const data = await request("POST", endpoint.status, payload, {
        idempotencyKey: input.idempotencyKey || eventKey,
        allowEmpty: false,
        authorization: await resolveAuthorization(input)
      });
      const statusSource = isRecord(data) ? { ...data, eventKey } : { status: data, eventKey };
      return { accepted: true, uid, status: cloneJson(data), events: mapAuthorizationEvents(statusSource, context, { status: true, now: new Date(now()).toISOString() }) };
    });
    const resultObject = await cached.promise;
    return { ...cloneJson(resultObject), idempotent: cached.reused };
  }

  async function submit(input = {}) {
    const uid = requireValue(pick(input, "uid", "robotId", "robot_id"), "uid");
    const submitPath = nonEmpty(endpoint.submit);
    if (!submitPath) {
      throw new ClueHunterConnectorError("ClueHunter submit contract is not configured", "SUBMIT_NOT_CONFIGURED", {
        required: "BYERING_CLUEHUNTER_SUBMIT_PATH"
      });
    }
    const context = canonicalContext(input);
    const idempotencyKey = requireValue(input.idempotencyKey, "idempotencyKey", "IDEMPOTENCY_KEY_REQUIRED");
    const actionType = input.actionType == null && input.action_type == null
      ? null
      : normalizeActionType(input.actionType ?? input.action_type);
    const action = nonEmpty(input.action);
    if (actionType == null && !action) {
      throw new ClueHunterConnectorError("submit requires actionType or action", "SUBMIT_ACTION_REQUIRED");
    }
    const key = `submit:${uid}:${idempotencyKey}`;
    const fingerprint = stableFingerprint(redactSensitive({ ...input, uid, actionType, action }));
    const cached = cacheOperation(operationResults, key, fingerprint, async () => {
      const legacySubmit = isLegacySubmitPath(submitPath);
      const payload = legacySubmit
        ? normalizedLegacySubmitPayload({ ...input, uid, actionType, action, idempotencyKey: key }, { actionType, idempotencyKey: key })
        : withoutUndefined({ ...input, uid, actionType, action, idempotencyKey: key });
      delete payload.authorizationToken;
      delete payload.accessToken;
      delete payload.token;
      const data = await request("POST", submitPath, payload, {
        idempotencyKey: key,
        allowEmpty: false,
        legacySubmit,
        authorization: await resolveAuthorization(input)
      });
      const accepted = assertSubmitAccepted(data);
      const event = createEventEnvelope({
        ...context,
        eventId: `cluehunter:submit:${idempotencyKey}`,
        occurredAt: new Date(now()).toISOString(),
        type: "task.execution.accepted",
        payload: withoutUndefined({
          source: "cluehunter",
          accepted: true,
          ...accepted,
          actionType,
          action,
          leadId: pick(payload, "leadId", "lead_id", "operatedUserId", "operated_user_id"),
          channel: pick(payload, "channel"),
          legacy: redactSensitive(data)
        })
      });
      return {
        accepted: true,
        uid,
        commandId: accepted.commandId,
        queue: accepted.queue,
        status: accepted.status,
        submission: cloneJson(data),
        events: [event],
        idempotent: false
      };
    });
    const resultObject = await cached.promise;
    return { ...cloneJson(resultObject), idempotent: cached.reused };
  }

  return Object.freeze({ lease, ack, authorize, status, submit });
}

export const CLUEHUNTER_ACTIONS = ACTIONS;
export const CLUEHUNTER_PATHS = DEFAULT_PATHS;
