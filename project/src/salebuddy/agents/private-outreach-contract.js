export const PRIVATE_OUTREACH_MODES = Object.freeze({
  PROSPECTS: "prospects",
  ALL_FOUND: "all_found"
});

export function normalizePrivateOutreachMode(value) {
  return value === PRIVATE_OUTREACH_MODES.ALL_FOUND
    ? PRIVATE_OUTREACH_MODES.ALL_FOUND
    : PRIVATE_OUTREACH_MODES.PROSPECTS;
}

export function privateOutreachModeLabel(mode) {
  return normalizePrivateOutreachMode(mode) === PRIVATE_OUTREACH_MODES.ALL_FOUND
    ? "触达所有找到的人"
    : "触达潜客";
}

export function privateOutreachProfileIdentifier(value = "") {
  try {
    const url = new URL(String(value || "").trim());
    if (!(url.protocol === "http:" || url.protocol === "https:") || !/(^|\.)douyin\.com$/i.test(url.hostname)) {
      return "";
    }
    const match = url.pathname.match(/^\/user\/([^/]+)/i);
    return match?.[1] ? decodeURIComponent(match[1]) : "";
  } catch {
    return "";
  }
}

export function isAlreadyContactedRecord(record = {}) {
  const values = [
    record.status,
    record.outreachStatus,
    record.outreach_status,
    record.touchStatus,
    record.touch_status,
    record.execution?.status
  ].map((value) => String(value || "").trim().toLowerCase());
  return values.some((value) => [
    "已触达",
    "触达成功",
    "触达中",
    "发送中",
    "已回复",
    "已留资",
    "已转化",
    "sent",
    "sending",
    "pending",
    "delivered",
    "replied",
    "converted",
    "in_progress",
    "in-progress"
  ].includes(value));
}

export function isPrivateOutreachRecordCandidate(record = {}, mode = PRIVATE_OUTREACH_MODES.PROSPECTS) {
  if (isAlreadyContactedRecord(record)) return false;
  const status = String(record.status || "").trim();
  if (normalizePrivateOutreachMode(mode) === PRIVATE_OUTREACH_MODES.ALL_FOUND) {
    return ["待触达", "待确认触达", "待分析"].includes(status);
  }
  return status === "待确认触达";
}
