import assert from "node:assert/strict";
import test from "node:test";
import {
  buildChiefDataOverview,
  chiefDataMessage,
  detectChiefDataQuery
} from "../backend/chief-data-overview.js";

const NOW = "2026-09-16T10:00:00.000Z";

test("detects a cross-Agent result question and resolves yesterday", () => {
  const query = detectChiefDataQuery("昨天每个 Agent 产生了什么数据？", { now: NOW });

  assert.deepEqual(query, {
    scope: "all",
    agentId: null,
    dateKey: "2026-09-15",
    timeZone: "Asia/Shanghai"
  });
});

test("detects a natural business metric question without requiring the user to name an Agent", () => {
  assert.deepEqual(detectChiefDataQuery("昨天得到了几条线索？", { now: NOW }), {
    scope: "all",
    agentId: null,
    dateKey: "2026-09-15",
    timeZone: "Asia/Shanghai"
  });
  assert.deepEqual(detectChiefDataQuery("昨天的触达率怎么样？", { now: NOW }), {
    scope: "all",
    agentId: null,
    dateKey: "2026-09-15",
    timeZone: "Asia/Shanghai"
  });
});

test("recognizes the product name of a specific Agent", () => {
  assert.deepEqual(detectChiefDataQuery("昨天爆款作品分析产出了什么？", { now: NOW }), {
    scope: "agent",
    agentId: "mkt-viral-work-analysis",
    dateKey: "2026-09-15",
    timeZone: "Asia/Shanghai"
  });
});

test("aggregates real result snapshots by Agent without exposing raw records", () => {
  const overview = buildChiefDataOverview({
    query: { scope: "all", agentId: null, dateKey: "2026-09-15", timeZone: "Asia/Shanghai" },
    results: [
      {
        taskId: "find-task",
        taskRunId: "find-run",
        agentId: "mkt-find-people",
        agentName: "找客专员",
        status: "completed",
        updatedAt: "2026-09-15T08:00:00.000Z",
        resultSnapshot: {
          generatedAt: "2026-09-15T08:00:00.000Z",
          summary: "从评论和直播互动中找到候选客户",
          counts: { candidates: 12, qualified: 5 },
          evidence: [{ id: "e-1" }],
          items: [{ id: "lead-1", nickname: "不应直接展示" }],
          artifacts: [{ id: "file-1", name: "候选名单.csv" }]
        }
      },
      {
        taskId: "touch-task",
        taskRunId: "touch-run",
        agentId: "mkt-cold-writer",
        agentName: "潜客触达专员",
        status: "completed",
        updatedAt: "2026-09-15T09:00:00.000Z",
        resultSnapshot: {
          generatedAt: "2026-09-15T09:00:00.000Z",
          summary: "完成首轮触达",
          counts: { sent: 5, failed: 1 },
          receipts: [{ id: "receipt-1" }]
        }
      },
      {
        taskId: "old-task",
        taskRunId: "old-run",
        agentId: "mkt-find-people",
        agentName: "找客专员",
        status: "completed",
        updatedAt: "2026-09-14T09:00:00.000Z",
        resultSnapshot: { summary: "前一天结果", counts: { candidates: 99 } }
      }
    ]
  });

  assert.equal(overview.available, true);
  assert.equal(overview.resultCount, 2);
  assert.equal(overview.agentCount, 2);
  assert.deepEqual(overview.agents.map((agent) => agent.agentId), ["mkt-find-people", "mkt-cold-writer"]);
  assert.deepEqual(overview.agents[0].counts, { candidates: 12, qualified: 5 });
  assert.equal(overview.agents[0].evidenceCount, 1);
  assert.deepEqual(overview.agents[0].artifacts, ["候选名单.csv"]);
  assert.equal(overview.agents[0].itemsCount, 1);
  assert.equal(JSON.stringify(overview).includes("不应直接展示"), false);
});

test("uses the product Agent name when a result only carries its machine id", () => {
  const overview = buildChiefDataOverview({
    query: { scope: "all" },
    results: [{
      taskId: "machine-name-task",
      agentId: "mkt-find-people",
      agentName: "mkt-find-people",
      updatedAt: "2026-09-15T08:00:00.000Z",
      resultSnapshot: { counts: { signals: 3 } }
    }]
  });

  assert.equal(overview.agents[0].agentName, "找客专员");
});

test("filters by the result generation time before the task update time", () => {
  const overview = buildChiefDataOverview({
    query: { scope: "all", dateKey: "2026-09-15", timeZone: "Asia/Shanghai" },
    results: [{
      taskId: "updated-later-task",
      agentId: "mkt-cold-writer",
      updatedAt: "2026-09-16T02:00:00.000Z",
      resultSnapshot: {
        generatedAt: "2026-09-15T08:00:00.000Z",
        counts: { sent: 4 }
      }
    }]
  });

  assert.equal(overview.resultCount, 1);
  assert.equal(overview.agents[0].counts.sent, 4);
});

test("normalizes array metrics and runtime counters from real Agent snapshots", () => {
  const overview = buildChiefDataOverview({
    query: { scope: "all" },
    results: [{
      taskId: "runtime-task",
      agentId: "mkt-cold-writer",
      resultSnapshot: {
        counters: { sent: 3 },
        metrics: [
          { key: "touchRate", value: "66.67%" },
          { name: "replyRate", displayValue: "33.33%" }
        ]
      }
    }]
  });

  assert.deepEqual(overview.agents[0].counts, { sent: 3 });
  assert.deepEqual(overview.agents[0].metrics, { touchRate: "66.67%", replyRate: "33.33%" });
});

test("returns an explicit no-data result instead of inventing Agent output", () => {
  const overview = buildChiefDataOverview({
    query: { scope: "all", agentId: null, dateKey: "2026-09-15", timeZone: "Asia/Shanghai" },
    results: []
  });

  assert.equal(overview.available, false);
  assert.equal(overview.resultCount, 0);
  assert.match(chiefDataMessage({ query: overview.query, overview }), /没有找到 2026-09-15 的 Agent 产出记录/);
});

test("does not count an empty running task placeholder as Agent output", () => {
  const overview = buildChiefDataOverview({
    query: { scope: "all", dateKey: "2026-09-15", timeZone: "Asia/Shanghai" },
    results: [
      {
        taskId: "placeholder-task",
        agentId: "mkt-gold-customer-service",
        status: "running",
        updatedAt: "2026-09-15T08:00:00.000Z",
        resultSnapshot: {
          generatedAt: "2026-09-15T08:00:00.000Z",
          status: "running",
          summary: "等待真实任务产出，当前没有可交付结果。",
          counts: {},
          metrics: {}
        }
      },
      {
        taskId: "zero-result-task",
        agentId: "mkt-live-danmaku-analysis",
        status: "completed",
        updatedAt: "2026-09-15T09:00:00.000Z",
        resultSnapshot: {
          generatedAt: "2026-09-15T09:00:00.000Z",
          status: "completed",
          summary: "本场没有识别到有效弹幕主题。",
          counts: { danmaku: 0 }
        }
      }
    ]
  });

  assert.equal(overview.resultCount, 1);
  assert.deepEqual(overview.agents.map((agent) => agent.agentId), ["mkt-live-danmaku-analysis"]);
});

test("a capability question is not treated as a data query", () => {
  assert.equal(detectChiefDataQuery("幕僚长能看到每个 Agent 的数据吗？", { now: NOW }), null);
});
