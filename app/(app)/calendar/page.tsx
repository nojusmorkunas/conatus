import { and, between, eq, inArray } from "drizzle-orm";

import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { accessibleProjectIds } from "@/lib/db/access";
import { tasks, users } from "@/lib/db/schema";
import { addDays, monthGridStart, todayInTimezone, weekStartOf } from "@/lib/dates";
import { CalendarView } from "@/components/calendar/calendar-view";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; week?: string; view?: string }>;
}) {
  const user = await requireUser();
  if (!user) return null;

  const params = await searchParams;
  const view = params.view === "week" ? "week" : "month";

  const [settings] = await db
    .select({ timezone: users.timezone, dateFormat: users.dateFormat, weekStart: users.weekStart })
    .from(users)
    .where(eq(users.id, user.id));
  const today = todayInTimezone(settings.timezone);

  const month = params.month && /^\d{4}-\d{2}$/.test(params.month) ? params.month : today.slice(0, 7);
  const week =
    params.week && /^\d{4}-\d{2}-\d{2}$/.test(params.week)
      ? weekStartOf(params.week, settings.weekStart)
      : weekStartOf(today, settings.weekStart);

  // Visible range only: month grid can show up to 6 weeks (42 days) to
  // cover leading/trailing days from adjacent months.
  const rangeStart = view === "week" ? week : monthGridStart(month, settings.weekStart);
  const rangeEnd = view === "week" ? addDays(week, 6) : addDays(rangeStart, 41);

  const visibleTasks = await db
    .select()
    .from(tasks)
    .where(
      and(
        inArray(tasks.projectId, await accessibleProjectIds(user.id)),
        eq(tasks.isCompleted, false),
        between(tasks.dueDate, rangeStart, rangeEnd),
      ),
    )
    .orderBy(tasks.dueDate, tasks.dueTime, tasks.order);

  return (
    <div className="flex h-full w-full flex-col px-3 py-2 sm:p-6">
      <h1 className="mb-4 text-xl font-semibold">Calendar</h1>
      <CalendarView
        view={view}
        month={month}
        week={week}
        tasks={visibleTasks}
        today={today}
        dateFormat={settings.dateFormat}
        weekStart={settings.weekStart}
      />
    </div>
  );
}
