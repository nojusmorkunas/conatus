import { describe, expect, test } from "vitest";

import { completedForSection } from "./completed-tasks";

type Task = {
  id: string;
  sectionId: string | null;
  parentId: string | null;
  isCompleted: boolean;
  completedAt: Date | string | null;
  source: "state" | "history";
};

function task(overrides: Partial<Task> & Pick<Task, "id">): Task {
  return {
    sectionId: null,
    parentId: null,
    isCompleted: true,
    completedAt: "2026-01-01T12:00:00.000Z",
    source: "state",
    ...overrides,
  };
}

describe("completedForSection", () => {
  test("uses the in-memory task when state and history contain the same id", () => {
    const stateTask = task({ id: "same", source: "state" });
    const historyTask = task({ id: "same", source: "history" });

    expect(completedForSection(null, [stateTask], [historyTask])).toEqual([
      stateTask,
    ]);
  });

  test("excludes a restored task that is open in state", () => {
    const restored = task({
      id: "restored",
      isCompleted: false,
      completedAt: null,
      source: "state",
    });
    const staleHistory = task({ id: "restored", source: "history" });

    expect(completedForSection(null, [restored], [staleHistory])).toEqual([]);
  });

  test("returns only tasks from the requested section", () => {
    const sectionTask = task({ id: "section-state", sectionId: "section-a" });
    const sectionHistory = task({
      id: "section-history",
      sectionId: "section-a",
      source: "history",
    });
    const otherSection = task({ id: "other", sectionId: "section-b" });
    const noSection = task({ id: "none", source: "history" });

    expect(
      completedForSection(
        "section-a",
        [sectionTask, otherSection],
        [sectionHistory, noSection],
      ).map((item) => item.id),
    ).toEqual(["section-state", "section-history"]);
  });

  test("sorts mixed Date and string timestamps descending, then ids descending", () => {
    const older = task({
      id: "z",
      completedAt: new Date("2026-01-01T12:00:00.000Z"),
    });
    const newerA = task({
      id: "a",
      completedAt: "2026-02-01T12:00:00.000Z",
      source: "history",
    });
    const newerB = task({
      id: "b",
      completedAt: new Date("2026-02-01T12:00:00.000Z"),
    });

    expect(completedForSection(null, [older, newerB], [newerA]).map((item) => item.id))
      .toEqual(["b", "a", "z"]);
  });
});
