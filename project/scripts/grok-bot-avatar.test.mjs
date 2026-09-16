import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MARKETPLACE_AGENTS } from "../src/salebuddy/agents/marketplace.js";

import {
  GROK_AVATAR_COLORS,
  GROK_AVATAR_ARCHITECTURE,
  GROK_AVATAR_SHAPES,
  GROK_EXPRESSION_STATE_NAMES,
  GROK_AVATAR_RUNTIME_SOURCE,
  GROK_AVATAR_CATALOG,
  GROK_AVATAR_EFFECT_BY_STATE,
  GROK_AVATAR_AUTOPLAY_SEQUENCE,
  grokAvatarPathFor,
  grokAvatarRoleFor,
  grokAvatarSpecFor,
  grokStateForTeamStatus
} from "../src/salebuddy/ui/grok-bot-avatar.js";

const avatarSource = readFileSync(new URL("../src/salebuddy/ui/grok-bot-avatar.js", import.meta.url), "utf8");
const libraryBlobSource = readFileSync(new URL("../assets/grok-bot-avatars/chief-54b9a6.svg", import.meta.url), "utf8");

test("mirrors the recovered avatar catalog", () => {
  assert.deepEqual(GROK_AVATAR_SHAPES, [
    "blob", "pebble", "bean", "egg", "squircle", "tablet", "capsule",
    "cylinder", "hex", "gem", "crystal", "wedge", "shield", "dome",
    "arch", "cloud", "teardrop", "leaf"
  ]);
  assert.deepEqual(Object.keys(GROK_AVATAR_COLORS), [
    "black", "brown", "red", "orange", "yellow", "green", "cyan", "blue",
    "violet", "magenta", "gray"
  ]);
  assert.deepEqual(GROK_EXPRESSION_STATE_NAMES, [
    "sleeping", "waking", "idle", "listening", "thinking", "searching", "working",
    "excited", "surprised", "suspicious", "angry", "drowsy", "happy", "curious",
    "confused", "bored", "proud", "shy", "sad", "laughing", "scared", "playful",
    "celebrate", "orbit", "radar", "progress", "spawning", "humming", "loading",
    "dictating", "writing", "sending", "receiving", "uploading", "notifying", "alerting",
    "dragging", "bouncing", "powering-down"
  ]);
});

test("assigns an agent a stable, varied shape and color", () => {
  const first = grokAvatarSpecFor("mkt-lead-miner");
  const second = grokAvatarSpecFor("mkt-lead-miner");
  assert.deepEqual(first, second);
  assert.ok(GROK_AVATAR_SHAPES.includes(first.shape));
  assert.ok(Object.hasOwn(GROK_AVATAR_COLORS, first.color));
  assert.notDeepEqual(first, grokAvatarSpecFor("mkt-cold-writer"));
  assert.match(grokAvatarPathFor(first.shape), /^M.+Z$/);
});

test("keeps visible marketplace avatar pairs unique", () => {
  const ids = MARKETPLACE_AGENTS.map((agent) => agent.id);
  const pairs = ids.map((id) => {
    const spec = grokAvatarSpecFor(id);
    return `${spec.shape}/${spec.color}`;
  });
  assert.equal(new Set(pairs).size, pairs.length);
});

test("uses the recovered DMG runtime as the only avatar source", () => {
  assert.equal(GROK_AVATAR_RUNTIME_SOURCE.package, "Grok_Bot_0.44.0.dmg");
  assert.deepEqual(GROK_AVATAR_RUNTIME_SOURCE.explicitFields, ["avatarShape", "avatarColor"]);
  assert.equal(grokAvatarPathFor("blob"), libraryBlobSource.match(/<path[^>]*d="([^"]+)"/)?.[1]);
  assert.deepEqual(GROK_AVATAR_CATALOG["mkt-comment-acquisition"], { shape: "blob", color: "blue" });
  assert.deepEqual(GROK_AVATAR_CATALOG["mkt-lead-miner"], { shape: "wedge", color: "magenta" });
  assert.deepEqual(GROK_AVATAR_CATALOG["mkt-research-expert"], { shape: "hex", color: "violet" });
  assert.deepEqual(GROK_AVATAR_CATALOG["mkt-dm-inbox"], { shape: "cloud", color: "orange" });
  assert.deepEqual(GROK_AVATAR_CATALOG["mkt-viral-work-analysis"], { shape: "blob", color: "red" });
  assert.deepEqual(GROK_AVATAR_CATALOG["mkt-comment-filter"], { shape: "blob", color: "orange" });
  assert.deepEqual(GROK_AVATAR_CATALOG["mkt-douyin-finder"], { shape: "teardrop", color: "brown" });
  assert.deepEqual(GROK_AVATAR_CATALOG["mkt-find-people"], { shape: "wedge", color: "blue" });
  assert.deepEqual(GROK_AVATAR_CATALOG["mkt-user-research"], { shape: "squircle", color: "cyan" });
  assert.deepEqual(GROK_AVATAR_CATALOG.prospect_researcher, { shape: "teardrop", color: "cyan" });
  assert.deepEqual(GROK_AVATAR_CATALOG["mkt-cold-writer"], { shape: "gem", color: "red" });
  assert.deepEqual(GROK_AVATAR_CATALOG["mkt-live-lead-miner"], { shape: "blob", color: "yellow" });
  assert.deepEqual(GROK_AVATAR_CATALOG["mkt-audience-search"], { shape: "teardrop", color: "green" });
  assert.deepEqual(GROK_AVATAR_CATALOG["mkt-network-miner"], { shape: "squircle", color: "blue" });
  assert.deepEqual(grokAvatarSpecFor("账号发现与解析师").shape, "blob");
  assert.deepEqual(grokAvatarSpecFor("线索猎人").shape, "wedge");
  assert.deepEqual(grokAvatarSpecFor("线索分析师").shape, "hex");
  assert.deepEqual(grokAvatarSpecFor("客户分析员").shape, "pebble");
  assert.deepEqual(grokAvatarSpecFor("客户研究员").shape, "pebble");
  assert.deepEqual(grokAvatarSpecFor("客户画像研究员").shape, "teardrop");
  assert.deepEqual(grokAvatarSpecFor("Research Agent").shape, "teardrop");
  assert.deepEqual(grokAvatarSpecFor("潜客触达专员").shape, "gem");
  assert.deepEqual(grokAvatarSpecFor("潜客激活专员").shape, "gem");
  assert.deepEqual(grokAvatarSpecFor("mkt-comment-acquisition"), { shape: "blob", color: "blue", seed: grokAvatarSpecFor("mkt-comment-acquisition").seed });
  assert.deepEqual(grokAvatarSpecFor("mkt-dm-inbox"), { shape: "cloud", color: "orange", seed: grokAvatarSpecFor("mkt-dm-inbox").seed });
  assert.deepEqual(grokAvatarSpecFor("mkt-douyin-finder"), { shape: "teardrop", color: "brown", seed: grokAvatarSpecFor("mkt-douyin-finder").seed });
  assert.equal(grokAvatarRoleFor("main"), "top");
  assert.equal(grokAvatarRoleFor("mkt-research-expert"), "middle");
  assert.equal(grokAvatarRoleFor("mkt-cold-writer"), "extension");
  assert.ok(GROK_AVATAR_ARCHITECTURE.extensions.includes("mkt-live-lead-miner"));
});

test("maps live team status to the recovered animation states", () => {
  assert.equal(grokStateForTeamStatus({ state: "working" }), "working");
  assert.equal(grokStateForTeamStatus({ state: "blocked" }), "alerting");
  assert.equal(grokStateForTeamStatus({ state: "idle" }), "idle");
});

test("keeps the complete recovered effect state machine", () => {
  assert.deepEqual(GROK_AVATAR_EFFECT_BY_STATE, {
    thinking: "dots",
    orbit: "orbit",
    radar: "radar",
    progress: "progress",
    spawning: "gather",
    dictating: "wave",
    sending: "send",
    receiving: "receive",
    uploading: "dock",
    bouncing: "ball",
    loading: "whirl",
    "powering-down": "standby",
    writing: "pencil",
    alerting: "bang"
  });
  for (const effect of ["dots", "orbit", "radar", "progress", "gather", "wave", "send", "receive", "dock", "ball", "whirl", "pencil", "bang", "standby"]) {
    assert.match(avatarSource, new RegExp(`render${effect[0].toUpperCase()}${effect.slice(1)}Effect`));
  }
  assert.doesNotMatch(avatarSource, /case "orbit":\s*case "radar":\s*case "progress":[\s\S]*?break;/);
});

test("keeps the recovered ambient reaction timing", () => {
  assert.deepEqual(GROK_AVATAR_AUTOPLAY_SEQUENCE, ["spin", "wide-spin", "bounce", "dizzy", "burst"]);
  assert.match(avatarSource, /nextAutoplayAt = this\.startedAt \+ randomBetween\(\[2500, 5000\]\)/);
  assert.match(avatarSource, /this\.nextAutoplayAt = now \+ randomBetween\(\[9000, 18000\]\)/);
  assert.match(avatarSource, /this\.packageEffects\.burst\(16, \.95, \.3\)/);
  assert.match(avatarSource, /this\.stateName === "happy" \|\| this\.stateName === "excited" \|\| this\.stateName === "proud" \|\| this\.stateName === "playful"/);
  assert.match(avatarSource, /kind: "wide-spin",[\s\S]*?duration: 5490,[\s\S]*?turns: 9/);
  assert.match(avatarSource, /kind === "wide-spin"/);
  assert.match(avatarSource, /kind: "spinBounce",[\s\S]*?duration: 700/);
  assert.match(avatarSource, /sample < \.55/);
  assert.match(avatarSource, /sample < \.34/);
  assert.match(avatarSource, /sample < \.62/);
  assert.match(avatarSource, /sample < \.86/);
  assert.match(avatarSource, /state === "searching"\) return \[800, 1600\]/);
  assert.match(avatarSource, /state === "working"\) return \[1200, 2400\]/);
  assert.match(avatarSource, /this\.autoplay\.kind === "spinBounce"/);
  assert.match(avatarSource, /const PACKAGE_BOUNCE_SEGMENTS = Object\.freeze\(\[/);
  assert.match(avatarSource, /\{ height: 48, duration: \.5 \}/);
});

test("keeps pointer gaze tracking without starting a hover rotation", () => {
  assert.match(avatarSource, /pointerInside/);
  assert.match(avatarSource, /pointerenter/);
  assert.doesNotMatch(avatarSource, /this\.startHoverAnimation\(performance\.now\(\)\)/);
  assert.match(avatarSource, /gazeTargetX = 22 \* clamp\(\(pointerX - centerX\)/);
});

test("keeps the previous orbit renderer boundary", () => {
  assert.match(avatarSource, /if \(reduceMotion \|\| !back \|\| !allowOrbit\) return/);
  assert.match(avatarSource, /allowOrbit = options\.allowOrbit !== false/);
  assert.match(avatarSource, /prepareBelts\(wideStyle \? 3 : 1\)/);
  assert.match(avatarSource, /const trailShape = \(history, width\)/);
  assert.match(avatarSource, /Math\.min\(width, total \* \.34\)/);
  assert.match(avatarSource, /particle\.trailEl = trail/);
  assert.match(avatarSource, /particle\.trailFrontEl = frontTrail/);
  assert.match(avatarSource, /radius: \(\) => CENTER/);
  assert.match(avatarSource, /allowOrbit: this\.autoplay\?\.source !== "hover"/);
  assert.doesNotMatch(avatarSource, /runtime\.append\(effectsBack, previousStateEffectsBack, currentStateEffectsBack/);
});

test("keeps the recovered wide-spin wobble channels", () => {
  assert.match(avatarSource, /Math\.sin\(wobbleTime \* 18\.4\) \* 2\.6/);
  assert.match(avatarSource, /Math\.sin\(wobbleTime \* 11\.5\) \* 13/);
  assert.match(avatarSource, /Math\.cos\(wobbleTime \* 9\) - 1\) \* 3\.5/);
});

test("keeps the recovered state-effect crossfade", () => {
  assert.match(avatarSource, /previousEffectType/);
  assert.match(avatarSource, /effectCrossfade/);
  assert.match(avatarSource, /currentBlend/);
  assert.match(avatarSource, /previousBlend/);
  assert.match(avatarSource, /stateEffects\.render\(effectType, effectProgress, now, currentBlend[\s\S]*?receiveAngle/);
  assert.match(avatarSource, /previousStateEffects\.render\(this\.previousEffectType, previousProgress, now, previousBlend[\s\S]*?receiveAngle/);
  const setStateStart = avatarSource.indexOf("setState(state) {");
  const setStateEnd = avatarSource.indexOf("\n  updateAutoplay", setStateStart);
  assert.ok(setStateStart >= 0 && setStateEnd > setStateStart);
  assert.doesNotMatch(avatarSource.slice(setStateStart, setStateEnd), /this\.stateEffects\.clear\(\)|this\.previousStateEffects\.clear\(\)|this\.effectType = null/);
});

test("keeps the recovered receiving orbital trajectory", () => {
  assert.match(avatarSource, /receiveAngle/);
  assert.match(avatarSource, /Math\.random\(\) \* Math\.PI \* 1\.5 - Math\.PI \* 1\.25/);
  assert.match(avatarSource, /perpendicularOffset/);
  assert.match(avatarSource, /18 \* Math\.sin\(t \* Math\.PI\)/);
});

test("anchors transient effect phases to the state timeline", () => {
  assert.match(avatarSource, /const elapsed = Math\.max\(0, Number\(options\.elapsed \?\? 0\)\);/);
  assert.match(avatarSource, /renderSendEffect = \(progress, now, options = \{\}\)/);
  assert.match(avatarSource, /renderDockEffect = \(progress, now, options = \{\}\)/);
  assert.match(avatarSource, /renderBallEffect = \(progress, now, options = \{\}\)/);
  assert.match(avatarSource, /renderPencilEffect = \(progress, now, options = \{\}\)/);
  assert.match(avatarSource, /renderBangEffect = \(progress, now, options = \{\}\)/);
  assert.doesNotMatch(avatarSource, /renderSendEffect[\s\S]*?now - 1500/);
  assert.doesNotMatch(avatarSource, /renderDockEffect[\s\S]*?now - 1000/);
  assert.doesNotMatch(avatarSource, /renderBallEffect[\s\S]*?now - 1800/);
  assert.doesNotMatch(avatarSource, /renderPencilEffect[\s\S]*?now - 2500/);
  assert.doesNotMatch(avatarSource, /renderBangEffect[\s\S]*?now - 2500/);
});

test("keeps state effects visible and gives every recovered effect a finite duration", () => {
  assert.match(avatarSource, /const show = \(node\) => \{[\s\S]*?node\.removeAttribute\("display"\)/);
  assert.match(avatarSource, /const effectDurations = \{[\s\S]*?ball: 1\.8/);
});

test("keeps the recovered state-specific face tuning", () => {
  assert.match(avatarSource, /angry: \{ gap: 1\.28, size: \.78, eyeWidth: \.88, eyeHeight: \.84 \}/);
  assert.match(avatarSource, /working.*WORKING_FACE_TUNE/s);
  assert.match(avatarSource, /faceTuneForState\(this\.stateName\)/);
  assert.match(avatarSource, /function expressionRings\(shape, expressionIndex, tune = FACE_TUNE\)/);
});

test("maps initial eye rings from their source bounds without an unresolved target", () => {
  assert.match(avatarSource, /source\.centerX/);
  assert.doesNotMatch(avatarSource, /target\.centerX/);
});

test("keeps recovered radial outlines at the original 128-point sampling", () => {
  assert.match(avatarSource, /function qg\(fn, samples = 128\)/);
});

test("uses the recovered overlapping-circle cloud silhouette", () => {
  assert.match(avatarSource, /function circleUnionPath\(circles, samples = 160\)/);
  assert.match(avatarSource, /\[CENTER - 62, CENTER \+ 26, 56\]/);
  assert.match(avatarSource, /\[CENTER \+ 38, CENTER - 26, 54\]/);
  assert.equal((grokAvatarPathFor("cloud").match(/C/g) || []).length, 160);
});

test("keeps the recovered ink gradient pipeline and pose constants", () => {
  assert.match(avatarSource, /const PACKAGE_POSE = Object\.freeze\(\{ turn: 17, tilt: -14, roll: 29 \}\)/);
  assert.match(avatarSource, /const PACKAGE_POSE_HOME = Object\.freeze\(\{ turn: 33, tilt: -19, roll: 38 \}\)/);
  assert.match(avatarSource, /function gradientVector\(angle = 135\)/);
  assert.match(avatarSource, /palette\.lightFrom/);
  assert.match(avatarSource, /palette\.darkTo/);
  assert.match(avatarSource, /prefers-color-scheme:dark/);
  assert.match(avatarSource, /data-grok-id/);
  assert.match(avatarSource, /svg\[data-grok-id=/);
});

test("keeps the leaf avatar on the recovered continuous radial outline", () => {
  const leaf = grokAvatarPathFor("leaf");
  assert.match(avatarSource, /function leafPath\(radiusX, radiusY, exponent\)/);
  assert.match(leaf, /^M203\.22 114\.27C/);
  assert.match(leaf, /114\.27 228\.49/);
  assert.match(leaf, /114\.27Z$/);
  assert.equal((leaf.match(/C/g) || []).length, 128);
});

test("guards the recovered eye constraint against an empty span interval", () => {
  assert.match(avatarSource, /if \(!Number\.isFinite\(minimum\) && !Number\.isFinite\(maximum\)\) return centerX;/);
  assert.match(avatarSource, /if \(!Number\.isFinite\(minimum\)\) return Math\.min\(centerX, maximum\);/);
  assert.match(avatarSource, /if \(!Number\.isFinite\(maximum\)\) return Math\.max\(centerX, minimum\);/);
});

test("uses the recovered PCA ring morph and state normalization pipeline", () => {
  assert.match(avatarSource, /function principalRing\(points\)/);
  assert.match(avatarSource, /function rebuildRing\(cx, cy, ux, uy, halfLength, halfWidth, length = 48\)/);
  assert.match(avatarSource, /function interpolateRing\(from, to, amount\)/);
  assert.match(avatarSource, /function expressionRingsForState\(state, expressionIndex\)/);
  assert.match(avatarSource, /PACKAGE_ANGRY_EXPRESSIONS\.has\(expressionIndex\)/);
  assert.match(avatarSource, /equalizeRingWidths\(pair, PACKAGE_SLEEPY_WIDTH_STATES\.has\(state\) \? 8\.6 : 0\)/);
  assert.doesNotMatch(avatarSource, /function blendRings\(from, to, amount\) \{\s*const t = clamp\(amount, 0, 1\);\s*return from\.map\(/);
});
