import { api as realApi, OfflineError, toApiProblem, type ApiProblem, type ConatusApi } from "./api";
import { merge } from "./merge";
import { Outbox, taskEntity } from "./outbox";
import type { OfflineStore } from "./store";
import {
  isLocalId,
  type CommentDto,
  type FilterDto,
  type FilterEntity,
  type LabelDto,
  type LabelEntity,
  type PendingChange,
  type ProjectDto,
  type ProjectEntity,
  type ReminderDto,
  type SectionDto,
  type SectionEntity,
  type TaskDto,
  type TaskPage,
} from "./types";

/** Every task that changed since the last sync, and the server time to ask from next time. */
export type TaskChanges = { items: TaskDto[]; serverTime: string };

/**
 * Pages through GET /api/v1/tasks. The next sync starts from the first page's serverTime: the
 * server reads its clock before querying, so a task edited while we page is newer than that
 * and comes back next time, even if it moved past our cursor.
 */
export async function fetchTaskChanges(page: (cursor: string | null) => Promise<TaskPage>): Promise<TaskChanges> {
  const items: TaskDto[] = [];
  let cursor: string | null = null;
  let firstServerTime: string | null = null;
  do {
    const result: TaskPage = await page(cursor);
    firstServerTime ??= result.serverTime;
    items.push(...result.items);
    cursor = result.nextCursor;
  } while (cursor !== null);
  return { items, serverTime: firstServerTime };
}

/** What to write locally: the newest version of each task, split into live ones and ones now in Trash. */
export type TaskPlan = { upserts: TaskDto[]; deleted: TaskDto[] };

export function planTaskChanges(items: TaskDto[]): TaskPlan {
  const newest = new Map<string, TaskDto>();
  for (const item of items) {
    const seen = newest.get(item.id);
    if (!seen || Date.parse(item.updatedAt) > Date.parse(seen.updatedAt)) newest.set(item.id, item);
  }
  const all = [...newest.values()];
  return { upserts: all.filter((task) => task.deletedAt === null), deleted: all.filter((task) => task.deletedAt !== null) };
}

export const projectEntity = (dto: ProjectDto): ProjectEntity => ({
  id: dto.id,
  parentId: dto.parentId,
  name: dto.name,
  color: dto.color,
  icon: dto.icon,
  isFavorite: dto.isFavorite,
  isInbox: dto.isInbox,
  order: dto.order,
  favoriteOrder: dto.favoriteOrder ?? null,
  shared: dto.shared ?? false,
  isArchived: dto.isArchived,
  deletedAt: null,
});

export const sectionEntity = (dto: SectionDto): SectionEntity => ({
  id: dto.id,
  projectId: dto.projectId,
  name: dto.name,
  order: dto.order,
  isArchived: dto.isArchived,
});

export const labelEntity = (dto: LabelDto): LabelEntity => ({
  id: dto.id,
  name: dto.name,
  color: dto.color,
  isFavorite: dto.isFavorite,
  order: dto.order,
});

export const filterEntity = (dto: FilterDto): FilterEntity => ({
  id: dto.id,
  name: dto.name,
  query: dto.query,
  isFavorite: dto.isFavorite,
  order: dto.order,
});

/** The server stopped accepting the session while the queue was going out. */
export class SignedOutError extends Error {
  constructor() {
    super("The server didn't accept this sign-in.");
  }
}

export type SyncState = { status: "idle" } | { status: "running" } | { status: "failed"; message: string };

// One sync per user at a time, across tabs where the browser has Web Locks. Plain-HTTP pages
// don't, so those wait only for each other within the tab.
const tabQueue = new Map<string, Promise<unknown>>();

async function exclusively<T>(userId: string, run: () => Promise<T>): Promise<T> {
  const locks = globalThis.navigator?.locks;
  if (locks) return locks.request(`conatus-sync-${userId}`, run);
  const turn = (tabQueue.get(userId) ?? Promise.resolve()).then(run, run);
  tabQueue.set(userId, turn.catch(() => {}));
  return turn;
}

/**
 * Brings the local copy and the server together, silently. It pulls first and merges the server's
 * changes with the ones queued here (see merge), then sends the queue. Tasks come as deltas;
 * projects, sections, labels and filters have no delta on purpose (losing access to a shared project
 * wouldn't show up in one), so they're fetched whole and replace the local copy.
 */
export class SyncRepository {
  private current: SyncState = { status: "idle" };
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly userId: string,
    private readonly store: OfflineStore,
    private readonly outbox: Outbox,
    private readonly api: ConatusApi = realApi,
    private readonly onRevoked: () => void | Promise<void> = () => {},
  ) {}

  getState = (): SyncState => this.current;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private setState(state: SyncState) {
    this.current = state;
    for (const listener of [...this.listeners]) listener();
  }

  /** Null when everything synced, otherwise what went wrong. Concurrent calls wait for each other. */
  sync(): Promise<ApiProblem | null> {
    return exclusively(this.userId, async () => {
      this.setState({ status: "running" });
      let problem: ApiProblem | null = null;
      try {
        await this.run();
      } catch (error) {
        problem = error instanceof SignedOutError ? { kind: "unauthorized", message: error.message } : toApiProblem(error);
      }
      if (problem?.kind === "unauthorized") await this.onRevoked();
      this.setState(problem ? { status: "failed", message: problem.message } : { status: "idle" });
      return problem;
    });
  }

  /**
   * Comments and reminders have no delta, so a task's (or a project's comments) are fetched when
   * its details open. Rows with queued changes keep the local version, and so do ones made here.
   * Resolves to whether it got the server's answer; offline, the local copy stays as it is.
   */
  refreshNotes(scope: { taskId: string } | { projectId: string }): Promise<boolean> {
    const [key, id] = Object.entries(scope)[0];
    if (isLocalId(id)) return Promise.resolve(false);
    // Under the sync lock, so a comment the queue is sending can't be fetched before it's created and then dropped as unknown.
    return exclusively(this.userId, async () => {
      let comments: CommentDto[];
      let reminders: ReminderDto[] | null = null;
      try {
        comments = await this.api.comments(scope);
        if ("taskId" in scope) reminders = await this.api.reminders(scope.taskId);
      } catch {
        return false;
      }
      this.store.transaction((tx) => {
        const queued = new Set(tx.changes.all().map((change) => change.id));
        const keeps = (row: { id: string }) => isLocalId(row.id) || queued.has(row.id);
        const inScope = (row: { taskId: string | null; projectId?: string | null }) => (key === "taskId" ? row.taskId === id : row.projectId === id);
        const listed = new Set(comments.map((comment) => comment.id));
        tx.comments.upsert(comments.filter((comment) => !queued.has(comment.id)).map(({ id, taskId, projectId, content, createdAt, updatedAt, userId }) => ({ id, taskId, projectId, content, createdAt, updatedAt, userId })));
        tx.comments.delete(tx.comments.all().filter((comment) => inScope(comment) && !listed.has(comment.id) && !keeps(comment)).map((comment) => comment.id));
        if (!reminders) return;
        const listedReminders = new Set(reminders.map((reminder) => reminder.id));
        tx.reminders.upsert(reminders.filter((reminder) => !queued.has(reminder.id)).map(({ id, taskId, remindAt }) => ({ id, taskId, remindAt: new Date(remindAt).toISOString() })));
        tx.reminders.delete(tx.reminders.all().filter((reminder) => reminder.taskId === id && !listedReminders.has(reminder.id) && !keeps(reminder)).map((reminder) => reminder.id));
        // The server counts every comment; this is the count once all of them are here.
        const task = tx.tasks.get(id);
        const count = tx.comments.all().filter((comment) => comment.taskId === id).length;
        if (task && task.commentCount !== count) tx.tasks.upsert([{ ...task, commentCount: count }]);
      });
      return true;
    });
  }

  private async run() {
    const api = this.api;
    const [projects, sections, labels, filters] = await Promise.all([api.projects(), api.sections(), api.labels(), api.filters()]);
    // A project not seen here yet (shared with you, or unarchived elsewhere) brings tasks that
    // never showed up in a delta, so those syncs fetch every task again.
    const known = new Set([...this.store.getSnapshot().projects.values()].filter((p) => !p.isArchived && p.deletedAt === null).map((p) => p.id));
    const since = projects.every((p) => known.has(p.id) || p.isInbox) ? this.store.getSnapshot().meta.tasksUpdatedSince : null;
    const changes = await fetchTaskChanges((cursor) => api.tasks(since, cursor));
    const plan = planTaskChanges(changes.items);
    this.store.transaction((tx) => {
      const serverInbox = projects.find((p) => p.isInbox);
      const localInbox = tx.projects.all().find((p) => p.isInbox);
      if (serverInbox && localInbox && isLocalId(localInbox.id)) this.outbox.adoptProject(tx, localInbox.id, serverInbox.id);
      // Read inside the transaction, so a write made meanwhile is merged, not overwritten.
      const queued = new Map<string, PendingChange[]>();
      for (const change of tx.changes.all()) queued.set(change.id, [...(queued.get(change.id) ?? []), change]);
      // Projects, sections, labels and filters with changes still queued keep the local version until they're through.
      const stays = (id: string) => isLocalId(id) || queued.has(id);
      const ids = (rows: { id: string }[]) => new Set(rows.map((row) => row.id));
      const listed = { projects: ids(projects), sections: ids(sections), labels: ids(labels), filters: ids(filters) };
      tx.projects.upsert(projects.filter((p) => !queued.has(p.id)).map(projectEntity));
      tx.projects.delete(tx.projects.all().filter((p) => !listed.projects.has(p.id) && !stays(p.id) && !p.isArchived && p.deletedAt === null).map((p) => p.id));
      tx.sections.upsert(sections.filter((s) => !queued.has(s.id)).map(sectionEntity));
      tx.sections.delete(tx.sections.all().filter((s) => !listed.sections.has(s.id) && !stays(s.id)).map((s) => s.id));
      tx.labels.upsert(labels.filter((l) => !queued.has(l.id)).map(labelEntity));
      tx.labels.delete(tx.labels.all().filter((l) => !listed.labels.has(l.id) && !stays(l.id)).map((l) => l.id));
      tx.filters.upsert(filters.filter((f) => !queued.has(f.id)).map(filterEntity));
      tx.filters.delete(tx.filters.all().filter((f) => !listed.filters.has(f.id) && !stays(f.id)).map((f) => f.id));
      for (const dto of plan.upserts) {
        const mine = queued.get(dto.id);
        if (!mine) {
          tx.tasks.upsert([taskEntity(dto)]);
          continue;
        }
        // Deleted here and not sent yet: the delete goes out below.
        const local = tx.tasks.get(dto.id);
        if (!local || local.deletedAt !== null) continue;
        const merged = merge(local, taskEntity(dto), mine);
        tx.tasks.upsert([merged.task]);
        if (Object.keys(merged.conflicts).length) tx.conflicts.upsert([{ taskId: dto.id, theirs: JSON.stringify(merged.conflicts), deleted: false }]);
        else tx.conflicts.delete([dto.id]);
      }
      // Deleted tasks stay here, in Trash, as on the server.
      for (const dto of plan.deleted) {
        const mine = queued.get(dto.id);
        if (!mine) tx.tasks.upsert([taskEntity(dto)]);
        // Restored here: the restore goes out below and brings it back there too.
        else if (mine.some((change) => change.kind === "Restore")) tx.conflicts.delete([dto.id]);
        // Deleted on both sides: nothing left to send.
        else if (mine.some((change) => change.kind === "Delete")) {
          tx.changes.deleteFrom(dto.id, 0);
          tx.tasks.upsert([taskEntity(dto)]);
        }
        // Changed here, deleted there: the user decides.
        else tx.conflicts.upsert([{ taskId: dto.id, theirs: "{}", deleted: true }]);
      }
      // A task whose project has left, because the user can no longer reach it, which delta sync can't report.
      // Archived and trashed projects keep theirs: the server doesn't send them again when the project comes back.
      tx.tasks.delete(tx.tasks.all().filter((t) => !tx.projects.get(t.projectId) && !isLocalId(t.id)).map((t) => t.id));
      tx.setMeta({ tasksUpdatedSince: changes.serverTime, lastSyncAt: Date.now() });
    });
    switch (await this.outbox.push(api)) {
      case "Done":
        break;
      case "SignedOut":
        throw new SignedOutError();
      case "TryLater":
        throw new OfflineError("Some changes couldn't be sent yet.");
    }
  }
}
