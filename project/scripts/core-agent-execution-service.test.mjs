import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  CoreAgentExecutionError,
  createCoreAgentExecutionService
} from "../backend/core-agent-execution-service.js";
import { createEmploymentStore } from "../backend/employment-store.js";
import { createControlPlaneHttpServer } from "../backend/http-server.js";

function request(overrides = {}) {
  return {
    taskId: "task-1",
    taskRunId: "run-1",
    conversationId: "conversation-1",
    tenantId: "tenant-1",
    accountId: "account-1",
    accountKey: "account-1",
    agentId: "mkt-comment-acquisition",
    commandId: "command-1",
    idempotencyKey: "idem-1",
    config: {
      sourceScope: { kind: "authorized_account_all_signals" },
      audienceRules: { intent: "明确询价" },
      contentPolicy: { opening: "先回应，再追问需求" },
      workWindow: { start: "09:00", end: "21:00" }
    },
    ...overrides
  };
}

function createService(overrides = {}) {
  const calls = {
    acquisitionCreate: [],
    acquisitionStart: [],
    acquisitionStatus: [],
    acquisitionResume: [],
    acquisitionRetry: [],
    analyze: [],
    inbox: [],
    privateOutreach: []
  };
  const service = createCoreAgentExecutionService({
    douyinAcquisitionService: {
      async createTask(context, config) {
        calls.acquisitionCreate.push({ context, config });
        return { key: `acquisition:${context.taskRunId}` };
      },
      async start(key, options) {
        calls.acquisitionStart.push({ key, options });
        return { status: "RUNNING", key };
      },
      async status(key) {
        calls.acquisitionStatus.push({ key });
        return {
          key,
          state: "paused",
          context: {
            agentId: "mkt-comment-acquisition",
            taskId: "task-1",
            taskRunId: "run-1",
            accountId: "account-1",
            tenantId: "tenant-1"
          }
        };
      },
      async resume(key, options) {
        calls.acquisitionResume.push({ key, options });
        return { key, state: "running", counters: { scans: 3 } };
      },
      async retry(key, touchId) {
        calls.acquisitionRetry.push({ key, touchId });
        return { task: { key, state: "running", counters: { retries: 1 } } };
      }
    },
    intentAnalysisService: {
      async analyze(input) {
        calls.analyze.push(input);
        return {
          accepted: true,
          dispatched: true,
          source: "prospect",
          status: "SUCCEEDED",
          resultSnapshot: { qualified: [{ sourceRecordId: "candidate-1", score: 91 }] }
        };
      }
    },
    getInboxAgentService() {
      return {
        async startManaged(input) {
          calls.inbox.push(input);
          return { status: "RUNNING", runtimeId: "inbox:run-1" };
        }
      };
    },
    async outreachExecutor(input) {
      calls.privateOutreach.push(input);
      return {
        accepted: true,
        state: "accepted",
        receiptPending: true,
        commandId: "rpa-command-1",
        reqId: input.reqId,
        executorUid: "9001",
        executorTenant: "7001"
      };
    },
    now: () => "2026-09-13T09:00:00.000Z",
    ...overrides
  });
  return { service, calls };
}

test("core gateway routes acquisition and finder listeners through the authorized account executor", async () => {
  const { service, calls } = createService();

  const acquisition = await service.lease(request());
  assert.equal(acquisition.accepted, true);
  assert.equal(calls.acquisitionCreate.length, 1);
  assert.equal(calls.acquisitionCreate[0].context.agentId, "mkt-comment-acquisition");
  assert.equal(calls.acquisitionCreate[0].config.sourceScope.kind, "authorized_account_all_signals");
  assert.deepEqual(calls.acquisitionStart[0], {
    key: "acquisition:run-1",
    options: { runImmediately: false, schedule: true }
  });

  await service.lease(request({
    taskRunId: "finder-run",
    agentId: "mkt-find-people",
    config: {
      sourceScope: { kind: "authorized_account_comments", lookbackDays: 30 },
      workWindow: { schedule: "09:00-21:00", timeWindow: "最近30天" },
      touchChannel: "private_message",
      touchContent: "不应该触达",
      frequency: { maxTouchesPerDay: 50 }
    }
  }));
  assert.equal(calls.acquisitionCreate[1].context.agentId, "mkt-find-people");
  assert.equal(calls.acquisitionCreate[1].context.executionAgentId, "mkt-comment-acquisition");
  assert.equal(calls.acquisitionCreate[1].config.sourceScope.kind, "authorized_account_comments");
  assert.equal(calls.acquisitionCreate[1].config.discoveryOnly, true);
  assert.equal(calls.acquisitionCreate[1].config.approvalMode, "manual");
  assert.equal("touchChannel" in calls.acquisitionCreate[1].config, false);
  assert.equal("touchContent" in calls.acquisitionCreate[1].config, false);
  assert.equal("frequency" in calls.acquisitionCreate[1].config, false);
  assert.equal("workWindow" in calls.acquisitionCreate[1].config, false);
  assert.equal("lookbackDays" in calls.acquisitionCreate[1].config.sourceScope, false);

  await service.lease(request({
    taskRunId: "finder-combined-run",
    agentId: "mkt-find-people",
    config: { sourceScope: { kind: "authorized_account_all_signals" } }
  }));
  assert.equal(calls.acquisitionCreate[2].context.agentId, "mkt-find-people");
  assert.equal(calls.acquisitionCreate[2].config.sourceScope.kind, "authorized_account_all_signals");
  assert.equal(calls.acquisitionCreate[2].config.discoveryOnly, true);
});

test("core gateway rejects duplicate account tasks instead of silently switching to the existing task", async () => {
  const { service } = createService({
    douyinAcquisitionService: {
      async createTask() {
        throw Object.assign(new Error("同一抖音账号已有运行中的任务"), {
          code: "DOUYIN_ACQUISITION_DUPLICATE_TASK",
          statusCode: 409,
          details: {
            existingTaskKey: "existing-task-key",
            existingTaskId: "existing-task-id",
            existingTaskRunId: "existing-task-run-id",
            existingState: "running"
          }
        });
      },
      async start() {}
    }
  });

  await assert.rejects(
    service.lease(request({ taskId: "duplicate-task", taskRunId: "duplicate-run" })),
    (error) => error instanceof CoreAgentExecutionError
      && error.code === "MANAGED_RUNTIME_ACCOUNT_IN_USE"
      && error.statusCode === 409
      && error.details.existingTaskId === "existing-task-id"
  );
});

test("core gateway routes live danmaku analysis to the authorized live listener without outreach", async () => {
  const { service, calls } = createService();
  const result = await service.lease(request({
    taskId: "live-analysis-task",
    taskRunId: "live-analysis-run",
    agentId: "mkt-live-danmaku-analysis",
    config: {
      sourceScope: { kind: "authorized_account_live" },
      audienceRules: { goal: "识别直播间的价格问题和购买意向" },
      discoveryOnly: true,
      analysisOnly: true,
      analysisKind: "live_danmaku",
      liveSignals: ["likes", "gifts"],
      approvalMode: "manual",
      autoStartCloud: false
    }
  }));

  assert.equal(result.accepted, true);
  assert.equal(calls.acquisitionCreate.length, 1);
  const { context, config } = calls.acquisitionCreate[0];
  assert.equal(context.agentId, "mkt-live-danmaku-analysis");
  assert.equal(context.executionAgentId, "mkt-comment-acquisition");
  assert.equal(config.sourceScope.kind, "authorized_account_live");
  assert.equal(config.discoveryOnly, true);
  assert.equal(config.analysisOnly, true);
  assert.equal(config.analysisKind, "live_danmaku");
  assert.deepEqual(config.liveSignals, ["danmaku"]);
  assert.equal(config.approvalMode, "manual");
  assert.equal("touchChannel" in config, false);
  assert.equal("contentPolicy" in config, false);
  assert.equal("frequency" in config, false);
});

test("core gateway routes live danmaku outreach as an automatic touch listener without analysis", async () => {
  const { service, calls } = createService();
  const result = await service.lease(request({
    taskId: "live-outreach-task",
    taskRunId: "live-outreach-run",
    agentId: "mkt-live-danmaku-outreach",
    config: {
      sourceScope: { kind: "authorized_account_live" },
      liveDanmakuOutreach: true,
      touchEveryLiveDanmaku: true,
      liveSignals: ["danmaku"],
      analysisKind: "live_danmaku_outreach",
      touchChannel: "private_message",
      approvalMode: "auto"
    }
  }));

  assert.equal(result.accepted, true);
  assert.equal(calls.acquisitionCreate.length, 1);
  const { context, config } = calls.acquisitionCreate[0];
  assert.equal(context.agentId, "mkt-live-danmaku-outreach");
  assert.equal(context.executionAgentId, "mkt-comment-acquisition");
  assert.equal(config.sourceScope.kind, "authorized_account_live");
  assert.equal(config.liveDanmakuOutreach, true);
  assert.equal(config.touchEveryLiveDanmaku, true);
  assert.equal(config.discoveryOnly, false);
  assert.equal(config.analysisOnly, false);
  assert.equal(config.analysisKind, "live_danmaku_outreach");
  assert.deepEqual(config.liveSignals, ["danmaku"]);
  assert.equal(config.touchChannel, "private_message");
  assert.equal(config.approvalMode, "auto");
  assert.equal("contentPolicy" in config, true);
});

test("core gateway preserves live danmaku outreach purpose and interval without a product cap", async () => {
  const { service, calls } = createService();
  await service.lease(request({
    taskId: "live-outreach-configured-task",
    taskRunId: "live-outreach-configured-run",
    agentId: "mkt-live-danmaku-outreach",
    config: {
      sourceScope: { kind: "authorized_account_live" },
      liveDanmakuOutreach: true,
      touchEveryLiveDanmaku: true,
      analysisKind: "live_danmaku_outreach",
      touchChannel: "private_message",
      approvalMode: "auto",
      audienceRules: { goal: "引导用户留下联系方式" },
      contentPolicy: {
        strategy: "我可以把详细资料发给你，方便留下联系方式吗？",
        conversionGoal: "引导用户留下联系方式"
      },
      caps: { dailyMax: 18, sendIntervalMs: 180000 }
    }
  }));

  const { config } = calls.acquisitionCreate.at(-1);
  assert.equal(config.audienceRules.goal, "引导用户留下联系方式");
  assert.equal(config.contentPolicy.strategy, "我可以把详细资料发给你，方便留下联系方式吗？");
  assert.equal(config.contentPolicy.conversionGoal, "引导用户留下联系方式");
  assert.equal(config.caps.dailyMax, null);
  assert.equal(config.caps.sendIntervalMs, 180000);
});

test("core gateway routes viral work analysis through the public work service without account scope", async () => {
  const calls = [];
  const service = createCoreAgentExecutionService({
    viralWorkAnalysisService: {
      async run(input) {
        calls.push(input);
        return {
          status: "completed",
          analysisKind: "viral_work",
          title: "爆款作品分析报告",
          work: { id: "7345678901234567890" },
          summary: "作品分析已完成。"
        };
      }
    }
  });
  const result = await service.lease({
    taskId: "viral-task",
    taskRunId: "viral-run",
    conversationId: "viral-conversation",
    agentId: "mkt-viral-work-analysis",
    workUrl: "https://www.douyin.com/video/7345678901234567890",
    goal: "拆解开头、互动和转化方式",
    config: { sourceScope: { kind: "public_work_link" }, analysisKind: "viral_work" }
  });

  assert.equal(result.accepted, true);
  assert.equal(result.status, "COMPLETED");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].workUrl, "https://www.douyin.com/video/7345678901234567890");
  assert.equal(calls[0].accountId, "");
  assert.equal(result.resultSnapshot.analysisKind, "viral_work");
  assert.equal(result.events.at(-1).type, "task.completed");
});

test("core gateway forwards viral work lifecycle checkpoints to the host", async () => {
  const progress = [];
  const service = createCoreAgentExecutionService({
    onViralWorkProgress: (request, snapshot) => progress.push({ request, snapshot }),
    viralWorkAnalysisService: {
      async run(input) {
        await input.onProgress({ phase: "读取公开作品详情", progress: 25, status: "running" });
        return {
          status: "completed",
          analysisKind: "viral_work",
          summary: "作品分析已完成。"
        };
      }
    }
  });

  await service.lease({
    taskId: "viral-progress-task",
    taskRunId: "viral-progress-run",
    agentId: "mkt-viral-work-analysis",
    workUrl: "https://www.douyin.com/video/7345678901234567890"
  });

  assert.equal(progress.length, 1);
  assert.equal(progress[0].request.taskId, "viral-progress-task");
  assert.equal(progress[0].snapshot.phase, "读取公开作品详情");
  assert.equal(progress[0].snapshot.progress, 25);
});

test("core gateway removes every historical scan alias from finder listener input", async () => {
  const { service, calls } = createService();
  await service.lease(request({
    taskRunId: "finder-history-aliases",
    agentId: "mkt-find-people",
    config: {
      sourceScope: {
        kind: "authorized_account_comments",
        lookbackDays: 30,
        lookback_days: 30,
        timeWindow: "最近30天",
        time_window: "最近30天",
        days: 30,
        start: "2026-08-14",
        end: "2026-09-13"
      },
      workWindow: {
        schedule: "09:00-21:00",
        lookbackDays: 30,
        lookback_days: 30,
        timeWindow: "最近30天",
        time_window: "最近30天",
        days: 30,
        start: "2026-08-14",
        end: "2026-09-13"
      },
      filters: {
        lookbackDays: 30,
        time_window: "最近30天",
        dateRange: "2026-08-14/2026-09-13"
      },
      findingStrategy: {
        lookback_days: 30,
        sourceScope: { kind: "authorized_account_comments", timeWindow: "最近30天" }
      },
      timeWindow: "最近30天",
      time_window: "最近30天",
      workScope: "最近30条作品"
    }
  }));

  const config = calls.acquisitionCreate[0].config;
  for (const source of [config, config.sourceScope, config.filters, config.findingStrategy, config.findingStrategy.sourceScope]) {
    for (const key of ["lookbackDays", "lookback_days", "timeWindow", "time_window", "days", "start", "end", "dateRange", "date_range", "workScope"]) {
      assert.equal(key in source, false, `${key} must not survive in a finder listener`);
    }
  }
  assert.equal("workWindow" in config, false);
  assert.equal(config.sourceScope.kind, "authorized_account_comments");
});

test("core gateway never coerces public discovery into an authorized-account listener", async () => {
  const { service, calls } = createService();

  for (const sourceScope of [{ kind: "public_search" }, "public_search"]) {
    await assert.rejects(
      service.lease(request({
        taskRunId: `finder-public-${typeof sourceScope === "string" ? "string" : "object"}`,
        agentId: "mkt-find-people",
        config: { sourceScope }
      })),
      (error) => error instanceof CoreAgentExecutionError
        && error.code === "CORE_AGENT_FINDER_LISTENER_SOURCE_INVALID"
    );
  }

  assert.equal(calls.acquisitionCreate.length, 0);
  assert.equal(calls.acquisitionStart.length, 0);
});

test("core gateway requires a server-resolved reception strategy for specialist inbox hosting", async () => {
  const { service } = createService({ resolveReceptionStrategy: async () => null });

  await assert.rejects(
    service.lease(request({ agentId: "mkt-dm-inbox" })),
    (error) => error instanceof CoreAgentExecutionError && error.code === "CORE_AGENT_RECEPTION_STRATEGY_REQUIRED"
  );
  await assert.rejects(
    service.lease(request({ agentId: "mkt-dm-inbox", operation: "inbox_hosting" })),
    (error) => error instanceof CoreAgentExecutionError && error.code === "CORE_AGENT_RECEPTION_STRATEGY_REQUIRED"
  );
});

test("core gateway lets gold customer service start from its objective without a saved reception strategy", async () => {
  const { service, calls } = createService({ resolveReceptionStrategy: async () => null });

  const result = await service.lease(request({
    agentId: "mkt-gold-customer-service",
    operation: "inbox_hosting",
    goal: "使用金牌客服承接私信并引导客户预约试驾",
    config: {
      replyObjective: "引导客户预约试驾",
      strategyMode: "gold_customer_service",
      strategyPlan: {
        conversationObjective: "引导客户预约试驾",
        responsePriorities: ["先回答问题", "推进预约试驾"],
        handoffRules: ["价格承诺", "投诉"]
      }
    }
  }));

  assert.equal(result.accepted, true);
  assert.equal(calls.inbox.length, 1);
  assert.equal(calls.inbox[0].replyObjective, "引导客户预约试驾");
  assert.equal(calls.inbox[0].receptionSettings, null);
  assert.equal(calls.inbox[0].strategyPlan.conversationObjective, "引导客户预约试驾");
});

test("core gateway lets complete acquisition start from its objective without saved reception strategy", async () => {
  const { service, calls } = createService({ resolveReceptionStrategy: async () => null });
  const strategyPlan = {
    conversationObjective: "引导客户预约试驾",
    responsePriorities: ["先回答问题", "推进预约试驾"],
    handoffRules: ["价格承诺"]
  };

  const inbox = await service.lease(request({
    operation: "inbox_hosting",
    goal: "引导客户预约试驾",
    config: {
      replyObjective: "引导客户预约试驾",
      strategyMode: "objective_first",
      strategyPlan
    }
  }));

  assert.equal(inbox.accepted, true);
  assert.equal(calls.inbox[0].replyObjective, "引导客户预约试驾");
  assert.equal(calls.inbox[0].receptionSettings, null);

  const acquisition = await service.lease(request({
    taskRunId: "manager-acquisition-objective",
    goal: "持续监听授权账号的新互动",
    config: {
      sourceScope: { kind: "authorized_account_all_signals" },
      audienceRules: { mode: "account_context" },
      contentPolicy: { mode: "evidence_first", conversionGoal: "引导客户预约试驾" },
      strategyMode: "objective_first",
      strategyPlan
    }
  }));

  assert.equal(acquisition.accepted, true);
  assert.equal(calls.acquisitionCreate.length, 1);
  assert.equal(calls.acquisitionCreate[0].config.reception, undefined);
  assert.equal(calls.acquisitionCreate[0].config.contentPolicy.conversionGoal, "引导客户预约试驾");
});

test("core gateway syncs the saved account reception strategy into gold customer service", async () => {
  const { service, calls } = createService({
    resolveReceptionStrategy: async () => ({
      revision: 7,
      settings: {
        persona: { role: "adviser" },
        goal: "appointment",
        goalDetails: "确认预算后引导预约到店",
        knowledge: "仅介绍已确认的门店、车型和预约规则",
        answerRules: "只回答已确认事实，无法确认时交给人工。",
        handoff: { price: true },
        schedule: { mode: "always", timezone: "Asia/Shanghai" }
      }
    })
  });

  await service.lease(request({
    agentId: "mkt-gold-customer-service",
    operation: "inbox_hosting",
    goal: "客户端目标",
    config: {
      replyObjective: "客户端伪造目标",
      replyRule: "客户端伪造规则",
      replyTone: "客户端伪造语气",
      businessKnowledge: "客户端伪造知识",
      strategyMode: "gold_customer_service"
    }
  }));

  assert.equal(calls.inbox[0].receptionRevision, 7);
  assert.equal(calls.inbox[0].replyObjective, "客户端伪造目标");
  assert.equal(calls.inbox[0].replyRule, "只回答已确认事实，无法确认时交给人工。");
  assert.equal(calls.inbox[0].replyTone, "专业顾问：逻辑清晰，讲明功能、差异和选择");
  assert.equal(calls.inbox[0].businessKnowledge, "仅介绍已确认的门店、车型和预约规则");
  assert.deepEqual(calls.inbox[0].receptionSettings.persona, { role: "adviser" });
});

test("core gateway uses the saved reception strategy instead of caller supplied inbox copy", async () => {
  const { service, calls } = createService({
    resolveReceptionStrategy: async () => ({
      revision: 3,
      settings: {
        goal: "qualify",
        goalDetails: "确认预算和到店时间",
        tone: "natural",
        knowledge: "仅介绍已确认的门店和库存信息",
        schedule: { timezone: "Asia/Shanghai" }
      }
    })
  });
  await service.lease(request({
    agentId: "mkt-dm-inbox",
    operation: "inbox_hosting",
    config: { replyRule: "客户端伪造规则", replyTone: "夸张", businessKnowledge: "伪造知识" }
  }));

  assert.equal(calls.inbox.length, 1);
  assert.equal(calls.inbox[0].receptionRevision, 3);
  assert.equal(calls.inbox[0].replyObjective, "确认预算和到店时间");
  assert.notEqual(calls.inbox[0].replyRule, "客户端伪造规则");
  assert.notEqual(calls.inbox[0].businessKnowledge, "伪造知识");
});

test("core gateway resumes and retries only the matching long-running listener task", async () => {
  const { service, calls } = createService();
  const taskKey = "mkt-comment-acquisition::task-1::account-1";

  const resumed = await service.lease(request({ operation: "resume", taskKey }));
  assert.deepEqual(calls.acquisitionStatus, [{ key: taskKey }]);
  assert.deepEqual(calls.acquisitionResume, [{ key: taskKey, options: { schedule: true } }]);
  assert.equal(resumed.status, "running");
  assert.equal(resumed.resultSnapshot.key, taskKey);
  assert.equal(resumed.resultSnapshot.counters.scans, 3);

  const retried = await service.lease(request({ operation: "retry", taskKey, touchId: "touch-1" }));
  assert.deepEqual(calls.acquisitionRetry, [{ key: taskKey, touchId: "touch-1" }]);
  assert.equal(retried.status, "RUNNING");
  assert.equal(retried.resultSnapshot.key, taskKey);
  assert.equal(retried.resultSnapshot.counters.retries, 1);

  await assert.rejects(
    service.lease(request({ operation: "resume", taskKey, accountId: "another-account" })),
    (error) => error instanceof CoreAgentExecutionError && error.code === "CORE_AGENT_TASK_SCOPE_MISMATCH"
  );
});

test("core gateway only analyzes supplied candidates and persists its snapshot as a task event", async () => {
  const { service, calls } = createService();
  const result = await service.lease(request({
    agentId: "mkt-intent-analyst",
    candidates: [{ sourceRecordId: "candidate-1", text: "这台车多少钱？", source: { type: "live_chat" } }]
  }));

  assert.equal(calls.analyze.length, 1);
  assert.equal(calls.analyze[0].agentId, "mkt-intent-analyst");
  assert.equal(calls.analyze[0].candidates.length, 1);
  const snapshotEvent = result.events.find((event) => event.type === "task.result.snapshot.updated");
  assert.equal(snapshotEvent.payload.resultSnapshot.qualified[0].score, 91);

  await assert.rejects(
    service.lease(request({ agentId: "mkt-intent-analyst", candidates: [] })),
    (error) => error instanceof CoreAgentExecutionError && error.code === "CORE_AGENT_INPUT_REQUIRED"
  );
});

test("core gateway only sends first outreach after an explicit send confirmation", async () => {
  const { service, calls } = createService();
  const outreach = request({
    agentId: "mkt-cold-writer",
    secUid: "sec-1",
    content: "你好，想了解一下你的购车需求。"
  });

  await assert.rejects(
    service.lease(outreach),
    (error) => error instanceof CoreAgentExecutionError && error.code === "CORE_AGENT_SEND_CONFIRMATION_REQUIRED"
  );
  assert.equal(calls.privateOutreach.length, 0);

  const result = await service.lease({ ...outreach, confirm: "SEND" });
  assert.equal(result.accepted, true);
  assert.deepEqual(calls.privateOutreach[0], {
    taskContext: {
      agentId: "mkt-cold-writer",
      taskId: "task-1",
      taskRunId: "run-1",
      conversationId: "conversation-1",
      accountId: "account-1"
    },
    account: { accountId: "account-1" },
    lead: {
      id: "sec-1",
      leadId: "sec-1",
      nickname: "待触达用户",
      name: "待触达用户",
      secUid: "sec-1"
    },
    secId: undefined,
    secUid: "sec-1",
    content: "你好，想了解一下你的购车需求。",
    requestId: "idem-1",
    reqId: "idem-1",
    idempotencyKey: "idem-1"
  });
  assert.equal(result.status, "RUNNING");
  assert.equal(result.resultSnapshot.type, "single_outreach");
  assert.equal(result.resultSnapshot.approvalQueue[0].state, "pending");
  assert.equal(result.resultSnapshot.approvalQueue[0].commandId, "rpa-command-1");
  assert.equal(result.resultSnapshot.approvalQueue[0].lead.secUid, "sec-1");
  assert.equal(result.resultSnapshot.approvalQueue[0].content, "你好，想了解一下你的购车需求。");
  assert.deepEqual(result.events.map((event) => event.type), [
    "task.execution.accepted",
    "task.result.snapshot.updated",
    "outreach.accepted",
    "delivery.checking"
  ]);
});

test("core gateway keeps first outreach running until the cloud RPA returns a final receipt", async () => {
  const { service } = createService({
    async outreachExecutor(input) {
      return {
        accepted: true,
        state: "accepted",
        receiptPending: true,
        commandId: "rpa-command-pending-1",
        reqId: input.reqId,
        message: "云电脑已接收触达指令，等待最终回执"
      };
    }
  });

  const result = await service.lease(request({
    agentId: "mkt-cold-writer",
    secUid: "sec-pending-1",
    content: "你好，方便了解一下吗？",
    confirm: "SEND",
    candidate: {
      id: "lead-pending-1",
      nickname: "杭州林女士",
      source: { type: "comment", label: "作品评论" },
      originalContent: "可以零首付分期吗？"
    }
  }));

  assert.equal(result.status, "RUNNING");
  assert.equal(result.resultSnapshot.type, "single_outreach");
  assert.equal(result.resultSnapshot.approvalQueue[0].state, "pending");
  assert.equal(result.resultSnapshot.approvalQueue[0].commandId, "rpa-command-pending-1");
  assert.equal(result.resultSnapshot.approvalQueue[0].lead.nickname, "杭州林女士");
  assert.equal(result.resultSnapshot.delivery.receiptPending, true);
  assert.deepEqual(result.events.map((event) => event.type), [
    "task.execution.accepted",
    "task.result.snapshot.updated",
    "outreach.accepted",
    "delivery.checking"
  ]);
});

test("core gateway starts inbox hosting with the existing dialogue strategy", async () => {
  const { service, calls } = createService();
  const result = await service.lease(request({
    agentId: "mkt-dm-inbox",
    goal: "承接私信并引导预约",
    config: {
      replyObjective: "确认需求并引导预约",
      replyRule: "先回答问题，再追问需求",
      replyTone: "专业、自然",
      businessKnowledge: "上海门店现车与金融方案",
      handoffRules: "价格、退款和投诉转人工"
    }
  }));

  assert.equal(result.accepted, true);
  assert.equal(calls.inbox[0].replyObjective, "确认需求并引导预约");
  assert.equal(calls.inbox[0].handoffRules, "价格、退款和投诉转人工");
});

test("core gateway starts inbox hosting through a custom executor", async () => {
  const executorCalls = [];
  const { service } = createService({
    async inboxExecutor(payload) {
      executorCalls.push(payload);
      return { status: "RUNNING", runtimeId: "inbox:custom-run" };
    }
  });

  const result = await service.lease(request({
    agentId: "mkt-comment-acquisition",
    operation: "inbox_hosting",
    goal: "承接私信并引导预约",
    config: {
      replyObjective: "确认需求并引导预约",
      replyRule: "先回答问题，再追问需求",
      replyTone: "专业、自然",
      businessKnowledge: "上海门店现车与金融方案",
      handoffRules: "价格、退款和投诉转人工"
    }
  }));

  assert.equal(result.accepted, true);
  assert.equal(result.status, "RUNNING");
  assert.equal(executorCalls.length, 1);
  assert.equal(executorCalls[0].request.agentId, "mkt-comment-acquisition");
  assert.equal(executorCalls[0].input.accountId, "account-1");
});

test("core gateway rejects the chief and unknown agents as non-executors", async () => {
  const { service } = createService();
  await assert.rejects(
    service.lease(request({ agentId: "chief_of_staff" })),
    (error) => error instanceof CoreAgentExecutionError && error.code === "CORE_AGENT_UNSUPPORTED"
  );
  assert.equal(service.kind, "core-agent-execution");
  assert.equal(service.configured, true);
  assert.equal(service.requiresExecutorUid, true);
  assert.equal(service.acceptsExecutionPayload, true);
});

test("employment store accepts live danmaku analysis as an open product Agent", () => {
  const root = mkdtempSync(join(tmpdir(), "live-danmaku-employment-"));
  try {
    const employmentStore = createEmploymentStore({ stateFile: join(root, "employment.json") });
    const contract = employmentStore.hire(null, { agentId: "mkt-live-danmaku-analysis", name: "直播间弹幕分析" });

    assert.equal(contract.agentId, "mkt-live-danmaku-analysis");
    assert.equal(employmentStore.list(null)[0]?.agentId, "mkt-live-danmaku-analysis");
    assert.ok(employmentStore.coreAgentIds.includes("mkt-live-danmaku-analysis"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("employment store accepts viral work analysis without account scope", () => {
  const root = mkdtempSync(join(tmpdir(), "viral-work-employment-"));
  try {
    const employmentStore = createEmploymentStore({ stateFile: join(root, "employment.json") });
    const contract = employmentStore.hire(null, { agentId: "mkt-viral-work-analysis", name: "抖音爆款拆解官" });

    assert.equal(contract.agentId, "mkt-viral-work-analysis");
    assert.equal(contract.dataScope.length, 0);
    assert.ok(employmentStore.coreAgentIds.includes("mkt-viral-work-analysis"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a production HTTP server wires product tasks to the core gateway and retains their configuration", async () => {
  const root = mkdtempSync(join(tmpdir(), "core-gateway-employment-"));
  const employmentStore = createEmploymentStore({ stateFile: join(root, "employment.json") });
  employmentStore.hire(null, { agentId: "mkt-intent-analyst" });
  const calls = [];
  const coreGateway = {
    kind: "core-agent-execution",
    configured: true,
    requiresExecutorUid: true,
    acceptsExecutionPayload: true,
    async lease(input) {
      calls.push(input);
      return { accepted: true, events: [] };
    }
  };
  const server = createControlPlaneHttpServer({
    auth: false,
    coreAgentExecutionService: coreGateway,
    employmentStore
  });
  try {
    const result = await server.taskDispatcher.dispatch({
      command: {
        commandId: "command-core",
        idempotencyKey: "idem-core",
        type: "task.start",
        payload: {
          goal: "分析候选客户",
          candidates: [{ sourceRecordId: "candidate-1", text: "怎么分期？" }],
          config: { analysisScope: "user_intent" }
        }
      },
      ack: { accepted: true, state: "RUNNING" },
      task: {
        taskId: "core-task",
        taskRunId: "core-run",
        conversationId: "core-conversation",
        agentId: "mkt-intent-analyst",
        accessRequest: { provider: "douyin", accountKey: "account-core", robotUid: "robot-core" }
      }
    });

    assert.equal(server.coreAgentExecutionService, coreGateway);
    assert.equal(result.dispatched, true);
    assert.equal(calls[0].agentId, "mkt-intent-analyst");
    assert.equal(calls[0].candidates[0].sourceRecordId, "candidate-1");
    assert.equal(calls[0].config.analysisScope, "user_intent");
  } finally {
    server.close();
    rmSync(root, { recursive: true, force: true });
  }
});
