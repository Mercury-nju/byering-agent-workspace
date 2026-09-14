import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/salebuddy/marketing-site.js", import.meta.url), "utf8");
const document = await readFile(new URL("../index.html", import.meta.url), "utf8");

test("homepage copy reflects the current product surface", () => {
  assert.match(source, /抖音获客与触达 Agent/);
  assert.match(source, /Agent 中心/);
  assert.match(source, /成果中心/);
  assert.match(source, /发送前展示对象和内容/);
  assert.match(source, /能力准备中/);
  assert.match(source, /byering-product-agent-center\.png/);
  assert.match(source, /byering-product-realtime-work\.png/);
  assert.match(source, /byering-product-agent-detail\.png/);
  assert.doesNotMatch(source, /byering-case-(creator|intent|followup)\.png/);
  assert.doesNotMatch(source, /小雨今天喝拿铁|萃取压力|即时客户简报/);
  assert.doesNotMatch(source, /每一次经营沉淀成下一次增长的业务资产/);
});

test("homepage metadata names the real acquisition and outreach focus", () => {
  assert.match(document, /抖音智能获客与触达 Agent/);
  assert.doesNotMatch(document, /持续为你工作的 AI 获客团队。/);
});
