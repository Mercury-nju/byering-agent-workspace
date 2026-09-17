import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { acquisitionTaskFingerprint, createDouyinAcquisitionService, isProviderOutreachQuotaError } from "../backend/douyin-acquisition-service.js";
import { startControlPlaneServer } from "../backend/http-server.js";
import { DOUYIN_AUTO_AUDIENCE_GOAL } from "../src/salebuddy/agents/acquisition-contract.js";
import { analyzeLiveDanmakuSignals } from "../src/salebuddy/agents/live-danmaku-analysis.js";

function context(overrides = {}) {
  return {
    agentId: "mkt-comment-acquisition",
    taskId: "task-acq-1",
    taskRunId: "run-acq-1",
    conversationId: "conversation-acq-1",
    accountId: "account-1",
    ...overrides
  };
}

function config(overrides = {}) {
  return {
    sourceScope: { kind: "authorized_account_all_signals" },
    audienceRules: { goal: "找询问价格和预算的客户", minScore: 0 },
    touchChannel: "private_message",
    approvalMode: "auto",
    contentPolicy: { quoteComment: true, template: "看到你说：{{comment}}，如果方便我可以继续帮你确认。" },
    caps: { dailyMax: 20, sendIntervalMs: 0, cooldownMs: 0 },
    ...overrides
  };
}

function fakeCloud({ sendResults = [], status = null } = {}) {
  const calls = [];
  let sendIndex = 0;
  const service = {
    configured: true,
    async startLivePolling() {
      calls.push({ type: "live-start" });
      return { ok: true, state: "running" };
    },
    async pullLiveMessages() {
      calls.push({ type: "live-pull" });
      return { ok: true, messages: [] };
    },
    async sendPrivateMessage(payload) {
      calls.push({ type: "send", payload });
      const next = sendResults[sendIndex++] ?? { ok: true, state: "delivered", message_id: "message-1" };
      if (next instanceof Error) throw next;
      return next;
    }
  };
  return {
    calls,
    async status() { return status || { ok: true, state: "ONLINE", login_state: "logged_in", session_id: "session-1" }; },
    getService(agentId, scope) {
      calls.push({ type: "service", agentId, scope });
      return service;
    },
    async start() { calls.push({ type: "cloud-start" }); return { ok: true, state: "ONLINE", session_id: "session-1" }; }
  };
}

function fakeProspect({ leads = [], errors = [] } = {}) {
  let calls = 0;
  return {
    get calls() { return calls; },
    configured: true,
    async discover(input) {
      calls += 1;
      const error = errors[calls - 1];
      if (error) throw error;
      return {
        accepted: true,
        status: "SUCCEEDED",
        resultSnapshot: { counts: { comments: leads.length, candidates: leads.length }, leads },
        events: []
      };
    }
  };
}

function lead(overrides = {}) {
  return {
    id: "lead-1",
    leadId: "lead-1",
    externalUserId: "user-1",
    secUid: "sec-user-1",
    nickname: "张先生",
    text: "怎么预约？",
    score: 40,
    tier: "medium",
    source: { type: "comment", videoId: "video-1", url: "https://www.douyin.com/video/video-1", observedAt: "2026-09-02T00:00:00.000Z" },
    evidence: [{ quote: "请问多少钱？预算 20 万" }],
    ...overrides
  };
}

function eligibleLead(overrides = {}) {
  return lead({
    text: "预算 20 万，今天可以预约吗？",
    score: 92,
    tier: "high",
    intent: {
      score: 92,
      tier: "high",
      confidence: 0.96,
      reason: "明确表达预算并希望尽快预约",
      signals: ["预算", "预约"],
      source: "model",
      model: "test-model"
    },
    ...overrides
  });
}

function build(directory, options = {}) {
  const cloud = options.cloud || fakeCloud();
  const prospect = Object.hasOwn(options, "prospect")
    ? options.prospect
    : fakeProspect({ leads: [lead()] });
  // The product Agent consumes only new authorized-account signals. Tests that
  // still provide a prospect fixture are adapted into that listener contract,
  // rather than exercising the retired historical collection path.
  const interactionSource = Object.hasOwn(options, "interactionSource")
    ? options.interactionSource
    : {
      async scan(input) {
        if (!prospect || typeof prospect.discover !== "function") {
          const error = new Error("authorized account listener is unavailable");
          error.code = "DOUYIN_SOURCES_UNAVAILABLE";
          throw error;
        }
        const result = await prospect.discover(input);
        const leads = result?.resultSnapshot?.leads || result?.leads || [];
        return {
          leads,
          profiles: Object.fromEntries(leads.map((item) => [item.secUid || item.sec_uid || item.leadId || item.id, item])),
          nextCursor: { notifications: result?.nextCursor ?? prospect.calls ?? 0, live: 0 },
          snapshot: {
            source: "test_authorized_account_listener",
            sources: {
              notifications: { state: "listening", count: leads.length },
              live: { state: "listening", count: 0 }
            },
            counts: { candidates: leads.length }
          }
        };
      }
    };
  const service = createDouyinAcquisitionService({
    stateFile: join(directory, "acquisition.json"),
    prospectService: prospect,
    interactionSource,
    cloudRegistry: cloud,
    accountResolver: { configured: true, async resolve() { return { uid: "account-1", secId: "sec-account-1", nickname: "门店账号" }; } },
    autoResume: false,
    ...options
  });
  return { service, cloud, prospect };
}

test("office runtime liveness is separate from persisted task state", async t => {
  const directory = await mkdtemp(join(tmpdir(), "byering-office-runtime-"));
  const first = build(directory).service;
  t.after(() => first.close());
  const task = await first.createTask(context(), config());
  await first.start(task.key, { runImmediately: false });
  assert.equal(first.listRuntimeTasks()[0].runtimeAlive, true);
  assert.equal(first.listRuntimeTasks()[0].listening, true);
  const restarted = build(directory).service;
  t.after(() => restarted.close());
  assert.equal(restarted.listRuntimeTasks()[0].runtimeAlive, false);
  await first.pause(task.key);
  assert.equal(first.listRuntimeTasks()[0].runtimeAlive, false);
});

test("listener configuration drops legacy history windows and schedules while retaining touch safety limits", async t => {
  const directory = await mkdtemp(join(tmpdir(), "byering-acquisition-config-snapshot-"));
  const { service } = build(directory);
  t.after(() => service.close());
  const task = await service.createTask(context({ taskId: "config-snapshot", taskRunId: "config-snapshot-run" }), config({
    sourceScope: { kind: "authorized_account_interactions" },
    workWindow: { timeWindow: "最近30天", schedule: "09:00-21:00" },
    frequency: { mode: "发现高意向用户后立即触达", maxTouchesPerDay: 18, minIntervalMinutes: 12 },
    contentPolicy: {
      strategy: "先回应车型问题，再询问购车时间。",
      replyStyle: "专业、简短、自然",
      handoffBoundary: "报价、投诉和无法确认的库存交给人工。"
    },
    caps: { dailyMax: 18, sendIntervalMs: 12 * 60_000, cooldownMs: 0 }
  }));

  const snapshot = service.status(task.key).configuration;
  assert.equal(snapshot.findingStrategy.timeWindow, undefined);
  assert.equal(Object.hasOwn(snapshot, "timeWindow"), false);
  assert.equal(snapshot.frequency.mode, "识别到高意向潜客后自动触达");
  assert.equal(snapshot.frequency.maxTouchesPerDay, 18);
  assert.equal(snapshot.frequency.minIntervalMinutes, 12);
  assert.equal(snapshot.touchContent.replyStyle, "专业、简短、自然");
  assert.equal(snapshot.touchContent.handoffBoundary, "报价、投诉和无法确认的库存交给人工。");

  const current = service.status(task.key);
  assert.throws(() => service.updateTaskConfig(task.key, {
    baseConfigVersion: 1,
    configVersion: 2,
    expectedVersion: current.eventSeq,
    effectiveScope: "future_only",
    changes: { runtimeRules: { schedule: "10:00-22:00" } }
  }), (error) => error?.code === "DOUYIN_LISTENER_SCHEDULE_FIXED");

  const latest = service.status(task.key);
  assert.throws(() => service.updateTaskConfig(task.key, {
    baseConfigVersion: 1,
    configVersion: 2,
    expectedVersion: latest.eventSeq,
    effectiveScope: "future_only",
    changes: { findingStrategy: { timeWindow: "最近7天" } }
  }), (error) => error?.code === "DOUYIN_LISTENER_LOOKBACK_FORBIDDEN");

  assert.throws(() => service.updateTaskConfig(task.key, {
    baseConfigVersion: 1,
    configVersion: 2,
    expectedVersion: latest.eventSeq,
    effectiveScope: "future_only",
    changes: { timeWindow: "最近7天" }
  }), (error) => error?.code === "DOUYIN_LISTENER_LOOKBACK_FORBIDDEN");

  assert.throws(() => service.updateTaskConfig(task.key, {
    baseConfigVersion: 1,
    configVersion: 2,
    expectedVersion: latest.eventSeq,
    effectiveScope: "future_only",
    changes: { stopConditions: { stopOnReply: true } }
  }), (error) => error?.code === "DOUYIN_COMMENT_ACQUISITION_STOP_CONDITIONS_FIXED");

  assert.throws(() => service.updateTaskConfig(task.key, {
    baseConfigVersion: 1,
    configVersion: 2,
    expectedVersion: latest.eventSeq,
    effectiveScope: "future_only",
    changes: { stopConditions: { stopOnOptOut: false } }
  }), (error) => error?.code === "DOUYIN_COMMENT_ACQUISITION_STOP_CONDITIONS_FIXED");

  const migrated = await service.createTask(context({ taskId: "legacy-schedule", taskRunId: "legacy-schedule-run", accountId: "account-2" }), config({
    sourceScope: { kind: "authorized_account_comments" },
    workWindow: { timeWindow: "10:00-22:00" }
  }));
  assert.deepEqual(service.status(migrated.key).config.workWindow, {});
});

test("persisted acquisition tasks migrate every legacy manager scope to all-signal listening", async t => {
  const directory = await mkdtemp(join(tmpdir(), "byering-acquisition-scope-migration-"));
  const { service } = build(directory);
  t.after(() => service.close());
  const task = await service.createTask(context({ taskId: "scope-migration", taskRunId: "scope-migration-run" }), config({
    workWindow: { schedule: "09:00-21:00" }
  }));
  service.close();

  const stateFile = join(directory, "acquisition.json");
  const saved = JSON.parse(await readFile(stateFile, "utf8"));
  saved.tasks[task.key].config.sourceScope.kind = "authorized_account_comments";
  saved.tasks[task.key].config.workWindow = { schedule: "09:00-21:00", timezone: "Asia/Shanghai" };
  saved.tasks[task.key].config.stopConditions.stopOnReply = true;
  saved.tasks[task.key].configuration = {
    ...saved.tasks[task.key].configuration,
    findingStrategy: {
      ...saved.tasks[task.key].configuration.findingStrategy,
      sourceScope: "authorized_account_comments"
    },
    timeWindow: { schedule: "09:00-21:00", timezone: "Asia/Shanghai" },
    touchContent: {
      ...saved.tasks[task.key].configuration.touchContent,
      stopOnReply: true
    }
  };
  await writeFile(stateFile, JSON.stringify(saved, null, 2));

  const restored = build(directory).service;
  t.after(() => restored.close());
  const migrated = restored.status(task.key);
  assert.equal(migrated.config.sourceScope.kind, "authorized_account_all_signals");
  assert.equal(migrated.config.stopConditions.stopOnReply, false);
  assert.equal(migrated.config.stopConditions.stopOnOptOut, true);
  assert.deepEqual(migrated.config.workWindow, {});
  assert.equal(Object.hasOwn(migrated.configuration, "timeWindow"), false);
  assert.equal(migrated.configuration.findingStrategy.sourceScope.kind, "authorized_account_all_signals");
  assert.equal("type" in migrated.configuration.findingStrategy.sourceScope, false);
});

test("persisted manager tasks with a legacy public reply channel pause until private outreach is confirmed", async t => {
  const directory = await mkdtemp(join(tmpdir(), "byering-acquisition-channel-migration-"));
  const { service } = build(directory);
  const task = await service.createTask(context({ taskId: "channel-migration", taskRunId: "channel-migration-run" }), config());
  service.close();

  const stateFile = join(directory, "acquisition.json");
  const saved = JSON.parse(await readFile(stateFile, "utf8"));
  saved.tasks[task.key].config.touchChannel = "public_reply";
  saved.tasks[task.key].configuration.touchContent.channel = "public_reply";
  await writeFile(stateFile, JSON.stringify(saved, null, 2));

  const restored = build(directory).service;
  t.after(() => restored.close());
  const blocked = restored.status(task.key);
  assert.equal(blocked.state, "paused");
  assert.equal(blocked.health, "ATTENTION");
  assert.equal(blocked.resumeBlocked?.reason, "touch_channel_reconfiguration_required");
  await assert.rejects(
    restored.start(task.key, { runImmediately: false }),
    (error) => error?.code === "DOUYIN_COMMENT_ACQUISITION_TOUCH_CHANNEL_FIXED"
  );

  const repaired = restored.updateTaskConfig(task.key, {
    baseConfigVersion: blocked.configurationVersion,
    configVersion: blocked.configurationVersion + 1,
    expectedVersion: blocked.eventSeq,
    effectiveScope: "future_only",
    changes: { touchContent: { channel: "private_message" } },
    confirmation: { confirmed: true }
  });
  assert.equal(repaired.config.touchChannel, "private_message");
  assert.equal(repaired.resumeBlocked, null);
  assert.equal(repaired.health, "OK");

  const started = await restored.start(task.key, { runImmediately: false });
  assert.equal(started.state, "running");
});

test("acquisition task fingerprints collapse legacy manager scopes into one durable listener", () => {
  const stableContext = context({ taskId: "fingerprint", taskRunId: "fingerprint-run" });
  const allSignals = acquisitionTaskFingerprint(stableContext, config({
    sourceScope: { kind: "authorized_account_all_signals" }
  }));
  const legacyComments = acquisitionTaskFingerprint(stableContext, config({
    sourceScope: { kind: "authorized_account_comments" }
  }));
  assert.equal(legacyComments, allSignals);
});

test("finder listener rejects work schedules without creating outreach settings", async t => {
  const directory = await mkdtemp(join(tmpdir(), "byering-finder-listener-schedule-"));
  const { service } = build(directory);
  t.after(() => service.close());
  const task = await service.createTask(context({
    agentId: "mkt-find-people",
    executionAgentId: "mkt-comment-acquisition",
    taskId: "finder-listener-schedule",
    taskRunId: "finder-listener-schedule-run"
  }), config({
    sourceScope: { kind: "authorized_account_comments" },
    discoveryOnly: true
  }));

  const current = service.status(task.key);
  assert.throws(() => service.updateTaskConfig(task.key, {
    baseConfigVersion: 1,
    configVersion: 2,
    expectedVersion: current.eventSeq,
    effectiveScope: "future_only",
    changes: { runtimeRules: { schedule: "10:00-20:00" } }
  }), (error) => error?.code === "DOUYIN_LISTENER_SCHEDULE_FIXED");

  const snapshot = service.status(task.key);
  assert.deepEqual(snapshot.config.workWindow, {});
  assert.equal(Object.hasOwn(snapshot.configuration, "timeWindow"), false);
  assert.equal(Object.hasOwn(snapshot.configuration, "frequency"), false);
  assert.equal(Object.hasOwn(snapshot.configuration, "touchContent"), false);
});

test("first scan persists high-intent candidates, sends a private first touch, and keeps parent task running", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-acquisition-"));
  const { service } = build(directory, { prospect: fakeProspect({ leads: [eligibleLead()] }) });
  const task = await service.createTask(context(), config());
  await service.start(task.key, { runImmediately: false });
  const result = await service.runOnce(task.key);
  assert.equal(result.newCandidates, 1);
  const snapshot = service.status(task.key);
  assert.equal(snapshot.state, "running");
  assert.equal(snapshot.approvalQueue.length, 1);
  assert.equal(snapshot.approvalQueue[0].state, "delivered");
  assert.ok(snapshot.events.some((event) => event.type === "candidates_found"));
  const saved = JSON.parse(await readFile(join(directory, "acquisition.json"), "utf8"));
  assert.equal(saved.tasks[task.key].state, "running");
});

test("account listener fails closed when its authorized signal source is unavailable", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "byering-acquisition-legacy-boundary-"));
  const { service } = build(directory, { prospect: null });
  t.after(() => service.close());
  const task = await service.createTask(context({ taskId: "legacy-boundary", taskRunId: "legacy-boundary-run" }), config());
  await service.start(task.key, { runImmediately: false });

  const result = await service.runOnce(task.key);

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "DOUYIN_SOURCES_UNAVAILABLE");
  assert.equal(service.executionArchitecture().legacyPublicCommentCollection.configured, false);
});

test("received replies persist provider-backed contact fields for the acquisition detail", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "byering-acquisition-reply-capture-"));
  const reply = {
    msg_id: "reply-1",
    conversation_id: "conversation-1",
    sec_uid: "sec-user-1",
    nickname: "张先生",
    content: "可以，电话是 13812345678，微信号 wxid_demo123456"
  };
  const cloud = fakeCloud();
  let pullCount = 0;
  cloud.getService().pullMessages = async () => {
    pullCount += 1;
    return pullCount === 1 ? { ok: true, messages: [reply], next_cursor: 1 } : { ok: true, messages: [], next_cursor: 1 };
  };
  const interactionSource = {
    async scan() {
      return {
        leads: [lead()],
        profiles: { "sec-user-1": lead() },
        nextCursor: { notifications: 1, live: 0 },
        snapshot: { sources: { notifications: { state: "listening", count: 1 }, live: { state: "waiting", count: 0 } }, counts: { candidates: 1 } }
      };
    }
  };
  const { service } = build(directory, { cloud, interactionSource });
  t.after(() => service.close());
  const task = await service.createTask(context({ taskId: "reply-capture", taskRunId: "reply-capture-run" }), config({
    sourceScope: { kind: "authorized_account_interactions" },
    approvalMode: "auto"
  }));
  await service.start(task.key, { runImmediately: false });
  await service.runOnce(task.key);

  const snapshot = service.status(task.key);
  assert.equal(snapshot.replies.length, 1);
  assert.deepEqual(snapshot.replies[0].leadCapture, {
    phone: "13812345678",
    email: null,
    wechat: "wxid_demo123456",
    source: "私信"
  });
  assert.equal(snapshot.replies[0].leadCaptureStatus, "captured");
  assert.equal(snapshot.replies[0].leadCaptureQuote, reply.content);
  assert.equal(snapshot.counters.captured, 1);
  assert.equal(snapshot.approvalQueue[0].lead.leadCapture.phone, "13812345678");
});

test("received replies join a candidate by the provider user id when sec uid is absent", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "byering-acquisition-reply-user-id-"));
  const candidate = lead({
    id: "user-42",
    leadId: "user-42",
    externalUserId: null,
    secUid: null,
    userId: "user-42"
  });
  const reply = {
    msg_id: "reply-user-id-1",
    user_id: "user-42",
    nickname: "李先生",
    created_at: "2026-09-10T10:01:00.000Z",
    content: "我的邮箱是 buyer@example.com"
  };
  const cloud = fakeCloud();
  cloud.getService().pullMessages = async () => ({ ok: true, messages: [reply], next_cursor: 1 });
  const interactionSource = {
    async scan() {
      return {
        leads: [candidate],
        profiles: { "user-42": candidate },
        nextCursor: { notifications: 1, live: 0 },
        snapshot: { sources: { notifications: { state: "listening", count: 1 }, live: { state: "waiting", count: 0 } }, counts: { candidates: 1 } }
      };
    }
  };
  const { service } = build(directory, { cloud, interactionSource });
  t.after(() => service.close());
  const task = await service.createTask(context({ taskId: "reply-user-id", taskRunId: "reply-user-id-run" }), config({
    sourceScope: { kind: "authorized_account_interactions" },
    approvalMode: "auto"
  }));
  await service.start(task.key, { runImmediately: false });
  await service.runOnce(task.key);

  const snapshot = service.status(task.key);
  assert.equal(snapshot.replies[0].leadId, "user-42");
  assert.equal(snapshot.replies[0].createdAt, reply.created_at);
  assert.equal(snapshot.replies[0].userId, "user-42");
  assert.deepEqual(snapshot.replies[0].leadCapture, {
    phone: null,
    email: "buyer@example.com",
    wechat: null,
    source: "私信"
  });
  assert.equal(snapshot.approvalQueue[0].lead.leadCapture.email, "buyer@example.com");
});

test("preview discovers authorized-account opportunities without starting follow-up or creating touches", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-acquisition-preview-"));
  const followUps = [];
  let scanCalls = 0;
  const { service, cloud } = build(directory, {
    interactionSource: {
      async scan() {
        scanCalls += 1;
        return { leads: [lead()], profiles: {}, nextCursor: { notifications: 1, live: 1 }, snapshot: { sources: { notifications: { state: "listening", count: 1 }, live: { state: "waiting", count: 0 } }, counts: { candidates: 1 } } };
      }
    },
    followUpInboxRuntime: {
      async ensureRunning(input) { followUps.push(input); return { ok: true, runtime: { running: true } }; }
    }
  });
  const task = await service.createTask(context(), config({
    sourceScope: { kind: "authorized_account_interactions" },
    approvalMode: "auto"
  }));

  const result = await service.preview(task.key);

  assert.equal(result.ok, true);
  assert.equal(result.preview, true);
  assert.equal(scanCalls, 1);
  assert.equal(service.status(task.key).state, "configuring");
  assert.equal(service.status(task.key).previewSnapshot.leads.length, 1);
  assert.equal(service.status(task.key).approvalQueue.length, 0);
  assert.equal(followUps.length, 0);
  assert.equal(cloud.calls.filter((call) => call.type === "send").length, 0);
});

test("starting from preview processes the displayed opportunities before scanning new data", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-acquisition-preview-start-"));
  const firstLead = lead({
    score: 92,
    tier: "high",
    intent: { tier: "high", score: 92, confidence: 0.98, reason: "明确预约意向" }
  });
  let discoverCalls = 0;
  const interactionSource = {
    async scan() {
      discoverCalls += 1;
      return { leads: [firstLead], profiles: {}, nextCursor: { notifications: 1, live: 1 }, snapshot: { sources: { notifications: { state: "listening", count: 1 }, live: { state: "waiting", count: 0 } }, counts: { candidates: 1 } } };
    }
  };
  const { service, cloud } = build(directory, {
    interactionSource,
    followUpInboxRuntime: {
      async ensureRunning() { return { ok: true, runtime: { running: true } }; }
    }
  });
  const task = await service.createTask(context({ taskId: "preview-start", taskRunId: "preview-start-run" }), config({
    sourceScope: { kind: "authorized_account_interactions" },
    approvalMode: "auto",
    contentPolicy: { template: "你好，看到你的留言了。" }
  }));

  await service.preview(task.key);
  const started = await service.start(task.key, { fromPreview: true });

  assert.equal(started.state, "running");
  assert.equal(discoverCalls, 1);
  assert.equal(service.status(task.key).previewSnapshot, null);
  assert.equal(service.status(task.key).approvalQueue.length, 1);
  assert.equal(service.status(task.key).approvalQueue[0].lead.leadId, firstLead.leadId);
  assert.equal(cloud.calls.filter((call) => call.type === "send").length, 1);
});

test("touch drafts personalize the first message with each candidate's evidence and intent", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-acquisition-personalized-touch-"));
  const prospect = fakeProspect({ leads: [
    lead({
      id: "lead-question",
      leadId: "lead-question",
      externalUserId: "user-question",
      secUid: "sec-question",
      text: "预算 20 万，怎么预约试驾？",
      score: 92,
      tier: "high",
      intent: { tier: "high", score: 92, confidence: 0.98, reason: "明确预算和预约意向", signals: ["预算", "预约"] },
      evidence: [{ type: "comment", quote: "预算 20 万，怎么预约试驾？" }]
    }),
    lead({
      id: "lead-need",
      leadId: "lead-need",
      externalUserId: "user-need",
      secUid: "sec-need",
      text: "最近想换车，但不知道怎么选",
      score: 88,
      tier: "high",
      intent: { tier: "high", score: 88, confidence: 0.9, reason: "表达换车需求但尚未明确车型", signals: ["换车", "选择"] },
      evidence: [{ type: "comment", quote: "最近想换车，但不知道怎么选" }]
    })
  ] });
  const { service } = build(directory, { prospect });
  const task = await service.createTask(context(), config({
    approvalMode: "auto",
    contentPolicy: {
      quoteComment: false,
      template: "你好，方便了解一下你现在最想解决的问题吗？",
      conversionGoal: "确认具体购车需求"
    }
  }));
  await service.start(task.key, { runImmediately: false });
  await service.runOnce(task.key);

  const touches = service.status(task.key).approvalQueue;
  assert.equal(touches.length, 2);
  assert.notEqual(touches[0].content, touches[1].content);
  assert.match(touches[0].content, /预算 20 万/);
  assert.match(touches[0].content, /预约试驾/);
  assert.match(touches[1].content, /最近想换车/);
  assert.equal(touches[0].contentBasis.intentReason, "明确预算和预约意向");
  assert.equal(touches[1].contentBasis.intentReason, "表达换车需求但尚未明确车型");
  assert.equal(touches[0].contentBasis.sourceType, "comment");
  assert.equal(touches[0].contentBasis.generator, "evidence_rules_v1");
});

test("new high-intent evidence refreshes the existing touch draft with the latest comment", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-acquisition-refresh-draft-"));
  let scanCount = 0;
  const interactionSource = {
    async scan() {
      scanCount += 1;
      const highIntent = scanCount > 1;
      const text = highIntent ? "这个多少钱？我最近想买一套" : "想了解你的视频是怎么做的";
      return {
        leads: [{
          ...lead({
            id: "lead-refresh",
            leadId: "lead-refresh",
            externalUserId: "user-refresh",
            secUid: "sec-refresh",
            text,
            score: highIntent ? 92 : 40,
            tier: highIntent ? "high" : "medium",
            intent: highIntent
              ? { tier: "high", score: 92, confidence: 0.98, reason: "询问价格并表达购买意向", signals: ["价格", "购买"] }
              : { tier: "medium", score: 40, confidence: 0.8, reason: "了解内容", signals: ["了解"] },
            evidence: [
              { type: "comment", quote: "想了解你的视频是怎么做的", observedAt: "2026-09-09T14:40:00.000Z" },
              ...(highIntent ? [{ type: "comment", quote: text, observedAt: "2026-09-09T14:45:00.000Z" }] : [])
            ]
          })
        }],
        profiles: {},
        nextCursor: { notifications: scanCount },
        snapshot: { sources: { notifications: { state: "listening", count: 1 }, live: { state: "waiting", count: 0 } }, counts: { candidates: 1 } }
      };
    }
  };
  const cloud = fakeCloud();
  const { service } = build(directory, { cloud, interactionSource });
  const task = await service.createTask(
    context({ taskId: "refresh-draft", taskRunId: "refresh-draft-run" }),
    config({ sourceScope: { kind: "authorized_account_interactions" }, approvalMode: "auto" })
  );
  await service.start(task.key, { runImmediately: false });
  await service.runOnce(task.key);
  await service.runOnce(task.key);

  const touch = service.status(task.key).approvalQueue[0];
  assert.equal(touch.state, "delivered");
  assert.match(touch.content, /这个多少钱？我最近想买一套/);
  assert.doesNotMatch(touch.content, /想了解你的视频是怎么做的/);
  assert.equal(touch.contentBasis.quote, "这个多少钱？我最近想买一套");
  assert.match(cloud.calls.find((call) => call.type === "send").payload.content, /这个多少钱？我最近想买一套/);
});

test("comment acquisition scans without starting a managed follow-up inbox", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-acquisition-follow-up-"));
  const starts = [];
  const stops = [];
  const { service } = build(directory, {
    followUpInboxRuntime: {
      async ensureRunning(input) {
        starts.push(input);
        return { ok: true, runtime: { running: true, accountId: input.account.secId } };
      },
      async stop(input) {
        stops.push(input);
        return { ok: true };
      }
    }
  });
  const task = await service.createTask(context(), config());
  await service.start(task.key, { runImmediately: false });

  const result = await service.runOnce(task.key);

  assert.equal(result.ok, true);
  assert.equal(starts.length, 0);
  assert.equal(service.status(task.key).followUpInbox, undefined);

  await service.pause(task.key);
  assert.equal(stops.length, 0);

  await service.resume(task.key, { runImmediately: false });
  await service.runOnce(task.key);
  await service.stop(task.key);
  assert.equal(stops.length, 0);
});

test("comment acquisition still scans when a follow-up runtime is unavailable", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-acquisition-follow-up-error-"));
  const { service, prospect } = build(directory, {
    followUpInboxRuntime: {
      async ensureRunning() {
        throw Object.assign(new Error("reply runtime unavailable"), { code: "DOUYIN_INBOX_START_FAILED" });
      }
    }
  });
  const task = await service.createTask(context(), config());
  await service.start(task.key, { runImmediately: false });

  const result = await service.runOnce(task.key);

  assert.equal(result.ok, true);
  assert.equal(service.status(task.key).state, "running");
  assert.equal(service.status(task.key).followUpInbox, undefined);
  assert.equal(prospect.calls, 1);
});

test("runtime strategy updates persist a versioned future-only patch without touching ownership or processed records", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-acquisition-"));
  const { service } = build(directory);
  const task = await service.createTask(context(), config());
  await service.start(task.key, { runImmediately: false });
  await service.runOnce(task.key);
  const before = service.status(task.key);
  const updated = service.updateTaskConfig(task.key, {
    baseConfigVersion: 1,
    configVersion: 2,
    expectedVersion: before.eventSeq,
    effectiveScope: "future_only",
    changes: {
      strategy: { audienceGoal: "只筛选明确预约意向", filters: { industries: ["教育"], regions: ["上海"] } },
      touchContent: { message: "你好，看到你的留言了。" }
    },
    reason: "用户调整策略"
  });
  assert.equal(updated.configurationVersion, 2);
  assert.equal(updated.configVersion, 2);
  assert.equal(updated.context.accountId, before.context.accountId);
  assert.deepEqual(updated.cursor, before.cursor);
  assert.deepEqual(updated.seenCandidates, before.seenCandidates);
  assert.equal(updated.approvalQueue[0].content, before.approvalQueue[0].content);
  assert.equal(updated.config.audienceRules.goal, DOUYIN_AUTO_AUDIENCE_GOAL);
  assert.equal(updated.config.audienceRules.requirements, "");
  assert.equal(updated.config.audienceRules.autoIdentifyAccountPositioning, true);
  assert.equal(updated.config.audienceRules.autoIdentifyServiceUsers, true);
  assert.equal("filters" in updated.config.audienceRules, false);
  assert.equal(updated.config.contentPolicy.template, "");
  assert.equal(updated.config.contentPolicy.strategy, "");
  assert.equal(updated.configuration.effectiveScope, "future_only");
  assert.ok(updated.configuration.effectiveAt);
  assert.equal(updated.configuration.effectiveFromSeq, before.eventSeq + 1);
  assert.ok(updated.events.some((event) => event.type === "config_updated" && event.payload.configVersion === 2));
  const persisted = JSON.parse(await readFile(join(directory, "acquisition.json"), "utf8"));
  assert.equal(persisted.tasks[task.key].configurationVersion, 2);
  assert.equal(persisted.tasks[task.key].configuration.version, 2);
});

test("findingStrategy.scope alias cannot change the fixed acquisition source scope", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-acquisition-scope-alias-"));
  const { service } = build(directory);
  const task = await service.createTask(context({ taskId: "scope-alias-task", taskRunId: "scope-alias-run" }), config());
  await service.start(task.key, { runImmediately: false });
  const before = service.status(task.key);
  assert.throws(() => service.updateTaskConfig(task.key, {
    baseConfigVersion: 1,
    configVersion: 2,
    expectedVersion: before.eventSeq,
    effectiveScope: "future_only",
    changes: { findingStrategy: { scope: "authorized_account_comments" } },
    confirmation: { confirmed: true }
  }), (error) => error.code === "DOUYIN_ACQUISITION_SOURCE_SCOPE_FIXED");
  assert.equal(service.status(task.key).config.sourceScope.kind, "authorized_account_all_signals");
});

test("configuration sync failure rolls back the strategy update", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-acquisition-"));
  const { service } = build(directory, { eventSink() { return null; } });
  const task = await service.createTask(context(), config());
  const before = service.status(task.key);
  assert.throws(() => service.updateTaskConfig(task.key, {
    baseConfigVersion: 1,
    configVersion: 2,
    expectedVersion: before.eventSeq,
    effectiveScope: "future_only",
    changes: { touchContent: { message: "不应生效" } }
  }), (error) => error.code === "DOUYIN_ACQUISITION_CONFIG_SYNC_FAILED");
  const after = service.status(task.key);
  assert.equal(after.configurationVersion, before.configurationVersion);
  assert.equal(after.config.contentPolicy.template, before.config.contentPolicy.template);
  assert.equal(after.events.some((event) => event.type === "config_updated"), false);
});

test("runtime strategy updates reject stale versions, unsafe fields, and risky changes without confirmation", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-acquisition-"));
  const { service } = build(directory);
  const task = await service.createTask(context(), config());
  await service.start(task.key, { runImmediately: false });
  assert.throws(() => service.updateTaskConfig(task.key, {
    baseConfigVersion: 0,
    configVersion: 1,
    effectiveScope: "future_only",
    changes: { touchContent: { message: "测试" } }
  }), (error) => error.code === "DOUYIN_ACQUISITION_CONFIG_VERSION_REQUIRED");
  assert.throws(() => service.updateTaskConfig(task.key, {
    baseConfigVersion: 1,
    configVersion: 2,
    effectiveScope: "future_only",
    changes: { touchContent: { accountId: "must-not-change" } }
  }), (error) => error.code === "DOUYIN_ACQUISITION_CONFIG_FIELD_FORBIDDEN");
  assert.throws(() => service.updateTaskConfig(task.key, {
    baseConfigVersion: 1,
    configVersion: 2,
    effectiveScope: "future_only",
    changes: { frequency: { maxTouchesPerDay: 99 } }
  }), (error) => error.code === "DOUYIN_ACQUISITION_CONFIG_CONFIRMATION_REQUIRED");
  service.updateTaskConfig(task.key, {
    baseConfigVersion: 1,
    configVersion: 2,
    effectiveScope: "future_only",
    changes: { touchContent: { message: "已确认" } }
  });
  assert.throws(() => service.updateTaskConfig(task.key, {
    baseConfigVersion: 1,
    configVersion: 3,
    effectiveScope: "future_only",
    changes: { touchContent: { message: "过期" } }
  }), (error) => error.code === "DOUYIN_ACQUISITION_CONFIG_STALE");
});

test("comment acquisition runtime updates cannot re-enable manual approval", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-acquisition-"));
  const { service } = build(directory);
  const task = await service.createTask(context(), config({ approvalMode: "auto" }));
  assert.throws(
    () => service.updateTaskConfig(task.key, {
      expectedVersion: task.eventSeq,
      baseConfigVersion: 1,
      configVersion: 2,
      effectiveScope: "future_only",
      changes: { touchContent: { approvalMode: "manual" } },
      confirmation: { confirmed: true }
    }),
    (error) => error?.code === "DOUYIN_COMMENT_ACQUISITION_AUTO_SEND_REQUIRED"
  );
});

test("duplicate candidates are suppressed across scans", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-acquisition-"));
  const prospect = fakeProspect({ leads: [lead()] });
  const { service } = build(directory, { prospect });
  const task = await service.createTask(context(), config());
  await service.start(task.key, { runImmediately: false });
  await service.runOnce(task.key);
  await service.runOnce(task.key);
  assert.equal(service.status(task.key).approvalQueue.length, 1);
  assert.equal(service.status(task.key).counters.duplicates, 1);
});

test("high-intent candidates are automatically sent with a stable request id and delivery receipt", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-acquisition-"));
  const { service, cloud } = build(directory, { prospect: fakeProspect({ leads: [eligibleLead()] }) });
  const task = await service.createTask(context(), config());
  await service.start(task.key, { runImmediately: false });
  await service.runOnce(task.key);
  assert.equal(service.status(task.key).approvalQueue[0].state, "delivered");
  assert.ok(cloud.calls.some((call) => call.type === "service" && call.agentId === "mkt-douyin-account-runtime"));
  assert.match(cloud.calls.find((call) => call.type === "send").payload.reqId, /^acq:/);
  assert.equal(service.status(task.key).approvalQueue[0].requestId, cloud.calls.find((call) => call.type === "send").payload.reqId);
});

test("accepted touch receipts are not counted as sent until a final receipt arrives", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-acquisition-accepted-receipt-"));
  const cloud = fakeCloud({ sendResults: [{ ok: true, state: "accepted", message_id: "message-accepted-1" }] });
  const { service } = build(directory, { cloud, prospect: fakeProspect({ leads: [eligibleLead()] }) });
  const task = await service.createTask(context({ taskId: "task-accepted-receipt", taskRunId: "run-accepted-receipt" }), config());
  await service.start(task.key, { runImmediately: false });
  await service.runOnce(task.key);
  const snapshot = service.status(task.key);
  assert.equal(snapshot.approvalQueue[0].state, "accepted");
  assert.equal(snapshot.counters.accepted, 1);
  assert.equal(snapshot.counters.sent, 0);
  assert.equal(snapshot.counters.delivered, 0);
});

test("a transient private-message timeout stays pending verification instead of becoming failed", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-acquisition-timeout-"));
  const cloud = fakeCloud({ sendResults: [{ ok: false, error: { code: "network_error", message: "The read operation timed out" } }] });
  const { service } = build(directory, { cloud, prospect: fakeProspect({ leads: [eligibleLead()] }) });
  const task = await service.createTask(context({ taskId: "timeout", taskRunId: "timeout-run" }), config());
  await service.start(task.key, { runImmediately: false });
  await service.runOnce(task.key);
  const touch = service.status(task.key).approvalQueue[0];
  assert.equal(touch.state, "unknown");
  assert.equal(touch.history.at(-1).reason, "send_response_lost");
  assert.equal(touch.lastError.code, "network_error");
});

test("automatic manager sends only high-intent candidates and stops lower-confidence candidates", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-acquisition-"));
  const cloud = fakeCloud();
  const prospect = fakeProspect({ leads: [lead(), eligibleLead({ id: "lead-2", leadId: "lead-2", externalUserId: "user-2", secUid: "sec-user-2" })] });
  const { service } = build(directory, { cloud, prospect });
  const task = await service.createTask(context(), config());
  await service.start(task.key, { runImmediately: false });
  await service.runOnce(task.key);
  const touches = service.status(task.key).approvalQueue;
  assert.equal(touches[0].state, "stopped");
  assert.equal(touches[0].risk.action, "manual_review");
  assert.equal(touches[1].state, "delivered");
  assert.equal(service.status(task.key).counters.skipped, 1);
});

test("price and complaint signals are skipped instead of waiting for approval in auto mode", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-acquisition-"));
  const { service, cloud } = build(directory, {
    prospect: fakeProspect({ leads: [lead({ text: "太贵了，想投诉并退款" })] })
  });
  const task = await service.createTask(context(), config({ approvalMode: "auto" }));
  await service.start(task.key, { runImmediately: false });
  await service.runOnce(task.key);
  const touch = service.status(task.key).approvalQueue[0];
  assert.equal(touch.state, "stopped");
  assert.equal(touch.risk.action, "human_required");
  assert.equal(service.status(task.key).counters.skipped, 1);
  assert.equal(cloud.calls.some((call) => call.type === "send"), false);
});

test("discovery timeout is retried and does not falsely complete the task", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-acquisition-"));
  const timeout = Object.assign(new Error("read operation timed out"), { code: "DOUYIN_MCP_TIMEOUT" });
  const prospect = fakeProspect({ leads: [lead()], errors: [timeout, timeout] });
  const { service } = build(directory, { prospect, maxScanAttempts: 2 });
  const task = await service.createTask(context(), config());
  await service.start(task.key, { runImmediately: false });
  const result = await service.runOnce(task.key);
  assert.equal(result.retryQueued, true);
  assert.ok(["running", "degraded"].includes(service.status(task.key).state));
  assert.equal(service.status(task.key).retryCounts.scan, 1);
  await service.retry(task.key);
  await service.runOnce(task.key);
  assert.equal(service.status(task.key).approvalQueue.length, 1);
});

test("unknown receipt stays unknown until reconciliation and is never reported as sent", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-acquisition-"));
  const cloud = fakeCloud({ sendResults: [{ ok: true, state: "unknown" }] });
  const { service } = build(directory, { cloud, prospect: fakeProspect({ leads: [eligibleLead()] }) });
  const task = await service.createTask(context(), config());
  await service.start(task.key, { runImmediately: false });
  await service.runOnce(task.key);
  assert.equal(service.status(task.key).approvalQueue[0].state, "unknown");
  assert.notEqual(service.status(task.key).approvalQueue[0].state, "delivered");
});

test("provider touch receipts are mirrored through the acquisition event sink", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-acquisition-"));
  const cloud = fakeCloud({ sendResults: [{ ok: true, state: "delivered", message_id: "message-sink-1" }] });
  const mirrored = [];
  const { service } = build(directory, { cloud, eventSink: (event) => mirrored.push(event), prospect: fakeProspect({ leads: [eligibleLead()] }) });
  const task = await service.createTask(context({ taskId: "task-receipt-sink", taskRunId: "run-receipt-sink" }), config());
  await service.start(task.key, { runImmediately: false });
  await service.runOnce(task.key);
  const receipt = mirrored.find((event) => event.type === "touch_receipt");
  assert.ok(receipt);
  assert.equal(receipt.payload.state, "delivered");
  assert.equal(receipt.payload.providerMessageId, "message-sink-1");
  assert.equal(receipt.taskId, "task-receipt-sink");
  assert.equal(receipt.taskState, "running");
  assert.equal(receipt.runtimeState, "RUNNING");
  assert.equal(receipt.health, "OK");
  assert.equal(receipt.payload.taskState, "running");
  assert.equal(receipt.payload.runtimeState, "RUNNING");
  assert.equal(receipt.payload.health, "OK");
});

test("pause, resume, stop, and retry preserve the queue and are idempotent", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-acquisition-"));
  const { service } = build(directory);
  const task = await service.createTask(context(), config());
  await service.start(task.key, { runImmediately: false });
  await service.runOnce(task.key);
  await service.pause(task.key);
  assert.equal(service.status(task.key).state, "paused");
  assert.equal(service.status(task.key).approvalQueue.length, 1);
  await service.resume(task.key, { runImmediately: false });
  assert.equal(service.status(task.key).state, "running");
  await service.stop(task.key);
  await service.stop(task.key);
  assert.equal(service.status(task.key).state, "stopped");
  await assert.rejects(() => service.runOnce(task.key), { code: "DOUYIN_ACQUISITION_STOPPED" });
});

test("stopping a reauthorization-blocked task clears the stale recovery state", async t => {
  const directory = await mkdtemp(join(tmpdir(), "byering-acquisition-stop-blocked-"));
  const first = build(directory);
  t.after(() => first.service.close());
  const task = await first.service.createTask(
    context(),
    config({ sourceScope: { kind: "authorized_account_interactions", accountRef: "https://www.douyin.com/user/sec-account-1" } })
  );
  await first.service.start(task.key, { runImmediately: false });
  first.service.close();

  const offline = build(directory, {
    cloud: fakeCloud({ status: { ok: true, state: "NOT_STARTED", login_state: "logged_out", worker: { online: false } } })
  });
  t.after(() => offline.service.close());
  await offline.service.resumePersisted({ runImmediately: true });
  assert.equal(offline.service.status(task.key).resumeBlocked?.reason, "authorization_required");

  await offline.service.stop(task.key);
  const stopped = offline.service.status(task.key);
  assert.equal(stopped.state, "stopped");
  assert.equal(stopped.resumeBlocked, null);
  assert.equal(stopped.lastError, null);
});

test("composite owner keys isolate tasks and restart resumes only running records once", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-acquisition-"));
  const first = build(directory);
  const one = await first.service.createTask(context(), config());
  const two = await first.service.createTask(context({ accountId: "account-2", taskId: "task-same" }), config());
  assert.notEqual(one.key, two.key);
  await first.service.start(one.key, { runImmediately: false });
  await first.service.start(two.key, { runImmediately: false });
  await first.service.runOnce(one.key);
  await first.service.pause(two.key);

  const secondProspect = fakeProspect({ leads: [lead({ id: "lead-recovered", leadId: "lead-recovered", externalUserId: "user-recovered", secUid: "sec-recovered" })] });
  const second = build(directory, { prospect: secondProspect, autoResume: false });
  const blocked = await second.service.resumePersisted({ runImmediately: true });
  assert.equal(blocked, 0);
  first.service.close();
  const resumed = await second.service.resumePersisted({ runImmediately: true });
  assert.equal(resumed, 1);
  assert.equal(second.service.status(one.key).approvalQueue.length, 2);
  assert.equal(second.service.status(two.key).state, "paused");
  const state = JSON.parse(await readFile(join(directory, "acquisition.json"), "utf8"));
  assert.equal(Object.keys(state.tasks).length, 2);
});

test("restart waits for reauthorization without restarting scans or sending messages", async t => {
  const directory = await mkdtemp(join(tmpdir(), "byering-acquisition-auth-resume-"));
  const first = build(directory);
  t.after(() => first.service.close());
  const task = await first.service.createTask(
    context(),
    config({ sourceScope: { kind: "authorized_account_interactions", accountRef: "https://www.douyin.com/user/sec-account-1" } })
  );
  await first.service.start(task.key, { runImmediately: false });
  first.service.close();

  const offlineProspect = fakeProspect({ leads: [lead()] });
  const offline = build(directory, {
    prospect: offlineProspect,
    cloud: fakeCloud({ status: { ok: true, state: "NOT_STARTED", login_state: "logged_out", worker: { online: false } } })
  });
  t.after(() => offline.service.close());

  assert.equal(await offline.service.resumePersisted({ runImmediately: true }), 0);
  const blocked = offline.service.status(task.key);
  assert.equal(blocked.state, "degraded");
  assert.equal(blocked.resumeBlocked?.reason, "authorization_required");
  assert.equal(blocked.resumeBlocked?.message, "抖音账号需要重新连接后，自动获客会继续。");
  assert.equal(offline.service.listRuntimeTasks()[0].runtimeAlive, false);
  assert.equal(offlineProspect.calls, 0);
  offline.service.close();

  const recovered = build(directory);
  t.after(() => recovered.service.close());
  assert.equal(await recovered.service.resumePersisted({ runImmediately: false }), 1);
  assert.equal(recovered.service.status(task.key).resumeBlocked, null);
  assert.equal(recovered.service.listRuntimeTasks()[0].runtimeAlive, true);
});

test("legacy comment monitoring also waits for reauthorization before it scans", async t => {
  const directory = await mkdtemp(join(tmpdir(), "byering-acquisition-legacy-auth-resume-"));
  const first = build(directory);
  t.after(() => first.service.close());
  const task = await first.service.createTask(context(), config());
  await first.service.start(task.key, { runImmediately: false });
  first.service.close();

  const offlineProspect = fakeProspect({ leads: [lead()] });
  const offline = build(directory, {
    prospect: offlineProspect,
    cloud: fakeCloud({ status: { ok: true, state: "NOT_STARTED", login_state: "logged_out", worker: { online: false } } })
  });
  t.after(() => offline.service.close());

  assert.equal(await offline.service.resumePersisted({ runImmediately: true }), 0);
  const blocked = offline.service.status(task.key);
  assert.equal(blocked.state, "degraded");
  assert.equal(blocked.resumeBlocked?.reason, "authorization_required");
  assert.equal(offlineProspect.calls, 0);
});

test("same account and Agent cannot create the same acquisition task with a new task id", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-acquisition-dedupe-"));
  const { service } = build(directory);
  const first = await service.createTask(context(), config());

  assert.throws(
    () => service.createTask(context({ taskId: "task-copy", taskRunId: "run-copy", conversationId: "conversation-copy" }), config()),
    (error) => {
      assert.equal(error.code, "DOUYIN_ACQUISITION_DUPLICATE_TASK");
      assert.equal(error.statusCode, 409);
      assert.equal(error.details.existingTaskKey, first.key);
      return true;
    }
  );
  assert.equal(service.listTasks().length, 1);
});

test("stopped tasks release the deduplication slot for an intentional restart", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-acquisition-dedupe-stopped-"));
  const { service } = build(directory);
  const first = await service.createTask(context(), config());
  await service.start(first.key, { runImmediately: false });
  await service.stop(first.key);

  const second = await service.createTask(
    context({ taskId: "task-restarted", taskRunId: "run-restarted", conversationId: "conversation-restarted" }),
    config()
  );
  assert.notEqual(second.key, first.key);
  assert.equal(second.state, "configuring");
  assert.equal(service.listTasks().length, 2);
});

test("one account keeps a single continuous acquisition task even when its source scope changes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-acquisition-dedupe-scope-"));
  const { service } = build(directory);
  const first = await service.createTask(context(), config());
  assert.throws(
    () => service.createTask(
      context({ taskId: "task-different-scope", taskRunId: "run-different-scope" }),
      config({ sourceScope: { type: "own_works", videoIds: ["video-2"] } })
    ),
    (error) => error.code === "DOUYIN_ACQUISITION_DUPLICATE_TASK" && error.details.existingTaskKey === first.key
  );
  assert.equal(service.listTasks().length, 1);
});

test("an expired durable acquisition task does not block a fresh task for the same account", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "byering-acquisition-stale-runtime-"));
  const first = build(directory, {
    now: () => "2026-09-01T00:00:00.000Z",
    autoResume: false
  }).service;
  const stale = await first.createTask(context({ taskId: "stale-task", taskRunId: "stale-run" }), config());
  await first.start(stale.key, { runImmediately: false });
  first.close();

  const restored = build(directory, {
    now: () => "2026-09-02T00:00:00.000Z",
    autoResume: false
  }).service;
  t.after(() => restored.close());

  const fresh = await restored.createTask(context({ taskId: "fresh-task", taskRunId: "fresh-run" }), config());
  assert.notEqual(fresh.key, stale.key);
  assert.equal(restored.listTasks().length, 2);
});

test("restart consolidates legacy duplicate continuous tasks and archives stale failures", async t => {
  const directory = await mkdtemp(join(tmpdir(), "byering-acquisition-maintenance-"));
  const first = build(directory, { now: () => "2026-09-01T00:00:00.000Z" }).service;
  t.after(() => first.close());
  const oldest = await first.createTask(
    context({ taskId: "legacy-1", taskRunId: "legacy-run-1" }),
    config({ accountRef: "legacy-account-one", accountIdentity: { secId: "legacy-account-one" } })
  );
  const newest = await first.createTask(
    context({ taskId: "legacy-2", taskRunId: "legacy-run-2", accountId: "account-2" }),
    config({ accountIdentity: { secId: "legacy-account-two" }, accountRef: "legacy-account-two" })
  );
  await first.start(oldest.key, { runImmediately: false });
  await first.start(newest.key, { runImmediately: false });
  first.close();

  const persisted = JSON.parse(await readFile(join(directory, "acquisition.json"), "utf8"));
  persisted.tasks[newest.key].context.accountId = persisted.tasks[oldest.key].context.accountId;
  persisted.tasks[newest.key].config.accountIdentity = persisted.tasks[oldest.key].config.accountIdentity;
  persisted.tasks[newest.key].config.accountRef = persisted.tasks[oldest.key].config.accountRef;
  persisted.tasks[newest.key].accountIdentity = persisted.tasks[oldest.key].config.accountIdentity;
  persisted.tasks[newest.key].updatedAt = "2026-09-02T00:00:00.000Z";
  persisted.tasks[oldest.key].updatedAt = "2026-09-01T00:00:00.000Z";
  const stale = structuredClone(persisted.tasks[oldest.key]);
  stale.key = "mkt-comment-acquisition::legacy-error::account-legacy-error";
  stale.context = { ...stale.context, taskId: "legacy-error", taskRunId: "legacy-error-run", conversationId: "legacy-error-conversation", accountId: "account-legacy-error" };
  stale.state = "error";
  stale.updatedAt = "2026-09-01T00:00:00.000Z";
  persisted.tasks[stale.key] = stale;
  await writeFile(join(directory, "acquisition.json"), JSON.stringify(persisted));

  const restored = build(directory, { now: () => "2026-09-08T00:00:00.000Z", autoResume: false }).service;
  t.after(() => restored.close());
  assert.equal(restored.listTasks().length, 2);
  assert.equal(restored.listTasks({ includeArchived: true }).length, 3);
  assert.equal(restored.status(oldest.key).state, "paused");
  assert.ok(restored.status(oldest.key).systemPause?.primaryTaskKey);
  assert.ok(restored.listTasks({ includeArchived: true }).find(task => task.key === stale.key)?.archivedAt);
  assert.equal(restored.status(newest.key).state, "running");
});

test("duplicate maintenance repairs a legacy system-pause cycle with one stable primary", async t => {
  const directory = await mkdtemp(join(tmpdir(), "byering-acquisition-pause-cycle-"));
  const first = build(directory, { now: () => "2026-09-01T00:00:00.000Z" }).service;
  t.after(() => first.close());
  const oldest = await first.createTask(
    context({ taskId: "cycle-old", taskRunId: "cycle-old-run" }),
    config({ accountRef: "cycle-account", accountIdentity: { secId: "cycle-account" } })
  );
  const newest = await first.createTask(
    context({ taskId: "cycle-new", taskRunId: "cycle-new-run", accountId: "account-2" }),
    config({ accountRef: "cycle-account-two", accountIdentity: { secId: "cycle-account-two" } })
  );
  first.close();

  const file = join(directory, "acquisition.json");
  const persisted = JSON.parse(await readFile(file, "utf8"));
  persisted.tasks[newest.key].context.accountId = persisted.tasks[oldest.key].context.accountId;
  persisted.tasks[newest.key].config.accountRef = persisted.tasks[oldest.key].config.accountRef;
  persisted.tasks[newest.key].config.accountIdentity = persisted.tasks[oldest.key].config.accountIdentity;
  persisted.tasks[newest.key].accountIdentity = persisted.tasks[oldest.key].accountIdentity;
  persisted.tasks[newest.key].createdAt = "2026-09-02T00:00:00.000Z";
  for (const task of [persisted.tasks[oldest.key], persisted.tasks[newest.key]]) {
    task.state = "paused";
    task.systemPause = {
      reason: "system_duplicate_consolidation",
      primaryTaskKey: task.key === newest.key ? oldest.key : newest.key,
      pausedAt: "2026-09-02T00:00:00.000Z",
      message: "legacy"
    };
    task.updatedAt = "2026-09-03T00:00:00.000Z";
  }
  await writeFile(file, JSON.stringify(persisted));

  const restored = build(directory, { now: () => "2026-09-08T00:00:00.000Z", autoResume: false }).service;
  t.after(() => restored.close());
  assert.equal(restored.status(newest.key).state, "degraded");
  assert.equal(restored.status(newest.key).systemPause, null);
  assert.equal(restored.status(oldest.key).state, "paused");
  assert.equal(restored.status(oldest.key).systemPause?.primaryTaskKey, newest.key);
});

test("same external account identity is deduplicated even when local account aliases differ", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-acquisition-dedupe-account-alias-"));
  const firstService = build(directory).service;
  const secondService = build(directory).service;
  await firstService.createTask(
    context(),
    config({ accountRef: "https://www.douyin.com/user/sec-account-1", accountIdentity: { secId: "sec-account-1", nickname: "门店账号" } })
  );

  assert.throws(
    () => secondService.createTask(
      context({ accountId: "account-alias", taskId: "task-account-alias", taskRunId: "run-account-alias" }),
      config({
        accountRef: "sec-account-1",
        accountIdentity: { sec_id: "sec-account-1", account_name: "门店账号（已更新）" },
        sourceScope: { type: "own_works", videoIds: ["video-1"], accountId: "account-alias", accountName: "门店账号（已更新）" }
      })
    ),
    (error) => error.code === "DOUYIN_ACQUISITION_DUPLICATE_TASK"
  );
});

test("separate service instances cannot create the same active task twice", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-acquisition-dedupe-race-"));
  const first = build(directory).service;
  const second = build(directory).service;
  const results = await Promise.allSettled([
    Promise.resolve().then(() => first.createTask(context({ taskId: "task-race-a", taskRunId: "run-race-a" }), config())),
    Promise.resolve().then(() => second.createTask(context({ taskId: "task-race-b", taskRunId: "run-race-b" }), config()))
  ]);

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const rejected = results.find((result) => result.status === "rejected");
  assert.equal(rejected.reason.code, "DOUYIN_ACQUISITION_DUPLICATE_TASK");
  const persisted = JSON.parse(await readFile(join(directory, "acquisition.json"), "utf8"));
  assert.equal(Object.keys(persisted.tasks).length, 1);
});

test("manager and finder can use the same account even when finder delegates to the manager runtime", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-acquisition-dedupe-agent-"));
  const { service } = build(directory);
  const first = await service.createTask(context(), config());
  const second = await service.createTask(
    context({
      agentId: "mkt-find-people",
      executionAgentId: "mkt-comment-acquisition",
      taskId: "task-finder",
      taskRunId: "run-finder"
    }),
    config({ sourceScope: { kind: "authorized_account_live", roomId: "room-1" } })
  );

  assert.notEqual(second.key, first.key);
  assert.equal(second.context.executionAgentId, "mkt-comment-acquisition");
  assert.equal(service.listTasks().length, 2);
});

test("task fingerprint is stable when config object key order changes", () => {
  const first = acquisitionTaskFingerprint(
    context({ taskId: "task-order-1", taskRunId: "run-order-1" }),
    config({ audienceRules: { goal: "找高意向客户", minScore: 80 } })
  );
  const second = acquisitionTaskFingerprint(
    context({ taskId: "task-order-2", taskRunId: "run-order-2", conversationId: "conversation-order-2" }),
    config({ audienceRules: { minScore: 80, goal: "找高意向客户" } })
  );
  assert.ok(first);
  assert.equal(second, first);
});

test("unknown acquisition identifiers cannot create a new task", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-acquisition-"));
  const { service } = build(directory);
  assert.throws(
    () => service.createTask(context({ agentId: "unknown-agent" }), config({ sourceScope: { type: "live_room", roomId: "room-1" } })),
    { code: "DOUYIN_ACQUISITION_AGENT_INVALID" }
  );
  assert.equal(service.listTasks().length, 0);
});

test("finder-owned live discovery keeps finder ownership and routes execution to the acquisition cloud", async t => {
  const directory = await mkdtemp(join(tmpdir(), "byering-finder-live-acquisition-"));
  const cloudCalls = [];
  const liveService = {
    configured: true,
    async startLivePolling() { return { ok: true }; },
    async pullLiveMessages() { return { ok: true, messages: [] }; }
  };
  const cloud = {
    configured: true,
    async status(agentId) {
      cloudCalls.push({ type: "status", agentId });
      return { ok: true, state: "ONLINE", login_state: "logged_in", session_id: "live-session" };
    },
    getService(agentId) {
      cloudCalls.push({ type: "service", agentId });
      return agentId === "mkt-douyin-account-runtime" ? liveService : null;
    }
  };
  let scanInput = null;
  const interactionSource = {
    async scan(input) {
      scanInput = input;
      return {
        leads: [lead({ source: { type: "live_chat", roomId: "room-1", observedAt: "2026-09-11T00:00:00.000Z" } })],
        profiles: {},
        nextCursor: { live: 1, notifications: 0 },
        snapshot: { sources: { live: { state: "receiving", count: 1 } }, counts: { candidates: 1 } }
      };
    }
  };
  const { service } = build(directory, { cloud, interactionSource });
  t.after(() => service.close());
  const task = await service.createTask(
    context({
      agentId: "mkt-find-people",
      executionAgentId: "mkt-comment-acquisition",
      taskId: "finder-live-task",
      taskRunId: "finder-live-run"
    }),
    config({ sourceScope: { kind: "authorized_account_live" } })
  );

  assert.equal(task.context.agentId, "mkt-find-people");
  assert.equal(task.context.executionAgentId, "mkt-comment-acquisition");
  await service.start(task.key, { runImmediately: false });
  await service.runOnce(task.key);

  assert.equal(scanInput.agentId, "mkt-douyin-account-runtime");
  assert.equal(scanInput.liveOnly, true);
  assert.ok(cloudCalls.some(call => call.type === "status" && call.agentId === "mkt-douyin-account-runtime"));
  assert.equal(service.status(task.key).context.agentId, "mkt-find-people");
  assert.equal(service.status(task.key).resultSnapshot.counts.candidates, 1);
});

test("live danmaku analysis only collects during the livestream", async t => {
  const directory = await mkdtemp(join(tmpdir(), "byering-live-danmaku-analysis-"));
  let scanInput = null;
  const interactionSource = {
    async scan(input) {
      scanInput = input;
      return {
        leads: [],
        liveSignals: [
          { userId: "user-question", nickname: "问价用户", type: "live_chat", text: "多少钱？有现货吗", roomId: "room-1" },
          { userId: "user-like", nickname: "点赞用户", type: "like", roomId: "room-1" },
          { userId: "user-gift", nickname: "送礼用户", type: "gift", roomId: "room-1" }
        ],
        profiles: {
          "user-question": {
            userId: "user-question",
            nickname: "问价用户",
            evidence: [{ type: "live_chat", quote: "多少钱？有现货吗", roomId: "room-1" }]
          },
          "user-like": {
            userId: "user-like",
            nickname: "点赞用户",
            evidence: [{ type: "like", roomId: "room-1" }]
          },
          "user-gift": {
            userId: "user-gift",
            nickname: "送礼用户",
            evidence: [{ type: "gift", roomId: "room-1" }]
          }
        },
        nextCursor: { live: 1, notifications: 0 },
        snapshot: {
          sources: { live: { state: "receiving", count: 3 } },
          counts: { signals: 3 }
        }
      };
    }
  };
  const { service } = build(directory, { interactionSource, prospect: null });
  t.after(() => service.close());
  const task = await service.createTask(
    context({
      agentId: "mkt-live-danmaku-analysis",
      executionAgentId: "mkt-comment-acquisition",
      taskId: "live-danmaku-task",
      taskRunId: "live-danmaku-run"
    }),
    config({
      sourceScope: { kind: "authorized_account_live" },
      discoveryOnly: true,
      analysisOnly: true,
      analysisKind: "live_danmaku",
      liveSignals: ["likes", "gifts"],
      approvalMode: "manual",
      autoStartCloud: false,
      audienceRules: { goal: "识别直播间的价格问题和购买意向", minScore: 0 }
    })
  );

  await service.start(task.key, { runImmediately: false });
  await service.runOnce(task.key);

  const snapshot = service.status(task.key);
  assert.equal(scanInput.agentId, "mkt-douyin-account-runtime");
  assert.equal(scanInput.liveOnly, true);
  assert.equal(scanInput.includeLive, true);
  assert.equal(scanInput.includeNotifications, false);
  assert.equal(scanInput.analysisMode, "collect");
  assert.equal(snapshot.resultSnapshot.status, "collecting");
  assert.equal(snapshot.resultSnapshot.danmakuAnalysis, undefined);
  assert.equal(snapshot.resultSnapshot.collectionSnapshot.totalDanmaku, 1);
  assert.equal(snapshot.resultSnapshot.collectionSnapshot.uniqueUsers, 1);
  assert.equal(snapshot.approvalQueue.length, 0);
  assert.equal(snapshot.state, "running");
});

test("live danmaku analysis finalizes once after livestream ends with all collected signals", async t => {
  const directory = await mkdtemp(join(tmpdir(), "byering-live-danmaku-finalize-"));
  let scanCount = 0;
  const finalizerCalls = [];
  const interactionSource = {
    async scan() {
      scanCount += 1;
      return scanCount === 1 ? {
        leads: [],
        liveSignals: [{ userId: "user-1", nickname: "问价用户", type: "live_chat", text: "多少钱？", roomId: "room-1" }],
        profiles: {},
        nextCursor: { live: 1, notifications: 0 },
        snapshot: { sources: { live: { state: "receiving", count: 1 } }, counts: { signals: 1 } }
      } : {
        leads: [],
        liveSignals: [{ userId: "user-2", nickname: "库存用户", type: "live_chat", text: "有现货吗？", roomId: "room-1" }],
        profiles: {},
        nextCursor: { live: 2, notifications: 0 },
        snapshot: { sources: { live: { state: "ended", count: 1, reason: "live_ended" } }, counts: { signals: 1 } }
      };
    },
    async finalizeLiveDanmakuAnalysis({ signals, goal }) {
      finalizerCalls.push({ signals, goal });
      return analyzeLiveDanmakuSignals({ signals, goal, now: "2026-09-16T10:00:00.000Z" });
    }
  };
  const { service } = build(directory, { interactionSource, prospect: null });
  t.after(() => service.close());
  const task = await service.createTask(
    context({ agentId: "mkt-live-danmaku-analysis", executionAgentId: "mkt-comment-acquisition", taskId: "live-danmaku-finalize-task", taskRunId: "live-danmaku-finalize-run" }),
    config({ sourceScope: { kind: "authorized_account_live" }, discoveryOnly: true, analysisOnly: true, analysisKind: "live_danmaku", liveSignals: ["danmaku"], autoStartCloud: false, audienceRules: { goal: "识别价格和库存问题", minScore: 0 } })
  );

  await service.start(task.key, { runImmediately: false });
  await service.runOnce(task.key);
  await service.runOnce(task.key);

  const snapshot = service.status(task.key);
  assert.equal(finalizerCalls.length, 1);
  assert.equal(finalizerCalls[0].signals.length, 2);
  assert.equal(finalizerCalls[0].goal, "识别价格和库存问题");
  assert.equal(snapshot.state, "completed");
  assert.equal(snapshot.resultSnapshot.status, "completed");
  assert.deepEqual(snapshot.resultSnapshot.danmakuAnalysis.counts, {
    total: 2,
    danmaku: 2,
    uniqueUsers: 2,
    questions: 2,
    highIntent: 2,
    mediumIntent: 0,
    behaviorOnly: 0
  });
  assert.equal(snapshot.resultSnapshot.collectionSnapshot.totalDanmaku, 2);
  assert.equal(snapshot.resultSnapshot.leads.length, 2);
});

test("live danmaku outreach touches every unique danmaku user without intent analysis", async t => {
  const directory = await mkdtemp(join(tmpdir(), "byering-live-danmaku-outreach-"));
  let scanInput = null;
  let touchGeneratorCalls = 0;
  const interactionSource = {
    async scan(input) {
      scanInput = input;
      return {
        leads: [
          lead({
            externalUserId: "danmaku-user-1",
            secUid: "sec-danmaku-user-1",
            text: "随便看看",
            score: 0,
            tier: "low",
            intent: undefined,
            source: { type: "live_chat", roomId: "room-1" },
            evidence: [{ type: "live_chat", quote: "随便看看", roomId: "room-1" }]
          }),
          lead({
            externalUserId: "danmaku-user-2",
            secUid: "sec-danmaku-user-2",
            text: "我不确定是不是买过",
            score: 0,
            tier: "low",
            intent: undefined,
            source: { type: "live_chat", roomId: "room-1" },
            evidence: [{ type: "live_chat", quote: "我不确定是不是买过", roomId: "room-1" }]
          })
        ],
        profiles: {},
        nextCursor: { live: 2, notifications: 0 },
        snapshot: { sources: { live: { state: "receiving", count: 2 } }, counts: { signals: 2 } }
      };
    }
  };
  const cloud = fakeCloud();
  const { service } = build(directory, {
    cloud,
    interactionSource,
    prospect: null,
    touchGenerator: async () => {
      touchGeneratorCalls += 1;
      return "这条消息不应该覆盖直播弹幕触达默认话术";
    }
  });
  t.after(() => service.close());
  const task = await service.createTask(
    context({
      agentId: "mkt-live-danmaku-outreach",
      executionAgentId: "mkt-comment-acquisition",
      taskId: "live-outreach-task",
      taskRunId: "live-outreach-run"
    }),
    config({
      sourceScope: { kind: "authorized_account_live" },
      liveDanmakuOutreach: true,
      touchEveryLiveDanmaku: true,
      analysisKind: "live_danmaku_outreach",
      liveSignals: ["danmaku"],
      approvalMode: "auto",
      contentPolicy: { strategy: "看到你刚才在直播间留言了，方便说说你想了解什么吗？" }
    })
  );

  await service.start(task.key, { runImmediately: false });
  await service.runOnce(task.key);

  const snapshot = service.status(task.key);
  assert.equal(scanInput.liveOnly, true);
  assert.equal(scanInput.includeNotifications, false);
  assert.equal(scanInput.includeLive, true);
  assert.equal(scanInput.analysisMode, "collect");
  assert.equal(snapshot.config.discoveryOnly, false);
  assert.equal(snapshot.config.analysisOnly, false);
  assert.equal(snapshot.approvalQueue.length, 2);
  assert.equal(snapshot.approvalQueue.every((touch) => touch.autoApproved === true), true);
  assert.equal(snapshot.approvalQueue.every((touch) => touch.risk.action === "auto_send"), true);
  assert.equal(snapshot.approvalQueue.every((touch) => touch.content.includes("直播间留言")), true);
  assert.equal(touchGeneratorCalls, 0);
  assert.equal(cloud.calls.filter((call) => call.type === "send").length, 2);
  assert.equal(snapshot.resultSnapshot.counts.newCandidates, 2);
});

test("finder combines comments, live interactions, and account notifications in one authorized listener", async t => {
  const directory = await mkdtemp(join(tmpdir(), "byering-finder-combined-acquisition-"));
  const cloudCalls = [];
  const liveService = {
    configured: true,
    async startLivePolling() { return { ok: true }; },
    async pullLiveMessages() { return { ok: true, messages: [] }; }
  };
  const cloud = {
    configured: true,
    async status(agentId) {
      cloudCalls.push({ type: "status", agentId });
      return { ok: true, state: "ONLINE", login_state: "logged_in", session_id: "combined-session" };
    },
    getService(agentId) {
      cloudCalls.push({ type: "service", agentId });
      return agentId === "mkt-douyin-account-runtime" ? liveService : null;
    }
  };
  let scanInput = null;
  const interactionSource = {
    async scan(input) {
      scanInput = input;
      return {
        leads: [lead()],
        profiles: {},
        nextCursor: { live: 1, notifications: 1 },
        snapshot: {
          sources: {
            notifications: { state: "listening", count: 1 },
            live: { state: "receiving", count: 1 }
          },
          counts: { candidates: 1 }
        }
      };
    }
  };
  const { service } = build(directory, { cloud, interactionSource });
  t.after(() => service.close());
  const task = await service.createTask(
    context({
      agentId: "mkt-find-people",
      executionAgentId: "mkt-comment-acquisition",
      taskId: "finder-combined-task",
      taskRunId: "finder-combined-run"
    }),
    config({ sourceScope: { kind: "authorized_account_all_signals" }, discoveryOnly: true })
  );

  await service.start(task.key, { runImmediately: false });
  await service.runOnce(task.key);

  assert.equal(scanInput.agentId, "mkt-douyin-account-runtime");
  assert.equal(scanInput.liveOnly, false);
  assert.equal(scanInput.includeNotifications, true);
  assert.equal(scanInput.includeLive, true);
  assert.ok(cloudCalls.some(call => call.type === "status" && call.agentId === "mkt-douyin-account-runtime"));
  assert.equal(service.status(task.key).resultSnapshot.counts.candidates, 1);
});

test("finder can continuously listen to authorized account comments with the shared cloud runtime", async t => {
  const directory = await mkdtemp(join(tmpdir(), "byering-finder-live-scope-"));
  const { service } = build(directory);
  t.after(() => service.close());

  const task = await service.createTask(
    context({
      agentId: "mkt-find-people",
      executionAgentId: "mkt-comment-acquisition",
      taskId: "finder-non-live-task",
      taskRunId: "finder-non-live-run"
    }),
    config({
      sourceScope: { kind: "authorized_account_comments" },
      discoveryOnly: true
    })
  );

  assert.equal(task.context.agentId, "mkt-find-people");
  assert.equal(task.context.executionAgentId, "mkt-comment-acquisition");
  assert.equal(task.config.sourceScope.kind, "authorized_account_comments");
  assert.equal(task.config.discoveryOnly, true);
  assert.equal(task.config.touchChannel, undefined);
  assert.equal(task.config.contentPolicy, undefined);
});

test("finder listener asks authorized sources to collect users without scoring intent", async t => {
  const directory = await mkdtemp(join(tmpdir(), "byering-finder-collect-mode-"));
  let received = null;
  const { service } = build(directory, {
    interactionSource: {
      async scan(input) {
        received = input;
        return { leads: [lead()], profiles: {}, nextCursor: { notifications: 1, live: 0 }, snapshot: { counts: { candidates: 1 } } };
      }
    }
  });
  t.after(() => service.close());
  const task = await service.createTask(
    context({ agentId: "mkt-find-people", executionAgentId: "mkt-comment-acquisition", taskId: "finder-collect", taskRunId: "finder-collect-run" }),
    config({ sourceScope: { kind: "authorized_account_interactions" }, discoveryOnly: true })
  );
  await service.start(task.key, { runImmediately: false });
  await service.runOnce(task.key);
  assert.equal(received.analysisMode, "collect");
  assert.equal(service.status(task.key).approvalQueue.length, 0);
});

test("finder listener rejects outreach-capable task creation even when a caller bypasses the UI", async t => {
  const directory = await mkdtemp(join(tmpdir(), "byering-finder-discovery-boundary-"));
  const { service } = build(directory);
  t.after(() => service.close());

  assert.throws(() => service.createTask(
    context({
      agentId: "mkt-find-people",
      executionAgentId: "mkt-comment-acquisition",
      taskId: "finder-discovery-boundary",
      taskRunId: "finder-discovery-boundary-run"
    }),
    config({ sourceScope: { kind: "authorized_account_comments" }, discoveryOnly: false })
  ), (error) => error?.code === "DOUYIN_DISCOVERY_ONLY_REQUIRED");
});

test("persisted running state can be loaded without replaying old events", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-acquisition-"));
  const { service } = build(directory);
  const task = await service.createTask(context(), config());
  await service.start(task.key, { runImmediately: false });
  await service.runOnce(task.key);
  const before = service.status(task.key);
  const restarted = build(directory, { autoResume: false }).service;
  assert.equal(restarted.status(task.key).events.length, before.events.length);
  await writeFile(join(directory, "marker"), "ok");
});

test("unknown touch receipts require reconciliation before retry", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-acquisition-"));
  const cloud = fakeCloud({ sendResults: [{ ok: true, state: "unknown" }] });
  const { service } = build(directory, { cloud, prospect: fakeProspect({ leads: [eligibleLead()] }) });
  const task = await service.createTask(context(), config());
  await service.start(task.key, { runImmediately: false });
  await service.runOnce(task.key);
  const touchId = service.status(task.key).approvalQueue[0].touchId;
  await assert.rejects(() => service.retry(task.key, touchId), { code: "DOUYIN_TOUCH_RETRY_REQUIRES_RECONCILE" });
  assert.equal(service.status(task.key).approvalQueue[0].state, "unknown");
});

test("parent retry cannot resurrect configuring or stopped tasks", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-acquisition-"));
  const { service } = build(directory);
  const configuring = await service.createTask(context(), config());
  await assert.rejects(() => service.retry(configuring.key), { code: "DOUYIN_ACQUISITION_RETRY_INVALID" });

  const stopped = await service.createTask(
    context({ taskId: "task-stopped", taskRunId: "run-stopped", accountId: "account-stopped" }),
    config({ sourceScope: { type: "own_works", videoIds: ["video-stopped"] }, accountRef: "sec-account-stopped", accountIdentity: { secId: "sec-account-stopped" } })
  );
  await service.start(stopped.key, { runImmediately: false });
  await service.stop(stopped.key);
  await assert.rejects(() => service.retry(stopped.key), { code: "DOUYIN_ACQUISITION_RETRY_INVALID" });
  assert.equal(service.status(stopped.key).state, "stopped");
});

test("获客专家 rejects public-comment reply configuration before a task can run", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-acquisition-"));
  const { service } = build(directory);
  assert.throws(
    () => service.createTask(context({ taskId: "task-public-reply", taskRunId: "run-public-reply" }), config({ touchChannel: "public_reply" })),
    (error) => error?.code === "DOUYIN_COMMENT_ACQUISITION_TOUCH_CHANNEL_FIXED"
  );
});

test("获客专家 refuses to switch an active listener from private outreach to public reply", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-acquisition-"));
  const { service } = build(directory);
  const task = await service.createTask(context({ taskId: "task-public-reply-active", taskRunId: "run-public-reply-active" }), config());
  assert.throws(() => service.updateTaskConfig(task.key, {
    expectedVersion: task.eventSeq,
    baseConfigVersion: 1,
    configVersion: 2,
    effectiveScope: "future_only",
    changes: { touchContent: { channel: "public_reply" } },
    confirmation: { confirmed: true }
  }), (error) => error?.code === "DOUYIN_COMMENT_ACQUISITION_TOUCH_CHANNEL_FIXED");
});

test("unknown receipt reconciliation failures return to unknown for a later check", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-acquisition-"));
  const cloud = fakeCloud({ sendResults: [{ ok: true, state: "unknown" }] });
  const serviceCloud = cloud;
  serviceCloud.getService = () => ({
    configured: true,
    async startLivePolling() { return { ok: true, state: "running" }; },
    async pullLiveMessages() { return { ok: true, messages: [] }; },
    async sendPrivateMessage(payload) { return cloud.calls.push({ type: "send", payload }) && { ok: true, state: "unknown" }; },
    async getMessageStatus() { throw Object.assign(new Error("receipt endpoint timeout"), { code: "DOUYIN_MCP_TIMEOUT" }); }
  });
  const { service } = build(directory, { cloud: serviceCloud, prospect: fakeProspect({ leads: [eligibleLead()] }) });
  const task = await service.createTask(context({ taskId: "task-reconcile-error", taskRunId: "run-reconcile-error" }), config());
  await service.start(task.key, { runImmediately: false });
  await service.runOnce(task.key);
  const touchId = service.status(task.key).approvalQueue[0].touchId;
  await service.reconcileTouch(task.key, touchId);
  assert.equal(service.status(task.key).approvalQueue[0].state, "unknown");
});

test("malformed provider receipts remain unknown and do not increment sent counters", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-acquisition-"));
  const cloud = fakeCloud({ sendResults: [{}] });
  const { service } = build(directory, { cloud, prospect: fakeProspect({ leads: [eligibleLead()] }) });
  const task = await service.createTask(context({ taskId: "task-malformed-receipt", taskRunId: "run-malformed-receipt" }), config());
  await service.start(task.key, { runImmediately: false });
  await service.runOnce(task.key);
  const snapshot = service.status(task.key);
  assert.equal(snapshot.approvalQueue[0].state, "unknown");
  assert.equal(snapshot.counters.sent, 0);
});

test("provider status ok without an explicit delivery state stays unknown", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-acquisition-"));
  const cloud = fakeCloud({ sendResults: [{ status: "ok" }] });
  const { service } = build(directory, { cloud, prospect: fakeProspect({ leads: [eligibleLead()] }) });
  const task = await service.createTask(context({ taskId: "task-status-ok", taskRunId: "run-status-ok" }), config());
  await service.start(task.key, { runImmediately: false });
  await service.runOnce(task.key);
  const snapshot = service.status(task.key);
  assert.equal(snapshot.approvalQueue[0].state, "unknown");
  assert.equal(snapshot.counters.sent, 0);
});

test("provider status ok cannot be promoted by a conflicting delivery state", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-acquisition-"));
  const cloud = fakeCloud({ sendResults: [{ status: "ok", state: "delivered" }] });
  const { service } = build(directory, { cloud, prospect: fakeProspect({ leads: [eligibleLead()] }) });
  const task = await service.createTask(context({ taskId: "task-status-conflict", taskRunId: "run-status-conflict" }), config());
  await service.start(task.key, { runImmediately: false });
  await service.runOnce(task.key);
  const snapshot = service.status(task.key);
  assert.equal(snapshot.approvalQueue[0].state, "unknown");
  assert.equal(snapshot.counters.sent, 0);
});

test("live danmaku outreach only stops when the provider reports an account quota", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "byering-live-outreach-quota-"));
  const quotaError = Object.assign(new Error("账号私信发送频控已达上限"), { code: "DOUYIN_DM_DAILY_LIMIT" });
  const cloud = fakeCloud({ sendResults: [quotaError] });
  const { service } = build(directory, { cloud, prospect: fakeProspect({ leads: [eligibleLead()] }) });
  t.after(() => service.close());
  const task = await service.createTask(context({
    agentId: "mkt-live-danmaku-outreach",
    executionAgentId: "mkt-comment-acquisition",
    taskId: "live-outreach-quota",
    taskRunId: "live-outreach-quota-run"
  }), config({
    sourceScope: { kind: "authorized_account_live" },
    liveDanmakuOutreach: true,
    touchEveryLiveDanmaku: true,
    frequency: { maxTouchesPerDay: 60 },
    caps: { dailyMax: null, sendIntervalMs: 0, cooldownMs: 0 }
  }));

  assert.equal(task.config.caps.dailyMax, null);
  assert.equal(isProviderOutreachQuotaError(quotaError), true);
  assert.equal(isProviderOutreachQuotaError({ code: "private_message_failed", message: "对方设置了私信限制" }), false);
  await service.start(task.key, { runImmediately: false });
  await service.runOnce(task.key);

  const snapshot = service.status(task.key);
  assert.equal(snapshot.configuration.frequency.maxTouchesPerDay, null);
  assert.equal(snapshot.counters.sent, 0);
  assert.equal(snapshot.state, "paused");
  assert.equal(snapshot.resumeBlocked.reason, "provider_outreach_quota_reached");
  assert.equal(snapshot.outreachQuota.reached, true);
  assert.equal(snapshot.outreachQuota.sentCount, 0);
});

test("live danmaku outreach rejects attempts to restore a product-side daily cap", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "byering-live-outreach-cap-update-"));
  const { service } = build(directory);
  t.after(() => service.close());
  const task = await service.createTask(context({
    agentId: "mkt-live-danmaku-outreach",
    executionAgentId: "mkt-comment-acquisition",
    taskId: "live-outreach-cap-update",
    taskRunId: "live-outreach-cap-update-run"
  }), config({
    sourceScope: { kind: "authorized_account_live" },
    liveDanmakuOutreach: true,
    touchEveryLiveDanmaku: true,
    caps: { dailyMax: null, sendIntervalMs: 0, cooldownMs: 0 }
  }));

  assert.throws(() => service.updateTaskConfig(task.key, {
    baseConfigVersion: 1,
    configVersion: 2,
    expectedVersion: task.eventSeq,
    effectiveScope: "future_only",
    changes: { frequency: { maxTouchesPerDay: 20 } }
  }), (error) => error?.code === "DOUYIN_LIVE_OUTREACH_PRODUCT_CAP_FORBIDDEN");
});

test("concurrent runOnce calls for one owner key execute only once", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-acquisition-"));
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const prospect = fakeProspect({ leads: [] });
  const originalDiscover = prospect.discover;
  prospect.discover = async (...args) => { await gate; return originalDiscover(...args); };
  const { service } = build(directory, { prospect });
  const task = await service.createTask(context({ taskId: "task-active-run", taskRunId: "run-active-run" }), config());
  await service.start(task.key, { runImmediately: false });
  const first = service.runOnce(task.key);
  await new Promise((resolve) => setImmediate(resolve));
  const second = await service.runOnce(task.key);
  assert.equal(second.leaseHeld, true);
  release();
  await first;
  assert.equal(prospect.calls, 1);
});

test("concurrent runOnce calls across service instances fail closed for one owner key", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-acquisition-"));
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const firstProspect = fakeProspect({ leads: [] });
  const originalDiscover = firstProspect.discover;
  firstProspect.discover = async (...args) => { await gate; return originalDiscover(...args); };
  const first = build(directory, { prospect: firstProspect });
  const task = await first.service.createTask(context({ taskId: "task-cross-instance", taskRunId: "run-cross-instance" }), config());
  await first.service.start(task.key, { runImmediately: false });
  const secondProspect = fakeProspect({ leads: [] });
  const second = build(directory, { prospect: secondProspect, autoResume: false });

  const firstRun = first.service.runOnce(task.key);
  await new Promise((resolve) => setImmediate(resolve));
  const secondRun = await second.service.runOnce(task.key);
  assert.equal(secondRun.leaseHeld, true);
  assert.equal(secondProspect.calls, 0);
  release();
  await firstRun;
  assert.equal(firstProspect.calls, 1);
  first.service.close();
  second.service.close();
});

test("capability probe results survive service reconstruction", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-acquisition-"));
  const first = build(directory).service;
  const recorded = await first.recordCapabilityProbe("commentPublicReply", { state: "passed", executorReady: true, evidence: "verified" });
  const second = build(directory).service;
  assert.deepEqual(second.readCapabilityProbe("commentPublicReply"), recorded);
  assert.throws(
    () => second.createTask(context({ taskId: "task-probe-persisted", taskRunId: "run-probe-persisted" }), config({ touchChannel: "public_reply" })),
    (error) => error?.code === "DOUYIN_COMMENT_ACQUISITION_TOUCH_CHANNEL_FIXED"
  );
});

test("auto mode respects send interval and platform per-minute limits", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-acquisition-"));
  let current = Date.parse("2026-09-02T00:00:00.000Z");
  const cloud = fakeCloud();
  const prospect = fakeProspect({ leads: [
    lead({ score: 92, tier: "high" }),
    lead({ id: "lead-2", leadId: "lead-2", externalUserId: "user-2", secUid: "sec-user-2", score: 90, tier: "high" })
  ] });
  const { service } = build(directory, { cloud, prospect, now: () => new Date(current).toISOString() });
  const task = await service.createTask(context({ taskId: "task-auto-limits", taskRunId: "run-auto-limits" }), config({
    approvalMode: "auto",
    caps: { dailyMax: 20, sendIntervalMs: 1000, cooldownMs: 1000, platformConstraints: { maxPerMinute: 1 } }
  }));
  await service.start(task.key, { runImmediately: false });
  await service.runOnce(task.key);
  assert.equal(cloud.calls.filter((call) => call.type === "send").length, 1);
  assert.equal(service.status(task.key).approvalQueue.filter((touch) => touch.state === "approved").length, 1);
  current += 61_000;
  await service.runOnce(task.key);
  assert.equal(cloud.calls.filter((call) => call.type === "send").length, 2);
});

test("approval and send are blocked when the parent is paused or stopped", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-acquisition-"));
  const { service, cloud } = build(directory);
  const task = await service.createTask(context({ taskId: "task-parent-gate", taskRunId: "run-parent-gate" }), config());
  await service.start(task.key, { runImmediately: false });
  await service.runOnce(task.key);
  const touchId = service.status(task.key).approvalQueue[0].touchId;
  await service.pause(task.key);
  await assert.rejects(() => service.approveTouch(task.key, touchId), { code: "DOUYIN_TOUCH_PARENT_NOT_RUNNING" });
  await service.stop(task.key);
  assert.equal(cloud.calls.some((call) => call.type === "send"), false);
});

test("control-plane startup constructs and exposes the durable acquisition runner", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-acquisition-"));
  const cloud = fakeCloud();
  const prospect = fakeProspect({ leads: [] });
  const acquisitionStateFile = join(directory, "startup-acquisition.json");
  const server = await startControlPlaneServer({
    port: 0,
    host: "127.0.0.1",
    auth: false,
    clueHunterService: { configured: false },
    cloudDesktopService: { configured: false },
    douyinMcpService: { configured: false },
    douyinAgentCloudRegistry: cloud,
    douyinInboxAgentService: { configured: false },
    accountResolver: { configured: true, async resolve() { return { uid: "account-1", secId: "sec-account-1" }; } },
    prospectService: prospect,
    prospectExecutor: prospect,
    taskDispatcher: {},
    browserWorkspace: {},
    localBrowserExecutor: { configured: false },
    douyinAcquisitionStateFile: acquisitionStateFile,
    douyinAcquisitionAutoResume: false
  });
  try {
    assert.equal(server.douyinAcquisitionService.stateFile, acquisitionStateFile);
    assert.equal(server.douyinAcquisitionService.listTasks().length, 0);
  } finally {
    server.douyinAcquisitionService.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("persistent runner lease prevents duplicate recovery across service instances", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-acquisition-"));
  const prospect = fakeProspect({ leads: [lead()] });
  const first = build(directory, { prospect, leaseTtlMs: 5_000 });
  const task = await first.service.createTask(context({ taskId: "task-lease", taskRunId: "run-lease" }), config());
  await first.service.start(task.key, { runImmediately: false });

  const secondProspect = fakeProspect({ leads: [lead({ id: "lead-second", leadId: "lead-second" })] });
  const second = build(directory, { prospect: secondProspect, autoResume: false, leaseTtlMs: 5_000 });
  const recoveredBySecond = await second.service.resumePersisted({ runImmediately: true });
  assert.equal(recoveredBySecond, 0);
  assert.equal(secondProspect.calls, 0);
  const blockedStep = await second.service.runOnce(task.key);
  assert.equal(blockedStep.leaseHeld, true);
  assert.equal(secondProspect.calls, 0);

  first.service.close();
  const recoveredAfterRelease = await second.service.resumePersisted({ runImmediately: true });
  assert.equal(recoveredAfterRelease, 1);
  assert.equal(secondProspect.calls, 1);
  second.service.close();
});

test("interleaved service persistence merges independent composite task keys", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-acquisition-"));
  const first = build(directory, { prospect: fakeProspect({ leads: [lead({ id: "lead-a", leadId: "lead-a" })] }) });
  const second = build(directory, { prospect: fakeProspect({ leads: [lead({ id: "lead-b", leadId: "lead-b" })] }) });
  const taskA = await first.service.createTask(context({ taskId: "task-a", taskRunId: "run-a" }), config());
  const taskB = await second.service.createTask(
    context({ taskId: "task-b", taskRunId: "run-b", accountId: "account-b" }),
    config({ sourceScope: { type: "own_works", videoIds: ["video-b"] }, accountRef: "sec-account-b", accountIdentity: { secId: "sec-account-b" } })
  );
  first.service.recordCapabilityProbe("commentPublicReply", { state: "passed", executorReady: true, evidence: "instance-a" });
  second.service.recordCapabilityProbe("liveAcquisition", { state: "failed", executorReady: false, evidence: "instance-b" });

  await first.service.start(taskA.key, { runImmediately: false });
  await second.service.start(taskB.key, { runImmediately: false });
  await first.service.runOnce(taskA.key);
  await second.service.runOnce(taskB.key);

  const snapshot = JSON.parse(await readFile(join(directory, "acquisition.json"), "utf8"));
  assert.equal(snapshot.tasks[taskA.key].counters.scans, 1);
  assert.equal(snapshot.tasks[taskB.key].counters.scans, 1);
  assert.equal(snapshot.tasks[taskA.key].approvalQueue.length, 1);
  assert.equal(snapshot.tasks[taskB.key].approvalQueue.length, 1);
  assert.equal(snapshot.capabilities.commentPublicReply.evidence, "instance-a");
  assert.equal(snapshot.capabilities.liveAcquisition.evidence, "instance-b");
  assert.equal(snapshot.version, 1);
  first.service.close();
  second.service.close();
});

test("获客专家 uses the authorized-account signal listener and persists its cursor", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-acquisition-rpa-"));
  const calls = [];
  const notificationSource = {
    async scan(input) {
      calls.push(input);
      return {
        ok: true,
        nextCursor: 7,
        leads: [lead({
          id: "rpa-lead-1",
          leadId: "rpa-lead-1",
          externalUserId: "rpa-user-1",
          secUid: "rpa-sec-user-1",
          text: "预算 20 万，怎么预约？",
          score: 91,
          tier: "high",
          intent: { score: 91, tier: "high", confidence: 0.97, reason: "评论直接表达预算和预约意向", signals: ["预算", "预约"], source: "model", model: "test-model" },
          source: { type: "comment", channel: "notification", videoId: "video-rpa-1", observedAt: "2026-09-02T10:00:00.000Z" }
        })],
        snapshot: {
          source: "douyin_rpa_notifications",
          cursor: 7,
          notifications: 1,
          counts: { notifications: 1, normalized: 1, candidates: 1, modelReviewed: 1 },
          analysis: { source: "model", model: "test-model" }
        }
      };
    }
  };
  const prospect = {
    async discover() { throw new Error("public prospect source must not be used"); }
  };
  const { service } = build(directory, { prospect, interactionSource: notificationSource });
  const task = await service.createTask(context({ taskId: "task-rpa", taskRunId: "run-rpa" }), config({
    sourceScope: { kind: "authorized_account_comments" },
    audienceRules: { goal: "找有明确预算并愿意预约的人", minScore: 80 }
  }));
  await service.start(task.key, { runImmediately: false });
  const result = await service.runOnce(task.key);

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].agentId, "mkt-douyin-account-runtime");
  assert.equal(calls[0].cursor, null);
  assert.equal(calls[0].goal, DOUYIN_AUTO_AUDIENCE_GOAL);
  assert.equal(service.status(task.key).cursor, 7);
  assert.equal(service.status(task.key).approvalQueue[0].lead.intent.source, "model");
  assert.equal(service.status(task.key).approvalQueue[0].lead.intent.reason, "评论直接表达预算和预约意向");
  assert.deepEqual(service.status(task.key).lastScan, {
    source: "douyin_rpa_notifications",
    cursor: 7,
    notifications: 1,
    counts: { notifications: 1, normalized: 1, candidates: 1, modelReviewed: 1 },
    analysis: { source: "model", model: "test-model" }
  });
  assert.deepEqual(service.status(task.key).lastAnalysis, { source: "model", model: "test-model" });
  const scanEvent = service.status(task.key).events.find((event) => event.type === "scan_window");
  assert.ok(scanEvent);
  assert.deepEqual(scanEvent.payload.scan, service.status(task.key).lastScan);
  assert.deepEqual(scanEvent.payload.analysis, service.status(task.key).lastAnalysis);
  const persisted = JSON.parse(await readFile(join(directory, "acquisition.json"), "utf8"));
  assert.equal(persisted.tasks[task.key].cursor, 7);
  assert.deepEqual(persisted.tasks[task.key].lastScan, service.status(task.key).lastScan);
  assert.deepEqual(persisted.tasks[task.key].lastAnalysis, service.status(task.key).lastAnalysis);
});

test("获客专家 uses the logged-in cloud account when the product sends an internal account reference", async () => {
  const directory = await mkdtemp(join(tmpdir(), "byering-acquisition-cloud-account-"));
  const calls = [];
  const cloud = fakeCloud({ status: {
    ok: true,
    state: "ONLINE",
    session_id: "session-cloud-account",
    account: { sec_uid: "sec-cloud-account", user_id: "uid-cloud-account", nickname: "云端账号" }
  } });
  const notificationSource = {
    async scan(input) {
      calls.push(input);
      return { ok: true, nextCursor: 2, leads: [], snapshot: { source: "douyin_rpa_notifications", counts: { notifications: 0, candidates: 0 } } };
    }
  };
  const { service } = build(directory, { cloud, interactionSource: notificationSource, accountResolver: {
    configured: false,
    async resolve() { throw new Error("resolver should not be called for an authorized cloud account"); }
  } });
  const task = await service.createTask(context({ taskId: "task-cloud-account", taskRunId: "run-cloud-account" }), config({
    sourceScope: { kind: "authorized_account_comments", accountId: "douyin-agent:mkt-comment-acquisition", accountRef: "douyin-agent:mkt-comment-acquisition" }
  }));
  await service.start(task.key, { runImmediately: false });
  const result = await service.runOnce(task.key);
  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].account.secId, "sec-cloud-account");
  assert.equal(service.status(task.key).accountIdentity.secId, "sec-cloud-account");
});
