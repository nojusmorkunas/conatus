type CompletedTask = {
  id: string;
  sectionId: string | null;
  parentId: string | null;
  isCompleted: boolean;
  completedAt: Date | string | null;
};

function completedTime(value: Date | string | null) {
  if (value === null) return Number.NEGATIVE_INFINITY;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
}

export function completedForSection<T extends CompletedTask>(
  sectionId: string | null,
  stateTasks: T[],
  historyItems: T[],
): T[] {
  const stateIds = new Set(stateTasks.map((task) => task.id));
  const rows = [
    ...stateTasks.filter(
      (task) =>
        task.sectionId === sectionId &&
        task.parentId === null &&
        task.isCompleted,
    ),
    ...historyItems.filter(
      (task) => task.sectionId === sectionId && !stateIds.has(task.id),
    ),
  ];

  return rows.sort((a, b) => {
    const aTime = completedTime(a.completedAt);
    const bTime = completedTime(b.completedAt);
    if (aTime !== bTime) return bTime - aTime;
    if (a.id === b.id) return 0;
    return a.id < b.id ? 1 : -1;
  });
}
