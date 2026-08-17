import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..");
const ASSET_ROOT = path.join(PROJECT_ROOT, "workbench", "assets");
const PILOT_ROOT = path.join(PROJECT_ROOT, "workbench", "byering", "pilot");
const ACTIONS = ["fc_standby", "fc_walking_h", "fc_working", "fc_talking_on_seat"];
const ALL_ACTIONS = [
  "fc_cheer1_sub",
  "fc_cheer2_sub",
  "fc_cheer_main",
  "fc_coffee",
  "fc_drink_coffee",
  "fc_fall_down",
  "fc_high_press",
  "fc_leaving",
  "fc_off_chair",
  "fc_peek",
  "fc_pooping",
  "fc_running_treadmill",
  "fc_salute",
  "fc_screen_playing1",
  "fc_screen_playing2",
  "fc_screen_playing3",
  "fc_screen_working_apk_use",
  "fc_screen_working_file_use",
  "fc_screen_working_main",
  "fc_screen_working_search_or_browser_use",
  "fc_screen_working_win_use",
  "fc_sigh",
  "fc_sleeping",
  "fc_standby",
  "fc_talking_on_seat",
  "fc_talking_on_stand",
  "fc_ticket",
  "fc_walking_h",
  "fc_walking_up",
  "fc_working"
];

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function legacySnapshot() {
  return Object.fromEntries(ACTIONS.flatMap((action) => {
    const base = path.join(ASSET_ROOT, "spritesheet", "agent", action);
    return [
      [`${action}.webp`, sha256(`${base}.webp`)],
      [`${action}.webp.json`, sha256(`${base}.webp.json`)]
    ];
  }));
}

test("builds a pilot atlas with the legacy canvas and frame contract", () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "byering-pilot-"));
  try {
    execFileSync(process.execPath, [
      path.join(PROJECT_ROOT, "scripts", "office-ip-atlas.mjs"),
      "--output", tempRoot,
      "--actions", ACTIONS.join(",")
    ], { cwd: PROJECT_ROOT, stdio: "pipe" });

    for (const action of ACTIONS) {
      const jsonPath = path.join(tempRoot, `${action}.webp.json`);
      const imagePath = path.join(tempRoot, `${action}.webp`);
      assert.equal(existsSync(jsonPath), true, `${action} metadata should exist`);
      assert.equal(existsSync(imagePath), true, `${action} atlas should exist`);

      const generated = JSON.parse(readFileSync(jsonPath, "utf8"));
      const legacy = JSON.parse(readFileSync(path.join(ASSET_ROOT, "spritesheet", "agent", `${action}.webp.json`), "utf8"));
      assert.deepEqual(new Set(Object.keys(generated.frames)), new Set(Object.keys(legacy.frames)));
      const animation = Object.values(generated.animations)[0];
      const legacyFrames = Object.values(legacy.frames);
      const tileWidth = median(legacyFrames.map(({ frame }) => frame.w));
      const tileHeight = median(legacyFrames.map(({ frame }) => frame.h));
      assert.equal(generated.meta.size.w, tileWidth * 8);
      assert.equal(generated.meta.size.h, Math.ceil(animation.length / 8) * tileHeight);
      assert.deepEqual(generated.meta.related_multi_packs, []);
      for (const key of Object.keys(legacy.frames)) {
        assert.equal(generated.frames[key].frame.w, tileWidth);
        assert.equal(generated.frames[key].frame.h, tileHeight);
        assert.equal(generated.frames[key].spriteSourceSize.w, tileWidth);
        assert.equal(generated.frames[key].spriteSourceSize.h, tileHeight);
        assert.deepEqual(generated.frames[key].sourceSize, legacy.frames[key].sourceSize);
        assert.equal(generated.frames[key].rotated, false);
      }
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("does not modify the original office atlases", () => {
  const before = legacySnapshot();
  const output = path.join(PILOT_ROOT, "test-output");
  execFileSync(process.execPath, [
    path.join(PROJECT_ROOT, "scripts", "office-ip-atlas.mjs"),
    "--output", output,
    "--actions", ACTIONS.join(",")
  ], { cwd: PROJECT_ROOT, stdio: "pipe" });

  try {
    assert.deepEqual(legacySnapshot(), before);
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});

test("builds a pilot atlas for every non-cat office action alias", () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "byering-pilot-all-"));
  try {
    execFileSync(process.execPath, [
      path.join(PROJECT_ROOT, "scripts", "office-ip-atlas.mjs"),
      "--output", tempRoot,
      "--actions", ALL_ACTIONS.join(",")
    ], { cwd: PROJECT_ROOT, stdio: "pipe" });

    for (const action of ALL_ACTIONS) {
      assert.equal(existsSync(path.join(tempRoot, `${action}.webp`)), true, `${action} atlas should exist`);
      assert.equal(existsSync(path.join(tempRoot, `${action}.webp.json`)), true, `${action} metadata should exist`);
    }
    assert.equal(existsSync(path.join(tempRoot, "fc_cat_walk_h.webp")), false, "cat action stays outside the pilot");
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("keeps the visible pilot character scale stable across an action", () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "byering-pilot-stable-"));
  try {
    execFileSync(process.execPath, [
      path.join(PROJECT_ROOT, "scripts", "office-ip-atlas.mjs"),
      "--output", tempRoot,
      "--actions", "fc_standby"
    ], { cwd: PROJECT_ROOT, stdio: "pipe" });
    const probe = `
import json, sys
from PIL import Image
atlas = Image.open(sys.argv[1]).convert("RGBA")
metadata = json.load(open(sys.argv[2]))
animation = next(iter(metadata["animations"].values()))
sizes = []
for name in animation:
    frame = metadata["frames"][name]["frame"]
    crop = atlas.crop((frame["x"], frame["y"], frame["x"] + frame["w"], frame["y"] + frame["h"]))
    box = crop.getchannel("A").getbbox()
    sizes.append((box[2] - box[0], box[3] - box[1]))
print(json.dumps(sizes))
`;
    const sizes = JSON.parse(execFileSync("python3", [
      "-c", probe,
      path.join(tempRoot, "fc_standby.webp"),
      path.join(tempRoot, "fc_standby.webp.json")
    ], { encoding: "utf8" }));
    const widths = sizes.map(([width]) => width);
    const heights = sizes.map(([, height]) => height);
    assert.ok(Math.max(...widths) - Math.min(...widths) <= 3, "width should not pulse between frames");
    assert.ok(Math.max(...heights) - Math.min(...heights) <= 3, "height should not pulse between frames");
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
