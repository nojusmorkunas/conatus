import { MAX_TASK_DEPTH, TASK_INDENT_WIDTH, subtreeIds, type FlatTreeTask } from "./task-tree";

export type TaskDropTarget = {
  sectionId: string | null;
  overId: string | null;
  edge: "before" | "after";
};

export type TaskDropProjection = {
  sectionId: string | null;
  parentId: string | null;
  afterId: string | null;
  beforeId: string | null;
  depth: number;
};

/** Resolve an insertion gap, independently of pickup direction or row height. */
export function projectTaskDrop({
  items, visibleIds, activeId, target, offsetX, indentWidth = TASK_INDENT_WIDTH,
}: {
  items: FlatTreeTask[];
  visibleIds: ReadonlySet<string>;
  activeId: string;
  target: TaskDropTarget;
  offsetX: number;
  indentWidth?: number;
}): TaskDropProjection | null {
  const active = items.find((item) => item.id === activeId);
  if (!active) return null;
  const moved = subtreeIds(items, activeId);
  if (target.overId && target.overId !== activeId && moved.has(target.overId)) return null;
  const subtreeHeight = Math.max(0, ...items.filter((item) => moved.has(item.id)).map((item) => item.depth - active.depth));
  const group = items.filter((item) => item.sectionId === target.sectionId && visibleIds.has(item.id));
  const rows = group.filter((item) => !moved.has(item.id));
  let index: number;
  if (target.overId === activeId) {
    // Horizontal movement in the source slot must not reorder the task.
    index = group.slice(0, group.findIndex((item) => item.id === activeId))
      .filter((item) => !moved.has(item.id)).length;
  } else if (target.overId) {
    const overIndex = rows.findIndex((item) => item.id === target.overId);
    if (overIndex < 0) return null;
    index = overIndex + (target.edge === "after" ? 1 : 0);
  } else {
    index = target.edge === "before" ? 0 : rows.length;
  }

  // A three-quarter indent tolerates incidental drift; use the rendered step
  // (20px on mobile, 28px on desktop), not a hard-coded desktop threshold.
  const step = indentWidth > 0 ? indentWidth : TASK_INDENT_WIDTH;
  const delta = Math.trunc(offsetX / step + Math.sign(offsetX) * 0.25);
  const desired = (active.sectionId === target.sectionId ? active.depth : 0) + delta;
  const previous = rows[index - 1];
  const depth = Math.max(0, Math.min(desired, previous ? previous.depth + 1 : 0, MAX_TASK_DEPTH - subtreeHeight));

  // A root cannot split another task's children. Snap its line past that
  // subtree instead of silently indenting a vertical drag into a new parent.
  while (index < rows.length && rows[index].depth > depth) index += 1;
  let parentId: string | null = null;
  if (depth > 0) {
    for (let i = index - 1; i >= 0; i -= 1) {
      if (rows[i].depth === depth - 1) {
        parentId = rows[i].id;
        break;
      }
    }
    if (!parentId) return null;
  }

  let afterId: string | null = null;
  for (let i = index - 1; i >= 0; i -= 1) {
    if (rows[i].depth < depth) break;
    if (rows[i].depth === depth && rows[i].parentId === parentId) {
      afterId = rows[i].id;
      break;
    }
  }
  // Nesting under a folded task appends to its real children. Invisible rows
  // never become visual targets or move the insertion line elsewhere.
  if (parentId && !rows.some((item) => item.parentId === parentId)) {
    afterId = items.filter((item) => item.parentId === parentId && !moved.has(item.id)).at(-1)?.id ?? null;
  }
  if (!target.overId && target.edge === "after" && rows.length === 0) {
    afterId = items.filter((item) => item.sectionId === target.sectionId && !item.parentId && !moved.has(item.id)).at(-1)?.id ?? null;
  }
  return { sectionId: target.sectionId, parentId, afterId, beforeId: rows[index]?.id ?? null, depth };
}
