/** Stable seats across office areas; only idle occupants can yield to new work. */
export function createOfficeSlotBindings(limit = 6) {
  const ids = Array(limit).fill(null);
  let agents = new Map();
  let page = 0;
  const active = id => ["working", "listening", "attention", "blocked", "paused"].includes(agents.get(id)?.state);
  return {
    update(roster, { selectedId = null } = {}) {
      agents = new Map(roster.map(agent => [agent.id, agent]));
      ids.forEach((id, index) => { if (!agents.has(id)) ids[index] = null; });
      for (const agent of roster) {
        if (ids.includes(agent.id)) continue;
        const vacant = ids.indexOf(null);
        if (vacant < 0) ids.push(agent.id);
        else ids[vacant] = agent.id;
      }
      for (let index = limit; index < ids.length; index++) {
        if (!active(ids[index]) || ids[index] === selectedId) continue;
        const vacant = ids.findIndex((id, seat) => seat < Math.floor(index / limit) * limit && id !== selectedId && !active(id));
        if (vacant >= 0) [ids[vacant], ids[index]] = [ids[index], ids[vacant]];
      }
      while (ids.length > limit && !ids.at(-1)) ids.pop();
      page = Math.min(page, Math.ceil(ids.length / limit) - 1);
    },
    at: index => agents.get(ids[page * limit + index]) || null,
    get page() { return page; },
    get pageCount() { return Math.max(1, Math.ceil(ids.length / limit)); },
    setPage(value) { page = Math.max(0, Math.min(Math.floor(Number(value) || 0), Math.ceil(ids.length / limit) - 1)); },
    pageOf: id => ids.includes(id) ? Math.floor(ids.indexOf(id) / limit) : -1,
    area: index => ids.slice(index * limit, (index + 1) * limit).map(id => agents.get(id)).filter(Boolean)
  };
}

function frame(game) {
  const canvas = game?.app?.canvas;
  const rect = canvas?.getBoundingClientRect?.();
  const screen = game?.app?.renderer?.screen || game?.app?.screen;
  if (!rect?.width || !rect?.height || !screen?.width || !screen?.height) return null;
  return { rect, sx: rect.width / screen.width, sy: rect.height / screen.height };
}

function clientBounds(container, view) {
  if (!container || container.destroyed || container.visible === false || container.worldVisible === false || container.worldAlpha === 0) return null;
  const bounds = container.getBounds?.();
  if (!bounds) return null;
  const x = bounds.x ?? bounds.minX, y = bounds.y ?? bounds.minY;
  const width = bounds.width ?? bounds.maxX - bounds.minX, height = bounds.height ?? bounds.maxY - bounds.minY;
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  return { left: view.rect.left + x * view.sx, top: view.rect.top + y * view.sy, width: width * view.sx, height: height * view.sy };
}

export function projectOfficeCharacters(game, bindings, hostRect = { left: 0, top: 0 }) {
  const view = frame(game);
  if (!view) return [];
  return (game.scene?.agents || []).flatMap(actor => {
    const agent = bindings.at(actor.slotIndex);
    if (!agent || actor.displayContainer?.visible === false || actor.displayContainer?.worldVisible === false || actor.displayContainer?.worldAlpha === 0) return [];
    const bounds = clientBounds(actor.animSprite || actor.bodyContainer || actor.displayContainer, view);
    if (!bounds || bounds.left + bounds.width < view.rect.left || bounds.left > view.rect.left + view.rect.width || bounds.top + bounds.height < view.rect.top || bounds.top > view.rect.top + view.rect.height) return [];
    return [{ agent, slotIndex: actor.slotIndex, nativeType: actor.agentType, bounds,
      left: bounds.left + bounds.width / 2 - hostRect.left,
      top: bounds.top - hostRect.top - 8
    }];
  });
}

export function hitOfficeCharacter(game, bindings, x, y) {
  const contains = b => x >= b.left && x <= b.left + b.width && y >= b.top && y <= b.top + b.height;
  const characters = projectOfficeCharacters(game, bindings);
  const actor = characters.slice().reverse().find(item => contains(item.bounds));
  if (actor) return actor.agent;
  const view = frame(game);
  if (!view) return null;
  for (const station of game.scene?.workstations || []) {
    const agent = bindings.at(station.slotIndex);
    if (!agent) continue;
    for (const node of [station.computerContainer, station.deskContainer]) {
      const bounds = clientBounds(node, view);
      if (bounds && contains(bounds)) return agent;
    }
  }
  return null;
}
