import test from "node:test";
import assert from "node:assert/strict";

import {
  WORKFLOW_IDS,
  getWorkflowDefinition,
  selectWorkflowForRequirement,
  assignmentPlanForWorkflow
} from "../src/salebuddy/runtime/workflow-definitions.js";

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
