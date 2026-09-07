import { addDays, monthGridStart, weekStartOf } from "@/lib/dates";
import { nextOccurrence, parseRecurrence } from "@/lib/recurrence";

type ScheduledTask = {
  id: string;
  dueDate: string | null;
  recurrence: string | null;
  recurrenceEndDate: string | null;
};

export type CalendarOccurrence<T> = T & { occurrenceId: string; isProjection: boolean };

// Keep the stored task intact: future occurrences are previews of the same task.
export function calendarOccurrences<T extends ScheduledTask>(
  tasks: T[], start: string, end: string,
): CalendarOccurrence<T>[] {
  return tasks.flatMap((task) => {
    if (!task.dueDate || task.dueDate > end) return [];
    const result: CalendarOccurrence<T>[] = [];
    const append = (date: string) => result.push({
      ...task, dueDate: date, occurrenceId: `${task.id}:${date}`,
      isProjection: date !== task.dueDate,
    });
    if (task.dueDate >= start) append(task.dueDate);
    const parsed = task.recurrence && parseRecurrence(task.recurrence);
    if (!parsed) return result;
    // Completion-relative previews assume completion on the scheduled day.
    const rule = parsed.replace(/^every!/, "every");
    const last = task.recurrenceEndDate && task.recurrenceEndDate < end
      ? task.recurrenceEndDate : end;
    let floor = task.dueDate >= start ? task.dueDate : addDays(start, -1);
    while (floor < last) {
      // Always calculate from the original anchor to avoid Jan 31 → Feb 28 → Mar 28 drift.
      const next = nextOccurrence(rule, task.dueDate, floor);
      if (next <= floor || next > last) break;
      append(next);
      floor = next;
    }
    return result;
  });
}

function validDate(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function calendarPeriod(
  params: { month?: string; week?: string; view?: string }, today: string, weekStart: number,
) {
  const view = params.view === "week" ? "week" : "month";
  const anchor = view === "week"
    ? validDate(params.week) ? params.week : today
    : validDate(`${params.month}-01`) ? `${params.month}-01` : today;
  const month = anchor.slice(0, 7);
  const week = weekStartOf(anchor, weekStart);
  const rangeStart = view === "week" ? week : monthGridStart(month, weekStart);
  return { view, month, week, rangeStart, rangeEnd: addDays(rangeStart, view === "week" ? 6 : 41) } as const;
}
