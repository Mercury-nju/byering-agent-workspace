# Byering Blog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a useful Chinese knowledge blog to the independent Byering marketing site, with clean article URLs, SEO/GEO metadata, and a Vercel-ready static publish package.

**Architecture:** Keep the independent website repository separate from the core Agent workspace. Add a small route resolver that renders the existing homepage at `/`, the blog index at `/blog/`, and article pages at `/blog/<slug>/`; query fallbacks remain `/?page=blog` and `/?page=blog&article=<slug>`. Store article content as plain JavaScript data and render it through a dedicated blog renderer. Generate only static browser assets into `dist/`, including route entry HTML files, `robots.txt`, `sitemap.xml`, and the Vercel fallback configuration.

**Tech Stack:** Static HTML, ES modules, vanilla JavaScript, CSS, Vercel CLI, Node.js syntax checks, and `agent-browser` smoke tests.

---

### Task 1: Add the structured article content model

**Files:**
- Create: `src/salebuddy/blog-content.js`
- Test: `scripts/blog-content.test.mjs`

- [ ] **Step 1: Write the failing content contract test**

  Import the article list and assert that it contains six records in the agreed order. Check every record has a unique slug, title, description, category, ISO date, `readTime`, `author`, 3-5 keywords, a standalone `answer`, 3-5 sections, an outline, and 2-3 FAQ entries.

- [ ] **Step 2: Run the test to verify it fails**

  Run: `node --test scripts/blog-content.test.mjs`

  Expected: FAIL because `src/salebuddy/blog-content.js` does not exist.

- [ ] **Step 3: Implement the six article records**

  Add the six approved articles in this exact order and with these categories:

  1. `high-intent-customer-signals` — 获客实战 — 2026-09-03
  2. `douyin-comment-leads` — 获客实战 — 2026-09-02
  3. `after-price-question` — 触达方法 — 2026-09-01
  4. `lead-conversion-gaps` — 客户经营 — 2026-09-01
  5. `small-team-acquisition` — 方法论 — 2026-09-01
  6. `ai-acquisition-boundaries` — AI 工作方式 — 2026-09-01

  Write practical Chinese content, measured in Chinese characters, targeting the ranges from the approved spec: 1,200-1,600 for practical guides, 1,500-1,900 for the methodology article, and 1,200-1,500 for the boundary article. Use `Byering 内容团队` as the author and include direct answer blocks, numbered processes, examples, and FAQs. Avoid unsupported conversion or performance claims.

- [ ] **Step 4: Run the content contract test**

  Run: `node --test scripts/blog-content.test.mjs`

  Expected: PASS.

- [ ] **Step 5: Commit the content model**

  ```bash
  git add src/salebuddy/blog-content.js scripts/blog-content.test.mjs
  git commit -m "Add Byering blog knowledge content"
  ```

### Task 2: Add route resolution and SEO metadata

**Files:**
- Create: `src/salebuddy/site-router.js`
- Create: `src/salebuddy/blog-site.js`
- Modify: `index.html`
- Modify: `src/salebuddy/marketing-site.js`
- Test: `scripts/blog-routing.test.mjs`

- [ ] **Step 1: Write route and metadata tests**

  Test route parsing for `/`, `/blog/`, `/blog/high-intent-customer-signals/`, `/?page=blog`, and `/?page=blog&article=after-price-question`. Test that an article metadata object produces a canonical URL under `https://byering-official-homepage.vercel.app/blog/<slug>/`, a title, a description, and `BlogPosting` JSON-LD fields.

- [ ] **Step 2: Run the tests to verify they fail**

  Run: `node --test scripts/blog-routing.test.mjs`

  Expected: FAIL because the route and blog modules do not exist.

- [ ] **Step 3: Implement `site-router.js`**

  Export route parsing that reads `window.location.pathname` and `URLSearchParams`. Render the existing marketing site for `/` without a `page` query, render the blog index for `/blog/` or `?page=blog`, and render the selected article for `/blog/<slug>/` or `?page=blog&article=<slug>`. Keep unknown article slugs inside the blog renderer so they can set `noindex` metadata and show a return link. When a generated static entry already contains a `.byering-blog-page[data-blog-prerendered]` root, the resolver only applies metadata and interaction enhancements; it must not append a second copy. Unknown clean `/blog/<slug>/` paths are handled by the Vercel filesystem fallback to the generated not-found entry.

- [ ] **Step 4: Implement `blog-site.js`**

  Render the blog index, article pages, and not-found state using semantic HTML. Update `document.title`, description, canonical link, Open Graph tags, and a JSON-LD script on every blog route. Use `CollectionPage` plus `ItemList` on the index and `BlogPosting` plus `FAQPage` data on articles. Keep the first answer block near the start of each article and render lists as ordered or unordered lists instead of burying steps in prose.

- [ ] **Step 5: Add Blog links to the homepage navigation and footer**

  Add `博客` between `能力` and `常见问题` in the existing homepage header. Add a footer link to `/blog/`. Keep the existing CTA and all homepage section anchors unchanged.

- [ ] **Step 6: Make the homepage entry use the route resolver**

  Replace the inline direct marketing import in `index.html` with the resolver import. Preserve the existing homepage title and description for the default route.

- [ ] **Step 7: Run route and metadata tests**

  Run: `node --test scripts/blog-routing.test.mjs`

  Expected: PASS.

- [ ] **Step 8: Commit routing and metadata**

  ```bash
  git add index.html src/salebuddy/site-router.js src/salebuddy/blog-site.js src/salebuddy/marketing-site.js scripts/blog-routing.test.mjs
  git commit -m "Add Byering blog routes and metadata"
  ```

### Task 3: Build the unified blog presentation

**Files:**
- Create: `src/salebuddy/blog-site.css`
- Modify: `src/salebuddy/blog-site.js`

- [ ] **Step 1: Add the visual structure**

  Create a blog masthead using the existing blue-white mountain atmosphere, the same serif display type, and the existing frosted navigation treatment. Use one featured article, a category row, and a three-column card grid on desktop. Give each card a clear category, title, excerpt, reading time, and date.

- [ ] **Step 2: Add the article reading layout**

  Use a centered reading column with breadcrumb, category/date/read-time metadata, serif title, standalone answer callout, section headings, numbered lists, FAQs, related articles, and a final registration CTA. Keep copy widths constrained for comfortable Chinese reading and preserve all content on mobile.

- [ ] **Step 3: Add motion and accessibility states**

  Reuse the homepage reveal timing and frosted-nav scroll state. Add hover/focus states for article cards, visible keyboard focus, semantic headings, and a reduced-motion override. Do not add decorative motion that competes with reading.

- [ ] **Step 4: Run syntax and style checks**

  Run: `node --check src/salebuddy/blog-site.js && node --check src/salebuddy/site-router.js && git diff --check`

  Expected: no output and exit code 0.

- [ ] **Step 5: Commit the blog presentation**

  ```bash
  git add src/salebuddy/blog-site.css src/salebuddy/blog-site.js
  git commit -m "Style Byering blog pages"
  ```

### Task 4: Add direct static entry points and search files

**Files:**
- Create: `blog/index.html`
- Create: `blog/high-intent-customer-signals/index.html`
- Create: `blog/douyin-comment-leads/index.html`
- Create: `blog/after-price-question/index.html`
- Create: `blog/lead-conversion-gaps/index.html`
- Create: `blog/small-team-acquisition/index.html`
- Create: `blog/ai-acquisition-boundaries/index.html`
- Create: `robots.txt`
- Create: `sitemap.xml`
- Create: `vercel.json`
- Create: `scripts/generate-blog-pages.mjs`

- [ ] **Step 1: Add static route entry documents**

  Run `node scripts/generate-blog-pages.mjs` from the shared article data. It writes `/blog/index.html`, one `/blog/<slug>/index.html` for each article, and `/blog/not-found/index.html`. Each output contains the complete article title, answer block, article body, FAQs, canonical URL, Open Graph metadata, and JSON-LD in static HTML, then imports `/src/salebuddy/site-router.js` only for client-side navigation enhancements. Add `vercel.json` with a filesystem-first route and a `/blog/(.*)` fallback to `/blog/not-found/index.html`. This keeps direct clean URLs useful to crawlers even when JavaScript is not executed and gives unknown clean slugs a stable noindex response.

- [ ] **Step 2: Add crawler directives**

  Add `robots.txt` allowing search and AI answer crawlers and pointing to the sitemap. Add `sitemap.xml` with the homepage, `/blog/`, and all six article URLs under `https://byering-official-homepage.vercel.app`.

- [ ] **Step 3: Add route entry tests**

  Extend `scripts/blog-routing.test.mjs` to assert the index, six article entries, and not-found entry exist, contain the expected route resolver import and pre-render marker, and include no core Agent imports. Also assert the Vercel fallback configuration exists. Read the generated HTML as raw text and assert the index and every article contain their visible title, answer block, FAQ markup, canonical link, Open Graph metadata, and JSON-LD; assert the not-found entry contains `noindex`.

- [ ] **Step 4: Run route entry tests**

  Run: `node --test scripts/blog-routing.test.mjs`

  Expected: PASS.

- [ ] **Step 5: Commit static SEO entry points**

  ```bash
  git add blog robots.txt sitemap.xml scripts/blog-routing.test.mjs
  git commit -m "Add static Byering blog entry points"
  ```

### Task 5: Synchronize and validate the Vercel publish directory

**Files:**
- Create: `scripts/sync-site-dist.sh`
- Create: `scripts/verify-site-dist.sh`
- Modify: `dist/` generated output

- [ ] **Step 1: Implement the synchronization script**

  Run `node scripts/generate-blog-pages.mjs`, then copy the homepage shell, generated blog entry points, `src/salebuddy` website modules, selected images/fonts, `robots.txt`, `sitemap.xml`, and `vercel.json` into `dist/`. Keep the script limited to website files and copy the current `.openai/hosting.json` into `dist/.openai/hosting.json`. Do not copy `backend/`, `electron/`, onboarding, workbench, or unrelated source files.

- [ ] **Step 2: Run the synchronization script**

  Run: `bash scripts/sync-site-dist.sh`

  Expected: `dist/` contains the website entry points and assets only.

- [ ] **Step 3: Add publish-payload checks**

  Verify `find dist -type f` contains only the expected website files, verify no path contains `backend`, `electron`, `onboarding`, or `agent-square`, and run `bash scripts/verify-site-dist.sh`. The verification script compares every synchronized source file and generated route entry against its `dist` copy and exits non-zero with the first stale path.

- [ ] **Step 4: Run the full local validation**

  Run: `node --test scripts/blog-content.test.mjs scripts/blog-routing.test.mjs && node --check dist/src/salebuddy/blog-site.js && node --check dist/src/salebuddy/site-router.js && bash scripts/verify-site-dist.sh && git diff --check`

  Expected: PASS with no syntax or whitespace errors.

- [ ] **Step 5: Commit the synchronized website package**

  ```bash
  git add scripts/sync-site-dist.sh dist
  git commit -m "Prepare Byering website package for deployment"
  ```

### Task 6: Browser QA and Vercel deployment

**Files:**
- Modify: none unless QA finds a defect

- [ ] **Step 1: Start or reuse the local static server**

  Serve the `dist/` publish directory on a free local port and open `/`, `/blog/`, one article URL, an unknown article URL, and both query fallbacks with `agent-browser`.

- [ ] **Step 2: Verify browser behavior**

  Confirm the homepage still has the existing navigation and hero. Confirm Blog opens the index, cards open articles, article metadata and FAQ content render, unknown slugs show the not-found state, and mobile width remains readable. Check browser errors and broken network requests.

- [ ] **Step 3: Deploy only `dist/` with Vercel**

  If `dist/.vercel/project.json` is absent, run `vercel link --cwd dist --yes --scope mercury-njus-projects --project byering-official-homepage` once. Then run `vercel deploy --cwd dist --prod --yes --scope mercury-njus-projects --json`.

  Expected: a `READY` production deployment aliased to `https://byering-official-homepage.vercel.app`.

- [ ] **Step 4: Run the production smoke check**

  Use `vercel curl` and `agent-browser` against the production alias. Confirm `/`, `/blog/`, one article, `robots.txt`, and `sitemap.xml` return successfully and that the article's canonical URL is correct. Also inspect raw response bodies with `curl -fsSL` for `/blog/`, one article, and an unknown `/blog/not-a-real-article/`; assert the known pages contain visible article text and JSON-LD without executing JavaScript, and the unknown page contains `noindex` and the not-found message.

- [ ] **Step 5: Commit any QA fixes and redeploy**

  If QA finds a defect, fix the source, rerun synchronization and validation, commit with an English technical message, and redeploy the same Vercel project.
