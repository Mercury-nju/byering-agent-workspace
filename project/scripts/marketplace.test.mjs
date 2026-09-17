import assert from "node:assert/strict";
import test from "node:test";

import {
  MARKETPLACE_AGENTS,
  MARKETPLACE_CATEGORIES,
  IMPLEMENTED_MARKETPLACE_AGENT_IDS,
  DEFAULT_HIRED_MARKETPLACE_AGENT_IDS,
  DOUYIN_ACQUISITION_COMPLETE_AGENT_ID,
  DOUYIN_ACQUISITION_SINGLE_CAPABILITY_AGENT_IDS,
  DOUYIN_ACQUISITION_ACTIVE_AGENT_IDS,
  douyinAcquisitionAccountBindingAgentIds,
  hasDouyinAcquisitionManagerBindingConflict,
  isDouyinAcquisitionManagerBoundAccount,
  isImplementedMarketplaceAgent,
  isMarketplaceAgentAvailable,
  listActivatedMarketplaceAgents,
  marketplaceProfileSeed,
  hireAgent,
  terminateAgent,
  assignAgentToProject,
  getEmployment,
  isHired,
  listHiredAgents,
  markEmploymentWelcome,
  sortMarketplaceAgentsForDisplay,
  normalizeMarketplaceCapability
} from "../src/salebuddy/agents/marketplace.js";
import { roleReply } from "../src/salebuddy/agents/dm-scenarios.js";
import { listRuntimeAgentTypes } from "../src/salebuddy/agents/registry.js";

const CURRENT_AGENT_IDS = Object.freeze([
  "mkt-comment-acquisition",
  "mkt-find-people",
  "mkt-cold-writer",
  "mkt-dm-inbox",
  "mkt-gold-customer-service",
  "mkt-intent-analyst",
  "mkt-live-danmaku-analysis",
  "mkt-live-danmaku-outreach",
  "mkt-viral-work-analysis"
]);

const RETIRED_AGENT_IDS = Object.freeze([
  "mkt-lead-miner",
  "mkt-comment-filter",
  "mkt-live-lead-miner",
  "mkt-douyin-finder",
  "mkt-user-research",
  "mkt-research-expert",
  "mkt-audience-search",
  "mkt-network-miner",
  "mkt-trend-insight",
  "mkt-follow-up",
  "mkt-phone-sdr",
  "mkt-copywriter"
]);

test("marketplace only exposes the current product Agent roster", () => {
  assert.deepEqual(MARKETPLACE_AGENTS.map((agent) => agent.id), CURRENT_AGENT_IDS);
  assert.deepEqual(IMPLEMENTED_MARKETPLACE_AGENT_IDS, [
    "mkt-comment-acquisition",
    "mkt-dm-inbox",
    "mkt-gold-customer-service",
    "mkt-cold-writer",
    "mkt-find-people",
    "mkt-intent-analyst",
    "mkt-live-danmaku-analysis",
    "mkt-live-danmaku-outreach",
    "mkt-viral-work-analysis"
  ]);
  RETIRED_AGENT_IDS.forEach((id) => {
    assert.equal(MARKETPLACE_AGENTS.some((agent) => agent.id === id), false);
    assert.equal(isImplementedMarketplaceAgent(id), false);
    assert.equal(isMarketplaceAgentAvailable(id), false);
  });
});

test("marketplace cards use the focused capability taxonomy", () => {
  assert.deepEqual(MARKETPLACE_CATEGORIES, ["找人", "触达", "私信对话", "分析"]);
  const validCapabilities = new Set(MARKETPLACE_CATEGORIES);
  for (const agent of MARKETPLACE_AGENTS) {
    assert.match(agent.displayName, /[\u4e00-\u9fff]/u);
    assert.ok(validCapabilities.has(agent.category));
    assert.deepEqual(agent.domains, [agent.category]);
    assert.deepEqual(agent.industries, []);
    assert.ok(agent.desc.trim());
    assert.ok(agent.skills.length > 0);
  }
});

test("current Agent ordering starts with the comprehensive workflow", () => {
  const agents = [
    { id: "mkt-cold-writer" },
    { id: "mkt-comment-acquisition" },
    { id: "mkt-find-people" },
    { id: "mkt-intent-analyst" },
    { id: "mkt-dm-inbox" },
    { id: "mkt-gold-customer-service" }
  ];
  assert.deepEqual(
    sortMarketplaceAgentsForDisplay(agents, { isReady: () => true }).map(({ id }) => id),
    [DOUYIN_ACQUISITION_COMPLETE_AGENT_ID, ...DOUYIN_ACQUISITION_SINGLE_CAPABILITY_AGENT_IDS]
  );
});

test("current product Agents retain their business boundaries", () => {
  const manager = MARKETPLACE_AGENTS.find((agent) => agent.id === "mkt-comment-acquisition");
  const finder = MARKETPLACE_AGENTS.find((agent) => agent.id === "mkt-find-people");
  const analyst = MARKETPLACE_AGENTS.find((agent) => agent.id === "mkt-intent-analyst");

  assert.match(manager.mission, /持续监听/);
  assert.deepEqual(manager.inputs, ["授权账号"]);
  assert.match(finder.mission, /持续监听已授权账号/);
  assert.match(finder.mission, /不判断意向/);
  assert.match(roleReply("mkt-find-people"), /授权账号/);
  assert.doesNotMatch(roleReply("mkt-find-people"), /发私信/);
  assert.deepEqual(analyst.profile.role.responsibilities, ["接收找客专员沉淀的互动用户", "按成果中心筛选结果或账号维度完成分析", "识别值得推进的人，或按用户目标生成 HTML 分析报告", "将报告同步到文件中心和产品内对话"]);
});

test("current Agent Center activation matches the executable roster", () => {
  assert.deepEqual(DOUYIN_ACQUISITION_ACTIVE_AGENT_IDS, [
    DOUYIN_ACQUISITION_COMPLETE_AGENT_ID,
    ...DOUYIN_ACQUISITION_SINGLE_CAPABILITY_AGENT_IDS,
    "mkt-live-danmaku-analysis",
    "mkt-live-danmaku-outreach"
  ]);
  assert.deepEqual(listActivatedMarketplaceAgents().map(({ id }) => id), DOUYIN_ACQUISITION_ACTIVE_AGENT_IDS);
  for (const agent of MARKETPLACE_AGENTS) {
    assert.equal(
      isMarketplaceAgentAvailable(agent),
      DOUYIN_ACQUISITION_ACTIVE_AGENT_IDS.includes(agent.id) || agent.id === "mkt-viral-work-analysis"
    );
  }
});

test("manager-bound accounts reject duplicate single-capability execution", () => {
  const managerAccount = {
    agentId: "mkt-find-people",
    agentIds: ["mkt-comment-acquisition", "mkt-find-people"],
    capabilityMatrix: DOUYIN_ACQUISITION_ACTIVE_AGENT_IDS.map((agentId) => ({ agentId, ready: true }))
  };
  assert.deepEqual(douyinAcquisitionAccountBindingAgentIds(managerAccount), ["mkt-find-people", "mkt-comment-acquisition"]);
  assert.equal(isDouyinAcquisitionManagerBoundAccount(managerAccount), true);
  assert.equal(hasDouyinAcquisitionManagerBindingConflict("mkt-find-people", managerAccount), true);
  assert.equal(hasDouyinAcquisitionManagerBindingConflict("mkt-comment-acquisition", managerAccount), false);
});

test("marketplace employment only accepts current Agent ids", () => {
  const originalStorage = globalThis.localStorage;
  const data = new Map();
  globalThis.localStorage = {
    getItem(key) { return data.get(key) || null; },
    setItem(key, value) { data.set(key, String(value)); },
    removeItem(key) { data.delete(key); }
  };
  try {
    assert.deepEqual(DEFAULT_HIRED_MARKETPLACE_AGENT_IDS, []);
    assert.equal(isHired("mkt-find-people"), false);
    assert.equal(hireAgent("mkt-lead-miner", { dataScope: ["历史数据"] }), null);

    const contract = hireAgent("mkt-find-people", { dataScope: ["已授权账号"], budget: { daily: 30 }, projectId: "room-demo" });
    assert.equal(contract.agentId, "mkt-find-people");
    assert.equal(getEmployment("mkt-find-people").projectId, "room-demo");
    assert.ok(listHiredAgents().some(({ id }) => id === "mkt-find-people"));
    assert.ok(listRuntimeAgentTypes().includes("mkt-find-people"));
    assert.equal(assignAgentToProject("mkt-find-people", "room-next").projectId, "room-next");
    assert.ok(markEmploymentWelcome("mkt-find-people").welcomeSentAt);
    assert.equal(terminateAgent("mkt-find-people").status, "terminated");
    assert.equal(listHiredAgents().some(({ id }) => id === "mkt-find-people"), false);
  } finally {
    globalThis.localStorage = originalStorage;
  }
});

test("every current Agent carries a complete runtime profile seed", () => {
  const sections = ["identity", "soul", "role", "skills", "tools", "scope", "permission", "budget"];
  for (const agent of MARKETPLACE_AGENTS) {
    const seed = marketplaceProfileSeed(agent.id);
    sections.forEach((section) => assert.ok(seed[section], `${agent.id} missing ${section}`));
    assert.ok(seed.soul.principles.length > 0);
    assert.ok(seed.scope.dataAccess.length > 0);
    assert.ok(seed.permission.approvalRequired.length > 0);
  }
});

test("private-message labels normalize into the conversation capability", () => {
  ["私信回复", "私信承接", "私信客服", "私信自动回复", "私信对话"].forEach((label) => {
    assert.equal(normalizeMarketplaceCapability(label), "私信对话");
  });
});
