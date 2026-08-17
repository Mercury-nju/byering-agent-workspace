import assert from "node:assert/strict";
import test from "node:test";

import {
  getDialogueBrief,
  getDialogueInteractionTrace,
  getDialogueRuntimeDefinition,
  getDialogueScript,
  getEmployeeDialogue,
  getSubCompletionMessage,
  isExplicitUserRequirementConfirmation,
  pickDialogueScript
} from "../src/salebuddy/ui/task-runner.js";
import { activityLabelFor } from "../src/salebuddy/ui/agent-activity.js";

test("chief status follows the requirement-understanding lifecycle", () => {
  assert.equal(activityLabelFor("main", { t: "chief" }), "理解中");
  assert.equal(activityLabelFor("main", { t: "run-started" }), "理解中");
  assert.equal(activityLabelFor("main", { t: "progress-start" }), "准备执行");
  assert.equal(activityLabelFor("main", { t: "requirement-required" }), "等待确认");
  assert.equal(activityLabelFor("main", { t: "requirement-confirmed" }), "拆解中");
  assert.equal(activityLabelFor("main", { t: "assignment-plan" }), "分派中");
});

test("lead hunter prompt selects the Douyin car-buyer workflow", () => {
  const scriptKey = pickDialogueScript("帮我监控抖音上的互动，找到高意向买车客户，并自动持续跟进到客户留电话");
  assert.equal(scriptKey, "leads");

  const script = getDialogueScript(scriptKey);
  assert.match(script.decompose, /抖音|买车|留电话/);
  assert.equal(script.subs.length, 4);
  assert.deepEqual(script.subs.map((step) => step.skill), [
    "观察互动",
    "识别意向",
    "规划触达",
    "持续对话"
  ]);
});

test("content tasks do not get mistaken for lead-hunter work", () => {
  assert.equal(pickDialogueScript("为客户案例拆解写 3 条抖音口播脚本"), "content");
});

test("lead hunter dialogue keeps evidence and human handoff boundaries visible", () => {
  const script = getDialogueScript("leads");
  const text = script.subs.flatMap((step) => step.lines).join(" ");

  assert.match(text, /评论|直播|粉丝/);
  assert.match(text, /车型|预算|城市|到店/);
  assert.match(text, /证据/);
  assert.match(text, /联系方式|留资/);
  assert.match(text, /人工|接管/);
  assert.match(script.approval.title, /私信|触达/);
  assert.match(script.approval.body, /READY|权限|频控/);
});

test("lead-hunter dialogue starts with an explicit business brief", () => {
  const brief = getDialogueBrief("leads");

  assert.equal(brief.title, "执行前确认");
  assert.match(brief.objective, /高意向|购车/);
  assert.match(brief.scope, /授权|直播|车型/);
  assert.match(brief.deliverable, /分层|话术|跟进/);
  assert.match(brief.guardrail, /价格|重复|人工/);
});

test("each dialogue script declares a concrete business brief", () => {
  for (const key of ["leads", "content", "generic"]) {
    const brief = getDialogueBrief(key);
    assert.equal(typeof brief.objective, "string");
    assert.equal(typeof brief.scope, "string");
    assert.equal(typeof brief.deliverable, "string");
    assert.equal(typeof brief.guardrail, "string");
  }
});

test("generic dialogue resolves its plan from the business task", () => {
  const script = getDialogueScript("generic", "整理本季度续费风险客户并安排回访");
  const brief = getDialogueBrief("generic", "整理本季度续费风险客户并安排回访");
  const definition = getDialogueRuntimeDefinition("generic", "整理本季度续费风险客户并安排回访");

  assert.match(script.decompose, /健康度|回访|续约/);
  assert.match(brief.objective, /客户|续约/);
  assert.match(script.subs[0].assign, /使用|工单|回访/);
  assert.match(definition.skills[1].name, /意向|优先级|风险|评分/);
});

test("lead hunter scenario is one professional agent with executable skills", () => {
  const definition = getDialogueRuntimeDefinition("leads");

  assert.deepEqual(definition.agent, {
    id: "lead_hunter",
    name: "线索猎人",
    role: "监控互动并推进留资",
    type: "professional_agent"
  });
  assert.equal(definition.skills.length, 4);
  assert.deepEqual(definition.skills.map((skill) => skill.id), [
    "observe_interactions",
    "score_intent",
    "plan_outreach",
    "run_conversation"
  ]);
  assert.ok(definition.skills.every((skill) => skill.executor));
});

test("each lead-hunter agent reports its own completion in the conversation", () => {
  const messages = [0, 1, 2, 3].map((index) => getSubCompletionMessage("leads", index));

  assert.equal(messages.length, 4);
  assert.ok(messages.every((message) => /我已完成/.test(message)));
  assert.match(messages[0], /3,842|互动/);
  assert.match(messages[1], /A 级|意向/);
  assert.match(messages[2], /话术|合规/);
  assert.match(messages[3], /回复|人工|留资/);
});

test("each skill exposes an explicit accept-start-log-complete interaction trace", () => {
  const trace = getDialogueInteractionTrace("leads", 0);

  assert.equal(trace.skill, "观察互动");
  assert.match(trace.accepted, /已接受/);
  assert.match(trace.accepted, /RPA \+ 线索猎人/);
  assert.match(trace.started, /开始执行/);
  assert.match(trace.started, /验收/);
  assert.equal(trace.logs.length, 3);
  assert.match(trace.completed, /我已完成互动观察/);
});

test("every employee enters as a lively first-person colleague", () => {
  const employees = ["线索猎人", "数据分析师", "内容策划", "销售顾问"];
  const messages = employees.map((agentName, index) => getEmployeeDialogue("entrance", {
    agentName,
    skill: ["观察互动", "识别意向", "规划触达", "持续对话"][index],
    role: ["互动观察与线索发现", "意向评分与解释", "触达话术与风险审核", "私信执行与会话跟进"][index],
    index
  }));

  assert.ok(messages.every((message) => /我/.test(message.title) || /我/.test(message.body)));
  assert.ok(messages.every((message) => /好呀|没问题|收到|我来看看|交给我/.test(`${message.title}${message.body}`)));
  assert.ok(messages.every((message) => !/SUB_START|Executor|Agent 已接受|会话\s*[·:：]/.test(`${message.title}${message.body}`)));
  assert.equal(new Set(messages.map((message) => message.body)).size, employees.length);
  assert.ok(messages.some((message) => /[👀📊✨🙌✅]/u.test(`${message.title}${message.body}`)));
});

test("employee progress and completion stay first-person and hide protocol language", () => {
  const progress = getEmployeeDialogue("progress", {
    agentName: "数据分析师",
    skill: "识别意向",
    text: "已完成 47 位候选的意向评分与解释。"
  });
  const completion = getEmployeeDialogue("completion", {
    agentName: "销售顾问",
    skill: "持续对话",
    text: "我已完成持续对话，12 位产生有效回复。"
  });

  for (const message of [progress, completion]) {
    assert.match(`${message.title}${message.body}`, /我/);
    assert.doesNotMatch(`${message.title}${message.body}`, /Executor|COMPLETE|SUB_START|Agent 已/);
  }
  assert.match(progress.body, /47/);
  assert.match(completion.body, /12/);
});

test("employee dialogue prefers the real event result and strips protocol vocabulary", () => {
  const completion = getEmployeeDialogue("completion", {
    agentName: "销售顾问",
    skill: "持续对话",
    text: "我实际完成 8 条回访，其中 3 位确认到店 ✅"
  });
  const error = getEmployeeDialogue("error", {
    agentName: "数据分析师",
    skill: "识别意向",
    text: "RUN_ERROR · 数据分析师 的 Executor 返回超时：外部数据源响应超过 8 秒"
  });
  const progress = getEmployeeDialogue("progress", {
    agentName: "线索猎人",
    skill: "观察互动",
    text: "HUMAN_TAKEOVER · 已停止自动回复"
  });

  assert.match(completion.body, /8 条回访/);
  assert.doesNotMatch(completion.body, /12 位|固定结果/);
  for (const message of [completion, error, progress]) {
    assert.doesNotMatch(`${message.title}${message.body}`, /SUB_START|RUN_ERROR|ERROR|HUMAN_TAKEOVER|Executor|Agent/);
  }
  assert.doesNotMatch(error.body, /数据分析师\s*的?\s*执行环节/);
});

test("one employee message contains at most one emoji", () => {
  const completion = getEmployeeDialogue("completion", {
    agentName: "线索猎人",
    skill: "观察互动",
    text: "我看完啦 ✅ 👀，有效线索已经整理好 🙌"
  });
  const emojiCount = (`${completion.title}${completion.body}`.match(/\p{Extended_Pictographic}/gu) || []).length;

  assert.ok(emojiCount <= 1);
});

test("accepted and started lifecycle events merge into the employee entrance", () => {
  assert.equal(getEmployeeDialogue("accepted", { agentName: "线索猎人" }), null);
  assert.equal(getEmployeeDialogue("started", { agentName: "线索猎人" }), null);
});

test("the visible conversation renderer does not expose lifecycle protocol labels", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) => readFile(new URL("../src/salebuddy/ui/task-runner.js", import.meta.url), "utf8"));
  const renderer = source.slice(source.indexOf("function openConversation"));

  assert.doesNotMatch(renderer, /"SUB_START ·|"DISPATCH ·|"RUN_STARTED ·|"RUN_FINISHED ·|"RUN_ERROR ·|"HUMAN_TAKEOVER ·|"Agent 已接受任务"|"Executor 开始执行"|`ERROR ·|`执行方式 ·/);
  assert.doesNotMatch(renderer, /执行器：|HUMAN_TAKEOVER|\["结果已归档", "工作依据已保留"\]/);
  assert.doesNotMatch(renderer, /大家正在协作|过程和结果会实时同步到这里|目标 → 分工 → 执行 → 交付/);
  assert.match(renderer, /case "run-started":\s*setAgentActivity\("main", "理解中"\);\s*updateProgressSummary\("理解中"/);
  assert.match(renderer, /mountAgentAvatar\(avatar, employeeName/);
  assert.match(renderer, /text: event\.text/);
  assert.match(renderer, /role", "log"/);
  assert.match(renderer, /aria-live", "polite"/);
  assert.match(renderer, /role", "progressbar"/);
  assert.match(renderer, /setAttribute\("data-sb-checkpoint", "progress"\)/);
  assert.match(renderer, /setAttribute\("aria-live", "polite"\)/);
  assert.match(renderer, /aria-expanded/);
  assert.match(renderer, /展开工作记录/);
  assert.match(renderer, /确认并开始/);
  assert.match(renderer, /修改要求/);
  assert.match(renderer, /查看内容/);
  assert.match(renderer, /setAttribute\("data-sb-checkpoint", "result"\)/);
  assert.match(renderer, /继续追问结果，或安排下一步工作/);
  assert.match(renderer, /调整需求并创建后续任务/);
  assert.match(renderer, /任务恢复建议/);
});

test("online completion does not invent demo metrics when the gateway omits a result snapshot", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) => readFile(new URL("../src/salebuddy/ui/task-runner.js", import.meta.url), "utf8"));
  const helper = source.slice(source.indexOf("function resultSnapshotFor"), source.indexOf("/* 各剧本任务完结"));

  assert.match(helper, /if \(engine\.online\)/);
  assert.match(helper, /source: "gateway"/);
  assert.match(helper, /metrics: \[\]/);
  assert.match(helper, /source: "demo"/);
});

test("checkpoint rendering keeps lifecycle events in cards and avoids duplicate completion messages", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) => readFile(new URL("../src/salebuddy/ui/task-runner.js", import.meta.url), "utf8"));
  const renderer = source.slice(source.indexOf("function openConversation"));
  assert.match(renderer, /case "run-finished":\s*markRunFinished\(\);/);
  assert.doesNotMatch(renderer, /case "run-finished":\s*renderAgentTrace/);
  assert.match(renderer, /case "task-error":\s*[\s\S]*?showRecoveryCard/);
  assert.match(renderer, /case "task-blocked":\s*[\s\S]*?showRecoveryCard/);
});

test("requirement gate advances only from an explicit user confirmation", () => {
  assert.equal(isExplicitUserRequirementConfirmation(), false);
  assert.equal(isExplicitUserRequirementConfirmation({ actor: "system", action: "confirm" }), false);
  assert.equal(isExplicitUserRequirementConfirmation({ actor: "user", action: "preview" }), false);
  assert.equal(isExplicitUserRequirementConfirmation({ actor: "user", action: "confirm" }), true);
});
