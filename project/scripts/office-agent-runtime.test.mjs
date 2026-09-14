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

test("office mirrors the activated Agent Center team and ignores work-only agents", () => {
  const result = buildOfficeAgentRoster({
    activatedAgents: [
      { id: "mkt-lead-miner" },
      { id: "mkt-comment-acquisition" },
      { id: "mkt-comment-filter" }
    ],
    works: [
      { agentType: "mkt-comment-acquisition", state: "working", task: "持续分析作品评论", startedAt: 20 },
      { agentType: "mkt-douyin-finder", state: "working", task: "搜索目标账号", startedAt: 30 }
    ],
    teamLive: teamLive()
  });

  assert.deepEqual(result.seated.map(({ id }) => id), [
    "mkt-comment-acquisition",
    "mkt-lead-miner",
    "mkt-comment-filter"
  ]);
  assert.equal(result.seated[0].task, "持续分析作品评论");
  assert.equal(result.seated[0].name, "获客专家");
  assert.equal(result.roster.some(({ id }) => id === "main"), false);
  assert.equal(result.roster.some(({ id }) => id === "mkt-douyin-finder"), false);
  assert.equal(result.activeCount, 1);
});

test("office exposes overflow agents while keeping six physical seats", () => {
  const activatedAgents = Array.from({ length: 8 }, (_, index) => ({ id: `agent-${index + 1}` }));
  const result = buildOfficeAgentRoster({ activatedAgents, teamLive: teamLive() });
  assert.equal(OFFICE_AGENT_SLOTS.length, 6);
  assert.equal(result.seated.length, 6);
  assert.equal(result.overflow.length, 2);
  assert.equal(result.roster.length, 8);
});

test("office slots follow native actor order without hardcoded label coordinates", () => {
  assert.deepEqual(OFFICE_AGENT_SLOTS.map(slot => slot.nativeType), ["main", "App Agent", "Computer Agent", "Browser Agent", "File Agent", "Search Agent"]);
  assert.ok(OFFICE_AGENT_SLOTS.every(slot => !("left" in slot) && !("top" in slot)));
});

test("work errors override idle team status in the office", () => {
  const result = buildOfficeAgentRoster({
    activatedAgents: [{ id: "mkt-dm-inbox" }],
    works: [{ agentType: "mkt-dm-inbox", state: "working", task: "承接新私信", lastError: "授权已失效" }],
    teamLive: teamLive({ "mkt-dm-inbox": { state: "idle" } })
  });
  assert.equal(result.seated[0].state, "blocked");
  assert.equal(result.seated[0].stateLabel, "账号已掉线");
});

test("marketplace display names override technical profile ids", () => {
  const live = {
    getProfiles: () => new Map([["mkt-douyin-finder", { identity: { name: "mkt-douyin-finder" } }]]),
    getStatusOf: () => ({ state: "idle", currentTask: null })
  };
  const result = buildOfficeAgentRoster({ activatedAgents: [{ id: "mkt-douyin-finder" }], teamLive: live });
  assert.equal(result.seated[0].name, "抖音找人助手");
});

test("office labels an agent without work as idle", () => {
  const result = buildOfficeAgentRoster({
    activatedAgents: [{ id: "mkt-douyin-finder" }],
    works: [{ agentType: "mkt-douyin-finder", metadata: { officeStatus: "idle" } }],
    teamLive: teamLive()
  });
  assert.equal(result.seated[0].state, "idle");
  assert.equal(result.seated[0].stateLabel, "空闲中");
});

test("office activation source matches the enabled Agent Center capabilities", () => {
  assert.deepEqual(listActivatedOfficeAgents().map(({ id, displayName }) => [id, displayName]), [
    ["mkt-comment-acquisition", "获客专家"],
    ["mkt-find-people", "找客专员"],
    ["mkt-intent-analyst", "客户分析员"],
    ["mkt-cold-writer", "潜客触达专员"],
    ["mkt-dm-inbox", "私信客服"]
  ]);
});

test("office area switcher only shows the area name, not notification counts", () => {
  const source = readFileSync(new URL("../src/salebuddy/ui/office-agent-runtime.js", import.meta.url), "utf8");
  assert.match(source, /button\.textContent = `办公区 \$\{page \+ 1\}`/);
  assert.doesNotMatch(source, /位工作中|位需处理/);
  assert.match(source, /\.sb-office-area\{[^}]*min-width:88px[^}]*text-align:center/);
});

test("office area switcher is centered in the office canvas instead of tracking its right edge", () => {
  const source = readFileSync(new URL("../src/salebuddy/ui/office-agent-runtime.js", import.meta.url), "utf8");
  assert.match(source, /\.sb-office-areas\{[^}]*left:50%[^}]*right:auto[^}]*transform:translateX\(-50%\)/);
  assert.doesNotMatch(source, /\.sb-office-areas\{[^}]*right:12px/);
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
