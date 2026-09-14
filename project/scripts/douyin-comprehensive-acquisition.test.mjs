import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDouyinAcquisitionService } from "../backend/douyin-acquisition-service.js";
import { createDouyinInteractionSource } from "../backend/douyin-interaction-source.js";
import { createDouyinMcpService } from "../backend/douyin-mcp.js";
import { createServer } from "node:http";

const account = { secId: "owner", uid: "owner-uid", nickname: "Owner" };
const sender = { sec_uid: "customer", nickname: "Customer", avatar: "https://example.com/avatar.png" };
const context = { agentId: "mkt-comment-acquisition", taskId: "task", taskRunId: "run", conversationId: "conversation", accountId: "owner" };
const config = {
  sourceScope: { kind: "authorized_account_all_signals" }, accountIdentity: account,
  audienceRules: { goal: "Find customers", minScore: 80 }, approvalMode: "auto",
  contentPolicy: { template: "Hello, how can I help?", conversionGoal: "Book a consultation" },
  caps: { dailyMax: 1, sendIntervalMs: 0 }, stopConditions: { stopOnReply: false }, autoStartCloud: false
};

test("combines comments, follows and live messages without fabricating customer quotes", async () => {
  const analyzed = [];
  const calls = [];
  const source = createDouyinInteractionSource({
    cloudRegistry: { getService: () => ({
      startLivePolling: async () => { calls.push("live-start"); return { ok: true }; },
      pullLiveMessages: async (input) => { calls.push(input); return { messages: [{ msg_id: "live-1", sender, content: { text: "I need this next week" }, room_id: "room-1" }], next_cursor: 8 }; }
    }) },
    commentSource: { scan: async () => ({ nextCursor: 3, leads: [
      { secUid: "customer", text: "How can I book?", source: { type: "comment" }, evidence: [{ eventId: "comment-1", type: "comment", quote: "How can I book?" }] },
      { secUid: "customer", text: "", source: { type: "follow" }, evidence: [{ eventId: "follow-1", type: "follow", quote: "", action: "follow" }] }
    ] }) },
    analyzer: { analyze: async (input) => { analyzed.push(input); return { source: "model", items: [{ index: 0, score: 91, tier: "high", reason: "Booking request", confidence: 0.9 }] }; } }
  });
  const result = await source.scan({ agentId: context.agentId, account, goal: "Bookings", cursor: { notifications: 1, live: 5 } });
  assert.equal(result.leads.length, 1);
  assert.equal(result.leads[0].evidence.length, 3);
  assert.equal(result.leads[0].avatarUrl, sender.avatar);
  assert.equal(result.leads[0].evidence.find(e => e.type === "follow").quote, "");
  assert.deepEqual(result.nextCursor, { notifications: 3, live: 8 });
  assert.equal(analyzed[0].comments[0].evidence.length, 3);
  assert.equal(calls.filter(c => c === "live-start").length, 1);
});

test("partial live failure preserves its cursor and still analyzes notification signals", async () => {
  const source = createDouyinInteractionSource({
    cloudRegistry: { getService: () => ({ startLivePolling: async () => ({ ok: false, error: { code: "NOT_READY" } }) }) },
    commentSource: { scan: async () => ({ nextCursor: 9, leads: [] }) },
    analyzer: { analyze: async () => { throw new Error("No signals to analyze"); } }
  });
  const result = await source.scan({ agentId: context.agentId, account, cursor: { notifications: 3, live: 5 } });
  assert.deepEqual(result.nextCursor, { notifications: 9, live: 5 });
  assert.equal(result.snapshot.sources.live.state, "degraded");
});

test("an offline livestream is waiting, not a degraded acquisition source", async () => {
  const source = createDouyinInteractionSource({
    cloudRegistry: { getService: () => ({
      livePollingStatus: async () => ({ ok: true, live_state: "offline" }),
      startLivePolling: async () => { throw new Error("must not start polling while offline"); },
      pullLiveMessages: async () => ({ messages: [] })
    }) },
    commentSource: { scan: async () => ({ nextCursor: 9, leads: [] }) },
    analyzer: { analyze: async () => ({ source: "model", items: [] }) }
  });
  const result = await source.scan({ agentId: context.agentId, account, cursor: { notifications: 3, live: 5 } });
  assert.equal(result.snapshot.sources.notifications.state, "listening");
  assert.deepEqual(result.snapshot.sources.live, { state: "waiting", count: 0, reason: "not_live" });
});

test("non-verbal interaction alone cannot become high intent even when a model over-scores it", async () => {
  const source = createDouyinInteractionSource({
    cloudRegistry: { getService: () => ({}) },
    commentSource: { scan: async () => ({ nextCursor: 2, leads: [{ secUid: "person", source: { type: "follow" }, evidence: [{ eventId: "f", type: "follow", quote: "" }] }] }) },
    analyzer: { analyze: async () => ({ source: "model", items: [{ index: 0, score: 99, tier: "high" }] }) }
  });
  const result = await source.scan({ agentId: context.agentId, account, goal: "Find customers" });
  assert.equal(result.leads[0].tier, "low");
  assert.ok(result.leads[0].score < 80);
});

test("real prospect facts are sourced from interaction evidence and account data", async () => {
  const calls = [];
  const source = createDouyinInteractionSource({
    cloudRegistry: { getService: () => ({}) },
    commentSource: { scan: async () => ({ nextCursor: 4, leads: [{
      secUid: "customer-facts",
      nickname: "客户甲",
      evidence: [{ eventId: "comment-facts", type: "comment", quote: "想问上海门店的价格" }]
    }] }) },
    profileDataClient: {
      profile: async (secUid) => {
        calls.push(["profile", secUid]);
        return { data: { nickname: "客户甲", province: "上海", city: "浦东", ip_location: "上海", follower_count: 12, verify: "个人认证" } };
      },
      videosLatest: async (secUid) => {
        calls.push(["videosLatest", secUid]);
        return { data: { items: [{ aweme_id: "video-facts", desc: "新能源车体验" }] } };
      }
    },
    analyzer: { analyze: async (input) => {
      calls.push(["analysisInput", input.comments[0].profile, input.comments[0].recentWorks]);
      return {
        source: "model",
        provider: "test-provider",
        model: "test-model",
        items: [{
          index: 0,
          score: 91,
          tier: "high",
          reason: "明确询价",
          traits: [{ label: "关注车型", value: "新能源车", evidence: "最近作品主题为新能源车体验" }]
        }]
      };
    } },
    now: () => "2026-09-11T10:00:00.000Z"
  });
  const result = await source.scan({ agentId: context.agentId, account, goal: "Find customers" });
  const customer = result.leads[0];
  assert.deepEqual(calls.slice(0, 2), [["profile", "customer-facts"], ["videosLatest", "customer-facts"]]);
  assert.deepEqual(calls[2][0], "analysisInput");
  assert.deepEqual(calls[2][1], {
    nickname: "客户甲",
    province: "上海",
    city: "浦东",
    ip_location: "上海",
    follower_count: 12,
    verify: "个人认证",
    location: "上海 浦东"
  });
  assert.deepEqual(calls[2][2], [{ id: "video-facts", title: "新能源车体验", url: "", observedAt: "" }]);
  assert.equal(customer.facts.recentComment.value, "想问上海门店的价格");
  assert.match(customer.facts.activeBehavior.value, /评论1次互动/);
  assert.match(customer.facts.activeBehavior.value, /公开主页最近1条作品/);
  assert.equal(customer.facts.cityRelation.value, "公开主页地域：上海 浦东");
  assert.equal(customer.factAvailability.followedBrands, "unavailable");
  assert.equal(customer.profileData.follower_count, 12);
  assert.equal(customer.profileData.verify, "个人认证");
  assert.equal(customer.contentEvidence[0].id, "video-facts");
  assert.deepEqual(customer.profileTraits, [{
    label: "关注车型",
    value: "新能源车",
    evidence: "最近作品主题为新能源车体验",
    source: "douyin_ai_analysis",
    provider: "test-provider",
    model: "test-model"
  }]);
  assert.equal(customer.enrichment.state, "available");
  assert.equal(result.snapshot.sources.profile.state, "available");
});

test("account data failure degrades enrichment without blocking real interaction facts", async () => {
  const source = createDouyinInteractionSource({
    cloudRegistry: { getService: () => ({}) },
    commentSource: { scan: async () => ({ nextCursor: 5, leads: [{
      secUid: "customer-degraded",
      evidence: [{ eventId: "comment-degraded", type: "comment", quote: "可以发我报价吗" }]
    }] }) },
    profileDataClient: {
      profile: async () => { throw Object.assign(new Error("profile timeout"), { code: "DOUYIN_AGENT_DATA_TIMEOUT" }); },
      videosLatest: async () => { throw Object.assign(new Error("videos unavailable"), { code: "DOUYIN_AGENT_DATA_UNAVAILABLE" }); }
    },
    analyzer: { analyze: async () => ({ source: "model", items: [{ index: 0, score: 86, tier: "high" }] }) }
  });
  const result = await source.scan({ agentId: context.agentId, account, goal: "Find customers" });
  const customer = result.leads[0];
  assert.equal(customer.facts.recentComment.value, "可以发我报价吗");
  assert.equal(customer.factAvailability.followedBrands, "unavailable");
  assert.equal(customer.enrichment.state, "degraded");
  assert.equal(result.snapshot.sources.profile.state, "degraded");
  assert.equal(result.snapshot.sources.profile.failed, 2);
});

async function fixture(t, overrides = {}) {
  const dir = await mkdtemp(join(tmpdir(), "byering-comprehensive-"));
  let day = "2026-09-07T10:00:00Z";
  let fail = false;
  let batch = [];
  const sends = [];
  const source = { scan: async () => ({ leads: batch, nextCursor: { notifications: 1, live: 1 }, snapshot: {} }) };
  const options = {
    stateFile: join(dir, "state.json"), now: () => day, autoResume: false, pollIntervalMs: 100000,
    interactionSource: source, prospectService: { discover: async () => { throw new Error("Must use interaction source"); } },
    cloudRegistry: {
      status: async () => fail ? { state: "OFFLINE", login_state: "logged_out", worker: { online: false } } : { state: "ONLINE", login_state: "logged_in", account },
      getService: () => ({ sendPrivateMessage: async p => { sends.push(p); return { ok: true, state: "sent" }; }, pullMessages: async () => ({ messages: [{ msg_id: "reply-1", sender, content: { text: "Yes" } }] }) })
    },
    ...overrides
  };
  const service = createDouyinAcquisitionService(options);
  t.after(async () => { service.close(); await rm(dir, { recursive: true, force: true }); });
  const task = service.createTask(context, config);
  await service.start(task.key, { runImmediately: false });
  return { service, task, sends, options, setBatch: v => { batch = v; }, setDay: v => { day = v; }, setFail: v => { fail = v; } };
}
const lead = (id, score = 90) => ({ id, secUid: id, nickname: id, text: "Can I book a consultation?", source: { type: "live_chat" }, evidence: [{ type: "live_chat", quote: "Can I book a consultation?" }], score, tier: score >= 80 ? "high" : "low" });

test("authorized account acquisition runs without the legacy public collector", async (t) => {
  const f = await fixture(t, { prospectService: null });
  f.setBatch([lead("authorized-account-customer")]);

  const result = await f.service.runOnce(f.task.key);

  assert.equal(result.ok, true);
  assert.equal(result.newCandidates, 1);
  assert.equal(f.service.executionArchitecture().authorizedAccountExecution.configured, true);
  assert.equal(f.service.executionArchitecture().legacyPublicCommentCollection.configured, false);
});

test("received private replies are written back to prospect conversation facts", async t => {
  const f = await fixture(t, {
    cloudRegistry: {
      status: async () => ({ state: "ONLINE", login_state: "logged_in", account }),
      getService: () => ({
        sendPrivateMessage: async () => ({ ok: true, state: "sent" }),
        pullMessages: async () => ({
          messages: [{ msg_id: "prospect-reply", sender: { sec_uid: "a", nickname: "a" }, content: { text: "方便的话发我试驾时间" } }],
          next_cursor: 1
        })
      })
    }
  });
  f.setBatch([lead("a")]);
  await f.service.runOnce(f.task.key);
  const task = f.service.status(f.task.key);
  const candidate = task.approvalQueue[0].lead;
  assert.equal(candidate.facts.storeConversation.value, "方便的话发我试驾时间");
  assert.equal(candidate.facts.storeConversation.source, "douyin_private_message");
  assert.equal(candidate.factAvailability.storeConversation, "available");
});

test("live bridge uses the published channel API endpoints and cursor contract", async t => {
  const calls = [];
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    calls.push({ method: req.method, url: req.url, body: JSON.parse(body || "{}") });
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: true, messages: [], next_cursor: 7 }));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const service = createDouyinMcpService({ sessionId: "session", apiKey: "test", channelServerUrl: `http://127.0.0.1:${server.address().port}` });
  t.after(async () => { service.close(); await new Promise(resolve => server.close(resolve)); });
  await service.startLivePolling({ pollingId: "poll", reqId: "start" });
  await service.pullLiveMessages({ cursor: 3, limit: 10 });
  await service.stopLivePolling({ reqId: "stop" });
  assert.deepEqual(calls, [
    { method: "POST", url: "/v1/sessions/session/live-polling/start", body: { req_id: "start", polling_id: "poll", timeout_ms: 10000 } },
    { method: "GET", url: "/v1/sessions/session/live-messages?cursor=3&max=10&wait_ms=0", body: {} },
    { method: "POST", url: "/v1/sessions/session/live-polling/stop", body: { req_id: "stop", timeout_ms: 10000 } }
  ]);
});

test("persisted multi-stream progress and recipient dedup survive process reconstruction", async t => {
  const f = await fixture(t);
  f.setBatch([lead("a")]);
  await f.service.runOnce(f.task.key);
  f.service.close();
  const restored = createDouyinAcquisitionService(f.options);
  assert.deepEqual(restored.status(f.task.key).cursor, { notifications: 1, live: 1 });
  try {
    await restored.resumePersisted({ runImmediately: true });
    assert.equal(f.sends.length, 1);
    assert.equal(restored.status(f.task.key).state, "running");
  } finally { restored.close(); }
});

test("continuous acquisition sends once per customer, keeps replies running, and resets daily quota", async t => {
  const f = await fixture(t);
  f.setBatch([lead("a"), lead("b")]);
  await f.service.runOnce(f.task.key);
  assert.equal(f.sends.length, 1);
  assert.equal(f.service.status(f.task.key).state, "running");
  assert.equal(f.service.status(f.task.key).approvalQueue[1].state, "approved");
  f.setDay("2026-09-08T10:00:00Z");
  await f.service.runOnce(f.task.key);
  assert.equal(f.sends.length, 2);
  await f.service.runOnce(f.task.key);
  assert.equal(f.sends.length, 2);
});

test("new evidence can promote a previously low-intent customer", async t => {
  const f = await fixture(t);
  f.setBatch([lead("a", 10)]);
  await f.service.runOnce(f.task.key);
  assert.equal(f.sends.length, 0);
  f.setBatch([lead("a", 95)]);
  await f.service.runOnce(f.task.key);
  assert.equal(f.sends.length, 1);
});

test("opt-out received before the send window suppresses first contact", async t => {
  const f = await fixture(t, { cloudRegistry: {
    status: async () => ({ state: "ONLINE", login_state: "logged_in", account }),
    getService: () => ({
      pullMessages: async () => ({ messages: [{ msg_id: "optout", sender: { sec_uid: "a" }, content: { text: "不要再联系我" } }] }),
      sendPrivateMessage: async () => { assert.fail("Must not contact an opted-out recipient"); }
    })
  } });
  f.setBatch([lead("a")]);
  await f.service.runOnce(f.task.key);
  const result = f.service.status(f.task.key);
  assert.equal(result.approvalQueue[0].state, "stopped");
  assert.ok(result.suppressedRecipients.a);
});

test("authorization loss degrades rather than closes the task and recovers after authorization", async t => {
  const f = await fixture(t);
  f.setFail(true);
  await f.service.runOnce(f.task.key);
  assert.equal(f.service.status(f.task.key).state, "degraded");
  assert.ok(f.service.status(f.task.key).lastError);
  f.setFail(false);
  await f.service.runOnce(f.task.key);
  assert.equal(f.service.status(f.task.key).state, "running");
});

test("stopping during a scan prevents sending and stops managed intake", async t => {
  let release;
  const wait = new Promise(resolve => { release = resolve; });
  let entered;
  const ready = new Promise(resolve => { entered = resolve; });
  const f = await fixture(t, { interactionSource: { scan: async () => { entered(); await wait; return { leads: [lead("a")] }; } } });
  const running = f.service.runOnce(f.task.key);
  await ready;
  await f.service.stop(f.task.key);
  release();
  await running;
  assert.equal(f.sends.length, 0);
  assert.equal(f.service.status(f.task.key).state, "stopped");
});
