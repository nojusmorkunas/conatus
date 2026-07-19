import { and, eq, ne } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";

import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { requireProjectAccess } from "@/lib/db/access";
import { logActivity } from "@/lib/db/activity";
import { validateProjectParent } from "@/lib/db/project-parent";
import { projects, sections } from "@/lib/db/schema";
import { projectUpdateSchema } from "@/lib/validation";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser("projects:read");
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const access = await requireProjectAccess(user.id, id);
  if (!access) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  const project = access.project;

  const projectSections = await db
    .select()
    .from(sections)
    .where(eq(sections.projectId, id))
    .orderBy(sections.order);

  return Response.json({ ...project, sections: projectSections });
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
  const access = await requireProjectAccess(user.id, id);
  if (!access) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  if (access.role !== "owner") {
    return Response.json(
      { error: "Only the project owner can edit the project" },
      { status: 403 },
    );
  }
  const project = access.project;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = projectUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  if (project.isInbox && parsed.data.name && parsed.data.name !== project.name) {
    return Response.json(
      { error: "Inbox can't be renamed" },
      { status: 400 },
    );
  }

  if (parsed.data.parentId !== undefined) {
    const parentError = await validateProjectParent(
      user.id,
      parsed.data.parentId,
      id,
    );
    if (parentError) {
      return Response.json({ error: parentError }, { status: 400 });
    }
  }

  const { afterId, favoriteAfterId, ...changes } = parsed.data;
  const targetParentId = changes.parentId === undefined ? project.parentId : changes.parentId;
  let order = project.order;
  if (afterId !== undefined) {
    const siblings = await db
      .select({ id: projects.id, order: projects.order, parentId: projects.parentId })
      .from(projects)
      .where(and(eq(projects.userId, user.id), ne(projects.id, id)))
      .orderBy(projects.order);
    const targetSiblings = siblings.filter((sibling) => sibling.parentId === targetParentId);
    const afterIndex = afterId === null
      ? -1
      : targetSiblings.findIndex((sibling) => sibling.id === afterId);
    if (afterId !== null && afterIndex < 0) {
      return Response.json({ error: "The project placement is invalid" }, { status: 400 });
    }
    order = generateKeyBetween(
      afterIndex < 0 ? null : targetSiblings[afterIndex].order,
      targetSiblings[afterIndex + 1]?.order ?? null,
    );
  }

  let favoriteOrder = project.favoriteOrder;
  if (favoriteAfterId !== undefined || (changes.isFavorite === true && !project.isFavorite)) {
    if (favoriteAfterId !== undefined && !project.isFavorite && changes.isFavorite !== true) {
      return Response.json({ error: "Only favorite projects can be reordered" }, { status: 400 });
    }
    const favoriteProjects = (await db
      .select({ id: projects.id, favoriteOrder: projects.favoriteOrder, order: projects.order })
      .from(projects)
      .where(and(eq(projects.userId, user.id), eq(projects.isFavorite, true), ne(projects.id, id))))
      .sort((a, b) => {
        const aOrder = a.favoriteOrder ?? a.order;
        const bOrder = b.favoriteOrder ?? b.order;
        return aOrder < bOrder ? -1 : 1;
      });
    const favoriteAfterIndex = favoriteAfterId === undefined
      ? favoriteProjects.length - 1
      : favoriteAfterId === null
        ? -1
        : favoriteProjects.findIndex((favorite) => favorite.id === favoriteAfterId);
    if (favoriteAfterId !== undefined && favoriteAfterId !== null && favoriteAfterIndex < 0) {
      return Response.json({ error: "The favorite placement is invalid" }, { status: 400 });
    }
    favoriteOrder = generateKeyBetween(
      favoriteAfterIndex < 0
        ? null
        : favoriteProjects[favoriteAfterIndex].favoriteOrder
          ?? favoriteProjects[favoriteAfterIndex].order,
      favoriteProjects[favoriteAfterIndex + 1]?.favoriteOrder
        ?? favoriteProjects[favoriteAfterIndex + 1]?.order
        ?? null,
    );
  }
  const [updated] = await db
    .update(projects)
    .set({ ...changes, order, favoriteOrder, updatedAt: new Date() })
    .where(eq(projects.id, id))
    .returning();

  if (parsed.data.isArchived === true && !project.isArchived) {
    await logActivity({
      userId: user.id,
      type: "project.archived",
      taskContent: updated.name,
      taskId: null,
      projectId: updated.id,
      projectName: updated.name,
    });
  }

  return Response.json(updated);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser("projects:delete");
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const access = await requireProjectAccess(user.id, id);
  if (!access) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  if (access.role !== "owner") {
    return Response.json(
      { error: "Only the project owner can delete the project" },
      { status: 403 },
    );
  }
  const project = access.project;

  if (project.isInbox) {
    return Response.json({ error: "Inbox can't be deleted" }, { status: 400 });
  }

  await db.delete(projects).where(eq(projects.id, id));

  await logActivity({
    userId: user.id,
    type: "project.deleted",
    taskContent: project.name,
    taskId: null,
    projectId: null,
    projectName: project.name,
  });

  return Response.json({ ok: true });
}
