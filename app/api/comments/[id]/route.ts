import { and, eq } from "drizzle-orm";

import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { comments } from "@/lib/db/schema";
import { commentUpdateSchema } from "@/lib/validation";

async function ownedComment(userId: string, commentId: string) {
  const [comment] = await db
    .select()
    .from(comments)
    .where(and(eq(comments.id, commentId), eq(comments.userId, userId)));
  return comment;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser("comments:write");
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const comment = await ownedComment(user.id, id);
  if (!comment) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const parsed = commentUpdateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
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
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const comment = await ownedComment(user.id, id);
  if (!comment) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  await db.delete(comments).where(eq(comments.id, id));

  return Response.json({ ok: true });
}
