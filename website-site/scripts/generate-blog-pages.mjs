import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { blogArticles } from "../src/salebuddy/blog-content.js";
import { renderBlogDocument } from "../src/salebuddy/blog-site.js";

const scriptRoot = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(scriptRoot, "..");

const pages = [
  { file: "blog/index.html", route: { kind: "blog-index" } },
  ...blogArticles.map((article) => ({
    file: `blog/${article.slug}/index.html`,
    route: { kind: "blog-article", slug: article.slug }
  })),
  { file: "blog/not-found/index.html", route: { kind: "blog-not-found" } }
];

for (const page of pages) {
  const target = join(projectRoot, page.file);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, renderBlogDocument({ route: page.route }), "utf8");
}

console.log(`Generated ${pages.length} static blog pages.`);
