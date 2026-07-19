import { expect, test } from "vitest";

import { templateSchema } from "./validation";

const sectionId = "4f9a2b1c-4d5e-4f6a-8b7c-9d0e1f2a3b4c";
const taskId = "5f9a2b1c-4d5e-4f6a-8b7c-9d0e1f2a3b4c";
const parentTaskId = "6f9a2b1c-4d5e-4f6a-8b7c-9d0e1f2a3b4c";
const unknownId = "8f9a2b1c-4d5e-4f6a-8b7c-9d0e1f2a3b4c";

function payload() {
  return {
    version: 1,
    kind: "project-template",
    name: "Work",
    color: "blue",
    sections: [{ id: sectionId, name: "Todo", order: "a0" }],
    tasks: [
      {
        id: parentTaskId,
        sectionId: null,
        parentId: null,
        content: "Parent task",
        description: null,
        priority: 4,
        recurrence: null,
        durationMinutes: null,
        order: "a0",
      },
      {
        id: taskId,
        sectionId,
        parentId: parentTaskId,
        content: "Child task",
        description: null,
        priority: 1,
        recurrence: "every day",
        durationMinutes: 30,
        order: "a1",
      },
    ],
  };
}

test("valid template passes", () => {
  expect(templateSchema.safeParse(payload()).success).toBe(true);
});

test("dangling sectionId is rejected", () => {
  const data = payload();
  data.tasks[1].sectionId = unknownId;
  expect(templateSchema.safeParse(data).success).toBe(false);
});

test("dangling parentId is rejected", () => {
  const data = payload();
  data.tasks[1].parentId = unknownId;
  expect(templateSchema.safeParse(data).success).toBe(false);
});
