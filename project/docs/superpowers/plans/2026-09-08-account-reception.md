# Account Reception Implementation Plan

## Approved Scope

Account-owned persona, schedule, tone, length, objectives, business facts and
handoff boundaries shared by inbox and acquisition. First-contact content stays
task-specific. Reception hours never close the acquisition task. Outside hours,
retain messages and optionally send one away message per closed period/customer.
Preview uses the real model without MCP actions. Settings apply before the next
reply; check revision, hours and human control again at send time.

## Tasks

- [x] Pure settings contract: validated timezone, weekday intervals and overnight hours.
- [x] Durable account/tenant store with revision checks and conversation controls.
- [x] Runtime: deferred messages, combined bursts, shared policy, send-time checks.
- [x] Consumer reception page: summarized expandable choices, hours, knowledge,
  model preview and human takeover list. Explicit account-level save.
- [x] Integration tests and real-model smoke test without sending.

## Boundaries

New reception runtimes require an explicitly saved account policy. Legacy browser
strategies can be imported explicitly; legacy Agent knowledge is not silently
shared across accounts. No existing external account settings were migrated.
Runtime intake remains active outside hours, but drafts stay deferred. The
account store preserves human takeover, opt-out and completed-goal markers.
Goal completion is a user-confirmed state, not an inferred sale or survey receipt.
Human takeover controls pause automation; sending the human reply remains in
the user's Douyin conversation. Proactive follow-up is disabled; outbound first
contact keeps its separate existing task limits and schedule.

Preview uses the same decision and model generator without a send transport.
Live operation and preview enforce time and policy checks; text style is a model
instruction, not a guarantee of factual correctness. Browser screenshot QA is
blocked by the unavailable admin policy check and was not bypassed.

An unrelated existing control-plane test expects the phrase "arrange Agent"
while the chief response says "arrange a suitable Agent"; that assertion still
fails and was not changed as part of reception work.

Do not migrate legacy local strategies silently or claim they are synchronized.
Do not expand proactive outreach, billing, external account access or permissions.
