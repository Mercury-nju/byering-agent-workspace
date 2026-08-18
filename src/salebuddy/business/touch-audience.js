/**
 * Frontend-only audience planner.
 * It turns a natural-language outreach goal into a reviewable local plan.
 * No account, network, CRM, or messaging operation is performed here.
 */

export const TOUCH_SOURCE_IDS = Object.freeze({
  SPECIFIC_ACCOUNT: "specific-account",
  IMPORTED_LIST: "imported-list",
  ACCOUNT_RELATION: "account-relation",
  WORK_INTERACTIONS: "work-interactions",
  LIVE_INTERACTIONS: "live-interactions",
  PROFILE_SEARCH: "profile-search",
  CONTENT_SIGNAL: "content-signal",
  INTENT_SEARCH: "intent-search",
  LOOKALIKE: "lookalike",
  HISTORICAL_LEAD: "historical-lead",
  EXISTING_CUSTOMER: "existing-customer",
  OPEN_SEARCH: "open-search"
});

const SOURCE_LABELS = Object.freeze({
  [TOUCH_SOURCE_IDS.SPECIFIC_ACCOUNT]: "指定账号",
  [TOUCH_SOURCE_IDS.IMPORTED_LIST]: "导入名单",
  [TOUCH_SOURCE_IDS.ACCOUNT_RELATION]: "账号关系",
  [TOUCH_SOURCE_IDS.WORK_INTERACTIONS]: "作品互动",
  [TOUCH_SOURCE_IDS.LIVE_INTERACTIONS]: "直播互动",
  [TOUCH_SOURCE_IDS.PROFILE_SEARCH]: "账号画像",
  [TOUCH_SOURCE_IDS.CONTENT_SIGNAL]: "内容信号",
  [TOUCH_SOURCE_IDS.INTENT_SEARCH]: "需求意图",
  [TOUCH_SOURCE_IDS.LOOKALIKE]: "相似客户",
  [TOUCH_SOURCE_IDS.HISTORICAL_LEAD]: "历史 Lead",
  [TOUCH_SOURCE_IDS.EXISTING_CUSTOMER]: "已有客户",
  [TOUCH_SOURCE_IDS.OPEN_SEARCH]: "开放式找人"
});

const HAN_TIME_UNITS = Object.freeze({
  分钟: "分钟",
  小时: "小时",
  天: "天",
  周: "周",
  月: "个月",
  个月: "个月"
});

function normalize(value) {
  return String(value || "").replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim();
}

function containsAny(value, patterns) {
  return patterns.some((pattern) => pattern.test(value));
}

function extractTimeWindow(value) {
  const match = value.match(/(?:过去|最近|近|前)\s*(\d+)\s*(分钟|小时|天|周|个月|月)/);
  if (match) return `最近 ${match[1]} ${HAN_TIME_UNITS[match[2]] || match[2]}`;
  const singleUnit = value.match(/(?:过去|最近|近|前)(一|一个|本)\s*(周|月|天)/);
  if (singleUnit) return `最近 1 ${singleUnit[2] === "月" ? "个月" : singleUnit[2]}`;
  if (/今天|本次直播|本场直播/.test(value)) return "今天";
  if (/最近新增|新关注|刚关注/.test(value)) return "最近 24 小时";
  return "未指定";
}

function extractAccount(value) {
  return value.match(/@[a-zA-Z0-9_.-]+/)?.[0] || null;
}

function extractIndustry(value) {
  const known = value.match(/(医美|房地产|房产|美妆|健身|SaaS|教育|汽车|婚庆|零食)(?:行业|机构|账号)?/i)?.[0];
  return known || null;
}

function extractFilters(value, sourceId) {
  const filters = [];
  for (const match of value.matchAll(/(杭州|上海|北京|纽约|Miami|东京)/gi)) filters.push(match[1]);
  const industry = extractIndustry(value);
  if (industry && !filters.includes(industry)) filters.push(industry);
  const metric = value.match(/粉丝(?:超过|大于|不少于|在)[^，。；,;]*/)?.[0]
    || value.match(/(?:总)?播放量(?:超过|大于|达到)[^，。；,;]*/)?.[0]
    || value.match(/互动率(?:超过|大于)[^，。；,;]*/)?.[0];
  if (metric) filters.push(metric);
  const bio = value.match(/(?:Bio|简介)(?:里|中)?[^，。；,;]*/i)?.[0];
  if (bio) filters.push(bio);
  const quoted = value.match(/[“"]([^”"]+)[”"]/);
  if (quoted) filters.push(`内容包含「${quoted[1]}」`);
  if (sourceId === TOUCH_SOURCE_IDS.WORK_INTERACTIONS && /价格|多少钱|报价|费用/.test(value)) filters.push("评论包含价格询问");
  return [...new Set(filters)].join("、") || (sourceId === TOUCH_SOURCE_IDS.IMPORTED_LIST ? "按名单字段筛选" : "按目标描述补齐筛选条件");
}

function sourceFor(value) {
  const account = extractAccount(value);
  if (account || /指定(?:一个|单个)?账号|给这个账号|这个人发消息/.test(value)) return TOUCH_SOURCE_IDS.SPECIFIC_ACCOUNT;
  if (/(这份|该|本次)?\s*(Excel|CSV|TXT|客户名单|名单|表格)|上传.*(?:名单|文件)/i.test(value)) return TOUCH_SOURCE_IDS.IMPORTED_LIST;
  if (/直播|停留超过|直播间|送礼|进入直播/.test(value)) return TOUCH_SOURCE_IDS.LIVE_INTERACTIONS;
  if (/相似|类似|典型客户|种子用户|高客单/.test(value)) return TOUCH_SOURCE_IDS.LOOKALIKE;
  if (/以前|曾经|失联|未成交|拿过报价|留过电话|历史 Lead|重新联系|过去.*客户/.test(value)) return TOUCH_SOURCE_IDS.HISTORICAL_LEAD;
  if (/老客户|复购|升级|交叉销售|买过.*推荐/.test(value)) return TOUCH_SOURCE_IDS.EXISTING_CUSTOMER;
  if (/评论|点赞|分享|收藏|视频|作品/.test(value)) return TOUCH_SOURCE_IDS.WORK_INTERACTIONS;
  if (/竞争对手|竞品|共同粉丝|粉丝|关注我的|新关注|最近关注/.test(value)) return TOUCH_SOURCE_IDS.ACCOUNT_RELATION;
  if (/想买|准备买|询价|多少钱|购买渠道|购买建议|找.*服务商|表达购买|痛点|投诉|不满|考虑买/.test(value)) return TOUCH_SOURCE_IDS.INTENT_SEARCH;
  if (/可能会买|可能想|开放式|自然语言/.test(value)) return TOUCH_SOURCE_IDS.OPEN_SEARCH;
  if (/地区|行业|Bio|简介|粉丝|播放量|互动率|活跃|账号/.test(value)) return TOUCH_SOURCE_IDS.PROFILE_SEARCH;
  if (/内容主题|发布内容|提到|提及|最近发过/.test(value)) return TOUCH_SOURCE_IDS.CONTENT_SIGNAL;
  return null;
}

function audienceFor(value, sourceId) {
  const account = extractAccount(value);
  if (sourceId === TOUCH_SOURCE_IDS.SPECIFIC_ACCOUNT) return account || "用户指定账号";
  if (sourceId === TOUCH_SOURCE_IDS.IMPORTED_LIST) {
    const file = value.match(/(Excel|CSV|TXT|客户名单|名单|表格)/i)?.[0] || "客户名单";
    return `${file}中的客户`;
  }
  if (sourceId === TOUCH_SOURCE_IDS.ACCOUNT_RELATION) {
    if (/竞争对手|竞品/.test(value)) return "竞争对手账号的粉丝";
    if (/关注我的|新关注/.test(value)) return "最近关注我的用户";
    return "目标账号关系中的用户";
  }
  if (sourceId === TOUCH_SOURCE_IDS.LIVE_INTERACTIONS) return "直播间互动用户";
  if (sourceId === TOUCH_SOURCE_IDS.WORK_INTERACTIONS) return "视频或作品互动用户";
  if (sourceId === TOUCH_SOURCE_IDS.PROFILE_SEARCH) return `${extractIndustry(value) || "符合画像条件的"}账号`;
  if (sourceId === TOUCH_SOURCE_IDS.LOOKALIKE) return "与种子客户相似的人群";
  if (sourceId === TOUCH_SOURCE_IDS.HISTORICAL_LEAD) return "历史 Lead 中值得重新联系的客户";
  if (sourceId === TOUCH_SOURCE_IDS.EXISTING_CUSTOMER) return "已有客户";
  if (sourceId === TOUCH_SOURCE_IDS.INTENT_SEARCH) return "正在表达相关需求的人";
  if (sourceId === TOUCH_SOURCE_IDS.CONTENT_SIGNAL) return "近期内容表现出目标需求的人";
  return "可能对当前业务有需求的人";
}

function signalFor(value, sourceId) {
  if (sourceId === TOUCH_SOURCE_IDS.SPECIFIC_ACCOUNT) return "用户指定账号";
  if (sourceId === TOUCH_SOURCE_IDS.IMPORTED_LIST) return "名单记录";
  if (sourceId === TOUCH_SOURCE_IDS.ACCOUNT_RELATION) {
    if (/新增|新关注|最近关注/.test(value)) return "最近新增关注";
    return "关注、粉丝或竞品关系";
  }
  if (sourceId === TOUCH_SOURCE_IDS.WORK_INTERACTIONS) {
    if (/评论|下面|问过/.test(value)) return /价格|多少钱|报价|费用/.test(value) ? "视频评论中的询价信号" : "视频评论互动";
    if (/点赞/.test(value)) return "视频点赞行为";
    if (/分享/.test(value)) return "视频分享行为";
    return "作品互动行为";
  }
  if (sourceId === TOUCH_SOURCE_IDS.LIVE_INTERACTIONS) return "直播进入、停留、评论或关注行为";
  if (sourceId === TOUCH_SOURCE_IDS.PROFILE_SEARCH) return "账号画像与公开内容";
  if (sourceId === TOUCH_SOURCE_IDS.LOOKALIKE) return "种子客户的共同特征";
  if (sourceId === TOUCH_SOURCE_IDS.HISTORICAL_LEAD) return "历史阶段与最近一次沟通";
  if (sourceId === TOUCH_SOURCE_IDS.EXISTING_CUSTOMER) return "购买、复购或产品使用阶段";
  if (sourceId === TOUCH_SOURCE_IDS.INTENT_SEARCH) return "公开内容中的明确需求表达";
  return "近期公开内容与行为变化";
}

function intentFor(value) {
  if (/价格|多少钱|报价|费用/.test(value)) return "询价";
  if (/合作/.test(value)) return "合作需求";
  if (/想买|准备买|购买|买车|买房|找.*服务商|哪里可以买/.test(value)) return "购买意向";
  if (/投诉|不满|太差|问题/.test(value)) return "替换或解决需求";
  return "待判断";
}

function relationshipFor(sourceId, value) {
  if (sourceId === TOUCH_SOURCE_IDS.SPECIFIC_ACCOUNT) return "指定关系";
  if (sourceId === TOUCH_SOURCE_IDS.IMPORTED_LIST) return "已有名单关系";
  if (sourceId === TOUCH_SOURCE_IDS.HISTORICAL_LEAD) return "历史 Lead";
  if (sourceId === TOUCH_SOURCE_IDS.EXISTING_CUSTOMER) return "已有客户";
  if (sourceId === TOUCH_SOURCE_IDS.ACCOUNT_RELATION && /竞争对手|竞品/.test(value)) return "竞品相关陌生人";
  if ([TOUCH_SOURCE_IDS.WORK_INTERACTIONS, TOUCH_SOURCE_IDS.LIVE_INTERACTIONS].includes(sourceId)) return "内容互动用户";
  if (sourceId === TOUCH_SOURCE_IDS.PROFILE_SEARCH) return "陌生账号";
  return "待建立关系";
}

function missingFor(value, sourceId, timeWindow, filter) {
  const missing = [];
  if (!/(私信|发消息|邮件|Email|WhatsApp|短信|电话|联系)/i.test(value)) missing.push("触达渠道");
  if (timeWindow === "未指定") missing.push("时间范围");
  if ([TOUCH_SOURCE_IDS.PROFILE_SEARCH, TOUCH_SOURCE_IDS.OPEN_SEARCH].includes(sourceId) && /按目标描述补齐/.test(filter)) missing.push("筛选条件");
  return missing;
}

export function isTouchRequest(text = "") {
  const value = normalize(text);
  return /触达|联系|发消息|私信|跟进|重新联系|找.*(?:人|账号|客户|粉丝)|名单.*(?:一遍|联系|触达)/.test(value);
}

export function parseTouchRequest(text = "") {
  const value = normalize(text);
  if (!isTouchRequest(value)) return null;
  const sourceId = sourceFor(value) || TOUCH_SOURCE_IDS.OPEN_SEARCH;
  const timeWindow = extractTimeWindow(value);
  const filter = extractFilters(value, sourceId);
  const audience = audienceFor(value, sourceId);
  const signal = signalFor(value, sourceId);
  const intent = intentFor(value);
  const relationship = relationshipFor(sourceId, value);
  const missing = missingFor(value, sourceId, timeWindow, filter);
  const isSpecific = sourceId === TOUCH_SOURCE_IDS.SPECIFIC_ACCOUNT;
  return {
    source: { id: sourceId, label: SOURCE_LABELS[sourceId] || "自然语言目标" },
    audience,
    signal,
    filter,
    timeWindow,
    intent,
    relationship,
    action: isSpecific
      ? "先生成首触建议，确认后模拟发送"
      : "先生成候选清单与触达草稿，确认后模拟批量触达",
    missing,
    confidence: missing.length ? "需要补充" : "已识别"
  };
}
