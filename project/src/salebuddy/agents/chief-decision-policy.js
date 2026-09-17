import { GOLD_CUSTOMER_SERVICE_AGENT_ID } from "./marketplace.js";

export const CHIEF_INTENTS = Object.freeze({
  CONVERSATION: "conversation",
  DATA_QUERY: "data_query",
  TASK: "task",
  TASK_UPDATE: "task_update",
  TASK_CONTROL: "task_control",
  STATUS_QUERY: "status_query",
  SUPPLEMENT: "supplement"
});

export const CHIEF_RESPONSE_MODES = Object.freeze({
  TEXT: "text",
  SUPPLEMENT_CARD: "supplement_card",
  TASK_CARD: "task_card",
  APPROVAL_CARD: "approval_card",
  STATUS_CARD: "status_card",
  RECOVERY_CARD: "recovery_card",
  RESULT_CARD: "result_card",
  RISK_CARD: "risk_card"
});

export const CHIEF_CONFIRMATION_POLICIES = Object.freeze({
  NONE: "none",
  ONCE_PER_TASK: "once_per_task",
  BLOCKING: "blocking"
});

const STATUS_PATTERNS = [
  /进度/u,
  /做到哪/u,
  /怎么样了/u,
  /结果(?:呢|是什么|怎么样)/u,
  /谁在(?:做|执行)/u,
  /(?:所有|全部|全局|整个团队).{0,12}(?:agent|员工|任务|工作|数据|状态|进展)/iu,
  /(?:任务|工作|agent|员工|潜客|线索|数据).{0,12}(?:总览|统计|汇总|情况|状态)/iu,
  /(?:当前|现在|目前).{0,8}(?:没有|无|未).{0,12}(?:正在)?(?:执行|进行|运行)(?:的)?(?:任务|工作)?/u,
  /(?:当前|现在|目前).{0,4}(?:没有|无|未).{0,8}(?:任务|工作)/u
];
const CONTROL_PATTERNS = [/(?:暂停|停止|终止|取消|继续|恢复|重试).{0,8}(?:任务|执行|工作)?/u];
const UPDATE_PATTERNS = [/(?:范围|目标|条件|数量|时间|策略|话术|账号).{0,12}(?:改成|调整为|修改|换成|增加|减少|缩小|扩大)|(?:改成|调整为|修改|换成|增加|减少|缩小|扩大).{0,18}(?:范围|目标|条件|数量|时间|策略|话术|账号)/u];
const QUESTION_PATTERNS = [/[？?]$/u, /^(?:什么|为什么|怎么|如何|是否|能不能|可不可以|有哪些|哪里|在哪|谁|解释|告诉我)/u, /(?:是什么|什么意思|有什么能力|有影响吗|没问题吧)$/u];
const CAPABILITY_QUESTION_PATTERNS = [/(?:你|幕僚长).{0,8}(?:能|可以|会).{0,8}(?:做什么|帮我做什么|怎么帮我|提供什么)/u, /(?:你|幕僚长).{0,8}(?:有什么能力|职责是什么|负责什么)/u];
const PRODUCT_AGENT_SELECTIONS = Object.freeze([
  Object.freeze({ agentId: "mkt-comment-acquisition", labels: Object.freeze(["获客专家", "抖音获客管家"]) }),
  Object.freeze({ agentId: "mkt-find-people", labels: Object.freeze(["找客专员", "抖音找人管家"]) }),
  Object.freeze({ agentId: "mkt-intent-analyst", labels: Object.freeze(["客户分析员", "客户研究员", "抖音分析助手"]) }),
  Object.freeze({ agentId: "mkt-cold-writer", labels: Object.freeze(["潜客触达专员", "潜客激活专员", "私信运营", "抖音触达助手"]) }),
  Object.freeze({ agentId: "mkt-dm-inbox", labels: Object.freeze(["私信客服", "私信自动回复", "抖音对话助手"]) }),
  Object.freeze({ agentId: GOLD_CUSTOMER_SERVICE_AGENT_ID, labels: Object.freeze(["金牌客服", "快速接待客服"]) })
]);
const PRODUCT_AGENT_IDS = new Set(PRODUCT_AGENT_SELECTIONS.map(({ agentId }) => agentId));
const PRODUCT_AGENT_CAPABILITIES = Object.freeze({
  "mkt-find-people": Object.freeze(["douyin_account_discovery"]),
  "mkt-intent-analyst": Object.freeze(["douyin_comment_analysis"]),
  "mkt-cold-writer": Object.freeze(["douyin_private_outreach", "douyin_public_reply"]),
  "mkt-dm-inbox": Object.freeze(["douyin_inbox_reply"]),
  [GOLD_CUSTOMER_SERVICE_AGENT_ID]: Object.freeze(["douyin_inbox_reply"])
});
const PRODUCT_CAPABILITY_QUESTION_PATTERNS = [
  /(?:获客专家|找客专员|客户分析员|客户研究员|潜客触达专员|潜客激活专员|私信运营|私信客服|金牌客服|快速接待客服|抖音获客管家|抖音找人管家|抖音分析助手|抖音触达助手|私信自动回复|抖音对话助手).{0,12}(?:能|可以|会).{0,12}(?:做什么|帮我做什么|怎么帮我|提供什么)/u,
  /(?:获客专家|找客专员|客户分析员|客户研究员|潜客触达专员|潜客激活专员|私信运营|私信客服|金牌客服|快速接待客服|抖音获客管家|抖音找人管家|抖音分析助手|抖音触达助手|私信自动回复|抖音对话助手).{0,12}(?:有什么能力|职责是什么|负责什么)/u
];
const CONVERSATION_ONLY_PATTERNS = [
  /(?:不要|不需要|无需|不得|不).{0,12}(?:启动|创建|执行|安排|推进).{0,8}(?:任务|工作)/u,
  /(?:只|仅).{0,16}(?:聊天|说明|回答|告诉我).{0,16}(?:不要|不需要|无需|不).{0,8}(?:任务|执行|安排|推进)?/u,
  /(?:只|仅)做.{0,12}(?:说明|回答|验收|测试).{0,16}(?:不要|不需要|无需|不).{0,8}(?:启动|创建|执行|安排|推进)/u
];
const TASK_PATTERNS = [/(?:帮我|请|现在|开始|安排|生成|制定|整理|分析|筛选|查找|寻找|找|发送|私信|回复|触达|执行|导出|上传)/u];
const DISCOVERY_PATTERNS = [/(?:抖音|博主|账号|达人|用户|客户|潜客).{0,18}(?:找|寻找|搜索|筛选|发现)/u, /(?:找|寻找|搜索|筛选|发现).{0,18}(?:抖音|博主|账号|达人|用户|客户|潜客)/u];
const OUTREACH_PATTERNS = [/(?:发送|发|私信|触达|联系|外联|公开回复|评论回复|回复).{0,24}(?:用户|客户|潜客|名单|这些|消息|你好)?/u];
const NO_OUTREACH_PATTERNS = [/(?:不要|不需要|无需|不得|不).{0,8}(?:联系|发送|私信|触达|外联|回复)/u];
const HIGH_RISK_PATTERNS = [
  /(?:承诺|保证).{0,16}(?:退款|最低价|价格|优惠|库存|合同|收益|效果)/u,
  /(?:投诉|威胁|律师|法律|平台处罚|封号)/u,
  /(?:已经|明确).{0,8}(?:拒绝|拉黑|退订|不联系|勿扰).{0,18}(?:继续|再次|还要).{0,8}(?:发送|私信|联系|触达)/u,
  /(?:删除|清空|永久移除|覆盖).{0,12}(?:全部|历史|成果|数据|策略)/u,
  /(?:身份证|银行卡|密码|验证码|敏感个人信息)/u
];

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanList(value) {
  const list = Array.isArray(value) ? value : value == null ? [] : [value];
  return [...new Set(list.map((item) => cleanText(String(item))).filter(Boolean))].slice(0, 32);
}

function requestedProductAgentId(text, value) {
  for (const selection of PRODUCT_AGENT_SELECTIONS) {
    if (selection.labels.some((label) => text.includes(label))) return selection.agentId;
  }
  const requested = cleanText(value);
  return PRODUCT_AGENT_IDS.has(requested) ? requested : "";
}

function incompatibleRequestedCapabilities(agentId, capabilities) {
  if (!agentId || agentId === "mkt-comment-acquisition") return [];
  const covered = new Set(PRODUCT_AGENT_CAPABILITIES[agentId] || []);
  return capabilities.filter((capability) => !covered.has(capability));
}

function incompatibleAgentMessage(agentId, capabilities) {
  const name = PRODUCT_AGENT_SELECTIONS.find((selection) => selection.agentId === agentId)?.labels[0] || "指定 Agent";
  const capabilityNames = {
    douyin_account_discovery: "找人",
    douyin_comment_analysis: "分析",
    douyin_private_outreach: "私信触达",
    douyin_public_reply: "公开回复",
    douyin_inbox_reply: "私信承接"
  };
  const labels = capabilities.map((capability) => capabilityNames[capability] || capability).join("、");
  return `${name}不覆盖${labels}能力`;
}

function matchesAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function inferredIntent(text) {
  if (matchesAny(text, CONVERSATION_ONLY_PATTERNS)) return CHIEF_INTENTS.CONVERSATION;
  if (matchesAny(text, CONTROL_PATTERNS)) return CHIEF_INTENTS.TASK_CONTROL;
  if (matchesAny(text, STATUS_PATTERNS)) return CHIEF_INTENTS.STATUS_QUERY;
  if (matchesAny(text, UPDATE_PATTERNS)) return CHIEF_INTENTS.TASK_UPDATE;
  if (matchesAny(text, CAPABILITY_QUESTION_PATTERNS)) return CHIEF_INTENTS.CONVERSATION;
  if (matchesAny(text, QUESTION_PATTERNS) && !matchesAny(text, TASK_PATTERNS)) return CHIEF_INTENTS.CONVERSATION;
  if (matchesAny(text, TASK_PATTERNS)) return CHIEF_INTENTS.TASK;
  return CHIEF_INTENTS.CONVERSATION;
}

function lockedIntent(text) {
  if (matchesAny(text, CONVERSATION_ONLY_PATTERNS)) return CHIEF_INTENTS.CONVERSATION;
  if (matchesAny(text, CONTROL_PATTERNS)) return CHIEF_INTENTS.TASK_CONTROL;
  if (matchesAny(text, STATUS_PATTERNS)) return CHIEF_INTENTS.STATUS_QUERY;
  if (matchesAny(text, UPDATE_PATTERNS)) return CHIEF_INTENTS.TASK_UPDATE;
  if (matchesAny(text, CAPABILITY_QUESTION_PATTERNS)) return CHIEF_INTENTS.CONVERSATION;
  return null;
}

function inferredCapabilities(text) {
  const capabilities = [];
  if (matchesAny(text, DISCOVERY_PATTERNS)) capabilities.push("douyin_account_discovery");
  if (/(?:评论|直播|账号|作品|互动).{0,18}(?:筛选|分析|挖掘|判断|评估)|(?:筛选|分析|挖掘|判断|评估).{0,18}(?:评论|直播|账号|作品|互动|意向|潜客)/u.test(text)) {
    capabilities.push("douyin_comment_analysis");
  }
  if (matchesAny(text, OUTREACH_PATTERNS) && !matchesAny(text, NO_OUTREACH_PATTERNS)) capabilities.push("douyin_private_outreach");
  if (/(?:私信).{0,12}(?:承接|监听|自动回复|接待|咨询)|(?:承接|监听|自动回复|接待).{0,12}(?:私信|咨询|后续)/u.test(text)) {
    capabilities.push("douyin_inbox_reply");
  }
  return [...new Set(capabilities)];
}

function deterministicRisk(text, capabilities) {
  if (matchesAny(text, HIGH_RISK_PATTERNS)) return "high";
  if (capabilities.some((item) => ["douyin_private_outreach", "douyin_public_reply"].includes(item))) return "bounded_external";
  return "low";
}

function responseModeFor({ intent, riskLevel, blockingMissing }) {
  if (blockingMissing.length) return CHIEF_RESPONSE_MODES.SUPPLEMENT_CARD;
  if (riskLevel === "high") return CHIEF_RESPONSE_MODES.RISK_CARD;
  if ([CHIEF_INTENTS.CONVERSATION, CHIEF_INTENTS.SUPPLEMENT].includes(intent)) return CHIEF_RESPONSE_MODES.TEXT;
  if (intent === CHIEF_INTENTS.STATUS_QUERY) return CHIEF_RESPONSE_MODES.STATUS_CARD;
  if (intent === CHIEF_INTENTS.TASK_CONTROL) return CHIEF_RESPONSE_MODES.STATUS_CARD;
  if (riskLevel === "bounded_external") return CHIEF_RESPONSE_MODES.APPROVAL_CARD;
  return CHIEF_RESPONSE_MODES.TASK_CARD;
}

function confirmationPolicyFor(riskLevel) {
  if (riskLevel === "high") return CHIEF_CONFIRMATION_POLICIES.BLOCKING;
  if (riskLevel === "bounded_external") return CHIEF_CONFIRMATION_POLICIES.ONCE_PER_TASK;
  return CHIEF_CONFIRMATION_POLICIES.NONE;
}

export function normalizeChiefDecision(input = {}, { input: rawInput = "" } = {}) {
  const text = cleanText(rawInput);
  const productCapabilityQuestion = matchesAny(text, PRODUCT_CAPABILITY_QUESTION_PATTERNS);
  const inferred = productCapabilityQuestion ? CHIEF_INTENTS.CONVERSATION : inferredIntent(text);
  const deterministicIntent = productCapabilityQuestion ? CHIEF_INTENTS.CONVERSATION : lockedIntent(text);
  const conversationOnly = matchesAny(text, CONVERSATION_ONLY_PATTERNS);
  const requestedIntent = deterministicIntent
    || (Object.values(CHIEF_INTENTS).includes(input.intent) ? input.intent : inferred);
  const requestedCapabilities = conversationOnly ? [] : cleanList(input.requiredCapabilities).length
    ? cleanList(input.requiredCapabilities)
    : inferredCapabilities(text);
  const requiredCapabilities = deterministicIntent === CHIEF_INTENTS.CONVERSATION
    && (matchesAny(text, CAPABILITY_QUESTION_PATTERNS) || productCapabilityQuestion)
    ? []
    : requestedCapabilities;
  const requestedAgentId = requestedProductAgentId(text, input.requestedAgentId);
  const incompatibleCapabilities = incompatibleRequestedCapabilities(requestedAgentId, requiredCapabilities);
  const deterministic = deterministicRisk(text, requiredCapabilities);
  const requestedRisk = conversationOnly
    ? "low"
    : ["low", "bounded_external", "high"].includes(input.riskLevel) ? input.riskLevel : deterministic;
  const riskLevel = deterministic === "high" ? "high" : requestedRisk;
  const blockingMissing = [...new Set([
    ...cleanList(input.blockingMissing),
    ...(incompatibleCapabilities.length ? [incompatibleAgentMessage(requestedAgentId, incompatibleCapabilities)] : [])
  ])];
  const optionalMissing = cleanList(input.optionalMissing);
  const defaultsApplied = cleanList(input.defaultsApplied);
  const confirmationPolicy = riskLevel === "high"
    ? CHIEF_CONFIRMATION_POLICIES.BLOCKING
    : confirmationPolicyFor(riskLevel);
  const responseMode = responseModeFor({ intent: requestedIntent, riskLevel, blockingMissing });
  const taskIntent = requestedIntent === CHIEF_INTENTS.TASK;

  return Object.freeze({
    intent: requestedIntent,
    responseMode,
    riskLevel,
    confirmationPolicy,
    requiredCapabilities,
    requestedAgentId: requestedAgentId || null,
    incompatibleCapabilities,
    blockingMissing,
    optionalMissing,
    defaultsApplied,
    taskAction: cleanText(input.taskAction),
    userMessage: cleanText(input.userMessage),
    confidence: Number.isFinite(Number(input.confidence)) ? Math.max(0, Math.min(1, Number(input.confidence))) : null,
    shouldCreateTask: taskIntent && riskLevel !== "high" && blockingMissing.length === 0
  });
}

export function classifyChiefInput(input) {
  const text = cleanText(input);
  const intent = matchesAny(text, STATUS_PATTERNS)
    ? CHIEF_INTENTS.STATUS_QUERY
    : CHIEF_INTENTS.CONVERSATION;

  // The chief is a read-only operations concierge. Task planning, execution,
  // and task controls remain explicit entry points owned by specialist surfaces.
  return normalizeChiefDecision({
    intent,
    riskLevel: "low",
    requiredCapabilities: []
  }, { input: "" });
}
