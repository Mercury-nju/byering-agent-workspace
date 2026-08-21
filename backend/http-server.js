import { createServer } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";
import { ControlPlaneError, createControlPlane } from "./control-plane.js";
import { createControlPlaneAuth } from "./auth.js";
import { createBrowserWorkspaceService } from "./browser-workspace.js";
import { createRequirementUnderstandingService } from "./requirement-understanding.js";
import { createClueHunterService } from "./cluehunter-service.js";
import { createProspectService } from "./prospect-service.js";
import { createAccountResolver } from "./account-resolver.js";
import { createClueHunterCloudService } from "./cluehunter-cloud.js";
import { createProspectWorkflowRunner } from "./prospect-workflow-runner.js";
import { createTaskDispatcher } from "./task-dispatcher.js";
import { createLocalBrowserExecutor } from "./local-browser-executor.js";
import { FilePersistenceAdapter } from "./persistence.js";

export function createControlPlaneHttpServer({
  controlPlane = null,
  persistence = null,
  browserWorkspace = createBrowserWorkspaceService(),
  requirementService = createRequirementUnderstandingService(),
  clueHunterService = createClueHunterService(),
  prospectService = null,
  accountResolver = createAccountResolver(),
  cloudDesktopService = null,
  cloudDesktopMode = process.env.BYERING_CLOUD_DESKTOP_MODE || "local",
  localBrowserExecutor = null,
  prospectExecutor = null,
  taskDispatcher = null,
  allowedOrigins = defaultAllowedOrigins(),
  auth = null,
  bodyLimit = 1024 * 1024,
  clueHunterEventSecret = process.env.BYERING_CLUEHUNTER_EVENT_SECRET || process.env.BYERING_CLUEHUNTER_SIGNING_SECRET || null,
  clueHunterEventMaxSkewMs = 5 * 60 * 1000,
  prospectEventSecret = process.env.BYERING_PROSPECT_EVENT_SECRET || null,
  prospectEventMaxSkewMs = 5 * 60 * 1000,
  now = () => Date.now()
} = {}) {
  const authoritativeControlPlane = controlPlane || createControlPlane({ browserWorkspace, requirementService, taskDispatcher, persistence: persistence || undefined });
  const authoritativeClueHunterService = clueHunterService || createClueHunterService({ env: {} });
  const authoritativeProspectService = prospectService || createProspectService({ accountResolver, env: {} });
  const authenticator = auth && typeof auth.authenticate === "function"
    ? auth
    : auth === false
      ? createControlPlaneAuth({ authRequired: false, apiKeys: [] })
      : createControlPlaneAuth(auth || {});
  if (taskDispatcher && !authoritativeControlPlane.taskDispatcher) authoritativeControlPlane.taskDispatcher = taskDispatcher;
  // The HTTP preflight and the control plane must share the same workspace
  // verifier; otherwise a direct worker command could bypass browser auth.
  if (!authoritativeControlPlane.browserWorkspace) authoritativeControlPlane.browserWorkspace = browserWorkspace;
  const server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
      const principal = request.method === "OPTIONS"
        ? anonymousPrincipal()
        : authenticator.authenticate(request, { path: requestUrl.pathname });
      await route(request, response, authoritativeControlPlane, browserWorkspace, authoritativeClueHunterService, authoritativeProspectService, allowedOrigins, bodyLimit, {
        clueHunterEventSecret,
        clueHunterEventMaxSkewMs,
        prospectEventSecret,
        prospectEventMaxSkewMs,
        accountResolver,
        cloudDesktopService,
        cloudDesktopMode,
        localBrowserExecutor,
        prospectExecutor,
        now,
        principal
      });
    } catch (error) {
      sendError(response, error);
    }
  });
  server.controlPlane = authoritativeControlPlane;
  server.persistence = authoritativeControlPlane.persistence;
  server.browserWorkspace = browserWorkspace;
  server.clueHunterService = authoritativeClueHunterService;
  server.prospectService = authoritativeProspectService;
  server.accountResolver = accountResolver;
  server.cloudDesktopService = cloudDesktopService;
  server.cloudDesktopMode = cloudDesktopMode;
  server.localBrowserExecutor = localBrowserExecutor;
  server.taskDispatcher = authoritativeControlPlane.taskDispatcher || taskDispatcher;
  server.authenticator = authenticator;
  return server;
}

export function startControlPlaneServer({ port = Number(process.env.BYERING_BACKEND_PORT || 6681), host = "127.0.0.1", controlPlane, persistence = null, persistenceDir = process.env.BYERING_PERSISTENCE_DIR, requirementService = createRequirementUnderstandingService(), ...options } = {}) {
  const clueHunterService = options.clueHunterService || createClueHunterService();
  const cloudDesktopService = options.cloudDesktopService || createClueHunterCloudService();
  const accountResolver = options.accountResolver || createAccountResolver();
  const prospectService = options.prospectService || createProspectService({ accountResolver });
  const prospectExecutor = options.prospectExecutor || createProspectWorkflowRunner({ prospectService });
  const cloudDesktopMode = options.cloudDesktopMode || process.env.BYERING_CLOUD_DESKTOP_MODE || "local";
  const durablePersistence = controlPlane ? null : (persistence || (persistenceDir
    ? new FilePersistenceAdapter({ filePath: join(persistenceDir, "control-plane.json") })
    : null));
  const browserProfileRoot = options.browserProfileRoot
    || process.env.BYERING_BROWSER_PROFILE_ROOT
    || join(homedir(), ".byering", "browser-workspaces");
  const browserSessionRegistryPath = options.browserSessionRegistryPath
    || process.env.BYERING_BROWSER_SESSION_REGISTRY
    || join(browserProfileRoot, "sessions.json");
  const browserWorkspace = options.browserWorkspace || createBrowserWorkspaceService({
    rootDir: browserProfileRoot,
    sessionRegistryPath: browserSessionRegistryPath
  });
  const localBrowserExecutor = options.localBrowserExecutor || (cloudDesktopMode === "local"
    ? createLocalBrowserExecutor({ browserWorkspace })
    : null);
  const taskDispatcher = options.taskDispatcher === undefined
    ? createTaskDispatcher({
      executionService: cloudDesktopMode === "local" ? localBrowserExecutor : clueHunterService,
      prospectService: prospectExecutor,
      cloudDesktopService: cloudDesktopMode === "local" ? null : cloudDesktopService
    })
    : options.taskDispatcher;
  const server = createControlPlaneHttpServer({
    ...options,
    persistence: durablePersistence,
    clueHunterService,
    prospectService,
    accountResolver,
    prospectExecutor,
    taskDispatcher,
    cloudDesktopService,
    cloudDesktopMode,
    controlPlane: controlPlane || null,
    browserWorkspace,
    localBrowserExecutor,
    ...(controlPlane ? {} : { requirementService })
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.removeListener("error", reject);
      resolve(server);
    });
  });
}

async function route(request, response, controlPlane, browserWorkspace, clueHunterService, prospectService, allowedOrigins, bodyLimit, security = {}) {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  const principal = security.principal || anonymousPrincipal();
  setCorsHeaders(response, request.headers.origin, allowedOrigins);
  if (request.method === "OPTIONS") return sendJson(response, 204, null);
  if (request.method === "GET" && url.pathname === "/healthz") {
    const executionReady = controlPlane?.taskDispatcher?.configured === true;
    const executionSources = [
      clueHunterService?.configured === true ? "cluehunter" : null,
      security.localBrowserExecutor?.configured === true ? "local-browser" : null,
      prospectService?.configured === true ? "prospect" : null
    ].filter(Boolean);
    return sendJson(response, 200, {
      ok: true,
      executionReady,
      accountResolverReady: security.accountResolver?.configured === true,
      capabilities: {
        publicDiscovery: prospectService?.configured === true,
        accountResolution: security.accountResolver?.configured === true,
        batchAccountDiscovery: prospectService?.configured === true,
        videoCommentCollection: prospectService?.configured === true,
        cloudDesktopProvisioning: security.cloudDesktopService?.configured === true
      },
      cloudDesktopConfigured: security.cloudDesktopService?.configured === true,
      cloudDesktopReady: security.cloudDesktopService?.configured === true,
      rpaConnectionReady: security.cloudDesktopService?.configured === true,
      cloudDesktopMode: security.cloudDesktopMode || "local",
      localBrowserExecution: security.localBrowserExecutor?.configured === true,
      cloudDesktopMissing: security.cloudDesktopService?.missing || [],
      executionSource: executionSources.length ? executionSources.join("+") : null
    });
  }

  const clueHunterMatch = url.pathname.match(/^\/v1\/connectors\/cluehunter\/(lease|ack|authorize|status|submit)$/);
  if (request.method === "POST" && clueHunterMatch) {
    const operation = clueHunterMatch[1];
    const body = withTenantScope(await readJson(request, bodyLimit), principal);
    const result = await clueHunterService[operation](body);
    // Connector calls made with task context are also event ingress. The
    // dispatcher ingests its own results directly, while worker-facing HTTP
    // calls must persist the same canonical facts before returning success.
    if (body.taskId && Array.isArray(result?.events) && result.events.length
      && typeof controlPlane.ingestExecutionEvents === "function") {
      const ingested = controlPlane.ingestExecutionEvents({
        taskId: body.taskId,
        tenantId: body.tenantId || principal.tenantId || null,
        uid: body.uid || body.robotUid || null,
        source: "cluehunter",
        events: result.events
      });
      return sendJson(response, 200, { ...result, ingested: {
        acceptedCount: ingested.acceptedCount,
        duplicateCount: ingested.duplicateCount,
        currentSeq: ingested.currentSeq
      } });
    }
    return sendJson(response, 200, result);
  }

  if (request.method === "POST" && url.pathname === "/v1/connectors/prospect/resolve-account") {
    const resolver = security.accountResolver;
    if (!resolver || typeof resolver.resolve !== "function" || resolver.configured === false) {
      throw new ControlPlaneError("账号解析能力未配置", {
        code: "ACCOUNT_RESOLVER_NOT_CONFIGURED",
        statusCode: 503
      });
    }
    const body = withTenantScope(await readJson(request, bodyLimit), principal);
    const account = await resolver.resolve(body);
    return sendJson(response, 200, { accepted: true, source: "account_resolution", account });
  }

  if (request.method === "POST" && url.pathname === "/v1/connectors/prospect/resolve-accounts") {
    const resolver = security.accountResolver;
    if (!resolver || typeof resolver.resolve !== "function" || resolver.configured === false) {
      throw new ControlPlaneError("账号解析能力未配置", {
        code: "ACCOUNT_RESOLVER_NOT_CONFIGURED",
        statusCode: 503
      });
    }
    const body = withTenantScope(await readJson(request, bodyLimit), principal);
    const references = Array.isArray(body.accounts)
      ? body.accounts
      : Array.isArray(body.accountRefs)
        ? body.accountRefs
        : Array.isArray(body.accountList)
          ? body.accountList
          : null;
    if (!references || references.length < 1 || references.length > 50) {
      throw new ControlPlaneError("accounts must contain between 1 and 50 public references", {
        code: "PROSPECT_INPUT_INVALID",
        statusCode: 400,
        details: { field: "accounts", max: 50 }
      });
    }
    const results = [];
    for (const [index, reference] of references.entries()) {
      try {
        const account = await resolver.resolve(reference && typeof reference === "object"
          ? reference
          : { accountName: String(reference ?? "") });
        results.push({ index, account });
      } catch (error) {
        results.push({
          index,
          error: {
            code: error?.code || "ACCOUNT_RESOLUTION_FAILED",
            message: error?.message || "账号解析失败",
            statusCode: Number.isInteger(error?.statusCode) ? error.statusCode : 502
          }
        });
      }
    }
    return sendJson(response, 200, {
      accepted: results.every((item) => item.account),
      source: "account_resolution",
      accounts: results
    });
  }

  const prospectMatch = url.pathname.match(/^\/v1\/connectors\/prospect\/(discover|events)$/);
  if (request.method === "POST" && prospectMatch) {
    if (!prospectService || typeof prospectService[prospectMatch[1] === "discover" ? "discover" : "callback"] !== "function") {
      throw new ControlPlaneError("公开找人 Agent 未配置", {
        code: "PROSPECT_EXECUTOR_NOT_CONFIGURED",
        statusCode: 503
      });
    }
    const rawBody = prospectMatch[1] === "events" ? await readRawBody(request, bodyLimit) : null;
    if (prospectMatch[1] === "events" && security.prospectEventSecret) {
      verifyProspectEventSignature({
        request,
        rawBody,
        secret: security.prospectEventSecret,
        maxSkewMs: security.prospectEventMaxSkewMs,
        now: security.now
      });
    }
    const parsedBody = rawBody == null ? await readJson(request, bodyLimit) : parseJsonBody(rawBody);
    const callbackContext = prospectMatch[1] === "events"
      ? Object.fromEntries(["taskId", "taskRunId", "conversationId", "agentId", "tenantId", "goal", "accountName", "uniqueId", "profileUrl", "uid", "secId"]
        .map((key) => [key, url.searchParams.get(key)])
        .filter(([, value]) => value))
      : {};
    // Correlation values embedded in the callback URL are server-issued and
    // must win over any similarly named fields in an upstream payload.
    const body = withTenantScope({ ...parsedBody, ...callbackContext }, principal);
    const result = prospectMatch[1] === "discover"
      ? await prospectService.discover(body)
      : await (security.prospectExecutor?.callback || prospectService.callback).call(
        security.prospectExecutor || prospectService,
        body,
        body.response || body.data || body
      );
    return sendConnectorResult(response, controlPlane, result, {
      taskId: body.taskId,
      tenantId: body.tenantId || principal.tenantId || null,
      source: "prospect"
    });
  }

  if (request.method === "POST" && url.pathname === "/v1/connectors/cluehunter/events") {
    const rawBody = await readRawBody(request, bodyLimit);
    const body = parseJsonBody(rawBody);
    verifyClueHunterEventSignature({
      request,
      rawBody,
      secret: security.clueHunterEventSecret,
      maxSkewMs: security.clueHunterEventMaxSkewMs,
      now: security.now
    });
    const events = Array.isArray(body.events)
      ? body.events
      : body.event && typeof body.event === "object"
        ? [body.event]
        : [];
    const executionInput = {
      taskId: body.taskId,
      uid: body.uid || null,
      source: body.source || "connector",
      events
    };
    if (body.tenantId) executionInput.tenantId = body.tenantId;
    return sendJson(response, 200, controlPlane.ingestExecutionEvents(executionInput));
  }

  if (request.method === "POST" && url.pathname === "/v1/browser-sessions") {
    const body = withTenantScope(await readJson(request, bodyLimit), principal);
    let cloudDesktop = null;
    let rpa = null;
    if (security.cloudDesktopMode === "cluehunter") {
      if (!security.cloudDesktopService || security.cloudDesktopService.configured !== true) {
        throw new ControlPlaneError("ClueHunter 云电脑未配置，已阻止本地浏览器降级", {
          code: "CLOUD_DESKTOP_NOT_CONFIGURED",
          statusCode: 503,
          details: { required: security.cloudDesktopService?.missing || [] }
        });
      }
      const cloudInput = {
        uid: body.executorUid || body.uid,
        tenant: body.legacyTenant || body.tenant || body.tenantId,
        regionId: body.regionId,
        robotInfoId: body.robotInfoId
      };
      const connection = typeof security.cloudDesktopService.connect === "function"
        ? await security.cloudDesktopService.connect(cloudInput)
        : { cloudDesktop: await security.cloudDesktopService.ensureReady(cloudInput) };
      cloudDesktop = connection.cloudDesktop || connection;
      rpa = connection.rpa || null;
    }
    const session = await browserWorkspace.start(body);
    return sendJson(response, 202, cloudDesktop ? { ...session, cloudDesktop, rpa } : session);
  }

  if (request.method === "POST" && url.pathname === "/v1/cloud-desktops/connect") {
    if (!security.cloudDesktopService || security.cloudDesktopService.configured !== true) {
      throw new ControlPlaneError("ClueHunter 云电脑与 RPA 未配置", {
        code: "CLOUD_DESKTOP_NOT_CONFIGURED",
        statusCode: 503,
        details: { required: security.cloudDesktopService?.missing || [] }
      });
    }
    const body = withTenantScope(await readJson(request, bodyLimit), principal);
    if (typeof security.cloudDesktopService.connect !== "function") {
      throw new ControlPlaneError("云电脑服务不支持 RPA 连接编排", {
        code: "CLOUD_DESKTOP_CONNECTOR_INVALID",
        statusCode: 503
      });
    }
    const connection = await security.cloudDesktopService.connect({
      uid: body.executorUid || body.uid,
      tenant: body.legacyTenant || body.tenant || body.tenantId,
      regionId: body.regionId,
      robotInfoId: body.robotInfoId
    });
    return sendJson(response, 202, connection);
  }

  if (request.method === "POST" && url.pathname === "/v1/cloud-desktops/apply") {
    if (!security.cloudDesktopService || security.cloudDesktopService.configured !== true) {
      throw new ControlPlaneError("ClueHunter 云电脑未配置", {
        code: "CLOUD_DESKTOP_NOT_CONFIGURED",
        statusCode: 503,
        details: { required: security.cloudDesktopService?.missing || [] }
      });
    }
    const body = withTenantScope(await readJson(request, bodyLimit), principal);
    return sendJson(response, 202, await security.cloudDesktopService.apply(body));
  }

  if (request.method === "POST" && url.pathname === "/v1/cloud-desktops/status") {
    if (!security.cloudDesktopService || security.cloudDesktopService.configured !== true) {
      throw new ControlPlaneError("ClueHunter 云电脑未配置", {
        code: "CLOUD_DESKTOP_NOT_CONFIGURED",
        statusCode: 503,
        details: { required: security.cloudDesktopService?.missing || [] }
      });
    }
    const body = withTenantScope(await readJson(request, bodyLimit), principal);
    return sendJson(response, 200, await security.cloudDesktopService.status(body));
  }

  const browserMatch = url.pathname.match(/^\/v1\/browser-sessions\/([^/]+)(?:\/(authorize|navigate|close))?$/);
  if (browserMatch) {
    const sessionId = decodeURIComponent(browserMatch[1]);
    const operation = browserMatch[2];
    await assertBrowserSessionTenant(browserWorkspace, sessionId, principal);
    if (request.method === "GET" && !operation) return sendJson(response, 200, await browserWorkspace.snapshot(sessionId));
    if (request.method === "POST" && operation === "authorize") return sendJson(response, 200, await browserWorkspace.authorize(sessionId));
    if (request.method === "POST" && operation === "navigate") {
      const body = await readJson(request, bodyLimit);
      return sendJson(response, 200, await browserWorkspace.navigate(sessionId, body.url));
    }
    if (request.method === "POST" && operation === "close") return sendJson(response, 200, await browserWorkspace.close(sessionId));
  }

  const taskMatch = url.pathname.match(/^\/v1\/tasks\/([^/]+)(?:\/(events|snapshot|start|commands))?$/);
  if (request.method === "GET" && taskMatch) {
    const taskId = decodeURIComponent(taskMatch[1]);
    assertTaskTenant(controlPlane, taskId, principal);
    if (taskMatch[2] === "events") {
      const afterSeq = parseNonNegativeInteger(url.searchParams.get("afterSeq"), 0);
      const limit = parseNonNegativeInteger(url.searchParams.get("limit"), 100);
      return sendJson(response, 200, { taskId, events: controlPlane.listTaskEvents(taskId, { afterSeq, limit }) });
    }
    return sendJson(response, 200, controlPlane.getTaskSnapshot(taskId));
  }

  if (request.method === "POST" && url.pathname === "/v1/commands") {
    let body = withTenantScope(await readJson(request, bodyLimit), principal);
    assertTaskTenant(controlPlane, body.taskId, principal);
    if (isAccessScopeConfirmation(body)) {
      const payload = body.payload && typeof body.payload === "object" ? body.payload : {};
      const sessionId = payload.browserSessionId || body.browserSessionId;
      if (!sessionId) {
        throw new ControlPlaneError("确认访问范围前必须绑定浏览器会话", {
          code: "BROWSER_SESSION_REQUIRED",
          statusCode: 400
        });
      }
      await assertBrowserSessionTenant(browserWorkspace, sessionId, principal);
      const session = await browserWorkspace.authorize(sessionId);
      if (session.taskId && body.taskId && session.taskId !== body.taskId) {
        throw new ControlPlaneError("浏览器会话与当前任务不匹配", {
          code: "BROWSER_SESSION_TASK_MISMATCH",
          statusCode: 409,
          details: { sessionId, taskId: body.taskId, sessionTaskId: session.taskId }
        });
      }
      body = {
        ...body,
        payload: {
          ...payload,
          browserSessionId: session.sessionId,
          provider: payload.provider || session.provider,
          accountLabel: payload.accountLabel || session.accountLabel || null
        }
      };
    }
    return sendJson(response, 202, await dispatchCommand(controlPlane, body));
  }

  if (request.method === "POST" && url.pathname === "/v1/tasks") {
    const body = withTenantScope(await readJson(request, bodyLimit), principal);
    return sendJson(response, 202, await dispatchCommand(controlPlane, toCommandBody(body, "task.create")));
  }

  if (taskMatch && request.method === "POST") {
    const taskId = decodeURIComponent(taskMatch[1]);
    assertTaskTenant(controlPlane, taskId, principal);
    const body = withTenantScope(await readJson(request, bodyLimit), principal);
    if (taskMatch[2] === "start") {
      return sendJson(response, 202, await dispatchCommand(controlPlane, toCommandBody(body, "task.run.start", taskId)));
    }
    if (taskMatch[2] === "commands") {
      return sendJson(response, 202, await dispatchCommand(controlPlane, { ...body, taskId }));
    }
  }

  throw new ControlPlaneError("Route not found", { code: "NOT_FOUND", statusCode: 404 });
}

async function dispatchCommand(controlPlane, body) {
  if (typeof controlPlane.dispatchAsync === "function") return controlPlane.dispatchAsync(body);
  return controlPlane.dispatch(body);
}

function withTenantScope(body, principal) {
  const source = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  const tenantId = principal?.tenantId || null;
  if (!tenantId) return source;
  const payload = source.payload && typeof source.payload === "object" && !Array.isArray(source.payload)
    ? source.payload
    : null;
  const executionContext = payload?.executionContext && typeof payload.executionContext === "object" && !Array.isArray(payload.executionContext)
    ? payload.executionContext
    : null;
  const supplied = [source.tenantId, payload?.tenantId, executionContext?.tenantId]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  if (supplied.some((value) => value !== tenantId)) {
    throw new ControlPlaneError("请求超出当前 API key 的租户范围", {
      code: "TENANT_SCOPE_FORBIDDEN",
      statusCode: 403,
      details: { tenantId }
    });
  }
  if (!payload) return { ...source, tenantId };
  return {
    ...source,
    tenantId,
    payload: {
      ...payload,
      tenantId,
      ...(executionContext ? { executionContext: { ...executionContext, tenantId } } : {})
    }
  };
}

function assertTaskTenant(controlPlane, taskId, principal) {
  if (!principal?.tenantId || !taskId) return;
  if (typeof controlPlane?.persistence?.loadTask !== "function") {
    throw new ControlPlaneError("控制面无法核验任务租户归属", {
      code: "TASK_TENANT_SCOPE_UNAVAILABLE",
      statusCode: 503,
      details: { taskId }
    });
  }
  const task = controlPlane.persistence.loadTask(taskId);
  if (!task) return;
  const tenantId = task.tenantId || task.executionContext?.tenantId || null;
  if (!tenantId) {
    throw new ControlPlaneError("任务没有绑定租户，拒绝跨租户访问", {
      code: "TASK_TENANT_UNBOUND",
      statusCode: 403,
      details: { taskId }
    });
  }
  if (tenantId !== principal.tenantId) {
    throw new ControlPlaneError("请求超出当前 API key 的租户范围", {
      code: "TENANT_SCOPE_FORBIDDEN",
      statusCode: 403,
      details: { taskId, tenantId: principal.tenantId }
    });
  }
}

async function assertBrowserSessionTenant(browserWorkspace, sessionId, principal) {
  if (!principal?.tenantId || !sessionId) return;
  if (typeof browserWorkspace?.snapshot !== "function") {
    throw new ControlPlaneError("浏览器会话无法核验租户归属", {
      code: "BROWSER_SESSION_TENANT_UNAVAILABLE",
      statusCode: 503,
      details: { sessionId }
    });
  }
  const snapshot = await browserWorkspace.snapshot(sessionId);
  const tenantId = String(snapshot?.tenantId || "").trim();
  if (!tenantId) {
    throw new ControlPlaneError("浏览器会话没有绑定租户，拒绝访问", {
      code: "BROWSER_SESSION_TENANT_UNBOUND",
      statusCode: 403,
      details: { sessionId }
    });
  }
  if (tenantId !== principal.tenantId) {
    throw new ControlPlaneError("请求超出当前 API key 的租户范围", {
      code: "TENANT_SCOPE_FORBIDDEN",
      statusCode: 403,
      details: { sessionId, tenantId: principal.tenantId }
    });
  }
}

function anonymousPrincipal() {
  return { authenticated: false, tenantId: null, keyId: null, scopes: [] };
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

function isAccessScopeConfirmation(body) {
  return body?.type === "access.scope.confirm" || body?.commandType === "access.scope.confirm";
}

async function readJson(request, bodyLimit) {
  return parseJsonBody(await readRawBody(request, bodyLimit));
}

async function readRawBody(request, bodyLimit) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > bodyLimit) throw new ControlPlaneError("Request body is too large", { code: "PAYLOAD_TOO_LARGE", statusCode: 413 });
    chunks.push(chunk);
  }
  return chunks.length ? Buffer.concat(chunks).toString("utf8") : "";
}

function parseJsonBody(rawBody) {
  if (!rawBody) return {};
  try { return JSON.parse(rawBody); } catch {
    throw new ControlPlaneError("Request body must be valid JSON", { code: "INVALID_JSON", statusCode: 400 });
  }
}

function verifyClueHunterEventSignature({ request, rawBody, secret, maxSkewMs = 5 * 60 * 1000, now = () => Date.now() }) {
  if (typeof secret !== "string" || !secret.trim()) {
    throw new ControlPlaneError("ClueHunter event secret is not configured", {
      code: "CLUEHUNTER_EVENT_SECRET_REQUIRED",
      statusCode: 503
    });
  }
  const timestamp = String(request.headers["x-cluehunter-timestamp"] || "").trim();
  const signature = String(request.headers["x-cluehunter-signature"] || "").trim();
  if (!/^\d{10,16}$/.test(timestamp) || !/^sha256=[0-9a-f]{64}$/i.test(signature)) {
    throw new ControlPlaneError("ClueHunter event signature is required", {
      code: "CLUEHUNTER_EVENT_SIGNATURE_REQUIRED",
      statusCode: 401
    });
  }
  const timestampMs = Number(timestamp);
  const skew = Math.abs(Number(now()) - timestampMs);
  if (!Number.isFinite(timestampMs) || !Number.isFinite(skew) || skew > maxSkewMs) {
    throw new ControlPlaneError("ClueHunter event timestamp is outside the allowed window", {
      code: "CLUEHUNTER_EVENT_REPLAY",
      statusCode: 401,
      details: { maxSkewMs }
    });
  }
  const path = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`).pathname;
  const canonical = [timestamp, request.method.toUpperCase(), path, rawBody || ""].join("\n");
  const expected = Buffer.from(`sha256=${createHmac("sha256", secret).update(canonical).digest("hex")}`);
  const provided = Buffer.from(signature);
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    throw new ControlPlaneError("ClueHunter event signature is invalid", {
      code: "CLUEHUNTER_EVENT_SIGNATURE_INVALID",
      statusCode: 401
    });
  }
}

function verifyProspectEventSignature({ request, rawBody, secret, maxSkewMs = 5 * 60 * 1000, now = () => Date.now() }) {
  const timestamp = String(request.headers["x-prospect-timestamp"] || "").trim();
  const signature = String(request.headers["x-prospect-signature"] || "").trim();
  if (!/^\d{10,16}$/.test(timestamp) || !/^sha256=[0-9a-f]{64}$/i.test(signature)) {
    throw new ControlPlaneError("Prospect event signature is required", {
      code: "PROSPECT_EVENT_SIGNATURE_REQUIRED",
      statusCode: 401
    });
  }
  const timestampMs = Number(timestamp);
  const skew = Math.abs(Number(now()) - timestampMs);
  if (!Number.isFinite(timestampMs) || !Number.isFinite(skew) || skew > maxSkewMs) {
    throw new ControlPlaneError("Prospect event timestamp is outside the allowed window", {
      code: "PROSPECT_EVENT_REPLAY",
      statusCode: 401,
      details: { maxSkewMs }
    });
  }
  const path = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`).pathname;
  const canonical = [timestamp, request.method.toUpperCase(), path, rawBody || ""].join("\n");
  const expected = Buffer.from(`sha256=${createHmac("sha256", secret).update(canonical).digest("hex")}`);
  const provided = Buffer.from(signature);
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    throw new ControlPlaneError("Prospect event signature is invalid", {
      code: "PROSPECT_EVENT_SIGNATURE_INVALID",
      statusCode: 401
    });
  }
}

function parseNonNegativeInteger(value, fallback) {
  if (value == null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new ControlPlaneError("Query value must be a non-negative integer", { code: "INVALID_QUERY", statusCode: 400 });
  return parsed;
}

function setCorsHeaders(response, requestOrigin, allowedOrigins) {
  const origin = allowedOrigins.includes(requestOrigin) ? requestOrigin : null;
  if (origin) response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Vary", "Origin");
  response.setHeader("Access-Control-Allow-Headers", "content-type, authorization, x-api-key, x-byering-api-key, x-request-id, x-cluehunter-timestamp, x-cluehunter-signature, x-prospect-timestamp, x-prospect-signature");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
}

function defaultAllowedOrigins() {
  const configured = process.env.BYERING_CONTROL_PLANE_ORIGINS;
  if (configured) return configured.split(",").map((origin) => origin.trim()).filter(Boolean);
  return ["http://127.0.0.1:6680", "http://localhost:6680", "http://127.0.0.1:8888", "http://localhost:8888"];
}

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  if (statusCode === 204) return response.end();
  response.end(JSON.stringify(payload));
}

function sendConnectorResult(response, controlPlane, result, { taskId = null, tenantId = null, source = "connector" } = {}) {
  if (taskId && Array.isArray(result?.events) && result.events.length
    && typeof controlPlane?.ingestExecutionEvents === "function") {
    const ingested = controlPlane.ingestExecutionEvents({
      taskId,
      tenantId,
      source,
      events: result.events
    });
    return sendJson(response, 200, {
      ...result,
      ingested: {
        acceptedCount: ingested.acceptedCount,
        duplicateCount: ingested.duplicateCount,
        currentSeq: ingested.currentSeq
      }
    });
  }
  return sendJson(response, 200, result);
}

function sendError(response, error) {
  const statusCode = error instanceof ControlPlaneError || Number.isInteger(error?.statusCode) ? error.statusCode : 500;
  const details = error?.details && typeof error.details === "object" && Object.keys(error.details).length
    ? error.details
    : undefined;
  sendJson(response, statusCode, {
    accepted: false,
    error: {
      code: error.code || "INTERNAL_ERROR",
      message: error.message || "Internal server error",
      details
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
