import assert from "node:assert/strict";
import test from "node:test";
import { createControlPlane } from "../backend/control-plane.js";
import {
  buildAssignmentHandoff,
  companionTaskFacts,
  handoffsForAssignmentExecution
} from "../src/salebuddy/runtime/assignment-handoff.js";

function assignmentTask() {
  return {
    taskId: "handoff-task",
    taskRunId: "handoff-run",
    conversationId: "handoff-conversation",
    goal: "找出并判断新能源车潜客",
    state: "RUNNING",
    version: 0,
    currentSeq: 0,
    agentId: "chief_of_staff",
    tenantId: null,
    createdAt: "2026-09-13T08:00:00.000Z",
    updatedAt: "2026-09-13T08:00:00.000Z",
    requirements: { confirmed: true, status: "CONFIRMED", proposal: {} },
    workflow: { requiresAccess: true },
    configuration: {
      version: 1,
      executionConfig: { sourceScope: { kind: "authorized_account_interactions" }, approvalMode: "review" }
    },
    executionContext: {},
    assignment: {
      status: "RUNNING",
      execution: {
        status: "RUNNING",
        startedAt: "2026-09-13T08:00:00.000Z",
        completedAt: null,
        steps: [
          {
            id: "step-find", index: 0, agentId: "mkt-find-people", agentName: "找客专员",
            taskRunId: "handoff-run:find", dependsOn: [], status: "RUNNING", attempts: 1,
            startedAt: "2026-09-13T08:00:00.000Z", completedAt: null, failedAt: null, handoff: null
          },
          {
            id: "step-analyze", index: 1, agentId: "mkt-intent-analyst", agentName: "客户分析员",
            taskRunId: "handoff-run:analyze", dependsOn: ["mkt-find-people"], status: "PENDING", attempts: 0,
            startedAt: null, completedAt: null, failedAt: null, handoff: null
          },
          {
            id: "step-analyze-again", index: 2, agentId: "mkt-intent-analyst", agentName: "客户分析员",
            taskRunId: "handoff-run:analyze-again", dependsOn: ["mkt-intent-analyst"], status: "PENDING", attempts: 0,
            startedAt: null, completedAt: null, failedAt: null, handoff: null
          }
        ]
      }
    },
    pendingApproval: null,
    lastCommandId: "seed"
  };
}

test("handoff packages redact credentials and select the exact next assignment step", () => {
  const task = assignmentTask();
  const finder = task.assignment.execution.steps[0];
  finder.status = "COMPLETED";
  finder.handoff = buildAssignmentHandoff({
    task,
    step: finder,
    successorSteps: [task.assignment.execution.steps[1]],
    createdAt: "2026-09-13T08:05:00.000Z",
    payload: {
      summary: "找到了 2 位待分析潜客",
      qualifiedLeads: [{ id: "lead-1", content: "想了解分期" }],
      accessToken: "must-not-leak",
      evidence: { cookie: "must-not-leak", source: "直播间" }
    }
  });

  const firstAnalysis = handoffsForAssignmentExecution(task, {
    agentId: "mkt-intent-analyst",
    stepId: "step-analyze",
    taskRunId: "handoff-run:analyze"
  });
  const repeatedAnalysis = handoffsForAssignmentExecution(task, {
    agentId: "mkt-intent-analyst",
    stepId: "step-analyze-again",
    taskRunId: "handoff-run:analyze-again"
  });
  const mismatchedTarget = handoffsForAssignmentExecution(task, {
    agentId: "mkt-intent-analyst",
    stepId: "step-analyze",
    taskRunId: "handoff-run:analyze-again"
  });
  const missingStepTarget = handoffsForAssignmentExecution(task, {
    agentId: "mkt-intent-analyst",
    stepId: "step-that-does-not-exist",
    taskRunId: "handoff-run:analyze"
  });
  assert.equal(firstAnalysis.length, 1);
  assert.equal(repeatedAnalysis.length, 0);
  assert.equal(mismatchedTarget.length, 0);
  assert.equal(missingStepTarget.length, 0);
  assert.equal(firstAnalysis[0].outputs.accessToken, undefined);
  assert.equal(firstAnalysis[0].outputs.evidence.cookie, undefined);
  assert.equal(firstAnalysis[0].outputs.qualifiedLeads[0].id, "lead-1");

  const facts = companionTaskFacts(task, { agentId: "mkt-intent-analyst", taskRunId: "handoff-run:analyze" });
  assert.equal(facts.incomingHandoffs.length, 1);
  assert.equal(facts.incomingHandoffs[0].from.agentId, "mkt-find-people");
});

test("a real terminal executor receipt persists a handoff before the successor is dispatched", async t => {
  const dispatched = [];
  const plane = createControlPlane({
    now: () => "2026-09-13T08:10:00.000Z",
    requirementService: null,
    taskDispatcher: {
      async dispatch(input) {
        dispatched.push(input);
        return { dispatched: true, source: "test" };
      }
    }
  });
  const task = assignmentTask();
  plane.persistence.saveTask(task);
  t.after(() => plane.assignmentRuns.clear());

  plane.ingestExecutionEvents({
    taskId: task.taskId,
    source: "test",
    events: [{
      eventId: "find-completed",
      type: "task.completed",
      taskId: task.taskId,
      taskRunId: "handoff-run:find",
      agentId: "mkt-find-people",
      payload: {
        assignmentStepId: "step-find",
        summary: "完成候选名单",
        qualifiedLeads: [{ id: "lead-1" }],
        refreshToken: "must-not-leak"
      }
    }]
  });
  await new Promise(resolve => setImmediate(resolve));

  const snapshot = plane.getTaskSnapshot(task.taskId);
  const finder = snapshot.assignment.execution.steps.find(step => step.id === "step-find");
  assert.equal(finder.status, "COMPLETED");
  assert.equal(finder.handoff.outputs.refreshToken, undefined);
  assert.equal(finder.handoff.outputs.qualifiedLeads[0].id, "lead-1");
  assert.ok(plane.listTaskEvents(task.taskId).some(event => event.type === "agent.stage.handoff.ready"));
  assert.equal(dispatched.length, 1);
  assert.equal(dispatched[0].executionTarget.stepId, "step-analyze");
  assert.equal(dispatched[0].task.assignment.execution.steps[0].handoff.from.agentId, "mkt-find-people");
});
