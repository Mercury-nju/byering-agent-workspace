import { AUTH_MOUNT_ID } from "./config.js";
import { createAuthRouter } from "./router.js";
import { createAuthStore } from "./state.js";

function ensureMount(documentRef, mountId) {
  let root = documentRef.getElementById(mountId);
  if (!root) {
    root = documentRef.createElement("div");
    root.id = mountId;
    root.hidden = true;
    root.dataset.feature = "auth";
    documentRef.body.appendChild(root);
  }
  return root;
}

/**
 * Creates the auth feature boundary without choosing a visual implementation.
 * The renderer callback is the only place future page components are plugged in.
 */
export function createAuthFeature({
  documentRef = globalThis.document,
  location = globalThis.location,
  history = globalThis.history,
  render = () => {}
} = {}) {
  if (!documentRef?.body) throw new Error("Auth feature requires a document body");

  const root = ensureMount(documentRef, AUTH_MOUNT_ID);
  const store = createAuthStore();
  const router = createAuthRouter({ location, history });
  let mounted = false;
  let unsubscribeRoute = null;
  let unsubscribeState = null;
  let cleanupRender = null;

  function update() {
    cleanupRender?.();
    cleanupRender = render({ root, route: router.current(), state: store.getState(), router, store }) || null;
  }

  function mount() {
    if (mounted) return api;
    mounted = true;
    root.hidden = false;
    router.start();
    unsubscribeRoute = router.subscribe(update);
    unsubscribeState = store.subscribe(update);
    update();
    return api;
  }

  function unmount() {
    if (!mounted) return api;
    mounted = false;
    router.stop();
    unsubscribeRoute?.();
    unsubscribeState?.();
    cleanupRender?.();
    cleanupRender = null;
    unsubscribeRoute = null;
    unsubscribeState = null;
    root.hidden = true;
    root.replaceChildren();
    return api;
  }

  const api = Object.freeze({ root, router, store, mount, unmount, isMounted: () => mounted });
  return api;
}
