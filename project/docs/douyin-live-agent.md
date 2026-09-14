# Live Audience Agent

`mkt-live-lead-miner` is now available in Agent Center and the shared activated
team roster. Availability means the deployed adapter can be invoked; no
successful real broadcast or provider capability probe is fabricated.

The setup authorizes the Agent's own account and accepts an audience goal.
`authorized_account_live` tasks consume only `/live-messages`, preserve their
cursor and audience evidence, and classify intent using the existing analyzer.
No comments feed, private inbox, first-contact messages or auto-replies are
started by this discovery-only Agent. Pause/stop releases live polling.

The current API starts polling for the bound account; arbitrary external room
URLs, replay comments and product-click collection are not offered in the form.

## Configuration

Provide `BYERING_DOUYIN_MCP_API_KEY_MKT_LIVE_LEAD_MINER` through the normal server
environment, then authorize the intended live account. The local development
environment did not contain this dedicated credential during implementation.
Other Agent credentials and saved authorizations were not copied or changed.

## Verification

`node --test scripts/douyin-live-agent.test.mjs` covers availability, payload,
UI routing, stream isolation, normalized audience identity/avatar/evidence,
model intent, cursor/deduplication, transient failure recovery and explicit stop.
These tests use controlled provider responses; a real broadcast still needs
runtime verification after the dedicated account connection is configured.
