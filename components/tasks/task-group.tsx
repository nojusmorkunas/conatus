"use client";

import { useMemo, useSyncExternalStore } from "react";
import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

import { visibleFlatRows } from "@/lib/task-tree";
import { TaskAddForm } from "./task-add-form";
import { TaskRow } from "./task-row";
import { SectionHeading } from "./section-heading";
import type { Label, ProjectMember, Section, TaskWithLabels } from "./types";

export function TaskGroup({
  id,
  section,
  tasks,
  allTasks,
  projectId,
  labels,
  members,
  currentUserId,
  today,
  dateFormat,
  selecting,
  draggable,
  activeTaskId,
  activeProjectedDepth,
  collapsedTaskIds,
  selectedTaskIds,
  onToggle,
  onDelete,
  onLabelsChange,
  onAssigneeChange,
  onDueChange,
  onQuickDueChange,
  onPriorityChange,
  onMove,
  onDuplicate,
  onSubtaskAdded,
  onOpenDetail,
  onSelectionToggle,
  onToggleTaskCollapsed,
  onRenameSection,
  onDeleteSection,
  onError,
}: {
  id: string | null;
  section?: Section;
  tasks: TaskWithLabels[];
  allTasks: TaskWithLabels[];
  projectId: string;
  labels: Label[];
  members: ProjectMember[];
  currentUserId: string;
  today: string;
  dateFormat: string;
  selecting: boolean;
  draggable: boolean;
  activeTaskId: string | null;
  activeProjectedDepth: number | null;
  collapsedTaskIds: ReadonlySet<string>;
  selectedTaskIds: string[];
  onToggle: (task: TaskWithLabels) => void;
  onDelete: (task: TaskWithLabels) => void;
  onLabelsChange: (task: TaskWithLabels, labelIds: string[]) => void;
  onAssigneeChange: (task: TaskWithLabels, assigneeId: string | null) => void;
  onDueChange: (task: TaskWithLabels, dueDate: string | null, dueTime: string | null, deadlineDate: string | null, durationMinutes: number | null) => void;
  onQuickDueChange: (task: TaskWithLabels, dueDate: string | null) => void;
  onPriorityChange: (task: TaskWithLabels, priority: number) => void;
  onMove: (task: TaskWithLabels, projectId: string) => void;
  onDuplicate: (task: TaskWithLabels) => void;
  onSubtaskAdded: () => void;
  onOpenDetail: (task: TaskWithLabels) => void;
  onSelectionToggle: (task: TaskWithLabels) => void;
  onToggleTaskCollapsed: (taskId: string) => void;
  onRenameSection: (section: Section, name: string) => void;
  onDeleteSection: (section: Section) => void;
  onError: () => void;
}) {
  const { setNodeRef } = useDroppable({ id: `task-group:${id ?? "none"}` });
  const collapsed = useSyncExternalStore(
    (callback) => {
      window.addEventListener("section-collapse", callback);
      return () => window.removeEventListener("section-collapse", callback);
    },
    () => section ? localStorage.getItem(`section:${section.id}:collapsed`) === "true" : false,
    () => false,
  );

  function toggleCollapsed() {
    if (!section) return;
    localStorage.setItem(`section:${section.id}:collapsed`, String(!collapsed));
    window.dispatchEvent(new Event("section-collapse"));
  }

  // Flattening the group is pure over inputs that don't change mid-drag, so
  // memoize it — otherwise every projection tick re-walks the whole group.
  const rows = useMemo(
    () => visibleFlatRows(tasks, id, {
      collapsedIds: collapsedTaskIds,
      hiddenSubtreeOf: activeTaskId,
    }),
    [tasks, id, collapsedTaskIds, activeTaskId],
  );

  return (
    <div
      ref={setNodeRef}
      className="flex flex-col"
    >
      {section && (
        <SectionHeading
          section={section}
          taskCount={tasks.filter((task) => task.parentId === null && task.sectionId === id).length}
          selecting={selecting}
          collapsed={collapsed}
          onToggleCollapsed={toggleCollapsed}
          onRename={onRenameSection}
          onDelete={onDeleteSection}
        />
      )}

      {!collapsed && <>
        <div className="relative">
          <SortableContext
            items={rows.map((task) => task.id)}
            strategy={verticalListSortingStrategy}
          >
            {rows.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                allTasks={allTasks}
                labels={labels}
                members={members}
                currentUserId={currentUserId}
                depth={task.depth}
                today={today}
                dateFormat={dateFormat}
                onToggle={onToggle}
                onDelete={onDelete}
                onLabelsChange={onLabelsChange}
                onAssigneeChange={onAssigneeChange}
                onDueChange={onDueChange}
                onQuickDueChange={onQuickDueChange}
                onPriorityChange={onPriorityChange}
                onMove={onMove}
                onDuplicate={onDuplicate}
                onSubtaskAdded={onSubtaskAdded}
                onOpenDetail={onOpenDetail}
                selecting={selecting}
                selected={selectedTaskIds.includes(task.id)}
                onSelectionToggle={onSelectionToggle}
                draggable={draggable}
                // Only the dragged row cares about the projected depth; giving
                // the rest a stable null lets them skip re-rendering as it moves.
                activeProjectedDepth={task.id === activeTaskId ? activeProjectedDepth : null}
                collapsed={collapsedTaskIds.has(task.id)}
                onToggleCollapsed={onToggleTaskCollapsed}
                onError={onError}
              />
            ))}
          </SortableContext>
        </div>

        <div className="[&>button]:gap-2.5 [&>button>svg]:text-red-500">
          <TaskAddForm
            projectId={projectId}
            sectionId={id}
            today={today}
            labels={labels}
            alignWithTask
            onCreated={onSubtaskAdded}
            onError={onError}
          />
        </div>
      </>}
    </div>
  );
}
