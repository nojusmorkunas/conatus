import { newIdempotencyKey } from "@/lib/api-client";

import { HttpError, OfflineError, type ConatusApi } from "./api";
import { jsonObjectOf, withFields, type JsonObject } from "./merge";
import { pendingChanges, type OfflineStore, type Tx } from "./store";
import { isLocalId, LOCAL_ID_PREFIX, type ChangeKind, type Conflict, type PendingChange, type Target, type TaskDto, type TaskEntity } from "./types";

export { newIdempotencyKey };

/** What happened when a queued change went to the server. */
export type SendOutcome =
  /** Applied. For a create, [createdId] is the id the server gave it. */
  | { kind: "sent"; createdId?: string }
  /** The server won't apply it. It waits with [reason] until the user retries or discards it. */
  | { kind: "rejected"; reason: string }
  /** Offline, or the server is struggling: stop and try the whole queue again later. */
  | { kind: "tryLater" }
  /** The session no longer works. */
  | { kind: "signedOut" };

/** How the queue treats an HTTP error from the server. */
export function outcomeFor(kind: ChangeKind, status: number, serverMessage: string | null, hasRetryAfter: boolean): SendOutcome {
  if (status === 401) return { kind: "signedOut" };
  // A delete of a task that's already gone did what it set out to do.
  if (status === 404 && kind === "Delete") return { kind: "sent" };
  if (status === 409 && hasRetryAfter) return { kind: "tryLater" }; // the same request is still running on the server
  if (status === 408 || status === 429 || status >= 500) return { kind: "tryLater" };
  if (status === 404 && kind === "Create") return { kind: "rejected", reason: "The server couldn't find the project or task this goes in." };
  if (status === 404) return { kind: "rejected", reason: "It no longer exists on the server. It may have been deleted on another device." };
  if (status === 403) return { kind: "rejected", reason: serverMessage ?? "You no longer have access to its project." };
  return { kind: "rejected", reason: serverMessage ?? `The server rejected this change (error ${status}).` };
}

/**
 * The next change to send, in order. Anything with a rejected change or a conflict holds back its
 * changes. Changes to something the server hasn't created yet wait for its create, and so does a
 * change that names it, such as a task created in a project made here.
 */
export function nextToSend(changes: PendingChange[], conflicted: ReadonlySet<string> = new Set()): PendingChange | null {
  const held = new Set(conflicted);
  for (const change of [...changes].sort((a, b) => a.seq - b.seq)) {
    if (held.has(change.id)) continue;
    if (change.failure !== null) held.add(change.id);
    else if (isLocalId(change.id) && change.kind !== "Create") held.add(change.id);
    else if (change.body.includes(`"${LOCAL_ID_PREFIX}`)) held.add(change.id);
    else return change;
  }
  return null;
}

export type PushResult = "Done" | "TryLater" | "SignedOut";

const COLLECTION: Record<Target, string> = {
  Task: "tasks",
  Project: "projects",
  Section: "sections",
  Label: "labels",
  Comment: "comments",
  Reminder: "reminders",
};

/** Sends queued changes in order, handles the server's answers and settles conflicts. */
export class Outbox {
  private readonly aliases = new Map<string, string>();

  constructor(private readonly store: OfflineStore) {}

  /** The server id something made here took, so an open screen can follow it. */
  renamedTo = (localId: string): string | undefined => this.aliases.get(localId);

  async push(api: ConatusApi): Promise<PushResult> {
    for (;;) {
      const snapshot = this.store.getSnapshot();
      const change = nextToSend(pendingChanges(snapshot), new Set(snapshot.conflicts.keys()));
      if (!change) return "Done";
      const outcome = await this.send(api, change);
      switch (outcome.kind) {
        case "sent":
          this.store.transaction((tx) => {
            tx.changes.delete([change.seq]);
            if (outcome.createdId) this.adopt(tx, change.target, change.id, outcome.createdId);
          });
          break;
        case "rejected":
          this.store.transaction((tx) => tx.changes.setFailure(change.seq, outcome.reason));
          break;
        case "tryLater":
          return "TryLater";
        case "signedOut":
          return "SignedOut";
      }
    }
  }

  retry(change: PendingChange) {
    this.store.transaction((tx) => tx.changes.setFailure(change.seq, null));
  }

  /**
   * Drops a rejected change and everything queued after it for that task, then puts the
   * server's version of the task back (or removes it, if the server doesn't have it).
   */
  async discard(change: PendingChange, api: ConatusApi) {
    const local = isLocalId(change.id);
    this.store.transaction((tx) => {
      tx.changes.deleteFrom(change.id, change.seq);
      if (!local) return;
      // For the others, the next sync replaces the whole list, now that nothing queued holds this one back.
      // Task details fetch a task's comments and reminders again when they open.
      const table = { Task: tx.tasks, Project: tx.projects, Section: tx.sections, Label: tx.labels, Comment: tx.comments, Reminder: tx.reminders }[change.target];
      table.delete([change.id]);
    });
    if (change.target !== "Task" || local) return;
    try {
      const task = await api.task(change.id);
      this.store.transaction((tx) => tx.tasks.upsert([taskEntity(task)]));
    } catch (error) {
      if (error instanceof HttpError && (error.status === 404 || error.status === 403)) {
        this.store.transaction((tx) => tx.tasks.delete([change.id]));
      } else {
        throw error;
      }
    }
  }

  /** Keeps the local version: its changes go out and replace the other device's. */
  keepMine(conflict: Conflict) {
    this.store.transaction((tx) => {
      const mine = tx.changes.forTask(conflict.taskId);
      if (conflict.deleted) {
        // Bring the task back from Trash first, then send the local changes after it.
        tx.changes.delete(mine.map((change) => change.seq));
        tx.changes.add({ id: conflict.taskId, kind: "Restore", body: "{}", summary: "Restore a task" });
        // A restore already queued from Trash is the one above; sending it twice fails the second.
        for (const change of mine) if (change.kind !== "Restore") tx.changes.add(change);
      } else {
        // The other device's values become the base, so the next sync sees no conflict.
        const theirs = jsonObjectOf(conflict.theirs);
        for (const change of mine) {
          const base = jsonObjectOf(change.base);
          if (!Object.keys(base).some((name) => name in theirs)) continue;
          const kept = Object.fromEntries(Object.entries(theirs).filter(([name]) => name in base));
          tx.changes.upsert([{ ...change, base: JSON.stringify({ ...base, ...kept }) }]);
        }
      }
      tx.conflicts.delete([conflict.taskId]);
    });
  }

  /** Takes the other device's version of the fields both changed, and drops the local changes to them. */
  keepTheirs(conflict: Conflict) {
    this.store.transaction((tx) => {
      const mine = tx.changes.forTask(conflict.taskId);
      if (conflict.deleted) {
        tx.changes.delete(mine.map((change) => change.seq));
        tx.tasks.delete([conflict.taskId]);
      } else {
        const theirs = jsonObjectOf(conflict.theirs);
        const without = (values: JsonObject) => Object.fromEntries(Object.entries(values).filter(([name]) => !(name in theirs)));
        for (const change of mine) {
          const body = jsonObjectOf(change.body);
          const base = jsonObjectOf(change.base);
          if (![...Object.keys(body), ...Object.keys(base)].some((name) => name in theirs)) continue;
          const rest = without(body);
          // A completion or a labels change is one act: it goes as a whole.
          if (change.kind === "Update" && Object.keys(rest).length) {
            tx.changes.upsert([{ ...change, body: JSON.stringify(rest), base: JSON.stringify(without(base)) }]);
          } else {
            tx.changes.delete([change.seq]);
          }
        }
        const task = tx.tasks.get(conflict.taskId);
        if (task) tx.tasks.upsert([withFields(task, theirs)]);
      }
      tx.conflicts.delete([conflict.taskId]);
    });
  }

  /** An Inbox made here before the server's was known becomes the account's Inbox. */
  adoptProject(tx: Tx, localId: string, serverId: string) {
    this.moveProject(tx, localId, serverId);
    tx.changes.replaceInBodies(`"${localId}"`, `"${serverId}"`);
    tx.projects.delete([localId]);
  }

  private moveProject(tx: Tx, from: string, to: string) {
    tx.tasks.upsert(tx.tasks.all().filter((task) => task.projectId === from).map((task) => ({ ...task, projectId: to })));
    tx.sections.upsert(tx.sections.all().filter((section) => section.projectId === from).map((section) => ({ ...section, projectId: to })));
    tx.comments.upsert(tx.comments.all().filter((comment) => comment.projectId === from).map((comment) => ({ ...comment, projectId: to })));
  }

  /**
   * What was made here now has the server's id: it's renamed everywhere it's named, keeping what
   * is shown, and changes queued after the create follow it.
   */
  private adopt(tx: Tx, target: Target, localId: string, serverId: string) {
    this.aliases.set(localId, serverId);
    // The row under its new id, then the old one gone.
    const rename = <T extends { id: string }>(table: { get(id: string): T | undefined; upsert(rows: T[]): void; delete(ids: string[]): void }) => {
      const row = table.get(localId);
      if (!row) return;
      table.delete([localId]);
      table.upsert([{ ...row, id: serverId }]);
    };
    switch (target) {
      case "Task":
        rename(tx.tasks);
        tx.tasks.upsert(tx.tasks.all().filter((task) => task.parentId === localId).map((task) => ({ ...task, parentId: serverId })));
        tx.comments.upsert(tx.comments.all().filter((comment) => comment.taskId === localId).map((comment) => ({ ...comment, taskId: serverId })));
        tx.reminders.upsert(tx.reminders.all().filter((reminder) => reminder.taskId === localId).map((reminder) => ({ ...reminder, taskId: serverId })));
        break;
      case "Project":
        rename(tx.projects);
        tx.projects.upsert(tx.projects.all().filter((project) => project.parentId === localId).map((project) => ({ ...project, parentId: serverId })));
        this.moveProject(tx, localId, serverId);
        break;
      case "Section":
        rename(tx.sections);
        tx.tasks.upsert(tx.tasks.all().filter((task) => task.sectionId === localId).map((task) => ({ ...task, sectionId: serverId })));
        break;
      case "Label":
        rename(tx.labels);
        tx.tasks.upsert(tx.tasks.all().filter((task) => task.labelIds.includes(localId)).map((task) => ({ ...task, labelIds: task.labelIds.map((id) => (id === localId ? serverId : id)) })));
        break;
      case "Comment":
        rename(tx.comments);
        break;
      case "Reminder":
        rename(tx.reminders);
        break;
    }
    tx.changes.renameTask(localId, serverId);
    tx.changes.replaceInBodies(`"${localId}"`, `"${serverId}"`);
  }

  private async send(api: ConatusApi, change: PendingChange): Promise<SendOutcome> {
    try {
      const collection = COLLECTION[change.target];
      const at = `/api/v1/${collection}/${change.id}`;
      if (change.kind === "Create") {
        // A create must carry a key that survives a retry, so one without is given its own first.
        const key = change.idempotencyKey ?? newIdempotencyKey();
        if (!change.idempotencyKey) this.store.transaction((tx) => tx.changes.upsert([{ ...change, idempotencyKey: key }]));
        const created = (await api.write("POST", `/api/v1/${collection}`, change.body, key)) as { id?: string } | null;
        if (!created?.id) throw new Error("The server didn't say what it created.");
        return { kind: "sent", createdId: created.id };
      }
      if (change.kind === "Delete") {
        await api.write("DELETE", at);
      } else if (change.kind === "Restore" && (change.target === "Task" || change.target === "Project")) {
        await api.write("POST", `/api/v1/trash/${collection}/${change.id}/restore`);
      } else {
        try {
          await api.write("PATCH", at, change.body);
        } catch (error) {
          // Marking a reminder seen that's gone from the server isn't worth asking about.
          if (!(change.target === "Reminder" && error instanceof HttpError && error.status === 404)) throw error;
        }
      }
      return { kind: "sent" };
    } catch (error) {
      if (error instanceof HttpError) return outcomeFor(change.kind, error.status, error.serverMessage, error.retryAfter !== null);
      if (error instanceof OfflineError) return { kind: "tryLater" };
      throw error;
    }
  }
}

export function taskEntity(dto: TaskDto): TaskEntity {
  const { labels, description, ...rest } = dto;
  return { ...rest, description: description ?? "", labelIds: labels.map((label) => label.id) };
}
