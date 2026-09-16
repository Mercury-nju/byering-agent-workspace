import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildOfficeAgentRoster,
  listActivatedOfficeAgents,
  OFFICE_AGENT_SLOTS
} from "../src/salebuddy/ui/office-agent-runtime.js";
import {
  installPixiLegacyRoleLabelFilter,
  isLegacyOfficeNameTexture,
  isLegacyOfficeRoleLabel
} from "../src/salebuddy/office-role-skin.js";

function teamLive(statuses = {}) {
  return {
    getProfiles: () => new Map([
      ["main", { identity: { name: "Byering · 幕僚长" } }],
      ["mkt-comment-acquisition", { identity: { name: "获客专家" } }]
    ]),
    getStatusOf: (id) => statuses[id] || { state: "idle", currentTask: null }
  };
}

test("office always keeps the chief of staff visible and adds only working specialists", () => {
  const result = buildOfficeAgentRoster({
    activatedAgents: [
      { id: "mkt-lead-miner" },
      { id: "mkt-comment-acquisition" },
      { id: "mkt-comment-filter" }
    ],
    works: [
      { agentType: "mkt-comment-acquisition", state: "working", task: "持续分析作品评论", startedAt: 20 },
      { agentType: "mkt-lead-miner", state: "idle", task: "", startedAt: 10 },
      { agentType: "mkt-douyin-finder", state: "working", task: "搜索目标账号", startedAt: 30 }
    ],
    teamLive: teamLive()
  });

  assert.deepEqual(result.seated.map(({ id }) => id), ["main", "mkt-comment-acquisition"]);
  assert.equal(result.seated[0].name, "Byering · 幕僚长");
  assert.equal(result.seated[0].state, "working");
  assert.equal(result.seated[1].task, "持续分析作品评论");
  assert.equal(result.seated[1].name, "抖音获客管家");
  assert.equal(result.roster.some(({ id }) => id === "mkt-douyin-finder"), false);
  assert.equal(result.activeCount, 2);
});

test("office keeps the chief of staff visible when no specialist is working", () => {
  const result = buildOfficeAgentRoster({ activatedAgents: [], works: [] });
  assert.deepEqual(result.roster.map(({ id }) => id), ["main"]);
  assert.equal(result.roster[0].name, "Byering · 幕僚长");
  assert.equal(result.roster[0].state, "working");
  assert.equal(result.activeCount, 1);
});

test("office roster only includes working Agents and keeps overflow reachable", () => {
  const activatedAgents = Array.from({ length: 8 }, (_, index) => ({ id: `agent-${index + 1}` }));
  const works = activatedAgents.map(({ id }) => ({ agentType: id, state: "working", task: `任务 ${id}` }));
  const result = buildOfficeAgentRoster({ activatedAgents, works, teamLive: teamLive(), maxSeats: 3 });
  assert.equal(result.roster.length, 9);
  assert.equal(result.seated.length, 3);
  assert.equal(result.overflow.length, 6);
  assert.deepEqual([...result.seated, ...result.overflow].map(({ id }) => id), result.roster.map(({ id }) => id));
  assert.equal(result.seated[0].id, "main");
});

test("legacy office slot metadata is not used to render the simple video stage", () => {
  const source = readFileSync(new URL("../src/salebuddy/ui/office-agent-runtime.js", import.meta.url), "utf8");
  assert.equal(OFFICE_AGENT_SLOTS.length, 6);
  assert.doesNotMatch(source, /office-character-binding|projectOfficeCharacters|hitOfficeCharacter/);
  assert.match(source, /snapshot\.roster/);
});

test("work errors override idle team status in the office", () => {
  const result = buildOfficeAgentRoster({
    activatedAgents: [{ id: "mkt-dm-inbox" }],
    works: [{ agentType: "mkt-dm-inbox", state: "working", task: "承接新私信", lastError: "授权已失效" }],
    teamLive: teamLive({ "mkt-dm-inbox": { state: "idle" } })
  });
  assert.deepEqual(result.roster.map(({ id }) => id), ["main"]);
  assert.equal(result.activeCount, 1);
});

test("marketplace display names override technical profile ids", () => {
  const live = {
    getProfiles: () => new Map([["mkt-douyin-finder", { identity: { name: "mkt-douyin-finder" } }]]),
    getStatusOf: () => ({ state: "idle", currentTask: null })
  };
  const result = buildOfficeAgentRoster({
    activatedAgents: [{ id: "mkt-douyin-finder" }],
    works: [{ agentType: "mkt-douyin-finder", state: "working" }],
    teamLive: live
  });
  assert.equal(result.seated[1].name, "抖音找人助手");
});

test("office omits an idle Agent instead of rendering an idle card", () => {
  const result = buildOfficeAgentRoster({
    activatedAgents: [{ id: "mkt-douyin-finder" }],
    works: [{ agentType: "mkt-douyin-finder", metadata: { officeStatus: "idle" } }],
    teamLive: teamLive()
  });
  assert.deepEqual(result.roster.map(({ id }) => id), ["main"]);
  assert.equal(result.activeCount, 1);
});

test("office badges show the Agent name above every bound Douyin account", () => {
  const result = buildOfficeAgentRoster({
    activatedAgents: [{ id: "mkt-comment-acquisition" }],
    works: [{ agentType: "mkt-comment-acquisition", state: "working" }],
    accounts: [
      { id: "douyin-a", name: "家居账号", agentIds: ["mkt-comment-acquisition"] },
      { id: "douyin-b", identity: { nickname: "装修账号" }, agentIds: ["mkt-comment-acquisition"] }
    ],
    teamLive: teamLive()
  });

  assert.equal(result.seated[1].name, "抖音获客管家");
  assert.deepEqual(result.seated[1].accountNames, ["家居账号", "装修账号"]);
  assert.equal(result.seated[1].accountLabel, "家居账号、装修账号");
  assert.doesNotMatch(result.seated[1].accountLabel, /找人|分析|功能/);
});

test("office badges compactly summarize more than two Douyin accounts", () => {
  const result = buildOfficeAgentRoster({
    activatedAgents: [{ id: "mkt-comment-acquisition" }],
    works: [{ agentType: "mkt-comment-acquisition", state: "working" }],
    accounts: [
      { id: "douyin-a", name: "账号 A", agentIds: ["mkt-comment-acquisition"] },
      { id: "douyin-b", name: "账号 B", agentIds: ["mkt-comment-acquisition"] },
      { id: "douyin-c", name: "账号 C", agentIds: ["mkt-comment-acquisition"] }
    ],
    teamLive: teamLive()
  });

  assert.equal(result.seated[1].accountLabel, "账号 A、账号 B 等3个账号");
});

test("office activation source matches the enabled Agent Center capabilities", () => {
  assert.deepEqual(listActivatedOfficeAgents().map(({ id, displayName }) => [id, displayName]), [
    ["mkt-comment-acquisition", "抖音获客管家"],
    ["mkt-find-people", "找客专员"],
    ["mkt-intent-analyst", "客户分析员"],
    ["mkt-cold-writer", "潜客触达专员"],
    ["mkt-dm-inbox", "私信客服"],
    ["mkt-gold-customer-service", "金牌客服"],
    ["mkt-live-danmaku-analysis", "直播间弹幕分析"],
    ["mkt-live-danmaku-outreach", "电商直播间未成交客户触达"]
  ]);
});

test("office stage renders one independent video entry per Agent", () => {
  const source = readFileSync(new URL("../src/salebuddy/ui/office-agent-runtime.js", import.meta.url), "utf8");
  assert.match(source, /\.sb-office-agent-stage\{display:grid/);
  assert.match(source, /entries\.get\(agent\.id\)/);
  assert.match(source, /entry\.video\.dataset\.agentId = agent\.id/);
  assert.match(source, /entry\.video\.dataset\.roleKey = roleKey/);
  assert.doesNotMatch(source, /sb-office-area|pageCount|setPage/);
});

test("office badge second line is reserved for the Douyin account", () => {
  const source = readFileSync(new URL("../src/salebuddy/ui/office-agent-runtime.js", import.meta.url), "utf8");
  assert.match(source, /\.sb-office-agent-account/);
  assert.doesNotMatch(source, /\.sb-office-agent-task/);
  assert.match(source, /抖音账号：\$\{agent\.accountLabel\}/);
});

test("office badges use the same Agent Center avatar runtime", () => {
  const source = readFileSync(new URL("../src/salebuddy/ui/office-agent-runtime.js", import.meta.url), "utf8");
  assert.match(source, /mountGrokBotAvatar/);
  assert.match(source, /grokStateForTeamStatus/);
  assert.doesNotMatch(source, /HUMAN_ASSET_URLS|officeAvatarFallbackUrl|mountAgentAvatar/);
});

test("office hides the native branded page title", () => {
  const source = readFileSync(new URL("../src/salebuddy/ui/office-agent-runtime.js", import.meta.url), "utf8");
  assert.match(source, /\.office-dashboard \[class\*="_pageTitleText_"\]\{display:none !important\}/);
});

test("legacy native office role labels are removed before Pixi renders them", () => {
  class TextBase {
    set text(value) { this._text = String(value); }
    get text() { return this._text; }
  }
  class Text extends TextBase {}
  class BitmapTextBase {
    set text(value) { this._text = String(value); }
    get text() { return this._text; }
  }
  class BitmapText extends BitmapTextBase {}
  class Sprite {
    set texture(value) { this._texture = value; }
    get texture() { return this._texture; }
    updateBounds() { this.boundsUpdated = true; }
  }
  const emptyTexture = { label: "EMPTY" };
  const restore = installPixiLegacyRoleLabelFilter({
    workbench: { g: Text, s: BitmapText, c: Sprite, T: { EMPTY: emptyTexture } }
  });
  const legacy = new Text();
  const bitmapLegacy = new BitmapText();
  const current = new Text();
  const legacyNameSprite = new Sprite();
  const nativeAgentSprite = new Sprite();
  const nativeAgentTexture = { source: { resource: { src: "/spritesheet/agent/fc_working.webp" } } };
  legacy.text = "Browser Agent";
  bitmapLegacy.text = "Computer Agent";
  current.text = "获客专家";
  legacyNameSprite.texture = { label: "name_Browser Agent.png" };
  legacyNameSprite.updateBounds();
  nativeAgentSprite.texture = nativeAgentTexture;
  nativeAgentSprite.updateBounds();
  assert.equal(legacy.text, "");
  assert.equal(bitmapLegacy.text, "");
  assert.equal(current.text, "获客专家");
  assert.equal(legacyNameSprite.texture, emptyTexture);
  assert.equal(legacyNameSprite.boundsUpdated, true);
  assert.equal(nativeAgentSprite.texture, nativeAgentTexture);
  assert.equal(nativeAgentSprite.boundsUpdated, true);
  assert.equal(isLegacyOfficeNameTexture({ source: { label: "name_File Agent.png" } }), true);
  assert.equal(isLegacyOfficeRoleLabel("Marvis"), true);
  restore();
});
