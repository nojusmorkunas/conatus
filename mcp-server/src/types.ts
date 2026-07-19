export type WorkspaceContext = {
  apiVersion: string;
  serverTime: string;
  today: string;
  user: {
    id: string;
    name: string | null;
    email: string;
    timezone: string;
    dateFormat: string;
    weekStart: number;
  };
  inbox: Project | null;
  grantedScopes: string[];
};

export type Project = {
  id: string;
  name: string;
  parentId: string | null;
  color: string;
  icon: string | null;
  isFavorite: boolean;
  isArchived: boolean;
  isInbox: boolean;
  shared?: boolean;
  sections?: Section[];
};

export type Section = {
  id: string;
  projectId: string;
  name: string;
  isArchived: boolean;
};

export type Label = {
  id: string;
  name: string;
  color: string;
  isFavorite: boolean;
};

export type Comment = {
  id: string;
  taskId: string | null;
  projectId: string | null;
  userId: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

export type Reminder = {
  id: string;
  taskId: string;
  remindAt: string;
  sentAt: string | null;
  seenAt: string | null;
};

export type Task = {
  id: string;
  projectId: string;
  sectionId: string | null;
  parentId: string | null;
  assigneeId: string | null;
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
  createdAt: string;
  updatedAt: string;
  labels?: Label[];
  comments?: Comment[];
  reminders?: Reminder[];
  commentCount?: number;
};

export type TaskPage = { items: Task[]; nextCursor: string | null };

export type TaskCreate = {
  projectId: string;
  content: string;
  description?: string;
  priority?: number;
  dueDate?: string | null;
  dueTime?: string | null;
  deadlineDate?: string | null;
  recurrence?: string | null;
  recurrenceEndDate?: string | null;
  durationMinutes?: number | null;
  assigneeId?: string | null;
  sectionId?: string | null;
  parentId?: string | null;
  afterId?: string | null;
};
