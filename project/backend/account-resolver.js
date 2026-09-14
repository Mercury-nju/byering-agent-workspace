import { createHash } from "node:crypto";

const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_SEARCH_RETRY_ATTEMPTS = 3;
const DEFAULT_SEARCH_RETRY_DELAY_MS = 250;
const DEFAULT_TREND_RETRY_DELAY_MS = 1_000;
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

function secIdFromProfileUrl(value) {
  const source = nonEmpty(value);
  if (!source) return null;
  try {
    const pathname = new URL(source).pathname;
    const match = pathname.match(/\/user\/([^/?#]+)/i);
    return match ? first(decodeURIComponent(match[1])) : null;
  } catch {
    const match = source.match(/\/user\/([^/?#]+)/i);
    return match ? first(match[1]) : null;
  }
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
      details: {
        upstreamStatus: response.status || null,
        upstreamCode: Number.isFinite(code) ? code : null,
        upstreamMessage: first(payload?.message, payload?.msg, payload?.error?.message)
      }
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
        resolved?.user_id,
        resolved?.user?.sec_uid,
        resolved?.user?.sec_user_id,
        resolved?.user?.user_id,
        // TikHub may return get_sec_user_id.data as a plain sec_id string.
        resolved,
        secIdFromProfileUrl(reference.profileUrl)
      );
      const uniqueId = first(resolved?.unique_id, resolved?.uniqueId, resolved?.user?.unique_id);
      if (uniqueId) {
        const profile = await request(tikhubUrl(baseUrl, "/api/v1/douyin/web/handler_user_profile_v2", {
          unique_id: uniqueId
        }));
        const profileCandidate = selectedCandidate(profile, {}) || {};
        const profileReference = normalizeAccountReference(profileCandidate);
        return {
          account: {
            ...profileCandidate,
            sec_id: first(profileReference.secId, secId),
            unique_id: first(profileReference.uniqueId, uniqueId),
            profile_url: first(profileReference.profileUrl, reference.profileUrl)
          },
          source: "tikhub"
        };
      }
      if (secId) {
        try {
          const profile = await request(tikhubUrl(baseUrl, "/api/v1/douyin/web/handler_user_profile", {
            sec_user_id: secId
          }));
          const profileCandidate = selectedCandidate(profile, {}) || {};
          const profileReference = normalizeAccountReference(profileCandidate);
          if (Object.keys(profileCandidate).length) {
            return {
              account: {
                ...profileCandidate,
                sec_id: first(profileReference.secId, secId),
                profile_url: first(profileReference.profileUrl, reference.profileUrl)
              },
              source: "tikhub"
            };
          }
        } catch {
          // Keep the URL-derived sec_id usable when profile enrichment is unavailable.
        }
      }
      return { account: { sec_id: secId, profile_url: reference.profileUrl }, source: "tikhub" };
    }

    if (reference.accountName) {
      const payload = await request(tikhubUrl(baseUrl, "/api/v1/douyin/search/fetch_user_search_v2"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ keyword: reference.accountName, cursor: Number(reference.cursor) || 0 })
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
    source.nick_name,
    account.accountName,
    account.account_name,
    account.nickname,
    account.nick_name,
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
    account.sec_user_id,
    // TikHub's user search endpoint calls Douyin's public sec_id `user_id`.
    // Keep explicit sec_* fields authoritative, then use this provider alias
    // so the resolved identity can be sent to SpiderApi as sec_id.
    source.user_id,
    account.user_id,
    // A public Douyin profile URL embeds the sec_id in its /user/ path.
    // Use it only as a fallback when the resolver omits the identity field.
    secIdFromProfileUrl(profileUrl)
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
  const avatarUrl = resolvedAvatarUrl(input);
  return {
    uid: collectionUid,
    ...(platformUid ? { douyinUid: platformUid } : {}),
    secId: reference.secId,
    uniqueId: reference.uniqueId,
    nickname: reference.accountName,
    profileUrl: reference.profileUrl,
    ...(avatarUrl ? { avatarUrl } : {}),
    source,
    ...(platformUid ? {} : { uidSource: "derived_from_sec_id" }),
    ...(confidence == null ? {} : { confidence })
  };
}

function resolvedAvatarUrl(value, visited = new WeakSet()) {
  if (typeof value === "string") {
    const source = value.trim();
    return /^(https?:\/\/|\/\/|\/|data:image\/)/i.test(source)
      && !/\.hei[cf](?:$|[?#])/i.test(source)
      ? source
      : "";
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const source = resolvedAvatarUrl(item, visited);
      if (source) return source;
    }
    return "";
  }
  if (!isRecord(value) || visited.has(value)) return "";
  visited.add(value);
  for (const candidate of [
    value.avatarUrl,
    value.avatar_url,
    value.avatar,
    value.avatarThumb,
    value.avatar_thumb,
    value.avatarMedium,
    value.avatar_medium,
    value.avatarLarger,
    value.avatar_larger,
    value.urlList,
    value.url_list,
    value.urls,
    value.url,
    value.user,
    value.user_info,
    value.userInfo,
    value.account,
    value.profile,
    value.identity
  ]) {
    const source = resolvedAvatarUrl(candidate, visited);
    if (source) return source;
  }
  return "";
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
    const selected = candidates.find((candidate) => first(candidate.id, candidate.candidateId, candidate.uid, candidate.user_id, candidate.sec_id, candidate.sec_uid, candidate.sec_user_id) === selection);
    if (selected) return selected;
  }
  if (candidates.length > 1) {
    throw new AccountResolverError("账号解析得到多个候选，请选择正确账号", {
      code: "ACCOUNT_RESOLUTION_AMBIGUOUS",
      statusCode: 409,
      details: {
        candidates: candidates.slice(0, 20).map((candidate) => ({
          id: first(candidate.id, candidate.candidateId, candidate.uid, candidate.user_id, candidate.sec_id, candidate.sec_uid, candidate.sec_user_id),
          uid: first(candidate.uid, candidate.user_id),
          secId: first(candidate.sec_id, candidate.sec_uid, candidate.sec_user_id, candidate.user_id),
          uniqueId: first(candidate.unique_id, candidate.uniqueId, candidate.uniqueId),
          nickname: first(candidate.nickname, candidate.nick_name, candidate.name)
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
  const candidateWithFallback = isRecord(candidate) && reference.secId && !normalizeAccountReference(candidate).secId
    ? { ...candidate, sec_id: reference.secId }
    : candidate;
  return normalizeResolvedAccount(candidateWithFallback, {
    source: first(isRecord(value) ? value.source : null, isRecord(source) ? source.source : null, "resolver"),
    confidence
  });
}

function normalizeSearchCandidate(value) {
  if (!isRecord(value)) return null;
  const reference = normalizeAccountReference(value);
  if (!reference.secId) return null;
  return {
    ...value,
    sec_uid: reference.secId,
    sec_id: reference.secId,
    uid: reference.uid,
    unique_id: reference.uniqueId,
    nickname: reference.accountName,
    profile_url: reference.profileUrl,
    follower_count: value.follower_count ?? value.followerCount ?? value.fans_cnt ?? null,
    aweme_count: value.aweme_count ?? value.awemeCount ?? value.publish_cnt ?? null,
    total_favorited: value.total_favorited ?? value.totalFavorited ?? value.like_cnt ?? null,
    avatar_url: value.avatar_url ?? value.avatarUrl ?? null
  };
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

function retryableSearchError(error) {
  if (!(error instanceof AccountResolverError)) return true;
  if (["ACCOUNT_RESOLVER_TIMEOUT", "ACCOUNT_RESOLVER_UNAVAILABLE"].includes(error.code)) return true;
  if (error.code !== "ACCOUNT_RESOLVER_UPSTREAM_REJECTED") return false;
  const status = Number(error.details?.upstreamStatus);
  const upstreamCode = Number(error.details?.upstreamCode);
  return status === 429 || status >= 500 || [429, 1003].includes(upstreamCode) || upstreamCode >= 500;
}

function retryDelay(error, fallbackMs) {
  const message = nonEmpty(error?.details?.upstreamMessage) || "";
  const match = message.match(/retry\s+after\s+(\d+(?:\.\d+)?)\s*(ms|s|sec|seconds?)?/i);
  if (!match) return Math.max(0, fallbackMs);
  const amount = Number(match[1]);
  return Math.max(0, Math.round(amount * (match[2]?.toLowerCase() === "ms" ? 1 : 1000)));
}

function wait(ms) {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

export function createAccountResolver({
  provider = null,
  endpoint = null,
  apiKey = null,
  env = process.env,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  searchRetryAttempts = DEFAULT_SEARCH_RETRY_ATTEMPTS,
  searchRetryDelayMs = DEFAULT_SEARCH_RETRY_DELAY_MS,
  trendRetryDelayMs = DEFAULT_TREND_RETRY_DELAY_MS
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

  async function search(rawInput = {}) {
    const source = isRecord(rawInput) ? rawInput : {};
    const query = first(source.query, source.goal, source.keyword, source.accountName, source.account_name);
    if (!query) throw new AccountResolverError("请描述想找的抖音账号", {
      code: "ACCOUNT_SEARCH_QUERY_REQUIRED",
      statusCode: 400
    });
    if (!providerFunction) throw new AccountResolverError("账号搜索能力尚未配置", {
      code: "ACCOUNT_SEARCH_NOT_CONFIGURED",
      statusCode: 503,
      details: { required: ["BYERING_PROSPECT_ACCOUNT_RESOLVER_PROVIDER", "BYERING_PROSPECT_TIKHUB_API_KEY"] }
    });
    let payload;
    const attempts = Math.min(5, Math.max(1, Number(searchRetryAttempts) || DEFAULT_SEARCH_RETRY_ATTEMPTS));
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        payload = await providerFunction({ accountName: query, query, cursor: Number(source.cursor) || 0 });
        break;
      } catch (error) {
        if (attempt < attempts && retryableSearchError(error)) {
          await wait(retryDelay(error, Math.max(0, Number(searchRetryDelayMs) || 0) * attempt));
          continue;
        }
        if (error instanceof AccountResolverError) throw error;
        throw new AccountResolverError("账号搜索服务调用失败", {
          code: error.code || "ACCOUNT_SEARCH_FAILED",
          statusCode: Number.isInteger(error.statusCode) ? error.statusCode : 502,
          details: errorDetails(error.details)
        });
      }
    }
    const result = unwrap(payload);
    const limit = Math.min(50, Math.max(1, Number(source.limit) || 20));
    const candidates = candidateList(payload)
      .map(normalizeSearchCandidate)
      .filter(Boolean)
      .slice(0, limit);
    return {
      source: first(isRecord(payload) ? payload.source : null, "resolver"),
      query,
      candidates,
      cursor: isRecord(result) ? result.cursor ?? null : null,
      hasMore: Boolean(isRecord(result) && (result.has_more ?? result.hasMore)),
      total: candidates.length
    };
  }

  async function compareTrends({ accounts = [], days = 7 } = {}) {
    if (configuredProviderName !== "tikhub" || !configuredApiKey) {
      throw new AccountResolverError("粉丝趋势对比能力尚未配置", {
        code: "ACCOUNT_TREND_NOT_CONFIGURED",
        statusCode: 503,
        details: { required: ["BYERING_PROSPECT_ACCOUNT_RESOLVER_PROVIDER", "BYERING_PROSPECT_TIKHUB_API_KEY"] }
      });
    }
    const normalizedDays = Number(days) === 30 ? 30 : 7;
    const normalizedAccounts = (Array.isArray(accounts) ? accounts : [])
      .map((account) => ({
        uid: first(account?.uid, account?.douyinUid, account?.user_id),
        secId: first(account?.secId, account?.sec_id, account?.secUid, account?.sec_uid),
        name: first(account?.name, account?.nickname)
      }))
      .filter((account) => account.uid)
      .slice(0, 50);
    const trends = [];
    const headers = { accept: "application/json", authorization: `Bearer ${configuredApiKey}` };
    for (let offset = 0; offset < normalizedAccounts.length; offset += 5) {
      const batch = normalizedAccounts.slice(offset, offset + 5);
      const url = tikhubUrl(env?.BYERING_PROSPECT_TIKHUB_BASE_URL || DEFAULT_TIKHUB_BASE_URL, "/api/v1/douyin/index/fetch_daren_compare_users_stable", {
        user_list: batch.map((account) => account.uid).join(","),
        days: normalizedDays
      });
      let payload = null;
      const attempts = Math.min(5, Math.max(1, Number(searchRetryAttempts) || DEFAULT_SEARCH_RETRY_ATTEMPTS));
      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
          const response = await fetchWithTimeout(fetchImpl, url, { method: "POST", headers }, timeoutMs);
          payload = await readJsonResponse(response);
          break;
        } catch (error) {
          if (attempt >= attempts || !retryableSearchError(error)) throw error;
          await wait(retryDelay(error, Math.max(0, Number(trendRetryDelayMs) || 0) * attempt));
        }
      }
      const source = unwrap(payload);
      const rows = Array.isArray(source?.userlist_resp) ? source.userlist_resp : [];
      for (const row of rows) {
        const secId = secIdFromProfileUrl(row?.aweme_url);
        const matchedAccount = batch.find((account) => account.secId === secId)
          || batch.find((account) => account.uid === first(row?.uid, row?.user_id))
          || batch.find((account) => account.name && account.name === first(row?.user_name, row?.nickname));
        if (!matchedAccount) continue;
        trends.push({
          uid: matchedAccount.uid,
          secId: matchedAccount.secId || secId,
          name: first(row?.user_name, row?.nickname, matchedAccount.name),
          windowDays: normalizedDays,
          newFollowers: Number.isFinite(Number(row?.new_fans_count)) ? Number(row.new_fans_count) : null,
          currentFollowers: Number.isFinite(Number(row?.fans_count)) ? Number(row.fans_count) : null,
          newLikes: Number.isFinite(Number(row?.new_like_count)) ? Number(row.new_like_count) : null,
          newItems: Number.isFinite(Number(row?.new_item_count)) ? Number(row.new_item_count) : null,
          source: "tikhub-daren-compare"
        });
      }
    }
    return { source: "tikhub-daren-compare", windowDays: normalizedDays, trends };
  }

  return Object.freeze({
    configured: Boolean(providerFunction || configuredEndpoint),
    resolve,
    search: providerFunction ? search : null,
    compareTrends: configuredProviderName === "tikhub" && configuredApiKey ? compareTrends : null,
    endpoint: configuredEndpoint,
    provider: configuredProviderName
  });
}

export { DEFAULT_TIMEOUT_MS };
