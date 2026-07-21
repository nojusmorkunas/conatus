import { db } from "@/lib/db";
import { activityEvents, webhooks } from "@/lib/db/schema";
import { boss } from "@/lib/jobs";
import { WEBHOOK_DELIVERY_QUEUE } from "@/lib/webhooks";
import { and, eq } from "drizzle-orm";

export type ActivityEventType =
  | "task.created"
  | "task.completed"
  | "task.uncompleted"
  | "task.deleted"
  | "comment.added"
  | "project.created"
  | "project.archived"
  | "project.deleted";

// ponytail: field edits (content/description/priority/due/labels/reorder)
// are deliberately not logged. This is a scope cut that can change if needed.
export async function logActivity(event: {
  userId: string;
  type: ActivityEventType;
  taskContent: string;
  taskId?: string | null;
  projectId?: string | null;
  projectName: string;
}) {
  // An activity write must never fail the user action it's logging.
  try {
    await db.insert(activityEvents).values(event);
    const activeWebhooks = await db
      .select({ id: webhooks.id })
      .from(webhooks)
      .where(and(eq(webhooks.userId, event.userId), eq(webhooks.isActive, true)));
    const occurredAt = new Date().toISOString();
    await Promise.all(
      activeWebhooks.map((webhook) => boss.send(
        WEBHOOK_DELIVERY_QUEUE,
        {
          webhookId: webhook.id,
          event: {
            type: event.type,
            taskContent: event.taskContent,
            projectId: event.projectId ?? null,
            projectName: event.projectName,
            occurredAt,
          },
        },
        { retryLimit: 5, retryBackoff: true },
      )),
    );
  } catch (error) {
    console.error("logActivity failed", error);
  }
}
