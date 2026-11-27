import { afterEach, describe, expect, test, vi } from "vitest";

import { api } from "./api";
import { change, taskEntity } from "./fixtures";
import { nextToSend, Outbox, outcomeFor } from "./outbox";
import { OfflineStore, pendingChanges } from "./store";

describe("nextToSend", () => {
  test("sends in order", () => {
    expect(nextToSend([change(2, "b"), change(1, "a"), change(3, "c")])?.seq).toBe(1);
  });

  test("a rejected change holds back later changes to the same task, not to others", () => {
    expect(nextToSend([change(1, "a", { failure: "Gone" }), change(2, "a"), change(3, "b")])?.seq).toBe(3);
  });

  test("a task in conflict sends nothing until the user picks a side", () => {
    expect(nextToSend([change(1, "a"), change(2, "b")], new Set(["a"]))?.seq).toBe(2);
  });

  test("changes to a task made here wait for its create", () => {
    const create = change(1, "local:x", { kind: "Create" });
    expect(nextToSend([create, change(2, "local:x", { kind: "Complete" })])?.seq).toBe(1);
    // Once the add has failed, nothing for that task goes out.
    expect(nextToSend([{ ...create, failure: "No project" }, change(2, "local:x", { kind: "Complete" })])).toBeNull();
    // And a change can't overtake its add even if the add is not in the queue.
    expect(nextToSend([change(2, "local:x", { kind: "Complete" })])).toBeNull();
  });

  test("a change that names something not created yet waits for it", () => {
    const inProject = change(2, "local:task", { kind: "Create", body: '{"projectId":"local:project"}' });
    expect(nextToSend([change(1, "local:project", { kind: "Create", target: "Project" }), inProject])?.seq).toBe(1);
    expect(nextToSend([inProject])).toBeNull();
  });

  test("nothing to send when the queue is empty or everything failed", () => {
    expect(nextToSend([])).toBeNull();
    expect(nextToSend([change(1, "a", { failure: "No access" })])).toBeNull();
  });
});

describe("outcomeFor", () => {
  test("server and network trouble means try again later", () => {
    for (const status of [408, 429, 500, 502, 503]) expect(outcomeFor("Update", status, null, false)).toEqual({ kind: "tryLater" });
    expect(outcomeFor("Create", 409, "still in progress", true)).toEqual({ kind: "tryLater" });
  });

  test("a revoked session signs out", () => {
    expect(outcomeFor("Complete", 401, null, false)).toEqual({ kind: "signedOut" });
  });

  test("deleting a task that's already gone counts as done", () => {
    expect(outcomeFor("Delete", 404, null, false)).toEqual({ kind: "sent" });
  });

  test("rejections keep a reason the user can read", () => {
    expect(outcomeFor("Complete", 404, null, false)).toMatchObject({ kind: "rejected", reason: expect.stringContaining("no longer exists") });
    expect(outcomeFor("Create", 404, null, false)).toMatchObject({ kind: "rejected", reason: expect.stringContaining("project or task") });
    expect(outcomeFor("Create", 400, "Project “Nope” was not found", false)).toEqual({ kind: "rejected", reason: "Project “Nope” was not found" });
    expect(outcomeFor("Update", 403, null, false)).toMatchObject({ kind: "rejected", reason: expect.stringContaining("access") });
    expect(outcomeFor("Update", 422, null, false)).toEqual({ kind: "rejected", reason: "The server rejected this change (error 422)." });
    // A 409 without Retry-After is a key reused for a different body: retrying won't help.
    expect(outcomeFor("Create", 409, null, false).kind).toBe("rejected");
  });
});

type Reply = { status?: number; body?: unknown; headers?: Record<string, string> } | "offline";

/** A fetch that answers by "METHOD path" and remembers what it was asked. */
function serve(replies: Record<string, Reply | (() => Reply)>) {
  const fetch = vi.fn(async (path: string, init: RequestInit) => {
    const key = `${init.method} ${path}`;
    const reply = replies[key];
    const answer = typeof reply === "function" ? reply() : reply;
    if (answer === "offline") throw new TypeError("Failed to fetch");
    if (!answer) throw new Error(`Unexpected ${key}`);
    return new Response(answer.body === undefined ? null : JSON.stringify(answer.body), { status: answer.status ?? 200, headers: answer.headers });
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

const sent = (fetch: ReturnType<typeof serve>) => fetch.mock.calls.map(([path, init]) => `${init.method} ${path}`);

function queue(...changes: Parameters<OfflineStore["transaction"]>[0][]) {
  const store = new OfflineStore();
  for (const fill of changes) store.transaction(fill);
  return { store, outbox: new Outbox(store) };
}

describe("Outbox.push", () => {
  afterEach(() => vi.unstubAllGlobals());

  test("sends each change in order, with the create's idempotency key, and clears the queue", async () => {
    const fetch = serve({ "POST /api/v1/tasks": { body: { id: "srv-1" } }, "PATCH /api/v1/tasks/srv-1": {} });
    const { store, outbox } = queue((tx) => {
      tx.tasks.upsert([taskEntity({ id: "local:a" })]);
      tx.changes.add({ id: "local:a", kind: "Create", body: '{"content":"x"}', summary: "", idempotencyKey: "key-1" });
      tx.changes.add({ id: "local:a", kind: "Update", body: '{"priority":1}', summary: "" });
    });
    expect(await outbox.push(api)).toBe("Done");
    expect(sent(fetch)).toEqual(["POST /api/v1/tasks", "PATCH /api/v1/tasks/srv-1"]);
    expect(fetch.mock.calls[0][1]).toMatchObject({ body: '{"content":"x"}', headers: { "Idempotency-Key": "key-1", "Content-Type": "application/json" } });
    expect(store.getSnapshot().changes.size).toBe(0);
  });

  test("a create without a key gets one before it goes out, and keeps it", async () => {
    const fetch = serve({ "POST /api/v1/tasks": { status: 503 } });
    const { store, outbox } = queue((tx) => tx.changes.add({ id: "local:a", kind: "Create", body: "{}", summary: "" }));
    expect(await outbox.push(api)).toBe("TryLater");
    const key = pendingChanges(store.getSnapshot())[0].idempotencyKey;
    expect(key).toBeTruthy();
    expect(fetch.mock.calls[0][1]).toMatchObject({ headers: { "Idempotency-Key": key } });
  });

  test("the server's id replaces the local one everywhere it is named, queued changes included", async () => {
    serve({
      "POST /api/v1/projects": { body: { id: "P" } },
      "POST /api/v1/tasks": { body: { id: "T" } },
      "PATCH /api/v1/tasks/T": {},
    });
    const { store, outbox } = queue((tx) => {
      tx.projects.upsert([
        { id: "local:p", parentId: null, name: "New", color: "gray", icon: null, isFavorite: false, isInbox: false, order: "a", shared: false, isArchived: false, deletedAt: null },
        { id: "local:child", parentId: "local:p", name: "Sub", color: "gray", icon: null, isFavorite: false, isInbox: false, order: "b", shared: false, isArchived: false, deletedAt: null },
      ]);
      tx.sections.upsert([{ id: "s", projectId: "local:p", name: "S", order: "a", isArchived: false }]);
      tx.tasks.upsert([
        taskEntity({ id: "local:t", projectId: "local:p" }),
        taskEntity({ id: "local:sub", projectId: "local:p", parentId: "local:t" }),
      ]);
      tx.comments.upsert([{ id: "c", taskId: null, projectId: "local:p", content: "", createdAt: "", updatedAt: "", userId: null }]);
      tx.changes.add({ id: "local:p", kind: "Create", target: "Project", body: '{"name":"New"}', summary: "", idempotencyKey: "k1" });
      tx.changes.add({ id: "local:t", kind: "Create", body: '{"projectId":"local:p","content":"t"}', summary: "", idempotencyKey: "k2" });
      tx.changes.add({ id: "local:t", kind: "Update", body: '{"priority":1}', summary: "" });
      tx.changes.add({ id: "local:sub", kind: "Create", body: '{"parentId":"local:t"}', summary: "", idempotencyKey: "k3", failure: "held" });
    });
    // The project's create goes first and the task, which names the project, only after it.
    expect(await outbox.push(api)).toBe("Done");
    const after = store.getSnapshot();
    expect([...after.projects.keys()].sort()).toEqual(["P", "local:child"].sort());
    expect(after.projects.get("local:child")?.parentId).toBe("P");
    expect(after.sections.get("s")?.projectId).toBe("P");
    expect(after.comments.get("c")?.projectId).toBe("P");
    expect([...after.tasks.keys()].sort()).toEqual(["T", "local:sub"]);
    expect(after.tasks.get("T")?.projectId).toBe("P");
    expect(after.tasks.get("local:sub")).toMatchObject({ projectId: "P", parentId: "T" });
    const [held] = pendingChanges(after);
    expect(held).toMatchObject({ id: "local:sub", body: '{"parentId":"T"}' });
    expect(outbox.renamedTo("local:t")).toBe("T");
  });

  test("remembers the server id in the store, so a reload still resolves the old one", async () => {
    serve({ "POST /api/v1/tasks": { body: { id: "T" } } });
    const { store, outbox } = queue((tx) => {
      tx.tasks.upsert([taskEntity({ id: "local:t" })]);
      tx.changes.add({ id: "local:t", kind: "Create", body: "{}", summary: "", idempotencyKey: "k" });
    });
    await outbox.push(api);
    expect(store.getSnapshot().meta.aliases).toEqual({ "local:t": "T" });
    const reloaded = new OfflineStore();
    reloaded.load({ tasks: [], projects: [], sections: [], labels: [], filters: [], comments: [], reminders: [], changes: [], conflicts: [], meta: store.getSnapshot().meta });
    expect(new Outbox(reloaded).renamedTo("local:t")).toBe("T");
  });

  test("renames labels in tasks, sections in tasks, and a task's comments and reminders", async () => {
    serve({ "POST /api/v1/labels": { body: { id: "L" } }, "POST /api/v1/sections": { body: { id: "S" } }, "POST /api/v1/tasks": { body: { id: "T" } } });
    const { store, outbox } = queue((tx) => {
      tx.tasks.upsert([taskEntity({ id: "t", labelIds: ["local:l", "y"], sectionId: "local:s" }), taskEntity({ id: "local:t" })]);
      tx.comments.upsert([{ id: "c", taskId: "local:t", projectId: null, content: "", createdAt: "", updatedAt: "", userId: null }]);
      tx.reminders.upsert([{ id: "r", taskId: "local:t", remindAt: "2026-10-26T10:00:00.000Z" }]);
      tx.labels.upsert([{ id: "local:l", name: "l", color: "gray", isFavorite: false, order: "a" }]);
      tx.changes.add({ id: "local:l", kind: "Create", target: "Label", body: "{}", summary: "", idempotencyKey: "a" });
      tx.changes.add({ id: "local:s", kind: "Create", target: "Section", body: "{}", summary: "", idempotencyKey: "b" });
      tx.changes.add({ id: "local:t", kind: "Create", body: "{}", summary: "", idempotencyKey: "c" });
    });
    await outbox.push(api);
    const after = store.getSnapshot();
    expect(after.tasks.get("t")).toMatchObject({ labelIds: ["L", "y"], sectionId: "S" });
    expect(after.labels.has("L")).toBe(true);
    expect(after.comments.get("c")?.taskId).toBe("T");
    expect(after.reminders.get("r")?.taskId).toBe("T");
  });

  test("a filter goes to /api/v1/filters and takes its server id", async () => {
    const fetch = serve({ "POST /api/v1/filters": { body: { id: "F" } }, "PATCH /api/v1/filters/F": {}, "DELETE /api/v1/filters/F": {} });
    const { store, outbox } = queue((tx) => {
      tx.filters.upsert([{ id: "local:f", name: "n", query: "p1", isFavorite: false, order: "a" }]);
      tx.changes.add({ id: "local:f", kind: "Create", target: "Filter", body: '{"name":"n","query":"p1"}', summary: "", idempotencyKey: "a" });
      tx.changes.add({ id: "local:f", kind: "Update", target: "Filter", body: '{"isFavorite":true}', summary: "" });
      tx.changes.add({ id: "local:f", kind: "Delete", target: "Filter", body: "{}", summary: "" });
    });
    await outbox.push(api);
    expect(sent(fetch)).toEqual(["POST /api/v1/filters", "PATCH /api/v1/filters/F", "DELETE /api/v1/filters/F"]);
    expect(store.getSnapshot().filters.has("F")).toBe(true);
  });

  test("a rejected change keeps its reason and holds back its own later changes only", async () => {
    const fetch = serve({
      "PATCH /api/v1/tasks/a": { status: 400, body: { error: { content: ["Required"] } } },
      "PATCH /api/v1/tasks/b": {},
    });
    const { store, outbox } = queue((tx) => {
      tx.changes.add({ id: "a", kind: "Update", body: "{}", summary: "" });
      tx.changes.add({ id: "a", kind: "Complete", body: "{}", summary: "" });
      tx.changes.add({ id: "b", kind: "Update", body: "{}", summary: "" });
    });
    expect(await outbox.push(api)).toBe("Done");
    expect(sent(fetch)).toEqual(["PATCH /api/v1/tasks/a", "PATCH /api/v1/tasks/b"]);
    expect(pendingChanges(store.getSnapshot()).map((c) => [c.id, c.failure])).toEqual([["a", "content: Required"], ["a", null]]);
  });

  test("a conflicted task sends nothing", async () => {
    const fetch = serve({});
    const { outbox } = queue((tx) => {
      tx.changes.add({ id: "a", kind: "Update", body: "{}", summary: "" });
      tx.conflicts.upsert([{ taskId: "a", theirs: "{}", deleted: false }]);
    });
    expect(await outbox.push(api)).toBe("Done");
    expect(fetch).not.toHaveBeenCalled();
  });

  test("stops and keeps the queue when offline or the server struggles, and tells when signed out", async () => {
    const fill = (tx: Parameters<Parameters<OfflineStore["transaction"]>[0]>[0]) => {
      tx.changes.add({ id: "a", kind: "Update", body: "{}", summary: "" });
      tx.changes.add({ id: "b", kind: "Update", body: "{}", summary: "" });
    };
    for (const [reply, result] of [["offline", "TryLater"], [{ status: 503 }, "TryLater"], [{ status: 429, headers: { "Retry-After": "30" } }, "TryLater"], [{ status: 401 }, "SignedOut"]] as const) {
      const fetch = serve({ "PATCH /api/v1/tasks/a": reply });
      const { store, outbox } = queue(fill);
      expect(await outbox.push(api)).toBe(result);
      expect(fetch).toHaveBeenCalledOnce();
      expect(store.getSnapshot().changes.size).toBe(2);
      expect(pendingChanges(store.getSnapshot())[0].failure).toBeNull();
    }
  });

  test("a 409 that says the request is still running is retried later, one that doesn't is rejected", async () => {
    serve({ "POST /api/v1/tasks": { status: 409, body: { error: "A request with this Idempotency-Key is still in progress" }, headers: { "Retry-After": "1" } } });
    const first = queue((tx) => tx.changes.add({ id: "local:a", kind: "Create", body: "{}", summary: "", idempotencyKey: "k" }));
    expect(await first.outbox.push(api)).toBe("TryLater");

    serve({ "POST /api/v1/tasks": { status: 409, body: { error: "This Idempotency-Key was already used with a different request" } } });
    const second = queue((tx) => tx.changes.add({ id: "local:a", kind: "Create", body: "{}", summary: "", idempotencyKey: "k" }));
    expect(await second.outbox.push(api)).toBe("Done");
    expect(pendingChanges(second.store.getSnapshot())[0].failure).toBe("This Idempotency-Key was already used with a different request");
  });

  test("deletes and restores go to their own endpoints; a delete of a vanished task is done", async () => {
    const fetch = serve({
      "DELETE /api/v1/tasks/a": { status: 404 },
      "POST /api/v1/trash/tasks/b/restore": {},
      "POST /api/v1/trash/projects/c/restore": {},
      "PATCH /api/v1/reminders/r": { status: 404 },
    });
    const { store, outbox } = queue((tx) => {
      tx.changes.add({ id: "a", kind: "Delete", body: "{}", summary: "" });
      tx.changes.add({ id: "b", kind: "Restore", body: "{}", summary: "" });
      tx.changes.add({ id: "c", kind: "Restore", target: "Project", body: "{}", summary: "" });
      tx.changes.add({ id: "r", kind: "Update", target: "Reminder", body: '{"seen":true}', summary: "" });
    });
    expect(await outbox.push(api)).toBe("Done");
    expect(sent(fetch)).toHaveLength(4);
    expect(store.getSnapshot().changes.size).toBe(0);
  });
});

describe("settling", () => {
  afterEach(() => vi.unstubAllGlobals());

  test("retry lets a rejected change go out again", () => {
    const { store, outbox } = queue((tx) => tx.changes.add({ id: "a", kind: "Update", body: "{}", summary: "", failure: "No" }));
    outbox.retry(pendingChanges(store.getSnapshot())[0]);
    expect(pendingChanges(store.getSnapshot())[0].failure).toBeNull();
  });

  test("discard drops the change and what came after, and puts the server's task back", async () => {
    serve({ "GET /api/v1/tasks/a": { body: { id: "a", projectId: "p", content: "Server", description: null, labels: [], updatedAt: "2", priority: 4, order: "a" } } });
    const { store, outbox } = queue((tx) => {
      tx.tasks.upsert([taskEntity({ id: "a", content: "Mine" })]);
      tx.changes.add({ id: "a", kind: "Update", body: "{}", summary: "", failure: "No" });
      tx.changes.add({ id: "a", kind: "Update", body: "{}", summary: "" });
      tx.changes.add({ id: "b", kind: "Update", body: "{}", summary: "" });
    });
    await outbox.discard(pendingChanges(store.getSnapshot())[0], api);
    expect(store.getSnapshot().tasks.get("a")?.content).toBe("Server");
    expect(pendingChanges(store.getSnapshot()).map((c) => c.id)).toEqual(["b"]);
  });

  test("discard removes the task when the server no longer has it, or it never had it", async () => {
    serve({ "GET /api/v1/tasks/a": { status: 404 } });
    const { store, outbox } = queue((tx) => {
      tx.tasks.upsert([taskEntity({ id: "a" }), taskEntity({ id: "local:b" })]);
      tx.changes.add({ id: "a", kind: "Update", body: "{}", summary: "", failure: "No" });
      tx.changes.add({ id: "local:b", kind: "Create", body: "{}", summary: "", failure: "No" });
    });
    for (const c of pendingChanges(store.getSnapshot())) await outbox.discard(c, api);
    expect(store.getSnapshot().tasks.size).toBe(0);
  });

  const conflicted = () =>
    queue((tx) => {
      tx.tasks.upsert([taskEntity({ content: "Mine", dueDate: "2026-10-27" })]);
      tx.changes.add({ id: "t", kind: "Update", body: '{"content":"Mine","dueDate":"2026-10-27"}', summary: "", base: '{"content":"Pay rent","dueDate":"2026-10-26"}' });
      tx.changes.add({ id: "t", kind: "SetLabels", body: '{"labelIds":["y"]}', summary: "", base: '{"labelIds":["x"]}' });
      tx.conflicts.upsert([{ taskId: "t", theirs: '{"content":"Theirs"}', deleted: false }]);
    });

  test("keepMine takes the other device's values as the base, so the next sync sees no conflict", () => {
    const { store, outbox } = conflicted();
    outbox.keepMine(store.getSnapshot().conflicts.get("t")!);
    const [update, labels] = pendingChanges(store.getSnapshot());
    expect(update.base).toBe('{"content":"Theirs","dueDate":"2026-10-26"}');
    expect(labels.base).toBe('{"labelIds":["x"]}');
    expect(store.getSnapshot().conflicts.size).toBe(0);
  });

  test("keepTheirs drops the local changes to the conflicting fields and shows the server's value", () => {
    const { store, outbox } = conflicted();
    outbox.keepTheirs(store.getSnapshot().conflicts.get("t")!);
    const [update, labels] = pendingChanges(store.getSnapshot());
    expect(update).toMatchObject({ body: '{"dueDate":"2026-10-27"}', base: '{"dueDate":"2026-10-26"}' });
    expect(labels.kind).toBe("SetLabels");
    expect(store.getSnapshot().tasks.get("t")).toMatchObject({ content: "Theirs", dueDate: "2026-10-27" });
  });

  test("keepTheirs on a whole-act change drops it", () => {
    const { store, outbox } = queue((tx) => {
      tx.tasks.upsert([taskEntity()]);
      tx.changes.add({ id: "t", kind: "Complete", body: '{"completed":true}', summary: "", base: '{"completed":false}' });
      tx.conflicts.upsert([{ taskId: "t", theirs: '{"completed":true}', deleted: false }]);
    });
    outbox.keepTheirs(store.getSnapshot().conflicts.get("t")!);
    expect(store.getSnapshot().changes.size).toBe(0);
  });

  test("when the server deleted it, keepMine restores it first and keepTheirs removes it", () => {
    const deleted = () =>
      queue((tx) => {
        tx.tasks.upsert([taskEntity({ deletedAt: null })]);
        tx.changes.add({ id: "t", kind: "Update", body: '{"priority":1}', summary: "", failure: "No" });
        tx.conflicts.upsert([{ taskId: "t", theirs: "{}", deleted: true }]);
      });
    const mine = deleted();
    mine.outbox.keepMine(mine.store.getSnapshot().conflicts.get("t")!);
    expect(pendingChanges(mine.store.getSnapshot()).map((c) => c.kind)).toEqual(["Restore", "Update"]);

    const theirs = deleted();
    theirs.outbox.keepTheirs(theirs.store.getSnapshot().conflicts.get("t")!);
    expect(theirs.store.getSnapshot().tasks.size).toBe(0);
    expect(theirs.store.getSnapshot().changes.size).toBe(0);
  });
});
