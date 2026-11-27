import { localDateTimeToUtc } from "@/lib/local-time";
import { parseQuickAdd, type QuickAddParse } from "@/lib/parser/quick-add";
import { firstOccurrence, nextOccurrenceWithinEnd, parseRecurrence } from "@/lib/recurrence";
import { cascadedIds, clearedWithSchedule, completedAncestorIds, moveTarget, restoredOrder } from "@/lib/task-rules";
import { subtreeIds } from "@/lib/task-tree";

import { baseFor, jsonObjectOf, withFields, type Json, type JsonObject } from "./merge";
import { addReminderIn } from "./notes";
import type { OfflineStore, Tx } from "./store";
import { byOrder, keyAfter, newLocalId, placeKey, queueChange } from "./support";
import { isLocalId, LOCAL_ID_PREFIX, type LabelEntity, type PendingChange, type ProjectEntity, type TaskEntity } from "./types";

/** Field changes a user can make in task details. Only the fields that are set are sent; null clears one. */
export type TaskEdit = {
  content?: string;
  description?: string;
  priority?: number;
  dueDate?: string | null;
  dueTime?: string | null;
  deadlineDate?: string | null;
  durationMinutes?: number | null;
  recurrence?: string | null;
  recurrenceEndDate?: string | null;
};

const EDIT_FIELDS = ["content", "description", "priority", "dueDate", "dueTime", "deadlineDate", "durationMinutes", "recurrence", "recurrenceEndDate"] as const;

/** Clearing the date also clears its time and repeat, which the server does too. */
export const noDate: TaskEdit = { dueDate: null, dueTime: null, recurrence: null };

/** The request body of [edit], with the values as the server will store them. */
export function editBody(edit: TaskEdit): JsonObject {
  const body: JsonObject = {};
  for (const name of EDIT_FIELDS) {
    let value: Json | undefined = edit[name];
    if (value === undefined) continue;
    if (typeof value === "string") {
      if (name === "content" || name === "description") value = value.trim();
      // The server keeps the rule in its canonical wording.
      else if (name === "recurrence") value = parseRecurrence(value) ?? value;
    }
    body[name] = value;
  }
  return body;
}

/** [task] with [edit] made, and what the server clears alongside it. */
export const applyEdit = (task: TaskEntity, edit: TaskEdit): TaskEntity => ({ ...withFields(task, editBody(edit)), ...clearedWithSchedule(task, edit) });

/**
 * A deleted task that can still be brought back, with its sub-tasks and the queued changes that
 * went with it (those of tasks the server never had). [seq] is its queued delete, null for a task
 * the server never had.
 */
export type Deletion = { task: TaskEntity; seq: number | null; dropped: PendingChange[]; descendants: TaskEntity[] };

/**
 * A completed task that can still be undone. [seq] is its queued change; [cascaded] the sub-tasks
 * it completed (or, for a repeating task moving on, reopened), as they were.
 */
export type Completion = { taskId: string; seq: number; before: TaskEntity; cascaded: TaskEntity[] };

/**
 * The order tasks made here go to the server: what to create, then what to complete. All the
 * creates go first, parents before their sub-tasks so a sub-task's create can name its parent's
 * server id, and each level in the order shown, which the server's creates then keep. The server
 * won't add a sub-task under a completed parent, so completions wait, and go sub-tasks first.
 */
export function uploadOrder(tasks: TaskEntity[]): [creates: TaskEntity[], completes: TaskEntity[]] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const depth = (task: TaskEntity, seen = new Set<string>()): number => {
    const parent = task.parentId ? byId.get(task.parentId) : undefined;
    return parent && !seen.has(parent.id) ? depth(parent, seen.add(task.id)) + 1 : 0;
  };
  const creates = [...tasks].sort((a, b) => depth(a) - depth(b) || byOrder(a, b));
  return [creates, creates.filter((task) => task.isCompleted).reverse()];
}

/** Every task under [id], however deep, in Trash or not (the server's subtree). */
export function descendants(tx: Tx, id: string): TaskEntity[] {
  const all = tx.tasks.all();
  const ids = subtreeIds(all, id);
  return all.filter((task) => task.id !== id && ids.has(task.id));
}

/** The order key after the last task directly under [parentId], or at the end of [sectionId] in [projectId]. */
export function orderAtEnd(tx: Tx, projectId: string, sectionId: string | null, parentId: string | null): string {
  return keyAfter(
    tx.tasks
      .all()
      .filter((task) => task.deletedAt === null && (parentId ? task.parentId === parentId : task.projectId === projectId && task.parentId === null && task.sectionId === sectionId))
      .map((task) => task.order),
  );
}

/** What quick add was told by tapping instead of typing. A typed phrase and a tapped choice for the same thing don't last together: the later one replaces the other. */
export type QuickAddPicks = {
  edit?: TaskEdit;
  /** Where the task goes, when a place was picked. */
  projectId?: string | null;
  sectionId?: string | null;
  /** Labels picked, besides any the text names. */
  labelIds?: string[];
  /** Reminders as "YYYY-MM-DDTHH:mm" wall-clock times in the user's time zone, besides any the text asks for. */
  reminders?: string[];
};

/**
 * The task quick add makes of [parsed] with [picks] over it. A time or a repeat whose date went
 * with the text it came from gets the date the text would have given it.
 */
export function quickAddTask(
  parsed: QuickAddParse,
  picks: QuickAddPicks,
  labels: LabelEntity[],
  today: string,
  place: { id?: string; projectId?: string; sectionId?: string | null; parentId?: string | null; order?: string } = {},
): TaskEntity {
  const named = parsed.labelNames.flatMap((name) => labels.find((label) => label.name.toLowerCase() === name.toLowerCase())?.id ?? []);
  const task = withFields(
    {
      id: place.id ?? "",
      projectId: place.projectId ?? "",
      sectionId: place.sectionId ?? null,
      parentId: place.parentId ?? null,
      assigneeId: null,
      content: parsed.content,
      description: "",
      priority: parsed.priority,
      dueDate: parsed.dueDate,
      dueTime: parsed.dueTime,
      deadlineDate: parsed.deadlineDate,
      recurrence: parsed.recurrence,
      durationMinutes: parsed.durationMinutes,
      isCompleted: false,
      order: place.order ?? "",
      updatedAt: "",
      labelIds: [...new Set([...(picks.labelIds ?? []), ...named])],
      commentCount: 0,
      completedAt: null,
      deletedAt: null,
      recurrenceEndDate: null,
    },
    editBody(picks.edit ?? {}),
  );
  if (task.dueDate !== null) return task;
  if (task.recurrence !== null) return { ...task, dueDate: firstOccurrence(task.recurrence, today) };
  if (task.dueTime !== null) return { ...task, dueDate: today };
  return task;
}

/** The Inbox, made here when there's none yet (not synced yet). Sync swaps it for the account's. */
function inbox(tx: Tx): ProjectEntity {
  const found = tx.projects.all().find((project) => project.isInbox);
  if (found) return found;
  const made: ProjectEntity = { id: `${LOCAL_ID_PREFIX}inbox`, parentId: null, name: "Inbox", color: "gray", icon: null, isFavorite: false, isInbox: true, order: "", shared: false, isArchived: false, deletedAt: null };
  tx.projects.upsert([made]);
  return made;
}

const createBody = (task: TaskEntity): JsonObject => ({
  projectId: task.projectId,
  ...(task.parentId ? { parentId: task.parentId } : {}),
  // Under a parent the server puts a task in the parent's section.
  ...(task.sectionId && !task.parentId ? { sectionId: task.sectionId } : {}),
  content: task.content,
  ...(task.description ? { description: task.description } : {}),
  priority: task.priority,
  ...(task.dueDate ? { dueDate: task.dueDate } : {}),
  ...(task.dueTime ? { dueTime: task.dueTime } : {}),
  ...(task.recurrence ? { recurrence: task.recurrence } : {}),
  ...(task.recurrenceEndDate ? { recurrenceEndDate: task.recurrenceEndDate } : {}),
  ...(task.deadlineDate ? { deadlineDate: task.deadlineDate } : {}),
  ...(task.durationMinutes ? { durationMinutes: task.durationMinutes } : {}),
});

/** Queues the creation of [tasks]: the server makes a task without labels and open, so those follow as changes of their own. */
function queueCreates(tx: Tx, tasks: TaskEntity[]) {
  const [creates, completes] = uploadOrder(tasks);
  for (const task of creates) {
    queueChange(tx, "Task", task.id, "Create", createBody(task), `Add “${task.content}”`);
    if (task.labelIds.length) queueChange(tx, "Task", task.id, "SetLabels", { labelIds: task.labelIds }, `Label “${task.content}”`, { labelIds: [] });
  }
  for (const task of completes) queueChange(tx, "Task", task.id, "Complete", { completed: true }, `Complete “${task.content}”`, { completed: false });
}

/** The tasks of a project that [task] is in: what the server reads to decide what a completion carries along. */
const inProject = (tx: Tx, task: TaskEntity) => tx.tasks.all().filter((other) => other.projectId === task.projectId);

const reopened = (task: TaskEntity): TaskEntity => ({ ...task, isCompleted: false, completedAt: null });

/**
 * Every write: the local copy changes at once, exactly as the server will change it when it applies
 * the queued request, and the change goes into the queue with the values it replaced. [requestSync]
 * sends the queue as soon as there's a network.
 */
export class TaskWrites {
  constructor(
    private readonly store: OfflineStore,
    private readonly requestSync: () => void,
    /** "YYYY-MM-DD" in the account's time zone. */
    private readonly today: () => string,
    /** The account's date format, which decides how quick add reads numeric dates. */
    private readonly dateFormat: () => string | undefined = () => undefined,
    /** Where quick add's reminder times are read. */
    private readonly timeZone: () => string = () => Intl.DateTimeFormat().resolvedOptions().timeZone,
  ) {}

  private write<T>(fn: (tx: Tx) => T): T {
    const result = this.store.transaction(fn);
    this.requestSync();
    return result;
  }

  /** A repeating task moves on to its next date here, exactly as the server will move it. */
  complete(task: TaskEntity): Completion {
    return this.write((tx) => {
      // Past its end date a repeating task is done for good, as on the server.
      const repeating = task.recurrence !== null && task.dueDate !== null;
      const next = repeating ? nextOccurrenceWithinEnd(task.recurrence!, task.dueDate!, this.today(), task.recurrenceEndDate) : null;
      const finished = next === null;
      const now = new Date().toISOString();
      // Completing a task completes its open sub-tasks too; moving a repeating task on reopens them.
      const cascaded = cascadedIds(inProject(tx, task), task, finished, repeating).flatMap((id) => tx.tasks.get(id) ?? []);
      tx.tasks.upsert([
        finished ? { ...task, isCompleted: true, completedAt: now } : { ...task, dueDate: next },
        ...cascaded.map((sub) => ({ ...sub, isCompleted: finished, completedAt: finished ? now : null })),
      ]);
      const seq = queueChange(tx, "Task", task.id, "Complete", { completed: true }, `Complete “${task.content}”`, baseFor(task, finished ? ["completed"] : ["completed", "dueDate"]));
      return { taskId: task.id, seq, before: task, cascaded };
    });
  }

  undo(completion: Completion) {
    const snapshot = this.store.getSnapshot();
    const task = snapshot.tasks.get(completion.taskId);
    if (!task) return;
    const { before, seq } = completion;
    if (snapshot.changes.has(seq)) {
      this.write((tx) => {
        tx.changes.delete([seq]);
        const subs = completion.cascaded.flatMap((sub) => {
          const current = tx.tasks.get(sub.id);
          return current ? [{ ...current, isCompleted: sub.isCompleted, completedAt: sub.completedAt }] : [];
        });
        tx.tasks.upsert([{ ...task, isCompleted: before.isCompleted, completedAt: before.completedAt, dueDate: before.dueDate }, ...subs]);
      });
    } else if (before.recurrence !== null && !task.isCompleted) {
      // It moved on to its next date: move it back.
      this.update(task, { dueDate: before.dueDate });
    } else {
      this.reopen(task);
    }
  }

  reopen(task: TaskEntity) {
    this.write((tx) => {
      // The server reopens the sub-tasks completed with it and any completed parents; so does this.
      const rows = inProject(tx, task);
      const alongside = [...cascadedIds(rows, task, false), ...completedAncestorIds(rows, task)].flatMap((id) => tx.tasks.get(id) ?? []).map(reopened);
      // A completion that hasn't gone out yet is simply taken back.
      const queued = tx.changes.forTask(task.id).filter((change) => change.kind === "Complete" && change.failure === null).at(-1);
      if (queued) {
        tx.changes.delete([queued.seq]);
        tx.tasks.upsert([withFields(task, jsonObjectOf(queued.base)), ...alongside]);
        return;
      }
      tx.tasks.upsert([reopened(task), ...alongside]);
      queueChange(tx, "Task", task.id, "Reopen", { completed: false }, `Reopen “${task.content}”`, baseFor(task, ["completed"]));
    });
  }

  /**
   * Moves a task to another project or section, at the end. As on the server, a sub-task moved
   * on its own becomes a top-level task there, and its own sub-tasks come along.
   */
  move(task: TaskEntity, projectId: string, sectionId: string | null) {
    const target = moveTarget(task, projectId, sectionId);
    if (!target.movingLists) return;
    this.write((tx) => {
      const order = orderAtEnd(tx, target.projectId, target.sectionId, target.parentId);
      const subs = descendants(tx, task.id).map((sub) => ({ ...sub, projectId: target.projectId, sectionId: target.sectionId }));
      tx.tasks.upsert([{ ...task, projectId: target.projectId, sectionId: target.sectionId, parentId: target.parentId, order }, ...subs]);
      queueChange(tx, "Task", task.id, "Update", { projectId, sectionId }, `Move “${task.content}”`, baseFor(task, ["projectId", "sectionId", "parentId"]));
    });
  }

  /**
   * Drag and drop: puts a task right after [after] (or first, when null) among the tasks in
   * [sectionId] under [parentId]. Its sub-tasks follow it. Under a parent it takes the parent's section.
   */
  place(task: TaskEntity, sectionId: string | null, parentId: string | null, after: string | null) {
    this.write((tx) => {
      const parent = parentId ? tx.tasks.get(parentId) : undefined;
      const section = parent ? parent.sectionId : sectionId;
      const siblings = tx.tasks
        .all()
        .filter((other) => other.id !== task.id && other.deletedAt === null && (parentId ? other.parentId === parentId : other.projectId === task.projectId && other.parentId === null && other.sectionId === section));
      const subs = descendants(tx, task.id).map((sub) => ({ ...sub, sectionId: section }));
      tx.tasks.upsert([{ ...task, sectionId: section, parentId, order: placeKey(siblings, after) }, ...subs]);
      queueChange(tx, "Task", task.id, "Place", { sectionId, parentId, afterId: after }, `Move “${task.content}”`, baseFor(task, ["sectionId", "parentId"]));
    });
  }

  update(task: TaskEntity, edit: TaskEdit) {
    const body = editBody(edit);
    if (!Object.keys(body).length) return;
    this.write((tx) => {
      tx.tasks.upsert([applyEdit(task, edit)]);
      queueChange(tx, "Task", task.id, "Update", body, `Edit “${task.content}”`, baseFor(task, Object.keys(body)));
    });
  }

  setLabels(task: TaskEntity, labelIds: string[]) {
    this.write((tx) => {
      tx.tasks.upsert([{ ...task, labelIds }]);
      queueChange(tx, "Task", task.id, "SetLabels", { labelIds }, `Change the labels of “${task.content}”`, baseFor(task, ["labelIds"]));
    });
  }

  /** Moves a task and its sub-tasks to Trash, as the server does. */
  delete(task: TaskEntity): Deletion {
    const now = new Date().toISOString();
    return this.write((tx) => {
      const subs = descendants(tx, task.id);
      // Queued changes to tasks the server never had are dropped: nothing needs sending.
      const dropped = [task, ...subs].filter((doomed) => isLocalId(doomed.id)).flatMap((doomed) => tx.changes.forTask(doomed.id));
      for (const change of dropped) tx.changes.delete([change.seq]);
      tx.tasks.upsert([task, ...subs].map((doomed) => ({ ...doomed, deletedAt: now })));
      const seq = isLocalId(task.id) ? null : queueChange(tx, "Task", task.id, "Delete", {}, `Delete “${task.content}”`);
      return { task, seq, dropped, descendants: subs };
    });
  }

  /** Takes back a delete that's still queued, or restores the task from the server's Trash. */
  undoDelete(deletion: Deletion) {
    const { task, seq, dropped, descendants: subs } = deletion;
    this.write((tx) => {
      const queued = seq !== null && tx.changes.get(seq) !== undefined;
      // Already sent: the server's Trash has it, and the sub-tasks it never had are created again.
      if (seq !== null && !queued) return this.bringBack(tx, task);
      if (seq !== null) tx.changes.delete([seq]);
      tx.tasks.upsert([task, ...subs]);
      for (const change of dropped) tx.changes.add(change);
    });
  }

  /**
   * Brings a task back from Trash with its sub-tasks, as the server does. The ones the server never
   * had are created again, since their creates were dropped when they were deleted.
   */
  restore(task: TaskEntity) {
    this.write((tx) => this.bringBack(tx, task));
  }

  private bringBack(tx: Tx, task: TaskEntity) {
    const siblingOrders = inProject(tx, task)
      .filter((other) => other.deletedAt === null && other.parentId === task.parentId && (task.parentId !== null || other.sectionId === task.sectionId))
      .map((other) => other.order);
    const order = restoredOrder(siblingOrders, task.order);
    const back = [{ ...task, order }, ...descendants(tx, task.id)].map((row) => ({ ...row, deletedAt: null }));
    tx.tasks.upsert(back);
    if (!isLocalId(task.id)) queueChange(tx, "Task", task.id, "Restore", {}, `Restore “${task.content}”`);
    queueCreates(tx, back.filter((row) => isLocalId(row.id)));
  }

  /**
   * Reads [text] as the server would and adds the task at the end of where it goes: the project
   * it names, else [where].projectId and sectionId (or under parentId, for a sub-task), else the
   * Inbox. [picks] are the choices made by tapping, which win over the text.
   */
  quickAdd(text: string, where: { projectId?: string | null; sectionId?: string | null; parentId?: string | null } = {}, picks: QuickAddPicks = {}): TaskEntity {
    return this.write((tx) => {
      const projects = tx.projects.all().filter((project) => !project.isArchived && project.deletedAt === null);
      const labels = tx.labels.all();
      const today = this.today();
      // A sub-task always goes in its parent's project, so the text can't name another.
      const parsed = parseQuickAdd(text, { today, dateFormat: this.dateFormat(), projectNames: where.parentId ? [] : projects.map((project) => project.name), labelNames: labels.map((label) => label.name) });
      const named = parsed.projectName === null ? undefined : projects.find((project) => project.name.toLowerCase() === parsed.projectName!.toLowerCase());
      const picked = picks.projectId ? projects.find((project) => project.id === picks.projectId) : undefined;
      const project = picked ?? named ?? projects.find((candidate) => candidate.id === where.projectId) ?? inbox(tx);
      // Naming or picking another place takes the task out of the section or parent it was added from.
      const here = project.id === where.projectId && (!picked || (picks.sectionId ?? null) === (where.sectionId ?? null));
      const parent = here && where.parentId ? tx.tasks.get(where.parentId) : undefined;
      const sectionId = parent ? parent.sectionId : picked ? (picks.sectionId ?? null) : here ? (where.sectionId ?? null) : null;
      const task = quickAddTask(parsed, picks, labels, today, {
        id: newLocalId(),
        projectId: project.id,
        sectionId,
        parentId: parent?.id ?? null,
        order: orderAtEnd(tx, project.id, sectionId, parent?.id ?? null),
      });
      tx.tasks.upsert([task]);
      queueCreates(tx, [task]);
      const zone = this.timeZone();
      const reminders = new Set([...(parsed.reminderAt ? [parsed.reminderAt] : []), ...(picks.reminders ?? [])]);
      for (const value of reminders) {
        // A wall-clock time that doesn't exist in the zone (a skipped hour) can't be set.
        const at = localDateTimeToUtc(value, zone);
        if (at) addReminderIn(tx, task.id, at.toISOString());
      }
      return task;
    });
  }

  /** Adds [tasks] to the queue as new, and to the local copy too unless [insert] is false (they're there already). */
  create(tasks: TaskEntity[], insert: boolean) {
    this.write((tx) => {
      if (insert) tx.tasks.upsert(tasks);
      queueCreates(tx, tasks);
    });
  }

  /** Adds a copy of [task] right after it: open, with its labels, and without its sub-tasks, comments and reminders. */
  duplicate(task: TaskEntity): TaskEntity {
    const siblings = [...this.store.getSnapshot().tasks.values()].filter((other) => other.deletedAt === null && other.parentId === task.parentId && other.projectId === task.projectId && (task.parentId !== null || other.sectionId === task.sectionId));
    const copy: TaskEntity = { ...task, id: newLocalId(), order: placeKey(siblings, task.id), isCompleted: false, completedAt: null, commentCount: 0, assigneeId: null, updatedAt: "" };
    this.create([copy], true);
    // The server adds a task at the end, so the copy's place goes out as a move.
    this.place(copy, copy.sectionId, copy.parentId, task.id);
    return copy;
  }
}
