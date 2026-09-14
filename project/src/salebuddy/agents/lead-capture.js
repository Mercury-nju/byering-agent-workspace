const PHONE_PATTERN = /(?:\+?86[\s-]?)?1[3-9]\d{9}/;
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const WECHAT_PATTERN = /(?:微信(?:号)?|vx|v信|wechat)\s*(?:是|为|[:：])?\s*([a-z][-_a-z0-9]{5,19})/i;

export function extractLeadContact(content = "") {
  const text = String(content || "").trim();
  if (!text) return null;
  const phone = text.match(PHONE_PATTERN)?.[0] || null;
  const email = text.match(EMAIL_PATTERN)?.[0] || null;
  const wechat = text.match(WECHAT_PATTERN)?.[1] || null;
  if (!phone && !email && !wechat) return null;
  return { phone, email, wechat, source: "私信" };
}

export function detectsLeadCapture(content = "") {
  return Boolean(extractLeadContact(content));
}
