const COMPETITOR_INTENT_PATTERN = /竞品(?:账号|品牌|商家)?|竞争对手|对标(?:账号|品牌|商家)?|同行(?:账号|品牌|商家)?|相似品牌|类似账号|\bcompetitor\b/i;
const NEGATED_COMPETITOR_PATTERN = /(?:排除|不要|不找|避免|避开|剔除)[^。；;\n]{0,10}(?:竞品|竞争对手|对标|同行|相似品牌|类似账号|competitor)/i;

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function publicFinderNeedsBusinessAccount({ purposeIds = [], query = "", goal = "" } = {}) {
  if (Array.isArray(purposeIds) && purposeIds.includes("industryAccounts")) return true;
  const source = [query, goal].map(text).filter(Boolean).join("\n");
  return Boolean(source) && COMPETITOR_INTENT_PATTERN.test(source) && !NEGATED_COMPETITOR_PATTERN.test(source);
}

export function isDouyinProfileUrl(value) {
  try {
    const url = new URL(text(value));
    return ["http:", "https:"].includes(url.protocol)
      && /(^|\.)douyin\.com$/i.test(url.hostname)
      && /^\/user\/[^/]+/.test(url.pathname);
  } catch {
    return false;
  }
}

export function validatePublicFinderBusinessAccount({ required = false, businessAccountUrl = "" } = {}) {
  if (!required) return "";
  const url = text(businessAccountUrl);
  if (!url) return "想找竞品或同行账号，请先粘贴你的抖音账号主页链接。";
  if (!isDouyinProfileUrl(url)) return "请粘贴有效的抖音账号主页链接（例如 https://www.douyin.com/user/...）。";
  return "";
}
