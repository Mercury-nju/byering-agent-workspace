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
import { BYERING_DEFAULT_AGENT_TYPES } from "../agents/model.js";
import { displayAgentName, displayAgentTitle, localizeAgentText } from "../brand.js";
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
.sb-as-chip{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:#5A5E66;padding:5px 12px;border-radius:999px;background:rgba(15,15,15,0.05);cursor:pointer;border:none;font-family:inherit}
.sb-as-chip::after{content:attr(data-count);min-width:16px;height:16px;display:inline-grid;place-items:center;padding:0 3px;border-radius:999px;background:rgba(15,15,15,0.08);font-size:10px;line-height:16px;color:#7B8088}
.sb-as-chip:hover{background:rgba(15,15,15,0.08)}
.sb-as-chip.sb-on{background:#1F2329;color:#fff}
.sb-as-chip.sb-on::after{background:rgba(255,255,255,0.2);color:#fff}
.sb-as-sec-title{font-size:14px;font-weight:600;color:#1F2329;display:flex;align-items:baseline;gap:8px;padding:20px 28px 10px}
.sb-as-sec-sub{font-size:11px;color:#B0B4BB;font-weight:400}

.sb-as-team,.sb-as-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;padding:0 28px}
.sb-as-dot{width:6px;height:6px;border-radius:50%;background:#57B26A;flex:none}
.sb-as-dot.sb-busy{background:#E8A33D}
.sb-as-dot.sb-waiting{background:#D45B5B}
.sb-as-dot.sb-blocked{background:#C94D4D}

.sb-as-card{position:relative;min-width:0;min-height:320px;background:#fff;border:1px solid rgba(15,15,15,.1);border-radius:20px;padding:28px 20px 18px;cursor:pointer;display:flex;flex-direction:column;align-items:center;color:#1F2329;box-shadow:0 3px 12px rgba(31,35,41,.045);transition:border-color .16s ease,box-shadow .16s ease,transform .16s ease}
.sb-as-card:hover{border-color:rgba(15,15,15,.2);box-shadow:0 14px 30px rgba(31,35,41,.1);transform:translateY(-2px)}
.sb-as-card:focus-visible{outline:3px solid rgba(59,107,212,.28);outline-offset:3px}
.sb-as-card-menu{position:absolute;top:14px;right:14px;width:30px;height:30px;padding:0;border:0;border-radius:8px;background:transparent;color:#7E838B;font-size:20px;line-height:24px;letter-spacing:2px;cursor:pointer}
.sb-as-card-menu:hover{background:#F3F4F6;color:#343940}
.sb-as-card-menu:focus-visible,.sb-as-hire:focus-visible{outline:2px solid rgba(59,107,212,.42);outline-offset:2px}
.sb-as-card-top{display:flex;flex-direction:column;align-items:center;gap:9px;width:100%;padding-top:7px}
.sb-as-ava{width:78px;height:78px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;color:#fff;font-size:24px;font-weight:600;overflow:hidden}
.sb-as-card .sb-as-ava{background:transparent;box-shadow:0 0 0 6px var(--sb-as-card-accent-soft,#F1F3F6)}
.sb-as-card .sb-as-ava img{border-radius:50%;mix-blend-mode:normal}
.sb-as-name{max-width:100%;font-size:20px;font-weight:650;line-height:1.3;color:#1F2329;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sb-as-title{max-width:100%;font-size:13px;line-height:1.4;color:#777C84;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sb-as-provider{display:flex;align-items:center;justify-content:center;gap:6px;margin-top:9px;font-size:13px;color:#12945A;line-height:1.4}
.sb-as-provider-check{width:17px;height:17px;display:grid;place-items:center;border:1.5px solid currentColor;border-radius:50%;font-size:11px;font-weight:700;line-height:1}
.sb-as-provider-extra{color:#9A9FA7;margin-left:3px}
.sb-as-cat{position:absolute;top:16px;left:16px;flex:none;font-size:10.5px;color:var(--sb-as-card-accent,#536273);background:var(--sb-as-card-accent-soft,#F1F3F6);border:1px solid var(--sb-as-card-accent-border,#DCE2EA);border-radius:8px;padding:3px 8px}
.sb-as-desc{width:100%;min-height:44px;margin:20px 0 14px;font-size:13px;color:#666B73;line-height:1.65;text-align:center;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.sb-as-tags{display:flex;justify-content:center;align-items:center;flex-wrap:wrap;gap:7px;min-height:29px;width:100%}
.sb-as-tag{font-size:12px;color:#646A73;background:#F3F4F6;border-radius:999px;padding:5px 11px;white-space:nowrap}
.sb-as-tag-skill{font-weight:500;padding:2px 9px;border-radius:999px}
.sb-as-card .sb-as-tag-skill{color:var(--sb-as-card-accent,#536273)!important;background:var(--sb-as-card-accent-soft,#F1F3F6)!important;border:1px solid var(--sb-as-card-accent-border,#DCE2EA)!important}
.sb-as-foot{width:100%;margin-top:auto;padding-top:18px}
.sb-as-foot-meta{display:flex;justify-content:center;align-items:center;gap:5px;min-height:18px;margin-bottom:10px;font-size:11.5px;color:#8A8F99;text-align:center}
.sb-as-rate{font-size:11.5px;color:#8A8F99}
.sb-as-hire{width:100%;min-height:48px;border:1px solid #D3F0E4;background:#E4F8EF;color:#0A955A;font-size:15px;font-weight:650;padding:0 15px;border-radius:999px;cursor:pointer;font-family:inherit;transition:background-color .16s ease,border-color .16s ease,color .16s ease}
.sb-as-hire:hover{background:#D4F3E6;border-color:#BFE9D7;color:#087A4A}
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
@media(max-width:1320px){.sb-as-grid,.sb-as-team{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(max-width:980px){.sb-as-grid,.sb-as-team{grid-template-columns:repeat(2,minmax(0,1fr))}}
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
  if (state === TEAM_STATES.BLOCKED) return "sb-blocked";
  return "";
}

// These marketplace identities are installed as part of the default Byering team.
// They remain available in runtime profiles but should not appear twice in the hiring grid.
const DEFAULT_INSTALLED_MARKETPLACE_IDS = new Set([
  "mkt-market-scout",
  "mkt-cold-writer",
  "mkt-follow-up"
]);

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

const TEAM_CARD_META = Object.freeze({
  main: {
    description: "理解业务目标，拆解任务并组织团队，审核每一次交付。",
    tags: ["目标拆解", "团队协同", "交付审核"]
  },
  "Strategy Agent": {
    description: "把业务目标转成客户画像、需求信号和可执行的找人策略。",
    tags: ["客户画像", "来源策略", "范围设计"]
  },
  "Browser Agent": {
    description: "从抖音账号、粉丝、评论和直播互动中发现并验证潜在线索。",
    tags: ["账号检索", "互动挖掘", "证据留存"]
  },
  "Search Agent": {
    description: "合并重复账号，按意向和画像评分，输出可解释的优先级。",
    tags: ["去重清洗", "意向评分", "证据核验"]
  },
  "Research Agent": {
    description: "整理主页、作品和评论，提炼需求信号与下一步切入点。",
    tags: ["客户研究", "需求信号", "客户简报"]
  },
  "App Agent": {
    description: "基于客户证据制定触达方式、首句和后续沟通节奏。",
    tags: ["触达策略", "首触生成", "节奏设计"]
  },
  "Risk Agent": {
    description: "检查重复触达、权限、频控和勿扰状态，给出风险处理结论。",
    tags: ["重复拦截", "权限校验", "风险判断"]
  },
  "Outreach Agent": {
    description: "执行已批准的私信和评论动作，逐条记录平台执行结果。",
    tags: ["私信执行", "评论触达", "结果记录"]
  },
  "Outreach Ops Agent": {
    description: "管理发送队列、分批计划、失败重试和回复后的流程停止。",
    tags: ["队列管理", "失败重试", "回复监听"]
  }
});

const TEAM_CARD_ACCENTS = Object.freeze({
  main: ["#4267A5", "#EFF3FA", "#D6E0F0"],
  "Strategy Agent": ["#5B6D8C", "#F1F4F8", "#DCE4EF"],
  "Browser Agent": ["#8A5D82", "#F7F0F6", "#E9D9E6"],
  "Search Agent": ["#477D75", "#EFF7F5", "#D7EBE7"],
  "Research Agent": ["#357A73", "#EEF7F5", "#D4EAE7"],
  "App Agent": ["#9A6A35", "#FBF5EC", "#EDDFC7"],
  "Risk Agent": ["#6B638C", "#F3F1F8", "#E0DCEE"],
  "Outreach Agent": ["#4267A5", "#EFF3FA", "#D6E0F0"],
  "Outreach Ops Agent": ["#477D75", "#EFF7F5", "#D7EBE7"]
});

function teamCardAccent(agentType) {
  return TEAM_CARD_ACCENTS[agentType] || categoryAccent("专业服务");
}

function teamCardMeta(agentType, profile) {
  const preset = TEAM_CARD_META[agentType];
  if (preset) return preset;
  const responsibilities = profile?.role?.responsibilities || [];
  return {
    description: responsibilities.slice(0, 3).join("，") || "可被主 Agent 调度的默认成员。",
    tags: responsibilities.slice(0, 3)
  };
}

function buildProviderRow(provider = "Byering", extra = "") {
  const row = el("div", "sb-as-provider");
  row.appendChild(el("span", "sb-as-provider-check", "✓"));
  row.appendChild(el("span", null, provider));
  if (extra) row.appendChild(el("span", "sb-as-provider-extra", extra));
  return row;
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

  function presentationOf(agent) {
    return {
      name: displayAgentName({ id: agent?.id, name: agent?.name }),
      title: displayAgentTitle({ id: agent?.id, name: agent?.name, title: agent?.title })
    };
  }

  function setPageHeaderVisible(visible) {
    if (pageHead) pageHead.style.display = visible ? "" : "none";
  }

  function buildStandardCard({
    id,
    name,
    title,
    avatarValue = id,
    accent = categoryAccent("专业服务"),
    provider = "Byering",
    providerExtra = "",
    description = "",
    tags = [],
    footerText = "",
    footerStatusClass = "",
    actionButton = null,
    onCardClick = null,
    onMore = null,
    category = ""
  } = {}) {
    const card = el("article", "sb-as-card");
    const [accentColor, accentSoft, accentBorder] = accent;
    card.style.setProperty("--sb-as-card-accent", accentColor);
    card.style.setProperty("--sb-as-card-accent-soft", accentSoft);
    card.style.setProperty("--sb-as-card-accent-border", accentBorder);
    card.setAttribute("tabindex", "0");
    card.setAttribute("role", "group");
    card.setAttribute("aria-label", `${name} · ${title}`);

    const menu = el("button", "sb-as-card-menu", "···");
    menu.type = "button";
    menu.title = "查看详情";
    menu.setAttribute("aria-label", `查看${name}详情`);
    menu.addEventListener("click", (event) => {
      event.stopPropagation();
      onMore?.();
    });
    card.appendChild(menu);

    if (category) card.appendChild(el("span", "sb-as-cat", category));

    const top = el("div", "sb-as-card-top");
    const ava = el("div", "sb-as-ava", avatarInitial(name));
    ava.style.background = accentSoft;
    mountAgentAvatar(ava, avatarValue, { alt: name });
    top.appendChild(ava);
    top.appendChild(el("div", "sb-as-name", name));
    top.appendChild(el("div", "sb-as-title", title));
    top.appendChild(buildProviderRow(provider, providerExtra));
    card.appendChild(top);

    card.appendChild(el("div", "sb-as-desc", description));
    const tagsBox = el("div", "sb-as-tags");
    for (const tag of tags.slice(0, 3)) tagsBox.appendChild(buildSkillTag(tag, accentColor));
    card.appendChild(tagsBox);

    const foot = el("div", "sb-as-foot");
    if (footerText) {
      const meta = el("div", "sb-as-foot-meta");
      if (footerText.startsWith("状态：")) {
        const statusText = footerText.slice(3);
        const statusDot = el("span", `sb-as-dot ${footerStatusClass}`);
        meta.append(statusDot, el("span", null, statusText));
      } else {
        meta.appendChild(el("span", "sb-as-rate", footerText));
      }
      foot.appendChild(meta);
    }
    if (actionButton) {
      actionButton.classList.add("sb-as-card-action");
      foot.appendChild(actionButton);
    }
    card.appendChild(foot);

    const activate = () => onCardClick?.();
    card.addEventListener("click", activate);
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        activate();
      }
    });
    return card;
  }

  function filteredAgents() {
    const query = state.query.trim().toLowerCase();
    return MARKETPLACE_AGENTS.filter((agent) => {
      if (DEFAULT_INSTALLED_MARKETPLACE_IDS.has(agent.id)) return false;
      const domains = agent.domains || [agent.category];
      if (state.category !== "全部" && !domains.includes(state.category)) return false;
      if (!query) return true;
      const { name, title } = presentationOf(agent);
      const haystack = `${name}${title}${agent.category}${domains.join("")}${agent.desc}${agent.skills.join("")}`.toLowerCase();
      return haystack.includes(query);
    });
  }

  function categoryCount(category) {
    return MARKETPLACE_AGENTS.filter((agent) => {
      if (DEFAULT_INSTALLED_MARKETPLACE_IDS.has(agent.id)) return false;
      if (category === "全部") return true;
      const domains = agent.domains || [agent.category];
      return domains.includes(category);
    }).length;
  }

  function displayedCategory(agent) {
    return state.category !== "全部" && (agent.domains || [agent.category]).includes(state.category)
      ? state.category
      : agent.category;
  }

  // ── 我的团队 ──
  function renderTeamSection(container) {
    const title = el("div", "sb-as-sec-title", "我的团队");
    const hired = listHiredAgents().filter((agent) => !DEFAULT_INSTALLED_MARKETPLACE_IDS.has(agent.id));
    const profiles = teamLive?.getProfiles?.() || new Map();
    const visibleProfiles = BYERING_DEFAULT_AGENT_TYPES
      .map((agentType) => [agentType, profiles.get(agentType)])
      .filter(([, profile]) => Boolean(profile));
    const memberCount = hired.length
      ? `${visibleProfiles.length} 位默认 · ${hired.length} 位已雇佣`
      : `${visibleProfiles.length} 位默认成员`;
    title.appendChild(el("span", "sb-as-sec-sub", memberCount));
    container.appendChild(title);

    const row = el("div", "sb-as-team");
    for (const [agentType, profile] of visibleProfiles) {
      const status = teamLive.getStatusOf(agentType);
      const agentName = displayAgentName({ agentType, identity: profile.identity });
      const agentTitle = displayAgentTitle({ agentType, identity: profile.identity, role: profile.role });
      const stateLabel = status.currentTask
        ? localizeAgentText(status.currentTask)
        : TEAM_STATE_LABELS[status.state] || "空闲";
      const meta = teamCardMeta(agentType, profile);
      const [accent, accentSoft, accentBorder] = teamCardAccent(agentType);
      row.appendChild(buildStandardCard({
        id: agentType,
        name: agentName,
        title: agentTitle || "默认成员",
        avatarValue: agentType,
        accent: [accent, accentSoft, accentBorder],
        provider: "Byering",
        providerExtra: "默认成员",
        description: meta.description,
        tags: meta.tags,
        footerText: `状态：${stateLabel}`,
        footerStatusClass: dotClass(status.state),
        actionButton: (() => {
          const button = el("button", "sb-as-hire", "对话");
          button.type = "button";
          button.addEventListener("click", (event) => {
            event.stopPropagation();
            onChat?.(agentType);
          });
          return button;
        })(),
        onCardClick: () => onChat?.(agentType),
        onMore: () => onChat?.(agentType)
      }));
    }
    for (const agent of hired) {
      const { name, title } = presentationOf(agent);
      const meta = {
        description: agent.desc,
        tags: agent.skills || []
      };
      const [accent, accentSoft, accentBorder] = categoryAccent(agent.category);
      row.appendChild(buildStandardCard({
        id: agent.id,
        name,
        title: title || "已雇佣成员",
        avatarValue: agent.id,
        accent: [accent, accentSoft, accentBorder],
        provider: "Byering",
        providerExtra: "已雇佣",
        description: meta.description,
        tags: meta.tags,
        footerText: "状态：空闲",
        actionButton: (() => {
          const button = el("button", "sb-as-hire", "对话");
          button.type = "button";
          button.addEventListener("click", (event) => {
            event.stopPropagation();
            onChat?.(agent.id);
          });
          return button;
        })(),
        onCardClick: () => onChat?.(agent.id),
        onMore: () => onChat?.(agent.id)
      }));
    }
    container.appendChild(row);
  }

  // ── 广场卡片 ──
  function buildHireButton(agent, { large = false } = {}) {
    const btn = el("button", `${large ? "sb-asd-btn" : "sb-as-hire"}${isHired(agent.id) ? (large ? "" : " sb-hired") : large ? " sb-primary" : ""}`);
    btn.textContent = isHired(agent.id) ? "已雇佣" : "雇佣";
    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      openEmploymentDialog(agent, isHired(agent.id) ? "terminate" : "hire");
    });
    return btn;
  }

  function openEmploymentDialog(agent, mode) {
    if (employmentOverlay?.isConnected) return;
    const { name, title } = presentationOf(agent);
    const overlay = el("div", "sb-as-employment");
    employmentOverlay = overlay;
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-label", mode === "hire" ? `确认雇佣${name}` : `确认解约${name}`);
    const card = el("div", "sb-as-employment-card");
    const dialogTitle = mode === "hire" ? `雇佣${name} · ${title}` : `确认解约${name}`;
    card.appendChild(el("div", "sb-as-employment-title", dialogTitle));
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
    const { name, title } = presentationOf(agent);
    const category = displayedCategory(agent);
    const [accent, accentSoft, accentBorder] = categoryAccent(category);
    return buildStandardCard({
      id: agent.id,
      name,
      title,
      avatarValue: agent.id,
      accent: [accent, accentSoft, accentBorder],
      provider: "Byering",
      providerExtra: category,
      description: agent.desc,
      tags: agent.skills,
      footerText: `★ ${agent.rating} · ${agent.hires}人已雇佣`,
      actionButton: buildHireButton(agent),
      onCardClick: () => {
        state.view = "detail";
        state.detailId = agent.id;
        render();
      },
      onMore: () => {
        state.view = "detail";
        state.detailId = agent.id;
        render();
      }
    });
  }

  // ── 详情视图 ──
  function renderDetail() {
    const agent = getMarketplaceAgent(state.detailId);
    if (!agent) { state.view = "home"; return; }
    const { name, title } = presentationOf(agent);
    setPageHeaderVisible(true);
    page.setTitle(name);
    page.showBack(true, () => { state.view = "home"; render(); });

    const head = el("div", "sb-asd-head");
    const ava = el("div", "sb-asd-ava", avatarInitial(name));
    ava.style.background = agent.color;
    mountAgentAvatar(ava, agent.id, { alt: name });
    head.appendChild(ava);
    const info = el("div");
    info.appendChild(el("div", "sb-asd-name", name));
    info.appendChild(el("div", "sb-asd-title", `${title} · ${(agent.domains || [agent.category]).join("、")}`));
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
      const count = categoryCount(category);
      chip.dataset.count = String(count);
      chip.setAttribute("aria-label", `${category}，${count} 位可雇佣成员`);
      chip.title = `${category} · ${count} 位可雇佣成员`;
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
    secTitle.appendChild(el("span", "sb-as-sec-sub", "可选扩展成员 · 默认销售团队已在上方安装"));
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
