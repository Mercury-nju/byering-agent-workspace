import assert from "node:assert/strict";
import test from "node:test";

import { MARKETPLACE_AGENTS, MARKETPLACE_CATEGORIES, IMPLEMENTED_MARKETPLACE_AGENT_IDS, DEFAULT_HIRED_MARKETPLACE_AGENT_IDS, DOUYIN_ACQUISITION_COMPLETE_AGENT_ID, DOUYIN_ACQUISITION_SINGLE_CAPABILITY_AGENT_IDS, DOUYIN_ACQUISITION_ACTIVE_AGENT_IDS, douyinAcquisitionAccountBindingAgentIds, hasDouyinAcquisitionManagerBindingConflict, isDouyinAcquisitionManagerBoundAccount, isImplementedMarketplaceAgent, isMarketplaceAgentAvailable, listActivatedMarketplaceAgents, marketplaceProfileSeed, hireAgent, terminateAgent, assignAgentToProject, getEmployment, isHired, listHiredAgents, markEmploymentWelcome, sortMarketplaceAgentsForDisplay, normalizeMarketplaceCapability } from "../src/salebuddy/agents/marketplace.js";
import { roleReply } from "../src/salebuddy/agents/dm-scenarios.js";
import { listRuntimeAgentTypes } from "../src/salebuddy/agents/registry.js";

const EXPECTED_DESCRIPTIONS = {
  "mkt-comment-acquisition": "从互动用户中找人、分析、首次私信联系和后续对话处理，串起完整获客链路。",
  "mkt-lead-miner": "从作品评论里找出有需求的人，保留账号、原话和来源。",
  "mkt-comment-filter": "按条件筛选差评、询价和竞品评论，保留原文与评论人。",
  "mkt-douyin-finder": "按你的要求找账号，查看主页和作品，给出匹配人选。",
  "mkt-find-people": "汇总我账号评论、直播和互动里出现的全部用户，保留来源后交给客户分析员。",
  "mkt-user-research": "找到符合条件的受访者，并用指定账号发送问卷邀请。",
  "mkt-live-lead-miner": "从直播弹幕和互动中找出有需求的观众，整理账号与依据。",
  "mkt-cold-writer": "按账号选择潜客或全部找到的人，配置首轮私信后发送，并记录结果。",
  "mkt-dm-inbox": "持续处理新私信和历史会话，识别留资并把需要人工判断的事项交给你。",
  "mkt-research-expert": "分析账号主页、作品和互动，整理内容表现与账号画像。",
  "mkt-audience-search": "按地区、简介和账号类型筛选目标账号，说明匹配条件。",
  "mkt-network-miner": "分析粉丝与关注关系，找出相似账号和共同关注的人。",
  "mkt-trend-insight": "对比账号粉丝、播放和互动变化，找出增长与异常。",
  "mkt-intent-analyst": "从找客结果中判断值得继续跟进的人，也可按账号或指定目标生成分析报告。",
  "mkt-live-danmaku-analysis": "分析直播间弹幕，提炼问题、需求和购买意向。",
  "mkt-follow-up": "根据沟通和意向安排回访时间，整理待跟进清单。",
  "mkt-phone-sdr": "准备电话开场和邀约话术，通话后整理结果与下一步。",
  "mkt-copywriter": "根据产品和受众写视频、直播和私信文案，整理发布计划。"
};

const EXPECTED_CARD_IDENTITIES = {
  "mkt-lead-miner": ["评论区找客户", "从留言里找出有需求的人", ["找有需求的人", "保留原始留言", "整理客户名单"]],
  "mkt-comment-acquisition": ["抖音获客管家", "找人、分析、触达和对话", ["找互动用户", "筛出值得跟进的人", "完成首次联系和对话"]],
  "mkt-comment-filter": ["按条件筛评论", "差评、询价、提到竞品，都能筛", ["筛差评和询价", "查留言原文", "导出评论表"]],
  "mkt-douyin-finder": ["抖音找人助手", "说出你的要求，帮你找到合适的人", ["按要求找人", "查看账号和作品", "比较推荐人选"]],
  "mkt-find-people": ["找客专员", "从我的账号汇总全部互动用户", ["汇总互动用户", "保留原始证据", "整理待分析名单"]],
  "mkt-user-research": ["找人发问卷", "找到你想调研的人，邀请填写问卷", ["找合适的受访者", "核对人选条件", "私信邀请填问卷"]],
  "mkt-live-lead-miner": ["直播间找客户", "从弹幕和互动里找有兴趣的观众", ["查看弹幕互动", "找有意向的观众", "整理观众名单"]],
  "mkt-cold-writer": ["潜客触达专员", "按账号触达潜客或全部找到的人，并记录结果", ["选择触达方式", "一键触达", "查看触达结果"]],
  "mkt-dm-inbox": ["私信客服", "有人发来私信，替你接待和解答", ["自动接待私信", "结合上下文回复", "识别留资并转人工"]],
  "mkt-research-expert": ["抖音账号分析", "看看这个账号是谁、内容做得怎样", ["了解账号背景", "分析作品表现", "整理分析报告"]],
  "mkt-audience-search": ["按条件找账号", "按地区、行业和简介筛选账号", ["设置找人条件", "搜索合适账号", "说明入选理由"]],
  "mkt-network-miner": ["粉丝关系分析", "看看谁关注了谁，找到相似的人", ["查看粉丝关注", "找相似账号", "找共同关注"]],
  "mkt-trend-insight": ["涨粉趋势分析", "看看谁涨粉快、哪些内容带来增长", ["比较涨粉速度", "找表现好的内容", "提醒数据异常"]],
  "mkt-intent-analyst": ["客户分析员", "分析互动用户或生成报告", ["查看原始表达", "判断购买意向", "生成分析报告"]],
  "mkt-live-danmaku-analysis": ["直播间弹幕分析", "把直播互动整理成需求与意向判断", ["识别弹幕主题", "判断用户意向", "保留原始证据"]],
  "mkt-follow-up": ["客户跟进提醒", "记住该回访谁、什么时候联系", ["查看沟通记录", "安排回访时间", "整理跟进提醒"]],
  "mkt-phone-sdr": ["电话邀约准备", "打电话前准备话术，聊完整理结果", ["准备邀约话术", "整理通话记录", "记录预约结果"]],
  "mkt-copywriter": ["营销文案助手", "帮你写视频文案、直播预告和私信", ["写视频文案", "写预告和私信", "整理发布计划"]]
};

test("Agent Center cards use capability-first Chinese names and outcome tags", () => {
  assert.equal(MARKETPLACE_AGENTS.length, Object.keys(EXPECTED_CARD_IDENTITIES).length);
  for (const agent of MARKETPLACE_AGENTS) {
    const [displayName, title, skills] = EXPECTED_CARD_IDENTITIES[agent.id];
    assert.equal(agent.displayName, displayName, `${agent.id} display name drifted`);
    assert.equal(agent.displayTitle, title, `${agent.id} card role drifted`);
    assert.deepEqual(agent.skills, skills, `${agent.id} card tags drifted`);
    assert.match(agent.displayName, /[\u4e00-\u9fff]/u);
    assert.doesNotMatch(agent.displayName, /^(Carter|Morgan|Claire|Atlas|Iris|Luca|Owen|Sophia|Felix|Nora|Miles|Victor|Celeste|Amelia|Ethan|Maya)$/);
  }
});

test("客户分析员只分析候选人或指定目标，不承担找人或自动触达", () => {
  const analyst = MARKETPLACE_AGENTS.find((agent) => agent.id === "mkt-intent-analyst");

  assert.deepEqual(analyst.profile.role.responsibilities, ["接收找客专员沉淀的互动用户", "按成果中心筛选结果或账号维度完成分析", "识别值得推进的人，或按用户目标生成 HTML 分析报告", "将报告同步到文件中心和产品内对话"]);
  assert.deepEqual(analyst.profile.scope.dataAccess, ["待判断候选名单", "候选人的原始表达与来源证据", "任务来源账号与时间信息"]);
  assert.match(analyst.profile.permission.approvalRequired.join(" "), /将重点潜客交给潜客触达专员/);
  assert.doesNotMatch(analyst.desc, /作品|自动发送|私信/);
  assert.doesNotMatch(analyst.profile.role.responsibilities.join(" "), /找人|账号研究|发送/);
});

test("comprehensive operating agents lead the Agent Square", () => {
  const agents = [
    { id: "mkt-cold-writer" },
    { id: "mkt-comment-acquisition" },
    { id: "mkt-douyin-finder" },
    { id: "mkt-find-people" },
    { id: "mkt-intent-analyst" },
    { id: "mkt-dm-inbox" }
  ];
  assert.deepEqual(
    sortMarketplaceAgentsForDisplay(agents, { isReady: () => true }).map(({ id }) => id),
    [DOUYIN_ACQUISITION_COMPLETE_AGENT_ID, ...DOUYIN_ACQUISITION_SINGLE_CAPABILITY_AGENT_IDS, "mkt-douyin-finder"]
  );
});

test("marketplace display order follows the recovered capability hierarchy", () => {
  const agents = [
    { id: "mkt-cold-writer" },
    { id: "mkt-comment-filter" },
    { id: "mkt-dm-inbox" },
    { id: "mkt-research-expert" },
    { id: "mkt-lead-miner" },
    { id: "mkt-comment-acquisition" }
  ];
  assert.deepEqual(
    sortMarketplaceAgentsForDisplay(agents, { isReady: () => true }).map(({ id }) => id),
    ["mkt-comment-acquisition", "mkt-cold-writer", "mkt-dm-inbox", "mkt-lead-miner", "mkt-research-expert", "mkt-comment-filter"]
  );
});

test("marketplace agent descriptions state concrete scope and boundaries", () => {
  assert.equal(MARKETPLACE_AGENTS.length, Object.keys(EXPECTED_DESCRIPTIONS).length);
  for (const agent of MARKETPLACE_AGENTS) {
    assert.equal(agent.desc, EXPECTED_DESCRIPTIONS[agent.id], `${agent.id} description drifted`);
    assert.ok(agent.desc.trim().length > 0, `${agent.id} description is empty`);
  }
});

test("抖音获客管家 advertises the authorized-account listener path", () => {
  const agent = MARKETPLACE_AGENTS.find((item) => item.id === "mkt-comment-acquisition");
  assert.ok(agent, "mkt-comment-acquisition missing from Agent Square");
  assert.equal(agent.name, "抖音获客管家");
  assert.equal(agent.title, "抖音获客管家");
  assert.match(agent.desc, /首次私信联系/);
  assert.match(agent.desc, /后续对话/);
  assert.match(agent.mission, /持续监听/);
  assert.deepEqual(agent.inputs, ["授权账号"]);
  assert.doesNotMatch(agent.inputs.join(" "), /时间|范围|历史/);
  assert.equal(agent.capabilities.inboxReception, true);
  assert.ok(agent.searchTerms.includes("评论区获客"));
  assert.ok(agent.searchTerms.includes("互动关注"));
  assert.equal(agent.approvalDefaults.mode, "auto");
  assert.doesNotMatch(agent.profile.soul.safetyRules.join(" "), /私信默认人工确认/);
  assert.equal(agent.profile.permission.approvalRequired.includes("私信发送"), false);
});

test("找客专员私聊说明明确只汇总授权账号互动用户", () => {
  const reply = roleReply("mkt-find-people");
  assert.match(reply, /授权账号/);
  assert.match(reply, /不直接把互动当成潜客/);
  assert.match(reply, /不直接把互动当成潜客/);
  assert.doesNotMatch(reply, /公开找人/);
  assert.doesNotMatch(reply, /发私信/);
});

test("找客专员只持续监听授权账号的新互动", () => {
  const manager = MARKETPLACE_AGENTS.find((agent) => agent.id === "mkt-comment-acquisition");
  const finder = MARKETPLACE_AGENTS.find((agent) => agent.id === "mkt-find-people");

  assert.match(manager.mission, /持续监听/);
  assert.deepEqual(manager.inputs, ["授权账号"]);
  assert.doesNotMatch(manager.inputs.join(" "), /时间窗口|作品范围/);

  assert.match(finder.mission, /持续监听已授权账号/);
  assert.deepEqual(finder.inputs, ["已授权抖音账号", "互动来源", "本次汇总说明（可选）"]);
  assert.doesNotMatch(finder.mission, /公开找客/);
  assert.match(finder.mission, /不判断意向/);
  assert.match(finder.mission, /不自动触达/);
});

test("Agent Square categories use the generic capability taxonomy", () => {
  assert.deepEqual(MARKETPLACE_CATEGORIES, ["找人", "触达", "私信对话", "分析"]);
  const expectedIds = new Set([
    "mkt-lead-miner", "mkt-comment-acquisition", "mkt-comment-filter", "mkt-douyin-finder", "mkt-find-people", "mkt-user-research", "mkt-live-lead-miner", "mkt-cold-writer", "mkt-dm-inbox", "mkt-research-expert",
    "mkt-audience-search", "mkt-network-miner", "mkt-trend-insight", "mkt-intent-analyst", "mkt-live-danmaku-analysis",
    "mkt-follow-up", "mkt-phone-sdr", "mkt-copywriter"
  ]);
  assert.deepEqual(new Set(MARKETPLACE_AGENTS.map((agent) => agent.id)), expectedIds);
  const validCapabilities = new Set(MARKETPLACE_CATEGORIES);
  for (const agent of MARKETPLACE_AGENTS) {
    assert.ok(agent.domains?.length, `${agent.id} must declare generic capabilities`);
    assert.ok(validCapabilities.has(agent.category), `${agent.id} has unknown capability ${agent.category}`);
    assert.deepEqual(agent.domains, [agent.category], `${agent.id} capability metadata drifted`);
    assert.deepEqual(agent.industries, [], `${agent.id} should not expose industry taxonomy`);
  }
  assert.equal(MARKETPLACE_AGENTS.find((agent) => agent.id === "mkt-dm-inbox")?.category, "私信对话");
  assert.equal(MARKETPLACE_AGENTS.find((agent) => agent.id === "mkt-dm-inbox")?.domains?.[0], "私信对话");
  assert.equal(MARKETPLACE_AGENTS.some((agent) => agent.id === "mkt-designer"), false, "visual designer must not be in the marketplace");
});

test("private-message reply labels collapse into the conversation capability", () => {
  assert.equal(normalizeMarketplaceCapability("私信回复"), "私信对话");
  assert.equal(normalizeMarketplaceCapability("私信承接"), "私信对话");
  assert.equal(normalizeMarketplaceCapability("私信客服"), "私信对话");
  assert.equal(normalizeMarketplaceCapability("私信自动回复"), "私信对话");
  assert.equal(normalizeMarketplaceCapability("私信对话"), "私信对话");
});

test("only agents with a real end-to-end path are marked executable", () => {
  assert.deepEqual(IMPLEMENTED_MARKETPLACE_AGENT_IDS, ["mkt-lead-miner", "mkt-comment-filter", "mkt-comment-acquisition", "mkt-dm-inbox", "mkt-cold-writer", "mkt-douyin-finder", "mkt-find-people", "mkt-user-research", "mkt-live-lead-miner", "mkt-research-expert", "mkt-intent-analyst", "mkt-live-danmaku-analysis"]);
  assert.equal(isImplementedMarketplaceAgent("mkt-lead-miner"), true);
  assert.equal(isImplementedMarketplaceAgent("mkt-live-lead-miner"), true);
  assert.equal(isImplementedMarketplaceAgent({ id: "mkt-comment-filter" }), true);
});

test("Agent Center activates the complete-capability roster and live analysis Agent", () => {
  assert.deepEqual(DOUYIN_ACQUISITION_ACTIVE_AGENT_IDS, [
    DOUYIN_ACQUISITION_COMPLETE_AGENT_ID,
    ...DOUYIN_ACQUISITION_SINGLE_CAPABILITY_AGENT_IDS,
    "mkt-live-danmaku-analysis"
  ]);
  assert.deepEqual(listActivatedMarketplaceAgents().map(({ id }) => id), DOUYIN_ACQUISITION_ACTIVE_AGENT_IDS);
  for (const agent of MARKETPLACE_AGENTS) {
    assert.equal(
      isMarketplaceAgentAvailable(agent),
      DOUYIN_ACQUISITION_ACTIVE_AGENT_IDS.includes(agent.id),
      `${agent.id} availability drifted from the focused Agent Center roster`
    );
  }
  assert.equal(isImplementedMarketplaceAgent("mkt-live-lead-miner"), true);
  assert.equal(isMarketplaceAgentAvailable("mkt-live-lead-miner"), false);
});

test("manager-bound Douyin accounts cannot be reused by a single-capability Agent", () => {
  const managerAccount = {
    agentId: "mkt-find-people",
    agentIds: ["mkt-comment-acquisition", "mkt-find-people"],
    capabilityMatrix: DOUYIN_ACQUISITION_ACTIVE_AGENT_IDS.map((agentId) => ({ agentId, ready: true }))
  };
  const independentAccount = {
    agentId: "mkt-find-people",
    agentIds: ["mkt-find-people"],
    capabilityMatrix: DOUYIN_ACQUISITION_ACTIVE_AGENT_IDS.map((agentId) => ({ agentId, ready: true }))
  };

  assert.deepEqual(douyinAcquisitionAccountBindingAgentIds(managerAccount), ["mkt-find-people", "mkt-comment-acquisition"]);
  assert.equal(isDouyinAcquisitionManagerBoundAccount(managerAccount), true);
  assert.equal(hasDouyinAcquisitionManagerBindingConflict("mkt-find-people", managerAccount), true);
  assert.equal(hasDouyinAcquisitionManagerBindingConflict("mkt-cold-writer", managerAccount), true);
  assert.equal(hasDouyinAcquisitionManagerBindingConflict("mkt-comment-acquisition", managerAccount), false);
  assert.equal(isDouyinAcquisitionManagerBoundAccount(independentAccount), false);
  assert.equal(hasDouyinAcquisitionManagerBindingConflict("mkt-find-people", independentAccount), false);
});

test("account-cloud records expose the manager binding from reception state", () => {
  const accountCloud = {
    agentId: "mkt-douyin-account-runtime",
    privateReception: {
      agentIds: ["mkt-dm-inbox", "mkt-comment-acquisition"],
      activeAgentId: "mkt-comment-acquisition"
    }
  };

  assert.deepEqual(douyinAcquisitionAccountBindingAgentIds(accountCloud), [
    "mkt-douyin-account-runtime",
    "mkt-dm-inbox",
    "mkt-comment-acquisition"
  ]);
  assert.equal(isDouyinAcquisitionManagerBoundAccount(accountCloud), true);
  assert.equal(hasDouyinAcquisitionManagerBindingConflict("mkt-find-people", accountCloud), true);
});

test("first launch keeps every Agent available for explicit user employment", () => {
  const originalStorage = globalThis.localStorage;
  const data = new Map();
  globalThis.localStorage = {
    getItem(key) { return data.get(key) || null; },
    setItem(key, value) { data.set(key, String(value)); },
    removeItem(key) { data.delete(key); }
  };
  try {
    assert.deepEqual(DEFAULT_HIRED_MARKETPLACE_AGENT_IDS, []);
    assert.equal(isHired("mkt-comment-filter"), false);
    assert.equal(isHired("mkt-dm-inbox"), false);
    assert.deepEqual(listHiredAgents(), []);
    assert.equal(data.get("salebuddy:employmentContracts"), undefined);
  } finally {
    globalThis.localStorage = originalStorage;
  }
});

test("every marketplace agent carries a complete runtime profile seed", () => {
  const sections = ["identity", "soul", "role", "skills", "tools", "scope", "permission", "budget"];
  for (const agent of MARKETPLACE_AGENTS) {
    assert.ok(agent.profile, `${agent.id} missing profile`);
    for (const section of sections) assert.ok(agent.profile[section], `${agent.id} missing ${section}`);
    assert.ok(agent.profile.soul.principles.length > 0, `${agent.id} missing principles`);
    assert.ok(agent.profile.soul.deliveryStandard, `${agent.id} missing delivery standard`);
    assert.ok(agent.profile.soul.safetyRules.length > 0, `${agent.id} missing safety rules`);
    assert.ok(agent.profile.soul.honestyRules.length > 0, `${agent.id} missing honesty rules`);
    assert.ok(agent.profile.role.responsibilities.length > 0, `${agent.id} missing responsibilities`);
    assert.notDeepEqual(agent.profile.role.responsibilities, agent.profile.skills, `${agent.id} responsibilities copied from skills`);
    assert.ok(agent.profile.scope.dataAccess.length > 0, `${agent.id} missing data scope`);
    assert.ok(agent.profile.scope.forbiddenZones.length > 0, `${agent.id} missing forbidden scope`);
    assert.ok(agent.profile.permission.approvalRequired.length > 0, `${agent.id} missing approval rules`);
    assert.ok(Object.keys(agent.profile.permission.limits).length > 0, `${agent.id} missing limits`);
    assert.ok(agent.profile.permission.forbidden.length > 0, `${agent.id} missing forbidden actions`);
    assert.equal(agent.profile.budget.modelTier, "standard", `${agent.id} budget tier drifted`);

    const seed = marketplaceProfileSeed(agent.id);
    assert.deepEqual(seed.identity, agent.profile.identity, `${agent.id} identity seed drifted`);
    assert.deepEqual(seed.soul, agent.profile.soul, `${agent.id} soul seed drifted`);
    assert.deepEqual(seed.scope, agent.profile.scope, `${agent.id} scope seed drifted`);
    assert.deepEqual(seed.permission, agent.profile.permission, `${agent.id} permission seed drifted`);
    assert.deepEqual(seed.budget, agent.profile.budget, `${agent.id} budget seed drifted`);
  }
});

test("hiring creates an active employment contract and registers the runtime agent", () => {
  const originalStorage = globalThis.localStorage;
  const data = new Map();
  globalThis.localStorage = {
    getItem(key) { return data.get(key) || null; },
    setItem(key, value) { data.set(key, String(value)); },
    removeItem(key) { data.delete(key); }
  };
  try {
    const contract = hireAgent("mkt-follow-up", { dataScope: ["当前项目 CRM"], budget: { daily: 30 }, projectId: "room-demo" });
    assert.equal(contract.agentId, "mkt-follow-up");
    assert.equal(contract.status, "active");
    assert.deepEqual(contract.dataScope, ["当前项目 CRM"]);
    assert.equal(getEmployment("mkt-follow-up").projectId, "room-demo");
    assert.ok(listHiredAgents().some(({ id }) => id === "mkt-follow-up"));
    assert.ok(listRuntimeAgentTypes().includes("mkt-follow-up"));
    assert.equal(assignAgentToProject("mkt-follow-up", "room-next").projectId, "room-next");
    assert.equal(getEmployment("mkt-follow-up").projectId, "room-next");
    assert.equal(getEmployment("mkt-follow-up").welcomeSentAt, undefined);
    assert.ok(markEmploymentWelcome("mkt-follow-up").welcomeSentAt);
    assert.ok(getEmployment("mkt-follow-up").welcomeSentAt);
  } finally {
    globalThis.localStorage = originalStorage;
  }
});

test("termination removes a marketplace agent from active runtime membership", () => {
  const originalStorage = globalThis.localStorage;
  const data = new Map([["salebuddy:hiredAgents", JSON.stringify(["mkt-lead-miner"])]]);
  globalThis.localStorage = {
    getItem(key) { return data.get(key) || null; },
    setItem(key, value) { data.set(key, String(value)); },
    removeItem(key) { data.delete(key); }
  };
  try {
    hireAgent("mkt-lead-miner", { dataScope: ["公开网页"] });
    const terminated = terminateAgent("mkt-lead-miner");
    assert.equal(terminated.status, "terminated");
    assert.equal(listHiredAgents().some(({ id }) => id === "mkt-lead-miner"), false);
    assert.equal(listRuntimeAgentTypes().includes("mkt-lead-miner"), false);
  } finally {
    globalThis.localStorage = originalStorage;
  }
});
