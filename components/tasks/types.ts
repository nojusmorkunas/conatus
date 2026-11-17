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
  // Set only by views that mix projects, so the row can say where it lives.
  projectName?: string;
  projectColor?: string;
};

export type ProjectMember = { id: string; username: string };
