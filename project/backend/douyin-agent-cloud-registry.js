import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { createDouyinMcpService } from "./douyin-mcp.js";

const SNAPSHOT_VERSION = 1;

/**
 * Owns the durable relationship between a logical Agent and its Douyin cloud
 * desktop session. A process restart recreates a worker with the saved
 * session_id instead of provisioning a new desktop.
 */
export function createDouyinAgentCloudRegistry({
  stateFile = process.env.BYERING_DOUYIN_AGENT_CLOUD_STATE_FILE || join(homedir(), ".byering", "douyin-agent-cloud.json"),
  createService = createDouyinMcpService,
  serviceOptions = {},
  serviceOptionsByAgent = null,
  // Cloud startup is provider-owned and can legitimately take longer than a
  // local wall-clock estimate. Keep the timeout opt-in for diagnostics only.
  provisioningTimeoutMs = Number(process.env.BYERING_DOUYIN_PROVISIONING_TIMEOUT_MS) || null,
  recoveryTimeoutMs = Number(process.env.BYERING_DOUYIN_RECOVERY_TIMEOUT_MS) || 180000,
  now = () => Date.now()
} = {}) {
  const target = String(stateFile || "").trim();
  if (!target) throw new TypeError("stateFile is required");
  mkdirSync(dirname(target), { recursive: true });
  const state = loadState(target);
  const services = new Map();
  const starts = new Map();
  const expirations = new Map();

  // A previous account-binding migration could leave the anonymous carrier
  // record beside its account-scoped replacement. Both point at the same
  // desktop, so retaining both makes a later login probe see its own session
  // as a conflicting owner. The scoped record is the authoritative one.
  if (repairDuplicateAccountBindings()) flush(target, state);

  function provisioningTimeoutLimit() {
    const configuredTimeout = Number(provisioningTimeoutMs);
    return Number.isFinite(configuredTimeout) && configuredTimeout > 0
      ? Math.max(60 * 1000, configuredTimeout)
      : Number.POSITIVE_INFINITY;
  }

  function provisioningAgeMs(record) {
    const startedAt = Date.parse(record?.startedAt || record?.updatedAt || "");
    return Number.isFinite(startedAt) ? Math.max(0, Number(now()) - startedAt) : 0;
  }

  function provisioningTimedOut(record, provisioning = true) {
    // A persisted session is owned by the provider already. Its local
    // startedAt can be stale after a backend restart, so never turn a healthy
    // Never turn a provider-owned provisioning session into an error solely
    // because local time elapsed. An explicit timeout can still be supplied by
    // diagnostics or an operator who wants the old bounded behavior.
    return Boolean(provisioning && !record?.sessionId)
      && provisioningAgeMs(record) > provisioningTimeoutLimit();
  }

  function provisioningTimeoutError(record) {
    return {
      code: "DOUYIN_PROVISIONING_TIMEOUT",
      message: "云电脑启动超过预期时间，旧启动任务可能已卡住，请停止后重试。",
      ageMs: provisioningAgeMs(record)
    };
  }

  function timeoutSnapshot(agentId, record, error) {
    return {
      ok: false,
      state: "ERROR",
      display_state: "error",
      provisioning: false,
      agentId,
      sessionId: record?.sessionId || null,
      startedAt: record?.startedAt || record?.updatedAt || null,
      updatedAt: record?.updatedAt || null,
      error: { ...error }
    };
  }

  function markProvisioningTimeout(agentId, scope = {}, record = recordFor(agentId, scope)) {
    const id = normalizeAgentId(agentId);
    const current = record || { agentId: id };
    const error = provisioningTimeoutError(current);
    const stored = storeRecord(id, scope, {
      ...current,
      agentId: id,
      status: "error",
      lastError: error,
      updatedAt: new Date(Number(now())).toISOString()
    });
    flush(target, state);
    return timeoutSnapshot(id, stored, error);
  }

  async function expireInFlightStart(agentId, scope = {}, record = recordFor(agentId, scope)) {
    const id = normalizeAgentId(agentId);
    const key = recordKey(id, scope);
    const existing = expirations.get(key);
    if (existing) return existing;
    const operation = starts.get(key);
    // Detach before closing the worker. The old promise may reject or resolve
    // later, but its completion must never overwrite the timeout state.
    if (operation) starts.delete(key);
    const task = (async () => {
      try {
        await services.get(key)?.close?.();
      } catch {
        // The timeout state is the useful recovery signal even if cleanup fails.
      }
      // A user may have started a replacement while cleanup was awaiting the
      // worker shutdown. Never let this expiration overwrite that new start.
      if (starts.has(key)) return startingSnapshot(id, recordFor(id, scope));
      return markProvisioningTimeout(id, scope, record);
    })();
    const tracked = task.finally(() => expirations.delete(key));
    expirations.set(key, tracked);
    return tracked;
  }

  function normalizeScope(input = {}) {
    const source = input && typeof input === "object" ? input : {};
    const accountIdentity = source.accountIdentity && typeof source.accountIdentity === "object"
      ? { ...source.accountIdentity }
      : null;
    const accountId = valueOf(source.accountId ?? source.account_id);
    const tenantId = valueOf(source.tenantId ?? source.tenant_id);
    const accountLabel = valueOf(source.accountLabel ?? source.account_label);
    const accountKey = accountScopeKey({ accountId, accountIdentity });
    return { accountId, accountIdentity, tenantId, accountLabel, accountKey };
  }

  function accountScopeKey({ accountId = null, accountIdentity = null } = {}) {
    // A verified Douyin identity is the only stable key for a cloud browser.
    // Product and provider account IDs may vary between execution paths for
    // the same account, so they must not fork its logged-in session.
    const identity = accountIdentity && typeof accountIdentity === "object" ? accountIdentity : {};
    const candidates = [
      identity.secUid, identity.sec_uid, identity.secId, identity.sec_id,
      identity.uid, identity.userId, identity.user_id,
      identity.uniqueId, identity.unique_id, identity.profileUrl, identity.profile_url
    ].map(valueOf).filter(Boolean);
    if (candidates.length) return `identity:${candidates[0]}`;
    return accountId ? `account:${accountId}` : null;
  }

  function recordKey(agentId, scope = {}) {
    const id = normalizeAgentId(agentId);
    const normalized = normalizeScope(scope);
    if (!normalized.accountKey) return id;
    return `${id}::${encodeURIComponent(normalized.tenantId || "local")}::${encodeURIComponent(normalized.accountKey)}`;
  }

  function recordEntry(agentId, scope = {}) {
    const id = normalizeAgentId(agentId);
    const normalized = normalizeScope(scope);
    const key = recordKey(id, normalized);
    if (state.agents[key]) return { key, record: state.agents[key], scope: normalized, sourceKey: key };
    const matchingBoundRecord = accountBoundRecordMatchingScope(id, normalized);
    if (matchingBoundRecord) return matchingBoundRecord;
    if (!normalized.accountKey) {
      const bound = uniqueAccountBoundRecord(id);
      if (bound) return bound;
    }
    const legacy = state.agents[id];
    if (key !== id && legacy && (recordMatchesScope(legacy, normalized) || canBindUnscopedSession(legacy, normalized))) {
      return { key, record: legacy, scope: normalized, sourceKey: id };
    }
    return { key, record: null, scope: normalized, sourceKey: key };
  }

  function accountBoundRecordMatchingScope(agentId, scope = {}) {
    const id = normalizeAgentId(agentId);
    const normalized = normalizeScope(scope);
    if (!normalized.accountKey) return null;
    const matches = Object.entries(state.agents)
      .filter(([key, record]) => key !== id
        && record?.agentId === id
        && recordMatchesScope(record, normalized)
        && (!normalized.tenantId || record.tenantId === normalized.tenantId))
      .map(([key, record]) => ({ key, record }));
    if (matches.length !== 1) return null;
    const { key, record } = matches[0];
    const resolvedScope = normalizeScope({
      ...normalized,
      accountIdentity: normalized.accountIdentity || record.accountIdentity,
      accountLabel: normalized.accountLabel || record.accountLabel || null
    });
    return { key, record, scope: resolvedScope, sourceKey: key };
  }

  function canBindUnscopedSession(record, scope = {}) {
    return Boolean(
      scope?.accountKey
      && record?.sessionId
      && !accountIdentityKeys(record).length
    );
  }

  function recordFor(agentId, scope = {}) {
    return recordEntry(agentId, scope).record || null;
  }

  function storeRecord(agentId, scope = {}, record = {}) {
    const id = normalizeAgentId(agentId);
    const entry = recordEntry(id, scope);
    const stored = {
      ...record,
      agentId: id,
      bindingKey: entry.key,
      tenantId: entry.scope.tenantId || record.tenantId || null,
      accountId: entry.scope.accountId || record.accountId || null,
      accountIdentity: entry.scope.accountIdentity || record.accountIdentity || null,
      accountLabel: entry.scope.accountLabel || record.accountLabel || null
    };
    state.agents[entry.key] = stored;
    if (entry.sourceKey !== entry.key) delete state.agents[entry.sourceKey];
    return stored;
  }

  function recordMatchesScope(record, scope = {}) {
    const requested = new Set(scopeIdentityKeys(scope));
    if (!requested.size) return false;
    return scopeIdentityKeys({ accountId: record?.accountId, accountIdentity: record?.accountIdentity })
      .some((key) => requested.has(key));
  }

  function scopeIdentityKeys(scope = {}) {
    const normalized = normalizeScope(scope);
    const identity = normalized.accountIdentity || {};
    return [
      normalized.accountId && `account:${normalized.accountId}`,
      identity.secUid && `identity:${identity.secUid}`,
      identity.sec_uid && `identity:${identity.sec_uid}`,
      identity.secId && `identity:${identity.secId}`,
      identity.sec_id && `identity:${identity.sec_id}`,
      identity.uid && `identity:${identity.uid}`,
      identity.userId && `identity:${identity.userId}`,
      identity.user_id && `identity:${identity.user_id}`,
      identity.uniqueId && `identity:${identity.uniqueId}`,
      identity.unique_id && `identity:${identity.unique_id}`,
      identity.profileUrl && `identity:${identity.profileUrl}`,
      identity.profile_url && `identity:${identity.profile_url}`
    ].filter(Boolean);
  }

  function uniqueAccountBoundRecord(agentId) {
    const id = normalizeAgentId(agentId);
    const matches = Object.entries(state.agents)
      .filter(([key, record]) => key !== id && record?.agentId === id && accountIdentityKeys(record).length > 0)
      .map(([key, record]) => ({
        key,
        record,
        scope: normalizeScope({
          tenantId: record.tenantId,
          accountId: record.accountId,
          accountIdentity: record.accountIdentity,
          accountLabel: record.accountLabel
        }),
        sourceKey: key
      }));
    return matches.length === 1 ? matches[0] : null;
  }

  function accountIdentityKeys(record = {}) {
    return scopeIdentityKeys({
      accountId: record.accountId,
      accountIdentity: record.accountIdentity
    });
  }

  function recordsRepresentSameAccount(left, right) {
    const leftKeys = new Set(accountIdentityKeys(left));
    return leftKeys.size > 0 && accountIdentityKeys(right).some((key) => leftKeys.has(key));
  }

  function repairDuplicateAccountBindings() {
    let changed = false;
    for (const [key, record] of Object.entries(state.agents)) {
      if (!record?.agentId || key !== record.agentId || !record.sessionId || !accountIdentityKeys(record).length) continue;
      const scopedReplacement = Object.entries(state.agents)
        .find(([candidateKey, candidate]) => candidateKey !== key
          && candidate?.agentId === record.agentId
          && candidate?.sessionId === record.sessionId
          && recordsRepresentSameAccount(record, candidate));
      if (!scopedReplacement) continue;
      delete state.agents[key];
      changed = true;
    }
    return changed;
  }

  function specificOptionsFor(agentId) {
    const id = normalizeAgentId(agentId);
    return typeof serviceOptionsByAgent === "function"
      ? (serviceOptionsByAgent(id) || {})
      : (serviceOptionsByAgent?.[id] || {});
  }

  function optionsFor(agentId) {
    const specific = specificOptionsFor(agentId);
    return { ...serviceOptions, ...specific };
  }

  function hasSpecificOptions(agentId) {
    return Object.keys(specificOptionsFor(agentId)).length > 0;
  }

  function assertScopedApiKey(agentId) {
    const id = normalizeAgentId(agentId);
    const specific = specificOptionsFor(id);
    if (specific.requireScopedApiKey !== true) return;
    if (String(specific.apiKey || "").trim()) return;
    throw Object.assign(new Error(`A dedicated Douyin API key is required for ${id}`), {
      code: "DOUYIN_AGENT_API_KEY_REQUIRED",
      statusCode: 503,
      details: { agentId: id }
    });
  }

  function keyFingerprint(agentId) {
    const specific = specificOptionsFor(agentId);
    const options = optionsFor(agentId);
    const apiKey = String(specific.requireScopedApiKey === true
      ? (specific.apiKey || "")
      : (options.apiKey || process.env.BYERING_DOUYIN_MCP_API_KEY || "")).trim();
    return apiKey ? createHash("sha256").update(apiKey).digest("hex") : null;
  }

  function effectiveKeyFingerprint(agentId, record = recordFor(agentId)) {
    if (record?.providerKeyFingerprint) return record.providerKeyFingerprint;
    return hasSpecificOptions(agentId) ? null : keyFingerprint(agentId);
  }

  function effectiveSessionId(agentId, record = recordFor(agentId)) {
    if (!record?.sessionId) return null;
    const currentFingerprint = keyFingerprint(agentId);
    if (!record.providerKeyFingerprint && hasSpecificOptions(agentId)) return null;
    if (record.providerKeyFingerprint && record.providerKeyFingerprint !== currentFingerprint) return null;
    return record.sessionId;
  }

  function needsKeyMigration(agentId, record) {
    const currentFingerprint = keyFingerprint(agentId);
    if (!record?.sessionId || !currentFingerprint) return false;
    if (hasSpecificOptions(agentId) && !record.providerKeyFingerprint) return true;
    return Boolean(record.providerKeyFingerprint && record.providerKeyFingerprint !== currentFingerprint);
  }

  function assertAgentIsolation(agentId, scope = {}) {
    const id = normalizeAgentId(agentId);
    assertScopedApiKey(id);
    const currentKey = keyFingerprint(id);
    const currentSession = effectiveSessionId(id, recordFor(id, scope));
    const keyOwner = conflictOwner(id, scope, (other) => {
      const otherKey = effectiveKeyFingerprint(other.agentId, other);
      const otherSession = effectiveSessionId(other.agentId, other);
      return Boolean(currentKey && otherKey && currentKey === otherKey && (otherSession || other.status === "starting"));
    });
    if (keyOwner && keyOwner.agentId !== id) {
      throw Object.assign(new Error(`Douyin API key is already assigned to ${keyOwner.agentId}; configure a separate API key for ${id}`), {
          code: "DOUYIN_AGENT_API_KEY_SHARED",
          statusCode: 409,
          details: { agentId: id, ownerAgentId: keyOwner.agentId }
        });
    }
    const sessionOwner = conflictOwner(id, scope, (other) => {
      const otherSession = effectiveSessionId(other.agentId, other);
      return Boolean(currentSession && otherSession && currentSession === otherSession);
    }, { includeSameAgent: true });
    if (sessionOwner && !isHistoricalSessionOwner(id, scope, currentSession)) {
      throw Object.assign(new Error(`Douyin session is already assigned to ${sessionOwner.agentId}`), {
          code: "DOUYIN_AGENT_SESSION_SHARED",
        statusCode: 409,
        details: { agentId: id, ownerAgentId: sessionOwner.agentId, sessionId: currentSession }
      });
    }
  }

  // Earlier versions incorrectly keyed records by Agent only, so a few saved
  // states can contain two legacy Agents sharing one cloud session. The oldest
  // historical owner may stop and replace that session once; every scoped
  // record remains strictly isolated.
  function isHistoricalSessionOwner(agentId, scope, sessionId) {
    if (!sessionId) return false;
    const id = normalizeAgentId(agentId);
    const ownKey = recordEntry(id, scope).key;
    const entries = Object.entries(state.agents)
      .filter(([key, record]) => key === record?.agentId && !record?.bindingKey
        && effectiveSessionId(record.agentId, record) === sessionId);
    if (entries.length < 2 || !entries.some(([key]) => key === ownKey)) return false;
    entries.sort(([, left], [, right]) => {
      const leftTime = recordOwnershipTime(left);
      const rightTime = recordOwnershipTime(right);
      if (leftTime !== rightTime) return leftTime - rightTime;
      return String(left.agentId).localeCompare(String(right.agentId));
    });
    return entries[0]?.[1]?.agentId === id;
  }

  function assertSessionAvailable(agentId, scope, sessionId) {
    const owner = conflictOwner(agentId, scope, (other) => effectiveSessionId(other.agentId, other) === sessionId, { includeSameAgent: true });
    if (!owner) return;
    throw Object.assign(new Error(`Douyin session is already assigned to ${owner.agentId}`), {
      code: "DOUYIN_AGENT_SESSION_SHARED",
      statusCode: 409,
      details: { agentId: normalizeAgentId(agentId), ownerAgentId: owner.agentId, sessionId }
    });
  }

  function conflictOwner(agentId, scope, predicate, { includeSameAgent = false } = {}) {
    const id = normalizeAgentId(agentId);
    const ownEntry = recordEntry(id, scope);
    const ownKeys = new Set([ownEntry.key, ownEntry.sourceKey].filter(Boolean));
    const candidates = Object.entries(state.agents)
      .filter(([key, record]) => !ownKeys.has(key) && record && (includeSameAgent || (record.agentId || "") !== id) && predicate(record))
      .map(([, record]) => record);
    if (!includeSameAgent) {
      const current = recordFor(id, scope);
      if (current && predicate(current)) candidates.push(current);
    }
    candidates.sort((left, right) => {
      const leftTime = recordOwnershipTime(left);
      const rightTime = recordOwnershipTime(right);
      if (leftTime !== rightTime) return leftTime - rightTime;
      return String(left.agentId).localeCompare(String(right.agentId));
    });
    return candidates[0] || null;
  }

  function serviceFor(agentId, scope = {}) {
    const id = normalizeAgentId(agentId);
    assertScopedApiKey(id);
    const entry = recordEntry(id, scope);
    const key = entry.key;
    if (services.has(key)) return services.get(key);
    const record = entry.record;
    const options = optionsFor(id);
    const sessionId = effectiveSessionId(id, record);
    const service = createService({ ...options, ...(sessionId ? { sessionId } : {}) });
    services.set(key, service);
    return service;
  }

  function start(agentId, options = {}) {
    const id = normalizeAgentId(agentId);
    const { billingPlan = "monthly" } = options;
    const scope = normalizeScope(options);
    const key = recordEntry(id, scope).key;
    assertAgentIsolation(id, scope);
    const inFlight = starts.get(key);
    if (inFlight) return inFlight;
    const service = serviceFor(id, scope);
    const existing = recordFor(id, scope);
    const provisioningRequestId = existing?.status === "starting" && existing?.provisioningRequestId
      ? existing.provisioningRequestId
      : randomUUID();
    storeRecord(id, scope, {
      ...(existing || {}),
      agentId: id,
      billingPlan,
      provisioningRequestId,
      providerKeyFingerprint: keyFingerprint(id),
      ownershipAt: existing?.ownershipAt || existing?.startedAt || existing?.updatedAt || new Date(Number(now())).toISOString(),
      status: "starting",
      lastError: null,
      startedAt: existing?.status === "starting" && existing?.startedAt ? existing.startedAt : new Date(Number(now())).toISOString(),
      updatedAt: new Date(Number(now())).toISOString()
    });
    flush(target, state);
    const operation = (async () => {
      try {
        let result = await service.start({ billingPlan, reqId: provisioningRequestId });
        if (starts.get(key) !== operation) {
          const timeout = provisioningTimeoutError(recordFor(id, scope) || existing);
          throw Object.assign(new Error(timeout.message), timeout);
        }
        assertResult(result, "Douyin cloud session failed to start");
        const sessionId = service.getSessionId?.() || result?.session_id || result?.sessionId || existing?.sessionId || null;
        if (!sessionId) throw Object.assign(new Error("Douyin start did not return a session_id"), { code: "DOUYIN_SESSION_ID_MISSING", statusCode: 502 });
        assertSessionAvailable(id, scope, sessionId);
        if (isRemoteErrorStatus(result) && sessionId && typeof service.waitForRemoteRecovery === "function") {
          const recovered = await service.waitForRemoteRecovery({ timeoutMs: recoveryTimeoutMs });
          if (typeof service.probeRemoteStatus === "function") {
            const recoveredStatus = await service.probeRemoteStatus();
            if (recoveredStatus?.ok !== false) result = { ...result, ...recoveredStatus, session_id: sessionId };
          }
        }
        if (isRemoteErrorStatus(result)) {
          const stuck = isStaleStartCommand(result);
          throw Object.assign(new Error(stuck
            ? "云端启动队列已卡住，普通重连无法恢复。请重新授权以创建新的云电脑实例"
            : "云电脑启动后仍处于异常状态，请重新连接"), {
            code: stuck ? "DOUYIN_CLOUD_START_STUCK" : "DOUYIN_CLOUD_OFFLINE",
            statusCode: 503,
            details: {
              displayState: result.display_state || result.displayState || "error",
              workerOnline: result?.worker?.online === true,
              commandState: result?.login_check?.command_state || result?.loginCheck?.commandState || null,
              action: stuck ? "reauthorize" : "restart"
            }
          });
        }
        const providerStarting = isProviderStartupPending(result);
        const stored = storeRecord(id, scope, {
          ...(recordFor(id, scope) || {}),
          agentId: id,
          sessionId,
          providerKeyFingerprint: keyFingerprint(id),
          billingPlan,
          status: providerStarting ? "starting" : "online",
          lastError: null,
          updatedAt: new Date(Number(now())).toISOString()
        });
        flush(target, state);
        return { ...result, agentId: id, sessionId, accountId: stored.accountId || null };
      } catch (error) {
        const current = recordFor(id, scope);
        const currentOperation = starts.get(key) === operation;
        const timedOut = current?.lastError?.code === "DOUYIN_PROVISIONING_TIMEOUT";
        if (currentOperation && !timedOut && current) {
          const transient = !current.sessionId && isTransientStatusFailure(error);
          storeRecord(id, scope, transient
            ? {
                ...current,
                agentId: id,
                status: "starting",
                lastError: null,
                lastTransientError: serializeError(error),
                updatedAt: new Date(Number(now())).toISOString()
              }
            : {
                ...current,
                agentId: id,
                status: "error",
                lastError: serializeError(error),
                updatedAt: new Date(Number(now())).toISOString()
              });
          flush(target, state);
        }
        throw error;
      } finally {
        if (starts.get(key) === operation) starts.delete(key);
      }
    })();
    starts.set(key, operation);
    return operation;
  }

  async function resume(agentId, scope = {}) {
    const id = normalizeAgentId(agentId);
    const normalizedScope = normalizeScope(scope);
    const key = recordEntry(id, normalizedScope).key;
    assertAgentIsolation(id, normalizedScope);
    const record = recordFor(id, normalizedScope);
    if (starts.has(key)) {
      if (provisioningTimedOut(record)) return expireInFlightStart(id, normalizedScope, record);
      return startingSnapshot(id, record);
    }
    if (record?.status === "starting" && !record?.sessionId) {
      if (provisioningTimedOut(record)) return markProvisioningTimeout(id, normalizedScope, record);
      return startingSnapshot(id, record);
    }
    if (!record?.sessionId) return { ok: true, state: "NOT_STARTED", agentId: id, sessionId: null };
    const service = serviceFor(id, normalizedScope);
    const result = service.isStarted ? await service.status() : await service.resume();
    assertResult(result, "Saved Douyin cloud session could not be resumed");
    return applyRemoteStatus(id, normalizedScope, record, result);
  }

  function applyRemoteStatus(agentId, scope, record, result) {
    const id = normalizeAgentId(agentId);
    const provisioning = isProvisioningStatus(result);
    if (provisioningTimedOut(record, provisioning)) return markProvisioningTimeout(id, scope, record);
    const identity = extractAccountIdentity(result);
    const staleStart = isStaleStartCommand(result);
    const remoteError = isRemoteErrorStatus(result)
      ? {
          code: staleStart ? "DOUYIN_CLOUD_START_STUCK" : "DOUYIN_CLOUD_OFFLINE",
          message: staleStart
            ? "云端启动队列已卡住，需要重新授权并创建新的云电脑实例"
            : "云电脑当前处于异常状态，请重新连接后再继续",
          details: {
            displayState: result.display_state || result.displayState || "error",
            workerOnline: result?.worker?.online === true,
            commandState: result?.login_check?.command_state || result?.loginCheck?.commandState || null,
            action: staleStart ? "reauthorize" : "restart"
          }
        }
      : null;
    const stored = storeRecord(id, scope, {
      ...record,
      providerKeyFingerprint: record?.providerKeyFingerprint || keyFingerprint(id),
      status: provisioning ? "starting" : remoteError ? "error" : "online",
      lastError: provisioning ? null : remoteError,
      ...(identity ? { accountIdentity: identity, accountLabel: identity.accountName || record.accountLabel || null } : {}),
      updatedAt: new Date(Number(now())).toISOString()
    });
    flush(target, state);
    return { ...result, agentId: id, sessionId: stored.sessionId, accountId: stored.accountId || null };
  }

  async function restart(agentId, options = {}) {
    const id = normalizeAgentId(agentId);
    const { billingPlan = "monthly" } = options;
    const scope = normalizeScope(options);
    const key = recordEntry(id, scope).key;
    assertAgentIsolation(id, scope);
    const inFlight = starts.get(key);
    const record = recordFor(id, scope);
    if (inFlight) {
      if (provisioningTimedOut(record)) await expireInFlightStart(id, scope, record);
      else await inFlight.catch(() => {});
    }
    const current = recordFor(id, scope);
    const service = serviceFor(id, scope);
    if (current?.sessionId && typeof service.stop !== "function") {
      throw Object.assign(new Error("Douyin MCP adapter does not support stopping a stuck session"), {
        code: "DOUYIN_MCP_STOP_UNAVAILABLE",
        statusCode: 503
      });
    }
    if (current?.sessionId) {
      const stopped = await service.stop({ reqId: `douyin-restart:${randomUUID()}` });
      assertResult(stopped, "停止旧 Douyin 会话失败");
      if (typeof service.waitForRemoteStop === "function") {
        const stoppedRemotely = await service.waitForRemoteStop({ timeoutMs: 60000 });
        if (!stoppedRemotely) {
          throw Object.assign(new Error("旧 Douyin 云电脑 Worker 未在超时前停止"), {
            code: "DOUYIN_CLOUD_STOP_TIMEOUT",
            statusCode: 503
          });
        }
      }
    }
    return start(id, { ...scope, billingPlan });
  }

  async function reauthorize(agentId, options = {}) {
    const id = normalizeAgentId(agentId);
    const { confirm = "", reason = "user_requested" } = options;
    const scope = normalizeScope(options);
    const key = recordEntry(id, scope).key;
    assertAgentIsolation(id, scope);
    if (String(confirm).trim() !== "UNSUBSCRIBE") {
      throw Object.assign(new Error("重新授权前需要确认会清除当前云电脑和抖音登录态"), {
        code: "DOUYIN_UNSUBSCRIBE_CONFIRMATION_REQUIRED",
        statusCode: 400
      });
    }
    const service = serviceFor(id, scope);
    const record = recordFor(id, scope);
    if (typeof service.unsubscribe !== "function") {
      throw Object.assign(new Error("Douyin MCP adapter does not support reauthorization"), {
        code: "DOUYIN_MCP_UNSUBSCRIBE_UNAVAILABLE",
        statusCode: 503
      });
    }
    const result = await service.unsubscribe({
      confirm: "UNSUBSCRIBE",
      reason,
      reqId: `douyin-reauthorize:${randomUUID()}`
    });
    assertResult(result, "清除旧 Douyin 云电脑会话失败");
    await service.close?.();
    starts.delete(key);
    services.delete(key);
    storeRecord(id, scope, {
      ...(record || {}),
      agentId: id,
      sessionId: null,
      status: "error",
      accountIdentity: null,
      accountLabel: null,
      lastError: {
        code: "DOUYIN_REAUTHORIZATION_REQUIRED",
        message: "旧云电脑已清除，请重新启动并完成抖音登录"
      },
      updatedAt: new Date(Number(now())).toISOString()
    });
    flush(target, state);
    return { ...result, agentId: id, sessionId: null, state: "UNSUBSCRIBED", reauthorizationRequired: true };
  }

  async function status(agentId, options = {}) {
    const id = normalizeAgentId(agentId);
    const { resumeSaved = true } = options;
    const scope = normalizeScope(options);
    const key = recordEntry(id, scope).key;
    assertAgentIsolation(id, scope);
    const record = recordFor(id, scope);
    if (starts.has(key)) {
      if (provisioningTimedOut(record)) return expireInFlightStart(id, scope, record);
      return startingSnapshot(id, record);
    }
    if (record?.status === "starting" && !record?.sessionId) {
      if (provisioningTimedOut(record)) return markProvisioningTimeout(id, scope, record);
      if (resumeSaved) void start(id, { ...scope, billingPlan: record.billingPlan || "monthly" }).catch(() => {});
      return startingSnapshot(id, record);
    }
    if (record?.sessionId && needsKeyMigration(id, record)) {
      const error = {
        code: "DOUYIN_AGENT_KEY_ROTATED",
        message: "该账号的云电脑执行凭据已更换，旧会话已停止，请重新启动云电脑。"
      };
      storeRecord(id, scope, {
        ...record,
        sessionId: null,
        status: "error",
        lastError: error,
        updatedAt: new Date(Number(now())).toISOString()
      });
      flush(target, state);
      return { ok: false, state: "NOT_STARTED", display_state: "error", provisioning: false, agentId: id, sessionId: null, error };
    }
    const recoverableError = [
      "DOUYIN_CLOUD_OFFLINE",
      "DOUYIN_PROVISIONING_TIMEOUT",
      "DOUYIN_MCP_TIMEOUT",
      "DOUYIN_MCP_WORKER_EXITED",
      "DOUYIN_REMOTE_STATUS_TIMEOUT",
      "DOUYIN_REMOTE_STATUS_NETWORK"
    ].includes(record?.lastError?.code);
    if (record?.status === "error" && record.lastError && (!record.sessionId || !recoverableError)) {
      return {
        ok: false,
        state: "ERROR",
        display_state: "error",
        provisioning: false,
        agentId: id,
        sessionId: record.sessionId || null,
        error: { ...record.lastError }
      };
    }
    const service = serviceFor(id, scope);
    if (record?.sessionId && typeof service.probeRemoteStatus === "function") {
      const remote = await service.probeRemoteStatus();
      if (remote?.ok === false) {
        if (resumeSaved) {
          try {
            return await resume(id, scope);
          } catch (error) {
            if (!isTransientStatusFailure(error) && !isTransientStatusFailure(remote)) throw error;
          }
        }
        return connectingSnapshot(id, record, remote.error || null);
      }
      return applyRemoteStatus(id, scope, record, remote);
    }
    if (resumeSaved && record?.sessionId) return resume(id, scope);
    const result = await service.status();
    return { ...result, agentId: id, sessionId: record?.sessionId || service.getSessionId?.() || null };
  }

  function getService(agentId, scope = {}) { return serviceFor(agentId, scope); }

  function get(agentId, scope = {}) {
    const record = recordFor(agentId, scope);
    return record ? { ...record, accountIdentity: record.accountIdentity ? { ...record.accountIdentity } : null } : null;
  }

  function adopt(agentId, { fromAgentIds = [], ...scope } = {}) {
    const id = normalizeAgentId(agentId);
    const normalizedScope = normalizeScope(scope);
    const targetEntry = recordEntry(id, normalizedScope);
    const candidates = [...new Set((Array.isArray(fromAgentIds) ? fromAgentIds : [])
      .map((legacyId) => normalizeAgentId(legacyId))
      .filter((legacyId) => legacyId && legacyId !== id))]
      .map((legacyId) => recordEntry(legacyId, normalizedScope))
      .filter((entry) => entry.record);
    const records = [targetEntry, ...candidates].filter((entry) => entry.record);
    if (!records.length) return null;

    const sessionIds = new Set(records.map(({ record }) => record.sessionId).filter(Boolean));
    if (sessionIds.size > 1) {
      throw Object.assign(new Error("同一抖音账号存在多个历史云电脑会话，请先在实时工作中确认并保留一个会话"), {
        code: "DOUYIN_ACCOUNT_CLOUD_MIGRATION_CONFLICT",
        statusCode: 409,
        details: { agentId: id, legacyAgentIds: records.map(({ record }) => record.agentId), sessionIds: [...sessionIds] }
      });
    }

    const targetKey = targetEntry.key;
    const requiresMigration = candidates.length > 0 || targetEntry.sourceKey !== targetKey;
    if (!requiresMigration) {
      return {
        ...targetEntry.record,
        accountIdentity: targetEntry.record.accountIdentity ? { ...targetEntry.record.accountIdentity } : null
      };
    }

    // Prefer a healthy legacy carrier over a stale canonical error. Earlier
    // releases wrote product-scoped records and the canonical record can keep
    // a DOUYIN_AGENT_API_KEY_SHARED error even though both records represent
    // the same account session.
    records.sort((left, right) => {
      const rank = (record) => {
        if (record.status === "online") return 0;
        if (record.sessionId && !record.lastError) return 1;
        if (record.sessionId) return 2;
        return 3;
      };
      const rankDelta = rank(left.record) - rank(right.record);
      if (rankDelta) return rankDelta;
      return recordOwnershipTime(left.record) - recordOwnershipTime(right.record);
    });
    const source = records[0];
    const stored = storeRecord(id, normalizedScope, {
      ...(targetEntry.record || {}),
      ...source.record,
      agentId: id,
      bindingKey: targetKey,
      lastError: source.record.status === "online"
        ? null
        : (source.record.lastError || targetEntry.record?.lastError || null),
      migratedFromAgentId: source.record.agentId,
      migratedAt: new Date(Number(now())).toISOString()
    });

    const migrationEntries = [targetEntry, ...candidates];
    for (const entry of migrationEntries) {
      const sourceKey = entry.sourceKey || entry.key;
      if (sourceKey !== targetKey) delete state.agents[sourceKey];
      const sourceService = services.get(sourceKey);
      if (sourceService && sourceKey !== targetKey) {
        services.delete(sourceKey);
        if (!services.has(targetKey)) services.set(targetKey, sourceService);
      }
      const sourceStart = starts.get(sourceKey);
      if (sourceStart && sourceKey !== targetKey) {
        starts.delete(sourceKey);
        if (!starts.has(targetKey)) starts.set(targetKey, sourceStart);
      }
    }
    flush(target, state);
    return { ...stored, accountIdentity: stored.accountIdentity ? { ...stored.accountIdentity } : null };
  }

  function list() { return Object.values(state.agents).map((record) => ({ ...record })); }

  function refreshAccountIdentity(agentId, scope = {}, accountIdentity = {}) {
    const id = normalizeAgentId(agentId);
    const entry = recordEntry(id, scope);
    if (!entry.record) return null;
    const patch = accountIdentity && typeof accountIdentity === "object" ? accountIdentity : {};
    const nextIdentity = {
      ...(entry.record.accountIdentity || {}),
      ...patch
    };
    const stored = {
      ...entry.record,
      accountIdentity: nextIdentity,
      accountLabel: nextIdentity.accountName || nextIdentity.nickname || entry.record.accountLabel || null,
      updatedAt: new Date(Number(now())).toISOString()
    };
    state.agents[entry.sourceKey] = stored;
    flush(target, state);
    return { ...stored, accountIdentity: { ...nextIdentity } };
  }

  async function forget(agentId, scope = {}) {
    const id = normalizeAgentId(agentId);
    const key = recordEntry(id, scope).key;
    starts.delete(key);
    const service = services.get(key);
    service?.close?.();
    services.delete(key);
    delete state.agents[key];
    flush(target, state);
  }

  return {
    configured: Boolean(serviceOptions.apiKey
      || process.env.BYERING_DOUYIN_MCP_API_KEY
      || Object.keys(process.env).some((name) => /^BYERING_DOUYIN_MCP_API_KEY_[A-Z0-9_]+$/.test(name) && process.env[name])
      || Object.values(state.agents).some((record) => keyFingerprint(record?.agentId))),
    stateFile: target,
    start,
    resume,
    status,
    restart,
    reauthorize,
    getService,
    get,
    adopt,
    list,
    refreshAccountIdentity,
    forget
  };
}

function isRemoteErrorStatus(status = {}) {
  const display = String(status.display_state || status.displayState || "").toLowerCase();
  const session = String(status.session_state || status.sessionState || "").toLowerCase();
  return display === "error"
    || display === "stopped"
    || session === "stopped"
    || status.error?.code === "DOUYIN_CLOUD_OFFLINE";
}

function isStaleStartCommand(status = {}) {
  const commandState = String(status?.login_check?.command_state || status?.loginCheck?.commandState || "").toLowerCase();
  return commandState === "already_pending" && status?.worker?.online === false;
}

function isProvisioningStatus(status = {}) {
  const state = String(status.state || "").toUpperCase();
  const display = String(status.display_state || status.displayState || "").toLowerCase();
  const session = String(status.session_state || status.sessionState || "").toLowerCase();
  return status.provisioning === true
    || state === "STARTING"
    || ["starting", "provisioning", "initializing", "booting"].includes(display)
    || session === "starting";
}

function isProviderStartupPending(status = {}) {
  if (isProvisioningStatus(status)) return true;
  const wait = status.start_wait || status.startWait;
  return wait?.resolved === false || wait?.event_received === false;
}

function startingSnapshot(agentId, record = null) {
  const sessionId = record?.sessionId || null;
  return {
    ok: true,
    agentId,
    sessionId,
    state: sessionId ? "CONNECTING" : "STARTING",
    session_state: "starting",
    display_state: sessionId ? "connecting" : "starting",
    login_state: "unknown",
    provisioning: !sessionId,
    provisioningRequestId: record?.provisioningRequestId || null,
    startedAt: record?.startedAt || record?.updatedAt || null,
    updatedAt: record?.updatedAt || null,
    worker: { online: false },
    message_mode: "not_started"
  };
}

function connectingSnapshot(agentId, record = null, error = null) {
  return {
    ok: true,
    state: "CONNECTING",
    session_state: "starting",
    display_state: "connecting",
    provisioning: false,
    agentId,
    sessionId: record?.sessionId || null,
    worker: { online: false },
    error
  };
}

function isTransientStatusFailure(value) {
  const error = value?.error || value;
  const code = String(error?.code || "").toLowerCase();
  const message = String(error?.message || value?.message || "").toLowerCase();
  return [
    "network_error",
    "douyin_remote_status_network",
    "douyin_remote_status_timeout",
    "douyin_remote_network",
    "douyin_remote_timeout",
    "douyin_mcp_timeout",
    "douyin_mcp_worker_exited"
  ].includes(code)
    || /read operation timed out|timed out|timeout|transport closed|connection reset|temporarily unavailable|unexpected_eof|eof/.test(message);
}

function recordOwnershipTime(record) {
  for (const field of ["ownershipAt", "createdAt", "startedAt", "updatedAt"]) {
    const timestamp = Date.parse(record?.[field] || "");
    if (Number.isFinite(timestamp)) return timestamp;
  }
  return Number.POSITIVE_INFINITY;
}

function loadState(filePath) {
  if (!existsSync(filePath)) return { version: SNAPSHOT_VERSION, agents: {} };
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8"));
    if (parsed?.version !== SNAPSHOT_VERSION || !parsed.agents || typeof parsed.agents !== "object" || Array.isArray(parsed.agents)) throw new Error("invalid snapshot");
    return parsed;
  } catch (cause) {
    throw Object.assign(new Error("Douyin Agent cloud registry is not valid JSON"), { code: "DOUYIN_AGENT_CLOUD_STATE_CORRUPT", cause });
  }
}

function flush(filePath, state) {
  const temporary = `${filePath}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(state)}\n`, { encoding: "utf8", mode: 0o600 });
  renameSync(temporary, filePath);
}

function normalizeAgentId(value) {
  const id = String(value || "").trim();
  if (!id || !/^[a-zA-Z0-9._:-]{1,120}$/.test(id)) throw Object.assign(new Error("agentId is required"), { code: "DOUYIN_AGENT_ID_REQUIRED", statusCode: 400 });
  return id;
}

function valueOf(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function extractAccountIdentity(status) {
  const account = status?.account && typeof status.account === "object" ? status.account : null;
  if (!account) return null;
  const identity = account.identity && typeof account.identity === "object" ? account.identity : account;
  const accountName = identity.accountName || identity.account_name || account.name || null;
  const uniqueId = identity.uniqueId || identity.unique_id || identity.douyinId || identity.douyin_id || null;
  const uid = identity.uid || identity.userId || identity.user_id || null;
  const secId = identity.secId || identity.sec_id || identity.secUid || identity.sec_uid || null;
  const profileUrl = identity.profileUrl || identity.profile_url || null;
  if (!accountName && !uniqueId && !uid && !secId && !profileUrl) return null;
  return { ...identity, ...(accountName ? { accountName } : {}), ...(uniqueId ? { uniqueId } : {}), ...(uid ? { uid } : {}), ...(secId ? { secId } : {}), ...(profileUrl ? { profileUrl } : {}) };
}

function assertResult(result, fallback) {
  if (result?.ok === false) {
    const upstream = result.error || {};
    throw Object.assign(new Error(upstream.message || fallback), { code: upstream.code || "DOUYIN_MCP_OPERATION_FAILED", statusCode: upstream.statusCode || 502, details: upstream });
  }
}

function serializeError(error) {
  return {
    code: error?.code || "DOUYIN_MCP_OPERATION_FAILED",
    message: error?.message || "Douyin cloud session failed to start"
  };
}
