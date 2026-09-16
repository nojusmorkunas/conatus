import { eq, inArray } from "drizzle-orm";

import { notFound, unauthorized } from "@/lib/api/responses";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser("projects:write");
  if (!user) return unauthorized();

  const { id } = await params;
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, id));
  if (!project) return notFound();

  const owned = await db
    .select({ id: projects.id, parentId: projects.parentId, deletedAt: projects.deletedAt })
    .from(projects)
    .where(eq(projects.userId, user.id));
  const root = owned.find((candidate) => candidate.id === id);
  if (!root?.deletedAt) return notFound();
  if (root.parentId && owned.find((candidate) => candidate.id === root.parentId)?.deletedAt) {
    return Response.json({ error: "Restore the parent project first" }, { status: 400 });
  }

  const children = new Map<string, string[]>();
  for (const candidate of owned) {
    if (!candidate.parentId) continue;
    children.set(candidate.parentId, [...(children.get(candidate.parentId) ?? []), candidate.id]);
  }
  const restoredIds = new Set([id]);
  const queue = [...(children.get(id) ?? [])];
  while (queue.length) {
    const childId = queue.shift()!;
    if (restoredIds.has(childId)) continue;
    restoredIds.add(childId);
    queue.push(...(children.get(childId) ?? []));
  }

  await db
    .update(projects)
    .set({ deletedAt: null, updatedAt: new Date() })
    .where(inArray(projects.id, [...restoredIds]));

  return Response.json({ ok: true });
}
