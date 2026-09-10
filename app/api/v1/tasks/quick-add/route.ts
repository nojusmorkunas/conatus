import { eq } from "drizzle-orm";

import { POST as createTask } from "@/app/api/tasks/route";
import { PATCH as updateTask } from "@/app/api/tasks/[id]/route";
import { POST as createReminder } from "@/app/api/reminders/route";
import { withIdempotency } from "@/lib/api/idempotency";
import { requireApiActor } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { accessibleProjects } from "@/lib/db/access";
import { labels, users } from "@/lib/db/schema";
import { todayInTimezone } from "@/lib/dates";
import { parseQuickAdd } from "@/lib/parser/quick-add";
import { localDateTimeToUtc } from "@/lib/local-time";

export async function POST(request: Request) {
  const actor = await requireApiActor("tasks:write");
  if (!actor) return Response.json({ error: "Unauthorized" }, { status: 401 });

  return withIdempotency(
    request,
    { userId: actor.id, operation: "tasks.quick-add" },
    async () => {
      const body = await request.clone().json().catch(() => null);
      if (!body || typeof body.text !== "string" || !body.text.trim()) {
        return Response.json({ error: "text is required" }, { status: 400 });
      }

      const [[settings], projects, userLabels] = await Promise.all([
        db
          .select({ timezone: users.timezone })
          .from(users)
          .where(eq(users.id, actor.id))
          .limit(1),
        accessibleProjects(actor.id),
        db.select().from(labels).where(eq(labels.userId, actor.id)),
      ]);
      const parsed = parseQuickAdd(body.text, {
        today: todayInTimezone(settings?.timezone ?? "UTC"),
      });
      const remindAt = parsed.reminderAt ? localDateTimeToUtc(parsed.reminderAt, settings?.timezone ?? "UTC") : null;
      if (parsed.reminderAt) {
        if (!(await requireApiActor("reminders:write"))) return Response.json({ error: "reminders:write is required to create a reminder" }, { status: 403 });
        if (!remindAt) return Response.json({ error: "That reminder time does not exist in your account's time zone" }, { status: 400 });
      }
      const project = parsed.projectName
        ? projects.find(
            (candidate) =>
              candidate.name.toLocaleLowerCase() ===
              parsed.projectName!.toLocaleLowerCase(),
          )
        : projects.find((candidate) => candidate.isInbox);
      if (!project) {
        return Response.json(
          {
            error: parsed.projectName
              ? `Project “${parsed.projectName}” was not found`
              : "Inbox was not found",
          },
          { status: 400 },
        );
      }

      const createResponse = await createTask(
        new Request(request.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId: project.id,
            content: parsed.content,
            priority: parsed.priority,
            dueDate: parsed.dueDate,
            dueTime: parsed.dueTime,
            recurrence: parsed.recurrence,
            deadlineDate: parsed.deadlineDate,
            durationMinutes: parsed.durationMinutes,
          }),
        }),
      );
      if (!createResponse.ok) return createResponse;
      let task = await createResponse.json();

      const wantedNames = new Set(
        parsed.labelNames.map((name) => name.toLocaleLowerCase()),
      );
      const matchedLabels = userLabels.filter((label) =>
        wantedNames.has(label.name.toLocaleLowerCase()),
      );
      const missingLabels = parsed.labelNames.filter(
        (name) =>
          !matchedLabels.some(
            (label) => label.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
          ),
      );
      if (matchedLabels.length) {
        const labelResponse = await updateTask(
          new Request(request.url, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ labelIds: matchedLabels.map((label) => label.id) }),
          }),
          { params: Promise.resolve({ id: task.id }) },
        );
        if (labelResponse.ok) task = await labelResponse.json();
      }

      const warnings = missingLabels.map((name) => `Label “${name}” was not found`);
      if (remindAt) {
        try {
          const reminderResponse = await createReminder(new Request(request.url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ taskId: task.id, remindAt: remindAt.toISOString() }),
          }));
          if (!reminderResponse.ok) warnings.push("Task added, but the reminder could not be saved");
        } catch {
          // The task already exists. Return it so an API retry cannot quietly
          // create a second task after a reminder-service failure.
          warnings.push("Task added, but the reminder could not be saved");
        }
      }

      return Response.json(
        {
          task,
          parsed,
          warnings,
        },
        { status: 201 },
      );
    },
  );
}
