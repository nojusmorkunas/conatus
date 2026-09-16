import { eq } from "drizzle-orm";

import { invalid, unauthorized } from "@/lib/api/responses";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { settingsSchema } from "@/lib/validation";

export async function PATCH(request: Request) {
  const user = await requireUser();
  if (!user) return unauthorized();

  const parsed = settingsSchema.safeParse(await request.json());
  if (!parsed.success) {
    return invalid(parsed.error);
  }

  await db
    .update(users)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(users.id, user.id));

  return Response.json({ ok: true });
}
