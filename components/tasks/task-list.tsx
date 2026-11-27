"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Plus } from "lucide-react";
import { useSearchParams } from "next/navigation";
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

import { TaskDragPreview } from "./task-row";
import { taskCollisionDetection, taskDropAnimation, taskKeyboardCoordinates } from "./task-drag";
import { projectTaskDrop, type TaskDropProjection, type TaskDropTarget } from "@/lib/task-drop";
import { TaskModal } from "./task-modal";
import { TaskGroup } from "./task-group";
import { CompletedTasks } from "./completed-tasks";
import { CreateSectionForm } from "./create-section-form";
import { useProjectLists, useRenamed, useWrites } from "@/lib/offline/hooks";
import { useTaskActions } from "@/lib/use-task-actions";
import { useTaskSelection } from "@/lib/use-task-selection";
import { compareTasks, type SortBy } from "@/lib/task-sort";
import {
  flattenTaskGroup,
  selectionRoots,
  subtreeIds,
  taskDepth,
} from "@/lib/task-tree";
import type { ProjectMember, TaskWithLabels } from "./types";

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

function setDetailTaskId(id: string | null) {
  const url = new URL(location.href);
  if (id) url.searchParams.set("task", id);
  else url.searchParams.delete("task");
  history.replaceState(null, "", url);
}

export function TaskList({
  projectId,
  members,
  currentUserId,
  today,
  dateFormat,
  timezone,
  sortBy,
  showCompleted,
}: {
  projectId: string;
  members: ProjectMember[];
  currentUserId: string;
  today: string;
  dateFormat: string;
  timezone: string;
  sortBy: SortBy;
  showCompleted: boolean;
}) {
  // The open task lives in the address, so links, back and a cached page opened at another URL all open or close it.
  const detailTaskId = useSearchParams().get("task");
  const { tasks, completedRoots, labels, sections } = useProjectLists(projectId, detailTaskId ?? undefined);
  const stateTasks = useMemo(() => [...tasks, ...completedRoots], [tasks, completedRoots]);
  const writes = useWrites();
  const actions = useTaskActions(writes.tasks);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [projection, setProjection] = useState<TaskDropProjection | null>(null);
  const projectionRef = useRef<TaskDropProjection | null>(null);
  const dropContext = useRef<{ target: TaskDropTarget; visibleIds: Set<string> } | null>(null);
  const indentWidth = useRef(28);
  const sidebarDropRow = useRef<HTMLElement | null>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [collapsedTaskIds, setCollapsedTaskIds] = useState<Set<string>>(() => new Set());
  const {
    selecting,
    selectedIds: selectedTaskIds,
    start: startSelecting,
    toggle: toggleTaskSelection,
    range: selectTaskRange,
    exit: exitSelection,
  } = useTaskSelection((ids) => {
    const roots = selectionRoots(tasks, ids);
    const single = roots.length === 1 ? tasks.find((task) => task.id === roots[0]) : undefined;
    if (single) deleteTask(single);
    else deleteSelectedTasks();
  });
  // Mouse dragging stays quick, while touch requires an intentional hold.
  // The touch movement tolerance lets a normal swipe remain native scrolling.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: taskKeyboardCoordinates, scrollBehavior: "auto" }),
  );

  function restoreCompleted(task: TaskWithLabels) {
    actions.toggleComplete(task);
  }

  function deleteTask(task: TaskWithLabels) {
    actions.deleteTask(task);
  }

  function changeDue(
    task: TaskWithLabels,
    dueDate: string | null,
    dueTime: string | null,
    deadlineDate: string | null,
    durationMinutes: number | null,
  ) {
    actions.update(task, { dueDate, dueTime, deadlineDate, durationMinutes });
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
  function moveSelectedTasks(targetProjectId: string) {
    actions.moveMany(selectionRoots(tasks, selectedTaskIds), targetProjectId);
    exitSelection();
  }

  function dropOnProject(task: TaskWithLabels, targetProjectId: string, projectName: string) {
    if (!actsOnSelection(task) && targetProjectId === task.projectId) return;
    const movedIds = actsOnSelection(task) ? selectionRoots(tasks, selectedTaskIds) : [task.id];
    // Where each task sat, so undo can put it back in its section rather than
    // only in this project. Its place in the order is not restored: a project
    // move appends, and the server has no memory of the old position.
    const origin = movedIds.map((id) => ({ id, sectionId: tasks.find((item) => item.id === id)?.sectionId ?? null }));
    if (actsOnSelection(task)) moveSelectedTasks(targetProjectId);
    else moveTask(task, targetProjectId);

    actions.offerUndo(
      `${movedIds.length} ${movedIds.length === 1 ? "task" : "tasks"} added to ${projectName}`,
      () => origin.forEach((item) => actions.move(item.id, projectId, item.sectionId)),
    );
  }

  function moveTask(task: TaskWithLabels, targetProjectId: string) {
    if (targetProjectId === task.projectId) return;
    actions.move(task, targetProjectId);
  }

  // The menu reports the clicked row's new label list; the rest of the
  // selection gets the same labels added or removed, keeping their own.
  function changeSelectionLabels(task: TaskWithLabels, labelIds: string[]) {
    const added = labelIds.filter((id) => !task.labels.some((label) => label.id === id));
    const removed = task.labels.filter((label) => !labelIds.includes(label.id)).map((label) => label.id);
    actions.changeLabelsMany(selectedTaskIds, (current) => [...new Set([...current, ...added])].filter((id) => !removed.includes(id)));
    exitSelection();
  }

  async function changeAssignee(task: TaskWithLabels, assigneeId: string | null) {
    setError(null);
    if (!(await actions.assign(task, assigneeId))) setError("That didn't work. Try again.");
  }

  function completeSelectedTasks() {
    if (selectedTaskIds.length === 0) return;
    actions.completeMany(selectedTaskIds);
    exitSelection();
  }

  function deleteSelectedTasks() {
    if (selectedTaskIds.length === 0) return;
    actions.deleteMany(selectionRoots(tasks, selectedTaskIds), selectedTaskIds.length);
    exitSelection();
  }

  const visible = useMemo(() => tasks.filter((task) => !task.isCompleted), [tasks]);
  const roots = (sectionId: string | null) =>
    visible
      .filter((task) => task.sectionId === sectionId && task.parentId === null)
      .sort((a, b) => compareTasks(sortBy, a, b));

  const groups: { id: string | null; name: string | null }[] = [
    { id: null, name: null },
    ...sections.map((section) => ({ id: section.id, name: section.name })),
  ];
  // A task made here keeps the id it was opened by, so follow it to the server's once it has one.
  const openTaskId = useRenamed(detailTaskId ?? "") ?? detailTaskId;
  const flatOrder = groups.flatMap((group) => roots(group.id).map((task) => task.id));
  const detailIndex = openTaskId ? flatOrder.indexOf(openTaskId) : -1;
  const activeTask = tasks.find((task) => task.id === activeId) ?? null;
  const draggingSelection = Boolean(activeTask && selectedTaskIds.includes(activeTask.id));
  const draggedCount = draggingSelection ? selectedTaskIds.length : 1;
  const activeDepth = activeTask ? taskDepth(tasks, activeTask.id) : 0;
  const activeSection = sections.find((section) => section.id === activeId) ?? null;
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
    () => [null, ...sections.map((section) => section.id)]
      .flatMap((sectionId) => flattenTaskGroup(tasks, sectionId)),
    [tasks, sections],
  );

  // Only the top of a selected branch moves: its subtasks come along with it,
  // and moving them too would flatten them into the drop target.
  function orderedSelectionRoots() {
    const rowOrder = new Map(flatTasks.map((task, index) => [task.id, index]));
    return selectionRoots(tasks, selectedTaskIds)
      .sort((a, b) => (rowOrder.get(a) ?? 0) - (rowOrder.get(b) ?? 0));
  }

  // A drop inside the list puts the whole selection at the drop point, in the
  // order the rows appear now. Each task lands after the previous one, so the
  // group keeps its shape instead of arriving reversed.
  function moveSelectionTo(target: TaskDropProjection) {
    let afterId = target.afterId;
    for (const id of orderedSelectionRoots()) {
      actions.place(id, target.sectionId, target.parentId, afterId);
      afterId = id;
    }
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
      const section = sections.find((item) => item.id === over?.id);
      return section ? `Over section ${section.name}.` : undefined;
    }
    const next = projectionRef.current;
    if (!next) return "Outside the task list. Release to cancel.";
    const parent = tasks.find((task) => task.id === next.parentId);
    const before = tasks.find((task) => task.id === next.beforeId);
    return `${before ? `Before ${before.content}` : "At the end of the section"}${parent ? `, under ${parent.content}` : ", at the top level"}.`;
  }

  function handleTaskDragEnd({ active, over, delta }: DragEndEvent) {
    if (!over) return;
    const task = tasks.find((candidate) => candidate.id === active.id);
    const target = dragProjection({ active, over, delta });
    if (!task || !target) return;

    const currentSiblings = visible.filter((item) => item.parentId === task.parentId && item.sectionId === task.sectionId)
      .sort((a, b) => a.order < b.order ? -1 : 1);
    const currentIndex = currentSiblings.findIndex((item) => item.id === task.id);
    if (task.parentId === target.parentId && task.sectionId === target.sectionId &&
      (currentSiblings[currentIndex - 1]?.id ?? null) === target.afterId) return;

    actions.place(task, target.sectionId, target.parentId, target.afterId);
    if (target.parentId) setCollapsedTaskIds((current) => {
      if (!current.has(target.parentId!)) return current;
      const next = new Set(current);
      next.delete(target.parentId!);
      return next;
    });
  }

  function handleSectionDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const section = sections.find((candidate) => candidate.id === active.id);
    const overSection = sections.find((candidate) => candidate.id === over.id);
    if (!section || !overSection) return;

    const others = sections.filter((candidate) => candidate.id !== section.id);
    let index = others.findIndex((candidate) => candidate.id === overSection.id);
    if (section.order < overSection.order) index += 1;
    writes.lists.placeSection(section, index > 0 ? others[index - 1].id : null);
  }

  return (
    <div className="flex flex-col gap-7" data-task-dragging={activeTask ? "true" : undefined}>
      {tasks.length === 0 && sections.length === 0 && (
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
          if (sections.some((section) => section.id === event.active.id)) {
            handleSectionDragEnd(event);
          } else if (task && droppedOnProjectId) {
            dropOnProject(task, droppedOnProjectId, projectNameOf(droppedRow));
          } else if (task && !selecting && heldInPlace(event)) {
            startSelecting(selectionIdsFor(task));
          } else if (task && sortBy === "manual") {
            // A selection lands as a group; anything else reorders on its own.
            const target = projectionRef.current;
            if (actsOnSelection(task)) {
              if (target) moveSelectionTo(target);
            } else {
              handleTaskDragEnd(event);
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
          items={sections.map((section) => section.id)}
          strategy={verticalListSortingStrategy}
        >
          {groups.map((group, index) => (
            <div key={group.id ?? "unsectioned"} className="flex flex-col">
              <TaskGroup
                id={group.id}
                section={group.name ? sections[index - 1] : undefined}
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
                onToggle={(task) => actsOnSelection(task) ? completeSelectedTasks() : actions.toggleComplete(task)}
                onDelete={(task) => actsOnSelection(task) ? deleteSelectedTasks() : deleteTask(task)}
                onLabelsChange={(task, labelIds) =>
                  actsOnSelection(task) ? changeSelectionLabels(task, labelIds) : actions.setLabels(task, labelIds)
                }
                onAssigneeChange={changeAssignee}
                onDueChange={changeDue}
                onQuickDueChange={(task, dueDate) => {
                  if (!actsOnSelection(task)) return actions.update(task, { dueDate });
                  actions.updateMany(selectedTaskIds, { dueDate });
                  exitSelection();
                }}
                onPriorityChange={(task, priority) => {
                  if (!actsOnSelection(task)) return actions.update(task, { priority });
                  actions.updateMany(selectedTaskIds, { priority });
                  exitSelection();
                }}
                onMove={(task, targetProjectId) => actsOnSelection(task) ? moveSelectedTasks(targetProjectId) : moveTask(task, targetProjectId)}
                onDuplicate={(task) => {
                  if (!actsOnSelection(task)) return actions.duplicate(task);
                  actions.duplicateMany(selectedTaskIds);
                  exitSelection();
                }}
                onOpenDetail={(task) => setDetailTaskId(task.id)}
                onSelectionToggle={(task) => toggleTaskSelection(selectionIdsFor(task))}
                onSelectionStart={(task) => startSelecting(selectionIdsFor(task))}
                onSelectionRange={(task) => selectTaskRange(task.id, tasks.map(({ id }) => id))}
                onToggleTaskCollapsed={toggleTaskCollapsed}
                onError={() => setError("That didn't work. Try again.")}
                footer={showCompleted ? (
                  <CompletedTasks
                    sectionId={group.id}
                    stateTasks={stateTasks}
                    today={today}
                    dateFormat={dateFormat}
                    timezone={timezone}
                    onRestore={restoreCompleted}
                    onOpen={(task) => setDetailTaskId(task.id)}
                    indented
                  />
                ) : undefined}
              />
              {!selecting && (
                <CreateSectionForm projectId={projectId} afterId={group.id} />
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
          members={members}
          currentUserId={currentUserId}
          today={today}
          dateFormat={dateFormat}
          onClose={() => setDetailTaskId(null)}
          onDelete={deleteTask}
          onPrev={detailIndex > 0 ? () => setDetailTaskId(flatOrder[detailIndex - 1]) : undefined}
          onNext={detailIndex !== -1 && detailIndex < flatOrder.length - 1 ? () => setDetailTaskId(flatOrder[detailIndex + 1]) : undefined}
        />
      )}
    </div>
  );
}
