import { and, eq, gte } from "drizzle-orm";

import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { activityEvents, users } from "@/lib/db/schema";
import { dateInTimezone, todayInTimezone } from "@/lib/dates";
import { computeStats } from "@/lib/stats";
import { MobilePageHeader } from "@/components/projects/mobile-sidebar-trigger";

export default async function StatsPage() {
  const user = await requireUser();
  if (!user) return null;

  const [settings] = await db
    .select({ timezone: users.timezone, dailyGoal: users.dailyGoal })
    .from(users)
    .where(eq(users.id, user.id));

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 365);
  const events = await db
    .select({ createdAt: activityEvents.createdAt })
    .from(activityEvents)
    .where(
      and(
        eq(activityEvents.userId, user.id),
        eq(activityEvents.type, "task.completed"),
        gte(activityEvents.createdAt, since),
      ),
    );

  const today = todayInTimezone(settings.timezone);
  const stats = computeStats(
    events.map((event) => dateInTimezone(event.createdAt, settings.timezone)),
    { today, dailyGoal: settings.dailyGoal },
  );
  const progress = Math.min((stats.todayCount / settings.dailyGoal) * 100, 100);
  const maxCount = Math.max(...stats.last7.map((day) => day.count), 1);

  return (
    <div className="mx-auto w-full max-w-2xl p-6">
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
