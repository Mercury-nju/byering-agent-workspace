import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TASK_FLOW_CSS } from "../src/salebuddy/ui/task-choices.js";

const reception = readFileSync(new URL("../src/salebuddy/ui/account-reception-page.js", import.meta.url), "utf8");
function rule(source, selector) {
  const start = source.indexOf(`${selector}{`);
  assert.ok(start >= 0, selector);
  return source.slice(start, source.indexOf("}", start) + 1);
}

test("task selections keep the content surface white and use a clear selected state", () => {
  assert.match(rule(TASK_FLOW_CSS, ".sb-task-choice.is-selected"), /background:#fff;border-color:#2f80ed;box-shadow:inset 3px 0 0 #2f80ed/);
  assert.match(rule(TASK_FLOW_CSS, ".sb-task-choice input"), /accent-color:#2f80ed/);
  assert.match(TASK_FLOW_CSS, /\.sb-consumer-use input\[type=checkbox\],\.sb-consumer-use input\[type=radio\]\{accent-color:#2f80ed\}/);
  assert.match(rule(TASK_FLOW_CSS, ".sb-task-choice:focus-within"), /outline:2px solid/);
});

test("message drafts and previews do not imply success with green fills", () => {
  assert.match(rule(TASK_FLOW_CSS, ".sb-task-message textarea,.sb-consumer-use .sb-as-private-message textarea"), /background:#fff;color:#303030/);
  assert.match(rule(TASK_FLOW_CSS, ".sb-task-message-preview"), /background:#eeeeee/);
  assert.match(rule(reception, ".sb-reception-bubble.is-user"), /background:#e8e8e8/);
});

test("account reception uses the same neutral selection language", () => {
  assert.match(rule(reception, ".sb-reception-option:has(input:checked)"), /background:#fff;border-color:#2f80ed;box-shadow:inset 3px 0 0 #2f80ed/);
  assert.match(rule(reception, ".sb-reception input[type=checkbox],.sb-reception input[type=radio]"), /accent-color:#2f80ed/);
  assert.doesNotMatch(TASK_FLOW_CSS, /#edf7f1|#267955|#eef8f1|#e4f4e9/);
});
