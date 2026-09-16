import { and, eq, isNull } from "drizzle-orm";

import { notFound } from "@/lib/api/responses";
import { isInstanceAdmin } from "@/lib/auth/registration";
import { requireSessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { registrationInvites } from "@/lib/db/schema";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireSessionUser();
  if (!user || !(await isInstanceAdmin(user.id))) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const [revoked] = await db
    .update(registrationInvites)
    .set({ revokedAt: new Date() })
    .where(
      and(eq(registrationInvites.id, id), isNull(registrationInvites.usedAt)),
    )
    .returning({ id: registrationInvites.id });
  if (!revoked) return notFound();
  return Response.json({ ok: true });
}
