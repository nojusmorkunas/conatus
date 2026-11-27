// The browser's copy of a user's data. Screens read only from here, and sync writes server data
// here (see store.ts). Entities are shaped like the /api/v1 responses, except that a task names
// its labels by id.

export const LOCAL_ID_PREFIX = "local:";

export const isLocalId = (id: string) => id.startsWith(LOCAL_ID_PREFIX);

export type TaskEntity = {
  id: string;
  projectId: string;
  sectionId: string | null;
  parentId: string | null;
  content: string;
  description: string;
  priority: number;
  /** "YYYY-MM-DD" in the user's time zone, as the server stores it. */
  dueDate: string | null;
  /** "HH:mm". */
  dueTime: string | null;
  deadlineDate: string | null;
  recurrence: string | null;
  durationMinutes: number | null;
  isCompleted: boolean;
  order: string;
  updatedAt: string;
  labelIds: string[];
  commentCount: number;
  /** An ISO instant. Set while the task is completed. */
  completedAt: string | null;
  /** An ISO instant. Set while the task is in Trash. */
  deletedAt: string | null;
  /** The last date a repeating task runs on, inclusive. */
  recurrenceEndDate: string | null;
};

export type ProjectEntity = {
  id: string;
  parentId: string | null;
  name: string;
  color: string;
  icon: string | null;
  isFavorite: boolean;
  isInbox: boolean;
  order: string;
  shared: boolean;
  /** Archived projects hide from every list; the server stops sending them and their tasks. */
  isArchived: boolean;
  /** An ISO instant. Set while the project is in Trash. */
  deletedAt: string | null;
};

export type SectionEntity = {
  id: string;
  projectId: string;
  name: string;
  order: string;
  isArchived: boolean;
};

export type LabelEntity = {
  id: string;
  name: string;
  color: string;
  isFavorite: boolean;
  order: string;
};

/** A comment on a task or on a project; exactly one of taskId and projectId is set, as on the server. */
export type CommentEntity = {
  id: string;
  taskId: string | null;
  projectId: string | null;
  content: string;
  createdAt: string;
  updatedAt: string;
  userId: string | null;
};

export type ReminderEntity = {
  id: string;
  taskId: string;
  /** An ISO instant. */
  remindAt: string;
};

/** [Place] moves a task among its siblings: {sectionId, parentId, afterId}, as drag and drop does. */
export type ChangeKind = "Create" | "Update" | "Complete" | "Reopen" | "SetLabels" | "Delete" | "Restore" | "Place";

export type Target = "Task" | "Project" | "Section" | "Label" | "Comment" | "Reminder";

/**
 * A change made here that the server hasn't confirmed yet. Changes go out in [seq] order. [body]
 * is the exact JSON sent, so a retry is byte-identical (the server's idempotency check compares
 * bodies). [base] holds the values the change replaced, as JSON, for the three-way merge that
 * spots conflicts. A change the server rejected keeps its [failure] until the user retries or
 * discards it; later changes to the same thing wait.
 */
export type PendingChange = {
  seq: number;
  /** The id of what changed (see [target]): a server id, or LOCAL_ID_PREFIX plus a UUID before the server has it. */
  id: string;
  kind: ChangeKind;
  target: Target;
  body: string;
  /** What the change is, in words, for the list of changes that couldn't sync. */
  summary: string;
  idempotencyKey: string | null;
  failure: string | null;
  createdAt: number;
  base: string | null;
};

/** A change about to be queued. The store assigns [seq], whatever it says here. */
export type NewChange = Pick<PendingChange, "id" | "kind" | "body" | "summary"> &
  Partial<PendingChange>;

/**
 * A task changed here and elsewhere since the last sync, in the same fields and to different
 * values. Its queued changes wait until the user keeps one side. [theirs] is the server's values
 * of those fields as JSON; [deleted] means the server deleted it instead.
 */
export type Conflict = { taskId: string; theirs: string; deleted: boolean };

// What /api/v1 sends, as far as sync reads it.

export type TaskDto = {
  id: string;
  projectId: string;
  sectionId: string | null;
  parentId: string | null;
  content: string;
  description: string | null;
  priority: number;
  dueDate: string | null;
  dueTime: string | null;
  deadlineDate: string | null;
  recurrence: string | null;
  recurrenceEndDate: string | null;
  durationMinutes: number | null;
  isCompleted: boolean;
  completedAt: string | null;
  deletedAt: string | null;
  order: string;
  updatedAt: string;
  labels: { id: string }[];
  commentCount: number;
};

export type TaskPage = { items: TaskDto[]; nextCursor: string | null; serverTime: string };

export type ProjectDto = Omit<ProjectEntity, "shared" | "deletedAt"> & { shared?: boolean };

export type SectionDto = SectionEntity;

export type LabelDto = LabelEntity;

export type CommentDto = CommentEntity;

export type ReminderDto = ReminderEntity;
