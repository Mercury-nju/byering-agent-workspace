import { AUTH_STYLE_ID } from "./config.js";
import { createLoginPanel } from "./LoginPanel.js";
import { routeAfterAuthentication } from "../onboarding/entry.js";

function ensureStyles(documentRef) {
  if (documentRef.getElementById(AUTH_STYLE_ID)) return;
  const link = documentRef.createElement("link");
  link.id = AUTH_STYLE_ID;
  link.rel = "stylesheet";
  link.href = new URL("./auth.css", import.meta.url).href;
  documentRef.head.appendChild(link);
}

export function renderLoginPage({ root, documentRef = globalThis.document, onAuthenticated } = {}) {
  ensureStyles(documentRef);
  root.className = "sb-auth-page-root";
  root.hidden = false;
  root.replaceChildren();
  const card = documentRef.createElement("main");
  card.className = "sb-auth-login-card";
  const panel = createLoginPanel({
    documentRef,
    simulate: globalThis.__SALEBUDDY_CONFIG__?.authSimulation !== false,
    onAuthenticated: onAuthenticated || ((result = {}) => {
      const isNewUser = typeof result.isNewUser === "boolean"
        ? result.isNewUser
        : typeof result.firstLogin === "boolean"
          ? result.firstLogin
          : result.simulated === true
            ? true
            : null;
      globalThis.location?.assign?.(routeAfterAuthentication(globalThis.localStorage, { isNewUser }));
    })
  });
  card.appendChild(panel.root);
  root.appendChild(card);
  return () => {
    panel.destroy();
    root.replaceChildren();
  };
}
