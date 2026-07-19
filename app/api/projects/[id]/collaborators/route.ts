import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { normalizeUsername } from "@/lib/auth/registration";
import { db } from "@/lib/db";
import { requireProjectAccess } from "@/lib/db/access";
import {
  projectCollaborators,
  tasks,
  users,
} from "@/lib/db/schema";

const addSchema = z.object({ username: z.string().trim().min(1) });
const removeSchema = z.object({ userId: z.string().uuid() });

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
  if (access.role !== "owner") {
    return Response.json(
      { error: "Only the project owner can manage collaborators" },
      { status: 403 },
    );
  }

  const collaborators = await db
    .select({
      userId: projectCollaborators.userId,
      username: users.username,
      role: projectCollaborators.role,
      createdAt: projectCollaborators.createdAt,
    })
    .from(projectCollaborators)
    .innerJoin(users, eq(users.id, projectCollaborators.userId))
    .where(eq(projectCollaborators.projectId, id))
    .orderBy(projectCollaborators.createdAt);

  return Response.json({ collaborators });
}

export async function POST(
  request: Request,
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
  if (access.role !== "owner") {
    return Response.json(
      { error: "Only the project owner can manage collaborators" },
      { status: 403 },
    );
  }

  const parsed = addSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: "A username is required" }, { status: 400 });
  }

  const normalizedUsername = normalizeUsername(parsed.data.username);
  const [invited] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, normalizedUsername));
  if (!invited) {
    return Response.json(
      {
        error:
          "No account has that username. Ask the server administrator to create a signup link first.",
      },
      { status: 404 },
    );
  }
  if (invited.id === access.project.userId) {
    return Response.json(
      { error: "That user already owns this project" },
      { status: 409 },
    );
  }

  const inserted = await db
    .insert(projectCollaborators)
    .values({ projectId: id, userId: invited.id })
    .onConflictDoNothing()
    .returning();
  if (inserted.length === 0) {
    return Response.json(
      { error: "Already a collaborator" },
      { status: 409 },
    );
  }

  return Response.json(inserted[0], { status: 201 });
}

export async function DELETE(
  request: Request,
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

  const parsed = removeSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json(
      { error: "userId or invitationId is required" },
      { status: 400 },
    );
  }

  // Owners remove anyone; editors may only remove themselves (leave).
  if (access.role !== "owner" && parsed.data.userId !== user.id) {
    return Response.json(
      { error: "Only the project owner can remove other collaborators" },
      { status: 403 },
    );
  }

  const removed = await db
    .delete(projectCollaborators)
    .where(
      and(
        eq(projectCollaborators.projectId, id),
        eq(projectCollaborators.userId, parsed.data.userId),
      ),
    )
    .returning();
  if (removed.length === 0) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  // Removing a collaborator also removes assignments that would otherwise
  // point at someone who can no longer access this project's tasks.
  await db
    .update(tasks)
    .set({ assigneeId: null, updatedAt: new Date() })
    .where(
      and(eq(tasks.projectId, id), eq(tasks.assigneeId, parsed.data.userId)),
    );

  return Response.json({ ok: true });
}
