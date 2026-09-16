export { IDENTITY_OPTIONS } from "./identity-options.js";
export { GOAL_OPTIONS } from "./goal-options.js";
export { agentNameForIndustry, goalOptionsForIndustry } from "./industry-variants.js";
export { createIdentitySelection } from "./IdentitySelection.js";
export { createGoalSelection } from "./GoalSelection.js";
export { FIRST_TASK_OPTIONS, createTaskSelection } from "./TaskSelection.js";
export { renderOnboardingPage } from "./OnboardingPage.js";
export { buildOnboardingMatch, onboardingMatchFromStorage } from "./matching.js";
export {
  ONBOARDING_COMPLETED_KEY,
  ONBOARDING_FIRST_AGENT_KEY,
  hasCompletedOnboarding,
  markOnboardingCompleted,
  onboardingRoute,
  routeForRetiredPage,
  routeAfterAuthentication,
  routeAfterOnboarding
} from "./entry.js";
