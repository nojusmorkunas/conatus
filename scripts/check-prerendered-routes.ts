import { readFileSync } from "node:fs";

// proxy.ts mints a fresh Content-Security-Policy nonce per request, so any HTML
// Next prerenders at build time ships inline hydration scripts whose nonce can
// never match the one the browser is told to trust. Such a page renders and then
// stays inert, with no hydration, no event handlers and no error reporting, and
// nothing about it fails in `next dev`, where every route is rendered per
// request. This guard turns that silent production breakage into a build
// failure. app/layout.tsx forces dynamic rendering to keep the list empty.
const allowed = new Set([
  // Not HTML, so it carries no scripts and no nonce.
  "/favicon.ico",
  // Renders its own <html> and so escapes the root layout's force-dynamic.
  // Served only when a server render throws; documented in proxy.ts.
  "/_global-error",
]);

const manifestPath = ".next/prerender-manifest.json";

let manifest: { routes?: Record<string, unknown> };
try {
  manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
} catch {
  console.error(`Could not read ${manifestPath}. Run \`npm run build\` first.`);
  process.exit(1);
}

const unexpected = Object.keys(manifest.routes ?? {}).filter(
  (route) => !allowed.has(route),
);

if (unexpected.length > 0) {
  console.error(
    `Prerendered routes are incompatible with the per-request CSP nonce set in proxy.ts.\n` +
      `These routes are prerendered and would ship un-hydratable HTML:\n` +
      unexpected.map((route) => `  ${route}`).join("\n") +
      `\n\nForce them to render per request, or add a justified entry to the\n` +
      `allowlist in scripts/check-prerendered-routes.ts.`,
  );
  process.exit(1);
}

console.log("No unexpected prerendered routes.");
