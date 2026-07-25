import type { filters as filtersTable, labels as labelsTable, projects } from "@/lib/db/schema";

export type Project = typeof projects.$inferSelect & { shared?: boolean };
export type Label = typeof labelsTable.$inferSelect;
export type Filter = typeof filtersTable.$inferSelect;
export type ProjectDropIndicator = { anchorId: string | null; depth: number } | null;
