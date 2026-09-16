import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { access } from "node:fs/promises";
import { resolveAppLoginUrl, resolveRoute, startSite } from "../src/salebuddy/site-router.js";
import { blogArticles } from "../src/salebuddy/blog-content.js";

const sourceRoot = new URL("../", import.meta.url);
const readSource = (file) => readFile(new URL(file, sourceRoot), "utf8");

test("blog routes resolve clean and query fallback URLs", () => {
  assert.deepEqual(resolveRoute({ pathname: "/", search: "" }), { kind: "home" });
  assert.deepEqual(resolveRoute({ pathname: "/blog/", search: "" }), { kind: "blog-index" });
  assert.deepEqual(resolveRoute({ pathname: "/blog/high-intent-customer-signals/", search: "" }), {
    kind: "blog-article",
    slug: "high-intent-customer-signals"
  });
  assert.deepEqual(resolveRoute({ pathname: "/", search: "?page=blog" }), { kind: "blog-index" });
  assert.deepEqual(resolveRoute({ pathname: "/", search: "?page=blog&article=after-price-question" }), {
    kind: "blog-article",
    slug: "after-price-question"
  });
  assert.deepEqual(resolveRoute({ pathname: "/blog/not-a-real-article/", search: "" }), {
    kind: "blog-article",
    slug: "not-a-real-article"
  });
});

test("login links hand off to the Agent application", () => {
  assert.deepEqual(resolveRoute({ pathname: "/", search: "?page=login" }), { kind: "app-login" });
  assert.equal(
    resolveAppLoginUrl({ protocol: "http:", hostname: "127.0.0.1" }),
    "http://127.0.0.1:8888/?page=login"
  );
  assert.equal(
    resolveAppLoginUrl({ protocol: "http:", hostname: "localhost" }),
    "http://localhost:8888/?page=login"
  );
  assert.equal(
    resolveAppLoginUrl({ protocol: "https:", hostname: "byering-official-homepage.vercel.app" }),
    "https://project-mercury-njus-projects.vercel.app/?page=login"
  );

  let assignedUrl = null;
  const result = startSite({
    documentRef: { body: {} },
    windowRef: {
      location: {
        pathname: "/",
        search: "?page=login",
        protocol: "http:",
        hostname: "127.0.0.1",
        assign(url) {
          assignedUrl = url;
        }
      }
    }
  });

  assert.equal(result, "http://127.0.0.1:8888/?page=login");
  assert.equal(assignedUrl, result);
});

test("static blog entries contain crawlable article content and metadata", async () => {
  const files = [
    "blog/index.html",
    ...blogArticles.map((article) => `blog/${article.slug}/index.html`),
    "blog/not-found/index.html"
  ];

  for (const file of files) await access(new URL(file, sourceRoot));

  const index = await readSource("blog/index.html");
  assert.match(index, /data-blog-prerendered/);
  assert.match(index, /site-router\.js/);
  assert.match(index, /CollectionPage/);
  assert.match(index, /<meta property="og:title"/);
  assert.match(index, /<link rel="canonical"/);
  assert.match(index, /博客/);

  for (const article of blogArticles) {
    const html = await readSource(`blog/${article.slug}/index.html`);
    assert.match(html, new RegExp(article.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(html, /data-blog-prerendered/);
    assert.match(html, /answer-block/);
    assert.match(html, /<details/);
    assert.match(html, /<link rel="canonical"/);
    assert.match(html, /<meta property="og:description"/);
    assert.match(html, /BlogPosting/);
    assert.match(html, /FAQPage/);
    assert.doesNotMatch(html, /(?:backend|electron|onboarding|agent-square)/i);
  }

  const notFound = await readSource("blog/not-found/index.html");
  assert.match(notFound, /noindex/);
  assert.match(notFound, /文章没有找到/);
});

test("Vercel keeps known files and falls back unknown blog paths", async () => {
  const config = JSON.parse(await readSource("vercel.json"));
  assert.deepEqual(config.routes, [
    { handle: "filesystem" },
    { src: "/b/?$", dest: "/b/index.html" },
    { src: "/blog/(.*)", dest: "/blog/not-found/index.html" }
  ]);
});
