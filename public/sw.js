const PAGES = "conatus-pages";
// shortcut: hashed /_next/static files are never pruned, so this cache grows a little with each deploy; prune by age if it gets large.
const STATIC = "conatus-static";
const DATA_CACHE = "conatus-data";
const DATA = new Set(["/api/projects", "/api/sections"]);

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

async function networkFirst(event, request, cacheName, fallback) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok && response.type === "basic") event.waitUntil(cache.put(request.url, response.clone()));
    return response;
  } catch {
    return fallback(cache);
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      networkFirst(event, request, PAGES, async (cache) => {
        const cached = await cache.match(request, { ignoreVary: true });
        if (cached) return cached;
        const last = (await cache.keys()).at(-1);
        if (last && last.url !== request.url) return Response.redirect(last.url, 302);
        return new Response("You're offline and this page hasn't been opened on this device yet.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }),
    );
    return;
  }

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC);
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) event.waitUntil(cache.put(request, response.clone()));
        return response;
      })(),
    );
    return;
  }

  if (DATA.has(url.pathname) && url.search === "") {
    event.respondWith(
      networkFirst(event, request, DATA_CACHE, async (cache) => {
        const cached = await cache.match(request, { ignoreVary: true });
        return cached ?? Response.error();
      }),
    );
  }
});
