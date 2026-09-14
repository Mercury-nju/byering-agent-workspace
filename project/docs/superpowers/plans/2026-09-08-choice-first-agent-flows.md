# Choice-First Agent Flows

## Approved Design

Replace configuration-first onboarding across nine activated Agents. Finding
starts with visible options, never a mandatory blank natural-language prompt.
Text input supplements options or preserves a previous custom request. Existing
executors, account ownership, limits, knowledge requirements and send consent
remain unchanged. No generated requirements or fabricated customer facts.

## Implementation

- [x] Add shared choice catalogs, deterministic request compilation and controls.
  Test preset-only requests, filter mode semantics, optional text and restoration.
- [x] Wire choice-first discovery, comment filtering, live discovery, research
  recruitment, acquisition audiences and analysis objectives into existing payloads.
- [x] Use compact account context, reusable settings, concise commands and
  recipient/message previews for inbox and outbound workflows.
- [x] Run UI contract and executor tests. Verify rendered controls when browser
  policy permits; never bypass browser security. Do not send real messages.

## Verification Result

263 targeted tests passed, including real setup-function execution against a
test DOM, choice events, payload compilation, account selection, explicit send
confirmation and cleared-draft preservation. Optional search briefs no longer
leak into generated survey invitations. Existing custom messages are preserved.
The browser security policy check remained unavailable, so screenshot and
viewport-level visual verification is not complete. No real messages were sent.

## Files

- `src/salebuddy/ui/task-choices.js`: option vocabulary and deterministic goals.
- `src/salebuddy/ui/agent-square.js`: existing nine flows, shared shell and styling.
- `scripts/task-choices.test.mjs`: choice compilation and form interaction tests.
- Existing scope, inbox, research and UI tests: preserve executor contracts.
