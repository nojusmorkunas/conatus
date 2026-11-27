import { emptyMeta, OfflineStore, type Loaded, type Meta, type TableName, type Write } from "./store";

// The IndexedDB side of the store: one database per user, an object store per table, everything
// loaded into memory when it opens. Other tabs of the same user hear about a write on a
// BroadcastChannel and reload.

const TABLES: TableName[] = ["tasks", "projects", "sections", "labels", "filters", "comments", "reminders", "changes", "conflicts", "meta"];

const KEY_PATH: Record<string, string | undefined> = { changes: "seq", conflicts: "taskId", meta: undefined };

const settle = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const finish = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

// 2 added the filters table. An upgrade only adds the stores that are missing, so what a user
// has stored, queued changes included, survives it.
export const DB_VERSION = 2;

const open = (name: string) =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, DB_VERSION);
    request.onupgradeneeded = () => {
      for (const table of TABLES) {
        if (request.result.objectStoreNames.contains(table)) continue;
        const keyPath = table in KEY_PATH ? KEY_PATH[table] : "id";
        request.result.createObjectStore(table, keyPath ? { keyPath, autoIncrement: table === "changes" } : undefined);
      }
    };
    // A tab still holding an older version gets "versionchange" and closes (below), which lets this
    // request go on. Until then it stays pending, so there is nothing to do here.
    request.onblocked = () => {};
    request.onsuccess = () => {
      // Another tab is upgrading: let it. This tab's code is out of date, so it starts over.
      request.result.onversionchange = () => {
        request.result.close();
        globalThis.location?.reload();
      };
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
  });

async function readAll(db: IDBDatabase): Promise<Loaded> {
  const tx = db.transaction(TABLES, "readonly");
  const all = <T>(table: TableName) => settle(tx.objectStore(table).getAll() as IDBRequest<T[]>);
  const meta = tx.objectStore("meta");
  const [tasks, projects, sections, labels, filters, comments, reminders, changes, conflicts, since, lastSyncAt, aliases] = await Promise.all([
    all<Loaded["tasks"][number]>("tasks"),
    all<Loaded["projects"][number]>("projects"),
    all<Loaded["sections"][number]>("sections"),
    all<Loaded["labels"][number]>("labels"),
    all<Loaded["filters"][number]>("filters"),
    all<Loaded["comments"][number]>("comments"),
    all<Loaded["reminders"][number]>("reminders"),
    all<Loaded["changes"][number]>("changes"),
    all<Loaded["conflicts"][number]>("conflicts"),
    settle(meta.get("tasksUpdatedSince")),
    settle(meta.get("lastSyncAt")),
    settle(meta.get("aliases")),
  ]);
  const values: Meta = { ...emptyMeta(), tasksUpdatedSince: since ?? null, lastSyncAt: lastSyncAt ?? null, aliases: aliases ?? {} };
  return { tasks, projects, sections, labels, filters, comments, reminders, changes, conflicts, meta: values };
}

/**
 * Writes the batch in one transaction and returns the changes that had to take another seq. Tabs
 * make seqs from the clock, so a clash is rare, but a new change must never replace another
 * tab's. Readwrite transactions on a store run one at a time, so checking and adding is atomic.
 * [renamed] holds earlier renumberings, which a batch made before the store heard of them still uses.
 */
async function writeAll(db: IDBDatabase, writes: Write[], renamed: Map<number, number>): Promise<Map<number, number>> {
  const tables = [...new Set(writes.map((write) => write.table))];
  const tx = db.transaction(tables, "readwrite");
  const moved = new Map<number, number>();
  for (const write of writes) {
    const store = tx.objectStore(write.table);
    let { key, value } = write;
    if (write.table === "changes") {
      const was = key as number;
      let seq = renamed.get(was) ?? was;
      if (write.insert && value !== undefined && (await settle(store.getKey(seq))) !== undefined) {
        const last = await settle(store.openKeyCursor(null, "prev"));
        seq = Math.max(Number(last?.key ?? 0), seq) + 1000;
        renamed.set(was, seq);
        moved.set(was, seq);
      }
      key = seq;
      if (value !== undefined) value = { ...(value as object), seq };
    }
    if (value === undefined) store.delete(key);
    else if (write.insert) store.add(value);
    else if (write.table === "meta") store.put(value, key);
    else store.put(value);
  }
  await finish(tx);
  return moved;
}

/** Opens the user's database and a store that reads from it and writes to it. */
export async function openOfflineStore(userId: string): Promise<OfflineStore & { close(): void }> {
  const db = await open(`conatus-${userId}`);
  const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(`conatus-${userId}`);
  const renamed = new Map<number, number>();
  const store: OfflineStore = new OfflineStore({
    async write(writes) {
      for (const [from, to] of await writeAll(db, writes, renamed)) store.renumber(from, to);
      channel?.postMessage("changed");
    },
  });
  store.load(await readAll(db));
  if (channel) {
    channel.onmessage = async () => {
      // Our own unwritten changes go first, so the reload doesn't take them back.
      await store.flush();
      store.load(await readAll(db));
    };
  }
  return Object.assign(store, {
    close() {
      channel?.close();
      db.close();
    },
  });
}
