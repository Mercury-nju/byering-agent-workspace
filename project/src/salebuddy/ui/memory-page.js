/**
 * Agent memory map.
 *
 * The map is a visual index over the same profile and memory records used by
 * Agent detail pages. Every Agent can be selected, while the four outer nodes
 * expose the parts of that Agent's working context that matter in practice.
 */
import { el, openPage } from "./pages.js";
import { clearNavigationRoute, persistNavigationRoute } from "./navigation-routes.js";
import { mountAgentAvatar } from "./agent-avatar.js";
import { getAgentProfileSync } from "../agents/registry.js";
import { MARKETPLACE_AGENTS } from "../agents/marketplace.js";
import { displayAgentName } from "../brand.js";
import { accountMemoryConversationId, accountMemorySummary, isAccountMemoryAgent } from "./agent-profile.js";
import { receptionBaseUrl, receptionRequest } from "../bridge/account-reception-client.js";
import { companionRequest } from "../bridge/companion-client.js";
import { createRealtimeMockPreviewAccounts, realtimeWorkPreviewMode } from "./realtime-work.js";

const STORAGE_KEY = "byering.agent-memory-enabled";
const LEGACY_STORAGE_KEY = "byering.main-agent-memory-enabled";
const DEFAULT_AGENT_ID = MARKETPLACE_AGENTS[0]?.id || "";

const MOCK_ACCOUNT_MEMORY_AGENT_IDS = new Set([
  "mkt-comment-acquisition",
  "mkt-find-people",
  "mkt-intent-analyst",
  "mkt-cold-writer",
  "mkt-dm-inbox",
  "mkt-gold-customer-service",
  "mkt-live-danmaku-analysis",
  "mkt-live-danmaku-outreach",
  "mkt-viral-work-analysis"
]);

const MOCK_ACCOUNT_POLICY_SCENARIOS = Object.freeze({
  automotive: Object.freeze({
    context: "小鹿以个人新能源车主视角，记录上海通勤、补能和选车体验；不代表车企、门店或品牌。",
    dataScope: ["本账号已授权的作品评论", "直播互动与关注通知", "已授权私信会话", "已发布的个人用车内容"],
    boundary: "不承诺车价、现车、补贴或试驾名额；未在账号资料中确认的信息不推测。",
    signals: ["续航、充电、通勤距离和冬季能耗", "预算、落地费用和置换疑问", "上海周末试驾、停车与补能场景"],
    touch: ["仅对有明确问题或换车信号的互动生成首触建议，并保留原话与来源作品", "先回应对方正在问的用车问题，只引用小鹿已发布或确认过的个人体验", "同一用户 7 天内最多一次主动触达；未回复不自动追问", "抽奖、表情刷屏、同行账号和无购买场景的泛互动不触达"],
    conversation: ["先复述对方当前问题，并说明回答基于个人用车体验", "按通勤距离、补能条件和预算补问必要信息，再给出与问题直接相关的内容建议", "涉及官方价格、现车、补贴、售后或安全结论时停止自动承诺并交给账号主人"],
    knowledge: "常见内容围绕上海通勤、家充与公共补能、续航体验和选车记录。"
  }),
  education: Object.freeze({
    context: "安安以学生个人笔记的方式分享中考复习、学习方法和升学准备；不代表学校、机构或升学顾问。",
    dataScope: ["本账号已授权的学习笔记评论", "直播问答与关注通知", "已授权私信会话", "已发布的复习与升学内容"],
    boundary: "不承诺录取结果、排名提升或政策结论；学校规则和当年政策必须由账号主人确认。",
    signals: ["中考复习节奏、错题整理和学科薄弱点", "志愿、校区与报名时间的咨询", "家长对学习资料、方法和陪伴方式的需求"],
    touch: ["只承接带有具体学习问题、资料需求或升学时间点的互动，并引用对应笔记内容", "首触以分享可验证的学习方法或公开资料入口为主，不制造焦虑", "同一用户 7 天内最多一次主动触达；对方未继续提问时不催问", "仅问录取概率、索要个人资料或没有具体问题的互动不进入触达"],
    conversation: ["先回答当前的复习或资料问题，再确认年级、学科和时间安排", "用安安已实践过的学习方法给出下一步，不把个人经验包装成专业诊断", "涉及招生政策、录取判断、未成年人隐私或家长投诉时立即交给账号主人"],
    knowledge: "常见内容围绕中考复习节奏、错题整理、学习资料和升学信息整理。"
  }),
  home: Object.freeze({
    context: "阿杰以个人收纳爱好者身份分享租房整理、家居好物和商品清单，是本次 mock 中的个人电商好物账号。",
    dataScope: ["本账号已授权的作品评论", "直播互动与商品咨询", "已授权私信会话", "已授权商品卡与内容资料"],
    boundary: "商品价格、库存、链接和售后只以已授权商品资料为准；不伪称品牌、店铺客服或发货方。",
    signals: ["求链接、尺寸、材质和适用空间", "租房、89 平方米收纳和改造场景", "预算、优惠、同款替代和购买时机"],
    touch: ["优先承接明确询问链接、尺寸、材质或适用场景的互动，并关联对应商品卡或视频", "首触先解决当前收纳问题，再在对方主动询问时提供已授权的商品信息", "同一用户 7 天内最多一次主动触达；未回复不自动补发商品链接", "抽奖、仅点赞、无商品或场景问题的互动不进入触达"],
    conversation: ["先确认空间、尺寸和预算，再回答对应商品或整理方案", "链接、价格和优惠只引用当前已授权商品资料；没有资料时说明需要账号主人确认", "涉及库存、发货、售后、退款、合作报价或投诉时交给账号主人"],
    knowledge: "常见内容围绕租房收纳、小户型空间利用、家居好物和个人电商商品清单。"
  })
});

export function supportsAccountStrategyMemory(agentType, previewMode = realtimeWorkPreviewMode()) {
  const id = String(agentType || "").trim();
  return isAccountMemoryAgent(id) || (previewMode === "style" && MOCK_ACCOUNT_MEMORY_AGENT_IDS.has(id));
}

function mockAccountScenarioFor(account = {}) {
  return MOCK_ACCOUNT_POLICY_SCENARIOS[account?.mockScenario] || MOCK_ACCOUNT_POLICY_SCENARIOS.home;
}

function mockAccountAgentPlan(agentType, scenario) {
  const id = String(agentType || "").trim();
  if (id === "mkt-live-danmaku-analysis") {
    return {
      title: "直播弹幕采集策略",
      steps: ["只读取本账号正在进行直播中的授权弹幕与互动信号", "按账号场景标记提问、求链接、体验与购买相关原话", "直播结束后归档场次证据，再交给获客管家判断是否进入后续动作"],
      touch: [],
      conversation: []
    };
  }
  if (id === "mkt-live-danmaku-outreach") {
    return {
      title: "直播追单策略",
      steps: ["从已归档且通过证据校验的直播互动中选择可跟进用户", "按当前直播问题生成一对一追单建议", "只在频控与人工边界允许时执行，并回写用户回复"],
      touch: scenario.touch,
      conversation: scenario.conversation
    };
  }
  if (id === "mkt-viral-work-analysis") {
    return {
      title: "爆款作品分析策略",
      steps: ["分析本账号已授权作品的选题、互动和评论结构", "把高互动内容与账号场景和用户问题关联起来", "输出下一条内容和互动承接建议，不复制未授权内容或虚构数据"],
      touch: [],
      conversation: []
    };
  }
  if (id === "mkt-comment-acquisition") {
    return {
      title: "账号获客闭环",
      steps: ["读取本账号新增评论、直播互动、关注与私信信号", "按账号场景识别意向并保留原话、来源和时间", "先生成可审核的首触建议，再把已回复会话交给客服策略承接"],
      touch: scenario.touch,
      conversation: scenario.conversation
    };
  }
  if (id === "mkt-find-people") {
    return {
      title: "账号内找人策略",
      steps: ["在本账号互动中筛出与内容主题匹配的用户", "按意向信号标注来源证据和信息缺口", "把候选用户交给客户分析员，不直接发送私信"],
      touch: [],
      conversation: []
    };
  }
  if (id === "mkt-intent-analyst") {
    return {
      title: "账号内意向判断",
      steps: ["根据原话、互动场景和账号内容计算优先级", "将明确需求、隐性需求和无法确认的信号分开", "输出可追溯的触达建议，不把推测当作事实"],
      touch: [],
      conversation: []
    };
  }
  if (id === "mkt-cold-writer") {
    return {
      title: "个性化首触策略",
      steps: ["读取已审核的意向证据和账号边界", "按当前问题生成一对一首触草稿", "等待审核后执行，并回写送达与回复结果"],
      touch: scenario.touch,
      conversation: []
    };
  }
  if (id === "mkt-dm-inbox") {
    return {
      title: "私信承接策略",
      steps: ["监听本账号的新私信和已触达用户回复", "先解决当前问题，再按账号目标推进一个必要动作", "命中人工边界时停止自动回复并保留完整上下文"],
      touch: [],
      conversation: scenario.conversation
    };
  }
  return {
    title: "金牌客服接待策略",
    steps: ["优先承接新私信与高意向回复，识别对方当前问题", "先给出有依据的答复，再按场景推进一个必要的后续动作", "需要承诺或无法确认时交给账号主人，保留对话和依据"],
    touch: scenario.touch,
    conversation: scenario.conversation
  };
}

export function createMockAccountMemoryRecord(agentType, account = {}) {
  const scenario = mockAccountScenarioFor(account);
  const plan = mockAccountAgentPlan(agentType, scenario);
  const role = account?.mockScenario === "home" ? "creator" : "personal";
  const shouldCaptureContact = ["mkt-comment-acquisition", "mkt-cold-writer"].includes(String(agentType || ""));
  return {
    revision: 3,
    updatedAt: "2026-09-18T09:30:00.000Z",
    settings: {
      goal: shouldCaptureContact ? "contact" : "answer",
      goalDetails: plan.conversation[1] || plan.touch[1] || plan.steps[1],
      persona: { role },
      length: "balanced",
      knowledge: scenario.knowledge,
      handoff: { price: true, complaints: true, unknown: true, humanRequest: true }
    },
    privateReception: { enabled: true, runtimeState: "running" },
    mockStrategy: {
      accountContext: scenario.context,
      dataScope: scenario.dataScope,
      boundary: scenario.boundary,
      signals: scenario.signals,
      title: plan.title,
      steps: plan.steps,
      touch: plan.touch,
      conversation: plan.conversation
    }
  };
}

export function createMockAccountMemoryMessages(agentType, account = {}) {
  const strategy = createMockAccountMemoryRecord(agentType, account).mockStrategy;
  const messages = [{
    id: `mock-strategy-${String(agentType || "agent")}-${String(account?.id || "account")}-scope`,
    from: "system",
    text: `${account?.name || "当前账号"}：已按账号定位加载 ${strategy.title}。`
  }];
  if (strategy.touch.length) messages.push({
    id: `mock-strategy-${String(agentType || "agent")}-${String(account?.id || "account")}-touch`,
    from: "system",
    text: `触达策略：${strategy.touch[0]}`
  });
  if (strategy.conversation.length) messages.push({
    id: `mock-strategy-${String(agentType || "agent")}-${String(account?.id || "account")}-conversation`,
    from: "system",
    text: `对话策略：${strategy.conversation[0]}`
  });
  return messages;
}

const KIND_DEFINITIONS = Object.freeze([
  { kind: "userRules", label: "用户偏好", icon: "◌", tone: "blue", copy: "称呼、表达方式与长期偏好" },
  { kind: "projectRules", label: "项目背景", icon: "□", tone: "violet", copy: "项目目标、客户与业务上下文" },
  { kind: "bestPractices", label: "工作方法", icon: "⌁", tone: "green", copy: "已经验证的流程与交付标准" },
  { kind: "feedback", label: "纠正反馈", icon: "↗", tone: "orange", copy: "你纠正过的判断与表达" },
  { kind: "lessons", label: "经验总结", icon: "✦", tone: "pink", copy: "任务复盘中沉淀的经验" }
]);

const DIMENSION_DEFINITIONS = Object.freeze([
  { key: "capabilities", label: "业务能力", icon: "◈", tone: "blue", copy: "职责、技能、工具与交付边界" },
  { key: "soul", label: "Soul", icon: "✧", tone: "violet", copy: "身份、气质、原则与安全底线" },
  { key: "memory", label: "记忆", icon: "⌘", tone: "green", copy: "用户规则、项目背景、经验、反馈与方法" },
  { key: "accountPolicy", label: "账号策略", icon: "◎", tone: "orange", copy: "账号数据范围、审批、频控与人工交接" }
]);

const KIND_LABELS = Object.freeze(Object.fromEntries(KIND_DEFINITIONS.map(({ kind, label }) => [kind, label])));
const SCOPE_LABELS = Object.freeze({ task: "本次任务", project: "当前项目", agent: "当前 Agent", organization: "整个组织", lead: "账号 / 潜客" });

const CSS = `
.sb-memory-map-page.sb-page{background:var(--sb-app-page-bg,#f7f8fb);color:#1f2329}
.sb-memory-map-page .sb-page-head{display:none}.sb-memory-map-page .sb-page-body{overflow:hidden;background:var(--sb-app-page-bg,#f7f8fb)}
.sb-memory-map{position:relative;width:100%;height:100%;min-height:620px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;background:var(--sb-app-page-bg,#f7f8fb);color:#1f2329}
.sb-memory-map::before{content:"";position:absolute;inset:0;background-image:radial-gradient(circle,rgba(31,35,41,.12) 1px,transparent 1.1px);background-size:24px 24px;opacity:.5;pointer-events:none}
.sb-memory-toolbar{position:absolute;z-index:8;top:18px;left:22px;right:22px;display:flex;align-items:center;justify-content:space-between;gap:14px;pointer-events:none}
.sb-memory-toolbar-left,.sb-memory-toolbar-right{display:flex;align-items:center;gap:10px;pointer-events:auto}
.sb-memory-icon-button,.sb-memory-pill,.sb-memory-toggle,.sb-memory-agent-picker-trigger{height:42px;border:1px solid rgba(15,15,15,.1);border-radius:13px;background:rgba(255,255,255,.95);color:#1f2329;box-shadow:0 8px 24px rgba(32,40,48,.08);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);font:inherit;cursor:pointer}
.sb-memory-icon-button{width:42px;display:grid;place-items:center;font-size:23px;font-weight:300;color:#646b73}.sb-memory-icon-button:hover,.sb-memory-pill:hover,.sb-memory-toggle:hover,.sb-memory-agent-picker-trigger:hover{border-color:rgba(15,15,15,.2);background:#fff}
.sb-memory-pill{display:flex;align-items:center;gap:9px;padding:0 14px;font-size:14px;font-weight:600}.sb-memory-pill-icon{font-size:17px;color:#b97717}.sb-memory-help{width:18px;height:18px;display:grid;place-items:center;border:1px solid rgba(31,35,41,.3);border-radius:50%;font-size:11px;color:#646b73}
.sb-memory-agent-picker{position:relative;pointer-events:auto}.sb-memory-agent-picker-trigger{min-width:198px;max-width:250px;display:flex;align-items:center;gap:9px;padding:0 11px;text-align:left;outline:0}.sb-memory-agent-picker-trigger:focus-visible{border-color:#b97717;box-shadow:0 0 0 3px rgba(185,119,23,.12)}.sb-memory-agent-picker[data-open="true"] .sb-memory-agent-picker-trigger{border-color:#b97717;box-shadow:0 0 0 3px rgba(185,119,23,.1),0 8px 24px rgba(32,40,48,.08)}
.sb-memory-agent-picker-avatar{width:25px;height:25px;flex:none;border-radius:9px;overflow:hidden;background:#eef1f4;border:1px solid rgba(31,35,41,.1)}.sb-memory-agent-picker-avatar img{width:100%;height:100%;object-fit:cover}.sb-memory-agent-picker-current{min-width:0;display:flex;flex:1;flex-direction:column;align-items:flex-start;gap:1px}.sb-memory-agent-picker-name{width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:650}.sb-memory-agent-picker-title{width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#8a9199;font-size:10px;line-height:14px}.sb-memory-agent-picker-chevron{flex:none;color:#737981;font-size:16px;line-height:1;transition:transform .18s ease}.sb-memory-agent-picker[data-open="true"] .sb-memory-agent-picker-chevron{transform:rotate(180deg)}
.sb-memory-agent-picker-menu{position:absolute;z-index:30;top:calc(100% + 8px);left:0;width:300px;max-height:min(450px,calc(100vh - 100px));overflow:auto;padding:8px;border:1px solid rgba(15,15,15,.11);border-radius:16px;background:rgba(255,255,255,.98);box-shadow:0 18px 48px rgba(32,40,48,.18);backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px)}.sb-memory-agent-picker-menu[hidden]{display:none}.sb-memory-agent-picker-menu-label{display:flex;align-items:center;justify-content:space-between;padding:5px 9px 8px;color:#8a9199;font-size:10px;font-weight:650;letter-spacing:.03em}.sb-memory-agent-picker-menu-count{color:#b97717;font-weight:600}.sb-memory-agent-picker-option{width:100%;min-height:52px;display:flex;align-items:center;gap:9px;padding:8px 9px;border:0;border-radius:10px;background:transparent;color:#34383f;font:inherit;text-align:left;cursor:pointer}.sb-memory-agent-picker-option:hover,.sb-memory-agent-picker-option:focus-visible{outline:0;background:#f2f5f8}.sb-memory-agent-picker-option[aria-selected="true"]{background:#fff7ea;color:#9b610f}.sb-memory-agent-picker-option-avatar{width:32px;height:32px;flex:none;border-radius:10px;overflow:hidden;background:#eef1f4;border:1px solid rgba(31,35,41,.1)}.sb-memory-agent-picker-option-avatar img{width:100%;height:100%;object-fit:cover}.sb-memory-agent-picker-option-copy{min-width:0;display:flex;flex:1;flex-direction:column;gap:2px}.sb-memory-agent-picker-option-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:650}.sb-memory-agent-picker-option-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#8a9199;font-size:10px;line-height:15px}.sb-memory-agent-picker-option[aria-selected="true"] .sb-memory-agent-picker-option-title{color:#b97717}.sb-memory-agent-picker-check{width:18px;flex:none;color:#b97717;font-size:14px;text-align:center;opacity:0}.sb-memory-agent-picker-option[aria-selected="true"] .sb-memory-agent-picker-check{opacity:1}
.sb-memory-toggle{display:flex;align-items:center;gap:9px;padding:0 14px;font-size:13px;color:#4d535b}.sb-memory-toggle[data-enabled="true"] .sb-memory-toggle-dot{background:#42d98a;box-shadow:0 0 0 4px rgba(66,217,138,.12),0 0 14px rgba(66,217,138,.55)}.sb-memory-toggle-dot{width:9px;height:9px;border-radius:50%;background:#737981;transition:background .2s ease,box-shadow .2s ease}
.sb-memory-map-viewport{position:absolute;inset:0;overflow:hidden;touch-action:none;cursor:grab}.sb-memory-map-viewport[data-dragging="true"]{cursor:grabbing}.sb-memory-map-scene{position:absolute;left:50%;top:50%;width:1120px;height:860px;transform-origin:50% 50%;transition:transform .18s ease;will-change:transform}.sb-memory-map-scene[data-panning="true"]{transition:none}
.sb-memory-map-links{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none}.sb-memory-map-link{fill:none;stroke:rgba(99,108,119,.36);stroke-width:1.2;stroke-linecap:round;stroke-dasharray:2 6}.sb-memory-map-link[data-active="true"]{stroke:#b97717;stroke-width:1.8;stroke-dasharray:none;filter:drop-shadow(0 0 5px rgba(185,119,23,.22))}
.sb-memory-center{position:absolute;left:50%;top:50%;width:174px;height:174px;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;border:1px solid rgba(185,119,23,.68);border-radius:28px;background:#fff;box-shadow:0 0 0 1px rgba(185,119,23,.08),0 18px 50px rgba(32,40,48,.12);cursor:pointer}.sb-memory-center:hover{border-color:#b97717;transform:translate(-50%,-50%) scale(1.025)}
.sb-memory-center-avatar{width:70px;height:70px;border-radius:22px;overflow:hidden;background:#f0f2f5;border:1px solid rgba(31,35,41,.12)}.sb-memory-center-avatar img{width:100%;height:100%;object-fit:cover}.sb-memory-center-name{font-size:15px;font-weight:650;color:#1f2329}.sb-memory-center-meta{max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;color:#777e87}
.sb-memory-dimension-node{position:absolute;width:164px;height:104px;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;border:1px solid rgba(15,15,15,.1);border-radius:23px;background:#fff;color:#34383f;cursor:pointer;box-shadow:0 12px 30px rgba(32,40,48,.08);transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease}.sb-memory-dimension-node:hover,.sb-memory-dimension-node[data-active="true"]{transform:translate(-50%,-50%) scale(1.045);border-color:#b97717;background:#fff;box-shadow:0 0 0 1px rgba(185,119,23,.2),0 14px 34px rgba(32,40,48,.14)}
.sb-memory-dimension-icon{font-size:20px;line-height:1}.sb-memory-dimension-label{font-size:14px;font-weight:650}.sb-memory-dimension-count{font-size:11px;color:#777e87}.sb-memory-dimension-node[data-tone="blue"] .sb-memory-dimension-icon{color:#4c86ce}.sb-memory-dimension-node[data-tone="violet"] .sb-memory-dimension-icon{color:#8468c2}.sb-memory-dimension-node[data-tone="green"] .sb-memory-dimension-icon{color:#299b70}.sb-memory-dimension-node[data-tone="orange"] .sb-memory-dimension-icon{color:#b97717}
.sb-memory-entry-node{position:absolute;width:210px;min-height:74px;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:6px;padding:12px 15px;border:1px solid rgba(15,15,15,.1);border-radius:16px;background:#fff;color:#34383f;cursor:pointer;box-shadow:0 10px 26px rgba(32,40,48,.07);transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease;text-align:left}.sb-memory-entry-node:hover,.sb-memory-entry-node[data-active="true"]{transform:translate(-50%,-50%) scale(1.035);border-color:#b97717;box-shadow:0 0 0 1px rgba(185,119,23,.16),0 14px 32px rgba(32,40,48,.12)}.sb-memory-entry-node-text{display:-webkit-box;width:100%;overflow:hidden;color:#34383f;font-size:12px;font-weight:600;line-height:18px;-webkit-box-orient:vertical;-webkit-line-clamp:2}.sb-memory-entry-node-meta{width:100%;overflow:hidden;color:#8a9199;font-size:10px;line-height:15px;text-overflow:ellipsis;white-space:nowrap}.sb-memory-entry-overflow{align-items:center;text-align:center;border-style:dashed;color:#777e87;background:rgba(255,255,255,.78)}.sb-memory-entry-overflow .sb-memory-entry-node-text{display:block;text-align:center;color:#777e87}.sb-memory-entry-link{stroke:rgba(99,108,119,.24);stroke-width:1;stroke-dasharray:2 7}.sb-memory-entry-link[data-active="true"]{stroke:#b97717;stroke-width:1.5;stroke-dasharray:none}
.sb-memory-map-hint{position:absolute;left:24px;bottom:22px;z-index:4;font-size:12px;color:#7b838c;pointer-events:none}.sb-memory-map-controls{position:absolute;left:22px;bottom:20px;z-index:6;display:flex;flex-direction:column;border:1px solid rgba(15,15,15,.1);border-radius:13px;overflow:hidden;background:rgba(255,255,255,.94);box-shadow:0 8px 24px rgba(32,40,48,.08)}.sb-memory-map-control{width:42px;height:42px;border:0;border-bottom:1px solid rgba(15,15,15,.08);background:transparent;color:#646b73;font:inherit;font-size:21px;cursor:pointer}.sb-memory-map-control:last-child{border-bottom:0}.sb-memory-map-control:hover{background:rgba(15,15,15,.05);color:#1f2329}
.sb-memory-inspector{position:absolute;z-index:9;top:76px;right:22px;bottom:22px;width:min(390px,calc(100% - 44px));display:flex;flex-direction:column;border:1px solid rgba(15,15,15,.1);border-radius:20px;background:rgba(255,255,255,.97);box-shadow:0 22px 70px rgba(32,40,48,.16);backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px);transform:translateX(calc(100% + 28px));transition:transform .24s ease;overflow:hidden}.sb-memory-inspector[data-open="true"]{transform:translateX(0)}
.sb-memory-inspector-head{display:flex;align-items:flex-start;gap:12px;padding:20px 20px 15px;border-bottom:1px solid rgba(15,15,15,.08)}.sb-memory-inspector-icon{width:38px;height:38px;display:grid;place-items:center;border-radius:12px;background:rgba(185,119,23,.12);color:#a66a12;font-size:19px;flex:none}.sb-memory-inspector-copy{min-width:0;flex:1}.sb-memory-inspector-title{font-size:16px;font-weight:650;color:#1f2329}.sb-memory-inspector-subtitle{margin-top:4px;font-size:12px;line-height:18px;color:#777e87}.sb-memory-inspector-close{width:28px;height:28px;border:0;border-radius:8px;background:transparent;color:#777e87;font:inherit;font-size:20px;cursor:pointer}.sb-memory-inspector-close:hover{background:rgba(15,15,15,.06);color:#1f2329}
.sb-memory-inspector-body{flex:1;min-height:0;overflow:auto;padding:14px 20px 20px}.sb-memory-detail-group{padding:13px 0;border-bottom:1px solid rgba(15,15,15,.08)}.sb-memory-detail-group:last-child{border-bottom:0}.sb-memory-detail-label{margin-bottom:7px;font-size:11px;font-weight:650;color:#8a9199;letter-spacing:.02em}.sb-memory-detail-value{font-size:13px;line-height:20px;color:#34383f;white-space:pre-wrap;word-break:break-word}.sb-memory-detail-list{display:flex;flex-wrap:wrap;gap:6px;margin:0;padding:0;list-style:none}.sb-memory-detail-list li{padding:5px 8px;border-radius:7px;background:rgba(15,15,15,.055);font-size:12px;line-height:17px;color:#4d535b}.sb-memory-detail-list li[data-tone="warn"]{background:rgba(185,119,23,.1);color:#9b610f}.sb-memory-account-memory{margin:0 0 12px;padding:10px 11px;border:1px solid rgba(76,134,206,.18);border-radius:10px;background:#fbfdff}.sb-memory-account-memory-head{display:flex;align-items:center;gap:8px;margin-bottom:8px}.sb-memory-account-memory-title{font-size:11px;font-weight:650;color:#3b6bd4}.sb-memory-account-memory-select{margin-left:auto;max-width:180px;min-width:100px;border:1px solid rgba(15,15,15,.12);border-radius:7px;padding:5px 7px;font:inherit;font-size:11px;color:#34383f;background:#fff;outline:0}.sb-memory-account-memory-select:focus{border-color:#4c86ce;box-shadow:0 0 0 3px rgba(76,134,206,.1)}.sb-memory-account-memory-state{margin-top:8px;font-size:11px;color:#777e87;line-height:17px}.sb-memory-entry{padding:13px 0;border-bottom:1px solid rgba(15,15,15,.08)}.sb-memory-entry:last-child{border-bottom:0}.sb-memory-entry-text{font-size:13px;line-height:20px;color:#34383f}.sb-memory-entry-meta{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-top:8px;color:#777e87;font-size:11px}.sb-memory-tag{padding:3px 7px;border-radius:6px;background:rgba(15,15,15,.06);color:#646b73}.sb-memory-entry-action{margin-left:auto;border:0;background:transparent;color:#a66a12;font:inherit;font-size:11px;cursor:pointer}.sb-memory-entry-action:hover{color:#7d4f0e}.sb-memory-empty{padding:30px 0;text-align:center;color:#777e87;font-size:12px;line-height:20px;white-space:pre-line}.sb-memory-add{display:flex;gap:8px;padding:14px 20px 18px;border-top:1px solid rgba(15,15,15,.08)}.sb-memory-add input{min-width:0;flex:1;height:36px;padding:0 10px;border:1px solid rgba(15,15,15,.12);border-radius:9px;outline:0;background:#fff;color:#1f2329;font:inherit;font-size:12px}.sb-memory-add input:focus{border-color:rgba(185,119,23,.7);box-shadow:0 0 0 3px rgba(185,119,23,.1)}.sb-memory-add button{height:36px;padding:0 12px;border:0;border-radius:9px;background:#b97717;color:#fff;font:inherit;font-size:12px;font-weight:650;cursor:pointer}.sb-memory-add button:hover{background:#9b610f}.sb-memory-loading{padding:36px 0;text-align:center;color:#8a9199;font-size:12px}
@media(max-width:760px){.sb-memory-toolbar{top:12px;left:14px;right:14px}.sb-memory-pill{padding:0 10px}.sb-memory-agent-picker-trigger{min-width:154px;max-width:200px;padding:0 9px}.sb-memory-agent-picker-title{display:none}.sb-memory-agent-picker-menu{left:auto;right:0;width:min(300px,calc(100vw - 28px))}.sb-memory-toggle{padding:0 10px}.sb-memory-toggle-label{display:none}.sb-memory-map-scene{transform:translate(-50%,-50%) scale(.62)}.sb-memory-inspector{top:68px;right:14px;bottom:14px;width:calc(100% - 28px)}.sb-memory-map-hint{left:14px;bottom:18px}.sb-memory-map-controls{left:auto;right:14px;bottom:18px}}
@media(prefers-reduced-motion:reduce){.sb-memory-map-scene,.sb-memory-inspector,.sb-memory-dimension-node,.sb-memory-center{transition:none}}
`;

let styleInjected = false;
function ensureStyle() {
  if (styleInjected) return;
  const tag = document.createElement("style");
  tag.textContent = CSS;
  document.head.appendChild(tag);
  styleInjected = true;
}

function readEnabled() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored != null) return stored !== "false";
    return window.localStorage.getItem(LEGACY_STORAGE_KEY) !== "false";
  } catch { return true; }
}

function writeEnabled(enabled) {
  try { window.localStorage.setItem(STORAGE_KEY, String(enabled)); } catch { /* storage may be unavailable */ }
}

function createLink(svg, x1, y1, x2, y2, active = false, className = "sb-memory-map-link") {
  const line = document.createElementNS("http://www.w3.org/2000/svg", "path");
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  line.setAttribute("d", `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`);
  line.setAttribute("class", className);
  line.dataset.active = String(active);
  svg.appendChild(line);
  return line;
}

function fmtTime(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : `${date.getMonth() + 1}/${date.getDate()}`;
}

function cleanAgentName(value, fallback = "Agent") {
  const text = String(value || fallback).trim();
  return text.replace(/^Byering\s*[·•]\s*/, "") || fallback;
}

function mountPickerAvatar(container, agent) {
  if (!container || !agent) return;
  container.style.background = agent.color || "#6c7a89";
  container.style.color = "#fff";
  if (!mountAgentAvatar(container, agent.id, { alt: `${agent.name}头像`, trackPointer: false, mode: "memory-map" })) {
    container.textContent = Array.from(agent.name || "A")[0] || "A";
    container.style.display = "grid";
    container.style.placeItems = "center";
    container.style.fontSize = "12px";
    container.style.fontWeight = "700";
  }
}

function buildAgentCatalog() {
  return MARKETPLACE_AGENTS.filter((agent) => agent?.id).map((agent) => ({
    id: agent.id,
    group: "Agent 中心",
    name: cleanAgentName(agent.displayName || agent.name, agent.id),
    title: agent.displayTitle || agent.title || "",
    description: agent.desc || agent.mission || "",
    deliverables: agent.deliverables || []
  }));
}

function listValues(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  if (value == null || value === "") return [];
  return [String(value).trim()].filter(Boolean);
}

function objectValues(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const format = (item) => {
    if (Array.isArray(item)) return item.map(format).filter(Boolean).join("、");
    if (!item || typeof item !== "object") return String(item ?? "");
    return Object.entries(item).filter(([key]) => key !== "meta").map(([key, nested]) => `${key}=${format(nested)}`).join("，");
  };
  return Object.entries(value).filter(([key]) => key !== "meta").map(([key, item]) => {
    const formatted = format(item);
    return formatted ? `${key}：${formatted}` : "";
  }).filter(Boolean);
}

function valuesFrom(value) {
  return Array.isArray(value) || typeof value === "string" ? listValues(value) : objectValues(value);
}

function firstNonEmpty(...values) {
  return values.flatMap(listValues)[0] || "";
}

export function openMemoryPage({ gateway: initialGateway = null, onClose = null } = {}) {
  persistNavigationRoute("kbMemory");
  ensureStyle();
  const page = openPage({ title: "记忆", onClose: () => { clearNavigationRoute("kbMemory"); onClose?.(); } });
  page.root.classList.add("sb-memory-map-page");
  const root = el("div", "sb-memory-map notranslate");
  root.setAttribute("translate", "no");
  page.body.appendChild(root);

  const catalog = buildAgentCatalog();
  let gateway = initialGateway;
  let selectedAgentId = catalog.some((agent) => agent.id === DEFAULT_AGENT_ID) ? DEFAULT_AGENT_ID : catalog[0]?.id;
  let profile = getAgentProfileSync(selectedAgentId);
  let entries = [];
  let selectedDimension = null;
  let selectedKind = null;
  let selectedEntryId = null;
  let loading = true;
  let disposed = false;
  let loadVersion = 0;
  let accountMemory = { agentType: "", accounts: [], selectedId: "", record: null, messages: [], loading: false, error: "", accountsLoaded: false, loadVersion: 0 };
  const selectedCatalogAgent = () => catalog.find((agent) => agent.id === selectedAgentId) || { id: selectedAgentId, name: selectedAgentId, title: "" };

  const toolbar = el("div", "sb-memory-toolbar");
  const left = el("div", "sb-memory-toolbar-left");
  const back = el("button", "sb-memory-icon-button", "‹");
  back.type = "button"; back.setAttribute("aria-label", "返回"); back.addEventListener("click", () => page.close());
  const pill = el("div", "sb-memory-pill");
  pill.append(el("span", "sb-memory-pill-icon", "♧"), el("span", "", "Agent 记忆"), el("span", "sb-memory-help", "?"));
  const agentPicker = el("div", "sb-memory-agent-picker");
  agentPicker.dataset.open = "false";
  const agentPickerTrigger = el("button", "sb-memory-agent-picker-trigger");
  agentPickerTrigger.type = "button";
  agentPickerTrigger.setAttribute("aria-label", "选择 Agent");
  agentPickerTrigger.setAttribute("aria-haspopup", "listbox");
  agentPickerTrigger.setAttribute("aria-expanded", "false");
  const agentPickerAvatar = el("span", "sb-memory-agent-picker-avatar");
  const agentPickerCurrent = el("span", "sb-memory-agent-picker-current");
  const agentPickerName = el("span", "sb-memory-agent-picker-name");
  const agentPickerTitle = el("span", "sb-memory-agent-picker-title");
  agentPickerCurrent.append(agentPickerName, agentPickerTitle);
  agentPickerTrigger.append(agentPickerAvatar, agentPickerCurrent, el("span", "sb-memory-agent-picker-chevron", "⌄"));
  const agentPickerMenu = el("div", "sb-memory-agent-picker-menu");
  agentPickerMenu.setAttribute("role", "listbox");
  agentPickerMenu.setAttribute("aria-label", "Agent 中心");
  agentPickerMenu.hidden = true;
  const agentPickerMenuLabel = el("div", "sb-memory-agent-picker-menu-label");
  agentPickerMenuLabel.append(el("span", "", "Agent 中心"), el("span", "sb-memory-agent-picker-menu-count", `${catalog.length} 个`));
  agentPickerMenu.appendChild(agentPickerMenuLabel);
  const agentPickerOptions = [];
  for (const agent of catalog) {
    const option = el("button", "sb-memory-agent-picker-option");
    option.type = "button";
    option.dataset.agentId = agent.id;
    option.setAttribute("role", "option");
    option.setAttribute("aria-selected", "false");
    option.tabIndex = -1;
    const optionAvatar = el("span", "sb-memory-agent-picker-option-avatar");
    const optionCopy = el("span", "sb-memory-agent-picker-option-copy");
    optionCopy.append(el("span", "sb-memory-agent-picker-option-name", agent.name), el("span", "sb-memory-agent-picker-option-title", agent.title || agent.description));
    option.append(optionAvatar, optionCopy, el("span", "sb-memory-agent-picker-check", "✓"));
    agentPickerMenu.appendChild(option);
    agentPickerOptions.push({ agent, option, avatar: optionAvatar });
  }
  agentPicker.append(agentPickerTrigger, agentPickerMenu);
  left.append(back, pill, agentPicker);
  const right = el("div", "sb-memory-toolbar-right");
  const toggle = el("button", "sb-memory-toggle"); toggle.type = "button";
  toggle.append(el("span", "sb-memory-toggle-dot"), el("span", "sb-memory-toggle-label", "记忆已开启"));
  const setEnabled = (enabled) => { toggle.dataset.enabled = String(enabled); toggle.querySelector(".sb-memory-toggle-label").textContent = enabled ? "记忆已开启" : "记忆已关闭"; toggle.setAttribute("aria-pressed", String(enabled)); };
  setEnabled(readEnabled()); toggle.addEventListener("click", () => { const enabled = toggle.dataset.enabled !== "true"; setEnabled(enabled); writeEnabled(enabled); });
  right.append(toggle); toolbar.append(left, right); root.appendChild(toolbar);

  const viewport = el("div", "sb-memory-map-viewport");
  const scene = el("div", "sb-memory-map-scene");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "sb-memory-map-links"); svg.setAttribute("viewBox", "0 0 1120 860");
  const centerX = 560; const centerY = 430;
  const positions = [[560, 120], [245, 390], [875, 390], [560, 720]];
  const entryPositions = Object.freeze({
    userRules: [[360, 210], [760, 210], [560, 220]], projectRules: [[120, 300], [120, 500], [245, 400]],
    bestPractices: [[1000, 300], [1000, 500], [875, 400]], feedback: [[320, 680], [800, 680], [560, 790]], lessons: [[370, 790], [750, 790], [560, 820]]
  });
  const nodeByDimension = new Map(); const dimensionLinks = new Map();
  const center = el("button", "sb-memory-center"); center.type = "button";
  const centerAvatar = el("span", "sb-memory-center-avatar");
  const centerName = el("span", "sb-memory-center-name", ""); const centerMeta = el("span", "sb-memory-center-meta", "");
  center.append(centerAvatar, centerName, centerMeta); scene.append(svg, center);
  DIMENSION_DEFINITIONS.forEach((definition, index) => {
    const node = el("button", "sb-memory-dimension-node"); node.type = "button"; node.dataset.dimension = definition.key; node.dataset.tone = definition.tone;
    node.style.left = `${positions[index][0]}px`; node.style.top = `${positions[index][1]}px`; node.setAttribute("aria-label", `查看${definition.label}`);
    node.append(el("span", "sb-memory-dimension-icon", definition.icon), el("span", "sb-memory-dimension-label", definition.label), el("span", "sb-memory-dimension-count", "")); scene.appendChild(node);
    nodeByDimension.set(definition.key, node);
    const [x, y] = positions[index]; const link = createLink(svg, centerX + (x < centerX ? -82 : x > centerX ? 82 : 0), centerY + (y < centerY ? -82 : 82), x, y); link.dataset.dimension = definition.key; dimensionLinks.set(definition.key, link);
  });
  viewport.appendChild(scene); root.appendChild(viewport);
  const controls = el("div", "sb-memory-map-controls"); const zoomIn = el("button", "sb-memory-map-control", "+"); const zoomOut = el("button", "sb-memory-map-control", "−"); const fit = el("button", "sb-memory-map-control", "⌗");
  [zoomIn, zoomOut, fit].forEach((button) => { button.type = "button"; }); controls.append(zoomIn, zoomOut, fit); root.append(controls, el("div", "sb-memory-map-hint", "拖动画布 · 滚轮缩放 · 点击记忆节点查看详情，点击外层维度查看 Agent 配置"));
  const inspector = el("aside", "sb-memory-inspector"); inspector.dataset.open = "false"; root.appendChild(inspector);

  const fitScale = Math.min(1, Math.max(.64, (window.innerHeight - 116) / 860));
  let scale = window.matchMedia?.("(max-width:760px)").matches ? .62 : fitScale; let offsetX = 0; let offsetY = 0; let dragging = false; let dragStart = null;
  const entryNodeById = new Map(); const detailNodeById = new Map();
  const applyTransform = () => { scene.style.transform = `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px)) scale(${scale})`; scene.dataset.panning = String(dragging); };
  const activeEntries = () => entries.filter((entry) => entry.status !== "rolled-back");
  const profileName = () => cleanAgentName(displayAgentName({ agentType: selectedAgentId, name: profile?.identity?.name || selectedCatalogAgent().name }), selectedCatalogAgent().name);
  const profileTitle = () => profile?.identity?.title || selectedCatalogAgent().title || "";
  const soulPrinciples = () => listValues(profile?.soul?.principles);
  const normalizeAccount = (account) => {
    const id = String(account?.id || account?.accountId || account?.identity?.uid || account?.identity?.secUid || "").trim();
    if (!id) return null;
    const identity = account?.identity || {};
    const name = String(account?.name || identity.accountName || identity.nickname || account?.handle || id).trim();
    const handle = String(account?.handle || identity.uniqueId || identity.unique_id || "").trim();
    return { ...account, id, name, handle };
  };
  const accountLabel = (account) => account ? (account.handle ? `${account.name} ${account.handle}` : account.name) : "未选择账号";
  const accountErrorMessage = (error, fallback) => {
    const message = String(error?.message || "").trim();
    return !message || /failed to fetch|networkerror|load failed/i.test(message) ? fallback : message;
  };
  const accountMatchesRequested = (account, requestedId) => {
    const value = String(requestedId || "").trim(); const identity = account?.identity || {};
    return [account?.id, account?.accountId, identity.uid, identity.user_id, identity.userId, identity.secUid, identity.sec_uid, identity.secId, identity.sec_id].some((candidate) => String(candidate || "").trim() === value);
  };
  const resetAccountMemory = () => { accountMemory = { agentType: selectedAgentId, accounts: [], selectedId: "", record: null, messages: [], loading: false, error: "", accountsLoaded: false, loadVersion: 0 }; };
  async function loadAccountMemory() {
    const agentType = selectedAgentId; const version = ++accountMemory.loadVersion;
    const requestedId = accountMemory.selectedId;
    const accountMemoryEnabled = supportsAccountStrategyMemory(agentType);
    accountMemory = { ...accountMemory, agentType, accounts: [], selectedId: requestedId, record: null, messages: [], loading: accountMemoryEnabled, error: "", accountsLoaded: false, loadVersion: version };
    if (!accountMemoryEnabled) { accountMemory.accountsLoaded = true; return; }
    if (realtimeWorkPreviewMode() === "style") {
      const accounts = createRealtimeMockPreviewAccounts().map(normalizeAccount).filter(Boolean);
      const selected = accounts.find((account) => accountMatchesRequested(account, requestedId)) || accounts[0] || null;
      accountMemory = {
        ...accountMemory,
        accounts,
        selectedId: selected?.id || "",
        record: selected ? createMockAccountMemoryRecord(agentType, selected) : null,
        messages: selected ? createMockAccountMemoryMessages(agentType, selected) : [],
        loading: false,
        accountsLoaded: true
      };
      return;
    }
    try {
      const response = await fetch(`${receptionBaseUrl()}/v1/connectors/douyin/accounts`, { headers: { accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(8000) });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error?.message || "暂时无法读取已授权账号");
      const accounts = (Array.isArray(result?.accounts) ? result.accounts : []).map(normalizeAccount).filter(Boolean);
      const selected = accounts.find((account) => accountMatchesRequested(account, accountMemory.selectedId)) || accounts[0] || null;
      accountMemory = { ...accountMemory, accounts, selectedId: selected?.id || "", loading: Boolean(selected), accountsLoaded: true };
      if (!selected) return;
      const [recordResult, messagesResult] = await Promise.allSettled([
        receptionRequest(selected.id),
        companionRequest("GET", "/v1/direct-messages", { agentType, accountId: selected.id, conversationId: accountMemoryConversationId(agentType, selected.id) })
      ]);
      if (disposed || version !== accountMemory.loadVersion || agentType !== selectedAgentId) return;
      accountMemory = { ...accountMemory, record: recordResult.status === "fulfilled" ? recordResult.value : null, messages: messagesResult.status === "fulfilled" ? messagesResult.value?.data?.messages || [] : [], error: recordResult.status === "rejected" ? accountErrorMessage(recordResult.reason, "暂时无法读取账号记忆") : "", loading: false };
    } catch (error) {
      if (disposed || version !== accountMemory.loadVersion || agentType !== selectedAgentId) return;
      accountMemory = { ...accountMemory, loading: false, accountsLoaded: true, error: accountErrorMessage(error, "暂时无法读取已授权账号") };
    }
  }
  async function loadAccountRecord(nextAccountId) {
    const agentType = selectedAgentId; const selectedId = String(nextAccountId || "").trim(); const version = ++accountMemory.loadVersion;
    accountMemory = { ...accountMemory, selectedId, record: null, messages: [], loading: Boolean(selectedId), error: "" };
    updateCounts();
    if (selectedDimension) renderInspector();
    if (!selectedId) { accountMemory.loading = false; updateCounts(); if (selectedDimension) renderInspector(); return; }
    if (realtimeWorkPreviewMode() === "style") {
      const account = accountMemory.accounts.find((item) => item.id === selectedId) || null;
      if (disposed || version !== accountMemory.loadVersion || agentType !== selectedAgentId) return;
      accountMemory = {
        ...accountMemory,
        record: account ? createMockAccountMemoryRecord(agentType, account) : null,
        messages: account ? createMockAccountMemoryMessages(agentType, account) : [],
        loading: false,
        error: ""
      };
      updateCounts();
      if (selectedDimension) renderInspector();
      return;
    }
    const [recordResult, messagesResult] = await Promise.allSettled([
      receptionRequest(selectedId),
      companionRequest("GET", "/v1/direct-messages", { agentType, accountId: selectedId, conversationId: accountMemoryConversationId(agentType, selectedId) })
    ]);
    if (disposed || version !== accountMemory.loadVersion || agentType !== selectedAgentId) return;
    accountMemory = { ...accountMemory, record: recordResult.status === "fulfilled" ? recordResult.value : null, messages: messagesResult.status === "fulfilled" ? messagesResult.value?.data?.messages || [] : [], error: recordResult.status === "rejected" ? accountErrorMessage(recordResult.reason, "暂时无法读取账号记忆") : "", loading: false };
    updateCounts();
    if (selectedDimension) renderInspector();
  }
  const updateCenter = () => { centerName.textContent = profileName(); centerMeta.textContent = profileTitle() ? `${profileTitle()} · 记忆中枢` : "记忆中枢"; center.setAttribute("aria-label", `查看${profileName()}的记忆概览`); mountAgentAvatar(centerAvatar, selectedAgentId, { alt: `${profileName()}头像` }); };
  const accountSummary = () => accountMemory.record ? accountMemorySummary(accountMemory.record) : null;
  const accountStrategy = () => accountMemory.record?.mockStrategy || null;
  const dimensionCounts = () => ({
    capabilities: [
      profile?.mission || selectedCatalogAgent().description,
      ...(profile?.role?.responsibilities || []), ...(profile?.skills || []), ...(profile?.tools || []),
      ...(profile?.deliverables || selectedCatalogAgent().deliverables || []), ...(profile?.inputs || []), ...(profile?.outputs || []),
      ...(profile?.completionCriteria || [])
    ].filter(Boolean).length,
    soul: soulPrinciples().length + valuesFrom(profile?.soul?.safetyRules).length + valuesFrom(profile?.soul?.honestyRules).length,
    memory: activeEntries().length,
    accountPolicy: [...valuesFrom(profile?.scope?.dataAccess), ...valuesFrom(profile?.permission?.approvalRequired), ...valuesFrom(profile?.permission?.forbidden), ...valuesFrom(profile?.scope?.forbiddenZones), ...valuesFrom(profile?.accountPolicy), ...valuesFrom(profile?.accountMemory), ...(accountSummary() ? [accountSummary().goal, accountSummary().responseStyle, accountSummary().length, ...accountSummary().handoffRules] : []), ...(accountStrategy() ? [accountStrategy().accountContext, accountStrategy().boundary, ...accountStrategy().signals, ...accountStrategy().steps, ...accountStrategy().touch, ...accountStrategy().conversation] : [])].filter(Boolean).length
  });
  const updateCounts = () => { const counts = dimensionCounts(); for (const definition of DIMENSION_DEFINITIONS) nodeByDimension.get(definition.key).querySelector(".sb-memory-dimension-count").textContent = `${counts[definition.key] || 0} 项`; };
  const updateGraphState = () => { for (const [key, node] of nodeByDimension) node.dataset.active = String(key === selectedDimension); for (const [key, link] of dimensionLinks) link.dataset.active = String(key === selectedDimension); for (const [id, node] of entryNodeById) node.dataset.active = String(id === selectedEntryId); for (const [id, node] of detailNodeById) node.dataset.active = String(id === selectedEntryId); scene.querySelectorAll(".sb-memory-entry-link").forEach((link) => { link.dataset.active = String(link.dataset.kind === selectedKind && (!selectedEntryId || link.dataset.entryId === selectedEntryId)); }); };
  const closeInspector = () => { selectedDimension = null; selectedKind = null; selectedEntryId = null; inspector.dataset.open = "false"; updateGraphState(); };

  function appendDetailGroup(parent, label, value, { list = false, tone = "" } = {}) {
    const group = el("section", "sb-memory-detail-group"); group.appendChild(el("div", "sb-memory-detail-label", label));
    if (list) { const values = listValues(value); if (!values.length) group.appendChild(el("div", "sb-memory-detail-value", "未设置")); else { const ul = el("ul", "sb-memory-detail-list"); for (const item of values) { const li = el("li", "", item); if (tone) li.dataset.tone = tone; ul.appendChild(li); } group.appendChild(ul); } }
    else group.appendChild(el("div", `sb-memory-detail-value${value ? "" : " is-empty"}`, value || "未设置"));
    parent.appendChild(group);
  }
  function renderCapabilities(body) {
    const catalogAgent = selectedCatalogAgent();
    appendDetailGroup(body, "使命", profile?.mission || catalogAgent.description);
    appendDetailGroup(body, "岗位", profile?.role?.position || catalogAgent.title);
    appendDetailGroup(body, "岗位职责", profile?.role?.responsibilities?.length ? profile.role.responsibilities : [], { list: true });
    appendDetailGroup(body, "技能", profile?.skills, { list: true }); appendDetailGroup(body, "工具与连接器", profile?.tools, { list: true });
    appendDetailGroup(body, "交付物", profile?.deliverables || catalogAgent.deliverables, { list: true }); appendDetailGroup(body, "输入", profile?.inputs, { list: true }); appendDetailGroup(body, "输出", profile?.outputs, { list: true }); appendDetailGroup(body, "完成标准", profile?.completionCriteria, { list: true });
    appendDetailGroup(body, "汇报对象", cleanAgentName(displayAgentName({ agentType: profile?.role?.reportsTo, name: profile?.role?.reportsTo }), profile?.role?.reportsTo || "未设置"));
    appendDetailGroup(body, "运行能力", objectValues(profile?.capabilities), { list: true });
  }
  function renderSoul(body) {
    const soul = profile?.soul || {};
    appendDetailGroup(body, "身份", firstNonEmpty(soul.identity)); appendDetailGroup(body, "气质 / 语气", firstNonEmpty(soul.tone, profile?.identity?.languageStyle));
    appendDetailGroup(body, "工作原则", soul.principles, { list: true }); appendDetailGroup(body, "交付标准", soul.deliveryStandard);
    appendDetailGroup(body, "安全规则", soul.safetyRules, { list: true, tone: "warn" }); appendDetailGroup(body, "诚实规则", soul.honestyRules, { list: true });
  }
  function renderAccountStrategyMemory(body) {
    const panel = el("section", "sb-memory-account-memory");
    const panelHead = el("div", "sb-memory-account-memory-head");
    panelHead.appendChild(el("span", "sb-memory-account-memory-title", accountStrategy() ? "当前账号执行策略" : "账号承接记忆"));
    if (accountMemory.accounts.length) {
      const selector = document.createElement("select"); selector.className = "sb-memory-account-memory-select"; selector.setAttribute("aria-label", "选择账号策略记忆");
      for (const account of accountMemory.accounts) { const option = document.createElement("option"); option.value = account.id; option.textContent = accountLabel(account); option.selected = account.id === accountMemory.selectedId; selector.appendChild(option); }
      selector.addEventListener("change", () => { void loadAccountRecord(selector.value); }); panelHead.appendChild(selector);
    }
    panel.appendChild(panelHead);
    if (accountMemory.loading) panel.appendChild(el("div", "sb-memory-account-memory-state", "正在读取该账号的承接策略…"));
    else if (!accountMemory.accountsLoaded) panel.appendChild(el("div", "sb-memory-account-memory-state", "正在读取已授权账号…"));
    else if (!accountMemory.accounts.length) panel.appendChild(el("div", "sb-memory-account-memory-state", accountMemory.error || "当前没有可读取的已授权账号。"));
    else if (!accountMemory.record) panel.appendChild(el("div", "sb-memory-account-memory-state", accountMemory.error || "该账号还没有形成承接策略记忆。"));
    else {
      const summary = accountSummary(); const strategy = accountStrategy();
      appendDetailGroup(panel, "当前账号", accountLabel(accountMemory.accounts.find((account) => account.id === accountMemory.selectedId)));
      if (strategy) {
        appendDetailGroup(panel, "账号定位", strategy.accountContext);
        appendDetailGroup(panel, "可读取的账号数据", strategy.dataScope, { list: true });
        appendDetailGroup(panel, "当前 Agent 执行", strategy.title);
        appendDetailGroup(panel, "执行步骤", strategy.steps, { list: true });
        appendDetailGroup(panel, "意向信号", strategy.signals, { list: true });
        if (strategy.touch.length) appendDetailGroup(panel, "触达策略", strategy.touch, { list: true });
        if (strategy.conversation.length) appendDetailGroup(panel, "对话策略", strategy.conversation, { list: true });
        appendDetailGroup(panel, "账号边界与人工交接", strategy.boundary, { tone: "warn" });
      } else {
        appendDetailGroup(panel, "承接目标", summary?.goal || "尚未设定"); appendDetailGroup(panel, "回复方式", summary?.responseStyle || "未设置"); appendDetailGroup(panel, "回复长度", summary?.length || "未设置"); appendDetailGroup(panel, "人工交接", summary?.handoffRules || [], { list: true, tone: "warn" });
        if (summary?.goalDetails) appendDetailGroup(panel, "目标补充", summary.goalDetails);
        if (summary?.knowledge) appendDetailGroup(panel, "业务知识", summary.knowledgePreview || summary.knowledge);
      }
      const recent = accountMemory.messages.slice(-3).map((message) => message?.text).filter(Boolean);
      if (recent.length) appendDetailGroup(panel, "最近策略调整", recent, { list: true });
    }
    body.appendChild(panel);
  }
  function renderAccountPolicy(body) {
    const permission = profile?.permission || {}; const scope = profile?.scope || {};
    if (supportsAccountStrategyMemory(selectedAgentId)) renderAccountStrategyMemory(body);
    appendDetailGroup(body, "可读取的账号 / 业务数据", scope.dataAccess, { list: true }); appendDetailGroup(body, "需要审批的动作", permission.approvalRequired, { list: true, tone: "warn" });
    appendDetailGroup(body, "频控与调用限制", objectValues(permission.limits || profile?.budget?.limits), { list: true }); appendDetailGroup(body, "预算与调用额度", objectValues(profile?.budget), { list: true }); appendDetailGroup(body, "禁止动作", permission.forbidden, { list: true, tone: "warn" }); appendDetailGroup(body, "数据禁区", scope.forbiddenZones, { list: true, tone: "warn" });
    const summary = accountSummary();
    const strategy = accountStrategy();
    const accountRules = [...valuesFrom(profile?.accountPolicy), ...valuesFrom(profile?.accountMemory), ...valuesFrom(profile?.privateReception), ...(summary ? [summary.goal, summary.goalDetails, summary.responseStyle, summary.length, ...summary.handoffRules, summary.knowledge] : []), ...(strategy ? [strategy.accountContext, strategy.boundary, ...strategy.signals, ...strategy.steps, ...strategy.touch, ...strategy.conversation] : []), ...activeEntries().filter((entry) => entry.scope === "lead" || entry.accountId || entry.metadata?.accountId).map((entry) => entry.text)];
    appendDetailGroup(body, "按账号沉淀的策略记忆", accountRules, { list: true });
    if (!accountRules.length) body.appendChild(el("div", "sb-memory-empty", "当前 Agent 还没有按账号保存的策略。\n账号范围、审批和禁区仍以当前档案配置为准。"));
  }
  function renderMemoryEntries(body, kind = null) {
    const selected = activeEntries().filter((entry) => !kind || entry.kind === kind);
    if (!selected.length) { body.appendChild(el("div", "sb-memory-empty", kind ? "这里还没有记忆。\n在下方添加一条，当前 Agent 会在后续任务中参考它。" : "当前 Agent 还没有长期记忆。\n可以点击一个记忆分类查看，或在分类详情中添加。")); return; }
    selected.slice().reverse().forEach((entry) => {
      const item = el("article", "sb-memory-entry"); item.dataset.selected = String(entry.id === selectedEntryId); item.appendChild(el("div", "sb-memory-entry-text", entry.text || ""));
      const meta = el("div", "sb-memory-entry-meta"); meta.append(el("span", "sb-memory-tag", KIND_LABELS[entry.kind] || entry.kind || "记忆"), el("span", "sb-memory-tag", SCOPE_LABELS[entry.scope] || entry.scope || "当前 Agent"), el("span", "", fmtTime(entry.updatedAt || entry.createdAt)));
      if (gateway && entry.history?.length) { const rollback = el("button", "sb-memory-entry-action", "回退"); rollback.type = "button"; rollback.addEventListener("click", async () => { rollback.disabled = true; try { await gateway.action("agent.memory.rollback", { agentType: selectedAgentId, entryId: entry.id }); await loadAgentData(); } catch { rollback.disabled = false; } }); meta.appendChild(rollback); }
      const remove = el("button", "sb-memory-entry-action", "删除"); remove.type = "button"; remove.addEventListener("click", async () => { remove.disabled = true; try { if (!gateway) return; await gateway.action("agent.memory.delete", { agentType: selectedAgentId, entryId: entry.id }); await loadAgentData(); } catch { remove.disabled = false; } }); meta.appendChild(remove); item.appendChild(meta); body.appendChild(item);
    });
  }
  const renderInspector = () => {
    if (!selectedDimension) { closeInspector(); return; }
    const definition = DIMENSION_DEFINITIONS.find((item) => item.key === selectedDimension); inspector.textContent = "";
    const head = el("div", "sb-memory-inspector-head");
    const avatar = el("div", "sb-memory-inspector-icon is-agent-avatar");
    mountAgentAvatar(avatar, selectedAgentId, { alt: `${profileName()}头像`, trackPointer: false, mode: "memory-map" });
    const copy = el("div", "sb-memory-inspector-copy");
    copy.append(el("div", "sb-memory-inspector-title", `${profileName()} · ${definition.label}`), el("div", "sb-memory-inspector-subtitle", definition.copy));
    const close = el("button", "sb-memory-inspector-close", "×"); close.type = "button"; close.setAttribute("aria-label", "关闭详情"); close.addEventListener("click", closeInspector);
    head.append(avatar, copy, close);
    const body = el("div", "sb-memory-inspector-body");
    if (loading) body.appendChild(el("div", "sb-memory-loading", "正在读取 Agent 配置…")); else if (selectedDimension === "capabilities") renderCapabilities(body); else if (selectedDimension === "soul") renderSoul(body); else if (selectedDimension === "accountPolicy") renderAccountPolicy(body); else renderMemoryEntries(body, selectedKind);
    inspector.append(head, body);
    if (selectedDimension === "memory" && selectedKind && gateway) {
      const definitionForKind = KIND_DEFINITIONS.find((item) => item.kind === selectedKind); const add = el("form", "sb-memory-add"); const input = document.createElement("input"); input.placeholder = `添加${definitionForKind?.label || "记忆"}…`; input.setAttribute("aria-label", `添加${definitionForKind?.label || "记忆"}`); const submit = el("button", "", "添加"); submit.type = "submit"; add.append(input, submit);
      add.addEventListener("submit", async (event) => { event.preventDefault(); const text = input.value.trim(); if (!text) return; submit.disabled = true; try { await gateway.action("agent.memory.append", { agentType: selectedAgentId, entry: { kind: selectedKind, text, scope: "agent", source: "user" } }); input.value = ""; await loadAgentData(); } finally { submit.disabled = false; } }); inspector.appendChild(add);
    }
    inspector.dataset.open = "true"; updateGraphState();
  };
  const selectDimension = (key) => { selectedDimension = key; selectedKind = null; selectedEntryId = null; renderInspector(); };
  const selectKind = (kind) => { selectedDimension = "memory"; selectedKind = kind; selectedEntryId = null; renderInspector(); };
  const selectEntry = (entry) => { selectedDimension = "memory"; selectedKind = entry.kind; selectedEntryId = entry.id; renderInspector(); };
  const renderEntryNodes = () => {
    scene.querySelectorAll(".sb-memory-entry-node,.sb-memory-entry-link").forEach((node) => node.remove()); entryNodeById.clear(); detailNodeById.clear();
    if (selectedDimension !== "memory") { updateGraphState(); return; }
    const memoryPosition = positions[2];
    KIND_DEFINITIONS.forEach((definition) => {
      const related = activeEntries().filter((entry) => entry.kind === definition.kind); const [x, y] = entryPositions[definition.kind]?.[0] || [memoryPosition[0], memoryPosition[1]];
      const node = el("button", "sb-memory-entry-node"); node.type = "button"; node.dataset.kind = definition.kind; node.style.left = `${x}px`; node.style.top = `${y}px`; node.append(el("span", "sb-memory-entry-node-text", definition.label), el("span", "sb-memory-entry-node-meta", `${related.length} 条 · 点击查看`)); node.addEventListener("click", () => selectKind(definition.kind)); scene.appendChild(node); detailNodeById.set(`kind-${definition.kind}`, node);
      const link = createLink(svg, memoryPosition[0] + (x < memoryPosition[0] ? -70 : x > memoryPosition[0] ? 70 : 0), memoryPosition[1] + (y < memoryPosition[1] ? -52 : 52), x, y, selectedKind === definition.kind, "sb-memory-map-link sb-memory-entry-link"); link.dataset.kind = definition.kind;
      related.slice(0, 2).forEach((entry, entryIndex) => { const [ex, ey] = entryPositions[definition.kind]?.[entryIndex + 1] || [x, y + 106 + entryIndex * 94]; const node = el("button", "sb-memory-entry-node"); node.type = "button"; node.dataset.entryId = entry.id; node.dataset.kind = definition.kind; node.style.left = `${ex}px`; node.style.top = `${ey}px`; node.title = entry.text || definition.label; node.append(el("span", "sb-memory-entry-node-text", entry.text || "未命名记忆"), el("span", "sb-memory-entry-node-meta", `${SCOPE_LABELS[entry.scope] || entry.scope || "当前 Agent"} · ${fmtTime(entry.updatedAt || entry.createdAt)}`)); node.addEventListener("click", () => selectEntry(entry)); scene.appendChild(node); entryNodeById.set(entry.id, node); const entryLink = createLink(svg, x, y + 42, ex, ey - 35, selectedEntryId === entry.id, "sb-memory-map-link sb-memory-entry-link"); entryLink.dataset.kind = definition.kind; entryLink.dataset.entryId = entry.id; });
      if (related.length > 2) { const [ox, oy] = entryPositions[definition.kind]?.[2] || [x, y + 206]; const overflow = el("button", "sb-memory-entry-node sb-memory-entry-overflow"); overflow.type = "button"; overflow.style.left = `${ox}px`; overflow.style.top = `${oy}px`; overflow.append(el("span", "sb-memory-entry-node-text", `还有 ${related.length - 2} 条记忆`), el("span", "sb-memory-entry-node-meta", "点击查看全部")); overflow.addEventListener("click", () => selectKind(definition.kind)); scene.appendChild(overflow); const overflowLink = createLink(svg, x, y + 42, ox, oy - 35, selectedKind === definition.kind, "sb-memory-map-link sb-memory-entry-link"); overflowLink.dataset.kind = definition.kind; }
    });
    updateGraphState();
  };
  async function loadAgentData() {
    const version = ++loadVersion; loading = true; updateCenter(); updateCounts(); renderEntryNodes(); if (selectedDimension) renderInspector();
    const accountLoad = loadAccountMemory();
    if (gateway) { const [profileResult, memoryResult] = await Promise.allSettled([gateway.action("agent.profile.get", { agentType: selectedAgentId }), gateway.action("agent.memory.list", { agentType: selectedAgentId })]); if (disposed || version !== loadVersion) return; if (profileResult.status === "fulfilled" && profileResult.value?.data?.profile) profile = profileResult.value.data.profile; entries = memoryResult.status === "fulfilled" ? memoryResult.value?.data?.entries || [] : []; } else { profile = getAgentProfileSync(selectedAgentId); entries = []; }
    if (disposed || version !== loadVersion) return;
    loading = false; updateCenter(); updateCounts(); renderEntryNodes(); if (selectedDimension) renderInspector();
    void accountLoad.then(() => {
      if (disposed || version !== loadVersion) return;
      updateCounts();
      if (selectedDimension === "accountPolicy") renderInspector();
    });
  }
  let activePickerIndex = Math.max(0, catalog.findIndex((agent) => agent.id === selectedAgentId));
  const syncPickerOptions = () => {
    agentPickerOptions.forEach(({ agent, option, avatar }, index) => {
      const active = agent.id === selectedAgentId;
      option.setAttribute("aria-selected", String(active));
      option.tabIndex = active ? 0 : -1;
      if (active) activePickerIndex = index;
      if (!avatar.childNodes.length) mountPickerAvatar(avatar, agent);
    });
  };
  const syncAgentPicker = () => {
    const agent = selectedCatalogAgent();
    agentPickerName.textContent = profileName();
    agentPickerTitle.textContent = profileTitle() || agent.title || "Agent 中心";
    mountPickerAvatar(agentPickerAvatar, agent);
    syncPickerOptions();
  };
  const closeAgentPicker = ({ focusTrigger = false } = {}) => {
    agentPicker.dataset.open = "false";
    agentPickerMenu.hidden = true;
    agentPickerTrigger.setAttribute("aria-expanded", "false");
    if (focusTrigger) agentPickerTrigger.focus();
  };
  const focusAgentPickerOption = (index) => {
    if (!agentPickerOptions.length) return;
    activePickerIndex = (index + agentPickerOptions.length) % agentPickerOptions.length;
    syncPickerOptions();
    agentPickerOptions[activePickerIndex].option.focus();
  };
  const openAgentPicker = ({ focusIndex = null } = {}) => {
    agentPicker.dataset.open = "true";
    agentPickerMenu.hidden = false;
    agentPickerTrigger.setAttribute("aria-expanded", "true");
    if (focusIndex != null) focusAgentPickerOption(focusIndex);
  };
  const chooseAgent = (nextAgentId) => {
    if (!catalog.some((agent) => agent.id === nextAgentId)) return;
    selectedAgentId = nextAgentId;
    profile = getAgentProfileSync(selectedAgentId);
    entries = [];
    resetAccountMemory();
    selectedDimension = null;
    selectedKind = null;
    selectedEntryId = null;
    loading = true;
    syncAgentPicker();
    closeAgentPicker({ focusTrigger: true });
    renderEntryNodes();
    closeInspector();
    void loadAgentData();
  };
  agentPickerTrigger.addEventListener("click", () => {
    if (agentPicker.dataset.open === "true") closeAgentPicker();
    else openAgentPicker();
  });
  agentPickerTrigger.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      openAgentPicker({ focusIndex: activePickerIndex + (event.key === "ArrowDown" ? 1 : -1) });
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openAgentPicker({ focusIndex: activePickerIndex });
    } else if (event.key === "Escape") closeAgentPicker();
  });
  agentPickerOptions.forEach(({ agent, option }, index) => {
    option.addEventListener("click", () => chooseAgent(agent.id));
    option.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        focusAgentPickerOption(index + (event.key === "ArrowDown" ? 1 : -1));
      } else if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        focusAgentPickerOption(event.key === "Home" ? 0 : agentPickerOptions.length - 1);
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        chooseAgent(agent.id);
      } else if (event.key === "Escape") {
        event.preventDefault();
        closeAgentPicker({ focusTrigger: true });
      }
    });
  });
  const closePickerOnOutsidePointer = (event) => { if (!agentPicker.contains(event.target)) closeAgentPicker(); };
  document.addEventListener("pointerdown", closePickerOnOutsidePointer);
  for (const [key, node] of nodeByDimension) node.addEventListener("click", () => { if (key === "memory") { selectedDimension = "memory"; selectedKind = null; selectedEntryId = null; renderEntryNodes(); renderInspector(); } else selectDimension(key); });
  center.addEventListener("click", () => { selectedDimension = null; selectedKind = null; selectedEntryId = null; renderEntryNodes(); closeInspector(); });
  zoomIn.addEventListener("click", () => { scale = Math.min(1.45, scale + .1); applyTransform(); }); zoomOut.addEventListener("click", () => { scale = Math.max(.58, scale - .1); applyTransform(); }); fit.addEventListener("click", () => { scale = fitScale; offsetX = 0; offsetY = 0; applyTransform(); });
  viewport.addEventListener("pointerdown", (event) => { if (event.target.closest?.("button,select")) return; dragging = true; dragStart = { x: event.clientX, y: event.clientY, ox: offsetX, oy: offsetY }; viewport.dataset.dragging = "true"; viewport.setPointerCapture?.(event.pointerId); applyTransform(); }); viewport.addEventListener("pointermove", (event) => { if (!dragging || !dragStart) return; offsetX = dragStart.ox + event.clientX - dragStart.x; offsetY = dragStart.oy + event.clientY - dragStart.y; applyTransform(); });
  const endDrag = (event) => { if (!dragging) return; dragging = false; dragStart = null; viewport.dataset.dragging = "false"; viewport.releasePointerCapture?.(event.pointerId); applyTransform(); }; viewport.addEventListener("pointerup", endDrag); viewport.addEventListener("pointercancel", endDrag); viewport.addEventListener("wheel", (event) => { event.preventDefault(); scale = Math.max(.58, Math.min(1.45, scale + (event.deltaY < 0 ? .06 : -.06))); applyTransform(); }, { passive: false });
  syncAgentPicker(); applyTransform(); updateCenter(); updateCounts(); renderEntryNodes(); void loadAgentData();
  const originalClose = page.close; page.close = () => { disposed = true; loadVersion += 1; accountMemory.loadVersion += 1; document.removeEventListener("pointerdown", closePickerOnOutsidePointer); originalClose(); };
  page.setGateway = (nextGateway) => { if (gateway === nextGateway) return page; gateway = nextGateway; void loadAgentData(); return page; };
  return page;
}
