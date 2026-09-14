import { CAPABILITY_PROBE_STATES } from "./acquisition-contract.js";

export const ACQUISITION_CAPABILITIES = Object.freeze({
  COMMENT_ACQUISITION: "commentAcquisition",
  LIVE_ACQUISITION: "liveAcquisition",
  COMMENT_PUBLIC_REPLY: "commentPublicReply"
});

const DEFAULT_READINESS = Object.freeze({ visible: true, hireable: false, startable: false });

export const ACQUISITION_CAPABILITY_PROBE_KEY = "salebuddy:acquisitionCapabilityProbes";
const KNOWN_CAPABILITIES = new Set(Object.values(ACQUISITION_CAPABILITIES));

export function readPersistedCapabilityProbe(capability) {
  if (!KNOWN_CAPABILITIES.has(capability)) return null;
  try {
    const raw = globalThis.localStorage?.getItem(ACQUISITION_CAPABILITY_PROBE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const probes = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    return probes?.[capability] || null;
  } catch {
    return null;
  }
}

export function persistCapabilityProbe(capability, probe) {
  if (!KNOWN_CAPABILITIES.has(capability)) throw new Error(`Unknown acquisition capability: ${capability}`);
  const state = probe?.state || probe?.status;
  if (!Object.values(CAPABILITY_PROBE_STATES).includes(state)) throw new Error(`Invalid capability probe state: ${state}`);
  const value = { ...probe, state, status: state, executorReady: probe?.executorReady === true };
  const current = (() => {
    try {
      const parsed = JSON.parse(globalThis.localStorage?.getItem(ACQUISITION_CAPABILITY_PROBE_KEY) || "{}");
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch { return {}; }
  })();
  current[capability] = value;
  try {
    if (!globalThis.localStorage?.setItem) throw new Error("localStorage is unavailable");
    globalThis.localStorage.setItem(ACQUISITION_CAPABILITY_PROBE_KEY, JSON.stringify(current));
  } catch (error) {
    throw new Error(`Capability probe persistence failed: ${error?.message || "storage write failed"}`);
  }
  return value;
}
export const updateCapabilityProbe = persistCapabilityProbe;

export function getAcquisitionCardAction(capability, probe) {
  const readiness = getAcquisitionCapabilityReadiness(capability, probe);
  return { ...readiness, action: readiness.startable ? "open" : "blocked", label: readiness.startable ? "立即使用" : "暂未开通" };
}

export function getAcquisitionCapabilityReadiness(capability, probe = readPersistedCapabilityProbe(capability)) {
  if (!KNOWN_CAPABILITIES.has(capability)) return { ...DEFAULT_READINESS };
  if (capability === ACQUISITION_CAPABILITIES.COMMENT_ACQUISITION) {
    return { visible: true, hireable: true, startable: true };
  }
  const runnerReady = probe?.executorReady === true;
  const passed = probe?.state === CAPABILITY_PROBE_STATES.PASSED || probe?.status === CAPABILITY_PROBE_STATES.PASSED;
  return runnerReady && passed ? { visible: true, hireable: true, startable: true } : { ...DEFAULT_READINESS };
}

export function isAcquisitionCapabilityReady(capability, probe) {
  return getAcquisitionCapabilityReadiness(capability, probe).startable;
}
