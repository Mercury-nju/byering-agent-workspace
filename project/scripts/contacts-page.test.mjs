import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ACQUISITION_TASK_UPDATE_ACTION, CONTACTS_MOCK_SCENARIOS, acquisitionActionPayload, acquisitionContextFor, acquisitionMemberActions, acquisitionTaskUpdatePayload, chiefDecisionPresentation, conversationModeForAgent, conversationScenarioForAgent, isAcquisitionMember, isContactAgentAvailable, memberAvatarStateForStatus, memberConversationAvatarStateForStatus, memberStatusPresentation, mergeAgentConversationMessages, selectAcquisitionConversationTask, shouldRebuildMemberDetail, sortContactFriendEntries, specialistConversationMetadata } from "../src/salebuddy/ui/contacts-page.js";
import { MARKETPLACE_LATEST_AGENT_IDS } from "../src/salebuddy/agents/marketplace.js";
import { seedDmMessages } from "../src/salebuddy/agents/dm-scenarios.js";

const contactsSource = readFileSync(new URL("../src/salebuddy/ui/contacts-page.js", import.meta.url), "utf8");
const companionSource = readFileSync(new URL("../src/salebuddy/ui/agent-companion-ui.js", import.meta.url), "utf8");
const activitySource = readFileSync(new URL("../src/salebuddy/ui/agent-activity.js", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../src/salebuddy/index.js", import.meta.url), "utf8");
const navSource = readFileSync(new URL("../src/salebuddy/ui/nav-framework.js", import.meta.url), "utf8");

test("contacts has a direct route entry for the message workspace", () => {
  assert.match(appSource, /function activateContactsEntry\(\)/);
  assert.match(appSource, /get\("page"\) !== "contacts"/);
  assert.match(appSource, /framework\?\.openContacts\?\.\(\)/);
  assert.match(appSource, /contactsEntryReady/);
  assert.match(navSource, /openContacts:\s*\(options = \{\}\) => openCustom\("contacts", options\)/);
});

test("contacts does not load or render project groups", () => {
  assert.doesNotMatch(contactsSource, /room\.action\.list|room\.message\.(list|send)/);
  assert.doesNotMatch(contactsSource, /mountGroupAvatar|renderRoomDetail|renderRoomOverview|renderRoomChat/);
  assert.doesNotMatch(contactsSource, /群组|项目组|initialRoom/);
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
  assert.match(contactsSource.slice(chatStart, chatEnd), /if \(!mine\) \{[\s\S]*mountGrokBotAvatar\(messageAvatar, agentType/);
  assert.doesNotMatch(contactsSource.slice(chatStart, chatEnd), /mine\s*\?\s*mountAgentAvatar/);
});

test("member conversation keeps user messages free of Agent avatar and activity state", () => {
  const chatStart = contactsSource.indexOf("function renderChat(");
  const chatEnd = contactsSource.indexOf("async function renderCloud", chatStart);
  assert.ok(chatStart >= 0 && chatEnd > chatStart);
  const chatSource = contactsSource.slice(chatStart, chatEnd);
  const bubbleStart = chatSource.indexOf("function bubble(message)");
  const bubbleEnd = chatSource.indexOf("async function refresh", bubbleStart);
  assert.ok(bubbleStart >= 0 && bubbleEnd > bubbleStart);
  const bubbleSource = chatSource.slice(bubbleStart, bubbleEnd);

  assert.match(bubbleSource, /if \(!mine\) \{[\s\S]*mountGrokBotAvatar\(messageAvatar, agentType/);
  assert.doesNotMatch(bubbleSource, /mine\s*\?\s*mountAgentAvatar/);
  assert.match(bubbleSource, /const activity = mine \? null : createAgentActivityBadge\(agentType/);
});

test("style mock exposes every conversation state in a playable showcase", () => {
  assert.deepEqual(CONTACTS_MOCK_SCENARIOS.map(({ id }) => id), [
    "welcome",
    "question",
    "thinking",
    "working",
    "artifact",
    "approval",
    "applied",
    "error",
    "cloud",
    "settings"
  ]);
  assert.equal(CONTACTS_MOCK_SCENARIOS.length, 10);
  assert.match(contactsSource, /mockShowcaseOpen: mockPreview/);
  assert.match(contactsSource, /data-sb-mock-scenario/);
  assert.match(contactsSource, /function toggleMockPlayback\(\)/);
  assert.match(contactsSource, /function renderMockShowcase\(container\)/);
  assert.match(contactsSource, /\.sb-mock-showcase-grid\{/);
  assert.match(contactsSource, /function applyMockScenario\(id\) \{\s*if \(id === "all"\)/);
  assert.match(contactsSource, /state\.mockScenarioId === "all" \? "真实对话"/);
});

test("mock user-side previews do not render Agent avatars", () => {
  const mockStart = contactsSource.indexOf("function mockMiniMessage");
  const mockEnd = contactsSource.indexOf("function mockSceneAction", mockStart);
  assert.ok(mockStart >= 0 && mockEnd > mockStart);
  const mockSource = contactsSource.slice(mockStart, mockEnd);
  assert.match(mockSource, /if \(!user\) row\.appendChild/);
  assert.match(mockSource, /user \? "我"/);
});

test("members use hired marketplace Agents and keep only the chief profile", () => {
  assert.match(contactsSource, /export function listContactHiredAgents\(\)/);
  assert.match(contactsSource, /listHiredAgents\(\)\.filter\(\(agent\) => isContactAgentAvailable\(agent\)\)/);
  assert.match(contactsSource, /filter\(\(\[agentType\]\) => isChiefAgentType\(agentType\) && !hiredIds\.has\(agentType\)\)/);
  assert.doesNotMatch(contactsSource, /listActivatedMarketplaceAgents\(\)/);
  assert.match(contactsSource, /market\?\.displayName\s*\|\|\s*market\?\.name/);
  assert.match(contactsSource, /market\?\.displayTitle\s*\|\|\s*market\?\.title/);
});

test("mock contacts expose all five featured Agents with seeded conversations", () => {
  assert.equal(MARKETPLACE_LATEST_AGENT_IDS.length, 5);
  assert.match(contactsSource, /const mockContacts = mockPreview\s*\|\|\s*document\.documentElement\?\.dataset\?\.byeringRuntimeMode === "mock"\s*\|\|\s*isMockRuntime\(/);
  assert.match(contactsSource, /const demoGateway = mockContacts \? createDemoDmGateway\(\) : null/);
  assert.match(contactsSource, /return MARKETPLACE_LATEST_AGENT_IDS\s*\.map\(\(agentId\) => hiredById\.get\(agentId\) \|\| getMarketplaceAgent\(agentId\)\)/);
  for (const agentId of MARKETPLACE_LATEST_AGENT_IDS) {
    const messages = seedDmMessages(agentId);
    assert.ok(messages.length >= 4, `${agentId} 演示对话不足`);
    assert.ok(messages.some((message) => message.from === "user"), `${agentId} 缺用户输入`);
    assert.ok(messages.some((message) => message.artifact?.content), `${agentId} 缺可查看的业务产出`);
  }
});

test("member rows use a dedicated DMG state-driven avatar adapter", () => {
  assert.match(contactsSource, /export function memberAvatarStateForStatus\(status/);
  assert.match(contactsSource, /function refreshMemberRows\(\)/);
  assert.match(contactsSource, /data-sb-contact-agent/);
  assert.match(contactsSource, /refreshMemberRows\(\);/);
  assert.match(contactsSource, /mode:\s*"members"/);
});

test("member top toolbar keeps cloud, settings, and companion actions", () => {
  const friendStart = contactsSource.indexOf("function renderFriendDetail");
  const friendEnd = contactsSource.indexOf("function renderProspectDetail", friendStart);
  assert.ok(friendStart >= 0 && friendEnd > friendStart);
  const friend = contactsSource.slice(friendStart, friendEnd);

  assert.match(contactsSource, /\.sb-cdetail-topbar\{[^}]*display:flex;[^}]*justify-content:space-between/);
  assert.match(contactsSource, /\.sb-cdetail-actions\{[^}]*display:flex;[^}]*align-items:center/);
  assert.match(friend, /const topbar = el\("div", "sb-cdetail-topbar"\)/);
  assert.match(friend, /const actionGroup = el\("div", "sb-cdetail-actions"\)/);
  assert.match(friend, /topbar\.appendChild\(head\)/);
  assert.match(friend, /actionGroup\.appendChild\(actions\)/);
  assert.match(friend, /topbar\.appendChild\(actionGroup\)/);
  assert.match(friend, /label: "云电脑"/);
  assert.match(friend, /label: "配置"/);
  assert.match(friend, /sb-caction-companion/);
  assert.match(friend, /openCompanionPreferences\(/);
  assert.doesNotMatch(friend, /label: "发消息"/);
  assert.doesNotMatch(friend, /acquisitionMemberActions\(\)/);
  assert.doesNotMatch(friend, /detailCol\.appendChild\(acquisitionActions\)/);
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

test("member status presentation prefers the authoritative office state", () => {
  const working = memberStatusPresentation({
    status: { state: "idle", currentTask: null },
    work: { state: "done", phase: "旧阶段" },
    authoritativeWork: { state: "working", phase: "读取评论", metadata: { officeStatus: "working", officeStatusPhase: "ready" } }
  });
  assert.equal(working.status.state, "working");
  assert.equal(working.label, "工作中");
  assert.equal(working.work.phase, "读取评论");

  const blocked = memberStatusPresentation({
    status: { state: "working" },
    authoritativeWork: { state: "attention", metadata: { officeStatus: "attention", officeStatusPhase: "ready", error: { code: "DOUYIN_AUTH_EXPIRED" } } }
  });
  assert.equal(blocked.status.state, "blocked");
  assert.equal(blocked.label, "已掉线");

  const loading = memberStatusPresentation({
    status: { state: "idle" },
    authoritativeWork: { state: "unknown", metadata: { officeStatus: "unknown", officeStatusPhase: "loading" } }
  });
  assert.equal(loading.status.state, "unknown");
  assert.equal(loading.label, "待同步");
});

test("contacts and office share the authoritative office status snapshot", () => {
  assert.match(contactsSource, /createOfficeStatusStore\(/);
  assert.match(contactsSource, /getLocalWorks:\s*listWorks/);
  assert.match(contactsSource, /officeStatusStore\.getWork\(agentType\)/);
  assert.match(contactsSource, /officeStatusStore\.subscribe\(handleMemberStateUpdate\)/);
  assert.match(contactsSource, /officeStatusStore\.dispose\(\)/);
});

test("settings detail does not remount when live status changes", () => {
  assert.equal(shouldRebuildMemberDetail({ tab: "settings", previousSignature: "idle", nextSignature: "working" }), false);
  assert.equal(shouldRebuildMemberDetail({ tab: "cloud", previousSignature: "idle", nextSignature: "working" }), true);
  assert.equal(shouldRebuildMemberDetail({ tab: "settings", previousSignature: "idle", nextSignature: "idle" }), false);
});

test("non-office member status presentation keeps the legacy fallback", () => {
  const result = memberStatusPresentation({
    status: { state: "working", currentTask: "处理会话" },
    work: { state: "working", phase: "处理会话" }
  });
  assert.equal(result.status.state, "working");
  assert.equal(result.label, "正在执行");
  assert.equal(result.work.phase, "处理会话");
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
  assert.match(refreshSource, /memberPresentationFor\(/);
  assert.doesNotMatch(refreshSource, /renderList\(\)/);
});

test("member chat routes the chief of staff to the task control plane", () => {
  assert.equal(conversationModeForAgent("main"), "task");
  assert.equal(conversationModeForAgent("chief_of_staff"), "task");
  assert.equal(conversationModeForAgent("mkt-dm-inbox"), "dm");
});

test("member chat is driven by the Agent conversation contract", () => {
  const finder = conversationScenarioForAgent("mkt-find-people");
  const outreach = conversationScenarioForAgent("mkt-cold-writer");

  assert.equal(finder.family, "discovery");
  assert.equal(outreach.confirmation.mode, "before_each_batch");
  assert.match(contactsSource, /getConversationScenario/);
  assert.match(contactsSource, /data-sb-conversation-family/);
  assert.match(contactsSource, /conversationScenario\.composerPlaceholder/);
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

test("acquisition conversations bind to the newest active durable task", () => {
  const selected = selectAcquisitionConversationTask([
    {
      agentId: "mkt-comment-acquisition",
      taskId: "completed-task",
      state: "completed",
      updatedAt: "2026-09-16T08:00:00.000Z"
    },
    {
      agentId: "mkt-comment-acquisition",
      taskId: "active-task",
      taskRunId: "active-run",
      conversationId: "active-conversation",
      accountId: "account-1",
      state: "running",
      updatedAt: "2026-09-15T08:00:00.000Z"
    },
    {
      agentId: "mkt-comment-acquisition",
      taskId: "other-account-task",
      accountId: "account-2",
      state: "running",
      updatedAt: "2026-09-16T09:00:00.000Z"
    }
  ], {
    agentType: "mkt-comment-acquisition",
    context: { accountId: "account-1" }
  });
  assert.equal(selected.taskId, "active-task");
  assert.equal(selected.conversationId, "active-conversation");
});

test("specialist message sends use the conversation context that was created for the chat", () => {
  const chatStart = contactsSource.indexOf("function renderChat(");
  const chatEnd = contactsSource.indexOf("async function renderCloud", chatStart);
  const chatSource = contactsSource.slice(chatStart, chatEnd);
  assert.match(chatSource, /specialistConversationMetadata\(conversationContext\)/);
  assert.doesNotMatch(chatSource, /specialistConversationMetadata\(acquisitionContext\)/);
});

test("companion preferences are not rendered beside the chat composer", () => {
  const chatStart = contactsSource.indexOf("function renderChat(");
  const chatEnd = contactsSource.indexOf("async function renderCloud", chatStart);
  const chatSource = contactsSource.slice(chatStart, chatEnd);
  assert.match(chatSource, /const companionRequestForConversation = companionRequestForAgent\(agentType\)/);
  assert.doesNotMatch(chatSource, /inputWrap\.appendChild\(preferences\)/);
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

  assert.match(guidance, /actions:\s*\[\["查看任务总览",\s*"showStatus",\s*true\]/);
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
  assert.deepEqual(chiefDecisionPresentation({ intent: "data_query", responseMode: "result_card" }), { kind: "result", tone: "neutral" });
  assert.deepEqual(chiefDecisionPresentation({ responseMode: "supplement_card" }), { kind: "supplement", tone: "attention" });
  assert.deepEqual(chiefDecisionPresentation({ responseMode: "risk_card", riskLevel: "high" }), { kind: "risk", tone: "danger" });
  assert.deepEqual(chiefDecisionPresentation({ intent: "task", responseMode: "task_card" }), { kind: "text", tone: "neutral" });
});

test("chief data results are persisted with the assistant message for both conversation surfaces", () => {
  assert.match(contactsSource, /chiefData:\s*routedData\.chiefData\s*\|\|\s*null/);
  const drawerSource = readFileSync(new URL("../src/salebuddy/ui/agent-drawer.js", import.meta.url), "utf8");
  assert.match(drawerSource, /chiefData:\s*routedData\.chiefData\s*\|\|\s*null/);
});

test("chief result presentation renders agent-level output summaries without raw records", () => {
  assert.match(contactsSource, /titles\s*=\s*\{[^}]*result:\s*["']Agent 产出汇总["']/s);
  assert.match(contactsSource, /sb-chief-result-row/);
  assert.match(contactsSource, /agent\.counts/);
  assert.match(contactsSource, /signals:\s*["']有效信号["']/);
  assert.doesNotMatch(contactsSource, /JSON\.stringify\(chiefData/);
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
  assert.match(contactsSource, /presentation\.label/);
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
  assert.match(source, /brief\.appendChild\(actions\)/);
  assert.match(source, /snapshot\.working\s*\n\s*\? \[\["查看实时进展", "realtime", true\]\]/);
  assert.doesNotMatch(source, /sb-proactive-options/);
  assert.doesNotMatch(source, /工作状态/);
  assert.doesNotMatch(source, /等待真实任务事件/);
});

test("conversation bubbles use readable type and spacing", () => {
  assert.match(contactsSource, /\.sb-msg-name\{font-size:12px;[^}]*margin-bottom:4px\}/);
  assert.match(contactsSource, /\.sb-msg-bubble\{[^}]*padding:10px 14px;[^}]*font-size:14px;[^}]*line-height:1\.65/);
});

test("conversation motion uses layered entry and direct interaction feedback", () => {
  assert.match(contactsSource, /\.sb-msg\.sb-companion-arrive\{animation:sb-contact-message-in/);
  assert.match(contactsSource, /\.sb-msg\.sb-companion-arrive \.sb-msg-bubble\{animation:sb-contact-bubble-in/);
  assert.match(contactsSource, /\.sb-chead-avatar\.sb-conversation-avatar \.sb-grok-avatar-svg\{animation:sb-conversation-avatar-in/);
  assert.match(contactsSource, /\.sb-chat-send2:not\(:disabled\):active\{[^}]*transform:translateY\(1px\) scale\(\.97\)/);
  assert.match(companionSource, /\.sb-companion-dots\{[^}]*border-radius:999px/);
  assert.match(companionSource, /@keyframes sb-companion-typing\{/);
  assert.match(companionSource, /scale\(1\.18\)/);
  assert.match(activitySource, /@keyframes sb-agent-activity-pulse\{/);
  assert.match(activitySource, /scale\(1\.18\)/);
});

test("cloud desktop actions stay inside the conversation message stream", () => {
  assert.match(contactsSource, /label: "云电脑"/);
  assert.doesNotMatch(contactsSource, /sb-dm-cloud-message/);
  assert.doesNotMatch(contactsSource, /sb-task-update/);
  assert.doesNotMatch(contactsSource, /buildCloudNotice\(/);
  assert.doesNotMatch(contactsSource, /appendCloudNotice\(/);
});

test("conversation interactions use the shared blue-neutral palette", () => {
  assert.match(contactsSource, /\.sb-proactive-action\{[^}]*border:1px solid #D7E1EE[^}]*color:#4267A5/);
  assert.match(contactsSource, /\.sb-proactive-action\.primary\{border-color:#1F2329;background:#1F2329;color:#fff\}/);
  assert.doesNotMatch(contactsSource, /\.sb-proactive-action\{[^}]*#(?:16B778|1B8E62|CFE4D8|8BCDAA|F0FAF4)/);
  assert.doesNotMatch(contactsSource, /\.sb-proactive-action\.primary\{[^}]*#(?:16B778|119A64)/);
});

test("cloud desktop status remains data-only after removing the inline status card", () => {
  assert.match(contactsSource, /async function syncDouyinCloudTask\(agentType\)/);
  assert.match(contactsSource, /isDouyinCloudProvisioningStatus\(status\)/);
  assert.match(contactsSource, /isDouyinCloudReadyStatus\(status\)/);
  assert.match(contactsSource, /douyinCloudTaskStore\.update\(agentType/);
  assert.doesNotMatch(contactsSource, /云电脑正在后台准备/);
  assert.doesNotMatch(contactsSource, /查看启动状态/);
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

test("conversation context preserves the selected account when no local task has been hydrated", () => {
  assert.deepEqual(acquisitionContextFor("mkt-gold-customer-service", {
    fallback: {
      accountId: "account-gold",
      taskId: "task-gold",
      taskRunId: "run-gold",
      conversationId: "conversation-gold"
    }
  }), {
    agentId: "mkt-gold-customer-service",
    taskId: "task-gold",
    taskRunId: "run-gold",
    accountId: "account-gold",
    conversationId: "conversation-gold",
    taskVersion: null,
    configVersion: null
  });
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
      touchContent: {
        channel: "private_message",
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
