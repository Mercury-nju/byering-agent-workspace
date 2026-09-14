# Chief of Staff Conversation Orchestration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a lenient, server-authoritative chief-of-staff conversation router that distinguishes conversation from work, minimizes confirmation, and delegates all real execution to capable specialist Agents.

**Architecture:** Add a pure decision-policy module shared by backend and UI contracts, extend requirement understanding with explicit intent/risk/capability output, and make the control plane auto-release safe tasks while preserving approval and access gates. Replace the members-page unconditional task start with a conversation command that renders server-selected text or interaction cards.

**Tech Stack:** JavaScript ES modules, Node test runner, existing control-plane HTTP API, existing AG-UI event adapter, browser-shim development gateway.

---

### Task 1: Decision Policy Contract

**Files:**
- Create: `src/salebuddy/agents/chief-decision-policy.js`
- Create: `scripts/chief-decision-policy.test.mjs`

- [ ] Write failing tests for conversation, read-only task, bounded external task, high-risk task, blocking gaps, optional defaults, and task controls.
- [ ] Run `node --test scripts/chief-decision-policy.test.mjs` and verify the tests fail because the module is missing.
- [ ] Implement normalized decision and deterministic safety overrides.
- [ ] Run the test and verify all cases pass.

### Task 2: Requirement Understanding Contract

**Files:**
- Modify: `backend/requirement-understanding.js`
- Modify: `scripts/requirement-understanding.test.mjs`

- [ ] Write failing tests for the new intent, risk, confirmation, capability, blocking-gap, optional-gap, and default fields.
- [ ] Verify the tests fail on the current proposal shape.
- [ ] Extend the model prompt and strict proposal normalizer.
- [ ] Verify existing requirement repair and hidden-reasoning protections still pass.

### Task 3: Capability-Based Assignment

**Files:**
- Modify: `src/salebuddy/runtime/workflow-definitions.js`
- Modify: `scripts/workflow-definitions.test.mjs`

- [ ] Write failing tests that prohibit chief external execution and reject unavailable capability assignments.
- [ ] Add capability-to-Agent resolution with availability input and dependency/parallel metadata.
- [ ] Preserve current workflows as deterministic compatibility presets.
- [ ] Verify all workflow tests pass.

### Task 4: Lenient Control-Plane Gates

**Files:**
- Modify: `backend/control-plane.js`
- Modify: `src/salebuddy/runtime/task-protocol.js`
- Modify: `scripts/backend-control-plane.test.mjs`
- Modify: `scripts/task-protocol.test.mjs`

- [ ] Write failing tests for automatic low-risk release, one-time bounded approval, blocking gaps, and high-risk pauses.
- [ ] Persist the decision and emit decision/assignment/gate events.
- [ ] Auto-confirm only server-classified low-risk requirements.
- [ ] Keep authorization and external approval mandatory where required.
- [ ] Verify idempotency, stale-version, and replay behavior.

### Task 5: Members-Page Conversation Router

**Files:**
- Modify: `src/salebuddy/ui/contacts-page.js`
- Modify: `src/salebuddy/ui/task-runner.js`
- Modify: `scripts/contacts-page.test.mjs`
- Modify: `scripts/task-runner-requirement.test.mjs`

- [ ] Write failing tests proving questions do not start tasks and safe tasks do not show redundant confirmation.
- [ ] Route chief input through the decision endpoint.
- [ ] Render text, supplement, task, approval, recovery, and result modes from authoritative events.
- [ ] Keep specialist member DMs unchanged.
- [ ] Verify keyboard, loading, retry, and duplicate-submit behavior.

### Task 6: HTTP and Development Gateway

**Files:**
- Modify: `backend/http-server.js`
- Modify: `src/salebuddy/bridge/control-plane-http.js`
- Modify: `browser-shim.js`
- Modify: `scripts/control-plane-http.test.mjs`

- [ ] Write failing HTTP contract tests for chief decision requests and responses.
- [ ] Add authenticated decision routing and normalized error responses.
- [ ] Add browser development parity without synthetic execution events.
- [ ] Verify the production client and local gateway use the same contract.

### Task 7: End-to-End Verification

**Files:**
- Modify: relevant test fixtures only when required.

- [ ] Run all chief, control-plane, workflow, task-runner, and member-page tests.
- [ ] Start the backend and verify health capabilities.
- [ ] Test in the product browser: consultation, safe read-only task, missing information, outbound approval, high-risk block, status query, task modification, and failure recovery.
- [ ] Confirm no synthetic progress or result appears without an authoritative event.
- [ ] Capture final screenshots for each interaction-card type.
