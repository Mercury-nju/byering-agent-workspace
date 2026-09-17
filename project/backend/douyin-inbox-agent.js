import { conversationForState, updateConversation } from "./douyin-reply-strategy.js";
import { extractLeadContact } from "../src/salebuddy/agents/lead-capture.js";

const DEFAULT_POLL_INTERVAL_MS = 5000;
const DEFAULT_POLL_WAIT_MS = 10000;
const DEFAULT_BATCH_LIMIT = 20;
const DEFAULT_MAX_REPLY_LENGTH = 500;
const MAX_STORED_IDS = 2000;

/**
 * Runtime for inbound Douyin conversations.
 *
 * This runtime owns conversation intake and response idempotency. It does not
 * discover prospects or send proactive messages, which keeps it independent
 * from the private-outreach agent.
 */
export function createDouyinInboxAgent({
  douyinMcpService,
  accountActionCoordinator = null,
  replyGenerator = async () => {
    throw Object.assign(new Error("Douyin inbox reply generator is not configured"), {
      code: "DOUYIN_REPLY_GENERATOR_NOT_CONFIGURED"
    });
  },
  shouldReply = defaultShouldReply,
  validateReply = () => ({ ok: true }),
  stateStore = createMemoryStateStore(),
  autoReply = true,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  pollWaitMs = DEFAULT_POLL_WAIT_MS,
  batchLimit = DEFAULT_BATCH_LIMIT,
  maxReplyLength = DEFAULT_MAX_REPLY_LENGTH,
  now = () => Date.now(),
  onEvent = () => {},
  receptionHandler = null,
  getConversationState = null,
  onConversationHandoff = null,
  onConversationMessage = null
} = {}) {
  if (!douyinMcpService || typeof douyinMcpService.pullMessages !== "function") {
    throw new TypeError("douyinMcpService.pullMessages is required");
  }
  if (typeof replyGenerator !== "function") throw new TypeError("replyGenerator must be a function");
  if (typeof shouldReply !== "function") throw new TypeError("shouldReply must be a function");
  if (typeof validateReply !== "function") throw new TypeError("validateReply must be a function");
  if (getConversationState != null && typeof getConversationState !== "function") throw new TypeError("getConversationState must be a function");
  if (onConversationHandoff != null && typeof onConversationHandoff !== "function") throw new TypeError("onConversationHandoff must be a function");
  if (onConversationMessage != null && typeof onConversationMessage !== "function") throw new TypeError("onConversationMessage must be a function");
  if (!stateStore || typeof stateStore.load !== "function" || typeof stateStore.save !== "function") {
    throw new TypeError("stateStore.load and stateStore.save are required");
  }

  const config = {
    autoReply: true,
    pollIntervalMs: boundedInteger(pollIntervalMs, DEFAULT_POLL_INTERVAL_MS, 250, 24 * 60 * 60 * 1000),
    pollWaitMs: boundedInteger(pollWaitMs, DEFAULT_POLL_WAIT_MS, 0, 30000),
    batchLimit: boundedInteger(batchLimit, DEFAULT_BATCH_LIMIT, 1, 100),
    maxReplyLength: boundedInteger(maxReplyLength, DEFAULT_MAX_REPLY_LENGTH, 1, 4000)
  };

  let state = createInitialState(config.autoReply);
  let loaded = false;
  let running = false;
  let polling = false;
  let loopPromise = null;
  let timer = null;
  let wakePoll = null;
  let stopVersion = 0;

  function snapshot() {
    return {
      ...state,
      running,
      polling,
      mode: "auto"
    };
  }

  async function ensureLoaded() {
    if (loaded) return;
    const stored = await stateStore.load();
    if (stored && typeof stored === "object") state = mergeState(state, stored);
    loaded = true;
  }

  async function persist() {
    await stateStore.save({
      ...state,
      updatedAt: now()
    });
  }

  function emit(type, payload = {}) {
    try {
      onEvent({ type, at: now(), ...payload });
    } catch {
      // Observability must never stop message intake.
    }
  }

  async function persistHandoff(message, decision, rawMessage) {
    if (!onConversationHandoff) return null;
    try {
      await onConversationHandoff(message, decision, { state: snapshot(), rawMessage });
      return null;
    } catch (error) {
      const serialized = serializeError(error);
      emit("reply.error", { messageId: message.id, stage: "handoff_persist", error: serialized });
      return serialized;
    }
  }

  async function persistConversationMessage(message, conversationState, rawMessage) {
    if (!onConversationMessage) return null;
    try {
      await onConversationMessage(message, { conversationState, state: snapshot(), rawMessage });
      return null;
    } catch (error) {
      const serialized = serializeError(error);
      emit("reply.error", { messageId: message.id, stage: "conversation_persist", error: serialized });
      return serialized;
    }
  }

  async function start({ autoReply: requestedAutoReply, startPolling = true, accountId, accountName, accountCoordinationKey } = {}) {
    const version = stopVersion;
    await ensureLoaded();
    if (running) return snapshot();
    if (typeof douyinMcpService.startMessageMode !== "function") {
      throw Object.assign(new Error("Douyin MCP startMessageMode is required"), {
        code: "DOUYIN_MESSAGE_MODE_UNAVAILABLE"
      });
    }
    const result = await douyinMcpService.startMessageMode();
    if (version !== stopVersion) return snapshot();
    assertMcpResult(result, "Douyin message mode failed to start");
    state.autoReply = true;
    if (accountId !== undefined) state.accountId = normalizeOptionalText(accountId);
    if (accountName !== undefined) state.accountName = normalizeOptionalText(accountName);
    if (accountCoordinationKey !== undefined) state.accountCoordinationKey = normalizeOptionalText(accountCoordinationKey);
    state.lastError = null;
    running = true;
    await persist();
    emit("agent.started", { mode: "auto" });
    if (startPolling) loopPromise = pollLoop();
    return snapshot();
  }

  async function stop() {
    stopVersion += 1;
    running = false;
    if (timer) clearTimeout(timer);
    timer = null;
    wakePoll?.();
    wakePoll = null;
    if (loopPromise) await loopPromise.catch(() => {});
    loopPromise = null;
    await ensureLoaded();
    await persist();
    emit("agent.stopped");
    return snapshot();
  }

  async function pollLoop() {
    while (running) {
      await pollOnce({ waitMs: config.pollWaitMs }).catch(() => {});
      if (!running) break;
      await new Promise((resolve) => {
        wakePoll = resolve;
        timer = setTimeout(resolve, config.pollIntervalMs);
      });
      wakePoll = null;
      timer = null;
    }
  }

  async function pollOnce({ waitMs = config.pollWaitMs, limit = config.batchLimit } = {}) {
    const version = stopVersion;
    await ensureLoaded();
    if (polling) return { ok: true, skipped: true, reason: "poll_in_progress", ...snapshot() };
    polling = true;
    const cursor = state.cursor;
    state.lastPollAt = now();
    try {
      let result = await douyinMcpService.pullMessages({
        cursor,
        limit: boundedInteger(limit, config.batchLimit, 1, 100),
        waitMs: boundedInteger(waitMs, config.pollWaitMs, 0, 30000)
      });
      if (cursor === 0 && (isLegacyCursorTimeout(result) || isStalledLegacyCursor(result))) {
        const synchronized = await douyinMcpService.pullMessages({
          cursor: null,
          limit: boundedInteger(limit, config.batchLimit, 1, 100),
          waitMs: 0
        });
        assertMcpResult(synchronized, "Douyin message cursor synchronization failed");
        const synchronizedCursor = extractNextCursor(synchronized);
        if (synchronizedCursor === null) assertMcpResult(result, "Douyin message pull failed");
        state.cursor = synchronizedCursor;
        state.lastError = null;
        state.pollCount += 1;
        await persist();
        emit("cursor.resynchronized", { cursor, nextCursor: synchronizedCursor });
        return {
          ok: true,
          cursor,
          nextCursor: synchronizedCursor,
          count: 0,
          outcomes: [],
          resynchronized: true
        };
      }
      assertMcpResult(result, "Douyin message pull failed");
      const messages = extractMessages(result);
      if (version !== stopVersion) return { ok: true, skipped: true, reason: "stopped" };
      const nextCursor = extractNextCursor(result);
      const outcomes = [];
      if (receptionHandler) {
        let acceptedCount = 0;
        for (const raw of messages) {
          const message = normalizeMessage(raw);
          if (message.isOutbound || !message.id || state.processedIds.includes(message.id) || state.pendingMessages.some(item => item.id === message.id)) continue;
          if (state.pendingMessages.length >= 5000) throw Object.assign(new Error("待回复消息过多，请处理后继续"), { code: "RECEPTION_QUEUE_FULL" });
          state.pendingMessages.push({ ...message, receivedAt: now() });
          state.receivedCount++; acceptedCount++; emit("message.received", { messageId: message.id, message });
        }
        if (nextCursor !== null) state.cursor = nextCursor;
        await persist();
        const groups = new Map();
        for (const message of state.pendingMessages) {
          const key = message.secUid || message.secId || message.conversationId || message.id;
          const group = groups.get(key) || []; group.push(message); groups.set(key, group);
        }
        for (const group of groups.values()) {
          if (version !== stopVersion) break;
          const batch = group.slice(0, 20), last = batch.at(-1);
          const message = { ...last, batchIds: batch.map(item => item.id), content: batch.map(item => item.content).join("\n") };
          try {
            const outcome = await receptionHandler({ message, active: () => version === stopVersion, send: (payload, check) => runInboxSend(async () => {
              if (version !== stopVersion || !check()) return { cancelled: true };
              return douyinMcpService.sendMessage(payload);
            }, { action: "reply", messageId: message.id, secUid: message.secUid }) });
            outcomes.push(outcome);
            if (outcome.handledIds?.length) {
              outcome.handledIds.forEach(id => remember(state.processedIds, id));
              state.pendingMessages = state.pendingMessages.filter(item => !outcome.handledIds.includes(item.id));
            }
            if (outcome.status !== "deferred") {
              batch.forEach(item => remember(state.processedIds, item.id));
              state.pendingMessages = state.pendingMessages.filter(item => !message.batchIds.includes(item.id));
            }
            if (outcome.status === "sent") { state.sentCount++; emit("reply.sent", { messageId: message.id, content: outcome.content, deliveryState: "sent", result: outcome.result }); }
            if (outcome.status === "handoff") { state.handoffCount++; emit("reply.handoff", { messageId: message.id, message, reason: outcome.reason }); }
            await persist();
          } catch (error) { emit("reply.error", { messageId: message.id, error: serializeError(error) }); throw error; }
        }
        state.lastError = null; state.pollCount++; await persist();
        return { ok: true, outcomes, count: acceptedCount, pending: state.pendingMessages.length, nextCursor: state.cursor };
      }
      for (const rawMessage of messages) {
        if (version !== stopVersion) break;
        outcomes.push(await handleMessage(normalizeMessage(rawMessage), rawMessage));
      }
      if (nextCursor !== null) state.cursor = nextCursor;
      else if (messages.length) state.cursor = cursor + messages.length;
      state.lastMessageAt = messages.length ? now() : state.lastMessageAt;
      state.lastError = null;
      state.pollCount += 1;
      await persist();
      emit("poll.completed", { cursor, nextCursor: state.cursor, count: messages.length });
      return { ok: true, cursor, nextCursor: state.cursor, count: messages.length, outcomes };
    } catch (error) {
      state.lastError = serializeError(error);
      state.errorCount += 1;
      await persist().catch(() => {});
      emit("poll.error", { error: state.lastError });
      throw error;
    } finally {
      polling = false;
    }
  }

  async function handleMessage(message, rawMessage) {
    const version = stopVersion;
    const messageId = message.id || stableMessageId(message, rawMessage);
    if (!messageId) {
      emit("message.skipped", { reason: "message_id_missing", message });
      return { status: "skipped", reason: "message_id_missing" };
    }
    if (state.processedIds.includes(messageId)) {
      return { status: "duplicate", messageId };
    }
    if (message.isOutbound) {
      remember(state.processedIds, messageId);
      emit("message.skipped", { reason: "outbound_message", messageId, message });
      return { status: "skipped", reason: "outbound_message", messageId };
    }

    state.receivedCount += 1;
    emit("message.received", { messageId, message });
    let conversationState = null;
    if (getConversationState) {
      try {
        conversationState = await getConversationState(message, { state: snapshot(), rawMessage });
      } catch (error) {
        emit("reply.error", { messageId, stage: "conversation_state", error: serializeError(error) });
        return { status: "error", reason: "conversation_state_failed", messageId };
      }
      const messagePersistError = await persistConversationMessage(message, conversationState, rawMessage);
      if (messagePersistError) return { status: "error", reason: "conversation_persist_failed", messageId, error: messagePersistError };
      if (conversationState?.mode === "human") {
        updateConversation(state, message, { reply: false, reason: "human_takeover", conversationMode: "human" });
        remember(state.processedIds, messageId);
        emit("reply.skipped", { messageId, reason: "human_takeover" });
        await persist();
        return { status: "human", reason: "human_takeover", messageId };
      }
      if (conversationState?.mode === "closed") {
        updateConversation(state, message, { reply: false, reason: "conversation_closed", conversationMode: "closed" });
        remember(state.processedIds, messageId);
        emit("reply.skipped", { messageId, reason: "conversation_closed" });
        await persist();
        return { status: "skipped", reason: "conversation_closed", messageId };
      }
    }
    const leadCapture = extractLeadContact(message.content);
    if (leadCapture) {
      updateConversation(state, message, { reply: false, reason: "lead_captured" });
      remember(state.processedIds, messageId);
      emit("lead.captured", { messageId, message, leadCapture, reason: "contact_signal_detected" });
      emit("reply.skipped", { messageId, reason: "lead_captured" });
      return { status: "captured", reason: "lead_captured", messageId, leadCapture };
    }
    let decision;
    try {
      decision = await shouldReply(message, {
        state: snapshot(),
        rawMessage,
        conversation: conversationForState(state, message)
      });
    } catch (error) {
      emit("reply.error", { messageId, stage: "policy", error: serializeError(error) });
      return { status: "error", reason: "policy_failed", messageId };
    }
    if (decision === false || decision?.reply === false) {
      updateConversation(state, message, decision);
      remember(state.processedIds, messageId);
      emit("reply.skipped", { messageId, reason: decision?.reason || "policy" });
      return { status: "skipped", reason: decision?.reason || "policy", messageId };
    }
    if (decision?.requiresHandoff === true) {
      const handoffError = await persistHandoff(message, decision, rawMessage);
      if (handoffError) return { status: "error", reason: "handoff_persist_failed", messageId, error: handoffError };
      updateConversation(state, message, decision);
      remember(state.processedIds, messageId);
      state.handoffCount += 1;
      const reason = decision?.reason || "policy_boundary";
      emit("reply.handoff", { messageId, message, reason });
      await persist();
      return { status: "handoff", reason, messageId };
    }

    let draft;
    try {
      draft = normalizeReply(await replyGenerator(message, {
        state: snapshot(),
        rawMessage,
        decision,
        conversation: conversationForState(state, message)
      }), config.maxReplyLength);
    } catch (error) {
      emit("reply.error", { messageId, stage: "generation", error: serializeError(error) });
      return { status: "error", reason: "generation_failed", messageId };
    }
    if (!draft.content) {
      remember(state.processedIds, messageId);
      emit("reply.skipped", { messageId, reason: "empty_reply" });
      return { status: "skipped", reason: "empty_reply", messageId };
    }

    const validation = validateReply(draft.content, { message, decision, state: snapshot(), rawMessage });
    if (validation?.ok === false) {
      emit("reply.error", {
        messageId,
        stage: "validation",
        error: { code: "DOUYIN_REPLY_POLICY_REJECTED", message: validation.reason || "reply_policy_rejected" }
      });
      return { status: "error", reason: validation.reason || "reply_policy_rejected", messageId };
    }
    updateConversation(state, message, decision);

    // A human can take over while the model is generating. Re-read the durable
    // conversation state immediately before sending so the old reply cannot
    // escape after ownership has changed.
    if (getConversationState) {
      let latestConversationState;
      try {
        latestConversationState = await getConversationState(message, { state: snapshot(), rawMessage, stage: "before_send" });
      } catch (error) {
        emit("reply.error", { messageId, stage: "conversation_state_before_send", error: serializeError(error) });
        return { status: "error", reason: "conversation_state_failed", messageId };
      }
      if (latestConversationState?.mode === "human") {
        updateConversation(state, message, { reply: false, reason: "human_takeover", conversationMode: "human" });
        remember(state.processedIds, messageId);
        emit("reply.skipped", { messageId, reason: "human_takeover" });
        await persist();
        return { status: "human", reason: "human_takeover", messageId };
      }
      if (latestConversationState?.mode === "closed") {
        updateConversation(state, message, { reply: false, reason: "conversation_closed", conversationMode: "closed" });
        remember(state.processedIds, messageId);
        emit("reply.skipped", { messageId, reason: "conversation_closed" });
        await persist();
        return { status: "skipped", reason: "conversation_closed", messageId };
      }
    }

    if (draft.send === false) {
      const handoffError = await persistHandoff(message, { ...decision, reason: decision?.reason || "generator_boundary" }, rawMessage);
      if (handoffError) return { status: "error", reason: "handoff_persist_failed", messageId, error: handoffError };
      remember(state.processedIds, messageId);
      state.handoffCount += 1;
      const reason = decision?.reason || "generator_boundary";
      emit("reply.handoff", { messageId, message, reason });
      await persist();
      return { status: "handoff", reason, messageId };
    }

    const recipient = messageRecipient(message);
    if (version !== stopVersion) return { status: "skipped", reason: "stopped", messageId };
    if (!recipient.conversationId && !recipient.nickname && !recipient.secUid) {
      remember(state.processedIds, messageId);
      emit("reply.skipped", { messageId, reason: "recipient_missing" });
      return { status: "skipped", reason: "recipient_missing", messageId };
    }
    if (typeof douyinMcpService.sendMessage !== "function") {
      emit("reply.error", { messageId, stage: "send", error: { code: "DOUYIN_SEND_UNAVAILABLE" } });
      return { status: "error", reason: "send_unavailable", messageId };
    }
    try {
      const result = await runInboxSend(() => {
        if (version !== stopVersion) throw Object.assign(new Error("Reply runtime stopped"), { code: "DOUYIN_INBOX_STOPPED" });
        return douyinMcpService.sendMessage({
        ...recipient,
        content: draft.content,
        reqId: `douyin-inbox:${messageId}`
        });
      }, { action: "reply", messageId, conversationId: recipient.conversationId, secUid: recipient.secUid });
      assertMcpResult(result, "Douyin reply failed to send");
      remember(state.processedIds, messageId);
      remember(state.repliedIds, messageId);
      state.sentCount += 1;
      const conversation = conversationForState(state, message);
      conversation.recentMessages = [...(conversation.recentMessages || []), { role: "assistant", content: draft.content, at: now() }].slice(-10);
      emit("reply.sent", { messageId, content: draft.content, deliveryState: "sent", result });
      return { status: "sent", messageId, content: draft.content, result };
    } catch (error) {
      emit("reply.error", { messageId, stage: "send", error: serializeError(error) });
      return { status: "error", reason: "send_failed", messageId };
    }
  }

  function status() {
    return snapshot();
  }

  function runInboxSend(operation, metadata) {
    const accountKey = state.accountCoordinationKey || state.accountId;
    if (!accountKey || typeof accountActionCoordinator?.runInbox !== "function") return operation();
    return accountActionCoordinator.runInbox(accountKey, operation, metadata);
  }

  return {
    start,
    stop,
    pollOnce,
    status,
    handleMessage,
    listDrafts() { return []; },
    setReplyGenerator(generator) {
      if (typeof generator !== "function") throw new TypeError("replyGenerator must be a function");
      replyGenerator = generator;
    },
    setAccountCoordinationKey(value) {
      state.accountCoordinationKey = normalizeOptionalText(value);
      return state.accountCoordinationKey;
    }
  };
}

export function createMemoryStateStore(initial = null) {
  let value = initial && typeof initial === "object" ? structuredClone(initial) : null;
  return {
    async load() { return value ? structuredClone(value) : null; },
    async save(next) { value = structuredClone(next); }
  };
}

export function normalizeMessage(input = {}) {
  const message = input && typeof input === "object" ? input : {};
  const sender = firstObject(message.sender, message.from, message.user, message.author);
  const id = firstText(message.msg_id, message.message_id, message.messageId, message.id, message.item_id);
  const conversationId = firstText(message.conversation_id, message.conversationId, message.conversation, message.chat_id, message.chatId);
  const nickname = firstText(message.nickname, message.nick_name, sender.nickname, sender.nick_name, sender.name);
  const userId = firstText(message.user_id, message.userId, message.uid, sender.user_id, sender.userId, sender.uid);
  const secUid = firstText(message.sec_uid, message.secUid, message.sec_id, message.secId, sender.sec_uid, sender.secUid, sender.sec_id, sender.secId);
  const uniqueId = firstText(message.unique_id, message.uniqueId, sender.unique_id, sender.uniqueId);
  const externalUserId = firstText(message.external_user_id, message.externalUserId, userId, secUid, uniqueId);
  const content = firstText(
    message.content?.text,
    message.content?.content,
    message.content,
    message.text,
    message.message?.text,
    message.message,
    message.body?.text,
    message.body,
    message.msg
  ) || "";
  const isOutbound = Boolean(message.is_self ?? message.isSelf ?? message.outgoing ?? message.is_outgoing)
    || [message.direction, message.role, message.sender_type].some((value) => ["outbound", "outgoing", "send", "sent", "self", "assistant"].includes(String(value || "").toLowerCase()));
  return {
    id,
    content,
    conversationId,
    nickname,
    userId,
    secUid,
    uniqueId,
    externalUserId,
    avatarUrl: firstText(message.avatar_url, message.avatarUrl, sender.avatar_url, sender.avatarUrl),
    isOutbound,
    createdAt: firstText(message.created_at, message.createdAt, message.timestamp, message.create_time),
    sender,
    raw: message
  };
}

export function defaultShouldReply(message) {
  if (!message?.content?.trim()) return { reply: false, reason: "empty_message" };
  return { reply: true };
}

function createInitialState() {
  return {
    accountId: null,
    accountName: null,
    accountCoordinationKey: null,
    cursor: 0,
    autoReply: true,
    processedIds: [],
    repliedIds: [],
    conversations: {},
    pendingMessages: [],
    receivedCount: 0,
    handoffCount: 0,
    sentCount: 0,
    pollCount: 0,
    errorCount: 0,
    lastPollAt: null,
    lastMessageAt: null,
    lastError: null,
    updatedAt: null
  };
}

function mergeState(base, stored) {
  const next = { ...base };
  for (const key of Object.keys(base)) {
    if (stored[key] !== undefined) next[key] = stored[key];
  }
  next.cursor = Number.isInteger(next.cursor) && next.cursor >= 0 ? next.cursor : 0;
  next.accountId = normalizeOptionalText(next.accountId) || null;
  next.accountName = normalizeOptionalText(next.accountName) || null;
  next.accountCoordinationKey = normalizeOptionalText(next.accountCoordinationKey) || null;
  next.autoReply = true;
  next.handoffCount = Number.isFinite(Number(stored.handoffCount))
    ? Number(stored.handoffCount)
    : Number(stored.draftCount || 0);
  next.processedIds = uniqueIds(next.processedIds);
  next.repliedIds = uniqueIds(next.repliedIds);
  next.pendingMessages = Array.isArray(next.pendingMessages) ? next.pendingMessages : [];
  next.conversations = next.conversations && typeof next.conversations === "object" && !Array.isArray(next.conversations)
    ? next.conversations
    : {};
  return next;
}

function normalizeOptionalText(value) {
  const text = typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
  return text || null;
}

function extractMessages(payload) {
  if (Array.isArray(payload)) return payload;
  for (const candidate of [payload?.messages, payload?.items, payload?.data?.messages, payload?.data?.items, payload?.result?.messages, payload?.result?.items]) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

function extractNextCursor(payload) {
  const candidates = [payload?.next_cursor, payload?.nextCursor, payload?.data?.next_cursor, payload?.data?.nextCursor, payload?.result?.next_cursor, payload?.result?.nextCursor];
  for (const candidate of candidates) {
    if (Number.isInteger(candidate) && candidate >= 0) return candidate;
    if (/^\d+$/.test(String(candidate || ""))) return Number(candidate);
  }
  return null;
}

function messageRecipient(message) {
  return {
    conversationId: message.conversationId || null,
    nickname: message.nickname || null,
    secUid: message.secUid || null
  };
}

function normalizeReply(value, maxLength) {
  if (typeof value === "string") return { content: value.trim().slice(0, maxLength), send: true };
  if (!value || typeof value !== "object") return { content: "", send: false };
  const content = firstText(value.content, value.text, value.message)?.slice(0, maxLength) || "";
  return { content, send: value.send !== false };
}

function stableMessageId(message, rawMessage) {
  if (message.id) return message.id;
  const fingerprint = [message.conversationId, message.nickname, message.content, message.createdAt].filter(Boolean).join("|");
  return fingerprint || null;
}

function remember(list, id) {
  if (!id || list.includes(id)) return;
  list.push(id);
  if (list.length > MAX_STORED_IDS) list.splice(0, list.length - MAX_STORED_IDS);
}

function uniqueIds(value) {
  return Array.isArray(value) ? [...new Set(value.filter((id) => typeof id === "string" && id).slice(-MAX_STORED_IDS))] : [];
}

function firstText(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function firstObject(...values) {
  return values.find((value) => value && typeof value === "object" && !Array.isArray(value)) || {};
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) return fallback;
  return parsed;
}

function assertMcpResult(result, message) {
  if (result?.ok === false) {
    const error = result.error || {};
    throw Object.assign(new Error(error.message || message), {
      code: error.code || "DOUYIN_MCP_ERROR",
      details: error
    });
  }
}

function isLegacyCursorTimeout(result) {
  if (result?.ok !== false) return false;
  const code = String(result?.error?.code || result?.error_code || "").trim().toLowerCase();
  return code === "worker_timeout";
}

function isStalledLegacyCursor(result) {
  if (result?.ok === false || String(result?.source || "").toLowerCase() !== "worker") return false;
  return extractMessages(result).length === 0 && extractNextCursor(result) === 0;
}

function serializeError(error) {
  return {
    code: error?.code || "DOUYIN_INBOX_ERROR",
    message: error?.message || String(error)
  };
}
