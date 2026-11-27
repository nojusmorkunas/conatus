"use client";

import { api } from "@/lib/api-client";
import { useOffline } from "@/lib/offline/hooks";
import type { TaskEdit, TaskWrites } from "@/lib/offline/task-writes";
import type { TaskEntity } from "@/lib/offline/types";
import { usePendingAction } from "@/lib/use-pending-action";
import { truncate } from "@/lib/utils";

type Ref = string | { id: string };
const idOf = (task: Ref) => (typeof task === "string" ? task : task.id);

/**
 * What a task list does to tasks, on the local copy. Every action applies at once and syncs in the
 * background, so none of them can fail or wait. Completing and trashing show a toast whose Undo
 * takes the write back. Several tasks are a loop of single writes, since transactions don't nest.
 */
export function useTaskActions(writes: TaskWrites) {
  const { store, repo } = useOffline();
  const { pending, schedule, undo } = usePendingAction();

  // The task as the store has it now, which is what a write needs; a row may be a moment behind.
  const entity = (task: Ref) => store.getSnapshot().tasks.get(idOf(task));
  const each = (tasks: Ref[], write: (task: TaskEntity) => void) => {
    for (const task of tasks) {
      const current = entity(task);
      if (current) write(current);
    }
  };
  // The toast has nothing left to send: the write is made, and Undo is its inverse.
  const offerUndo = (label: string, revert: () => void) => schedule(label, () => {}, revert);

  function toggleComplete(task: Ref) {
    const current = entity(task);
    if (!current) return;
    if (current.isCompleted) return writes.reopen(current);
    const completion = writes.complete(current);
    offerUndo(`Completed "${truncate(current.content)}"`, () => writes.undo(completion));
  }

  function completeMany(tasks: Ref[]) {
    const completions = tasks.flatMap((task) => {
      const current = entity(task);
      // Completing a task completes its sub-tasks, which may be selected too.
      return current && !current.isCompleted ? [writes.complete(current)] : [];
    });
    if (completions.length) offerUndo(`Completed ${tasks.length} tasks`, () => completions.reverse().forEach((completion) => writes.undo(completion)));
  }

  function deleteTask(task: Ref) {
    const current = entity(task);
    if (!current) return;
    const deletion = writes.delete(current);
    offerUndo(`Moved "${truncate(current.content)}" to Trash`, () => writes.undoDelete(deletion));
  }

  /** [tasks] are the tops of the branches, since trashing a task takes its sub-tasks along; [count] is what the toast says. */
  function deleteMany(tasks: Ref[], count = tasks.length) {
    const deletions = tasks.flatMap((task) => {
      const current = entity(task);
      return current && current.deletedAt === null ? [writes.delete(current)] : [];
    });
    if (deletions.length) offerUndo(`Moved ${count} tasks to Trash`, () => deletions.reverse().forEach((deletion) => writes.undoDelete(deletion)));
  }

  return {
    pending,
    undo,
    offerUndo,
    entity,
    toggleComplete,
    completeMany,
    deleteTask,
    deleteMany,
    update: (task: Ref, edit: TaskEdit) => each([task], (current) => writes.update(current, edit)),
    updateMany: (tasks: Ref[], edit: TaskEdit) => each(tasks, (current) => writes.update(current, edit)),
    setLabels: (task: Ref, labelIds: string[]) => each([task], (current) => writes.setLabels(current, labelIds)),
    /** [change] gets each task's current label ids. */
    changeLabelsMany: (tasks: Ref[], change: (labelIds: string[]) => string[]) => each(tasks, (current) => writes.setLabels(current, change(current.labelIds))),
    move: (task: Ref, projectId: string, sectionId: string | null = null) => each([task], (current) => writes.move(current, projectId, sectionId)),
    moveMany: (tasks: Ref[], projectId: string) => each(tasks, (current) => writes.move(current, projectId, null)),
    place: (task: Ref, sectionId: string | null, parentId: string | null, afterId: string | null) => each([task], (current) => writes.place(current, sectionId, parentId, afterId)),
    duplicate: (task: Ref) => each([task], (current) => void writes.duplicate(current)),
    duplicateMany: (tasks: Ref[]) => each(tasks, (current) => void writes.duplicate(current)),
    /** Online only: the server is the only place that sets assignees. Resolves to whether the server took it. */
    async assign(task: Ref, assigneeId: string | null) {
      try {
        await api.patch(`/api/tasks/${idOf(task)}`, { assigneeId });
        // The local copy has the assignee only from the server, so fetch it now.
        await repo.sync();
        return true;
      } catch {
        return false;
      }
    },
  };
}
