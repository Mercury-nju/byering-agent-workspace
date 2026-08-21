import { createHash } from "node:crypto";

const DEFAULT_TIMEOUT_MS = 12_000;
const RESOLVER_URL_ENV_KEYS = Object.freeze([
  "BYERING_PROSPECT_ACCOUNT_RESOLVER_URL",
  "BYERING_ACCOUNT_RESOLVER_URL"
]);
const RESOLVER_PROVIDER_ENV_KEY = "BYERING_PROSPECT_ACCOUNT_RESOLVER_PROVIDER";
const TIKHUB_API_KEY_ENV_KEYS = Object.freeze([
  "BYERING_PROSPECT_TIKHUB_API_KEY",
  "BYERING_TIKHUB_API_KEY",
  "BYERING_PROSPECT_ACCOUNT_RESOLVER_API_KEY"
]);
const DEFAULT_TIKHUB_BASE_URL = "https://api.tikhub.io";

export class AccountResolverError extends Error {
  constructor(message, { code = "ACCOUNT_RESOLVER_ERROR", statusCode = 400, details = {} } = {}) {
    super(message);
    this.name = "AccountResolverError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details && typeof details === "object" ? details : {};
  }
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function nonEmpty(value) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function first(...values) {
  for (const value of values) {
    const normalized = nonEmpty(value);
    if (normalized) return normalized;
  }
  return null;
}

function derivedCollectionUid(secId) {
  return `public-${createHash("sha256").update(String(secId)).digest("hex").slice(0, 24)}`;
}

function errorDetails(error) {
  if (!isRecord(error)) return {};
  return Object.fromEntries(Object.entries(error)
    .filter(([key]) => !/(token|secret|password|cookie|authorization|body)/i.test(key)));
}

function resolverUrl(env = process.env) {
  for (const key of RESOLVER_URL_ENV_KEYS) {
    const value = nonEmpty(env?.[key]);
    if (value) return value;
  }
  return null;
}

function providerName(env = process.env) {
  return nonEmpty(env?.[RESOLVER_PROVIDER_ENV_KEY])?.toLowerCase() || null;
}

function tikhubApiKey(env = process.env, explicit = null) {
  if (nonEmpty(explicit)) return nonEmpty(explicit);
  for (const key of TIKHUB_API_KEY_ENV_KEYS) {
    const value = nonEmpty(env?.[key]);
    if (value) return value;
  }
  return null;
}

function tikhubUrl(baseUrl, pathname, params = {}) {
  const url = new URL(pathname, `${String(baseUrl || DEFAULT_TIKHUB_BASE_URL).replace(/\/$/, "")}/`);
  for (const [key, value] of Object.entries(params)) {
    if (value != null && String(value).trim()) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function readJsonResponse(response) {
  let payload = null;
  try { payload = await response.json(); } catch {
    throw new AccountResolverError("账号解析服务返回了无效响应", {
      code: "ACCOUNT_RESOLVER_RESPONSE_INVALID",
      statusCode: 502
    });
  }
  const code = isRecord(payload) ? Number(payload.code) : null;
  if (!response.ok || (Number.isFinite(code) && ![0, 200].includes(code))) {
    throw new AccountResolverError("账号解析服务拒绝了请求", {
      code: "ACCOUNT_RESOLVER_UPSTREAM_REJECTED",
      statusCode: 502,
      details: { upstreamStatus: response.status || null }
    });
  }
  return payload;
}

function createTikHubProvider({
  apiKey,
  baseUrl = DEFAULT_TIKHUB_BASE_URL,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
  if (!nonEmpty(apiKey)) return null;
  if (typeof fetchImpl !== "function") {
    throw new AccountResolverError("TikHub 账号解析缺少 HTTP 客户端", {
      code: "ACCOUNT_RESOLVER_CONFIG_INVALID",
      statusCode: 503
    });
  }
  return async function resolveWithTikHub(reference) {
    const headers = {
      accept: "application/json",
      authorization: `Bearer ${apiKey}`
    };
    const request = async (url, options = {}) => {
      const response = await fetchWithTimeout(fetchImpl, url, {
        ...options,
        headers: { ...headers, ...(options.headers || {}) }
      }, timeoutMs);
      return readJsonResponse(response);
    };

    if (reference.uniqueId) {
      const payload = await request(tikhubUrl(baseUrl, "/api/v1/douyin/web/handler_user_profile_v2", {
        unique_id: reference.uniqueId
      }));
      return { ...payload, source: "tikhub" };
    }

    if (reference.profileUrl) {
      const payload = await request(tikhubUrl(baseUrl, "/api/v1/douyin/web/get_sec_user_id", {
        url: reference.profileUrl
      }));
      const resolved = unwrap(payload);
      const secId = first(
        resolved?.sec_id,
        resolved?.sec_uid,
        resolved?.sec_user_id,
        resolved?.secUserId,
        resolved?.user?.sec_uid
      );
      const uniqueId = first(resolved?.unique_id, resolved?.uniqueId, resolved?.user?.unique_id);
      if (uniqueId) {
        const profile = await request(tikhubUrl(baseUrl, "/api/v1/douyin/web/handler_user_profile_v2", {
          unique_id: uniqueId
        }));
        return { ...profile, source: "tikhub" };
      }
      return { account: { sec_id: secId, profile_url: reference.profileUrl }, source: "tikhub" };
    }

    if (reference.accountName) {
      const payload = await request(tikhubUrl(baseUrl, "/api/v1/douyin/search/fetch_user_search_v2"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ keyword: reference.accountName, cursor: 0 })
      });
      return { ...payload, source: "tikhub" };
    }

    throw new AccountResolverError("请提供抖音号、账号名称或主页地址", {
      code: "ACCOUNT_REFERENCE_REQUIRED",
      statusCode: 400
    });
  };
}

function withPath(baseUrl) {
  const value = String(baseUrl || "").trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!url.pathname || url.pathname === "/") url.pathname = "/v1/resolve-account";
    return url.toString();
  } catch {
    throw new AccountResolverError("账号解析服务地址无效", {
      code: "ACCOUNT_RESOLVER_CONFIG_INVALID",
      statusCode: 503,
      details: { field: "BYERING_PROSPECT_ACCOUNT_RESOLVER_URL" }
    });
  }
}

export function normalizeAccountReference(input = {}) {
  const source = isRecord(input) ? input : {};
  const account = isRecord(source.account) ? source.account : {};
  const accountName = first(
    source.accountName,
    source.account_name,
    source.nickname,
    account.accountName,
    account.account_name,
    account.nickname,
    account.name
  );
  const uniqueId = first(
    source.uniqueId,
    source.unique_id,
    source.douyinId,
    source.douyin_id,
    source.uniqueId,
    source.handle,
    account.uniqueId,
    account.unique_id,
    account.douyinId,
    account.douyin_id,
    account.handle
  );
  const profileUrl = first(
    source.profileUrl,
    source.profile_url,
    source.homepageUrl,
    source.homepage_url,
    account.profileUrl,
    account.profile_url,
    account.homepageUrl,
    account.homepage_url
  );
  const uid = first(source.uid, source.userId, source.user_id, source.platformUid, source.platform_uid,
    account.uid, account.userId, account.user_id, account.platformUid, account.platform_uid);
  const secId = first(
    source.secId,
    source.sec_id,
    source.secUid,
    source.sec_uid,
    source.secUserId,
    source.sec_user_id,
    account.secId,
    account.sec_id,
    account.secUid,
    account.sec_uid,
    account.secUserId,
    account.sec_user_id
  );
  const selectedCandidateId = first(
    source.selectedCandidateId,
    source.selected_candidate_id,
    source.candidateId,
    source.candidate_id,
    account.selectedCandidateId,
    account.selected_candidate_id,
    account.candidateId,
    account.candidate_id
  );
  const query = first(source.query, source.search, uniqueId, accountName, profileUrl);
  return { accountName, uniqueId, profileUrl, uid, secId, selectedCandidateId, query };
}

export function normalizeResolvedAccount(value, { source = "resolver", confidence = null } = {}) {
  const input = isRecord(value) && isRecord(value.account) ? value.account : value;
  const reference = normalizeAccountReference(input);
  if (!reference.secId) {
    throw new AccountResolverError("账号解析结果缺少 sec_id", {
      code: "ACCOUNT_IDENTITY_INCOMPLETE",
      statusCode: 502,
      details: { required: ["secId"] }
    });
  }
  const platformUid = reference.uid;
  const collectionUid = platformUid || derivedCollectionUid(reference.secId);
  return {
    uid: collectionUid,
    ...(platformUid ? { douyinUid: platformUid } : {}),
    secId: reference.secId,
    uniqueId: reference.uniqueId,
    nickname: reference.accountName,
    profileUrl: reference.profileUrl,
    source,
    ...(platformUid ? {} : { uidSource: "derived_from_sec_id" }),
    ...(confidence == null ? {} : { confidence })
  };
}

function unwrap(value) {
  if (!isRecord(value)) return value;
  if (isRecord(value.data)) return unwrap(value.data);
  if (isRecord(value.result)) return unwrap(value.result);
  return value;
}

function candidateList(value) {
  const source = unwrap(value);
  if (!isRecord(source)) return [];
  if (Array.isArray(source.candidates)) return source.candidates;
  for (const key of ["user_list", "userList", "users", "items"]) {
    if (Array.isArray(source[key])) {
      return source[key].map((candidate) => {
        if (!isRecord(candidate)) return candidate;
        const user = isRecord(candidate.user_info)
          ? candidate.user_info
          : isRecord(candidate.userInfo)
            ? candidate.userInfo
            : null;
        return user ? { ...candidate, ...user } : candidate;
      });
    }
  }
  for (const key of ["user", "user_info", "userInfo"]) {
    if (isRecord(source[key])) return [source[key]];
  }
  if (isRecord(source.account)) return [source.account];
  if (isRecord(source.identity)) return [source.identity];
  if (source.uid || source.user_id || source.sec_id || source.sec_uid || source.sec_user_id) return [source];
  return [];
}

function selectedCandidate(value, reference) {
  const source = unwrap(value);
  const candidates = candidateList(value);
  const selection = first(
    reference.selectedCandidateId,
    reference.candidateId,
    isRecord(source) ? source.selectedCandidateId : null,
    isRecord(source) ? source.selected_candidate_id : null
  );
  if (selection) {
    const selected = candidates.find((candidate) => first(candidate.id, candidate.candidateId, candidate.uid, candidate.sec_id, candidate.sec_uid, candidate.sec_user_id) === selection);
    if (selected) return selected;
  }
  if (candidates.length > 1) {
    throw new AccountResolverError("账号解析得到多个候选，请选择正确账号", {
      code: "ACCOUNT_RESOLUTION_AMBIGUOUS",
      statusCode: 409,
      details: {
        candidates: candidates.slice(0, 20).map((candidate) => ({
          id: first(candidate.id, candidate.candidateId, candidate.uid, candidate.sec_id, candidate.sec_uid, candidate.sec_user_id),
          uid: first(candidate.uid, candidate.user_id),
          secId: first(candidate.sec_id, candidate.sec_uid, candidate.sec_user_id),
          uniqueId: first(candidate.unique_id, candidate.uniqueId),
          nickname: first(candidate.nickname, candidate.name)
        }))
      }
    });
  }
  return candidates[0] || null;
}

function normalizeProviderResult(value, reference = {}) {
  const source = unwrap(value);
  const candidate = selectedCandidate(value, {
    ...reference,
    ...(isRecord(source) ? source : {})
  });
  if (!candidate) throw new AccountResolverError("账号解析服务未返回有效账号", {
    code: "ACCOUNT_IDENTITY_NOT_FOUND",
    statusCode: 404
  });
  const confidence = isRecord(source) ? source.confidence : null;
  return normalizeResolvedAccount(candidate, {
    source: first(isRecord(value) ? value.source : null, isRecord(source) ? source.source : null, "resolver"),
    confidence
  });
}

async function fetchWithTimeout(fetchImpl, url, options, timeoutMs) {
  const controller = new AbortController();
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new AccountResolverError("账号解析服务超时", {
        code: "ACCOUNT_RESOLVER_TIMEOUT",
        statusCode: 504,
        details: { timeoutMs }
      }));
    }, timeoutMs);
  });
  try {
    return await Promise.race([fetchImpl(url, { ...options, signal: controller.signal }), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function createAccountResolver({
  provider = null,
  endpoint = null,
  apiKey = null,
  env = process.env,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
  const configuredEndpoint = withPath(endpoint || resolverUrl(env));
  const explicitProvider = typeof provider === "function"
    ? provider
    : provider && typeof provider.resolve === "function"
      ? provider.resolve.bind(provider)
      : null;
  const configuredProviderName = typeof provider === "string" ? provider.toLowerCase() : providerName(env);
  const configuredApiKey = tikhubApiKey(env, apiKey);
  const providerFunction = explicitProvider || (configuredProviderName === "tikhub"
    ? createTikHubProvider({
      apiKey: configuredApiKey,
      baseUrl: env?.BYERING_PROSPECT_TIKHUB_BASE_URL || DEFAULT_TIKHUB_BASE_URL,
      fetchImpl,
      timeoutMs
    })
    : null);

  async function resolve(rawInput = {}) {
    const reference = normalizeAccountReference(rawInput);
    if (reference.uid && reference.secId) {
      return normalizeResolvedAccount(reference, { source: "provided" });
    }
    if (!reference.query) throw new AccountResolverError("请提供抖音号、账号名称或主页地址", {
      code: "ACCOUNT_REFERENCE_REQUIRED",
      statusCode: 400,
      details: { required: ["uniqueId", "accountName", "profileUrl"] }
    });
    if (!providerFunction && !configuredEndpoint) throw new AccountResolverError("账号解析能力尚未配置", {
      code: "ACCOUNT_RESOLVER_NOT_CONFIGURED",
      statusCode: 503,
      details: {
        required: configuredProviderName === "tikhub"
          ? ["BYERING_PROSPECT_TIKHUB_API_KEY"]
          : ["BYERING_PROSPECT_ACCOUNT_RESOLVER_URL"]
      }
    });
    if (providerFunction) {
      try {
        return normalizeProviderResult(await providerFunction(reference), reference);
      } catch (error) {
        if (error instanceof AccountResolverError) throw error;
        throw new AccountResolverError("账号解析服务调用失败", {
          code: error.code || "ACCOUNT_RESOLVER_FAILED",
          statusCode: Number.isInteger(error.statusCode) ? error.statusCode : 502,
          details: errorDetails(error.details)
        });
      }
    }
    if (typeof fetchImpl !== "function") throw new AccountResolverError("账号解析服务缺少 HTTP 客户端", {
      code: "ACCOUNT_RESOLVER_CONFIG_INVALID",
      statusCode: 503
    });
    const headers = { "content-type": "application/json" };
    const token = nonEmpty(apiKey || env?.BYERING_PROSPECT_ACCOUNT_RESOLVER_API_KEY);
    if (token) headers.authorization = `Bearer ${token}`;
    let response;
    try {
      response = await fetchWithTimeout(fetchImpl, configuredEndpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({ platform: "douyin", ...reference })
      }, timeoutMs);
    } catch (error) {
      if (error instanceof AccountResolverError) throw error;
      throw new AccountResolverError("账号解析服务不可用", {
        code: error.code || "ACCOUNT_RESOLVER_FAILED",
        statusCode: 502,
        details: errorDetails(error.details)
      });
    }
    let payload = null;
    try { payload = await response.json(); } catch {
      throw new AccountResolverError("账号解析服务返回了无效响应", {
        code: "ACCOUNT_RESOLVER_RESPONSE_INVALID",
        statusCode: 502
      });
    }
    if (!response.ok || (isRecord(payload) && payload.accepted === false)) {
      throw new AccountResolverError("账号解析服务拒绝了请求", {
        code: first(payload?.error?.code, payload?.code, "ACCOUNT_RESOLVER_REJECTED"),
        statusCode: response.status >= 400 ? response.status : 502,
        details: isRecord(payload?.error?.details) ? payload.error.details : {}
      });
    }
    return normalizeProviderResult(payload, reference);
  }

  return Object.freeze({
    configured: Boolean(providerFunction || configuredEndpoint),
    resolve,
    endpoint: configuredEndpoint,
    provider: configuredProviderName
  });
}

export { DEFAULT_TIMEOUT_MS };
