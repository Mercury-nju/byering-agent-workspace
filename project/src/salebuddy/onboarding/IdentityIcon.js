const ICON_MARKUP = Object.freeze({
  "shopping-bag": '<path d="M5 8h14l1 12H4L5 8Z"/><path d="M8 9V6a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  video: '<path d="M4 6h9.5A2.5 2.5 0 0 1 16 8.5v7a2.5 2.5 0 0 1-2.5 2.5H4a2.5 2.5 0 0 1-2.5-2.5v-7A2.5 2.5 0 0 1 4 6Z"/><path d="m16 10 6-3.5v11L16 14"/>',
  book: '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v16H6.5A2.5 2.5 0 0 0 4 20.5v-16Z"/><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20v4H6.5A2.5 2.5 0 0 1 4 20.5Z" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  group: '<circle cx="12" cy="8" r="3.2"/><circle cx="5.8" cy="10" r="2.4"/><circle cx="18.2" cy="10" r="2.4"/><path d="M6 21v-2.1a5.8 5.8 0 0 1 11.6 0V21H6Z"/><path d="M1.8 20v-1.4a4 4 0 0 1 4-4h.6M22.2 20v-1.4a4 4 0 0 0-4-4h-.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  briefcase: '<path d="M4 7h16a2 2 0 0 1 2 2v10H2V9a2 2 0 0 1 2-2Z"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M2 12h20" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10 12v2h4v-2" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  building: '<path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16H4Z"/><path d="M16 9h3a2 2 0 0 1 2 2v10h-5"/><path d="M8 7h4M8 11h4M8 15h4" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/><path d="M9 21v-3h2v3" fill="none" stroke="#fff" stroke-width="1.6"/>',
  megaphone: '<path d="m3 11 13-5v12L3 13v-2Z"/><path d="M16 9.5 21 7v10l-5-2.5"/><path d="M6 14v4a2 2 0 0 0 2 2h1l1-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  apps: '<circle cx="7" cy="7" r="3.2"/><circle cx="17" cy="7" r="3.2"/><circle cx="7" cy="17" r="3.2"/><circle cx="17" cy="17" r="3.2"/>',
  car: '<path d="m5 11 1.6-4.1A2 2 0 0 1 8.5 5h7a2 2 0 0 1 1.9 1.4L19 11"/><path d="M3 11h18v6H3z"/><path d="M6 17v2M18 17v2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="7" cy="14" r="1.5" fill="#fff"/><circle cx="17" cy="14" r="1.5" fill="#fff"/>',
  home: '<path d="m3 11 9-8 9 8v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-9Z"/><path d="M9 21v-6h6v6" fill="none" stroke="#fff" stroke-width="1.7"/><path d="M7 11h10" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/>',
  "heart-pulse": '<path d="M20.8 8.7c0 5.2-8.8 10.3-8.8 10.3S3.2 13.9 3.2 8.7A4.7 4.7 0 0 1 12 6.1a4.7 4.7 0 0 1 8.8 2.6Z"/><path d="M6.8 10.7h2l1.1-2.5 2.1 5 1.5-3.1h2.3" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
  "graduation-cap": '<path d="m2 9 10-5 10 5-10 5L2 9Z"/><path d="M6 11.2V16c2.3 2 9.7 2 12 0v-4.8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M22 9v6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>'
});

export function createIdentityIcon({ documentRef = globalThis.document, name } = {}) {
  const svg = documentRef.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.innerHTML = ICON_MARKUP[name] || ICON_MARKUP.apps;
  return svg;
}
