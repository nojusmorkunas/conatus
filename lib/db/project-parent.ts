import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";

export async function validateProjectParent(
  userId: string,
  parentId: string | null,
  projectId?: string,
) {
  if (parentId === null) return null;
  const owned = await db
    .select({ id: projects.id, parentId: projects.parentId, isInbox: projects.isInbox })
    .from(projects)
    .where(eq(projects.userId, userId));
  const byId = new Map(owned.map((project) => [project.id, project]));
  const parent = byId.get(parentId);
  if (!parent) return "Parent project not found";
  if (parent.isInbox) return "Inbox can't be a parent project";

  let ancestorId: string | null = parentId;
  let parentDepth = 0;
  const visited = new Set<string>();
  while (ancestorId) {
    if (ancestorId === projectId) {
      return "A project can't be moved under itself or one of its sub-projects";
    }
    if (visited.has(ancestorId)) return "Invalid project hierarchy";
    visited.add(ancestorId);
    const ancestor = byId.get(ancestorId);
    if (!ancestor) return "Invalid project hierarchy";
    parentDepth += 1;
    ancestorId = ancestor.parentId;
  }

  let subtreeHeight = 1;
  if (projectId) {
    const children = new Map<string, string[]>();
    for (const project of owned) {
      if (!project.parentId) continue;
      children.set(project.parentId, [...(children.get(project.parentId) ?? []), project.id]);
    }
    const queue = (children.get(projectId) ?? []).map((id) => ({ id, depth: 2 }));
    const descendantIds = new Set<string>();
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (descendantIds.has(current.id)) return "Invalid project hierarchy";
      descendantIds.add(current.id);
      subtreeHeight = Math.max(subtreeHeight, current.depth);
      queue.push(...(children.get(current.id) ?? []).map((id) => ({ id, depth: current.depth + 1 })));
    }
  }
  if (parentDepth + subtreeHeight > 3) return "Projects can be nested at most 3 levels deep";
  return null;
}
