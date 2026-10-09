/* Display shells and static assets only. Never cache APIs, admin pages or credentials. */
const CACHE = "display-shell-v1";
const isDisplay = pathname => /^\/display\/[1-6]$/.test(pathname);
self.addEventListener("install", () => { self.skipWaiting(); });
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith("display-shell-") && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener("message", event => {
  if (event.data?.type !== "CACHE_DISPLAY" || !isDisplay(event.data.path)) return;
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const assets = Array.isArray(event.data.assets) ? event.data.assets.slice(0, 100).filter(value => {
      try { const url = new URL(value); return url.origin === self.location.origin && url.pathname.startsWith("/_next/static/"); } catch { return false; }
    }) : [];
    await Promise.all([event.data.path, ...assets].map(async url => {
      try { const response = await fetch(url, { headers: { Accept: "text/html, */*" } }); if (response.ok && !response.redirected) await cache.put(url, response); } catch { /* Offline priming can be retried on the next visit. */ }
    }));
  })());
});
self.addEventListener("fetch", event => {
  const request = event.request; const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || request.headers.get("RSC") || url.searchParams.has("_rsc")) return;
  const navigation = request.mode === "navigate" && isDisplay(url.pathname);
  const asset = url.pathname.startsWith("/_next/static/");
  if (!navigation && !asset) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (asset) { const cached = await cache.match(request); if (cached) return cached; }
    try {
      const response = await fetch(request);
      if (response.ok && !response.redirected) {
        await cache.put(request, response.clone());
        const keys = await cache.keys();
        if (keys.length > 160) await cache.delete(keys[0]);
      }
      return response;
    } catch {
      const cached = await cache.match(request);
      if (cached) return cached;
      return new Response("The display needs a connection to finish loading. Reconnect and refresh this page.", { status: 503, headers: { "Content-Type": "text/plain" } });
    }
  })());
});
