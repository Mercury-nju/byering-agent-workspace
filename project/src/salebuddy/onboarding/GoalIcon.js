const ICON_MARKUP = Object.freeze({
  "users-search": '<circle cx="9" cy="9" r="3.2"/><circle cx="15.5" cy="8" r="2.3"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="m15 14 5 5M18.8 17.8 21 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  target: '<circle cx="11" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="11" cy="12" r="3"/><path d="m15.8 7.2 4.5-1.7-1.7 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M20.3 5.5 15 10.8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  mail: '<path d="M3 6h18v13H3z"/><path d="m3 7 9 7 9-7" fill="none" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/>',
  messages: '<path d="M3 5h13a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8l-5 3v-3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"/><path d="M19 9h2a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-1v2l-3-2h-4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>',
  "user-refresh": '<circle cx="10" cy="8" r="3.2"/><path d="M4 20a6 6 0 0 1 12 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M18 8v4h4M22 12a6 6 0 0 0-5-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  lightbulb: '<path d="M8 15.5h8M9 19h6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M7 10a5 5 0 1 1 10 0c0 2-1 3-2.5 4.5h-5C8 13 7 12 7 10Z"/><path d="M12 2v1M4.5 4.5l.8.8M19.5 4.5l-.8.8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>'
});

export function createGoalIcon({ documentRef = globalThis.document, name } = {}) {
  const svg = documentRef.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.innerHTML = ICON_MARKUP[name] || ICON_MARKUP.lightbulb;
  return svg;
}
