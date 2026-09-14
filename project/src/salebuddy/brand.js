/**
 * Customer-facing brand projection. Technical salebuddy/marvis identifiers stay unchanged.
 */
import { MARKETPLACE_AGENTS, MARKETPLACE_DISPLAY_NAME_MIGRATIONS } from "./agents/marketplace.js";

export const BRAND = Object.freeze({
  name: "Byering",
  mainAgent: "Byering · 幕僚长",
  slogan: "为线索而生，为转化而造。你的增长伙伴，越用越懂业务。",
  office: "Byering办公室",
  official: "Byering 官方",
  migration: "byering-v1"
});

export const LEGACY_BRAND_ALIASES = Object.freeze({
  SaleBuddy: BRAND.name,
  Marvis: BRAND.name,
  "SaleBuddy · 幕僚长": BRAND.mainAgent,
  "Marvis · 幕僚长": BRAND.mainAgent,
  "Marvis(马维斯)": "Byering(幕僚长)"
});

/** Customer-facing labels for technical Agent IDs. IDs stay stable for runtime dispatch. */
export const AGENT_DISPLAY_LABELS = Object.freeze({
  main: { name: BRAND.mainAgent, title: "智能组织负责人" },
  "Strategy Agent": { name: "获客策略师", title: "获客策略师" },
  "Browser Agent": { name: "潜客挖掘员", title: "抖音潜客挖掘" },
  "Search Agent": { name: "线索分析师", title: "线索分析师" },
  "Research Agent": { name: "客户画像研究员", title: "客户画像研究与客户简报" },
  "App Agent": { name: "触达策略师", title: "触达策略师" },
  "Risk Agent": { name: "风控专员", title: "触达风险控制" },
  "Outreach Agent": { name: "外联专员", title: "外联专员" },
  "Outreach Ops Agent": { name: "触达运营专员", title: "触达运营专员" },
  "File Agent": { name: "内容策划", title: "内容与文档产出" },
  "mkt-market-scout": { name: "行业竞品情报研究员", title: "行业竞品情报研究员" },
  "mkt-designer": { name: "商品视觉设计师", title: "商品视觉设计师" },
  "mkt-private-op": { name: "社群运营专员", title: "社群运营专员" },
  "mkt-cs-manager": { name: "客户成功跟进专员", title: "客户成功跟进专员" },
  "mkt-quote": { name: "商品报价方案专员", title: "商品报价方案专员" },
  "mkt-data-analyst": { name: "销售数据分析师", title: "销售数据分析师" },
  "mkt-bid": { name: "招投标机会研究员", title: "招投标机会研究员" },
  ...Object.fromEntries(MARKETPLACE_AGENTS.map(agent => [agent.id, { name: agent.displayName, title: agent.displayTitle }]))
});

const LEGACY_AGENT_NAMES = Object.freeze({
  "线索猎人": "潜客挖掘员",
  "小探": "获客策略师",
  "数据分析师": "线索分析师",
  "销售顾问": "触达策略师",
  "阿触": "私信触达专员",
  "跟跟": "触达运营专员",
  "周砚": "评论区潜客挖掘",
  "找客户": "评论区潜客挖掘",
  "作品评论潜客筛选专员": "评论区潜客挖掘",
  Carter: "评论区潜客挖掘",
  Morgan: "评论区获客运营",
  Claire: "作品评论筛选",
  Atlas: "抖音全域找人",
  Iris: "用户调研与问卷投放",
  Luca: "直播间潜客挖掘",
  Owen: "抖音私信触达",
  Sophia: "私信自动承接",
  Felix: "抖音账号研究",
  Nora: "目标人群搜索",
  Miles: "受众关系分析",
  Victor: "账号增长分析",
  Celeste: "潜客意向分析",
  Amelia: "潜客持续跟进",
  Ethan: "高意向电话邀约",
  Maya: "营销内容生成",
  "声声": "电销专员",
  "笔笔": "内容写手",
  "图图": "视觉设计",
  "营营": "私域运营",
  "安安": "客户成功",
  "价价": "报价合同",
  "数数": "销售数据分析",
  "标标": "投标专员",
  ...Object.fromEntries(Object.values(MARKETPLACE_DISPLAY_NAME_MIGRATIONS).flatMap(({ from, to }) => from.map(name => [name, to])))
});

const MAIN_ALIASES = new Set([
  "SaleBuddy",
  "Marvis",
  "SaleBuddy · 幕僚长",
  "Marvis · 幕僚长",
  "Marvis(马维斯)"
]);

function clone(value) {
  return value == null ? value : structuredClone(value);
}

export function projectBrandName(value) {
  if (typeof value !== "string") return value;
  return Object.prototype.hasOwnProperty.call(LEGACY_BRAND_ALIASES, value)
    ? LEGACY_BRAND_ALIASES[value]
    : value;
}

function agentTypeOf(agent) {
  if (typeof agent === "string") return agent;
  return agent?.agentType || agent?.id || null;
}

export function displayAgentName(agent = {}) {
  const agentType = agentTypeOf(agent);
  const labels = AGENT_DISPLAY_LABELS[agentType];
  const value = typeof agent === "string" ? agent : agent?.name || agent?.identity?.name;
  if (labels) return labels.name;
  if (value && LEGACY_AGENT_NAMES[value]) return LEGACY_AGENT_NAMES[value];
  if (value) return projectBrandName(value);
  return labels?.name || agentType || "";
}

export function displayAgentTitle(agent = {}) {
  const agentType = agentTypeOf(agent);
  const labels = AGENT_DISPLAY_LABELS[agentType];
  const value = typeof agent === "object" ? agent?.title || agent?.identity?.title || agent?.role?.position : null;
  if (labels) return labels.title;
  return value || labels?.title || "";
}

export function localizeAgentText(value) {
  let text = String(value || "");
  for (const [agentType, labels] of Object.entries(AGENT_DISPLAY_LABELS)) {
    text = text.split(agentType).join(labels.name);
  }
  for (const [legacyName, displayName] of Object.entries(LEGACY_AGENT_NAMES)) {
    // A short historical alias such as "find customers" is also ordinary
    // copy and part of current names; only migrate it in identity fields.
    if (Object.values(AGENT_DISPLAY_LABELS).some(label => label.name.includes(legacyName))) continue;
    text = text.split(legacyName).join(displayName);
  }
  return text.replace(/\bsubagent\b/gi, "子员工");
}

export function displayCreatedBy(value, context = {}) {
  if (context?.agentType === "main") return BRAND.mainAgent;
  const projected = projectBrandName(value);
  if (projected !== value) return projected;
  return displayAgentName({ agentType: context?.agentType, name: value });
}

export function projectMessage(message) {
  const next = clone(message);
  if (!next || typeof next !== "object") return next;
  if (next.from === "main") next.fromName = BRAND.mainAgent;
  else if (typeof next.fromName === "string") {
    const projected = projectBrandName(next.fromName);
    next.fromName = projected !== next.fromName
      ? projected
      : displayAgentName({ agentType: next.from, name: next.fromName });
  }
  return next;
}

export function migrateMainProfile(profile) {
  const next = clone(profile);
  if (!next || next.agentType !== "main") return next;
  if (next.meta?.brandMigration === BRAND.migration) return next;

  const identityName = next.identity?.name;
  const rolePosition = next.role?.position;
  const shouldMigrate = MAIN_ALIASES.has(identityName) || MAIN_ALIASES.has(rolePosition);
  if (!shouldMigrate) return next;

  next.identity = { ...(next.identity || {}) };
  next.role = { ...(next.role || {}) };
  next.meta = { ...(next.meta || {}) };
  if (MAIN_ALIASES.has(identityName)) next.identity.name = BRAND.mainAgent;
  if (MAIN_ALIASES.has(rolePosition)) next.role.position = BRAND.mainAgent;
  next.meta.brandMigration = BRAND.migration;
  return next;
}
