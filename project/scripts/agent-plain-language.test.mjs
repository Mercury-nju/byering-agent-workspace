import assert from "node:assert/strict";
import test from "node:test";
import { MARKETPLACE_AGENTS, MARKETPLACE_DISPLAY_NAME_MIGRATIONS } from "../src/salebuddy/agents/marketplace.js";
import { buildOfficeAgentRoster } from "../src/salebuddy/ui/office-agent-runtime.js";
import { displayAgentName, displayAgentTitle, localizeAgentText } from "../src/salebuddy/brand.js";

const names = {
  main: "Byering · 幕僚长",
  "mkt-comment-acquisition": "抖音获客管家",
  "mkt-lead-miner": "评论区找客户",
  "mkt-comment-filter": "按条件筛评论",
  "mkt-douyin-finder": "抖音找人助手",
  "mkt-find-people": "找客专员",
  "mkt-user-research": "找人发问卷",
  "mkt-cold-writer": "潜客触达专员",
  "mkt-dm-inbox": "私信客服",
  "mkt-gold-customer-service": "金牌客服",
  "mkt-live-lead-miner": "直播间找客户",
  "mkt-live-danmaku-analysis": "直播间弹幕分析",
  "mkt-live-danmaku-outreach": "电商直播间未成交客户触达",
  "mkt-viral-work-analysis": "爆款作品分析",
  "mkt-research-expert": "抖音账号分析",
  "mkt-audience-search": "按条件找账号",
  "mkt-network-miner": "粉丝关系分析",
  "mkt-trend-insight": "涨粉趋势分析",
  "mkt-intent-analyst": "客户分析员",
  "mkt-follow-up": "客户跟进提醒",
  "mkt-phone-sdr": "电话邀约准备",
  "mkt-copywriter": "营销文案助手"
};

test("every Agent card uses short, plain-language task names and specific actions", () => {
  assert.equal(MARKETPLACE_AGENTS.length, Object.keys(names).length - 1);
  for (const agent of MARKETPLACE_AGENTS) {
    assert.equal(agent.name, names[agent.id]);
    assert.equal(agent.displayName, agent.name);
    assert.equal(agent.title, agent.name);
    assert.ok(agent.displayTitle.length <= 20, agent.id);
    assert.ok(agent.desc.length <= 75, agent.id);
    assert.equal(agent.skills.length, 3);
    if (!new Set(["mkt-comment-acquisition", "mkt-cold-writer", "mkt-research-expert", "mkt-live-danmaku-outreach"]).has(agent.id)) {
      assert.doesNotMatch([agent.name, agent.displayTitle, agent.desc, ...agent.skills].join(" "), /潜客|画像|触达|承接|核验|交付|跨来源|语义|回执|分层/);
    }
    const migration = MARKETPLACE_DISPLAY_NAME_MIGRATIONS[agent.id];
    if (migration) assert.equal(migration.to, agent.name);
  }
});

test("office labels and generated member profiles use the same card names", () => {
  const officeAgents = MARKETPLACE_AGENTS.filter(({ id }) => Object.hasOwn(names, id));
  const roster = buildOfficeAgentRoster({
    activatedAgents: officeAgents,
    works: officeAgents.map(({ id }) => ({ agentType: id, state: "working" }))
  }).roster;
  for (const agent of roster) assert.equal(agent.name, names[agent.id]);
  for (const agent of MARKETPLACE_AGENTS) assert.equal(agent.profile.identity.name, agent.name);
  for (const agent of MARKETPLACE_AGENTS) {
    assert.equal(displayAgentName({ agentType: agent.id, name: "legacy" }), agent.name);
    assert.equal(displayAgentTitle({ agentType: agent.id }), agent.displayTitle);
    assert.equal(localizeAgentText(agent.name), agent.name);
    assert.equal(localizeAgentText(agent.desc), agent.desc);
  }
  assert.equal(localizeAgentText("客户研究员已完成分析"), "客户分析员已完成分析");
  assert.equal(localizeAgentText("私信运营已完成首轮联系"), "潜客触达专员已完成首轮联系");
});

test("copy distinguishes continuous customer conversations from one-off sending", () => {
  const byId = Object.fromEntries(MARKETPLACE_AGENTS.map(agent => [agent.id, agent]));
  assert.match(byId["mkt-comment-acquisition"].desc, /后续对话/);
  assert.match(byId["mkt-cold-writer"].desc, /首轮私信/);
  assert.match(byId["mkt-phone-sdr"].desc, /准备电话/);
});
