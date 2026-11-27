import { generateKeyBetween } from "fractional-indexing";

import { subtreeIds } from "./task-tree";

// Rules the task routes apply on the server, also used by the offline writes so the local copy
// ends up exactly as the server leaves it. Nothing here touches the database.

type Instant = Date | string | null;

export type StatusRow = {
  id: string;
  parentId: string | null;
  isCompleted: boolean;
  completedAt: Instant;
  deletedAt: Instant;
};

const time = (value: Instant) => (value === null ? null : new Date(value).getTime());

/**
 * The sub-tasks that change with [task]. Completing it completes the open ones; reopening it
 * reopens those completed with it (at the same moment); a repeating task moving on to its next
 * date reopens every completed one, so its checklist starts over. Tasks in Trash stay as they are.
 */
export function cascadedIds(rows: StatusRow[], task: StatusRow, completing: boolean, repeating = false): string[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return [...subtreeIds(rows, task.id)].filter((id) => {
    const row = byId.get(id);
    if (!row || id === task.id || row.deletedAt || row.isCompleted === completing) return false;
    return completing || repeating || (task.completedAt !== null && time(row.completedAt) === time(task.completedAt));
  });
}

/** The completed parents above [task], which reopening it reopens too. */
export function completedAncestorIds(rows: StatusRow[], task: StatusRow): string[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const ids: string[] = [];
  const seen = new Set([task.id]);
  let parentId = task.parentId;
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) break;
    if (parent.isCompleted && !parent.deletedAt) ids.push(parent.id);
    parentId = parent.parentId;
  }
  return ids;
}

type Schedule = { dueDate: string | null; recurrence: string | null; recurrenceEndDate: string | null };

/**
 * What an edit of a task's schedule also clears: without a due date there's no time or repeat, and
 * without a repeat no end date. [changes] holds only the fields the edit sets.
 */
export function clearedWithSchedule(
  current: Schedule,
  changes: Partial<Schedule>,
): { dueTime?: null; recurrence?: null; recurrenceEndDate?: null } {
  const cleared: { dueTime?: null; recurrence?: null; recurrenceEndDate?: null } = {};
  if (!(changes.dueDate === undefined ? current.dueDate : changes.dueDate)) {
    cleared.dueTime = null;
    cleared.recurrence = null;
    cleared.recurrenceEndDate = null;
  }
  const recurrence = cleared.recurrence === null ? null : changes.recurrence === undefined ? current.recurrence : changes.recurrence;
  if (!recurrence) cleared.recurrenceEndDate = null;
  return cleared;
}

/**
 * Where a task ends up when its project or section is set. A task moved to another list becomes
 * top-level there (its own sub-tasks follow it); setting the list it is already in moves nothing.
 */
export function moveTarget(
  task: { projectId: string; sectionId: string | null; parentId: string | null },
  projectId: string | undefined,
  sectionId: string | null | undefined,
) {
  const targetProjectId = projectId ?? task.projectId;
  // A project move drops the old project's section unless one is named.
  const targetSectionId = sectionId !== undefined ? sectionId : targetProjectId !== task.projectId ? null : task.sectionId;
  const movingLists = targetProjectId !== task.projectId || targetSectionId !== task.sectionId;
  return { projectId: targetProjectId, sectionId: targetSectionId, parentId: task.parentId && movingLists ? null : task.parentId, movingLists };
}

/**
 * The order key that puts something right after [afterId] among [siblings] (first when null), or
 * undefined when [afterId] isn't one of them. [siblings] are in order and don't include the thing placed.
 */
export function keyAfterSibling(siblings: { id: string; order: string }[], afterId: string | null): string | undefined {
  const index = afterId ? siblings.findIndex((sibling) => sibling.id === afterId) + 1 : 0;
  if (afterId && index === 0) return undefined;
  return generateKeyBetween(siblings[index - 1]?.order ?? null, siblings[index]?.order ?? null);
}

/**
 * The key a task comes back from Trash with: its own, unless a sibling that stayed holds it, in
 * which case it goes to the end (two siblings on one key break placing between them later).
 */
export function restoredOrder(siblingOrders: string[], order: string): string {
  if (!siblingOrders.includes(order)) return order;
  return generateKeyBetween(siblingOrders.reduce((last, key) => (key > last ? key : last)), null);
}
