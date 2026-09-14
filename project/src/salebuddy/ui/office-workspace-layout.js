/** Return a local CSS height, including native canvas-container scaling. */
export function officeWorkspaceHeight({ top, width, layoutWidth, viewportHeight, viewportTop = 0, clipBottom = Infinity, gap = 16 }) {
  if (![top, width, viewportHeight].every(Number.isFinite) || width <= 0 || viewportHeight <= 0) return null;
  const scale = layoutWidth > 0 ? width / layoutWidth : 1;
  const bottom = Math.min(viewportTop + viewportHeight, clipBottom);
  return Math.max(0, Math.floor((bottom - Math.max(top, viewportTop) - gap) / scale));
}
