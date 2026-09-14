import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  buildSurveyInvitation,
  buildSurveyOutreachTargets,
  validateUserResearchSetup
} from "../src/salebuddy/ui/user-research.js";

const agentSquareSource = fs.readFileSync(new URL("../src/salebuddy/ui/agent-square.js", import.meta.url), "utf8");

test("user research setup requires an audience goal and a public questionnaire URL", () => {
  assert.deepEqual(validateUserResearchSetup({ finderGoal: "", surveyUrl: "not-a-url" }), {
    finderGoal: "先选想邀请的人群",
    surveyUrl: "还需要一个可以打开的问卷链接"
  });
  assert.deepEqual(validateUserResearchSetup({
    finderGoal: "近期准备购买 AI 学习产品的职场人",
    surveyUrl: "https://example.com/survey"
  }), {});
});

test("survey invitation always contains the questionnaire URL exactly once", () => {
  const surveyUrl = "https://example.com/survey?id=42";
  const generated = buildSurveyInvitation({
    audienceGoal: "近期关注 AI 科普内容的人",
    questionnaireUrl: surveyUrl
  });
  assert.match(generated, /用户调研/);
  assert.equal(generated.split(surveyUrl).length - 1, 1);

  const custom = buildSurveyInvitation({
    questionnaireUrl: surveyUrl,
    customMessage: `你好，邀请你填写问卷：${surveyUrl}`
  });
  assert.equal(custom.split(surveyUrl).length - 1, 1);
});

test("finder results become addressable survey targets without losing analysis evidence", () => {
  const targets = buildSurveyOutreachTargets([
    {
      accountId: "sec-a",
      sec_uid: "sec-a",
      nickname: "目标用户 A",
      profileUrl: "https://www.douyin.com/user/sec-a",
      profile: { follower_count: 12000, province: "上海", signature: "AI 科普" },
      score: 91,
      reasons: ["近期持续发布 AI 科普内容", "粉丝增长明显"],
      evidence: [{ title: "近 30 天涨粉", value: 3200 }]
    },
    { nickname: "无身份用户", reasons: ["缺少可触达身份"] }
  ], { selectedIds: ["sec-a"] });

  assert.equal(targets.length, 1);
  assert.equal(targets[0].secId, "sec-a");
  assert.equal(targets[0].nickname, "目标用户 A");
  assert.equal(targets[0].score, 91);
  assert.deepEqual(targets[0].reasons, ["近期持续发布 AI 科普内容", "粉丝增长明显"]);
  assert.deepEqual(targets[0].evidence, [{ title: "近 30 天涨粉", value: 3200 }]);
  assert.equal(targets[0].triggerSource, "用户调研匹配");
  assert.match(targets[0].triggerReason, /AI 科普/);
});

test("user research orchestration searches first and routes sends through the selected authorized cloud", () => {
  assert.match(agentSquareSource, /function isUserResearchAgent/);
  assert.match(agentSquareSource, /async function startUserResearchFinder/);
  assert.match(agentSquareSource, /executionAgentId/);
  assert.match(agentSquareSource, /const providerAgentId =/);
  assert.match(agentSquareSource, /agentId:\s*providerAgentId/);
  assert.match(agentSquareSource, /用户调研专家/);
  assert.doesNotMatch(agentSquareSource, /模拟问卷|模拟触达|虚拟进度/);
});
