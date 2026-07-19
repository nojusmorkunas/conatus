import { and, eq } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";

import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { labels, projects, sections, taskLabels, tasks } from "@/lib/db/schema";
import { importSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = importSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const data = parsed.data;

  const counts = await db.transaction(async (tx) => {
    const [inbox] = await tx
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.userId, user.id), eq(projects.isInbox, true)));

    const projectIdMap = new Map<string, string>();
    const exportedInbox = data.projects.find((project) => project.isInbox);
    if (exportedInbox && inbox) {
      projectIdMap.set(exportedInbox.id, inbox.id);
    }

    const newProjects = data.projects.filter((project) => !project.isInbox);
    if (newProjects.length) {
      const [last] = await tx
        .select({ order: projects.order })
        .from(projects)
        .where(eq(projects.userId, user.id))
        .orderBy(projects.order);
      let previousOrder = last?.order ?? null;
      const inserted = await tx
        .insert(projects)
        .values(
          newProjects.map((project) => {
            const order = generateKeyBetween(previousOrder, null);
            previousOrder = order;
            return {
              userId: user.id,
              name: project.name,
              color: project.color,
              order,
              isFavorite: project.isFavorite,
              isArchived: project.isArchived,
            };
          }),
        )
        .returning({ id: projects.id });
      newProjects.forEach((project, index) => {
        projectIdMap.set(project.id, inserted[index].id);
      });
    }

    const sectionIdMap = new Map<string, string>();
    if (data.sections.length) {
      const inserted = await tx
        .insert(sections)
        .values(
          data.sections.map((section) => ({
            projectId: projectIdMap.get(section.projectId)!,
            name: section.name,
            order: section.order,
          })),
        )
        .returning({ id: sections.id });
      data.sections.forEach((section, index) => {
        sectionIdMap.set(section.id, inserted[index].id);
      });
    }

    const existingLabels = await tx
      .select()
      .from(labels)
      .where(eq(labels.userId, user.id));
    const labelIdMap = new Map<string, string>();
    const labelsToCreate = data.labels.filter((label) => {
      const existing = existingLabels.find(
        (candidate) => candidate.name.toLowerCase() === label.name.toLowerCase(),
      );
      if (existing) {
        labelIdMap.set(label.id, existing.id);
        return false;
      }
      return true;
    });
    if (labelsToCreate.length) {
      const [last] = await tx
        .select({ order: labels.order })
        .from(labels)
        .where(eq(labels.userId, user.id))
        .orderBy(labels.order);
      let previousOrder = last?.order ?? null;
      const inserted = await tx
        .insert(labels)
        .values(
          labelsToCreate.map((label) => {
            const order = generateKeyBetween(previousOrder, null);
            previousOrder = order;
            return {
              userId: user.id,
              name: label.name,
              color: label.color,
              isFavorite: label.isFavorite,
              order,
            };
          }),
        )
        .returning({ id: labels.id });
      labelsToCreate.forEach((label, index) => {
        labelIdMap.set(label.id, inserted[index].id);
      });
    }

    const taskIdMap = new Map<string, string>();
    if (data.tasks.length) {
      const inserted = await tx
        .insert(tasks)
        .values(
          data.tasks.map((task) => ({
            userId: user.id,
            projectId: projectIdMap.get(task.projectId)!,
            sectionId: task.sectionId ? sectionIdMap.get(task.sectionId)! : null,
            // parentId is remapped in a second pass once every task has a new id.
            content: task.content,
            description: task.description,
            priority: task.priority,
            dueDate: task.dueDate,
            dueTime: task.dueTime,
            recurrence: task.recurrence,
            recurrenceEndDate: task.recurrenceEndDate,
            isCompleted: task.isCompleted,
            completedAt: task.completedAt ? new Date(task.completedAt) : null,
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

    if (data.taskLabels.length) {
      await tx.insert(taskLabels).values(
        data.taskLabels.map((taskLabel) => ({
          taskId: taskIdMap.get(taskLabel.taskId)!,
          labelId: labelIdMap.get(taskLabel.labelId)!,
        })),
      );
    }

    return {
      projects: newProjects.length,
      sections: data.sections.length,
      tasks: data.tasks.length,
      labels: labelsToCreate.length,
    };
  });

  return Response.json(counts, { status: 201 });
}
