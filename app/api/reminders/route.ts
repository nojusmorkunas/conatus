import { and, eq, isNull, lte } from "drizzle-orm";

import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { requireTaskAccess } from "@/lib/db/access";
import { reminders, tasks } from "@/lib/db/schema";
import { reminderCreateSchema } from "@/lib/validation";

export async function GET(request: Request) {
  const user = await requireUser("reminders:read");
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const taskId = url.searchParams.get("taskId");
  const due = url.searchParams.get("due");

  if (due) {
    const dueReminders = await db
      .select({
        id: reminders.id,
        remindAt: reminders.remindAt,
        taskId: reminders.taskId,
        taskContent: tasks.content,
        projectId: tasks.projectId,
      })
      .from(reminders)
      .innerJoin(tasks, eq(reminders.taskId, tasks.id))
      .where(
        and(
          eq(reminders.userId, user.id),
          lte(reminders.remindAt, new Date()),
          isNull(reminders.seenAt),
        ),
      )
      .orderBy(reminders.remindAt);

    return Response.json(dueReminders);
  }

  if (!taskId) {
    return Response.json({ error: "taskId is required" }, { status: 400 });
  }

  if (!(await requireTaskAccess(user.id, taskId))) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  // Reminders are personal: members never see each other's.
  const taskReminders = await db
    .select()
    .from(reminders)
    .where(and(eq(reminders.taskId, taskId), eq(reminders.userId, user.id)))
    .orderBy(reminders.remindAt);

  return Response.json(taskReminders);
}

export async function POST(request: Request) {
  const user = await requireUser("reminders:write");
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = reminderCreateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { taskId, remindAt } = parsed.data;

  if (!(await requireTaskAccess(user.id, taskId))) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const [reminder] = await db
    .insert(reminders)
    .values({ taskId, userId: user.id, remindAt: new Date(remindAt) })
    .returning();

  return Response.json(reminder, { status: 201 });
}
