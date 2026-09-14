import { personAvatarUrl } from "./person-avatar.js";

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function text(...values) {
  return values.map((value) => String(value ?? "").trim()).find(Boolean) || "";
}

function number(...values) {
  for (const value of values) {
    if (value == null || value === "") continue;
    if (value === 0) return 0;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function bool(...values) {
  for (const value of values) {
    if (typeof value === "boolean") return value;
    if (value === 0 || value === 1) return value === 1;
    if (value != null && value !== "") return ["true", "1", "yes", "live", "直播中"].includes(String(value).toLowerCase());
  }
  return false;
}

function identityOf(account) {
  const identity = isRecord(account?.identity) ? account.identity : {};
  const profile = isRecord(account?.profile) ? account.profile : {};
  return text(account?.accountId, account?.account_id, account?.sec_uid, account?.secUid, identity.sec_uid, identity.secUid, profile.sec_uid, profile.secUid, account?.reference);
}

function profileOf(account) {
  return isRecord(account?.profile) ? account.profile : {};
}

function identityDataOf(account) {
  return isRecord(account?.identity) ? account.identity : {};
}

function uniqueTexts(values = []) {
  return [...new Set(values.map((value) => text(value)).filter(Boolean))];
}

function readableEvidence(value) {
  if (typeof value === "string") return text(value);
  if (!isRecord(value)) return "";
  const direct = text(value.reason, value.rationale, value.quote, value.text, value.description);
  if (direct) return direct;
  if (value.type === "profile" && text(value.value)) {
    const field = { location: "地域", followers: "粉丝数", awemeCount: "作品数", likes: "获赞" }[text(value.field)] || text(value.field, "主页信息");
    return `主页${field}：${text(value.value)}`;
  }
  if (value.type === "content" && Array.isArray(value.keywords) && value.keywords.length) {
    return `主页或近期作品命中：${uniqueTexts(value.keywords).join("、")}`;
  }
  if (value.type === "topic" && Array.isArray(value.signals) && value.signals.length) {
    return `主题证据命中：${uniqueTexts(value.signals).join("、")}`;
  }
  if (value.type === "growth" && value.metric === "followers" && value.value != null) {
    const days = number(value.windowDays);
    return `近${days == null ? "" : `${days}天`}新增粉丝：${number(value.value) == null ? text(value.value) : Number(value.value).toLocaleString("zh-CN")}`;
  }
  return "";
}

export function finderAccountEvidence(account = {}) {
  const values = [
    ...(Array.isArray(account.evidence) ? account.evidence : []),
    ...(Array.isArray(account.matchingEvidence) ? account.matchingEvidence : []),
    ...(Array.isArray(account.finderState?.evidence) ? account.finderState.evidence : [])
  ];
  return uniqueTexts(values.map(readableEvidence));
}

export function finderAccountReasons(account = {}) {
  const values = [
    ...(Array.isArray(account.reasons) ? account.reasons : []),
    ...(Array.isArray(account.matchingReasons) ? account.matchingReasons : []),
    ...(Array.isArray(account.finderState?.reasons) ? account.finderState.reasons : []),
    account.reason,
    account.rationale,
    account.filter?.reason,
    ...finderAccountEvidence(account)
  ];
  return uniqueTexts(values);
}

export function hasFinderMatchEvidence(account = {}) {
  return finderAccountReasons(account).length > 0;
}

export function finderAccountId(account = {}) {
  return identityOf(account);
}

export function finderAccountUrl(account = {}) {
  const profile = profileOf(account);
  const identity = identityDataOf(account);
  return text(account.profileUrl, account.profile_url, profile.profile_url, profile.profileUrl, identity.profile_url, identity.profileUrl, /^https?:\/\//i.test(String(account.reference || "")) ? account.reference : "");
}

export function finderAccountName(account = {}) {
  const profile = profileOf(account);
  const identity = identityDataOf(account);
  return text(account.nickname, profile.nickname, profile.nick_name, profile.name, profile.account_name, profile.unique_id, identity.nickname, identity.nick_name, identity.name, "未命名账号");
}

export function finderAccountToOutreach(account = {}) {
  const id = finderAccountId(account);
  const avatar = personAvatarUrl(account);
  return {
    id,
    name: finderAccountName(account),
    profileUrl: finderAccountUrl(account),
    secId: text(account.sec_id, account.secId, account.identity?.sec_id, account.identity?.secId, id),
    secUid: text(account.sec_uid, account.secUid, account.identity?.sec_uid, account.identity?.secUid, id),
    ...(avatar ? { avatar } : {})
  };
}

export function normalizeDouyinFinderAccount(account = {}) {
  const profile = profileOf(account);
  const identity = identityDataOf(account);
  const id = finderAccountId(account);
  const matched = account.matched === true;
  const existingState = isRecord(account.finderState) ? account.finderState : {};
  const pendingEvidence = account.status === "UNRESOLVED" || account.status === "PARTIAL" || account.tier === "待补数据";
  const status = text(existingState.status, pendingEvidence ? "待核验" : matched ? "匹配" : "不匹配");
  const videos = Array.isArray(account.videos) ? account.videos : [];
  const reasons = finderAccountReasons(account);
  const evidence = Array.isArray(account.evidence) ? [...account.evidence] : [];
  const growth = isRecord(account.growth) ? {
    ...account.growth,
    windowDays: number(account.growth.windowDays),
    newFollowers: number(account.growth.newFollowers),
    currentFollowers: number(account.growth.currentFollowers),
    newLikes: number(account.growth.newLikes),
    newItems: number(account.growth.newItems)
  } : null;
  return {
    ...account,
    accountId: id,
    nickname: finderAccountName(account),
    handle: text(account.handle, profile.unique_id, profile.uniqueId, identity.unique_id, identity.uniqueId, id),
    profileUrl: finderAccountUrl(account),
    avatar: personAvatarUrl(account),
    followers: number(account.followers, profile.follower_count, profile.followers, profile.followerCount),
    awemeCount: number(account.awemeCount, profile.aweme_count, profile.awemeCount, profile.video_count, profile.videoCount),
    likes: number(account.likes, profile.total_favorited, profile.likes, profile.like_count, profile.likeCount),
    location: text(account.location, profile.province, profile.city, profile.region),
    isLive: bool(account.isLive, account.live?.is_live, account.live?.isLive, account.live?.live, account.live?.status === "live", account.live?.status === "直播中"),
    finderState: {
      status,
      saved: Boolean(existingState.saved),
      tags: Array.isArray(existingState.tags) ? [...new Set(existingState.tags.map((tag) => text(tag)).filter(Boolean))] : [],
      reasons,
      evidence
    },
    reasons,
    evidence,
    growth,
    videos
  };
}

export function normalizeDouyinFinderAccounts(accounts = []) {
  return (Array.isArray(accounts) ? accounts : []).map(normalizeDouyinFinderAccount);
}

export function mergeResolvedFinderAccounts(accounts = [], resolvedEntries = []) {
  const normalized = normalizeDouyinFinderAccounts(accounts);
  const entries = Array.isArray(resolvedEntries) ? resolvedEntries : [];
  return normalized.map((account, index) => {
    const entry = entries.find((candidate) => Number(candidate?.index) === index) || entries[index];
    const resolved = isRecord(entry?.account) ? entry.account : {};
    const avatar = personAvatarUrl(account, resolved);
    if (!avatar) return account;
    return normalizeDouyinFinderAccount({
      ...account,
      avatar,
      identity: {
        ...(isRecord(account.identity) ? account.identity : {}),
        ...resolved,
        avatarUrl: avatar
      }
    });
  });
}

export function finderAccountStatus(account = {}) {
  return text(account.finderState?.status, account.status === "UNRESOLVED" ? "待核验" : account.matched ? "匹配" : "不匹配");
}

export function finderAccountTags(account = {}) {
  return Array.isArray(account.finderState?.tags) ? account.finderState.tags : [];
}

export function finderAccountCsvRows(accounts = []) {
  return normalizeDouyinFinderAccounts(accounts).map((account) => [
    finderAccountName(account),
    account.handle,
    finderAccountUrl(account),
    finderAccountStatus(account),
    account.score ?? "",
    account.followers ?? "",
    account.awemeCount ?? "",
    account.likes ?? "",
    account.growth?.windowDays ?? "",
    account.growth?.newFollowers ?? "",
    account.growth?.currentFollowers ?? "",
    account.location,
    account.isLive ? "是" : "否",
    finderAccountTags(account).join(" / "),
    (account.reasons || []).join(" / ")
  ]);
}
