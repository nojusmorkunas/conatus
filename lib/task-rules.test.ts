import { describe, expect, test } from "vitest";

import { cascadedIds, clearedWithSchedule, completedAncestorIds, keyAfterSibling, moveTarget, restoredOrder } from "./task-rules";

const row = (id: string, parentId: string | null, fields: Partial<{ isCompleted: boolean; completedAt: Date | string | null; deletedAt: Date | null }> = {}) => ({
  id,
  parentId,
  isCompleted: false,
  completedAt: null,
  deletedAt: null,
  ...fields,
});

describe("cascadedIds", () => {
  const at = new Date("2026-10-20T10:00:00.000Z");
  const rows = [
    row("a", null, { isCompleted: true, completedAt: at }),
    row("b", "a", { isCompleted: true, completedAt: new Date(at) }),
    row("c", "b", { isCompleted: true, completedAt: "2026-10-20T10:00:00.000Z" }),
    row("old", "a", { isCompleted: true, completedAt: new Date("2026-10-01T00:00:00.000Z") }),
    row("open", "a"),
    row("gone", "a", { deletedAt: at }),
  ];

  test("reopening reopens the ones completed at the same moment, whatever their type", () => {
    expect(cascadedIds(rows, rows[0], false).sort()).toEqual(["b", "c"]);
  });

  test("completing completes the open ones, but not ones in Trash", () => {
    expect(cascadedIds(rows, row("a", null), true)).toEqual(["open"]);
  });

  test("a repeating task moving on reopens every completed one", () => {
    expect(cascadedIds(rows, rows[0], false, true).sort()).toEqual(["b", "c", "old"]);
  });

  test("reopening a task with no completion time carries nothing along", () => {
    expect(cascadedIds(rows, row("a", null, { isCompleted: true }), false)).toEqual([]);
  });
});

test("completedAncestorIds walks up through every parent, once", () => {
  const rows = [row("a", "c", { isCompleted: true }), row("b", "a"), row("c", "a", { isCompleted: true }), row("d", "c", { isCompleted: true, deletedAt: new Date() }), row("e", "d")];
  expect(completedAncestorIds(rows, rows[1])).toEqual(["a", "c"]);
  expect(completedAncestorIds(rows, rows[4])).toEqual(["c", "a"]);
});

describe("clearedWithSchedule", () => {
  const scheduled = { dueDate: "2026-10-26", recurrence: "every day", recurrenceEndDate: "2026-12-01" };

  test("without a due date there is no time, repeat or end", () => {
    expect(clearedWithSchedule(scheduled, { dueDate: null })).toEqual({ dueTime: null, recurrence: null, recurrenceEndDate: null });
    expect(clearedWithSchedule({ ...scheduled, dueDate: null }, { content: "x" } as never)).toEqual({ dueTime: null, recurrence: null, recurrenceEndDate: null });
  });

  test("without a repeat there is no end", () => {
    expect(clearedWithSchedule(scheduled, { recurrence: null })).toEqual({ recurrenceEndDate: null });
    expect(clearedWithSchedule({ ...scheduled, recurrence: null }, {})).toEqual({ recurrenceEndDate: null });
  });

  test("a task with a date and a repeat is left alone", () => {
    expect(clearedWithSchedule(scheduled, { dueDate: "2026-11-01" })).toEqual({});
  });
});

describe("moveTarget", () => {
  const sub = { projectId: "p", sectionId: "s", parentId: "parent" };

  test("a sub-task moved to another section becomes top-level", () => {
    expect(moveTarget(sub, undefined, "t")).toEqual({ projectId: "p", sectionId: "t", parentId: null, movingLists: true });
  });

  test("naming the list it is in moves nothing", () => {
    expect(moveTarget(sub, "p", "s")).toMatchObject({ parentId: "parent", movingLists: false });
    expect(moveTarget(sub, "p", undefined)).toMatchObject({ movingLists: false });
  });

  test("a project move drops the section unless one is named", () => {
    expect(moveTarget(sub, "q", undefined)).toMatchObject({ projectId: "q", sectionId: null, parentId: null, movingLists: true });
    expect(moveTarget(sub, "q", "u")).toMatchObject({ sectionId: "u" });
  });
});

describe("keyAfterSibling", () => {
  const siblings = [{ id: "a", order: "a0" }, { id: "b", order: "a1" }];

  test("first, between, last", () => {
    expect(keyAfterSibling(siblings, null)! < "a0").toBe(true);
    const between = keyAfterSibling(siblings, "a")!;
    expect(between > "a0" && between < "a1").toBe(true);
    expect(keyAfterSibling(siblings, "b")! > "a1").toBe(true);
  });

  test("undefined when the sibling isn't there", () => {
    expect(keyAfterSibling(siblings, "nope")).toBeUndefined();
  });
});

test("restoredOrder keeps a free key and moves a taken one to the end", () => {
  expect(restoredOrder(["a0", "a2"], "a1")).toBe("a1");
  expect(restoredOrder(["a0", "a1", "a3"], "a1")).toBe("a4");
});
