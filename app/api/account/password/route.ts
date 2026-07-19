import { eq } from "drizzle-orm";

import { requireSessionUser } from "@/lib/auth/session";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { passwordChangeSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const sessionUser = await requireSessionUser();
  if (!sessionUser) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = passwordChangeSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const [user] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, sessionUser.id))
    .limit(1);

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (
    user.passwordHash !== null &&
    (!parsed.data.currentPassword ||
      !(await verifyPassword(parsed.data.currentPassword, user.passwordHash)))
  ) {
    return Response.json(
      { error: "Current password is incorrect" },
      { status: 400 },
    );
  }

  await db
    .update(users)
    .set({
      passwordHash: await hashPassword(parsed.data.newPassword),
      updatedAt: new Date(),
    })
    .where(eq(users.id, sessionUser.id));

  return Response.json({ ok: true });
}
