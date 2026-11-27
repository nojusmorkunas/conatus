import { eq, count } from "drizzle-orm";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { requireProjectAccess } from "@/lib/db/access";
import { comments, projectCollaborators, users } from "@/lib/db/schema";
import { loadProjectTasks } from "@/lib/db/project-tasks";
import { ProjectScreen } from "@/components/projects/project-screen";

function decoded(id: string) {
  try {
    return decodeURIComponent(id);
  } catch {
    return id;
  }
}

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return null;

  const id = decoded((await params).id);
  const [settings] = await db
    .select({ timezone: users.timezone, dateFormat: users.dateFormat })
    .from(users)
    .where(eq(users.id, user.id));

  // The project itself comes from the browser's local copy. Only what that copy lacks is read
  // here, and only for a project the server knows: one made offline has an id that isn't a uuid yet.
  const access = z.uuid().safeParse(id).success ? await requireProjectAccess(user, id) : null;
  let members: { userId: string; username: string; role: "owner" | "editor" }[] = [];
  let projectCommentCount = 0;
  // Archived projects never reach the local copy, so the page carries the one thing it can show.
  let archived: { id: string; name: string; tasks: { id: string; content: string }[] } | null = null;
  if (access?.project.isArchived) {
    const rows = await loadProjectTasks(id, user.id);
    archived = { id, name: access.project.name, tasks: rows.filter((task) => !task.isCompleted).map(({ id, content }) => ({ id, content })) };
  }
  if (access) {
    const [owner] = await db
      .select({ id: users.id, username: users.username })
      .from(users)
      .where(eq(users.id, access.project.userId));
    const collaborators = await db
      .select({ userId: projectCollaborators.userId, username: users.username })
      .from(projectCollaborators)
      .innerJoin(users, eq(users.id, projectCollaborators.userId))
      .where(eq(projectCollaborators.projectId, id))
      .orderBy(projectCollaborators.createdAt);
    members = [
      { userId: owner.id, username: owner.username, role: "owner" },
      ...collaborators.map((member) => ({ ...member, role: "editor" as const })),
    ];
    [{ count: projectCommentCount }] = await db.select({ count: count() }).from(comments).where(eq(comments.projectId, id));
  }

  return (
    <ProjectScreen
      serverProjectId={id}
      role={access?.role ?? "owner"}
      members={members}
      currentUserId={user.id}
      projectCommentCount={projectCommentCount}
      archived={archived}
      dateFormat={settings.dateFormat}
      timezone={settings.timezone}
    />
  );
}
