/**
 * agents/registry.js
 * 渲染层的 Agent 员工模型访问入口。
 * 读取优先级：gateway（agent.profile.* 持久化）→ localStorage 缓存 → 默认值。
 * 写操作同时落 gateway 与本地缓存。纯数据结构定义在 model.js（三方共享）。
 */
import {
  AGENT_TYPE_DEFAULTS,
  MEMORY_KINDS,
  FEEDBACK_SCOPES,
  createDefaultProfile,
  createMemoryEntry,
  reviseMemoryEntry,
  rollbackMemoryEntry,
  mergeProfilePatch,
  fillProfileDefaults
} from "./model.js";
import { SB_ACTIONS } from "../bridge/gateway.js";
import { marketplaceProfileSeed, listHiredAgents } from "./marketplace.js";

export { AGENT_TYPE_DEFAULTS, MEMORY_KINDS, FEEDBACK_SCOPES, createDefaultProfile, createMemoryEntry };

const STORAGE_PREFIX = "salebuddy:agent:";
let gatewayClient = null;

/** 注入已连接的 SaleBuddyGatewayClient；未注入时退化为本地模式。 */
export function attachGateway(client) {
  gatewayClient = client;
}

function cacheGet(agentType) {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + agentType);
    if (raw) return JSON.parse(raw);
  } catch { /* 存储不可用时回落默认 */ }
  return null;
}

function cacheSet(profile) {
  try { localStorage.setItem(STORAGE_PREFIX + profile.agentType, JSON.stringify(profile)); } catch { /* ignore */ }
}

function withMarketplaceDefaults(agentType, profile) {
  const seed = marketplaceProfileSeed(agentType);
  return seed ? fillProfileDefaults(profile, seed) : profile;
}

/** 读取员工档案（异步，gateway 优先）。 */
export async function getAgentProfile(agentType) {
  if (gatewayClient) {
    try {
      const result = await gatewayClient.action(SB_ACTIONS.agentProfileGet, { agentType });
      const profile = result?.data?.profile;
      if (profile) {
        const hydrated = withMarketplaceDefaults(agentType, profile);
        cacheSet(hydrated);
        return hydrated;
      }
    } catch { /* 回落本地 */ }
  }
  return withMarketplaceDefaults(agentType, cacheGet(agentType) || createDefaultProfile(agentType));
}

/** 同步读取（仅本地缓存/默认值，供渲染首帧使用）。 */
export function getAgentProfileSync(agentType) {
  return withMarketplaceDefaults(agentType, cacheGet(agentType) || createDefaultProfile(agentType));
}

/** 更新员工档案（深合并 patch）。 */
export async function updateAgentProfile(agentType, patch) {
  const current = await getAgentProfile(agentType);
  const next = mergeProfilePatch(current, patch);
  cacheSet(next);
  if (gatewayClient) {
    try {
      const result = await gatewayClient.action(SB_ACTIONS.agentProfileUpdate, { agentType, patch });
      const persisted = result?.data?.profile;
      if (persisted) {
        const hydrated = withMarketplaceDefaults(agentType, persisted);
        cacheSet(hydrated);
        return hydrated;
      }
    } catch { /* 本地已更新 */ }
  }
  return next;
}

/** 追加记忆（四档生效范围见 FEEDBACK_SCOPES）。 */
export async function appendMemory(agentType, { kind, text, scope = "agent", source = "user" }) {
  const entry = createMemoryEntry({ kind, text, scope, source });
  if (gatewayClient) {
    try {
      const result = await gatewayClient.action(SB_ACTIONS.agentMemoryAppend, { agentType, entry });
      return result?.data?.entry || entry;
    } catch { /* 返回本地构造的 entry */ }
  }
  return entry;
}

/** 列出记忆。 */
export async function listMemory(agentType, kind = null) {
  if (gatewayClient) {
    try {
      const result = await gatewayClient.action(SB_ACTIONS.agentMemoryList, { agentType, kind });
      return result?.data?.entries || [];
    } catch { /* 空列表 */ }
  }
  return [];
}

/** 回退一条记忆到上一版本。 */
export async function rollbackMemory(agentType, entryId) {
  if (!gatewayClient) return null;
  try {
    const result = await gatewayClient.action(SB_ACTIONS.agentMemoryRollback, { agentType, entryId });
    return result?.data?.entry || null;
  } catch {
    return null;
  }
}

/** 读取权限配置。 */
export async function getPermission(agentType) {
  if (gatewayClient) {
    try {
      const result = await gatewayClient.action(SB_ACTIONS.agentPermissionGet, { agentType });
      return result?.data?.permission || null;
    } catch { /* null */ }
  }
  return getAgentProfileSync(agentType).permission;
}

/** 更新权限配置。 */
export async function updatePermission(agentType, permission) {
  if (gatewayClient) {
    try {
      const result = await gatewayClient.action(SB_ACTIONS.agentPermissionUpdate, { agentType, permission });
      return result?.data?.permission || permission;
    } catch { /* 返回入参 */ }
  }
  return permission;
}

export function listKnownAgentTypes() {
  return Object.keys(AGENT_TYPE_DEFAULTS);
}

/** Core employees plus active marketplace hires available to runtime dispatch. */
export function listRuntimeAgentTypes() {
  return [...new Set([...listKnownAgentTypes(), ...listHiredAgents().map(({ id }) => id)])];
}

// 兼容旧的本地写入口（Phase 0 API）。
export function saveAgentProfile(profile) {
  const next = { ...profile, meta: { ...profile.meta, updatedAt: new Date().toISOString(), version: (profile.meta?.version || 0) + 1 } };
  cacheSet(next);
  return next;
}

// 供单元测试/工具使用的高级操作透传
export { reviseMemoryEntry, rollbackMemoryEntry, mergeProfilePatch };
