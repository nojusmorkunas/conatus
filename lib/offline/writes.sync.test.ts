import { afterEach, expect, test, vi } from "vitest";

import { labelEntity, projectEntity } from "./fixtures";
import { NoteWrites } from "./notes";
import { Outbox } from "./outbox";
import { OfflineStore, pendingChanges } from "./store";
import { SyncRepository } from "./sync";
import { TaskWrites } from "./task-writes";

afterEach(() => vi.unstubAllGlobals());

test("a quick add, a comment and a repeat go to the right endpoints with the right bodies, and the local ids become the server's", async () => {
  const store = new OfflineStore();
  const home = projectEntity({ id: "home", name: "Home" });
  const errand = labelEntity({ id: "errand" });
  store.transaction((tx) => {
    tx.projects.upsert([projectEntity({ id: "inbox", name: "Inbox", isInbox: true }), home]);
    tx.labels.upsert([errand]);
  });
  const requestSync = vi.fn();
  const tasks = new TaskWrites(store, requestSync, () => "2026-10-26", () => undefined, () => "UTC");
  const notes = new NoteWrites(store, requestSync);

  const made = tasks.quickAdd("Buy milk #Home @errand p2 tomorrow remind me tomorrow at 9am");
  notes.addComment(made.id, null, "Oat, not soy", "u1");
  tasks.update(store.getSnapshot().tasks.get(made.id)!, { description: "Two litres" });
  expect(requestSync).toHaveBeenCalledTimes(3);

  const calls: { method: string; path: string; body: unknown; key: string | null }[] = [];
  const answers: Record<string, unknown> = {
    "GET /api/v1/projects": [
      { id: "inbox", parentId: null, name: "Inbox", color: "gray", icon: null, isFavorite: false, isInbox: true, order: "a0", isArchived: false },
      { id: "home", parentId: null, name: "Home", color: "gray", icon: null, isFavorite: false, isInbox: false, order: "a0", isArchived: false },
    ],
    "GET /api/v1/sections": [],
    "GET /api/v1/labels": [errand],
    "GET /api/v1/filters": [],
    "GET /api/v1/tasks": { items: [], nextCursor: null, serverTime: "2026-10-26T12:00:00.000Z" },
    "POST /api/v1/tasks": { id: "srv-task" },
    "PATCH /api/v1/tasks/srv-task": {},
    "POST /api/v1/reminders": { id: "srv-reminder" },
    "POST /api/v1/comments": { id: "srv-comment" },
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init: RequestInit) => {
      const route = `${init.method} ${path.split("?")[0]}`;
      const headers = init.headers as Record<string, string>;
      calls.push({ method: init.method!, path: path.split("?")[0], body: init.body ? JSON.parse(init.body as string) : undefined, key: headers["Idempotency-Key"] ?? null });
      if (!(route in answers)) throw new Error(`Unexpected ${route}`);
      return new Response(JSON.stringify(answers[route]), { status: init.method === "POST" && path.startsWith("/api/v1/tasks") && !path.includes("?") ? 201 : 200 });
    }),
  );

  const outbox = new Outbox(store);
  expect(await new SyncRepository("u", store, outbox).sync()).toBeNull();

  const writesSent = calls.filter((call) => call.method !== "GET");
  expect(writesSent).toEqual([
    {
      method: "POST",
      path: "/api/v1/tasks",
      body: { projectId: "home", content: "Buy milk", priority: 2, dueDate: "2026-10-27" },
      key: expect.any(String),
    },
    { method: "PATCH", path: "/api/v1/tasks/srv-task", body: { labelIds: ["errand"] }, key: null },
    { method: "POST", path: "/api/v1/reminders", body: { taskId: "srv-task", remindAt: "2026-10-27T09:00:00.000Z" }, key: expect.any(String) },
    { method: "POST", path: "/api/v1/comments", body: { taskId: "srv-task", content: "Oat, not soy" }, key: expect.any(String) },
    { method: "PATCH", path: "/api/v1/tasks/srv-task", body: { description: "Two litres" }, key: null },
  ]);

  const snapshot = store.getSnapshot();
  expect(pendingChanges(snapshot)).toEqual([]);
  expect(outbox.renamedTo(made.id)).toBe("srv-task");
  expect([...snapshot.tasks.keys()]).toEqual(["srv-task"]);
  expect(snapshot.tasks.get("srv-task")).toMatchObject({ content: "Buy milk", description: "Two litres", labelIds: ["errand"], commentCount: 1 });
  expect([...snapshot.comments.values()].map((comment) => [comment.id, comment.taskId])).toEqual([["srv-comment", "srv-task"]]);
  expect([...snapshot.reminders.values()].map((reminder) => [reminder.id, reminder.taskId])).toEqual([["srv-reminder", "srv-task"]]);
});
