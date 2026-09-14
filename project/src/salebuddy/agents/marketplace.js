/**
 * agents/marketplace.js
 * Agent 广场：可雇佣成员目录 + 雇佣合同投影。
 *
 * - 目录为静态演示数据（纯数据，无浏览器依赖，agent-store.mjs 在 Node 侧也导入它做档案种子）。
 * - 雇佣状态以服务端合同为准；本模块只保留已拉取合同的内存投影，供页面同步渲染。
 * - 已雇佣成员可通过 dm.message.* 私聊（gateway-mock 对任意 agentType 可用）。
 */
import { normalizeAcquisitionTaskStatus } from "./acquisition-contract.js";
/** 广场分类（顺序即展示顺序）。目录按通用能力组织，不按行业组织。 */
export const MARKETPLACE_CATEGORIES = Object.freeze(["找人", "触达", "私信对话", "分析"]);

/** Historical labels must resolve to the single user-facing conversation capability. */
export const MARKETPLACE_CAPABILITY_ALIASES = Object.freeze({
  "私信回复": "私信对话",
  "私信承接": "私信对话",
  "私信客服": "私信对话",
  "私信自动回复": "私信对话"
});

export function normalizeMarketplaceCapability(value) {
  const label = String(value || "").trim();
  return MARKETPLACE_CAPABILITY_ALIASES[label] || label;
}

const FEATURED_MARKETPLACE_AGENT_IDS = Object.freeze([
  "mkt-comment-acquisition"
]);

/** One complete-capability Agent plus four independently runnable capability Agents. */
export const DOUYIN_ACQUISITION_COMPLETE_AGENT_ID = "mkt-comment-acquisition";

/**
 * Single-capability Agents can run independently only with an account that is
 * not already managed by the complete acquisition Agent.
 */
export const DOUYIN_ACQUISITION_SINGLE_CAPABILITY_AGENT_IDS = Object.freeze([
  "mkt-find-people",
  "mkt-intent-analyst",
  "mkt-cold-writer",
  "mkt-dm-inbox"
]);

/**
 * Compatibility aliases for persisted browser state and older server records.
 * New product logic must use COMPLETE_AGENT_ID and SINGLE_CAPABILITY_AGENT_IDS.
 */
export const DOUYIN_ACQUISITION_MANAGER_AGENT_ID = DOUYIN_ACQUISITION_COMPLETE_AGENT_ID;
export const DOUYIN_ACQUISITION_CHILD_AGENT_IDS = DOUYIN_ACQUISITION_SINGLE_CAPABILITY_AGENT_IDS;

export function isDouyinAcquisitionSingleCapabilityAgent(agentOrId) {
  const agentId = typeof agentOrId === "string" ? agentOrId : agentOrId?.id;
  return DOUYIN_ACQUISITION_SINGLE_CAPABILITY_AGENT_IDS.includes(agentId);
}

/** Return persisted product bindings without inferring from capability readiness. */
export function douyinAcquisitionAccountBindingAgentIds(account = {}) {
  const privateReception = account?.privateReception && typeof account.privateReception === "object"
    ? account.privateReception
    : {};
  return [...new Set([
    account?.agentId,
    account?.bindingAgentId,
    account?.boundAgentId,
    account?.ownerAgentId,
    ...(Array.isArray(account?.agentIds) ? account.agentIds : []),
    ...(Array.isArray(privateReception.agentIds) ? privateReception.agentIds : []),
    privateReception.activeAgentId,
    privateReception.agentId
  ].map((agentId) => String(agentId || "").trim()).filter(Boolean))];
}

export function isDouyinAcquisitionManagerBoundAccount(account = {}) {
  return douyinAcquisitionAccountBindingAgentIds(account)
    .includes(DOUYIN_ACQUISITION_COMPLETE_AGENT_ID);
}

export function hasDouyinAcquisitionManagerBindingConflict(agentOrId, account = {}) {
  return isDouyinAcquisitionSingleCapabilityAgent(agentOrId)
    && isDouyinAcquisitionManagerBoundAccount(account);
}

export const isDouyinAcquisitionChildAgent = isDouyinAcquisitionSingleCapabilityAgent;

export function douyinAcquisitionBindingAgentId(agentOrId) {
  const agentId = typeof agentOrId === "string" ? agentOrId : agentOrId?.id;
  return String(agentId || "").trim();
}

export const DOUYIN_ACQUISITION_ACTIVE_AGENT_IDS = Object.freeze([
  DOUYIN_ACQUISITION_COMPLETE_AGENT_ID,
  ...DOUYIN_ACQUISITION_SINGLE_CAPABILITY_AGENT_IDS
]);

/**
 * One Douyin account owns one cloud desktop. Product Agents use that account
 * carrier to execute RPA work; they never own separate desktops by hierarchy.
 */
export const DOUYIN_ACCOUNT_CLOUD_RUNTIME_ID = "mkt-douyin-account-runtime";

/** @deprecated Legacy carrier id retained only to adopt persisted sessions. */
export const DOUYIN_ACQUISITION_CHILD_CLOUD_AGENT_ID = "mkt-douyin-child-capabilities";

export const DOUYIN_ACQUISITION_LEGACY_CLOUD_AGENT_IDS = Object.freeze([
  ...DOUYIN_ACQUISITION_ACTIVE_AGENT_IDS,
  DOUYIN_ACQUISITION_CHILD_CLOUD_AGENT_ID
]);

/**
 * A logged-in account cloud makes every core product Agent executable. This
 * matrix describes product availability, not a parent-child relation.
 */
export function buildDouyinAcquisitionAccountCapabilityMatrix({ agentIds = [] } = {}) {
  const connected = new Set(
    (Array.isArray(agentIds) ? agentIds : [])
      .map((agentId) => String(agentId || "").trim())
      .filter(Boolean)
  );
  const accountCloudReady = DOUYIN_ACQUISITION_LEGACY_CLOUD_AGENT_IDS
    .some((agentId) => connected.has(agentId))
    || connected.has(DOUYIN_ACCOUNT_CLOUD_RUNTIME_ID);

  return DOUYIN_ACQUISITION_ACTIVE_AGENT_IDS.map((agentId) => {
    const binding = accountCloudReady ? "account_cloud" : "not_connected";
    return Object.freeze({
      agentId,
      name: getMarketplaceAgent(agentId)?.name || agentId,
      binding,
      ready: accountCloudReady,
      cloudAgentId: DOUYIN_ACCOUNT_CLOUD_RUNTIME_ID
    });
  });
}

export const DOUYIN_ACQUISITION_WORKFLOW = Object.freeze([
  Object.freeze({ agentId: "mkt-find-people", stage: "find", handoffTo: Object.freeze(["mkt-intent-analyst"]) }),
  Object.freeze({ agentId: "mkt-intent-analyst", stage: "analyze", handoffTo: Object.freeze(["mkt-cold-writer"]) }),
  Object.freeze({ agentId: "mkt-cold-writer", stage: "outreach", handoffTo: Object.freeze(["mkt-dm-inbox"]) }),
  Object.freeze({ agentId: "mkt-dm-inbox", stage: "conversation", handoffTo: Object.freeze([]) })
]);

/**
 * Product display order: the complete-capability Agent leads, followed by the
 * four independently usable capability Agents and then specialist extensions.
 */
export const MARKETPLACE_AGENT_ARCHITECTURE_ORDER = Object.freeze([
  DOUYIN_ACQUISITION_COMPLETE_AGENT_ID,
  ...DOUYIN_ACQUISITION_SINGLE_CAPABILITY_AGENT_IDS,
  "mkt-lead-miner",
  "mkt-research-expert",
  "mkt-comment-filter",
  "mkt-douyin-finder",
  "mkt-user-research",
  "mkt-live-lead-miner",
  "mkt-audience-search",
  "mkt-network-miner",
  "mkt-trend-insight",
  "mkt-follow-up",
  "mkt-phone-sdr",
  "mkt-copywriter"
]);

export function isFeaturedMarketplaceAgent(agentOrId) {
  const agentId = typeof agentOrId === "string" ? agentOrId : agentOrId?.id;
  return FEATURED_MARKETPLACE_AGENT_IDS.includes(agentId);
}

export function sortMarketplaceAgentsForDisplay(agents = [], { isReady = isMarketplaceAgentAvailable } = {}) {
  const featuredRank = new Map(FEATURED_MARKETPLACE_AGENT_IDS.map((id, index) => [id, index]));
  const architectureRank = new Map(MARKETPLACE_AGENT_ARCHITECTURE_ORDER.map((id, index) => [id, index]));
  return agents
    .map((agent, index) => ({ agent, index }))
    .sort((left, right) => {
      const leftFeatured = isFeaturedMarketplaceAgent(left.agent);
      const rightFeatured = isFeaturedMarketplaceAgent(right.agent);
      if (leftFeatured !== rightFeatured) return Number(rightFeatured) - Number(leftFeatured);
      if (leftFeatured && rightFeatured) return featuredRank.get(left.agent.id) - featuredRank.get(right.agent.id);
      const leftArchitecture = architectureRank.get(left.agent.id) ?? Number.MAX_SAFE_INTEGER;
      const rightArchitecture = architectureRank.get(right.agent.id) ?? Number.MAX_SAFE_INTEGER;
      if (leftArchitecture !== rightArchitecture) return leftArchitecture - rightArchitecture;
      const readiness = Number(Boolean(isReady(right.agent))) - Number(Boolean(isReady(left.agent)));
      return readiness || left.index - right.index;
    })
    .map(({ agent }) => agent);
}

/**
 * 可雇佣成员目录。
 * Fields: marketplace presentation plus a complete runtime profile seed.
 */

function profileSpec({ responsibilities, principles, deliveryStandard, safetyRules, honestyRules, dataAccess, forbiddenZones, approvalRequired, limits, forbidden, maxCalls }) {
  return {
    responsibilities,
    soul: { principles, deliveryStandard, safetyRules, honestyRules },
    scope: { dataAccess, forbiddenZones },
    permission: { approvalRequired, limits, forbidden },
    budget: { daily: null, monthly: null, perTask: null, modelTier: "standard", maxCalls }
  };
}

const MARKETPLACE_PROFILE_SPECS = Object.freeze({
  "mkt-lead-miner": profileSpec({
    responsibilities: ["评论区潜客发现", "从作品评论中识别有需求或购买信号的用户", "按目标人群去重并分层潜客", "保留评论原话、作品来源和判断依据"],
    principles: ["先看评论证据，再判断是否为潜客", "每个潜客都保留来源、原话和核验状态"],
    deliveryStandard: "潜客账号列表包含用户身份、原始评论、来源作品、评论时间、意向等级、置信度和判断理由。",
    safetyRules: ["只使用当前已授权账号的作品评论数据", "批量筛选前确认账号、作品范围、时间窗口和输出数量"],
    honestyRules: ["无法确认购买意向时标记待分析", "不把点赞、玩梗或单一关键词直接写成购买意愿"],
    dataAccess: ["当前授权账号作品评论", "作品信息", "评论用户公开账号身份"],
    forbiddenZones: ["其他账号评论区", "私密聊天内容", "未授权账号数据", "个人敏感信息"],
    approvalRequired: ["导出含账号信息的结果", "发起首次私信触达"],
    limits: { maxWorksPerRun: 200, maxCommentsPerWork: 500, maxRecordsPerRun: 200 },
    forbidden: ["绕过登录或平台权限", "把评论推断成未被证实的个人事实", "未经审批执行触达"],
    maxCalls: 80
  }),
  "mkt-comment-acquisition": profileSpec({
    responsibilities: ["抖音综合获客", "从绑定账号的评论、直播弹幕与互动中找人", "筛选值得推进的用户并完成首次触达", "持续处理后续私信，保留来源、原话、行为与时间证据"],
    principles: ["先以公开互动证据判断，再自动执行合格触达", "首次触达和后续私信使用同一账号接待策略，遇到边界问题交给人工"],
    deliveryStandard: "交付候选潜客、互动证据、首次触达记录、私信承接记录和长期运行摘要。",
    safetyRules: ["只使用公开内容或已授权账号的私信数据", "符合筛选与安全门槛后，仅通过私信完成首次触达", "同一账号只由一个私信承接器发送回复，避免重复回复"],
    honestyRules: ["证据不足时标记待分析", "不把点赞或单一关键词写成购买意愿"],
    dataAccess: ["授权账号作品评论", "授权账号直播弹幕", "互动与关注通知", "已授权账号私信", "商品与内容信息", "首次触达与私信承接记录"],
    forbiddenZones: ["未授权账号私信", "个人敏感信息", "未授权账号数据"],
    approvalRequired: ["首次启动长期自动触达任务"],
    limits: { maxWorksPerRun: 200, maxCommentsPerWork: 500, maxMessagesPerDay: 20 },
    forbidden: ["绕过登录或权限采集", "以公开评论替代私信首触达", "自动发送高风险或证据不足的内容"],
    maxCalls: 80
  }),
  "mkt-comment-filter": profileSpec({
    responsibilities: ["评论条件筛选", "按用户目标分析作品评论", "识别负面评价、投诉、竞品提及等语义信号", "保留评论原话与来源证据"],
    principles: ["先理解用户筛选目标，再逐条判断评论是否匹配", "匹配与不匹配都说明依据"],
    deliveryStandard: "评论筛选结果包含匹配评论、用户、来源作品、原话、时间和判断理由，不输出购买意向等级。",
    safetyRules: ["只使用公开或已授权作品与评论数据", "批量分析前确认账号、时间和字段范围"],
    honestyRules: ["无法判断是否匹配时标记待确认", "不把点赞、情绪词或单一关键词直接当作结论"],
    dataAccess: ["公开作品评论", "作品信息", "已授权账号数据"],
    forbiddenZones: ["私密聊天内容", "个人敏感信息", "未授权账号数据"],
    approvalRequired: ["购买数据", "导出含个人信息的结果"],
    limits: { maxWorksPerRun: 200, maxCommentsPerWork: 500 },
    forbidden: ["绕过登录或权限采集", "收集身份证、私人联系方式等敏感信息"],
    maxCalls: 80
  }),
  "mkt-live-lead-miner": profileSpec({
    responsibilities: ["直播间找客户", "读取授权账号的真实直播消息", "根据发言和返回的互动信息判断观众需求", "整理观众账号、头像、原话、时间与判断理由"],
    principles: ["先还原直播场景，再判断意向", "每条潜客保留互动原话和发生时间"],
    deliveryStandard: "直播潜客清单包含账号、直播场次、互动原话、商品、意向等级和下一步建议。",
    safetyRules: ["只使用公开或已授权的直播数据", "批量采集前确认直播场次、商品和字段范围"],
    honestyRules: ["无法确认购买意向时标记待分析", "不把停留或点赞单独写成明确购买意愿"],
    dataAccess: ["授权账号直播消息", "消息中返回的观众公开信息"],
    forbiddenZones: ["私密聊天内容", "个人敏感信息", "未授权直播回放"],
    approvalRequired: ["购买直播数据", "对外发送私信或评论"],
    limits: { maxRoomsPerRun: 1, maxLeadsPerRoom: 200 },
    forbidden: ["绕过登录或权限采集", "仅凭停留时长认定高意向", "收集身份证、私人联系方式等敏感信息"],
    maxCalls: 70
  }),
  "mkt-market-scout": profileSpec({
    responsibilities: ["收集行业与竞品动态", "监控适配的招投标信息", "整理带来源的情报简报"],
    principles: ["先区分事实和观点", "同一事件合并来源"],
    deliveryStandard: "情报简报包含来源、日期、影响和建议动作。",
    safetyRules: ["只引用可访问来源", "标注信息时效"],
    honestyRules: ["未经交叉验证标记待确认", "不将竞品传闻写成定论"],
    dataAccess: ["公开新闻", "行业网站", "招投标公告"],
    forbiddenZones: ["付费报告全文", "未授权内部资料"],
    approvalRequired: ["订阅付费资讯", "对外发布情报"],
    limits: { maxTopicsPerRun: 20, maxSourcesPerTopic: 10 },
    forbidden: ["绕过付费墙", "传播未经核实的信息"],
    maxCalls: 60
  }),
  "mkt-cold-writer": profileSpec({
    responsibilities: ["接收客户分析员筛出的潜客或成果中心筛选结果", "配置首轮私信内容和发送账号", "通过云电脑逐条执行私信并记录平台回执"],
    principles: ["先确认目标身份，再执行真实发送", "成功、失败和未知结果逐条记录"],
    deliveryStandard: "交付私信触达批次、每个账号的发送状态、失败原因和可继续跟进的结果。",
    safetyRules: ["发送前必须经过用户确认", "控制批量规模和发送间隔"],
    honestyRules: ["平台没有成功回执时不标记为已触达", "云电脑中断时标记结果未知，不重复盲发"],
    dataAccess: ["成果中心目标账号", "用户指定的抖音主页或身份", "已授权抖音账号与云电脑"],
    forbiddenZones: ["未授权抖音账号", "私信承接会话", "个人敏感信息"],
    approvalRequired: ["发送私信", "批量触达超过单次默认数量"],
    limits: { maxMessagesPerRun: 50, maxMessagesPerDay: 30 },
    forbidden: ["未经确认发送消息", "把准备发送标记为成功触达", "批量骚扰联系人"],
    maxCalls: 80
  }),
  "mkt-dm-inbox": profileSpec({
    responsibilities: ["监听已授权抖音账号的新私信和触达回复", "识别用户问题、留资和需要继续跟进的会话", "按接待策略自动回复并更新线索状态", "命中边界时停止自动回复并交给人工"],
    principles: ["先理解上下文，再决定是否回复", "每次回复保留消息、依据和发送结果"],
    deliveryStandard: "交付私信会话、用户问题摘要、自动回复记录、发送状态和需要人工处理的事项。",
    safetyRules: ["只自动回复规则允许且有事实依据的内容", "尊重用户拒绝、勿扰和平台频控"],
    honestyRules: ["没有读取到消息时不虚构会话", "没有足够上下文时转人工处理"],
    dataAccess: ["已授权抖音账号私信", "已批准知识库与回复规则", "回复发送记录"],
    forbiddenZones: ["未授权账号私信", "支付信息和敏感个人信息", "主动陌生人触达名单"],
    approvalRequired: ["人工接管涉及价格、承诺或敏感信息的会话"],
    limits: { maxMessagesPerPoll: 100, maxReplyLength: 500 },
    forbidden: ["把主动触达当作承接", "循环回复自己发送的消息", "自动发送高风险或缺少事实依据的内容"],
    maxCalls: 60
  }),
  "mkt-research-expert": profileSpec({
    responsibilities: ["研究指定账号或账号集合", "整理账号画像、内容与经营数据", "输出可回溯的账号调研简报"],
    principles: ["先确认研究对象和时间范围，再汇总事实", "区分账号原始数据、观察结论和待确认信息"],
    deliveryStandard: "交付账号调研简报，包含账号画像、基础数据、内容概况、关系线索和来源证据。",
    safetyRules: ["只使用公开或已授权数据", "导出前确认账号、时间范围和字段范围"],
    honestyRules: ["区分观察、推断和建议", "没有足够证据时标记样本不足，不把估算写成事实"],
    dataAccess: ["公开账号主页", "公开作品与互动", "已授权账号数据"],
    forbiddenZones: ["私密聊天内容", "个人敏感信息", "未授权联系人名单"],
    approvalRequired: ["购买数据", "导出含个人信息的报表"],
    limits: { maxAccountsPerRun: 100, maxWorksPerAccount: 200, maxSourcesPerAccount: 20 },
    forbidden: ["绕过登录或平台权限", "把推测写成账号事实", "输出个人敏感信息"],
    maxCalls: 80
  }),
  "mkt-douyin-finder": profileSpec({
    responsibilities: ["理解找人目标并启动候选检索", "解析抖音主页、分享文本或 sec_uid 种子", "核验账号画像、近期作品范围和直播状态", "按可见数据给候选账号评分并保留证据"],
    principles: ["先理解目标，再选择验证维度", "只把接口返回的数据写成事实，推断单独标注"],
    deliveryStandard: "交付候选账号清单，包含账号身份、画像数据、近期作品表现、直播状态、评分、理由和来源输入。",
    safetyRules: ["只使用公开或已授权账号数据", "批量分析前确认账号数量、作品数量和刷新策略"],
    honestyRules: ["没有候选发现源时明确说明外部能力缺口", "不把行业热词、关键词命中或作品表现直接写成购买意向"],
    dataAccess: ["抖音账号解析接口", "账号画像接口", "最新作品和作品分页接口", "作品详情接口", "直播间状态接口", "行业列表与热词接口"],
    forbiddenZones: ["评论区数据", "私信和触达动作", "粉丝关系图谱", "个人敏感信息"],
    approvalRequired: ["批量账号分析", "刷新并获取最新数据", "导出含账号信息的结果"],
    limits: { maxAccountsPerRun: 50, maxVideosPerAccount: 20, maxVideoDetailsPerRun: 50, maxLiveChecksPerRun: 50, maxIndustryQueriesPerRun: 20 },
    forbidden: ["虚构全网账号搜索结果", "绕过登录或平台权限", "抓取评论或私信", "未经证据推断个人敏感属性"],
    maxCalls: 160
  }),
  "mkt-find-people": profileSpec({
    responsibilities: ["汇总授权账号评论、直播和互动通知中出现的用户", "合并重复账号并保留原始来源证据", "整理待分析用户池并交给客户分析员"],
    principles: ["只处理启用后收到的授权账号新信号", "只收集用户与证据，不在这一环节判断购买意向"],
    deliveryStandard: "交付账号互动用户池和原始来源证据；不回扫历史内容，不把用户当作潜客，不执行私信或其他触达。",
    safetyRules: ["只使用已授权的抖音账号数据", "不配置历史回溯范围"],
    honestyRules: ["不把互动或弱信号写成购买意向", "没有真实来源时明确说明覆盖范围和数据缺口"],
    dataAccess: ["用户已授权账号的作品评论", "用户已授权账号的直播互动", "用户已授权账号的互动通知"],
    forbiddenZones: ["私信内容", "主动触达动作", "个人敏感信息"],
    approvalRequired: ["批量搜索或分析", "导出含账号信息的结果"],
    limits: { maxCandidatesPerRun: 100, maxAccountsPerRun: 50, maxCommentsPerSource: 200, maxLiveSourcesPerRun: 20 },
    forbidden: ["虚构评论、直播或账号来源", "绕过登录或平台权限", "未经证据推断个人敏感属性", "自动发送私信"],
    maxCalls: 220
  }),
  "mkt-user-research": profileSpec({
    responsibilities: ["理解问卷目标和受访人群", "搜索并核验匹配的抖音用户", "解释候选画像与匹配依据", "通过用户选择的已授权账号发送问卷邀请", "统一沉淀候选分析和真实发送回执"],
    principles: ["先找到真正适合回答问卷的人，再执行触达", "候选分析、发送账号、发送内容和平台回执保持同一任务可追溯"],
    deliveryStandard: "交付受访候选清单、公开画像、匹配理由、问卷邀请内容、发送账号和逐用户真实发送回执。",
    safetyRules: ["搜索阶段不要求账号授权", "发送前由用户选择账号、名单并明确确认", "控制单次触达规模并尊重平台限制"],
    honestyRules: ["没有真实搜索结果时不生成候选名单", "没有平台成功回执时不标记为已发送", "不把公开画像推断成敏感个人事实"],
    dataAccess: ["抖音公开账号资料与近期内容", "用户提供的问卷链接", "用户选择的已授权抖音账号与云电脑"],
    forbiddenZones: ["未授权抖音账号", "个人敏感信息", "与调研目标无关的私密数据"],
    approvalRequired: ["发送问卷私信", "批量触达超过单次默认数量"],
    limits: { maxCandidatesPerRun: 50, maxMessagesPerRun: 50, maxMessagesPerDay: 30 },
    forbidden: ["虚构候选或发送状态", "未经确认发送问卷", "向缺少可触达身份的账号发送"],
    maxCalls: 200
  }),
  "mkt-audience-search": profileSpec({
    responsibilities: ["根据地域、简介和账号画像搜索目标人群", "组合多条件筛选账号", "解释每个候选人的匹配理由"],
    principles: ["先确认筛选条件和边界，再扩大搜索范围", "候选结果保留命中条件和未验证项"],
    deliveryStandard: "交付目标人群清单，包含账号、命中条件、置信度、来源和待核验字段。",
    safetyRules: ["只使用公开或已授权数据", "筛选条件必须同时满足，不返回无边界的泛名单"],
    honestyRules: ["没有证据的画像字段标记待核验", "不把关键词命中等同于真实需求"],
    dataAccess: ["公开账号主页", "公开简介与内容", "已授权账号数据"],
    forbiddenZones: ["私密账号内容", "个人敏感信息", "未授权联系人名单"],
    approvalRequired: ["购买数据", "导出联系人清单"],
    limits: { maxConditionsPerTask: 12, maxCandidatesPerRun: 300, maxAccountsPerRun: 100 },
    forbidden: ["绕过登录或平台权限", "按敏感属性筛选个人", "输出未经验证的联系方式"],
    maxCalls: 70
  }),
  "mkt-network-miner": profileSpec({
    responsibilities: ["分析粉丝、关注和共同受众关系", "发现相似账号与竞品账号", "整理关系证据和可拓展人群"],
    principles: ["先定义关系类型和时间窗口，再计算重叠", "每条关系注明来源账号和计算口径"],
    deliveryStandard: "交付关系网络清单或图谱，包含关系类型、重叠规模、来源和置信度。",
    safetyRules: ["只分析公开或已授权关系数据", "小样本重叠结果标注统计不稳定"],
    honestyRules: ["区分直接关系和推断关系", "不把共同关注直接写成商业合作意向"],
    dataAccess: ["公开粉丝与关注关系", "账号主页", "已授权账号数据"],
    forbiddenZones: ["私密关注列表", "个人敏感信息", "未授权关系数据"],
    approvalRequired: ["购买关系数据", "导出关系网络"],
    limits: { maxSeedAccountsPerRun: 20, maxDepth: 2, maxRelationsPerRun: 500 },
    forbidden: ["绕过登录或平台权限", "推断个人敏感关系", "把关系推断当成事实"],
    maxCalls: 65
  }),
  "mkt-trend-insight": profileSpec({
    responsibilities: ["分析粉丝、播放和互动增长趋势", "比较账号与行业基准", "识别异常变化并给出解释方向"],
    principles: ["先统一指标口径和时间范围，再比较趋势", "异常只做提示，不替用户下未经验证的结论"],
    deliveryStandard: "交付趋势报告和可追溯图表，包含指标口径、时间范围、变化幅度和异常说明。",
    safetyRules: ["原始数据只读", "缺失或口径变化必须显式标记"],
    honestyRules: ["不把相关性写成因果关系", "样本不足时不输出排名结论"],
    dataAccess: ["账号基础数据", "作品与直播数据", "行业公开数据"],
    forbiddenZones: ["个人敏感信息", "未授权经营数据", "未经许可的第三方付费报告"],
    approvalRequired: ["购买行业数据", "导出含个人信息的报表"],
    limits: { maxAccountsPerRun: 100, maxDaysPerSeries: 365, maxMetricsPerTask: 12 },
    forbidden: ["篡改原始数据", "绕过付费墙", "虚构增长或行业基准"],
    maxCalls: 60
  }),
  "mkt-intent-analyst": profileSpec({
    responsibilities: ["接收找客专员沉淀的互动用户", "按成果中心筛选结果或账号维度完成分析", "识别值得推进的人，或按用户目标生成 HTML 分析报告", "将报告同步到文件中心和产品内对话"],
    principles: ["先区分原始数据、观察结果和推测结论", "每个结论都保留来源、时间范围和不确定性"],
    deliveryStandard: "交付分析结果或 HTML 分析报告：包含原始证据、判断依据、待确认项和建议下一步，而不是只输出泛泛的结论。",
    safetyRules: ["只处理公开或已授权的数据", "涉及个人敏感信息时只做必要分析并转人工复核"],
    honestyRules: ["不把相关性写成因果关系", "证据不足时明确标记待确认，不输出伪精确结论"],
    dataAccess: ["待判断候选名单", "候选人的原始表达与来源证据", "任务来源账号与时间信息"],
    forbiddenZones: ["私密聊天内容", "个人敏感信息", "未授权账号或联系人数据"],
    approvalRequired: ["导出含个人信息的分析结果", "将重点潜客交给潜客激活专员"],
    limits: { maxCandidatesPerRun: 500, maxEvidencePerCandidate: 20, maxSourceRunsPerTask: 1 },
    forbidden: ["把推测写成用户事实", "绕过平台权限", "未经审批发送消息"],
    maxCalls: 70
  }),
  "mkt-follow-up": profileSpec({
    responsibilities: ["维护客户阶段和触达记录", "安排下一步跟进", "识别丢单风险并提醒"],
    principles: ["每次跟进都有明确下一步", "以客户反馈调整节奏"],
    deliveryStandard: "跟进计划包含负责人、时间点、触发条件和停止条件。",
    safetyRules: ["尊重客户退订和勿扰要求", "高风险客户转人工"],
    honestyRules: ["没有客户反馈时不标记为已触达", "不虚构商机阶段"],
    dataAccess: ["CRM跟进记录", "客户触达历史", "日历与提醒"],
    forbiddenZones: ["客户支付信息", "其他项目CRM数据"],
    approvalRequired: ["创建外部提醒", "自动发送跟进消息"],
    limits: { maxRemindersPerRun: 100, maxActiveSequences: 20 },
    forbidden: ["删除CRM记录", "未经审批触达客户"],
    maxCalls: 60
  }),
  "mkt-phone-sdr": profileSpec({
    responsibilities: ["准备外呼脚本", "整理通话记录", "根据证据分级客户意向"],
    principles: ["先确认通话目的再设计脚本", "意向分级必须有证据"],
    deliveryStandard: "通话纪要记录客户原话、意向等级、异议和下一步。",
    safetyRules: ["遵守录音和外呼授权", "敏感问题转人工处理"],
    honestyRules: ["没有通话记录不生成纪要", "不替客户补写未说过的话"],
    dataAccess: ["授权线索", "通话录音转写", "已批准话术库"],
    forbiddenZones: ["敏感个人信息", "未授权录音"],
    approvalRequired: ["拨打电话", "发送短信"],
    limits: { maxScriptsPerTask: 20, maxTranscriptsPerRun: 50 },
    forbidden: ["虚构通话记录", "绕过录音授权"],
    maxCalls: 50
  }),
  "mkt-copywriter": profileSpec({
    responsibilities: ["整理业务素材", "按渠道撰写内容初稿", "规划发布时间和配套素材"],
    principles: ["先确认事实和受众", "内容必须匹配发布渠道"],
    deliveryStandard: "初稿包含标题、正文、素材说明、渠道规格和发布建议。",
    safetyRules: ["不使用未授权素材", "发布前保留人工审核"],
    honestyRules: ["不虚构案例数据", "引用内容保留来源"],
    dataAccess: ["项目共享素材", "品牌资料", "已确认客户画像"],
    forbiddenZones: ["未授权图片或版权素材", "客户敏感资料"],
    approvalRequired: ["发布内容", "使用第三方素材"],
    limits: { maxDraftsPerTask: 10, maxWordsPerDraft: 2000 },
    forbidden: ["直接发布内容", "虚构案例和客户背书"],
    maxCalls: 50
  }),
  "mkt-designer": profileSpec({
    responsibilities: ["按品牌规范制作视觉稿", "适配不同渠道和尺寸", "交付可编辑与导出素材"],
    principles: ["先遵守品牌规范再做视觉探索", "每个尺寸保留可编辑源文件"],
    deliveryStandard: "视觉稿注明尺寸、字体、颜色、素材来源和导出规格。",
    safetyRules: ["不使用未授权图片", "导出前检查文字和品牌标识"],
    honestyRules: ["标记模板和素材来源", "不宣称未经验证的视觉效果"],
    dataAccess: ["品牌规范", "项目素材", "模板库"],
    forbiddenZones: ["未授权品牌资产", "客户隐私图片"],
    approvalRequired: ["导出发布素材", "使用第三方素材"],
    limits: { maxAssetsPerTask: 12, maxRevisions: 3 },
    forbidden: ["擅自修改品牌标识", "使用无授权素材"],
    maxCalls: 45
  }),
  "mkt-private-op": profileSpec({
    responsibilities: ["设计社群运营节奏", "编排朋友圈与群内容", "制定裂变活动执行方案"],
    principles: ["先定义社群目标再设计活动", "每个动作标注负责人和时间"],
    deliveryStandard: "运营方案包含分组、内容节奏、执行步骤、指标和风险。",
    safetyRules: ["尊重成员退群和勿扰要求", "活动先小范围验证"],
    honestyRules: ["不虚构活动效果", "指标口径和样本范围写清楚"],
    dataAccess: ["社群运营数据", "内容日历", "已授权客户分组"],
    forbiddenZones: ["私人聊天内容", "未授权成员手机号"],
    approvalRequired: ["发送群消息", "启动裂变活动"],
    limits: { maxGroupsPerTask: 10, maxMessagesPerPlan: 50 },
    forbidden: ["私自添加成员", "批量骚扰群成员"],
    maxCalls: 45
  }),
  "mkt-cs-manager": profileSpec({
    responsibilities: ["跟踪客户使用和反馈", "安排新客引导与续约回访", "识别风险客户并升级"],
    principles: ["以客户目标定义成功", "风险客户及时升级"],
    deliveryStandard: "客户记录包含使用信号、反馈、健康度、下一步和负责人。",
    safetyRules: ["只使用授权客户数据", "续约风险保留人工判断"],
    honestyRules: ["不把提醒当作客户已确认", "不承诺未批准的折扣和服务"],
    dataAccess: ["CRM客户记录", "产品使用反馈", "问卷数据"],
    forbiddenZones: ["支付和合同核心数据", "其他团队客户数据"],
    approvalRequired: ["发送续约或回访消息", "调整客户状态"],
    limits: { maxCustomersPerRun: 100, maxRemindersPerRun: 100 },
    forbidden: ["承诺退款或折扣", "修改合同数据"],
    maxCalls: 55
  }),
  "mkt-quote": profileSpec({
    responsibilities: ["按确认价格生成报价单", "根据模板起草合同", "标注条款和信息缺口"],
    principles: ["报价依据必须可追溯", "合同风险先标记再流转"],
    deliveryStandard: "报价单列明产品、数量、价格、有效期和待确认项。",
    safetyRules: ["沿用已确认价格表", "合同初稿必须经过人工和法务审核"],
    honestyRules: ["缺失信息明确列出", "不把初稿当作正式合同"],
    dataAccess: ["已确认产品目录", "价格表", "合同模板"],
    forbiddenZones: ["未确认折扣", "客户支付信息"],
    approvalRequired: ["提交报价", "发起电子签"],
    limits: { maxQuotesPerTask: 20, maxDocumentsPerRun: 20 },
    forbidden: ["擅自改价", "代替法务定稿"],
    maxCalls: 35
  }),
  "mkt-data-analyst": profileSpec({
    responsibilities: ["统一销售数据口径", "分析漏斗和业绩归因", "输出可追溯报表与看板"],
    principles: ["先统一口径再计算", "结论必须能追溯到数据"],
    deliveryStandard: "分析报告注明数据范围、口径、计算方法、异常和结论。",
    safetyRules: ["原始数据只读", "输出前检查缺失值和重复记录"],
    honestyRules: ["样本不足时标注限制", "不把相关性写成因果关系"],
    dataAccess: ["项目共享表格", "CRM销售数据", "已授权数据采购"],
    forbiddenZones: ["个人敏感数据", "其他项目原始数据"],
    approvalRequired: ["购买数据", "导出含个人信息的报表"],
    limits: { maxRowsPerRun: 100000, maxChartsPerTask: 20 },
    forbidden: ["篡改原始数据", "输出无法追溯的结论"],
    maxCalls: 70
  }),
  "mkt-bid": profileSpec({
    responsibilities: ["筛选适配的招标机会", "整理资格要求和截止节点", "起草标书并跟踪材料缺口"],
    principles: ["先核对资格和截止时间", "标书内容逐项对应招标要求"],
    deliveryStandard: "标讯简报包含来源、截止时间、资格要求、缺口和下一步。",
    safetyRules: ["关键日期设置双重提醒", "提交前保留负责人审核"],
    honestyRules: ["缺失资质明确标记", "不伪造业绩和证明材料"],
    dataAccess: ["公开招标公告", "企业资质库", "项目共享文档"],
    forbiddenZones: ["未授权投标文件", "个人身份证明"],
    approvalRequired: ["购买标书", "提交投标文件"],
    limits: { maxTendersPerRun: 30, maxDraftPages: 100 },
    forbidden: ["伪造资质", "隐瞒已错过的截止时间"],
    maxCalls: 45
  })
});

function buildMarketplaceProfile(agent) {
  const spec = MARKETPLACE_PROFILE_SPECS[agent.id];
  return {
    identity: { name: agent.name, avatar: null, title: agent.title, languageStyle: "", signature: "" },
    soul: spec.soul,
    role: { position: agent.title, responsibilities: [...spec.responsibilities], reportsTo: "main" },
    skills: [...agent.skills],
    tools: [...agent.tools],
    scope: spec.scope,
    permission: spec.permission,
    budget: spec.budget,
    ...(agent.mission ? { mission: agent.mission } : {}),
    ...(agent.inputs ? { inputs: [...agent.inputs] } : {}),
    ...(agent.outputs ? { outputs: [...agent.outputs] } : {}),
    ...(agent.approvalDefaults ? { approvalDefaults: { ...agent.approvalDefaults } } : {}),
    ...(agent.capabilities ? { capabilities: { ...agent.capabilities } } : {}),
    ...(agent.composition ? { composition: cloneMarketplaceComposition(agent.composition) } : {})
  };
}

const DOUYIN_ACQUISITION_WORKFLOW_BY_AGENT_ID = new Map(
  DOUYIN_ACQUISITION_WORKFLOW.map((definition) => [definition.agentId, definition])
);

function cloneMarketplaceComposition(composition) {
  return {
    ...composition,
    ...(composition.coverage ? { coverage: [...composition.coverage] } : {}),
    ...(composition.handoffTo ? { handoffTo: [...composition.handoffTo] } : {})
  };
}

function buildDouyinAcquisitionComposition(agentId) {
  if (agentId === DOUYIN_ACQUISITION_COMPLETE_AGENT_ID) {
    return Object.freeze({
      role: "complete_capability",
      coverage: Object.freeze(["find", "analyze", "outreach", "conversation"])
    });
  }
  const workflow = DOUYIN_ACQUISITION_WORKFLOW_BY_AGENT_ID.get(agentId);
  if (!workflow) return null;
  return Object.freeze({
    role: "single_capability",
    workflowStage: workflow.stage,
    handoffTo: workflow.handoffTo
  });
}

const CORE_MARKETPLACE_AGENT_IDS = new Set([
  "mkt-lead-miner",
  "mkt-comment-acquisition",
  "mkt-comment-filter",
  "mkt-live-lead-miner",
  "mkt-cold-writer",
  "mkt-dm-inbox",
  "mkt-research-expert",
  "mkt-douyin-finder",
  "mkt-find-people",
  "mkt-user-research",
  "mkt-audience-search",
  "mkt-network-miner",
  "mkt-trend-insight",
  "mkt-intent-analyst",
  "mkt-follow-up",
  "mkt-phone-sdr",
  "mkt-copywriter"
]);

const MARKETPLACE_AGENT_CAPABILITIES = Object.freeze({
  "mkt-lead-miner": "找人",
  "mkt-comment-acquisition": "找人",
  "mkt-comment-filter": "找人",
  "mkt-live-lead-miner": "找人",
  "mkt-research-expert": "分析",
  "mkt-douyin-finder": "找人",
  "mkt-find-people": "找人",
  "mkt-user-research": "找人",
  "mkt-audience-search": "找人",
  "mkt-network-miner": "找人",
  "mkt-trend-insight": "分析",
  "mkt-intent-analyst": "分析",
  "mkt-cold-writer": "触达",
  "mkt-dm-inbox": "私信对话",
  "mkt-follow-up": "触达",
  "mkt-phone-sdr": "触达",
  "mkt-copywriter": "触达"
});

// Only these marketplace agents currently have a real end-to-end execution path.
export const IMPLEMENTED_MARKETPLACE_AGENT_IDS = Object.freeze([
  "mkt-lead-miner",
  "mkt-comment-filter",
  "mkt-comment-acquisition",
  "mkt-dm-inbox",
  "mkt-cold-writer",
  "mkt-douyin-finder",
  "mkt-find-people",
  "mkt-user-research",
  "mkt-live-lead-miner",
  "mkt-research-expert",
  "mkt-intent-analyst"
]);

/** Legacy labels are presentation-only migrations; runtime records keep their stable IDs. */
export const MARKETPLACE_DISPLAY_NAME_MIGRATIONS = Object.freeze({
  "mkt-lead-miner": Object.freeze({ from: ["Carter", "周砚", "找客户", "作品评论潜客筛选专员", "评论区潜客挖掘专家", "评论区潜客挖掘"], to: "评论区找客户" }),
  "mkt-comment-acquisition": Object.freeze({ from: ["Morgan", "评论区获客管家", "评论区获客运营", "抖音综合获客运营", "获客专家"], to: "抖音获客管家" }),
  "mkt-comment-filter": Object.freeze({ from: ["Claire", "筛筛", "作品评论筛选专员", "作品评论筛选"], to: "按条件筛评论" }),
  "mkt-douyin-finder": Object.freeze({ from: ["Atlas", "抖音找人专家", "抖音全域找人"], to: "抖音找人助手" }),
  "mkt-find-people": Object.freeze({ from: ["综合找人", "全域找人管家", "抖音找人管家"], to: "找客专员" }),
  "mkt-user-research": Object.freeze({ from: ["Iris", "用户调研专家", "用户调研与问卷投放"], to: "找人发问卷" }),
  "mkt-live-lead-miner": Object.freeze({ from: ["Luca", "播播", "直播间潜客筛选专员", "直播间获客专家", "直播间潜客挖掘"], to: "直播间找客户" }),
  "mkt-cold-writer": Object.freeze({ from: ["Owen", "私信运营", "私信触达专员", "潜客触达专员", "抖音私信触达", "批量发私信", "抖音触达助手"], to: "潜客激活专员" }),
  "mkt-dm-inbox": Object.freeze({ from: ["Sophia", "私信承接 / 自动回复专员", "私信自动承接", "私信自动回复", "抖音对话助手"], to: "私信客服" }),
  "mkt-research-expert": Object.freeze({ from: ["抖音账号研究"], to: "抖音账号分析" }),
  "mkt-audience-search": Object.freeze({ from: ["目标人群搜索"], to: "按条件找账号" }),
  "mkt-network-miner": Object.freeze({ from: ["受众关系分析"], to: "粉丝关系分析" }),
  "mkt-trend-insight": Object.freeze({ from: ["账号增长分析"], to: "涨粉趋势分析" }),
  "mkt-intent-analyst": Object.freeze({ from: ["客户研究员", "潜客意向分析", "客户意向判断", "抖音分析助手"], to: "客户分析员" }),
  "mkt-follow-up": Object.freeze({ from: ["潜客持续跟进"], to: "客户跟进提醒" }),
  "mkt-phone-sdr": Object.freeze({ from: ["高意向电话邀约"], to: "电话邀约准备" }),
  "mkt-copywriter": Object.freeze({ from: ["营销内容生成"], to: "营销文案助手" })
});

export function isImplementedMarketplaceAgent(agentOrId) {
  const id = typeof agentOrId === "string" ? agentOrId : agentOrId?.id;
  return IMPLEMENTED_MARKETPLACE_AGENT_IDS.includes(id);
}

/** Shared availability gate for marketplace and contacts surfaces. */
export function isMarketplaceAgentAvailable(agentOrId) {
  const id = typeof agentOrId === "string" ? agentOrId : agentOrId?.id;
  return isImplementedMarketplaceAgent(id) && DOUYIN_ACQUISITION_ACTIVE_AGENT_IDS.includes(id);
}

/** Current executable Agent Center roster shared by office and member surfaces. */
export function listActivatedMarketplaceAgents() {
  return sortMarketplaceAgentsForDisplay(
    MARKETPLACE_AGENTS.filter(isMarketplaceAgentAvailable),
    { isReady: isMarketplaceAgentAvailable }
  );
}

export { normalizeAcquisitionTaskStatus };

export const MARKETPLACE_AGENTS = Object.freeze([
  {
    id: "mkt-lead-miner",
    name: "评论区找客户",
    displayName: "评论区找客户",
    displayTitle: "从留言里找出有需求的人",
    title: "评论区找客户",
    category: "销售",
    domains: ["销售", "客户成功", "招聘猎头", "教育培训", "专业服务"],
    industries: [],
    desc: "从作品评论里找出有需求的人，保留账号、原话和来源。",
    skills: ["找有需求的人", "保留原始留言", "整理客户名单"],
    tools: ["作品评论", "评论语义分析", "潜客结果表"],
    deliverables: ["潜客账号清单", "评论证据", "意向判断"],
    rating: 4.9,
    hires: "2.3万",
    color: "#3B6BD4"
  },
  {
    id: "mkt-comment-acquisition",
    name: "抖音获客管家",
    displayName: "抖音获客管家",
    displayTitle: "找人、分析、触达和对话",
    title: "抖音获客管家",
    category: "找人",
    domains: ["找人"],
    industries: [],
    desc: "从互动用户中找人、分析、首次私信联系和后续对话处理，串起完整获客链路。",
    searchTerms: ["评论区获客", "评论区获客运营", "Morgan", "直播弹幕", "互动关注", "综合获客", "长期获客", "私信承接"],
    skills: ["找互动用户", "筛出值得跟进的人", "完成首次联系和对话"],
    tools: ["互动通知", "直播轮询", "意向分析", "首次私信触达", "私信承接"],
    deliverables: ["候选潜客清单", "互动证据", "触达与私信记录"],
    rating: 4.9,
    hires: "首期开放",
    color: "#4267A5",
    mission: "持续监听绑定账号新产生的评论、直播互动和账号通知，自动去重、识别高意向客户，完成首次触达并承接后续私信。",
    inputs: ["授权账号", "目标人群与意向信号", "首次触达与私信接待规则"],
    outputs: ["候选潜客", "互动证据", "首次触达记录", "私信承接记录", "运行摘要"],
    approvalDefaults: { mode: "auto", touchChannel: "private_message" },
    acquisition: { kind: "comment", capability: "commentAcquisition" },
    capabilities: { independent: true, commentAcquisition: true, inboxReception: true }
  },
  {
    id: "mkt-comment-filter",
    name: "按条件筛评论",
    displayName: "按条件筛评论",
    displayTitle: "差评、询价、提到竞品，都能筛",
    title: "按条件筛评论",
    category: "找人",
    domains: ["找人"],
    industries: [],
    desc: "按条件筛选差评、询价和竞品评论，保留原文与评论人。",
    searchTerms: ["作品评论筛选", "评论条件筛选", "负面评论识别", "douyin-data MCP"],
    skills: ["筛差评和询价", "查留言原文", "导出评论表"],
    tools: ["作品评论", "AI评论分析", "筛选结果表"],
    deliverables: ["评论筛选结果", "评论证据"],
    rating: 4.9,
    hires: "首期开放",
    color: "#7A5C8E"
  },
  {
    id: "mkt-douyin-finder",
    name: "抖音找人助手",
    displayName: "抖音找人助手",
    displayTitle: "说出你的要求，帮你找到合适的人",
    title: "抖音找人助手",
    category: "找人",
    domains: ["找人"],
    industries: [],
    desc: "按你的要求找账号，查看主页和作品，给出匹配人选。",
    searchTerms: ["抖音找人", "自然语言找人", "账号画像", "账号筛选", "作品表现", "增长趋势", "直播状态", "行业热词", "Agent Data API"],
    skills: ["按要求找人", "查看账号和作品", "比较推荐人选"],
    tools: ["账号解析", "账号画像", "最新作品", "作品详情", "直播间状态", "行业热词"],
    deliverables: ["候选账号清单", "匹配评分与理由", "账号数据证据", "待核验项"],
    rating: 4.9,
    hires: "首期开放",
    color: "#4267A5",
    mission: "根据用户描述的目标搜索并验证匹配的抖音账号，参考账号或名单仅用于提高筛选精准度。",
    inputs: ["想找什么样的人", "参考账号主页或名单（可选）", "行业提示（可选）", "内容时间和直播要求（可选）"],
    outputs: ["候选账号", "账号画像", "近期作品表现", "直播状态", "行业上下文", "匹配评分与证据"],
    approvalDefaults: { mode: "manual", batchLimit: 50, fresh: false },
    capabilities: { independent: true, accountResolve: true, accountProfile: true, latestVideos: true, videoDetail: true, liveRoom: true, industryContext: true }
  },
  {
    id: "mkt-find-people",
    name: "找客专员",
    displayName: "找客专员",
    displayTitle: "从我的账号汇总全部互动用户",
    title: "找客专员",
    category: "找人",
    domains: ["找人"],
    industries: [],
    desc: "汇总我账号评论、直播和互动里出现的全部用户，保留来源后交给客户分析员。",
    searchTerms: ["账号互动用户", "评论区用户", "直播互动用户", "互动通知", "待分析名单"],
    skills: ["汇总互动用户", "保留原始证据", "整理待分析名单"],
    tools: ["作品评论", "直播互动", "账号互动通知", "候选去重"],
    deliverables: ["互动用户池", "来源与原话", "待分析名单"],
    rating: 4.9,
    hires: "首期开放",
    color: "#2F80ED",
    mission: "持续监听已授权账号的新评论、直播互动和账号通知，统一去重后形成互动用户池；不判断意向、不自动触达，交给客户分析员继续筛选。",
    inputs: ["已授权抖音账号", "互动来源", "本次汇总说明（可选）"],
    outputs: ["互动用户池", "来源证据", "待分析名单"],
    approvalDefaults: { mode: "manual", batchLimit: 50 },
    capabilities: { independent: true, compositeDiscovery: true, accountDiscovery: true, discoveryOnly: true }
  },
  {
    id: "mkt-user-research",
    name: "找人发问卷",
    displayName: "找人发问卷",
    displayTitle: "找到你想调研的人，邀请填写问卷",
    title: "找人发问卷",
    category: "找人",
    domains: ["找人"],
    industries: [],
    desc: "找到符合条件的受访者，并用指定账号发送问卷邀请。",
    searchTerms: ["用户调研", "问卷投放", "受访者招募", "找人并触达", "问卷邀请"],
    skills: ["找合适的受访者", "核对人选条件", "私信邀请填问卷"],
    tools: ["抖音找人", "账号画像", "已授权抖音云电脑", "私信发送"],
    deliverables: ["受访候选名单", "匹配理由与画像", "问卷触达记录"],
    rating: 4.9,
    hires: "首期开放",
    color: "#357A73",
    mission: "为问卷找到合适的真实受访者，完成候选分析后通过用户选择的抖音账号发送邀请。",
    inputs: ["想调研什么样的人", "问卷链接", "希望邀请的人数", "参考账号（可选）"],
    outputs: ["受访候选清单", "公开画像与匹配依据", "逐用户问卷发送回执"],
    approvalDefaults: { mode: "manual", batchLimit: 50 },
    capabilities: { independent: true, composedWorkflow: true, accountDiscovery: true, profileAnalysis: true, privateOutreach: true }
  },
  {
    id: "mkt-live-lead-miner",
    name: "直播间找客户",
    displayName: "直播间找客户",
    displayTitle: "从弹幕和互动里找有兴趣的观众",
    title: "直播间找客户",
    category: "找人",
    domains: ["找人"],
    industries: [],
    desc: "从直播弹幕和互动中找出有需求的观众，整理账号与依据。",
    skills: ["查看弹幕互动", "找有意向的观众", "整理观众名单"],
    tools: ["直播间数据", "互动记录", "线索表"],
    deliverables: ["直播潜客清单", "互动证据"],
    rating: 4.9,
    hires: "1.8万",
    color: "#2F80ED",
    mission: "从授权账号直播消息中识别有需求的观众，持续更新账号、发言、意向理由与来源，不自动发送私信。",
    inputs: ["授权直播账号", "想找什么样的客户"],
    outputs: ["直播互动证据", "观众账号与头像", "意向判断与理由", "运行摘要"],
    approvalDefaults: { mode: "manual", discoveryOnly: true },
    acquisition: { kind: "live", capability: "liveAcquisition", sourceScope: "authorized_account_live" },
    capabilities: { independent: true, liveAcquisition: true, discoveryOnly: true }
  },
  {
    id: "mkt-cold-writer",
    name: "潜客激活专员",
    displayName: "潜客激活专员",
    displayTitle: "从已分析的潜客中筛选并完成首轮私信",
    title: "潜客激活专员",
    category: "销售",
    domains: ["销售", "客户成功", "招聘猎头", "教育培训", "专业服务"],
    industries: [],
    desc: "从已分析的潜客中筛选，配置首轮私信联系后发送，并记录结果。",
    skills: ["确认触达名单", "发送私信", "查看触达结果"],
    tools: ["抖音云电脑", "账号解析", "私信发送"],
    deliverables: ["私信触达批次", "逐账号发送结果", "失败与未知记录"],
    rating: 4.8,
    hires: "1.9万",
    color: "#D45B5B"
  },
  {
    id: "mkt-dm-inbox",
    name: "私信客服",
    displayName: "私信客服",
    displayTitle: "有人发来私信，替你接待和解答",
    title: "私信客服",
    category: "销售",
    domains: ["销售", "客户成功", "教育培训", "专业服务"],
    industries: ["电商卖货", "直播带货", "知识付费", "付费社群", "汽车服务", "房地产", "医美健康", "教育培训", "专业服务", "本地商家", "品牌营销"],
    desc: "持续处理新私信和历史会话，识别留资并把需要人工判断的事项交给你。",
    skills: ["自动接待私信", "结合上下文回复", "识别留资并转人工"],
    tools: ["私信收件箱", "回复策略", "发送记录"],
    deliverables: ["会话摘要", "自动回复记录", "人工接管事项"],
    rating: 4.9,
    hires: "首期开放",
    color: "#357A73"
  },
  {
    id: "mkt-research-expert",
    name: "抖音账号分析",
    displayName: "抖音账号分析",
    displayTitle: "看看这个账号是谁、内容做得怎样",
    title: "抖音账号分析",
    category: "销售",
    domains: ["销售", "客户成功", "教育培训", "专业服务"],
    industries: ["电商卖货", "直播带货", "知识付费", "付费社群", "汽车服务", "房地产", "医美健康", "教育培训", "专业服务", "本地商家", "品牌营销"],
    desc: "分析账号主页、作品和互动，整理内容表现与账号画像。",
    skills: ["了解账号背景", "分析作品表现", "整理分析报告"],
    tools: ["账号主页", "作品与互动", "调研简报"],
    deliverables: ["账号调研简报", "数据摘要", "来源证据"],
    rating: 4.8,
    hires: "1.1万",
    color: "#6A6FB0"
  },
  {
    id: "mkt-audience-search",
    name: "按条件找账号",
    displayName: "按条件找账号",
    displayTitle: "按地区、行业和简介筛选账号",
    title: "按条件找账号",
    category: "销售",
    domains: ["销售", "客户成功", "招聘猎头", "教育培训", "专业服务"],
    industries: ["电商卖货", "直播带货", "知识付费", "付费社群", "汽车服务", "房地产", "医美健康", "教育培训", "专业服务", "本地商家", "品牌营销"],
    desc: "按地区、简介和账号类型筛选目标账号，说明匹配条件。",
    skills: ["设置找人条件", "搜索合适账号", "说明入选理由"],
    tools: ["账号搜索", "画像条件", "候选清单"],
    deliverables: ["目标人群清单", "匹配理由", "待核验字段"],
    rating: 4.8,
    hires: "7.6千",
    color: "#4E78B8"
  },
  {
    id: "mkt-network-miner",
    name: "粉丝关系分析",
    displayName: "粉丝关系分析",
    displayTitle: "看看谁关注了谁，找到相似的人",
    title: "粉丝关系分析",
    category: "销售",
    domains: ["销售", "客户成功", "招聘猎头", "专业服务"],
    industries: ["电商卖货", "直播带货", "汽车服务", "房地产", "医美健康", "教育培训", "专业服务", "本地商家", "品牌营销"],
    desc: "分析粉丝与关注关系，找出相似账号和共同关注的人。",
    skills: ["查看粉丝关注", "找相似账号", "找共同关注"],
    tools: ["粉丝关系", "关注关系", "网络图谱"],
    deliverables: ["关系网络清单", "相似账号列表", "重叠证据"],
    rating: 4.7,
    hires: "5.4千",
    color: "#5B6D8C"
  },
  {
    id: "mkt-trend-insight",
    name: "涨粉趋势分析",
    displayName: "涨粉趋势分析",
    displayTitle: "看看谁涨粉快、哪些内容带来增长",
    title: "涨粉趋势分析",
    category: "销售",
    domains: ["销售", "客户成功", "教育培训", "专业服务"],
    industries: ["电商卖货", "直播带货", "汽车服务", "房地产", "医美健康", "教育培训", "专业服务", "本地商家", "品牌营销"],
    desc: "对比账号粉丝、播放和互动变化，找出增长与异常。",
    skills: ["比较涨粉速度", "找表现好的内容", "提醒数据异常"],
    tools: ["账号数据", "内容数据", "趋势看板"],
    deliverables: ["趋势报告", "账号排名", "异常说明"],
    rating: 4.8,
    hires: "6.8千",
    color: "#357A73"
  },
  {
    id: "mkt-intent-analyst",
    name: "客户分析员",
    displayName: "客户分析员",
    displayTitle: "分析互动用户或生成报告",
    title: "客户分析员",
    category: "分析",
    domains: ["分析"],
    industries: [],
    desc: "从找客结果中判断值得继续跟进的人，也可按账号或指定目标生成分析报告。",
    skills: ["查看原始表达", "判断购买意向", "生成分析报告"],
    tools: ["候选名单", "原始证据", "意向判断模型"],
    deliverables: ["分析结果", "可回查判断依据", "HTML 分析报告"],
    rating: 4.8,
    hires: "4.9千",
    color: "#7A5C8E"
  },
  {
    id: "mkt-follow-up",
    name: "客户跟进提醒",
    displayName: "客户跟进提醒",
    displayTitle: "记住该回访谁、什么时候联系",
    title: "客户跟进提醒",
    category: "销售",
    domains: ["销售", "客户成功", "招聘猎头", "教育培训", "专业服务"],
    industries: ["知识付费", "付费社群", "医美健康", "教育培训", "专业服务", "本地商家"],
    desc: "根据沟通和意向安排回访时间，整理待跟进清单。",
    skills: ["查看沟通记录", "安排回访时间", "整理跟进提醒"],
    tools: ["潜客表", "日历", "提醒队列"],
    deliverables: ["跟进计划", "提醒清单"],
    rating: 4.9,
    hires: "2.1万",
    color: "#E8A33D"
  },
  {
    id: "mkt-phone-sdr",
    name: "电话邀约准备",
    displayName: "电话邀约准备",
    displayTitle: "打电话前准备话术，聊完整理结果",
    title: "电话邀约准备",
    category: "销售",
    domains: ["销售", "客户成功", "招聘猎头", "教育培训", "专业服务", "录音总结"],
    industries: ["汽车服务", "房地产", "医美健康", "教育培训", "专业服务", "本地商家"],
    desc: "准备电话开场和邀约话术，通话后整理结果与下一步。",
    skills: ["准备邀约话术", "整理通话记录", "记录预约结果"],
    tools: ["通话记录", "录音转写", "潜客表"],
    deliverables: ["通话纪要", "预约清单"],
    rating: 4.7,
    hires: "9千",
    color: "#5B8DEF"
  },
  {
    id: "mkt-copywriter",
    name: "营销文案助手",
    displayName: "营销文案助手",
    displayTitle: "帮你写视频文案、直播预告和私信",
    title: "营销文案助手",
    category: "销售",
    domains: ["销售", "客户成功", "招聘猎头", "教育培训", "专业服务"],
    industries: ["电商卖货", "直播带货", "知识付费", "付费社群", "教育培训", "专业服务", "本地商家", "品牌营销"],
    desc: "根据产品和受众写视频、直播和私信文案，整理发布计划。",
    skills: ["写视频文案", "写预告和私信", "整理发布计划"],
    tools: ["内容资料", "作品草稿", "发布日历"],
    deliverables: ["内容初稿", "发布计划"],
    rating: 4.8,
    hires: "3.1万",
    color: "#2E9E6B"
  },
].filter((agent) => CORE_MARKETPLACE_AGENT_IDS.has(agent.id)).map((agent) => {
  const composition = buildDouyinAcquisitionComposition(agent.id);
  const normalizedAgent = {
    ...agent,
    // Keep the market taxonomy tied to the reusable capability, not the customer's industry.
    category: normalizeMarketplaceCapability(MARKETPLACE_AGENT_CAPABILITIES[agent.id] || agent.category),
    domains: Object.freeze([normalizeMarketplaceCapability(MARKETPLACE_AGENT_CAPABILITIES[agent.id] || agent.category)]),
    industries: Object.freeze([]),
    capabilities: Object.freeze({ independent: true, ...(agent.capabilities || {}) }),
    ...(composition ? { composition } : {}),
    ...(composition?.coverage ? { coverage: composition.coverage } : {}),
    ...(composition?.workflowStage ? { workflowStage: composition.workflowStage } : {}),
    ...(composition?.handoffTo ? { handoffTo: composition.handoffTo } : {})
  };
  return {
    ...normalizedAgent,
    profile: buildMarketplaceProfile(normalizedAgent)
  };
}));

const BY_ID = new Map(MARKETPLACE_AGENTS.map((agent) => [agent.id, agent]));

export function getMarketplaceAgent(id) {
  return BY_ID.get(id) || null;
}

/** Seed the complete runtime profile for agent-store and browser profile views. */
export function marketplaceProfileSeed(agentType) {
  const agent = BY_ID.get(agentType);
  if (!agent) return null;
  return JSON.parse(JSON.stringify(agent.profile));
}

// ── 雇佣合同（服务端状态的浏览器投影）──
let employmentContracts = Object.create(null);

/** No member is auto-hired. Employment starts only after a user action succeeds server-side. */
export const DEFAULT_HIRED_MARKETPLACE_AGENT_IDS = Object.freeze([]);

function readContracts() {
  return employmentContracts;
}

function writeContracts(contracts) {
  employmentContracts = Object.fromEntries(Object.entries(contracts || {})
    .filter(([id, contract]) => BY_ID.has(id) && contract?.status === "active")
    .map(([id, contract]) => [id, { ...contract, agentId: id, status: "active" }]));
  return employmentContracts;
}

/** Hydrates the in-memory view from the tenant-scoped employment API response. */
export function hydrateEmploymentContracts(contracts = []) {
  const source = Array.isArray(contracts) ? contracts : Object.values(contracts || {});
  return writeContracts(Object.fromEntries(source
    .filter((contract) => contract?.agentId && contract.status !== "terminated")
    .map((contract) => [contract.agentId, contract])));
}

export function isHired(id) {
  return Boolean(readContracts()[id]);
}

export function listHiredAgents() {
  const contracts = readContracts();
  const ids = new Set(Object.keys(contracts));
  return MARKETPLACE_AGENTS.filter((agent) => ids.has(agent.id));
}

function createContract(id, { dataScope = null, budget = null, projectId = null, hiredBy = "user" } = {}) {
  const agent = BY_ID.get(id);
  return {
    agentId: id,
    name: agent?.name || id,
    status: "active",
    hiredAt: new Date().toISOString(),
    hiredBy,
    projectId,
    dataScope: Array.isArray(dataScope) && dataScope.length ? [...dataScope] : [...(agent?.profile?.scope?.dataAccess || [])],
    budget: budget && typeof budget === "object" ? { ...budget } : { daily: null, monthly: null, perTask: null },
    approvalRequired: [...(agent?.profile?.permission?.approvalRequired || [])]
  };
}

export function getEmployment(id) {
  return readContracts()[id] || null;
}

/** Persist the one-time onboarding message marker for an active hire. */
export function markEmploymentWelcome(id) {
  const contracts = readContracts();
  if (!contracts[id]) return null;
  const next = { ...contracts, [id]: { ...contracts[id], welcomeSentAt: new Date().toISOString() } };
  writeContracts(next);
  return next[id];
}

export function hireAgent(id, options = {}) {
  if (!BY_ID.has(id)) return null;
  const contracts = readContracts();
  const next = contracts[id] || createContract(id, options);
  writeContracts({ ...contracts, [id]: next });
  return next;
}

export function terminateAgent(id) {
  const contracts = readContracts();
  const current = contracts[id] || createContract(id);
  const terminated = { ...current, status: "terminated", terminatedAt: new Date().toISOString(), projectId: null };
  const next = { ...contracts };
  delete next[id];
  writeContracts(next);
  return terminated;
}

export function assignAgentToProject(id, projectId) {
  const contracts = readContracts();
  if (!contracts[id] || !projectId) return contracts[id] || null;
  const next = { ...contracts, [id]: { ...contracts[id], projectId, assignedAt: new Date().toISOString() } };
  writeContracts(next);
  return next[id];
}

/** Compatibility toggle for existing UI callers. */
export function setHired(id, hired) {
  if (!BY_ID.has(id)) return Object.keys(readContracts());
  if (hired) hireAgent(id);
  else terminateAgent(id);
  return Object.keys(readContracts());
}
