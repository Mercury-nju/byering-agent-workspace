import assert from "node:assert/strict";
import test from "node:test";

import {
  ONBOARDING_COMPLETED_KEY,
  hasCompletedOnboarding,
  markOnboardingCompleted,
  onboardingRoute,
  routeForRetiredPage,
  routeAfterAuthentication,
  routeAfterOnboarding
} from "../src/salebuddy/onboarding/entry.js";
import { FIRST_TASK_OPTIONS } from "../src/salebuddy/onboarding/TaskSelection.js";

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.get(key) || null; },
    setItem(key, value) { values.set(key, String(value)); }
  };
}

test("new users are routed to the first-task selection after authentication", () => {
  assert.equal(routeAfterAuthentication(createStorage()), "?page=onboarding");
  assert.equal(onboardingRoute(), "?page=onboarding");
});

test("retired product routes redirect to Agent Square", () => {
  assert.equal(routeForRetiredPage("chat"), "?page=agent-square");
  assert.equal(routeForRetiredPage("kanban"), "?page=agent-square");
  assert.equal(routeForRetiredPage("knowledge"), "?page=agent-square");
  assert.equal(routeForRetiredPage("memory"), null);
  assert.equal(routeForRetiredPage("agent-square"), null);
  assert.equal(routeForRetiredPage(null), null);
});

test("completed users go directly to Agent Square", () => {
  const storage = createStorage({ [ONBOARDING_COMPLETED_KEY]: "1" });
  assert.equal(hasCompletedOnboarding(storage), true);
  assert.equal(routeAfterAuthentication(storage), "?page=agent-square");
});

test("explicit authentication state overrides stale browser onboarding state", () => {
  const storage = createStorage({ [ONBOARDING_COMPLETED_KEY]: "1" });
  assert.equal(
    routeAfterAuthentication(storage, { isNewUser: true }),
    "?page=onboarding"
  );
  assert.equal(
    routeAfterAuthentication(createStorage(), { isNewUser: false }),
    "?page=agent-square"
  );
});

test("finishing onboarding opens the selected real Agent flow", () => {
  const storage = createStorage();
  assert.equal(markOnboardingCompleted(storage), true);
  assert.equal(hasCompletedOnboarding(storage), true);
  assert.equal(routeAfterOnboarding(), "?page=agent-square&onboarding=complete");
  assert.equal(
    routeAfterOnboarding("mkt-find-people"),
    "?page=agent-square&onboarding=complete&agent=mkt-find-people"
  );
  assert.equal(routeAfterOnboarding("mkt-douyin-finder"), "?page=agent-square&onboarding=complete");
});

test("first-task onboarding uses the active executable Agents as Agent Center", () => {
  assert.deepEqual(FIRST_TASK_OPTIONS.map(({ agentId }) => agentId), [
    "mkt-comment-acquisition",
    "mkt-gold-customer-service",
    "mkt-live-danmaku-analysis",
    "mkt-viral-work-analysis",
    "mkt-live-danmaku-outreach"
  ]);
});

test("active onboarding Agents disclose their setup requirements", () => {
  const goldCustomerService = FIRST_TASK_OPTIONS.find((option) => option.agentId === "mkt-gold-customer-service");
  const liveAnalysis = FIRST_TASK_OPTIONS.find((option) => option.agentId === "mkt-live-danmaku-analysis");
  const viralAnalysis = FIRST_TASK_OPTIONS.find((option) => option.agentId === "mkt-viral-work-analysis");
  assert.match(goldCustomerService.requirement, /新私信/);
  assert.match(liveAnalysis.requirement, /新弹幕/);
  assert.match(viralAnalysis.requirement, /作品链接/);
});

test("standalone first-task Agents can enter Agent Square directly", () => {
  assert.equal(
    routeAfterOnboarding("mkt-viral-work-analysis"),
    "?page=agent-square&onboarding=complete&agent=mkt-viral-work-analysis"
  );
});
