import { and, eq } from "drizzle-orm";

import { invalid, notFound, unauthorized } from "@/lib/api/responses";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { type ProjectActor, requireTaskAccess } from "@/lib/db/access";
import { reminders } from "@/lib/db/schema";
import { reminderUpdateSchema } from "@/lib/validation";

async function ownedReminder(user: ProjectActor, reminderId: string) {
  const [reminder] = await db
    .select()
    .from(reminders)
    .where(and(eq(reminders.id, reminderId), eq(reminders.userId, user.id)));
  if (reminder && user.projectIds !== null && !(await requireTaskAccess(user, reminder.taskId))) {
    return undefined;
  }
  return reminder;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser("reminders:write");
  if (!user) return unauthorized();

  const { id } = await params;
  const reminder = await ownedReminder(user, id);
  if (!reminder) return notFound();

  const parsed = reminderUpdateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return invalid(parsed.error);
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
  if (!user) return unauthorized();

  const { id } = await params;
  const reminder = await ownedReminder(user, id);
  if (!reminder) return notFound();

  await db.delete(reminders).where(eq(reminders.id, id));

  return Response.json({ ok: true });
}
