import { describe, expect, test } from "vitest";

import { change, taskEntity } from "./fixtures";
import { baseFor, merge } from "./merge";

const base = taskEntity();

/** The local copy changed [fields] of the base. */
const queued = (fields: string[], seq = 1) => change(seq, "t", { base: JSON.stringify(baseFor(base, fields)) });

describe("merge", () => {
  test("a field only the client changed keeps the client's value", () => {
    const local = { ...base, content: "Pay the rent" };
    const merged = merge(local, { ...base, updatedAt: "2" }, [queued(["content"])]);
    expect(merged.task).toEqual({ ...base, content: "Pay the rent", updatedAt: "2" });
    expect(merged.conflicts).toEqual({});
  });

  test("changes to different fields both survive", () => {
    const local = { ...base, content: "Pay the rent" };
    const merged = merge(local, { ...base, dueDate: "2026-10-30", updatedAt: "2" }, [queued(["content"])]);
    expect(merged.task).toEqual({ ...base, content: "Pay the rent", dueDate: "2026-10-30", updatedAt: "2" });
    expect(merged.conflicts).toEqual({});
  });

  test("the same change on both sides is no conflict", () => {
    const local = { ...base, priority: 1 };
    expect(merge(local, { ...base, priority: 1 }, [queued(["priority"])]).conflicts).toEqual({});
  });

  test("a field both sides changed differently is a conflict, showing the client's meanwhile", () => {
    const local = { ...base, dueDate: "2026-10-27" };
    const merged = merge(local, { ...base, dueDate: "2026-11-02" }, [queued(["dueDate"])]);
    expect(merged.task.dueDate).toBe("2026-10-27");
    expect(JSON.stringify(merged.conflicts)).toBe('{"dueDate":"2026-11-02"}');
  });

  test("a field changed twice here compares against what it was first", () => {
    const local = { ...base, content: "Third" };
    const changes = [queued(["content"], 1), change(2, "t", { base: JSON.stringify(baseFor({ ...base, content: "Second" }, ["content"])) })];
    // The server still has the original, so the local edits go through.
    expect(merge(local, base, changes).conflicts).toEqual({});
  });

  test("labels compare as a set", () => {
    const local = { ...base, labelIds: ["x", "y"] };
    expect(merge(local, { ...base, labelIds: ["y", "x"] }, [queued(["labelIds"])]).conflicts).toEqual({});
  });

  test("completing here while the server left it open completes it", () => {
    const local = { ...base, isCompleted: true, completedAt: "2026-10-26T10:00:00.000Z" };
    const merged = merge(local, { ...base, updatedAt: "2" }, [queued(["completed"])]);
    expect(merged.task).toMatchObject({ isCompleted: true, completedAt: expect.any(String) });
    expect(merged.conflicts).toEqual({});
  });
});
