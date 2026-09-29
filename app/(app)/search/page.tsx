import Link from "next/link";
import { and, asc, desc, eq, ilike, inArray, isNull, or } from "drizzle-orm";

import { DueChip } from "@/components/tasks/task-chips";
import { MobilePageHeader } from "@/components/projects/mobile-sidebar-trigger";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { accessibleProjectIds } from "@/lib/db/access";
import { comments, projects, tasks, users } from "@/lib/db/schema";
import { dateInTimezone, pastDateLabel, todayInTimezone } from "@/lib/dates";
import { escapeLike, searchFilters } from "@/lib/search";
import { cn } from "@/lib/utils";

const LIMIT = 50;

const STATUS_LABELS = {
  all: "Open and completed",
  open: "Open",
  completed: "Completed",
};

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

  if (!query) {
    return (
      <div className="mx-auto w-full max-w-4xl px-3 py-2 sm:p-6">
        <MobilePageHeader className="mb-2">
          <h1 className="text-xl font-semibold">Search</h1>
        </MobilePageHeader>
        <p className="text-sm text-muted-foreground">
          Enter a search term in the sidebar to find tasks, projects and comments.
        </p>
      </div>
    );
  }

  const [projectIds, settings] = await Promise.all([
    accessibleProjectIds(user.id),
    db
      .select({ timezone: users.timezone, dateFormat: users.dateFormat })
      .from(users)
      .where(eq(users.id, user.id))
      .then(([row]) => row),
  ]);
  const pattern = `%${escapeLike(query)}%`;
  const filters = searchFilters(params, projectIds);

  const [projectOptions, matchingTasks, matchingProjects, matchingComments] = await Promise.all([
    db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(inArray(projects.id, projectIds))
      .orderBy(asc(projects.name)),
    db
      .select({
        id: tasks.id,
        content: tasks.content,
        projectId: tasks.projectId,
        projectName: projects.name,
        dueDate: tasks.dueDate,
        dueTime: tasks.dueTime,
        recurrence: tasks.recurrence,
        recurrenceEndDate: tasks.recurrenceEndDate,
        isCompleted: tasks.isCompleted,
        completedAt: tasks.completedAt,
      })
      .from(tasks)
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .where(
        and(
          inArray(tasks.projectId, projectIds),
          filters.project ? eq(tasks.projectId, filters.project) : undefined,
          filters.status === "all" ? undefined : eq(tasks.isCompleted, filters.status === "completed"),
          isNull(tasks.deletedAt),
          or(ilike(tasks.content, pattern), ilike(tasks.description, pattern)),
        ),
      )
      .orderBy(
        ...(filters.status === "completed"
          ? [desc(tasks.completedAt)]
          : [asc(tasks.isCompleted), asc(tasks.dueDate), desc(tasks.completedAt)]),
      )
      .limit(LIMIT),
    // Inside one project, other projects' names are noise.
    filters.project
      ? []
      : db
          .select({ id: projects.id, name: projects.name })
          .from(projects)
          .where(and(inArray(projects.id, projectIds), ilike(projects.name, pattern)))
          .orderBy(asc(projects.name))
          .limit(LIMIT),
    db
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
          ilike(comments.content, pattern),
        ),
      )
      .orderBy(desc(comments.createdAt))
      .limit(LIMIT),
  ]);

  const timezone = settings?.timezone ?? "UTC";
  const today = todayInTimezone(timezone);
  const dateFormat = settings?.dateFormat ?? "yyyy-MM-dd";
  const hasResults = matchingTasks.length + matchingProjects.length + matchingComments.length > 0;

  return (
    <div className="mx-auto w-full max-w-4xl px-3 py-2 sm:p-6">
      <div className="mb-6">
        <MobilePageHeader>
          <h1 className="text-xl font-semibold">Search</h1>
        </MobilePageHeader>
        <p className="mt-1 text-sm text-muted-foreground">
          Results for <span className="font-medium text-foreground">{query}</span>
        </p>
        <form action="/search" className="mt-3 flex flex-wrap items-center gap-2">
          <input type="hidden" name="q" value={query} />
          <Select
            name="project"
            defaultValue={filters.project ?? "all"}
            items={{ all: "All projects", ...Object.fromEntries(projectOptions.map((project) => [project.id, project.name])) }}
          >
            <SelectTrigger className="w-48" aria-label="Project">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All projects</SelectItem>
              {projectOptions.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select name="status" defaultValue={filters.status} items={STATUS_LABELS}>
            <SelectTrigger className="w-48" aria-label="Task status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="submit" variant="outline" size="sm">
            Filter
          </Button>
        </form>
      </div>

      {!hasResults && (
        <p className="text-sm text-muted-foreground">No results found.</p>
      )}

      <div className="flex flex-col gap-6">
        {matchingTasks.length > 0 && (
          <SearchSection title="Tasks" count={matchingTasks.length}>
            {matchingTasks.map((task) => (
              <Link
                key={task.id}
                href={`/projects/${task.projectId}?task=${task.id}`}
                className="flex items-start gap-3 rounded-md px-2 py-2 hover:bg-muted/50"
              >
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block truncate text-base sm:text-sm",
                      task.isCompleted && "text-muted-foreground line-through",
                    )}
                  >
                    {task.content}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {task.projectName}
                  </span>
                </span>
                {task.isCompleted ? (
                  task.completedAt && (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      Completed {pastDateLabel(dateInTimezone(task.completedAt, timezone), today, dateFormat)}
                    </span>
                  )
                ) : (
                  task.dueDate && <DueChip task={task} today={today} dateFormat={dateFormat} />
                )}
              </Link>
            ))}
          </SearchSection>
        )}

        {matchingProjects.length > 0 && (
          <SearchSection title="Projects" count={matchingProjects.length}>
            {matchingProjects.map((project) => (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="block rounded-md px-2 py-2 text-base hover:bg-muted/50 sm:text-sm"
              >
                {project.name}
              </Link>
            ))}
          </SearchSection>
        )}

        {matchingComments.length > 0 && (
          <SearchSection title="Comments" count={matchingComments.length}>
            {matchingComments.map((comment) => (
              <Link
                key={comment.id}
                href={`/projects/${comment.projectId}`}
                className="block rounded-md px-2 py-2 hover:bg-muted/50"
              >
                <p className="line-clamp-2 text-sm">{comment.content}</p>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {comment.taskContent} · {comment.projectName}
                </p>
              </Link>
            ))}
          </SearchSection>
        )}
      </div>
    </div>
  );
}

function SearchSection({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-1 text-sm font-medium text-muted-foreground">
        {title} ({count})
      </h2>
      <div className="flex flex-col gap-0.5">{children}</div>
    </section>
  );
}
