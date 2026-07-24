import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";

import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { projectCollaborators, projects, tasks } from "@/lib/db/schema";
import { subtreeIds } from "@/lib/task-tree";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser("tasks:write");
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

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
  if (!row || (row.ownerId !== user.id && !row.collaboratorId)) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

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
    .select({ id: tasks.id, parentId: tasks.parentId, sectionId: tasks.sectionId, order: tasks.order })
    .from(tasks)
    .where(eq(tasks.projectId, row.task.projectId));
  await db
    .update(tasks)
    .set({ deletedAt: null, updatedAt: new Date() })
    .where(inArray(tasks.id, [...subtreeIds(projectTasks, id)]));

  return Response.json({ ok: true });
}
