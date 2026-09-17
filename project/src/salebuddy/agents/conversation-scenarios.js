/**
 * Conversation contracts for the member DM surface.
 *
 * The renderer shares interaction states, while each Agent owns a bounded
 * business flow, data scope, handoff path, and confirmation policy.
 */
import { getMarketplaceAgent, MARKETPLACE_AGENTS } from "./marketplace.js";

export const CONVERSATION_STATE_ORDER = Object.freeze([
  "welcome",
  "understanding",
  "input_required",
  "working",
  "result",
  "approval",
  "applied",
  "recovery",
  "next_step"
]);

const FAMILY_SCENARIO_IDS = Object.freeze({
  chief: Object.freeze(["welcome", "global_data_query", "cross_agent_diagnosis", "routing", "strategy_proposal", "approval", "applied", "recovery"]),
  discovery: Object.freeze(["welcome", "scope_input", "collect", "result", "handoff", "optimization", "applied", "recovery"]),
  analysis: Object.freeze(["welcome", "scope_input", "analyze", "result", "diagnosis", "optimization", "applied", "recovery"]),
  outreach: Object.freeze(["welcome", "scope_input", "message_preview", "approval", "send", "result", "recovery"]),
  inbox: Object.freeze(["welcome", "objective_input", "receive", "reply", "handoff", "result", "optimization", "applied", "recovery"]),
  goal_inbox: Object.freeze(["welcome", "objective_input", "receive", "reply", "goal_progress", "handoff", "result", "optimization", "applied", "recovery"]),
  content: Object.freeze(["welcome", "brief_input", "draft", "review", "result", "optimization", "applied", "recovery"]),
  reliability: Object.freeze(["welcome", "diagnosis", "repair", "verification", "result", "approval", "applied", "recovery"]),
  follow_up: Object.freeze(["welcome", "scope_input", "prioritize", "plan", "approval", "result", "recovery"]),
  general: Object.freeze(["welcome", "input_required", "working", "result", "optimization", "approval", "applied", "recovery"])
});

const SCENARIO_LIBRARY = Object.freeze({
  welcome: { label: "开始工作", responseGoal: "确认目标、对象和可用数据，再决定下一步。", userExamples: ["你能做什么？", "开始今天的工作"] },
  global_data_query: { label: "查看全局数据", responseGoal: "按时间、Agent 和指标汇总已有真实产出。", userExamples: ["昨天得到了几条线索？", "昨天的触达率怎么样？"] },
  cross_agent_diagnosis: { label: "跨 Agent 诊断", responseGoal: "沿获客、分析、触达和承接链路定位损耗。", userExamples: ["为什么转化率还有损耗？"] },
  routing: { label: "安排专业 Agent", responseGoal: "说明应该由哪个专业 Agent 继续处理，以及它需要什么输入。", userExamples: ["这件事应该交给谁？"] },
  strategy_proposal: { label: "提出策略调整", responseGoal: "把诊断转成可审阅的配置变更，不直接生效。", userExamples: ["这个数据表现怎么样可以变得更好？"] },
  scope_input: { label: "确认处理范围", responseGoal: "确认账号、时间、来源、对象或筛选条件。", userExamples: ["从直播和评论里找潜客"] },
  collect: { label: "汇总互动用户", responseGoal: "采集、去重并保留原始互动证据。", userExamples: ["把评论和直播里的用户都找出来"] },
  result: { label: "交付结果", responseGoal: "给出数量、口径、证据、异常和下一步，不把推断当事实。", userExamples: ["结果怎么样？"] },
  handoff: { label: "移交下一环", responseGoal: "把结构化结果交给明确的下游 Agent，并保留任务上下文。", userExamples: ["交给客户分析员"] },
  optimization: { label: "优化工作方式", responseGoal: "根据数据和诊断提出可执行的配置或流程调整。", userExamples: ["后面怎么优化？"] },
  applied: { label: "确认后生效", responseGoal: "仅在用户明确确认后写入当前 Agent 的配置，并回报生效范围。", userExamples: ["可以，就这样调整"] },
  recovery: { label: "异常恢复", responseGoal: "说明已保留的上下文、失败原因和可重试动作。", userExamples: ["继续处理刚才失败的任务"] },
  analyze: { label: "分析与判断", responseGoal: "基于已有证据完成评分、归因或结构化分析。", userExamples: ["分析这批互动用户"] },
  diagnosis: { label: "解释原因", responseGoal: "区分数据事实、判断依据和仍待验证的假设。", userExamples: ["为什么这批结果不理想？"] },
  message_preview: { label: "预览待发送内容", responseGoal: "展示发送账号、目标对象、文案和风险，不提前宣称已发送。", userExamples: ["先给我看发送文案"] },
  approval: { label: "发送前确认", responseGoal: "在外部动作前确认账号、对象、内容、数量和风险。", userExamples: ["确认发送"] },
  send: { label: "执行外部触达", responseGoal: "逐条执行并记录成功、失败、跳过和未知回执。", userExamples: ["发给这 4 位客户"] },
  objective_input: { label: "确认承接目标", responseGoal: "明确是解答问题、获取线索、预约还是转人工。", userExamples: ["先回答客户问题，再获取线索"] },
  receive: { label: "接收真实会话", responseGoal: "读取新私信上下文，不凭空生成客户消息。", userExamples: ["有新私信了，帮我看看"] },
  reply: { label: "继续对话", responseGoal: "先回应客户当前问题，再推进一个必要的下一步。", userExamples: ["这条私信怎么接？"] },
  goal_progress: { label: "目标达成进展", responseGoal: "报告目标动作、未完成原因和人工接管节点。", userExamples: ["按目标完成得怎么样？"] },
  brief_input: { label: "确认内容简报", responseGoal: "确认受众、渠道、素材、事实和交付规格。", userExamples: ["帮我写一版直播预告"] },
  draft: { label: "生成内容初稿", responseGoal: "输出可编辑初稿，并标记变量、引用和事实缺口。", userExamples: ["先给我三版文案"] },
  review: { label: "人工审阅", responseGoal: "保留人工审核，不直接发布外部内容。", userExamples: ["这版可以发布吗？"] },
  repair: { label: "修复运行问题", responseGoal: "定位账号、页面、选择器或队列问题并给出修复动作。", userExamples: ["查一下为什么任务失败"] },
  verification: { label: "回放验证", responseGoal: "用可复核的回放或回执验证修复是否有效。", userExamples: ["把修复结果验证一下"] },
  prioritize: { label: "排序跟进", responseGoal: "按客户阶段、反馈和截止时间生成优先级。", userExamples: ["今天先跟进谁？"] },
  plan: { label: "生成跟进计划", responseGoal: "给出负责人、时间点、触发条件和停止条件。", userExamples: ["排一版本周跟进计划"] },
  input_required: { label: "补充必要信息", responseGoal: "只询问完成当前业务动作真正缺少的字段。", userExamples: ["我想开始处理"] },
  working: { label: "执行中", responseGoal: "说明当前阶段和已完成范围，不把中间状态当作最终结果。", userExamples: ["现在做到哪了？"] }
});

const AGENT_OVERRIDES = Object.freeze({
  main: {
    family: "chief",
    objective: "查看所有 Agent 的状态、任务进展和已有业务数据，并解释跨 Agent 链路中的问题。",
    inputs: ["时间范围", "Agent 或业务环节", "指标或问题"],
    dataSources: ["所有 Agent 的结构化结果", "任务状态与运行记录", "成果中心产出", "账号与触达汇总"],
    outputs: ["全局数据汇总", "跨 Agent 诊断", "专业 Agent 路由建议", "待确认策略提案"],
    handoffs: ["mkt-find-people", "mkt-intent-analyst", "mkt-cold-writer", "mkt-dm-inbox"],
    boundaries: ["不代替专业 Agent 执行具体业务动作", "不直接发送外部消息", "策略调整必须先形成提案并等待确认"],
    permissions: { canReadGlobalAgentData: true, canAnalyzeIntent: true, canExecuteExternalAction: false, canApplyConfigAfterConfirmation: false },
    confirmation: { mode: "never_auto_apply", reason: "幕僚长只负责全局认知和决策建议" },
    composerPlaceholder: "问全局数据、指标原因，或告诉幕僚长你想判断什么…"
  },
  "mkt-comment-acquisition": {
    family: "discovery",
    objective: "围绕一个已授权抖音账号串起找人、分析、触达和私信承接的完整获客链路。",
    inputs: ["授权账号", "获客目标", "重点信号或客户类型"],
    dataSources: ["作品评论", "直播互动", "账号互动通知", "意向分析结果", "触达与私信记录"],
    outputs: ["候选用户", "互动证据", "转化漏斗指标", "触达与私信结果", "运行摘要"],
    handoffs: ["mkt-intent-analyst", "mkt-cold-writer", "mkt-dm-inbox"],
    boundaries: ["只处理已授权账号", "证据不足时标记待分析", "不会把未回执的发送写成成功"],
    permissions: { canReadGlobalAgentData: false, canAnalyzeIntent: true, canExecuteExternalAction: true, canApplyConfigAfterConfirmation: true },
    confirmation: { mode: "before_config_apply", reason: "策略改变会影响后续真实获客和触达" },
    composerPlaceholder: "告诉我账号、想看的数据，或要优化哪一段获客链路…"
  },
  "mkt-find-people": {
    family: "discovery",
    objective: "只汇总已授权账号的新互动用户，去重并保留原话、来源和时间，交给客户分析员判断。",
    inputs: ["已授权抖音账号", "互动来源", "本次汇总说明（可选）"],
    outputs: ["互动用户池", "来源证据", "待分析名单"],
    handoffs: ["mkt-intent-analyst"],
    boundaries: ["不判断购买意向", "不读取私信内容", "不自动发送私信"],
    permissions: { canReadGlobalAgentData: false, canAnalyzeIntent: false, canExecuteExternalAction: false, canApplyConfigAfterConfirmation: true },
    confirmation: { mode: "before_config_apply", reason: "采集范围或证据方式会影响下游分析" },
    composerPlaceholder: "告诉我账号、互动来源，或想汇总哪类用户…"
  },
  "mkt-intent-analyst": {
    family: "analysis",
    objective: "基于已有互动用户和原始证据判断购买意向，输出分层结果和可回溯报告。",
    inputs: ["候选名单", "原始互动证据", "评分标准或分析目标"],
    outputs: ["意向分层", "判断理由", "待确认项", "HTML 分析报告"],
    handoffs: ["mkt-cold-writer"],
    boundaries: ["不重新找人", "不自动私信", "不把推断写成客户事实"],
    permissions: { canReadGlobalAgentData: false, canAnalyzeIntent: true, canExecuteExternalAction: false, canApplyConfigAfterConfirmation: true },
    confirmation: { mode: "before_config_apply", reason: "评分规则变化会改变进入触达的客户范围" },
    composerPlaceholder: "告诉我分析哪批候选、按什么标准判断，或查看哪份报告…"
  },
  "mkt-cold-writer": {
    family: "outreach",
    objective: "为已确认的潜客生成首轮私信，发送前核对账号、对象和内容，发送后回传逐条回执。",
    inputs: ["待触达名单", "发送账号", "首轮话术或表达目标"],
    outputs: ["发送预览", "逐账号发送结果", "失败与未知回执", "跟进名单"],
    handoffs: ["mkt-dm-inbox"],
    boundaries: ["未经确认不发送", "没有成功回执不标记为已触达", "云电脑中断时不重复盲发"],
    permissions: { canReadGlobalAgentData: false, canAnalyzeIntent: false, canExecuteExternalAction: true, canApplyConfigAfterConfirmation: true },
    confirmation: { mode: "before_each_batch", reason: "私信是不可逆的外部动作" },
    composerPlaceholder: "告诉我触达谁、用哪个账号，或先查看这批私信预览…"
  },
  "mkt-dm-inbox": {
    family: "inbox",
    objective: "监听授权账号的新私信，结合上下文继续承接，识别留资和人工接管节点。",
    inputs: ["授权账号", "回复策略", "人工交接边界"],
    outputs: ["会话摘要", "回复记录", "留资信号", "人工接管事项"],
    boundaries: ["只处理真实收到的私信", "先回答当前问题再推进", "价格、承诺、投诉和敏感信息交人工"],
    permissions: { canReadGlobalAgentData: false, canAnalyzeIntent: true, canExecuteExternalAction: true, canApplyConfigAfterConfirmation: true },
    confirmation: { mode: "on_boundary", reason: "普通承接可自动运行，风险节点必须人工确认" },
    composerPlaceholder: "告诉我看哪条私信、当前接待目标，或要复盘哪段会话…"
  },
  "mkt-gold-customer-service": {
    family: "goal_inbox",
    objective: "根据用户设定的私信目标承接授权账号的新会话，先回应客户问题，再推进目标动作。",
    inputs: ["授权账号", "私信对话目标", "业务资料和人工边界"],
    outputs: ["会话摘要", "回复记录", "目标达成进展", "人工接管事项"],
    boundaries: ["不把主动陌生人触达当作客服承接", "无法确认的事实不猜测", "报价、承诺、投诉和敏感信息交人工"],
    permissions: { canReadGlobalAgentData: false, canAnalyzeIntent: true, canExecuteExternalAction: true, canApplyConfigAfterConfirmation: true },
    confirmation: { mode: "before_activation_or_boundary", reason: "启用目标驱动承接或处理风险会话前需要用户决定" },
    composerPlaceholder: "告诉我客服目标，或把一条新私信交给我判断下一步…"
  },
  "mkt-live-danmaku-analysis": {
    family: "analysis",
    objective: "只分析授权账号当前直播间的新弹幕，找出用户问题、需求和转化阻力，优化下一场直播。",
    inputs: ["已授权抖音账号", "当前直播场次（自动读取）", "分析重点（可选）"],
    outputs: ["弹幕主题", "高频问题", "需求与转化阻力", "下一场直播优化策略"],
    boundaries: ["不读取点赞、送礼、关注或进场信号", "只读不触达", "弹幕不足时标记样本不足"],
    permissions: { canReadGlobalAgentData: false, canAnalyzeIntent: false, canExecuteExternalAction: false, canApplyConfigAfterConfirmation: true },
    confirmation: { mode: "before_config_apply", reason: "分析口径调整会影响直播判断结果" },
    composerPlaceholder: "告诉我看哪场直播、关注什么问题，或查看当前弹幕分析…"
  },
  "mkt-live-danmaku-outreach": {
    family: "outreach",
    objective: "读取授权账号当前直播间的新弹幕，并按每位发言用户逐一执行首次私信触达。",
    inputs: ["已授权抖音账号", "当前直播场次（自动读取）", "触达内容（可选）"],
    outputs: ["弹幕用户身份", "首次触达状态", "发送回执", "异常记录"],
    boundaries: ["不判断成交状态或购买意向", "拒绝联系、投诉或退款时立即转人工", "没有可验证身份时不自动发送"],
    permissions: { canReadGlobalAgentData: false, canAnalyzeIntent: false, canExecuteExternalAction: true, canApplyConfigAfterConfirmation: false },
    confirmation: { mode: "automatic_with_escalation", reason: "产品规则是弹幕即触达，但风险和身份异常必须升级" },
    composerPlaceholder: "告诉我直播间触达规则，或查看当前弹幕触达回执…"
  },
  "mkt-viral-work-analysis": {
    family: "analysis",
    objective: "解析公开作品本身、作品数据和评论，拆解内容机制并输出下一轮创作测试。",
    inputs: ["抖音作品完整链接", "分析重点（可选）"],
    outputs: ["视频内容拆解", "流量假设", "评论需求分析", "下一轮创作测试", "HTML 分析报告"],
    boundaries: ["没有返回的数据标记待核验", "不把播放或互动直接写成成交", "只读不触达，不复制原作品素材"],
    permissions: { canReadGlobalAgentData: false, canAnalyzeIntent: false, canExecuteExternalAction: false, canApplyConfigAfterConfirmation: true },
    confirmation: { mode: "before_config_apply", reason: "分析模板和测试规则调整需要用户确认" },
    composerPlaceholder: "发给我作品链接，或告诉我想重点拆解哪一部分…"
  },
});

function unique(values = []) {
  return [...new Set((Array.isArray(values) ? values : [values]).map((value) => String(value || "").trim()).filter(Boolean))];
}

function agentIdFor(agentOrId) {
  return String(typeof agentOrId === "string" ? agentOrId : agentOrId?.id || agentOrId?.agentId || "").trim();
}

function inferFamily(agentId, agent = null) {
  const caps = agent?.capabilities || {};
  if (agentId === "main") return "chief";
  if (caps.goldCustomerService) return "goal_inbox";
  if (caps.inboxReception) return "inbox";
  if (caps.liveDanmakuOutreach || caps.privateOutreach || caps.touchEveryLiveDanmaku) return "outreach";
  if (caps.analysisOnly || caps.liveAnalysis || caps.publicWorkAnalysis) return "analysis";
  if (agent?.category === "分析") return "analysis";
  if (agent?.category === "触达") return "outreach";
  if (agent?.category === "找人") return "discovery";
  return "general";
}

function fallbackContract(agentId, agent, profile, family) {
  const canExecuteExternalAction = family === "outreach" || family === "inbox" || family === "goal_inbox";
  return {
    family,
    objective: agent?.mission || agent?.desc || "根据已声明能力处理当前业务请求。",
    inputs: unique(agent?.inputs || profile?.inputs || ["用户目标"]),
    dataSources: unique(profile?.scope?.dataAccess || agent?.tools || ["当前 Agent 已授权数据"]),
    outputs: unique(agent?.outputs || agent?.deliverables || ["结构化业务结果"]),
    handoffs: unique(agent?.handoffTo || []),
    boundaries: unique(profile?.scope?.forbiddenZones || ["未声明能力的动作必须停止并请求明确的专业 Agent"]),
    permissions: {
      canReadGlobalAgentData: false,
      canAnalyzeIntent: family === "analysis" || family === "inbox" || family === "goal_inbox",
      canExecuteExternalAction,
      canApplyConfigAfterConfirmation: family !== "chief"
    },
    confirmation: {
      mode: "before_external_action",
      reason: "未声明的外部动作或配置变更必须先确认"
    },
    composerPlaceholder: "告诉我目标、对象或想查看的结果…"
  };
}

function scenarioEntries(family, override) {
  const ids = override.scenarioIds || FAMILY_SCENARIO_IDS[family] || FAMILY_SCENARIO_IDS.general;
  return ids.map((id) => ({
    id,
    ...(SCENARIO_LIBRARY[id] || SCENARIO_LIBRARY.input_required),
    ...(id === "handoff" && override.handoffs?.length ? { handoffTo: [...override.handoffs] } : {})
  }));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function buildContract(agentId) {
  const agent = agentId === "main" ? null : getMarketplaceAgent(agentId);
  const profile = agent?.profile || null;
  const override = AGENT_OVERRIDES[agentId] || {};
  const family = override.family || inferFamily(agentId, agent);
  const fallback = fallbackContract(agentId, agent, profile, family);
  const contract = {
    id: `conversation:${agentId}`,
    version: 1,
    agentId,
    agentName: agent?.name || (agentId === "main" ? "Byering · 幕僚长" : agentId || "未命名 Agent"),
    family,
    sharedStates: [...CONVERSATION_STATE_ORDER],
    states: [...(FAMILY_SCENARIO_IDS[family] || FAMILY_SCENARIO_IDS.general)],
    objective: override.objective || fallback.objective,
    inputs: unique(override.inputs || fallback.inputs),
    dataSources: unique(override.dataSources || fallback.dataSources),
    outputs: unique(override.outputs || fallback.outputs),
    handoffs: unique(override.handoffs || fallback.handoffs),
    boundaries: unique(override.boundaries || fallback.boundaries),
    permissions: { ...fallback.permissions, ...(override.permissions || {}) },
    confirmation: { ...fallback.confirmation, ...(override.confirmation || {}) },
    scenarios: scenarioEntries(family, { ...override, handoffs: unique(override.handoffs || fallback.handoffs) }),
    composerPlaceholder: override.composerPlaceholder || fallback.composerPlaceholder
  };
  return deepFreeze(contract);
}

const AGENT_IDS = Object.freeze(["main", ...MARKETPLACE_AGENTS.map(({ id }) => id)]);
const CONTRACTS = new Map(AGENT_IDS.map((agentId) => [agentId, buildContract(agentId)]));

export function getConversationScenario(agentOrId) {
  const agentId = agentIdFor(agentOrId);
  return CONTRACTS.get(agentId) || buildContract(agentId || "unknown-agent");
}

export function listConversationScenarios() {
  return [...CONTRACTS.values()];
}

export function conversationScenarioAllows(agentOrId, permission) {
  return Boolean(getConversationScenario(agentOrId).permissions?.[permission]);
}
