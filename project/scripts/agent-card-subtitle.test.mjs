import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../src/salebuddy/ui/agent-square.js", import.meta.url), "utf8");

test("marketplace cards keep the complete responsibility description without a duplicate short purpose", () => {
  assert.doesNotMatch(source, /top\.appendChild\(el\("div", "sb-as-title", title\)\)/);
  assert.match(source, /card\.appendChild\(el\("div", "sb-as-desc", description\)\)/);
  assert.match(source, /title: agent\?\.displayTitle/);
  assert.match(source, /description: agent\.desc/);
});

test("legacy team cards are visibly unavailable instead of pretending to be executable", () => {
  assert.match(source, /const unavailableButton = el\("button", "sb-as-hire sb-disabled", "暂未开放"\)/);
  assert.match(source, /actionButton: buildHireButton\(agent\),\n\s+disabled: !useReady/);
});
