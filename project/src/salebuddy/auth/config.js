/**
 * Stable identifiers for the consumer auth flow.
 * Keep copy and visual decisions out of this file; page modules own those.
 */
export const AUTH_ROUTES = Object.freeze({
  login: "login",
  verify: "verify",
  consent: "consent",
  recovery: "recovery"
});

export const AUTH_ROUTE_PREFIX = "auth";

export const AUTH_SCREENS = Object.freeze([
  AUTH_ROUTES.login,
  AUTH_ROUTES.verify,
  AUTH_ROUTES.consent,
  AUTH_ROUTES.recovery
]);

export const AUTH_MOUNT_ID = "salebuddy-auth-root";

export const AUTH_STYLE_ID = "salebuddy-auth-style";

export function isAuthScreen(screen) {
  return AUTH_SCREENS.includes(screen);
}
