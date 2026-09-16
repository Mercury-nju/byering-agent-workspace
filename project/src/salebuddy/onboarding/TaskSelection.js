import { getMarketplaceAgent, isMarketplaceAgentAvailable } from "../agents/marketplace.js";
import { mountGrokBotAvatar } from "../ui/grok-bot-avatar.js";

const ONBOARDING_FIRST_TASK_AGENT_IDS = Object.freeze([
  "mkt-comment-acquisition",
  "mkt-gold-customer-service",
  "mkt-live-danmaku-analysis",
  "mkt-viral-work-analysis",
  "mkt-live-danmaku-outreach"
]);

const TASK_VISUALS = Object.freeze({
  "mkt-comment-acquisition": Object.freeze({
    role: "完整获客",
    tone: "blue"
  }),
  "mkt-gold-customer-service": Object.freeze({
    role: "私信承接",
    tone: "cyan"
  }),
  "mkt-live-danmaku-analysis": Object.freeze({
    role: "直播分析",
    tone: "violet"
  }),
  "mkt-viral-work-analysis": Object.freeze({
    role: "内容分析",
    tone: "gray"
  }),
  "mkt-live-danmaku-outreach": Object.freeze({
    role: "直播触达",
    tone: "green"
  })
});

const ONBOARDING_TASK_DETAILS = Object.freeze({
  "mkt-comment-acquisition": Object.freeze({
    category: "持续获客",
    requirement: "适合想把抖音获客交给一位 Agent 全程负责"
  }),
  "mkt-gold-customer-service": Object.freeze({
    category: "私信对话",
    requirement: "把新私信交给 AI 接待，遇到敏感事项再交给你"
  }),
  "mkt-live-danmaku-analysis": Object.freeze({
    category: "分析",
    requirement: "连接账号后，持续整理当前直播间的新弹幕"
  }),
  "mkt-viral-work-analysis": Object.freeze({
    category: "分析",
    requirement: "提供抖音作品链接，拆解内容和流量机制"
  }),
  "mkt-live-danmaku-outreach": Object.freeze({
    category: "触达",
    requirement: "连接账号后，弹幕出现即触达对应用户"
  })
});

export const FIRST_TASK_OPTIONS = Object.freeze(
  ONBOARDING_FIRST_TASK_AGENT_IDS
    .filter((agentId) => isMarketplaceAgentAvailable(agentId))
    .map((agentId) => {
    const agent = getMarketplaceAgent(agentId);
    return Object.freeze({
      agentId,
      title: agent?.name || agentId,
      ...TASK_VISUALS[agentId],
      ...ONBOARDING_TASK_DETAILS[agentId],
      description: agent?.desc || ""
    });
    })
);

function findTask(agentId) {
  return FIRST_TASK_OPTIONS.find((option) => option.agentId === agentId) || FIRST_TASK_OPTIONS[0];
}

function createAgentAvatar({ documentRef, agentId, alt, className }) {
  const avatar = documentRef.createElement("span");
  avatar.className = className;
  mountGrokBotAvatar(avatar, agentId, {
    alt,
    state: "idle",
    trackPointer: false,
    mode: "agent-square"
  });
  return avatar;
}

function createTaskCard({ documentRef, option, selected, onSelect }) {
  const card = documentRef.createElement("button");
  card.type = "button";
  card.className = `sb-onboarding-v2-task${selected ? " is-selected" : ""}`;
  card.dataset.agentId = option.agentId;
  card.dataset.tone = option.tone;
  card.setAttribute("role", "radio");
  card.setAttribute("aria-checked", String(selected));
  card.setAttribute("aria-label", `${option.title}：${option.description}`);

  const visual = documentRef.createElement("div");
  visual.className = "sb-onboarding-v2-task-visual";
  const avatarShell = documentRef.createElement("span");
  avatarShell.className = "sb-onboarding-v2-task-avatar-shell";
  avatarShell.appendChild(createAgentAvatar({
    documentRef,
    agentId: option.agentId,
    alt: `${option.title} Agent 头像`,
    className: "sb-onboarding-v2-task-avatar"
  }));
  const role = documentRef.createElement("span");
  role.className = "sb-onboarding-v2-task-role";
  role.textContent = option.role;
  visual.append(avatarShell, role);

  const top = documentRef.createElement("div");
  top.className = "sb-onboarding-v2-task-top";
  const category = documentRef.createElement("span");
  category.className = "sb-onboarding-v2-task-category";
  category.textContent = option.category;
  const marker = documentRef.createElement("span");
  marker.className = "sb-onboarding-v2-task-marker";
  marker.setAttribute("aria-hidden", "true");
  top.append(category, marker);

  const title = documentRef.createElement("strong");
  title.textContent = option.title;
  const description = documentRef.createElement("p");
  description.textContent = option.description;
  const requirement = documentRef.createElement("span");
  requirement.className = "sb-onboarding-v2-task-requirement";
  requirement.textContent = option.requirement;

  card.append(visual, top, title, description, requirement);
  card.addEventListener("click", () => onSelect(option.agentId));
  return card;
}

export function createTaskSelection({
  documentRef = globalThis.document,
  initialAgentId,
  onNext
} = {}) {
  const root = documentRef.createElement("section");
  root.className = "sb-onboarding-v2-selection";

  const layout = documentRef.createElement("div");
  layout.className = "sb-onboarding-v2-selection-layout";
  const main = documentRef.createElement("div");
  main.className = "sb-onboarding-v2-selection-main";

  const eyebrow = documentRef.createElement("p");
  eyebrow.className = "sb-onboarding-v2-eyebrow";
  eyebrow.textContent = "首次设置 · 选择你的第一位 Agent";
  const heading = documentRef.createElement("h1");
  heading.textContent = "让一位 Agent 先接住你的工作";
  const subtitle = documentRef.createElement("p");
  subtitle.className = "sb-onboarding-v2-subtitle";
  subtitle.textContent = "选择后会直接进入真实配置流程。其他能力之后都能在 Agent 广场继续使用。";

  const grid = documentRef.createElement("div");
  grid.className = "sb-onboarding-v2-task-grid";
  grid.setAttribute("role", "radiogroup");
  grid.setAttribute("aria-label", "选择第一项工作");

  const selectedTask = findTask(initialAgentId);
  let selectedAgentId = selectedTask.agentId;
  const cards = new Map();

  function updateSelection(agentId) {
    selectedAgentId = findTask(agentId).agentId;
    cards.forEach((card, id) => {
      const selected = id === selectedAgentId;
      card.classList.toggle("is-selected", selected);
      card.setAttribute("aria-checked", String(selected));
    });
    const task = findTask(selectedAgentId);
    continueButton.textContent = `配置${task.title}`;
  }

  FIRST_TASK_OPTIONS.forEach((option) => {
    const card = createTaskCard({
      documentRef,
      option,
      selected: option.agentId === selectedAgentId,
      onSelect: updateSelection
    });
    cards.set(option.agentId, card);
    grid.appendChild(card);
  });

  const actions = documentRef.createElement("div");
  actions.className = "sb-onboarding-v2-actions";
  const browseButton = documentRef.createElement("button");
  browseButton.type = "button";
  browseButton.className = "sb-onboarding-v2-browse";
  browseButton.textContent = "先浏览 Agent 广场";
  browseButton.addEventListener("click", () => onNext?.({ agentId: null }));

  const continueButton = documentRef.createElement("button");
  continueButton.type = "button";
  continueButton.className = "sb-onboarding-v2-continue";
  continueButton.textContent = `配置${selectedTask.title}`;
  continueButton.addEventListener("click", () => {
    onNext?.({ agentId: selectedAgentId, selected: findTask(selectedAgentId) });
  });
  actions.append(browseButton, continueButton);

  main.append(eyebrow, heading, subtitle, grid, actions);
  layout.append(main);
  root.appendChild(layout);
  return {
    root,
    getSelectedAgentId: () => selectedAgentId,
    destroy() { root.remove(); }
  };
}
