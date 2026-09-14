# Douyin Acquisition Specialists Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver two peer Douyin specialists—`评论区获客管家` and `直播间获客专家`—with a real, durable task model. The comment specialist must complete the first real closed loop (public comment discovery → intent analysis → risk review → approved private-message outreach → receipt/result persistence). The live specialist must remain visible but non-hireable/non-startable until the live capability probe passes. Existing four specialists keep their independent behavior and boundaries.

**Architecture:** Keep marketplace identities as peer Agents. Add a shared acquisition task contract and long-running runner behind the existing control-plane boundary. Create `mkt-comment-acquisition` for `评论区获客管家`; reuse the existing `mkt-live-lead-miner` persistence ID for the renamed `直播间获客专家` so existing records and employment state migrate without creating a duplicate card. Reuse the existing prospect connector, Douyin MCP/cloud registry, activity journal, work-live source, and result recorder instead of creating another visible hierarchy. Persist state by composite owner key `agentId + taskId + accountId` while retaining `taskId` as the external correlation ID; separate cloud health from task health; treat slow provisioning and missing receipts as recoverable states. A long-running parent task remains `RUNNING` while individual touch items wait for approval; existing task-level `WAITING_*` states are reserved for whole-task blocking. Route every meaningful event to the Agent DM, realtime work, and Results Center through the existing gateway/event paths.

**Tech Stack:** Node.js ESM, vanilla browser UI, Electron-compatible local backend, existing Douyin MCP adapters, `node:test`, localStorage-backed UI stores, filesystem-backed cloud registry.

---

## 1. Map the current contracts and freeze regression boundaries

- [ ] Add a short contract test fixture for the two new specialist IDs and existing four IDs in `scripts/marketplace.test.mjs` (or a new focused `scripts/acquisition-contract.test.mjs` if the fixture becomes too large). Assert that no parent “获客 Agent” is introduced and that the four existing IDs remain independently executable.
- [ ] Document the canonical IDs, display names, and capability flags in `src/salebuddy/agents/marketplace.js`: add `mkt-comment-acquisition`; reuse `mkt-live-lead-miner` as the stable persistence ID while renaming its user-facing identity to `直播间获客专家`; retain `mkt-lead-miner`, `mkt-comment-filter`, `mkt-cold-writer`, and `mkt-dm-inbox` unchanged.
- [ ] Add an exported acquisition contract module at `src/salebuddy/agents/acquisition-contract.js` containing the task states, cloud states, approval modes, touch states, event types, capability probe states, and safe transition helpers. Keep the module pure so it can be tested without a DOM or network.
- [ ] Run `npm run test:marketplace`, `npm run test:agent-foundation`, and the new contract test. Expected result: existing marketplace/runtime tests stay green and the new constants reject illegal state transitions.

## 2. Make marketplace cards and employment gates truthful

- [ ] Update `src/salebuddy/agents/marketplace.js` profile seeds for the two peer specialists, including their mission, scope, inputs, outputs, approval defaults, and “no public reply/live execution before probe” boundary. Preserve `mkt-live-lead-miner` as the live specialist's persistence key and add an explicit display-name migration rather than seeding a second live card.
- [ ] Update `src/salebuddy/ui/agent-square.js` card metadata, capability labels, onboarding copy, and routing so `评论区获客管家` has a real executable path while `直播间获客专家` shows `能力准备中` until the live capability probe is persisted as passing.
- [ ] Add a shared readiness selector (preferably in `src/salebuddy/agents/acquisition-capability.js`) that distinguishes `visible`, `hireable`, and `startable` for each capability, including `commentPublicReply`. Do not infer readiness from card text or a static timer.
- [ ] Ensure the existing four specialists continue to use their current `startUse` branches and do not inherit acquisition-specific long-running defaults.
- [ ] Extend `scripts/marketplace.test.mjs` and `scripts/agent-square-auth-ui.test.mjs` to cover: peer cards, live card disabled state, no parent card, and unchanged four-specialist routing.
- [ ] Run `npm run test:marketplace && npm run test:agent-square-auth-ui`.

## 3. Implement the real comment-acquisition task runner

- [ ] Create `backend/douyin-acquisition-service.js` as the authoritative long-running service for `mkt-comment-acquisition` and the migrated `mkt-live-lead-miner`. It should accept an explicit task context (`agentId`, `taskId`, `taskRunId`, `conversationId`, `accountId`) and normalized config (source scope, account refs, work window, frequency, audience rules, touch channel, approval mode, content policy, caps, stop conditions).
- [ ] Reuse `backend/prospect-service.js` for public work/comment reads and intent analysis. Add an acquisition-specific adapter method only where the existing public discovery contract cannot express source scope or incremental cursors; do not fork the MCP client.
- [ ] Reuse `backend/account-resolver.js` for public target/account normalization and `backend/douyin-agent-cloud-registry.js` for per-Agent cloud/session ownership. The runner must never share a session or API key across Agent IDs.
- [ ] Add durable task persistence (new `backend/douyin-acquisition-store.js`, filesystem-backed JSON alongside the cloud registry, or the project’s existing persistence abstraction after inspection) with idempotent upsert by composite owner key `agentId + taskId + accountId`; keep `taskId` as a correlation field. Persist config, cursor, last successful scan, cloud snapshot, task state, approval queue, retry counts, and last error.
- [ ] Implement the loop as resumable polling, not a finite request timeout: scan → normalize/dedupe → intent analysis → risk review → draft queue → approval gate → send → receipt reconciliation → reply/stop-condition update. A slow cloud start keeps the task `running`/`degraded`; only confirmed disconnect, auth loss, or explicit provider failure enters `error`. Until a real public-reply capability probe passes, force the touch channel to `private_message` or `human_required`; reject `public_reply` rather than presenting a runnable path.
- [ ] Use stable request IDs for all mutating private-message calls. A lost response must reconcile by querying the provider or retaining `unknown` rather than reporting `sent` optimistically.
- [ ] Add pause, resume, stop, retry, and status methods. Stop must be explicit and idempotent; pause must preserve cursors and pending approvals.
- [ ] On `startControlPlaneServer` startup, load persisted acquisition tasks in `RUNNING`/`DEGRADED`, resume their polling loops and event cursors, and enforce a single runner per composite owner key so a backend restart cannot strand or duplicate a long-running task.
- [ ] Add `scripts/douyin-acquisition-service.test.mjs` with fake prospect/MCP/cloud dependencies covering first scan, duplicate candidate suppression, manual approval hold without changing the parent task out of `RUNNING`, batch approval, auto low-risk send, timeout retry, unknown receipt, pause/resume, stop, and composite-key isolation.
- [ ] Run `node --test scripts/douyin-acquisition-service.test.mjs scripts/prospect-service.test.mjs scripts/douyin-agent-cloud-registry.test.mjs`.

## 4. Add the approval and touch state machine

- [ ] Create `backend/douyin-acquisition-approval.js` (or keep pure transition logic in `src/salebuddy/agents/acquisition-contract.js` and persistence in the service) to enforce `manual`, `batch`, and `auto` modes.
- [ ] Enforce the approved transition graph: `draft → pending_approval → approved → submitted → accepted/delivered`, with `unknown → delivery_checking` and `failed → retry_queued/stopped`; reject illegal direct `draft → submitted` transitions.
- [ ] Make `manual` the default. `batch` must record the selected candidate IDs, template/version, and count. `auto` must require an explicit opt-in and only pass low-risk messages under daily limits, spacing, cooldown, and platform constraints.
- [ ] Keep touch-item approval state separate from the long-running parent task state: pending approvals are represented in the task payload/events while the parent remains `RUNNING` (or `PAUSED`/`STOPPED` when explicitly changed).
- [ ] Route price, discount, complaint, refund, contract, effect promise, and unknown-fact cases to `human_required` regardless of mode.
- [ ] Add tests in `scripts/douyin-acquisition-approval.test.mjs` for every transition, risk block, idempotency key, and audit payload.
- [ ] Run the focused approval tests before wiring UI.

## 5. Wire control-plane routes and event ingestion

- [ ] Add acquisition endpoints in `backend/http-server.js` (or a dedicated router imported there) for create/configure, start/resume, pause, stop, status, approval decision, and retry. Keep request validation and redaction at the HTTP boundary.
- [ ] Extend `backend/control-plane.js` / `backend/task-dispatcher.js` only where needed to register the long-running acquisition task and its state transitions (`RUNNING`, `PAUSED`, `RETRYING`, `HANDOFF_REQUIRED`, `FAILED`, `CANCELLED`); touch approval waits belong in payload/events, not parent `WAITING_APPROVAL`. Do not bypass the authoritative task protocol.
- [ ] Define and test the custom-to-authoritative state mapping at the control-plane boundary: `running → RUNNING`; `paused → PAUSED`; `degraded → RUNNING + health=DEGRADED`; `error → FAILED`; `stopped → CANCELLED`; `pending_approval` exists only on touch-item payload/events and never becomes parent `WAITING_APPROVAL`. Use the same mapping in status responses, event payloads, realtime work, Agent DM, and Results Center.
- [ ] Reuse the existing control-plane HTTP client in `src/salebuddy/bridge/control-plane-http.js` and gateway event normalization in `src/salebuddy/runtime/gateway-events.js` so all events carry the same `agentId`, `taskId`, `taskRunId`, `conversationId`, and `accountId`.
- [ ] Emit canonical events for authorization, cloud lifecycle, scan window, candidate counts, intent/risk decisions, draft creation, approval, submission, receipt, reply, retry, pause, resume, stop, and error. Events must be replay-safe and deduplicated.
- [ ] Add `scripts/douyin-acquisition-http.test.mjs` and extend `scripts/task-dispatcher.test.mjs` / `scripts/control-plane-http.test.mjs` with authenticated route, invalid transition, state-mapping, touch-approval-with-parent-running, and event-ingestion cases.
- [ ] Run `npm run test:control-plane-http && npm run test:task-dispatcher && node --test scripts/douyin-acquisition-http.test.mjs`.

## 6. Connect Agent DM activity and member conversations

- [ ] Extend `src/salebuddy/agents/agent-activity-feed.js` message formatting for acquisition-specific lifecycle events while preserving the existing inbox/outreach wording.
- [ ] Use `src/salebuddy/agents/agent-activity-journal.js` as the durable browser-side mirror. Every event must be keyed with `agentId + taskId + sequence/eventId`, so leaving the configuration page does not lose activity.
- [ ] Update `src/salebuddy/ui/contacts-page.js` and `src/salebuddy/ui/agent-square.js` to show current acquisition state, pending approvals, cloud recovery, and “继续处理/暂停/恢复/关闭” actions from the Agent’s 1:1 conversation.
- [ ] Add tests to `scripts/agent-activity-feed.test.mjs` and `scripts/contacts-page.test.mjs` for event ordering, deduplication, queued delivery while the gateway is offline, and task-specific action payloads.
- [ ] Run `npm run test:activity-feed && npm run test:contacts`.

## 7. Connect realtime work, cloud health, and recovery UX

- [ ] Extend `src/salebuddy/agents/work-live.js` metadata to carry `taskId`, `accountId`, cloud state, task state, retry count, and progress mode. Use indeterminate progress when the provider has not emitted a real percentage.
- [ ] Update `src/salebuddy/ui/realtime-work.js` to render acquisition work for both new IDs: current phase, account, actual recent signal, cloud screen/reconnect state, pending approval count, and pause/resume/stop controls.
- [ ] Reuse `src/salebuddy/agents/douyin-cloud-activity-monitor.js` and `src/salebuddy/agents/douyin-inbox-activity-monitor.js` patterns for ready, reconnecting, disconnected, and authorization-expired events; do not turn a slow status read into a task failure.
- [ ] Add capability probe services (new `backend/douyin-live-capability-probe.js` plus route, and a persisted comment public-reply probe) that record evidence and timestamp. Run the live probe against the migrated `mkt-live-lead-miner`; a passing real supported interaction read/touch probe flips both hireable and startable gates, while failure keeps the card visible but blocked. Keep comment `public_reply` disabled until its own probe passes; when it fails, only `private_message`/`human_required` alternatives remain available, and when it passes the public-reply channel becomes runnable.
- [ ] Add `scripts/douyin-live-capability-probe.test.mjs` and extend `scripts/douyin-cloud-activity-monitor.test.mjs`, `scripts/work-live.test.mjs`, and `scripts/cloud-view.test.mjs` for slow startup, reconnecting state, and real disconnect handling.
- [ ] Run `npm run test:cloud-activity-monitor && npm run test:work-live && node --test scripts/cloud-view.test.mjs`.

## 8. Connect Results Center and durable artifacts

- [ ] Extend `src/salebuddy/agents/agent-result-recorder.js` and `src/salebuddy/ui/prospect-store.js` so a long-running acquisition task upserts one result run by composite owner key `agentId + taskId + accountId`, while appending scan summaries, candidate evidence, approval history, sends, receipts, retries, and replies; retain `taskId` for correlation and links.
- [ ] Update `src/salebuddy/ui/prospect-center.js` result classification and detail rendering for `潜客`, `触达记录`, `运行摘要`, and live capability/error records. Include source work/comment URL, observed time, evidence quote, and touch status.
- [ ] Make each result detail link back to the owning Agent conversation and realtime task using `agentId + taskId`; never infer ownership from a title string.
- [ ] Add/extend `scripts/agent-result-recorder.test.mjs`, `scripts/prospect-store.test.mjs`, and a focused acquisition result test for composite-key upsert, replay, partial/pending state, failed send, cross-agent/account isolation, and cross-page linkage.
- [ ] Run `npm run test:agent-results && npm run test:prospect`.

## 9. Add UI configuration and explicit long-running lifecycle controls

- [ ] Build the comment specialist configuration flow in `src/salebuddy/ui/agent-square.js`: source scope (own/other works), account/work window/frequency, audience and intent signals, touch channel, content strategy, approval mode, caps/cooldown, and stop conditions.
- [ ] Make the preview show the actual execution plan and the exact “what will be sent” policy. Do not reduce content strategy to a single free-text message; include citation policy, tone/length, missing-context behavior, and human handoff boundaries.
- [ ] Add a clear long-running confirmation before start: “默认持续运行，直到暂停或关闭”; show the current task ID/account and where future events will appear.
- [ ] For the live specialist, render the same product explanation but replace start/hire actions with the capability-probe status and a private-message/manual alternative until ready; after a passing probe, expose the normal hire/config/start path. For the comment specialist, show public-reply readiness separately and never show a runnable public-reply path before its probe passes.
- [ ] Add UI tests that mount the flow with mocked gateway/control-plane responses and assert no fake completion or static progress is shown.
- [ ] Run `npm run test:agent-square-auth-ui && npm run test:marketplace`.

## 10. Persistence, isolation, and migration checks

- [ ] Add per-Agent config/key/session isolation tests for the two new IDs using `scripts/douyin-agent-cloud-registry.test.mjs` patterns. A shared API key/session must be rejected; restarting the process must resume the saved session without relogin.
- [ ] Ensure task records survive page refresh and browser exit; a reopened Agent conversation must load the current long-running task and pending approvals from persistence. After a backend process restart, persisted `RUNNING`/`DEGRADED` tasks must resume exactly once with their cursors, pending approvals, and event sequence intact.
- [ ] Add migration guards for existing localStorage and cloud-registry records so the four existing specialists retain their current IDs and behavior, and migrate old `mkt-live-lead-miner` labels/records to the `直播间获客专家` display identity without creating a duplicate live card.
- [ ] Run `npm run test:inbox-agent && npm run test:cloud-activity-monitor && npm run test:agent-results && npm run test:contacts`.

## 11. End-to-end verification and handoff

- [ ] Add a deterministic integration test using fake public-data and Douyin-MCP adapters plus real state transitions: hire comment specialist → authorize account → start long task → discover candidate → create draft → approve → submit → reconcile receipt → persist result/events.
- [ ] Add a negative integration test: live specialist probe fails, card remains visible but cannot be hired/started and no simulated result is created.
- [ ] Add a positive integration test: the migrated live specialist passes the real capability probe, then becomes hireable/startable and enters the normal configuration path.
- [ ] Add comment public-reply gating tests: probe failure forces private-message/manual fallback and creates no simulated sent/completed result; a real probe pass alone enables the public-reply channel.
- [ ] Add a recovery integration test: cloud startup exceeds normal latency, task stays `running/degraded`; confirmed disconnect produces an error event, recovery attempt, and resumable record.
- [ ] Add a process-restart integration test: persisted `RUNNING`/`DEGRADED` task resumes once, keeps its cursor and approval queue, and does not duplicate events or runners.
- [ ] Run the complete relevant suite: `npm run test:marketplace && npm run test:prospect && npm run test:prospect-workflow && npm run test:inbox-agent && npm run test:agent-results && npm run test:activity-feed && npm run test:contacts && npm run test:work-live && npm run test:cloud-activity-monitor && npm run test:control-plane-http && npm run test:task-dispatcher`.
- [ ] Run `npm run check:office` and `npm run test:all` if the focused suite is green. Record any pre-existing unrelated failures separately; do not mask them with demo data.
- [ ] Update `docs/superpowers/specs/2026-09-02-douyin-acquisition-specialists-design.md` only if implementation reveals a contract change; otherwise keep the approved spec unchanged and add a short implementation note under `docs/superpowers/`.
