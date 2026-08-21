import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

export const WORKSPACE_STATES = Object.freeze({
  CREATED: "CREATED",
  AUTHORIZING: "AUTHORIZING",
  READY: "READY",
  RUNNING: "RUNNING",
  SLEEPING: "SLEEPING",
  REAUTH_REQUIRED: "REAUTH_REQUIRED",
  REVOKED: "REVOKED",
  DESTROYED: "DESTROYED"
});

const DEFAULT_LOGIN_URL = "https://www.douyin.com/login?source=byering";
const SESSION_COOKIE_NAMES = new Set([
  // CSRF cookies are issued before login and must never prove account access.
  "sessionid", "sessionid_ss", "sid_guard", "uid_tt", "uid_tt_ss", "odin_tt"
]);

export function isDouyinSessionReady({ cookieNames = [], url = "" } = {}) {
  const hasKnownSessionCookie = [...new Set(cookieNames)].some((name) => SESSION_COOKIE_NAMES.has(name));
  return hasKnownSessionCookie && !/\/login(?:[/?#]|$)/i.test(String(url));
}

export class BrowserWorkspaceError extends Error {
  constructor(message, { code = "BROWSER_WORKSPACE_ERROR", statusCode = 400, details = {} } = {}) {
    super(message);
    this.name = "BrowserWorkspaceError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

/**
 * Account-scoped browser lifecycle. The service never exposes cookies or
 * storage state; callers only receive a redacted session snapshot.
 */
export function createBrowserWorkspaceService({
  rootDir = process.env.BYERING_BROWSER_PROFILE_ROOT || join(homedir(), ".byering", "browser-workspaces"),
  sessionRegistryPath = process.env.BYERING_BROWSER_SESSION_REGISTRY || null,
  launcher = createDefaultLauncher(),
  now = () => new Date().toISOString(),
  loginUrl = process.env.BYERING_DOUYIN_LOGIN_URL || DEFAULT_LOGIN_URL
} = {}) {
  if (!launcher || typeof launcher.launchPersistent !== "function") {
    throw new TypeError("Browser workspace launcher is required");
  }
  const sessions = new Map();
  const accountSessions = new Map();
  const accountStarts = new Map();
  if (sessionRegistryPath) mkdirSync(dirname(sessionRegistryPath), { recursive: true });
  restoreRegistry();

  async function start(input = {}) {
    const accountIndex = `${input.tenantId || ""}:${input.provider || "douyin"}:${input.accountKey || ""}`;
    const previous = accountStarts.get(accountIndex) || Promise.resolve();
    let release;
    const current = new Promise((resolve) => { release = resolve; });
    accountStarts.set(accountIndex, current);
    try {
      await previous;
      return await startWorkspace(input);
    } finally {
      release();
      if (accountStarts.get(accountIndex) === current) accountStarts.delete(accountIndex);
    }
  }

  async function startWorkspace({ tenantId, provider = "douyin", accountKey, accountLabel = null, executorUid = null, taskId = null, scopes = [], cloudDesktop = null } = {}) {
    requireText(tenantId, "tenantId");
    requireText(provider, "provider");
    requireText(accountKey, "accountKey");
    if (provider !== "douyin") {
      throw new BrowserWorkspaceError(`Unsupported browser provider: ${provider}`, { code: "UNSUPPORTED_PROVIDER" });
    }

    const accountIndex = accountIndexFor({ tenantId, provider, accountKey });
    const existingId = accountSessions.get(accountIndex);
    const existing = existingId ? sessions.get(existingId) : null;
    if (existing && existing.state !== WORKSPACE_STATES.DESTROYED) {
      // A persistent account profile may serve multiple tasks. Rebind the
      // live session to the current task while keeping the logged-in browser
      // context, so daily follow-up work does not require a new login.
      if (taskId) existing.taskId = taskId;
      if (accountLabel) existing.accountLabel = accountLabel;
      if (executorUid) existing.executorUid = executorUid;
      if (Array.isArray(scopes) && scopes.length) existing.scopes = [...new Set(scopes.map(String))];
      if (cloudDesktop) existing.cloudDesktop = sanitizeCloudDesktop(cloudDesktop);
      existing.updatedAt = now();
      await refresh(existing);
      if (existing.state !== WORKSPACE_STATES.READY && typeof existing.handle?.navigate === "function") {
        await existing.handle.navigate(existing.authUrl || loginUrl).catch(() => {});
        existing.pageUrl = existing.authUrl || loginUrl;
        existing.updatedAt = now();
      }
      persistRegistry();
      return redactSnapshot(existing);
    }

    const workspaceId = `workspace-${shortHash(accountIndex)}`;
    const sessionId = `browser-session-${shortHash(`${accountIndex}:${Date.now()}:${Math.random()}`)}`;
    const profileDir = resolve(rootDir, workspaceId);
    await mkdir(profileDir, { recursive: true });
    const handle = await launcher.launchPersistent({
      workspaceId,
      sessionId,
      profileDir,
      loginUrl,
      provider,
      accountKey,
      headless: process.env.BYERING_BROWSER_HEADLESS === "1",
      openLogin: true
    });
    const record = {
      sessionId,
      workspaceId,
      tenantId,
      provider,
      accountKey,
      accountLabel,
      executorUid: executorUid || null,
      taskId,
      scopes: [...new Set(scopes.map(String))],
      cloudDesktop: cloudDesktop ? sanitizeCloudDesktop(cloudDesktop) : null,
      profileDir,
      authUrl: loginUrl,
      state: WORKSPACE_STATES.AUTHORIZING,
      createdAt: now(),
      updatedAt: now(),
      handle
    };
    sessions.set(sessionId, record);
    accountSessions.set(accountIndex, sessionId);
    persistRegistry();
    await refresh(record);
    persistRegistry();
    return redactSnapshot(record);
  }

  async function authorize(sessionId) {
    const record = requireSession(sessionId);
    await refresh(record);
    if (record.state !== WORKSPACE_STATES.READY) {
      throw new BrowserWorkspaceError("抖音登录尚未被浏览器工作区检测到", {
        code: "AUTHORIZATION_PENDING",
        statusCode: 409,
        details: { sessionId, state: record.state, pageUrl: record.pageUrl || record.authUrl }
      });
    }
    persistRegistry();
    return redactSnapshot(record);
  }

  async function navigate(sessionId, url) {
    const record = requireSession(sessionId);
    await ensureHandle(record);
    const target = new URL(String(url || record.authUrl));
    if (!isAllowedDouyinUrl(target)) {
      throw new BrowserWorkspaceError("Browser workspace can only navigate Douyin URLs", { code: "NAVIGATION_BLOCKED" });
    }
    if (typeof record.handle.navigate !== "function") {
      throw new BrowserWorkspaceError("Browser workspace cannot navigate", { code: "NAVIGATION_UNAVAILABLE", statusCode: 503 });
    }
    await record.handle.navigate(target.href);
    await refresh(record);
    persistRegistry();
    return redactSnapshot(record);
  }

  async function close(sessionId) {
    const record = requireSession(sessionId);
    await ensureHandle(record);
    await record.handle.close?.();
    record.state = WORKSPACE_STATES.DESTROYED;
    record.updatedAt = now();
    if (accountSessions.get(accountIndexFor(record)) === record.sessionId) accountSessions.delete(accountIndexFor(record));
    persistRegistry();
    return redactSnapshot(record);
  }

  async function snapshot(sessionId) {
    const record = requireSession(sessionId);
    await refresh(record);
    persistRegistry();
    return redactSnapshot(record);
  }

  async function execute(sessionId, input = {}) {
    const record = requireSession(sessionId);
    await refresh(record);
    if (record.state !== WORKSPACE_STATES.READY) {
      throw new BrowserWorkspaceError("抖音登录尚未被浏览器工作区检测到", {
        code: record.state === WORKSPACE_STATES.REAUTH_REQUIRED ? "REAUTH_REQUIRED" : "AUTHORIZATION_PENDING",
        statusCode: 409,
        details: { sessionId, state: record.state }
      });
    }
    await ensureHandle(record);
    if (typeof record.handle.execute !== "function") {
      throw new BrowserWorkspaceError("浏览器工作区不支持真实动作执行", {
        code: "BROWSER_ACTION_UNAVAILABLE",
        statusCode: 503,
        details: { sessionId }
      });
    }
    try {
      const result = await record.handle.execute(input);
      if (!result || result.accepted !== true) {
        throw new BrowserWorkspaceError("浏览器未确认动作完成", {
          code: result?.code || "BROWSER_ACTION_NOT_CONFIRMED",
          statusCode: 502,
          details: { sessionId, actionType: input.actionType || null }
        });
      }
      record.updatedAt = now();
      persistRegistry();
      return {
        accepted: true,
        externalActionId: result.externalActionId || null,
        actionType: result.actionType || input.actionType || null,
        status: result.status || "SENT"
      };
    } catch (cause) {
      if (cause instanceof BrowserWorkspaceError) throw cause;
      throw new BrowserWorkspaceError("浏览器动作执行失败", {
        code: cause?.code || "BROWSER_ACTION_FAILED",
        statusCode: Number.isInteger(cause?.statusCode) ? cause.statusCode : 502,
        details: { sessionId, actionType: input.actionType || null, cause: cause?.message || String(cause) }
      });
    }
  }

  async function refresh(record) {
    if (record.state === WORKSPACE_STATES.DESTROYED) return;
    await ensureHandle(record);
    let status;
    try {
      status = await record.handle.status?.() || {};
    } catch (cause) {
      record.state = WORKSPACE_STATES.REAUTH_REQUIRED;
      record.updatedAt = now();
      persistRegistry();
      throw new BrowserWorkspaceError("Browser workspace is unavailable", {
        code: "BROWSER_SESSION_UNAVAILABLE",
        statusCode: 503,
        details: { sessionId: record.sessionId, cause: cause?.message || String(cause) }
      });
    }
    record.pageUrl = status.url || record.pageUrl || record.authUrl;
    record.accountLabel = status.accountLabel || record.accountLabel || null;
    record.executorUid = status.executorUid || status.robotUid || status.uid || record.executorUid || null;
    if (status.ready === true) record.state = WORKSPACE_STATES.READY;
    else if (record.state === WORKSPACE_STATES.READY) record.state = WORKSPACE_STATES.REAUTH_REQUIRED;
    record.updatedAt = now();
    persistRegistry();
  }

  function requireSession(sessionId) {
    const record = sessions.get(sessionId);
    if (!record) throw new BrowserWorkspaceError("Browser session not found", { code: "SESSION_NOT_FOUND", statusCode: 404 });
    return record;
  }

  async function ensureHandle(record) {
    if (record.handle || record.state === WORKSPACE_STATES.DESTROYED) return;
    await mkdir(record.profileDir, { recursive: true });
    try {
      record.handle = await launcher.launchPersistent({
        workspaceId: record.workspaceId,
        sessionId: record.sessionId,
        profileDir: record.profileDir,
        loginUrl: record.authUrl || loginUrl,
        provider: record.provider,
        accountKey: record.accountKey,
        headless: process.env.BYERING_BROWSER_HEADLESS === "1",
        openLogin: false,
        restore: true
      });
    } catch (cause) {
      throw new BrowserWorkspaceError("Unable to restore browser workspace", {
        code: "BROWSER_RESTORE_FAILED",
        statusCode: 503,
        details: { sessionId: record.sessionId, cause: cause?.message || String(cause) }
      });
    }
  }

  function restoreRegistry() {
    if (!sessionRegistryPath || !existsSync(sessionRegistryPath)) return;
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(sessionRegistryPath, "utf8"));
    } catch (cause) {
      throw new BrowserWorkspaceError("Browser session registry is not valid JSON", {
        code: "BROWSER_REGISTRY_CORRUPT",
        statusCode: 500,
        details: { cause: cause?.message || String(cause) }
      });
    }
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.sessions)) {
      throw new BrowserWorkspaceError("Browser session registry has an unsupported shape", {
        code: "BROWSER_REGISTRY_INVALID",
        statusCode: 500
      });
    }
    for (const value of parsed.sessions) {
      const record = restoreRecord(value);
      if (!record) continue;
      sessions.set(record.sessionId, record);
      if (record.state !== WORKSPACE_STATES.DESTROYED) accountSessions.set(accountIndexFor(record), record.sessionId);
    }
  }

  function persistRegistry() {
    if (!sessionRegistryPath) return;
    const temporaryPath = `${sessionRegistryPath}.${process.pid}.tmp`;
    const payload = JSON.stringify({
      version: 1,
      sessions: [...sessions.values()].map(serializeRecord)
    }) + "\n";
    try {
      writeFileSync(temporaryPath, payload, { encoding: "utf8", mode: 0o600 });
      renameSync(temporaryPath, sessionRegistryPath);
    } catch (cause) {
      try { if (existsSync(temporaryPath)) unlinkSync(temporaryPath); } catch {}
      throw new BrowserWorkspaceError("Unable to persist browser session registry", {
        code: "BROWSER_REGISTRY_WRITE_FAILED",
        statusCode: 500,
        details: { cause: cause?.message || String(cause) }
      });
    }
  }

  return Object.freeze({ start, authorize, navigate, close, snapshot, execute, list: () => [...sessions.values()].map(redactSnapshot) });

  function redactSnapshot(record) {
    return {
      sessionId: record.sessionId,
      workspaceId: record.workspaceId,
      tenantId: record.tenantId,
      provider: record.provider,
      // This is the server-owned account slot, not a cookie or token. It lets
      // the control plane bind a task to the persistent profile it requested.
      accountKey: record.accountKey,
      accountLabel: record.accountLabel,
      executorUid: record.executorUid || null,
      taskId: record.taskId,
      scopes: [...record.scopes],
      cloudDesktop: record.cloudDesktop || null,
      authUrl: record.authUrl,
      pageUrl: record.pageUrl || record.authUrl,
      state: record.state,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt
    };
  }
}

function sanitizeCloudDesktop(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !/token|secret|password|cookie|authorization/i.test(key))
    .filter(([, item]) => item == null || ["string", "number", "boolean"].includes(typeof item)));
}

function createDefaultLauncher() {
  return {
    async launchPersistent(options) {
      const modulePath = new URL("../components/MarvisAgent/skills/agent-browser/scripts/node_modules/playwright-core/index.mjs", import.meta.url).href;
      let playwright;
      try {
        playwright = await import(modulePath);
      } catch (error) {
        throw new BrowserWorkspaceError("Playwright runtime is unavailable", {
          code: "BROWSER_RUNTIME_UNAVAILABLE",
          statusCode: 503,
          details: { cause: error.message }
        });
      }
      const executablePath = process.env.BYERING_CHROME_PATH || detectChromePath();
      const context = await playwright.chromium.launchPersistentContext(options.profileDir, {
        headless: options.headless,
        executablePath: executablePath || undefined,
        viewport: null,
        args: options.headless ? [] : ["--start-maximized"],
        locale: "zh-CN",
        timezoneId: "Asia/Shanghai"
      });
      const page = context.pages()[0] || await context.newPage();
      if (options.openLogin !== false) {
        await page.goto(options.loginUrl, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
      }
      return {
        async navigate(url) {
          await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
        },
        async execute(input) {
          return executeDouyinAction(page, input);
        },
        async status() {
          return inspectRealDouyinSession(context, page);
        },
        async close() {
          await context.close();
        }
      };
    }
  };
}

async function executeDouyinAction(page, input = {}) {
  const actionType = String(input.actionType || "").trim().toLowerCase();
  const message = String(input.message || "").trim();
  if (!message) throw new BrowserWorkspaceError("外部动作缺少待发送内容", { code: "LOCAL_ACTION_INPUT_REQUIRED", statusCode: 400 });
  const isPrivate = actionType === "private_message" || actionType === "private_message_without_follow";
  const isComment = actionType === "video_comment_reply" || actionType === "barrage_reply";
  if (!isPrivate && !isComment) {
    throw new BrowserWorkspaceError("本机浏览器不支持该动作类型", { code: "LOCAL_ACTION_UNSUPPORTED", statusCode: 400 });
  }

  const target = isPrivate
    ? input.profileUrl || (input.secUid ? `https://www.douyin.com/user/${encodeURIComponent(input.secUid)}` : null)
      || (input.uniqueId ? `https://www.douyin.com/user/${encodeURIComponent(input.uniqueId)}` : null)
      || (input.uid ? `https://www.douyin.com/user/${encodeURIComponent(input.uid)}` : null)
    : input.videoUrl || (input.videoId ? `https://www.douyin.com/video/${encodeURIComponent(input.videoId)}` : null);
  if (!target) throw new BrowserWorkspaceError("外部动作缺少目标页面", { code: "LOCAL_ACTION_INPUT_REQUIRED", statusCode: 400 });
  let targetUrl;
  try { targetUrl = new URL(target); } catch { throw new BrowserWorkspaceError("目标页面地址无效", { code: "LOCAL_ACTION_INPUT_INVALID", statusCode: 400 }); }
  if (!isAllowedDouyinUrl(targetUrl)) throw new BrowserWorkspaceError("目标页面不是抖音地址", { code: "NAVIGATION_BLOCKED", statusCode: 400 });

  await page.goto(targetUrl.href, { waitUntil: "domcontentloaded", timeout: 30000 });
  const actionButton = isPrivate
    ? await firstVisibleLocator(page, [
      () => page.getByRole("button", { name: /私信/ }).first(),
      () => page.getByText("私信", { exact: true }).first()
    ])
    : null;
  if (isPrivate && !actionButton) {
    throw new BrowserWorkspaceError("抖音页面没有出现可用的私信入口", { code: "LOCAL_ACTION_UI_UNAVAILABLE", statusCode: 503 });
  }
  if (actionButton) await actionButton.click();

  const editor = await firstVisibleLocator(page, [
    () => page.locator("textarea").first(),
    () => page.locator('[contenteditable="true"]').first(),
    () => page.locator('input[placeholder*="消息"], input[placeholder*="评论"]').first()
  ]);
  if (!editor) {
    throw new BrowserWorkspaceError("抖音页面没有出现可用的消息输入框", { code: "LOCAL_ACTION_UI_UNAVAILABLE", statusCode: 503 });
  }
  await editor.fill(message);
  const sendButton = await firstVisibleLocator(page, [
    () => page.getByRole("button", { name: /^(发送|发布)$/ }).last(),
    () => page.getByText("发送", { exact: true }).last(),
    () => page.getByText("发布", { exact: true }).last()
  ]);
  if (!sendButton) {
    throw new BrowserWorkspaceError("抖音页面没有出现可用的发送按钮", { code: "LOCAL_ACTION_UI_UNAVAILABLE", statusCode: 503 });
  }
  await sendButton.click();
  return {
    accepted: true,
    externalActionId: `browser-${Date.now().toString(36)}`,
    actionType,
    status: "SENT"
  };
}

async function firstVisibleLocator(page, factories) {
  for (const factory of factories) {
    try {
      const locator = factory();
      if (await locator.count() && await locator.isVisible()) return locator;
    } catch {
      // Try the next selector; a changed Douyin DOM must fail closed below.
    }
  }
  return null;
}

async function inspectRealDouyinSession(context, page) {
  const pages = typeof context.pages === "function" ? context.pages() : [page];
  const cookies = await context.cookies(["https://www.douyin.com"]).catch(() => []);
  const cookieNames = new Set(cookies.map((cookie) => cookie.name));
  const activePage = pages.find((candidate) => !/\/login(?:[/?#]|$)/i.test(candidate.url())) || page;
  const url = activePage.url();
  return {
    ready: isDouyinSessionReady({ cookieNames, url }),
    url,
    accountLabel: null
  };
}

function detectChromePath() {
  const candidates = process.platform === "darwin"
    ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"]
    : process.platform === "win32"
      ? [process.env.LOCALAPPDATA && `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`]
      : ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
  return candidates.find((candidate) => candidate && existsSync(candidate)) || null;
}

function accountIndexFor({ tenantId, provider, accountKey }) {
  return `${tenantId}:${provider}:${accountKey}`;
}

function shortHash(value) {
  return createHash("sha256").update(String(value)).digest("hex").slice(0, 24);
}

function serializeRecord(record) {
  return {
    sessionId: record.sessionId,
    workspaceId: record.workspaceId,
    tenantId: record.tenantId,
    provider: record.provider,
    accountKey: record.accountKey,
    accountLabel: record.accountLabel || null,
    executorUid: record.executorUid || null,
    taskId: record.taskId || null,
    scopes: Array.isArray(record.scopes) ? [...record.scopes] : [],
    cloudDesktop: record.cloudDesktop ? sanitizeCloudDesktop(record.cloudDesktop) : null,
    profileDir: record.profileDir,
    authUrl: record.authUrl,
    pageUrl: record.pageUrl || record.authUrl,
    state: record.state,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

function restoreRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const required = ["sessionId", "workspaceId", "tenantId", "provider", "accountKey", "profileDir", "authUrl"];
  if (required.some((field) => typeof value[field] !== "string" || !value[field].trim())) return null;
  if (value.provider !== "douyin" || !Object.values(WORKSPACE_STATES).includes(value.state)) return null;
  return {
    ...serializeRecord(value),
    scopes: Array.isArray(value.scopes) ? [...new Set(value.scopes.map(String))] : [],
    handle: null
  };
}

function requireText(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    throw new BrowserWorkspaceError(`${field} is required`, { code: `${field.toUpperCase()}_REQUIRED` });
  }
}

function isAllowedDouyinUrl(url) {
  return url.protocol === "https:" && (url.hostname === "douyin.com" || url.hostname.endsWith(".douyin.com"));
}
