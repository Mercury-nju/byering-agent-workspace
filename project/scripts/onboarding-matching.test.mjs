import assert from "node:assert/strict";
import test from "node:test";

import { buildOnboardingMatch, onboardingMatchFromStorage } from "../src/salebuddy/onboarding/matching.js";
import { goalOptionsForIndustry } from "../src/salebuddy/onboarding/industry-variants.js";

test("onboarding matching uses the internal find-only workflow", () => {
  const match = buildOnboardingMatch({ identityId: "automotive", goalIds: ["high-intent"] });

  assert.equal(match.workflowId, "find_only");
  assert.equal(match.businessType, "汽车服务");
  assert.equal(match.industryFocus, "购车需求与服务意向");
  assert.deepEqual(match.agentIds, [
    "chief_of_staff",
    "acquisition_strategist",
    "lead_miner",
    "lead_analyst",
    "prospect_researcher",
    "risk_specialist"
  ]);
  assert.equal(match.agents.at(-1).legacyType, "Risk Agent");
  assert.equal(match.requiresAccess, false);
});

test("outreach goals select the real outreach workflow and roles", () => {
  const match = buildOnboardingMatch({ identityId: "education", goalIds: ["outreach", "follow-up"] });

  assert.equal(match.workflowId, "find_and_outreach");
  assert.equal(match.requiresAccess, true);
  assert.ok(match.agentIds.includes("outreach_specialist"));
  assert.ok(match.agentIds.includes("outreach_operator"));
  assert.deepEqual(match.goalIds, ["outreach", "follow-up"]);
});

test("industry changes the goal language without changing the core workflow ids", () => {
  const options = goalOptionsForIndustry("automotive");
  const match = buildOnboardingMatch({ identityId: "automotive", goalIds: ["high-intent", "outreach"] });

  assert.equal(options.find((option) => option.id === "high-intent").label, "识别车型购买意向");
  assert.deepEqual(match.goalIds, ["high-intent", "outreach"]);
  assert.deepEqual(match.agentIds.slice(0, 2), ["chief_of_staff", "acquisition_strategist"]);
  assert.equal(match.agents.find((agent) => agent.id === "lead_analyst").name, "车型意向分析师");
  assert.equal(match.agents.find((agent) => agent.id === "outreach_specialist").name, "车主触达策略师");
});

test("industry variants keep the same underlying roles for every business type", () => {
  const education = buildOnboardingMatch({ identityId: "education", goalIds: ["discover-leads"] });
  const commerce = buildOnboardingMatch({ identityId: "commerce", goalIds: ["discover-leads"] });

  assert.equal(education.agents.length, commerce.agents.length);
  assert.equal(education.agents.find((agent) => agent.id === "lead_miner").skill, commerce.agents.find((agent) => agent.id === "lead_miner").skill);
  assert.notEqual(education.agents.find((agent) => agent.id === "lead_miner").name, commerce.agents.find((agent) => agent.id === "lead_miner").name);
});

test("stored matching context is validated before use", () => {
  const valid = buildOnboardingMatch({ identityId: "commerce", goalIds: ["discover-leads"] });
  const storage = { getItem: () => JSON.stringify(valid) };
  assert.deepEqual(onboardingMatchFromStorage(storage), valid);
  assert.equal(onboardingMatchFromStorage({ getItem: () => JSON.stringify({ version: 2, agents: [] }) }), null);
});

test("matching preserves every selected goal for a multi-goal first task", () => {
  const goalIds = ["discover-leads", "high-intent", "outreach", "follow-up", "reactivate", "explore"];
  const match = buildOnboardingMatch({ identityId: "commerce", goalIds });

  assert.deepEqual(match.goalIds, goalIds);
  assert.equal(match.goalLabels.length, goalIds.length);
  assert.match(match.taskObjective, /发现更多匹配的潜在客户/);
  assert.match(match.taskObjective, /重新激活有机会的老客户/);
});
