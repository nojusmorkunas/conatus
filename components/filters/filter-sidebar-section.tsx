"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Filter as FilterIcon, MoreHorizontal } from "lucide-react";

import type { filters as filtersTable } from "@/lib/db/schema";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toastError } from "@/components/ui/toast";

type Filter = typeof filtersTable.$inferSelect;

export function FilterRow({
  filter,
  onChanged,
  className,
  menuAlwaysVisible = false,
}: {
  filter: Filter;
  onChanged: () => void;
  className?: string;
  menuAlwaysVisible?: boolean;
}) {
  const pathname = usePathname();
  const active = pathname === `/filters/${filter.id}`;
  const [renaming, setRenaming] = useState(false);
  const [editingQuery, setEditingQuery] = useState(false);
  const [name, setName] = useState(filter.name);
  const [query, setQuery] = useState(filter.query);

  async function patch(body: Record<string, unknown>) {
    try {
      await api.patch(`/api/filters/${filter.id}`, body);
    } catch (error) {
      toastError(error, "Couldn't update the filter.");
    } finally {
      onChanged();
    }
  }

  async function submitRename(event: React.FormEvent) {
    event.preventDefault();
    setRenaming(false);
    if (name.trim() && name !== filter.name) await patch({ name: name.trim() });
  }

  async function submitQuery(event: React.FormEvent) {
    event.preventDefault();
    setEditingQuery(false);
    if (query.trim() && query !== filter.query) await patch({ query: query.trim() });
  }

  async function remove() {
    if (!confirm(`Delete filter "${filter.name}"?`)) return;
    try {
      await api.delete(`/api/filters/${filter.id}`);
    } catch (error) {
      toastError(error, "Couldn't delete the filter.");
    } finally {
      onChanged();
    }
  }

  if (renaming) {
    return (
      <form onSubmit={submitRename} className="px-2 py-1">
        <Input
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={submitRename}
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
          <DropdownMenuItem onClick={() => patch({ isFavorite: !filter.isFavorite })}>
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
