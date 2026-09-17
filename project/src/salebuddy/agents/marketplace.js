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

/** One complete-capability Agent plus independently runnable capability Agents. */
export const DOUYIN_ACQUISITION_COMPLETE_AGENT_ID = "mkt-comment-acquisition";
/** Public-facing independent inbox experience with its own runtime identity. */
export const GOLD_CUSTOMER_SERVICE_AGENT_ID = "mkt-gold-customer-service";

/**
 * Single-capability Agents can run independently only with an account that is
 * not already managed by the complete acquisition Agent.
 */
export const DOUYIN_ACQUISITION_SINGLE_CAPABILITY_AGENT_IDS = Object.freeze([
  "mkt-find-people",
  "mkt-intent-analyst",
  "mkt-cold-writer",
  "mkt-dm-inbox",
  GOLD_CUSTOMER_SERVICE_AGENT_ID
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
  ...DOUYIN_ACQUISITION_SINGLE_CAPABILITY_AGENT_IDS,
  "mkt-live-danmaku-analysis",
  "mkt-live-danmaku-outreach"
]);

/** One-off public-data Agents do not own or start an authorized account runtime. */
export const MARKETPLACE_STANDALONE_AGENT_IDS = Object.freeze([
  "mkt-viral-work-analysis"
]);

/** The five newest product Agents shown in the realtime-work style preview. */
export const MARKETPLACE_LATEST_AGENT_IDS = Object.freeze([
  DOUYIN_ACQUISITION_COMPLETE_AGENT_ID,
  "mkt-live-danmaku-analysis",
  "mkt-viral-work-analysis",
  "mkt-live-danmaku-outreach",
  GOLD_CUSTOMER_SERVICE_AGENT_ID
]);

/**
 * One Douyin account owns one cloud desktop. Product Agents use that account
 * carrier to execute RPA work; they never own separate desktops by hierarchy.
 */
export const DOUYIN_ACCOUNT_CLOUD_RUNTIME_ID = "mkt-douyin-account-runtime";

export const DOUYIN_ACQUISITION_CLOUD_AGENT_IDS = Object.freeze([
  ...DOUYIN_ACQUISITION_ACTIVE_AGENT_IDS
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
  const accountCloudReady = DOUYIN_ACQUISITION_CLOUD_AGENT_IDS
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
  "mkt-live-danmaku-analysis",
  "mkt-live-danmaku-outreach",
  "mkt-viral-work-analysis"
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
  [GOLD_CUSTOMER_SERVICE_AGENT_ID]: profileSpec({
    responsibilities: ["监听已授权抖音账号的新私信和触达回复", "理解用户设定的私信目标并设计对话策略", "根据客户上下文自动回复和推进对话", "命中边界时停止自动回复并交给人工"],
    principles: ["先回答客户当前最关心的问题，再按用户目标推进对话", "每次回复保留消息、依据和发送结果"],
    deliveryStandard: "交付会话摘要、回复记录、目标达成进展和需要人工处理的事项。",
    safetyRules: ["只自动回复规则允许且有事实依据的内容", "尊重用户拒绝、勿扰和平台频控", "首次启动和关键业务承诺保留用户确认"],
    honestyRules: ["没有读取到消息时不虚构会话", "没有足够上下文时转人工处理", "没有真实平台回执时不标记为已回复"],
    dataAccess: ["已授权抖音账号私信", "用户设定的私信目标", "已批准知识库与回复规则", "回复发送记录"],
    forbiddenZones: ["未授权账号私信", "支付信息和敏感个人信息", "主动陌生人触达名单"],
    approvalRequired: ["首次启动金牌客服", "人工接管涉及价格、承诺或敏感信息的会话"],
    limits: { maxMessagesPerPoll: 100, maxReplyLength: 500 },
    forbidden: ["把主动触达当作承接", "循环回复自己发送的消息", "自动发送高风险或缺少事实依据的内容"],
    maxCalls: 60
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
  "mkt-intent-analyst": profileSpec({
    responsibilities: ["接收找客专员沉淀的互动用户", "按成果中心筛选结果或账号维度完成分析", "识别值得推进的人，或按用户目标生成 HTML 分析报告", "将报告同步到文件中心和产品内对话"],
    principles: ["先区分原始数据、观察结果和推测结论", "每个结论都保留来源、时间范围和不确定性"],
    deliveryStandard: "交付分析结果或 HTML 分析报告：包含原始证据、判断依据、待确认项和建议下一步，而不是只输出泛泛的结论。",
    safetyRules: ["只处理公开或已授权的数据", "涉及个人敏感信息时只做必要分析并转人工复核"],
    honestyRules: ["不把相关性写成因果关系", "证据不足时明确标记待确认，不输出伪精确结论"],
    dataAccess: ["待判断候选名单", "候选人的原始表达与来源证据", "任务来源账号与时间信息"],
    forbiddenZones: ["私密聊天内容", "个人敏感信息", "未授权账号或联系人数据"],
    approvalRequired: ["导出含个人信息的分析结果", "将重点潜客交给潜客触达专员"],
    limits: { maxCandidatesPerRun: 500, maxEvidencePerCandidate: 20, maxSourceRunsPerTask: 1 },
    forbidden: ["把推测写成用户事实", "绕过平台权限", "未经审批发送消息"],
    maxCalls: 70
  }),
  "mkt-live-danmaku-analysis": profileSpec({
    responsibilities: ["直播间弹幕分析", "读取授权账号当前直播间的新弹幕", "归纳高频主题、用户问题、需求与转化阻力", "基于证据制定下一场直播优化策略"],
    principles: ["只基于弹幕原文分析用户反馈，不做跟进排序", "不读取点赞、送礼、关注或进场等其他互动"],
    deliveryStandard: "交付直播间用户反馈分析结果，呈现主题、转化阻力和可执行的下一场直播优化策略。",
    safetyRules: ["只使用已授权账号当前直播间的数据", "分析任务只读不触达，不自动发送私信", "优化结论必须能回查到弹幕原文"],
    honestyRules: ["没有弹幕原文就不做结论", "弹幕不足时标记样本不足，不把单条表达写成普遍规律"],
    dataAccess: ["授权账号当前直播间新弹幕", "弹幕用户公开身份"],
    forbiddenZones: ["私信内容", "未授权账号直播间", "个人敏感信息", "主动触达动作"],
    approvalRequired: ["导出含账号信息的分析结果"],
    limits: { maxRoomsPerRun: 1, maxUsersPerRun: 200, maxEvidencePerUser: 20 },
    forbidden: ["绕过登录或平台权限", "读取或分析点赞、送礼、关注、进场信号", "未经审批发送私信"],
    maxCalls: 80
  }),
  "mkt-live-danmaku-outreach": profileSpec({
    responsibilities: ["持续读取授权账号当前直播间的新弹幕", "每位发弹幕的用户都进入首次私信触达", "记录触达提交和回执结果"],
    principles: ["只以是否出现弹幕作为进入触达流程的条件", "不判断成交状态、购买意向或用户价值"],
    deliveryStandard: "交付直播间弹幕用户的首次私信触达结果，保留用户身份、弹幕原话、发送状态和回执，不产出成交或意向判断。",
    safetyRules: ["只使用已授权账号当前直播间的数据", "发送前必须能回查到抖音用户身份", "用户明确拒绝联系、投诉或退款时停止自动触达并转人工"],
    honestyRules: ["不把直播间弹幕写成已成交或未成交事实", "不把触达结果写成用户购买意向", "发送未获得最终回执时标记为待核验"],
    dataAccess: ["授权账号当前直播间弹幕", "弹幕用户公开身份", "私信发送状态和回执"],
    forbiddenZones: ["未授权账号直播间", "个人敏感信息", "主动判断成交或购买意向"],
    approvalRequired: ["用户拒绝联系、投诉或退款的消息", "缺少可验证用户身份的触达"],
    limits: { maxRoomsPerRun: 1, maxUsersPerRun: 200, maxTouchesPerDay: 50 },
    forbidden: ["绕过登录或平台权限", "虚构成交状态或购买意向", "向缺少可验证身份的用户自动发送私信"],
    maxCalls: 80
  }),
  "mkt-viral-work-analysis": profileSpec({
    responsibilities: ["服务准备做或正在做自媒体、希望增长流量的博主", "直接解析视频画面、音轨、口播、字幕和时间结构", "拆解可能带来传播的内容机制并标注验证边界", "输出带来源和边界说明的爆款作品分析报告"],
    principles: ["先观察视频本身，再用作品数据和评论补充验证", "区分视频事实、平台返回事实、增长假设和下一轮测试"],
    deliveryStandard: "交付视频内容概览、流量信号与增长假设、画面与口播拆解、字幕、节奏、剪辑、作品数据、评论需求、可复用元素、下一轮创作测试和来源证据。",
    safetyRules: ["只读取用户提供的公开作品链接和公开数据", "分析任务只读不触达，不执行关注、评论或私信"],
    honestyRules: ["没有返回的播放、评论或转化数据标记为待核验", "不把高播放或高互动直接写成成交结果，不复制原作品素材"],
    dataAccess: ["用户提供的抖音作品链接", "作品实际视频资源", "作品公开详情与互动指标", "作品公开评论（已配置评论源时）"],
    forbiddenZones: ["私信内容", "未授权账号数据", "个人敏感信息", "主动触达动作"],
    approvalRequired: ["导出含账号信息的分析结果", "将分析结论交给触达专员"],
    limits: { maxWorksPerRun: 1, maxCommentsPerWork: 200, maxEvidencePerReport: 40 },
    forbidden: ["绕过登录或平台权限", "虚构播放、互动或转化数据", "把推测写成作品事实", "复制原作品素材"],
    maxCalls: 40
  }),
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
  "mkt-comment-acquisition",
  "mkt-cold-writer",
  "mkt-dm-inbox",
  GOLD_CUSTOMER_SERVICE_AGENT_ID,
  "mkt-find-people",
  "mkt-intent-analyst",
  "mkt-live-danmaku-analysis",
  "mkt-live-danmaku-outreach",
  "mkt-viral-work-analysis"
]);

const MARKETPLACE_AGENT_CAPABILITIES = Object.freeze({
  "mkt-comment-acquisition": "找人",
  "mkt-find-people": "找人",
  "mkt-intent-analyst": "分析",
  "mkt-live-danmaku-analysis": "分析",
  "mkt-live-danmaku-outreach": "触达",
  "mkt-viral-work-analysis": "分析",
  "mkt-cold-writer": "触达",
  "mkt-dm-inbox": "私信对话",
  [GOLD_CUSTOMER_SERVICE_AGENT_ID]: "私信对话"
});

// Only these marketplace agents currently have a real end-to-end execution path.
export const IMPLEMENTED_MARKETPLACE_AGENT_IDS = Object.freeze([
  "mkt-comment-acquisition",
  "mkt-dm-inbox",
  GOLD_CUSTOMER_SERVICE_AGENT_ID,
  "mkt-cold-writer",
  "mkt-find-people",
  "mkt-intent-analyst",
  "mkt-live-danmaku-analysis",
  "mkt-live-danmaku-outreach",
  "mkt-viral-work-analysis"
]);

/** Legacy labels are presentation-only migrations; runtime records keep their stable IDs. */
export const MARKETPLACE_DISPLAY_NAME_MIGRATIONS = Object.freeze({
  "mkt-comment-acquisition": Object.freeze({ from: ["Morgan", "评论区获客管家", "评论区获客运营", "抖音综合获客运营", "获客专家"], to: "抖音获客管家" }),
  "mkt-find-people": Object.freeze({ from: ["综合找人", "全域找人管家", "抖音找人管家"], to: "找客专员" }),
  "mkt-cold-writer": Object.freeze({ from: ["Owen", "私信运营", "私信触达专员", "潜客激活专员", "抖音私信触达", "批量发私信", "抖音触达助手"], to: "潜客触达专员" }),
  "mkt-dm-inbox": Object.freeze({ from: ["Sophia", "私信承接 / 自动回复专员", "私信自动承接", "私信自动回复", "抖音对话助手"], to: "私信客服" }),
  [GOLD_CUSTOMER_SERVICE_AGENT_ID]: Object.freeze({ from: ["金牌私信客服", "金牌客服助手"], to: "金牌客服" }),
  "mkt-intent-analyst": Object.freeze({ from: ["客户研究员", "潜客意向分析", "客户意向判断", "抖音分析助手", "抖音账号分析", "抖音账号研究"], to: "客户分析员" })
});

export function isImplementedMarketplaceAgent(agentOrId) {
  const id = typeof agentOrId === "string" ? agentOrId : agentOrId?.id;
  return IMPLEMENTED_MARKETPLACE_AGENT_IDS.includes(id);
}

/** Shared availability gate for marketplace and contacts surfaces. */
export function isMarketplaceAgentAvailable(agentOrId) {
  const id = typeof agentOrId === "string" ? agentOrId : agentOrId?.id;
  return isImplementedMarketplaceAgent(id)
    && (DOUYIN_ACQUISITION_ACTIVE_AGENT_IDS.includes(id) || MARKETPLACE_STANDALONE_AGENT_IDS.includes(id));
}

/** Current executable Agent Center roster shared by office and member surfaces. */
export function listActivatedMarketplaceAgents() {
  return sortMarketplaceAgentsForDisplay(
    MARKETPLACE_AGENTS.filter((agent) => DOUYIN_ACQUISITION_ACTIVE_AGENT_IDS.includes(agent.id)),
    { isReady: isMarketplaceAgentAvailable }
  );
}

export { normalizeAcquisitionTaskStatus };

export const MARKETPLACE_AGENTS = Object.freeze([
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
    mission: "持续监听绑定账号新产生的评论、直播互动和账号通知，自动识别账号定位与服务对象，判断高意向客户，完成首次触达并承接后续私信。",
    inputs: ["授权账号"],
    outputs: ["候选潜客", "互动证据", "首次触达记录", "私信承接记录", "运行摘要"],
    approvalDefaults: { mode: "auto", touchChannel: "private_message" },
    acquisition: { kind: "comment", capability: "commentAcquisition" },
    capabilities: { independent: true, commentAcquisition: true, inboxReception: true }
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
    id: "mkt-cold-writer",
    name: "潜客触达专员",
    displayName: "潜客触达专员",
    displayTitle: "按账号触达潜客或全部找到的人，并记录结果",
    title: "潜客触达专员",
    category: "销售",
    domains: ["销售", "客户成功", "招聘猎头", "教育培训", "专业服务"],
    industries: [],
    desc: "按账号选择潜客或全部找到的人，配置首轮私信后发送，并记录结果。",
    skills: ["选择触达方式", "一键触达", "查看触达结果"],
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
    id: GOLD_CUSTOMER_SERVICE_AGENT_ID,
    name: "金牌客服",
    displayName: "金牌客服",
    displayTitle: "按你的目标完成私信对话",
    title: "金牌客服",
    category: "销售",
    domains: ["销售", "客户成功", "教育培训", "专业服务"],
    industries: ["电商卖货", "直播带货", "知识付费", "付费社群", "汽车服务", "房地产", "医美健康", "教育培训", "专业服务", "本地商家", "品牌营销"],
    desc: "把客户私信交给 AI，根据你设定的目标自动设计回复和推进方式。",
    skills: ["自动接待私信", "按目标设计对话", "识别人工接管节点"],
    tools: ["私信收件箱", "业务知识", "回复策略", "发送记录"],
    deliverables: ["会话摘要", "回复记录", "目标达成进展", "人工接管事项"],
    rating: 4.9,
    hires: "首期开放",
    color: "#2E9E8F",
    mission: "使用独立的金牌客服承接已授权账号的新私信，根据用户设定的目标自动分析、回复和推进对话；没有依据或涉及敏感信息时交给人工。",
    inputs: ["授权账号", "私信对话目标"],
    outputs: ["会话摘要", "回复记录", "目标达成进展", "人工接管事项"],
    approvalDefaults: { mode: "manual", touchChannel: "private_message" },
    acquisition: { kind: "inbox", capability: "goldCustomerService" },
    capabilities: { independent: true, inboxReception: true, goldCustomerService: true }
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
    id: "mkt-live-danmaku-analysis",
    name: "直播间弹幕分析",
    displayName: "直播间弹幕分析",
    displayTitle: "把直播弹幕整理成下一场转化策略",
    title: "直播间弹幕分析",
    category: "分析",
    domains: ["分析"],
    industries: [],
    desc: "分析直播间用户反馈，优化下一场直播转化。",
    searchTerms: ["直播间弹幕分析", "直播弹幕", "直播间需求分析", "直播弹幕主题"],
    skills: ["识别高频问题", "定位转化阻力", "生成直播优化策略"],
    tools: ["直播弹幕", "主题归纳", "转化分析", "分析报告"],
    deliverables: ["直播问题与异议清单", "用户反馈洞察", "下一场直播优化策略"],
    rating: 4.9,
    hires: "首期开放",
    color: "#2E9E6B",
    mission: "持续分析授权账号当前直播间的新弹幕，归纳用户问题、需求和转化阻力，并给出下一场直播优化策略，不读取点赞或送礼。",
    inputs: ["已授权抖音账号", "当前直播场次（自动读取）", "分析重点（可选）"],
    outputs: ["弹幕主题与高频问题", "需求与转化阻力分析", "新弹幕统计", "下一场直播优化策略与原始证据"],
    approvalDefaults: { mode: "manual", analysisOnly: true, discoveryOnly: true },
    acquisition: { kind: "live_analysis", capability: "liveDanmakuAnalysis", sourceScope: "authorized_account_live" },
    capabilities: { independent: true, liveDanmakuAnalysis: true, liveAnalysis: true, discoveryOnly: true, analysisOnly: true }
  },
  {
    id: "mkt-live-danmaku-outreach",
    name: "电商直播间未成交客户触达",
    displayName: "电商直播间未成交客户触达",
    displayTitle: "直播间有人发弹幕，就自动触达",
    title: "电商直播间未成交客户触达",
    category: "触达",
    domains: ["触达"],
    industries: [],
    desc: "监听电商直播间弹幕，弹幕出现即触达对应用户，不判断成交或购买意向。",
    searchTerms: ["直播间未成交客户触达", "直播弹幕触达", "弹幕私信", "直播间自动触达"],
    skills: ["监听直播间弹幕", "逐一触达弹幕用户", "记录触达结果"],
    tools: ["直播弹幕", "用户身份", "私信触达", "触达回执"],
    deliverables: ["弹幕用户触达记录", "私信发送状态", "触达结果清单"],
    rating: 4.9,
    hires: "首期开放",
    color: "#7C45F7",
    mission: "持续读取已授权账号当前直播间的新弹幕；每位发弹幕的用户都进入首次私信触达，不判断成交状态、购买意向或用户价值。",
    inputs: ["已授权抖音账号", "当前直播场次（自动读取）"],
    outputs: ["弹幕用户身份", "首次私信触达状态", "发送回执与异常记录"],
    approvalDefaults: { mode: "auto", touchEveryLiveDanmaku: true },
    acquisition: { kind: "live_outreach", capability: "liveDanmakuOutreach", sourceScope: "authorized_account_live" },
    capabilities: { independent: true, liveDanmakuOutreach: true, touchEveryLiveDanmaku: true, discoveryOnly: false, analysisOnly: false }
  },
  {
    id: "mkt-viral-work-analysis",
    name: "爆款作品分析",
    displayName: "爆款作品分析",
    displayTitle: "拆解爆款为什么火，找到下一条怎么做",
    title: "爆款作品分析",
    category: "分析",
    domains: ["分析"],
    industries: [],
    desc: "面向自媒体博主，拆解爆款视频，提炼流量机制与可验证的创作打法。",
    searchTerms: ["爆款作品分析", "作品分析", "视频分析", "抖音作品报告", "内容拆解", "爆款拆解"],
    skills: ["解析视频画面和口播", "识别流量抓手与内容结构", "生成可执行的创作测试报告"],
    tools: ["视频内容分析", "作品详情", "作品评论", "互动指标", "分析报告"],
    deliverables: ["视频内容拆解", "流量机制假设", "作品表现摘要", "评论需求分析", "下一轮创作测试", "爆款作品分析报告"],
    rating: 4.9,
    hires: "首期开放",
    color: "#357A73",
    mission: "服务准备做或正在做自媒体、希望增长流量的博主：读取公开抖音作品视频本身，拆解它为什么可能获得流量，再结合作品数据和评论验证假设，输出下一条内容可执行的测试方向。",
    inputs: ["抖音作品完整链接", "分析重点（可选）"],
    outputs: ["视频内容拆解", "流量信号与增长假设", "作品基础数据", "开头与内容结构", "评论需求和疑问", "可复用元素", "下一轮创作测试", "HTML 分析报告"],
    approvalDefaults: { mode: "manual", analysisOnly: true, discoveryOnly: true },
    acquisition: { kind: "public_work_analysis", sourceScope: "public_work_link" },
    capabilities: { independent: true, publicWorkAnalysis: true, discoveryOnly: true, analysisOnly: true }
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
