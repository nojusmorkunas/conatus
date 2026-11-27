import { describe, expect, test } from "vitest";

import { labelEntity, taskDto, taskEntity } from "./fixtures";
import { taskEntity as fromDto } from "./outbox";
import { OfflineStore } from "./store";
import { taskView } from "./view";

describe("taskView", () => {
  test("resolves label ids in order and drops ones the store lacks", () => {
    const store = new OfflineStore();
    store.transaction((tx) => tx.labels.upsert([labelEntity({ id: "a", name: "A" }), labelEntity({ id: "b", name: "B" })]));
    const view = taskView(taskEntity({ labelIds: ["b", "gone", "a"] }), store.getSnapshot());
    expect(view.labels.map((label) => label.name)).toEqual(["B", "A"]);
    expect(view).not.toHaveProperty("labelIds");
  });

  test("keeps the task's own fields", () => {
    const task = taskEntity({ content: "Pay rent", dueDate: "2026-10-26", commentCount: 2, completedAt: "2026-10-26T10:00:00.000Z" });
    expect(taskView(task, new OfflineStore().getSnapshot())).toMatchObject({ id: "t", content: "Pay rent", dueDate: "2026-10-26", commentCount: 2, completedAt: task.completedAt, assigneeId: null, labels: [] });
  });

  test("carries the assignee through, from the server row to the view", () => {
    expect(fromDto(taskDto("t", "1", { assigneeId: "u2" })).assigneeId).toBe("u2");
    expect(taskView(taskEntity({ assigneeId: "u1" }), new OfflineStore().getSnapshot()).assigneeId).toBe("u1");
  });
});
