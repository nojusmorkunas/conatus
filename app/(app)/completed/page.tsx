import { and, desc, eq, inArray } from "drizzle-orm";

import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { accessibleProjectIds } from "@/lib/db/access";
import { projects, tasks, users } from "@/lib/db/schema";
import { pastDateLabel, todayInTimezone } from "@/lib/dates";
import { CompletedTaskList } from "@/components/tasks/completed-task-list";

const LIMIT = 200;

export default async function CompletedPage() {
  const user = await requireUser();
  if (!user) return null;

  const [settings] = await db
    .select({ timezone: users.timezone, dateFormat: users.dateFormat })
    .from(users)
    .where(eq(users.id, user.id));
  const today = todayInTimezone(settings.timezone);

  const completed = await db
    .select({
      id: tasks.id,
      content: tasks.content,
      priority: tasks.priority,
      completedAt: tasks.completedAt,
      projectName: projects.name,
    })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .where(
      and(
        inArray(tasks.projectId, await accessibleProjectIds(user.id)),
        eq(tasks.isCompleted, true),
      ),
    )
    .orderBy(desc(tasks.completedAt))
    .limit(LIMIT);

  const groups: { heading: string; tasks: typeof completed }[] = [];
  for (const task of completed) {
    const dateKey = task.completedAt
      ? new Intl.DateTimeFormat("en-CA", { timeZone: settings.timezone }).format(
          task.completedAt,
        )
      : today;
    const heading = pastDateLabel(dateKey, today, settings.dateFormat);
    const group = groups.at(-1);
    if (group?.heading === heading) group.tasks.push(task);
    else groups.push({ heading, tasks: [task] });
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-3 py-6 sm:p-6">
      <h1 className="mb-6 text-xl font-semibold">Completed</h1>
      <CompletedTaskList
        initialGroups={groups}
        timezone={settings.timezone}
      />
      {completed.length === LIMIT && (
        <p className="mt-6 text-xs text-muted-foreground">
          Showing most recent {LIMIT}.
        </p>
      )}
    </div>
  );
}
