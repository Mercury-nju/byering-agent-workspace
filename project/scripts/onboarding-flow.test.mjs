import assert from "node:assert/strict";
import test from "node:test";

import {
  onboardingTaskSeed,
  routeAfterAuthorization,
  routeAfterAuthLater,
  routeAfterTeamPreparation
} from "../src/salebuddy/onboarding/flow.js";

const sampleMatch = {
  businessType: "电商卖货",
  goalLabels: ["找到高意向客户", "联系潜在客户"],
  primaryGoal: { label: "找到高意向客户" },
  workflowName: "找人并触达工作流",
  taskObjective: "优先找出更有成交可能的客户；为高匹配客户准备并执行首次联系",
  industryFocus: "商品兴趣与购买意向",
  agents: [{ name: "幕僚长" }, { name: "线索挖掘员" }]
};

test("find-only onboarding enters Agent Center without starting a task", () => {
  assert.equal(routeAfterTeamPreparation({ requiresAccess: false }), "?page=agent-square");
});

test("outreach onboarding continues to the required account authorization", () => {
  assert.equal(routeAfterTeamPreparation({ requiresAccess: true }), "?page=onboarding&step=auth");
});

test("successful authorization returns the user to Agent Center", () => {
  assert.equal(routeAfterAuthorization(), "?page=agent-square&onboardingAuth=authorized");
});

test("postponing authorization still returns the user to Agent Center", () => {
  assert.equal(routeAfterAuthLater(), "?page=agent-square&onboardingAuth=skipped");
});

test("authorized onboarding creates a task handoff for realtime work", () => {
  const seed = onboardingTaskSeed(sampleMatch, { authorized: true });

  assert.equal(seed.status, "progress");
  assert.equal(seed.runtimeAgentName, "main");
  assert.match(seed.title, /找到高意向客户/);
  assert.match(seed.preview, /新手引导目标/);
  assert.equal(seed.runtimeEvents.length, 3);
  assert.match(seed.runtimeEvents[1], /2 位数字员工/);
});

test("skipped authorization creates a waiting handoff instead of a blank realtime work page", () => {
  const seed = onboardingTaskSeed(sampleMatch, { authorized: false });

  assert.equal(seed.status, "approval");
  assert.equal(seed.runtimeProgress, 0);
  assert.match(seed.preview, /等待抖音账号授权/);
  assert.equal(seed.runtimeEvents.length, 1);
});
