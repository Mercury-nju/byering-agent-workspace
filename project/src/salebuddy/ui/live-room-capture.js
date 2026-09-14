const MIN_REGION_SIZE = 0.04;
const MIN_CONFIDENCE = 0.55;

function finite(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function intersectionOverUnion(left, right) {
  if (!left || !right) return 0;
  const leftEdge = Math.max(left.x, right.x);
  const topEdge = Math.max(left.y, right.y);
  const rightEdge = Math.min(left.x + left.width, right.x + right.width);
  const bottomEdge = Math.min(left.y + left.height, right.y + right.height);
  const intersection = Math.max(0, rightEdge - leftEdge) * Math.max(0, bottomEdge - topEdge);
  const leftArea = left.width * left.height;
  const rightArea = right.width * right.height;
  return intersection / Math.max(0.000001, leftArea + rightArea - intersection);
}

function normalizeCaptureRegion(region, canvasWidth = 1, canvasHeight = 1) {
  if (!region || typeof region !== "object") return null;
  const rawX = finite(region.x ?? region.left);
  const rawY = finite(region.y ?? region.top);
  const rawWidth = finite(region.width ?? region.w ?? (finite(region.right) !== null && rawX !== null ? finite(region.right) - rawX : null));
  const rawHeight = finite(region.height ?? region.h ?? (finite(region.bottom) !== null && rawY !== null ? finite(region.bottom) - rawY : null));
  if ([rawX, rawY, rawWidth, rawHeight].some((value) => value === null)) return null;

  const pixelCoordinates = region.coordinateSpace === "pixels"
    || rawX > 1 || rawY > 1 || rawWidth > 1 || rawHeight > 1;
  const x = pixelCoordinates ? rawX / Math.max(1, canvasWidth) : rawX;
  const y = pixelCoordinates ? rawY / Math.max(1, canvasHeight) : rawY;
  const width = pixelCoordinates ? rawWidth / Math.max(1, canvasWidth) : rawWidth;
  const height = pixelCoordinates ? rawHeight / Math.max(1, canvasHeight) : rawHeight;
  const left = clamp(x);
  const top = clamp(y);
  const right = clamp(x + width);
  const bottom = clamp(y + height);
  if (right - left < MIN_REGION_SIZE || bottom - top < MIN_REGION_SIZE) return null;
  return {
    x: Number(left.toFixed(6)),
    y: Number(top.toFixed(6)),
    width: Number((right - left).toFixed(6)),
    height: Number((bottom - top).toFixed(6))
  };
}

export function cropRectForCanvas(canvasWidth, canvasHeight, region) {
  const width = Math.max(1, Math.round(Number(canvasWidth) || 1));
  const height = Math.max(1, Math.round(Number(canvasHeight) || 1));
  const normalized = normalizeCaptureRegion(region, width, height) || { x: 0, y: 0, width: 1, height: 1 };
  const x = Math.max(0, Math.min(width - 1, Math.round(normalized.x * width)));
  const y = Math.max(0, Math.min(height - 1, Math.round(normalized.y * height)));
  const right = Math.max(x + 1, Math.min(width, Math.round((normalized.x + normalized.width) * width)));
  const bottom = Math.max(y + 1, Math.min(height, Math.round((normalized.y + normalized.height) * height)));
  return { x, y, width: right - x, height: bottom - y };
}

function colorDistance(left, right) {
  const dr = left[0] - right[0];
  const dg = left[1] - right[1];
  const db = left[2] - right[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function gridForImage(frame, maxColumns = 96, maxRows = 64) {
  const width = Math.max(1, Math.floor(Number(frame?.width) || 0));
  const height = Math.max(1, Math.floor(Number(frame?.height) || 0));
  const data = frame?.data;
  if (!width || !height || !data || data.length < width * height * 4) return null;
  const columns = Math.min(maxColumns, width);
  const rows = Math.min(maxRows, height);
  const cells = [];
  for (let gy = 0; gy < rows; gy += 1) {
    const y0 = Math.floor(gy * height / rows);
    const y1 = Math.max(y0 + 1, Math.floor((gy + 1) * height / rows));
    for (let gx = 0; gx < columns; gx += 1) {
      const x0 = Math.floor(gx * width / columns);
      const x1 = Math.max(x0 + 1, Math.floor((gx + 1) * width / columns));
      let r = 0; let g = 0; let b = 0; let count = 0;
      let variance = 0;
      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          const index = (y * width + x) * 4;
          r += data[index]; g += data[index + 1]; b += data[index + 2]; count += 1;
        }
      }
      const average = [r / count, g / count, b / count];
      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          const index = (y * width + x) * 4;
          variance += colorDistance([data[index], data[index + 1], data[index + 2]], average) ** 2;
        }
      }
      cells.push({ x: gx, y: gy, average, variance: Math.sqrt(variance / count) });
    }
  }
  return { width, height, columns, rows, cells };
}

function borderAverage(grid) {
  const border = grid.cells.filter((cell) => cell.x === 0 || cell.y === 0 || cell.x === grid.columns - 1 || cell.y === grid.rows - 1);
  const total = border.reduce((sum, cell) => [sum[0] + cell.average[0], sum[1] + cell.average[1], sum[2] + cell.average[2]], [0, 0, 0]);
  return total.map((value) => value / Math.max(1, border.length));
}

function cellAt(grid, x, y) {
  if (x < 0 || y < 0 || x >= grid.columns || y >= grid.rows) return null;
  return grid.cells[y * grid.columns + x] || null;
}

function cellActivity(grid, cell, background) {
  const neighbors = [
    cellAt(grid, cell.x - 1, cell.y), cellAt(grid, cell.x + 1, cell.y),
    cellAt(grid, cell.x, cell.y - 1), cellAt(grid, cell.x, cell.y + 1)
  ].filter(Boolean);
  const neighborDistance = neighbors.length
    ? Math.max(...neighbors.map((neighbor) => colorDistance(cell.average, neighbor.average)))
    : 0;
  const backgroundDistance = colorDistance(cell.average, background);
  return Math.min(1, cell.variance / 90 + neighborDistance / 180 + backgroundDistance / 360);
}

function connectedComponents(grid, active) {
  const seen = new Set();
  const components = [];
  for (const cell of grid.cells) {
    const key = `${cell.x}:${cell.y}`;
    if (!active.has(key) || seen.has(key)) continue;
    const queue = [cell];
    const component = [];
    seen.add(key);
    while (queue.length) {
      const current = queue.pop();
      component.push(current);
      for (let y = current.y - 1; y <= current.y + 1; y += 1) {
        for (let x = current.x - 1; x <= current.x + 1; x += 1) {
          const neighbor = cellAt(grid, x, y);
          const neighborKey = `${x}:${y}`;
          if (neighbor && active.has(neighborKey) && !seen.has(neighborKey)) {
            seen.add(neighborKey);
            queue.push(neighbor);
          }
        }
      }
    }
    components.push(component);
  }
  return components;
}

export function detectLiveRoomRegion(frame, { minConfidence = MIN_CONFIDENCE } = {}) {
  const grid = gridForImage(frame);
  if (!grid) return null;
  const background = borderAverage(grid);
  const activityByCell = new Map(grid.cells.map((cell) => [`${cell.x}:${cell.y}`, cellActivity(grid, cell, background)]));
  const active = new Set([...activityByCell.entries()]
    .filter(([, activity]) => activity >= 0.16)
    .map(([key]) => key));
  if (!active.size) return null;

  const components = connectedComponents(grid, active);
  const candidates = components.map((component) => {
    const minX = Math.min(...component.map((cell) => cell.x));
    const maxX = Math.max(...component.map((cell) => cell.x));
    const minY = Math.min(...component.map((cell) => cell.y));
    const maxY = Math.max(...component.map((cell) => cell.y));
    const width = (maxX - minX + 1) / grid.columns;
    const height = (maxY - minY + 1) / grid.rows;
    const area = width * height;
    const density = component.length / ((maxX - minX + 1) * (maxY - minY + 1));
    const ratio = width / Math.max(height, 0.001);
    const portraitScore = ratio >= 0.18 && ratio <= 0.82 ? 1 : ratio <= 1.15 ? 0.55 : 0;
    const verticalScore = height >= 0.45 ? Math.min(1, height / 0.8) : 0;
    const sizeScore = area >= 0.06 && area <= 0.72 ? Math.min(1, area / 0.16) : 0;
    const activityScore = component.reduce((sum, cell) => sum + (activityByCell.get(`${cell.x}:${cell.y}`) || 0), 0) / component.length;
    const score = density * 0.25 + portraitScore * 0.28 + verticalScore * 0.22 + sizeScore * 0.1 + Math.min(1, activityScore) * 0.15;
    return {
      region: { x: minX / grid.columns, y: minY / grid.rows, width, height },
      confidence: Math.max(0, Math.min(1, score)),
      area,
      density,
      ratio
    };
  }).sort((left, right) => right.confidence - left.confidence || right.area - left.area);
  const best = candidates[0];
  if (!best || best.confidence < minConfidence || best.region.height < 0.35 || best.region.width > 0.82) return null;
  return { region: best.region, confidence: best.confidence, method: "visual" };
}

export function resolveLiveRoomCaptureRegion(frameOrConfig = {}, options = {}) {
  const frame = frameOrConfig && typeof frameOrConfig === "object" ? frameOrConfig : {};
  const width = Number(frame.width || options.width || 0);
  const height = Number(frame.height || options.height || 0);
  const hint = options.regionHint || frame.regionHint || frame.captureRegion || options.captureRegion;
  const providerRegion = normalizeCaptureRegion(hint, width || 1, height || 1);
  if (providerRegion) return { source: "provider", region: providerRegion, confidence: 1, method: "provider" };
  const detected = detectLiveRoomRegion(frame, options);
  if (detected) return { source: "visual", ...detected };
  return { source: "full-screen", region: null, confidence: 0, method: "fallback" };
}

export function resolveStableLiveRoomCaptureRegion(frameOrConfig = {}, options = {}) {
  const { previousRegion = null, previousConfidence = 0, ...resolverOptions } = options;
  const resolved = resolveLiveRoomCaptureRegion(frameOrConfig, resolverOptions);
  const previous = normalizeCaptureRegion(previousRegion, Number(frameOrConfig?.width) || 1, Number(frameOrConfig?.height) || 1);
  if (resolved.region && resolved.source === "visual" && previous) {
    const previousScore = Number(previousConfidence) || 0;
    const overlap = intersectionOverUnion(previous, resolved.region);
    if (overlap < 0.35 && resolved.confidence < previousScore + 0.12) {
      return {
        source: "sticky",
        region: previous,
        confidence: Math.max(MIN_CONFIDENCE, previousScore),
        method: "last-known"
      };
    }
  }
  if (resolved.region) return resolved;
  if (!previous) return resolved;
  return {
    source: "sticky",
    region: previous,
    confidence: Math.max(MIN_CONFIDENCE, Number(previousConfidence) || 0),
    method: "last-known"
  };
}

export { normalizeCaptureRegion };
