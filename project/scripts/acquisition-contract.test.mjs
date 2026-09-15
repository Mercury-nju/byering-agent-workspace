import assert from "node:assert/strict";
import test from "node:test";

import {
  TASK_STATES,
  CLOUD_STATES,
  APPROVAL_MODES,
  TOUCH_STATES,
  EVENT_TYPES,
  CAPABILITY_PROBE_STATES,
  canTransitionTask,
  transitionTask,
  canTransitionTouch,
  transitionTouch,
  canTransitionCloud,
  transitionCloud,
  canTransitionCapabilityProbe,
  transitionCapabilityProbe,
  TOUCH_TRANSITION_GRAPH,
  normalizeAcquisitionTaskStatus
} from "../src/salebuddy/agents/acquisition-contract.js";
import {
  MARKETPLACE_AGENTS,
  IMPLEMENTED_MARKETPLACE_AGENT_IDS,
  DOUYIN_ACQUISITION_COMPLETE_AGENT_ID,
  DOUYIN_ACQUISITION_SINGLE_CAPABILITY_AGENT_IDS,
  DOUYIN_ACQUISITION_WORKFLOW,
  douyinAcquisitionBindingAgentId,
  isDouyinAcquisitionSingleCapabilityAgent,
  getMarketplaceAgent,
  isMarketplaceAgentAvailable,
  sortMarketplaceAgentsForDisplay
} from "../src/salebuddy/agents/marketplace.js";
import { getAcquisitionCapabilityReadiness, persistCapabilityProbe, readPersistedCapabilityProbe } from "../src/salebuddy/agents/acquisition-capability.js";

test("acquisition contract exposes canonical states and rejects illegal task transitions", () => {
  assert.deepEqual(APPROVAL_MODES, { MANUAL: "manual", BATCH: "batch", AUTO: "auto" });
  assert.equal(TASK_STATES.RUNNING, "running");
  assert.equal(CLOUD_STATES.PROVISIONING, "provisioning");
  assert.equal(CAPABILITY_PROBE_STATES.PASSED, "passed");
  assert.ok(EVENT_TYPES.TOUCH_SUBMITTED);
  assert.equal(canTransitionTask("configuring", "running"), true);
  assert.equal(canTransitionTask("configuring", "paused"), false);
  assert.equal(transitionTask("configuring", "running"), "running");
  assert.throws(() => transitionTask("configuring", "paused"), /Illegal task transition/);
  assert.throws(() => transitionTask("error", "stopped"), /Illegal task transition/);
  assert.deepEqual(normalizeAcquisitionTaskStatus("degraded"), { taskState: "degraded", runtimeState: "RUNNING", health: "DEGRADED" });
});

test("touch approval contract keeps draft and send states separate", () => {
  assert.equal(canTransitionTouch(TOUCH_STATES.DRAFT, TOUCH_STATES.PENDING_APPROVAL), true);
  assert.equal(canTransitionTouch(TOUCH_STATES.DRAFT, TOUCH_STATES.SUBMITTED), false);
  assert.equal(transitionTouch(TOUCH_STATES.UNKNOWN, TOUCH_STATES.DELIVERY_CHECKING), TOUCH_STATES.DELIVERY_CHECKING);
  assert.throws(() => transitionTouch(TOUCH_STATES.DRAFT, TOUCH_STATES.DELIVERED), /Illegal touch transition/);
  assert.throws(() => transitionTouch(TOUCH_STATES.SUBMITTED, TOUCH_STATES.DELIVERED), /Illegal touch transition/);
});

test("cloud and capability probe contracts reject illegal transitions", () => {
  assert.equal(canTransitionCloud("provisioning", "online"), true);
  assert.equal(canTransitionCloud("provisioning", "connecting"), false);
  assert.equal(transitionCloud("online", "disconnected"), "disconnected");
  assert.throws(() => transitionCloud("online", "provisioning"), /Illegal cloud transition/);
  assert.equal(canTransitionCapabilityProbe("not_started", "running"), true);
  assert.equal(transitionCapabilityProbe("running", "passed"), "passed");
  assert.throws(() => transitionCapabilityProbe("not_started", "passed"), /Illegal capability probe transition/);
  assert.equal(Object.isFrozen(TOUCH_TRANSITION_GRAPH), true);
  assert.equal(Object.isFrozen(TOUCH_TRANSITION_GRAPH.submitted), true);
});

test("Douyin acquisition exposes one complete-capability Agent and five peer capability Agents", () => {
  const ids = new Set(MARKETPLACE_AGENTS.map(({ id }) => id));
  assert.equal(DOUYIN_ACQUISITION_COMPLETE_AGENT_ID, "mkt-comment-acquisition");
  assert.deepEqual(DOUYIN_ACQUISITION_SINGLE_CAPABILITY_AGENT_IDS, [
    "mkt-find-people",
    "mkt-intent-analyst",
    "mkt-cold-writer",
    "mkt-dm-inbox",
    "mkt-gold-customer-service"
  ]);
  assert.deepEqual(DOUYIN_ACQUISITION_WORKFLOW, [
    { agentId: "mkt-find-people", stage: "find", handoffTo: ["mkt-intent-analyst"] },
    { agentId: "mkt-intent-analyst", stage: "analyze", handoffTo: ["mkt-cold-writer"] },
    { agentId: "mkt-cold-writer", stage: "outreach", handoffTo: ["mkt-dm-inbox"] },
    { agentId: "mkt-dm-inbox", stage: "conversation", handoffTo: [] }
  ]);
  assert.equal(ids.has(DOUYIN_ACQUISITION_COMPLETE_AGENT_ID), true);
  assert.equal(ids.has("mkt-live-lead-miner"), true);
  assert.equal(ids.has("mkt-acquisition"), false);
  assert.equal(ids.has("mkt-lead-acquisition"), false);
  assert.equal(MARKETPLACE_AGENTS.filter(({ id }) => id === "mkt-live-lead-miner").length, 1);
  const completeAgent = getMarketplaceAgent(DOUYIN_ACQUISITION_COMPLETE_AGENT_ID);
  assert.equal(completeAgent.name, "抖音获客管家");
  assert.deepEqual(completeAgent.composition, {
    role: "complete_capability",
    coverage: ["find", "analyze", "outreach", "conversation"]
  });
  assert.deepEqual(completeAgent.profile.composition, completeAgent.composition);
  for (const definition of DOUYIN_ACQUISITION_WORKFLOW) {
    const agent = getMarketplaceAgent(definition.agentId);
    assert.equal(agent.capabilities.independent, true, `${definition.agentId} lost independent execution`);
    assert.equal(agent.parentAgentId, undefined, `${definition.agentId} must not acquire a parent Agent`);
    assert.equal(agent.composition.role, "single_capability", `${definition.agentId} lost its peer product role`);
    assert.equal(agent.workflowStage, definition.stage, `${definition.agentId} workflow stage drifted`);
    assert.deepEqual(agent.handoffTo, definition.handoffTo, `${definition.agentId} handoff target drifted`);
    assert.deepEqual(agent.profile.composition, agent.composition, `${definition.agentId} profile composition drifted`);
  }
  assert.equal(douyinAcquisitionBindingAgentId(DOUYIN_ACQUISITION_COMPLETE_AGENT_ID), DOUYIN_ACQUISITION_COMPLETE_AGENT_ID);
  for (const agentId of DOUYIN_ACQUISITION_SINGLE_CAPABILITY_AGENT_IDS) {
    assert.equal(isDouyinAcquisitionSingleCapabilityAgent(agentId), true, `${agentId} must remain a single capability Agent`);
    assert.equal(douyinAcquisitionBindingAgentId(agentId), agentId, `${agentId} must retain its independent account binding identity`);
  }
  assert.equal(isDouyinAcquisitionSingleCapabilityAgent("mkt-lead-miner"), false);
  assert.equal(douyinAcquisitionBindingAgentId("mkt-lead-miner"), "mkt-lead-miner");
  const orderedIds = sortMarketplaceAgentsForDisplay([
    getMarketplaceAgent("mkt-live-lead-miner"),
    ...DOUYIN_ACQUISITION_SINGLE_CAPABILITY_AGENT_IDS.map(getMarketplaceAgent),
    completeAgent
  ], { isReady: () => true }).map(({ id }) => id);
  assert.deepEqual(orderedIds, [DOUYIN_ACQUISITION_COMPLETE_AGENT_ID, ...DOUYIN_ACQUISITION_SINGLE_CAPABILITY_AGENT_IDS, "mkt-live-lead-miner"]);
  assert.equal(getMarketplaceAgent("mkt-live-lead-miner").name, "直播间找客户");
  assert.equal(isMarketplaceAgentAvailable(DOUYIN_ACQUISITION_COMPLETE_AGENT_ID), true);
  assert.equal(isMarketplaceAgentAvailable("mkt-live-lead-miner"), false);
  assert.deepEqual(IMPLEMENTED_MARKETPLACE_AGENT_IDS, ["mkt-lead-miner", "mkt-comment-filter", "mkt-comment-acquisition", "mkt-dm-inbox", "mkt-gold-customer-service", "mkt-cold-writer", "mkt-douyin-finder", "mkt-find-people", "mkt-user-research", "mkt-live-lead-miner", "mkt-research-expert", "mkt-intent-analyst", "mkt-live-danmaku-analysis", "mkt-live-danmaku-outreach", "mkt-viral-work-analysis"]);
});

test("acquisition capability readiness gates live execution and public replies independently", () => {
  assert.deepEqual(getAcquisitionCapabilityReadiness("commentAcquisition"), { visible: true, hireable: true, startable: true });
  assert.deepEqual(getAcquisitionCapabilityReadiness("commentAcquisition", { state: "passed", executorReady: false }), { visible: true, hireable: true, startable: true });
  assert.deepEqual(getAcquisitionCapabilityReadiness("commentAcquisition", { state: "passed", executorReady: true }), { visible: true, hireable: true, startable: true });
  assert.deepEqual(getAcquisitionCapabilityReadiness("liveAcquisition"), { visible: true, hireable: false, startable: false });
  assert.deepEqual(getAcquisitionCapabilityReadiness("commentPublicReply"), { visible: true, hireable: false, startable: false });
  assert.deepEqual(getAcquisitionCapabilityReadiness("liveAcquisition", { state: "passed", executorReady: false }), { visible: true, hireable: false, startable: false });
  assert.deepEqual(getAcquisitionCapabilityReadiness("liveAcquisition", { state: "passed", executorReady: true }), { visible: true, hireable: true, startable: true });
  assert.deepEqual(getAcquisitionCapabilityReadiness("commentPublicReply", { state: "passed", executorReady: true }), { visible: true, hireable: true, startable: true });
  assert.deepEqual(getAcquisitionCapabilityReadiness("unknown", { state: "passed", executorReady: true }), { visible: true, hireable: false, startable: false });
});

test("capability probes persist and restore through the explicit writer", () => {
  const original = globalThis.localStorage;
  const values = new Map();
  globalThis.localStorage = { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
  try {
    persistCapabilityProbe("liveAcquisition", { state: "passed", executorReady: true, evidence: "real probe" });
    assert.deepEqual(readPersistedCapabilityProbe("liveAcquisition"), { state: "passed", status: "passed", executorReady: true, evidence: "real probe" });
    assert.deepEqual(getAcquisitionCapabilityReadiness("liveAcquisition"), { visible: true, hireable: true, startable: true });
    assert.throws(() => persistCapabilityProbe("unknown", { state: "passed", executorReady: true }), /Unknown acquisition capability/);
  } finally { globalThis.localStorage = original; }
});

test("capability probe writer surfaces storage failures", () => {
  const original = globalThis.localStorage;
  globalThis.localStorage = { getItem: () => null, setItem: () => { throw new Error("quota exceeded"); } };
  try { assert.throws(() => persistCapabilityProbe("liveAcquisition", { state: "passed", executorReady: true }), /Capability probe persistence failed/); }
  finally { globalThis.localStorage = original; }
});

test("the four single-capability Agents remain independently executable", () => {
  for (const id of DOUYIN_ACQUISITION_SINGLE_CAPABILITY_AGENT_IDS) {
    assert.equal(getMarketplaceAgent(id)?.capabilities?.independent ?? true, true, `${id} lost independent capability flag`);
    assert.equal(getMarketplaceAgent(id)?.parentAgentId, undefined, `${id} must not depend on another product Agent`);
  }
});

test("comment prospect miner and cold writer keep independent responsibilities and identities", () => {
  assert.equal(getMarketplaceAgent("mkt-lead-miner").name, "评论区找客户");
  assert.equal(getMarketplaceAgent("mkt-lead-miner").title, "评论区找客户");
  assert.match(getMarketplaceAgent("mkt-lead-miner").desc, /评论/);
  assert.match(getMarketplaceAgent("mkt-lead-miner").desc, /有需求的人/);
  assert.match(getMarketplaceAgent("mkt-lead-miner").desc, /保留账号/);
  assert.equal(getMarketplaceAgent("mkt-cold-writer").name, "潜客触达专员");
  assert.equal(getMarketplaceAgent("mkt-cold-writer").title, "潜客触达专员");
  assert.match(getMarketplaceAgent("mkt-cold-writer").desc, /首轮私信/);
  assert.match(getMarketplaceAgent("mkt-cold-writer").desc, /记录结果/);
});
