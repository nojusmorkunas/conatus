"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { MobileSidebarTrigger } from "@/components/projects/mobile-sidebar-trigger";
import { reportClientError } from "@/lib/client-error-reporter";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportClientError({
      message: error.message,
      stack: error.stack,
      digest: error.digest,
      path: window.location.pathname,
    });
  }, [error]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-16">
      <MobileSidebarTrigger />
      <p className="text-sm text-muted-foreground">Something went wrong.</p>
      <Button variant="outline" size="sm" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
