export type SortBy = "manual" | "due" | "priority" | "name";

type SortableTask = {
  content: string;
  dueDate: string | null;
  dueTime: string | null;
  order: string;
  priority: number;
};

function compareOrder(a: SortableTask, b: SortableTask) {
  return a.order < b.order ? -1 : a.order > b.order ? 1 : 0;
}

// Within one day, timed tasks come first in time order.
function compareTime(a: SortableTask, b: SortableTask) {
  if (a.dueTime === null) return b.dueTime === null ? 0 : 1;
  if (b.dueTime === null) return -1;
  return a.dueTime.localeCompare(b.dueTime);
}

export function compareTasks(sortBy: SortBy, a: SortableTask, b: SortableTask) {
  if (sortBy === "manual") return compareOrder(a, b);

  if (sortBy === "due") {
    if (a.dueDate === null) return b.dueDate === null ? compareOrder(a, b) : 1;
    if (b.dueDate === null) return -1;
    return a.dueDate.localeCompare(b.dueDate) || compareTime(a, b) || compareOrder(a, b);
  }

  if (sortBy === "priority") {
    return a.priority - b.priority || compareOrder(a, b);
  }

  return a.content.localeCompare(b.content, undefined, { sensitivity: "base" }) || compareOrder(a, b);
}
