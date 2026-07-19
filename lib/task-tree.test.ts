import { describe, expect, test } from "vitest";

import {
  MAX_TASK_DEPTH,
  TASK_INDENT_WIDTH,
  flattenTaskGroup,
  flattenTaskTree,
  projectTaskDepth,
  visibleFlatRows,
  wouldCreateTaskCycle,
} from "./task-tree";

const tasks = [
  { id: "a", parentId: null, sectionId: null, order: "a0" },
  { id: "b", parentId: "a", sectionId: null, order: "a0" },
  { id: "c", parentId: null, sectionId: null, order: "a1" },
];

const reorderItems = flattenTaskTree([
  { id: "Build", parentId: null, sectionId: "s", order: "a0" },
  { id: "Add", parentId: "Build", sectionId: "s", order: "a0" },
  { id: "Check", parentId: "Build", sectionId: "s", order: "a1" },
  { id: "Prepare", parentId: "Build", sectionId: "s", order: "a2" },
  { id: "Audit", parentId: null, sectionId: "s", order: "a1" },
  { id: "Compress", parentId: null, sectionId: "s", order: "a2" },
]);

const multiSectionReorderItems = [
  ...flattenTaskGroup([
    { id: "Audit", parentId: null, sectionId: "backlog", order: "a0" },
    { id: "Compress", parentId: null, sectionId: "backlog", order: "a1" },
  ], "backlog"),
  ...flattenTaskGroup([
    { id: "Build", parentId: null, sectionId: "inprogress", order: "a0" },
    { id: "Add", parentId: "Build", sectionId: "inprogress", order: "a0" },
    { id: "Check", parentId: "Build", sectionId: "inprogress", order: "a1" },
    { id: "Prepare", parentId: "Build", sectionId: "inprogress", order: "a2" },
  ], "inprogress"),
  ...flattenTaskGroup([
    { id: "Rev", parentId: null, sectionId: "review", order: "a0" },
  ], "review"),
];

describe("task tree", () => {
  test("flattens tasks in pre-order with depths", () => {
    expect(flattenTaskTree(tasks).map(({ id, depth }) => [id, depth])).toEqual([
      ["a", 0], ["b", 1], ["c", 0],
    ]);
  });

  test("flattens all descendants from section roots with an effective section", () => {
    const flattened = flattenTaskGroup([
      { id: "parent", parentId: null, sectionId: "section", order: "a0" },
      { id: "null-child", parentId: "parent", sectionId: null, order: "a0" },
      { id: "other-child", parentId: "parent", sectionId: "other", order: "a1" },
    ], "section");

    expect(flattened.map(({ id, depth, sectionId }) => [id, depth, sectionId])).toEqual([
      ["parent", 0, "section"],
      ["null-child", 1, "section"],
      ["other-child", 1, "section"],
    ]);
  });

  test("filters descendants of collapsed and actively dragged tasks", () => {
    const tree = [
      { id: "a", parentId: null, sectionId: "s", order: "a0" },
      { id: "a1", parentId: "a", sectionId: "s", order: "a0" },
      { id: "a1x", parentId: "a1", sectionId: "s", order: "a0" },
      { id: "b", parentId: null, sectionId: "s", order: "a1" },
      { id: "b1", parentId: "b", sectionId: "s", order: "a0" },
    ];

    expect(visibleFlatRows(tree, "s", { collapsedIds: new Set(["a1"]) })
      .map((row) => row.id)).toEqual(["a", "a1", "b", "b1"]);
    expect(visibleFlatRows(tree, "s", { hiddenSubtreeOf: "a" })
      .map((row) => row.id)).toEqual(["a", "b", "b1"]);
  });

  test("reorders a mismatched-section child with its sibling", () => {
    const items = flattenTaskGroup([
      { id: "parent", parentId: null, sectionId: "section", order: "a0" },
      { id: "legacy", parentId: "parent", sectionId: null, order: "a0" },
      { id: "sibling", parentId: "parent", sectionId: "section", order: "a1" },
    ], "section");

    expect(projectTaskDepth({
      items, activeId: "legacy", overId: "sibling", offsetX: 0,
    })).toEqual({
      depth: 1,
      parentId: "parent",
      sectionId: "section",
      afterId: "sibling",
    });
  });

  test("outdents a mismatched-section child into its parent's section", () => {
    const items = flattenTaskGroup([
      { id: "parent", parentId: null, sectionId: "section", order: "a0" },
      { id: "legacy", parentId: "parent", sectionId: "other", order: "a0" },
      { id: "sibling", parentId: "parent", sectionId: "section", order: "a1" },
    ], "section");

    expect(projectTaskDepth({
      items, activeId: "legacy", overId: "sibling", offsetX: -28,
    })).toEqual({
      depth: 0,
      parentId: null,
      sectionId: "section",
      afterId: "parent",
    });
  });

  test("reorders a child upward between siblings", () => {
    expect(projectTaskDepth({
      items: reorderItems, activeId: "Prepare", overId: "Check", offsetX: 0,
    })).toMatchObject({ depth: 1, parentId: "Build", afterId: "Add" });
  });

  test("reorders a child downward after its sibling", () => {
    expect(projectTaskDepth({
      items: reorderItems, activeId: "Add", overId: "Check", offsetX: 0,
    })).toMatchObject({ depth: 1, parentId: "Build", afterId: "Check" });
  });

  test("reorders a child upward to the first sibling slot", () => {
    expect(projectTaskDepth({
      items: reorderItems, activeId: "Check", overId: "Add", offsetX: 0,
    })).toMatchObject({ depth: 1, parentId: "Build", afterId: null });
  });

  test("promotes the last child when dragged above its parent row", () => {
    expect(projectTaskDepth({
      items: reorderItems, activeId: "Prepare", overId: "Build", offsetX: 0,
    })).toEqual({
      depth: 0,
      parentId: null,
      sectionId: "s",
      afterId: null,
    });
  });

  test("nests a root under the row above by dragging right in place", () => {
    expect(projectTaskDepth({
      items: reorderItems, activeId: "Compress", overId: "Compress", offsetX: 28,
    })).toMatchObject({ depth: 1, parentId: "Audit" });
  });

  test("nests a root downward under its target", () => {
    expect(projectTaskDepth({
      items: reorderItems, activeId: "Audit", overId: "Compress", offsetX: 28,
    })).toMatchObject({ depth: 1, parentId: "Compress" });
  });

  test("nests before the child targeted by a downward drag", () => {
    expect(projectTaskDepth({
      items: flattenTaskTree([
        { id: "A", parentId: null, sectionId: "s", order: "a0" },
        { id: "A1", parentId: "A", sectionId: "s", order: "a0" },
        { id: "B", parentId: null, sectionId: "s", order: "a1" },
      ]), activeId: "B", overId: "A1", offsetX: 28,
    })).toMatchObject({ depth: 1, parentId: "A", afterId: null });
  });

  test("outdents a child to the root in its parent's section", () => {
    expect(projectTaskDepth({
      items: reorderItems,
      activeId: "Prepare",
      overId: "Prepare",
      offsetX: -TASK_INDENT_WIDTH,
    })).toMatchObject({ depth: 0, parentId: null, sectionId: "s" });
  });

  test("does not nest across a section boundary", () => {
    expect(projectTaskDepth({
      items: flattenTaskTree([
        { id: "A", parentId: null, sectionId: "s1", order: "a0" },
        { id: "X", parentId: null, sectionId: "s2", order: "a0" },
      ]), activeId: "X", overId: "A", offsetX: 28,
    })).toMatchObject({ depth: 0, parentId: null, sectionId: "s1" });
  });

  test("caps a moved subtree so its descendants stay within max depth", () => {
    expect(projectTaskDepth({
      items: flattenTaskTree([
        { id: "A", parentId: null, sectionId: "s", order: "a0" },
        { id: "A1", parentId: "A", sectionId: "s", order: "a0" },
        { id: "A2", parentId: "A1", sectionId: "s", order: "a0" },
        { id: "B", parentId: null, sectionId: "s", order: "a1" },
        { id: "B1", parentId: "B", sectionId: "s", order: "a0" },
        { id: "B2", parentId: "B1", sectionId: "s", order: "a0" },
      ]), activeId: "B", overId: "A2", offsetX: 112,
    })).toMatchObject({ depth: MAX_TASK_DEPTH - 2, parentId: "A1" });
  });

  test("detects self and descendant parents", () => {
    expect(wouldCreateTaskCycle(tasks, "a", "a")).toBe(true);
    expect(wouldCreateTaskCycle(tasks, "a", "b")).toBe(true);
    expect(wouldCreateTaskCycle(tasks, "b", "c")).toBe(false);
  });

  test("does not project a task onto its own descendant", () => {
    expect(projectTaskDepth({
      items: flattenTaskTree(tasks), activeId: "a", overId: "b", offsetX: 28,
    })).toBeNull();
  });

  test.each([
    ["reorders up", "Prepare", "Check", 0,
      { depth: 1, parentId: "Build", sectionId: "inprogress", afterId: "Add" }],
    ["promotes the last child above its parent", "Prepare", "Build", 0,
      { depth: 0, parentId: null, sectionId: "inprogress", afterId: null }],
    ["promotes the first child above its parent", "Add", "Build", 0,
      { depth: 0, parentId: null, sectionId: "inprogress", afterId: null }],
    ["reorders down", "Check", "Prepare", 0,
      { depth: 1, parentId: "Build", sectionId: "inprogress", afterId: "Prepare" }],
    ["reorders up to the first child", "Check", "Add", 0,
      { depth: 1, parentId: "Build", sectionId: "inprogress", afterId: null }],
    ["nests a root in place", "Compress", "Compress", 28,
      { depth: 1, parentId: "Audit", sectionId: "backlog", afterId: null }],
    ["nests deeply in place", "Check", "Check", 28,
      { depth: 2, parentId: "Add", sectionId: "inprogress", afterId: null }],
    ["outdents the last child", "Prepare", "Prepare", -28,
      { depth: 0, parentId: null, sectionId: "inprogress", afterId: "Build" }],
    ["moves a root across sections", "Compress", "Build", 0,
      { depth: 0, parentId: null, sectionId: "inprogress", afterId: "Build" }],
  ])("handles multi-section projection: %s", (_name, activeId, overId, offsetX, expected) => {
    expect(projectTaskDepth({
      items: multiSectionReorderItems,
      activeId: activeId as string,
      overId: overId as string,
      offsetX: offsetX as number,
    })).toEqual(expected);
  });
});
