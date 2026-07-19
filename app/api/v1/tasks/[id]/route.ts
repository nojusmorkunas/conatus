import { and, eq } from "drizzle-orm";

import {
  DELETE,
  PATCH,
} from "@/app/api/tasks/[id]/route";
import { requireApiActor } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { requireTaskAccess } from "@/lib/db/access";
import { comments, reminders } from "@/lib/db/schema";
import { withLabels } from "@/lib/db/task-labels";

function hasScope(scopes: string[], scope: string) {
  return scopes.includes("*") || scopes.includes(scope);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await requireApiActor("tasks:read");
  if (!actor) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const task = await requireTaskAccess(actor.id, id);
  if (!task) return Response.json({ error: "Not found" }, { status: 404 });

  const [withTaskLabels] = hasScope(actor.scopes, "labels:read")
    ? await withLabels([task], actor.id)
    : [{ ...task, labels: [] }];
  const [taskComments, taskReminders] = await Promise.all([
    hasScope(actor.scopes, "comments:read")
      ? db.select().from(comments).where(eq(comments.taskId, id)).orderBy(comments.createdAt)
      : [],
    hasScope(actor.scopes, "reminders:read")
      ? db
          .select()
          .from(reminders)
          .where(and(eq(reminders.taskId, id), eq(reminders.userId, actor.id)))
          .orderBy(reminders.remindAt)
      : [],
  ]);

  return Response.json({
    ...withTaskLabels,
    comments: taskComments,
    reminders: taskReminders,
  });
}

export { PATCH, DELETE };
