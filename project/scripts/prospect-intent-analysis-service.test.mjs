import assert from "node:assert/strict";
import test from "node:test";

import { createControlPlaneHttpServer } from "../backend/http-server.js";
import { createProspectIntentAnalysisService } from "../backend/prospect-intent-analysis-service.js";

test("candidate intent analysis only consumes supplied candidates and an AI analyzer", async () => {
  const calls = [];
  const service = createProspectIntentAnalysisService({
    intentAnalyzer: {
      async analyze(input) {
        calls.push(input);
        return {
          provider: "test",
          model: "intent-test",
          generatedAt: "2026-09-13T09:00:00.000Z",
          items: [{ index: 0, score: 91, tier: "high", confidence: 0.93, reason: "明确询价", signals: ["价格"] }]
        };
      }
    },
    now: () => "2026-09-13T09:00:00.000Z"
  });

  const result = await service.analyze({
    taskId: "analysis-task",
    taskRunId: "analysis-run",
    conversationId: "analysis-conversation",
    agentId: "mkt-intent-analyst",
    goal: "判断哪些人有明确购车意向",
    candidates: [{
      sourceRecordId: "candidate-1",
      nickname: "上海周先生",
      text: "这台车落地多少钱？",
      source: { type: "live_chat" },
      authorization: "must-not-leak"
    }]
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].comments[0].text, "这台车落地多少钱？");
  assert.equal(result.source, "prospect");
  assert.equal(result.resultSnapshot.source, "prospect_analysis");
  assert.equal(result.resultSnapshot.qualified.length, 1);
  assert.equal(result.resultSnapshot.leads[0].intent.source, "model");
  assert.equal(Object.hasOwn(result.resultSnapshot.leads[0], "authorization"), false);
});

test("legacy public collection stays disabled until explicitly configured", async (t) => {
  const server = createControlPlaneHttpServer({
    auth: false,
    clueHunterService: { configured: false },
    taskDispatcher: { configured: false },
    douyinMcpService: { configured: true },
    douyinAcquisitionService: { executionArchitecture: () => ({ legacyPublicCommentCollection: { configured: false } }) }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => server.close());

  const base = `http://127.0.0.1:${server.address().port}`;
  const health = await fetch(`${base}/healthz`).then((response) => response.json());
  const discovery = await fetch(`${base}/v1/connectors/prospect/discover`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ taskId: "legacy-task", taskRunId: "legacy-run", conversationId: "legacy-conversation" })
  });

  assert.equal(server.legacyPublicDiscoveryService, null);
  assert.equal(health.executionReady, true);
  assert.equal(health.taskDispatchReady, false);
  assert.equal(health.legacyPublicDiscoveryReady, false);
  assert.equal(health.capabilities.legacyPublicCommentCollection, false);
  assert.equal(health.capabilities.candidateIntentAnalysis, true);
  assert.equal(discovery.status, 503);
  assert.equal((await discovery.json()).error.code, "PROSPECT_EXECUTOR_NOT_CONFIGURED");
});
