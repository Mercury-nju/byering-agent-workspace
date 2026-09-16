export const NAV_PAGE_ROUTES = Object.freeze({
  newTask: "new-task",
  office: "office",
  skills: "skills",
  contacts: "contacts",
  agentSquare: "agent-square",
  realtimeWork: "realtime-work",
  prospects: "prospects",
  discoveredPeople: "discovered-people",
  files: "files",
  kbMemory: "memory",
  conversationStrategy: "conversation-strategy"
});

export function persistNavigationRoute(mode, options = {}) {
  const page = NAV_PAGE_ROUTES[mode];
  const navigationWindow = globalThis.window;
  const currentHref = navigationWindow?.location?.href;
  const replaceState = navigationWindow?.history?.replaceState;
  if (!page || !currentHref || typeof replaceState !== "function") return;

  try {
    const url = new URL(currentHref);
    url.searchParams.set("page", page);
    if (mode === "agentSquare") {
      if (Object.prototype.hasOwnProperty.call(options, "initialAgentId")) {
        if (options.initialAgentId) url.searchParams.set("agent", options.initialAgentId);
        else url.searchParams.delete("agent");
      }
    } else {
      url.searchParams.delete("agent");
    }
    replaceState.call(navigationWindow.history, navigationWindow.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  } catch {
    // URL/history APIs are optional in embedded previews.
  }
}

export function clearNavigationRoute(mode) {
  const page = NAV_PAGE_ROUTES[mode];
  const navigationWindow = globalThis.window;
  const currentHref = navigationWindow?.location?.href;
  const replaceState = navigationWindow?.history?.replaceState;
  if (!page || !currentHref || typeof replaceState !== "function") return;

  try {
    const url = new URL(currentHref);
    if (url.searchParams.get("page") !== page) return;
    url.searchParams.delete("page");
    url.searchParams.delete("agent");
    replaceState.call(navigationWindow.history, navigationWindow.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  } catch {
    // URL/history APIs are optional in embedded previews.
  }
}
