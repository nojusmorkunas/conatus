"use client";

import { useState } from "react";
import Link from "next/link";
import { MoreHorizontal } from "lucide-react";

import { useSnapshot, useWrites } from "@/lib/offline/hooks";
import type { LabelEntity } from "@/lib/offline/types";
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

type Label = Pick<LabelEntity, "id" | "name" | "color" | "isFavorite">;

export function LabelRow({
  label,
  className,
  menuAlwaysVisible = false,
}: {
  label: Label;
  className?: string;
  menuAlwaysVisible?: boolean;
}) {
  const [renaming, setRenaming] = useState(false);
  const [recoloring, setRecoloring] = useState(false);
  const [name, setName] = useState(label.name);

  const { lists } = useWrites();
  // The row may come from a list that is a sync behind the local copy.
  const entity = useSnapshot((snapshot) => snapshot.labels.get(label.id));

  function change(write: (entity: LabelEntity) => void) {
    if (entity) write(entity);
  }

  function submitRename(event: React.FormEvent) {
    event.preventDefault();
    setRenaming(false);
    if (name.trim()) change((current) => lists.editLabel(current, name, current.color));
  }

  function remove() {
    if (!confirm(`Delete label "${label.name}"?`)) return;
    change((current) => lists.deleteLabel(current));
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
            change((current) => lists.editLabel(current, current.name, color));
          }}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group flex h-9 shrink-0 items-center gap-2 rounded-lg border border-transparent py-1 pr-1.5 pl-2 text-sm transition-all hover:bg-background/65 focus-within:bg-background/65",
        className,
      )}
    >
      <Link
        href={`/labels/${label.id}`}
        className="flex !min-h-0 min-w-0 flex-1 self-stretch items-center gap-2 truncate"
      >
        <span className="flex size-7 shrink-0 items-center justify-center">
          <ProjectColorDot color={label.color} />
        </span>
        <span className="truncate">{label.name}</span>
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
            onClick={() => change((current) => lists.favoriteLabel(current, !label.isFavorite))}
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
