import { and, eq, gte, inArray } from "drizzle-orm";

import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { activityEvents, users } from "@/lib/db/schema";
import { dateInTimezone, formatDate, todayInTimezone } from "@/lib/dates";
import {
  activityGraphSourceLabel,
  activityGraphSourceUnit,
  eventsForSource,
  type ActivityGraphSource,
} from "@/lib/activity-sources";
import { activityGraphStart, computeActivityGraph, computeStats } from "@/lib/stats";
import { ActivityGraph } from "@/components/stats/activity-graph";
import { MobilePageHeader } from "@/components/projects/mobile-sidebar-trigger";

export default async function StatsPage() {
  const user = await requireUser();
  if (!user) return null;

  const [settings] = await db
    .select({
      timezone: users.timezone,
      dateFormat: users.dateFormat,
      weekStart: users.weekStart,
      dailyGoal: users.dailyGoal,
      activityGraphSource: users.activityGraphSource,
    })
    .from(users)
    .where(eq(users.id, user.id));

  const today = todayInTimezone(settings.timezone);
  const source = settings.activityGraphSource as ActivityGraphSource;

  // One pass over the window covers both the graph and the streaks below it.
  // The graph reaches further back than 365 days whenever its first column
  // opens before the anniversary, and a day of slack absorbs the offset
  // between the UTC timestamps stored here and the user's local dates.
  const since = new Date(`${activityGraphStart(today, settings.weekStart)}T00:00:00Z`);
  since.setUTCDate(since.getUTCDate() - 1);
  const events = await db
    .select({ type: activityEvents.type, createdAt: activityEvents.createdAt })
    .from(activityEvents)
    .where(
      and(
        eq(activityEvents.userId, user.id),
        inArray(activityEvents.type, eventsForSource(source)),
        gte(activityEvents.createdAt, since),
      ),
    );

  const stats = computeStats(
    events
      .filter((event) => event.type === "task.completed")
      .map((event) => dateInTimezone(event.createdAt, settings.timezone)),
    { today, dailyGoal: settings.dailyGoal },
  );
  const graph = computeActivityGraph(
    events.map((event) => dateInTimezone(event.createdAt, settings.timezone)),
    { today, weekStart: settings.weekStart },
  );
  const progress = Math.min((stats.todayCount / settings.dailyGoal) * 100, 100);
  const maxCount = Math.max(...stats.last7.map((day) => day.count), 1);

  return (
    <div className="mx-auto w-full max-w-3xl p-6">
      <MobilePageHeader className="mb-6">
        <h1 className="text-xl font-semibold">Stats</h1>
      </MobilePageHeader>

      <div className="space-y-4">
        <section className="rounded-lg border border-border p-4">
          <h2 className="text-sm font-medium">Today</h2>
          <p className="mt-2 text-2xl font-semibold">
            {stats.todayCount} <span className="text-base font-normal text-muted-foreground">/ {settings.dailyGoal} completed</span>
          </p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
          </div>
        </section>

        <section className="rounded-lg border border-border p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 className="text-sm font-medium">Past year</h2>
            <p className="text-xs text-muted-foreground">
              {graph.total} in the past year &middot; counting {activityGraphSourceLabel(source).toLowerCase()}
            </p>
          </div>
          <div className="mt-4">
            <ActivityGraph
              weeks={graph.weeks}
              months={graph.months}
              total={graph.total}
              weekStart={settings.weekStart}
              dailyGoal={settings.dailyGoal}
              dateFormat={settings.dateFormat}
              unit={activityGraphSourceUnit(source)}
            />
          </div>
          {graph.busiestDay ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Busiest day: {formatDate(graph.busiestDay.date, settings.dateFormat)} with {graph.busiestDay.count}.
            </p>
          ) : null}
        </section>

        <section className="rounded-lg border border-border p-4">
          <h2 className="text-sm font-medium">Last 7 days</h2>
          <div className="mt-4 flex h-40 items-end justify-between gap-2">
            {stats.last7.map((day) => {
              const isToday = day.date === today;
              const weekday = new Date(`${day.date}T00:00:00Z`)
                .toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })
                .slice(0, 1);
              return (
                <div key={day.date} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                  <span className="text-xs text-muted-foreground">{day.count}</span>
                  <div className="flex h-28 w-full items-end rounded-sm bg-muted">
                    <div
                      className={isToday ? "w-full rounded-sm bg-primary" : "w-full rounded-sm bg-foreground/60"}
                      style={{ height: `${(day.count / maxCount) * 100}%` }}
                    />
                  </div>
                  <span className={isToday ? "text-xs font-medium" : "text-xs text-muted-foreground"}>{weekday}</span>
                </div>
              );
            })}
          </div>
        </section>

        <div className="grid gap-4 sm:grid-cols-2">
          <section className="rounded-lg border border-border p-4">
            <h2 className="text-sm font-medium">Current streak</h2>
            <p className="mt-2 text-2xl font-semibold">{stats.currentStreak} days</p>
            <p className="mt-1 text-xs text-muted-foreground">Days meeting your daily goal.</p>
          </section>
          <section className="rounded-lg border border-border p-4">
            <h2 className="text-sm font-medium">Longest streak</h2>
            <p className="mt-2 text-2xl font-semibold">{stats.longestStreak} days</p>
            <p className="mt-1 text-xs text-muted-foreground">Days meeting your daily goal.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
