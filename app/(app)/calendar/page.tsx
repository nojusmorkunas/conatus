import { and, between, eq, inArray, isNull, isNotNull, lte, or } from "drizzle-orm";

import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { accessibleProjectIds } from "@/lib/db/access";
import { tasks, users } from "@/lib/db/schema";
import { todayInTimezone } from "@/lib/dates";
import { calendarPeriod } from "@/lib/calendar";
import { CalendarView } from "@/components/calendar/calendar-view";
import { MobilePageHeader } from "@/components/projects/mobile-sidebar-trigger";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; week?: string; view?: string }>;
}) {
  const user = await requireUser();
  if (!user) return null;

  const params = await searchParams;

  const [settings] = await db
    .select({ timezone: users.timezone, dateFormat: users.dateFormat, weekStart: users.weekStart })
    .from(users)
    .where(eq(users.id, user.id));
  const today = todayInTimezone(settings.timezone);

  const { view, month, week, rangeStart, rangeEnd } = calendarPeriod(params, today, settings.weekStart);

  const visibleTasks = await db
    .select()
    .from(tasks)
    .where(
      and(
        inArray(tasks.projectId, await accessibleProjectIds(user.id)),
        eq(tasks.isCompleted, false),
        isNull(tasks.deletedAt),
        or(
          between(tasks.dueDate, rangeStart, rangeEnd),
          and(isNotNull(tasks.recurrence), lte(tasks.dueDate, rangeEnd)),
        ),
      ),
    )
    .orderBy(tasks.dueDate, tasks.dueTime, tasks.order);

  return (
    <div className="flex h-full w-full flex-col px-3 py-2 sm:p-6">
      <MobilePageHeader className="mb-4">
        <h1 className="text-xl font-semibold">Calendar</h1>
      </MobilePageHeader>
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
