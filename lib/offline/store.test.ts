import { afterEach, describe, expect, test, vi } from "vitest";

import { taskEntity } from "./fixtures";
import { OfflineStore, type Write } from "./store";

const add = (tx: Parameters<Parameters<OfflineStore["transaction"]>[0]>[0]) => tx.changes.add({ id: "a", kind: "Update", body: "{}", summary: "" });

describe("seqs", () => {
  afterEach(() => vi.restoreAllMocks());

  test("rise strictly, even within one millisecond or when the clock goes back", () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);
    const store = new OfflineStore(undefined, undefined, 7);
    const first = store.transaction((tx) => Array.from({ length: 50 }, () => add(tx)));
    now.mockReturnValue(1_700_000_000_000);
    const second = store.transaction((tx) => [add(tx), add(tx)]);
    const all = [...first, ...second];
    expect(all.every((seq, i) => i === 0 || seq > all[i - 1])).toBe(true);
    expect(first[0]).toBe(1_800_000_000_000 * 1000 + 7);
    expect(all.at(-1)).toBeLessThan(Number.MAX_SAFE_INTEGER);
  });

  test("differ between stores writing at the same time", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);
    const one = new OfflineStore(undefined, undefined, 1);
    const two = new OfflineStore(undefined, undefined, 2);
    const seqs = [one, two].flatMap((store) => store.transaction((tx) => [add(tx), add(tx), add(tx)]));
    expect(new Set(seqs).size).toBe(6);
  });

  test("loaded seqs, small or from a later clock, keep their order against new ones", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);
    const store = new OfflineStore(undefined, undefined, 0);
    const loaded = (seq: number) => ({ id: "a", kind: "Update" as const, target: "Task" as const, body: "{}", summary: "", idempotencyKey: null, failure: null, createdAt: 0, base: null, seq });
    const ahead = 1_800_000_000_000 * 1000 + 5000;
    store.load({ tasks: [], projects: [], sections: [], labels: [], filters: [], comments: [], reminders: [], conflicts: [], meta: { tasksUpdatedSince: null, lastSyncAt: null }, changes: [loaded(1), loaded(2), loaded(ahead)] });
    const next = store.transaction((tx) => add(tx));
    expect(next).toBeGreaterThan(ahead);
    const small = new OfflineStore(undefined, undefined, 0);
    small.load({ tasks: [], projects: [], sections: [], labels: [], filters: [], comments: [], reminders: [], conflicts: [], meta: { tasksUpdatedSince: null, lastSyncAt: null }, changes: [loaded(1), loaded(2)] });
    expect(small.transaction((tx) => add(tx))).toBeGreaterThan(2);
  });

  test("renumber moves a change to its new seq in memory", () => {
    const store = new OfflineStore();
    const seq = store.transaction((tx) => add(tx));
    store.renumber(seq, seq + 5);
    expect([...store.getSnapshot().changes.keys()]).toEqual([seq + 5]);
    expect(store.getSnapshot().changes.get(seq + 5)?.seq).toBe(seq + 5);
  });

  test("new changes are marked as inserts for persistence, later updates are not", async () => {
    const batches: Write[][] = [];
    const store = new OfflineStore({ write: async (writes) => void batches.push(writes) });
    const seq = store.transaction((tx) => add(tx));
    store.transaction((tx) => tx.changes.setFailure(seq, "No"));
    await store.flush();
    expect(batches.map((writes) => writes[0].insert)).toEqual([true, false]);
  });
});

describe("OfflineStore", () => {
  test("a transaction gives a new snapshot and notifies once", () => {
    const store = new OfflineStore();
    const listener = vi.fn();
    store.subscribe(listener);
    const before = store.getSnapshot();
    store.transaction((tx) => {
      tx.tasks.upsert([taskEntity({ id: "a" }), taskEntity({ id: "b" })]);
      tx.changes.add({ id: "a", kind: "Update", body: "{}", summary: "" });
      // Reads inside see the transaction's own writes.
      expect(tx.tasks.all()).toHaveLength(2);
      expect(listener).not.toHaveBeenCalled();
    });
    expect(listener).toHaveBeenCalledOnce();
    expect(store.getSnapshot()).not.toBe(before);
    expect(before.tasks.size).toBe(0);
    expect(store.getSnapshot().tasks.size).toBe(2);
  });

  test("a transaction that writes nothing keeps the snapshot and stays quiet", () => {
    const store = new OfflineStore();
    const listener = vi.fn();
    store.subscribe(listener);
    const before = store.getSnapshot();
    store.transaction((tx) => tx.tasks.delete(["nothing"]));
    expect(store.getSnapshot()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });

  test("a transaction that throws changes nothing", () => {
    const store = new OfflineStore();
    expect(() => store.transaction((tx) => { tx.tasks.upsert([taskEntity()]); throw new Error("no"); })).toThrow("no");
    expect(store.getSnapshot().tasks.size).toBe(0);
    store.transaction((tx) => tx.tasks.upsert([taskEntity()]));
    expect(store.getSnapshot().tasks.size).toBe(1);
  });

  test("the batch is persisted in order after the notification", async () => {
    const batches: Write[][] = [];
    const store = new OfflineStore({ write: async (writes) => void batches.push(writes) });
    store.transaction((tx) => {
      tx.tasks.upsert([taskEntity({ id: "a" })]);
      tx.setMeta({ tasksUpdatedSince: "now" });
    });
    store.transaction((tx) => tx.tasks.delete(["a"]));
    await store.flush();
    expect(batches).toEqual([
      [{ table: "tasks", key: "a", value: taskEntity({ id: "a" }), insert: false }, { table: "meta", key: "tasksUpdatedSince", value: "now" }],
      [{ table: "tasks", key: "a" }],
    ]);
  });

  test("a failed write is reported and later ones still go", async () => {
    const onError = vi.fn();
    const write = vi.fn().mockRejectedValueOnce(new Error("quota")).mockResolvedValue(undefined);
    const store = new OfflineStore({ write }, onError);
    store.transaction((tx) => tx.tasks.upsert([taskEntity()]));
    store.transaction((tx) => tx.tasks.upsert([taskEntity({ id: "b" })]));
    await store.flush();
    expect(onError).toHaveBeenCalledOnce();
    expect(write).toHaveBeenCalledTimes(2);
  });
});
