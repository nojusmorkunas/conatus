import { and, eq } from "drizzle-orm";

import { invalid, notFound, unauthorized } from "@/lib/api/responses";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { type ProjectActor, requireTaskAccess, requireProjectAccess } from "@/lib/db/access";
import { comments } from "@/lib/db/schema";
import { commentUpdateSchema } from "@/lib/validation";

async function ownedComment(user: ProjectActor, commentId: string) {
  const [comment] = await db
    .select()
    .from(comments)
    .where(and(eq(comments.id, commentId), eq(comments.userId, user.id)));
  if (comment && user.projectIds !== null) {
    const access = comment.taskId
      ? await requireTaskAccess(user, comment.taskId)
      : comment.projectId && await requireProjectAccess(user, comment.projectId);
    if (!access) return undefined;
  }
  return comment;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser("comments:write");
  if (!user) return unauthorized();

  const { id } = await params;
  const comment = await ownedComment(user, id);
  if (!comment) return notFound();

  const parsed = commentUpdateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return invalid(parsed.error);
  }

  const [updated] = await db
    .update(comments)
    .set({ content: parsed.data.content, updatedAt: new Date() })
    .where(eq(comments.id, id))
    .returning();

  return Response.json(updated);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser("comments:delete");
  if (!user) return unauthorized();

  const { id } = await params;
  const comment = await ownedComment(user, id);
  if (!comment) return notFound();

  await db.delete(comments).where(eq(comments.id, id));

  return Response.json({ ok: true });
}
