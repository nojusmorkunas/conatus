"use client";

import { useState } from "react";
import Link from "next/link";
import { MoreHorizontal } from "lucide-react";

import type { labels as labelsTable } from "@/lib/db/schema";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProjectColorDot } from "@/components/projects/project-color-dot";
import { ProjectColorPicker } from "@/components/projects/project-color-picker";

type Label = typeof labelsTable.$inferSelect;

export function LabelRow({
  label,
  onChanged,
}: {
  label: Label;
  onChanged: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [recoloring, setRecoloring] = useState(false);
  const [name, setName] = useState(label.name);

  async function patch(body: Record<string, unknown>) {
    await fetch(`/api/labels/${label.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    onChanged();
  }

  async function submitRename(event: React.FormEvent) {
    event.preventDefault();
    setRenaming(false);
    if (name.trim() && name !== label.name) await patch({ name: name.trim() });
  }

  async function remove() {
    if (!confirm(`Delete label "${label.name}"?`)) return;
    await fetch(`/api/labels/${label.id}`, { method: "DELETE" });
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

  if (recoloring) {
    return (
      <div className="px-1 py-1">
        <ProjectColorPicker
          value={label.color}
          onChange={(color) => {
            setRecoloring(false);
            patch({ color });
          }}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted focus-within:bg-muted",
      )}
    >
      <Link
        href={`/labels/${label.id}`}
        className="flex min-w-0 flex-1 items-center gap-2 truncate"
      >
        <ProjectColorDot color={label.color} />
        <span className="truncate">{label.name}</span>
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              className="!min-h-0 opacity-100 hover:bg-background md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 dark:hover:bg-background"
              aria-label={`More options for ${label.name}`}
            >
              <MoreHorizontal />
            </Button>
          }
        />
        <DropdownMenuContent>
          <DropdownMenuItem onClick={() => setRenaming(true)}>
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setRecoloring(true)}>
            Change color
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => patch({ isFavorite: !label.isFavorite })}
          >
            {label.isFavorite ? "Unpin it!" : "Pin it!"}
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={remove}>
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
