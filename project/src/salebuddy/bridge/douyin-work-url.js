const DOUYIN_HOST_PATTERN = /(^|\.)douyin\.com$/i;
const DIRECT_WORK_PATH_PATTERN = /^\/(?:share\/)?(video|note)\/([A-Za-z0-9_-]+)\/?$/i;

function text(value) {
  return String(value ?? "").trim();
}

export function normalizeDouyinWorkUrl(value) {
  try {
    const url = new URL(text(value));
    if (!/^https?:$/i.test(url.protocol) || !DOUYIN_HOST_PATTERN.test(url.hostname)) return "";

    const directMatch = url.pathname.match(DIRECT_WORK_PATH_PATTERN);
    if (directMatch) return `https://www.douyin.com/${directMatch[1].toLowerCase()}/${directMatch[2]}`;

    const pathname = url.pathname.replace(/\/+$/u, "") || "/";
    const modalId = ["/jingxuan", "/"].includes(pathname)
      ? url.searchParams.get("modal_id")
      : null;
    if (/^\d+$/u.test(modalId || "")) return `https://www.douyin.com/video/${modalId}`;
  } catch {
    return "";
  }
  return "";
}

export function isDouyinWorkUrl(value) {
  return Boolean(normalizeDouyinWorkUrl(value));
}

export function douyinWorkIdFromUrl(value) {
  return normalizeDouyinWorkUrl(value)?.match(/\/(?:video|note)\/([A-Za-z0-9_-]+)$/u)?.[1] || null;
}
