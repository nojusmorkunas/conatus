import { and, eq, inArray, lte } from "drizzle-orm";

import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { accessibleProjectIds } from "@/lib/db/access";
import { labels, tasks, users } from "@/lib/db/schema";
import { withCommentCounts, withLabels } from "@/lib/db/task-labels";
import { todayInTimezone } from "@/lib/dates";
import { TaskDateList } from "@/components/tasks/task-date-list";
import { EmptyState } from "@/components/ui/empty-state";
import { MobilePageHeader } from "@/components/projects/mobile-sidebar-trigger";
import { CheckCircle2 } from "lucide-react";

export default async function TodayPage() {
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
            lte(tasks.dueDate, today),
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

  const groups = [
    {
      heading: "Overdue",
      tasks: dueTasks.filter((task) => task.dueDate! < today),
    },
    {
      heading: "Today",
      tasks: dueTasks.filter((task) => task.dueDate === today),
    },
  ];

  return (
    <div className="mx-auto w-full max-w-4xl px-3 py-6 sm:p-6">
      <MobilePageHeader className="mb-6">
        <h1 className="text-xl font-semibold">Today</h1>
      </MobilePageHeader>
      <TaskDateList
        initialGroups={groups}
        labels={userLabels}
        currentUserId={user.id}
        today={today}
        dateFormat={settings.dateFormat}
        emptyState={<EmptyState icon={CheckCircle2} title="You're all caught up" description="Nothing due today." />}
      />
    </div>
  );
}
