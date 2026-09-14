/**
 * Auth boundary for the visual page. Native clients keep ownership of the
 * actual credential flow; browser previews can provide an explicit API adapter.
 */
export function createAuthAdapter({
  windowRef = globalThis.window,
  api = globalThis.__SALEBUDDY_CONFIG__?.authApi
} = {}) {
  async function requestCode(payload) {
    if (typeof api?.requestCode === "function") return api.requestCode(payload);
    return { status: "native_required" };
  }

  async function login(payload) {
    if (typeof api?.login === "function") return api.login(payload);
    if (typeof windowRef?.marvis?.login === "function") {
      windowRef.marvis.login();
      return { status: "native_opened" };
    }
    return { status: "unavailable" };
  }

  return Object.freeze({ requestCode, login });
}
