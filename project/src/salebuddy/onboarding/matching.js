import { legacyAgentTypeFor } from "../agents/agent-runtime-adapter.js";
import { assignmentPlanForWorkflow, WORKFLOW_IDS, getWorkflowDefinition } from "../runtime/workflow-definitions.js";
import { IDENTITY_OPTIONS } from "./identity-options.js";
import { GOAL_OPTIONS } from "./goal-options.js";
import { agentNameForIndustry, goalOptionsForIndustry } from "./industry-variants.js";

const INDUSTRY_CONTEXT = Object.freeze({
  commerce: { focus: "商品兴趣与购买意向", signals: ["商品评论", "询价比价", "同类内容互动"] },
  "live-commerce": { focus: "直播间互动与即时转化", signals: ["直播互动", "停留与提问", "下单意向"] },
  knowledge: { focus: "内容兴趣与咨询需求", signals: ["课程问题", "专业内容互动", "咨询意向"] },
  community: { focus: "社群需求与成员活跃", signals: ["群体话题", "成员互动", "服务需求"] },
  automotive: { focus: "购车需求与服务意向", signals: ["车型讨论", "购车咨询", "售后需求"] },
  "real-estate": { focus: "区域置业与到访意向", signals: ["区域关注", "房源咨询", "看房需求"] },
  aesthetics: { focus: "项目咨询与到店意向", signals: ["项目了解", "价格咨询", "预约需求"] },
  education: { focus: "课程兴趣与报名意向", signals: ["课程咨询", "学习需求", "报名节点"] },
  "professional-services": { focus: "专业需求与决策角色", signals: ["业务问题", "方案咨询", "决策信号"] },
  "local-business": { focus: "本地消费与到店意向", signals: ["附近需求", "服务评价", "到店咨询"] },
  "brand-marketing": { focus: "品牌受众与内容反应", signals: ["品牌讨论", "内容互动", "合作意向"] },
  other: { focus: "公开需求与潜客信号", signals: ["内容互动", "问题表达", "联系意向"] }
});

const GOAL_CONTEXT = Object.freeze({
  "discover-leads": { workflowId: WORKFLOW_IDS.FIND_ONLY, focus: "扩大公开线索池", task: "发现更多匹配的潜在客户" },
  "high-intent": { workflowId: WORKFLOW_IDS.FIND_ONLY, focus: "筛选高意向线索", task: "优先找出更有成交可能的客户" },
  outreach: { workflowId: WORKFLOW_IDS.FIND_AND_OUTREACH, focus: "完成首次触达", task: "为高匹配客户准备并执行首次联系" },
  "follow-up": { workflowId: WORKFLOW_IDS.FIND_AND_OUTREACH, focus: "推进客户跟进", task: "围绕已联系客户安排下一步跟进" },
  reactivate: { workflowId: WORKFLOW_IDS.FIND_AND_OUTREACH, focus: "召回沉默客户", task: "识别并重新激活有机会的老客户" },
  explore: { workflowId: WORKFLOW_IDS.FIND_ONLY, focus: "了解数字员工能力", task: "用一条可追踪的找人任务体验团队协作" }
});

const AGENT_STAGE = Object.freeze({
  chief_of_staff: "目标拆解与统筹",
  acquisition_strategist: "获客策略",
  lead_miner: "公开线索发现",
  lead_analyst: "意向评分",
  prospect_researcher: "客户分析",
  sales_consultant: "销售推进策略",
  risk_specialist: "风险检查",
  outreach_specialist: "触达策略",
  outreach_operator: "触达执行"
});

function optionById(options, id, fallbackId) {
  return options.find((option) => option.id === id) || options.find((option) => option.id === fallbackId) || options[0];
}

function normalizeGoalIds(goalIds) {
  const ids = Array.isArray(goalIds) ? goalIds : [];
  const valid = ids.filter((id) => GOAL_OPTIONS.some((option) => option.id === id));
  return [...new Set(valid)];
}

export function buildOnboardingMatch({ identityId = "commerce", goalIds = ["high-intent", "outreach"] } = {}) {
  const identity = optionById(IDENTITY_OPTIONS, identityId, "commerce");
  const industryGoalOptions = goalOptionsForIndustry(identity.id);
  const normalizedGoalIds = normalizeGoalIds(goalIds);
  const goals = (normalizedGoalIds.length ? normalizedGoalIds : ["high-intent"])
    .map((id) => optionById(industryGoalOptions, id, "high-intent"));
  const goalContext = goals.map((goal) => GOAL_CONTEXT[goal.id] || GOAL_CONTEXT.explore);
  const workflowId = goalContext.some((context) => context.workflowId === WORKFLOW_IDS.FIND_AND_OUTREACH)
    ? WORKFLOW_IDS.FIND_AND_OUTREACH
    : WORKFLOW_IDS.FIND_ONLY;
  const workflow = getWorkflowDefinition(workflowId);
  const industry = INDUSTRY_CONTEXT[identity.id] || INDUSTRY_CONTEXT.other;
  const primaryGoal = goals[0];
  const agents = assignmentPlanForWorkflow(workflowId).map((plan) => ({
    id: plan.agentId,
    canonicalId: plan.agentId,
    legacyType: legacyAgentTypeFor(plan.agentId),
    name: agentNameForIndustry(identity.id, plan.agentId, plan.agentName),
    role: plan.role,
    mission: plan.mission,
    stage: AGENT_STAGE[plan.agentId] || plan.skill,
    skill: plan.skill,
    requiresAccess: plan.requiresAccess
  }));

  return {
    version: 1,
    identityId: identity.id,
    businessType: identity.label,
    industryFocus: industry.focus,
    industrySignals: [...industry.signals],
    goalIds: goals.map((goal) => goal.id),
    goalLabels: goals.map((goal) => goal.label),
    primaryGoal: { id: primaryGoal.id, label: primaryGoal.label },
    goalFocus: goals.map((goal) => goal.label).join("、"),
    taskObjective: goalContext.map((context, index) => `${goals[index].label}：${context.task}`).join("；"),
    workflowId,
    workflowName: workflow.displayName,
    requiresAccess: workflow.requiresAccess,
    agentIds: agents.map((agent) => agent.id),
    agents
  };
}

export function onboardingMatchFromStorage(storage = globalThis.sessionStorage) {
  try {
    const raw = storage?.getItem?.("byering-onboarding-match");
    if (!raw) return null;
    const match = JSON.parse(raw);
    return match?.version === 1 && Array.isArray(match.agents) ? match : null;
  } catch {
    return null;
  }
}

export { INDUSTRY_CONTEXT, GOAL_CONTEXT };
