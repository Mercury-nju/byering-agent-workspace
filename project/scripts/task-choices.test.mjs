import assert from "node:assert/strict";
import test from "node:test";
import { TASK_CHOICES, compileTaskChoices, updateChoiceSelection } from "../src/salebuddy/ui/task-choices.js";
import { normalizeCommentAcquisitionConfig, validateLiveLeadSetup } from "../src/salebuddy/ui/comment-acquisition-config.js";
import { validateLeadMinerSetup } from "../src/salebuddy/ui/lead-scope.js";
import { buildSurveyInvitation } from "../src/salebuddy/ui/user-research.js";

test("every discovery mode has executable presets without requiring custom text", () => {
  for (const key of ["finder", "audience", "comments", "research", "analysis"]) {
    assert.ok(TASK_CHOICES[key].options.length >= 4);
    for (const option of TASK_CHOICES[key].options) assert.ok(compileTaskChoices(key, { selected: [option.id] }).length > 10);
  }
});

test("finder options and menus become the actual search goal", () => {
  const goal = compileTaskChoices("finder", { selected: ["creators"], industry: "家居家装", region: "上海", followers: "1 万以上", extra: "最近一个月有更新" });
  assert.match(goal, /创作者/);
  assert.match(goal, /家居家装/);
  assert.match(goal, /上海/);
  assert.match(goal, /粉丝.*1 万以上/);
  assert.match(goal, /最近一个月有更新/);
});

test("custom audience finder conditions become part of the search goal", () => {
  const goal = compileTaskChoices("finder", { selected: ["audience"], audienceQuery: "杭州做露营装备的老板" });
  assert.match(goal, /具体找人条件：杭州做露营装备的老板/);
});

test("comment filtering stays semantic filtering instead of adding buying-intent requirements", () => {
  const goal = compileTaskChoices("comments", { selected: ["complaints", "competitors"] });
  assert.match(goal, /差评|投诉/);
  assert.match(goal, /竞品/);
  assert.doesNotMatch(goal, /购买意向|高意向/);
});

test("preset-only audiences validate for live, comments and automatic acquisition", () => {
  const product = compileTaskChoices("audience", { selected: ["price"] });
  assert.equal(validateLiveLeadSetup({ accountId: "account", product }), null);
  assert.equal(validateLeadMinerSetup({ accountRef: "https://www.douyin.com/user/test", accountResolveStatus: "ready", product }), null);
  const config = normalizeCommentAcquisitionConfig({ product, accountId: "account", message: "你好" });
  assert.equal(config.audienceRules.goal, product);
  assert.equal(config.approvalMode, "auto");
});

test("radio selection replaces the previous purpose and checkboxes accumulate independently", () => {
  assert.deepEqual(updateChoiceSelection("finder", ["customers"], "creators", true), ["creators"]);
  assert.deepEqual(updateChoiceSelection("audience", ["price"], "purchase", true), ["price", "purchase"]);
  assert.deepEqual(updateChoiceSelection("audience", ["price", "purchase"], "price", false), ["purchase"]);
});

test("unknown presets never create a goal and previous custom requests remain intact", () => {
  assert.equal(compileTaskChoices("finder", { selected: ["invalid"] }), "");
  assert.equal(compileTaskChoices("finder", { extra: "只找上海做家具维修的店铺" }), "补充要求：只找上海做家具维修的店铺");
  const state = { selected: ["creators"], extra: "不要广告号" };
  assert.equal(compileTaskChoices("finder", JSON.parse(JSON.stringify(state))), compileTaskChoices("finder", state));
});

test("survey invitations never expose the compiled search brief to recipients", () => {
  const goal = compileTaskChoices("research", { selected: ["buyers"], followers: "1 万以上", extra: "排除竞品" });
  const message = buildSurveyInvitation({ audienceGoal: goal, questionnaireUrl: "https://example.com/survey" });
  assert.doesNotMatch(message, /排除竞品|寻找公开|粉丝数量|作为调研/);
  assert.match(message, /https:\/\/example.com\/survey/);
});
