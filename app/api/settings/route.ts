import { eq } from "drizzle-orm";

import { invalid, unauthorized } from "@/lib/api/responses";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { notifyDevices } from "@/lib/push";
import { settingsSchema } from "@/lib/validation";

export async function PATCH(request: Request) {
  const user = await requireUser("settings:write");
  if (!user) return unauthorized();

  // Partial so API clients can change one setting without first reading the
  // ones they never see, like the daily goal.
  const parsed = settingsSchema.partial().safeParse(await request.json());
  if (!parsed.success) {
    return invalid(parsed.error);
  }

  await db
    .update(users)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(users.id, user.id));

  notifyDevices(user);

  return Response.json({ ok: true });
}
