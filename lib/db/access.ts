import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import { projectCollaborators, projects, tasks } from "@/lib/db/schema";
import { coveredProjectIds } from "@/lib/token-access";

export type ProjectActor = { id: string; projectIds: string[] | null };

// null when the actor may reach every project it is a member of.
export async function allowedProjectIds(actor: ProjectActor): Promise<Set<string> | null> {
  if (actor.projectIds === null) return null;
  const own = await db
    .select({ id: projects.id, parentId: projects.parentId })
    .from(projects)
    .where(eq(projects.userId, actor.id));
  return coveredProjectIds(actor.projectIds, own);
}

export type Role = "owner" | "editor";

// The single authorization chokepoint for project-scoped data: a project is
// accessible iff you own it or hold a collaborator row. Everything task- or
// section-shaped resolves through its project. The chokepoint also applies
// a token's project limit.
export async function requireProjectAccess(
  actor: ProjectActor,
  projectId: string,
): Promise<{ role: Role; project: typeof projects.$inferSelect } | null> {
  const [row] = await db
    .select({ project: projects, collaboratorId: projectCollaborators.userId })
    .from(projects)
    .leftJoin(
      projectCollaborators,
      and(
        eq(projectCollaborators.projectId, projects.id),
        eq(projectCollaborators.userId, actor.id),
      ),
    )
    .where(and(eq(projects.id, projectId), isNull(projects.deletedAt)));
  if (!row) return null;
  if (row.project.userId !== actor.id && !row.collaboratorId) return null;
  const allowed = await allowedProjectIds(actor);
  if (allowed && !allowed.has(projectId)) return null;
  if (row.project.userId === actor.id) return { role: "owner", project: row.project };
  return row.collaboratorId ? { role: "editor", project: row.project } : null;
}

export async function isProjectMember(userId: string, projectId: string) {
  return Boolean(await requireProjectAccess({ id: userId, projectIds: null }, projectId));
}

// Task access is via the task's project; tasks.userId is only the creator.
export async function requireTaskAccess(actor: ProjectActor, taskId: string) {
  const [row] = await db
    .select({ task: tasks, ownerId: projects.userId, collaboratorId: projectCollaborators.userId })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .leftJoin(
      projectCollaborators,
      and(
        eq(projectCollaborators.projectId, projects.id),
        eq(projectCollaborators.userId, actor.id),
      ),
    )
    .where(and(eq(tasks.id, taskId), isNull(tasks.deletedAt), isNull(projects.deletedAt)));
  if (!row || (row.ownerId !== actor.id && !row.collaboratorId)) return null;
  const allowed = await allowedProjectIds(actor);
  if (allowed && !allowed.has(row.task.projectId)) return null;
  return row.task;
}

// Own projects first (their sidebar order), then shared ones flagged for the
// people icon. Archived projects are out for everyone.
//
// Always the complete accessible set, never a delta. Revoking a collaborator
// deletes the project_collaborators row without touching projects.updatedAt,
// so an updatedSince filter cannot see the revocation and a syncing client
// would keep the project and its tasks cached after losing access. Absence
// from the full list is the only signal that catches it.
export async function accessibleProjects(
  actor: ProjectActor,
): Promise<(typeof projects.$inferSelect & { shared?: boolean })[]> {
  const own = await db
    .select()
    .from(projects)
    .where(and(eq(projects.userId, actor.id), eq(projects.isArchived, false), isNull(projects.deletedAt)))
    .orderBy(projects.order);
  const shared = await db
    .select({ project: projects })
    .from(projectCollaborators)
    .innerJoin(projects, eq(projects.id, projectCollaborators.projectId))
    .where(and(eq(projectCollaborators.userId, actor.id), eq(projects.isArchived, false), isNull(projects.deletedAt)))
    .orderBy(projects.order);
  const reachable = [...own, ...shared.map((row) => ({ ...row.project, shared: true }))];
  const allowed = await allowedProjectIds(actor);
  return allowed ? reachable.filter((project) => allowed.has(project.id)) : reachable;
}

export async function accessibleProjectIds(actor: ProjectActor) {
  return (await accessibleProjects(actor)).map((project) => project.id);
}
