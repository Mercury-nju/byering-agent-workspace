/**
 * ui/contacts-page.js (v3)
 * 通讯录（双栏 master-detail）：
 *   左栏：好友（团队成员，状态与办公室同源）+ 群组（项目组）列表
 *   右栏：选中对象的详情——成员：发消息（1:1 私聊）/ 云电脑（工作区文件）/ 配置（档案）；
 *         群组：目标与成员概览 + 进入群聊。
 */
import { el, openPage } from "./pages.js";
import { TEAM_STATE_LABELS, TEAM_STATES } from "../agents/status.js";
import { avatarInitial } from "./agent-drawer.js";
import { createSnapshotScreen, createLiveBadge } from "./cloud-desktop.js";
import { listHiredAgents, getMarketplaceAgent, getEmployment, markEmploymentWelcome } from "../agents/marketplace.js";
import { renderAgentProfile } from "./agent-profile.js";
import { addFile } from "../agents/file-store.js";
import { openFileCenterPage } from "./file-center.js";
import { projectMessage } from "../brand.js";
import { getWork, subscribeWork } from "../agents/work-live.js";
import { mountAgentAvatar, mountGroupAvatar } from "./agent-avatar.js";
import { createAgentActivityBadge } from "./agent-activity.js";

export const ROOM_DETAIL_ACTIONS = Object.freeze(["查看数据", "查看文件"]);

export function roomDataTarget(room) {
  return {
    projectId: room?.id || null,
    projectName: room?.name || ""
  };
}

const CSS = `
.sb-contacts2{display:flex;height:100%;min-height:0}
.sb-clist{width:300px;flex:none;border-right:1px solid rgba(15,15,15,0.06);overflow-y:auto;padding:10px}
.sb-cgroup-title{font-size:11px;font-weight:600;color:#8A8F99;letter-spacing:.4px;padding:10px 8px 6px;display:flex;gap:6px;align-items:baseline}
.sb-cgroup-count{font-weight:400;color:#B0B4BB}
.sb-cgroup-recruit{margin-left:auto;display:inline-flex;align-items:center;gap:4px;border:0;border-radius:7px;padding:4px 7px;background:transparent;color:#3B6BD4;font:inherit;font-size:11px;font-weight:600;cursor:pointer}
.sb-cgroup-recruit:hover{background:rgba(59,107,212,0.08)}
.sb-cgroup-recruit:focus-visible{outline:2px solid rgba(59,107,212,0.35);outline-offset:1px}
.sb-cgroup-recruit svg{width:14px;height:14px;display:block}
.sb-crow{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:10px;cursor:pointer}
.sb-crow:hover{background:rgba(15,15,15,0.04)}
.sb-crow.sb-on{background:rgba(15,15,15,0.06)}
.sb-cavatar{width:36px;height:36px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;color:#fff;background:#5B6B8C;overflow:hidden}
.sb-cavatar.sb-main{background:#1F2329}
.sb-cavatar.sb-room{border-radius:10px;background:#7A8BA8}
.sb-ctext{flex:1;min-width:0}
.sb-cname{font-size:13.5px;font-weight:500;color:#1F2329;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sb-cname-row{flex-wrap:wrap}
.sb-csub{font-size:11.5px;color:#8A8F99;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:flex;align-items:center;gap:4px}
.sb-cdot{width:6px;height:6px;border-radius:50%;background:#57B26A;flex:none}
.sb-cdot.sb-busy{background:#E8A33D}
.sb-cdot.sb-waiting{background:#D45B5B}
.sb-cempty{font-size:12px;color:#B0B4BB;padding:8px 10px}

.sb-cdetail{flex:1;min-width:0;display:flex;flex-direction:column}
.sb-cplaceholder{flex:1;display:flex;align-items:center;justify-content:center;font-size:13px;color:#B0B4BB}
.sb-chead{flex:none;text-align:center;padding:30px 24px 18px}
.sb-chead-avatar{width:84px;height:84px;border-radius:50%;margin:0 auto 12px;display:flex;align-items:center;justify-content:center;font-size:32px;font-weight:600;color:#fff;background:#5B6B8C;overflow:hidden}
.sb-chead-avatar.sb-main{background:#1F2329}
.sb-chead-avatar.sb-room{border-radius:22px;background:#7A8BA8}
.sb-chead-name{font-size:18px;font-weight:600;color:#1F2329}
.sb-chead-status{font-size:12px;color:#8A8F99;margin-top:6px;display:flex;align-items:center;justify-content:center;gap:6px}
.sb-chead-goal{font-size:12px;color:#5A5E66;margin-top:10px;line-height:1.6;max-width:420px;margin-left:auto;margin-right:auto}
.sb-cactions{flex:none;display:flex;gap:10px;justify-content:center;padding:0 24px 16px}
.sb-caction{appearance:none;display:flex;flex-direction:column;align-items:center;gap:6px;width:104px;padding:12px 0;border:1px solid rgba(15,15,15,0.08);border-radius:12px;background:#fff;cursor:pointer;font:inherit;font-size:12px;color:#1F2329}
.sb-caction:hover{background:#F5F6F8}
.sb-caction.sb-on{border-color:#1F2329}
.sb-caction svg{width:18px;height:18px}
.sb-caction-primary{background:#1F2329;color:#fff;border-color:#1F2329}
.sb-caction-primary:hover{background:#33373F}
.sb-ccontent{flex:1;min-height:0;display:flex;flex-direction:column;border-top:1px solid rgba(15,15,15,0.06)}
.sb-chead-friend{display:flex;align-items:center;gap:10px;text-align:left;padding:12px 18px 10px;border-bottom:1px solid rgba(15,15,15,0.06)}
.sb-chead-friend .sb-chead-avatar{width:44px;height:44px;margin:0;font-size:19px;flex:none}
.sb-chead-text{min-width:0;flex:1}.sb-chead-friend .sb-chead-name{font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sb-chead-friend .sb-chead-status{justify-content:flex-start;margin-top:3px}
.sb-cactions-friend{justify-content:flex-start;gap:7px;padding:8px 18px 9px;border-bottom:1px solid rgba(15,15,15,0.06)}
.sb-cactions-friend .sb-caction{flex:0 0 auto;flex-direction:row;gap:6px;width:auto;min-width:0;padding:7px 11px;border-radius:8px}.sb-cactions-friend .sb-caction svg{width:15px;height:15px}

.sb-chat-list2{flex:1;overflow-y:auto;padding:16px 24px;display:flex;flex-direction:column;gap:12px}
.sb-msg{display:flex;gap:10px;align-items:flex-start}
.sb-msg.sb-mine{flex-direction:row-reverse}
.sb-msg-avatar{width:30px;height:30px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;color:#fff;background:#5B6B8C;overflow:hidden}
.sb-msg-avatar.sb-main{background:#1F2329}
.sb-msg-body{max-width:70%}
.sb-msg-name{font-size:11px;color:#8A8F99;margin-bottom:3px}
.sb-msg.sb-mine .sb-msg-name{text-align:right}
.sb-msg-bubble{background:#fff;border:1px solid rgba(15,15,15,0.06);border-radius:4px 12px 12px 12px;padding:8px 11px;font-size:13px;color:#1F2329;line-height:1.6;white-space:pre-wrap;word-break:break-word}
.sb-msg.sb-mine .sb-msg-bubble{background:#DCF0E2;border-color:transparent;border-radius:12px 4px 12px 12px}
.sb-dm-artifact{width:100%;margin-top:7px;border:1px solid rgba(15,15,15,0.08);border-radius:12px;background:linear-gradient(135deg,#fff 0%,#F8FAFC 100%);padding:11px;text-align:left;font-family:inherit;cursor:pointer;display:flex;align-items:center;gap:10px;transition:border-color .15s ease,transform .15s ease,box-shadow .15s ease}
.sb-dm-artifact:hover{border-color:rgba(59,107,212,0.32);transform:translateY(-1px);box-shadow:0 8px 24px rgba(31,35,41,0.07)}
.sb-dm-fileico{width:36px;height:36px;border-radius:9px;flex:none;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;letter-spacing:.3px;background:rgba(59,107,212,0.1);color:#3B6BD4}
.sb-dm-fileico.sb-sheet{background:rgba(47,125,63,0.11);color:#2F7D3F}
.sb-dm-filebody{display:block;flex:1;min-width:0}
.sb-dm-filename{display:block;font-size:12.5px;font-weight:600;color:#1F2329;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sb-dm-filesummary{display:block;font-size:11px;color:#8A8F99;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sb-dm-filego{flex:none;display:flex;flex-direction:column;align-items:flex-end;gap:4px}
.sb-dm-filestatus{font-size:10px;color:#2F7D3F;background:rgba(87,178,106,0.1);border-radius:999px;padding:2px 7px}
.sb-dm-filelink{font-size:10.5px;color:#3B6BD4;font-weight:600}
.sb-chat-input2{flex:none;display:flex;gap:10px;padding:12px 24px 14px;border-top:1px solid rgba(15,15,15,0.06)}
.sb-chat-input2 textarea{flex:1;resize:none;height:38px;max-height:120px;border:1px solid rgba(15,15,15,0.1);border-radius:10px;padding:9px 12px;font-size:13px;font-family:inherit;color:#1F2329;outline:none;background:#fff}
.sb-chat-input2 textarea:focus{border-color:#3B6BD4}
.sb-chat-send2{border:none;background:#1F2329;color:#fff;font-size:13px;padding:0 16px;border-radius:10px;cursor:pointer;height:38px}
.sb-chat-send2:disabled{background:#C4C8CE;cursor:default}

.sb-pane{flex:1;overflow-y:auto;padding:18px 28px}
.sb-pane-title{font-size:12px;font-weight:600;color:#8A8F99;letter-spacing:.4px;margin:14px 0 8px}
.sb-pane-title:first-child{margin-top:0}
.sb-file-row{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;font-size:13px;color:#1F2329;background:#fff;border:1px solid rgba(15,15,15,0.05);margin-bottom:6px}
.sb-file-size{margin-left:auto;flex:none;font-size:11px;color:#B0B4BB}
.sb-pane-empty{font-size:12px;color:#B0B4BB;padding:6px 2px}
.sb-kv{display:flex;font-size:13px;color:#1F2329;padding:5px 0;gap:12px}
.sb-kv b{font-weight:500;color:#5A5E66;flex:none;width:72px}
.sb-tag{display:inline-block;font-size:11px;padding:2px 8px;margin:2px 4px 2px 0;border-radius:8px;background:rgba(15,15,15,0.05);color:#5A5E66}
.sb-pane-path{font-size:11px;color:#B0B4BB;margin-bottom:4px;word-break:break-all}
`;

let styleInjected = false;
const welcomeInFlight = new Set();
function ensureStyle() {
  if (styleInjected) return;
  const tag = document.createElement("style");
  tag.textContent = CSS;
  document.head.appendChild(tag);
  styleInjected = true;
}

const ICONS = {
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-4.5-7.8L21 3l-.8 3.6A8.9 8.9 0 0 1 21 12z"/><path d="M8 10h8M8 14h5"/></svg>',
  recruit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3"/><path d="M3.5 19c.7-3 2.5-4.5 5.5-4.5s4.8 1.5 5.5 4.5M18 8v6M15 11h6"/></svg>',
  cloud: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M9 20h6M12 16v4"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1"/></svg>',
  enter: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  data: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 16v-4M12 16V8M17 16v-7"/></svg>',
  files: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h4l2 2h5A2.5 2.5 0 0 1 20 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5z"/><path d="M4.5 9h15"/></svg>'
};

function dotClass(state) {
  if (state === TEAM_STATES.WORKING) return "sb-busy";
  if (state === TEAM_STATES.BLOCKED) return "sb-waiting";
  return "";
}

function fmtSize(bytes) {
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function groupMembers(room) {
  return [...new Set([room?.owner, ...(room?.members || [])].filter(Boolean))];
}

/**
 * 打开通讯录页。
 * deps: { teamLive, gateway, onOpenRoom(room), onOpenData(room), onOpenFiles(room), onRecruit, onClose, initialFriend }
 * initialFriend：打开后自动选中该成员并进入私聊（agentType）。
 */
export async function openContactsPage({ teamLive, gateway, onOpenRoom, onOpenData, onOpenFiles, onRecruit, onClose, initialFriend = null }) {
  ensureStyle();
  const page = openPage({ title: "成员", onClose });
  // The contacts workspace already provides its own master-detail context;
  // remove the generic page header so the member list starts at the top edge.
  page.root.querySelector(".sb-page-head")?.remove();
  const root = el("div", "sb-contacts2");
  const listCol = el("div", "sb-clist");
  const detailCol = el("div", "sb-cdetail");
  root.append(listCol, detailCol);
  page.body.appendChild(root);

  const state = {
    selected: null,        // { kind: "friend"|"room", id }
    tab: "chat",           // chat | cloud | settings
    rooms: [],
    dmLastId: null
  };
  let dmPollTimer = null;
  let disposed = false;

  function workLabel(agentType, status, fallback = null) {
    const work = getWork(agentType);
    if (work?.state === "done") return "已完成本阶段";
    if (work) return work.phase || work.task || "工作中";
    return fallback || TEAM_STATE_LABELS[status.state] || "空闲";
  }

  // ── 数据 ──
  async function fetchRooms() {
    if (!gateway) return [];
    try { return (await gateway.action("room.action.list"))?.data?.rooms || []; }
    catch { return state.rooms; }
  }

  function profileOf(agentType) {
    const profile = teamLive?.getProfiles?.().get(agentType);
    if (profile) return profile;
    // Agent广场雇佣的成员：用目录信息兜底出档案形状
    const market = getMarketplaceAgent(agentType);
    if (market) {
      return {
        identity: { name: market.name, title: market.title },
        role: { reportsTo: "main", responsibilities: market.skills },
        permission: { approvalRequired: [], forbidden: [] }
      };
    }
    return { identity: { name: agentType } };
  }

  // ── 左栏 ──
  function renderList() {
    if (disposed) return;
    listCol.textContent = "";
    // 好友
    const profiles = teamLive?.getProfiles?.() || new Map();
    const hired = listHiredAgents();
    const hiredIds = new Set(hired.map(({ id }) => id));
    const visibleProfiles = [...profiles.entries()].filter(([agentType]) => !hiredIds.has(agentType));
    const friendTitle = el("div", "sb-cgroup-title", "好友");
    friendTitle.appendChild(el("span", "sb-cgroup-count", `${visibleProfiles.length + hired.length}`));
    const recruitButton = el("button", "sb-cgroup-recruit");
    recruitButton.type = "button";
    recruitButton.setAttribute("aria-label", "招募成员");
    recruitButton.innerHTML = `${ICONS.recruit}<span>招募</span>`;
    recruitButton.addEventListener("click", (event) => {
      event.stopPropagation();
      onRecruit?.();
    });
    friendTitle.appendChild(recruitButton);
    listCol.appendChild(friendTitle);
    for (const [agentType, profile] of visibleProfiles) {
      const status = teamLive.getStatusOf(agentType);
      const row = el("div", `sb-crow${state.selected?.kind === "friend" && state.selected.id === agentType ? " sb-on" : ""}`);
      const avatar = el("div", `sb-cavatar${agentType === "main" ? " sb-main" : ""}`, avatarInitial(profile.identity?.name));
      mountAgentAvatar(avatar, agentType, { alt: profile.identity?.name || agentType });
      row.appendChild(avatar);
      const text = el("div", "sb-ctext");
      const nameRow = el("div", "sb-cname-row");
      nameRow.appendChild(el("div", "sb-cname", profile.identity?.name || agentType));
      const activity = createAgentActivityBadge(agentType, { status });
      if (activity) nameRow.appendChild(activity);
      text.appendChild(nameRow);
      const sub = el("div", "sb-csub");
      const work = getWork(agentType);
      sub.append(el("span", `sb-cdot ${dotClass(status.state)}`), el("span", null, workLabel(agentType, status)));
      text.appendChild(sub);
      row.appendChild(text);
      row.addEventListener("click", () => select({ kind: "friend", id: agentType }));
      listCol.appendChild(row);
    }
    // Agent广场雇佣的成员
    for (const agent of hired) {
      const row = el("div", `sb-crow${state.selected?.kind === "friend" && state.selected.id === agent.id ? " sb-on" : ""}`);
      const ava = el("div", "sb-cavatar", avatarInitial(agent.name));
      ava.style.background = agent.color;
      mountAgentAvatar(ava, agent.id, { alt: agent.name });
      row.appendChild(ava);
      const text = el("div", "sb-ctext");
      const nameRow = el("div", "sb-cname-row");
      nameRow.appendChild(el("div", "sb-cname", agent.name));
      const activity = createAgentActivityBadge(agent.id, { status: teamLive?.getStatusOf?.(agent.id) });
      if (activity) nameRow.appendChild(activity);
      text.appendChild(nameRow);
      const sub = el("div", "sb-csub");
      sub.append(el("span", "sb-cdot"), el("span", null, workLabel(agent.id, { state: TEAM_STATES.IDLE }, `已雇佣 · ${agent.title}`)));
      text.appendChild(sub);
      row.appendChild(text);
      row.addEventListener("click", () => select({ kind: "friend", id: agent.id }));
      listCol.appendChild(row);
    }
    // 群组
    const roomTitle = el("div", "sb-cgroup-title", "群组");
    roomTitle.appendChild(el("span", "sb-cgroup-count", `${state.rooms.length}`));
    listCol.appendChild(roomTitle);
    if (!state.rooms.length) {
      listCol.appendChild(el("div", "sb-cempty", gateway ? "暂无项目组" : "gateway 未连接"));
    }
    for (const room of state.rooms) {
      const row = el("div", `sb-crow${state.selected?.kind === "room" && state.selected.id === room.id ? " sb-on" : ""}`);
      const groupAvatar = el("div", "sb-cavatar sb-room");
      mountGroupAvatar(groupAvatar, groupMembers(room), { alt: `${room.name || "项目组"}成员头像` });
      row.appendChild(groupAvatar);
      const text = el("div", "sb-ctext");
      text.appendChild(el("div", "sb-cname", room.name || "未命名项目组"));
      text.appendChild(el("div", "sb-csub", room.lastMessage || `${(room.members || []).length} 人`));
      row.appendChild(text);
      row.addEventListener("click", () => select({ kind: "room", id: room.id }));
      listCol.appendChild(row);
    }
  }

  // ── 右栏：成员详情 ──
  function stopDmPoll() { clearInterval(dmPollTimer); dmPollTimer = null; }
  function stopCloudFeed() { state.cloudDispose?.(); state.cloudDispose = null; }

  function buildActionButton({ key, label, icon, primary = false, onClick }) {
    const btn = el("button", `sb-caction${state.tab === key && key ? " sb-on" : ""}${primary ? " sb-caction-primary" : ""}`);
    btn.type = "button";
    const iconWrap = el("span");
    iconWrap.innerHTML = icon;
    btn.append(iconWrap, el("span", null, label));
    btn.addEventListener("click", onClick);
    return btn;
  }

  function renderFriendDetail(agentType) {
    stopDmPoll();
    stopCloudFeed();
    const profile = profileOf(agentType);
    const status = teamLive.getStatusOf(agentType);
    // 记录状态签名：teamLive 轮询触发重渲染时，签名没变就跳过（避免快照/配置页被反复重建）
    state.lastStatusSig = `${agentType}|${status.state}|${status.currentTask || ""}|${profile.identity?.name || ""}`;
    detailCol.textContent = "";

    const head = el("div", "sb-chead sb-chead-friend");
    const headAvatar = el("div", `sb-chead-avatar${agentType === "main" ? " sb-main" : ""}`, avatarInitial(profile.identity?.name));
    // Agent广场雇佣的成员：头像用目录配色
    const marketAgent = getMarketplaceAgent(agentType);
    if (marketAgent) headAvatar.style.background = marketAgent.color;
    mountAgentAvatar(headAvatar, agentType, { alt: profile.identity?.name || agentType });
    head.appendChild(headAvatar);
    const headText = el("div", "sb-chead-text");
    headText.appendChild(el("div", "sb-chead-name", profile.identity?.name || agentType));
    const statusLine = el("div", "sb-chead-status");
    statusLine.append(el("span", `sb-cdot ${dotClass(status.state)}`), el("span", null, workLabel(agentType, status)));
    headText.appendChild(statusLine);
    head.appendChild(headText);
    detailCol.appendChild(head);

    const actions = el("div", "sb-cactions sb-cactions-friend");
    actions.append(
      buildActionButton({ key: "chat", label: "发消息", icon: ICONS.chat, onClick: () => { state.tab = "chat"; renderFriendDetail(agentType); } }),
      buildActionButton({ key: "cloud", label: "云电脑", icon: ICONS.cloud, onClick: () => { state.tab = "cloud"; renderFriendDetail(agentType); } }),
      buildActionButton({ key: "settings", label: "配置", icon: ICONS.settings, onClick: () => { state.tab = "settings"; renderFriendDetail(agentType); } })
    );
    detailCol.appendChild(actions);

    const content = el("div", "sb-ccontent");
    detailCol.appendChild(content);
    if (state.tab === "chat") renderChat(content, agentType, profile);
    else if (state.tab === "cloud") renderCloud(content, agentType);
    else renderSettings(content, agentType, profile);
  }

  // 发消息：1:1 私聊
  function renderChat(container, agentType, profile) {
    const list = el("div", "sb-chat-list2");
    const inputWrap = el("div", "sb-chat-input2");
    const textarea = document.createElement("textarea");
    textarea.placeholder = `发给 ${profile.identity?.name || agentType}…（Enter 发送）`;
    const sendBtn = el("button", "sb-chat-send2", "发送");
    inputWrap.append(textarea, sendBtn);
    container.append(list, inputWrap);

    function artifactCard(artifact) {
      const card = el("button", "sb-dm-artifact");
      card.type = "button";
      const extension = String(artifact.name || "").split(".").pop()?.toUpperCase() || (artifact.type === "sheet" ? "CSV" : "DOC");
      card.appendChild(el("span", `sb-dm-fileico${artifact.type === "sheet" ? " sb-sheet" : ""}`, extension));
      const fileBody = el("span", "sb-dm-filebody");
      fileBody.append(el("span", "sb-dm-filename", artifact.name || "任务产出"), el("span", "sb-dm-filesummary", artifact.summary || "点击查看完整内容"));
      const go = el("span", "sb-dm-filego");
      go.append(el("span", "sb-dm-filestatus", artifact.status || "已完成"), el("span", "sb-dm-filelink", "查看产出 →"));
      card.append(fileBody, go);
      card.addEventListener("click", () => {
        const fileId = addFile({
          name: artifact.name,
          type: artifact.type,
          content: artifact.content,
          projectId: artifact.projectId,
          projectName: artifact.projectName,
          taskId: artifact.taskId,
          createdBy: artifact.createdBy || profile.identity?.name || agentType
        });
        openFileCenterPage({ initialFileId: fileId });
      });
      return card;
    }

    function bubble(message) {
      message = projectMessage(message);
      const mine = message.from === "user";
      const row = el("div", `sb-msg${mine ? " sb-mine" : ""}`);
      const messageAvatar = el("div", `sb-msg-avatar${message.from === "main" ? " sb-main" : ""}`, avatarInitial(message.fromName));
      mountAgentAvatar(messageAvatar, message.agentType || message.from, { alt: message.fromName || message.from });
      row.appendChild(messageAvatar);
      const body = el("div", "sb-msg-body");
      const agentType = message.agentType || message.from;
      const status = teamLive?.getStatusOf?.(agentType) || { state: TEAM_STATES.IDLE };
      const nameRow = el("div", "sb-msg-name-row");
      nameRow.appendChild(el("div", "sb-msg-name", message.fromName || ""));
      const activity = createAgentActivityBadge(agentType, { status, work: getWork(agentType) });
      if (activity) nameRow.appendChild(activity);
      body.appendChild(nameRow);
      body.appendChild(el("div", "sb-msg-bubble", message.text || ""));
      if (message.artifact) body.appendChild(artifactCard(message.artifact));
      row.appendChild(body);
      return row;
    }

    async function refresh({ scroll = false } = {}) {
      if (!gateway) return;
      try {
        const messages = (await gateway.action("dm.message.list", { agentType }))?.data?.messages || [];
        const newest = messages[messages.length - 1];
        if (newest?.id === state.dmLastId && list.childElementCount === messages.length) return;
        state.dmLastId = newest?.id || null;
        list.textContent = "";
        for (const message of messages) list.appendChild(bubble(message));
        if (scroll || true) list.scrollTop = list.scrollHeight;
      } catch { /* 保持现状 */ }
    }

    async function ensureEmploymentWelcome() {
      const market = getMarketplaceAgent(agentType);
      const employment = getEmployment(agentType);
      if (!gateway || !market || !employment || employment.welcomeSentAt || welcomeInFlight.has(agentType)) return;
      welcomeInFlight.add(agentType);
      try {
        const current = (await gateway.action("dm.message.list", { agentType }))?.data?.messages || [];
        const alreadyWelcomed = current.some((message) => message.from === agentType && /^你好，我是/.test(message.text || ""));
        if (alreadyWelcomed) {
          markEmploymentWelcome(agentType);
          return;
        }
        await gateway.action("dm.message.send", {
          agentType,
          from: agentType,
          fromName: profile.identity?.name || market.name,
          text: `你好，我是${profile.identity?.name || market.name}，负责${market.skills.join("、")}。我会先按你确认的数据范围工作，保留来源和核验状态。最近有什么需要我帮你处理的客户或线索吗？`
        });
        markEmploymentWelcome(agentType);
      } catch { /* 首句失败不阻塞聊天，下一次进入可重试 */ }
      finally { welcomeInFlight.delete(agentType); }
    }

    async function send() {
      const text = textarea.value.trim();
      if (!text || !gateway) return;
      sendBtn.disabled = true;
      try {
        await gateway.action("dm.message.send", { agentType, from: "user", fromName: "我", text });
        textarea.value = "";
        await refresh({ scroll: true });
      } finally { sendBtn.disabled = false; }
    }
    sendBtn.addEventListener("click", send);
    textarea.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(); }
    });

    state.dmLastId = null;
    (async () => {
      await refresh({ scroll: true });
      await ensureEmploymentWelcome();
      await refresh({ scroll: true });
    })();
    dmPollTimer = setInterval(() => refresh(), 2000);
  }

  // 云电脑：实时快照（与办公室同款）+ 工作区文件
  async function renderCloud(container, agentType) {
    const pane = el("div", "sb-pane");
    container.appendChild(pane);

    // 快照标题行：云电脑 · 实时快照 + LIVE
    const snapTitle = el("div", "sb-pane-title");
    snapTitle.style.cssText = "display:flex;align-items:center;gap:8px";
    snapTitle.appendChild(document.createTextNode("云电脑 · 实时快照"));
    snapTitle.appendChild(createLiveBadge());
    pane.appendChild(snapTitle);

    const screen = createSnapshotScreen(agentType, { height: 260 });
    screen.el.style.marginBottom = "14px";
    state.cloudDispose = screen.dispose;
    pane.appendChild(screen.el);

    // 工作区文件
    pane.appendChild(el("div", "sb-pane-title", "工作区文件"));
    const filesBox = el("div");
    filesBox.appendChild(el("div", "sb-pane-empty", "读取工作区…"));
    pane.appendChild(filesBox);

    let workspace = null;
    if (gateway) {
      try { workspace = (await gateway.action("agent.workspace.list", { agentType }))?.data?.workspace || null; }
      catch { workspace = null; }
    }
    if (disposed || state.tab !== "cloud" || state.selected?.id !== agentType) return;
    filesBox.textContent = "";
    if (!workspace) {
      filesBox.appendChild(el("div", "sb-pane-empty", gateway ? "工作区暂不可读" : "gateway 未连接"));
      return;
    }
    filesBox.appendChild(el("div", "sb-pane-path", `云电脑目录：${workspace.path}`));
    for (const section of workspace.sections || []) {
      filesBox.appendChild(el("div", "sb-pane-title", section.dir));
      if (!section.files.length) {
        filesBox.appendChild(el("div", "sb-pane-empty", "暂无文件"));
        continue;
      }
      for (const file of section.files) {
        const row = el("div", "sb-file-row");
        row.append(el("span", null, file.name), el("span", "sb-file-size", fmtSize(file.size || 0)));
        filesBox.appendChild(row);
      }
    }
  }

  // 配置：完整 Agent 详情页（九段模型 + 运行数据 + 训练，见 agent-profile.js）
  function renderSettings(container, agentType, profile) {
    renderAgentProfile(container, agentType, profile, { gateway, teamLive });
  }

  // ── 右栏：群组详情与群聊 ──
  function renderRoomDetail(room) {
    stopDmPoll();
    stopCloudFeed();
    detailCol.textContent = "";
    const head = el("div", "sb-chead sb-chead-friend");
    const groupAvatar = el("div", "sb-chead-avatar sb-room");
    mountGroupAvatar(groupAvatar, groupMembers(room), { alt: `${room.name || "项目组"}成员头像` });
    head.appendChild(groupAvatar);
    const headText = el("div", "sb-chead-text");
    headText.appendChild(el("div", "sb-chead-name", room.name || "未命名项目组"));
    const statusLine = el("div", "sb-chead-status");
    statusLine.append(el("span", `sb-cdot${room.status === "active" ? " sb-busy" : ""}`), el("span", null, `${(room.members || []).length} 位成员 · ${room.status === "active" ? "进行中" : "已结束"}`));
    headText.appendChild(statusLine);
    head.appendChild(headText);
    detailCol.appendChild(head);
    const actions = el("div", "sb-cactions sb-cactions-friend");
    actions.append(
      buildActionButton({ key: "data", label: ROOM_DETAIL_ACTIONS[0], icon: ICONS.data, primary: true, onClick: () => onOpenData?.(room) }),
      buildActionButton({ key: "files", label: ROOM_DETAIL_ACTIONS[1], icon: ICONS.files, onClick: () => onOpenFiles?.(room) })
    );
    detailCol.appendChild(actions);
    const content = el("div", "sb-ccontent");
    detailCol.appendChild(content);
    if (state.tab === "settings") renderRoomOverview(content, room);
    else renderRoomChat(content, room);
  }

  function renderRoomOverview(container, room) {
    stopDmPoll();
    container.textContent = "";
    const pane = el("div", "sb-pane");
    pane.appendChild(el("div", "sb-pane-title", "项目目标"));
    pane.appendChild(el("div", "sb-kv", room.goal || "暂未填写项目目标"));
    pane.appendChild(el("div", "sb-pane-title", "参与成员"));
    pane.appendChild(el("div", "sb-kv", `${(room.members || []).length} 位成员`));
    pane.appendChild(el("div", "sb-pane-title", "最近进展"));
    pane.appendChild(el("div", "sb-pane-empty", room.lastMessage || "暂无消息"));
    container.appendChild(pane);
  }

  // 群聊：沿用个人私聊的消息、头像与输入框结构，消息来源保持真实项目组数据。
  function renderRoomChat(container, room) {
    const list = el("div", "sb-chat-list2");
    const inputWrap = el("div", "sb-chat-input2");
    const textarea = document.createElement("textarea");
    textarea.placeholder = `发到 ${room.name || "项目组"}…（Enter 发送）`;
    const sendBtn = el("button", "sb-chat-send2", "发送");
    inputWrap.append(textarea, sendBtn);
    container.append(list, inputWrap);

    function bubble(message) {
      message = projectMessage(message);
      const mine = message.from === "user";
      const row = el("div", `sb-msg${mine ? " sb-mine" : ""}`);
      const messageAvatar = el("div", `sb-msg-avatar${message.from === "main" ? " sb-main" : ""}`, avatarInitial(message.fromName));
      mountAgentAvatar(messageAvatar, message.agentType || message.from, { alt: message.fromName || message.from });
      row.appendChild(messageAvatar);
      const body = el("div", "sb-msg-body");
      body.appendChild(el("div", "sb-msg-name", message.fromName || message.from || ""));
      body.appendChild(el("div", "sb-msg-bubble", message.text || ""));
      row.appendChild(body);
      return row;
    }

    async function refresh({ scroll = false } = {}) {
      if (!gateway) return;
      try {
        const messages = (await gateway.action("room.message.list", { roomId: room.id }))?.data?.messages || [];
        const newest = messages[messages.length - 1];
        if (newest?.id === state.dmLastId && list.childElementCount === messages.length) return;
        state.dmLastId = newest?.id || null;
        list.textContent = "";
        for (const message of messages) list.appendChild(bubble(message));
        if (scroll || true) list.scrollTop = list.scrollHeight;
      } catch { /* 保持现状 */ }
    }

    async function send() {
      const text = textarea.value.trim();
      if (!text || !gateway) return;
      sendBtn.disabled = true;
      try {
        await gateway.action("room.message.send", { roomId: room.id, from: "user", fromName: "我", text });
        textarea.value = "";
        await refresh({ scroll: true });
      } finally { sendBtn.disabled = false; }
    }
    sendBtn.addEventListener("click", send);
    textarea.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(); }
    });
    state.dmLastId = null;
    refresh({ scroll: true });
    dmPollTimer = setInterval(() => refresh(), 2000);
  }

  function renderDetail() {
    if (disposed) return;
    if (!state.selected) {
      stopDmPoll();
      stopCloudFeed();
      detailCol.textContent = "";
      detailCol.appendChild(el("div", "sb-cplaceholder", "从左侧选择一位成员或一个群组"));
      return;
    }
    if (state.selected.kind === "friend") renderFriendDetail(state.selected.id);
    else {
      const room = state.rooms.find((item) => item.id === state.selected.id);
      if (room) renderRoomDetail(room);
    }
  }

  function select(next) {
    state.selected = next;
    state.tab = "chat";
    renderList();
    renderDetail();
  }

  // ── 启动与订阅 ──
  state.rooms = await fetchRooms();
  renderList();
  renderDetail();
  // 外部入口指定了成员（如办公室卡片「沟通」）：直接选中并进入私聊
  const initialProfile = initialFriend ? teamLive?.getProfiles?.().has(initialFriend) : false;
  const initialHire = initialFriend && listHiredAgents().some(({ id }) => id === initialFriend);
  if (initialFriend && (initialProfile || initialHire)) {
    select({ kind: "friend", id: initialFriend });
  }
  const unsubscribe = teamLive?.subscribe?.(() => {
    renderList();
    // 成员状态真的变化时才重渲染右栏（聊天有独立轮询；快照/配置页不应被心跳重建）
    if (state.selected?.kind === "friend" && state.tab !== "chat") {
      const s = teamLive.getStatusOf(state.selected.id);
      const profile = profileOf(state.selected.id);
      const sig = `${state.selected.id}|${s.state}|${s.currentTask || ""}|${profile.identity?.name || ""}`;
      if (sig !== state.lastStatusSig) renderDetail();
    }
  }) || (() => {});
  const unsubscribeWork = subscribeWork(() => {
    renderList();
  });
  const roomsPollTimer = setInterval(async () => {
    const nextRooms = await fetchRooms();
    const selectedRoomStillExists = state.selected?.kind !== "room" || nextRooms.some((room) => room.id === state.selected.id);
    state.rooms = nextRooms;
    renderList();
    if (state.selected?.kind === "room" && !selectedRoomStillExists) renderDetail();
  }, 5000);

  const origClose = page.close;
  page.close = () => {
    disposed = true;
    stopDmPoll();
    stopCloudFeed();
    clearInterval(roomsPollTimer);
    unsubscribe();
    unsubscribeWork();
    origClose();
  };
  return page;
}
