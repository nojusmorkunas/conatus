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
  KeyboardSensor,
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

import { TaskDragPreview } from "./task-row";
import { taskCollisionDetection, taskDropAnimation, taskKeyboardCoordinates } from "./task-drag";
import { jsonInit } from "@/lib/api-client";
import { truncate } from "@/lib/utils";
import { toastManager } from "@/components/ui/toast";
import { projectTaskDrop, type TaskDropProjection, type TaskDropTarget } from "@/lib/task-drop";
import { TaskModal } from "./task-modal";
import { TaskGroup } from "./task-group";
import { CreateSectionForm } from "./create-section-form";
import { usePendingAction } from "@/lib/use-pending-action";
import { useTaskSelection } from "@/lib/use-task-selection";
import { completeRecurring } from "@/lib/recurring-complete";
import { compareTasks, type SortBy } from "@/lib/task-sort";
import {
  flattenTaskGroup,
  subtreeIds,
  taskDepth,
} from "@/lib/task-tree";
import type { Label, ProjectMember, Section, TaskWithLabels } from "./types";

export type { ProjectMember, TaskWithLabels };

// The sidebar runs its own DndContext for reordering projects, and dnd-kit
// cannot drop across contexts. Hit-testing the row under the pointer moves a
// task into a project without merging the two drag systems.
function sidebarProjectRowAt(point: { x: number; y: number } | null) {
  if (!point) return null;
  // The drag overlay follows the pointer and still takes hits, so the whole
  // stack under the point is searched rather than just the topmost element.
  for (const element of document.elementsFromPoint(point.x, point.y)) {
    const row = element.closest<HTMLElement>("[data-project-id], [data-favorite-project-id]");
    if (row) return row;
  }
  return null;
}

function projectIdOf(row: HTMLElement | null) {
  return row?.dataset.projectId ?? row?.dataset.favoriteProjectId ?? null;
}

function projectNameOf(row: HTMLElement | null) {
  return row?.dataset.projectName ?? row?.dataset.favoriteProjectName ?? "the project";
}

// A press and hold that never moved is a request to select, not to reorder.
// Only touch gets here: the mouse sensor needs 5px of travel to start at all.
function heldInPlace(event: DragEndEvent) {
  return (
    event.activatorEvent.type === "touchstart" &&
    Math.abs(event.delta.x) < 6 &&
    Math.abs(event.delta.y) < 6
  );
}

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
  const [projection, setProjection] = useState<TaskDropProjection | null>(null);
  const projectionRef = useRef<TaskDropProjection | null>(null);
  const dropContext = useRef<{ target: TaskDropTarget; visibleIds: Set<string> } | null>(null);
  const indentWidth = useRef(28);
  const sidebarDropRow = useRef<HTMLElement | null>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const moveQueue = useRef(Promise.resolve());
  const moveRevision = useRef(0);
  const moveFailed = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [detailTaskId, setDetailTaskId] = useState<string | null>(initialDetailTaskId ?? null);
  const [collapsedTaskIds, setCollapsedTaskIds] = useState<Set<string>>(() => new Set());
  const {
    selecting,
    selectedIds: selectedTaskIds,
    start: startSelecting,
    toggle: toggleTaskSelection,
    exit: exitSelection,
    run: runOnSelection,
  } = useTaskSelection();
  const { pending, schedule, undo } = usePendingAction();
  const router = useRouter();
  // Mouse dragging stays quick, while touch requires an intentional hold.
  // The touch movement tolerance lets a normal swipe remain native scrolling.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: taskKeyboardCoordinates, scrollBehavior: "auto" }),
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

  async function toggleComplete(task: TaskWithLabels) {
    const completed = !task.isCompleted;
    if (!completed) {
      setTasks((current) =>
        current.map((existing) =>
          existing.id === task.id ? { ...existing, isCompleted: false } : existing,
        ),
      );
      const ok = await withError(() =>
        fetch(`/api/tasks/${task.id}`, jsonInit("PATCH", { completed: false })),
      );
      if (!ok) await refresh();
      return;
    }

    if (task.recurrence && task.dueDate) {
      setError(null);
      const result = await completeRecurring(task);
      if (!result) {
        setError("That didn't work. Try again.");
        return;
      }
      // The advanced row carries no labels, so spreading it over the existing
      // task keeps the ones already on screen.
      setTasks((current) =>
        current.map((existing) =>
          existing.id === task.id ? { ...existing, ...result.updated } : existing,
        ),
      );
      schedule(
        `Completed "${truncate(task.content)}"`,
        // Already written, so the toast only has an inverse left to offer.
        () => {},
        () => {
          setTasks((current) =>
            current.map((existing) => (existing.id === task.id ? task : existing)),
          );
          void withError(() => patchTask(task.id, result.undo)).then((ok) => {
            if (!ok) void refresh();
          });
        },
      );
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
      `Completed "${truncate(task.content)}"`,
      async () => {
        const ok = await withError(() =>
          fetch(`/api/tasks/${task.id}`, jsonInit("PATCH", { completed: true })),
        );
        if (!ok) await refresh();
      },
      () => setTasks(previousTasks),
    );
  }

  function deleteTask(task: TaskWithLabels) {
    const previousTasks = tasks;
    setTasks((current) => current.filter((existing) => existing.id !== task.id));
    schedule(
      `Moved "${truncate(task.content)}" to Trash`,
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
      fetch(`/api/tasks/${task.id}`, jsonInit("PATCH", { dueDate, dueTime, deadlineDate, durationMinutes })),
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

  // Selecting a task selects what hangs off it. The clicked task comes first
  // so the hook knows which one was ticked.
  function selectionIdsFor(task: TaskWithLabels) {
    return [task.id, ...[...subtreeIds(tasks, task.id)].filter((id) => id !== task.id)];
  }

  // A row inside the selection speaks for all of it: the menu, and a drag.
  function actsOnSelection(task: TaskWithLabels) {
    return selecting && selectedTaskIds.length > 1 && selectedTaskIds.includes(task.id);
  }

  // Dragging any one of the selected tasks takes the rest with it.
  async function moveSelectedTasks(targetProjectId: string) {
    const ok = await bulkAction((task) => patchTask(task.id, { projectId: targetProjectId }));
    router.refresh();
    return ok;
  }

  async function dropOnProject(task: TaskWithLabels, projectId: string, projectName: string) {
    const count = actsOnSelection(task) ? selectedTaskIds.length : 1;
    const ok = actsOnSelection(task)
      ? await moveSelectedTasks(projectId)
      : await moveTask(task, projectId);
    if (!ok) return;
    toastManager.add({
      title: `${count} ${count === 1 ? "task" : "tasks"} added to ${projectName}`,
    });
  }

  async function moveTask(task: TaskWithLabels, targetProjectId: string) {
    if (targetProjectId === task.projectId) return false;
    const ok = await withError(() => patchTask(task.id, { projectId: targetProjectId }));
    if (ok) {
      await refresh();
      // Re-run the server layout so the sidebar's per-project counts reflect
      // the task leaving one project and joining another.
      router.refresh();
    }
    return ok;
  }

  // Copying labels needs a second request, so the caller gets whichever
  // response decides the outcome.
  async function duplicateRequest(task: TaskWithLabels) {
    const response = await fetch("/api/tasks", jsonInit("POST", {
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
      }));
    if (!response.ok || !task.labels.length) return response;
    const duplicate: { id: string } = await response.json();
    return patchTask(duplicate.id, { labelIds: task.labels.map((label) => label.id) });
  }

  async function duplicateTask(task: TaskWithLabels) {
    setError(null);
    const response = await duplicateRequest(task);
    if (!response.ok) setError("That didn't work. Try again.");
    await refresh();
  }

  // The menu reports the clicked row's new label list; the rest of the
  // selection gets the same labels added or removed, keeping their own.
  function changeSelectionLabels(task: TaskWithLabels, labelIds: string[]) {
    const added = labelIds.filter((id) => !task.labels.some((label) => label.id === id));
    const removed = task.labels.filter((label) => !labelIds.includes(label.id)).map((label) => label.id);
    return bulkAction((selected) =>
      patchTask(selected.id, {
        labelIds: [...new Set([...selected.labels.map((label) => label.id), ...added])]
          .filter((id) => !removed.includes(id)),
      }),
    );
  }

  async function changeLabels(task: TaskWithLabels, labelIds: string[]) {
    const ok = await withError(() =>
      fetch(`/api/tasks/${task.id}`, jsonInit("PATCH", { labelIds })),
    );
    if (ok) await refresh();
  }

  async function changeAssignee(
    task: TaskWithLabels,
    assigneeId: string | null,
  ) {
    const ok = await withError(() =>
      fetch(`/api/tasks/${task.id}`, jsonInit("PATCH", { assigneeId })),
    );
    if (ok) await refresh();
  }

  async function bulkAction(action: (task: TaskWithLabels) => Promise<Response>) {
    setError(null);
    const byId = new Map(tasks.map((task) => [task.id, task]));
    const ok = await runOnSelection(
      (taskId) => action(byId.get(taskId)!),
      refresh,
    );
    if (!ok) setError("Some updates failed.");
    return ok;
  }

  function patchTask(taskId: string, body: object) {
    return fetch(`/api/tasks/${taskId}`, jsonInit("PATCH", body));
  }

  function completeSelectedTasks() {
    if (selectedTaskIds.length === 0) return;
    const affectedIds = new Set(selectedTaskIds);
    const previousTasks = tasks;
    setTasks((current) =>
      current.map((task) =>
        affectedIds.has(task.id) ? { ...task, isCompleted: true } : task,
      ),
    );
    schedule(
      `Completed ${affectedIds.size} tasks`,
      () => bulkAction((task) => patchTask(task.id, { completed: true })),
      () => setTasks(previousTasks),
    );
  }

  function deleteSelectedTasks() {
    if (selectedTaskIds.length === 0) return;
    const affectedIds = new Set(selectedTaskIds);
    const previousTasks = tasks;
    setTasks((current) => current.filter((task) => !affectedIds.has(task.id)));
    schedule(
      `Moved ${affectedIds.size} tasks to Trash`,
      () => bulkAction((task) => fetch(`/api/tasks/${task.id}`, { method: "DELETE" })),
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
  const draggingSelection = Boolean(activeTask && selectedTaskIds.includes(activeTask.id));
  const draggedCount = draggingSelection ? selectedTaskIds.length : 1;
  const activeDepth = activeTask ? taskDepth(tasks, activeTask.id) : 0;
  const activeSection = orderedSections.find((section) => section.id === activeId) ?? null;
  const draggedIds = useMemo(() => activeId ? subtreeIds(tasks, activeId) : new Set<string>(), [tasks, activeId]);

  // dnd-kit reports how far a drag has travelled, but that figure is batched
  // and can lag the release. Where the pointer actually is decides the drop.
  useEffect(() => {
    if (!activeId) return;
    function track(event: PointerEvent) {
      pointer.current = { x: event.clientX, y: event.clientY };
    }
    window.addEventListener("pointermove", track, true);
    window.addEventListener("pointerup", track, true);
    return () => {
      window.removeEventListener("pointermove", track, true);
      window.removeEventListener("pointerup", track, true);
    };
  }, [activeId]);

  useEffect(() => {
    if (!activeId) return;
    const previous = document.body.style.cursor;
    document.body.style.cursor = "grabbing";
    return () => { document.body.style.cursor = previous; };
  }, [activeId]);

  // Marks the sidebar row directly rather than lifting drag state into the
  // layout: the sidebar does not re-render during a task drag, so the
  // attribute survives until it is cleared here.
  function highlightSidebarDrop(point: { x: number; y: number } | null) {
    const row = sidebarProjectRowAt(point);
    if (row === sidebarDropRow.current) return;
    sidebarDropRow.current?.removeAttribute("data-task-drop-target");
    sidebarDropRow.current = row;
    row?.setAttribute("data-task-drop-target", "");
  }

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
      .flatMap((sectionId) => flattenTaskGroup(tasks, sectionId)),
    [tasks, orderedSections],
  );

  // Only the top of a selected branch moves: its subtasks come along with it,
  // and moving them too would flatten them into the drop target.
  function selectionRoots() {
    const selected = new Set(selectedTaskIds);
    const byId = new Map(tasks.map((task) => [task.id, task]));
    const rowOrder = new Map(flatTasks.map((task, index) => [task.id, index]));
    return selectedTaskIds
      .filter((id) => {
        let parentId = byId.get(id)?.parentId ?? null;
        while (parentId) {
          if (selected.has(parentId)) return false;
          parentId = byId.get(parentId)?.parentId ?? null;
        }
        return true;
      })
      .sort((a, b) => (rowOrder.get(a) ?? 0) - (rowOrder.get(b) ?? 0));
  }

  // A drop inside the list puts the whole selection at the drop point, in the
  // order the rows appear now. Each task lands after the previous one, so the
  // group keeps its shape instead of arriving reversed.
  async function moveSelectionTo(target: TaskDropProjection) {
    setError(null);
    let afterId = target.afterId;
    for (const id of selectionRoots()) {
      const response = await patchTask(id, {
        sectionId: target.sectionId,
        parentId: target.parentId,
        afterId,
      });
      if (!response.ok) {
        setError("Some updates failed.");
        break;
      }
      afterId = id;
    }
    await refresh();
    exitSelection();
  }

  function updateProjection(next: TaskDropProjection | null) {
    const current = projectionRef.current;
    if (
      current?.depth === next?.depth &&
      current?.parentId === next?.parentId &&
      current?.sectionId === next?.sectionId &&
      current?.afterId === next?.afterId &&
      current?.beforeId === next?.beforeId
    ) return;
    projectionRef.current = next;
    setProjection(next);
  }

  function dragProjection(event: Pick<DragMoveEvent, "active" | "over" | "delta">) {
    if (!event.over || !dropContext.current) return null;
    return projectTaskDrop({
      items: flatTasks,
      activeId: String(event.active.id),
      ...dropContext.current,
      offsetX: event.delta.x,
      indentWidth: indentWidth.current,
    });
  }

  function describeDrop({ active, over }: Pick<DragMoveEvent, "active" | "over">) {
    if (active.data.current?.type === "section") {
      const section = orderedSections.find((item) => item.id === over?.id);
      return section ? `Over section ${section.name}.` : undefined;
    }
    const next = projectionRef.current;
    if (!next) return "Outside the task list. Release to cancel.";
    const parent = tasks.find((task) => task.id === next.parentId);
    const before = tasks.find((task) => task.id === next.beforeId);
    return `${before ? `Before ${before.content}` : "At the end of the section"}${parent ? `, under ${parent.content}` : ", at the top level"}.`;
  }

  async function handleTaskDragEnd({ active, over, delta }: DragEndEvent) {
    if (!over) return;
    const task = tasks.find((candidate) => candidate.id === active.id);
    const target = dragProjection({ active, over, delta });
    if (!task || !target) return;

    const currentSiblings = visible.filter((item) => item.parentId === task.parentId && item.sectionId === task.sectionId)
      .sort((a, b) => a.order < b.order ? -1 : 1);
    const currentIndex = currentSiblings.findIndex((item) => item.id === task.id);
    if (task.parentId === target.parentId && task.sectionId === target.sectionId &&
      (currentSiblings[currentIndex - 1]?.id ?? null) === target.afterId) return;

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
    if (target.parentId) setCollapsedTaskIds((current) => {
      if (!current.has(target.parentId!)) return current;
      const next = new Set(current);
      next.delete(target.parentId!);
      return next;
    });

    // Preserve the order of rapid drops even when requests take different
    // amounts of time. Recover once the queue drains, without erasing a later
    // optimistic move with an older response.
    const revision = ++moveRevision.current;
    setError(null);
    moveQueue.current = moveQueue.current.then(async () => {
      try {
        const response = await patchTask(task.id, {
          sectionId: target.sectionId, parentId: target.parentId, afterId: before?.id ?? null,
        });
        if (!response.ok) throw new Error("Move failed");
      } catch {
        moveFailed.current = true;
        setError("Couldn't move the task. Restoring the saved order…");
      }
      if (revision === moveRevision.current && moveFailed.current) {
        try {
          const response = await fetch(`/api/tasks?projectId=${projectId}`);
          if (!response.ok) throw new Error("Refresh failed");
          const saved: TaskWithLabels[] = await response.json();
          if (revision === moveRevision.current) {
            setTasks(saved);
            moveFailed.current = false;
            setError("Couldn't move the task. Your saved task order has been restored. Try again.");
          }
        } catch {
          setError("Couldn't save the task order. Check your connection and reload to see the saved order.");
        }
      }
    });
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
      fetch(`/api/sections/${section.id}`, jsonInit("PATCH", { afterId: before?.id ?? null })),
    );
    if (!ok) router.refresh();
  }

  return (
    <div className="flex flex-col gap-7" data-task-dragging={activeTask ? "true" : undefined}>
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
        collisionDetection={(args) => {
          const collisions = taskCollisionDetection(args);
          const target = collisions[0]?.data?.target as TaskDropTarget | undefined;
          dropContext.current = target ? {
            target,
            visibleIds: new Set(args.droppableContainers.filter((item) => item.data.current?.type === "task").map((item) => String(item.id))),
          } : null;
          return collisions;
        }}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        // Only auto-scroll within a narrow band right at the top/bottom edge,
        // and gently. The default 20%-of-viewport band with fast acceleration
        // made a barely-there drag run the drop target far down the list.
        autoScroll={{ threshold: { x: 0, y: 0.05 }, acceleration: 6 }}
        onDragStart={(event: DragStartEvent) => {
          const node = event.activatorEvent.target;
          if (node instanceof Element) {
            indentWidth.current = parseFloat(getComputedStyle(node).getPropertyValue("--task-indent-step")) || 28;
          }
          setActiveId(String(event.active.id));
          pointer.current = null;
          updateProjection(null);
        }}
        onDragMove={(event) => {
          highlightSidebarDrop(pointer.current);
          if (sortBy === "manual") updateProjection(dragProjection(event));
        }}
        onDragOver={(event) => {
          if (sortBy === "manual") updateProjection(dragProjection(event));
        }}
        onDragEnd={(event) => {
          setActiveId(null);
          // Read where the pointer was released, not the last highlight: a drag
          // that crosses the sidebar and comes back may fire no further move.
          const droppedRow = sidebarProjectRowAt(pointer.current);
          const droppedOnProjectId = projectIdOf(droppedRow);
          highlightSidebarDrop(null);
          const task = tasks.find((candidate) => candidate.id === event.active.id);
          if (orderedSections.some((section) => section.id === event.active.id)) {
            void handleSectionDragEnd(event);
          } else if (task && droppedOnProjectId) {
            void dropOnProject(task, droppedOnProjectId, projectNameOf(droppedRow));
          } else if (task && !selecting && heldInPlace(event)) {
            startSelecting(selectionIdsFor(task));
          } else if (task && sortBy === "manual") {
            // A selection lands as a group; anything else reorders on its own.
            const target = projectionRef.current;
            if (actsOnSelection(task)) {
              if (target) void moveSelectionTo(target);
            } else {
              void handleTaskDragEnd(event);
            }
          }
          updateProjection(null);
        }}
        onDragCancel={() => {
          setActiveId(null);
          highlightSidebarDrop(null);
          updateProjection(null);
        }}
        accessibility={{
          screenReaderInstructions: { draggable: "Press Space to pick up a task. Use Up and Down to move, Left and Right to change nesting. Press Space to drop or Escape to cancel." },
          announcements: {
            onDragStart: ({ active }) => `Picked up ${tasks.find((task) => task.id === active.id)?.content ?? "section"}.`,
            onDragMove: describeDrop,
            onDragOver: describeDrop,
            onDragEnd: ({ over }) => over ? "Dropped." : "Move cancelled. Task order unchanged.",
            onDragCancel: () => "Move cancelled. Task order unchanged.",
          },
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
                draggable={sortBy === "manual"}
                activeTaskId={activeTask?.id ?? null}
                draggedIds={draggedIds}
                projection={projection}
                collapsedTaskIds={collapsedTaskIds}
                selectedTaskIds={selectedTaskIds}
                onToggle={(task) => actsOnSelection(task) ? completeSelectedTasks() : toggleComplete(task)}
                onDelete={(task) => actsOnSelection(task) ? deleteSelectedTasks() : deleteTask(task)}
                onLabelsChange={(task, labelIds) =>
                  actsOnSelection(task) ? changeSelectionLabels(task, labelIds) : changeLabels(task, labelIds)
                }
                onAssigneeChange={changeAssignee}
                onDueChange={changeDue}
                onQuickDueChange={(task, dueDate) =>
                  actsOnSelection(task)
                    ? void bulkAction((selected) => patchTask(selected.id, { dueDate }))
                    : quickChangeDue(task, dueDate)
                }
                onPriorityChange={(task, priority) =>
                  actsOnSelection(task)
                    ? void bulkAction((selected) => patchTask(selected.id, { priority }))
                    : changePriority(task, priority)
                }
                onMove={(task, targetProjectId) =>
                  actsOnSelection(task) ? void moveSelectedTasks(targetProjectId) : moveTask(task, targetProjectId)
                }
                onDuplicate={(task) =>
                  actsOnSelection(task)
                    ? void bulkAction((selected) => duplicateRequest(selected))
                    : duplicateTask(task)
                }
                onSubtaskAdded={refresh}
                onOpenDetail={(task) => setDetailTaskId(task.id)}
                onSelectionToggle={(task) => toggleTaskSelection(selectionIdsFor(task))}
                onSelectionStart={(task) => startSelecting(selectionIdsFor(task))}
                onToggleTaskCollapsed={toggleTaskCollapsed}
                onRenameSection={(section, name) =>
                  mutateSection(() => fetch(`/api/sections/${section.id}`, jsonInit("PATCH", { name })))
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
          dropAnimation={taskDropAnimation}
          zIndex={50}
        >
          {activeTask ? (
            <div className="task-drag-stack">
              {Array.from({ length: Math.min(draggedCount, 3) - 1 }, (_, index) => (
                <span
                  key={index}
                  aria-hidden
                  className="task-drag-stack-layer"
                  style={{ "--stack-index": Math.min(draggedCount, 3) - 1 - index } as CSSProperties}
                />
              ))}
              <TaskDragPreview task={activeTask} allTasks={tasks} depth={activeDepth}
                members={members} currentUserId={currentUserId} today={today} dateFormat={dateFormat} />
              {draggedCount > 3 && (
                // Sits on the right: dropping onto the sidebar puts the left
                // edge of the preview off-screen.
                <span className="absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground shadow">
                  {draggedCount}
                </span>
              )}
            </div>
          ) : activeSection ? (
            <div className="cursor-grabbing rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-bold shadow-xl ring-1 ring-black/5">
              {activeSection.name}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}

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
