"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { reportClientError } from "@/lib/client-error-reporter";

export default function GlobalError({
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
    <html>
      <body>
        <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-16">
          <p className="text-sm text-muted-foreground">Something went wrong.</p>
          <Button variant="outline" size="sm" onClick={reset}>
            Try again
          </Button>
        </div>
      </body>
    </html>
  );
}
