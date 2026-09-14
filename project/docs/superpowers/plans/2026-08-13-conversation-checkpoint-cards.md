# Conversation Checkpoint Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve task conversations by making requirement, progress, approval, recovery, and result checkpoints clear interactive cards while keeping ordinary messages natural.

**Architecture:** Keep `task-runner.js` as the existing runtime event renderer and add a small presentation layer inside `openConversation` that owns stable checkpoint nodes. Runtime events remain the source of truth; lifecycle-only events update cards in place, while meaningful findings remain human-readable employee messages. No backend or persistence changes are needed.

**Tech Stack:** Existing vanilla DOM UI, CSS injected by `task-runner.js`, Node test runner, existing task runtime events and stores.

---

### Task 1: Add presentation-model tests

**Files:**
- Modify: `scripts/task-runner-dialogue.test.mjs`
- Test: `src/salebuddy/ui/task-runner.js` source-level renderer contracts

- [ ] **Step 1: Add failing assertions for checkpoint ownership**

Assert that the renderer contains stable checkpoint keys/classes for requirement, progress, approval, recovery, and result cards; lifecycle events do not call the generic message renderer; and `run-finished` does not create a duplicate completion bubble.

- [ ] **Step 2: Add failing assertions for accessibility and actions**

Assert `aria-expanded`, `aria-controls`, `aria-live="polite"`, `role="progressbar"`, and real button labels for confirmation, approval, recovery follow-up, and result continuation.

- [ ] **Step 3: Run focused tests**

Run: `npm run test:dialogue`

Expected: FAIL because the new checkpoint contracts are not implemented.

### Task 2: Refine checkpoint visual primitives

**Files:**
- Modify: `src/salebuddy/ui/task-runner.js:30-200`

- [ ] **Step 1: Add shared card surface and state styles**

Define compact card shells, section labels, metadata rows, action groups, focus states, and state colors for active, complete, approval, paused, and failed states. Keep the existing neutral Byering palette and restrained radii.

- [ ] **Step 2: Add progress collapse/expand styles**

Add a summary header, hidden detail region, responsive employee rows, latest-event line, and `prefers-reduced-motion` behavior without changing the surrounding chat geometry.

- [ ] **Step 3: Run syntax and focused tests**

Run: `node --check src/salebuddy/ui/task-runner.js && npm run test:dialogue`

Expected: syntax passes; contract tests remain red until renderer changes land.

### Task 3: Implement the requirement checkpoint card

**Files:**
- Modify: `src/salebuddy/ui/task-runner.js:1360-1520`

- [ ] **Step 1: Add a required-field resolver**

Treat task description, business objective, deliverable, and stop boundary as required. Treat null, undefined, blank strings, `待确认`, `需要补充`, and `未填写` as missing. Use `按已授权的最小范围` for an absent optional scope.

- [ ] **Step 2: Render the card with stable DOM references**

Use a semantic `section`, `aria-live="polite"`, explicit field labels, a disabled `确认并开始` button when required fields are missing, and a composer-focused `补充信息` action.

- [ ] **Step 3: Preserve existing confirmation behavior**

Route confirmation to `confirmRequirement(engine, { actor: "user", action: "confirm", channel: "requirement-card" })`; resolve the card in place and do not create a second requirement card during follow-ups.

- [ ] **Step 4: Run tests**

Run: `npm run test:dialogue`

Expected: requirement gate tests pass.

### Task 4: Convert live execution into one progress card

**Files:**
- Modify: `src/salebuddy/ui/task-runner.js:1280-1410,1660-1930`

- [ ] **Step 1: Replace the verbose progress message with a stable progress card**

Create one card keyed by the current task, with an overall status, completed count, current employee, progress bar, and expandable detail region. Render employee avatars, roles, states, latest event, and artifact links in place.

- [ ] **Step 2: Map lifecycle events to row updates**

Handle `sub-show`, `sub-started`, `sub-log`, `sub-done`, and `progress` by updating existing row nodes. Keep meaningful `sub-log` findings as natural employee messages; do not add messages for accepted/started/completed protocol-only events.

- [ ] **Step 3: Implement expansion behavior**

Toggle `aria-expanded` and `aria-controls`, preserve the user's expanded state across updates, default open on first creation, and collapse to an audit summary after the first meaningful employee update.

- [ ] **Step 4: Run tests**

Run: `npm run test:dialogue && npm run test:team`

Expected: progress rendering and existing team-status behavior pass.

### Task 5: Improve approval and recovery checkpoints

**Files:**
- Modify: `src/salebuddy/ui/task-runner.js:1375-1450,1600-1660,1940-1960`

- [ ] **Step 1: Upgrade approval card content and actions**

Show action, impact scope, channel, risk, and preview entry. Keep `确认执行` and `暂不执行`; after rejection, expose `调整需求并创建后续任务` that only pre-fills the existing homepage task composer for a separate task.

- [ ] **Step 2: Add a recovery card for blocked/failed states**

Replace error-only text bubbles with a card that states the preserved work and failed step, then offers contextual `补充信息`, `修改范围`, or `交给人工` actions. Reuse current follow-up and handoff behavior; do not add retry orchestration.

- [ ] **Step 3: Run tests**

Run: `npm run test:dialogue`

Expected: approval rejection, recovery follow-up, and protocol-language tests pass.

### Task 6: Add a result card and finish-state handoff

**Files:**
- Modify: `src/salebuddy/ui/task-runner.js:1450-1515,1930-1970`

- [ ] **Step 1: Render result summary once**

Use up to three real metrics when available; otherwise show a concise outcome statement. Include files, completed scope, and a contextual next action.

- [ ] **Step 2: Keep progress as a compact completed audit trail**

Mark the progress card completed and suppress the generic `run-finished` text bubble. Attach files to the result card when summary is present, including late-arriving artifacts.

- [ ] **Step 3: Update the composer placeholder**

Change it to `继续追问结果，或安排下一步工作…` after summary and restore the normal follow-up placeholder for active or paused tasks.

- [ ] **Step 4: Run tests**

Run: `npm run test:dialogue && npm run test:feed && npm run test:brand`

Expected: all focused tests pass.

### Task 7: Verify the complete conversation experience

**Files:**
- Test: `scripts/task-runner-dialogue.test.mjs`
- Test: manual browser verification on the existing local server

- [ ] **Step 1: Run focused and related suites**

Run: `npm run test:dialogue && npm run test:team && npm run test:feed && npm run test:brand`

- [ ] **Step 2: Run manual desktop checks**

Verify requirement confirmation, progress collapse/expand, approval rejection, recovery follow-up, result card, late files, long employee names, and no duplicate lifecycle messages.

- [ ] **Step 3: Run manual mobile and reduced-motion checks**

Verify card actions remain reachable, progress rows do not overflow, and animations are removed when reduced motion is enabled.
