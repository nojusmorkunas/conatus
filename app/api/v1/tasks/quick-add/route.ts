import { eq } from "drizzle-orm";

import { POST as createTask } from "@/app/api/tasks/route";
import { PATCH as updateTask } from "@/app/api/tasks/[id]/route";
import { withIdempotency } from "@/lib/api/idempotency";
import { requireApiActor } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { accessibleProjects } from "@/lib/db/access";
import { labels, users } from "@/lib/db/schema";
import { todayInTimezone } from "@/lib/dates";
import { parseQuickAdd } from "@/lib/parser/quick-add";

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

      return Response.json(
        {
          task,
          parsed,
          warnings: missingLabels.map((name) => `Label “${name}” was not found`),
        },
        { status: 201 },
      );
    },
  );
}
