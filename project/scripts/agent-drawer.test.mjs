import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  chiefOptionsForSnapshot,
  acquisitionDrawerActionPayload,
  acquisitionDrawerActions,
  acquisitionDrawerContext,
  findOfficeRightPanel,
  isAcquisitionDrawerAgent,
  normalizeAgentConversationMessages,
  isUsableOfficeRightPanel,
  OFFICE_RIGHT_PANEL_SELECTOR,
  acquisitionWorkspaceDataFor,
  acquisitionCloudPresentationFor
} from "../src/salebuddy/ui/agent-drawer.js";

test("chief drawer resolves the office right panel instead of a global panel", () => {
  const host = { id: "office-right-panel" };
  let selector = null;
  const ownerDocument = {
    querySelector(value) {
      selector = value;
      return value === OFFICE_RIGHT_PANEL_SELECTOR ? host : null;
    }
  };

  assert.equal(findOfficeRightPanel(ownerDocument), host);
  assert.equal(selector, ".office-dashboard [class*=\"_rightPanel_\"]");
});

test("office drawer rejects a broad host that would cover the office scene", () => {
  const office = { getBoundingClientRect: () => ({ width: 1800 }) };
  const broadHost = {
    closest: () => office,
    getBoundingClientRect: () => ({ width: 1650 })
  };
  const narrowHost = {
    closest: () => office,
    getBoundingClientRect: () => ({ width: 420 })
  };

  assert.equal(isUsableOfficeRightPanel(broadHost), false);
  assert.equal(isUsableOfficeRightPanel(narrowHost), true);
});

test("office right panel lookup prefers the usable visible host", () => {
  const office = { getBoundingClientRect: () => ({ width: 1800 }) };
  const broadHost = {
    closest: () => office,
    getBoundingClientRect: () => ({ width: 1650 })
  };
  const narrowHost = {
    closest: () => office,
    getBoundingClientRect: () => ({ width: 420 })
  };
  const ownerDocument = {
    querySelectorAll: () => [broadHost, narrowHost],
    querySelector: () => broadHost
  };

  assert.equal(findOfficeRightPanel(ownerDocument), narrowHost);
});

test("office right panel stays scoped instead of covering the whole office", async () => {
  const source = await readFile(new URL("../src/salebuddy/ui/ai-shuban-theme.js", import.meta.url), "utf8");
  assert.match(
    source,
    /\.office-dashboard \[class\*="_rightPanel_"\]\{[^}]*position:relative!important/,
    "native right panel must establish its own positioning context"
  );
  assert.match(source, /\.office-dashboard \[class\*="_rightPanel_"\] > \[class\*="_container_"\]\{\s*display:none!important/);
});

test("office theme does not define a fabricated fallback summary", async () => {
  const source = await readFile(new URL("../src/salebuddy/ui/ai-shuban-theme.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /OFFICE_FALLBACK_SUMMARY|renderOfficeFallback|syncOfficeFallback|sb-office-fallback/);
});

test("working chief keeps global status and data shortcuts", () => {
  const options = chiefOptionsForSnapshot({ active: true, status: "执行中" });
  assert.ok(options.some((option) => option.action === "realtime"));
  assert.ok(options.some((option) => option.action === "prospects"));
});

test("the chief offers global status and data shortcuts instead of task creation", () => {
  const options = chiefOptionsForSnapshot({ active: false, status: "空闲" });
  assert.ok(options.length > 0);
  assert.ok(options.some((option) => option.action === "realtime"));
  assert.ok(options.some((option) => option.action === "prospects"));
  assert.equal(options.some((option) => option.action === "start-find"), false);
  assert.equal(options.some((option) => option.action === "start-follow-up"), false);
});

test("chief overview reads the live team roster in addition to default roles", async () => {
  const source = await readFile(new URL("../src/salebuddy/ui/agent-drawer.js", import.meta.url), "utf8");
  const snapshot = source.slice(source.indexOf("function chiefSnapshot"), source.indexOf("const ROLE_WORKSPACE_PAGES"));
  assert.match(snapshot, /teamLive\?\.getProfiles\?\.\(\)/);
  assert.match(snapshot, /\.\.\.profiles\.keys\(\)/);
  assert.match(snapshot, /\.\.\.works\.map\(\(work\) => work\.agentType\)/);
});

test("the chief keeps the same global shortcuts after tasks complete", () => {
  const options = chiefOptionsForSnapshot({ active: true, status: "已完成" });
  assert.ok(options.some((option) => option.action === "realtime"));
  assert.ok(options.some((option) => option.action === "chat"));
});

test("blocked chief keeps global shortcuts instead of offering a new task", () => {
  const options = chiefOptionsForSnapshot({ active: true, status: "待你确认" });
  assert.ok(options.some((option) => option.action === "realtime"));
  assert.equal(options.some((option) => option.action === "start-find"), false);
});

test("acquisition drawer exposes guarded actions with active listener task context", () => {
  assert.equal(isAcquisitionDrawerAgent("mkt-find-people"), true);
  assert.equal(isAcquisitionDrawerAgent("mkt-live-lead-miner"), false);
  const context = acquisitionDrawerContext("mkt-find-people", { task: { id: "task-2", accountId: "account-2" } });
  assert.deepEqual(acquisitionDrawerActionPayload("mkt-find-people", "pause", context), {
    agentId: "mkt-find-people", action: "pause", taskId: "task-2", accountId: "account-2"
  });
  const actions = acquisitionDrawerActions({ taskState: "error", hasTask: true });
  assert.equal(actions.find((item) => item.action === "pause").disabled, true);
  assert.equal(actions.find((item) => item.action === "stop").disabled, true);
  assert.equal(actions.find((item) => item.action === "realtime").disabled, false);
});

test("acquisition workspace shows explicit empty-data state instead of invented metrics", () => {
  const page = acquisitionWorkspaceDataFor("mkt-find-people");
  assert.deepEqual(page.metrics.map(([value]) => value), ["—", "—", "—"]);
  assert.ok(page.metrics.every(([, label]) => /等待真实数据|真实产出/.test(label)));
  assert.ok(page.rows.every(([, detail]) => /尚未产生真实产出|等待真实数据/.test(detail)));
  assert.doesNotMatch(JSON.stringify(page), /3,842|126|18 个/);
});

test("acquisition workspace renders counts only from a real task snapshot", () => {
  const page = acquisitionWorkspaceDataFor("mkt-find-people", {
    task: { metadata: { interactionCount: 8, candidateCount: 2, pendingCount: 1 } },
    work: { state: "running" }
  });
  assert.deepEqual(page.metrics, [["2", "真实候选潜客"], ["8", "真实互动证据"], ["1", "真实待分析"]]);
});

test("generated finder cloud screen reads the same real-data presentation path", async () => {
  const empty = acquisitionCloudPresentationFor("mkt-find-people");
  assert.deepEqual(empty.metrics.map(([value]) => value), ["—", "—", "—"]);
  assert.match(empty.rows[0][1], /尚未产生真实产出/);
  assert.doesNotMatch(JSON.stringify(empty), /214|68|92%|公开电商账号与互动/);

  const real = acquisitionCloudPresentationFor("mkt-find-people", {
    task: { metadata: { candidateCount: 4, interactionCount: 9, pendingCount: 2 } },
    work: { state: "running" }
  });
  assert.deepEqual(real.metrics, [["4", "真实候选潜客"], ["9", "真实互动证据"], ["2", "真实待分析"]]);
  assert.match(real.rows[0][1], /真实任务/);

  const source = await readFile(new URL("../src/salebuddy/ui/agent-drawer.js", import.meta.url), "utf8");
  assert.match(source, /page = acquisitionCloudPresentationFor\(page\.agentType, snapshot\)/);
  assert.match(source, /Array\.isArray\(page\.metrics\)/);
  assert.match(source, /Array\.isArray\(page\.rows\)/);
  const renderer = source.slice(source.indexOf("function renderGeneratedCloudScreen"), source.indexOf("function renderAgentCloud"));
  assert.doesNotMatch(renderer, /214|68|92%|公开电商账号与互动/);
});

test("acquisition cloud presentation is explicit until a real snapshot exists", async () => {
  const source = await readFile(new URL("../src/salebuddy/ui/agent-drawer.js", import.meta.url), "utf8");
  assert.match(source, /waitingForData = isAcquisitionDrawerAgent\(agentType\) && !hasAcquisitionSnapshot/);
  assert.match(source, /尚未产生真实产出/);
  assert.doesNotMatch(source, /mkt-live-lead-miner[\s\S]{0,500}3,842/);
});

test("finder cloud presentation never exposes static stores without real data", () => {
  const empty = acquisitionCloudPresentationFor("mkt-find-people");
  assert.deepEqual(empty.stores, []);
});

test("finder cloud presentation surfaces task errors instead of default progress", () => {
  const failed = acquisitionCloudPresentationFor("mkt-find-people", {
    task: { state: "error", lastError: { code: "DOUYIN_MCP_AUTH_REQUIRED", message: "抖音授权已失效" } }
  });
  assert.equal(failed.errorState, true);
  assert.equal(failed.errorMessage, "抖音授权已失效");
  assert.deepEqual(failed.stores, []);
  assert.match(failed.overlayTitle, /异常|失败/);
  assert.match(failed.overlayDetail, /授权已失效/);
});

test("live acquisition drawer does not initialize a static store", async () => {
  const source = await readFile(new URL("../src/salebuddy/ui/agent-drawer.js", import.meta.url), "utf8");
  assert.match(source, /isAcquisitionDrawerAgent\(agentType\) \? null : cloudPage\.stores\[0\]/);
});

test("agent drawer conversation uses durable messages instead of work activity", async () => {
  const source = await readFile(new URL("../src/salebuddy/ui/agent-drawer.js", import.meta.url), "utf8");
  assert.match(source, /gateway\.action\("dm\.message\.list"/);
  assert.match(source, /gateway\.action\("dm\.message\.send"/);
  assert.match(source, /result\?\.accepted === false \|\| result\?\.ok === false/);
  assert.doesNotMatch(source, /listAgentActivity\(agentType\)/);
  assert.doesNotMatch(source, /state\.messages\.push\(\{ role: "agent"/);
});

test("agent drawer filters activity records from durable conversation messages", () => {
  const messages = normalizeAgentConversationMessages([
    { id: "dm-1", from: "user", text: "帮我找客户" },
    { id: "activity-1", from: "agent", text: "已扫描 50 个候选", metadata: { source: "agent-activity" } },
    { id: "legacy-1", from: "agent", text: "你好，我是周砚，负责线索挖掘。" },
    { id: "dm-2", from: "agent", text: "我会先按你的目标推进", metadata: { companion: { inReplyTo: "dm-1" } } }
  ]);

  assert.deepEqual(messages.map(({ id, role, text }) => ({ id, role, text })), [
    { id: "dm-1", role: "user", text: "帮我找客户" },
    { id: "dm-2", role: "agent", text: "我会先按你的目标推进" }
  ]);
});

test("agent drawer hides legacy agent messages without an explicit conversation origin", () => {
  const messages = normalizeAgentConversationMessages([
    { id: "user-1", from: "user", text: "继续处理" },
    { id: "legacy-1", from: "mkt-lead-miner", text: "你好，我是周砚，负责线索挖掘。" },
    { id: "reply-1", from: "mkt-lead-miner", text: "我会按你的目标推进", metadata: { companion: { inReplyTo: "user-1" } } }
  ]);

  assert.deepEqual(messages.map(({ id }) => id), ["user-1", "reply-1"]);
});

test("agent drawer includes subtle conversation state motion with reduced-motion fallback", async () => {
  const source = await readFile(new URL("../src/salebuddy/ui/agent-drawer.js", import.meta.url), "utf8");
  assert.match(source, /sb-agent-chat-message\.is-new/);
  assert.match(source, /sb-agent-chat-send\[aria-busy="true"\]/);
  assert.match(source, /prefers-reduced-motion:reduce/);
});

test("chief drawer keeps work snapshots out of the private conversation", async () => {
  const source = await readFile(new URL("../src/salebuddy/ui/agent-drawer.js", import.meta.url), "utf8");
  const chiefRenderer = source.slice(source.indexOf("function renderChiefDialogue"), source.indexOf("function renderBody"));
  assert.doesNotMatch(chiefRenderer, /最近一条进展|有新的进展/);
  assert.match(chiefRenderer, /sb-chief-empty/);
  assert.doesNotMatch(chiefRenderer, /收到，我会先把目标拆解并安排对应的数字员工/);
});

test("chief drawer sends free text through the decision flow without task creation or control", async () => {
  const source = await readFile(new URL("../src/salebuddy/ui/agent-drawer.js", import.meta.url), "utf8");
  const chiefFlow = source.slice(source.indexOf("async function sendChiefTurn"), source.indexOf("function renderChiefDialogue"));
  assert.match(chiefFlow, /gateway\.action\("chief\.message\.decide"/);
  assert.doesNotMatch(chiefFlow, /startSkillTask\(/);
  assert.doesNotMatch(chiefFlow, /chiefDecisionId/);
  assert.doesNotMatch(chiefFlow, /task\.requirement\.edit/);
  assert.doesNotMatch(chiefFlow, /task\.run\.snapshot|task\.pause|task\.resume|task\.cancel|task\.retry/);
  assert.match(chiefFlow, /suppressAutoReply:\s*true/);
  assert.doesNotMatch(chiefFlow, /beginWork\("main"/);
  assert.doesNotMatch(chiefFlow, /pushActivity\("main"/);
  assert.match(source, /chiefDialogue\.phase = "thinking"/);
  assert.match(source, /sb-chief-thinking/);
});
