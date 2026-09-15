import {
  DOUYIN_ACQUISITION_ACTIVE_AGENT_IDS,
  getMarketplaceAgent
} from "../src/salebuddy/agents/marketplace.js";

const REPORT_TIME_ZONE = "Asia/Shanghai";
const DEFAULT_REPORT_HOUR = 22;
const MAX_BACKFILL_REPORT_DAYS = 7;
const PRODUCT_AGENT_IDS = new Set(DOUYIN_ACQUISITION_ACTIVE_AGENT_IDS);
const CONTINUOUS_DAILY_REPORT_AGENT_IDS = new Set([
  "mkt-comment-acquisition",
  "mkt-dm-inbox",
  "mkt-gold-customer-service"
]);
const FINDER_AGENT_ID = "mkt-find-people";
const FINDER_LISTENER_SOURCE_KINDS = new Set([
  "authorized_account_all_signals",
  "authorized_account_comments",
  "authorized_account_live",
  "authorized_account_interactions"
]);
const REAL_WORK_EVENT_TYPES = new Set([
  "lead.source.synced",
  "lead.candidate",
  "lead.qualified",
  "lead.rejected",
  "lead.replied",
  "outreach.ready",
  "outreach.accepted",
  "outreach.scheduled",
  "outreach.sending",
  "outreach.sent",
  "outreach.failed",
  "reply.sent",
  "agent.stage.completed"
]);

const EVENT_LABELS = Object.freeze({
  "lead.source.synced": "已同步线索来源",
  "lead.candidate": "已发现候选用户",
  "lead.qualified": "已完成意向筛选",
  "lead.rejected": "已排除不匹配线索",
  "lead.replied": "已收到用户回复",
  "outreach.ready": "已准备触达内容",
  "outreach.accepted": "触达请求已被平台接收",
  "outreach.scheduled": "已安排后续触达",
  "outreach.sending": "正在执行触达",
  "outreach.sent": "已完成触达",
  "outreach.failed": "触达未成功",
  "reply.sent": "已完成对话回复",
  "agent.stage.completed": "已完成一个工作阶段"
});

function asText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function safeId(value) {
  return asText(value, "unbound").replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 120);
}

function zonedParts(value, timeZone = REPORT_TIME_ZONE) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  if (!lookup.year || !lookup.month || !lookup.day || !lookup.hour) return null;
  return {
    date: `${lookup.year}-${lookup.month}-${lookup.day}`,
    hour: Number(lookup.hour)
  };
}

function productAgentName(agentId) {
  if (agentId === "chief_of_staff") return "幕僚长";
  return getMarketplaceAgent(agentId)?.name || agentId;
}

function accountIdFor(task = {}) {
  const context = task.executionContext && typeof task.executionContext === "object" ? task.executionContext : {};
  const snapshot = task.resultSnapshot && typeof task.resultSnapshot === "object" ? task.resultSnapshot : {};
  return asText(snapshot.accountId || task.accountId || context.accountId || context.accountKey || context.secId || context.uid, "unbound");
}

function accountNameFor(task = {}) {
  const context = task.executionContext && typeof task.executionContext === "object" ? task.executionContext : {};
  const snapshot = task.resultSnapshot && typeof task.resultSnapshot === "object" ? task.resultSnapshot : {};
  return asText(snapshot.accountName || context.accountName || context.accountLabel || task.accountName, "未命名抖音账号");
}

function eventPayload(event = {}) {
  return event.payload && typeof event.payload === "object" && !Array.isArray(event.payload) ? event.payload : {};
}

function eventDate(event, timeZone) {
  return zonedParts(event?.occurredAt, timeZone)?.date || null;
}

function eventCount(event = {}) {
  const payload = eventPayload(event);
  const value = payload.count ?? payload.leadCount ?? payload.candidateCount ?? payload.total ?? payload.data?.count;
  const count = Number(value);
  return Number.isFinite(count) && count >= 0 ? count : null;
}

function eventNarrative(event = {}) {
  const payload = eventPayload(event);
  const supplied = asText(payload.text || payload.summary || payload.message);
  if (supplied) return supplied.replace(/[。！？.!?]+$/u, "");
  const label = EVENT_LABELS[event.type] || "已更新任务进展";
  const count = eventCount(event);
  if (count == null) return label;
  if (event.type === "lead.candidate") return `${label} ${count} 位`;
  if (event.type === "lead.source.synced") return count > 0 ? `${label}，本轮覆盖 ${count} 项` : `${label}，本轮未新增结果`;
  return `${label} ${count} 项`;
}

function reportMetrics(events = []) {
  const metrics = { sources: 0, candidates: 0, qualified: 0, outreachAccepted: 0, outreachSent: 0, replies: 0, failed: 0 };
  for (const event of events) {
    const count = eventCount(event) ?? 1;
    if (event.type === "lead.source.synced") metrics.sources += Math.max(0, count);
    if (event.type === "lead.candidate") metrics.candidates += Math.max(0, count);
    if (event.type === "lead.qualified") metrics.qualified += Math.max(0, count);
    if (event.type === "outreach.accepted") metrics.outreachAccepted += Math.max(0, count);
    if (event.type === "outreach.sent" || event.type === "reply.sent") metrics.outreachSent += Math.max(0, count);
    if (event.type === "lead.replied") metrics.replies += Math.max(0, count);
    if (event.type === "outreach.failed") metrics.failed += Math.max(0, count);
  }
  return metrics;
}

function isRealWorkEvent(event = {}) {
  return REAL_WORK_EVENT_TYPES.has(event.type);
}

function participatingAgentIds(task, events) {
  const assigned = Array.isArray(task.assignment?.assignments) ? task.assignment.assignments : [];
  const assignedIds = new Set(assigned.map((item) => asText(item?.agentId)).filter(Boolean));
  const eventIds = new Set(events.map((event) => asText(event.agentId)).filter((agentId) => agentId && agentId !== "chief_of_staff"));
  const candidates = eventIds.size ? eventIds : assignedIds;
  return [...candidates].filter((agentId) => assignedIds.size === 0 || assignedIds.has(agentId));
}

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function taskExecutionConfig(task = {}) {
  const configuration = record(task.configuration);
  const executionContext = record(task.executionContext);
  if (isObjectRecord(configuration.executionConfig)) return configuration.executionConfig;
  if (isObjectRecord(executionContext.config)) return executionContext.config;
  return {};
}

function isContinuousTask(task = {}) {
  const config = taskExecutionConfig(task);
  return config.longRunning === true
    || config.continuous === true
    || task.longRunning === true
    || record(task.executionContext).longRunning === true;
}

function isFinderListenerTask(task = {}) {
  if (asText(task.agentId) !== FINDER_AGENT_ID) return false;
  const config = taskExecutionConfig(task);
  const sourceKind = asText(record(config.sourceScope).kind).toLowerCase();
  return config.discoveryOnly === true
    || (isContinuousTask(task) && FINDER_LISTENER_SOURCE_KINDS.has(sourceKind));
}

function isObjectRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isReportableParticipant(task, agentId) {
  if (!isContinuousTask(task)) return false;
  if (CONTINUOUS_DAILY_REPORT_AGENT_IDS.has(agentId)) return true;
  return agentId === FINDER_AGENT_ID && isFinderListenerTask(task);
}

function isDailyReportScope(scope = {}) {
  if (scope?.continuous !== true) return false;
  const participantIds = Array.isArray(scope.participantIds) ? scope.participantIds : [];
  if (scope?.combined) {
    return scope.agentId === "chief_of_staff"
      && participantIds.length >= 2;
  }
  if (scope?.agentId === "chief_of_staff") {
    return participantIds.length >= 1;
  }
  return participantIds.length === 1 && participantIds[0] === asText(scope?.agentId);
}

function reportScope(task, events) {
  const agentId = asText(task.agentId);
  if (isReportableParticipant(task, agentId)) {
    return { agentId, combined: false, continuous: true, participantIds: [agentId] };
  }
  if (PRODUCT_AGENT_IDS.has(agentId)) return null;
  if (agentId !== "chief_of_staff" || !isContinuousTask(task)) return null;
  const participants = participatingAgentIds(task, events)
    .filter((participantId) => CONTINUOUS_DAILY_REPORT_AGENT_IDS.has(participantId) || participantId === FINDER_AGENT_ID);
  if (!participants.length) return null;
  return { agentId, combined: participants.length >= 2, continuous: true, participantIds: participants };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function reportDateLabel(reportDate) {
  const match = String(reportDate || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[1]} 年 ${Number(match[2])} 月 ${Number(match[3])} 日` : String(reportDate || "");
}

const REPORT_PROFILES = Object.freeze({
  "mkt-find-people": Object.freeze({
    label: "找客专员日报",
    accent: "#2f80ed",
    evidenceTitle: "来源证据",
    nextTitle: "明天我会继续",
    plan: "明天我会继续扫描直播间、评论区和账号公开线索；符合条件的人会补入候选名单。"
  }),
  "mkt-dm-inbox": Object.freeze({
    label: "私信客服日报",
    accent: "#f07a25",
    evidenceTitle: "对话记录",
    nextTitle: "明天我会继续",
    plan: "明天我会继续承接新消息，遇到需要人工判断的内容会单独向你说明。"
  }),
  "mkt-gold-customer-service": Object.freeze({
    label: "金牌客服日报",
    accent: "#2e9e8f",
    evidenceTitle: "对话记录",
    nextTitle: "明天我会继续",
    plan: "明天我会继续承接新私信，先回应客户当前问题，再按用户设定目标推进；命中人工边界的会话会单独说明。"
  }),
  "mkt-comment-acquisition": Object.freeze({
    label: "获客专家日报",
    accent: "#2f80ed",
    evidenceTitle: "已确认的工作记录",
    nextTitle: "明天我会继续",
    plan: "明天我会继续沿着找人、判断和触达链路推进，把新结果沉淀到同一份成果里。"
  }),
  chief_of_staff: Object.freeze({
    label: "协同工作日报",
    accent: "#52667d",
    evidenceTitle: "协同工作记录",
    nextTitle: "明天我会继续",
    plan: "明天我会继续协调已参与的 Agent，把需要推进的事项安排到对应环节。"
  })
});

function profileFor(scope) {
  return REPORT_PROFILES[scope.agentId] || REPORT_PROFILES.chief_of_staff;
}

function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function stateStatus(taskState) {
  if (taskState === "RUNNING") return "任务仍在执行";
  if (taskState === "PAUSED") return "任务已暂停";
  if (["FAILED", "BLOCKED", "CANCELLED"].includes(taskState)) return "任务未继续执行";
  return "本轮任务已收口";
}

function requiredUserAction(events = []) {
  for (const event of events) {
    const payload = eventPayload(event);
    if (payload.requiresUserAction === true || payload.requiresApproval === true || payload.needsUserDecision === true) {
      return {
        title: "需要你确认",
        text: asText(payload.userAction || payload.action || payload.text, "这项工作需要你确认后才能继续。")
      };
    }
  }
  return {
    title: "今天无需你处理",
    text: "我会按当前规则继续推进；有需要你介入的事项时，会单独在对话里说明。"
  };
}

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asItems(value) {
  return Array.isArray(value) ? value : [];
}

function firstText(...values) {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const text = value.trim();
    if (text) return text;
  }
  return "";
}

function sourceTypeLabel(type) {
  const normalized = asText(type).toLowerCase();
  if (["live", "live_chat", "live_room", "livestream", "live_stream"].includes(normalized)) return "直播间";
  if (["comment", "comments", "comment_area"].includes(normalized)) return "评论区";
  if (["interaction", "notification", "engagement"].includes(normalized)) return "互动";
  if (["direct_message", "dm", "private_message", "message"].includes(normalized)) return "私信";
  if (["profile", "account", "user_profile"].includes(normalized)) return "账号";
  if (["video", "work", "aweme"].includes(normalized)) return "作品";
  return "已记录来源";
}

function intentLabel(tier, score) {
  const normalized = asText(tier).toLowerCase();
  if (normalized === "high") return "高意向";
  if (normalized === "medium") return "中意向";
  if (normalized === "low") return "低意向";
  const numeric = Number(score);
  if (Number.isFinite(numeric) && numeric >= 45) return "高意向";
  if (Number.isFinite(numeric) && numeric >= 18) return "中意向";
  return "待判断";
}

function sourceSummary(source = {}) {
  const record = asRecord(source);
  const title = firstText(record.videoTitle, record.roomTitle, record.title, record.name, record.videoId);
  const label = sourceTypeLabel(record.type);
  return title ? `${label} · ${title}` : label;
}

function normalizeDailyLead(value = {}) {
  const lead = asRecord(value);
  const source = asRecord(lead.source);
  const evidence = asItems(lead.evidence).map(asRecord);
  const leadId = firstText(lead.leadId, lead.externalUserId, lead.secUid, lead.uniqueId, lead.id, lead.uid);
  const name = firstText(lead.nickname, lead.displayName, lead.account, lead.userName, lead.name, asRecord(lead.user).nickname, asRecord(lead.user).name);
  const quote = firstText(
    lead.text,
    lead.comment,
    lead.content,
    evidence[0]?.quote,
    evidence[0]?.text,
    evidence[0]?.content,
    source.quote,
    source.content
  );
  const reason = firstText(lead.intentReason, lead.analysisReason, lead.reason, asRecord(lead.analysis).reason, asRecord(lead.analysis).summary);
  const recommendation = firstText(lead.recommendation, lead.nextAction, lead.nextStep, lead.suggestedAction, asRecord(lead.analysis).recommendation);
  const score = Number(lead.score);
  const normalizedScore = Number.isFinite(score) ? Math.round(score) : null;
  const id = leadId || `${name}:${quote}`;
  if (!name && !quote && !leadId) return null;
  return {
    id,
    name: name || "未命名用户",
    quote,
    source: sourceSummary(source),
    intent: intentLabel(lead.tier, normalizedScore),
    score: normalizedScore,
    reason,
    recommendation
  };
}

function leadFromPayload(payload = {}) {
  const record = asRecord(payload);
  return record.lead || record.candidate || record.prospect || record.user || asRecord(record.data).lead || null;
}

function detailedLeads(task, events = []) {
  const fromEvents = events
    .filter((event) => ["lead.candidate", "lead.qualified", "lead.replied"].includes(event.type))
    .map((event) => normalizeDailyLead(leadFromPayload(eventPayload(event))))
    .filter(Boolean);
  const snapshot = asRecord(task.resultSnapshot);
  const fromSnapshot = asItems(snapshot.leads).map(normalizeDailyLead).filter(Boolean);
  const unique = new Map();
  for (const lead of [...fromEvents, ...fromSnapshot]) {
    const key = lead.id || `${lead.name}:${lead.quote}`;
    const existing = unique.get(key);
    if (!existing) {
      unique.set(key, lead);
      continue;
    }
    unique.set(key, {
      ...existing,
      quote: existing.quote || lead.quote,
      reason: existing.reason || lead.reason,
      recommendation: existing.recommendation || lead.recommendation,
      score: existing.score ?? lead.score,
      intent: existing.intent === "待判断" ? lead.intent : existing.intent,
      source: existing.source === "已记录来源" ? lead.source : existing.source
    });
  }
  return [...unique.values()].slice(0, 3);
}

function eventMessageContent(payload = {}) {
  const record = asRecord(payload);
  return firstText(record.content, record.messageContent, record.replyContent, record.draftContent, asRecord(record.message).content, asRecord(record.result).content);
}

function outreachDetails(events = []) {
  const statusLabel = {
    "outreach.ready": "内容已准备",
    "outreach.accepted": "已进入平台队列",
    "outreach.scheduled": "已安排发送",
    "outreach.sending": "正在发送",
    "outreach.sent": "已确认发出",
    "outreach.failed": "发送未成功"
  };
  const statusRank = {
    "outreach.ready": 1,
    "outreach.accepted": 2,
    "outreach.scheduled": 3,
    "outreach.sending": 4,
    "outreach.sent": 5,
    "outreach.failed": 6
  };
  const unique = new Map();
  for (const event of events) {
    if (!statusLabel[event.type]) continue;
    const lead = normalizeDailyLead(leadFromPayload(eventPayload(event)));
    const content = eventMessageContent(eventPayload(event));
    if (!lead && !content) continue;
    const key = lead?.id || `${content}:${event.type}`;
    const item = {
      id: key,
      name: lead?.name || "已确认用户",
      source: lead?.source || "已授权抖音账号",
      content,
      contentLabel: event.type === "outreach.sent"
        ? "已发送内容"
        : event.type === "outreach.failed"
          ? "未发送内容"
          : "待发送内容",
      status: statusLabel[event.type],
      rank: statusRank[event.type]
    };
    const previous = unique.get(key);
    if (!previous || item.rank >= previous.rank) unique.set(key, item);
  }
  return [...unique.values()].slice(0, 3);
}

function conversationDetails(events = []) {
  const unique = new Map();
  for (const event of events) {
    if (!new Set(["lead.replied", "reply.sent"]).has(event.type)) continue;
    const payload = eventPayload(event);
    const lead = normalizeDailyLead(leadFromPayload(payload));
    const content = eventMessageContent(payload);
    if (!lead && !content) continue;
    const key = lead?.id || asText(payload.conversationId || payload.messageId, `${event.type}:${content}`);
    const item = unique.get(key) || {
      id: key,
      name: lead?.name || "用户",
      source: lead?.source || "私信",
      incoming: "",
      reply: ""
    };
    if (event.type === "lead.replied") item.incoming = content || lead?.quote || item.incoming;
    if (event.type === "reply.sent") item.reply = content || item.reply;
    unique.set(key, item);
  }
  return [...unique.values()].slice(0, 3);
}

function reportDetails({ task, events, scope }) {
  const leads = detailedLeads(task, events);
  if (scope.combined) return [{ title: "今日关键成果", type: "lead", items: leads }];
  if (scope.agentId === "mkt-comment-acquisition") {
    return [
      { title: "今日重点候选", type: "lead", items: leads },
      { title: "今日触达回执", type: "outreach", items: outreachDetails(events) },
      { title: "关键对话", type: "conversation", items: conversationDetails(events) }
    ];
  }
  if (scope.agentId === "mkt-find-people") return [{ title: "今日重点候选", type: "lead", items: leads }];
  if (["mkt-dm-inbox", "mkt-gold-customer-service"].includes(scope.agentId)) return [{ title: "关键对话", type: "conversation", items: conversationDetails(events) }];
  return [];
}

function progressRecords(events = [], details = []) {
  const hidesDetailedLeadEvents = asItems(details).some((section) => section.type === "lead" && section.items.length > 0);
  const records = [];
  const seen = new Set();
  for (const event of events) {
    if (hidesDetailedLeadEvents && ["lead.candidate", "lead.qualified"].includes(event.type) && normalizeDailyLead(leadFromPayload(eventPayload(event)))) continue;
    const narrative = eventNarrative(event);
    if (!narrative || seen.has(narrative)) continue;
    seen.add(narrative);
    records.push(narrative);
    if (records.length >= 4) break;
  }
  return records.length ? records : ["本日重点结果已列在上方，后续会沿当前任务继续推进。"];
}

function renderDetailSection(details) {
  if (!details?.items?.length) return "";
  const content = details.items.map((item) => {
    if (details.type === "outreach") {
      return `<article class="deliverable"><div class="deliverable-head"><strong>${escapeHtml(item.name)}</strong><span class="status">${escapeHtml(item.status)}</span></div><p class="deliverable-meta">${escapeHtml(item.source)}</p>${item.content ? `<p class="message">${escapeHtml(item.contentLabel)}：${escapeHtml(item.content)}</p>` : ""}</article>`;
    }
    if (details.type === "conversation") {
      return `<article class="deliverable"><div class="deliverable-head"><strong>${escapeHtml(item.name)}</strong><span class="deliverable-meta">${escapeHtml(item.source)}</span></div>${item.incoming ? `<p class="message"><span>用户说：</span>${escapeHtml(item.incoming)}</p>` : ""}${item.reply ? `<p class="message"><span>我已回复：</span>${escapeHtml(item.reply)}</p>` : ""}</article>`;
    }
    const explanation = item.reason || "";
    const recommendation = item.recommendation || "";
    const score = item.score == null ? "" : ` · ${item.score} 分`;
    return `<article class="deliverable"><div class="deliverable-head"><strong>${escapeHtml(item.name)}</strong><span class="status">${escapeHtml(item.intent)}${escapeHtml(score)}</span></div><p class="deliverable-meta">${escapeHtml(item.source)}</p>${item.quote ? `<blockquote>“${escapeHtml(item.quote)}”</blockquote>` : ""}${explanation ? `<p class="annotation"><span>判断依据：</span>${escapeHtml(explanation)}</p>` : ""}${recommendation ? `<p class="annotation"><span>建议动作：</span>${escapeHtml(recommendation)}</p>` : ""}</article>`;
  }).join("");
  return `<section class="section deliverables"><h2>${escapeHtml(details.title)}</h2><div class="deliverable-list">${content}</div></section>`;
}

function renderDetails(details = []) {
  return asItems(details).map(renderDetailSection).join("");
}

function factItems(agentId, metrics) {
  const source = positive(metrics.sources);
  const candidates = positive(metrics.candidates);
  const qualified = positive(metrics.qualified);
  const sent = positive(metrics.outreachSent);
  const replies = positive(metrics.replies);
  const failed = positive(metrics.failed);
  const item = (value, label) => value ? { value, label } : null;

  if (agentId === "mkt-find-people") return [
    item(candidates, "位候选用户"),
    item(qualified, "位可优先跟进"),
    item(source, "个来源已核验")
  ].filter(Boolean);
  if (["mkt-dm-inbox", "mkt-gold-customer-service"].includes(agentId)) return [
    item(replies, "位用户发来回复"),
    item(sent, "次对话已回复"),
    item(failed, "条对话待复核")
  ].filter(Boolean);
  return [
    item(candidates, "位候选用户"),
    item(qualified, "位优先处理"),
    item(sent, "次消息已发出"),
    item(replies, "位用户已回复")
  ].filter(Boolean).slice(0, 3);
}

function presentationFor({ task, events, scope, metrics, taskState }) {
  const profile = profileFor(scope);
  const candidates = positive(metrics.candidates);
  const qualified = positive(metrics.qualified);
  const sent = positive(metrics.outreachSent);
  const replies = positive(metrics.replies);
  const agentId = scope.agentId;
  const records = events.filter(isRealWorkEvent).slice(0, 4).map(eventNarrative);
  let headline = "今天已完成一轮托管工作";
  let lead = "已确认的工作结果和证据都整理在这份文件里。";

  if (scope.combined) {
    headline = `今天已汇总 ${scope.participantIds.length} 个 Agent 的协同进展`;
    lead = `候选、判断和触达等已确认结果已集中整理，方便你快速查看今天真正推进的部分。`;
  } else if (agentId === "mkt-find-people") {
    headline = candidates ? `今天找到 ${candidates} 位可继续跟进的人` : "今天完成了一轮找人筛选";
    lead = qualified
      ? `其中 ${qualified} 位表现出更明确的需求信号，来源和原话已经保留。`
      : "候选名单和每个人出现的位置已经整理，后续可继续补齐判断。";
  } else if (["mkt-dm-inbox", "mkt-gold-customer-service"].includes(agentId)) {
    headline = replies ? `今天收到了 ${replies} 位用户的回复` : sent ? `今天已完成 ${sent} 次私信回复` : "今天已承接一轮私信对话";
    lead = agentId === "mkt-gold-customer-service"
      ? "已处理的对话、下一步和人工接管边界都保留在对应用户记录中，不会重复打扰。"
      : "已经处理的对话和下一步会留在对应用户记录中，不会重复打扰。";
  } else if (agentId === "mkt-comment-acquisition") {
    const advanced = candidates || qualified;
    headline = advanced || sent ? `今天已推进 ${advanced || 0} 位线索与 ${sent || 0} 次触达` : "今天已推进一轮完整获客工作";
    lead = "找人、判断和触达的结果会放在同一份成果中，后续可以继续追踪。";
  }

  const evidence = records.length
    ? records
    : ["今天没有新增可确认的业务结果，因此没有生成额外结论。"];
  const evidenceDescription = agentId === "mkt-find-people"
    ? "候选用户、出现位置和原始内容已保留，可在成果中心继续核验。"
    : ["mkt-dm-inbox", "mkt-gold-customer-service"].includes(agentId)
      ? "对话进展只记录已确认的消息状态，不把等待中的内容当作结果。"
      : "记录只包含已确认的工作事件，不把轮询和等待当作完成。";

  return {
    profile,
    headline,
    lead,
    records: evidence,
    facts: factItems(agentId, metrics),
    evidenceDescription,
    nextPlan: taskState === "RUNNING" ? profile.plan : "本轮任务当前没有继续执行，已确认的成果和原因会保留在这份记录中。",
    userAction: requiredUserAction(events),
    status: stateStatus(taskState)
  };
}

function buildManagedDailyReportHtml({ agentName, accountName, accountId, task, reportDate, metrics, taskState, scope, events }) {
  const reportTitle = `${agentName}${scope.combined ? "综合" : ""}日报`;
  const presentation = presentationFor({ task, events, scope, metrics, taskState });
  const details = reportDetails({ task, events, scope });
  const factMarkup = presentation.facts.length
    ? presentation.facts.map((fact) => `<li><strong>${escapeHtml(fact.value)}</strong><span>${escapeHtml(fact.label)}</span></li>`).join("")
    : "<li><strong>—</strong><span>今日没有新增可确认结果</span></li>";
  const recordMarkup = progressRecords(events, details).map((record) => `<li>${escapeHtml(record)}</li>`).join("");
  const detailMarkup = renderDetails(details);
  const participants = scope.combined ? `<section class="section participants"><h2>参与 Agent</h2><div>${scope.participantIds.map((agentId) => `<span>${escapeHtml(productAgentName(agentId))}</span>`).join("")}</div></section>` : "";
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(reportTitle)}</title>
  <style>
    :root{color-scheme:light;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;color:#202735;background:#f4f6f8}*{box-sizing:border-box}body{margin:0;padding:32px;background:#f4f6f8;line-height:1.6}.report{max-width:940px;margin:0 auto;border:1px solid #e2e7eb;background:#fff;box-shadow:0 18px 42px rgba(28,42,61,.07)}.filebar{display:flex;justify-content:space-between;gap:16px;padding:14px 32px;border-bottom:1px solid #e8edf1;background:#fbfcfd;color:#788595;font-size:13px}.filebar strong{color:#394555}.document{padding:48px 58px 54px}.meta{display:flex;justify-content:space-between;gap:24px;align-items:flex-start}.eyebrow{margin:0;color:var(--accent);font-size:14px;font-weight:700}.meta h1{margin:8px 0 0;color:#202735;font-size:30px;line-height:1.3;letter-spacing:0}.date{margin:8px 0 0;color:#7c8794;font-size:14px}.account{min-width:246px;padding:13px 16px;border-left:3px solid var(--accent);background:#f7f9fb}.account strong,.account span{display:block}.account strong{color:#303b49;font-size:14px}.account span{margin-top:4px;color:#84909e;font-size:12px}.hero{margin-top:34px;padding:31px 34px;border-top:1px solid var(--accent);background:#f8fafc}.hero h2{max-width:680px;margin:0;color:#25303e;font-size:27px;line-height:1.35;letter-spacing:0}.hero p{max-width:690px;margin:13px 0 0;color:#5d6978;font-size:16px}.facts{display:flex;gap:0;margin:0;padding:0;list-style:none;border-top:1px solid #e8edf1;border-bottom:1px solid #e8edf1}.facts li{flex:1;min-width:0;padding:22px 20px;border-right:1px solid #e8edf1}.facts li:last-child{border-right:0}.facts strong,.facts span{display:block}.facts strong{color:var(--accent);font-size:28px;line-height:1.1}.facts span{margin-top:7px;color:#687585;font-size:13px}.section{margin-top:34px;padding-top:28px;border-top:1px solid #e8edf1}.section h2{margin:0 0 15px;color:#2b3543;font-size:18px;letter-spacing:0}.deliverable-list{border-top:1px solid #e7ecf0}.deliverable{padding:17px 0;border-bottom:1px solid #e7ecf0}.deliverable:last-child{border-bottom:0}.deliverable-head{display:flex;justify-content:space-between;gap:16px;align-items:baseline}.deliverable-head strong{color:#273241;font-size:16px}.deliverable-meta{margin:4px 0 0;color:#7a8795;font-size:13px}.status{flex:0 0 auto;color:var(--accent);font-size:13px;font-weight:700}.deliverable blockquote{margin:10px 0 0;padding:9px 13px;border-left:2px solid #d8e1ea;background:#fafbfd;color:#3d4a59;font-size:15px}.message{margin:10px 0 0;color:#425062;font-size:15px}.message span,.annotation span{color:#788595;font-size:13px;font-weight:700}.annotation{margin:8px 0 0;color:#536071;font-size:14px}.records{display:grid;gap:10px;margin:0;padding:0;list-style:none}.records li{position:relative;padding:12px 0 12px 23px;border-bottom:1px solid #eef1f4;color:#455160;font-size:15px}.records li::before{content:"";position:absolute;top:21px;left:0;width:8px;height:8px;border-radius:50%;background:var(--accent)}.records li:last-child{border-bottom:0}.details{display:grid;grid-template-columns:minmax(0,1fr) minmax(250px,.8fr);gap:42px}.details p{margin:0;color:#536071;font-size:15px}.next{padding-left:22px;border-left:3px solid #dae1e8}.next h2{margin-bottom:10px}.attention{padding:19px 22px;border-left:3px solid #53a678;background:#f3faf6}.attention.is-required{border-left-color:#d98b32;background:#fff8ef}.attention h2{margin:0;color:#2f3b49;font-size:17px}.attention p{margin:6px 0 0;color:#536071;font-size:15px}.participants div{display:flex;flex-wrap:wrap;gap:8px}.participants span{padding:5px 10px;border:1px solid #dbe4ee;border-radius:999px;color:#52667d;font-size:13px}.foot{margin-top:34px;padding-top:21px;border-top:1px solid #e8edf1;color:#788595;font-size:13px}.foot strong{color:#4d5b6b}@media (max-width:720px){body{padding:0}.document{padding:30px 22px}.meta,.details{display:block}.account{margin-top:22px}.facts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}.facts li{border-bottom:1px solid #e8edf1}.facts li:nth-child(2n){border-right:0}.facts li:last-child{border-bottom:0}.hero{padding:25px 22px}.hero h2{font-size:23px}.deliverable-head{align-items:flex-start}.status{max-width:46%;text-align:right}.details .next{margin-top:28px}.filebar{padding:13px 20px}.filebar span:last-child{display:none}}
  </style>
</head>
<body style="--accent:${escapeHtml(presentation.profile.accent)}">
  <main class="report">
    <header class="filebar"><strong>日报文件</strong><span>由 ${escapeHtml(agentName)} 生成 · ${escapeHtml(presentation.status)}</span></header>
    <article class="document">
      <header class="meta"><div><p class="eyebrow">${escapeHtml(presentation.profile.label)}</p><h1>${escapeHtml(reportTitle)}</h1><p class="date">${escapeHtml(reportDateLabel(reportDate))} · ${escapeHtml(asText(task.goal, "未命名任务"))}</p></div><aside class="account"><strong>${escapeHtml(accountName)}</strong><span>已授权抖音账号 · ${escapeHtml(accountId)}</span></aside></header>
      <section class="hero"><h2>${escapeHtml(presentation.headline)}</h2><p>${escapeHtml(presentation.lead)}</p></section>
      <ul class="facts">${factMarkup}</ul>
      ${detailMarkup}
      <section class="section"><h2>今天已经做完的事</h2><ul class="records">${recordMarkup}</ul></section>
      <section class="section details"><div><h2>${escapeHtml(presentation.profile.evidenceTitle)}</h2><p>${escapeHtml(presentation.evidenceDescription)}</p></div><aside class="next"><h2>${escapeHtml(presentation.profile.nextTitle)}</h2><p>${escapeHtml(presentation.nextPlan)}</p></aside></section>
      <section class="section attention${presentation.userAction.title === "需要你确认" ? " is-required" : ""}"><h2>${escapeHtml(presentation.userAction.title)}</h2><p>${escapeHtml(presentation.userAction.text)}</p></section>
      ${participants}
      <footer class="foot"><strong>成果已同步。</strong> 这份附件、任务成果和成果中心打开的是同一份工作记录。</footer>
    </article>
  </main>
</body>
</html>`;
}

export function managedDailyReportArtifactId({ taskId, accountId, agentId, reportDate }) {
  return `managed-daily-report:${safeId(taskId)}:${safeId(accountId)}:${safeId(agentId)}:${safeId(reportDate)}`;
}

export function buildManagedDailyReportArtifact({ task, events, reportDate, generatedAt, scope }) {
  if (!isDailyReportScope(scope)) {
    throw new RangeError("Daily reports are only available for continuous managed work.");
  }
  const agentName = productAgentName(scope.agentId);
  const accountName = accountNameFor(task);
  const accountId = accountIdFor(task);
  const metrics = reportMetrics(events);
  const meaningful = events.filter(isRealWorkEvent);
  const taskState = asText(task.state, "UNKNOWN");
  const presentation = presentationFor({ task, events: meaningful, scope, metrics, taskState });
  return {
    id: managedDailyReportArtifactId({ taskId: task.taskId, accountId, agentId: scope.agentId, reportDate }),
    kind: "managed_daily_report",
    type: "html",
    mimeType: "text/html; charset=utf-8",
    name: `${agentName}${scope.combined ? "综合" : ""}日报-${reportDate}.html`,
    summary: presentation.headline,
    content: buildManagedDailyReportHtml({ agentName, accountName, accountId, task, reportDate, metrics, taskState, scope, events: meaningful }),
    projectId: `managed-task:${task.taskId}`,
    projectName: "托管任务日报",
    taskId: task.taskId,
    taskRunId: task.taskRunId || null,
    agentId: scope.agentId,
    accountId,
    reportDate,
    createdBy: agentName,
    createdAt: generatedAt,
    metadata: {
      scope: scope.combined ? "chief_combined" : "agent_task",
      participantAgentIds: scope.participantIds,
      metrics
    }
  };
}

function directMessageStoreId(tenantId, agentId) {
  return tenantId ? `${tenantId}::${agentId}` : agentId;
}

function reportMessage(artifact, scope) {
  const prefix = scope.combined ? "今天的协同托管工作我已经汇总好了。" : "今天的托管工作我已经整理好了。";
  return `${prefix}日报在附件里，里面写了已经确认的结果和明天会继续处理的内容。`;
}

function listAllTaskEvents(controlPlane, taskId, { pageSize = 1000 } = {}) {
  const events = [];
  let afterSeq = 0;
  while (true) {
    const page = controlPlane.listTaskEvents(taskId, { afterSeq, limit: pageSize });
    if (!page.length) break;
    events.push(...page);
    const nextSeq = Math.max(...page.map((event) => Number(event?.seq) || 0));
    if (nextSeq <= afterSeq || page.length < pageSize) break;
    afterSeq = nextSeq;
  }
  return events;
}

function dateRange(startDate, endDate) {
  if (!startDate || !endDate || startDate > endDate) return [];
  const dates = [];
  const current = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

function taskStartedDate(task, timeZone) {
  const assignment = task.assignment?.execution && typeof task.assignment.execution === "object"
    ? task.assignment.execution
    : {};
  const candidates = [
    task.startedAt,
    assignment.startedAt,
    task.createdAt
  ];
  for (const candidate of candidates) {
    const date = zonedParts(candidate, timeZone)?.date;
    if (date) return date;
  }
  return null;
}

function continuousTaskIsRunning(task) {
  return ["RUNNING", "DEGRADED"].includes(asText(task.state).toUpperCase());
}

function shiftDate(date, days) {
  const current = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(current.getTime())) return null;
  current.setUTCDate(current.getUTCDate() + days);
  return current.toISOString().slice(0, 10);
}

function dueReportDates(task, events, local, reportHour, timeZone) {
  const todayIsDue = local.hour >= Number(reportHour);
  const lastDueDate = todayIsDue
    ? local.date
    : new Date(new Date(`${local.date}T00:00:00.000Z`).getTime() - 86_400_000).toISOString().slice(0, 10);
  const eventDates = events.map((event) => eventDate(event, timeZone)).filter(Boolean);
  const continuousDates = continuousTaskIsRunning(task)
    ? dateRange(taskStartedDate(task, timeZone), lastDueDate)
    : [];
  const earliestReportDate = shiftDate(lastDueDate, -(MAX_BACKFILL_REPORT_DAYS - 1));
  return [...new Set([...eventDates, ...continuousDates])]
    .filter((date) => date <= lastDueDate && (!earliestReportDate || date >= earliestReportDate))
    .sort();
}

export function createManagedDailyReportService({
  controlPlane,
  agentStore,
  now = () => new Date().toISOString(),
  timeZone = REPORT_TIME_ZONE,
  reportHour = DEFAULT_REPORT_HOUR
} = {}) {
  if (!controlPlane || typeof controlPlane.listTaskSnapshots !== "function" || typeof controlPlane.listTaskEvents !== "function" || typeof controlPlane.recordArtifact !== "function") {
    throw new TypeError("A control plane with task artifact support is required");
  }
  if (!agentStore || typeof agentStore.listDm !== "function" || typeof agentStore.appendDm !== "function") {
    throw new TypeError("An Agent direct-message store is required");
  }

  const findArtifactRecord = ({ artifactId, tenantId = null } = {}) => {
    if (!artifactId) return null;
    const tasks = controlPlane.listTaskSnapshots({ tenantId, includeTerminal: true, resultsOnly: false, limit: Infinity });
    for (const task of tasks) {
      const artifacts = Array.isArray(task.resultSnapshot?.artifacts) ? task.resultSnapshot.artifacts : [];
      const artifact = artifacts.find((item) => item?.id === artifactId);
      if (artifact) return { task, artifact: clone(artifact) };
    }
    return null;
  };

  const findArtifact = ({ artifactId, tenantId = null } = {}) => findArtifactRecord({ artifactId, tenantId })?.artifact || null;

  const removeArtifact = ({ artifactId, tenantId = null } = {}) => {
    const record = findArtifactRecord({ artifactId, tenantId });
    if (!record) {
      const error = new Error("找不到任务产出文件");
      error.code = "TASK_ARTIFACT_NOT_FOUND";
      error.statusCode = 404;
      throw error;
    }
    if (typeof controlPlane.removeArtifact !== "function") {
      const error = new Error("控制面暂不支持删除任务产出文件");
      error.code = "TASK_ARTIFACT_DELETE_UNAVAILABLE";
      error.statusCode = 503;
      throw error;
    }
    const removed = controlPlane.removeArtifact({
      taskId: record.task.taskId,
      tenantId: tenantId || null,
      artifactId
    });
    const storeId = directMessageStoreId(
      record.task.tenantId || record.task.executionContext?.tenantId || null,
      record.artifact.agentId || record.task.agentId
    );
    const message = typeof agentStore.removeDm === "function"
      ? agentStore.removeDm(storeId, (item) => item?.metadata?.dailyReportArtifactId === artifactId || item?.artifact?.id === artifactId)
      : { deleted: 0, remaining: agentStore.listDm(storeId).length };
    return { ...removed, message };
  };

  const deliverDueReports = async ({ at = now(), tenantId = null } = {}) => {
    const local = zonedParts(at, timeZone);
    if (!local) return { delivered: [], skipped: "invalid_reporting_time" };
    const delivered = [];
    const tasks = controlPlane.listTaskSnapshots({ tenantId, includeTerminal: true, resultsOnly: false, limit: Infinity });
    for (const task of tasks) {
      const allEvents = listAllTaskEvents(controlPlane, task.taskId);
      for (const reportDate of dueReportDates(task, allEvents, local, reportHour, timeZone)) {
        const events = allEvents.filter((event) => eventDate(event, timeZone) === reportDate);
        const scope = reportScope(task, events);
        if (!scope) continue;
        const artifact = buildManagedDailyReportArtifact({
          task,
          events,
          reportDate,
          generatedAt: new Date(at).toISOString(),
          scope
        });
        const recorded = controlPlane.recordArtifact({
          taskId: task.taskId,
          tenantId: task.tenantId || task.executionContext?.tenantId || null,
          agentId: scope.agentId,
          artifact,
          source: "managed_daily_report"
        });
        if (recorded.suppressed) continue;
        const canonicalArtifact = recorded.artifact;
        const storeId = directMessageStoreId(task.tenantId || task.executionContext?.tenantId || null, scope.agentId);
        const messages = agentStore.listDm(storeId);
        const existingMessage = messages.find((message) => message?.metadata?.dailyReportArtifactId === canonicalArtifact.id || message?.artifact?.id === canonicalArtifact.id);
        if (!existingMessage) {
          agentStore.appendDm(storeId, {
            from: scope.agentId,
            fromName: productAgentName(scope.agentId),
            text: reportMessage(canonicalArtifact, scope),
            artifact: canonicalArtifact,
            conversationId: task.conversationId || null,
            metadata: {
              source: "managed-daily-report",
              dailyReportArtifactId: canonicalArtifact.id,
              taskId: task.taskId,
              taskRunId: task.taskRunId || null,
              accountId: canonicalArtifact.accountId,
              reportDate
            }
          });
        }
        if (!recorded.duplicate || !existingMessage) delivered.push({ taskId: task.taskId, artifact: canonicalArtifact, scope });
      }
    }
    return { delivered, ...(local.hour < Number(reportHour) ? { skipped: "before_reporting_time" } : {}) };
  };

  return { deliverDueReports, findArtifact, removeArtifact };
}
