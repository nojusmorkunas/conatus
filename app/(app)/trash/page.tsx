import { and, desc, eq, isNotNull, isNull, or } from "drizzle-orm";

import { TrashList } from "@/components/trash/trash-list";
import { MobilePageHeader } from "@/components/projects/mobile-sidebar-trigger";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { projectCollaborators, projects, tasks } from "@/lib/db/schema";

export default async function TrashPage() {
  const user = await requireUser();
  if (!user) return null;

  const [deletedProjects, deletedTasks] = await Promise.all([
    db
      .select({ id: projects.id, name: projects.name, parentId: projects.parentId, deletedAt: projects.deletedAt })
      .from(projects)
      .where(and(eq(projects.userId, user.id), isNotNull(projects.deletedAt)))
      .orderBy(desc(projects.deletedAt)),
    db
      .select({
        id: tasks.id,
        content: tasks.content,
        parentId: tasks.parentId,
        projectName: projects.name,
        deletedAt: tasks.deletedAt,
      })
      .from(tasks)
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .leftJoin(
        projectCollaborators,
        and(eq(projectCollaborators.projectId, projects.id), eq(projectCollaborators.userId, user.id)),
      )
      .where(
        and(
          isNotNull(tasks.deletedAt),
          isNull(projects.deletedAt),
          or(eq(projects.userId, user.id), isNotNull(projectCollaborators.userId)),
        ),
      )
      .orderBy(desc(tasks.deletedAt)),
  ]);

  const visibleProjects = deletedProjects.filter(
    (project) => !project.parentId || !deletedProjects.some((candidate) => candidate.id === project.parentId),
  );
  const visibleTasks = deletedTasks.filter(
    (task) => !task.parentId || !deletedTasks.some((candidate) => candidate.id === task.parentId),
  );

  return (
    <div className="mx-auto w-full max-w-2xl px-3 py-6 sm:p-6">
      <MobilePageHeader className="mb-2">
        <h1 className="text-xl font-semibold">Trash</h1>
      </MobilePageHeader>
      <p className="mb-6 text-sm text-muted-foreground">Deleted projects and tasks stay here until you restore them.</p>
      <TrashList initialProjects={visibleProjects} initialTasks={visibleTasks} />
    </div>
  );
}
