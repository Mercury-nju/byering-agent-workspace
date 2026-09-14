# Douyin Finder Consumer Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Douyin finder API form with a consumer-first, one-action task flow while preserving real execution guarantees.

**Architecture:** Keep the existing finder result contract, connect the configured account-search provider as the discovery source, merge optional references with discovered candidates, and reuse the existing local file parser in Agent Square.

**Tech Stack:** Vanilla JavaScript UI, CSS embedded in `agent-square.js`, Node test runner, Playwright through the in-app browser.

---

### Task 1: Lock the consumer contract

**Files:**
- Modify: `scripts/agent-square-auth-ui.test.mjs`

- [ ] Add assertions for the goal-first heading, batch paste, file upload, collapsed advanced settings, and `开始找人`.
- [ ] Assert the setup flow does not contain API/provider terminology or a review transition.
- [ ] Run the focused test and verify that it fails for the current form.

### Task 2: Refactor the finder setup

**Files:**
- Modify: `src/salebuddy/ui/agent-square.js`

- [ ] Add finder file state and deduplicated source helpers.
- [ ] Build the natural-language goal surface and prompt suggestions.
- [ ] Add batch paste and local file upload.
- [ ] Move optional controls into a collapsed advanced section.
- [ ] Replace the review transition with direct real execution.
- [ ] Remove the finder review step from rendering and step labels.

### Task 3: Make running state provider-backed

**Files:**
- Modify: `src/salebuddy/ui/agent-square.js`
- Modify: `scripts/agent-square-auth-ui.test.mjs`

- [ ] Remove simulated finder percentages.
- [ ] Rename counts to distinguish supplied accounts, validated accounts, and matching accounts.
- [ ] Keep failure and no-result actions on the setup path.

### Task 4: Verify the product flow

**Files:**
- Test: `scripts/agent-square-auth-ui.test.mjs`
- Test: `scripts/douyin-finder-service.test.mjs`
- Test: `scripts/douyin-finder-http.test.mjs`

- [ ] Run focused automated tests.
- [ ] Reload the local product and verify desktop layout.
- [ ] Verify a narrow viewport without overflow or overlapping controls.
- [ ] Confirm both local servers remain healthy.
