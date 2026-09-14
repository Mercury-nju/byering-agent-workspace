/** Keep native idle-life scheduling alive while blocking native demo task execution. */
export function createOfficeSceneState() {
  let scene = null, originals = null;
  const applied = new Map();
  const noNativeTaskExecution = () => {};
  function detach() {
    if (scene?.taskSystem && originals) {
      if (scene.taskSystem.execute === noNativeTaskExecution) scene.taskSystem.execute = originals.execute;
      for (const actor of scene.agents || []) delete actor.officeAgentId;
    }
    scene = null; originals = null; applied.clear();
  }
  function sync(game, bindings) {
    const next = game?.scene;
    if (!next?.agents?.length || !next.taskSystem) { detach(); return false; }
    if (next !== scene) {
      detach(); scene = next;
      originals = { execute: scene.taskSystem.execute };
      // taskSystem.update drives the native idle decision loop (coffee, treadmill,
      // conversations, sleep). Only the native command executor must be isolated.
      scene.taskSystem.execute = noNativeTaskExecution;
    }
    for (const actor of scene.agents) {
      const agent = bindings.at(actor.slotIndex);
      const agentId = agent?.id || null;
      const state = agent?.state || "idle";
      const category = !agent ? "OFFSTAGE" : agent.state === "working" ? "TASK_EXECUTING" : "IDLE";
      const previous = applied.get(actor);
      const visible = Boolean(agent);
      const identityChanged = previous?.agentId !== agentId;
      const categoryChanged = previous?.category !== category;
      const visibilityChanged = previous?.visible !== visible;
      const stateChanged = previous?.state !== state;
      if (!identityChanged && !categoryChanged && !visibilityChanged && !stateChanged) continue;

      actor.officeAgentId = agentId;
      if (identityChanged || categoryChanged || visibilityChanged) {
        // Native actors own their animation lifecycle. Resetting them from the
        // overlay interrupts an in-flight idle action and makes the scene jump.
        actor.teleportTo(actor.seatX, actor.seatY);
        actor.isInWorkstation = true;
        actor.displayContainer.visible = visible;
        actor.setStateCategory(category, !agent ? "OFFSTAGE" : agent.state === "working" ? "WORKING" : "STANDBY");
        if (agent?.state === "working") actor.playSubStateAnim("working", true);
        else if (agent) {
          actor.showWorkingIdleFrame();
          next.pathfinding?.setOccupant?.(actor.agentType, actor.x, actor.y);
          // Actors that were originally offstage do not have a native idle
          // decision queued. Register them only when they actually enter idle.
          next.taskSystem.idleDecision?.scheduleInitialIdleDecision?.(actor);
        }
        scene.workstations?.[actor.slotIndex]?.setScreenMode?.(agent?.state === "working" ? "WORKING" : "IDLE", actor.agentType);
        if (!agent) next.pathfinding?.removeOccupant?.(actor.agentType);
      }
      applied.set(actor, { agentId, state, category, visible });
    }
    return true;
  }
  return { sync, dispose: detach };
}
