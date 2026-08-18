/**
 * Shared real-avatar mapping for core employees and marketplace roles.
 * Technical agent ids remain the source of truth; names are compatibility aliases.
 */
const ASSET_URLS = Object.freeze({
  main: new URL("../../../assets/agents/agent-sales.png", import.meta.url).href,
  sales: new URL("../../../assets/agents/agent-sales.png", import.meta.url).href,
  customerSuccess: new URL("../../../assets/agents/agent-customer-success.png", import.meta.url).href,
  recruiting: new URL("../../../assets/agents/agents-recruiting.png", import.meta.url).href,
  education: new URL("../../../assets/agents/agent-education.png", import.meta.url).href,
  professionalServices: new URL("../../../assets/agents/agent-professional-services.png", import.meta.url).href,
  recordingSummary: new URL("../../../assets/agents/agent-recording-summary.png", import.meta.url).href
});

const AVATAR_KEYS = Object.freeze({
  main: "main",
  "Browser Agent": "recruiting",
  "Search Agent": "professionalServices",
  "App Agent": "customerSuccess",
  "File Agent": "professionalServices",
  "mkt-lead-miner": "recruiting",
  "mkt-market-scout": "professionalServices",
  "mkt-cold-writer": "sales",
  "mkt-follow-up": "customerSuccess",
  "mkt-phone-sdr": "recordingSummary",
  "mkt-copywriter": "sales",
  "mkt-designer": "professionalServices",
  "mkt-private-op": "customerSuccess",
  "mkt-cs-manager": "customerSuccess",
  "mkt-quote": "professionalServices",
  "mkt-data-analyst": "professionalServices",
  "mkt-bid": "professionalServices"
});

const NAME_KEYS = Object.freeze({
  "Byering · 幕僚长": "main",
  Byering: "main",
  幕僚长: "main",
  销售: "sales",
  销售顾问: "sales",
  线索猎人: "recruiting",
  招聘猎头: "recruiting",
  数据分析师: "professionalServices",
  数据分析: "professionalServices",
  客户成功: "customerSuccess",
  金牌客服: "customerSuccess",
  内容策划: "sales",
  内容营销: "sales",
  教育培训: "education",
  专业服务: "professionalServices",
  录音总结: "recordingSummary",
  竞品调研: "professionalServices"
});

function avatarKey(value) {
  const normalized = String(value || "").trim();
  return AVATAR_KEYS[normalized] || NAME_KEYS[normalized] || null;
}

export function avatarUrlFor(value) {
  const key = avatarKey(value);
  return key ? ASSET_URLS[key] : null;
}

function configureImage(image, src, alt = "") {
  image.dataset.sbAgentAvatarImage = "1";
  image.src = src;
  image.alt = alt;
  image.loading = "eager";
  image.decoding = "async";
  image.style.width = "100%";
  image.style.height = "100%";
  image.style.objectFit = "cover";
  image.style.display = "block";
  image.style.borderRadius = "inherit";
}

function installAvatarFallback(image, container, alt = "") {
  image.addEventListener("error", () => {
    if (image.parentElement !== container) return;
    image.remove();
    container.dataset.sbAgentAvatarFallback = "1";
    container.setAttribute("aria-label", alt || "数字员工头像");
    if (!container.textContent.trim()) {
      const label = String(alt || "数字员工").replace(/头像$/, "").trim();
      container.textContent = Array.from(label)[0] || "人";
    }
  }, { once: true });
}

export function mountAgentAvatar(container, value, { alt = "" } = {}) {
  const src = avatarUrlFor(value);
  if (!src || !container) return false;
  const image = document.createElement("img");
  container.setAttribute("aria-label", alt || "数字员工头像");
  configureImage(image, src);
  installAvatarFallback(image, container, alt);
  container.textContent = "";
  container.appendChild(image);
  return true;
}

const GROUP_LAYOUTS = Object.freeze({
  1: [["14%", "14%", "72%", "72%"]],
  2: [["0%", "31%", "66%", "66%"], ["34%", "0%", "66%", "66%"]],
  3: [["0%", "25%", "58%", "58%"], ["42%", "0%", "58%", "58%"], ["22%", "48%", "58%", "58%"]],
  4: [["0%", "0%", "54%", "54%"], ["46%", "0%", "54%", "54%"], ["0%", "46%", "54%", "54%"], ["46%", "46%", "54%", "54%"]]
});
const HORIZONTAL_GROUP_LAYOUTS = Object.freeze({
  1: [["0%", "0%", "58%", "100%"]],
  2: [["0%", "0%", "58%", "100%"], ["42%", "0%", "58%", "100%"]]
});

/** Render a project-group avatar as a small, overlapping composition of its members. */
export function mountGroupAvatar(container, members, { alt = "项目组成员", layout = "grid", background = "#F3F6F9" } = {}) {
  if (!container) return false;
  const horizontal = layout === "horizontal";
  const sources = [...new Set((members || []).map(avatarUrlFor).filter(Boolean))].slice(0, horizontal ? 2 : 4);
  if (!sources.length) return false;

  container.textContent = "";
  container.dataset.sbAgentGroupAvatar = "1";
  container.setAttribute("aria-label", alt);
  container.style.position = "relative";
  container.style.overflow = "hidden";
  container.style.display = "block";
  container.style.background = background;

  const placements = (horizontal ? HORIZONTAL_GROUP_LAYOUTS : GROUP_LAYOUTS)[sources.length] || GROUP_LAYOUTS[4];
  for (const [index, src] of sources.entries()) {
    const image = document.createElement("img");
    configureImage(image, src);
    const [left, top, width, height] = placements[index];
    image.style.position = "absolute";
    image.style.left = left;
    image.style.top = top;
    image.style.width = width;
    image.style.height = height;
    image.style.borderRadius = "50%";
    image.style.border = "1px solid rgba(255,255,255,.95)";
    image.style.boxSizing = "border-box";
    image.style.zIndex = String(index + 1);
    installAvatarFallback(image, container, alt);
    container.appendChild(image);
  }
  return true;
}

export function applyAvatarToImage(image, value) {
  const src = avatarUrlFor(value);
  if (!src || !image) return false;
  if (!image.dataset.sbAgentAvatarOriginal) {
    image.dataset.sbAgentAvatarOriginal = "1";
    image.dataset.sbAgentAvatarOriginalSrc = image.getAttribute("src") || "";
    image.dataset.sbAgentAvatarOriginalAlt = image.getAttribute("alt") || "";
    image.dataset.sbAgentAvatarOriginalStyle = image.getAttribute("style") || "";
  }
  configureImage(image, src, image.getAttribute("alt") || "");
  return true;
}

export function restoreAvatarImage(image) {
  if (!image?.dataset.sbAgentAvatarOriginal) return;
  const src = image.dataset.sbAgentAvatarOriginalSrc;
  if (src) image.setAttribute("src", src);
  else image.removeAttribute("src");
  const alt = image.dataset.sbAgentAvatarOriginalAlt;
  if (alt) image.setAttribute("alt", alt);
  else image.removeAttribute("alt");
  const style = image.dataset.sbAgentAvatarOriginalStyle;
  if (style) image.setAttribute("style", style);
  else image.removeAttribute("style");
  delete image.dataset.sbAgentAvatarImage;
  delete image.dataset.sbAgentAvatarOriginal;
  delete image.dataset.sbAgentAvatarOriginalSrc;
  delete image.dataset.sbAgentAvatarOriginalAlt;
  delete image.dataset.sbAgentAvatarOriginalStyle;
}

export { ASSET_URLS, AVATAR_KEYS, NAME_KEYS };
