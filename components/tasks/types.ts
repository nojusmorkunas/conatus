import type {
  labels as labelsTable,
  projects as projectsTable,
  sections as sectionsTable,
  tasks as tasksTable,
} from "@/lib/db/schema";

export type Label = typeof labelsTable.$inferSelect;

export type Project = Pick<typeof projectsTable.$inferSelect, "id" | "name">;

export type Section = typeof sectionsTable.$inferSelect;

export type TaskWithLabels = typeof tasksTable.$inferSelect & {
  labels: Label[];
  commentCount: number;
};

export type ProjectMember = { id: string; username: string };
