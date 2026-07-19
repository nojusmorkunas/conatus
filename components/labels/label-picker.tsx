"use client";

import { Tag } from "lucide-react";

import type { labels as labelsTable } from "@/lib/db/schema";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  function toggle(labelId: string, checked: boolean) {
    onChange(
      checked
        ? [...selectedIds, labelId]
        : selectedIds.filter((id) => id !== labelId),
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon-xs" aria-label="Labels">
            <Tag className="size-3.5" />
          </Button>
        }
      />
      <DropdownMenuContent align="end">
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
