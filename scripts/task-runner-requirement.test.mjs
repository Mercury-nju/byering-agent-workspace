import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { isRemoteTaskNotFound, remoteCommand, requirementBriefFromProposal, requirementNeedsAccountAccess } from "../src/salebuddy/ui/task-runner.js";

test("public-only requirements do not request account access", () => {
  assert.equal(requirementNeedsAccountAccess({
    touchPlan: { action: "只读公开评论，不触达" }
  }), false);
  assert.equal(requirementNeedsAccountAccess({
    touchPlan: { action: "整理候选，不发送私信" }
  }), false);
  assert.equal(requirementNeedsAccountAccess({
    touchPlan: { action: "审批后发送首条私信" }
  }), true);
});

test("explicit public-only wording wins over a generic follow-up mention", () => {
  assert.equal(requirementNeedsAccountAccess({
    touchPlan: {
      action: "采集并整理公开视频和评论；后续触达方式需另行确认，当前阶段不直接执行私触"
    }
  }), false);
});

test("a read-only preparation phase still requires access when outreach is explicit", () => {
  assert.equal(requirementNeedsAccountAccess({
    guardrail: "先只读分析，发送前必须人工审批",
    touchPlan: { action: "审批后发送首条私信" }
  }), true);
});

test("requirement card brief is projected from the server proposal", () => {
  const brief = requirementBriefFromProposal({
    schemaVersion: 1,
    source: "model",
    title: "抖音购车潜客触达",
    objective: "找出有明确购车意向的潜客并准备首触",
    scope: "抖音互动、车型表达、预算信号与公开资料",
    deliverable: "候选清单、证据摘要和首触建议",
    guardrail: "只读检索；发送前必须人工审批",
    touchPlan: { audience: "有车型和预算信号的买车客户" }
  });

  assert.deepEqual(brief, {
    title: "抖音购车潜客触达",
    objective: "找出有明确购车意向的潜客并准备首触",
    scope: "抖音互动、车型表达、预算信号与公开资料",
    deliverable: "候选清单、证据摘要和首触建议",
    guardrail: "只读检索；发送前必须人工审批",
    touchPlan: { audience: "有车型和预算信号的买车客户" },
    source: "model",
    proposalVersion: 1
  });
});

test("missing server proposal is rejected instead of falling back to a local brief", () => {
  assert.throws(() => requirementBriefFromProposal(null), /server requirement proposal/i);
});

test("online gate confirmations wait for authoritative server events", async () => {
  const source = await readFile(new URL("../src/salebuddy/ui/task-runner.js", import.meta.url), "utf8");
  const completeAuth = source.slice(source.indexOf("function completeAccessAuthorization"), source.indexOf("function cancelAccessAuthorization"));
  const onlineAuth = completeAuth.slice(0, completeAuth.indexOf('  engine.accessStage = "scope";'));
  const confirmScope = source.slice(source.indexOf("function confirmAccessScope"), source.indexOf("/** Only a deliberate user action"));
  const onlineScope = confirmScope.slice(confirmScope.indexOf("if (engine.online && engine.commandClient)"));
  const confirmRequirement = source.slice(source.indexOf("function confirmRequirement"), source.indexOf("function startEngine"));
  const onlineRequirement = confirmRequirement.slice(confirmRequirement.indexOf("if (engine.online && engine.commandClient)"));

  assert.match(completeAuth, /authorizationConfirmed:\s*true/);
  assert.doesNotMatch(onlineAuth, /emit\(engine,\s*\{\s*t:\s*"auth-granted"/);
  assert.match(confirmScope, /ACCESS_GRANT/);
  assert.doesNotMatch(onlineScope, /then\(apply\)/);
  assert.doesNotMatch(onlineScope, /emit\(engine,\s*\{\s*t:\s*"scope-confirmed"/);
  assert.match(onlineRequirement, /provider:\s*engine\.accessSetup\.provider/);
  assert.doesNotMatch(onlineRequirement, /then\(apply\)/);
  assert.doesNotMatch(onlineRequirement, /assignments:\s*buildAssignmentPlan/);
});

test("authorization command callbacks do not call view-scoped browser helpers", async () => {
  const source = await readFile(new URL("../src/salebuddy/ui/task-runner.js", import.meta.url), "utf8");
  const beginAccess = source.slice(source.indexOf("function beginAccessAuthorization"), source.indexOf("/** The browser workspace"));
  assert.doesNotMatch(beginAccess, /markAccessStarted\(\)/);
  assert.doesNotMatch(beginAccess, /openAccessWindow\(/);
  assert.match(beginAccess, /授权请求已送达/);
});

test("online task startup renders transport feedback before requirement model response", async () => {
  const source = await readFile(new URL("../src/salebuddy/ui/task-runner.js", import.meta.url), "utf8");
  const startEngine = source.slice(source.indexOf("function startEngine"), source.indexOf("function accessStageFromEvents"));

  assert.match(startEngine, /我正在理解你的需求/);
  assert.match(startEngine, /t: "user", text: engine\.taskText, online: true/);
  assert.match(startEngine, /source: "transport"/);
  assert.match(startEngine, /status: "progress", preview: "我正在理解你的需求…"/);
});

test("requirement ownership is presented as the chief of staff", async () => {
  const source = await readFile(new URL("../src/salebuddy/ui/task-runner.js", import.meta.url), "utf8");
  const startup = source.slice(source.indexOf("function startEngine"), source.indexOf("function accessStageFromEvents"));
  assert.match(source, /sb-touch-plan-title", "我对触达目标的拆解"/);
  assert.match(source, /请确认我对任务的理解/);
  assert.match(source, /由我整理 · 版本/);
  assert.doesNotMatch(startup, /连接需求理解 Agent/);
});

test("non-demo task startup blocks the local timeline", async () => {
  const source = await readFile(new URL("../src/salebuddy/ui/task-runner.js", import.meta.url), "utf8");
  const startEngine = source.slice(source.indexOf("function startEngine"), source.indexOf("function accessStageFromEvents"));

  assert.match(startEngine, /if \(!engine\.demoMode\)/);
  assert.match(startEngine, /REAL_EXECUTION_REQUIRED/);
  assert.match(startEngine, /不会播放本地模拟结果/);
});

test("online replay downgrades legacy completion events without authoritative status", async () => {
  const source = await readFile(new URL("../src/salebuddy/ui/task-runner.js", import.meta.url), "utf8");
  assert.match(source, /function normalizePersistedRuntimeEvents\(/);
  assert.match(source, /legacyCompletionDowngraded/);
  assert.match(source, /taskStatus !== "done"/);
});

test("online command ACKs cannot synthesize task or approval state", async () => {
  const source = await readFile(new URL("../src/salebuddy/ui/task-runner.js", import.meta.url), "utf8");
  const interaction = source.slice(source.indexOf("function issueInteractionCommand"), source.indexOf("/** 审批决策"));
  const decide = source.slice(source.indexOf("function decide"), source.indexOf("/** 追问"));

  assert.match(interaction, /if \(engine\.online\) \{/);
  assert.match(interaction, /等待服务端确认/);
  assert.doesNotMatch(interaction, /else applyLocalInteractionCommand\(engine, action, payload\)/);
  assert.match(decide, /等待服务端确认/);
  assert.doesNotMatch(decide, /else emit\(engine, \{ t: "approval-resolved"/);
  assert.match(decide, /actionType/);
  assert.match(decide, /selectedLeadIds/);
});

test("public assignment cards do not tell the user to authorize an account", async () => {
  const source = await readFile(new URL("../src/salebuddy/ui/task-runner.js", import.meta.url), "utf8");
  assert.match(source, /公开数据找人链路已就绪，不需要登录抖音账号或打开云电脑/);
  assert.doesNotMatch(source, /分工只建立计划，不会触发账号登录、数据读取或对外动作。下一步由你完成授权/);
});

test("online stage cards render server text instead of local employee scripts", async () => {
  const source = await readFile(new URL("../src/salebuddy/ui/task-runner.js", import.meta.url), "utf8");
  const renderEvents = source.slice(source.indexOf('case "sub-start"'), source.indexOf('case "sub-show"'));
  const progressEvents = source.slice(source.indexOf('case "sub-log"'), source.indexOf('case "sub-done"'));
  const completionEvents = source.slice(source.indexOf('case "sub-done"'), source.indexOf('case "sub-error"'));

  assert.match(renderEvents, /if \(engine\.online\)/);
  assert.match(progressEvents, /if \(engine\.online\)/);
  assert.match(completionEvents, /if \(engine\.online\)/);
  const onlineProgress = progressEvents.slice(progressEvents.indexOf("if (engine.online)"), progressEvents.indexOf("const dialogue = getEmployeeDialogue"));
  assert.match(onlineProgress, /event\.text \|\|/);
  assert.doesNotMatch(onlineProgress, /getEmployeeDialogue\("progress"/);
});

test("online task runner starts durable event replay after remote bootstrap", async () => {
  const source = await readFile(new URL("../src/salebuddy/ui/task-runner.js", import.meta.url), "utf8");
  const startEngine = source.slice(source.indexOf("function startEngine"), source.indexOf("function accessStageFromEvents"));

  assert.match(startEngine, /taskRunSubscribe/);
  assert.match(startEngine, /remoteTaskSubscription/);
  assert.match(startEngine, /subscribeTask\(remoteTaskIdFor\(engine\)\)/);
});

test("online recovery commands use the authoritative remote task identity", async () => {
  const source = await readFile(new URL("../src/salebuddy/ui/task-runner.js", import.meta.url), "utf8");
  const remoteId = source.slice(source.indexOf("function remoteTaskIdFor"), source.indexOf("function requirementProposalFromAck"));
  const interaction = source.slice(source.indexOf("function issueInteractionCommand"), source.indexOf("/** 审批决策"));
  const followup = source.slice(source.indexOf("function followUp(engine"), source.indexOf("function accessStageFromEvents"));

  assert.doesNotMatch(remoteId, /engine\.taskId/);
  assert.match(interaction, /taskId: commandTaskIdFor\(engine\)/);
  assert.match(interaction, /taskId: remoteTaskIdFor\(engine\)/);
  assert.match(interaction, /REMOTE_TASK_ID_MISSING/);
  assert.match(followup, /taskId: remoteTaskId/);
  assert.doesNotMatch(followup, /taskId: engine\.taskId/);
});

test("stale remote tasks offer re-provisioning instead of blind retry", async () => {
  const source = await readFile(new URL("../src/salebuddy/ui/task-runner.js", import.meta.url), "utf8");

  assert.match(source, /function resetRemoteTaskIdentity\(engine\)/);
  assert.match(source, /REMOTE_TASK_NOT_FOUND/);
  assert.match(source, /remote-recreate/);
  assert.match(source, /重新建立任务/);
});

test("wrapped control-plane task-not-found errors still trigger stale recovery", () => {
  assert.equal(isRemoteTaskNotFound({ code: "TASK_NOT_FOUND" }), true);
  assert.equal(isRemoteTaskNotFound({
    code: "COMMAND_FAILED",
    cause: { code: "TASK_NOT_FOUND", message: "Task not found" }
  }), true);
  assert.equal(isRemoteTaskNotFound({ code: "COMMAND_FAILED", cause: { code: "NETWORK_ERROR" } }), false);
});

test("remote command ACKs update canonical identity and version fields from the top level", async () => {
  const engine = {
    online: true,
    remoteTaskId: "remote-task",
    remoteRunId: "remote-run",
    remoteConversationId: "remote-conversation",
    remoteTaskVersion: 1,
    commandClient: {
      async send() {
        return {
          accepted: true,
          taskId: "remote-task-next",
          taskRunId: "remote-run-next",
          conversationId: "remote-conversation-next",
          currentVersion: 2,
          currentSeq: 7,
          data: null
        };
      }
    }
  };

  await remoteCommand(engine, "task.requirement.request", { goal: "test" });

  assert.equal(engine.remoteTaskId, "remote-task-next");
  assert.equal(engine.remoteRunId, "remote-run-next");
  assert.equal(engine.remoteConversationId, "remote-conversation-next");
  assert.equal(engine.remoteTaskVersion, 2);
  assert.equal(engine.remoteTaskSeq, 7);
});
