import { and, desc, eq } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";

import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { projects, sections, tasks } from "@/lib/db/schema";
import { templateSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = templateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const data = parsed.data;
  const result = await db.transaction(async (tx) => {
    // Name conflicts are intentionally scoped to projects this user owns.
    const [sameName, lastRows] = await Promise.all([
      tx
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.userId, user.id), eq(projects.name, data.name)))
        .limit(1),
      tx
        .select({ order: projects.order })
        .from(projects)
        .where(eq(projects.userId, user.id))
        .orderBy(desc(projects.order))
        .limit(1),
    ]);
    const [last] = lastRows;
    const [project] = await tx
      .insert(projects)
      .values({
        userId: user.id,
        name: sameName ? `${data.name} (copy)` : data.name,
        color: data.color,
        order: generateKeyBetween(last?.order ?? null, null),
      })
      .returning({ id: projects.id });

    const sectionIdMap = new Map<string, string>();
    if (data.sections.length) {
      const inserted = await tx
        .insert(sections)
        .values(
          data.sections.map((section) => ({
            projectId: project.id,
            name: section.name,
            order: section.order,
          })),
        )
        .returning({ id: sections.id });
      data.sections.forEach((section, index) => {
        sectionIdMap.set(section.id, inserted[index].id);
      });
    }

    const taskIdMap = new Map<string, string>();
    if (data.tasks.length) {
      const inserted = await tx
        .insert(tasks)
        .values(
          data.tasks.map((task) => ({
            userId: user.id,
            projectId: project.id,
            sectionId: task.sectionId ? sectionIdMap.get(task.sectionId)! : null,
            // Parent ids are patched after every replacement id exists.
            content: task.content,
            description: task.description,
            priority: task.priority,
            recurrence: task.recurrence,
            durationMinutes: task.durationMinutes,
            order: task.order,
          })),
        )
        .returning({ id: tasks.id });
      data.tasks.forEach((task, index) => {
        taskIdMap.set(task.id, inserted[index].id);
      });

      for (const task of data.tasks) {
        if (task.parentId) {
          await tx
            .update(tasks)
            .set({ parentId: taskIdMap.get(task.parentId)! })
            .where(eq(tasks.id, taskIdMap.get(task.id)!));
        }
      }
    }

    return { projectId: project.id, sections: data.sections.length, tasks: data.tasks.length };
  });

  return Response.json(result, { status: 201 });
}
