"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  MouseSensor,
  TouchSensor,
  closestCenter,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { generateKeyBetween } from "fractional-indexing";

import { TaskCheckbox } from "./task-checkbox";
import { TaskModal } from "./task-modal";
import { TaskGroup } from "./task-group";
import { CreateSectionForm } from "./create-section-form";
import { BulkToolbar } from "./bulk-toolbar";
import { usePendingAction } from "@/lib/use-pending-action";
import { compareTasks, type SortBy } from "@/lib/task-sort";
import {
  flattenTaskGroup,
  projectTaskDepth,
  subtreeIds,
  taskDepth,
} from "@/lib/task-tree";
import type { Label, Project, ProjectMember, Section, TaskWithLabels } from "./types";

export type { ProjectMember, TaskWithLabels };

export function TaskList({
  projectId,
  sections,
  initialTasks,
  labels,
  members,
  currentUserId,
  today,
  dateFormat,
  sortBy,
  initialDetailTaskId,
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
  sortBy: SortBy;
  initialDetailTaskId?: string;
  onOpenCountChange: (count: number) => void;
}) {
  const [tasks, setTasks] = useState(initialTasks);
  const [orderedSections, setOrderedSections] = useState(sections);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [projection, setProjection] = useState<ReturnType<typeof projectTaskDepth>>(null);
  const projectionRef = useRef<ReturnType<typeof projectTaskDepth>>(null);
  const [error, setError] = useState<string | null>(null);
  const [detailTaskId, setDetailTaskId] = useState<string | null>(initialDetailTaskId ?? null);
  const [selecting, setSelecting] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [collapsedTaskIds, setCollapsedTaskIds] = useState<Set<string>>(() => new Set());
  const [projects, setProjects] = useState<Project[]>([]);
  const { pending, schedule, undo } = usePendingAction();
  const router = useRouter();
  // Mouse dragging stays quick, while touch requires an intentional hold.
  // The touch movement tolerance lets a normal swipe remain native scrolling.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 8 },
    }),
  );

  // Re-sync when the server gives us a fresh task list (e.g. a section was
  // added or deleted elsewhere on the page), without clobbering in-flight
  // optimistic edits between refreshes.
  const [syncedFrom, setSyncedFrom] = useState(initialTasks);
  if (initialTasks !== syncedFrom) {
    setSyncedFrom(initialTasks);
    setTasks(initialTasks);
  }

  const openTaskCount = tasks.filter((task) => !task.isCompleted).length;
  useEffect(() => {
    onOpenCountChange(openTaskCount);
  }, [onOpenCountChange, openTaskCount]);

  const [syncedSectionsFrom, setSyncedSectionsFrom] = useState(sections);
  if (sections !== syncedSectionsFrom) {
    setSyncedSectionsFrom(sections);
    setOrderedSections(sections);
  }

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

  async function mutateSection(action: () => Promise<Response>) {
    const ok = await withError(action);
    if (ok) router.refresh();
    return ok;
  }

  async function loadProjects() {
    const response = await fetch("/api/projects");
    if (response.ok) {
      setProjects(await response.json());
    } else {
      setError("That didn't work. Try again.");
    }
  }

  function exitSelectMode() {
    setSelecting(false);
    setSelectedTaskIds([]);
  }

  function toggleTaskSelection(task: TaskWithLabels) {
    setSelectedTaskIds((current) =>
      current.includes(task.id)
        ? current.filter((id) => id !== task.id)
        : [...current, task.id],
    );
  }

  useEffect(() => {
    if (!selecting) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") exitSelectMode();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selecting]);

  useEffect(() => {
    function onToggleSelectMode() {
      if (selecting) {
        exitSelectMode();
        return;
      }

      setSelecting(true);
      void loadProjects();
    }

    window.addEventListener("task-select:toggle", onToggleSelectMode);
    return () => window.removeEventListener("task-select:toggle", onToggleSelectMode);
  }, [selecting]);

  async function toggleComplete(task: TaskWithLabels) {
    const completed = !task.isCompleted;
    if (!completed) {
      setTasks((current) =>
        current.map((existing) =>
          existing.id === task.id ? { ...existing, isCompleted: false } : existing,
        ),
      );
      const ok = await withError(() =>
        fetch(`/api/tasks/${task.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ completed: false }),
        }),
      );
      if (!ok) await refresh();
      return;
    }

    const previousTasks = tasks;
    setTasks((current) =>
      current.map((existing) =>
        existing.id === task.id
          ? { ...existing, isCompleted: true }
          : existing,
      ),
    );
    schedule(
      `Completed "${task.content}"`,
      async () => {
        const ok = await withError(() =>
          fetch(`/api/tasks/${task.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ completed: true }),
          }),
        );
        // Recurring tasks reappear with their server-advanced due date after the delay.
        if (!ok || (task.recurrence && task.dueDate)) await refresh();
      },
      () => setTasks(previousTasks),
    );
  }

  function deleteTask(task: TaskWithLabels) {
    const previousTasks = tasks;
    setTasks((current) => current.filter((existing) => existing.id !== task.id));
    schedule(
      `Moved "${task.content}" to Trash`,
      async () => {
        await withError(() =>
          fetch(`/api/tasks/${task.id}`, { method: "DELETE" }),
        );
        await refresh();
      },
      () => setTasks(previousTasks),
    );
  }

  async function changeDue(
    task: TaskWithLabels,
    dueDate: string | null,
    dueTime: string | null,
    deadlineDate: string | null,
    durationMinutes: number | null,
  ) {
    const ok = await withError(() =>
      fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dueDate, dueTime, deadlineDate, durationMinutes }),
      }),
    );
    if (ok) await refresh();
  }

  async function quickChangeDue(task: TaskWithLabels, dueDate: string | null) {
    const ok = await withError(() => patchTask(task.id, { dueDate }));
    if (ok) await refresh();
  }

  async function changePriority(task: TaskWithLabels, priority: number) {
    const ok = await withError(() => patchTask(task.id, { priority }));
    if (ok) await refresh();
  }

  async function moveTask(task: TaskWithLabels, targetProjectId: string) {
    if (targetProjectId === task.projectId) return;
    const ok = await withError(() => patchTask(task.id, { projectId: targetProjectId }));
    if (ok) {
      await refresh();
      // Re-run the server layout so the sidebar's per-project counts reflect
      // the task leaving one project and joining another.
      router.refresh();
    }
  }

  async function duplicateTask(task: TaskWithLabels) {
    setError(null);
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
    if (!response.ok) {
      setError("That didn't work. Try again.");
      return;
    }
    const duplicate: { id: string } = await response.json();
    if (task.labels.length) {
      const copiedLabels = await patchTask(duplicate.id, { labelIds: task.labels.map((label) => label.id) });
      if (!copiedLabels.ok) setError("That didn't work. Try again.");
    }
    await refresh();
  }

  async function changeLabels(task: TaskWithLabels, labelIds: string[]) {
    const ok = await withError(() =>
      fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ labelIds }),
      }),
    );
    if (ok) await refresh();
  }

  async function changeAssignee(
    task: TaskWithLabels,
    assigneeId: string | null,
  ) {
    const ok = await withError(() =>
      fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assigneeId }),
      }),
    );
    if (ok) await refresh();
  }

  async function bulkAction(
    selectedTasks: TaskWithLabels[],
    action: (task: TaskWithLabels) => Promise<Response>,
  ) {
    if (selectedTasks.length === 0) return;

    let succeeded = false;
    setError(null);
    try {
      // ponytail: per-task fanout, batch endpoint when N gets large.
      const responses = await Promise.all(selectedTasks.map(action));
      succeeded = responses.every((response) => response.ok);
      if (!succeeded) setError("Some updates failed.");
    } catch {
      setError("Some updates failed.");
    } finally {
      await refresh();
      if (succeeded) exitSelectMode();
    }
  }

  function patchTask(taskId: string, body: object) {
    return fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  function selectedTasks() {
    return tasks.filter((task) => selectedTaskIds.includes(task.id));
  }

  function completeSelectedTasks() {
    const affectedTasks = selectedTasks();
    if (affectedTasks.length === 0) return;
    const affectedIds = new Set(affectedTasks.map((task) => task.id));
    const previousTasks = tasks;
    setTasks((current) =>
      current.map((task) =>
        affectedIds.has(task.id) ? { ...task, isCompleted: true } : task,
      ),
    );
    schedule(
      `Completed ${affectedTasks.length} tasks`,
      () => bulkAction(affectedTasks, (task) => patchTask(task.id, { completed: true })),
      () => setTasks(previousTasks),
    );
  }

  function deleteSelectedTasks() {
    const affectedTasks = selectedTasks();
    if (affectedTasks.length === 0) return;
    const affectedIds = new Set(affectedTasks.map((task) => task.id));
    const previousTasks = tasks;
    setTasks((current) => current.filter((task) => !affectedIds.has(task.id)));
    schedule(
      `Moved ${affectedTasks.length} tasks to Trash`,
      () => bulkAction(affectedTasks, (task) => fetch(`/api/tasks/${task.id}`, { method: "DELETE" })),
      () => setTasks(previousTasks),
    );
  }

  const visible = useMemo(() => tasks.filter((task) => !task.isCompleted), [tasks]);
  const roots = (sectionId: string | null) =>
    visible
      .filter((task) => task.sectionId === sectionId && task.parentId === null)
      .sort((a, b) => compareTasks(sortBy, a, b));

  const groups: { id: string | null; name: string | null }[] = [
    { id: null, name: null },
    ...orderedSections.map((section) => ({ id: section.id, name: section.name })),
  ];
  const detailTask = detailTaskId ? tasks.find((task) => task.id === detailTaskId) ?? null : null;
  const flatOrder = groups.flatMap((group) => roots(group.id).map((task) => task.id));
  const detailIndex = detailTaskId ? flatOrder.indexOf(detailTaskId) : -1;
  const activeTask = tasks.find((task) => task.id === activeId) ?? null;
  // The ghost keeps the depth the task had when it was picked up so it never
  // shifts sideways mid-drag; the placeholder row carries the projected depth.
  const activeDepth = activeTask ? taskDepth(tasks, activeTask.id) : 0;
  const activeSection = orderedSections.find((section) => section.id === activeId) ?? null;
  // The dragged row itself is the drop indicator: dnd-kit slides it into the
  // target slot, and we render it indented to the projected depth so it shows
  // exactly where — and at what nesting level — it will land. A single source
  // of truth, so nothing can disagree.
  const activeProjectedDepth = projection?.depth ?? null;

  function toggleTaskCollapsed(taskId: string) {
    setCollapsedTaskIds((current) => {
      const next = new Set(current);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }

  const flatTasks = useMemo(
    () => [null, ...orderedSections.map((section) => section.id)]
      .flatMap((sectionId) => flattenTaskGroup(visible, sectionId)),
    [visible, orderedSections],
  );

  function updateProjection(next: ReturnType<typeof projectTaskDepth>) {
    const current = projectionRef.current;
    if (
      current?.depth === next?.depth &&
      current?.parentId === next?.parentId &&
      current?.sectionId === next?.sectionId &&
      current?.afterId === next?.afterId
    ) return;
    projectionRef.current = next;
    setProjection(next);
  }

  function dragProjection(event: Pick<DragMoveEvent, "active" | "over" | "delta">) {
    if (!event.over) return null;
    const overId = String(event.over.id);
    if (overId.startsWith("task-group:")) {
      const groupId = overId.slice("task-group:".length);
      const sectionId = groupId === "none" ? null : groupId;
      const rootsInGroup = roots(sectionId).filter((candidate) => candidate.id !== event.active.id);
      return {
        depth: 0,
        parentId: null,
        sectionId,
        afterId: rootsInGroup.at(-1)?.id ?? null,
      };
    }
    return projectTaskDepth({
      items: flatTasks,
      activeId: String(event.active.id),
      overId,
      offsetX: event.delta.x,
    });
  }

  async function handleTaskDragEnd({ active, over, delta }: DragEndEvent) {
    if (!over) return;
    const task = tasks.find((candidate) => candidate.id === active.id);
    const target = projectionRef.current ?? dragProjection({ active, over, delta });
    if (!task || !target) return;

    const siblings = tasks
      .filter((candidate) =>
        candidate.id !== task.id &&
        candidate.parentId === target.parentId &&
        (target.parentId !== null || candidate.sectionId === target.sectionId)
      )
      .sort((a, b) => (a.order < b.order ? -1 : 1));
    const beforeIndex = target.afterId
      ? siblings.findIndex((candidate) => candidate.id === target.afterId)
      : -1;
    const before = beforeIndex >= 0 ? siblings[beforeIndex] : null;
    const after = siblings[beforeIndex + 1] ?? null;
    const order = generateKeyBetween(before?.order ?? null, after?.order ?? null);
    const movedIds = subtreeIds(tasks, task.id);
    setTasks((current) =>
      current.map((existing) =>
        existing.id === task.id
          ? { ...existing, sectionId: target.sectionId, parentId: target.parentId, order }
          : movedIds.has(existing.id)
            ? { ...existing, sectionId: target.sectionId }
            : existing,
      ),
    );

    const ok = await withError(() =>
      fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sectionId: target.sectionId,
          parentId: target.parentId,
          afterId: before?.id ?? null,
        }),
      }),
    );
    if (!ok) await refresh();
  }

  async function handleSectionDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const section = orderedSections.find((candidate) => candidate.id === active.id);
    const overSection = orderedSections.find((candidate) => candidate.id === over.id);
    if (!section || !overSection) return;

    const others = orderedSections.filter((candidate) => candidate.id !== section.id);
    let index = others.findIndex((candidate) => candidate.id === overSection.id);
    if (section.order < overSection.order) index += 1;
    const before = index > 0 ? others[index - 1] : null;
    const after = others[index] ?? null;
    const order = generateKeyBetween(before?.order ?? null, after?.order ?? null);
    setOrderedSections((current) =>
      current.map((existing) => existing.id === section.id ? { ...existing, order } : existing)
        .sort((a, b) => (a.order < b.order ? -1 : 1)),
    );

    const ok = await withError(() =>
      fetch(`/api/sections/${section.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ afterId: before?.id ?? null }),
      }),
    );
    if (!ok) router.refresh();
  }

  return (
    <div className="flex flex-col gap-7">
      {tasks.length === 0 && orderedSections.length === 0 && (
        <EmptyState
          icon={Plus}
          title="No tasks yet"
          description="Add a task to get started."
        />
      )}

      <DndContext
        id={`task-list-${projectId}`}
        sensors={sensors}
        collisionDetection={(args) =>
          tasks.some((task) => task.id === args.active.id)
            ? closestCenter(args)
            : closestCorners(args)
        }
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        // Only auto-scroll within a narrow band right at the top/bottom edge,
        // and gently. The default 20%-of-viewport band with fast acceleration
        // made a barely-there drag run the drop target far down the list.
        autoScroll={{ threshold: { x: 0, y: 0.05 }, acceleration: 6 }}
        onDragStart={(event: DragStartEvent) => {
          setActiveId(String(event.active.id));
          updateProjection(null);
        }}
        onDragMove={(event) => {
          if (!selecting && sortBy === "manual") updateProjection(dragProjection(event));
        }}
        onDragOver={(event) => {
          if (!selecting && sortBy === "manual") updateProjection(dragProjection(event));
        }}
        onDragEnd={(event) => {
          setActiveId(null);
          if (orderedSections.some((section) => section.id === event.active.id)) {
            void handleSectionDragEnd(event);
          } else if (!selecting && sortBy === "manual") {
            void handleTaskDragEnd(event);
          }
          updateProjection(null);
        }}
        onDragCancel={() => {
          setActiveId(null);
          updateProjection(null);
        }}
      >
        <SortableContext
          items={orderedSections.map((section) => section.id)}
          strategy={verticalListSortingStrategy}
        >
          {groups.map((group, index) => (
            <div key={group.id ?? "unsectioned"} className="flex flex-col">
              <TaskGroup
                id={group.id}
                section={group.name ? orderedSections[index - 1] : undefined}
                tasks={visible}
                allTasks={tasks}
                projectId={projectId}
                labels={labels}
                members={members}
                currentUserId={currentUserId}
                today={today}
                dateFormat={dateFormat}
                selecting={selecting}
                draggable={!selecting && sortBy === "manual"}
                activeTaskId={activeTask?.id ?? null}
                activeProjectedDepth={activeProjectedDepth}
                collapsedTaskIds={collapsedTaskIds}
                selectedTaskIds={selectedTaskIds}
                onToggle={toggleComplete}
                onDelete={deleteTask}
                onLabelsChange={changeLabels}
                onAssigneeChange={changeAssignee}
                onDueChange={changeDue}
                onQuickDueChange={quickChangeDue}
                onPriorityChange={changePriority}
                onMove={moveTask}
                onDuplicate={duplicateTask}
                onSubtaskAdded={refresh}
                onOpenDetail={(task) => setDetailTaskId(task.id)}
                onSelectionToggle={toggleTaskSelection}
                onToggleTaskCollapsed={toggleTaskCollapsed}
                onRenameSection={(section, name) =>
                  mutateSection(() => fetch(`/api/sections/${section.id}`, {
                    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }),
                  }))
                }
                onDeleteSection={(section) =>
                  mutateSection(() => fetch(`/api/sections/${section.id}`, { method: "DELETE" }))
                }
                onError={() => setError("That didn't work. Try again.")}
              />
              {!selecting && (
                <CreateSectionForm
                  projectId={projectId}
                  afterId={group.id}
                  onCreated={() => router.refresh()}
                  onError={() => setError("That didn't work. Try again.")}
                />
              )}
            </div>
          ))}
        </SortableContext>
        <DragOverlay
          dropAnimation={{
            duration: 220,
            easing: "cubic-bezier(0.18, 0.67, 0.6, 1.22)",
          }}
        >
          {activeTask ? (
            <div
              className="task-drag-ghost flex cursor-grabbing items-start gap-2 rounded-lg border border-border bg-card py-2.5 pr-3 shadow-xl ring-1 ring-black/5"
              style={{ "--ghost-depth": activeDepth } as CSSProperties}
            >
              <TaskCheckbox
                priority={activeTask.priority}
                checked={activeTask.isCompleted}
                onToggle={() => {}}
              />
              <span className="text-sm select-none">{activeTask.content}</span>
            </div>
          ) : activeSection ? (
            <div className="cursor-grabbing rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-bold shadow-xl ring-1 ring-black/5">
              {activeSection.name}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {selectedTaskIds.length > 0 && (
        <BulkToolbar
          count={selectedTaskIds.length}
          projects={projects}
          labels={labels}
          onComplete={completeSelectedTasks}
          onDelete={deleteSelectedTasks}
          onMove={(targetProjectId) =>
            void bulkAction(selectedTasks(), (task) =>
              patchTask(task.id, { projectId: targetProjectId }),
            ).then(() => router.refresh())
          }
          onPriority={(priority) =>
            void bulkAction(selectedTasks(), (task) => patchTask(task.id, { priority }))
          }
          onDueDate={(dueDate) =>
            void bulkAction(selectedTasks(), (task) => patchTask(task.id, { dueDate }))
          }
          onLabel={(labelId) =>
            void bulkAction(selectedTasks(), (task) =>
              patchTask(task.id, {
                labelIds: [...new Set([...task.labels.map((label) => label.id), labelId])],
              }),
            )
          }
        />
      )}

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
          members={members}
          currentUserId={currentUserId}
          today={today}
          dateFormat={dateFormat}
          onClose={() => {
            setDetailTaskId(null);
            refresh();
          }}
          onChanged={refresh}
          onDelete={deleteTask}
          onPrev={detailIndex > 0 ? () => setDetailTaskId(flatOrder[detailIndex - 1]) : undefined}
          onNext={detailIndex !== -1 && detailIndex < flatOrder.length - 1 ? () => setDetailTaskId(flatOrder[detailIndex + 1]) : undefined}
        />
      )}
    </div>
  );
}
