import { DOUYIN_ACQUISITION_ACTIVE_AGENT_IDS } from "../agents/marketplace.js";

export const ONBOARDING_COMPLETED_KEY = "byering-onboarding-completed";
export const ONBOARDING_FIRST_AGENT_KEY = "byering-onboarding-first-agent";

const ONBOARDING_EXECUTABLE_AGENT_IDS = new Set(DOUYIN_ACQUISITION_ACTIVE_AGENT_IDS);

function readStorage(storage, key) {
  try {
    return storage?.getItem?.(key) || "";
  } catch {
    return "";
  }
}

function writeStorage(storage, key, value) {
  try {
    storage?.setItem?.(key, value);
    return true;
  } catch {
    return false;
  }
}

export function hasCompletedOnboarding(storage = globalThis.localStorage) {
  return readStorage(storage, ONBOARDING_COMPLETED_KEY) === "1";
}

export function markOnboardingCompleted(storage = globalThis.localStorage) {
  return writeStorage(storage, ONBOARDING_COMPLETED_KEY, "1");
}

export function onboardingRoute() {
  return "?page=onboarding";
}

export function routeAfterAuthentication(storage = globalThis.localStorage, { isNewUser = null } = {}) {
  if (isNewUser === true) return onboardingRoute();
  if (isNewUser === false) return "?page=agent-square";
  return hasCompletedOnboarding(storage) ? "?page=agent-square" : onboardingRoute();
}

export function routeAfterOnboarding(agentId = null) {
  const params = new URLSearchParams({ page: "agent-square", onboarding: "complete" });
  if (ONBOARDING_EXECUTABLE_AGENT_IDS.has(String(agentId || "").trim())) params.set("agent", agentId);
  return `?${params}`;
}
