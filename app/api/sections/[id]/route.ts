import { eq, inArray } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";

import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { requireProjectAccess } from "@/lib/db/access";
import { sections, taskLabels, tasks } from "@/lib/db/schema";
import { sectionUpdateSchema } from "@/lib/validation";

async function accessibleSection(userId: string, sectionId: string) {
  const [section] = await db
    .select()
    .from(sections)
    .where(eq(sections.id, sectionId));
  if (!section || !(await requireProjectAccess(userId, section.projectId))) {
    return undefined;
  }
  return section;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser("projects:write");
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const section = await accessibleSection(user.id, id);
  if (!section) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const parsed = sectionUpdateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  if ("projectId" in parsed.data) {
    const targetProjectId = parsed.data.projectId;
    if (!(await requireProjectAccess(user.id, targetProjectId))) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    const targetSections = await db.select().from(sections)
      .where(eq(sections.projectId, targetProjectId)).orderBy(sections.order);
    const order = generateKeyBetween(targetSections.at(-1)?.order ?? null, null);
    const [updated] = await db.transaction(async (tx) => {
      const moved = await tx.update(sections)
        .set({ projectId: targetProjectId, order, updatedAt: new Date() })
        .where(eq(sections.id, id)).returning();
      await tx.update(tasks).set({ projectId: targetProjectId, updatedAt: new Date() })
        .where(eq(tasks.sectionId, id));
      return moved;
    });
    return Response.json(updated);
  }

  if ("isArchived" in parsed.data) {
    const [updated] = await db.update(sections)
      .set({ isArchived: parsed.data.isArchived, updatedAt: new Date() })
      .where(eq(sections.id, id)).returning();
    return Response.json(updated);
  }

  if ("duplicate" in parsed.data) {
    const siblings = await db.select().from(sections)
      .where(eq(sections.projectId, section.projectId)).orderBy(sections.order);
    const index = siblings.findIndex((candidate) => candidate.id === id);
    const sourceTasks = await db.select().from(tasks)
      .where(eq(tasks.sectionId, id)).orderBy(tasks.order);
    const sourceIds = sourceTasks.map((task) => task.id);
    const labels = sourceIds.length
      ? await db.select().from(taskLabels).where(inArray(taskLabels.taskId, sourceIds))
      : [];

    const duplicate = await db.transaction(async (tx) => {
      const [newSection] = await tx.insert(sections).values({
        projectId: section.projectId,
        name: `${section.name} (copy)`,
        order: generateKeyBetween(section.order, siblings[index + 1]?.order ?? null),
      }).returning();
      const idMap = new Map<string, string>();
      for (const task of sourceTasks) {
        const [copy] = await tx.insert(tasks).values({
          userId: task.userId,
          projectId: task.projectId,
          assigneeId: task.assigneeId,
          sectionId: newSection.id,
          parentId: null,
          content: task.content,
          description: task.description,
          priority: task.priority,
          dueDate: task.dueDate,
          dueTime: task.dueTime,
          deadlineDate: task.deadlineDate,
          recurrence: task.recurrence,
          durationMinutes: task.durationMinutes,
          isCompleted: task.isCompleted,
          completedAt: task.completedAt,
          order: task.order,
        }).returning({ id: tasks.id });
        idMap.set(task.id, copy.id);
      }
      for (const task of sourceTasks) {
        if (!task.parentId) continue;
        await tx.update(tasks).set({ parentId: idMap.get(task.parentId) ?? null })
          .where(eq(tasks.id, idMap.get(task.id)!));
      }
      if (labels.length) {
        await tx.insert(taskLabels).values(labels.map((label) => ({
          taskId: idMap.get(label.taskId)!, labelId: label.labelId,
        })));
      }
      return newSection;
    });
    return Response.json(duplicate, { status: 201 });
  }

  if ("name" in parsed.data) {
    const [updated] = await db
      .update(sections)
      .set({ name: parsed.data.name, updatedAt: new Date() })
      .where(eq(sections.id, id))
      .returning();
    return Response.json(updated);
  }

  const siblings = await db
    .select()
    .from(sections)
    .where(eq(sections.projectId, section.projectId))
    .orderBy(sections.order);

  if ("afterId" in parsed.data) {
    const { afterId } = parsed.data;
    const others = siblings.filter((sibling) => sibling.id !== id);
    let index = 0;
    if (afterId) {
      index = others.findIndex((sibling) => sibling.id === afterId) + 1;
      if (index === 0) {
        return Response.json({ error: "Not found" }, { status: 404 });
      }
    }

    const [updated] = await db
      .update(sections)
      .set({
        order: generateKeyBetween(
          others[index - 1]?.order ?? null,
          others[index]?.order ?? null,
        ),
        updatedAt: new Date(),
      })
      .where(eq(sections.id, id))
      .returning();
    return Response.json(updated);
  }

  const index = siblings.findIndex((sibling) => sibling.id === id);

  const swapIndex =
    parsed.data.direction === "up" ? index - 1 : index + 1;
  if (swapIndex < 0 || swapIndex >= siblings.length) {
    return Response.json(section);
  }

  const [before, after] =
    parsed.data.direction === "up"
      ? [siblings[swapIndex - 1]?.order ?? null, siblings[swapIndex].order]
      : [siblings[swapIndex].order, siblings[swapIndex + 1]?.order ?? null];

  const [updated] = await db
    .update(sections)
    .set({ order: generateKeyBetween(before, after), updatedAt: new Date() })
    .where(eq(sections.id, id))
    .returning();

  return Response.json(updated);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser("projects:write");
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const section = await accessibleSection(user.id, id);
  if (!section) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  await db.delete(sections).where(eq(sections.id, id));

  return Response.json({ ok: true });
}
