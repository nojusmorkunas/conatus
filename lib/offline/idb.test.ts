import "fake-indexeddb/auto";
import { afterEach, expect, test, vi } from "vitest";

import { DB_VERSION, openOfflineStore } from "./idb";

const raw = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

// The stores version 1 created, before there were filters.
const V1 = ["tasks", "projects", "sections", "labels", "comments", "reminders", "changes", "conflicts", "meta"];

async function writeVersion1(name: string) {
  const request = indexedDB.open(name, 1);
  request.onupgradeneeded = () => {
    for (const table of V1) {
      const keyPath = table === "changes" ? "seq" : table === "conflicts" ? "taskId" : table === "meta" ? undefined : "id";
      request.result.createObjectStore(table, keyPath ? { keyPath, autoIncrement: table === "changes" } : undefined);
    }
  };
  const db = await raw(request);
  const tx = db.transaction(["tasks", "changes", "meta"], "readwrite");
  tx.objectStore("tasks").put({ id: "t", projectId: "p", content: "Pay rent", labelIds: [], order: "a0" });
  tx.objectStore("changes").put({ seq: 7, id: "t", kind: "Update", target: "Task", body: '{"content":"Pay rent"}', summary: "Edit", idempotencyKey: null, failure: null, createdAt: 1, base: null });
  tx.objectStore("meta").put(123, "lastSyncAt");
  await new Promise((resolve) => (tx.oncomplete = resolve));
  db.close();
}

afterEach(() => vi.unstubAllGlobals());

test("a version 1 database upgrades with its tasks and queued changes, and gains the filters store", async () => {
  await writeVersion1("conatus-old");
  const store = await openOfflineStore("old");
  const snapshot = store.getSnapshot();
  expect(snapshot.tasks.get("t")).toMatchObject({ content: "Pay rent" });
  expect([...snapshot.changes.keys()]).toEqual([7]);
  expect(snapshot.meta.lastSyncAt).toBe(123);
  expect(snapshot.filters.size).toBe(0);

  store.transaction((tx) => tx.filters.upsert([{ id: "f", name: "Soon", query: "p1", isFavorite: false, order: "a0" }]));
  await store.flush();
  store.close();

  const db = await raw(indexedDB.open("conatus-old"));
  expect(db.version).toBe(DB_VERSION);
  expect([...db.objectStoreNames].sort()).toEqual([...V1, "filters"].sort());
  expect(await raw(db.transaction("filters").objectStore("filters").getAll())).toHaveLength(1);
  db.close();
});

test("a tab holding an older version closes its connection and reloads, so another tab's upgrade goes through", async () => {
  const reload = vi.fn();
  vi.stubGlobal("location", { reload });
  const first = await openOfflineStore("two-tabs");
  const next = indexedDB.open("conatus-two-tabs", DB_VERSION + 1);
  next.onblocked = () => {
    throw new Error("The first connection should have closed");
  };
  const db = await raw(next);
  expect(reload).toHaveBeenCalledOnce();
  db.close();
  first.close();
});
