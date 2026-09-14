const LEGACY_OFFICE_PILOT_SW = "office-pilot-sw.js";

async function removeLegacyOfficePilotServiceWorker() {
  const serviceWorker = globalThis.navigator?.serviceWorker;
  if (!serviceWorker?.getRegistrations) return false;
  try {
    const registrations = await serviceWorker.getRegistrations();
    const legacyRegistrations = registrations.filter((registration) => [
      registration.active,
      registration.waiting,
      registration.installing
    ].some((worker) => worker?.scriptURL?.includes(LEGACY_OFFICE_PILOT_SW)));
    const controlledByLegacyPilot = serviceWorker.controller?.scriptURL?.includes(LEGACY_OFFICE_PILOT_SW) === true;
    await Promise.all(legacyRegistrations.map((registration) => registration.unregister()));
    return controlledByLegacyPilot;
  } catch {
    return false;
  }
}

const legacyPilotWasControlling = await removeLegacyOfficePilotServiceWorker();
const legacyPilotReloadKey = "byering-office-pilot-cleanup-reloaded";
if (legacyPilotWasControlling && !globalThis.sessionStorage?.getItem(legacyPilotReloadKey)) {
  globalThis.sessionStorage?.setItem(legacyPilotReloadKey, "1");
  globalThis.location?.reload();
  await new Promise(() => {});
}
globalThis.sessionStorage?.removeItem(legacyPilotReloadKey);

async function registerOfficeAssetWorker() {
  const serviceWorker = globalThis.navigator?.serviceWorker;
  if (!serviceWorker?.register || !/^https?:$/.test(globalThis.location?.protocol || "")) return null;
  try {
    return await serviceWorker.register("./office-assets-sw.js", { scope: "./" });
  } catch (error) {
    console.warn("[Byering] office asset cache unavailable", error);
    return null;
  }
}

void registerOfficeAssetWorker();

await import("../../browser-shim.js?v=20260914-business-memory-demo-1");
await import("../../assets/main-BaWVt8Sl.js");
await import("./index.js?v=20260914-grid-alignment-1");
