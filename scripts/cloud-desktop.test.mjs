import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const cloud = readFileSync(path.join(root, "src/salebuddy/ui/cloud-desktop.js"), "utf8");
const card = readFileSync(path.join(root, "src/salebuddy/ui/agent-card-chat.js"), "utf8");
const index = readFileSync(path.join(root, "src/salebuddy/index.js"), "utf8");

test("cloud desktop opens as a centered modal instead of navigating away", () => {
  assert.match(cloud, /\.sb-cloud-backdrop\{position:fixed;inset:0/);
  assert.match(cloud, /\.sb-cloud\{position:relative;width:min\(1120px/);
  assert.match(cloud, /sb-cloud-modal/);
  assert.match(cloud, /event\.target === backdrop/);
  assert.match(cloud, /event\.key === "Escape"/);
});

test("employee card exposes a computer icon and delegates to the shared cloud opener", () => {
  assert.match(card, /sb-card-computer-icon/);
  assert.match(card, /打开云电脑/);
  assert.match(card, /onCloud\(agentType\)/);
  assert.match(index, /onCloud: \(agentType\) => cloudDesktopReady\.then\(\(desktop\) => desktop\?\.openFor/);
});
