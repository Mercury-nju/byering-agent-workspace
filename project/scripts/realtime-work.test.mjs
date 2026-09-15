import test from "node:test";
import assert from "node:assert/strict";
import {
  ACQUISITION_TASK_UPDATE_ACTION,
  acquisitionTaskUpdatePayload,
  acquisitionTaskUpdateDraftFrom,
  acquisitionRealtimeActionPayload,
  acquisitionRealtimeViewModel,
  isCompletedLiveWork,
  isAcquisitionRealtimeAgent,
  normalizeAcquisitionRealtimeMetadata
} from "../src/salebuddy/ui/realtime-work.js";
import { DOUYIN_ACQUISITION_ACTIVE_AGENT_IDS } from "../src/salebuddy/agents/marketplace.js";

test("realtime work accepts exactly the five Agent Center acquisition Agents", () => {
  assert.deepEqual(
    DOUYIN_ACQUISITION_ACTIVE_AGENT_IDS.filter((agentId) => isAcquisitionRealtimeAgent(agentId)),
    DOUYIN_ACQUISITION_ACTIVE_AGENT_IDS
  );
  assert.equal(isAcquisitionRealtimeAgent("mkt-live-lead-miner"), false);
  assert.equal(isAcquisitionRealtimeAgent("mkt-research-expert"), false);
});

test("completed live work has one terminal presentation state", () => {
  assert.equal(isCompletedLiveWork({ status: "done", liveWork: { state: "done" } }), true);
  assert.equal(isCompletedLiveWork({ status: "working", liveWork: { state: "working" } }), false);
});

test("realtime task adjustment uses the same explicit command contract", () => {
  assert.equal(ACQUISITION_TASK_UPDATE_ACTION, "task.config.update");
  assert.deepEqual(acquisitionTaskUpdatePayload("mkt-find-people", {
    taskId: "task-live-1",
    taskRunId: "run-live-1",
    accountId: "account-live-1",
    configVersion: 7
  }, {
    touchContent: { channel: "comment_reply", message: "欢迎交流" }
  }, { effectiveScope: "future_only", expectedVersion: 7 }), {
    action: "task.config.update",
    agentId: "mkt-find-people",
    taskId: "task-live-1",
    taskRunId: "run-live-1",
    accountId: "account-live-1",
    changes: {
      touchContent: { channel: "comment_reply", message: "欢迎交流" }
    },
    effectiveScope: "future_only",
    baseConfigVersion: 7,
    configVersion: 8,
    expectedVersion: 7
  });
});

test("task adjustment reads existing configuration from an acquisition snapshot and keeps source scope fixed", () => {
  const draft = acquisitionTaskUpdateDraftFrom({
    metadata: {
      acquisitionSnapshot: {
        configuration: {
          findingStrategy: { sourceScope: "authorized_account_interactions", audienceGoal: "明确询价的人" },
          touchContent: { channel: "private_message", message: "你好，看到你的留言了。", replyStyle: "自然" },
          frequency: { mode: "每小时一次", maxTouchesPerDay: 20, minIntervalMinutes: 10 },
          timeWindow: { schedule: "09:00-21:00" },
          stopConditions: { stopOnOptOut: true }
        }
      }
    }
  });
  assert.equal(draft.strategy.sourceScope, "持续监听你的抖音账号新增评论、直播互动和账号互动通知");
  assert.equal(draft.strategy.audienceGoal, "明确询价的人");
  assert.equal(draft.touchContent.message, "你好，看到你的留言了。");
  assert.equal(draft.runtimeRules.maxTouchesPerDay, 20);
  assert.equal(draft.runtimeRules.minIntervalMinutes, 10);
  assert.equal("schedule" in draft.runtimeRules, false);
  assert.equal("stopConditions" in draft.runtimeRules, false);

  const payload = acquisitionTaskUpdatePayload("mkt-comment-acquisition", {}, {
    strategy: { sourceScope: "other_comments", audienceGoal: "新的目标" },
    touchContent: { message: "旧版首条话术" },
    runtimeRules: { stopConditions: "用户明确拒绝后停止" }
  });
  assert.deepEqual(payload.changes, {});
});

test("task adjustment migrates a legacy comprehensive public reply channel to private first outreach", () => {
  const draft = acquisitionTaskUpdateDraftFrom({
    configuration: {
      findingStrategy: { sourceScope: "authorized_account_all_signals", audienceGoal: "明确询价的人" },
      touchContent: { channel: "comment_reply", message: "欢迎交流" },
      frequency: { mode: "发现高意向用户后立即触达" }
    }
  });
  assert.equal(draft.touchContent.channel, "public_reply");

  const payload = acquisitionTaskUpdatePayload("mkt-comment-acquisition", {
    taskId: "task-legacy-public-reply",
    taskRunId: "run-legacy-public-reply",
    accountId: "account-1"
  }, {
    touchContent: { channel: "comment_reply", strategy: "改为私信首触达" }
  });
  assert.equal(payload.changes.touchContent.channel, "private_message");
});

test("task adjustment rehydrates every first-run setting from the durable task configuration", () => {
  const draft = acquisitionTaskUpdateDraftFrom({
    configuration: {
      findingStrategy: {
        sourceScope: "authorized_account_interactions",
        audienceGoal: "询问新能源车价格的人",
        requirements: "优先持续追问到店时间的人"
      },
      touchContent: {
        channel: "private_message",
        strategy: "先回应车型问题，再询问购车时间。",
        replyStyle: "专业、简短、自然",
        handoffBoundary: "报价、投诉和无法确认的库存交给人工。",
        approvalMode: "auto"
      },
      frequency: {
        mode: "发现高意向用户后立即触达",
        maxTouchesPerDay: 18,
        minIntervalMinutes: 12
      },
      timeWindow: { schedule: "09:00-21:00" },
      stopConditions: { stopOnReply: false, stopOnOptOut: true }
    }
  });

  assert.equal("timeWindow" in draft.strategy, false);
  assert.equal(draft.strategy.audienceGoal, "询问新能源车价格的人");
  assert.equal(draft.strategy.requirements, "优先持续追问到店时间的人");
  assert.equal(draft.touchContent.strategy, "先回应车型问题，再询问购车时间。");
  assert.equal(draft.touchContent.replyStyle, "专业、简短、自然");
  assert.equal(draft.touchContent.handoffBoundary, "报价、投诉和无法确认的库存交给人工。");
  assert.equal("frequency" in draft.runtimeRules, false);
  assert.equal("schedule" in draft.runtimeRules, false);
  assert.equal(draft.runtimeRules.maxTouchesPerDay, 18);
  assert.equal(draft.runtimeRules.minIntervalMinutes, 12);
  assert.equal("stopConditions" in draft.runtimeRules, false);
});

test("task adjustment never turns a legacy history label into a listener work schedule", () => {
  const draft = acquisitionTaskUpdateDraftFrom({
    configuration: {
      findingStrategy: { sourceScope: { kind: "authorized_account_interactions" } },
      timeWindow: "最近7天"
    }
  });
  assert.equal("schedule" in draft.runtimeRules, false);
});

test("finder listener task adjustment keeps only finding conditions", () => {
  const source = {
    configuration: {
      findingStrategy: {
        sourceScope: { kind: "authorized_account_comments" },
        audienceGoal: "询问新能源车价格的人",
        requirements: "优先明确表达购买时间的人"
      },
      timeWindow: { schedule: "10:00-20:00" }
    }
  };
  const draft = acquisitionTaskUpdateDraftFrom(source);

  assert.deepEqual(draft.touchContent, {});
  assert.deepEqual(draft.runtimeRules, {});

  const payload = acquisitionTaskUpdatePayload("mkt-find-people", {
    taskId: "finder-listener-1",
    taskRunId: "finder-listener-run-1",
    accountId: "account-1",
    configVersion: 1
  }, draft, { expectedVersion: 3 });

  assert.deepEqual(payload.changes, {
    strategy: {
      audienceGoal: "询问新能源车价格的人",
      requirements: "优先明确表达购买时间的人"
    }
  });
});

test("acquisition realtime view model exposes current phase, account, cloud state, signal, approvals, and retry count", () => {
  const view = acquisitionRealtimeViewModel("mkt-comment-acquisition", {
    task: "扫描作品评论",
    phase: "等待平台回执",
    activities: ["已记录 3 条候选线索"],
    metadata: {
      taskId: "task-comment-2",
      taskRunId: "run-comment-2",
      accountId: "account-comment-2",
      cloudState: "online",
      taskState: "running",
      retryCount: 1,
      pendingApprovalCount: 2
    }
  });
  assert.deepEqual(view, {
    agentId: "mkt-comment-acquisition",
    taskId: "task-comment-2",
    taskRunId: "run-comment-2",
    accountId: "account-comment-2",
    phase: "等待平台回执",
    task: "扫描作品评论",
    cloudState: "online",
    taskState: "running",
    retryCount: 1,
    progressMode: "indeterminate",
    pendingApprovalCount: 2,
    recentSignal: "已记录 3 条候选线索",
    lastError: null
  });
});

test("acquisition realtime metadata has no fake percentage when provider progress is absent", () => {
  const metadata = normalizeAcquisitionRealtimeMetadata("mkt-find-people", {
    taskId: "task-live-2",
    taskRunId: "run-live-2",
    accountId: "account-live-2",
    cloudState: "recovering",
    taskState: "degraded",
    retryCount: 3
  }, 92);
  assert.equal(metadata.progressMode, "indeterminate");
  assert.equal(metadata.taskState, "degraded");
  assert.equal(metadata.cloudState, "recovering");
});

test("acquisition realtime controls carry task and account context", () => {
  const payload = acquisitionRealtimeActionPayload("mkt-find-people", "pause", {
    metadata: { taskId: "task-live-3", taskRunId: "run-live-3", accountId: "account-live-3" }
  });
  assert.deepEqual(payload, {
    agentId: "mkt-find-people",
    action: "pause",
    taskId: "task-live-3",
    taskRunId: "run-live-3",
    accountId: "account-live-3"
  });
});

test("acquisition realtime metadata fails closed until a real task state arrives", () => {
  const view = acquisitionRealtimeViewModel("mkt-comment-acquisition", {});
  assert.equal(view.taskState, "configuring");
  assert.equal(view.phase, "等待真实阶段");
  assert.equal(view.task, "等待真实任务");
  assert.equal(view.progressMode, "indeterminate");
});
