import test from "node:test";
import assert from "node:assert/strict";
import {
  cropRectForCanvas,
  detectLiveRoomRegion,
  resolveLiveRoomCaptureRegion,
  resolveStableLiveRoomCaptureRegion
} from "../src/salebuddy/ui/live-room-capture.js";

function imageData(width, height, paint) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const value = paint(x, y);
      data[index] = value[0];
      data[index + 1] = value[1];
      data[index + 2] = value[2];
      data[index + 3] = 255;
    }
  }
  return { width, height, data };
}

test("provider region is preferred and normalized to the rendered canvas", () => {
  const result = resolveLiveRoomCaptureRegion({
    width: 1600,
    height: 900,
    regionHint: { x: 0.2, y: 0.1, width: 0.36, height: 0.8 }
  });

  assert.equal(result.source, "provider");
  assert.deepEqual(result.region, { x: 0.2, y: 0.1, width: 0.36, height: 0.8 });
  assert.deepEqual(cropRectForCanvas(1600, 900, result.region), {
    x: 320,
    y: 90,
    width: 576,
    height: 720
  });
});

test("visual locator finds a high-detail portrait live room inside a quiet desktop canvas", () => {
  const frame = imageData(160, 100, (x, y) => {
    const inLiveRoom = x >= 48 && x < 93 && y >= 12 && y < 92;
    if (!inLiveRoom) return [235, 238, 236];
    const stripe = (x * 13 + y * 7) % 5;
    return stripe < 2 ? [18, 42, 58] : [224, 92, 70];
  });

  const result = resolveLiveRoomCaptureRegion(frame);

  assert.equal(result.source, "visual");
  assert.ok(result.confidence >= 0.55);
  assert.ok(Math.abs(result.region.x - 0.3) <= 0.08);
  assert.ok(Math.abs(result.region.y - 0.12) <= 0.06);
  assert.ok(Math.abs(result.region.width - 0.28) <= 0.1);
  assert.ok(Math.abs(result.region.height - 0.8) <= 0.08);
});

test("locator refuses to crop when the canvas has no credible live room", () => {
  const frame = imageData(160, 100, () => [235, 238, 236]);
  const result = resolveLiveRoomCaptureRegion(frame);

  assert.equal(result.source, "full-screen");
  assert.equal(result.region, null);
});

test("detector exposes a stable normalized region for direct callers", () => {
  const frame = imageData(160, 100, (x, y) => {
    const inLiveRoom = x >= 48 && x < 93 && y >= 12 && y < 92;
    return inLiveRoom ? [(x + y) % 255, (x * 3) % 255, (y * 5) % 255] : [235, 238, 236];
  });
  const result = detectLiveRoomRegion(frame);
  assert.ok(result?.region);
  assert.ok(result.region.width > 0 && result.region.height > 0);
});

test("stable resolver keeps the last valid region during a transient detection miss", () => {
  const result = resolveStableLiveRoomCaptureRegion({ width: 1600, height: 900 }, {
    previousRegion: { x: 0.31, y: 0.08, width: 0.34, height: 0.84 },
    previousConfidence: 0.82
  });

  assert.equal(result.source, "sticky");
  assert.equal(result.method, "last-known");
  assert.equal(result.confidence, 0.82);
  assert.deepEqual(result.region, { x: 0.31, y: 0.08, width: 0.34, height: 0.84 });
});

test("stable resolver avoids switching to a low-confidence visual region that jumps away", () => {
  const frame = imageData(160, 100, (x, y) => {
    const inLiveRoom = x >= 105 && x < 148 && y >= 10 && y < 92;
    if (!inLiveRoom) return [235, 238, 236];
    const stripe = (x * 11 + y * 5) % 7;
    return stripe < 2 ? [30, 50, 90] : [190, 75, 60];
  });
  const result = resolveStableLiveRoomCaptureRegion(frame, {
    previousRegion: { x: 0.3, y: 0.1, width: 0.28, height: 0.8 },
    previousConfidence: 0.95
  });

  assert.equal(result.source, "sticky");
  assert.equal(result.method, "last-known");
  assert.deepEqual(result.region, { x: 0.3, y: 0.1, width: 0.28, height: 0.8 });
});
