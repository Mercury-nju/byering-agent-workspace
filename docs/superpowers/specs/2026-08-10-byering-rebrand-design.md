# Byering Visual Rebrand Design

**Date:** 2026-08-10
**Status:** Approved direction, pending written-spec review
**Decision:** Apply option A: replace every customer-visible SaleBuddy or Marvis brand touchpoint with Byering while preserving internal compatibility identifiers.

## Goal

Present one coherent product identity across the browser and reconstructed Electron shell:

```text
[Byering bird] Byering
               Byering · 幕僚长
```

The supplied full-colour bird artwork is the canonical logo. The rebrand must not reset rooms, tasks, memories, hired agents, files, or any other state stored under existing `salebuddy:*` keys.

## Brand contract

### Customer-visible identity

- Product name: `Byering`
- Main agent: `Byering · 幕僚长`
- Office title: `Byering办公室`
- Product attribution: `Byering 官方`
- Standalone image accessible name: `Byering`

No customer-visible surface may show `SaleBuddy` or `Marvis`. Both legacy names remain valid only as frozen DOM anchors, historical data values, parsers, technical identifiers, and explicit compatibility fixtures.

### Internal compatibility allowlist

Do not rename the following persisted or integration-facing identifiers:

- `src/salebuddy/` paths and exported class names;
- `salebuddy:*` local-storage keys;
- `salebuddy://` URLs and gateway action namespaces;
- `data-salebuddy-*`, CSS owner IDs, fixture IDs, and test selectors;
- internal console prefixes and current `marvis:*` Electron IPC channels;
- frozen bundle filenames and the Office integrity manifest.

Any retained `SaleBuddy` or `Marvis` occurrence outside this exact allowlist must be classified by the brand test as either a legacy input alias or a defect.

## Logo asset contract

The exact supplied PNG is committed without overwriting any recovered hash-named asset:

| Asset | Contract |
| --- | --- |
| `project/assets/byering-logo-source.png` | Canonical 1254 × 1254 source, byte-for-byte copy of the supplied image |
| `project/assets/byering-logo-512.png` | 512 × 512 opaque PNG, Lanczos downsample, full square composition retained |
| `project/assets/byering-logo-128.png` | 128 × 128 opaque PNG for UI and Electron window icons |
| `project/assets/byering-logo-64.png` | 64 × 64 opaque PNG for favicon and compact UI |

The supplied artwork's pale square background is intentional and remains opaque; no automatic background removal or colour adjustment is allowed. UI surfaces may apply a circular mask to the outer canvas, but must keep the complete bird inside the mask. Generated files are verified for dimensions and decoded image validity.

### Fixed display geometry

| Surface | Image size | Text treatment |
| --- | ---: | --- |
| Sidebar | 24 × 24 px | `Byering`, 20 px/800, 8 px gap |
| Home masthead | 72 × 72 px | `Byering`, existing 40 px title hierarchy |
| About | 32 × 32 px | `Byering`, existing 18 px hierarchy |
| Onboarding | 64 × 64 px | `Byering`, existing 40 px hierarchy |
| Favicon | 64 × 64 asset | no adjacent text |

The sidebar brand block must fit the existing 154 px content width without horizontal scrolling. At DPR 1 and DPR 2 the image uses `object-fit: contain` and must not distort. When image loading fails, the `Byering` text remains visible. When visible text is adjacent, the image uses `alt=""` and the brand container uses `aria-label="Byering"`; a standalone logo uses `alt="Byering"`.

## Runtime architecture

### Shared source-owned adapter

Extend the existing wordmark adapter into the single DOM-level visual brand owner. It must:

1. install an early, source-owned brand guard before recovered content becomes visible;
2. replace sidebar, home, About, onboarding, and main-agent logo/wordmark nodes;
3. project visible legacy brand text and accessible attributes to Byering;
4. observe route-driven node replacement without duplicating nodes or listeners;
5. restore every claimed node and injected style on unmount.

The adapter recognises the recovered Marvis nodes but never edits the frozen bundle on disk.

### Browser runtime

`scripts/static-server.mjs` continues its in-memory patch of the recovered bundle, but its customer-visible replacement target becomes Byering. Its replacement table must cover both current Marvis literals and any existing SaleBuddy outputs. Missing expected anchors remain explicit warnings. Browser tests request the served bundle and assert Byering output without changing the file bytes on disk.

### Electron runtime

Electron loads `index.html` through `file://`, so it cannot rely on the HTTP response patch. `electron/main-reconstructed.mjs` must set:

- `app.setName("Byering")` before ready;
- the BrowserWindow title;
- the 128 px window/taskbar icon on Windows and Linux;
- the 128 px Dock icon on macOS when supported.

The shared renderer adapter handles text, wordmarks, and in-page images under `file://`. Electron tests assert configuration and a renderer fixture verifies the same visible brand projection used by the browser path. The internal package name may remain `salebuddy`.

## Surface matrix

| Surface | Current source/anchor | Expected output |
| --- | --- | --- |
| Document/browser tab | `index.html` title and favicon | `Byering` + bird favicon |
| Sidebar | `sidebar_logo_title` SVG | 24 px bird + `Byering` |
| Home masthead | `agent_name` SVG and current mascot image | 72 px bird + `Byering` |
| About/onboarding | `_aboutAppName_`, `_txtMarvis_`, About icon | bird + `Byering` |
| Main-agent messages | `from === "main"`, `agentType === "main"` | `Byering · 幕僚长` |
| Marketplace/skills | creator and official attribution fields | `Byering` / `Byering 官方` |
| Office heading | native `*办公室` heading | `Byering办公室` |
| Knowledge/files | product manual and author examples | Byering copy |
| Recovered dialogs | persona, protocol, login restriction, repair, Dock, plugin, external-link and author fallback literals patched by `static-server.mjs` | Byering copy |
| Electron chrome | app name, menu/window title, taskbar/Dock icon | Byering + bird icon |
| Home mascot | current static mascot and logo-animation container | replace both states with `byering-logo-128.png` at 72 px; do not run or retain the legacy logo animation |
| Launcher/cold-start logo | current launcher/loading brand logo | replace with `byering-logo-128.png`, centred at the current visual bounds |
| About icon | current recovered app icon | replace with `byering-logo-64.png` at 32 px |
| Stop-state brand illustration | current Marvis stop-state illustration when used as product identity | replace with `byering-logo-512.png` inside the original bounds |
| Office scene graphics | office sprites, maps, agents, and animations | unchanged and frozen |

## Historical data strategy

Raw historical records remain stored under their existing keys and are not destructively rewritten.

### Read-time projection

- When semantic identity is available (`from === "main"`, `agentType === "main"`, or equivalent), render `Byering · 幕僚长` regardless of the stored display name.
- For legacy fields without semantic identity, use this exact mapping at the presentation boundary:

| Legacy value | Visible value |
| --- | --- |
| `SaleBuddy` | `Byering` |
| `Marvis` | `Byering` |
| `SaleBuddy · 幕僚长` | `Byering · 幕僚长` |
| `Marvis · 幕僚长` | `Byering · 幕僚长` |
| `Marvis(马维斯)` in the recovered persona dialog | `Byering(幕僚长)` |

- Preserve user-authored custom names and message body text. Do not replace incidental mentions inside customer content.
- `createdBy`, room messages, DM messages, and output metadata retain their raw stored values but use the projection helper when rendered.

### Idempotent default-profile migration

For the main agent only, migrate exact system defaults in `identity.name`, `role.position`, and generated `IDENTITY.md` display content from legacy aliases to Byering. This is the sole controlled exception to the no-rewrite policy for historical data. The migrated profile receives `meta.brandMigration: "byering-v1"`; rerunning the migration is a no-op, and custom values remain untouched. `role.reportsTo` stays the technical relationship ID `"main"` and is projected to `Byering · 幕僚长` only where a UI renders that relationship. New profiles, seeds, outputs, and generated identity files write Byering from the start. Tests compare immutable messages and output history before and after rendering to prove no record loss.

Legacy parsers accept `Byering`, `SaleBuddy`, and `Marvis`, including task signature stripping and main-agent card detection.

## Office freeze boundary

The 256-file Office baseline remains immutable. Office brand changes happen only through source-layer DOM projection or HTTP response transformation. The implementation must not modify the Office state machine, scene map, sprites, or animation assets. Title detection accepts `Marvis办公室`, `SaleBuddy办公室`, and `Byering办公室`, but renders only `Byering办公室`.

## Verification

Add `npm run test:brand` and include it in `test:all`. Focused tests cover:

- exact asset paths, dimensions, and HTTP/`file://` loadability;
- browser response-patch output and unchanged frozen bytes;
- Electron app/window/icon configuration;
- duplicate mount, route replacement, and complete unmount restoration;
- sidebar width, fixed sizes, DPR 1/DPR 2 CSS, image failure text fallback, and accessible naming;
- read-time projection for main-agent messages, DMs, outputs, and profiles;
- idempotent default-profile migration and unchanged custom/raw historical records;
- a precise internal-identifier and legacy-input allowlist.

Run `npm --prefix project run test:all`, `node --check` on changed modules, and the Office integrity check. Inspect the browser at 1280 × 800 and 1440 × 900. Then launch the real reconstructed shell with `npm run electron` and manually verify startup, home, About/onboarding, window title, app/menu name, and the platform window/taskbar/Dock icon under `file://`; a fixture alone does not satisfy Electron acceptance.

## Acceptance criteria

- No customer-visible screen mixes Byering with SaleBuddy or Marvis.
- The supplied bird is recognisable at every fixed size and the sidebar never overflows.
- Browser and Electron/file runtimes expose equivalent Byering branding.
- Existing local state and historical records remain readable; rendering does not mutate immutable history.
- Rebranding causes no layout shift, duplicated wordmark, inaccessible repeated label, or frozen-bundle change.
