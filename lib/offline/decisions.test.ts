import { describe, expect, test } from "vitest";

import { conflictLines } from "./decisions";
import { taskEntity } from "./fixtures";

const context = { labels: new Map([["x", { id: "x", name: "Home", color: "blue", isFavorite: false, order: "a" }]]), today: "2026-10-26", dateFormat: "yyyy-MM-dd", repeats: (rule: string) => rule };

describe("conflictLines", () => {
  test("shows each conflicting field with both values", () => {
    const task = taskEntity({ content: "Mine", dueDate: "2026-10-27" });
    const lines = conflictLines(task, { taskId: "t", theirs: JSON.stringify({ content: "Theirs", dueDate: null, labelIds: [] }), deleted: false }, context);
    expect(lines).toEqual([
      { field: "Name", mine: "Mine", theirs: "Theirs" },
      { field: "Date", mine: "Tomorrow", theirs: "No date" },
      { field: "Labels", mine: "Home", theirs: "No labels" },
    ]);
  });

  test("a task deleted elsewhere has no fields to compare", () => {
    expect(conflictLines(taskEntity(), { taskId: "t", theirs: "{}", deleted: true }, context)).toEqual([]);
  });
});
