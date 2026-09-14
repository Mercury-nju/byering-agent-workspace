#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"

node "$ROOT_DIR/scripts/generate-blog-pages.mjs"

mkdir -p "$DIST_DIR/src/salebuddy" "$DIST_DIR/assets" "$DIST_DIR/.openai"
cp "$ROOT_DIR/index.html" "$DIST_DIR/index.html"
cp "$ROOT_DIR/robots.txt" "$DIST_DIR/robots.txt"
cp "$ROOT_DIR/sitemap.xml" "$DIST_DIR/sitemap.xml"
cp "$ROOT_DIR/vercel.json" "$DIST_DIR/vercel.json"
cp "$ROOT_DIR/.openai/hosting.json" "$DIST_DIR/.openai/hosting.json"
cp "$ROOT_DIR/src/salebuddy/marketing-site.js" "$DIST_DIR/src/salebuddy/marketing-site.js"
cp "$ROOT_DIR/src/salebuddy/marketing-site.css" "$DIST_DIR/src/salebuddy/marketing-site.css"
cp "$ROOT_DIR/src/salebuddy/blog-content.js" "$DIST_DIR/src/salebuddy/blog-content.js"
cp "$ROOT_DIR/src/salebuddy/blog-site.js" "$DIST_DIR/src/salebuddy/blog-site.js"
cp "$ROOT_DIR/src/salebuddy/blog-site.css" "$DIST_DIR/src/salebuddy/blog-site.css"
cp "$ROOT_DIR/src/salebuddy/site-router.js" "$DIST_DIR/src/salebuddy/site-router.js"

for asset in \
  byering-product-agent-center.png \
  byering-product-agent-detail.png \
  byering-product-realtime-work.png \
  byering-hero-founder-v2.png \
  byering-hero-glass.png \
  byering-logo-mark.png \
  noto-sans-sc-v38-latin-100-CC4HgmWe.ttf; do
  cp "$ROOT_DIR/assets/$asset" "$DIST_DIR/assets/$asset"
done

rm -f "$DIST_DIR/assets/byering-case-creator.png" "$DIST_DIR/assets/byering-case-followup.png" "$DIST_DIR/assets/byering-case-intent.png"

mkdir -p "$DIST_DIR/blog"
cp -R "$ROOT_DIR/blog/." "$DIST_DIR/blog/"

echo "Synchronized website source into dist/."
