# Byering Rebrand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every customer-visible SaleBuddy/Marvis identity with Byering and the supplied bird logo while preserving raw history, technical namespaces, and frozen Office assets.

**Architecture:** A small source-owned brand module owns exact alias projection and the only controlled main-profile migration. The existing wordmark adapter becomes a reversible image/text owner with an early inline guard. Browser response patching is extracted into a pure module and wired back into the HTTP server; Electron receives explicit app/window/icon configuration and uses the same renderer adapter under `file://`.

**Tech Stack:** Vanilla JavaScript ES modules, Node built-in test runner, recovered DOM adapters, Electron reconstruction, PNG assets, CSS.

---

## File map

- Create: `project/src/salebuddy/brand.js`, `project/scripts/brand.test.mjs`, `project/scripts/brand-patch.mjs`, `project/scripts/brand-allowlist.json`, and `project/assets/byering-logo-{source,512,128,64}.png`.
- Modify: `project/src/salebuddy/ui/wordmark.js`, `project/src/salebuddy/index.js`, `project/index.html`, `project/package.json`.
- Modify: `project/scripts/static-server.mjs`, `project/scripts/agent-store.mjs`, `project/scripts/gateway-mock.mjs`, `project/scripts/rooms-store.mjs`, `project/electron/main-reconstructed.mjs`.
- Modify: exact surfaces in `project/src/salebuddy/ui/file-center.js`, `agent-drawer.js`, `contacts-page.js`, `rooms-page.js`, `task-runner.js`, `agent-profile.js`, `sales-skills.js`, `knowledge-page.js`, `kanban.js`, `office-switch.js`, and `agent-card-chat.js`.
- Modify exact customer surfaces: `project/src/salebuddy/agents/model.js`, `agents/dm-scenarios.js`, `ui/file-center.js`, `ui/agent-drawer.js`, `ui/contacts-page.js`, `ui/rooms-page.js`, `ui/task-runner.js`, `ui/agent-profile.js`, `ui/sales-skills.js`, `ui/knowledge-page.js`, `ui/kanban.js`, `ui/office-switch.js`, and `ui/agent-card-chat.js`.

### Task 1: Compatibility model and disk migration

**Files:** `brand.js`, `brand.test.mjs`, `agent-store.mjs`, `package.json`.

- [ ] **Step 1: Write RED tests.** Add named tests `projects exact legacy aliases`, `projects semantic main identity`, `preserves custom names`, `migrates exact main profile fields`, `migration is idempotent`, `keeps reportsTo technical id`, `projects createdBy without mutating raw value`, and `preserves incidental legacy text in user messages`.

```js
assert.equal(projectBrandName("SaleBuddy"), "Byering");
assert.equal(projectBrandName("Marvis(马维斯)"), "Byering(幕僚长)");
assert.equal(displayAgentName({ agentType: "main" }), "Byering · 幕僚长");
const next = migrateMainProfile(legacy);
assert.equal(next.identity.name, "Byering · 幕僚长");
assert.equal(next.role.position, "Byering · 幕僚长");
assert.equal(next.role.reportsTo, "main");
assert.equal(next.meta.brandMigration, "byering-v1");
assert.equal(renderIdentityMarkdown(next).split("\n", 1)[0], "# Byering · 幕僚长");
assert.deepEqual(migrateMainProfile(next), next);
assert.equal(displayCreatedBy("SaleBuddy", { agentType: "main" }), "Byering · 幕僚长");
assert.equal(projectMessage({ from: "user", text: "SaleBuddy is in the quote" }).text, "SaleBuddy is in the quote");
```

- [ ] **Step 2: Run RED.** `node --test project/scripts/brand.test.mjs`; expected failure because `brand.js` and migration wiring do not exist.
- [ ] **Step 3: Implement.** Export `BRAND`, exact `LEGACY_BRAND_ALIASES`, `projectBrandName`, `displayAgentName`, `displayCreatedBy`, `projectMessage`, and `migrateMainProfile`. In `agent-store.mjs:getProfile`, migrate and persist `meta.brandMigration` once, rewriting only `identity.name`, `role.position`, and generated `IDENTITY.md`; never rewrite message/history files and keep `role.reportsTo: "main"`.
- [ ] **Step 4: Run GREEN.** `node --test project/scripts/brand.test.mjs`; expected all Task 1 tests pass, including a temp disk profile fixture whose second read is byte-stable and whose IDENTITY heading is exactly `# Byering · 幕僚长`.
- [ ] **Step 5: Commit.** `git add project/src/salebuddy/brand.js project/scripts/brand.test.mjs project/scripts/agent-store.mjs project/package.json && git commit -m "feat: add Byering brand compatibility"`.

### Task 2: Early guard, assets, and reversible wordmark

**Files:** `wordmark.js`, `index.js`, `index.html`, `brand.test.mjs`, four new PNGs.

- [ ] **Step 1: Write RED tests.** Add named tests `logo source has expected sha256 and dimensions`, `derived logos decode at exact dimensions`, `early guard precedes recovered bundle`, `wordmark claims one node per route generation`, `wordmark unmount restores SVG and image attributes`, `adjacent logo has empty alt and labelled container`, `standalone logo has Byering alt`, `logo images use contain without distortion`, `sidebar stays within 154px at DPR 1 and DPR 2`, `image error keeps Byering text fallback`, and `cold-start surfaces use explicit logo assets`.
- [ ] **Step 2: Run RED.** `node --test project/scripts/brand.test.mjs`; expected asset/guard/wordmark failures.
- [ ] **Step 3: Add reproducible assets.** Use `/var/folders/ns/r8j465_n6fv4jky_zbhhws980000gn/T/codex-clipboard-b3a52dc9-e945-4cec-a3c6-a953841f84f4.png`: `cp /var/folders/ns/r8j465_n6fv4jky_zbhhws980000gn/T/codex-clipboard-b3a52dc9-e945-4cec-a3c6-a953841f84f4.png project/assets/byering-logo-source.png`; generate exact outputs with `sips -z 512 512 project/assets/byering-logo-source.png --out project/assets/byering-logo-512.png`, and equivalent `128` and `64` commands. The expected source SHA-256 is `d7de6f22e9f749b3072229211d6e2f662e5848a588dd8ccf54ac4d21ded6f4bc`. Assert PNG signature, that literal hash, dimensions, RGB/opaque mode, and unchanged recovered hash assets. Stop and request the image again if the source path is unavailable.
- [ ] **Step 4: Add early guard.** In `index.html`, before either module script, add `<style id="byering-early-guard">html[data-byering-guard="pending"] #root{visibility:hidden!important}</style>` and an inline script setting `document.documentElement.dataset.byeringGuard="pending"` and `document.title="Byering"`. In `index.js`, call `mountWordmark()` synchronously before `connectGateway()` and release the guard only after its first sweep claims the root or a 2-second fallback replaces legacy selectors. Tests parse script ordering and fake the first-paint root to prove no legacy brand is visible before release under HTTP and `file://`.
- [ ] **Step 5: Implement owner.** Extend `wordmark.js` with owned markers, snapshots, observer, and unmount. Render sidebar 24 px, home 72 px, About 32 px, onboarding 64 px. Replace home mascot/static animation, launcher/cold-start logo, About icon, and stop-state product illustration with `byering-logo-128.png`, `byering-logo-128.png`, `byering-logo-64.png`, and `byering-logo-512.png`; leave Office sprites/animations unchanged.
- [ ] **Step 6: Run GREEN and commit.** `node --test project/scripts/brand.test.mjs`; expected all Task 2 tests pass. Commit `git add project/assets/byering-logo-*.png project/src/salebuddy/ui/wordmark.js project/src/salebuddy/index.js project/index.html project/scripts/brand.test.mjs && git commit -m "feat: apply Byering visual identity"`.

### Task 3: Source surfaces, seeds, and historical projection

**Files:** the exact UI/data files in the file map, plus `brand.test.mjs`.

- [ ] **Step 1: Write RED tests.** Add named tests `new defaults and seeds render Byering`, `main room and DM messages project to Byering`, `createdBy projection is semantic and non-destructive`, `user body keeps incidental aliases`, `reportsTo renders Byering while staying main`, `task parser accepts SaleBuddy Marvis and Byering`, `office title accepts three aliases`, `raw DM room output and history remain unchanged`, and `source scan matches explicit allowlist`.
- [ ] **Step 2: Run RED.** `node --test project/scripts/brand.test.mjs`; expected failures from current defaults, seeds, and renderers.
- [ ] **Step 3: Update exact surfaces.** Use helpers in `file-center.js`, `agent-drawer.js`, `contacts-page.js`, `rooms-page.js`, `task-runner.js`, `agent-profile.js`, `sales-skills.js`, `knowledge-page.js`, `kanban.js`, `office-switch.js`, and `agent-card-chat.js`. Update `model.js`, `dm-scenarios.js`, `gateway-mock.mjs`, and `rooms-store.mjs` seeds to Byering. Deep-clone representative DM messages, room messages, `createdBy` file metadata, output metadata, and history arrays before rendering; assert deep equality afterward and preserve incidental message-body aliases. Do not globally replace customer message bodies.
- [ ] **Step 4: Run GREEN.** `node --test project/scripts/brand.test.mjs && npm --prefix project run test:nav && npm --prefix project run test:rooms`; expected all pass.
- [ ] **Step 5: Commit.** `git add project/src/salebuddy project/scripts/{agent-store,gateway-mock,rooms-store,brand.test}.mjs && git commit -m "feat: rename customer surfaces to Byering"`.

### Task 4: Browser and Electron runtime

**Files:** `brand-patch.mjs`, `static-server.mjs`, `main-reconstructed.mjs`, `index.html`, `brand.test.mjs`.

- [ ] **Step 1: Write RED tests.** Add named tests `browser patch transforms every legacy literal`, `browser patch preserves technical identifiers`, `served HTTP bundle contains Byering`, `served HTTP bundle leaves frozen bytes unchanged`, `Electron config sets app and window names before ready`, `Electron config selects platform and Dock icon`, and `file URL fixture mounts shared adapter`.
- [ ] **Step 2: Run RED.** `node --test project/scripts/brand.test.mjs`; expected failures from current HTTP/Electron wiring.
- [ ] **Step 3: Implement browser path.** Extract the replacement table to `brand-patch.mjs`; export `createServer` from `static-server.mjs`. Start `MARVIS_PORT=4199 MARVIS_GATEWAY_PORT=5199 node project/scripts/static-server.mjs --port 4199`, fetch `/index.html`, `/assets/main-BaWVt8Sl.js`, `/assets/treemap-KZPCXAKY-Dm7XgKSQ.js`, and each four logo URLs, assert Byering output and HTTP 200 PNG signatures, and compare original file hashes before/after.
- [ ] **Step 4: Implement Electron path.** Call `app.setName("Byering")` before `whenReady`, set BrowserWindow title, Windows/Linux icon, macOS Dock icon, and menu/app name using the 128 px asset. Preserve package name, IPC channels, URLs, and frozen files. The `file://` fixture loads all four logo assets from `project/assets` and asserts `HTMLImageElement.complete` plus natural dimensions.
- [ ] **Step 5: Run GREEN and commit.** `node --test project/scripts/brand.test.mjs`; expected browser/Electron tests pass. Commit `git add project/scripts/brand-patch.mjs project/scripts/static-server.mjs project/electron/main-reconstructed.mjs project/index.html project/scripts/brand.test.mjs && git commit -m "feat: brand browser and Electron as Byering"`.

### Task 5: Full verification and visual acceptance

- [ ] **Step 1: Wire tests.** Add `"test:brand": "node --test scripts/brand.test.mjs"` to `package.json` and include it in `test:all` before `test:nav`.
- [ ] **Step 2: Scan/syntax.** Run `rg -n "SaleBuddy|Marvis" project/src project/scripts project/electron project/index.html project/package.json project/browser-shim.js project/rooms project/agents project/cards project/components --glob '!assets/**' --glob '!recovered-*/**'`; compare every result to exact `{file,line,reason}` entries in `project/scripts/brand-allowlist.json`, whose entries must include the literal, exact relative file, and a reason enum of `legacy-input`, `technical-namespace`, or `test-fixture`. No comments/tests are implicitly allowed. Run `node --check` for every changed module and `git diff --check`.
- [ ] **Step 3: Run full suite.** `npm --prefix project run test:all`; expected exit 0, brand suite green, navigation suite green, and 256 Office files identical.
- [ ] **Step 4: Browser acceptance.** Start `MARVIS_PORT=4199 MARVIS_GATEWAY_PORT=5199 node project/scripts/static-server.mjs --port 4199`, open `http://127.0.0.1:4199/`, and inspect 1280 × 800 and 1440 × 900. Confirm sidebar width, `object-fit:contain`, no horizontal scroll, home masthead, DMs, About/onboarding, title, favicon, image-failure fallback, standalone logo `alt="Byering"`, adjacent logo `alt=""` + `aria-label`, and absence of visible SaleBuddy/Marvis.
- [ ] **Step 5: Electron acceptance.** Run `npm --prefix project run electron` and manually verify real `file://` startup, home, About/onboarding, window title, menu/app name, Windows/Linux taskbar icon or macOS Dock icon. Record platform-only limitations.
- [ ] **Step 6: Defect loop.** Request independent implementation review. For every finding, add a named failing test and run `node --test project/scripts/brand.test.mjs` to capture RED before changing code; then run focused and full GREEN checks, and commit the correction.
