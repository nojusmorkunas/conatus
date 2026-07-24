function arrayMove<T>(items: T[], from: number, to: number): T[] {
  const next = items.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export const MAX_TASK_DEPTH = 4;
export const TASK_INDENT_WIDTH = 28;

export type TreeTask = {
  id: string;
  parentId: string | null;
  sectionId: string | null;
  order: string;
};

export type FlatTreeTask<T extends TreeTask = TreeTask> = T & { depth: number };

export function flattenTaskTree<T extends TreeTask>(tasks: T[]): FlatTreeTask<T>[] {
  const byParent = new Map<string | null, T[]>();
  for (const task of tasks) {
    const siblings = byParent.get(task.parentId) ?? [];
    siblings.push(task);
    byParent.set(task.parentId, siblings);
  }
  for (const siblings of byParent.values()) {
    siblings.sort((a, b) => (a.order < b.order ? -1 : 1));
  }

  const result: FlatTreeTask<T>[] = [];
  function append(parentId: string | null, depth: number) {
    for (const task of byParent.get(parentId) ?? []) {
      result.push({ ...task, depth });
      append(task.id, depth + 1);
    }
  }
  append(null, 0);
  return result;
}

export function flattenTaskGroup<T extends TreeTask>(
  tasks: T[],
  sectionId: string | null,
): FlatTreeTask<T>[] {
  const byParent = new Map<string, T[]>();
  for (const task of tasks) {
    if (!task.parentId) continue;
    const siblings = byParent.get(task.parentId) ?? [];
    siblings.push(task);
    byParent.set(task.parentId, siblings);
  }
  for (const siblings of byParent.values()) {
    siblings.sort((a, b) => (a.order < b.order ? -1 : 1));
  }

  const roots = tasks
    .filter((task) => task.parentId === null && task.sectionId === sectionId)
    .sort((a, b) => (a.order < b.order ? -1 : 1));
  const result: FlatTreeTask<T>[] = [];
  function append(task: T, depth: number) {
    result.push({ ...task, sectionId, depth });
    for (const child of byParent.get(task.id) ?? []) append(child, depth + 1);
  }
  for (const root of roots) append(root, 0);
  return result;
}

export function visibleFlatRows<T extends TreeTask>(
  tasks: T[],
  sectionId: string | null,
  options: {
    collapsedIds?: ReadonlySet<string>;
    hiddenSubtreeOf?: string | null;
  } = {},
): FlatTreeTask<T>[] {
  const rows = flattenTaskGroup(tasks, sectionId);
  const hiddenIds = new Set<string>();

  for (const collapsedId of options.collapsedIds ?? []) {
    for (const id of subtreeIds(rows, collapsedId)) {
      if (id !== collapsedId) hiddenIds.add(id);
    }
  }

  if (options.hiddenSubtreeOf) {
    for (const id of subtreeIds(rows, options.hiddenSubtreeOf)) {
      if (id !== options.hiddenSubtreeOf) hiddenIds.add(id);
    }
  }

  return rows.filter((row) => !hiddenIds.has(row.id));
}

export function subtreeIds(tasks: TreeTask[], rootId: string) {
  // Group children once (O(n)) then walk down from the root, instead of the
  // fixed-point scan that re-swept the whole list per depth level (O(n²)).
  // Runs on every drag move via projectTaskDepth, so the difference shows on
  // large lists. Same result for any input order; the visited set stops cycles.
  const childrenByParent = new Map<string, string[]>();
  for (const task of tasks) {
    if (!task.parentId) continue;
    const siblings = childrenByParent.get(task.parentId);
    if (siblings) siblings.push(task.id);
    else childrenByParent.set(task.parentId, [task.id]);
  }

  const ids = new Set([rootId]);
  const stack = [rootId];
  while (stack.length) {
    const current = stack.pop()!;
    for (const childId of childrenByParent.get(current) ?? []) {
      if (!ids.has(childId)) {
        ids.add(childId);
        stack.push(childId);
      }
    }
  }
  return ids;
}

export function taskDepth(tasks: TreeTask[], taskId: string) {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const seen = new Set<string>();
  let depth = 0;
  let current = byId.get(taskId);
  while (current?.parentId) {
    if (seen.has(current.id)) return Number.POSITIVE_INFINITY;
    seen.add(current.id);
    depth += 1;
    current = byId.get(current.parentId);
  }
  return depth;
}

export function wouldCreateTaskCycle(tasks: TreeTask[], taskId: string, parentId: string | null) {
  if (!parentId) return false;
  return subtreeIds(tasks, taskId).has(parentId);
}

export function projectTaskDepth({
  items,
  activeId,
  overId,
  offsetX,
  maxDepth = MAX_TASK_DEPTH,
}: {
  items: FlatTreeTask[];
  activeId: string;
  overId: string;
  offsetX: number;
  maxDepth?: number;
}) {
  const activeIndex = items.findIndex((item) => item.id === activeId);
  const overIndex = items.findIndex((item) => item.id === overId);
  if (activeIndex < 0 || overIndex < 0) return null;

  const active = items[activeIndex];
  const descendants = subtreeIds(items, activeId);
  const subtree = items.filter((item) => descendants.has(item.id));
  const subtreeHeight = Math.max(...subtree.map((item) => item.depth - active.depth), 0);
  // A subtree travels as one row for projection purposes. Put that row in the
  // gap immediately after the row under the pointer; this is the sortable-tree
  // arrayMove step expressed after the active item's children are collapsed.
  const collapsed = items.filter((item) => item.id === activeId || !descendants.has(item.id));
  const collapsedActiveIndex = collapsed.findIndex((item) => item.id === activeId);
  const collapsedOverIndex = collapsed.findIndex((item) => item.id === overId);
  if (collapsedOverIndex < 0) return null;
  const targetIndex = collapsedOverIndex;
  const newItems = arrayMove(collapsed, collapsedActiveIndex, targetIndex);
  const projectedIndex = newItems.findIndex((item) => item.id === activeId);

  // The pointer's row determines the destination section. Array movement can
  // place the projected slot next to another section, but section boundaries
  // are hard walls for all structural neighbour calculations.
  const targetSectionId = items[overIndex].sectionId;
  const previous = newItems[projectedIndex - 1]?.sectionId === targetSectionId
    ? newItems[projectedIndex - 1]
    : undefined;
  const next = newItems[projectedIndex + 1]?.sectionId === targetSectionId
    ? newItems[projectedIndex + 1]
    : undefined;
  const crossesSectionBoundary = active.sectionId !== targetSectionId;
  // Depth follows deliberate horizontal movement only. It takes about a
  // three-quarter indent of sideways travel to shift one level (vs. the naive
  // half-indent of Math.round), so a little drift while dragging vertically
  // never accidentally nests a task — or outdents a subtask into a root.
  const dragDepthDelta = Math.trunc(offsetX / TASK_INDENT_WIDTH + Math.sign(offsetX) * 0.25);
  // Canonical sortable-tree projection: depth comes from the drop slot's
  // section-confined neighbours and the horizontal offset, never pinned to the
  // active row's original depth. This lets a subtask dropped ABOVE its own
  // parent promote out because a child can never render above its parent.
  const projectedDepth = crossesSectionBoundary ? 0 : active.depth + dragDepthDelta;
  const minimum = next?.depth ?? 0;
  const maximum = crossesSectionBoundary
    ? 0
    : Math.min(previous ? previous.depth + 1 : 0, maxDepth - subtreeHeight);
  const depth = Math.max(0, Math.min(maximum, Math.max(minimum, projectedDepth)));

  let parentId: string | null;
  if (depth === 0 || !previous) {
    parentId = null;
  } else if (depth === previous.depth) {
    parentId = previous.parentId;
  } else if (depth > previous.depth) {
    parentId = previous.id;
  } else {
    parentId = null;
    for (let index = projectedIndex - 1; index >= 0; index -= 1) {
      const candidate = newItems[index];
      if (candidate.sectionId !== targetSectionId) break;
      if (candidate.depth === depth) {
        parentId = candidate.parentId;
        break;
      }
    }
  }
  if (depth > 0 && !parentId) return null;

  const sectionId = targetSectionId;
  let afterId: string | null = null;
  for (let index = projectedIndex - 1; index >= 0; index -= 1) {
    const candidate = newItems[index];
    if (candidate.sectionId !== sectionId) break;
    if (candidate.depth < depth) break;
    if (candidate.depth === depth && candidate.parentId === parentId) {
      afterId = candidate.id;
      break;
    }
  }

  return { depth, parentId, sectionId, afterId };
}
