import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DOUYIN_ACQUISITION_ACTIVE_AGENT_IDS, getMarketplaceAgent } from "../src/salebuddy/agents/marketplace.js";
import { FIRST_TASK_OPTIONS } from "../src/salebuddy/onboarding/TaskSelection.js";

const source = await readFile(new URL("../src/salebuddy/onboarding/OnboardingPage.js", import.meta.url), "utf8");
const taskSelection = await readFile(new URL("../src/salebuddy/onboarding/TaskSelection.js", import.meta.url), "utf8");
const onboardingIndex = await readFile(new URL("../src/salebuddy/onboarding/index.js", import.meta.url), "utf8");
const appEntry = await readFile(new URL("../src/salebuddy/index.js", import.meta.url), "utf8");

test("onboarding renders the real Agent task selector instead of the retired business questionnaire", () => {
  assert.match(source, /createTaskSelection/);
  assert.doesNotMatch(source, /createIdentitySelection|createGoalSelection|createTeamPreparation|createDouyinAuthorization/);
  assert.doesNotMatch(source, /onboarding-identity-hero|onboarding-goal-hero/);
});

test("first-task choices point to executable Agent Square capabilities", () => {
  assert.match(taskSelection, /getMarketplaceAgent/);
  assert.equal(DOUYIN_ACQUISITION_ACTIVE_AGENT_IDS.length, 7);
  assert.deepEqual(
    FIRST_TASK_OPTIONS.map((option) => option.agentId),
    ["mkt-comment-acquisition", "mkt-find-people", "mkt-dm-inbox"]
  );
  assert.equal(FIRST_TASK_OPTIONS.length, 3);
  for (const option of FIRST_TASK_OPTIONS) {
    assert.equal(option.description, getMarketplaceAgent(option.agentId)?.desc);
  }
  assert.equal(FIRST_TASK_OPTIONS.find((option) => option.agentId === "mkt-find-people")?.category, "找人");
  assert.match(taskSelection, /sb-onboarding-v2-task-avatar/);
  assert.doesNotMatch(taskSelection, /sb-onboarding-v2-story/);
  assert.match(taskSelection, /mountGrokBotAvatar/);
  assert.doesNotMatch(taskSelection, /account-manager-885cf5|talent-scout-3c82f6|inbox-manager-6464ef-notifying/);
  for (const legacyAgentId of ["mkt-lead-miner", "mkt-douyin-finder", "mkt-comment-filter"]) {
    assert.doesNotMatch(taskSelection, new RegExp(legacyAgentId));
  }
  for (const unavailableAgentId of ["mkt-intent-analyst", "mkt-cold-writer"]) {
    assert.doesNotMatch(taskSelection, new RegExp(unavailableAgentId));
  }
});

test("the selected onboarding Agent is passed into Agent Square", () => {
  assert.match(appEntry, /const initialAgentId = params\.get\("agent"\)/);
  assert.match(appEntry, /openAgentSquare\?\.\(\{ initialAgentId \}\)/);
  assert.match(appEntry, /routeAfterOnboarding\(selectedAgentId\)/);
});

test("the active onboarding barrel does not re-export retired global authorization screens", () => {
  assert.doesNotMatch(onboardingIndex, /createTeamPreparation/);
  assert.doesNotMatch(onboardingIndex, /createDouyinAuthorization/);
});
