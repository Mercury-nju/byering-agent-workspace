import { AUTH_ROUTE_PREFIX, AUTH_ROUTES, isAuthScreen } from "./config.js";

const AUTH_HASH_PATTERN = /^#\/?auth(?:\/([^/?#]+))?$/;

export function parseAuthRoute(hash = globalThis.location?.hash || "") {
  const match = String(hash).match(AUTH_HASH_PATTERN);
  const screen = match?.[1] || AUTH_ROUTES.login;
  if (!match || !isAuthScreen(screen)) return null;
  return { prefix: AUTH_ROUTE_PREFIX, screen };
}

export function createAuthRouter({
  location = globalThis.location,
  history = globalThis.history,
  eventTarget = globalThis
} = {}) {
  const listeners = new Set();
  let listening = false;

  function current() {
    return parseAuthRoute(location?.hash || "");
  }

  function notify() {
    const route = current();
    listeners.forEach((listener) => listener(route));
    return route;
  }

  function go(screen) {
    if (!isAuthScreen(screen)) throw new RangeError(`Unknown auth screen: ${screen}`);
    if (location) location.hash = `/${AUTH_ROUTE_PREFIX}/${screen}`;
    return notify();
  }

  function replace(screen) {
    if (!isAuthScreen(screen)) throw new RangeError(`Unknown auth screen: ${screen}`);
    if (location && history?.replaceState) {
      history.replaceState(null, "", `#/${AUTH_ROUTE_PREFIX}/${screen}`);
    } else if (location) {
      location.hash = `/${AUTH_ROUTE_PREFIX}/${screen}`;
    }
    return notify();
  }

  function subscribe(listener) {
    if (typeof listener !== "function") throw new TypeError("listener must be a function");
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function start() {
    if (listening || !eventTarget?.addEventListener) return api;
    eventTarget.addEventListener("hashchange", notify);
    eventTarget.addEventListener("popstate", notify);
    listening = true;
    return api;
  }

  function stop() {
    if (!listening || !eventTarget?.removeEventListener) return api;
    eventTarget.removeEventListener("hashchange", notify);
    eventTarget.removeEventListener("popstate", notify);
    listening = false;
    return api;
  }

  const api = Object.freeze({ current, go, replace, subscribe, notify, start, stop });
  return api;
}
