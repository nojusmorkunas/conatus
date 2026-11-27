"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Plus, Tag } from "lucide-react";

import { useSnapshot, useWrites } from "@/lib/offline/hooks";
import { byOrder } from "@/lib/offline/support";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ProjectColorDot } from "@/components/projects/project-color-dot";

export function LabelPicker({
  selectedIds,
  onChange,
}: {
  selectedIds: string[];
  onChange: (labelIds: string[]) => void;
}) {
  const labelRows = useSnapshot((snapshot) => snapshot.labels);
  const labels = useMemo(() => [...labelRows.values()].sort(byOrder), [labelRows]);
  const writes = useWrites();
  const [open, setOpen] = useState(false);
  const [newLabelName, setNewLabelName] = useState("");

  function toggle(labelId: string, checked: boolean) {
    onChange(
      checked
        ? [...selectedIds, labelId]
        : selectedIds.filter((id) => id !== labelId),
    );
  }

  function createLabel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newLabelName.trim();
    if (!name) return;
    const label = writes.lists.createLabel(name, "gray");
    onChange([...new Set([...selectedIds, label.id])]);
    setNewLabelName("");
    setOpen(false);
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon-xs" aria-label="Labels">
            <Tag className="size-3.5" />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-60">
        {labels.length === 0 && (
          <p className="px-1.5 py-1 text-xs text-muted-foreground">
            No labels yet.
          </p>
        )}
        {labels.map((label) => (
          <DropdownMenuCheckboxItem
            key={label.id}
            checked={selectedIds.includes(label.id)}
            onCheckedChange={(checked) => toggle(label.id, checked)}
          >
            <ProjectColorDot color={label.color} />
            {label.name}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <form
          className="flex gap-1 p-1"
          onSubmit={createLabel}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <Input
            value={newLabelName}
            onChange={(event) => setNewLabelName(event.target.value)}
            placeholder="New label"
            aria-label="New label name"
            maxLength={120}
          />
          <Button type="submit" size="icon-xs" aria-label="Create label" disabled={!newLabelName.trim()}>
            <Plus className="size-3.5" />
          </Button>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
