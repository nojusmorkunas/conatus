import { and, desc, eq, ilike, inArray, isNull } from "drizzle-orm";

import { SearchScreen } from "@/components/search/search-screen";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { accessibleProjectIds } from "@/lib/db/access";
import { comments, projects, tasks, users } from "@/lib/db/schema";
import { escapeLike, searchFilters, SEARCH_LIMIT } from "@/lib/search";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string | string[];
    project?: string | string[];
    status?: string | string[];
  }>;
}) {
  const user = await requireUser();
  if (!user) return null;

  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim() : "";

  const [projectIds, settings] = await Promise.all([
    accessibleProjectIds(user),
    db
      .select({ timezone: users.timezone, dateFormat: users.dateFormat })
      .from(users)
      .where(eq(users.id, user.id))
      .then(([row]) => row),
  ]);
  const filters = searchFilters(params, projectIds);

  // Comments are in the local copy only for tasks that were opened, so the server's matches are merged in on the client when online.
  const matchingComments = !query ? [] : await db
    .select({
      id: comments.id,
      content: comments.content,
      createdAt: comments.createdAt,
      taskContent: tasks.content,
      projectId: projects.id,
      projectName: projects.name,
    })
    .from(comments)
    .innerJoin(tasks, eq(tasks.id, comments.taskId))
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .where(
      and(
        inArray(tasks.projectId, projectIds),
        filters.project ? eq(tasks.projectId, filters.project) : undefined,
        isNull(tasks.deletedAt),
        ilike(comments.content, `%${escapeLike(query)}%`),
      ),
    )
    .orderBy(desc(comments.createdAt))
    .limit(SEARCH_LIMIT);

  return (
    <div className="mx-auto w-full max-w-4xl px-3 py-2 sm:p-6">
      <SearchScreen
        serverQuery={query}
        serverProject={filters.project}
        timezone={settings?.timezone ?? "UTC"}
        dateFormat={settings?.dateFormat ?? "yyyy-MM-dd"}
        serverComments={matchingComments.map((comment) => ({ ...comment, createdAt: comment.createdAt.toISOString() }))}
      />
    </div>
  );
}
