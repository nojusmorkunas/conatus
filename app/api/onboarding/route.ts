import { eq } from "drizzle-orm";

import { unauthorized } from "@/lib/api/responses";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export async function POST() {
  const user = await requireUser();
  if (!user) return unauthorized();

  await db
    .update(users)
    .set({ onboardingCompletedAt: new Date(), updatedAt: new Date() })
    .where(eq(users.id, user.id));
  return Response.json({ ok: true });
}
