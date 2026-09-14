import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const userEntrySources = [
  "../src/salebuddy/ui/agent-square.js",
  "../src/salebuddy/ui/realtime-work.js",
  "../src/salebuddy/ui/task-runner.js"
].map((file) => readFileSync(new URL(file, import.meta.url), "utf8"));

test("user-facing cloud entry points do not expose supplier billing choices", () => {
  for (const source of userEntrySources) {
    assert.doesNotMatch(source, /billingPlan\s*:/);
    assert.doesNotMatch(source, /billing_plan\s*:/);
    assert.doesNotMatch(source, /按量|包月/);
  }
});
