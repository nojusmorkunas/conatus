"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { completedForSection } from "@/lib/completed-tasks";
import { dateInTimezone, pastDateLabel } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { TaskCheckbox } from "./task-checkbox";
import type { TaskWithLabels } from "./types";

// The footer shows this many at a time; "Show more" adds as many again.
const PAGE = 20;

export function CompletedTasks({
  sectionId,
  stateTasks,
  today,
  dateFormat,
  timezone,
  onRestore,
  onOpen,
  indented = false,
}: {
  sectionId: string | null;
  stateTasks: TaskWithLabels[];
  today: string;
  dateFormat: string;
  timezone: string;
  onRestore: (task: TaskWithLabels) => void | Promise<void>;
  onOpen?: (task: TaskWithLabels) => void;
  // Line the rows up with the list's task rows, which reserve a drag-handle gutter.
  indented?: boolean;
}) {
  const [shown, setShown] = useState(PAGE);
  const rows = completedForSection(sectionId, stateTasks, []);
  if (rows.length === 0) return null;

  return (
    <div className={cn("flex flex-col gap-1", indented && "pl-[var(--task-card-inset)]")}>
      {rows.slice(0, shown).map((task) => {
        const contentClassName =
          "min-w-0 flex-1 truncate text-left text-base text-muted-foreground line-through sm:text-sm";
        const completionLabel = task.completedAt
          ? pastDateLabel(
              dateInTimezone(new Date(task.completedAt), timezone),
              today,
              dateFormat,
            )
          : null;

        return (
          <div
            key={task.id}
            className={cn(
              "group flex flex-wrap items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted sm:flex-nowrap",
              indented && "pl-[calc(var(--task-indent-base)-var(--task-card-inset))]",
            )}
          >
            <TaskCheckbox
              checked
              priority={task.priority}
              onToggle={() => onRestore(task)}
            />

            {onOpen ? (
              <button
                type="button"
                className={contentClassName}
                onClick={() => onOpen(task)}
              >
                {task.content}
              </button>
            ) : (
              <span className={contentClassName}>{task.content}</span>
            )}

            {completionLabel && (
              <span className="shrink-0 text-xs text-muted-foreground">
                {completionLabel}
              </span>
            )}
          </div>
        );
      })}

      {rows.length > shown && (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className={cn("self-start text-muted-foreground", indented && "ml-2")}
          onClick={() => setShown((count) => count + PAGE)}
        >
          Show more
        </Button>
      )}
    </div>
  );
}
