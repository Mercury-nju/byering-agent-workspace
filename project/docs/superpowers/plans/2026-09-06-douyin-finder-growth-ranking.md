# Douyin Finder Growth Ranking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Return topic-relevant Douyin candidates ranked by verified follower growth for growth-oriented finder requests.

**Architecture:** Extend the existing TikHub account resolver with a normalized trend comparison capability, then let the finder service detect growth intent, enforce topic relevance from retrieved content, attach trend evidence, and sort results. Keep provider-specific response parsing inside the resolver boundary.

**Tech Stack:** Node.js ESM, built-in `fetch`, Node test runner.

---

### Task 1: Trend Provider Contract

**Files:**
- Modify: `backend/account-resolver.js`
- Test: `scripts/account-resolver.test.mjs`

- [ ] Add a failing test for five-account trend comparison normalization.
- [ ] Verify the test fails because `compareTrends` is unavailable.
- [ ] Implement TikHub `/api/v1/douyin/index/fetch_daren_compare_users_stable` batching and normalization.
- [ ] Verify resolver tests pass.

### Task 2: Growth Intent And Topic Relevance

**Files:**
- Modify: `backend/douyin-finder-service.js`
- Test: `scripts/douyin-finder-service.test.mjs`
- Test: `scripts/douyin-finder-comprehensive.test.mjs`

- [ ] Add failing tests for 7-day and 30-day growth intent.
- [ ] Add a failing test that excludes generic science accounts from an AI science request.
- [ ] Implement deterministic growth-intent and topic-signal extraction.
- [ ] Verify finder unit tests pass.

### Task 3: Ranking And Evidence

**Files:**
- Modify: `backend/douyin-finder-service.js`
- Test: `scripts/douyin-finder-comprehensive.test.mjs`

- [ ] Add a failing test that ranks topic-matched accounts by `newFollowers`.
- [ ] Add a failing test that marks missing trend data as partial instead of fabricating a rank.
- [ ] Attach normalized trend evidence, capability metadata, and ranking reasons.
- [ ] Verify all finder tests pass.

### Task 4: Real Product Verification

**Files:**
- No production file changes expected.

- [ ] Restart the backend with the latest code.
- [ ] Submit the exact user goal through `/v1/connectors/douyin-finder/run`.
- [ ] Verify candidates are topic-relevant and ordered by real follower growth.
- [ ] Verify the stored run contains growth evidence and no placeholder ranking.

