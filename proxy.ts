import { randomUUID } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/auth";

const publicPages = new Set([
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
]);

// Nonce-based CSP: 'self' covers same-origin fetches, attachment/avatar
// downloads and static assets, all of which this app serves itself (see
// app/api/attachments/[id]/route.ts and app/api/account/avatar/route.ts;
// neither proxies or embeds a third-party URL). style-src keeps
// 'unsafe-inline' because Tailwind/Base UI (the Select popup's
// scrollbar-hiding style tag) inject inline <style> elements that aren't
// worth nonce-plumbing; 'self' 'nonce-*' is reserved for scripts, where it
// matters and Next.js applies it automatically to its own inline
// hydration/RSC bootstrap scripts once it sees the nonce on the request's
// CSP header.
//
// 'unsafe-eval' is added in development only: React calls eval() there to
// reconstruct component stacks for debugging, and without it every page logs a
// console error (which e2e/projects.spec.ts rightly fails on). Production never
// evaluates strings, so the shipped policy stays strict.
//
// Known gap: /_global-error is the one route Next still prerenders (it renders
// its own <html>, so app/layout.tsx's force-dynamic cannot reach it), and its
// build-time HTML carries no nonce. It is served only when a server render
// throws outright; the message and styling still appear, but that page does not
// hydrate, so its "Try again" button and its client error report are inert.
// Accepted over weakening script-src for every other route.
const devOnlyScriptSources =
  process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'";

function buildCsp(nonce: string) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'${devOnlyScriptSources}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self'",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

// Stamp whatever response this request ends up with (rendered page, redirect or
// JSON error) with the CSP, and with HSTS when the request can be shown to have
// arrived over HTTPS. Self-hosters routinely put this behind a plain-HTTP reverse
// proxy on a LAN, so sending HSTS unconditionally would be a footgun the moment
// they need plain HTTP on that hostname.
function withSecurityHeaders(
  request: NextRequest,
  response: NextResponse,
  csp: string,
) {
  response.headers.set("Content-Security-Policy", csp);

  if (request.headers.get("x-forwarded-proto") === "https") {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains",
    );
  }

  return response;
}

export default auth((request) => {
  const nonce = Buffer.from(randomUUID()).toString("base64");
  const csp = buildCsp(nonce);

  // Forward the nonce and CSP on the *request* headers too: Next.js reads the
  // nonce back out of the CSP header while rendering so it can stamp its own
  // inline hydration/RSC bootstrap scripts with it.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const next = () =>
    withSecurityHeaders(
      request,
      NextResponse.next({ request: { headers: requestHeaders } }),
      csp,
    );

  if (request.auth) return next();

  const { pathname } = request.nextUrl;
  if (publicPages.has(pathname)) return next();
  if (pathname === "/api/v1/openapi.json") return next();

  if (pathname.startsWith("/api/")) {
    if (request.headers.get("authorization")?.startsWith("Bearer ")) return next();
    return withSecurityHeaders(
      request,
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      csp,
    );
  }

  return withSecurityHeaders(
    request,
    NextResponse.redirect(new URL("/login", request.nextUrl)),
    csp,
  );
});

export const config = {
  matcher: [
    "/((?!api/auth|api/register|api/health|api/ical|api/monitoring|_next/static|_next/image|favicon.ico).*)",
  ],
};
