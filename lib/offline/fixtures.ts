import type { LabelEntity, PendingChange, ProjectEntity, SectionEntity, TaskDto, TaskEntity } from "./types";

export const taskEntity = (fields: Partial<TaskEntity> = {}): TaskEntity => ({
  id: "t",
  projectId: "p",
  sectionId: null,
  parentId: null,
  content: "Pay rent",
  description: "",
  priority: 4,
  dueDate: "2026-10-26",
  dueTime: null,
  deadlineDate: null,
  recurrence: null,
  durationMinutes: null,
  isCompleted: false,
  order: "a",
  updatedAt: "1",
  labelIds: ["x"],
  commentCount: 0,
  completedAt: null,
  deletedAt: null,
  recurrenceEndDate: null,
  ...fields,
});

export const taskDto = (id: string, updatedAt: string, fields: Partial<TaskDto> = {}): TaskDto => ({
  id,
  projectId: "p",
  sectionId: null,
  parentId: null,
  content: id,
  description: null,
  priority: 4,
  dueDate: null,
  dueTime: null,
  deadlineDate: null,
  recurrence: null,
  recurrenceEndDate: null,
  durationMinutes: null,
  isCompleted: false,
  completedAt: null,
  deletedAt: null,
  order: "a",
  updatedAt,
  labels: [],
  commentCount: 0,
  ...fields,
});

export const change = (seq: number, id: string, fields: Partial<PendingChange> = {}): PendingChange => ({
  seq,
  id,
  kind: "Update",
  target: "Task",
  body: "{}",
  summary: "",
  idempotencyKey: null,
  failure: null,
  createdAt: 0,
  base: null,
  ...fields,
});

export const projectEntity = (fields: Partial<ProjectEntity> = {}): ProjectEntity => ({
  id: "p",
  parentId: null,
  name: "Home",
  color: "gray",
  icon: null,
  isFavorite: false,
  isInbox: false,
  order: "a0",
  shared: false,
  isArchived: false,
  deletedAt: null,
  ...fields,
});

export const sectionEntity = (fields: Partial<SectionEntity> = {}): SectionEntity => ({ id: "s", projectId: "p", name: "Later", order: "a0", isArchived: false, ...fields });

export const labelEntity = (fields: Partial<LabelEntity> = {}): LabelEntity => ({ id: "x", name: "errand", color: "gray", isFavorite: false, order: "a0", ...fields });
