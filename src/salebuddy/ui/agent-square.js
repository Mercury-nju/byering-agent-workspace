/**
 * ui/agent-square.js
 * Agent 广场（导航即页面，与通讯录/项目组同一交互层级）：
 *   顶部：搜索 + 分类筛选
 *   「我的团队」：办公室同源的核心成员（带状态摘要）+ 已雇佣成员
 *   「广场」：可雇佣成员卡片网格（分类/搜索过滤）
 *   卡片点击 → 详情视图（返回按钮切换）：职责 / 技能 / 工具 / 交付物 + 雇佣
 * 雇佣状态持久化在 localStorage，已雇佣成员同步出现在通讯录好友列表。
 */
import { el, openPage } from "./pages.js";
import { TEAM_STATE_LABELS, TEAM_STATES } from "../agents/status.js";
import { avatarInitial } from "./agent-drawer.js";
import { mountAgentAvatar } from "./agent-avatar.js";
import {
  MARKETPLACE_AGENTS,
  MARKETPLACE_CATEGORIES,
  getMarketplaceAgent,
  isHired,
  hireAgent,
  terminateAgent,
  getEmployment,
  listHiredAgents
} from "../agents/marketplace.js";

const CSS = `
.sb-as{min-height:100%;padding-bottom:28px}
.sb-as-toolbar{display:flex;align-items:center;gap:10px;padding:20px 28px 2px;flex-wrap:wrap}
.sb-as-search{display:flex;align-items:center;gap:6px;background:#fff;border:1px solid rgba(15,15,15,0.1);border-radius:10px;padding:7px 12px;width:260px}
.sb-as-search:focus-within{border-color:#3B6BD4}
.sb-as-search svg{width:14px;height:14px;flex:none;color:#8A8F99}
.sb-as-search input{border:none;outline:none;flex:1;min-width:0;font-size:13px;background:transparent;color:#1F2329;font-family:inherit}
.sb-as-chips{display:flex;gap:6px;flex-wrap:wrap}
.sb-as-chip{font-size:12px;color:#5A5E66;padding:5px 12px;border-radius:999px;background:rgba(15,15,15,0.05);cursor:pointer;border:none;font-family:inherit}
.sb-as-chip:hover{background:rgba(15,15,15,0.08)}
.sb-as-chip.sb-on{background:#1F2329;color:#fff}
.sb-as-sec-title{font-size:14px;font-weight:600;color:#1F2329;display:flex;align-items:baseline;gap:8px;padding:20px 28px 10px}
.sb-as-sec-sub{font-size:11px;color:#B0B4BB;font-weight:400}

.sb-as-team{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;padding:0 28px}
.sb-as-mate{display:flex;align-items:center;gap:10px;min-width:0;background:#fff;border:1px solid rgba(15,15,15,0.06);border-radius:12px;padding:10px 14px;cursor:pointer}
.sb-as-mate:hover{background:#F5F6F8}
.sb-as-mate-ava{width:34px;height:34px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:600;color:#fff;background:#5B6B8C;overflow:hidden}
.sb-as-mate-ava.sb-main{background:#1F2329}
.sb-as-mate-name{font-size:13px;font-weight:500;color:#1F2329}
.sb-as-mate-name-row{flex-wrap:wrap}
.sb-as-mate-sub{font-size:11px;color:#8A8F99;margin-top:1px;display:flex;align-items:center;gap:4px}
.sb-as-dot{width:6px;height:6px;border-radius:50%;background:#57B26A;flex:none}
.sb-as-dot.sb-busy{background:#E8A33D}
.sb-as-dot.sb-waiting{background:#D45B5B}

.sb-as-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;padding:0 28px}
.sb-as-card{background:#fff;border:1px solid rgba(15,15,15,.1);border-radius:16px;padding:18px;cursor:pointer;display:flex;flex-direction:column;gap:12px;color:#1F2329;box-shadow:0 5px 16px rgba(31,35,41,.045);transition:border-color .16s ease,box-shadow .16s ease,transform .16s ease}
.sb-as-card:hover{border-color:rgba(15,15,15,.2);box-shadow:0 12px 26px rgba(31,35,41,.1);transform:translateY(-2px)}
.sb-as-card-top{display:flex;gap:12px;align-items:center}
.sb-as-ava{width:48px;height:48px;border-radius:12px;flex:none;display:flex;align-items:center;justify-content:center;color:#fff;font-size:17px;font-weight:600;overflow:hidden}
.sb-as-card .sb-as-ava{border-radius:50%;background:transparent;box-shadow:0 0 0 4px var(--sb-as-card-accent-soft,#F1F3F6)}
.sb-as-card .sb-as-ava img{border-radius:50%;mix-blend-mode:normal}
.sb-as-name{font-size:14px;font-weight:650;color:#1F2329}
.sb-as-title{font-size:12px;color:#777C84;margin-top:3px}
.sb-as-cat{margin-left:auto;flex:none;font-size:10.5px;color:var(--sb-as-card-accent,#536273);background:var(--sb-as-card-accent-soft,#F1F3F6);border:1px solid var(--sb-as-card-accent-border,#DCE2EA);border-radius:8px;padding:3px 8px}
.sb-as-desc{font-size:12.5px;color:#4D535B;line-height:1.65;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.sb-as-tags{display:flex;flex-wrap:wrap;gap:5px}
.sb-as-tag{font-size:11px;color:#5A5E66;background:#F4F5F7;border-radius:8px;padding:3px 8px}
.sb-as-tag-skill{font-weight:500;padding:2px 9px;border-radius:999px}
.sb-as-card .sb-as-tag-skill{color:var(--sb-as-card-accent,#536273)!important;background:var(--sb-as-card-accent-soft,#F1F3F6)!important;border:1px solid var(--sb-as-card-accent-border,#DCE2EA)!important}
.sb-as-foot{display:flex;align-items:center;gap:8px;margin-top:auto;padding-top:12px;border-top:1px solid #EEF0F2}
.sb-as-rate{font-size:11.5px;color:#777C84}
.sb-as-hire{margin-left:auto;flex:none;border:1px solid #1F2329;background:#1F2329;color:#fff;font-size:12px;padding:6px 15px;border-radius:9px;cursor:pointer;font-family:inherit}
.sb-as-hire:hover{background:#343941}
.sb-as-hire.sb-hired{background:var(--sb-as-card-accent-soft,#F1F3F6);border-color:var(--sb-as-card-accent-border,#DCE2EA);color:var(--sb-as-card-accent,#536273)}
.sb-as-empty{padding:40px 28px;font-size:13px;color:#B0B4BB;text-align:center}

.sb-asd-head{display:flex;align-items:center;gap:16px;padding:26px 28px 18px}
.sb-asd-ava{width:64px;height:64px;border-radius:16px;flex:none;display:flex;align-items:center;justify-content:center;color:#fff;font-size:24px;font-weight:600;overflow:hidden}
.sb-asd-name{font-size:18px;font-weight:600;color:#1F2329}
.sb-asd-title{font-size:13px;color:#8A8F99;margin-top:3px}
.sb-asd-meta{font-size:12px;color:#8A8F99;margin-top:6px}
.sb-asd-actions{margin-left:auto;flex:none;display:flex;gap:8px}
.sb-asd-btn{border:1px solid rgba(15,15,15,0.16);background:#fff;color:#1F2329;font-size:13px;padding:8px 18px;border-radius:10px;cursor:pointer;font-family:inherit}
.sb-asd-btn:hover{background:#F5F6F8}
.sb-asd-btn.sb-primary{background:#1F2329;border-color:#1F2329;color:#fff}
.sb-asd-btn.sb-primary:hover{background:#33373F}
.sb-asd-sec{padding:4px 28px 14px}
.sb-asd-sec-title{font-size:12px;font-weight:600;color:#8A8F99;letter-spacing:.4px;margin:14px 0 8px}
.sb-asd-desc{font-size:13px;color:#1F2329;line-height:1.7}
.sb-as-employment{position:fixed;inset:0;z-index:2;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(20,24,28,.35);backdrop-filter:blur(5px)}
.sb-as-employment-card{width:min(460px,100%);padding:24px;border:1px solid rgba(15,15,15,.1);border-radius:16px;background:#fff;box-shadow:0 18px 50px rgba(15,15,15,.18)}
.sb-as-employment-title{font-size:17px;font-weight:700;color:#1F2329}.sb-as-employment-copy{margin-top:6px;font-size:12px;color:#777C84;line-height:1.6}
.sb-as-employment-fields{display:grid;gap:12px;margin-top:18px}.sb-as-employment-field{display:grid;gap:6px;font-size:12px;color:#5A5E66}.sb-as-employment-field input{height:38px;box-sizing:border-box;border:1px solid rgba(15,15,15,.14);border-radius:9px;padding:0 11px;font:inherit;color:#1F2329;outline:none}.sb-as-employment-field input:focus{border-color:#3B6BD4;box-shadow:0 0 0 3px rgba(59,107,212,.1)}
.sb-as-employment-help{font-size:11px;color:#8A8F99;line-height:1.55}.sb-as-employment-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:20px}.sb-as-employment-actions button{height:36px;padding:0 14px;border-radius:9px;font:inherit;font-size:12px;cursor:pointer}.sb-as-employment-cancel{border:1px solid rgba(15,15,15,.13);background:#fff;color:#5A5E66}.sb-as-employment-confirm{border:1px solid #1F2329;background:#1F2329;color:#fff}.sb-as-employment-confirm:hover{background:#383D45}
@media(max-width:1100px){.sb-as-grid,.sb-as-team{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:640px){.sb-as-grid,.sb-as-team{grid-template-columns:1fr}}
`;

let styleInjected = false;
function ensureStyle() {
  if (styleInjected) return;
  const tag = document.createElement("style");
  tag.textContent = CSS;
  document.head.appendChild(tag);
  styleInjected = true;
}

const SEARCH_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.8-3.8"/></svg>';

function dotClass(state) {
  if (state === TEAM_STATES.BUSY) return "sb-busy";
  if (state === TEAM_STATES.WAITING_APPROVAL) return "sb-waiting";
  return "";
}

/** 能力标签：跟随成员主色的彩色高亮（浅底 + 主色文字），比灰色更醒目。 */
function buildSkillTag(text, color) {
  const tag = el("span", "sb-as-tag sb-as-tag-skill", text);
  tag.style.color = color;
  tag.style.background = `${color}14`;
  tag.style.border = `1px solid ${color}33`;
  return tag;
}

const CATEGORY_ACCENTS = Object.freeze({
  "销售": ["#4267A5", "#EFF3FA", "#D6E0F0"],
  "客户成功": ["#357A73", "#EEF7F5", "#D4EAE7"],
  "招聘猎头": ["#8A5D82", "#F7F0F6", "#E9D9E6"],
  "教育培训": ["#9A6A35", "#FBF5EC", "#EDDFC7"],
  "专业服务": ["#5B6D8C", "#F1F4F8", "#DCE4EF"],
  "录音总结": ["#477D75", "#EFF7F5", "#D7EBE7"]
});

function categoryAccent(category) {
  return CATEGORY_ACCENTS[category] || ["#536273", "#F1F3F6", "#DCE2EA"];
}

/**
 * 打开 Agent 广场页。
 * deps: { teamLive, gateway, onChat(agentTypeOrId), onClose }
 */
export function openAgentSquarePage({ teamLive, onChat, onClose } = {}) {
  ensureStyle();
  const page = openPage({ title: "Agent广场", onClose });
  const pageHead = page.root.querySelector(".sb-page-head");
  const root = el("div", "sb-as notranslate");
  root.setAttribute("translate", "no");
  page.body.appendChild(root);

  const state = { view: "home", category: "全部", query: "", detailId: null };
  let disposed = false;
  let employmentOverlay = null;
  let employmentSubmitting = false;

  function setPageHeaderVisible(visible) {
    if (pageHead) pageHead.style.display = visible ? "" : "none";
  }

  function filteredAgents() {
    const query = state.query.trim().toLowerCase();
    return MARKETPLACE_AGENTS.filter((agent) => {
      const domains = agent.domains || [agent.category];
      if (state.category !== "全部" && !domains.includes(state.category)) return false;
      if (!query) return true;
      const haystack = `${agent.name}${agent.title}${agent.category}${domains.join("")}${agent.desc}${agent.skills.join("")}`.toLowerCase();
      return haystack.includes(query);
    });
  }

  function displayedCategory(agent) {
    return state.category !== "全部" && (agent.domains || [agent.category]).includes(state.category)
      ? state.category
      : agent.category;
  }

  // ── 我的团队 ──
  function renderTeamSection(container) {
    const title = el("div", "sb-as-sec-title", "我的团队");
    const hired = listHiredAgents();
    const hiredIds = new Set(hired.map(({ id }) => id));
    const profiles = teamLive?.getProfiles?.() || new Map();
    const visibleProfiles = [...profiles.entries()].filter(([agentType]) => !hiredIds.has(agentType));
    title.appendChild(el("span", "sb-as-sec-sub", `${visibleProfiles.length + hired.length} 位成员`));
    container.appendChild(title);

    const row = el("div", "sb-as-team");
    for (const [agentType, profile] of visibleProfiles) {
      const status = teamLive.getStatusOf(agentType);
      const item = el("div", "sb-as-mate");
      const avatar = el("div", `sb-as-mate-ava${agentType === "main" ? " sb-main" : ""}`, avatarInitial(profile.identity?.name));
      mountAgentAvatar(avatar, agentType, { alt: profile.identity?.name || agentType });
      item.appendChild(avatar);
      const text = el("div");
      const nameRow = el("div", "sb-as-mate-name-row");
      nameRow.appendChild(el("div", "sb-as-mate-name", profile.identity?.name || agentType));
      text.appendChild(nameRow);
      const sub = el("div", "sb-as-mate-sub");
      sub.append(el("span", `sb-as-dot ${dotClass(status.state)}`), el("span", null, status.currentTask || TEAM_STATE_LABELS[status.state] || "空闲"));
      text.appendChild(sub);
      item.appendChild(text);
      item.addEventListener("click", () => onChat?.(agentType));
      row.appendChild(item);
    }
    for (const agent of hired) {
      const item = el("div", "sb-as-mate");
      const ava = el("div", "sb-as-mate-ava", avatarInitial(agent.name));
      ava.style.background = agent.color;
      mountAgentAvatar(ava, agent.id, { alt: agent.name });
      item.appendChild(ava);
      const text = el("div");
      const nameRow = el("div", "sb-as-mate-name-row");
      nameRow.appendChild(el("div", "sb-as-mate-name", agent.name));
      text.appendChild(nameRow);
      const sub = el("div", "sb-as-mate-sub");
      sub.append(el("span", "sb-as-dot"), el("span", null, `已雇佣 · ${agent.title}`));
      text.appendChild(sub);
      item.appendChild(text);
      item.addEventListener("click", () => onChat?.(agent.id));
      row.appendChild(item);
    }
    container.appendChild(row);
  }

  // ── 广场卡片 ──
  function buildHireButton(agent, { large = false } = {}) {
    const btn = el("button", `${large ? "sb-asd-btn" : "sb-as-hire"}${isHired(agent.id) ? (large ? "" : " sb-hired") : large ? " sb-primary" : ""}`);
    btn.textContent = isHired(agent.id) ? "已雇佣 · 点击解约" : "雇佣";
    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      openEmploymentDialog(agent, isHired(agent.id) ? "terminate" : "hire");
    });
    return btn;
  }

  function openEmploymentDialog(agent, mode) {
    if (employmentOverlay?.isConnected) return;
    const overlay = el("div", "sb-as-employment");
    employmentOverlay = overlay;
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-label", mode === "hire" ? `确认雇佣${agent.name}` : `确认解约${agent.name}`);
    const card = el("div", "sb-as-employment-card");
    const title = mode === "hire" ? `雇佣${agent.name} · ${agent.title}` : `确认解约${agent.name}`;
    card.appendChild(el("div", "sb-as-employment-title", title));
    card.appendChild(el("div", "sb-as-employment-copy", mode === "hire"
      ? "确认后，这位 Agent 会加入你的团队，可被项目组选择、任务调度并在通讯录中沟通。"
      : "解约后会从团队候选和项目组新建成员列表中移除，历史对话和已交付物仍会保留。"));
    const fields = el("div", "sb-as-employment-fields");
    let scopeInput = null;
    let budgetInput = null;
    if (mode === "hire") {
      const existing = getEmployment(agent.id);
      scopeInput = document.createElement("input");
      scopeInput.value = existing?.dataScope?.join("、") || agent.profile?.scope?.dataAccess?.join("、") || agent.tools.join("、");
      scopeInput.placeholder = "例如：当前项目 CRM、公开网页";
      const scopeField = el("label", "sb-as-employment-field", "数据范围");
      scopeField.appendChild(scopeInput);
      fields.appendChild(scopeField);
      budgetInput = document.createElement("input");
      budgetInput.type = "number";
      budgetInput.min = "0";
      budgetInput.placeholder = "不限";
      const budgetField = el("label", "sb-as-employment-field", "每日调用预算（可选）");
      budgetField.appendChild(budgetInput);
      fields.appendChild(budgetField);
      fields.appendChild(el("div", "sb-as-employment-help", `需要人工确认：${agent.profile?.permission?.approvalRequired?.join("、") || "外部发送、敏感数据和高风险动作"}`));
    }
    card.appendChild(fields);
    const actions = el("div", "sb-as-employment-actions");
    const cancel = el("button", "sb-as-employment-cancel", "取消");
    const confirm = el("button", "sb-as-employment-confirm", mode === "hire" ? "确认雇佣" : "确认解约");
    const closeDialog = () => {
      if (employmentOverlay === overlay) employmentOverlay = null;
      overlay.remove();
    };
    cancel.addEventListener("click", (event) => {
      event.stopPropagation();
      closeDialog();
    });
    confirm.addEventListener("click", (event) => {
      event.stopPropagation();
      if (employmentSubmitting) return;
      employmentSubmitting = true;
      confirm.disabled = true;
      if (mode === "hire") {
        const dataScope = scopeInput.value.split(/[、,，]/).map((item) => item.trim()).filter(Boolean);
        const budget = budgetInput.value === "" ? null : { daily: Number(budgetInput.value) };
        hireAgent(agent.id, { dataScope, budget });
      } else {
        terminateAgent(agent.id);
      }
      closeDialog();
      if (mode === "hire" && onChat) {
        // A successful hire opens the new teammate's DM immediately.
        onChat(agent.id);
        return;
      }
      employmentSubmitting = false;
      render();
    });
    actions.append(cancel, confirm);
    card.appendChild(actions);
    overlay.appendChild(card);
    overlay.addEventListener("click", (event) => { if (event.target === overlay) closeDialog(); });
    // Keep transient dialog state outside the rerendered marketplace content.
    page.root.appendChild(overlay);
  }

  function buildCard(agent) {
    const card = el("div", "sb-as-card");
    const category = displayedCategory(agent);
    const [accent, accentSoft, accentBorder] = categoryAccent(category);
    card.style.setProperty("--sb-as-card-accent", accent);
    card.style.setProperty("--sb-as-card-accent-soft", accentSoft);
    card.style.setProperty("--sb-as-card-accent-border", accentBorder);
    const top = el("div", "sb-as-card-top");
    const ava = el("div", "sb-as-ava", avatarInitial(agent.name));
    ava.style.background = accentSoft;
    mountAgentAvatar(ava, agent.id, { alt: agent.name });
    top.appendChild(ava);
    const nameBox = el("div");
    nameBox.appendChild(el("div", "sb-as-name", agent.name));
    nameBox.appendChild(el("div", "sb-as-title", agent.title));
    top.appendChild(nameBox);
    top.appendChild(el("span", "sb-as-cat", category));
    card.appendChild(top);
    card.appendChild(el("div", "sb-as-desc", agent.desc));
    const tags = el("div", "sb-as-tags");
    for (const skill of agent.skills) tags.appendChild(buildSkillTag(skill, agent.color));
    card.appendChild(tags);
    const foot = el("div", "sb-as-foot");
    foot.appendChild(el("span", "sb-as-rate", `★ ${agent.rating} · ${agent.hires}人已雇佣`));
    foot.appendChild(buildHireButton(agent));
    card.appendChild(foot);
    card.addEventListener("click", () => {
      state.view = "detail";
      state.detailId = agent.id;
      render();
    });
    return card;
  }

  // ── 详情视图 ──
  function renderDetail() {
    const agent = getMarketplaceAgent(state.detailId);
    if (!agent) { state.view = "home"; return; }
    setPageHeaderVisible(true);
    page.setTitle(agent.name);
    page.showBack(true, () => { state.view = "home"; render(); });

    const head = el("div", "sb-asd-head");
    const ava = el("div", "sb-asd-ava", avatarInitial(agent.name));
    ava.style.background = agent.color;
    mountAgentAvatar(ava, agent.id, { alt: agent.name });
    head.appendChild(ava);
    const info = el("div");
    info.appendChild(el("div", "sb-asd-name", agent.name));
    info.appendChild(el("div", "sb-asd-title", `${agent.title} · ${(agent.domains || [agent.category]).join("、")}`));
    info.appendChild(el("div", "sb-asd-meta", `★ ${agent.rating} 分 · ${agent.hires}人已雇佣`));
    head.appendChild(info);
    const actions = el("div", "sb-asd-actions");
    if (isHired(agent.id)) {
      const chatBtn = el("button", "sb-asd-btn", "发消息");
      chatBtn.addEventListener("click", () => onChat?.(agent.id));
      actions.appendChild(chatBtn);
    }
    actions.appendChild(buildHireButton(agent, { large: true }));
    head.appendChild(actions);
    root.appendChild(head);

    const body = el("div", "sb-asd-sec");
    body.appendChild(el("div", "sb-asd-sec-title", "介绍"));
    body.appendChild(el("div", "sb-asd-desc", agent.desc));
    const tagSection = (label, items, colored = false) => {
      body.appendChild(el("div", "sb-asd-sec-title", label));
      const box = el("div", "sb-as-tags");
      for (const item of items) box.appendChild(colored ? buildSkillTag(item, agent.color) : el("span", "sb-as-tag", item));
      body.appendChild(box);
    };
    tagSection("技能", agent.skills, true);
    tagSection("可用工具", agent.tools);
    tagSection("交付物", agent.deliverables);
    root.appendChild(body);
  }

  // ── 首页视图 ──
  function renderHome() {
    setPageHeaderVisible(false);
    page.setTitle("Agent广场");
    page.showBack(false);

    const toolbar = el("div", "sb-as-toolbar");
    const search = el("div", "sb-as-search");
    const icon = el("span");
    icon.innerHTML = SEARCH_ICON;
    const input = document.createElement("input");
    input.placeholder = "搜索成员、技能…";
    input.value = state.query;
    input.addEventListener("input", () => {
      state.query = input.value;
      refreshGrid();
    });
    search.append(icon, input);
    toolbar.appendChild(search);
    const chips = el("div", "sb-as-chips");
    for (const category of ["全部", ...MARKETPLACE_CATEGORIES]) {
      const chip = el("button", `sb-as-chip${state.category === category ? " sb-on" : ""}`, category);
      chip.addEventListener("click", () => {
        state.category = category;
        for (const node of chips.children) node.classList.toggle("sb-on", node === chip);
        refreshGrid();
      });
      chips.appendChild(chip);
    }
    toolbar.appendChild(chips);
    root.appendChild(toolbar);

    renderTeamSection(root);

    const secTitle = el("div", "sb-as-sec-title", "广场");
    secTitle.appendChild(el("span", "sb-as-sec-sub", "点击卡片查看详情，雇佣后加入你的团队"));
    root.appendChild(secTitle);
    const grid = el("div", "sb-as-grid");
    root.appendChild(grid);
    refreshGrid();

    function refreshGrid() {
      if (disposed || state.view !== "home") return;
      grid.textContent = "";
      const list = filteredAgents();
      if (!list.length) {
        grid.appendChild(el("div", "sb-as-empty", "没有匹配的成员，换个关键词试试"));
        return;
      }
      for (const agent of list) grid.appendChild(buildCard(agent));
    }
  }

  function render() {
    if (disposed) return;
    root.textContent = "";
    if (state.view === "detail") renderDetail();
    else renderHome();
  }

  render();

  // 团队成员状态变化时刷新「我的团队」（仅首页视图）
  const unsubscribe = teamLive?.subscribe?.(() => {
    if (state.view === "home") render();
  }) || (() => {});

  const origClose = page.close;
  page.close = () => {
    disposed = true;
    unsubscribe();
    origClose();
  };
  return page;
}
