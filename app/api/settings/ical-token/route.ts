import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";

import { requireSessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export async function POST() {
  const user = await requireSessionUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = randomBytes(24).toString("base64url");
  await db
    .update(users)
    .set({ icalToken: token, updatedAt: new Date() })
    .where(eq(users.id, user.id));

  return Response.json({ token });
}

export async function DELETE() {
  const user = await requireSessionUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  await db
    .update(users)
    .set({ icalToken: null, updatedAt: new Date() })
    .where(eq(users.id, user.id));

  return Response.json({ ok: true });
}
