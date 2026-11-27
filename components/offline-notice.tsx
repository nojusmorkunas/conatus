"use client";

import { useSyncExternalStore } from "react";
import { CloudOff } from "lucide-react";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

// The server snapshot is online, so the server renders nothing and hydration can't mismatch.
export function OfflineNotice() {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  if (online) return null;
  return (
    <div role="status" className="mx-auto flex w-full max-w-4xl items-center gap-1.5 px-3 pt-3 text-xs text-muted-foreground sm:px-6">
      <CloudOff className="size-3.5 shrink-0" aria-hidden="true" />
      You are currently offline.
    </div>
  );
}
