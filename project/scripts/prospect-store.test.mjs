import test from "node:test";
import assert from "node:assert/strict";
import { createProspectStore } from "../src/salebuddy/ui/prospect-store.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  };
}

test("migrates legacy customer-analysis prospects to explicit outreach confirmation", () => {
  const storage = memoryStorage();
  storage.setItem("byering.prospect-records.v1", JSON.stringify({
    records: {
      "legacy-analysis": {
        id: "legacy-analysis",
        name: "历史分析潜客",
        status: "待触达",
        tags: ["待触达", "高意向"],
        owner: "客户分析员",
        source: { intentAgentId: "mkt-intent-analyst", type: "客户分析结果" }
      },
      "legacy-manager": {
        id: "legacy-manager",
        name: "历史自动获客潜客",
        status: "待触达",
        tags: ["待触达"],
        owner: "抖音获客管家",
        source: { agentId: "mkt-comment-acquisition", type: "抖音获客" }
      }
    },
    runs: []
  }));

  const store = createProspectStore({ storage });
  assert.equal(store.get("legacy-analysis").status, "待确认触达");
  assert.deepEqual(store.get("legacy-analysis").tags, ["高意向", "待确认触达"]);
  assert.equal(store.get("legacy-manager").status, "待触达");
});

test("ingests real lead results, deduplicates people, and keeps task ownership", () => {
  const store = createProspectStore({ storage: memoryStorage(), now: () => "2026-08-31T10:00:00.000Z" });
  const snapshot = {
    query: "找近期准备下单的人",
    account: { nickname: "我的账号", secId: "MS4wLjABAAAAtest" },
    counts: { candidates: 2, high: 1, medium: 1, low: 0 },
    analysis: { mode: "model", model: "test-model" },
    leads: [
      {
        leadId: "user-1", nickname: "小林", uniqueId: "xiaolin", secUid: "sec-1", text: "多少钱，准备下单",
        score: 93, tier: "high", intent: { score: 93, tier: "high", confidence: 0.96, reason: "明确询价并表达购买计划", source: "model" },
        source: { videoId: "video-1", videoTitle: "保温杯介绍", videoUrl: "https://www.douyin.com/video/1", observedAt: "2026-08-31T09:59:00.000Z" },
        evidence: [{ quote: "多少钱，准备下单", videoId: "video-1" }]
      },
      {
        leadId: "user-2", nickname: "阿宁", uniqueId: "aning", text: "想了解一下",
        score: 55, tier: "medium", intent: { score: 55, tier: "medium", confidence: 0.6, reason: "表达初步了解意愿", source: "model" },
        source: { videoId: "video-1", videoTitle: "保温杯介绍", observedAt: "2026-08-31T09:58:00.000Z" },
        evidence: [{ quote: "想了解一下", videoId: "video-1" }]
      }
    ]
  };

  store.ingestRun({ resultSnapshot: snapshot, taskId: "task-1", agentId: "lead_miner", agentName: "线索猎人", sourceContext: { source: "我的账号作品", window: "近30条作品" } });
  store.ingestRun({ resultSnapshot: { ...snapshot, leads: [snapshot.leads[0]] }, taskId: "task-1", agentId: "lead_miner", agentName: "线索猎人" });

  const records = store.list();
  assert.equal(records.length, 2);
  assert.equal(records[0].name, "小林");
  assert.equal(records[0].tier, "high");
  assert.equal(records[0].intent.reason, "明确询价并表达购买计划");
  assert.equal(records[0].source.taskId, "task-1");
  assert.equal(records[0].source.sourceResultId, "run:lead_miner::task-1::MS4wLjABAAAAtest");
  assert.equal(records[0].source.agentName, "线索猎人");
  assert.equal(records[0].source.accountName, "我的账号");
  assert.equal(records[0].contactStatus, "未保存");
  assert.equal(store.latestRun().taskId, "task-1");
});

test("hydrates canonical server results once and retains task, account, and source ownership", () => {
  const store = createProspectStore({ storage: memoryStorage(), now: () => "2026-09-12T10:00:00.000Z" });
  let emissions = 0;
  store.subscribe(() => { emissions += 1; });
  const run = {
    taskId: "canonical-task-1",
    taskRunId: "canonical-run-1",
    agentId: "mkt-find-people",
    agentName: "抖音找人管家",
    accountId: "douyin-account-1",
    status: "completed",
    updatedAt: "2026-09-12T09:59:00.000Z",
    sourceContext: {
      source: "我的账号直播间互动",
      sourceScope: "authorized_account_live",
      accountId: "douyin-account-1",
      accountName: "我的抖音账号"
    },
    resultSnapshot: {
      counts: { candidates: 1, high: 1 },
      leads: [{
        leadId: "canonical-lead-1",
        nickname: "直播观众",
        secUid: "canonical-sec-1",
        text: "这款现在有现货吗？",
        score: 90,
        tier: "high",
        source: { roomId: "live-room-1" },
        evidence: [{ type: "live_chat", quote: "这款现在有现货吗？" }]
      }]
    }
  };

  assert.equal(store.hydrateRuns([run]), 1);
  assert.equal(store.hydrateRuns([run]), 0);
  assert.equal(emissions, 1);
  const [storedRun] = store.listRuns();
  const [record] = store.list();
  assert.equal(storedRun.taskId, "canonical-task-1");
  assert.equal(storedRun.taskRunId, "canonical-run-1");
  assert.equal(storedRun.accountId, "douyin-account-1");
  assert.equal(storedRun.sourceScope, "own_account_live");
  assert.equal(record.contactability.allowed, true);
  assert.equal(record.source.sourceTaskRunId, "canonical-run-1");
});

test("prospect ingestion keeps avatar URLs instead of replacing them with initials", () => {
  const store = createProspectStore({ storage: memoryStorage(), now: () => "2026-09-07T10:00:00.000Z" });
  store.ingestRun({
    resultSnapshot: {
      leads: [{
        leadId: "avatar-user",
        nickname: "头像用户",
        avatar_url: "https://cdn.example.com/lead-avatar.jpg",
        text: "想了解价格",
        score: 80,
        tier: "high",
        source: { videoId: "avatar-video" },
        evidence: []
      }]
    },
    taskId: "avatar-task",
    agentId: "mkt-lead-miner",
    agentName: "评论区潜客挖掘专家"
  });

  assert.equal(store.list()[0].avatar, "https://cdn.example.com/lead-avatar.jpg");
});

test("saving a prospect promotes it to an external contact without changing its internal owner", () => {
  const store = createProspectStore({ storage: memoryStorage(), now: () => "2026-08-31T10:00:00.000Z" });
  store.ingestRun({
    resultSnapshot: { leads: [{ leadId: "user-1", nickname: "小林", text: "求链接", score: 88, tier: "high", source: { videoId: "v1" }, evidence: [] }] },
    taskId: "task-2", agentId: "agent-1", agentName: "作品评论筛选专员"
  });
  const saved = store.saveToContacts(["lead:user-1"]);
  assert.deepEqual(saved, ["lead:user-1"]);
  const contact = store.get("lead:user-1");
  assert.equal(contact.contactStatus, "已保存");
  assert.equal(contact.saved, true);
  assert.equal(contact.owner, "作品评论筛选专员");
  assert.equal(contact.source.taskId, "task-2");
});

test("marks a prospect as a converted opportunity without changing follow-up status", () => {
  const store = createProspectStore({ storage: memoryStorage(), now: () => "2026-08-31T10:00:00.000Z" });
  store.ingestRun({
    resultSnapshot: { leads: [{ leadId: "user-1", nickname: "小林", text: "求链接", score: 88, tier: "high", source: { videoId: "v1" }, evidence: [] }] },
    taskId: "task-3", agentId: "mkt-lead-miner", agentName: "评论区潜客挖掘专家", sourceContext: { source: "我的账号作品评论", sourceScope: "own_account_comments" }
  });

  const converted = store.markConverted(["lead:user-1"], { note: "已通过触达确认进入商机" });
  assert.deepEqual(converted, ["lead:user-1"]);
  const opportunity = store.get("lead:user-1");
  assert.equal(opportunity.conversionStatus, "已转化");
  assert.equal(opportunity.convertedAt, "2026-08-31T10:00:00.000Z");
  assert.equal(opportunity.conversionNote, "已通过触达确认进入商机");
  assert.equal(opportunity.status, "待触达");
  assert.equal(store.listConverted().length, 1);
});

test("moves comment prospects to touched and preserves the source record id", () => {
  const store = createProspectStore({ storage: memoryStorage(), now: () => "2026-09-04T10:00:00.000Z" });
  store.ingestRun({
    resultSnapshot: { leads: [{ leadId: "user-touch", nickname: "待触达用户", secUid: "sec-touch", text: "想了解价格", score: 82, tier: "high", source: { videoId: "v-touch" }, evidence: [] }] },
    taskId: "comment-task", agentId: "mkt-lead-miner", agentName: "找客户"
  });
  const [updated] = store.applyOutreachResults({
    taskId: "touch-task",
    agentId: "mkt-cold-writer",
    agentName: "私信触达专员",
    entries: [{ recordId: store.list()[0].id, nickname: "待触达用户", secUid: "sec-touch", status: "sent" }]
  });
  assert.equal(updated.status, "已触达");
  assert.equal(updated.outreachStatus, "sent");
  assert.ok(updated.tags.includes("已触达"));
  assert.equal(updated.source.outreachAgentName, "私信触达专员");
});

test("materializes an eligible result-center selection before private outreach", () => {
  const store = createProspectStore({ storage: memoryStorage(), now: () => "2026-09-14T10:00:00.000Z" });
  const [record] = store.ensureOutreachProspects([{
    id: "result-row-1",
    nickname: "成果中心潜客",
    handle: "result_buyer",
    secUid: "sec-result-buyer",
    profileUrl: "https://www.douyin.com/user/sec-result-buyer",
    quote: "想了解有没有现车",
    tier: "high",
    sourceScope: "own_account_comments",
    sourceAccountId: "douyin-owner-1",
    sourceAccountName: "我的抖音账号",
    sourceResultId: "run:finder-1",
    sourceTaskId: "finder-1"
  }], {
    sourceContext: {
      source: "成果中心潜客",
      sourceScope: "own_account_comments",
      accountId: "douyin-owner-1",
      accountName: "我的抖音账号"
    }
  });

  assert.equal(record.status, "待触达");
  assert.equal(record.contactability.allowed, true);
  assert.equal(record.source.accountId, "douyin-owner-1");
  assert.equal(store.list().length, 1);

  const [updated] = store.applyOutreachResults({
    taskId: "outreach-1",
    entries: [{ recordId: record.id, secUid: "sec-result-buyer", status: "sent" }]
  });
  assert.equal(updated.status, "已触达");
});

test("materializes a result-center selection with snake-case source identity", () => {
  const store = createProspectStore({ storage: memoryStorage(), now: () => "2026-09-14T10:00:00.000Z" });
  const [record] = store.ensureOutreachProspects([{
    id: "result-row-source-identity",
    nickname: "来源身份潜客",
    source: {
      sec_uid: "sec-source-identity",
      sourceScope: "own_account_comments",
      accountId: "douyin-owner-1"
    }
  }], {
    sourceContext: {
      source: "成果中心潜客",
      sourceScope: "own_account_comments",
      accountId: "douyin-owner-1"
    }
  });

  assert.equal(record.status, "待触达");
  assert.equal(record.source.secUid, "sec-source-identity");
});

test("direct outreach stays in the outreach result and does not create a prospect", () => {
  const store = createProspectStore({ storage: memoryStorage(), now: () => "2026-09-04T10:00:00.000Z" });
  const changed = store.applyOutreachResults({
    taskId: "direct-touch-task",
    agentId: "mkt-cold-writer",
    agentName: "私信触达专员",
    entries: [{ nickname: "用户指定账号", secUid: "sec-direct", profileUrl: "https://www.douyin.com/user/sec-direct", status: "sent" }]
  });
  assert.deepEqual(changed, []);
  assert.deepEqual(store.list(), []);
});

test("legacy public finder records are excluded from the contactable prospect pool", () => {
  const store = createProspectStore({ storage: memoryStorage() });
  store.ingestRun({
    resultSnapshot: { leads: [{ leadId: "legacy-public-user", nickname: "历史公域对象", secUid: "sec-legacy-public" }] },
    taskId: "legacy-public-task",
    agentId: "legacy-agent",
    agentName: "抖音找人助手",
    sourceContext: { source: "抖音找人" }
  });

  assert.equal(store.list().length, 0);
  assert.equal(store.listRuns()[0].contactability.allowed, false);
});

test("public finder outreach cannot update an existing prospect", () => {
  const store = createProspectStore({ storage: memoryStorage(), now: () => "2026-09-07T10:00:00.000Z" });
  store.ingestRun({
    resultSnapshot: { leads: [{ leadId: "public-user", nickname: "自有账号用户", secUid: "sec-public", text: "想了解", source: { videoId: "own-video" }, evidence: [] }] },
    taskId: "own-source-task",
    agentId: "mkt-lead-miner",
    agentName: "评论区潜客挖掘专家",
    sourceContext: { source: "我的账号作品评论", sourceScope: "own_account_comments" }
  });
  const [record] = store.list();
  assert.equal(record.contactability.allowed, true);
  const changed = store.applyOutreachResults({
    taskId: "finder-touch-task",
    agentId: "mkt-cold-writer",
    agentName: "私信触达专员",
    sourceResultType: "抖音找人",
    entries: [{ recordId: record.id, nickname: "公域对象", secUid: "sec-public", status: "sent" }]
  });
  assert.deepEqual(changed, []);
  assert.equal(store.get(record.id).status, "待触达");
});

test("comprehensive account listener preserves all-signal provenance for contactable prospects", () => {
  const store = createProspectStore({ storage: memoryStorage(), now: () => "2026-09-07T10:00:00.000Z" });
  store.ingestRun({
    resultSnapshot: { leads: [{ leadId: "own-user", nickname: "自有账号用户", secUid: "sec-own", text: "想了解", source: { videoId: "own-video" }, evidence: [] }] },
    taskId: "own-source-task",
    agentId: "mkt-comment-acquisition",
    agentName: "抖音获客管家",
    sourceContext: { source: "已授权账号新增评论、直播互动和账号互动", sourceScope: "authorized_account_all_signals" }
  });
  const [record] = store.list();
  assert.equal(record.contactability.allowed, true);
  assert.equal(record.contactability.sourceScope, "own_account_all_signals");
  assert.equal(record.status, "待触达");
});

test("Douyin acquisition manager keeps prospects in the automatic outreach state", () => {
  const store = createProspectStore({ storage: memoryStorage(), now: () => "2026-09-10T10:00:00.000Z" });
  store.ingestRun({
    resultSnapshot: {
      analysis: { mode: "model" },
      leads: [{ leadId: "auto-flow-user", nickname: "自动流程用户", secUid: "sec-auto-flow", text: "想了解现车", score: 86, tier: "high" }]
    },
    taskId: "auto-flow-task",
    agentId: "mkt-comment-acquisition",
    agentName: "抖音获客管家",
    sourceContext: { source: "账号评论与直播互动", sourceScope: "authorized_account_all_signals" }
  });

  assert.equal(store.list()[0].status, "待触达");
});

test("composite finder treats my-account results as prospects and public results as analysis", () => {
  const ownStore = createProspectStore({ storage: memoryStorage() });
  ownStore.ingestRun({
    resultSnapshot: { leads: [{ leadId: "composite-own", nickname: "评论用户", secUid: "sec-composite-own", text: "想了解价格", source: { videoId: "own-video" }, evidence: [] }] },
    taskId: "composite-own-task",
    agentId: "mkt-find-people",
    agentName: "抖音找人管家",
    sourceContext: { source: "我的账号作品评论", sourceScope: "own_account_comments" }
  });
  assert.equal(ownStore.list().length, 1);
  assert.equal(ownStore.listRuns()[0].resultType, "潜客");
  assert.equal(ownStore.list()[0].contactability.allowed, true);

  const publicStore = createProspectStore({ storage: memoryStorage() });
  publicStore.ingestRun({
    resultSnapshot: { leads: [{ leadId: "composite-public", nickname: "公域账号", secUid: "sec-composite-public", source: { profileUrl: "https://www.douyin.com/user/public" }, evidence: [] }] },
    taskId: "composite-public-task",
    agentId: "mkt-find-people",
    agentName: "抖音找人管家",
    sourceContext: { source: "公域账号分析", sourceScope: "public_search" }
  });
  assert.equal(publicStore.list().length, 0);
  assert.equal(publicStore.listRuns()[0].resultType, "抖音找人");
  assert.equal(publicStore.listRuns()[0].contactability.allowed, false);
});

test("finder-owned live results enter the prospect center as contactable own-live prospects", () => {
  const store = createProspectStore({ storage: memoryStorage() });
  store.ingestRun({
    resultSnapshot: {
      leads: [{
        leadId: "finder-live-user",
        nickname: "直播观众",
        secUid: "sec-finder-live",
        text: "这款还有吗？想下单",
        source: { roomId: "room-finder-live" },
        evidence: [{ type: "live_chat", quote: "这款还有吗？想下单" }]
      }]
    },
    taskId: "finder-live-task",
    agentId: "mkt-find-people",
    agentName: "抖音找人管家",
    sourceContext: { source: "我的账号直播间互动", sourceScope: "authorized_account_live" }
  });

  const [record] = store.list();
  const [run] = store.listRuns();
  assert.equal(run.agentId, "mkt-find-people");
  assert.equal(run.resultType, "潜客");
  assert.equal(run.contactability.allowed, true);
  assert.equal(run.sourceScope, "own_account_live");
  assert.equal(record.contactability.allowed, true);
  assert.equal(record.contactability.sourceScope, "own_account_live");
  assert.equal(record.owner, "抖音找人管家");
});

test("composite finder collection stores raw prospects as waiting for intent analysis", () => {
  const store = createProspectStore({ storage: memoryStorage(), now: () => "2026-09-10T10:00:00.000Z" });
  store.ingestRun({
    resultSnapshot: {
      status: "completed",
      analysis: { mode: "collect", source: "none", counts: { collected: 1 } },
      counts: { candidates: 1, pendingAnalysis: 1, high: 0, medium: 0, low: 0 },
      leads: [{
        leadId: "raw-user",
        nickname: "原始用户",
        secUid: "sec-raw-user",
        text: "想了解一下",
        source: { videoId: "raw-video", videoTitle: "作品" },
        evidence: [{ quote: "想了解一下", videoId: "raw-video" }]
      }]
    },
    taskId: "raw-find-task",
    agentId: "mkt-find-people",
    agentName: "抖音找人管家",
    sourceContext: { source: "我的账号作品评论", sourceScope: "own_account_comments" }
  });

  const [record] = store.list();
  assert.equal(record.contactability.allowed, true);
  assert.equal(record.tier, "unknown");
  assert.equal(record.score, 0);
  assert.equal(record.intent, null);
  assert.equal(record.status, "待分析");
  assert.match(record.tags.join(" "), /待分析/);
  assert.doesNotMatch(record.tags.join(" "), /意向/);
  assert.match(record.timeline[0][1], /等待意向分析/);
  assert.equal(store.latestRun().resultType, "互动用户");
  assert.match(store.latestRun().summary, /等待客户分析员判断/);
});

test("intent analysis updates the existing prospect record without creating a duplicate", () => {
  const store = createProspectStore({ storage: memoryStorage(), now: () => "2026-09-10T10:00:00.000Z" });
  store.ingestRun({
    resultSnapshot: {
      analysis: { mode: "collect" },
      counts: { candidates: 1, pendingAnalysis: 1 },
      leads: [{ leadId: "analysis-user", nickname: "待判断用户", secUid: "sec-analysis-user", text: "想了解价格", source: { videoId: "video-analysis" }, evidence: [] }]
    },
    taskId: "analysis-source-task",
    agentId: "mkt-find-people",
    agentName: "抖音找人管家",
    sourceContext: { source: "我的账号作品评论", sourceScope: "own_account_comments" }
  });
  const [before] = store.list();

  const changed = store.applyIntentAnalysis({
    taskId: "intent-task",
    agentId: "mkt-intent-analyst",
    agentName: "抖音分析助手",
    resultSnapshot: {
      analysis: { mode: "model" },
      leads: [{
        sourceRecordId: before.id,
        leadId: "analysis-user",
        nickname: "待判断用户",
        secUid: "sec-analysis-user",
        score: 88,
        tier: "high",
        intent: { score: 88, tier: "high", confidence: 0.9, reason: "明确询价", source: "model" },
        evidence: [{ quote: "想了解价格", videoId: "video-analysis" }]
      }]
    }
  });

  assert.equal(changed.length, 1);
  assert.equal(store.list().length, 1);
  assert.equal(store.get(before.id).tier, "high");
  assert.equal(store.get(before.id).score, 88);
  assert.equal(store.get(before.id).intent.reason, "明确询价");
  assert.equal(store.get(before.id).status, "待确认触达");
  assert.doesNotMatch(store.get(before.id).tags.join(" "), /待触达/);
  assert.match(store.get(before.id).timeline[0][1], /抖音分析助手/);
});

test("private inbox lead capture moves a touched user into the lead center", () => {
  const store = createProspectStore({ storage: memoryStorage(), now: () => "2026-09-04T10:00:00.000Z" });
  store.ingestRun({
    resultSnapshot: { leads: [{ leadId: "user-lead", nickname: "已触达用户", secUid: "sec-lead", text: "想了解", score: 72, tier: "medium", source: { videoId: "v-lead" }, evidence: [] }] },
    taskId: "lead-task", agentId: "mkt-lead-miner", agentName: "找客户"
  });
  const recordId = store.list()[0].id;
  store.applyOutreachResults({ entries: [{ recordId, secUid: "sec-lead", status: "sent" }], taskId: "touch-lead" });
  const [captured] = store.applyInboxLeadCapture({
    taskId: "inbox-task",
    messages: [{ recordId, nickname: "已触达用户", secUid: "sec-lead", content: "我的电话是 13812345678" }]
  });
  assert.equal(captured.status, "已留资");
  assert.equal(captured.contactStatus, "已留资");
  assert.equal(captured.contact.phone, "13812345678");
  assert.ok(captured.tags.includes("已留资"));
});

test("private inbox lead capture keeps auditable source evidence", () => {
  const store = createProspectStore({ storage: memoryStorage(), now: () => "2026-09-04T10:00:00.000Z" });
  const [captured] = store.applyInboxLeadCapture({
    taskId: "inbox-evidence-task",
    sourceResultId: "run:mkt-dm-inbox::inbox-evidence-task::account-1",
    accountId: "account-1",
    accountName: "我的抖音账号",
    messages: [{
      messageId: "message-1",
      conversationId: "conversation-1",
      nickname: "留资用户",
      handle: "user-1",
      secUid: "sec-user-1",
      receivedAt: "2026-09-04T09:59:00.000Z",
      content: "我的电话是 13812345678，邮箱 hello@example.com"
    }]
  });

  assert.equal(captured.leadCaptureEvidence.length, 1);
  assert.equal(captured.leadCaptureEvidence[0].messageId, "message-1");
  assert.equal(captured.leadCaptureEvidence[0].conversationId, "conversation-1");
  assert.equal(captured.leadCaptureEvidence[0].observedAt, "2026-09-04T09:59:00.000Z");
  assert.equal(captured.leadCaptureEvidence[0].capturedAt, "2026-09-04T10:00:00.000Z");
  assert.equal(captured.leadCaptureEvidence[0].sourceAccount.id, "account-1");
  assert.equal(captured.leadCaptureEvidence[0].sourceAccount.name, "我的抖音账号");
  assert.deepEqual(captured.leadCaptureEvidence[0].detectedFields, ["phone", "email"]);
  assert.equal(captured.leadCaptureEvidence[0].quote, "我的电话是 13812345678，邮箱 hello@example.com");
  assert.equal(captured.source.captureSourceResultId, "run:mkt-dm-inbox::inbox-evidence-task::account-1");

  const duplicate = store.applyInboxLeadCapture({
    taskId: "inbox-evidence-task",
    sourceResultId: "run:mkt-dm-inbox::inbox-evidence-task::account-1",
    accountId: "account-1",
    accountName: "我的抖音账号",
    messages: [{
      messageId: "message-1",
      conversationId: "conversation-1",
      nickname: "留资用户",
      handle: "user-1",
      secUid: "sec-user-1",
      receivedAt: "2026-09-04T09:59:00.000Z",
      content: "我的电话是 13812345678，邮箱 hello@example.com"
    }]
  });

  assert.deepEqual(duplicate, []);
  assert.equal(store.get(captured.id).leadCaptureEvidence.length, 1);
});

test("private inbox capture preserves the existing real avatar", () => {
  const store = createProspectStore({ storage: memoryStorage(), now: () => "2026-09-07T10:00:00.000Z" });
  store.ingestRun({
    resultSnapshot: {
      leads: [{
        leadId: "inbox-avatar-user",
        nickname: "承接对象",
        secUid: "sec-inbox-avatar",
        avatar: "https://cdn.example.com/inbox-avatar.jpg",
        text: "想了解",
        score: 72,
        tier: "medium",
        source: { videoId: "inbox-avatar-video" },
        evidence: []
      }]
    },
    taskId: "inbox-avatar-source",
    agentId: "mkt-lead-miner",
    agentName: "评论区潜客挖掘专家"
  });
  const recordId = store.list()[0].id;
  store.applyOutreachResults({ entries: [{ recordId, secUid: "sec-inbox-avatar", status: "sent" }] });
  const [captured] = store.applyInboxLeadCapture({
    taskId: "inbox-avatar-task",
    messages: [{ recordId, nickname: "承接对象", secUid: "sec-inbox-avatar", content: "电话 13812345678" }]
  });

  assert.equal(captured.avatar, "https://cdn.example.com/inbox-avatar.jpg");
});

test("archives non-lead agent outputs as typed results", () => {
  const store = createProspectStore({ storage: memoryStorage(), now: () => "2026-08-31T10:00:00.000Z" });
  store.ingestRun({
    resultSnapshot: {
      title: "高频购买表达筛选",
      summary: "整理出带原文和来源链接的评论结果",
      counts: { comments: 120, matched: 8 },
      matches: [{ text: "想问一下什么时候补货", videoId: "v-1" }]
    },
    taskId: "task-comment-1",
    agentId: "mkt-comment-filter",
    agentName: "评论筛选专员",
    sourceContext: { source: "作品评论" }
  });

  const run = store.listRuns()[0];
  assert.equal(run.resultType, "评论筛选");
  assert.equal(run.title, "高频购买表达筛选");
  assert.equal(run.summary, "整理出带原文和来源链接的评论结果");
  assert.equal(run.items.length, 1);
  assert.equal(run.counts.matched, 8);
  assert.equal(store.list().length, 0);
});

test("archives the composed find-analyze-outreach workflow as one user research result", () => {
  const store = createProspectStore({ storage: memoryStorage(), now: () => "2026-09-07T10:00:00.000Z" });
  store.ingestRun({
    resultSnapshot: {
      status: "completed",
      title: "AI 科普用户调研",
      survey: { url: "https://example.com/survey", audienceGoal: "近期关注 AI 科普内容的人" },
      counts: { discovered: 20, matched: 6, selected: 4, sent: 4, failed: 0 },
      items: [{ nickname: "目标用户", secUid: "sec-research", score: 92, status: "sent", message: "邀请填写问卷" }]
    },
    taskId: "research-task",
    agentId: "mkt-user-research",
    agentName: "用户调研专家",
    sourceContext: { source: "用户调研" }
  });

  const run = store.listRuns()[0];
  assert.equal(run.resultType, "用户调研");
  assert.equal(run.title, "AI 科普用户调研");
  assert.equal(run.items[0].status, "sent");
  assert.equal(run.resultSnapshot.survey.url, "https://example.com/survey");
});

test("classifies live capability, runtime summaries, and failed runs without fabricating completion", () => {
  const store = createProspectStore({ storage: memoryStorage() });
  store.ingestRun({ resultSnapshot: { status: "running", summary: "等待真实任务状态" }, taskId: "runtime-1", agentId: "mkt-comment-acquisition", accountId: "account-a", sourceContext: { source: "真实运行摘要" } });
  store.ingestRun({ resultSnapshot: { status: "partial", capability: { state: "pending" } }, taskId: "cap-1", agentId: "mkt-comment-acquisition", accountId: "account-a", sourceContext: { source: "live capability" } });
  store.ingestRun({ resultSnapshot: { status: "failed", error: { code: "PROVIDER_OFFLINE" } }, taskId: "error-1", agentId: "mkt-comment-acquisition", accountId: "account-a", sourceContext: { source: "acquisition error" } });
  const types = Object.fromEntries(store.listRuns().map((run) => [run.taskId, run.resultType]));
  assert.equal(types["runtime-1"], "运行摘要");
  assert.equal(types["cap-1"], "实时能力");
  assert.equal(types["error-1"], "错误");
  assert.equal(store.listRuns().find((run) => run.taskId === "error-1").status, "failed");
});

test("keeps partial business output typed as a deliverable result instead of a runtime summary", () => {
  const store = createProspectStore({ storage: memoryStorage() });
  store.ingestRun({
    resultSnapshot: {
      status: "partial",
      counts: { scanned: 20, matched: 7, failed: 3 },
      comments: [{ commentId: "comment-1", nickname: "小林", text: "想了解价格" }],
      errors: [{ code: "PROFILE_UNAVAILABLE", message: "3 个账号无法打开" }]
    },
    taskId: "partial-comment-task",
    agentId: "mkt-comment-filter",
    agentName: "评论筛选专员",
    sourceContext: { source: "作品评论" }
  });

  const run = store.listRuns()[0];
  assert.equal(run.resultType, "评论筛选");
  assert.equal(run.status, "partial");
  assert.equal(run.items.length, 1);
  assert.equal(run.errors.length, 1);
});

test("updates an existing touched prospect when an inbound reply arrives", () => {
  const store = createProspectStore({ storage: memoryStorage(), now: () => "2026-09-08T10:00:00.000Z" });
  store.ingestRun({
    resultSnapshot: { leads: [{ leadId: "reply-user", nickname: "回复用户", secUid: "sec-reply", text: "想了解", source: { videoId: "v-reply" } }] },
    taskId: "reply-source",
    agentId: "mkt-lead-miner",
    agentName: "找客户"
  });
  const recordId = store.list()[0].id;
  store.applyOutreachResults({ entries: [{ recordId, secUid: "sec-reply", status: "sent" }], taskId: "reply-touch" });

  const [updated] = store.applyInboxReplyResults({
    taskId: "reply-inbox",
    messages: [{ messageId: "message-1", recordId, secUid: "sec-reply", nickname: "回复用户", content: "可以，怎么了解？" }]
  });

  assert.equal(updated.id, recordId);
  assert.equal(updated.status, "跟进中");
  assert.equal(updated.replyStatus, "已回复");
  assert.equal(updated.replyReceived, true);
  assert.equal(updated.lastReplyContent, "可以，怎么了解？");
  assert.equal(updated.source.replySourceResultId, null);
  assert.equal(updated.timeline[0][1], "收到用户回复，已进入跟进");
});

test("creates a follow-up prospect for a new inbox conversation and merges it when contact details arrive", () => {
  const store = createProspectStore({ storage: memoryStorage(), now: () => "2026-09-14T10:00:00.000Z" });
  const message = {
    messageId: "inbox-new-1",
    conversationId: "conversation-new-1",
    secUid: "sec-new-user",
    nickname: "主动私信用户",
    content: "你好，想问一下这款车现在有现货吗？"
  };

  const [following] = store.applyInboxReplyResults({ taskId: "inbox-task", messages: [message] });
  assert.equal(following.id, "lead:inbox:sec-new-user");
  assert.equal(following.status, "跟进中");
  assert.equal(following.contactability.allowed, true);
  assert.equal(following.source.type, "私信承接");
  assert.equal(store.applyInboxReplyResults({ taskId: "inbox-task", messages: [message] }).length, 0);

  const [captured] = store.applyInboxLeadCapture({
    taskId: "inbox-task",
    messages: [{ ...message, messageId: "inbox-new-2", content: "微信是 new_user_2026，麻烦发我配置表。" }]
  });
  assert.equal(captured.id, following.id);
  assert.equal(captured.status, "已留资");
  assert.equal(captured.contact.wechat, "new_user_2026");
});

test("allows human sales to progress a captured lead to follow-up, conversion, or loss", () => {
  const store = createProspectStore({ storage: memoryStorage(), now: () => "2026-09-14T11:00:00.000Z" });
  store.hydrateRecords([{ id: "lead-sales-1", name: "已留资用户", status: "已留资", contactStatus: "已留资", conversionStatus: "未转化" }]);

  store.setConversionStatus(["lead-sales-1"], "成交跟进", { note: "销售已接手试驾与报价" });
  assert.equal(store.get("lead-sales-1").conversionStatus, "成交跟进");
  assert.equal(store.get("lead-sales-1").salesFollowupAt, "2026-09-14T11:00:00.000Z");

  store.setConversionStatus(["lead-sales-1"], "已失效", { note: "暂不考虑购车" });
  assert.equal(store.get("lead-sales-1").conversionStatus, "已失效");
  assert.equal(store.get("lead-sales-1").lostAt, "2026-09-14T11:00:00.000Z");
  assert.match(store.get("lead-sales-1").timeline[0][1], /暂不考虑购车/);
});

test("hydrates canonical customer assets and synchronizes later lifecycle updates", async () => {
  const writes = [];
  const store = createProspectStore({
    storage: memoryStorage(),
    now: () => "2026-09-12T13:00:00.000Z",
    remoteSync: async (records) => { writes.push(records); }
  });

  assert.equal(store.hydrateRecords([{
    id: "lead-canonical-1",
    name: "小林",
    status: "已触达",
    conversionStatus: "未转化",
    updatedAt: "2026-09-12T12:00:00.000Z"
  }]), 1);
  assert.equal(store.get("lead-canonical-1").status, "已触达");
  assert.deepEqual(writes, []);

  store.markConverted(["lead-canonical-1"], { note: "已签约" });
  await store.flushRemoteSync();

  assert.equal(writes.length, 1);
  assert.equal(writes[0][0].conversionStatus, "已转化");
  assert.equal(writes[0][0].conversionNote, "已签约");
});

test("keeps failed prospect sync visible and retries it without another business mutation", async () => {
  const writes = [];
  let attempts = 0;
  const store = createProspectStore({
    storage: memoryStorage(),
    now: () => "2026-09-12T14:00:00.000Z",
    remoteSync: async (records) => {
      attempts += 1;
      writes.push(records);
      if (attempts === 1) throw new Error("control plane unavailable");
    }
  });

  store.ingestRun({
    resultSnapshot: {
      leads: [{ leadId: "pending-sync-user", nickname: "待同步用户", text: "想了解价格", score: 85, tier: "high", source: { videoId: "v-pending" }, evidence: [] }]
    },
    taskId: "pending-sync-task",
    agentId: "mkt-lead-miner",
    agentName: "找客专员",
    sourceContext: { source: "我的账号作品评论", sourceScope: "own_account_comments" }
  });
  await store.flushRemoteSync();

  assert.equal(store.syncStatus().pending, true);
  assert.equal(store.syncStatus().attempts, 1);
  assert.match(store.syncStatus().lastError, /control plane unavailable/);

  await store.retryRemoteSync();
  assert.equal(attempts, 2);
  assert.equal(store.syncStatus().pending, false);
  assert.equal(store.syncStatus().lastError, "");
  assert.equal(writes[1][0].name, "待同步用户");
});
