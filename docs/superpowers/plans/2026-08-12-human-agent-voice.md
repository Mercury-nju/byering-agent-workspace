# Human Agent Voice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace protocol-like employee messages with lively, first-person colleague dialogue while preserving the underlying task event stream and evidence model.

**Architecture:** Add deterministic presentation helpers to `task-runner.js` that translate employee lifecycle events into role-aware human dialogue. Keep protocol events unchanged in `demo-timeline.js`, render only `sub-start` as the employee entrance bubble, and let accepted/started events update progress state without producing duplicate chat messages.

**Tech Stack:** Browser ES modules, Node.js built-in test runner, existing task runtime and static server.

---

### Task 1: Define the human voice contract

**Files:**
- Modify: `scripts/task-runner-dialogue.test.mjs`
- Modify: `src/salebuddy/ui/task-runner.js`

- [ ] Add failing tests for role-aware first-person entrance, start, progress, completion, and error dialogue.
- [ ] Run `npm run test:dialogue` and verify failures come from missing presentation helpers.
- [ ] Export minimal deterministic helpers that produce lively first-person language, use at most one optional Emoji, and never expose protocol labels.
- [ ] Run `npm run test:dialogue` and verify all tests pass.

### Task 2: Humanize the rendered lifecycle

**Files:**
- Modify: `src/salebuddy/ui/task-runner.js`
- Test: `scripts/task-runner-dialogue.test.mjs`

- [ ] Render one role-aware employee entrance bubble from `sub-start`.
- [ ] Change `sub-accepted` and `sub-started` to progress-only updates so they do not duplicate the employee entrance.
- [ ] Render employee progress logs, completion, and error messages with the first-person presentation helpers.
- [ ] Remove protocol, executor, and conversation metadata from those user-facing bubbles while retaining the source event data.
- [ ] Run `npm run test:dialogue`, `npm run test:demo-timeline`, and `npm run test:runtime`.

### Task 3: Verify the existing preview contract

**Files:**
- Verify: `src/salebuddy/ui/task-runner.js`

- [ ] Run `node --check src/salebuddy/ui/task-runner.js`.
- [ ] Confirm the existing port 8890 process still runs.
- [ ] Fetch the served module from port 8890 and confirm the human dialogue helpers are present.
