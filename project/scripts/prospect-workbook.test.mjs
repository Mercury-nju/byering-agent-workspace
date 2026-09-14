import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";

import { createProspectWorkbook } from "../backend/prospect-workbook.js";

test("prospect workbook contains video and comment sheets", () => {
  const buffer = createProspectWorkbook({
    query: "测试账号",
    analysis: { mode: "model" },
    videos: [{ videoId: "v-1", title: "作品一", url: "https://douyin.com/video/v-1", metrics: { comments: 2 } }],
    comments: [{ commentId: "c-1", source: { videoId: "v-1", url: "https://douyin.com/video/v-1", observedAt: "2026-08-31" }, nickname: "客户", text: "=危险公式", score: 46, tier: "high", matchedTerms: ["价格"], intent: { source: "model", confidence: 0.91, reason: "明确询价", signals: ["价格"] } }],
    leads: [{ source: { videoId: "v-1" }, tier: "high" }]
  });
  assert.ok(Buffer.isBuffer(buffer));
  assert.ok(buffer.length > 1000);
  // XLSX is a ZIP container. Sheet names and user-visible text are validated
  // through the package reader so this test covers the generated artifact.
  const workbook = XLSX.read(buffer, { type: "buffer" });
  assert.deepEqual(workbook.SheetNames, ["视频信息", "评论信息"]);
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets["评论信息"]);
  assert.equal(rows[0].评论内容, "'=危险公式");
  assert.equal(rows[0].评论ID, "c-1");
  assert.equal(rows[0].判断来源, "大模型");
  assert.equal(rows[0].判断理由, "明确询价");
  const videoRows = XLSX.utils.sheet_to_json(workbook.Sheets["视频信息"]);
  assert.equal(videoRows[0].高意向数, 1);
});

test("filter workbook exports match decisions instead of intent tiers", () => {
  const buffer = createProspectWorkbook({
    query: "负面评价",
    analysis: { mode: "filter", source: "model" },
    videos: [{ videoId: "v-filter", title: "作品", url: "https://douyin.com/video/v-filter" }],
    comments: [{ commentId: "c-filter", source: { videoId: "v-filter" }, nickname: "用户", text: "这个太差了", filter: { matched: true, source: "model", confidence: 0.92, reason: "明确表达负面体验", signals: ["太差"] } }],
    leads: []
  });
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets["评论信息"]);
  assert.equal(rows[0].是否匹配, "是");
  assert.equal(rows[0].判断来源, "大模型");
  assert.equal(rows[0].匹配置信度, 0.92);
  assert.equal(rows[0].意向层级, undefined);
});
