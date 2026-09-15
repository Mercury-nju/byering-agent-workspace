import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createControlPlane } from "../backend/control-plane.js";
import { createControlPlaneHttpServer } from "../backend/http-server.js";
import { buildManagedDailyReportArtifact, createManagedDailyReportService } from "../backend/managed-daily-report.js";
import { isPrivateConversationMessage } from "../src/salebuddy/agents/direct-message-contract.js";
import { createAgentStore } from "./agent-store.mjs";

function createFixture() {
  let now = "2026-09-12T14:00:00.000Z";
  let sequence = 0;
  const controlPlane = createControlPlane({
    idFactory: () => `daily-${++sequence}`,
    now: () => now,
    requirementService: null
  });
  return {
    controlPlane,
    setNow(value) { now = value; },
    now: () => now
  };
}

function continuousConfigFor(agentId) {
  if (agentId === "mkt-find-people") {
    return {
      discoveryOnly: true,
      longRunning: true,
      sourceScope: { kind: "authorized_account_comments" },
      workWindow: { schedule: "09:00-21:00" }
    };
  }
  if (["mkt-comment-acquisition", "mkt-dm-inbox", "mkt-gold-customer-service", "chief_of_staff"].includes(agentId)) {
    return { longRunning: true };
  }
  return {};
}

function createManagedTask(controlPlane, {
  agentId = "mkt-find-people",
  tenantId = "tenant-a",
  accountId = "douyin-a",
  config = continuousConfigFor(agentId)
} = {}) {
  return controlPlane.dispatch({
    type: "task.create",
    agentId,
    payload: {
      goal: "整理上海新能源车意向用户",
      tenantId,
      accountId,
      accountName: "臻选新能源 · 上海",
      config
    }
  });
}

function buildReport({ agentId = "mkt-find-people", events = [] } = {}) {
  return buildManagedDailyReportArtifact({
    task: {
      taskId: `report-${agentId}`,
      taskRunId: `run-${agentId}`,
      agentId,
      goal: "整理上海新能源车意向用户",
      state: "RUNNING",
      accountId: "douyin-report",
      accountName: "臻选新能源 · 上海"
    },
    events,
    reportDate: "2026-09-12",
    generatedAt: "2026-09-12T10:00:00.000Z",
    scope: {
      agentId,
      combined: false,
      continuous: ["mkt-comment-acquisition", "mkt-find-people", "mkt-dm-inbox", "mkt-gold-customer-service", "chief_of_staff"].includes(agentId),
      participantIds: [agentId]
    }
  });
}

test("finder daily report leads with people found, evidence, a concrete plan, and no invented user action", () => {
  const artifact = buildReport({
    events: [
      { type: "lead.source.synced", agentId: "mkt-find-people", payload: { count: 5, text: "已完成本轮直播间和评论区扫描" } },
      {
        type: "lead.candidate",
        agentId: "mkt-find-people",
        payload: {
          count: 8,
          text: "发现了 8 位候选用户",
          lead: {
            leadId: "lead-shaoxing",
            nickname: "绍兴唐女士",
            text: "这个价格包含购置税吗？",
            score: 92,
            tier: "high",
            source: { type: "comment", videoTitle: "新能源车型介绍" },
            evidence: [{ quote: "这个价格包含购置税吗？" }]
          }
        }
      },
      {
        type: "lead.qualified",
        agentId: "mkt-find-people",
        payload: {
          count: 3,
          text: "筛出 3 位高意向用户，已保留来源证据",
          lead: {
            leadId: "lead-shaoxing",
            nickname: "绍兴唐女士",
            text: "这个价格包含购置税吗？",
            score: 92,
            tier: "high",
            source: { type: "comment", videoTitle: "新能源车型介绍" },
            evidence: [{ quote: "这个价格包含购置税吗？" }]
          }
        }
      }
    ]
  });

  assert.match(artifact.content, /今天找到 8 位可继续跟进的人/);
  assert.match(artifact.content, /来源证据/);
  assert.match(artifact.content, /明天我会继续/);
  assert.match(artifact.content, /今天无需你处理/);
  assert.match(artifact.content, /今日重点候选/);
  assert.match(artifact.content, /绍兴唐女士/);
  assert.match(artifact.content, /评论区 · 新能源车型介绍/);
  assert.match(artifact.content, /这个价格包含购置税吗？/);
  assert.match(artifact.content, /高意向/);
  assert.equal((artifact.content.match(/绍兴唐女士/g) || []).length, 1);
  assert.doesNotMatch(artifact.content, /结果汇总/);
  assert.equal(artifact.summary, "今天找到 8 位可继续跟进的人");
});

test("project-based analysis and outreach never create daily report artifacts", () => {
  for (const agentId of ["mkt-intent-analyst", "mkt-cold-writer"]) {
    assert.throws(
      () => buildReport({ agentId }),
      /Daily reports are only available for continuous managed work\./
    );
  }
});

test("daily report only asks for user input when an event explicitly requires a decision", () => {
  const artifact = buildReport({
    agentId: "mkt-comment-acquisition",
    events: [{
      type: "outreach.failed",
      agentId: "mkt-comment-acquisition",
      payload: {
        count: 1,
        text: "有 1 条私信因账号权限变化未能发送",
        requiresUserAction: true,
        userAction: "请确认是否改用另一个已授权账号继续触达"
      }
    }]
  });

  assert.match(artifact.content, /需要你确认/);
  assert.match(artifact.content, /请确认是否改用另一个已授权账号继续触达/);
  assert.doesNotMatch(artifact.content, /今天无需你处理/);
});

test("inbox daily report leads with replies and conversation records", () => {
  const artifact = buildReport({
    agentId: "mkt-dm-inbox",
    events: [
      {
        type: "lead.replied",
        agentId: "mkt-dm-inbox",
        payload: {
          count: 3,
          text: "收到 3 位用户的私信回复",
          lead: { leadId: "lead-ningbo", nickname: "宁波程女士", source: { type: "direct_message" } },
          content: "周末下午方便试驾吗？"
        }
      },
      {
        type: "reply.sent",
        agentId: "mkt-dm-inbox",
        payload: {
          count: 2,
          text: "已完成 2 次私信回复",
          lead: { leadId: "lead-ningbo", nickname: "宁波程女士", source: { type: "direct_message" } },
          content: "可以的，我先帮您留出周六下午的试驾时间。",
          deliveryState: "sent"
        }
      }
    ]
  });

  assert.match(artifact.content, /今天收到了 3 位用户的回复/);
  assert.match(artifact.content, /对话记录/);
  assert.match(artifact.content, /关键对话/);
  assert.match(artifact.content, /宁波程女士/);
  assert.match(artifact.content, /周末下午方便试驾吗？/);
  assert.match(artifact.content, /我已回复：<\/span>可以的，我先帮您留出周六下午的试驾时间。/);
  assert.match(artifact.content, /今天无需你处理/);
});

test("gold customer service daily report uses its own role label and handoff language", () => {
  const artifact = buildReport({
    agentId: "mkt-gold-customer-service",
    events: [
      {
        type: "lead.replied",
        agentId: "mkt-gold-customer-service",
        payload: {
          count: 1,
          text: "收到 1 位用户的私信回复",
          lead: { leadId: "lead-nanjing", nickname: "南京徐女士", source: { type: "direct_message" } },
          content: "可以发一下现车颜色吗？"
        }
      }
    ]
  });

  assert.match(artifact.content, /金牌客服日报/);
  assert.match(artifact.content, /南京徐女士/);
  assert.match(artifact.content, /人工接管|下一步/);
});

test("full acquisition daily report keeps finding, outreach, and conversation receipts in one file", () => {
  const artifact = buildReport({
    agentId: "mkt-comment-acquisition",
    events: [
      {
        type: "lead.qualified",
        agentId: "mkt-comment-acquisition",
        payload: {
          lead: {
            leadId: "lead-acquisition",
            nickname: "苏州陈女士",
            text: "现在订车什么时候可以提？",
            tier: "high",
            score: 82,
            source: { type: "live", roomTitle: "新能源车型直播间" }
          }
        }
      },
      {
        type: "outreach.sent",
        agentId: "mkt-comment-acquisition",
        payload: {
          lead: { leadId: "lead-acquisition", nickname: "苏州陈女士", source: { type: "live", roomTitle: "新能源车型直播间" } },
          content: "我可以先帮您确认上海门店的现车和交付时间。"
        }
      },
      {
        type: "lead.replied",
        agentId: "mkt-comment-acquisition",
        payload: {
          lead: { leadId: "lead-acquisition", nickname: "苏州陈女士", source: { type: "direct_message" } },
          content: "周日可以到店看看吗？"
        }
      }
    ]
  });

  assert.match(artifact.content, /今日重点候选/);
  assert.match(artifact.content, /今日触达回执/);
  assert.match(artifact.content, /关键对话/);
  assert.match(artifact.content, /苏州陈女士/);
  assert.match(artifact.content, /周日可以到店看看吗？/);
});

test("managed work sends one canonical daily report file to the owning Agent conversation after 22:00 Shanghai time", async t => {
  const root = mkdtempSync(join(tmpdir(), "managed-daily-report-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const fixture = createFixture();
  const task = createManagedTask(fixture.controlPlane);
  fixture.controlPlane.ingestExecutionEvents({
    taskId: task.taskId,
    tenantId: "tenant-a",
    source: "test",
    events: [
      {
        eventId: "source-synced",
        type: "lead.source.synced",
        agentId: "mkt-find-people",
        occurredAt: fixture.now(),
        payload: { count: 0, text: "已完成本轮直播间和评论区扫描" }
      },
      {
        eventId: "candidate-found",
        type: "lead.candidate",
        agentId: "mkt-find-people",
        occurredAt: fixture.now(),
        payload: { count: 2, text: "发现了 2 位候选用户" }
      }
    ]
  });

  const agentStore = createAgentStore(root, { seedMessages: false });
  const service = createManagedDailyReportService({
    controlPlane: fixture.controlPlane,
    agentStore,
    now: fixture.now
  });

  fixture.setNow("2026-09-12T13:59:00.000Z");
  const beforeReportingTime = await service.deliverDueReports();

  fixture.setNow("2026-09-12T14:00:00.000Z");
  const first = await service.deliverDueReports();
  const second = await service.deliverDueReports();

  assert.equal(beforeReportingTime.delivered.length, 0);
  assert.equal(first.delivered.length, 1);
  assert.equal(second.delivered.length, 0);
  const artifact = first.delivered[0].artifact;
  assert.equal(artifact.kind, "managed_daily_report");
  assert.equal(artifact.type, "html");
  assert.equal(artifact.mimeType, "text/html; charset=utf-8");
  assert.match(artifact.name, /^找客专员日报-2026-09-12\.html$/);
  assert.match(artifact.content, /^<!doctype html>/i);
  assert.match(artifact.content, /候选用户/);
  assert.match(artifact.content, /已完成本轮直播间和评论区扫描/);
  assert.equal(artifact.accountId, "douyin-a");

  const snapshot = fixture.controlPlane.getTaskSnapshot(task.taskId);
  assert.deepEqual(snapshot.resultSnapshot.artifacts, [artifact]);
  const messages = agentStore.listDm("tenant-a::mkt-find-people");
  assert.equal(messages.length, 1);
  assert.equal(messages[0].artifact.id, artifact.id);
  assert.equal(messages[0].metadata.dailyReportArtifactId, artifact.id);
  assert.equal(messages[0].conversationId, snapshot.conversationId);
  assert.equal(isPrivateConversationMessage(messages[0]), true);
});

test("a restarted service backfills a missed report for prior work before today's reporting hour", async t => {
  const root = mkdtempSync(join(tmpdir(), "managed-daily-report-backfill-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const fixture = createFixture();
  const task = createManagedTask(fixture.controlPlane, { accountId: "douyin-backfill" });
  fixture.controlPlane.ingestExecutionEvents({
    taskId: task.taskId,
    tenantId: "tenant-a",
    source: "test",
    events: [{
      eventId: "backfill-candidate",
      type: "lead.candidate",
      agentId: "mkt-find-people",
      occurredAt: fixture.now(),
      payload: { count: 1, text: "昨晚找到 1 位候选用户" }
    }]
  });

  const agentStore = createAgentStore(root, { seedMessages: false });
  const service = createManagedDailyReportService({ controlPlane: fixture.controlPlane, agentStore, now: fixture.now });
  fixture.setNow("2026-09-13T01:00:00.000Z");

  const result = await service.deliverDueReports();

  assert.equal(result.delivered.length, 1);
  assert.equal(result.delivered[0].artifact.reportDate, "2026-09-12");
  assert.match(result.delivered[0].artifact.name, /2026-09-12/);
  assert.equal(agentStore.listDm("tenant-a::mkt-find-people").length, 1);
});

test("a long outage only backfills the recent daily-report window", async t => {
  const root = mkdtempSync(join(tmpdir(), "managed-daily-report-backfill-window-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const fixture = createFixture();
  const task = createManagedTask(fixture.controlPlane, { accountId: "douyin-backfill-window" });
  const runningTask = fixture.controlPlane.requireTask(task.taskId);
  runningTask.state = "RUNNING";
  runningTask.startedAt = "2026-08-10T14:00:00.000Z";
  fixture.controlPlane.persistence.saveTask(runningTask);

  const agentStore = createAgentStore(root, { seedMessages: false });
  const service = createManagedDailyReportService({ controlPlane: fixture.controlPlane, agentStore, now: fixture.now });
  const result = await service.deliverDueReports();

  assert.equal(result.delivered.length, 7);
  assert.equal(result.delivered[0].artifact.reportDate, "2026-09-06");
  assert.equal(result.delivered.at(-1).artifact.reportDate, "2026-09-12");
  assert.equal(agentStore.listDm("tenant-a::mkt-find-people").length, 7);
});

test("daily reports scan the complete event stream instead of dropping meaningful work after page one", async t => {
  const root = mkdtempSync(join(tmpdir(), "managed-daily-report-pagination-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const fixture = createFixture();
  const task = createManagedTask(fixture.controlPlane, { accountId: "douyin-pagination" });
  const events = Array.from({ length: 1000 }, (_, index) => ({
    eventId: `heartbeat-${index + 1}`,
    type: "delivery.checking",
    agentId: "mkt-find-people",
    occurredAt: fixture.now(),
    payload: { text: "正在等待平台回执" }
  }));
  events.push({
    eventId: "candidate-after-page-one",
    type: "lead.candidate",
    agentId: "mkt-find-people",
    occurredAt: fixture.now(),
    payload: { count: 2, text: "第 1001 条事件确认找到 2 位候选用户" }
  });
  fixture.controlPlane.ingestExecutionEvents({ taskId: task.taskId, tenantId: "tenant-a", source: "test", events });

  const agentStore = createAgentStore(root, { seedMessages: false });
  const service = createManagedDailyReportService({ controlPlane: fixture.controlPlane, agentStore, now: fixture.now });
  const result = await service.deliverDueReports();

  assert.equal(result.delivered.length, 1);
  assert.match(result.delivered[0].artifact.content, /今天找到 2 位可继续跟进的人/);
});

test("project-based analysis and outreach only return task results, never scheduled daily reports", async t => {
  const root = mkdtempSync(join(tmpdir(), "managed-daily-project-only-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const fixture = createFixture();
  const analysisTask = createManagedTask(fixture.controlPlane, { agentId: "mkt-intent-analyst", accountId: "douyin-analysis" });
  const outreachTask = createManagedTask(fixture.controlPlane, { agentId: "mkt-cold-writer", accountId: "douyin-outreach" });
  fixture.controlPlane.ingestExecutionEvents({
    taskId: analysisTask.taskId,
    tenantId: "tenant-a",
    source: "test",
    events: [{ eventId: "analysis-complete", type: "agent.stage.completed", agentId: "mkt-intent-analyst", occurredAt: fixture.now(), payload: { text: "已完成意向判断" } }]
  });
  fixture.controlPlane.ingestExecutionEvents({
    taskId: outreachTask.taskId,
    tenantId: "tenant-a",
    source: "test",
    events: [{ eventId: "outreach-complete", type: "outreach.sent", agentId: "mkt-cold-writer", occurredAt: fixture.now(), payload: { count: 1, text: "已确认向 1 位用户发出私信" } }]
  });

  const agentStore = createAgentStore(root, { seedMessages: false });
  const service = createManagedDailyReportService({ controlPlane: fixture.controlPlane, agentStore, now: fixture.now });
  assert.deepEqual((await service.deliverDueReports()).delivered, []);
  for (const taskId of [analysisTask.taskId, outreachTask.taskId]) {
    const artifacts = fixture.controlPlane.getTaskSnapshot(taskId).resultSnapshot?.artifacts || [];
    assert.equal(artifacts.some((artifact) => artifact.kind === "managed_daily_report"), false);
  }
  assert.equal(agentStore.listDm("tenant-a::mkt-intent-analyst").length, 0);
  assert.equal(agentStore.listDm("tenant-a::mkt-cold-writer").length, 0);
});

test("a public one-off finder project never creates a daily report", async t => {
  const root = mkdtempSync(join(tmpdir(), "managed-daily-public-finder-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const fixture = createFixture();
  const task = createManagedTask(fixture.controlPlane, {
    accountId: "douyin-public-finder",
    config: {
      discoveryOnly: false,
      longRunning: false,
      sourceScope: { kind: "public_search" },
      workWindow: { lookbackDays: 7 }
    }
  });
  fixture.controlPlane.ingestExecutionEvents({
    taskId: task.taskId,
    tenantId: "tenant-a",
    source: "test",
    events: [{
      eventId: "public-finder-complete",
      type: "lead.candidate",
      agentId: "mkt-find-people",
      occurredAt: fixture.now(),
      payload: { count: 3, text: "已完成公域候选用户检索" }
    }]
  });

  const agentStore = createAgentStore(root, { seedMessages: false });
  const service = createManagedDailyReportService({ controlPlane: fixture.controlPlane, agentStore, now: fixture.now });
  const result = await service.deliverDueReports();

  assert.deepEqual(result.delivered, []);
  assert.equal(fixture.controlPlane.getTaskSnapshot(task.taskId).resultSnapshot?.artifacts?.length || 0, 0);
  assert.equal(agentStore.listDm("tenant-a::mkt-find-people").length, 0);
});

test("a running long-lived Agent sends a no-result daily report after the configured reporting time", async t => {
  const root = mkdtempSync(join(tmpdir(), "managed-daily-report-empty-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const fixture = createFixture();
  const task = createManagedTask(fixture.controlPlane, { accountId: "douyin-b" });
  const runningTask = fixture.controlPlane.requireTask(task.taskId);
  runningTask.state = "RUNNING";
  runningTask.startedAt = fixture.now();
  fixture.controlPlane.persistence.saveTask(runningTask);
  const agentStore = createAgentStore(root, { seedMessages: false });
  const service = createManagedDailyReportService({
    controlPlane: fixture.controlPlane,
    agentStore,
    now: fixture.now
  });

  fixture.setNow("2026-09-12T13:59:00.000Z");
  assert.equal((await service.deliverDueReports()).delivered.length, 0);

  fixture.setNow("2026-09-12T14:00:00.000Z");
  const result = await service.deliverDueReports();
  assert.equal(result.delivered.length, 1);
  assert.match(result.delivered[0].artifact.content, /今日没有新增可确认结果/);
  assert.equal(agentStore.listDm("tenant-a::mkt-find-people").length, 1);
});

test("heartbeat-only work still produces a daily report for a running Agent", async t => {
  const root = mkdtempSync(join(tmpdir(), "managed-daily-report-start-only-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const fixture = createFixture();
  const task = createManagedTask(fixture.controlPlane, { accountId: "douyin-start-only" });
  fixture.controlPlane.ingestExecutionEvents({
    taskId: task.taskId,
    tenantId: "tenant-a",
    source: "test",
    events: [
      { eventId: "accepted", type: "task.execution.accepted", agentId: "mkt-find-people", occurredAt: fixture.now() },
      { eventId: "checking", type: "delivery.checking", agentId: "mkt-find-people", occurredAt: fixture.now() }
    ]
  });

  const agentStore = createAgentStore(root, { seedMessages: false });
  const service = createManagedDailyReportService({ controlPlane: fixture.controlPlane, agentStore, now: fixture.now });
  assert.equal((await service.deliverDueReports()).delivered.length, 1);
  assert.equal(agentStore.listDm("tenant-a::mkt-find-people").length, 1);
});

test("chief only sends a combined report after multiple assigned Agents produced real work", async t => {
  const root = mkdtempSync(join(tmpdir(), "managed-daily-chief-report-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const fixture = createFixture();
  const task = createManagedTask(fixture.controlPlane, { agentId: "chief_of_staff", accountId: "douyin-c" });
  const internal = fixture.controlPlane.requireTask(task.taskId);
  internal.assignment = {
    assignments: [
      { agentId: "mkt-find-people", agentName: "找客专员" },
      { agentId: "mkt-dm-inbox", agentName: "私信客服" }
    ]
  };
  fixture.controlPlane.persistence.saveTask(internal);
  fixture.controlPlane.ingestExecutionEvents({
    taskId: task.taskId,
    tenantId: "tenant-a",
    source: "test",
    events: [
      { eventId: "chief-find", type: "lead.candidate", agentId: "mkt-find-people", occurredAt: fixture.now(), payload: { count: 3 } },
      { eventId: "chief-inbox", type: "lead.replied", agentId: "mkt-dm-inbox", occurredAt: fixture.now(), payload: { count: 1, text: "已收到用户回复" } }
    ]
  });

  const agentStore = createAgentStore(root, { seedMessages: false });
  const service = createManagedDailyReportService({ controlPlane: fixture.controlPlane, agentStore, now: fixture.now });
  const result = await service.deliverDueReports();

  assert.equal(result.delivered.length, 1);
  assert.match(result.delivered[0].artifact.name, /^幕僚长综合日报-2026-09-12\.html$/);
  assert.match(result.delivered[0].artifact.content, /找客专员/);
  assert.match(result.delivered[0].artifact.content, /私信客服/);
  assert.equal(agentStore.listDm("tenant-a::chief_of_staff").length, 1);
});

test("chief sends a daily report when it orchestrates one long-running Agent", async t => {
  const root = mkdtempSync(join(tmpdir(), "managed-daily-chief-single-report-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const fixture = createFixture();
  const task = createManagedTask(fixture.controlPlane, { agentId: "chief_of_staff", accountId: "douyin-chief-single" });
  const internal = fixture.controlPlane.requireTask(task.taskId);
  internal.state = "RUNNING";
  internal.startedAt = fixture.now();
  internal.assignment = {
    assignments: [{ agentId: "mkt-find-people", agentName: "找客专员" }]
  };
  fixture.controlPlane.persistence.saveTask(internal);

  const agentStore = createAgentStore(root, { seedMessages: false });
  const service = createManagedDailyReportService({ controlPlane: fixture.controlPlane, agentStore, now: fixture.now });
  const result = await service.deliverDueReports();

  assert.equal(result.delivered.length, 1);
  assert.match(result.delivered[0].artifact.name, /^幕僚长日报-2026-09-12\.html$/);
  assert.deepEqual(result.delivered[0].scope.participantIds, ["mkt-find-people"]);
  assert.equal(agentStore.listDm("tenant-a::chief_of_staff").length, 1);
});

test("the canonical daily report is readable through results and file endpoints without copying it", async t => {
  const root = mkdtempSync(join(tmpdir(), "managed-daily-report-http-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const fixture = createFixture();
  const task = createManagedTask(fixture.controlPlane, { accountId: "douyin-http" });
  fixture.controlPlane.ingestExecutionEvents({
    taskId: task.taskId,
    tenantId: "tenant-a",
    source: "test",
    events: [{
      eventId: "http-candidate",
      type: "lead.candidate",
      agentId: "mkt-find-people",
      occurredAt: fixture.now(),
      payload: { count: 1, text: "发现了 1 位候选用户" }
    }]
  });

  const agentStore = createAgentStore(root, { seedMessages: false });
  const server = createControlPlaneHttpServer({
    controlPlane: fixture.controlPlane,
    agentStore,
    auth: false,
    managedDailyReportIntervalMs: 0,
    now: () => new Date(fixture.now()).getTime()
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));

  await server.flushManagedDailyReports();
  const snapshot = fixture.controlPlane.getTaskSnapshot(task.taskId);
  const artifact = snapshot.resultSnapshot.artifacts[0];
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const artifactResponse = await fetch(`${baseUrl}/v1/artifacts/${encodeURIComponent(artifact.id)}`);
  const artifactPayload = await artifactResponse.json();
  const downloadResponse = await fetch(`${baseUrl}/v1/artifacts/${encodeURIComponent(artifact.id)}/download`);
  const downloadBody = await downloadResponse.text();
  const resultsResponse = await fetch(`${baseUrl}/v1/results`);
  const resultsPayload = await resultsResponse.json();

  assert.equal(artifactResponse.status, 200);
  assert.equal(artifactPayload.artifact.id, artifact.id);
  assert.equal(artifactPayload.artifact.content, artifact.content);
  assert.equal(downloadResponse.status, 200);
  assert.match(downloadResponse.headers.get("content-type") || "", /^text\/html/i);
  assert.match(downloadResponse.headers.get("content-disposition") || "", /attachment/);
  assert.equal(downloadBody, artifact.content);
  const resultRun = resultsPayload.runs.find((run) => run.taskId === task.taskId);
  assert.ok(resultRun);
  assert.equal(resultRun.resultSnapshot.artifacts[0].id, artifact.id);

  const missingConfirmation = await fetch(`${baseUrl}/v1/artifacts/${encodeURIComponent(artifact.id)}`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({})
  });
  assert.equal(missingConfirmation.status, 400);

  const deletedResponse = await fetch(`${baseUrl}/v1/artifacts/${encodeURIComponent(artifact.id)}`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ confirm: true })
  });
  const deletedPayload = await deletedResponse.json();
  assert.equal(deletedResponse.status, 200);
  assert.equal(deletedPayload.accepted, true);
  assert.equal(deletedPayload.artifact.id, artifact.id);
  assert.equal(deletedPayload.message.deleted, 1);
  assert.equal((await fetch(`${baseUrl}/v1/artifacts/${encodeURIComponent(artifact.id)}`)).status, 404);
  assert.equal((await fetch(`${baseUrl}/v1/artifacts/${encodeURIComponent(artifact.id)}/download`)).status, 404);
  assert.equal(fixture.controlPlane.getTaskSnapshot(task.taskId).resultSnapshot.artifacts.length, 0);
  assert.equal(agentStore.listDm("tenant-a::mkt-find-people").length, 0);
  assert.equal(JSON.stringify(fixture.controlPlane.listTaskEvents(task.taskId)).includes(artifact.content), false);

  await server.flushManagedDailyReports();
  assert.equal(fixture.controlPlane.getTaskSnapshot(task.taskId).resultSnapshot.artifacts.length, 0);
  assert.equal(agentStore.listDm("tenant-a::mkt-find-people").length, 0);
});
