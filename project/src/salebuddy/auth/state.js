const DEFAULT_STATE = Object.freeze({
  screen: "login",
  identifier: "",
  verificationId: null,
  pending: false,
  error: null
});

function cloneState(state) {
  return { ...state };
}

/**
 * Small framework-agnostic store for transient auth UI state.
 * It deliberately does not persist secrets, tokens, or passwords.
 */
export function createAuthStore(initialState = {}) {
  let state = { ...cloneState(DEFAULT_STATE), ...initialState };
  const listeners = new Set();

  function getState() {
    return cloneState(state);
  }

  function setState(patch) {
    const next = typeof patch === "function" ? patch(getState()) : patch;
    state = { ...state, ...next };
    const snapshot = getState();
    listeners.forEach((listener) => listener(snapshot));
    return snapshot;
  }

  function subscribe(listener) {
    if (typeof listener !== "function") throw new TypeError("listener must be a function");
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function reset() {
    return setState(DEFAULT_STATE);
  }

  return Object.freeze({ getState, setState, subscribe, reset });
}

export { DEFAULT_STATE };
