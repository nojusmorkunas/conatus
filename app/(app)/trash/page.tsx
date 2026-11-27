import { and, desc, eq, isNotNull } from "drizzle-orm";

import { TrashList } from "@/components/trash/trash-list";
import { MobilePageHeader } from "@/components/projects/mobile-sidebar-trigger";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";

export default async function TrashPage() {
  const user = await requireUser();
  if (!user) return null;

  // The server's project list leaves out trashed projects, so the local copy only holds the ones trashed on this device.
  // The rest are read here, and restored through the server.
  const deletedProjects = await db
    .select({ id: projects.id, name: projects.name, parentId: projects.parentId, deletedAt: projects.deletedAt })
    .from(projects)
    .where(and(eq(projects.userId, user.id), isNotNull(projects.deletedAt)))
    .orderBy(desc(projects.deletedAt));

  const serverProjects = deletedProjects
    .filter((project) => !project.parentId || !deletedProjects.some((candidate) => candidate.id === project.parentId))
    .map((project) => ({ id: project.id, name: project.name, deletedAt: project.deletedAt!.toISOString() }));

  return (
    <div className="mx-auto w-full max-w-2xl px-3 py-6 sm:p-6">
      <MobilePageHeader className="mb-2">
        <h1 className="text-xl font-semibold">Trash</h1>
      </MobilePageHeader>
      <p className="mb-6 text-sm text-muted-foreground">Deleted projects and tasks stay here until you restore them.</p>
      <TrashList serverProjects={serverProjects} />
    </div>
  );
}
