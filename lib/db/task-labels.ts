import { and, count, eq, inArray, isNotNull } from "drizzle-orm";

import { db } from "@/lib/db";
import { comments, labels, taskLabels } from "@/lib/db/schema";

type Task = { id: string };
type Label = typeof labels.$inferSelect;

// Labels are personal even on shared tasks: only the viewer's own labels
// come back, never another member's.
export async function withLabels<T extends Task>(
  tasks: T[],
  userId: string,
): Promise<(T & { labels: Label[] })[]> {
  const taskIds = tasks.map((task) => task.id);
  const links = taskIds.length
    ? await db
        .select({ taskId: taskLabels.taskId, label: labels })
        .from(taskLabels)
        .innerJoin(labels, eq(taskLabels.labelId, labels.id))
        .where(and(inArray(taskLabels.taskId, taskIds), eq(labels.userId, userId)))
    : [];

  const labelsByTask = new Map<string, Label[]>();
  for (const link of links) {
    const existing = labelsByTask.get(link.taskId) ?? [];
    existing.push(link.label);
    labelsByTask.set(link.taskId, existing);
  }

  return tasks.map((task) => ({
    ...task,
    labels: labelsByTask.get(task.id) ?? [],
  }));
}

export async function withCommentCounts<T extends Task>(
  tasks: T[],
): Promise<(T & { commentCount: number })[]> {
  const taskIds = tasks.map((task) => task.id);
  const rows = taskIds.length
    ? await db
        .select({ taskId: comments.taskId, count: count() })
        .from(comments)
        .where(and(inArray(comments.taskId, taskIds), isNotNull(comments.taskId)))
        .groupBy(comments.taskId)
    : [];

  const countByTask = new Map(rows.map((row) => [row.taskId, row.count]));

  return tasks.map((task) => ({
    ...task,
    commentCount: countByTask.get(task.id) ?? 0,
  }));
}
