/**
 * agents/status.js
 * 团队状态派生（纯函数，Node/浏览器通用）。
 *
 * 与办公室 dCe 适配器使用完全相同的输入与映射规则：
 *   输入：会话列表 + 每个会话的消息（assistant 消息 status + subagent 内容项）
 *   规则：主 Agent generating → 工作中；subagent running → 工作中；
 *         subagent failed → 遇到阻塞；无活动 → 空闲。
 * 不创建新的状态源，保证"好友栏看到的状态"与"办公室看到的动作"一致。
 */

export const TEAM_STATES = Object.freeze({
  WORKING: "working",     // 正在执行
  BLOCKED: "blocked",     // 遇到阻塞（subagent failed / 主 Agent 失败）
  IDLE: "idle",           // 空闲
  OFFLINE: "offline"      // 不在场（无任何记录）
});

export const TEAM_STATE_LABELS = Object.freeze({
  working: "正在执行",
  blocked: "遇到阻塞",
  idle: "空闲",
  offline: "离线"
});

/** 取会话中最新一条 assistant 消息（dCe 同样只看最新消息快照）。 */
export function latestAssistantMessage(messages = []) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "assistant") return messages[index];
  }
  return null;
}

/** 从一条 assistant 消息提取 subagent 快照（与 dCe 提取逻辑同形）。 */
export function extractSubagents(message) {
  if (!message || !Array.isArray(message.content)) return [];
  const result = [];
  for (const item of message.content) {
    if (item?.type === "subagent" && item.data) {
      result.push({
        id: item.data.id,
        name: item.data.name,               // 角色名即 agentType
        status: item.data.status ?? "running",
        parentAgentId: item.data.parentAgentId || null
      });
    }
  }
  return result;
}

/** 检测待审批项（未来审批协议的挂载点；无审批项时恒为 false）。 */
export function hasPendingApproval(message) {
  if (!message || !Array.isArray(message.content)) return false;
  return message.content.some((item) => item?.type === "approval" && item?.data?.status === "pending");
}

/**
 * 派生整个团队的状态。
 * 已知员工默认"空闲"（PRD：员工始终在岗）；OFFLINE 只用于无档案的未知角色。
 * @param {Array<{id:string,title:string,status:string}>} conversations
 * @param {(conversationId:string) => Array} getMessages
 * @param {string[]} knownAgentTypes 已知角色（含 "main"）
 * @returns {Map<string, {agentType:string, state:string, currentTask:string|null,
 *           activeConversations:number, waitingApproval:boolean}>}
 */
export function deriveTeamStatus(conversations, getMessages, knownAgentTypes) {
  const team = new Map();
  for (const agentType of knownAgentTypes) {
    team.set(agentType, { agentType, state: TEAM_STATES.IDLE, currentTask: null, activeConversations: 0, waitingApproval: false });
  }
  const ensure = (agentType) => {
    if (!team.has(agentType)) {
      team.set(agentType, { agentType, state: TEAM_STATES.OFFLINE, currentTask: null, activeConversations: 0, waitingApproval: false });
    }
    return team.get(agentType);
  };

  for (const conversation of conversations || []) {
    const messages = getMessages(conversation.id) || [];
    const latest = latestAssistantMessage(messages);
    if (!latest) continue;

    // 主 Agent：generating → 工作中（办公室同规则：main generating → START）
    if (latest.status === "generating") {
      const main = ensure("main");
      main.state = TEAM_STATES.WORKING;
      main.currentTask = main.currentTask || conversation.title || null;
      main.activeConversations += 1;
      if (hasPendingApproval(latest)) main.waitingApproval = true;
    }

    // subagent：running → 工作中；failed → 阻塞（completed 不产生活动状态）
    for (const sub of extractSubagents(latest)) {
      const entry = ensure(sub.name);
      if (sub.status === "running") {
        if (entry.state !== TEAM_STATES.BLOCKED) entry.state = TEAM_STATES.WORKING;
        entry.currentTask = entry.currentTask || conversation.title || null;
        entry.activeConversations += 1;
      } else if (sub.status === "failed" || sub.status === "error") {
        entry.state = TEAM_STATES.BLOCKED;
        entry.currentTask = entry.currentTask || conversation.title || null;
      }
    }
  }

  // 有记录但无活动 → 空闲
  for (const entry of team.values()) {
    if (entry.state === TEAM_STATES.OFFLINE && (entry.activeConversations > 0 || entry.currentTask)) {
      entry.state = TEAM_STATES.IDLE;
    }
  }
  return team;
}
