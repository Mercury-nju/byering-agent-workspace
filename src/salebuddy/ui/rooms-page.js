/**
 * ui/rooms-page.js (v2)
 * 项目组页：项目组列表 + 建群表单（PRD 十项定义）+ 群聊视图。
 * 群聊消息经 room.message.list / room.message.send，2s 轮询刷新。
 * 每个任务房间带完整定义：任务目标/负责人/参与 Agent/截止时间/资源预算/
 * 可用工具/数据权限/交付物/验收标准/最大尝试次数（room.action.create 落库）。
 */
import { el, openPage } from "./pages.js";
import { avatarInitial } from "./agent-drawer.js";
import { mountAgentAvatar, mountGroupAvatar } from "./agent-avatar.js";
import { BYERING_DEFAULT_AGENT_TYPES } from "../agents/model.js";
import { listHiredAgents, getMarketplaceAgent, assignAgentToProject } from "../agents/marketplace.js";
import { BRAND, displayAgentName, projectMessage } from "../brand.js";
import { memberDashboard, memberResultStory } from "../agents/metrics-store.js";
import { getWorkForProject } from "../agents/work-live.js";
import { createAgentActivityBadge } from "./agent-activity.js";

const CSS = `
.sb-rooms{max-width:720px;margin:0 auto;padding:20px}
.sb-rooms-top{display:flex;align-items:center;margin-bottom:14px}
.sb-rooms-count{font-size:12px;color:#8A8F99}
.sb-rooms-new{margin-left:auto;border:none;border-radius:9px;padding:8px 16px;font-size:12.5px;font-weight:600;background:#1F2329;color:#fff;cursor:pointer}
.sb-rooms-new:hover{background:#3F434A}
.sb-room-card{background:#fff;border:1px solid rgba(15,15,15,0.05);border-radius:14px;padding:16px;margin-bottom:12px;cursor:pointer}
.sb-room-card:hover{background:#F8F9FA}
.sb-room-card-head{display:flex;align-items:center;gap:12px}
.sb-room-card-avatar{width:40px;height:40px;border-radius:10px;flex:none;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:600;color:#fff;background:#7A8BA8;overflow:hidden}
.sb-room-card-name{font-size:15px;font-weight:600;color:#1F2329}
.sb-room-card-goal{font-size:12px;color:#8A8F99;margin-top:2px;line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.sb-room-card-meta{display:flex;gap:14px;margin-top:10px;font-size:12px;color:#8A8F99;flex-wrap:wrap}
.sb-room-card-chip{padding:1px 8px;border-radius:999px;background:rgba(15,15,15,0.05);font-size:11px;color:#5A5E66}
.sb-room-card-chip.sb-gold{background:rgba(232,163,61,0.14);color:#B87A1E;font-weight:600}
.sb-room-card-last{margin-top:8px;font-size:12px;color:#5A5E66;background:#F5F6F8;border-radius:8px;padding:8px 10px;line-height:1.5}
.sb-rooms-empty{font-size:13px;color:#8A8F99;text-align:center;padding:60px 0}

/* 建群表单 */
.sb-rform{max-width:640px;margin:0 auto;padding:22px 24px 40px}
.sb-rform-sec{background:#fff;border:1px solid rgba(15,15,15,0.06);border-radius:12px;padding:16px 18px;margin-bottom:12px}
.sb-rform-title{font-size:11.5px;font-weight:600;color:#8A8F99;letter-spacing:.04em;margin-bottom:12px}
.sb-rform-field{margin-bottom:14px}
.sb-rform-field:last-child{margin-bottom:0}
.sb-rform-label{display:block;font-size:12.5px;color:#3F434A;margin-bottom:6px}
.sb-rform-label i{font-style:normal;color:#C4453C;margin-left:2px}
.sb-rform-label small{color:#B0B4BB;font-size:11px;margin-left:6px}
.sb-rform-input,.sb-rform-textarea,.sb-rform-select{width:100%;border:1px solid rgba(15,15,15,0.12);border-radius:9px;padding:8px 12px;font-size:13px;font-family:inherit;color:#1F2329;outline:none;background:#fff;box-sizing:border-box}
.sb-rform-input:focus,.sb-rform-textarea:focus,.sb-rform-select:focus{border-color:rgba(76,154,255,0.55)}
.sb-rform-textarea{resize:vertical;min-height:56px;line-height:1.6}
.sb-rform-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 16px}
.sb-rform-chips{display:flex;flex-wrap:wrap;gap:7px}
.sb-rform-chip{padding:5px 12px;border-radius:999px;border:1px solid rgba(15,15,15,0.12);background:#fff;font-size:12px;color:#5A5E66;cursor:pointer}
.sb-rform-chip:hover{border-color:#3B6BD4;color:#3B6BD4}
.sb-rform-chip.sb-on{background:#1F2329;border-color:#1F2329;color:#fff}
.sb-rform-tags{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.sb-rform-tag{display:inline-flex;align-items:center;gap:5px;font-size:12px;padding:4px 10px;border-radius:8px;background:rgba(76,154,255,0.1);color:#3B6BD4}
.sb-rform-tagx{cursor:pointer;color:#B0B4BB}
.sb-rform-tagx:hover{color:#C4453C}
.sb-rform-taginput{border:1px dashed rgba(15,15,15,0.2);border-radius:8px;padding:4px 10px;font-size:12px;font-family:inherit;outline:none;width:110px}
.sb-rform-taginput:focus{border-color:#3B6BD4}
.sb-rform-actions{display:flex;align-items:center;gap:12px;margin-top:16px}
.sb-rform-submit{border:none;border-radius:10px;padding:11px 26px;font-size:13.5px;font-weight:600;background:#1F2329;color:#fff;cursor:pointer}
.sb-rform-submit:hover{background:#3F434A}
.sb-rform-submit:disabled{background:rgba(15,15,15,0.2);cursor:default}
.sb-rform-cancel{border:none;background:none;font-size:13px;color:#8A8F99;cursor:pointer;padding:8px}
.sb-rform-cancel:hover{color:#1F2329}
.sb-rform-error{font-size:12px;color:#C4453C}

/* 群聊 + 房间定义栏 */
.sb-chat{max-width:720px;margin:0 auto;display:flex;flex-direction:column;height:100%}
.sb-chat-def{flex:none;margin:12px 20px 0;background:#F0F5FF;border-radius:10px;overflow:hidden}
.sb-chat-defbar{display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer}
.sb-chat-defgoal{flex:1;min-width:0;color:#3B6BD4;font-size:12px;line-height:1.6}
.sb-chat-defchips{display:flex;gap:6px;flex:none}
.sb-chat-defchip{padding:2px 9px;border-radius:999px;background:rgba(59,107,212,0.1);color:#3B6BD4;font-size:11px;font-weight:600;white-space:nowrap}
.sb-chat-deftoggle{flex:none;font-size:11px;color:#3B6BD4;font-weight:600}
.sb-chat-defpanel{display:none;padding:2px 14px 12px;border-top:1px solid rgba(59,107,212,0.12)}
.sb-chat-defpanel.sb-open{display:block}
.sb-def-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 20px;margin-top:10px}
.sb-def-item{font-size:12px;line-height:1.6}
.sb-def-item b{display:block;font-size:10.5px;color:#8A8F99;font-weight:500;margin-bottom:2px}
.sb-def-item span{color:#1F2329}
.sb-def-item.sb-wide{grid-column:1 / -1}
.sb-chat-list{flex:1;overflow-y:auto;padding:16px 20px;display:flex;flex-direction:column;gap:14px}
.sb-msg{display:flex;gap:10px;align-items:flex-start}
.sb-msg.sb-mine{flex-direction:row-reverse}
.sb-msg-avatar{width:32px;height:32px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:600;color:#fff;background:#5B6B8C;overflow:hidden}
.sb-msg-avatar.sb-main{background:#1F2329}
.sb-msg-body{max-width:70%}
.sb-msg-name{font-size:11px;color:#8A8F99;margin-bottom:4px}
.sb-msg-name-row{justify-content:flex-start}
.sb-msg.sb-mine .sb-msg-name{text-align:right}
.sb-msg-bubble{background:#fff;border:1px solid rgba(15,15,15,0.06);border-radius:4px 14px 14px 14px;padding:9px 12px;font-size:13px;color:#1F2329;line-height:1.6;white-space:pre-wrap;word-break:break-word}
.sb-msg.sb-mine .sb-msg-bubble{background:#DCF0E2;border-color:transparent;border-radius:14px 4px 14px 14px}
.sb-chat-input{flex:none;display:flex;gap:10px;padding:12px 20px 16px;border-top:1px solid rgba(15,15,15,0.06);background:#FAFAFA}
.sb-chat-input textarea{flex:1;resize:none;height:40px;max-height:120px;border:1px solid rgba(15,15,15,0.1);border-radius:10px;padding:10px 12px;font-size:13px;font-family:inherit;color:#1F2329;outline:none;background:#fff}
.sb-chat-input textarea:focus{border-color:#3B6BD4}
.sb-chat-send{border:none;background:#1F2329;color:#fff;font-size:13px;padding:0 18px;border-radius:10px;cursor:pointer;height:40px}
.sb-chat-send:disabled{background:#C4C8CE;cursor:default}
.sb-chat-workrail{flex:none;margin:12px 20px 0;background:#fff;border:1px solid rgba(15,15,15,.07);border-radius:12px;padding:12px 13px}
.sb-chat-workrail-head{display:flex;align-items:center;gap:8px;margin-bottom:10px}.sb-chat-workrail-title{font-size:12px;font-weight:700;color:#1F2329}.sb-chat-workrail-note{font-size:10.5px;color:#8A8F99;margin-left:auto}
.sb-chat-workrail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.sb-workrail-item{min-width:0;background:#F8F9FB;border-radius:9px;padding:9px 10px}.sb-workrail-top{display:flex;align-items:center;gap:6px}.sb-workrail-dot{width:6px;height:6px;border-radius:50%;background:#AAB4C1;flex:none}.sb-workrail-dot.sb-on{background:#E8A33D;box-shadow:0 0 0 3px rgba(232,163,61,.13)}.sb-workrail-dot.sb-done{background:#57B26A}.sb-workrail-name{font-size:11.5px;font-weight:650;color:#3F434A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sb-workrail-state{margin-left:auto;font-size:10px;color:#8A8F99;flex:none}.sb-workrail-task{font-size:11px;color:#5A5E66;line-height:1.45;margin-top:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sb-workrail-bar{height:3px;border-radius:99px;background:#E5E8ED;overflow:hidden;margin-top:7px}.sb-workrail-bar i{display:block;height:100%;background:#3B6BD4;border-radius:99px}.sb-workrail-output{font-size:10px;color:#3D9950;margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sb-msg-context{margin-top:8px;border:1px solid rgba(59,107,212,.13);border-radius:9px;background:#F5F8FF;padding:8px 10px}.sb-msg-context-label{font-size:10px;color:#3B6BD4;font-weight:700;margin-bottom:3px}.sb-msg-context-text{font-size:11.5px;color:#3F434A;line-height:1.5}.sb-msg-context-output{font-size:10.5px;color:#3D9950;margin-top:4px}
@media(max-width:560px){.sb-chat-workrail-grid{grid-template-columns:1fr}.sb-chat-workrail{margin-left:12px;margin-right:12px}.sb-chat-list{padding-left:12px;padding-right:12px}.sb-msg-body{max-width:82%}}
`;

let styleInjected = false;
function ensureStyle() {
  if (styleInjected) return;
  const tag = document.createElement("style");
  tag.textContent = CSS;
  document.head.appendChild(tag);
  styleInjected = true;
}

function memberName(teamLive, agentType) {
  const profile = teamLive?.getProfiles?.().get(agentType);
  if (profile?.identity?.name) return displayAgentName({ agentType, name: profile.identity.name });
  const market = getMarketplaceAgent(agentType);
  if (market) return displayAgentName({ id: agentType, name: market.name });
  return agentType === "main" ? BRAND.name : displayAgentName({ agentType }) || agentType || "—";
}

function groupMembers(room) {
  return [...new Set([room?.owner, ...(room?.members || [])].filter(Boolean))];
}

function formatDeadline(deadline) {
  if (!deadline) return null;
  const d = new Date(deadline);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function buildRoomCard(room, teamLive, onOpen) {
  const card = el("div", "sb-room-card");
  const head = el("div", "sb-room-card-head");
  const groupAvatar = el("div", "sb-room-card-avatar");
  mountGroupAvatar(groupAvatar, groupMembers(room), { alt: `${room.name || "项目组"}成员头像` });
  head.appendChild(groupAvatar);
  const headText = el("div");
  headText.style.minWidth = "0";
  headText.appendChild(el("div", "sb-room-card-name", room.name || "未命名项目组"));
  headText.appendChild(el("div", "sb-room-card-goal", room.goal || ""));
  head.appendChild(headText);
  const meta = el("div", "sb-room-card-meta");
  meta.append(
    el("span", null, `负责人：${memberName(teamLive, room.owner)}`),
    el("span", null, `成员：${(room.members || []).length} 人`),
    el("span", null, room.status === "active" ? "进行中" : "已结束")
  );
  const deadline = formatDeadline(room.deadline);
  if (deadline) meta.appendChild(el("span", "sb-room-card-chip sb-gold", `截止 ${deadline}`));
  if (room.budget != null) meta.appendChild(el("span", "sb-room-card-chip", `预算 ¥${room.budget}`));
  if ((room.deliverables || []).length) meta.appendChild(el("span", "sb-room-card-chip", `交付 ${room.deliverables.length} 项`));
  card.append(head, meta);
  if (room.lastMessage) card.appendChild(el("div", "sb-room-card-last", room.lastMessage));
  card.addEventListener("click", () => onOpen(room));
  return card;
}

function workProgress(work) {
  if (!work) return 0;
  if (work.state === "done") return 100;
  return Math.min(92, Math.max(16, 16 + (work.activities?.length || 0) * 18));
}

function buildWorkRail(room, teamLive) {
  const rail = el("section", "sb-chat-workrail");
  const head = el("div", "sb-chat-workrail-head");
  head.appendChild(el("div", "sb-chat-workrail-title", "团队正在做什么"));
  head.appendChild(el("div", "sb-chat-workrail-note", "状态与聊天实时同步"));
  rail.appendChild(head);
  const grid = el("div", "sb-chat-workrail-grid");
  const members = [...new Set([room.owner, ...(room.members || [])])].filter(Boolean);
  for (const agentType of members) {
    const work = getWorkForProject(agentType, room.id);
    const status = teamLive?.getStatusOf?.(agentType) || { state: "idle", currentTask: null };
    const dashboard = memberDashboard(agentType, { teamLive, projectId: room.id, projectName: room.name });
    const story = memberResultStory(dashboard);
    const item = el("div", "sb-workrail-item");
    const top = el("div", "sb-workrail-top");
    top.appendChild(el("i", `sb-workrail-dot${work?.state === "done" ? " sb-done" : work ? " sb-on" : ""}`));
    top.appendChild(el("span", "sb-workrail-name", memberName(teamLive, agentType)));
    top.appendChild(el("span", "sb-workrail-state", work?.state === "done" ? "已完成" : work ? "进行中" : "待命"));
    item.appendChild(top);
    item.appendChild(el("div", "sb-workrail-task", work?.phase || work?.task || status.currentTask || dashboard?.headline || "等待任务"));
    const bar = el("div", "sb-workrail-bar"); const barI = el("i"); barI.style.width = `${workProgress(work)}%`; bar.appendChild(barI); item.appendChild(bar);
    const latestOutput = work?.artifact || dashboard?.recentFiles?.[0]?.name || "";
    const storyOutput = story?.primary ? `${story.primary.value}${story.primary.unit}` : "";
    const output = latestOutput ? `最新结果：${latestOutput}` : storyOutput ? `关键结果：${storyOutput}` : "暂无产出";
    item.appendChild(el("div", "sb-workrail-output", output));
    grid.appendChild(item);
  }
  if (!members.length) grid.appendChild(el("div", "sb-empty", "项目组还没有成员"));
  rail.appendChild(grid);
  return rail;
}

function buildMessageNode(message, teamLive, room) {
  message = projectMessage(message);
  const mine = message.from === "user";
  const row = el("div", `sb-msg${mine ? " sb-mine" : ""}`);
  const avatar = el("div", `sb-msg-avatar${message.from === "main" ? " sb-main" : ""}`, avatarInitial(message.fromName));
  mountAgentAvatar(avatar, message.agentType || message.from, { alt: message.fromName || message.from });
  row.appendChild(avatar);
  const body = el("div", "sb-msg-body");
  const agentType = message.agentType || message.from;
  const work = !mine ? getWorkForProject(agentType, room?.id) : null;
  const status = teamLive?.getStatusOf?.(agentType) || { state: "idle" };
  const nameRow = el("div", "sb-msg-name-row");
  nameRow.appendChild(el("div", "sb-msg-name", message.fromName || message.from || ""));
  const activity = createAgentActivityBadge(agentType, { status, work });
  if (activity) nameRow.appendChild(activity);
  body.appendChild(nameRow);
  body.appendChild(el("div", "sb-msg-bubble", message.text || ""));
  if (work || message.status || message.output) {
    const context = el("div", "sb-msg-context");
    context.appendChild(el("div", "sb-msg-context-label", work?.state === "done" ? "已完成这一阶段" : "正在执行"));
    context.appendChild(el("div", "sb-msg-context-text", message.activity || work?.phase || work?.task || message.status || "工作状态已同步"));
    if (message.output || work?.artifact) context.appendChild(el("div", "sb-msg-context-output", `产出：${message.output || work.artifact}`));
    body.appendChild(context);
  }
  row.appendChild(body);
  return row;
}

/* 群聊顶部的房间定义栏：摘要一行 + 展开完整十项定义 */
function buildDefBar(room, teamLive) {
  const box = el("div", "sb-chat-def notranslate");
  box.setAttribute("translate", "no");
  const bar = el("div", "sb-chat-defbar");
  bar.appendChild(el("div", "sb-chat-defgoal", `目标：${room.goal || "未填写"}`));
  const chips = el("div", "sb-chat-defchips");
  const deadline = formatDeadline(room.deadline);
  if (deadline) chips.appendChild(el("span", "sb-chat-defchip", `截止 ${deadline}`));
  if (room.budget != null) chips.appendChild(el("span", "sb-chat-defchip", `¥${room.budget}`));
  if ((room.deliverables || []).length) chips.appendChild(el("span", "sb-chat-defchip", `交付 ${room.deliverables.length} 项`));
  bar.appendChild(chips);
  const toggle = el("span", "sb-chat-deftoggle", "定义 ›");
  bar.appendChild(toggle);

  const panel = el("div", "sb-chat-defpanel");
  const grid = el("div", "sb-def-grid");
  const item = (label, value, wide = false) => {
    const node = el("div", `sb-def-item${wide ? " sb-wide" : ""}`);
    node.appendChild(el("b", null, label));
    node.appendChild(el("span", null, value || "—"));
    return node;
  };
  grid.appendChild(item("负责人", memberName(teamLive, room.owner)));
  grid.appendChild(item("参与 Agent", (room.members || []).map((m) => memberName(teamLive, m)).join("、")));
  grid.appendChild(item("截止时间", formatDeadline(room.deadline) || "未设置"));
  grid.appendChild(item("资源预算", room.budget != null ? `¥${room.budget}` : "不限"));
  grid.appendChild(item("可用工具", (room.tools || []).join("、") || null, true));
  grid.appendChild(item("数据权限", (room.dataScope || []).join("、") || null, true));
  grid.appendChild(item("交付物", (room.deliverables || []).join("、") || null, true));
  grid.appendChild(item("验收标准", room.acceptance || null, true));
  grid.appendChild(item("最大尝试次数", room.maxRetries != null ? `${room.maxRetries} 次` : "3 次"));
  panel.appendChild(grid);

  bar.addEventListener("click", () => {
    const open = panel.classList.toggle("sb-open");
    toggle.textContent = open ? "收起 ∧" : "定义 ›";
  });
  box.append(bar, panel);
  return box;
}

/**
 * 打开项目组页。
 * deps: { gateway, teamLive, initialRoom? } —— initialRoom 传入时直接进群聊。
 */
export async function openRoomsPage({ gateway, teamLive, initialRoom = null, onClose = null }) {
  ensureStyle();
  const page = openPage({ title: "项目组", onClose });
  let pollTimer = null;
  const stopPolling = () => { clearInterval(pollTimer); pollTimer = null; };
  const origClose = page.close;
  page.close = () => { stopPolling(); origClose(); };

  async function fetchRooms() {
    if (!gateway) return [];
    try { return (await gateway.action("room.action.list"))?.data?.rooms || []; }
    catch { return []; }
  }

  // ── 列表 ──
  function renderList(rooms) {
    stopPolling();
    page.setTitle("项目组");
    page.showBack(false);
    page.body.textContent = "";
    const container = el("div", "sb-rooms");
    const top = el("div", "sb-rooms-top");
    top.appendChild(el("span", "sb-rooms-count", rooms.length ? `${rooms.length} 个项目组` : ""));
    if (gateway) {
      const newBtn = el("button", "sb-rooms-new", "+ 新建项目组");
      newBtn.addEventListener("click", () => renderCreateForm());
      top.appendChild(newBtn);
    }
    container.appendChild(top);
    if (!gateway) {
      container.appendChild(el("div", "sb-rooms-empty", "gateway 未连接，暂时无法读取项目组"));
    } else if (!rooms.length) {
      container.appendChild(el("div", "sb-rooms-empty", "还没有项目组，点右上角新建一个"));
    } else {
      for (const room of rooms) {
        container.appendChild(buildRoomCard(room, teamLive, () => renderChat(room)));
      }
    }
    page.body.appendChild(container);
  }

  // ── 建群表单（PRD 十项定义）──
  function renderCreateForm() {
    stopPolling();
    page.setTitle("新建项目组");
    page.showBack(true, async () => renderList(await fetchRooms()));
    page.body.textContent = "";

    const profiles = teamLive?.getProfiles?.() || new Map();
    const hired = listHiredAgents();
    const hiredIds = new Set(hired.map(({ id }) => id));
    const agentOptions = [
      ...BYERING_DEFAULT_AGENT_TYPES
        .filter((type) => profiles.has(type) && !hiredIds.has(type))
        .map((type) => ({ id: type, name: memberName(teamLive, type) })),
      ...hired.map((a) => ({ id: a.id, name: displayAgentName({ id: a.id, name: a.name }) }))
    ];
    const form = {
      name: "", goal: "", owner: "main",
      members: new Set(agentOptions.map((a) => a.id)),
      deadline: "", budget: "", tools: [], dataScope: [], deliverables: [],
      acceptance: "", maxRetries: 3
    };

    const wrap = el("div", "sb-rform notranslate");
    wrap.setAttribute("translate", "no");

    const field = (labelText, input, { required = false, hint = "" } = {}) => {
      const box = el("div", "sb-rform-field");
      const label = el("label", "sb-rform-label", labelText);
      if (required) label.appendChild(el("i", null, "*"));
      if (hint) label.appendChild(el("small", null, hint));
      box.append(label, input);
      return box;
    };
    const textInput = (placeholder, onInput, type = "text") => {
      const input = el("input", "sb-rform-input");
      input.type = type;
      input.placeholder = placeholder;
      input.addEventListener("input", () => onInput(input.value));
      return input;
    };
    const tagEditor = (items, placeholder) => {
      const box = el("div", "sb-rform-tags");
      const redraw = () => {
        box.textContent = "";
        items.forEach((item, index) => {
          const tag = el("span", "sb-rform-tag", item);
          const x = el("span", "sb-rform-tagx", "✕");
          x.addEventListener("click", () => { items.splice(index, 1); redraw(); });
          tag.appendChild(x);
          box.appendChild(tag);
        });
        const input = el("input", "sb-rform-taginput");
        input.placeholder = placeholder;
        input.addEventListener("keydown", (event) => {
          if (event.key === "Enter" && input.value.trim()) {
            items.push(input.value.trim());
            redraw();
          }
        });
        box.appendChild(input);
      };
      redraw();
      return box;
    };

    // 基本信息
    const baseSec = el("div", "sb-rform-sec");
    baseSec.appendChild(el("div", "sb-rform-title", "基本信息"));
    baseSec.appendChild(field("项目组名称", textInput("例如：Q3 大客户回访项目组", (v) => { form.name = v; }), { required: true }));
    baseSec.appendChild(field("任务目标", (() => {
      const ta = el("textarea", "sb-rform-textarea");
      ta.placeholder = "这个项目要达成什么？尽量可衡量";
      ta.addEventListener("input", () => { form.goal = ta.value; });
      return ta;
    })(), { required: true }));
    const ownerSel = el("select", "sb-rform-select");
    for (const opt of agentOptions) {
      const option = document.createElement("option");
      option.value = opt.id;
      option.textContent = opt.name;
      ownerSel.appendChild(option);
    }
    ownerSel.value = "main";
    ownerSel.addEventListener("change", () => { form.owner = ownerSel.value; form.members.add(ownerSel.value); drawMemberChips(); });
    baseSec.appendChild(field("负责人", ownerSel, { hint: "负责任务协调、预算与质量" }));
    const memberChips = el("div", "sb-rform-chips");
    function drawMemberChips() {
      memberChips.textContent = "";
      for (const opt of agentOptions) {
        const on = form.members.has(opt.id);
        const chip = el("button", `sb-rform-chip${on ? " sb-on" : ""}`, opt.name);
        chip.addEventListener("click", () => {
          if (opt.id === form.owner) return; // 负责人固定参与
          if (form.members.has(opt.id)) form.members.delete(opt.id);
          else form.members.add(opt.id);
          drawMemberChips();
        });
        memberChips.appendChild(chip);
      }
    }
    drawMemberChips();
    baseSec.appendChild(field("参与 Agent", memberChips));
    wrap.appendChild(baseSec);

    // 资源与约束
    const resSec = el("div", "sb-rform-sec");
    resSec.appendChild(el("div", "sb-rform-title", "资源与约束"));
    const grid = el("div", "sb-rform-grid");
    const deadlineInput = el("input", "sb-rform-input");
    deadlineInput.type = "datetime-local";
    deadlineInput.addEventListener("input", () => { form.deadline = deadlineInput.value; });
    grid.appendChild(field("截止时间", deadlineInput));
    grid.appendChild(field("资源预算", textInput("不限", (v) => { form.budget = v; }, "number"), { hint: "¥" }));
    const retriesInput = textInput("3", (v) => { form.maxRetries = v; }, "number");
    retriesInput.value = "3";
    grid.appendChild(field("最大尝试次数", retriesInput, { hint: "失败自动重试上限" }));
    resSec.appendChild(grid);
    resSec.appendChild(field("可用工具", tagEditor(form.tools, "添加工具，回车")));
    resSec.appendChild(field("数据权限", tagEditor(form.dataScope, "添加数据范围，回车")));
    wrap.appendChild(resSec);

    // 交付与验收
    const delSec = el("div", "sb-rform-sec");
    delSec.appendChild(el("div", "sb-rform-title", "交付与验收"));
    delSec.appendChild(field("交付物", tagEditor(form.deliverables, "如：线索清单，回车")));
    delSec.appendChild(field("验收标准", (() => {
      const ta = el("textarea", "sb-rform-textarea");
      ta.placeholder = "怎样算完成？例如：200 个有效潜客，补全率 ≥ 60%";
      ta.addEventListener("input", () => { form.acceptance = ta.value; });
      return ta;
    })()));
    wrap.appendChild(delSec);

    // 提交
    const actions = el("div", "sb-rform-actions");
    const submit = el("button", "sb-rform-submit", "创建项目组");
    const cancel = el("button", "sb-rform-cancel", "取消");
    const error = el("span", "sb-rform-error");
    cancel.addEventListener("click", async () => renderList(await fetchRooms()));
    submit.addEventListener("click", async () => {
      error.textContent = "";
      if (!form.name.trim()) { error.textContent = "请填写项目组名称"; return; }
      if (!form.goal.trim()) { error.textContent = "请填写任务目标"; return; }
      submit.disabled = true;
      try {
        const room = (await gateway.action("room.action.create", {
          name: form.name.trim(),
          goal: form.goal.trim(),
          owner: form.owner,
          members: [...form.members],
          deadline: form.deadline || null,
          budget: form.budget === "" ? null : Number(form.budget),
          tools: form.tools,
          dataScope: form.dataScope,
          deliverables: form.deliverables,
          acceptance: form.acceptance.trim(),
          maxRetries: Number(form.maxRetries) || 3
        }))?.data?.room;
        if (!room) throw new Error("创建失败");
        for (const agent of hired) {
          if (form.members.has(agent.id)) assignAgentToProject(agent.id, room.id);
        }
        // 负责人发出开工消息
        await gateway.action("room.message.send", {
          roomId: room.id,
          from: room.owner || "main",
          fromName: memberName(teamLive, room.owner || "main"),
          text: `项目组已成立。目标：${room.goal}${room.acceptance ? `。验收标准：${room.acceptance}` : ""}。开工。`
        });
        renderChat(room);
      } catch {
        error.textContent = "创建失败，请重试";
        submit.disabled = false;
      }
    });
    actions.append(submit, cancel, error);
    wrap.appendChild(actions);
    page.body.appendChild(wrap);
  }

  // ── 群聊 ──
  function renderChat(room) {
    stopPolling();
    page.setTitle(room.name || "项目组");
    page.showBack(true, async () => renderList(await fetchRooms()));
    page.body.textContent = "";
    const chat = el("div", "sb-chat");
    chat.appendChild(buildDefBar(room, teamLive));
    let workRail = buildWorkRail(room, teamLive);
    chat.appendChild(workRail);
    const list = el("div", "sb-chat-list");
    chat.appendChild(list);

    const inputWrap = el("div", "sb-chat-input");
    const textarea = document.createElement("textarea");
    textarea.placeholder = "发到项目群…（Enter 发送，Shift+Enter 换行）";
    const sendBtn = el("button", "sb-chat-send", "发送");
    inputWrap.append(textarea, sendBtn);
    chat.appendChild(inputWrap);
    page.body.appendChild(chat);

    let lastMessageId = null;
    async function refreshMessages({ scroll = false } = {}) {
      try {
        const messages = (await gateway.action("room.message.list", { roomId: room.id }))?.data?.messages || [];
        const nextRail = buildWorkRail(room, teamLive);
        workRail.replaceWith(nextRail);
        workRail = nextRail;
        const newest = messages[messages.length - 1];
        if (newest?.id === lastMessageId && list.childElementCount === messages.length) return;
        lastMessageId = newest?.id || null;
        list.textContent = "";
        for (const message of messages) list.appendChild(buildMessageNode(message, teamLive, room));
        if (scroll || true) list.scrollTop = list.scrollHeight;
      } catch { /* 保持现状 */ }
    }

    async function send() {
      const text = textarea.value.trim();
      if (!text) return;
      sendBtn.disabled = true;
      try {
        await gateway.action("room.message.send", { roomId: room.id, from: "user", fromName: "我", text });
        textarea.value = "";
        await refreshMessages({ scroll: true });
      } finally { sendBtn.disabled = false; }
    }
    sendBtn.addEventListener("click", send);
    textarea.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(); }
    });

    refreshMessages({ scroll: true });
    pollTimer = setInterval(() => refreshMessages(), 2000);
  }

  if (initialRoom) renderChat(initialRoom);
  else renderList(await fetchRooms());
  return page;
}
