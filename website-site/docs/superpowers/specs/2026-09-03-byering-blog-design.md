# Byering Blog Design

## Goal

Add a Chinese knowledge section to the independent Byering marketing site. The blog must help Chinese-speaking individual sellers, creators, streamers, consultants, and small businesses understand practical customer acquisition while creating durable search and generative-search entry points.

## Scope and Isolation

The change is limited to the independent website repository. It must not import or publish the core Agent workspace, onboarding flow, backend, or workbench code. The marketing homepage remains the default root route.

## Information Architecture

```text
Homepage (/)
└── Blog (/blog)
    ├── What is a high-intent customer? (/blog/high-intent-customer-signals)
    ├── How to find customers in Douyin comments (/blog/douyin-comment-leads)
    ├── What to do after a customer asks for price (/blog/after-price-question)
    ├── Why many leads do not convert (/blog/lead-conversion-gaps)
    ├── A continuous acquisition workflow for small teams (/blog/small-team-acquisition)
    └── AI acquisition permissions and boundaries (/blog/ai-acquisition-boundaries)
```

The header adds a `博客` link between `能力` and the existing `常见问题` link. The footer also links to `/blog`.

## Page Behavior

The static site uses a small route resolver based on `window.location.pathname` and `URLSearchParams`. To make direct production visits work on a static host, the package includes a lightweight HTML entry point at `/blog/index.html` and at `/blog/<slug>/index.html`; each entry is generated from the shared article data with the complete page content already present in HTML. The browser module only enhances those pre-rendered pages and must not append duplicate content. The local fallback contract is also exact: `/?page=blog` renders the index and `/?page=blog&article=<slug>` renders an article. `/` renders the existing homepage. `/blog` renders an editorial index. `/blog/<slug>` renders one article. Unknown blog slugs render a useful not-found state with a link back to the index and carry `noindex` metadata. Vercel serves known files first and falls back unknown `/blog/*` paths to the generated not-found entry.

The production canonical origin is `https://byering-official-homepage.vercel.app`. Each page has a canonical URL, page title, description, Open Graph metadata, and JSON-LD rendered into the static HTML output. The package includes `robots.txt`, `sitemap.xml`, and the existing high-resolution hero visual as the Open Graph image. The blog index uses `CollectionPage` plus `ItemList`; articles use `BlogPosting` with author, date, headline, description, keywords, and `mainEntityOfPage`. The article body contains direct answer blocks, numbered steps, definitions, examples, and FAQs so passages remain extractable by search and AI answer engines.

## Content Model

Articles are represented as plain JavaScript data so the first release has no server or CMS dependency. Each record contains:

- `slug`, `title`, `description`, `category`, `date`, `readTime`, `author`, `keywords`, `targetLength`
- `answer`: a short standalone answer block near the top
- `sections`: heading and paragraph/list content
- `faq`: natural-language questions and answers
- `outline`: the planned H2/H3 sequence used to keep each article focused

The six initial articles are scoped as follows: four practical guides (1,200-1,600 Chinese characters each), one methodology article (1,500-1,900 characters), and one product-boundary article (1,200-1,500 characters). All use author `Byering 内容团队`, publication dates in September 2026, 3-5 keywords, a 40-60 word-equivalent standalone answer block, 3-5 H2 sections, and 2-3 FAQs. Copy should be specific to Chinese content and commerce workflows, avoid unsupported performance claims, and use Byering as an example rather than repeating promotional slogans.

## Visual Direction

The blog keeps the existing site's visual language: clear blue-white atmosphere, mountain background accents, Didot/Songti display typography, restrained dark ink, and blue/green/peach signal colors. The index uses a quiet editorial layout with one featured article, a compact category rail, and a three-column article grid on desktop. Article pages use a centered reading column with generous whitespace, a small metadata row, a large serif title, a highlighted answer block, and an optional related-article row.

Motion stays consistent with the homepage: fixed navigation transitions between transparent and frosted states, staggered reveal on page entry, subtle card lift, and no decorative motion that competes with reading. The blog must remain legible on mobile; the article content becomes a single column and the navigation remains compact.

## Accessibility and Resilience

Use semantic `header`, `nav`, `main`, `article`, `section`, `footer`, heading hierarchy, visible focus states, keyboard-accessible article cards, and readable contrast. Do not depend on external images or network APIs. Existing static assets may be reused only where they support the site's established visual system.

## Source and Publish Synchronization

The editable website source remains in `index.html`, `blog/`, `src/salebuddy/`, and `assets/`. The publish directory is `dist/`. A static generation script renders the same article data into route-specific HTML under `blog/`, then the sync script copies those generated files into `dist/blog/`, so crawlers receive article content and metadata without JavaScript. After each content or code change, the exact source files, generated HTML, selected assets, `robots.txt`, `sitemap.xml`, and `vercel.json` are regenerated into `dist/` before packaging; the archive is built only from `dist/`. A validation command compares the relevant source and publish files and fails if the publish copy is stale.

## Validation

Validate JavaScript syntax, ensure the independent package contains only website files, check all six clean article paths, `/blog`, and both query fallbacks through the local server, verify canonical/meta/schema output for the index and an article, verify no core app imports exist in the publish payload, compare source and `dist`, and run a production deployment smoke check after redeploying the independent site.
