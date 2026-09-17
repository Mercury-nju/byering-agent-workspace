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
  { key: "price", label: "价格与优惠", pattern: /价格|多少钱|报价|优惠|折扣|便宜|预算|赠品|套装/ },
  { key: "availability", label: "库存与发货", pattern: /有货|现货|库存|发货|物流|到货|多久到|颜色还有|缺货/ },
  { key: "usage", label: "使用与效果", pattern: /怎么用|如何用|效果|适合|尺寸|容量|功能|质量|冰块|冰冻|清洗|刀头|续航|充电|几杯|声音|噪音|漏|细腻|果肉|携带|便携/ },
  { key: "comparison", label: "比较与选择", pattern: /对比|比较|区别|哪个好|哪款|推荐|大功率|普通榨汁机/ },
  { key: "after_sales", label: "售后与保障", pattern: /退货|退款|售后|保修|赔偿|质保|替换|坏了/ }
]);

const TOPIC_OPTIMIZATION = Object.freeze({
  price: {
    observation: "用户反复关注价格与优惠，下一场可以把成本信息前置。",
    strategy: "开场先讲清价格区间、优惠条件和适用人群，减少直播中反复问价。"
  },
  availability: {
    observation: "用户集中确认库存、发货和到货时间，履约信息可能影响决策。",
    strategy: "商品介绍时同步说明现货、发货节点和到货范围，固定一个可重复引用的口径。"
  },
  usage: {
    observation: "用户在确认使用方式、效果和适配边界，说明场景解释仍有空间。",
    strategy: "增加真实使用演示，并明确适用场景、限制条件和对比前后的效果。"
  },
  comparison: {
    observation: "用户在不同方案之间比较，下一场需要更快给出选择标准。",
    strategy: "增加横向对比环节，直接说明不同方案适合谁、差异是什么以及如何选择。"
  },
  after_sales: {
    observation: "用户关注退换、售后和保障，信任成本是需要被主动回答的问题。",
    strategy: "在商品讲解后主动说明售后、退换和保障边界，避免信息只在被追问时出现。"
  }
});

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

function buildOptimization(topics, counts, goal) {
  const priorityTopics = topics.slice(0, 5).map((topic, index) => {
    const advice = TOPIC_OPTIMIZATION[topic.key] || {
      observation: "用户在本主题持续表达关注，下一场需要补充对应信息。",
      strategy: "把该主题安排到商品讲解的固定环节，并用真实弹幕验证问题是否减少。"
    };
    return {
      key: topic.key,
      label: topic.label,
      count: topic.count,
      userCount: topic.userCount,
      priority: index === 0 ? "优先" : index < 3 ? "重点" : "观察",
      observation: advice.observation,
      strategy: advice.strategy,
      examples: topic.examples
    };
  });
  const nextLiveActions = priorityTopics.slice(0, 3).map((topic) => topic.strategy);
  if (counts.questions > 0) nextLiveActions.push("设置固定的弹幕回应节点，主播每讲完一个重点就集中处理相关问题。");
  if (!nextLiveActions.length) nextLiveActions.push("下一场先补齐商品、价格和使用场景说明，再观察用户问题是否形成稳定主题。");
  const first = priorityTopics[0];
  return {
    goal: text(goal),
    headline: first
      ? `下一场优先优化${first.label}的讲解顺序。`
      : "本场没有形成稳定主题，下一场先补齐基础信息讲解。",
    priorityTopics,
    nextLiveActions: [...new Set(nextLiveActions)].slice(0, 5)
  };
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
      const current = topics.get(topic.key) || { key: topic.key, label: topic.label, count: 0, examples: [], userIds: new Set() };
      current.count += 1;
      current.userIds.add(event.userId);
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
  const topicList = [...topics.values()]
    .map(({ userIds, ...topic }) => ({ ...topic, userCount: userIds.size }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 12);
  const optimization = buildOptimization(topicList, counts, goal);
  const date = now ? new Date(now) : null;
  const observedAt = date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
  const roomId = events.find((item) => item.roomId)?.roomId || "";
  const summary = `本轮分析${counts.danmaku}条新弹幕：用户主要关注${optimization.priorityTopics[0]?.label || "暂无稳定主题"}，下一场优先优化${optimization.priorityTopics[0]?.label || "基础信息讲解"}。`;

  return {
    analysisKind: "live_danmaku",
    goal: text(goal),
    roomId,
    observedAt,
    summary,
    counts,
    userStats: {
      repeatUsers: users.filter((user) => user.danmakuCount > 1).length,
      questionUsers: new Set(events.filter((event) => /[？?]|吗$|请问|多少钱|怎么/.test(event.quote)).map((event) => event.userId)).size,
      averageDanmakuPerUser: users.length ? Number((events.length / users.length).toFixed(1)) : 0
    },
    topics: topicList,
    optimization,
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
