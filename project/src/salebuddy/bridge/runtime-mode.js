/** Runtime mode is explicit: production local by default, mock only by opt-in. */
export const RUNTIME_MODES = Object.freeze({
  PRODUCTION: "production",
  MOCK: "mock"
});

export function runtimeMode(search = globalThis.location?.search, { envMock = false } = {}) {
  const params = new URLSearchParams(String(search || ""));
  return envMock ? RUNTIME_MODES.MOCK : RUNTIME_MODES.PRODUCTION;
}

export function isMockRuntime(search = globalThis.location?.search, options = {}) {
  return runtimeMode(search, options) === RUNTIME_MODES.MOCK;
}

export function runtimeModeLabel(mode) {
  return mode === RUNTIME_MODES.MOCK ? "纯 Mock · 开发/演示" : "正式本地 · 真实逻辑";
}
