import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  EAR_FORMATS,
  EAR_RECORD_STATES,
  createMaterialDraft,
  formatDuration,
  recordingStateLabel,
  waveformHeightFromLevel
} from "../src/salebuddy/ui/ear-page.js";

const projectRoot = path.resolve(import.meta.dirname, "..");

test("ear exposes the four requested material formats", () => {
  assert.deepEqual(EAR_FORMATS.map(({ id, label, extension }) => [id, label, extension]), [
    ["ppt", "PPT", ".pptx"],
    ["html", "HTML", ".html"],
    ["pdf", "PDF", ".pdf"],
    ["infographic", "信息图", ".svg"]
  ]);
});

test("ear material drafts carry a shareable output contract", () => {
  const material = createMaterialDraft({ formatId: "html", title: "客户访谈复盘" });
  assert.equal(material.formatId, "html");
  assert.equal(material.title, "客户访谈复盘");
  assert.match(material.fileName, /客户访谈复盘.*\.html$/);
  assert.equal(material.status, "ready");
  assert.equal(material.shareable, true);
});

test("ear formats recording duration for a compact workspace status", () => {
  assert.equal(formatDuration(0), "00:00");
  assert.equal(formatDuration(65), "01:05");
  assert.equal(formatDuration(3661), "61:01");
});

test("ear exposes intentional recording states for the animated control", () => {
  assert.deepEqual(EAR_RECORD_STATES, {
    ready: "ready",
    recording: "recording",
    complete: "complete"
  });
  assert.equal(recordingStateLabel("ready"), "准备录音");
  assert.equal(recordingStateLabel("recording"), "录音中");
  assert.equal(recordingStateLabel("complete"), "录音完成");
});

test("ear maps microphone levels to bounded waveform heights", () => {
  assert.equal(waveformHeightFromLevel(-1), 10);
  assert.equal(waveformHeightFromLevel(0), 10);
  assert.equal(waveformHeightFromLevel(0.5), 30);
  assert.equal(waveformHeightFromLevel(1), 50);
  assert.equal(waveformHeightFromLevel(2), 50);
});

test("ear can start recording after the workspace controls are bound", () => {
  const source = readFileSync(path.join(projectRoot, "src/salebuddy/ui/ear-page.js"), "utf8");
  assert.match(source, /export function openEarPage\(\{ onClose = null, gateway = null, autoStart = false \} = \{\}\)/);
  assert.match(source, /recordButton\.addEventListener\("click", \(\) => \{/);
  assert.match(source, /\n  if \(autoStart\) recordButton\.click\(\);\n\n  const originalClose/);
});

test("ear keeps the recording control in the center workbench layout", () => {
  const source = readFileSync(path.join(projectRoot, "src/salebuddy/ui/ear-page.js"), "utf8");
  assert.match(source, /\.sb-ear-shell\{[^}]*grid-template-columns:220px minmax\(0,1fr\) 250px/);
  assert.match(source, /\.sb-ear-source\{[^}]*grid-column:1/);
  assert.match(source, /\.sb-ear-panel > \.sb-ear-card:first-child\{[^}]*grid-column:2/);
  assert.match(source, /recordCard\.append\(recordHead, meter, recordButton, note\)/);
  assert.match(source, /setupCard\.append\(el\("h2", "sb-ear-studio-title", "工作室"\)/);
});
