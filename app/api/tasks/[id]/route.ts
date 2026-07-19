import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";

import { requireUser } from "@/lib/auth/session";
import { todayInTimezone } from "@/lib/dates";
import { db } from "@/lib/db";
import {
  isProjectMember,
  requireProjectAccess,
  requireTaskAccess,
} from "@/lib/db/access";
import { logActivity } from "@/lib/db/activity";
import { labels, projects, sections, taskLabels, tasks, users } from "@/lib/db/schema";
import { nextOccurrenceWithinEnd } from "@/lib/recurrence";
import { withLabels } from "@/lib/db/task-labels";
import { taskUpdateSchema } from "@/lib/validation";
import { MAX_TASK_DEPTH, subtreeIds, taskDepth, wouldCreateTaskCycle } from "@/lib/task-tree";

type Task = typeof tasks.$inferSelect;

function siblingScope(task: Pick<Task, "parentId" | "projectId" | "sectionId">) {
  return task.parentId
    ? eq(tasks.parentId, task.parentId)
    : and(
        eq(tasks.projectId, task.projectId),
        isNull(tasks.parentId),
        task.sectionId ? eq(tasks.sectionId, task.sectionId) : isNull(tasks.sectionId),
      );
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser("tasks:write");
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const task = await requireTaskAccess(user.id, id);
  if (!task) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const parsed = taskUpdateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  if ("completed" in parsed.data) {
    // Completing a recurring task advances it to the next occurrence
    // instead of archiving it.
    if (parsed.data.completed && task.recurrence && task.dueDate) {
      const [{ timezone }] = await db
        .select({ timezone: users.timezone })
        .from(users)
        .where(eq(users.id, user.id));
      const today = todayInTimezone(timezone);
      const nextDueDate = nextOccurrenceWithinEnd(
        task.recurrence,
        task.dueDate,
        today,
        task.recurrenceEndDate,
      );
      const recurrenceFinished = nextDueDate === null;
      const [updated] = await db
        .update(tasks)
        .set(
          recurrenceFinished
            ? { isCompleted: true, completedAt: new Date(), updatedAt: new Date() }
            : { dueDate: nextDueDate, updatedAt: new Date() },
        )
        .where(eq(tasks.id, id))
        .returning();

      const [project] = await db
        .select({ name: projects.name })
        .from(projects)
        .where(eq(projects.id, task.projectId));
      await logActivity({
        userId: user.id,
        type: "task.completed",
        taskContent: task.content,
        taskId: task.id,
        projectId: task.projectId,
        projectName: project?.name ?? "",
      });

      return Response.json(updated);
    }

    const [updated] = await db
      .update(tasks)
      .set({
        isCompleted: parsed.data.completed,
        completedAt: parsed.data.completed ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, id))
      .returning();

    const [project] = await db
      .select({ name: projects.name })
      .from(projects)
      .where(eq(projects.id, task.projectId));
    await logActivity({
      userId: user.id,
      type: parsed.data.completed ? "task.completed" : "task.uncompleted",
      taskContent: task.content,
      taskId: task.id,
      projectId: task.projectId,
      projectName: project?.name ?? "",
    });

    return Response.json(updated);
  }

  if ("labelIds" in parsed.data) {
    const { labelIds } = parsed.data;
    const owned = labelIds.length
      ? await db
          .select({ id: labels.id })
          .from(labels)
          .where(and(inArray(labels.id, labelIds), eq(labels.userId, user.id)))
      : [];
    if (owned.length !== labelIds.length) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    await db.delete(taskLabels).where(eq(taskLabels.taskId, id));
    if (labelIds.length) {
      await db
        .insert(taskLabels)
        .values(labelIds.map((labelId) => ({ taskId: id, labelId })));
    }

    const [updated] = await db
      .update(tasks)
      .set({ updatedAt: new Date() })
      .where(eq(tasks.id, id))
      .returning();
    const [withTaskLabels] = await withLabels([updated], user.id);
    return Response.json(withTaskLabels);
  }

  if ("afterId" in parsed.data) {
    const { afterId } = parsed.data;
    const parentId = parsed.data.parentId ?? null;
    let sectionId = parsed.data.sectionId;

    const projectTasks = await db
      .select({
        id: tasks.id,
        parentId: tasks.parentId,
        sectionId: tasks.sectionId,
        order: tasks.order,
      })
      .from(tasks)
      .where(eq(tasks.projectId, task.projectId));

    const descendants = subtreeIds(projectTasks, id);
    if (wouldCreateTaskCycle(projectTasks, id, parentId)) {
      return Response.json({ error: "A task cannot be moved below itself" }, { status: 400 });
    }

    if (parentId) {
      const parent = projectTasks.find((candidate) => candidate.id === parentId);
      if (!parent) {
        return Response.json({ error: "Not found" }, { status: 404 });
      }
      sectionId = parent.sectionId;
    }

    const movedDepth = parentId ? taskDepth(projectTasks, parentId) + 1 : 0;
    const currentDepth = taskDepth(projectTasks, id);
    const subtreeHeight = Math.max(
      ...projectTasks
        .filter((candidate) => descendants.has(candidate.id))
        .map((candidate) => taskDepth(projectTasks, candidate.id) - currentDepth),
      0,
    );
    if (!Number.isFinite(movedDepth) || movedDepth + subtreeHeight > MAX_TASK_DEPTH) {
      return Response.json(
        { error: `Tasks can be nested at most ${MAX_TASK_DEPTH + 1} levels deep` },
        { status: 400 },
      );
    }

    if (sectionId) {
      const [section] = await db
        .select({ id: sections.id })
        .from(sections)
        .where(and(eq(sections.id, sectionId), eq(sections.projectId, task.projectId)));
      if (!section) {
        return Response.json({ error: "Not found" }, { status: 404 });
      }
    }

    const siblings = await db
      .select({ id: tasks.id, order: tasks.order })
      .from(tasks)
      .where(siblingScope({ parentId, projectId: task.projectId, sectionId }))
      .orderBy(tasks.order);
    const others = siblings.filter((sibling) => sibling.id !== id);

    let index = 0;
    if (afterId) {
      index = others.findIndex((sibling) => sibling.id === afterId) + 1;
      if (index === 0) {
        return Response.json({ error: "Not found" }, { status: 404 });
      }
    }

    const descendantIds = [...descendants].filter((descendantId) => descendantId !== id);
    const [updated] = await db.transaction(async (tx) => {
      const moved = await tx
        .update(tasks)
        .set({
          sectionId,
          parentId,
          order: generateKeyBetween(
            others[index - 1]?.order ?? null,
            others[index]?.order ?? null,
          ),
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, id))
        .returning();
      if (descendantIds.length) {
        await tx
          .update(tasks)
          .set({ sectionId, updatedAt: new Date() })
          .where(inArray(tasks.id, descendantIds));
      }
      return moved;
    });
    return Response.json(updated);
  }

  if ("direction" in parsed.data) {
    const siblings = await db
      .select()
      .from(tasks)
      .where(siblingScope(task))
      .orderBy(tasks.order);
    const index = siblings.findIndex((sibling) => sibling.id === id);

    const swapIndex = parsed.data.direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= siblings.length) {
      return Response.json(task);
    }

    const [before, after] =
      parsed.data.direction === "up"
        ? [siblings[swapIndex - 1]?.order ?? null, siblings[swapIndex].order]
        : [siblings[swapIndex].order, siblings[swapIndex + 1]?.order ?? null];

    const [updated] = await db
      .update(tasks)
      .set({ order: generateKeyBetween(before, after), updatedAt: new Date() })
      .where(eq(tasks.id, id))
      .returning();
    return Response.json(updated);
  }

  const { projectId, sectionId, ...rest } = parsed.data;
  const targetProjectId = projectId ?? task.projectId;

  const targetDueDate = rest.dueDate === undefined ? task.dueDate : rest.dueDate;
  if (!targetDueDate) {
    rest.dueTime = null;
    rest.recurrence = null;
    rest.recurrenceEndDate = null;
  }
  const targetRecurrence = rest.recurrence === undefined ? task.recurrence : rest.recurrence;
  const targetRecurrenceEndDate =
    rest.recurrenceEndDate === undefined
      ? task.recurrenceEndDate
      : rest.recurrenceEndDate;
  if (!targetRecurrence) {
    rest.recurrenceEndDate = null;
  } else if (
    targetRecurrenceEndDate &&
    targetDueDate &&
    targetRecurrenceEndDate < targetDueDate
  ) {
    return Response.json(
      { error: "Repeat end date cannot be before the due date" },
      { status: 400 },
    );
  }

  if (projectId && projectId !== task.projectId) {
    if (!(await requireProjectAccess(user.id, projectId))) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
  }

  const projectChanged = targetProjectId !== task.projectId;
  const targetAssigneeId =
    rest.assigneeId === undefined ? task.assigneeId : rest.assigneeId;
  if (targetAssigneeId && !(await isProjectMember(targetAssigneeId, targetProjectId))) {
    if (projectChanged && rest.assigneeId === undefined) {
      // Like sections, assignments that do not belong to the target project
      // are silently dropped when a task moves between projects.
      rest.assigneeId = null;
    } else {
      return Response.json(
        { error: "Assignee must be a project member" },
        { status: 400 },
      );
    }
  }

  if (sectionId) {
    const [section] = await db
      .select({ id: sections.id })
      .from(sections)
      .where(and(eq(sections.id, sectionId), eq(sections.projectId, targetProjectId)));
    if (!section) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
  }

  // A project move drops sections from the old project; an explicit
  // sectionId still gets validated against the target project above.
  const targetSectionId =
    sectionId !== undefined ? sectionId : projectId ? null : task.sectionId;

  const movingLists = projectChanged || targetSectionId !== task.sectionId;

  let order = task.order;
  if (movingLists) {
    const [last] = await db
      .select({ order: tasks.order })
      .from(tasks)
      .where(
        siblingScope({
          parentId: task.parentId,
          projectId: targetProjectId,
          sectionId: targetSectionId,
        }),
      )
      .orderBy(desc(tasks.order))
      .limit(1);
    order = generateKeyBetween(last?.order ?? null, null);
  }

  const [updated] = await db
    .update(tasks)
    .set({
      ...rest,
      projectId: targetProjectId,
      sectionId: targetSectionId,
      order,
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, id))
    .returning();

  return Response.json(updated);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser("tasks:delete");
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const task = await requireTaskAccess(user.id, id);
  if (!task) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const [project] = await db
    .select({ name: projects.name })
    .from(projects)
    .where(eq(projects.id, task.projectId));

  await db.delete(tasks).where(eq(tasks.id, id));

  await logActivity({
    userId: user.id,
    type: "task.deleted",
    taskContent: task.content,
    taskId: null,
    projectId: task.projectId,
    projectName: project?.name ?? "",
  });

  return Response.json({ ok: true });
}
