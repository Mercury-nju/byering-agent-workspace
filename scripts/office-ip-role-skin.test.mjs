import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  ACTION_STATES,
  OFFICE_ROLE_SHEETS,
  frameUrl,
  roleForCanvasPoint,
  roleSheetForAgent,
  stateForAction
} from "../src/salebuddy/office-role-skin.js";

const ROLE_SKIN_SOURCE = readFileSync(new URL("../src/salebuddy/office-role-skin.js", import.meta.url), "utf8");

test("maps each native office employee to a visibly distinct Byering role sheet", () => {
  assert.deepEqual(OFFICE_ROLE_SHEETS, {
    "Browser Agent": "线索猎人",
    "Search Agent": "数据分析",
    "App Agent": "金牌客服",
    "File Agent": "内容营销",
    "Computer Agent": "录音总结",
    "mkt-market-scout": "竞品调研"
  });
  assert.equal(new Set(Object.values(OFFICE_ROLE_SHEETS)).size, 6);
  assert.equal(roleSheetForAgent("File Agent"), "内容营销");
  assert.equal(roleSheetForAgent("unknown"), null);
});

test("keeps action semantics precise and deterministic", () => {
  assert.equal(stateForAction("fc_standby"), "standby");
  assert.equal(stateForAction("fc_walking_h"), "walking_right");
  assert.equal(stateForAction("fc_walking_up"), "walking_left");
  assert.equal(stateForAction("fc_talking_on_seat"), "seated_review");
  assert.equal(stateForAction("fc_screen_working_search_or_browser_use"), "working");
  assert.equal(stateForAction("fc_cheer_main"), "celebrate");
  assert.equal(stateForAction("fc_sleeping"), "rest");
  assert.equal(Object.keys(ACTION_STATES).length >= 20, true);
});

test("uses native scene coordinates for stable role placement", () => {
  const size = { width: 2176, height: 1792 };
  assert.equal(roleForCanvasPoint({ ...size, x: 300, y: 800 }), "Computer Agent");
  assert.equal(roleForCanvasPoint({ ...size, x: 700, y: 800 }), "Browser Agent");
  assert.equal(roleForCanvasPoint({ ...size, x: 1800, y: 800 }), "App Agent");
  assert.equal(roleForCanvasPoint({ ...size, x: 1000, y: 380 }), "main");
  assert.equal(roleForCanvasPoint({ ...size, x: 850, y: 1300 }), "File Agent");
  assert.equal(roleForCanvasPoint({ ...size, x: 1600, y: 1300 }), "Search Agent");
});

test("builds URL-safe frame paths", () => {
  assert.equal(frameUrl("/workbench/byering/source/role-frames-v3/", "线索猎人", "working"), "/workbench/byering/source/role-frames-v3/%E7%BA%BF%E7%B4%A2%E7%8C%8E%E4%BA%BA/working.png");
});

test("Pixi role skins never reorder native office containers or text layers", () => {
  assert.doesNotMatch(ROLE_SKIN_SOURCE, /\.zIndex\s*=|\.sortableChildren\s*=|\.addChild\(/);
});

test("Pixi role skins preserve native perspective scale", () => {
  assert.doesNotMatch(ROLE_SKIN_SOURCE, /this\.scale\.[xy]\s*=/);
});

test("role frames match the native 534x400 source geometry and baseline", () => {
  const root = path.resolve(import.meta.dirname, "../workbench/byering/source/role-frames-v6");
  const probe = `
import json, pathlib, sys
from PIL import Image
root = pathlib.Path(sys.argv[1])
rows = []
for image_path in sorted(root.glob("*/*.png")):
    image = Image.open(image_path).convert("RGBA")
    box = image.getchannel("A").getbbox()
    rows.append({"size": image.size, "box": box, "path": str(image_path)})
print(json.dumps(rows, ensure_ascii=False))
`;
  const rows = JSON.parse(execFileSync("python3", ["-c", probe, root], { encoding: "utf8" }));
  assert.equal(rows.length, 48);
  for (const row of rows) {
    assert.deepEqual(row.size, [534, 400], row.path);
    assert.ok(row.box, `${row.path} should have visible pixels`);
    assert.ok(row.box[2] - row.box[0] <= 250, `${row.path} should preserve native occupied width`);
    assert.ok(row.box[3] - row.box[1] <= 280, `${row.path} should preserve native occupied height`);
    assert.ok(row.box[3] >= 315 && row.box[3] <= 335, `${row.path} should preserve the native baseline`);
  }
});
