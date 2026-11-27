"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    // Dev rebuilds chunks on every edit; a caching worker would serve stale code.
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    // Plain-HTTP LAN installs refuse service workers; the app works without one.
    navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch(() => {});
  }, []);

  return null;
}
