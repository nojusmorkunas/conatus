import { notFound } from "next/navigation";
import { and, count, eq } from "drizzle-orm";

import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { requireProjectAccess } from "@/lib/db/access";
import { comments, labels, projectCollaborators, sections, tasks, users } from "@/lib/db/schema";
import { withCommentCounts, withLabels } from "@/lib/db/task-labels";
import { todayInTimezone } from "@/lib/dates";
import { ProjectView } from "@/components/projects/project-view";

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ task?: string | string[] }>;
}) {
  const user = await requireUser();
  if (!user) return null;

  const { id } = await params;
  const taskParam = (await searchParams).task;
  const initialDetailTaskId = typeof taskParam === "string" ? taskParam : undefined;
  const access = await requireProjectAccess(user.id, id);
  if (!access) notFound();
  const project = access.project;

  const [owner] = await db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(eq(users.id, project.userId));
  const collaborators = await db
    .select({ userId: projectCollaborators.userId, username: users.username })
    .from(projectCollaborators)
    .innerJoin(users, eq(users.id, projectCollaborators.userId))
    .where(eq(projectCollaborators.projectId, id))
    .orderBy(projectCollaborators.createdAt);
  const members = [
    { userId: owner.id, username: owner.username, role: "owner" as const },
    ...collaborators.map((member) => ({ ...member, role: "editor" as const })),
  ];

  const projectSections = await db
    .select()
    .from(sections)
    .where(and(eq(sections.projectId, id), eq(sections.isArchived, false)))
    .orderBy(sections.order);

  const projectTasks = await db
    .select()
    .from(tasks)
    .where(eq(tasks.projectId, id))
    .orderBy(tasks.order);

  const userLabels = await db
    .select()
    .from(labels)
    .where(eq(labels.userId, user.id))
    .orderBy(labels.order);

  const [projectCommentCount] = await db
    .select({ count: count() })
    .from(comments)
    .where(eq(comments.projectId, id));

  const [settings] = await db
    .select({ timezone: users.timezone, dateFormat: users.dateFormat })
    .from(users)
    .where(eq(users.id, user.id));

  return (
    <ProjectView
      project={project}
      role={access.role}
      members={members}
      currentUserId={user.id}
      projectCommentCount={projectCommentCount.count}
      sections={projectSections}
      tasks={await withCommentCounts(await withLabels(projectTasks, user.id))}
      labels={userLabels}
      today={todayInTimezone(settings.timezone)}
      dateFormat={settings.dateFormat}
      initialDetailTaskId={initialDetailTaskId}
    />
  );
}
