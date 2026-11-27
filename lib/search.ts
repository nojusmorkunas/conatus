import type { CommentEntity, ProjectEntity, TaskEntity } from "@/lib/offline/types";
import { isVisibleProject, visibleProjects } from "@/lib/task-views";

// ponytail: replace leading-wildcard ILIKE search with PostgreSQL FTS (GIN + tsvector) when scale needs it.
export function escapeLike(value: string) {
  const slash = String.fromCharCode(92);
  return value.replace(/[\\\\%_]/g, slash + "$&");
}

export type SearchStatus = "all" | "open" | "completed";

// Anything unrecognised, including a project the user can't access, falls
// back to searching everything rather than erroring.
export function searchFilters(
  params: { project?: string | string[]; status?: string | string[] },
  projectIds: string[],
): { project: string | null; status: SearchStatus } {
  const project =
    typeof params.project === "string" && projectIds.includes(params.project)
      ? params.project
      : null;
  const status =
    params.status === "open" || params.status === "completed" ? params.status : "all";
  return { project, status };
}

/** The search page lists this many of each kind, as its queries did. */
export const SEARCH_LIMIT = 50;

export type SearchFilters = { project: string | null; status: SearchStatus };

export type CommentMatch = { id: string; content: string; createdAt: string; taskContent: string; projectId: string; projectName: string };

const contains = (text: string, needle: string) => text.toLowerCase().includes(needle);
const descending = (a: string, b: string) => (a < b ? 1 : a > b ? -1 : 0);
// Postgres sorts NULL last when ascending, and the search query relied on that.
const ascendingNullsLast = (a: string | null, b: string | null) => (a === b ? 0 : a === null ? 1 : b === null ? -1 : a < b ? -1 : 1);

/** Completed tasks newest first; otherwise open before completed, then by due date, then newest completion. */
const taskOrder = (status: SearchStatus) => (a: TaskEntity, b: TaskEntity) =>
  status === "completed"
    ? descending(a.completedAt ?? "", b.completedAt ?? "")
    : Number(a.isCompleted) - Number(b.isCompleted) || ascendingNullsLast(a.dueDate, b.dueDate) || descending(a.completedAt ?? "", b.completedAt ?? "");

/** Tasks of visible projects whose content or description contains [query], ignoring case. */
export function matchTasks(tasks: Iterable<TaskEntity>, projects: ReadonlyMap<string, ProjectEntity>, query: string, filters: SearchFilters): TaskEntity[] {
  const needle = query.toLowerCase();
  const found: TaskEntity[] = [];
  for (const task of tasks) {
    if (task.deletedAt !== null) continue;
    const project = projects.get(task.projectId);
    if (!project || !isVisibleProject(project)) continue;
    if (filters.project && task.projectId !== filters.project) continue;
    if (filters.status === "open" && task.isCompleted) continue;
    if (filters.status === "completed" && !task.isCompleted) continue;
    if (contains(task.content, needle) || contains(task.description, needle)) found.push(task);
  }
  return found.sort(taskOrder(filters.status)).slice(0, SEARCH_LIMIT);
}

/** Visible projects whose name contains [query], by name. Nothing when the search is already inside one project. */
export function matchProjects(projects: Iterable<ProjectEntity>, query: string, filters: SearchFilters): ProjectEntity[] {
  if (filters.project) return [];
  const needle = query.toLowerCase();
  return [...projects].filter((project) => isVisibleProject(project) && contains(project.name, needle)).sort((a, b) => a.name.localeCompare(b.name)).slice(0, SEARCH_LIMIT);
}

/** The projects the filter menu offers, by name. */
export const projectChoices = (projects: Iterable<ProjectEntity>) => visibleProjects(projects).sort((a, b) => a.name.localeCompare(b.name));

/** Task comments, in tasks of visible projects that aren't in Trash, that contain [query], newest first. Only the comments the local copy holds. */
export function matchComments(comments: Iterable<CommentEntity>, tasks: ReadonlyMap<string, TaskEntity>, projects: ReadonlyMap<string, ProjectEntity>, query: string, filters: SearchFilters): CommentMatch[] {
  const needle = query.toLowerCase();
  const found: CommentMatch[] = [];
  for (const comment of comments) {
    const task = comment.taskId === null ? undefined : tasks.get(comment.taskId);
    if (!task || task.deletedAt !== null) continue;
    const project = projects.get(task.projectId);
    if (!project || !isVisibleProject(project)) continue;
    if (filters.project && task.projectId !== filters.project) continue;
    if (contains(comment.content, needle)) found.push({ id: comment.id, content: comment.content, createdAt: comment.createdAt, taskContent: task.content, projectId: project.id, projectName: project.name });
  }
  return mergeComments(found, []);
}

/** Comment matches from the local copy and the server, without repeats, newest first. */
export function mergeComments(local: CommentMatch[], server: CommentMatch[]): CommentMatch[] {
  const byId = new Map<string, CommentMatch>();
  for (const comment of [...local, ...server]) if (!byId.has(comment.id)) byId.set(comment.id, comment);
  return [...byId.values()].sort((a, b) => descending(a.createdAt, b.createdAt)).slice(0, SEARCH_LIMIT);
}
