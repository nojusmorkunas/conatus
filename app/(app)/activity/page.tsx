import { desc, eq } from "drizzle-orm";

import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { activityEvents, users } from "@/lib/db/schema";
import { todayInTimezone } from "@/lib/dates";
import { ActivityList } from "@/components/activity/activity-list";

const LIMIT = 200;

export default async function ActivityPage() {
  const user = await requireUser();
  if (!user) return null;

  const [settings] = await db
    .select({ timezone: users.timezone, dateFormat: users.dateFormat })
    .from(users)
    .where(eq(users.id, user.id));

  const events = await db
    .select()
    .from(activityEvents)
    .where(eq(activityEvents.userId, user.id))
    .orderBy(desc(activityEvents.createdAt))
    .limit(LIMIT);

  return (
    <div className="mx-auto w-full max-w-2xl p-6">
      <h1 className="mb-6 text-xl font-semibold">Activity</h1>
      <ActivityList
        events={events}
        today={todayInTimezone(settings.timezone)}
        timezone={settings.timezone}
        dateFormat={settings.dateFormat}
      />
      {events.length === LIMIT && (
        <p className="mt-6 text-xs text-muted-foreground">
          Showing most recent {LIMIT}.
        </p>
      )}
    </div>
  );
}
