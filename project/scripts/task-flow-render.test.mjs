import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { el } from "../src/salebuddy/ui/pages.js";
import { mountTaskChoices, makeTaskSettings, TASK_CHOICES } from "../src/salebuddy/ui/task-choices.js";
import { mountPersonAvatar } from "../src/salebuddy/ui/person-avatar.js";
import { getMarketplaceAgent, isDouyinAcquisitionChildAgent } from "../src/salebuddy/agents/marketplace.js";
import { normalizeAnalysisAccounts, buildAccountAnalysisResumeFlow, ACCOUNT_ANALYSIS_LIMIT } from "../src/salebuddy/agents/account-analysis-contract.js";
import { COMMENT_ACQUISITION_DEFAULTS, validateLiveLeadSetup, validateCommentAcquisitionSetup } from "../src/salebuddy/ui/comment-acquisition-config.js";
import { validateLeadMinerSetup, normalizeRecentWorkCount, parseCommentSource, parseCommentSources, workScopeLabel } from "../src/salebuddy/ui/lead-scope.js";
import { validateUserResearchSetup } from "../src/salebuddy/ui/user-research.js";
import { normalizeReception, receptionGoalObjective, receptionResponseStyle, RECEPTION_ROLES, RECEPTION_GOALS } from "../src/salebuddy/agents/account-reception.js";
import { commentAcquisitionCapabilityState } from "../src/salebuddy/ui/comment-acquisition-results.js";
import { isDouyinProfileUrl, publicFinderNeedsBusinessAccount, validatePublicFinderBusinessAccount } from "../src/salebuddy/agents/public-finder-contract.js";

class Element {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.style = {}; this.attributes = {}; this.listeners = {}; this.value = ""; this.className = ""; }
  set textContent(value) { this.content = String(value); this.children = []; }
  get textContent() { return (this.content || "") + this.children.map(child => child.textContent).join(""); }
  get firstElementChild() { return this.children[0] || null; }
  get classList() { return { add: (...names) => { this.className += " " + names.join(" "); }, toggle: (name, enabled) => { const values = new Set(this.className.split(" ").filter(Boolean)); if (enabled) values.add(name); else values.delete(name); this.className = [...values].join(" "); } }; }
  append(...nodes) { nodes.forEach(node => this.appendChild(node)); }
  appendChild(node) { if (typeof node === "string") { const text = new Element("text"); text.textContent = node; node = text; } node.parentElement = this; this.children.push(node); return node; }
  insertBefore(node, referenceNode) {
    if (typeof node === "string") { const text = new Element("text"); text.textContent = node; node = text; }
    const index = this.children.indexOf(referenceNode);
    if (index < 0) return this.appendChild(node);
    node.parentElement = this;
    this.children.splice(index, 0, node);
    return node;
  }
  setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener(event, listener) { this.listeners[event] = listener; }
  trigger(type) { if (type === "click" && this.disabled) return; return this.listeners[type]?.({ target: this, preventDefault() {}, stopPropagation() {} }); }
  all() { return this.children.flatMap(child => [child, ...child.all()]); }
  querySelector(selector) {
    return this.all().find(node => selector === "[data-choice-start]" ? node.dataset.choiceStart != null : selector[0] === "." ? node.className.split(" ").includes(selector.slice(1)) : node.tagName === selector.toUpperCase()) || null;
  }
  focus() {}
}
const source = readFileSync(new URL("../src/salebuddy/ui/agent-square.js", import.meta.url), "utf8");
const names = ["taskPersonAvatar", "acquisitionAccountControl", "appendLabeledField", "douyinFinderScopeError", "isCompositeFinderAgent", "isFinderListenerFlow", "finderOwnDataSelections", "finderListenerSourceScope", "finderListenerSourceLabel", "isInboxAgent", "isInboxIntakeFlow", "selectedChoiceLabels", "publicFinderTargetText", "hasPublicFinderTarget", "publicFinderNeedsBusinessAccount", "publicFinderBusinessAccountError", "publicFinderCanStart", "syncPublicFinderAccountPresentation", "publicFinderReferenceUrls", "publicFinderAccountName", "resolvePublicFinderBusinessAccount", "renderPublicFinderBrief", "publicFinderFilterSummary", "renderPublicFinderFilters", "syncCompositeFinderFlow", "renderCompositeFinderSetup", "renderDouyinFinderSetup", "renderCommentLeadMinerSetup", "renderLiveLeadSetup", "renderCommentAcquisitionSetup", "renderCommentAcquisitionRunning", "renderUserResearchSetup", "renderAccountAnalysisSetup", "renderStandaloneUserAnalysisSetup", "leadRecipientId", "awaitingIntentAnalysis", "privateOutreachRecords", "privateOutreachEntryFromProspect", "prefillPrivateOutreachFromProspects", "prefillInboxFromTouchedProspects", "intentCandidateFromRecord", "finderEntriesForAnalysis", "intentCandidateFromFinderEntry", "latestFinderRunForAnalysis", "intentCandidatesFromStore", "renderIntentAnalystModeChooser", "renderIntentAnalystSetup", "renderIntentAnalystRunning", "startIntentAnalyst", "isAccountScopedAcquisitionSetup", "restoreAccountScopedAcquisitionDraft", "persistAccountSetupDraft", "renderInboxSetup", "renderPrivateOutreachSetup", "renderPrivateOutreachReview", "validateInboxSetup"];
names.push("receptionAccountId");
function extract(name) {
  const start = Math.max(source.indexOf(`  function ${name}(`), source.indexOf(`  async function ${name}(`));
  assert.ok(start >= 0, name);
  const rest = source.slice(start + 2);
  const next = rest.slice(1).search(/\n  (?:async )?function /);
  return next < 0 ? rest : rest.slice(0, next + 1);
}
function harness(t, id, { prospectStore = null } = {}) {
  const original = globalThis.document;
  const document = { createElement: tag => new Element(tag) };
  globalThis.document = document;
  t.after(() => { globalThis.document = original; });
  const calls = [];
  const identity = { secId: "owner", nickname: "我的账号", avatarUrl: "https://example.com/avatar.png" };
  const flow = {
    agentId: id, accountId: "account", account: "我的账号", accountIdentity: identity,
    authorizedAccounts: [{ id: "account", name: "我的账号", identity }], accountRef: "https://www.douyin.com/user/owner", accountResolveStatus: "ready",
    finderGoal: "", finderInputs: "", finderIndustry: "", finderMode: "full", finderSince: "", finderResultLimit: 10,
    product: "", requirements: "", audienceTypes: [], workScope: "最近30条作品", taskChoices: {},
    surveyUrl: "https://example.com/survey", analysisAccounts: [{ id: "person", nickname: "客户" }], analysisGoal: "", analysisUrls: "",
    replyRule: "只回答已知信息", replyObjective: "", replyTone: "自然简短", handoffRules: "投诉退款交给人工", businessKnowledge: "提供家居选购咨询", knowledgeEntries: [],
    targetInput: "", targetEntries: [{ secUid: "person", nickname: "客户", status: "ready" }], prefilledFromResult: true, message: "你好，方便聊聊需求吗？",
    reception: { revision: 1, settings: normalizeReception({ knowledge: "测试资料" }) }
  };
  const panel = new Element("div");
  const context = {
    document, window: { setTimeout }, structuredClone, el, mountTaskChoices, makeTaskSettings, TASK_CHOICES, mountPersonAvatar, getMarketplaceAgent, RECEPTION_ROLES, RECEPTION_GOALS, receptionGoalObjective, receptionResponseStyle,
    isDouyinProfileUrl, needsPublicFinderBusinessAccount: publicFinderNeedsBusinessAccount, validatePublicFinderBusinessAccount,
    loadAccountReception: async () => {},
    openAccountReceptionPage: ({ embeddedContainer }) => { embeddedContainer?.appendChild(new Element("div")); return { close() {} }; },
    normalizeAnalysisAccounts, buildAccountAnalysisResumeFlow, ACCOUNT_ANALYSIS_LIMIT,
    COMMENT_ACQUISITION_DEFAULTS, validateLiveLeadSetup, validateCommentAcquisitionSetup, validateLeadMinerSetup, normalizeRecentWorkCount, validateUserResearchSetup, parseCommentSource, parseCommentSources, workScopeLabel, commentAcquisitionCapabilityState,
    state: { useId: id }, root: panel, concreteAccountName: (...values) => values.find(Boolean),
    isCommentLeadMiner: agent => agent.id === "mkt-lead-miner", isCompositeFinderAgent: agent => agent?.id === "mkt-find-people", isCommentAcquisitionAgent: agent => agent?.id === "mkt-comment-acquisition", isCommentFilterAgent: agent => agent.id === "mkt-comment-filter", isDouyinAcquisitionChildAgent,
    authorizationAgentId: value => value?.executionAgentId || value?.agentId || "mkt-dm-inbox",
    usesManagerAccountBinding: value => isDouyinAcquisitionChildAgent(value?.agentId) && (value?.executionAgentId || value?.agentId) === "mkt-comment-acquisition",
    prospectStore: prospectStore || { get: () => null, list: () => [], listRuns: () => [] },
    getAcquisitionCapabilityReadiness: () => ({ startable: false }),
    contactabilityFor: () => ({ allowed: true }), isContactableRecord: () => true,
    privateOutreachUsesProspectBoundary: () => true,
    privateOutreachEntryIsAllowed: () => true,
    privateOutreachReadyEntries: value => value.targetEntries.filter(entry => entry.status === "ready"),
    privateOutreachSourceLabel: () => "本账号评论区找到的潜客",
    openProspectSelectionForOutreach: () => calls.push({ type: "open-prospects" }),
    startUse: () => {
      const { receptionEditor, ...snapshot } = flow;
      calls.push({ type: "start", flow: structuredClone(snapshot) });
    }, startMcpAuthorization: () => calls.push({ type: "authorize" }),
    startInboxIntake: () => {
      const { receptionEditor, ...snapshot } = flow;
      calls.push({ type: "start", flow: structuredClone(snapshot) });
    },
    generateInboxPlan: () => calls.push({ type: "plan", flow: structuredClone(flow) }),
    reauthorizeMcp() {}, scheduleLeadMinerAccountResolve() {}, saveInboxStrategy() {}, persistCloudTask: (_flow, patch) => calls.push({ type: "persist", patch }), invalidateInboxPlan() {}, render() {}, leaveUseFlow() {}, focusFirstInboxError() {},
    inboxStrategyStore: { get: () => ({}) }, resolvePrivateOutreachTargets() {}, buildCloudAuthorizationStatus: () => new Element("div")
  };
  const renderers = runInNewContext(names.map(extract).join("\n") + `\n({${names.join(",")}})`, context);
  return { panel, flow, calls, renderers };
}
test("single-work comment setup hides author scope and does not show stale account identity", t => {
  const { panel, flow, renderers } = harness(t, "mkt-lead-miner");
  flow.accountRef = "https://www.douyin.com/video/1234567890123456789";
  renderers.renderCommentLeadMinerSetup(panel, flow, getMarketplaceAgent("mkt-lead-miner"));
  assert.match(panel.textContent, /指定作品链接|支持视频和图文作品链接/);
  assert.doesNotMatch(panel.textContent, /看最近多少条作品/);
  assert.equal(panel.all().some(node => node.attributes["aria-label"] === "读取作品数量"), false);
});

test("comment lead miner only offers the authorized account while comment filtering keeps public analysis", t => {
  const leadMiner = harness(t, "mkt-lead-miner");
  leadMiner.renderers.renderCommentLeadMinerSetup(leadMiner.panel, leadMiner.flow, getMarketplaceAgent("mkt-lead-miner"));
  assert.match(leadMiner.panel.textContent, /连接你的抖音账号/);
  assert.doesNotMatch(leadMiner.panel.textContent, /读取我发布的作品评论/);
  assert.doesNotMatch(leadMiner.panel.textContent, /其他账号/);

  const filter = harness(t, "mkt-comment-filter");
  filter.renderers.renderCommentLeadMinerSetup(filter.panel, filter.flow, getMarketplaceAgent("mkt-comment-filter"));
  assert.match(filter.panel.textContent, /其他账号/);
});

test("finder refinements use expandable cards and keep the selected value in the goal", t => {
  const original = globalThis.document;
  const document = { createElement: tag => new Element(tag) };
  globalThis.document = document;
  t.after(() => { globalThis.document = original; });
  const flow = { finderGoal: "", taskChoices: {} };
  const panel = new Element("div");
  mountTaskChoices(panel, { flow, group: "finder", field: "finderGoal", filters: true, defaults: ["customers"] });
  const row = panel.all().find(node => node.className.includes("sb-task-filter-row"));
  assert.ok(row);
  const filters = row.children.filter(node => node.className.includes("sb-task-filter"));
  assert.equal(filters.length, 3);
  assert.ok(filters.every(node => node.tagName === "DETAILS"));
  const option = filters[0].all().find(node => node.tagName === "BUTTON" && node.textContent === "汽车服务");
  assert.ok(option);
  filters[0].open = true;
  option.trigger("click");
  assert.equal(flow.taskChoices.finder.industry, "汽车服务");
  assert.match(flow.finderGoal, /汽车服务/);
  assert.equal(filters[0].open, false);
});

test("finder renders industry, region, and follower requirements after the people choice", t => {
  const original = globalThis.document;
  const document = { createElement: tag => new Element(tag) };
  globalThis.document = document;
  t.after(() => { globalThis.document = original; });
  const panel = new Element("div");
  mountTaskChoices(panel, { flow: { finderGoal: "", taskChoices: {} }, group: "finder", field: "finderGoal", filters: true });
  const section = panel.children[0];
  const filterIndex = section.children.findIndex(node => node.className.includes("sb-task-filter-section"));
  const choiceIndex = section.children.findIndex(node => node.className.includes("sb-task-choice-grid"));
  assert.ok(filterIndex >= 0 && choiceIndex >= 0);
  assert.ok(choiceIndex < filterIndex);
});

const scenarios = [
  ["mkt-douyin-finder", "renderDouyinFinderSetup", "creators", "finderGoal"],
  ["mkt-lead-miner", "renderCommentLeadMinerSetup", "price", "product"],
  ["mkt-comment-filter", "renderCommentLeadMinerSetup", "complaints", "product"],
  ["mkt-live-lead-miner", "renderLiveLeadSetup", "purchase", "product"],
  ["mkt-comment-acquisition", "renderCommentAcquisitionSetup", "help", "product"],
  ["mkt-user-research", "renderUserResearchSetup", "consumers", "finderGoal"],
  ["mkt-research-expert", "renderAccountAnalysisSetup", "needs", "analysisGoal"],
];
for (const [id, renderer, preset, field] of scenarios) test(`${id} starts from a choice without typing a requirement`, t => {
  const { panel, flow, calls, renderers } = harness(t, id);
  renderers[renderer](panel, flow, getMarketplaceAgent(id));
  const input = panel.all().find(node => node.tagName === "INPUT" && node.value === preset);
  assert.ok(input, preset); input.checked = true; input.trigger("change");
  assert.ok(flow[field].length > 10);
  const buttons = panel.all().filter(node => node.tagName === "BUTTON" && node.className.includes("primary"));
  buttons.at(-1).trigger("click");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].type, id === "mkt-dm-inbox" ? "plan" : "start");
  assert.equal(calls[0].flow[field], flow[field]);
});

test("composite finder sends all own-account interactions to the analysis queue", t => {
  const setup = harness(t, "mkt-find-people");
  setup.renderers.renderCompositeFinderSetup(setup.panel, setup.flow);
  assert.match(setup.panel.textContent, /我的账号/);
  assert.match(setup.panel.textContent, /公域找人/);
  assert.equal(setup.panel.all().some(node => node.tagName === "TEXTAREA"), false);

  const next = setup.panel.all().find(node => node.tagName === "BUTTON" && node.textContent === "下一步");
  assert.equal(next.disabled, true);
  setup.panel.all().find(node => node.tagName === "BUTTON" && node.dataset.finderSource === "own").trigger("click");
  assert.equal(next.disabled, false);
  next.trigger("click");
  assert.equal(setup.flow.compositeFinderSource, "own");
  assert.equal(setup.flow.compositeFinderStep, "criteria");

  const criteria = new Element("div");
  setup.renderers.renderCompositeFinderSetup(criteria, setup.flow);
  const comments = criteria.all().find(node => node.tagName === "INPUT" && node.value === "comments");
  comments.checked = true;
  comments.trigger("change");
  assert.equal(setup.flow.sourceScope, "authorized_account_comments");
  assert.equal(setup.flow.analysisOnly, false);
  assert.match(setup.flow.finderGoal, /我的账号/);
  assert.doesNotMatch(criteria.textContent, /汇总说明/);
  const start = criteria.all().find(node => node.tagName === "BUTTON" && node.textContent === "开始汇总用户");
  assert.equal(start.disabled, false);
  start.trigger("click");
  assert.equal(setup.calls[0].type, "start");
  assert.equal(setup.calls[0].flow.sourceScope, "authorized_account_comments");
});

test("composite finder exposes public search before account collection and starts it as a finder run", t => {
  const setup = harness(t, "mkt-find-people");
  setup.renderers.renderCompositeFinderSetup(setup.panel, setup.flow);

  const sourceOptions = setup.panel.all().filter(node => node.tagName === "BUTTON" && node.dataset.finderSource);
  assert.deepEqual(sourceOptions.map(node => node.dataset.finderSource), ["own", "public"]);
  setup.panel.all().find(node => node.tagName === "BUTTON" && node.dataset.finderSource === "public").trigger("click");
  setup.panel.all().find(node => node.tagName === "BUTTON" && node.textContent === "下一步").trigger("click");
  assert.equal(setup.flow.compositeFinderSource, "public");
  assert.equal(setup.flow.compositeFinderStep, "criteria");

  const criteria = new Element("div");
  setup.renderers.renderCompositeFinderSetup(criteria, setup.flow);
  assert.match(criteria.textContent, /设置找人条件/);
  assert.match(criteria.textContent, /先选择找人目标/);
  const preset = criteria.all().find(node => node.tagName === "INPUT" && node.value === "creators");
  const goal = criteria.all().find(node => node.tagName === "TEXTAREA" && node.attributes["aria-label"] === "自定义找人目标（选填）");
  const business = criteria.all().find(node => node.tagName === "INPUT" && node.attributes["aria-label"] === "我的抖音账号主页链接");
  const references = criteria.all().find(node => node.tagName === "TEXTAREA" && node.attributes["aria-label"] === "参考账号主页链接");
  const resultLimit = criteria.all().find(node => node.tagName === "INPUT" && node.attributes["aria-label"] === "希望找到多少个账号");
  assert.ok(preset && goal && business && references && resultLimit);

  const start = criteria.all().find(node => node.tagName === "BUTTON" && node.textContent === "开始找人");
  assert.equal(start.disabled, true);
  preset.checked = true;
  preset.trigger("change");
  assert.equal(start.disabled, false);
  assert.equal(setup.flow.requirements, "适合合作的创作者");
  assert.match(setup.flow.finderGoal, /适合合作的创作者/);

  goal.value = "找上海近期稳定更新、适合家居内容联动的创作者";
  business.value = "https://www.douyin.com/user/my-brand";
  references.value = "https://www.douyin.com/user/creator-a\nhttps://www.douyin.com/user/creator-b";
  resultLimit.value = "2000";
  goal.trigger("input");
  business.trigger("input");
  references.trigger("input");
  resultLimit.trigger("input");

  const region = criteria.all().find(node => node.tagName === "SELECT" && node.attributes["aria-label"] === "地区筛选");
  assert.ok(region);
  region.value = "上海";
  region.trigger("change");

  assert.equal(start.disabled, false);
  assert.equal(setup.flow.finderResultLimit, 2000);
  assert.equal(resultLimit.max, undefined);
  assert.doesNotMatch(criteria.textContent, /1-50 个/);
  assert.match(setup.flow.requirements, /适合合作的创作者/);
  assert.match(setup.flow.requirements, /找上海近期稳定更新/);
  assert.match(setup.flow.finderGoal, /地区：上海/);
  assert.deepEqual(structuredClone(setup.flow.finderAccountContext), {
    businessAccountUrl: "https://www.douyin.com/user/my-brand",
    referenceAccountUrls: ["https://www.douyin.com/user/creator-a", "https://www.douyin.com/user/creator-b"]
  });
  start.trigger("click");
  assert.equal(setup.calls[0].type, "start");
  assert.equal(setup.calls[0].flow.compositeFinderSource, "public");
  assert.equal(setup.calls[0].flow.analysisOnly, true);
});

test("composite finder opens and requires the business account for competitor discovery", t => {
  const setup = harness(t, "mkt-find-people");
  Object.assign(setup.flow, { compositeFinderSource: "public", compositeFinderStep: "criteria" });
  setup.renderers.renderCompositeFinderSetup(setup.panel, setup.flow);

  const competitor = setup.panel.all().find(node => node.tagName === "INPUT" && node.value === "industryAccounts");
  const business = setup.panel.all().find(node => node.tagName === "INPUT" && node.attributes["aria-label"] === "我的抖音账号主页链接");
  const context = setup.panel.all().find(node => node.className.split(" ").includes("sb-public-finder-context"));
  const start = setup.panel.all().find(node => node.tagName === "BUTTON" && node.textContent === "开始找人");
  assert.ok(competitor && business && context && start);
  assert.equal(start.disabled, true);

  competitor.checked = true;
  competitor.trigger("change");
  assert.equal(context.open, true);
  assert.match(context.textContent, /必填/);
  assert.equal(business.required, true);
  assert.equal(start.disabled, true);

  business.value = "https://www.douyin.com/user/my-brand";
  business.trigger("input");
  assert.equal(start.disabled, false);
  start.trigger("click");
  assert.equal(setup.calls[0].type, "start");
  assert.equal(setup.calls[0].flow.finderAccountContext.businessAccountUrl, "https://www.douyin.com/user/my-brand");
});

test("composite finder resumes a legacy collection-note step at the interaction scope", t => {
  const setup = harness(t, "mkt-find-people");
  Object.assign(setup.flow, {
    compositeFinderSource: "own",
    compositeFinderStep: "signals",
    taskChoices: { finderOwnData: { selected: ["comments"] } }
  });

  setup.renderers.renderCompositeFinderSetup(setup.panel, setup.flow);
  assert.equal(setup.flow.compositeFinderStep, "criteria");
  assert.equal(setup.panel.all().some(node => node.tagName === "TEXTAREA" && node.attributes["aria-label"] === "补充本次汇总说明（可选）"), false);
  assert.equal(setup.flow.product, "账号互动用户汇总");
  assert.equal(setup.flow.requirements, "");
  const launch = setup.panel.all().find(node => node.tagName === "BUTTON" && node.textContent === "开始汇总用户");
  assert.equal(launch.disabled, false);
  launch.trigger("click");
  assert.equal(setup.calls[0].type, "start");
  assert.equal(setup.calls[0].flow.requirements, "");
});

test("composite finder exposes live interactions as a first-party source", t => {
  const setup = harness(t, "mkt-find-people");
  setup.flow.compositeFinderSource = "own";
  setup.flow.compositeFinderStep = "criteria";
  setup.flow.accountId = "account-1";
  setup.flow.account = "门店账号";

  setup.renderers.renderCompositeFinderSetup(setup.panel, setup.flow);
  const live = setup.panel.all().find(node => node.tagName === "INPUT" && node.value === "live");
  assert.ok(live, "live source choice");
  live.checked = true;
  live.trigger("change");
  setup.panel.all().find(node => node.tagName === "BUTTON" && node.textContent === "开始汇总用户").trigger("click");

  assert.equal(setup.flow.sourceScope, "authorized_account_live");
  assert.equal(setup.flow.analysisOnly, false);
  assert.match(setup.flow.finderGoal, /直播间互动/);
});

test("composite finder can combine comments, live interactions, and account notifications", t => {
  const setup = harness(t, "mkt-find-people");
  Object.assign(setup.flow, {
    compositeFinderSource: "own",
    compositeFinderStep: "criteria",
    accountId: "account-1",
    account: "门店账号"
  });

  setup.renderers.renderCompositeFinderSetup(setup.panel, setup.flow);
  const sources = ["comments", "live", "interactions"].map(id => setup.panel.all().find(node => node.tagName === "INPUT" && node.value === id));
  assert.ok(sources.every(Boolean));
  assert.ok(sources.every(input => input.type === "checkbox"));
  for (const input of sources) {
    input.checked = true;
    input.trigger("change");
  }
  assert.deepEqual(setup.flow.taskChoices.finderOwnData.selected, ["comments", "live", "interactions"]);
  setup.panel.all().find(node => node.tagName === "BUTTON" && node.textContent === "开始汇总用户").trigger("click");

  assert.equal(setup.flow.sourceScope, "authorized_account_all_signals");
  assert.match(setup.flow.finderGoal, /作品评论、直播间互动、账号互动通知/);
  assert.equal(setup.flow.analysisOnly, false);
});

test("composite finder live runs remain discovery-only in the running workspace", t => {
  const setup = harness(t, "mkt-find-people");
  Object.assign(setup.flow, {
    sourceScope: "authorized_account_live",
    taskState: "running",
    taskSnapshot: {
      state: "running",
      health: "OK",
      config: { sourceScope: { kind: "authorized_account_live" } },
      counters: { scans: 1, candidates: 2, sent: 99 },
      lastScan: { sources: { live: { state: "receiving", count: 2 } }, counts: { candidates: 2 } }
    }
  });

  setup.renderers.renderCommentAcquisitionRunning(setup.panel, setup.flow);
  assert.match(setup.panel.textContent, /直播间新互动/);
  assert.match(setup.panel.textContent, /查看实时工作/);
  assert.doesNotMatch(setup.panel.textContent, /按规则自动发送私信|关闭自动获客|已触达/);
});

test("private messages start real outreach only after an explicit send confirmation", t => {
  const { panel, flow, calls, renderers } = harness(t, "mkt-cold-writer");
  renderers.renderPrivateOutreachSetup(panel, flow);
  panel.all().find(node => node.tagName === "BUTTON" && node.textContent === "确认发送给 1 人").trigger("click");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].type, "start");
  assert.equal(calls[0].flow.message, flow.message);
  assert.equal(calls[0].flow.targetEntries[0].secUid, "person");
});

test("activation specialist independently detects analyzed prospects waiting for first contact", t => {
  const store = {
    get: () => null,
    list: () => [{
      id: "prospect-1", name: "已分析潜客", status: "待确认触达", profileUrl: "https://www.douyin.com/user/prospect-1",
      source: { secUid: "sec-prospect-1", accountId: "account", accountName: "我的账号" },
      contactability: { allowed: true, sourceScope: "own_account_comments" }, evidence: [{ quote: "想了解价格" }]
    }],
    listRuns: () => []
  };
  const { panel, flow, renderers } = harness(t, "mkt-cold-writer", { prospectStore: store });
  flow.prefilledFromResult = false;
  flow.targetEntries = [];
  renderers.renderPrivateOutreachSetup(panel, flow);
  assert.equal(flow.targetEntries.length, 1);
  assert.equal(flow.targetEntries[0].recordId, "prospect-1");
  assert.match(panel.textContent, /已分析潜客/);
});

test("activation specialist refreshes its automatic pool when the sending account changes", t => {
  const store = {
    get: () => null,
    list: () => [
      {
        id: "prospect-a", name: "账号 A 潜客", status: "待确认触达", profileUrl: "https://www.douyin.com/user/prospect-a",
        source: { secUid: "sec-a", accountId: "account", accountName: "我的账号" },
        contactability: { allowed: true, sourceScope: "own_account_comments" }, evidence: [{ quote: "想了解价格" }]
      },
      {
        id: "prospect-b", name: "账号 B 潜客", status: "待确认触达", profileUrl: "https://www.douyin.com/user/prospect-b",
        source: { secUid: "sec-b", accountId: "account-b", accountName: "另一个账号" },
        contactability: { allowed: true, sourceScope: "own_account_live" }, evidence: [{ quote: "直播间看到这款车" }]
      }
    ],
    listRuns: () => []
  };
  const { panel, flow, renderers } = harness(t, "mkt-cold-writer", { prospectStore: store });
  flow.prefilledFromResult = false;
  flow.targetEntries = [];
  renderers.renderPrivateOutreachSetup(panel, flow);
  assert.deepEqual(flow.targetEntries.map((entry) => entry.recordId), ["prospect-a"]);

  flow.accountId = "account-b";
  flow.account = "另一个账号";
  renderers.renderPrivateOutreachSetup(new Element("div"), flow);
  assert.deepEqual(flow.targetEntries.map((entry) => entry.recordId), ["prospect-b"]);
});

test("choosing acquisition options never authorizes or sends until the user starts", t => {
  const { panel, flow, calls, renderers } = harness(t, "mkt-comment-acquisition");
  flow.authorizedAccounts = []; flow.accountId = "";
  renderers.renderCommentAcquisitionSetup(panel, flow);
  const input = panel.all().find(node => node.tagName === "INPUT" && node.value === "price"); input.checked = true; input.trigger("change");
  assert.equal(calls.length, 0);
  panel.all().find(node => node.tagName === "BUTTON" && node.textContent === "开始找客户").trigger("click");
  assert.deepEqual(calls, [{ type: "authorize" }]);
});

test("rerender preserves selected choices and does not replace a cleared outreach draft", t => {
  const { panel, flow, renderers } = harness(t, "mkt-comment-acquisition");
  renderers.renderCommentAcquisitionSetup(panel, flow);
  const input = panel.all().find(node => node.tagName === "INPUT" && node.value === "compare"); input.checked = true; input.trigger("change");
  const originalGoal = flow.product;
  flow.message = ""; flow.setupError = "请填写触达内容";
  const next = new Element("div"); renderers.renderCommentAcquisitionSetup(next, flow);
  assert.equal(flow.message, ""); assert.equal(flow.product, originalGoal); assert.equal(flow.setupError, "请填写触达内容");
  assert.equal(next.all().find(node => node.tagName === "INPUT" && node.value === "compare").checked, true);
});

test("acquisition puts multi-select customer signals before optional free-text context", t => {
  const { panel, flow, calls, renderers } = harness(t, "mkt-comment-acquisition");
  renderers.renderCommentAcquisitionSetup(panel, flow);
  const goal = panel.all().find(node => node.tagName === "TEXTAREA" && node.attributes["aria-label"] === "补充说明（选填）");
  assert.ok(goal);
  const choices = panel.all().find(node => node.className.includes("sb-task-choices"));
  const gridIndex = choices.children.findIndex(node => node.className.includes("sb-task-choice-grid"));
  const goalIndex = choices.children.findIndex(node => node.className.includes("sb-task-goal"));
  assert.ok(gridIndex >= 0 && goalIndex >= 0 && gridIndex < goalIndex);
  assert.match(panel.textContent, /先选择要留意的信号（可多选）/);
  assert.match(panel.textContent, /补充说明（选填）/);
  assert.match(panel.textContent, /我会从这个账号的评论、互动和直播弹幕中找到符合条件的人/);
  assert.doesNotMatch(panel.textContent, /触达策略/);
  assert.doesNotMatch(panel.textContent, /先回应对方的具体留言/);
  assert.equal(calls.length, 0);
});

test("inbox entry uses its own product account, keeps shared conversation settings, and has one launch action", t => {
  const { panel, flow, calls, renderers } = harness(t, "mkt-dm-inbox");
  renderers.renderInboxSetup(panel, flow);
  assert.match(panel.textContent, /1\. 登录你的抖音账号/);
  assert.doesNotMatch(panel.textContent, /由主管家绑定/);
  assert.match(panel.textContent, /2\. 告诉我怎么回复/);
  assert.match(panel.textContent, /3\. 开始托管/);
  assert.doesNotMatch(panel.textContent, /让每条私信都有人好好回复/);
  assert.doesNotMatch(panel.textContent, /管理主管家账号/);
  assert.equal(panel.all().filter(node => node.tagName === "TEXTAREA").length, 0);
  const start = panel.all().find(node => node.tagName === "BUTTON" && node.textContent === "立即启动托管");
  assert.equal(start.disabled, false);
  start.trigger("click");
  assert.equal(calls[0].type, "start");
});

test("inbox entry never inherits a complete-agent account relationship", t => {
  const { panel, flow, renderers } = harness(t, "mkt-dm-inbox");
  flow.executionAgentId = "mkt-comment-acquisition";
  renderers.renderInboxSetup(panel, flow);
  assert.match(panel.textContent, /1\. 登录你的抖音账号/);
  assert.doesNotMatch(panel.textContent, /主管家|获客管家已绑定账号|继承/);
});

test("inbox specialist independently detects users already reached by activation", t => {
  const store = {
    get: () => null,
    list: () => [{ id: "reached-1", name: "已触达用户", status: "已触达", source: { secUid: "sec-reached-1" }, contactability: { allowed: true } }],
    listRuns: () => []
  };
  const { panel, flow, renderers } = harness(t, "mkt-dm-inbox", { prospectStore: store });
  flow.prefilledFromResult = false;
  flow.targetEntries = [];
  flow.focusTargets = [];
  renderers.renderInboxSetup(panel, flow);
  assert.equal(flow.focusTargets.length, 1);
  assert.match(panel.textContent, /已识别已触达用户/);
});

test("analysis agent setup consumes existing candidates and starts without typing", t => {
  const setup = harness(t, "mkt-intent-analyst");
  setup.flow.intentCandidates = [{ sourceRecordId: "record-1", leadId: "user-1", nickname: "待判断用户", text: "想了解价格", source: { type: "作品评论" }, evidence: [] }];
  setup.flow.intentSelectedIds = ["record-1"];
  setup.renderers.renderIntentAnalystSetup(setup.panel, setup.flow);
  assert.match(setup.panel.textContent, /选择待判断对象/);
  assert.doesNotMatch(setup.panel.textContent, /TEXTAREA/);
  assert.match(setup.panel.textContent, /待判断/);
  assert.match(setup.panel.textContent, /重点潜客|待确认|暂不跟进/);
  assert.doesNotMatch(setup.panel.textContent, /账号与作品|评论与互动|综合分析/);
  assert.equal(setup.flow.analysisScope, "user_intent");
  const start = setup.panel.all().find(node => node.tagName === "BUTTON" && node.textContent === "开始判断 1 位潜客");
  assert.equal(start.disabled, false);
  const selectAll = setup.panel.all().find(node => node.tagName === "BUTTON" && node.textContent === "取消全选");
  selectAll.trigger("click");
  assert.deepEqual(Array.from(setup.flow.intentSelectedIds), []);
  assert.equal(start.disabled, true);
  assert.equal(start.textContent, "开始判断潜客");
  selectAll.trigger("click");
  assert.deepEqual(Array.from(setup.flow.intentSelectedIds), ["record-1"]);
  assert.equal(start.disabled, false);
});

test("intent analysis configures the high-intent audience before execution", t => {
  const setup = harness(t, "mkt-intent-analyst");
  setup.flow.intentCandidates = [{ sourceRecordId: "record-1", leadId: "user-1", nickname: "待判断用户", text: "想了解价格", source: { type: "作品评论" }, evidence: [] }];
  setup.flow.intentSelectedIds = ["record-1"];
  setup.renderers.renderIntentAnalystSetup(setup.panel, setup.flow);

  assert.match(setup.panel.textContent, /你想找什么样的潜客/);
  assert.match(setup.panel.textContent, /问价格的人|准备买的人|正在挑选的人/);
  assert.match(setup.flow.intentGoal, /需求信号/);
  const purchase = setup.panel.all().find(node => node.tagName === "INPUT" && node.value === "purchase");
  assert.ok(purchase);
  assert.equal(purchase.checked, true);
});

test("standalone user analysis requires a prompt and stays out of the outreach flow", t => {
  const setup = harness(t, "mkt-intent-analyst");
  setup.flow.analysisMode = "account_report";
  setup.flow.analysisKind = "account_report";
  setup.flow.analysisAccounts = [{ id: "person-1", nickname: "待分析用户", profileUrl: "https://www.douyin.com/user/person-1" }];
  setup.renderers.renderStandaloneUserAnalysisSetup(setup.panel, setup.flow);

  assert.match(setup.panel.textContent, /单独做用户分析/);
  assert.match(setup.panel.textContent, /不会判断购买意向|不会发送私信/);
  const prompt = setup.panel.all().find(node => node.tagName === "TEXTAREA" && node.attributes["aria-label"] === "分析提示词");
  assert.ok(prompt);
  const start = setup.panel.all().find(node => node.tagName === "BUTTON" && node.textContent === "生成用户分析报告");
  assert.equal(start.disabled, true);

  prompt.value = "分析这个用户的购买需求和价格敏感度";
  prompt.trigger("input");
  assert.equal(setup.flow.analysisGoal, "分析这个用户的购买需求和价格敏感度");
  assert.equal(start.disabled, false);
  start.trigger("click");
  assert.equal(setup.calls[0].type, "start");
});

test("analysis agent keeps a usable empty state when no candidates are available", t => {
  const setup = harness(t, "mkt-intent-analyst");
  assert.doesNotThrow(() => setup.renderers.renderIntentAnalystSetup(setup.panel, setup.flow));
  assert.match(setup.panel.textContent, /客户分析员|先完成找客/);
});

test("customer analyst exposes intent and report capabilities before a task is selected", t => {
  const setup = harness(t, "mkt-intent-analyst");
  setup.renderers.renderIntentAnalystSetup(setup.panel, setup.flow);
  assert.match(setup.panel.textContent, /判断潜客意向/);
  assert.match(setup.panel.textContent, /单独做用户分析/);
  const report = setup.panel.all().find((node) => node.tagName === "BUTTON" && node.textContent.includes("单独做用户分析"));
  assert.ok(report);
  report.trigger("click");
  assert.equal(setup.flow.analysisMode, "account_report");
  assert.equal(setup.flow.analysisKind, "account_report");
});

test("analysis agent automatically receives the latest completed finder list", t => {
  const finderRun = {
    taskId: "finder-task-1",
    taskRunId: "finder-run-1",
    resultId: "run:mkt-find-people::finder-task-1::account-1",
    agentId: "mkt-find-people",
    agentName: "找客专员",
    status: "completed",
    resultType: "潜客",
    sourceScope: "own_account_comments",
    accountId: "account-1",
    accountName: "我的账号",
    query: "找近期咨询装修的人",
    resultSnapshot: {
      status: "completed",
      analysis: { mode: "collect" },
      sourceScope: "own_account_comments",
      leads: [{
        leadId: "found-user-1",
        nickname: "刚刚找到的用户",
        uniqueId: "found_user",
        secUid: "sec-found-user-1",
        text: "请问这个怎么收费？",
        source: { type: "作品评论", videoTitle: "装修案例" }
      }]
    }
  };
  const setup = harness(t, "mkt-intent-analyst", {
    prospectStore: { get: () => null, list: () => [], listRuns: () => [finderRun] }
  });
  setup.renderers.renderIntentAnalystSetup(setup.panel, setup.flow);
  assert.match(setup.panel.textContent, /找客专员 · 待分析互动用户池/);
  assert.match(setup.panel.textContent, /刚刚找到的用户/);
  assert.match(setup.panel.textContent, /已自动接收找客专员的最新名单/);
  assert.match(setup.panel.textContent, /来源账号：我的账号/);
  assert.match(setup.panel.textContent, /不会代发私信/);
  assert.equal(setup.flow.sourceResultId, finderRun.resultId);
  assert.equal(setup.flow.sourceTaskId, finderRun.taskId);
  assert.equal(setup.flow.sourceScope, "own_account_comments");
  assert.equal(setup.flow.intentCandidates.length, 1);
  assert.equal(Array.from(setup.flow.intentSelectedIds).join(","), "found-user-1");
});

test("analysis completion stores the real result snapshot on its live work", () => {
  const start = source.indexOf("  async function startIntentAnalyst(");
  const end = source.indexOf("\n  function renderUse(", start);
  const implementation = source.slice(start, end);

  assert.match(implementation, /updateWork\(agent\.id, \{[\s\S]*?resultSnapshot: flow\.resultSnapshot/);
  assert.match(implementation, /finishWork\(agent\.id, "客户分析结果", \{ taskId: flow\.taskId, taskRunId: flow\.taskRunId \}\)/);
  assert.match(implementation, /skillId: "lead_intent_analysis"/);
  assert.match(implementation, /analysisScope: "user_intent"/);
  assert.match(implementation, /goal: intentGoal/);
  assert.match(implementation, /candidates: selected/);
  assert.match(implementation, /prospectStore\.applyIntentAnalysis/);
  assert.match(implementation, /openRealtimeWork/);
  assert.doesNotMatch(implementation, /analysisScope: flow\.analysisScope/);
});

test("获客专家在同一个页面完成监听目标和接待策略", t => {
  const { panel, flow, renderers } = harness(t, "mkt-comment-acquisition");
  flow.mode = "inbox";
  flow.managerCombinedStart = true;
  renderers.renderInboxSetup(panel, flow);
  assert.match(panel.textContent, /1\. 登录你的抖音账号/);
  assert.match(panel.textContent, /2\. 告诉我想找什么样的人/);
  assert.doesNotMatch(panel.textContent, /监听方式|持续监听新的作品评论、直播互动和账号互动通知，不回扫历史内容/);
  assert.match(panel.textContent, /3\. 告诉我怎么回复/);
  assert.match(panel.textContent, /4\. 启动完整获客任务/);
  assert.match(panel.textContent, /启动获客专家/);
  assert.doesNotMatch(panel.textContent, /配置接待方式（必填）/);
});

test("获客专家在当前配置页展示启动前置校验错误", t => {
  const { panel, flow, renderers } = harness(t, "mkt-comment-acquisition");
  flow.mode = "inbox";
  flow.managerCombinedStart = true;
  flow.product = "近期准备购买家居产品的人";
  flow.setupError = "当前账号的接待方式尚未同步完成，请稍后重试。";

  renderers.renderInboxSetup(panel, flow);

  assert.match(panel.textContent, /当前账号的接待方式尚未同步完成，请稍后重试。/);
});

test("获客专家按账号恢复已保存的监听配置", t => {
  const { flow, renderers } = harness(t, "mkt-comment-acquisition");
  flow.mode = "inbox";
  flow.managerCombinedStart = true;
  flow.accountWorkKey = "douyin:owner";
  flow.product = "";
  flow.requirements = "";
  flow.audienceTypes = [];
  flow.taskChoices = {};

  const restored = renderers.restoreAccountScopedAcquisitionDraft(flow, {
    accountSetupSavedAt: "2026-09-14T00:00:00.000Z",
    resumeFlow: {
      agentId: "mkt-comment-acquisition",
      product: "近期准备购买家居产品的人",
      requirements: "仅关注上海地区",
      audienceTypes: ["问价格", "准备下单"],
      taskChoices: { audience: { selected: ["price", "buying"], extra: "仅关注上海地区" } },
      touchStrategy: "先确认具体需求，再邀请进一步沟通。",
      contactTiming: "工作时间内立即联系",
      workSchedule: "09:00-20:00",
      maxTouchesPerDay: 18,
      minIntervalMinutes: 20
    }
  });

  assert.equal(restored, true);
  assert.equal(flow.product, "近期准备购买家居产品的人");
  assert.equal(flow.requirements, "仅关注上海地区");
  assert.deepEqual(Array.from(flow.audienceTypes), ["问价格", "准备下单"]);
  assert.deepEqual(structuredClone(flow.taskChoices), { audience: { selected: ["price", "buying"], extra: "仅关注上海地区" } });
  assert.equal(flow.touchStrategy, "先确认具体需求，再邀请进一步沟通。");
  assert.equal(flow.contactTiming, undefined);
  assert.equal(flow.workSchedule, undefined);
  assert.equal(flow.maxTouchesPerDay, 18);
  assert.equal(flow.minIntervalMinutes, 20);
});

test("获客专家编辑监听配置后立即保存当前账号草稿", t => {
  const { panel, flow, calls, renderers } = harness(t, "mkt-comment-acquisition");
  flow.mode = "inbox";
  flow.managerCombinedStart = true;
  flow.accountWorkKey = "douyin:owner";
  renderers.renderInboxSetup(panel, flow);

  const price = panel.all().find(node => node.tagName === "INPUT" && node.value === "price");
  price.checked = true;
  price.trigger("change");

  assert.equal(calls.length, 1);
  assert.equal(calls[0].type, "persist");
  assert.match(calls[0].patch.accountSetupSavedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test("获客专家识别账号后先恢复草稿再写回账号绑定", () => {
  const start = source.indexOf("    const loadAuthorizedAccounts = async () => {");
  const end = source.indexOf("    if (inboxIntake", start);
  const implementation = source.slice(start, end);

  assert.match(implementation, /accountWorkKey = douyinAccountWorkKey\(initialIdentity, state\.useFlow\.accountId\);\s*restoreAccountScopedAcquisitionDraft\(state\.useFlow\);[\s\S]*?persistCloudTask\(state\.useFlow,/);
});

test("获客专家在缺少业务资料时明确阻止启动", t => {
  const { panel, flow, renderers } = harness(t, "mkt-comment-acquisition");
  flow.mode = "inbox";
  flow.managerCombinedStart = true;
  flow.product = "近期准备购买家居产品的人";
  flow.businessKnowledge = "";
  flow.knowledgeEntries = [];
  renderers.renderInboxSetup(panel, flow);

  const start = panel.all().find(node => node.tagName === "BUTTON" && node.textContent === "启动获客专家");
  assert.ok(start);
  assert.equal(start.disabled, true);
  assert.match(panel.textContent, /待补资料/);
  assert.match(panel.textContent, /先补充业务资料，避免自动回复不准确或无法确认的信息。/);
  assert.match(renderers.validateInboxSetup(flow).businessKnowledge, /请填写产品、服务范围/);
});

test("获客专家同时缺少监听信号和业务资料时列出全部启动前置条件", t => {
  const { panel, flow, renderers } = harness(t, "mkt-comment-acquisition");
  flow.mode = "inbox";
  flow.managerCombinedStart = true;
  flow.product = "";
  flow.requirements = "";
  flow.businessKnowledge = "";
  flow.knowledgeEntries = [];
  renderers.renderInboxSetup(panel, flow);

  const start = panel.all().find(node => node.tagName === "BUTTON" && node.textContent === "启动获客专家");
  assert.ok(start);
  assert.equal(start.disabled, true);
  assert.match(panel.textContent, /先选择需要持续关注的潜客信号，并补充业务资料。/);
  assert.match(renderers.validateInboxSetup(flow).product, /请至少选择一个潜客信号/);
  assert.match(renderers.validateInboxSetup(flow).businessKnowledge, /请填写产品、服务范围/);
});
