"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

import { useOffline, useProjectLists, useWrites } from "@/lib/offline/hooks";
import { cn } from "@/lib/utils";
import { LabelChip } from "@/components/labels/label-chip";
import { TaskAddForm } from "@/components/tasks/task-add-form";
import { TaskCheckbox } from "@/components/tasks/task-checkbox";
import { CompletedTasks } from "@/components/tasks/completed-tasks";
import {
  AssigneeChip,
  DeadlineChip,
  DueChip,
  DurationChip,
} from "@/components/tasks/task-chips";
import type { ProjectMember, TaskWithLabels } from "@/components/tasks/types";

export function Board({
  projectId,
  members,
  currentUserId,
  today,
  dateFormat,
  timezone,
  showCompleted,
}: {
  projectId: string;
  members: ProjectMember[];
  currentUserId: string;
  today: string;
  dateFormat: string;
  timezone: string;
  showCompleted: boolean;
}) {
  const { tasks, completedRoots, sections } = useProjectLists(projectId);
  const stateTasks = useMemo(() => [...tasks, ...completedRoots], [tasks, completedRoots]);
  const { tasks: writes } = useWrites();
  const { store } = useOffline();
  const [error, setError] = useState<string | null>(null);
  // Touch cards drag only after a hold; swipes keep scrolling the board.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 8 },
    }),
  );

  // Writes want the task as the store has it now.
  const entity = (task: TaskWithLabels) => store.getSnapshot().tasks.get(task.id);

  function restoreCompleted(task: TaskWithLabels) {
    const current = entity(task);
    if (!current) return setError("That didn't work. Try again.");
    writes.reopen(current);
  }

  function toggleComplete(task: TaskWithLabels) {
    const current = entity(task);
    if (current) writes.complete(current);
  }

  const roots = (sectionId: string | null) =>
    tasks
      .filter(
        (task) =>
          !task.isCompleted &&
          task.sectionId === sectionId &&
          task.parentId === null,
      )
      .sort((a, b) => (a.order < b.order ? -1 : 1));

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const task = tasks.find((candidate) => candidate.id === active.id);
    if (!task) return;

    const overId = String(over.id);
    let sectionId: string | null;
    let index: number;
    if (overId.startsWith("column:")) {
      sectionId = overId === "column:none" ? null : overId.slice("column:".length);
      index = roots(sectionId).filter((card) => card.id !== task.id).length;
    } else {
      const overTask = tasks.find((candidate) => candidate.id === overId);
      if (!overTask) return;
      sectionId = overTask.sectionId;
      const cards = roots(sectionId).filter((card) => card.id !== task.id);
      index = cards.findIndex((card) => card.id === overTask.id);
      // Dragging down within a column lands after the hovered card.
      if (task.sectionId === sectionId && task.order < overTask.order) index += 1;
    }

    const cards = roots(sectionId).filter((card) => card.id !== task.id);
    const before = index > 0 ? cards[index - 1] : null;

    const current = entity(task);
    if (current) writes.place(current, sectionId, null, before?.id ?? null);
  }

  const columns: { id: string | null; name: string }[] = [
    { id: null, name: "(No section)" },
    ...sections.map((section) => ({ id: section.id, name: section.name })),
  ];

  return (
    <div className="flex flex-col gap-2">
      <DndContext
        id={`project-board-${projectId}`}
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragEnd={handleDragEnd}
      >
        <div className="flex items-start gap-3 overflow-x-auto pb-4">
          {columns.map((column) => (
            <Column
              key={column.id ?? "none"}
              id={column.id}
              name={column.name}
              cards={roots(column.id)}
              projectId={projectId}
              members={members}
              currentUserId={currentUserId}
              today={today}
              dateFormat={dateFormat}
              onToggle={toggleComplete}
              footer={showCompleted ? (
                <CompletedTasks
                  sectionId={column.id}
                  stateTasks={stateTasks}
                  today={today}
                  dateFormat={dateFormat}
                  timezone={timezone}
                  onRestore={restoreCompleted}
                />
              ) : undefined}
            />
          ))}
        </div>
      </DndContext>

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function Column({
  id,
  name,
  cards,
  projectId,
  members,
  currentUserId,
  today,
  dateFormat,
  onToggle,
  footer,
}: {
  id: string | null;
  name: string;
  cards: TaskWithLabels[];
  projectId: string;
  members: ProjectMember[];
  currentUserId: string;
  today: string;
  dateFormat: string;
  onToggle: (task: TaskWithLabels) => void;
  footer?: ReactNode;
}) {
  const { setNodeRef } = useDroppable({ id: id ? `column:${id}` : "column:none" });

  return (
    <div className="flex w-64 shrink-0 flex-col gap-1 rounded-lg bg-muted/30 p-2">
      <h2 className="px-1 text-sm font-medium text-muted-foreground">
        {name} <span className="font-normal">{cards.length}</span>
      </h2>

      <SortableContext
        items={cards.map((card) => card.id)}
        strategy={verticalListSortingStrategy}
      >
        <div ref={setNodeRef} className="flex min-h-2 flex-col gap-1">
          {cards.map((task) => (
            <Card
              key={task.id}
              task={task}
              members={members}
              currentUserId={currentUserId}
              today={today}
              dateFormat={dateFormat}
              onToggle={onToggle}
            />
          ))}
        </div>
      </SortableContext>

      <TaskAddForm projectId={projectId} sectionId={id} today={today} />
      {footer}
    </div>
  );
}

function Card({
  task,
  members,
  currentUserId,
  today,
  dateFormat,
  onToggle,
}: {
  task: TaskWithLabels;
  members: ProjectMember[];
  currentUserId: string;
  today: string;
  dateFormat: string;
  onToggle: (task: TaskWithLabels) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        transform: transform
          ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
          : undefined,
        transition,
      }}
      className={cn(
        "flex cursor-grab touch-auto select-none flex-col gap-1 rounded-md border border-border bg-background p-2",
        isDragging && "opacity-50",
      )}
    >
      <div className="flex items-start gap-2">
        <TaskCheckbox
          priority={task.priority}
          checked={task.isCompleted}
          onToggle={() => onToggle(task)}
        />
        <Link href={`/projects/${encodeURIComponent(task.projectId)}?task=${encodeURIComponent(task.id)}`} className="text-base sm:text-sm">
          {task.content}
        </Link>
      </div>

      {(task.dueDate ||
        task.deadlineDate ||
        task.durationMinutes ||
        task.labels.length > 0 ||
        (members.length > 1 && task.assigneeId)) && (
        <div className="flex flex-wrap items-center gap-1 pl-6">
          <DueChip task={task} today={today} dateFormat={dateFormat} />
          <DeadlineChip task={task} today={today} dateFormat={dateFormat} />
          <DurationChip task={task} />
          {members.length > 1 && (
            <AssigneeChip
              assigneeId={task.assigneeId}
              members={members}
              currentUserId={currentUserId}
            />
          )}
          {task.labels.map((label) => (
            <LabelChip key={label.id} label={label} />
          ))}
        </div>
      )}
    </div>
  );
}
