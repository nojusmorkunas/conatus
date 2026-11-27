import { describe, expect, test, vi } from "vitest";

import { labelEntity, projectEntity, sectionEntity, taskEntity } from "./fixtures";
import { baseFor } from "./merge";
import { OfflineStore, pendingChanges } from "./store";
import { descendants, noDate, orderAtEnd, quickAddTask, TaskWrites, uploadOrder } from "./task-writes";
import type { TaskEntity } from "./types";

const TODAY = "2026-10-26";

function setup(...seed: Partial<TaskEntity>[]) {
  const store = new OfflineStore();
  store.transaction((tx) => {
    tx.projects.upsert([projectEntity()]);
    tx.tasks.upsert(seed.map((fields) => taskEntity({ dueDate: null, labelIds: [], ...fields })));
  });
  const requestSync = vi.fn();
  const writes = new TaskWrites(store, requestSync, () => TODAY, () => undefined, () => "UTC");
  const task = (id: string) => store.getSnapshot().tasks.get(id)!;
  const queue = () => pendingChanges(store.getSnapshot());
  const body = (index = 0) => JSON.parse(queue()[index].body);
  return { store, writes, requestSync, task, queue, body };
}

describe("complete", () => {
  test("completes a task and queues it with what it replaced", () => {
    const { writes, task, queue, body, requestSync } = setup({ id: "a" });
    writes.complete(task("a"));
    expect(task("a")).toMatchObject({ isCompleted: true, completedAt: expect.any(String) });
    expect(queue()).toMatchObject([{ id: "a", target: "Task", kind: "Complete", base: '{"completed":false}', summary: "Complete “Pay rent”" }]);
    expect(body()).toEqual({ completed: true });
    expect(requestSync).toHaveBeenCalledTimes(1);
  });

  test("completes the open sub-tasks too, at the same moment, and leaves ones in Trash alone", () => {
    const { writes, task } = setup(
      { id: "a" },
      { id: "b", parentId: "a" },
      { id: "c", parentId: "b" },
      { id: "d", parentId: "a", isCompleted: true, completedAt: "2026-10-01T00:00:00.000Z" },
      { id: "e", parentId: "a", deletedAt: "2026-10-02T00:00:00.000Z" },
    );
    writes.complete(task("a"));
    const at = task("a").completedAt;
    expect(task("b")).toMatchObject({ isCompleted: true, completedAt: at });
    expect(task("c")).toMatchObject({ isCompleted: true, completedAt: at });
    expect(task("d").completedAt).toBe("2026-10-01T00:00:00.000Z");
    expect(task("e").isCompleted).toBe(false);
  });

  test("a repeating task moves to its next date, as the server moves it, and records the date it replaced", () => {
    const { writes, task, queue } = setup({ id: "a", recurrence: "every day", dueDate: "2026-10-26" });
    writes.complete(task("a"));
    expect(task("a")).toMatchObject({ isCompleted: false, dueDate: "2026-10-27", completedAt: null });
    expect(JSON.parse(queue()[0].base!)).toEqual({ completed: false, dueDate: "2026-10-26" });
  });

  test("moving a repeating task on reopens its completed sub-tasks and leaves the open ones", () => {
    const { writes, task } = setup(
      { id: "a", recurrence: "every day", dueDate: "2026-10-26" },
      { id: "b", parentId: "a", isCompleted: true, completedAt: "2026-10-01T00:00:00.000Z" },
      { id: "c", parentId: "a" },
    );
    writes.complete(task("a"));
    expect(task("b")).toMatchObject({ isCompleted: false, completedAt: null });
    expect(task("c").isCompleted).toBe(false);
  });

  test("past its end date a repeating task completes for good, with its sub-tasks", () => {
    const { writes, task } = setup({ id: "a", recurrence: "every day", dueDate: "2026-10-26", recurrenceEndDate: "2026-10-26" }, { id: "b", parentId: "a" });
    writes.complete(task("a"));
    expect(task("a")).toMatchObject({ isCompleted: true, dueDate: "2026-10-26" });
    expect(task("b").isCompleted).toBe(true);
  });

  test("the last occurrence on the end date still advances", () => {
    const { writes, task } = setup({ id: "a", recurrence: "every day", dueDate: "2026-10-26", recurrenceEndDate: "2026-10-27" });
    writes.complete(task("a"));
    expect(task("a")).toMatchObject({ isCompleted: false, dueDate: "2026-10-27" });
  });
});

describe("undo of a completion", () => {
  test("before it was sent, takes the change back and puts every task as it was", () => {
    const { writes, task, queue } = setup({ id: "a" }, { id: "b", parentId: "a" });
    const completion = writes.complete(task("a"));
    writes.undo(completion);
    expect(task("a")).toMatchObject({ isCompleted: false, completedAt: null });
    expect(task("b")).toMatchObject({ isCompleted: false, completedAt: null });
    expect(queue()).toEqual([]);
  });

  test("before it was sent, a repeating task gets its date and checklist back", () => {
    const { writes, task, queue } = setup(
      { id: "a", recurrence: "every day", dueDate: "2026-10-26" },
      { id: "b", parentId: "a", isCompleted: true, completedAt: "2026-10-01T00:00:00.000Z" },
    );
    writes.undo(writes.complete(task("a")));
    expect(task("a").dueDate).toBe("2026-10-26");
    expect(task("b")).toMatchObject({ isCompleted: true, completedAt: "2026-10-01T00:00:00.000Z" });
    expect(queue()).toEqual([]);
  });

  test("after it was sent, reopens the task and what was completed with it", () => {
    const { writes, store, task, queue, body } = setup({ id: "a" }, { id: "b", parentId: "a" });
    const completion = writes.complete(task("a"));
    store.transaction((tx) => tx.changes.delete([completion.seq]));
    writes.undo(completion);
    expect(task("a").isCompleted).toBe(false);
    expect(task("b").isCompleted).toBe(false);
    expect(queue()).toMatchObject([{ kind: "Reopen", base: '{"completed":true}' }]);
    expect(body()).toEqual({ completed: false });
  });

  test("after it was sent, a repeating task moves back to its date", () => {
    const { writes, store, task, queue, body } = setup({ id: "a", recurrence: "every day", dueDate: "2026-10-26" });
    const completion = writes.complete(task("a"));
    store.transaction((tx) => tx.changes.delete([completion.seq]));
    writes.undo(completion);
    expect(task("a").dueDate).toBe("2026-10-26");
    expect(queue()).toMatchObject([{ kind: "Update", base: '{"dueDate":"2026-10-27"}' }]);
    expect(body()).toEqual({ dueDate: "2026-10-26" });
  });
});

describe("reopen", () => {
  const completedAt = "2026-10-20T10:00:00.000Z";

  test("reopens the sub-tasks completed with it and the completed parents, not sub-tasks completed earlier", () => {
    const { writes, task, queue, body } = setup(
      { id: "top", isCompleted: true, completedAt: "2026-10-21T00:00:00.000Z" },
      { id: "a", parentId: "top", isCompleted: true, completedAt },
      { id: "b", parentId: "a", isCompleted: true, completedAt },
      { id: "old", parentId: "a", isCompleted: true, completedAt: "2026-10-01T00:00:00.000Z" },
    );
    writes.reopen(task("a"));
    expect(task("a")).toMatchObject({ isCompleted: false, completedAt: null });
    expect(task("b").isCompleted).toBe(false);
    expect(task("top").isCompleted).toBe(false);
    expect(task("old").isCompleted).toBe(true);
    expect(queue()).toMatchObject([{ kind: "Reopen", base: '{"completed":true}' }]);
    expect(body()).toEqual({ completed: false });
  });

  test("a completion not sent yet is taken back instead", () => {
    const { writes, task, queue } = setup({ id: "a" }, { id: "b", parentId: "a" });
    writes.complete(task("a"));
    writes.reopen(task("a"));
    expect(queue()).toEqual([]);
    expect(task("a").isCompleted).toBe(false);
    expect(task("b").isCompleted).toBe(false);
  });
});

describe("move", () => {
  test("a sub-task moved on its own becomes top-level at the end of the section", () => {
    const { writes, store, task, queue, body } = setup({ id: "parent" }, { id: "sub", parentId: "parent", order: "a0" }, { id: "last", sectionId: "s", order: "a5" });
    writes.move(task("sub"), "p", "s");
    expect(task("sub")).toMatchObject({ parentId: null, sectionId: "s", order: "a6" });
    expect(queue()).toMatchObject([{ kind: "Update", summary: "Move “Pay rent”" }]);
    expect(body()).toEqual({ projectId: "p", sectionId: "s" });
    expect(JSON.parse(queue()[0].base!)).toEqual({ projectId: "p", sectionId: null, parentId: "parent" });
    expect(store.getSnapshot().tasks.get("parent")).toMatchObject({ parentId: null });
  });

  test("a parent takes its whole subtree along, and a project move drops the section", () => {
    const { writes, task } = setup({ id: "a", sectionId: "s" }, { id: "b", parentId: "a", sectionId: "s" }, { id: "c", parentId: "b", sectionId: "s" });
    writes.move(task("a"), "other", null);
    for (const id of ["a", "b", "c"]) expect(task(id)).toMatchObject({ projectId: "other", sectionId: null });
    expect(task("b").parentId).toBe("a");
  });

  test("moving a task to where it already is does nothing", () => {
    const { writes, task, queue, requestSync } = setup({ id: "a", sectionId: "s" });
    writes.move(task("a"), "p", "s");
    expect(queue()).toEqual([]);
    expect(requestSync).not.toHaveBeenCalled();
  });
});

describe("place", () => {
  test("puts the task between two siblings and takes its subtree into the section", () => {
    const { writes, task, queue, body } = setup(
      { id: "a", order: "a0", sectionId: "s" },
      { id: "b", order: "a1", sectionId: "s" },
      { id: "m", order: "a5", sectionId: null },
      { id: "mk", parentId: "m", sectionId: null },
    );
    writes.place(task("m"), "s", null, "a");
    expect(task("m")).toMatchObject({ sectionId: "s", parentId: null });
    expect(task("m").order > "a0" && task("m").order < "a1").toBe(true);
    expect(task("mk").sectionId).toBe("s");
    expect(queue()).toMatchObject([{ kind: "Place" }]);
    expect(body()).toEqual({ sectionId: "s", parentId: null, afterId: "a" });
    expect(JSON.parse(queue()[0].base!)).toEqual({ sectionId: null, parentId: null });
  });

  test("first when nothing is before it, and under a parent it takes the parent's section", () => {
    const { writes, task } = setup({ id: "a", order: "a0", sectionId: "s" }, { id: "x", order: "a3", parentId: "a", sectionId: "s" }, { id: "m", order: "a5" });
    writes.place(task("m"), null, "a", null);
    expect(task("m")).toMatchObject({ parentId: "a", sectionId: "s" });
    expect(task("m").order < "a3").toBe(true);
  });

  test("leaves tasks in Trash out of the order", () => {
    const { writes, task } = setup({ id: "a", order: "a0" }, { id: "gone", order: "a1", deletedAt: "2026-10-01T00:00:00.000Z" }, { id: "b", order: "a2" }, { id: "m", order: "a3" });
    writes.place(task("m"), null, null, "a");
    expect(task("m").order > "a0" && task("m").order < "a2").toBe(true);
  });
});

describe("update", () => {
  test("applies the edit and records the values it replaced", () => {
    const { writes, task, queue, body } = setup({ id: "a", content: "Pay rent", priority: 4, dueDate: "2026-10-26" });
    writes.update(task("a"), { content: "  Pay the rent ", priority: 2, dueDate: "2026-10-30" });
    expect(task("a")).toMatchObject({ content: "Pay the rent", priority: 2, dueDate: "2026-10-30" });
    expect(body()).toEqual({ content: "Pay the rent", priority: 2, dueDate: "2026-10-30" });
    expect(JSON.parse(queue()[0].base!)).toEqual({ content: "Pay rent", priority: 4, dueDate: "2026-10-26" });
  });

  test("clearing the date clears its time, repeat and end date, as the server does", () => {
    const { writes, task, body } = setup({ id: "a", dueDate: "2026-10-26", dueTime: "09:00", recurrence: "every day", recurrenceEndDate: "2026-12-01" });
    writes.update(task("a"), noDate);
    expect(task("a")).toMatchObject({ dueDate: null, dueTime: null, recurrence: null, recurrenceEndDate: null });
    expect(body()).toEqual({ dueDate: null, dueTime: null, recurrence: null });
  });

  test("clearing the repeat clears its end date, and the repeat is stored in its canonical wording", () => {
    const { writes, task, body } = setup({ id: "a", dueDate: "2026-10-26", recurrence: "every day", recurrenceEndDate: "2026-12-01" }, { id: "b", dueDate: "2026-10-26" });
    writes.update(task("a"), { recurrence: null });
    expect(task("a")).toMatchObject({ recurrence: null, recurrenceEndDate: null });
    expect(body()).toEqual({ recurrence: null });
    writes.update(task("b"), { recurrence: "Every Day" });
    expect(task("b").recurrence).toBe("every day");
    expect(body(1)).toEqual({ recurrence: "every day" });
  });

  test("an edit with nothing set sends nothing", () => {
    const { writes, task, queue } = setup({ id: "a" });
    writes.update(task("a"), {});
    expect(queue()).toEqual([]);
  });
});

describe("setLabels", () => {
  test("sets the task's labels and records the ones it had", () => {
    const { writes, task, queue, body } = setup({ id: "a", labelIds: ["y", "x"] });
    writes.setLabels(task("a"), ["z"]);
    expect(task("a").labelIds).toEqual(["z"]);
    expect(body()).toEqual({ labelIds: ["z"] });
    expect(queue()[0]).toMatchObject({ kind: "SetLabels", base: '{"labelIds":["x","y"]}' });
  });
});

describe("delete", () => {
  test("sends the task and its whole subtree to Trash with one queued delete", () => {
    const { writes, task, queue, body } = setup({ id: "a" }, { id: "b", parentId: "a" }, { id: "c", parentId: "b" }, { id: "other" });
    const deletion = writes.delete(task("a"));
    for (const id of ["a", "b", "c"]) expect(task(id).deletedAt).toEqual(expect.any(String));
    expect(task("other").deletedAt).toBeNull();
    expect(queue()).toMatchObject([{ id: "a", kind: "Delete" }]);
    expect(body()).toEqual({});
    expect(deletion).toMatchObject({ seq: queue()[0].seq, dropped: [] });
    expect(deletion.descendants.map((t) => t.id).sort()).toEqual(["b", "c"]);
  });

  test("drops the queued changes of tasks the server never had", () => {
    const { writes, store, task, queue } = setup({ id: "a" });
    const made = writes.quickAdd("New", { projectId: "p", parentId: "a" });
    writes.update(made, { priority: 1 });
    expect(queue().map((change) => change.kind)).toEqual(["Create", "Update"]);
    const deletion = writes.delete(task("a"));
    // The server's Delete of "a" is all that's left.
    expect(queue().map((change) => [change.id, change.kind])).toEqual([["a", "Delete"]]);
    expect(deletion.dropped.map((change) => change.kind)).toEqual(["Create", "Update"]);
    expect(store.getSnapshot().tasks.get(made.id)!.deletedAt).not.toBeNull();
  });

  test("a task the server never had is deleted without queueing anything", () => {
    const { writes, task, queue } = setup();
    const made = writes.quickAdd("New", { projectId: "p" });
    const deletion = writes.delete(task(made.id));
    expect(queue()).toEqual([]);
    expect(deletion.seq).toBeNull();
    expect(task(made.id).deletedAt).not.toBeNull();
  });
});

describe("undoDelete", () => {
  test("a delete still queued is taken back, with the changes it dropped", () => {
    const { writes, task, queue } = setup({ id: "a" });
    const made = writes.quickAdd("New", { projectId: "p", parentId: "a" });
    const before = queue().map((change) => change.kind);
    writes.undoDelete(writes.delete(task("a")));
    expect(task("a").deletedAt).toBeNull();
    expect(task(made.id).deletedAt).toBeNull();
    expect(queue().map((change) => change.kind)).toEqual(before);
    expect(queue()[0].id).toBe(made.id);
  });

  test("a delete already sent is restored from Trash, and the dropped creates follow the restore", () => {
    const { writes, store, task, queue } = setup({ id: "a" });
    const made = writes.quickAdd("New", { projectId: "p", parentId: "a" });
    const deletion = writes.delete(task("a"));
    store.transaction((tx) => tx.changes.delete([deletion.seq!]));
    writes.undoDelete(deletion);
    expect(task("a").deletedAt).toBeNull();
    expect(queue().map((change) => [change.id, change.kind])).toEqual([["a", "Restore"], [made.id, "Create"]]);
    expect(task(made.id).deletedAt).toBeNull();
  });

  test("a task the server never had comes back without a queued change", () => {
    const { writes, task, queue } = setup();
    const made = writes.quickAdd("New", { projectId: "p" });
    const create = queue()[0];
    const deletion = writes.delete(task(made.id));
    writes.undoDelete(deletion);
    expect(task(made.id).deletedAt).toBeNull();
    expect(queue()).toEqual([{ ...create, seq: expect.any(Number) }]);
  });
});

describe("restore", () => {
  const trashed = "2026-10-20T10:00:00.000Z";

  test("brings the task back with its whole subtree and queues one restore", () => {
    const { writes, task, queue, body } = setup({ id: "a", deletedAt: trashed }, { id: "b", parentId: "a", deletedAt: trashed }, { id: "c", parentId: "b", deletedAt: "2026-10-01T00:00:00.000Z" });
    writes.restore(task("a"));
    for (const id of ["a", "b", "c"]) expect(task(id).deletedAt).toBeNull();
    expect(queue()).toMatchObject([{ id: "a", kind: "Restore" }]);
    expect(body()).toEqual({});
  });

  test("a key a sibling took meanwhile goes to the end, as the server does", () => {
    const { writes, task } = setup({ id: "a", order: "a1", deletedAt: trashed }, { id: "b", order: "a1" }, { id: "c", order: "a3" });
    writes.restore(task("a"));
    expect(task("a").order).toBe("a4");
  });

  test("a task the server never had is created again, with its sub-tasks", () => {
    const { writes, task, queue } = setup();
    const made = writes.quickAdd("New", { projectId: "p" });
    const sub = writes.quickAdd("Sub", { projectId: "p", parentId: made.id });
    writes.delete(task(made.id));
    expect(queue()).toEqual([]);
    writes.restore(task(made.id));
    expect(task(sub.id).deletedAt).toBeNull();
    expect(queue().map((change) => [change.id, change.kind])).toEqual([[made.id, "Create"], [sub.id, "Create"]]);
    expect(JSON.parse(queue()[1].body)).toMatchObject({ parentId: made.id });
  });
});

describe("quickAdd", () => {
  function withLists() {
    const s = setup();
    s.store.transaction((tx) => {
      tx.projects.upsert([projectEntity({ id: "inbox", name: "Inbox", isInbox: true, order: "a0" }), projectEntity({ id: "groceries", name: "Groceries", order: "a1" }), projectEntity({ id: "gone", name: "Old", order: "a2", isArchived: true })]);
      tx.labels.upsert([labelEntity({ id: "errand", name: "errand" })]);
      tx.sections.upsert([sectionEntity({ id: "aisle", projectId: "groceries" })]);
    });
    return s;
  }

  test("reads #project, @label, a date, a time and a priority", () => {
    const { writes, queue, body, task } = withLists();
    const made = writes.quickAdd("Buy milk #groceries @errand tomorrow at 5pm p2 for 30 min");
    expect(task(made.id)).toMatchObject({ content: "Buy milk", projectId: "groceries", sectionId: null, priority: 2, dueDate: "2026-10-27", dueTime: "17:00", durationMinutes: 30, labelIds: ["errand"] });
    expect(queue().map((change) => change.kind)).toEqual(["Create", "SetLabels"]);
    expect(body(0)).toEqual({ projectId: "groceries", content: "Buy milk", priority: 2, dueDate: "2026-10-27", dueTime: "17:00", durationMinutes: 30 });
    expect(body(1)).toEqual({ labelIds: ["errand"] });
    expect(queue()[0]).toMatchObject({ idempotencyKey: expect.any(String), summary: "Add “Buy milk”" });
    expect(queue()[1].base).toBe('{"labelIds":[]}');
  });

  test("falls back to the Inbox, then to the place it was added from", () => {
    const { writes, task } = withLists();
    expect(task(writes.quickAdd("One").id).projectId).toBe("inbox");
    expect(task(writes.quickAdd("Two", { projectId: "groceries", sectionId: "aisle" }).id)).toMatchObject({ projectId: "groceries", sectionId: "aisle" });
    // A project that's archived isn't one to add to; the text stays.
    expect(task(writes.quickAdd("Three #old").id)).toMatchObject({ projectId: "inbox", content: "Three #old" });
  });

  test("names another project and the section it was added from no longer applies", () => {
    const { writes, task } = withLists();
    expect(task(writes.quickAdd("x #inbox", { projectId: "groceries", sectionId: "aisle" }).id)).toMatchObject({ projectId: "inbox", sectionId: null });
  });

  test("makes an Inbox when there is none yet, and the task names it", () => {
    const { writes, task, store } = setup();
    store.transaction((tx) => tx.projects.delete(["p"]));
    const made = writes.quickAdd("First");
    expect(made.projectId).toBe("local:inbox");
    expect(store.getSnapshot().projects.get("local:inbox")).toMatchObject({ isInbox: true });
    expect(task(made.id).projectId).toBe("local:inbox");
  });

  test("a sub-task goes under its parent, in its section, and the text can't name another project", () => {
    const { writes, task, queue } = withLists();
    const parent = writes.quickAdd("Parent #groceries");
    const inAisle = writes.quickAdd("Parent2", { projectId: "groceries", sectionId: "aisle" });
    const sub = writes.quickAdd("Sub #inbox", { projectId: "groceries", sectionId: "aisle", parentId: inAisle.id });
    expect(task(parent.id).projectId).toBe("groceries");
    expect(task(sub.id)).toMatchObject({ projectId: "groceries", sectionId: "aisle", parentId: inAisle.id, content: "Sub #inbox" });
    const create = queue().find((change) => change.id === sub.id)!;
    expect(JSON.parse(create.body)).toEqual({ projectId: "groceries", parentId: inAisle.id, content: "Sub #inbox", priority: 4 });
  });

  test("a repeat gives the task its first date, and a picked place wins over the text", () => {
    const { writes, task, queue } = withLists();
    const made = writes.quickAdd("Water plants every monday #inbox", {}, { projectId: "groceries", sectionId: "aisle" });
    expect(task(made.id)).toMatchObject({ projectId: "groceries", sectionId: "aisle", recurrence: "every monday", dueDate: "2026-11-02" });
    expect(JSON.parse(queue()[0].body)).toMatchObject({ recurrence: "every monday", dueDate: "2026-11-02", sectionId: "aisle" });
  });

  test("puts the task at the end of its list", () => {
    const { writes, task, store } = withLists();
    store.transaction((tx) => tx.tasks.upsert([taskEntity({ id: "t1", projectId: "groceries", order: "a4" }), taskEntity({ id: "t2", projectId: "groceries", parentId: "t1", order: "a9" })]));
    expect(task(writes.quickAdd("x #groceries").id).order).toBe("a5");
  });

  test("a reminder in the text or picked is queued after the create, in the user's time zone", () => {
    const { writes, queue } = withLists();
    const made = writes.quickAdd("Call mum remind me tomorrow at 9am", {}, { reminders: ["2026-10-30T18:00"] });
    expect(queue().map((change) => [change.target, change.kind])).toEqual([["Task", "Create"], ["Reminder", "Create"], ["Reminder", "Create"]]);
    expect(queue().slice(1).map((change) => JSON.parse(change.body))).toEqual([
      { taskId: made.id, remindAt: "2026-10-27T09:00:00.000Z" },
      { taskId: made.id, remindAt: "2026-10-30T18:00:00.000Z" },
    ]);
  });
});

describe("quickAddTask", () => {
  test("a time whose date went with the text gets today's", () => {
    const parsed = { content: "x", projectName: null, labelNames: [], priority: 4 as const, dueDate: null, dueTime: "09:00", recurrence: null, deadlineDate: null, durationMinutes: null, reminderAt: null };
    expect(quickAddTask(parsed, {}, [], TODAY).dueDate).toBe(TODAY);
    expect(quickAddTask({ ...parsed, dueTime: null }, {}, [], TODAY).dueDate).toBeNull();
    expect(quickAddTask(parsed, { edit: { dueDate: "2026-11-01" } }, [], TODAY).dueDate).toBe("2026-11-01");
  });
});

describe("helpers", () => {
  test("uploadOrder creates parents before sub-tasks and completes sub-tasks first", () => {
    const [creates, completes] = uploadOrder([
      taskEntity({ id: "sub", parentId: "top", order: "a0", isCompleted: true }),
      taskEntity({ id: "top2", order: "a2" }),
      taskEntity({ id: "top", order: "a1", isCompleted: true }),
    ]);
    expect(creates.map((t) => t.id)).toEqual(["top", "top2", "sub"]);
    expect(completes.map((t) => t.id)).toEqual(["sub", "top"]);
  });

  test("create queues tasks that are already in the local copy", () => {
    const { writes, queue, store } = setup();
    const made = taskEntity({ id: "local:x", content: "Made", labelIds: [], isCompleted: true, order: "a0" });
    store.transaction((tx) => tx.tasks.upsert([made]));
    writes.create([made], false);
    expect(queue().map((change) => change.kind)).toEqual(["Create", "Complete"]);
    expect(queue()[1].base).toBe('{"completed":false}');
  });

  test("descendants and orderAtEnd", () => {
    const { store } = setup({ id: "a" }, { id: "b", parentId: "a", order: "a3" }, { id: "c", parentId: "b" }, { id: "d", parentId: "a", order: "a7", deletedAt: "x" });
    store.transaction((tx) => {
      expect(descendants(tx, "a").map((t) => t.id).sort()).toEqual(["b", "c", "d"]);
      expect(orderAtEnd(tx, "p", null, "a")).toBe("a4");
    });
  });

  test("baseFor reads what an edit will replace", () => {
    expect(baseFor(taskEntity({ recurrenceEndDate: "2026-12-01" }), ["recurrenceEndDate"])).toEqual({ recurrenceEndDate: "2026-12-01" });
  });
});
