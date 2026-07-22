import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { labels, projects, tasks, users } from "@/lib/db/schema";
import { todayInTimezone } from "@/lib/dates";
import { withCommentCounts, withLabels } from "@/lib/db/task-labels";
import { ProjectColorDot } from "@/components/projects/project-color-dot";
import { MobilePageHeader } from "@/components/projects/mobile-sidebar-trigger";
import { TaskDateList } from "@/components/tasks/task-date-list";

export default async function LabelPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  if (!user) return null;

  const { id } = await params;
  const [label] = await db
    .select()
    .from(labels)
    .where(and(eq(labels.id, id), eq(labels.userId, user.id)));
  if (!label) notFound();

  const [settings] = await db
    .select({ timezone: users.timezone, dateFormat: users.dateFormat })
    .from(users)
    .where(eq(users.id, user.id));
  const [userLabels, activeTasks] = await Promise.all([
    db.select().from(labels).where(eq(labels.userId, user.id)).orderBy(labels.order),
    withCommentCounts(
      await withLabels(
        await db
          .select({
            id: tasks.id,
            userId: tasks.userId,
            projectId: tasks.projectId,
            assigneeId: tasks.assigneeId,
            sectionId: tasks.sectionId,
            parentId: tasks.parentId,
            content: tasks.content,
            description: tasks.description,
            priority: tasks.priority,
            dueDate: tasks.dueDate,
            dueTime: tasks.dueTime,
            recurrence: tasks.recurrence,
            recurrenceEndDate: tasks.recurrenceEndDate,
            deadlineDate: tasks.deadlineDate,
            durationMinutes: tasks.durationMinutes,
            isCompleted: tasks.isCompleted,
            completedAt: tasks.completedAt,
            order: tasks.order,
            createdAt: tasks.createdAt,
            updatedAt: tasks.updatedAt,
            projectName: projects.name,
          })
          .from(tasks)
          .innerJoin(projects, eq(projects.id, tasks.projectId))
          .where(and(eq(tasks.userId, user.id), eq(tasks.isCompleted, false)))
          .orderBy(tasks.dueDate, tasks.order),
        user.id,
      ),
    ),
  ]);

  const matches = activeTasks.filter((task) =>
    task.labels.some((taskLabel) => taskLabel.id === label.id),
  );
  const today = todayInTimezone(settings.timezone);

  return (
    <div className="mx-auto w-full max-w-2xl p-6">
      <MobilePageHeader className="mb-6">
        <ProjectColorDot color={label.color} />
        <h1 className="text-xl font-semibold">{label.name}</h1>
      </MobilePageHeader>
      {matches.length === 0 ? (
        <p className="text-sm text-muted-foreground">No matching tasks.</p>
      ) : (
        <TaskDateList
          initialGroups={[{ heading: label.name, tasks: matches }]}
          labels={userLabels}
          currentUserId={user.id}
          today={today}
          dateFormat={settings.dateFormat}
        />
      )}
    </div>
  );
}
