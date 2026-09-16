import { and, eq } from "drizzle-orm";

import { invalid, notFound, unauthorized } from "@/lib/api/responses";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { labels } from "@/lib/db/schema";
import { labelUpdateSchema } from "@/lib/validation";

async function ownedLabel(userId: string, labelId: string) {
  const [label] = await db
    .select()
    .from(labels)
    .where(and(eq(labels.id, labelId), eq(labels.userId, userId)));
  return label;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser("labels:write");
  if (!user) return unauthorized();

  const { id } = await params;
  const label = await ownedLabel(user.id, id);
  if (!label) return notFound();

  const parsed = labelUpdateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return invalid(parsed.error);
  }

  const [updated] = await db
    .update(labels)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(labels.id, id))
    .returning();

  return Response.json(updated);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser("labels:write");
  if (!user) return unauthorized();

  const { id } = await params;
  const label = await ownedLabel(user.id, id);
  if (!label) return notFound();

  await db.delete(labels).where(eq(labels.id, id));

  return Response.json({ ok: true });
}
