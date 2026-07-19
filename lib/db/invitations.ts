import { eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  projectCollaborators,
  projectInvitations,
  projects,
} from "@/lib/db/schema";

type InvitationClient = Pick<typeof db, "select" | "insert" | "delete">;

export async function acceptProjectInvitations(
  client: InvitationClient,
  { userId, email }: { userId: string; email: string },
) {
  const normalizedEmail = email.trim().toLowerCase();
  const invitations = await client
    .select({
      id: projectInvitations.id,
      projectId: projectInvitations.projectId,
      role: projectInvitations.role,
      ownerUserId: projects.userId,
    })
    .from(projectInvitations)
    .innerJoin(projects, eq(projects.id, projectInvitations.projectId))
    .where(eq(projectInvitations.email, normalizedEmail));

  if (invitations.length === 0) return;

  for (const invitation of invitations) {
    if (invitation.ownerUserId === userId) continue;
    await client
      .insert(projectCollaborators)
      .values({
        projectId: invitation.projectId,
        userId,
        role: invitation.role,
      })
      .onConflictDoNothing();
  }

  await client
    .delete(projectInvitations)
    .where(inArray(projectInvitations.id, invitations.map(({ id }) => id)));
}
