import { redirect } from "next/navigation";
import { and, count, eq, inArray, lte, sql } from "drizzle-orm";

import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { accessibleProjects } from "@/lib/db/access";
import { filters, labels, tasks, users } from "@/lib/db/schema";
import { ProjectSidebar } from "@/components/projects/project-sidebar";
import { KeyboardShortcuts } from "@/components/keyboard-shortcuts";
import { todayInTimezone } from "@/lib/dates";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  if (!user) redirect("/login");

  const [userProjects, userLabels, userFilters, [account]] = await Promise.all([
    accessibleProjects(user.id),
    db
      .select()
      .from(labels)
      .where(eq(labels.userId, user.id))
      .orderBy(labels.order),
    db
      .select()
      .from(filters)
      .where(eq(filters.userId, user.id))
      .orderBy(filters.order),
    db
      .select({
        username: users.username,
        name: users.name,
        image: users.image,
        timezone: users.timezone,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1),
  ]);
  if (!account) redirect("/login");

  // A shared project can be someone else's Inbox — mine is the unshared one.
  const inboxProjectId =
    userProjects.find((project) => project.isInbox && !project.shared)?.id ?? null;
  const today = todayInTimezone(account.timezone);
  const projectIds = userProjects.map((project) => project.id);
  const taskCounts = projectIds.length
    ? await db
      .select({
        projectId: tasks.projectId,
        count: count(),
        todayCount: sql<number>`count(*) filter (where ${lte(tasks.dueDate, today)})`,
      })
      .from(tasks)
      .where(and(inArray(tasks.projectId, projectIds), eq(tasks.isCompleted, false)))
      .groupBy(tasks.projectId)
    : [];
  const counts = Object.fromEntries(taskCounts.map(({ projectId, count }) => [projectId, count]));
  const todayCount = taskCounts.reduce((total, row) => total + Number(row.todayCount), 0);

  return (
    <div className="flex h-dvh flex-col md:flex-row">
      <KeyboardShortcuts inboxProjectId={inboxProjectId} />
      <ProjectSidebar
        initialProjects={userProjects}
        initialLabels={userLabels}
        initialFilters={userFilters}
        username={account.username}
        userName={account.name}
        hasAvatar={!!account.image}
        avatarVersion={String(account.updatedAt.getTime())}
        inboxProjectId={inboxProjectId}
        today={today}
        labels={userLabels}
        counts={counts}
        todayCount={todayCount}
      />
      <main className="flex-1 min-w-0 overflow-y-auto">{children}</main>
    </div>
  );
}
