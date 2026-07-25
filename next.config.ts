import type { NextConfig } from "next";

// Headers that don't depend on the request (no nonce, no HSTS toggle) live
// here. The per-request CSP and conditional HSTS are set in proxy.ts instead,
// since they need a fresh nonce and the request's forwarded scheme.
const staticSecurityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    // Nothing in this app touches these device APIs; deny them outright.
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: staticSecurityHeaders,
      },
    ];
  },
};

export default nextConfig;
