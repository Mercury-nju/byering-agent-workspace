const FACT_KEYS = Object.freeze([
  "recentComment",
  "activeBehavior",
  "followedBrands",
  "vehiclePreference",
  "cityRelation",
  "storeConversation",
  "purchaseHistory"
]);

const PROFILE_FACT_FIELDS = Object.freeze({
  followedBrands: ["followedBrands", "followed_brands", "followingBrands", "following_brands"],
  vehiclePreference: ["vehiclePreference", "vehicle_preference", "modelPreference", "model_preference", "vehicleModel", "vehicle_model"],
  cityRelation: ["cityRelation", "city_relation", "locationRelation", "location_relation"],
  storeConversation: ["storeConversation", "store_conversation", "storeDialogue", "store_dialogue"],
  purchaseHistory: ["purchaseHistory", "purchase_history", "inquiryHistory", "inquiry_history", "priceInquiry", "price_inquiry"]
});

const PROFILE_FIELDS = Object.freeze([
  "sec_uid", "secUid", "uid", "user_id", "userId", "unique_id", "uniqueId", "nickname", "nick_name", "nickName",
  "avatar", "avatar_url", "avatarUrl", "profile_url", "profileUrl", "signature", "desc", "description",
  "province", "city", "location", "region", "ip_location", "ipLocation", "follower_count", "followerCount", "followers", "following_count",
  "followingCount", "aweme_count", "awemeCount", "total_favorited", "totalFavorited", "custom_verify",
  "customVerify", "enterprise_verify", "enterpriseVerify", "verified", "verify"
]);

const EVENT_LABELS = Object.freeze({
  comment: "评论",
  live_chat: "直播发言",
  like: "点赞",
  follow: "关注",
  favorite: "收藏",
  share: "分享",
  gift: "送礼",
  join: "进入直播间"
});

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cleanText(value) {
  if (Array.isArray(value)) return value.map(cleanText).filter(Boolean).join("、");
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function factValue(value) {
  if (isRecord(value)) return firstValue(value.value, value.text, value.content, value.label, value.description);
  return cleanText(value);
}

function firstValue(...values) {
  for (const value of values) {
    if (value === 0 || value === false) return value;
    const text = cleanText(value);
    if (text) return text;
  }
  return "";
}

function firstRecord(...values) {
  return values.find(isRecord) || null;
}

function valueAt(source, keys) {
  for (const key of keys) {
    const value = source?.[key];
    if (value !== undefined && value !== null && factValue(value)) return value;
  }
  return "";
}

function unwrapProfile(payload) {
  if (!isRecord(payload)) return {};
  return firstRecord(
    payload.profile,
    payload.user,
    payload.account,
    payload.data?.profile,
    payload.data?.user,
    payload.data?.account,
    payload.data?.data?.profile,
    payload.data?.data?.user,
    payload.data?.data?.account,
    payload.result?.profile,
    payload.result?.user,
    payload.result?.account,
    payload.result?.data?.profile,
    payload.result?.data?.user,
    payload.result?.data?.account,
    payload.data?.data,
    payload.data,
    payload.result,
    payload
  ) || {};
}

function fact(value, source, observedAt, extra = {}) {
  const normalized = factValue(value);
  if (!normalized) return null;
  return { value: normalized, source, ...(observedAt ? { observedAt } : {}), ...extra };
}

function latestTextEvidence(evidence = []) {
  return [...evidence].reverse().find((item) => cleanText(item?.quote || item?.text || item?.content));
}

function interactionSummary(evidence = [], contentCount = 0) {
  const counts = new Map();
  evidence.forEach((item) => {
    const type = cleanText(item?.type || item?.action).toLowerCase();
    if (!type) return;
    counts.set(type, (counts.get(type) || 0) + 1);
  });
  const parts = [...counts.entries()]
    .map(([type, count]) => `${EVENT_LABELS[type] || type}${count}次`)
    .filter(Boolean);
  const activity = parts.length
    ? `已记录${parts.join("、")}互动`
    : evidence.length
      ? `已记录${evidence.length}次互动行为`
      : "暂无可见互动记录";
  return contentCount > 0 ? `${activity}；已读取公开主页最近${contentCount}条作品` : activity;
}

function normalizeProfileData(payload) {
  const source = unwrapProfile(payload);
  const profile = {};
  for (const key of PROFILE_FIELDS) {
    const value = source[key];
    if (value !== undefined && value !== null && cleanText(value)) profile[key] = Array.isArray(value) ? value.slice(0, 20) : value;
  }
  const avatarUrl = firstValue(profile.avatarUrl, profile.avatar_url, profile.avatar);
  const nickname = firstValue(profile.nickname, profile.nick_name, profile.nickName);
  const location = firstValue(profile.location, profile.region, [profile.province, profile.city].filter(Boolean).join(" "), profile.ipLocation, profile.ip_location);
  if (avatarUrl) profile.avatarUrl = avatarUrl;
  if (nickname) profile.nickname = nickname;
  if (location) profile.location = location;
  return profile;
}

function profileFacts(payload, observedAt) {
  const source = unwrapProfile(payload);
  const facts = {};
  const factSources = {};
  for (const [key, fields] of Object.entries(PROFILE_FACT_FIELDS)) {
    const value = valueAt(source, fields) || valueAt(source.facts, fields) || valueAt(source.profileFacts, fields);
    const item = fact(value, "douyin_account_profile", observedAt);
    if (item) {
      facts[key] = item;
      factSources[key] = item.source;
    }
  }
  if (!facts.cityRelation) {
    const location = firstValue(source.location, source.region, [source.province, source.city].filter(Boolean).join(" "), source.ip_location, source.ipLocation);
    const item = fact(location ? `公开主页地域：${location}` : "", "douyin_account_profile", observedAt);
    if (item) {
      facts.cityRelation = item;
      factSources.cityRelation = item.source;
    }
  }
  return { facts, factSources };
}

function normalizeContentEvidence(payload) {
  const values = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.items)
      ? payload.items
      : Array.isArray(payload?.videos)
        ? payload.videos
      : Array.isArray(payload?.data?.items)
        ? payload.data.items
        : Array.isArray(payload?.data?.videos)
          ? payload.data.videos
          : Array.isArray(payload?.result?.items)
            ? payload.result.items
            : Array.isArray(payload?.result?.videos)
              ? payload.result.videos
          : [];
  return values.slice(0, 20).map((item) => ({
    id: firstValue(item?.aweme_id, item?.awemeId, item?.video_id, item?.videoId, item?.id),
    title: firstValue(item?.desc, item?.description, item?.title, item?.name),
    url: firstValue(item?.share_url, item?.shareUrl, item?.url),
    observedAt: firstValue(item?.create_time, item?.createdAt, item?.createTime, item?.publish_time, item?.publishedAt)
  })).filter((item) => item.id || item.title || item.url);
}

export function buildDouyinProspectFacts({ lead = {}, profile = null, videos = [], replies = [], observedAt = "" } = {}) {
  const evidence = Array.isArray(lead.evidence) ? lead.evidence : [];
  const latest = latestTextEvidence(evidence);
  const facts = {};
  const factSources = {};
  const contentEvidence = normalizeContentEvidence(videos);
  const latestComment = firstValue(lead.recentComment, lead.recent_comment, lead.latestComment, lead.latest_comment, latest?.quote, latest?.text, lead.text);
  const recentCommentFact = fact(latestComment, "douyin_interaction_event", latest?.observedAt || lead.observedAt || observedAt, {
    evidenceType: latest?.type || lead.source?.type || "interaction"
  });
  if (recentCommentFact) {
    facts.recentComment = recentCommentFact;
    factSources.recentComment = recentCommentFact.source;
  }
  const activityFact = fact(interactionSummary(evidence, contentEvidence.length), "douyin_interaction_events", latest?.observedAt || lead.observedAt || observedAt, {
    evidenceCount: evidence.length,
    contentCount: contentEvidence.length
  });
  if (activityFact) {
    facts.activeBehavior = activityFact;
    factSources.activeBehavior = activityFact.source;
  }
  const profileResult = profileFacts(profile, observedAt);
  Object.assign(facts, profileResult.facts);
  Object.assign(factSources, profileResult.factSources);

  const latestReply = [...replies].reverse().find((reply) => cleanText(reply?.content || reply?.text || reply?.message));
  const conversation = fact(
    latestReply?.content || latestReply?.text || latestReply?.message,
    "douyin_private_message",
    latestReply?.createdAt || latestReply?.receivedAt || observedAt
  );
  if (conversation) {
    facts.storeConversation = conversation;
    factSources.storeConversation = conversation.source;
  }

  const factAvailability = Object.fromEntries(FACT_KEYS.map((key) => [key, facts[key] ? "available" : "unavailable"]));
  return {
    facts,
    factSources,
    factAvailability,
    profileData: normalizeProfileData(profile),
    contentEvidence,
    source: {
      interaction: evidence.length ? "douyin_rpa_interactions" : "unavailable",
      profile: profile ? "douyin_agent_data_profile" : "unavailable",
      content: contentEvidence.length ? "douyin_agent_data_videos_latest" : "unavailable"
    }
  };
}

export function mergeDouyinProspectFacts(previous = {}, next = {}) {
  const merged = { ...(isRecord(previous) ? previous : {}) };
  for (const key of FACT_KEYS) if (next?.[key]) merged[key] = next[key];
  return merged;
}

export { FACT_KEYS };
