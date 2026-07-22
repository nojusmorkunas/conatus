"use client";

import { Menu } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function MobileSidebarTrigger() {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className="shrink-0 md:hidden"
      aria-label="Open sidebar"
      onClick={() => window.dispatchEvent(new Event("sidebar:open"))}
    >
      <Menu />
    </Button>
  );
}

export function MobilePageHeader({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <MobileSidebarTrigger />
      {children}
    </div>
  );
}
