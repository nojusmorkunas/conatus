import { expect, test } from "vitest";

import {
  projectCreateSchema,
  projectUpdateSchema,
  commentCreateSchema,
  requestPasswordResetSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  sectionCreateSchema,
  sectionUpdateSchema,
  taskCreateSchema,
  taskUpdateSchema,
} from "./validation";

const uuid = "3f9a2b1c-4d5e-4f6a-8b7c-9d0e1f2a3b4c";

test("password reset requests require a valid email", () => {
  expect(requestPasswordResetSchema.safeParse({ email: "person@example.com" }).success).toBe(true);
  expect(requestPasswordResetSchema.safeParse({ email: "not-an-email" }).success).toBe(false);
});

test("verification resends require a valid email", () => {
  expect(resendVerificationSchema.safeParse({ email: "person@example.com" }).success).toBe(true);
  expect(resendVerificationSchema.safeParse({ email: "not-an-email" }).success).toBe(false);
});

test("password resets accept matching passwords", () => {
  expect(
    resetPasswordSchema.safeParse({
      token: "reset-token",
      password: "password123",
      confirmPassword: "password123",
    }).success,
  ).toBe(true);
});

test("password resets reject missing tokens, short passwords and mismatches", () => {
  expect(
    resetPasswordSchema.safeParse({
      token: "",
      password: "short",
      confirmPassword: "different",
    }).success,
  ).toBe(false);
  expect(
    resetPasswordSchema.safeParse({
      token: "reset-token",
      password: "password123",
      confirmPassword: "different123",
    }).success,
  ).toBe(false);
});

test("project creation accepts an optional parent", () => {
  expect(projectCreateSchema.parse({ name: "Child", parentId: uuid }).parentId).toBe(uuid);
});

test("project updates accept moving to the top level", () => {
  expect(projectUpdateSchema.parse({ parentId: null })).toEqual({ parentId: null });
});

test("project updates accept drag placement among siblings", () => {
  expect(projectUpdateSchema.parse({ parentId: uuid, afterId: null })).toEqual({
    parentId: uuid,
    afterId: null,
  });
});

test("project updates accept flat favorite placement", () => {
  expect(projectUpdateSchema.parse({ favoriteAfterId: null })).toEqual({
    favoriteAfterId: null,
  });
});

test("project parent rejects a non-UUID", () => {
  expect(projectCreateSchema.safeParse({ name: "Child", parentId: "parent" }).success).toBe(false);
});

test("placement variant keeps afterId", () => {
  expect(taskUpdateSchema.parse({ sectionId: null, afterId: uuid })).toEqual({
    sectionId: null,
    afterId: uuid,
  });
});

test("task placement accepts reparenting", () => {
  expect(taskUpdateSchema.parse({ sectionId: null, parentId: uuid, afterId: null })).toEqual({
    sectionId: null,
    parentId: uuid,
    afterId: null,
  });
});

test("plain sectionId update still parses without afterId", () => {
  expect(taskUpdateSchema.parse({ sectionId: uuid })).toEqual({ sectionId: uuid });
});

test("section placement variant keeps afterId", () => {
  expect(sectionUpdateSchema.parse({ afterId: null })).toEqual({ afterId: null });
});

test("section creation accepts explicit placement", () => {
  expect(sectionCreateSchema.parse({ projectId: uuid, name: "Next", afterId: uuid }).afterId).toBe(uuid);
  expect(sectionCreateSchema.parse({ projectId: uuid, name: "First", afterId: null }).afterId).toBeNull();
});

test("completed toggle still routes to its variant", () => {
  expect(taskUpdateSchema.parse({ completed: true })).toEqual({ completed: true });
});

test("task creation accepts explicit placement after a sibling", () => {
  expect(taskCreateSchema.parse({ projectId: uuid, content: "Task", afterId: uuid }).afterId).toBe(uuid);
});

test("task creation accepts null placement at the start", () => {
  expect(taskCreateSchema.parse({ projectId: uuid, content: "Task", afterId: null }).afterId).toBeNull();
});

test("task creation rejects an invalid placement id", () => {
  expect(taskCreateSchema.safeParse({ projectId: uuid, content: "Task", afterId: "not-a-uuid" }).success).toBe(false);
});

test("task creation accepts an inclusive recurrence end date", () => {
  const parsed = taskCreateSchema.safeParse({
    projectId: uuid,
    content: "Recurring task",
    dueDate: "2026-07-20",
    recurrence: "every week",
    recurrenceEndDate: "2026-08-31",
  });
  expect(parsed.success).toBe(true);
});

test("task creation rejects a recurrence end before the first due date", () => {
  const parsed = taskCreateSchema.safeParse({
    projectId: uuid,
    content: "Recurring task",
    dueDate: "2026-07-20",
    recurrence: "every week",
    recurrenceEndDate: "2026-07-19",
  });
  expect(parsed.success).toBe(false);
});

test("task updates accept changing only the recurrence end date", () => {
  expect(taskUpdateSchema.parse({ recurrenceEndDate: "2026-08-31" })).toEqual({
    recurrenceEndDate: "2026-08-31",
  });
});

test("comment creation accepts exactly one task or project parent", () => {
  expect(commentCreateSchema.safeParse({ taskId: uuid, content: "Task comment" }).success).toBe(true);
  expect(commentCreateSchema.safeParse({ projectId: uuid, content: "Project comment" }).success).toBe(true);
});

test("comment creation rejects both parents", () => {
  expect(commentCreateSchema.safeParse({ taskId: uuid, projectId: uuid, content: "Comment" }).success).toBe(false);
});

test("comment creation rejects an absent parent", () => {
  expect(commentCreateSchema.safeParse({ content: "Comment" }).success).toBe(false);
});
