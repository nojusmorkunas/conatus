import { describe, expect, test } from "vitest";

import { compareTasks, type SortBy } from "./task-sort";

const tasks = [
  { content: "alpha", dueDate: null, order: "c", priority: 3 },
  { content: "Bravo", dueDate: "2026-07-20", order: "b", priority: 1 },
  { content: "charlie", dueDate: "2026-07-18", order: "a", priority: 1 },
];

function sorted(sortBy: SortBy) {
  return [...tasks].sort((a, b) => compareTasks(sortBy, a, b)).map((task) => task.content);
}

describe("compareTasks", () => {
  test.each([
    ["due", ["charlie", "Bravo", "alpha"]],
    ["priority", ["charlie", "Bravo", "alpha"]],
    ["name", ["alpha", "Bravo", "charlie"]],
  ] as const)("sorts by %s", (sortBy, expected) => {
    expect(sorted(sortBy)).toEqual(expected);
  });

  test.each([
    [
      { content: "alpha", dueDate: null, order: "b", priority: 4 },
      { content: "ALPHA", dueDate: null, order: "a", priority: 4 },
    ],
  ])("uses manual order when names differ only by case", (first, second) => {
    expect(compareTasks("name", first, second)).toBeGreaterThan(0);
  });
});
