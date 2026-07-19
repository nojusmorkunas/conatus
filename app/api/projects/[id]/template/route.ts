import { and, eq } from "drizzle-orm";

import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { requireProjectAccess } from "@/lib/db/access";
import { sections, tasks } from "@/lib/db/schema";

function templateFilename(name: string) {
  const safeName = name
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "");
  return `${safeName || "project"}-template.json`;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const access = await requireProjectAccess(user.id, id);
  if (!access) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const [projectSections, activeTasks] = await Promise.all([
    db.select().from(sections).where(eq(sections.projectId, id)).orderBy(sections.order),
    db
      .select()
      .from(tasks)
      .where(and(eq(tasks.projectId, id), eq(tasks.isCompleted, false)))
      .orderBy(tasks.order),
  ]);
  const activeTaskIds = new Set(activeTasks.map((task) => task.id));

  // Templates are dateless and personal-scope: dates, assignees, labels,
  // comments, attachments, reminders, and completion state do not transfer.
  const body = {
    version: 1,
    kind: "project-template" as const,
    name: access.project.name,
    color: access.project.color,
    sections: projectSections.map((section) => ({
      id: section.id,
      name: section.name,
      order: section.order,
    })),
    tasks: activeTasks.map((task) => ({
      id: task.id,
      sectionId: task.sectionId,
      // A completed parent is intentionally absent, so don't leave a dangling id.
      parentId: task.parentId && activeTaskIds.has(task.parentId) ? task.parentId : null,
      content: task.content,
      description: task.description,
      priority: task.priority,
      recurrence: task.recurrence,
      durationMinutes: task.durationMinutes,
      order: task.order,
    })),
  };

  return Response.json(body, {
    headers: {
      "Content-Disposition": `attachment; filename="${templateFilename(access.project.name)}"`,
    },
  });
}
