import { and, eq, inArray, isNull, or } from "drizzle-orm";

import { db } from "@/lib/db";
import { projectCollaborators, projects } from "@/lib/db/schema";

// Ids among `ids` that the user cannot reach: not a project, in Trash, or
// neither owned nor shared with them. Archived projects are fine.
export async function unreachableProjectIds(userId: string, ids: string[]): Promise<string[]> {
  const reachable = await db
    .select({ id: projects.id })
    .from(projects)
    .leftJoin(
      projectCollaborators,
      and(
        eq(projectCollaborators.projectId, projects.id),
        eq(projectCollaborators.userId, userId),
      ),
    )
    .where(and(
      inArray(projects.id, ids),
      isNull(projects.deletedAt),
      or(eq(projects.userId, userId), eq(projectCollaborators.userId, userId)),
    ));
  const reachableIds = new Set(reachable.map((project) => project.id));
  return ids.filter((id) => !reachableIds.has(id));
}
