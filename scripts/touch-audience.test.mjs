import assert from "node:assert/strict";
import test from "node:test";

import {
  isTouchRequest,
  parseTouchRequest,
  TOUCH_SOURCE_IDS
} from "../src/salebuddy/business/touch-audience.js";

test("parses a direct account request without inventing a broad audience", () => {
  const plan = parseTouchRequest("帮我联系 @acme_cars，问问他有没有合作需求");

  assert.equal(plan.source.id, TOUCH_SOURCE_IDS.SPECIFIC_ACCOUNT);
  assert.equal(plan.audience, "@acme_cars");
  assert.equal(plan.signal, "用户指定账号");
  assert.equal(plan.intent, "合作需求");
  assert.match(plan.action, /生成首触建议/);
});

test("parses a competitor follower request with a time window", () => {
  const plan = parseTouchRequest("帮我联系竞争对手最近新增的粉丝");

  assert.equal(plan.source.id, TOUCH_SOURCE_IDS.ACCOUNT_RELATION);
  assert.match(plan.audience, /竞争对手/);
  assert.match(plan.signal, /新增关注/);
  assert.equal(plan.timeWindow, "最近 24 小时");
  assert.match(plan.relationship, /陌生人|竞品/);
});

test("parses content comments and extracts the intent filter", () => {
  const plan = parseTouchRequest("找最近 30 天在我视频下面问过价格的人");

  assert.equal(plan.source.id, TOUCH_SOURCE_IDS.WORK_INTERACTIONS);
  assert.match(plan.signal, /评论/);
  assert.match(plan.filter, /价格/);
  assert.equal(plan.timeWindow, "最近 30 天");
  assert.equal(plan.intent, "询价");
});

test("parses profile discovery constraints as filters", () => {
  const plan = parseTouchRequest("找杭州医美行业最近一周总播放量超过 1 万的抖音账号");

  assert.equal(plan.source.id, TOUCH_SOURCE_IDS.PROFILE_SEARCH);
  assert.match(plan.audience, /医美行业/);
  assert.match(plan.filter, /杭州|播放量超过 1 万/);
  assert.equal(plan.timeWindow, "最近 1 周");
  assert.match(plan.relationship, /陌生账号/);
});

test("parses imported lists and keeps missing constraints visible", () => {
  const plan = parseTouchRequest("把这份 Excel 客户名单都触达一遍");

  assert.equal(plan.source.id, TOUCH_SOURCE_IDS.IMPORTED_LIST);
  assert.match(plan.audience, /Excel/);
  assert.match(plan.missing.join("、"), /触达渠道|时间范围/);
  assert.match(plan.action, /确认后/);
});

test("non-touch requests are not classified as audience targeting", () => {
  assert.equal(isTouchRequest("帮我写一篇客户案例文章"), false);
  assert.equal(parseTouchRequest("帮我写一篇客户案例文章"), null);
});
