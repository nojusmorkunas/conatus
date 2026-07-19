import { NextResponse } from "next/server";

import { auth } from "@/auth";

const publicPages = new Set([
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
]);

export default auth((request) => {
  if (request.auth) return;

  const { pathname } = request.nextUrl;
  if (publicPages.has(pathname)) return;
  if (pathname === "/api/v1/openapi.json") return;

  if (pathname.startsWith("/api/")) {
    if (request.headers.get("authorization")?.startsWith("Bearer ")) return;
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.redirect(new URL("/login", request.nextUrl));
});

export const config = {
  matcher: [
    "/((?!api/auth|api/register|api/health|api/ical|api/monitoring|_next/static|_next/image|favicon.ico).*)",
  ],
};
