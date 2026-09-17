import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, openSync, closeSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { createHash, randomUUID } from "node:crypto";
import { normalizeReception } from "../src/salebuddy/agents/account-reception.js";

export function receptionAccountKeys(account = {}) {
  return [...new Set([account.uid, account.user_id, account.userId, account.secUid, account.sec_uid, account.secId, account.sec_id].filter(value => value != null && String(value).trim()).map(String))];
}

function emptyPrivateReception() {
  return {
    enabled: false,
    enabledAt: null,
    agentIds: [],
    activeAgentId: null,
    runtimeState: "stopped",
    runtimeUpdatedAt: null
  };
}

function normalizePrivateReception(value = {}) {
  const agentIds = [...new Set((Array.isArray(value.agentIds) ? value.agentIds : [])
    .map(agentId => String(agentId || "").trim())
    .filter(Boolean))];
  const enabledAt = value.enabledAt ? String(value.enabledAt) : null;
  const activeAgentId = String(value.activeAgentId || "").trim() || null;
  const runtimeState = value.runtimeState === "running" ? "running" : "stopped";
  const runtimeUpdatedAt = value.runtimeUpdatedAt ? String(value.runtimeUpdatedAt) : null;
  return {
    enabled: value.enabled === true || Boolean(enabledAt),
    enabledAt,
    agentIds,
    activeAgentId,
    runtimeState,
    runtimeUpdatedAt
  };
}

function emptyRecord() {
  return {
    revision: 0,
    settings: normalizeReception(),
    privateReception: emptyPrivateReception(),
    conversations: {},
    deliveries: {},
    updatedAt: null
  };
}

export function createAccountReceptionStore({ stateFile = join(homedir(), ".byering", "account-reception.json"), now = () => Date.now() } = {}) {
  mkdirSync(dirname(stateFile), { recursive: true });
  const read = () => existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, "utf8")) : { accounts: {}, aliases: {} };
  const key = (tenant, id) => createHash("sha256").update(JSON.stringify([tenant || "local", id])).digest("hex");
  function resolve(data, owner) {
    const aliases = receptionAccountKeys(owner.account).map(id => key(owner.tenantId, id));
    if (!aliases.length) throw Object.assign(new Error("缺少可确认的抖音账号身份"), { code: "RECEPTION_ACCOUNT_REQUIRED", statusCode: 400 });
    const matched = [...new Set(aliases.map(alias => data.aliases[alias]).filter(Boolean))];
    if (matched.length > 1) throw Object.assign(new Error("账号身份存在冲突，请先核对账号"), { code: "RECEPTION_ACCOUNT_CONFLICT", statusCode: 409 });
    return { id: matched[0] || aliases[0], aliases };
  }
  function mutate(owner, operation) {
    let descriptor;
    try { descriptor = openSync(`${stateFile}.lock`, "wx", 0o600); }
    catch (error) {
      if (error.code === "EEXIST") {
        let pid; try { pid = Number(readFileSync(`${stateFile}.lock`, "utf8")); } catch { /* another writer may be releasing */ }
        if (Number.isInteger(pid) && pid > 0) {
          try { process.kill(pid, 0); }
          catch (probe) { if (probe.code === "ESRCH") { try { unlinkSync(`${stateFile}.lock`); } catch { /* reclaimed concurrently */ } return mutate(owner, operation); } }
        }
      }
      throw Object.assign(new Error("接待配置正在保存，请稍后重试"), { code: "RECEPTION_BUSY", statusCode: 503, cause: error });
    }
    writeFileSync(descriptor, String(process.pid));
    try {
      const data = read(); const { id, aliases } = resolve(data, owner);
      data.accounts[id] ||= emptyRecord();
      data.accounts[id].privateReception = normalizePrivateReception(data.accounts[id].privateReception);
      aliases.forEach(alias => { data.aliases[alias] = id; });
      const result = operation(data.accounts[id]);
      const temp = `${stateFile}.${randomUUID()}.tmp`; writeFileSync(temp, JSON.stringify(data), { mode: 0o600 }); renameSync(temp, stateFile);
      return structuredClone(result);
    } finally { closeSync(descriptor); unlinkSync(`${stateFile}.lock`); }
  }
  const record = owner => {
    const data = read();
    const current = data.accounts[resolve(data, owner).id];
    return current ? { ...current, privateReception: normalizePrivateReception(current.privateReception) } : emptyRecord();
  };
  const publicRecord = rec => ({
    revision: rec.revision,
    settings: rec.settings,
    updatedAt: rec.updatedAt || null,
    privateReception: normalizePrivateReception(rec.privateReception)
  });
  const normalizeConversation = (value = {}) => {
    const source = value && typeof value === "object" ? value : {};
    const mode = ["auto", "human", "closed", "done"].includes(source.mode) ? source.mode : "auto";
    const history = Array.isArray(source.history)
      ? source.history
        .filter(entry => entry && typeof entry === "object" && String(entry.content || "").trim())
        .map(entry => ({
          ...entry,
          role: ["user", "assistant", "human", "system"].includes(entry.role) ? entry.role : "user",
          content: String(entry.content).trim().slice(0, 4000),
          at: entry.at || null
        }))
        .slice(-50)
      : [];
    return {
      ...source,
      mode,
      history,
      name: String(source.name || "").trim(),
      conversationId: String(source.conversationId || "").trim() || null,
      secUid: String(source.secUid || "").trim() || null,
      secId: String(source.secId || "").trim() || null,
      handoffReason: String(source.handoffReason || "").trim() || null,
      lastMessage: String(source.lastMessage || "").trim().slice(0, 1000) || null,
      handoffAt: source.handoffAt || null,
      resumedAt: source.resumedAt || null,
      humanLastSentAt: source.humanLastSentAt || null,
      updatedAt: source.updatedAt || null
    };
  };
  const conversation = (owner, customer) => normalizeConversation(record(owner).conversations[customer]);
  return {
    get: owner => structuredClone(publicRecord(record(owner))),
    accountKey: owner => resolve(read(), owner).id,
    save(owner, settings, expectedRevision) {
      const normalized = normalizeReception(settings);
      return mutate(owner, rec => {
        if (expectedRevision !== rec.revision) throw Object.assign(new Error("配置已在其他页面更新，请重新读取"), { code: "RECEPTION_VERSION_CONFLICT", statusCode: 409 });
        rec.settings = normalized; rec.revision++; rec.updatedAt = new Date(now()).toISOString(); return publicRecord(rec);
      });
    },
    enablePrivateReception(owner, { agentId } = {}) {
      const normalizedAgentId = String(agentId || "").trim();
      if (!normalizedAgentId) throw Object.assign(new Error("缺少私信承接 Agent"), { code: "PRIVATE_RECEPTION_AGENT_REQUIRED", statusCode: 400 });
      return mutate(owner, rec => {
        const current = normalizePrivateReception(rec.privateReception);
        rec.privateReception = {
          enabled: true,
          enabledAt: current.enabledAt || new Date(now()).toISOString(),
          agentIds: [...new Set([...current.agentIds, normalizedAgentId])],
          activeAgentId: normalizedAgentId,
          runtimeState: "running",
          runtimeUpdatedAt: new Date(now()).toISOString()
        };
        return publicRecord(rec);
      });
    },
    claimPrivateReception(owner, { agentId, takeover = false } = {}) {
      const normalizedAgentId = String(agentId || "").trim();
      if (!normalizedAgentId) throw Object.assign(new Error("缺少私信承接 Agent"), { code: "PRIVATE_RECEPTION_AGENT_REQUIRED", statusCode: 400 });
      return mutate(owner, rec => {
        const current = normalizePrivateReception(rec.privateReception);
        const previousOwnerAgentId = current.activeAgentId;
        if (current.runtimeState === "running" && previousOwnerAgentId && previousOwnerAgentId !== normalizedAgentId && takeover !== true) {
          return {
            claimed: false,
            ownerAgentId: previousOwnerAgentId,
            canTakeover: true,
            privateReception: publicRecord(rec).privateReception
          };
        }
        rec.privateReception = {
          enabled: true,
          enabledAt: current.enabledAt || new Date(now()).toISOString(),
          agentIds: [...new Set([...current.agentIds, normalizedAgentId])],
          activeAgentId: normalizedAgentId,
          runtimeState: "running",
          runtimeUpdatedAt: new Date(now()).toISOString()
        };
        return {
          claimed: true,
          ownerAgentId: normalizedAgentId,
          previousOwnerAgentId: previousOwnerAgentId && previousOwnerAgentId !== normalizedAgentId ? previousOwnerAgentId : null,
          privateReception: publicRecord(rec).privateReception
        };
      });
    },
    configurePrivateReception(owner, { agentId } = {}) {
      const normalizedAgentId = String(agentId || "").trim();
      if (!normalizedAgentId) throw Object.assign(new Error("缺少私信承接 Agent"), { code: "PRIVATE_RECEPTION_AGENT_REQUIRED", statusCode: 400 });
      return mutate(owner, rec => {
        const current = normalizePrivateReception(rec.privateReception);
        rec.privateReception = {
          enabled: true,
          enabledAt: current.enabledAt || new Date(now()).toISOString(),
          agentIds: [...new Set([...current.agentIds, normalizedAgentId])],
          activeAgentId: current.activeAgentId,
          runtimeState: current.runtimeState,
          runtimeUpdatedAt: current.runtimeUpdatedAt
        };
        return publicRecord(rec);
      });
    },
    stopPrivateReception(owner, { agentId } = {}) {
      const normalizedAgentId = String(agentId || "").trim();
      return mutate(owner, rec => {
        const current = normalizePrivateReception(rec.privateReception);
        if (normalizedAgentId && current.activeAgentId && current.activeAgentId !== normalizedAgentId) {
          return publicRecord(rec);
        }
        rec.privateReception = {
          enabled: current.enabled,
          enabledAt: current.enabledAt,
          agentIds: normalizedAgentId ? [...new Set([...current.agentIds, normalizedAgentId])] : current.agentIds,
          activeAgentId: normalizedAgentId ? null : current.activeAgentId,
          runtimeState: "stopped",
          runtimeUpdatedAt: new Date(now()).toISOString()
        };
        return publicRecord(rec);
      });
    },
    conversation,
    conversations: owner => Object.entries(record(owner).conversations).map(([id, value]) => ({ id, ...value })),
    updateConversation(owner, customer, patch) {
      return mutate(owner, rec => {
        rec.conversations[customer] = normalizeConversation({
          ...rec.conversations[customer],
          ...patch,
          updatedAt: now()
        });
        return rec.conversations[customer];
      });
    },
    control(owner, customer, mode, { reason = "" } = {}) {
      if (!["auto", "human", "closed", "done"].includes(mode)) throw Object.assign(new Error("未知接待状态"), { statusCode: 400 });
      const at = now();
      return this.updateConversation(owner, customer, {
        mode,
        ...(mode === "human" ? { handoffReason: String(reason || "人工接管").trim(), handoffAt: at } : {}),
        ...(mode === "auto" ? { resumedAt: at } : {})
      });
    },
    reserve(owner, requestId) {
      return mutate(owner, rec => {
        if (["submitted", "sent"].includes(rec.deliveries[requestId]?.state)) return false;
        rec.deliveries[requestId] = { state: "submitted", at: now() }; return true;
      });
    },
    reserveMany(owner, ids) {
      return mutate(owner, rec => {
        if (ids.some(id => ["submitted", "sent"].includes(rec.deliveries[id]?.state))) return false;
        ids.forEach(id => { rec.deliveries[id] = { state: "submitted", at: now() }; }); return true;
      });
    },
    delivered(owner, requestId) { return mutate(owner, rec => { rec.deliveries[requestId] = { state: "sent", at: now() }; return true; }); },
    failed(owner, requestId, error = null) {
      return mutate(owner, rec => {
        rec.deliveries[requestId] = { state: "failed", at: now(), error: String(error?.message || error || "发送失败").slice(0, 500) };
        return true;
      });
    },
    delivery: (owner, requestId) => structuredClone(record(owner).deliveries[requestId] || null),
    wasSubmitted: (owner, requestId) => ["submitted", "sent"].includes(record(owner).deliveries[requestId]?.state),
    clear(owner, expectedRevision) {
      return mutate(owner, rec => {
        if (expectedRevision !== rec.revision) {
          throw Object.assign(new Error("配置已在其他页面更新，请重新读取"), {
            code: "RECEPTION_VERSION_CONFLICT",
            statusCode: 409
          });
        }
        const previousRevision = rec.revision;
        const fresh = emptyRecord();
        rec.revision = previousRevision + 1;
        rec.settings = fresh.settings;
        rec.privateReception = fresh.privateReception;
        rec.conversations = {};
        rec.deliveries = {};
        rec.updatedAt = new Date(now()).toISOString();
        return publicRecord(rec);
      });
    },
    stateFile
  };
}
