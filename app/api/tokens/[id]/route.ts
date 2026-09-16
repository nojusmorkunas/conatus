import { and, eq } from "drizzle-orm";

import { notFound, unauthorized } from "@/lib/api/responses";
import { requireSessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { apiTokens } from "@/lib/db/schema";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const [deleted] = await db
    .update(apiTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiTokens.id, id), eq(apiTokens.userId, user.id)))
    .returning({ id: apiTokens.id });

  if (!deleted) return notFound();

  return Response.json({ ok: true });
}
