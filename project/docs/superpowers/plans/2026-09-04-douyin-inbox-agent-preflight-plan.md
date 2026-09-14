# Douyin Inbox Agent Preflight Implementation Plan

> **For Codex:** Implement this plan with test-driven development. Complete each checkbox in order and verify the focused tests before moving on.

**Goal:** Make `mkt-dm-inbox` validate all required inputs, generate a real AI-backed reception plan, require explicit user confirmation, and only then create a real-time work task after the backend accepts the start request.

**Architecture:** Keep the existing inbox runtime and MCP worker unchanged. Add a server-side preflight layer to the inbox service that resolves the same knowledge used at runtime, calls the configured model for a structured plan, signs a short-lived plan token, and validates that token during start. The UI becomes a strict setup → planning → review → starting/running state machine and never reports work before server acceptance.

**Tech Stack:** Node.js ESM, native `node:test`, existing control-plane HTTP server, vanilla DOM UI.

---

## Task 1: Add the inbox plan model and signed preflight contract

**Files:**
- Modify: `backend/douyin-inbox-agent-service.js`
- Test: `scripts/douyin-inbox-agent-service.test.mjs`

- [ ] Write failing tests for missing required fields, real structured model output, warning versus blocking gaps, non-confirmable knowledge gaps, signed token verification, expired/stale/forged/non-confirmable token rejection, and start idempotency.
- [ ] Extract one shared knowledge-resolution path used by both `plan()` and `start()`.
- [ ] Treat only enabled stored knowledge plus `businessKnowledge` as authoritative; explicitly ignore/reject client-supplied `knowledgeContext` as a knowledge bypass.
- [ ] Add strict configuration normalization for account, reply rule, objective, tone, handoff boundary, and effective business knowledge.
- [ ] Add the model planner with JSON-only output, one repair attempt, and strict schema normalization; after two invalid/incomplete responses fail with `DOUYIN_INBOX_PLAN_UNAVAILABLE` and never fall back to a local template.
- [ ] Validate `source: "model"`, provider, model, generated time, warning/blocking gaps, and ensure every allowed fact is linked to a resolved knowledge source; reject unsupported claims introduced by the model.
- [ ] Sign an expiring `planToken` with HMAC over agent, account, normalized configuration hash, knowledge revision, confirmability, model metadata, and expiry. Read the secret from `BYERING_INBOX_PLAN_SIGNING_SECRET` (or an explicitly injected test secret), fail closed when missing, never use a hard-coded production default, and compare signatures in constant time.
- [ ] Require and verify `planToken` for every `mkt-dm-inbox` start. Remove the public tokenless compatibility bypass and update existing tests to plan before starting.
- [ ] Store start-request recovery records in a separate sidecar state file so the inbox cursor/draft state shape is untouched.
- [ ] Make repeated starts with the same `startRequestId` and token return the existing accepted/running/failed result without creating a second worker, including after service recreation.
- [ ] Assert that plan success, validation failure, model failure, and blocking-gap results never start message mode, polling, sending, runtime construction, or the worker.
- [ ] Run: `node --test scripts/douyin-inbox-agent-service.test.mjs`

## Task 2: Expose plan and start-status HTTP boundaries

**Files:**
- Modify: `backend/http-server.js`
- Test: `scripts/control-plane-http.test.mjs`
- Test: `scripts/douyin-acquisition-http.test.mjs`

- [ ] Write failing route tests for `POST /v1/douyin/inbox-agent/plan`, mandatory-token start, validation `fieldErrors`, client `knowledgeContext` bypass rejection, and `GET /v1/douyin/inbox-agent/start-status`.
- [ ] Add the plan route using the agent-specific MCP service and authoritative resumed authorization status.
- [ ] Forward the normalized plan inputs, `planToken`, and `startRequestId` to the service.
- [ ] Add the read-only start-status route with `not_started | accepted | running | failed` states, structured terminal errors, and tests proving status lookup has no side effects.
- [ ] Enforce the plan token for every public inbox start and update old route tests to use the new plan contract.
- [ ] Run: `node --test scripts/control-plane-http.test.mjs scripts/douyin-acquisition-http.test.mjs`

## Task 3: Turn the inbox setup into a gated product flow

**Files:**
- Modify: `src/salebuddy/ui/agent-square.js`
- Modify: `src/salebuddy/styles/agent-square.css`
- Test: `scripts/agent-square-auth-ui.test.mjs`

- [ ] Write failing UI source-contract tests for required business knowledge, inline field errors, a real plan request, inbox-specific step labels, a disabled start button when the plan is not confirmable, and stale-plan invalidation after any configuration edit.
- [ ] Make business knowledge visibly required unless enabled long-term knowledge is present.
- [ ] Validate account, business knowledge, reply rule, objective, and handoff boundary before leaving setup; focus the first invalid field and render inline guidance.
- [ ] Disable `生成承接方案` while account or knowledge is loading.
- [ ] Add a `planning` state with a clear AI-understanding progress treatment and call `POST /v1/douyin/inbox-agent/plan`.
- [ ] Map backend 4xx `fieldErrors` back to the matching inline fields and remain in `setup`.
- [ ] On `DOUYIN_INBOX_PLAN_UNAVAILABLE`, explain that the task has not started, remain in configuration/review preparation, and create no work/activity/result record.
- [ ] Render the returned structured plan, source/model metadata, allowed facts, examples, and knowledge gaps in review.
- [ ] Disable `确认并启用承接` when `confirmable` is false and route users back to the exact missing fields.
- [ ] Clear `plan`, `planToken`, `planRevision`, `confirmable`, and `startRequestId` whenever account, knowledge, rule, objective, tone, or handoff configuration changes after planning.
- [ ] Use the exact inbox-specific steps: `完善接待信息 → 确认 AI 承接方案 → 启用并持续工作` and the confirmation action `确认并启用承接`.
- [ ] Run: `node --test scripts/agent-square-auth-ui.test.mjs`

## Task 4: Start only after authoritative backend acceptance

**Files:**
- Modify: `src/salebuddy/ui/agent-square.js`
- Test: `scripts/agent-square-auth-ui.test.mjs`

- [ ] Write failing tests proving `beginWork`, activity records, result records, navigation, and polling do not happen before the start response is accepted.
- [ ] Submit `planToken` and a stable `startRequestId`; keep the UI in `starting` without creating real-time work.
- [ ] On an ambiguous/lost response, query `start-status` instead of blindly retrying the mutating start call.
- [ ] Only after `accepted/running`, call `beginWork`, add activity, open real-time work, persist the running task, and begin status polling.
- [ ] On rejection, return to setup/review with actionable field or token-expiry guidance and no fake work history.
- [ ] Run: `node --test scripts/agent-square-auth-ui.test.mjs`

## Task 5: Verify the complete private-message intake path

**Files:**
- Modify if needed: `docs/superpowers/specs/2026-09-04-douyin-inbox-agent-preflight-design.md`

- [ ] Run focused tests: `npm run test:inbox-agent && npm run test:agent-square-auth-ui && npm run test:control-plane-http && node --test scripts/douyin-acquisition-http.test.mjs`.
- [ ] Start/restart the local backend and static app, then verify health endpoints.
- [ ] Exercise setup validation, AI planning, review gating, and accepted start against the local application without sending unsolicited external messages.
- [ ] Confirm other Agent setup/start flows remain unchanged.
