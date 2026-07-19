import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";

import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { isProjectMember, requireProjectAccess } from "@/lib/db/access";
import { logActivity } from "@/lib/db/activity";
import { sections, tasks } from "@/lib/db/schema";
import { withCommentCounts, withLabels } from "@/lib/db/task-labels";
import { taskCreateSchema } from "@/lib/validation";

export async function GET(request: Request) {
  const user = await requireUser("tasks:read");
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const projectId = new URL(request.url).searchParams.get("projectId");
  if (!projectId) {
    return Response.json({ error: "projectId is required" }, { status: 400 });
  }

  if (!(await requireProjectAccess(user.id, projectId))) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const projectTasks = await db
    .select()
    .from(tasks)
    .where(eq(tasks.projectId, projectId))
    .orderBy(tasks.order);

  return Response.json(
    await withCommentCounts(await withLabels(projectTasks, user.id)),
  );
}

export async function POST(request: Request) {
  const user = await requireUser("tasks:write");
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = taskCreateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const {
    projectId,
    assigneeId,
    sectionId,
    parentId,
    afterId,
    content,
    description,
    priority,
    dueDate,
    dueTime,
    recurrence,
    recurrenceEndDate,
    deadlineDate,
    durationMinutes,
  } = parsed.data;

  const access = await requireProjectAccess(user.id, projectId);
  if (!access) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  const project = access.project;

  if (assigneeId && !(await isProjectMember(assigneeId, projectId))) {
    return Response.json(
      { error: "Assignee must be a project member" },
      { status: 400 },
    );
  }

  let effectiveSectionId = sectionId ?? null;

  if (!parentId && sectionId) {
    const [section] = await db
      .select({ id: sections.id })
      .from(sections)
      .where(and(eq(sections.id, sectionId), eq(sections.projectId, projectId)));
    if (!section) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
  }

  if (parentId) {
    const [parent] = await db
      .select({ id: tasks.id, sectionId: tasks.sectionId })
      .from(tasks)
      .where(and(eq(tasks.id, parentId), eq(tasks.projectId, projectId)));
    if (!parent) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    effectiveSectionId = parent.sectionId;
  }

  // Order is scoped within siblings: under a parent task for subtasks,
  // otherwise within the section (or project root) they sit in.
  const siblingScope = parentId
    ? eq(tasks.parentId, parentId)
    : and(
        eq(tasks.projectId, projectId),
        isNull(tasks.parentId),
        effectiveSectionId ? eq(tasks.sectionId, effectiveSectionId) : isNull(tasks.sectionId),
      );

  let order: string;
  if ("afterId" in parsed.data) {
    const siblings = await db
      .select({ id: tasks.id, order: tasks.order })
      .from(tasks)
      .where(siblingScope)
      .orderBy(asc(tasks.order));
    let index = 0;
    if (afterId) {
      index = siblings.findIndex((sibling) => sibling.id === afterId) + 1;
      if (index === 0) {
        return Response.json({ error: "Not found" }, { status: 404 });
      }
    }
    order = generateKeyBetween(
      siblings[index - 1]?.order ?? null,
      siblings[index]?.order ?? null,
    );
  } else {
    const [last] = await db
      .select({ order: tasks.order })
      .from(tasks)
      .where(siblingScope)
      .orderBy(desc(tasks.order))
      .limit(1);
    order = generateKeyBetween(last?.order ?? null, null);
  }

  const [task] = await db
    .insert(tasks)
    .values({
      userId: user.id,
      projectId,
      assigneeId: assigneeId ?? null,
      sectionId: effectiveSectionId,
      parentId: parentId ?? null,
      content,
      description: description || null,
      priority,
      dueDate: dueDate ?? null,
      dueTime: dueTime ?? null,
      recurrence: recurrence ?? null,
      recurrenceEndDate: recurrenceEndDate ?? null,
      deadlineDate: deadlineDate ?? null,
      durationMinutes: durationMinutes ?? null,
      order,
    })
    .returning();

  await logActivity({
    userId: user.id,
    type: "task.created",
    taskContent: task.content,
    taskId: task.id,
    projectId: project.id,
    projectName: project.name,
  });

  return Response.json(task, { status: 201 });
}
