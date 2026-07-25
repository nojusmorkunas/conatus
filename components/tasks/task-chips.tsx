"use client";

import { CalendarDays, Flag, Repeat, Timer } from "lucide-react";

import { addDays, dueLabel, humanizeDuration, pastDateLabel } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { ProjectMember, TaskWithLabels } from "./types";

export function AssigneeChip({
  assigneeId,
  members,
  currentUserId,
}: {
  assigneeId: string | null;
  members: ProjectMember[];
  currentUserId: string;
}) {
  const assignee = members.find((member) => member.id === assigneeId);
  if (!assignee) return null;

  return (
    <span
      title={assignee.username}
      aria-label={`Assigned to ${assignee.username}`}
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground",
        assignee.id === currentUserId &&
          "bg-primary/10 text-primary ring-1 ring-primary/50",
      )}
    >
      {assignee.username.charAt(0).toUpperCase()}
    </span>
  );
}

export function DueChip({
  task,
  today,
  dateFormat,
}: {
  task: Pick<TaskWithLabels, "dueDate" | "dueTime" | "recurrence">;
  today: string;
  dateFormat: string;
}) {
  if (!task.dueDate) return null;
  const tomorrow = addDays(today, 1);

  return (
    <span
      className={cn(
        "flex shrink-0 items-center gap-1 text-xs",
        task.dueDate < today
          ? "text-red-500"
          : task.dueDate === today
            ? "text-green-600"
            : task.dueDate === tomorrow
              ? "text-orange-500"
              : "text-muted-foreground",
      )}
    >
      {task.recurrence && <Repeat aria-label={`Repeats ${task.recurrence}`} className="size-3.5" />}
      <CalendarDays className="size-3.5" />
      {dueLabel(task.dueDate, today, dateFormat)}
      {task.dueTime && ` ${task.dueTime}`}
      {task.recurrence && <span className="sr-only">, repeats {task.recurrence}</span>}
    </span>
  );
}

// Deadline = must-finish-by, distinct from the due chip above (when to work
// on it). Flag icon + red past / amber today keeps it visually separate.
export function DeadlineChip({
  task,
  today,
  dateFormat,
}: {
  task: Pick<TaskWithLabels, "deadlineDate">;
  today: string;
  dateFormat: string;
}) {
  if (!task.deadlineDate) return null;
  return (
    <span
      className={cn(
        "flex shrink-0 items-center gap-1 text-xs",
        task.deadlineDate < today
          ? "text-red-500"
          : task.deadlineDate === today
            ? "text-amber-500"
            : "text-muted-foreground",
      )}
    >
      <Flag className="size-3.5" />
      {task.deadlineDate < today
        ? pastDateLabel(task.deadlineDate, today, dateFormat)
        : dueLabel(task.deadlineDate, today, dateFormat)}
    </span>
  );
}

export function DurationChip({
  task,
}: {
  task: Pick<TaskWithLabels, "durationMinutes">;
}) {
  if (!task.durationMinutes) return null;
  return (
    <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
      <Timer className="size-3.5" />
      {humanizeDuration(task.durationMinutes)}
    </span>
  );
}
