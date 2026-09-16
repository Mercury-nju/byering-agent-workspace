import test from "node:test";
import assert from "node:assert/strict";
import {
  buildLiveDanmakuAnalysisReportHtml,
  liveDanmakuAnalysisReportConversationMessage,
  liveDanmakuAnalysisReportFile
} from "../src/salebuddy/agents/live-danmaku-analysis-report.js";

const result = {
  taskId: "live-report-1",
  taskRunId: "run-1",
  status: "completed",
  goal: "分析用户对新品的购买问题",
  generatedAt: "2026-09-16T10:00:00.000Z",
  summary: "本场直播已结束，共采集2条弹幕，覆盖2位用户，已基于整场弹幕完成分析报告。",
  counts: { danmaku: 2, uniqueUsers: 2, questions: 2, highIntent: 1, mediumIntent: 1, behaviorOnly: 0 },
  topics: [{ label: "价格与优惠", count: 1, examples: ["多少钱？<script>"] }],
  users: [{ userId: "u1", nickname: "用户<1>", intentTier: "重点", score: 90, evidence: [{ quote: "多少钱？" }] }]
};

test("live danmaku report renders escaped full-session analysis and delivery metadata", () => {
  const html = buildLiveDanmakuAnalysisReportHtml(result);
  assert.match(html, /直播间弹幕分析报告/);
  assert.match(html, /本场直播已结束/);
  assert.match(html, /2条弹幕/);
  assert.match(html, /用户&lt;1&gt;/);
  assert.doesNotMatch(html, /<script>/);

  const file = liveDanmakuAnalysisReportFile(result, { createdBy: "直播间弹幕分析" });
  assert.equal(file.name, "直播间弹幕分析报告-live-report-1.html");
  assert.equal(file.type, "html");
  assert.equal(file.artifactKind, "live-danmaku-analysis-report");
  assert.equal(file.taskRunId, "run-1");

  const message = liveDanmakuAnalysisReportConversationMessage(file);
  assert.match(message.text, /已基于整场弹幕完成 AI 分析/);
  assert.equal(message.artifact.name, file.name);
  assert.equal(message.artifact.status, "已完成");
});
