import assert from "node:assert/strict";
import test from "node:test";

import { MARKETPLACE_AGENTS, MARKETPLACE_CATEGORIES, marketplaceProfileSeed, hireAgent, terminateAgent, assignAgentToProject, getEmployment, listHiredAgents, markEmploymentWelcome } from "../src/salebuddy/agents/marketplace.js";
import { CUSTOMER_DOMAIN_LABELS, CUSTOMER_DOMAIN_ORDER } from "../src/salebuddy/business/customer-domains.js";
import { listRuntimeAgentTypes } from "../src/salebuddy/agents/registry.js";

const EXPECTED_DESCRIPTIONS = {
  "mkt-lead-miner": "根据目标客户画像，从公开网页、企业信息和地图线索中筛选潜在客户，整理公司与联系人线索，并保留来源证据。",
  "mkt-market-scout": "持续收集行业、竞品和招标动态，去重后按主题整理成可追踪的情报简报。",
  "mkt-cold-writer": "基于客户画像和业务场景生成首触邮件与私信，提供可对照的 A/B 版本，不代替发送。",
  "mkt-follow-up": "按客户阶段和上次触达结果安排下一步，维护提醒与丢单预警，输出可执行的跟进计划。",
  "mkt-phone-sdr": "根据客户类型生成外呼脚本和异议应答，整理通话记录并按意向分级，供销售继续跟进。",
  "mkt-copywriter": "将业务素材整理成公众号、朋友圈和案例初稿，按渠道调整结构与语气，并附发布日历。",
  "mkt-designer": "按品牌色、尺寸和版式规范整理海报、产品图和报价单视觉稿，输出可编辑素材。",
  "mkt-private-op": "围绕社群目标制定运营 SOP、朋友圈节奏和裂变活动方案，标注执行步骤与风险。",
  "mkt-cs-manager": "根据使用与反馈记录安排新客引导、续约提醒和满意度回访，识别需要人工介入的客户。",
  "mkt-quote": "根据已确认的产品与价格生成报价单和合同初稿，标注缺失信息与高风险条款，不替代法务审核。",
  "mkt-data-analyst": "汇总销售数据并统一统计口径，分析漏斗、业绩归因和周期变化，输出有依据的周报与看板。",
  "mkt-bid": "跟踪符合条件的招标信息，按截止时间整理标书任务与资质材料，产出标书初稿和标讯简报。"
};

test("marketplace agent descriptions state concrete scope and boundaries", () => {
  assert.equal(MARKETPLACE_AGENTS.length, Object.keys(EXPECTED_DESCRIPTIONS).length);
  for (const agent of MARKETPLACE_AGENTS) {
    assert.equal(agent.desc, EXPECTED_DESCRIPTIONS[agent.id], `${agent.id} description drifted`);
    assert.ok(agent.desc.length >= 28, `${agent.id} description is too vague`);
  }
});

test("Agent Square categories use the canonical Pro-C customer domains", () => {
  assert.deepEqual(
    MARKETPLACE_CATEGORIES,
    CUSTOMER_DOMAIN_ORDER.map((id) => CUSTOMER_DOMAIN_LABELS[id])
  );
  const validDomains = new Set(MARKETPLACE_CATEGORIES);
  for (const agent of MARKETPLACE_AGENTS) {
    assert.ok(agent.domains?.length, `${agent.id} must declare customer domains`);
    assert.ok(agent.domains.includes(agent.category), `${agent.id} primary domain must be included`);
    for (const domain of agent.domains) assert.ok(validDomains.has(domain), `${agent.id} has unknown domain ${domain}`);
  }
  assert.ok(MARKETPLACE_AGENTS.some((agent) => agent.domains.includes("招聘猎头")), "recruiting must have discoverable agents");
  assert.ok(MARKETPLACE_AGENTS.some((agent) => agent.domains.includes("教育培训")), "education must have discoverable agents");
  assert.ok(MARKETPLACE_AGENTS.some((agent) => agent.domains.includes("录音总结")), "recording must have discoverable agents");
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
