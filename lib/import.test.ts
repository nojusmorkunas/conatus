import { expect, test } from "vitest";

import { importSchema } from "./validation";

const projectId = "3f9a2b1c-4d5e-4f6a-8b7c-9d0e1f2a3b4c";
const sectionId = "4f9a2b1c-4d5e-4f6a-8b7c-9d0e1f2a3b4c";
const taskId = "5f9a2b1c-4d5e-4f6a-8b7c-9d0e1f2a3b4c";
const parentTaskId = "6f9a2b1c-4d5e-4f6a-8b7c-9d0e1f2a3b4c";
const labelId = "7f9a2b1c-4d5e-4f6a-8b7c-9d0e1f2a3b4c";
const unknownId = "8f9a2b1c-4d5e-4f6a-8b7c-9d0e1f2a3b4c";

function payload(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    version: 1,
    exportedAt: "2026-07-14T00:00:00.000Z",
    projects: [
      {
        id: projectId,
        name: "Work",
        color: "blue",
        order: "a0",
        isFavorite: false,
        isArchived: false,
        isInbox: false,
      },
    ],
    sections: [
      { id: sectionId, projectId, name: "Todo", order: "a0" },
    ],
    tasks: [
      {
        id: parentTaskId,
        projectId,
        sectionId: null,
        parentId: null,
        content: "Parent task",
        description: null,
        priority: 4,
        dueDate: null,
        dueTime: null,
        recurrence: null,
        isCompleted: false,
        completedAt: null,
        order: "a0",
      },
      {
        id: taskId,
        projectId,
        sectionId,
        parentId: parentTaskId,
        content: "Child task",
        description: null,
        priority: 1,
        dueDate: "2026-07-14",
        dueTime: null,
        recurrence: null,
        isCompleted: false,
        completedAt: null,
        order: "a0",
      },
    ],
    labels: [
      { id: labelId, name: "urgent", color: "red", isFavorite: false, order: "a0" },
    ],
    taskLabels: [{ taskId, labelId }],
    ...overrides,
  };
}

test("valid payload passes", () => {
  expect(importSchema.safeParse(payload()).success).toBe(true);
});

test("dangling sectionId on a task is rejected", () => {
  const data = payload();
  data.tasks[1].sectionId = unknownId;
  expect(importSchema.safeParse(data).success).toBe(false);
});

test("dangling projectId on a section is rejected", () => {
  const data = payload();
  data.sections[0].projectId = unknownId;
  expect(importSchema.safeParse(data).success).toBe(false);
});

test("dangling parentId on a task is rejected", () => {
  const data = payload();
  data.tasks[1].parentId = unknownId;
  expect(importSchema.safeParse(data).success).toBe(false);
});

test("dangling labelId on a taskLabel is rejected", () => {
  const data = payload();
  data.taskLabels[0].labelId = unknownId;
  expect(importSchema.safeParse(data).success).toBe(false);
});
