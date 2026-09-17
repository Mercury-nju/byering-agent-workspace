const DEFAULT_TIME_ZONE = "Asia/Shanghai";

const AGENT_ALIASES = Object.freeze([
  Object.freeze({ agentId: "mkt-comment-acquisition", labels: ["抖音获客管家", "获客专家"] }),
  Object.freeze({ agentId: "mkt-find-people", labels: ["找客专员", "找人管家"] }),
  Object.freeze({ agentId: "mkt-intent-analyst", labels: ["客户分析员", "客户研究员", "分析助手"] }),
  Object.freeze({ agentId: "mkt-live-danmaku-analysis", labels: ["直播间弹幕分析", "直播弹幕分析"] }),
  Object.freeze({ agentId: "mkt-viral-work-analysis", labels: ["爆款作品分析", "作品分析助手"] }),
  Object.freeze({ agentId: "mkt-cold-writer", labels: ["潜客触达专员", "潜客激活专员", "私信运营"] }),
  Object.freeze({ agentId: "mkt-live-danmaku-outreach", labels: ["直播间触达", "直播间私信触达"] }),
  Object.freeze({ agentId: "mkt-dm-inbox", labels: ["私信客服", "私信自动回复", "对话助手"] }),
  Object.freeze({ agentId: "mkt-gold-customer-service", labels: ["金牌客服", "快速接待客服"] }),
]);

const COUNT_LABELS = Object.freeze({
  candidates: "候选客户",
  candidate: "候选客户",
  leads: "线索",
  lead: "线索",
  qualified: "高意向",
  qualifiedLeads: "高意向线索",
  discovered: "发现",
  captured: "捕获",
  analyzed: "已分析",
  sent: "已发送",
  accepted: "已接收",
  replied: "已回复",
  replies: "回复",
  failed: "失败",
  errors: "错误",
  comments: "评论",
  messages: "消息",
  conversations: "会话",
  signals: "有效信号",
  drafts: "草稿",
  newCandidates: "新增候选",
  duplicates: "重复项",
  likes: "点赞",
  shares: "分享",
  favorites: "收藏",
  totalInteractions: "总互动"
});

const METRIC_LABELS = Object.freeze({
  touchRate: "触达率",
  replyRate: "回复率",
  conversionRate: "转化率",
  engagementRate: "互动率"
});

const DATA_SIGNAL = /(?:数据|结果|产出|发现|线索|指标|表现|做了什么|产生|完成了什么|汇总|明细)/u;
const METRIC_SIGNAL = /(?:转化率|触达率|回复率|响应率|线索数|客户数|候选数|发送数|完成数|失败数|成本|耗时)/u;
const DIRECT_DATA_QUESTION_SIGNAL = /(?:多少|几[条位个]?|是多少|怎么样|如何|统计|汇总|明细|产生了什么|做了什么)/u;
const ANALYSIS_SIGNAL = /(?:为什么|原因|怎么改善|如何提升|变得更好|优化|建议|调整)/u;
const AGENT_SIGNAL = /(?:agent|助手|专员|管家|客服|员工)/iu;
const ALL_AGENT_SIGNAL = /(?:每个|各个|所有|全部|分别|整体|全局).{0,12}(?:agent|助手|专员|管家|客服|员工)/iu;
const ABILITY_SIGNAL = /(?:能不能|能否|可以不可以|可不可以|能看到|知道|了解|是否).{0,16}(?:每个|各个|所有|agent|助手|专员|管家|客服|员工)/iu;

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function dateKeyFor(value, timeZone = DEFAULT_TIME_ZONE) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function shiftDateKey(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function agentIdForText(text) {
  return AGENT_ALIASES.find(({ labels }) => labels.some((label) => text.includes(label)))?.agentId || null;
}

function agentLabel(agentId, fallback = "") {
  const normalizedFallback = cleanText(fallback);
  const knownLabel = AGENT_ALIASES.find((item) => item.agentId === agentId)?.labels[0];
  return (normalizedFallback && normalizedFallback !== agentId ? normalizedFallback : "")
    || knownLabel
    || normalizedFallback
    || agentId
    || "未命名 Agent";
}

function timestampFor(result = {}) {
  return cleanText(result.resultSnapshot?.generatedAt || result.resultSnapshot?.generated_at)
    || cleanText(result.updatedAt)
    || cleanText(result.createdAt)
    || null;
}

function resultAgentId(result = {}) {
  return cleanText(result.agentId || result.resultSnapshot?.agentId || result.resultSnapshot?.agent_id);
}

function resultSnapshotFor(result = {}) {
  return result.resultSnapshot && typeof result.resultSnapshot === "object" && !Array.isArray(result.resultSnapshot)
    ? result.resultSnapshot
    : null;
}

function isDataBearingResult(result = {}) {
  const snapshot = resultSnapshotFor(result);
  if (!snapshot) return false;
  const status = cleanText(result.status || snapshot.status).toLowerCase();
  if (!new Set(["running", "in_progress", "pending", "waiting"]).has(status)) return true;
  const hasCounts = Object.keys(countsFor(snapshot)).length > 0;
  const hasMetrics = Object.keys(metricsFor(snapshot)).length > 0;
  const hasCollections = ["items", "evidence", "candidateEvidence", "artifacts", "decisions", "actions"].some((key) => collectionLength(snapshot, key) > 0);
  if (hasCounts || hasMetrics || hasCollections) return true;
  return !/等待真实任务产出|没有可交付结果/u.test(cleanText(snapshot.summary));
}

function safeCount(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function countsFor(snapshot = {}) {
  const counts = snapshot.counts && typeof snapshot.counts === "object" && !Array.isArray(snapshot.counts)
    ? snapshot.counts
    : snapshot.counters && typeof snapshot.counters === "object" && !Array.isArray(snapshot.counters)
      ? snapshot.counters
      : {};
  return Object.fromEntries(Object.entries(counts)
    .filter(([key, value]) => /^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(key) && safeCount(value) != null)
    .slice(0, 32)
    .map(([key, value]) => [key, safeCount(value)]));
}

function metricsFor(snapshot = {}) {
  const metrics = Array.isArray(snapshot.metrics)
    ? snapshot.metrics.map((metric) => [metric?.key || metric?.name || metric?.id, metric?.value ?? metric?.displayValue])
    : snapshot.metrics && typeof snapshot.metrics === "object"
      ? Object.entries(snapshot.metrics)
      : [];
  return Object.fromEntries(metrics
    .filter(([key, value]) => /^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(String(key || ""))
      && ["string", "number", "boolean"].includes(typeof value))
    .slice(0, 24)
    .map(([key, value]) => [String(key), value]));
}

function collectionLength(snapshot, key) {
  return Array.isArray(snapshot?.[key]) ? snapshot[key].length : 0;
}

function artifactsFor(snapshot = {}) {
  const artifacts = Array.isArray(snapshot.artifacts) ? snapshot.artifacts : [];
  return [...new Set(artifacts
    .map((artifact) => cleanText(artifact?.name || artifact?.title))
    .filter(Boolean))].slice(0, 8);
}

function sourceFor(result, snapshot) {
  return cleanText(result.sourceContext?.source)
    || cleanText(snapshot.source)
    || cleanText(result.source)
    || "Agent 任务";
}

function resultMatchesDate(result, query) {
  if (!query?.dateKey) return true;
  const timestamp = timestampFor(result);
  return dateKeyFor(timestamp, query.timeZone) === query.dateKey;
}

export function detectChiefDataQuery(input, { now = new Date(), timeZone = DEFAULT_TIME_ZONE } = {}) {
  const text = cleanText(input);
  if (!text || ABILITY_SIGNAL.test(text)) return null;
  const agentId = agentIdForText(text);
  const hasAgentScope = AGENT_SIGNAL.test(text) || Boolean(agentId);
  const hasDirectDataQuestion = DIRECT_DATA_QUESTION_SIGNAL.test(text);
  const hasDate = /昨天|今天|今日|前天/u.test(text);
  const hasMetricQuestion = METRIC_SIGNAL.test(text) && hasDirectDataQuestion;
  if (!DATA_SIGNAL.test(text) && !hasMetricQuestion) return null;
  if (!hasAgentScope && !hasDate && !hasMetricQuestion) return null;
  if (!hasAgentScope && ANALYSIS_SIGNAL.test(text)) return null;

  const currentDateKey = dateKeyFor(now, timeZone);
  const dateKey = /昨天/u.test(text)
    ? shiftDateKey(currentDateKey, -1)
    : /今天|今日/u.test(text)
      ? currentDateKey
      : /前天/u.test(text)
        ? shiftDateKey(currentDateKey, -2)
        : null;

  return Object.freeze({
    scope: agentId && !ALL_AGENT_SIGNAL.test(text) ? "agent" : "all",
    agentId: agentId && !ALL_AGENT_SIGNAL.test(text) ? agentId : null,
    dateKey,
    timeZone
  });
}

export function buildChiefDataOverview({ query = {}, results = [], observedAt = null } = {}) {
  const matched = (Array.isArray(results) ? results : [])
    .filter((result) => resultSnapshotFor(result))
    .filter((result) => isDataBearingResult(result))
    .filter((result) => !query.agentId || resultAgentId(result) === query.agentId)
    .filter((result) => resultMatchesDate(result, query));
  const byAgent = new Map();

  for (const result of matched) {
    const snapshot = resultSnapshotFor(result);
    const agentId = resultAgentId(result) || "unknown-agent";
    const current = byAgent.get(agentId) || {
      agentId,
      agentName: agentLabel(agentId, result.agentName || snapshot.agentName || snapshot.agent_name),
      resultCount: 0,
      taskCount: new Set(),
      statuses: new Set(),
      counts: {},
      metrics: {},
      summaries: [],
      artifacts: new Set(),
      evidenceCount: 0,
      itemsCount: 0,
      latestAt: null,
      sources: new Set()
    };
    current.resultCount += 1;
    const taskId = cleanText(result.taskId || snapshot.taskId || snapshot.task_id);
    if (taskId) current.taskCount.add(taskId);
    const status = cleanText(result.status || snapshot.status);
    if (status) current.statuses.add(status);
    for (const [key, value] of Object.entries(countsFor(snapshot))) current.counts[key] = (current.counts[key] || 0) + value;
    Object.assign(current.metrics, metricsFor(snapshot));
    const summary = cleanText(snapshot.summary || snapshot.description || result.summary);
    if (summary && !current.summaries.includes(summary)) current.summaries.push(summary);
    for (const artifact of artifactsFor(snapshot)) current.artifacts.add(artifact);
    current.evidenceCount += collectionLength(snapshot, "evidence") + collectionLength(snapshot, "candidateEvidence");
    current.itemsCount += collectionLength(snapshot, "items") || collectionLength(snapshot, "leads") || collectionLength(snapshot, "candidates");
    const timestamp = timestampFor(result);
    if (timestamp && (!current.latestAt || timestamp > current.latestAt)) current.latestAt = timestamp;
    current.sources.add(sourceFor(result, snapshot));
    byAgent.set(agentId, current);
  }

  const agents = [...byAgent.values()].map((agent) => ({
    agentId: agent.agentId,
    agentName: agent.agentName,
    resultCount: agent.resultCount,
    taskCount: agent.taskCount.size,
    statuses: [...agent.statuses],
    counts: agent.counts,
    metrics: agent.metrics,
    summaries: agent.summaries.slice(0, 3),
    artifacts: [...agent.artifacts].slice(0, 8),
    evidenceCount: agent.evidenceCount,
    itemsCount: agent.itemsCount,
    latestAt: agent.latestAt,
    sources: [...agent.sources].slice(0, 4)
  }));

  return {
    available: agents.length > 0,
    query: clone(query),
    observedAt: observedAt || new Date().toISOString(),
    resultCount: matched.length,
    agentCount: agents.length,
    agents
  };
}

function countText(counts = {}) {
  return Object.entries(counts)
    .map(([key, value]) => `${COUNT_LABELS[key] || key} ${value}`)
    .join("、");
}

function metricText(metrics = {}) {
  return Object.entries(metrics)
    .map(([key, value]) => `${METRIC_LABELS[key] || key} ${value}`)
    .join("、");
}

function withSentence(value) {
  const text = cleanText(value);
  if (!text) return "";
  return /[。！？.!?]$/u.test(text) ? text : `${text}。`;
}

export function chiefDataMessage({ query = {}, overview = {} } = {}) {
  if (!overview.available || !overview.resultCount) {
    const scope = query.agentId ? agentLabel(query.agentId) : "Agent";
    const date = query.dateKey ? ` ${query.dateKey}` : "";
    return `没有找到${date ? `${date} ` : ""}的 ${scope} 产出记录，当前回答未使用默认数据。`;
  }
  const scope = query.agentId ? agentLabel(query.agentId) : "各个 Agent";
  const date = query.dateKey ? `（${query.dateKey}）` : "（已记录结果）";
  const lines = [`我已读取${scope}${date}的真实产出：共 ${overview.agentCount} 个 Agent、${overview.resultCount} 条结果记录。`];
  for (const agent of overview.agents) {
    const counts = countText(agent.counts);
    const metrics = metricText(agent.metrics);
    const details = [
      `${agent.resultCount} 条结果`,
      counts,
      metrics,
      agent.itemsCount ? `${agent.itemsCount} 条业务记录` : "",
      agent.evidenceCount ? `${agent.evidenceCount} 条证据` : "",
      agent.artifacts.length ? `${agent.artifacts.length} 份产出文件` : ""
    ].filter(Boolean).join("，");
    const summary = agent.summaries[0] ? `；${withSentence(agent.summaries[0])}` : "。";
    lines.push(`${agent.agentName}：${details}${summary}`);
  }
  return lines.join("\n");
}
