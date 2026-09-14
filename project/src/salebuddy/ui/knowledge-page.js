/**
 * ui/knowledge-page.js
 * 本地知识库的两个子页（导航即页面，与通讯录同一交互层级）：
 *   业务知识：真实读取 agent.memory.*，作为各 Agent 的可执行上下文
 *   记忆：全员记忆库总览（真实走 gateway agent.memory.list，按成员分组，
 *         分类与四档生效范围与九段员工模型一致）
 */
import { el, openPage } from "./pages.js";
import { avatarInitial } from "./agent-drawer.js";
import { mountAgentAvatar } from "./agent-avatar.js";
import { listHiredAgents } from "../agents/marketplace.js";
import { displayAgentName } from "../brand.js";

const CSS = `
.sb-kb{min-height:100%;padding:20px 28px 28px}
.sb-kb-sec-title{font-size:12px;font-weight:600;color:#8A8F99;letter-spacing:.4px;margin:16px 0 8px}
.sb-kb-sec-title:first-child{margin-top:0}
.sb-kb-doc{display:flex;align-items:center;gap:12px;background:#fff;border:1px solid rgba(15,15,15,0.06);border-radius:12px;padding:11px 14px;margin-bottom:8px}
.sb-kb-doc-icon{width:32px;height:32px;border-radius:8px;flex:none;display:flex;align-items:center;justify-content:center;color:#fff}
.sb-kb-doc-icon svg{width:16px;height:16px}
.sb-kb-doc-name{font-size:13px;font-weight:500;color:#1F2329}
.sb-kb-doc-meta{font-size:11px;color:#8A8F99;margin-top:2px}
.sb-kb-doc-side{margin-left:auto;flex:none;font-size:11px;color:#B0B4BB}
.sb-kb-agent{display:flex;align-items:center;gap:8px;margin:16px 0 8px}
.sb-kb-agent-ava{width:24px;height:24px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;color:#fff;background:#5B6B8C;overflow:hidden}
.sb-kb-agent-name{font-size:12.5px;font-weight:600;color:#1F2329}
.sb-kb-agent-count{font-size:11px;color:#B0B4BB}
.sb-kb-mem{background:#fff;border:1px solid rgba(15,15,15,0.06);border-radius:12px;padding:11px 14px;margin-bottom:8px}
.sb-kb-mem-head{display:flex;align-items:center;gap:6px;margin-bottom:5px}
.sb-kb-kind{font-size:10.5px;font-weight:500;color:#3B6BD4;background:rgba(59,107,212,0.08);border-radius:6px;padding:1px 7px}
.sb-kb-scope{font-size:10.5px;color:#8A8F99;background:rgba(15,15,15,0.05);border-radius:6px;padding:1px 7px}
.sb-kb-mem-time{margin-left:auto;font-size:10.5px;color:#B0B4BB}
.sb-kb-mem-text{font-size:12.5px;color:#1F2329;line-height:1.6}
.sb-kb-empty{padding:40px 0;text-align:center;font-size:13px;color:#B0B4BB}
`;

let styleInjected = false;
function ensureStyle() {
  if (styleInjected) return;
  const tag = document.createElement("style");
  tag.textContent = CSS;
  document.head.appendChild(tag);
  styleInjected = true;
}

const KIND_LABELS = {
  userRules: "用户记忆",
  projectRules: "项目记忆",
  lessons: "岗位经验",
  feedback: "用户反馈",
  bestPractices: "最佳实践"
};
const SCOPE_LABELS = {
  task: "单次任务",
  project: "本项目",
  agent: "该成员",
  organization: "全组织"
};

const DOC_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v4h4"/></svg>';

function knowledgeAgents(teamLive) {
  const agents = [];
  const seen = new Set();
  for (const [agentType, profile] of teamLive?.getProfiles?.() || new Map()) {
    if (seen.has(agentType)) continue;
    seen.add(agentType);
    agents.push({ id: agentType, name: displayAgentName({ agentType, name: profile.identity?.name || agentType }), color: agentType === "main" ? "#1F2329" : "#5B6B8C" });
  }
  for (const hired of listHiredAgents()) {
    if (seen.has(hired.id)) continue;
    seen.add(hired.id);
    agents.push({ id: hired.id, name: displayAgentName({ id: hired.id, name: hired.name }), color: hired.color });
  }
  return agents;
}

async function renderDocs(body, { gateway, teamLive } = {}) {
  body.textContent = "";
  if (!gateway) {
    body.appendChild(el("div", "sb-kb-empty", "gateway 未连接，业务知识暂不可读"));
    return;
  }
  const sections = await Promise.all(knowledgeAgents(teamLive).map(async (agent) => {
    try {
      const entries = (await gateway.action("agent.memory.list", { agentType: agent.id }))?.data?.entries || [];
      return { agent, entries: entries.filter((entry) => entry.status !== "rolled-back" && entry.status !== "deleted" && entry.text) };
    } catch {
      return { agent, entries: [], error: true };
    }
  }));
  const totalCount = sections.reduce((sum, section) => sum + section.entries.length, 0);
  if (!totalCount) {
    body.appendChild(el("div", "sb-kb-empty", "知识库暂无已生效内容；添加记忆后，私信承接会自动读取。"));
    return;
  }
  for (const { agent, entries } of sections) {
    if (!entries.length) continue;
    body.appendChild(el("div", "sb-kb-sec-title", `${agent.name} · ${entries.length} 条`));
    for (const entry of entries) {
      const row = el("div", "sb-kb-doc");
      const icon = el("div", "sb-kb-doc-icon");
      icon.style.background = agent.color;
      icon.innerHTML = DOC_ICON;
      row.appendChild(icon);
      const text = el("div");
      text.appendChild(el("div", "sb-kb-doc-name", entry.text));
      text.appendChild(el("div", "sb-kb-doc-meta", `${KIND_LABELS[entry.kind] || entry.kind} · ${SCOPE_LABELS[entry.scope] || entry.scope} · ${fmtTime(entry.updatedAt || entry.createdAt)}`));
      row.appendChild(text);
      row.appendChild(el("span", "sb-kb-doc-side", "实时读取"));
      body.appendChild(row);
    }
  }
}

// ── 记忆页（真实数据：gateway agent.memory.list）──
function fmtTime(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

async function renderMemory(body, { gateway, teamLive }) {
  const agents = [];
  for (const [agentType, profile] of teamLive?.getProfiles?.() || new Map()) {
    agents.push({ id: agentType, name: displayAgentName({ agentType, name: profile.identity?.name || agentType }), color: agentType === "main" ? "#1F2329" : "#5B6B8C" });
  }
  for (const hired of listHiredAgents()) {
    agents.push({ id: hired.id, name: displayAgentName({ id: hired.id, name: hired.name }), color: hired.color });
  }

  let totalCount = 0;
  const sections = [];
  await Promise.all(agents.map(async (agent) => {
    let entries = [];
    if (gateway) {
      try { entries = (await gateway.action("agent.memory.list", { agentType: agent.id }))?.data?.entries || []; }
      catch { entries = []; }
    }
    sections.push({ agent, entries });
    totalCount += entries.length;
  }));

  body.textContent = "";
  if (!gateway) {
    body.appendChild(el("div", "sb-kb-empty", "gateway 未连接，记忆库暂不可读"));
    return;
  }
  if (!totalCount) {
    body.appendChild(el("div", "sb-kb-empty", "还没有记忆。在成员 → 设置里给成员添加第一条记忆吧"));
    return;
  }
  for (const { agent, entries } of sections) {
    if (!entries.length) continue;
    const head = el("div", "sb-kb-agent");
    const ava = el("div", "sb-kb-agent-ava", avatarInitial(agent.name));
    ava.style.background = agent.color;
    mountAgentAvatar(ava, agent.id, { alt: agent.name });
    head.appendChild(ava);
    head.appendChild(el("span", "sb-kb-agent-name", agent.name));
    head.appendChild(el("span", "sb-kb-agent-count", `${entries.length} 条`));
    body.appendChild(head);
    for (const entry of entries) {
      const card = el("div", "sb-kb-mem");
      const headRow = el("div", "sb-kb-mem-head");
      headRow.appendChild(el("span", "sb-kb-kind", KIND_LABELS[entry.kind] || entry.kind));
      headRow.appendChild(el("span", "sb-kb-scope", SCOPE_LABELS[entry.scope] || entry.scope));
      headRow.appendChild(el("span", "sb-kb-mem-time", fmtTime(entry.updatedAt || entry.createdAt)));
      card.appendChild(headRow);
      card.appendChild(el("div", "sb-kb-mem-text", entry.text || ""));
      body.appendChild(card);
    }
  }
}

/**
 * 打开本地知识库子页。
 * kind: "docs" | "memory"
 * deps: { gateway, teamLive, onClose }
 */
export function openKnowledgePage(kind, { gateway, teamLive, onClose } = {}) {
  ensureStyle();
  const isDocs = kind === "docs";
  const page = openPage({ title: isDocs ? "知识库 · 业务知识" : "知识库 · 记忆", onClose });
  const body = el("div", "sb-kb notranslate");
  body.setAttribute("translate", "no");
  page.body.appendChild(body);

  let disposed = false;
  if (isDocs) {
    body.appendChild(el("div", "sb-kb-empty", "读取业务知识…"));
    renderDocs(body, { gateway, teamLive }).catch(() => {
      if (!disposed) {
        body.textContent = "";
        body.appendChild(el("div", "sb-kb-empty", "业务知识读取失败"));
      }
    });
  } else {
    body.appendChild(el("div", "sb-kb-empty", "读取记忆库…"));
    renderMemory(body, { gateway, teamLive }).catch(() => {
      if (!disposed) {
        body.textContent = "";
        body.appendChild(el("div", "sb-kb-empty", "记忆库读取失败"));
      }
    });
  }

  const origClose = page.close;
  page.close = () => { disposed = true; origClose(); };
  return page;
}
