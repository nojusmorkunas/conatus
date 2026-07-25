"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Plus, Search } from "lucide-react";

import { cn } from "@/lib/utils";

export function SidebarGroupHeader({
  expanded,
  onClick,
  onAdd,
  children,
}: {
  expanded: boolean;
  onClick: () => void;
  onAdd?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="group/header mb-1 flex h-8 w-full items-center rounded-lg px-1.5 text-xs font-semibold text-muted-foreground hover:bg-sidebar-accent/50 focus-within:bg-sidebar-accent/50">
      <button
        type="button"
        className="h-full min-w-0 flex-1 text-left"
        onClick={onClick}
      >
        {children}
      </button>
      {onAdd && (
        <button
          type="button"
          className="flex size-6 items-center justify-center rounded-md opacity-100 transition-opacity hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:opacity-0 md:group-hover/header:opacity-100 md:group-focus-within/header:opacity-100 dark:hover:bg-background"
          aria-label="Add project"
          onClick={onAdd}
        >
          <Plus className="size-3.5" />
        </button>
      )}
      <button
        type="button"
        className="flex size-6 items-center justify-center rounded-md opacity-100 transition-opacity hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:opacity-0 md:group-hover/header:opacity-100 md:group-focus-within/header:opacity-100 dark:hover:bg-background"
        aria-label={expanded ? `Collapse ${String(children)}` : `Expand ${String(children)}`}
        onClick={onClick}
      >
        {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
      </button>
    </div>
  );
}

export function SidebarSearch() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");

  useEffect(() => {
    function focus() {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
    window.addEventListener("search:focus", focus);
    return () => window.removeEventListener("search:focus", focus);
  }, []);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const query = value.trim();
        router.push(query ? `/search?q=${encodeURIComponent(query)}` : "/search");
      }}
      className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-xl border border-sidebar-border bg-sidebar-accent/40 px-2.5 text-sm transition-colors focus-within:bg-sidebar-accent focus-within:ring-1 focus-within:ring-ring"
    >
      <Search className="size-4 shrink-0 text-muted-foreground" />
      <input
        ref={inputRef}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Search"
        aria-label="Search tasks, projects and comments"
        className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground md:text-sm"
      />
      <kbd className="shrink-0 rounded border border-sidebar-border bg-background/60 px-1.5 text-[10px] font-medium text-muted-foreground">/</kbd>
    </form>
  );
}

export function ViewLink({
  href,
  icon,
  count,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  count?: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <Link
      href={href}
      data-sidebar-navigate
      className={cn(
        "flex h-8 items-center gap-2 rounded-lg px-2.5 text-sm transition-colors hover:bg-background/70 [&_svg]:text-muted-foreground",
        pathname === href &&
          "bg-background font-semibold shadow-sm ring-1 ring-sidebar-border [&_svg]:text-foreground",
      )}
    >
      {icon}
      <span className="flex-1">{children}</span>
      {count !== undefined && count > 0 && <span className="text-xs text-muted-foreground">{count}</span>}
    </Link>
  );
}
