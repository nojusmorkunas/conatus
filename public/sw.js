const PAGES = "conatus-pages";
// shortcut: hashed /_next/static files are never pruned, so this cache grows a little with each deploy; prune by age if it gets large.
const STATIC = "conatus-static";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// Pages whose screens read their id from the address, so one cached copy stands in for all of its siblings.
const SHELL_PATHS = [/^\/projects\/[^/]+$/, /^\/filters\/[^/]+$/, /^\/labels\/[^/]+$/];

// The cached page to show for [url] when it was never opened here: a sibling of the same kind for those
// paths, the same path with another query for the top-level screens.
async function shellFor(cache, url) {
  const keys = (await cache.keys()).map((key) => new URL(key.url));
  const pattern = SHELL_PATHS.find((candidate) => candidate.test(url.pathname));
  const sibling = keys.findLast((key) => (pattern ? pattern.test(key.pathname) : key.pathname === url.pathname));
  return sibling && cache.match(sibling.href, { ignoreVary: true });
}

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
        const shell = await shellFor(cache, url);
        if (shell) return shell;
        // Anything else is sent to Today's page, which opens on its own, before the last page seen.
        const today = await cache.match("/today", { ignoreVary: true });
        const last = (await cache.keys()).at(-1);
        if (today && url.pathname !== "/today") return Response.redirect("/today", 302);
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
});
