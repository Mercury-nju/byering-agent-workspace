#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"

compare_file() {
  local source="$1"
  local target="$2"
  if [[ ! -f "$target" ]]; then
    printf 'Missing publish file: %s\n' "${target#"$ROOT_DIR/"}" >&2
    exit 1
  fi
  if ! cmp -s "$source" "$target"; then
    printf 'Stale publish file: %s\n' "${target#"$ROOT_DIR/"}" >&2
    exit 1
  fi
}

compare_file "$ROOT_DIR/index.html" "$DIST_DIR/index.html"
compare_file "$ROOT_DIR/robots.txt" "$DIST_DIR/robots.txt"
compare_file "$ROOT_DIR/sitemap.xml" "$DIST_DIR/sitemap.xml"
compare_file "$ROOT_DIR/vercel.json" "$DIST_DIR/vercel.json"

for file in marketing-site.js marketing-site.css blog-content.js blog-site.js blog-site.css site-router.js; do
  compare_file "$ROOT_DIR/src/salebuddy/$file" "$DIST_DIR/src/salebuddy/$file"
done

for asset in byering-product-agent-center.png byering-product-agent-detail.png byering-product-realtime-work.png byering-hero-founder-v2.png byering-hero-glass.png byering-logo-mark.png noto-sans-sc-v38-latin-100-CC4HgmWe.ttf; do
  compare_file "$ROOT_DIR/assets/$asset" "$DIST_DIR/assets/$asset"
done

while IFS= read -r source_file; do
  relative="${source_file#"$ROOT_DIR/"}"
  compare_file "$source_file" "$DIST_DIR/$relative"
done < <(find "$ROOT_DIR/blog" -type f -name 'index.html' | sort)

if find "$DIST_DIR" -type f | grep -E '/(backend|electron|onboarding|agent-square)(/|$)' >/dev/null; then
  printf 'Core application path found in publish payload.\n' >&2
  exit 1
fi

echo "Verified website source and dist/ are synchronized."
