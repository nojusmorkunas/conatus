"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Filter as FilterIcon, MoreHorizontal } from "lucide-react";

import { parseFilter } from "@/lib/filter";
import { useWrites } from "@/lib/offline/hooks";
import type { FilterEntity } from "@/lib/offline/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toastManager } from "@/components/ui/toast";

export function FilterRow({
  filter,
  className,
  menuAlwaysVisible = false,
}: {
  filter: FilterEntity;
  className?: string;
  menuAlwaysVisible?: boolean;
}) {
  const pathname = usePathname();
  const active = pathname === `/filters/${filter.id}`;
  const [renaming, setRenaming] = useState(false);
  const [editingQuery, setEditingQuery] = useState(false);
  const [name, setName] = useState(filter.name);
  const [query, setQuery] = useState(filter.query);

  const { lists } = useWrites();
  function submitRename(event: React.FormEvent) {
    event.preventDefault();
    setRenaming(false);
    if (name.trim()) lists.editFilter(filter, name, filter.query);
  }

  function submitQuery(event: React.FormEvent) {
    event.preventDefault();
    setEditingQuery(false);
    if (!query.trim()) return;
    // The server would reject a query that doesn't parse, long after the form is gone.
    const parsed = parseFilter(query.trim());
    if ("error" in parsed) toastManager.add({ title: parsed.error, type: "error" });
    else lists.editFilter(filter, filter.name, query);
  }

  function remove() {
    if (!confirm(`Delete filter "${filter.name}"?`)) return;
    lists.deleteFilter(filter);
  }

  if (renaming) {
    return (
      <form onSubmit={submitRename} className="px-2 py-1">
        <Input
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={submitRename}
          maxLength={120}
        />
      </form>
    );
  }

  if (editingQuery) {
    return (
      <form onSubmit={submitQuery} className="px-2 py-1">
        <Input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onBlur={submitQuery}
          aria-label={`Query for ${filter.name}`}
          className="font-mono"
          maxLength={500}
        />
      </form>
    );
  }

  return (
    <div
      className={cn(
        "group flex h-9 shrink-0 items-center gap-2 rounded-lg border border-transparent py-1 pr-1.5 pl-2 text-sm transition-all hover:bg-background/65 focus-within:bg-background/65",
        active && "bg-muted font-medium",
        className,
      )}
    >
      <Link
        href={`/filters/${filter.id}`}
        className="flex !min-h-0 flex-1 self-stretch items-center gap-2 truncate"
      >
        <span className="flex size-7 shrink-0 items-center justify-center">
          <FilterIcon className="size-3.5 text-muted-foreground" />
        </span>
        <span className="truncate">{filter.name}</span>
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              className={cn(
                "!min-h-0 opacity-100 hover:bg-background dark:hover:bg-background",
                !menuAlwaysVisible && "md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100",
              )}
              aria-label={`More options for ${filter.name}`}
            >
              <MoreHorizontal />
            </Button>
          }
        />
        <DropdownMenuContent>
          <DropdownMenuItem onClick={() => setRenaming(true)}>
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              setQuery(filter.query);
              setEditingQuery(true);
            }}
          >
            Edit query
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => lists.favoriteFilter(filter, !filter.isFavorite)}>
            {filter.isFavorite ? "Unpin it!" : "Pin it!"}
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={remove}>
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
