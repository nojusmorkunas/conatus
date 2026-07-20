"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";

import type { labels as labelsTable } from "@/lib/db/schema";
import { TaskModal } from "./task-modal";
import { TaskRow } from "./task-row";
import type { TaskWithLabels } from "./task-list";
import { usePendingAction } from "@/lib/use-pending-action";
import { EmptyState } from "@/components/ui/empty-state";

type Label = typeof labelsTable.$inferSelect;

export type TaskDateGroup = { heading: string; tasks: TaskWithLabels[] };

export function TaskDateList({
  initialGroups,
  labels,
  currentUserId,
  today,
  dateFormat,
  emptyState,
}: {
  initialGroups: TaskDateGroup[];
  labels: Label[];
  currentUserId: string;
  today: string;
  dateFormat: string;
  emptyState?: React.ReactNode;
}) {
  const router = useRouter();
  const [groups, setGroups] = useState(initialGroups);
  const [error, setError] = useState<string | null>(null);
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const { pending, schedule, undo } = usePendingAction();

  const [syncedFrom, setSyncedFrom] = useState(initialGroups);
  if (initialGroups !== syncedFrom) {
    setSyncedFrom(initialGroups);
    setGroups(initialGroups);
  }

  async function withError(action: () => Promise<Response>) {
    setError(null);
    const response = await action();
    if (!response.ok) {
      setError("That didn't work. Try again.");
      return false;
    }
    router.refresh();
    return true;
  }

  function patch(taskId: string, body: Record<string, unknown>) {
    return withError(() =>
      fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  }

  async function toggleComplete(task: TaskWithLabels) {
    const completed = !task.isCompleted;
    if (!completed) {
      setGroups((current) =>
        current.map((group) => ({
          ...group,
          tasks: group.tasks.map((existing) =>
            existing.id === task.id ? { ...existing, isCompleted: false } : existing,
          ),
        })),
      );
      await patch(task.id, { completed: false });
      return;
    }

    const previousGroups = groups;
    setGroups((current) =>
      current.map((group) => ({
        ...group,
        tasks: group.tasks.map((existing) =>
          existing.id === task.id
            ? { ...existing, isCompleted: true }
            : existing,
        ),
      })),
    );
    schedule(
      `Completed "${task.content}"`,
      () => patch(task.id, { completed: true }),
      () => setGroups(previousGroups),
    );
  }

  function deleteTask(task: TaskWithLabels) {
    const previousGroups = groups;
    setGroups((current) => current.map((group) => ({
      ...group,
      tasks: group.tasks.filter((existing) => existing.id !== task.id),
    })));
    schedule(
      `Deleted "${task.content}"`,
      () => withError(() => fetch(`/api/tasks/${task.id}`, { method: "DELETE" })),
      () => setGroups(previousGroups),
    );
  }

  async function duplicateTask(task: TaskWithLabels) {
    const response = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: task.projectId,
        sectionId: task.sectionId,
        parentId: task.parentId,
        content: task.content,
        description: task.description ?? undefined,
        priority: task.priority,
        dueDate: task.dueDate,
        dueTime: task.dueTime,
        deadlineDate: task.deadlineDate,
        durationMinutes: task.durationMinutes,
        recurrence: task.recurrence,
        afterId: task.id,
      }),
    });
    if (!response.ok) { setError("That didn't work. Try again."); return; }
    const duplicate: { id: string } = await response.json();
    if (task.labels.length) await patch(duplicate.id, { labelIds: task.labels.map((label) => label.id) });
    router.refresh();
  }

  const visibleGroups = groups
    .map((group) => ({
      ...group,
      tasks: group.tasks.filter((task) => !task.isCompleted),
    }))
    .filter((group) => group.tasks.length > 0);
  const detailTask = detailTaskId
    ? groups.flatMap((group) => group.tasks).find((task) => task.id === detailTaskId) ?? null
    : null;
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
              onToggle={toggleComplete}
              onDelete={deleteTask}
              onLabelsChange={(target, labelIds) => patch(target.id, { labelIds })}
              onDueChange={(target, dueDate, dueTime, deadlineDate, durationMinutes) =>
                patch(target.id, { dueDate, dueTime, deadlineDate, durationMinutes })
              }
              onQuickDueChange={(target, dueDate) => patch(target.id, { dueDate })}
              onPriorityChange={(target, priority) => patch(target.id, { priority })}
              onMove={(target, projectId) => patch(target.id, { projectId })}
              onDuplicate={duplicateTask}
              onSubtaskAdded={() => router.refresh()}
              onOpenDetail={(task) => setDetailTaskId(task.id)}
              onError={() => setError("That didn't work. Try again.")}
            />
          ))}
        </div>
      ))}

      {error && <p className="text-xs text-destructive">{error}</p>}

      {pending && (
        <div className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full bg-foreground px-4 py-2 text-sm text-background shadow-lg">
          <span>{pending.label}</span>
          <button type="button" className="font-medium underline" onClick={undo}>
            Undo
          </button>
        </div>
      )}

      {detailTask && (
        <TaskModal
          key={detailTask.id}
          task={detailTask}
          labels={labels}
          currentUserId={currentUserId}
          today={today}
          dateFormat={dateFormat}
          onClose={() => {
            setDetailTaskId(null);
            router.refresh();
          }}
          onChanged={() => router.refresh()}
          onDelete={deleteTask}
          onPrev={detailIndex > 0 ? () => setDetailTaskId(flatOrder[detailIndex - 1]) : undefined}
          onNext={detailIndex !== -1 && detailIndex < flatOrder.length - 1 ? () => setDetailTaskId(flatOrder[detailIndex + 1]) : undefined}
        />
      )}
    </div>
  );
}
