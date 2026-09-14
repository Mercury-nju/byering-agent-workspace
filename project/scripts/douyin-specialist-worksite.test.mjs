import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/salebuddy/ui/agent-square.js", import.meta.url), "utf8");

test("Douyin child Agents render their own specialist worksite shells", () => {
  [
    "renderFinderSpecialistWorksite",
    "renderOutreachSpecialistWorksite",
    "renderConversationSpecialistWorksite",
    "renderAnalysisSpecialistWorksite"
  ].forEach((name) => assert.match(source, new RegExp(`function ${name}\\(`)));

  assert.match(source, /sb-as-specialist-worksite/);
  assert.match(source, /sb-as-specialist-source/);
  assert.match(source, /sb-as-specialist-queue/);
  assert.match(source, /sb-as-specialist-detail/);
});

test("analysis worksite keeps evidence, interpretation, and next step distinct", () => {
  const start = source.indexOf("function renderAnalysisSpecialistWorksite");
  const end = source.indexOf("function renderIntentAnalystRunning", start);
  assert.ok(start >= 0 && end > start);
  const renderer = source.slice(start, end);

  assert.match(renderer, /原始证据/);
  assert.match(renderer, /AI归纳事实/);
  assert.match(renderer, /结论与下一步/);
  assert.match(renderer, /选择触达对象/);
  assert.match(renderer, /查看成果中心/);
});

test("child Agent running branches use the dedicated worksites without touching the manager renderer", () => {
  const renderUseStart = source.indexOf("function renderUse()");
  const renderUseEnd = source.indexOf("function startUse", renderUseStart);
  assert.ok(renderUseStart >= 0 && renderUseEnd > renderUseStart);
  const renderUse = source.slice(renderUseStart, renderUseEnd);

  assert.match(renderUse, /renderConversationSpecialistWorksite\(panel, flow\)/);
  assert.match(renderUse, /renderAnalysisSpecialistWorksite\(panel, flow\)/);
  assert.match(renderUse, /renderOutreachSpecialistWorksite\(panel, flow\)/);
  assert.match(renderUse, /renderFinderSpecialistWorksite\(panel, flow\)/);
  const runningStart = renderUse.indexOf('} else if (flow.step === "running")');
  const runningEnd = renderUse.indexOf('if (flow.step === "running" && !isAccountAnalysisAgent(agent)', runningStart);
  assert.ok(runningStart >= 0 && runningEnd > runningStart);
  const runningBranch = renderUse.slice(runningStart, runningEnd);
  assert.doesNotMatch(runningBranch, /isCommentAcquisitionAgent\(agent\).*render(?:Finder|Outreach|Conversation|Analysis)SpecialistWorksite/s);
});

test("conversation worksite keeps selection IDs stable while showing newest messages first", () => {
  const start = source.indexOf("function renderConversationSpecialistWorksite");
  const end = source.indexOf("function privateOutreachUsesProspectBoundary", start);
  assert.ok(start >= 0 && end > start);
  const renderer = source.slice(start, end);

  assert.match(renderer, /messages\.map\(\(message, index\) => \(\{ message, index \}\)\)\.reverse\(\)/);
  assert.match(renderer, /specialistRow\(message, index, "conversation"/);
});
