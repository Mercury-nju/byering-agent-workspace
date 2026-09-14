/**
 * Local preview mode helpers.
 * Keep preview routing explicit so a visual mock never talks to production
 * task services by accident.
 */
export function isStyleMockPreview(search = globalThis.location?.search, { hostname = globalThis.location?.hostname } = {}) {
  const params = new URLSearchParams(String(search || ""));
  if (params.get("preview") !== "style") return false;
  const normalizedHost = String(hostname || "").trim().toLowerCase();
  return !normalizedHost || ["localhost", "127.0.0.1", "::1"].includes(normalizedHost);
}

export function previewMockGatewayUrl(search = globalThis.location?.search, { defaultPort = 5152 } = {}) {
  const params = new URLSearchParams(String(search || ""));
  const explicit = String(params.get("mockGateway") || "").trim();
  return explicit || `ws://127.0.0.1:${Number(defaultPort) || 5152}/agent`;
}
