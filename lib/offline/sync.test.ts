import { afterEach, describe, expect, test, vi } from "vitest";

import type { ConatusApi } from "./api";
import { HttpError, OfflineError } from "./api";
import { taskDto, taskEntity } from "./fixtures";
import { baseFor } from "./merge";
import { Outbox } from "./outbox";
import { OfflineStore } from "./store";
import { fetchTaskChanges, planTaskChanges, SyncRepository } from "./sync";
import type { ProjectDto, TaskPage } from "./types";

describe("fetchTaskChanges", () => {
  test("follows nextCursor through every page and keeps the first page's serverTime", async () => {
    const pages: Record<string, TaskPage> = {
      first: { items: [taskDto("a", "2026-10-26T10:00:00.000Z")], nextCursor: "c1", serverTime: "2026-10-26T12:00:00.000Z" },
      c1: { items: [taskDto("b", "2026-10-26T09:00:00.000Z")], nextCursor: "c2", serverTime: "2026-10-26T12:00:05.000Z" },
      c2: { items: [taskDto("c", "2026-10-26T08:00:00.000Z")], nextCursor: null, serverTime: "2026-10-26T12:00:09.000Z" },
    };
    const asked: (string | null)[] = [];
    const changes = await fetchTaskChanges(async (cursor) => {
      asked.push(cursor);
      return pages[cursor ?? "first"];
    });
    expect(asked).toEqual([null, "c1", "c2"]);
    expect(changes.items.map((t) => t.id)).toEqual(["a", "b", "c"]);
    expect(changes.serverTime).toBe("2026-10-26T12:00:00.000Z");
  });

  test("an empty first page still gives a serverTime to sync from", async () => {
    const changes = await fetchTaskChanges(async () => ({ items: [], nextCursor: null, serverTime: "2026-10-26T12:00:00.000Z" }));
    expect(changes).toEqual({ items: [], serverTime: "2026-10-26T12:00:00.000Z" });
  });
});

describe("planTaskChanges", () => {
  test("deleted tasks become deletions and the rest upserts", () => {
    const plan = planTaskChanges([
      taskDto("live", "2026-10-26T10:00:00.000Z"),
      taskDto("gone", "2026-10-26T10:00:00.000Z", { deletedAt: "2026-10-26T10:00:00.000Z" }),
    ]);
    expect(plan.upserts.map((t) => t.id)).toEqual(["live"]);
    expect(plan.deleted.map((t) => t.id)).toEqual(["gone"]);
  });

  test("a task seen twice while paging keeps its newest version", () => {
    const plan = planTaskChanges([
      taskDto("a", "2026-10-26T10:00:00.000Z", { content: "old" }),
      taskDto("a", "2026-10-26T10:00:01.500Z", { content: "new" }),
      taskDto("a", "2026-10-26T09:59:59.000Z", { content: "older" }),
    ]);
    expect(plan.upserts.map((t) => t.content)).toEqual(["new"]);
  });

  test("a task deleted after an edit on another page ends up deleted", () => {
    const plan = planTaskChanges([
      taskDto("a", "2026-10-26T10:00:05.000Z", { deletedAt: "2026-10-26T10:00:05.000Z" }),
      taskDto("a", "2026-10-26T10:00:00.000Z"),
    ]);
    expect(plan.upserts).toEqual([]);
    expect(plan.deleted.map((t) => t.id)).toEqual(["a"]);
  });
});

const inbox: ProjectDto = { id: "inbox", parentId: null, name: "Inbox", color: "gray", icon: null, isFavorite: false, isInbox: true, order: "a", isArchived: false };

const projectP: ProjectDto = { ...inbox, id: "p", isInbox: false };

function setup(server: Partial<ConatusApi> & { tasks?: ConatusApi["tasks"] } = {}) {
  const store = new OfflineStore();
  const api: ConatusApi = {
    tasks: vi.fn(async () => ({ items: [], nextCursor: null, serverTime: "2026-10-26T12:00:00.000Z" })),
    task: vi.fn(),
    projects: vi.fn(async () => [inbox, projectP]),
    sections: vi.fn(async () => []),
    labels: vi.fn(async () => []),
    write: vi.fn(async () => null),
    ...server,
  };
  const sync = new SyncRepository("u", store, new Outbox(store), api);
  return { store, api, sync };
}

describe("SyncRepository", () => {
  afterEach(() => vi.unstubAllGlobals());

  test("pulls projects and tasks, remembers serverTime and asks from there next time", async () => {
    const tasks = vi.fn<ConatusApi["tasks"]>(async () => ({ items: [taskDto("a", "2026-10-26T10:00:00.000Z", { labels: [{ id: "x" }], description: null })], nextCursor: null, serverTime: "2026-10-26T12:00:00.000Z" }));
    const { store, sync } = setup({ tasks });
    expect(await sync.sync()).toBeNull();
    const snapshot = store.getSnapshot();
    expect(snapshot.tasks.get("a")).toMatchObject({ description: "", labelIds: ["x"] });
    expect(snapshot.meta.tasksUpdatedSince).toBe("2026-10-26T12:00:00.000Z");
    expect(snapshot.projects.has("inbox")).toBe(true);
    await sync.sync();
    expect(tasks).toHaveBeenLastCalledWith("2026-10-26T12:00:00.000Z", null);
  });

  test("a project not seen before makes the next sync fetch every task again", async () => {
    const projects = vi.fn(async () => [inbox]);
    const tasks = vi.fn<ConatusApi["tasks"]>(async () => ({ items: [], nextCursor: null, serverTime: "t" }));
    const { sync } = setup({ projects, tasks });
    await sync.sync();
    projects.mockResolvedValue([inbox, { ...inbox, id: "shared", isInbox: false }]);
    await sync.sync();
    expect(tasks).toHaveBeenLastCalledWith(null, null);
  });

  test("projects the server no longer lists go, except ones with queued changes, local ones and archived ones", async () => {
    const { store, sync } = setup();
    const gone = { ...inbox, id: "gone", isInbox: false, deletedAt: null, shared: false };
    store.transaction((tx) => {
      tx.projects.upsert([
        gone,
        { ...gone, id: "queued" },
        { ...gone, id: "local:new" },
        { ...gone, id: "archived", isArchived: true },
      ]);
      tx.tasks.upsert([taskEntity({ id: "orphan", projectId: "gone" }), taskEntity({ id: "local:task", projectId: "gone" })]);
      tx.changes.add({ id: "queued", kind: "Update", target: "Project", body: "{}", summary: "" });
    });
    await sync.sync();
    const { projects, tasks } = store.getSnapshot();
    expect([...projects.keys()].sort()).toEqual(["archived", "inbox", "local:new", "p", "queued"]);
    expect([...tasks.keys()]).toEqual(["local:task"]);
  });

  test("the server's task replaces the local one unless a change is queued, then they are merged", async () => {
    const theirs = taskDto("t", "2", { content: "Pay rent", dueDate: "2026-10-30" });
    const { store, sync } = setup({ tasks: async () => ({ items: [theirs], nextCursor: null, serverTime: "t" }) });
    const local = taskEntity({ content: "Pay the rent" });
    store.transaction((tx) => {
      tx.tasks.upsert([local]);
      // Held back so the pull is all this sync does.
      tx.changes.add({ id: "t", kind: "Update", body: '{"content":"Pay the rent"}', summary: "", failure: "x", base: JSON.stringify(baseFor(taskEntity(), ["content"])) });
    });
    await sync.sync();
    expect(store.getSnapshot().tasks.get("t")).toMatchObject({ content: "Pay the rent", dueDate: "2026-10-30" });
    expect(store.getSnapshot().conflicts.size).toBe(0);
  });

  test("a field both sides changed becomes a conflict that holds the task's changes back", async () => {
    const theirs = taskDto("t", "2", { content: "Pay rent now", dueDate: "2026-10-26" });
    const { store, sync, api } = setup({ tasks: async () => ({ items: [theirs], nextCursor: null, serverTime: "t" }) });
    store.transaction((tx) => {
      tx.tasks.upsert([taskEntity({ content: "Pay the rent" })]);
      tx.changes.add({ id: "t", kind: "Update", body: '{"content":"Pay the rent"}', summary: "", base: JSON.stringify(baseFor(taskEntity(), ["content"])) });
    });
    expect(await sync.sync()).toBeNull();
    expect(store.getSnapshot().conflicts.get("t")).toEqual({ taskId: "t", theirs: '{"content":"Pay rent now"}', deleted: false });
    expect(store.getSnapshot().tasks.get("t")?.content).toBe("Pay the rent");
    expect(api.write).not.toHaveBeenCalled();
  });

  test("deleted on the server: kept in Trash, restored here, dropped from the queue, or a conflict", async () => {
    const gone = (id: string) => taskDto(id, "2", { deletedAt: "2026-10-26T11:00:00.000Z" });
    const { store, sync } = setup({ tasks: async () => ({ items: ["plain", "restored", "both", "edited"].map(gone), nextCursor: null, serverTime: "t" }) });
    store.transaction((tx) => {
      tx.tasks.upsert(["plain", "restored", "both", "edited"].map((id) => taskEntity({ id })));
      tx.changes.add({ id: "restored", kind: "Restore", body: "{}", summary: "", failure: "x" });
      tx.changes.add({ id: "both", kind: "Delete", body: "{}", summary: "" });
      tx.changes.add({ id: "edited", kind: "Update", body: "{}", summary: "", failure: "x" });
    });
    await sync.sync();
    const snapshot = store.getSnapshot();
    expect(snapshot.tasks.get("plain")?.deletedAt).not.toBeNull();
    expect(snapshot.tasks.get("restored")?.deletedAt).toBeNull();
    expect(snapshot.tasks.get("both")?.deletedAt).not.toBeNull();
    expect([...snapshot.changes.values()].map((c) => c.id).sort()).toEqual(["edited", "restored"]);
    expect(snapshot.conflicts.get("edited")).toEqual({ taskId: "edited", theirs: "{}", deleted: true });
  });

  test("an Inbox made here becomes the server's, with what was put in it", async () => {
    const { store, sync } = setup();
    store.transaction((tx) => {
      tx.projects.upsert([{ ...inbox, id: "local:inbox", deletedAt: null, shared: false }]);
      tx.tasks.upsert([taskEntity({ id: "local:a", projectId: "local:inbox" })]);
      tx.changes.add({ id: "local:a", kind: "Create", body: '{"projectId":"local:inbox"}', summary: "", failure: "x" });
    });
    await sync.sync();
    const snapshot = store.getSnapshot();
    expect(snapshot.projects.has("local:inbox")).toBe(false);
    expect(snapshot.tasks.get("local:a")?.projectId).toBe("inbox");
    expect([...snapshot.changes.values()][0].body).toBe('{"projectId":"inbox"}');
  });

  test("reports offline, signed out and server trouble, and exposes it as state", async () => {
    const projects = vi.fn<ConatusApi["projects"]>();
    const onRevoked = vi.fn();
    const store = new OfflineStore();
    const api = { projects, sections: async () => [], labels: async () => [], tasks: vi.fn(), task: vi.fn(), write: vi.fn() } as ConatusApi;
    const sync = new SyncRepository("u", store, new Outbox(store), api, onRevoked);
    const states: string[] = [];
    sync.subscribe(() => states.push(sync.getState().status));

    projects.mockRejectedValue(new OfflineError());
    expect(await sync.sync()).toMatchObject({ kind: "offline" });
    expect(sync.getState()).toEqual({ status: "failed", message: "Couldn't reach the server. Check your connection." });

    projects.mockRejectedValue(new HttpError(401, null, null));
    expect(await sync.sync()).toMatchObject({ kind: "unauthorized" });
    expect(onRevoked).toHaveBeenCalledOnce();

    projects.mockRejectedValue(new HttpError(429, null, "120"));
    expect(await sync.sync()).toEqual({ kind: "server", message: "Too many attempts. Try again in 2 minutes." });
    expect(states).toEqual(["running", "failed", "running", "failed", "running", "failed"]);
  });

  test("a failed push still reports, after the pull went through", async () => {
    const { store, sync } = setup({ write: vi.fn().mockRejectedValue(new OfflineError()) });
    store.transaction((tx) => tx.changes.add({ id: "t", kind: "Complete", body: '{"completed":true}', summary: "" }));
    expect(await sync.sync()).toMatchObject({ kind: "offline" });
    expect(store.getSnapshot().meta.lastSyncAt).not.toBeNull();
    expect(store.getSnapshot().changes.size).toBe(1);
  });

  test("syncs of one user run one after the other", async () => {
    let running = 0;
    let most = 0;
    const projects = vi.fn(async () => {
      most = Math.max(most, ++running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running--;
      return [inbox];
    });
    const { sync } = setup({ projects });
    await Promise.all([sync.sync(), sync.sync(), sync.sync()]);
    expect(projects).toHaveBeenCalledTimes(3);
    expect(most).toBe(1);
  });

  test("uses Web Locks when the browser has them", async () => {
    const request = vi.fn((_name: string, run: () => Promise<unknown>) => run());
    vi.stubGlobal("navigator", { locks: { request } });
    const { sync } = setup();
    await sync.sync();
    expect(request).toHaveBeenCalledWith("conatus-sync-u", expect.any(Function));
  });
});
