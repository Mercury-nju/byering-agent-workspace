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
  topics: [{ label: "价格与优惠", count: 1, userCount: 1, examples: ["多少钱？<script>"] }],
  users: [{ userId: "u1", nickname: "用户<1>", danmakuCount: 1, evidence: [{ quote: "多少钱？" }] }],
  evidence: [{ quote: "多少钱？<script>" }],
  optimization: {
    headline: "下一场优先优化价格与优惠的讲解顺序。",
    priorityTopics: [{
      label: "价格与优惠",
      count: 1,
      userCount: 1,
      observation: "用户集中追问价格与优惠。",
      strategy: "开场先讲清价格区间、优惠条件和适用人群。",
      examples: ["多少钱？<script>"]
    }],
    nextLiveActions: ["把价格区间和优惠条件前置到商品介绍。"]
  }
};

test("live danmaku report renders escaped full-session analysis and delivery metadata", () => {
  const html = buildLiveDanmakuAnalysisReportHtml(result);
  assert.match(html, /直播复盘/);
  assert.match(html, /这场直播，用户最想知道/);
  assert.match(html, /2 条信号/);
  assert.match(html, /本场最大的转化阻力/);
  assert.match(html, /转化阻力地图/);
  assert.match(html, /执行顺序/);
  assert.match(html, /开场先讲清价格区间/);
  assert.match(html, /多少钱？&lt;script&gt;/);
  assert.match(html, /friction-map/);
  assert.match(html, /feedback-overview/);
  assert.match(html, /topic-chart-row/);
  assert.match(html, /signal-thread/);
  assert.match(html, /条弹幕被听到/);
  assert.match(html, /live-runbook/);
  assert.match(html, /BYERING · 直播复盘/);
  assert.match(html, /本场结论/);
  assert.equal((html.match(/<svg class="agent-avatar-svg/g) || []).length, 0);
  assert.doesNotMatch(html, /直播间弹幕分析 Agent/);
  assert.doesNotMatch(html, /我的核心判断/);
  assert.doesNotMatch(html, /我建议我建议/);
  assert.doesNotMatch(html, /我依据的用户原话/);
  assert.doesNotMatch(html, /我的建议/);
  assert.match(html, /report-ring-draw/);
  assert.match(html, /report-line-draw/);
  assert.match(html, /prefers-reduced-motion/);
  assert.match(html, /--row-delay:0ms/);
  assert.match(html, /--step-delay:0ms/);
  assert.doesNotMatch(html, /用户分析|意向：|明确需求/);
  assert.doesNotMatch(html, /<script>/);

  const file = liveDanmakuAnalysisReportFile(result, { createdBy: "直播间弹幕分析" });
  assert.equal(file.name, "直播间弹幕分析报告-live-report-1.html");
  assert.equal(file.type, "html");
  assert.equal(file.artifactKind, "live-danmaku-analysis-report");
  assert.equal(file.taskRunId, "run-1");

  const message = liveDanmakuAnalysisReportConversationMessage(file);
  assert.match(message.text, /基于整场用户反馈完成分析/);
  assert.match(message.text, /下一场直播优化策略/);
  assert.equal(message.artifact.name, file.name);
  assert.equal(message.artifact.status, "已完成");
});
