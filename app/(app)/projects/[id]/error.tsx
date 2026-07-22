"use client";

import { Button } from "@/components/ui/button";
import { MobileSidebarTrigger } from "@/components/projects/mobile-sidebar-trigger";

export default function Error({ reset }: { reset: () => void }) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-start gap-3 p-6">
      <MobileSidebarTrigger />
      <p className="text-sm text-muted-foreground">
        Couldn&apos;t load this project.
      </p>
      <Button variant="outline" size="sm" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
