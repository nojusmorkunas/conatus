import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { getRequestOrigin } from "@/lib/auth/origin";
import { createRegistrationInvite } from "@/lib/auth/registration";
import { db } from "@/lib/db";
import { requireProjectAccess } from "@/lib/db/access";
import {
  projectCollaborators,
  projectInvitations,
  tasks,
  users,
} from "@/lib/db/schema";
import { transporter } from "@/lib/mailer";

const addSchema = z.object({ email: z.string().email() });
const removeSchema = z.union([
  z.object({ userId: z.string().uuid() }),
  z.object({ invitationId: z.string().uuid() }),
]);

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
      email: users.email,
      role: projectCollaborators.role,
      createdAt: projectCollaborators.createdAt,
    })
    .from(projectCollaborators)
    .innerJoin(users, eq(users.id, projectCollaborators.userId))
    .where(eq(projectCollaborators.projectId, id))
    .orderBy(projectCollaborators.createdAt);

  const invitations = await db
    .select({
      id: projectInvitations.id,
      email: projectInvitations.email,
      role: projectInvitations.role,
      createdAt: projectInvitations.createdAt,
    })
    .from(projectInvitations)
    .where(eq(projectInvitations.projectId, id))
    .orderBy(projectInvitations.createdAt);

  return Response.json({ collaborators, invitations });
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
    return Response.json({ error: "A valid email is required" }, { status: 400 });
  }

  const normalizedEmail = parsed.data.email.trim().toLowerCase();
  const [invited] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, normalizedEmail));
  if (!invited) {
    const [inviter] = await db
      .select({ email: users.email, instanceRole: users.instanceRole })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);
    if (inviter?.instanceRole !== "admin") {
      return Response.json(
        {
          error:
            "Only the server administrator can invite someone who does not have an account yet.",
        },
        { status: 403 },
      );
    }
    const inserted = await db
      .insert(projectInvitations)
      .values({
        projectId: id,
        email: normalizedEmail,
        invitedByUserId: user.id,
      })
      .onConflictDoNothing()
      .returning({ id: projectInvitations.id });
    if (inserted.length === 0) {
      return Response.json({ error: "Already invited" }, { status: 409 });
    }

    const { rawToken } = await createRegistrationInvite({
      createdByUserId: user.id,
      email: normalizedEmail,
    });

    try {
      const origin = getRequestOrigin(request);
      if (!origin) throw new Error("Project invitation origin is not configured");
      const link = `${origin}/register?invite=${encodeURIComponent(rawToken)}`;
      const message = `${inviter?.email ?? "A project owner"} invited you to collaborate on "${access.project.name}". Sign up to accept.`;
      await transporter.sendMail({
        from: process.env.SMTP_FROM,
        to: normalizedEmail,
        subject: `Invitation to collaborate on ${access.project.name}`,
        text: `${message}\n\n${link}`,
      });
    } catch (error) {
      console.error("project invitation send failed", inserted[0].id, error);
    }

    return Response.json(
      { pending: true, email: normalizedEmail },
      { status: 201 },
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

  if ("invitationId" in parsed.data) {
    if (access.role !== "owner") {
      return Response.json(
        { error: "Only the project owner can revoke invitations" },
        { status: 403 },
      );
    }
    const revoked = await db
      .delete(projectInvitations)
      .where(
        and(
          eq(projectInvitations.projectId, id),
          eq(projectInvitations.id, parsed.data.invitationId),
        ),
      )
      .returning({ id: projectInvitations.id });
    if (revoked.length === 0) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    return Response.json({ ok: true });
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
