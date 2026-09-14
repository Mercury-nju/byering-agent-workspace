import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ACQUISITION_TASK_UPDATE_ACTION, acquisitionActionPayload, acquisitionContextFor, acquisitionMemberActions, acquisitionTaskUpdatePayload, chiefDecisionPresentation, conversationModeForAgent, isAcquisitionMember, isContactAgentAvailable, memberAvatarStateForStatus, memberConversationAvatarStateForStatus, mergeAgentConversationMessages, sortContactFriendEntries, specialistConversationMetadata } from "../src/salebuddy/ui/contacts-page.js";

const contactsSource = readFileSync(new URL("../src/salebuddy/ui/contacts-page.js", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../src/salebuddy/index.js", import.meta.url), "utf8");
const navSource = readFileSync(new URL("../src/salebuddy/ui/nav-framework.js", import.meta.url), "utf8");

test("contacts has a direct route entry for the message workspace", () => {
  assert.match(appSource, /function activateContactsEntry\(\)/);
  assert.match(appSource, /get\("page"\) !== "contacts"/);
  assert.match(appSource, /framework\?\.openContacts\?\.\(\)/);
  assert.match(appSource, /contactsEntryReady/);
  assert.match(navSource, /openContacts:\s*\(options = \{\}\) => openCustom\("contacts", options\)/);
});

test("member conversation uses the current Agent avatar system", () => {
  const proactiveStart = contactsSource.indexOf("function buildProactiveBrief");
  const proactiveEnd = contactsSource.indexOf("function updateProactiveBrief");
  const friendStart = contactsSource.indexOf("function renderFriendDetail");
  const friendEnd = contactsSource.indexOf("function renderProspectDetail");
  const chatStart = contactsSource.indexOf("function renderChat");
  const chatEnd = contactsSource.indexOf("async function renderCloud");
  assert.ok(proactiveStart >= 0 && proactiveEnd > proactiveStart);
  assert.ok(friendStart >= 0 && friendEnd > friendStart);
  assert.ok(chatStart >= 0 && chatEnd > chatStart);
  assert.match(contactsSource.slice(proactiveStart, proactiveEnd), /mountGrokBotAvatar\(messageAvatar, agentType/);
  assert.match(contactsSource.slice(friendStart, friendEnd), /mountGrokBotAvatar\(headAvatar, agentType/);
  assert.match(contactsSource.slice(chatStart, chatEnd), /mine\s*\?\s*mountAgentAvatar[\s\S]*:\s*mountGrokBotAvatar/);
});

test("members use the same activated marketplace Agents and names as Agent Center", () => {
  assert.match(contactsSource, /listActivatedMarketplaceAgents\(\)/);
  assert.match(contactsSource, /market\?\.displayName\s*\|\|\s*market\?\.name/);
  assert.match(contactsSource, /market\?\.displayTitle\s*\|\|\s*market\?\.title/);
});

test("member rows use a dedicated DMG state-driven avatar adapter", () => {
  assert.match(contactsSource, /export function memberAvatarStateForStatus\(status/);
  assert.match(contactsSource, /function refreshMemberRows\(\)/);
  assert.match(contactsSource, /data-sb-contact-agent/);
  assert.match(contactsSource, /refreshMemberRows\(\);/);
  assert.match(contactsSource, /mode:\s*"members"/);
});

test("member avatar state follows the live team and work status", () => {
  assert.equal(memberAvatarStateForStatus({ state: "working" }), "working");
  assert.equal(memberAvatarStateForStatus({ state: "blocked" }), "alerting");
  assert.equal(memberAvatarStateForStatus({ state: "idle" }, { state: "working" }), "working");
  assert.equal(memberAvatarStateForStatus({ state: "offline" }, { state: "working" }), "working");
  assert.equal(memberAvatarStateForStatus({ state: "working" }, { state: "working", lastError: "provider failed" }), "alerting");
  assert.equal(memberAvatarStateForStatus({ state: "idle" }, { state: "done", taskState: "failed" }), "alerting");
  assert.equal(memberAvatarStateForStatus({ state: "idle" }), "idle");
});

test("member conversation uses DMG event states without changing the work-status mapping", () => {
  assert.equal(memberConversationAvatarStateForStatus({ state: "idle" }), "idle");
  assert.equal(memberConversationAvatarStateForStatus({ state: "working" }), "thinking");
  assert.equal(memberConversationAvatarStateForStatus({ state: "working" }, { state: "working", phase: "撰写首轮话术" }), "writing");
  assert.equal(memberConversationAvatarStateForStatus({ state: "working" }, { state: "working", phase: "等待私信发送" }), "sending");
  assert.equal(memberConversationAvatarStateForStatus({ state: "blocked" }), "alerting");
});

test("member conversation drives transient DMG states from real message lifecycle events", () => {
  const chatStart = contactsSource.indexOf("function renderChat(");
  const chatEnd = contactsSource.indexOf("// 云电脑", chatStart);
  const chatSource = contactsSource.slice(chatStart, chatEnd);
  assert.match(chatSource, /showConversationAvatarState\("receiving"/);
  assert.match(chatSource, /showConversationAvatarState\("thinking"/);
  assert.match(chatSource, /showConversationAvatarState\("sending"/);
  assert.match(chatSource, /showConversationAvatarState\("alerting"/);
  assert.match(chatSource, /latestAgentMessage/);
  assert.match(chatSource, /setLocalCompanionPhase\("thinking"/);
  assert.match(chatSource, /mountCompanionStatus\(companionStatus/);
});

test("member status refresh preserves mounted avatar instances", () => {
  const refreshStart = contactsSource.indexOf("function refreshMemberRows()");
  const refreshEnd = contactsSource.indexOf("function refreshMembersFromLive()", refreshStart);
  assert.ok(refreshStart >= 0 && refreshEnd > refreshStart);
  const refreshSource = contactsSource.slice(refreshStart, refreshEnd);
  assert.match(refreshSource, /mountGrokBotAvatar\(/);
  assert.match(refreshSource, /getStatusOf/);
  assert.doesNotMatch(refreshSource, /renderList\(\)/);
});

test("member chat routes the chief of staff to the task control plane", () => {
  assert.equal(conversationModeForAgent("main"), "task");
  assert.equal(conversationModeForAgent("chief_of_staff"), "task");
  assert.equal(conversationModeForAgent("mkt-dm-inbox"), "dm");
});

test("specialist member conversations stay scoped to the assigned Agent and current task", () => {
  assert.deepEqual(specialistConversationMetadata({
    taskId: "task-1",
    taskRunId: "run-1",
    accountId: "account-1",
    conversationId: "conversation-1"
  }), {
    source: "member-conversation",
    conversationRole: "specialist-executor",
    canCreateTeamTask: false,
    requiresChiefForNewTask: true,
    taskId: "task-1",
    taskRunId: "run-1",
    accountId: "account-1",
    conversationId: "conversation-1"
  });
});

test("specialist message sends use the conversation context that was created for the chat", () => {
  const chatStart = contactsSource.indexOf("function renderChat(");
  const chatEnd = contactsSource.indexOf("async function renderCloud", chatStart);
  const chatSource = contactsSource.slice(chatStart, chatEnd);
  assert.match(chatSource, /specialistConversationMetadata\(conversationContext\)/);
  assert.doesNotMatch(chatSource, /specialistConversationMetadata\(acquisitionContext\)/);
});

test("chief message flow accepts both control-plane and mock gateway response envelopes", () => {
  assert.match(contactsSource, /const routedData = routed\?\.data \|\| routed \|\| \{\}/);
  assert.match(contactsSource, /let responseText = routedData\.message/);
});

test("chief guidance stays inside the member conversation without creating work", () => {
  const guidanceStart = contactsSource.indexOf("const PROACTIVE_GUIDANCE");
  const guidanceEnd = contactsSource.indexOf("const ICONS", guidanceStart + 1);
  const actionStart = contactsSource.indexOf("function runProactiveAction");
  const actionEnd = contactsSource.indexOf("async function runAcquisitionAction", actionStart);
  const guidance = contactsSource.slice(guidanceStart, guidanceEnd > guidanceStart ? guidanceEnd : actionStart);
  const actionHandler = contactsSource.slice(actionStart, actionEnd);

  assert.match(guidance, /actions:\s*\[\["查看团队状态",\s*"showStatus",\s*true\]/);
  assert.doesNotMatch(guidance, /告诉我你的目标|创建新任务|newTask/);
  assert.match(actionHandler, /action === "realtime" \|\| action === "showStatus"/);
  assert.doesNotMatch(actionHandler, /data-sb-mode="newTask"/);
});

test("chief conversation does not expose task-control commands", () => {
  const chiefSendStart = contactsSource.indexOf("if (chiefTaskMode) {");
  const chiefSendEnd = contactsSource.indexOf("const sent = await gateway.action(\"dm.message.send\"", chiefSendStart + 1);
  const chiefSend = contactsSource.slice(chiefSendStart, chiefSendEnd);
  assert.doesNotMatch(chiefSend, /task\.pause|task\.resume|task\.cancel|task\.retry|task\.run\.snapshot/);
});

test("chief decisions choose consumer-facing text or action cards", () => {
  assert.deepEqual(chiefDecisionPresentation({ intent: "conversation", responseMode: "text" }), { kind: "text", tone: "neutral" });
  assert.deepEqual(chiefDecisionPresentation({ intent: "status_query", responseMode: "status_card" }), { kind: "status", tone: "neutral" });
  assert.deepEqual(chiefDecisionPresentation({ responseMode: "supplement_card" }), { kind: "supplement", tone: "attention" });
  assert.deepEqual(chiefDecisionPresentation({ responseMode: "risk_card", riskLevel: "high" }), { kind: "risk", tone: "danger" });
  assert.deepEqual(chiefDecisionPresentation({ intent: "task", responseMode: "task_card" }), { kind: "text", tone: "neutral" });
});

test("the chief of staff is always available in members even though it is not a marketplace hire", () => {
  assert.equal(isContactAgentAvailable("main"), true);
  assert.equal(isContactAgentAvailable("chief_of_staff"), true);
  assert.equal(isContactAgentAvailable({ id: "main" }), true);
  assert.equal(isContactAgentAvailable({ id: "chief_of_staff" }), true);
});

test("contact friends put available entries before unavailable entries", () => {
  const entries = [
    { id: "locked-a", available: false },
    { id: "open-a", available: true },
    { id: "locked-b", available: false },
    { id: "open-b", available: true }
  ];

  assert.deepEqual(
    sortContactFriendEntries(entries).map((entry) => entry.id),
    ["open-a", "open-b", "locked-a", "locked-b"]
  );
});

test("member list status never falls back to member identity or role descriptions", () => {
  assert.doesNotMatch(contactsSource, /sbContactFallback/);
  assert.doesNotMatch(contactsSource, /relationshipLabel\s*=\s*activatedIds\.has/);
  assert.match(contactsSource, /workLabel\(agent\.id, status\)/);
});

test("conversation history keeps activity out of direct chat by default", () => {
  const remote = [
    { id: "remote-1", from: "mkt-dm-inbox", text: "有个进展：正在读取新会话", createdAt: "2026-08-31T10:01:00.000Z", metadata: { source: "agent-activity", activityKey: "mkt-dm-inbox:18" } },
    { id: "user-1", from: "user", text: "开始处理", createdAt: "2026-08-31T10:00:00.000Z" }
  ];
  const local = [
    { id: "activity-mkt-dm-inbox:18", from: "mkt-dm-inbox", text: "有个进展：正在读取新会话", createdAt: "2026-08-31T10:01:00.000Z", metadata: { source: "agent-activity", activityKey: "mkt-dm-inbox:18" } },
    { id: "activity-mkt-dm-inbox:19", from: "mkt-dm-inbox", text: "有个进展：已连接消息模块", createdAt: "2026-08-31T10:02:00.000Z", metadata: { source: "agent-activity", activityKey: "mkt-dm-inbox:19" } }
  ];

  const merged = mergeAgentConversationMessages(remote, local);
  assert.deepEqual(merged.map((message) => message.id), ["user-1"]);
  const replay = mergeAgentConversationMessages(remote, local, { includeActivity: true });
  assert.deepEqual(replay.map((message) => message.id), ["user-1", "remote-1", "activity-mkt-dm-inbox:19"]);
});

test("Agent activity reports with HTML artifacts are replayed in the product conversation", () => {
  const report = {
    id: "activity-mkt-intent-analyst:analysis-1:account-analysis-report",
    from: "mkt-intent-analyst",
    text: "账号分析报告已完成，已发送到这里，并同步保存到文件中心。",
    createdAt: "2026-09-14T10:00:00.000Z",
    metadata: { source: "agent-activity", deliverToConversation: true, activityKey: "mkt-intent-analyst:analysis-1:account-analysis-report" },
    artifact: { id: "file-analysis-1", name: "抖音账号分析报告-analysis-1.html", type: "html" }
  };

  const [message] = mergeAgentConversationMessages([], [report]);
  assert.equal(message.text, report.text);
  assert.deepEqual(message.artifact, report.artifact);

  const chatStart = contactsSource.indexOf("async function refresh({ scroll = false, sync = true } = {})");
  const chatEnd = contactsSource.indexOf("function disposeChat", chatStart);
  const chat = contactsSource.slice(chatStart, chatEnd > chatStart ? chatEnd : undefined);
  assert.match(chat, /listAgentActivity\(agentType\)/);
  assert.match(chat, /deliverToConversation/);
});

test("the proactive first paint is a normal assistant message, not a work-status card", () => {
  const start = contactsSource.indexOf("function buildProactiveBrief");
  const end = contactsSource.indexOf("function updateProactiveBrief", start);
  const source = contactsSource.slice(start, end);
  assert.match(source, /setAttribute\("data-sb-message-kind",\s*"assistant-message"\)/);
  assert.match(source, /sb-msg-bubble/);
  assert.doesNotMatch(source, /工作状态/);
  assert.doesNotMatch(source, /等待真实任务事件/);
});

test("cloud desktop actions stay inside the conversation message stream", () => {
  assert.match(contactsSource, /sb-dm-cloud-message/);
  assert.match(contactsSource, /data-sb-message-kind.*system-message/);
  assert.doesNotMatch(contactsSource, /sb-dm-cloud-notice/);
});

test("conversation history rejects an Agent message when its conversation metadata is missing", () => {
  const merged = mergeAgentConversationMessages([
    { id: "remote-2", from: "mkt-dm-inbox", text: "有个进展：读取完成", createdAt: "2026-08-31T10:03:00.000Z" }
  ], [
    { id: "activity-mkt-dm-inbox:22", from: "mkt-dm-inbox", text: "有个进展：读取完成", createdAt: "2026-08-31T10:03:02.000Z", metadata: { source: "agent-activity", activityKey: "mkt-dm-inbox:22" } }
  ]);
  assert.deepEqual(merged, []);
});

test("conversation history hides legacy Agent greetings while retaining real replies", () => {
  const merged = mergeAgentConversationMessages([
    { id: "user-1", from: "user", text: "帮我继续处理" },
    { id: "legacy-1", from: "mkt-lead-miner", text: "你好，我是周砚，负责线索挖掘。" },
    { id: "reply-1", from: "mkt-lead-miner", text: "我会按你的目标推进", metadata: { companion: { inReplyTo: "user-1" } } }
  ]);

  assert.deepEqual(merged.map((message) => message.id), ["user-1", "reply-1"]);
});

test("acquisition member actions only open realtime work", () => {
  assert.equal(isAcquisitionMember("mkt-comment-acquisition"), true);
  assert.equal(isAcquisitionMember("mkt-find-people"), true);
  assert.equal(isAcquisitionMember("mkt-live-lead-miner"), false);
  const context = acquisitionContextFor("mkt-comment-acquisition", {
    task: { id: "task-1", taskRunId: "run-1", accountId: "account-1", conversationId: "conversation-1" }
  });
  assert.deepEqual(acquisitionActionPayload("mkt-comment-acquisition", "pause", context), {
    agentId: "mkt-comment-acquisition", action: "pause", taskId: "task-1", taskRunId: "run-1", accountId: "account-1", conversationId: "conversation-1"
  });
  assert.deepEqual(acquisitionMemberActions(), [{
    label: "查看实时工作",
    action: "realtime",
    disabled: false
  }]);
});

test("listener task adjustment payload excludes historical lookback while carrying future strategy changes", () => {
  assert.equal(ACQUISITION_TASK_UPDATE_ACTION, "task.config.update");
  assert.deepEqual(acquisitionTaskUpdatePayload("mkt-comment-acquisition", {
    taskId: "task-1",
    taskRunId: "run-1",
    accountId: "account-1",
    conversationId: "conversation-1"
  }, {
    strategy: {
      sourceScope: "self_comments",
      timeWindow: "last_7_days",
      audienceGoal: "寻找明确咨询用户"
    },
    touchContent: {
      channel: "private_message",
      message: "你好",
      replyStyle: "专业、简短",
      handoffBoundary: "涉及价格转人工"
    },
    runtimeRules: {
      frequency: "每小时一次",
      maxTouchesPerDay: 20,
      stopConditions: "命中投诉即停止"
    },
    forbidden: "must not be sent"
  }, {
    effectiveScope: "future_only",
    expectedVersion: 3,
    confirmation: true
  }), {
    action: "task.config.update",
    agentId: "mkt-comment-acquisition",
    taskId: "task-1",
    taskRunId: "run-1",
    accountId: "account-1",
    conversationId: "conversation-1",
    changes: {
      strategy: {
        audienceGoal: "寻找明确咨询用户"
      },
      touchContent: {
        channel: "private_message",
        message: "你好",
        replyStyle: "专业、简短",
        handoffBoundary: "涉及价格转人工"
      },
      runtimeRules: {
        maxTouchesPerDay: 20
      }
    },
    effectiveScope: "future_only",
    baseConfigVersion: 1,
    configVersion: 2,
    expectedVersion: 3,
    confirmation: { confirmed: true }
  });
});
