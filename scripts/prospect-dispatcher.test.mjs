import assert from "node:assert/strict";
import test from "node:test";

import { createControlPlane } from "../backend/control-plane.js";
import { createTaskDispatcher } from "../backend/task-dispatcher.js";
import { createProspectWorkflowRunner } from "../backend/prospect-workflow-runner.js";

test("find-only workflow dispatches the public prospect executor without a cloud-account uid", async () => {
  const calls = [];
  let id = 0;
  const dispatcher = createTaskDispatcher({
    executionService: { configured: false, lease: async () => { throw new Error("RPA must not run"); } },
    prospectService: {
      kind: "prospect",
      configured: true,
      requiresExecutorUid: false,
      async lease(request) {
        calls.push(request);
        return {
          accepted: true,
          source: "prospect",
          events: [{
            eventId: "prospect:event:1",
            taskId: request.taskId,
            taskRunId: request.taskRunId,
            conversationId: request.conversationId,
            agentId: "lead_miner",
            type: "prospect.discovery.completed",
            payload: { stage: "lead_miner", status: "SUCCEEDED" }
          }]
        };
      }
    }
  });
  const plane = createControlPlane({
    idFactory: () => `prospect-${++id}`,
    requirementService: {
      async understand({ goal }) {
        return {
          schemaVersion: 1,
          source: "test",
          provider: "douyin",
          model: "fixture",
          generatedAt: "2026-08-20T00:00:00.000Z",
          title: "找人",
          objective: goal,
          scope: "公开抖音视频与评论",
          deliverable: "可追溯候选线索",
          guardrail: "不读取私域、不触达",
          missing: [],
          assumptions: [],
          confidence: 1
        };
      }
    },
    taskDispatcher: dispatcher
  });

  const created = await plane.dispatchAsync({ type: "task.create", payload: { goal: "找公开抖音潜客" } });
  const waiting = plane.dispatch({ type: "task.start", taskId: created.taskId, payload: { requirementsConfirmed: false } });
  const running = await plane.dispatchAsync({
    type: "task.requirement.confirm",
    taskId: created.taskId,
    expectedVersion: waiting.currentVersion,
    payload: { proposalVersion: created.data.requirement.proposalVersion }
  });
  assert.equal(running.state, "RUNNING");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].uid, undefined);
  assert.equal(calls[0].workflowId, undefined);
  assert.equal(plane.listTaskEvents(created.taskId).at(-1).type, "task.execution.dispatched");
  assert.equal(plane.listTaskEvents(created.taskId).some((event) => event.type === "prospect.discovery.completed"), true);
});

test("control plane completes the find-only Agent chain only after risk review", async () => {
  let id = 0;
  const rawProspect = {
    kind: "prospect",
    configured: true,
    requiresExecutorUid: false,
    async lease(request) {
      return {
        accepted: true,
        source: "prospect",
        status: "SUCCEEDED",
        resultSnapshot: {
          schemaVersion: 1,
          status: "completed",
          counts: { videos: 1, comments: 1, candidates: 1, qualified: 1 },
          videos: [{ videoId: "video-1", title: "车型介绍" }],
          leads: [{
            leadId: "lead-1",
            externalUserId: "user-1",
            secUid: "sec-1",
            uniqueId: "buyer-1",
            nickname: "小王",
            text: "请问多少钱？",
            score: 46,
            tier: "high",
            source: { type: "comment", videoId: "video-1", videoTitle: "车型介绍" },
            evidence: [{ type: "comment", quote: "请问多少钱？" }]
          }]
        },
        events: []
      };
    }
  };
  const dispatcher = createTaskDispatcher({
    executionService: { configured: false, lease: async () => { throw new Error("RPA must not run"); } },
    prospectService: createProspectWorkflowRunner({ prospectService: rawProspect })
  });
  const plane = createControlPlane({
    idFactory: () => `find-chain-${++id}`,
    requirementService: {
      async understand({ goal }) {
        return {
          schemaVersion: 1,
          source: "test",
          provider: "douyin",
          model: "fixture",
          generatedAt: "2026-08-20T00:00:00.000Z",
          title: "公开找人",
          objective: goal,
          scope: "公开抖音视频与评论",
          deliverable: "候选线索和证据",
          guardrail: "不读取私域、不触达",
          missing: [],
          assumptions: [],
          confidence: 1
        };
      }
    },
    taskDispatcher: dispatcher
  });

  const created = await plane.dispatchAsync({ type: "task.create", payload: { goal: "找公开抖音潜客" } });
  const waiting = plane.dispatch({ type: "task.start", taskId: created.taskId, payload: { requirementsConfirmed: false } });
  const completed = await plane.dispatchAsync({
    type: "task.requirement.confirm",
    taskId: created.taskId,
    expectedVersion: waiting.currentVersion,
    payload: { proposalVersion: created.data.requirement.proposalVersion }
  });
  const snapshot = plane.getTaskSnapshot(created.taskId);
  assert.equal(completed.state, "RUNNING");
  assert.equal(snapshot.state, "SUCCEEDED");
  assert.equal(snapshot.resultSnapshot.workflow.completedAgentId, "risk_specialist");
  assert.equal(plane.listTaskEvents(created.taskId).some((event) => event.type === "task.completed"), true);
  assert.equal(plane.listTaskEvents(created.taskId).at(-1).type, "task.execution.dispatched");
});

test("an unconfigured prospect workflow fails closed instead of being treated as no-op", () => {
  const runner = createProspectWorkflowRunner({ prospectService: null });
  const dispatcher = createTaskDispatcher({
    executionService: { configured: false, lease: async () => ({ accepted: true }) },
    prospectService: runner
  });
  assert.throws(
    () => dispatcher.assertReadyFor({
      command: { type: "task.requirement.confirm", payload: { requiresAccess: false } },
      task: { taskId: "task-unconfigured", state: "WAITING_REQUIREMENT", workflow: { id: "find_only" } }
    }),
    (error) => error.code === "PROSPECT_EXECUTOR_NOT_CONFIGURED" && error.statusCode === 503
  );
});
