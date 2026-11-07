import { describe, expect, test } from "vitest";

import { compareTasks, type SortBy } from "./task-sort";

type Task = Parameters<typeof compareTasks>[1];

const tasks: Task[] = [
  { content: "alpha", dueDate: null, dueTime: null, order: "c", priority: 3 },
  { content: "Bravo", dueDate: "2026-07-20", dueTime: null, order: "b", priority: 1 },
  { content: "charlie", dueDate: "2026-07-18", dueTime: null, order: "a", priority: 1 },
];

function sorted(sortBy: SortBy, list = tasks) {
  return [...list].sort((a, b) => compareTasks(sortBy, a, b)).map((task) => task.content);
}

describe("compareTasks", () => {
  test.each([
    ["due", ["charlie", "Bravo", "alpha"]],
    ["priority", ["charlie", "Bravo", "alpha"]],
    ["name", ["alpha", "Bravo", "charlie"]],
  ] as const)("sorts by %s", (sortBy, expected) => {
    expect(sorted(sortBy)).toEqual(expected);
  });

  test("sorts a day's timed tasks by time, then untimed ones by manual order", () => {
    const day = [
      { content: "clean garage", dueDate: "2026-07-18", dueTime: null, order: "a", priority: 4 },
      { content: "pickup", dueDate: "2026-07-18", dueTime: "15:00", order: "b", priority: 4 },
      { content: "pantry", dueDate: "2026-07-18", dueTime: null, order: "c", priority: 4 },
      { content: "drop-off", dueDate: "2026-07-18", dueTime: "08:15", order: "d", priority: 4 },
      { content: "tomorrow", dueDate: "2026-07-19", dueTime: "07:00", order: "e", priority: 4 },
    ];
    expect(sorted("due", day)).toEqual(["drop-off", "pickup", "clean garage", "pantry", "tomorrow"]);
  });

  test.each([
    [
      { content: "alpha", dueDate: null, dueTime: null, order: "b", priority: 4 },
      { content: "ALPHA", dueDate: null, dueTime: null, order: "a", priority: 4 },
    ],
  ])("uses manual order when names differ only by case", (first, second) => {
    expect(compareTasks("name", first, second)).toBeGreaterThan(0);
  });
});
