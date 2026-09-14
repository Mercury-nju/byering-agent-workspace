const CACHE_PREFIX = "byering-office-assets-";
const CACHE_NAME = `${CACHE_PREFIX}v1`;
const OFFICE_ASSET_PATH = "/workbench/assets/";
const MANIFEST_PATH = `${OFFICE_ASSET_PATH}manifest.json`;

function isOfficeAsset(request) {
  const url = new URL(request.url);
  return url.origin === self.location.origin
    && url.pathname.startsWith(OFFICE_ASSET_PATH)
    && request.method === "GET";
}

function isManifest(request) {
  return new URL(request.url).pathname === MANIFEST_PATH;
}

async function refreshCache(request) {
  const response = await fetch(request, { cache: "no-store" });
  if (!response.ok) throw new Error(`Office asset request failed: ${response.status}`);
  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response.clone());
  return response;
}

async function networkFirst(request) {
  try {
    return await refreshCache(request);
  } catch {
    return (await caches.match(request)) || Response.error();
  }
}

async function cacheFirst(request, event) {
  const cached = await caches.match(request);
  const refresh = refreshCache(request).catch(() => null);
  event.waitUntil(refresh);
  return cached || (await refresh) || Response.error();
}

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (!isOfficeAsset(event.request)) return;
  event.respondWith(isManifest(event.request)
    ? networkFirst(event.request)
    : cacheFirst(event.request, event));
});
