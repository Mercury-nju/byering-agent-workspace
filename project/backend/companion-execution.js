import { COMPANION_SETTINGS } from "../src/salebuddy/agents/companion.js";

const isRecord = value => Boolean(value && typeof value === "object" && !Array.isArray(value));

// The caller must obtain companionContext from the authenticated owner's store,
// never from the request body. Request preferences cannot establish trust.
export function applyCompanionExecution(input = {}, companionContext = null) {
  const next = { ...(isRecord(input) ? input : {}) };
  delete next.companionPreferences;
  if (!isRecord(companionContext)) return next;
  const source = isRecord(companionContext.settings) ? companionContext.settings : {};
  const settings = {};
  for (const key of ["tone", "detail", "ranking"]) {
    if (Object.hasOwn(source, key) && COMPANION_SETTINGS[key].includes(source[key])) settings[key] = source[key];
  }
  next.companionPreferences = {
    revision: Number.isSafeInteger(companionContext.revision) && companionContext.revision >= 0 ? companionContext.revision : 0,
    settings,
    context: typeof companionContext.context === "string" ? companionContext.context.slice(0, 1600) : ""
  };
  return next;
}
