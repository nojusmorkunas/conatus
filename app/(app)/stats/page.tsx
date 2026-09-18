import { and, eq, gte, inArray } from "drizzle-orm";

import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { activityEvents, users } from "@/lib/db/schema";
import { dateInTimezone, todayInTimezone } from "@/lib/dates";
import {
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
    { today },
  );
  const graph = computeActivityGraph(
    events.map((event) => dateInTimezone(event.createdAt, settings.timezone)),
    { today, weekStart: settings.weekStart },
  );
  return (
    <div className="mx-auto w-full max-w-3xl p-6">
      <MobilePageHeader className="mb-6">
        <h1 className="text-xl font-semibold">Stats</h1>
      </MobilePageHeader>

      <div className="space-y-4">
        <section className="rounded-lg border border-border p-4">
          <h2 className="text-sm font-medium">Past year</h2>
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
        </section>

        <div className="grid gap-4 sm:grid-cols-2">
          <section className="rounded-lg border border-border p-4">
            <h2 className="text-sm font-medium">Current streak</h2>
            <p className="mt-2 text-2xl font-semibold">{stats.currentStreak} {stats.currentStreak === 1 ? "day" : "days"}</p>
          </section>
          <section className="rounded-lg border border-border p-4">
            <h2 className="text-sm font-medium">Longest streak</h2>
            <p className="mt-2 text-2xl font-semibold">{stats.longestStreak} {stats.longestStreak === 1 ? "day" : "days"}</p>
          </section>
        </div>
      </div>
    </div>
  );
}
