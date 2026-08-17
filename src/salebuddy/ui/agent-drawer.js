/**
 * ui/agent-drawer.js
 * Shared employee detail drawer: live work status first, outputs and metrics second.
 */
import { TEAM_STATE_LABELS, TEAM_STATES } from "../agents/status.js";
import { AGENT_TYPE_DEFAULTS, createDefaultProfile } from "../agents/model.js";
import { getWorkForProject, subscribeWork } from "../agents/work-live.js";
import { memberDashboard, memberResultStory } from "../agents/metrics-store.js";
import { listFiles } from "../agents/file-store.js";
import { listTasks, subscribe as subscribeTasks } from "../agents/task-store.js";
import { mountAgentAvatar } from "./agent-avatar.js";

const CSS = `
.sb-drawer-mask{display:none}
.sb-drawer{position:fixed;top:0;right:0;bottom:0;width:min(38vw,620px);min-width:360px;background:#fff;z-index:9101;box-shadow:-12px 0 30px rgba(15,15,15,.08);border:1px solid rgba(15,15,15,.08);border-radius:20px;overflow:hidden;display:flex;flex-direction:column;font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif}
.sb-progress-host{position:relative!important;overflow:hidden!important;border-radius:20px!important}
.sb-drawer.sb-drawer-inline{position:absolute;inset:0;width:100%;min-width:0;box-shadow:none;border:0;border-radius:inherit;z-index:3}
.sb-drawer-head{padding:17px 18px 14px;border-bottom:1px solid rgba(15,15,15,.07);display:flex;align-items:center;gap:11px}
.sb-drawer-close{margin-left:auto;border:none;background:none;font-size:16px;color:#8A8F99;cursor:pointer;padding:5px 8px;border-radius:8px}
.sb-drawer-close:hover{background:rgba(15,15,15,.05);color:#333}
.sb-drawer-body{flex:1;overflow-y:auto;padding:16px 18px 28px;background:#FBFCFD}
.sb-agent-avatar{width:38px;height:38px;border-radius:12px;flex:none;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#fff;background:#5B6B8C;overflow:hidden}
.sb-agent-avatar.sb-main{background:#1F2329}
.sb-drawer-name{font-size:15px;font-weight:650;color:#1F2329;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sb-drawer-title{font-size:11.5px;color:#8A8F99;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sb-drawer-live{display:inline-flex;align-items:center;gap:5px;margin-left:8px;font-size:10.5px;color:#3D9950;font-weight:600}
.sb-drawer-live i{width:6px;height:6px;border-radius:50%;background:currentColor}
.sb-drawer-live.sb-working{color:#B87A1E}.sb-drawer-live.sb-waiting,.sb-drawer-live.sb-blocked{color:#C4453C}
.sb-work-hero{background:#fff;border:1px solid rgba(15,15,15,.07);border-radius:13px;padding:14px;margin-bottom:14px}
.sb-work-hero-top{display:flex;align-items:center;gap:8px;margin-bottom:9px}
.sb-work-kicker,.sb-section-title{font-size:10.5px;letter-spacing:.07em;text-transform:uppercase;color:#8A8F99;font-weight:700}
.sb-work-state{margin-left:auto;font-size:11px;font-weight:650;color:#B87A1E}
.sb-work-state.sb-done{color:#3D9950}.sb-work-state.sb-idle{color:#8A8F99}
.sb-work-task{font-size:14px;line-height:1.55;color:#1F2329;font-weight:600}
.sb-work-phase{font-size:11.5px;color:#5A5E66;margin-top:4px}
.sb-work-progress{height:5px;border-radius:99px;background:#EEF0F3;overflow:hidden;margin-top:12px}
.sb-work-progress i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#3B6BD4,#57B26A);transition:width .3s ease}
.sb-work-progress-meta{display:flex;justify-content:space-between;font-size:10.5px;color:#8A8F99;margin-top:6px}
.sb-work-context{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
.sb-work-context span{font-size:10.5px;color:#66707C;background:#F5F7FA;border:1px solid #E5E9EF;border-radius:999px;padding:3px 8px}
.sb-section{margin:0 0 17px}.sb-section-title{margin-bottom:9px}
.sb-timeline{position:relative;padding-left:18px}.sb-timeline:before{content:"";position:absolute;left:4px;top:5px;bottom:5px;width:1px;background:#DDE2E8}
.sb-timeline-item{position:relative;font-size:12px;color:#3F434A;line-height:1.55;padding:0 0 10px}
.sb-timeline-item:before{content:"";position:absolute;left:-17px;top:5px;width:7px;height:7px;border-radius:50%;background:#AAB4C1;box-shadow:0 0 0 3px #FBFCFD}
.sb-timeline-item:first-child:before{background:#3B6BD4}.sb-timeline-item:last-child{padding-bottom:0}
.sb-timeline-time{display:block;font-size:10px;color:#A2A8B0;margin-top:2px}
.sb-output-list{display:flex;flex-direction:column;gap:8px}
.sb-output{display:flex;align-items:center;gap:10px;padding:9px 10px;background:#fff;border:1px solid rgba(15,15,15,.07);border-radius:10px}
.sb-output-icon{width:28px;height:28px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;background:rgba(76,154,255,.12);color:#3B6BD4;flex:none}
.sb-output-icon.sb-sheet{background:rgba(87,178,106,.14);color:#2F7D3F}
.sb-output-main{min-width:0;flex:1}.sb-output-name{font-size:12px;color:#1F2329;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sb-output-meta{font-size:10.5px;color:#8A8F99;margin-top:2px}
.sb-output-status{font-size:10px;color:#3D9950;font-weight:650;flex:none}
.sb-proof-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.sb-proof{background:#fff;border:1px solid rgba(15,15,15,.07);border-radius:10px;padding:9px 10px;min-width:0}.sb-proof-value{font-size:17px;font-weight:700;color:#1F2329;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sb-proof-label{font-size:10px;line-height:1.35;color:#8A8F99;margin-top:3px}
.sb-next{font-size:12px;line-height:1.6;color:#3F434A;background:#F1F5FF;border:1px solid rgba(59,107,212,.13);border-radius:10px;padding:10px 12px}
.sb-next.sb-attention{background:#FFF7E8;border-color:rgba(232,163,61,.25);color:#805B1B}
.sb-next-action{display:flex;gap:8px;margin-top:9px;flex-wrap:wrap}
.sb-next-action button{border:1px solid rgba(59,107,212,.2);background:#fff;color:#3B6BD4;border-radius:8px;padding:6px 10px;font:inherit;font-size:11px;cursor:pointer}
.sb-empty{font-size:12px;color:#8A8F99;background:#fff;border:1px dashed #DDE2E8;border-radius:10px;padding:12px}
@media(max-width:900px){.sb-drawer{width:min(44vw,500px);min-width:340px}}
@media(max-width:640px){.sb-drawer{width:100%;min-width:0}.sb-drawer-body{padding-left:14px;padding-right:14px}}
`;

let styleInjected = false;
function ensureStyle() {
  if (styleInjected) return;
  const tag = document.createElement("style");
  tag.textContent = CSS;
  document.head.appendChild(tag);
  styleInjected = true;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

export function avatarInitial(name) {
  return (name || "?").trim().slice(0, 1) || "?";
}

let drawerEls = null;
let drawerCleanup = null;
export function closeAgentDrawer() {
  drawerCleanup?.();
  drawerCleanup = null;
  if (drawerEls) {
    const host = drawerEls.find((node) => node?.dataset?.sbProgressHost === "1");
    host?.classList.remove("sb-progress-host");
    drawerEls.filter((node) => node !== host).forEach((node) => node.remove());
    drawerEls = null;
  }
}

function profileFallback(agentType) {
  return createDefaultProfile(agentType);
}

function statusClass(state) {
  if (state === TEAM_STATES.BUSY) return "sb-working";
  if (state === TEAM_STATES.WAITING_APPROVAL) return "sb-waiting";
  if (state === TEAM_STATES.BLOCKED) return "sb-blocked";
  return "";
}

function formatTime(value) {
  if (!value) return "刚刚";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "刚刚" : date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function progressFor(work, dashboard, status) {
  if (!work) return status.state === TEAM_STATES.WAITING_APPROVAL ? 92 : status.state === TEAM_STATES.BUSY ? 48 : 100;
  if (work.state === "done") return 100;
  const count = Math.min(4, work.activities?.length || 0);
  return Math.min(92, Math.max(18, 18 + count * 18));
}

function nextAction(agentType, work, status) {
  if (status.state === TEAM_STATES.WAITING_APPROVAL) return "等待你的审批后继续执行下一步。";
  if (work?.state === "done") return work.artifact ? `已完成本阶段，产出「${work.artifact}」，等待项目组接手。` : "已完成本阶段，等待项目组接手。";
  if (work) return "继续执行当前阶段，完成后会在项目群同步产出。";
  return AGENT_TYPE_DEFAULTS[agentType]?.responsibilities?.[0] ? `空闲中，下一项重点是：${AGENT_TYPE_DEFAULTS[agentType].responsibilities[0]}。` : "当前没有进行中的任务。";
}

function taskForAgent(agentType, projectId) {
  const tasks = listTasks()
    .filter((task) => !projectId || task.projectId === projectId)
    .filter((task) => task.runtimeAgentId === agentType || task.runtimeAgentName === agentType || agentType === "main")
    .sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0));
  return tasks[0] || null;
}

function taskStatusLabel(task, work, status) {
  if (work?.state === "done" || task?.status === "done") return "已完成";
  if (task?.status === "approval" || status.state === TEAM_STATES.WAITING_APPROVAL) return "待你确认";
  if (task?.status === "failed" || task?.status === "blocked" || status.state === TEAM_STATES.BLOCKED) return "遇到阻塞";
  if (work || task?.status === "progress" || status.state === TEAM_STATES.WORKING) return "执行中";
  return "空闲";
}

function taskProgress(task, work, status) {
  if (work) return progressFor(work, null, status);
  if (Number.isFinite(task?.runtimeProgress)) return Math.max(0, Math.min(100, Math.round(task.runtimeProgress)));
  if (task?.status === "done") return 100;
  if (task?.status === "approval") return 92;
  return 0;
}

function taskEvents(task, work) {
  const events = Array.isArray(task?.runtimeEvents) ? task.runtimeEvents : [];
  const eventRows = events
    .filter((event) => event?.text || event?.message)
    .slice(-6)
    .reverse()
    .map((event) => ({ text: event.text || event.message, at: event.createdAt || event.at || task.updated_at }));
  if (work?.activities?.length) return work.activities.slice(-6).reverse().map((text) => ({ text, at: work.startedAt }));
  return eventRows;
}

export function openAgentDrawer(agentType, profile, status, { teamLive, projectId = null, projectName = null, onChat = null } = {}) {
  ensureStyle();
  closeAgentDrawer();
  const safeProfile = profile || profileFallback(agentType);
  let currentStatus = status || teamLive?.getStatusOf?.(agentType) || { state: TEAM_STATES.IDLE };

  const mask = el("div", "sb-drawer-mask");
  const drawer = el("div", "sb-drawer");
  const host = document.querySelector('[class*="_rightPanel_"]');
  const inline = Boolean(host);
  if (inline) {
    host.classList.add("sb-progress-host");
    host.dataset.sbProgressHost = "1";
    drawer.classList.add("sb-drawer-inline");
  }
  drawer.setAttribute("role", "dialog");
  drawer.setAttribute("aria-label", `${safeProfile.identity?.name || agentType}工作进展`);

  const head = el("div", "sb-drawer-head");
  const headName = safeProfile.identity?.name || agentType;
  const headAvatar = el("div", `sb-agent-avatar${agentType === "main" ? " sb-main" : ""}`, avatarInitial(headName));
  mountAgentAvatar(headAvatar, agentType, { alt: headName });
  head.appendChild(headAvatar);
  const headText = el("div");
  headText.style.minWidth = "0";
  headText.appendChild(el("div", "sb-drawer-name", safeProfile.identity?.name || agentType));
  const titleRow = el("div", "sb-drawer-title");
  titleRow.appendChild(document.createTextNode(safeProfile.identity?.title || safeProfile.role?.position || agentType));
  const live = el("span", `sb-drawer-live ${statusClass(currentStatus.state)}`);
  live.appendChild(el("i"));
  live.appendChild(document.createTextNode(TEAM_STATE_LABELS[currentStatus.state] || "空闲"));
  titleRow.appendChild(live);
  headText.appendChild(titleRow);
  const closeBtn = el("button", "sb-drawer-close", "✕");
  closeBtn.setAttribute("aria-label", "关闭员工详情");
  head.append(headText, closeBtn);

  const body = el("div", "sb-drawer-body");
  function renderBody() {
    const work = getWorkForProject(agentType, projectId);
    const task = taskForAgent(agentType, projectId);
    const taskStatus = taskStatusLabel(task, work, currentStatus);
    const taskPct = taskProgress(task, work, currentStatus);
    const dashboard = memberDashboard(agentType, { teamLive, projectId, projectName });
    const story = memberResultStory(dashboard);
    const realFiles = listFiles().filter((file) => (!projectId || file.projectId === projectId) && (file.createdBy === safeProfile.identity?.name || file.createdBy === dashboard?.name));
    const files = realFiles.slice(0, 5);
    const events = taskEvents(task, work);
    body.textContent = "";
    const hero = el("section", "sb-work-hero");
    const heroTop = el("div", "sb-work-hero-top");
    heroTop.appendChild(el("div", "sb-work-kicker", "任务状态 / TASK STATUS"));
    heroTop.appendChild(el("div", `sb-work-state ${taskStatus === "已完成" ? "sb-done" : taskStatus === "空闲" ? "sb-idle" : ""}`, taskStatus));
    hero.appendChild(heroTop);
    hero.appendChild(el("div", "sb-work-task", task?.title || work?.task || currentStatus.currentTask || "当前没有分配任务"));
    hero.appendChild(el("div", "sb-work-phase", task?.preview || work?.phase || (task ? "任务已创建，等待执行事件" : "该成员当前没有进行中的任务")));
    const context = el("div", "sb-work-context");
    if (projectName) context.appendChild(el("span", null, `项目组 · ${projectName}`));
    if (task?.runtimeAgentName) context.appendChild(el("span", null, `责任人 · ${task.runtimeAgentName}`));
    if (task?.activeSkillName) context.appendChild(el("span", null, `阶段 · ${task.activeSkillName}`));
    if (context.childElementCount) hero.appendChild(context);
    const progressBar = el("div", "sb-work-progress");
    const progressI = el("i"); progressI.style.width = `${taskPct}%`; progressBar.appendChild(progressI); hero.appendChild(progressBar);
    const progressMeta = el("div", "sb-work-progress-meta");
    progressMeta.append(el("span", null, events.length ? `${events.length} 条最新事件` : "暂无执行事件"), el("span", null, `${taskPct}%`));
    hero.appendChild(progressMeta);
    body.appendChild(hero);

    const timelineSection = el("section", "sb-section");
    timelineSection.appendChild(el("div", "sb-section-title", "执行进展"));
    const timeline = el("div", "sb-timeline");
    if (!events.length) timeline.appendChild(el("div", "sb-empty", task ? "任务已建立，等待 Agent 回报第一条执行事件。" : "当前没有进行中的任务。"));
    for (const event of events) {
      const item = el("div", "sb-timeline-item");
      item.appendChild(document.createTextNode(event.text));
      item.appendChild(el("span", "sb-timeline-time", formatTime(event.at)));
      timeline.appendChild(item);
    }
    timelineSection.appendChild(timeline); body.appendChild(timelineSection);

    const outputSection = el("section", "sb-section");
    outputSection.appendChild(el("div", "sb-section-title", "交付物"));
    const outputList = el("div", "sb-output-list");
    if (!files.length) outputList.appendChild(el("div", "sb-empty", task ? "任务尚未生成可交付文件。" : "暂无与该成员关联的交付物。"));
    for (const file of files) {
      const row = el("div", "sb-output");
      row.appendChild(el("div", `sb-output-icon${file.type === "sheet" || file.name.endsWith(".csv") ? " sb-sheet" : ""}`, file.type === "sheet" || file.name.endsWith(".csv") ? "表" : "文"));
      const main = el("div", "sb-output-main");
      main.appendChild(el("div", "sb-output-name", file.name));
      main.appendChild(el("div", "sb-output-meta", `更新于 ${formatTime(file.updated_at || file.created_at)}`));
      row.appendChild(main);
      row.appendChild(el("span", "sb-output-status", "已落地"));
      outputList.appendChild(row);
    }
    outputSection.appendChild(outputList); body.appendChild(outputSection);

    if (taskStatus === "待你确认" || taskStatus === "遇到阻塞") {
      const attentionSection = el("section", "sb-section");
      attentionSection.appendChild(el("div", "sb-section-title", taskStatus === "待你确认" ? "待处理" : "异常说明"));
      const attention = el("div", "sb-next sb-attention", task?.preview || (taskStatus === "待你确认" ? "任务需要你的确认后才能继续。" : "任务执行遇到阻塞，请检查任务详情。"));
      attentionSection.appendChild(attention);
      body.appendChild(attentionSection);
    }

    if (story?.proof?.length && taskStatus !== "空闲") {
      const proofSection = el("section", "sb-section");
      proofSection.appendChild(el("div", "sb-section-title", "关键结果"));
      const grid = el("div", "sb-proof-grid");
      for (const item of story.proof.slice(0, 3)) {
        const card = el("div", "sb-proof");
        card.appendChild(el("div", "sb-proof-value", `${item.value ?? "—"}${item.unit || ""}`));
        card.appendChild(el("div", "sb-proof-label", item.label || "指标"));
        grid.appendChild(card);
      }
      proofSection.appendChild(grid); body.appendChild(proofSection);
    }

    const nextSection = el("section", "sb-section");
    nextSection.appendChild(el("div", "sb-section-title", "下一步"));
    const next = el("div", "sb-next", task ? (taskStatus === "已完成" ? "任务已完成，可在看板查看完整交付记录。" : nextAction(agentType, work, currentStatus)) : "暂无任务。你可以从首页提交一个新任务，系统会自动分配给合适的 Agent。");
    nextSection.appendChild(next);
    if (taskStatus === "待你确认") {
      const actions = el("div", "sb-next-action");
      const approve = el("button", null, "查看审批项");
      approve.addEventListener("click", () => onChat?.(agentType));
      actions.appendChild(approve);
      nextSection.appendChild(actions);
    }
    body.appendChild(nextSection);

    const footer = el("div");
    footer.style.cssText = "display:flex;gap:8px;margin-top:4px";
    if (onChat) {
      const chatBtn = el("button", "sb-output", "发消息给员工");
      chatBtn.style.cssText = "justify-content:center;color:#3B6BD4;cursor:pointer;font-weight:600";
      chatBtn.addEventListener("click", () => { closeAgentDrawer(); onChat(agentType); });
      footer.appendChild(chatBtn);
    }
    body.appendChild(footer);
  }
  renderBody();

  closeBtn.addEventListener("click", closeAgentDrawer);
  mask.addEventListener("click", closeAgentDrawer);
  drawer.append(head, body);
  if (inline) {
    host.appendChild(drawer);
    document.body.appendChild(mask);
  } else {
    document.body.append(mask, drawer);
  }
  drawerEls = inline ? [host, mask, drawer] : [mask, drawer];
  const refreshStatus = () => {
    if (!drawer.isConnected) return;
    currentStatus = teamLive?.getStatusOf?.(agentType) || currentStatus;
    const live = head.querySelector(".sb-drawer-live");
    if (live) {
      live.className = `sb-drawer-live ${statusClass(currentStatus.state)}`;
      live.lastChild.textContent = TEAM_STATE_LABELS[currentStatus.state] || "空闲";
    }
    renderBody();
  };
  const unsubscribeTeam = teamLive?.subscribe?.(refreshStatus) || (() => {});
  const unsubscribeWork = subscribeWork((changed) => {
    if (changed === null || changed === agentType) refreshStatus();
  });
  const unsubscribeTasks = subscribeTasks(() => refreshStatus());
  drawerCleanup = () => { unsubscribeTeam(); unsubscribeWork(); unsubscribeTasks(); };
  return { close: closeAgentDrawer };
}
