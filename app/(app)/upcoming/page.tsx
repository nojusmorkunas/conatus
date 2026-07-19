import { and, eq, gte, inArray } from "drizzle-orm";

import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { accessibleProjectIds } from "@/lib/db/access";
import { labels, tasks, users } from "@/lib/db/schema";
import { withCommentCounts, withLabels } from "@/lib/db/task-labels";
import { dueLabel, formatDate, todayInTimezone } from "@/lib/dates";
import { TaskDateList } from "@/components/tasks/task-date-list";
import type { TaskDateGroup } from "@/components/tasks/task-date-list";
import { EmptyState } from "@/components/ui/empty-state";
import { CalendarDays } from "lucide-react";

export default async function UpcomingPage() {
  const user = await requireUser();
  if (!user) return null;

  const [settings] = await db
    .select({ timezone: users.timezone, dateFormat: users.dateFormat })
    .from(users)
    .where(eq(users.id, user.id));
  const today = todayInTimezone(settings.timezone);

  const dueTasks = await withCommentCounts(
    await withLabels(
      await db
        .select()
        .from(tasks)
        .where(
          and(
            inArray(tasks.projectId, await accessibleProjectIds(user.id)),
            eq(tasks.isCompleted, false),
            gte(tasks.dueDate, today),
          ),
        )
        .orderBy(tasks.dueDate, tasks.order),
      user.id,
    ),
  );

  const userLabels = await db
    .select()
    .from(labels)
    .where(eq(labels.userId, user.id))
    .orderBy(labels.order);

  const groups: TaskDateGroup[] = [];
  for (const task of dueTasks) {
    const label = dueLabel(task.dueDate!, today, settings.dateFormat);
    const heading =
      label === formatDate(task.dueDate!, settings.dateFormat)
        ? label
        : `${label} · ${formatDate(task.dueDate!, settings.dateFormat)}`;
    const group = groups.at(-1);
    if (group?.heading === heading) group.tasks.push(task);
    else groups.push({ heading, tasks: [task] });
  }

  return (
    <div className="mx-auto w-full max-w-4xl p-6">
      <h1 className="mb-6 text-xl font-semibold">Upcoming</h1>
      <TaskDateList
        initialGroups={groups}
        labels={userLabels}
        currentUserId={user.id}
        today={today}
        dateFormat={settings.dateFormat}
        emptyState={<EmptyState icon={CalendarDays} title="Nothing coming up" description="Add dates to tasks to plan what is next." />}
      />
    </div>
  );
}
