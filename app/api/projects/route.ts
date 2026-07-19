import { desc, eq } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";

import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { accessibleProjects } from "@/lib/db/access";
import { logActivity } from "@/lib/db/activity";
import { validateProjectParent } from "@/lib/db/project-parent";
import { projects } from "@/lib/db/schema";
import { projectCreateSchema } from "@/lib/validation";

export async function GET() {
  const user = await requireUser("projects:read");
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return Response.json(await accessibleProjects(user.id));
}

export async function POST(request: Request) {
  const user = await requireUser("projects:write");
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = projectCreateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  if (parsed.data.parentId) {
    const parentError = await validateProjectParent(user.id, parsed.data.parentId);
    if (parentError) {
      return Response.json({ error: parentError }, { status: 400 });
    }
  }

  const [last] = await db
    .select({ order: projects.order })
    .from(projects)
    .where(eq(projects.userId, user.id))
    .orderBy(desc(projects.order))
    .limit(1);

  const [project] = await db
    .insert(projects)
    .values({
      userId: user.id,
      name: parsed.data.name,
      icon: parsed.data.icon ?? null,
      color: parsed.data.color,
      parentId: parsed.data.parentId ?? null,
      order: generateKeyBetween(last?.order ?? null, null),
    })
    .returning();

  await logActivity({
    userId: user.id,
    type: "project.created",
    taskContent: project.name,
    taskId: null,
    projectId: project.id,
    projectName: project.name,
  });

  return Response.json(project, { status: 201 });
}
