"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { MobilePageHeader } from "@/components/projects/mobile-sidebar-trigger";
import { DueChip } from "@/components/tasks/task-chips";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { dateInTimezone, pastDateLabel } from "@/lib/dates";
import { StoreReady, useOnline, useSnapshot, useTodayDate } from "@/lib/offline/hooks";
import { cn } from "@/lib/utils";
import { matchComments, matchProjects, matchTasks, mergeComments, projectChoices, searchFilters, type CommentMatch, type SearchFilters } from "@/lib/search";

const STATUS_LABELS = {
  all: "Open and completed",
  open: "Open",
  completed: "Completed",
};

// The query comes from the address, so a page cached for another search still shows this one. The server's comment matches are only
// for the query it rendered.
export function SearchScreen({
  serverQuery,
  serverProject,
  timezone,
  dateFormat,
  serverComments,
}: {
  serverQuery: string;
  serverProject: string | null;
  timezone: string;
  dateFormat: string;
  serverComments: CommentMatch[];
}) {
  const params = useSearchParams();
  const query = params.get("q")?.trim() ?? "";
  const project = params.get("project");
  const status = params.get("status");
  const requested = useMemo(() => ({ project, status }), [project, status]);
  return (
    <>
      <MobilePageHeader>
        <h1 className="text-xl font-semibold">Search</h1>
      </MobilePageHeader>
      {query ? (
        <>
          <p className="mt-1 text-sm text-muted-foreground">
            Results for <span className="font-medium text-foreground">{query}</span>
          </p>
          <StoreReady fallback={<div className="mt-3 h-9 w-full animate-pulse rounded-md bg-muted" />}>
            <Results
              query={query}
              requested={requested}
              timezone={timezone}
              dateFormat={dateFormat}
              serverComments={query === serverQuery && project === serverProject ? serverComments : []}
            />
          </StoreReady>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Enter a search term in the sidebar to find tasks, projects and comments.</p>
      )}
    </>
  );
}

function Results({ query, requested, timezone, dateFormat, serverComments }: { query: string; requested: { project: string | null; status: string | null }; timezone: string; dateFormat: string; serverComments: CommentMatch[] }) {
  const taskRows = useSnapshot((snapshot) => snapshot.tasks);
  const projectRows = useSnapshot((snapshot) => snapshot.projects);
  const filters: SearchFilters = useMemo(
    () => searchFilters({ project: requested.project ?? undefined, status: requested.status ?? undefined }, [...projectRows.keys()]),
    [requested, projectRows],
  );
  const commentRows = useSnapshot((snapshot) => snapshot.comments);
  const today = useTodayDate();
  const online = useOnline();
  const projectOptions = useMemo(() => projectChoices(projectRows.values()), [projectRows]);
  const matchingTasks = useMemo(() => matchTasks(taskRows.values(), projectRows, query, filters), [taskRows, projectRows, query, filters]);
  const matchingProjects = useMemo(() => matchProjects(projectRows.values(), query, filters), [projectRows, query, filters]);
  const matchingComments = useMemo(
    () => mergeComments(matchComments(commentRows.values(), taskRows, projectRows, query, filters), online ? serverComments : []),
    [commentRows, taskRows, projectRows, query, filters, online, serverComments],
  );
  const hasResults = matchingTasks.length + matchingProjects.length + matchingComments.length > 0;

  return (
    <>
      <div className="mb-6">
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

      {!hasResults && <p className="text-sm text-muted-foreground">No results found.</p>}

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
                    {projectRows.get(task.projectId)?.name}
                  </span>
                </span>
                {task.isCompleted ? (
                  task.completedAt && (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      Completed {pastDateLabel(dateInTimezone(new Date(task.completedAt), timezone), today, dateFormat)}
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
    </>
  );
}

function SearchSection({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-1 text-sm font-medium text-muted-foreground">
        {title} ({count})
      </h2>
      <div className="flex flex-col gap-0.5">{children}</div>
    </section>
  );
}
