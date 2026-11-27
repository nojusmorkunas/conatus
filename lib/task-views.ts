import type { ProjectEntity, TaskEntity } from "@/lib/offline/types";

/** Archived and trashed projects keep their tasks in the store, but no view shows them. */
export const isVisibleProject = (project: ProjectEntity) => !project.isArchived && project.deletedAt === null;

/** The projects views list, in the order the server lists them: your own first, then shared ones, each by order. */
export function visibleProjects(projects: Iterable<ProjectEntity>): ProjectEntity[] {
  const shared = (project: ProjectEntity) => Number(project.shared);
  return [...projects].filter(isVisibleProject).sort((a, b) => shared(a) - shared(b) || (a.order < b.order ? -1 : a.order > b.order ? 1 : 0));
}

/**
 * The tasks of [projectId] its page shows, by order: not in Trash, and a completed one only when
 * its parent is open or it is [includeId] (the task the URL names), as loadProjectTasks does.
 */
export function projectTasks(tasks: ReadonlyMap<string, TaskEntity>, projectId: string, includeId?: string | null): TaskEntity[] {
  const shown: TaskEntity[] = [];
  for (const task of tasks.values()) {
    if (task.projectId !== projectId || task.deletedAt !== null) continue;
    const parent = task.parentId === null ? undefined : tasks.get(task.parentId);
    if (!task.isCompleted || (parent !== undefined && !parent.isCompleted) || task.id === includeId) shown.push(task);
  }
  return shown.sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0));
}

/**
 * What the sidebar counts: open tasks per visible project, and those among them due today or
 * earlier ("YYYY-MM-DD" strings compare as dates), as the layout's query did.
 */
export function openCounts(tasks: Iterable<TaskEntity>, projects: ReadonlyMap<string, ProjectEntity>, today: string): { byProject: Record<string, number>; today: number } {
  const byProject: Record<string, number> = {};
  let dueToday = 0;
  for (const task of tasks) {
    if (task.isCompleted || task.deletedAt !== null) continue;
    const project = projects.get(task.projectId);
    if (!project || !isVisibleProject(project)) continue;
    byProject[task.projectId] = (byProject[task.projectId] ?? 0) + 1;
    if (task.dueDate !== null && task.dueDate <= today) dueToday++;
  }
  return { byProject, today: dueToday };
}

const ascending = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
// Postgres puts NULLs last in an ascending sort, and the page queries relied on that.
const ascendingNullsLast = (a: string | null, b: string | null) => (a === null ? (b === null ? 0 : 1) : b === null ? -1 : ascending(a, b));

/** The order the date views list tasks in: the same as dueOrder in lib/db/task-order.ts. */
export function compareDue(a: TaskEntity, b: TaskEntity): number {
  return ascendingNullsLast(a.dueDate, b.dueDate) || ascendingNullsLast(a.dueTime, b.dueTime) || a.priority - b.priority || ascending(a.order, b.order);
}

/** Open tasks of visible projects, in due order: what the date views draw from. */
export function openDueTasks(tasks: Iterable<TaskEntity>, projects: ReadonlyMap<string, ProjectEntity>): TaskEntity[] {
  const kept: TaskEntity[] = [];
  for (const task of tasks) {
    if (task.isCompleted || task.deletedAt !== null) continue;
    const project = projects.get(task.projectId);
    if (project && isVisibleProject(project)) kept.push(task);
  }
  return kept.sort(compareDue);
}

/** Today's page: open tasks due today or earlier, split into overdue and due today, each in due order. */
export function todayGroups(tasks: Iterable<TaskEntity>, projects: ReadonlyMap<string, ProjectEntity>, today: string) {
  const due = openDueTasks(tasks, projects).filter((task) => task.dueDate !== null && task.dueDate <= today);
  return {
    overdue: due.filter((task) => task.dueDate! < today),
    today: due.filter((task) => task.dueDate === today),
  };
}

/** Upcoming: open tasks due today or later, one group per day, in due order. */
export function upcomingDays(tasks: Iterable<TaskEntity>, projects: ReadonlyMap<string, ProjectEntity>, today: string): { day: string; tasks: TaskEntity[] }[] {
  const days: { day: string; tasks: TaskEntity[] }[] = [];
  for (const task of openDueTasks(tasks, projects)) {
    if (task.dueDate === null || task.dueDate < today) continue;
    const last = days.at(-1);
    if (last?.day === task.dueDate) last.tasks.push(task);
    else days.push({ day: task.dueDate, tasks: [task] });
  }
  return days;
}

/** A label's page: open tasks carrying [labelId], in due order. */
export function labelTasks(tasks: Iterable<TaskEntity>, projects: ReadonlyMap<string, ProjectEntity>, labelId: string): TaskEntity[] {
  return openDueTasks(tasks, projects).filter((task) => task.labelIds.includes(labelId));
}

/**
 * The calendar's tasks for [start, end]: open ones due in that span, and repeating ones that began
 * before it, in the order the calendar lists them (date, time, then manual order, not priority).
 */
export function calendarTasks(tasks: Iterable<TaskEntity>, projects: ReadonlyMap<string, ProjectEntity>, start: string, end: string): TaskEntity[] {
  const shown: TaskEntity[] = [];
  for (const task of tasks) {
    if (task.isCompleted || task.deletedAt !== null || task.dueDate === null) continue;
    const project = projects.get(task.projectId);
    if (!project || !isVisibleProject(project)) continue;
    if ((task.dueDate >= start && task.dueDate <= end) || (task.recurrence !== null && task.dueDate <= end)) shown.push(task);
  }
  return shown.sort((a, b) => ascendingNullsLast(a.dueDate, b.dueDate) || ascendingNullsLast(a.dueTime, b.dueTime) || ascending(a.order, b.order));
}

/** The Completed page shows this many, the most recent. */
export const COMPLETED_LIMIT = 200;

/**
 * The Completed page: completed tasks of visible projects, not in Trash, whose parent is open or
 * absent, newest first, as the page query listed them.
 */
export function completedList(tasks: ReadonlyMap<string, TaskEntity>, projects: ReadonlyMap<string, ProjectEntity>): TaskEntity[] {
  const done: TaskEntity[] = [];
  for (const task of tasks.values()) {
    if (!task.isCompleted || task.deletedAt !== null) continue;
    const project = projects.get(task.projectId);
    if (!project || !isVisibleProject(project)) continue;
    const parent = task.parentId === null ? undefined : tasks.get(task.parentId);
    if (parent?.isCompleted) continue;
    done.push(task);
  }
  const time = (task: TaskEntity) => Date.parse(task.completedAt ?? "") || 0;
  return done.sort((a, b) => time(b) - time(a) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)).slice(0, COMPLETED_LIMIT);
}

/**
 * The Trash page. Tasks: trashed, in a project that isn't in Trash, and not under a trashed parent.
 * Projects: trashed ones the user owns, not under another trashed project. The local copy holds
 * only the projects trashed here (the server doesn't list trashed projects), so the page adds the
 * server's. Both newest first.
 */
export function trashItems(tasks: ReadonlyMap<string, TaskEntity>, projects: ReadonlyMap<string, ProjectEntity>): { projects: ProjectEntity[]; tasks: TaskEntity[] } {
  const trashed = [...projects.values()].filter((project) => project.deletedAt !== null && !project.shared);
  const trashedIds = new Set(trashed.map((project) => project.id));
  const shownTasks: TaskEntity[] = [];
  for (const task of tasks.values()) {
    if (task.deletedAt === null) continue;
    const project = projects.get(task.projectId);
    if (!project || project.deletedAt !== null) continue;
    const parent = task.parentId === null ? undefined : tasks.get(task.parentId);
    if (parent?.deletedAt) continue;
    shownTasks.push(task);
  }
  const time = (row: { deletedAt: string | null }) => Date.parse(row.deletedAt ?? "") || 0;
  return {
    projects: trashed.filter((project) => !project.parentId || !trashedIds.has(project.parentId)).sort((a, b) => time(b) - time(a)),
    tasks: shownTasks.sort((a, b) => time(b) - time(a)),
  };
}
