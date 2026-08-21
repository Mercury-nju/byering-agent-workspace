/**
 * Customer-facing brand projection. Technical salebuddy/marvis identifiers stay unchanged.
 */

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
  "Browser Agent": { name: "线索猎人", title: "抖音线索发现" },
  "Search Agent": { name: "线索分析师", title: "线索分析师" },
  "Research Agent": { name: "客户研究员", title: "客户研究与客户简报" },
  "App Agent": { name: "触达策略师", title: "触达策略师" },
  "Risk Agent": { name: "风控专员", title: "触达风险控制" },
  "Outreach Agent": { name: "外联专员", title: "外联专员" },
  "Outreach Ops Agent": { name: "触达运营专员", title: "触达运营专员" },
  "File Agent": { name: "内容策划", title: "内容与文档产出" },
  "mkt-lead-miner": { name: "线索挖掘机", title: "线索挖掘机" },
  "mkt-market-scout": { name: "市场情报员", title: "市场情报员" },
  "mkt-cold-writer": { name: "冷启动外联", title: "冷启动外联" },
  "mkt-follow-up": { name: "跟进管家", title: "跟进管家" },
  "mkt-phone-sdr": { name: "电销专员", title: "电销专员" },
  "mkt-copywriter": { name: "内容写手", title: "内容写手" },
  "mkt-designer": { name: "视觉设计", title: "视觉设计" },
  "mkt-private-op": { name: "私域运营", title: "私域运营" },
  "mkt-cs-manager": { name: "客户成功", title: "客户成功" },
  "mkt-quote": { name: "报价合同", title: "报价合同" },
  "mkt-data-analyst": { name: "销售数据分析", title: "销售数据分析" },
  "mkt-bid": { name: "投标专员", title: "投标专员" }
});

const LEGACY_AGENT_NAMES = Object.freeze({
  "小探": "获客策略师",
  "数据分析师": "线索分析师",
  "销售顾问": "触达策略师",
  "阿触": "外联专员",
  "跟跟": "触达运营专员",
  "周砚": "线索挖掘机",
  "声声": "电销专员",
  "笔笔": "内容写手",
  "图图": "视觉设计",
  "营营": "私域运营",
  "安安": "客户成功",
  "价价": "报价合同",
  "数数": "销售数据分析",
  "标标": "投标专员"
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
