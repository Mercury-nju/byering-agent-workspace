/**
 * Customer-facing brand projection. Technical salebuddy/marvis identifiers stay unchanged.
 */

export const BRAND = Object.freeze({
  name: "Byering",
  mainAgent: "Byering · 幕僚长",
  slogan: "为线索而生，为转化而造。你的增长伙伴，越用越懂业务。",
  office: "Byering办公室",
  official: "Byering 官方",
  migration: "byering-v1"
});

export const LEGACY_BRAND_ALIASES = Object.freeze({
  SaleBuddy: BRAND.name,
  Marvis: BRAND.name,
  "SaleBuddy · 幕僚长": BRAND.mainAgent,
  "Marvis · 幕僚长": BRAND.mainAgent,
  "Marvis(马维斯)": "Byering(幕僚长)"
});

const MAIN_ALIASES = new Set([
  "SaleBuddy",
  "Marvis",
  "SaleBuddy · 幕僚长",
  "Marvis · 幕僚长",
  "Marvis(马维斯)"
]);

function clone(value) {
  return value == null ? value : structuredClone(value);
}

export function projectBrandName(value) {
  if (typeof value !== "string") return value;
  return Object.prototype.hasOwnProperty.call(LEGACY_BRAND_ALIASES, value)
    ? LEGACY_BRAND_ALIASES[value]
    : value;
}

export function displayAgentName(agent = {}) {
  if (agent?.agentType === "main") return BRAND.mainAgent;
  const value = agent?.name || agent?.identity?.name || agent;
  return projectBrandName(value);
}

export function displayCreatedBy(value, context = {}) {
  if (context?.agentType === "main") return BRAND.mainAgent;
  return projectBrandName(value);
}

export function projectMessage(message) {
  const next = clone(message);
  if (!next || typeof next !== "object") return next;
  if (next.from === "main") next.fromName = BRAND.mainAgent;
  else if (typeof next.fromName === "string") next.fromName = projectBrandName(next.fromName);
  return next;
}

export function migrateMainProfile(profile) {
  const next = clone(profile);
  if (!next || next.agentType !== "main") return next;
  if (next.meta?.brandMigration === BRAND.migration) return next;

  const identityName = next.identity?.name;
  const rolePosition = next.role?.position;
  const shouldMigrate = MAIN_ALIASES.has(identityName) || MAIN_ALIASES.has(rolePosition);
  if (!shouldMigrate) return next;

  next.identity = { ...(next.identity || {}) };
  next.role = { ...(next.role || {}) };
  next.meta = { ...(next.meta || {}) };
  if (MAIN_ALIASES.has(identityName)) next.identity.name = BRAND.mainAgent;
  if (MAIN_ALIASES.has(rolePosition)) next.role.position = BRAND.mainAgent;
  next.meta.brandMigration = BRAND.migration;
  return next;
}
