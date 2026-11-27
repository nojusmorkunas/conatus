import { describe, expect, test, vi } from "vitest";

import { projectEntity, taskEntity } from "./fixtures";
import { NoteWrites } from "./notes";
import { OfflineStore, pendingChanges } from "./store";

function setup() {
  const store = new OfflineStore();
  store.transaction((tx) => {
    tx.projects.upsert([projectEntity()]);
    tx.tasks.upsert([taskEntity({ id: "t", content: "Buy milk" })]);
  });
  const requestSync = vi.fn();
  const writes = new NoteWrites(store, requestSync);
  return { store, writes, requestSync, snapshot: () => store.getSnapshot(), queue: () => pendingChanges(store.getSnapshot()) };
}

describe("comments", () => {
  test("add puts the comment in, counts it on the task and queues a create", () => {
    const { writes, snapshot, queue, requestSync } = setup();
    const comment = writes.addComment("t", null, "  Get oat milk ", "u1");
    expect(snapshot().comments.get(comment.id)).toMatchObject({ taskId: "t", projectId: null, content: "Get oat milk", userId: "u1" });
    expect(snapshot().tasks.get("t")!.commentCount).toBe(1);
    expect(queue()).toMatchObject([{ id: comment.id, target: "Comment", kind: "Create", idempotencyKey: expect.any(String), summary: "Comment on “Buy milk”" }]);
    expect(JSON.parse(queue()[0].body)).toEqual({ taskId: "t", content: "Get oat milk" });
    expect(requestSync).toHaveBeenCalled();
  });

  test("a comment on a project names the project", () => {
    const { writes, queue, snapshot } = setup();
    writes.addComment(null, "p", "Plan", null);
    expect(JSON.parse(queue()[0].body)).toEqual({ projectId: "p", content: "Plan" });
    expect(queue()[0].summary).toBe("Comment on “Home”");
    expect(snapshot().tasks.get("t")!.commentCount).toBe(0);
  });

  test("edit changes the text and queues an update, unless nothing changed", () => {
    const { writes, snapshot, queue } = setup();
    const comment = writes.addComment("t", null, "One", "u1");
    writes.editComment(comment, "One");
    expect(queue()).toHaveLength(1);
    writes.editComment(comment, "Two");
    expect(snapshot().comments.get(comment.id)!.content).toBe("Two");
    expect(queue()[1]).toMatchObject({ kind: "Update", id: comment.id });
    expect(JSON.parse(queue()[1].body)).toEqual({ content: "Two" });
  });

  test("deleting a comment the server never had drops its changes and sends nothing", () => {
    const { writes, snapshot, queue } = setup();
    const comment = writes.addComment("t", null, "One", "u1");
    writes.editComment(comment, "Two");
    writes.deleteComment(snapshot().comments.get(comment.id)!);
    expect(queue()).toEqual([]);
    expect(snapshot().comments.size).toBe(0);
    expect(snapshot().tasks.get("t")!.commentCount).toBe(0);
  });

  test("deleting one the server has queues a delete", () => {
    const { store, writes, snapshot, queue } = setup();
    const comment = { id: "c1", taskId: "t", projectId: null, content: "Hi", createdAt: "2026-10-26T10:00:00.000Z", updatedAt: "2026-10-26T10:00:00.000Z", userId: "u1" };
    store.transaction((tx) => {
      tx.comments.upsert([comment]);
      tx.tasks.upsert([{ ...snapshot().tasks.get("t")!, commentCount: 1 }]);
    });
    writes.deleteComment(comment);
    expect(snapshot().comments.size).toBe(0);
    expect(snapshot().tasks.get("t")!.commentCount).toBe(0);
    expect(queue()).toMatchObject([{ id: "c1", target: "Comment", kind: "Delete", summary: "Delete a comment on “Buy milk”" }]);
  });
});

describe("reminders", () => {
  test("add queues a create in the shape the server takes", () => {
    const { writes, snapshot, queue } = setup();
    const reminder = writes.addReminder("t", "2026-10-30T18:00:00Z");
    expect(snapshot().reminders.get(reminder.id)).toEqual({ id: reminder.id, taskId: "t", remindAt: "2026-10-30T18:00:00.000Z" });
    expect(queue()).toMatchObject([{ target: "Reminder", kind: "Create", idempotencyKey: expect.any(String), summary: "Add a reminder on “Buy milk”" }]);
    expect(JSON.parse(queue()[0].body)).toEqual({ taskId: "t", remindAt: "2026-10-30T18:00:00.000Z" });
  });

  test("delete of one the server has queues a delete, of a local one just drops it", () => {
    const { store, writes, snapshot, queue } = setup();
    const local = writes.addReminder("t", "2026-10-30T18:00:00Z");
    writes.deleteReminder(local);
    expect(queue()).toEqual([]);
    const theirs = { id: "r1", taskId: "t", remindAt: "2026-10-30T18:00:00.000Z" };
    store.transaction((tx) => tx.reminders.upsert([theirs]));
    writes.deleteReminder(theirs);
    expect(snapshot().reminders.size).toBe(0);
    expect(queue()).toMatchObject([{ id: "r1", kind: "Delete", summary: "Remove a reminder on “Buy milk”" }]);
  });

  test("snooze moves a reminder, or re-adds one the server never had", () => {
    const { store, writes, snapshot, queue } = setup();
    const theirs = { id: "r1", taskId: "t", remindAt: "2026-10-30T18:00:00.000Z" };
    store.transaction((tx) => tx.reminders.upsert([theirs]));
    writes.snooze(theirs, "2026-10-30T19:00:00Z");
    expect(snapshot().reminders.get("r1")!.remindAt).toBe("2026-10-30T19:00:00.000Z");
    expect(JSON.parse(queue()[0].body)).toEqual({ remindAt: "2026-10-30T19:00:00.000Z" });

    const local = writes.addReminder("t", "2026-11-01T08:00:00Z");
    writes.snooze(local, "2026-11-02T08:00:00Z");
    const mine = [...snapshot().reminders.values()].filter((reminder) => reminder.id.startsWith("local:"));
    expect(mine.map((reminder) => reminder.remindAt)).toEqual(["2026-11-02T08:00:00.000Z"]);
    expect(queue().filter((change) => change.kind === "Create")).toHaveLength(1);
  });
});
