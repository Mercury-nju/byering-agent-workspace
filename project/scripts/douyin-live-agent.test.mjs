import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDouyinAcquisitionService } from "../backend/douyin-acquisition-service.js";
import { createDouyinInteractionSource } from "../backend/douyin-interaction-source.js";
import { buildFinderLiveTaskPayload, buildLiveLeadTaskPayload, validateLiveLeadSetup } from "../src/salebuddy/ui/comment-acquisition-config.js";
import { isImplementedMarketplaceAgent, isMarketplaceAgentAvailable, listActivatedMarketplaceAgents } from "../src/salebuddy/agents/marketplace.js";
import { readFileSync } from "node:fs";
import { buildCommentAcquisitionResultRecord } from "../src/salebuddy/ui/comment-acquisition-results.js";

const id = "mkt-live-lead-miner";
test("legacy live Agent remains implemented but is not active in the focused Agent Center", () => {
  assert.equal(isImplementedMarketplaceAgent(id), true);
  assert.equal(isMarketplaceAgentAvailable(id), false);
  assert.equal(listActivatedMarketplaceAgents().some(agent => agent.id === id), false);
});

test("legacy live setup compatibility maps to the finder live listener", () => {
  const flow = { agentId: id, accountId: "owner", accountIdentity: { secId: "owner" }, product: "想购买家具的人", taskId: "task-live", taskRunId: "run-live" };
  assert.equal(validateLiveLeadSetup(flow), null);
  assert.ok(validateLiveLeadSetup({ product: "goal" }));
  const payload = buildLiveLeadTaskPayload(flow);
  assert.equal(payload.agentId, "mkt-find-people");
  assert.equal(payload.executionAgentId, "mkt-comment-acquisition");
  assert.equal(payload.config.sourceScope.kind, "authorized_account_live");
  assert.equal(payload.config.discoveryOnly, true);
});

test("finder live setup keeps result ownership with the finder and delegates only cloud execution", () => {
  const payload = buildFinderLiveTaskPayload({
    accountId: "owner",
    accountIdentity: { secId: "owner" },
    product: "想购买家具的人",
    taskId: "task-finder-live",
    taskRunId: "run-finder-live"
  });

  assert.equal(payload.agentId, "mkt-find-people");
  assert.equal(payload.executionAgentId, "mkt-comment-acquisition");
  assert.equal(payload.config.sourceScope.kind, "authorized_account_live");
  assert.equal(payload.config.discoveryOnly, true);
  assert.equal(payload.config.approvalMode, "manual");
});

test("legacy live UI remains historical-only and cannot bypass the active-agent guard", () => {
  const source = readFileSync(new URL("../src/salebuddy/ui/agent-square.js", import.meta.url), "utf8");
  const start = source.indexOf("function renderLiveLeadSetup");
  const end = source.indexOf("function renderCommentAcquisitionSetup", start);
  assert.ok(start > 0 && end > start);
  const setup = source.slice(start, end);
  assert.match(setup, /acquisitionAccountControl\(flow\)/);
  assert.match(setup, /validateLiveLeadSetup\(flow\)/);
  assert.doesNotMatch(setup, /小满|商品点击|回放评论|flow\.message/);
  assert.match(source, /function openUseFlow\(agent, resumeFlow = null\) \{\s*if \(!agent \|\| !isFirstReleaseAgent\(agent\)\)/);
  assert.match(source, /function startUse\(agent\) \{\s*const flow = state\.useFlow;\s*if \(!agent \|\| !isFirstReleaseAgent\(agent\)\)/);
  assert.match(source, /isLongRunningAcquisitionAgent\(agent\)[\s\S]*startCommentAcquisition\(agent, flow\)/);
});

test("finder live listener consumes real-adapter messages without comment scanning or private sends", async t => {
  const directory = await mkdtemp(join(tmpdir(), "byering-live-agent-"));
  const calls = [];
  let timeout = false;
  const mcp = {
    startLivePolling: async () => { calls.push("start"); return { ok: true }; },
    stopLivePolling: async () => { calls.push("stop"); return { ok: true }; },
    pullLiveMessages: async ({ cursor }) => {
      calls.push(["pull", cursor]);
      if (timeout) return { ok: false, error: { code: "worker_timeout", message: "Live worker unavailable" } };
      return { ok: true, messages: [{ msg_id: "msg-live", sender: { sec_uid: "customer", nickname: "Customer", avatar: "https://example.com/avatar.png" }, content: { text: "有现货吗？想买" }, room_id: "room-1" }], next_cursor: 4 };
    },
    pullNotifications: async () => assert.fail("Live-only must not scan comments"),
    sendPrivateMessage: async () => assert.fail("Live discovery must not send private messages"),
    pullMessages: async () => assert.fail("Live discovery must not read private messages")
  };
  const cloud = { getService: () => mcp, status: async () => ({ state: "ONLINE", login_state: "logged_in", account: { secId: "owner" } }) };
  const source = createDouyinInteractionSource({ cloudRegistry: cloud, analyzer: { analyze: async () => ({ source: "model", items: [{ index: 0, tier: "high", score: 93, reason: "明确想购买", confidence: 0.95 }] }) } });
  const service = createDouyinAcquisitionService({ stateFile: join(directory, "state.json"), autoResume: false, pollIntervalMs: 100000, cloudRegistry: cloud, interactionSource: source, prospectService: { discover: async () => assert.fail("Must use live adapter") } });
  t.after(async () => { service.close(); await rm(directory, { recursive: true, force: true }); });
  const payload = buildLiveLeadTaskPayload({ accountId: "owner", accountIdentity: { secId: "owner" }, product: "想买家具的人", taskId: "task-live", taskRunId: "run-live" });
  const task = service.createTask(payload, payload.config);
  await service.start(task.key, { runImmediately: false });
  await service.runOnce(task.key);
  let snapshot = service.status(task.key);
  assert.equal(snapshot.counters.candidates, 1);
  assert.equal(snapshot.approvalQueue.length, 0);
  assert.equal(snapshot.resultSnapshot.leads[0].avatarUrl, "https://example.com/avatar.png");
  assert.equal(snapshot.resultSnapshot.leads[0].source.roomId, "room-1");
  assert.deepEqual(snapshot.cursor, { notifications: 0, live: 4 });
  assert.equal(snapshot.lastScan.sources.notifications, undefined);
  const record = buildCommentAcquisitionResultRecord({ agentId: "mkt-find-people" }, snapshot);
  assert.equal(record.source, "抖音直播间新互动");
  assert.equal(record.agentName, "找客专员");
  assert.equal(record.candidateEvidence[0].evidence[0].type, "live_chat");
  await service.runOnce(task.key);
  assert.equal(service.status(task.key).counters.candidates, 1);
  timeout = true;
  await service.runOnce(task.key);
  assert.equal(service.status(task.key).state, "degraded");
  timeout = false;
  await service.runOnce(task.key);
  assert.equal(service.status(task.key).state, "running");
  await service.stop(task.key);
  assert.ok(calls.includes("stop"));
  assert.equal(service.status(task.key).state, "stopped");
});

test("stopping a live task stops only the scoped Douyin cloud session", async () => {
  const calls = [];
  const source = createDouyinInteractionSource({
    cloudRegistry: {
      getService(agentId, scope) {
        calls.push({ agentId, scope });
        return { stopLivePolling: async () => ({ ok: true }) };
      }
    }
  });

  await source.stop({
    agentId: "mkt-comment-acquisition",
    tenantId: "tenant-1",
    accountId: "account-b",
    accountIdentity: { secUid: "sec-account-b" }
  });

  assert.deepEqual(calls, [{
    agentId: "mkt-comment-acquisition",
    scope: {
      tenantId: "tenant-1",
      accountId: "account-b",
      accountIdentity: { secUid: "sec-account-b" }
    }
  }]);
});
