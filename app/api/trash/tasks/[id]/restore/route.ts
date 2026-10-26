import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";

import { notFound, unauthorized } from "@/lib/api/responses";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { allowedProjectIds } from "@/lib/db/access";
import { projectCollaborators, projects, tasks } from "@/lib/db/schema";
import { subtreeIds } from "@/lib/task-tree";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser("tasks:write");
  if (!user) return unauthorized();

  const { id } = await params;
  const [row] = await db
    .select({ task: tasks, ownerId: projects.userId, collaboratorId: projectCollaborators.userId })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .leftJoin(
      projectCollaborators,
      and(
        eq(projectCollaborators.projectId, projects.id),
        eq(projectCollaborators.userId, user.id),
      ),
    )
    .where(and(eq(tasks.id, id), isNotNull(tasks.deletedAt), isNull(projects.deletedAt)));
  if (!row || (row.ownerId !== user.id && !row.collaboratorId)) return notFound();

  const allowed = await allowedProjectIds(user);
  if (allowed && !allowed.has(row.task.projectId)) return notFound();

  // A child is restored with its deleted descendants. Trash only offers root
  // tasks, so this cannot revive a task beneath a still-deleted parent.
  if (row.task.parentId) {
    const [parent] = await db
      .select({ deletedAt: tasks.deletedAt })
      .from(tasks)
      .where(eq(tasks.id, row.task.parentId));
    if (parent?.deletedAt) {
      return Response.json({ error: "Restore the parent task first" }, { status: 400 });
    }
  }
  const projectTasks = await db
    .select({
      id: tasks.id,
      parentId: tasks.parentId,
      sectionId: tasks.sectionId,
      order: tasks.order,
      deletedAt: tasks.deletedAt,
    })
    .from(tasks)
    .where(eq(tasks.projectId, row.task.projectId));

  // A task from a deleted section returns at the project root, and a sibling
  // added while this one sat in Trash takes the next free key. Either can
  // leave two siblings on one order key, which generateKeyBetween rejects
  // when a task is later placed between them, so a clash goes to the end.
  const siblingOrders = projectTasks
    .filter((task) => !task.deletedAt && task.parentId === row.task.parentId
      && (row.task.parentId !== null || task.sectionId === row.task.sectionId))
    .map((task) => task.order);
  const order = siblingOrders.includes(row.task.order)
    ? generateKeyBetween(siblingOrders.reduce((last, key) => (key > last ? key : last)), null)
    : row.task.order;

  await db.transaction(async (tx) => {
    await tx
      .update(tasks)
      .set({ deletedAt: null, updatedAt: new Date() })
      .where(inArray(tasks.id, [...subtreeIds(projectTasks, id)]));
    if (order !== row.task.order) {
      await tx.update(tasks).set({ order }).where(eq(tasks.id, id));
    }
  });

  return Response.json({ ok: true });
}
