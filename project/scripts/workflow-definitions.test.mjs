import test from "node:test";
import assert from "node:assert/strict";

import {
  EXECUTION_BOUNDARIES,
  WORKFLOW_IDS,
  buildCapabilityAssignmentPlan,
  getWorkflowDefinition,
  resolveExecutionBoundary,
  selectWorkflowForRequirement,
  assignmentPlanForWorkflow
} from "../src/salebuddy/runtime/workflow-definitions.js";

test("capability assignment uses the matching product Agent and never makes the chief an executor", () => {
  const plan = buildCapabilityAssignmentPlan({
    objective: "寻找 AI 科普博主并筛选",
    decision: {
      intent: "task",
      requiredCapabilities: ["douyin_account_discovery"],
      confirmationPolicy: "none"
    }
  });

  assert.equal(plan.missingCapabilities.length, 0);
  assert.deepEqual(plan.assignments.map((item) => item.agentId), ["mkt-find-people"]);
  assert.equal(plan.assignments[0].executionRole, "product_agent");
  assert.equal(plan.assignments[0].requiresAccess, false);
  assert.equal(plan.assignments.some((item) => item.agentId === "chief_of_staff"), false);
  assert.equal(plan.productRoute.orchestratorAgentId, "chief_of_staff");
});

test("capability assignment reports a real gap when no capable Agent is available", () => {
  const plan = buildCapabilityAssignmentPlan({
    objective: "给候选用户发送私信",
    decision: {
      intent: "task",
      requiredCapabilities: ["douyin_private_outreach"],
      confirmationPolicy: "once_per_task"
    }
  }, { availableAgentIds: ["chief_of_staff", "lead_analyst"] });

  assert.deepEqual(plan.missingCapabilities, ["douyin_private_outreach"]);
  assert.equal(plan.blocked, true);
  assert.equal(plan.assignments.some((item) => item.agentId === "outreach_operator"), false);
});

test("composed capability Agents expose the product handoff dependencies", () => {
  const plan = buildCapabilityAssignmentPlan({
    objective: "找人并分析",
    decision: { requiredCapabilities: ["douyin_account_discovery", "douyin_comment_analysis"] }
  });
  const analyst = plan.assignments.find((item) => item.agentId === "mkt-intent-analyst");
  assert.deepEqual(plan.assignments.map((item) => item.agentId), ["mkt-find-people", "mkt-intent-analyst"]);
  assert.equal(analyst.parallelGroup, "analyze");
  assert.deepEqual(analyst.dependsOn, ["mkt-find-people"]);
});

test("complete four-stage requests resolve to the complete-capability product Agent", () => {
  const plan = buildCapabilityAssignmentPlan({
    objective: "找人、分析、触达并承接私信",
    decision: {
      requiredCapabilities: [
        "douyin_account_discovery",
        "douyin_comment_analysis",
        "douyin_private_outreach",
        "douyin_inbox_reply"
      ]
    }
  });

  assert.equal(plan.productRoute.mode, "complete_capability");
  assert.deepEqual(plan.assignments.map((item) => item.agentId), ["mkt-comment-acquisition"]);
  assert.deepEqual(plan.assignments[0].covers, ["find", "analyze", "outreach", "conversation"]);
});

test("an explicitly requested product Agent blocks instead of being replaced by another capability Agent", () => {
  const plan = buildCapabilityAssignmentPlan({
    objective: "找一批新能源车潜客",
    decision: {
      requiredCapabilities: ["douyin_account_discovery"],
      requestedAgentId: "mkt-intent-analyst"
    }
  });

  assert.equal(plan.blocked, true);
  assert.equal(plan.productRoute.mode, "requested_product_incompatible");
  assert.deepEqual(plan.incompatibleCapabilities, ["douyin_account_discovery"]);
  assert.deepEqual(plan.assignments, []);
});

test("find-only requirements select a public prospecting workflow", () => {
  const workflow = selectWorkflowForRequirement({
    intent: "find",
    touchPlan: { source: { label: "抖音公开视频和评论" }, action: { label: "只找潜客" } }
  });

  assert.equal(workflow.id, WORKFLOW_IDS.FIND_ONLY);
  assert.deepEqual(workflow.agentIds, [
    "chief_of_staff",
    "acquisition_strategist",
    "lead_miner",
    "lead_analyst",
    "prospect_researcher",
    "risk_specialist"
  ]);
  assert.equal(workflow.requiresAccess, false);
  assert.equal(workflow.allowsOutreach, false);
  assert.ok(workflow.tools.includes("account.resolve"));
});

test("execution boundary distinguishes public discovery from an explicitly selected product Agent", () => {
  const requirement = {
    objective: "从公开抖音视频与评论中筛选潜客",
    scope: "公开抖音视频与评论",
    guardrail: "不读取私域、不触达",
    decision: { requiredCapabilities: ["douyin_account_discovery"] }
  };

  assert.equal(
    resolveExecutionBoundary(requirement, { goal: requirement.objective }),
    EXECUTION_BOUNDARIES.LEGACY_PUBLIC_DISCOVERY
  );
  assert.equal(
    resolveExecutionBoundary(requirement, {
      taskAgentId: "mkt-find-people",
      goal: requirement.objective
    }),
    EXECUTION_BOUNDARIES.PRODUCT_AGENTS
  );
});

test("an external account action selects the product-Agent boundary even without a named Agent", () => {
  const requirement = {
    objective: "登录已授权抖音账号后筛选互动人群",
    scope: "需要连接已授权抖音账号后读取直播间与评论",
    guardrail: "仅分析，不发送消息"
  };

  assert.equal(
    resolveExecutionBoundary(requirement, { goal: requirement.objective }),
    EXECUTION_BOUNDARIES.PRODUCT_AGENTS
  );
});

test("plan-only requirements stay with the chief of staff and do not open data executors", () => {
  const workflow = selectWorkflowForRequirement({
    objective: "制定本周抖音评论潜客筛选计划",
    scope: "仅输出任务拆解、Agent 分工和验收标准，不读取数据",
    deliverable: "一份可执行方案",
    guardrail: "不搜索账号，不发送消息",
    touchPlan: { action: "只做规划，不执行数据采集" }
  });

  assert.equal(workflow.id, WORKFLOW_IDS.PLAN_ONLY);
  assert.deepEqual(workflow.agentIds, ["chief_of_staff"]);
  assert.equal(workflow.requiresAccess, false);
  assert.equal(workflow.allowsOutreach, false);
  assert.deepEqual(workflow.tools, ["strategy_brief", "task_planner", "evidence_review"]);

  const assignments = assignmentPlanForWorkflow(WORKFLOW_IDS.PLAN_ONLY);
  assert.equal(assignments.length, 1);
  assert.equal(assignments[0].agentId, "chief_of_staff");
  assert.equal(assignments[0].skillId, "execution_planning");
});

test("plan-only wording in the server scope wins even when the action lists future workflow steps", () => {
  const workflow = selectWorkflowForRequirement({
    objective: "在不读取数据、不搜索账号、不发送消息的前提下，制定一份可执行的本周抖音获客执行计划",
    scope: "仅制定本周抖音获客执行计划；输出任务拆解、Agent分工、验收标准；不执行实际数据读取、账号搜索、消息发送或触达动作",
    deliverable: "本周抖音获客执行计划文档；任务拆解清单；Agent分工表；验收标准清单",
    guardrail: "不读取任何实际数据；不搜索任何抖音账号；不发送任何消息或执行触达",
    touchPlan: {
      action: "收集评论样本规则；建立高意向用户筛选标准；形成待触达用户名单结构模板；安排后续触达分工与流程；制定验收检查点"
    }
  });

  assert.equal(workflow.id, WORKFLOW_IDS.PLAN_ONLY);
});

test("find-and-outreach requirements keep execution agents after an explicit approval boundary", () => {
  const workflow = selectWorkflowForRequirement({
    intent: "find_and_outreach",
    touchPlan: { action: { label: "找人并触达" } }
  });

  assert.equal(workflow.id, WORKFLOW_IDS.FIND_AND_OUTREACH);
  assert.deepEqual(workflow.agentIds, [
    "chief_of_staff",
    "acquisition_strategist",
    "lead_miner",
    "lead_analyst",
    "prospect_researcher",
    "sales_consultant",
    "risk_specialist",
    "outreach_specialist",
    "outreach_operator"
  ]);
  assert.equal(workflow.requiresAccess, true);
  assert.equal(workflow.allowsOutreach, true);
  assert.equal(workflow.approvalBefore, "outreach_operator");
});

test("assignment plans expose one visible Agent per capability and never aggregate the find-only path", () => {
  const assignments = assignmentPlanForWorkflow(WORKFLOW_IDS.FIND_ONLY);

  assert.deepEqual(assignments.map((item) => item.agentId), [
    "chief_of_staff",
    "acquisition_strategist",
    "lead_miner",
    "lead_analyst",
    "prospect_researcher",
    "risk_specialist"
  ]);
  assert.ok(assignments.every((item) => item.skillId && item.inputContract.length && item.outputContract.length));
  assert.equal(assignments.some((item) => item.agentId === "outreach_operator"), false);
  assert.equal(assignments.some((item) => item.skillId === "lead_discovery"), false);
  const strategist = assignments.find((item) => item.agentId === "acquisition_strategist");
  assert.ok(strategist.capabilities.includes("account_resolution"));
});

test("unknown or incomplete requirement defaults to find-only without enabling external access", () => {
  const workflow = selectWorkflowForRequirement({});
  assert.equal(workflow.id, WORKFLOW_IDS.FIND_ONLY);
  assert.equal(getWorkflowDefinition("missing"), null);
});

test("explicit public-only boundaries override generic access hints", () => {
  const workflow = selectWorkflowForRequirement({
    intent: "识别公开评论中的购车意向",
    guardrail: "只使用公开信息，不读取私域，不执行触达",
    touchPlan: {
      action: "采集并整理公开评论；后续触达方式需另行确认，当前阶段不直接执行私触"
    }
  }, { requiresAccess: true });

  assert.equal(workflow.id, WORKFLOW_IDS.FIND_ONLY);
  assert.equal(workflow.requiresAccess, false);
  assert.equal(workflow.allowsOutreach, false);
});

test("deferred compliance language never opens the account gate", () => {
  const proposals = [
    "提交项目组确认后再决定是否进行合规后续触达",
    "不直接触达；后续如需联系需单独确认",
    "人工复核与合规触达决策",
    "待确认触达合规要求后再决定是否进行评论区回复或私信触达",
    "供项目组后续合规跟进"
  ];

  for (const action of proposals) {
    const workflow = selectWorkflowForRequirement({
      objective: "分析公开抖音视频和评论中的购车意向",
      guardrail: "仅使用公开信息，不执行当前触达",
      touchPlan: { action }
    }, { requiresAccess: true, goal: "分析指定抖音账号的公开视频和评论" });
    assert.equal(workflow.id, WORKFLOW_IDS.FIND_ONLY, action);
    assert.equal(workflow.requiresAccess, false, action);
  }
});

test("an explicit private action still opens the account gate despite a read-only guardrail", () => {
  const workflow = selectWorkflowForRequirement({
    objective: "筛选高意向客户",
    guardrail: "先只读分析，发送前必须人工审批",
    touchPlan: { action: "审批后发送首条私信给候选客户" }
  }, { requiresAccess: false });

  assert.equal(workflow.id, WORKFLOW_IDS.FIND_AND_OUTREACH);
  assert.equal(workflow.requiresAccess, true);
});

test("read-only preparation does not remove an explicit outreach action", () => {
  const workflow = selectWorkflowForRequirement({
    guardrail: "先只读分析，发送前必须人工审批",
    touchPlan: { action: "审批后发送首条私信" }
  });

  assert.equal(workflow.id, WORKFLOW_IDS.FIND_AND_OUTREACH);
  assert.equal(workflow.requiresAccess, true);
});
