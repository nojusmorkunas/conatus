import type {
  CommentEntity,
  Conflict,
  FilterEntity,
  LabelEntity,
  NewChange,
  PendingChange,
  ProjectEntity,
  ReminderEntity,
  SectionEntity,
  TaskEntity,
} from "./types";

// The tables live in memory, so views can read them synchronously through useSyncExternalStore.
// A transaction applies a batch of changes to them at once (JS is single-threaded, so the
// synchronous part is atomic, which stands in for Room's withTransaction), notifies once, and
// then hands the same batch to persistence.

export type Meta = {
  /** Where the next task delta starts; null until the first sync, and after a full fetch is needed. */
  tasksUpdatedSince: string | null;
  /** When the last sync finished, in epoch milliseconds. */
  lastSyncAt: number | null;
  /** The server ids that things made here took, so an address from before the sync still opens them. Never pruned: an entry is a few dozen bytes. */
  aliases?: Record<string, string>;
};

export type Snapshot = {
  readonly tasks: ReadonlyMap<string, TaskEntity>;
  readonly projects: ReadonlyMap<string, ProjectEntity>;
  readonly sections: ReadonlyMap<string, SectionEntity>;
  readonly labels: ReadonlyMap<string, LabelEntity>;
  readonly filters: ReadonlyMap<string, FilterEntity>;
  readonly comments: ReadonlyMap<string, CommentEntity>;
  readonly reminders: ReadonlyMap<string, ReminderEntity>;
  readonly changes: ReadonlyMap<number, PendingChange>;
  /** By task id. */
  readonly conflicts: ReadonlyMap<string, Conflict>;
  readonly meta: Meta;
};

/** What a store holds in full, as persistence loads it. */
export type Loaded = {
  tasks: TaskEntity[];
  projects: ProjectEntity[];
  sections: SectionEntity[];
  labels: LabelEntity[];
  filters: FilterEntity[];
  comments: CommentEntity[];
  reminders: ReminderEntity[];
  changes: PendingChange[];
  conflicts: Conflict[];
  meta: Meta;
};

export type TableName = Exclude<keyof Snapshot, "meta"> | "meta";

/**
 * One row written or, when [value] is undefined, deleted. Meta rows are keyed by their field.
 * [insert] marks a row that must not already exist (a new change), so a seq another tab took is noticed.
 */
export type Write = { table: TableName; key: string | number; value?: unknown; insert?: boolean };

export type Persistence = { write(writes: Write[]): Promise<void> };

export const emptyMeta = (): Meta => ({ tasksUpdatedSince: null, lastSyncAt: null });

const empty = (): Snapshot => ({
  tasks: new Map(),
  projects: new Map(),
  sections: new Map(),
  labels: new Map(),
  filters: new Map(),
  comments: new Map(),
  reminders: new Map(),
  changes: new Map(),
  conflicts: new Map(),
  meta: emptyMeta(),
});

const bySeq = (a: PendingChange, b: PendingChange) => a.seq - b.seq;

/** The queued changes in the order they go out. */
export const pendingChanges = (snapshot: Snapshot): PendingChange[] => [...snapshot.changes.values()].sort(bySeq);

/** One table inside a transaction: reads see the transaction's own writes. The first write copies the table. */
export class TableTx<K extends string | number, T> {
  private rows: Map<K, T> | null = null;

  constructor(
    private readonly table: TableName,
    private readonly base: ReadonlyMap<K, T>,
    private readonly keyOf: (row: T) => K,
    private readonly writes: Write[],
  ) {}

  private get current(): ReadonlyMap<K, T> {
    return this.rows ?? this.base;
  }

  get(key: K): T | undefined {
    return this.current.get(key);
  }

  all(): T[] {
    return [...this.current.values()];
  }

  upsert(rows: T[], insert = false) {
    this.rows ??= new Map(this.base);
    for (const row of rows) {
      const key = this.keyOf(row);
      this.rows.set(key, row);
      this.writes.push({ table: this.table, key, value: row, insert });
    }
  }

  delete(keys: K[]) {
    for (const key of keys) {
      if (!this.current.has(key)) continue;
      this.rows ??= new Map(this.base);
      this.rows.delete(key);
      this.writes.push({ table: this.table, key });
    }
  }

  /** The table as the transaction leaves it. */
  result(): ReadonlyMap<K, T> {
    return this.current;
  }
}

export class ChangesTx extends TableTx<number, PendingChange> {
  constructor(
    base: ReadonlyMap<number, PendingChange>,
    writes: Write[],
    private readonly nextSeq: () => number,
  ) {
    super("changes", base, (change) => change.seq, writes);
  }

  override all() {
    return super.all().sort(bySeq);
  }

  add(change: NewChange): number {
    const seq = this.nextSeq();
    this.upsert([{ target: "Task", idempotencyKey: null, failure: null, createdAt: Date.now(), base: null, ...change, seq }], true);
    return seq;
  }

  forTask(id: string) {
    return this.all().filter((change) => change.id === id);
  }

  setFailure(seq: number, failure: string | null) {
    const change = this.get(seq);
    if (change) this.upsert([{ ...change, failure }]);
  }

  /** Drops the changes to [id] from [fromSeq] on. */
  deleteFrom(id: string, fromSeq: number) {
    this.delete(this.forTask(id).filter((change) => change.seq >= fromSeq).map((change) => change.seq));
  }

  renameTask(localId: string, serverId: string) {
    this.upsert(this.forTask(localId).map((change) => ({ ...change, id: serverId })));
  }

  /** Swaps an id inside every queued body, when the server gives something its real id. */
  replaceInBodies(from: string, to: string) {
    this.upsert(this.all().filter((change) => change.body.includes(from)).map((change) => ({ ...change, body: change.body.split(from).join(to) })));
  }
}

export class Tx {
  readonly tasks: TableTx<string, TaskEntity>;
  readonly projects: TableTx<string, ProjectEntity>;
  readonly sections: TableTx<string, SectionEntity>;
  readonly labels: TableTx<string, LabelEntity>;
  readonly filters: TableTx<string, FilterEntity>;
  readonly comments: TableTx<string, CommentEntity>;
  readonly reminders: TableTx<string, ReminderEntity>;
  readonly changes: ChangesTx;
  readonly conflicts: TableTx<string, Conflict>;
  private meta: Meta;
  readonly writes: Write[] = [];

  constructor(private readonly from: Snapshot, nextSeq: () => number) {
    const id = <T extends { id: string }>(row: T) => row.id;
    this.tasks = new TableTx("tasks", from.tasks, id, this.writes);
    this.projects = new TableTx("projects", from.projects, id, this.writes);
    this.sections = new TableTx("sections", from.sections, id, this.writes);
    this.labels = new TableTx("labels", from.labels, id, this.writes);
    this.filters = new TableTx("filters", from.filters, id, this.writes);
    this.comments = new TableTx("comments", from.comments, id, this.writes);
    this.reminders = new TableTx("reminders", from.reminders, id, this.writes);
    this.changes = new ChangesTx(from.changes, this.writes, nextSeq);
    this.conflicts = new TableTx("conflicts", from.conflicts, (conflict) => conflict.taskId, this.writes);
    this.meta = from.meta;
  }

  getMeta(): Meta {
    return this.meta;
  }

  setMeta(values: Partial<Meta>) {
    this.meta = { ...this.meta, ...values };
    for (const [key, value] of Object.entries(values)) this.writes.push({ table: "meta", key, value });
  }

  /** The snapshot the transaction leaves, or the one it started from when it wrote nothing. */
  result(): Snapshot {
    if (!this.writes.length) return this.from;
    return {
      tasks: this.tasks.result(),
      projects: this.projects.result(),
      sections: this.sections.result(),
      labels: this.labels.result(),
      filters: this.filters.result(),
      comments: this.comments.result(),
      reminders: this.reminders.result(),
      changes: this.changes.result(),
      conflicts: this.conflicts.result(),
      meta: this.meta,
    };
  }
}

const mapOf = <K, T>(rows: T[], keyOf: (row: T) => K): ReadonlyMap<K, T> => new Map(rows.map((row) => [keyOf(row), row]));

export class OfflineStore {
  private snapshot = empty();
  private readonly listeners = new Set<() => void>();
  private seq = 0;
  private persisting: Promise<void> = Promise.resolve();
  private inTransaction = false;

  /** Without [persistence] the store only lives in memory, which is all a test needs. */
  constructor(
    private readonly persistence?: Persistence,
    private readonly onPersistError?: (error: unknown) => void,
    // Tabs of one user write to the same table, so each takes its own residue of the seqs it makes.
    private readonly slot = Math.floor(Math.random() * 1000),
  ) {}

  /**
   * Microseconds since the epoch, plus this store's slot: strictly rising here, different between
   * tabs, and ordered by time across them. About 1.8e15 today, under MAX_SAFE_INTEGER until the
   * year 2255. Seqs loaded from before this scheme are small and sort first.
   */
  private nextSeq(): number {
    return (this.seq = Math.max(Date.now() * 1000 + this.slot, this.seq + 1000));
  }

  /** A new object whenever anything changed, so it can be handed to useSyncExternalStore as it is. */
  getSnapshot = (): Snapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /**
   * Applies [fn]'s writes together: readers see all of them or none, are told once, and then the
   * batch is persisted. [fn] must be synchronous; await network calls before or after it.
   */
  transaction<T>(fn: (tx: Tx) => T): T {
    if (this.inTransaction) throw new Error("Transactions don't nest");
    this.inTransaction = true;
    const tx = new Tx(this.snapshot, () => this.nextSeq());
    let result: T;
    try {
      result = fn(tx);
    } finally {
      this.inTransaction = false;
    }
    if (tx.writes.length) {
      this.snapshot = tx.result();
      this.notify();
      this.persist(tx.writes);
    }
    return result;
  }

  /** Replaces everything with what persistence holds, without writing it back. */
  load(data: Loaded) {
    this.seq = data.changes.reduce((most, change) => Math.max(most, change.seq), this.seq);
    this.snapshot = {
      tasks: mapOf(data.tasks, (row) => row.id),
      projects: mapOf(data.projects, (row) => row.id),
      sections: mapOf(data.sections, (row) => row.id),
      labels: mapOf(data.labels, (row) => row.id),
      filters: mapOf(data.filters, (row) => row.id),
      comments: mapOf(data.comments, (row) => row.id),
      reminders: mapOf(data.reminders, (row) => row.id),
      changes: mapOf([...data.changes].sort(bySeq), (row) => row.seq),
      conflicts: mapOf(data.conflicts, (row) => row.taskId),
      meta: data.meta,
    };
    this.notify();
  }

  /** Gives a change another seq, when persistence found its own already taken. Not written back. */
  renumber(from: number, to: number) {
    const change = this.snapshot.changes.get(from);
    if (!change) return;
    const changes = new Map(this.snapshot.changes);
    changes.delete(from);
    changes.set(to, { ...change, seq: to });
    this.seq = Math.max(this.seq, to);
    this.snapshot = { ...this.snapshot, changes };
    this.notify();
  }

  /** Resolves once everything written so far has been persisted. */
  flush(): Promise<void> {
    return this.persisting;
  }

  private persist(writes: Write[]) {
    if (!this.persistence) return;
    const persistence = this.persistence;
    this.persisting = this.persisting
      .then(() => persistence.write(writes))
      .catch((error) => this.onPersistError?.(error));
  }

  private notify() {
    for (const listener of [...this.listeners]) listener();
  }
}
