"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Filter as FilterIcon, MoreHorizontal } from "lucide-react";

import type { filters as filtersTable } from "@/lib/db/schema";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Filter = typeof filtersTable.$inferSelect;

export function FilterRow({
  filter,
  onChanged,
}: {
  filter: Filter;
  onChanged: () => void;
}) {
  const pathname = usePathname();
  const active = pathname === `/filters/${filter.id}`;
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(filter.name);

  async function patch(body: Record<string, unknown>) {
    await fetch(`/api/filters/${filter.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    onChanged();
  }

  async function submitRename(event: React.FormEvent) {
    event.preventDefault();
    setRenaming(false);
    if (name.trim() && name !== filter.name) await patch({ name: name.trim() });
  }

  async function remove() {
    if (!confirm(`Delete filter "${filter.name}"?`)) return;
    await fetch(`/api/filters/${filter.id}`, { method: "DELETE" });
    onChanged();
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

  return (
    <div
      className={cn(
        "group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted focus-within:bg-muted",
        active && "bg-muted font-medium",
      )}
    >
      <Link
        href={`/filters/${filter.id}`}
        className="flex !min-h-0 flex-1 items-center gap-2 truncate"
      >
        <FilterIcon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">{filter.name}</span>
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              className="!min-h-0 opacity-0 hover:bg-background group-hover:opacity-100 group-focus-within:opacity-100 dark:hover:bg-background"
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
