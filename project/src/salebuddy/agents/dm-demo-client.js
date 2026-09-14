/**
 * Local direct-message gateway used by the browser style preview.
 *
 * It intentionally mirrors the recovered gateway contract so the investor
 * demo remains interactive when a local WebSocket is unavailable. All state is
 * persisted in localStorage and every reply goes through the same deterministic
 * business-memory state machine as the gateway mock.
 */
import { mockChiefDecision, mockConversationTurn, roleReply, seedDmMessages } from "./dm-scenarios.js";

export const DEMO_DM_SEED_VERSION = "20260914-business-memory-2";

const memoryStorage = new Map();

function storage() {
  try {
    if (globalThis.localStorage && typeof globalThis.localStorage.getItem === "function") return globalThis.localStorage;
  } catch {
    // Fall through to the process-local store in restricted browser contexts.
  }
  return {
    getItem: key => memoryStorage.has(key) ? memoryStorage.get(key) : null,
    setItem: (key, value) => memoryStorage.set(key, String(value)),
    removeItem: key => memoryStorage.delete(key)
  };
}

function readJson(key, fallback) {
  try {
    const raw = storage().getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try { storage().setItem(key, JSON.stringify(value)); } catch { /* storage may be unavailable */ }
  return value;
}

function dmKey(agentType) {
  return `salebuddy:dm:${agentType || "main"}`;
}

function dmVersionKey(agentType) {
  return `salebuddy:dm-demo-version:${agentType || "main"}`;
}

function conversationStateKey(agentType, conversationId) {
  return `salebuddy:dm-demo-state:${DEMO_DM_SEED_VERSION}:${agentType || "main"}:${encodeURIComponent(conversationId || "default")}`;
}

function displayName(agentType) {
  const names = {
    main: "Byering · 幕僚长",
    "mkt-comment-acquisition": "抖音获客管家",
    "mkt-find-people": "找客专员",
    "mkt-intent-analyst": "客户分析员",
    "mkt-cold-writer": "潜客触达专员",
    "mkt-dm-inbox": "私信客服",
    "Browser Agent": "线索猎人",
    "Search Agent": "线索分析师",
    "App Agent": "触达策略师",
    "File Agent": "内容策划",
    "Computer Agent": "开发助手"
  };
  return names[agentType] || agentType || "Agent";
}

function readMessages(agentType) {
  const current = readJson(dmKey(agentType), []);
  const seeds = seedDmMessages(agentType);
  if (!seeds.length) return Array.isArray(current) ? current : [];

  const version = storage().getItem(dmVersionKey(agentType)) || "";
  if (version === DEMO_DM_SEED_VERSION && Array.isArray(current) && current.length) return current;

  const preserved = (Array.isArray(current) ? current : [])
    .filter(message => !String(message?.id || "").startsWith("dm-seed-"));
  const migrated = [...seeds, ...preserved];
  writeJson(dmKey(agentType), migrated);
  try { storage().setItem(dmVersionKey(agentType), DEMO_DM_SEED_VERSION); } catch { /* ignore */ }
  return migrated;
}

function appendMessage(agentType, input = {}) {
  const messages = readMessages(agentType);
  const conversationId = input.conversationId || null;
  const message = {
    id: `dm-demo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    agentType,
    from: input.from || "user",
    fromName: input.fromName || (input.from === "user" ? "我" : displayName(agentType)),
    text: String(input.text || ""),
    ...(input.artifact ? { artifact: { ...input.artifact } } : {}),
    ...(input.metadata && typeof input.metadata === "object" ? { metadata: { ...input.metadata } } : {}),
    ...(conversationId ? { conversationId } : {}),
    createdAt: new Date().toISOString()
  };
  messages.push(message);
  writeJson(dmKey(agentType), messages);
  return message;
}

function stateKey(agentType, conversationId) {
  return `${agentType}::${conversationId || "default"}`;
}

function normalizeConversationState(value) {
  if (!value || typeof value !== "object") return null;
  return {
    appliedConfig: value.appliedConfig && typeof value.appliedConfig === "object"
      ? { ...value.appliedConfig }
      : undefined,
    pendingProposal: value.pendingProposal && typeof value.pendingProposal === "object"
      ? { ...value.pendingProposal }
      : null,
    lastTopic: value.lastTopic || null
  };
}

function readConversationState(agentType, conversationId) {
  return normalizeConversationState(readJson(conversationStateKey(agentType, conversationId), null));
}

function writeConversationState(agentType, conversationId, value) {
  const normalized = normalizeConversationState(value);
  if (normalized) writeJson(conversationStateKey(agentType, conversationId), normalized);
  return normalized;
}

function inferConversationState(agentType, conversationId) {
  const messages = readMessages(agentType)
    .filter(message => (message.conversationId || null) === (conversationId || null))
    .sort((left, right) => Date.parse(left.createdAt || "") - Date.parse(right.createdAt || ""));
  let state = null;
  for (const message of messages) {
    const proposal = message.metadata?.demoProposal;
    if (proposal?.status === "pending") {
      state = { ...(state || {}), pendingProposal: { ...proposal } };
    } else if (proposal?.status === "applied") {
      state = {
        ...(state || {}),
        appliedConfig: message.metadata?.demoConfigApplied && typeof message.metadata.demoConfigApplied === "object"
          ? { ...message.metadata.demoConfigApplied }
          : state?.appliedConfig,
        pendingProposal: null
      };
    }
  }
  return normalizeConversationState(state);
}

function loadConversationState(agentType, conversationId) {
  return readConversationState(agentType, conversationId)
    || inferConversationState(agentType, conversationId);
}

function createWorkspace(agentType) {
  return {
    path: `workspace/${displayName(agentType)}`,
    sections: [
      { dir: "根目录", files: [{ name: "IDENTITY.md", size: 1024, updatedAt: new Date().toISOString() }] },
      { dir: "inbox", files: [] },
      { dir: "output", files: [] }
    ]
  };
}

export function createDemoDmGateway({ delayMs = 1200 } = {}) {
  const conversationStates = new Map();
  const timers = new Set();

  const schedule = (callback) => {
    const timer = globalThis.setTimeout(() => {
      timers.delete(timer);
      callback();
    }, Math.max(0, Number(delayMs) || 0));
    timers.add(timer);
  };

  const gateway = {
    isDemo: true,
    controlPlaneReady: true,
    async action(action, payload = {}) {
      const agentType = payload.agentType || "main";

      if (action === "dm.message.list") {
        return { data: { messages: readMessages(agentType) } };
      }

      if (action === "dm.message.send") {
        const message = appendMessage(agentType, payload);
        const from = payload.from || "user";
        if (from === "user" && payload.metadata?.suppressAutoReply !== true) {
          const key = stateKey(agentType, payload.conversationId);
          schedule(() => {
            const turn = mockConversationTurn(agentType, payload.text, {
              state: conversationStates.get(key) || loadConversationState(agentType, payload.conversationId)
            });
            if (turn?.state) {
              conversationStates.set(key, turn.state);
              writeConversationState(agentType, payload.conversationId, turn.state);
            }
            appendMessage(agentType, {
              from: agentType,
              fromName: displayName(agentType),
              text: turn?.text || roleReply(agentType, payload.text),
              conversationId: payload.conversationId,
              metadata: {
                source: agentType === "main" ? "chief-conversation" : "member-conversation",
                conversationRole: agentType === "main" ? "chief" : "specialist-executor",
                ...(payload.conversationId ? { conversationId: payload.conversationId } : {}),
                ...(turn?.proposal ? { demoProposal: turn.proposal } : {}),
                ...(turn?.appliedConfig ? { demoConfigApplied: turn.appliedConfig } : {})
              }
            });
          });
        }
        return { data: { message } };
      }

      if (action === "chief.message.decide") {
        return { data: mockChiefDecision(payload.message) };
      }

      if (action === "agent.workspace.list") {
        return { data: { workspace: createWorkspace(agentType) } };
      }

      return { data: {} };
    },
    dispose() {
      for (const timer of timers) globalThis.clearTimeout(timer);
      timers.clear();
      conversationStates.clear();
    }
  };

  return gateway;
}
