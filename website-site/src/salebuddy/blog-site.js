import { blogArticles, getArticleBySlug } from "./blog-content.js";

const BLOG_ROOT_ID = "byering-blog-root";
const SITE_ORIGIN = "https://byering-official-homepage.vercel.app";
const SHARE_IMAGE = `${SITE_ORIGIN}/assets/byering-hero-glass.png`;

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function jsonForScript(value) {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

function articlePath(slug) {
  return `/blog/${slug}/`;
}

function metadataForRoute(route) {
  const article = route.kind === "blog-article" ? getArticleBySlug(route.slug) : null;
  const notFound = route.kind === "blog-not-found" || (route.kind === "blog-article" && !article);
  if (article) {
    return {
      title: `${article.title}｜Byering 博客`,
      description: article.description,
      canonical: `${SITE_ORIGIN}${articlePath(article.slug)}`,
      type: "article",
      image: SHARE_IMAGE,
      noindex: false
    };
  }
  if (notFound) {
    return {
      title: "文章没有找到｜Byering 博客",
      description: "这篇文章暂时不存在，回到 Byering 博客继续阅读获客知识。",
      canonical: `${SITE_ORIGIN}/blog/`,
      type: "website",
      image: SHARE_IMAGE,
      noindex: true
    };
  }
  return {
    title: "Byering 博客｜把获客做成持续工作的能力",
    description: "面向个体卖家、内容创作者和小团队的获客方法、客户判断与 AI 工作知识。",
    canonical: `${SITE_ORIGIN}/blog/`,
    type: "website",
    image: SHARE_IMAGE,
    noindex: false
  };
}

function renderMetaTags(route) {
  const meta = metadataForRoute(route);
  return `
    <title>${escapeHTML(meta.title)}</title>
    <meta name="description" content="${escapeHTML(meta.description)}">
    ${meta.noindex ? '<meta name="robots" content="noindex,follow">' : '<meta name="robots" content="index,follow">'}
    <link rel="canonical" href="${meta.canonical}">
    <meta property="og:type" content="${meta.type}">
    <meta property="og:title" content="${escapeHTML(meta.title)}">
    <meta property="og:description" content="${escapeHTML(meta.description)}">
    <meta property="og:url" content="${meta.canonical}">
    <meta property="og:image" content="${meta.image}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHTML(meta.title)}">
    <meta name="twitter:description" content="${escapeHTML(meta.description)}">
    <meta name="twitter:image" content="${meta.image}">
  `;
}

function articleSchema(article) {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: article.title,
    description: article.description,
    datePublished: article.date,
    dateModified: article.date,
    author: { "@type": "Organization", name: article.author },
    publisher: { "@type": "Organization", name: "Byering" },
    keywords: article.keywords.join(", "),
    mainEntityOfPage: `${SITE_ORIGIN}${articlePath(article.slug)}`,
    image: [SHARE_IMAGE]
  };
}

function faqSchema(article) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: article.faq.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer }
    }))
  };
}

function indexSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Byering 博客",
    description: metadataForRoute({ kind: "blog-index" }).description,
    url: `${SITE_ORIGIN}/blog/`,
    mainEntity: {
      "@type": "ItemList",
      itemListElement: blogArticles.map((article, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: `${SITE_ORIGIN}${articlePath(article.slug)}`,
        name: article.title
      }))
    }
  };
}

function renderStructuredData(route) {
  const article = route.kind === "blog-article" ? getArticleBySlug(route.slug) : null;
  const schemas = article ? [articleSchema(article), faqSchema(article)] : [indexSchema()];
  return schemas.map((schema) => `<script type="application/ld+json">${jsonForScript(schema)}</script>`).join("");
}

function renderNav() {
  return `
    <header class="marketing-nav blog-nav" data-blog-nav-shell>
      <a class="brand-lockup" href="/" aria-label="Byering 首页">
        <img src="/assets/byering-logo-mark.png" alt="">
        <span>Byering</span>
      </a>
      <nav class="nav-links" aria-label="主要导航">
        <a href="/#workflow">怎么工作</a>
        <a href="/#capabilities">能力</a>
        <a href="/blog/" aria-current="page">博客</a>
        <a href="/#faq">常见问题</a>
      </nav>
      <a class="nav-cta" href="/?page=login">立即注册</a>
    </header>
  `;
}

function renderArticleCard(article, featured = false) {
  return `
    <a class="blog-card${featured ? " blog-card--featured" : ""} reveal" href="${articlePath(article.slug)}">
      <div class="blog-card__top"><span>${escapeHTML(article.category)}</span><span>${escapeHTML(article.readTime)}</span></div>
      <h3>${escapeHTML(article.title)}</h3>
      <p>${escapeHTML(article.description)}</p>
      <div class="blog-card__bottom"><time datetime="${article.date}">${article.date.replaceAll("-", ".")}</time><span aria-hidden="true">↗</span></div>
    </a>
  `;
}

function renderBlogIndex() {
  const [featured, ...rest] = blogArticles;
  return `
    <div class="blog-page blog-page--index">
      <section class="blog-hero">
        <div class="blog-hero__scene" aria-hidden="true"></div>
        <div class="blog-hero__wash" aria-hidden="true"></div>
        ${renderNav()}
        <div class="blog-hero__content">
          <span class="blog-kicker reveal">BYERING / KNOWLEDGE BASE</span>
          <h1 class="reveal reveal--delay-1">把获客，做成<br><em>可以持续的工作。</em></h1>
          <p class="reveal reveal--delay-2">给个体卖家、内容创作者和小团队的客户判断、触达方法与 AI 工作知识。</p>
        </div>
        <a class="blog-hero__scroll" href="#blog-library">向下阅读 <span>↓</span></a>
      </section>

      <main id="blog-library" class="blog-main">
        <div class="blog-intro reveal"><span class="section-index">BYERING / BLOG</span><h2>先理解客户，再开始行动。</h2><p>每篇文章都从一个真实的获客问题出发，给出可以当天试起来的判断方法。</p></div>
        <div class="blog-featured">${renderArticleCard(featured, true)}</div>
        <div class="blog-category-rail reveal" aria-label="文章分类"><span>全部文章</span><span>获客实战</span><span>触达方法</span><span>客户经营</span><span>AI 工作方式</span></div>
        <div class="blog-grid">${rest.map((article, index) => renderArticleCard(article, false).replace(" reveal\"", ` reveal reveal--delay-${(index % 3) + 1}\"`)).join("")}</div>
      </main>
      ${renderBlogFooter()}
    </div>
  `;
}

function renderSection(section, index) {
  const list = section.list?.length
    ? `<${section.ordered ? "ol" : "ul"}>${section.list.map((item) => `<li>${escapeHTML(item)}</li>`).join("")}</${section.ordered ? "ol" : "ul"}>`
    : "";
  return `<section class="article-section" id="section-${index}"><h2>${escapeHTML(section.heading)}</h2>${section.paragraphs.map((paragraph) => `<p>${escapeHTML(paragraph)}</p>`).join("")}${list}</section>`;
}

function renderArticle(article) {
  return `
    <div class="blog-page blog-page--article">
      ${renderNav()}
      <main class="article-main">
        <div class="article-breadcrumb"><a href="/blog/">博客</a><span>/</span><span>${escapeHTML(article.category)}</span></div>
        <article class="article-reading">
          <header class="article-header reveal">
            <div class="article-meta"><span>${escapeHTML(article.category)}</span><time datetime="${article.date}">${article.date.replaceAll("-", ".")}</time><span>${escapeHTML(article.readTime)}</span></div>
            <h1>${escapeHTML(article.title)}</h1>
            <p class="article-dek">${escapeHTML(article.description)}</p>
          </header>
          <div class="answer-block reveal reveal--delay-1"><span>直接回答</span><p>${escapeHTML(article.answer)}</p></div>
          <div class="article-outline reveal reveal--delay-2"><span>本文要点</span><ol>${article.outline.map((item) => `<li><a href="#section-${article.outline.indexOf(item) + 1}">${escapeHTML(item)}</a></li>`).join("")}</ol></div>
          <div class="article-body">${article.sections.map((section, index) => renderSection(section, index + 1)).join("")}</div>
          <section class="article-faq"><div class="article-faq__heading"><span>继续理解</span><h2>常见问题</h2></div><div class="article-faq__list">${article.faq.map((item) => `<details><summary>${escapeHTML(item.question)}<span>+</span></summary><p>${escapeHTML(item.answer)}</p></details>`).join("")}</div></section>
        </article>
        ${renderRelated(article)}
      </main>
      <section class="blog-closing"><span>BYERING / START HERE</span><h2>从一个更清楚的<br><em>下一步开始。</em></h2><p>让每一次客户经营，都留下可复用的经验。</p><a class="primary-button" href="/?page=login">立即注册 <span>↗</span></a></section>
      ${renderBlogFooter()}
    </div>
  `;
}

function renderRelated(article) {
  const related = blogArticles.filter((item) => item.slug !== article.slug).slice(0, 2);
  return `<section class="related-articles"><div><span>继续阅读</span><h2>把方法带回工作里。</h2></div><div class="related-articles__grid">${related.map((item) => renderArticleCard(item)).join("")}</div></section>`;
}

function renderNotFound() {
  return `
    <div class="blog-page blog-page--not-found">
      ${renderNav()}
      <main class="not-found-main"><span class="section-index">BYERING / 404</span><h1>文章没有找到。</h1><p>这篇内容暂时不在这里，回到博客继续阅读。</p><a class="primary-button" href="/blog/">回到博客 <span>↗</span></a></main>
      ${renderBlogFooter()}
    </div>
  `;
}

function renderBlogFooter() {
  return `<footer class="marketing-footer blog-footer"><a class="brand-lockup" href="/"><img src="/assets/byering-logo-mark.png" alt=""><span>Byering</span></a><span>为线索而生，为转化而造。</span><div><a href="/?page=login">登录</a><a href="/blog/">博客</a><a href="/#faq">常见问题</a><span>© 2026 Byering</span></div></footer>`;
}

function routeContent(route) {
  if (route.kind === "blog-index") return renderBlogIndex();
  if (route.kind === "blog-article" && getArticleBySlug(route.slug)) return renderArticle(getArticleBySlug(route.slug));
  return renderNotFound();
}

function applyMetadata(documentRef, route) {
  const meta = metadataForRoute(route);
  documentRef.title = meta.title;
  documentRef.documentElement.lang = "zh-CN";
  const ensureMeta = (selector, attributes) => {
    let element = documentRef.head.querySelector(selector);
    if (!element) {
      element = documentRef.createElement("meta");
      documentRef.head.appendChild(element);
    }
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
  };
  ensureMeta('meta[name="description"]', { name: "description", content: meta.description });
  ensureMeta('meta[name="robots"]', { name: "robots", content: meta.noindex ? "noindex,follow" : "index,follow" });
  ensureMeta('meta[property="og:type"]', { property: "og:type", content: meta.type });
  ensureMeta('meta[property="og:title"]', { property: "og:title", content: meta.title });
  ensureMeta('meta[property="og:description"]', { property: "og:description", content: meta.description });
  ensureMeta('meta[property="og:url"]', { property: "og:url", content: meta.canonical });
  ensureMeta('meta[property="og:image"]', { property: "og:image", content: meta.image });
  let canonical = documentRef.head.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = documentRef.createElement("link");
    canonical.rel = "canonical";
    documentRef.head.appendChild(canonical);
  }
  canonical.href = meta.canonical;
  let schema = documentRef.head.querySelector('script[data-blog-schema]');
  if (!schema) {
    schema = documentRef.createElement("script");
    schema.type = "application/ld+json";
    schema.dataset.blogSchema = "true";
    documentRef.head.appendChild(schema);
  }
  schema.textContent = jsonForScript(route.kind === "blog-article" && getArticleBySlug(route.slug) ? articleSchema(getArticleBySlug(route.slug)) : indexSchema());
}

function enhanceBlogPage(root, documentRef, windowRef) {
  const nav = root.querySelector("[data-blog-nav-shell]");
  const updateNav = () => nav?.classList.toggle("is-scrolled", (windowRef?.scrollY || 0) > 48);
  windowRef?.addEventListener?.("scroll", updateNav, { passive: true });
  updateNav();
  root.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener("click", (event) => {
      const target = root.querySelector(link.getAttribute("href"));
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
  const observer = windowRef?.IntersectionObserver ? new windowRef.IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -8%" }) : null;
  root.querySelectorAll(".reveal").forEach((element) => {
    if (observer) observer.observe(element);
    else element.classList.add("is-visible");
  });
  documentRef.body.classList.add("byering-blog-active");
  documentRef.documentElement.dataset.byeringBlog = "1";
}

export function renderBlogRoute({ route, documentRef = globalThis.document, windowRef = globalThis.window } = {}) {
  if (!documentRef?.body || !route) return null;
  let root = documentRef.getElementById(BLOG_ROOT_ID);
  if (!root) {
    root = documentRef.createElement("div");
    root.id = BLOG_ROOT_ID;
    root.className = "byering-blog-page";
    root.innerHTML = routeContent(route);
    documentRef.body.appendChild(root);
  }
  applyMetadata(documentRef, route);
  enhanceBlogPage(root, documentRef, windowRef);
  return root;
}

export function renderBlogDocument({ route }) {
  const meta = metadataForRoute(route);
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#258eea">
    <link rel="icon" href="/assets/byering-logo-mark.png">
    <link rel="stylesheet" href="/src/salebuddy/marketing-site.css">
    <link rel="stylesheet" href="/src/salebuddy/blog-site.css">
    ${renderMetaTags(route)}
    ${renderStructuredData(route)}
  </head>
  <body>
    <div id="${BLOG_ROOT_ID}" class="byering-blog-page" data-blog-prerendered="true">${routeContent(route)}</div>
    <script type="module">import { startSite } from "/src/salebuddy/site-router.js"; startSite();</script>
  </body>
</html>`;
}

export { BLOG_ROOT_ID, SITE_ORIGIN, escapeHTML, metadataForRoute };
