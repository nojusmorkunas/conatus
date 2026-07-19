// 1 = P1 (most urgent) through 4 = P4 (default, no priority set).
export const priorityColors: Record<number, string> = {
  1: "border-red-500 text-red-500",
  2: "border-orange-500 text-orange-500",
  3: "border-blue-500 text-blue-500",
  4: "border-muted-foreground/40 text-muted-foreground",
};

export const priorityFill: Record<number, string> = {
  1: "border-red-500 bg-red-500",
  2: "border-orange-500 bg-orange-500",
  3: "border-blue-500 bg-blue-500",
  4: "border-muted-foreground bg-muted-foreground",
};

export const priorityLabels: Record<number, string> = {
  1: "Priority 1",
  2: "Priority 2",
  3: "Priority 3",
  4: "Priority 4",
};
