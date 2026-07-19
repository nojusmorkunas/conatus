import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { projectCollaborators, projects, tasks } from "@/lib/db/schema";

export type Role = "owner" | "editor";

// The single authorization chokepoint for project-scoped data: a project is
// accessible iff you own it or hold a collaborator row. Everything task- or
// section-shaped resolves through its project.
export async function requireProjectAccess(
  userId: string,
  projectId: string,
): Promise<{ role: Role; project: typeof projects.$inferSelect } | null> {
  const [row] = await db
    .select({ project: projects, collaboratorId: projectCollaborators.userId })
    .from(projects)
    .leftJoin(
      projectCollaborators,
      and(
        eq(projectCollaborators.projectId, projects.id),
        eq(projectCollaborators.userId, userId),
      ),
    )
    .where(eq(projects.id, projectId));
  if (!row) return null;
  if (row.project.userId === userId) return { role: "owner", project: row.project };
  return row.collaboratorId ? { role: "editor", project: row.project } : null;
}

export async function isProjectMember(userId: string, projectId: string) {
  return Boolean(await requireProjectAccess(userId, projectId));
}

// Task access is via the task's project; tasks.userId is only the creator.
export async function requireTaskAccess(userId: string, taskId: string) {
  const [row] = await db
    .select({ task: tasks, ownerId: projects.userId, collaboratorId: projectCollaborators.userId })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .leftJoin(
      projectCollaborators,
      and(
        eq(projectCollaborators.projectId, projects.id),
        eq(projectCollaborators.userId, userId),
      ),
    )
    .where(eq(tasks.id, taskId));
  if (!row || (row.ownerId !== userId && !row.collaboratorId)) return null;
  return row.task;
}

// Own projects first (their sidebar order), then shared ones flagged for the
// people icon. Archived projects are out for everyone.
export async function accessibleProjects(
  userId: string,
): Promise<(typeof projects.$inferSelect & { shared?: boolean })[]> {
  const own = await db
    .select()
    .from(projects)
    .where(and(eq(projects.userId, userId), eq(projects.isArchived, false)))
    .orderBy(projects.order);
  const shared = await db
    .select({ project: projects })
    .from(projectCollaborators)
    .innerJoin(projects, eq(projects.id, projectCollaborators.projectId))
    .where(and(eq(projectCollaborators.userId, userId), eq(projects.isArchived, false)))
    .orderBy(projects.order);
  return [...own, ...shared.map((row) => ({ ...row.project, shared: true }))];
}

export async function accessibleProjectIds(userId: string) {
  return (await accessibleProjects(userId)).map((project) => project.id);
}
