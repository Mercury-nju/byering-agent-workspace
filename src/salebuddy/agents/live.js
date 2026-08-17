/**
 * agents/live.js
 * 团队实时数据源：档案 + 状态（与办公室同源），供通讯录、团队行等多处订阅。
 */
import { deriveTeamStatus, TEAM_STATES } from "./status.js";

export function createTeamLive({ gateway, registry, pollMs = 2500 } = {}) {
  let profiles = new Map();
  let teamStatus = new Map();
  const listeners = new Set();
  let timer = null;

  async function refreshProfiles() {
    const next = new Map();
    const runtimeAgents = registry.listRuntimeAgentTypes?.() || registry.listKnownAgentTypes();
    for (const agentType of runtimeAgents) {
      try { next.set(agentType, await registry.getAgentProfile(agentType)); }
      catch { next.set(agentType, registry.getAgentProfileSync(agentType)); }
    }
    profiles = next;
  }

  async function refreshStatus() {
    if (!gateway) {
      const runtimeAgents = registry.listRuntimeAgentTypes?.() || registry.listKnownAgentTypes();
      teamStatus = new Map(runtimeAgents.map((t) => [t, { agentType: t, state: TEAM_STATES.IDLE, currentTask: null, activeConversations: 0, waitingApproval: false }]));
      return;
    }
    try {
      const conversationsResult = await gateway.action("conversations.list", { limit: 50 });
      const conversations = conversationsResult?.data?.conversations || [];
      const messageCache = new Map();
      const active = conversations.filter((c) => c.status === "in_progress");
      await Promise.all(active.map(async (c) => {
        try {
          const result = await gateway.action("message.action.list", { conversation_id: c.id });
          messageCache.set(c.id, result?.data?.messages || []);
        } catch { messageCache.set(c.id, []); }
      }));
      const runtimeAgents = registry.listRuntimeAgentTypes?.() || registry.listKnownAgentTypes();
      teamStatus = deriveTeamStatus(conversations, (id) => messageCache.get(id) || [], runtimeAgents);
    } catch { /* 保持上次状态 */ }
  }

  async function refresh() {
    await Promise.all([refreshProfiles(), refreshStatus()]);
    listeners.forEach((listener) => listener());
  }

  return {
    refresh,
    getProfiles: () => profiles,
    getTeamStatus: () => teamStatus,
    getStatusOf: (agentType) => teamStatus.get(agentType) || { agentType, state: TEAM_STATES.IDLE, currentTask: null, activeConversations: 0, waitingApproval: false },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start() {
      if (timer) return;
      refresh();
      timer = setInterval(async () => {
        await refreshStatus();
        listeners.forEach((listener) => listener());
      }, pollMs);
    },
    stop() {
      clearInterval(timer);
      timer = null;
    }
  };
}
