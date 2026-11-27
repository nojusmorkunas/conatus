"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";

import { TaskModal } from "./task-modal";
import { TaskRow } from "./task-row";
import type { Label, TaskWithLabels } from "./types";
import { useWrites } from "@/lib/offline/hooks";
import type { TaskEdit } from "@/lib/offline/task-writes";
import { useTaskActions } from "@/lib/use-task-actions";
import { useTaskSelection } from "@/lib/use-task-selection";
import { selectionRoots } from "@/lib/task-tree";
import { EmptyState } from "@/components/ui/empty-state";

export type TaskDateGroup = { heading: string; tasks: TaskWithLabels[] };

/** Date-grouped task rows. The screen above it reads the local copy and passes [groups]; every change goes through the local copy too. */
export function TaskDateList({
  groups,
  labels,
  currentUserId,
  today,
  dateFormat,
  emptyState,
}: {
  groups: TaskDateGroup[];
  labels: Label[];
  currentUserId: string;
  today: string;
  dateFormat: string;
  emptyState?: React.ReactNode;
}) {
  const writes = useWrites();
  const actions = useTaskActions(writes.tasks);
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const {
    selecting,
    selectedIds,
    start: startSelecting,
    toggle: toggleSelection,
    range: selectRange,
    exit: exitSelection,
  } = useTaskSelection((ids) => {
    const single = ids.length === 1 ? allTasks.find((task) => task.id === ids[0]) : undefined;
    if (single) actions.deleteTask(single);
    else deleteSelected();
  });

  const allTasks = groups.flatMap((group) => group.tasks);

  // Trashing a task takes its subtasks along, so only the top of each
  // selected branch is sent.
  function deleteSelected() {
    if (selectedIds.length === 0) return;
    actions.deleteMany(selectionRoots(allTasks, selectedIds), selectedIds.length);
    exitSelection();
  }

  function completeSelected() {
    if (selectedIds.length === 0) return;
    actions.completeMany(selectedIds);
    exitSelection();
  }

  // A row inside the selection speaks for all of it.
  function actsOnSelection(task: TaskWithLabels) {
    return selecting && selectedIds.length > 1 && selectedIds.includes(task.id);
  }

  // Same labels added or removed across the selection, keeping their own.
  function changeSelectionLabels(task: TaskWithLabels, labelIds: string[]) {
    const added = labelIds.filter((id) => !task.labels.some((label) => label.id === id));
    const removed = task.labels.filter((label) => !labelIds.includes(label.id)).map((label) => label.id);
    actions.changeLabelsMany(selectedIds, (current) => [...new Set([...current, ...added])].filter((id) => !removed.includes(id)));
    exitSelection();
  }

  function moveSelected(projectId: string) {
    actions.moveMany(selectionRoots(allTasks, selectedIds), projectId);
    exitSelection();
  }

  function updateSelected(edit: TaskEdit) {
    actions.updateMany(selectedIds, edit);
    exitSelection();
  }

  const visibleGroups = groups.filter((group) => group.tasks.length > 0);
  const flatOrder = visibleGroups.flatMap((group) => group.tasks.map((task) => task.id));
  const detailIndex = detailTaskId ? flatOrder.indexOf(detailTaskId) : -1;

  return (
    <div className="flex flex-col gap-6">
      {visibleGroups.length === 0 && (
        emptyState ?? <EmptyState icon={CheckCircle2} title="You're all caught up" description="Nothing due right now." />
      )}

      {visibleGroups.map((group) => (
        <div key={group.heading} className="flex flex-col gap-1">
          <h2 className="text-sm font-medium text-muted-foreground">
            {group.heading}
          </h2>

          {group.tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              allTasks={[]}
              labels={labels}
              depth={0}
              today={today}
              dateFormat={dateFormat}
              onToggle={(target) => actsOnSelection(target) ? completeSelected() : actions.toggleComplete(target)}
              onDelete={(target) => actsOnSelection(target) ? deleteSelected() : actions.deleteTask(target)}
              onLabelsChange={(target, labelIds) =>
                actsOnSelection(target) ? changeSelectionLabels(target, labelIds) : actions.setLabels(target, labelIds)
              }
              onDueChange={(target, dueDate, dueTime, deadlineDate, durationMinutes) =>
                actions.update(target, { dueDate, dueTime, deadlineDate, durationMinutes })
              }
              onQuickDueChange={(target, dueDate) =>
                actsOnSelection(target) ? updateSelected({ dueDate }) : actions.update(target, { dueDate })
              }
              onPriorityChange={(target, priority) =>
                actsOnSelection(target) ? updateSelected({ priority }) : actions.update(target, { priority })
              }
              onMove={(target, projectId) =>
                actsOnSelection(target) ? moveSelected(projectId) : actions.move(target, projectId)
              }
              onDuplicate={(target) => actions.duplicate(target)}
              onOpenDetail={(task) => setDetailTaskId(task.id)}
              selecting={selecting}
              selected={selectedIds.includes(task.id)}
              selectionCount={selectedIds.length}
              onSelectionToggle={(target) => toggleSelection([target.id])}
              onSelectionStart={(target) => startSelecting([target.id])}
              onSelectionRange={(target) => selectRange(target.id, allTasks.map(({ id }) => id))}
            />
          ))}
        </div>
      ))}

      {actions.pending && (
        <div className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full bg-foreground px-4 py-2 text-sm text-background shadow-lg">
          <span>{actions.pending.label}</span>
          <button type="button" className="font-medium underline" onClick={actions.undo}>
            Undo
          </button>
        </div>
      )}

      {detailTaskId && (
        <TaskModal
          key={detailTaskId}
          taskId={detailTaskId}
          currentUserId={currentUserId}
          today={today}
          dateFormat={dateFormat}
          onClose={() => setDetailTaskId(null)}
          onDelete={(task) => actions.deleteTask(task)}
          onPrev={detailIndex > 0 ? () => setDetailTaskId(flatOrder[detailIndex - 1]) : undefined}
          onNext={detailIndex !== -1 && detailIndex < flatOrder.length - 1 ? () => setDetailTaskId(flatOrder[detailIndex + 1]) : undefined}
        />
      )}
    </div>
  );
}
