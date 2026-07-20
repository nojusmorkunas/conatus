"use client";

import { useEffect, useState } from "react";
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
import { generateKeyBetween } from "fractional-indexing";

import type {
  labels as labelsTable,
  sections as sectionsTable,
} from "@/lib/db/schema";
import { cn } from "@/lib/utils";
import { LabelChip } from "@/components/labels/label-chip";
import { TaskAddForm } from "@/components/tasks/task-add-form";
import { TaskCheckbox } from "@/components/tasks/task-checkbox";
import {
  AssigneeChip,
  DeadlineChip,
  DueChip,
  DurationChip,
} from "@/components/tasks/task-row";
import type { ProjectMember, TaskWithLabels } from "@/components/tasks/task-list";

type Label = typeof labelsTable.$inferSelect;
type Section = typeof sectionsTable.$inferSelect;

export function Board({
  projectId,
  sections,
  initialTasks,
  labels,
  members,
  currentUserId,
  today,
  dateFormat,
  onOpenCountChange,
}: {
  projectId: string;
  sections: Section[];
  initialTasks: TaskWithLabels[];
  labels: Label[];
  members: ProjectMember[];
  currentUserId: string;
  today: string;
  dateFormat: string;
  onOpenCountChange: (count: number) => void;
}) {
  const [tasks, setTasks] = useState(initialTasks);
  const [error, setError] = useState<string | null>(null);
  // Touch cards drag only after a hold; swipes keep scrolling the board.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 8 },
    }),
  );

  const [syncedFrom, setSyncedFrom] = useState(initialTasks);
  if (initialTasks !== syncedFrom) {
    setSyncedFrom(initialTasks);
    setTasks(initialTasks);
  }

  const openTaskCount = tasks.filter((task) => !task.isCompleted).length;
  useEffect(() => {
    onOpenCountChange(openTaskCount);
  }, [onOpenCountChange, openTaskCount]);

  async function refresh() {
    const response = await fetch(`/api/tasks?projectId=${projectId}`);
    if (response.ok) setTasks(await response.json());
  }

  async function withError(action: () => Promise<Response>) {
    setError(null);
    const response = await action();
    if (!response.ok) {
      setError("That didn't work. Try again.");
      return false;
    }
    return true;
  }

  async function toggleComplete(task: TaskWithLabels) {
    setTasks((current) =>
      current.map((existing) =>
        existing.id === task.id ? { ...existing, isCompleted: true } : existing,
      ),
    );
    const ok = await withError(() =>
      fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: true }),
      }),
    );
    // Completing a recurring task advances its due date server-side
    // instead of completing it; re-sync so it reappears with the new date.
    if (!ok || (task.recurrence && task.dueDate)) await refresh();
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

  async function handleDragEnd({ active, over }: DragEndEvent) {
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
    const after = cards[index] ?? null;

    const order = generateKeyBetween(before?.order ?? null, after?.order ?? null);
    setTasks((current) =>
      current.map((existing) =>
        existing.id === task.id ? { ...existing, sectionId, order } : existing,
      ),
    );

    const ok = await withError(() =>
      fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionId, afterId: before?.id ?? null }),
      }),
    );
    if (!ok) await refresh();
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
              labels={labels}
              members={members}
              currentUserId={currentUserId}
              today={today}
              dateFormat={dateFormat}
              onToggle={toggleComplete}
              onCreated={refresh}
              onError={() => setError("That didn't work. Try again.")}
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
  labels,
  members,
  currentUserId,
  today,
  dateFormat,
  onToggle,
  onCreated,
  onError,
}: {
  id: string | null;
  name: string;
  cards: TaskWithLabels[];
  projectId: string;
  labels: Label[];
  members: ProjectMember[];
  currentUserId: string;
  today: string;
  dateFormat: string;
  onToggle: (task: TaskWithLabels) => void;
  onCreated: () => void;
  onError: () => void;
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

      <TaskAddForm
        projectId={projectId}
        sectionId={id}
        today={today}
        labels={labels}
        onCreated={onCreated}
        onError={onError}
      />
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
        <Link href={`/projects/${task.projectId}?task=${task.id}`} className="text-base sm:text-sm">
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
