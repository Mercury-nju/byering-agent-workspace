/**
 * Shared real-avatar mapping for core employees and marketplace roles.
 * Technical agent ids remain the source of truth; names are compatibility aliases.
 */
import { mountGrokBotAvatar } from "./grok-bot-avatar.js";

// Raster mappings remain available for explicitly requested legacy surfaces;
// agent-facing mounts use the recovered DMG runtime by default.
const ASSET_URLS = Object.freeze({
  main: new URL("../../../assets/agents/agent-sales.png", import.meta.url).href,
  sales: new URL("../../../assets/agents/agent-sales.png", import.meta.url).href,
  customerSuccess: new URL("../../../assets/agents/agent-customer-success.png", import.meta.url).href,
  recruiting: new URL("../../../assets/agents/agents-recruiting.png", import.meta.url).href,
  education: new URL("../../../assets/agents/agent-education.png", import.meta.url).href,
  professionalServices: new URL("../../../assets/agents/agent-professional-services.png", import.meta.url).href,
  recordingSummary: new URL("../../../assets/agents/agent-recording-summary.png", import.meta.url).href
});

const HUMAN_ASSET_URLS = Object.freeze({
  human01: new URL("../../../assets/agents/human/generated-avatar-v2-01.png", import.meta.url).href,
  human02: new URL("../../../assets/agents/human/generated-avatar-v2-02.png", import.meta.url).href,
  human03: new URL("../../../assets/agents/human/generated-avatar-v2-03.png", import.meta.url).href,
  human04: new URL("../../../assets/agents/human/generated-avatar-v2-04.png", import.meta.url).href,
  human05: new URL("../../../assets/agents/human/generated-avatar-v2-05.png", import.meta.url).href,
  human06: new URL("../../../assets/agents/human/generated-avatar-v2-06.png", import.meta.url).href,
  human07: new URL("../../../assets/agents/human/generated-avatar-v2-07.png", import.meta.url).href,
  human08: new URL("../../../assets/agents/human/generated-avatar-v2-08.png", import.meta.url).href,
  human09: new URL("../../../assets/agents/human/generated-avatar-v3-01.png", import.meta.url).href,
  human10: new URL("../../../assets/agents/human/generated-avatar-v3-02.png", import.meta.url).href,
  human11: new URL("../../../assets/agents/human/generated-avatar-v3-03.png", import.meta.url).href,
  human12: new URL("../../../assets/agents/human/generated-avatar-v3-04.png", import.meta.url).href,
  human13: new URL("../../../assets/agents/human/generated-avatar-v3-05.png", import.meta.url).href,
  human14: new URL("../../../assets/agents/human/generated-avatar-v3-06.png", import.meta.url).href,
  human15: new URL("../../../assets/agents/human/generated-avatar-v3-07.png", import.meta.url).href,
  human16: new URL("../../../assets/agents/human/generated-avatar-v3-08.png", import.meta.url).href,
  human17: new URL("../../../assets/agents/human/generated-avatar-v3-09.png", import.meta.url).href,
  human18: new URL("../../../assets/agents/human/generated-avatar-v3-10.png", import.meta.url).href,
  human19: new URL("../../../assets/agents/human/generated-avatar-v3-11.png", import.meta.url).href,
  human20: new URL("../../../assets/agents/human/generated-avatar-v3-12.png", import.meta.url).href
});

const AVATAR_KEYS = Object.freeze({
  main: "main",
  "Strategy Agent": "professionalServices",
  "Browser Agent": "recruiting",
  "Search Agent": "professionalServices",
  "Research Agent": "professionalServices",
  "App Agent": "customerSuccess",
  "Risk Agent": "sales",
  "Outreach Agent": "sales",
  "Outreach Ops Agent": "customerSuccess",
  "File Agent": "professionalServices",
  "mkt-lead-miner": "recruiting",
  "mkt-live-lead-miner": "recruiting",
  "mkt-audience-search": "sales",
  "mkt-network-miner": "professionalServices",
  "mkt-trend-insight": "professionalServices",
  "mkt-intent-analyst": "professionalServices",
  "mkt-market-scout": "professionalServices",
  "mkt-cold-writer": "sales",
  "mkt-user-research": "professionalServices",
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
  获客策略师: "professionalServices",
  小探: "professionalServices",
  线索猎人: "recruiting",
  潜客挖掘员: "recruiting",
  招聘猎头: "recruiting",
  数据分析师: "professionalServices",
  线索分析师: "professionalServices",
  数据分析: "professionalServices",
  客户分析员: "professionalServices",
  客户研究员: "professionalServices",
  客户画像研究员: "professionalServices",
  触达策略师: "customerSuccess",
  风控专员: "sales",
  外联专员: "sales",
  阿触: "sales",
  触达运营专员: "customerSuccess",
  跟跟: "customerSuccess",
  客户成功: "customerSuccess",
  金牌客服: "customerSuccess",
  内容策划: "sales",
  内容营销: "sales",
  教育培训: "education",
  专业服务: "professionalServices",
  录音总结: "recordingSummary",
  竞品调研: "professionalServices"
});

const HUMAN_AVATAR_KEYS = Object.freeze({
  main: "human02",
  sales: "human07",
  customerSuccess: "human05",
  recruiting: "human02",
  education: "human06",
  professionalServices: "human04",
  recordingSummary: "human08",
  "Strategy Agent": "human02",
  "Browser Agent": "human03",
  "Search Agent": "human04",
  "Research Agent": "human05",
  "App Agent": "human06",
  "Risk Agent": "human07",
  "Outreach Agent": "human08",
  "Outreach Ops Agent": "human02",
  "File Agent": "human03",
  "mkt-comment-filter": "human11",
  "mkt-lead-miner": "human05",
  "mkt-live-lead-miner": "human03",
  "mkt-research-expert": "human09",
  "mkt-audience-search": "human01",
  "mkt-network-miner": "human04",
  "mkt-trend-insight": "human06",
  "mkt-intent-analyst": "human07",
  "mkt-market-scout": "human06",
  "mkt-cold-writer": "human07",
  "mkt-user-research": "human13",
  "mkt-dm-inbox": "human10",
  "mkt-follow-up": "human08",
  "mkt-phone-sdr": "human01",
  "mkt-copywriter": "human02",
  "mkt-designer": "human03",
  "mkt-private-op": "human04",
  "mkt-cs-manager": "human05",
  "mkt-quote": "human06",
  "mkt-data-analyst": "human07",
  "mkt-bid": "human08"
});

const HUMAN_NAME_KEYS = Object.freeze({
  "Byering · 幕僚长": "human02",
  Byering: "human02",
  幕僚长: "human02",
  销售: "human07",
  销售顾问: "human07",
  获客策略师: "human02",
  小探: "human02",
  线索猎人: "human03",
  潜客挖掘员: "human03",
  招聘猎头: "human02",
  数据分析师: "human04",
  线索分析师: "human04",
  作品评论筛选专员: "human11",
  数据分析: "human04",
  客户分析员: "human05",
  客户研究员: "human05",
  客户画像研究员: "human05",
  触达策略师: "human06",
  风控专员: "human07",
  外联专员: "human08",
  阿触: "human08",
  触达运营专员: "human02",
  跟跟: "human02",
  客户成功: "human05",
  金牌客服: "human05",
  内容策划: "human06",
  内容营销: "human06",
  教育培训: "human06",
  专业服务: "human04",
  录音总结: "human08",
  竞品调研: "human05"
});

function avatarKey(value, variant = "human") {
  const normalized = String(value || "").trim();
  const keys = variant === "human" ? HUMAN_AVATAR_KEYS : AVATAR_KEYS;
  const names = variant === "human" ? HUMAN_NAME_KEYS : NAME_KEYS;
  return keys[normalized] || names[normalized] || null;
}

export function avatarUrlFor(value, { variant = "human" } = {}) {
  const key = avatarKey(value, variant);
  const assets = variant === "human" ? HUMAN_ASSET_URLS : ASSET_URLS;
  return key ? assets[key] : null;
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

export function mountAgentAvatar(container, value, { alt = "", variant = "grok", state = "idle", trackPointer = false, mode = "global" } = {}) {
  if (variant === "grok") {
    return mountGrokBotAvatar(container, value, { alt, state, trackPointer, mode });
  }
  const src = avatarUrlFor(value, { variant });
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
export function mountGroupAvatar(container, members, { alt = "项目组成员", layout = "grid", background = "#F3F6F9", variant = "grok" } = {}) {
  if (!container) return false;
  const horizontal = layout === "horizontal";
  const values = [...new Set((members || []).map((member) => String(member || "").trim()).filter(Boolean))].slice(0, horizontal ? 2 : 4);
  const sources = variant === "grok" ? values : values.map((value) => avatarUrlFor(value, { variant })).filter(Boolean);
  if (!sources.length) return false;

  container.textContent = "";
  container.dataset.sbAgentGroupAvatar = "1";
  container.setAttribute("aria-label", alt);
  container.style.position = "relative";
  container.style.overflow = "hidden";
  container.style.display = "block";
  container.style.background = background;

  const placements = (horizontal ? HORIZONTAL_GROUP_LAYOUTS : GROUP_LAYOUTS)[sources.length] || GROUP_LAYOUTS[4];
  for (const [index, source] of sources.entries()) {
    const image = document.createElement(variant === "grok" ? "div" : "img");
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
    if (variant === "grok") {
      mountGrokBotAvatar(image, source, { alt, trackPointer: false, mode: "group" });
    } else {
      configureImage(image, source);
      installAvatarFallback(image, container, alt);
    }
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

export { ASSET_URLS, AVATAR_KEYS, NAME_KEYS, HUMAN_ASSET_URLS, HUMAN_AVATAR_KEYS, HUMAN_NAME_KEYS };
