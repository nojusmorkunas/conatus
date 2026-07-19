import { eq } from "drizzle-orm";

import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { requireProjectAccess, requireTaskAccess } from "@/lib/db/access";
import { logActivity } from "@/lib/db/activity";
import { comments, projects } from "@/lib/db/schema";
import { commentCreateSchema } from "@/lib/validation";

export async function GET(request: Request) {
  const user = await requireUser("comments:read");
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const taskId = params.get("taskId");
  const projectId = params.get("projectId");
  if (Boolean(taskId) === Boolean(projectId)) {
    return Response.json({ error: "Exactly one of taskId or projectId is required" }, { status: 400 });
  }

  const scope = taskId
    ? await requireTaskAccess(user.id, taskId)
    : await requireProjectAccess(user.id, projectId!);
  if (!scope) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const scopeComments = await db
    .select()
    .from(comments)
    .where(taskId ? eq(comments.taskId, taskId) : eq(comments.projectId, projectId!))
    .orderBy(comments.createdAt);

  return Response.json(scopeComments);
}

export async function POST(request: Request) {
  const user = await requireUser("comments:write");
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = commentCreateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { taskId, projectId, content } = parsed.data;

  if (taskId) {
    const task = await requireTaskAccess(user.id, taskId);
    if (!task) return Response.json({ error: "Not found" }, { status: 404 });

    const [comment] = await db
      .insert(comments)
      .values({ taskId, userId: user.id, content })
      .returning();
    const [project] = await db
      .select({ name: projects.name })
      .from(projects)
      .where(eq(projects.id, task.projectId));
    await logActivity({
      userId: user.id,
      type: "comment.added",
      taskContent: task.content,
      taskId: task.id,
      projectId: task.projectId,
      projectName: project?.name ?? "",
    });
    return Response.json(comment, { status: 201 });
  }

  const access = await requireProjectAccess(user.id, projectId!);
  if (!access) return Response.json({ error: "Not found" }, { status: 404 });

  const [comment] = await db
    .insert(comments)
    .values({ projectId: projectId!, userId: user.id, content })
    .returning();
  // Project comments have no task; the short snippet keeps the required activity snapshot honest.
  await logActivity({
    userId: user.id,
    type: "comment.added",
    taskContent: content.slice(0, 60),
    projectId: projectId!,
    projectName: access.project.name,
  });

  return Response.json(comment, { status: 201 });
}
