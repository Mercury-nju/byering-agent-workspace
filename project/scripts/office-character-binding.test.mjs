import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createOfficeSlotBindings, projectOfficeCharacters, hitOfficeCharacter } from "../src/salebuddy/ui/office-character-binding.js";

function fixture() {
  const sprite = { visible: true, worldVisible: true, getBounds: () => ({ x: 400, y: 200, width: 80, height: 120 }) };
  const actor = { agentType: "Computer Agent", slotIndex: 2, displayContainer: { visible: true, worldVisible: true }, animSprite: sprite };
  const canvas = { getBoundingClientRect: () => ({ left: 100, top: 50, width: 500, height: 400 }) };
  const game = { app: { canvas, renderer: { screen: { width: 1000, height: 800 } } }, scene: { agents: [actor], workstations: [] } };
  const roster = ["mkt-comment-acquisition", "mkt-lead-miner", "mkt-comment-filter"].map(id => ({ id, name: id, state: "idle" }));
  return { game, actor, sprite, roster };
}

test("labels use actual sprite bounds and canvas scaling, not a workstation percentage", () => {
  const { game, roster, sprite } = fixture();
  const bindings = createOfficeSlotBindings(); bindings.update(roster);
  const [label] = projectOfficeCharacters(game, bindings, { left: 80, top: 40 });
  assert.equal(label.agent.id, "mkt-comment-filter");
  assert.equal(label.left, 240);
  assert.equal(label.top, 102);
  sprite.getBounds = () => ({ x: 100, y: 350, width: 80, height: 120 });
  const moved = projectOfficeCharacters(game, bindings, { left: 80, top: 40 })[0];
  assert.equal(moved.left, 90); assert.equal(moved.top, 177);
});

test("offstage actors have no floating label even when their workstation exists", () => {
  const { game, roster, actor } = fixture();
  const bindings = createOfficeSlotBindings(); bindings.update(roster);
  actor.displayContainer.visible = false;
  assert.equal(projectOfficeCharacters(game, bindings).length, 0);
});

test("sorting changes and newly activated agents cannot rename existing characters", () => {
  const { roster } = fixture(); const bindings = createOfficeSlotBindings(); bindings.update(roster);
  bindings.update([{ id: "new-agent" }, ...roster.slice().reverse()]);
  assert.equal(bindings.at(2).id, "mkt-comment-filter");
  assert.equal(bindings.at(0).id, "mkt-comment-acquisition");
  assert.equal(bindings.at(3).id, "new-agent");
});

test("clicking a character resolves the same business Agent as its label", () => {
  const { game, roster } = fixture(); const bindings = createOfficeSlotBindings(); bindings.update(roster);
  assert.equal(hitOfficeCharacter(game, bindings, 320, 180)?.id, "mkt-comment-filter");
  assert.equal(hitOfficeCharacter(game, bindings, 110, 60), null);
});

test("missing canvas or actor data never falls back to floating percentage labels", () => {
  assert.deepEqual(projectOfficeCharacters(null, createOfficeSlotBindings()), []);
  const { game, roster, sprite } = fixture(); const bindings = createOfficeSlotBindings(); bindings.update(roster);
  sprite.getBounds = () => ({ x: NaN, y: 1, width: 2, height: 2 });
  assert.deepEqual(projectOfficeCharacters(game, bindings), []);
});

test("zoom and host resizing project labels using logical renderer size, not canvas pixel density", () => {
  const { game, roster } = fixture(); const bindings = createOfficeSlotBindings(); bindings.update(roster);
  game.app.canvas.width = 2000;
  game.app.canvas.getBoundingClientRect = () => ({ left: 200, top: 60, width: 1000, height: 800 });
  const [label] = projectOfficeCharacters(game, bindings, { left: 200, top: 60 });
  assert.equal(label.left, 440); assert.equal(label.top, 192);
});

test("workstation clicks and walking characters retain their shared slot identity", () => {
  const { game, roster, actor } = fixture(); const bindings = createOfficeSlotBindings(); bindings.update(roster);
  actor.displayContainer.visible = false;
  game.scene.workstations = [{ slotIndex: 2, computerContainer: { getBounds: () => ({ x: 600, y: 400, width: 80, height: 50 }) } }];
  assert.equal(hitOfficeCharacter(game, bindings, 410, 260)?.id, "mkt-comment-filter");
  bindings.update(roster.filter(agent => agent.id !== "mkt-comment-filter"));
  assert.equal(hitOfficeCharacter(game, bindings, 410, 260), null);
});

test("office runtime renders independent Agent video stages without scene projection", () => {
  const runtime = readFileSync(new URL("../src/salebuddy/ui/office-agent-runtime.js", import.meta.url), "utf8");
  assert.match(runtime, /function createOfficeStage/);
  assert.match(runtime, /data-sb-office-simple-host/);
  assert.match(runtime, /dataset\.agentId/);
  assert.match(runtime, /dataset\.roleKey/);
  assert.match(runtime, /roleVideoUrlsFor/);
  assert.doesNotMatch(runtime, /projectOfficeCharacters|hitOfficeCharacter|createOfficeSceneState|requestAnimationFrame/);
  assert.match(runtime, /createOfficeWorkspace/);
  const cloud = readFileSync(new URL("../src/salebuddy/ui/cloud-desktop.js", import.meta.url), "utf8");
  assert.match(cloud, /sbOfficeIdentityOwned === "1"\) return/);
});
