import test from "node:test";
import assert from "node:assert/strict";
import { createOfficeSceneState } from "../src/salebuddy/ui/office-scene-state.js";
import { createOfficeSlotBindings } from "../src/salebuddy/ui/office-character-binding.js";

function fixture() {
  let ticks = 0, executions = 0, idleSchedules = 0, occupantUpdates = 0;
  const actor = { slotIndex: 0, agentType: "main", seatX: 10, seatY: 20, displayContainer: { visible: true },
    reset() { this.resets = (this.resets || 0) + 1; }, teleportTo(x, y) { this.x = x; this.y = y; },
    setStateCategory(category, substate) { this.stateCategory = category; this.subState = substate; },
    playSubStateAnim(name) { this.animation = name; }, showWorkingIdleFrame() { this.animation = "still"; } };
  const scene = { agents: [actor], workstations: [{ setScreenMode(mode) { this.mode = mode; } }],
    pathfinding: { setOccupant() { occupantUpdates++; }, removeOccupant() {} },
    taskSystem: { update() { ticks++; }, execute() { executions++; },
      idleDecision: { scheduleInitialIdleDecision() { idleSchedules++; } } } };
  const bindings = createOfficeSlotBindings(1);
  return { actor, scene, bindings, counts: () => [ticks, executions, idleSchedules, occupantUpdates] };
}

test("native renderer keeps idle activities while blocking native task execution", () => {
  const { actor, scene, bindings, counts } = fixture(); const adapter = createOfficeSceneState();
  bindings.update([{ id: "a", state: "working" }]); adapter.sync({ scene }, bindings);
  assert.equal(actor.stateCategory, "TASK_EXECUTING"); assert.equal(actor.animation, "working");
  assert.equal(actor.x, 10); assert.equal(actor.y, 20);
  scene.taskSystem.update(); scene.taskSystem.execute(); assert.deepEqual(counts(), [1, 0, 0, 0]);
  adapter.sync({ scene }, bindings); assert.equal(actor.resets || 0, 0);
  for (const state of ["listening", "paused", "unknown", "idle", "attention"]) {
    bindings.update([{ id: "a", state }]); adapter.sync({ scene }, bindings);
    assert.equal(actor.stateCategory, "IDLE"); assert.equal(actor.animation, "still");
  }
  assert.equal(actor.resets || 0, 0);
  assert.equal(counts()[2], 1);
  assert.equal(counts()[3], 1);
  adapter.dispose(); scene.taskSystem.update(); scene.taskSystem.execute(); assert.deepEqual(counts(), [2, 1, 1, 1]);
});

test("area switching replaces only visual identity and hides vacant seats", () => {
  const { actor, scene, bindings } = fixture(); const adapter = createOfficeSceneState();
  bindings.update([{ id: "a", state: "working" }, { id: "b", state: "working" }]);
  adapter.sync({ scene }, bindings); bindings.setPage(1); adapter.sync({ scene }, bindings);
  assert.equal(actor.officeAgentId, "b"); assert.equal(actor.agentType, "main");
  bindings.update([]); adapter.sync({ scene }, bindings);
  assert.equal(actor.displayContainer.visible, false);
  adapter.dispose();
});
