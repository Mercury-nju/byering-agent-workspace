import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCommentAcquisitionResultRecord,
  commentAcquisitionCapabilityState
} from "../src/salebuddy/ui/comment-acquisition-results.js";

test("comprehensive results preserve cross-source evidence and signal counts", () => {
  const evidence = [{ type: "follow", quote: "" }, { type: "live_chat", quote: "How can I book?" }];
  const record = buildCommentAcquisitionResultRecord({}, {
    state: "running", config: { sourceScope: { kind: "authorized_account_all_signals" } },
    lastScan: { counts: { signals: 2 }, sources: { live: { state: "receiving" } } },
    candidateProfiles: { person: { id: "person", secUid: "person", evidence } }
  });
  assert.equal(record.source, "抖音评论、直播与互动关注");
  assert.equal(record.counts.signals, 2);
  assert.deepEqual(record.candidateEvidence[0].evidence, evidence);
  assert.equal(record.scanSummaries[0].sources.live.state, "receiving");
});

test("finder listener results never claim an outreach or private-message action", () => {
  const record = buildCommentAcquisitionResultRecord({
    agentId: "mkt-find-people",
    account: "门店账号"
  }, {
    state: "running",
    config: {
      discoveryOnly: true,
      sourceScope: { kind: "authorized_account_comments" },
      audienceRules: { goal: "找有购车意向的人" }
    },
    counters: { scans: 2, candidates: 2, drafts: 9, sent: 4, delivered: 4, replies: 3 },
    lastScan: { source: "douyin_rpa_notifications", counts: { notifications: 3, candidates: 2 } },
    resultSnapshot: { leads: [{ leadId: "lead-finder-1", nickname: "候选客户", text: "现在有现车吗？", evidence: [{ quote: "现在有现车吗？" }] }] },
    approvalQueue: [{ state: "sent", content: "不应出现" }],
    replies: [{ text: "不应出现" }]
  });

  assert.equal(record.agentName, "找客专员");
  assert.equal(record.source, "抖音作品新评论");
  assert.match(record.summary, /不会创建或发送私信/);
  assert.match(record.summary, /互动用户/);
  assert.equal(record.analysis.mode, "collect");
  assert.equal(record.inputs.analysisMode, "collect");
  assert.equal(record.counts.pendingAnalysis, 2);
  assert.equal(record.inputs.touchChannel, undefined);
  assert.equal(record.counts.drafts, 0);
  assert.equal(record.counts.pendingApproval, 0);
  assert.equal(record.counts.sent, 0);
  assert.equal(record.counts.delivered, 0);
  assert.equal(record.counts.replies, 0);
  assert.equal(record.approvalHistory.length, 0);
  assert.equal(record.receipts.length, 0);
  assert.equal(record.replies.length, 0);
});

test("projects a live comment acquisition snapshot into business result data", () => {
  const record = buildCommentAcquisitionResultRecord({
    agentId: "mkt-comment-acquisition",
    taskId: "task-comment-1",
    taskRunId: "run-comment-1",
    accountId: "account-1",
    account: "一以万真",
    product: "准备买车并主动询价的人"
  }, {
    state: "running",
    counters: { scans: 3, candidates: 1, drafts: 1, sent: 0, delivered: 0, replies: 0 },
    lastScan: {
      source: "douyin_rpa_notifications",
      cursor: 9,
      notifications: 1,
      counts: { notifications: 1, normalized: 1, candidates: 1, modelReviewed: 1 },
      analysis: { source: "model", model: "doubao-test", generatedAt: "2026-09-05T06:00:00.000Z" }
    },
    resultSnapshot: {
      status: "completed",
      updatedAt: "2026-09-05T06:00:00.000Z",
      leads: [{
        leadId: "lead-1",
        secUid: "sec-1",
        nickname: "目标用户",
        text: "预算 20 万，怎么预约试驾？",
        intent: { tier: "high", score: 92, confidence: 0.98, reason: "明确预算和预约意向" },
        source: { type: "comment", videoId: "video-1", commentId: "comment-1" }
      }]
    },
    approvalQueue: [{
      touchId: "touch-1",
      state: "pending_approval",
      channel: "private_message",
      content: "你好，看到你在问试驾。",
      contentBasis: { generator: "evidence_rules_v1", sourceLabel: "评论区", quote: "预算 20 万，怎么预约试驾？" },
      lead: { leadId: "lead-1", secUid: "sec-1", text: "预算 20 万，怎么预约试驾？" },
      history: [{ state: "pending_approval", at: "2026-09-05T06:00:01.000Z" }]
    }],
    replies: [],
    events: [{ eventId: "event-1", type: "scan_window", occurredAt: "2026-09-05T06:00:00.000Z" }]
  });

  assert.equal(record.status, "running");
  assert.equal(record.taskId, "task-comment-1");
  assert.equal(record.accountId, "account-1");
  assert.deepEqual(record.counts, { comments: 1, scanned: 3, candidates: 1, drafts: 1, pendingApproval: 1, sent: 0, delivered: 0, replies: 0, captured: 0 });
  assert.equal(record.items[0].leadId, "lead-1");
  assert.equal(record.items[0].intent.reason, "明确预算和预约意向");
  assert.equal(record.scanSummaries[0].cursor, 9);
  assert.equal(record.candidateEvidence[0].quote, "预算 20 万，怎么预约试驾？");
  assert.equal(record.approvalHistory[0].touchId, "touch-1");
  assert.equal(record.approvalHistory[0].contentBasis.sourceLabel, "评论区");
  assert.equal(record.events[0].eventId, "event-1");
  assert.match(record.summary, /1 条评论/);
  assert.match(record.summary, /1 位候选用户/);
});

test("keeps enriched lead fields when later snapshots complete the same candidate", () => {
  const record = buildCommentAcquisitionResultRecord({}, {
    state: "completed",
    counters: { scans: 2, candidates: 1, captured: 1 },
    resultSnapshot: {
      leads: [{
        leadId: "lead-1",
        secUid: "sec-1",
        nickname: "客户甲",
        text: "想了解一下价格",
        source: { type: "comment", videoId: "video-1" },
        intent: { tier: "high", score: 88 }
      }]
    },
    candidateProfiles: {
      "sec-1": {
        leadId: "lead-1",
        secUid: "sec-1",
        nickname: "客户甲",
        source: { type: "comment", videoId: "video-1", videoUrl: "https://www.douyin.com/video/video-1" },
        leadCapture: { phone: "13812345678", source: "私信" },
        leadCaptureStatus: "captured",
        leadCaptureQuote: "我的电话是 13812345678",
        leadCaptureObservedAt: "2026-09-10T10:02:00.000Z"
      }
    },
    replies: [{
      messageId: "message-1",
      leadId: "lead-1",
      leadCapture: { phone: "13812345678", source: "私信" },
      leadCaptureStatus: "captured",
      leadCaptureQuote: "我的电话是 13812345678",
      leadCaptureObservedAt: "2026-09-10T10:02:00.000Z"
    }]
  });

  assert.equal(record.leads.length, 1);
  assert.equal(record.leads[0].source.videoUrl, "https://www.douyin.com/video/video-1");
  assert.equal(record.leads[0].leadCapture.phone, "13812345678");
  assert.equal(record.leads[0].leadCaptureQuote, "我的电话是 13812345678");
  assert.equal(record.leads[0].leadCaptureObservedAt, "2026-09-10T10:02:00.000Z");
  assert.equal(record.counts.captured, 1);
});

test("derives visible capability progress only from real execution evidence", () => {
  assert.deepEqual(commentAcquisitionCapabilityState({ state: "running", cloudState: "online" }, "auto"), {
    connected: true,
    listening: false,
    analyzed: false,
    touchPrepared: false,
    touched: false
  });
  assert.deepEqual(commentAcquisitionCapabilityState({
    state: "running",
    cloudState: "online",
    counters: { scans: 1, drafts: 1, sent: 0, delivered: 0 },
    lastAnalysis: { source: "model", model: "doubao-test" },
    approvalQueue: [{ state: "pending_approval" }]
  }, "manual"), {
    connected: true,
    listening: true,
    analyzed: true,
    touchPrepared: true,
    touched: false
  });
});

test("keeps errors honest and never reports a failed task as completed", () => {
  const record = buildCommentAcquisitionResultRecord({
    agentId: "mkt-comment-acquisition",
    taskId: "task-comment-error",
    accountId: "account-1"
  }, {
    state: "error",
    counters: { scans: 2, candidates: 1 },
    lastError: { code: "DOUYIN_CLOUD_OFFLINE", message: "抖音云电脑已确认掉线" }
  });

  assert.equal(record.status, "failed");
  assert.equal(record.errors[0].code, "DOUYIN_CLOUD_OFFLINE");
  assert.match(record.summary, /抖音云电脑已确认掉线/);
});
