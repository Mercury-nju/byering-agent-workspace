import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { getAcquisitionCapabilityReadiness, getAcquisitionCardAction } from "../src/salebuddy/agents/acquisition-capability.js";
import { MARKETPLACE_AGENTS } from "../src/salebuddy/agents/marketplace.js";
import { bindAcquisitionCardAction, getAcquisitionCardViewModel } from "../src/salebuddy/ui/acquisition-card-controller.js";

const source = fs.readFileSync(new URL("../src/salebuddy/ui/agent-square.js", import.meta.url), "utf8");
const prospectSource = fs.readFileSync(new URL("../src/salebuddy/ui/prospect-center.js", import.meta.url), "utf8");
const taskChoicesSource = fs.readFileSync(new URL("../src/salebuddy/ui/task-choices.js", import.meta.url), "utf8");
const appSource = fs.readFileSync(new URL("../src/salebuddy/index.js", import.meta.url), "utf8");

test("Agent Square categories are grouped into a vertical workflow", () => {
  assert.match(source, /\.sb-as-toolbar\{[^}]*gap:8px;[^}]*padding:28px 28px 10px\}/);
  assert.doesNotMatch(source, /\.sb-as-toolbar\{[^}]*border-bottom:1px solid/);
  assert.match(source, /\.sb-as-cta\{[^}]*max-width:760px/);
  assert.match(source, /\.sb-as-cta strong\{[^}]*font-size:24px/);
  assert.match(source, /\.sb-as-cta span\{[^}]*max-width:700px;[^}]*font-size:14px/);
  assert.match(source, /\.sb-as-filter-row\{[^}]*display:flex;[^}]*margin-top:10px/);
  assert.match(source, /\.sb-as-chips\{[^}]*display:flex;[^}]*overflow-x:auto;[^}]*flex-wrap:nowrap/);
  assert.match(source, /\.sb-as-category-icon\.sb-as-chip-icon\{[^}]*width:15px;[^}]*height:15px/);
  assert.match(source, /\.sb-as-chip\{[^}]*height:34px/);
  assert.match(source, /\.sb-as-chip::after\{[^}]*content:attr\(data-count\)/);
  assert.match(source, /\.sb-as-chip\.sb-on\{[^}]*background:#1F2329/);
  assert.match(source, /\.sb-as-category-list\{[^}]*display:grid;[^}]*gap:12px;[^}]*padding:8px 28px 28px/);
  assert.match(source, /\.sb-as-category-section\{[^}]*min-width:0/);
  assert.match(source, /\.sb-as-category-section\+\.sb-as-category-section\{[^}]*padding-top:8px\}/);
  assert.doesNotMatch(source, /\.sb-as-category-section\+\.sb-as-category-section\{[^}]*border-top:1px solid/);
  assert.match(source, /\.sb-as-category-grid\{display:grid;grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(source, /const AGENT_STAGE_ICONS = Object\.freeze\(\{/);
  assert.doesNotMatch(source, /const AGENT_STAGE_DESCRIPTIONS/);
  assert.doesNotMatch(source, /sb-as-category-description/);
  assert.match(source, /const AGENT_SQUARE_FILTER_ORDER = Object\.freeze\(\["全部", \.\.\.AGENT_WORKFLOW_DISPLAY_ORDER\]\)/);
  assert.match(source, /const AGENT_WORKFLOW_DISPLAY_ORDER = Object\.freeze\(\["找人", "分析", "触达", "私信对话", "开发者模式"\]\)/);
  assert.match(source, /categoryNav: "全部"/);
  assert.match(source, /全部: \{ filledIcon: "agent-grid", color: "#536273" \}/);
  assert.doesNotMatch(source, /filledIcon: "sparkles"/);
  assert.match(source, /找人: \{ filledIcon: "user-search", color: "#278AF0" \}/);
  assert.match(source, /触达: \{ filledIcon: "paper-plane", color: "#7C45F7" \}/);
  assert.match(source, /私信对话: \{ filledIcon: "chat-bubble", color: "#E28A2B" \}/);
  assert.match(source, /分析: \{ filledIcon: "analysis-chart", color: "#5CB85C" \}/);
  assert.doesNotMatch(source, /people-search|growth-chart/);
  assert.match(source, /"user-search": '[^']*<circle[^']*stroke="currentColor"/);
  assert.match(source, /"analysis-chart": '[^']*<path[^']*stroke="currentColor"/);
  assert.match(source, /const sections = el\("div", "sb-as-category-list"\)/);
  assert.match(source, /const mainFilterRow = el\("div", "sb-as-filter-row sb-as-filter-main"\)/);
  assert.match(source, /for \(const stage of AGENT_SQUARE_FILTER_ORDER\) \{/);
  assert.match(source, /let activeFilter = state\.categoryNav \|\| "全部"/);
  assert.match(source, /state\.categoryNav = stage/);
  assert.match(source, /target\?\.scrollIntoView\?\.\(\{ behavior: "smooth", block: "start" \}\)/);
  assert.match(source, /const allAgentsGrid = el\("div", "sb-as-category-grid"\)/);
  assert.match(source, /targetRow: allAgentsGrid/);
  assert.match(source, /const allSection = buildCategorySection\("全部", allAgentsGrid\)/);
  assert.match(source, /sectionByCategory\.set\("全部", allSection\)/);
  assert.match(source, /const categoryRows = new Map\(AGENT_WORKFLOW_DISPLAY_ORDER\.map/);
  assert.match(source, /renderTeamSection\(sections, \{[\s\S]*includeReady: true,[\s\S]*includeUnavailable: false,[\s\S]*targetRows: categoryRows/);
  assert.match(source, /const agentsByCategory = new Map\(AGENT_WORKFLOW_DISPLAY_ORDER\.map/);
  assert.match(source, /const availableAgents = MARKETPLACE_AGENTS[\s\S]*\.filter\(\(agent\) => !hiddenIds\.has\(agent\.id\)\)[\s\S]*\.filter\(isFirstReleaseAgent\)/);
  assert.match(source, /for \(const category of AGENT_WORKFLOW_DISPLAY_ORDER\) \{/);
  assert.match(source, /categoryRows\.get\(category\)\?\.appendChild/);
  assert.match(source, /buildCategorySection\(category, grid\)/);
  assert.match(source, /copy\.appendChild\(title\)/);
  assert.match(source, /el\("strong", null, "找到能直接帮你做事的 Agent"\)/);
  assert.match(source, /el\("span", null, "这些 Agent 覆盖找客户、分析账号、首次触达和私信接待，选一个就能开始"\)/);
  assert.doesNotMatch(source, /sb-as-search-row|sb-as-search|搜索成员、技能|搜索过滤/);
  assert.doesNotMatch(source, /sb-as-filter-label/);
  assert.doesNotMatch(source, /mainFilterRow\.appendChild\(el\("span", [^\n]*"能力"\)\)/);
});

test("Agent Center places the core capability Agents in Developer Mode", () => {
  assert.match(source, /const DEVELOPER_MODE_AGENT_IDS = new Set\(\[\s*"mkt-find-people",\s*"mkt-intent-analyst",\s*"mkt-cold-writer",\s*"mkt-dm-inbox"\s*\]\)/);
  assert.match(source, /开发者模式: \{ filledIcon: "developer", color: "#536273" \}/);
  assert.match(source, /if \(DEVELOPER_MODE_AGENT_IDS\.has\(agent\?\.id\)\) return "开发者模式";/);
  assert.doesNotMatch(source, /DEVELOPER_MODE_AGENT_IDS\.add/);

  const homeStart = source.indexOf("function renderHome()");
  const homeEnd = source.indexOf("\n  function render()", homeStart);
  assert.ok(homeStart >= 0 && homeEnd > homeStart);
  const homeSource = source.slice(homeStart, homeEnd);
  assert.match(homeSource, /for \(const category of AGENT_WORKFLOW_DISPLAY_ORDER\) \{/);
  assert.match(homeSource, /sectionByCategory\.set\(category, section\)/);
  assert.match(source, /const AGENT_SQUARE_FILTER_ORDER = Object\.freeze\(\["全部", \.\.\.AGENT_WORKFLOW_DISPLAY_ORDER\]\)/);
});

test("Agent Center excludes Developer Mode cards from the all-agents view", () => {
  const homeStart = source.indexOf("function renderHome()");
  const homeEnd = source.indexOf("\n  function render()", homeStart);
  assert.ok(homeStart >= 0 && homeEnd > homeStart);
  const homeSource = source.slice(homeStart, homeEnd);

  assert.match(homeSource, /function removeDeveloperModeCards\(row\)/);
  assert.match(homeSource, /const developerModeCards = \[\.\.\.row\.children\]\.filter\(\(card\) => DEVELOPER_MODE_AGENT_IDS\.has\(card\.dataset\.sbAgentId\)\)/);
  assert.match(homeSource, /for \(const card of developerModeCards\) row\.removeChild\(card\)/);
  assert.match(homeSource, /removeDeveloperModeCards\(allAgentsGrid\)/);
  assert.match(homeSource, /targetRows: categoryRows/);
});

test("Agent Square keeps the complete acquisition Agent in the all-agents section", () => {
  assert.doesNotMatch(source, /"mkt-comment-acquisition": "综合能力"/);
  assert.match(source, /if \(agent\?\.id === DOUYIN_ACQUISITION_COMPLETE_AGENT_ID\) return null/);
  assert.doesNotMatch(source, /综合能力: "一个 Agent 串起找人、分析、触达和私信对话"/);

  const homeStart = source.indexOf("function renderHome()");
  const homeEnd = source.indexOf("\n  function render()", homeStart);
  assert.ok(homeStart >= 0 && homeEnd > homeStart);
  const homeSource = source.slice(homeStart, homeEnd);
  assert.match(homeSource, /const target = sectionByCategory\.get\(stage\)/);
  assert.doesNotMatch(homeSource, /category === "综合能力"/);
  assert.match(homeSource, /allSection\.id = "sb-as-category-all"/);
  assert.match(homeSource, /if \(category && agentsByCategory\.has\(category\)\)/);

  const teamStart = source.indexOf("function renderTeamSection");
  const teamEnd = source.indexOf("// ── Agent市场卡片 ──", teamStart);
  assert.ok(teamStart >= 0 && teamEnd > teamStart);
  const teamSource = source.slice(teamStart, teamEnd);
  assert.match(teamSource, /const categoryRow = targetRows\.get\(category\)/);
  assert.doesNotMatch(teamSource, /targetRows\.get\(workflowCategory\(\{ category \}\)\)/);
});

test("Agent Square cards use one complete responsibility description", () => {
  assert.match(source, /name:\s*agent\?\.displayName\s*\|\|\s*displayAgentName/);
  assert.match(source, /title:\s*agent\?\.displayTitle\s*\|\|\s*displayAgentTitle/);
  assert.doesNotMatch(source, /state\.query|const haystack =/);
  assert.match(source, /\.sb-as-desc\{[^}]*min-height:44px;[^}]*margin:14px 0 6px;[^}]*overflow-wrap:anywhere/);
  assert.doesNotMatch(source.match(/\.sb-as-desc\{[^}]*\}/)?.[0] || "", /line-clamp/);
  const cardStart = source.indexOf("function buildCard(agent)");
  const homeStart = source.indexOf("// ── 首页视图 ──", cardStart);
  assert.ok(cardStart >= 0 && homeStart > cardStart);
  assert.match(source.slice(cardStart, homeStart), /description:\s*agent\.desc/);
  assert.doesNotMatch(source, /top\.appendChild\(el\("div", "sb-as-title", title\)\)/);
});

test("Agent summary descriptions stay concise without losing the core outcome", () => {
  for (const agent of MARKETPLACE_AGENTS) {
    assert.ok(agent.desc.length <= 42, `${agent.name} description is too long: ${agent.desc.length}`);
  }
  assert.equal(
    MARKETPLACE_AGENTS.find((agent) => agent.id === "mkt-comment-acquisition")?.desc,
    "从互动用户中找人、分析、首次私信联系和后续对话处理，串起完整获客链路。"
  );
});

test("获客专家在一个启动流中完成账号和接待策略配置", () => {
  assert.match(source, /function isInboxIntakeFlow\(agent, flow = null\)/);
  const flowStart = source.indexOf("function openUseFlow");
  const flowEnd = source.indexOf("function clearAuthFeedback", flowStart);
  const flow = source.slice(flowStart, flowEnd);
  assert.match(flow, /const managerSetup = isCommentAcquisitionAgent\(agent\)/);
  assert.match(flow, /mode: managerSetup \? "inbox" : saved\?\.mode \|\| "acquisition"/);
  assert.match(flow, /managerCombinedStart: managerSetup \|\| saved\?\.managerCombinedStart === true/);

  const setupStart = source.indexOf("function renderInboxSetup");
  const setupEnd = source.indexOf("function renderInboxStarting", setupStart);
  const setup = source.slice(setupStart, setupEnd);
  assert.match(setup, /后台自动识别账号定位和潜客/);
  assert.match(setup, /DOUYIN_AUTO_AUDIENCE_GOAL/);
  assert.doesNotMatch(setup, /你想找什么样的人|补充说明（选填）|首次怎么联系/);
  assert.doesNotMatch(setup, /监听方式|持续监听新的作品评论、直播互动和账号互动通知，不回扫历史内容/);
  assert.match(setup, /告诉我怎么回复/);
  assert.match(setup, /启动完整获客任务/);
  assert.doesNotMatch(setup, /配置接待方式（必填）/);
  assert.match(source, /if \(isInboxIntakeFlow\(agent, flow\)\) \{\s*startInboxIntake\(agent, flow/);
  assert.match(source, /const managerSetupError = validateCommentAcquisitionSetup\(flow\)/);
  assert.match(source, /async function startCommentAcquisition\(agent, flow, \{ authorizedAccount = null \} = \{\}\)/);
  assert.match(source, /let account = authorizedAccount;/);
  assert.match(source, /await startCompleteAcquisitionAfterInbox\(agent, flow, authorizedAccount\)/);
  assert.match(source, /await startCommentAcquisition\(agent, flow, \{ authorizedAccount \}\)/);
  assert.match(source, /persistCloudTask\(flow, \{ phase: "creating"/);
});

test("listener startup never restores a historical work scope", () => {
  const flowStart = source.indexOf("function openUseFlow");
  const flowEnd = source.indexOf("function clearAuthFeedback", flowStart);
  assert.ok(flowStart >= 0 && flowEnd > flowStart);
  const flow = source.slice(flowStart, flowEnd);

  assert.match(flow, /const savedFinderListener = isFinderListenerFlow\(agent, saved \|\| \{\}\);/);
  assert.match(flow, /const savedLongRunning = isLongRunningAcquisitionAgent\(agent\) \|\| savedFinderListener;/);
  assert.match(flow, /workScope:\s*savedLongRunning\s*\?\s*""\s*:/);
  assert.doesNotMatch(flow, /workScope:\s*saved\?\.workScope\s*\|\|\s*"最近30条作品"/);
  assert.match(flow, /if \(savedLongRunning \|\| savedLiveDanmakuAnalysis \|\| savedLiveDanmakuOutreach\) stripListenerHistoricalFields\(state\.useFlow\);/);
});

test("only durable agents are marked long-running in setup and resume state", () => {
  const flowStart = source.indexOf("function openUseFlow");
  const flowEnd = source.indexOf("function clearAuthFeedback", flowStart);
  assert.ok(flowStart >= 0 && flowEnd > flowStart);
  const flow = source.slice(flowStart, flowEnd);

  assert.match(flow, /const isDurableTask = inboxIntake \|\| savedLongRunning \|\| savedLiveDanmakuAnalysis \|\| savedLiveDanmakuOutreach;/);
  assert.match(flow, /longRunning: isDurableTask,/);
  assert.doesNotMatch(flow, /longRunning: true,/);

  const resumeStart = source.indexOf("function cloudResumeFlow");
  const resumeEnd = source.indexOf("function persistCloudTask", resumeStart);
  assert.ok(resumeStart >= 0 && resumeEnd > resumeStart);
  const resume = source.slice(resumeStart, resumeEnd);

  assert.match(resume, /const isDurableTask = inboxIntake \|\| longRunningAcquisition \|\| liveDanmakuAnalysis \|\| liveDanmakuOutreach;/);
  assert.match(resume, /longRunning: isDurableTask/);
  assert.doesNotMatch(resume, /longRunning: true/);
});

test("所有监听任务恢复时都会清理旧版本遗留的历史回看字段", () => {
  const helperStart = source.indexOf("function stripListenerHistoricalFields");
  const helperEnd = source.indexOf("function isInboxAgent", helperStart);
  assert.ok(helperStart >= 0 && helperEnd > helperStart);
  const helper = source.slice(helperStart, helperEnd);

  assert.match(helper, /"window", "workScope", "workCount", "lookbackDays", "lookback_days"/);
  assert.match(helper, /"timeWindow", "time_window", "historyWindow", "history_window"/);
  assert.match(helper, /"dateRange", "date_range", "contentRange", "content_range"/);
  assert.match(helper, /"days", "start", "end", "from", "to"/);
  assert.doesNotMatch(helper, /workSchedule|contactTiming/);
  assert.match(helper, /strip\(flow\.configuration\);/);
  assert.match(helper, /strip\(flow\.taskSnapshot\?\.config\);/);
  assert.match(helper, /strip\(flow\.taskSnapshot\?\.configuration\);/);
  assert.doesNotMatch(helper, /preserveSchedule|timeWindow\.schedule/);
  assert.match(source, /if \(longRunningAcquisition \|\| liveDanmakuAnalysis \|\| liveDanmakuOutreach\) stripListenerHistoricalFields\(resume\);/);
});

test("监听任务在迁移旧快照前会复制快照，避免修改已保存的原始任务", () => {
  assert.match(source, /taskSnapshot: legacyPreview \? null : saved\?\.taskSnapshot \? structuredClone\(saved\.taskSnapshot\) : null,/);
  assert.match(source, /taskSnapshot: flow\.taskSnapshot \? structuredClone\(flow\.taskSnapshot\) : null,/);
});

test("客户分析员在没有候选人时展示完整链路并提供可执行的找客入口", () => {
  const setupStart = source.indexOf("function renderIntentAnalystSetup");
  const setupEnd = source.indexOf("function renderIntentAnalystRunning", setupStart);
  assert.ok(setupStart >= 0 && setupEnd > setupStart);
  const setup = source.slice(setupStart, setupEnd);

  assert.match(setup, /先完成找客，再分析客户/);
  assert.match(setup, /找客专员先汇总互动用户，再由客户分析员判断购买意向/);
  assert.match(setup, /找客专员 → 客户分析员 → 潜客触达专员/);
  assert.match(setup, /先使用找客专员/);
  assert.match(setup, /openFinderForDependency\(\)/);
  assert.doesNotMatch(setup, /先运行「抖音找人助手」/);
});

test("Agent Center lets customer analyst open before a finder result exists", () => {
  const hireStart = source.indexOf("function buildHireButton(agent)");
  const hireEnd = source.indexOf("function openEmploymentDialog", hireStart);
  assert.ok(hireStart >= 0 && hireEnd > hireStart);
  const hire = source.slice(hireStart, hireEnd);

  assert.doesNotMatch(hire, /shouldGuideIntentAnalystEntry|openIntentAnalystDependencyDialog/);
  assert.match(source, /function renderIntentAnalystModeChooser\(panel, flow\)/);
  assert.match(source, /单独做用户分析/);
  assert.match(source, /输入分析提示词/);
});

test("Agent Center blocks empty private outreach behind the same lifecycle gate", () => {
  const hireStart = source.indexOf("function buildHireButton(agent)");
  const hireEnd = source.indexOf("function openEmploymentDialog", hireStart);
  assert.ok(hireStart >= 0 && hireEnd > hireStart);
  const hire = source.slice(hireStart, hireEnd);

  assert.match(hire, /if \(shouldGuidePrivateOutreachEntry\(agent\)\) \{\s*openPrivateOutreachDependencyDialog\(agent\);\s*return;/);
  assert.match(source, /function privateOutreachDependencyState\(\)/);
  assert.match(source, /function shouldGuidePrivateOutreachEntry\(agent\)/);
  assert.match(source, /function openPrivateOutreachDependencyDialog\(agent\)/);
  assert.match(source, /先完成找客和分析，再触达潜客/);
  assert.match(source, /先完成客户分析，再触达潜客/);
  assert.match(source, /先使用客户分析员/);
  assert.match(source, /先使用找客专员/);
});

test("找客结果可以直接交给客户分析员，而不要求用户重新录入名单", () => {
  const runningStart = source.indexOf("function renderDouyinFinderRunning");
  const runningEnd = source.indexOf("function intentCandidateFromRecord", runningStart);
  assert.ok(runningStart >= 0 && runningEnd > runningStart);
  const running = source.slice(runningStart, runningEnd);

  assert.match(source, /function openIntentAnalystForFinder\(flow\)/);
  assert.match(source, /prefilledFromFinder: saved\?\.prefilledFromFinder === true/);
  assert.match(running, /分析本次候选人/);
  assert.match(running, /openIntentAnalystForFinder\(flow\)/);
});

test("潜客触达专员在未选择合规对象时提供上游获取入口且保留账号边界", () => {
  const setupStart = source.indexOf("function renderPrivateOutreachSetup");
  const setupEnd = source.indexOf("function renderPrivateOutreachReview", setupStart);
  assert.ok(setupStart >= 0 && setupEnd > setupStart);
  const setup = source.slice(setupStart, setupEnd);

  assert.match(setup, /先用找客专员汇总用户/);
  assert.match(setup, /先由客户分析员判断意向后，符合条件的潜客会自动出现在这里/);
  assert.match(setup, /openFinderForDependency\(\)/);
  assert.match(setup, /openProspectSelectionForOutreach/);
  assert.doesNotMatch(setup, /外部账号录入|粘贴账号主页|上传名单/);
});

test("finder listener resumes as a durable discovery task without outreach residue", () => {
  const resumeStart = source.indexOf("function cloudResumeFlow");
  const resumeEnd = source.indexOf("function persistCloudTask", resumeStart);
  assert.ok(resumeStart >= 0 && resumeEnd > resumeStart);
  const resume = source.slice(resumeStart, resumeEnd);

  assert.match(resume, /const finderListener = isFinderListenerFlow\(agent, flow\);/);
  assert.match(resume, /const longRunningAcquisition = isLongRunningAcquisitionAgent\(agent\) \|\| finderListener;/);
  assert.match(resume, /\(longRunningAcquisition \|\| liveDanmakuAnalysis \|\| liveDanmakuOutreach\) && flow\.taskKey && flow\.running !== false \? "running" : "setup"/);
  assert.match(resume, /resume\.compositeFinderSource = "own";/);
  assert.match(resume, /resume\.finderGoal = flow\.finderGoal \|\| flow\.product \|\| "";/);
  assert.match(resume, /"window", "workScope", "workCount"/);
  assert.match(resume, /"message", "touchStrategy", "contactTiming", "replyStyle", "handoffBoundary", "conversionGoal"/);
  assert.match(resume, /"touchChannel", "maxTouchesPerDay", "minIntervalMinutes", "stopConditions"/);
});

test("获客专家的承接已启动而完整任务失败时保留半启动状态并只重试完整任务", () => {
  const completeStart = source.indexOf("async function startCompleteAcquisitionAfterInbox");
  const completeEnd = source.indexOf("async function startInboxIntake", completeStart);
  assert.ok(completeStart >= 0 && completeEnd > completeStart);
  const complete = source.slice(completeStart, completeEnd);

  assert.match(complete, /flow\.managerInboxRuntimeStarted === true/);
  assert.match(complete, /flow\.managerAcquisitionStartFailed = true/);
  assert.match(complete, /私信承接已启动，但完整获客任务未能启动/);
  assert.match(complete, /不会重复启动私信承接/);
  assert.match(complete, /persistCloudTask\(flow, \{[\s\S]*partialStart: "inbox_running_acquisition_failed"/);
  assert.match(source, /async function retryCompleteAcquisitionAfterInbox\(agent, flow\)/);
  assert.match(source, /await controlCommentAcquisitionTask\(flow, "retry"\)/);
  assert.match(source, /await startCommentAcquisition\(agent, flow\)/);

  const runningStart = source.indexOf("function renderCommentAcquisitionRunning");
  const runningEnd = source.indexOf("function finderAccountLabel", runningStart);
  assert.ok(runningStart >= 0 && runningEnd > runningStart);
  const running = source.slice(runningStart, runningEnd);
  assert.match(running, /继续启动完整获客/);
  assert.match(running, /retryCompleteAcquisitionAfterInbox/);
  assert.match(running, /重试任务/);
});

test("Agent summary cards do not show live work status", () => {
  const teamStart = source.indexOf("function renderTeamSection");
  const teamEnd = source.indexOf("// ── Agent市场卡片 ──", teamStart);
  assert.ok(teamStart >= 0 && teamEnd > teamStart);
  const teamSource = source.slice(teamStart, teamEnd);
  assert.doesNotMatch(teamSource, /footerText:\s*[^\n]*状态：/);
  assert.doesNotMatch(teamSource, /footerStatusClass:/);

  const marketStart = source.indexOf("function buildCard(agent)");
  const marketEnd = source.indexOf("// ── 首页视图 ──", marketStart);
  assert.ok(marketStart >= 0 && marketEnd > marketStart);
  assert.doesNotMatch(source.slice(marketStart, marketEnd), /footerText:\s*`★/);
});

test("Agent Center uses the shared idle identity frame for marketplace avatars", () => {
  const cardStart = source.indexOf("function buildCard(agent)");
  const homeStart = source.indexOf("// ── 首页视图 ──", cardStart);
  assert.ok(cardStart >= 0 && homeStart > cardStart);
  const cardSource = source.slice(cardStart, homeStart);
  assert.match(cardSource, /avatarValue:\s*agent\.id/);
  assert.match(cardSource, /avatarState:\s*"idle"/);
  assert.doesNotMatch(cardSource, /marketplaceAvatarState/);
});

test("Agent summary cards show employment state instead of provider identity", () => {
  assert.match(source, /function buildProviderRow\(employmentStatus = "未雇佣"\)/);
  assert.match(source, /const hired = employmentStatus === "已雇佣"/);
  assert.match(source, /hired \? "sb-as-provider-check" : "sb-as-provider-dot"/);
  assert.match(source, /function isAgentReadyForUse\(agent\)/);
  assert.doesNotMatch(source, /buildProviderRow\(provider, providerExtra\)/);

  const teamStart = source.indexOf("function renderTeamSection");
  const teamEnd = source.indexOf("// ── Agent市场卡片 ──", teamStart);
  assert.ok(teamStart >= 0 && teamEnd > teamStart);
  const teamSource = source.slice(teamStart, teamEnd);
  assert.match(teamSource, /employmentStatus:\s*"已雇佣"/);
  assert.match(teamSource, /employmentStatus:\s*"未雇佣"/);

  const marketStart = source.indexOf("function buildCard(agent)");
  const marketEnd = source.indexOf("// ── 首页视图 ──", marketStart);
  assert.ok(marketStart >= 0 && marketEnd > marketStart);
  assert.match(source.slice(marketStart, marketEnd), /employmentStatus:\s*isAgentReadyForUse\(agent\)\s*\?\s*"已雇佣"\s*:\s*"未雇佣"/);
});

test("Agent Square cards do not expose implementation providers", () => {
  const cardStart = source.indexOf("function buildCard(agent)");
  const homeStart = source.indexOf("// ── 首页视图 ──", cardStart);
  assert.ok(cardStart >= 0 && homeStart > cardStart);
  const cardSource = source.slice(cardStart, homeStart);
  assert.match(cardSource, /employmentStatus:\s*isAgentReadyForUse\(agent\)\s*\?\s*"已雇佣"\s*:\s*"未雇佣"/);
  assert.doesNotMatch(cardSource, /provider(?:Extra)?\s*:/);
  assert.doesNotMatch(cardSource, /douyin-data MCP|Agent Data API|douyin MCP|MCP \+ RPA/);
});

test("Agent Square hire actions keep avatar colors separate", () => {
  assert.doesNotMatch(source, /function avatarActionAccent\(/);
  assert.doesNotMatch(source, /--sb-as-action-(?:color|dark|soft|border|hover)/);
});

test("Agent card action buttons use one shared brand color", () => {
  const cardStart = source.indexOf("function buildStandardCard");
  const teamStart = source.indexOf("function renderTeamSection");
  assert.ok(cardStart >= 0 && teamStart > cardStart);
  const cardSource = source.slice(cardStart, teamStart);
  assert.doesNotMatch(cardSource, /avatarActionAccent\(avatarValue, accent\)/);
  assert.match(source, /\.sb-as-hire\{[^}]*background:#EEF4FF[^}]*color:#4267A5/s);
  assert.match(source, /\.sb-as-hire\.sb-hired\{background:#EEF4FF;border-color:#D5E3F8;color:#4267A5\}/);
  assert.doesNotMatch(source, /--sb-as-agent-color/);
  const hireStart = source.indexOf("function buildHireButton(agent)");
  const hireEnd = source.indexOf("\n  function openEmploymentDialog", hireStart);
  assert.ok(hireStart >= 0 && hireEnd > hireStart);
  assert.doesNotMatch(source.slice(hireStart, hireEnd), /style\.setProperty\(/);
});

test("Agent Square places sorted marketplace cards into their workflow sections", () => {
  const homeStart = source.indexOf("function renderHome()");
  const homeEnd = source.indexOf("\n  function render()", homeStart);
  assert.ok(homeStart >= 0 && homeEnd > homeStart);
  const homeSource = source.slice(homeStart, homeEnd);
  assert.match(homeSource, /sortMarketplaceAgentsForDisplay\(agentsByCategory\.get\(category\), \{ isReady: isFirstReleaseAgent \}\)/);
  assert.match(homeSource, /categoryRows\.get\(category\)\?\.appendChild/);
  assert.match(homeSource, /for \(const category of AGENT_WORKFLOW_DISPLAY_ORDER\) \{/);
  assert.match(homeSource, /buildCategorySection\(category, grid\)/);
});

test("Agent Center hides the default chief of staff while retaining it in runtime profiles", () => {
  const teamStart = source.indexOf("function renderTeamSection");
  const teamEnd = source.indexOf("// ── Agent市场卡片 ──", teamStart);
  assert.ok(teamStart >= 0 && teamEnd > teamStart);
  const teamSource = source.slice(teamStart, teamEnd);
  assert.match(teamSource, /filter\(\(\[agentType\]\)\s*=>\s*agentType\s*!==\s*"main"\)/);
  assert.match(teamSource, /BYERING_DEFAULT_AGENT_TYPES/);
});

test("private outreach authorization is rendered as an actionable button", () => {
  const privateStart = source.indexOf("function renderPrivateOutreachSetup");
  const privateEnd = source.indexOf("function renderPrivateOutreachReview", privateStart);
  assert.ok(privateStart >= 0 && privateEnd > privateStart);
  const privateSetup = source.slice(privateStart, privateEnd);
  assert.match(privateSetup, /acquisitionAccountControl\(flow, \(\) => render\(\)\)/);
  assert.match(privateSetup, /先连接一个抖音账号/);
  assert.match(source, /authorize\.addEventListener\("click"/);
  assert.match(source, /startMcpAuthorization\(flow\)/);
});

test("private outreach mock exposes the full activation workflow without real provider calls", () => {
  assert.match(source, /createPrivateOutreachMockData/);
  assert.match(source, /const privateOutreachMockData = isPrivateOutreachMockPreview\(\) \? createPrivateOutreachMockData\(\) : null/);
  assert.match(source, /mockPreview: mockPrivateOutreach/);
  assert.match(source, /mockProspectRecords: Array\.isArray\(saved\?\.mockProspectRecords\)/);
  assert.match(source, /mockPrivateOutreach\s*\?\s*structuredClone\(privateOutreachMockData\.records\)/);
  assert.match(source, /MOCK 预览：下面会完整展示两种触达方式、发送私信和查看触达结果/);
  assert.match(source, /\["1 选择触达方式", "2 一键触达", "3 查看实时结果"\]/);
  const start = source.indexOf("async function startPrivateOutreach");
  const end = source.indexOf("function inboxStartState", start);
  assert.ok(start >= 0 && end > start);
  const privateFlow = source.slice(start, end);
  assert.match(privateFlow, /async function startPrivateOutreachMock/);
  assert.match(privateFlow, /createPrivateOutreachMockResult/);
  assert.match(privateFlow, /if \(flow\.mockPreview\) \{\s*await startPrivateOutreachMock/);
  assert.match(source, /不会向抖音发送真实私信/);
  assert.match(source, /function shouldGuidePrivateOutreachEntry\(agent\) \{[\s\S]*?if \(privateOutreachMockData\?\.records\?\.length\) return false;/);
  const mockStart = privateFlow.indexOf("async function startPrivateOutreachMock");
  const realStart = privateFlow.indexOf("async function startPrivateOutreach(agent");
  assert.doesNotMatch(privateFlow.slice(mockStart, realStart), /waitForDouyinAuthorization|send-private-message/);
});

test("single confirmed prospect outreach skips mode selection and explains its source", () => {
  const setupStart = source.indexOf("function renderPrivateOutreachSetup");
  const setupEnd = source.indexOf("function renderPrivateOutreachReview", setupStart);
  assert.ok(setupStart >= 0 && setupEnd > setupStart);
  const setup = source.slice(setupStart, setupEnd);

  assert.match(source, /inlineProspectOutreach = flow\.inlineProspectOutreach === true/);
  assert.match(source, /inlineProspectOutreach: saved\?\.inlineProspectOutreach === true/);
  assert.match(source, /inlineProspectOutreach: flow\.inlineProspectOutreach === true/);
  assert.match(setup, /if \(!inlineProspectOutreach\)/);
  assert.match(setup, /为什么可以直接触达/);
  assert.match(setup, /找客专员发现用户/);
  assert.match(setup, /客户分析员确认潜客/);
  assert.match(setup, /潜客触达专员首轮联系/);
  assert.match(setup, /本次直接触达这位潜客/);
  assert.match(setup, /这位潜客会直接进入首轮私信触达/);
  assert.match(prospectSource, /inlineProspectOutreach = outreachMode === PRIVATE_OUTREACH_MODES\.PROSPECTS && selected\.length === 1/);
});

test("each acquisition product Agent keeps its own authorization identity", () => {
  const fetchStart = source.indexOf("async function fetchAuthorizedAccounts");
  const fetchEnd = source.indexOf("function openUseFlow", fetchStart);
  assert.ok(fetchStart >= 0 && fetchEnd > fetchStart);
  const fetchAccounts = source.slice(fetchStart, fetchEnd);
  assert.match(fetchAccounts, /const requestedAgentId = String\(agentId \|\| ""\)\.trim\(\)/);
  assert.match(fetchAccounts, /const candidateAgentIds = requestedAgentId \? \[requestedAgentId\] : \[\]/);
  assert.doesNotMatch(fetchAccounts, /DOUYIN_ACQUISITION_MANAGER_AGENT_ID|isDouyinAcquisitionChildAgent/);
  assert.match(fetchAccounts, /mcpAuthorizedAccount\(status, candidateId\)/);

  const accountControlStart = source.indexOf("function acquisitionAccountControl");
  const accountControlEnd = source.indexOf("function renderAccountAnalysisSetup", accountControlStart);
  assert.ok(accountControlStart >= 0 && accountControlEnd > accountControlStart);
  const accountControl = source.slice(accountControlStart, accountControlEnd);
  assert.match(accountControl, /flow\.executionAgentId = selected\?\.agentId \|\| flow\.agentId/);
  assert.match(accountControl, /连接抖音账号/);
  assert.doesNotMatch(accountControl, /主管家|获客管家已绑定账号/);

  const inboxStart = source.indexOf("function renderInboxSetup");
  const inboxEnd = source.indexOf("function renderInboxStarting", inboxStart);
  assert.ok(inboxStart >= 0 && inboxEnd > inboxStart);
  const inbox = source.slice(inboxStart, inboxEnd);
  assert.match(inbox, /登录你的抖音账号/);
  assert.match(inbox, /flow\.executionAgentId = next\?\.agentId \|\| flow\.agentId/);
  assert.doesNotMatch(inbox, /主管家|继承/);
});

test("single-capability Agents block an account already managed by 抖音获客管家", () => {
  assert.match(source, /function managerBoundAccountForIdentity\(identity = \{\}, fallbackId = ""\)/);
  assert.match(source, /function managerBoundAccountForFlow\(flow = \{\}\)/);
  assert.match(source, /function managerBindingConflictForFlow\(agent, flow = \{\}\)/);
  assert.match(source, /function openManagerBindingConflictDialog\(agent, flow\)/);
  assert.match(source, /该账号已使用抖音获客管家/);
  assert.match(source, /打开抖音获客管家/);

  const authStart = source.indexOf("async function startMcpAuthorization");
  const authEnd = source.indexOf("function reauthorizeMcp", authStart);
  assert.ok(authStart >= 0 && authEnd > authStart);
  assert.match(source.slice(authStart, authEnd), /openManagerBindingConflictDialog\(requestedAgent, flow\)/);

  const applyAuthorizedStart = source.indexOf("function applyAuthorizedFlow");
  const applyAuthorizedEnd = source.indexOf("async function resumeBlockedAcquisitionAfterAuthorization", applyAuthorizedStart);
  assert.ok(applyAuthorizedStart >= 0 && applyAuthorizedEnd > applyAuthorizedStart);
  const applyAuthorized = source.slice(applyAuthorizedStart, applyAuthorizedEnd);
  assert.match(applyAuthorized, /managerBoundAccountForIdentity\(authorizedSession\?\.accountIdentity \|\| \{\}\)/);
  assert.match(applyAuthorized, /openManagerBindingConflictDialog\(requestedAgent, flow\)/);
  assert.doesNotMatch(applyAuthorized.slice(0, applyAuthorized.indexOf("const account = rememberAuthorizedManagedAccount")), /rememberAuthorizedManagedAccount/);

  const startUse = source.indexOf("function startUse(agent)");
  const startUseEnd = source.indexOf("async function startUserResearchFinder", startUse);
  assert.ok(startUse >= 0 && startUseEnd > startUse);
  assert.match(source.slice(startUse, startUseEnd), /openManagerBindingConflictDialog\(agent, flow\)/);
});

test("standalone Agent checks the manager conflict at execution time instead of setup entry", () => {
  const useStart = source.indexOf("function openUseFlow(agent");
  const useEnd = source.indexOf("const authorizedAccounts", useStart);
  assert.ok(useStart >= 0 && useEnd > useStart);
  const entry = source.slice(useStart, useEnd);
  assert.doesNotMatch(entry, /managerBoundAccounts\(\)/);
  assert.doesNotMatch(entry, /openManagerBindingConflictDialog/);

  const accountStart = source.indexOf("function acquisitionAccountControl");
  const accountEnd = source.indexOf("function renderAccountAnalysisSetup", accountStart);
  assert.ok(accountStart >= 0 && accountEnd > accountStart);
  const accountControl = source.slice(accountStart, accountEnd);
  assert.doesNotMatch(accountControl, /openManagerBindingConflictDialog/);

  const startUse = source.indexOf("function startUse(agent)");
  const startUseEnd = source.indexOf("async function startUserResearchFinder", startUse);
  assert.ok(startUse >= 0 && startUseEnd > startUse);
  assert.match(source.slice(startUse, startUseEnd), /openManagerBindingConflictDialog\(agent, flow\)/);
});

test("抖音获客管家只在正式雇佣后进入配置流", () => {
  const readyStart = source.indexOf("function isAgentReadyForUse(agent)");
  const readyEnd = source.indexOf("/** 能力标签", readyStart);
  assert.ok(readyStart >= 0 && readyEnd > readyStart);
  const ready = source.slice(readyStart, readyEnd);
  assert.match(ready, /return isHired\(agent\?\.id\);/);
  assert.doesNotMatch(ready, /acquisitionCard\?\.startable/);

  const useStart = source.indexOf("function openUseFlow(agent");
  const useEnd = source.indexOf("const authorizedAccounts", useStart);
  assert.ok(useStart >= 0 && useEnd > useStart);
  const use = source.slice(useStart, useEnd);
  assert.match(use, /employmentContractsLoaded && !isAgentReadyForUse\(agent\)/);

  assert.match(source, /let employmentContractsLoaded = false;/);
  assert.match(source, /void refreshEmploymentContracts\(\)[\s\S]*?employmentContractsLoaded = true;[\s\S]*?openUseFlow\(initialAgent, resumeFlow\);/);
});

test("marketplace hiring is immediate and does not route through an ability detail page", () => {
  const hireStart = source.indexOf("function buildHireButton(agent");
  const hireEnd = source.indexOf("function openEmploymentDialog", hireStart);
  assert.ok(hireStart >= 0 && hireEnd > hireStart);
  const hireSource = source.slice(hireStart, hireEnd);
  assert.match(hireSource, /employMarketplaceAgent\(agent\.id/);
  assert.match(hireSource, /render\(\)/);
  assert.doesNotMatch(hireSource, /openEmploymentDialog\(agent, "hire"\)/);
  assert.doesNotMatch(hireSource, /state\.view\s*=\s*"detail"/);

  const cardStart = source.indexOf("function buildCard(agent)");
  const homeStart = source.indexOf("// ── 首页视图 ──", cardStart);
  assert.ok(cardStart >= 0 && homeStart > cardStart);
  assert.doesNotMatch(source.slice(cardStart, homeStart), /state\.view\s*=\s*"detail"/);
  assert.doesNotMatch(source, /function renderDetail\(/);
  assert.doesNotMatch(source, /state\.view\s*=\s*"detail"/);
});

test("cloud account labels use the remote nickname and refresh stale placeholders", () => {
  assert.match(source, /concreteAccountName/);
  assert.match(source, /identity\.nickname/);
  assert.match(source, /stalePlaceholderNames/);
  assert.match(source, /正在读取已授权账号/);
  assert.match(source, /mountPersonAvatar\(avatar, flow\.accountIdentity/);
  const privateStart = source.indexOf("function renderPrivateOutreachSetup");
  const privateEnd = source.indexOf("function renderPrivateOutreachReview");
  assert.ok(privateStart >= 0 && privateEnd > privateStart);
  assert.doesNotMatch(source.slice(privateStart, privateEnd), /已授权抖音账号/);
});

test("comment acquisition uses the unified setup without a review gate", () => {
  const start = source.indexOf("function renderManagerInboxSetup");
  const end = source.indexOf("function renderInboxSetup", start);
  const setup = source.slice(start, end);
  assert.match(setup, /我会自动完成/);
  assert.match(setup, /启动抖音获客管家/);
  assert.match(setup, /startInboxIntake\(activeAgent, flow/);
  assert.doesNotMatch(setup, /先找一批机会|previewCommentAcquisition|不会先发消息/);
  assert.match(setup, /从评论、直播和账号互动里，帮你找出值得跟进的人/);
  assert.doesNotMatch(setup, /group:\s*"audience",\s*field:\s*"product"/);
  assert.doesNotMatch(setup, /补充说明（选填）|首次怎么联系/);
  assert.doesNotMatch(setup, /目标人群与意向信号|首次触达与私信接待规则/);
  assert.doesNotMatch(setup, /触达策略/);
  assert.doesNotMatch(setup, /flow\.step = "review"/);
});

test("comment acquisition setup is forward-looking without exposing a listener configuration", () => {
  const start = source.indexOf("function renderInboxSetup");
  const end = source.indexOf("function renderInboxStarting", start);
  assert.ok(start >= 0 && end > start);
  const setup = source.slice(start, end);
  assert.doesNotMatch(setup, /监听方式|持续监听新的作品评论、直播互动和账号互动通知，不回扫历史内容/);
  assert.doesNotMatch(setup, /看多久|最近\s*7\s*天|时间范围|workScope|lookback|historyWindow|timeWindow/);
  assert.doesNotMatch(setup, /什么时候联系|每天几点工作/);
});

test("comment acquisition verifies live Douyin authorization before changing to running", () => {
  const startStart = source.indexOf("async function startCommentAcquisition");
  const startEnd = source.indexOf("function applyCommentAcquisitionStatus", startStart);
  assert.ok(startStart >= 0 && startEnd > startStart);
  const start = source.slice(startStart, startEnd);
  const authProbe = source.indexOf("/v1/douyin/mcp/status?agentId=");
  const runningState = start.indexOf('flow.step = "running"');
  assert.ok(authProbe >= 0, "starting acquisition must probe current login state");
  assert.ok(start.indexOf("verifyAcquisitionAuthorization") >= 0, "start must call the live authorization probe");
  assert.ok(runningState >= 0, "the durable task should only become running after preflight");
  assert.match(start.slice(0, runningState), /verifyAcquisitionAuthorization/);
  assert.match(start, /flow\.accountIdentity = account\?\.identity \|\| flow\.accountIdentity/);
  assert.match(start, /flow\.accountWorkKey = douyinAccountWorkKey\(flow\.accountIdentity, flow\.accountId\)/);
  assert.match(start, /DOUYIN_LOGIN_REQUIRED/);
  assert.match(start, /请先完成抖音账号登录/);
  assert.match(start, /flow\.running = \["running", "degraded"\]\.includes\(flow\.taskState\)/);
});

test("comment acquisition retry derives its running state from the returned task state", () => {
  const start = source.indexOf("async function controlCommentAcquisitionTask");
  const end = source.indexOf("async function startPrivateOutreach", start);
  assert.ok(start >= 0 && end > start);
  const control = source.slice(start, end);
  assert.match(control, /flow\.running = \["running", "degraded"\]\.includes\(String\(flow\.taskState \|\| ""\)\.toLowerCase\(\)\)/);
  assert.doesNotMatch(control, /flow\.running = \["resume", "retry"\]\.includes\(action\)/);
});

test("inbox intake keeps the AI plan internal and starts directly from the saved reply settings", () => {
  const setupStart = source.indexOf("function renderInboxSetup");
  const setupEnd = source.indexOf("function renderInboxStarting", setupStart);
  const setup = source.slice(setupStart, setupEnd);
  const startStart = source.indexOf("async function startInboxIntake");
  const startEnd = source.indexOf("function applyInboxStatus");
  const start = source.slice(startStart, startEnd);

  assert.match(start, /flow\.accountIdentity = authorizedAccount\?\.identity \|\| flow\.accountIdentity/);
  assert.match(start, /flow\.accountWorkKey = douyinAccountWorkKey\(flow\.accountIdentity, flow\.accountId\)/);

  assert.match(setup, /1\. 登录你的抖音账号/);
  assert.match(setup, /2\. 告诉我怎么回复/);
  assert.match(setup, /3\. 开始托管/);
  assert.doesNotMatch(setup, /让每条私信都有人好好回复|先登录你的抖音账号，再告诉我平时怎么回复私信/);
  assert.match(setup, /openAccountReceptionPage/);
  assert.match(setup, /立即启动托管/);
  assert.match(setup, /添加账号/);
  assert.match(source, /generateInboxPlan/);
  assert.match(source, /\/v1\/douyin\/inbox-agent\/plan/);
  assert.match(source, /\/v1\/douyin\/inbox-agent\/plan", inboxConfiguration\(flow\), 30000/);
  assert.match(start, /generateInboxPlan\(agent, flow\)/);
  assert.doesNotMatch(setup, /预览回复方式|生成回复预览|sb-as-inbox-stepper|sb-as-inbox-hero/);
  assert.doesNotMatch(source, /function renderInboxReview|function renderLegacyInboxSetup|function renderInboxPlanning/);
  assert.match(start, /\.\.\.inboxConfiguration\(flow\)/);
  assert.match(start, /startPolling:\s*true/);
  assert.match(start, /planToken:\s*flow\.planToken/);
  assert.match(start, /startRequestId:\s*flow\.startRequestId/);
  assert.match(start, /executeCoreAgent\(\{/);
  assert.match(start, /operation:\s*"inbox_hosting"/);
  assert.match(start, /inboxStartState\(result\)/);
  assert.doesNotMatch(start, /autoReply:\s*flow\.replyMode/);
  assert.doesNotMatch(start, /knowledgeContext:/);
  assert.doesNotMatch(source, /知识库 → 记忆/);
});

test("inbox intake keeps the setup visible until the backend accepts, then opens realtime work", () => {
  const startStart = source.indexOf("async function startInboxIntake");
  const startEnd = source.indexOf("function applyInboxStatus");
  const start = source.slice(startStart, startEnd);
  const renderUseStart = source.indexOf("function renderUse()");
  const renderUseEnd = source.indexOf("function startDouyinFinder", renderUseStart);
  const renderUse = source.slice(renderUseStart, renderUseEnd);
  const acceptedStart = source.indexOf("function markInboxStartAccepted");
  const acceptedEnd = source.indexOf("async function startCompleteAcquisitionAfterInbox", acceptedStart);
  const accepted = source.slice(acceptedStart, acceptedEnd);
  const acceptance = start.indexOf("markInboxStartAccepted");
  const beginWorkCall = start.indexOf("beginWork(");

  assert.ok(acceptance >= 0, "the strict start path must wait for backend acceptance");
  assert.ok(beginWorkCall === -1 || beginWorkCall > acceptance, "realtime work must not be created before backend acceptance");
  assert.doesNotMatch(start.slice(0, acceptance), /pushActivity\(|recordInboxResult\(|reportWorkError\(/);
  assert.doesNotMatch(start, /flow\.step = "starting"/);
  assert.doesNotMatch(renderUse, /renderInboxStarting\(panel, flow\)/);
  assert.match(renderUse, /if \(flow\.step === "starting" && inboxIntake\) flow\.step = "setup"/);
  assert.match(accepted, /openRealtimeWork\?\.\(\{[\s\S]*selectedAgentId: agentId,[\s\S]*taskId: flow\.taskId/);
});

test("inbox start publishes immediate feedback and exposes every preflight failure", () => {
  const setupStart = source.indexOf("function renderInboxSetup");
  const setupEnd = source.indexOf("function renderInboxStarting", setupStart);
  const setup = source.slice(setupStart, setupEnd);
  const planStart = source.indexOf("async function generateInboxPlan");
  const planEnd = source.indexOf("function renderInboxSetup", planStart);
  const plan = source.slice(planStart, planEnd);
  const startStart = source.indexOf("async function startInboxIntake");
  const startEnd = source.indexOf("function applyInboxStatus", startStart);
  const start = source.slice(startStart, startEnd);

  assert.match(setup, /flow\.setupError \|\| flow\.planError \|\| flow\.startError/);
  assert.match(setup, /Promise\.resolve\(startInboxIntake\(/);
  assert.match(setup, /flow\.startError = error\?\.message \|\| "启动获客任务失败，请稍后重试。"/);
  assert.match(plan, /flow\.planError = inboxPlanBlockingMessage\(flow\.inboxPlan\)/);
  assert.match(setup, /const blockingPlan = Boolean\(flow\.planError && flow\.inboxPlan && !flow\.planConfirmable\);/);
  assert.match(setup, /\|\| blockingPlan/);
  assert.match(plan, /flow\.starting = false;/);
  assert.doesNotMatch(plan, /flow\.step = "starting"/);

  const feedback = start.indexOf("flow.starting = true;");
  const authorization = start.indexOf("await verifyAcquisitionAuthorization");
  assert.ok(feedback >= 0 && authorization > feedback, "start feedback must render before the authorization probe");
  assert.match(start, /flow\.starting = false;\s*flow\.setupError = error\?\.message/);
});

test("complete acquisition keeps the current setup visible until its durable task is accepted", () => {
  const completeStart = source.indexOf("async function startCompleteAcquisitionAfterInbox");
  const completeEnd = source.indexOf("function markManagerAcquisitionStartFailed", completeStart);
  const complete = source.slice(completeStart, completeEnd);
  const start = source.indexOf("async function startCommentAcquisition");
  const end = source.indexOf("function applyCommentAcquisitionStatus", start);
  const acquisition = source.slice(start, end);

  assert.match(complete, /flow\.managerFullStartPending = true/);
  assert.match(complete, /flow\.starting = true/);
  assert.match(acquisition, /const retainSetupUntilAccepted = flow\.managerFullStartPending === true/);
  assert.match(acquisition, /flow\.step = retainSetupUntilAccepted \? "setup" : "running"/);
  const realtime = acquisition.indexOf("openRealtimeWork?.({");
  assert.ok(realtime > acquisition.indexOf("await executeCoreAgent({"));
  assert.match(acquisition.slice(0, realtime), /flow\.step = "running"/);
});

test("inbox intake keeps transient poll errors non-terminal while the backend runtime is still running", () => {
  const statusStart = source.indexOf("function applyInboxStatus");
  const statusEnd = source.indexOf("function pollInboxStatus");
  const statusFlow = source.slice(statusStart, statusEnd);
  const pollStart = statusEnd;
  const pollEnd = source.indexOf("async function stopInboxAgent");
  const pollFlow = source.slice(pollStart, pollEnd);

  assert.match(statusFlow, /runtimeHealthy/);
  assert.match(statusFlow, /runtimeError/);
  assert.match(statusFlow, /if \(runtimeError && !runtimeHealthy\)/);
  assert.doesNotMatch(pollFlow, /flow\.error = result\?\.runtime\?\.lastError/);
  assert.match(pollFlow, /承接任务不会因为一次状态读取超时而停止/);
});

test("inbox intake has no manual approval send controls", () => {
  const renderStart = source.indexOf("function renderInboxRunning");
  const renderEnd = source.indexOf("function privateOutreachUsesProspectBoundary", renderStart);
  const inboxRuntimeUi = source.slice(renderStart, renderEnd);
  assert.doesNotMatch(inboxRuntimeUi, /确认发送/);
  assert.doesNotMatch(source, /sendInboxDraft/);
  assert.doesNotMatch(source, /\/v1\/douyin\/inbox-agent\/drafts\/\$\{encodeURIComponent/);
  assert.match(inboxRuntimeUi, /需要人工接管的会话/);
});

test("fresh app launch defaults to Agent Square instead of the marketing landing", () => {
  assert.match(appSource, /initialPage === "marketing"/);
  assert.match(appSource, /initialPage === "landing"/);
  assert.match(appSource, /framework\?\.openAgentSquare\?\.\(\)/);
});

test("Agent Square keeps the recovered native page hidden until its custom surface is mounted", () => {
  assert.match(appSource, /const deferNativeRootReveal = \["agent-square", "agents"\]\.includes\(initialPage\)/);
  assert.match(appSource, /mountWordmark\(\{ deferEarlyGuard: deferNativeRootReveal \}\)/);
  assert.match(appSource, /agentSquareEntryReady\.finally\(\(\) => \{/);
  assert.match(appSource, /releaseWordmarkEarlyGuard\(\)/);
});

test("stale cloud startup exposes an explicit restart path", () => {
  assert.match(source, /DOUYIN_PROVISIONING_TIMEOUT/);
  assert.match(source, /DOUYIN_CLOUD_DISCONNECTED/);
  assert.match(source, /\/v1\/douyin\/mcp\/restart/);
  assert.match(source, /重启云电脑/);
});

test("cloud provisioning keeps supplier billing details out of the user flow", () => {
  assert.match(source, /DOUYIN_CLOUD_START_STUCK/);
  assert.match(source, /async function reauthorizeMcp/);
  assert.match(source, /\/v1\/douyin\/mcp\/reauthorize/);
  assert.match(source, /confirm:\s*"UNSUBSCRIBE"/);
  assert.match(source, /window\.confirm/);
  const provisioningStart = source.indexOf("async function startMcpAuthorization");
  const provisioningEnd = source.indexOf("async function reauthorizeMcp", provisioningStart);
  assert.ok(provisioningStart >= 0 && provisioningEnd > provisioningStart);
  const provisioning = source.slice(provisioningStart, provisioningEnd);
  assert.match(provisioning, /authorizationRequestBody\(agentId, flow\.authAccountId/);
  assert.doesNotMatch(provisioning, /billingPlan/);
});

test("cloud authorization keeps waiting beyond the estimated startup window", () => {
  assert.doesNotMatch(source, /AUTH_PROVISIONING_TIMEOUT_SECONDS\s*=\s*10\s*\*\s*60/);
  const start = source.indexOf("async function waitForDouyinAuthorization");
  const end = source.indexOf("function applyAuthorizedFlow");
  assert.ok(start >= 0 && end > start);
  const authorizationFlow = source.slice(start, end);
  assert.match(authorizationFlow, /timeoutMs\s*=\s*null/);
  assert.match(authorizationFlow, /Number\.POSITIVE_INFINITY/);
  assert.match(authorizationFlow, /shouldContinue/);
  assert.doesNotMatch(authorizationFlow, /timedOut:\s*true/);
});

test("cloud authorization invalidates stale attempts without using a wall-clock timeout", () => {
  assert.match(source, /authAttemptId/);
  assert.match(source, /flow\.authAttemptId === authAttemptId/);
  assert.match(source, /onCancelled:/);
});

test("restored cloud errors remain actionable in the setup flow", () => {
  assert.match(source, /status\?\.error\?\.code/);
  assert.match(source, /flow\.authErrorCode = status\.error\.code/);
});

test("authorization viewer stays bound to the selected Agent cloud", () => {
  assert.match(source, /const session = \{ \.\.\.started, \.\.\.login, agentId, .*pageUrl/);
  assert.match(source, /session,\s*refreshCloudView/);
});

test("cloud lifecycle updates stay in work history instead of Agent DMs", () => {
  const exitStart = source.indexOf("async function recordCloudExit");
  const exitEnd = source.indexOf("function openCloudExitPrompt", exitStart);
  const exitFlow = source.slice(exitStart, exitEnd);
  assert.match(exitFlow, /recordAgentActivity/);
  assert.doesNotMatch(exitFlow, /dm\.message\.send|gateway\.action/);
});

test("private outreach reports completion and errors to the same Agent work record", () => {
  assert.match(source, /pushActivity\(agentId,/);
  assert.match(source, /finishWork\(agentId, "私信发送结果"\)/);
  assert.match(source, /settlePrivateOutreachFailure/);
  assert.match(source, /reportWorkError\(agentId, "私信触达未完成：" \+ normalized\.message/);
  assert.match(source, /phase: receiptPending \? "awaiting_receipt"/);
  assert.match(source, /phase: receiptPending \? "等待平台回执"/);
  assert.match(source, /reportWorkError\(agentId, "私信触达未完成：没有目标收到平台成功回执"\)/);
});

test("private outreach forwards both recipient identity fields to prevent ambiguous targeting", () => {
  assert.match(source, /secId: target\.secId \|\| target\.secUid/);
  assert.match(source, /secUid: target\.secUid \|\| target\.secId/);
  const start = source.indexOf("async function startPrivateOutreach");
  const end = source.indexOf("async function startInboxIntake");
  const privateFlow = source.slice(start, end);
  assert.doesNotMatch(privateFlow, /nickname:\s*target\.nickname\s*\|\|\s*undefined/);
});

test("private outreach does not present workflow milestones as platform percentages", () => {
  const start = source.indexOf("async function startPrivateOutreach");
  const end = source.indexOf("async function startInboxIntake");
  const privateFlow = source.slice(start, end);
  assert.doesNotMatch(privateFlow, /flow\.progress\s*=\s*(8|34|58|82|100)/);
  assert.doesNotMatch(privateFlow, /progress:\s*flow\.progress/);
  assert.doesNotMatch(privateFlow, /progressMode:\s*"indeterminate"/);
  assert.match(privateFlow, /progressSource:\s*"none"/);
  assert.match(source, /真实平台回执/);
});

test("private outreach review keeps long values inside a focused confirmation layout", () => {
  assert.match(source, /sb-as-private-review/);
  assert.match(source, /grid-template-areas:"sender boundary" "target target" "message message"/);
  assert.match(source, /overflow-wrap:anywhere/);
  assert.match(source, /确认发送私信/);
});

test("private outreach only accepts result-center identities that satisfy the prospect boundary", () => {
  assert.match(source, /prefilledFromResult: saved\?\.prefilledFromResult === true/);
  assert.match(source, /function privateOutreachEntryIsAllowed/);
  assert.match(source, /isPrivateOutreachRecordCandidate\(record, privateOutreachMode\(flow\)\)/);
  assert.match(source, /contactabilityFor\(\{ sourceScope: scope \}\)\.allowed/);
  assert.match(source, /privateOutreachMatchesSender\(flow, entry\)/);
  assert.match(source, /请先从成果中心选择当前账号下的待确认触达潜客/);
});

test("batch private outreach has no external-account entry and returns to the prospect center for recipients", () => {
  const setupStart = source.indexOf("function renderPrivateOutreachSetup");
  const setupEnd = source.indexOf("function renderPrivateOutreachReview", setupStart);
  const setup = source.slice(setupStart, setupEnd);
  const start = source.indexOf("async function startPrivateOutreach");
  const end = source.indexOf("async function startInboxIntake", start);
  const privateFlow = source.slice(start, end);

  assert.match(setup, /去成果中心选择/);
  assert.match(setup, /openProspectSelectionForOutreach/);
  assert.match(setup, /这个账号自己找到/);
  assert.doesNotMatch(setup, /粘贴账号主页|上传名单|readPrivateOutreachFile|mergePrivateOutreachUrls/);
  assert.match(privateFlow, /只能触达当前账号通过评论、直播或互动任务找到的待确认触达潜客/);
  assert.match(privateFlow, /只能触达当前账号找到且尚未触达的用户/);
  assert.match(privateFlow, /privateOutreachEntryIsAllowed/);
});

test("private outreach realtime navigation is scoped to the created task and sender account", () => {
  assert.match(source, /openRealtimeWork\?\.\(\{ selectedAgentId: agentId, taskId: flow\.taskId, accountId: flow\.accountId \|\| null, accountKey: flow\.accountWorkKey \|\| null \}\)/);
  assert.match(source, /accountId: flow\.accountId \|\| null/);
  assert.match(source, /accountKey: flow\.accountWorkKey \|\| null/);
});

test("private outreach preserves and visibly applies the selected sender account", () => {
  assert.match(source, /const requestedAccountId = state\.useFlow\.accountId/);
  assert.match(source, /const matchedAccount = accounts\.find\(\(account\) => account\.id === requestedAccountId\)/);
  assert.match(source, /account\.value = flow\.accountId \|\| accounts\[0\]\?\.id/);
  const start = source.indexOf("function renderPrivateOutreachSetup");
  const end = source.indexOf("function renderPrivateOutreachReview");
  assert.ok(start >= 0 && end > start);
  assert.match(source.slice(start, end), /acquisitionAccountControl\(flow, \(\) => render\(\)\)/);
  const accountStart = source.indexOf("function acquisitionAccountControl");
  const accountEnd = source.indexOf("function renderAccountAnalysisSetup", accountStart);
  assert.match(source.slice(accountStart, accountEnd), /flow\.accountId = selected\?\.id/);
  assert.match(source.slice(accountStart, accountEnd), /flow\.accountIdentity = selected\?\.identity \|\| null/);
  assert.match(source.slice(start, end), /render\(\);/);
});

test("authorized account discovery persists the account identity for strategy management", () => {
  const start = source.indexOf("const loadAuthorizedAccounts = async () =>");
  const end = source.indexOf("if (inboxIntake || isPrivateOutreachAgent(agent)", start);
  assert.ok(start >= 0 && end > start);
  const discovery = source.slice(start, end);
  assert.match(discovery, /persistCloudTask\(state\.useFlow, \{[\s\S]*accountId: state\.useFlow\.accountId/);
  assert.match(discovery, /accountIdentity: state\.useFlow\.accountIdentity/);
});

test("private outreach does not let queued status probes abort the real send", () => {
  const actionMarker = source.indexOf('cloudWatch: "action_in_flight"');
  const sendMarker = source.indexOf("await executeCoreAgent({", actionMarker);
  assert.ok(actionMarker >= 0, "send phase should expose an in-flight action state");
  assert.ok(sendMarker > actionMarker, "the core execution request should start after the in-flight state is rendered");
  assert.doesNotMatch(source, /createDouyinCloudWatch/);
  const start = source.indexOf("async function startPrivateOutreach");
  const end = source.indexOf("async function startInboxIntake", start);
  const privateFlow = source.slice(start, end);
  assert.match(privateFlow, /agentId: "mkt-cold-writer"/);
  assert.match(privateFlow, /lead:\s*\{\s*sourceRecordId\s*\}/);
});

test("private outreach does not start a competing status poll before the provider action", () => {
  const start = source.indexOf("async function startPrivateOutreach");
  const end = source.indexOf("async function startInboxIntake");
  const privateFlow = source.slice(start, end);
  assert.doesNotMatch(privateFlow, /createDouyinCloudWatch/);
});

test("private outreach treats a slow authorization status as waiting instead of offline", () => {
  const start = source.indexOf("async function waitForDouyinAuthorization");
  const end = source.indexOf("function applyAuthorizedFlow");
  const authorizationFlow = source.slice(start, end);
  assert.match(authorizationFlow, /DOUYIN_MCP_TIMEOUT/);
  assert.match(authorizationFlow, /CONTROL_PLANE_TIMEOUT/);
  assert.match(authorizationFlow, /onPending\?\./);
});

test("private outreach preserves unknown transport outcomes instead of inviting an immediate resend", () => {
  assert.match(source, /details\?\.outcome === "unknown"/);
  assert.match(source, /发送结果未知/);
});

test("private outreach keeps unknown receipts pending instead of failing the Agent work", () => {
  const start = source.indexOf("async function startPrivateOutreach");
  const end = source.indexOf("async function startInboxIntake");
  const privateFlow = source.slice(start, end);
  assert.match(privateFlow, /unknownCount\s*>\s*0/);
  assert.match(privateFlow, /PRIVATE_OUTREACH_RECEIPT_PENDING/);
  assert.match(privateFlow, /等待平台回执/);
  assert.doesNotMatch(privateFlow, /if \(sentCount === 0\) reportWorkError\(agentId, "私信触达未完成：没有目标收到平台成功回执"\)/);
});

test("private outreach keeps outer no-receipt errors pending", () => {
  const start = source.indexOf("const settlePrivateOutreachFailure = (error) => {");
  const end = source.indexOf("beginWork(agentId", start);
  assert.ok(start >= 0 && end > start);
  const settle = source.slice(start, end);
  assert.match(settle, /privateOutreachHasNoReceipt\(error\)/);
  assert.match(settle, /phase: "awaiting_receipt"/);
  assert.match(settle, /cloudWatch: "waiting_receipt"/);
  const pendingBranchEnd = settle.indexOf("const normalized =", settle.indexOf("if (receiptPending)"));
  assert.ok(pendingBranchEnd > 0);
  assert.doesNotMatch(settle.slice(0, pendingBranchEnd), /reportWorkError\(/);
});

test("private outreach distinguishes provider pending receipts from successful sends", () => {
  assert.match(source, /function privateOutreachReceiptState\(result\)/);
  assert.match(source, /receiptState === "pending"/);
  assert.match(source, /entry\.status = "unknown"/);
  assert.match(source, /平台已接收发送动作，等待最终回执/);
  assert.match(source, /return "sent"/);
  assert.match(source, /entry\.status = "sent"/);
});

test("private outreach treats a provider no-receipt message as pending even when state is failed", () => {
  const start = source.indexOf("function privateOutreachReceiptState");
  const end = source.indexOf("const CSS = `", start);
  assert.ok(start >= 0 && end > start);
  const classifier = source.slice(start, end);
  assert.match(classifier, /privateOutreachHasNoReceipt/);
  assert.match(classifier, /if \(privateOutreachHasNoReceipt\(result\)\) return "pending"/);

  const flowStart = source.indexOf("async function startPrivateOutreach");
  const flowEnd = source.indexOf("async function startInboxIntake", flowStart);
  assert.ok(flowStart >= 0 && flowEnd > flowStart);
  const privateFlow = source.slice(flowStart, flowEnd);
  assert.match(privateFlow, /const noReceipt = privateOutreachHasNoReceipt\(error\)/);
  assert.match(privateFlow, /noReceipt \|\| unknown/);
});

test("private outreach keeps the final workflow milestone open while receipts are pending", () => {
  const start = source.indexOf("async function startPrivateOutreach");
  const end = source.indexOf("async function startInboxIntake");
  const privateFlow = source.slice(start, end);
  assert.match(privateFlow, /flow\.checks\[3\] = !receiptPending/);
});

test("private outreach starts a fresh provider request after a prior attempt", () => {
  const start = source.indexOf("async function startPrivateOutreach");
  const end = source.indexOf("async function startInboxIntake");
  const privateFlow = source.slice(start, end);
  assert.match(privateFlow, /flow\.taskId = newTaskId\("private-outreach"\)/);
  assert.doesNotMatch(privateFlow, /flow\.taskId \|\|= newTaskId\("private-outreach"\)/);
});

test("private outreach reserves the sender account for the complete batch", () => {
  const start = source.indexOf("async function startPrivateOutreach");
  const end = source.indexOf("async function startInboxIntake");
  const privateFlow = source.slice(start, end);
  const reserve = privateFlow.indexOf('"/v1/douyin/mcp/outreach-priority/start"');
  const send = privateFlow.indexOf("await executeCoreAgent({");
  const release = privateFlow.indexOf('"/v1/douyin/mcp/outreach-priority/finish"');

  assert.ok(reserve >= 0 && reserve < send);
  assert.ok(release > send);
  assert.match(privateFlow, /accountId: flow\.accountId \|\| null/);
  assert.match(privateFlow, /taskId: flow\.taskId/);
  assert.match(privateFlow, /finally\s*\{/);
});

test("acquisition cards only expose the active comprehensive acquisition Agent", () => {
  assert.doesNotMatch(source, /commentPublicReply|公开回复/);
  assert.match(source, /getAcquisitionCardViewModel\(agent\)/);
  assert.match(source, /bindAcquisitionCardAction/);
  assert.match(source, /mkt-comment-acquisition/);
  assert.doesNotMatch(source, /CAPABILITY_BY_AGENT_ID[\s\S]*mkt-live-lead-miner/);
  assert.match(source, /isMarketplaceAgentAvailable\(agent\)/);
});

test("live entry stays blocked until its dedicated channel passes a real readiness probe", () => {
  assert.deepEqual(getAcquisitionCapabilityReadiness("liveAcquisition", { state: "passed", executorReady: false }), { visible: true, hireable: false, startable: false });
  assert.deepEqual(getAcquisitionCapabilityReadiness("liveAcquisition", { state: "passed", executorReady: true }), { visible: true, hireable: true, startable: true });
  assert.deepEqual(getAcquisitionCapabilityReadiness("commentAcquisition"), { visible: true, hireable: true, startable: true });
  assert.deepEqual(getAcquisitionCardAction("liveAcquisition", { state: "passed", executorReady: false }), { visible: true, hireable: false, startable: false, action: "blocked", label: "暂未开通" });
  assert.deepEqual(getAcquisitionCardAction("liveAcquisition", { state: "passed", executorReady: true }), { visible: true, hireable: true, startable: true, action: "open", label: "立即使用" });
  assert.deepEqual(getAcquisitionCardAction("commentAcquisition", { state: "passed", executorReady: false }), { visible: true, hireable: true, startable: true, action: "open", label: "立即使用" });
});

test("active acquisition Agent exposes the only comment-discovery launch control", () => {
  assert.deepEqual(getAcquisitionCardViewModel({ id: "mkt-comment-acquisition" }, { state: "passed", executorReady: false }), {
    agentId: "mkt-comment-acquisition",
    capability: "commentAcquisition",
    visible: true,
    hireable: true,
    startable: true,
    action: "open",
    label: "立即使用"
  });
  assert.equal(getAcquisitionCardViewModel({ id: "mkt-comment-acquisition" }, { state: "passed", executorReady: true }).startable, true);
  assert.equal(getAcquisitionCardViewModel({ id: "mkt-comment-acquisition" }, { state: "passed", executorReady: true }).action, "open");
});

test("unknown acquisition identifiers never bind an interactive launch action", () => {
  function mockButton() {
    const listeners = new Map();
    return {
      disabled: false,
      textContent: "",
      attributes: {},
      classList: { values: new Set(), toggle(name, enabled) { if (enabled) this.values.add(name); else this.values.delete(name); } },
      setAttribute(name, value) { this.attributes[name] = value; },
      addEventListener(name, listener) { listeners.set(name, listener); },
      dispatchEvent(event) { listeners.get(event.type)?.(event); }
    };
  }

  const blockedButton = mockButton();
  let blockedClicks = 0;
  const blocked = bindAcquisitionCardAction(blockedButton, "unknown-agent", { state: "passed", executorReady: false }, () => { blockedClicks += 1; });
  blockedButton.dispatchEvent({ type: "click" });
  assert.equal(blocked, null);
  assert.equal(blockedButton.disabled, false);
  assert.equal(blockedButton.attributes["aria-disabled"], undefined);
  assert.equal(blockedButton.classList.values.has("sb-disabled"), false);
  assert.equal(blockedClicks, 0);

  const readyButton = mockButton();
  let opened = null;
  const ready = bindAcquisitionCardAction(readyButton, "unknown-agent", { state: "passed", executorReady: true }, (_event, model) => { opened = model; });
  readyButton.dispatchEvent({ type: "click" });
  assert.equal(ready, null);
  assert.equal(readyButton.disabled, false);
  assert.equal(opened, null);
});

test("retired live discovery cannot be opened through a stale use-flow route", () => {
  const start = source.indexOf("function openUseFlow");
  const end = source.indexOf("function clearAuthFeedback", start);
  assert.ok(start >= 0 && end > start);
  const useFlow = source.slice(start, end);
  assert.match(useFlow, /if \(!agent \|\| !isFirstReleaseAgent\(agent\)\)/);
});

test("agent square wires acquisition buttons through the gate adapter", () => {
  assert.match(source, /bindAcquisitionCardAction\(btn, agent, undefined, handleClick, \{\s*label: hired \? "立即使用" : "雇佣"\s*\}\)/);
  assert.match(source, /btn\.textContent = enabled \? \(hired \? "立即使用" : "雇佣"\) : "暂未开放"/);
  assert.match(source, /if \(getAcquisitionCardViewModel\(agent\)\) \{/);
});

test("Agent Square makes employment request failures visible", () => {
  const homeStart = source.indexOf("function renderHome()");
  const homeEnd = source.indexOf("function render()", homeStart);
  const home = source.slice(homeStart, homeEnd);
  const hireStart = source.indexOf("function buildHireButton(agent)");
  const hireEnd = source.indexOf("function privateOutreachRecords", hireStart);
  const hire = source.slice(hireStart, hireEnd);

  assert.match(source, /employmentError: null/);
  assert.match(source, /\.sb-as-employment-error\{/);
  assert.match(home, /const error = el\("div", "sb-as-employment-error", state\.employmentError\);\s*error\.setAttribute\("role", "alert"\);\s*root\.appendChild\(error\)/);
  assert.match(hire, /state\.employmentError = null;\s*await employMarketplaceAgent/);
});

test("Agent Square defines the legacy comment-filter predicate used by its setup flow", () => {
  assert.match(source, /function isCommentFilterAgent\(agent\) \{\s*return agent\?\.id === "mkt-comment-filter";\s*\}/);
});

test("Agent startup uses one global busy-account guard and actionable dialog", () => {
  assert.match(source, /export function activeAgentSquareWorkForAccount\(/);
  assert.match(source, /async function guardAccountBusyBeforeStart\(agent, flow\)/);
  assert.match(source, /if \(await guardAccountBusyBeforeStart\(agent, flow\)\) return;/);
  assert.match(source, /function handleAccountBusyStartError\(agent, flow, error\)/);
  assert.match(source, /MANAGED_RUNTIME_ACCOUNT_IN_USE/);
  assert.match(source, /这个账号正在使用中/);
  assert.match(source, /无需重复启动/);
  assert.match(source, /查看运行中任务/);
  assert.match(source, /accountUseScope: retainSetupUntilAccepted \? `\$\{agentId\}:acquisition` : agentId/);
  assert.match(source, /accountUseScope: flow\.managerCombinedStart \? `\$\{flow\.agentId \|\| agent\.id\}:inbox`/);
});

test("Douyin finder setup is a consumer task entry instead of an API form", () => {
  const start = source.indexOf("function renderDouyinFinderSetup");
  const end = source.indexOf("function renderDouyinFinderRunning", start);
  assert.ok(start >= 0 && end > start);
  const finderFlow = source.slice(start, end);
  assert.match(finderFlow, /group: "finder", field: "finderGoal", filters: true/);
  assert.doesNotMatch(finderFlow, /filtersFirst/);
  assert.match(taskChoicesSource, /\["industry", "行业"/);
  assert.match(taskChoicesSource, /\["region", "地区"/);
  assert.match(taskChoicesSource, /\["followers", "粉丝要求"/);
  assert.doesNotMatch(finderFlow, /makeTaskSettings\("搜索设置"\)/);
  assert.match(finderFlow, /el\("button", "primary", "开始找人"\)/);
  assert.match(finderFlow, /startUse\(getMarketplaceAgent\(state\.useId\)\)/);
  assert.doesNotMatch(finderFlow, /生成执行方案|确认这次找人任务|当前 Agent Data API|sec_uid|验证方式|强制刷新接口数据|添加参考账号|粘贴账号主页|上传名单|这次找到的人，会按这次任务单独整理|同时查看是否正在直播|补充行业趋势和热词/);
  assert.doesNotMatch(finderFlow, /flow\.step = "review"/);
  assert.doesNotMatch(finderFlow, /!finderCombinedInputs\(flow\)/);
  assert.doesNotMatch(finderFlow, /请先添加至少一个参考账号或名单/);
});

test("all Agent task pages skip generic SaaS intro and step chrome", () => {
  const start = source.indexOf("function renderUse");
  const end = source.indexOf("function startUse", start);
  assert.ok(start >= 0 && end > start);
  const renderUse = source.slice(start, end);
  assert.match(renderUse, /const taskCompose = flow\.step === "setup" && isCommentAcquisitionAgent\(agent\)/);
  assert.match(renderUse, /wrap\.classList\.toggle\("is-task-compose", taskCompose\)/);
  assert.match(renderUse, /taskCompose \? "sb-as-use-panel sb-as-task-compose-panel"/);
  assert.doesNotMatch(renderUse, /sb-as-use-head|sb-as-use-intro|sb-as-use-steps/);
});

test("opening an Agent task resets the marketplace scroll position", () => {
  const start = source.indexOf("function openUseFlow");
  const end = source.indexOf("function clearAuthFeedback", start);
  assert.ok(start >= 0 && end > start);
  assert.match(source.slice(start, end), /page\.body\.scrollTop = 0/);
});

test("comment screening setup is task-first and starts without a redundant review", () => {
  const start = source.indexOf("function renderCommentLeadMinerSetup");
  const end = source.indexOf("function renderCommentLeadMinerReview", start);
  assert.ok(start >= 0 && end > start);
  const setup = source.slice(start, end);
  const composerStart = source.indexOf("function appendGoalFirstComposer");
  const composerEnd = source.indexOf("function renderGoldCustomerServiceSetup", composerStart);
  const composer = source.slice(composerStart, composerEnd);
  const sourceIndex = setup.indexOf('const sourceCard = el("section", "sb-as-lead-card")');
  const audienceIndex = setup.indexOf('mountTaskChoices(targetCard, { flow, group: filterMode ? "comments" : "audience", field: "product", initialText })');
  assert.ok(sourceIndex >= 0, "comment screening must render its source step");
  assert.ok(audienceIndex >= 0, "comment screening must render its audience step");
  assert.ok(sourceIndex < audienceIndex, "the source step must come before audience targeting");
  assert.match(setup, /看谁的内容？/);
  assert.match(setup, /const ownOnly = false;/);
  assert.match(setup, /if \(!ownOnly\) \{\s*addOwner\("own"/);
  assert.match(setup, /sourceCard\.appendChild\(acquisitionAccountControl\(flow/);
  assert.match(setup, /group: filterMode \? "comments" : "audience"/);
  assert.match(setup, /按什么范围看？/);
  assert.match(setup, /读取作品数量/);
  assert.match(setup, /filterMode \? "筛选这些评论" : owner === "other" \? "开始筛选" : "开始找客户"/);
  assert.match(setup, /validateLeadMinerSetup\(flow, \{ requireOwnAccount: ownOnly \}\)/);
  assert.match(setup, /startUse\(getMarketplaceAgent\(state\.useId\)\)/);
  assert.doesNotMatch(setup, /任务预览|Agent 会这样工作|生成执行方案|flow\.step = "review"/);
});

test("comment screening setup does not render internal explanation panels", () => {
  const start = source.indexOf("function renderCommentLeadMinerSetup");
  const end = source.indexOf("function renderCommentLeadMinerReview", start);
  assert.ok(start >= 0 && end > start);
  const setup = source.slice(start, end);
  assert.doesNotMatch(setup, /const hero = el\("div", "sb-as-lead-hero"\)/);
  assert.doesNotMatch(setup, /const side = el\("aside", "sb-as-lead-side"\)/);
  assert.doesNotMatch(setup, /这次任务|找出可跟进的客户/);
  assert.match(setup, /layout\.appendChild\(main\)/);
});

test("inbox setup reuses the account-scoped conversation strategy and stays consumer-facing", () => {
  const start = source.indexOf("function renderInboxSetup");
  const end = source.indexOf("function renderInboxStarting", start);
  assert.ok(start >= 0 && end > start);
  const setup = source.slice(start, end);
  assert.match(setup, /高级策略会保存在这个账号上，后续回复会直接使用/);
  assert.match(setup, /登录后会自动识别当前账号/);
  assert.match(setup, /登录抖音账号/);
  assert.match(setup, /立即启动托管/);
  assert.doesNotMatch(setup, /acquisitionAccountControl\(flow|makeTaskSettings\("回复设置"\)|group: "conversion"|预览回复方式/);
});

test("comment acquisition keeps the conversation objective in the same setup page", () => {
  const start = source.indexOf("function renderManagerInboxSetup");
  const end = source.indexOf("function renderInboxSetup", start);
  assert.ok(start >= 0 && end > start);
  const setup = source.slice(start, end);
  const composerStart = source.indexOf("function appendGoalFirstComposer");
  const composerEnd = source.indexOf("function renderGoldCustomerServiceSetup", composerStart);
  const composer = source.slice(composerStart, composerEnd);
  assert.match(setup, /我来帮你把获客做起来/);
  assert.doesNotMatch(setup, /el\("div", "sb-as-gold-eyebrow", "抖音获客管家"\)/);
  assert.match(setup, /我会自动完成/);
  assert.match(setup, /识别潜客/);
  assert.match(setup, /完成首触/);
  assert.match(setup, /持续承接/);
  assert.doesNotMatch(setup, /你想找什么样的人|补充说明（选填）|首次怎么联系/);
  assert.doesNotMatch(setup, /监听方式|持续监听新的作品评论、直播互动和账号互动通知，不回扫历史内容/);
  assert.match(composer, /你想让我帮你获得什么样的客户，并推进到哪一步/);
  assert.doesNotMatch(composer, /我希望通过私信达成/);
  assert.match(setup, /appendGoalFirstComposer\(shell, flow, "你想让我帮你获得什么样的客户，并推进到哪一步？"\)/);
  assert.doesNotMatch(setup, /appendGoalFirstComposer\(shell, flow, "你想让我先帮你达成什么？"\)/);
  assert.doesNotMatch(setup, /appendGoalFirstComposer\(shell, flow, "我希望抖音获客管家达成…"\)/);
  assert.match(setup, /const hasObjective = Boolean\(String\(flow\.replyObjective \|\| ""\)\.trim\(\)\)/);
  assert.match(setup, /start\.disabled = !hasAccount \|\| !hasObjective \|\| loading \|\| blockingPlan/);
  assert.doesNotMatch(composer, /对外身份|接待时段|业务资料|人工交接/);
  assert.doesNotMatch(source, /updatePreviewTaskStrategy|updatePreviewTaskTarget|fromPreview|previewCommentAcquisition/);
  assert.doesNotMatch(setup, /flow\.step = "review"/);
  assert.doesNotMatch(source, /renderCommentAcquisitionReview|确认并启动长期任务/);
  assert.doesNotMatch(setup, /配置接待方式（必填）/);
});

test("goal-first composer restores focus and caret after state rerender", () => {
  const composerStart = source.indexOf("function appendGoalFirstComposer");
  const composerEnd = source.indexOf("function renderGoldCustomerServiceSetup", composerStart);
  assert.ok(composerStart >= 0 && composerEnd > composerStart);
  const composer = source.slice(composerStart, composerEnd);
  assert.match(composer, /const selectionStart = objective\.selectionStart/);
  assert.match(composer, /const selectionEnd = objective\.selectionEnd/);
  assert.match(composer, /const nextObjective = root\.querySelector\('textarea\[aria-label="私信对话目标"\]'\)/);
  assert.match(composer, /nextObjective\.focus\(\)/);
  assert.match(composer, /nextObjective\.setSelectionRange\?/);
});

test("gold customer service setup speaks as the Agent", () => {
  const setupStart = source.indexOf("function renderGoldCustomerServiceSetup");
  const setupEnd = source.indexOf("function renderManagerInboxSetup", setupStart);
  assert.ok(setupStart >= 0 && setupEnd > setupStart);
  const setup = source.slice(setupStart, setupEnd);

  assert.doesNotMatch(setup, /sb-as-gold-eyebrow.*金牌客服/);
  assert.match(setup, /我来帮你接住私信/);
  assert.match(setup, /连接账号后，我会按你的目标接待新私信/);
  assert.match(setup, /appendGoalFirstComposer\(shell, flow, "你想让我帮你获得什么样的客户，并推进到哪一步？"\)/);
  assert.doesNotMatch(setup, /把私信交给金牌客服/);
  assert.doesNotMatch(setup, /告诉我希望通过私信达成什么/);
});

test("gold customer service running state exposes account-scoped conversation tuning", () => {
  const start = source.indexOf("function renderInboxRunning");
  const end = source.indexOf("function specialistFirstText", start);
  assert.ok(start >= 0 && end > start);
  const running = source.slice(start, end);
  assert.match(running, /调整承接目标/);
  assert.match(running, /onChat\?\.\(\{[\s\S]*agentId: flow\.agentId[\s\S]*accountId: flow\.accountId \|\| null/);
  assert.match(running, /taskId: flow\.taskId \|\| null/);
  assert.match(running, /taskRunId: flow\.taskRunId \|\| null/);
});

test("viral work analysis setup speaks as the Agent before asking for a link", () => {
  const setupStart = source.indexOf("function renderViralWorkAnalysisSetup");
  const setupEnd = source.indexOf("function renderViralWorkAnalysisRunning", setupStart);
  assert.ok(setupStart >= 0 && setupEnd > setupStart);
  const setup = source.slice(setupStart, setupEnd);

  assert.doesNotMatch(setup, /sb-as-gold-eyebrow.*爆款作品分析/);
  assert.match(setup, /我来帮你拆解这条爆款作品/);
  assert.match(setup, /把作品链接发给我，我会先真正理解视频内容/);
  assert.match(setup, /把你想研究的作品发给我/);
  assert.match(setup, /sb-as-viral-primary/);
  assert.match(setup, /把抖音作品链接粘贴给我/);
  assert.match(setup, /这是公开作品，我会直接解析视频本身和可见评论/);
  assert.match(setup, /sb-as-viral-focus-head/);
  assert.match(setup, /你想让我重点拆解什么？（可选）/);
  assert.match(setup, /不填也可以，我会自己判断重点/);
  assert.match(setup, /你也可以直接选一个重点/);
  assert.match(setup, /我会区分视频事实、数据事实、流量机制判断和下一轮创作测试/);
  assert.doesNotMatch(setup, /把一条爆款作品拆开看/);
  assert.doesNotMatch(setup, /先给我一条公开作品/);
  assert.doesNotMatch(setup, /这次更想看什么（可选）/);
  assert.doesNotMatch(setup, /也可以直接选择/);
});

test("viral work analysis closes the loop with realtime work and a result snapshot", () => {
  const runningStart = source.indexOf("function renderViralWorkAnalysisRunning");
  const runningEnd = source.indexOf("async function startViralWorkAnalysis", runningStart);
  assert.ok(runningStart >= 0 && runningEnd > runningStart);
  const running = source.slice(runningStart, runningEnd);
  assert.match(running, /const realtimeButton = el\("button", null, "查看实时工作"\)/);
  assert.match(running, /selectedAgentId: flow\.agentId/);
  assert.match(running, /taskRunId: flow\.taskRunId \|\| null/);

  const startEnd = source.indexOf("function finderAccountLabel", runningEnd);
  assert.ok(startEnd > runningEnd);
  const start = source.slice(runningEnd, startEnd);
  assert.match(start, /openRealtimeWork\?\.\(\{[\s\S]*selectedAgentId: agent\.id[\s\S]*taskRunId: flow\.taskRunId/);
  assert.match(start, /sourceUrl: flow\.workUrl/);
  assert.match(start, /goal: flow\.viralWorkGoal/);
  assert.match(start, /const realtimeSnapshot = \{ \.\.\.flow\.viralWorkAnalysis \}/);
  assert.match(start, /resultSnapshot: realtimeSnapshot/);
  assert.match(source, /syncViralFlowFromRemote/);
  assert.match(source, /officeStatusWorksToRealtimeWorks\(result\?\.taskWorks \|\| state\.remoteOfficeSnapshot\)/);
});

test("comment acquisition task brief has dedicated responsive consumer styling", () => {
  assert.match(source, /\.sb-as-morgan-task\{/);
  assert.match(source, /\.sb-as-morgan-account\{/);
  assert.match(source, /\.sb-as-morgan-prompt textarea\{/);
  assert.match(source, /\.sb-as-morgan-start-note\{/);
  assert.match(source, /@media\(max-width:640px\)\{[^}]*\.sb-as-morgan-account-row/);
  assert.doesNotMatch(source, /\.sb-as-preview-list\{|\.sb-as-preview-item\{/);
});

test("Douyin finder shows optional refinements after the people choice and keeps the goal as the start gate", () => {
  const start = source.indexOf("function renderDouyinFinderSetup");
  const end = source.indexOf("function renderDouyinFinderRunning", start);
  assert.ok(start >= 0 && end > start);
  const finderSetup = source.slice(start, end);
  assert.doesNotMatch(finderSetup, /filtersFirst/);
  assert.match(taskChoicesSource, /先选一个方向，再补充行业、地区和账号规模。/);
  assert.match(taskChoicesSource, /filterSection\.hidden = !selectedOption/);
  assert.equal(taskChoicesSource.includes("section.insertBefore(filterSection, grid)"), false);
  assert.match(finderSetup, /finderChoices\.industry/);
  assert.match(finderSetup, /next\.disabled = !flow\.finderGoal\.trim\(\)/);
  assert.match(finderSetup, /if \(!flow\.finderGoal\.trim\(\)\)/);
  assert.doesNotMatch(finderSetup, /!flow\.finderGoal\.trim\(\) && !flow\.finderIndustry\.trim\(\)/);
  assert.doesNotMatch(finderSetup, /添加参考账号|这次找到的人，会按这次任务单独整理|同时查看是否正在直播|补充行业趋势和热词/);
});

test("Douyin finder starts from the goal even when no reference account is supplied", () => {
  const start = source.indexOf("async function startDouyinFinder");
  const end = source.indexOf("async function startCommentAcquisition", start);
  assert.ok(start >= 0 && end > start);
  const finderStart = source.slice(start, end);
  assert.doesNotMatch(finderStart, /if \(flow\.finderMode !== "industry" && !inputs\)/);
  assert.doesNotMatch(finderStart, /请先添加至少一个参考账号或名单/);
  assert.match(finderStart, /goal: flow\.finderGoal/);
  assert.match(finderStart, /const compositePublicFinder = isCompositeFinderAgent\(agent\) && flow\.compositeFinderSource === "public";/);
  assert.match(finderStart, /const inputs = isDouyinFinderAgent\(agent\) \|\| compositePublicFinder \? "" : finderCombinedInputs\(flow\);/);
  assert.match(finderStart, /const accountContext = compositePublicFinder \? flow\.finderAccountContext : null;/);
  assert.match(finderStart, /accountContext: accountContext \|\| undefined/);
  assert.doesNotMatch(finderStart, /结合参考账号提高筛选精准度/);
});

test("Douyin finder blocks unbounded scopes while leaving search depth as an internal default", () => {
  assert.match(source, /function douyinFinderScopeError\(flow\)/);
  assert.match(source, /不能承诺覆盖全行业或所有用户/);
  const setupStart = source.indexOf("function renderDouyinFinderSetup");
  const setupEnd = source.indexOf("function renderDouyinFinderRunning", setupStart);
  const setup = source.slice(setupStart, setupEnd);
  assert.match(setup, /const scopeError = douyinFinderScopeError\(flow\);/);
  assert.match(setup, /if \(scopeError\)/);
  assert.ok(setup.indexOf("douyinFinderScopeError(flow)") < setup.indexOf("if (!flow.finderGoal.trim())"));
  assert.doesNotMatch(setup, /希望返回多少个账号|深入了解|参考近期作品|只看这个日期之后/);
});

test("Douyin finder polls the stored run instead of holding one long HTTP request", () => {
  const start = source.indexOf("async function startDouyinFinder");
  const end = source.indexOf("async function startCommentAcquisition", start);
  assert.ok(start >= 0 && end > start);
  const finderStart = source.slice(start, end);
  assert.match(finderStart, /\/v1\/connectors\/douyin-finder\/runs\//);
  assert.match(finderStart, /result\.status === "RUNNING"/);
  assert.match(finderStart, /await waitForDouyinFinderResult/);
});

test("Douyin finder opens the unified realtime work page for the accepted task", () => {
  const start = source.indexOf("async function startDouyinFinder");
  const end = source.indexOf("async function startCommentAcquisition", start);
  assert.ok(start >= 0 && end > start);
  const finderStart = source.slice(start, end);
  assert.match(finderStart, /openRealtimeWork\?\.\(\{\s*selectedAgentId: agent\.id,\s*taskId: flow\.taskId,\s*taskRunId: flow\.taskRunId\s*\}\)/);
});

test("Douyin finder running state uses provider counts instead of simulated percentages", () => {
  const start = source.indexOf("function renderDouyinFinderRunning");
  const end = source.indexOf("function intentCandidateFromRecord", start);
  assert.ok(start >= 0 && end > start);
  const running = source.slice(start, end);
  assert.match(running, /搜索候选/);
  assert.match(running, /深度核验/);
  assert.match(running, /符合目标/);
  assert.match(running, /已交付/);
  assert.match(running, /search_retrying/);
  assert.match(running, /if \(!running\)/);
  assert.match(running, /查看成果中心/);
  assert.doesNotMatch(running, /flow\.progress|候选种子|已发现候选/);
});

test("Douyin finder keeps result limits internal and uses truthful rerun actions", () => {
  const setupStart = source.indexOf("function renderDouyinFinderSetup");
  const runningStart = source.indexOf("function renderDouyinFinderRunning", setupStart);
  const startStart = source.indexOf("async function startDouyinFinder", runningStart);
  const startEnd = source.indexOf("async function startCommentAcquisition", startStart);
  const setup = source.slice(setupStart, runningStart);
  const running = source.slice(runningStart, source.indexOf("function intentCandidateFromRecord", runningStart));
  const start = source.slice(startStart, startEnd);
  assert.doesNotMatch(setup, /希望返回多少个账号|flow\.finderResultLimit/);
  assert.match(start, /resultLimit:\s*flow\.finderResultLimit/);
  assert.match(running, /调整条件再找/);
  assert.doesNotMatch(running, /继续找下一批/);
});

test("Douyin finder makes follower growth the primary metric for growth tasks", () => {
  const start = source.indexOf("function renderDouyinFinderRunning");
  const end = source.indexOf("function intentCandidateFromRecord", start);
  const running = source.slice(start, end);
  assert.match(running, /snapshot\.growthIntent/);
  assert.match(running, /近.*天涨粉/);
  assert.match(running, /匹配评分/);
});

test("Agent Center removes non-core Agents instead of rendering disabled cards", () => {
  const homeStart = source.indexOf("function renderHome()");
  const homeEnd = source.indexOf("\n  function render()", homeStart);
  assert.ok(homeStart >= 0 && homeEnd > homeStart);

  const homeSource = source.slice(homeStart, homeEnd);
  assert.doesNotMatch(homeSource, /includeUnavailable: true/);
  assert.match(homeSource, /includeUnavailable: false/);
  assert.match(homeSource, /const hiddenIds = new Set\(/);
  assert.match(homeSource, /DEFAULT_INSTALLED_MARKETPLACE_IDS/);
  assert.match(homeSource, /listHiredAgents\(\)\.map\(\(agent\) => agent\.id\)/);
  assert.match(homeSource, /\.filter\(isFirstReleaseAgent\)/);
  assert.doesNotMatch(homeSource, /暂未开放/);
});

test("Agent Center shows the Tiktok acquisition placeholder as unavailable", () => {
  assert.match(source, /const AGENT_SQUARE_PLACEHOLDER_AGENTS = Object\.freeze\(\[/);
  assert.match(source, /id: "mkt-tiktok-acquisition"/);
  assert.match(source, /displayName: "Tiktok获客管家"/);
  assert.match(source, /id: "mkt-live-room-control"/);
  assert.match(source, /displayName: "直播间场控"/);
  assert.match(source, /id: "mkt-live-returning-outreach"/);
  assert.match(source, /displayName: "直播间老客触达"/);
  assert.match(source, /function buildUnavailableButton\(label = "即将开放"\)/);
  assert.match(source, /const placeholderAgents = AGENT_SQUARE_PLACEHOLDER_AGENTS\.filter/);
  assert.match(source, /buildCard\(agent, \{ placeholder: isPlaceholder \}\)/);
  assert.match(source, /disabledReason: placeholder \? "即将开放"/);
});

test("Agent Center keeps each marketplace category in its own workflow section", () => {
  const homeStart = source.indexOf("function renderHome()");
  const homeEnd = source.indexOf("\n  function render()", homeStart);
  assert.ok(homeStart >= 0 && homeEnd > homeStart);
  const homeSource = source.slice(homeStart, homeEnd);

  assert.match(homeSource, /const category = workflowCategory\(agent\)/);
  assert.match(homeSource, /agentsByCategory\.get\(category\)\.push\(agent\)/);
  assert.match(homeSource, /sortMarketplaceAgentsForDisplay\(agentsByCategory\.get\(category\), \{ isReady: isFirstReleaseAgent \}\)/);
  assert.match(homeSource, /card\.dataset\.sbMarketCard = "true"/);
  assert.match(homeSource, /card\.dataset\.sbAgentId = agent\.id/);
  assert.doesNotMatch(homeSource, /filteredAgents|stageCount|refreshGrid/);
});

test("live danmaku analysis has a dedicated account-scoped setup with a danmaku-only scope", () => {
  assert.match(source, /function renderLiveDanmakuAnalysisSetup\(panel, flow\)/);
  const setupStart = source.indexOf("function renderLiveDanmakuAnalysisSetup");
  const setupEnd = source.indexOf("function renderLiveDanmakuAnalysisRunning", setupStart);
  assert.ok(setupStart >= 0 && setupEnd > setupStart);
  const setup = source.slice(setupStart, setupEnd);
  assert.match(source, /function appendLiveDanmakuGoalComposer\(container, flow\)/);
  assert.match(source, /直播间弹幕分析目标/);
  assert.match(setup, /直播弹幕/);
  assert.doesNotMatch(setup, /我只分析当前直播间的新弹幕/);
  assert.doesNotMatch(setup, /不会读取点赞、送礼、关注或进场/);
  assert.match(source, /本 Agent 会持续采集直播间弹幕/);
  assert.match(setup, /sb-as-live-shell/);
  assert.match(setup, /sb-as-gold-hero/);
  assert.match(source, /sb-as-gold-composer/);
  assert.match(source, /你也可以直接选一个重点/);
  assert.doesNotMatch(setup, /sb-as-live-scope/);
  assert.match(source, /flow\.liveDanmakuSignals = \[\.\.\.DEFAULT_LIVE_SIGNALS\]/);
  const setupBody = setup.slice(0, 2600);
  assert.doesNotMatch(setupBody, /signalOptions|读取哪些互动信号|checkbox\.type|sb-as-use-check/);
  assert.doesNotMatch(setupBody, /sb-as-use-fields|sb-as-use-field full/);
  assert.match(source, /buildLiveDanmakuAnalysisTaskPayload/);
  assert.match(source, /isLiveDanmakuAnalysisAgent\(agent\)\) renderLiveDanmakuAnalysisSetup\(panel, flow\)/);
  assert.match(source, /isLiveDanmakuAnalysisAgent\(agent\)\) renderLiveDanmakuAnalysisRunning\(panel, flow\)/);
});

test("live danmaku analysis speaks as an Agent throughout setup", () => {
  const setupStart = source.indexOf("function renderLiveDanmakuAnalysisSetup");
  const setupEnd = source.indexOf("function renderLiveDanmakuAnalysisRunning", setupStart);
  assert.ok(setupStart >= 0 && setupEnd > setupStart);
  const setup = source.slice(setupStart, setupEnd);

  assert.doesNotMatch(setup, /sb-as-gold-eyebrow.*直播间弹幕分析/);
  assert.match(setup, /我来帮你看懂这场直播/);
  assert.match(setup, /连接账号后，我会持续读懂新弹幕/);
  assert.match(source, /这场直播，你想让我重点看什么？/);
  assert.doesNotMatch(source, /告诉我，这场直播最想看什么/);
  assert.match(source, /你也可以直接选一个重点/);
  assert.doesNotMatch(source, /也可以直接选择一个重点/);
  assert.doesNotMatch(setup, /我只分析当前直播间的新弹幕/);
  assert.doesNotMatch(source, /系统只分析：当前直播间的新弹幕/);
  assert.match(setup, /账号已连接，我可以开始分析/);
  assert.match(setup, /我会把分析结果保留在任务记录中/);
});

test("live danmaku reports use the completed livestream session as their result identity", () => {
  const recordStart = source.indexOf("function recordLiveDanmakuAnalysisResult");
  const recordEnd = source.indexOf("async function startLiveDanmakuOutreach", recordStart);
  assert.ok(recordStart >= 0 && recordEnd > recordStart);
  const recorder = source.slice(recordStart, recordEnd);

  assert.match(recorder, /const liveSessionId = String\(liveSession\.id/);
  assert.match(recorder, /const reportTaskId = `\$\{taskId\}:live-session:\$\{reportSessionKey\}`;/);
  assert.match(recorder, /id: `live-danmaku-report:\$\{taskId\}:\$\{reportSessionKey\}`/);
  assert.match(recorder, /activityKey: `live-danmaku-analysis-report:\$\{taskId\}:\$\{reportSessionKey\}`/);
  assert.match(recorder, /sourceTaskId: taskId,/);
  assert.match(recorder, /liveSessionId: reportResult\.liveSession\.id,/);
  assert.match(recorder, /return null;/);
});

test("live danmaku outreach has a dedicated no-analysis setup and durable running state", () => {
  assert.match(source, /buildLiveDanmakuOutreachTaskPayload/);
  assert.match(source, /validateLiveDanmakuOutreachSetup/);
  assert.match(source, /function isLiveDanmakuOutreachAgent\(agent\)/);
  assert.match(source, /function renderLiveDanmakuOutreachSetup\(panel, flow\)/);
  assert.match(source, /function renderLiveDanmakuOutreachRunning\(panel, flow\)/);
  assert.match(source, /isLiveDanmakuOutreachAgent\(agent\)\) renderLiveDanmakuOutreachSetup\(panel, flow\)/);
  assert.match(source, /isLiveDanmakuOutreachAgent\(agent\)\) renderLiveDanmakuOutreachRunning\(panel, flow\)/);
  assert.match(source, /if \(isLiveDanmakuOutreachAgent\(agent\)\) \{\s*void startLiveDanmakuOutreach\(agent, flow\);/);
  assert.match(source, /async function startLiveDanmakuOutreach\(agent, flow/);
  assert.match(source, /flow\.analysisKind = "live_danmaku_outreach"/);
  assert.match(source, /flow\.liveDanmakuSignals = \["danmaku"\]/);
  assert.match(source, /LIVE_DANMAKU_OUTREACH_SCOPE/);
  assert.match(source, /逐位完成首次触达/);
  assert.match(source, /LIVE_DANMAKU_OUTREACH_SCOPE/);
  assert.match(source, /同一用户只触达一次/);
  const setupStart = source.indexOf("function renderLiveDanmakuOutreachSetup");
  const setupEnd = source.indexOf("function renderLiveDanmakuOutreachRunning", setupStart);
  assert.ok(setupStart >= 0 && setupEnd > setupStart);
  const setup = source.slice(setupStart, setupEnd);
  assert.match(setup, /sb-as-live-outreach-shell/);
  assert.match(setup, /我会自动完成/);
  assert.match(setup, /根据你设定的触达目的/);
  assert.match(setup, /内容和策略由大模型自主决定/);
  assert.match(setup, /帮助你持续促进转化/);
  assert.match(setup, /直播间触达目的/);
  assert.match(setup, /自定义开场消息（可选）/);
  assert.doesNotMatch(setup, /每日最多触达/);
  assert.match(setup, /每条消息间隔/);
  assert.match(setup, /实际可用额度/);
  assert.match(setup, /直播间范围、触达渠道和风险转人工规则保持固定/);
  assert.doesNotMatch(setup, /sb-as-use-fields/);
  assert.doesNotMatch(setup, /配置电商直播间未成交客户触达/);
  assert.doesNotMatch(source, /isLiveDanmakuOutreachAgent\(agent\)[\s\S]{0,200}分析这些账号/);
});

test("抖音获客管家首次使用会先落正式雇佣合同，再进入配置", () => {
  const readyStart = source.indexOf("function isAgentReadyForUse(agent)");
  const readyEnd = source.indexOf("/** 能力标签", readyStart);
  assert.ok(readyStart >= 0 && readyEnd > readyStart);
  const ready = source.slice(readyStart, readyEnd);
  assert.match(ready, /return isHired\(agent\?\.id\);/);
  assert.doesNotMatch(ready, /acquisitionCard\?\.startable/);

  const hireStart = source.indexOf("function buildHireButton(agent)");
  const hireEnd = source.indexOf("function openEmploymentDialog", hireStart);
  assert.ok(hireStart >= 0 && hireEnd > hireStart);
  const hire = source.slice(hireStart, hireEnd);
  assert.match(hire, /if \(hired\) \{\s*openUseFlow\(agent\);\s*return;\s*\}/);
  assert.match(hire, /await employMarketplaceAgent\(agent\.id, \{[\s\S]*?\}\);\s*openUseFlow\(agent\);/);
});
