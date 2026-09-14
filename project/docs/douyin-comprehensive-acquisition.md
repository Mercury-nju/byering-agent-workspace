# Douyin Comprehensive Acquisition

## Approved Scope

Extend `mkt-comment-acquisition` in place. Newly started tasks use
`authorized_account_all_signals`: the bound account's new comments, interaction
notifications and live messages feed evidence-based qualification, automatic
first contact, and continuous inbox replies toward a conversion objective.
Existing tasks migrate to the same all-signal listener identity. No historical
lookback is retained or silently added to a running task. An opt-out, reply,
or human handoff ends automation for that prospect only; it never stops the
account-level listener.

## Implementation

- `douyin-interaction-source.js` combines independently cursor-tracked streams.
  Partial failures are visible and do not discard the successful stream.
- Evidence is grouped by stable account identity and retained across scans.
  Non-verbal interactions are not customer quotes or sufficient buying intent.
- Qualification changes can promote previously skipped customers. Submitted,
  delivered and unknown first-contact attempts are not recreated.
- Tasks survive idle scans and process reconstruction. Dependency failures
  degrade and retry; replies do not end the parent task. China-time daily
  send limits reset the next day while queued contacts are retained.
- Explicit pause/stop stops managed inbox replies and live polling. In-flight
  generation checks cancellation before sending; already-submitted provider
  requests cannot be recalled.
- Replies include both sides of recent dialogue and the configured conversion
  objective. Opt-out and human-handoff policies remain in place.

## Provider Contract Verified 2026-09-07

Read-only discovery of `https://api.yydsagent.com/openapi.json` confirmed:

- `POST /v1/sessions/{sid}/live-polling/start`
- `POST /v1/sessions/{sid}/live-polling/stop`
- `GET /v1/sessions/{sid}/live-polling/status`
- `GET /v1/sessions/{sid}/live-messages` (`cursor`, `max`, `wait_ms`)

The locally installed MCP adapter does not yet expose these live tools, so the
existing authenticated REST transport is used. No cloud provisioning or billing
plan is selected by this change.

Read-only checks using the saved acquisition session returned real comment
notification envelopes, but live-message reads returned `worker_timeout` and
no messages. Live sender/content fixtures are contract tests, not proof of a
successful real live broadcast or conversion. A real live session is still
needed to validate the provider's populated live-message envelope.

## Verification

Run the focused acquisition, notification, inbox, MCP, UI config, model-analysis
and marketplace tests. Browser visual verification currently requires the
browser security policy check to become available; do not bypass that control.
