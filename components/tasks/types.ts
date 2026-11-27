import type {
  labels as labelsTable,
  projects as projectsTable,
  tasks as tasksTable,
} from "@/lib/db/schema";
import type { SectionEntity } from "@/lib/offline/types";

export type Label = Pick<typeof labelsTable.$inferSelect, "id" | "name" | "color" | "isFavorite" | "order">;

export type Project = Pick<typeof projectsTable.$inferSelect, "id" | "name">;

export type Section = SectionEntity;

// Only the task fields components read, so the local store's string-dated tasks fit as well as database rows.
export type TaskWithLabels = Pick<
  typeof tasksTable.$inferSelect,
  | "id"
  | "projectId"
  | "sectionId"
  | "parentId"
  | "content"
  | "description"
  | "priority"
  | "dueDate"
  | "dueTime"
  | "deadlineDate"
  | "recurrence"
  | "recurrenceEndDate"
  | "durationMinutes"
  | "isCompleted"
  | "order"
  | "assigneeId"
> & {
  /** A Date from the database, an ISO string from the local store. */
  completedAt: Date | string | null;
  labels: Label[];
  commentCount: number;
  // Set only by views that mix projects, so the row can say where it lives.
  projectName?: string;
  projectColor?: string;
  projectIcon?: string | null;
};

export type ProjectMember = { id: string; username: string };
