import assert from "node:assert/strict";
import test from "node:test";

import {
  ONBOARDING_COMPLETED_KEY,
  hasCompletedOnboarding,
  markOnboardingCompleted,
  onboardingRoute,
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
    "mkt-find-people",
    "mkt-dm-inbox"
  ]);
});

test("active onboarding Agents disclose their setup requirements", () => {
  const publicFinder = FIRST_TASK_OPTIONS.find((option) => option.agentId === "mkt-find-people");
  const inbox = FIRST_TASK_OPTIONS.find((option) => option.agentId === "mkt-dm-inbox");
  assert.match(publicFinder.requirement, /公开找人无需授权/);
  assert.match(inbox.requirement, /连接抖音账号/);
});
