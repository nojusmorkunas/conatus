export type SortBy = "manual" | "due" | "priority" | "name";

type SortableTask = {
  content: string;
  dueDate: string | null;
  order: string;
  priority: number;
};

function compareOrder(a: SortableTask, b: SortableTask) {
  return a.order < b.order ? -1 : a.order > b.order ? 1 : 0;
}

export function compareTasks(sortBy: SortBy, a: SortableTask, b: SortableTask) {
  if (sortBy === "manual") return compareOrder(a, b);

  if (sortBy === "due") {
    if (a.dueDate === null) return b.dueDate === null ? compareOrder(a, b) : 1;
    if (b.dueDate === null) return -1;
    const dueComparison = a.dueDate.localeCompare(b.dueDate);
    return dueComparison || compareOrder(a, b);
  }

  if (sortBy === "priority") {
    return a.priority - b.priority || compareOrder(a, b);
  }

  return a.content.localeCompare(b.content, undefined, { sensitivity: "base" }) || compareOrder(a, b);
}
