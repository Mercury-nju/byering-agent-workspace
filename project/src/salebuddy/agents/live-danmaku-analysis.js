const EVENT_TYPE_ALIASES = Object.freeze({
  chat: "live_chat",
  danmaku: "live_chat",
  comment: "live_chat",
  live_chat: "live_chat",
  like: "like",
  live_like: "like",
  gift: "gift",
  follow: "follow",
  live_follow: "follow",
  join: "join",
  member: "join"
});

const TOPIC_DEFINITIONS = Object.freeze([
  { key: "price", label: "价格与优惠", pattern: /价格|多少钱|报价|优惠|折扣|便宜|预算/ },
  { key: "availability", label: "库存与发货", pattern: /有货|现货|库存|发货|物流|到货|多久到/ },
  { key: "usage", label: "使用与效果", pattern: /怎么用|如何用|效果|适合|尺寸|容量|功能|质量/ },
  { key: "comparison", label: "比较与选择", pattern: /对比|比较|区别|哪个好|哪款|推荐/ },
  { key: "after_sales", label: "售后与保障", pattern: /退货|退款|售后|保修|赔偿|质保/ }
]);

const HIGH_INTENT_PATTERN = /我要买|想买|准备买|下单|怎么买|拍下|购买|链接|多少钱|有现货|什么时候发货/;
const MEDIUM_INTENT_PATTERN = /吗[？?]?$|怎么|如何|想了解|需要|有没有|可以|适合|考虑|咨询|问下|请问/;

function text(value) {
  return String(value || "").trim();
}

function eventType(value) {
  const raw = text(value).toLowerCase().replace(/[ -]/g, "_");
  return EVENT_TYPE_ALIASES[raw] || raw || "unknown";
}

function eventUserId(signal = {}) {
  return text(
    signal.userId
      || signal.user_id
      || signal.secUid
      || signal.sec_uid
      || signal.externalUserId
      || signal.external_user_id
      || signal.uniqueId
      || signal.unique_id
      || signal.id
  );
}

function eventNickname(signal = {}) {
  return text(signal.nickname || signal.nick_name || signal.name || signal.userName || "抖音用户") || "抖音用户";
}

function flattenSignals(signals = []) {
  return (Array.isArray(signals) ? signals : []).flatMap((signal, signalIndex) => {
    const source = signal && typeof signal === "object" ? signal : {};
    const evidence = Array.isArray(source.evidence) && source.evidence.length
      ? source.evidence
      : [source];
    return evidence.map((entry, evidenceIndex) => {
      const item = entry && typeof entry === "object" ? entry : {};
      const type = eventType(item.type || item.action || item.eventType || source.type || source.action);
      const quote = text(item.quote || item.text || item.content || source.text || source.comment || source.content);
      const userId = eventUserId({ ...source, ...item });
      return {
        id: text(item.id || item.eventId || source.id) || `signal-${signalIndex}-${evidenceIndex}`,
        userId: userId || `anonymous-${signalIndex}`,
        nickname: eventNickname({ ...source, ...item }),
        type,
        quote,
        roomId: text(item.roomId || item.room_id || source.roomId || source.room_id),
        observedAt: text(item.observedAt || item.observed_at || source.observedAt || source.observed_at),
        source: item.source || source.source || null
      };
    });
  });
}

function classifyText(quote) {
  if (!quote) return { tier: "待分析", score: 0 };
  if (HIGH_INTENT_PATTERN.test(quote)) return { tier: "重点", score: 90 };
  if (MEDIUM_INTENT_PATTERN.test(quote) || /[？?]/.test(quote)) return { tier: "待确认", score: 60 };
  return { tier: "待确认", score: 45 };
}

function topicMatches(quote) {
  return TOPIC_DEFINITIONS.filter((topic) => topic.pattern.test(quote));
}

function userResult(events) {
  const first = events[0] || {};
  const danmaku = events.filter((item) => item.type === "live_chat");
  const authoredText = danmaku.map((item) => item.quote).filter(Boolean);
  const classification = authoredText.reduce((best, quote) => {
    const next = classifyText(quote);
    return next.score > best.score ? next : best;
  }, { tier: "待分析", score: 0 });
  const topics = [...new Set(authoredText.flatMap(topicMatches).map((topic) => topic.key))];

  return {
    userId: first.userId,
    nickname: first.nickname,
    intentTier: classification.tier,
    score: classification.score,
    danmakuCount: danmaku.length,
    behaviorOnly: authoredText.length === 0,
    topics,
    evidence: events.slice(0, 20).map((item) => ({
      type: item.type,
      quote: item.quote,
      roomId: item.roomId,
      observedAt: item.observedAt
    }))
  };
}

export function analyzeLiveDanmakuSignals({ signals = [], goal = "", now = null } = {}) {
  const events = flattenSignals(signals).filter((event) => event.type === "live_chat");
  const grouped = new Map();
  for (const event of events) {
    if (!grouped.has(event.userId)) grouped.set(event.userId, []);
    grouped.get(event.userId).push(event);
  }

  const users = [...grouped.values()]
    .map(userResult)
    .sort((left, right) => right.score - left.score || right.danmakuCount - left.danmakuCount || left.nickname.localeCompare(right.nickname, "zh-CN"));
  const topics = new Map();
  for (const event of events) {
    for (const topic of topicMatches(event.quote)) {
      const current = topics.get(topic.key) || { key: topic.key, label: topic.label, count: 0, examples: [] };
      current.count += 1;
      if (event.quote && current.examples.length < 3 && !current.examples.includes(event.quote)) current.examples.push(event.quote);
      topics.set(topic.key, current);
    }
  }

  const counts = {
    total: events.length,
    danmaku: events.filter((item) => item.type === "live_chat").length,
    uniqueUsers: users.length,
    questions: events.filter((item) => item.type === "live_chat" && /[？?]|吗$|请问|多少钱|怎么/.test(item.quote)).length,
    highIntent: users.filter((user) => user.intentTier === "重点").length,
    mediumIntent: users.filter((user) => user.intentTier === "待确认").length,
    behaviorOnly: users.filter((user) => user.behaviorOnly).length
  };
  const date = now ? new Date(now) : null;
  const observedAt = date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
  const roomId = events.find((item) => item.roomId)?.roomId || "";
  const summary = `本轮分析${counts.danmaku}条新弹幕：识别到${counts.highIntent}个明确需求用户，${counts.questions}条待回应问题，${counts.behaviorOnly}个用户暂未表达明确需求。`;

  return {
    analysisKind: "live_danmaku",
    goal: text(goal),
    roomId,
    observedAt,
    summary,
    counts,
    topics: [...topics.values()].sort((left, right) => right.count - left.count).slice(0, 12),
    users: users.slice(0, 200),
    evidence: events.filter((item) => item.quote).slice(-100).map((item) => ({
      userId: item.userId,
      nickname: item.nickname,
      type: item.type,
      quote: item.quote,
      roomId: item.roomId,
      observedAt: item.observedAt
    }))
  };
}
