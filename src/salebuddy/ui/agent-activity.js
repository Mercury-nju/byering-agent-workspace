/**
 * ui/agent-activity.js
 * Event-driven activity label for working agents.
 * Labels stay on the current runtime checkpoint until the next event arrives.
 */
import { TEAM_STATES } from "../agents/status.js";
import { getWork } from "../agents/work-live.js";

const ROLE_STAGES = Object.freeze({
  main: ["理解中", "确认中", "拆解中", "分派中"],
  "Strategy Agent": ["拆解中", "定义画像", "选择来源", "锁定范围"],
  "Browser Agent": ["检索中", "识别中", "挖掘中", "整理中"],
  "Search Agent": ["识别中", "清洗中", "挖掘中", "核验中"],
  "Research Agent": ["整理中", "核对中", "提炼中", "生成 Brief"],
  "App Agent": ["准备触达", "生成话术", "排队发送", "跟进中"],
  "Risk Agent": ["检查中", "核验权限", "判断风险", "输出结论"],
  "Outreach Agent": ["准备触达", "逐条发送", "核对结果", "记录中"],
  "Outreach Ops Agent": ["排队中", "分批执行", "处理失败", "监听回复"],
  "File Agent": ["整理中", "撰写中", "排版中", "准备交付"],
  "Computer Agent": ["执行中", "运行中", "校验中", "部署中"],
  "线索猎人": ["检索中", "识别中", "挖掘中", "整理中"],
  "数据分析师": ["清洗中", "分析中", "评分中", "核验中"],
  "内容策划": ["整理中", "撰写中", "排版中", "准备交付"],
  "销售顾问": ["准备触达", "生成话术", "排队发送", "跟进中"]
});

const FALLBACK_STAGES = ["执行中", "识别中", "挖掘中", "准备触达"];
const activityState = new Map();
const activityListeners = new Map();

const CSS = `
.sb-agent-activity{display:inline-flex;align-items:center;gap:4px;max-width:112px;min-width:0;color:#2F67C8;font-size:10.5px;font-weight:650;line-height:1;white-space:nowrap;vertical-align:middle}
.sb-agent-activity-dot{width:5px;height:5px;border-radius:50%;background:#3B7BE8;flex:none;animation:sb-agent-activity-pulse 1.6s ease-in-out infinite}
.sb-agent-activity-label{min-width:0;overflow:hidden;text-overflow:ellipsis}
.sb-agent-activity-dots{display:inline-block;width:0;overflow:hidden;letter-spacing:1px;animation:sb-agent-activity-dots 1.2s steps(4,end) infinite}
@keyframes sb-agent-activity-pulse{0%,100%{opacity:.45;transform:scale(.8)}50%{opacity:1;transform:scale(1.15)}}
@keyframes sb-agent-activity-dots{0%{width:0}65%,100%{width:12px}}
.sb-as-mate-name-row,.sb-cname-row,.sb-msg-name-row{display:flex;align-items:center;gap:6px;min-width:0}
.sb-msg-name-row .sb-agent-activity{font-size:10px}
`;

let styleInjected = false;
function ensureStyle() {
  if (styleInjected || typeof document === "undefined") return;
  const tag = document.createElement("style");
  tag.textContent = CSS;
  document.head.appendChild(tag);
  styleInjected = true;
}

function isWorking(status, work) {
  return status?.state === TEAM_STATES.WORKING || work?.state === "working";
}

function notify(agentType, value) {
  for (const listener of activityListeners.get(String(agentType || "")) || []) {
    try { listener(value); } catch { /* one badge cannot break the event stream */ }
  }
}

export function setAgentActivity(agentType, label) {
  const key = String(agentType || "").trim();
  if (!key) return;
  const value = String(label || "").trim() || null;
  if (value) activityState.set(key, value);
  else activityState.delete(key);
  notify(key, value);
}

export function clearAgentActivities() {
  for (const key of activityState.keys()) notify(key, null);
  activityState.clear();
}

export function getAgentActivity(agentType) {
  return activityState.get(String(agentType || "").trim()) || null;
}

function subscribeActivity(agentType, listener) {
  const key = String(agentType || "").trim();
  if (!activityListeners.has(key)) activityListeners.set(key, new Set());
  const listeners = activityListeners.get(key);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) activityListeners.delete(key);
  };
}

function cleanStage(value) {
  const text = String(value || "").trim();
  return text.length > 14 ? `${text.slice(0, 13)}…` : text;
}

export function activityStages(agentType, { status, work = getWork(agentType) } = {}) {
  if (!isWorking(status, work)) return [];
  const roleStages = ROLE_STAGES[agentType] || FALLBACK_STAGES;
  const liveStage = cleanStage(work?.phase);
  return liveStage && !roleStages.includes(liveStage) ? [liveStage, ...roleStages] : [...roleStages];
}

export function activityLabelFor(agentType, event = {}) {
  const stages = ROLE_STAGES[agentType] || ROLE_STAGES[agentType === "Browser Agent" ? "线索猎人" : agentType] || FALLBACK_STAGES;
  if (agentType === "main") {
    if (event.t === "chief" && event.i != null) return "分派中";
    if (event.t === "user" || event.t === "chief") return "理解中";
    if (event.t === "run-started") return "理解中";
    if (event.t === "progress-start") return "准备执行";
    if (event.t === "requirement-required") return "等待确认";
    if (event.t === "requirement-confirmed") return "拆解中";
    if (event.t === "assignment-plan" || event.t === "dispatch") return "分派中";
  }
  if (event.t === "sub-start") return "准备执行";
  if (event.t === "sub-started") return stages[0];
  if (event.t === "sub-log") return stages[Math.min(1 + Math.max(0, Number(event.lineIndex) || 0), stages.length - 1)];
  if (event.t === "sub-done") return null;
  return null;
}

/** Create a small, event-driven label. Returns null when the agent is not working. */
export function createAgentActivityBadge(agentType, { status, work = getWork(agentType), persistedOnly = false } = {}) {
  const stages = activityStages(agentType, { status, work });
  if (!stages.length || typeof document === "undefined") return null;
  if (persistedOnly && !getAgentActivity(agentType)) return null;
  ensureStyle();
  const badge = document.createElement("span");
  badge.className = "sb-agent-activity";
  badge.setAttribute("role", "status");
  badge.setAttribute("aria-live", "polite");
  const dot = document.createElement("i");
  dot.className = "sb-agent-activity-dot";
  dot.setAttribute("aria-hidden", "true");
  const label = document.createElement("span");
  label.className = "sb-agent-activity-label";
  const dots = document.createElement("span");
  dots.className = "sb-agent-activity-dots";
  dots.textContent = "...";
  dots.setAttribute("aria-hidden", "true");
  badge.append(dot, label, dots);

  const initial = activityState.get(String(agentType || "")) || stages[0];
  const update = (value) => {
    if (!value) {
      badge.remove();
      unsubscribe?.();
      return;
    }
    label.textContent = value;
    badge.setAttribute("aria-label", `正在${label.textContent}`);
  };
  let unsubscribe = null;
  update(initial);
  unsubscribe = subscribeActivity(agentType, update);
  return badge;
}
