#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";

const DEFAULT_BASE_URL = "https://dvana-cn.byering.com";

export class ClueHunterBootstrapError extends Error {
  constructor(message, code = "CLUEHUNTER_BOOTSTRAP_FAILED", details = {}) {
    super(message);
    this.name = "ClueHunterBootstrapError";
    this.code = code;
    this.details = details;
  }
}

function text(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function positiveInteger(value, field) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new ClueHunterBootstrapError(`${field} is missing or invalid`, "CLUEHUNTER_ID_MISSING", { field });
  }
  return parsed;
}

function decodeJwtPayload(token) {
  const parts = String(token).split(".");
  if (parts.length !== 3) return {};
  try {
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(Buffer.from(normalized, "base64url").toString("utf8"));
  } catch {
    return {};
  }
}

function unwrap(body) {
  if (!body || body.success === false || body.code === false || body.code === "99901") {
    throw new ClueHunterBootstrapError(
      body?.msg || body?.message || "ClueHunter rejected the current login",
      "CLUEHUNTER_AUTH_INVALID"
    );
  }
  return body.data ?? body.entity ?? body.result ?? body;
}

export function identityFromCurrentUser({ token, response }) {
  const claims = decodeJwtPayload(token);
  const current = unwrap(response);
  const tenant = positiveInteger(
    current?.tenant ?? current?.tenantId ?? current?.tenant_id ?? claims.tenant ?? claims.tenantId,
    "tenantId"
  );
  const uid = positiveInteger(
    claims.sub ?? claims.uid ?? claims.userId ?? claims.user_id
      ?? current?.uid ?? current?.userId ?? current?.shopUid ?? current?.shop_uid,
    "uid"
  );
  return { tenantId: tenant, uid };
}

async function requestIdentity({ baseUrl, token, fetchImpl = globalThis.fetch }) {
  if (typeof fetchImpl !== "function") throw new ClueHunterBootstrapError("fetch is unavailable", "CLUEHUNTER_FETCH_UNAVAILABLE");
  const response = await fetchImpl(new URL("/api/auth/currentUserInfo", baseUrl), {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: "{}"
  });
  let body = null;
  try { body = await response.json(); } catch {
    throw new ClueHunterBootstrapError("ClueHunter returned invalid JSON", "CLUEHUNTER_RESPONSE_INVALID");
  }
  if (!response.ok) {
    throw new ClueHunterBootstrapError(`ClueHunter identity request failed (${response.status})`, "CLUEHUNTER_IDENTITY_REQUEST_FAILED");
  }
  return identityFromCurrentUser({ token, response: body });
}

function tokenFromLoginResponse(body) {
  const payload = unwrap(body);
  const token = payload?.token ?? payload?.accessToken ?? payload?.access_token;
  if (!text(token)) {
    throw new ClueHunterBootstrapError("ClueHunter login did not return a bearer token", "CLUEHUNTER_TOKEN_NOT_RETURNED");
  }
  return text(token);
}

export async function loginClueHunter({
  account,
  password,
  baseUrl = DEFAULT_BASE_URL,
  fetchImpl = globalThis.fetch
} = {}) {
  const username = text(account);
  const secret = text(password);
  if (!username || !secret) {
    throw new ClueHunterBootstrapError("ClueHunter account and password are required", "CLUEHUNTER_CREDENTIALS_REQUIRED");
  }
  const response = await fetchImpl(new URL("/api/auth/accountPassword/login", text(baseUrl) || DEFAULT_BASE_URL), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ account: username, password: secret })
  });
  let body = null;
  try { body = await response.json(); } catch {
    throw new ClueHunterBootstrapError("ClueHunter login returned invalid JSON", "CLUEHUNTER_RESPONSE_INVALID");
  }
  if (!response.ok) {
    throw new ClueHunterBootstrapError(`ClueHunter login failed (${response.status})`, "CLUEHUNTER_LOGIN_FAILED");
  }
  return tokenFromLoginResponse(body);
}

export async function bootstrapFromAccountPassword(options = {}) {
  const token = await loginClueHunter(options);
  return bootstrapClueHunter({ ...options, token });
}

function upsertEnv(content, values) {
  const lines = String(content || "").split(/\r?\n/);
  for (const [key, value] of Object.entries(values)) {
    const index = lines.findIndex((line) => line.startsWith(`${key}=`));
    const line = `${key}=${value}`;
    if (index >= 0) lines[index] = line;
    else lines.push(line);
  }
  return `${lines.filter((line, index, all) => index < all.length - 1 || line).join("\n").replace(/\n+$/, "")}\n`;
}

export async function bootstrapClueHunter({
  token,
  baseUrl = DEFAULT_BASE_URL,
  envPath = ".env.local",
  fetchImpl = globalThis.fetch,
  persist = true
} = {}) {
  const authToken = text(token);
  if (!authToken) throw new ClueHunterBootstrapError("A ClueHunter bearer token is required", "CLUEHUNTER_TOKEN_REQUIRED");
  const identity = await requestIdentity({ baseUrl: text(baseUrl) || DEFAULT_BASE_URL, token: authToken, fetchImpl });
  const values = {
    BYERING_CLOUD_DESKTOP_MODE: "cluehunter",
    BYERING_CLUEHUNTER_BASE_URL: text(baseUrl) || DEFAULT_BASE_URL,
    BYERING_CLUEHUNTER_AUTH_TOKEN: authToken,
    BYERING_CLUEHUNTER_TENANT_ID: String(identity.tenantId),
    BYERING_CLUEHUNTER_UID: String(identity.uid),
    BYERING_CLUEHUNTER_REGION_ID: "cn-beijing",
    BYERING_CLUEHUNTER_CLOUD_APPLY_PATH: "/api/cloud/desktop/apply",
    BYERING_CLUEHUNTER_CLOUD_STATUS_PATH: "/api/cloud/desktop/applyStatus",
    BYERING_CLUEHUNTER_RPA_START_JOB_PATH: "/self/rpa/startJob",
    BYERING_CLUEHUNTER_RPA_START_JOB_METHOD: "GET"
  };
  if (persist) {
    let existing = "";
    try { existing = await readFile(envPath, "utf8"); } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await writeFile(envPath, upsertEnv(existing, values), { mode: 0o600 });
  }
  return { identity, values, envPath: persist ? envPath : null };
}

async function main() {
  const token = text(process.env.CLUEHUNTER_BOOTSTRAP_TOKEN || process.env.BYERING_CLUEHUNTER_AUTH_TOKEN);
  const result = token
    ? await bootstrapClueHunter({ token })
    : await bootstrapFromAccountPassword({
      account: process.env.CLUEHUNTER_ACCOUNT,
      password: process.env.CLUEHUNTER_PASSWORD
    });
  console.log(`ClueHunter configured for tenant ${result.identity.tenantId} and executor ${result.identity.uid}.`);
  console.log("Restart the backend, then call POST /v1/cloud-desktops/connect.");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`${error.code || "CLUEHUNTER_BOOTSTRAP_FAILED"}: ${error.message}`);
    process.exitCode = 1;
  });
}
