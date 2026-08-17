#!/usr/bin/env node
/**
 * 办公室红线完整性检查
 *
 * 冻结范围（SaleBuddy 改造红线，任何变更都必须显式拒绝）：
 *   - assets/treemap-KZPCXAKY-Dm7XgKSQ.js      办公室场景/状态机/适配器所在 bundle
 *   - assets/treemap-KZPCXAKY-B7Dc9S11.css     办公室容器与面板样式
 *   - assets/ani-team-*.pag / ani-marvis-team-*.pag  角色与动作动画资源
 *   - workbench/assets/**                      office.tmj 地图、精灵图、工作站素材
 *
 * 用法：
 *   node scripts/check-office-integrity.mjs            校验，退出码 0=通过 1=有变更
 *   node scripts/check-office-integrity.mjs --record   重新录制基线（仅限评审通过后）
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(projectRoot, "scripts", "office-integrity-manifest.json");

const FROZEN_FILES = [
  "assets/treemap-KZPCXAKY-Dm7XgKSQ.js",
  "assets/treemap-KZPCXAKY-B7Dc9S11.css"
];
const FROZEN_GLOBS = [
  { dir: "assets", pattern: /^ani-team-.*\.pag$/ },
  { dir: "assets", pattern: /^ani-marvis-team-.*\.pag$/ }
];
const FROZEN_DIRS = ["workbench/assets"];

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else yield full;
  }
}

function collectFrozenFiles() {
  const files = [...FROZEN_FILES];
  for (const { dir, pattern } of FROZEN_GLOBS) {
    const abs = path.join(projectRoot, dir);
    if (!existsSync(abs)) continue;
    for (const name of readdirSync(abs)) {
      if (pattern.test(name)) files.push(path.join(dir, name));
    }
  }
  for (const dir of FROZEN_DIRS) {
    const abs = path.join(projectRoot, dir);
    if (!existsSync(abs)) continue;
    for (const full of walk(abs)) files.push(path.relative(projectRoot, full));
  }
  return files.sort();
}

function recordManifest() {
  const entries = {};
  for (const rel of collectFrozenFiles()) {
    entries[rel] = sha256(path.join(projectRoot, rel));
  }
  const manifest = {
    recordedAt: new Date().toISOString(),
    policy: "AI 办公室逻辑/视觉/动效/代码严格冻结；变更此清单需评审并更新 SaleBuddy-改造计划.md",
    files: entries
  };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`已录制基线：${Object.keys(entries).length} 个冻结文件`);
}

function checkManifest() {
  if (!existsSync(manifestPath)) {
    console.error("缺少基线清单，请先运行 --record");
    process.exit(1);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const current = collectFrozenFiles();
  const currentSet = new Set(current);
  let failed = false;

  for (const [rel, expected] of Object.entries(manifest.files)) {
    const abs = path.join(projectRoot, rel);
    if (!existsSync(abs)) {
      console.error(`[MISSING]  ${rel}`);
      failed = true;
      continue;
    }
    const actual = sha256(abs);
    if (actual !== expected) {
      console.error(`[CHANGED]  ${rel}`);
      failed = true;
    }
  }
  for (const rel of current) {
    if (!(rel in manifest.files)) {
      console.error(`[ADDED]    ${rel}（冻结目录中不得新增文件）`);
      failed = true;
    }
  }

  if (failed) {
    console.error("\n办公室红线检查失败：冻结文件发生变更。如确为有意修改，请先更新改造计划并重新 --record。");
    process.exit(1);
  }
  console.log(`办公室红线检查通过：${Object.keys(manifest.files).length} 个冻结文件与基线一致。`);
}

if (process.argv.includes("--record")) recordManifest();
else checkManifest();
