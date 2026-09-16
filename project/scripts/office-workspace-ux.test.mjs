import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { officeWorkspaceHeight } from "../src/salebuddy/ui/office-workspace-layout.js";
import { officeWorkState, partitionOfficeMessages } from "../src/salebuddy/ui/office-workspace-state.js";

test("theme reflows presentation viewports instead of forcing a fixed desktop canvas", () => {
  const theme = readFileSync(new URL("../src/salebuddy/ui/ai-shuban-theme.js", import.meta.url), "utf8");
  assert.doesNotMatch(theme, /min-width:1280px/);
  assert.match(theme, /html\[\$\{THEME_ATTRIBUTE\}="ai-shuban"\]\{\s*width:100%;\s*min-width:0;/);
  assert.match(theme, /html\[\$\{THEME_ATTRIBUTE\}="ai-shuban"\] #root\{\s*width:100%;\s*min-width:0;/);
  assert.match(theme, /@media\(max-width:1180px\)/);
  assert.match(theme, /@media\(max-width:920px\)/);
  assert.match(theme, /\.sb-drawer\{[\s\S]*?min-width:0!important;/);
  assert.doesNotMatch(theme, /\.sb-page:has\(\.sb-contacts2\)\{[^}]*left:230px!important/);
  assert.match(theme, /html\[\$\{THEME_ATTRIBUTE\}="ai-shuban"\] \.sb-clist\{\s*width:320px!important;/);
});

test("workspace bottom leaves a visible margin on desktop, scaled and keyboard-reduced viewports", () => {
  assert.equal(officeWorkspaceHeight({ top: 88, width: 426, layoutWidth: 426, viewportHeight: 900 }), 796);
  assert.equal(officeWorkspaceHeight({ top: 88, width: 639, layoutWidth: 426, viewportHeight: 900 }), 530);
  assert.equal(officeWorkspaceHeight({ top: 88, width: 340, viewportHeight: 480, clipBottom: 460 }), 356);
  assert.equal(officeWorkspaceHeight({ top: 500, width: 340, viewportHeight: 480 }), 0);
});

test("unknown state explains querying versus failure without claiming idle or ongoing work", () => {
  const loading = officeWorkState({ metadata: { officeStatus: "unknown", officeStatusPhase: "loading" } });
  const unavailable = officeWorkState({ metadata: { officeStatus: "unknown", officeStatusPhase: "unavailable" } });
  assert.equal(loading.label, "正在获取工作状态");
  assert.equal(unavailable.label, "暂时无法获取工作状态");
  assert.equal(unavailable.retryable, true);
  assert.doesNotMatch(unavailable.reason, /正在重新确认|任务已停止|任务仍在运行/);
});

test("old work reports are separated from conversation without removing user messages", () => {
  const messages = [
    { id: "old", from: "agent", text: "old progress", metadata: { source: "agent-activity", taskId: "old" } },
    { id: "new", from: "agent", text: "current progress", metadata: { source: "agent-activity", taskId: "current" } },
    { id: "user", from: "user", text: "question" },
    { id: "reply", from: "agent", text: "answer", metadata: { companion: { inReplyTo: "user" } } }
  ];
  let result = partitionOfficeMessages(messages, { state: "working", metadata: { taskId: "current" } });
  assert.deepEqual(result.history.map(item => item.id), ["old"]);
  assert.deepEqual(result.current.map(item => item.id), ["new", "user", "reply"]);
  result = partitionOfficeMessages(messages, { metadata: { officeStatus: "unknown" } });
  assert.deepEqual(result.history.map(item => item.id), ["old", "new"]);
  assert.deepEqual(result.current.map(item => item.id), ["user", "reply"]);
});
