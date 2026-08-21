import { getAgentManifest } from "../agents/agent-foundation.js";

export const WORKFLOW_IDS = Object.freeze({
  FIND_ONLY: "find_only",
  FIND_AND_OUTREACH: "find_and_outreach"
});

const FIND_AGENT_IDS = Object.freeze([
  "chief_of_staff",
  "acquisition_strategist",
  "lead_miner",
  "lead_analyst",
  "prospect_researcher",
  "risk_specialist"
]);

const OUTREACH_AGENT_IDS = Object.freeze([
  ...FIND_AGENT_IDS.slice(0, 5),
  "sales_consultant",
  "risk_specialist",
  "outreach_specialist",
  "outreach_operator"
]);

const WORKFLOW_DEFINITIONS = deepFreeze({
  [WORKFLOW_IDS.FIND_ONLY]: {
    id: WORKFLOW_IDS.FIND_ONLY,
    displayName: "找人工作流",
    description: "从公开抖音视频与评论发现、分析、研究并筛选潜客，不读取账号私域数据，不执行触达。",
    agentIds: FIND_AGENT_IDS,
    requiresAccess: false,
    allowsOutreach: false,
    completionAgent: "risk_specialist",
    approvalBefore: null,
    tools: ["account.resolve", "spider.video_list", "spider.comments", "lead.normalize", "lead.score", "policy.check"]
  },
  [WORKFLOW_IDS.FIND_AND_OUTREACH]: {
    id: WORKFLOW_IDS.FIND_AND_OUTREACH,
    displayName: "找人并触达工作流",
    description: "先完成公开线索发现与研究，再在授权和审批后生成并执行触达。",
    agentIds: OUTREACH_AGENT_IDS,
    requiresAccess: true,
    allowsOutreach: true,
    completionAgent: "outreach_operator",
    approvalBefore: "outreach_operator",
    tools: ["account.resolve", "spider.video_list", "spider.comments", "lead.normalize", "lead.score", "policy.check", "douyin.rpa"]
  }
});

const WORKFLOW_AGENT_CONTRACTS = Object.freeze({
  chief_of_staff: {
    skillId: "requirement_understanding",
    skill: "需求理解与任务编排",
    executor: "LLM + policy",
    acceptance: "目标、边界、验收标准和工作流已确认"
  },
  acquisition_strategist: {
    skillId: "acquisition_strategy",
    skill: "账号发现与解析",
    executor: "LLM + strategy tools",
    capabilities: ["account_resolution", "acquisition_planning"],
    acceptance: "账号身份、来源、人群、信号和时间范围已转成可执行检索计划"
  },
  lead_miner: {
    skillId: "public_prospect_discovery",
    skill: "公开线索发现",
    executor: "Spider API",
    acceptance: "视频、评论、作者和来源时间可追溯"
  },
  lead_analyst: {
    skillId: "lead_signal_analysis",
    skill: "线索信号分析",
    executor: "LLM + scoring policy",
    acceptance: "每条线索的意向信号、评分和依据可解释"
  },
  prospect_researcher: {
    skillId: "public_prospect_research",
    skill: "公开客户研究",
    executor: "LLM + public data tools",
    acceptance: "客户画像、购买信号和信息缺口有证据"
  },
  sales_consultant: {
    skillId: "sales_strategy",
    skill: "销售推进策略",
    executor: "LLM + sales policy",
    acceptance: "下一步推进策略与客户阶段匹配"
  },
  risk_specialist: {
    skillId: "lead_risk_review",
    skill: "线索风险筛选",
    executor: "deterministic policy + LLM explanation",
    acceptance: "重复、拒绝、不可触达和数据风险已明确"
  },
  outreach_specialist: {
    skillId: "outreach_strategy",
    skill: "触达策略",
    executor: "LLM + approval policy",
    acceptance: "触达顺序、理由、草稿和审批项已生成"
  },
  outreach_operator: {
    skillId: "outreach_execution",
    skill: "触达执行与反馈",
    executor: "Douyin RPA connector",
    acceptance: "仅执行已审批动作并回传送达、失败和回复事件"
  }
});

export function getWorkflowDefinition(workflowId) {
  const definition = WORKFLOW_DEFINITIONS[normalizeWorkflowId(workflowId)];
  return definition ? clone(definition) : null;
}

export function selectWorkflowForRequirement(requirement = {}, options = {}) {
  const classification = classifyRequirement(requirement, options);
  const wantsOutreach = classification.requiresExternalAccess;
  return getWorkflowDefinition(wantsOutreach ? WORKFLOW_IDS.FIND_AND_OUTREACH : WORKFLOW_IDS.FIND_ONLY);
}

export function requirementRequiresExternalAccess(requirement = {}, options = {}) {
  return classifyRequirement(requirement, options).requiresExternalAccess;
}

export function assignmentPlanForWorkflow(workflowId) {
  const workflow = getWorkflowDefinition(workflowId);
  if (!workflow) throw new Error(`Unknown Byering workflow: ${workflowId}`);
  return workflow.agentIds.map((agentId, index) => {
    const manifest = getAgentManifest(agentId);
    const contract = WORKFLOW_AGENT_CONTRACTS[agentId];
    return {
      index,
      agentId,
      skillId: contract.skillId,
      skill: contract.skill,
      role: manifest.role,
      mission: manifest.mission,
      agentType: agentId,
      agentName: manifest.displayName,
      executor: contract.executor,
      inputContract: manifest.outputSchema?.required ? [...manifest.outputSchema.required] : [],
      outputContract: Object.keys(manifest.outputSchema?.properties || {}),
      capabilities: contract.capabilities ? [...contract.capabilities] : [],
      acceptance: contract.acceptance,
      requiresAccess: workflow.requiresAccess && ["outreach_operator"].includes(agentId)
    };
  });
}

function normalizeWorkflowId(value) {
  return typeof value === "string" ? value.trim() : "";
}

function textValue(value) {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object") {
    return [value.label, value.value, value.text].find((item) => typeof item === "string" && item.trim())?.trim() || "";
  }
  return "";
}

const OUTREACH_TOKENS = Object.freeze(["触达", "私信", "发送", "跟进", "联系", "回复", "外联", "outreach", "message", "send", "touch", "dm"]);
const PUBLIC_ONLY_ACTION_PATTERNS = Object.freeze([
  /只读/,
  /read[- ]only/i,
  /不(?:读取|访问|打开|登录|连接).{0,12}(?:私域|私信|账号|账户|授权|权限)/,
  /不(?:自动|主动|直接)?(?:执行|进行|发送|发起).{0,10}(?:私信|私触|触达|跟进|外联)/,
  /不得.{0,10}(?:私信|私触|触达|发送|跟进|外联)/,
  /(?:无需|不需要).{0,8}(?:授权|登录|云电脑|账号)/
]);
const PUBLIC_ONLY_NEGATIVE_PATTERNS = Object.freeze([
  /不(?:读取|访问|打开|登录|连接).{0,12}(?:私域|私信|账号|账户|授权|权限)/,
  /不(?:自动|主动|直接)?(?:发送|发起)/,
  /不(?:自动|主动|直接)?(?:执行|进行|发送|发起).{0,10}(?:私信|私触|触达|跟进|外联)/,
  /不得.{0,10}(?:私信|私触|触达|发送|跟进|外联)/,
  /(?:无需|不需要).{0,8}(?:授权|登录|云电脑|账号)/
]);
const PUBLIC_ONLY_BOUNDARY_PATTERNS = Object.freeze([
  /只读/,
  /read[- ]only/i,
  /仅(?:使用|分析|采集|抓取).{0,24}公开/,
  /不(?:读取|访问|打开|登录|连接).{0,12}(?:私域|私信|账号|账户|授权|权限)/,
  /不得.{0,10}(?:私信|私触|触达|发送|跟进|外联)/,
  /(?:无需|不需要).{0,8}(?:授权|登录|云电脑|账号)/
]);

const PUBLIC_ONLY_CONDITIONAL_PATTERNS = Object.freeze([
  /(?:后续|之后|后面|下一步|如需|若需|待|另行|单独).{0,28}(?:触达|跟进|私信|发送|联系|回复|外联).{0,24}(?:确认|审批|决定|复核|评估|选择)?/,
  /(?:触达|跟进|私信|发送|联系|回复|外联)(?:方式|计划|安排)?(?:需|须).{0,10}(?:另行|单独|待|后续).{0,12}(?:确认|审批|决定|复核|评估)/,
  /(?:确认|审批|复核|评估).{0,20}(?:后再决定|再决定|另行决定|是否).{0,24}(?:触达|跟进|私信|发送|联系|回复|外联)/,
  /(?:人工复核|合规复核|合规决策|项目组复核).{0,24}(?:触达|跟进|私信|发送|联系|回复|外联|决策)/
]);
const EXPLICIT_EXTERNAL_ACTION_PATTERNS = Object.freeze([
  /(?:审批后|确认后|授权后|用户确认后).{0,24}(?:发送|发起|私信|私聊|联系|回复|触达|跟进|外联)/,
  /(?:发送|发起|私信|私聊|联系|回复|触达|跟进|外联).{0,20}(?:首条|消息|评论|候选|潜客|客户|用户|名单)/,
  /(?:找人|找潜客|找客户|找线索|分析|采集|抓取|筛选).{0,12}(?:并|后).{0,12}(?:触达|跟进|联系|发送|私信|回复|外联)/,
  /(?:立即|主动|执行|进行|发起|开始|安排).{0,12}(?:触达|跟进|联系|外联|发送|私信|回复)/,
  /(?:访问|核验|验证|检查|连接|登录|授权).{0,12}(?:账号|账户|权限|抖音)/,
  /(?:发送|私信|私聊|评论区回复|直播互动|粉丝主页|历史互动|账号授权|账号登录|云电脑)/,
  /(?:发送|私信|联系|触达|跟进|回复).{0,20}(?:前|必须|需要).{0,12}(?:审批|确认|授权)/,
  /\b(?:outreach|send|message|dm|follow[- ]?up)\b/i
]);
const EXPLICIT_EXTERNAL_BOUNDARY_PATTERNS = Object.freeze([
  /(?:发送|发起|私信|私聊|回复|触达|跟进|外联).{0,20}(?:前|必须|需要).{0,12}(?:审批|确认|授权)/,
  /(?:需要|必须|申请).{0,8}(?:授权|登录|云电脑|账号)/
]);

function classifyRequirement(requirement = {}, options = {}) {
  const action = requirementActionText(requirement).toLowerCase();
  const boundary = requirementBoundaryText(requirement).toLowerCase();
  const goal = textValue(options.goal).toLowerCase();
  const intent = [requirement.intent, requirement.touchPlan?.intent]
    .map(textValue)
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const publicText = [action, boundary, goal, intent].filter(Boolean).join(" ");
  const conditionalPublic = PUBLIC_ONLY_CONDITIONAL_PATTERNS.some((pattern) => pattern.test(publicText));
  const explicitExternal = EXPLICIT_EXTERNAL_ACTION_PATTERNS.some((pattern) => pattern.test([action, intent].filter(Boolean).join(" ")))
    || (!PUBLIC_ONLY_NEGATIVE_PATTERNS.some((pattern) => pattern.test(goal))
      && EXPLICIT_EXTERNAL_ACTION_PATTERNS.some((pattern) => pattern.test(goal)))
    || EXPLICIT_EXTERNAL_BOUNDARY_PATTERNS.some((pattern) => pattern.test(boundary));
  const explicitPublicAction = PUBLIC_ONLY_ACTION_PATTERNS.some((pattern) => pattern.test(action));
  const explicitPublicNegativeAction = PUBLIC_ONLY_NEGATIVE_PATTERNS.some((pattern) => pattern.test(action));
  const explicitPublicNegativeBoundary = PUBLIC_ONLY_NEGATIVE_PATTERNS.some((pattern) => pattern.test(boundary));
  const explicitPublicBoundary = PUBLIC_ONLY_BOUNDARY_PATTERNS.some((pattern) => pattern.test(boundary));

  // Conditional language always wins over a generic noun such as "触达".
  // This keeps a read-only run public even when the proposal mentions a later
  // review, follow-up, or a possible outreach decision.
  if (conditionalPublic) return { requiresExternalAccess: false, reason: "conditional_public_boundary" };
  if (explicitPublicNegativeAction) return { requiresExternalAccess: false, reason: "public_negative_action" };
  if (explicitPublicAction && !explicitExternal) return { requiresExternalAccess: false, reason: "public_action" };
  if (explicitExternal) return { requiresExternalAccess: true, reason: "explicit_external_action" };
  if (explicitPublicNegativeBoundary) return { requiresExternalAccess: false, reason: "public_negative_boundary" };
  if (explicitPublicBoundary) return { requiresExternalAccess: false, reason: "public_boundary" };

  // Client hints are advisory only. A public task must contain an explicit
  // action requiring an account before it can enter the access workflow.
  return { requiresExternalAccess: false, reason: options.requiresAccess === true ? "unconfirmed_access_hint" : "public_default" };
}

function requirementActionText(requirement = {}) {
  return [
    requirement.action,
    requirement.touchPlan?.action
  ].map(textValue).filter(Boolean).join(" ");
}

function requirementBoundaryText(requirement = {}) {
  return [requirement.guardrail, requirement.scope, requirement.objective]
    .map(textValue)
    .filter(Boolean)
    .join(" ");
}

function requirementText(requirement = {}) {
  const fields = [
    requirement.title,
    requirement.objective,
    requirement.scope,
    requirement.deliverable,
    requirement.guardrail,
    requirement.intent,
    requirement.action,
    requirement.touchPlan?.source,
    requirement.touchPlan?.audience,
    requirement.touchPlan?.signal,
    requirement.touchPlan?.filter,
    requirement.touchPlan?.timeWindow,
    requirement.touchPlan?.intent,
    requirement.touchPlan?.relationship,
    requirement.touchPlan?.action
  ];
  return fields.map(textValue).filter(Boolean).join(" ");
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
