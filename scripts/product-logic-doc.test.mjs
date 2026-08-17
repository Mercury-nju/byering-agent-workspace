import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const documentPath = path.join(root, "product-logic-doc.html");
const source = fs.readFileSync(documentPath, "utf8");

test("product logic document is self-contained and covers the real navigation", () => {
  assert.match(source, /^<!doctype html>/i);
  assert.match(source, /<aside class="sidebar"/);
  for (const label of ["聊天", "办公室", "看板", "成员", "Agent 广场", "技能广场", "文件中心", "知识", "文档", "记忆"]) {
    assert.match(source, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  for (const page of ["chat", "office", "kanban", "contacts", "agentSquare", "skills", "files", "docs", "memory"]) {
    assert.match(source, new RegExp(`data-page="${page}"`));
  }
  assert.doesNotMatch(source, /<script\s+src=/i);
  assert.doesNotMatch(source, /https?:\/\//i);
});

test("kanban logic graph includes the complete product loop and interaction", () => {
  for (const label of ["项目", "要做的事", "看板定制", "员工执行", "结果和文件", "看板呈现", "回到工作"]) {
    assert.match(source, new RegExp(label));
  }
  assert.match(source, /class="flow"/);
  assert.match(source, /class="flow-line"/);
  assert.match(source, /marker-end: url\(#arrow\)/);
  assert.match(source, /data-detail=/);
  assert.match(source, /event\.target\.closest\?\.\("\[data-page\]"\)/);
  assert.match(source, /const bindFlowNodes/);
});

test("embedded JavaScript parses as a browser script", () => {
  const script = source.match(/<script>([\s\S]*?)<\/script>/i)?.[1];
  assert.ok(script, "document should contain an inline script");
  assert.doesNotThrow(() => new Function(script));
});
