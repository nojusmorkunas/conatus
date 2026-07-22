"use client";

import { useState, type FormEvent } from "react";
import { Plus, Tag } from "lucide-react";

import type { labels as labelsTable } from "@/lib/db/schema";
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

type Label = typeof labelsTable.$inferSelect;

export function LabelPicker({
  labels,
  selectedIds,
  onChange,
}: {
  labels: Label[];
  selectedIds: string[];
  onChange: (labelIds: string[]) => void;
}) {
  const [createdLabels, setCreatedLabels] = useState<Label[]>([]);
  const [open, setOpen] = useState(false);
  const [newLabelName, setNewLabelName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableLabels = [...labels, ...createdLabels.filter((created) => !labels.some((label) => label.id === created.id))];

  function toggle(labelId: string, checked: boolean) {
    onChange(
      checked
        ? [...selectedIds, labelId]
        : selectedIds.filter((id) => id !== labelId),
    );
  }

  async function createLabel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newLabelName.trim();
    if (!name) return;

    setCreating(true);
    setError(null);
    try {
      const response = await fetch("/api/labels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, color: "gray" }),
      });
      if (!response.ok) {
        setError("Could not create label. Try a different name.");
        return;
      }

      const label = (await response.json()) as Label;
      setCreatedLabels((current) => [...current, label]);
      onChange([...new Set([...selectedIds, label.id])]);
      setNewLabelName("");
      setOpen(false);
    } finally {
      setCreating(false);
    }
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
        {availableLabels.length === 0 && (
          <p className="px-1.5 py-1 text-xs text-muted-foreground">
            No labels yet.
          </p>
        )}
        {availableLabels.map((label) => (
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
            disabled={creating}
          />
          <Button type="submit" size="icon-xs" aria-label="Create label" disabled={creating || !newLabelName.trim()}>
            <Plus className="size-3.5" />
          </Button>
        </form>
        {error && <p className="px-2 pb-1 text-xs text-destructive">{error}</p>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
