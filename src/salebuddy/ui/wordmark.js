import { BRAND } from "../brand.js";

const LOGO_64 = new URL("../../../assets/byering-logo-64.png", import.meta.url).href;
const LOGO_128 = new URL("../../../assets/byering-logo-128.png", import.meta.url).href;
const FULL_WORDMARK = new URL("../../../assets/byering-wordmark-transparent.png", import.meta.url).href;

const CSS = `
.sb-wordmark{display:inline-flex;align-items:center;gap:8px;font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;font-weight:800;color:#0F1114;letter-spacing:-.02em;line-height:1;white-space:nowrap}
.sb-wordmark img{width:1.25em;height:1.25em;display:block;object-fit:contain;flex:none}
.sb-wordmark-text{display:inline-block}
.sb-brand-image{object-fit:contain!important;object-position:center!important}
.sb-wordmark-full{display:inline-flex!important;align-items:center!important;gap:8px!important;width:158px!important;height:40px!important;overflow:visible!important}
.sb-wordmark-full .sb-sidebar-logo-image{width:38px;height:38px;display:block;object-fit:contain;flex:none}
.sb-wordmark-full .sb-full-wordmark-image{width:112px;height:auto;display:block;object-fit:contain;flex:none}
html[data-byering-guard="pending"] #root{visibility:hidden!important}
`;

const TARGETS = [
  { selector: '[dt-eid="sidebar_logo_title"] svg', fallback: 20, fixed: 20, logo: LOGO_64, fullWordmark: FULL_WORDMARK },
  { selector: '[dt-eid="agent_name"] svg', fallback: 40, logo: null },
  { selector: '[class*="_aboutAppName_"] svg', fallback: 18, logo: LOGO_64 },
  { selector: '[class*="_txtMarvis_"] svg', fallback: 40, logo: LOGO_128 }
];

const TEXT_ALIASES = new Map([
  ["一句话下达，数字员工马上开工", BRAND.slogan],
  ["💬 一句话下达，数字员工马上开工", `💬 ${BRAND.slogan}`],
  ["马维斯 为你24小时随时在线", BRAND.slogan],
  ["Marvis 为你24小时随时在线", BRAND.slogan],
  ["SaleBuddy 为你24小时随时在线", BRAND.slogan],
  ["Byering 为你24小时随时在线", BRAND.slogan]
]);

const IMAGE_TARGETS = [
  { selector: '[dt-eid="agent_logo"] img', src: LOGO_128, alt: "" },
  { selector: '[class*="_aboutAppIcon_"] img', src: LOGO_64, alt: "Byering" },
  { selector: '[class*="_iconLogoStatic_"] img', src: LOGO_128, alt: "Byering" },
  { selector: '[class*="_launcherLogo_"] img', src: LOGO_128, alt: "Byering" }
];

let styleTag = null;

function ensureStyle() {
  if (styleTag?.isConnected) return;
  styleTag = document.createElement("style");
  styleTag.dataset.byeringBrandStyle = "1";
  styleTag.textContent = CSS;
  document.head?.appendChild(styleTag);
}

function replaceSvg(svg, fallback, fixed, logo, fullWordmark) {
  if (!svg.isConnected || svg.dataset.sbByeringWordmark) return;
  const rect = svg.getBoundingClientRect?.() || { height: 0 };
  const fontSize = fixed || (rect.height >= 8 ? Math.round(rect.height * 0.92) : fallback);
  const span = document.createElement("span");
  span.className = "sb-wordmark";
  span.dataset.sbByeringWordmark = "1";
  span.__sbOriginalNode = svg;
  span.style.fontSize = `${fontSize}px`;
  span.setAttribute("aria-label", BRAND.name);
  if (fullWordmark) {
    span.classList.add("sb-wordmark-full");
    const logoImage = document.createElement("img");
    logoImage.src = logo || LOGO_64;
    logoImage.alt = "";
    logoImage.className = "sb-sidebar-logo-image";
    const image = document.createElement("img");
    image.src = fullWordmark;
    image.alt = `${BRAND.name} Sales Intelligence`;
    image.className = "sb-full-wordmark-image";
    span.append(logoImage, image);
    svg.replaceWith(span);
    return;
  }
  const text = document.createElement("span");
  text.className = "sb-wordmark-text";
  text.textContent = BRAND.name;
  if (logo) {
    const image = document.createElement("img");
    image.src = logo;
    image.alt = "";
    image.className = "sb-brand-image";
    image.addEventListener("error", () => image.remove(), { once: true });
    span.append(image);
  }
  span.append(text);
  svg.replaceWith(span);
}

function replaceImage(image, src, alt) {
  if (!image.isConnected || image.dataset.sbByeringImage) return;
  image.dataset.sbByeringImage = "1";
  image.dataset.sbByeringOriginalSrc = image.getAttribute("src") || "";
  image.dataset.sbByeringOriginalAlt = image.getAttribute("alt") || "";
  image.dataset.sbByeringOriginalClass = image.getAttribute("class") || "";
  image.src = src;
  image.alt = alt;
  image.classList.add("sb-brand-image");
}

function replaceTextAliases() {
  if (!document.body || typeof document.createTreeWalker !== "function") return false;
  let claimed = false;
  const walker = document.createTreeWalker(document.body, 4);
  let node;
  while ((node = walker.nextNode())) {
    const replacement = TEXT_ALIASES.get(node.nodeValue);
    if (!replacement || node.nodeValue === replacement) continue;
    node.__sbByeringOriginalValue = node.nodeValue;
    node.nodeValue = replacement;
    claimed = true;
  }
  return claimed;
}

function sweep() {
  let claimed = false;
  for (const target of TARGETS) {
    for (const svg of document.querySelectorAll(target.selector)) {
      replaceSvg(svg, target.fallback, target.fixed, target.logo, target.fullWordmark);
      claimed = true;
    }
  }
  for (const target of IMAGE_TARGETS) {
    for (const image of document.querySelectorAll(target.selector)) {
      replaceImage(image, target.src, target.alt);
      claimed = true;
    }
  }
  return replaceTextAliases() || claimed;
}

function releaseEarlyGuard() {
  if (document.documentElement?.dataset.byeringGuard === "pending") {
    document.documentElement.dataset.byeringGuard = "ready";
  }
}

function restoreImage(image) {
  const originalSrc = image.dataset.sbByeringOriginalSrc;
  if (originalSrc != null) {
    if (originalSrc) image.setAttribute("src", originalSrc);
    else image.removeAttribute("src");
  }
  const originalAlt = image.dataset.sbByeringOriginalAlt;
  if (originalAlt) image.setAttribute("alt", originalAlt);
  else image.removeAttribute("alt");
  image.classList.remove("sb-brand-image");
  if (image.dataset.sbByeringOriginalClass) image.setAttribute("class", image.dataset.sbByeringOriginalClass);
  else image.removeAttribute("class");
  delete image.dataset.sbByeringImage;
  delete image.dataset.sbByeringOriginalSrc;
  delete image.dataset.sbByeringOriginalAlt;
  delete image.dataset.sbByeringOriginalClass;
}

export function mountWordmark({ intervalMs = 600 } = {}) {
  ensureStyle();
  const initialClaimed = sweep();
  if (initialClaimed) releaseEarlyGuard();
  const observer = new MutationObserver(() => {
    const claimed = sweep();
    if (claimed) releaseEarlyGuard();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  const timer = setInterval(sweep, intervalMs);
  const fallbackTimer = setTimeout(releaseEarlyGuard, 2000);
  console.log("[Byering] brand adapter mounted");
  return {
    unmount() {
      clearInterval(timer);
      clearTimeout(fallbackTimer);
      observer.disconnect();
      for (const node of document.querySelectorAll("[data-sb-byering-image]")) restoreImage(node);
      for (const node of document.querySelectorAll("[data-sb-byering-wordmark]")) {
        if (node.__sbOriginalNode) node.replaceWith(node.__sbOriginalNode);
      }
      if (document.body && typeof document.createTreeWalker === "function") {
        const walker = document.createTreeWalker(document.body, 4);
        let textNode;
        while ((textNode = walker.nextNode())) {
          if (textNode.__sbByeringOriginalValue != null) {
            textNode.nodeValue = textNode.__sbByeringOriginalValue;
            delete textNode.__sbByeringOriginalValue;
          }
        }
      }
      if (styleTag?.isConnected) styleTag.remove();
      if (document.documentElement?.dataset.byeringGuard === "ready") delete document.documentElement.dataset.byeringGuard;
    }
  };
}
