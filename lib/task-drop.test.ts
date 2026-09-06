import { describe, expect, test } from "vitest";
import { projectTaskDrop, type TaskDropTarget } from "./task-drop";
import { flattenTaskGroup, MAX_TASK_DEPTH, subtreeIds, type TreeTask } from "./task-tree";

const tree: TreeTask[] = [
  { id: "a", parentId: null, sectionId: "one", order: "a0" },
  { id: "b", parentId: null, sectionId: "one", order: "a1" },
  { id: "c", parentId: null, sectionId: "one", order: "a2" },
  { id: "parent", parentId: null, sectionId: "two", order: "a0" },
  { id: "child", parentId: "parent", sectionId: "two", order: "a0" },
  { id: "grandchild", parentId: "child", sectionId: "two", order: "a0" },
  { id: "sibling", parentId: "parent", sectionId: "two", order: "a1" },
  { id: "last", parentId: null, sectionId: "two", order: "a1" },
];
const items = ["one", "two"].flatMap(id => flattenTaskGroup(tree, id));
const visibleIds = new Set(items.map(item => item.id));

function drop(activeId: string, overId: string | null, edge: TaskDropTarget["edge"], offsetX = 0, sectionId = "two", hidden: string[] = [], indentWidth = 28) {
  return projectTaskDrop({ items, visibleIds: new Set([...visibleIds].filter(id => !hidden.includes(id))), activeId,
    target: { overId, edge, sectionId }, offsetX, indentWidth });
}

describe("task insertion gaps", () => {
  test.each([
    ["b", "a", "before", null, "a"],
    ["b", "a", "after", "a", "c"],
    ["a", "c", "before", "b", "c"],
    ["a", "c", "after", "c", null],
  ] as const)("%s goes %s %s regardless of pickup direction", (active, over, edge, afterId, beforeId) => {
    expect(drop(active, over, edge, 0, "one")).toMatchObject({ afterId, beforeId, depth: 0, parentId: null });
  });

  test("crosses into the first slot without jumping to the end", () => {
    expect(drop("b", "parent", "before")).toEqual({ sectionId: "two", parentId: null, afterId: null, beforeId: "parent", depth: 0 });
  });

  test("a vertical root drag cannot split or silently join a subtree", () => {
    expect(drop("b", "parent", "after")).toMatchObject({ afterId: "parent", beforeId: "last", depth: 0, parentId: null });
    expect(drop("last", "child", "before")).toMatchObject({ afterId: "parent", beforeId: null, depth: 0, parentId: null });
  });

  test("deliberate horizontal movement inserts before existing children", () => {
    expect(drop("b", "parent", "after", 28)).toMatchObject({ depth: 1, parentId: "parent", afterId: null, beforeId: "child" });
  });

  test("a collapsed parent's hidden children never shift the visual target", () => {
    expect(drop("last", "last", "before", 28, "two", ["child", "grandchild", "sibling"]))
      .toMatchObject({ depth: 1, parentId: "parent", afterId: "sibling", beforeId: null });
  });

  test("can promote the first child without splitting the remaining children", () => {
    expect(drop("child", "child", "after", -28)).toMatchObject({ depth: 0, parentId: null, afterId: "parent", beforeId: "last" });
  });

  test("a child above its own parent becomes a root", () => {
    expect(drop("sibling", "parent", "before")).toMatchObject({ depth: 0, parentId: null, afterId: null, beforeId: "parent" });
  });

  test.each(["before", "after"] as const)("keeps the original gap on the %s half of the active row", edge => {
    expect(drop("b", "b", edge, 0, "one")).toMatchObject({ afterId: "a", beforeId: "c" });
  });

  test.each([-20, -10, 10, 20])("tolerates %ipx of horizontal drift", x => {
    expect(drop("sibling", "sibling", "after", x)?.depth).toBe(1);
  });

  test.each([[20, 14, 0], [20, 15, 1], [28, 20, 0], [28, 21, 1]])("uses a %ipx indent with a %ipx drag", (indent, x, depth) => {
    expect(drop("b", "b", "after", x, "one", [], indent)?.depth).toBe(depth);
  });

  test("supports empty and collapsed section destinations", () => {
    expect(drop("child", null, "after", 0, "empty")).toEqual({ depth: 0, parentId: null, sectionId: "empty", afterId: null, beforeId: null });
    expect(drop("b", null, "after", 0, "two", ["parent", "child", "grandchild", "sibling", "last"]))
      .toMatchObject({ depth: 0, parentId: null, beforeId: null, afterId: "last" });
  });

  test("rejects self-descendant targets and unknown rows", () => {
    expect(drop("parent", "grandchild", "after", 90)).toBeNull();
    expect(drop("missing", "last", "after")).toBeNull();
    expect(drop("b", "missing", "after")).toBeNull();
  });

  test("all destinations preserve acyclic trees, section boundaries and the depth limit", () => {
    for (const active of items) {
      const descendants = subtreeIds(items, active.id);
      const height = Math.max(...items.filter(item => descendants.has(item.id)).map(item => item.depth - active.depth));
      for (const over of items) for (const edge of ["before", "after"] as const) for (const x of [-200, -28, 0, 28, 200]) {
        const result = drop(active.id, over.id, edge, x, over.sectionId!);
        if (!result) continue;
        expect(result.depth + height).toBeLessThanOrEqual(MAX_TASK_DEPTH);
        expect(result.sectionId).toBe(over.sectionId);
        if (result.parentId) {
          expect(descendants.has(result.parentId)).toBe(false);
          const parent = items.find(item => item.id === result.parentId)!;
          expect(parent.depth).toBe(result.depth - 1);
          expect(parent.sectionId).toBe(result.sectionId);
        } else expect(result.depth).toBe(0);
        if (result.afterId) expect(items.find(item => item.id === result.afterId)?.parentId).toBe(result.parentId);
      }
    }
  });
});
