import { and, desc, eq, inArray } from "drizzle-orm";

import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { accessibleProjectIds } from "@/lib/db/access";
import { activityEvents, projects, tasks, users } from "@/lib/db/schema";
import { pastDateLabel, todayInTimezone } from "@/lib/dates";
import { ActivityList } from "@/components/activity/activity-list";
import { CompletedTaskList } from "@/components/tasks/completed-task-list";

const LIMIT = 200;

export default async function ReportingPage() {
  const user = await requireUser();
  if (!user) return null;

  const [settings] = await db
    .select({ timezone: users.timezone, dateFormat: users.dateFormat })
    .from(users)
    .where(eq(users.id, user.id));
  const today = todayInTimezone(settings.timezone);
  const projectIds = await accessibleProjectIds(user.id);
  const [completed, events] = await Promise.all([
    db
      .select({
        id: tasks.id,
        content: tasks.content,
        priority: tasks.priority,
        completedAt: tasks.completedAt,
        projectName: projects.name,
      })
      .from(tasks)
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .where(and(inArray(tasks.projectId, projectIds), eq(tasks.isCompleted, true)))
      .orderBy(desc(tasks.completedAt))
      .limit(LIMIT),
    db
      .select()
      .from(activityEvents)
      .where(eq(activityEvents.userId, user.id))
      .orderBy(desc(activityEvents.createdAt))
      .limit(LIMIT),
  ]);

  const groups: { heading: string; tasks: typeof completed }[] = [];
  for (const task of completed) {
    const dateKey = task.completedAt
      ? new Intl.DateTimeFormat("en-CA", { timeZone: settings.timezone }).format(task.completedAt)
      : today;
    const heading = pastDateLabel(dateKey, today, settings.dateFormat);
    const group = groups.at(-1);
    if (group?.heading === heading) group.tasks.push(task);
    else groups.push({ heading, tasks: [task] });
  }

  return (
    <div className="mx-auto w-full max-w-4xl p-6">
      <h1 className="mb-8 text-xl font-semibold">Reporting</h1>
      <div className="space-y-10">
        <section>
          <h2 className="mb-4 text-base font-semibold">Completed</h2>
          <CompletedTaskList initialGroups={groups} timezone={settings.timezone} />
        </section>
        <section>
          <h2 className="mb-4 text-base font-semibold">Activity</h2>
          <ActivityList
            events={events}
            today={today}
            timezone={settings.timezone}
            dateFormat={settings.dateFormat}
          />
        </section>
      </div>
    </div>
  );
}
