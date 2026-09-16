const OFFICE_ASSET_ROOT = new URL("../../../assets/office-characters/", import.meta.url);

// These keys identify visual packs only; they never encode Agent business roles.
export const OFFICE_ROLE_KEYS = Object.freeze([
  "role-1",
  "role-2",
  "role-3",
  "role-4"
]);

const ROLE_ASSET_DIRS = Object.freeze({
  "role-1": "role-1",
  "role-2": "role-2",
  "role-3": "role-3",
  "role-4": "role-4"
});

function assetUrl(roleKey, phase, index) {
  const filename = `${String(index).padStart(2, "0")}.mp4`;
  return new URL(`${ROLE_ASSET_DIRS[roleKey]}/${phase}/${filename}`, OFFICE_ASSET_ROOT).href;
}

function buildRolePack(roleKey, workingCount, restingCount = workingCount) {
  return Object.freeze({
    working: Object.freeze(Array.from({ length: workingCount }, (_, index) => assetUrl(roleKey, "working", index + 1))),
    resting: Object.freeze(Array.from({ length: restingCount }, (_, index) => assetUrl(roleKey, "resting", index + 1)))
  });
}

export const OFFICE_ROLE_VIDEO_CATALOG = Object.freeze({
  "role-1": Object.freeze({
    working: Object.freeze([assetUrl("role-1", "working", 1)]),
    resting: Object.freeze([])
  }),
  "role-2": buildRolePack("role-2", 5),
  "role-3": buildRolePack("role-3", 5),
  "role-4": buildRolePack("role-4", 5)
});

export function allOfficeRoleVideoUrls() {
  return [...new Set(Object.values(OFFICE_ROLE_VIDEO_CATALOG)
    .flatMap((pack) => [...pack.working, ...pack.resting]))];
}

function randomIndex(length, random) {
  if (length <= 1) return 0;
  const value = Number(random?.());
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(length - 1, Math.floor(value * length)));
}

function rolePool(roleKey, state) {
  const pack = OFFICE_ROLE_VIDEO_CATALOG[roleKey] || OFFICE_ROLE_VIDEO_CATALOG[OFFICE_ROLE_KEYS[0]];
  if (state === "resting" && pack.resting.length) return pack.resting;
  return pack.working;
}

export function roleVideoUrlsFor(roleKey, state = "working", { random = Math.random } = {}) {
  const pool = rolePool(roleKey, state);
  return pool.length ? [pool[randomIndex(pool.length, random)]] : [];
}

export function createOfficeRoleBindings({ random = Math.random } = {}) {
  const roleByAgentId = new Map();
  const usedRoleKeys = new Set();

  function assign(roster = []) {
    for (const agent of roster) {
      const agentId = String(agent?.id || "").trim();
      if (!agentId || roleByAgentId.has(agentId)) continue;

      const available = OFFICE_ROLE_KEYS.filter(roleKey => !usedRoleKeys.has(roleKey));
      const roleKey = available.length
        ? available[0]
        : OFFICE_ROLE_KEYS[randomIndex(OFFICE_ROLE_KEYS.length, random)];
      roleByAgentId.set(agentId, roleKey);
      usedRoleKeys.add(roleKey);
    }
    return roster.map(agent => ({ ...agent, roleKey: roleByAgentId.get(agent?.id) || null }));
  }

  return {
    assign,
    get: agentId => roleByAgentId.get(String(agentId || "")) || null,
    has: agentId => roleByAgentId.has(String(agentId || "")),
    clear() {
      roleByAgentId.clear();
      usedRoleKeys.clear();
    }
  };
}
