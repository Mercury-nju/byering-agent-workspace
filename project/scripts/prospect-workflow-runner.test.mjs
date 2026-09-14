import assert from "node:assert/strict";
import test from "node:test";

import { createProspectWorkflowRunner } from "../backend/prospect-workflow-runner.js";

const request = {
  taskId: "task-find-1",
  taskRunId: "run-find-1",
  conversationId: "conversation-find-1",
  goal: "从公开抖音评论中找出有购车意向的客户"
};

function rawResult(status = "SUCCEEDED") {
  const lead = {
    leadId: "douyin-user-1",
    externalUserId: "douyin-user-1",
    secUid: "sec-user-1",
    uniqueId: "buyer_1",
    nickname: "小王",
    text: "请问这款车多少钱？",
    score: 46,
    tier: "high",
    source: { type: "comment", videoId: "video-1", videoTitle: "车型介绍" },
    evidence: [{ type: "comment", quote: "请问这款车多少钱？" }]
  };
  return {
    accepted: true,
    source: "prospect",
    status,
    resultSnapshot: {
      schemaVersion: 1,
      status: status.toLowerCase(),
      counts: { videos: 1, comments: 1, candidates: 1, qualified: 1 },
      videos: [{ videoId: "video-1", title: "车型介绍" }],
      leads: [lead],
      qualified: [lead]
    },
    events: [{
      eventId: "raw-lead-miner-complete",
      taskId: request.taskId,
      taskRunId: request.taskRunId,
      conversationId: request.conversationId,
      agentId: "lead_miner",
      skillId: "public_prospect_discovery",
      type: "prospect.discovery.completed",
      seq: 1,
      payload: { stage: "lead_miner", status, resultSnapshot: null }
    }]
  };
}

test("find-only workflow runs each public-data Agent in order and owns the terminal event", async () => {
  const rawCalls = [];
  const runner = createProspectWorkflowRunner({
    prospectService: {
      kind: "prospect",
      configured: true,
      requiresExecutorUid: false,
      async lease(input) {
        rawCalls.push(input);
        return rawResult();
      }
    }
  });

  const result = await runner.lease(request);
  assert.equal(rawCalls.length, 1);
  assert.equal(result.source, "prospect");
  assert.equal(result.status, "SUCCEEDED");
  const completed = result.events.filter((event) => event.type === "agent.stage.completed");
  assert.deepEqual(completed.map((event) => event.agentId), [
    "lead_miner",
    "lead_analyst",
    "prospect_researcher",
    "risk_specialist"
  ]);
  assert.equal(result.events.at(-1).type, "task.completed");
  assert.equal(result.events.at(-1).agentId, "risk_specialist");
  assert.equal(result.resultSnapshot.workflow.id, "find_only");
  assert.equal(result.resultSnapshot.workflow.completedAgentId, "risk_specialist");
  assert.equal(result.resultSnapshot.leads[0].publicBrief.videoTitle, "车型介绍");
  assert.equal(result.resultSnapshot.leads[0].risk.status, "clear");
});

test("account resolution is represented as the acquisition strategist stage", async () => {
  const runner = createProspectWorkflowRunner({
    prospectService: {
      configured: true,
      requiresExecutorUid: false,
      async lease() {
        return {
          ...rawResult(),
          events: [{
            eventId: "account-resolved-1",
            taskId: request.taskId,
            taskRunId: request.taskRunId,
            conversationId: request.conversationId,
            agentId: "acquisition_strategist",
            skillId: "account_resolution",
            type: "account.resolved",
            payload: { account: { uid: "u-1", secId: "s-1", nickname: "目标账号" } }
          }]
        };
      }
    }
  });
  const result = await runner.lease(request);
  const stages = result.events.filter((event) => event.type === "agent.stage.completed");
  assert.equal(stages[0].agentId, "acquisition_strategist");
  assert.equal(stages[0].skillId, "account_resolution");
  assert.equal(stages[1].agentId, "lead_miner");
});

test("pending Spider callbacks keep the workflow open and never fabricate completion", async () => {
  const runner = createProspectWorkflowRunner({
    prospectService: {
      kind: "prospect",
      configured: true,
      requiresExecutorUid: false,
      async lease() {
        return rawResult("PENDING");
      }
    }
  });

  const result = await runner.lease(request);
  assert.equal(result.status, "PENDING");
  assert.equal(result.events.some((event) => event.type === "task.completed"), false);
  assert.equal(result.events.at(-1).type, "agent.stage.completed");
  assert.equal(result.events.at(-1).agentId, "lead_miner");
});

test("callback upgrades the lead miner stage with a new event id after pending", async () => {
  const runner = createProspectWorkflowRunner({
    prospectService: {
      kind: "prospect",
      configured: true,
      requiresExecutorUid: false,
      async lease() { return rawResult("PENDING"); },
      async callback() { return rawResult("SUCCEEDED"); }
    }
  });
  const pending = await runner.lease(request);
  const complete = await runner.callback(request, { comments: [] });
  const pendingStage = pending.events.find((event) => event.type === "agent.stage.completed");
  const completeStage = complete.events.find((event) => event.type === "agent.stage.completed");
  assert.notEqual(pendingStage.eventId, completeStage.eventId);
  assert.equal(completeStage.payload.status, "SUCCEEDED");
});

test("runner fails closed when the public prospect Agent is unavailable", async () => {
  const runner = createProspectWorkflowRunner({ prospectService: null });
  await assert.rejects(
    () => runner.lease(request),
    (error) => error.code === "PROSPECT_EXECUTOR_NOT_CONFIGURED"
  );
});
