const BUSINESS_AGENT_ID = "mkt-comment-acquisition";
const TIME_ZONE = "Asia/Shanghai";
const QUALIFIED_TIERS = new Set(["high", "medium", "a", "b", "重点", "高意向", "中意向"]);
const CANDIDATE_EVENT_TYPES = new Set(["candidates_found", "lead.candidate"]);
const QUALIFIED_EVENT_TYPES = new Set(["lead.qualified"]);
const INTENT_EVENT_TYPES = new Set(["intent_decision"]);
const SENT_EVENT_TYPES = new Set(["outreach.sent"]);
const REPLY_EVENT_TYPES = new Set(["reply_received", "lead.replied"]);
const FAILED_EVENT_TYPES = new Set(["outreach.failed"]);

function text(value, fallback = "") {
  const result = String(value ?? "").trim();
  return result || fallback;
}

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function number(value) {
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function payloadOf(event = {}) {
  return event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
    ? event.payload
    : {};
}

function eventCount(event = {}) {
  const payload = payloadOf(event);
  for (const value of [payload.count, payload.leadCount, payload.candidateCount, payload.total, payload.data?.count]) {
    const result = number(value);
    if (result != null && result >= 0) return result;
  }
  return null;
}

function identityOf(value = {}) {
  if (!value || typeof value !== "object") return null;
  for (const key of [
    "candidateKey", "leadId", "lead_id", "sourceRecordId", "source_record_id", "recordId", "record_id",
    "externalUserId", "external_user_id", "secUid", "sec_uid", "secId", "sec_id", "uniqueId", "unique_id", "uid", "id", "nickname"
  ]) {
    const result = text(value[key]);
    if (result) return result;
  }
  return null;
}

function candidateOf(event = {}) {
  const payload = payloadOf(event);
  return payload.candidate || payload.lead || payload.user || null;
}

function tierOf(candidate = {}) {
  const intent = candidate?.intent && typeof candidate.intent === "object" ? candidate.intent : {};
  return text(candidate?.tier || candidate?.intentTier || intent.tier).toLowerCase();
}

function isQualified(candidate = {}) {
  const tier = tierOf(candidate);
  if (QUALIFIED_TIERS.has(tier)) return true;
  const score = number(candidate?.score ?? candidate?.intent?.score);
  return score != null && score >= 80;
}

function zonedDate(value, timeZone = TIME_ZONE) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const fields = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return fields.year && fields.month && fields.day ? `${fields.year}-${fields.month}-${fields.day}` : null;
}

function yesterdayKey(now, timeZone) {
  const current = new Date(now());
  if (Number.isNaN(current.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(current);
  const fields = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const utcMidday = Date.UTC(Number(fields.year), Number(fields.month) - 1, Number(fields.day) - 1, 12);
  return zonedDate(new Date(utcMidday), "UTC");
}

function percent(numerator, denominator) {
  if (!Number.isFinite(Number(denominator)) || Number(denominator) <= 0) return "0%";
  const value = (Number(numerator) / Number(denominator)) * 100;
  return `${Number.isInteger(value) ? value : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}%`;
}

function compactNumber(value) {
  return Number(value || 0).toLocaleString("zh-CN");
}

function matchesBusinessMessage(value = "") {
  return /线索|触达率|回复率|转化率|数据表现|表现怎么样|变得更好|怎么改善|如何提升|原因|优化|建议/u.test(value);
}

function isConfirmation(value = "") {
  const normalized = text(value).toLowerCase().replace(/[\s，。！!、,.]/gu, "");
  return /^(ok|okay|好的|可以|确认|同意|就这样|按这个|没问题|执行|照这个办|那就这样)/u.test(normalized);
}

function isImprovementQuestion(value = "") {
  return /变得更好|怎么改善|如何提升|怎么优化|如何优化|有什么建议|给我建议|原因|问题在哪里|表现怎么样/u.test(value);
}

function taskMatches(task, context = {}, agentType) {
  if (text(task?.context?.agentId || task?.agentId) !== agentType) return false;
  const taskContext = task.context || task;
  for (const key of ["taskId", "taskRunId", "conversationId", "accountId", "tenantId"]) {
    const expected = text(context[key]);
    if (expected && text(taskContext[key]) !== expected) return false;
  }
  return true;
}

function resolveTask(acquisitionService, context = {}, agentType) {
  if (typeof acquisitionService?.listTasks !== "function") return null;
  const tasks = acquisitionService.listTasks().filter((task) => taskMatches(task, context, agentType));
  return tasks.length === 1 ? tasks[0] : null;
}

function taskEventsForDate(task, dateKey, timeZone) {
  return (Array.isArray(task?.events) ? task.events : [])
    .filter((event) => zonedDate(event?.occurredAt, timeZone) === dateKey)
    .filter((event, index, events) => {
      const key = text(event?.eventId) || `${event?.type || "event"}:${event?.occurredAt || ""}:${index}`;
      return events.findIndex((candidate) => (text(candidate?.eventId) || `${candidate?.type || "event"}:${candidate?.occurredAt || ""}`) === key) === index;
    });
}

function countEntities(events, eventTypes, { qualified = false } = {}) {
  const identities = new Set();
  let anonymousCount = 0;
  let eventFound = false;
  for (const event of events) {
    if (!eventTypes.has(event.type)) continue;
    eventFound = true;
    const candidate = candidateOf(event);
    const identity = identityOf(candidate) || identityOf(payloadOf(event));
    if (identity) {
      if (!qualified || isQualified(candidate)) identities.add(identity);
      continue;
    }
    const count = eventCount(event);
    if (count != null) anonymousCount += count;
    else if (!qualified || isQualified(payloadOf(event))) anonymousCount += 1;
  }
  return { count: identities.size + anonymousCount, eventFound };
}

function aggregateMetrics(task, dateKey, timeZone) {
  const events = taskEventsForDate(task, dateKey, timeZone);
  const candidateResult = countEntities(events, CANDIDATE_EVENT_TYPES);
  const qualifiedEvents = countEntities(events, QUALIFIED_EVENT_TYPES);
  const intentResult = countEntities(events, INTENT_EVENT_TYPES, { qualified: true });
  const qualified = Math.max(qualifiedEvents.count, intentResult.count);
  const sentEvents = events.filter((event) => {
    if (SENT_EVENT_TYPES.has(event.type)) return true;
    if (event.type !== "touch_receipt") return false;
    return ["delivered", "sent", "success", "succeeded"].includes(text(payloadOf(event).state).toLowerCase());
  });
  const sent = countEntities(sentEvents.map((event) => ({ ...event, type: "outreach.sent" })), SENT_EVENT_TYPES).count;
  const repliesFromEvents = countEntities(events, REPLY_EVENT_TYPES).count;
  const repliesFromTask = (Array.isArray(task?.replies) ? task.replies : [])
    .filter((reply) => zonedDate(reply?.receivedAt || reply?.createdAt, timeZone) === dateKey).length;
  const failed = events.filter((event) => {
    if (FAILED_EVENT_TYPES.has(event.type)) return true;
    if (event.type !== "touch_receipt") return false;
    return ["failed", "rejected", "denied", "error"].includes(text(payloadOf(event).state).toLowerCase());
  }).reduce((total, event) => total + (eventCount(event) ?? 1), 0);
  let candidates = candidateResult.count;
  if (!candidateResult.eventFound) {
    const scanEvents = events.filter((event) => event.type === "scan_window");
    candidates = scanEvents.reduce((total, event) => total + (eventCount(event) ?? number(payloadOf(event).newCandidates) ?? 0), 0);
  }
  if (!candidateResult.eventFound && candidates === 0) {
    const snapshot = events.findLast((event) => payloadOf(event).resultSnapshot)?.payload?.resultSnapshot;
    candidates = number(snapshot?.counts?.candidates ?? snapshot?.counts?.newCandidates) ?? 0;
  }
  const denominator = qualified > 0 ? qualified : candidates;
  return {
    candidates,
    qualified,
    sent,
    replies: Math.max(repliesFromEvents, repliesFromTask),
    failed,
    touchRate: percent(sent, denominator),
    replyRate: percent(Math.max(repliesFromEvents, repliesFromTask), sent),
    date: dateKey,
    eventCount: events.length,
    lastEventAt: events.at(-1)?.occurredAt || null
  };
}

function accountNameFor(task, context) {
  return text(
    task?.accountIdentity?.nickname
      || task?.context?.accountName
      || task?.config?.accountName
      || context?.accountName
      || task?.context?.accountId
      || context?.accountId,
    "当前授权账号"
  );
}

function metricsReply(task, metrics) {
  const suffix = metrics.eventCount > 0
    ? `，数据来自任务在 ${metrics.date} 记录的 ${metrics.eventCount} 条业务事件`
    : "，当前任务没有记录到这一天的业务事件";
  return `昨天（${metrics.date}）${accountNameFor(task)}共发现 ${compactNumber(metrics.candidates)} 位线索，其中 ${compactNumber(metrics.qualified)} 位达到高意向标准；已触达 ${compactNumber(metrics.sent)} 位，线索触达率为 ${metrics.touchRate}（${metrics.sent}/${metrics.qualified || metrics.candidates}），收到 ${compactNumber(metrics.replies)} 位回复，触达回复率为 ${metrics.replyRate}（${metrics.replies}/${metrics.sent}），失败 ${compactNumber(metrics.failed)} 位${suffix}。`;
}

function diagnosisReply(metrics) {
  const reasons = [];
  const untouched = Math.max(0, metrics.qualified - metrics.sent);
  if (untouched > 0) reasons.push(`${untouched} 位高意向线索还没有完成首次触达`);
  if (metrics.failed > 0) reasons.push(`${metrics.failed} 位触达没有拿到成功回执`);
  if (metrics.sent > 0 && metrics.replies === 0) reasons.push("已发出的首触暂时没有收到回复，首句承接可能还不够具体");
  if (!reasons.length && metrics.qualified === 0) reasons.push("当前没有足够的高意向样本，先补齐有效需求证据再扩大触达");
  if (!reasons.length) reasons.push("触达链路已经跑通，但还可以继续提高首句对用户原始问题的承接度");
  return reasons.join("；") + "。";
}

function strategyChanges(task, metrics) {
  const current = task?.configuration?.touchContent || {};
  const changes = {};
  const proposed = {
    replyStyle: "先回应用户原始问题，再只推进一个明确下一步；表达简短、具体、自然。",
    conversionGoal: "优先确认预算、车型和到店时间，再将最终报价、库存和预约交给人工确认。",
    handoffBoundary: "涉及最终报价、库存、优惠承诺、投诉和到店安排时交给人工确认。"
  };
  for (const [key, value] of Object.entries(proposed)) if (text(current[key]) !== value) changes[key] = value;
  if (Math.max(0, metrics.qualified - metrics.sent) > 0) {
    const currentDailyMax = number(task?.configuration?.frequency?.maxTouchesPerDay ?? task?.config?.caps?.dailyMax);
    const suggestedDailyMax = Math.max(metrics.qualified, metrics.sent + Math.max(1, metrics.qualified - metrics.sent));
    if (currentDailyMax != null && suggestedDailyMax > currentDailyMax) changes.frequency = { maxTouchesPerDay: suggestedDailyMax };
  }
  return Object.keys(changes).length ? { touchContent: Object.fromEntries(Object.entries(changes).filter(([key]) => key !== "frequency")), ...(changes.frequency ? { frequency: changes.frequency } : {}) } : {};
}

function proposalReply(task, metrics) {
  const changes = strategyChanges(task, metrics);
  if (!Object.keys(changes).length) return null;
  const currentConfigVersion = number(task?.configurationVersion ?? task?.configVersion ?? task?.configuration?.version) || 1;
  const expectedVersion = number(task?.eventSeq);
  return {
    text: `我按昨天的真实链路看了一遍：${diagnosisReply(metrics)}我准备把后续新线索的承接方式调整为“先回应原问题，再推进一个明确下一步”，同时把人工交接边界写清楚${changes.frequency ? `，并把每日触达上限从当前值调整到 ${changes.frequency.maxTouchesPerDay} 位` : ""}。这只对后续执行生效，不会改动已经处理过的记录。确认后我会把它写入当前获客任务配置。`,
    proposal: {
      status: "pending",
      taskKey: task.key,
      taskId: task.context?.taskId || null,
      taskRunId: task.context?.taskRunId || null,
      conversationId: task.context?.conversationId || null,
      accountId: task.context?.accountId || null,
      tenantId: task.context?.tenantId || null,
      baseConfigVersion: currentConfigVersion,
      expectedVersion,
      changes: clone(changes),
      metrics: clone(metrics)
    }
  };
}

function pendingProposal(messages, conversationId) {
  return [...(Array.isArray(messages) ? messages : [])]
    .reverse()
    .find((message) => message?.metadata?.acquisitionBusinessProposal?.status === "pending"
      && (!conversationId || message.conversationId === conversationId))?.metadata?.acquisitionBusinessProposal || null;
}

function appliedText(result) {
  const version = result?.configurationVersion ?? result?.configVersion;
  return `已按确认更新获客策略，配置版本已生效为 v${version}。之后新发现的高意向线索会按新的承接方式执行，历史记录不回溯。`;
}

export function createAcquisitionBusinessConversationService({ acquisitionService, now = () => Date.now(), timeZone = TIME_ZONE } = {}) {
  return {
    supports(agentType) {
      return agentType === BUSINESS_AGENT_ID && typeof acquisitionService?.listTasks === "function";
    },

    async handle({ agentType, text: messageText, context = {}, messages = [] } = {}) {
      if (!this.supports(agentType) || (!matchesBusinessMessage(messageText) && !isConfirmation(messageText))) return null;
      const task = resolveTask(acquisitionService, context, agentType);
      if (!task) {
        return {
          text: "当前对话没有绑定唯一的获客任务，我不能凭空编造昨天的业务数据或修改策略。请从一个正在运行的抖音获客任务进入对话后再试。",
          metadata: { status: "task_not_found" }
        };
      }

      const proposal = pendingProposal(messages, context.conversationId || task.context?.conversationId || null);
      if (isConfirmation(messageText) && proposal) {
        const current = typeof acquisitionService.status === "function" ? acquisitionService.status(proposal.taskKey || task.key) : task;
        const currentConfigVersion = number(current?.configurationVersion ?? current?.configVersion ?? current?.configuration?.version) || 1;
        const currentTaskVersion = number(current?.eventSeq) ?? 0;
        if (currentConfigVersion !== Number(proposal.baseConfigVersion) || currentTaskVersion !== Number(proposal.expectedVersion)) {
          return {
            text: "这份调整在你确认前已经有新的任务事件写入，当前配置版本也发生了变化。我没有覆盖新状态，请重新问我一次数据表现，我会基于最新记录重新给建议。",
            metadata: { acquisitionBusinessProposal: { ...clone(proposal), status: "stale" } }
          };
        }
        const nextConfigVersion = currentConfigVersion + 1;
        const updated = await acquisitionService.updateTaskConfig(proposal.taskKey || task.key, {
          baseConfigVersion: currentConfigVersion,
          configVersion: nextConfigVersion,
          expectedVersion: currentTaskVersion,
          effectiveScope: "future_only",
          changes: clone(proposal.changes),
          confirmation: { confirmed: true },
          reason: "用户在获客管家对话中确认策略优化"
        });
        return {
          text: appliedText(updated),
          metadata: { acquisitionBusinessProposal: { ...clone(proposal), status: "applied", appliedConfigVersion: nextConfigVersion } }
        };
      }

      const dateKey = yesterdayKey(now, timeZone);
      const metrics = aggregateMetrics(task, dateKey, timeZone);
      if (isImprovementQuestion(messageText)) {
        const proposalReplyValue = proposalReply(task, metrics);
        if (!proposalReplyValue) {
          return {
            text: `我检查了昨天（${metrics.date}）的真实任务数据，目前没有发现可安全调整且会产生实际变化的配置项。现有策略已经覆盖这条链路，我建议先继续积累新样本。`,
            metadata: { acquisitionBusinessMetrics: clone(metrics) }
          };
        }
        return {
          text: proposalReplyValue.text,
          metadata: {
            acquisitionBusinessMetrics: clone(metrics),
            acquisitionBusinessProposal: proposalReplyValue.proposal
          }
        };
      }
      return {
        text: metricsReply(task, metrics),
        metadata: { acquisitionBusinessMetrics: clone(metrics) }
      };
    }
  };
}
