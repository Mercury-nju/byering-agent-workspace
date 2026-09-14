# Auth Flow

This module owns the consumer-facing authentication flow for SaleBuddy.

The auth flow is intentionally isolated from the recovered renderer bundle:

- `config.js` defines stable screen ids and route names.
- `state.js` owns browser-local flow state only. Credentials and tokens must stay
  in the backend/native auth boundary.
- `router.js` parses and writes auth routes without coupling to the recovered
  router.
- `feature.js` exposes the mount/unmount lifecycle used by future auth pages.
- `auth.css` contains the auth surface tokens and responsive layout styles.

The first page can be previewed at `/?page=login`. The existing recovered
workbench remains the default at `/`. Final capability artboards live in
`auth/assets/` beside this module and are configured in `slides.js`.

## Route contract

Auth routes use the hash so the static server can serve the existing `index.html`
for every screen:

- `#/auth/login`
- `#/auth/verify`
- `#/auth/consent`
- `#/auth/recovery`

The feature is not mounted automatically. The existing recovered product remains
the default surface until the login page is designed and explicitly enabled.
