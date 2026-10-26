import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import { accessibleProjectIds } from "@/lib/db/access";
import { tasks, users } from "@/lib/db/schema";
import { buildCalendar } from "@/lib/ical";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.icalToken, token));
  if (!user) {
    return new Response("Not found", { status: 404 });
  }

  const dueTasks = await db
    .select({
      id: tasks.id,
      content: tasks.content,
      description: tasks.description,
      dueDate: tasks.dueDate,
      dueTime: tasks.dueTime,
    })
    .from(tasks)
    .where(
      and(
        // Same scope as Upcoming: tasks.userId is only the creator.
        inArray(tasks.projectId, await accessibleProjectIds({ id: user.id, projectIds: null })),
        eq(tasks.isCompleted, false),
        isNull(tasks.deletedAt),
        isNotNull(tasks.dueDate),
      ),
    )
    .limit(500);

  const calendar = buildCalendar(
    dueTasks.map((task) => ({ ...task, dueDate: task.dueDate! })),
    "Conatus",
  );

  return new Response(calendar, {
    headers: { "Content-Type": "text/calendar; charset=utf-8" },
  });
}
