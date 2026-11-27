import { dueLabel, humanizeDuration } from "@/lib/dates";

import { jsonObjectOf, withFields } from "./merge";
import type { Conflict, LabelEntity, TaskEntity } from "./types";

const FIELD_NAMES: Record<string, string> = {
  content: "Name",
  description: "Description",
  priority: "Priority",
  dueDate: "Date",
  dueTime: "Time",
  deadlineDate: "Deadline",
  durationMinutes: "Duration",
  recurrence: "Repeats",
  recurrenceEndDate: "Repeat end",
  labelIds: "Labels",
  completed: "Done",
  projectId: "Project",
  sectionId: "Section",
};

export type ConflictLine = { field: string; mine: string; theirs: string };

type Context = { labels: ReadonlyMap<string, LabelEntity>; today: string; dateFormat: string; repeats: (rule: string) => string };

/** A field of [task] in words, the way task details show it. */
export function fieldText(task: TaskEntity, name: string, { labels, today, dateFormat, repeats }: Context): string {
  const date = (value: string | null, none: string) => (value ? dueLabel(value, today, dateFormat) : none);
  switch (name) {
    case "content":
      return task.content;
    case "description":
      return task.description || "No description";
    case "priority":
      return `Priority ${task.priority}`;
    case "dueDate":
      return date(task.dueDate, "No date");
    case "dueTime":
      return task.dueTime ?? "No time";
    case "deadlineDate":
      return date(task.deadlineDate, "No deadline");
    case "durationMinutes":
      return task.durationMinutes ? humanizeDuration(task.durationMinutes) : "No duration";
    case "recurrence":
      return task.recurrence ? repeats(task.recurrence) : "Doesn't repeat";
    case "recurrenceEndDate":
      return date(task.recurrenceEndDate, "No end date");
    case "labelIds":
      return task.labelIds.map((id) => labels.get(id)?.name).filter(Boolean).join(", ") || "No labels";
    case "completed":
      return task.isCompleted ? "Completed" : "Open";
    default:
      return "";
  }
}

/** The fields both sides changed, with this device's value and the other's. A deleted task has none. */
export function conflictLines(task: TaskEntity, conflict: Conflict, context: Context): ConflictLine[] {
  if (conflict.deleted) return [];
  const theirs = jsonObjectOf(conflict.theirs);
  const other = withFields(task, theirs);
  return Object.keys(theirs)
    .filter((name) => name in FIELD_NAMES)
    .map((name) => ({ field: FIELD_NAMES[name], mine: fieldText(task, name, context), theirs: fieldText(other, name, context) }));
}
