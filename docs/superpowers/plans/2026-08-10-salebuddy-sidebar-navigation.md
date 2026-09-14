# SaleBuddy Sidebar Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the recovered app sidebar into the approved grouped navigation while preserving every supported destination and all existing room, dashboard, and native navigation behavior.

**Architecture:** `nav-framework.js` remains the single presentation owner for grouping, proxy entries, active state, collapse state, and lifecycle. `office-switch.js` remains the sole room-data owner, while `kanban.js` exposes readiness and active state through one document-level navigation event contract. Pure navigation reducers and forwardability checks are exported from the existing module so Node tests can verify behavior without introducing a DOM library.

**Tech Stack:** Browser-native ES modules, DOM `CustomEvent`/`MutationObserver`, existing recovered renderer, Node.js test scripts.

**Workspace note:** The recovered project is currently an untracked directory inside the parent Git repository, so a standard worktree would not contain the source tree. Implementation runs on branch `codex/sidebar-navigation` in the current directory and stages only explicitly listed files.

**Command convention:** Every command below runs from `/Users/mercury/Documents/拆包marvis/Marvis-recovered`. Node/npm commands use `project/` or `npm --prefix project`; Git paths are relative to this directory.

**Execution setup:** Before Task 1, commit this reviewed plan alone with `git add docs/superpowers/plans/2026-08-10-salebuddy-sidebar-navigation.md && git commit -m "docs: plan sidebar navigation implementation"`. This makes the plan part of the final `f1cb38b..HEAD` scope audit.

---

### Task 1: Lock Navigation State and Structure Contracts

**Files:**
- Create: `project/scripts/nav-framework.test.mjs`
- Modify: `project/src/salebuddy/ui/nav-framework.js`
- Modify: `project/package.json`

- [ ] **Step 1: Write failing pure-contract tests**

Add tests that import the intended exports before they exist:

```js
import {
  NAV_EVENT,
  NAV_LAYOUT,
  NAV_MODES,
  navigationBlueprint,
  reduceNavigationState,
  reduceKnowledgeState,
  knowledgeExpanded,
  canForwardNative
} from "../src/salebuddy/ui/nav-framework.js";

test("navigation blueprint matches approved grouped order", () => {
  assert.deepEqual(navigationBlueprint().map((group) => [group.id, group.items]), [
    ["work", ["office", "kanban", "contacts"]],
    ["capabilities", ["skills", "agentSquare", "files", "resources"]],
    ["knowledge", ["kbDocs", "kbMemory"]]
  ]);
});

test("navigation layout constants match the approved geometry", () => {
  assert.deepEqual(NAV_LAYOUT, { primaryRow: 40, iconBox: 20, projectRow: 32, childIndent: 28 });
});

test("stale close cannot clear a newer active destination", () => {
  assert.equal(reduceNavigationState("contacts", { mode: "kanban", active: false }), "contacts");
  assert.equal(reduceNavigationState("kanban", { mode: "kanban", active: false }), null);
});

test("navigation details reject invalid modes and non-boolean active values", () => {
  assert.deepEqual(NAV_MODES, ["newTask", "office", "kanban", "skills", "contacts", "agentSquare", "files", "resources", "kbDocs", "kbMemory"]);
  assert.equal(reduceNavigationState("contacts", { mode: "unknown", active: true }), "contacts");
  assert.equal(reduceNavigationState("contacts", { mode: "kanban", active: "yes" }), "contacts");
  assert.equal(reduceNavigationState("contacts", { mode: "kanban", active: true }), "kanban");
});

test("knowledge stays expanded while a child route is active", () => {
  assert.equal(knowledgeExpanded({ activeMode: "kbDocs", userExpanded: false }), true);
  assert.equal(knowledgeExpanded({ activeMode: "contacts", userExpanded: false }), false);
});

test("knowledge restores the prior user preference after leaving a child", () => {
  let state = { userExpanded: false, activeMode: null };
  state = reduceKnowledgeState(state, { type: "toggle" });
  assert.equal(state.userExpanded, true);
  state = reduceKnowledgeState(state, { type: "activate", mode: "kbDocs" });
  assert.equal(knowledgeExpanded(state), true);
  assert.deepEqual(reduceKnowledgeState(state, { type: "toggle" }), state);
  state = reduceKnowledgeState(state, { type: "activate", mode: "contacts" });
  assert.equal(knowledgeExpanded(state), true);
});

test("kanban proxy waits for the native takeover marker", () => {
  assert.equal(canForwardNative("kanban", { isConnected: true, dataset: {} }), false);
  assert.equal(canForwardNative("kanban", { isConnected: true, dataset: { sbKanban: "1" } }), true);
});
```

- [ ] **Step 2: Run the test to verify RED**

Run: `(cd project && node --test scripts/nav-framework.test.mjs)`
Expected: FAIL because the contract exports do not exist.

- [ ] **Step 3: Add the minimal pure exports**

In `nav-framework.js`, add the exact event constant, layout constants used by the CSS template, allowed mode set, immutable blueprint, reducer, knowledge-state helper, and native forwardability helper. These helpers must not read `document` or mutate DOM.

- [ ] **Step 4: Run the focused test to verify GREEN**

Run: `(cd project && node --test scripts/nav-framework.test.mjs)`
Expected: all Task 1 tests PASS.

- [ ] **Step 5: Connect the test to the full suite**

Add `test:nav` and include it in `test:all` in `package.json`.

- [ ] **Step 6: Commit the contract layer**

```bash
git add project/scripts/nav-framework.test.mjs \
  project/src/salebuddy/ui/nav-framework.js \
  project/package.json
git commit -m "test: define sidebar navigation contracts"
```

### Task 2: Build the Grouped Sidebar and Lifecycle

**Files:**
- Modify: `project/scripts/nav-framework.test.mjs`
- Modify: `project/src/salebuddy/ui/nav-framework.js`

- [ ] **Step 1: Add failing structure and lifecycle assertions**

Build a small executable fake DOM and fake `MutationObserver` inside `nav-framework.test.mjs`, install them on `globalThis`, create a realistic recovered-sidebar fixture, and call the real `mountNavFramework()`. Do not substitute source-string assertions for the behaviors below. Verify:

- two consecutive mounts produce one owner, style, set of groups, and listener set;
- work, capability, and knowledge groups occur in the approved order;
- search stays in its native parent, office stays in its native parent, and history stays in its native parent;
- with search present/absent and history empty/non-empty, injected siblings still produce the approved visual order without moving native React nodes;
- missing native targets are disabled and forward zero clicks, then enable when the native target appears;
- kanban is disabled without `data-sb-kanban="1"`, enabled when the marker appears, and disabled again when that node is replaced;
- every proxy click forwards exactly once;
- programmatic native `class`/`aria-current` changes for new task, office, and skills update active state;
- search, history, browser-back simulation, and every custom mode clear the prior active state;
- the entire sidebar root can be replaced three times without duplicate groups/listeners;
- unmount removes proxies, owner, style, observers, and listeners, restores hidden native rows, and a later mount starts clean;
- every transition leaves at most one `.sb-nav-on` and one `aria-current="page"`.

Also assert the real rendered knowledge DOM state sequence: default `aria-expanded="false"` + right arrow + hidden children; user-expanded state; forced expansion for `kbDocs`/`kbMemory`; parent clicks ignored during child activation; prior preference restored after leaving.

- [ ] **Step 2: Run the focused test to verify RED**

Run: `npm --prefix project run test:nav`
Expected: FAIL on missing grouped DOM/lifecycle markers.

- [ ] **Step 3: Replace the fragmented injected sections**

Refactor `mountNavFramework()` so it:

1. leaves the visible native search, office, project-box, and history nodes in their original React-managed parents;
2. injects proxy rows for kanban and skills, plus existing custom destinations;
3. hides duplicate native plugin entries without moving React-owned nodes;
4. preserves native search and non-empty history UI;
5. renders a bottom knowledge parent with `kbDocs`/`kbMemory` children;
6. applies the approved spacing, grouping, active, hover, and disabled styles;
7. uses only injected sibling anchors plus CSS/order for the work-group visual flow; it never appends or moves a native React node into a SaleBuddy container;
8. observes a stable sidebar ancestor and repairs the structure after root replacement;
9. guarantees singleton mount/unmount semantics.

- [ ] **Step 4: Implement exact native proxy behavior**

Resolve the current native target immediately before every forwarded click. Require `data-sb-kanban="1"` for kanban; set `aria-disabled="true"` when a required target is absent or not ready. Dispatch/listen to `NAV_EVENT` on `document` and run all changes through `reduceNavigationState()`.

- [ ] **Step 5: Run the focused test to verify GREEN**

Run: `npm --prefix project run test:nav`
Expected: all navigation tests PASS.

- [ ] **Step 6: Commit the grouped framework**

```bash
git add project/scripts/nav-framework.test.mjs \
  project/src/salebuddy/ui/nav-framework.js
git commit -m "feat: group sidebar navigation"
```

### Task 3: Integrate Room, Kanban, and Legacy Native State

**Files:**
- Modify: `project/scripts/nav-framework.test.mjs`
- Modify: `project/src/salebuddy/ui/office-switch.js`
- Modify: `project/src/salebuddy/ui/kanban.js`
- Modify: `project/src/salebuddy/ui/sidebar-customization.js`

- [ ] **Step 1: Add failing integration contract tests**

Extend the executable fake-DOM tests to assert that:

- `office-switch.js` alone renders 0, 1, and 3 rooms, live count text, current marker, and empty state; refresh changes the count without copying room data into `nav-framework.js`;
- office-switch styles consume the tested `NAV_LAYOUT.projectRow` and `NAV_LAYOUT.childIndent` values; fake DOM does not claim to compute CSS layout;
- after three consecutive whole-sidebar root replacements, the project box, all live rooms, count, and current marker recover and each exists exactly once;
- office switch dispatches `{ mode: "office", active: true }` after room changes;
- kanban dispatches `active:true` when opened and `active:false` when closed;
- kanban takeover marker is removed on unmount;
- conditional native `应用`, `文档`, `图库`, and `此电脑` entries are reversibly hidden, while search/history are not in the hide set;
- sidebar root replacement reapplies hiding, and `unmount()` restores every hidden native entry and removes its observer/style;
- all events use `NAV_EVENT` and the exact document target/detail shape.

- [ ] **Step 2: Run the focused test to verify RED**

Run: `npm --prefix project run test:nav`
Expected: FAIL on missing integration notifications and legacy-entry rules.

- [ ] **Step 3: Update room and kanban owners**

Keep all room state in `office-switch.js`; add only the room-count presentation and navigation notification. Re-anchor its observer to a stable ancestor (or run a controlled document-level re-resolution) so whole-sidebar replacement restores exactly one project box; clean up the added observer/listeners on unmount. Keep `pageOpen` in `kanban.js`; notify the navigation layer at open/close, and preserve the existing `data-sb-kanban` ready marker lifecycle.

- [ ] **Step 4: Update conditional legacy navigation cleanup**

Extend `sidebar-customization.js` to hide the explicitly replaced local entries by exact normalized text without removing React-owned nodes. Record original `hidden`, inline display, and accessibility state so `unmount()` can fully restore them. Do not hide or rename search and history items.

- [ ] **Step 5: Run focused and related suites**

Run: `npm --prefix project run test:nav && npm --prefix project run test:kanban && npm --prefix project run test:rooms`
Expected: all tests PASS.

- [ ] **Step 6: Commit integrations**

```bash
git add project/scripts/nav-framework.test.mjs \
  project/src/salebuddy/ui/office-switch.js \
  project/src/salebuddy/ui/kanban.js \
  project/src/salebuddy/ui/sidebar-customization.js
git commit -m "feat: synchronize sidebar navigation state"
```

### Task 4: Verify Behavior and Visual Quality

**Files:**
- Modify if required: files changed in Tasks 1–3 only

- [ ] **Step 1: Run syntax and full regression checks**

Run:

```bash
node --check project/src/salebuddy/ui/nav-framework.js
node --check project/src/salebuddy/ui/office-switch.js
node --check project/src/salebuddy/ui/kanban.js
node --check project/src/salebuddy/ui/sidebar-customization.js
npm --prefix project run test:all
```

Expected: syntax checks exit 0, every suite reports 0 failures, and the 256-file office integrity baseline remains unchanged.

- [ ] **Step 2: Inspect desktop layouts**

Start `npm --prefix project run dev` and open `http://127.0.0.1:8888/`. At 1440×1000 and 1280×800, capture screenshots and record `getComputedStyle()`/bounding-box measurements: primary rows 40px, icon boxes 20px, project rows 32px, child text indentation 28±1px, and `scrollWidth <= clientWidth`. At 800px height, verify knowledge is reachable by vertical scroll while the native fixed new-task area remains visible and unobscured.

- [ ] **Step 3: Exercise every destination and recovery path**

Click new task, search if present, office, every project, history if present, kanban, skills, contacts, Agent Square, files, resources, docs, and memory. Confirm one active destination at a time. The automated Task 2 test—not a page refresh—remains the evidence for three same-instance root replacements.

- [ ] **Step 4: Run a final diff and scope check**

Run: `git diff --check f1cb38b..HEAD && git diff --name-only f1cb38b..HEAD`
Expected: no whitespace errors; because the reviewed plan is committed before Task 1, the name list contains only the approved spec/plan plus plan-approved source/test/package files.

- [ ] **Step 5: Commit any verification-only correction**

Only if Step 2 or 3 required a source correction, commit the smallest fix with an English `fix:` message after reproducing it with a failing test.
