import type { JsonObject } from "./merge";
import type { OfflineStore, Tx } from "./store";
import { newLocalId, queueChange } from "./support";
import { isLocalId, type CommentEntity, type ReminderEntity } from "./types";

// Comments and reminders, written like everything else: the local copy first, then the queue.
// They have no conflict check; the server keeps the last edit.

/** "on “Buy milk”", or the project's name, for the list of changes that couldn't sync. */
function where(tx: Tx, taskId: string | null, projectId: string | null): string {
  const name = (taskId && tx.tasks.get(taskId)?.content) || (projectId && tx.projects.get(projectId)?.name);
  return name ? ` on “${name}”` : "";
}

const commentBody = (comment: CommentEntity): JsonObject => ({
  ...(comment.taskId ? { taskId: comment.taskId } : {}),
  ...(comment.projectId ? { projectId: comment.projectId } : {}),
  content: comment.content,
});

function countComment(tx: Tx, taskId: string | null, by: number) {
  const task = taskId ? tx.tasks.get(taskId) : undefined;
  if (task) tx.tasks.upsert([{ ...task, commentCount: Math.max(0, task.commentCount + by) }]);
}

/** Adds a reminder for [taskId] at [remindAt], an ISO instant, inside a transaction already open. */
export function addReminderIn(tx: Tx, taskId: string, remindAt: string): ReminderEntity {
  const reminder: ReminderEntity = { id: newLocalId(), taskId, remindAt: new Date(remindAt).toISOString() };
  tx.reminders.upsert([reminder]);
  queueChange(tx, "Reminder", reminder.id, "Create", { taskId, remindAt: reminder.remindAt }, `Add a reminder${where(tx, taskId, null)}`);
  return reminder;
}

function deleteReminderIn(tx: Tx, reminder: ReminderEntity) {
  tx.reminders.delete([reminder.id]);
  // Never sent: dropping its queued changes is all it takes.
  if (isLocalId(reminder.id)) tx.changes.deleteFrom(reminder.id, 0);
  else queueChange(tx, "Reminder", reminder.id, "Delete", {}, `Remove a reminder${where(tx, reminder.taskId, null)}`);
}

export class NoteWrites {
  constructor(
    private readonly store: OfflineStore,
    private readonly requestSync: () => void,
  ) {}

  private write<T>(fn: (tx: Tx) => T): T {
    const result = this.store.transaction(fn);
    this.requestSync();
    return result;
  }

  /** A comment on a task, or on a project when [taskId] is null. [userId] marks it as the user's own. */
  addComment(taskId: string | null, projectId: string | null, content: string, userId: string | null): CommentEntity {
    const now = new Date().toISOString();
    const comment: CommentEntity = { id: newLocalId(), taskId, projectId, content: content.trim(), createdAt: now, updatedAt: now, userId };
    return this.write((tx) => {
      tx.comments.upsert([comment]);
      countComment(tx, taskId, 1);
      queueChange(tx, "Comment", comment.id, "Create", commentBody(comment), `Comment${where(tx, taskId, projectId)}`);
      return comment;
    });
  }

  editComment(comment: CommentEntity, content: string) {
    const text = content.trim();
    if (text === comment.content) return;
    this.write((tx) => {
      tx.comments.upsert([{ ...comment, content: text, updatedAt: new Date().toISOString() }]);
      queueChange(tx, "Comment", comment.id, "Update", { content: text }, `Edit a comment${where(tx, comment.taskId, comment.projectId)}`);
    });
  }

  deleteComment(comment: CommentEntity) {
    this.write((tx) => {
      tx.comments.delete([comment.id]);
      countComment(tx, comment.taskId, -1);
      if (isLocalId(comment.id)) tx.changes.deleteFrom(comment.id, 0);
      else queueChange(tx, "Comment", comment.id, "Delete", {}, `Delete a comment${where(tx, comment.taskId, comment.projectId)}`);
    });
  }

  /** [remindAt] is an ISO instant. */
  addReminder(taskId: string, remindAt: string): ReminderEntity {
    return this.write((tx) => addReminderIn(tx, taskId, remindAt));
  }

  deleteReminder(reminder: ReminderEntity) {
    this.write((tx) => deleteReminderIn(tx, reminder));
  }

  /** Moves a reminder to [remindAt], so it rings again then. */
  snooze(reminder: ReminderEntity, remindAt: string) {
    this.write((tx) => {
      // Never sent: send it with the new time instead.
      if (isLocalId(reminder.id)) {
        deleteReminderIn(tx, reminder);
        addReminderIn(tx, reminder.taskId, remindAt);
        return;
      }
      const at = new Date(remindAt).toISOString();
      tx.reminders.upsert([{ ...reminder, remindAt: at }]);
      queueChange(tx, "Reminder", reminder.id, "Update", { remindAt: at }, `Snooze a reminder${where(tx, reminder.taskId, null)}`);
    });
  }
}
