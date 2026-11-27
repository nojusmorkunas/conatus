// Fills the service worker's caches with the app's top-level screens, so a screen never opened on this
// device still opens offline. The worker serves a cached page of the same kind at any URL of that kind, and the Inbox
// page is the one for every project.

const PAGES = "conatus-pages";
const STATIC = "conatus-static";
// A filter or label page doesn't read its id on the server, so any id gets the page that serves them all.
const SCREENS = ["/today", "/upcoming", "/calendar", "/completed", "/trash", "/search", "/filters-labels", "/filters/shell", "/labels/shell"];
// Script and style files the page names, in its tags and in the data it hydrates from.
const ASSETS = /(?:\/_next\/)?static\/[^"'\\\s<>?]+?\.(?:js|css)(?=["'\\\s<>?]|$)/g;

/**
 * Caches each screen that isn't cached yet, with the files it needs to run. Those files are never pruned,
 * so a page warmed by an older build keeps working after a deploy, and the next visit to it replaces it.
 * Nothing is fetched once everything is cached, so calling this often is cheap.
 */
export async function warmPages(inboxProjectId: string | null) {
  if (typeof caches === "undefined" || !navigator.onLine) return;
  try {
    const pages = await caches.open(PAGES);
    const assets = await caches.open(STATIC);
    for (const path of inboxProjectId ? [...SCREENS, `/projects/${inboxProjectId}`] : SCREENS) {
      if (await pages.match(path)) continue;
      const response = await fetch(path);
      if (!response.ok || response.redirected) continue;
      const html = await response.clone().text();
      for (const found of new Set(html.match(ASSETS))) {
        const url = found.startsWith("/_next/") ? found : `/_next/${found}`;
        if (!(await assets.match(url))) await assets.add(url);
      }
      // Last, so a cached page always has its files.
      await pages.put(path, response);
    }
  } catch {
    // Offline or out of space; the next sync tries again.
  }
}
