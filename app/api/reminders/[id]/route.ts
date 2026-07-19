import { and, eq } from "drizzle-orm";

import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { reminders } from "@/lib/db/schema";
import { reminderUpdateSchema } from "@/lib/validation";

async function ownedReminder(userId: string, reminderId: string) {
  const [reminder] = await db
    .select()
    .from(reminders)
    .where(and(eq(reminders.id, reminderId), eq(reminders.userId, userId)));
  return reminder;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser("reminders:write");
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const reminder = await ownedReminder(user.id, id);
  if (!reminder) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const parsed = reminderUpdateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const [updated] = await db
    .update(reminders)
    .set({ seenAt: new Date() })
    .where(eq(reminders.id, id))
    .returning();

  return Response.json(updated);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser("reminders:delete");
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const reminder = await ownedReminder(user.id, id);
  if (!reminder) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  await db.delete(reminders).where(eq(reminders.id, id));

  return Response.json({ ok: true });
}
