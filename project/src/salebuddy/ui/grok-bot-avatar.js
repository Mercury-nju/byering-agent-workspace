/**
 * Recovered x.ai-style agent character runtime.
 *
 * The original application generated its characters from shape geometry,
 * color tokens, expression rings, and a small state machine. This module
 * keeps those primitives in the browser instead of shipping captured avatars.
 */

import {
  GROK_EXPRESSIONS,
  GROK_EXPRESSION_DURATIONS,
  GROK_EXPRESSION_PAUSES,
  GROK_EXPRESSION_SEQUENCES
} from "./grok-bot-expressions.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const CENTER = 114.2705;
const VIEW_BOX = "-15 -15 259 259";
const TWO_PI = Math.PI * 2;
const FACE_TUNE = Object.freeze({ size: .86, gap: 1.18, height: 1, eyeWidth: .96, eyeHeight: .92 });
const STATE_FACE_TUNES = Object.freeze({
  angry: { gap: 1.28, size: .78, eyeWidth: .88, eyeHeight: .84 },
  suspicious: { gap: 1.24, size: .82, eyeWidth: .9 },
  confused: { gap: 1.2, size: .84, eyeWidth: .9 },
  scared: { size: .8, eyeWidth: .9, eyeHeight: .88 },
  surprised: { size: .76, eyeWidth: .86, eyeHeight: .86 },
  excited: { size: .78, eyeWidth: .88, eyeHeight: .88 },
  celebrate: { size: .74, eyeWidth: .84, eyeHeight: .84 },
  happy: { size: .76, eyeWidth: .86, eyeHeight: .84 },
  curious: { size: .84 },
  drowsy: { size: .92, eyeWidth: .96 },
  bored: { size: .92, eyeWidth: .96 },
  sad: { size: .92, eyeWidth: .96 },
  playful: { size: .84, gap: 1.2 }
});
const STATE_FACE_MAX_SIZE = .92;
const STATE_FACE_MAX_EYE = 1;
const WORKING_FACE_TUNE = Object.freeze({ size: 1.05, eyeWidth: 1.12, eyeHeight: 1.02 });
const PACKAGE_POSE = Object.freeze({ turn: 17, tilt: -14, roll: 29 });
const PACKAGE_POSE_HOME = Object.freeze({ turn: 33, tilt: -19, roll: 38 });
const UNIFORM_EYES = true;
const EYE_BODY_PADDING = 21;
const EYE_GAP_PADDING = 5;
const SHAPE_SCALE = Object.freeze({ blob: .92, pebble: .96, squircle: .84, tablet: 1, wedge: .94, hex: .94, cloud: 1, teardrop: 1 });

export const GROK_AVATAR_SHAPES = Object.freeze([
  "blob", "pebble", "bean", "egg", "squircle", "tablet", "capsule",
  "cylinder", "hex", "gem", "crystal", "wedge", "shield", "dome",
  "arch", "cloud", "teardrop", "leaf"
]);

const PACKAGE_EYE_SCALE = Object.freeze(Object.fromEntries(
  GROK_AVATAR_SHAPES.map((shape) => [shape, SHAPE_SCALE.blob / (SHAPE_SCALE[shape] ?? 1)])
));

const PACKAGE_BODY_SCALE = Object.freeze(Object.fromEntries(
  GROK_AVATAR_SHAPES.map((shape) => [shape, (SHAPE_SCALE[shape] ?? 1) * 259 / 229])
));

export const GROK_AVATAR_COLORS = Object.freeze({
  black: { light: "#000000", dark: "#FFFFFF", lightFrom: "#000000", lightTo: "#000000", darkFrom: "#FFFFFF", darkTo: "#FFFFFF" },
  brown: { light: "#A27952", dark: "#855C36", lightFrom: "#A27952", lightTo: "#A27952", darkFrom: "#855C36", darkTo: "#855C36" },
  red: { light: "#FF3E51", dark: "#E02135", lightFrom: "#FF3E51", lightTo: "#FF3E51", darkFrom: "#E02135", darkTo: "#E02135" },
  orange: { light: "#FF781C", dark: "#FF6700", lightFrom: "#FF781C", lightTo: "#FF781C", darkFrom: "#FF6700", darkTo: "#FF6700" },
  yellow: { light: "#FFAF38", dark: "#FF9800", lightFrom: "#FFAF38", lightTo: "#FFAF38", darkFrom: "#FF9800", darkTo: "#FF9800" },
  green: { light: "#00C972", dark: "#009957", lightFrom: "#00C972", lightTo: "#00C972", darkFrom: "#009957", darkTo: "#009957" },
  cyan: { light: "#1CC3B0", dark: "#00A592", lightFrom: "#1CC3B0", lightTo: "#1CC3B0", darkFrom: "#00A592", darkTo: "#00A592" },
  blue: { light: "#2A92FE", dark: "#0E74E0", lightFrom: "#2A92FE", lightTo: "#2A92FE", darkFrom: "#0E74E0", darkTo: "#0E74E0" },
  violet: { light: "#A97EFE", dark: "#804EE0", lightFrom: "#A97EFE", lightTo: "#A97EFE", darkFrom: "#804EE0", darkTo: "#804EE0" },
  magenta: { light: "#FF5EB1", dark: "#E02A88", lightFrom: "#FF5EB1", lightTo: "#FF5EB1", darkFrom: "#E02A88", darkTo: "#E02A88" },
  gray: { light: "#959595", dark: "#777777", lightFrom: "#959595", lightTo: "#959595", darkFrom: "#777777", darkTo: "#777777" }
});

export const GROK_EXPRESSION_STATE_NAMES = Object.freeze([
  "sleeping", "waking", "idle", "listening", "thinking", "searching", "working",
  "excited", "surprised", "suspicious", "angry", "drowsy", "happy", "curious",
  "confused", "bored", "proud", "shy", "sad", "laughing", "scared", "playful",
  "celebrate", "orbit", "radar", "progress", "spawning", "humming", "loading",
  "dictating", "writing", "sending", "receiving", "uploading", "notifying", "alerting",
  "dragging", "bouncing", "powering-down"
]);

/**
 * The DMG runtime supplies the visual primitives; this table maps the
 * current product roster to recovered package slots while keeping repeated
 * shapes visually distinct through separate package colors.
 * Explicit avatarShape/avatarColor values still take precedence.
 */
const PACKAGE_AVATAR_COLOR_IDS = Object.freeze([
  "brown", "red", "orange", "yellow", "green", "cyan", "blue", "violet", "magenta", "gray"
]);
const PACKAGE_AVATAR_FALLBACK_SHAPES = Object.freeze([
  "blob", "pebble", "squircle", "tablet", "wedge", "hex", "cloud", "teardrop"
]);

const PACKAGE_EXTENSION_SLOTS = Object.freeze([
  Object.freeze({ shape: "blob", color: "orange" }),
  Object.freeze({ shape: "teardrop", color: "brown" }),
  Object.freeze({ shape: "squircle", color: "cyan" }),
  Object.freeze({ shape: "capsule", color: "red" })
]);

const PACKAGE_ROLE_ALIASES = Object.freeze({
  "Strategy Agent": "main",
  "Browser Agent": "mkt-find-people",
  "Search Agent": "mkt-intent-analyst",
  "Research Agent": "prospect_researcher",
  "账号发现与解析": "main",
  "账号发现与解析师": "main",
  "线索猎人": "mkt-find-people",
  "潜客挖掘员": "mkt-find-people",
  "线索分析师": "mkt-intent-analyst",
  "客户分析员": "mkt-intent-analyst",
  "客户研究员": "mkt-intent-analyst",
  "客户画像研究员": "prospect_researcher",
  "潜客触达专员": "mkt-cold-writer",
  "潜客激活专员": "mkt-cold-writer",
  "私信运营": "mkt-cold-writer",
  "Byering": "main",
  "Byering · 幕僚长": "main",
  "幕僚长": "main"
});

export const GROK_AVATAR_CATALOG = Object.freeze({
  main: Object.freeze({ shape: "blob", color: "black" }),
  "mkt-comment-acquisition": Object.freeze({ shape: "blob", color: "blue" }),
  "mkt-dm-inbox": Object.freeze({ shape: "cloud", color: "orange" }),
  "mkt-gold-customer-service": Object.freeze({ shape: "cloud", color: "cyan" }),
  "mkt-live-danmaku-analysis": Object.freeze({ shape: "wedge", color: "violet" }),
  "mkt-live-danmaku-outreach": Object.freeze({ shape: "teardrop", color: "orange" }),
  "mkt-viral-work-analysis": Object.freeze({ shape: "blob", color: "red" }),
  "mkt-find-people": Object.freeze({ shape: "wedge", color: "blue" }),
  prospect_researcher: Object.freeze({ shape: "teardrop", color: "cyan" }),
  "mkt-cold-writer": Object.freeze({ shape: "gem", color: "red" }),
  "mkt-intent-analyst": Object.freeze({ shape: "pebble", color: "yellow" }),
  "mkt-cold-writer": Object.freeze({ shape: "gem", color: "red" })
});

export const GROK_AVATAR_RUNTIME_SOURCE = Object.freeze({
  package: "Grok_Bot_0.44.0.dmg",
  colorFallback: "stable-agent-id-hash",
  shapeFallback: "stable-agent-id-hash",
  explicitFields: Object.freeze(["avatarShape", "avatarColor"])
});

export const GROK_AVATAR_ARCHITECTURE = Object.freeze({
  top: Object.freeze(["main", "mkt-comment-acquisition"]),
  middle: Object.freeze(["mkt-find-people", "mkt-intent-analyst", "mkt-dm-inbox", "mkt-gold-customer-service"]),
  extensions: Object.freeze([
    "mkt-find-people", "mkt-intent-analyst", "mkt-cold-writer", "mkt-live-danmaku-analysis",
    "mkt-live-danmaku-outreach", "mkt-viral-work-analysis"
  ])
});

const STATE_PROFILES = Object.freeze(Object.fromEntries(
  GROK_EXPRESSION_STATE_NAMES.map((name) => [name, {
    expressions: GROK_EXPRESSION_SEQUENCES[name],
    expressionMs: GROK_EXPRESSION_DURATIONS[name] || [1800, 3200],
    blinkMs: GROK_EXPRESSION_PAUSES[name] || [2500, 5000]
  }])
));

function stateSpinDelay(state) {
  if (state === "celebrate") return [140, 140];
  if (state === "excited") return [400, 1100];
  if (state === "searching") return [800, 1600];
  if (state === "working") return [1200, 2400];
  return [6000, 10000];
}

const SHAPE_METRICS = Object.freeze({
  blob: { fit: null, radius: 114.31, beltRadius: 114.26, tiltScale: 1, top: .01, bottom: 228.44, face: { x: 0, y: 0, sx: 1, sy: 1, eye: 1 }, inscribedFaceScale: .995 },
  pebble: { fit: { k: 1.0151197022718437, dx: 2.701750000000004, dy: .9555000000000007 }, radius: 117.57, beltRadius: 114.1, tiltScale: 1, top: 10.56, bottom: 217.98, face: { x: 2, y: 0, sx: .97, sy: .86, eye: 1 }, inscribedFaceScale: .991 },
  bean: { fit: { k: 1.020459215581167, dx: -18.95949999999999, dy: .0005000000000023874 }, radius: 118.32, beltRadius: 85.37, tiltScale: 1, top: .05, bottom: 228.49, face: { x: 0, y: 0, sx: .72, sy: .9, eye: .87 }, inscribedFaceScale: .998 },
  egg: { fit: { k: 1.0107964601769912, dx: .0004999999999881766, dy: .0004999999999881766 }, radius: 114.22, beltRadius: 94.16, tiltScale: 1, top: .05, bottom: 228.49, face: { x: 0, y: 2, sx: .77, sy: .97, eye: .93 }, inscribedFaceScale: .996 },
  squircle: { fit: { k: 1.0674766355140186, dx: .0004999999999881766, dy: .0004999999999881766 }, radius: 136.95, beltRadius: 114.22, tiltScale: .55, top: .05, bottom: 228.49, face: { x: 0, y: 0, sx: 1, sy: 1, eye: 1 }, inscribedFaceScale: .995 },
  tablet: { fit: null, radius: 114, beltRadius: 113.99, tiltScale: .38, top: 40.27, bottom: 188.27, face: { x: 0, y: 0, sx: .94, sy: .65, eye: .82 }, inscribedFaceScale: 1 },
  capsule: { fit: { k: 1.0107964601769912, dx: .0004999999999881766, dy: .0004999999999881766 }, radius: 114.22, beltRadius: 72.78, tiltScale: 1, top: .05, bottom: 228.49, face: { x: 0, y: 0, sx: .64, sy: .92, eye: .81 }, inscribedFaceScale: .988 },
  cylinder: { fit: { k: 1.0383636363636364, dx: .0004999999999881766, dy: .0004999999999881766 }, radius: 129.21, beltRadius: 97.61, tiltScale: 1, top: .05, bottom: 228.49, face: { x: 0, y: 0, sx: .85, sy: .96, eye: .99 }, inscribedFaceScale: .999 },
  hex: { fit: { k: 1.0478899082568807, dx: .0005000000000023874, dy: .0004999999999881766 }, radius: 114.19, beltRadius: 103.46, tiltScale: 1, top: .09, bottom: 228.45, face: { x: 0, y: 0, sx: .91, sy: .91, eye: 1 }, inscribedFaceScale: .99 },
  gem: { fit: { k: 1.0107964601769912, dx: .0004999999999881766, dy: .0004999999999881766 }, radius: 114.22, beltRadius: 113.18, tiltScale: 1, top: .05, bottom: 228.49, face: { x: 0, y: 0, sx: .89, sy: .89, eye: .99 }, inscribedFaceScale: .992 },
  crystal: { fit: { k: 1.0800683735781036, dx: .0004999999999881766, dy: .9362002787422341 }, radius: 114.24, beltRadius: 82.09, tiltScale: 1, top: .05, bottom: 228.51, face: { x: 0, y: 0, sx: .71, sy: .89, eye: .86 }, inscribedFaceScale: .998 },
  wedge: { fit: { k: 1.233743789155325, dx: .0004999999999881766, dy: 19.510499999999993 }, radius: 142.18, beltRadius: 114.2, tiltScale: .22, top: 10.01, bottom: 218.53, face: { x: 0, y: 24, sx: .7, sy: .7, eye: .79, leftDX: -6 }, inscribedFaceScale: .996 },
  shield: { fit: { k: 1.0107964601769912, dx: .0004999999999881766, dy: 5.000499999999988 }, radius: 130.33, beltRadius: 99.05, tiltScale: 1, top: .05, bottom: 228.49, face: { x: 0, y: 0, sx: .79, sy: .98, eye: .95 }, inscribedFaceScale: .991 },
  dome: { fit: null, radius: 135.99, beltRadius: 114, tiltScale: .15, top: 32.27, bottom: 196.27, face: { x: 0, y: 4, sx: .85, sy: .68, eye: .82 }, inscribedFaceScale: 1 },
  arch: { fit: { k: 1.0107964601769912, dx: .0004999999999881766, dy: .0004999999999881766 }, radius: 134.25, beltRadius: 76.82, tiltScale: .15, top: .05, bottom: 228.49, face: { x: 0, y: 0, sx: .67, sy: .97, eye: .85 }, inscribedFaceScale: .996 },
  cloud: { fit: { k: .9762445312207865, dx: 1.0023749999999865, dy: -1.9995000000000118 }, radius: 118.67, beltRadius: 114.2, tiltScale: 1, top: 22.5, bottom: 206.04, face: { x: 0, y: 4, sx: .79, sy: .7, eye: .81 }, inscribedFaceScale: .991 },
  teardrop: { fit: { k: 1.0341619838106533, dx: 0, dy: -3.532834054775506 }, radius: 114.31, beltRadius: 90.99, tiltScale: 1, top: -.04, bottom: 228.51, face: { x: 0, y: 22, sx: .79, sy: .79, eye: .88 }, inscribedFaceScale: .995 },
  leaf: { fit: { k: 1.0107964601769912, dx: .0004999999999881766, dy: .0004999999999881766 }, radius: 114.22, beltRadius: 88.94, tiltScale: 1, top: .05, bottom: 228.49, face: { x: 0, y: 0, sx: .73, sy: .91, eye: .88 }, inscribedFaceScale: .998 }
});

const BLOB_PATH = "M228.541 114.228C228.541 130.133 225.184 145.994 218.738 160.534C212.674 174.217 203.904 186.669 193.065 196.988C155.933 232.34 99.497 238.596 55.5255 212.24C45.097 205.99 35.6851 198.072 27.7451 188.866C19.1926 178.953 12.3686 167.569 7.65781 155.351C2.60712 142.264 0 128.257 0 114.228C0 98.3219 3.35751 82.4611 9.80315 67.9215C15.8672 54.2382 24.6377 41.7862 35.4767 31.4668C72.6081 -3.88483 129.044 -10.1413 173.016 16.2153C183.444 22.4653 192.856 30.3829 200.796 39.5896C209.349 49.5018 216.173 60.8859 220.883 73.1037C225.934 86.1906 228.541 100.198 228.541 114.228Z";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function smoothstep(value) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function hash32(value) {
  let hash = 2166136261;
  for (const character of String(value || "")) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value + 1831565813) | 0;
    let result = Math.imul(value ^ value >>> 15, 1 | value);
    result = (result + Math.imul(result ^ result >>> 7, 61 | result)) ^ result;
    return ((result ^ result >>> 14) >>> 0) / 4294967296;
  };
}

function stableIndex(value, length, salt = 0) {
  const random = seededRandom((hash32(value) ^ Math.imul(salt, 2654435769)) >>> 0);
  return Math.floor(random() * length) % length;
}

function packageColorFor(value) {
  return PACKAGE_AVATAR_COLOR_IDS[stableIndex(value, PACKAGE_AVATAR_COLOR_IDS.length, 1)] || "gray";
}

function packageShapeFor(value) {
  let hash = hash32(value) | 0;
  hash = Math.imul(hash ^ hash >>> 16, 73244475);
  hash = Math.imul(hash ^ hash >>> 13, 3266489909);
  return PACKAGE_AVATAR_FALLBACK_SHAPES[((hash ^ hash >>> 16) >>> 0) % PACKAGE_AVATAR_FALLBACK_SHAPES.length] || "blob";
}

function packageCatalogFor(value) {
  const catalog = GROK_AVATAR_CATALOG[value] || GROK_AVATAR_CATALOG[PACKAGE_ROLE_ALIASES[value]];
  if (catalog) return catalog;
  const extensionIndex = GROK_AVATAR_ARCHITECTURE.extensions.indexOf(value);
  if (extensionIndex >= 0) return PACKAGE_EXTENSION_SLOTS[extensionIndex % PACKAGE_EXTENSION_SLOTS.length];
  return null;
}

function roundNumber(value) {
  return Math.round(value * 100) / 100;
}

class PathBuilder {
  constructor() { this.path = ""; this.x = 0; this.y = 0; }
  move(x, y) { this.path += `M${roundNumber(x)} ${roundNumber(y)}`; this.x = x; this.y = y; return this; }
  line(x, y) { this.path += `L${roundNumber(x)} ${roundNumber(y)}`; this.x = x; this.y = y; return this; }
  curve(x1, y1, x2, y2, x, y) { this.path += `C${roundNumber(x1)} ${roundNumber(y1)} ${roundNumber(x2)} ${roundNumber(y2)} ${roundNumber(x)} ${roundNumber(y)}`; this.x = x; this.y = y; return this; }
  corner(from, point, to, radius) {
    const unit = (a, b) => { const x = a[0] - b[0]; const y = a[1] - b[1]; const length = Math.hypot(x, y) || 1; return [x / length, y / length]; };
    const before = unit(from, point); const after = unit(to, point);
    const start = [point[0] + before[0] * radius, point[1] + before[1] * radius];
    const end = [point[0] + after[0] * radius, point[1] + after[1] * radius];
    if (this.path) this.line(start[0], start[1]); else this.move(start[0], start[1]);
    this.path += `Q${roundNumber(point[0])} ${roundNumber(point[1])} ${roundNumber(end[0])} ${roundNumber(end[1])}`;
    this.x = end[0]; this.y = end[1]; return this;
  }
  arc(cx, cy, rx, ry, start, end) {
    const segments = Math.max(1, Math.ceil(Math.abs(end - start) / (Math.PI / 2)));
    const step = (end - start) / segments; const coefficient = 4 / 3 * Math.tan(step / 4); let angle = start;
    for (let index = 0; index < segments; index += 1) {
      const next = angle + step;
      const from = [cx + rx * Math.cos(angle), cy + ry * Math.sin(angle)];
      const to = [cx + rx * Math.cos(next), cy + ry * Math.sin(next)];
      this.curve(from[0] - coefficient * rx * Math.sin(angle), from[1] + coefficient * ry * Math.cos(angle), to[0] + coefficient * rx * Math.sin(next), to[1] - coefficient * ry * Math.cos(next), to[0], to[1]);
      angle = next;
    }
    return this;
  }
  close() { return `${this.path}Z`; }
}

function smoothPath(points) {
  let path = `M${roundNumber(points[0][0])} ${roundNumber(points[0][1])}`;
  for (let index = 0; index < points.length; index += 1) {
    const previous = points[(index - 1 + points.length) % points.length];
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const nextNext = points[(index + 2) % points.length];
    path += `C${roundNumber(current[0] + (next[0] - previous[0]) / 6)} ${roundNumber(current[1] + (next[1] - previous[1]) / 6)} ${roundNumber(next[0] - (nextNext[0] - current[0]) / 6)} ${roundNumber(next[1] - (nextNext[1] - current[1]) / 6)} ${roundNumber(next[0])} ${roundNumber(next[1])}`;
  }
  return `${path}Z`;
}

function qg(fn, samples = 128) {
  return smoothPath(Array.from({ length: samples }, (_, index) => fn(index / samples * TWO_PI)));
}

function roundedPolygonPath(points, radii) {
  const builder = new PathBuilder();
  for (let index = 0; index < points.length; index += 1) {
    const radius = typeof radii === "number" ? radii : radii[index % radii.length];
    builder.corner(points[(index - 1 + points.length) % points.length], points[index], points[(index + 1) % points.length], radius);
  }
  return builder.close();
}

function polygonPath(radius, sides, corner = 0, rotation = 0) {
  return roundedPolygonPath(Array.from({ length: sides }, (_, index) => {
    const angle = rotation + index / sides * TWO_PI;
    return [CENTER + Math.cos(angle) * radius, CENTER + Math.sin(angle) * radius];
  }), corner);
}

function circleUnionPath(circles, samples = 160) {
  return qg((angle) => {
    const x = Math.cos(angle); const y = Math.sin(angle); let radius = 0;
    for (const [cx, cy, circleRadius] of circles) {
      const dx = cx - CENTER; const dy = cy - CENTER;
      const projection = x * dx + y * dy;
      const discriminant = projection * projection - (dx * dx + dy * dy) + circleRadius * circleRadius;
      if (discriminant <= 0) continue;
      radius = Math.max(radius, projection + Math.sqrt(discriminant));
    }
    return [CENTER + x * radius, CENTER + y * radius];
  }, samples);
}

function superellipse(radiusX, radiusY, exponent) {
  return qg((angle) => {
    const x = Math.cos(angle); const y = Math.sin(angle);
    return [CENTER + Math.sign(x) * Math.pow(Math.abs(x), 2 / exponent) * radiusX, CENTER + Math.sign(y) * Math.pow(Math.abs(y), 2 / exponent) * radiusY];
  });
}

function tabletPath(radius, halfHeight) {
  return new PathBuilder().move(CENTER - radius + halfHeight, CENTER - halfHeight).line(CENTER + radius - halfHeight, CENTER - halfHeight)
    .arc(CENTER + radius - halfHeight, CENTER, halfHeight, halfHeight, -Math.PI / 2, Math.PI / 2)
    .line(CENTER - radius + halfHeight, CENTER + halfHeight).arc(CENTER - radius + halfHeight, CENTER, halfHeight, halfHeight, Math.PI / 2, Math.PI * 3 / 2).close();
}

function capsulePath(radiusX, radiusY) {
  return new PathBuilder().move(CENTER - radiusX, CENTER + radiusY - radiusX).line(CENTER - radiusX, CENTER - radiusY + radiusX)
    .arc(CENTER, CENTER - radiusY + radiusX, radiusX, radiusX, Math.PI, TWO_PI)
    .line(CENTER + radiusX, CENTER + radiusY - radiusX).arc(CENTER, CENTER + radiusY - radiusX, radiusX, radiusX, 0, Math.PI).close();
}

function cylinderPath(radiusX, radiusY, capRadius) {
  return new PathBuilder().move(CENTER - radiusX, CENTER - radiusY + capRadius).arc(CENTER, CENTER - radiusY + capRadius, radiusX, capRadius, Math.PI, TWO_PI)
    .line(CENTER + radiusX, CENTER + radiusY - capRadius).arc(CENTER, CENTER + radiusY - capRadius, radiusX, capRadius, 0, Math.PI).close();
}

function domePath(radius, height, cap) {
  const y = CENTER + height;
  return new PathBuilder().move(CENTER - radius, y - cap).arc(CENTER, y - cap, radius, 2 * height - cap, Math.PI, TWO_PI)
    .line(CENTER + radius, y - cap).curve(CENTER + radius, y, CENTER + radius, y, CENTER + radius - cap, y)
    .line(CENTER - radius + cap, y).curve(CENTER - radius, y, CENTER - radius, y, CENTER - radius, y - cap).close();
}

function archPath(radius, height, cap) {
  const y = CENTER + height; const base = CENTER - height + radius;
  return new PathBuilder().move(CENTER - radius, base).arc(CENTER, base, radius, radius, Math.PI, TWO_PI)
    .line(CENTER + radius, y - cap).curve(CENTER + radius, y, CENTER + radius, y, CENTER + radius - cap, y)
    .line(CENTER - radius + cap, y).curve(CENTER - radius, y, CENTER - radius, y, CENTER - radius, y - cap).close();
}

function shieldPath(width, height, curve) {
  const top = CENTER - height; const bottom = CENTER + height;
  return new PathBuilder().move(CENTER - width, top + curve)
    .curve(CENTER - width, top - 2, CENTER - width * .5, top - 10, CENTER, top - 10)
    .curve(CENTER + width * .5, top - 10, CENTER + width, top - 2, CENTER + width, top + curve)
    .curve(CENTER + width, CENTER + height * .42, CENTER + width * .62, bottom, CENTER, bottom)
    .curve(CENTER - width * .62, bottom, CENTER - width, CENTER + height * .42, CENTER - width, top + curve).close();
}

function eggPath(radiusX, radiusY, modifier) {
  return qg((angle) => { const y = Math.sin(angle); const taper = (1 - y) / 2; return [CENTER + Math.cos(angle) * radiusX * (1 - modifier * taper * taper), CENTER + y * radiusY]; });
}

function teardropPath(radius, baseY, centerY, cornerRadius) {
  const ratio = clamp(radius / (centerY - baseY), -1, 1); const width = Math.sqrt(1 - ratio * ratio);
  const left = [CENTER + radius * width, centerY - radius * ratio]; const right = [CENTER - radius * width, centerY - radius * ratio];
  const angle = Math.atan2(left[1] - centerY, left[0] - CENTER);
  return new PathBuilder().corner(left, [CENTER, baseY], right, cornerRadius).line(right[0], right[1]).arc(CENTER, centerY, radius, radius, Math.PI - angle, angle).close();
}

function leafPath(radiusX, radiusY, exponent) {
  return qg((angle) => { const x = Math.cos(angle); const y = Math.sin(angle); return [CENTER + x * radiusX * Math.pow(Math.max(1 - y * y, 0), exponent / 2 - .5), CENTER + y * radiusY]; });
}

function beanPath(radiusX, radiusY, notch, notchAngle) {
  return qg((angle) => {
    const distance = Math.abs(((angle - notchAngle + Math.PI) % TWO_PI + TWO_PI) % TWO_PI - Math.PI);
    const bump = Math.exp(-(distance * distance) / .4232);
    const opposite = Math.abs(((angle - notchAngle - Math.PI + Math.PI) % TWO_PI + TWO_PI) % TWO_PI - Math.PI);
    return [CENTER + Math.cos(angle) * radiusX * (1 - notch * bump + notch * .34 * Math.exp(-(opposite * opposite) / .4232)), CENTER + Math.sin(angle) * radiusY * (1 - notch * bump + notch * .34 * Math.exp(-(opposite * opposite) / .4232))];
  });
}

function pebblePath(radius, irregularity, phase) {
  return qg((angle) => { const r = radius * (1 + irregularity * (.6 * Math.sin(angle * 2 + phase) + .4 * Math.sin(angle * 3 - phase))); return [CENTER + Math.cos(angle) * r, CENTER + Math.sin(angle) * r * .98]; });
}

function applyFit(path, fit) {
  if (!fit) return path;
  let coordinateIndex = 0;
  return path.replace(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi, (token) => {
    coordinateIndex ^= 1;
    const offset = coordinateIndex ? fit.dx : fit.dy;
    return String(roundNumber(CENTER + (Number(token) + offset - CENTER) * fit.k));
  });
}

function rawShapePath(shape) {
  switch (shape) {
    case "blob": return BLOB_PATH;
    case "pebble": return pebblePath(108, .075, 1.1);
    case "bean": return beanPath(94, 112, .34, Math.PI);
    case "egg": return eggPath(98, 113, .22);
    case "squircle": return superellipse(107, 107, 4.2);
    case "tablet": return tabletPath(114, 74);
    case "capsule": return capsulePath(72, 113);
    case "cylinder": return cylinderPath(94, 110, 34);
    case "hex": return polygonPath(114, 6, 20, Math.PI / 6);
    case "gem": return superellipse(112, 113, 1.5);
    case "crystal": return roundedPolygonPath([[CENTER, CENTER - 113], [CENTER + 76, CENTER - 52], [CENTER + 76, CENTER + 52], [CENTER, CENTER + 113], [CENTER - 76, CENTER + 52], [CENTER - 76, CENTER - 52]], [20, 26]);
    case "wedge": return polygonPath(130, 3, 60, -Math.PI / 2);
    case "shield": return shieldPath(98, 108, 30);
    case "dome": return domePath(114, 82, 26);
    case "arch": return archPath(76, 113, 20);
    case "cloud": return circleUnionPath([[CENTER - 62, CENTER + 26, 56], [CENTER + 62, CENTER + 26, 54], [CENTER, CENTER + 34, 62], [CENTER - 24, CENTER - 30, 62], [CENTER + 38, CENTER - 26, 54]], 160);
    case "teardrop": return teardropPath(88, CENTER - 114, CENTER + 26, 18);
    case "leaf": return leafPath(88, 113, 1.5);
    default: return BLOB_PATH;
  }
}

function shapePath(shape) {
  const normalized = GROK_AVATAR_SHAPES.includes(shape) ? shape : "blob";
  return applyFit(rawShapePath(normalized), SHAPE_METRICS[normalized].fit);
}

export function grokAvatarPathFor(shape) {
  return shapePath(GROK_AVATAR_SHAPES.includes(shape) ? shape : "blob");
}

export function grokAvatarRoleFor(value) {
  const profile = value && typeof value === "object" ? value : null;
  const normalized = String(profile?.id ?? profile?.type ?? profile?.name ?? value ?? "agent").trim() || "agent";
  if (GROK_AVATAR_ARCHITECTURE.top.includes(normalized)) return "top";
  if (GROK_AVATAR_ARCHITECTURE.middle.includes(normalized)) return "middle";
  return "extension";
}

export function grokAvatarSpecFor(value) {
  const profile = value && typeof value === "object" ? value : null;
  const normalized = String(profile?.id ?? profile?.type ?? profile?.name ?? value ?? "agent").trim() || "agent";
  const hash = hash32(normalized);
  const explicitShape = profile?.avatarShape ?? profile?.avatar_shape;
  const explicitColor = profile?.avatarColor ?? profile?.avatar_color;
  const catalog = packageCatalogFor(normalized);
  return {
    shape: GROK_AVATAR_SHAPES.includes(explicitShape) ? explicitShape : catalog?.shape || packageShapeFor(normalized),
    color: Object.hasOwn(GROK_AVATAR_COLORS, explicitColor) ? explicitColor : catalog?.color || packageColorFor(normalized),
    seed: hash
  };
}

function randomBetween(range) {
  return range[0] + Math.random() * (range[1] - range[0]);
}

function packageGazeTargetForState(state) {
  const sign = () => (Math.random() < .5 ? -1 : 1);
  let x = 0;
  let y = 0;
  let min = 2500;
  let max = 5500;
  switch (state) {
    case "idle": break;
    case "listening": x = randomBetween([-.3, .3]) * 15; y = randomBetween([-.25, .25]) * 9; min = 2200; max = 4200; break;
    case "thinking": x = sign() * randomBetween([.5, 1]) * 15; y = -randomBetween([.4, 1]) * 9; min = 1500; max = 2800; break;
    case "searching": x = sign() * randomBetween([.7, 1]) * 15; y = randomBetween([-1, 1]) * 9; min = 550; max = 1150; break;
    case "working": x = randomBetween([-.4, .4]) * 15; y = randomBetween([.4, 1]) * 9; min = 1200; max = 2400; break;
    case "excited": x = randomBetween([-1, 1]) * 15; y = randomBetween([-1, .3]) * 9; min = 700; max = 1400; break;
    case "surprised": min = 1600; max = 2600; break;
    case "suspicious": x = sign() * 15; y = .3 * 9; min = 2200; max = 4200; break;
    case "angry": x = randomBetween([-.2, .2]) * 15; y = .2 * 9; min = 1800; max = 3200; break;
    case "drowsy": x = randomBetween([-.4, .4]) * 15; y = randomBetween([.4, 1]) * 9; min = 2500; max = 4500; break;
    case "happy": x = randomBetween([-.7, .7]) * 15; y = -randomBetween([0, .6]) * 9; min = 1800; max = 3400; break;
    case "curious": x = sign() * randomBetween([.6, 1]) * 15; y = randomBetween([-1, 1]) * 9; min = 950; max = 1900; break;
    case "confused": x = sign() * randomBetween([.5, 1]) * 15; y = randomBetween([-.6, 1]) * 9; min = 1100; max = 2300; break;
    case "bored": x = sign() * randomBetween([.7, 1]) * 15; y = randomBetween([.4, .9]) * 9; min = 3000; max = 6000; break;
    case "proud": x = randomBetween([-.3, .3]) * 15; y = -randomBetween([.3, .7]) * 9; min = 2600; max = 4600; break;
    case "shy": x = sign() * randomBetween([.6, 1]) * 15; y = randomBetween([.5, 1]) * 9; min = 2000; max = 4000; break;
    case "sad": x = randomBetween([-.3, .3]) * 15; y = randomBetween([.6, 1]) * 9; min = 2800; max = 5000; break;
    case "laughing": x = randomBetween([-.5, .5]) * 15; y = -randomBetween([.2, .6]) * 9; min = 800; max = 1700; break;
    case "scared": x = sign() * randomBetween([.7, 1]) * 15; y = randomBetween([-.6, .6]) * 9; min = 450; max = 1050; break;
    case "playful": x = sign() * randomBetween([.5, 1]) * 15; y = -randomBetween([0, .6]) * 9; min = 900; max = 1800; break;
    case "notifying": {
      const strong = Math.random() < .72;
      x = (strong ? .45 : .1) * 15;
      y = -(strong ? .3 : .05) * 9;
      min = 1200;
      max = 2400;
      break;
    }
    default: x = randomBetween([-.4, .4]) * 15; y = randomBetween([-.3, .3]) * 9;
  }
  return { x, y, min, max };
}

function ringBounds(points) {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  return { centerX: (left + right) / 2, centerY: (top + bottom) / 2, width: Math.max(right - left, 1), height: Math.max(bottom - top, 1) };
}

function mapRing(points, source, metrics, _expressionIndex) {
  return points.map(([x, y]) => [
    CENTER + (x - CENTER) * metrics.sx + (source.centerX - CENTER) * .02,
    CENTER + (y - CENTER) * metrics.sy
  ]);
}

function averagePoint(points) {
  let x = 0;
  let y = 0;
  for (const point of points) {
    x += point[0];
    y += point[1];
  }
  return [x / points.length, y / points.length];
}

function samplePath(path, segmentLength = 4) {
  const tokens = path.match(/[MLCQZmlcqz]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) || [];
  const points = [];
  let index = 0; let command = ""; let startX = 0; let startY = 0; let currentX = 0; let currentY = 0;
  const number = () => Number(tokens[index++]);
  const add = (fn, distance) => { for (let step = 1; step <= Math.max(2, Math.ceil(distance / segmentLength)); step += 1) points.push(fn(step / Math.max(2, Math.ceil(distance / segmentLength)))); };
  while (index < tokens.length) {
    if (/[a-z]/i.test(tokens[index])) command = tokens[index++].toUpperCase();
    if (command === "Z") {
      const distance = Math.hypot(currentX - startX, currentY - startY);
      if (distance > .01) add((t) => [currentX + (startX - currentX) * t, currentY + (startY - currentY) * t], distance);
      currentX = startX; currentY = startY; continue;
    }
    if (command === "M") { startX = currentX = number(); startY = currentY = number(); points.push([currentX, currentY]); command = "L"; continue; }
    if (command === "L") {
      const x = number(); const y = number(); const fromX = currentX; const fromY = currentY; const distance = Math.hypot(x - fromX, y - fromY);
      add((t) => [fromX + (x - fromX) * t, fromY + (y - fromY) * t], distance); currentX = x; currentY = y; continue;
    }
    if (command === "Q") {
      const c1x = number(); const c1y = number(); const x = number(); const y = number(); const fromX = currentX; const fromY = currentY;
      const distance = Math.hypot(c1x - fromX, c1y - fromY) + Math.hypot(x - c1x, y - c1y);
      add((t) => { const inv = 1 - t; return [inv * inv * fromX + 2 * inv * t * c1x + t * t * x, inv * inv * fromY + 2 * inv * t * c1y + t * t * y]; }, distance); currentX = x; currentY = y; continue;
    }
    if (command === "C") {
      const c1x = number(); const c1y = number(); const c2x = number(); const c2y = number(); const x = number(); const y = number(); const fromX = currentX; const fromY = currentY;
      const distance = Math.hypot(c1x - fromX, c1y - fromY) + Math.hypot(c2x - c1x, c2y - c1y) + Math.hypot(x - c2x, y - c2y);
      add((t) => { const inv = 1 - t; return [inv ** 3 * fromX + 3 * inv ** 2 * t * c1x + 3 * inv * t ** 2 * c2x + t ** 3 * x, inv ** 3 * fromY + 3 * inv ** 2 * t * c1y + 3 * inv * t ** 2 * c2y + t ** 3 * y]; }, distance); currentX = x; currentY = y; continue;
    }
    index += 1;
  }
  return points;
}

function spanIndex(points, samples = 160) {
  let top = Infinity; let bottom = -Infinity;
  for (const point of points) { top = Math.min(top, point[1]); bottom = Math.max(bottom, point[1]); }
  const height = bottom - top; const sampleY = (index) => top + height * (index + .5) / samples;
  const left = new Float64Array(samples); const right = new Float64Array(samples); const outerLeft = new Float64Array(samples); const outerRight = new Float64Array(samples);
  for (let index = 0; index < samples; index += 1) {
    const y = sampleY(index); let leftEdge = -Infinity; let rightEdge = Infinity; let minEdge = Infinity; let maxEdge = -Infinity;
    for (let pointIndex = 0; pointIndex < points.length; pointIndex += 1) {
      const from = points[pointIndex]; const to = points[(pointIndex + 1) % points.length];
      if ((from[1] <= y) === (to[1] <= y)) continue;
      const x = from[0] + (to[0] - from[0]) * (y - from[1]) / (to[1] - from[1]);
      if (x <= CENTER) { if (x > leftEdge) leftEdge = x; } else if (x < rightEdge) rightEdge = x;
      minEdge = Math.min(minEdge, x); maxEdge = Math.max(maxEdge, x);
    }
    left[index] = Number.isFinite(leftEdge) ? leftEdge : CENTER; right[index] = Number.isFinite(rightEdge) ? rightEdge : CENTER;
    outerLeft[index] = Number.isFinite(minEdge) ? minEdge : CENTER; outerRight[index] = Number.isFinite(maxEdge) ? maxEdge : CENTER;
  }
  const interpolate = (first, second) => (y) => {
    const position = clamp((y - top) / height * samples - .5, 0, samples - 1); const lower = Math.floor(position); const fraction = position - lower; const upper = Math.min(lower + 1, samples - 1);
    return [first[lower] + (first[upper] - first[lower]) * fraction, second[lower] + (second[upper] - second[lower]) * fraction];
  };
  return { top, bottom, spanAt: interpolate(left, right), outerAt: interpolate(outerLeft, outerRight) };
}

const RADIAL_SAMPLES = 96;
function radialRing(points) {
  return Array.from({ length: RADIAL_SAMPLES }, (_, index) => {
    const angle = index / RADIAL_SAMPLES * TWO_PI; const cos = Math.cos(angle); const sin = Math.sin(angle); let distance = 0;
    for (let pointIndex = 0; pointIndex < points.length; pointIndex += 1) {
      const from = points[pointIndex]; const to = points[(pointIndex + 1) % points.length];
      const x1 = from[0] - CENTER; const y1 = from[1] - CENTER; const x2 = to[0] - CENTER; const y2 = to[1] - CENTER;
      const denominator = (x2 - x1) * sin - (y2 - y1) * cos;
      if (Math.abs(denominator) < 1e-9) continue;
      const along = (x1 * sin - y1 * cos) / -denominator;
      if (along < 0 || along > 1) continue;
      const hit = (x1 + (x2 - x1) * along) * cos + (y1 + (y2 - y1) * along) * sin;
      distance = Math.max(distance, hit);
    }
    return [CENTER + cos * distance, CENTER + sin * distance];
  });
}

function isEyeInsideFace(metrics, centerX, points) {
  const faceX = CENTER + metrics.face.x;
  const faceY = CENTER + metrics.face.y;
  const faceRadiusX = metrics.face.sx * CENTER * metrics.inscribedFaceScale;
  const faceRadiusY = metrics.face.sy * CENTER * metrics.inscribedFaceScale;
  return points.every(({ dx, y }) => {
    const normalizedX = (centerX + dx - faceX) / faceRadiusX;
    const normalizedY = (y - faceY) / faceRadiusY;
    return normalizedX * normalizedX + normalizedY * normalizedY <= 1;
  });
}

function fitEyeToShape(span, centerX, points) {
  let minimum = -Infinity;
  let maximum = Infinity;
  for (const { dx, y } of points) {
    const [left, right] = span.spanAt(y);
    minimum = Math.max(minimum, left - dx);
    maximum = Math.min(maximum, right - dx);
  }
  if (!Number.isFinite(minimum) && !Number.isFinite(maximum)) return centerX;
  if (!Number.isFinite(minimum)) return Math.min(centerX, maximum);
  if (!Number.isFinite(maximum)) return Math.max(centerX, minimum);
  return minimum <= maximum ? clamp(centerX, minimum, maximum) : (minimum + maximum) / 2;
}

function matrixFromEuler(turn, tilt, roll) {
  const radians = Math.PI / 180;
  const cosTurn = Math.cos(turn * radians);
  const sinTurn = Math.sin(turn * radians);
  const cosTilt = Math.cos(tilt * radians);
  const sinTilt = Math.sin(tilt * radians);
  const cosRoll = Math.cos(roll * radians);
  const sinRoll = Math.sin(roll * radians);
  return [
    cosRoll * cosTurn - sinRoll * sinTilt * sinTurn, -sinRoll * cosTilt, cosRoll * sinTurn + sinRoll * sinTilt * cosTurn,
    sinRoll * cosTurn + cosRoll * sinTilt * sinTurn, cosRoll * cosTilt, sinRoll * sinTurn - cosRoll * sinTilt * cosTurn,
    -cosTilt * sinTurn, sinTilt, cosTilt * cosTurn
  ];
}

function multiplyMatrices(left, right) {
  return [
    left[0] * right[0] + left[1] * right[1] + left[2] * right[2],
    left[0] * right[3] + left[1] * right[4] + left[2] * right[5],
    left[0] * right[6] + left[1] * right[7] + left[2] * right[8],
    left[3] * right[0] + left[4] * right[1] + left[5] * right[2],
    left[3] * right[3] + left[4] * right[4] + left[5] * right[5],
    left[3] * right[6] + left[4] * right[7] + left[5] * right[8],
    left[6] * right[0] + left[7] * right[1] + left[8] * right[2],
    left[6] * right[3] + left[7] * right[4] + left[8] * right[5],
    left[6] * right[6] + left[7] * right[7] + left[8] * right[8]
  ];
}

function placeEye(shape, eyeIndex, pose = null, poseHome = null, tune = FACE_TUNE) {
  const metrics = SHAPE_METRICS[shape];
  const uniformEyes = UNIFORM_EYES;
  const face = {
    x: metrics.face.x,
    y: metrics.face.y,
    sx: metrics.face.sx * (tune?.gap ?? 1),
    sy: metrics.face.sy * (tune?.height ?? 1),
    eye: metrics.face.eye * (tune?.size ?? 1),
    leftDX: metrics.face.leftDX ?? 0
  };
  const poseMatrix = pose && poseHome
    ? multiplyMatrices(matrixFromEuler(pose.turn, pose.tilt, pose.roll), matrixFromEuler(poseHome.turn, poseHome.tilt, poseHome.roll))
    : null;
  const sourceRings = [GROK_EXPRESSIONS[0][0], GROK_EXPRESSIONS[0][1]];
  const centers = sourceRings.map(averagePoint);
  let leftExtent = 0; let rightExtent = 0;
  for (const [x] of sourceRings[0]) leftExtent = Math.max(leftExtent, Math.abs(x - centers[0][0]));
  for (const [x] of sourceRings[1]) rightExtent = Math.max(rightExtent, Math.abs(x - centers[1][0]));
  const leftDX = uniformEyes ? face.leftDX ?? 0 : 0;
  const gap = Math.abs(centers[1][0] - (centers[0][0] + leftDX)) * face.sx;
  const gapPadding = uniformEyes ? 0 : EYE_GAP_PADDING;
  const gapScale = leftExtent + rightExtent > .5 ? clamp((gap - gapPadding) / (leftExtent + rightExtent), .35, 4) : 4;
  const eyeScale = (uniformEyes ? 1 : face.eye) * clamp(PACKAGE_EYE_SCALE[shape] ?? 1, .25, 4);
  const scale = Math.min(clamp(eyeScale, .2, 2), gapScale);
  const width = Math.min(scale * (tune?.eyeWidth ?? 1), gapScale);
  const height = scale * (tune?.eyeHeight ?? 1);
  const result = [];
  for (let index = 0; index < 2; index += 1) {
    const ring = sourceRings[index];
    const [centerX, centerY] = centers[index];
    const translatedX = centerX + (index === 0 ? leftDX : 0);
    let px = (translatedX - CENTER) * face.sx;
    let py = clamp(CENTER + face.y + (centerY - CENTER) * face.sy, metrics.top + 2, metrics.bottom - 2);
    let a = 1; let b = 0; let c = 0; let d = 1;
    if (poseMatrix) {
      const nx = (translatedX - CENTER) / CENTER;
      const ny = (CENTER - centerY) / CENTER;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny)) || .02;
      const projectedX = poseMatrix[0] * nx + poseMatrix[1] * ny + poseMatrix[2] * nz;
      const projectedY = poseMatrix[3] * nx + poseMatrix[4] * ny + poseMatrix[5] * nz;
      px = projectedX * CENTER * face.sx;
      py = clamp(CENTER + face.y - projectedY * CENTER * face.sy, metrics.top + 2, metrics.bottom - 2);
      let tx = -ny * nx; let ty = 1 - ny * ny; let tz = -ny * nz;
      const tangentLength = Math.hypot(tx, ty, tz);
      if (tangentLength < 1e-6) { tx = 0; ty = 0; tz = 1; } else { tx /= tangentLength; ty /= tangentLength; tz /= tangentLength; }
      const bx = ny * tz - nz * ty; const by = nz * tx - nx * tz; const bz = nx * ty - ny * tx;
      const crossX = ny * tz - nz * ty;
      const crossY = nz * tx - nx * tz;
      const crossZ = nx * ty - ny * tx;
      const projectedTx = poseMatrix[0] * tx + poseMatrix[1] * ty + poseMatrix[2] * tz;
      const projectedTy = poseMatrix[3] * tx + poseMatrix[4] * ty + poseMatrix[5] * tz;
      const projectedCrossX = poseMatrix[0] * crossX + poseMatrix[1] * crossY + poseMatrix[2] * crossZ;
      const projectedCrossY = poseMatrix[3] * crossX + poseMatrix[4] * crossY + poseMatrix[5] * crossZ;
      const inverseBaseA = crossX;
      const inverseBaseB = -crossY;
      const inverseBaseC = tx;
      const inverseBaseD = -ty;
      const determinant = inverseBaseA * inverseBaseD - inverseBaseC * inverseBaseB || 1e-6;
      const inverseA = inverseBaseD / determinant;
      const inverseB = -inverseBaseC / determinant;
      const inverseC = -inverseBaseB / determinant;
      const inverseD = inverseBaseA / determinant;
      const projectedBaseX = projectedCrossX;
      const projectedBaseY = -projectedCrossY;
      const projectedTangentX = projectedTx;
      const projectedTangentY = -projectedTy;
      a = projectedBaseX * inverseA + projectedTangentX * inverseC;
      b = projectedBaseX * inverseB + projectedTangentX * inverseD;
      c = projectedBaseY * inverseA + projectedTangentY * inverseC;
      d = projectedBaseY * inverseB + projectedTangentY * inverseD;
    }
    const sx = Math.max(Math.hypot(a, b), .02) * width;
    const sy = Math.max(Math.hypot(c, d), .02) * height;
    const safePadding = EYE_BODY_PADDING * sy + 2;
    const safeY = clamp(py, metrics.top + safePadding, metrics.bottom - safePadding);
    const bounds = ring.filter((_, pointIndex) => pointIndex % 2 === 0).map(([x, y]) => ({ dx: (x - centerX) * sx, y: safeY + (y - centerY) * sy }));
    const eyeX = CENTER + face.x + px;
    const span = spanIndex(samplePath(shapePath(shape)));
    const constrainedX = isEyeInsideFace(metrics, eyeX, bounds) ? eyeX : fitEyeToShape(span, eyeX, bounds);
    result.push({ px: constrainedX, py: safeY, a: a * width, b: b * width, c: c * height, d: d * height, cx: centerX, cy: centerY });
  }
  return result[eyeIndex];
}

function expressionSourceRings(expressionIndex) {
  return GROK_EXPRESSIONS[expressionIndex] || GROK_EXPRESSIONS[0];
}

function expressionRings(shape, expressionIndex, tune = FACE_TUNE) {
  const source = expressionSourceRings(expressionIndex);
  const transforms = [
    placeEye(shape, 0, PACKAGE_POSE, PACKAGE_POSE_HOME, tune),
    placeEye(shape, 1, PACKAGE_POSE, PACKAGE_POSE_HOME, tune)
  ];
  return source.map((ring, eyeIndex) => {
    const transform = transforms[eyeIndex];
    return ring.map(([x, y]) => {
      const dx = x - transform.cx;
      const dy = y - transform.cy;
      return [transform.px + transform.a * dx + transform.c * dy, transform.py + transform.b * dx + transform.d * dy];
    });
  });
}

function pathRing(points) {
  return `M${points.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join("L")}Z`;
}

function principalRing(points) {
  const [cx, cy] = averagePoint(points);
  let xx = 0; let xy = 0; let yy = 0;
  for (const [x, y] of points) {
    const dx = x - cx;
    const dy = y - cy;
    xx += dx * dx;
    xy += dx * dy;
    yy += dy * dy;
  }
  const count = Math.max(points.length, 1);
  xx /= count; xy /= count; yy /= count;
  const discriminant = Math.sqrt(Math.max(0, (xx - yy) ** 2 + 4 * xy * xy));
  const eigenvalue = (xx + yy + discriminant) / 2;
  let ux = 1;
  let uy = 0;
  if (Math.abs(xy) > 1e-9 || Math.abs(xx - yy) > 1e-9) {
    ux = eigenvalue - yy;
    uy = xy;
    const length = Math.hypot(ux, uy) || 1;
    ux /= length;
    uy /= length;
  } else if (yy > xx) {
    ux = 0;
    uy = 1;
  }
  const directionLength = Math.hypot(ux, uy) || 1;
  ux /= directionLength;
  uy /= directionLength;
  if (uy < 0 || (Math.abs(uy) < 1e-8 && ux < 0)) {
    ux = -ux;
    uy = -uy;
  }
  const vx = -uy;
  const vy = ux;
  let halfLength = 0;
  let halfWidth = 0;
  for (const [x, y] of points) {
    const dx = x - cx;
    const dy = y - cy;
    halfLength = Math.max(halfLength, Math.abs(dx * ux + dy * uy));
    halfWidth = Math.max(halfWidth, Math.abs(dx * vx + dy * vy));
  }
  return { cx, cy, ux, uy, vx, vy, halfLength, halfWidth };
}

function rebuildRing(cx, cy, ux, uy, halfLength, halfWidth, length = 48) {
  const longitudinalRadius = Math.max(0, halfLength - halfWidth);
  const vx = -uy;
  const vy = ux;
  const points = [];
  for (let index = 0; index < length; index += 1) {
    const angle = index / length * TWO_PI;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const directionAlong = cos * ux + sin * uy;
    const directionAcross = cos * (-uy) + sin * ux;
    const span = halfWidth / Math.max(Math.abs(directionAcross), 1e-6);
    let radius;
    if (span * Math.abs(directionAlong) <= longitudinalRadius + 1e-6 && Number.isFinite(span)) {
      radius = span;
    } else {
      const x = (directionAlong >= 0 ? 1 : -1) * longitudinalRadius * directionAlong;
      const discriminant = Math.max(0, x * x - longitudinalRadius * longitudinalRadius + halfWidth * halfWidth);
      radius = x + Math.sqrt(discriminant);
    }
    const px = cx + ux * (radius * directionAlong) + vx * (radius * directionAcross);
    const py = cy + uy * (radius * directionAlong) + vy * (radius * directionAcross);
    points.push([Number.isFinite(px) ? px : cx, Number.isFinite(py) ? py : cy]);
  }
  return points;
}

function interpolateRing(from, to, amount) {
  const t = clamp(amount, 0, 1);
  if (t <= 0) return from;
  if (t >= 1) return to;
  if (!Array.isArray(from) || !Array.isArray(to) || from.length !== to.length || from.length < 4) {
    return from.map((point, index) => {
      const target = to[index] || point;
      return [point[0] + (target[0] - point[0]) * t, point[1] + (target[1] - point[1]) * t];
    });
  }
  const source = principalRing(from);
  const target = principalRing(to);
  let angleDelta = Math.atan2(target.uy, target.ux) - Math.atan2(source.uy, source.ux);
  while (angleDelta > Math.PI / 2) angleDelta -= Math.PI;
  while (angleDelta < -Math.PI / 2) angleDelta += Math.PI;
  const angle = Math.atan2(source.uy, source.ux) + angleDelta * t;
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const halfWidth = Math.max(.35, source.halfWidth + (target.halfWidth - source.halfWidth) * t);
  const halfLength = halfWidth
    + Math.max(0, source.halfLength - source.halfWidth) * (1 - t)
    + Math.max(0, target.halfLength - target.halfWidth) * t;
  return rebuildRing(
    source.cx + (target.cx - source.cx) * t,
    source.cy + (target.cy - source.cy) * t,
    ux,
    uy,
    halfLength,
    halfWidth,
    from.length
  );
}

function rotateRing(ring, angle) {
  const center = averagePoint(ring);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return ring.map(([x, y]) => {
    const dx = x - center[0];
    const dy = y - center[1];
    return [center[0] + dx * cos - dy * sin, center[1] + dx * sin + dy * cos];
  });
}

function orientRingPairToReference(pair, reference) {
  const source = [principalRing(pair[0]), principalRing(pair[1])];
  const target = [principalRing(reference[0]), principalRing(reference[1])];
  const normalize = (angle) => {
    while (angle > Math.PI / 2) angle -= Math.PI;
    while (angle < -Math.PI / 2) angle += Math.PI;
    return angle;
  };
  const sourceAngles = source.map(({ ux, uy }) => Math.atan2(uy, ux));
  const targetAngles = target.map(({ ux, uy }) => Math.atan2(uy, ux));
  const sharedDelta = (
    normalize(sourceAngles[0] - targetAngles[0])
    + normalize(sourceAngles[1] - targetAngles[1])
  ) / 2;
  return pair.map((ring, index) => {
    const angle = normalize(targetAngles[index] + sharedDelta - sourceAngles[index]);
    return rotateRing(ring, angle);
  });
}

function rebuildPairFromRight(pair) {
  const left = principalRing(pair[0]);
  const right = principalRing(pair[1]);
  return [pair[0], rebuildRing(right.cx, right.cy, right.ux, right.uy, left.halfLength, left.halfWidth, pair[1].length)];
}

function limitRingScale(ring, reference, maxScale = 1.05) {
  const source = principalRing(ring);
  const target = principalRing(reference);
  const scale = Math.max(
    source.halfLength / Math.max(target.halfLength, 1e-6),
    source.halfWidth / Math.max(target.halfWidth, 1e-6)
  );
  const amount = Math.min(1, maxScale / Math.max(scale, 1e-6));
  if (amount >= .999999) return ring;
  return ring.map(([x, y]) => [source.cx + (x - source.cx) * amount, source.cy + (y - source.cy) * amount]);
}

function equalizeRingWidths(pair, minHalfWidth = 0) {
  const left = principalRing(pair[0]);
  const right = principalRing(pair[1]);
  const halfWidth = Math.max(left.halfWidth, right.halfWidth, minHalfWidth);
  const normalize = (ring, metrics) => {
    if (metrics.halfWidth >= halfWidth * .92) return ring;
    return rebuildRing(
      metrics.cx,
      metrics.cy,
      metrics.ux,
      metrics.uy,
      Math.max(0, metrics.halfLength - metrics.halfWidth) + halfWidth,
      halfWidth,
      ring.length
    );
  };
  return [normalize(pair[0], left), normalize(pair[1], right)];
}

const PACKAGE_ANGRY_EXPRESSIONS = new Set(GROK_EXPRESSION_SEQUENCES.angry || []);
const PACKAGE_WIDTH_NORMALIZED_STATES = new Set(["suspicious", "confused", "drowsy", "bored", "sad"]);
const PACKAGE_SLEEPY_WIDTH_STATES = new Set(["drowsy", "bored", "sad"]);

function expressionRingsForState(state, expressionIndex) {
  let pair = expressionSourceRings(expressionIndex).map((ring) => ring.map(([x, y]) => [x, y]));
  if (state === "working") {
    if (PACKAGE_ANGRY_EXPRESSIONS.has(expressionIndex)) pair = orientRingPairToReference(pair, GROK_EXPRESSIONS[0]);
    pair = [
      limitRingScale(pair[0], GROK_EXPRESSIONS[0][0]),
      limitRingScale(pair[1], GROK_EXPRESSIONS[0][1])
    ];
    pair = rebuildPairFromRight(pair);
  }
  if (PACKAGE_WIDTH_NORMALIZED_STATES.has(state)) {
    pair = equalizeRingWidths(pair, PACKAGE_SLEEPY_WIDTH_STATES.has(state) ? 8.6 : 0);
  }
  return pair;
}

function blendRings(from, to, amount) {
  return from.map((ring, eyeIndex) => interpolateRing(ring, to[eyeIndex], amount));
}

function effectBlend(type, current, previous, progress, crossfade) {
  const amount = clamp(progress, 0, 1);
  const fade = clamp(crossfade, 0, 1);
  if (type == null) return 0;
  if (type === current) return amount * fade;
  if (type === previous) return amount * (1 - fade);
  return 0;
}

function advanceSpring(spring, stiffness, damping, dt) {
  spring.velocity += (-2 * damping * stiffness * spring.velocity - stiffness * stiffness * (spring.value - spring.target)) * dt;
  spring.value += spring.velocity * dt;
  if (!Number.isFinite(spring.value) || !Number.isFinite(spring.velocity)) {
    spring.value = spring.target;
    spring.velocity = 0;
  }
}

function expEase(amount, dt) {
  return 1 - Math.exp(60 * Math.log(1 - amount) * dt);
}

function el(name, attributes = {}) {
  const node = document.createElementNS(SVG_NS, name);
  Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, String(value)));
  return node;
}

function gradientVector(angle = 135) {
  const radians = (angle % 360) * Math.PI / 180;
  return {
    x1: .5 - Math.cos(radians) / 2,
    y1: .5 - Math.sin(radians) / 2,
    x2: .5 + Math.cos(radians) / 2,
    y2: .5 + Math.sin(radians) / 2
  };
}

function stateProfile(state) {
  return STATE_PROFILES[state] || STATE_PROFILES.idle;
}

function faceTuneForState(state) {
  if (state === "idle") return FACE_TUNE;
  if (state === "working") {
    return {
      ...FACE_TUNE,
      size: FACE_TUNE.size * WORKING_FACE_TUNE.size,
      eyeWidth: FACE_TUNE.eyeWidth * WORKING_FACE_TUNE.eyeWidth,
      eyeHeight: FACE_TUNE.eyeHeight * WORKING_FACE_TUNE.eyeHeight
    };
  }
  const tune = STATE_FACE_TUNES[state];
  return {
    size: Math.min(tune?.size ?? FACE_TUNE.size, STATE_FACE_MAX_SIZE),
    gap: Math.max(tune?.gap ?? FACE_TUNE.gap, 1.14),
    height: tune?.height ?? FACE_TUNE.height,
    eyeWidth: Math.min(tune?.eyeWidth ?? FACE_TUNE.eyeWidth, STATE_FACE_MAX_EYE),
    eyeHeight: Math.min(tune?.eyeHeight ?? FACE_TUNE.eyeHeight, STATE_FACE_MAX_EYE)
  };
}

const PACKAGE_EFFECT_TYPES = Object.freeze(["dots", "orbit", "radar", "progress", "gather", "wave", "send", "receive", "dock", "ball", "whirl", "pencil", "bang", "standby"]);
export const GROK_AVATAR_EFFECT_BY_STATE = Object.freeze({
  thinking: "dots", orbit: "orbit", radar: "radar", progress: "progress", spawning: "gather",
  dictating: "wave", sending: "send", receiving: "receive", uploading: "dock", bouncing: "ball",
  loading: "whirl", "powering-down": "standby", writing: "pencil", alerting: "bang"
});
export const GROK_AVATAR_AUTOPLAY_SEQUENCE = Object.freeze(["spin", "wide-spin", "bounce", "dizzy", "burst"]);
const PACKAGE_EFFECT_BY_STATE = GROK_AVATAR_EFFECT_BY_STATE;
const PACKAGE_BOUNCE_SEGMENTS = Object.freeze([
  { height: 48, duration: .5 },
  { height: 28, duration: .382 },
  { height: 14, duration: .27 },
  { height: 6, duration: .177 }
]);
const PACKAGE_BOUNCE_DURATION = PACKAGE_BOUNCE_SEGMENTS.reduce((total, segment) => total + segment.duration, 0);
const PACKAGE_EFFECT_RADIUS = Object.freeze({ dots: 1.5, orbit: 1.14, radar: 1.14, progress: 1.32, gather: 1.15, wave: 1.42, send: 1.12, receive: 1.12, dock: 1.3, ball: 1.22, whirl: 1.45, pencil: 1.18, bang: 1.28, standby: 1.75 });
const PACKAGE_EFFECT_COLORS = Object.freeze(["#f9705c", "#5b95f0", "#3fbe86", "#f5b13f", "#9a72ee", "#35c3bd"]);
const PACKAGE_STAR_COLOR = "#f4c34e";
const PACKAGE_EFFECT_TUNING = Object.freeze({ width: 1, smallBoost: 1, length: 1, lanes: 1, hueDrift: 1 });
function createPackageEffects({ back, front, idPrefix, reduceMotion, radius = () => CENTER }) {
  const scale = () => radius() / CENTER;
  let lastSignal = 0; let spinSignal = 0; let wideStyle = false; let sustainBelts = false; let allowOrbit = true; let lastFrame = -1; let gradientId = 0; let sizeScale = 1; let particles = [];
  const clearParticle = (particle) => { particle.el?.remove(); particle.trailEl?.remove(); particle.trailFrontEl?.remove(); particle.gradEl?.remove(); };
  const random = (min, max) => min + Math.random() * (max - min);
  const clampValue = (value, min, max) => Math.min(max, Math.max(min, value));
  const burst = (count = 20, speedScale = 1, curl = 0) => {
    if (reduceMotion || !back || particles.length > 120) return;
    for (let index = 0; index < count; index += 1) {
      const angle = index / count * TWO_PI + random(-.35, .35); const distance = random(96, 116) * scale(); const speed = random(170, 360) * speedScale;
      const tangentX = -Math.sin(angle); const tangentY = Math.cos(angle); const tangent = curl * speed * .2; const star = Math.random() < .18;
      particles.push({ x: CENTER + Math.cos(angle) * distance, y: CENTER + Math.sin(angle) * distance, vx: Math.cos(angle) * speed + tangentX * tangent, vy: Math.sin(angle) * speed + tangentY * tangent - random(20, 75), life: 0, max: random(.45, .85), r: star ? random(4, 7) : random(3.5, 8), rot: random(0, 360), vr: random(-260, 260), curl: 0, color: star ? PACKAGE_STAR_COLOR : PACKAGE_EFFECT_COLORS[Math.floor(Math.random() * PACKAGE_EFFECT_COLORS.length)], round: !star && Math.random() < .3, star, ret: 0, orbit: null, el: null });
    }
  };
  let orbitSeed = random(0, TWO_PI); let orbitActive = false; let orbitFinished = false; let orbitQueue = []; let orbitCount = 4; let orbitHue = 0; let orbitBelts = [];
  const prepareBelts = (count = 1) => { const baseRoll = random(-.85, .85); orbitBelts = []; for (let index = 0; index < count; index += 1) orbitBelts.push({ tilt: random(.16, .5), roll: baseRoll + index * Math.PI / count + random(-.12, .12) }); orbitCount = count > 1 ? count * 3 : Math.round(random(3, 5)); orbitHue = random(0, 360); };
  const addOrbitParticle = (lambda, direction, index) => {
    if (particles.length > 110) return; orbitBelts.length || prepareBelts(); const belt = orbitBelts[index % orbitBelts.length];
    particles.push({ x: CENTER, y: CENTER, vx: 0, vy: 0, ret: 0, life: 0, max: 9, r: (orbitCount <= 3 ? random(8, 10.5) : orbitCount === 4 ? random(6.6, 8.6) : random(5.6, 7.4)) * PACKAGE_EFFECT_TUNING.width, rot: random(0, 360), vr: random(-240, 240), curl: 0, color: PACKAGE_EFFECT_COLORS[Math.floor(Math.random() * PACKAGE_EFFECT_COLORS.length)], round: true, star: false, hue: orbitHue + index * 360 / Math.max(orbitCount, 1) + random(-14, 14), hueSpan: random(45, 95) * (Math.random() < .5 ? 1 : -1), hueVel: random(18, 42) * PACKAGE_EFFECT_TUNING.hueDrift * (Math.random() < .5 ? 1 : -1), orbit: { lambda, lambdaVelocity: direction * random(.5, 1.1), tilt: belt.tilt + random(-.04, .04), roll: belt.roll + random(-.05, .05), radius: scale() * 116 + Math.floor(index / orbitBelts.length) * (38 * PACKAGE_EFFECT_TUNING.lanes / Math.max(Math.ceil(orbitCount / orbitBelts.length) - 1, 1)) + random(-1.5, 1.5), radiusVelocity: random(0, 2.5), follow: random(.74, .94), carry: 0, arc: random(2.2, 3.4) * PACKAGE_EFFECT_TUNING.length }, history: [], el: null });
  };
  let previousSpin = 0; let spinVelocity = 0; const spinThreshold = .9; const burstThreshold = 5;
  const detectSpin = (signal) => { let delta = spinSignal - previousSpin; if (!Number.isFinite(delta) || Math.abs(delta) > 1.2) delta = 0; previousSpin = spinSignal; const wasFast = Math.abs(spinVelocity) >= spinThreshold; spinVelocity = delta / Math.max(signal, 1 / 60); const isFast = Math.abs(spinVelocity) >= spinThreshold; if (!wasFast && isFast) { prepareBelts(wideStyle ? 3 : 1); orbitActive = false; orbitFinished = false; } if (wasFast && !isFast) { orbitQueue.length = 0; orbitFinished = false; } };
  const maybeSpawnOrbit = (now) => {
    if (reduceMotion || !back || !allowOrbit) return;
    orbitSeed = spinSignal; const speed = Math.abs(spinVelocity); const activeOrbit = particles.some((particle) => particle.orbit && particle.ret < 1); if (sustainBelts && orbitActive && orbitQueue.length === 0 && speed >= spinThreshold && !activeOrbit) { orbitActive = false; orbitFinished = true; } if (!orbitActive && (speed >= burstThreshold || sustainBelts && orbitFinished && speed >= spinThreshold)) { orbitActive = true; orbitFinished = false; orbitQueue = []; for (let index = 0; index < orbitCount; index += 1) orbitQueue.push({ at: now + index * random(55, 105), index }); } while (orbitQueue.length && now >= orbitQueue[0].at) { const item = orbitQueue.shift(); addOrbitParticle(orbitSeed - random(0, .18), Math.sign(spinVelocity) || 1, item.index); }
  };
  const orbitPoint = (orbit, angle) => { const z = orbit.radius * Math.sin(angle); const vertical = -orbit.radius * Math.cos(angle) * Math.sin(orbit.tilt); const cos = Math.cos(orbit.roll); const sin = Math.sin(orbit.roll); return { x: CENTER + z * cos - vertical * sin, y: CENTER + z * sin + vertical * cos }; };
  const orbitDepth = (orbit, angle) => Math.cos(angle) * Math.cos(orbit.tilt);
  const trailShape = (history, width) => {
    const length = history.length;
    let total = 0;
    for (let index = 1; index < length; index += 1) total += Math.hypot(history[index].x - history[index - 1].x, history[index].y - history[index - 1].y);
    const maxWidth = Math.min(width, total * .34);
    if (total < 2) return { front: "", back: "" };
    const speed = []; let maxSpeed = 0;
    for (let index = 0; index < length; index += 1) {
      const previous = history[index > 0 ? index - 1 : 0]; const next = history[index < length - 1 ? index + 1 : length - 1];
      const lambdaDelta = Math.abs(next.lambda - previous.lambda);
      const value = lambdaDelta > 1e-6 ? Math.hypot(next.x - previous.x, next.y - previous.y) / lambdaDelta : 0;
      speed.push(value); maxSpeed = Math.max(maxSpeed, value);
    }
    const offsetX = []; const offsetY = [];
    for (let index = 0; index < length; index += 1) {
      const previous = history[index > 0 ? index - 1 : 0]; const next = history[index < length - 1 ? index + 1 : length - 1];
      let dx = next.x - previous.x; let dy = next.y - previous.y; const lengthValue = Math.hypot(dx, dy) || 1;
      dx /= lengthValue; dy /= lengthValue;
      const ratio = clampValue(maxSpeed > 0 ? speed[index] / (maxSpeed * .55) : 1, 0, 1);
      const ease = Math.max(ratio * ratio * (3 - 2 * ratio), .04);
      const offset = (maxWidth * (.5 + .5 * (index / Math.max(length - 1, 1))) * ease) / 2;
      offsetX.push(-dy * offset); offsetY.push(dx * offset);
    }
    const arc = (index) => { const value = Math.max(Math.hypot(offsetX[index], offsetY[index]), .2); return `A${value.toFixed(1)} ${value.toFixed(1)} 0 0 0 `; };
    const band = (from, to) => {
      let path = "";
      for (let index = from; index <= to; index += 1) path += `${index === from ? "M" : "L"}${(history[index].x + offsetX[index]).toFixed(1)} ${(history[index].y + offsetY[index]).toFixed(1)}`;
      path += arc(to);
      for (let index = to; index >= from; index -= 1) path += `${index === to ? "" : "L"}${(history[index].x - offsetX[index]).toFixed(1)} ${(history[index].y - offsetY[index]).toFixed(1)}`;
      return `${path}${arc(from)}${(history[from].x + offsetX[from]).toFixed(1)} ${(history[from].y + offsetY[from]).toFixed(1)}Z`;
    };
    const turns = history.map((point, index) => index > 0 && index < length - 1 && (point.x - history[index - 1].x) * (history[index + 1].x - point.x) + (point.y - history[index - 1].y) * (history[index + 1].y - point.y) < 0);
    let frontPath = ""; let backPath = ""; let index = 0; let previousWasFront = false;
    while (index < length) {
      const isFront = history[index].z >= 0; let end = index;
      while (end + 1 < length && (history[end + 1].z >= 0) === isFront && !turns[end + 1]) end += 1;
      const turnsHere = end + 1 < length && turns[end + 1]; const from = previousWasFront ? index : Math.max(index - 1, 0); const to = turnsHere ? end + 1 : Math.min(end + 1, length - 1);
      if (to > from) { const path = band(from, to); if (isFront) frontPath += path; else backPath += path; }
      previousWasFront = turnsHere; index = end + 1;
    }
    return { front: frontPath, back: backPath };
  };
  const updateParticles = (intensity, dt) => {
    if (!back || !particles.length) return; const isFast = Math.abs(spinVelocity) >= spinThreshold; const signal = spinVelocity; const turn = signal * dt; const next = [];
    for (const particle of particles) {
      particle.life += particle.life > 0 ? dt : intensity; const lifeProgress = clampValue(particle.life / particle.max, 0, 1);
      if (particle.orbit) { const fading = !isFast || lifeProgress > .55; particle.ret = clampValue(particle.ret + (fading ? dt / .5 : -dt / .35), 0, 1); if (particle.ret >= 1) { clearParticle(particle); continue; } }
      else if (particle.life >= particle.max) { clearParticle(particle); continue; }
      const opacity = particle.orbit ? Math.min(1, particle.life / .26) : lifeProgress < .1 ? lifeProgress / .1 : Math.pow(1 - (lifeProgress - .1) / .9, 1.7);
      if (particle.orbit) {
        const orbit = particle.orbit;
        if (isFast) { orbit.carry = signal * orbit.follow; orbit.lambda += turn * orbit.follow + orbit.lambdaVelocity * dt; orbit.radius += orbit.radiusVelocity * dt; }
        else { orbit.lambda += (orbit.carry + orbit.lambdaVelocity) * dt; orbit.carry *= Math.exp(-2.6 * dt); orbit.lambdaVelocity *= Math.exp(-2.6 * dt); orbit.radius += orbit.radiusVelocity * dt; }
        const position = orbitPoint(orbit, orbit.lambda); particle.x = position.x; particle.y = position.y;
        const depth = orbitDepth(orbit, orbit.lambda); const depthScale = .72 + .28 * clampValue(depth, 0, 1); const appear = Math.min(particle.life / .34, 1); const appearEase = appear * appear * (3 - 2 * appear); const size = Math.max(particle.r * depthScale * 1.7 * sizeScale * appearEase * (1 - .72 * particle.ret * particle.ret), .5);
        if (!particle.trailEl) { const trail = el("path", { "data-grok-trail": "true", stroke: "none" }); const gradient = el("linearGradient", { id: `${idPrefix}-trail-${gradientId++}`, gradientUnits: "userSpaceOnUse" }); particle.stops = []; for (let index = 0; index < 5; index += 1) { const stop = el("stop", { offset: (index / 4).toFixed(3) }); gradient.append(stop); particle.stops.push(stop); } back.append(gradient); particle.gradEl = gradient; trail.setAttribute("fill", `url(#${gradient.id})`); back.append(trail); particle.trailEl = trail; const frontTrail = el("path", { "data-grok-trail": "true", stroke: "none", fill: particle.color }); front?.append(frontTrail); particle.trailFrontEl = frontTrail; }
        const history = particle.history; const previousLambda = history.length ? history[history.length - 1].lambda : orbit.lambda; const change = orbit.lambda - previousLambda; const sampleCount = Math.min(Math.ceil(Math.abs(change) / .09), 24); for (let index = 1; index <= sampleCount; index += 1) { const lambda = previousLambda + change * index / sampleCount; const point = orbitPoint(orbit, lambda); history.push({ x: point.x, y: point.y, lambda, z: orbitDepth(orbit, lambda) }); } if (!history.length) history.push({ x: particle.x, y: particle.y, lambda: orbit.lambda, z: depth }); const arc = orbit.arc * (1 - particle.ret * particle.ret * (3 - 2 * particle.ret)); while (history.length > 2 && Math.abs(orbit.lambda - history[0].lambda) > arc) history.shift(); while (history.length > 48) history.shift(); if (history.length && Math.abs(orbit.lambda - history[0].lambda) > arc) { const shift = Math.sign(orbit.lambda - history[0].lambda) * (Math.abs(orbit.lambda - history[0].lambda) - arc); const lambda = history[0].lambda + shift; const point = orbitPoint(orbit, lambda); history[0] = { x: point.x, y: point.y, lambda, z: orbitDepth(orbit, lambda) }; } if (history.length >= 2) { const paths = trailShape(history, size); const first = history[0]; const last = history[history.length - 1]; particle.trailEl.setAttribute("d", paths.back); particle.trailEl.setAttribute("opacity", opacity.toFixed(3)); particle.trailFrontEl?.setAttribute("d", paths.front); particle.trailFrontEl?.setAttribute("opacity", opacity.toFixed(3)); particle.gradEl?.setAttribute("x1", first.x.toFixed(1)); particle.gradEl?.setAttribute("y1", first.y.toFixed(1)); particle.gradEl?.setAttribute("x2", last.x.toFixed(1)); particle.gradEl?.setAttribute("y2", last.y.toFixed(1)); for (let index = 0; index < particle.stops.length; index += 1) { const position = index / (particle.stops.length - 1); const hue = Math.round(((particle.hue + particle.hueVel * particle.life + position * particle.hueSpan) % 360 + 360) % 360); const lightness = Math.round(56 + 11 * position); particle.stops[index].setAttribute("stop-color", `hsl(${hue} 56% ${lightness}%)`); } } else { particle.trailEl.setAttribute("opacity", "0"); particle.trailFrontEl?.setAttribute("opacity", "0"); } next.push(particle); continue;
      }
      if (particle.curl) { const cosine = Math.cos(particle.curl * dt); const sine = Math.sin(particle.curl * dt); const vx = particle.vx * cosine - particle.vy * sine; const vy = particle.vx * sine + particle.vy * cosine; particle.vx = vx; particle.vy = vy; }
      particle.x += particle.vx * dt; particle.y += particle.vy * dt; const drag = Math.pow(.94, dt * 60); particle.vx *= drag; particle.vy = particle.vy * drag + 40 * dt; const size = Math.max(particle.r * (1 - lifeProgress * .4), .5);
      if (!particle.el) { particle.el = el(particle.star ? "path" : particle.round ? "circle" : "rect", particle.star ? { d: "M0 -1L.588 -.809L.951 -.309L.951 .309L.588 .809L0 1L-.588 .809L-.951 .309L-.951 -.309L-.588 -.809Z", fill: particle.color } : { fill: particle.color }); back.append(particle.el); }
      particle.el.setAttribute("opacity", opacity.toFixed(3)); if (particle.star) { particle.rot += particle.vr * dt; particle.el.setAttribute("transform", `translate(${particle.x.toFixed(1)} ${particle.y.toFixed(1)}) rotate(${particle.rot.toFixed(1)}) scale(${size.toFixed(2)})`); } else if (particle.round) particle.el.setAttribute("cx", particle.x.toFixed(1)), particle.el.setAttribute("cy", particle.y.toFixed(1)), particle.el.setAttribute("r", size.toFixed(2)); else { const velocity = Math.hypot(particle.vx, particle.vy); const width = Math.max(size * 2, Math.min(velocity * .05, 30)); const height = size * 1.5; const angle = Math.atan2(particle.vy, particle.vx) * 180 / Math.PI; particle.el.setAttribute("width", width.toFixed(1)); particle.el.setAttribute("height", height.toFixed(1)); particle.el.setAttribute("rx", (height / 2).toFixed(2)); particle.el.setAttribute("x", (particle.x - width / 2).toFixed(1)); particle.el.setAttribute("y", (particle.y - height / 2).toFixed(1)); particle.el.setAttribute("transform", `rotate(${angle.toFixed(1)} ${particle.x.toFixed(1)} ${particle.y.toFixed(1)})`); }
      next.push(particle);
    }
    particles = next;
  };
  return {
    burst,
    clear() { particles.forEach(clearParticle); particles = []; orbitQueue = []; orbitActive = false; orbitFinished = false; },
    update(now, dt, options = {}) { spinSignal = Number(options.spinAngle ?? 0); sizeScale = Number(options.sizeScale ?? 1); wideStyle = options.wideStyle === true; sustainBelts = options.sustainBelts === true; allowOrbit = options.allowOrbit !== false; const elapsed = lastFrame < 0 ? dt : Math.max((now - lastFrame) / 1000, 0); lastFrame = now; detectSpin(elapsed); maybeSpawnOrbit(now); updateParticles(Number(dt) || 0, elapsed); },
    hasLife() { return particles.length > 0 || orbitQueue.length > 0; }
  };
}

function roundedEffectPath(width, height, radius) {
  const halfWidth = width / 2;
  const top = CENTER - height / 2;
  const bottom = CENTER + height / 2;
  return `M${CENTER - halfWidth + radius} ${top}A${radius} ${radius} 0 0 1 ${CENTER - halfWidth + radius * 2} ${top}L${CENTER + halfWidth - radius} ${top}A${radius} ${radius} 0 0 1 ${CENTER + halfWidth} ${top + radius}L${CENTER + halfWidth} ${bottom - radius}A${radius} ${radius} 0 0 1 ${CENTER + halfWidth - radius} ${bottom}L${CENTER - halfWidth + radius} ${bottom}A${radius} ${radius} 0 0 1 ${CENTER - halfWidth} ${bottom - radius}L${CENTER - halfWidth} ${top + radius}A${radius} ${radius} 0 0 1 ${CENTER - halfWidth + radius} ${top}Z`;
}

function createStateEffects({ back, front, idPrefix, color }) {
  const glyphs = [
    el("path", { "data-grok-effect-glyph": "0", fill: color, d: roundedEffectPath(30, 88, 15), display: "none" }),
    el("path", { "data-grok-effect-glyph": "1", fill: "none", stroke: color, display: "none" }),
    el("path", { "data-grok-effect-glyph": "2", fill: color, d: roundedEffectPath(30, 17, 8.5), display: "none" })
  ];
  const rings = Array.from({ length: 7 }, (_, index) => el("circle", {
    "data-grok-effect-ring": index,
    cx: CENTER,
    cy: CENTER,
    fill: "none",
    stroke: color,
    display: "none"
  }));
  const particles = Array.from({ length: 7 }, (_, index) => el("circle", {
    "data-grok-effect-particle": index,
    cx: CENTER,
    cy: CENTER,
    fill: color,
    display: "none"
  }));
  glyphs.slice(0, 2).forEach((node) => back.append(node));
  glyphs[2] && front.append(glyphs[2]);
  rings.forEach((node) => front.append(node));
  particles.forEach((node) => back.append(node));

  const paths = [
    roundedEffectPath(30, 88, 15),
    roundedEffectPath(30, 88, 15),
    roundedEffectPath(30, 17, 8.5)
  ];
  const hide = (node) => { if (node) node.style.display = "none"; };
  const show = (node) => {
    if (!node) return;
    node.removeAttribute("display");
    node.style.display = "";
  };
  const setCircle = (node, attrs) => {
    if (!node) return;
    show(node);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
  };
  const reset = () => {
    glyphs.forEach(hide); rings.forEach(hide); particles.forEach(hide);
    back.style.opacity = "0";
    front.style.opacity = "0";
  };
  const pulse = (now) => .42 + .29 * Math.sin(now * .0021) * Math.sin(now * .0034) + .29 * Math.sin(now * .0013 + 1.7);
  const wavePulse = (now, lane) => pulse(now) * (.55 + .45 * Math.sin(now * .012 - Math.abs(lane) * 1.05));
  const progressEase = (value) => 1 - Math.pow(1 - clamp(value, 0, 1), 3);
  const backEase = (value) => {
    const t = clamp(value, 0, 1) - 1;
    return 1 + 2.70158 * t * t * t + 1.70158 * t * t;
  };
  const effectPath = (node, d, transform, opacity) => {
    if (!node) return;
    show(node); node.setAttribute("d", d); node.setAttribute("transform", transform); node.setAttribute("opacity", opacity.toFixed(3));
  };

  const renderDotsEffect = (progress, now) => {
    const positions = [CENTER - 62, CENTER + 62];
    for (let index = 0; index < 2; index += 1) {
      const t = clamp((progress - index * .12) / (1 - index * .12), 0, 1);
      if (t <= .004) { hide(glyphs[index]); continue; }
      const lift = progressEase(t);
      const pop = backEase(t);
      const opacity = t * (.5 + .5 * Math.sin(now * .012 - index * 1.05));
      effectPath(glyphs[index], paths[index], `translate(${(CENTER + (positions[index] - CENTER) * pop).toFixed(1)} ${(CENTER - lift * 9).toFixed(1)}) scale(${(22 * lift * Math.max(opacity, .35) / CENTER).toFixed(4)}) translate(${-CENTER} ${-CENTER})`, opacity);
    }
  };

  const renderOrbitEffect = (progress, now) => {
    const radius = 52 * backEase(progress);
    for (let index = 0; index < 5; index += 1) {
      const angle = now * .0017 + index * TWO_PI / 5;
      const frontness = .5 + .5 * clamp(Math.cos(angle), 0, 1);
      setCircle(particles[index], {
        cx: (CENTER + radius * Math.sin(angle)).toFixed(1),
        cy: (CENTER - radius * .42 * Math.cos(angle)).toFixed(1),
        r: Math.max(12 * frontness * progress, .3).toFixed(2),
        opacity: (clamp((Math.cos(angle) + .4) / .6, .18, 1) * progress).toFixed(3)
      });
    }
  };

  const renderRadarEffect = (progress, now) => {
    for (let index = 0; index < 3; index += 1) {
      const phase = (now / 1300 + index / 3) % 1;
      setCircle(rings[index], {
        r: (1.14 * CENTER + (104 - 1.14 * CENTER) * phase).toFixed(1),
        "stroke-width": (3.4 * (1 - phase * .55)).toFixed(2),
        opacity: (progressEase(progress) * (1 - phase) * .9).toFixed(3)
      });
    }
  };

  const renderProgressEffect = (progress) => {
    const scale = backEase(progress);
    setCircle(rings[3], { r: (62 * scale).toFixed(1), "stroke-width": 5, opacity: (progressEase(progress) * .16).toFixed(3) });
    const radius = 62 * scale;
    const circumference = TWO_PI * radius;
    setCircle(rings[4], { r: radius.toFixed(1), "stroke-width": 5, "stroke-dasharray": circumference.toFixed(1), "stroke-dashoffset": (circumference * (1 - clamp(progress / .85, 0, 1))).toFixed(1), transform: `rotate(-90 ${CENTER} ${CENTER})`, opacity: progressEase(progress).toFixed(3) });
  };

  const renderGatherEffect = (progress) => {
    for (let index = 0; index < 5; index += 1) {
      const t = clamp((progress - index * .09) / .62, 0, 1);
      if (t >= 1) { hide(particles[index]); continue; }
      const ease = progressEase(t); const angle = index * 2.4 + t * 2.2; const radius = 96 * (1 - ease);
      setCircle(particles[index], { cx: (CENTER + radius * Math.cos(angle)).toFixed(1), cy: (CENTER + radius * Math.sin(angle) * .8).toFixed(1), r: (9 * (.5 + .5 * ease) * progress).toFixed(2), opacity: (progress * clamp(t * 5, 0, 1) * (1 - ease * .25)).toFixed(3) });
    }
  };

  const renderWaveEffect = (progress, now) => {
    const lanes = [-2, -1, 1, 2];
    for (let index = 0; index < 4; index += 1) {
      const lane = lanes[index]; const t = clamp((progress - Math.abs(lane) * .1) / (1 - Math.abs(lane) * .1), 0, 1);
      if (t <= .004) { hide(index < 2 ? glyphs[index] : particles[index - 1]); continue; }
      const ease = backEase(t); const energy = wavePulse(now, lane); const radius = (7 + 9 * clamp(energy, .08, 1)) * progressEase(t); const lift = 6 * clamp(energy, 0, 1) * t;
      if (index < 2) effectPath(glyphs[index], paths[index], `translate(${(CENTER + lane * 44 * ease).toFixed(1)} ${(CENTER - lift).toFixed(1)}) scale(${(radius / CENTER * 1.02).toFixed(4)}) translate(${-CENTER} ${-CENTER})`, t);
      else setCircle(particles[index + 1], { cx: (CENTER + lane * 44 * ease).toFixed(1), cy: (CENTER - lift).toFixed(1), r: radius.toFixed(2), opacity: t.toFixed(3) });
    }
  };

  const renderSendEffect = (progress, now, options = {}) => {
    const elapsed = Math.max(0, Number(options.elapsed ?? 0));
    const phase = (elapsed / 1.5 % 1 + 1) % 1;
    const t = clamp((phase - .18) / .55, 0, 1); const ease = t * t * (.4 + .6 * t); const x = 108 * ease;
    setCircle(particles[5], { cx: (CENTER + .74 * x).toFixed(1), cy: (CENTER - .62 * x).toFixed(1), r: (10 * (1 - ease * .55) * progress).toFixed(2), opacity: (progress * (1 - ease * ease)).toFixed(3) });
    const tail = clamp((phase - .26) / .55, 0, 1); const tailEase = tail * tail * (.4 + .6 * tail);
    setCircle(particles[6], { cx: (CENTER + .74 * 108 * tailEase).toFixed(1), cy: (CENTER - .62 * 108 * tailEase).toFixed(1), r: (5 * (1 - tailEase * .6) * progress).toFixed(2), opacity: (progress * .3 * (1 - tailEase)).toFixed(3) });
    const ringT = clamp((phase - .18) / .3, 0, 1); if (ringT > 0 && ringT < 1) setCircle(rings[5], { r: (20 + 34 * progressEase(ringT)).toFixed(1), "stroke-width": (2.8 * (1 - ringT)).toFixed(2), opacity: (progress * (1 - ringT) * .8).toFixed(3) });
  };

  const renderReceiveEffect = (progress, now, options = {}) => {
    const elapsed = Math.max(0, Number(options.elapsed ?? 0));
    const phase = (elapsed / 1.7 % 1 + 1) % 1; const t = clamp(phase / .6, 0, 1); const ease = progressEase(t);
    const angle = Number(options.receiveAngle ?? -.7); const radius = 108 * (1 - ease);
    const perpendicularOffset = 18 * Math.sin(t * Math.PI) * (1 - ease * .7);
    const cx = CENTER + Math.cos(angle) * radius - Math.sin(angle) * perpendicularOffset;
    const cy = CENTER + Math.sin(angle) * radius + Math.cos(angle) * perpendicularOffset;
    setCircle(particles[5], { cx: cx.toFixed(1), cy: cy.toFixed(1), r: (3.5 + 6.5 * ease).toFixed(2), opacity: (progress * clamp(t * 3.5, 0, 1) * (.3 + .7 * ease)).toFixed(3) });
    const ringT = clamp((phase - .58) / .32, 0, 1); if (ringT > 0 && ringT < 1) setCircle(rings[6], { r: (20 + 26 * progressEase(ringT)).toFixed(1), "stroke-width": (2.8 * (1 - ringT)).toFixed(2), opacity: (progress * (1 - ringT) * .8).toFixed(3) });
  };

  const renderDockEffect = (progress, now, options = {}) => {
    const elapsed = Math.max(0, Number(options.elapsed ?? 0));
    for (let index = 0; index < 2; index += 1) {
      const t = clamp((elapsed - (.2 + index * 1.3)) / .9, 0, 1);
      if (t <= 0) { hide(particles[5 + index]); continue; }
      const ease = progressEase(t); const angle = elapsed * 1.1 + index * Math.PI; const orbitX = CENTER + 42 * Math.sin(angle); const orbitY = CENTER + 21 * Math.cos(angle) + Math.sin(elapsed * 3 + index) * 2;
      setCircle(particles[5 + index], { cx: (CENTER - 120 + index * 30 + (orbitX - (CENTER - 120 + index * 30)) * ease).toFixed(1), cy: (CENTER + 95 + (orbitY - (CENTER + 95)) * ease).toFixed(1), r: ((7 + 3 * ease) * progress).toFixed(2), opacity: (progress * clamp(t * 4, 0, 1)).toFixed(3) });
    }
  };

  const renderBallEffect = (progress, now, options = {}) => {
    const elapsed = Math.max(0, Number(options.elapsed ?? 0));
    const cycle = (elapsed / 1.8 % 1 + 1) % 1;
    const bounce = Math.abs(Math.sin(cycle * Math.PI * 2));
    setCircle(particles[0], { cx: (CENTER - 58 + cycle * 116).toFixed(1), cy: (CENTER + 58 - bounce * 72).toFixed(1), r: (10 * progress).toFixed(2), opacity: (progress * (.45 + bounce * .55)).toFixed(3) });
    setCircle(particles[1], { cx: (CENTER - 58 + cycle * 116).toFixed(1), cy: (CENTER + 58).toFixed(1), r: (4 + 4 * bounce).toFixed(2), opacity: (progress * (.08 + bounce * .18)).toFixed(3) });
  };

  const renderWhirlEffect = (progress, now) => {
    const wave = .5 + .5 * Math.sin(now * .0016);
    setCircle(particles[4], { cx: CENTER, cy: CENTER, r: (26 + 7 * wave).toFixed(1), opacity: (progress * (.06 + .1 * wave)).toFixed(3) });
    const ringT = clamp(progress, 0, 1); if (ringT < .995) setCircle(rings[2], { r: (104 - 88 * ringT).toFixed(1), "stroke-width": 2.4, opacity: ((1 - ringT) * .5).toFixed(3) });
  };

  const renderPencilEffect = (progress, now, options = {}) => {
    const elapsed = Math.max(0, Number(options.elapsed ?? 0));
    const cycle = (elapsed / 2.5 % 1 + 1) % 1;
    const lift = cycle < .68 ? progressEase(cycle / .68) : progressEase((cycle - .68) / .32);
    const x = cycle < .68 ? -54 + 118 * lift : 64 - 118 * lift;
    effectPath(glyphs[0], paths[0], `translate(${(CENTER + x * progress).toFixed(1)} ${(CENTER + (26 - 68 * Math.sin(cycle * Math.PI)) * progress).toFixed(1)}) rotate(${(17 * progress).toFixed(1)} ${CENTER} ${CENTER}) scale(${progressEase(progress).toFixed(3)}) translate(${-CENTER} ${-CENTER})`, progress);
    show(glyphs[1]); glyphs[1].setAttribute("d", "M58 142C82 145 120 145 168 142"); glyphs[1].setAttribute("opacity", progress.toFixed(3)); glyphs[1].setAttribute("stroke-width", "6"); glyphs[1].setAttribute("stroke-linecap", "round");
  };

  const renderBangEffect = (progress, now, options = {}) => {
    const elapsed = Math.max(0, Number(options.elapsed ?? 0));
    const cycle = (elapsed / 2.2 % 1 + 1) % 1; const opacity = Math.exp(-cycle * 5.5); const shake = Math.sin(cycle * 42) * 2.2 * opacity;
    effectPath(glyphs[2], paths[2], `translate(0 ${(-26 - (1 - progress) * 70).toFixed(1)}) rotate(${shake.toFixed(2)} ${CENTER} ${CENTER - 74}) translate(${CENTER} ${CENTER}) scale(${clamp(progress * 1.2, 0, 1).toFixed(3)}) translate(${-CENTER} ${-CENTER})`, clamp(progress * 1.5 - .2, 0, 1));
  };

  const renderStandbyEffect = (progress, now) => {
    const wave = .5 + .5 * Math.sin(now * .0016);
    setCircle(particles[4], { cx: CENTER, cy: CENTER, r: (26 + 7 * wave).toFixed(1), opacity: (progressEase(progress) * (.06 + .1 * wave)).toFixed(3) });
    if (progress < .995) setCircle(rings[2], { r: (104 - 88 * progressEase(progress)).toFixed(1), "stroke-width": 2.4, opacity: ((1 - progressEase(progress)) * .5).toFixed(3) });
  };

  return {
    clear: reset,
    render(effectType, progress, now, layerOpacity = 1, options = {}) {
      reset();
      back.style.opacity = layerOpacity > .004 ? layerOpacity.toFixed(3) : "0";
      front.style.opacity = layerOpacity > .004 ? layerOpacity.toFixed(3) : "0";
      const renderer = {
        dots: renderDotsEffect,
        orbit: renderOrbitEffect,
        radar: renderRadarEffect,
        progress: renderProgressEffect,
        gather: renderGatherEffect,
        wave: renderWaveEffect,
        send: renderSendEffect,
        receive: renderReceiveEffect,
        dock: renderDockEffect,
        ball: renderBallEffect,
        whirl: renderWhirlEffect,
        pencil: renderPencilEffect,
        bang: renderBangEffect,
        standby: renderStandbyEffect
      }[effectType];
      if (renderer) renderer(progress, now, options);
    }
  };
}

function createSvg(spec, id, state, alt) {
  const svg = el("svg", { viewBox: VIEW_BOX, xmlns: SVG_NS, role: "img", "aria-label": alt || "数字员工头像", "data-state": state, "data-shape": spec.shape, "data-color": spec.color, "data-grok-id": id });
  svg.classList.add("sb-grok-avatar-svg");
  svg.style.cssText = "display:block;width:100%;height:100%;overflow:visible";
  const palette = GROK_AVATAR_COLORS[spec.color];
  svg.style.setProperty("--grok-fill", `light-dark(${palette.light}, ${palette.dark})`);
  svg.style.setProperty("color-scheme", "light dark");
  const defs = el("defs");
  const gradient = gradientVector();
  const lightGradient = el("linearGradient", {
    id: `${id}-ink-light`,
    x1: gradient.x1,
    y1: gradient.y1,
    x2: gradient.x2,
    y2: gradient.y2
  });
  lightGradient.append(
    el("stop", { offset: 0, "stop-color": palette.lightFrom }),
    el("stop", { offset: 1, "stop-color": palette.lightTo })
  );
  const darkGradient = el("linearGradient", {
    id: `${id}-ink-dark`,
    x1: gradient.x1,
    y1: gradient.y1,
    x2: gradient.x2,
    y2: gradient.y2
  });
  darkGradient.append(
    el("stop", { offset: 0, "stop-color": palette.darkFrom }),
    el("stop", { offset: 1, "stop-color": palette.darkTo })
  );
  const gradientStyle = el("style");
  gradientStyle.textContent = `svg[data-grok-id="${id}"] [data-grok-body="true"]{fill:url(#${id}-ink-light)}@media (prefers-color-scheme:dark){svg[data-grok-id="${id}"] [data-grok-body="true"]{fill:url(#${id}-ink-dark)}}`;
  defs.append(lightGradient, darkGradient, gradientStyle);
  const clip = el("clipPath", { id: `${id}-body-clip` });
  clip.append(el("path", { d: grokAvatarPathFor(spec.shape) }));
  defs.append(clip);
  svg.append(defs);
  const effectsBack = el("g", { "data-grok-effects-back": "true", "aria-hidden": "true" });
  const effectsFront = el("g", { "data-grok-effects-front": "true", "aria-hidden": "true" });
  const previousStateEffectsBack = el("g", { "data-grok-state-effects": "previous-back", "aria-hidden": "true" });
  const currentStateEffectsBack = el("g", { "data-grok-state-effects": "current-back", "aria-hidden": "true" });
  const previousStateEffectsFront = el("g", { "data-grok-state-effects": "previous-front", "aria-hidden": "true" });
  const currentStateEffectsFront = el("g", { "data-grok-state-effects": "current-front", "aria-hidden": "true" });
  const body = el("path", { d: grokAvatarPathFor(spec.shape), fill: palette.light, "data-grok-body": "true" });
  const eyes = el("g", { fill: "#FFFFFF", "data-grok-eyes": "true", "clip-path": `url(#${id}-body-clip)` });
  const initialExpression = STATE_PROFILES[state]?.expressions?.[0] || 0;
  const initialRings = expressionRingsForState(state, initialExpression);
  initialRings.forEach((ring, eyeIndex) => eyes.append(el("path", { d: pathRing(ring), "data-grok-eye": eyeIndex })));
  const runtime = el("g", { "data-grok-runtime": "true" });
  runtime.append(body, eyes);
  svg.append(effectsBack, previousStateEffectsBack, currentStateEffectsBack, runtime, previousStateEffectsFront, currentStateEffectsFront, effectsFront);
  const packageEffects = createPackageEffects({ back: effectsBack, front: effectsFront, idPrefix: id, reduceMotion: false, radius: () => CENTER });
  const previousStateEffects = createStateEffects({ back: previousStateEffectsBack, front: previousStateEffectsFront, idPrefix: `${id}-previous`, color: palette.light });
  const stateEffects = createStateEffects({ back: currentStateEffectsBack, front: currentStateEffectsFront, idPrefix: `${id}-current`, color: palette.light });
  return { svg, body, eyes: [...eyes.children], effects: [], effectsBack, effectsFront, packageEffects, stateEffects, previousStateEffects, runtime, initialRings };
}

const controllers = new Set();
const controllerByContainer = new WeakMap();
let animationFrame = 0;
let idSeed = 0;
let pointerBound = false;
let pointer = { x: 0, y: 0, active: false };

function schedule() {
  if (!animationFrame) animationFrame = requestAnimationFrame(tick);
}

function tick(now) {
  animationFrame = 0;
  for (const controller of [...controllers]) {
    if (!controller.container.isConnected) {
      controller.destroy();
      continue;
    }
    controller.update(now);
  }
  if (controllers.size) animationFrame = requestAnimationFrame(tick);
}

function bindPointer() {
  if (pointerBound) return;
  pointerBound = true;
  window.addEventListener("pointermove", (event) => {
    pointer = { x: event.clientX, y: event.clientY, active: true };
    schedule();
  }, { passive: true });
  window.addEventListener("blur", () => {
    pointer = { x: 0, y: 0, active: false };
    schedule();
  });
}

function blinkAmount(controller, now) {
  if (now < controller.blinkStart || now >= controller.blinkEnd) return 1;
  const progress = (now - controller.blinkStart) / (controller.blinkEnd - controller.blinkStart);
  const fold = progress < .45 ? progress / .45 : (1 - progress) / .55;
  return 1 - smoothstep(fold) * .92;
}

class GrokAvatarController {
  constructor(container, parts, state, spec, value, trackPointer, mode) {
    this.container = container;
    this.svg = parts.svg;
    this.body = parts.body;
    this.eyes = parts.eyes;
    this.runtime = parts.runtime;
    this.effects = parts.effects;
    this.packageEffects = parts.packageEffects;
    this.stateEffects = parts.stateEffects;
    this.previousStateEffects = parts.previousStateEffects;
    this.initialRings = parts.initialRings;
    this.stateName = STATE_PROFILES[state] ? state : "idle";
    this.state = stateProfile(this.stateName);
    this.spec = spec;
    this.value = value;
    this.trackPointer = mode === "agent-square" && trackPointer;
    this.mode = mode;
    this.hoverTarget = null;
    this.pointerInside = false;
    this.handlePointerEnter = () => {
      this.pointerInside = true;
      schedule();
    };
    this.handlePointerLeave = () => {
      this.pointerInside = false;
    };
    this.syncHoverTarget();
    this.startedAt = performance.now();
    this.stateStartedAt = this.startedAt;
    this.lastFrame = this.startedAt;
    this.lastExpressionFrame = this.startedAt;
    this.expressionIndex = 0;
    this.expressionFrom = this.initialRings;
    this.expressionTo = this.initialRings;
    this.currentRings = this.initialRings;
    this.expressionSpring = { value: 1, velocity: 0, target: 1 };
    this.faceTune = { ...FACE_TUNE };
    this.shapeSpan = spanIndex(samplePath(shapePath(this.spec.shape)));
    this.expressionAt = this.startedAt + randomBetween(this.state.expressionMs);
    this.blinkAt = this.startedAt + randomBetween(this.state.blinkMs);
    this.blinkStart = 0;
    this.blinkEnd = 0;
    this.gazeX = 0;
    this.gazeY = 0;
    this.gazeTargetX = 0;
    this.gazeTargetY = 0;
    this.gazeTargetAt = this.startedAt + randomBetween([500, 1400]);
    this.listeningNodEnd = 0;
    this.curiousNodEnd = 0;
    this.boredNodEnd = 0;
    this.drowsyStartedAt = 0;
    this.drowsyNextAt = this.startedAt + randomBetween([1200, 2200]);
    this.angryShakeEnd = 0;
    this.angryNextAt = this.startedAt + randomBetween([500, 1200]);
    this.dragTurn = -1;
    this.effectType = null;
    this.previousEffectType = null;
    this.effectBurstAt = 0;
    this.previousEffectBurstAt = 0;
    this.effectCrossfade = { value: 1, velocity: 0, target: 1 };
    this.receiveAngle = Math.random() * Math.PI * 1.5 - Math.PI * 1.25;
    this.receiveCycle = -1;
    this.nextAutoplayAt = this.startedAt + randomBetween([2500, 5000]);
    this.autoplay = null;
    this.autoplayMotion = null;
    this.spinSpring = null;
    this.spinSource = null;
    this.wideSpinActive = false;
    this.pointerInside = false;
    this.bounceStartedAt = -1;
    this.spinSignal = 0;
    this.stateSpinNextAt = this.startedAt + randomBetween(stateSpinDelay(this.stateName));
    this.effectSpinPhase = 0;
    this.suspiciousNextAt = this.startedAt + randomBetween([4000, 7000]);
    this.confusedNextAt = this.startedAt + randomBetween([2600, 4200]);
    this.lastDragCycle = -1;
    this.notifyMotionTriggered = false;
    this.wakingBurstTriggered = false;
    this.bodySprings = {
      x: { value: 0, velocity: 0, target: 0 },
      y: { value: 0, velocity: 0, target: 0 },
      rotate: { value: 0, velocity: 0, target: 0 },
      scaleX: { value: 1, velocity: 0, target: 1 },
      scaleY: { value: 1, velocity: 0, target: 1 },
      opacity: { value: 1, velocity: 0, target: 1 }
    };
    this.reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  }

  setState(state) {
    if (!state || state === this.stateName) return;
    this.stateName = STATE_PROFILES[state] ? state : "idle";
    this.state = stateProfile(this.stateName);
    this.stateStartedAt = performance.now();
    this.svg.dataset.state = this.stateName;
    this.expressionIndex = 0;
    this.expressionFrom = this.currentRings || this.initialRings;
    const expression = this.state.expressions[0] || 0;
    this.expressionTo = expressionRingsForState(this.stateName, expression);
    this.expressionSpring = { value: 0, velocity: 0, target: 1 };
    const now = performance.now();
    this.lastExpressionFrame = now;
    this.expressionAt = now + randomBetween(this.state.expressionMs);
    this.blinkAt = now + randomBetween(this.state.blinkMs);
    this.gazeX = 0;
    this.gazeY = 0;
    this.gazeTargetX = 0;
    this.gazeTargetY = 0;
    this.gazeTargetAt = now + randomBetween([500, 1400]);
    this.listeningNodEnd = 0;
    this.curiousNodEnd = 0;
    this.boredNodEnd = 0;
    this.drowsyStartedAt = 0;
    this.drowsyNextAt = now + randomBetween([1200, 2200]);
    this.angryShakeEnd = 0;
    this.angryNextAt = now + randomBetween([500, 1200]);
    this.suspiciousNextAt = now + randomBetween([4000, 7000]);
    this.confusedNextAt = now + randomBetween([2600, 4200]);
    this.dragTurn = -1;
    this.lastDragCycle = -1;
    this.notifyMotionTriggered = false;
    this.wakingBurstTriggered = false;
    this.packageEffects.clear();
    this.autoplay = null;
    this.autoplayMotion = null;
    this.spinSpring = null;
    this.spinSource = null;
    this.wideSpinActive = false;
    this.bounceStartedAt = -1;
    this.spinSignal = 0;
    this.stateSpinNextAt = now + randomBetween(stateSpinDelay(this.stateName));
    this.effectSpinPhase = 0;
    this.nextAutoplayAt = performance.now() + randomBetween([9000, 18000]);
  }

  syncHoverTarget() {
    const nextTarget = this.trackPointer ? this.container.closest?.(".sb-as-card") || this.container : null;
    if (nextTarget === this.hoverTarget) return;
    this.hoverTarget?.removeEventListener("pointerenter", this.handlePointerEnter);
    this.hoverTarget?.removeEventListener("pointerleave", this.handlePointerLeave);
    this.hoverTarget = nextTarget;
    this.hoverTarget?.addEventListener("pointerenter", this.handlePointerEnter);
    this.hoverTarget?.addEventListener("pointerleave", this.handlePointerLeave);
  }

  updateAutoplay(now, dt) {
    const eligible = this.stateName === "happy" || this.stateName === "excited" || this.stateName === "proud" || this.stateName === "playful";
    if (this.reducedMotion) {
      this.autoplay = null;
      this.autoplayMotion = null;
      this.spinSpring = null;
      this.spinSource = null;
      this.wideSpinActive = false;
      this.spinSignal = 0;
      this.bounceStartedAt = -1;
      return;
    }
    if (!eligible && this.stateName !== "celebrate") {
      this.autoplay = null;
      this.wideSpinActive = false;
    }
    if (this.stateName === "celebrate" && !this.autoplay && now >= this.stateSpinNextAt) {
      this.autoplay = {
        kind: "wide-spin",
        startedAt: now,
        duration: 5490,
        direction: Math.random() < .5 ? -1 : 1,
        turns: 9
      };
      this.stateSpinNextAt = now + 6200;
    }
    if (now >= this.nextAutoplayAt) {
      const happyState = this.stateName === "happy" || this.stateName === "excited" || this.stateName === "proud";
      const playfulState = this.stateName === "playful";
      if ((happyState || playfulState) && !this.spinSpring && this.bounceStartedAt < 0 && !this.autoplay) {
        const sample = Math.random();
        const direction = Math.random() < .5 ? -1 : 1;
        if (happyState) {
          if (sample < .55) this.startPackageSpin(1, direction, "autoplay");
          else this.autoplay = { kind: "spinBounce", startedAt: now, duration: 700, direction, turns: 1 };
        } else if (sample < .34) {
          this.autoplay = { kind: "spinBounce", startedAt: now, duration: 700, direction, turns: 1 };
        } else if (sample < .62) {
          this.bounceStartedAt = now;
        } else if (sample < .86) {
          this.autoplay = { kind: "dizzy", startedAt: now, duration: randomBetween([2200, 3400]), direction, turns: Math.round(randomBetween([3, 4])) };
        } else {
          this.startPackageSpin(1, direction, "autoplay");
          this.packageEffects.burst(16, .95, .3);
        }
      }
      this.nextAutoplayAt = now + randomBetween([9000, 18000]);
    }
    this.spinSignal = 0;
    this.autoplayMotion = null;
    if (this.spinSpring) {
      const step = Math.min(Math.max(dt, 0), .1);
      const steps = Math.max(1, Math.ceil(step / (1 / 120)));
      for (let index = 0; index < steps; index += 1) advanceSpring(this.spinSpring, 6.2, 1, step / steps);
      this.autoplayMotion = { rotate: this.spinSpring.value * 180 / Math.PI };
      this.spinSignal = this.spinSpring.value;
      if (Math.abs(this.spinSpring.target - this.spinSpring.value) < .004 && Math.abs(this.spinSpring.velocity) < .015) {
        this.spinSpring = null;
        const source = this.spinSource;
        this.spinSource = null;
        if (source === "autoplay") this.autoplay = null;
        if (source === "autoplay") this.wideSpinActive = false;
        this.autoplayMotion = null;
        this.spinSignal = 0;
        if (source === "autoplay") this.nextAutoplayAt = now + randomBetween([9000, 18000]);
      }
    }
    if (this.autoplay) {
      const elapsed = now - this.autoplay.startedAt;
      const progress = clamp(elapsed / this.autoplay.duration, 0, 1);
      const eased = progress < .5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;
      if (this.autoplay.kind === "wide-spin") {
        const elapsedSeconds = elapsed / 1000;
        const windup = .24;
        const coast = 2.3;
        const settle = 1.25;
        const total = windup + coast + settle;
        const tail = 1.7;
        const halfTurnOffset = .5;
        const fullTurn = TWO_PI;
        const angularRate = (this.autoplay.turns * fullTurn + halfTurnOffset) / (.3 / 2 + 2 + settle / 4);
        let phaseAngle;
        if (elapsedSeconds < windup) {
          phaseAngle = -halfTurnOffset * (1 - Math.cos(elapsedSeconds / windup * Math.PI)) / 2;
        } else if (elapsedSeconds < windup + .3) {
          const phase = elapsedSeconds - windup;
          phaseAngle = -halfTurnOffset + angularRate * phase * phase / (2 * .3);
        } else if (elapsedSeconds < windup + coast) {
          phaseAngle = -halfTurnOffset + angularRate * (.3 / 2 + (elapsedSeconds - windup - .3));
        } else if (elapsedSeconds < total) {
          const phase = (elapsedSeconds - windup - coast) / settle;
          phaseAngle = -halfTurnOffset + angularRate * (.3 / 2 + 2) + angularRate * settle * (1 - Math.pow(1 - phase, 4)) / 4;
        } else {
          phaseAngle = this.autoplay.turns * fullTurn;
        }
        const wobbleProgress = elapsedSeconds > windup + coast
          ? Math.min((elapsedSeconds - windup - coast) / settle, 1)
          : 0;
        let wobble = wobbleProgress < .4 ? 0 : Math.pow((wobbleProgress - .4) / .6, 2);
        if (elapsedSeconds >= total) wobble = Math.pow(1 - Math.min((elapsedSeconds - total) / tail, 1), 1.6);
        const wobbleTime = Math.max(elapsedSeconds - windup - coast, 0);
        const rotationWobble = Math.sin(wobbleTime * 18.4) * 2.6 * wobble;
        const extraX = Math.sin(wobbleTime * 11.5) * 13 * this.autoplay.direction * wobble;
        const extraY = (Math.cos(wobbleTime * 9) - 1) * 3.5 * wobble;
        this.autoplayMotion = {
          rotate: phaseAngle * this.autoplay.direction * 180 / Math.PI + rotationWobble,
          x: Math.sin(wobbleTime * 9.2) * 11 * this.autoplay.direction * wobble + extraX,
          y: (Math.cos(wobbleTime * 9.2) - 1) * 6 * this.autoplay.direction * wobble + extraY,
          scaleX: 1.12 - .09 * wobble,
          scaleY: 1.14 - .44 * wobble + .1 * Math.sin(wobbleTime * 16) * wobble
        };
        this.spinSignal = phaseAngle * this.autoplay.direction;
      } else if (this.autoplay.kind === "spinBounce") {
        this.autoplayMotion = {
          rotate: this.autoplay.direction * eased * 360
        };
        this.spinSignal = this.autoplay.direction * eased * TWO_PI;
      } else if (this.autoplay.kind === "dizzy") {
        const spinDuration = .55 + this.autoplay.turns * .16;
        const seconds = elapsed / 1000;
        if (seconds < spinDuration) {
          const spinProgress = clamp(seconds / spinDuration, 0, 1);
          this.autoplayMotion = {
            rotate: this.autoplay.direction * this.autoplay.turns * 360 * spinProgress * spinProgress
          };
          this.spinSignal = this.autoplay.direction * this.autoplay.turns * TWO_PI * spinProgress * spinProgress;
        } else {
          const wobbleProgress = clamp((seconds - spinDuration) / 1.5, 0, 1);
          const fade = Math.pow(1 - wobbleProgress, 1.3);
          this.autoplayMotion = {
            x: Math.sin((seconds - spinDuration) * 10) * 17 * this.autoplay.direction * fade,
            y: Math.cos((seconds - spinDuration) * 10) * 10 * this.autoplay.direction * fade,
            rotate: Math.sin((seconds - spinDuration) * 20) * 3 * fade,
            scaleX: 1.03,
            scaleY: .46 + .14 * Math.sin((seconds - spinDuration) * 21)
          };
        }
      }
      if (progress >= 1) {
        if (this.autoplay.kind === "spinBounce") this.bounceStartedAt = now;
        const source = this.autoplay.source;
        this.autoplay = null;
        this.autoplayMotion = null;
        this.spinSignal = 0;
        this.wideSpinActive = false;
        if (source !== "hover") this.nextAutoplayAt = now + randomBetween([9000, 18000]);
      }
    }
    if (this.bounceStartedAt >= 0) {
      const bounceElapsed = (now - this.bounceStartedAt) / 1000;
      if (bounceElapsed >= PACKAGE_BOUNCE_DURATION) {
        this.bounceStartedAt = -1;
      }
    }
  }

  updateExpression(now) {
    const sequence = this.state.expressions?.length ? this.state.expressions : [0];
    if (sequence.length > 1 && now >= this.expressionAt) {
      const nextIndex = (this.expressionIndex + 1) % sequence.length;
      const expression = sequence[nextIndex] || 0;
      this.expressionFrom = this.currentRings || this.initialRings;
      this.expressionTo = expressionRingsForState(this.stateName, expression);
      this.expressionIndex = nextIndex;
      this.expressionSpring = { value: 0, velocity: 0, target: 1 };
      this.expressionAt = now + randomBetween(this.state.expressionMs);
    }
    const dt = Math.min(Math.max((now - this.lastExpressionFrame) / 1000, 0), .1);
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    for (let index = 0; index < steps; index += 1) advanceSpring(this.expressionSpring, 7, 1, dt / steps);
    this.lastExpressionFrame = now;
    this.currentRings = blendRings(this.expressionFrom, this.expressionTo, this.expressionSpring.value);
  }

  updateFaceTune(dt) {
    const target = faceTuneForState(this.stateName);
    const amount = expEase(.13, Math.max(dt, 1 / 120));
    for (const key of ["size", "gap", "height", "eyeWidth", "eyeHeight"]) {
      this.faceTune[key] += (target[key] - this.faceTune[key]) * amount;
    }
  }

  updateEyes(blink) {
    const metrics = SHAPE_METRICS[this.spec.shape];
    const tune = this.faceTune;
    const face = {
      x: metrics.face.x,
      y: metrics.face.y,
      sx: metrics.face.sx * tune.gap,
      sy: metrics.face.sy * tune.height,
      eye: metrics.face.eye * tune.size,
      leftDX: metrics.face.leftDX ?? 0
    };
    const centers = this.currentRings.map(averagePoint);
    const extents = this.currentRings.map((ring, index) => ring.reduce(
      (maximum, [x]) => Math.max(maximum, Math.abs(x - centers[index][0])), 0
    ));
    const leftDX = UNIFORM_EYES ? face.leftDX : 0;
    const gap = Math.abs(centers[1][0] - (centers[0][0] + leftDX)) * face.sx;
    const gapPadding = UNIFORM_EYES ? 0 : EYE_GAP_PADDING;
    const gapScale = extents[0] + extents[1] > .5
      ? clamp((gap - gapPadding) / (extents[0] + extents[1]), .35, 4)
      : 4;
    // The DMG scales the eyes with both the body scale spring and the active
    // expression spring. Keeping this factor here prevents the eyes from
    // feeling pasted on while expressions morph.
    const bodyScaleX = this.bodySprings?.scaleX?.value ?? 1;
    const eyeBreath = 1 + .07 * Math.sin(clamp(this.expressionSpring.value, 0, 1) * Math.PI);
    const eyeScale = (UNIFORM_EYES ? 1 : face.eye) * clamp(PACKAGE_EYE_SCALE[this.spec.shape] ?? 1, .25, 4) * bodyScaleX;
    const scale = Math.min(clamp(eyeScale, .2, 2), gapScale / eyeBreath);
    const width = Math.min(scale * tune.eyeWidth, gapScale / eyeBreath);
    const height = scale * tune.eyeHeight;
    const span = this.shapeSpan;
    const poseMatrix = multiplyMatrices(
      matrixFromEuler(PACKAGE_POSE.turn, PACKAGE_POSE.tilt, PACKAGE_POSE.roll),
      matrixFromEuler(PACKAGE_POSE_HOME.turn, PACKAGE_POSE_HOME.tilt, PACKAGE_POSE_HOME.roll)
    );

    this.currentRings.forEach((ring, index) => {
      const eye = this.eyes[index];
      const [centerRingX, centerRingY] = centers[index];
      const translatedX = centerRingX + (index === 0 ? leftDX : 0);
      const normalizedX = (translatedX - CENTER) / CENTER;
      const normalizedY = (CENTER - centerRingY) / CENTER;
      const normalizedZ = Math.sqrt(Math.max(0, 1 - normalizedX * normalizedX - normalizedY * normalizedY)) || .02;
      const projectedX = poseMatrix[0] * normalizedX + poseMatrix[1] * normalizedY + poseMatrix[2] * normalizedZ;
      const projectedY = poseMatrix[3] * normalizedX + poseMatrix[4] * normalizedY + poseMatrix[5] * normalizedZ;
      const px = projectedX * CENTER * face.sx;
      const py = clamp(
        CENTER + face.y - projectedY * CENTER * face.sy,
        metrics.top + 2,
        metrics.bottom - 2
      );
      let tx = -normalizedY * normalizedX;
      let ty = 1 - normalizedY * normalizedY;
      let tz = -normalizedY * normalizedZ;
      const tangentLength = Math.hypot(tx, ty, tz);
      if (tangentLength < 1e-6) {
        tx = 0;
        ty = 0;
        tz = 1;
      } else {
        tx /= tangentLength;
        ty /= tangentLength;
        tz /= tangentLength;
      }
      const crossX = normalizedY * tz - normalizedZ * ty;
      const crossY = normalizedZ * tx - normalizedX * tz;
      const crossZ = normalizedX * ty - normalizedY * tx;
      const projectedTx = poseMatrix[0] * tx + poseMatrix[1] * ty + poseMatrix[2] * tz;
      const projectedTy = poseMatrix[3] * tx + poseMatrix[4] * ty + poseMatrix[5] * tz;
      const projectedCrossX = poseMatrix[0] * crossX + poseMatrix[1] * crossY + poseMatrix[2] * crossZ;
      const projectedCrossY = poseMatrix[3] * crossX + poseMatrix[4] * crossY + poseMatrix[5] * crossZ;
      const inverseBaseA = crossX;
      const inverseBaseB = -crossY;
      const inverseBaseC = tx;
      const inverseBaseD = -ty;
      const determinant = inverseBaseA * inverseBaseD - inverseBaseC * inverseBaseB || 1e-6;
      const inverseA = inverseBaseD / determinant;
      const inverseB = -inverseBaseC / determinant;
      const inverseC = -inverseBaseB / determinant;
      const inverseD = inverseBaseA / determinant;
      const matrixA = projectedCrossX * inverseA + projectedTx * inverseC;
      const matrixB = projectedCrossX * inverseB + projectedTx * inverseD;
      const matrixC = -projectedCrossY * inverseA - projectedTy * inverseC;
      const matrixD = -projectedCrossY * inverseB - projectedTy * inverseD;
      const scaleX = Math.max(Math.hypot(matrixA, matrixC), .02) * width * eyeBreath;
      const scaleY = Math.max(Math.hypot(matrixB, matrixD), .02) * height * eyeBreath;
      const safePadding = EYE_BODY_PADDING * scaleY + 2;
      const safeY = clamp(py, metrics.top + safePadding, metrics.bottom - safePadding);
      const bounds = ring
        .filter((_, pointIndex) => pointIndex % 2 === 0)
        .map(([x, y]) => ({
          dx: (x - centerRingX) * scaleX,
          y: safeY + (y - centerRingY) * scaleY
        }));
    const eyeX = CENTER + face.x + px + this.gazeX;
    const constrainedX = fitEyeToShape(span, eyeX, bounds);
    const finalX = constrainedX;
    const finalY = clamp(safeY + this.gazeY, metrics.top + safePadding, metrics.bottom - safePadding);
      eye.setAttribute("d", pathRing(ring));
      eye.setAttribute(
        "transform",
        `translate(${finalX.toFixed(2)} ${finalY.toFixed(2)}) matrix(${(matrixA * width).toFixed(4)} ${(matrixC * width).toFixed(4)} ${(matrixB * height).toFixed(4)} ${(matrixD * height * blink).toFixed(4)} 0 0) translate(${-centerRingX.toFixed(2)} ${-centerRingY.toFixed(2)})`
      );
    });
  }

  updateEffects(now, dt, intensity) {
    const effectType = PACKAGE_EFFECT_BY_STATE[this.stateName] || null;
    if (effectType !== this.effectType) {
      this.previousEffectType = this.effectType;
      this.previousEffectBurstAt = this.effectBurstAt;
      this.packageEffects.clear();
      this.effectType = effectType;
      this.effectBurstAt = now;
      this.effectCrossfade = { value: this.previousEffectType ? 0 : 1, velocity: 0, target: 1 };
      this.receiveCycle = -1;
      const burstCount = { dots: 5, gather: 22, wave: 12, send: 9, receive: 9, dock: 12, ball: 14, whirl: 10, pencil: 8, bang: 18, standby: 8 }[effectType] || 0;
      if (burstCount) this.packageEffects.burst(burstCount, effectType === "gather" ? 1.1 : 1, effectType === "wave" ? .3 : 0);
    }
    const effectDurations = { dots: 1, orbit: 1, radar: 1, progress: 1, gather: 2, wave: 1.7, send: 1.5, receive: 1.7, dock: 3.1, ball: 1.8, whirl: 1, pencil: 2.5, bang: 2.2, standby: 1 };
    const effectProgressFor = (type, startedAt) => type && effectDurations[type] === 1
      ? 1
      : type ? clamp((now - startedAt) / (effectDurations[type] * 1000), 0, 1) : 0;
    const effectProgress = effectProgressFor(effectType, this.effectBurstAt);
    const previousProgress = effectProgressFor(this.previousEffectType, this.previousEffectBurstAt);
    const step = Math.min(Math.max(dt, 0), .1);
    const steps = Math.max(1, Math.ceil(step / (1 / 120)));
    for (let index = 0; index < steps; index += 1) advanceSpring(this.effectCrossfade, 8, 1, step / steps);
    const currentBlend = effectBlend(effectType, effectType, this.previousEffectType, effectProgress, this.effectCrossfade.value) || (effectType ? clamp(effectProgress, 0, 1) : 0);
    const previousBlend = effectBlend(this.previousEffectType, effectType, this.previousEffectType, previousProgress, this.effectCrossfade.value);
    if (effectType === "receive") {
      const cycle = Math.floor(Math.max(0, (now - this.effectBurstAt) / 1000) / 1.7);
      if (cycle !== this.receiveCycle) {
        this.receiveCycle = cycle;
        this.receiveAngle = Math.random() * Math.PI * 1.5 - Math.PI * 1.25;
      }
    }
    this.stateEffects.render(effectType, effectProgress, now, currentBlend, { elapsed: (now - this.effectBurstAt) / 1000, receiveAngle: this.receiveAngle });
    this.previousStateEffects.render(this.previousEffectType, previousProgress, now, previousBlend, { elapsed: (now - this.previousEffectBurstAt) / 1000, receiveAngle: this.receiveAngle });
    if (this.previousEffectType && previousBlend <= .004) {
      this.previousStateEffects.clear();
      this.previousEffectType = null;
      this.previousEffectBurstAt = 0;
    }
    const wideStyle = this.wideSpinActive || this.autoplay?.kind === "wide-spin" || this.stateName === "humming";
    const sustainBelts = this.stateName === "humming" || this.stateName === "loading";
    const continuousState = this.stateName === "humming" || this.stateName === "loading";
    if (continuousState) {
      const seconds = (now - this.stateStartedAt) / 1000;
      const targetRate = this.stateName === "loading" ? 3 : 1.6;
      const rate = seconds < .5
        ? 7 * (seconds / .5 < .5 ? 4 * (seconds / .5) ** 3 : 1 - Math.pow(-2 * (seconds / .5) + 2, 3) / 2)
        : seconds < 1.3
          ? 7 + (targetRate - 7) * ((seconds - .5) / .8 < .5 ? 4 * ((seconds - .5) / .8) ** 3 : 1 - Math.pow(-2 * ((seconds - .5) / .8) + 2, 3) / 2)
          : targetRate + .3 * Math.sin(seconds * .5);
      this.effectSpinPhase += rate * dt;
    } else {
      this.effectSpinPhase = 0;
    }
    const spinAngle = this.spinSignal || (continuousState ? this.effectSpinPhase : 0);
    this.packageEffects.update(now, dt, { spinAngle, wideStyle, sustainBelts, allowOrbit: this.autoplay?.source !== "hover" });
    return { currentBlend, previousBlend };
  }

  bodyEffectMotion(now, blends) {
    const motion = { x: 0, y: 0, rotate: 0, scaleX: 1, scaleY: 1 };
    const active = (type) => type === this.effectType ? blends.currentBlend : type === this.previousEffectType ? blends.previousBlend : 0;
    const elapsed = Math.max(0, (now - this.effectBurstAt) / 1000);
    const receive = active("receive");
    if (receive > .004) {
      const phase = (elapsed / 1.7 % 1 + 1) % 1;
      const pulse = clamp((phase - .58) / .34, 0, 1);
      motion.scaleY *= 1 + .11 * Math.sin(pulse * Math.PI) * receive;
    }
    const send = active("send");
    if (send > .004) {
      const phase = (elapsed / 1.5 % 1 + 1) % 1;
      const lift = phase < .18 ? -.06 * Math.sin(phase / .18 * Math.PI) : phase < .42 ? .05 * Math.sin((phase - .18) / .24 * Math.PI) : 0;
      motion.scaleY *= 1 + lift * send;
    }
    const bang = active("bang");
    if (bang > .004) motion.y += 58 * bang;
    const pencil = active("pencil");
    if (pencil > .004) {
      const phase = (elapsed / 2.5 % 1 + 1) % 1;
      const sweep = phase < .5 ? phase * 2 : 2 - phase * 2;
      motion.x += (-54 + 118 * sweep) * pencil;
      motion.y += (26 - 68 * Math.sin(phase * Math.PI)) * pencil;
      motion.rotate += 17 * pencil;
    }
    const whirl = active("whirl");
    if (whirl > .004) {
      const seconds = now / 1000;
      motion.x += (Math.sin(seconds * .9) * 2 + Math.sin(seconds * 1.7) * .8) * whirl;
      motion.y += (Math.sin(seconds * 1.3) * 2.4 + Math.sin(seconds * .6) * 1.2) * whirl;
    }
    const ball = active("ball");
    if (ball > .004) {
      const seconds = elapsed;
      const duration = .62;
      const height = 52;
      const curvature = 8 * height / (duration * duration);
      const apexTime = Math.sqrt(2 * 40 / curvature);
      const phase = Math.max(0, (seconds - apexTime) / duration) % 1;
      const heightAt = seconds < apexTime ? 40 - .5 * curvature * seconds * seconds : 4 * height * phase * (1 - phase);
      motion.y += (40 - heightAt) * ball;
    }
    return motion;
  }

  updateBodySprings(target, dt) {
    const springs = this.bodySprings;
    springs.x.target = target.x;
    springs.y.target = target.y;
    springs.rotate.target = target.rotate;
    springs.scaleX.target = target.scaleX;
    springs.scaleY.target = target.scaleY;
    springs.opacity.target = target.opacity;
    const step = Math.min(Math.max(dt, 0), .1);
    const steps = Math.max(1, Math.ceil(step / (1 / 120)));
    for (let index = 0; index < steps; index += 1) {
      const slice = step / steps;
      // These bindings mirror the DMG loop: ne is horizontal, de is vertical, Y is rotation.
      advanceSpring(springs.x, 3.5, 1, slice);
      advanceSpring(springs.y, 4, 1, slice);
      advanceSpring(springs.rotate, 5, .9, slice);
      advanceSpring(springs.scaleX, 9, .85, slice);
      advanceSpring(springs.scaleY, 10, .8, slice);
      advanceSpring(springs.opacity, 26, 1, slice);
    }
    return springs;
  }

  startPackageSpin(turns = 1, direction = 1, source = "state") {
    if (this.reducedMotion || this.spinSpring || this.autoplay) return false;
    this.spinSpring = { value: 0, velocity: 0, target: direction * turns * TWO_PI };
    this.spinSource = source;
    return true;
  }

  update(now) {
    const dt = Math.min(Math.max((now - this.lastFrame) / 1000, 0), .1);
    this.lastFrame = now;
    this.updateAutoplay(now, dt);
    this.updateExpression(now);
    this.updateFaceTune(dt);
    this.syncHoverTarget();
    const rect = this.svg.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const hoverRect = this.hoverTarget?.getBoundingClientRect?.();
    const pointerInside = Boolean(
      this.trackPointer && pointer.active && hoverRect && hoverRect.width > 0 && hoverRect.height > 0
      && pointer.x >= hoverRect.left && pointer.x <= hoverRect.right
      && pointer.y >= hoverRect.top && pointer.y <= hoverRect.bottom
    );
    if (pointerInside && !this.pointerInside) this.handlePointerEnter();
    else if (!pointerInside && this.pointerInside) this.handlePointerLeave();
    const elapsed = (now - this.startedAt) / 1000;
    const pointerX = this.trackPointer && pointer.active ? pointer.x : centerX;
    const pointerY = this.trackPointer && pointer.active ? pointer.y : centerY;
    if (this.trackPointer && pointer.active) {
      this.gazeTargetX = 22 * clamp((pointerX - centerX) / Math.max(rect.width, 1), -.6, .6);
      this.gazeTargetY = 14 * clamp((pointerY - centerY) / Math.max(rect.height, 1), -.6, .6);
    } else if (now >= this.gazeTargetAt) {
      const target = packageGazeTargetForState(this.stateName);
      this.gazeTargetX = target.x;
      this.gazeTargetY = target.y;
      this.gazeTargetAt = now + randomBetween([target.min, target.max]);
    }
    const smoothing = expEase(.16, Math.max(dt, 1 / 120));
    this.gazeX += (this.gazeTargetX - this.gazeX) * smoothing;
    this.gazeY += (this.gazeTargetY - this.gazeY) * smoothing;
    if (!this.reducedMotion && now >= this.blinkAt) {
      this.blinkStart = now;
      this.blinkEnd = now + (this.stateName === "notifying" ? 180 : 155);
      this.blinkAt = now + randomBetween(this.state.blinkMs);
    }
    const blink = blinkAmount(this, now);
    this.updateEyes(blink);
    const motion = this.motion(now);
    const reaction = this.autoplayMotion;
    if (reaction) {
      motion.x += reaction.x ?? 0;
      motion.y += reaction.y ?? 0;
      motion.rotate += reaction.rotate ?? 0;
      motion.scaleX *= reaction.scaleX ?? 1;
      motion.scaleY *= reaction.scaleY ?? 1;
    }
    if (this.bounceStartedAt >= 0) {
      let bounceElapsed = (now - this.bounceStartedAt) / 1000;
      let offset = 0;
      for (const segment of PACKAGE_BOUNCE_SEGMENTS) {
        if (bounceElapsed <= segment.duration) {
          const progress = clamp(bounceElapsed / segment.duration, 0, 1);
          offset = -4 * segment.height * progress * (1 - progress);
          break;
        }
        bounceElapsed -= segment.duration;
      }
      motion.y += offset;
    }
    const effectFrame = this.updateEffects(now, dt, 1);
    const effectMotion = this.bodyEffectMotion(now, effectFrame);
    motion.x += effectMotion.x;
    motion.y += effectMotion.y;
    motion.rotate += effectMotion.rotate;
    motion.scaleX *= effectMotion.scaleX;
    motion.scaleY *= effectMotion.scaleY;
    const body = this.updateBodySprings(motion, dt);
    const bodyScale = PACKAGE_BODY_SCALE[this.spec.shape] || 259 / 229;
    this.runtime.setAttribute("transform", `translate(${(CENTER + body.x.value).toFixed(2)} ${(CENTER + body.y.value).toFixed(2)}) rotate(${body.rotate.value.toFixed(2)}) scale(${(body.scaleX.value * bodyScale).toFixed(4)} ${(body.scaleY.value * bodyScale).toFixed(4)}) translate(${-CENTER.toFixed(2)} ${-CENTER.toFixed(2)})`);
    this.runtime.style.opacity = body.opacity.value.toFixed(3);
  }

  motion(now) {
    const Tt = (now - this.startedAt) / 1000;
    const Qt = Math.max(0, (now - this.stateStartedAt) / 1000);
    const state = this.stateName;
    const result = { x: 0, y: 0, rotate: 0, scaleX: 1, scaleY: 1, opacity: 1 };

    switch (state) {
      case "sleeping": {
        const At = Math.min(Qt / 2, 1);
        const mn = Math.sin(clamp(Qt / .5, 0, 1) * Math.PI);
        result.x = 4 * At;
        result.y = -2 * At;
        result.rotate = 8 * At + Math.sin(Tt * .55) * 3 - mn * 5;
        result.scaleY = 1 + Math.sin(Tt * .55) * .016 + mn * .05;
        break;
      }
      case "waking":
        if (Qt < .75) {
          result.scaleX = 1 + .08 * clamp(Qt / .6, 0, 1);
          result.rotate = 4 - 10 * clamp(Qt / .75, 0, 1);
          result.scaleY = 1.02;
          if (Qt > .2 && !this.wakingBurstTriggered) {
            this.wakingBurstTriggered = true;
            this.packageEffects.burst(Math.round(randomBetween([9, 13])), .8, 0);
          }
        } else if (Qt < 1.45) {
          result.rotate = 0;
          result.scaleY = 1;
        } else {
          const At = Math.min((Qt - 1.45) / .65, 1);
          result.x = Math.sin(At * Math.PI * 3) * 6 * (1 - At);
          result.rotate = Math.sin(Tt * .9) * 2;
        }
        break;
      case "idle":
        result.x = Math.sin(Tt * .5) * 1.5 + Math.sin(Tt * .17) * .6;
        result.y = Math.sin(Tt * .27);
        result.rotate = Math.sin(Tt * .85) * 1.2;
        result.scaleY = 1 + Math.sin(Tt * .85) * .007;
        break;
      case "listening":
        result.x = 8 + Math.sin(Tt * .5) * 1.5;
        result.y = 2;
        result.rotate = -2 + Math.sin(Tt * .8) * .8;
        result.scaleY = 1.015;
        if (now >= this.listeningNodEnd) {
          this.listeningNodEnd = now + randomBetween([1800, 3200]);
        }
        if (now >= this.listeningNodEnd - 380) {
          const At = 1 - (this.listeningNodEnd - now) / 380;
          result.rotate += Math.sin(At * Math.PI) * 4.5;
          result.x += Math.sin(At * Math.PI) * 2;
        }
        break;
      case "thinking":
        result.x = -9 + Math.sin(Tt * .35) * 5;
        result.y = Math.sin(Tt * .3) * 5;
        result.rotate = Math.sin(Tt * .6) * 2.5;
        break;
      case "searching": {
        const At = Math.sin(Tt * 1.3);
        result.x = At * 13;
        result.y = At * 7;
        result.rotate = Math.sin(Tt * 1.7) * 3;
        break;
      }
      case "working": {
        const At = Math.sin(Tt * TWO_PI * 1.6);
        result.x = 4 + At * 2.5;
        result.y = 3;
        result.rotate = 1.5 + Math.max(0, At) * 3;
        result.scaleY = 1 - Math.max(0, At) * .02;
        if (now >= this.stateSpinNextAt) {
          this.startPackageSpin(1, 1);
          this.stateSpinNextAt = now + randomBetween([6000, 9000]);
        }
        break;
      }
      case "excited": {
        const At = (Tt * 2.2) % 1;
        const mn = Math.sin(At * Math.PI);
        result.rotate = -mn * 10 + 2;
        result.scaleY = At < .1 ? .92 : At < .3 ? 1.05 : 1;
        result.y = Math.sin(Tt * 1.1) * 4;
        result.scaleX = 1.06;
        result.x = Math.sin(Tt * TWO_PI * 1.1) * 7;
        if (now >= this.stateSpinNextAt) {
          this.startPackageSpin(1, 1);
          this.stateSpinNextAt = now + randomBetween([2800, 5000]);
        }
        break;
      }
      case "surprised": {
        const At = Math.min(Qt / 1.2, 1);
        result.y = -4 * (1 - At);
        result.rotate = -8 * (1 - At);
        result.scaleY = Qt < .2 ? 1.08 : 1;
        result.scaleX = 1.15 - At * .08;
        result.x = Math.sin(Tt * 11) * 1.5 * (1 - At);
        break;
      }
      case "suspicious":
        result.x = -6 + Math.sin(Tt * .3) * 3;
        result.y = Math.sin(Tt * .25) * -4;
        result.rotate = 1 + Math.sin(Tt * .45) * 1.2;
        result.scaleY = 1;
        result.opacity = .85;
        if (now >= this.suspiciousNextAt) {
          this.bodySprings.x.velocity += 30;
          this.suspiciousNextAt = now + randomBetween([4000, 7000]);
        }
        break;
      case "angry":
        if (now >= this.angryNextAt) {
          this.angryShakeEnd = now + 420;
          this.bodySprings.rotate.velocity += 70;
          this.angryNextAt = now + randomBetween([1800, 3200]);
        }
        result.x = now < this.angryShakeEnd ? Math.sin(now * .05) * 4.5 : 0;
        result.rotate = 3.5;
        result.scaleY = .975;
        break;
      case "drowsy": {
        result.x = Math.sin(Tt * .32) * 2.5;
        result.y = Math.sin(Tt * .2) * 1.5;
        result.rotate = 6 + Math.sin(Tt * .36) * 2.2;
        result.scaleY = 1 + Math.sin(Tt * .36) * .022;
        result.opacity = .34 + Math.sin(Tt * .8) * .07;
        if (!this.drowsyStartedAt && now >= this.drowsyNextAt) this.drowsyStartedAt = now;
        if (this.drowsyStartedAt) {
          const mn = (now - this.drowsyStartedAt) / 1000;
          if (mn < 1.7) {
            const hn = mn / 1.7;
            const At = hn * hn;
            const Js = Math.sin(hn * Math.PI * 2.5) * 2.2 * (1 - hn);
            result.rotate = 6 + At * 19 + Js;
            result.x = At * 10;
            result.opacity = .34 - At * (.34 - .04);
            result.scaleY = 1 - At * .045;
          } else if (mn < 2) {
            const hn = (mn - 1.7) / .3;
            const At = Math.sin(hn * Math.PI);
            result.rotate = 25 - At * 7;
            result.x = 10 - At * 4;
            result.opacity = .04 + At * .42;
          } else if (mn < 3.5) {
            const hn = (mn - 2) / 1.5;
            const At = 1 - Math.pow(1 - hn, 2.2);
            result.rotate = 25 - 19 * At;
            result.x = 10 * (1 - At);
            result.opacity = .46 + (.34 - .46) * At;
            if (hn > .32 && hn < .46) result.opacity = .05;
          } else {
            this.drowsyStartedAt = 0;
            this.drowsyNextAt = now + randomBetween([1500, 3500]);
          }
        }
        break;
      }
      case "happy": {
        const At = Math.sin(Tt * 2.4);
        result.x = Math.sin(Tt * 1.2) * 3;
        result.y = Math.sin(Tt * 1.1) * 2.5;
        result.rotate = -Math.abs(At) * 3;
        result.scaleY = 1 + At * .02;
        result.scaleX = 1.05;
        break;
      }
      case "curious":
        result.x = 10 + Math.sin(Tt * .7) * 6;
        result.y = Math.sin(Tt * .6) * 5;
        result.rotate = -2 + Math.sin(Tt * .9) * 1.5;
        result.scaleY = 1.01;
        result.scaleX = 1.08;
        if (now >= this.curiousNodEnd) this.curiousNodEnd = now + randomBetween([1600, 2800]);
        if (now >= this.curiousNodEnd - 440) {
          const At = 1 - (this.curiousNodEnd - now) / 440;
          result.y += Math.sin(At * Math.PI) * 8;
          result.x += Math.sin(At * Math.PI) * 5;
        }
        break;
      case "confused": {
        const At = Math.sin(Tt * .8);
        result.x = At * 12;
        result.y = At * 3;
        result.rotate = Math.sin(Tt * .5) * 2;
        result.scaleY = 1;
        result.opacity = .9;
        if (now >= this.confusedNextAt) {
          this.bodySprings.x.velocity += 22;
          this.confusedNextAt = now + randomBetween([2600, 4200]);
        }
        break;
      }
      case "bored":
        result.x = -3 + Math.sin(Tt * .25) * 4;
        result.y = Math.sin(Tt * .2) * 4;
        result.rotate = 5 + Math.sin(Tt * .35) * 1.5;
        result.scaleY = .99;
        result.scaleX = .98;
        result.opacity = .6;
        if (now >= this.boredNodEnd) this.boredNodEnd = now + randomBetween([4000, 7000]);
        if (now >= this.boredNodEnd - 600) {
          const At = 1 - (this.boredNodEnd - now) / 600;
          result.scaleY = 1 + Math.sin(At * Math.PI) * .05;
          result.rotate += Math.sin(At * Math.PI) * 3;
        }
        break;
      case "proud":
        result.x = Math.sin(Tt * .4) * 2.5;
        result.y = Math.sin(Tt * .35) * 2;
        result.rotate = -4 + Math.sin(Tt * .6);
        result.scaleY = 1.03;
        result.scaleX = 1.02;
        result.opacity = .9;
        break;
      case "shy":
        result.x = -8 + Math.sin(Tt * .5) * 3;
        result.y = -3 + Math.sin(Tt * .4) * 2;
        result.rotate = 3;
        result.scaleY = .98;
        result.scaleX = .95;
        result.opacity = .85;
        break;
      case "sad":
        result.x = 3 + Math.sin(Tt * .3) * 2;
        result.y = Math.sin(Tt * .25) * 1.5;
        result.rotate = 7 + Math.sin(Tt * .4);
        result.scaleY = .97;
        result.scaleX = .97;
        result.opacity = .7;
        break;
      case "laughing": {
        const At = Math.sin(Tt * TWO_PI * 3.2);
        result.x = At * 4;
        result.y = Math.sin(Tt * 2) * 2;
        result.rotate = -Math.abs(At) * 5;
        result.scaleY = 1 + At * .03;
        result.opacity = .7;
        break;
      }
      case "scared":
        result.x = Math.sin(now * .04) * 2;
        result.y = -2 + Math.sin(now * .05) * 1.5;
        result.rotate = 2 + Math.sin(Tt * 1.5);
        result.scaleY = .97;
        result.scaleX = 1.12;
        result.opacity = 1.05;
        break;
      case "playful":
        result.x = Math.sin(Tt * 1.4) * 8;
        result.y = Math.sin(Tt * 1.1) * 4;
        result.rotate = -Math.abs(Math.sin(Tt * 2.2)) * 3;
        result.scaleY = 1 + Math.sin(Tt * 2.2) * .015;
        result.scaleX = 1.06;
        if (now >= this.stateSpinNextAt) {
          this.startPackageSpin(1, 1);
          this.stateSpinNextAt = now + randomBetween([3500, 6000]);
        }
        break;
      case "celebrate":
        result.rotate = -Math.abs(Math.sin(Tt * 1.6)) * 2.5;
        result.scaleY = 1;
        result.scaleX = 1.1;
        result.opacity = 1.1;
        break;
      case "orbit": {
        result.opacity = 1;
        break;
      }
      case "radar": {
        result.opacity = 1;
        break;
      }
      case "progress": {
        result.opacity = 1;
        break;
      }
      case "spawning": {
        result.opacity = 1;
        break;
      }
      case "loading": {
        result.opacity = 1;
        break;
      }
      case "dictating": {
        result.opacity = 1;
        break;
      }
      case "sending": {
        result.opacity = 1;
        break;
      }
      case "receiving": {
        result.opacity = 1;
        break;
      }
      case "uploading": {
        result.opacity = 1;
        break;
      }
      case "writing": {
        result.opacity = 1;
        break;
      }
      case "alerting": {
        result.opacity = 1;
        break;
      }
      case "bouncing": {
        result.opacity = 1;
        break;
      }
      case "powering-down": {
        result.opacity = 1;
        break;
      }
      case "dragging": {
        const mn = (Qt % 3.4) / 3.4;
        const un = Math.floor(Qt / 3.4);
        if (mn < .12) {
          result.y = -16;
          result.rotate = -22;
          result.x = -5;
        } else if (mn < .62) {
          const Jt = (mn - .12) / .5;
          result.y = -16 + 32 * smoothstep(Jt);
          result.rotate = -22 + Math.sin(Tt * 1.4) * 2;
          result.x = Math.sin(Tt * 2.6) * 6;
          result.scaleX = 1.06;
        } else {
          if (un !== this.dragTurn) {
            this.dragTurn = un;
            this.bodySprings.rotate.velocity += 90;
          }
          result.y = 16;
        }
        break;
      }
      case "humming":
        result.x = Math.sin(Tt * .4) * 2;
        result.y = Math.sin(Tt * .3) * 1.5;
        result.rotate = Math.sin(Tt * .7) * 1.5;
        break;
      case "notifying":
        if (!this.notifyMotionTriggered && Qt > .12) {
          this.notifyMotionTriggered = true;
          this.bodySprings.rotate.velocity -= 26;
        }
        result.scaleX = 1 + .05 * Math.exp(-Qt * 3);
        result.x = 3;
        result.y = 2;
        result.rotate = -1;
        break;
      default:
        break;
    }
    return result;
  }

  destroy() {
    this.hoverTarget?.removeEventListener("pointerenter", this.handlePointerEnter);
    this.hoverTarget?.removeEventListener("pointerleave", this.handlePointerLeave);
    this.packageEffects.clear();
    this.stateEffects.clear();
    this.previousStateEffects.clear();
    controllers.delete(this);
    if (controllerByContainer.get(this.container) === this) controllerByContainer.delete(this.container);
  }
}

export function grokStateForTeamStatus(status) {
  if (status?.state === "working") return "working";
  if (status?.state === "blocked") return "alerting";
  return "idle";
}

export function mountGrokBotAvatar(container, value, { alt = "", state = "idle", trackPointer = true, mode = "agent-square" } = {}) {
  if (!container) return false;
  const normalizedState = STATE_PROFILES[state] ? state : "idle";
  const existing = controllerByContainer.get(container);
  const spec = grokAvatarSpecFor(value);
    if (existing && existing.spec.shape === spec.shape && existing.spec.color === spec.color) {
      existing.mode = mode;
      existing.trackPointer = mode === "agent-square" && trackPointer;
      existing.syncHoverTarget();
      existing.setState(normalizedState);
    existing.svg.setAttribute("aria-label", alt || "数字员工头像");
    container.setAttribute("aria-label", alt || "数字员工头像");
    return true;
  }
  existing?.destroy();
  if (trackPointer) bindPointer();
  const id = `grok-avatar-${++idSeed}`;
  const parts = createSvg(spec, id, normalizedState, alt);
  container.classList.add("sb-grok-avatar");
  container.dataset.sbGrokAvatar = "1";
  container.dataset.sbGrokShape = spec.shape;
  container.dataset.sbGrokColor = spec.color;
  const palette = GROK_AVATAR_COLORS[spec.color];
  container.style.overflow = "visible";
  container.style.background = "transparent";
  container.style.setProperty("--fg", `light-dark(${palette.light}, ${palette.dark})`);
  container.style.setProperty("--bg", "#FFFFFF");
  container.setAttribute("aria-label", alt || "数字员工头像");
  container.replaceChildren(parts.svg);
  const profileId = value && typeof value === "object"
    ? value.id ?? value.type ?? value.name ?? "agent"
    : value;
  const controller = new GrokAvatarController(container, parts, normalizedState, spec, String(profileId || "agent"), trackPointer, mode);
  controllerByContainer.set(container, controller);
  controllers.add(controller);
  schedule();
  return true;
}
