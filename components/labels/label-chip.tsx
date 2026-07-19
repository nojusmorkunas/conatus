import type { labels } from "@/lib/db/schema";
import { Tag } from "lucide-react";

import {
  ProjectColorDot,
  projectColorTextClass,
} from "@/components/projects/project-color-dot";
import { cn } from "@/lib/utils";
import { projectColors } from "@/lib/validation";

type Label = typeof labels.$inferSelect;

export function LabelChip({
  label,
  subtle = false,
}: {
  label: Label;
  subtle?: boolean;
}) {
  if (subtle) {
    const color = label.color as (typeof projectColors)[number];

    return (
      <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
        <Tag
          aria-hidden
          className={cn("size-3.5", projectColorTextClass[color] ?? projectColorTextClass.gray)}
        />
        {label.name}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
      <ProjectColorDot color={label.color} />
      {label.name}
    </span>
  );
}
