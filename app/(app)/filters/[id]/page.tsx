import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";

import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { filters, labels, projects, tasks, users } from "@/lib/db/schema";
import { withCommentCounts, withLabels } from "@/lib/db/task-labels";
import { todayInTimezone } from "@/lib/dates";
import { parseFilter, evaluateFilter, type FilterableTask } from "@/lib/filter";
import { TaskDateList } from "@/components/tasks/task-date-list";

export default async function FilterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  if (!user) return null;

  const { id } = await params;
  const [filter] = await db
    .select()
    .from(filters)
    .where(and(eq(filters.id, id), eq(filters.userId, user.id)));
  if (!filter) notFound();

  const [settings] = await db
    .select({ timezone: users.timezone, dateFormat: users.dateFormat })
    .from(users)
    .where(eq(users.id, user.id));
  const today = todayInTimezone(settings.timezone);

  const parsed = parseFilter(filter.query);

  const userLabels = await db
    .select()
    .from(labels)
    .where(eq(labels.userId, user.id))
    .orderBy(labels.order);

  if ("error" in parsed) {
    return (
      <div className="mx-auto w-full max-w-2xl p-6">
        <Header name={filter.name} query={filter.query} />
        <p className="text-sm text-destructive">
          This filter&apos;s query is no longer valid: {parsed.error}
        </p>
      </div>
    );
  }

  const activeTasks = await withCommentCounts(
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
  );

  const matches = activeTasks.filter((task) => {
    const filterable: FilterableTask = {
      dueDate: task.dueDate,
      dueTime: task.dueTime,
      priority: task.priority as 1 | 2 | 3 | 4,
      isCompleted: task.isCompleted,
      projectName: task.projectName,
      labelNames: task.labels.map((label) => label.name),
    };
    return evaluateFilter(parsed.ast, filterable, { today });
  });

  return (
    <div className="mx-auto w-full max-w-2xl p-6">
      <Header name={filter.name} query={filter.query} />
      {matches.length === 0 ? (
        <p className="text-sm text-muted-foreground">No matching tasks.</p>
      ) : (
        <TaskDateList
          initialGroups={[{ heading: filter.name, tasks: matches }]}
          labels={userLabels}
          currentUserId={user.id}
          today={today}
          dateFormat={settings.dateFormat}
        />
      )}
    </div>
  );
}

function Header({ name, query }: { name: string; query: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-xl font-semibold">{name}</h1>
      <p className="mt-1 font-mono text-xs text-muted-foreground">{query}</p>
    </div>
  );
}
