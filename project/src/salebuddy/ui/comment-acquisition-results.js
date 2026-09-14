function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(...values) {
  for (const value of values) {
    const normalized = String(value ?? "").trim();
    if (normalized) return normalized;
  }
  return "";
}

function hasValue(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") return Object.keys(value).length > 0;
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function mergeLeadSnapshots(values, keyOf) {
  const byKey = new Map();
  for (const value of values) {
    const key = keyOf(value);
    if (!key) continue;
    const previous = byKey.get(key);
    if (!previous) {
      byKey.set(key, value);
      continue;
    }
    const merged = { ...previous };
    for (const [field, nextValue] of Object.entries(value)) {
      if (!hasValue(nextValue)) continue;
      const previousValue = merged[field];
      if (nextValue && typeof nextValue === "object" && !Array.isArray(nextValue) && previousValue && typeof previousValue === "object" && !Array.isArray(previousValue)) {
        merged[field] = { ...previousValue, ...nextValue };
      } else if (Array.isArray(nextValue) && Array.isArray(previousValue)) {
        merged[field] = [...previousValue, ...nextValue].filter((item, index, items) => items.findIndex((candidate) => JSON.stringify(candidate) === JSON.stringify(item)) === index);
      } else {
        merged[field] = nextValue;
      }
    }
    byKey.set(key, merged);
  }
  return [...byKey.values()];
}

function capturedLeadKey(value) {
  return leadKey(value) || text(value?.candidateKey, value?.conversationId, value?.conversation_id, value?.nickname);
}

function isCaptured(value) {
  const capture = object(value?.leadCapture || value?.lead_capture || value?.capture || value?.contact || value?.contactInfo || value?.contact_info);
  const status = text(value?.leadCaptureStatus, value?.lead_capture_status, capture.status, capture.state).toLowerCase();
  return Object.keys(capture).length > 0 || /captured|saved|completed|已留资|已保存/.test(status);
}

function leadKey(lead) {
  return text(lead?.leadId, lead?.lead_id, lead?.id, lead?.secUid, lead?.sec_uid, lead?.secId, lead?.sec_id, lead?.uid, lead?.user_id);
}

function taskStatus(state) {
  const normalized = text(state).toLowerCase();
  if (normalized === "error") return "failed";
  if (["stopped", "cancelled", "canceled"].includes(normalized)) return "cancelled";
  if (["completed", "succeeded", "success", "done"].includes(normalized)) return "completed";
  if (normalized === "paused" || normalized === "degraded") return "partial";
  return "running";
}

export function commentAcquisitionCapabilityState(snapshot = {}, approvalMode = "auto") {
  const source = object(snapshot);
  const counters = object(source.counters);
  const analysis = object(source.lastAnalysis || source.lastScan?.analysis || source.resultSnapshot?.analysis);
  const queue = array(source.approvalQueue);
  const sent = number(counters.sent) + number(counters.delivered);
  return {
    connected: text(source.cloudState).toLowerCase() === "online" || text(source.health).toUpperCase() === "OK",
    listening: number(counters.scans) > 0 || Boolean(source.lastScan),
    analyzed: text(analysis.source).toLowerCase() === "model" || number(source.lastScan?.counts?.modelReviewed) > 0,
    touchPrepared: number(counters.drafts) > 0 || queue.length > 0,
    touched: sent > 0 || (approvalMode === "auto" && queue.some((touch) => ["sent", "delivered", "succeeded", "completed"].includes(text(touch?.state).toLowerCase())))
  };
}

export function buildCommentAcquisitionResultRecord(flow = {}, snapshot = {}) {
  const source = object(snapshot);
  const agentId = text(flow.agentId, source.context?.agentId, "mkt-comment-acquisition");
  const sourceScope = text(source.config?.sourceScope?.kind, source.configuration?.findingStrategy?.sourceScope?.kind);
  const finderListener = agentId === "mkt-find-people" && source.config?.discoveryOnly === true;
  const liveOnly = !finderListener && sourceScope === "authorized_account_live";
  const comprehensive = !finderListener && (liveOnly || ["authorized_account_all_signals", "authorized_account_interactions"].includes(sourceScope));
  const result = object(source.resultSnapshot || source.snapshot);
  const lastScan = object(source.lastScan || (Object.keys(result).length ? result : null));
  const counters = object(source.counters);
  const queue = array(source.approvalQueue);
  const replies = array(source.replies);
  const events = array(source.events);
  const resultLeads = array(result.leads || result.candidates);
  const queueLeads = queue.map((touch) => touch?.lead).filter(Boolean);
  const leads = mergeLeadSnapshots([...resultLeads, ...Object.values(object(source.candidateProfiles)), ...queueLeads], leadKey);
  const error = source.lastError || source.error || null;
  const comments = number(lastScan.notifications ?? lastScan.counts?.notifications ?? lastScan.counts?.normalized);
  const pendingApproval = queue.filter((touch) => text(touch?.state).toLowerCase() === "pending_approval").length;
  const capturedKeys = new Set([
    ...leads.filter(isCaptured).map(capturedLeadKey),
    ...replies.filter(isCaptured).map(capturedLeadKey)
  ].filter(Boolean));
  const counts = {
    comments,
    ...(comprehensive ? { signals: number(lastScan.counts?.signals) } : {}),
    scanned: number(counters.scans),
    candidates: number(counters.candidates ?? result.counts?.candidates ?? leads.length),
    ...(finderListener ? { pendingAnalysis: number(counters.candidates ?? result.counts?.candidates ?? leads.length) } : {}),
    drafts: finderListener ? 0 : number(counters.drafts ?? result.counts?.drafts),
    pendingApproval: finderListener ? 0 : pendingApproval,
    sent: finderListener ? 0 : number(counters.sent),
    delivered: finderListener ? 0 : number(counters.delivered),
    replies: finderListener ? 0 : number(counters.replies ?? replies.length),
    captured: Math.max(number(counters.captured ?? result.counts?.captured), capturedKeys.size)
  };
  const status = taskStatus(source.taskState || source.state);
  const discoverySource = sourceScope === "authorized_account_live"
    ? "直播间新互动"
    : sourceScope === "authorized_account_all_signals"
      ? "新增评论、直播互动和账号互动通知"
    : sourceScope === "authorized_account_interactions"
      ? "账号互动通知"
      : "作品评论";
  const summary = finderListener
    ? `持续监听${discoverySource}，已归档 ${counts.candidates} 位互动用户和原始证据，等待客户分析员判断。不会创建或发送私信。${error ? text(error.message) : ""}`
    : liveOnly
    ? `已分析 ${counts.candidates} 位观众，整理账号、发言和意向判断。${error ? text(error.message) : ""}`
    : comprehensive
    ? `已识别 ${counts.candidates} 位候选客户，发送 ${counts.sent} 条私信，收到 ${counts.replies} 条回复。${error ? text(error.message) : ""}`
    : error
    ? `评论区获客运行异常：${text(error.message, error.code, "未知异常")}。已扫描 ${counts.scanned} 轮，保留 ${counts.candidates} 位候选用户。`
    : `已读取 ${counts.comments} 条评论，识别 ${counts.candidates} 位候选用户，准备 ${counts.drafts} 条触达内容，已送达 ${counts.delivered} 条。`;

  return {
    agentId,
    agentName: text(flow.agentName, finderListener ? "找客专员" : liveOnly ? "直播间找客户" : comprehensive ? "获客专家" : "评论区获客管家"),
    taskId: text(flow.taskId, source.context?.taskId),
    taskRunId: text(flow.taskRunId, source.context?.taskRunId) || null,
    accountId: text(flow.accountId, source.context?.accountId) || null,
    title: `${text(flow.account, source.accountIdentity?.nickname, "已授权账号")} · ${finderListener ? "互动用户汇总" : liveOnly ? "直播找人结果" : comprehensive ? "综合获客结果" : "评论区获客结果"}`,
    summary,
    source: finderListener
      ? sourceScope === "authorized_account_live"
        ? "抖音直播间新互动"
        : sourceScope === "authorized_account_all_signals"
          ? "抖音新增评论、直播互动和账号互动通知"
        : sourceScope === "authorized_account_interactions"
          ? "抖音账号互动通知"
          : "抖音作品新评论"
      : liveOnly ? "抖音直播弹幕与互动" : comprehensive ? "抖音评论、直播与互动关注" : "抖音作品评论",
    status,
    counts,
    inputs: {
      audienceGoal: text(flow.product, source.config?.audienceRules?.goal),
      requirements: text(flow.requirements, source.config?.audienceRules?.requirements),
      ...(finderListener ? { analysisMode: "collect" } : {
        approvalMode: text(flow.approvalMode, source.config?.approvalMode),
        touchChannel: text(flow.touchChannel, source.config?.touchChannel)
      }),
      sourceScope: source.config?.sourceScope || null
    },
    ...(finderListener ? { analysis: { mode: "collect", source: "none", counts: { collected: counts.candidates, pendingAnalysis: counts.pendingAnalysis } } } : {}),
    items: leads,
    leads,
    scanSummaries: Object.keys(lastScan).length ? [{
      id: text(events.find((event) => event?.type === "scan_window")?.eventId, `scan-${text(lastScan.cursor, counts.scanned)}`),
      source: lastScan.source || null,
      ...(comprehensive || finderListener ? { sources: lastScan.sources || {} } : {}),
      cursor: lastScan.cursor ?? source.cursor ?? null,
      counts: lastScan.counts || {},
      analysis: lastScan.analysis || source.lastAnalysis || null,
      observedAt: result.updatedAt || source.lastSuccessfulScan || source.updatedAt || null
    }] : [],
    candidateEvidence: leads.map((lead) => ({
      id: leadKey(lead),
      leadId: leadKey(lead),
      nickname: text(lead.nickname, lead.name),
      secId: text(lead.secId, lead.sec_id, lead.secUid, lead.sec_uid),
      quote: text(lead.text, lead.comment, lead.content),
      ...(comprehensive || finderListener ? { evidence: array(lead.evidence) } : {}),
      source: lead.source || null,
      intent: lead.intent || null,
      observedAt: lead.source?.observedAt || lead.observedAt || null
    })),
    approvalHistory: finderListener ? [] : queue.map((touch) => ({
      touchId: touch.touchId || touch.touch_id || null,
      leadId: leadKey(touch.lead),
      state: touch.state || null,
      channel: touch.channel || null,
      content: touch.content || null,
      contentBasis: touch.contentBasis || null,
      risk: touch.risk || null,
      history: array(touch.history),
      receipt: touch.receipt || touch.lastReceipt || null
    })),
    receipts: finderListener ? [] : queue.map((touch) => touch.receipt || touch.lastReceipt).filter(Boolean),
    replies: finderListener ? [] : replies,
    events,
    errors: error ? [error] : [],
    generatedAt: result.updatedAt || source.updatedAt || new Date().toISOString()
  };
}
