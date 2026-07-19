import { and, eq, inArray } from "drizzle-orm";

import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { labels, projects, sections, taskLabels, tasks } from "@/lib/db/schema";

export async function GET() {
  const user = await requireUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Export covers own projects only — tasks created in someone else's
  // shared project stay out so the file round-trips through import.
  const userProjects = await db
    .select()
    .from(projects)
    .where(eq(projects.userId, user.id));
  const projectIds = userProjects.map((project) => project.id);

  const userTasks = projectIds.length
    ? await db.select().from(tasks).where(inArray(tasks.projectId, projectIds))
    : [];
  const userLabels = await db
    .select()
    .from(labels)
    .where(eq(labels.userId, user.id));

  const userSections = projectIds.length
    ? await db.select().from(sections).where(inArray(sections.projectId, projectIds))
    : [];

  const taskIds = userTasks.map((task) => task.id);
  const labelIds = userLabels.map((label) => label.id);
  // Only links to the exporter's own labels — collaborators' label
  // assignments would dangle in the file.
  const userTaskLabels =
    taskIds.length && labelIds.length
      ? await db
          .select()
          .from(taskLabels)
          .where(
            and(
              inArray(taskLabels.taskId, taskIds),
              inArray(taskLabels.labelId, labelIds),
            ),
          )
      : [];

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const strip = <T extends { userId?: string }>({ userId, ...rest }: T) => rest;
  // Nested projects are a display preference, not part of portable project data.
  const stripProject = <T extends { userId?: string; parentId?: string | null }>(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    { userId, parentId, ...rest }: T,
  ) => rest;

  const body = {
    version: 1,
    exportedAt: new Date().toISOString(),
    projects: userProjects.map(stripProject),
    sections: userSections,
    tasks: userTasks.map(strip),
    labels: userLabels.map(strip),
    taskLabels: userTaskLabels,
  };

  return Response.json(body, {
    headers: {
      "Content-Disposition": 'attachment; filename="export.json"',
    },
  });
}
